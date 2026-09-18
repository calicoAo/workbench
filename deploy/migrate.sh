#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

set -a
. deploy/.env
set +a

docker compose -p deploy -f deploy/docker-compose.yml --profile tools run --rm migrate
