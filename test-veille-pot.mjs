// test-veille-pot.mjs — le veilleur doit crier sur l EXPLOIT de l audit, et se taire sinon.
//
// ⛔ LE DEFAUT QU IL SURVEILLE (audit du 2026-09-20, confirme par un sceptique qui a echoue a le
//    refuter et l a reproduit sous forge) : `TBlockPot.ancrer` n arme `ancreeLe` que sous
//    `if (p.ancreeLe == 0)`. Le delai de contestation est donc porte par la PERIODE, alors que la
//    racine et le pot sont par JETON. Tout jeton ancre plus de 6 h apres le PREMIER ancrage de sa
//    periode est reclamable DANS LE MEME BLOC que sa racine.
// ⛔ LE CONTRAT N EST PAS MODIFIABLE : ce veilleur ne peut rien empecher, il peut rendre VISIBLE.
//    Un veilleur qui se tait a tort est pire que pas de veilleur — il endort.
import assert from 'node:assert/strict';
import { analyserAncrages, decoderAncree, veiller, TOPICS, DELAI_CONTESTATION } from './veille-pot.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const JETON_A = '0x' + 'a1'.repeat(20);
const JETON_B = '0x' + 'b2'.repeat(20);
const T0 = 1_800_000_000;

// ══ 1. UNE PERIODE, UN SEUL JETON : rien a signaler ═════════════════════════════════════════════
{
  const r = analyserAncrages([
    { id: 0, jeton: JETON_A, total: 100n, horodatage: T0 },
    { id: 1, jeton: JETON_A, total: 100n, horodatage: T0 + 86400 },
  ]);
  eq(r.alertes.length, 0, 'un jeton par periode : aucune alerte');
  eq(r.periodesAncrees, 2, 'deux periodes ancrees');
}

// ══ 2. ⛔ L EXPLOIT : un second jeton ancre APRES le delai -> AUCUNE fenetre ════════════════════
{
  const r = analyserAncrages([
    { id: 0, jeton: JETON_A, total: 0n, horodatage: T0, tx: '0xaaa' },
    { id: 0, jeton: JETON_B, total: 100n, horodatage: T0 + DELAI_CONTESTATION + 1, tx: '0xbbb' },
  ]);
  eq(r.alertes.length, 1, 'le second ancrage est signale');
  eq(r.alertes[0].gravite, 'CRITIQUE', 'et il est CRITIQUE : la fenetre est a zero');
  eq(r.alertes[0].periode, 0, 'la periode est nommee');
  eq(r.alertes[0].jeton, JETON_B, 'le jeton aussi');
  eq(r.alertes[0].contestationRestanteSecondes, 0, 'il ne reste AUCUNE seconde de contestation');
  eq(r.alertes[0].tx, '0xbbb', 'et la transaction est rendue, pour aller voir');
  ok(/NO window at all/.test(r.alertes[0].pourquoi), 'la raison le dit sans detour');
}

// ══ 3. UN SECOND JETON ANCRE TOT : fenetre RACCOURCIE, pas nulle ═══════════════════════════════
// ⛔ « plus de delai » et « il en reste 20 minutes » sont deux situations differentes. Un veilleur
//    qui les confond ne sert a rien : il crierait au loup ou laisserait passer.
{
  const r = analyserAncrages([
    { id: 0, jeton: JETON_A, total: 100n, horodatage: T0 },
    { id: 0, jeton: JETON_B, total: 100n, horodatage: T0 + 3600 },
  ]);
  eq(r.alertes.length, 1, 'signale quand meme');
  eq(r.alertes[0].gravite, 'AVERTISSEMENT', 'mais ce n est pas critique : il reste de la fenetre');
  eq(r.alertes[0].contestationRestanteSecondes, DELAI_CONTESTATION - 3600, 'et le reste est CHIFFRE');
}

// ══ 4. LE CAS EXACT DE L AUDIT : ancrage BIDON a total 0, puis le vrai 6 h plus tard ════════════
// ⛔ La garde du contrat ne refuse que `total > depose` ; `0 > 0` est faux, donc un jeton jamais
//    alimente s ancre gratuitement et ARME l horloge. C est ce qui rend l exploit gratuit.
{
  const r = analyserAncrages([
    { id: 3, jeton: '0x' + 'de'.repeat(20), total: 0n, horodatage: T0 },
    { id: 3, jeton: JETON_A, total: 10n ** 20n, horodatage: T0 + DELAI_CONTESTATION },
  ]);
  eq(r.alertes.length, 1, 'le scenario de l audit declenche une alerte');
  eq(r.alertes[0].gravite, 'CRITIQUE', 'et elle est critique');
  eq(r.alertes[0].ecartSecondes, DELAI_CONTESTATION, 'l ecart est exactement le delai');
}

// ══ 5. PLUSIEURS PERIODES MELANGEES : chacune compte pour elle ══════════════════════════════════
// ⛔ Compter les ancrages globalement au lieu de par periode ferait crier sur un usage normal.
{
  const r = analyserAncrages([
    { id: 0, jeton: JETON_A, total: 1n, horodatage: T0 },
    { id: 1, jeton: JETON_A, total: 1n, horodatage: T0 + 10 },
    { id: 2, jeton: JETON_A, total: 1n, horodatage: T0 + 20 },
    { id: 1, jeton: JETON_B, total: 1n, horodatage: T0 + 99999 },
  ]);
  eq(r.alertes.length, 1, 'une seule alerte : seule la periode 1 est doublee');
  eq(r.alertes[0].periode, 1, 'et c est bien elle');
}

// ══ 6. LE DECODEUR ═════════════════════════════════════════════════════════════════════════════
{
  const m = (v) => BigInt(v).toString(16).padStart(64, '0');
  const log = { topics: [TOPICS.Ancree, '0x' + m(7), '0x' + '0'.repeat(24) + JETON_A.slice(2)],
    data: '0x' + 'ab'.repeat(32) + m(51570000) + 'cd'.repeat(32) + m(12345),
    blockNumber: '0x64', transactionHash: '0xdead' };
  const a = decoderAncree(log);
  eq(a.id, 7, 'id indexe'); eq(a.jeton, JETON_A, 'jeton indexe');
  eq(a.cible, 51570000, 'cible'); eq(a.total, 12345n, 'total'); eq(a.bloc, 100, 'bloc');
  // ⛔ TEMOIN : un log qui n est pas un Ancree rend null, jamais un objet a moitie rempli.
  eq(decoderAncree({ topics: ['0x' + 'ff'.repeat(32)], data: '0x' }), null, 'autre evenement -> null');
  eq(decoderAncree(null), null, 'log absent -> null');
  eq(decoderAncree({ topics: [TOPICS.Ancree, '0x' + m(1), '0x' + m(2)], data: '0x' }), null,
    'donnees tronquees -> null');
}

// ══ 7. UNE LECTURE RATEE N EST JAMAIS « RIEN A SIGNALER » ══════════════════════════════════════
// ⛔ C EST LA GARDE LA PLUS IMPORTANTE DE CE FICHIER. Un veilleur qui rend « 0 alerte » sur une
//    lecture trouee ENDORT, et c est exactement quand on a besoin de lui qu il se tait.
{
  const rpcCasse = async (m) => {
    if (m === 'eth_blockNumber') return '0x2710'; /* 10000 */
    throw new Error('window refused');
  };
  const r = await veiller({ rpc: rpcCasse, pot: '0x' + '11'.repeat(20), depuis: 9000, pas: 500 });
  eq(r.alertes.length, 0, 'aucune alerte trouvee');
  ok(!r.complet, 'mais le resultat est marque INCOMPLET');
  ok(r.ratees > 0, 'et les lectures ratees sont comptees : ' + r.ratees);
  ok(/FLOOR, not a verdict/.test(r.borne), 'la borne interdit de lire « 0 alerte » comme « tout va bien »');
}

console.log('test-veille-pot : ' + n + ' assertions, OK');
