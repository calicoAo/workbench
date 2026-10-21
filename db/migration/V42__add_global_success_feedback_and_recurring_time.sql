ALTER TABLE user_settings
  ADD COLUMN show_success_feedback TINYINT NOT NULL DEFAULT 1 AFTER show_rewards,
  ADD CONSTRAINT chk_user_settings_success_feedback CHECK (show_success_feedback IN (0, 1));

ALTER TABLE finance_recurring_templates
  ADD COLUMN scheduled_time CHAR(5) NOT NULL DEFAULT '09:00' AFTER schedule_value,
  ADD CONSTRAINT chk_finance_recurring_template_time CHECK (scheduled_time REGEXP '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$');

ALTER TABLE finance_recurring_occurrences
  ADD COLUMN scheduled_time_snapshot CHAR(5) NOT NULL DEFAULT '09:00' AFTER scheduled_date,
  ADD CONSTRAINT chk_finance_recurring_occurrence_time CHECK (scheduled_time_snapshot REGEXP '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$');
