-- V6__update_default_category_colors.sql
-- Description: make frequent default categories easier to distinguish
-- Date: 2026-07-19

UPDATE task_categories
SET color = '#5B8DEF', updated_at = CURRENT_TIMESTAMP
WHERE LOWER(name) IN ('coding', 'programming') AND deleted_at IS NULL;

UPDATE task_categories
SET color = '#FF8FA3', updated_at = CURRENT_TIMESTAMP
WHERE LOWER(name) = 'life' AND deleted_at IS NULL;
