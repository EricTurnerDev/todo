-- Add recurrence fields to todos.
--
-- recurrence_type: one of 'daily', 'weekly', 'monthly', 'yearly', 'custom'.
--   NULL means the todo does not repeat.
-- recurrence_days: only used when recurrence_type = 'custom'; stores the
--   interval in days (e.g. 14 = every two weeks).
ALTER TABLE todos
  ADD COLUMN recurrence_type VARCHAR(20),
  ADD COLUMN recurrence_days INTEGER;
