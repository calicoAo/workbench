-- V2__add_task_completion_note.sql
-- Description: add task completion reflection note
-- Date: 2026-07-18

ALTER TABLE tasks
  ADD COLUMN completion_note TEXT DEFAULT NULL COMMENT 'Task completion reflection note' AFTER completed_at;
