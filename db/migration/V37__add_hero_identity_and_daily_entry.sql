CREATE TABLE hero_profiles (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  display_name VARCHAR(64) NOT NULL,
  avatar_ref VARCHAR(255) NULL,
  portrait_ref VARCHAR(255) NULL,
  title VARCHAR(80) NULL,
  birth_date DATE NULL,
  visual_preferences JSON NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_hero_profile_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO hero_profiles (user_id, display_name, version, created_at, updated_at)
SELECT id, display_name, 1, NOW(), NOW()
FROM users;

CREATE TABLE hero_daily_statuses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  business_date DATE NOT NULL,
  period_timezone VARCHAR(64) NOT NULL,
  status_key VARCHAR(24) NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_hero_daily_status_user_date (user_id, business_date),
  CONSTRAINT chk_hero_daily_status_key CHECK (status_key IN ('GREAT', 'GOOD', 'OKAY', 'TIRED', 'LOW')),
  CONSTRAINT fk_hero_daily_status_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE hero_daily_entries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  business_date DATE NOT NULL,
  period_timezone VARCHAR(64) NOT NULL,
  entered_at DATETIME NOT NULL,
  UNIQUE KEY uk_hero_daily_entry_user_date (user_id, business_date),
  CONSTRAINT fk_hero_daily_entry_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
