/* test-paiement-actions-aerodrome-20261010.mjs - « You pay » d un block propose aussi les actions de la TABLE AERODROME (NVDAc...),
 * qui le paient par la route « 4 ter » (rails-api.js) : un LOT atomique de deux segments, envoye par `envoyerLotAtomique`.
 * 5 cas : block cote ETH, block cote USDC, une action, une autre devise, le drapeau `atomique` du plan.
 * EXECUTE bcChoixPaiement EXTRAITE d app.html (TB_APP = ancienne version pour le ROUGE), avec les VRAIES tables
 * ACTIONS_COINBASE (paires.js) et POOLS_ACTIONS_AERODROME (pools-actions-aerodrome.js). AFFIRME : (1) block cote ETH ou USDC :
 * ETH, USDC d abord, puis les actions v4 mesurees ET les actions de la table Aerodrome, chacune une fois ; (2) une ACTION se paie
 * toujours USDC puis ETH (rien d autre) ; (3) un block cote dans une autre devise : elle seule ; (4) rails-api.js traduit
 * `exigeAtomique` en `atomique` (sinon le panneau signerait la jambe 1 seule — retest Rabby du 2026-10-04).
 * NE PROUVE PAS : que chaque route soit PRET en prod, ni l envoi groupe d un vrai wallet.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { ACTIONS_COINBASE } from './paires.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const debut = html.indexOf('function bcChoixPaiement(a, q) {');
const apres = html.slice(debut).search(/\r?\n\}\r?\n/);
assert.ok(debut > 0 && apres > 0, 'bcChoixPaiement introuvable');
const corps = html.slice(debut, debut + apres + 3);

const ETH_ADR = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const ACTIONS_PAR_ADR = new Set(ACTIONS_COINBASE.map((a) => String(a.adr).toLowerCase()));
const aero = ACTIONS_COINBASE.map((a) => String(a.adr).toLowerCase()).filter((a) => POOLS_ACTIONS_AERODROME.has(a));
const nonAero = ACTIONS_COINBASE.map((a) => String(a.adr).toLowerCase()).filter((a) => !POOLS_ACTIONS_AERODROME.has(a));
assert.ok(aero.length >= 1 && nonAero.length >= 1, 'tables vides : le test ne prouverait rien');
const v4 = new Set(nonAero.slice(0, 2)); /* deux actions a pool v4 « mesuree » (simulee) */
const bcResoudre = (s) => (s === 'USDC' ? { ok: true, adr: USDC, sym: 'USDC' } : { ok: false });
const f = new Function('ETH_ADR', 'bcResoudre', 'ACTIONS_PAR_ADR', 'ACTIONS_COINBASE', 'POOLS_ACTIONS_AERODROME', 'bcActionsV4',
  '"use strict";' + corps + '; return bcChoixPaiement;')(ETH_ADR, bcResoudre, ACTIONS_PAR_ADR, ACTIONS_COINBASE, POOLS_ACTIONS_AERODROME, () => v4);
let n = 0;

const BLOCK = '0xb2' + '00'.repeat(19);
for (const q of [{ ok: true, adr: ETH_ADR.toLowerCase(), sym: 'ETH' }, { ok: true, adr: USDC, sym: 'USDC' }]) {
  const c = f(BLOCK, q), vals = c.map((x) => x[0]);
  assert.deepEqual(vals.slice(0, 2), ['ETH', 'USDC'], 'ETH puis USDC d abord : ' + vals.slice(0, 2));
  for (const a of v4) assert.ok(vals.includes(a), 'action v4 absente : ' + a);
  for (const a of aero) assert.ok(vals.includes(a), 'action de la table Aerodrome absente de « You pay » (cote ' + q.sym + ') : ' + a);
  assert.equal(new Set(vals).size, vals.length, 'doublon dans « You pay »');
  const nvda = ACTIONS_COINBASE.find((x) => x.symbole === 'NVDAc');
  if (nvda && POOLS_ACTIONS_AERODROME.has(String(nvda.adr).toLowerCase())) assert.ok(c.some((x) => x[1] === 'NVDAc (stock)'), 'NVDAc absente');
  n++;
}
assert.deepEqual(f(aero[0], { ok: true, adr: USDC, sym: 'USDC' }), [['USDC', 'USDC'], ['ETH', 'ETH']]); n++;
const autre = { ok: true, adr: '0x' + '42'.repeat(20), sym: 'XYZ' };
assert.deepEqual(f(BLOCK, autre), [[autre.adr, 'XYZ']]); n++;

const rails = readFileSync(new URL('./rails-api.js', import.meta.url), 'utf8');
assert.match(rails, /atomique: !!\(p && p\.exigeAtomique\),/, 'le plan ne dit plus `atomique` : le panneau enverrait la jambe 1 seule'); n++;

assert.equal(n, 5, 'cas executes : ' + n);
console.log('ok paiement-actions-aerodrome ' + n + '/5 - ' + aero.length + ' actions de la table Aerodrome dans « You pay » ; NE PROUVE PAS les routes PRET en prod');
