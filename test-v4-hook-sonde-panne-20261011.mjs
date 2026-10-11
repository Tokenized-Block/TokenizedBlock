/* test-v4-hook-sonde-panne-20261011.mjs - LE REFUS « HOOK SANS LIQUIDITE » N EST DIT QUE SI LES 3 FRACTIONS ONT ETE LUES ET ONT REVERTE.
 * Revue adverse du 2026-10-11 (3/3) : « can't fill this amount, nor 1/10, 1/100 or 1/1000 of it » etait affirme alors que les sondes
 *   de fractions avalaient TOUT (429, delai) : une panne de lecture devenait un REFUSE definitif (jamais fail-closed sur une lecture
 *   ratee : trois etats). EXECUTE meilleureClePourMontant (echange.js) avec un rpc simule au CONTRAT REEL (message
 *   « execution reverted », octets dans error.data - mesure sur 3 noeuds le 2026-10-11).
 * NE PROUVE PAS : le rendu. */
import { strict as assert } from 'node:assert';
import { meilleureClePourMontant } from './echange.js';
import { CLES_PRIX } from './prix-eth.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const ETH = '0x0000000000000000000000000000000000000000', B = '0xb200000000000000000000ad2ef5088ae83e5dac';
const HOOK = '0xd34c23dd19a5ca51febe267ff73fbe50511880cc', PID = 'ff4abb13252c0a9068c4f919ffd8a111f19e4eb61e0fcceb0509c0655a919fdb';
const REELLE = { fee: 100, tickSpacing: 1, hooks: HOOK };
const NEL = '0x6190b2b0' + (32).toString(16).padStart(64, '0') + (36).toString(16).padStart(64, '0') + '7a5ed734' + PID + '0'.repeat(56);
const M = 15n * 10n ** 12n;
/* fractionsEn : ce que rendent les sondes de fractions sur la cle hookee ('nel' | '429') ; le montant entier rend toujours NEL */
const fabriquer = (fractionsEn) => async (methode, p) => {
  const d = String(p[0].data).toLowerCase();
  if (!d.includes(HOOK.slice(2))) throw new Error('execution reverted'); /* gabarits : pas de pool */
  /* le 1er appel sur la cle hookee est le montant entier (cote en parallele des gabarits), les suivants sont les fractions */
  fabriquer.appels = (fabriquer.appels || 0) + 1;
  if (fabriquer.appels === 1 || fractionsEn === 'nel') { const e = new Error('execution reverted'); e.data = NEL; throw e; }
  throw new Error('request limit reached (429)');
};
const essai = async (fractionsEn, montant = M) => { fabriquer.appels = 0; return meilleureClePourMontant({ rpc: fabriquer(fractionsEn), chaine: 8453, de: ETH, vers: B, montant, candidates: [REELLE].concat(CLES_PRIX) }); };
let r = await essai('nel');
vu(r.etat === 'REFUSE' && r.hookSansDevis === true && /nor 1\/10, 1\/100 or 1\/1000/.test(r.pourquoi), 'temoin : NotEnoughLiquidity partout doit rester le refus nomme : ' + r.etat + ' / ' + r.pourquoi);
r = await essai('429');
vu(r.etat === 'NON_MESURE' && r.hookSansDevis !== true && !/nor 1\/10/.test(r.pourquoi), 'ROUGE->VERT : des sondes en 429 deviennent un REFUSE definitif : ' + r.etat + ' / ' + r.pourquoi);
r = await essai('nel', 500n); /* 500/1000 = 0 : la 3e fraction ne peut pas etre lue */
vu(r.etat === 'NON_MESURE' && r.hookSansDevis !== true, 'montant trop petit pour 3 fractions : le refus affirme quand meme « nor 1/1000 » : ' + r.etat + ' / ' + r.pourquoi);
console.log('ok v4-hook-sonde-panne - ' + n + ' assertions (meilleureClePourMontant execute) ; NE PROUVE PAS le rendu');
