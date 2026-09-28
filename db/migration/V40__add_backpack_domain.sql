CREATE TABLE achievement_definitions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  achievement_key VARCHAR(64) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(500) NOT NULL,
  icon_key VARCHAR(64) NOT NULL,
  theme_key VARCHAR(32) NOT NULL,
  rule_key VARCHAR(64) NOT NULL,
  rule_version INT UNSIGNED NOT NULL DEFAULT 1,
  enabled TINYINT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_achievement_key (achievement_key),
  CONSTRAINT chk_achievement_enabled CHECK (enabled IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO achievement_definitions (achievement_key,title,description,icon_key,theme_key,rule_key,rule_version,enabled,created_at,updated_at) VALUES
  ('FIRST_PROJECT_COMPLETE','首个完成项目','完成第一个项目。','flag','mint','PROJECT_COMPLETED_COUNT_GTE_1',1,1,NOW(),NOW()),
  ('FIRST_LIBRARY_FINISH','第一部作品','在图书馆完成第一部作品。','book-open','violet','LIBRARY_FINISHED_COUNT_GTE_1',1,1,NOW(),NOW());

CREATE TABLE achievement_unlocks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  achievement_id BIGINT UNSIGNED NOT NULL,
  unlocked_at DATETIME NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  source_id BIGINT UNSIGNED NULL,
  UNIQUE KEY uk_achievement_unlock_user (user_id, achievement_id),
  CONSTRAINT fk_achievement_unlock_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_achievement_unlock_definition FOREIGN KEY (achievement_id) REFERENCES achievement_definitions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE milestones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  operation_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(1000) NULL,
  happened_on DATE NOT NULL,
  source_type VARCHAR(32) NULL,
  source_id BIGINT UNSIGNED NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_milestone_operation (user_id, operation_id),
  KEY idx_milestone_user_date (user_id, happened_on),
  CONSTRAINT fk_milestone_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE keepsake_cards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  operation_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description VARCHAR(1000) NULL,
  happened_on DATE NOT NULL,
  source_type VARCHAR(32) NULL,
  source_id BIGINT UNSIGNED NULL,
  icon_key VARCHAR(64) NOT NULL,
  theme_key VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_keepsake_operation (user_id, operation_id),
  KEY idx_keepsake_user_date (user_id, happened_on),
  CONSTRAINT chk_keepsake_source CHECK (source_type IS NULL OR source_type IN ('PROJECT','MILESTONE','ACHIEVEMENT','LIBRARY','ADVENTURE_LOG','MANUAL_TEXT')),
  CONSTRAINT fk_keepsake_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
