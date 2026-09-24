CREATE TABLE writing_inspirations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  quick_note_id BIGINT UNSIGNED NOT NULL,
  favorite TINYINT NOT NULL DEFAULT 0,
  pinned TINYINT NOT NULL DEFAULT 0,
  archived_at DATETIME NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_writing_inspiration_user_note (user_id, quick_note_id),
  KEY idx_writing_inspiration_user_state (user_id, archived_at, pinned, updated_at),
  CONSTRAINT fk_writing_inspiration_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_writing_inspiration_note FOREIGN KEY (quick_note_id) REFERENCES quick_notes (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inspiration_tags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  normalized_name VARCHAR(120) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_inspiration_tag_user_normalized (user_id, normalized_name),
  KEY idx_inspiration_tag_user_updated (user_id, updated_at),
  CONSTRAINT fk_inspiration_tag_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inspiration_tag_links (
  inspiration_id BIGINT UNSIGNED NOT NULL,
  tag_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL,
  PRIMARY KEY (inspiration_id, tag_id),
  KEY idx_inspiration_tag_link_tag (tag_id, inspiration_id),
  CONSTRAINT fk_inspiration_tag_link_inspiration FOREIGN KEY (inspiration_id) REFERENCES writing_inspirations (id) ON DELETE CASCADE,
  CONSTRAINT fk_inspiration_tag_link_tag FOREIGN KEY (tag_id) REFERENCES inspiration_tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
