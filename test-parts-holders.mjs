// test-parts-holders.mjs — la repartition aux detenteurs, gardee par ses cas qui font mal.
//
// ⛔ LE DEFAUT QUE CE FICHIER EMPECHE DE REVENIR : une repartition au prorata BRUT. Mesure du
//    2026-09-20 sur deux blocks independants (reconstruction verifiee au wei pres contre balanceOf,
//    3/3 puis 7/7) : le PoolManager d Uniswap detient 99,89 % de la supply des DEUX. Au prorata brut,
//    99,89 % de la recompense partirait dans une pool dont la position appartient a l adresse morte.
//    L argent serait brule, sans aucune erreur.
import assert from 'node:assert/strict';
import { partsHolders, EXCLUS } from './parts-holders.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const POOL = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const MORT = '0x000000000000000000000000000000000000dead';
const A = '0x' + 'a1'.repeat(20);
const B = '0x' + 'b2'.repeat(20);
const C = '0x' + 'c3'.repeat(20);

// ══ 1. LE CAS REEL : la pool est exclue, les vrais portefeuilles se partagent tout ════════════════
{
  const soldes = [[POOL, 999_000_000n], [A, 600_000n], [B, 400_000n]];
  const r = partsHolders({ soldes, pot: 1_000_000n });
  eq(r.etat, 'PAYABLE', 'il y a bien de vrais detenteurs');
  eq(r.parts.length, 2, 'la pool ne compte pas comme detenteur');
  eq(r.parts[0].adr, A, 'le plus gros detenteur reel en tete');
  eq(r.parts[0].montant, 600_000n, 'A touche 60 % du pot, pas 0,06 %');
  eq(r.parts[1].montant, 400_000n, 'B touche 40 %');
  // ⛔ TEMOIN : au prorata BRUT, A aurait touche 599 wei sur un million. C est le defaut garde ici.
  const brut = (1_000_000n * 600_000n) / 1_000_000_000n;
  ok(brut < 1000n, 'au prorata brut A n aurait touche que ' + brut + ' wei — le defaut evite');
  eq(r.baseExclue, 999_000_000n, 'et ce qui dort dans la pool est RENDU, pas avale');
  eq(r.exclus[0].pourquoi, EXCLUS[POOL], 'avec la raison nommee');
}

// ══ 2. AUCUN WEI PERDU NI INVENTE, meme avec des divisions qui ne tombent pas juste ══════════════
for (const pot of [1n, 2n, 7n, 999n, 1_000_001n, 12_345_678_901n]) {
  const r = partsHolders({ soldes: [[A, 333n], [B, 333n], [C, 334n]], pot });
  const total = r.parts.reduce((s, p) => s + p.montant, 0n);
  eq(total, pot, 'somme des parts === pot, pour un pot de ' + pot);
  ok(r.parts.every((p) => p.montant >= 0n), 'aucune part negative');
}

// ══ 3. TROIS ETATS, JAMAIS UN TABLEAU VIDE AMBIGU ════════════════════════════════════════════════
// ⛔ « personne a payer » et « rien a payer » sont deux choses differentes. Les confondre ferait
//    croire qu un pot a ete distribue alors qu il n a jamais eu de destinataire.
{
  const sansPersonne = partsHolders({ soldes: [[POOL, 1000n], [MORT, 500n]], pot: 100n });
  eq(sansPersonne.etat, 'AUCUN_DETENTEUR', 'que la pool et l adresse morte : personne a payer');
  eq(sansPersonne.parts.length, 0, 'et rien n est distribue');
  eq(sansPersonne.baseExclue, 1500n, 'mais le montant exclu est dit');

  const potVide = partsHolders({ soldes: [[A, 10n]], pot: 0n });
  eq(potVide.etat, 'RIEN_A_PARTAGER', 'des detenteurs mais rien dans le pot');
  eq(potVide.parts.length, 0, 'et rien n est invente');
}

// ══ 4. UN SMART WALLET N EST PAS EXCLU ═══════════════════════════════════════════════════════════
// ⛔ Exclure « toute adresse qui a du code » aurait exclu les EIP-7702 / ERC-4337 : une garde VRAIE
//    qui couvre la mauvaise moitie. L exclusion est une liste NOMMEE, pas une heuristique.
{
  const r = partsHolders({ soldes: [[POOL, 1000n], [A, 100n]], pot: 50n });
  eq(r.parts.length, 1, 'une adresse hors liste est payee, qu elle ait du code ou non');
  eq(r.parts[0].adr, A, 'et c est bien elle');
}

// ══ 5. ORDRE DETERMINISTE : deux soldes egaux ne doivent pas changer de place ════════════════════
// ⛔ Un ordre instable deplacerait le reste d arrondi d un bloc a l autre, donc le merkle root,
//    SANS qu aucune donnee n ait change. Un root qui bouge tout seul est indefendable.
{
  const un = partsHolders({ soldes: [[A, 50n], [B, 50n], [C, 50n]], pot: 100n });
  const deux = partsHolders({ soldes: [[C, 50n], [B, 50n], [A, 50n]], pot: 100n });
  eq(un.parts.map((p) => p.adr).join(), deux.parts.map((p) => p.adr).join(),
    'le meme ensemble donne le meme ordre, quel que soit l ordre d entree');
  eq(un.parts[0].montant, deux.parts[0].montant, 'donc le reste d arrondi tombe au meme endroit');
}

// ══ 6. ENTREES SALES : ignorees, jamais comptees a moitie ════════════════════════════════════════
{
  const r = partsHolders({ soldes: [[A, 100n], ['pas-une-adresse', 999n], [B, 0n], [C, -5n], [null, 3n]], pot: 10n });
  eq(r.parts.length, 1, 'seule l adresse valide a solde positif compte');
  eq(r.parts[0].montant, 10n, 'et elle prend tout le pot');
}
assert.throws(() => partsHolders({ soldes: [[A, 1n]], pot: -1n }), /non-negative/, 'un pot negatif est refuse');
n++;

console.log('test-parts-holders : ' + n + ' assertions, OK');
