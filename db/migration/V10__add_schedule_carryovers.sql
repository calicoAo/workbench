-- V10__add_schedule_carryovers.sql
-- Description: remember handled planned schedule carryovers
-- Date: 2026-07-19

CREATE TABLE schedule_carryovers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Primary key',
  user_id BIGINT UNSIGNED NOT NULL COMMENT 'User id',
  from_schedule_id BIGINT UNSIGNED NOT NULL COMMENT 'Previous day planned schedule id',
  carry_date DATE NOT NULL COMMENT 'Carryover target date',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Created time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_from_schedule_date (user_id, from_schedule_id, carry_date),
  KEY idx_user_carry_date (user_id, carry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Handled schedule carryovers';
