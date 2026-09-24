#!/usr/bin/env sh
set -eu

release_sha=${1:?release SHA is required}
release=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
current=/opt/personal-workbench
previous=/opt/personal-workbench.previous
compose="docker compose -p deploy -f deploy/docker-compose.yml"

test -f "$release/deploy/docker-compose.yml"
test -f "$current/deploy/.env"
cp "$current/deploy/.env" "$release/deploy/.env"
chmod 600 "$release/deploy/.env"
cd "$release"

$compose up -d mysql
i=0
while [ "$i" -lt 60 ]; do
  if docker inspect --format '{{.State.Health.Status}}' personal-workbench-mysql 2>/dev/null | grep -qx healthy; then break; fi
  i=$((i + 1))
  sleep 2
done
test "$(docker inspect --format '{{.State.Health.Status}}' personal-workbench-mysql)" = healthy

old_api_image=$(docker inspect --format '{{.Image}}' personal-workbench-api 2>/dev/null || true)
old_web_image=$(docker inspect --format '{{.Image}}' personal-workbench-web 2>/dev/null || true)
$compose build --parallel api web

set -a
. deploy/.env
set +a
mkdir -p /opt/personal-workbench-backups
backup="/opt/personal-workbench-backups/personal_workbench-$(date -u +%Y%m%dT%H%M%SZ)-$release_sha.sql.gz"
docker exec -e MYSQL_PWD="$MYSQL_PASSWORD" personal-workbench-mysql \
  mysqldump --single-transaction --no-tablespaces -uworkbench personal_workbench | gzip > "$backup"
test -s "$backup"
sh deploy/migrate.sh

rollback_services() {
  status=$?
  if [ "$status" -ne 0 ] && [ -n "$old_api_image" ] && [ -n "$old_web_image" ]; then
    docker tag "$old_api_image" deploy-api:latest
    docker tag "$old_web_image" deploy-web:latest
    $compose up -d --no-build api web
  fi
  exit "$status"
}
trap rollback_services EXIT INT TERM
$compose up -d --no-build api web
i=0
while [ "$i" -lt 30 ]; do
  if curl --fail --silent --show-error http://127.0.0.1:8080/api/health >/dev/null; then break; fi
  i=$((i + 1))
  sleep 2
done
curl --fail --silent --show-error http://127.0.0.1:8080/api/health
i=0
while [ "$i" -lt 5 ]; do
  if curl --fail --silent --show-error https://calicovo.icu/api/health >/dev/null; then
    public_health_ok=1
    break
  fi
  i=$((i + 1))
  sleep 2
done
test "${public_health_ok:-0}" = 1
trap - EXIT INT TERM

rm -rf "$previous"
mv "$current" "$previous"
mv "$release" "$current"
