# Autonoom maar veilig – hoe het werkt

## Onderdelen
| Wat | Waar | Wanneer |
|-----|------|---------|
| Sync Drive ⇄ lokaal, noodstop, back-up, Actions-uitkomsten naar Logboek | `scripts/automatisch.sh` (log: `logs/sync.log`) | elk uur (crontab `15 * * * *`), begin en eind van elke sessie |
| Noodstop-check | `scripts/stop-check.sh` (STOP.md of `KILL_SWITCH=1`) | vóór elke automatische actie |
| Checks | `npm run check` = lint (`astro check` + `node --check`), build, `check:data` (`scripts/checks/valideer-data.mjs`), `check:links` (`scripts/checks/linkcheck.mjs`, `--extern` voor externe links) | elke PR en push (`.github/workflows/checks.yml`) |
| Deploy | `.github/workflows/deploy.yml`: checks → Cloudflare Pages-preview → health check → productie → health check → bij falen rollback via de Cloudflare API naar de vorige productie-deploy | na merge naar `main` |
| Health check | `scripts/deploy/health-check.sh <url>`: `/` en `/amsterdam/` geven 200, > 800 bytes, bevatten `<h1` | na elke deploy; elke 6 uur alleen melden (`health.yml`) |
| Data-refresh | `scripts/data-refresh.sh` (lokaal, want het AI-filter draait via Grok op de pc): scrape → filter → checks → review door Grok → PR → merge na groene checks. >20% minder aanbieders = afgekeurd | maandelijks (crontab, nog in te stellen) |
| Branch protection | `scripts/github/zet-branch-protection.sh <owner/repo>`: verplichte check `checks`, geen force-push | eenmalig na aanmaken repo |

## Noodstop
- `STOP.md` in de Drive-map → binnen een uur lokaal (`automatisch.sh`) → GitHub-variabele `KILL_SWITCH=1` → workflows deployen niets en checks falen (dus geen merge).
- Weg van Drive → lokaal ook weg (alleen als hij van Drive kwam) en `KILL_SWITCH=0`. Een lokaal aangemaakte STOP.md blijft tot hij lokaal weg is.
- Sync en back-up blijven draaien tijdens STOP (beschermend).

## BERICHTEN.md-sync
Download naar `.sync/BERICHTEN.drive`, vergelijken met de laatst gesynchroniseerde versie (`.sync/BERICHTEN.base`). Alleen Drive gewijzigd → overnemen; beide gewijzigd → samenvoegen (`git merge-file --union`, niets gaat verloren); daarna upload met `--update`. STATUS.md en TAKEN.md gaan alleen omhoog met `--update`.

## Nodig voordat het live kan (Mo)
Openbare GitHub-repo (branch protection gratis) + `gh`; gratis Cloudflare-account; GitHub Secrets `CLOUDFLARE_API_TOKEN` (rechten: Account › Cloudflare Pages › Edit) en `CLOUDFLARE_ACCOUNT_ID`. Optioneel variabele `CF_PAGES_PROJECT` en secret `PRODUCTION_URL` (voor `health.yml`). Vóór elke push: `scripts/checks/geheimen-check.sh`.
