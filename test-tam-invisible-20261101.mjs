// test-tam-invisible-20261101.mjs -- banc de tam-invisible.js (vue INVISIBLE, non frappable) + mutants sur COPIES.
// Lancer : node test-tam-invisible-20261101.mjs
// Chaque verification relit ce qui est DESSINE (brut) ou refait le calcul ici, avec Math natif (le test n est pas tenu au determinisme).
// Tolerances annoncees (et pourquoi) :
//   onde gravitationnelle : aire = 1 - h^2/4 cos^2 t a 1e-12 (identite exacte de la deformation lineaire) ; etirement 1 + h/2 a 1e-12.
//   Flamm : z^2/8M = r - 2M a 1e-12 ; distance propre (quadrature ici) a 1e-6 de la mesure du module et de la formule fermee.
//   chute : temps propre total (pi/2) r0^1.5/sqrt(2M) a 1e-9 ; t(4M) ferme contre quadrature ici a 1e-6 ; pente de divergence 2M a 1e-3.
//   horloges : rythmes a 1e-12 ; GPS a 2 % de +45.7 / -7.2 / +38.5 us/jour (valeurs publiees, arrondies a 0.1).
//   tunnel : probabilite totale < 1e-6 ; T mesure a 10 % de T(E central) (le paquet a une largeur en energie, la formule est pour une
//     onde plane) et a 3 % de T moyenne sur le spectre du paquet (reste : pas de temps fini + marche de potentiel sur grille, mesure 1.3 %).
//   superposition : periode a 1e-6 de 2 pi/(3/8) ; amplitude a 5 % de 128 sqrt 2/243 (20000 tirages : ecart-type ~1 %, mesure < 1.3 %).
//   dipole : tangente des lignes // B a 1e-12 ; energie Boris < 1e-10 ; mu < 20 % et divise par > 1.6 quand B0 double (adiabatique) ;
//     miroirs symetriques a 1 % et a 5 % de la formule (rayon de giration fini : ecart mesure 2.1 % a B0 = 1000, 1.1 % a 2000).
//   lumiere : E.B = 0, |E| = c|B|, B = k x E / c a 1e-12 ; <cos^2 theta> a 4 sigma de 1/5 et a plus de 4 sigma de 1/3 (isotrope).
//   espace-temps : s^2 invariant a 1e-12 (relatif) ; ages des jumeaux a 1e-9.
//   brownien : D a 5 % (2500 particules : ecart-type ~1.6 %) ; vitesse moyenne et quadratique a 5 %.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-invisible.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const IDS = ['ondeGravitationnelle', 'courbureEspaceTemps', 'chuteTrouNoir', 'dilatationTemps', 'effetTunnel', 'superpositionQuantique',
  'champDipolaire', 'ondeLumiere', 'diagrammeEspaceTemps', 'mouvementBrownien'];
const INTERDITS = /Math\.(sin|cos|tan|exp|log|log2|log10|log1p|expm1|pow|atan|atan2|asin|acos|hypot|sinh|cosh|tanh|asinh|acosh|atanh|cbrt|random)\b|Date\.now|new Date|performance\./;

function suite(T, texte, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const cache = new Map();
  const sim = (id, p = {}, o) => { const k = id + JSON.stringify(p) + JSON.stringify(o || {}); if (!cache.has(k)) cache.set(k, T.simuler(id, p, o)); return cache.get(k); };
  const ligne = (r, i) => Array.from(r.brut.subarray(i * r.D, (i + 1) * r.D));

  // 0. source : aucune fonction transcendante native, aucun hasard, aucune horloge
  ok('source (hors commentaires) : ni Math.sin/cos/exp/log/pow/atan/asin/acos/hypot/cbrt/random, ni horloge', () => {
    const code = texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''), m = code.match(INTERDITS); assert.equal(m, null, m && m[0]);
    assert.ok(code.includes('sinD(') && code.includes('lnD(') && code.includes('expD('));
  });
  // 1. forme, bornes, determinisme
  ok('SYSTEMES gele, 10 systemes attendus', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES)); assert.deepEqual(T.SYSTEMES.map((s) => s.id), IDS);
    for (const s of T.SYSTEMES) { assert.ok(Object.isFrozen(s) && Object.isFrozen(s.params) && Object.isFrozen(s.bornes)); assert.match(s.phrase, /visualisation/); assert.match(s.phrase, /not a photo/); }
  });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, 3 <= D <= 12, brut n*D fini, lyapunov null`, () => {
      for (const n of [1500, 50]) {
        const r = sim(s.id, {}, { n });
        assert.equal(r.bornee, true); assert.equal(r.D, s.D); assert.ok(r.D >= 3 && r.D <= 12); assert.equal(r.n, n);
        assert.ok(r.brut instanceof Float64Array); assert.equal(r.brut.length, n * s.D); assert.ok(r.brut.every(Number.isFinite));
        assert.equal(r.points, null); assert.equal(r.lyapunov, null); assert.match(r.uniteLyapunov, /sans objet/); assert.equal(typeof r.invariants, 'object');
      }
    });
    ok(`${s.id} : determinisme (octets identiques)`, () => assert.ok(octets(T.simuler(s.id).brut).equals(octets(T.simuler(s.id).brut))));
  }

  // 2. onde gravitationnelle (relue dans brut)
  const anneau = (p) => {
    const r = sim('ondeGravitationnelle', p), N = r.params.masses, h2 = r.params.hPlus ** 2 + r.params.hCroix ** 2, duree = r.params.cycles * 2 * Math.PI;
    const A0 = N / 2 * Math.sin(2 * Math.PI / N); let ecart = 0, pire = 0;
    for (let k = 0; (k + 1) * N <= r.n; k++) {
      let A = 0; const t = ligne(r, k * N)[2] * duree / 2;
      for (let j = 0; j < N; j++) { const a = ligne(r, k * N + j), b = ligne(r, k * N + (j + 1) % N); A += a[0] * b[1] - b[0] * a[1]; }
      A /= 2 * A0; ecart = Math.max(ecart, Math.abs(A - (1 - h2 / 4 * Math.cos(t) ** 2))); pire = Math.max(pire, Math.abs(A - 1));
    }
    let rm = -1, jm = 0; for (let j = 0; j < N; j++) { const a = ligne(r, j), q = Math.hypot(a[0], a[1]); if (q > rm + 1e-12) { rm = q; jm = j; } }
    return { r, ecart, pire, h2, rm, angle: (360 * jm / N) % 180 };
  };
  ok('GW + : aire = 1 - h^2/4 cos^2 t (1e-12), ordre 2 seulement', () => {
    const a = anneau({}); assert.ok(a.ecart < 1e-12, String(a.ecart)); assert.ok(a.pire <= a.h2 / 4 + 1e-12 && a.pire > 0.5 * a.h2 / 4);
    return `max |A/A0 - 1| = ${a.pire.toExponential(3)} vs h^2/4 = ${(a.h2 / 4).toExponential(3)} (deplacement h/2 = 0.15)`;
  });
  ok('GW + : etirement 1 + h/2 a 0 deg (mod 180)', () => { const a = anneau({}); assert.ok(Math.abs(a.rm - 1.15) < 1e-12, String(a.rm)); assert.equal(a.angle, 0); return `${a.rm.toFixed(12)} a ${a.angle} deg`; });
  ok('GW x : etirement 1 + h/2 a 45 deg (mod 180), aire 1e-12', () => {
    const a = anneau({ hPlus: 0, hCroix: 0.3 }); assert.ok(Math.abs(a.rm - 1.15) < 1e-12, String(a.rm)); assert.equal(a.angle, 45); assert.ok(a.ecart < 1e-12);
    return `${a.rm.toFixed(12)} a ${a.angle} deg`;
  });
  ok('GW : invariants du module = relecture', () => { const I = sim('ondeGravitationnelle').invariants; assert.ok(Math.abs(I.etirement.mesure - I.etirement.formule) < 1e-12); assert.ok(Math.abs(I.aireOrdre2.mesure - I.aireOrdre2.formule) < 1e-12); });

  // 3. Flamm
  for (const p of [{}, { M: 2, rmax: 40, r0: 20 }]) ok(`Flamm ${JSON.stringify(p)} : z^2/8M = r - 2M sur la surface, distance propre`, () => {
    const r = sim('courbureEspaceTemps', p), M = r.params.M, nS = r.n - Math.floor(r.n / 5), R = r.params.rmax * M; let e = 0;
    for (let i = 0; i < nS; i++) { const [x, y, z] = ligne(r, i); assert.ok(z >= 0); e = Math.max(e, Math.abs(z * z / (8 * M) - (Math.hypot(x, y) - 2 * M)) / R); }
    assert.ok(e < 1e-12, String(e));
    /* quadrature ici : r = 2M + u^2 -> int 2 sqrt(2M + u^2) du, Simpson */
    const U = Math.sqrt(R - 2 * M), K = 20000; let s = 0;
    for (let k = 0; k <= K; k++) { const u = U * k / K, w = k === 0 || k === K ? 1 : k % 2 ? 4 : 2; s += w * 2 * Math.sqrt(2 * M + u * u); }
    s *= U / K / 3;
    const I = r.invariants.distancePropre;
    assert.ok(rel(I.mesure, s) < 1e-6 && rel(I.formule, s) < 1e-9, `${I.mesure} ${I.formule} ${s}`); assert.ok(s > R - 2 * M);
    return `propre ${s.toFixed(6)} vs coordonnee ${(R - 2 * M).toFixed(1)} ; module ${I.mesure.toFixed(6)}`;
  });

  // 4. chute radiale
  for (const r0 of [10, 25]) ok(`chute r0 = ${r0} : temps propre total = (pi/2) r0^1.5 / sqrt(2M)`, () => {
    const r = sim('chuteTrouNoir', { r0 }), f = Math.PI / 2 * r0 ** 1.5 / Math.sqrt(2), last = ligne(r, r.n - 1), I = r.invariants.tempsPropreTotal;
    assert.ok(Math.abs(last[0]) < 1e-12); assert.ok(rel(last[1], f) < 1e-12, `${last[1]} vs ${f}`); assert.ok(rel(I.mesure, f) < 1e-9, `${I.mesure} vs ${f}`);
    for (let i = 1; i < r.n; i++) assert.ok(ligne(r, i)[1] > ligne(r, i - 1)[1] && ligne(r, i)[0] < ligne(r, i - 1)[0]);
    return `${last[1].toFixed(9)} vs ${f.toFixed(9)}`;
  });
  ok('chute : t(4M) ferme = quadrature ici (1e-6), diverge en 2M (pente 2M), tau fini', () => {
    const r0 = 10, r = sim('chuteTrouNoir', { r0 }), I = r.invariants, E = Math.sqrt(1 - 2 / r0), K = 200000;
    /* int_{4}^{r0} E / ((1 - 2/r) sqrt(2/r - 2/r0)) dr, r = r0 - w^2 (retire la racine en r0), point milieu */
    const W = Math.sqrt(r0 - 4); let t = 0;
    for (let k = 0; k < K; k++) { const w = W * (k + 0.5) / K, rr = r0 - w * w; t += E * 2 * w / ((1 - 2 / rr) * Math.sqrt(2 / rr - 2 / r0)) * W / K; }
    assert.ok(rel(I.tempsCoordonne4M.formule, t) < 1e-6, `${I.tempsCoordonne4M.formule} vs ${t}`);
    assert.ok(Math.abs(I.divergenceHorizon.mesure - 2) < 1e-3, String(I.divergenceHorizon.mesure));
    const tauH = I.tempsPropreHorizon.mesure; assert.ok(Number.isFinite(tauH) && tauH < I.tempsPropreTotal.formule);
    let clips = 0; for (let i = 0; i < r.n; i++) if (ligne(r, i)[2] === I.coupure.valeur) clips++; assert.ok(clips > 0);
    return `t(4M) ${t.toFixed(6)} ; pente ${I.divergenceHorizon.mesure.toFixed(5)} ; tau(2M) ${tauH.toFixed(4)}`;
  });

  // 5. horloges
  ok('horloges : pas des helices = sqrt(1 - 2M/r) et 1/gamma (1e-12)', () => {
    const r = sim('dilatationTemps'), K = r.params.horloges, m = Math.ceil(r.n / (K + 1)), duree = r.params.tours * 2 * Math.PI; const vus = [];
    for (let k = 0; k <= K; k++) {
      const a = ligne(r, k * m + m - 1), rr = Math.hypot(a[0], a[1]), taux = a[2] / duree;
      const f = k < K ? Math.sqrt(1 - 2 / rr) : Math.sqrt(1 - r.params.v ** 2);
      assert.ok(Math.abs(taux - f) < 1e-12, `${k} ${taux} ${f}`); vus.push(taux.toFixed(4));
    }
    return vus.join(' ');
  });
  ok('GPS : +45.7 (RG), -7.2 (RR), +38.5 us/jour a 2 %', () => {
    const g = sim('dilatationTemps').invariants.gps.mesure;
    assert.ok(rel(g.relativiteGenerale, 45.7) < 0.02 && rel(g.relativiteRestreinte, -7.2) < 0.02 && rel(g.net, 38.5) < 0.02, JSON.stringify(g));
    return `${g.relativiteGenerale.toFixed(2)} / ${g.relativiteRestreinte.toFixed(2)} / ${g.net.toFixed(2)}`;
  });

  // 6. tunnel
  const Tonde = (E, V0, a) => {
    if (E < V0) return 1 / (1 + V0 * V0 * Math.sinh(Math.sqrt(2 * (V0 - E)) * a) ** 2 / (4 * E * (V0 - E)));
    return 1 / (1 + V0 * V0 * Math.sin(Math.sqrt(2 * (E - V0)) * a) ** 2 / (4 * E * (E - V0)));
  };
  for (const p of [{}, { k0: 0.6 }, { k0: 2.5 }, { V0: 3, largeur: 0.5, k0: 2 }]) ok(`tunnel ${JSON.stringify(p)} : T a 10 % de T(E), 3 % du paquet, proba < 1e-6`, () => {
    const r = sim('effetTunnel', p), I = r.invariants, t = I.transmission, f = Tonde(t.energie, t.V0, t.largeurEffective);
    assert.ok(I.probabiliteTotale.derive < 1e-6, String(I.probabiliteTotale.derive));
    assert.ok(rel(t.mesure, f) < 0.1, `${t.mesure} vs ${f}`); assert.ok(rel(t.mesure, t.paquet) < 0.03, `${t.mesure} vs ${t.paquet}`);
    assert.ok(Math.abs(t.mesure + t.reflexion - 1) < 1e-3);
    return `T ${t.mesure.toFixed(4)} | onde plane ${f.toFixed(4)} | paquet ${t.paquet.toFixed(4)} | derive ${I.probabiliteTotale.derive.toExponential(1)}`;
  });
  ok('tunnel : barriere opaque (V0 = 3, a = 4) T < 1e-3, sans la barriere on traverserait', () => {
    const t = sim('effetTunnel', { V0: 3, largeur: 4, k0: 1.2 }).invariants.transmission; assert.ok(t.mesure < 1e-3 && t.formule < 1e-3, `${t.mesure} ${t.formule}`); return t.mesure.toExponential(2);
  });

  // 7. superposition
  for (const graine of [1, 2, 3]) ok(`superposition graine ${graine} : periode 2 pi/(3/8), amplitude 128 sqrt2/243 a 5 %`, () => {
    const I = sim('superpositionQuantique', { graine }).invariants, Tb = 2 * Math.PI / (3 / 8), A = 128 * Math.SQRT2 / 243;
    assert.ok(rel(I.periodeBattement.mesure, Tb) < 1e-6, String(I.periodeBattement.mesure)); assert.ok(rel(I.amplitudeCentroide.mesure, A) < 0.05, String(I.amplitudeCentroide.mesure));
    return `T ${I.periodeBattement.mesure.toFixed(6)} vs ${Tb.toFixed(6)} ; A ${I.amplitudeCentroide.mesure.toFixed(4)} vs ${A.toFixed(4)}`;
  });
  ok('superposition : le nuage DESSINE monte quand cos(dE t) > 0, descend sinon', () => {
    const r = sim('superpositionQuantique'), Tb = 2 * Math.PI / (3 / 8); let hz = 0, hn = 0, bz = 0, bn = 0;
    for (let i = 0; i < r.n; i++) { const [, z, s] = ligne(r, i), c = Math.cos(3 / 8 * s * Tb / 4); if (c > 0.5) { hz += z; hn++; } else if (c < -0.5) { bz += z; bn++; } }
    const d = hz / hn - bz / bn; assert.ok(d > 0.6, String(d)); return `<z>haut - <z>bas = ${d.toFixed(3)} (attendu ~ 2 A x 0.85 = 1.3)`;
  });

  // 8. dipole
  const miroirFormule = (a) => { let lo = 0, hi = Math.PI / 2; for (let k = 0; k < 200; k++) { const l = (lo + hi) / 2; if (Math.cos(l) ** 6 > Math.sin(a) ** 2 * Math.sqrt(1 + 3 * Math.sin(l) ** 2)) lo = l; else hi = l; } return lo; };
  ok('dipole : points des lignes sur r = L cos^2(lat), L entier 2..6 (1e-12) ; tangente // B', () => {
    const r = sim('champDipolaire'), nL = Math.floor(0.3 * r.n), vus = new Set();
    for (let i = 0; i < nL; i++) { const [x, y, z] = ligne(r, i), L = (x * x + y * y + z * z) ** 1.5 / (x * x + y * y); const Lr = Math.round(L); assert.ok(Math.abs(L - Lr) < 1e-12 * Lr && Lr >= 2 && Lr <= 6, String(L)); vus.add(Lr); }
    assert.equal(vus.size, 5); assert.ok(r.invariants.ligneDeChamp.mesure < 1e-12, String(r.invariants.ligneDeChamp.mesure));
  });
  ok('dipole : energie Boris < 1e-10, mu < 20 % et adiabatique (B0 x2 -> mu / > 1.6)', () => {
    const a = sim('champDipolaire').invariants, b = sim('champDipolaire', { B0: 2000 }).invariants;
    assert.ok(a.energie.derive < 1e-10); assert.ok(a.momentMagnetique.derive < 0.2, String(a.momentMagnetique.derive));
    assert.ok(a.momentMagnetique.derive > 1.6 * b.momentMagnetique.derive, `${a.momentMagnetique.derive} ${b.momentMagnetique.derive}`);
    return `mu ${a.momentMagnetique.derive.toFixed(3)} (B0 1000) -> ${b.momentMagnetique.derive.toFixed(3)} (B0 2000)`;
  });
  for (const pitch of [40, 60]) ok(`dipole pitch ${pitch} : miroirs symetriques (1 %) et a 5 % de cos^6 = sin^2 a sqrt(1 + 3 sin^2)`, () => {
    const m = sim('champDipolaire', { pitch }).invariants.miroirs, f = miroirFormule(pitch * Math.PI / 180);
    assert.ok(m.rebonds >= 2); assert.ok(Math.abs(m.nord - m.sud) < 0.01 * f); assert.ok(rel(m.nord, f) < 0.05 && rel(m.sud, f) < 0.05, `${m.nord} ${m.sud} ${f}`);
    return `N ${m.nord.toFixed(4)} S ${m.sud.toFixed(4)} formule ${f.toFixed(4)} (${(100 * rel(m.nord, f)).toFixed(1)} %)`;
  });

  // 9. lumiere (relue dans brut)
  for (const ellipticite of [0, 1, -0.5]) ok(`lumiere e = ${ellipticite} : E.B = 0, |E| = c|B|, cB = k x E (1e-12)`, () => {
    const r = sim('ondeLumiere', { ellipticite }), nW = 2 * Math.floor(r.n / 4);
    for (let j = 0; j < nW; j += 2) {
      const E = ligne(r, j), B = ligne(r, j + 1); assert.equal(E[0], B[0]);
      assert.ok(Math.abs(E[1] * B[1] + E[2] * B[2]) < 1e-12); assert.ok(Math.abs(Math.hypot(E[1], E[2]) - Math.hypot(B[1], B[2])) < 1e-12);
      assert.ok(Math.abs(B[1] + E[2]) < 1e-12 && Math.abs(B[2] - E[1]) < 1e-12);
      if (Math.abs(ellipticite) === 1) assert.ok(Math.abs(Math.hypot(E[1], E[2]) - 1) < 1e-12);
    }
    const I = r.invariants; assert.ok(I.orthogonalite.mesure < 1e-12 && I.rapportEB.mesure < 1e-12);
  });
  for (const graine of [1, 2]) ok(`lumiere graine ${graine} : nuage sin^2(theta), <cos^2> = 1/5 a 4 sigma, pas isotrope`, () => {
    const r = sim('ondeLumiere', { graine }), nW = 2 * Math.floor(r.n / 4); let s = 0, N = 0;
    for (let i = nW; i < r.n; i++) { const [x, y, z] = ligne(r, i), q = Math.hypot(x, y, z), u = z / q; assert.ok(Math.abs(q - 1.5 * (1 - u * u)) < 1e-12); s += u * u; N++; }
    const m = s / N, sig = Math.sqrt((3 / 35 - 1 / 25) / N);
    assert.ok(Math.abs(m - 0.2) < 4 * sig && Math.abs(m - 1 / 3) > 4 * sig, `${m} sigma ${sig}`); return `${m.toFixed(4)} vs 0.2 (sigma ${sig.toFixed(4)})`;
  });

  // 10. espace-temps (inversion du boost ici)
  for (const v of [0.5, -0.9]) ok(`Minkowski v = ${v} : s^2 invariant (1e-12), evenements sur le reseau, cone x' = +-t'`, () => {
    const r = sim('diagrammeEspaceTemps', { v }), g = 1 / Math.sqrt(1 - v * v), G = r.params.grille, nG = Math.floor(r.n / 2), nC = Math.floor(r.n / 6); let e = 0;
    for (let i = 0; i < nG; i++) {
      const [xp, tp, z] = ligne(r, i), t = g * (tp + v * xp), x = g * (xp + v * tp), sc = Math.max(1, t * t + x * x);
      e = Math.max(e, Math.abs(tp * tp - xp * xp - (t * t - x * x)) / sc, Math.abs(z * 5 - (t * t - x * x)) / sc);
      const surReseau = [t, x].some((c) => { const k = (c + 5) / 10 * (G - 1); return Math.abs(k - Math.round(k)) < 1e-9; }); assert.ok(surReseau, `${t} ${x}`);
    }
    for (let i = nG; i < nG + nC; i++) { const [xp, tp] = ligne(r, i); assert.ok(Math.abs(Math.abs(xp) - Math.abs(tp)) < 1e-12 * Math.max(1, Math.abs(tp))); }
    assert.ok(e < 1e-12, String(e)); return e.toExponential(2);
  });
  for (const p of [{}, { v: -0.9, vJumeau: 0.6, duree: 7 }]) ok(`jumeaux ${JSON.stringify(p)} : ecart d age = T (1 - sqrt(1 - vJ^2)) (1e-9)`, () => {
    const r = sim('diagrammeEspaceTemps', p), J = r.invariants.jumeaux, T0 = r.params.duree, f = T0 * (1 - Math.sqrt(1 - r.params.vJumeau ** 2));
    assert.ok(Math.abs(J.sedentaire - T0) < 1e-9 && Math.abs(J.mesure - f) < 1e-9, `${J.sedentaire} ${J.mesure} ${f}`); return `${J.mesure.toFixed(10)} vs ${f.toFixed(10)}`;
  });

  // 11. brownien
  for (const graine of [1, 2]) ok(`brownien graine ${graine} : D a 5 % (<r^2> = 6 D t), vitesses de Maxwell-Boltzmann a 5 %`, () => {
    const r = sim('mouvementBrownien', { graine }), I = r.invariants, mb = Math.sqrt(8 / Math.PI);
    assert.ok(rel(I.diffusion.mesure, 0.5) < 0.05, String(I.diffusion.mesure)); assert.ok(rel(I.vitesseMoyenne.mesure, mb) < 0.05 && rel(I.vitesseMoyenne.quadratique, Math.sqrt(3)) < 0.05);
    const L = I.traces.pointsParTrace; for (let p = 0; p * L < r.n; p++) assert.deepEqual(ligne(r, p * L), [0, 0, 0]);
    return `D ${I.diffusion.mesure.toFixed(4)} vs 0.5 ; <v> ${I.vitesseMoyenne.mesure.toFixed(4)} vs ${mb.toFixed(4)}`;
  });
  /* game101 : le sigma DERIVE de la pente = l ecart-type sur 80 graines (petit cas : 400 particules, 50 pas) a 25 % pres
   *   (l incertitude d un ecart-type sur 80 tirages est ~8 % : 25 % = ~3 sigma) */
  ok('brownien : sigma derive de D = ecart-type mesure sur 80 graines', () => {
    const v = []; let sg = 0;
    for (let g = 1; g <= 80; g++) { const d = sim('mouvementBrownien', { graine: g, particules: 400, pas: 50 }).invariants.diffusion; v.push(d.mesure); sg = d.sigma; }
    const m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) * (b - m), 0) / (v.length - 1));
    assert.ok(sg > 0 && Math.abs(sd / sg - 1) < 0.25, `sd ${sd} sigma ${sg}`); return `sd ${sd.toFixed(5)} / sigma ${sg.toFixed(5)} = ${(sd / sg).toFixed(3)}`;
  });
  ok('brownien D = 1.5 : D mesure a 5 %', () => { const d = sim('mouvementBrownien', { D: 1.5, particules: 2500 }).invariants.diffusion.mesure; assert.ok(rel(d, 1.5) < 0.05, String(d)); return d.toFixed(4); });

  // 11b. films et fins (2026-11-01, demande du proprietaire) : disposition MESUREE sur les lignes, jamais supposee
  ok('films : effetTunnel 25 x 60, superposition 12 x 125, GW 63 images (62 x 24 + 12), chaque image a temps constant', () => {
    const cas = [['effetTunnel', {}, 25, 60, 1], ['superpositionQuantique', {}, 12, 125, 2], ['ondeGravitationnelle', {}, 63, null, 2]];
    for (const [id, p, im, par, col] of cas) {
      const r = sim(id, p), f = r.film; assert.equal(f.images, im, id); assert.equal(f.parImage, par, id); assert.equal(f.tailles.reduce((a, x) => a + x, 0), r.n, id);
      for (let k = 0; k < f.images; k++) { const t = ligne(r, f.debuts[k])[col]; for (let i = f.debuts[k]; i < f.debuts[k] + f.tailles[k]; i++) assert.equal(ligne(r, i)[col], t, `${id} image ${k} ligne ${i}`); if (k) assert.ok(t > ligne(r, f.debuts[k - 1])[col], id); }
    }
    const g = sim('ondeGravitationnelle').film; assert.deepEqual(g.tailles.slice(-2), [24, 12]);
    assert.deepEqual(sim('superpositionQuantique', { images: 7 }).film.tailles, [215, 215, 215, 215, 215, 215, 210]);
  });
  ok('fin chuteTrouNoir : r = 0 a la derniere ligne, horizon franchi a la ligne indiquee, tau fini', () => {
    const r = sim('chuteTrouNoir'), f = r.fin, h = f.horizon;
    assert.equal(f.evenement, 'singularity'); assert.equal(f.indice, r.n - 1); assert.ok(Math.abs(f.r) < 1e-12 && rel(f.t, r.invariants.tempsPropreTotal.formule) < 1e-9);
    assert.ok(ligne(r, h.indice)[0] <= 2 && ligne(r, h.indice - 1)[0] > 2 && h.tau < f.t);
    return `horizon ligne ${h.indice}, tau ${h.tau.toFixed(3)} -> ${f.t.toFixed(3)}`;
  });
  ok('fin effetTunnel : split, transmis = mesure de transmission, transmis + reflechi ~ 1', () => {
    const r = sim('effetTunnel'), f = r.fin; assert.equal(f.evenement, 'split'); assert.equal(f.indice, r.n - 1);
    assert.equal(f.transmis, r.invariants.transmission.mesure); assert.ok(Math.abs(f.transmis + f.reflechi + f.reste - 1) < 1e-12 && Math.abs(f.reste) < 1e-3);
  });
  // 12. bornage
  ok('bornage : hors bornes ramene, NaN -> defaut, entiers arrondis, masses multiple de 8, r0 <= rmax', () => {
    assert.equal(sim('ondeGravitationnelle', { cycles: 99 }, { n: 50 }).params.cycles, 4); assert.equal(sim('champDipolaire', { duree: 1e9 }, { n: 50 }).params.duree, 240);
    assert.deepEqual(sim('ondeGravitationnelle', { hPlus: 9, hCroix: NaN, masses: 29.4, cycles: -1 }, { n: 50 }).params, { hPlus: 0.5, hCroix: 0, masses: 32, cycles: 1 });
    assert.deepEqual(sim('courbureEspaceTemps', { M: 'x', rmax: 8, r0: 15 }, { n: 50 }).params, { M: 1, rmax: 8, r0: 8 });
    assert.deepEqual(sim('mouvementBrownien', { particules: 1e9, pas: 3.7, D: -1, kT: Infinity, graine: 2.5 }, { n: 50 }).params, { particules: 4000, pas: 50, D: 0.1, kT: 1, graine: 3 });
    assert.deepEqual(sim('diagrammeEspaceTemps', { v: 2, vJumeau: 1, grille: 100 }, { n: 50 }).params, { v: 0.95, vJumeau: 0.99, duree: 10, grille: 15 });
    assert.throws(() => T.simuler('inconnu'));
  });
  ok('reglagesPhysique : forme reglagesDe, valeur bornee', () => {
    const r = T.reglagesPhysique('effetTunnel', { V0: 1e9 });
    assert.deepEqual(r.map((x) => x.chemin), ['params.k0', 'params.V0', 'params.largeur']);
    assert.deepEqual(r[1], { chemin: 'params.V0', nom: 'V0', min: 0.2, max: 3, valeur: 3 });
  });
  return res;
}

// ---------- banc ----------
const texteSource = readFileSync(SOURCE, 'utf8');
const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, texteSource, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
console.log('\nTEMPS simuler(id) a n = 1500 (mediane de 3) :');
for (const s of T.SYSTEMES) {
  const t = []; for (let k = 0; k < 3; k++) { const a = performance.now(); T.simuler(s.id); t.push(performance.now() - a); }
  t.sort((a, b) => a - b); const ms = t[1];
  console.log(`  ${s.id.padEnd(24)} ${ms.toFixed(1)} ms`);
  assertions++; if (!(ms < 300)) ech.push({ nom: 'temps ' + s.id + ' < 300 ms', det: ms.toFixed(1) });
}

// ---------- mutants (copies dans un dossier temporaire ; l import du moteur pointe vers l original) ----------
const MUTANTS = [
  ['GW : signe du terme croise', 'o[i + 1] = y + (hx / 2 * x - hp / 2 * y) * c;', 'o[i + 1] = y + (-hx / 2 * x - hp / 2 * y) * c;'],
  ['GW : angle de la polarisation x (agit comme +)', 'o[i] = x + (hp / 2 * x + hx / 2 * y) * c;', 'o[i] = x + (hp / 2 * x + hx / 2 * x) * c;'],
  ['chute : facteur de la cycloide (8M -> 2M)', 'const M = 1, r0 = P.r0, A = Math.sqrt(r0 * r0 * r0 / (8 * M))', 'const M = 1, r0 = P.r0, A = Math.sqrt(r0 * r0 * r0 / (2 * M))'],
  ['relativite restreinte : gamma remplace par 1', 'const gammaDe = (v) => 1 / Math.sqrt(1 - v * v);', 'const gammaDe = (v) => 1;'],
  ['tunnel : barriere ignoree', 'V[j] = j >= j0 && j < j0 + cellules ? V0 : 0;', 'V[j] = 0;'],
  ['Lorentz non invariant (signe de x\')', 'o[1] = g * (x - v * t);', 'o[1] = g * (x + v * t);'],
  ['Flamm : z = 2 sqrt(M (r - 2M))', 'const zFlamm = (r, M) => 2 * Math.sqrt(2 * M * (r - 2 * M));', 'const zFlamm = (r, M) => 2 * Math.sqrt(M * (r - 2 * M));'],
  ['superposition : E2 = -1/4', 'const E1 = -1 / 2, E2 = -1 / 8,', 'const E1 = -1 / 2, E2 = -1 / 4,'],
  ['dipole : facteur 3 -> 2 dans B_z', 'b[2] = (r2 - 3 * z * z) * k;', 'b[2] = (r2 - 2 * z * z) * k;'],
  ['brownien : pas de variance D au lieu de 2D', 'sd = Math.sqrt(2 * D)', 'sd = Math.sqrt(D)'],
  ['lumiere : B parallele a E', 'const Bx = (ky * Ez - kz * Ey) / C_SI, By = (kz * Ex - kx * Ez) / C_SI, Bz = (kx * Ey - ky * Ex) / C_SI;', 'const Bx = Ex / C_SI, By = Ey / C_SI, Bz = Ez / C_SI;'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['Math.random injecte', 'alea = mulberry32(P.graine >>> 0), o = {}', 'alea = Math.random, o = {}'],
  ['film : taille commune annoncee meme quand les images different', 'parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null', 'parImage: tailles[0]'],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-invisible-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = texteSource.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`), texte = texteSource.replace(de, vers);
    writeFileSync(f, texte.replace("from './tam-moteur.js'", `from '${moteur}'`));
    let r; try { r = suite(await import(pathToFileURL(f).href), texte); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-invisible-20261101 : ${assertions} assertions OK`);
