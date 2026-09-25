CREATE TABLE onboarding_flow_progress (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  flow_id VARCHAR(64) NOT NULL,
  flow_version INT UNSIGNED NOT NULL,
  status VARCHAR(24) NOT NULL,
  current_step_id VARCHAR(64) NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  skipped_at DATETIME NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_onboarding_flow_user_version (user_id, flow_id, flow_version),
  KEY idx_onboarding_flow_user_status (user_id, status),
  CONSTRAINT fk_onboarding_flow_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE onboarding_hint_state (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  hint_key VARCHAR(96) NOT NULL,
  hint_version INT UNSIGNED NOT NULL,
  seen_at DATETIME NULL,
  dismissed_at DATETIME NULL,
  UNIQUE KEY uk_onboarding_hint_user_version (user_id, hint_key, hint_version),
  KEY idx_onboarding_hint_user (user_id),
  CONSTRAINT fk_onboarding_hint_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
