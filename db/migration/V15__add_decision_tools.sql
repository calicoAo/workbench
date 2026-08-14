-- V15__add_decision_tools.sql
-- Description: add decision balance and psychological bridge records

CREATE TABLE decision_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  decision_date DATE NOT NULL COMMENT 'Decision date',
  theme VARCHAR(200) NOT NULL COMMENT 'Decision theme',
  benefits TEXT NOT NULL COMMENT 'Benefits',
  drawbacks TEXT NOT NULL COMMENT 'Drawbacks',
  benefit_score TINYINT NOT NULL DEFAULT 3 COMMENT 'Benefit score: 1-5',
  drawback_score TINYINT NOT NULL DEFAULT 3 COMMENT 'Drawback score: 1-5',
  conclusion VARCHAR(500) DEFAULT NULL COMMENT 'Current conclusion',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Deleted time',
  PRIMARY KEY (id),
  KEY idx_user_date (user_id, decision_date),
  KEY idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Decision balance records';

CREATE TABLE psychological_bridges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  bridge_date DATE NOT NULL COMMENT 'Bridge date',
  desired_effect TEXT NOT NULL COMMENT 'Desired effect',
  resistance TEXT NOT NULL COMMENT 'Resistance',
  bridge_text TEXT NOT NULL COMMENT 'Generated psychological bridge',
  next_step VARCHAR(500) DEFAULT NULL COMMENT 'Small next step',
  reassurance VARCHAR(500) DEFAULT NULL COMMENT 'Supportive sentence',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Deleted time',
  PRIMARY KEY (id),
  KEY idx_user_date (user_id, bridge_date),
  KEY idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Psychological bridge records';
