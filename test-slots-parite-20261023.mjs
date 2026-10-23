/* test-slots-parite-20261023.mjs — LES TROIS FACES QUE BlockSlots CALCULE ON-CHAIN = CELLES QUE L APP AFFICHE.
 * AFFIRME : (1) les epingles de contracts/test/BlockSlots.t.sol test_PariteTroisFaces (verifiees par forge contre le contrat COMPILE) sont
 *   recalculees ici avec les modules de l app (slots-plan.js facesDuSpin : keccak.js + traitsDepuisHash) et sont egales trait par trait,
 *   points compris ; (2) les graines « slotsN » de _paiePourGraine (forge : spin #1 -> N points) donnent les MEMES points ici ;
 *   (3) les tailles de listes du contrat = celles de l app ; (4) deux spins du meme bloc n ont pas les memes faces ; (5) temoins : une
 *   graine sans l id, ou deux faces sur la meme graine, ne retrouvent PAS les epingles. NE PROUVE PAS Base. */
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

/* (3) */
const taille = (nom) => Number((new RegExp('uint8 public constant ' + nom + ' = (\\d+);').exec(src) || [])[1]);
vu(taille('BANDS') === BANDES.length && taille('ORBITS') === ORBITES.length && taille('FACETS') === FACETTES.length && taille('MATERIALS') === MATIERES.length && taille('ORNAMENTS') === ORNEMENTS.length,
  'tailles des listes : contrat = app (6/10/19/9/8)');
vu(taille('REELS') === S.REELS && taille('MAX_POINTS') === S.MAX_POINTS && /SETTLE_WINDOW = 256;/.test(src) && /TARGET_DELAY = 2;/.test(src) && S.FENETRE === 256 && S.DELAI_CIBLE === 2, '3 faces, 15 points max, fenetre 256, cible + 2 : contrat = module');

/* (1) */
const pins = [...t.matchAll(/_pariteSpin\((0x[0-9a-f]{64}),\s*(\d+),\s*\[uint8\(([\d]+)\),\s*([\d,\s]+)\],\s*(\d+)\)/g)]
  .map((m) => ({ h: m[1], id: Number(m[2]), v: [Number(m[3]), ...m[4].split(',').map((x) => Number(x.trim()))], p: Number(m[5]) }));
vu(pins.length >= 5 && pins.every((x) => x.v.length === 15), 'au moins 5 epingles de 15 traits (' + pins.length + ')');
for (const { h, id, v, p } of pins) {
  const f = S.facesDuSpin(h, id);
  vu(f && JSON.stringify(f.flat()) === JSON.stringify(v) && S.points(f) === p, 'parite ' + h.slice(0, 10) + '… #' + id + ' : app ' + JSON.stringify(f) + ' = contrat, ' + p + ' point(s)');
}
/* (2) */
const graines = [...t.matchAll(/_paiePourGraine\("(slots\d+)", (\d+),/g)].map((m) => ({ g: m[1], p: Number(m[2]) }));
vu(graines.length >= 9, 'au moins 9 graines de paiement (' + graines.length + ')');
for (const { g, p } of graines) {
  const h = keccak256Hex(new TextEncoder().encode(g));
  vu(S.points(S.facesDuSpin(h, 1)) === p, g + ' (spin #1) : ' + p + ' point(s) ici comme dans forge');
}
vu(new Set(graines.map((x) => x.p)).size >= 9 && graines.some((x) => x.p === 9), 'les graines couvrent au moins 9 points distincts, jusqu a 9');
/* (4) */
const h0 = pins[0].h;
vu(JSON.stringify(S.facesDuSpin(h0, 1)) !== JSON.stringify(S.facesDuSpin(h0, 2)), 'deux spins du meme bloc : faces differentes (l id entre dans la graine)');
const acc = S.accordsParTrait([[1, 2, 3, 4, 5], [1, 2, 3, 4, 6], [1, 9, 0, 0, 6]]);
vu(JSON.stringify(acc) === JSON.stringify(['three', 'pair', 'pair', 'pair', 'pair']) && S.points([[1, 2, 3, 4, 5], [1, 2, 3, 4, 6], [1, 9, 0, 0, 6]]) === 7, 'accords par trait : brelan 3, paires 1 (dont faces 0/2 et 1/2) = 7');
vu(S.points([[1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5]]) === 15 && S.points([[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2]]) === 0, '15 et 0 points');
vu(S.facesDuSpin('0x12', 1) === null, 'hash illisible : null');
/* (5) temoins */
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const sansId = [0, 1, 2].map((r) => traitsDepuisHash(keccak256Hex(Uint8Array.from(Buffer.from(h0.slice(2) + w(r), 'hex')))));
vu(JSON.stringify(sansId.flat()) !== JSON.stringify(pins[0].v), 'temoin : une graine sans l id ne retrouve PAS l epingle');
const f0 = S.facesDuSpin(h0, pins[0].id);
vu(JSON.stringify([f0[0], f0[1], f0[1]].flat()) !== JSON.stringify(pins[0].v), 'temoin : deux faces sur la meme graine ne retrouvent PAS l epingle');
console.log('ok slots-parite - ' + n + ' assertions ; NE PROUVE PAS Base');
