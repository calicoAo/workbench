ALTER TABLE quick_notes
  ADD COLUMN archived_at DATETIME NULL AFTER tag,
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1 AFTER archived_at,
  ADD INDEX idx_quick_notes_user_state_created (user_id, deleted_at, archived_at, created_at, id),
  ADD INDEX idx_quick_notes_user_tag_created (user_id, tag, created_at, id),
  ADD INDEX idx_quick_notes_user_note_date_created (user_id, note_date, created_at, id);
