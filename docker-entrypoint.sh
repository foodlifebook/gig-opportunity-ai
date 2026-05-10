#!/bin/bash
# docker-entrypoint.sh
# Bootstraps PostgreSQL, writes backend env, then hands off to supervisord.
set -e

PG_VERSION=15
PG_DATA="/var/lib/postgresql/${PG_VERSION}/main"
PG_CONF="/etc/postgresql/${PG_VERSION}/main"
PG_BIN="/usr/lib/postgresql/${PG_VERSION}/bin"
DB_NAME="${POSTGRES_DB:-gigopportunity}"

echo "=========================================="
echo "  GigOpportunity AI — Starting up"
echo "=========================================="

# ── Step 1: Create the PostgreSQL cluster if first boot ─────────
if [ ! -f "${PG_DATA}/PG_VERSION" ]; then
    echo "--> First boot: initializing PostgreSQL cluster..."
    pg_createcluster ${PG_VERSION} main --start-conf=manual
fi

# ── Step 2: Configure PostgreSQL before startup ────────────────
# Make postgres listen on localhost (written to conf.d so it survives upgrades)
mkdir -p "${PG_CONF}/conf.d"
echo "listen_addresses = 'localhost'" > "${PG_CONF}/conf.d/gigopportunity.conf"

# ── Step 2b: Configure pg_hba.conf for trust auth on localhost ──
PG_HBA="${PG_CONF}/pg_hba.conf"
# Remove any existing 127.0.0.1 and ::1 entries (can cause conflicts)
sed -i '/^host.*127\.0\.0\.1/d' "${PG_HBA}" 2>/dev/null || true
sed -i '/^host.*::1/d' "${PG_HBA}" 2>/dev/null || true
# Add trust authentication for localhost connections
echo "host  all  all  127.0.0.1/32  trust" >> "${PG_HBA}"
echo "host  all  all  ::1/128       trust" >> "${PG_HBA}"
echo "--> PostgreSQL configured for localhost trust authentication"

# ── Step 3: Start postgres briefly to create the database ───────
echo "--> Starting PostgreSQL for initialization..."
su -s /bin/bash postgres -c \
    "${PG_BIN}/pg_ctl start -D ${PG_DATA} \
    -o \"-c config_file=${PG_CONF}/postgresql.conf -p 5434\" \
     -w -t 30" 2>&1 || true

# Create database (idempotent)
echo "--> Ensuring database '${DB_NAME}' exists..."
su -s /bin/bash postgres -c \
    "psql -U postgres -p 5434 -tc \
     \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\" \
     | grep -q 1 \
     || psql -U postgres -p 5434 -c \"CREATE DATABASE \\\"${DB_NAME}\\\";\"" 2>&1 || true

echo "--> Stopping PostgreSQL (supervisor will manage it)..."
su -s /bin/bash postgres -c \
    "${PG_BIN}/pg_ctl stop -D ${PG_DATA} -m fast -w" 2>&1 || true

# ── Step 4: Write the backend .env with all secrets ─────────────
echo "--> Writing backend environment..."
cat > /app/backend/.env << ENV_EOF
PORT=4001
NODE_ENV=production
GEMINI_API_KEY=${GEMINI_API_KEY:-}
BIGMODEL_API_KEY=${BIGMODEL_API_KEY:-}
DATABASE_URL=postgresql://postgres:@127.0.0.1:5434/${DB_NAME}?sslmode=disable
FRONTEND_URL=http://localhost:3001
ENV_EOF

# Also set environment for supervisord backend process
export DATABASE_URL=postgresql://postgres:@127.0.0.1:5434/${DB_NAME}?sslmode=disable

# ── Step 5: Hand off to supervisord (manages all 3 processes) ───
echo "=========================================="
echo "  Launching PostgreSQL + Backend + Nginx"
echo "  App available on  http://localhost:3001"
echo "=========================================="
exec /usr/bin/supervisord -n -c /etc/supervisor/supervisord.conf
