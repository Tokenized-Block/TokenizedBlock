/* test-achat-usdc-un-geste.mjs — L ACHAT USDC NE DOIT PLUS DEMANDER DEUX TAPS,
 *                                 ET SURTOUT PAS RE-SIGNER UN LOT PEUT-ETRE EN VOL.
 *
 * ⛔⛔ LE DEFAUT MESURE LE 2026-09-29, DANS LE CODE, PAS DE MEMOIRE :
 *     apres une approbation confirmee, l ecran d achat USDC affichait
 *       « Approvals done. Tap Buy with USDC again to swap. »
 *     puis `return`. Donc DEUX taps et DEUX signatures pour UN achat. Et sur Aerodrome ce n est
 *     pas « la premiere fois » : `calldata-aerodrome.js` REFUSE explicitement MAX_UINT256 et
 *     `echange-v3.js` approuve le montant EXACT, donc l allowance est consommee par le swap et
 *     redemandee A CHAQUE ACHAT. Le seul chemin qui nous paie le frais etait aussi le plus long.
 *     Corroboration on-chain citee dans app.html : 154 `Approval` USDC vers ce routeur en UNE
 *     heure, 20 adresses distinctes.
 *
 * ⛔⛔⛔ LE POINT DANGEREUX EST AILLEURS, ET C EST LUI QUE CE FICHIER GARDE LE PLUS FORT.
 *      Ajouter un lot EIP-5792 « et si ca rate on fait en deux » CREE un risque de double achat :
 *      `envoyerLotAtomique` peut rendre `ECHEC_ENVOI`, qui NE GARANTIT PAS que rien n est parti
 *      (c est la troisieme issue de `messageEnvoi`, celle du doute). Retomber sur le chemin
 *      sequentiel apres un lot peut-etre en vol ferait signer DEUX FOIS le meme achat.
 *      ⇒ La seule retombee autorisee est le cas ou le wallet DIT ne pas connaitre `sendCalls`
 *        (`lot.sendCallsUnsupported === true`). Toute autre issue s arrete.
 *
 * ⚠️ BORNE DE CE FICHIER : il lit du TEXTE. Il prouve la FORME du code livre — l ordre des gardes,
 *    la presence de la retombee bornee, l absence de la phrase a deux taps. Il ne prouve NI qu un
 *    wallet reel groupe, NI qu un lot aboutisse on-chain. Seul un wallet sur la page le dirait.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

let n = 0;
const cas = (titre, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

/* ── on isole LA fonction d achat USDC, pour ne pas mesurer le reste de la page ─────────────── */
function brancheAchatUsdc(source) {
  const d = source.indexOf('async function acheterAvecUsdc(');
  assert.ok(d > 0, 'la fonction `acheterAvecUsdc` est introuvable : ce test ne garde plus rien');
  const f = source.indexOf("$('#fAcheterUsdc').addEventListener", d);
  assert.ok(f > d, 'la pose de l ecouteur sur #fAcheterUsdc est introuvable apres la fonction');
  const bloc = source.slice(d, f);
  assert.ok(bloc.length > 2000, 'bloc d achat USDC suspect : ' + bloc.length + ' caracteres');
  return bloc;
}
const bloc = brancheAchatUsdc(html);

cas('⛔⛔ LA PHRASE A DEUX TAPS A DISPARU du chemin d achat', () => {
  assert.doesNotMatch(bloc, /Tap Buy with USDC again to swap/,
    'l ecran renvoie encore le visiteur taper une seconde fois apres l approbation');
});

cas('⛔ ET IL ENCHAINE VRAIMENT : la fonction se rappelle apres une approbation confirmee', () => {
  assert.match(bloc, /return\s+acheterAvecUsdc\(true\)/,
    'rien ne relance l achat apres l approbation : le visiteur reste bloque sans le mot pour agir');
});

cas('⛔ LA RECURRENCE EST BORNEE A UN TOUR', () => {
  /* ⛔ SANS CETTE BORNE, une allowance qui ne suffit jamais boucle sur le wallet de quelqu un. */
  assert.match(bloc, /async function acheterAvecUsdc\(apresApprobation\s*=\s*false\)/,
    'la fonction ne porte pas le drapeau de second passage');
  const g = bloc.indexOf('if (apresApprobation)');
  const rappel = bloc.indexOf('return acheterAvecUsdc(true)');
  assert.ok(g > 0, 'aucune garde sur le second passage');
  assert.ok(rappel > g, 'la garde de second passage arrive APRES le rappel : elle ne le borne pas');
});

cas('⛔ LE LOT EN UNE SIGNATURE EST TENTE sur le chemin d achat', () => {
  assert.match(bloc, /envoyerLotAtomique\(/,
    'le chemin d achat ne tente aucun lot : deux signatures restent obligatoires');
  /* ⛔ ET IL CONTIENT LE SWAP, pas seulement les approbations — un lot qui ne groupe que des
   *   approbations ne retire aucune signature. */
  /* ⛔ REGEX CORRIGEE : ma premiere version ecrivait `map\([^)]*\)`, qui s arrete a la PREMIERE
   *   parenthese fermante — donc au `})` du callback, jamais au `.concat`. Elle rougissait sur du
   *   code correct. Une classe negative sur un delimiteur present DANS l argument ne delimite rien.
   * ⛔⛔ ET LE FENETRAGE A DISPARU : j avais borne la recherche a 900 caracteres avant l appel, si
   *     bien qu AJOUTER UN COMMENTAIRE faisait rougir le test. Un controle dont le verdict depend
   *     de la longueur d un commentaire ne mesure pas le code. On verifie la presence dans tout le
   *     bloc, et l ORDRE par position — ce qui est la vraie propriete voulue. */
  const iSwap = bloc.indexOf('const swap = r.plan && r.plan.appel');
  const iMap = bloc.indexOf('r.etapes.map(');
  const iConcat = bloc.search(/\.concat\(\[\{\s*to:\s*swap\.to/);
  const iLotAppel = bloc.indexOf('envoyerLotAtomique(');
  assert.ok(iSwap > 0, 'le swap du lot ne vient pas du plan mesure (`r.plan.appel`)');
  assert.ok(iMap > 0, 'le lot ne part pas des etapes d approbation');
  assert.ok(iConcat > 0, 'le lot ne concatene pas le swap aux approbations : grouper des '
    + 'approbations seules ne retire aucune signature');
  assert.ok(iSwap < iLotAppel && iMap < iLotAppel && iConcat < iLotAppel,
    'le lot est construit APRES avoir ete envoye — ordre impossible, donc lecture fausse');
});

cas('⛔⛔⛔ LA RETOMBEE EST BORNEE AU SEUL CAS SUR : « ce wallet ne connait pas sendCalls »', () => {
  const iLot = bloc.indexOf('envoyerLotAtomique(');
  const iSeq = bloc.indexOf('for (const e of r.etapes)', iLot);
  assert.ok(iSeq > iLot, 'le chemin sequentiel ne suit pas la tentative de lot');
  const entre = bloc.slice(iLot, iSeq);
  assert.match(entre, /lot\.sendCallsUnsupported\s*!==\s*true/,
    'rien ne borne la retombee : un lot rendu `ECHEC_ENVOI` — donc PEUT-ETRE EN VOL — ferait '
    + 're-signer le meme achat en sequentiel. Double achat sur le chemin qui nous paie.');
  assert.match(entre, /return\s*;/,
    'la garde ne sort pas : elle affiche puis continue quand meme vers le sequentiel');
  /* ⛔⛔ ET L ISSUE HEUREUSE SORT AUSSI : sans ce `return`, un lot CONFIRME serait suivi du
   *     sequentiel — le double achat par l autre bout. */
  assert.match(entre, /lot\.etat === 'CONFIRME'/, 'le succes du lot n est pas reconnu');
});

cas('⛔ LE MONTANT APPROUVE RESTE EXACT : le confort d un geste n a pas achete une allowance infinie', () => {
  /* ⛔⛔ C EST LA PROPRIETE QUE LE LOT PERMETTAIT DE GARDER, et un test qui ne la verifie pas
   *     laisserait un futur « simplifions » la vendre. Elle vit dans `calldata-aerodrome.js`. */
  const cal = readFileSync(new URL('./calldata-aerodrome.js', import.meta.url), 'utf8');
  assert.match(cal, /an unlimited approval is refused/,
    'le refus explicite de l approbation infinie a disparu de `calldataApprove`');
  assert.match(cal, /if \(m === \(1n << 256n\) - 1n\)/,
    'la garde qui refuse MAX_UINT256 a disparu');
  /* ⛔⛔ ON MESURE L USAGE, PAS LA PRESENCE DU NOM. Ma premiere version asserait l absence de
   *     « MAX_UINT256 » dans le bloc entier : elle rougissait sur un COMMENTAIRE qui documente
   *     justement le refus de l approbation illimitee. Une garde qui confond le mot et son emploi
   *     accuse la documentation et laisse passer le code — c est le motif
   *     `presence-dun-nom-nest-pas-son-usage`, dans le sens miroir. */
  /* ⛔ LE DEPOUILLEMENT VIENT DE `outils-test.js` : il porte deja son propre temoin (il LEVE s il
   *   n a rien retire), donc la garde qui suit ne peut plus etre vraie par accident. */
  const codeSeul = sansCommentaires(bloc, { minRetire: 500 });
  assert.ok(codeSeul.length > 1200, 'bloc depouille suspect : ' + codeSeul.length + ' caracteres');
  assert.doesNotMatch(codeSeul, /MAX_UINT256/,
    'le chemin d achat USDC introduit une approbation illimitee dans son CODE');
});

cas('⛔⛔ LE DEVIS EST AFFICHE AVANT QUE LE LOT OUVRE LE WALLET', () => {
  /* ⛔⛔ DEFAUT QUE J AI INTRODUIT ET RETIRE LE MEME JOUR : ma premiere version du lot affichait
   *     seulement « Trying it as ONE signature » puis ouvrait le wallet. Le visiteur signait sans
   *     avoir lu ce qu il recoit, alors que le chemin sequentiel le lui montre. Un raccourci ne
   *     rachete pas une divulgation, et c est justement l ecran qui demande de l argent. */
  /* ⛔ PAS DE FENETRE ICI NON PLUS : on compare des POSITIONS. `r.plan.sortieAttendue` existe aussi
   *   sur le chemin sequentiel, qui vient APRES l envoi du lot — donc si l affichage du devis
   *   disparaissait du chemin du lot, `indexOf` trouverait l occurrence sequentielle et l ordre
   *   deviendrait faux. La garde tient donc par la position, sans compter les caracteres. */
  const iLot = bloc.indexOf('envoyerLotAtomique(');
  assert.ok(iLot > 0, 'pas de lot : ce controle ne garde rien');
  for (const quoi of ['r.plan.sortieAttendue', 'r.plan.minSortie', 'at least']) {
    const i = bloc.indexOf(quoi);
    assert.ok(i > 0 && i < iLot,
      'le lot ouvre le wallet avant d avoir affiche « ' + quoi + ' » : le visiteur signerait un '
      + 'achat sans avoir lu ce qu il recoit');
  }
});

cas('⛔⛔ TEMOIN POSITIF : le lot atomique existe TOUJOURS sur Instant Birth', () => {
  /* ⛔ SANS CE CAS, supprimer `envoyerLotAtomique` de partout ne ferait rougir que le cas ci-dessus,
   *   et on pourrait croire avoir « simplifie » en retirant la capacite entiere. */
  const hors = html.slice(0, html.indexOf('async function acheterAvecUsdc('))
    + html.slice(html.indexOf("$('#fAcheterUsdc').addEventListener"));
  assert.match(hors, /envoyerLotAtomique\(/,
    'le lot atomique n existe plus ailleurs : la capacite a ete perdue, pas deplacee');
  assert.match(html, /import \{[^}]*envoyerLotAtomique[^}]*\} from '\.\/envoi\.js'/,
    'l import du lot atomique a disparu');
});

cas('⛔⛔ POUVOIR DE DETECTION PROUVE PAR MUTATION, pas par un HEAD qui bouge', () => {
  /* ⛔⛔⛔ SANS CE CAS, LES HUIT AUTRES NE PROUVENT RIEN SUR LEUR PROPRE UTILITE : un test ecrit
   *      APRES un correctif est vert par construction.
   *   ⛔⛔ MA PREMIERE VERSION LISAIT `git show HEAD:app.html`, ET C ETAIT UNE BOMBE A RETARDEMENT
   *      QUE J AI POSEE MOI-MEME : des que le correctif a ete commite, HEAD a contenu le correctif
   *      et ce cas est devenu ROUGE, sur un code parfaitement bon. Ce depot a DEJA retire deux
   *      epingles du meme genre de ses tests (« elle ne testait pas une fonctionnalite, elle testait
   *      que personne n avait deploye depuis ») — et j ai refait la faute le meme jour.
   *   ⇒ ON MUTE LE CODE COURANT EN MEMOIRE. Chaque mutation doit faire tomber la garde qui la
   *     surveille. Aucune dependance a l historique, donc rien qui pourrisse.
   *   ⛔ ET CHAQUE MUTATION VERIFIE D ABORD QU ELLE A CHANGE QUELQUE CHOSE : une mutation sans effet
   *     prouverait « la garde detecte » alors qu on n a rien mute. */
  const mutations = [
    ['la phrase a deux taps revient et le rappel disparait',
      (s) => s.replace('return acheterAvecUsdc(true)',
        "note.textContent = 'Approvals done. Tap Buy with USDC again to swap.'; return"),
      (m) => /Tap Buy with USDC again to swap/.test(m) || !/return\s+acheterAvecUsdc\(true\)/.test(m)],
    ['la garde de retombee disparait',
      (s) => s.replace('lot.sendCallsUnsupported !== true', 'false'),
      (m) => !/lot\.sendCallsUnsupported\s*!==\s*true/.test(m)],
    ['le lot ne contient plus le swap',
      (s) => s.replace('.concat([{ to: swap.to', '.concat([{ to: swap.pasLeSwap'),
      (m) => !/\.concat\(\[\{\s*to:\s*swap\.to/.test(m)],
    ['le devis n est plus affiche avant le lot',
      (s) => s.replace('r.plan.sortieAttendue', 'r.plan.PAS_DE_DEVIS'),
      (m) => {
        const i = m.indexOf('envoyerLotAtomique(');
        const j = m.indexOf('r.plan.sortieAttendue');
        return i > 0 && (j < 0 || j > i);
      }],
    ['la borne de recurrence disparait',
      (s) => s.replace('if (apresApprobation)', 'if (false)'),
      (m) => !/if \(apresApprobation\)/.test(m)],
  ];
  let attrapees = 0;
  for (const [quoi, muter, detecte] of mutations) {
    const m = muter(bloc);
    assert.notEqual(m, bloc, 'mutation SANS EFFET (« ' + quoi + ' ») : le motif mute n existe plus '
      + 'dans le code, donc ce controle ne mute rien et ne prouve rien');
    assert.equal(detecte(m), true, 'la mutation « ' + quoi + ' » N EST PAS DETECTEE : la garde '
      + 'correspondante est decorative');
    attrapees += 1;
  }
  assert.equal(attrapees, mutations.length);
  console.log('   ✓ ' + attrapees + '/' + mutations.length + ' mutations detectees, sans lire l historique.');
});

console.log('✓ test-achat-usdc-un-geste : ' + n + ' cas');
console.log('   L achat USDC tente UN lot, ne retombe en sequentiel QUE si le wallet dit ne pas');
console.log('   connaitre sendCalls, enchaine seul apres l approbation, et borne sa recurrence.');
console.log('   ⚠️ NE PROUVE PAS qu un wallet groupe ni qu un lot aboutisse : c est du texte lu.');
