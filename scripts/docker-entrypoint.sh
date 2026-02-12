#!/usr/bin/env sh
set -eu

PERSIST_DIR="${PERSIST_DIR:-/data}"
PORT="${PORT:-8787}"
HOST="${HOST:-0.0.0.0}"
DB_NAME="${DB_NAME:-picoshare_db}"

mkdir -p "${PERSIST_DIR}"

if [ ! -f "wrangler.toml" ]; then
  cp wrangler.toml.example wrangler.toml
fi

if [ -n "${PS_SHARED_SECRET:-}" ]; then
  printf "PS_SHARED_SECRET=%s\n" "${PS_SHARED_SECRET}" > .dev.vars
elif [ ! -f ".dev.vars" ] && [ -f ".dev.vars.example" ]; then
  cp .dev.vars.example .dev.vars
fi

echo "Initializing local D1 schema..."
npx wrangler d1 execute "${DB_NAME}" \
  --local \
  --persist-to "${PERSIST_DIR}" \
  --file ./schema.sql \
  --yes

echo "Starting worker on ${HOST}:${PORT} with persistence at ${PERSIST_DIR}..."
exec npx wrangler dev \
  --local \
  --host "${HOST}" \
  --port "${PORT}" \
  --persist-to "${PERSIST_DIR}"
