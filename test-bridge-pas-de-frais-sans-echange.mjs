/* test-bridge-pas-de-frais-sans-echange.mjs — ON NE FACTURE PAS UN SERVICE QU ON NE REND PAS.
 *
 * ⛔⛔ LE DEFAUT QUE CETTE GARDE EMPECHE DE REVENIR, mesure le 2026-09-24 en lecture du code LIVE.
 *     Le bouton de confirmation du Swap via Bridge construisait UNE seule transaction — le frais de
 *     0,01% vers le puits — et l envoyait. Il n existait aucun second appel, aucune route, aucun
 *     calldata d echange nulle part dans le chemin. Pendant ce temps l ecran affichait
 *     « You receive: <net> » JUSTE AU-DESSUS du bouton, et la reserve « net swap is not live yet »
 *     n apparaissait qu APRES la signature.
 *     ⇒ Des gens payaient un frais, ne recevaient rien, et l apprenaient une fois l argent parti.
 *
 * ⛔ CE N EST PAS UN DEFAUT D AFFICHAGE. La divulgation EXISTAIT — elle arrivait apres la decision.
 *   Une reserve qui suit le paiement n est pas une reserve, c est une excuse. C est le motif
 *   `disclosure-fixed-decision-not` : le texte est corrige, la DECISION l ignore.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que le hub echange vraiment quand la constante passe a `true`.
 *    `HUB_SWAP_LIVE` est une DECLARATION humaine, pas une observation. Ce test garde la logique
 *    « pas d echange ⇒ pas de frais », pas la verite de la declaration elle-meme.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { HUB_SWAP_LIVE } from './bridge.js';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ commentaires retires du cote LU : ce fichier-ci, et les commentaires de app.html, citent le
 *   defaut en toutes lettres. Un motif naif les prendrait pour le defaut lui-meme — piege n°1 ici. */
const src = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');

v('la constante existe et est lisible des deux cotes', () => {
  /* ⛔ `garde-sur-element-absent-toujours-fausse` : si l import disparait, `HUB_SWAP_LIVE` serait
   *    `undefined` dans app.html, donc falsy, donc la garde tiendrait PAR ACCIDENT — et le jour ou
   *    quelqu un voudrait l ouvrir, elle ne s ouvrirait pas. On exige que le nom soit importe. */
  assert.equal(typeof HUB_SWAP_LIVE, 'boolean', 'HUB_SWAP_LIVE doit etre un booleen explicite');
  assert.match(src, /import\s*\{[^}]*HUB_SWAP_LIVE[^}]*\}\s*from\s*'\.\/bridge\.js'/,
    "app.html n importe pas HUB_SWAP_LIVE : la garde lirait `undefined` et tiendrait par accident");
});

v('⛔ LE CAS CENTRAL : le frais ne peut pas partir quand l echange n est pas vivant', () => {
  /* On lit le gestionnaire de confirmation et on exige que le REFUS precede la construction de la
   * transaction de frais. L ordre est tout : un refus place apres `buildBridgeFeeCall` laisserait
   * le plan se construire, et un futur remaniement enverrait la transaction quand meme. */
  const i = src.indexOf("const call = buildBridgeFeeCall(");
  assert.ok(i > 0, 'la construction du frais est introuvable : ce test ne garde plus rien');
  const avant = src.slice(Math.max(0, i - 1200), i);
  assert.match(avant, /if\s*\(\s*!\s*HUB_SWAP_LIVE\s*\)/,
    'AUCUN refus sur HUB_SWAP_LIVE avant la construction du frais : le Bridge peut de nouveau '
    + 'encaisser pour un echange qui n aura pas lieu');
  /* ⛔ et ce refus doit VRAIMENT sortir : sans `return`, la fonction continuerait jusqu a l envoi.
   *   On lit a partir du `if` lui-meme, borne a la construction du frais — pas au-dela, sinon on
   *   attraperait le `return` du bloc SUIVANT et la garde serait verte pour rien. Ce piege m a
   *   deja eu : un « le refus s arrete » qui lisait 700 caracteres trop loin. */
  const depart = avant.search(/if\s*\(\s*!\s*HUB_SWAP_LIVE\s*\)/);
  const bloc = avant.slice(depart);
  assert.match(bloc, /return\s*;/,
    'le refus sur HUB_SWAP_LIVE ne sort pas de la fonction : l envoi suivrait quand meme');
});

v('⛔ l ecran ne promet PAS un montant recu quand rien n est livre', () => {
  /* La promesse etait affichee juste au-dessus du bouton : l endroit exact ou quelqu un decide de
   * payer. Elle doit dependre de la constante, jamais etre inconditionnelle. */
  const i = src.indexOf("netEl.textContent =");
  assert.ok(i > 0, "la ligne du net recu est introuvable : ce test ne garde plus rien");
  const ligne = src.slice(i, i + 320);
  assert.match(ligne, /HUB_SWAP_LIVE/,
    "« You receive » est affiche sans condition : l ecran promet de nouveau un net qui n arrivera pas");
});

v('la cotation entiere est conditionnee, pas seulement le net', () => {
  /* ⛔ `single-and-batch-twins-diverge` : corriger le net et laisser « Fee: 0.0001 ETH » et
   *    « Settlement: … » inchanges donnerait un ecran qui annonce un frais precis a cote d un net
   *    nul. Les trois lignes racontent la meme chose et doivent bouger ensemble. */
  /* ⛔⛔ MA PREMIERE VERSION ACCUSAIT LA MAUVAISE LIGNE. Elle prenait la PREMIERE affectation de
   *     `feeEl.textContent`, qui est celle de la branche « pas de cotation lisible » et affiche
   *     « — ». Cette branche-la est juste : il n y a rien a conditionner quand il n y a rien a
   *     montrer. La sonde declarait donc un defaut sur du code correct.
   *   ⇒ On regarde TOUTES les affectations et on exige qu AU MOINS UNE soit conditionnee — celle du
   *     chemin de succes, la seule qui annonce un chiffre. Un motif qui s arrete a la premiere
   *     correspondance mesure la premiere correspondance, pas la question posee. */
  for (const [nom, motif] of [['frais', /feeEl\.textContent\s*=/g], ['reglement', /settleEl\.textContent\s*=/g]]) {
    const positions = [...src.matchAll(motif)].map((m) => m.index);
    assert.ok(positions.length > 0, 'la ligne « ' + nom + ' » est introuvable : ce test ne garde plus rien');
    const conditionnee = positions.some((k) => /HUB_SWAP_LIVE/.test(src.slice(k, k + 340)));
    assert.ok(conditionnee,
      'aucune des ' + positions.length + ' affectations de « ' + nom + ' » n est conditionnee : '
      + 'l ecran annoncerait un chiffre precis a cote d un net nul');
  }
});

v('le refus dit ce qui se passe, sans jargon interne ni prenom', () => {
  /* ⛔ Le message arrive au moment ou quelqu un s apprete a payer. Un nom de contrat, un prenom de
   *   l equipe ou un tarif de route inexistante le laisseraient croire qu il lui manque un savoir. */
  const i = src.search(/if\s*\(\s*!\s*HUB_SWAP_LIVE\s*\)/);
  assert.ok(i > 0, 'refus introuvable');
  const bloc = src.slice(i, i + 700);
  assert.match(bloc, /setEtat\(/, 'le refus ne dit rien a l utilisateur : un bouton muet');
  assert.doesNotMatch(bloc, /Phil|BridgeRouter|1\s*bps|bps GO/i,
    'jargon interne ou prenom de l equipe dans le message de refus');
  assert.match(bloc, /nothing was sent/i,
    "le refus ne dit pas clairement qu aucun argent n est parti — c est la premiere question qu on se pose");
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok bridge-pas-de-frais-sans-echange — ' + n + ' cas. HUB_SWAP_LIVE=' + HUB_SWAP_LIVE
  + ' ⇒ aucun frais ne peut partir.');
console.log('⚠️ NE PROUVE PAS que le hub echange quand la constante passe a true : c est une');
console.log('   declaration humaine, pas une mesure.');
