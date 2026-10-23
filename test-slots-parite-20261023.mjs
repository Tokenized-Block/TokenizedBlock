/* test-slots-parite-20261023.mjs — LES TROIS FACES QUE BlockSlots CALCULE ON-CHAIN = CELLES QUE L APP AFFICHE.
 * v2 (Phil 2026-10-23) : la face r vient du hash du bloc cible + r. Dans forge, les trois hashes d une graine g sont
 *   _trois(g) = [keccak256(abi.encodePacked(g, uint8(r)))] ; ce test les recalcule a l identique.
 * AFFIRME : (1) les epingles de contracts/test/BlockSlots.t.sol test_PariteTroisFaces (verifiees par forge contre le contrat COMPILE) sont
 *   recalculees ici avec les modules de l app (slots-plan.js facesDuSpin : keccak.js + traitsDepuisHash) et sont egales trait par trait,
 *   points compris ; l ancre (_trois("pin-a")[1]) est le meme hash des deux cotes ; (2) les graines « v2slotsN » de _paiePourGraine
 *   (forge : spin #1 -> N points) donnent les MEMES points ici ; (3) les tailles de listes du contrat = celles de l app ; (4) deux spins
 *   des memes blocs n ont pas les memes faces ; (5) temoins : la derivation v1 (un seul hash pour les trois faces), une graine sans l id,
 *   ou deux faces sur la meme graine, ne retrouvent PAS les epingles. NE PROUVE PAS Base. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as S from './slots-plan.js';
import { keccak256Hex } from './keccak.js';
import { traitsDepuisHash } from './blockrolls-plan.js';
import { BANDES } from './face-du-jour.js';
import { ORBITES, FACETTES, MATIERES, ORNEMENTS } from './apparence.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const t = readFileSync(new URL('./contracts/test/BlockSlots.t.sol', import.meta.url), 'utf8');
const src = readFileSync(new URL('./contracts/src/BlockSlots.sol', import.meta.url), 'utf8');
const trois = (g) => [0, 1, 2].map((r) => keccak256Hex(Uint8Array.from([...new TextEncoder().encode(g), r])));

/* (3) */
const taille = (nom) => Number((new RegExp('uint8 public constant ' + nom + ' = (\\d+);').exec(src) || [])[1]);
vu(taille('BANDS') === BANDES.length && taille('ORBITS') === ORBITES.length && taille('FACETS') === FACETTES.length && taille('MATERIALS') === MATIERES.length && taille('ORNAMENTS') === ORNEMENTS.length,
  'tailles des listes : contrat = app (6/10/19/9/8)');
vu(taille('REELS') === S.REELS && taille('MAX_POINTS') === S.MAX_POINTS && /SETTLE_WINDOW = 256;/.test(src) && /TARGET_DELAY = 2;/.test(src) && S.FENETRE === 256 && S.DELAI_CIBLE === 2, '3 faces, 15 points max, fenetre 256, cible + 2 : contrat = module');
vu(/uint64 public constant MAX_PRIZE = 5_000000;/.test(src) && S.PRIX_MAX === 5000000n, 'plafond par spin : 5 USDC des deux cotes');

/* (1) */
const ancre = (/assertEq\(_trois\("pin-a"\)\[1\], (0x[0-9a-f]{64})\);/.exec(t) || [])[1];
vu(ancre && trois('pin-a')[1] === ancre, 'ancre : _trois("pin-a")[1] forge = node (' + String(ancre).slice(0, 10) + '…)');
const pins = [...t.matchAll(/_pariteSpin\("([^"]+)", (\d+), \[uint8\((\d+)\),\s*([\d,\s]+)\],\s*(\d+)\)/g)]
  .map((m) => ({ g: m[1], id: Number(m[2]), v: [Number(m[3]), ...m[4].split(',').map((x) => Number(x.trim()))], p: Number(m[5]) }));
vu(pins.length >= 5 && pins.every((x) => x.v.length === 15), 'au moins 5 epingles de 15 traits (' + pins.length + ')');
for (const { g, id, v, p } of pins) {
  const f = S.facesDuSpin(trois(g), id);
  vu(f && JSON.stringify(f.flat()) === JSON.stringify(v) && S.points(f) === p, 'parite ' + g + ' #' + id + ' : app ' + JSON.stringify(f) + ' = contrat, ' + p + ' point(s)');
}
/* (2) */
const graines = [...t.matchAll(/_paiePourGraine\("(v2slots\d+)", (\d+),/g)].map((m) => ({ g: m[1], p: Number(m[2]) }));
vu(graines.length >= 11, 'au moins 11 graines de paiement (' + graines.length + ')');
for (const { g, p } of graines) vu(S.points(S.facesDuSpin(trois(g), 1)) === p, g + ' (spin #1) : ' + p + ' point(s) ici comme dans forge');
vu(new Set(graines.map((x) => x.p)).size >= 11 && graines.some((x) => x.p === 10), 'les graines couvrent 0..10 points');
/* les graines des tests V2 (ecrits rouges sur l ancien contrat) : leurs points v2 different des points v1 */
for (const [g, p] of [['v2slots6', 7], ['v2slots24', 5], ['v2slots3465', 9]]) {
  const hs = trois(g), v1 = S.points(S.facesDuSpin([hs[0], hs[0], hs[0]], 1));
  vu(S.points(S.facesDuSpin(hs, 1)) === p && v1 !== p, g + ' : ' + p + ' points en v2, ' + v1 + ' sur le seul hash de la cible (v1) -- le test forge rougissait bien sur l ancien');
}
/* (4) */
const h0 = trois(pins[0].g);
vu(JSON.stringify(S.facesDuSpin(h0, 1)) !== JSON.stringify(S.facesDuSpin(h0, 2)), 'deux spins des memes blocs : faces differentes (l id entre dans la graine)');
const acc = S.accordsParTrait([[1, 2, 3, 4, 5], [1, 2, 3, 4, 6], [1, 9, 0, 0, 6]]);
vu(JSON.stringify(acc) === JSON.stringify(['three', 'pair', 'pair', 'pair', 'pair']) && S.points([[1, 2, 3, 4, 5], [1, 2, 3, 4, 6], [1, 9, 0, 0, 6]]) === 7, 'accords par trait : brelan 3, paires 1 (dont faces 0/2 et 1/2) = 7');
vu(S.points([[1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]) === 15 && S.points([[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2]]) === 0, '15 et 0 points');
vu(S.facesDuSpin(['0x12', h0[1], h0[2]], 1) === null, 'hash illisible : null');
/* (5) temoins */
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const id0 = pins[0].id;
vu(JSON.stringify(S.facesDuSpin([h0[0], h0[0], h0[0]], id0).flat()) !== JSON.stringify(pins[0].v), 'temoin : la derivation v1 (un seul hash) ne retrouve PAS l epingle');
const sansId = h0.map((h, r) => traitsDepuisHash(keccak256Hex(Uint8Array.from(Buffer.from(h.slice(2) + w(r), 'hex')))));
vu(JSON.stringify(sansId.flat()) !== JSON.stringify(pins[0].v), 'temoin : une graine sans l id ne retrouve PAS l epingle');
const f0 = S.facesDuSpin(h0, id0);
vu(JSON.stringify([f0[0], f0[1], f0[1]].flat()) !== JSON.stringify(pins[0].v), 'temoin : deux faces sur la meme graine ne retrouvent PAS l epingle');
console.log('ok slots-parite - ' + n + ' assertions ; NE PROUVE PAS Base');
