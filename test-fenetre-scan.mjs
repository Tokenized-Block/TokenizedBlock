// test-fenetre-scan.mjs — la FAMINE mesuree le 2026-09-20 ne doit plus jamais revenir.
//
// ⛔ LE DEFAUT GARDE ICI : la premiere version testait « jusqua < fin » avant la remontee. Base avance
//    toutes les 2 s, donc cette condition est TOUJOURS vraie et la remontee n a jamais demarre.
//    Observe en local : `depuis` fige a 51528250 pendant 300 s, douze tours, sans aucune erreur.
// ⛔ LE TEST QUI COMPTE est celui de la chaine QUI AVANCE : un tour ou `fin` a bouge de quelques blocs
//    doit quand meme remonter. Un test avec `fin` immobile serait passe AVANT le correctif.
import assert from 'node:assert/strict';
import { prochaineFenetre } from './fenetre-scan.js';

let n = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const PLANCHER = 50861088;
const PAS = 40000;

// ══ 1. rien lu encore : un premier morceau colle a la tete ═══════════════════════════════════════
eq(prochaineFenetre({ fin: 51568000, depuis: null, jusqua: null, plancher: PLANCHER, pas: PAS }),
  { deBloc: 51528001, aBloc: 51568000, sens: 'PREMIER' }, 'premier morceau');

// ══ 2. LE TEST DE LA FAMINE : la chaine avance, la remontee doit QUAND MEME passer ═══════════════
// ⛔ C est exactement le cas qui echouait : jusqua < fin (toujours vrai), mais le retard est petit.
for (const retard of [1, 2, 15, 1200, PAS]) {
  const jusqua = 51568000;
  const f = prochaineFenetre({ fin: jusqua + retard, depuis: 51528001, jusqua, plancher: PLANCHER, pas: PAS });
  eq(f.sens, 'ARRIERE', 'retard de ' + retard + ' bloc(s) : la remontee doit passer, pas l avant');
  ok(f.aBloc === 51528000, 'elle repart juste sous la plage couverte');
}

// ══ 3. mais si on a VRAIMENT decroche, l avant reprend la main ════════════════════════════════════
const decroche = prochaineFenetre({ fin: 51568000 + PAS + 1, depuis: 51528001, jusqua: 51568000, plancher: PLANCHER, pas: PAS });
eq(decroche.sens, 'AVANT', 'plus d un morceau de retard : on rattrape l avant');
eq(decroche.deBloc, 51568001, 'et on reprend exactement au bloc suivant, sans trou');

// ══ 4. la remontee s arrete AU plancher, jamais en dessous ═══════════════════════════════════════
const presDuSol = prochaineFenetre({ fin: 51568000, depuis: PLANCHER + 10, jusqua: 51568000, plancher: PLANCHER, pas: PAS });
eq(presDuSol.deBloc, PLANCHER, 'la derniere tranche s arrete pile au plancher');
eq(presDuSol.aBloc, PLANCHER + 9, 'et couvre bien ce qui restait');

// ══ 5. tout couvert : plus rien, la boucle doit pouvoir s ARRETER ════════════════════════════════
eq(prochaineFenetre({ fin: 51568000, depuis: PLANCHER, jusqua: 51568000, plancher: PLANCHER, pas: PAS }), null,
  'couverture complete et tete atteinte : null, pour que la boucle finisse');
// ⛔ TEMOIN : au plancher mais en retard a l avant -> ce n est PAS null, il reste du travail.
const resteAvant = prochaineFenetre({ fin: 51568100, depuis: PLANCHER, jusqua: 51568000, plancher: PLANCHER, pas: PAS });
eq(resteAvant && resteAvant.sens, 'AVANT', 'au plancher mais en retard : on comble l avant');

// ══ 6. AUCUN TROU, AUCUN RECOUVREMENT, sur une simulation complete ═══════════════════════════════
// ⛔ La chaine AVANCE pendant la simulation : c est la condition qui revelait la famine.
// ⛔ CE QUI DOIT ETRE BORNE, C EST L ATTEINTE DU PLANCHER — pas la fin de la boucle. La chaine
//    avance sans cesse, donc il y aura TOUJOURS un bloc a combler a l avant : `prochaineFenetre` ne
//    rendra pas null, et c est correct. Le serveur, lui, s arrete sur `couvertureComplete`.
//    (Ma premiere version de ce test affirmait le contraire et echouait : c etait le test qui avait tort.)
let depuis = null, jusqua = null, fin = 51568000, tours = 0;
const couvert = [];
const TOURS_MAX = 500;
while (tours < TOURS_MAX && (depuis === null || depuis > PLANCHER)) {
  const f = prochaineFenetre({ fin, depuis, jusqua, plancher: PLANCHER, pas: PAS });
  if (!f) break;
  couvert.push([f.deBloc, f.aBloc]);
  if (depuis === null) { depuis = f.deBloc; jusqua = f.aBloc; }
  else if (f.sens === 'ARRIERE') depuis = f.deBloc;
  else jusqua = f.aBloc;
  fin += 15; /* ~30 s de Base entre deux tours */
  tours++;
}
eq(depuis, PLANCHER, 'la couverture atteint le plancher');
// ⛔ LA BORNE EST CHIFFREE : 706 912 blocs / 40 000 = 18 morceaux. Plus de 25 tours voudrait dire que
//    la remontee est affamee par l avancee de la chaine — le defaut exact qu on garde ici.
ok(tours <= 25, 'le plancher est atteint en ' + tours + ' tours (borne : 25)');
ok(couvert.filter((c) => c[0] < 51528001).length >= 17, 'et la plupart des tours ont servi a REMONTER');
// aucun trou : l union des tranches doit etre contigue de PLANCHER a jusqua
const tri = [...couvert].sort((a, b) => a[0] - b[0]);
let bas = tri[0][0], haut = tri[0][1];
for (const [d, a] of tri.slice(1)) {
  ok(d <= haut + 1, 'aucun trou entre ' + haut + ' et ' + d);
  haut = Math.max(haut, a);
}
eq(bas, PLANCHER, 'la couverture part du plancher');
ok(haut === jusqua, 'et va jusqu au haut connu');

// ══ 7. entrees absurdes : on rend null plutot qu une fenetre inventee ════════════════════════════
eq(prochaineFenetre({ fin: NaN, depuis: null, jusqua: null, plancher: PLANCHER, pas: PAS }), null, 'fin NaN -> null');
eq(prochaineFenetre({ fin: 1, depuis: null, jusqua: null, plancher: PLANCHER, pas: 0 }), null, 'pas nul -> null');

console.log('test-fenetre-scan : ' + n + ' assertions, OK');
