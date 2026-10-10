/* test-recu-sans-adresse-frais-20261010.mjs - QA a6cf (P0) : LE RECU tblock-offer-receipt/1 RENDU DANS L UI NE MONTRE JAMAIS
 * L ADRESSE DU WALLET DE FRAIS (fee_sink / fee_wallet). Regle de Phil.
 * EXECUTE le module livre (resumeTaches, planOfferFood) et le REPLACER extrait de chaque rendu JSON du panneau Tasks dans
 * app.html (TB_APP = ancienne version pour la preuve rouge). AFFIRME : chaque texte rendu ne contient ni la cle ni l adresse.
 * NE PROUVE PAS : les autres ecrans (MCP, API) - les donnees gardent le champ, seul l affichage le retire.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { resumeTaches, planOfferFood, FEE_WALLET_TASKS } from './brain-tasks.js';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
assert.match(String(FEE_WALLET_TASKS), /^0x[0-9a-fA-F]{40}$/, 'adresse de frais du module illisible');
const rendus = [...html.matchAll(/JSON\.stringify\((resume\.offer_preview|\{\s*mode: plan\.mode,[^]*?steps: plan\.steps,\s*\}), ([^]*?), 2\);/g)];
assert.equal(rendus.length, 3, 'rendus JSON du panneau Tasks : ' + rendus.length + ' (attendu 3)');
const snap = { address: '0x' + '1'.repeat(40) };
const resume = resumeTaches(snap, {});
assert.ok(resume.offer_preview, 'offer_preview absent');
let plan = null; try { plan = planOfferFood({ block: snap.address, snap }); } catch (_) { plan = null; }
let n = 0;
for (const [, quoi, rep] of rendus) {
  const replacer = rep.trim() === 'null' ? null : new Function('return (' + rep + ');')();
  const objet = quoi.startsWith('resume') ? resume.offer_preview : { ...(plan || {}), fee_sink: FEE_WALLET_TASKS };
  const texte = JSON.stringify(objet, replacer, 2);
  assert.ok(!/fee_sink|fee_wallet/.test(texte), 'cle de frais rendue (' + quoi.slice(0, 30) + ')');
  assert.ok(!texte.toLowerCase().includes(String(FEE_WALLET_TASKS).toLowerCase()), 'adresse de frais rendue (' + quoi.slice(0, 30) + ')');
  n++;
}
/* temoin : sans replacer, le recu porte bien l adresse - sinon ce test ne verrait rien */
assert.ok(JSON.stringify(resume.offer_preview).toLowerCase().includes(String(FEE_WALLET_TASKS).toLowerCase()), 'temoin : le recu ne porte plus l adresse, test aveugle');
console.log('ok recu-sans-adresse-frais - ' + n + ' rendus, temoin positif ; NE PROUVE PAS les sorties MCP/API');