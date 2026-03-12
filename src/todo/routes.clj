(ns todo.routes
  "Assembles all routes and the Ring middleware stack into the final app handler.

   Middleware is applied inside-out with `->`:
     (-> handler A B C)  ≡  C wraps B wraps A wraps handler

   For an incoming request the order is:  C → B → A → handler
   For an outgoing response the order is: handler → A → B → C

   Stack (outermost → innermost):
     wrap-defaults      — params, session, security headers, static files
     wrap-auth          — redirects / 401s unauthenticated requests
     wrap-json-body     — parses application/json request bodies
     routes             — Compojure route matching → handler functions"
  (:require [compojure.core         :refer [routes GET POST PUT DELETE PATCH]]
            [compojure.route        :as route]
            [ring.middleware.json   :as json-mw]
            [ring.middleware.defaults :as defaults]
            [todo.auth              :as auth]
            [todo.db                :as db]
            [todo.handlers          :as h]))

(defn create-app
  "Builds and returns the Ring application.
   Creates a HikariCP connection pool once; all handlers share it."
  [db-url]
  (let [ds (db/create-pool db-url)]
    (->
     ;; ── Route definitions ───────────────────────────────────────────────────
     (routes
      ;; Auth pages and actions (public — no session required)
      (GET  "/login"           req (auth/login-page    req))
      (GET  "/register"        req (auth/register-page req))
      (POST "/auth/login"      req (auth/login!     ds req))
      (POST "/auth/register"   req (auth/register!  ds req))
      (POST "/auth/logout"     req (auth/logout!       req))

      ;; HTML page (protected — wrap-auth redirects to /login if no session)
      (GET  "/"                        req (h/index-page          req))

      ;; JSON API (protected — wrap-auth returns 401 if no session)
      (GET  "/api/todos"               req (h/list-todos    ds    req))
      (GET  "/api/todos/:id"           req (h/get-todo      ds    req))
      (POST "/api/todos"               req (h/create-todo   ds    req))
      (PUT  "/api/todos/:id"           req (h/update-todo   ds    req))
      (PATCH "/api/todos/:id/toggle"   req (h/toggle-todo      ds req))
      (PATCH "/api/todos/:id/active"   req (h/set-todo-active  ds req))
      (DELETE "/api/todos/:id"         req (h/delete-todo   ds    req))

      ;; Category API (protected)
      (GET    "/api/categories"            req (h/list-categories       ds req))
      (POST   "/api/categories"            req (h/create-category       ds req))
      (PATCH  "/api/categories/:id/color"  req (h/update-category-color ds req))
      (DELETE "/api/categories/:id"        req (h/delete-category       ds req))

      ;; Insights API (protected)
      (GET    "/api/insights"              req (h/insights              ds req))

      ;; Catch-all
      (route/not-found "Not Found"))

     ;; ── Middleware ──────────────────────────────────────────────────────────

     ;; Parse application/json bodies into Clojure maps with keyword keys.
     (json-mw/wrap-json-body {:keywords? true :fallthrough? true})

     ;; Check session for authenticated user.  Must run after wrap-defaults
     ;; (which parses the session cookie) and before the routes.
     auth/wrap-auth

     ;; ring-defaults/site-defaults includes:
     ;;   • wrap-params         – parses query-string and form params
     ;;   • wrap-keyword-params – keywordises param names
     ;;   • wrap-resource       – serves static files from resources/public/
     ;;   • wrap-content-type   – sets Content-Type for static files
     ;;   • wrap-session        – cookie-backed session store
     ;;   • security headers    – X-Frame-Options, X-XSS-Protection, etc.
     ;;
     ;; Anti-forgery (CSRF) is disabled because the frontend uses JSON API
     ;; calls and the auth forms are on the same origin with no sensitive
     ;; state-changing side-effects beyond login/register/logout.
     (defaults/wrap-defaults
      (assoc-in defaults/site-defaults [:security :anti-forgery] false)))))
