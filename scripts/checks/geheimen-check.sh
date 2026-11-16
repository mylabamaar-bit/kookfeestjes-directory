#!/bin/bash
# Controle vóór elke push naar de openbare repo: geen geheimen, geen ruwe data, geen privé-e-mail
# in de bestanden of de geschiedenis van de opgegeven tak(ken). Exit 1 bij een vondst.
# Gebruik: scripts/checks/geheimen-check.sh [refs...]   (standaard: HEAD)
set -uo pipefail
cd "$(dirname "$0")/../.."
REFS=("${@:-HEAD}")
VONDST=$(mktemp); trap 'rm -f "$VONDST"' EXIT
meld() { echo "  ✗ $1"; echo x >> "$VONDST"; }

echo "Verboden bestanden in de geschiedenis..."
git log --format= --name-only "${REFS[@]}" | sort -u |
  grep -E '(^|/)\.env($|\.)|^data/ruw/|^logs/|^backups/|^\.sync/|(^|/)STOP\.md$|\.pem$|\.key$|id_rsa|(^|/)geheim/' |
  grep -v '^\.env\.example$' | while read -r f; do meld "bestand in geschiedenis: $f"; done

echo "Sleutels en tokens in de inhoud..."
PATRONEN='-----BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16}|(API_KEY|API_TOKEN|SECRET|PASSWORD)[A-Z_]*=[^[:space:]$"{]{12,}'
git log -p --format= "${REFS[@]}" | grep -nE "^\+.*($PATRONEN)" | head -5 | while read -r r; do meld "mogelijk geheim: ${r:0:90}"; done

# Echte waarden uit .env (zonder ze te tonen)
if [ -f .env ]; then
  while IFS='=' read -r naam waarde; do
    [ -n "${waarde:-}" ] && [ ${#waarde} -ge 8 ] || continue
    git log -p --format= "${REFS[@]}" | grep -qF -- "$waarde" && meld "waarde van $naam uit .env staat in git"
  done < <(grep -E '^[A-Z_]+=' .env)
fi

echo "Privé-e-mailadressen (auteurs en inhoud)..."
git log --format='%ae%n%ce' "${REFS[@]}" | sort -u | grep -viE 'noreply|users\.noreply\.github\.com' |
  while read -r m; do meld "auteur/committer-e-mail is geen noreply-adres: $m"; done
git log -p --format= "${REFS[@]}" | grep -oiE '^\+.*[a-z0-9._%+-]+@(gmail|hotmail|outlook|live|yahoo|icloud)\.[a-z]+' | head -3 |
  while read -r r; do meld "privé-e-mail in inhoud: ${r:0:80}"; done

if [ ! -s "$VONDST" ]; then echo "Geheimen-check: OK"; else echo "Geheimen-check: GEVONDEN, niet pushen"; exit 1; fi
