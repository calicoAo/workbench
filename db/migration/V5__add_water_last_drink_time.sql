-- V5__add_water_last_drink_time.sql
-- Description: track the latest drinking time for daily water records
-- Date: 2026-07-19

ALTER TABLE water_records
  ADD COLUMN last_drink_at DATETIME DEFAULT NULL COMMENT 'Latest drinking time' AFTER target_cups;
