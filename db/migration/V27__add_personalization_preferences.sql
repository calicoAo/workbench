ALTER TABLE task_categories
  MODIFY COLUMN dimension_key VARCHAR(32) NULL;

ALTER TABLE sleep_records
  ADD COLUMN record_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai' AFTER sleep_date;

CREATE TABLE writing_slots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  slot_key VARCHAR(32) NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_writing_slots_user_key (user_id, slot_key),
  KEY idx_writing_slots_user_order (user_id, sort_order)
);

INSERT INTO writing_slots (user_id, slot_key, enabled, sort_order, created_at, updated_at)
SELECT id, 'MORNING_WRITING', 1, 10, NOW(), NOW() FROM users WHERE deleted_at IS NULL
UNION ALL
SELECT id, 'JOURNAL', 1, 20, NOW(), NOW() FROM users WHERE deleted_at IS NULL
UNION ALL
SELECT id, 'STOCK_REVIEW', 0, 30, NOW(), NOW() FROM users WHERE deleted_at IS NULL;
