#!/usr/bin/env bash
# Maandelijkse data-refresh – draait LOKAAL op de pc (cron), niet in GitHub Actions.
# Haalt nieuwe data op, bouwt en controleert, laat Grok de diff beoordelen en
# zet bij goedkeuring een PR op die na groene checks gesquasht wordt. Nooit force-push.
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"  # cron heeft een kaal PATH
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Elke uitkomst naar het logboek (val terug op stderr als logboek.mjs faalt).
log() { node scripts/logboek.mjs "$1" || echo "LOGBOEK: $1" >&2; }
trap 'rc=$?; log "Data-refresh MISLUKT (exit $rc, regel $LINENO): ${BASH_COMMAND:0:150}"; exit $rc' ERR

# Noodrem
if ! bash scripts/stop-check.sh; then
  log "Data-refresh overgeslagen: STOP.md actief"
  exit 0
fi

# Niet starten met onafgemaakt werk in de werkmap (zou mee in de PR kunnen komen).
if ! git diff --quiet HEAD; then
  log "Data-refresh afgebroken: niet-gecommitte wijzigingen in de werkmap"
  exit 1
fi

ORIG="$(git branch --show-current)"
TAK="data/refresh-$(date +%F)"
git fetch origin
git switch --no-track -c "$TAK" origin/main

# Data ophalen, controleren, beoordelen en aanbieders schrijven
npm ci
node scripts/outscraper-proefrun.mjs
KAND="$(ls -t data/ruw/kandidaten-*.json | head -n 1)"
node scripts/controleer-websites.mjs "$KAND"
bash scripts/beoordeel-kinderaanbod.sh
BEO="$(ls -t data/ruw/beoordeling-*.jsonl | head -n 1)"
node scripts/maak-aanbieders.mjs "$KAND" "$BEO" --schrijf
npm run build
npm run check:data
npm run check:links

# Alleen data meenemen (src/data); overige bestanden blijven buiten de PR.
git add -A src/data
if git diff --cached --quiet; then
  log "Data-refresh: geen wijzigingen"
  git switch "$ORIG" && git branch -D "$TAK"
  exit 0
fi

# Review door Grok
VOOR=$(git ls-tree --name-only origin/main src/data/aanbieders/ | grep -c '\.json$' || true)
NA=$(git ls-files src/data/aanbieders/ | grep -c '\.json$' || true)
STAT="$(git diff --cached --stat origin/main)"
DIFF="$(git diff --cached origin/main | sed -n '1,300p')"   # sed leest alles: geen SIGPIPE

# Harde grens vooraf: meer dan 20% minder aanbieders = direct afkeuren.
if [ "$VOOR" -gt 0 ] && [ $((NA * 5)) -lt $((VOOR * 4)) ]; then
  ANTWOORD="AFGEKEURD: aantal aanbieders daalt van $VOOR naar $NA (>20%)"
else
  VRAAG="Beoordeel deze data-refresh van een directory met kinderkookfeestjes. Antwoord ALLEEN met 'GOEDGEKEURD' of 'AFGEKEURD: <reden>'. Criteria: 1) geen verzonnen data; 2) elke aanbieder heeft bronnen (URL) en controledatum; 3) geen privégegevens van particulieren; 4) geen massaal verdwenen aanbieders (meer dan 20% minder). Aantal aanbieders: voor $VOOR, na $NA."
  ANTWOORD="$(printf '%s\n\n%s\n' "$STAT" "$DIFF" | "$HOME/beheer/bin/vraag" grok "$VRAAG")"
fi

if grep -q 'AFGEKEURD' <<<"$ANTWOORD" || ! grep -q 'GOEDGEKEURD' <<<"$ANTWOORD"; then
  # Lokaal bewaren voor inspectie door Mo, niet pushen.
  git commit -q -m "Data-refresh $(date +%F) (AFGEKEURD, niet gepusht)"
  git switch "$ORIG"
  log "Data-refresh afgekeurd (tak $TAK lokaal bewaard): $(tr '\n' ' ' <<<"$ANTWOORD" | cut -c1-300)"
  exit 0
fi

# Goedgekeurd: commit, push (nooit force), PR, wachten op checks, squash-merge
git commit -q -m "Data-refresh $(date +%F)"
git push -u origin "$TAK"
gh pr create --base main --head "$TAK" --title "Data-refresh $(date +%F)" \
  --body "Automatische maandelijkse data-refresh. Aanbieders: $VOOR -> $NA. Review (Grok): GOEDGEKEURD."
sleep 20   # checks de tijd geven om te registreren
if ! gh pr checks "$TAK" --watch; then
  log "Data-refresh: checks rood op PR $TAK, niet gemerged"
  exit 1
fi
gh pr merge "$TAK" --squash --delete-branch
log "Data-refresh gemerged: $TAK (aanbieders $VOOR -> $NA)"
