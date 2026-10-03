/* LA LISTE « CREE MAIS PAS ENCORE VIVANT » — ET POURQUOI ELLE NE DOIT PLUS BLOQUER.
 *
 * ⛔⛔ LE DEFAUT VECU (Phil, 2026-09-30) : il cree un block, le flux enchaine les transactions,
 *   paie, puis casse. La ligne reste. Au coup suivant, Create est REFUSE tant qu il n a pas
 *   clique « dismiss » sur un block qui, lui, est peut-etre deja VIVANT.
 *
 * ⛔ LA CAUSE EST DANS LE CODE, PAS DANS L UTILISATEUR : `aLancerRetirer` n etait appele que par
 *   DEUX chemins — un Launch confirme DANS CE NAVIGATEUR, et le bouton « dismiss ». RIEN n a
 *   jamais regarde la chaine. Le commentaire d origine l avouait deja : « un Launch fait
 *   ailleurs laisse la ligne jusqu a dismiss ». Une memoire locale jamais reconciliee finit
 *   toujours par mentir.
 *
 * ⛔⛔⛔ ET LE MOTIF DU BLOCAGE A EXPIRE. Il est ecrit noir sur blanc dans `app.html` :
 *     « Measured 2026-09-22: IB022 open fee paid, Launch mint sim reverted, Create still offered
 *       FREE -> infinite asleep blocks. »
 *   Le refus dur existait parce que creer etait GRATUIT. Ce n est plus vrai : « Free create is
 *   retired on Base », chaque naissance coute 0,001 ETH. Le frein, c est le frais — pas un mur
 *   pose sur une liste que personne ne met a jour. Une garde correcte PAR ACCIDENT hier devient
 *   fausse quand la condition qui la justifiait disparait.
 *
 * ⇒ DEUX CHANGEMENTS, ET UN SEUL EST UNE FAVEUR :
 *   1. on RETIRE automatiquement ce qu on peut PROUVER vivant — c est une correction ;
 *   2. on n empeche plus de creer quand on ne peut PAS prouver — c est une decision produit,
 *      demandee explicitement (« ca doit pas demiss »), et le rappel reste affiche.
 */

export const VERDICTS = Object.freeze(['VIVANT_PROUVE', 'NON_PROUVE', 'ENTREE_INVALIDE']);

/**
 * Ce block est-il PROUVE vivant ?
 *
 * ⛔ ASYMETRIE VOULUE : seule une PREUVE POSITIVE retire une ligne. Une absence ne prouve rien —
 *   l index public ne liste un block qu au-dela d un seuil de transferts, et la decouverte de
 *   pools ne voit que ce qu elle a eu le temps de lire. Retirer sur une absence effacerait des
 *   rappels legitimes ; c est pour ca qu on ne le fait pas.
 */
export function etatDuBlock(adr, { marches = null, poolPour = null } = {}) {
  const a = String(adr || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return { verdict: 'ENTREE_INVALIDE', preuve: null };
  /* Preuve 1 : l index public le cote — il a donc un marche lisible. */
  if (marches && typeof marches.has === 'function' && marches.has(a)) {
    return { verdict: 'VIVANT_PROUVE', preuve: 'MARCHE_COTE' };
  }
  /* Preuve 2 : une pool a ete decouverte pour lui sur la chaine (evenement Initialize). */
  if (typeof poolPour === 'function') {
    let p = null;
    try { p = poolPour(a); } catch (_) { p = null; }
    if (p) return { verdict: 'VIVANT_PROUVE', preuve: 'POOL_DECOUVERTE' };
  }
  return { verdict: 'NON_PROUVE', preuve: null };
}

/**
 * Reconcilie la liste avec ce qu on sait de la chaine.
 * Rend { gardes, retires } — et `retires` porte la preuve, pour qu un retrait ne soit jamais
 * silencieux ni invérifiable.
 */
export function reconcilier(liste, contexte = {}) {
  const l = Array.isArray(liste) ? liste : [];
  const gardes = [], retires = [];
  for (const b of l) {
    const adr = b && b.adr;
    const r = etatDuBlock(adr, contexte);
    if (r.verdict === 'VIVANT_PROUVE') retires.push({ ...b, preuve: r.preuve });
    else gardes.push(b);   /* ⛔ une entree invalide reste : la juger nous ferait perdre un rappel */
  }
  return { gardes, retires };
}

/**
 * Create doit-il etre REFUSE a cause de cette liste ?
 * ⛔ NON — et c est le coeur du correctif. La fonction existe pour que la reponse soit ECRITE
 *   quelque part plutot que diluee dans un `if` de 900 lignes, et pour qu une mutation qui la
 *   remet a `true` soit ATTRAPEE.
 */
export function bloqueLaCreation() {
  return false;
}

/**
 * Le rappel a afficher. Il reste VISIBLE — on retire le mur, pas l information.
 * ⛔ Rend '' quand il n y a rien a rappeler : ici le silence EST le succes.
 */
export function phraseRappel(liste) {
  const l = Array.isArray(liste) ? liste.filter((b) => b && /^0x[0-9a-f]{40}$/.test(String(b.adr || '').toLowerCase())) : [];
  if (!l.length) return '';
  return l.length + ' block' + (l.length === 1 ? '' : 's')
    + ' you made here ' + (l.length === 1 ? 'has' : 'have') + ' no market yet. '
    + 'Bringing ' + (l.length === 1 ? 'it' : 'them') + ' to life costs 0.001 ETH — '
    + 'and you can create another one meanwhile.';
}
