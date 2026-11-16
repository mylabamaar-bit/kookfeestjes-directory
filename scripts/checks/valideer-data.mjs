#!/usr/bin/env node
// Valideert alle aanbieders in src/data/aanbieders/*.json.
// Gebruik: node scripts/checks/valideer-data.mjs   (exit 1 bij fouten)
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const TOEGESTAAN = new Set([
  'naam', 'slug', 'stad', 'adres', 'postcode', 'website', 'telefoon', 'googleMapsUrl',
  'googlePlaceId', 'beoordeling', 'aantalReviews', 'kinderaanbod', 'type', 'leeftijdVan',
  'leeftijdTot', 'prijsPerKindVan', 'prijsPerKindTot', 'beschrijving', 'bronnen',
  'laatstGecontroleerd', 'uitgelicht', 'handmatigeCheck', '_bewijs',
]);
const VERPLICHT = ['naam', 'slug', 'stad', 'kinderaanbod', 'bronnen', 'laatstGecontroleerd'];
const GRATIS_DOMEINEN = /^(gmail|hotmail|outlook|live|yahoo|icloud|ziggo|kpnmail|planet)\.[a-z.]+$|^home\.nl$/i;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAGEN = 120;

function geldigeDatum(s) {
  if (typeof s !== 'string' || !DATUM_RE.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

function* waarden(v, pad = '') {
  if (typeof v === 'string') yield [pad, v];
  else if (Array.isArray(v)) for (let i = 0; i < v.length; i++) yield* waarden(v[i], `${pad}[${i}]`);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) yield* waarden(x, pad ? `${pad}.${k}` : k);
}

function host(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}

/**
 * Controleert alle aanbieders.
 * @param {{aanbiedersDir?:string, stedenBestand?:string, vandaag?:Date}} opties
 * @returns {{aantal:number, perStad:Record<string,number>, fouten:string[], waarschuwingen:string[]}}
 */
export function valideerData(opties = {}) {
  const dir = opties.aanbiedersDir ?? join(ROOT, 'src/data/aanbieders');
  const stedenBestand = opties.stedenBestand ?? join(ROOT, 'src/data/steden.json');
  const vandaag = opties.vandaag ?? new Date();
  const vandaagStr = vandaag.toISOString().slice(0, 10);
  const vandaagMs = Date.parse(vandaagStr + 'T00:00:00Z');
  const fouten = [];
  const waarschuwingen = [];
  const perStad = {};
  const f = (b, m) => fouten.push(`${b}: ${m}`);
  const w = (b, m) => waarschuwingen.push(`${b}: ${m}`);

  let steden = new Set();
  try {
    steden = new Set(JSON.parse(readFileSync(stedenBestand, 'utf8')).map((s) => s.id));
  } catch (e) {
    f('steden.json', `kan niet worden gelezen: ${e.message}`);
  }

  const bestanden = readdirSync(dir).filter((n) => n.endsWith('.json')).sort();
  const slugs = new Map();
  const placeIds = new Map();
  const hosts = new Map();
  let aantal = 0;

  for (const bestand of bestanden) {
    let a;
    try {
      a = JSON.parse(readFileSync(join(dir, bestand), 'utf8'));
    } catch (e) {
      f(bestand, `ongeldige JSON (${e.message})`);
      continue;
    }
    aantal++;
    if (!a || typeof a !== 'object' || Array.isArray(a)) { f(bestand, 'inhoud is geen object'); continue; }

    for (const v of VERPLICHT) if (a[v] === undefined || a[v] === null || a[v] === '') f(bestand, `verplicht veld ontbreekt: ${v}`);
    for (const k of Object.keys(a)) if (!TOEGESTAAN.has(k)) f(bestand, `onbekend veld: ${k}`);

    // slug
    if (typeof a.slug === 'string') {
      if (a.slug !== bestand.replace(/\.json$/, '')) f(bestand, `slug "${a.slug}" komt niet overeen met bestandsnaam`);
      if (!/^[a-z0-9-]+$/.test(a.slug)) f(bestand, `slug "${a.slug}" mag alleen a-z, 0-9 en - bevatten`);
      if (slugs.has(a.slug)) f(bestand, `dubbele slug "${a.slug}" (ook in ${slugs.get(a.slug)})`);
      else slugs.set(a.slug, bestand);
    }

    // stad
    if (typeof a.stad === 'string') {
      if (!steden.has(a.stad)) f(bestand, `stad "${a.stad}" staat niet in steden.json`);
      perStad[a.stad] = (perStad[a.stad] ?? 0) + 1;
    }

    if (a.kinderaanbod !== undefined && !['ja', 'twijfel', 'nee'].includes(a.kinderaanbod)) {
      f(bestand, `kinderaanbod "${a.kinderaanbod}" moet ja, twijfel of nee zijn`);
    }
    if (a.kinderaanbod === 'nee') w(bestand, 'kinderaanbod is "nee"');

    // datums
    const controleDatum = (waarde, label) => {
      if (waarde === undefined) return null;
      const d = geldigeDatum(waarde);
      if (!d) { f(bestand, `${label} "${waarde}" is geen geldige datum (JJJJ-MM-DD)`); return null; }
      if (d.getTime() > vandaagMs) f(bestand, `${label} "${waarde}" ligt in de toekomst`);
      return d;
    };
    const lg = controleDatum(a.laatstGecontroleerd, 'laatstGecontroleerd');
    if (lg && (vandaagMs - lg.getTime()) / 86400000 > MAX_DAGEN) {
      w(bestand, `laatstGecontroleerd (${a.laatstGecontroleerd}) is ouder dan ${MAX_DAGEN} dagen`);
    }

    // bronnen
    if (a.bronnen !== undefined) {
      if (!Array.isArray(a.bronnen) || a.bronnen.length < 1) f(bestand, 'bronnen moet minstens 1 item bevatten');
      else a.bronnen.forEach((b, i) => {
        for (const v of ['url', 'soort', 'gecontroleerd']) {
          if (!b || b[v] === undefined || b[v] === '') f(bestand, `bronnen[${i}].${v} ontbreekt`);
        }
        if (b && b.gecontroleerd !== undefined) controleDatum(b.gecontroleerd, `bronnen[${i}].gecontroleerd`);
      });
    }

    // dubbelen
    if (a.googlePlaceId) {
      if (placeIds.has(a.googlePlaceId)) f(bestand, `dubbele googlePlaceId (ook in ${placeIds.get(a.googlePlaceId)})`);
      else placeIds.set(a.googlePlaceId, bestand);
    }
    if (a.website) {
      const h = host(a.website);
      if (h && a.stad) {
        const key = `${a.stad}|${h}`;
        if (hosts.has(key)) f(bestand, `zelfde website-host "${h}" in stad ${a.stad} als ${hosts.get(key)}`);
        else hosts.set(key, bestand);
      }
    } else {
      w(bestand, 'website ontbreekt');
    }

    // getallen
    for (const v of ['prijsPerKindVan', 'prijsPerKindTot']) {
      if (typeof a[v] === 'number' && a[v] > 100) f(bestand, `${v} is ${a[v]} (meer dan 100)`);
    }
    if (typeof a.leeftijdVan === 'number' && typeof a.leeftijdTot === 'number' && a.leeftijdVan > a.leeftijdTot) {
      f(bestand, `leeftijdVan (${a.leeftijdVan}) is groter dan leeftijdTot (${a.leeftijdTot})`);
    }

    // privegegevens
    for (const [pad, tekst] of waarden(a)) {
      for (const m of tekst.matchAll(EMAIL_RE)) {
        if (GRATIS_DOMEINEN.test(m[1])) f(bestand, `privé e-mailadres (gratis domein) in ${pad}`);
      }
      if (/NL\d\d[A-Z]{4}\d{10}/.test(tekst.replace(/\s+/g, ''))) f(bestand, `mogelijk IBAN in ${pad}`);
      if (!/^https?:\/\//i.test(tekst) && !pad.startsWith('telefoon') && /(?<!\d)\d{9}(?!\d)/.test(tekst)) {
        f(bestand, `BSN-achtig 9-cijferig getal in ${pad}`);
      }
      if (pad === 'telefoon' && /(?<!\d)(\+31|0031|0)\s?-?6[\s-]?\d/.test(tekst)) w(bestand, '06-nummer gevonden (mogelijk privé)');
    }
  }

  return { aantal, perStad, fouten, waarschuwingen };
}

function main() {
  const r = valideerData();
  console.log(`Aanbieders gecontroleerd: ${r.aantal}`);
  console.log('Per stad:');
  for (const [s, n] of Object.entries(r.perStad).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))) {
    console.log(`  ${s}: ${n}`);
  }
  if (r.fouten.length) { console.log(`\nFOUTEN (${r.fouten.length}):`); r.fouten.forEach((m) => console.log(`  ✗ ${m}`)); }
  if (r.waarschuwingen.length) { console.log(`\nWAARSCHUWINGEN (${r.waarschuwingen.length}):`); r.waarschuwingen.forEach((m) => console.log(`  ! ${m}`)); }
  console.log(`\nSamenvatting: ${r.aantal} aanbieders, ${r.fouten.length} fouten, ${r.waarschuwingen.length} waarschuwingen`);
  process.exit(r.fouten.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
