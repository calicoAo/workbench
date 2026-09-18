-- V17__add_quick_notes.sql
-- Description: add quick notes and inspiration library
-- Date: 2026-09-04

CREATE TABLE quick_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  note_date DATE NOT NULL COMMENT 'Record date',
  title VARCHAR(120) DEFAULT NULL COMMENT 'Optional title',
  content TEXT NOT NULL COMMENT 'Quick note content',
  tag VARCHAR(64) DEFAULT NULL COMMENT 'Optional tag',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Legacy soft delete marker',
  PRIMARY KEY (id),
  KEY idx_user_date_created (user_id, note_date, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Quick notes and inspiration library';
