#!/usr/bin/env node
// Zet een regel bovenaan het Logboek van BERICHTEN.md (nieuwste bovenaan).
// Gebruik: node scripts/logboek.mjs "tekst" [aan]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const BESTAND = path.join(ROOT, 'BERICHTEN.md');
const [tekst, aan = 'Exia'] = process.argv.slice(2);
if (!tekst) { console.error('Gebruik: logboek.mjs "tekst" [aan]'); process.exit(2); }

const nu = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).slice(0, 16);
const blok = `## ${nu} - Van: Claude (automatisch) - Aan: ${aan}\n${tekst}\n`;
let inhoud = fs.existsSync(BESTAND) ? fs.readFileSync(BESTAND, 'utf8') : '# BERICHTEN.md\n\n# Logboek\n';
const m = inhoud.match(/^# Logboek\n(<!--.*?-->\n)?/m);
if (!m) inhoud += `\n# Logboek\n\n${blok}`;
else {
  const plek = m.index + m[0].length;
  inhoud = `${inhoud.slice(0, plek)}\n${blok}${inhoud.slice(plek).replace(/^\n?/, '\n')}`;
}
fs.writeFileSync(BESTAND, inhoud);
