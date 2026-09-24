CREATE TABLE projects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  status TINYINT NOT NULL DEFAULT 0 COMMENT '0 planning, 1 active, 2 paused, 3 done',
  priority TINYINT NOT NULL DEFAULT 2,
  start_date DATE NULL,
  target_date DATE NULL,
  notes TEXT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  archived_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_project_user_status (user_id, archived_at, status, target_date),
  CONSTRAINT fk_project_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT chk_project_status CHECK (status BETWEEN 0 AND 3),
  CONSTRAINT chk_project_priority CHECK (priority BETWEEN 1 AND 3),
  CONSTRAINT chk_project_dates CHECK (target_date IS NULL OR start_date IS NULL OR target_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='R2A project owner and lifecycle';

ALTER TABLE tasks
  ADD COLUMN project_id BIGINT UNSIGNED NULL AFTER category_id,
  ADD KEY idx_task_project (user_id, project_id, status),
  ADD CONSTRAINT fk_task_project FOREIGN KEY (project_id) REFERENCES projects (id);
