# Todo

A full-stack to-do application built with Clojure and PostgreSQL. Runs entirely in Docker — no local JVM or database installation required.

## Features

- **Multi-user** — register with an email and password; each user's data is fully isolated
- **Create, edit, and delete** to-dos with an optional description and due date
- **Categories** — define your own, color-coded automatically
- **Recurring to-dos** — daily, weekly, monthly, yearly, or every N days; checking one off advances its due date in place instead of creating a new row
- **Pause / resume** recurring to-dos (e.g. seasonal tasks like mowing the lawn)
- **Last-done tracking** — recurring items show when they were last completed
- **Sort** by date added or due date
- **Filter** by category
- **Show / hide paused** items
- **Persistent UI state** — sort order, active category filter, and "show paused" are remembered per user across sessions

## Tech stack

| Layer | Library |
|-------|---------|
| HTTP server | [Ring](https://github.com/ring-clojure/ring) + Jetty |
| Routing | [Compojure](https://github.com/weavejester/compojure) |
| HTML templates | [Hiccup](https://github.com/weavejester/hiccup) |
| JSON | [Cheshire](https://github.com/dakrone/cheshire) |
| Authentication | [buddy-hashers](https://funcool.github.io/buddy-hashers/latest/) (bcrypt) + Ring sessions |
| Database | PostgreSQL 16 |
| JDBC | [next.jdbc](https://github.com/seancorfield/next-jdbc) + HikariCP |
| Migrations | [Migratus](https://github.com/yogthos/migratus) |
| Frontend | Vanilla JS (no build step) |
| Build | [Leiningen](https://leiningen.org/) |
| Runtime | Docker + Docker Compose |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose plugin)

That's it.

## Running locally

```bash
docker compose up --build
```

The first run downloads base images and compiles a fat JAR — subsequent starts are fast. Open [http://localhost:3000](http://localhost:3000) and register an account.

**To wipe the database and start fresh** (re-runs all migrations):

```bash
docker compose down -v
docker compose up --build
```

## Connecting to the database directly

The PostgreSQL port is exposed on **5433** to avoid conflicts with a local install:

```bash
psql -h localhost -p 5433 -U todo -d todo
# password: todo
```

Or point DBeaver / TablePlus / DataGrip at `localhost:5433`, database `todo`, user `todo`, password `todo`.

## Project layout

```
.
├── Dockerfile                        # Multi-stage: builder (Lein) → runtime (JRE)
├── docker-compose.yml                # PostgreSQL + app services
├── project.clj                       # Leiningen project & dependencies
├── resources/
│   ├── migrations/                   # Plain SQL migrations (run by Migratus at startup)
│   │   ├── *-create-todos.up.sql
│   │   ├── *-add-due-date.up.sql
│   │   ├── *-due-date-to-date.up.sql
│   │   ├── *-add-recurrence.up.sql
│   │   ├── *-add-categories.up.sql
│   │   ├── *-add-active.up.sql
│   │   ├── *-add-last-done-at.up.sql
│   │   ├── *-create-users.up.sql
│   │   ├── *-add-user-id-categories.up.sql
│   │   └── *-add-user-id-todos.up.sql
│   └── public/
│       ├── app.js                    # Frontend — vanilla JS, no build step
│       └── style.css
└── src/todo/
    ├── core.clj                      # Entry point: wait for DB, run migrations, start Jetty
    ├── auth.clj                      # Register / login / logout handlers + auth middleware
    ├── db.clj                        # All SQL queries (next.jdbc + HikariCP)
    ├── handlers.clj                  # HTTP request handlers
    ├── routes.clj                    # Compojure route table + middleware stack
    └── views.clj                     # Hiccup HTML page templates
```

## Authentication

The app uses **server-side sessions** (Ring's cookie-backed session store) and **bcrypt** password hashing via buddy-hashers.

| Route | Description |
|-------|-------------|
| `GET /register` | Registration form |
| `POST /auth/register` | Create account; redirects to app on success |
| `GET /login` | Login form |
| `POST /auth/login` | Authenticate; redirects to app on success |
| `POST /auth/logout` | Clear session; redirects to login |

All `/api/*` routes return `401` if the request has no valid session. All other protected routes redirect to `/login`.

Passwords must be at least 8 characters. Email addresses are validated to require a non-empty local part, `@`, and a domain with a TLD (e.g. `user@example.com`).

## API

All endpoints require an authenticated session and return/accept `application/json`. Each user's todos and categories are fully isolated — queries are always scoped to the authenticated user.

### Todos

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/todos` | List todos. Query params: `sort` (`created_at`\|`due_at`), `order` (`asc`\|`desc`), `category_id`, `show_inactive` (`true`) |
| `GET` | `/api/todos/:id` | Get one todo |
| `POST` | `/api/todos` | Create a todo |
| `PUT` | `/api/todos/:id` | Replace a todo |
| `PATCH` | `/api/todos/:id/toggle` | Toggle completed; advances due date for recurring todos |
| `PATCH` | `/api/todos/:id/active` | Pause (`{active: false}`) or resume (`{active: true}`) |
| `DELETE` | `/api/todos/:id` | Delete a todo |

**Todo fields**

```jsonc
{
  "title": "Mow the lawn",         // required
  "description": "Back yard too",  // optional
  "due_at": "2025-06-01",          // optional  YYYY-MM-DD
  "recurrence_type": "weekly",     // optional  daily|weekly|monthly|yearly|custom
  "recurrence_days": 14,           // required when recurrence_type = "custom"
  "category_id": 3                 // optional  integer FK
}
```

### Categories

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/categories` | List the current user's categories |
| `POST` | `/api/categories` | Create a category (`{name}`) |
| `DELETE` | `/api/categories/:id` | Delete a category (todos become uncategorized) |

## Database schema

```sql
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE categories (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, user_id)
);

CREATE TABLE todos (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            VARCHAR(255) NOT NULL,
  description      TEXT,
  completed        BOOLEAN NOT NULL DEFAULT FALSE,
  due_at           DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recurrence_type  VARCHAR(20),   -- daily | weekly | monthly | yearly | custom
  recurrence_days  INTEGER,       -- used when recurrence_type = 'custom'
  category_id      INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  last_done_at     DATE
);
```

## Configuration

The app reads two environment variables (set in `docker-compose.yml`):

| Variable | Default in Compose | Description |
|----------|--------------------|-------------|
| `DATABASE_URL` | `jdbc:postgresql://db:5432/todo?user=todo&password=todo` | JDBC URL |
| `PORT` | `3000` | HTTP port |

## How recurring todos work

When a recurring todo is toggled complete, the server **advances it in place** rather than creating a new row:

1. `due_at` is bumped by the recurrence interval (e.g. +7 days for weekly)
2. `completed` is reset to `false`
3. `last_done_at` is set to today

This keeps the list clean — one row per task, always showing the next upcoming due date.

Recurring todos can be **paused** (e.g. seasonal items) and will no longer appear in the default view. Toggle "Show paused" to see them.
