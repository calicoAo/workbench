-- V3__schedule_source.sql
-- Description: add source to schedule time blocks
-- Date: 2026-07-18

ALTER TABLE schedules
  ADD COLUMN source TINYINT NOT NULL DEFAULT 0 COMMENT 'Time block source: 0 manual, 1 timer, 2 planned task' AFTER kind,
  ADD KEY idx_user_date_source (user_id, schedule_date, source);

UPDATE schedules
SET source = CASE
  WHEN kind = 0 THEN 2
  WHEN kind = 1 THEN 1
  ELSE 0
END;
