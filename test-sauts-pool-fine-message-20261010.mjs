/* test-sauts-pool-fine-message-20261010.mjs - UNE POOL TROP FINE N EST PAS « SANS POOL » : LE MESSAGE DIT LA CAUSE, LE SAUT RESTE NOMME.
 * Prod (2026-10-10, 20261010-eth-summary-thin-pool, E.T.FFB -> USDC 1e23) : « hop 1 (0xb20000 to 0x000000) has no pool we can build:
 *   this pool is too thin for this amount… » - la pool EXISTE (elle cote 1/1000 du montant) ; le prefixe disait le contraire (Grok
 *   l a releve dans son rapport 7030).
 * EXECUTE sautsDepuisChemin avec un resolveur simule.
 * AFFIRME : poolTropFine -> « hop N: <cause> », sans « has no pool we can build », drapeau poolTropFine et fraction propages ; un
 *   resolveur qui ne trouve RIEN garde son message d avant (« has no pool we can build »).
 * NE PROUVE PAS : le rendu dans le panneau.
 */
import { strict as assert } from 'node:assert';
import { sautsDepuisChemin } from './sauts-depuis-chemin.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const B = '0xb200000000000000000000e0e18f3d8fd5a50164', ETH = '0x0000000000000000000000000000000000000000';
const CAUSE = 'this pool is too thin for this amount: it quotes 1/1000 of it, not all of it — try a much smaller amount';
const chemin = [{ de: B, vers: ETH, famille: 'uniswap-v4' }];
const r = await sautsDepuisChemin({ chemin, montant: 10n ** 23n, resoudre: async () => ({ etat: 'REFUSE', poolTropFine: true, fractionCotee: 1000, cle: null, pourquoi: CAUSE }) });
vu(r.etat === 'REFUSE', 'etat ' + r.etat);
vu(!/has no pool we can build/.test(r.pourquoi), 'ROUGE->VERT : une pool trop fine est dite « sans pool » : ' + r.pourquoi);
vu(/^hop 1: /.test(r.pourquoi) && r.pourquoi.includes(CAUSE), 'le saut ou la cause disparait : ' + r.pourquoi);
vu(r.poolTropFine === true && r.fractionCotee === 1000, 'le drapeau poolTropFine / la fraction ne sont pas propages');
const vide = await sautsDepuisChemin({ chemin, montant: 10n ** 18n, resoudre: async () => ({ etat: 'NON_MESURE', cle: null, pourquoi: 'no v4 pool among the 5 tried combinations' }) });
vu(vide.etat === 'NON_MESURE' && /^hop 1 \(.*\) has no pool we can build: no v4 pool/.test(vide.pourquoi) && !vide.poolTropFine, 'le message « sans pool » d avant a change : ' + vide.pourquoi);
console.log('ok sauts-pool-fine-message - ' + n + ' assertions ; NE PROUVE PAS le rendu panneau');
