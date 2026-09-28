CREATE TABLE library_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(16) NOT NULL,
  title VARCHAR(200) NOT NULL,
  original_title VARCHAR(200) NULL,
  creator VARCHAR(160) NULL,
  cover_ref VARCHAR(500) NULL,
  status VARCHAR(16) NOT NULL,
  rating TINYINT UNSIGNED NULL,
  started_on DATE NULL,
  finished_on DATE NULL,
  external_ref VARCHAR(500) NULL,
  short_note VARCHAR(1000) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_library_user_status (user_id, status, updated_at),
  KEY idx_library_user_type (user_id, type, updated_at),
  CONSTRAINT chk_library_type CHECK (type IN ('BOOK', 'MOVIE', 'SERIES', 'GAME')),
  CONSTRAINT chk_library_status CHECK (status IN ('WANT', 'IN_PROGRESS', 'FINISHED', 'DROPPED')),
  CONSTRAINT chk_library_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  CONSTRAINT chk_library_dates CHECK (finished_on IS NULL OR started_on IS NULL OR finished_on >= started_on),
  CONSTRAINT fk_library_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE library_item_relations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  library_item_id BIGINT UNSIGNED NOT NULL,
  target_type VARCHAR(24) NOT NULL,
  target_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_library_relation (user_id, library_item_id, target_type, target_id),
  KEY idx_library_relation_target (user_id, target_type, target_id),
  CONSTRAINT chk_library_relation_type CHECK (target_type IN ('QUICK_NOTE', 'JOURNAL', 'INSPIRATION')),
  CONSTRAINT fk_library_relation_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_library_relation_item FOREIGN KEY (library_item_id) REFERENCES library_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
