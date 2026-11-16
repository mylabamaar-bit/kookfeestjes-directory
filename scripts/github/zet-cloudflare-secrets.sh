#!/bin/bash
# Zet de Cloudflare-gegevens als GitHub Secrets (onzichtbare invoer, niets op schijf).
set -euo pipefail
REPO="mylabamaar-bit/kookfeestjes-directory"
read -rp  "Cloudflare Account-ID (staat rechts op de overzichtspagina van je account): " ACC
read -rsp "Cloudflare API-token (je ziet niets): " TOK; echo
[ ${#ACC} -ge 20 ] && [ ${#TOK} -ge 30 ] || { echo "Dat lijkt niet te kloppen. Niets opgeslagen."; exit 1; }
printf '%s' "$ACC" | gh secret set CLOUDFLARE_ACCOUNT_ID -R "$REPO"
printf '%s' "$TOK" | gh secret set CLOUDFLARE_API_TOKEN -R "$REPO"
echo "Opgeslagen in GitHub Secrets van $REPO. Claude start daarna de eerste deploy."
