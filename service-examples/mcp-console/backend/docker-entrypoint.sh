#!/bin/sh
set -e

PGDATA=/var/lib/postgresql/data
POSTGRES_USER="${POSTGRES_USER:-mcp_console}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-mcp_console}"
POSTGRES_DATABASE="${POSTGRES_DATABASE:-mcp_console}"

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "Initializing Postgres data directory..."
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  su-exec postgres initdb -D "$PGDATA" >/dev/null
fi

chown -R postgres:postgres "$PGDATA"

echo "Starting Postgres..."
su-exec postgres pg_ctl -D "$PGDATA" -l /tmp/postgres.log -w start

su-exec postgres psql -v ON_ERROR_STOP=1 -tc \
  "SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'" | grep -q 1 || \
  su-exec postgres psql -v ON_ERROR_STOP=1 -c \
    "CREATE ROLE \"${POSTGRES_USER}\" LOGIN PASSWORD '${POSTGRES_PASSWORD}'"

su-exec postgres psql -v ON_ERROR_STOP=1 -tc \
  "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DATABASE}'" | grep -q 1 || \
  su-exec postgres createdb -O "${POSTGRES_USER}" "${POSTGRES_DATABASE}"

echo "Running migrations..."
POSTGRES_HOST=localhost POSTGRES_PORT=5432 npm run migration:run

echo "Starting backend..."
exec node dist/main.js
