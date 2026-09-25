-- V35__add_font_scale_to_user_settings.sql
ALTER TABLE user_settings
  ADD COLUMN font_scale TINYINT NOT NULL DEFAULT 100 AFTER show_rewards,
  ADD CONSTRAINT chk_user_settings_font_scale CHECK (font_scale IN (90, 100, 110));
