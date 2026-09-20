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

// ══ 6. LE MONTANT MIS SOUS LES YEUX D UN HUMAIN ════════════════════════════════════════════════
// ⛔⛔ UN DECALAGE DE DECIMALES EST LA PIRE ERREUR D AFFICHAGE POSSIBLE ICI : elle ne plante pas,
//    elle ne revert pas, elle fait simplement croire a quelqu un qu il a gagne mille milliards de
//    fois plus — ou mille milliards de fois moins, et il ne reclame jamais.
// ⛔ ET LE BRUT DOIT SURVIVRE A LA CONVERSION : c est lui qui est dans la feuille de merkle, donc
//    le seul avec lequel un detenteur peut nous contredire.
{
  const { montantLisible, decoderChaine } = await import('./reclamation.js');

  /* le cas reel mesure : le jeton OK, 18 decimales, une part de 2 409 jetons */
  const r18 = montantLisible(2409000000000000000000n, { sym: 'OK', dec: 18 });
  ok(/^2,409 OK /.test(r18), 'dix-huit decimales : ' + r18);
  ok(r18.includes('2409000000000000000000 raw'), 'le brut survit : ' + r18);

  /* ⛔ LE TEMOIN QUI DONNE SA VALEUR AU PRECEDENT : le MEME nombre a 6 decimales n est pas le meme
     montant. Sans ce cas, une fonction qui suppose 18 partout passerait le test ci-dessus. */
  const r6 = montantLisible(2409000000000000000000n, { sym: 'USDC', dec: 6 });
  ok(/^2,409,000,000,000,000 USDC /.test(r6), 'six decimales, tout autre chose : ' + r6);
  ok(r18 !== r6, 'les deux lectures du meme nombre brut DIFFERENT');

  /* les decimales illisibles : on garde le brut et on le DIT, on ne suppose pas 18 */
  for (const mauvaise of [null, undefined, {}, { sym: 'X' }, { sym: 'X', dec: -1 },
    { sym: 'X', dec: 99 }, { sym: 'X', dec: 1.5 }]) {
    const r = montantLisible(123n, mauvaise);
    ok(r.startsWith('123 (raw units'), 'unite invalide -> brut : ' + JSON.stringify(mauvaise) + ' -> ' + r);
    ok(!/\d OK|tokens \(/.test(r) || r.includes('raw units'), 'et aucune conversion inventee');
  }

  /* les bords : zero, un wei, et une fraction qui ne tombe pas juste */
  ok(montantLisible(0n, { sym: 'OK', dec: 18 }).startsWith('0 OK'), 'zero se lit zero');
  const petit = montantLisible(1n, { sym: 'OK', dec: 18 });
  ok(petit.startsWith('0.00000000 OK') || petit.startsWith('0 OK'), 'un wei ne devient pas 1 : ' + petit);
  ok(petit.includes('1 raw'), 'et son brut est la : ' + petit);
  const tiers = montantLisible(1500000000000000000n, { sym: 'OK', dec: 18 });
  ok(tiers.startsWith('1.5 OK'), 'une moitie se lit 1.5 : ' + tiers);

  /* decoderChaine : le vrai retour de symbol() sur le B20 OK, lu sur la chaine le 2026-09-21 */
  const SYMBOLE_OK = '0x' + '0'.repeat(62) + '20' + '0'.repeat(62) + '02'
    + '4f4b' + '0'.repeat(60);
  eq(decoderChaine(SYMBOLE_OK), 'OK', 'le symbole du B20 se decode');
  /* ⛔ TEMOIN : ce qui n est pas decodable rend null, jamais du charabia hexadecimal. */
  eq(decoderChaine('0x'), null, 'vide -> null');
  eq(decoderChaine('0x1234'), null, 'tronque -> null');
  eq(decoderChaine(null), null, 'null -> null');
  eq(decoderChaine('0x' + '0'.repeat(62) + '20' + 'f'.repeat(64)), null, 'taille absurde -> null');
}

console.log('test-reclamation : ' + n + ' assertions, OK');
