#!/bin/sh
set -e
if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  node /migrate/migrate.mjs
fi
exec node server.js
