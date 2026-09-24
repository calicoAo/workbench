CREATE TABLE growth_dimensions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  dimension_key VARCHAR(32) NOT NULL,
  name VARCHAR(64) NOT NULL,
  icon_key VARCHAR(64) NULL,
  color VARCHAR(32) NOT NULL,
  sort_order INT NOT NULL,
  enabled TINYINT NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_growth_dimension_user_key (user_id, dimension_key),
  KEY idx_growth_dimension_user_order (user_id, enabled, sort_order),
  CONSTRAINT fk_growth_dimension_user FOREIGN KEY (user_id) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO growth_dimensions (user_id, dimension_key, name, icon_key, color, sort_order, enabled, version, created_at, updated_at)
SELECT id, 'career', '事业', 'briefcase', '#5B8DEF', 10, 1, 1, NOW(), NOW() FROM users WHERE deleted_at IS NULL
UNION ALL SELECT id, 'learning', '学习', 'book-open', '#B28DFF', 20, 1, 1, NOW(), NOW() FROM users WHERE deleted_at IS NULL
UNION ALL SELECT id, 'creative', '创作', 'pen-tool', '#FF8FA3', 30, 1, 1, NOW(), NOW() FROM users WHERE deleted_at IS NULL
UNION ALL SELECT id, 'life', '生活', 'home', '#35C99A', 40, 1, 1, NOW(), NOW() FROM users WHERE deleted_at IS NULL
UNION ALL SELECT id, 'body', '身体', 'heart-pulse', '#9BD67D', 50, 1, 1, NOW(), NOW() FROM users WHERE deleted_at IS NULL
UNION ALL SELECT id, 'social', '社交', 'users', '#F7C96B', 60, 1, 1, NOW(), NOW() FROM users WHERE deleted_at IS NULL;

INSERT INTO growth_dimensions (user_id, dimension_key, name, icon_key, color, sort_order, enabled, version, created_at, updated_at)
SELECT DISTINCT category.user_id, category.dimension_key,
  CASE category.dimension_key WHEN 'leisure' THEN '兴趣' WHEN 'foundation' THEN '基础状态' ELSE category.dimension_key END,
  NULL, '#9EB7CC', 100, 1, 1, NOW(), NOW()
FROM task_categories category
LEFT JOIN growth_dimensions dimension
  ON dimension.user_id = category.user_id AND dimension.dimension_key = category.dimension_key COLLATE utf8mb4_unicode_ci
WHERE category.dimension_key IS NOT NULL AND dimension.id IS NULL;

UPDATE task_categories
SET dimension_key = NULL, updated_at = NOW()
WHERE name = '其他' AND icon = 'circle' AND color = '#64748B' AND sort_order = 70 AND dimension_key = 'life';

ALTER TABLE task_completion_events
  ADD COLUMN category_id_at_occurrence BIGINT UNSIGNED NULL AFTER task_id,
  ADD KEY idx_task_completion_category_date (user_id, category_id_at_occurrence, business_date);

UPDATE task_completion_events event
JOIN tasks task ON task.id = event.task_id AND task.user_id = event.user_id
SET event.category_id_at_occurrence = task.category_id
WHERE event.category_id_at_occurrence IS NULL;
