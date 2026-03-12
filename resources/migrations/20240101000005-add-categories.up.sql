-- Create the categories lookup table.
-- Names must be unique so users can't create duplicates.
CREATE TABLE categories (
    id         SERIAL                   PRIMARY KEY,
    name       VARCHAR(100)             NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
--;;
-- Add a nullable foreign key on todos.
-- ON DELETE SET NULL means deleting a category automatically un-assigns
-- any todos that were using it rather than blocking the delete or
-- cascade-deleting the todos themselves.
ALTER TABLE todos
    ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;
