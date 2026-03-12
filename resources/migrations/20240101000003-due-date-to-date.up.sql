-- Change due_at from TIMESTAMPTZ to a plain DATE column.
ALTER TABLE todos ALTER COLUMN due_at TYPE DATE USING due_at::DATE;
