/* test-seuil-refus-achat.mjs — AU-DESSUS DE 5 % DE FRAIS DE POOL, L APP NE PREPARE RIEN.
 *
 * ⛔⛔ LE SEUIL VIENT D UNE MESURE, PAS D UNE INTUITION (Phil, 2026-09-23 : « je sais pas, fais ce
 *     qu il y a de mieux »). 24 h sur Base, 13 506 echanges sur des blocks B20, repartis par frais
 *     de POOL et PONDERES PAR ECHANGE — une pool sans echange ne dit rien de ce que les gens
 *     acceptent :
 *         0 %          4 266   31,6 %     cumul  31,6 %
 *         0 – 1 %      8 027   59,4 %     cumul  91,0 %
 *         1 – 5 %      1 017    7,5 %     cumul  98,5 %   <- le seuil est ICI
 *         5 – 20 %        73    0,5 %     cumul  99,1 %
 *         20 – 50 %       23    0,2 %     cumul  99,3 %
 *         > 50 %          19    0,1 %     cumul  99,4 %
 *     98,5 % du volume reel se fait a 5 % ou moins. Au-dessus : 115 echanges sur 13 506. Refuser
 *     la n empeche pas un marche, ca empeche une perte.
 *     ⚠️ 8 fenetres sur 44 ont ete ratees : ces comptes sont des MINIMA. La FORME de la
 *        distribution ne change pas pour autant — c est elle qui porte la decision, pas le total.
 *
 * ⛔ ON REFUSE, ON NE PREVIENT PAS. Un avertissement a cote d un bouton actif se clique : c est
 *    exactement ce qui venait de se passer avec « Fee 77.5% », affiche et ignore le meme jour.
 *
 * ⛔ CE QUE CE TEST PROUVE : que le refus existe, qu il porte le chiffre, qu il s arrete, et qu il
 *    laisse passer le cas dynamique.
 * ⛔ CE QU IL NE PROUVE PAS : le rendu. Il lit la source — un `preparerEchange` complet demande un
 *    DOM et un wallet. Le comportement a ete verifie a la main en production.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

const d = html.indexOf('async function preparerEchange(');
assert.ok(d > 0, 'preparerEchange introuvable — cette garde ne protege plus rien');
/* ⛔⛔ LA FENETRE ETAIT UN NOMBRE FIXE — `html.slice(d, d + 4500)` — ET ELLE A POURRI LE 2026-09-25.
 *     En instrumentant les refus de ce chemin, j ai ajoute des commentaires : l ancre
 *     `if (!(await pret(` est passee au-dela du 4500e caractere, et ce test est tombe sur « bloc
 *     suivant introuvable ». Le code etait intact — c est la BORNE qui avait glisse
 *     (`handoff-figures-rot`).
 *   ⛔ UNE BORNE DOIT ETRE STRUCTURELLE, jamais numerique : on prend le corps ENTIER de la fonction
 *     par equilibrage d accolades. Un commentaire ajoute ne peut plus faire mentir la mesure. Et
 *     surtout : un test qui rougit pour une raison qui n est pas la sienne apprend a etre ignore,
 *     ce qui coute beaucoup plus cher que le defaut qu il garde. */
function blocDepuis(texteSource, i) {
  let prof = 0, dans = null;
  for (let k = texteSource.indexOf('{', i); k < texteSource.length; k++) {
    const c = texteSource[k];
    if (dans) { if (c === dans && texteSource[k - 1] !== '\\') dans = null; continue; }
    if (c === '"' || c === "'" || c === '`') { dans = c; continue; }
    if (c === '{') prof++;
    else if (c === '}' && !--prof) return texteSource.slice(i, k + 1);
  }
  return null;
}
const src = blocDepuis(html, d);
assert.ok(src, 'les accolades de preparerEchange ne s equilibrent pas : extraction abandonnee');
assert.ok(src.includes('FRAIS_POOL_MAX'), 'extraction ratee : le seuil n est pas dans la fenetre lue');

v('le seuil livre est bien 5 % (50 000 centiemes de point de base)', () => {
  assert.match(src, /const FRAIS_POOL_MAX = 50000;/,
    'le seuil a change sans que la mesure qui le justifie soit refaite');
});

v('le refus existe et compare au seuil', () => {
  assert.match(src, /feeRoute > FRAIS_POOL_MAX/, 'la comparaison au seuil a disparu');
  assert.match(src, /Not prepared:/, 'le refus ne dit plus qu il refuse');
});

v('le refus PORTE LE CHIFFRE', () => {
  /* ⛔ « trop cher » sans le taux ne se verifie pas et se lit comme une panne : la personne
   *    recommencerait, et conclurait que l app est cassee. */
  assert.match(src, /\(feeRoute \/ 10000\)\.toFixed\(2\)/,
    'le refus n affiche plus le taux reel : il devient invérifiable');
});

v('le refus ARRETE la preparation', () => {
  /* ⛔ `neutral-return-swallows-failure` a l envers : un message sans `return` laisserait la
   *    transaction se preparer quand meme, et le refus ne serait qu une decoration. */
  /* ⛔⛔ LA FENETRE S ARRETE AU BLOC SUIVANT, ET C EST LE COEUR DU CONTROLE. Ma premiere version
   *     lisait « 700 caracteres apres le message » : elle attrapait le `return;` du bloc d apres
   *     (celui de `pret({ e })`), donc elle restait VERTE quand on supprimait le vrai. Une
   *     mutation l a montre — retirer le `return` ne rougissait rien. Un motif qui cherche « un
   *     return quelque part » ne garde pas « CE return ». */
  /* ⛔⛔ ET LE « moins de 600 caracteres » ETAIT LUI AUSSI UN PROXY QUI A POURRI, le 2026-09-25 :
   *     ajouter le compteur de ce refus a porte la fenetre a 646 caracteres et fait rougir un test
   *     dont le sujet n avait pas bouge. Une longueur n etait qu une APPROXIMATION de « ce return
   *     appartient bien a ce bloc ». On mesure maintenant la chose elle-meme : le bloc du `if`,
   *     borne par ses propres accolades. Remplacer un proxy par son objet, c est la seule facon de
   *     ne pas avoir a l ajuster a chaque commentaire (`instrument-before-conclusion`). */
  const garde = src.indexOf('if (Number.isFinite(feeRoute)');
  assert.ok(garde > 0, 'la garde du seuil est introuvable');
  const bloc = blocDepuis(src, garde);
  assert.ok(bloc, 'les accolades de la garde du seuil ne s equilibrent pas');
  assert.ok(bloc.includes('Not prepared:'), 'le message de refus n est plus dans le bloc de la garde');
  assert.match(bloc, /\breturn;/, 'le refus n arrete rien : la preparation continuerait');
  /* ⛔ ET LE `return` EST DANS CE BLOC, pas emprunte au suivant — c est le defaut que ce test a deja
   *   eu : il lisait 700 caracteres apres le message et attrapait le `return` du bloc d apres, donc
   *   il restait VERT quand on supprimait le vrai. Le bloc s arretant a sa propre accolade
   *   fermante, aucun `return` voisin ne peut plus le faire verdir par erreur. */
  const suivant = src.indexOf('if (!(await pret(', garde);
  assert.ok(suivant > garde, 'bloc suivant introuvable — la borne ne peut pas etre verifiee');
  assert.ok(garde + bloc.length <= suivant,
    'le bloc de la garde deborde sur le bloc suivant : la mesure redevient approximative');
  const i = src.indexOf('Not prepared:');
  const avant = src.slice(Math.max(0, i - 300), i);
  assert.match(avant, /wKo/, 'le refus ne passe pas l etat en erreur');
});

v('le refus vient AVANT toute preparation', () => {
  /* ⛔ Place apres, il refuserait une transaction deja construite — et on aurait demande le
   *    wallet pour rien. */
  assert.ok(src.indexOf('feeRoute > FRAIS_POOL_MAX') < src.indexOf('etape(\'achat_prepare\')'),
    'le seuil est teste APRES le debut de la preparation');
});

v('un frais DYNAMIQUE n est jamais refuse sur un nombre qu on n a pas', () => {
  /* ⛔ Son taux est fixe au swap : le refuser exigerait de connaitre une valeur qu on n a pas
   *    mesuree. Inventer un nombre pour refuser serait le meme defaut que d en inventer un pour
   *    rassurer. */
  assert.match(src, /!fraisEstDynamique\(feeRoute\)/,
    'une pool a frais dynamiques serait refusee sur un taux inconnu');
});

v('un frais ILLISIBLE ne declenche pas le refus non plus', () => {
  /* ⛔ `Number.isFinite` garde l entree : sans lui, `NaN > 50000` est faux — donc ca passerait —
   *    mais une chaine comme "999999" passerait a `Number` et refuserait a tort. On VERIFIE que
   *    la garde est explicite plutot que de compter sur une coincidence. */
  assert.match(src, /Number\.isFinite\(feeRoute\)/, 'l entree du seuil n est plus gardee');
});

assert.equal(n, 7, 'compte de cas inattendu : ' + n);
console.log('ok seuil-refus-achat — ' + n + ' cas · seuil 5 %, tire de 13 506 echanges mesures');
