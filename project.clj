(defproject todo "0.1.0-SNAPSHOT"
  :description "A full-stack to-do application built with Clojure and PostgreSQL"
  :min-lein-version "2.0.0"

  :dependencies
  [;; Core Clojure
   [org.clojure/clojure "1.11.1"]

   ;; ── Web server ────────────────────────────────────────────────────────────
   ;; Ring is the standard HTTP abstraction for Clojure (like Rack for Ruby).
   ;; ring-jetty-adapter embeds Jetty so we don't need an external app server.
   [ring/ring-core "1.11.0"]
   [ring/ring-jetty-adapter "1.11.0"]
   ;; ring-defaults bundles sensible middleware (params, sessions, static
   ;; files, security headers) into a single composable config map.
   [ring/ring-defaults "0.3.4"]

   ;; ── Routing ───────────────────────────────────────────────────────────────
   ;; Compojure provides a small DSL (GET, POST, …) for matching routes.
   [compojure "1.7.1"]

   ;; ── JSON ──────────────────────────────────────────────────────────────────
   ;; ring/ring-json supplies wrap-json-body middleware (request parsing).
   ;; Cheshire is used directly in handlers to serialize responses.
   [ring/ring-json "0.5.1"]
   [cheshire "5.12.0"]

   ;; ── HTML templating ───────────────────────────────────────────────────────
   ;; Hiccup renders Clojure data structures as HTML strings.
   ;; No build step, no template files — just Clojure.
   [hiccup "1.0.5"]

   ;; ── Database ──────────────────────────────────────────────────────────────
   ;; next.jdbc is the modern, idiomatic JDBC wrapper for Clojure.
   ;; HikariCP is a fast, lightweight connection pool.
   ;; The PostgreSQL driver is the standard JDBC driver.
   [com.github.seancorfield/next.jdbc "1.3.909"]
   [com.zaxxer/HikariCP "5.1.0"]
   [org.postgresql/postgresql "42.7.2"]

   ;; ── Migrations ────────────────────────────────────────────────────────────
   ;; Migratus runs plain SQL migration files from the classpath.
   [migratus "1.5.7"]]

  ;; ^:skip-aot means we don't AOT compile during `lein run` (faster dev loop).
  ;; The :uberjar profile overrides this with :aot :all for the production JAR.
  :main ^:skip-aot todo.core
  :target-path "target/%s"

  :profiles
  {:uberjar {:aot :all
             :jvm-opts ["-Dclojure.compiler.direct-linking=true"]}})
