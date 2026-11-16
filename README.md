# Kookfeestjes Directory

Directory-website met kookfeestjes en kinderkookworkshops per stad in Nederland. Gebouwd met Astro (statisch), gehost op Cloudflare Pages.

## Starten
```bash
npm install
npm run dev      # lokaal bekijken op http://localhost:4321
npm run build    # statische site in dist/
```
Node 22.12 of nieuwer. Astro staat vast op 6.4.8 (Astro 7 vraagt Node ≥ 22.23.4).

## Data
- `src/data/steden.json`: steden (id = slug).
- `src/data/aanbieders/<slug>.json`: één aanbieder per bestand; schema in `src/content.config.ts`.
  Elke aanbieder heeft minstens één bron (URL) met controledatum. Geen verzonnen gegevens.
- `data/ruw/`: ruwe scrape-resultaten en websiteteksten (niet in git).

### Proefrun
```bash
cp .env.example .env            # vul OUTSCRAPER_API_KEY in
npm run data:outscraper -- --droog                 # toont de zoekopdrachten, geen kosten
npm run data:outscraper                            # echte run → data/ruw/kandidaten-<datum>.json
npm run data:controleer -- data/ruw/kandidaten-<datum>.json   # websites ophalen (robots.txt, rustig)
```
Daarna beoordeelt een AI-filter per aanbieder het kinderaanbod (ja/twijfel/nee); Claude reviewt vóór iets in `src/data/aanbieders/` komt.

## Regels
Zie `CLAUDE.md`. Kort: geen secrets in git (`.env`), geen automatische mails, wijzigingen via pull requests.

## Terugkoppeling
`scripts/sync-status.sh` kopieert `STATUS.md` en `TAKEN.md` naar de Drive-map "Project Kookfeestjes Directory" (log: `logs/sync.log`).
