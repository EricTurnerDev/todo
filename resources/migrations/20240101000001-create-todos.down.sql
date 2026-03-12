-- Rollback: drop the todos table
-- Run with: (migratus/rollback config) in the REPL

DROP TABLE IF EXISTS todos;
