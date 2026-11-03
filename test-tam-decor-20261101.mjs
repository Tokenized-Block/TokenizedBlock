/* test-tam-decor-20261101.mjs - banc de tam-decor.js (objets de contexte des sciences TAM).
 *   1. forme : pour CHAQUE systeme (params par defaut + 2 tirages au hasard dans les bornes), decorDe rend un tableau d objets bien
 *      formes (type, espace, dimension des vecteurs, nombres finis, libelle ASCII anglais).
 *   2. couverture : chaque systeme a un decor ou une raison (SANS_DECOR) ; ESPACE_CORPS = les cles de CORPS ; normaliserCorps = vueCorps.
 *   3. physique : le decor compare aux constantes / invariants / donnees du module lui-meme (horizon 2M, ISCO 6M, r+ de Kerr,
 *      PREM relu dans le source, plaques de Casimir, fentes, Lagrange, Soleil heliocentrique, perihelie de Halley...).
 *   4. visibilite : chaque objet dans ou pres de la boite des donnees (marge = moitie de la plus grande etendue) ; les lointains
 *      sont LISTES (pas caches).
 *   5. mutants sur des COPIES du module (dossier temporaire du systeme, supprime a la fin) : chacun doit etre tue. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as SCI from './tam-science.js';
import * as DEC from './tam-decor.js';

const ICI = dirname(fileURLToPath(import.meta.url));
let N = 0, compter = true;
const ok = (c, m) => { assert.ok(c, m); if (compter) N++; };
const proche = (a, b, tol, m) => { assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), m + ' : ' + a + ' vs ' + b); if (compter) N++; };
const sim = (id, p = {}) => SCI.systeme(id).mod.simuler(id, p);
const parLib = (d, re) => { const q = d.find((x) => re.test(x.libelle)); assert.ok(q, 'objet ' + re + ' absent'); return q; };
const tousLib = (d, re) => d.filter((x) => re.test(x.libelle));
const norme = (p) => Math.sqrt(p.reduce((s, x) => s + x * x, 0));
function mulberry32(a) { return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ---------- 1. forme ---------- */
const TYPES = new Set(['point', 'sphere', 'cercle', 'segment', 'plan']);
const fini = (v, d) => Array.isArray(v) && v.length === d && v.every(Number.isFinite);
function verifierForme(id, d, o) {
  ok(Array.isArray(d), id + ' : tableau');
  const corps = !!SCI.CORPS[id], dim = corps ? 3 : o.D, esp = corps ? 'corps3' : 'brut';
  for (const q of d) {
    const t = id + ' / ' + q.libelle;
    ok(TYPES.has(q.type), t + ' : type ' + q.type);
    ok(q.espace === esp, t + ' : espace ' + q.espace);
    ok(fini(q.centre, dim), t + ' : centre de dimension ' + dim);
    ok(typeof q.couleur === 'string' && /^#[0-9a-f]{6}$/i.test(q.couleur), t + ' : couleur');
    ok(typeof q.libelle === 'string' && q.libelle.length > 0 && q.libelle.length <= 90 && /^[\x20-\x7e]+$/.test(q.libelle), t + ' : libelle ASCII');
    if (q.type === 'sphere' || q.type === 'cercle') ok(Number.isFinite(q.rayon) && q.rayon > 0, t + ' : rayon > 0');
    if (q.type === 'cercle' || q.type === 'plan') ok(fini(q.normale, dim) && norme(q.normale) > 0, t + ' : normale');
    if (q.type === 'cercle' && dim > 3) ok(q.normale.slice(3).every((x) => x === 0), t + ' : normale dans les 3 premiers axes');
    if (q.type === 'plan') ok(Number.isFinite(q.rayon) && q.rayon > 0, t + ' : taille d affichage');
    if (q.type === 'segment') {
      ok(fini(q.a, dim) && fini(q.b, dim), t + ' : extremites');
      ok(q.centre.every((x, i) => Math.abs(x - (q.a[i] + q.b[i]) / 2) < 1e-9 * Math.max(1, Math.abs(x))), t + ' : centre = milieu');
    }
    if ('image' in q) ok(Number.isInteger(q.image) && q.image >= 0 && (!o.film || q.image < o.film.images), t + ' : image du film');
    if ('largeur' in q) ok(Number.isFinite(q.largeur) && q.largeur > 0, t + ' : largeur');
    if ('arc' in q) ok(fini(q.arc, 2) && q.arc[1] > q.arc[0], t + ' : arc');
  }
}
const alea = mulberry32(20261101);
let objets = 0;
for (const s of SCI.SYSTEMES) {
  const o = sim(s.id), d = DEC.decorDe(s.id, o.params, o);
  verifierForme(s.id, d, o); objets += d.length;
  for (let k = 0; k < 2; k++) {
    const p = SCI.tirerParams(s.id, alea), oo = sim(s.id, p), dd = DEC.decorDe(s.id, oo.params, oo);
    verifierForme(s.id, dd, oo);
  }
}

/* ---------- 2. couverture ---------- */
const AVEC = new Set(DEC.AVEC_DECOR), SANS = DEC.SANS_DECOR;
for (const s of SCI.SYSTEMES) {
  ok(AVEC.has(s.id) !== (s.id in SANS), s.id + ' : decor XOR raison');
  if (s.id in SANS) ok(typeof SANS[s.id] === 'string' && SANS[s.id].length > 20, s.id + ' : raison ecrite');
  else ok(DEC.decorDe(s.id, {}).length > 0, s.id + ' : decor non vide par defaut');
}
for (const id of AVEC) ok(!!SCI.systeme(id), 'decor d un systeme qui existe : ' + id);
assert.deepEqual([...DEC.ESPACE_CORPS].sort(), Object.keys(SCI.CORPS).sort()); N++;
ok(DEC.decorDe('inconnu', {}).length === 0, 'id inconnu -> []');
for (const id of ['kerr', 'centreTerre', 'pointsLagrange']) { assert.deepEqual(DEC.decorDe(id, { }), DEC.decorDe(id, {}, sim(id))); N++; }
/* systeme qui quitte son domaine (kerr sous l orbite des photons) : pas de decor plutot qu un decor sur rien */
{ const o = sim('kerr', { a: 0.99, r0: 2 }); if (!o.bornee) ok(DEC.decorDe('kerr', o.params, o).length === 0, 'kerr non borne -> []'); }
/* game88 : le decor du vide DIT VRAI — le champ de Higgs finit SUR le cercle trace et au niveau Vmin ; le cercle du vide ordinaire a le
 *   rayon de l ecart-type mesure a r = 0 (1500 tirages) et le Casimir dynamique part SUR lui */
for (const p of [{}, { mu: 2, lambda: 0.1 }, { mu: 0.5, lambda: 2 }]) {
  const o = sim('higgsVide', p), c = DEC.decorDe('higgsVide', o.params, o).find((q) => /^Circle of vacua/.test(q.libelle)), k = o.n - 1;
  const R = Math.hypot(o.brut[4 * k], o.brut[4 * k + 1]), V = o.brut[4 * k + 2];
  ok(Math.abs(R - c.rayon) < 1e-3 * c.rayon && Math.abs(V - c.centre[2]) < 1e-3 * Math.abs(c.centre[2]), 'higgs ' + JSON.stringify(p) + ' : fin sur le cercle (|phi| ' + R + ' / ' + c.rayon + ', V ' + V + ' / ' + c.centre[2] + ')');
}
{ const o = sim('videComprime', { r: 0 }); let sx = 0, sp = 0; for (let i = 0; i < o.n; i++) { sx += o.brut[4 * i] ** 2; sp += o.brut[4 * i + 1] ** 2; }
  const c = DEC.decorDe('videComprime', o.params, o)[0], sd = Math.sqrt(0.5 * (sx + sp) / o.n);
  ok(Math.abs(sd - c.rayon) < 0.03, 'vide ordinaire : ecart-type mesure ' + sd.toFixed(4) + ' = rayon du cercle ' + c.rayon.toFixed(4)); }
{ const o = sim('casimirDynamique'), c = DEC.decorDe('casimirDynamique', o.params, o)[0];
  ok(Math.abs(Math.hypot(o.brut[0], o.brut[1]) - c.rayon) < 1e-9, 'casimir dynamique : le mode part SUR le cercle du vide'); }
/* game93 : les decors des theories classiques DISENT VRAI — le pic des infectes tombe sur le plan s = 1/R0 (a l echantillonnage pres),
 *   les moyennes de Lotka-Volterra sur le point d equilibre trace, les images de la lentille (beta 0) sur l anneau |theta| = 1 */
for (const R0 of [1.5, 2.5, 5]) { const o = sim('epidemieSIR', { R0 }), D = o.D; let k = 0; for (let i = 1; i < o.n; i++) if (o.brut[i * D + 1] > o.brut[k * D + 1]) k = i;
  const p = DEC.decorDe('epidemieSIR', o.params, o)[0]; ok(Math.abs(o.brut[k * D] - p.centre[0]) < 0.02 * p.centre[0], 'SIR R0 ' + R0 + ' : s au pic ' + o.brut[k * D].toFixed(4) + ' = plan du decor ' + p.centre[0].toFixed(4)); }
for (const c of [0.5, 1, 3]) { const o = sim('lotkaVolterra', { c }), D = o.D; let sx = 0, sy = 0; for (let i = 0; i < o.n; i++) { sx += o.brut[i * D]; sy += o.brut[i * D + 1]; }
  const s = DEC.decorDe('lotkaVolterra', o.params, o)[0]; ok(Math.abs(sx / o.n - s.a[0]) < 0.01 * s.a[0] && Math.abs(sy / o.n - s.a[1]) < 0.01, 'Lotka c ' + c + ' : moyennes sur le point d equilibre trace'); }
{ const o = sim('lentilleGravitationnelle', { beta: 0 }), D = o.D; let s = 0; for (let i = 0; i < o.n; i++) s += Math.hypot(o.brut[i * D], o.brut[i * D + 1]);
  const r = DEC.decorDe('lentilleGravitationnelle', o.params, o).find((q) => /^Einstein ring/.test(q.libelle)).rayon; ok(Math.abs(s / o.n - r) < 0.02, 'lentille beta 0 : images sur l anneau (rayon moyen ' + (s / o.n).toFixed(4) + ')'); }
/* normaliserCorps = la mise a l echelle de vueCorps (l origine retombe sur vueCorps().origine) */
for (const [id, k] of Object.entries(SCI.CORPS)) {
  const o = sim(id), w = DEC.normaliserCorps([{ type: 'point', centre: [0, 0, 0], couleur: '#ffffff', libelle: 'o' }], o, k)[0], vc = SCI.vueCorps(o, k);
  for (let c = 0; c < 3; c++) proche(w.centre[c], vc.origine[c], 1e-12, id + ' : origine normalisee axe ' + c);
}

/* ---------- 3. physique (fonctions reutilisees contre les mutants) ---------- */
const lignes = (o, f) => { const r = []; for (let i = 0; i < o.n; i++) r.push(f(o.brut.subarray(i * o.D, (i + 1) * o.D), i)); return r; };
const PREM_SOURCE = (() => {
  const t = readFileSync(join(ICI, 'tam-grandes-questions.js'), 'utf8'), a = t.indexOf('const PREM = Object.freeze(['), b = t.indexOf('].map(Object.freeze));', a);
  assert.ok(a > 0 && b > a, 'table PREM introuvable dans le source');
  return [...t.slice(a, b).matchAll(/\[\s*([\d.]+),\s*[-\d.]/g)].map((m) => Number(m[1]));
})();
const PHYS = [
  ['schwarzschild : horizon 2M, sphere de photons 3M, ISCO 6M ; un plongeon s arrete a l horizon', (D) => {
    const d = D.decorDe('schwarzschild', {});
    proche(parLib(d, /^Event horizon/).rayon, 2, 1e-12, 'horizon'); proche(parLib(d, /^Photon sphere/).rayon, 3, 1e-12, 'photons'); proche(parLib(d, /^Innermost/).rayon, 6, 1e-12, 'ISCO');
    const o = sim('schwarzschild', { L: 3.6, r0: 20, tours: 12 }), h = parLib(D.decorDe('schwarzschild', o.params, o), /^Event horizon/).rayon;
    ok(o.fin && o.fin.evenement === 'capture', 'L = 3.6 r0 = 20 : capture');
    const rmin = Math.min(...lignes(o, (l) => Math.hypot(l[0], l[1])));
    ok(rmin >= h * (1 - 1e-9) && rmin <= h * 1.01, 'le plongeon finit SUR l horizon du decor (rmin ' + rmin + ', horizon ' + h + ')');
  }],
  ['lumiereTrouNoir : sphere de photons = celle mesuree par le module, rayon capture sur l horizon, rayons echappes au-dessus de 3M', (D) => {
    const o = sim('lumiereTrouNoir'), d = D.decorDe('lumiereTrouNoir', o.params, o), I = o.invariants;
    const rp = parLib(d, /^Photon sphere/).rayon, rh = parLib(d, /^Event horizon/).rayon;
    proche(rp, I.spherePhotons.formule, 1e-12, 'photons = formule du module'); proche(I.spherePhotons.mesure, rp, 0.01, 'photons = mesure du module');
    for (const k of [1, 2, 3, 4]) {
      const r = I['rayon' + k];
      if (r.issue === 'capture') proche(r.rMin, rh, 0.01, 'rayon ' + k + ' capture a l horizon du decor');
      else ok(r.rMin > rp, 'rayon ' + k + ' echappe : rMin ' + r.rMin + ' > sphere de photons');
    }
  }],
  ['disqueAccretion : bord interne = ISCO 6M mesuree, v = 1/2 la, aucune particule en dessous', (D) => {
    const o = sim('disqueAccretion'), d = D.decorDe('disqueAccretion', o.params, o), q = parLib(d, /ISCO/);
    proche(q.rayon, o.invariants.isco.mesure, 1e-6, 'ISCO = mesure'); proche(q.rayon, 6, 1e-12, 'ISCO = 6M');
    proche(q.centre[3], o.invariants.vitesseIsco.formule, 1e-12, 'vitesse a l ISCO');
    proche(parLib(d, /^Event horizon/).rayon, 2, 1e-12, 'horizon 2M');
    ok(Math.min(...lignes(o, (l) => Math.hypot(l[0], l[1]))) >= q.rayon * (1 - 1e-9), 'aucune particule sous l ISCO');
  }],
  ['kerr : r+ = M + sqrt(M^2 - a^2) = rHorizon du module, ISCO de Bardeen, retrograde plus loin', (D) => {
    for (const a of [0, 0.5, 0.9, 0.99]) for (const inc of [10, 170]) {
      const o = sim('kerr', { a, r0: 12, inclinaison: inc, tours: 2 }); if (!o.bornee) continue;
      const d = D.decorDe('kerr', o.params, o), bl = (R) => Math.sqrt(R * R - a * a);
      const rp = bl(parLib(d, /^Event horizon/).rayon);
      proche(rp, 1 + Math.sqrt(1 - a * a), 1e-12, 'r+ formule a = ' + a); proche(rp, o.invariants.energie.rHorizon, 1e-12, 'r+ module a = ' + a);
      proche(bl(parLib(d, /^Innermost/).rayon), o.invariants.isco.formule, 1e-9, 'ISCO a = ' + a);
      proche(bl(parLib(d, /^Ergosphere/).rayon), 2, 1e-12, 'ergosphere equatoriale 2M');
    }
    const pro = sim('kerr', { a: 0.9, inclinaison: 10 }).invariants.isco.formule, retro = sim('kerr', { a: 0.9, r0: 20, inclinaison: 170 }).invariants.isco.formule;
    ok(retro > pro, 'ISCO retrograde > prograde');
  }],
  /* game107 (balayage a l ecran : deux libelles restes FAUX apres les variables de game105/106 — aucun banc ne lisait le decor sous
   *   ces reglages) : le decor suit le penchant de Galton et le signe de la charge de Rutherford */
  ['galton : le plan de la moyenne suit le penchant (L (q - 1/2)) ; rutherford : le noyau attire quand les charges sont opposees', (D) => {
    for (const q of [0.5, 0.1, 0.9]) {
      const o = sim('galton', { penchant: q }), d = D.decorDe('galton', o.params, o), p = parLib(d, /mean landing position/i), L = o.params.rangees;
      proche(p.centre[0], L * (q - 0.5), 1e-12, 'plan de la moyenne a q = ' + q);
      ok(q === 0.5 ? /x = 0\)/.test(p.libelle) : p.libelle.includes(String(Math.round(L * (q - 0.5) * 1000) / 1000)), 'libelle a q = ' + q + ' : ' + p.libelle);
    }
    const r0 = sim('rutherford'), r1 = sim('rutherford', { attirant: 1 });
    ok(/repels/.test(parLib(D.decorDe('rutherford', r0.params, r0), /^Nucleus/).libelle), 'repousse par defaut');
    ok(/pulls/.test(parLib(D.decorDe('rutherford', r1.params, r1), /^Nucleus/).libelle) && !/repels/.test(parLib(D.decorDe('rutherford', r1.params, r1), /^Nucleus/).libelle), 'attire avec les charges opposees');
    const l1 = sim('lotkaVolterra', { saturation: 0.2, c: 2 }), seg1 = parLib(D.decorDe('lotkaVolterra', l1.params, l1), /^Balance point/);
    proche(seg1.a[1], 1 - 0.2 * 2, 1e-12, 'LV : point d equilibre a y = 1 - s c');
  }],
  ['etoileS2 : horizon de Sgr A* = 2GM/c^2 (recalcule), S2 passe loin au-dessus', (D) => {
    const o = sim('etoileS2'), d = D.decorDe('etoileS2', o.params, o), h = parLib(d, /^Event horizon/).rayon;
    const c = 299792.458 * 31557600 / 149597870.7, rs = 2 * 4 * Math.PI * Math.PI * 4.261e6 / (c * c);
    proche(h, rs, 1e-9, 'horizon = 2GM/c^2 en UA'); proche(h, o.invariants.rayonSchwarzschild.mesure, 1e-12, 'horizon = module');
    ok(norme(parLib(d, /^Sgr A/).centre) === 0, 'Sgr A* a l origine');
    proche(Math.min(...lignes(o, (l) => norme([...l]))), o.invariants.pericentre.mesure, 1e-3, 'pericentre des donnees mesure depuis Sgr A*');
    ok(o.invariants.pericentre.mesure > 100 * h, 'S2 reste > 100 rayons d horizon');
  }],
  ['centreTerre : coquilles aux rayons PREM relus dans le source ; noyau/manteau = rayon du g max mesure', (D) => {
    const o = sim('centreTerre'), d = D.decorDe('centreTerre', o.params, o), R = PREM_SOURCE[PREM_SOURCE.length - 1];
    proche(R, 6371, 0, 'surface PREM 6371');
    const x = (re) => tousLib(d, re).map((q) => q.centre[0]).sort((u, w) => u - w);
    for (const [re, km] of [[/^Inner core/, PREM_SOURCE[0]], [/^Core-mantle/, PREM_SOURCE[1]], [/^Base of the crust/, PREM_SOURCE[6]], [/^Surface/, R]]) {
      const v = x(re); ok(v.length === 2, re + ' : deux cotes');
      proche(v[0], -km / R, 1e-12, re + ' cote -'); proche(v[1], km / R, 1e-12, re + ' cote +');
    }
    /* Moho confondu avec la surface a l ecran (0.4 % du rayon) : trace mais muet, la surface porte l epaisseur de la croute */
    ok(tousLib(d, /^Base of the crust/).every((q) => q.muet === true), 'Moho muet');
    ok(tousLib(d, /^Surface/).every((q) => !q.muet && q.libelle.includes('Moho ' + (Math.round((R - PREM_SOURCE[6]) * 10) / 10) + ' km below')), 'surface : epaisseur de la croute');
    ok(tousLib(d, /^(Inner core|Core-mantle)/).every((q) => !q.muet), 'graine et noyau ecrits');
    proche(PREM_SOURCE[0], 1221.5, 0, 'graine 1221.5'); proche(PREM_SOURCE[1], 3480, 0, 'noyau 3480');
    proche(x(/^Core-mantle/)[1] * R, o.invariants.gMax.rayonKm, 1e-12, 'g max mesure par le module a la frontiere noyau/manteau');
    ok(lignes(o, (l) => Math.abs(l[0])).every((a) => a <= x(/^Surface/)[1] * (1 + 1e-9)), 'la chute reste dans la Terre');
  }],
  ['videQuantique : plaques en x/d = 0 et 1, les modes interieurs entre elles', (D) => {
    const o = sim('videQuantique'), d = D.decorDe('videQuantique', o.params, o), xs = tousLib(d, /^Plate/).map((q) => q.centre[0]).sort();
    proche(xs[0], 0, 0, 'plaque 1'); proche(xs[1], 1, 0, 'plaque 2 (separation d = 1 en x/d)');
    ok(lignes(o, (l, i) => i < Math.floor(0.6 * o.n) ? l[0] >= xs[0] && l[0] <= xs[1] : true).every(Boolean), 'modes interieurs entre les plaques');
    ok(lignes(o, (l, i) => i >= Math.floor(0.6 * o.n) ? l[0] <= xs[0] || l[0] >= xs[1] : true).every(Boolean), 'champ exterieur hors des plaques');
  }],
  ['fentesYoung : fentes a -d/2 et +d/2, largeur a, interfrange theorique = lambda L / separation', (D) => {
    const r = mulberry32(7);
    for (let k = 0; k < 5; k++) {
      const p = { d: 0.1 + 0.4 * r(), a: 0.02 + 0.03 * r(), lambda: 400 + 300 * r() }, o = sim('fentesYoung', p), d = D.decorDe('fentesYoung', o.params, o);
      const f1 = parLib(d, /^Slit 1/), f2 = parLib(d, /^Slit 2/);
      proche(f1.a[0], -o.params.d / 2, 1e-12, 'fente 1'); proche(f2.a[0], o.params.d / 2, 1e-12, 'fente 2');
      ok(f1.a[0] < 0 && f2.a[0] > 0, 'fentes de part et d autre du centre');
      proche(f1.largeur, o.params.a, 0, 'largeur 1'); proche(f2.largeur, o.params.a, 0, 'largeur 2');
      proche((f2.a[0] - f1.a[0]) * o.invariants.interfrange.theorie, o.params.lambda * 1e-3, 1e-12, 'interfrange x separation = lambda L');
    }
  }],
  ['pointsLagrange : primaires en -mu et 1-mu, L1-L3 a l equilibre, L4/L5 equilateraux', (D) => {
    for (const monde of [0, 1]) {
      const o = sim('pointsLagrange', { monde }), d = D.decorDe('pointsLagrange', o.params, o), mu = o.invariants.mu;
      proche(d[0].centre[0], -mu, 1e-15, 'primaire'); proche(d[1].centre[0], 1 - mu, 1e-15, 'secondaire');
      const g = (x) => { const a = x + mu, b = x - 1 + mu; return x - (1 - mu) * a / Math.abs(a * a * a) - mu * b / Math.abs(b * b * b); };
      for (const L of ['L1', 'L2', 'L3']) { const q = parLib(d, new RegExp('^' + L + '$')); ok(Math.abs(g(q.centre[0])) < 1e-9 && q.centre[1] === 0, L + ' equilibre (monde ' + monde + ')'); }
      for (const L of ['L4', 'L5']) {
        const q = parLib(d, new RegExp('^' + L + '$')).centre;
        proche(Math.hypot(q[0] + mu, q[1]), 1, 1e-12, L + ' a 1 du primaire'); proche(Math.hypot(q[0] - 1 + mu, q[1]), 1, 1e-12, L + ' a 1 du secondaire');
      }
      ok(parLib(d, /^L4$/).centre[1] > 0 && parLib(d, /^L5$/).centre[1] < 0, 'L4 devant, L5 derriere');
    }
  }],
  ['systemeSolaire / mouvementTerre : le Soleil du decor est le foyer (Terre a 0.983-1.017 UA)', (D) => {
    const o = sim('systemeSolaire'), s = parLib(D.decorDe('systemeSolaire', o.params, o), /^Sun$/).centre;
    const r = lignes(o, (l) => Math.hypot(l[6] - s[0], l[7] - s[1], l[8] - s[2]));
    ok(Math.min(...r) > 0.98 && Math.max(...r) < 1.02, 'Terre a ~1 UA du Soleil du decor');
    const m = sim('mouvementTerre'), dm = D.decorDe('mouvementTerre', m.params, m), sg = parLib(dm, /own path/), e = m.params.excentricite;
    const dist = lignes(m, (l) => { const f = l[3] / m.params.annees; return Math.hypot(l[0] - f * sg.b[0], l[1] - f * sg.b[1], l[2] - f * sg.b[2]); });
    ok(Math.min(...dist) > 1 - e - 1e-3 && Math.max(...dist) < 1 + e + 1e-3, 'Terre a 1 +- e UA du Soleil en mouvement (' + Math.min(...dist) + ' .. ' + Math.max(...dist) + ')');
    proche(norme(sg.b.slice(0, 3)) / m.params.annees, m.invariants.pasHelice.parAn, 1e-5, 'vitesse du Soleil = celle du module');
  }],
  ['cometeHalley : perihelie a 0.586 UA (dans 1 UA), Terre sur le cercle de 1 UA', (D) => {
    const o = sim('cometeHalley'), d = D.decorDe('cometeHalley', o.params, o), p = parLib(d, /perihelion/).centre;
    proche(norme(p), o.invariants.perihelie.formule, 1e-6, 'perihelie = formule du module'); ok(norme(p) < 1, 'perihelie dans l orbite terrestre');
    proche(Math.min(...lignes(o, (l) => Math.hypot(l[0], l[1], l[2]))), norme(p), 1e-6, 'le point le plus proche du Soleil');
    const t = parLib(d, /^Earth's orbit/).rayon; ok(lignes(o, (l) => Math.abs(Math.hypot(l[3], l[4], l[5]) - t) < 1e-12).every(Boolean), 'Terre sur le cercle du decor');
  }],
  ['trouDeVer(Surface) : gorge r = b0 = plus petit rayon de la surface', (D) => {
    for (const b0 of [0.3, 1, 2.5]) {
      const o = sim('trouDeVerSurface', { b0 }), q = D.decorDe('trouDeVerSurface', o.params, o)[0];
      proche(q.rayon, b0, 0, 'gorge b0 = ' + b0);
      const rmin = Math.min(...lignes(o, (l) => Math.hypot(l[0], l[1]))); ok(rmin >= b0 * (1 - 1e-12) && rmin <= b0 * 1.01, 'surface au plus pres de la gorge');
      const v = sim('trouDeVer', { b0 }); proche(D.decorDe('trouDeVer', v.params, v)[0].rayon, v.invariants.gorge.b0, 0, 'gorge des rayons');
    }
  }],
  ['tokamak : la particule reste dans la chambre (r < 0.8 de l axe magnetique R = 1)', (D) => {
    const o = sim('tokamak'), d = D.decorDe('tokamak', o.params, o), R0 = parLib(d, /^Magnetic axis/).rayon, a = parLib(d, /cross-section/).rayon;
    ok(lignes(o, (l) => Math.hypot(Math.hypot(l[0], l[1]) - R0, l[2]) <= a).every(Boolean), 'dans la paroi');
  }],
  ['bloch : sur la sphere de Bloch, precession autour de l axe (rabi, 0, delta)', (D) => {
    const o = sim('bloch', { delta: 1.3, rabi: 0.7 }), d = D.decorDe('bloch', o.params, o), n = parLib(d, /^Rotation axis/).b, R = parLib(d, /^Bloch sphere/).rayon;
    const p = lignes(o, (l) => l[0] * n[0] + l[1] * n[1] + l[2] * n[2]);
    ok(lignes(o, (l) => Math.abs(Math.hypot(l[0], l[1], l[2]) - R) < 1e-9).every(Boolean), 'sur la sphere');
    ok(Math.max(...p) - Math.min(...p) < 1e-9, 'composante le long de l axe constante');
  }],
  ['boiteQuantique / tapisTalbot : le nuage entre les parois', (D) => {
    const o = sim('boiteQuantique'), d = D.decorDe('boiteQuantique', o.params, o);
    const lo = [0, 1, 2].map((c) => Math.min(...d.flatMap((q) => [q.a[c], q.b[c]]))), hi = [0, 1, 2].map((c) => Math.max(...d.flatMap((q) => [q.a[c], q.b[c]])));
    ok(lignes(o, (l) => [0, 1, 2].every((c) => l[c] >= lo[c] && l[c] <= hi[c])).every(Boolean), 'dans la boite');
    const t = sim('tapisTalbot'), dt = D.decorDe('tapisTalbot', t.params, t), w = tousLib(dt, /^Box wall/).map((q) => q.centre[0]).sort();
    ok(lignes(t, (l) => l[0] >= w[0] && l[0] <= w[1]).every(Boolean), 'tapis entre les parois');
    proche(parLib(dt, /^Mirror revival/).centre[1], 0.5, 1e-12, 'revival miroir a T_rev / 2');
  }],
  ['champDipolaire : lignes de champ depuis la surface, particule hors de la Terre', (D) => {
    const o = sim('champDipolaire'), R = parLib(D.decorDe('champDipolaire', o.params, o), /^Earth$/).rayon, nL = Math.max(10, Math.floor(0.3 * o.n));
    const r = lignes(o, (l) => Math.hypot(l[0], l[1], l[2]));
    proche(Math.min(...r.slice(0, nL)), R, 1e-9, 'lignes de champ partent de la surface'); ok(Math.min(...r.slice(nL)) > R, 'particule au-dessus de la Terre');
  }],
  ['courbureEspaceTemps / chuteTrouNoir / dilatationTemps : horizon 2M', (D) => {
    for (const M of [0.5, 1, 2]) {
      const o = sim('courbureEspaceTemps', { M }), d = D.decorDe('courbureEspaceTemps', o.params, o), h = parLib(d, /^Event horizon/).rayon;
      proche(h, 2 * o.params.M, 1e-12, 'horizon 2M (M = ' + M + ')');
      proche(Math.min(...lignes(o, (l) => Math.hypot(l[0], l[1]))), h, 1e-9, 'la surface de Flamm commence a l horizon');
    }
    const c = sim('chuteTrouNoir'), x = parLib(D.decorDe('chuteTrouNoir', c.params, c), /^Event horizon/).centre[0], k = c.fin.horizon.indice;
    ok(c.brut[3 * k] <= x && c.brut[3 * (k - 1)] > x, 'la chute franchit le plan horizon du decor a la ligne annoncee');
    proche(parLib(D.decorDe('dilatationTemps', {}), /horizon/).rayon, 2, 1e-12, 'dilatation : horizon 2M');
  }],
  ['versMars / tailleUnivers / nombrePi : reperes', (D) => {
    const o = sim('versMars'), d = D.decorDe('versMars', o.params, o), n3 = 3 * (o.film.images - 1);
    const a = parLib(d, /^Arrival/).centre, l = parLib(d, /^Launch/).centre;
    for (let c = 0; c < 3; c++) { proche(a[c], o.brut[3 * n3 + c], 1e-9, 'arrivee = vaisseau a la derniere image ' + c); proche(l[c], o.brut[c], 1e-9, 'depart = premiere image ' + c); }
    const u = sim('tailleUnivers'), du = D.decorDe('tailleUnivers', u.params, u);
    proche(parLib(du, /^Edge/).rayon, Math.max(...lignes(u, (q) => Math.hypot(q[0], q[1]))), 1e-9, 'horizon = bord du nuage');
    const p = sim('nombrePi'), dp = D.decorDe('nombrePi', p.params, p);
    ok(lignes(p, (q) => q[0] >= 0 && q[0] <= 1 && q[1] >= 0 && q[1] <= 1).every(Boolean), 'tirages dans le carre unite');
    proche(4 * lignes(p, (q) => (Math.hypot(q[0], q[1]) <= parLib(dp, /^Quarter/).rayon ? 1 : 0)).reduce((s, x) => s + x, 0) / p.n, p.invariants.monteCarlo.estimation, 1e-12, 'quart de cercle = celui du Monte-Carlo');
  }],
  ['ifs3d / oscillateurEtats / effetTunnel / niveauxLandau', (D) => {
    const o = sim('ifs3d'), v = tousLib(D.decorDe('ifs3d', o.params, o), /^Vertex/).map((q) => q.centre);
    /* barycentriques dans le tetraedre (0,0,0),(1,1,0),(1,0,1),(0,1,1) : b1 = (x+y-z)/2, b2 = (x-y+z)/2, b3 = (-x+y+z)/2 */
    ok(v.length === 4 && lignes(o, (l) => { const b1 = (l[0] + l[1] - l[2]) / 2, b2 = (l[0] - l[1] + l[2]) / 2, b3 = (-l[0] + l[1] + l[2]) / 2; return b1 >= -1e-12 && b2 >= -1e-12 && b3 >= -1e-12 && b1 + b2 + b3 <= 1 + 1e-12; }).every(Boolean), 'nuage dans le tetraedre des sommets');
    for (const [n, w] of [[0, 1], [4, 1], [7, 0.5]]) {
      const q = sim('oscillateurEtats', { n, omega: w }), x = Math.max(...D.decorDe('oscillateurEtats', q.params, q).map((p) => p.centre[0]));
      proche(x * x, (2 * q.params.n + 1) / q.params.omega, 1e-12, 'point de rebroussement n = ' + n);
    }
    const t = sim('effetTunnel', { largeur: 1.7 }), dt = D.decorDe('effetTunnel', t.params, t), dx = t.invariants.grille.dx;
    const larg = parLib(dt, /right edge/).a[0] - parLib(dt, /left edge/).a[0];
    proche(larg, t.invariants.transmission.largeurEffective, 1e-12, 'largeur de barriere'); ok(Math.abs(larg - 1.7) <= dx / 2 + 1e-12, 'barriere a une demi-cellule de la largeur demandee');
    const g = sim('niveauxLandau', { n: 2, B: 2 }), r = D.decorDe('niveauxLandau', g.params, g)[0].rayon;
    proche(r, Math.sqrt(5) * g.invariants.longueurMagnetique.fin, 1e-12, 'anneau sqrt(2n+1) l_B');
  }],
  ['karman / troisCorps / tourbillonsPonctuels : objets mobiles relus sur les donnees', (D) => {
    const o = sim('karman'), d = D.decorDe('karman', o.params, o);
    let dmin = Infinity;
    lignes(o, (l) => { for (const q of d) { const x = q.a[0] + l[2]; dmin = Math.min(dmin, Math.hypot(l[0] - x, l[1] - q.a[1])); } });
    ok(dmin >= 0.02 * (1 - 1e-6) && dmin < 0.5, 'le traceur frole les tourbillons du decor sans les toucher (' + dmin + ')');
    ok(tousLib(d, /upper/).every((q) => q.a[1] === o.params.rapport / 2) && tousLib(d, /lower/).every((q) => q.a[1] === -o.params.rapport / 2), 'rangees en +-h/2');
    const t = sim('troisCorps', { perturbation: 0.3 }), c = D.decorDe('troisCorps', t.params, t)[0].centre;
    ok(lignes(t, (l) => [0, 1, 2].every((k) => Math.abs((l[k] + l[3 + k] + l[6 + k]) / 3 - c[k]) < 1e-9)).every(Boolean), 'centre de masse fixe du decor');
    const v = sim('tourbillonsPonctuels', { G1: 2, G2: 0.5, G3: 1, G4: 3 }), cv = D.decorDe('tourbillonsPonctuels', v.params, v)[0].centre, G = [2, 0.5, 1, 3], sG = 6.5;
    ok(lignes(v, (l) => Math.abs(G.reduce((s, g, i) => s + g * l[2 * i], 0) / sG - cv[0]) < 1e-8 && Math.abs(G.reduce((s, g, i) => s + g * l[2 * i + 1], 0) / sG - cv[1]) < 1e-8).every(Boolean), 'centre de vorticite conserve');
  }],
  ['collisionGalaxies / quarks / marcheQuantique / effetUnruh / sternGerlach / lorentzRelativiste', (D) => {
    const o = sim('collisionGalaxies'), d = D.decorDe('collisionGalaxies', o.params, o), c0 = tousLib(d, /^Core/).filter((q) => q.image === 0);
    proche(Math.hypot(c0[0].centre[0] - c0[1].centre[0], c0[0].centre[1] - c0[1].centre[1]), 8, 1e-9, 'noyaux a 8 r_p au depart');
    ok(tousLib(d, /^Core/).length === 2 * o.film.images, 'deux noyaux par image');
    const q = sim('quarks'), dq = D.decorDe('quarks', q.params, q);
    for (let k = 0; k < q.params.images; k++) {
      const x = dq.filter((p) => p.image === k).map((p) => p.centre[0]), lim = Math.max(...x), a0 = q.film.debuts[k], a1 = a0 + q.film.tailles[k];
      let m = 0; for (let i = a0; i < a1; i++) m = Math.max(m, Math.abs(q.brut[4 * i]));
      ok(m <= lim + 1e-12 && m > 0.9 * lim, 'image ' + k + ' : la corde finit sur les quarks');
    }
    const w = sim('marcheQuantique'); ok(lignes(w, (l) => Math.abs(l[0]) <= l[1]).every(Boolean), 'marche dans le cone |x| <= t');
    const u = sim('effetUnruh'); ok(lignes(u, (l) => l[0] > Math.abs(l[1])).every(Boolean), 'observateur hors des horizons de Rindler');
    const s = sim('sternGerlach', { theta: 1.5, gradient: 0.8 }), z = parLib(D.decorDe('sternGerlach', s.params, s), /^Spin-up spot/).centre[2];
    const hauts = lignes(s, (l) => (l[1] > 1.95 && l[2] > 0 ? l[2] : null)).filter((x) => x !== null);
    proche(hauts.reduce((a, b) => a + b, 0) / hauts.length, z, 0.05, 'tache haute de l ecran');
    const e = sim('lorentzRelativiste'), fe = parLib(D.decorDe('lorentzRelativiste', e.params, e), /drift/).b[1];
    ok(Math.abs(e.brut[3 * (e.n - 1) + 1] - fe) < 0.1 * Math.abs(fe), 'derive E x B : fin des donnees pres du bout du segment');
  }],
];
for (const [nom, f] of PHYS) { const n0 = N; f(DEC); ok(N > n0, 'controle physique execute : ' + nom); }

/* ---------- 4. visibilite ---------- */
const loin = [], visibles = [];
for (const s of SCI.SYSTEMES) {
  const o = sim(s.id), d = DEC.decorDe(s.id, o.params, o); if (!d.length) continue;
  const B = DEC.boiteDonnees(s.id, o), m = 0.5 * B.ext;
  const pres = (p) => p.every((x, c) => x >= B.lo[c] - m && x <= B.hi[c] + m);
  let unVisible = false;
  for (const q of d) { const a = q.type === 'segment' ? [q.a, q.b] : [q.centre]; if (a.some(pres)) unVisible = true; else loin.push(s.id + ' : ' + q.libelle); }
  ok(unVisible, s.id + ' : au moins un objet dans ou pres de la boite des donnees'); visibles.push(s.id);
}

/* ---------- 5. mutants (copies) ---------- */
const SRC = readFileSync(join(ICI, 'tam-decor.js'), 'utf8');
const SCIENCE_URL = pathToFileURL(join(ICI, 'tam-science.js')).href;
const MUTANTS = [
  ['horizon 2M -> 3M', 'const R_HORIZON = 2 * M_GEO;', 'const R_HORIZON = 3 * M_GEO;'],
  ['signe de Kerr r+ = M - sqrt', 'rPlus = M_GEO + Math.sqrt(M_GEO * M_GEO - a * a)', 'rPlus = M_GEO - Math.sqrt(M_GEO * M_GEO - a * a)'],
  ['couches PREM permutees', "[[1221.5, 'Inner core edge'], [3480, 'Core-mantle boundary']", "[[3480, 'Inner core edge'], [1221.5, 'Core-mantle boundary']"],
  ['signe de la fente 1', 'const xs = [-P.d / 2, P.d / 2]', 'const xs = [P.d / 2, P.d / 2]'],
  ['signe de L5', 'pt([I.L4.x, -I.L4.y, 0], C.zone, \'L5\')', 'pt([I.L4.x, I.L4.y, 0], C.zone, \'L5\')'],
  ['perihelie de Halley lu sur la mauvaise ligne', 'pt([o.brut[0], o.brut[1], o.brut[2]]', 'pt([o.brut[6], o.brut[7], o.brut[8]]'],
  ['ISCO de Kerr a la place de l ergosphere', 'eq(2 * M_GEO), [0, 0, 1], C.ergo', 'eq(isco), [0, 0, 1], C.ergo'],
];
const dossier = mkdtempSync(join(tmpdir(), 'tam-decor-mutants-'));
let tues = 0;
const charger = async (src, nom) => { const f = join(dossier, nom + '.mjs'); writeFileSync(f, src.replace("from './tam-science.js'", "from '" + SCIENCE_URL + "'")); return import(pathToFileURL(f).href); };
/* rend null si tout passe, sinon le nom du premier controle qui tombe (le mutant est tue PAR ce controle) */
const passe = (M) => { compter = false; let nom = null; try { for (const [n, f] of PHYS) { nom = n; f(M); } return null; } catch (_) { return nom; } finally { compter = true; } };
try {
  ok(SRC.includes("from './tam-science.js'"), 'import relatif a reecrire');
  ok(passe(await charger(SRC, 'temoin')) === null, 'la copie NON mutee passe tous les controles (le banc ne tue pas par construction)');
  for (const [k, [nom, de, vers]] of MUTANTS.entries()) {
    ok(SRC.split(de).length === 2, 'mutant ' + nom + ' : motif unique');
    const tueur = passe(await charger(SRC.replace(de, vers), 'mutant-' + k));
    if (tueur) { tues++; console.log('  mutant "' + nom + '" tue par : ' + tueur.split(' : ')[0]); } else console.log('MUTANT SURVIVANT : ' + nom);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
ok(tues === MUTANTS.length, 'tous les mutants tues');

console.log('systemes decores : ' + visibles.length + '/' + SCI.SYSTEMES.length + ', objets (defauts) : ' + objets);
console.log('objets loin de la boite des donnees (' + loin.length + ') :' + (loin.length ? '\n  ' + loin.join('\n  ') : ' aucun'));
console.log('test-tam-decor-20261101 : ' + N + ' assertions OK');
console.log('MUTANTS : ' + tues + '/' + MUTANTS.length + ' tues');
