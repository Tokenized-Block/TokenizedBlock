/* test-calldata-v3.mjs — REJOUER A L OCTET UNE TRANSACTION v3 REUSSIE.
 *
 * ⛔⛔ LE SEUL TEST QUI VAUT ICI. Un encodeur ABI peut etre « raisonnable » et faux : un champ
 *     inverse, un offset d un mot, un `fee` sur 2 ou 4 octets au lieu de 3. Aucune relecture ne
 *     l attrape de facon fiable. On exige donc l egalite OCTET POUR OCTET avec un appel que la
 *     chaine a ACCEPTE.
 *
 * ⛔⛔ LE TEMOIN A REUSSI, ET C EST UNE CONDITION. `status = 0x1`, 6 logs. Rejouer une transaction
 *     qui a REVERTE prouverait qu on sait encoder quelque chose que la chaine a REFUSE.
 *
 * PROVENANCE, mesuree le 2026-09-28 :
 *   0x924856e262744415ea93aaf2782faa04e639330874d1fbe6b851bdb3c2f13bfe
 *   bloc 51 907 810, ts 1 790 604 967, deadline = ts + 58 s, 548 octets de calldata,
 *   `to` = l Universal Router, selecteur `execute(bytes,bytes[],uint256)`, commands = `0x00`.
 *   L octet `0x00` est mesure par CROISEMENT : present dans les DIX transactions ou le routeur etait
 *   le `sender` d un `Swap` v3, absent du temoin sans swap v3, et `0x10` (notre swap v4) ne ressort
 *   pas comme candidat.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un swap aboutisse, ni que la pool visee existe.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { calldataV3ExactIn, encoderChemin, ROUTEUR_UNIVERSEL, COMMANDE_V3_SWAP_EXACT_IN } from './calldata-v3.js';
import { selecteur, mot, motAdr, dyn } from './pool.js';
import { ROUTEUR as ROUTEUR_ECHANGE } from './echange.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const JETON_A = '0xf3081494b87e8d5fb7960f066e931d1d0e6e3d67';

const TEMOIN = {
  tx: '0x924856e262744415ea93aaf2782faa04e639330874d1fbe6b851bdb3c2f13bfe',
  blocTs: 1790604967n,
  statut: '0x1',
  entree: {
    sauts: [{ de: JETON_A, vers: WETH, fee: 3000 }, { de: WETH, vers: USDC, fee: 3000 }],
    recipient: '0x041e9e88288c0c62b8549c50a759a74a1a65b6b7',
    amountIn: 0x0506151500b10000n,
    amountOutMinimum: 0x068e57e1n,
    deadline: 0x6aba76e1n,
    payerIsUser: true,
  },
  calldata: '0x3593564c'
    + '0000000000000000000000000000000000000000000000000000000000000060'
    + '00000000000000000000000000000000000000000000000000000000000000a0'
    + '000000000000000000000000000000000000000000000000000000006aba76e1'
    + '0000000000000000000000000000000000000000000000000000000000000001'
    + '0000000000000000000000000000000000000000000000000000000000000000'
    + '0000000000000000000000000000000000000000000000000000000000000001'
    + '0000000000000000000000000000000000000000000000000000000000000020'
    + '0000000000000000000000000000000000000000000000000000000000000120'
    + '000000000000000000000000041e9e88288c0c62b8549c50a759a74a1a65b6b7'
    + '0000000000000000000000000000000000000000000000000506151500b10000'
    + '00000000000000000000000000000000000000000000000000000000068e57e1'
    + '00000000000000000000000000000000000000000000000000000000000000a0'
    + '0000000000000000000000000000000000000000000000000000000000000001'
    + '0000000000000000000000000000000000000000000000000000000000000042'
    + 'f3081494b87e8d5fb7960f066e931d1d0e6e3d67000bb84200000000000000000000000000000000000006000bb8833589fcd6edb6e08f4c7c32d4f71b54bda02913000000000000000000000000000000000000000000000000000000000000',
};

cas('⛔ le temoin recopie est bien forme AVANT de servir de reference', () => {
  /* ⛔⛔ UN TEMOIN NON VERIFIE A DEJA ETE LA CIBLE dans ce projet. */
  assert.equal((TEMOIN.calldata.length - 2) / 2, 548, 'le temoin recopie ne fait pas 548 octets');
  assert.equal(TEMOIN.calldata.slice(2, 10), selecteur('execute(bytes,bytes[],uint256)').replace(/^0x/, ''));
  assert.equal(TEMOIN.statut, '0x1', 'rejouer une transaction qui a reverte ne prouverait rien');
  const corps = TEMOIN.calldata.slice(10);
  assert.equal(BigInt('0x' + corps.slice(0x60 * 2, 0x60 * 2 + 64)), 1n, 'le temoin ne porte pas une seule commande');
  assert.equal(corps.slice(0x60 * 2 + 64, 0x60 * 2 + 66), COMMANDE_V3_SWAP_EXACT_IN);
});

cas('⛔⛔ le calldata est reproduit A L OCTET', () => {
  const r = calldataV3ExactIn({ ...TEMOIN.entree, maintenant: TEMOIN.blocTs });
  assert.equal(r.etat, 'PRET', r.pourquoi || '');
  assert.equal(r.to.toLowerCase(), ROUTEUR_UNIVERSEL[8453].toLowerCase());
  assert.equal(r.value, '0x0', 'cette jambe echange deux ERC-20 : aucune valeur ne doit partir');
  assert.equal(r.data, TEMOIN.calldata, 'calldata different de la transaction reelle');
  assert.equal(r.champs.cheminOctets, 66, 'le path mesure faisait 66 octets (20 + 23 + 23)');
  assert.equal(r.champs.entree, JETON_A.toLowerCase());
  assert.equal(r.champs.sortie, USDC.toLowerCase());
  assert.match(r.noteDeadline, /58 s/, 'le deadline mesure etait a +58 s du bloc');
});

cas('⛔ le chemin : 20 + 23 par saut, fee sur TROIS octets', () => {
  const un = encoderChemin([{ de: USDC, vers: WETH, fee: 500 }]);
  assert.equal(un.etat, 'PRET');
  assert.equal(un.octets, 43, 'un saut = 20 + 3 + 20');
  assert.equal(un.hex, USDC.slice(2).toLowerCase() + '0001f4' + WETH.slice(2).toLowerCase());
  const deux = encoderChemin(TEMOIN.entree.sauts);
  assert.equal(deux.octets, 66, 'deux sauts = 20 + 23 + 23');
  /* ⛔ LE FEE TIENT SUR TROIS OCTETS, ET LE TEMOIN LE PROUVE : 3 000 s ecrit `000bb8`. Sur QUATRE
   *   octets le path ferait 68 et non 66 — l egalite de longueur avec la chaine EST le test. */
  assert.ok(deux.hex.includes('000bb8'), 'fee 3000 doit s ecrire sur trois octets');
  assert.ok(!deux.hex.includes('00000bb8'), 'fee encode sur quatre octets : le path serait trop long');
});

cas('⛔ un chemin qui ne se CHAINE pas est refuse', () => {
  /* ⛔ La sortie d un saut doit etre l entree du suivant. Un maillon disjoint produirait un path
   *   accepte par l encodeur et refuse par la chaine — un revert illisible, APRES signature. */
  const casse = encoderChemin([{ de: USDC, vers: WETH, fee: 500 }, { de: JETON_A, vers: USDC, fee: 3000 }]);
  assert.equal(casse.etat, 'REFUSE');
  assert.match(casse.pourquoi, /does not chain/i);
  assert.equal(encoderChemin(TEMOIN.entree.sauts).etat, 'PRET');
});

cas('⛔ un fee hors uint24, ou negatif, est refuse', () => {
  for (const fee of [-1, 1 << 24, 16777216, null, undefined]) {
    assert.equal(encoderChemin([{ de: USDC, vers: WETH, fee }]).etat, 'REFUSE', 'fee=' + String(fee));
  }
  /* ⛔ TEMOIN POSITIF AUX BORNES : sinon la garde refuserait tout et ce test serait satisfait par
   *   un encodeur inutilisable. */
  assert.equal(encoderChemin([{ de: USDC, vers: WETH, fee: 0 }]).etat, 'PRET');
  assert.equal(encoderChemin([{ de: USDC, vers: WETH, fee: (1 << 24) - 1 }]).etat, 'PRET');
});

cas('⛔⛔ amountOutMinimum a zero est REFUSE', () => {
  for (const min of [0, 0n, null, undefined, '0']) {
    const r = calldataV3ExactIn({ ...TEMOIN.entree, amountOutMinimum: min, maintenant: TEMOIN.blocTs });
    assert.equal(r.etat, 'REFUSE', 'minOut=' + JSON.stringify(String(min)) + ' doit etre refuse');
    assert.match(r.pourquoi, /greater than zero/i);
  }
});

cas('⛔⛔ payerIsUser est EXIGE explicitement', () => {
  /* ⛔ `false` veut dire « paie depuis le solde du routeur » : correct au milieu d une chaine de
   *   commandes, FAUX pour un swap d utilisateur, et l erreur ne donne pas un revert parlant. */
  for (const v of [undefined, null, 1, 0, 'true', '']) {
    const r = calldataV3ExactIn({ ...TEMOIN.entree, payerIsUser: v, maintenant: TEMOIN.blocTs });
    assert.equal(r.etat, 'REFUSE', 'payerIsUser=' + JSON.stringify(v) + ' doit etre refuse');
    assert.match(r.pourquoi, /explicitly/i);
  }
  assert.equal(calldataV3ExactIn({ ...TEMOIN.entree, payerIsUser: true, maintenant: TEMOIN.blocTs }).etat, 'PRET');
  assert.equal(calldataV3ExactIn({ ...TEMOIN.entree, payerIsUser: false, maintenant: TEMOIN.blocTs }).etat, 'PRET');
  /* ⛔ et les deux calldata DIFFERENT : sinon le drapeau serait decoratif */
  assert.notEqual(calldataV3ExactIn({ ...TEMOIN.entree, payerIsUser: true, maintenant: TEMOIN.blocTs }).data,
    calldataV3ExactIn({ ...TEMOIN.entree, payerIsUser: false, maintenant: TEMOIN.blocTs }).data);
});

cas('⛔ le ROUTEUR comme destinataire est refuse, et l adresse nulle aussi', () => {
  /* ⛔ Le routeur accepte d etre destinataire pour chainer des commandes : l y mettre par erreur
   *   laisse la sortie chez lui SANS AUCUNE ERREUR. Piege reel, pas theorique. */
  const surLeRouteur = calldataV3ExactIn({ ...TEMOIN.entree, recipient: ROUTEUR_UNIVERSEL[8453],
    maintenant: TEMOIN.blocTs });
  assert.equal(surLeRouteur.etat, 'REFUSE');
  assert.match(surLeRouteur.pourquoi, /router itself/i);
  assert.equal(calldataV3ExactIn({ ...TEMOIN.entree, recipient: '0x' + '0'.repeat(40),
    maintenant: TEMOIN.blocTs }).etat, 'REFUSE');
  for (const mauvaise of ['', '0x', '0xzz', USDC.slice(0, 20)]) {
    assert.equal(calldataV3ExactIn({ ...TEMOIN.entree, recipient: mauvaise, maintenant: TEMOIN.blocTs }).etat, 'REFUSE');
  }
});

cas('⛔ un deadline passe, ou trop lointain, est refuse', () => {
  const t = TEMOIN.blocTs;
  assert.equal(calldataV3ExactIn({ ...TEMOIN.entree, deadline: t, maintenant: t }).etat, 'REFUSE');
  assert.equal(calldataV3ExactIn({ ...TEMOIN.entree, deadline: t + 1801n, maintenant: t }).etat, 'REFUSE');
  /* temoin positif a la borne exacte */
  assert.equal(calldataV3ExactIn({ ...TEMOIN.entree, deadline: t + 1800n, maintenant: t }).etat, 'PRET');
  const sans = calldataV3ExactIn({ ...TEMOIN.entree, maintenant: null });
  assert.equal(sans.etat, 'PRET');
  assert.match(sans.noteDeadline, /not judged/i);
});

cas('⛔⛔ l octet de commande v3 n est PAS celui du swap v4', () => {
  /* ⛔ `0x10` est le swap v4 dans `pool.js`. Les confondre enverrait la commande dans la mauvaise
   *   famille — c est exactement ce que la mesure par croisement a ecarte. */
  assert.equal(COMMANDE_V3_SWAP_EXACT_IN, '00');
  assert.notEqual(COMMANDE_V3_SWAP_EXACT_IN, '10');
  const src = readFileSync(new URL('./pool.js', import.meta.url), 'utf8');
  assert.ok(src.includes("const commands = dyn('10')"),
    'pool.js n utilise plus 0x10 pour le swap v4 : la distinction ci-dessus doit etre revue');
});

cas('⛔⛔ UNE SEULE adresse de routeur, et UNE SEULE copie des helpers', () => {
  assert.equal(ROUTEUR_UNIVERSEL[8453].toLowerCase(), String(ROUTEUR_ECHANGE[8453]).toLowerCase(),
    'l adresse du routeur diverge de celle d echange.js');
  /* ⛔ LES HELPERS SONT IMPORTES, PAS RECOPIES : `pool.js` porte deja DEUX corrections d offset
   *   payees en production ; une copie plus faible les rejouerait en silence. */
  const src = readFileSync(new URL('./calldata-v3.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  for (const nom of ['const mot =', 'const motAdr =', 'const dyn =', 'function mot(', 'function dyn(']) {
    assert.ok(!src.includes(nom), 'calldata-v3.js redefinit ' + nom + ' au lieu d importer pool.js');
  }
  assert.ok(/import \{ selecteur, mot, motAdr, dyn \} from '\.\/pool\.js'/.test(src),
    'les helpers ne sont plus importes de pool.js');
  assert.equal(mot(1).length, 64);
  assert.equal(motAdr(USDC).length, 64);
  assert.equal(dyn('00').length, 128);
});

cas('⛔ le module reste PUR : ni reseau, ni horloge, ni signature', () => {
  const src = readFileSync(new URL('./calldata-v3.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  for (const interdit of ['fetch(', 'Date.now', 'new Date', 'Math.random', 'eth_sendTransaction',
    'wallet_sendCalls', 'personal_sign', 'eth_sign', 'XMLHttpRequest']) {
    assert.ok(!src.includes(interdit), 'calldata-v3.js contient ' + interdit + ' — il doit rester pur');
  }
});

assert.equal(n, 12, 'compte de cas inattendu : ' + n);
console.log('✓ test-calldata-v3 : ' + n + ' cas');
console.log('   1 transaction REUSSIE (status 0x1) rejouee A L OCTET, 548 octets.');
console.log('   ⚠️ NE PROUVE PAS qu un swap aboutisse, ni que la pool visee existe.');
