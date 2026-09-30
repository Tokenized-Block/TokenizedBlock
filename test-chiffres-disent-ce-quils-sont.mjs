/* test-chiffres-disent-ce-quils-sont.mjs — UN CHIFFRE VRAI MAL ATTRIBUE EST UNE SUR-VENTE.
 *
 * ⛔⛔ DEUX DEFAUTS REELS, MESURES LE 2026-09-30, ET LE PREMIER A TROMPE NOTRE PROPRE FONDATEUR :
 *
 *   1. LE VOLUME DU TRENDING. L ecran affichait « 224 blocks with a live market · $64.9M traded in
 *      24h · figures from DexScreener ». Le chiffre est VRAI et sa source etait citee — mais rien
 *      ne disait A QUI est ce volume. C est celui du MARCHE B20 ENTIER sur Base, que nous ne
 *      faisons qu AFFICHER. Phil l a lu comme le notre et en a conclu « app a succes ».
 *      Ce que la mesure du meme jour dit de notre part : a6cf n a recu AUCUN jeton d action
 *      (132 fenetres, 0 refusee), le CreateRouter a 0 transaction sur 14,1 jours (305 fenetres,
 *      0 refusee), l entonnoir compte 2 achats AU TOTAL.
 *      ⇒ Quand le fondateur se trompe en lisant son propre ecran, ce n est pas lui qui a mal lu.
 *
 *   2. LE SOLDE BRUT D UNE ACTION TOKENISEE. L emetteur (Coinbase) declare sur son site que
 *      dividendes et splits passent par un MULTIPLICATEUR on-chain, sans toucher au solde.
 *      `multiplier()` lu sur nos 14 actions, 14/14 : GOOGLc 1,000377x et METAc 1,000314x ont DEJA
 *      derive. L ecart est de 0,03 % aujourd hui ; un split 4:1 le porterait a 300 %.
 *
 * ⚠️ BORNE : ce fichier lit du TEXTE et teste un module pur. Il ne prouve pas qu un visiteur voie
 *    la phrase — seulement qu elle est ecrite, au bon endroit, et qu elle ne peut pas disparaitre
 *    en silence.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { etatMultiplicateur, phraseMultiplicateur, MULTIPLICATEUR_NEUTRE, ETATS_MULTIPLICATEUR,
  SELECTEUR_MULTIPLIER } from './multiplicateur-action.js';

/* ⛔⛔⛔ LE DEPOUILLEMENT VIENT DE `outils-test.js`, PAS D UNE COPIE LOCALE. Quatre gardes ont rougi
 *      sur du code correct en un seul jour parce qu elles cherchaient une chaine que le COMMENTAIRE
 *      voisin citait. Reecrire l outil dans chaque test, c est reintroduire la faute a chaque
 *      fichier : il vit en UN endroit, et il s accuse lui-meme s il ne retire rien. */
import { sansCommentaires } from './outils-test.js';

const brut = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const html = sansCommentaires(brut, { minRetire: 5000 });
let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

/* ══ 1. LE VOLUME EST ATTRIBUE ═══════════════════════════════════════════════════════════════ */
cas('⛔ LE VOLUME DU TRENDING EST RATTACHE AUX MARCHES, ET SA SOURCE EST CITEE', () => {
  /* ⛔⛔ CETTE GARDE A ETE REDUITE LE 2026-09-30, SUR DECISION DE PHIL, ET JE LE DIS PLUTOT QUE DE
   *     LA LAISSER POURRIR. Elle exigeait la phrase « not this app's volume ». Phil l a fait
   *     retirer (« c est du marketing, faut pas toujours tout ecrire au public ») ; c est son
   *     produit et il a tranche apres que j aie fait valoir le contraire. Affaiblir une garde en
   *     silence pour qu elle passe serait pire que la retirer : elle est retiree, et la raison est
   *     ecrite ici.
   *   ⇒ CE QUI RESTE GARDE : le verbe rattache le volume AUX MARCHES LISTES, pas a l app, et la
   *     source reste citee. Deux mots, pas une mise en garde.
   *   ⚠️ CE QUI N EST PLUS GARDE, ET QUI RESTE VRAI : ce volume n est PAS le notre. a6cf n a recu
   *     aucun jeton d action, le CreateRouter a 0 transaction, l entonnoir compte 2 achats au
   *     total. Ne JAMAIS reprendre ce chiffre comme le notre dans un commit, une mesure ou une
   *     copie. L ecran ne le dit plus ; nous, on le sait. */
  const i = html.indexOf('blocks with a live market');
  assert.ok(i > 0, 'la ligne du trending est introuvable : ce controle ne garde rien');
  const ligne = html.slice(i, i + 300);
  assert.match(ligne, /traded across these markets/,
    'le volume n est plus rattache aux marches listes : formule ainsi, il se lit comme celui de '
    + 'cette app — c est exactement ce qui a fait conclure « app a succes »');
  assert.match(ligne, /DexScreener/, 'la source du chiffre a disparu');
});

cas('⛔ TEMOIN : la garde d attribution DETECTE vraiment le retour a la formule ambigue', () => {
  /* ⛔ Sans ce temoin, la garde serait verte meme si elle cherchait une chaine toujours presente.
   * ⛔⛔ ET IL MUTE LA FORMULE ACTUELLE, PAS L ANCIENNE : mon premier temoin remplacait encore
   *     « not this app's volume », retiree entre-temps — la mutation etait donc un NO-OP et le
   *     temoin ne prouvait plus rien. Un temoin qui mute une chaine disparue est un temoin mort,
   *     et il meurt en silence. */
  const mutant = html.replace('traded across these markets in 24h', 'traded in 24h');
  assert.notEqual(mutant, html,
    'mutation sans effet : la formule attendue n existe plus dans le code, donc ce temoin est mort');
  const i = mutant.indexOf('blocks with a live market');
  assert.doesNotMatch(mutant.slice(i, i + 300), /traded across these markets/,
    'la garde ne verrait pas le retour a « traded in 24h » tout court — la formulation qui a fait '
    + 'lire ce volume comme le notre');
});

/* ══ 2. LE MULTIPLICATEUR ════════════════════════════════════════════════════════════════════ */
cas('⛔ NEUTRE / DERIVE / NON_MESURE : trois etats, jamais deux', () => {
  assert.equal(etatMultiplicateur(MULTIPLICATEUR_NEUTRE).etat, 'NEUTRE');
  assert.equal(etatMultiplicateur(1000377118676784179n).etat, 'DERIVE');   /* GOOGLc, mesure */
  assert.equal(etatMultiplicateur(1000313792289598084n).etat, 'DERIVE');   /* METAc, mesure */
  for (const rien of [null, undefined, NaN, 'pas un nombre', {}, [], -1, '0xzz']) {
    assert.equal(etatMultiplicateur(rien).etat, 'NON_MESURE', 'entree ' + String(rien));
  }
  for (const e of [MULTIPLICATEUR_NEUTRE, 1000377118676784179n, null]) {
    assert.ok(ETATS_MULTIPLICATEUR.includes(etatMultiplicateur(e).etat));
  }
});

cas('⛔⛔ UN MULTIPLICATEUR ILLISIBLE N EST JAMAIS « NEUTRE »', () => {
  /* ⛔⛔ C EST LA GARDE CENTRALE. Traiter l illisible comme neutre ferait TAIRE l avertissement
   *     exactement quand on ne sait pas — c est-a-dire au pire moment. */
  const r = etatMultiplicateur(null);
  assert.equal(r.etat, 'NON_MESURE');
  assert.notEqual(r.etat, 'NEUTRE');
  assert.equal(r.facteur, null, 'un facteur est annonce alors que rien n a ete lu');
  assert.match(phraseMultiplicateur(r, 'GOOGLc'), /could not read/i);
});

cas('⛔ L ECART EST SIGNE, ET UN MULTIPLICATEUR SOUS 1 EXISTE AUSSI', () => {
  /* ⛔ Un regroupement d actions ferait DESCENDRE le multiplicateur. Afficher une valeur absolue
   *   cacherait le sens du mouvement — et le sens est l information. */
  const haut = etatMultiplicateur(1000377118676784179n);
  assert.ok(haut.ecartBps > 0n, 'un multiplicateur au-dessus de 1 rend un ecart positif');
  const bas = etatMultiplicateur(MULTIPLICATEUR_NEUTRE / 2n);
  assert.equal(bas.etat, 'DERIVE');
  assert.ok(bas.ecartBps < 0n, 'un multiplicateur sous 1 doit rendre un ecart NEGATIF, pas absolu');
});

cas('⛔⛔ RIEN N EST DIT QUAND IL N Y A RIEN A DIRE', () => {
  /* ⛔⛔ UN AVERTISSEMENT PERMANENT DEVIENT INVISIBLE. `NEUTRE` doit rendre une chaine VIDE, sinon
   *     les 12 actions neutres useraient l attention et le vrai split passerait inapercu. */
  assert.equal(phraseMultiplicateur(etatMultiplicateur(MULTIPLICATEUR_NEUTRE), 'AAPLc'), '');
  assert.ok(phraseMultiplicateur(etatMultiplicateur(1000377118676784179n), 'GOOGLc').length > 40);
});

cas('⛔ LE MODULE NE RECALCULE RIEN, et ce choix doit rester explicite', () => {
  /* ⛔⛔ J ai mesure que `multiplier()` EXISTE, PAS comment il entre dans le calcul officiel.
   *     Multiplier le solde par ce facteur serait inventer une formule et l afficher comme un fait.
   *     Si quelqu un ajoute ce calcul un jour, ce test doit le forcer a y penser. */
  /* ⛔⛔ MA PREMIERE VERSION CHERCHAIT LE MOT « solde » OU « balance » DANS LE CODE DEPOUILLE. Elle
   *     rougissait sur la PHRASE ANGLAISE destinee a l ecran, qui parle legitimement de ce que le
   *     visiteur detient. Confondre « mentionner » et « manipuler » est exactement le travers du
   *     `MAX_UINT256` trouve dans un commentaire le matin meme.
   *   ⇒ ON TESTE LE COMPORTEMENT : la fonction ne recoit qu UN multiplicateur — elle n a donc aucun
   *     solde a rescaler — et ce qu elle rend ne contient AUCUNE quantite. Si quelqu un ajoute un
   *     jour un parametre de solde ou un champ de quantite recalculee, ce test le voit. */
  assert.equal(etatMultiplicateur.length, 1,
    'la fonction prend maintenant plus d un argument : on lui passe probablement un solde, et elle '
    + 'ne doit RIEN rescaler sur une formule qui n a pas ete lue');
  const r = etatMultiplicateur(1000377118676784179n);
  assert.deepEqual(Object.keys(r).sort(), ['ecartBps', 'etat', 'facteur', 'pourquoi'],
    'le resultat porte un champ inattendu — une quantite recalculee s y serait glissee : '
    + Object.keys(r).join(', '));
  /* ⛔ ET LE FACTEUR RENDU EST EXACTEMENT CE QUI A ETE LU, jamais un produit. */
  assert.equal(r.facteur, 1000377118676784179n, 'le facteur rendu n est pas la valeur lue');
});

/* ══ 3. LE CABLAGE ═══════════════════════════════════════════════════════════════════════════ */
cas('⛔⛔ LA PAGE LIT LE MULTIPLICATEUR, ET SEULEMENT POUR LES B20', () => {
  assert.match(html, /import \{ SELECTEUR_MULTIPLIER, etatMultiplicateur, phraseMultiplicateur \}/,
    'le module n est pas importe');
  assert.match(html, /SELECTEUR_MULTIPLIER/, 'le selecteur n est pas utilise');
  const i = html.indexOf('async function lireJeton(');
  assert.ok(i > 0, 'lireJeton introuvable');
  const bloc = html.slice(i, i + 2600);
  assert.match(bloc, /\^0xb2\[0-9a-fA-F\]\{38\}\$/,
    'la lecture du multiplicateur n est pas limitee aux B20 : elle couterait un appel par actif');
  assert.match(bloc, /multiplicateur = null/,
    'un echec de lecture du multiplicateur ne retombe pas sur `null` — il pourrait faire echouer le solde');
});

cas('⛔⛔⛔ LE MARQUEUR VISIBLE NE S ALLUME QUE SUR `DERIVE`', () => {
  /* ⛔⛔ SI LE MARQUEUR S ALLUMAIT AUSSI SUR `NON_MESURE`, il se declencherait a chaque limite de
   *     debit du noeud — donc presque toujours — et serait invisible le jour d un vrai split.
   *     C est le motif « une garde presque toujours vraie tue l affordance », deja paye ici. */
  const i = html.indexOf('function peindreActifs()');
  assert.ok(i > 0, 'peindreActifs introuvable');
  const bloc = html.slice(i, i + 2600);
  assert.match(bloc, /etatMultiplicateur\(a\.multiplicateur\)/, 'la liste ne classe pas le multiplicateur');
  assert.match(bloc, /mu\.etat === 'DERIVE'/,
    'le marqueur visible ne depend pas de `DERIVE` : il risque de s allumer sur une lecture ratee');
  assert.doesNotMatch(bloc, /mu\.etat === 'NON_MESURE'[^?]*\?\s*' <b/,
    'le marqueur visible s allume sur NON_MESURE : il deviendra du bruit permanent');
  /* ⛔ ET L INCERTITUDE N EST PAS CACHEE POUR AUTANT : elle doit vivre dans l infobulle. */
  assert.match(bloc, /phraseMultiplicateur\(mu,/,
    'la phrase du multiplicateur n est nulle part : l incertitude serait simplement tue');
});

console.log('✓ test-chiffres-disent-ce-quils-sont : ' + n + ' cas');
console.log('   Le volume du trending est rattache AUX MARCHES listes (plus a « nous ou pas »,');
console.log('   decision de Phil du 2026-09-30) ; le solde brut d une action dit quand il n est plus');
console.log('   l equivalent-action. Selecteur ' + SELECTEUR_MULTIPLIER + '.');
console.log('   ⚠️ NE PROUVE PAS qu un visiteur le lise — seulement que c est ecrit et non supprimable');
console.log('      en silence.');
