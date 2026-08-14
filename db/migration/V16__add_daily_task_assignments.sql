-- V16__add_daily_task_assignments.sql
-- Description: add daily task pool assignments

CREATE TABLE task_daily_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  task_id BIGINT UNSIGNED NOT NULL COMMENT 'Task id',
  task_date DATE NOT NULL COMMENT 'Accepted date',
  sort_order INT NOT NULL DEFAULT 1 COMMENT 'Order for the day',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Updated time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_task_date (user_id, task_id, task_date),
  KEY idx_user_date_order (user_id, task_date, sort_order),
  KEY idx_task_id (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Daily accepted task assignments';
