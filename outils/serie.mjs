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
    const garde = setTimeout(() => { try { p.kill(); } catch (_) {} }, 300000);
    p.stdout.on('data', (d) => { sortie += d; }); p.stderr.on('data', (d) => { sortie += d; });
    p.on('close', (code) => {
      clearTimeout(garde); faits += 1;
      if (code !== 0) rouges.push({ f, code, ko: sortie.split('\n').filter((l) => /^\s*KO|✗|Error|ERR_/.test(l)).slice(0, 6).map((l) => l.slice(0, 240)) });
      ok();
    });
  });
}
async function ouvrier() { while (i < fichiers.length) { const f = fichiers[i++]; await un(f); } }
await Promise.all(Array.from({ length: conc }, ouvrier));
console.log(JSON.stringify({ fichiers: fichiers.length, faits, rouges: rouges.length, concurrence: conc }));
for (const r of rouges) { console.log('ROUGE ' + r.f + ' (code ' + r.code + ')'); for (const l of r.ko) console.log('   ' + l); }
process.exit(rouges.length ? 1 : 0);
