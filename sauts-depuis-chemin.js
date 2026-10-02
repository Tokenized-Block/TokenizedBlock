/* D UN CHEMIN A DES SAUTS SIGNABLES — le dernier pas entre « une route existe » et « on la bâtit ».
 *
 * ⭐ CE QUI MANQUAIT. `pont-de-liquidite.js` rend un chemin `[{ de, vers, famille }]` : il decide
 *   sur l EXISTENCE. `planEchangeMultiSauts` exige des sauts `[{ cle, zeroForOne }]` : il construit
 *   du CALLDATA. Entre les deux il faut RESOUDRE chaque jambe en une PoolKey V4 — et une PoolKey
 *   ne se deduit pas d un chemin, elle se MESURE.
 *
 * ⛔⛔ CE MODULE NE LIT RIEN LUI-MEME : le resolveur lui est INJECTE. C est la meme discipline que
 *   le pont, et pour la meme raison : si la lecture vivait ici, un refus de resolution et une
 *   lecture ratee rendraient le meme objet, et on ne saurait plus lequel on tient. Le resolveur
 *   injecte rend son propre etat, et on le PROPAGE au lieu de le traduire.
 *
 * ⛔⛔⛔ LA RESOLUTION EST GLOUTONNE, SAUT PAR SAUT, ET CE N EST PAS NEUTRE.
 *   Pour choisir la meilleure pool d une jambe il faut un MONTANT — la profondeur depend de la
 *   taille. On ne connait exactement que le montant du PREMIER saut ; les suivants viennent du
 *   devis du precedent. Donc :
 *     · le devis sert d estimation pour la jambe d apres, et il est rendu par le resolveur ;
 *     · le choix est OPTIMAL SAUT PAR SAUT, PAS GLOBALEMENT. Une combinaison de pools legerement
 *       moins bonne au saut 1 pourrait rendre plus au saut 3. On ne le cherche pas, et on le DIT.
 *   ⛔ ET LE MONTANT DE DEPART EST BRUT, PAS NET DU FRAIS. Le frais est preleve en tete par
 *     `planEchangeMultiSauts`, qui le calcule lui-meme ; on resout donc sur un montant superieur
 *     d au plus 0,2 %. Un ecart de 0,2 % ne fait presque jamais basculer le choix d une pool —
 *     « presque jamais » n est pas « jamais », et c est ecrit ici pour qu on ne le decouvre pas en
 *     lisant un devis surprenant.
 *
 * ⛔ UN SEUL SAUT NON RESOLU REFUSE TOUTE LA ROUTE, ET LE NUMERO DU SAUT EST DIT. Rendre une route
 *   partielle serait livrer un calldata qui s arrete au milieu — l utilisateur signerait un echange
 *   qui ne finit pas la ou il croit. Et « une route a echoue » sans dire OU envoie chercher partout.
 */

import { estBlockDeRoute, cleSansHook, MESSAGE_PAS_ICI, RE_B20 } from './pool-sans-hook.js';

/** Les etats rendus. ⛔ Aucun autre. */
export const ETATS = Object.freeze(['OK', 'REFUSE', 'NON_MESURE']);

/** ⛔ La meme borne que l assembleur V4 : au-dela, ce n est plus une route, c est une loterie. */
export const SAUTS_MAX = 4;

const bas = (x) => String(x || '').toLowerCase();

/**
 * @param {object[]} p.chemin   [{ de, vers, famille }] venu de `cheminEntre`
 * @param {bigint}   p.montant  le montant d entree, en unites du jeton paye
 * @param {function} p.resoudre async ({ de, vers, montant }) => { etat, cle, zeroForOne, quote }
 * @returns {{etat, sauts, sortieEstimee, resolus, pourquoi}}
 *
 * ⛔ `resoudre` PEUT RENDRE `NON_MESURE` : on le propage TEL QUEL, sans le traduire en REFUSE.
 *   « on n a pas su lire » et « il n y a rien » ne se corrigent pas de la meme facon, et les fondre
 *   est le defaut numero un de ce depot.
 */
export async function sautsDepuisChemin({ chemin, montant, resoudre } = {}) {
  if (!Array.isArray(chemin) || !chemin.length) {
    return { etat: 'REFUSE', sauts: null, sortieEstimee: null, resolus: 0,
      pourquoi: 'no path to resolve' };
  }
  if (chemin.length > SAUTS_MAX) {
    return { etat: 'REFUSE', sauts: null, sortieEstimee: null, resolus: 0,
      pourquoi: 'a route of ' + chemin.length + ' hops is longer than the ' + SAUTS_MAX
        + ' we build — each hop is another chance to fail' };
  }
  /* ⛔⛔ UNE SEULE FAMILLE, VERIFIEE ICI AUSSI. `peutEtreAssemblee` le verifie deja en amont, mais
   *   un module qui construit du calldata ne doit pas dependre d un controle fait ailleurs : un
   *   appelant futur l oublierait, et le revert arriverait chez l utilisateur. */
  const familles = [...new Set(chemin.map((s) => s && s.famille))];
  if (familles.length !== 1 || familles[0] !== 'uniswap-v4') {
    return { etat: 'REFUSE', sauts: null, sortieEstimee: null, resolus: 0,
      pourquoi: 'this builder only assembles a single uniswap-v4 segment, and this path runs on '
        + familles.join(' then ') };
  }
  let m;
  try { m = BigInt(montant); } catch (_) { m = 0n; }
  if (m <= 0n) {
    return { etat: 'REFUSE', sauts: null, sortieEstimee: null, resolus: 0,
      pourquoi: 'the amount must be above zero' };
  }
  if (typeof resoudre !== 'function') {
    return { etat: 'REFUSE', sauts: null, sortieEstimee: null, resolus: 0,
      pourquoi: 'no pool resolver was given' };
  }
  /* ⛔ LE CHEMIN DOIT SE TENIR : la sortie d un saut est l entree du suivant. Un chemin troue
   *   produirait des sauts qui ne se chainent pas, et le revert viendrait du PoolManager sans rien
   *   expliquer. On le verifie AVANT de depenser le moindre appel reseau. */
  for (let i = 1; i < chemin.length; i += 1) {
    if (bas(chemin[i].de) !== bas(chemin[i - 1].vers)) {
      return { etat: 'REFUSE', sauts: null, sortieEstimee: null, resolus: 0,
        pourquoi: 'hop ' + (i + 1) + ' does not start where hop ' + i + ' ends' };
    }
  }
  /* ⛔⛔ 2026-10-02 (Zero 1, R4g) — LES MEMES REGLES QUE planEchangeMultiSauts, ICI AUSSI, fail-closed : un block
   *   INTERMEDIAIRE (ni le premier `de` ni le dernier `vers`) refuse la route avant toute lecture ; deux jambes
   *   hookees ou plus la refusent apres resolution (au plus un frais vers a6cf). Ici, un block = un B20 (0xb2…) qui
   *   n est pas une devise connue ; le planificateur, qui recoit `fraisDevisesOk`, refuse en plus tout jeton inconnu. */
  for (let i = 0; i < chemin.length - 1; i += 1) {
    if (RE_B20.test(String(chemin[i].vers || '')) && estBlockDeRoute(chemin[i].vers)) {
      return { etat: 'REFUSE', sauts: null, sortieEstimee: null, resolus: 0, pourquoi: MESSAGE_PAS_ICI, refusBlocIntermediaire: true };
    }
  }

  const sauts = [];
  let courant = m;
  for (const [i, s] of chemin.entries()) {
    const r = await resoudre({ de: s.de, vers: s.vers, montant: courant });
    if (!r || r.etat !== 'OK' || !r.cle) {
      /* ⛔ L ETAT DU RESOLVEUR EST PROPAGE, PAS TRADUIT — et le NUMERO du saut est dit. */
      return {
        etat: r && r.etat === 'NON_MESURE' ? 'NON_MESURE' : 'REFUSE',
        sauts: null, sortieEstimee: null, resolus: i,
        pourquoi: 'hop ' + (i + 1) + ' (' + bas(s.de).slice(0, 8) + ' to ' + bas(s.vers).slice(0, 8)
          + ') has no pool we can build: ' + ((r && r.pourquoi) || 'the resolver said nothing'),
      };
    }
    if (typeof r.zeroForOne !== 'boolean') {
      /* ⛔⛔ UNE DIRECTION ABSENTE NE SE DEVINE PAS. Supposer `true` est exactement le defaut
       *   trouve dans `planEthVersUsdc` : juste par accident sur l ETH, faux ailleurs. Un swap
       *   dans le mauvais sens ne reverte pas toujours — il peut VENDRE ce qu on voulait acheter. */
      return { etat: 'REFUSE', sauts: null, sortieEstimee: null, resolus: i,
        pourquoi: 'hop ' + (i + 1) + ' came back without a direction, and a direction is never guessed' };
    }
    sauts.push({ cle: r.cle, zeroForOne: r.zeroForOne });
    /* ⛔ LE DEVIS SERT D ESTIMATION POUR LE SAUT SUIVANT. Sans devis utilisable on NE CONTINUE PAS
     *   sur le montant precedent : ca resoudrait la jambe d apres sur une taille qui n a rien a
     *   voir, et le choix de pool serait pris sur un chiffre invente. */
    if (i < chemin.length - 1) {
      let q = 0n;
      try { q = BigInt(r.quote); } catch (_) { q = 0n; }
      if (q <= 0n) {
        return { etat: 'NON_MESURE', sauts: null, sortieEstimee: null, resolus: i + 1,
          pourquoi: 'hop ' + (i + 1) + ' gave no usable quote, so the next hop would be sized on a '
            + 'number we made up' };
      }
      courant = q;
    } else {
      try { courant = BigInt(r.quote); } catch (_) { courant = 0n; }
    }
  }
  if (sauts.filter((x) => !cleSansHook(x.cle)).length >= 2) {
    return { etat: 'REFUSE', sauts: null, sortieEstimee: null, resolus: sauts.length, pourquoi: MESSAGE_PAS_ICI, refusPlusieursHooks: true };
  }
  return {
    etat: 'OK', sauts, resolus: sauts.length,
    /* ⚠️ `sortieEstimee` EST UNE ESTIMATION DE RESOLUTION, PAS LE DEVIS DE L ECHANGE. Elle est
     *   calculee sur le montant BRUT (frais non deduit) et saut par saut. Le chiffre qui engage
     *   l app est celui de `planEchangeMultiSauts`, qui recote tout. L afficher comme un devis
     *   serait annoncer un montant qu on ne tient pas. */
    sortieEstimee: courant > 0n ? courant : null,
    pourquoi: null,
  };
}
