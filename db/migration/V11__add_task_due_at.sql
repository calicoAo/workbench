ALTER TABLE tasks
  ADD COLUMN due_at DATETIME NULL COMMENT 'Task due date and time' AFTER due_date;
