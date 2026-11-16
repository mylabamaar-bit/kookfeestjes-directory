#!/bin/bash
# Vraagt de Outscraper-API-key (onzichtbaar) en zet hem in .env (chmod 600). Nooit committen.
set -euo pipefail
MAP="$(cd "$(dirname "$0")/.." && pwd)"
ENV="$MAP/.env"
read -rsp "Plak de Outscraper-API-key en druk op Enter (je ziet niets): " KEY; echo
KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
[ ${#KEY} -ge 20 ] || { echo "Dat lijkt geen geldige key (te kort). Niets opgeslagen."; exit 1; }
touch "$ENV"; chmod 600 "$ENV"
grep -v '^OUTSCRAPER_API_KEY=' "$ENV" > "$ENV.nieuw" || true
printf 'OUTSCRAPER_API_KEY=%s\n' "$KEY" >> "$ENV.nieuw"
chmod 600 "$ENV.nieuw"; mv "$ENV.nieuw" "$ENV"
echo "Opgeslagen in $ENV (alleen leesbaar voor $(whoami)). Laatste 4 tekens: ${KEY: -4}"
