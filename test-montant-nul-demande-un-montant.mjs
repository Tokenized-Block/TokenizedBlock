/* test-montant-nul-demande-un-montant.mjs — TAPER « 0 » DANS BUY DEMANDE UN MONTANT, RIEN D AUTRE.
 *
 * ⛔⛔ LE DEFAUT (Raksha, 2026-10-01, profil SNDKc) : « 0 » ou « 0.0 » dans Buy ne disait rien ; la seule
 *     phrase visible etait « Not offered yet — 2 no route » (le selecteur Pay with, qui parle des AUTRES
 *     devises). Aucun ecouteur `input` sur le champ ; et `preparerEchange` ne regardait le montant
 *     qu apres cinq gardes (marche, frais de pool, wallet, decimales…).
 * ⛔ CE FICHIER EXECUTE LE VRAI CODE extrait d app.html depouille de ses commentaires :
 *   `montantNulOuVide`, l ecouteur `input` des deux champs, et la tete de `preparerEchange`.
 * ⛔⛔ TEMOINS NEGATIFS par mutation (voir le commit) : retirer la garde de tete -> TUEE ; retirer
 *   l ecouteur -> TUEE. Et un vrai montant (0.01) NE DOIT PAS etre refuse — sinon on aurait tout bloque.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';

let n = 0;
const cas = async (t, f) => { n += 1; try { await f(); console.log('  ok  ' + t); } catch (e) { console.error('✗ ' + t); throw e; } };
const nu = sansCommentaires(readFileSync(new URL('./app.html', import.meta.url), 'utf8'), { minRetire: 5000 });
const tranche = (debut, fin) => { const d = nu.indexOf(debut); assert.ok(d >= 0, 'introuvable : ' + debut); const f = nu.indexOf(fin, d); assert.ok(f > d, 'fin introuvable : ' + fin); return nu.slice(d, f); };

const sEcoute = tranche('const PHRASE_MONTANT_NUL', 'async function preparerEthUsdc');
const sTete = tranche('async function preparerEchange(sens) {', 'if (!echangeAutorise(marcheLuGate');

function monter() {
  const ecouteurs = {};
  const champ = (id) => ({ id, value: '', addEventListener: (t, f) => { ecouteurs[id + ':' + t] = f; } });
  const el = { '#peAchat': champ('#peAchat'), '#peVente': champ('#peVente'),
    '#peEtat': { className: 'note', textContent: '' }, '#peActions': { innerHTML: '' }, '#peLignes': { innerHTML: '' },
    '#profil': { dataset: { block: '0xb200000000000000000000397293cb8cda9a10c5' } } };
  const $ = (q) => el[q] || null;
  const etapes = [];
  const fn = new Function('$', 'etape', 'marcheProfil', 'CHAINE',
    sEcoute + '\n' + sTete + '\n return "PASSE"; }\n return { montantNulOuVide, preparerEchange };');
  const api = fn($, (x) => etapes.push(x), null, 8453);
  const taper = (id, v) => { el[id].value = v; const f = ecouteurs[id + ':input']; assert.ok(f, 'aucun ecouteur input sur ' + id); f(); };
  return { el, api, taper, etapes };
}

await cas('montantNulOuVide : 0, 0.0, 0,00, ., vide -> nul ; 0.01, 1, 10 -> pas nul', async () => {
  const { api } = monter();
  for (const v of ['0', '0.0', '0,00', '.', '', '  0  ', '000.000']) assert.equal(api.montantNulOuVide(v), true, v);
  for (const v of ['0.01', '1', '10', '0.0001', 'abc']) assert.equal(api.montantNulOuVide(v), false, v);
});
await cas('⛔⛔⛔ TAPER « 0 » PUIS « 0.0 » DANS BUY : « Enter an amount above zero. » TOUT DE SUITE', async () => {
  const { el, taper } = monter();
  taper('#peAchat', '0');
  assert.equal(el['#peEtat'].textContent, 'Enter an amount above zero.');
  taper('#peAchat', '0.0');
  assert.equal(el['#peEtat'].textContent, 'Enter an amount above zero.');
  taper('#peAchat', '0.01');
  assert.equal(el['#peEtat'].textContent, '', 'la demande de montant reste apres un bon montant');
});
await cas('L ECOUTEUR N ECRASE PAS UN AUTRE MESSAGE (devis, refus) quand le montant est bon', async () => {
  const { el, taper } = monter();
  el['#peEtat'].textContent = 'Not prepared: the cheapest pool we found charges 9.00% per trade.';
  taper('#peAchat', '0.02');
  assert.match(el['#peEtat'].textContent, /^Not prepared/);
});
await cas('⛔⛔ CLIC BUY AVEC « 0 » : REFUS DE MONTANT AVANT TOUTE GARDE DE MARCHE', async () => {
  const { el, api, etapes } = monter();
  el['#peAchat'].value = '0.0';
  const r = await api.preparerEchange('ACHAT');
  assert.notEqual(r, 'PASSE', 'le montant nul est passe jusqu aux gardes de marche');
  assert.equal(el['#peEtat'].textContent, 'Enter an amount above zero.');
  assert.deepEqual(etapes, ['echange_refus_montant']);
});
await cas('TEMOIN — CLIC BUY AVEC « 0.01 » : LA GARDE LAISSE PASSER', async () => {
  const { el, api } = monter();
  el['#peAchat'].value = '0.01';
  assert.equal(await api.preparerEchange('ACHAT'), 'PASSE');
});
console.log('test-montant-nul-demande-un-montant :', n, 'cas OK');
