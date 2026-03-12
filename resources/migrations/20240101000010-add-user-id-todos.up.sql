-- todos were cleared by migration 009, so the table is empty and we can
-- add a NOT NULL column without a default value.
ALTER TABLE todos
    ADD COLUMN user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE;
