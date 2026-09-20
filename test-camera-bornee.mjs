/* test-camera-bornee.mjs — la camera de la map peut-elle encore sortir du monde ?
 * ================================================================================================
 * ⛔ CE QUE CE FICHIER PROUVE, ET RIEN DE PLUS : l ARITHMETIQUE de `vers()` est bornee. Il rejoue la
 *    formule d avant et celle d apres sur les memes entrees, y compris les cas ou le block est
 *    exactement au niveau de l oeil de la camera.
 * ⛔ CE QU IL NE PROUVE PAS : que la map se dessine bien. `map3d.js` a besoin d un DOM ; son
 *    integration a ete verifiee a l ecran, par capture, pas ici. Un test qui rejoue une formule ne
 *    dit rien du code qui l appelle — c est ecrit pour que personne ne lise ce vert comme plus large.
 * TEMOIN ROUGE : `versAvant()` est la formule EXACTE d avant le 2026-09-20. Le test exige qu elle
 *    explose sur au moins un cas — sans ca, on ne saurait pas que le correctif corrige quelque chose.
 */
import assert from 'node:assert/strict';

let n = 0;
const ok = (c, m) => { n += 1; assert.ok(c, m); };

const S = 1000;            /* demi-cote du monde, ordre de grandeur reel */
const DIST_DEPART = 0.62;
const DIST_MAX = 12;
const ZC_MIN_PART = 0.12;
const L = 1200, H = 800, f = 900;   /* largeur, hauteur, focale */
const cx = (L - 380) / 2, cy = H / 2;

/** La formule D AVANT (temoin rouge) — recopiee telle quelle depuis map3d.js. */
function versAvant({ x1, y2, z2, dist }) {
  const zc = z2 + dist;
  return { ox: cx - L / 2 - x1 * f / zc, oy: cy - H / 2 - y2 * f / zc, dist };
}
/** La formule D APRES — la meme borne que celle posee dans map3d.js. */
function versApres({ x1, y2, z2, dist }) {
  const plancher = S * ZC_MIN_PART;
  let d = dist;
  if (!Number.isFinite(d)) d = S * DIST_DEPART;
  if (z2 + d < plancher) d = plancher - z2;
  if (!Number.isFinite(d) || d > S * DIST_MAX) d = S * DIST_DEPART;
  const zc = z2 + d;
  if (!Number.isFinite(zc) || zc <= 0) return { ox: 0, oy: 0, dist: S * DIST_DEPART };
  const ox = cx - L / 2 - x1 * f / zc, oy = cy - H / 2 - y2 * f / zc;
  if (!Number.isFinite(ox) || !Number.isFinite(oy)) return { ox: 0, oy: 0, dist: S * DIST_DEPART };
  return { ox, oy, dist: d };
}

/* ⛔ « HORS DU MONDE » SE DEFINIT, il ne se devine pas : un decalage superieur a 100 fois la largeur
 *    de l ecran ne montre plus rien — la vue est vide, et c est ce que Phil a vu. */
const HORS_MONDE = 100 * L;
const sorti = (v) => !Number.isFinite(v.ox) || !Number.isFinite(v.oy)
  || Math.abs(v.ox) > HORS_MONDE || Math.abs(v.oy) > HORS_MONDE;

/* ── Les cas : du banal au pire ────────────────────────────────────────────────────────────────── */
const dist = S * DIST_DEPART;
const cas = [
  { nom: 'block bien devant la camera', x1: 120, y2: -80, z2: 200, dist },
  { nom: 'block au centre du monde', x1: 0, y2: 0, z2: 0, dist },
  { nom: 'block EXACTEMENT au niveau de l oeil (zc = 0)', x1: 300, y2: 200, z2: -dist, dist },
  { nom: 'block a un cheveu devant l oeil (zc = 1e-9)', x1: 300, y2: 200, z2: -dist + 1e-9, dist },
  { nom: 'block DERRIERE la camera (zc negatif)', x1: 300, y2: 200, z2: -dist - 500, dist },
  { nom: 'distance non finie', x1: 50, y2: 50, z2: 100, dist: NaN },
];

let rougesVues = 0;
for (const c of cas) {
  const apres = versApres(c);
  ok(!sorti(apres), 'APRES — la vue reste dans le monde : ' + c.nom);
  ok(Number.isFinite(apres.dist) && apres.dist > 0, 'APRES — la distance reste finie et positive : ' + c.nom);
  if (sorti(versAvant(c))) rougesVues += 1;
}
/* ⛔ SANS TEMOIN ROUGE, CE FICHIER NE PROUVERAIT RIEN : il faut que l ancienne formule ait vraiment
 *    casse sur au moins un des cas, sinon le correctif corrige du vide. */
ok(rougesVues >= 3, 'TEMOIN — l ancienne formule sortait du monde sur au moins 3 cas (vu : ' + rougesVues + ')');

/* ── Et elle reste JUSTE quand il n y a rien a corriger ────────────────────────────────────────── */
const banal = { x1: 120, y2: -80, z2: 200, dist };
const a = versAvant(banal), b = versApres(banal);
ok(Math.abs(a.ox - b.ox) < 1e-9 && Math.abs(a.oy - b.oy) < 1e-9,
  'sur un cas normal, la nouvelle formule rend EXACTEMENT l ancienne — la borne ne deforme rien');

/* ── Un NaN ne doit jamais traverser : il echouerait OUVERT ────────────────────────────────────── */
for (const mauvais of [{ x1: NaN, y2: 0, z2: 100, dist }, { x1: 0, y2: NaN, z2: 100, dist },
  { x1: 0, y2: 0, z2: NaN, dist }]) {
  ok(!sorti(versApres(mauvais)), 'un NaN en entree rend la vue d ensemble, jamais une vue vide');
}

console.log('test-camera-bornee : ' + n + ' assertions, ' + rougesVues + ' cas rouges sur l ancienne formule, exit 0');
