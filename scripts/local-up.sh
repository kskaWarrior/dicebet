#!/usr/bin/env bash
# Sobe o DiceBet inteiro na máquina, sem nenhum serviço cloud e sem o CLI
# Supabase (Fases M-A/M-B, ADR-0001):
#
#   1. gera `.env` na raiz na primeira vez (AUTH_JWT_SECRET aleatório);
#   2. `docker compose up --build -d` — postgres, gotrue, migrate, api, web.
#
# Uso: scripts/local-up.sh
#   WEB_PORT=3002 API_PORT=8082 scripts/local-up.sh   quando 3000/8080 já estiverem ocupadas
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  secret="$(node -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))')"
  cat >.env <<EOF
# Gerado por scripts/local-up.sh; ver .env.example.
AUTH_JWT_SECRET=$secret
WEB_PORT=${WEB_PORT:-3000}
API_PORT=${API_PORT:-8080}
EOF
else
  [[ -n "${WEB_PORT:-}" ]] && sed -i "s/^WEB_PORT=.*/WEB_PORT=$WEB_PORT/" .env
  [[ -n "${API_PORT:-}" ]] && sed -i "s/^API_PORT=.*/API_PORT=$API_PORT/" .env
fi
web_port="$(sed -n 's/^WEB_PORT=//p' .env)"
api_port="$(sed -n 's/^API_PORT=//p' .env)"

docker compose up --build -d --remove-orphans

echo
echo "web  http://localhost:${web_port:-3000}"
echo "api  http://localhost:${api_port:-8080}/health"
