-- V1__init_schema.sql
-- Description: initial schema for personal workbench
-- Date: 2026-07-16

CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  username VARCHAR(64) NOT NULL COMMENT 'Username',
  display_name VARCHAR(64) NOT NULL COMMENT 'Display name',
  password_hash VARCHAR(255) DEFAULT NULL COMMENT 'Password hash',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Soft delete time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Users';

CREATE TABLE task_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  name VARCHAR(64) NOT NULL COMMENT 'Category name',
  color VARCHAR(32) NOT NULL DEFAULT '#35C99A' COMMENT 'Category color',
  icon VARCHAR(64) DEFAULT NULL COMMENT 'Icon name',
  target_minutes INT NOT NULL DEFAULT 6000 COMMENT 'Target minutes, 100h by default',
  sort_order INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT 'Enabled: 0 no, 1 yes',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Soft delete time',
  PRIMARY KEY (id),
  KEY idx_user_enabled (user_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Task categories';

CREATE TABLE tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  category_id BIGINT UNSIGNED DEFAULT NULL COMMENT 'Category id',
  title VARCHAR(200) NOT NULL COMMENT 'Task title',
  description TEXT DEFAULT NULL COMMENT 'Task description',
  priority TINYINT NOT NULL DEFAULT 2 COMMENT 'Priority: 1 high, 2 normal, 3 low',
  status TINYINT NOT NULL DEFAULT 0 COMMENT 'Status: 0 todo, 1 in progress, 2 done, 3 archived',
  estimated_minutes INT DEFAULT NULL COMMENT 'Estimated minutes',
  due_date DATE DEFAULT NULL COMMENT 'Due date',
  pinned TINYINT NOT NULL DEFAULT 0 COMMENT 'Pinned: 0 no, 1 yes',
  sort_order INT NOT NULL DEFAULT 0 COMMENT 'Sort order',
  completed_at DATETIME DEFAULT NULL COMMENT 'Completed time',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Soft delete time',
  PRIMARY KEY (id),
  KEY idx_user_status (user_id, status),
  KEY idx_user_category (user_id, category_id),
  KEY idx_due_date (due_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Tasks';

CREATE TABLE timer_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  task_id BIGINT UNSIGNED NOT NULL COMMENT 'Task id',
  category_id BIGINT UNSIGNED DEFAULT NULL COMMENT 'Category id',
  start_time DATETIME NOT NULL COMMENT 'Start time',
  end_time DATETIME DEFAULT NULL COMMENT 'End time',
  duration_minutes INT NOT NULL DEFAULT 0 COMMENT 'Duration minutes',
  status TINYINT NOT NULL DEFAULT 0 COMMENT 'Status: 0 running, 1 paused, 2 finished, 3 cancelled',
  note VARCHAR(500) DEFAULT NULL COMMENT 'Note',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Soft delete time',
  PRIMARY KEY (id),
  KEY idx_user_task (user_id, task_id),
  KEY idx_user_status (user_id, status),
  KEY idx_start_time (start_time),
  KEY idx_category_time (category_id, start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Timer sessions';

CREATE TABLE schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  task_id BIGINT UNSIGNED DEFAULT NULL COMMENT 'Task id',
  category_id BIGINT UNSIGNED DEFAULT NULL COMMENT 'Category id',
  schedule_date DATE NOT NULL COMMENT 'Schedule date',
  start_time TIME NOT NULL COMMENT 'Start time',
  end_time TIME NOT NULL COMMENT 'End time',
  title VARCHAR(200) NOT NULL COMMENT 'Schedule title',
  note VARCHAR(500) DEFAULT NULL COMMENT 'Note',
  completed TINYINT NOT NULL DEFAULT 0 COMMENT 'Completed: 0 no, 1 yes',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Soft delete time',
  PRIMARY KEY (id),
  KEY idx_user_date (user_id, schedule_date),
  KEY idx_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Schedules';

CREATE TABLE stock_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  review_date DATE NOT NULL COMMENT 'Review date',
  market_summary TEXT DEFAULT NULL COMMENT 'Market summary',
  operations TEXT DEFAULT NULL COMMENT 'Operations',
  holdings_review TEXT DEFAULT NULL COMMENT 'Holdings review',
  good_points TEXT DEFAULT NULL COMMENT 'Good points',
  mistakes TEXT DEFAULT NULL COMMENT 'Mistakes',
  tomorrow_plan TEXT DEFAULT NULL COMMENT 'Tomorrow plan',
  emotion_score TINYINT DEFAULT NULL COMMENT 'Emotion score: 1-5',
  discipline_score TINYINT DEFAULT NULL COMMENT 'Discipline score: 1-5',
  tags VARCHAR(255) DEFAULT NULL COMMENT 'Tags',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Soft delete time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_date (user_id, review_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Stock reviews';

CREATE TABLE sleep_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  sleep_date DATE NOT NULL COMMENT 'Sleep date',
  sleep_start DATETIME NOT NULL COMMENT 'Sleep start',
  wake_time DATETIME NOT NULL COMMENT 'Wake time',
  duration_minutes INT NOT NULL COMMENT 'Duration minutes',
  quality_score TINYINT DEFAULT NULL COMMENT 'Quality score: 1-5',
  note VARCHAR(500) DEFAULT NULL COMMENT 'Note',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Soft delete time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_sleep_date (user_id, sleep_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Sleep records';

CREATE TABLE journals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  journal_date DATE NOT NULL COMMENT 'Journal date',
  happy_moment TEXT DEFAULT NULL COMMENT 'Happy moment',
  achievement TEXT DEFAULT NULL COMMENT 'Achievement',
  learning TEXT DEFAULT NULL COMMENT 'Learning',
  tomorrow_priority VARCHAR(255) DEFAULT NULL COMMENT 'Tomorrow priority',
  content TEXT DEFAULT NULL COMMENT 'Content',
  mood_score TINYINT DEFAULT NULL COMMENT 'Mood score: 1-5',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Soft delete time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_journal_date (user_id, journal_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Journals';

CREATE TABLE weekly_summaries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  week_start DATE NOT NULL COMMENT 'Week start',
  week_end DATE NOT NULL COMMENT 'Week end',
  achievements TEXT DEFAULT NULL COMMENT 'Achievements',
  problems TEXT DEFAULT NULL COMMENT 'Problems',
  next_week_plan TEXT DEFAULT NULL COMMENT 'Next week plan',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Soft delete time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_week (user_id, week_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Weekly summaries';

INSERT INTO users (id, username, display_name, password_hash)
VALUES (1, 'local', 'Local User', NULL);

INSERT INTO task_categories (user_id, name, color, icon, target_minutes, sort_order, enabled)
VALUES
  (1, 'Programming', '#35C99A', 'code', 6000, 10, 1),
  (1, 'Stock Review', '#EA6FA3', 'trending-up', 6000, 20, 1),
  (1, 'Life', '#8FE4C1', 'sparkles', 6000, 30, 1);
