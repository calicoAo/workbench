-- V19__add_vnext_domain_semantics.sql
-- Freeze R1A execution identities and preserve all pre-vNext rows as explicit legacy data.

ALTER TABLE users
  ADD COLUMN timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai' COMMENT 'IANA timezone used as the default for new records' AFTER display_name;

ALTER TABLE tasks
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Optimistic concurrency version' AFTER progress_percent,
  ADD COLUMN completion_sequence INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Number of represented completion lifecycles' AFTER completed_at;

ALTER TABLE task_daily_assignments
  ADD COLUMN assignment_status TINYINT NOT NULL DEFAULT 0 COMMENT '0 accepted, 1 released' AFTER task_date,
  ADD COLUMN record_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai' COMMENT 'Timezone context of task_date' AFTER assignment_status,
  ADD COLUMN continuation_state TINYINT NOT NULL DEFAULT 0 COMMENT '0 legacy unresolved, 1 pending, 2 carried forward, 3 deferred, 4 dismissed, 5 rescheduled' AFTER sort_order,
  ADD COLUMN continuation_handled_at DATETIME NULL AFTER continuation_state,
  ADD COLUMN continuation_target_date DATE NULL AFTER continuation_handled_at,
  ADD COLUMN continuation_target_timezone VARCHAR(64) NULL AFTER continuation_target_date,
  ADD COLUMN continuation_target_assignment_id BIGINT UNSIGNED NULL AFTER continuation_target_timezone,
  ADD COLUMN continuation_target_schedule_id BIGINT UNSIGNED NULL AFTER continuation_target_assignment_id,
  ADD COLUMN continuation_reason VARCHAR(255) NULL AFTER continuation_target_schedule_id,
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Optimistic concurrency version' AFTER continuation_reason,
  ADD KEY idx_continuation_candidates (user_id, assignment_status, continuation_state, continuation_target_date, task_date),
  ADD KEY idx_continuation_target_assignment (continuation_target_assignment_id),
  ADD CONSTRAINT chk_assignment_status CHECK (assignment_status IN (0, 1)),
  ADD CONSTRAINT chk_assignment_continuation_state CHECK (continuation_state BETWEEN 0 AND 5),
  ADD CONSTRAINT chk_assignment_continuation_target CHECK (
    (continuation_state NOT IN (2, 3, 5)) OR
    (continuation_target_date IS NOT NULL AND continuation_target_timezone IS NOT NULL)
  );

ALTER TABLE timer_sessions
  ADD COLUMN session_model TINYINT NOT NULL DEFAULT 0 COMMENT '0 legacy, 1 vNext' AFTER task_id,
  ADD COLUMN record_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai' COMMENT 'Fixed IANA timezone for this session' AFTER session_model,
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Optimistic concurrency version' AFTER task_completed,
  MODIFY COLUMN duration_minutes INT NOT NULL DEFAULT 0 COMMENT 'Legacy duration or derived cache; never an additional vNext time fact',
  ADD CONSTRAINT chk_timer_session_model CHECK (session_model IN (0, 1));

CREATE TABLE timer_segments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  timer_session_id BIGINT UNSIGNED NOT NULL COMMENT 'Owning timer session',
  task_id BIGINT UNSIGNED NOT NULL COMMENT 'Task identity at occurrence',
  status TINYINT NOT NULL COMMENT '0 open, 1 closed, 2 voided',
  started_at DATETIME NOT NULL COMMENT 'Absolute start instant stored with UTC semantics',
  ended_at DATETIME NULL COMMENT 'Absolute end instant stored with UTC semantics',
  business_date DATE NOT NULL COMMENT 'Business date at segment start in record_timezone',
  record_timezone VARCHAR(64) NOT NULL COMMENT 'Fixed IANA timezone inherited from the session',
  project_id_at_occurrence BIGINT UNSIGNED NULL,
  project_attribution_status TINYINT NOT NULL COMMENT '0 unknown, 1 no project, 2 attributed',
  category_id_at_occurrence BIGINT UNSIGNED NULL,
  category_attribution_status TINYINT NOT NULL COMMENT '0 unknown, 1 uncategorized, 2 attributed',
  task_title_snapshot VARCHAR(200) NOT NULL,
  category_name_snapshot VARCHAR(64) NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Optimistic concurrency/correction version',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  open_session_id BIGINT UNSIGNED GENERATED ALWAYS AS (
    CASE WHEN status = 0 AND deleted_at IS NULL THEN timer_session_id ELSE NULL END
  ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uk_timer_segment_session_identity (id, timer_session_id),
  UNIQUE KEY uk_timer_segment_open_session (open_session_id),
  KEY idx_timer_segment_user_time (user_id, started_at, ended_at),
  KEY idx_timer_segment_session (timer_session_id, started_at),
  CONSTRAINT fk_timer_segment_session FOREIGN KEY (timer_session_id) REFERENCES timer_sessions (id),
  CONSTRAINT chk_timer_segment_status CHECK (status IN (0, 1, 2)),
  CONSTRAINT chk_timer_segment_interval CHECK (
    (status = 0 AND ended_at IS NULL) OR
    (status IN (1, 2) AND ended_at IS NOT NULL AND ended_at >= started_at)
  ),
  CONSTRAINT chk_timer_segment_project_attribution CHECK (
    (project_attribution_status IN (0, 1) AND project_id_at_occurrence IS NULL) OR
    (project_attribution_status = 2 AND project_id_at_occurrence IS NOT NULL)
  ),
  CONSTRAINT chk_timer_segment_category_attribution CHECK (
    (category_attribution_status IN (0, 1) AND category_id_at_occurrence IS NULL) OR
    (category_attribution_status = 2 AND category_id_at_occurrence IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Canonical vNext timer execution intervals';

ALTER TABLE schedules
  ADD COLUMN record_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai' COMMENT 'Timezone context of schedule_date' AFTER schedule_date,
  ADD COLUMN actual_started_at DATETIME NULL COMMENT 'Absolute start instant for ActualTime normalization' AFTER end_time,
  ADD COLUMN actual_ended_at DATETIME NULL COMMENT 'Absolute end instant for ActualTime normalization' AFTER actual_started_at,
  ADD COLUMN actual_time_class TINYINT NOT NULL DEFAULT 0 COMMENT '0 not actual, 1 manual actual, 2 legacy actual, 3 timer projection' AFTER source_id,
  ADD COLUMN timer_session_id BIGINT UNSIGNED NULL AFTER actual_time_class,
  ADD COLUMN timer_segment_id BIGINT UNSIGNED NULL AFTER timer_session_id,
  ADD COLUMN slice_date DATE NULL COMMENT 'Segment projection date in record_timezone' AFTER timer_segment_id,
  ADD COLUMN project_id_at_occurrence BIGINT UNSIGNED NULL AFTER slice_date,
  ADD COLUMN project_attribution_status TINYINT NOT NULL DEFAULT 0 COMMENT '0 unknown, 1 no project, 2 attributed' AFTER project_id_at_occurrence,
  ADD COLUMN category_id_at_occurrence BIGINT UNSIGNED NULL AFTER project_attribution_status,
  ADD COLUMN category_attribution_status TINYINT NOT NULL DEFAULT 0 COMMENT '0 unknown, 1 uncategorized, 2 attributed' AFTER category_id_at_occurrence,
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Optimistic concurrency version' AFTER category_attribution_status,
  ADD UNIQUE KEY uk_timer_segment_slice (user_id, timer_segment_id, slice_date),
  ADD KEY idx_schedule_actual_time (user_id, actual_time_class, schedule_date),
  ADD KEY idx_schedule_timer_session (timer_session_id),
  ADD CONSTRAINT fk_schedule_timer_segment FOREIGN KEY (timer_segment_id, timer_session_id)
    REFERENCES timer_segments (id, timer_session_id),
  ADD CONSTRAINT chk_schedule_actual_time_class CHECK (actual_time_class BETWEEN 0 AND 3),
  ADD CONSTRAINT chk_schedule_absolute_interval CHECK (
    (actual_time_class = 0 AND actual_started_at IS NULL AND actual_ended_at IS NULL) OR
    (actual_time_class IN (1, 2, 3) AND actual_started_at IS NOT NULL AND actual_ended_at IS NOT NULL AND actual_ended_at > actual_started_at)
  ),
  ADD CONSTRAINT chk_schedule_timer_identity CHECK (
    (timer_session_id IS NULL AND timer_segment_id IS NULL AND slice_date IS NULL) OR
    (timer_session_id IS NOT NULL AND timer_segment_id IS NOT NULL AND slice_date IS NOT NULL)
  ),
  ADD CONSTRAINT chk_schedule_timer_projection CHECK (
    actual_time_class <> 3 OR
    (kind = 1 AND source = 1 AND timer_session_id IS NOT NULL AND timer_segment_id IS NOT NULL AND slice_date = schedule_date)
  ),
  ADD CONSTRAINT chk_schedule_project_attribution CHECK (
    (project_attribution_status IN (0, 1) AND project_id_at_occurrence IS NULL) OR
    (project_attribution_status = 2 AND project_id_at_occurrence IS NOT NULL)
  ),
  ADD CONSTRAINT chk_schedule_category_attribution CHECK (
    (category_attribution_status IN (0, 1) AND category_id_at_occurrence IS NULL) OR
    (category_attribution_status = 2 AND category_id_at_occurrence IS NOT NULL)
  );

UPDATE schedules
SET actual_time_class = CASE WHEN kind = 1 THEN 2 ELSE 0 END,
    actual_started_at = CASE
      WHEN kind = 1 THEN TIMESTAMPADD(HOUR, -8, TIMESTAMP(schedule_date, start_time))
      ELSE NULL
    END,
    actual_ended_at = CASE
      WHEN kind = 1 AND end_time > start_time THEN TIMESTAMPADD(HOUR, -8, TIMESTAMP(schedule_date, end_time))
      WHEN kind = 1 THEN TIMESTAMPADD(HOUR, -8, TIMESTAMP(DATE_ADD(schedule_date, INTERVAL 1 DAY), end_time))
      ELSE NULL
    END;

ALTER TABLE journals
  ADD COLUMN record_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai' COMMENT 'Timezone context of journal_date' AFTER journal_date;

ALTER TABLE quick_notes
  ADD COLUMN record_timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Shanghai' COMMENT 'Timezone context of note_date' AFTER note_date;

CREATE TABLE task_completion_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  task_id BIGINT UNSIGNED NOT NULL,
  occurred_at DATETIME NOT NULL COMMENT 'Absolute completion instant stored with UTC semantics',
  record_timezone VARCHAR(64) NOT NULL,
  business_date DATE NOT NULL,
  lifecycle_version INT UNSIGNED NOT NULL,
  operation_id VARCHAR(64) NULL,
  source TINYINT NOT NULL COMMENT '0 legacy completion, 1 vNext command',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_completion_lifecycle (user_id, task_id, lifecycle_version),
  UNIQUE KEY uk_task_completion_operation (user_id, operation_id),
  KEY idx_task_completion_business_date (user_id, business_date, task_id),
  CONSTRAINT chk_task_completion_source CHECK (source IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Immutable Task completion history';

UPDATE tasks
SET completion_sequence = 1
WHERE status = 2 AND completed_at IS NOT NULL;

INSERT INTO task_completion_events (
  user_id, task_id, occurred_at, record_timezone, business_date,
  lifecycle_version, operation_id, source, created_at
)
SELECT
  user_id,
  id,
  TIMESTAMPADD(HOUR, -8, completed_at),
  'Asia/Shanghai',
  DATE(completed_at),
  1,
  NULL,
  0,
  CURRENT_TIMESTAMP
FROM tasks
WHERE status = 2 AND completed_at IS NOT NULL;

CREATE TABLE mutation_receipts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  operation_id VARCHAR(64) NOT NULL,
  command_type VARCHAR(64) NOT NULL,
  contract_version INT UNSIGNED NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  request_snapshot JSON NOT NULL,
  result_reference VARCHAR(255) NULL,
  result_metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_mutation_receipt_operation (user_id, operation_id),
  KEY idx_mutation_receipt_command (user_id, command_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Cross-domain mutation identity only; domain owners keep state machines';

CREATE TABLE user_execution_slots (
  user_id BIGINT UNSIGNED NOT NULL,
  active_session_id BIGINT UNSIGNED NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uk_execution_slot_active_session (active_session_id),
  CONSTRAINT fk_execution_slot_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_execution_slot_active_session FOREIGN KEY (active_session_id) REFERENCES timer_sessions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Per-user serialization anchor for execution commands';

INSERT INTO user_execution_slots (user_id, active_session_id, version, updated_at)
SELECT id, NULL, 1, CURRENT_TIMESTAMP
FROM users
WHERE deleted_at IS NULL;
