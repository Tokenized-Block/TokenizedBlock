/* test-bridge-pas-de-frais-sans-echange.mjs — LE FRAIS EST DANS L ECHANGE, OU IL N EST PAS.
 *
 * ⛔⛔ LE DEFAUT D ORIGINE, mesure le 2026-09-24 en lecture du code LIVE. Le bouton de confirmation
 *     du Bridge construisait UNE seule transaction — un transfert de frais vers le puits — et
 *     l envoyait. Aucun echange nulle part dans le chemin. L ecran affichait « You receive: <net> »
 *     juste au-dessus du bouton, et la reserve « not live yet » n arrivait qu APRES la signature.
 *     Des gens payaient et ne recevaient rien.
 *
 * ⛔⛔ CETTE GARDE A CHANGE DE MECANISME LE MEME JOUR, ET C EST LA LE POINT INTERESSANT.
 *     Ma premiere version verifiait qu un refus (`if (!HUB_SWAP_LIVE)`) precedait la construction
 *     du frais. C etait la bonne intention avec le mauvais levier : elle supposait qu il faudrait
 *     un jour CONSTRUIRE un hub d echange.
 *     Phil, le meme jour : « tu charges avec les relais existants d echange de pool ; on prend le
 *     frais sur le fait que tu uses les blocks en dehors de l app ». Il avait raison : `planEchange`
 *     vend DEJA un block par sa propre pool v4 et preleve le frais d interface vers le wallet de
 *     frais DANS LA MEME TRANSACTION. Il n y avait rien a construire — seulement a s en servir.
 *   ⇒ La garde ne bloque donc plus : elle verifie que le frais n a plus AUCUN chemin ou partir
 *     seul. C est structurel, et c est plus fort qu un drapeau. Un drapeau se remet a `true` par
 *     distraction ; une transaction unique qui contient les deux, non.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que la transaction reussit on-chain, ni que le frais arrive
 *    vraiment a destination. Il lit du code. La preuve du versement se lit sur la chaine, et elle
 *    demande une signature que je ne donne pas.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ commentaires retires du cote LU : ce depot documente ses defauts corriges en toutes lettres,
 *   et ce fichier-ci cite le defaut. Un motif naif les prendrait pour le defaut lui-meme. */
const src = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');

/* le gestionnaire de confirmation du Bridge, borne — pas la page entiere */
const debut = src.indexOf("$('#brConfirm')");
assert.ok(debut > 0, 'le bouton de confirmation du Bridge est introuvable : ce test ne garde plus rien');
/* ⛔ FENETRE BORNEE MAIS SUFFISANTE. A 5 200 caracteres, le texte d avant-signature tombait DEHORS
 *   et le test accusait son absence — une garde qui rate sa cible par cadrage, pas par defaut du
 *   code. On borne a la fin du gestionnaire (`peindreBridgeActifs`, juste apres) plutot que de
 *   deviner une longueur : un nombre choisi a la main se perime au premier ajout. */
const fin = src.indexOf('peindreBridgeActifs();', debut);
const handler = src.slice(debut, fin > debut ? fin : debut + 12000);

v('le gestionnaire est bien celui qu on croit', () => {
  /* ⛔ `garde-sur-element-absent-toujours-fausse` : si l extraction rate, `handler` serait vide et
   *    tous les `doesNotMatch` ci-dessous passeraient au VERT en n ayant rien lu. */
  assert.ok(handler.length > 2000, 'extraction du gestionnaire suspecte (' + handler.length + ' car.)');
  assert.match(handler, /addEventListener\('click'/, 'ce n est pas un gestionnaire de clic');
});

v('⛔ LE CAS CENTRAL : aucun transfert de frais autonome ne peut etre construit ici', () => {
  /* ⛔⛔ C EST LA GARANTIE STRUCTURELLE. `buildBridgeFeeCall` fabriquait un transfert de frais tout
   *     seul — exactement l objet qui permettait de prendre de l argent sans rien livrer. Tant
   *     qu il n est pas appele dans ce chemin, le frais ne PEUT PAS partir sans echange : il n y a
   *     plus de transaction ou il soit seul. */
  assert.doesNotMatch(handler, /buildBridgeFeeCall\s*\(/,
    'le Bridge reconstruit un transfert de frais autonome : il peut de nouveau encaisser sans '
    + 'rien echanger, ce qui est exactement le defaut du 2026-09-24');
});

v('⛔ l echange passe par la pool existante du block', () => {
  assert.match(handler, /planEchange\s*\(/,
    "le Bridge n appelle plus planEchange : il n echange donc plus rien par la pool du block");
  assert.match(handler, /sens:\s*'VENTE'/,
    "le sens de l echange n est pas une VENTE : sortir un block, c est le vendre par son marche");
});

v('⛔ rien n est envoye si le plan n est pas PRET', () => {
  /* ⛔ `neutral-return-swallows-failure` : sans ce refus, un plan NON_MESURE ou REFUSE continuerait
   *    jusqu a l envoi avec un `tx` absent — et l erreur arriverait dans le wallet de l utilisateur
   *    plutot qu a l ecran. */
  assert.match(handler, /etat\s*!==\s*'PRET'/,
    "le plan n est pas verifie avant l envoi : une lecture ratee irait jusqu au wallet");
  const i = handler.search(/etat\s*!==\s*'PRET'/);
  /* la fenetre est BORNEE : un `return` trouve 800 caracteres plus loin appartiendrait au bloc
   * suivant — ce piege m a deja donne une garde verte pour rien. */
  assert.match(handler.slice(i, i + 260), /return\s*;/,
    'le refus sur un plan non pret ne sort pas de la fonction');
});

v('les approbations manquantes sont dites AVANT la signature', () => {
  /* ⛔ Signer sans les approbations echoue SUR LA CHAINE : le gas est brule et l utilisateur ne
   *   comprend pas pourquoi. On le dit avant, et on renvoie vers l ecran qui sait les enchainer
   *   plutot que d en refaire ici une version plus faible (`canonical-helper-weaker-copy`). */
  assert.match(handler, /etapes\s*\)\s*&&\s*\w+\.etapes\.length|etapes\.length/,
    'les approbations du plan ne sont pas regardees : la signature echouerait on-chain');
});

v('⛔ l ecran ne promet pas un net issu de l estimation', () => {
  /* La promesse etait affichee juste au-dessus du bouton : l endroit exact ou quelqu un decide de
   * payer. Elle doit venir du plan REEL, ou ne pas etre un chiffre du tout. */
  const positions = [...src.matchAll(/netEl\.textContent\s*=/g)].map((m) => m.index);
  assert.ok(positions.length > 0, 'la ligne du net recu est introuvable');
  const conditionnee = positions.some((k) => /HUB_SWAP_LIVE/.test(src.slice(k, k + 340)));
  assert.ok(conditionnee,
    "« You receive » est affiche sans condition : l ecran promet de nouveau un net qui n arrivera pas");
});

v('le texte lu juste avant la signature decrit l echange, pas un frais seul', () => {
  /* ⛔ C est le dernier texte que quelqu un lit avant d engager son argent. Il disait « sign the
   *   0.01% fee only » pour un geste qui n echangeait rien : exact, et vide. */
  const i = handler.indexOf("Open your wallet");
  assert.ok(i > 0, 'le texte d avant-signature est introuvable');
  const phrase = handler.slice(i, i + 420);
  assert.doesNotMatch(phrase, /fee only/i,
    "le texte d avant-signature annonce encore « fee only » : il decrirait un frais sans echange");
  assert.doesNotMatch(phrase, /\bPhil\b|BridgeRouter|\bbps\b/i,
    'jargon interne ou prenom de l equipe juste avant une signature');
});

assert.equal(n, 7, 'compte de cas inattendu : ' + n);
console.log('ok bridge-pas-de-frais-sans-echange — ' + n + ' cas : le frais vit DANS l echange, et');
console.log('   aucun transfert de frais autonome ne peut etre construit dans ce chemin.');
console.log('⚠️ NE PROUVE PAS que la transaction aboutit ni que le frais arrive : ceci lit du code.');
