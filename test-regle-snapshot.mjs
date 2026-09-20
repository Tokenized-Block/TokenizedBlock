// test-regle-snapshot.mjs — le tirage du bloc photographie, garde par ce qui le rendrait truquable.
//
// ⛔ LA PROPRIETE CENTRALE, ET CELLE QUI EST LE PLUS FACILE A CASSER SANS S EN APERCEVOIR :
//    LE BLOC TIRE EST DEJA PASSE QUAND LE TIRAGE EST CONNU. Un tirage qui designerait un bloc FUTUR
//    laisserait une fenetre pour acheter entre la revelation et la photo — la recompense paierait
//    alors exactement le flash-buy qu elle doit decourager. Le test 2 existe pour ca.
import assert from 'node:assert/strict';
import { blocDeSnapshot, verifierTirage, grainesDistinctes } from './regle-snapshot.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const g = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
/* une vraie graine lue sur Base le 2026-09-20 (mixHash du bloc 51570376) */
const REELLE = '0x8b5288e0e137ff4fbc4e38d6f72331eeaf6a89097830eb4ad1711b0c0a141f99';

// ══ 1. DETERMINISTE : memes entrees, meme sortie, toujours ═══════════════════════════════════════
{
  const a = blocDeSnapshot({ debut: 1000, fin: 2000, graine: REELLE });
  const b = blocDeSnapshot({ debut: 1000, fin: 2000, graine: REELLE });
  eq(a.etat, 'TIRE', 'une graine valide tire');
  eq(a.cible, b.cible, 'rejoue a l identique — sinon personne ne pourrait nous verifier');
  eq(a.taille, 1001, 'la periode compte ses deux bornes');
}

// ══ 2. ⛔ LE BLOC TIRE EST DANS LA PERIODE, DONC DEJA MINE ═══════════════════════════════════════
// Sur 500 graines differentes, la cible ne doit JAMAIS sortir de [debut, fin].
{
  let dehors = 0, distinctes = new Set();
  for (let i = 1; i <= 500; i++) {
    const r = blocDeSnapshot({ debut: 51500000, fin: 51500100, graine: g(BigInt(i) * 7919n) });
    if (r.cible < 51500000 || r.cible > 51500100) dehors++;
    distinctes.add(r.cible);
  }
  eq(dehors, 0, 'aucune cible hors de la periode sur 500 tirages');
  // ⛔ ET LE TIRAGE N EST PAS DEGENERE : une fonction qui rendrait toujours `debut` passerait le test
  //    ci-dessus sans rien tirer du tout. C est le temoin qui donne sa valeur au precedent.
  ok(distinctes.size > 80, 'le tirage balaie vraiment la periode (' + distinctes.size + ' cibles distinctes sur 101 possibles)');
}

// ══ 3. UNE GRAINE ABSENTE ANNULE LA PERIODE, ELLE NE SE REMPLACE PAS ════════════════════════════
// ⛔ Retomber en silence sur autre chose rendrait le tirage truquable sans que personne ne le voie.
for (const mauvaise of [undefined, null, '', '0x', '0xabc', 123, '0x' + '0'.repeat(64)]) {
  const r = blocDeSnapshot({ debut: 10, fin: 20, graine: mauvaise });
  eq(r.etat, 'GRAINE_ABSENTE', 'graine invalide (' + String(mauvaise).slice(0, 12) + ') -> periode annulee');
  eq(r.cible, null, 'et AUCUNE cible inventee');
}

// ══ 4. PERIODES ABSURDES : refusees et nommees ══════════════════════════════════════════════════
for (const [d, f] of [[100, 99], [-1, 10], [1.5, 10], [10, 10.5]]) {
  const r = blocDeSnapshot({ debut: d, fin: f, graine: REELLE });
  eq(r.etat, 'PERIODE_INVALIDE', 'periode ' + d + ' -> ' + f + ' refusee');
}
// une periode d UN SEUL bloc est valide, et tire ce bloc-la
{
  const r = blocDeSnapshot({ debut: 777, fin: 777, graine: REELLE });
  eq(r.etat, 'TIRE', 'une periode d un bloc est valide');
  eq(r.cible, 777, 'et elle tire forcement ce bloc');
}

// ══ 5. LA VERIFICATION PAR UN TIERS : elle doit pouvoir nous CONTREDIRE ══════════════════════════
{
  const vrai = blocDeSnapshot({ debut: 1000, fin: 2000, graine: REELLE });
  const bon = verifierTirage({ debut: 1000, fin: 2000, graine: REELLE, ciblePretendue: vrai.cible });
  ok(bon.concorde, 'un tirage honnete est confirme');
  // ⛔ LE TEMOIN QUI COMPTE : une cible bidon doit etre REFUSEE, sinon la verification ne verifie rien.
  const faux = verifierTirage({ debut: 1000, fin: 2000, graine: REELLE, ciblePretendue: vrai.cible + 1 });
  ok(!faux.concorde, 'une cible annoncee a tort est refusee');
  const sansGraine = verifierTirage({ debut: 1000, fin: 2000, graine: '0x', ciblePretendue: 1500 });
  ok(!sansGraine.concorde, 'sans graine, rien n est confirme');
  eq(sansGraine.etat, 'GRAINE_ABSENTE', 'et la raison est dite');
}

// ══ 6. DEUX PERIODES NE DOIVENT PAS PARTAGER LEUR GRAINE ════════════════════════════════════════
// ⛔ MESURE (2026-09-20, Base) : mixHash ne change qu environ tous les 6 blocs — les blocs 51570374
//    et 51570375 portent le MEME. Deux periodes finissant dans le meme slot L1 auraient donc le meme
//    tirage relatif : rejouable, donc previsible.
{
  const partage = grainesDistinctes([{ fin: 51570374, graine: REELLE }, { fin: 51570375, graine: REELLE }]);
  ok(!partage.ok, 'deux periodes a la meme graine sont signalees');
  eq(partage.doublons.length, 1, 'et le doublon est nomme');
  eq(partage.doublons[0].fins.length, 2, 'avec les deux fins concernees');
  const propre = grainesDistinctes([{ fin: 1, graine: g(1) }, { fin: 2, graine: g(2) }]);
  ok(propre.ok, 'des graines differentes passent');
}

// ══ 7. LA GRAINE REELLE DE BASE DONNE UNE CIBLE PLAUSIBLE ═══════════════════════════════════════
{
  const r = blocDeSnapshot({ debut: 51569376, fin: 51570376, graine: REELLE });
  eq(r.etat, 'TIRE', 'la vraie graine du 2026-09-20 tire');
  ok(r.cible >= 51569376 && r.cible <= 51570376, 'et la cible tombe dans la periode : ' + r.cible);
}

console.log('test-regle-snapshot : ' + n + ' assertions, OK');
