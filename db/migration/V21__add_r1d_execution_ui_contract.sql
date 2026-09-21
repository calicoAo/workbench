ALTER TABLE task_daily_assignments
  ADD COLUMN focus_rank TINYINT UNSIGNED NULL COMMENT 'Today focus rank, 1-3, owned by the assignment' AFTER sort_order,
  ADD CONSTRAINT chk_task_daily_assignments_focus_rank CHECK (focus_rank IS NULL OR focus_rank BETWEEN 1 AND 3),
  ADD UNIQUE KEY uq_task_daily_assignments_focus_rank (user_id, task_date, focus_rank);

ALTER TABLE schedules
  ADD COLUMN lifecycle_state TINYINT NOT NULL DEFAULT 0 COMMENT '0 pending, 1 executed, 2 cancelled, 3 rescheduled' AFTER completed,
  ADD COLUMN rescheduled_from_schedule_id BIGINT UNSIGNED NULL COMMENT 'Prior planned schedule when explicitly rescheduled' AFTER source_id,
  ADD CONSTRAINT chk_schedules_lifecycle_state CHECK (lifecycle_state IN (0, 1, 2, 3)),
  ADD KEY idx_schedules_rescheduled_from (rescheduled_from_schedule_id);

UPDATE schedules
SET lifecycle_state = CASE WHEN kind = 1 OR completed = 1 THEN 1 ELSE 0 END;
