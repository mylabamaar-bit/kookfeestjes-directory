#!/usr/bin/env node
// Haalt per kandidaat de website op (homepage + max. 3 relevante subpagina's), respecteert robots.txt,
// en bewaart de platte tekst in data/ruw/teksten/<slug>.txt voor de kinderaanbod-beoordeling.
// Gebruik: node scripts/controleer-websites.mjs data/ruw/kandidaten-<datum>.json
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const UA = 'KookfeestjesDirectoryBot/0.1 (controle kinderaanbod; contact via eigenaar)';
const WACHT_MS = 2000; // per verzoek, rustig crawlen
const MAX_TEKST = 6000;
const RELEVANT = /kind|kids|feest|party|workshop|junior|jeugd|verjaardag|arrangement|prijs|tarie/i;

const slaap = (ms) => new Promise((r) => setTimeout(r, ms));

async function haal(url) {
  const ctl = AbortSignal.timeout(15000);
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'nl' }, redirect: 'follow', signal: ctl });
  return { ok: res.ok, status: res.status, url: res.url, tekst: res.ok ? await res.text() : '' };
}

// Eenvoudige robots.txt-check: Disallow-regels voor User-agent: * (of onze naam).
async function robotsRegels(origin) {
  try {
    const r = await haal(`${origin}/robots.txt`);
    if (!r.ok) return [];
    const regels = [];
    let telt = false;
    for (const ruw of r.tekst.split('\n')) {
      const [k, ...rest] = ruw.split('#')[0].split(':');
      const v = rest.join(':').trim();
      if (/^user-agent$/i.test(k.trim())) telt = v === '*' || /kookfeestjes/i.test(v);
      else if (telt && /^disallow$/i.test(k.trim()) && v) regels.push(v);
    }
    return regels;
  } catch { return []; }
}
// Robots-regel naar patroon: * = willekeurig, $ = einde (zoals Google het leest).
const patroon = (r) => new RegExp('^' + r.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
const magOphalen = (url, regels) => {
  const u = new URL(url);
  return !regels.some((r) => patroon(r).test(u.pathname + u.search));
};

function naarTekst(html) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&euro;/g, '€').replace(/&#8364;/g, '€')
    .replace(/\s+/g, ' ').trim();
}

function links(html, basis) {
  const uit = new Set();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const u = new URL(m[1], basis);
      if (u.origin !== new URL(basis).origin) continue;
      if (RELEVANT.test(u.pathname) || RELEVANT.test(naarTekst(m[2]))) uit.add(u.href.split('#')[0]);
    } catch { /* ongeldige link */ }
  }
  return [...uit].slice(0, 3);
}

async function main() {
  const invoer = process.argv[2];
  if (!invoer) { console.error('Gebruik: controleer-websites.mjs <kandidaten.json>'); process.exit(2); }
  const kandidaten = JSON.parse(fs.readFileSync(invoer, 'utf8'));
  const map = path.join(ROOT, 'data/ruw/teksten');
  fs.mkdirSync(map, { recursive: true });
  const verslag = [];

  for (const k of kandidaten) {
    if (!k.website) { verslag.push({ slug: k.slug, status: 'geen website' }); continue; }
    try {
      const start = new URL(k.website);
      const regels = await robotsRegels(start.origin);
      if (!magOphalen(start.href, regels)) { verslag.push({ slug: k.slug, status: 'robots.txt verbiedt' }); continue; }
      const home = await haal(start.href);
      if (!home.ok) { verslag.push({ slug: k.slug, status: `HTTP ${home.status}` }); continue; }
      const delen = [`### ${home.url}\n${naarTekst(home.tekst).slice(0, MAX_TEKST)}`];
      for (const sub of links(home.tekst, home.url)) {
        if (!magOphalen(sub, regels)) continue;
        await slaap(WACHT_MS);
        try {
          const p = await haal(sub);
          if (p.ok) delen.push(`### ${p.url}\n${naarTekst(p.tekst).slice(0, MAX_TEKST)}`);
        } catch { /* subpagina overslaan */ }
      }
      fs.writeFileSync(path.join(map, `${k.slug}.txt`), `NAAM: ${k.naam}\nSTAD: ${k.stad}\n\n${delen.join('\n\n')}\n`);
      verslag.push({ slug: k.slug, status: 'ok', paginas: delen.length });
    } catch (e) {
      verslag.push({ slug: k.slug, status: `fout: ${e.message}` });
    }
    console.log(verslag.at(-1));
    await slaap(WACHT_MS);
  }
  fs.writeFileSync(path.join(ROOT, 'data/ruw/controle-verslag.json'), JSON.stringify(verslag, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
