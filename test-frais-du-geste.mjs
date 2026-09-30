/* test-frais-du-geste.mjs — LES 0,1 % SUR UN CADEAU NE DOIVENT JAMAIS SORTIR DU CADEAU.
 *
 * ⛔⛔ CE FICHIER GARDE L ARGENT DE QUELQU UN QUI N EST PAS DANS LA PIECE : le destinataire du GM.
 *     Deux montages existaient, Phil a tranche le 2026-09-30 :
 *       · retenir sur le montant envoye -> l ami recoit MOINS que ce que l expediteur a choisi.
 *         Preleve en douce sur un cadeau entre deux personnes. ⛔ REFUSE.
 *       · un SECOND TRANSFERT vers notre wallet -> l ami recoit EXACTEMENT ce qui est affiche,
 *         et notre part est une ligne separee, visible AVANT signature. ✅ Celui-ci.
 *     La garde centrale de ce fichier est donc : `pourAmi` vaut TOUJOURS le montant demande.
 *
 * ⛔⛔⛔ ET LA SECONDE : UN FRAIS QUI TOMBE A ZERO NE DOIT PAS PRODUIRE DE TRANSACTION. Ajouter une
 *      ligne de montant nul ferait payer du GAZ a quelqu un pour nous envoyer RIEN — un cout pur
 *      pour lui, zero pour nous.
 *
 * ⚠️ BORNE : le module est pur, le cablage est lu dans le texte. Rien ici ne prouve qu une
 *    transaction aboutisse on-chain, ni qu un wallet affiche ce qu on annonce.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires, trancheNue } from './outils-test.js';
import { fraisDuGeste, phraseFraisDuGeste, FRAIS_GESTE_BPS, ETATS_FRAIS } from './frais-du-geste.js';

const brut = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const html = sansCommentaires(brut, { minRetire: 5000 });
let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

cas('⛔⛔⛔ L AMI RECOIT TOUJOURS LE MONTANT ENTIER — la garde qui protege un absent', () => {
  for (const m of [1n, 999n, 100000000n, 12345678901234567890n, 10n ** 30n]) {
    const r = fraisDuGeste({ montant: m });
    assert.equal(r.pourAmi, m,
      'le montant destine a l ami a ete MODIFIE (' + m + ' -> ' + r.pourAmi + ') : c est le montage '
      + 'refuse, celui qui preleve en douce sur un cadeau');
  }
  /* ⛔ meme quand le frais est nul, meme quand il est desactive */
  assert.equal(fraisDuGeste({ montant: 5n }).pourAmi, 5n);
  assert.equal(fraisDuGeste({ montant: 5n, actif: false }).pourAmi, 5n);
});

cas('⛔⛔ UN FRAIS NUL NE PRODUIT PAS DE LIGNE', () => {
  /* ⛔ 0,1 % de 999 s arrondit a 0 : ajouter une transaction nulle ferait payer du gaz pour rien. */
  for (const petit of [0n, 1n, 500n, 999n]) {
    const r = fraisDuGeste({ montant: petit });
    assert.equal(r.frais, 0n, 'un frais non nul sur ' + petit);
    assert.equal(r.etat, petit === 0n ? 'TROP_PETIT' : 'TROP_PETIT');
    assert.match(phraseFraisDuGeste(r, String), /too small/i, 'le visiteur n apprend pas pourquoi rien n est pris');
  }
  /* ⛔ ET LE SEUIL EXACT, DES DEUX COTES : 1000 donne 1, 999 donne 0. Sans la paire, on ne saurait
   *   pas si le seuil est au bon endroit. */
  assert.equal(fraisDuGeste({ montant: 1000n }).frais, 1n);
  assert.equal(fraisDuGeste({ montant: 1000n }).etat, 'AVEC_FRAIS');
  assert.equal(fraisDuGeste({ montant: 999n }).frais, 0n);
});

cas('⛔ LE TAUX EST EXACTEMENT 0,1 %, ET ARRONDI VERS LE BAS', () => {
  assert.equal(FRAIS_GESTE_BPS, 10n, 'le taux a change sans decision');
  assert.equal(fraisDuGeste({ montant: 100000000n }).frais, 100000n);   /* 1 unite a 8 decimales */
  /* ⛔ VERS LE BAS : prendre moins plutot que plus. Arrondir vers le haut prendrait un wei de trop
   *   a chaque envoi, et « un wei » repete est un choix, pas un arrondi. */
  assert.equal(fraisDuGeste({ montant: 19999n }).frais, 19n, '19999 * 10 / 10000 = 19,999 -> 19');
});

cas('⛔⛔ UN MONTANT ILLISIBLE REND NON_MESURE, JAMAIS UN FRAIS DE ZERO', () => {
  /* ⛔⛔ Un frais de zero se lit comme « calcule, et il vaut zero ». Un montant illisible n est pas
   *     ca : c est « on ne sait pas ». Les confondre ferait passer une panne pour une decision. */
  for (const rien of [null, undefined, NaN, 'beaucoup', {}, [], -5, '12.5', 1.5]) {
    const r = fraisDuGeste({ montant: rien });
    assert.equal(r.etat, 'NON_MESURE', 'entree ' + String(rien) + ' -> ' + r.etat);
    assert.equal(r.frais, null, 'un frais est annonce alors que rien n a ete lu');
    assert.equal(r.pourAmi, null);
  }
  for (const e of [1n, null, 0n]) assert.ok(ETATS_FRAIS.includes(fraisDuGeste({ montant: e }).etat));
});

cas('⛔⛔ LA PHRASE DIT LE MONTANT, LE FRAIS, ET QU ON SIGNE LES DEUX', () => {
  /* ⛔⛔ C EST LA SEULE CHOSE QUI DISTINGUE CE MONTAGE D UN PRELEVEMENT SILENCIEUX. Si elle
   *     disparait, le montage devient celui qu on a refuse. */
  const r = fraisDuGeste({ montant: 100000000n });
  const p = phraseFraisDuGeste(r, (v) => v + ' NVDAc');
  assert.match(p, /in full/i, 'la phrase ne dit pas que l ami recoit TOUT');
  assert.match(p, /0\.1%/, 'la phrase ne nomme pas le taux');
  assert.match(p, /100000 NVDAc/, 'la phrase ne dit pas COMBIEN va a l app');
  assert.match(p, /sign both|see both/i, 'la phrase ne dit pas que les deux lignes sont signees');
});

/* ══ LE CABLAGE ═════════════════════════════════════════════════════════════════════════════ */
cas('⛔⛔ LE FRAIS N EXISTE QUE SUR UN SALUT, ET SEULEMENT SUR UN JETON', () => {
  const t = trancheNue(brut, 'function preparerEnvoi()', 'function majRecap()', 'preparerEnvoi');
  assert.match(t, /gesteEnvoiCourant === 'gm' && a\.adr/,
    'le frais ne depend pas du geste ET du fait que ce soit un jeton : il pourrait tomber sur un '
    + 'envoi ordinaire, ou sur un envoi d ETH ou il n a pas de sens');
  assert.match(t, /actif: false/, 'le cas « pas de frais » ne passe pas par le module : deux chemins divergeraient');
});

cas('⛔⛔⛔ LE SOLDE DOIT COUVRIR MONTANT + FRAIS', () => {
  /* ⛔⛔ SANS CE CONTROLE, la seconde ligne reverterait APRES que le cadeau soit parti : l ami
   *     aurait ses jetons, l expediteur aurait paye deux gaz, et l ecran aurait annonce un frais
   *     qui n arrive jamais. */
  const t = trancheNue(brut, 'function preparerEnvoi()', 'function majRecap()', 'preparerEnvoi');
  assert.match(t, /\(m\.valeur \+ fg\.frais\) > a\.solde/,
    'le solde n est verifie que contre le montant, pas contre montant + frais');
});

cas('⛔⛔ LE CADEAU PART EN PREMIER, DANS LE LOT COMME EN SEQUENTIEL', () => {
  /* ⛔ L ORDRE N EST PAS UN DETAIL : si la seconde ligne echoue, l ami a son cadeau et nous n avons
   *   rien — un frais non pris ne blesse personne. L inverse ferait payer pour un geste qui
   *   pourrait ensuite ne pas partir. */
  assert.match(html, /calls: \[p\.tx, p\.txFrais\]/,
    'dans le lot, la ligne de frais n est pas en second');
  const i = html.indexOf("r.etat === 'CONFIRME' && p.txFrais");
  assert.ok(i > 0, 'en sequentiel, la ligne de frais ne depend pas d un cadeau CONFIRME');
});

cas('⛔⛔⛔ PAS DE RETOMBEE APRES UN LOT PEUT-ETRE EN VOL', () => {
  /* ⛔⛔ Renvoyer apres un `ECHEC_ENVOI` enverrait le CADEAU deux fois. Meme garde que sur le
   *     chemin d achat, meme raison : `ECHEC_ENVOI` ne garantit pas que rien n est parti. */
  const t = trancheNue(brut, 'let lotTente = false;', 'envoiEnCours = false;', 'le bloc d envoi');
  assert.match(t, /lot\.sendCallsUnsupported !== true/,
    'la retombee en sequentiel n est pas bornee au seul cas sur : double envoi du cadeau possible');
});

cas('⛔⛔ LA PHRASE DE FRAIS EST AFFICHEE AVANT LA SIGNATURE', () => {
  const t = trancheNue(brut, 'function majRecap()', 'function basculer(', 'majRecap');
  assert.match(t, /phraseFraisDuGeste\(p\.frais/,
    'le recap n affiche pas la ligne de frais : le montage redevient un prelevement silencieux');
});

cas('⛔ LES QUATRE SALUTS EXISTENT ET PARTAGENT LE MEME GESTE', () => {
  for (const s of ['GM', 'BM', 'GN', 'Gmeow']) {
    assert.ok(html.includes('data-salut="' + s + '"'), 'le salut ' + s + ' a disparu de l ecran');
  }
  assert.match(html, /SALUTS\.includes\(salut\)/,
    'le salut vient du DOM sans etre valide contre une liste fermee');
  assert.match(html, /ouvrirEnvoiPour\(adr, \(t\) => \{ n\.textContent = t; \}, 'gm'\)/,
    'les saluts n ouvrent plus le geste `gm` : ils ne seraient plus comptes ensemble');
});

console.log('✓ test-frais-du-geste : ' + n + ' cas');
console.log('   L ami recoit TOUJOURS le montant entier ; les 0,1 % sont une ligne separee, visible');
console.log('   avant signature, et rien n est pris quand le frais tombe a zero.');
console.log('   ⚠️ NE PROUVE PAS qu une transaction aboutisse, ni qu un wallet affiche ce qu on annonce.');
