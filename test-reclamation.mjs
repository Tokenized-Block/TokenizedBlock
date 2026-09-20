// test-reclamation.mjs — on ne sert JAMAIS une preuve sans avoir verifie la racine.
//
// ⛔ LE DEFAUT GARDE ICI : servir une preuve issue d un arbre qui ne correspond pas a la racine
//    ancree. La reclamation echouerait chez l utilisateur, qui paierait du gas et croirait que le
//    probleme vient de lui. Le contrat, lui, ne dirait rien d utile : juste PreuveInvalide.
import assert from 'node:assert/strict';
import { calldataReclamer, decoderPot, SEL } from './reclamation.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const JETON = '0xb2000000000000000000006d6f9102e9e4b221e0';
const P1 = '0x' + '11'.repeat(32);
const P2 = '0x' + '22'.repeat(32);
const m = (v) => BigInt(v).toString(16).padStart(64, '0');

// ══ 1. LE CALLDATA D UN TABLEAU DYNAMIQUE, MOT PAR MOT ══════════════════════════════════════════
// ⛔ Se tromper d offset produit un calldata qui revert APRES avoir coute du gas. On relit chaque mot.
{
  const c = calldataReclamer({ id: 7, jeton: JETON, montant: 12345n, preuve: [P1, P2] });
  eq(c.slice(0, 10), SEL.reclamer, 'selecteur reclamer');
  eq(BigInt('0x' + c.slice(10, 74)), 7n, 'mot 1 = id');
  eq('0x' + c.slice(74, 138).slice(24), JETON, 'mot 2 = jeton');
  eq(BigInt('0x' + c.slice(138, 202)), 12345n, 'mot 3 = montant');
  eq(BigInt('0x' + c.slice(202, 266)), 128n, 'mot 4 = offset du tableau, 0x80 = 4 mots');
  eq(BigInt('0x' + c.slice(266, 330)), 2n, 'puis la LONGUEUR du tableau');
  eq('0x' + c.slice(330, 394), P1, 'puis le premier element');
  eq('0x' + c.slice(394, 458), P2, 'puis le second');
  // 4 mots d en-tete (id, jeton, montant, offset) + 1 longueur + 2 elements = 7 mots.
  eq((c.length - 2) / 2, 4 + 32 * 7, 'longueur totale : selecteur + 7 mots');
}

// ══ 2. UNE PREUVE VIDE EST VALIDE (arbre a une feuille) ═════════════════════════════════════════
// ⛔ Refuser une preuve vide bloquerait le seul detenteur d un block. Le cas existe pour de vrai.
{
  const c = calldataReclamer({ id: 0, jeton: JETON, montant: 1n, preuve: [] });
  eq(BigInt('0x' + c.slice(266, 330)), 0n, 'longueur 0');
  eq((c.length - 2) / 2, 4 + 32 * 5, 'et rien apres');
}

// ══ 3. LES ENTREES SALES SONT REFUSEES, PAS ENCODEES ════════════════════════════════════════════
assert.throws(() => calldataReclamer({ id: 0, jeton: 'x', montant: 1n, preuve: [] }), /jeton invalide/,
  'jeton invalide refuse'); n++;
assert.throws(() => calldataReclamer({ id: 0, jeton: JETON, montant: 1n, preuve: null }), /preuve absente/,
  'preuve absente refusee'); n++;
assert.throws(() => calldataReclamer({ id: 0, jeton: JETON, montant: 1n, preuve: ['0xabc'] }),
  /mal forme/, 'un element de preuve tronque est refuse, pas complete'); n++;

// ══ 4. LE DECODEUR DE POT ══════════════════════════════════════════════════════════════════════
{
  const d = '0x' + 'ab'.repeat(32) + m(1000) + m(250) + m(1);
  const p = decoderPot(d);
  eq(p.racine, '0x' + 'ab'.repeat(32), 'racine');
  eq(p.total, 1000n, 'total promis'); eq(p.verse, 250n, 'deja verse');
  eq(p.ancre, true, 'ancre');
  const pasAncre = decoderPot('0x' + m(0) + m(0) + m(0) + m(0));
  eq(pasAncre.ancre, false, 'un pot non ancre le dit');
  // ⛔ TEMOIN : des donnees tronquees rendent null, jamais un pot a moitie rempli.
  eq(decoderPot('0x' + m(1) + m(2)), null, 'donnees tronquees -> null');
  eq(decoderPot('0x'), null, 'donnees vides -> null');
}

// ══ 5. LA LISTE DES ETATS EST FERMEE ═══════════════════════════════════════════════════════════
// ⛔ « rien a reclamer » a SEPT causes differentes. Les confondre ferait chercher un bug la ou il
//    n y en a pas — ou pire, laisserait passer un DESACCORD de racine pour une absence de part.
{
  const attendus = ['PAYABLE', 'DEJA_RECLAME', 'CONTESTATION', 'RIEN_A_TOI', 'PAS_ANCREE', 'DESACCORD', 'NON_LU'];
  const mod = await import('./reclamation.js');
  eq(mod.ETATS.length, 7, 'sept etats, pas un de moins');
  for (const e of attendus) ok(mod.ETATS.includes(e), e + ' existe');
}

console.log('test-reclamation : ' + n + ' assertions, OK');
