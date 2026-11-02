ALTER TABLE library_items
  ADD COLUMN release_year SMALLINT UNSIGNED NULL,
  ADD COLUMN description TEXT NULL,
  ADD CONSTRAINT chk_library_release_year CHECK (release_year IS NULL OR release_year BETWEEN 1 AND 9999);
CREATE TABLE library_item_sources (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  library_item_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(32) NOT NULL,
  entity_type VARCHAR(16) NOT NULL,
  stable_source_id VARCHAR(64) NOT NULL,
  canonical_url VARCHAR(500) NOT NULL,
  attribution VARCHAR(500) NOT NULL,
  language VARCHAR(32) NULL,
  metadata_snapshot JSON NOT NULL,
  imported_at DATETIME NOT NULL,
  metadata_updated_at DATETIME NOT NULL,
  UNIQUE KEY uq_library_source_identity (user_id,provider,entity_type,stable_source_id),
  UNIQUE KEY uq_library_single_source (user_id,library_item_id),
  CONSTRAINT fk_library_source_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_library_source_item FOREIGN KEY (library_item_id) REFERENCES library_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE user_ai_settings ADD COLUMN allow_tasks TINYINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_ai_allow_tasks CHECK (allow_tasks IN (0,1));
ALTER TABLE ai_artifacts ADD COLUMN reasoning_tokens INT UNSIGNED NULL,
  ADD COLUMN generation_context JSON NULL;
