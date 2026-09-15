#!/usr/bin/env bash
# Sobe o DiceBet inteiro na máquina sobre o banco único da plataforma (rollout RGS,
# docs/adr/0002-carteira-de-rgs.md):
#
#   1. sobe o compose do repo `rgs` (postgres 57332 + gotrue 57331), se ainda não estiver;
#   2. copia o AUTH_JWT_SECRET do `.env` do rgs para o `.env` daqui (o GoTrue é o de lá);
#   3. `docker compose up --build -d` — migrate (rgs + dicebet), api, web.
#
# Uso: scripts/local-up.sh
#   RGS_DIR=../rgs (padrão)   WEB_PORT=3001 API_PORT=8081 quando 3000/8080 já estiverem ocupadas
set -euo pipefail
cd "$(dirname "$0")/.."
RGS_DIR="${RGS_DIR:-../rgs}"

[[ -f "$RGS_DIR/docker-compose.yml" ]] || { echo "repo rgs não encontrado em $RGS_DIR (RGS_DIR=...)"; exit 1; }
"$RGS_DIR/scripts/local-up.sh" >/dev/null
secret="$(sed -n 's/^AUTH_JWT_SECRET=//p' "$RGS_DIR/.env")"

if [[ ! -f .env ]]; then
  cat >.env <<ENV
# Gerado por scripts/local-up.sh; ver .env.example. O segredo é o do GoTrue do rgs.
AUTH_JWT_SECRET=$secret
WEB_PORT=${WEB_PORT:-3000}
API_PORT=${API_PORT:-8080}
ENV
else
  sed -i "s/^AUTH_JWT_SECRET=.*/AUTH_JWT_SECRET=$secret/" .env
  # .env escrito à mão pode não ter as linhas de porta: garante antes de trocar.
  grep -q '^WEB_PORT=' .env || echo "WEB_PORT=3000" >>.env
  grep -q '^API_PORT=' .env || echo "API_PORT=8080" >>.env
  [[ -n "${WEB_PORT:-}" ]] && sed -i "s/^WEB_PORT=.*/WEB_PORT=$WEB_PORT/" .env
  [[ -n "${API_PORT:-}" ]] && sed -i "s/^API_PORT=.*/API_PORT=$API_PORT/" .env
fi
web_port="$(sed -n 's/^WEB_PORT=//p' .env)"
api_port="$(sed -n 's/^API_PORT=//p' .env)"

docker compose up --build -d --remove-orphans

echo
echo "web  http://localhost:${web_port:-3000}"
echo "api  http://localhost:${api_port:-8080}/health"
