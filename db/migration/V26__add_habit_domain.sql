CREATE TABLE habit_definitions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  record_mode TINYINT NOT NULL COMMENT '0 completion, 1 count, 2 quantity, 3 minutes',
  unit VARCHAR(32) NULL,
  task_completion_enabled TINYINT NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_habit_definition_user (user_id, archived_at, start_date),
  KEY idx_habit_definition_category (user_id, category_id),
  CONSTRAINT fk_habit_definition_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_habit_definition_category FOREIGN KEY (category_id) REFERENCES task_categories (id) ON DELETE SET NULL,
  CONSTRAINT chk_habit_definition_mode CHECK (record_mode BETWEEN 0 AND 3),
  CONSTRAINT chk_habit_definition_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT chk_habit_task_completion CHECK (task_completion_enabled = 0 OR record_mode = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='R2C habit identity and current edit version';

CREATE TABLE habit_rule_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  habit_id BIGINT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  frequency_type TINYINT NOT NULL COMMENT '0 daily, 1 weekdays, 2 weekly N',
  weekday_mask TINYINT UNSIGNED NULL COMMENT 'Monday bit 0 through Sunday bit 6',
  weekly_target TINYINT UNSIGNED NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_habit_rule_effective (habit_id, effective_from),
  KEY idx_habit_rule_lookup (user_id, habit_id, effective_from),
  CONSTRAINT fk_habit_rule_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_habit_rule_habit FOREIGN KEY (habit_id) REFERENCES habit_definitions (id),
  CONSTRAINT chk_habit_frequency CHECK (frequency_type BETWEEN 0 AND 2),
  CONSTRAINT chk_habit_rule_shape CHECK (
    (frequency_type = 0 AND weekday_mask IS NULL AND weekly_target IS NULL) OR
    (frequency_type = 1 AND weekday_mask BETWEEN 1 AND 127 AND weekly_target IS NULL) OR
    (frequency_type = 2 AND weekday_mask IS NULL AND weekly_target BETWEEN 1 AND 7)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Effective-dated habit schedule rules';

CREATE TABLE habit_goal_versions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  habit_id BIGINT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  target_value DECIMAL(12,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_habit_goal_effective (habit_id, effective_from),
  KEY idx_habit_goal_lookup (user_id, habit_id, effective_from),
  CONSTRAINT fk_habit_goal_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_habit_goal_habit FOREIGN KEY (habit_id) REFERENCES habit_definitions (id),
  CONSTRAINT chk_habit_goal_positive CHECK (target_value > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Effective-dated habit targets';

CREATE TABLE habit_occurrences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  habit_id BIGINT UNSIGNED NOT NULL,
  occurrence_date DATE NOT NULL,
  record_timezone VARCHAR(64) NOT NULL,
  status TINYINT NOT NULL COMMENT '0 partial, 1 completed, 2 skipped',
  actual_value DECIMAL(12,2) NULL,
  skip_reason VARCHAR(500) NULL,
  source TINYINT NOT NULL DEFAULT 0 COMMENT '0 manual, 1 linked task',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_habit_occurrence (user_id, habit_id, occurrence_date),
  KEY idx_habit_occurrence_history (user_id, occurrence_date, status),
  CONSTRAINT fk_habit_occurrence_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_habit_occurrence_habit FOREIGN KEY (habit_id) REFERENCES habit_definitions (id),
  CONSTRAINT chk_habit_occurrence_status CHECK (status BETWEEN 0 AND 2),
  CONSTRAINT chk_habit_occurrence_source CHECK (source BETWEEN 0 AND 1),
  CONSTRAINT chk_habit_occurrence_skip CHECK ((status = 2 AND actual_value IS NULL) OR status <> 2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Explicit habit facts; pending and missed remain derived';

CREATE TABLE habit_task_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  habit_id BIGINT UNSIGNED NOT NULL,
  occurrence_date DATE NOT NULL,
  task_id BIGINT UNSIGNED NOT NULL,
  complete_habit_on_task TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_habit_task_occurrence (user_id, habit_id, occurrence_date),
  UNIQUE KEY uk_habit_task_task (task_id),
  CONSTRAINT fk_habit_task_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_habit_task_habit FOREIGN KEY (habit_id) REFERENCES habit_definitions (id),
  CONSTRAINT fk_habit_task_task FOREIGN KEY (task_id) REFERENCES tasks (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Explicit one occurrence to one published Task relation';
