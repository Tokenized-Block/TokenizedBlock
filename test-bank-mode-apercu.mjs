/* test-bank-mode-apercu.mjs — TANT QUE LA BANQUE N EXISTE PAS, ELLE NE DEMANDE RIEN ET NE PROMET RIEN.
 *
 * ⛔⛔ CE QUI ETAIT EN LIGNE, mesure le 2026-09-24. Les deux boutons du panneau TokenizedBank
 *     (« Open TokenizedBank » et « Add liquidity ») ouvraient une VRAIE fenetre de wallet
 *     (`personal_sign`) — puis affichaient :
 *         « Open confirmed (signed). Early shares frozen · … · the Brain runs ops automatically. »
 *     Or `BANK_CONTRACT` vaut `null` : aucun credit n est emis, rien ne part sur la chaine, et la
 *     signature obtenue n etait ni verifiee, ni envoyee, ni conservee. Les trois affirmations
 *     etaient fausses en meme temps.
 *
 * ⛔⛔ POURQUOI LA SIGNATURE EST LE POINT LE PLUS GRAVE, et pas seulement inutile : demander une
 *     signature habitue les gens a signer ce qu on leur presente. Le faire pour un geste vide use
 *     exactement la prudence dont ils auront besoin le jour ou une vraie signature comptera.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que le panneau sera juste quand la banque existera. Il garde
 *    l etat « pas construit » — c est-a-dire aujourd hui.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { BANK_CONTRACT } from './tokenized-bank.js';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔ commentaires retires du cote LU : ce depot cite ses defauts corriges en toutes lettres, et ce
 *   fichier-ci les cite aussi. Un motif naif prendrait le commentaire pour le defaut. */
const src = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ')
  .replace(/<!--[\s\S]*?-->/g, ' ');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* les gestionnaires des deux boutons, bornes — pas la page entiere */
function handler(id) {
  /* ⛔⛔ ON VISE LE GESTIONNAIRE, PAS LA PREMIERE MENTION DE L ID. Ma premiere version faisait
   *     `indexOf("$('#" + id + "')")` et tombait sur `const openBtn = $('#tbOpenBtn');`, 280 lignes
   *     PLUS HAUT — la fenetre couvrait alors du code sans rapport et le test accusait des textes
   *     qui n appartiennent pas au bouton. Meme piege du premier match que sur le Bridge ce matin :
   *     un motif qui s arrete a la premiere correspondance mesure la premiere correspondance, pas
   *     la question posee. */
  const i = src.indexOf("$('#" + id + "').addEventListener");
  assert.ok(i > 0, 'gestionnaire de ' + id + ' introuvable : ce test ne garde plus rien');
  /* ⛔ borne a la fin reelle du gestionnaire, pas a un nombre choisi a la main : une fenetre fixe
   *   se perime au premier commentaire ajoute — ca m est deja arrive aujourd hui. */
  const j = src.indexOf("\n});", i);
  return src.slice(i, j > i ? j : i + 3000);
}

v('la banque n a toujours pas de contrat — sinon ce test ne s applique plus', () => {
  /* ⛔ Si un contrat existe un jour, ce test doit ECHOUER bruyamment pour qu on vienne le relire,
   *   plutot que de continuer a garder un « mode apercu » devenu faux. */
  assert.equal(BANK_CONTRACT, null,
    'BANK_CONTRACT n est plus null : la banque existe peut-etre. Relire ce test AVANT de le corriger '
    + '— le bandeau « Preview » et les refus de signature doivent alors etre revus, pas supprimes.');
});

v('⛔ AUCUN bouton de la banque ne demande de signature', () => {
  /* ⛔⛔ LE CAS CENTRAL. Une signature pour un geste qui n ecrit que dans le navigateur est
   *     indefendable, quel que soit le texte qui l accompagne. */
  for (const id of ['tbOpenBtn', 'tbAddLiqBtn']) {
    const h = handler(id);
    assert.doesNotMatch(h, /personal_sign/,
      id + ' redemande une signature de wallet alors que rien n est envoye ni verifie');
    assert.doesNotMatch(h, /eth_sendTransaction|envoyerDepuisWallet|signTypedData/,
      id + ' tente d envoyer ou de faire signer une transaction : la banque n existe pas');
  }
});

v('⛔ le panneau ne dit plus « confirme », « gele » ni « l agent fait tourner les operations »', () => {
  for (const id of ['tbOpenBtn', 'tbAddLiqBtn']) {
    const h = handler(id);
    assert.doesNotMatch(h, /confirmed/i,
      id + ' annonce de nouveau une confirmation : rien n est confirme nulle part');
    assert.doesNotMatch(h, /frozen/i,
      id + ' annonce des parts « gelees » : le registre vit dans ce navigateur et se vide');
    assert.doesNotMatch(h, /Brain runs ops/i,
      id + ' annonce que des operations tournent : aucune ne tourne');
  }
});

v('les deux boutons DISENT que rien n est signe ni envoye', () => {
  /* ⛔ Retirer la fausse promesse ne suffit pas : le silence laisserait croire que ca a marche.
   *   Le message doit dire ce qui s est passe — et ou ca vit. */
  for (const id of ['tbOpenBtn', 'tbAddLiqBtn']) {
    const h = handler(id);
    /* ⛔ DEUX MOTIFS SEPARES, et pas la phrase entiere : le texte est construit par concatenation
     *   (« Nothing was signed » + « and nothing was sent »), donc un motif qui exige la phrase
     *   d un seul tenant echoue sur une simple coupure de ligne. Le test doit porter sur ce qui
     *   est DIT, pas sur la mise en forme du code source. */
    assert.match(h, /Nothing was signed/i, id + ' ne dit plus qu aucune signature n a eu lieu');
    assert.match(h, /nothing was sent/i, id + ' ne dit plus qu aucun envoi n a eu lieu');
    assert.match(h, /this browser/i,
      id + ' ne dit plus que le resultat ne vit que dans ce navigateur');
  }
});

v('⛔ le bandeau « pas construit » est EN HAUT du panneau, avant les promesses', () => {
  /* ⛔⛔ `disclosure-fixed-decision-not` : la reserve EXISTAIT deja — tout en bas, apres quatre
   *     paragraphes de promesses. Une reserve qui arrive apres l argument ne corrige rien. On
   *     verifie donc sa POSITION, pas seulement sa presence. */
  const carte = html.indexOf('id="wBankCarte"');
  const apercu = html.indexOf('id="tbApercu"');
  const promesse = html.search(/USDC<\/b> credit|<b>USDC credit<\/b>/);
  assert.ok(apercu > carte, 'le bandeau d apercu n est pas dans la carte de la banque');
  assert.ok(promesse < 0 || apercu < promesse,
    'le bandeau d apercu arrive APRES la promesse de credit : une reserve qui suit l argument '
    + 'n est pas une reserve');
  const texte = html.slice(apercu, apercu + 700);
  assert.match(texte, /not built yet/i, 'le bandeau ne dit plus que ce n est pas construit');
  assert.match(texte, /no credit/i, 'le bandeau ne dit plus qu il n y a pas de credit');
  assert.match(texte, /no yield/i, 'le bandeau ne dit plus qu il n y a pas de rendement');
});

v('⛔ le PANNEAU ENTIER ne decrit plus la banque au present', () => {
  /* ⛔⛔ TROU DANS MA PROPRE GARDE, trouve en verifiant la production : les cas precedents ne
   *     lisaient que les deux GESTIONNAIRES. « The agent runs the ops » vivait dans le paragraphe
   *     de presentation, en HTML statique — donc toujours a l ecran, garde verte. Une garde qui
   *     couvre la moitie du chemin laisse passer l autre moitie, et rassure sur les deux.
   *   ⇒ On lit maintenant la carte ENTIERE. */
  const i = html.indexOf('id="wBankCarte"');
  assert.ok(i > 0, 'la carte de la banque est introuvable');
  const j = html.indexOf('</section>', i);
  const carte = html.slice(i, j > i ? j : i + 9000)
    .replace(/<!--[\s\S]*?-->/g, ' '); /* les commentaires citent les defauts corriges */
  assert.ok(carte.length > 1500, 'extraction de la carte suspecte (' + carte.length + ' car.)');
  assert.doesNotMatch(carte, /The agent runs the ops|Brain runs ops/i,
    'le panneau affirme de nouveau que des operations tournent : aucune ne tourne');
  /* ⛔ le present de l indicatif est ce qui transforme un plan en offre. On exige la phrase qui
   *   coupe court, plutot que d essayer d interdire une grammaire. */
  assert.match(carte, /None of this exists yet/i,
    'le panneau ne dit plus, dans le paragraphe de presentation, que rien de tout cela n existe');
});

v('ce qui est VRAI reste dit comme vrai : la preuve de detention est lue sur la chaine', () => {
  /* ⛔ Un bandeau qui dirait « tout est faux » serait aussi trompeur que l inverse : la lecture de
   *   `balanceOf` est reelle, et c est la seule chose sur laquelle quelqu un peut s appuyer ici. */
  const texte = html.slice(html.indexOf('id="tbApercu"'), html.indexOf('id="tbApercu"') + 700);
  assert.match(texte, /on\s*\n?\s*chain|on chain/i,
    'le bandeau ne dit plus que la preuve de detention, elle, est reelle');
});

assert.equal(n, 7, 'compte de cas inattendu : ' + n);
console.log('ok bank-mode-apercu — ' + n + ' cas : aucune signature, aucune fausse confirmation,');
console.log('   et le « pas construit » est en haut, avant les promesses.');
console.log('⚠️ NE PROUVE PAS que le panneau sera juste quand la banque existera : il garde l etat');
console.log('   « pas construit », c est-a-dire aujourd hui.');
