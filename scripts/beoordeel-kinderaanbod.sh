#!/bin/bash
# AI-filter: laat Grok per websitetekst (data/ruw/teksten/*.txt) bepalen of er kinderaanbod is.
# Uitvoer: data/ruw/beoordeling-<datum>.jsonl (één JSON-regel per aanbieder). Claude reviewt dit daarna.
# Gebruik: scripts/beoordeel-kinderaanbod.sh [portiegrootte]
set -u
MAP="$(cd "$(dirname "$0")/.." && pwd)"
VRAAG="$HOME/beheer/bin/vraag"
PORTIE="${1:-6}"
UIT="$MAP/data/ruw/beoordeling-$(date +%F).jsonl"
OPDRACHT='Je krijgt websiteteksten van bedrijven (elk bestand begint met NAAM en STAD). Bepaal per bedrijf, ALLEEN op basis van de tekst:
- kinderaanbod: "ja" (expliciet kookfeestje/kinderfeest/kinderworkshop/kids-kookles), "twijfel" (koken met groepen/familie, kinderen niet expliciet), "nee"
- type: "kookfeestje", "workshop", "beide" of null
- leeftijdVan, leeftijdTot: getallen alleen als ze letterlijk in de tekst staan, anders null
- prijsPerKindVan, prijsPerKindTot: euro per kind alleen als letterlijk vermeld, anders null
- bewijs: korte letterlijke zin uit de tekst (max 200 tekens) die je oordeel onderbouwt, of null
- bewijsUrl: de URL (regel na ###) waar dat bewijs staat, of null
Verzin niets. Antwoord ALLEEN met JSON Lines: per bedrijf één regel {"bestand":"<bestandsnaam zonder .txt>","kinderaanbod":...,"type":...,"leeftijdVan":...,"leeftijdTot":...,"prijsPerKindVan":...,"prijsPerKindTot":...,"bewijs":...,"bewijsUrl":...}'

mapfile -t BESTANDEN < <(ls "$MAP"/data/ruw/teksten/*.txt 2>/dev/null)
[ ${#BESTANDEN[@]} -eq 0 ] && { echo "Geen teksten in data/ruw/teksten" >&2; exit 2; }
: > "$UIT"
for ((i = 0; i < ${#BESTANDEN[@]}; i += PORTIE)); do
  args=()
  for f in "${BESTANDEN[@]:i:PORTIE}"; do args+=(-f "$f"); done
  echo "Portie $((i / PORTIE + 1))" >&2
  "$VRAAG" grok "${args[@]}" "$OPDRACHT" | grep -E '^\s*\{.*\}\s*$' >> "$UIT"
done
echo "Klaar: $(wc -l < "$UIT") beoordelingen in $UIT" >&2
