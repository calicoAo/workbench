-- V13__add_growth_rewards_and_ai_insights.sql
-- Description: add growth rewards, custom reward center, and AI insights

ALTER TABLE tasks
  ADD COLUMN difficulty TINYINT NOT NULL DEFAULT 2 COMMENT 'Difficulty: 1 easy, 2 normal, 3 hard, 4 epic' AFTER priority;

CREATE TABLE user_growth (
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  level INT NOT NULL DEFAULT 1 COMMENT 'Current level',
  xp_total INT NOT NULL DEFAULT 0 COMMENT 'Total experience',
  coins INT NOT NULL DEFAULT 0 COMMENT 'Current coins',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='User growth balance';

CREATE TABLE reward_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  event_key VARCHAR(128) NOT NULL COMMENT 'Unique reward key',
  source_type VARCHAR(32) NOT NULL COMMENT 'Reward source type',
  source_id VARCHAR(64) NOT NULL COMMENT 'Reward source id',
  event_date DATE DEFAULT NULL COMMENT 'Reward date',
  xp_delta INT NOT NULL DEFAULT 0 COMMENT 'XP change',
  coin_delta INT NOT NULL DEFAULT 0 COMMENT 'Coin change',
  reason VARCHAR(255) NOT NULL COMMENT 'Reward reason',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_event_key (event_key),
  KEY idx_user_created (user_id, created_at),
  KEY idx_user_date (user_id, event_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Reward event ledger';

CREATE TABLE reward_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  name VARCHAR(100) NOT NULL COMMENT 'Reward item name',
  cost INT NOT NULL COMMENT 'Coin cost',
  description VARCHAR(500) DEFAULT NULL COMMENT 'Description',
  enabled TINYINT NOT NULL DEFAULT 1 COMMENT 'Enabled: 0 no, 1 yes',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Deleted time',
  PRIMARY KEY (id),
  KEY idx_user_enabled (user_id, enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Custom reward items';

CREATE TABLE reward_redemptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  reward_item_id BIGINT UNSIGNED DEFAULT NULL COMMENT 'Reward item id',
  name VARCHAR(100) NOT NULL COMMENT 'Redeemed reward name',
  cost INT NOT NULL COMMENT 'Coin cost',
  note VARCHAR(500) DEFAULT NULL COMMENT 'Note',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (id),
  KEY idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Reward redemptions';

CREATE TABLE ai_insights (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  source_type VARCHAR(20) NOT NULL COMMENT 'Source type: morning or journal',
  source_date DATE NOT NULL COMMENT 'Source date',
  source_content TEXT DEFAULT NULL COMMENT 'Analyzed source content',
  summary TEXT DEFAULT NULL COMMENT 'Short summary',
  emotion_tags VARCHAR(255) DEFAULT NULL COMMENT 'Emotion tags',
  energy_score TINYINT DEFAULT NULL COMMENT 'Energy score: 1-5',
  stress_keywords VARCHAR(255) DEFAULT NULL COMMENT 'Stress keywords',
  suggestion TEXT DEFAULT NULL COMMENT 'Action suggestion',
  full_text TEXT DEFAULT NULL COMMENT 'Full AI insight',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  deleted_at DATETIME DEFAULT NULL COMMENT 'Deleted time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_source_date (user_id, source_type, source_date),
  KEY idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI writing insights';
