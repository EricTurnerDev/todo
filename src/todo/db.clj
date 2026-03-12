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
(def ^:private todo-returning
  "id, title, description, completed, due_at, created_at,
   recurrence_type, recurrence_days, category_id, active, last_done_at")

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
  "Returns todos for user-id with optional sorting, category filter, and active filter.

   sort-col      — \"created_at\" (default) or \"due_at\"
   sort-dir      — \"desc\" (default) or \"asc\"
   category-id   — integer or nil; nil returns all categories
   show-inactive — when false (default) exclude todos where active = false

   Rows with no due_at sort to the bottom when ordering by due date."
  ([ds user-id] (get-all-todos ds user-id "due_at" "asc" nil false))
  ([ds user-id sort-col sort-dir category-id show-inactive]
   (let [col    (get {"created_at" "t.created_at"
                      "due_at"     "t.due_at"} sort-col "t.created_at")
         dir    (get {"asc" "ASC" "desc" "DESC"} sort-dir "DESC")
         nulls  (when (= col "t.due_at") " NULLS LAST")
         ;; Always filter by user; accumulate optional conditions.
         conds  (cond-> ["t.user_id = ?"]
                  (not show-inactive) (conj "t.active = true")
                  category-id         (conj "t.category_id = ?"))
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
  (jdbc/execute-one!
   ds
   [(str "UPDATE todos
          SET title = ?, description = ?, completed = ?, due_at = ?,
              recurrence_type = ?, recurrence_days = ?, category_id = ?
          WHERE id = ? AND user_id = ?
          RETURNING " todo-returning)
    title description completed due-at
    recurrence-type recurrence-days category-id id user-id]
   opts))

(defn toggle-todo! [ds user-id id]
  (jdbc/execute-one!
   ds
   [(str "UPDATE todos SET completed = NOT completed
          WHERE id = ? AND user_id = ? RETURNING " todo-returning)
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
  (when-let [todo (get-todo-by-id ds user-id id)]
    (let [next-due (calc-next-due (:due_at todo)
                                  (:recurrence_type todo)
                                  (:recurrence_days todo))]
      (jdbc/execute-one!
       ds
       [(str "UPDATE todos SET completed = false, due_at = ?, last_done_at = CURRENT_DATE
              WHERE id = ? AND user_id = ? RETURNING " todo-returning)
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
