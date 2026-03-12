(ns todo.core
  "Application entry point.
   Responsibilities:
     1. Wait for PostgreSQL to accept connections (with retries).
     2. Run any pending database migrations via Migratus.
     3. Start the Jetty HTTP server."
  (:require [ring.adapter.jetty :as jetty]
            [next.jdbc          :as jdbc]
            [migratus.core      :as migratus]
            [todo.routes        :as routes])
  (:gen-class))

;; ─────────────────────────────────────────────────────────────────────────────
;; Database readiness check
;; ─────────────────────────────────────────────────────────────────────────────

(defn wait-for-db
  "Polls the database with a trivial query until it responds or retries run out.
   This guards against the race condition where the app container starts before
   PostgreSQL has finished initialising — even when the Docker healthcheck has
   passed, a brief extra wait can be needed on slower machines."
  [db-url max-retries]
  (println "Waiting for database to be ready…")
  (loop [attempts max-retries]
    (if (zero? attempts)
      (do (println "ERROR: Could not connect to the database after all retries. Exiting.")
          (System/exit 1))
      ;; recur cannot appear inside a try/catch body (not in tail position).
      ;; Instead, capture success/failure as a boolean outside the try form,
      ;; then branch and recur outside of it.
      (let [ready? (try
                     (jdbc/execute! {:jdbcUrl db-url} ["SELECT 1"])
                     true
                     (catch Exception _ false))]
        (if ready?
          (println "✓ Database is ready.")
          (do
            (println (str "  Database not ready, retrying in 2 s… ("
                          (dec attempts) " attempts remaining)"))
            (Thread/sleep 2000)
            (recur (dec attempts))))))))

;; ─────────────────────────────────────────────────────────────────────────────
;; Database migrations
;; ─────────────────────────────────────────────────────────────────────────────

(defn run-migrations!
  "Runs all pending Migratus migrations.
   Migration SQL files live in resources/migrations/ and are bundled into the
   uberjar, so they are always available on the classpath."
  [db-url]
  (println "Running database migrations…")
  (migratus/migrate {:store         :database
                     ;; Path relative to the classpath root.
                     ;; resources/migrations/ → migrations/ inside the JAR.
                     :migration-dir "migrations"
                     :db            {:jdbcUrl db-url}})
  (println "✓ Migrations complete."))

;; ─────────────────────────────────────────────────────────────────────────────
;; Entry point
;; ─────────────────────────────────────────────────────────────────────────────

(defn -main
  "Reads DATABASE_URL and PORT from environment variables, waits for the
   database, applies migrations, then starts the Jetty server.

   Defaults (useful for running locally without Docker):
     DATABASE_URL → jdbc:postgresql://localhost:5432/todo?user=todo&password=todo
     PORT         → 3000"
  [& _args]
  (let [db-url (or (System/getenv "DATABASE_URL")
                   "jdbc:postgresql://localhost:5432/todo?user=todo&password=todo")
        port   (Integer/parseInt (or (System/getenv "PORT") "3000"))]

    (wait-for-db db-url 15)
    (run-migrations! db-url)

    (println (str "Starting HTTP server on http://0.0.0.0:" port))
    ;; :join? true blocks the main thread so the process stays alive.
    (jetty/run-jetty (routes/create-app db-url)
                     {:port port :join? true})))
