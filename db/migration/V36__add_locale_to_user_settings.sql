-- V36__add_locale_to_user_settings.sql
ALTER TABLE user_settings
  ADD COLUMN locale VARCHAR(8) NOT NULL DEFAULT 'zh-CN' AFTER font_scale,
  ADD CONSTRAINT chk_user_settings_locale CHECK (locale IN ('zh-CN', 'en'));
