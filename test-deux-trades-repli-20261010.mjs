/* test-deux-trades-repli-20261010.mjs - UN WALLET QUI NE GROUPE PAS : LE REPLI EN DEUX TRADES A SES DEUX BOUTONS.
 * Test prod de Grok (Rabby, NVDAc paie IB022 = lot atomique de 5 appels) : « non supporte par Rabby, rien d envoye » ; la carte disait
 *   « Two trades do the same: sell NVDAc first, then buy IB022 » SANS bouton (diagnostic Grok 21:58, point 2).
 * EXECUTE bcDeuxTrades (app.html, TB_APP = ancienne) sur un plan 4 ter tel que le rail le rend (resume.pivot, resume.pivotAuMoins).
 * AFFIRME : deux trades dans l ordre - (1) l action entiere vers le pivot, (2) le pivot vers le block pour AU PLUS pivotAuMoins (le
 *   minimum garanti de la jambe 1 : rien n est devine) ; pivot illisible, minimum absent ou nul -> null (texte seul, comme avant) ;
 *   la branche d echec du lot passe par bcDeuxTrades et garde « Start again ».
 * NE PROUVE PAS : un vrai Rabby ; que la jambe 2 trouve exactement pivotAuMoins au compte (elle relit le solde avant son plan).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const i0 = html.indexOf('function bcDeuxTrades(');
const fin = i0 > 0 ? /\r?\n\}/.exec(html.slice(i0)) : null;
vu(i0 > 0 && !!fin, 'bcDeuxTrades absente : le repli en deux trades reste sans bouton');
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const bcDeuxTrades = new Function('DEVISES_BASE', 'ACTIONS_COINBASE', 'court', html.slice(i0, i0 + fin.index + fin[0].length) + '\nreturn bcDeuxTrades;')(
  [{ adr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbole: 'USDC' }], [], (a) => a.slice(0, 6) + '…' + a.slice(-4));
const NV = { adr: '0xb20000000000000000000078ee7ce2fe4908108c', sym: 'NVDAc' }, IB = { adr: '0xb2000000000000000000000000000000000000ib'.replace('ib', '22'), sym: 'IB022' };
const p = { etat: 'PRET', atomique: true, resume: { pivot: USDC, pivotAuMoins: '4956412', recoitAuMoins: '1' } };
const t = bcDeuxTrades(p, NV, IB, '2169029');
vu(Array.isArray(t) && t.length === 2, 'pas deux trades : ' + JSON.stringify(t));
vu(t[0].de === NV && t[0].vers.adr === USDC && t[0].vers.sym === 'USDC' && t[0].montant === '2169029', 'trade 1 faux : ' + JSON.stringify(t[0]));
vu(t[1].de.adr === USDC && t[1].vers === IB && t[1].montant === '4956412', 'trade 2 faux (doit payer AU PLUS le minimum garanti) : ' + JSON.stringify(t[1]));
vu(/^1 · Sell NVDAc for USDC$/.test(t[0].libelle) && /^2 · Then buy IB022 with USDC$/.test(t[1].libelle), 'libelles : ' + t.map((x) => x.libelle).join(' | '));
for (const [nom, rs] of [['pivot absent', { pivotAuMoins: '5' }], ['pivot tronque', { pivot: '0x8335…2913', pivotAuMoins: '5' }], ['minimum absent', { pivot: USDC }], ['minimum nul', { pivot: USDC, pivotAuMoins: '0' }], ['minimum illisible', { pivot: USDC, pivotAuMoins: 'abc' }]]) {
  vu(bcDeuxTrades({ resume: rs }, NV, IB, '1') === null, nom + ' -> un trade est devine');
}
vu(bcDeuxTrades(null, NV, IB, '1') === null, 'plan absent -> un trade est devine');
/* la branche d echec du lot */
const iE = html.indexOf("if (!r.hash) bcEtape(m, 'Nothing was sent. Two trades do the same");
const branche = html.slice(iE - 200, iE + 900);
vu(iE > 0 && /bcDeuxTrades\(p, de, vers, montant\)/.test(branche), 'la branche d echec du lot n appelle pas bcDeuxTrades');
vu(/bcProposerSwap\('You', '', \{ de: x\.de, vers: x\.vers, montant: x\.montant \}, null\)/.test(branche) && /\['Start again', planifier, true\]/.test(branche), 'les boutons ne proposent pas les deux echanges, ou « Start again » a disparu');
console.log('ok deux-trades-repli - ' + n + ' assertions ; NE PROUVE PAS un vrai Rabby');
