CREATE TABLE daily_adventure_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  business_date DATE NOT NULL,
  period_timezone VARCHAR(64) NOT NULL,
  source_fingerprint CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'CURRENT',
  snapshot_payload JSON NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  generated_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_adventure_snapshot_user_date (user_id, business_date),
  KEY idx_adventure_snapshot_user_date (user_id, business_date),
  CONSTRAINT chk_adventure_snapshot_status CHECK (status IN ('CURRENT', 'STALE')),
  CONSTRAINT fk_adventure_snapshot_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE period_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  period_type VARCHAR(8) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_timezone VARCHAR(64) NOT NULL,
  source_fingerprint CHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'CURRENT',
  facts_payload JSON NOT NULL,
  user_review_body TEXT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  generated_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_period_review_user_period (user_id, period_type, period_start),
  KEY idx_period_review_user_end (user_id, period_end),
  CONSTRAINT chk_period_review_type CHECK (period_type IN ('WEEK', 'MONTH')),
  CONSTRAINT chk_period_review_status CHECK (status IN ('CURRENT', 'STALE')),
  CONSTRAINT fk_period_review_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
