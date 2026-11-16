#!/bin/bash
# Kopieert alleen STATUS.md en TAKEN.md naar Google Drive (voor Exia). Draait elk uur via crontab.
MAP="$HOME/projects/kookfeestjes"
LOG="$MAP/logs/sync.log"
mkdir -p "$MAP/logs"
{
  echo "=== $(date '+%F %T') ==="
  if /usr/bin/rclone copy "$MAP" "gdrive:Project Kookfeestjes Directory" \
       --include "/STATUS.md" --include "/TAKEN.md" --max-depth 1 -v 2>&1; then
    echo "OK"
  else
    echo "MISLUKT"
  fi
} >> "$LOG"
