#!/usr/bin/env node
// Zet beoordelingen (AI-filter) + kandidaten om naar src/data/aanbieders/<slug>.json.
// Controle tegen verzinnen: het "bewijs" van de AI moet letterlijk in de opgehaalde websitetekst staan.
// Klopt dat niet, dan vervallen leeftijd/prijs en wordt de aanbieder als twijfelgeval gemarkeerd.
// Gebruik: node scripts/maak-aanbieders.mjs <kandidaten.json> <beoordeling.jsonl> [--schrijf]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const VANDAAG = new Date().toISOString().slice(0, 10);
const [kandFile, beoFile] = process.argv.slice(2);
const schrijf = process.argv.includes('--schrijf');

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[‘’“”"']/g, '').trim();
const kandidaten = new Map(JSON.parse(fs.readFileSync(kandFile, 'utf8')).map((k) => [k.slug, k]));
const beoordelingen = fs.readFileSync(beoFile, 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r));

const tel = { ja: 0, twijfel: 0, nee: 0, bewijsOnjuist: 0, bewijsNietKind: 0, prijsVervallen: 0 };
const perStad = {};
const uit = [];
for (const b of beoordelingen) {
  const k = kandidaten.get(b.bestand);
  if (!k) { console.warn('onbekend bestand', b.bestand); continue; }
  const tekst = norm(fs.readFileSync(path.join(ROOT, 'data/ruw/teksten', `${b.bestand}.txt`), 'utf8'));
  const bewijsKlopt = !!b.bewijs && tekst.includes(norm(b.bewijs).slice(0, 80));
  let oordeel = b.kinderaanbod;
  if (oordeel === 'ja' && !bewijsKlopt) { oordeel = 'twijfel'; tel.bewijsOnjuist++; }
  // "ja" alleen als het bewijs zelf over kinderen gaat.
  if (oordeel === 'ja' && !/kind|kids|junior|jeugd|verjaardag|jarige/i.test(b.bewijs)) { oordeel = 'twijfel'; tel.bewijsNietKind++; }
  // Boven €50 per kind is vrijwel altijd een pakketprijs: niet overnemen.
  for (const veld of ['prijsPerKindVan', 'prijsPerKindTot']) if (b[veld] > 50) { b[veld] = null; tel.prijsVervallen++; }
  tel[oordeel]++;
  if (oordeel === 'nee') continue;
  perStad[k.stad] = (perStad[k.stad] || 0) + 1;

  const bronnen = [{ url: k.website, soort: 'website', gecontroleerd: VANDAAG }];
  if (bewijsKlopt && b.bewijsUrl && b.bewijsUrl !== k.website) bronnen.push({ url: b.bewijsUrl, soort: 'website', gecontroleerd: VANDAAG });
  for (const br of k.bronnen || []) if (!bronnen.some((x) => x.url === br.url)) bronnen.push(br);

  const a = {
    naam: k.naam, slug: k.slug, stad: k.stad,
    adres: k.adres, postcode: k.postcode, website: k.website, telefoon: k.telefoon,
    googleMapsUrl: k.googleMapsUrl, googlePlaceId: k.googlePlaceId,
    beoordeling: k.beoordeling, aantalReviews: k.aantalReviews,
    kinderaanbod: oordeel,
    type: b.type || undefined,
    ...(bewijsKlopt ? {
      leeftijdVan: b.leeftijdVan ?? undefined, leeftijdTot: b.leeftijdTot ?? undefined,
      prijsPerKindVan: b.prijsPerKindVan ?? undefined, prijsPerKindTot: b.prijsPerKindTot ?? undefined,
    } : {}),
    bronnen, laatstGecontroleerd: VANDAAG, uitgelicht: false,
    handmatigeCheck: oordeel === 'twijfel',
    _bewijs: b.bewijs || undefined, // alleen voor review; wordt door Astro genegeerd
  };
  uit.push(JSON.parse(JSON.stringify(a)));
}

console.log(tel);
console.log('Per stad (ja + twijfel):', perStad);
if (schrijf) {
  const map = path.join(ROOT, 'src/data/aanbieders');
  fs.mkdirSync(map, { recursive: true });
  for (const a of uit) fs.writeFileSync(path.join(map, `${a.slug}.json`), JSON.stringify(a, null, 2) + '\n');
  console.log(`${uit.length} bestanden geschreven in src/data/aanbieders/`);
}
