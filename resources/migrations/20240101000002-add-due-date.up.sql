-- Add an optional due date to existing todos.
-- NULL means no due date set.
ALTER TABLE todos ADD COLUMN due_at TIMESTAMP WITH TIME ZONE;
