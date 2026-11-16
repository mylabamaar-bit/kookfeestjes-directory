#!/usr/bin/env bash
# Health-check: controleert <basis-url>/ en <basis-url>/amsterdam/ op HTTP 200,
# body > 800 bytes, bevat "<h1" en "</html>". 3 pogingen, 15 s ertussen.
# Optioneel: VERCEL_AUTOMATION_BYPASS_SECRET -> header x-vercel-protection-bypass.
# Gebruik: bash scripts/deploy/health-check.sh https://voorbeeld.vercel.app
set -euo pipefail

BASIS="${1:?Gebruik: health-check.sh <basis-url>}"
case "$BASIS" in http://*|https://*) ;; *) BASIS="https://$BASIS" ;; esac
BASIS="${BASIS%/}"
PADEN=("/" "/amsterdam/")
POGINGEN=3
WACHT=15

HEADERS=()
if [ -n "${VERCEL_AUTOMATION_BYPASS_SECRET:-}" ]; then
  HEADERS=(-H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET")
fi

BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

# Controleer één URL; geeft 0 bij succes, anders 1 (met reden).
controleer() {
  local url="$1" code grootte
  code=$(curl -sS -L --max-time 30 -o "$BODY" -w '%{http_code}' "${HEADERS[@]}" "$url" 2>/dev/null) || code="000"
  grootte=$(wc -c < "$BODY" | tr -d ' ')
  if [ "$code" != "200" ]; then echo "  FOUT  $url -> HTTP $code"; return 1; fi
  if [ "$grootte" -le 800 ]; then echo "  FOUT  $url -> body te klein ($grootte bytes)"; return 1; fi
  if ! grep -q '</html>' "$BODY"; then echo "  FOUT  $url -> geen </html> in body"; return 1; fi
  if ! grep -q "<h1" "$BODY"; then echo "  FOUT  $url -> geen <h1> (lege pagina?)"; return 1; fi
  echo "  OK    $url (HTTP 200, $grootte bytes)"
}

for ((poging = 1; poging <= POGINGEN; poging++)); do
  echo "Health-check $BASIS – poging $poging/$POGINGEN"
  alles_ok=1
  for pad in "${PADEN[@]}"; do
    controleer "$BASIS$pad" || alles_ok=0
  done
  if [ "$alles_ok" = 1 ]; then
    echo "Health-check GESLAAGD voor $BASIS"
    exit 0
  fi
  [ "$poging" -lt "$POGINGEN" ] && { echo "Opnieuw over $WACHT s..."; sleep "$WACHT"; }
done

echo "Health-check MISLUKT voor $BASIS na $POGINGEN pogingen" >&2
exit 1
