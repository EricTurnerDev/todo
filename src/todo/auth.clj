(ns todo.auth
  "Authentication handlers — register, login, logout — and auth middleware."
  (:require [buddy.hashers       :as hashers]
            [clojure.string      :as str]
            [ring.util.response  :as response]
            [todo.db             :as db]
            [todo.views          :as views]))

;; ─────────────────────────────────────────────────────────────────────────────
;; Pages
;; ─────────────────────────────────────────────────────────────────────────────

(defn login-page [req]
  (-> (views/login-page (get-in req [:params :error]))
      (response/response)
      (response/content-type "text/html; charset=utf-8")))

(defn register-page [req]
  (-> (views/register-page (get-in req [:params :error]))
      (response/response)
      (response/content-type "text/html; charset=utf-8")))

;; ─────────────────────────────────────────────────────────────────────────────
;; Actions
;; ─────────────────────────────────────────────────────────────────────────────

(defn register! [ds req]
  (let [params (:params req)
        email  (str/trim (or (:email params) ""))
        pass   (or (:password params) "")
        pass2  (or (:password2 params) "")]
    (cond
      (str/blank? email)
      (response/redirect "/register?error=Email+is+required")

      (not (re-matches #"[^@\s]+@[^@\s]+\.[^@\s]+" email))
      (response/redirect "/register?error=Please+enter+a+valid+email+address")

      (< (count pass) 8)
      (response/redirect "/register?error=Password+must+be+at+least+8+characters")

      (not= pass pass2)
      (response/redirect "/register?error=Passwords+do+not+match")

      (db/get-user-by-email ds email)
      (response/redirect "/register?error=An+account+with+that+email+already+exists")

      :else
      (let [user (db/create-user! ds email (hashers/derive pass))]
        (-> (response/redirect "/")
            (assoc :session {:user-id    (:id user)
                             :user-email (:email user)}))))))

(defn login! [ds req]
  (let [params (:params req)
        email  (str/trim (or (:email params) ""))
        pass   (or (:password params) "")]
    (if-let [user (db/get-user-by-email ds email)]
      (if (hashers/check pass (:password_hash user))
        (-> (response/redirect "/")
            (assoc :session {:user-id    (:id user)
                             :user-email (:email user)}))
        (response/redirect "/login?error=Invalid+email+or+password"))
      (response/redirect "/login?error=Invalid+email+or+password"))))

(defn logout! [_req]
  (-> (response/redirect "/login")
      (assoc :session nil)))

;; ─────────────────────────────────────────────────────────────────────────────
;; Middleware
;; ─────────────────────────────────────────────────────────────────────────────

(def ^:private public-uris
  #{"/login" "/register"})

(def ^:private public-prefixes
  ["/auth/"])

(defn- public-uri? [uri]
  (or (public-uris uri)
      (some #(str/starts-with? uri %) public-prefixes)))

(defn wrap-auth
  "Rejects unauthenticated requests to protected resources.
   - API routes (/api/*) return 401 JSON.
   - All other routes redirect to /login.
   Authenticated requests get :user-id assoc'd onto the request map."
  [handler]
  (fn [req]
    (let [user-id (get-in req [:session :user-id])
          uri     (:uri req)]
      (cond
        (public-uri? uri)
        (handler req)

        user-id
        (handler (assoc req :user-id user-id))

        (str/starts-with? uri "/api/")
        {:status  401
         :headers {"Content-Type" "application/json; charset=utf-8"}
         :body    "{\"error\":\"Not authenticated\"}"}

        :else
        (response/redirect "/login")))))
