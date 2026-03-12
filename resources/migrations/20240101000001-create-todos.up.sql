-- Migration: create the todos table
-- Run with: lein run (automatically) or migratus/migrate in the REPL

CREATE TABLE IF NOT EXISTS todos (
    -- Auto-incrementing surrogate key
    id          SERIAL                   PRIMARY KEY,

    -- The to-do text; never null or empty (enforced by the application layer)
    title       VARCHAR(255)             NOT NULL,

    -- Optional longer description
    description TEXT,

    -- False until the user marks the item done
    completed   BOOLEAN                  NOT NULL DEFAULT FALSE,

    -- Stored with timezone so the app works correctly in any locale
    created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
