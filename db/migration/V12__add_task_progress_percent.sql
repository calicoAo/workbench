ALTER TABLE tasks
  ADD COLUMN progress_percent TINYINT NOT NULL DEFAULT 0 COMMENT 'Task completion progress percent' AFTER pinned;
