/* test-v4-hook-tiers-sans-devis-20261011.mjs - UN BLOCK DE LAUNCHPAD TIERS DONT LA POOL v4 (CLE REELLE, HOOKEE) REPOND NotEnoughLiquidity A TOUTES LES TAILLES.
 * Prod (2026-10-11, 20261011-bank-choices-edge, Grok) : achat USDC -> Polytopia 0xb200000000000000000000ad2ef5088ae83e5dac 0,05 USDC :
 *   « hop 2 (0x000000 to 0xb20000) has no pool we can build: no v4 pool among the 5 tried combinations quoted this pair ».
 * MESURE (lecture seule, mainnet.base.org, 2026-10-11 ~12:35 Bruxelles) : /api/cle rend la cle REELLE
 *   { currency0: ETH, currency1: Polytopia, fee: 100, tickSpacing: 1, hooks: 0xd34c23dd19a5ca51febe267ff73fbe50511880cc } (poolId 0xff4abb13...9fdb) ;
 *   StateView.getLiquidity = 0 (tick 187424) ; V4Quoter revert UnexpectedRevertBytes(NotEnoughLiquidity(poolId)) a 1e9, 1e13 et 1e15 wei.
 *   La cle reelle EST DEJA essayee en premier (rails-api.js resolveurAvec) : le defaut n est pas la cle devinee, c est le message.
 * AFFIRME : (a) la cle reelle hookee est essayee EN PREMIER, avec son hook ; (b) ROUGE avant : NON_MESURE « no v4 pool among the 5 tried
 *   combinations » ; VERT apres : REFUSE nomme (hook, NotEnoughLiquidity a toutes les tailles), drapeau hookSansDevis, refus garde ;
 *   (c) sautsDepuisChemin dit « hop 2: <cause> » sans « has no pool we can build » ; (d) une pool hookee qui cote reste OK (inchange).
 * NE PROUVE PAS : qu un achat passerait (hook non verifie, refus garde), le rendu du panneau. Hors reseau (rpc simule). */
import { strict as assert } from 'node:assert';
import { meilleureClePourMontant } from './echange.js';
import { sautsDepuisChemin } from './sauts-depuis-chemin.js';
import { CLES_PRIX } from './prix-eth.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const ETH = '0x0000000000000000000000000000000000000000', B = '0xb200000000000000000000ad2ef5088ae83e5dac';
const HOOK = '0xd34c23dd19a5ca51febe267ff73fbe50511880cc', PID = 'ff4abb13252c0a9068c4f919ffd8a111f19e4eb61e0fcceb0509c0655a919fdb';
const REELLE = { fee: 100, tickSpacing: 1, hooks: HOOK };
/* la donnee de revert MESUREE, telle que le noeud la rend */
const DATA = '0x6190b2b0' + (32).toString(16).padStart(64, '0') + (36).toString(16).padStart(64, '0') + '7a5ed734' + PID + '0'.repeat(56);
const appels = [];
const rpc = async (m, p) => {
  const d = String(p[0].data).toLowerCase();
  appels.push(d);
  if (d.includes(HOOK.slice(2))) throw new Error('execution reverted: ' + JSON.stringify({ code: 3, message: 'execution reverted', data: DATA }));
  throw new Error('execution reverted'); /* les gabarits sans hook : pool absente */
};
const r = await meilleureClePourMontant({ rpc, chaine: 8453, de: ETH, vers: B, montant: 15n * 10n ** 12n, candidates: [REELLE].concat(CLES_PRIX) });
vu(appels[0].includes(HOOK.slice(2)), 'la cle reelle (avec son hook) n est pas essayee en premier');
vu(r.etat === 'REFUSE', 'ROUGE->VERT : etat ' + r.etat + ' / ' + r.pourquoi);
vu(r.hookSansDevis === true && !r.poolTropFine, 'drapeau hookSansDevis absent');
vu(/0xd34c23/.test(r.pourquoi) && /NotEnoughLiquidity/.test(r.pourquoi) && !/tried combinations/.test(r.pourquoi), 'message : ' + r.pourquoi);
vu(r.cle === null && r.quote === null, 'un refus ne rend ni cle ni devis');
const s = await sautsDepuisChemin({ chemin: [{ de: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', vers: ETH, famille: 'uniswap-v4' }, { de: ETH, vers: B, famille: 'uniswap-v4' }],
  montant: 50000n, resoudre: async ({ vers }) => (vers === ETH
    ? { etat: 'OK', cle: { currency0: ETH, currency1: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', fee: 500, tickSpacing: 10, hooks: ETH }, zeroForOne: false, quote: 15n * 10n ** 12n }
    : r) });
vu(s.etat === 'REFUSE' && /^hop 2: /.test(s.pourquoi) && !/has no pool we can build/.test(s.pourquoi) && s.hookSansDevis === true, 'saut : ' + s.etat + ' / ' + s.pourquoi);
/* (d) une pool hookee qui COTE reste choisie */
const ok = await meilleureClePourMontant({ rpc: async (m, p) => (String(p[0].data).toLowerCase().includes(HOOK.slice(2)) ? '0x' + (123n).toString(16).padStart(64, '0') : (() => { throw new Error('execution reverted'); })()),
  chaine: 8453, de: ETH, vers: B, montant: 10n ** 13n, candidates: [REELLE].concat(CLES_PRIX) });
vu(ok.etat === 'OK' && ok.quote === 123n && ok.cle.hooks.toLowerCase() === HOOK, 'une pool hookee qui cote n est plus choisie');
console.log('OK test-v4-hook-tiers-sans-devis-20261011 : ' + n + ' assertions');