#!/bin/bash
# Draait elk uur via crontab (ook handmatig aan begin/eind van een sessie):
#  1. noodstop (STOP.md) spiegelen van Drive naar lokaal en doorgeven aan GitHub (variabele KILL_SWITCH)
#  2. BERICHTEN.md omlaag halen en samenvoegen (wijzigingen van Exia én lokaal blijven bewaard)
#  3. GitHub Actions-uitkomsten in het Logboek zetten (als gh werkt)
#  4. één keer per dag een back-up van de data (ook bij STOP: back-up is beschermend)
#  5. BERICHTEN.md, STATUS.md en TAKEN.md omhoog (rclone --update: nooit een nieuwere versie overschrijven)
# Gebruik: scripts/automatisch.sh [--alleen-sync]
export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"  # cron heeft een kaal PATH
set -u
MAP="$HOME/projects/kookfeestjes"
DRIVE="gdrive:Project Kookfeestjes Directory"
LOG="$MAP/logs/sync.log"
SYNC="$MAP/.sync"
RCLONE=/usr/bin/rclone
cd "$MAP" || exit 1
mkdir -p "$SYNC" logs backups
exec >> "$LOG" 2>&1
echo "=== $(date '+%F %T') ==="
logboek() { node "$MAP/scripts/logboek.mjs" "$1"; echo "logboek: $1"; }
fout=0

# 1. Noodstop. STOP.md van Drive komt lokaal; verdwijnt hij van Drive, dan ook lokaal (alleen als hij van Drive kwam).
lijst=$($RCLONE lsf "$DRIVE" --max-depth 1 --include "/STOP.md"); drive_ok=$?
if [ $drive_ok -eq 0 ] && grep -q STOP.md <<<"$lijst"; then
  $RCLONE copy --update "$DRIVE" "$MAP" --include "/STOP.md" && touch "$SYNC/stop-van-drive"
elif [ $drive_ok -eq 0 ] && [ -f "$SYNC/stop-van-drive" ]; then
  rm -f "$MAP/STOP.md" "$SYNC/stop-van-drive"
fi
if [ -f STOP.md ]; then stop=1; else stop=0; fi
vorige=$(cat "$SYNC/stop-status" 2>/dev/null || echo 0)
if [ "$stop" != "$vorige" ]; then
  if [ "$stop" = 1 ]; then logboek "STOP.md gevonden: alle automatische acties (merge, deploy, refresh, scraping) gestopt."
  else logboek "STOP.md weg: automatische acties weer toegestaan."; fi
  echo "$stop" > "$SYNC/stop-status"
fi
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
  heeft_gh=1
  [ "$(cat "$SYNC/stop-gh" 2>/dev/null)" = "$stop" ] || { gh variable set KILL_SWITCH --body "$stop" && echo "$stop" > "$SYNC/stop-gh"; }
else
  heeft_gh=0
fi

# 2. BERICHTEN.md samenvoegen: base = laatst gesynchroniseerde versie.
if $RCLONE copyto "$DRIVE/BERICHTEN.md" "$SYNC/BERICHTEN.drive" 2>/dev/null; then
  if [ ! -f BERICHTEN.md ]; then cp "$SYNC/BERICHTEN.drive" BERICHTEN.md
  elif [ -f "$SYNC/BERICHTEN.base" ]; then
    if cmp -s BERICHTEN.md "$SYNC/BERICHTEN.base"; then cp "$SYNC/BERICHTEN.drive" BERICHTEN.md
    elif ! cmp -s "$SYNC/BERICHTEN.drive" "$SYNC/BERICHTEN.base"; then
      git merge-file --union BERICHTEN.md "$SYNC/BERICHTEN.base" "$SYNC/BERICHTEN.drive"
      echo "BERICHTEN.md: wijzigingen van beide kanten samengevoegd"
    fi
  fi
fi

# 3. Uitkomsten van GitHub Actions (merge/deploy/rollback/health) in het Logboek.
if [ "$heeft_gh" = 1 ]; then
  gh run list --limit 30 --json databaseId,workflowName,conclusion,status,displayTitle,createdAt,url 2>/dev/null |
    jq -r '.[] | select(.status=="completed") | "\(.databaseId)\t\(.workflowName): \(.conclusion) (\(.displayTitle), \(.createdAt)) \(.url)"' |
    while IFS=$'\t' read -r id tekst; do
      grep -qx "$id" "$SYNC/gezien-runs" 2>/dev/null && continue
      logboek "GitHub Actions – $tekst"; echo "$id" >> "$SYNC/gezien-runs"
    done
fi

# 4. Dagelijkse back-up van de data (lokaal 30 dagen, op Drive blijft alles staan).
vandaag=$(date +%F)
if [ ! -f "backups/data-$vandaag.tar.gz" ]; then
  if tar -czf "backups/data-$vandaag.tar.gz" src/data data/ruw 2>/dev/null &&
     $RCLONE copy "backups/data-$vandaag.tar.gz" "$DRIVE/backups/" &&
     $RCLONE lsf "$DRIVE/backups/" | grep -qx "data-$vandaag.tar.gz"; then
    logboek "Back-up data gemaakt: backups/data-$vandaag.tar.gz (lokaal + Drive)."
  else
    logboek "Back-up data MISLUKT ($vandaag)."; fout=1
  fi
  find backups -name 'data-*.tar.gz' -mtime +30 -delete
fi

# 5. Omhoog met --update.
if $RCLONE copy --update "$MAP" "$DRIVE" --max-depth 1 \
     --include "/BERICHTEN.md" --include "/STATUS.md" --include "/TAKEN.md" -v; then
  cp BERICHTEN.md "$SYNC/BERICHTEN.base"
  echo "sync OK"
else
  echo "sync MISLUKT"; fout=1
fi
exit $fout
