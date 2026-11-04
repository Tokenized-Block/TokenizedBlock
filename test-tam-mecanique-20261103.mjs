// test-tam-mecanique-20261103.mjs -- banc de tam-mecanique.js (electricite, vue non frappable) + mutants sur COPIES.
// Lancer : node test-tam-mecanique-20261103.mjs
// References independantes : billard, le compte doit egaler floor(pi 10^k) (Math.PI, pas la formule du module) et chaque etat est sur le
//   cercle de l energie ; chaine, periode contre 2 pi / omega_j ET contre la frequence EXACTE du schema de Verlet (2/h) asin(omega h / 2),
//   et chaque image garde la forme sin(i j pi / (N + 1)) du mode.
// Tolerances (mesurees le 2026-11-03) : periode physique 5e-5 (mesure 1.7e-5), Verlet 1e-6, fuite 1e-12 (mesure 1e-15).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-mecanique.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const IDS = ['billardPi', 'modesNormaux', 'paraboleTir', 'penduleAmplitude', 'phasesLune', 'dureeJour', 'courseRoulante', 'corpsNoir', 'reseauFentes'];

function extremes(s) { const ks = Object.keys(s.params), cs = [{}]; for (const k of ks) { cs.push({ [k]: s.bornes[k][0] }); cs.push({ [k]: s.bornes[k][1] }); } cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][0]]))); cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][1]]))); return cs; }
function standardiser(b, n, D, groupes = []) {
  const z = new Float64Array(n * D), moy = [], et = [];
  for (let j = 0; j < D; j++) { let m = 0; for (let i = 0; i < n; i++) m += b[i * D + j]; m /= n; let v = 0; for (let i = 0; i < n; i++) v += (b[i * D + j] - m) ** 2; moy.push(m); et.push(Math.sqrt(v / n)); }
  for (const g of groupes) { const e = Math.sqrt(g.reduce((a, j) => a + et[j] * et[j], 0) / g.length); for (const j of g) et[j] = e; }
  for (let j = 0; j < D; j++) { const s = et[j] > 0 ? 1 / et[j] : 0; for (let i = 0; i < n; i++) z[i * D + j] = (b[i * D + j] - moy[j]) * s; }
  return z;
}
const ecartDessin = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };

/* game126 (le banc depassait 25 min : chaque mutant relancait les 5 systemes) : un mutant ne relance que les tests de SON systeme
 *   (seul = liste d ids ; null = tout) — le bornage et la forme restent toujours verifies */
function suite(T, bavard = false, seul = null) {
  const vise = (id) => !seul || seul.includes(id);
  const res = [];
  const ok = (nom, f) => { let c = false, det = ''; try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; } res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : '')); };
  const cache = new Map(), S = (id, p = {}) => { const k = id + JSON.stringify(p); if (!cache.has(k)) cache.set(k, T.simuler(id, p)); return cache.get(k); };
  const sys = (id) => T.SYSTEMES.find((s) => s.id === id);
  ok('SYSTEMES gele, 9 systemes, SOURCES vide, COLONNES couvre chaque colonne', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES)); assert.deepEqual(T.SYSTEMES.map((s) => s.id), IDS); assert.equal(Object.keys(T.SOURCES).length, 0);
    for (const s of T.SYSTEMES) { const C = T.COLONNES[s.id]; assert.equal(C.colonnes.length, s.D); assert.deepEqual([...C.memeLongueur.flat(), ...C.autres].sort(), [...Array(s.D).keys()]); }
  });
  for (const s of T.SYSTEMES) {
    if (!vise(s.id)) continue;
    ok(`${s.id} : bornee, brut fini, phrase anglaise sans accent`, () => { const r = S(s.id); assert.equal(r.bornee, true, r.raison); assert.equal(r.brut.length, 1500 * s.D); assert.ok(/^A visualisation of /.test(s.phrase) && !/[^\x20-\x7e]/.test(s.phrase + s.nom)); });
    ok(`${s.id} : determinisme`, () => { const a = T.simuler(s.id, {}), b = T.simuler(s.id, {}); assert.ok(octets(a.brut).equals(octets(b.brut))); assert.equal(JSON.stringify(a.invariants), JSON.stringify(b.invariants)); });
    ok(`${s.id} : petits n (2 et 7)`, () => { for (const n of [2, 7]) { const r = T.simuler(s.id, {}, { n }); assert.ok(r.bornee && r.brut.length === n * s.D); } });
    ok(`${s.id} : bornee a chaque extreme`, () => { for (const p of extremes(s)) assert.ok(S(s.id, p).bornee, JSON.stringify(p)); });
    ok(`${s.id} : chaque curseur change le DESSIN`, () => { const C = T.COLONNES[s.id], d0 = S(s.id), z0 = standardiser(d0.brut, d0.n, d0.D, C.memeLongueur), out = [];
      for (const k of Object.keys(s.params)) for (const v of s.bornes[k]) { if (v === s.params[k]) continue; const r = S(s.id, { [k]: v }), e = ecartDessin(z0, standardiser(r.brut, r.n, r.D, C.memeLongueur)); assert.ok(e > 1e-3, k + '=' + v + ' : ' + e); out.push(k + ' ' + e.toFixed(2)); }
      return out.join(' ; '); });
  }
  if (vise('billardPi')) for (let k = 0; k <= 5; k++) ok(`billardPi chiffres = ${k} : le nombre de chocs ecrit les ${k + 1} premiers chiffres de pi, etats sur le cercle de l energie`, () => {
    const R = S('billardPi', { chiffres: k }), I = R.invariants, b = R.brut, M = 100 ** k;
    assert.equal(I.chocs.mesure, Math.floor(Math.PI * 10 ** k), 'chocs ' + I.chocs.mesure);
    assert.equal(I.chocs.formule, Math.ceil(Math.PI / Math.atan(Math.sqrt(1 / M))) - 1);
    assert.ok(I.energie.derive / I.energie.debut < 1e-9, 'energie ' + I.energie.derive / I.energie.debut);
    for (let i = 0; i < R.n; i++) { const o = 3 * i; assert.ok(Math.abs(Math.hypot(b[o], b[o + 1]) - Math.sqrt(M)) < 1e-6 * Math.sqrt(M), 'sur le cercle ' + i); if (i) assert.ok(b[o + 2] >= b[o - 1]); }
    return I.chocs.mesure + ' chocs';
  });
  if (vise('modesNormaux')) for (const p of [...extremes(sys('modesNormaux')), { masses: 3, mode: 2 }, { masses: 10, mode: 7 }]) ok(`modesNormaux ${JSON.stringify(p)} : periode = 2 pi / omega_j (et la frequence exacte de Verlet), la chaine garde la forme du mode`, () => {
    const R = S('modesNormaux', p), N = R.params.masses, j = Math.min(R.params.mode, N), I = R.invariants, b = R.brut, h = 0.01;
    const om = 2 * Math.sin(j * Math.PI / (2 * (N + 1))), Om = 2 / h * Math.asin(om * h / 2);
    assert.ok(Math.abs(I.periodeMode.formule - 2 * Math.PI / om) < 1e-12 * I.periodeMode.formule, 'formule');
    assert.ok(Math.abs(I.periodeMode.mesure / (2 * Math.PI / om) - 1) < 5e-5, 'periode physique');
    assert.ok(Math.abs(I.periodeMode.mesure / (2 * Math.PI / Om) - 1) < 1e-6, 'periode du schema de Verlet ' + (I.periodeMode.mesure / (2 * Math.PI / Om) - 1));
    assert.ok(I.resteDansLeMode.mesure < 1e-12, 'fuite ' + I.resteDansLeMode.mesure);
    for (let f = 0; f < R.film.images; f++) { const d0 = R.film.debuts[f], c = R.film.tailles[f]; let ratio = null;
      for (let r = 0; r < c; r++) { const o = 3 * (d0 + r), i = b[o]; assert.ok(Number.isInteger(i) && i >= 0 && i <= N + 1); const fo = Math.sin(i * j * Math.PI / (N + 1));
        if (i === 0 || i === N + 1) { assert.equal(b[o + 1], 0); continue; } if (Math.abs(fo) > 0.2) { const q = b[o + 1] / fo; if (ratio === null) ratio = q; else assert.ok(Math.abs(q - ratio) < 1e-9, 'forme du mode, image ' + f); } } }
    return 'ecart physique ' + (I.periodeMode.mesure / (2 * Math.PI / om) - 1).toExponential(1) + ', Verlet ' + (I.periodeMode.mesure / (2 * Math.PI / Om) - 1).toExponential(1);
  });
  /* game124 : tir — references : Math.atan(1 / sqrt(1 + 2 h)), sqrt(1 + 2 h), enveloppe h + 1/2 - x^2/2 */
  if (vise('paraboleTir')) for (const p of [...extremes(sys('paraboleTir')), { hauteur: 0.5 }, { hauteur: 1 }]) ok(`paraboleTir ${JSON.stringify(p)} : meilleur angle atan(1/sqrt(1+2h)), portee sqrt(1+2h), tout sous la parabole de surete`, () => {
    const R = S('paraboleTir', p), h = R.params.hauteur, I = R.invariants, b = R.brut, th = Math.atan(1 / Math.sqrt(1 + 2 * h)) * 180 / Math.PI, Rm = Math.sqrt(1 + 2 * h);
    assert.ok(Math.abs(I.angleOptimal.formule - th) < 1e-9 && Math.abs(I.angleOptimal.mesure - th) <= 0.05, 'angle ' + I.angleOptimal.mesure + ' ' + th);
    assert.ok(Math.abs(I.porteeMax.formule - Rm) < 1e-12 && Math.abs(I.porteeMax.mesure - Rm) < 1e-5, 'portee ' + I.porteeMax.mesure);
    assert.equal(I.enveloppe.mesure, 0); assert.ok(I.enveloppe.contact < 1e-6, 'contact ' + I.enveloppe.contact);
    for (let i = 0; i < R.n; i++) { const o = 3 * i, x = b[o], y = b[o + 1]; assert.ok(y >= -1e-9 && y <= h + 0.5 - x * x / 2 + 1e-9, 'sous l enveloppe ' + i); }
    return 'angle ' + I.angleOptimal.mesure.toFixed(3) + ' / ' + th.toFixed(3);
  });
  /* game126 : pendule — reference INDEPENDANTE de l AGM : T = 4 K(k), k = sin(theta0/2), K par Simpson de 1/sqrt(1 - k^2 sin^2 phi) (Math.sin) */
  const periodeK = (a0) => { const k = Math.sin(a0 / 2), M = 20000, hh = Math.PI / 2 / M, g = (ph) => 1 / Math.sqrt(1 - k * k * Math.sin(ph) ** 2); let t = g(0) + g(Math.PI / 2); for (let i = 1; i < M; i++) t += (i % 2 ? 4 : 2) * g(i * hh); return 4 * t * hh / 3; };
  if (vise('penduleAmplitude')) for (const p of [...extremes(sys('penduleAmplitude')), { lacher: 90 }, { lacher: 170 }]) ok(`penduleAmplitude ${JSON.stringify(p)} : periode = 4 K(sin(theta0/2)) (integrale elliptique), energie de chaque point dessine`, () => {
    const R = S('penduleAmplitude', p), a = R.params.lacher * Math.PI / 180, I = R.invariants, b = R.brut, Tk = periodeK(a);
    assert.ok(Math.abs(I.periode.formule / Tk - 1) < 1e-9, 'AGM vs K ' + I.periode.formule + ' ' + Tk); assert.ok(Math.abs(I.periode.mesure / Tk - 1) < 1e-9, 'mesure ' + I.periode.mesure);
    assert.ok(I.periodesFilm.pireEcartRelatif < 1e-9 && I.energie.derive < 1e-10);
    for (let f = 0; f < R.film.images; f++) { const a0 = a * (f + 1) / R.film.images, d0 = R.film.debuts[f], c = R.film.tailles[f]; for (let r = 0; r < c; r++) { const o = 3 * (d0 + r); assert.ok(Math.abs(b[o + 1] ** 2 / 2 - Math.cos(b[o]) + Math.cos(a0)) < 1e-9, 'energie image ' + f); } }
    return 'T ' + I.periode.mesure.toFixed(6) + ' (petites oscillations 6.283185)';
  });
  /* game126 : Lune — (1 + cos phi)/2 par Math.cos ; chaque point dessine est eclaire (x sin phi + sqrt(1 - r^2) cos phi > 0) */
  if (vise('phasesLune')) for (const p of [...extremes(sys('phasesLune')), { anglePhase: 90 }, { anglePhase: 45 }]) ok(`phasesLune ${JSON.stringify(p)} : part eclairee (1 + cos phi)/2, chaque point dessine eclaire`, () => {
    const R = S('phasesLune', p), ph = R.params.anglePhase * Math.PI / 180, I = R.invariants, b = R.brut, att = Math.max(0, (1 + Math.cos(ph)) / 2);
    assert.ok(Math.abs(I.partEclairee.formule - att) < 1e-12 && Math.abs(I.partEclairee.mesure - att) < 2e-3, 'part ' + I.partEclairee.mesure + ' ' + att);
    for (let i = 0; i < R.n; i++) { const o = 3 * i, x = b[o], y = b[o + 1], r2 = x * x + y * y, phi = b[o + 2] * Math.PI / 180; if (phi > Math.PI - 1e-9) continue; assert.ok(r2 <= 1 + 1e-12 && x * Math.sin(phi) + Math.sqrt(Math.max(0, 1 - r2)) * Math.cos(phi) > -1e-12, 'point ' + i); }
    return 'part ' + I.partEclairee.mesure.toFixed(5) + ' / ' + att.toFixed(5);
  });
  /* game127 : duree du jour — reference INDEPENDANTE par Math.acos / Math.tan / Math.asin ; le compte minute par minute s ecarte d au plus 1 minute */
  const jourRef = (lat, eps, d) => { const dl = Math.asin(Math.sin(eps * Math.PI / 180) * Math.sin(2 * Math.PI * d / 365)), x = -Math.tan(lat * Math.PI / 180) * Math.tan(dl); return x <= -1 ? 24 : x >= 1 ? 0 : 24 * Math.acos(x) / Math.PI; };
  if (vise('dureeJour')) for (const p of [...extremes(sys('dureeJour')), { latitude: 0 }, { latitude: 66 }, { latitude: 75 }, { latitude: -40 }]) ok(`dureeJour ${JSON.stringify(p)} : chaque point dessine contre acos(-tan(lat) tan(decl)), compte a 1 minute pres, 12 h a l equinoxe`, () => {
    const R = S('dureeJour', p), b = R.brut, I = R.invariants, lat = R.params.latitude, eps = R.params.inclinaison; let pire = 0;
    for (let i = 0; i < R.n; i++) { const o = 3 * i, ref = jourRef(lat, eps, b[o]), e = Math.abs(b[o + 1] - ref); if (b[o + 2] === 1) assert.ok(e < 1e-9, 'formule jour ' + b[o]); else { assert.ok(e <= 1 / 60 + 1e-9, 'compte jour ' + b[o] + ' : ' + e * 60 + ' min'); pire = Math.max(pire, e); } }
    assert.ok(I.dureeJours.mesure <= 1 + 1e-9 && Math.abs(I.equinoxe.mesure - 12) <= 1 / 60 + 1e-12);
    assert.ok(Math.abs(I.solstice.formule - jourRef(lat, eps, Math.round(365 / 4))) < 1e-9);
    return 'pire ' + (pire * 60).toFixed(2) + ' min, solstice ' + I.solstice.mesure.toFixed(3) + ' h';
  });
  /* game127 : course roulante — temps exacts par Math.sqrt, regime par Math.tan, chaque point x = a t^2 / 2 ; ordre sphere < cylindre < anneau en roulement */
  if (vise('courseRoulante')) for (const p of [...extremes(sys('courseRoulante')), { frottement: 0 }, { frottement: 0.15 }, { pente: 45, frottement: 0.3 }, { pente: 30, frottement: 0.2 }]) ok(`courseRoulante ${JSON.stringify(p)} : arrivees sqrt(2L(1+k)/(g sin)) ou glissement, regime au seuil k/(1+k) tan, energie conservee`, () => {
    const R = S('courseRoulante', p), I = R.invariants, th = R.params.pente * Math.PI / 180, mu = R.params.frottement, b = R.brut, out = [];
    const corps = [['Block', 0], ['Sphere', 0.4], ['Cylinder', 0.5], ['Ring', 1]], acc = [];
    for (const [nom, k] of corps) { const v = I['arrivee' + nom], roule = k > 0 && mu >= k / (1 + k) * Math.tan(th), a = roule ? Math.sin(th) / (1 + k) : Math.sin(th) - mu * Math.cos(th); acc.push(a);
      assert.equal(v.regime, roule ? 1 : 0, nom + ' regime');
      if (a <= 0) { assert.ok(!Number.isFinite(v.mesure) && !Number.isFinite(v.formule) && v.absente, nom + ' retenu'); out.push(nom + ' -'); continue; }
      const T = Math.sqrt(20 / a); assert.ok(Math.abs(v.formule / T - 1) < 1e-12 && Math.abs(v.mesure / T - 1) < 1e-6, nom + ' ' + v.mesure + ' ' + T); out.push(nom + ' ' + v.mesure.toFixed(4)); }
    for (let i = 0; i < R.n; i++) { const o = 3 * i, a = acc[b[o + 2]]; if (a > 0) assert.ok(Math.abs(b[o + 1] - Math.min(10, a * b[o] * b[o] / 2)) < 1e-6, 'point ' + i); else assert.ok(b[o + 1] === 0, 'immobile ' + i); }
    if (I.arriveeSphere.regime && I.arriveeCylinder.regime && I.arriveeRing.regime) assert.ok(I.arriveeSphere.mesure < I.arriveeCylinder.mesure && I.arriveeCylinder.mesure < I.arriveeRing.mesure);
    assert.ok(I.energieRoulants.derive < 1e-6 * I.energieRoulants.debut, 'energie ' + I.energieRoulants.derive);
    return out.join(' ');
  });
  /* game133 : corps noir — references INDEPENDANTES : x5 par DICHOTOMIE (Math.exp), aire par Simpson sur x = 1/(lambda T) (autre variable
   *   que le module), chaque point dessine par Math.exp / Math.pow, T_j = rapport^(j/(C-1)) par Math.pow */
  const x5Ref = (() => { let a = 4, b = 6; for (let i = 0; i < 200; i++) { const m = (a + b) / 2; if (m - 5 * (1 - Math.exp(-m)) > 0) b = m; else a = m; } return (a + b) / 2; })();
  const aireX = (() => { const M = 40000, X = 60, h = X / M, f = (x) => (x === 0 ? 0 : x ** 3 / Math.expm1(x)); let t = f(0) + f(X); for (let i = 1; i < M; i++) t += (i % 2 ? 4 : 2) * f(i * h); return t * h / 3; })();
  if (vise('corpsNoir')) for (const p of [...extremes(sys('corpsNoir')), { courbes: 3, rapport: 2.5 }]) ok(`corpsNoir ${JSON.stringify(p)} : chaque point = Planck, pic lambda_max T = 1/x5 (Wien), aire T^4 pi^4/15 (Stefan), puissance (Tc/Tf)^4`, () => {
    const R = S('corpsNoir', p), I = R.invariants, b = R.brut, C = R.params.courbes, r = R.params.rapport;
    assert.ok(Math.abs(I.picWien.x5 - x5Ref) < 1e-12, 'x5 ' + I.picWien.x5 + ' ' + x5Ref);
    assert.ok(Math.abs(Math.PI ** 4 / 15 - aireX) < 1e-10, 'reference de l aire ' + aireX);
    assert.ok(I.picWien.mesure < 1e-7 && I.aireStefan.mesure < 1e-9, 'wien ' + I.picWien.mesure + ' stefan ' + I.aireStefan.mesure);
    assert.ok(Math.abs(I.picFroid.mesure * x5Ref - 1) < 1e-7 && Math.abs(I.picFroid.formule * x5Ref - 1) < 1e-12, 'pic froid ' + I.picFroid.mesure);
    assert.ok(Math.abs(I.puissanceChaude.mesure / r ** 4 - 1) < 1e-9 && Math.abs(I.puissanceChaude.formule / r ** 4 - 1) < 1e-12, 'puissance ' + I.puissanceChaude.mesure);
    for (let i = 0; i < R.n; i++) { const o = 3 * i, j = b[o + 2], T = Math.pow(r, j / (C - 1)), l = b[o], ref = 1 / (l ** 5 * Math.expm1(1 / (l * T)));
      assert.ok(Number.isInteger(j) && j >= 0 && j < C && l >= 0.01 - 1e-12 && l <= 1 + 1e-12, 'colonnes ' + i); assert.ok(Math.abs(b[o + 1] - ref) <= 1e-9 * ref + 1e-300, 'Planck point ' + i + ' : ' + b[o + 1] + ' ' + ref); }
    return 'wien ' + I.picWien.mesure.toExponential(1) + ', stefan ' + I.aireStefan.mesure.toExponential(1) + ', puissance ' + I.puissanceChaude.mesure.toFixed(4);
  });
  /* game134 : reseau — reference INDEPENDANTE par Math.sin (forme fermee) ; zeros attendus EXACTEMENT a phi = 2 pi q / N ; labels {2, round((2+N)/2), N} */
  if (vise('reseauFentes')) for (const p of [...extremes(sys('reseauFentes')), { fentes: 7, espacement: 3.3 }]) ok(`reseauFentes ${JSON.stringify(p)} : chaque point = sin^2(N phi/2)/(N^2 sin^2(phi/2)), ordres a 1, N-1 creux et N-2 bosses`, () => {
    const R = S('reseauFentes', p), I = R.invariants, b = R.brut, N = R.params.fentes, r = R.params.espacement, labels = new Set([2, Math.round((2 + N) / 2), N]);
    const ref = (k, s) => { const ph = 2 * Math.PI * r * s, d = Math.sin(ph / 2); if (Math.abs(d) < 1e-6) return 1; return (Math.sin(k * ph / 2) / (k * d)) ** 2; };
    for (let i = 0; i < R.n; i++) { const o = 3 * i, k = b[o + 2]; assert.ok(labels.has(k) && b[o] >= -1 - 1e-12 && b[o] <= 1 + 1e-12, 'colonnes ' + i); assert.ok(Math.abs(b[o + 1] - ref(k, b[o])) < 1e-9, 'point ' + i + ' ' + b[o + 1] + ' ' + ref(k, b[o])); }
    assert.equal(I.minimaEntre.mesure, N - 1); assert.equal(I.secondaires.mesure, N - 2); assert.equal(I.comptesCourbes.mesure, 0);
    assert.equal(I.maximaPrincipaux.ordres, 2 * Math.floor(r) + 1); assert.ok(I.maximaPrincipaux.mesure < 1e-12 && I.courbeFentes.mesure < 1e-9);
    for (let q = 1; q < N; q++) assert.ok(ref(N, q / (N * r)) < 1e-20, 'zero q = ' + q);
    return N + ' fentes : ' + I.minimaEntre.mesure + ' creux, ' + I.secondaires.mesure + ' bosses, ' + I.maximaPrincipaux.ordres + ' ordres';
  });
  ok('bornage : hors bornes ramene, entiers arrondis', () => { assert.deepEqual(T.simuler('billardPi', { chiffres: 9 }, { n: 20 }).params, { chiffres: 5 }); assert.deepEqual(T.simuler('modesNormaux', { masses: 2.6, mode: NaN }, { n: 20 }).params, { masses: 3, mode: 2 }); });
  return res;
}

const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
const src = readFileSync(SOURCE, 'utf8');
const interdits = src.match(/Math\.(sin|cos|tan|exp|log|pow|atan2?|asin|acos|hypot|sinh|cosh|tanh|asinh|acosh|cbrt|expm1|log1p|log2|log10|random)\b/g);
assertions++; if (interdits) ech.push({ nom: 'source sans Math transcendante', det: interdits.join(',') });
console.log(`${interdits ? 'ECHEC ' : 'OK    '}source : aucune Math transcendante ni Math.random`);
console.log('\nTEMPS :'); for (const s of T.SYSTEMES) { let pire = 0; for (const p of extremes(s)) { const a = performance.now(); T.simuler(s.id, p); pire = Math.max(pire, performance.now() - a); } console.log(`  ${s.id} : pire ${pire.toFixed(0)} ms`); }

const MUTANTS = [
  ['billard : choc avec 1.999 M', 'v2 = ((m - M) * v + 2 * M * V) / (M + m)', 'v2 = ((m - M) * v + 1.999 * M * V) / (M + m)'],
  ['billard : rebond au mur qui perd 0.1 %', 'else if (v < 0) v = -v;', 'else if (v < 0) v = -0.999 * v;'],
  ['billard : theta = atan(m / M)', 'atanD(Math.sqrt(m / M))', 'atanD(m / M)'],
  ['modes : pulsation avec 2 N au lieu de 2 (N + 1)', 'om = 2 * sinD(j * PI / (2 * (N + 1)))', 'om = 2 * sinD(j * PI / (2 * N))'],
  ['modes : ressort central a 2.01', '- 2 * xi + (i > 0 ? xx[i - 1] : 0)', '- 2.01 * xi + (i > 0 ? xx[i - 1] : 0)'],
  ['modes : forme du mode sur N au lieu de N + 1', 'sinD((i + 1) * j * PI / (N + 1))', 'sinD((i + 1) * j * PI / N)'],
  ['tir : gravite 1.01 g', 'const vy2 = vy - dt;', 'const vy2 = vy - 1.01 * dt;'],
  ['tir : angle optimal atan(1 / sqrt(1 + h))', 'atanD(1 / Math.sqrt(1 + 2 * h))', 'atanD(1 / Math.sqrt(1 + h))'],
  ['tir : enveloppe x^2 / 2.1', 'env = (x) => h + 0.5 - x * x / 2;', 'env = (x) => h + 0.5 - x * x / 2.1;'],
  ['pendule : AGM de cos(theta0) au lieu de cos(theta0/2)', 'agm(1, cosD(a0 / 2))', 'agm(1, cosD(a0))'],
  ['pendule : RK4 qui pese 2.01 le 2e etage', 'th += h / 6 * (k1t + 2 * k2t + 2 * k3t + k4t);', 'th += h / 6 * (k1t + 2.01 * k2t + 2 * k3t + k4t);'],
  ['lune : eclaire seulement au-dela de 0.05', 'if (x * sx + Math.sqrt(1 - r2) * sz > 0) lit++;', 'if (x * sx + Math.sqrt(1 - r2) * sz > 0.05) lit++;'],
  ['lune : formule (1 + cos phi) / 2.02', 'Math.max(0, (1 + cosD(phiMax)) / 2)', 'Math.max(0, (1 + cosD(phiMax)) / 2.02)'],
  ['jour : soleil compte au-dessus de 0.01 au lieu de 0', 'if (cp * cosD(h) * cd + sp * sd > 0) n0++;', 'if (cp * cosD(h) * cd + sp * sd > 0.01) n0++;'],
  ['jour : formule 24.1 H0 / pi', 'th = x <= -1 ? 24 : x >= 1 ? 0 : 24 * acosD(x) / PI;', 'th = x <= -1 ? 24 : x >= 1 ? 0 : 24.1 * acosD(x) / PI;'],
  ['course : roulement g sin / (1 + 1.01 k)', 'a = g * st / (1 + k); alpha = a;', 'a = g * st / (1 + 1.01 * k); alpha = a;'],
  ['course : seuil de roulement avec 1.2 mu', 'if (k > 0 && fReq <= fMax + 1e-15)', 'if (k > 0 && fReq <= 1.2 * fMax + 1e-15)'],
  ['course : chaleur comptee a 90 %', 'if (glisse && mu > 0) chaleur += mu * g * ct', 'if (glisse && mu > 0) chaleur += 0.9 * mu * g * ct'],
  ['corps : Planck en lambda^4.9', 'return x > 700 ? 0 : 1 / (l ** 5 * (expD(x) - 1));', 'return x > 700 ? 0 : 1 / (l ** 4.9 * (expD(x) - 1));'],
  ['corps : Wien x = 4.9 (1 - e^-x)', 'const e = expD(-x5), d = (x5 - 5 + 5 * e) / (1 - 5 * e);', 'const e = expD(-x5), d = (x5 - 4.9 + 4.9 * e) / (1 - 4.9 * e);'],
  ['corps : Stefan pi^4 / 15.1', 'const stefan = PI ** 4 / 15,', 'const stefan = PI ** 4 / 15.1,'],
  ['corps : Simpson qui pese 3.9', 'aire += (i === 0 || i === M ? 1 : i % 2 ? 4 : 2) * f * l;', 'aire += (i === 0 || i === M ? 1 : i % 2 ? 3.9 : 2) * f * l;'],
  ['corps : section doree qui descend', 'if (planck(c, T) > planck(d, T)) b = d; else a = c;', 'if (planck(c, T) < planck(d, T)) b = d; else a = c;'],
  ['corps : temperatures espacees sur C au lieu de C - 1', 'temps.push(expD(j / (C - 1) * lnD(P.rapport)));', 'temps.push(expD(j / C * lnD(P.rapport)));'],
  ['reseau : phaseur sin avec 1.01 j phi', 'im += sinD(j * ph); }', 'im += sinD(1.01 * j * ph); }'],
  ['reseau : normalise par k (k + 1)', 'return (re * re + im * im) / (k * k); };', 'return (re * re + im * im) / (k * (k + 1)); };'],
  ['reseau : creux compte au sens large', 'if (b < a && b < c) creux++;', 'if (b <= a || b < c) creux++;'],
  ['reseau : dephasage sur pi au lieu de 2 pi', 'const ph = 2 * PI * r * s; let re = 0', 'const ph = PI * r * s; let re = 0'],
  ['reseau : courbe du milieu decalee', 'Math.round((2 + N) / 2)', 'Math.round((3 + N) / 2)'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-mecanique-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`);
    writeFileSync(f, src.replace(de, vers).replace("from './tam-moteur.js'", `from '${moteur}'`));
    /* le systeme vise par le mutant, d apres son nom ; « bornage » et le reste : tout */
    const cible = { billard: ['billardPi'], modes: ['modesNormaux'], tir: ['paraboleTir'], pendule: ['penduleAmplitude'], lune: ['phasesLune'], jour: ['dureeJour'], course: ['courseRoulante'], corps: ['corpsNoir'], reseau: ['reseauFentes'] }[nom.split(' ')[0]] || null;
    let r; try { r = suite(await import(pathToFileURL(f).href), false, cible); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok); if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-mecanique-20261103 : ${assertions} assertions OK`);
