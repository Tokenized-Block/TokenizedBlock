/* test-profil-textes-20261002.mjs — DEUX PHRASES DU PROFIL (revue 2026-10-02 14:14).
 *  · COMPTABLE (ex. BOOKKEEPER) : « A market opened in this app is permanent, with a 0 % fee: there are no pool fees
 *    to collect — for anyone. » se lisait « aucun frais » → « Pool liquidity earns no LP fee. Swaps on this block's
 *    pool carry the fee shown before you sign. » — sans adresse, sans « Fees for Dev ».
 *  · « its brain weighs nothing more than the others more » (phrase cassee) → « its brain counts the same as any other ».
 * Code REEL : rapport() de metiers.js execute, phrase de peindreMetier extraite de app.html. TEMOINS NEGATIFS par mutation. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { FEE_WALLET } from './frais-creation.js';

let n = 0;
const CAS = [];
const cas = (nom, fn) => CAS.push([nom, fn]);
const HTML = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const SRC_METIERS = readFileSync(new URL('./metiers.js', import.meta.url), 'utf8');
const ICI = new URL('.', import.meta.url).pathname;
const dossier = mkdtempSync(join(tmpdir(), 'profil-textes-'));
for (const f of readdirSync(ICI)) if (f.endsWith('.js')) copyFileSync(join(ICI, f), join(dossier, f));
let k = 0;
async function metiers(src) { const f = join(dossier, 'metiers-' + (k++) + '.js'); writeFileSync(f, src); return import(pathToFileURL(f).href); }

async function verifierComptable(M) {
  const m = M.METIERS.find((x) => x.cle === 'COMPTABLE');
  assert.ok(m, 'metier COMPTABLE introuvable');
  const r = M.rapport({ metier: m, symbole: 'BOOKKEEPER', vie: null, devise: null, tendance: null, rang: null, population: null, solde: null, echanges: null, nourriture: null });
  const texte = JSON.stringify(r);
  assert.ok(texte.includes("Pool liquidity earns no LP fee. Swaps on this block's pool carry the fee shown before you sign."), 'la nouvelle phrase manque : ' + texte.slice(0, 300));
  assert.doesNotMatch(texte, /no pool fees to collect|0 % fee/, 'l ancienne phrase « 0 % fee » est encore la');
  assert.doesNotMatch(texte, /Fees for Dev/i);
  assert.ok(!texte.toLowerCase().includes(String(FEE_WALLET).toLowerCase().slice(0, 10)), 'adresse du wallet de frais');
  assert.doesNotMatch(texte, /0x[0-9a-f]{6,}/i, 'une adresse dans la phrase du profil');
}
cas('⛔ COMPTABLE : « Pool liquidity earns no LP fee… », plus « 0 % fee … no pool fees to collect »', async () => verifierComptable(await metiers(SRC_METIERS)));
cas('TEMOIN NEGATIF : l ancienne phrase remise rougit', async () => {
  const mut = SRC_METIERS.replace("'Pool liquidity earns no LP fee. Swaps on this block\\'s pool carry the fee shown before you sign.'",
    "'A market opened in this app is permanent, with a 0 % fee: there are no pool fees to collect — for anyone.'");
  assert.notEqual(mut, SRC_METIERS); await assert.rejects(async () => verifierComptable(await metiers(mut)), /manque|0 % fee/);
});

/* la phrase du cerveau, telle que peindreMetier la compose (extrait reel, execute pour chaque role) */
function phraseCerveau(html, cle) {
  const d = html.indexOf("    + ' · New Creates can engrave the role in metadata · '"); assert.ok(d > 0, 'phrase du role introuvable');
  const f = html.indexOf("'. It never signs or sends anything.';", d); assert.ok(f > d);
  const expr = html.slice(d + 6, f + "'. It never signs or sends anything.'".length);
  const sens = new Function(html.slice(html.indexOf('const SENS_ROLE = {'), html.indexOf('};', html.indexOf('const SENS_ROLE = {')) + 2) + '\nreturn SENS_ROLE;')();
  return new Function('cle', 'SENS_ROLE', 'return ' + expr.replace(/\/\*[\s\S]*?\*\//g, '') + ';')(cle, sens);
}
function verifierCerveau(html) {
  const c = phraseCerveau(html, 'COMPTABLE');
  assert.match(c, /its brain counts the same as any other\. It never signs/, 'COMPTABLE : ' + c);
  assert.doesNotMatch(c, /weighs nothing more than the others more|more more|others more/, 'phrase cassee : ' + c);
  assert.match(phraseCerveau(html, 'SENTINELLE'), /its brain weighs sells and price drops more\. It never signs/);
}
cas('⛔ « its brain counts the same as any other » pour COMPTABLE ; les autres roles inchanges', () => verifierCerveau(HTML));
cas('TEMOIN NEGATIF : l ancienne composition (« … the others more ») rougit', () => {
  const mut = HTML.replace("(cle === 'COMPTABLE' ? 'its brain counts the same as any other' : 'its brain weighs ' + (SENS_ROLE[cle] || 'what it reads') + ' more')",
    "'its brain weighs ' + (SENS_ROLE[cle] || 'what it reads') + ' more'");
  assert.notEqual(mut, HTML); assert.throws(() => verifierCerveau(mut), /COMPTABLE|cassee/);
});

for (const [, fn] of CAS) { await fn(); n++; }
console.log('ok profil-textes-20261002 — ' + n + ' cas, 2 temoins negatifs par mutation');
