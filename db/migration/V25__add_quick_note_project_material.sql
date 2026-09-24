ALTER TABLE quick_notes
  ADD COLUMN project_id BIGINT UNSIGNED NULL AFTER tag,
  ADD KEY idx_quick_note_project (user_id, project_id, deleted_at, note_date),
  ADD CONSTRAINT fk_quick_note_project FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE SET NULL;
