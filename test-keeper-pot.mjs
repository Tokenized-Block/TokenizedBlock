// test-keeper-pot.mjs — le keeper propose, il ne signe pas. Et il refuse plus souvent qu il n agit.
//
// ⛔ LES DEUX DEFAUTS QUE CE FICHIER GARDE :
//    1. ANCRER SUR UNE RECONSTRUCTION TROUEE. Une racine batie sur des soldes incomplets paierait les
//       mauvaises adresses, et le contrat ne peut PAS s en apercevoir : il ne voit qu un bytes32.
//    2. PREPARER UN `ouvrirPeriode` QUI EXPIRERA AVANT LA SIGNATURE. Le contrat refuse un debut
//       anterieur au bloc courant ; Base avance toutes les 2 s ; un debut trop proche revert APRES
//       que l humain ait paye le gas. D ou la marge et la date limite rendue.
import assert from 'node:assert/strict';
import { prochaineAction, calldataOuvrir, calldataAncrer, SELECTEURS, MARGE_SIGNATURE } from './keeper-pot.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const JETON = '0xb2000000000000000000006d6f9102e9e4b221e0';
const GRAINE = '0xabf6a4d51183d44f4fbd1444053932b1145de01d34fb9f8a1db7563f03813043';
const RACINE = '0xca6d2df9dd2d20cae3bf6fb2502e4cca739b9545d5e943301d816136ae36c881';
const BLOC = 51_570_000;
const bonSnapshot = { complet: true, racine: RACINE, graine: GRAINE, total: 100n, depose: 100n, jeton: JETON };

// ══ 1. RIEN EN COURS : on ouvre, avec une MARGE et une DATE LIMITE ═══════════════════════════════
{
  const r = prochaineAction({ periodes: [], blocCourant: BLOC });
  eq(r.action, 'OUVRIR', 'aucune periode : on en ouvre une');
  ok(r.debut > BLOC, 'le debut est dans le FUTUR — le contrat refuse le contraire');
  eq(r.debut, BLOC + MARGE_SIGNATURE, 'et il laisse la marge de signature');
  eq(r.valideJusqua, r.debut, 'la date limite EST le debut : apres, la tx reverterait');
  ok(r.calldata.startsWith(SELECTEURS.ouvrirPeriode), 'le calldata porte le bon selecteur');
  eq(r.calldata.length, 10 + 128, 'selecteur + deux mots de 32 octets');
  // ⛔ TEMOIN : sans marge, le debut serait le bloc courant lui-meme — donc du passe des la tx suivante.
  const sansMarge = prochaineAction({ periodes: [], blocCourant: BLOC, config: { marge: 0 } });
  eq(sansMarge.debut, BLOC, 'marge 0 : le debut est le bloc courant');
  ok(sansMarge.valideJusqua === BLOC, 'et la date limite est immediate — le keeper le DIT');
}

// ══ 2. UNE PERIODE EN COURS : on attend, et on dit combien ══════════════════════════════════════
{
  const r = prochaineAction({ periodes: [{ id: 0, debut: BLOC - 10, fin: BLOC + 500, ancreeLe: 0 }], blocCourant: BLOC });
  eq(r.action, 'ATTENDRE', 'une periode court encore');
  eq(r.periode, 0, 'et elle est nommee');
  eq(r.blocsRestants, 500, 'avec le nombre de blocs restants');
}

// ══ 3. ⛔ L ORDRE DES BRANCHES : une periode FINIE ET NON ANCREE passe AVANT une ouverture ═══════
// ⛔ Si on ouvrait d abord, la periode finie resterait non ancree et ses fonds seraient bloques.
//    La famine par ordre de branches a deja coute une journee sur le scan de blocks.
{
  const finie = { id: 0, debut: BLOC - 1000, fin: BLOC - 1, ancreeLe: 0 };
  const r = prochaineAction({ periodes: [finie], blocCourant: BLOC, snapshot: bonSnapshot });
  eq(r.action, 'ANCRER', 'la periode finie est ancree, pas ignoree au profit d une nouvelle');
  eq(r.periode, 0, 'et c est la bonne');
  ok(r.calldata.startsWith(SELECTEURS.ancrer), 'avec le selecteur ancrer');
  eq(r.calldata.length, 10 + 64 * 5, 'selecteur + cinq mots');
  eq(r.valideJusqua, null, 'ancrer n expire pas : « periode finie » reste vrai pour toujours');
}

// ══ 4. LES REFUS — chacun avec SA raison, jamais un silence ═════════════════════════════════════
{
  const finie = [{ id: 3, debut: BLOC - 1000, fin: BLOC - 1, ancreeLe: 0 }];

  const sansSnap = prochaineAction({ periodes: finie, blocCourant: BLOC });
  eq(sansSnap.action, 'REFUS', 'pas de snapshot : on refuse');
  ok(/aucun snapshot/.test(sansSnap.pourquoi), 'et on dit lequel : ' + sansSnap.pourquoi);

  // ⛔ LE REFUS QUI COMPTE LE PLUS.
  const troue = prochaineAction({ periodes: finie, blocCourant: BLOC,
    snapshot: { ...bonSnapshot, complet: false, pourquoi: '2 window(s) refused by the node' } });
  eq(troue.action, 'REFUS', 'reconstruction trouee : on N ANCRE PAS');
  ok(/2 window/.test(troue.pourquoi), 'et la raison du serveur est transmise telle quelle');

  const tropPromis = prochaineAction({ periodes: finie, blocCourant: BLOC,
    snapshot: { ...bonSnapshot, total: 101n, depose: 100n } });
  eq(tropPromis.action, 'REFUS', 'l arbre promet plus que le pot : on refuse ICI');
  ok(/101/.test(tropPromis.pourquoi) && /100/.test(tropPromis.pourquoi), 'avec les deux montants');

  const vide = prochaineAction({ periodes: finie, blocCourant: BLOC, snapshot: { ...bonSnapshot, total: 0n } });
  eq(vide.action, 'REFUS', 'un total nul ne paierait personne, et l ancrage est definitif');

  const sansGraine = prochaineAction({ periodes: finie, blocCourant: BLOC,
    snapshot: { ...bonSnapshot, graine: '0x' + '0'.repeat(64) } });
  eq(sansGraine.action, 'REFUS', 'graine nulle : le contrat refuserait aussi');

  const sansRacine = prochaineAction({ periodes: finie, blocCourant: BLOC, snapshot: { ...bonSnapshot, racine: '0xabc' } });
  eq(sansRacine.action, 'REFUS', 'racine mal formee : refus avant de faire payer du gas');

  const sansBloc = prochaineAction({ periodes: [], blocCourant: null });
  eq(sansBloc.action, 'REFUS', 'sans tete de chaine on ne devine pas');
}

// ══ 5. LES ENCODEURS REFUSENT LES ENTREES SALES, ILS NE LES HACHENT PAS ═════════════════════════
assert.throws(() => calldataOuvrir({ debut: 10, fin: 9 }), /periode invalide/, 'fin < debut refuse');
n++;
assert.throws(() => calldataAncrer({ id: 0, jeton: 'x', graine: GRAINE, racine: RACINE, total: 1n }),
  /jeton invalide/, 'jeton invalide refuse');
n++;
assert.throws(() => calldataAncrer({ id: 0, jeton: JETON, graine: '0x1', racine: RACINE, total: 1n }),
  /graine invalide/, 'graine mal formee refusee');
n++;

// ══ 6. LE CALLDATA EST EXACT, PAS SEULEMENT PLAUSIBLE ══════════════════════════════════════════
// ⛔ Verifier la longueur ne prouve rien sur le CONTENU : on relit les mots un par un.
{
  const c = calldataOuvrir({ debut: 51570300, fin: 51613500 });
  eq(c.slice(0, 10), SELECTEURS.ouvrirPeriode, 'selecteur');
  eq(BigInt('0x' + c.slice(10, 74)), 51570300n, 'premier mot = debut');
  eq(BigInt('0x' + c.slice(74, 138)), 51613500n, 'second mot = fin');

  const a = calldataAncrer({ id: 7, jeton: JETON, graine: GRAINE, racine: RACINE, total: 12345n });
  eq(a.slice(0, 10), SELECTEURS.ancrer, 'selecteur ancrer');
  eq(BigInt('0x' + a.slice(10, 74)), 7n, 'mot 1 = id');
  eq('0x' + a.slice(74, 138).slice(24), JETON, 'mot 2 = jeton, aligne a droite');
  eq(a.slice(74, 98), '0'.repeat(24), 'et les 12 octets de gauche sont bien a zero');
  eq('0x' + a.slice(138, 202), GRAINE, 'mot 3 = graine');
  eq('0x' + a.slice(202, 266), RACINE, 'mot 4 = racine');
  eq(BigInt('0x' + a.slice(266, 330)), 12345n, 'mot 5 = total');
}

console.log('test-keeper-pot : ' + n + ' assertions, OK');
