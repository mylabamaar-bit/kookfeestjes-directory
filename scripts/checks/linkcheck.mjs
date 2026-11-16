#!/usr/bin/env node
// Controleert links in dist/*.html. Eerst `npm run build` draaien.
// Gebruik: node scripts/checks/linkcheck.mjs [--extern]
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');
const EXTERN = process.argv.includes('--extern');

function alleHtml(dir) {
  const uit = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) uit.push(...alleHtml(p));
    else if (n.endsWith('.html')) uit.push(p);
  }
  return uit;
}

const isBestand = (p) => existsSync(p) && statSync(p).isFile();

function bestaatInDist(urlPad) {
  let pad;
  try { pad = decodeURIComponent(urlPad); } catch { pad = urlPad; }
  const rel = posix.normalize(pad).replace(/^\/+/, '');
  const basis = join(DIST, rel);
  if (!basis.startsWith(DIST)) return false;
  if (pad.endsWith('/') || rel === '' || rel === '.') return isBestand(join(basis, 'index.html'));
  return isBestand(basis) || isBestand(basis + '.html') || isBestand(join(basis, 'index.html'));
}

function ids(html) {
  const s = new Set();
  for (const m of html.matchAll(/\s(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) s.add(m[1] ?? m[2] ?? m[3]);
  return s;
}

async function externeCheck(urls) {
  const resultaten = [];
  const laatsteTijd = new Map();
  const hostKetting = new Map();
  const pauze = (ms) => new Promise((r) => setTimeout(r, ms));

  async function wachtOpHost(h) {
    const vorige = hostKetting.get(h) ?? Promise.resolve();
    const nu = vorige.then(async () => {
      const wacht = (laatsteTijd.get(h) ?? 0) + 1000 - Date.now();
      if (wacht > 0) await pauze(wacht);
      laatsteTijd.set(h, Date.now());
    });
    hostKetting.set(h, nu);
    await nu;
  }

  async function probeer(url, methode) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    try {
      const res = await fetch(url, { method: methode, redirect: 'follow', signal: ctl.signal, headers: { 'user-agent': 'kookfeestjes-linkcheck/1.0' } });
      res.body?.cancel?.().catch(() => {});
      return res.status;
    } finally { clearTimeout(t); }
  }

  async function een(url) {
    const h = new URL(url).host;
    try {
      await wachtOpHost(h);
      let status = await probeer(url, 'HEAD');
      if (status >= 400) { await wachtOpHost(h); status = await probeer(url, 'GET'); }
      if (status >= 400) resultaten.push(`${url} -> HTTP ${status}`);
    } catch (e) {
      resultaten.push(`${url} -> fout: ${e.name === 'AbortError' ? 'timeout (10 s)' : (e.cause?.code ?? e.message)}`);
    }
  }

  const wachtrij = [...urls];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (wachtrij.length) await een(wachtrij.shift());
  }));
  return resultaten;
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('dist/ bestaat niet. Draai eerst: npm run build');
    process.exit(1);
  }
  const paginas = alleHtml(DIST);
  const kapot = [];
  const extern = new Set();
  let intern = 0;

  for (const bestand of paginas) {
    const html = readFileSync(bestand, 'utf8');
    const relBestand = '/' + posix.relative(DIST.split('\\').join('/'), bestand.split('\\').join('/'));
    const paginaPad = relBestand.replace(/index\.html$/, '');
    const eigenIds = ids(html);
    for (const m of html.matchAll(/\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const link = (m[1] ?? m[2]).trim();
      if (!link) continue;
      if (/^https?:\/\//i.test(link)) { extern.add(link.split('#')[0]); continue; }
      if (/^\/\//.test(link)) { extern.add('https:' + link.split('#')[0]); continue; }
      if (/^[a-z][a-z0-9+.-]*:/i.test(link)) continue; // mailto, tel, data, javascript...
      if (link === '#') continue;
      intern++;
      if (link.startsWith('#')) {
        const id = decodeURIComponent(link.slice(1));
        if (id && id !== 'top' && !eigenIds.has(id)) kapot.push(`${relBestand}: anker ${link} bestaat niet op de pagina`);
        continue;
      }
      const [zonderHash] = link.split('#');
      const [pad] = zonderHash.split('?');
      const doel = pad.startsWith('/') ? pad : posix.join(paginaPad.endsWith('/') ? paginaPad : posix.dirname(paginaPad) + '/', pad);
      const doelMetSlash = pad === '' ? paginaPad : doel;
      if (!bestaatInDist(doelMetSlash)) kapot.push(`${relBestand}: kapotte link ${link}`);
    }
  }

  console.log(`Pagina's gecontroleerd: ${paginas.length}`);
  console.log(`Interne links gecontroleerd: ${intern}`);
  if (kapot.length) { console.log(`\nKAPOTTE INTERNE LINKS (${kapot.length}):`); kapot.forEach((k) => console.log(`  ✗ ${k}`)); }

  let waarschuwingen = [];
  if (EXTERN) {
    const lijst = [...extern].filter((u) => { try { new URL(u); return true; } catch { return false; } });
    console.log(`\nExterne links controleren (${lijst.length} unieke)...`);
    waarschuwingen = await externeCheck(lijst);
    if (waarschuwingen.length) { console.log(`\nWAARSCHUWINGEN externe links (${waarschuwingen.length}):`); waarschuwingen.forEach((x) => console.log(`  ! ${x}`)); }
  } else {
    console.log(`Externe links niet gecontroleerd (${extern.size} unieke; gebruik --extern).`);
  }

  console.log(`\nSamenvatting: ${kapot.length} kapotte interne links, ${waarschuwingen.length} waarschuwingen extern`);
  process.exit(kapot.length ? 1 : 0);
}

main();
