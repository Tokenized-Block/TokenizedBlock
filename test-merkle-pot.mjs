// test-merkle-pot.mjs — l arbre JS doit tomber d accord AU BIT PRES avec TBlockPot.sol.
//
// ⛔⛔ LES VALEURS DE REFERENCE CI-DESSOUS VIENNENT DU CONTRAT, PAS D UNE DOC. Elles ont ete imprimees
//    par `forge test --match-contract TBlockPotTemoinsTest -vv` le 2026-09-20, sur le vrai
//    TBlockPot.feuille et le vrai MerkleProof d OpenZeppelin.
//    Sans ce pont, deux implementations pourraient diverger sans que personne ne le voie : une racine
//    calculee ici mais refusee par la chaine bloquerait tous les beneficiaires, et une racine
//    acceptee pour de mauvaises feuilles paierait les mauvaises adresses.
import assert from 'node:assert/strict';
import { feuille, noeud, construireArbre, verifierPreuve } from './merkle-pot.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const ID = 7;
const JETON = '0xb2000000000000000000006d6f9102e9e4b221e0';
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const C = '0x3333333333333333333333333333333333333333';
const UN = 1000000000000000000n;

/* ── imprimees par le contrat, le 2026-09-20 ────────────────────────────────────────────────────── */
const F_A = '0xf0032407ad3f9920dc50420cb11648ce692c2e6bac313bf3a4492cb75003da2f';
const F_B = '0xc504b7d01100b791fff440e8c67ec960ec1b96537a03546d5adfeea909ae6112';
const F_C = '0x83439bfabac4fc66627576979a28e75846383b3b43c9a68873b9d201df59ed9c';
const N_AB = '0x1a71442b0dd2ac6f3cf01a162e72b33bfda51e8b77fe45ab2d9dcdb5140d662e';
const RACINE3 = '0xca6d2df9dd2d20cae3bf6fb2502e4cca739b9545d5e943301d816136ae36c881';

// ══ 1. LA FEUILLE, IDENTIQUE AU CONTRAT ═════════════════════════════════════════════════════════
eq(feuille({ id: ID, jeton: JETON, compte: A, montant: UN }), F_A, 'feuille A identique au contrat');
eq(feuille({ id: ID, jeton: JETON, compte: B, montant: 2n * UN }), F_B, 'feuille B identique au contrat');
eq(feuille({ id: ID, jeton: JETON, compte: C, montant: 3n * UN }), F_C, 'feuille C identique au contrat');
// ⛔ TEMOIN : changer UN SEUL champ doit changer la feuille. Sinon la feuille ne lie rien.
ok(feuille({ id: ID + 1, jeton: JETON, compte: A, montant: UN }) !== F_A, 'la periode entre dans la feuille');
ok(feuille({ id: ID, jeton: A, compte: A, montant: UN }) !== F_A, 'le jeton entre dans la feuille');
ok(feuille({ id: ID, jeton: JETON, compte: B, montant: UN }) !== F_A, 'le compte entre dans la feuille');
ok(feuille({ id: ID, jeton: JETON, compte: A, montant: UN + 1n }) !== F_A, 'le montant entre dans la feuille');

// ══ 2. LE NOEUD INTERNE, PAIRE TRIEE ════════════════════════════════════════════════════════════
eq(noeud(F_A, F_B), N_AB, 'noeud(A,B) identique au contrat');
eq(noeud(F_B, F_A), N_AB, 'et il est COMMUTATIF : c est ce qui permet une preuve sans indiquer de cote');

// ══ 3. LA RACINE, NOMBRE IMPAIR DE FEUILLES ═════════════════════════════════════════════════════
// ⛔ Le dernier noeud REMONTE TEL QUEL. Le dupliquer creerait deux chemins vers la racine, donc une
//    adresse pourrait prouver deux fois — defaut classique et parfaitement silencieux.
{
  const arbre = construireArbre({ id: ID, jeton: JETON, parts: [
    { compte: A, montant: UN }, { compte: B, montant: 2n * UN }, { compte: C, montant: 3n * UN },
  ] });
  eq(arbre.racine, RACINE3, 'racine a 3 feuilles identique au contrat');
  eq(arbre.total, 6n * UN, 'le total est la somme des parts');
  eq(arbre.feuilles.length, 3, 'trois feuilles, aucune dupliquee');

  const preuve = arbre.preuveDe(A);
  eq(preuve.length, 2, 'la preuve de A a deux elements');
  eq(preuve[0], F_B, 'son frere direct');
  eq(preuve[1], F_C, 'puis le noeud impair remonte');
  ok(verifierPreuve({ feuille: F_A, preuve, racine: arbre.racine }), 'et elle se rejoue jusqu a la racine');
  // ⛔ TEMOIN : une preuve tronquee ne doit PAS passer, sinon `verifierPreuve` ne verifie rien.
  ok(!verifierPreuve({ feuille: F_A, preuve: [F_B], racine: arbre.racine }), 'une preuve tronquee est refusee');
  ok(!verifierPreuve({ feuille: F_B, preuve, racine: arbre.racine }), 'la preuve de A ne sert pas a B');
}

// ══ 4. TOUTES LES PREUVES D UN ARBRE SE REJOUENT ════════════════════════════════════════════════
// ⛔ Verifier UNE preuve prouve une preuve. On les verifie TOUTES, sur des tailles paires ET impaires.
for (const taille of [1, 2, 3, 4, 5, 7, 8, 9, 16, 17]) {
  const parts = [];
  for (let i = 1; i <= taille; i++) {
    parts.push({ compte: '0x' + i.toString(16).padStart(40, '0'), montant: BigInt(i) * UN });
  }
  const arbre = construireArbre({ id: ID, jeton: JETON, parts });
  let bonnes = 0;
  for (const p of arbre.parts) {
    const f = feuille({ id: ID, jeton: JETON, compte: p.compte, montant: p.montant });
    if (verifierPreuve({ feuille: f, preuve: arbre.preuveDe(p.compte), racine: arbre.racine })) bonnes++;
  }
  eq(bonnes, taille, 'les ' + taille + ' preuves se rejouent toutes');
}

// ══ 5. DETERMINISTE : l ordre d entree ne change pas la racine ═══════════════════════════════════
// ⛔ Sinon deux constructions des memes donnees donneraient deux racines, et personne ne pourrait
//    nous verifier — le tri par adresse existe pour ca.
{
  const p1 = [{ compte: C, montant: 3n * UN }, { compte: A, montant: UN }, { compte: B, montant: 2n * UN }];
  const p2 = [{ compte: A, montant: UN }, { compte: B, montant: 2n * UN }, { compte: C, montant: 3n * UN }];
  eq(construireArbre({ id: ID, jeton: JETON, parts: p1 }).racine,
    construireArbre({ id: ID, jeton: JETON, parts: p2 }).racine, 'meme racine quel que soit l ordre d entree');
}

// ══ 6. CE QUI DOIT ETRE REFUSE, ET NON CORRIGE EN SILENCE ═══════════════════════════════════════
// ⛔ Fusionner un doublon changerait le montant que la personne a lu ailleurs, sans explication.
assert.throws(() => construireArbre({ id: ID, jeton: JETON, parts: [
  { compte: A, montant: UN }, { compte: A, montant: 2n * UN }] }), /double/, 'un compte en double est refuse');
n++;
assert.throws(() => construireArbre({ id: ID, jeton: JETON, parts: [] }), /aucune part/, 'un arbre vide est refuse');
n++;
assert.throws(() => feuille({ id: ID, jeton: 'pas-un-jeton', compte: A, montant: UN }), /jeton invalide/,
  'un jeton invalide est refuse plutot que hache tel quel');
n++;
{
  /* les entrees sales sont ignorees, jamais comptees a moitie */
  const arbre = construireArbre({ id: ID, jeton: JETON, parts: [
    { compte: A, montant: UN }, { compte: 'pas-une-adresse', montant: UN },
    { compte: B, montant: 0n }, { compte: C, montant: -1n }] });
  eq(arbre.feuilles.length, 1, 'seule la part valide entre dans l arbre');
  eq(arbre.total, UN, 'et le total ne compte qu elle');
}

console.log('test-merkle-pot : ' + n + ' assertions, OK');
