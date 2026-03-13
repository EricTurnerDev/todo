(ns todo.db
  "Database connection pool and all SQL query functions."
  (:require [clojure.string       :as str]
            [next.jdbc            :as jdbc]
            [next.jdbc.connection :as connection]
            [next.jdbc.result-set :as rs])
  (:import [com.zaxxer.hikari HikariDataSource]))

;; ─────────────────────────────────────────────────────────────────────────────
;; Connection pool
;; ─────────────────────────────────────────────────────────────────────────────

(defn create-pool [db-url]
  (connection/->pool HikariDataSource
                     {:jdbcUrl         db-url
                      :maximumPoolSize 10
                      :minimumIdle     2}))

;; ─────────────────────────────────────────────────────────────────────────────
;; Shared SQL fragments
;; ─────────────────────────────────────────────────────────────────────────────

(def ^:private opts {:builder-fn rs/as-unqualified-lower-maps})

;; Read queries LEFT JOIN categories so every todo row includes category_name.
;; This avoids N+1 queries when listing todos.
(def ^:private todo-select
  "SELECT t.id, t.title, t.description, t.completed,
          t.due_at, t.created_at,
          t.recurrence_type, t.recurrence_days,
          t.category_id, c.name AS category_name,
          t.active, t.last_done_at
   FROM   todos t
   LEFT   JOIN categories c ON c.id = t.category_id")

;; RETURNING clauses in INSERT/UPDATE can't use JOINs; we list columns
;; directly. category_name is omitted — the client reloads after mutations.
;; completed_at is included so toggle/update responses carry the new value.
(def ^:private todo-returning
  "id, title, description, completed, due_at, created_at,
   recurrence_type, recurrence_days, category_id, active, last_done_at,
   completed_at")

;; ─────────────────────────────────────────────────────────────────────────────
;; User queries
;; ─────────────────────────────────────────────────────────────────────────────

(defn get-user-by-email [ds email]
  (jdbc/execute-one!
   ds ["SELECT id, email, password_hash FROM users WHERE email = ?" email]
   opts))

(defn create-user! [ds email password-hash]
  (jdbc/execute-one!
   ds ["INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id, email"
       email password-hash]
   opts))

;; ─────────────────────────────────────────────────────────────────────────────
;; Todo queries
;; ─────────────────────────────────────────────────────────────────────────────

(defn get-all-todos
  "Returns todos for user-id with optional sorting, category filter, and active/completed filters.

   sort-col       — \"created_at\" (default) or \"due_at\"
   sort-dir       — \"desc\" (default) or \"asc\"
   category-id    — integer or nil; nil returns all categories
   show-inactive  — when false (default) exclude todos where active = false
   show-completed — when false (default) exclude todos where completed = true

   Rows with no due_at sort to the bottom when ordering by due date."
  ([ds user-id] (get-all-todos ds user-id "due_at" "asc" nil false false))
  ([ds user-id sort-col sort-dir category-id show-inactive show-completed]
   (let [col    (get {"created_at" "t.created_at"
                      "due_at"     "t.due_at"} sort-col "t.created_at")
         dir    (get {"asc" "ASC" "desc" "DESC"} sort-dir "DESC")
         nulls  (when (= col "t.due_at") " NULLS LAST")
         ;; Always filter by user; accumulate optional conditions.
         conds  (cond-> ["t.user_id = ?"]
                  (not show-inactive)  (conj "t.active = true")
                  (not show-completed) (conj "t.completed = false")
                  category-id          (conj "t.category_id = ?"))
         where  (str " WHERE " (str/join " AND " conds))
         sql    (str todo-select where " ORDER BY " col " " dir nulls)
         params (cond-> [sql user-id] category-id (conj category-id))]
     (jdbc/execute! ds params opts))))

(defn get-todo-by-id [ds user-id id]
  (jdbc/execute-one!
   ds
   [(str todo-select " WHERE t.id = ? AND t.user_id = ?") id user-id]
   opts))

(defn create-todo! [ds user-id title description due-at
                    recurrence-type recurrence-days category-id]
  (jdbc/execute-one!
   ds
   [(str "INSERT INTO todos
            (user_id, title, description, due_at, recurrence_type, recurrence_days, category_id)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          RETURNING " todo-returning)
    user-id title description due-at recurrence-type recurrence-days category-id]
   opts))

(defn update-todo! [ds user-id id title description completed due-at
                    recurrence-type recurrence-days category-id]
  ;; When completed becomes true, preserve any existing completed_at or stamp NOW().
  ;; When completed becomes false, clear completed_at.
  (jdbc/execute-one!
   ds
   [(str "UPDATE todos
          SET title = ?, description = ?, completed = ?,
              completed_at = CASE
                               WHEN ? THEN COALESCE(completed_at, NOW())
                               ELSE NULL
                             END,
              due_at = ?,
              recurrence_type = ?, recurrence_days = ?, category_id = ?
          WHERE id = ? AND user_id = ?
          RETURNING " todo-returning)
    title description completed completed due-at
    recurrence-type recurrence-days category-id id user-id]
   opts))

(defn toggle-todo! [ds user-id id]
  ;; In a SET clause, column references on the right-hand side use the OLD row
  ;; values, so `CASE WHEN NOT completed` correctly checks the pre-update state.
  ;; When flipping false→true we stamp completed_at; true→false we clear it.
  (jdbc/execute-one!
   ds
   [(str "UPDATE todos
          SET completed    = NOT completed,
              completed_at = CASE WHEN NOT completed THEN NOW() ELSE NULL END
          WHERE id = ? AND user_id = ?
          RETURNING " todo-returning)
    id user-id]
   opts))

(defn delete-todo! [ds user-id id]
  (jdbc/execute-one!
   ds ["DELETE FROM todos WHERE id = ? AND user_id = ? RETURNING id" id user-id]
   opts))

;; ─────────────────────────────────────────────────────────────────────────────
;; Recurrence
;; ─────────────────────────────────────────────────────────────────────────────

(defn- calc-next-due [^java.sql.Date due-date recurrence-type recurrence-days]
  (let [base (if due-date
               (.toLocalDate due-date)
               (java.time.LocalDate/now))]
    (case recurrence-type
      "daily"   (.plusDays   base 1)
      "weekly"  (.plusDays   base 7)
      "monthly" (.plusMonths base 1)
      "yearly"  (.plusYears  base 1)
      "custom"  (.plusDays   base (int (or recurrence-days 7)))
      base)))

(defn advance-recurring-todo! [ds user-id id]
  ;; Stamp completed_at so insights can count recurring completions.
  ;; completed_at records the most recent time this recurring task was done.
  (when-let [todo (get-todo-by-id ds user-id id)]
    (let [next-due (calc-next-due (:due_at todo)
                                  (:recurrence_type todo)
                                  (:recurrence_days todo))]
      (jdbc/execute-one!
       ds
       [(str "UPDATE todos
              SET completed = false, due_at = ?,
                  last_done_at = CURRENT_DATE, completed_at = NOW()
              WHERE id = ? AND user_id = ?
              RETURNING " todo-returning)
        (java.sql.Date/valueOf next-due) id user-id]
       opts))))

(defn set-active!
  "Sets the active flag on a todo.  Pass false to pause, true to resume.
   Returns the updated row, or nil if the id does not exist."
  [ds user-id id active]
  (jdbc/execute-one!
   ds
   [(str "UPDATE todos SET active = ? WHERE id = ? AND user_id = ? RETURNING " todo-returning)
    active id user-id]
   opts))

;; ─────────────────────────────────────────────────────────────────────────────
;; Category queries
;; ─────────────────────────────────────────────────────────────────────────────

(defn get-all-categories [ds user-id]
  (jdbc/execute!
   ds ["SELECT id, name, color, created_at FROM categories WHERE user_id = ? ORDER BY name" user-id]
   opts))

(defn create-category! [ds user-id name color]
  (jdbc/execute-one!
   ds ["INSERT INTO categories (user_id, name, color) VALUES (?, ?, ?) RETURNING id, name, color, created_at"
       user-id name color]
   opts))

(defn update-category-color! [ds user-id id color]
  (jdbc/execute-one!
   ds ["UPDATE categories SET color = ? WHERE id = ? AND user_id = ? RETURNING id, name, color, created_at"
       color id user-id]
   opts))

(defn delete-category! [ds user-id id]
  ;; The FK on todos.category_id is ON DELETE SET NULL, so PostgreSQL
  ;; automatically un-assigns this category from any todos before deleting.
  (jdbc/execute-one!
   ds ["DELETE FROM categories WHERE id = ? AND user_id = ? RETURNING id" id user-id]
   opts))

;; ─────────────────────────────────────────────────────────────────────────────
;; Insights queries
;; ─────────────────────────────────────────────────────────────────────────────
;;
;; All date columns are cast to TEXT (YYYY-MM-DD) so they serialise cleanly
;; to JSON without timestamp noise.
;;
;; "Completion" means completed_at IS NOT NULL — this covers:
;;   • Regular todos toggled to completed=true
;;   • Recurring todos each time they are advanced (advance-recurring-todo!)
;; Existing completed todos that pre-date migration 12 have completed_at = NULL
;; and will not appear in time-series charts, but do count in summary totals.

(defn get-insights [ds user-id]
  ;; ── Summary statistics ────────────────────────────────────────────────────
  (let [summary
        (jdbc/execute-one!
         ds
         ["SELECT
             COUNT(*) FILTER (WHERE NOT completed AND active)
               AS open_count,
             COUNT(*) FILTER (WHERE completed)
               AS completed_count,
             COUNT(*) FILTER (WHERE NOT completed AND active
                                AND due_at IS NOT NULL AND due_at < CURRENT_DATE)
               AS overdue_count,
             COUNT(*) FILTER (WHERE NOT completed AND active
                                AND due_at = CURRENT_DATE)
               AS due_today_count,
             COUNT(*) FILTER (WHERE NOT completed AND active
                                AND due_at > CURRENT_DATE
                                AND due_at <= CURRENT_DATE + INTERVAL '6 days')
               AS due_this_week_count,
             COUNT(*) FILTER (WHERE completed_at IS NOT NULL
                                AND due_at IS NOT NULL
                                AND completed_at::date <= due_at)
               AS on_time_count,
             COUNT(*) FILTER (WHERE completed_at IS NOT NULL AND due_at IS NOT NULL)
               AS tracked_with_due_count,
             ROUND(
               CAST(AVG(EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400.0)
                    FILTER (WHERE completed_at IS NOT NULL)
               AS numeric), 1)
               AS avg_completion_days,
             ROUND(
               CAST(EXTRACT(EPOCH FROM (NOW() - MIN(created_at)
                    FILTER (WHERE NOT completed AND active))) / 86400.0
               AS numeric), 0)
               AS oldest_open_days
           FROM todos
           WHERE user_id = ?"
          user-id]
         opts)

        ;; ── Current streak (consecutive days with ≥1 completion) ──────────
        streak
        (:current_streak
         (jdbc/execute-one!
          ds
          ["WITH daily AS (
              SELECT DISTINCT completed_at::date AS day
              FROM   todos
              WHERE  user_id = ? AND completed_at IS NOT NULL
            ),
            gaps AS (
              SELECT day,
                     day - LAG(day) OVER (ORDER BY day) AS gap
              FROM   daily
            ),
            breaks AS (
              SELECT day,
                     SUM(CASE WHEN gap IS NULL OR gap = 1 THEN 0 ELSE 1 END)
                       OVER (ORDER BY day) AS grp
              FROM   gaps
            ),
            streaks AS (
              SELECT grp,
                     MAX(day) AS last_day,
                     COUNT(*)::int AS len
              FROM   breaks
              GROUP  BY grp
            )
            SELECT COALESCE(
              (SELECT len FROM streaks
               WHERE  last_day >= CURRENT_DATE - 1
               ORDER  BY last_day DESC
               LIMIT  1),
              0) AS current_streak"
           user-id]
          opts))

        ;; ── Completed per day — last 30 days ─────────────────────────────
        completed-per-day
        (jdbc/execute!
         ds
         ["SELECT completed_at::date::text AS day,
                  COUNT(*)::int            AS count
           FROM   todos
           WHERE  user_id = ? AND completed_at IS NOT NULL
             AND  completed_at >= CURRENT_DATE - 29
           GROUP  BY day
           ORDER  BY day"
          user-id]
         opts)

        ;; ── Created per day — last 30 days ───────────────────────────────
        created-per-day
        (jdbc/execute!
         ds
         ["SELECT created_at::date::text AS day,
                  COUNT(*)::int          AS count
           FROM   todos
           WHERE  user_id = ?
             AND  created_at >= CURRENT_DATE - 29
           GROUP  BY day
           ORDER  BY day"
          user-id]
         opts)

        ;; ── Completed per week — last 12 weeks ───────────────────────────
        completed-per-week
        (jdbc/execute!
         ds
         ["SELECT DATE_TRUNC('week', completed_at)::date::text AS week_start,
                  COUNT(*)::int                                AS count
           FROM   todos
           WHERE  user_id = ? AND completed_at IS NOT NULL
             AND  completed_at >= CURRENT_DATE - 83
           GROUP  BY week_start
           ORDER  BY week_start"
          user-id]
         opts)

        ;; ── Backlog size per day — last 30 days ──────────────────────────
        ;; Backlog on day D = tasks created on or before D that were not yet
        ;; completed on D (either still open, or completed after D).
        backlog-per-day
        (jdbc/execute!
         ds
         ["SELECT d::date::text AS day,
                  (SELECT COUNT(*)::int
                   FROM   todos
                   WHERE  user_id = ?
                     AND  created_at::date <= d
                     AND  (NOT completed
                           OR completed_at IS NULL
                           OR completed_at::date > d)) AS backlog_size
           FROM   generate_series(
                    (CURRENT_DATE - INTERVAL '29 days')::date,
                    CURRENT_DATE::date,
                    '1 day'::interval
                  ) AS d
           ORDER  BY d"
          user-id]
         opts)

        ;; ── Completion-time histogram ─────────────────────────────────────
        ;; Elapsed days from created_at to completed_at, bucketed.
        completion-histogram
        (jdbc/execute!
         ds
         ["SELECT
             CASE
               WHEN EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400 < 1  THEN 'same_day'
               WHEN EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400 <= 3 THEN '1_3_days'
               WHEN EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400 <= 7 THEN '4_7_days'
               WHEN EXTRACT(EPOCH FROM (completed_at - created_at)) / 86400 <= 30 THEN '8_30_days'
               ELSE '30plus_days'
             END AS bucket,
             COUNT(*)::int AS count
           FROM   todos
           WHERE  user_id = ? AND completed_at IS NOT NULL
           GROUP  BY bucket"
          user-id]
         opts)

        ;; ── Completions by day of week (0 = Sun … 6 = Sat) ───────────────
        completed-by-dow
        (jdbc/execute!
         ds
         ["SELECT EXTRACT(DOW FROM completed_at)::int AS dow,
                  COUNT(*)::int                       AS count
           FROM   todos
           WHERE  user_id = ? AND completed_at IS NOT NULL
           GROUP  BY dow
           ORDER  BY dow"
          user-id]
         opts)

        ;; ── Category stats ────────────────────────────────────────────────
        by-category
        (jdbc/execute!
         ds
         ["SELECT c.name,
                  c.color,
                  COUNT(*)                                          AS total,
                  COUNT(*) FILTER (WHERE t.completed)              AS completed_count,
                  COUNT(*) FILTER (WHERE NOT t.completed
                                     AND t.active
                                     AND t.due_at IS NOT NULL
                                     AND t.due_at < CURRENT_DATE)  AS overdue_count,
                  COUNT(*) FILTER (WHERE t.completed_at IS NOT NULL
                                     AND t.due_at IS NOT NULL)     AS tracked_with_due,
                  COUNT(*) FILTER (WHERE t.completed_at IS NOT NULL
                                     AND t.due_at IS NOT NULL
                                     AND t.completed_at::date <= t.due_at) AS on_time_count
           FROM   todos t
           JOIN   categories c ON c.id = t.category_id
           WHERE  t.user_id = ?
           GROUP  BY c.id, c.name, c.color
           ORDER  BY total DESC"
          user-id]
         opts)]

    {:summary             (assoc summary :current_streak streak)
     :completed_per_day   completed-per-day
     :created_per_day     created-per-day
     :completed_per_week  completed-per-week
     :backlog_per_day     backlog-per-day
     :completion_histogram completion-histogram
     :completed_by_dow    completed-by-dow
     :by_category         by-category}))
