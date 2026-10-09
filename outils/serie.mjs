// outils/serie.mjs — lance les test-*.mjs du depot et liste ceux qui sortent en erreur (code != 0) ou depassent 300 s.
// Usage (depuis n importe ou) : node outils/serie.mjs [concurrence] [fichier ...]   (sans fichier : tous, ~10 a 15 min a 3)
// ⛔ Les tests qui lisent la vraie chaine rougissent sous charge (« NON LU ») : rejouer un rouge SEUL avant de conclure.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const conc = Number(process.argv[2]) || 3;
const demandes = process.argv.slice(3);
const fichiers = demandes.length ? demandes : fs.readdirSync(DIR).filter((f) => /^test-.*\.mjs$/.test(f)).sort();
const rouges = [];
let i = 0, faits = 0;
async function un(f) {
  return new Promise((ok) => {
    const p = spawn(process.execPath, [f], { cwd: DIR });
    let sortie = '';
    /* ⛔ 2026-10-09 : test-bloc-vers-bloc lit le RESEAU REEL (base.org en 429, publicnode, /api/cle de prod) et prend 318 s SEUL ;
     *   tue a 300 s, il sortait « ROUGE (code null) » a chaque serie — un faux rouge qui apprend a ignorer la liste. Un test qui
     *   appelle une URL https a 900 s ; un test TUE par le delai est nomme DELAI (toujours compte rouge : un blocage n est pas cache). */
    let tue = false;
    const reseau = /fetch\(\s*['"`]https:|['"`]https:\/\/[a-z0-9.-]+\.(org|com|space|io)/.test(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const garde = setTimeout(() => { tue = true; try { p.kill(); } catch (_) {} }, reseau ? 900000 : 300000);
    p.stdout.on('data', (d) => { sortie += d; }); p.stderr.on('data', (d) => { sortie += d; });
    p.on('close', (code) => {
      clearTimeout(garde); faits += 1;
      if (code !== 0) rouges.push({ f, code: tue ? 'DELAI ' + (reseau ? 900 : 300) + ' s' + (reseau ? ', reseau' : '') : code, ko: sortie.split('\n').filter((l) => /^\s*KO|✗|Error|ERR_/.test(l)).slice(0, 6).map((l) => l.slice(0, 240)) });
      ok();
    });
  });
}
async function ouvrier() { while (i < fichiers.length) { const f = fichiers[i++]; await un(f); } }
await Promise.all(Array.from({ length: conc }, ouvrier));
console.log(JSON.stringify({ fichiers: fichiers.length, faits, rouges: rouges.length, concurrence: conc }));
for (const r of rouges) { console.log('ROUGE ' + r.f + ' (code ' + r.code + ')'); for (const l of r.ko) console.log('   ' + l); }
process.exit(rouges.length ? 1 : 0);
