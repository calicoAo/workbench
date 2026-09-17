#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

set -a
. deploy/.env
set +a

for file in $(find db/migration -name 'V*.sql' | sort -V); do
  echo "Applying $file"
  docker exec -i -e MYSQL_PWD="$MYSQL_PASSWORD" personal-workbench-mysql \
    mysql --default-character-set=utf8mb4 -uworkbench personal_workbench < "$file"
done

