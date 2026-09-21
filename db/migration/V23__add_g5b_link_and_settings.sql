CREATE TABLE quick_note_task_links (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  quick_note_id BIGINT UNSIGNED NOT NULL,
  task_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_quick_note_task_source (user_id, quick_note_id),
  UNIQUE KEY uk_quick_note_task_target (user_id, task_id),
  KEY idx_quick_note_task_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Stable non-cascading Quick Note to Task source relation';

CREATE TABLE user_settings (
  user_id BIGINT UNSIGNED NOT NULL,
  reduced_motion TINYINT NOT NULL DEFAULT 0,
  show_rewards TINYINT NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT chk_user_settings_reduced_motion CHECK (reduced_motion IN (0, 1)),
  CONSTRAINT chk_user_settings_show_rewards CHECK (show_rewards IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='R1.5 display preferences; business reward and continuation facts remain elsewhere';
