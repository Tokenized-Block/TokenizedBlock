/* test-message-envoi.mjs — « RIEN N A BOUGE » NE DOIT JAMAIS S AFFICHER SUR UN ENVOI PARTI.
 *
 * ⛔⛔ LE DEFAUT, REEL, INTRODUIT PAR MOI LE 2026-09-29 ET TROUVE PAR UNE RELECTURE ADVERSARIALE.
 *     Les deux ecrans d achat testaient `env.etat !== 'CONFIRME'` et affichaient alors
 *     « Not sent: … — nothing moved, your ETH is untouched. » Or `envoyerDepuisWallet` rend AUSSI :
 *       `EN_ATTENTE`          — « sent, not confirmed yet — do not resend »
 *       `ANNULE_SUR_CHAINE`   — « the transaction reverted on chain » (le GAZ EST PAYE)
 *     Le visiteur lisait donc « Not sent: sent, not confirmed yet — do not resend — nothing moved,
 *     your ETH is untouched ». Les deux moities se contredisent, et la seconde INVITE A RE-SIGNER :
 *     achat en double. Le site du chemin USDC avait le meme defaut, ANTERIEUR au mien.
 *   ⛔ L ATOMICITE PROUVEE DIT « le swap aboutit ou ne se passe rien », PAS « rien n est parti ».
 *     La conclusion depassait la mesure d exactement un cran, et c est ce cran qui coute 0,01 ETH.
 *
 * ⛔⛔ LE TEMOIN POSITIF EST OBLIGATOIRE ICI, et l adversaire l a dit avant moi : sans lui,
 *     SUPPRIMER la phrase partout rendrait ce fichier vert. Une garde qui ne verifie que l absence
 *     s auto-satisfait en effacant ce qu elle surveille.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { messageEnvoi, ENVOI_RIEN_PARTI, ENVOI_PARTI } from './envoi.js';

let n = 0;
const cas = (titre, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

cas('⛔⛔ TEMOIN POSITIF : la phrase EXISTE pour les etats ou rien n est parti', () => {
  /* ⛔ SANS CE CAS, effacer « nothing moved » partout ferait passer tous les autres. */
  for (const etat of ENVOI_RIEN_PARTI) {
    const m = messageEnvoi({ etat, pourquoi: 'you declined in your wallet — nothing was sent' });
    assert.match(m, /nothing moved/i, etat + ' : la phrase rassurante a disparu');
    assert.match(m, /^Not sent/, etat + ' : le message ne dit plus que rien n est parti');
  }
  assert.ok(ENVOI_RIEN_PARTI.length >= 3, 'la liste des etats sans envoi a maigri');
});

cas('⛔⛔ UN ENVOI PARTI NE DOIT JAMAIS LIRE « nothing moved » NI « Not sent »', () => {
  for (const etat of ENVOI_PARTI) {
    const m = messageEnvoi({ etat, pourquoi: 'sent, not confirmed yet — do not resend' });
    assert.doesNotMatch(m, /nothing moved|untouched/i,
      etat + ' : l ecran affirme que rien n a bouge alors que la transaction est PARTIE');
    assert.doesNotMatch(m, /^Not sent/,
      etat + ' : l ecran dit « Not sent » sur un envoi parti — le visiteur va re-signer');
  }
});

cas('⛔⛔ ET IL DIT DE NE PAS RE-SIGNER : c est ca qui empeche l achat en double', () => {
  for (const etat of ENVOI_PARTI) {
    const m = messageEnvoi({ etat, pourquoi: 'x' });
    assert.match(m, /do NOT sign again|not sign again/i,
      etat + ' : rien n empeche le visiteur de re-signer, donc d acheter deux fois');
  }
});

cas('⛔⛔ TROIS ISSUES, JAMAIS DEUX : un etat inconnu n est pas « rien n est parti »', () => {
  /* ⛔ `ECHEC_ENVOI` dit lui-meme « check your wallet before retrying » : il ne GARANTIT pas que
   *   rien n a ete envoye. Le ranger avec « rien n est parti » serait refaire la faute. */
  for (const etat of ['ECHEC_ENVOI', 'ETAT_QUE_PERSONNE_N_A_PREVU', '']) {
    const m = messageEnvoi({ etat, pourquoi: 'the send failed — check your wallet before retrying' });
    assert.doesNotMatch(m, /nothing moved|untouched/i, etat + ' : un etat incertain rassure a tort');
    assert.match(m, /Unclear|may have been sent/i, etat + ' : l incertitude n est pas nommee');
  }
  assert.doesNotMatch(messageEnvoi({ etat: 'ECHEC_ENVOI', pourquoi: 'x' }), /^Not sent/,
    'ECHEC_ENVOI est presente comme « rien n est parti » alors que son propre message dit de '
    + 'verifier le wallet avant de reessayer');
});

cas('⛔ un objet absent ou vide ne fait pas planter l ecran', () => {
  for (const rien of [null, undefined, {}, { etat: null }]) {
    const m = messageEnvoi(rien);
    assert.equal(typeof m, 'string');
    assert.ok(m.length > 10, 'message vide sur ' + JSON.stringify(rien));
    assert.doesNotMatch(m, /nothing moved/i, 'un resultat absent rassure a tort');
  }
});

cas('⛔⛔ LES DEUX LISTES SONT DISJOINTES, et tous les etats de `envoi.js` sont classes', () => {
  /* ⛔ UN ETAT DANS LES DEUX LISTES rendrait le classement dependant de l ordre des tests. */
  for (const e of ENVOI_RIEN_PARTI) assert.equal(ENVOI_PARTI.includes(e), false, e + ' est dans les deux listes');
  /* ⛔⛔ ET ON EXTRAIT LES ETATS REELLEMENT RENDUS PAR `envoi.js`, au lieu de faire confiance a ma
   *     memoire : un etat ajoute demain et non classe tomberait dans « incertain », ce qui est le
   *     bon defaut — mais on veut le SAVOIR, pas le decouvrir chez un visiteur. */
  const src = readFileSync(new URL('./envoi.js', import.meta.url), 'utf8');
  const rendus = [...new Set([...src.matchAll(/etat:\s*'([A-Z_]+)'/g)].map((m) => m[1]))];
  assert.ok(rendus.length >= 8, 'extraction des etats suspecte : ' + rendus.length + ' trouves');
  const classes = new Set([...ENVOI_RIEN_PARTI, ...ENVOI_PARTI]);
  /* ⛔⛔ CES CINQ-LA NE SONT PAS DES RESULTATS D ENVOI, et ma premiere version les accusait a tort :
   *     ils viennent de `gardeChaineEtCompte`, qui verifie la chaine et le compte AVANT tout envoi
   *     et ne passe jamais par `messageEnvoi`. Les classer aurait melange deux vocabulaires.
   *   ⛔ MAIS LA LISTE EST FIGEE ICI, ET C EST LE POINT : un etat AJOUTE demain n y sera pas, donc
   *     ce test rougira. On ne surveille pas « zero non-classe », on surveille « pas de NOUVEAU
   *     non-classe » — c est la seule version qui tient dans le temps.
   *   ⛔ `ECHEC_ENVOI` est non-classe DELIBEREMENT : son propre message dit « check your wallet
   *     before retrying », donc il ne garantit pas que rien n a ete envoye, et il doit tomber en
   *     « incertain ». C est le cas teste juste au-dessus. */
  const HORS_ENVOI = ['CHAINE_ILLISIBLE', 'MAUVAISE_CHAINE', 'COMPTE_ILLISIBLE', 'AUTRE_COMPTE', 'OK'];
  const nonClasses = rendus.filter((e) => !classes.has(e) && !HORS_ENVOI.includes(e));
  assert.deepEqual(nonClasses, ['ECHEC_ENVOI'],
    'un etat de `envoi.js` n est ni classe ni connu comme hors-envoi : il tomberait en « incertain » '
    + 'sans qu on l ait decide. Etat(s) : ' + nonClasses.join(', '));
});

console.log('✓ test-message-envoi : ' + n + ' cas');
console.log('   « nothing moved » n existe QUE pour les etats ou rien n est parti, et tout envoi');
console.log('   parti dit de NE PAS re-signer. Temoin positif inclus.');
console.log('   ⚠️ NE PROUVE PAS qu un wallet rende le bon etat : il prouve ce que l ecran');
console.log('      en fait. Les etats eux-memes sont ceux que `envoi.js` ecrit.');
