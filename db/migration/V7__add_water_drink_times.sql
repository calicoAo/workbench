-- V7__add_water_drink_times.sql
-- Description: keep every daily water drinking timestamp
-- Date: 2026-07-19

ALTER TABLE water_records
  ADD COLUMN drink_times TEXT DEFAULT NULL COMMENT 'JSON array of drinking timestamps' AFTER last_drink_at;

UPDATE water_records
SET drink_times = JSON_ARRAY(DATE_FORMAT(last_drink_at, '%Y-%m-%dT%H:%i:%s.000Z'))
WHERE last_drink_at IS NOT NULL AND (drink_times IS NULL OR drink_times = '');

UPDATE water_records
SET drink_times = '[]'
WHERE last_drink_at IS NULL AND (drink_times IS NULL OR drink_times = '');
