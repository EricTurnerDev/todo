(ns todo.handlers
  "HTTP request handlers — one public function per route."
  (:require [clojure.string     :as str]
            [cheshire.core      :as json]
            [ring.util.response :as response]
            [todo.db            :as db]
            [todo.views         :as views]))

;; ─────────────────────────────────────────────────────────────────────────────
;; Helpers
;; ─────────────────────────────────────────────────────────────────────────────

(defn- json-resp [status body]
  {:status  status
   :headers {"Content-Type" "application/json; charset=utf-8"}
   :body    (json/generate-string body {:date-format "yyyy-MM-dd'T'HH:mm:ss'Z'"})})

(defn- clean-str [s]
  (some-> s str/trim not-empty))

(defn- parse-due-at [s]
  (when-let [s* (clean-str s)]
    (java.sql.Date/valueOf s*)))

(defn- parse-recurrence [{:keys [recurrence_type recurrence_days]}]
  (let [rtype (clean-str recurrence_type)
        rdays (when (= rtype "custom") (some-> recurrence_days int))]
    [rtype rdays]))

(defn- parse-category-id [v]
  ;; Accept an integer from JSON body or a string from a query param.
  (when v
    (cond (integer? v) (int v)
          (string?  v) (when (seq (str/trim v)) (Integer/parseInt (str/trim v))))))

(defn- uid [req] (:user-id req))

;; ─────────────────────────────────────────────────────────────────────────────
;; Page
;; ─────────────────────────────────────────────────────────────────────────────

(defn index-page [req]
  (-> (views/index-page (uid req) (get-in req [:session :user-email]))
      (response/response)
      (response/content-type "text/html; charset=utf-8")))

;; ─────────────────────────────────────────────────────────────────────────────
;; Todo API
;; ─────────────────────────────────────────────────────────────────────────────

(defn list-todos
  "GET /api/todos?sort=created_at|due_at&order=asc|desc&category_id=N&show_inactive=true"
  [ds req]
  (let [p             (:params req)
        sort-col      (get p :sort  "due_at")
        sort-dir      (get p :order "asc")
        category-id   (parse-category-id (get p :category_id))
        show-inactive (= "true" (get p :show_inactive))]
    (json-resp 200 (db/get-all-todos ds (uid req) sort-col sort-dir category-id show-inactive))))

(defn get-todo [ds req]
  (let [id (Integer/parseInt (get-in req [:params :id]))]
    (if-let [todo (db/get-todo-by-id ds (uid req) id)]
      (json-resp 200 todo)
      (json-resp 404 {:error "Todo not found"}))))

(defn create-todo
  "POST /api/todos
   Body: {title, description?, due_at?, recurrence_type?, recurrence_days?, category_id?}"
  [ds req]
  (let [body          (:body req)
        title*        (clean-str (:title body))
        [rtype rdays] (parse-recurrence body)
        cat-id        (parse-category-id (:category_id body))]
    (if-not title*
      (json-resp 400 {:error "Title is required"})
      (json-resp 201 (db/create-todo! ds (uid req) title*
                                      (clean-str (:description body))
                                      (parse-due-at (:due_at body))
                                      rtype rdays cat-id)))))

(defn update-todo
  "PUT /api/todos/:id
   Body: {title, description?, completed, due_at?, recurrence_type?, recurrence_days?, category_id?}"
  [ds req]
  (let [id            (Integer/parseInt (get-in req [:params :id]))
        body          (:body req)
        title*        (clean-str (:title body))
        [rtype rdays] (parse-recurrence body)
        cat-id        (parse-category-id (:category_id body))]
    (cond
      (not title*)                            (json-resp 400 {:error "Title is required"})
      (not (db/get-todo-by-id ds (uid req) id)) (json-resp 404 {:error "Todo not found"})
      :else
      (json-resp 200 (db/update-todo! ds (uid req) id title*
                                      (clean-str (:description body))
                                      (boolean (:completed body))
                                      (parse-due-at (:due_at body))
                                      rtype rdays cat-id)))))

(defn toggle-todo
  "PATCH /api/todos/:id/toggle — for recurring todos, advances due date instead."
  [ds req]
  (let [id   (Integer/parseInt (get-in req [:params :id]))
        todo (db/get-todo-by-id ds (uid req) id)]
    (cond
      (nil? todo)
      (json-resp 404 {:error "Todo not found"})

      (and (not (:completed todo)) (:recurrence_type todo))
      (json-resp 200 (db/advance-recurring-todo! ds (uid req) id))

      :else
      (json-resp 200 (db/toggle-todo! ds (uid req) id)))))

(defn set-todo-active
  "PATCH /api/todos/:id/active
   Body: {active: true|false} — pass false to pause, true to resume.
   Only meaningful for recurring todos, but works on any todo."
  [ds req]
  (let [id     (Integer/parseInt (get-in req [:params :id]))
        active (boolean (:active (:body req)))]
    (if-let [todo (db/set-active! ds (uid req) id active)]
      (json-resp 200 todo)
      (json-resp 404 {:error "Todo not found"}))))

(defn delete-todo [ds req]
  (let [id (Integer/parseInt (get-in req [:params :id]))]
    (if (db/delete-todo! ds (uid req) id)
      (json-resp 200 {:message "Deleted successfully"})
      (json-resp 404 {:error "Todo not found"}))))

;; ─────────────────────────────────────────────────────────────────────────────
;; Category API
;; ─────────────────────────────────────────────────────────────────────────────

(defn list-categories [ds req]
  (json-resp 200 (db/get-all-categories ds (uid req))))

(defn- parse-color [v]
  (let [n (cond (integer? v) (int v)
                (string?  v) (some-> v str/trim not-empty Integer/parseInt)
                :else        0)]
    (max 0 (min 7 (or n 0)))))

(defn create-category
  "POST /api/categories  Body: {name, color?}  color is a palette index 0–7."
  [ds req]
  (let [body  (:body req)
        name* (clean-str (:name body))
        color (parse-color (:color body))]
    (if-not name*
      (json-resp 400 {:error "Name is required"})
      (try
        (json-resp 201 (db/create-category! ds (uid req) name* color))
        (catch Exception _
          ;; PostgreSQL unique constraint violation on (categories.name, categories.user_id)
          (json-resp 409 {:error (str "Category \"" name* "\" already exists")}))))))

(defn update-category-color
  "PATCH /api/categories/:id/color  Body: {color}  color is a palette index 0–7."
  [ds req]
  (let [id    (Integer/parseInt (get-in req [:params :id]))
        color (parse-color (:color (:body req)))]
    (if-let [cat (db/update-category-color! ds (uid req) id color)]
      (json-resp 200 cat)
      (json-resp 404 {:error "Category not found"}))))

(defn delete-category [ds req]
  (let [id (Integer/parseInt (get-in req [:params :id]))]
    (if (db/delete-category! ds (uid req) id)
      (json-resp 200 {:message "Deleted"})
      (json-resp 404 {:error "Category not found"}))))
