/* achat-marche.js — « Buy » dans Market SEULEMENT la ou un achat est REEL : cle deja connue du serveur, filtres du planificateur,
 * devis du vrai Quoter v4. Lecture seule ; ne signe rien, ne balaye rien.
 *
 * ⛔⛔ MESURE (prod, 2026-10-17 17:12Z, 244 lignes de /api/trending, 2 404 lectures de chaine, 0 ratee) :
 *     · 159 lignes sans Buy. 125 d entre elles n ont que des pools a hook tiers d un meme lanceur (l autre pool est contre mmETH
 *       0x4fc5…4131) et le Quoter v4 REFUSE de les coter (revert 0x6190b2b0) : aucun achat par notre routeur n est possible la.
 *     · Sur les 33 lignes qui AVAIENT Buy par la decouverte client (Initialize des 9 000 derniers blocs, pool a hook « HOOK »
 *       admise), 28 ne cotaient PAS : le bouton ouvrait une fiche NON_MESURE. Un Buy qui ne peut pas acheter est un faux Buy.
 *     · 13 lignes sans Buy ont une pool ETH sur le hook o1 Standard (0x1f91…2acc) qui COTE ; 3 une pool ETH sans hook (0,25 %).
 *       Elles s achetent par planEchange (chemin ETH), avec le frais de 0,5 % pris par le routeur en ETH vers le wallet des frais.
 * ⇒ LE VERDICT EST SERVEUR, par ligne : (1) les cles que le serveur CONNAIT DEJA (/api/cle, cles mesurees) — jamais un balayage
 *   neuf par ligne (/api/cle = 60 % du budget d archive, 2026-10-10) ; (2) les memes filtres que le planificateur (pool ETH, pas de
 *   piege a frais LP > 10 %, regle du fondateur : jamais une pool sans hook ni a hook tiers pour un block TB, jamais TBLOCK, jamais
 *   un frais de hook en block) ; (3) un devis REEL de 0,001 ETH sur le Quoter v4 : une pool qui revert n est pas un marche.
 * ⛔ CE QUE CE MODULE NE PROUVE PAS : que l achat passera a la taille demandee (le plan le re-cote), ni le frais a l arrivee (banc fork
 *   banc-buy-tiers-fork-20261017.mjs, soldes lus). Il dit seulement « un achat par notre routeur est possible la, maintenant ».
 * ⛔ Une lecture ratee n est pas une absence : `nonCotees` garde la cause ; l appelant distingue « pas de marche » de « non lu ». */
import { cleEstUnMarche } from './marche.js';
import { poolSansHookInterdite, cleTouchTblock, hookAdmisPourBlock, fraisHookEnBlock, REFUS_FRAIS_HOOK_EN_BLOCK } from './pool-sans-hook.js';
import { hookPaieEnDeviseVendable, QUOTEUR } from './echange.js';
import { encodeQuote, poolId } from './pool.js';

const ETH = '0x0000000000000000000000000000000000000000';
const bas = (x) => String(x || '').toLowerCase();
/** 0,001 ETH : la taille de la sonde (le Buy de Market propose 0,01 ETH ; une pool qui ne cote pas 0,001 ne cotera pas 0,01). */
export const MONTANT_SONDE_WEI = 10n ** 15n;

/** Le quoter v4 reel : `quoter(cle, montant)` -> BigInt (la sortie cotee) ; leve si la chaine revert ou ne repond pas. */
export function quoterV4({ rpc, chaine = 8453 } = {}) {
  const Q = QUOTEUR[Number(chaine)];
  if (!Q || typeof rpc !== 'function') throw new Error('no v4 quoter on chain ' + chaine);
  return async (cle, montant) => {
    const r = await rpc('eth_call', [{ to: Q, data: encodeQuote({ cle, zeroForOne: true, montant: BigInt(montant) }) }, 'latest']);
    if (!r || String(r).length < 66) throw new Error('empty answer from the quoter');
    return BigInt('0x' + String(r).slice(2, 66));
  };
}

/**
 * @param {{ jeton:string, cles:object[], quoter:Function, montant?:bigint }} o
 *   cles : les cles CONNUES du jeton ({ currency0, currency1, fee, tickSpacing, hooks }), toutes — le contexte juge TB / tiers.
 * @returns {Promise<{ achetable:boolean, cle:object|null, quote:bigint|null, montant:bigint, fraisPar:'hook'|'routeur'|null,
 *   essayees:number, ecartees:object[], nonCotees:object[], pourquoi:string|null }>}
 */
export async function verdictAchatMarche({ jeton, cles = [], quoter, montant = MONTANT_SONDE_WEI } = {}) {
  const j = bas(jeton);
  const m = BigInt(montant);
  const toutes = (Array.isArray(cles) ? cles : []).filter((c) => c && c.currency0 && c.currency1);
  const rendre = (x) => ({ achetable: false, cle: null, quote: null, montant: m, fraisPar: null, essayees: 0, ecartees: [], nonCotees: [], pourquoi: null, ...x });
  if (!/^0x[0-9a-f]{40}$/.test(j)) return rendre({ pourquoi: 'not an address' });
  if (typeof quoter !== 'function') return rendre({ pourquoi: 'no quoter' });
  if (!toutes.length) return rendre({ pourquoi: 'no pool key known to the server for this block' });
  const ecartees = [], candidats = [], vues = new Set();
  for (const c of toutes) {
    const cle = { currency0: bas(c.currency0), currency1: bas(c.currency1), fee: Number(c.fee), tickSpacing: Number(c.tickSpacing), hooks: bas(c.hooks || ETH) };
    const dire = (pourquoi) => ecartees.push({ ...cle, pourquoi });
    if (cle.currency1 !== j && cle.currency0 !== j) { dire('not a pool of this block'); continue; }
    /* le Buy de Market paie en ETH (planEchange, chemin ETH) : une pool cotee en autre chose (mmETH, USDC, une action) n est pas ce bouton */
    if (cle.currency0 !== ETH) { dire('not an ETH pool (quoted in ' + cle.currency0.slice(0, 6) + '…): not this Buy'); continue; }
    let id;
    try { id = poolId(cle); } catch (_) { dire('malformed key'); continue; }
    if (vues.has(id)) continue;
    vues.add(id);
    /* ⛔ les MEMES refus que le planificateur, dans le meme ordre d intention : le piege d abord (il ne depend de rien) */
    if (!cleEstUnMarche(cle)) { dire('static LP fee above 10% (' + (cle.fee / 10000).toFixed(2) + '%): a trap, not a market'); continue; }
    if (cleTouchTblock(cle)) { dire('a TBLOCK pool: no route by TBLOCK'); continue; }
    if (poolSansHookInterdite(cle, [j], toutes)) { dire('no hook on a TokenizedBlock block (founder rule)'); continue; }
    if (!hookAdmisPourBlock(cle, toutes)) { dire('third-party hook on a TokenizedBlock block (founder rule)'); continue; }
    if (REFUS_FRAIS_HOOK_EN_BLOCK && fraisHookEnBlock(cle, j, 'ACHAT', true)) { dire('its hook would take the fee in the block'); continue; }
    candidats.push(cle);
  }
  if (!candidats.length) {
    return rendre({ ecartees, pourquoi: ecartees.length ? ecartees.map((e) => e.pourquoi).join('; ') : 'no ETH pool known' });
  }
  /* le devis REEL, sur chaque candidate ; une qui revert ou ne repond pas est sautee et DITE, jamais devinee */
  const nonCotees = [];
  let meilleure = null;
  for (const cle of candidats) {
    let q;
    try { q = await quoter(cle, m); }
    catch (e) { nonCotees.push({ ...cle, raison: String((e && e.message) || e).slice(0, 120) }); continue; }
    if (typeof q !== 'bigint' || q <= 0n) { nonCotees.push({ ...cle, raison: 'quoted zero' }); continue; }
    if (!meilleure || q > meilleure.quote) meilleure = { cle, quote: q };
  }
  if (!meilleure) {
    return rendre({ essayees: candidats.length, ecartees, nonCotees,
      pourquoi: candidats.length + ' ETH pool(s) known, none quoted (did not quote: ' + nonCotees.map((x) => x.raison).join('; ') + ')' });
  }
  /* qui prend le frais : le hook s il verse deja a6cf dans une devise vendable (nos hooks), sinon le routeur (0,5 % en ETH) */
  const paie = hookPaieEnDeviseVendable({ cle: meilleure.cle, sens: 'ACHAT', zeroForOne: true, jeton: j }).paie;
  return rendre({ achetable: true, cle: meilleure.cle, quote: meilleure.quote, fraisPar: paie ? 'hook' : 'routeur',
    essayees: candidats.length, ecartees, nonCotees });
}
