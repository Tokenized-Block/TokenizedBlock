// test-tam-grandes-questions-20261101.mjs -- banc de tam-grandes-questions.js (vue TAM, grandes questions).
// Lance : node test-tam-grandes-questions-20261101.mjs
// Chaque verification compare la MESURE du module a la valeur PUBLIEE (source citee) ou a une reference INDEPENDANTE
// recalculee ici avec les fonctions natives de Math ; la tolerance est dans le nom de l assertion.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-grandes-questions.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const rel = (x, y) => Math.abs(x - y) / Math.abs(y);
const HBAR = 1.054571817e-34, C = 299792458, KB = 1.380649e-23, G = 6.6743e-11, MPC = 1e6 * 648000 / Math.PI * 149597870700;
const GYR = 1e9 * 365.25 * 86400, AL = C * 365.25 * 86400;

/* references independantes (cote banc, Math natif) */
const casimirRef = (d) => Math.PI ** 2 * HBAR * C / (240 * d ** 4);
function simpsonRef(f, a, b, m) { const h = (b - a) / m; let s = f(a) + f(b); for (let i = 1; i < m; i++) s += f(a + i * h) * (i % 2 ? 4 : 2); return s * h / 3; }
function ripRef(w, Om, H0) { /* t_rip - t0 en Gyr : int_1^inf da / (a H), en v = ln a, Math.exp natif */
  const e = -(1 + w), f = (u) => 1 / Math.sqrt(Om * Math.exp(-3 * u) + (1 - Om) * Math.exp(3 * e * u));
  return (simpsonRef(f, 0, 20, 20000) + Math.exp(-1.5 * e * 20) / (1.5 * e * Math.sqrt(1 - Om))) * MPC / 1000 / GYR / H0;
}
function horizonRef(H0, Om, aMin = 0) { /* distance comobile (Mpc) avec radiation Fixsen 2009 + N_eff 3.046, Math natif */
  const H = H0 * 1000 / MPC, rhoC = 3 * H * H / (8 * Math.PI * G), kT = KB * 2.7255;
  const Or = (Math.PI ** 2 / 15 * kT ** 4 / (HBAR ** 3 * C ** 5)) / rhoC * (1 + 7 / 8 * (4 / 11) ** (4 / 3) * 3.046), OL = 1 - Om - Or;
  return C / 1000 / H0 * simpsonRef((s) => 2 * s / Math.sqrt(Or + Om * s * s + OL * s ** 8), Math.sqrt(aMin), 1, 200000);
}
let zeta3 = 0; for (let k = 1e6; k >= 1; k--) zeta3 += 1 / (k * k * k); zeta3 += 1 / (2e12);

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const sim = (id, p, o) => T.simuler(id, p, o);
  const I = (id, p, o) => { const r = sim(id, p, o); assert.equal(r.bornee, true, r.raison); return r.invariants; };

  // 1. forme, bornes, determinisme
  const IDS = ['videQuantique', 'bigRip', 'fauxVide', 'centreTerre', 'versMars', 'zeroAbsolu', 'tailleUnivers', 'nombrePi', 'calendrierCosmique'];
  ok('SYSTEMES gele, 9 systemes attendus', () => { assert.ok(Object.isFrozen(T.SYSTEMES)); assert.deepEqual(T.SYSTEMES.map((s) => s.id), IDS); assert.ok(T.SYSTEMES.every((s) => Object.isFrozen(s) && Object.isFrozen(s.params) && Object.isFrozen(s.bornes))); });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, 3 <= D <= 12, brut n*D fini, points null, lyapunov null`, () => {
      const r = sim(s.id);
      assert.equal(r.bornee, true, r.raison); assert.equal(r.D, s.D); assert.ok(s.D >= 3 && s.D <= 12); assert.equal(r.n, 1500);
      assert.ok(r.brut instanceof Float64Array); assert.equal(r.brut.length, 1500 * s.D); assert.ok(r.brut.every(Number.isFinite)); assert.equal(r.points, null);
      assert.ok(typeof s.phrase === 'string' && s.phrase.length > 80 && s.nom && s.science); assert.equal(!!r.nuage, !!s.nuage);
      assert.equal(r.lyapunov, null); assert.equal(typeof r.uniteLyapunov, 'string');
      if (r.film) { assert.ok(Number.isInteger(r.film.images) && Number.isInteger(r.film.parImage) && r.film.images > 1 && r.film.images * r.film.parImage <= r.n); }
      const brutMin = Math.min(...r.brut), brutMax = Math.max(...r.brut); assert.ok(brutMax > brutMin, 'brut constant');
    });
    ok(`${s.id} : determinisme (octets identiques)`, () => assert.ok(octets(sim(s.id).brut).equals(octets(sim(s.id).brut))));
    ok(`${s.id} : n = 7 et n = 2 -> n*D valeurs finies`, () => { for (const n of [7, 2]) { const r = sim(s.id, {}, { n }); assert.equal(r.bornee, true, r.raison); assert.equal(r.brut.length, n * s.D); assert.ok(r.brut.every(Number.isFinite)); if (r.film) assert.ok(r.film.images * r.film.parImage <= n); } });
    ok(`${s.id} : bornage (hors bornes ramene, NaN -> defaut) et reglagesPhysique`, () => {
      const haut = {}, bas = {}, nan = {}; for (const k of Object.keys(s.params)) { haut[k] = 1e12; bas[k] = -1e12; nan[k] = NaN; }
      const rh = sim(s.id, haut, { n: 50 }), rb = sim(s.id, bas, { n: 50 }), rn = sim(s.id, nan, { n: 50 });
      for (const k of Object.keys(s.params)) { assert.equal(rh.params[k], s.bornes[k][1], k); assert.equal(rb.params[k], s.bornes[k][0], k); assert.equal(rn.params[k], s.params[k], k); }
      assert.ok(rh.bornee && rb.bornee && rn.bornee);
      const g = T.reglagesPhysique(s.id, haut); assert.equal(g.length, Object.keys(s.params).length); assert.ok(g.every((x) => x.valeur === x.max && x.chemin === 'params.' + x.nom));
    });
  }

  ok('bornage : parametres entiers arrondis (modes 7.6 -> 8, termesMachin 9.4 -> 9, traversees 2.5 -> 3)', () => {
    assert.equal(sim('videQuantique', { modes: 7.6 }, { n: 10 }).params.modes, 8); assert.equal(sim('nombrePi', { termesMachin: 9.4 }, { n: 10 }).params.termesMachin, 9);
    assert.equal(sim('centreTerre', { traversees: 2.5 }, { n: 10 }).params.traversees, 3);
  });

  // 2. Casimir (Casimir 1948)
  const vq = I('videQuantique');
  ok('casimir : d = 1 micron -> 1.3 mPa publie, a 1 %', () => { assert.ok(rel(vq.pression.mesure, 1.3e-3) < 0.01, String(vq.pression.mesure)); return (vq.pression.mesure * 1e3).toFixed(5) + ' mPa'; });
  for (const d of [0.05, 0.3, 1, 7, 20]) ok(`casimir : somme de modes = pi^2 hbar c / (240 d^4) a 1e-4 (d = ${d} um)`, () => { const v = I('videQuantique', { d }, { n: 10 }).pression; assert.ok(rel(v.mesure, casimirRef(d * 1e-6)) < 1e-4 && rel(v.formule, casimirRef(d * 1e-6)) < 1e-12, `${v.mesure} ${v.formule}`); return v.ecart.toExponential(2); });
  ok('casimir : loi d^-4, P(d) / P(2d) = 16 a 1e-4', () => { assert.ok(rel(vq.loiEnPuissance.rapportD_2D, 16) < 1e-4, String(vq.loiEnPuissance.rapportD_2D)); });
  ok('casimir : dedans, seuls les k entiers (k d / pi) ; dehors, k continu', () => {
    const r = sim('videQuantique'), b = r.brut; let entiers = true, nonEntier = 0;
    for (let i = 0; i < r.n; i++) { const x = b[3 * i], k = b[3 * i + 1]; if (x >= 0 && x <= 1) { if (Math.abs(k - Math.round(k)) > 1e-12) entiers = false; } else if (Math.abs(k - Math.round(k)) > 1e-3) nonEntier++; }
    assert.ok(entiers && nonEntier > 400, String(nonEntier));
  });

  // 3. Big Rip (Caldwell, Kamionkowski & Weinberg 2003)
  for (const w of [-1.01, -1.05, -1.1]) ok(`bigRip w=${w} : t_rip - t0 = 2/(3|1+w| H0 sqrt(1-Om)) a 2 %`, () => { const v = I('bigRip', { w, Om: 0.3, H0: 70 }, { n: 20 }).tempsAvantRip; assert.ok(v.ecart < 0.02, String(v.ecart)); return `${v.mesure.toFixed(2)} vs ${v.formule.toFixed(2)} Gyr (${(100 * v.ecart).toFixed(2)} %)`; });
  ok('bigRip : formule = 2/(3|1+w| H0 sqrt(1-Om)) exactement (1e-9)', () => { const v = I('bigRip', { w: -1.3 }, { n: 20 }).tempsAvantRip, ref = 2 / (3 * 0.3 * Math.sqrt(0.7)) * MPC / 1000 / GYR / 70; assert.ok(rel(v.formule, ref) < 1e-9, `${v.formule} ${ref}`); });
  for (const w of [-1.01, -1.5, -2]) ok(`bigRip w=${w} : integrale mesuree = reference independante a 1e-6`, () => { const v = I('bigRip', { w }, { n: 20 }).tempsAvantRip, ref = ripRef(w, 0.3, 70); assert.ok(rel(v.mesure, ref) < 1e-6, `${v.mesure} ${ref}`); });
  ok('bigRip w=-1.5 : CKW 2003 annoncent ~22 Gyr ; mesure a 3 % (la formule neglige la matiere)', () => { const v = I('bigRip').tempsAvantRip; assert.ok(rel(v.mesure, 22) < 0.03); return v.mesure.toFixed(2) + ' Gyr'; });
  ok('bigRip : fin = big rip, apres aujourd hui ; traces dans le temps croissant', () => {
    const r = sim('bigRip'); assert.equal(r.fin.evenement, 'big rip'); assert.equal(r.fin.indice, r.n - 1);
    assert.ok(Math.abs(r.fin.t - (r.invariants.ageAujourdhui.valeur + r.invariants.tempsAvantRip.mesure)) < 1e-9);
    const m = Math.floor(1500 / 12); for (let j = 1; j < m; j++) assert.ok(r.brut[3 * j + 2] > r.brut[3 * (j - 1) + 2]);
    assert.ok(r.invariants.dernierInstantDessine.avantRip > 0 && r.invariants.dernierInstantDessine.avantRip < 0.002 * r.invariants.tempsAvantRip.mesure);
  });

  // 4. faux vide (Coleman 1977 ; Kolmogorov-Johnson-Mehl-Avrami)
  ok('fauxVide : formule Avrami = 1 - exp(-(4 pi/3) G c^3 t^4 / 4) (1e-12)', () => { const v = I('fauxVide', {}, { n: 20 }).fractionVraiVide, Ga = 400; v.temps.forEach((t, k) => assert.ok(Math.abs(v.avrami[k] - (1 - Math.exp(-(4 * Math.PI / 3) * Ga * t ** 4 / 4))) < 1e-12)); });
  ok('fauxVide : vitesse de paroi -> c (bulles agees > 0.999 c)', () => { const v = I('fauxVide', {}, { n: 20 }).vitesseParoi; assert.ok(v.plusAncienne > 0.999 && v.minBullesAgees > 0.99, JSON.stringify(v)); return v.plusAncienne.toFixed(6) + ' c'; });
  ok('fauxVide : 10 graines, taux 2000 : fraction mesuree = Avrami (R0 -> 0) a 3 erreurs-types + 0.01', () => {
    const d = []; for (let g = 1; g <= 10; g++) { const v = I('fauxVide', { taux: 2000, graine: g }, { n: 20 }).fractionVraiVide; d.push(v.mesure.reduce((a, x, k) => a + x - v.avrami[k], 0) / v.mesure.length); }
    const m = d.reduce((a, b) => a + b, 0) / d.length, se = Math.sqrt(d.reduce((a, b) => a + (b - m) ** 2, 0) / (d.length - 1) / d.length);
    assert.ok(Math.abs(m) < 3 * se + 0.01, `${m} ${se}`); return `ecart moyen ${m.toFixed(4)} +- ${se.toFixed(4)}`;
  });
  ok('fauxVide : film monotone (le vrai vide ne recule jamais) et la tranche remplie a > 80 % a la fin (3-D : 98 % attendus ; une tranche de 125 points fluctue)', () => {
    const r = sim('fauxVide'), { images, parImage } = r.film; let avant = -1;
    for (let k = 0; k < images; k++) { let c = 0; for (let i = 0; i < parImage; i++) { const row = k * parImage + i, z = r.brut[3 * row + 2]; if (z > 0) c++; if (k) { const p = (k - 1) * parImage + i; if (r.brut[3 * p + 2] > 0) assert.ok(z > 0); } } assert.ok(c >= avant); avant = c; }
    assert.ok(avant / parImage > 0.8, String(avant / parImage));
  });

  // 5. centre de la Terre (PREM, Dziewonski & Anderson 1981 ; Klotz 2015)
  const ct = I('centreTerre');
  ok('terre : g(surface) = 9.81 m/s^2 a 1 %', () => { assert.ok(rel(ct.gSurface.valeur, 9.81) < 0.01); return ct.gSurface.valeur.toFixed(4); });
  /* NASA NSSDC Earth Fact Sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html, lu le 2026-11-01 : « Mass (10^24 kg) 5.9722 » */
  ok('terre : masse PREM = 5.9722e24 kg (NASA fact sheet) a 0.5 %', () => { assert.ok(rel(ct.masse.valeur, 5.9722e24) < 0.005); return ct.masse.valeur.toExponential(4); });
  ok('terre : g max ~10.7 m/s^2 (a 1 %) a la frontiere noyau-manteau 3480 km (+- 30 km)', () => { assert.ok(rel(ct.gMax.valeur, 10.68) < 0.01 && Math.abs(ct.gMax.rayonKm - 3480) <= 30, JSON.stringify(ct.gMax)); return `${ct.gMax.valeur.toFixed(3)} a ${ct.gMax.rayonKm} km`; });
  ok('terre : densite uniforme, periode 84.4 min a 1 % ; integration = pi sqrt(R^3/GM) a 1e-6', () => { const u = ct.traverseeUniforme; assert.ok(rel(2 * u.mesure, 84.4) < 0.01 && rel(u.mesure, u.formule) < 1e-6); return (2 * u.mesure).toFixed(3) + ' min'; });
  ok('terre : PREM aller simple = 38 min 11 s (Klotz 2015) a 5 %', () => { assert.ok(rel(ct.traverseePREM.mesure, 38 + 11 / 60) < 0.05); return ct.traverseePREM.mesure.toFixed(3) + ' min'; });
  ok('terre : trajectoire bornee |x| <= R, depart au repos a la surface', () => { const r = sim('centreTerre'); for (let i = 0; i < r.n; i++) assert.ok(Math.abs(r.brut[4 * i]) <= 1 + 1e-9); assert.equal(r.brut[0], 1); assert.equal(r.brut[1], 0); });

  // 6. vers Mars (Hohmann 1925)
  const vm = I('versMars');
  ok('mars : duree du transfert = 259 jours a 1 % ; integration = formule a 1e-6', () => { assert.ok(rel(vm.dureeTransfert.mesure, 259) < 0.01 && vm.dureeTransfert.ecart < 1e-6); return vm.dureeTransfert.mesure.toFixed(2) + ' j'; });
  ok('mars : duree = pi sqrt(((1+1.524)/2)^3 / k^2) (reference, 1e-9)', () => { const ref = Math.PI * Math.sqrt(((1 + 1.524) / 2) ** 3) / 0.01720209895; assert.ok(rel(vm.dureeTransfert.formule, ref) < 1e-9, `${vm.dureeTransfert.formule} ${ref}`); });
  ok('mars : periode synodique = 780 jours a 1 %', () => { assert.ok(rel(vm.periodeSynodique.valeur, 780) < 0.01); return vm.periodeSynodique.valeur.toFixed(2) + ' j'; });
  ok('mars : angle de phase au depart = 44 deg a 1 deg', () => { assert.ok(Math.abs(vm.anglePhase.valeur - 44) < 1); return vm.anglePhase.valeur.toFixed(3) + ' deg'; });
  ok('mars : film : vaisseau part de la Terre et arrive sur Mars (1e-6 au)', () => {
    const r = sim('versMars'), b = r.brut, k = r.film.images - 1;
    assert.ok(Math.hypot(b[0] - b[3], b[1] - b[4]) < 1e-6); assert.ok(Math.hypot(b[9 * k] - b[9 * k + 6], b[9 * k + 1] - b[9 * k + 7]) < 1e-6); /* image k : lignes 3k (vaisseau), 3k+1 (Terre), 3k+2 (Mars) */
  });

  // 7. Bose-Einstein (Bagnato, Pritchard & Kleppner 1987)
  ok('bec : zeta(3) interne = somme directe a 1e-14 ; Tc = (hbar w / k)(N / zeta3)^(1/3) a 1e-9', () => {
    const v = I('zeroAbsolu', {}, { n: 10 }); assert.ok(Math.abs(v.fugacite.zeta3 - zeta3) < 1e-14);
    const ref = HBAR * 2 * Math.PI * 100 / KB * Math.cbrt(1e6 / zeta3) * 1e9; assert.ok(rel(v.temperatureCritique.Tc_nK, ref) < 1e-9, `${v.temperatureCritique.Tc_nK} ${ref}`); return ref.toFixed(2) + ' nK';
  });
  for (const t of [0.3, 0.5, 0.7, 0.9]) ok(`bec T/Tc=${t} : formule = 1 - (T/Tc)^3 (1e-12) ; statistique exacte = 1 - t^3 a 0.02 et = Dalfovo et al. 1999 eq. (19) a 0.003`, () => {
    const v = I('zeroAbsolu', { T: t }, { n: 10 }).fractionCondensat, f = 1 - t ** 3;
    /* correction de taille finie : Dalfovo, Giorgini, Pitaevskii & Stringari (1999), RMP 71, 463, eq. (19), lue le 2026-11-01 sur
       https://ar5iv.labs.arxiv.org/html/cond-mat/9806038 : N0/N = 1 - (T/Tc0)^3 - [3 wbar zeta(2) / (2 w_ho zeta(3)^(2/3))] (T/Tc0)^2 N^(-1/3),
       wbar = moyenne arithmetique, w_ho = moyenne geometrique des frequences ; piege isotrope : wbar / w_ho = 1.
       Coefficient = 3 zeta(2) / (2 zeta(3)^(2/3)), zeta(2) = pi^2 / 6 : CALCULE ici, aucun chiffre recopie (eq. (20) : 0.73 = zeta(2) / (2 zeta(3)^(2/3))). */
    const coefTaille = 3 * (Math.PI ** 2 / 6) / (2 * zeta3 ** (2 / 3)), fc = f - coefTaille * t * t / Math.cbrt(1e6);
    assert.ok(Math.abs(v.formule - f) < 1e-12 && Math.abs(v.mesure - f) < 0.02 && Math.abs(v.mesure - fc) < 0.003, `${v.mesure} ${f} ${fc}`); return `${v.mesure.toFixed(4)} vs ${f.toFixed(4)}`;
  });
  ok('bec T/Tc=1.5 : pas de condensat (fraction < 1e-3)', () => { assert.ok(I('zeroAbsolu', { T: 1.5 }, { n: 10 }).fractionCondensat.mesure < 1e-3); });
  ok('bec : n = 20000 atomes tires, fraction echantillon = fraction exacte a 4 sigma ; pic central present', () => {
    const r = sim('zeroAbsolu', { T: 0.6 }, { n: 20000 }), v = r.invariants.fractionCondensat, s = Math.sqrt(v.mesure * (1 - v.mesure) / 20000);
    assert.ok(Math.abs(v.echantillon - v.mesure) < 4 * s, `${v.echantillon} ${v.mesure}`);
    let c = 0; for (let i = 0; i < r.n; i++) if (Math.hypot(r.brut[3 * i], r.brut[3 * i + 1], r.brut[3 * i + 2]) < 2) c++; assert.ok(c / r.n > 0.9 * v.mesure, String(c / r.n));
  });

  // 8. taille de l univers (Planck 2018)
  const tu = I('tailleUnivers');
  ok('univers : rayon observable 46.5 Gal a 2 %', () => { assert.ok(rel(tu.rayonObservable.Gal, 46.5) < 0.02); return tu.rayonObservable.Gal.toFixed(3) + ' Gal'; });
  ok('univers : rayon observable 14.3 Gpc a 2 %', () => { assert.ok(rel(tu.rayonObservable.Gpc, 14.3) < 0.02); return tu.rayonObservable.Gpc.toFixed(3) + ' Gpc'; });
  ok('univers : distance comobile a z = 1 = 3.4 Gpc a 2 %', () => { assert.ok(rel(tu.distanceZ1.Gpc, 3.4) < 0.02); return tu.distanceZ1.Gpc.toFixed(4) + ' Gpc'; });
  ok('univers : rayon et D_C(z=1) = integrale independante a 1e-5', () => { assert.ok(rel(tu.rayonObservable.Gpc, horizonRef(67.36, 0.3153) / 1000) < 1e-5); assert.ok(rel(tu.distanceZ1.Gpc, horizonRef(67.36, 0.3153, 0.5) / 1000) < 1e-5); });
  ok('univers : age = 13.8 Gyr a 1 %', () => { assert.ok(rel(tu.age.Gyr, 13.8) < 0.01); return tu.age.Gyr.toFixed(3) + ' Gyr'; });
  ok('univers : points dans le disque de la derniere diffusion, temps de regard en arriere dans [0, age]', () => { const r = sim('tailleUnivers'); for (let i = 0; i < r.n; i++) { const d = Math.hypot(r.brut[3 * i], r.brut[3 * i + 1]); assert.ok(d <= tu.rayonObservable.Gpc * (1 + 1e-9)); assert.ok(r.brut[3 * i + 2] >= -1e-9 && r.brut[3 * i + 2] <= tu.age.Gyr + 1e-9); } });

  // 9. pi
  ok('pi : Machin atteint 1e-12 en 8 a 10 termes', () => { const v = I('nombrePi', {}, { n: 10 }).machin; assert.ok(v.termesPour1e12 >= 8 && v.termesPour1e12 <= 10); return v.termesPour1e12 + ' termes'; });
  for (const N of [1000, 100000]) ok(`pi : Leibniz N = ${N} : N * erreur = 1 a 1e-3 (erreur ~ 1/N pour 4 sum)`, () => { const v = I('nombrePi', { termesLeibniz: N }, { n: 10 }).leibniz; assert.ok(Math.abs(v.NfoisErreur - 1) < 1e-3, String(v.NfoisErreur)); });
  ok('pi : Monte-Carlo, 200 graines, N = 1500 : RMS(erreur) sqrt(N) = sqrt(pi(4-pi)) a 15 %', () => {
    let s = 0; for (let g = 1; g <= 200; g++) { const e = I('nombrePi', { graine: g }, { n: 1500 }).monteCarlo.erreur; s += e * e; }
    const v = Math.sqrt(s / 200) * Math.sqrt(1500), ref = Math.sqrt(Math.PI * (4 - Math.PI)); assert.ok(rel(v, ref) < 0.15, `${v} ${ref}`); return `${v.toFixed(3)} vs ${ref.toFixed(3)}`;
  });

  // 10. calendrier cosmique
  const cc = I('calendrierCosmique');
  /* valeurs sources (voir les commentaires du module) : Homo sapiens 315 kyr (Richter et al. 2017), Soleil 4567.30 Myr (Connelly et al. 2012),
     age de l univers 13.797 Gyr (Planck 2018 VI, Table 2, TT,TE,EE+lowE+lensing) */
  ok('calendrier : ageUnivers par defaut = 13.797 Gyr (Planck 2018 VI Table 2)', () => { assert.equal(T.SYSTEMES.find((s) => s.id === 'calendrierCosmique').params.ageUnivers, 13.797); });
  ok('calendrier : Homo sapiens (315 kyr) = 315e3 / 13.797e9 * 525600 min avant minuit le 31 dec (1e-9), 23:4x', () => { const ref = 315e3 / 13.797e9 * 365 * 1440; assert.ok(rel(cc.humains.minutesAvantMinuit, ref) < 1e-9 && cc.humains.date.startsWith('Dec 31 23:4'), `${cc.humains.minutesAvantMinuit} ${ref}`); return cc.humains.minutesAvantMinuit.toFixed(2) + ' min, ' + cc.humains.date; });
  ok('calendrier : Soleil (4567.30 Myr) = 365 (1 - 4.5673 / 13.797) jours (1e-9), debut septembre', () => { const ref = 365 * (1 - 4567.30e6 / 13.797e9); assert.ok(rel(cc.soleil.jour, ref) < 1e-9 && cc.soleil.date.startsWith('Sep '), `${cc.soleil.jour} ${ref}`); return cc.soleil.date; });
  ok('calendrier : evenements dans l ordre, Big Bang le 1er janvier 00:00', () => { const e = cc.evenements; assert.equal(e[0].date, 'Jan 1 00:00'); for (let i = 1; i < e.length; i++) assert.ok(e[i].jour > e[i - 1].jour); });
  ok('calendrier : ageUnivers aux bornes (13.5 et 14) -> tous les evenements dans l annee [0, 365], dans l ordre', () => {
    for (const ageUnivers of [13.5, 14]) { const e = I('calendrierCosmique', { ageUnivers }, { n: 50 }).evenements; for (let i = 0; i < e.length; i++) { assert.ok(e[i].jour >= 0 && e[i].jour <= 365, `${ageUnivers} ${e[i].nom} ${e[i].jour}`); if (i) assert.ok(e[i].jour > e[i - 1].jour, `${ageUnivers} ${e[i].nom}`); } }
  });
  ok('calendrier : premieres etoiles 300 Myr apres le Big Bang (milieu de 250-350 Myr, Laporte et al. 2021 via sci.news)', () => { const e = cc.evenements.find((x) => x.nom === 'First stars'); assert.ok(Math.abs(e.ageAnnees - (13.797e9 - 0.3e9)) < 1); });
  return res;
}

// ---------- banc ----------
const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
const src = readFileSync(SOURCE, 'utf8');
const scan = (nom, f) => { assertions++; let c = false; try { c = f() !== false; } catch { c = false; } console.log((c ? 'OK    ' : 'ECHEC ') + nom); if (!c) ech.push({ nom }); };
scan('source : aucune fonction Math transcendante ni Math.random', () => !/Math\.(sin|cos|tan|exp|log|log10|log2|log1p|expm1|pow|atan|atan2|asin|acos|sinh|cosh|tanh|hypot|cbrt|random)\b/.test(src));
scan('source : pas de DOM, reseau, horloge', () => !/\b(document|window|fetch|Date\.now|performance\.now|new Date)\b/.test(src));
scan('source : aucune mention de YouTube', () => !/youtube|youtu\.be/i.test(src));
// REGLE : aucun chiffre cite « de m-emoire » ; chaque valeur publiee est copiee d une source lue (URL en commentaire).
//   Seules les lignes portant le mot REGLE peuvent nommer le marqueur ; le motif ci-dessous ne se reconnait pas lui-meme.
const marqueurs = (texte) => texte.split('\n').filter((l) => /m[eé]moire|mem[o]ry/i.test(l) && !l.includes('REGLE'));
const banc = readFileSync(fileURLToPath(import.meta.url), 'utf8');
scan('source et banc : aucun marqueur de valeur non sourcee (hors ligne REGLE)', () => { const m = [...marqueurs(src), ...marqueurs(banc)]; if (m.length) console.log('    ' + m.join('\n    ')); return m.length === 0; });

// ---------- temps ----------
console.log('\nTEMPS (n = 1500, defaut puis pire cas) :');
const PIRE = { fauxVide: { taux: 5000, R0: 0.001 }, centreTerre: { traversees: 6 }, zeroAbsolu: { T: 2, atomes: 1e7 }, bigRip: { w: -1.01 }, videQuantique: { d: 0.05, modes: 24 }, nombrePi: { termesLeibniz: 100000 } };
for (const s of T.SYSTEMES) {
  const mes = (p) => { const t0 = performance.now(); const r = T.simuler(s.id, p); const dt = performance.now() - t0; return [dt, r.bornee]; };
  const [a, ba] = mes({}), [b, bb] = mes(PIRE[s.id] || {});
  console.log(`  ${s.id.padEnd(20)} ${a.toFixed(1).padStart(7)} ms   pire ${b.toFixed(1).padStart(7)} ms`);
  assertions++; if (!(a < 300 && b < 300 && ba && bb)) ech.push({ nom: 'temps ' + s.id, det: `${a} ${b}` });
}

// ---------- mutants (copies dans un dossier temporaire ; l import du moteur pointe vers l original) ----------
const MUTANTS = [
  ['casimir : exposant d^4 -> d^3 dans la formule', 'PI * PI * HBAR * C / (240 * d * d * d * d)', 'PI * PI * HBAR * C / (240 * d * d * d)'],
  ['casimir : extrapolation de Richardson retiree', 'return (4 * pressionModes(d, l / 2) - pressionModes(d, l)) / 3;', 'return pressionModes(d, l);'],
  ['big rip : facteur 2/3 -> 1/3', 'const formule = 2 / (3 * eps * Math.sqrt(OL)) * tH;', 'const formule = 1 / (3 * eps * Math.sqrt(OL)) * tH;'],
  ['PREM : densite du noyau externe 12.5815 -> 11.5815', '[3480, 12.5815,', '[3480, 11.5815,'],
  ['Hohmann : demi-grand axe (r1 + r2) / 2 -> / 1.9', 'at = (r1 + r2) / 2,', 'at = (r1 + r2) / 1.9,'],
  ['BEC : exposant 3 -> 2', 't < 1 ? 1 - t * t * t : 0', 't < 1 ? 1 - t * t : 0'],
  ['faux vide : paroi a c/2', 'v = b.t + (r2 > R0 * R0 ? Math.sqrt(r2 - R0 * R0) : 0)', 'v = b.t + 2 * (r2 > R0 * R0 ? Math.sqrt(r2 - R0 * R0) : 0)'],
  ['univers : neutrinos retires de la radiation', 'powD(4 / 11, 4 / 3) * 3.046)', 'powD(4 / 11, 4 / 3) * 0)'],
  ['calendrier : Homo sapiens a 3 Myr', "['Homo sapiens', 315e3]", "['Homo sapiens', 3e6]"],
  ['calendrier : premieres etoiles en age absolu 13.6 Gyr (depasse ageUnivers = 13.5)', "['First stars', { apresBigBang: 0.3e9 }]", "['First stars', 13.6e9]"],
  ['calendrier : age de l univers par defaut 13.8 (non source)', 'params: { ageUnivers: 13.797 }', 'params: { ageUnivers: 13.8 }'],
  /* « bornage retire » n est PAS un mutant ici : sans bornes, termesLeibniz = 1e12 tourne des heures (le banc pendrait) ;
     le bornage est verifie directement par les assertions de bornage */
  ['bornage : entiers non arrondis', 'if ((ENTIERS[id] || []).includes(k)) v = Math.round(v);', ''],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-gq-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`);
    writeFileSync(f, src.replace(de, vers).replace("from './tam-moteur.js'", `from '${moteur}'`));
    let r; try { r = suite(await import(pathToFileURL(f).href)); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-grandes-questions-20261101 : ${assertions} assertions OK`);
