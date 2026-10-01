/* test-calldata-v3-frais.mjs — LA JAMBE v3 QUI PRELEVE, ET CE QU ELLE REFUSE DE CONSTRUIRE.
 *
 * ⛔⛔ LA CLASSE DE DEFAUT QUE CE FICHIER FERME : un calldata PARFAITEMENT VALIDE qui ne preleve
 *     rien. Trois façons d y arriver, et aucune ne reverte :
 *       · `SWEEP` avant `PAY_PORTION` — le routeur est vide quand le frais se calcule ;
 *       · le frais preleve sur un jeton que le routeur ne detient pas — une part de zero ;
 *       · l acheteur EST le beneficiaire — le frais lui revient.
 *     Les trois produisent une transaction verte. Un test qui ne regarde que `etat === 'PRET'`
 *     les laisse toutes passer : c est exactement ce qui a fait survivre trois mutations sur
 *     `plan-aerodrome-segment` ce mois-ci.
 *
 * ⛔ CE QU IL SAIT PROUVER : la STRUCTURE des octets et les refus. Il decode le calldata en sens
 *    INVERSE et verifie que chaque champ retombe a sa place — c est la seule preuve qui ne
 *    consiste pas a recopier l encodeur dans le test.
 * ⛔ CE QU IL NE PEUT PAS PROUVER, ET QUE SEUL LE BANC SUR FORK DIRA :
 *    · que `0x…02` designe bien « le routeur lui-meme » ;
 *    · que `PAY_PORTION` divise par 10 000 et pas par autre chose ;
 *    · qu un swap aboutisse.
 *    ⇒ `banc-v3-frais-fork.mjs`, aux SOLDES.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { calldataV3AvecFrais, minimumAcheteur, ROUTEUR_LUI_MEME, APPELANT,
  COMMANDE_SWEEP, COMMANDE_PAY_PORTION, FRAIS_BPS_MAX_PRUDENT, BASE_BPS } from './calldata-v3-frais.js';
import { ROUTEUR_UNIVERSEL, COMMANDE_V3_SWAP_EXACT_IN } from './calldata-v3.js';

let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

const R = ROUTEUR_UNIVERSEL[8453];
const WETH = '0x4200000000000000000000000000000000000006';
const TOSHI = '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const ACHETEUR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const A6CF = '0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4';

const BON = {
  sauts: [{ de: WETH, vers: TOSHI, fee: 10000 }],
  acheteur: ACHETEUR, beneficiaireFrais: A6CF, fraisBps: 10n,
  amountIn: 10n ** 16n, sortieMinimumTotale: 1000000n,
  deadline: 2000n, maintenant: 1000n,
};
const bon = (sur = {}) => calldataV3AvecFrais({ ...BON, ...sur });

/* ── LE CAS NOMINAL, D ABORD ─────────────────────────────────────────────────────────────────── */
cas('⛔ le cas nominal est PRET, sinon tous les refus ci-dessous ne prouvent rien', () => {
  /* ⛔⛔ SANS CE CAS, UN MODULE QUI REFUSE TOUT PASSERAIT CHAQUE ASSERTION DE REFUS. Un fichier de
   *     tests qui n a que des « non » est vert sur une fonction cassee. */
  const r = bon();
  assert.equal(r.etat, 'PRET', r.pourquoi);
  assert.equal(r.to, R);
  assert.equal(r.value, '0x0');
  assert.equal(r.resume.exigeAtomique, false);
  assert.equal(r.resume.viaPermit2, true);
});

/* ── LE DECODAGE INVERSE : LA STRUCTURE SE REFERME SUR ELLE-MEME ─────────────────────────────── */
/** Decoupe le calldata `execute(bytes,bytes[],uint256)` et rend ses champs. */
function decoder(data) {
  const h = String(data).replace(/^0x/, '');
  const sel = h.slice(0, 8);
  const corps = h.slice(8);
  const motA = (i) => corps.slice(i * 64, (i + 1) * 64);
  const nb = (s) => BigInt('0x' + s);
  const offCommands = Number(nb(motA(0))), offInputs = Number(nb(motA(1)));
  const deadline = nb(motA(2));
  const lenCmd = Number(nb(corps.slice(offCommands * 2, offCommands * 2 + 64)));
  const commands = corps.slice(offCommands * 2 + 64, offCommands * 2 + 64 + lenCmd * 2);
  const base = offInputs * 2;
  const nbIn = Number(nb(corps.slice(base, base + 64)));
  const inputs = [];
  for (let i = 0; i < nbIn; i += 1) {
    const off = Number(nb(corps.slice(base + 64 + i * 64, base + 128 + i * 64)));
    /* ⛔ L OFFSET EST RELATIF AU DEBUT DE LA ZONE DE DONNEES DU TABLEAU, c est-a-dire APRES le mot
     *   de longueur. Se tromper d un mot ici ferait « decoder » des octets voisins — et un test qui
     *   se trompe du meme cote que le code ne prouve rien. */
    const d = base + 64 + off * 2;
    const len = Number(nb(corps.slice(d, d + 64)));
    inputs.push(corps.slice(d + 64, d + 64 + len * 2));
  }
  return { sel, offCommands, offInputs, deadline, commands, inputs };
}
const adrDuMot = (m) => '0x' + m.slice(24);

cas('⛔⛔ LES TROIS COMMANDES, DANS CET ORDRE — SWEEP EN DERNIER', () => {
  /* ⛔⛔⛔ L ORDRE N EST PAS COSMETIQUE. `SWEEP` envoie TOUT le solde du jeton : place avant
   *      `PAY_PORTION`, il viderait le routeur et le frais vaudrait ZERO — sans revert, sans trace.
   *      C est le motif « le frais jamais preleve » deja paye dans ce depot. */
  const d = decoder(bon().data);
  assert.equal(d.commands, COMMANDE_V3_SWAP_EXACT_IN + COMMANDE_PAY_PORTION + COMMANDE_SWEEP);
  /* ⛔⛔ LE LITTERAL EST L ASSERTION QUI COMPTE, ET C EST LUI QUI A CEDE EN PREMIER. La ligne
   *     au-dessus recompose la chaine a partir des MEMES constantes que le module : elle passerait
   *     meme si l ordre etait inverse. Le littéral, lui, ne derive de rien — et il m a attrape :
   *     j avais ecrit `000406` (swap, SWEEP, PAY_PORTION) alors que l ordre voulu est
   *     swap -> PAY_PORTION -> SWEEP, donc `00` `06` `04`. Le module avait raison, le test avait
   *     tort, et seule la valeur INDEPENDANTE pouvait le dire.
   *   ⇒ C est aussi pour ca que les deux lignes restent : une assertion derivee garde le cablage
   *     des constantes, une assertion littérale garde l INTENTION. Elles ne protegent pas la
   *     meme chose. */
  assert.equal(d.commands, '000604', 'swap, puis PAY_PORTION, puis SWEEP — dans cet ordre');
  assert.equal(d.inputs.length, 3, 'un input par commande, exactement');
  assert.equal(d.deadline, BON.deadline);
});

cas('⛔⛔ LE SWAP VERSE AU ROUTEUR, PAS A L ACHETEUR', () => {
  /* ⛔⛔⛔ SI LE SWAP VERSAIT DIRECTEMENT A L ACHETEUR, le routeur n aurait RIEN a repartir :
   *      `PAY_PORTION` prendrait une part de zero et `SWEEP` ne balaierait rien. La transaction
   *      reussirait, l acheteur recevrait tout, et le frais vaudrait zero. */
  const d = decoder(bon().data);
  assert.equal(adrDuMot(d.inputs[0].slice(0, 64)).toLowerCase(), ROUTEUR_LUI_MEME.toLowerCase());
  assert.notEqual(adrDuMot(d.inputs[0].slice(0, 64)).toLowerCase(), ACHETEUR.toLowerCase());
  /* `payerIsUser` = 1 : l entree vient du wallet, pas du solde du routeur. */
  assert.equal(BigInt('0x' + d.inputs[0].slice(4 * 64, 5 * 64)), 1n);
  /* et le minimum du swap porte sur le TOTAL, avant prelevement */
  assert.equal(BigInt('0x' + d.inputs[0].slice(2 * 64, 3 * 64)), BON.sortieMinimumTotale);
});

cas('⛔⛔ LE FRAIS PORTE SUR LE JETON DE SORTIE DU CHEMIN, ET VA AU BENEFICIAIRE', () => {
  /* ⛔ Si le jeton du frais etait un parametre libre, on pourrait prelever sur un jeton que le
   *   routeur ne detient PAS : `PAY_PORTION` prendrait une part de zero, sans reverter. Une valeur
   *   DEDUITE du chemin ne peut pas diverger de sa source. */
  const d = decoder(bon().data);
  assert.equal(adrDuMot(d.inputs[1].slice(0, 64)).toLowerCase(), TOSHI.toLowerCase());
  assert.equal(adrDuMot(d.inputs[1].slice(64, 128)).toLowerCase(), A6CF.toLowerCase());
  assert.equal(BigInt('0x' + d.inputs[1].slice(128, 192)), 10n);
  /* ⛔ ET SUR UN CHEMIN A DEUX SAUTS, c est la sortie FINALE, pas le jeton du milieu. */
  const d2 = decoder(bon({ sauts: [{ de: WETH, vers: USDC, fee: 500 }, { de: USDC, vers: TOSHI, fee: 10000 }] }).data);
  assert.equal(adrDuMot(d2.inputs[1].slice(0, 64)).toLowerCase(), TOSHI.toLowerCase());
});

cas('⛔ LE SWEEP VA A L ACHETEUR, AVEC SON PROPRE MINIMUM', () => {
  const d = decoder(bon().data);
  assert.equal(adrDuMot(d.inputs[2].slice(0, 64)).toLowerCase(), TOSHI.toLowerCase());
  assert.equal(adrDuMot(d.inputs[2].slice(64, 128)).toLowerCase(), ACHETEUR.toLowerCase());
  const attendu = minimumAcheteur(BON.sortieMinimumTotale, BON.fraisBps);
  assert.equal(BigInt('0x' + d.inputs[2].slice(128, 192)), attendu);
  /* ⛔ et il est STRICTEMENT inferieur au total : sinon le frais ne pourrait pas etre preleve. */
  assert.ok(attendu < BON.sortieMinimumTotale, 'le minimum de l acheteur doit laisser place au frais');
  assert.ok(attendu > 0n, 'un sweep a zero laisserait tout partir au frais');
});

/* ── L ARRONDI ──────────────────────────────────────────────────────────────────────────────── */
cas('⛔⛔ LE MINIMUM DE L ACHETEUR ARRONDIT VERS LE BAS, COMME LE ROUTEUR', () => {
  /* ⛔⛔ Le routeur calcule `sortie * bips / BASE` en division ENTIERE. Si on exigeait pour
   *     l acheteur `total - ceil(frais)`, un wei d arrondi ferait reverter le SWEEP sur une
   *     transaction par ailleurs parfaite. Un garde juste au wei pres qui casse le cas nominal
   *     coute de l argent. */
  assert.equal(minimumAcheteur(10000n, 10n), 9990n);
  assert.equal(minimumAcheteur(999n, 10n), 999n, '999 * 10 / 10000 = 0 en division entiere');
  assert.equal(minimumAcheteur(1001n, 10n), 1000n, '1001 * 10 / 10000 = 1');
  /* ⛔ TEMOIN : la somme ne depasse JAMAIS le total — sinon le SWEEP demanderait plus qu il n y a. */
  for (const t of [1n, 7n, 999n, 1000n, 123457n, 10n ** 18n]) {
    for (const b of [1n, 10n, 50n, FRAIS_BPS_MAX_PRUDENT]) {
      const part = (t * b) / BASE_BPS;
      assert.equal(minimumAcheteur(t, b) + part, t, 'minimum + frais doit faire EXACTEMENT le total');
    }
  }
});

/* ── LES REFUS QUI PROTEGENT L ARGENT ───────────────────────────────────────────────────────── */
cas('⛔⛔⛔ L ACHETEUR NE PEUT PAS ETRE LE BENEFICIAIRE DU FRAIS', () => {
  /* ⛔⛔ C est le piege qui rend un test VERT sur un frais NUL : `PAY_PORTION` rendrait a l acheteur
   *     ses propres jetons, la transaction reussirait, et rien ne serait preleve. Meme famille que
   *     `bps = estWalletDeFrais(compte) ? 0n` qui fait qu un test depuis a6cf est toujours vert. */
  const r = bon({ beneficiaireFrais: ACHETEUR });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /same address/);
  /* ⛔ et la casse ne doit pas suffire a contourner le refus */
  assert.equal(bon({ beneficiaireFrais: ACHETEUR.toUpperCase().replace('0X', '0x') }).etat, 'REFUSE');
});

cas('⛔⛔ UN FRAIS A ZERO EST REFUSE — ce module existe POUR prelever', () => {
  for (const b of [0n, -1n]) assert.equal(bon({ fraisBps: b }).etat, 'REFUSE', 'bps ' + b);
  assert.equal(bon({ fraisBps: undefined }).etat, 'REFUSE');
  assert.equal(bon({ fraisBps: null }).etat, 'REFUSE');
});

cas('⛔ UN FRAIS AU-DESSUS DU PLAFOND PRUDENT EST REFUSE', () => {
  assert.equal(bon({ fraisBps: FRAIS_BPS_MAX_PRUDENT }).etat, 'PRET', 'le plafond lui-meme est admis');
  assert.equal(bon({ fraisBps: FRAIS_BPS_MAX_PRUDENT + 1n }).etat, 'REFUSE');
});

cas('⛔⛔ NI LE ROUTEUR NI SES SENTINELLES NE PEUVENT RECEVOIR', () => {
  /* ⛔ `0x…01` et `0x…02` ne sont pas des adresses, ce sont des ORDRES adresses au routeur. */
  for (const mauvais of [R, ROUTEUR_LUI_MEME, APPELANT, '0x' + '0'.repeat(40)]) {
    assert.equal(bon({ acheteur: mauvais }).etat, 'REFUSE', 'acheteur ' + mauvais);
    assert.equal(bon({ beneficiaireFrais: mauvais }).etat, 'REFUSE', 'beneficiaire ' + mauvais);
  }
});

cas('⛔ LES MONTANTS NULS SONT REFUSES', () => {
  assert.equal(bon({ amountIn: 0n }).etat, 'REFUSE');
  assert.equal(bon({ sortieMinimumTotale: 0n }).etat, 'REFUSE');
  /* ⛔ ET LE CAS LIMITE DE L ARRONDI : un total de 1 wei avec 10 bps laisse l acheteur a 1, donc
   *   PRET. Mais si le frais mangeait tout, on refuse plutot que de balayer a zero. */
  assert.equal(bon({ sortieMinimumTotale: 1n }).etat, 'PRET');
});

cas('⛔ LE DEADLINE EST JUGE CONTRE L INSTANT FOURNI, jamais contre une horloge interne', () => {
  assert.equal(bon({ deadline: 999n }).etat, 'REFUSE', 'deja passe');
  assert.equal(bon({ deadline: 1000n }).etat, 'REFUSE', 'egal a maintenant');
  assert.equal(bon({ deadline: 1000n + 1801n }).etat, 'REFUSE', 'trop loin');
  assert.equal(bon({ deadline: 1000n + 1800n }).etat, 'PRET', 'la borne exacte est admise');
  /* ⛔ sans instant de reference, on ne JUGE pas — et on le DIT, au lieu de laisser croire. */
  const r = calldataV3AvecFrais({ ...BON, maintenant: null });
  assert.equal(r.etat, 'PRET');
  assert.match(r.resume.noteDeadline, /not judged/);
});

cas('⛔ UN CHEMIN CASSE EST REFUSE AVANT TOUTE CONSTRUCTION', () => {
  assert.equal(bon({ sauts: [] }).etat, 'REFUSE');
  assert.equal(bon({ sauts: [{ de: WETH, vers: WETH, fee: 10000 }] }).etat, 'REFUSE');
  /* ⛔ un chemin qui ne se chaine pas : la sortie du premier n est pas l entree du second */
  assert.equal(bon({ sauts: [{ de: WETH, vers: USDC, fee: 500 }, { de: TOSHI, vers: WETH, fee: 10000 }] }).etat, 'REFUSE');
  /* ⛔ un `fee` hors uint24 : le tronquer designerait une pool qui n existe pas */
  assert.equal(bon({ sauts: [{ de: WETH, vers: TOSHI, fee: 1 << 24 }] }).etat, 'REFUSE');
});

/* ── LE MODULE EST REJOUABLE ────────────────────────────────────────────────────────────────── */
cas('⛔⛔ AUCUN RESEAU, AUCUNE HORLOGE — le calldata est rejouable A L OCTET', () => {
  /* ⛔⛔ UN MODULE QUI LIT L HEURE NE PEUT PAS ETRE PROUVE PAR REJEU, et c est le rejeu qui prouve
   *     tout le reste ici. La garde est STRUCTURELLE : on lit la source. */
  const src = readFileSync(new URL('./calldata-v3-frais.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const interdit of ['Date.now', 'new Date', 'fetch(', 'Math.random', 'performance.now']) {
    assert.ok(!src.includes(interdit), 'le module touche a ' + interdit + ' : plus rejouable');
  }
  /* ⛔ TEMOIN DU DEPOUILLEMENT : si le strip-commentaires avalait tout, la garde serait vide et
   *   verte. On verifie qu il reste du CODE. */
  assert.ok(src.includes('export function calldataV3AvecFrais'), 'le depouillement a tout mange');
  assert.equal(bon().data, bon().data, 'deux appels identiques doivent rendre les memes octets');
});

cas('⛔ LE ROUTEUR EST LE MEME QUE CELUI DE calldata-v3.js, pas une seconde adresse', () => {
  /* ⛔⛔ DEUX ADRESSES DE ROUTEUR QUI DIVERGENT ENVERRAIENT DE L ARGENT A UN CONTRAT DIFFERENT.
   *     On IMPORTE, on ne recopie pas — et ce cas garde l import. */
  assert.equal(bon().to, ROUTEUR_UNIVERSEL[8453]);
  const src = readFileSync(new URL('./calldata-v3-frais.js', import.meta.url), 'utf8');
  assert.ok(src.includes("from './calldata-v3.js'"), 'le routeur n est plus importe mais recopie');
  assert.ok(!/ROUTEUR_UNIVERSEL\s*=\s*Object\.freeze/.test(src), 'une seconde definition du routeur');
});

/* ⛔⛔ LA SUITE SE COMPTE ELLE-MEME : un cas supprime par megarde passerait inapercu, et « moins de
 *     tests » ressemble a « tout va bien ». */
assert.equal(n, 15, 'compte de cas inattendu : ' + n);
console.log('✓ test-calldata-v3-frais : ' + n + ' cas');
console.log('   Trois commandes dans UN execute : swap vers le routeur, PAY_PORTION, puis SWEEP.');
console.log('   Le calldata est DECODE en sens inverse — la structure se referme sur elle-meme.');
console.log('   ⚠️ NE PROUVE PAS que 0x…02 designe le routeur, ni que PAY_PORTION divise par 10 000.');
console.log('   ⇒ banc-v3-frais-fork.mjs, aux SOLDES.');
