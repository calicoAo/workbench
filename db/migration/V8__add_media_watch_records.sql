-- V8__add_media_watch_records.sql
-- Description: add daily media watch companion records
-- Date: 2026-07-19

CREATE TABLE media_watch_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  watch_date DATE NOT NULL COMMENT 'Watch date',
  title VARCHAR(200) DEFAULT NULL COMMENT 'Media title',
  episode VARCHAR(100) DEFAULT NULL COMMENT 'Episode or progress',
  note VARCHAR(500) DEFAULT NULL COMMENT 'Daily media note',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Soft delete time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_watch_date (user_id, watch_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Media watch records';
