-- V14__add_task_category_dimensions.sql
-- Description: group task categories into ability dimensions

ALTER TABLE task_categories
  ADD COLUMN dimension_key VARCHAR(32) NOT NULL DEFAULT 'life' COMMENT 'Ability dimension key' AFTER icon;

UPDATE task_categories
SET dimension_key = CASE
    WHEN LOWER(name) = 'coding' THEN 'career'
    WHEN name = '产品' THEN 'career'
    WHEN name IN ('✏️') THEN 'creative'
    WHEN name IN ('🎨', '绘画') THEN 'creative'
    WHEN name IN ('📚', '股票', 'Stock Review', '韩语', 'AI') THEN 'learning'
    WHEN name = '运动' THEN 'body'
    WHEN name = '🎮' THEN 'leisure'
    WHEN name = '睡觉' THEN 'foundation'
    WHEN name = 'Life' THEN 'life'
    ELSE 'life'
  END;
