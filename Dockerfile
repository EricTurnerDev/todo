# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 – Builder
#
# Uses the official Clojure image (Temurin JDK 21 + Leiningen on Ubuntu Jammy).
# We copy project.clj first and run `lein deps` before copying source so that
# Docker can cache the dependency layer — rebuilds only re-download deps when
# project.clj changes.
# ─────────────────────────────────────────────────────────────────────────────
FROM clojure:temurin-21-lein-jammy AS builder

WORKDIR /app

# Download dependencies as a separate cached layer
COPY project.clj .
RUN lein deps

# Copy the full source tree and build a standalone ("fat") JAR
COPY . .
RUN lein uberjar

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 – Runtime
#
# A lean JRE-only image.  We only need the compiled JAR — no Leiningen, no JDK.
# All resources (migrations, static files) are bundled inside the JAR by
# `lein uberjar`, so nothing else needs to be copied.
# ─────────────────────────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

COPY --from=builder /app/target/uberjar/todo-0.1.0-SNAPSHOT-standalone.jar /app/app.jar

EXPOSE 3000

CMD ["java", "-jar", "/app/app.jar"]
