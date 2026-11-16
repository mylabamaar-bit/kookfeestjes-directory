#!/usr/bin/env bash
# Noodrem: faalt (exit 1) als STOP.md in de projectroot staat of KILL_SWITCH=1.
# Gebruik: bash scripts/stop-check.sh   (in Actions: KILL_SWITCH=${{ vars.KILL_SWITCH }})
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ -f "$ROOT/STOP.md" ]; then
  echo "STOP actief: STOP.md bestaat in de projectroot." >&2
  exit 1
fi
if [ "${KILL_SWITCH:-}" = "1" ]; then
  echo "STOP actief: KILL_SWITCH=1." >&2
  exit 1
fi
echo "Geen STOP actief."
