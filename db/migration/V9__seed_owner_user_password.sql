INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at)
VALUES (
  1,
  'sip',
  'sip',
  'scrypt:XKp5y0JgOgj0fROMWhVlZQ:5ilcho9Cl2ivjkv_9tgxXh6U1rrRRkTknQssWWo8zJ5fTnaIfXhrUF-C6TQq4DKVgtL3fnZTcGsB7K_sPaidTA',
  NOW(),
  NOW()
)
ON DUPLICATE KEY UPDATE
  username = IF(username = 'local', VALUES(username), username),
  display_name = IF(display_name = 'Local User', VALUES(display_name), display_name),
  password_hash = IFNULL(password_hash, VALUES(password_hash)),
  updated_at = NOW();
