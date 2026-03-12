ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_user_unique;
--;;
ALTER TABLE categories DROP COLUMN IF EXISTS user_id;
--;;
ALTER TABLE categories ADD CONSTRAINT categories_name_key UNIQUE (name);
