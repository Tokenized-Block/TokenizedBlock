/* lectures-en-vol.js — DES LECTURES INDEPENDANTES, LANCEES EN MEME TEMPS, SANS JAMAIS DEPASSER UNE BORNE.
 *
 * POURQUOI (2026-10-04). Mesure du jour sur le planificateur de prod : un plan a un saut 5 s, une route a deux sauts 27 a 56 s,
 *   alors que le panneau borne ses lectures a 8 s. Compte sur fork (compter-lectures-plan-20261004.mjs) : 7 a 27 lectures par
 *   plan, JAMAIS plus d UNE en vol — chaque lecture attendait la reponse de la precedente, meme quand elle n en dependait pas
 *   (les quatre devis d une meme paire, les decimales et la supply d un meme jeton, les deux autorisations Permit2).
 *
 * CE QUE CE MODULE FAIT. Trois outils, sans aucune regle de route ni de frais :
 *   - `enVolBorne`   : lance une tache par element, au plus `borne` en vol, et rend les ISSUES DANS L ORDRE DE LA LISTE ;
 *   - `lireEnsemble` : meme chose pour des lectures dont on veut TOUTES les valeurs, ou la premiere erreur dans l ordre ;
 *   - `lecteurBorne` : enveloppe un lecteur pour qu il n ait jamais plus de `borne` appels en vol, quel que soit l appelant.
 *
 * ⛔⛔ L ORDRE DE LA LISTE EST CELUI DU RESULTAT, JAMAIS L ORDRE D ARRIVEE. Le code d avant lisait dans l ordre et decidait dans
 *   l ordre (« le premier candidat gagne une egalite », « la premiere erreur est celle qu on rend »). Decider a l arrivee ferait
 *   dependre un plan de la vitesse d un noeud : deux appels identiques rendraient deux pools differentes.
 * ⛔⛔ UNE TACHE QUI LEVE N ARRETE PAS LES AUTRES, ET ON ATTEND TOUT LE MONDE. `Promise.all` rend la main au premier echec en
 *   laissant les autres lectures EN VOL : elles depasseraient la borne des que l appelant relance, et finiraient apres le retour.
 * ⛔ LES TACHES SONT LANCEES DANS L ORDRE DE LA LISTE (la i-eme lancee est la i-eme de la liste) : un lecteur de laboratoire
 *   qui repond « dans l ordre des appels » reste juste.
 *
 * ⛔ CE QUE CE MODULE NE PROUVE PAS : qu un noeud public accepte `borne` lectures a la fois. Hors reseau, avec un lecteur qui
 *   met 40 ms par appel, le temps mur baisse (test-lectures-paralleles-20261004.mjs). En production les noeuds LIMITENT le
 *   debit : le gain reel ne se lit qu apres un deploiement, et il n est PAS mesure ici.
 */

/** Combien de lectures d un meme plan peuvent etre en vol. 4 = le nombre de noeuds de la liste large du serveur
 *  (`RPC_FAITS_POOL`, serveur-web.js), qui tourne a chaque appel : au plus une lecture par noeud au meme instant. */
export const LECTURES_EN_VOL_MAX = 4;

const borneSaine = (b, n) => {
  const x = Math.floor(Number(b));
  return Math.max(1, Math.min(Number.isFinite(x) && x >= 1 ? x : 1, n));
};

/**
 * Lance `fn(element, index)` sur chaque element, au plus `borne` a la fois.
 * @returns {Promise<Array<{ok:true, valeur:any}|{ok:false, erreur:any}>>}  une issue par element, DANS L ORDRE DE LA LISTE.
 * ⛔ Ne leve jamais : une tache qui leve (meme avant son premier `await`) rend `{ ok: false, erreur }` a SA place.
 */
export async function enVolBorne(liste, fn, borne = LECTURES_EN_VOL_MAX) {
  const elements = Array.isArray(liste) ? liste : [];
  const issues = new Array(elements.length);
  let suivant = 0;
  const ouvrier = async () => {
    while (suivant < elements.length) {
      const i = suivant; suivant += 1;
      try { issues[i] = { ok: true, valeur: await fn(elements[i], i) }; }
      catch (erreur) { issues[i] = { ok: false, erreur }; }
    }
  };
  await Promise.all(Array.from({ length: borneSaine(borne, elements.length) }, ouvrier));
  return issues;
}

/**
 * Des lectures independantes dont on veut TOUTES les valeurs : `lectures` est une liste de fonctions sans argument.
 * Rend les valeurs dans l ordre de la liste. Si une lecture leve, on ATTEND les autres, puis on leve la PREMIERE erreur dans
 * l ordre de la liste — celle que la version sequentielle aurait levee.
 */
export async function lireEnsemble(lectures, borne = LECTURES_EN_VOL_MAX) {
  const issues = await enVolBorne(lectures, (f) => f(), borne);
  for (const x of issues) if (!x.ok) throw x.erreur;
  return issues.map((x) => x.valeur);
}

/**
 * Le meme lecteur `(methode, params) => Promise`, avec au plus `borne` appels en vol. Les appels en trop attendent leur tour
 * dans l ordre ou ils ont ete demandes (file). Reponses et erreurs passent telles quelles.
 * ⛔ Il ne reessaie rien, ne garde rien en memoire et ne change aucun parametre : ce n est qu une file.
 */
export function lecteurBorne(rpc, borne = LECTURES_EN_VOL_MAX) {
  const max = borneSaine(borne, Infinity);
  const file = [];
  let enVol = 0;
  const liberer = () => { enVol -= 1; const s = file.shift(); if (s) s(); };
  return (methode, params) => new Promise((ok, ko) => {
    const lancer = () => {
      enVol += 1;
      let p;
      try { p = Promise.resolve(rpc(methode, params)); } catch (e) { p = Promise.reject(e); }
      p.then((v) => { liberer(); ok(v); }, (e) => { liberer(); ko(e); });
    };
    if (enVol < max) lancer(); else file.push(lancer);
  });
}
