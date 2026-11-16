#!/usr/bin/env node
// Proefrun: haalt per stad Google Maps-resultaten op via de Outscraper-API.
// Gebruik:
//   node scripts/outscraper-proefrun.mjs --droog        (alleen tonen wat er gevraagd wordt, geen kosten)
//   node scripts/outscraper-proefrun.mjs                (echte run; vereist OUTSCRAPER_API_KEY in .env)
//   opties: --limiet 15  --steden amsterdam,utrecht
// Uitvoer (niet in git): data/ruw/outscraper-<datum>.json (ruw) en data/ruw/kandidaten-<datum>.json (opgeschoond).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VANDAAG = new Date().toISOString().slice(0, 10);

const ZOEKTERMEN = ['kookfeestje kinderen', 'kinderkookworkshop', 'kookstudio'];

function leesEnv() {
  const f = path.join(ROOT, '.env');
  if (!fs.existsSync(f)) return {};
  return Object.fromEntries(
    fs.readFileSync(f, 'utf8').split('\n')
      .map((r) => r.trim()).filter((r) => r && !r.startsWith('#') && r.includes('='))
      .map((r) => [r.slice(0, r.indexOf('=')).trim(), r.slice(r.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
  );
}

function arg(naam, standaard) {
  const i = process.argv.indexOf(`--${naam}`);
  return i > -1 ? process.argv[i + 1] : standaard;
}

export function slugify(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' en ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Zet een Outscraper-plaats om naar een kandidaat volgens ons schema (kinderaanbod nog onbekend).
export function naarKandidaat(p, stadSlug, zoekterm) {
  return {
    naam: p.name,
    slug: slugify(`${p.name}-${p.city || stadSlug}`),
    stad: stadSlug,
    plaatsVolgensMaps: p.city || null,
    adres: p.full_address || undefined,
    postcode: p.postal_code || undefined,
    website: p.site || undefined,
    telefoon: p.phone || undefined,
    googleMapsUrl: p.location_link || undefined,
    googlePlaceId: p.place_id || undefined,
    beoordeling: p.rating ?? undefined,
    aantalReviews: p.reviews ?? undefined,
    categorie: p.category || p.type || null,
    subcategorieen: p.subtypes || null,
    status: p.business_status || null,
    zoekterm,
    bronnen: [{ url: p.location_link || `https://www.google.com/maps/place/?q=place_id:${p.place_id}`, soort: 'outscraper', gecontroleerd: VANDAAG }],
  };
}

async function zoek(basis, sleutel, query, limiet) {
  const url = new URL('/maps/search-v3', basis);
  url.searchParams.set('query', query);
  url.searchParams.set('limit', String(limiet));
  url.searchParams.set('language', 'nl');
  url.searchParams.set('region', 'NL');
  url.searchParams.set('async', 'false');
  const res = await fetch(url, { headers: { 'X-API-KEY': sleutel } });
  if (!res.ok) throw new Error(`Outscraper ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return (json.data || []).flat();
}

async function main() {
  const steden = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/steden.json'), 'utf8'));
  const keuze = arg('steden');
  const lijst = keuze ? steden.filter((s) => keuze.split(',').includes(s.id)) : steden;
  const limiet = Number(arg('limiet', '15'));
  const vragen = lijst.flatMap((s) => ZOEKTERMEN.map((t) => ({ stad: s, query: `${t} ${s.naam}, Nederland`, term: t })));

  console.log(`${vragen.length} zoekopdrachten x max ${limiet} = max ${vragen.length * limiet} resultaten`);
  if (process.argv.includes('--droog')) {
    vragen.forEach((v) => console.log(' -', v.query));
    return;
  }

  const env = { ...leesEnv(), ...process.env };
  const sleutel = env.OUTSCRAPER_API_KEY;
  if (!sleutel) {
    console.error('Geen OUTSCRAPER_API_KEY in .env. Zie .env.example.');
    process.exit(2);
  }
  const basis = env.OUTSCRAPER_BASE || 'https://api.outscraper.cloud';

  const ruw = [];
  const perId = new Map();
  for (const v of vragen) {
    process.stdout.write(`${v.query} ... `);
    const plaatsen = await zoek(basis, sleutel, v.query, limiet);
    console.log(plaatsen.length);
    ruw.push({ query: v.query, stad: v.stad.id, plaatsen });
    for (const p of plaatsen) {
      if (!p?.name || p.business_status === 'CLOSED_PERMANENTLY') continue;
      const id = p.place_id || `${p.name}|${p.full_address}`;
      if (!perId.has(id)) perId.set(id, naarKandidaat(p, v.stad.id, v.term));
    }
    await new Promise((r) => setTimeout(r, 1000)); // rustig aan met de API
  }

  fs.mkdirSync(path.join(ROOT, 'data/ruw'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, `data/ruw/outscraper-${VANDAAG}.json`), JSON.stringify(ruw, null, 2));
  const kandidaten = [...perId.values()];
  fs.writeFileSync(path.join(ROOT, `data/ruw/kandidaten-${VANDAAG}.json`), JSON.stringify(kandidaten, null, 2));

  console.log(`\nUniek: ${kandidaten.length}, met website: ${kandidaten.filter((k) => k.website).length}`);
  for (const s of lijst) console.log(`  ${s.naam}: ${kandidaten.filter((k) => k.stad === s.id).length}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
