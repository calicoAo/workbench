-- V2__schedule_kind.sql
-- Description: distinguish planned and actual task blocks on the timeline
-- Date: 2026-07-18

ALTER TABLE schedules
  ADD COLUMN kind TINYINT NOT NULL DEFAULT 0 COMMENT 'Timeline kind: 0 planned, 1 actual' AFTER completed,
  ADD KEY idx_user_date_kind (user_id, schedule_date, kind);
