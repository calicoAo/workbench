-- V4__add_morning_writing_and_water.sql
-- Description: add morning writing and daily water records
-- Date: 2026-07-19

CREATE TABLE morning_writings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  writing_date DATE NOT NULL COMMENT 'Writing date',
  content TEXT DEFAULT NULL COMMENT 'Morning writing content',
  mood_score TINYINT DEFAULT NULL COMMENT 'Mood score: 1-5',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Soft delete time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_writing_date (user_id, writing_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Morning writings';

CREATE TABLE water_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  water_date DATE NOT NULL COMMENT 'Water record date',
  cups TINYINT NOT NULL DEFAULT 0 COMMENT 'Finished cups, 0-8',
  target_cups TINYINT NOT NULL DEFAULT 8 COMMENT 'Target cups',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Soft delete time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_water_date (user_id, water_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Water records';
