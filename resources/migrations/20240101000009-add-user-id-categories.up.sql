-- todos must be deleted first because of the FK from todos.category_id -> categories.id.
DELETE FROM todos;
--;;
DELETE FROM categories;
--;;
-- Drop the old per-name uniqueness constraint and replace it with a
-- per-user-per-name constraint so two different users can share a name.
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_key;
--;;
ALTER TABLE categories
    ADD COLUMN user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE;
--;;
ALTER TABLE categories
    ADD CONSTRAINT categories_name_user_unique UNIQUE (name, user_id);
