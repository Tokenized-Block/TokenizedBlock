// test-tam-cosmos-20261101.mjs -- banc de tam-cosmos.js (vue COSMOS, non frappable) + mutants sur COPIES.
// Lancer : node test-tam-cosmos-20261101.mjs
// Chaque verification compare une valeur CALCULEE par la simulation a une valeur connue (formule fermee ou publiee),
// tolerance annoncee dans le nom de l assertion (mesurees le 2026-11-01, puis marge).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-cosmos.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const rel = (x, y) => Math.abs(x - y) / Math.abs(y);

/* reference INDEPENDANTE (fonctions natives, cote banc seulement) : ISCO de Bardeen-Press-Teukolsky 1972 */
function iscoRef(a, sens) {
  const Z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a)), Z2 = Math.sqrt(3 * a * a + Z1 * Z1);
  return 3 + Z2 - sens * Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2));
}

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const sim = (id, p, o) => T.simuler(id, p, o);
  const I = (id, p) => { const r = sim(id, p); assert.equal(r.bornee, true, r.raison); return r.invariants; };
  /* J : comme I mais une panne devient un objet vide (l assertion qui le lit echoue seule, la suite continue) */
  const J = (id, p) => { try { return I(id, p); } catch (e) { return { erreur: e.message }; } };

  // 1. forme, bornes, determinisme
  ok('SYSTEMES gele, 11 systemes', () => { assert.ok(Object.isFrozen(T.SYSTEMES)); assert.equal(T.SYSTEMES.length, 11); assert.ok(T.SYSTEMES.every((s) => Object.isFrozen(s) && Object.isFrozen(s.params) && Object.isFrozen(s.bornes))); });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, 3 <= D <= 12, brut n*D fini, points null`, () => {
      const r = sim(s.id);
      assert.equal(r.bornee, true, r.raison); assert.equal(r.D, s.D); assert.ok(s.D >= 3 && s.D <= 12); assert.equal(r.n, 1500);
      assert.ok(r.brut instanceof Float64Array); assert.equal(r.brut.length, 1500 * s.D); assert.ok(r.brut.every(Number.isFinite)); assert.equal(r.points, null);
      assert.ok(typeof s.phrase === 'string' && s.phrase.length > 60 && s.nom && s.science); assert.equal(!!r.nuage, !!s.nuage);
      assert.ok(r.lyapunov === null || Number.isFinite(r.lyapunov)); assert.equal(typeof r.uniteLyapunov, 'string');
    });
    ok(`${s.id} : determinisme (octets identiques)`, () => assert.ok(octets(sim(s.id).brut).equals(octets(sim(s.id).brut))));
    ok(`${s.id} : n = 7 -> 7*D valeurs`, () => { const r = sim(s.id, {}, { n: 7 }); assert.equal(r.bornee, true, r.raison); assert.equal(r.brut.length, 7 * s.D); });
  }

  // 2. lumiere autour d un trou noir
  const lu = J('lumiereTrouNoir');
  ok('lumiere : b critique mesure (bissection) = 3 sqrt(3) M a 1e-6', () => { const b = lu.bCritique; assert.ok(rel(b.mesure, 3 * Math.sqrt(3)) < 1e-6, String(b.mesure)); return b.mesure.toFixed(9); });
  ok('lumiere : rayon rasant (b = 1.000001 b_c) : r min = 3M a 0.5 %, >= 2 tours', () => { const s = lu.spherePhotons; assert.ok(rel(s.mesure, 3) < 0.005 && s.tours >= 2, JSON.stringify(s)); return `r ${s.mesure.toFixed(4)} M, ${s.tours.toFixed(2)} tours`; });
  ok('lumiere : b = 4 < b_c capture ; b = 5.2 > b_c echappe apres > 1 tour', () => { assert.equal(lu.rayon1.issue, 'capture'); assert.equal(lu.rayon2.issue, 'echappe'); assert.ok(lu.rayon2.tours > 1); return lu.rayon2.tours.toFixed(3) + ' tours'; });
  ok('lumiere : b = b_c (1 - 1e-3) capture, b_c (1 + 1e-3) echappe', () => {
    const bc = 3 * Math.sqrt(3), r = I('lumiereTrouNoir', { b1: bc * (1 - 1e-3), b2: bc * (1 + 1e-3) }); assert.equal(r.rayon1.issue, 'capture'); assert.equal(r.rayon2.issue, 'echappe');
  });
  ok('lumiere : champ faible, deviation = 4M/b a 2 % (b = 200) et 0.5 % (b = 1000)', () => {
    const [a, b] = lu.champFaible; assert.ok(a.ecart < 0.02 && b.ecart < 0.005, JSON.stringify(lu.champFaible)); return `${(100 * a.ecart).toFixed(2)} % / ${(100 * b.ecart).toFixed(2)} %`;
  });
  ok('lumiere : premiere integrale b^2(u\'^2 + u^2 - 2u^3) = 1 a 1e-9 sur les 4 rayons', () => { for (let k = 1; k <= 4; k++) { const v = lu['integraleRayon' + k]; assert.ok(Math.abs(v.debut - 1) < 1e-9 && v.derive < 1e-9, k + ' ' + JSON.stringify(v)); } });

  // 3. Kerr
  for (const [a, sens] of [[0, 1], [0.5, 1], [0.9, 1], [0.99, 1], [0.9, -1], [0.5, -1]]) ok(`kerr a=${a} ${sens > 0 ? 'pro' : 'retro'} : ISCO mesure (min E circulaire) = Bardeen a 1e-6`, () => {
    const v = I('kerr', { a, r0: 12, inclinaison: sens > 0 ? 0 : 180, tours: 2 }, { n: 50 }).isco, ref = iscoRef(a, sens);
    assert.ok(rel(v.mesure, ref) < 1e-6 && rel(v.formule, ref) < 1e-12, `${v.mesure} ${v.formule} ${ref}`); return `${v.mesure.toFixed(6)} vs ${ref.toFixed(6)}`;
  });
  ok('kerr a=0 : ISCO = 6M', () => assert.ok(Math.abs(I('kerr', { a: 0, tours: 2 }).isco.mesure - 6) < 1e-6));
  for (const [a, inc] of [[0.9, 0], [0.9, 180], [0, 0]]) ok(`kerr a=${a} i=${inc} : 0.97 ISCO + poussee plonge, 1.05 ISCO reste liee`, () => {
    const ri = iscoRef(a, inc > 90 ? -1 : 1);
    const bas = sim('kerr', { a, inclinaison: inc, r0: 0.97 * ri, poussee: 0.001 }), haut = sim('kerr', { a, inclinaison: inc, r0: 1.05 * ri, poussee: 0.001 });
    /* 2026-11-01 (demande du proprietaire) : la capture est une FIN dessinee (n lignes, la derniere juste hors de l horizon) */
    assert.equal(bas.bornee, true); assert.match(bas.raison, /capture/); assert.equal(bas.brut.length, bas.n * 3);
    assert.equal(bas.fin.evenement, 'capture'); assert.equal(bas.fin.indice, bas.n - 1); assert.ok(bas.fin.t > 0 && bas.fin.tempsPropre > 0);
    const rp = 1 + Math.sqrt(1 - a * a); assert.ok(bas.fin.r > rp * 1.01 && bas.fin.r < rp * 1.01 + 0.2, String(bas.fin.r));
    assert.equal(haut.bornee, true, haut.raison); assert.equal(haut.fin, undefined);
    return `r fin ${bas.fin.r.toFixed(4)} (r+ ${rp.toFixed(4)}), t ${bas.fin.t.toFixed(1)}`;
  });
  const kp = J('kerr'), kr = J('kerr', { inclinaison: 170 });
  ok('kerr : H = -1/2 et constante de Carter conservees a 1e-9', () => { for (const k of [kp, kr]) { assert.ok(Math.abs(k.hamiltonien.debut + 0.5) < 1e-12 && k.hamiltonien.derive < 1e-9 && k.carter.derive < 1e-9, JSON.stringify(k.carter)); } return kp.carter.derive.toExponential(1); });
  ok('kerr a=0.9 r=10 i=10 : precession nodale > 0, a 5 % de 2pi(Omega/omega_theta - 1)', () => { const v = kp.noeuds; assert.ok(v.passages >= 4 && v.mesure > 0 && rel(v.mesure, v.formule) < 0.05, JSON.stringify(v)); return `${v.mesure.toFixed(4)} vs ${v.formule.toFixed(4)} rad`; });
  ok('kerr retrograde i=170 : noeuds avancent AUSSI dans le sens du trou (> 0), a 5 %', () => { const v = kr.noeuds; assert.ok(v.mesure > 0 && rel(v.mesure, v.formule) < 0.05, JSON.stringify(v)); return `${v.mesure.toFixed(4)} vs ${v.formule.toFixed(4)} rad`; });
  ok('kerr a=0 : aucune precession nodale (< 1e-6 rad)', () => { const v = I('kerr', { a: 0, inclinaison: 30 }).noeuds; assert.ok(v.passages >= 4 && Math.abs(v.mesure) < 1e-6, String(v.mesure)); });

  // 4. trou de ver
  const tv = J('trouDeVer');
  ok('trouDeVer : b = 0.6 < b0 traverse, b = 1.6 > b0 rebrousse en sqrt(b^2 - b0^2) a 1e-5', () => {
    assert.equal(tv.rayon1.issue, 'traverse la gorge'); assert.equal(tv.rayon2.issue, 'rebrousse'); assert.ok(rel(tv.rayon2.lMin, tv.rayon2.lMinFormule) < 1e-5, JSON.stringify(tv.rayon2));
    return `${tv.rayon2.lMin.toFixed(6)} vs ${tv.rayon2.lMinFormule.toFixed(6)}`;
  });
  ok('trouDeVer : premiere integrale l\'^2 + b^2/(l^2+b0^2) = 1 a 1e-9', () => { for (const k of ['integraleRayon1', 'integraleRayon2']) assert.ok(Math.abs(tv[k].debut - 1) < 1e-12 && tv[k].derive < 1e-9, JSON.stringify(tv[k])); });
  ok('trouDeVer : rayon traversant change de feuillet (z < 0 -> z > 0)', () => { const r = sim('trouDeVer'), b = r.brut, D = r.D; assert.ok(b[2] < -1 && b[(r.n - 1) * D + 2] > 1); assert.ok(b[5] < -1 && b[(r.n - 1) * D + 5] < -1); });
  ok('trouDeVerSurface : plongement isometrique a 1e-6, gorge r >= b0', () => {
    const r = sim('trouDeVerSurface'); assert.ok(r.invariants.isometrie.mesure < 1e-6); let m = Infinity;
    for (let i = 0; i < r.n; i++) m = Math.min(m, Math.hypot(r.brut[3 * i], r.brut[3 * i + 1])); assert.ok(m >= 1 - 1e-9);
  });

  // 5. Lagrange
  const em = J('pointsLagrange', { monde: 1 }), sj = J('pointsLagrange');
  ok('lagrange Terre-Lune : L1, L2, L3 = 0.836915, 1.155682, -1.005063 a 2e-6 (publies)', () => {
    assert.ok(Math.abs(em.L1.mesure - 0.836915) < 2e-6 && Math.abs(em.L2.mesure - 1.155682) < 2e-6 && Math.abs(em.L3.mesure + 1.005063) < 2e-6, JSON.stringify([em.L1, em.L2, em.L3]));
    return `${em.L1.mesure.toFixed(6)} ${em.L2.mesure.toFixed(6)} ${em.L3.mesure.toFixed(6)}`;
  });
  ok('lagrange Soleil-Jupiter : L1, L2 a 2e-4 de 1 - mu -/+ r_H (1 -/+ r_H/3) (Hill)', () => {
    const mu = sj.mu, h = Math.cbrt(mu / 3); assert.ok(Math.abs(sj.L1.mesure - (1 - mu - h * (1 - h / 3))) < 2e-4 && Math.abs(sj.L2.mesure - (1 - mu + h * (1 + h / 3))) < 2e-4, JSON.stringify([sj.L1, sj.L2]));
    return `${sj.L1.mesure.toFixed(5)} ${sj.L2.mesure.toFixed(5)}`;
  });
  ok('lagrange : L4 equilateral (distance 1 aux deux primaires a 1e-12)', () => { for (const v of [em, sj]) assert.ok(Math.abs(v.L4.distanceAuPrimaire - 1) < 1e-12 && Math.abs(v.L4.distanceAuSecondaire - 1) < 1e-12); });
  ok('lagrange : constante de Jacobi conservee a 1e-10 (tetard, fer a cheval)', () => { const h = I('pointsLagrange', { orbite: 1, duree: 1500 }); for (const v of [em, sj, h]) assert.ok(v.jacobi.derive < 1e-10, String(v.jacobi.derive)); return sj.jacobi.derive.toExponential(1); });
  ok('lagrange : tetard autour de L4 (Soleil-Jupiter et Terre-Lune), fer a cheval (orbite 1)', () => {
    assert.equal(sj.angleAuSecondaire.forme, 'tetard autour de L4'); assert.equal(em.angleAuSecondaire.forme, 'tetard autour de L4');
    const h = I('pointsLagrange', { orbite: 1, duree: 1500 }); assert.equal(h.angleAuSecondaire.forme, 'fer a cheval'); assert.ok(h.angleAuSecondaire.min < 60 && h.angleAuSecondaire.max > 300);
    return `fer a cheval ${h.angleAuSecondaire.min.toFixed(1)}..${h.angleAuSecondaire.max.toFixed(1)} deg`;
  });
  ok('lagrange Terre-Lune fer a cheval (duree 3000) : escape = fin dessinee, derniere ligne au bord |x|+|y|+|z| ~ 10', () => {
    const r = sim('pointsLagrange', { monde: 1, orbite: 1, duree: 3000 }), b = r.brut, o = (r.n - 1) * 3, s = Math.abs(b[o]) + Math.abs(b[o + 1]) + Math.abs(b[o + 2]);
    assert.equal(r.bornee, true); assert.equal(r.fin.evenement, 'escape'); assert.equal(r.fin.indice, r.n - 1); assert.ok(r.fin.t > 0 && r.fin.t < 3000);
    assert.ok(s < 10 && s > 9.5, String(s)); assert.ok(r.invariants.jacobi.derive < 1e-8, String(r.invariants.jacobi.derive)); assert.ok(Number.isFinite(r.lyapunov));
    return `t ${r.fin.t.toFixed(2)}, |x|+|y|+|z| ${s.toFixed(3)}`;
  });
  ok('lagrange : collision avec un primaire reste un refus', () => { const r = sim('pointsLagrange', { orbite: 1, ecart: 0.05, duree: 3000 }); assert.equal(r.bornee, false); assert.match(r.raison, /collision/); });
  ok('lumiere : fin par rayon (capture b=4, escape b=5.2/7/15 au bord r = 30M)', () => {
    const r = sim('lumiereTrouNoir'), f = r.fin, b = r.brut, o = (r.n - 1) * 12;
    assert.deepEqual(f.map((x) => x.evenement), ['capture', 'escape', 'escape', 'escape']); for (const x of f) assert.equal(x.indice, r.n - 1);
    assert.ok(Math.hypot(b[o], b[o + 1]) <= 2.05, 'capture a l horizon');
    for (let k = 1; k < 4; k++) assert.ok(Math.abs(Math.hypot(b[o + 3 * k], b[o + 3 * k + 1]) - 30) < 0.1, 'rayon ' + (k + 1));
  });
  ok('lagrange : lambda tetard (duree 1500) < 0.01 ; rencontres proches (ecart 0.05) > 0.04 et > 5x', () => {
    const a = sim('pointsLagrange', { duree: 1500 }).lyapunov, b = sim('pointsLagrange', { ecart: 0.05, duree: 1500 }).lyapunov;
    assert.ok(a < 0.01 && b > 0.04 && b > 5 * a, `${a} ${b}`); return `${a.toFixed(4)} / ${b.toFixed(4)}`;
  });

  // 6. Hulse-Taylor
  const ht = J('pulsarHulseTaylor');
  ok('hulseTaylor : dPb/dt calcule a 1 % du mesure -2.423e-12 et 0.1 % de la prediction RG publiee -2.40263e-12', () => {
    const v = ht.derivePeriode; assert.ok(rel(v.mesure, -2.423e-12) < 0.01 && rel(v.mesure, -2.40263e-12) < 1e-3, String(v.mesure)); return `${v.mesure.toExponential(4)} (${(100 * v.ecartObserve).toFixed(2)} % / ${(100 * v.ecartPrediction).toFixed(3)} %)`;
  });
  ok('hulseTaylor : coherence avec le systeme de Peters da/dt a 1e-10 ; a = 6.50 s-lumiere a 1 %', () => { assert.ok(ht.coherenceEdo.ecart < 1e-10); assert.ok(rel(ht.demiGrandAxe.mesure, 6.5) < 0.01); });
  ok('hulseTaylor : coalescence ~300 Ma (entre 250 et 350)', () => { const t = ht.coalescence.mesure; assert.ok(t > 250 && t < 350, String(t)); return t.toFixed(1) + ' Ma'; });
  ok('hulseTaylor : l orbite affichee retrecit (separation finale < 0.5 x initiale)', () => {
    const r = sim('pulsarHulseTaylor'), b = r.brut, D = r.D, sep = (i) => Math.hypot(b[i * D + 3] - b[i * D], b[i * D + 4] - b[i * D + 1], b[i * D + 5] - b[i * D + 2]);
    let m0 = 0, m1 = 0; for (let i = 0; i < 100; i++) { m0 = Math.max(m0, sep(i)); m1 = Math.max(m1, sep(r.n - 1 - i)); } assert.ok(m1 < 0.5 * m0, `${m0} ${m1}`);
  });

  // 7. courbe de rotation
  const cr = J('courbeRotation');
  ok('courbeRotation : maximum NFW en r = 2.16258 rs a 1e-4', () => { assert.ok(rel(cr.vitesseMaxHalo.mesure, 2.16258) < 1e-4, String(cr.vitesseMaxHalo.mesure)); return cr.vitesseMaxHalo.mesure.toFixed(5); });
  ok('courbeRotation : v_NFW(rs) = sqrt(4 pi G rho0 rs^2 (ln2 - 1/2)) et masse Simpson a 1e-8', () => { assert.ok(rel(cr.vitesseHaloEnRs.mesure, cr.vitesseHaloEnRs.formule) < 1e-12); assert.ok(rel(cr.masseHaloEnRs.mesure, cr.masseHaloEnRs.formule) < 1e-8); });
  ok('courbeRotation : plate avec halo (v30/v10 dans [0.85, 1.15]), chute sans (< 0.7)', () => { const p = cr.platitude; assert.ok(p.avecHalo > 0.85 && p.avecHalo < 1.15 && p.visibleSeul < 0.7, JSON.stringify(p)); return `${p.avecHalo.toFixed(3)} / ${p.visibleSeul.toFixed(3)}`; });
  ok('courbeRotation : visible seul -> chute keplerienne v ~ r^-1/2 a 3 % (rmax -> 2 rmax)', () => assert.ok(rel(cr.chuteKepler.mesure, Math.SQRT1_2) < 0.03));
  ok('courbeRotation : rho0 = 0 -> v avec halo = v visible', () => { const r = sim('courbeRotation', { rho0: 0 }); for (let i = 0; i < r.n; i += 97) assert.ok(Math.abs(r.brut[i * 4 + 2] - r.brut[i * 4 + 3]) < 1e-9); });

  // 8. expansion
  const ex = J('expansionUnivers');
  ok('expansion Planck 2018 : age = 13.8 Ga a 1 %, = formule fermee a 1e-8', () => { const v = ex.ageUnivers; assert.ok(rel(v.mesure, 13.8) < 0.01 && rel(v.mesure, v.formule) < 1e-8, JSON.stringify(v)); return v.mesure.toFixed(4) + ' Ga'; });
  ok('expansion : transition deceleration -> acceleration z dans [0.63, 0.67], a 1e-3 de (2 OL/Om)^(1/3) - 1', () => { const v = ex.transitionAcceleration; assert.ok(v.mesure >= 0.63 && v.mesure <= 0.67 && Math.abs(v.mesure - v.formule) < 1e-3, JSON.stringify(v)); return v.mesure.toFixed(4); });
  ok('expansion Om = 1 (Einstein-de Sitter) : age = 2/(3 H0) a 1e-6', () => { const v = I('expansionUnivers', { Om: 1 }).ageUnivers; assert.ok(rel(v.mesure, 2 / 3 * 977.792221 / 67.4) < 1e-6, String(v.mesure)); });
  ok('expansion : a(t) croissant, galaxies a 0 au Big Bang', () => { const r = sim('expansionUnivers'), b = r.brut; assert.equal(b[0], 0); for (let i = 1; i < r.n; i++) assert.ok(b[i * 12] > b[(i - 1) * 12]); });

  // 9. Halley
  const ha = J('cometeHalley');
  ok('halley : periode mesuree (periheles) = 2 pi a^1.5/sqrt(GM) a 1e-6, = 75.32 ans publies a 0.5 %', () => { const v = ha.periode; assert.ok(v.passages >= 3 && rel(v.mesure, v.formule) < 1e-6 && rel(v.mesure, 75.32) < 0.005, JSON.stringify(v)); return v.mesure.toFixed(4) + ' ans'; });
  ok('halley : perihelie 0.586 UA a 0.1 %, retrograde (Lz < 0), energie a 1e-6', () => {
    assert.ok(rel(ha.perihelie.mesure, 0.586) < 1e-3 && rel(ha.perihelie.mesure, ha.perihelie.formule) < 1e-5); assert.ok(ha.momentCinetiqueZ.debut < 0 && ha.momentCinetiqueZ.max < 0); assert.ok(ha.energie.derive < 1e-6);
    return ha.perihelie.mesure.toFixed(5) + ' UA';
  });

  // 10. TRAPPIST-1
  const tr = J('trappist1');
  ok('trappist1 : 5 rapports a 1 % de 8:5 5:3 3:2 3:2 4:3, h/g a 1.5 % de 3:2', () => { const r = tr.rapportsDePeriodes; for (let k = 0; k < 5; k++) assert.ok(r[k].ecart < 0.01, r[k].paire); assert.ok(r[5].ecart < 0.015); return r.map((x) => (100 * x.ecart).toFixed(2) + '%').join(' '); });
  ok('trappist1 : relations de Laplace a 3 corps |residu| < 5e-4 /jour', () => { for (const l of tr.relationsDeLaplace) assert.ok(Math.abs(l.residu) < 5e-4, l.triplet); });
  ok('trappist1 : a_b = 0.01154 UA a 1 % (Kepler III, M* = 0.0898)', () => assert.ok(rel(tr.demiGrandsAxes.mesure[0], 0.01154) < 0.01));
  ok('trappist1 : periode simulee de b (passages y: - -> +) = 1.510826 j a 1e-3', () => {
    const r = sim('trappist1', { jours: 30 }, { n: 20000 }), b = r.brut, D = r.D, t = []; for (let i = 1; i < r.n; i++) if (b[(i - 1) * D + 1] < 0 && b[i * D + 1] >= 0) t.push(i);
    const p = (t[t.length - 1] - t[0]) / (t.length - 1) * 30 / (r.n - 1); assert.ok(rel(p, 1.510826) < 1e-3, String(p));
  });

  // 11. disque d accretion
  const di = J('disqueAccretion');
  ok('disque : ISCO mesure = 6M a 1e-6, rendement 1 - sqrt(8/9) = 5.72 %', () => { assert.ok(rel(di.isco.mesure, 6) < 1e-6 && Math.abs(di.rendement.mesure - (1 - Math.sqrt(8 / 9))) < 1e-10); return di.isco.mesure.toFixed(7); });
  ok('disque : aucune particule sous l ISCO, vitesse max dans [0.49, 0.5] c', () => { assert.ok(di.rayonMin.mesure >= 6 - 1e-9 && di.vitesseIsco.mesure <= 0.5 + 1e-12 && di.vitesseIsco.mesure > 0.49); });
  ok('disque : frequence orbitale ISCO 10 Msol = 220 Hz a 1 % (f_GW = 4.4 kHz Msol/M)', () => { const f = di.frequenceIsco.mesure; assert.ok(rel(f, 220) < 0.01, String(f)); return f.toFixed(2) + ' Hz'; });
  ok('disque : autre graine -> autre nuage', () => assert.ok(!octets(sim('disqueAccretion', { graine: 2 }).brut).equals(octets(sim('disqueAccretion').brut))));

  // 12. bornage
  ok('bornage : hors bornes ramene, NaN -> defaut, entiers arrondis', () => {
    assert.deepEqual(sim('kerr', { a: 5, r0: NaN, inclinaison: -9, tours: 1e9, poussee: 'x' }, { n: 20 }).params, { a: 0.99, r0: 10, inclinaison: 0, tours: 30, poussee: 0 });
    assert.deepEqual(sim('pointsLagrange', { monde: 0.7, orbite: 9, ecart: 0, z0: 1, duree: 20 }, { n: 20 }).params, { monde: 1, orbite: 1, ecart: 0.001, z0: 0.1, duree: 20 });
    assert.deepEqual(sim('trappist1', { premiere: 2.6, jours: -1 }, { n: 20 }).params, { premiere: 3, jours: 2 });
    assert.equal(sim('trappist1', { jours: 1e9 }, { n: 20 }).params.jours, 60); assert.equal(sim('cometeHalley', { tours: 1e9 }, { n: 20 }).params.tours, 20);
    assert.equal(sim('pulsarHulseTaylor', {}, { n: 20 }).params.fraction, 0.999);
    assert.deepEqual(sim('lumiereTrouNoir', { b1: 1e6, b2: 0 }, { n: 20 }).params, { b1: 25, b2: 1, b3: 7, b4: 15 });
  });
  ok('reglagesPhysique : forme reglagesDe, valeur bornee', () => {
    const r = T.reglagesPhysique('expansionUnivers', { H0: 1e9 });
    assert.deepEqual(r.map((x) => x.chemin), ['params.H0', 'params.Om', 'params.finGa']);
    assert.deepEqual(r[0], { chemin: 'params.H0', nom: 'H0', min: 50, max: 90, valeur: 90 });
  });
  ok('systeme inconnu -> exception', () => assert.throws(() => sim('nope')));
  return res;
}

// ---------- banc ----------
const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
/* source : aucune fonction transcendante native, seul ** autorise = 2 ** k (puissance de deux exacte), aucun Math.random */
{
  const src = readFileSync(SOURCE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // commentaires retires
  const interdits = src.match(/Math\.(sin|cos|tan|exp|log|pow|atan|atan2|asin|acos|hypot|cbrt|sinh|cosh|tanh|asinh|acosh|atanh|expm1|log1p|log2|log10|random)\b/g) || [];
  const puissances = (src.match(/\*\*/g) || []).length, deux = (src.match(/2 \*\* k/g) || []).length;
  const accents = (src.match(/[^\x00-\x7f]/g) || []).length;
  console.log(`${interdits.length || puissances !== deux || accents ? 'ECHEC ' : 'OK    '}source : 0 Math.* transcendant (${interdits.join(',') || 'aucun'}), ** = ${puissances} (2 ** k : ${deux}), non-ASCII ${accents}`);
  assertions++; if (interdits.length || puissances !== deux || accents) ech.push({ nom: 'source', det: interdits.join(',') + ' ** ' + puissances + ' accents ' + accents });
}
console.log('\nTEMPS simuler(id) a n = 1500 (mediane de 3) :');
for (const s of T.SYSTEMES) {
  const t = []; for (let k = 0; k < 3; k++) { const a = performance.now(); T.simuler(s.id); t.push(performance.now() - a); }
  t.sort((a, b) => a - b); const ms = t[1];
  console.log(`  ${s.id.padEnd(20)} ${ms.toFixed(1)} ms`);
  assertions++; if (!(ms < 300)) ech.push({ nom: 'temps ' + s.id + ' < 300 ms', det: ms.toFixed(1) });
}

// ---------- mutants (copies dans un dossier temporaire ; l import du moteur pointe vers l original) ----------
const MUTANTS = [
  ['lumiere : terme 3 M u^2 retire (sphere de photons)', 'd[1] = 3 * M_TN * y[0] * y[0] - y[0];', 'd[1] = -y[0];'],
  ['kerr : signe du spin inverse dans les equations', 'const a = c.a, E = c.E, Lz = c.Lz;', 'const a = -c.a, E = c.E, Lz = c.Lz;'],
  ['lagrange : rapport de masses Terre-Lune faux', '0.012150585]', '0.0123]'],
  ['hulseTaylor : facteur (1 + 73/24 e^2 + 37/96 e^4) retire', 'return 1 + 73 / 24 * e2 + 37 / 96 * e2 * e2;', 'return 1;'],
  ['friedmann : Lambda retire', 'Math.sqrt(Om / (a * a * a) + OL)', 'Math.sqrt(Om / (a * a * a))'],
  ['trou de ver : courbure retiree (l\'\' = 0)', 'd[1] = c.b * c.b * y[0] / (q * q);', 'd[1] = 0;'],
  ['lagrange : signe de Coriolis', 'd[3] = 2 * y[4] + x', 'd[3] = -2 * y[4] + x'],
  ['disque : energie circulaire newtonienne (pas d ISCO)', '(1 - 2 / r) / Math.sqrt(1 - 3 / r)', '(1 - 2 / r) / Math.sqrt(1 - 2 / r)'],
  ['disque : Math.random injecte', 'const alea = mulberry32(P.graine >>> 0)', 'const alea = Math.random'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['kerr : capture redevient un refus (pas de rejeu)', 'run = courir(run.tAvant);', 'break;'],
  ['lagrange : escape redevient un refus (pas de rejeu)', 'run = courirLagrange(run.tAvant);', 'break;'],
  ['lumiere : capture notee comme escape', "ev.issue === 'capture' ? { rayon: k + 1, evenement: 'capture'", "ev.issue === 'capture' ? { rayon: k + 1, evenement: 'escape'"],
];
const brut = readFileSync(SOURCE, 'utf8'), moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-cosmos-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = brut.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`);
    writeFileSync(f, brut.replace(de, vers).replace("from './tam-moteur.js'", `from '${moteur}'`));
    let r; try { r = suite(await import(pathToFileURL(f).href)); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-cosmos-20261101 : ${assertions} assertions OK`);
