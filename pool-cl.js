/* pool-cl.js — LIRE UNE POOL AERODROME CL (ET TOUT FORK UNISWAP v3) DIRECTEMENT SUR LA CHAINE.
 *
 * ⛔⛔ POURQUOI CE MODULE EXISTE, ET CE QU IL NE FERA JAMAIS.
 *     Phil, 2026-09-27 : « mets notre hook sur Aerodrome aussi ». La demande vient d une mesure
 *     juste : 6 blocks sur Aerodrome font 77 531 $ de volume CHACUN, contre 6 974 $ pour les 130
 *     d Uniswap — ONZE FOIS PLUS. C est la ou le flux est.
 *   ⛔⛔ MAIS UN HOOK NE PEUT PAS Y ALLER, ET CE N EST PAS UNE QUESTION DE TRAVAIL. Un hook est un
 *       contrat que le `PoolManager` d Uniswap v4 appelle PENDANT le swap. Mesure sur la pool
 *       MUc/USDC (0x17e1bEB2…1C73), la plus profonde de tout le jeu B20 :
 *           slot0()            -> REPOND     tickSpacing()   -> REPOND
 *           extsload(bytes32)  -> REVERT     stable()        -> REVERT
 *       C est un fork UNISWAP v3 (Aerodrome CL), pas un v4. Il n y a aucun PoolManager pour appeler
 *       notre hook : LE POINT D ACCROCHE N EXISTE PAS.
 *   ⇒ CE QUI EST POSSIBLE, ET QUI EST LE VRAI SUJET : lire ces pools nous-memes. Aujourd hui nous
 *     ne savons PAS les lire — `pool.js` est exclusivement v4 (PoolKey, poolId, StateView), et le
 *     champ `dex` de nos ecrans vient de DexScreener, pas de la chaine. Ce module comble ce trou.
 *
 * ⛔ IL NE REECRIT PAS LA MATHEMATIQUE DU PRIX : il appelle `prixDepuisSqrt` de `pool.js`, deja
 *   eprouvee, qui divise AVANT de convertir pour ne pas faire deborder un double. En refaire une
 *   copie ici donnerait le jumeau plus faible que les correctifs oublient.
 *
 * ⛔ LA DIFFERENCE STRUCTURELLE AVEC v4, ET ELLE EST LA RAISON D ETRE DU FICHIER : en v4 l etat de
 *   TOUTES les pools vit dans UN `PoolManager`, adresse par un `poolId` derive de la PoolKey. En
 *   v3/CL, chaque pool EST son propre contrat : on appelle `slot0()` SUR la pool. Il n y a donc
 *   aucun poolId a calculer, et aucune cle a deviner — l adresse suffit.
 *
 * ⚠️ LECTURE SEULE. Ce module ne construit aucune transaction et ne signe rien.
 */
import { selecteur } from './keccak.js';
import { prixDepuisSqrt } from './pool.js';

/* ⛔ `keccak.js` rend AVEC le prefixe, `pool.js` SANS. Deux homonymes aux conventions opposees —
 *   ca a deja coute seize « Invalid params » dans ce depot. On normalise, on ne suppose pas. */
const sel = (s) => { const x = selecteur(s); return x.startsWith('0x') ? x : '0x' + x; };
const ADR = /^0x[0-9a-fA-F]{40}$/;
const mot = (hex, i = 0) => '0x' + String(hex).slice(2).slice(i * 64, (i + 1) * 64);
const adrDeMot = (hex, i = 0) => '0x' + String(hex).slice(2).slice(i * 64, (i + 1) * 64).slice(24);

/** Les etats possibles. ⛔ `NON_LUE` et `PAS_UNE_POOL_CL` sont DEUX choses differentes : la
 *  premiere est une panne de notre cote, la seconde un fait sur la chaine. Les confondre ferait
 *  disparaitre une pool valide le jour ou le noeud hoquette. */
export const CL_ETATS = Object.freeze(['LUE', 'PAS_UNE_POOL_CL', 'NON_LUE', 'REFUSE']);

/**
 * Lit une pool CL (Aerodrome CL, Uniswap v3, tout fork) a partir de SON ADRESSE.
 * @param {object} o
 * @param {(m:string,p:any[])=>Promise<any>} o.rpc  lecteur JSON-RPC injecte (donc testable)
 * @param {string} o.pool        l adresse de la pool elle-meme
 * @param {string} o.jeton       le block dont on veut le prix
 * @param {number} o.decJeton    ses decimales
 * @param {number} o.decDevise   les decimales de la devise d en face
 * @returns {Promise<{etat:string, prix?:number, sqrtPriceX96?:string, tick?:number,
 *                    liquidite?:string, token0?:string, token1?:string, jetonEst0?:boolean,
 *                    fee?:number, tickSpacing?:number, pourquoi?:string}>}
 */
export async function lirePoolCL({ rpc, pool, jeton, decJeton, decDevise } = {}) {
  if (typeof rpc !== 'function') return { etat: 'REFUSE', pourquoi: 'no chain reader provided' };
  if (!ADR.test(String(pool || ''))) return { etat: 'REFUSE', pourquoi: 'a whole pool address is required' };
  if (!ADR.test(String(jeton || ''))) return { etat: 'REFUSE', pourquoi: 'a whole token address is required' };
  if (!Number.isInteger(decJeton) || !Number.isInteger(decDevise)) {
    /* ⛔ SANS LES DECIMALES ON NE CALCULE RIEN : supposer 18 donnerait un prix faux de plusieurs
     *   ordres de grandeur sur une devise a 6 decimales comme USDC — et il aurait l air normal. */
    return { etat: 'REFUSE', pourquoi: 'decimals are required on both sides — assuming 18 gives a wrong price' };
  }

  /* ⛔⛔ UNE LIMITE DE DEBIT N EST PAS UNE REPONSE, ET J AI COMMIS L ERREUR ICI MEME.
   *     Premiere version : cinq appels en `Promise.all`, qui DECLENCHAIENT la limite du noeud
   *     public. `token0()` rendait « over rate limit », et mon module en concluait « the pool
   *     answered slot0 but not its tokens » — c est-a-dire qu il transformait MA panne en fait sur
   *     la chaine. Mesure : les deux fonctions repondent parfaitement quand on les appelle
   *     espacees. J avais confondu « pas pu regarder » et « n existe pas », dans le code meme qui
   *     est cense faire la difference.
   *   ⇒ On reessaie donc sur une limite de debit, avec une attente qui croit, et on n appelle
   *     JAMAIS en parallele : c est la simultaneite qui creait le probleme. Lent et vrai plutot
   *     que rapide et faux. */
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const lire = async (sig, essais = 4) => {
    for (let i = 0; i < essais; i++) {
      try { return { ok: await rpc('eth_call', [{ to: pool, data: sel(sig) }, 'latest']) }; }
      catch (e) {
        const msg = String((e && e.message) || e);
        /* ⛔ ON NE REESSAIE QUE CE QUI PEUT CHANGER : un revert sera toujours un revert. */
        if (!/rate limit|too many|429|limited|timeout/i.test(msg) || i === essais - 1) return { ko: msg };
        await dormir(250 * (i + 1));
      }
    }
    return { ko: 'unreachable' };
  };

  /* ⛔⛔ `slot0()` EST LE TEST D APPARTENANCE, et son refus n est PAS une panne : une pool Solidly
   *     (Aerodrome v2) ou un contrat quelconque y repond par un revert. On distingue donc les deux
   *     cas par le MESSAGE, au lieu de tout ranger sous « non lu ». */
  const s0 = await lire('slot0()');
  if (s0.ko) {
    const estRevert = /revert/i.test(s0.ko);
    return { etat: estRevert ? 'PAS_UNE_POOL_CL' : 'NON_LUE',
      pourquoi: estRevert ? 'this contract has no slot0() — not a concentrated-liquidity pool' : s0.ko.slice(0, 120) };
  }
  if (!s0.ok || s0.ok === '0x') return { etat: 'PAS_UNE_POOL_CL', pourquoi: 'slot0() returned nothing' };

  /* slot0 : (uint160 sqrtPriceX96, int24 tick, ...) — les deux premiers mots suffisent. */
  let sqrt, tick;
  try {
    sqrt = BigInt(mot(s0.ok, 0));
    const brut = BigInt(mot(s0.ok, 1));
    /* ⛔ `tick` EST UN int24 SIGNE : lu en non signe, un tick negatif devient un nombre immense et
     *   le prix derive part a l infini. On ramene explicitement dans les negatifs. */
    tick = Number(brut >= (1n << 255n) ? brut - (1n << 256n) : brut);
    if (tick > 8388607) tick -= 16777216;
  } catch (e) { return { etat: 'NON_LUE', pourquoi: 'slot0 could not be decoded' }; }
  if (sqrt <= 0n) return { etat: 'PAS_UNE_POOL_CL', pourquoi: 'this pool has no price yet' };

  /* ⛔ SEQUENTIEL, PAS `Promise.all` : c est la simultaneite qui declenchait la limite du noeud
   *   public — et donc le faux verdict « la pool ne repond pas ». Cinq appels espaces coutent
   *   quelques centaines de millisecondes ; un faux verdict coute une pool entiere. */
  const t0 = await lire('token0()');
  const t1 = await lire('token1()');
  const liq = await lire('liquidity()');
  const fee = await lire('fee()');
  const ts = await lire('tickSpacing()');
  if (t0.ko || t1.ko || !t0.ok || !t1.ok) {
    /* ⛔⛔ ET ON DIT LAQUELLE DES DEUX CHOSES S EST PASSEE. « la pool n a pas de tokens » et « on n a
     *     pas pu lire » sont opposees : la premiere disqualifie la pool pour toujours, la seconde
     *     invite a reessayer. Les confondre fait disparaitre une pool valide sur un hoquet. */
    const cause = t0.ko || t1.ko || '';
    const estRevert = /revert/i.test(cause);
    return { etat: estRevert ? 'PAS_UNE_POOL_CL' : 'NON_LUE',
      pourquoi: estRevert ? 'this pool has no token0/token1 — not a concentrated-liquidity pool'
        : 'the pool answered slot0 but its tokens could not be read: ' + String(cause).slice(0, 90) };
  }
  const token0 = adrDeMot(t0.ok).toLowerCase(), token1 = adrDeMot(t1.ok).toLowerCase();
  const bas = String(jeton).toLowerCase();
  if (token0 !== bas && token1 !== bas) {
    /* ⛔ UNE POOL QUI NE CONTIENT PAS LE JETON N EST PAS « NON LUE » : elle est LUE, et elle dit
     *   non. Rendre son prix serait afficher le prix d un autre actif sous le nom du block. */
    return { etat: 'PAS_UNE_POOL_CL', pourquoi: 'this pool does not hold that token' };
  }
  const jetonEst0 = token0 === bas;

  /* ⛔ ON REUTILISE LA MATHEMATIQUE CANONIQUE. `prixDepuisSqrt` attend de savoir si la DEVISE est
   *   currency0 — c est l inverse de `jetonEst0`. Inverser ce booleen rend un prix qui est
   *   exactement son propre inverse : plausible, et faux. */
  const prix = prixDepuisSqrt({ sqrtPriceX96: sqrt, decDevise, decBlock: decJeton, deviseEst0: !jetonEst0 });
  if (prix === null) return { etat: 'NON_LUE', pourquoi: 'price could not be derived from sqrtPriceX96' };

  const nombre = (r) => { try { return r.ok && r.ok !== '0x' ? Number(BigInt(mot(r.ok, 0))) : null; } catch (_) { return null; } };
  return {
    etat: 'LUE',
    prix,
    sqrtPriceX96: sqrt.toString(),
    tick,
    /* ⛔ LA LIQUIDITE RESTE UNE CHAINE : un uint128 depasse la precision d un nombre JS, et
     *   l arrondir ici donnerait un chiffre faux a qui l afficherait. */
    liquidite: (() => { try { return liq.ok && liq.ok !== '0x' ? BigInt(mot(liq.ok, 0)).toString() : null; } catch (_) { return null; } })(),
    token0,
    token1,
    jetonEst0,
    fee: nombre(fee),
    tickSpacing: nombre(ts),
  };
}
