#!/bin/sh
set -e

echo "[entrypoint] TDP Gestión — aplicando migraciones y arrancando"
node scripts/migrate.mjs
exec node server.js
