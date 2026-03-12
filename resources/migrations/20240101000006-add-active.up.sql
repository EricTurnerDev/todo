-- Add an active flag so recurring todos can be paused out of season.
-- Defaults to true so all existing todos remain active.
ALTER TABLE todos ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
