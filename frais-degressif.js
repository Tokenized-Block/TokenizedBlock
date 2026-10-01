/* LE FRAIS DEGRESSIF : 50 bps EN BAS, 10 bps EN HAUT — ET JAMAIS DE FALAISE.
 *
 * ⭐ DECISION DE PHIL (2026-10-01) : « mini 50 bps pour petit montant et tu adaptes au montant ».
 *   C est la structure de marche habituelle, et elle sert directement l objectif : la MEDIANE de
 *   nos echanges est petite, donc la plupart paient le taux haut.
 *
 * ⛔⛔ LES PALIERS VIENNENT DE LA DISTRIBUTION MESUREE, PAS DE MON INTUITION. Taille moyenne d un
 *   trade sur les 250 lignes servies le 2026-10-01 (volume 24 h / trades 24 h) :
 *       p0 0,0164 $ · p5 4,57 $ · p10 12,31 $ · p25 16,25 $ · p50 22,57 $
 *       p75 95,94 $ · p90 329,88 $ · p99 1 672,31 $ · max 1 965,51 $
 *   ⇒ Les paliers sont poses sur p75 (~100 $) et p99 (~1 700 $), donc :
 *       · les TROIS QUARTS des echanges paient 50 bps — c est la ou vit le volume reel ;
 *       · le quart superieur descend a 20 bps ;
 *       · le 1 % qui depasse 1 700 $ descend a 10 bps, le taux que Phil voulait « comme d hab ».
 *   ⛔ ET CE SONT DES PALIERS SUR LE MONTANT EN DOLLARS, donc ils demandent un PRIX. Sans prix lu,
 *     on ne devine pas : on applique le taux LE PLUS HAUT (voir plus bas).
 *
 * ⛔⛔⛔ LE PIEGE QU UN BAREME NAIF OUVRE, ET QUI EST FERME ICI. Avec des taux par tranche appliques
 *   betement au montant entier :
 *       100 $ a 50 bps = 0,50 $        101 $ a 20 bps = 0,202 $
 *   Payer PLUS coutait MOINS, en valeur absolue. C est une falaise, et elle s exploite : il suffit
 *   de pousser son montant juste au-dessus du palier. Ou, pire pour l utilisateur, de le laisser
 *   juste en-dessous sans savoir qu un dollar de plus lui couterait deux fois moins.
 *   ⇒ ON IMPOSE DONC LA MONOTONIE : le frais en valeur absolue ne DIMINUE JAMAIS quand le montant
 *     augmente. Techniquement, le frais d un palier est plancher-e par le frais MAXIMAL du palier
 *     precedent. Le taux effectif, lui, descend bien — c est le but.
 *   ⛔ ET LA MONOTONIE EST TESTEE SUR LES DEUX COTES DE CHAQUE PALIER, au cent pres, parce qu une
 *     propriete verifiee au milieu des tranches ne prouve rien sur les bords.
 */

/** Les etats rendus. Aucun autre n est produit. */
export const ETATS = Object.freeze(['OK', 'REFUSE']);

/**
 * Les paliers, du plus petit au plus grand. `jusquaUsd: null` = la derniere tranche, sans plafond.
 * ⛔ GELES : un bareme qu on peut modifier a l execution n est plus un bareme.
 */
export const PALIERS = Object.freeze([
  /* ⛔ DECISION FINALE DE PHIL (2026-10-01) : « fait comme il a de mieux pour peu taxer donc le
   *   0.1 % 0.2 % et ca soit rentable pour dev ». Elle REMPLACE un plancher a 50 bps qu il avait
   *   evoque avant : 0,2 % en bas, 0,1 % en haut, et rien au-dessus. Taxer peu est le choix, et il
   *   est explicite.
   * ⛔ LE PALIER VIENT TOUJOURS DE LA DISTRIBUTION MESUREE : p75 = 95,94 $, donc 100 $. Les trois
   *   quarts des echanges paient 0,2 %, le quart superieur 0,1 %. */
  Object.freeze({ jusquaUsd: 100, bps: 20n }),   /* p75 mesure a 95,94 $ */
  Object.freeze({ jusquaUsd: null, bps: 10n }),  /* au-dela : 0,1 %, le taux « comme d hab » */
]);

/** ⛔ Le taux le plus HAUT du bareme, applique quand on ne sait pas situer le montant. */
export const BPS_MAX = PALIERS.reduce((m, p) => (p.bps > m ? p.bps : m), 0n);

function entier(x) {
  if (typeof x === 'bigint') return x;
  if (typeof x === 'number' && Number.isInteger(x)) return BigInt(x);
  return null;
}
function nombreFini(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Le taux d un montant en dollars. ⛔ Sans dollars lisibles, le taux le plus haut. */
export function bpsPourUsd(usd) {
  if (!nombreFini(usd) || usd < 0) return BPS_MAX;
  for (const p of PALIERS) {
    if (p.jusquaUsd === null || usd <= p.jusquaUsd) return p.bps;
  }
  return PALIERS[PALIERS.length - 1].bps;
}

/**
 * LE FRAIS D UN MONTANT, EN UNITES DE LA DEVISE PAYEE.
 *
 * @param {bigint} p.montant     en unites entieres de la devise d entree
 * @param {number} p.decimales   les decimales de cette devise, LUES sur le jeton
 * @param {number} [p.prixUsd]   le prix d UNE unite entiere de cette devise, LU — pas suppose
 *
 * ⛔⛔ SANS PRIX LU, ON NE DEVINE PAS LE PALIER : on applique `BPS_MAX`. Le doute coute a NOUS un
 *   revenu potentiel sur les gros montants, jamais a l utilisateur une surprise — et surtout il ne
 *   nous fait jamais SOUS-facturer sur la foi d une supposition. Et la raison est NOMMEE, pour que
 *   l ecran puisse le dire au lieu de laisser croire a un bareme choisi.
 * ⛔ ARRONDI VERS LE BAS : `montant * bps / 10000` tronque, donc on prend un peu MOINS que le taux
 *   affiche. L autre sens depasserait le taux annonce, et un taux depasse est une promesse rompue.
 * ⛔ ET LE FRAIS NE PEUT PAS CONSOMMER TOUT LE MONTANT : on refuse plutot que de rendre un echange
 *   ou il ne reste rien a echanger.
 */
export function fraisPourMontant({ montant, decimales, prixUsd = null } = {}) {
  const m = entier(montant);
  if (m === null || m <= 0n) {
    return { etat: 'REFUSE', frais: null, bps: null, pourquoi: 'the amount must be above zero' };
  }
  if (!Number.isInteger(decimales) || decimales < 0 || decimales > 36) {
    return { etat: 'REFUSE', frais: null, bps: null, pourquoi: 'the decimals must be read from the token' };
  }
  const echelle = 10n ** BigInt(decimales);
  let usd = null;
  if (nombreFini(prixUsd) && prixUsd > 0) {
    /* ⛔ EN ENTIERS AUTANT QUE POSSIBLE : on ne divise qu une fois, a la fin, pour situer le
     *   palier. Le FRAIS, lui, ne passe jamais par un flottant. */
    usd = Number(m * 1000000n / echelle) / 1000000 * prixUsd;
  }
  const bps = usd === null ? BPS_MAX : bpsPourUsd(usd);

  /* ⛔⛔ LA MONOTONIE : le frais est plancher-e par le frais MAXIMAL du palier precedent. Sans ca,
   *   un dollar de plus ferait baisser le frais en valeur absolue — une falaise exploitable. */
  let plancher = 0n;
  if (usd !== null) {
    for (const p of PALIERS) {
      if (p.jusquaUsd === null || usd <= p.jusquaUsd) break;
      /* Le montant, en unites, qui correspond au haut de ce palier — au prix LU. */
      const hautUnites = BigInt(Math.floor((p.jusquaUsd / prixUsd) * Number(echelle)));
      const fraisHaut = (hautUnites * p.bps) / 10000n;
      if (fraisHaut > plancher) plancher = fraisHaut;
    }
  }
  const brut = (m * bps) / 10000n;
  const frais = brut > plancher ? brut : plancher;

  if (frais >= m) {
    return { etat: 'REFUSE', frais: null, bps,
      pourquoi: 'the fee would consume the whole amount — this amount is too small to trade here' };
  }
  return {
    etat: 'OK',
    frais,
    bps,
    /* ⛔ LE TAUX EFFECTIF EST RENDU, parce que le plancher peut le rendre superieur au taux du
     *   palier : c est CE chiffre que l ecran doit montrer, pas le taux nominal. */
    bpsEffectif: m > 0n ? Number((frais * 10000n) / m) : null,
    usd,
    parPlancher: frais > brut,
    pourquoi: usd === null
      ? 'no USD price was read for this currency, so the highest rate applies' : null,
  };
}

/** La phrase montree. ⛔ Elle donne le TAUX EFFECTIF, celui qu on paie — pas le taux du palier. */
export function phraseFraisDegressif(r, symbole = 'the token you pay') {
  if (!r || !ETATS.includes(r.etat)) return 'Fee: not computed.';
  if (r.etat === 'REFUSE') return 'No fee line (' + (r.pourquoi || 'unknown') + ').';
  const taux = (r.bpsEffectif === null ? Number(r.bps) : r.bpsEffectif) / 100;
  const base = 'This app keeps ' + r.frais + ' of ' + symbole + ' — ' + taux + '% of what you pay.';
  if (r.pourquoi) return base + ' ' + r.pourquoi.charAt(0).toUpperCase() + r.pourquoi.slice(1) + '.';
  if (r.parPlancher) {
    /* ⛔ ON DIT POURQUOI LE TAUX EST PLUS HAUT QUE LE PALIER : sinon le chiffre a l air arbitraire. */
    return base + ' A smaller trade would not pay less in absolute terms, so this is the floor from '
      + 'the tier below.';
  }
  return base + ' Larger trades pay a lower rate: ' + PALIERS.map((p) => (Number(p.bps) / 100) + '%'
    + (p.jusquaUsd === null ? ' above $' + PALIERS[PALIERS.length - 2].jusquaUsd
      : ' up to $' + p.jusquaUsd)).join(', ') + '.';
}
