/* test-recherche-index-du-moment.mjs — « Find » TROUVE UN MARCHE LU, ET « N read here » COMPTE L INDEX REEL.
 *
 * ⛔⛔ LE DEFAUT (Raksha, 2026-10-01, trois fois) : juste apres avoir ouvert SNDKc, la recherche disait
 *     « No block named « SNDKc » among the 0 read here ». Deux causes :
 *     1. `chercherBlock` ne cherchait que dans `habitants` (la carte) puis `creationsLues` (les seules
 *        CREATIONS de la factory). SNDKc est un marche (action Coinbase) : hors carte, il etait introuvable ;
 *     2. `charger()` posait `creationsLues = vues` AVANT de savoir si la lecture avait abouti : une relecture
 *        aux fenetres toutes refusees remettait l index a 0.
 * ⛔ CE FICHIER EXECUTE LE VRAI CODE (app.html depouille de ses commentaires).
 * ⛔⛔ TEMOINS par mutation (voir le commit) : retirer la recherche dans les marches -> TUEE ; revenir au compte
 *   `creationsLues.length` -> TUEE ; revenir a `creationsLues = vues` -> TUEE.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';

let n = 0;
const cas = async (t, f) => { n += 1; try { await f(); console.log('  ok  ' + t); } catch (e) { console.error('✗ ' + t); throw e; } };
const nu = sansCommentaires(readFileSync(new URL('./app.html', import.meta.url), 'utf8'), { minRetire: 5000 });
const d = nu.indexOf('function fusionnerCreationsLues(');
const f = nu.indexOf("$('#bTrouver').addEventListener", d);
assert.ok(d > 0 && f > d, 'tranche recherche introuvable');
const source = nu.slice(d, f);
const SNDKC = '0xb200000000000000000000397293cb8cda9a10c5';

/* 2026-10-10 (QA Grok) : avant « absent », la Map demande l index du SERVEUR (/api/chercher) — doublure `serveur` (null = lecture ratee) */
async function chercher(q, { habitants = [], creations = [], lignes = null, serveur = { etat: 'ABSENT', couverture: { nomsLus: 0 } } } = {}) {
  const dits = []; const crees = []; let clic = null;
  const champs = { '#trouver': { value: q }, '#mapNote': { textContent: '' } };
  const $ = (s) => champs[s] || null;
  const creerHabitant = (c) => { const h = { adr: c.jeton, sym: c.symbole, el: { click: () => { clic = c.jeton; }, scrollIntoView() {}, classList: { add() {} } } }; crees.push(h); habitants.push(h); return h; };
  const fetch = async () => { if (!serveur) throw new Error('busy'); return { json: async () => serveur }; };
  const fn = new Function('$', 'habitants', 'creationsLues', 'dernierTrending', 'creerHabitant', 'anim', 'animer', 'ADRESSE', 'direMap', 'ouvrirProfil', 'fetch', 'AbortSignal',
    source + '\nchercherBlock(); return { fusionnerCreationsLues, indexDeRecherche };');
  const api = fn($, habitants, creations, lignes ? { lignes } : null, creerHabitant, 1, () => {}, /^0x[0-9a-fA-F]{40}$/, (t) => dits.push(t), () => {}, fetch, { timeout: () => null });
  for (let i = 0; i < 10; i += 1) await new Promise((o) => setTimeout(o, 0));
  if (dits.length && /^Looking for/.test(dits[0])) dits.shift();
  return { dits, crees, clic, api };
}

await cas('⛔⛔⛔ SNDKc HORS CARTE, 0 CREATION LUE, MAIS DANS LE MARCHE DU MOMENT : TROUVE ET OUVERT', async () => {
  const r = await chercher('SNDKc', { lignes: [{ adr: '0xb20000000000000000000078ee7ce2fe4908108c', sym: 'NVDAc' }, { adr: SNDKC, sym: 'SNDKc' }] });
  assert.equal(r.dits.length, 0, 'message au lieu du block : ' + r.dits[0]);
  assert.equal(r.clic, SNDKC, 'la fiche de SNDKc ne s ouvre pas');
});
await cas('⛔⛔ INTROUVABLE : « N read here » COMPTE LES BLOCKS DISTINCTS PARCOURUS (creations + marches)', async () => {
  const r = await chercher('ZZZZ', { creations: [{ jeton: '0x' + '1'.repeat(40) }, { jeton: '0x' + '2'.repeat(40) }, { jeton: SNDKC }],
    lignes: [{ adr: SNDKC, sym: 'SNDKc' }, { adr: '0x' + '3'.repeat(40), sym: 'AAA' }] });
  assert.equal(r.dits.length, 1);
  assert.match(r.dits[0], /among the 4 names read so far/, r.dits[0]);
});
await cas('TEMOIN — UN BLOCK DEJA SUR LA CARTE EST TROUVE SANS EN CREER UN SECOND', async () => {
  const r0 = await chercher('SNDKc', { lignes: [] });
  const h = { adr: SNDKC, sym: 'SNDKc', el: { click() {}, scrollIntoView() {} } };
  const r = await chercher('sndkc', { habitants: [h], lignes: [{ adr: SNDKC, sym: 'SNDKc' }] });
  assert.equal(r.crees.length, 0);
  assert.ok(r0.dits[0].includes('among the 0 names read so far'), 'sans rien lu, 0 reste vrai : ' + r0.dits[0]);
});
await cas('2026-10-10 (QA Grok) : 0 lu ICI mais IB022 dans l index du SERVEUR : trouve et ouvert', async () => {
  const IB = '0xb200000000000000000000e4b0c5fbe9c8df579e';
  const r = await chercher('IB022', { lignes: [], serveur: { etat: 'TROUVE', adr: IB, sym: 'IB022' } });
  assert.equal(r.clic, IB, 'pas ouvert : ' + r.dits.join(' | '));
});
await cas('2026-10-10 : le compte dit est le plus grand des deux index (serveur 527 > navigateur 0)', async () => {
  const r = await chercher('ZZZZ', { lignes: [], serveur: { etat: 'ABSENT', couverture: { nomsLus: 527 } } });
  assert.match(r.dits[0], /among the 527 names read so far/, r.dits[0]);
});
await cas('TEMOIN NEGATIF 2026-10-10 : index serveur illisible -> « network is busy », jamais « among the 0 »', async () => {
  const r = await chercher('ZZZZ', { lignes: [], serveur: null });
  assert.match(r.dits[0], /Search not read — the network is busy/, r.dits[0]);
});
await cas('fusionnerCreationsLues : union par jeton, sans doublon, les neuves d abord', async () => {
  const { api } = await chercher('x', {});
  const u = api.fusionnerCreationsLues([{ jeton: '0xAA', symbole: 'old' }, { jeton: '0xbb' }], [{ jeton: '0xaa', symbole: 'new' }]);
  assert.equal(u.length, 2); assert.equal(u[0].symbole, 'new');
  assert.equal(api.fusionnerCreationsLues([{ jeton: '0xaa' }], []).length, 1, 'une lecture vide efface l index');
});
await cas('⛔⛔ charger() : une lecture avec fenetres ratees UNIT au lieu d ecraser (code, pas commentaire)', async () => {
  const c = nu.slice(nu.indexOf('async function charger() {'), nu.indexOf('async function charger() {') + 1500);
  assert.match(c, /creationsLues = ratees \? fusionnerCreationsLues\(creationsLues, vues\) : vues;/);
  assert.ok(!/creationsLues = vues;/.test(c), 'l affectation nue est revenue');
});
console.log('test-recherche-index-du-moment :', n, 'cas OK');
