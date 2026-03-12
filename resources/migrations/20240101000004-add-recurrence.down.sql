ALTER TABLE todos
  DROP COLUMN IF EXISTS recurrence_type,
  DROP COLUMN IF EXISTS recurrence_days;
