-- V20__add_actual_time_inclusion.sql
-- R1A contract correction: persist the explicit exclusion of overlapping Manual Actual notes.

ALTER TABLE schedules
  ADD COLUMN include_in_actual_time TINYINT NOT NULL DEFAULT 1
    COMMENT '1 contributes to ActualTime; 0 is an overlapping annotation only' AFTER actual_time_class;

UPDATE schedules
SET include_in_actual_time = 0
WHERE actual_time_class = 3;

ALTER TABLE schedules
  ADD CONSTRAINT chk_schedule_actual_time_inclusion CHECK (
    include_in_actual_time IN (0, 1) AND
    (actual_time_class <> 3 OR include_in_actual_time = 0)
  );
