// regles-cerveau.js — le block ECRIT SES PROPRES REGLES, et un moteur FERME les applique.
// ================================================================================================
// ⛔ DEMANDE DE PHIL (2026-09-13) : « donne-lui la capacite d ecrire du code ». Choix A retenu : du code LISIBLE qui
//    ne s EXECUTE PAS. Une regle est une ligne de texte d une grammaire minuscule :
//        WHEN <declencheur> [AND mood IS <PHASE>] THEN <action> ["texte"]
//    Le parseur refuse TOUT le reste. Aucun `eval`, aucun `Function`, aucune expression, aucune adresse, aucun appel.
// ⛔⛔ CE QU UNE REGLE PEUT FAIRE, ET RIEN D AUTRE : ecrire une ligne dans le journal du block, ou SUGGERER un geste a
//    un humain (envoyer un GM, graver ce battement). Elle ne signe rien, n envoie rien, ne lit pas le reseau, ne touche
//    ni au wallet ni a la page. Un test verifie la FORME de chaque action rendue : { genre, texte, parce_que }, point.
// ⛔ LE BLOCK ECRIT SES REGLES A PARTIR DE CE QU IL A VU (compteurs d evenements lus sur la chaine), jamais au hasard :
//    une regle n apparait qu apres qu un meme evenement a ete vu au moins deux fois.
// ⛔ LES DECLENCHEURS SONT SUR FRONT : un « nouveau » dure jusqu a la relecture suivante (≈90 s) ; sans front, la meme
//    nouveaute tirerait la regle a chaque battement.

export const DECLENCHEURS = ['new_transfer', 'new_holder', 'new_message', 'price_up', 'price_down', 'market_unread', 'mood_changes'];
export const ACTIONS_REGLE = ['journal', 'suggest_gm', 'suggest_record'];
export const PHASES_REGLE = ['DORMANT', 'EVEILLE', 'CALME', 'CURIEUX', 'EXCITE', 'INQUIET', 'MORT', 'NON_LU'];
export const REGLES_MAX = 8;
export const TEXTE_MAX = 80;
export const ETATS_REGLES = ['VALIDES', 'REFUSEES'];

/* ⛔ le texte d une regle : lettres, chiffres, ponctuation simple. Ni guillemet, ni chevron, ni accolade, ni dollar,
 *    ni antislash, ni backtick — rien qui puisse fermer une chaine ou ouvrir du HTML / un gabarit. */
const TEXTE_SUR = /^[A-Za-z0-9 .,;:!?'()%#+\-–—]{1,80}$/;
const LIGNE = /^WHEN ([a-z_]+)(?: AND mood IS ([A-Z_]+))? THEN ([a-z_]+)(?: "([^"]*)")?$/;

/** Parse UNE ligne. Rend `{ ok: true, regle }` ou `{ ok: false, pourquoi }` — jamais d exception. */
export function lireRegle(ligne) {
  if (typeof ligne !== 'string') return { ok: false, pourquoi: 'not text' };
  if (ligne.length > 140) return { ok: false, pourquoi: 'line longer than 140 characters' };
  const m = LIGNE.exec(ligne);
  if (!m) return { ok: false, pourquoi: 'not of the form WHEN <trigger> [AND mood IS <PHASE>] THEN <action> ["text"]' };
  const [, quand, humeur, faire, texte] = m;
  if (!DECLENCHEURS.includes(quand)) return { ok: false, pourquoi: 'unknown trigger: ' + quand };
  if (humeur !== undefined && !PHASES_REGLE.includes(humeur)) return { ok: false, pourquoi: 'unknown mood: ' + humeur };
  if (!ACTIONS_REGLE.includes(faire)) return { ok: false, pourquoi: 'unknown action: ' + faire };
  if (texte !== undefined && !TEXTE_SUR.test(texte)) return { ok: false, pourquoi: 'text refused (1-80 plain characters, no quotes, brackets, braces, $ or backslash)' };
  return { ok: true, regle: { quand, humeur: humeur || null, faire, texte: texte || null, ligne } };
}

/** Parse un programme (lignes). ⛔ Une seule ligne refusee refuse TOUT : on n applique pas un programme a moitie lu. */
export function lireRegles(lignes) {
  const liste = Array.isArray(lignes) ? lignes : [];
  if (liste.length > REGLES_MAX) return { etat: 'REFUSEES', regles: [], pourquoi: 'more than ' + REGLES_MAX + ' rules' };
  const regles = [];
  for (const [i, l] of liste.entries()) {
    const r = lireRegle(l);
    if (!r.ok) return { etat: 'REFUSEES', regles: [], pourquoi: 'line ' + (i + 1) + ': ' + r.pourquoi };
    regles.push(r.regle);
  }
  return { etat: 'VALIDES', regles, pourquoi: null };
}

/** Les evenements presents dans un battement (`vu` de cerveau.js). */
function presents(vu) {
  if (!vu) return new Set();
  const s = new Set();
  const n = vu.nouveaux || {};
  if (n.gm > 0) s.add('new_transfer');
  if (n.detenteurs > 0) s.add('new_holder');
  if (n.messages > 0) s.add('new_message');
  if (typeof vu.delta === 'number' && vu.delta >= 0.05) s.add('price_up');
  if (typeof vu.delta === 'number' && vu.delta <= -0.05) s.add('price_down');
  if (vu.phase === 'NON_LU') s.add('market_unread');
  return s;
}

/** Les evenements NOUVEAUX de ce battement par rapport au precedent (front montant). */
export function evenementsDuPas(vu, vuAvant) {
  const avant = presents(vuAvant);
  const out = [...presents(vu)].filter((e) => !avant.has(e));
  if (vuAvant && vu && vuAvant.phase !== vu.phase) out.push('mood_changes');
  return out;
}

/** Compte les evenements vus (ce que le block « sait » de lui-meme). */
export function compter(compteurs, evenements) {
  const c = { ...(compteurs || {}) };
  for (const e of evenements) if (DECLENCHEURS.includes(e)) c[e] = (Number(c[e]) || 0) + 1;
  return c;
}

const TEXTES_PAR_DEFAUT = {
  journal: 'Rule fired.',
  suggest_gm: 'A GM would be welcome now.',
  suggest_record: 'This beat may be worth recording on chain.',
};
const GENRE_PAR_ACTION = { journal: 'PENSE', suggest_gm: 'AMELIORER', suggest_record: 'AMELIORER' };

/* ⛔⛔ PRUDENCE (Phil, 2026-09-13 : « ne le bloque pas a fond, mais il faut que le cerveau soit prudent sur le choix des
 *    actions ») : plus un geste demande a un humain, plus le block exige de preuves et d espace entre deux demandes.
 *    Ecrire dans son journal est libre ; suggerer un GM demande 2 evenements vus et 100 battements (≈1 min) d ecart ;
 *    suggerer de graver on-chain (qui coute du gas a l humain) en demande 3 et 300 battements (≈3 min).
 *    Une action retenue n est pas cachee : elle est rendue avec sa raison. */
export const PRUDENCE = Object.freeze({
  journal: Object.freeze({ vusMin: 1, ecartBattements: 0 }),
  suggest_gm: Object.freeze({ vusMin: 2, ecartBattements: 100 }),
  suggest_record: Object.freeze({ vusMin: 3, ecartBattements: 300 }),
});

/**
 * Applique les regles aux evenements du battement, avec prudence.
 * ⛔ REND DES LIGNES DE JOURNAL, RIEN D AUTRE : `lignes` = { genre, texte, parce_que } ; `retenues` = { ligne, pourquoi } ;
 *    `dernieres` = battement de la derniere action par type (a garder pour le battement suivant).
 */
export function appliquerRegles(regles, evenements, { phase = null, compteurs = {}, dernieres = {}, tick = 0 } = {}) {
  const lignes = [], retenues = [];
  const d = { ...(dernieres || {}) };
  for (const r of Array.isArray(regles) ? regles : []) {
    if (!evenements.includes(r.quand)) continue;
    if (r.humeur && r.humeur !== phase) continue;
    const vus = Number(compteurs[r.quand]) || 0;
    const p = PRUDENCE[r.faire];
    if (vus < p.vusMin) { retenues.push({ ligne: r.ligne, pourquoi: 'seen ' + vus + ' time(s), needs ' + p.vusMin }); continue; }
    const derniere = Number(d[r.faire]);
    if (Number.isFinite(derniere) && tick - derniere < p.ecartBattements) {
      retenues.push({ ligne: r.ligne, pourquoi: 'last ' + r.faire + ' ' + (tick - derniere) + ' beat(s) ago, waits ' + p.ecartBattements });
      continue;
    }
    d[r.faire] = tick;
    lignes.push({
      genre: GENRE_PAR_ACTION[r.faire],
      texte: (r.texte || TEXTES_PAR_DEFAUT[r.faire]) + (vus ? ' (#' + vus + ' seen here)' : ''),
      parce_que: 'its own rule: ' + r.ligne,
    });
  }
  return { lignes, retenues, dernieres: d };
}

/* ce que le block ecrit pour chaque evenement vu — des faits et des gestes, jamais un prix promis */
const REGLE_ECRITE = {
  new_transfer: 'WHEN new_transfer THEN journal "Another transfer reached me."',
  new_holder: 'WHEN new_holder THEN suggest_record "A new holder arrived: this beat may be worth recording."',
  new_message: 'WHEN new_message THEN journal "Someone wrote on a transfer to me."',
  price_up: 'WHEN price_up THEN journal "My life went up. It can go down as well."',
  price_down: 'WHEN price_down THEN journal "My life went down. Nobody refunds that."',
  market_unread: 'WHEN market_unread THEN journal "I could not see my market: the network, not me."',
  mood_changes: 'WHEN mood_changes AND mood IS DORMANT THEN suggest_gm "I went back to sleep: a GM would wake me."',
};

/**
 * Le block ecrit son programme a partir de ce qu il a vu : un evenement vu au moins 2 fois donne une regle.
 * Deterministe (ordre : le plus vu d abord, puis l ordre des declencheurs), borne a REGLES_MAX.
 */
export function ecrireRegles(compteurs) {
  const c = compteurs || {};
  return DECLENCHEURS
    .filter((e) => (Number(c[e]) || 0) >= 2)
    .sort((a, b) => (Number(c[b]) - Number(c[a])) || (DECLENCHEURS.indexOf(a) - DECLENCHEURS.indexOf(b)))
    .slice(0, REGLES_MAX)
    .map((e) => REGLE_ECRITE[e]);
}
