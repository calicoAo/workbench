CREATE TABLE user_ai_settings (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  enabled TINYINT NOT NULL DEFAULT 0,
  allow_adventure TINYINT NOT NULL DEFAULT 0,
  allow_notebook TINYINT NOT NULL DEFAULT 0,
  allow_growth TINYINT NOT NULL DEFAULT 0,
  allow_library TINYINT NOT NULL DEFAULT 0,
  allow_wallet TINYINT NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL,
  CONSTRAINT chk_ai_enabled CHECK (enabled IN (0,1)),
  CONSTRAINT chk_ai_permissions CHECK (allow_adventure IN (0,1) AND allow_notebook IN (0,1) AND allow_growth IN (0,1) AND allow_library IN (0,1) AND allow_wallet IN (0,1)),
  CONSTRAINT fk_ai_settings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO user_ai_settings (user_id,enabled,allow_adventure,allow_notebook,allow_growth,allow_library,allow_wallet,version,updated_at)
SELECT id,0,0,0,0,0,0,1,NOW() FROM users WHERE deleted_at IS NULL;

CREATE TABLE ai_artifacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  operation_id CHAR(36) NOT NULL,
  artifact_type VARCHAR(64) NOT NULL,
  feature_key VARCHAR(64) NOT NULL,
  source_refs JSON NOT NULL,
  source_versions JSON NOT NULL,
  source_fingerprint CHAR(64) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  model VARCHAR(120) NOT NULL,
  prompt_version VARCHAR(32) NOT NULL,
  result_payload JSON NULL,
  status VARCHAR(16) NOT NULL,
  stale TINYINT NOT NULL DEFAULT 0,
  usage_input_tokens INT UNSIGNED NULL,
  usage_output_tokens INT UNSIGNED NULL,
  cost_microunits BIGINT UNSIGNED NULL,
  error_code VARCHAR(64) NULL,
  error_message VARCHAR(500) NULL,
  generated_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_ai_artifact_operation (user_id, operation_id),
  KEY idx_ai_artifact_user_type (user_id, artifact_type, updated_at),
  CONSTRAINT chk_ai_artifact_status CHECK (status IN ('PENDING','SUCCEEDED','FAILED')),
  CONSTRAINT chk_ai_artifact_stale CHECK (stale IN (0,1)),
  CONSTRAINT fk_ai_artifact_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
