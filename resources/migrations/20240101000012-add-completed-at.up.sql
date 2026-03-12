-- Track when a todo was completed.
-- Set to NOW() when completed becomes true; cleared to NULL when uncompleted.
-- Also set by advance-recurring-todo! to record each time a recurring task is done.
ALTER TABLE todos ADD COLUMN completed_at TIMESTAMPTZ;
