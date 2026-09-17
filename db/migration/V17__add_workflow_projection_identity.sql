-- V17__add_workflow_projection_identity.sql
-- Give work-session projections and terminal intent stable database identities.

ALTER TABLE timer_sessions
  ADD COLUMN completion_requested TINYINT NOT NULL DEFAULT 0 COMMENT 'Terminal command explicitly requested task completion' AFTER status,
  ADD COLUMN task_completed TINYINT NOT NULL DEFAULT 0 COMMENT 'Terminal command performed the task completion transition' AFTER completion_requested;

ALTER TABLE schedules
  ADD COLUMN source_id VARCHAR(128) NULL COMMENT 'Stable workflow source identity; null for ordinary manual records' AFTER source,
  ADD UNIQUE KEY uk_user_source_identity (user_id, source, source_id);
