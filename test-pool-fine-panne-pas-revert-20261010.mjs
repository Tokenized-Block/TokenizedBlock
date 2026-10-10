/* test-pool-fine-panne-pas-revert-20261010.mjs - « POOL TROP FINE » SEULEMENT SUR UN REFUS DE LA CHAINE, JAMAIS SUR NOTRE PANNE.
 * Revue de Claude sur 63006c0 (Grok, vente E.T.FFB du hook 7030) : la sonde 1/10, 1/100, 1/1000 partait apres N IMPORTE QUEL echec
 *   du devis - un 429 ou un delai compris. Si le noeud se retablit entre-temps, la fraction cote et l app disait « this pool is too
 *   thin for this amount » : accuser le MARCHE pour NOTRE lecture ratee (le motif « never accuse on own incompleteness »).
 * EXECUTE meilleureClePourMontant (echange.js) avec un quoter simule : panne (429) sur le montant entier, cote a 1/10 ; puis le cas
 *   de Grok (revert sur le montant entier, cote a une fraction) qui doit rester REFUSE nomme. Et estRevertDeChaine sur les messages.
 * AFFIRME : 429 / delai / reseau puis fraction qui cote -> NON_MESURE (jamais poolTropFine) ; revert puis fraction -> REFUSE
 *   poolTropFine ; les deux sites de la sonde (planEchange, meilleureClePourMontant) passent par le meme predicat.
 * NE PROUVE PAS : la branche ETH de planEchange EXECUTEE (epinglee par le texte), ni les messages exacts de chaque noeud.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { meilleureClePourMontant, estRevertDeChaine } from './echange.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const BLOC = '0xb200000000000000000000e0e18f3d8fd5a50164', ETH = '0x0000000000000000000000000000000000000000';
const H7030 = '0x32f3f572dd17625bab9035789c953e1d001864cc';
const CAND = [{ fee: 0, tickSpacing: 200, hooks: H7030 }];
const M = 10n ** 23n;
/* le quoter : le montant ENTIER echoue avec `erreurEntier`, toute fraction cote */
const quoter = (erreurEntier) => async (m, p) => {
  const d = String(p[0].data);
  const montant = BigInt('0x' + d.slice(10 + 64 * 7, 10 + 64 * 8));
  if (montant === M) throw new Error(erreurEntier);
  return '0x' + (montant / 10n ** 8n).toString(16).padStart(64, '0') + '0'.repeat(64);
};
for (const panne of ['HTTP 429', '25/second request limit reached', 'The operation was aborted due to timeout', 'fetch failed']) {
  const r = await meilleureClePourMontant({ rpc: quoter(panne), chaine: 8453, de: BLOC, vers: ETH, montant: M, candidates: CAND });
  vu(r.etat === 'NON_MESURE' && !r.poolTropFine, 'ROUGE->VERT : panne « ' + panne + ' » puis fraction cotee -> ' + r.etat + (r.poolTropFine ? ' poolTropFine (accuse le marche)' : ''));
}
const rv = await meilleureClePourMontant({ rpc: quoter('execution reverted: custom error 0x6190b2b0'), chaine: 8453, de: BLOC, vers: ETH, montant: M, candidates: CAND });
vu(rv.etat === 'REFUSE' && rv.poolTropFine === true && rv.fractionCotee === 10, 'le cas de Grok (revert puis fraction) ne dit plus « too thin » : ' + rv.etat);
/* le predicat */
vu(estRevertDeChaine(new Error('execution reverted')) && estRevertDeChaine('VM Exception while processing transaction: revert'), 'un revert n est pas reconnu');
vu(!estRevertDeChaine(new Error('HTTP 429')) && !estRevertDeChaine(new Error('rate limit: execution reverted later')) && !estRevertDeChaine(null), 'une panne est prise pour un revert');
/* les deux sites */
const src = readFileSync(new URL('./echange.js', import.meta.url), 'utf8');
vu(/estRevertDeChaine\(e\) \? await coteAPlusPetit\(/.test(src), 'la branche ETH de planEchange sonde sans regarder la nature de l echec');
vu(/!estRevertDeChaine\(issues\[i\]\.erreur\)/.test(src), 'meilleureClePourMontant sonde sans regarder la nature de l echec');
console.log('ok pool-fine-panne-pas-revert - ' + n + ' assertions ; NE PROUVE PAS la branche ETH executee');
