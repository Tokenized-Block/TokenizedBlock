// test-tam-fusion-20261101.mjs -- banc de tam-fusion.js (fusion de trous noirs a spins alignes, IMRPhenomB) + mutants sur COPIES.
// Lancer : node test-tam-fusion-20261101.mjs
// References (chiffres PUBLIES, pas recopies de la sortie) et tolerances :
//   transcription : Table I d IMRPhenomB (arXiv:0909.2867, source LaTeX, fichier PhysParFits_v873_..._PolCoeffs.txt),
//     Table "table_coeffs" (bloc nM = 1, nJ = 2) de HBR 2016 (arXiv:1605.01938), eq. (fitting_parameters) de BMR 2012
//     (arXiv:1206.3803) : lignes LaTeX COPIEES telles quelles ci-dessous, parsees, comparees aux constantes du module (exact).
//   GW150914 (36 + 29, chi = 0, z = 0.09 ; LIGO PRL 116 061102) : M_f a 4 % de 62, chi_f a 5 % de 0.67, f_220 a 5 % de 250 Hz.
//   GW170104 (31.2 + 19.4, chi_eff = -0.12, z = 0.18, 880 Mpc ; arXiv:1706.01812, macros de la source) :
//     M_f dans l intervalle 90 % [44.1, 54.4] (48.7 -4.6 +5.7), a_f dans [0.44, 0.73] (0.64 -0.20 +0.09).
//   RN : Scheel et al. 2009 (arXiv:0810.1767, q = 1, sans spin) M_f / M = 0.95162 a 0.0004 (incertitude de p0 BMR) et
//     chi_f = 0.68646 a 1e-4 (CONTRAINTE imposee par HBR : verification de transcription, pas une prediction) ;
//     Lovelace et al. 2012 (arXiv:1110.2229, q = 1, spins 0.97 alignes) chi_f = 0.94496 a 0.006 (3 x rms HBR 0.002) ;
//     E_rad = 10.952 % : BMR 2012 donne 9.74 % -> ECART CONNU de 11 % (spin hors de son jeu de calibration), affiche, borne a 15 %.
//   limites masse-test de PhenomB : f_ring^0 a 5 % du mode 220 de Kerr (BCW 2006), f_merg^0 a 5 % de la frequence ISCO
//     de Kerr (Bardeen-Press-Teukolsky, recalculee ici) -- f_ring^0 de PhenomB suit Echeverria 1989 : 0.5 % de Berti a chi = 0,
//     4.5 % a chi = 0.5 (ecart mesure, affiche) ; psi3 (eta -> 0) a 1e-3 de 4 beta - 16 pi, beta = 113 chi / 12 (PN 1.5).
//   spin-orbite ("orbital hang-up") : cycles et duree de fDepart au pic croissants avec chi (-0.6 < 0 < +0.6).
//   df/dt newtonien a 1 % a f = 0.01 Hz (formule recalculee ici depuis m1, m2) ; amplitude du signal (FFT inverse) a 2 % de la
//   phase stationnaire et frequence a 1 % ; amplitude quadrupolaire 4 eta M v^2 / D a 6 % (corrections PN du modele).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-fusion.js');
const ID = 'fusionTrousNoirs';
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const rel = (x, ref) => Math.abs(x - ref) / Math.abs(ref);
const T_SOL = 1.32712440018e20 / (299792458 ** 3), MPC_S = 3.0856775814913673e22 / 299792458;

// ---------- lignes LaTeX copiees telles quelles des sources arXiv ----------
const TABLE_I_PHENOMB = String.raw`
$\psi_2 $ &\vline& $3715/756$ 	 & -920.9 	 & 492.1 	 &   135 	 &  6742 	 & -1053 	 & -1.34$\times 10^{4}$\\
$\psi_3 $ &\vline& $-16 \pi + 113\,\chi/3$ 	 & 1.702$\times 10^{4}$ 	 & -9566 	 & -2182 	 & -1.214$\times 10^{5}$ 	 & 2.075$\times 10^{4}$ 	 & 2.386$\times 10^{5}$\\
$\psi_4 $ &\vline&  $15293365/508032 - 405\,\chi^2/8$ & -1.254$\times 10^{5}$ 	 & 7.507$\times 10^{4}$ 	 & 1.338$\times 10^{4}$ 	 & 8.735$\times 10^{5}$ 	 & -1.657$\times 10^{5}$ 	 & -1.694$\times 10^{6}$\\
$\psi_6 $ &\vline&     0	 & -8.898$\times 10^{5}$ & 6.31$\times 10^{5}$ 	 & 5.068$\times 10^{4}$ 	 & 5.981$\times 10^{6}$ 	 & -1.415$\times 10^{6}$ 	 & -1.128$\times 10^{7}$\\
$\psi_7 $ &\vline&     0	 & 8.696$\times 10^{5}$ & -6.71$\times 10^{5}$ 	 & -3.008$\times 10^{4}$ 	 & -5.838$\times 10^{6}$ 	 & 1.514$\times 10^{6}$ 	 & 1.089$\times 10^{7}$\\
$\fmerg$ &\vline& $1 - 4.455(1-\chi)^{0.217} + 3.521(1-\chi)^{0.26}$ & 0.6437 	 & 0.827 	 & -0.2706 	 & -0.05822 	 & -3.935 	 & -7.092\\
$\fring$ &\vline& $[1-0.63(1-\chi)^{0.3}]/2$  & 0.1469 	 & -0.1228 	 & -0.02609 	 & -0.0249 	 & 0.1701 	 & 2.325\\
$\sigma$ &\vline&  $[1-0.63(1-\chi)^{0.3}]\, (1-\chi)^{0.45}/4$ & -0.4098 	 & -0.03523 	 & 0.1008 	 & 1.829 	 & -0.02017 	 & -2.87\\
$\fcut $  &\vline& $0.3236 + 0.04894 \,\chi + 0.01346\, \chi^2$ 	 & -0.1331 	 & -0.08172 	 & 0.1451 	 & -0.2714 	 & 0.1279 	 & 4.922\\`;
const HBR_LIGNE = String.raw`\!\!\!$-1.2019$ & \!\!\!$-1.20764$ & \!\!\!$3.79245$ & \!\!\!$1.18385$ & \!\!\!$4.90494$& \!\!\!$0.41616$ \\`;
const BMR_LIGNE = String.raw`p_0=0.04827\pm0.00039\,,\quad p_1=0.01707\pm0.00032 \,,`;
const nombre = (c) => { const s = c.replace(/\\!/g, '').replace(/\$/g, '').trim(), m = s.match(/^(-?[\d.]+)(?:\\times 10\^\{(-?\d+)\})?$/); if (!m) throw new Error('cellule illisible: ' + c); return Number(m[2] ? m[1] + 'e' + m[2] : m[1]); };
function lireTableI() {
  const o = {}, noms = { '\\psi_2': 'psi2', '\\psi_3': 'psi3', '\\psi_4': 'psi4', '\\psi_6': 'psi6', '\\psi_7': 'psi7', '\\fmerg': 'fMerg', '\\fring': 'fRing', '\\sigma': 'sigma', '\\fcut': 'fCut' };
  for (const l of TABLE_I_PHENOMB.trim().split('\n')) {
    const c = l.replace(/\\\\\s*$/, '').split('&'), nom = noms[c[0].replace(/\$/g, '').trim()];
    if (!nom) throw new Error('ligne inconnue: ' + c[0]);
    o[nom] = c.slice(3).map(nombre);
  }
  return o;
}

// ---------- verifications independantes (formules recalculees ici, Math natif permis dans le banc) ----------
function rIscoKerr(a) { /* Bardeen, Press & Teukolsky 1972 */
  const Z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a)), Z2 = Math.sqrt(3 * a * a + Z1 * Z1);
  return 3 + Z2 - Math.sign(a || 1) * Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2));
}
const piMfIscoGW = (a) => 1 / (rIscoKerr(a) ** 1.5 + a); /* pi M f_GW = M Omega_ISCO (f_GW = 2 f_orb) */
const piMfQnmBerti = (j) => (1.5251 - 1.1568 * (1 - j) ** 0.1292) / 2; /* BCW 2006 Table 8, M_f = M (masse test) */

function suite(T, texte, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const sim = (p, o) => T.simuler(ID, p, o);
  const S = T.SYSTEMES && T.SYSTEMES[0];
  // 1. forme
  ok('SYSTEMES gele, 1 systeme fusionTrousNoirs, 3 <= D <= 12, phrase honnete', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES) && Object.isFrozen(S) && Object.isFrozen(S.params) && Object.isFrozen(S.bornes));
    assert.equal(T.SYSTEMES.length, 1); assert.equal(S.id, ID); assert.ok(S.D >= 3 && S.D <= 12);
    for (const k of ['id', 'nom', 'science', 'D', 'params', 'bornes', 'phrase']) assert.ok(k in S, k);
    assert.ok(/IMRPhenomB/.test(S.phrase) && /phenomenological model fitted to numerical relativity, not a numerical-relativity simulation/.test(S.phrase));
    assert.deepEqual(S.bornes.chi1, [-0.9, 0.9]); assert.deepEqual(S.bornes.chi2, [-0.9, 0.9]);
  });
  let def = null;
  ok('defaut (GW150914) : bornee, brut n*D fini, points null, lyapunov null', () => {
    const r = def = sim();
    assert.equal(r.bornee, true, r.raison); assert.equal(r.n, 1500); assert.equal(r.D, S.D); assert.equal(r.points, null); assert.equal(r.lyapunov, null);
    assert.ok(r.brut instanceof Float64Array && r.brut.length === r.n * r.D);
    for (let i = 0; i < r.brut.length; i++) assert.ok(Number.isFinite(r.brut[i]), 'non fini en ' + i);
    for (const k of ['params', 'D', 'n', 'bornee', 'brut', 'lyapunov', 'uniteLyapunov', 'points', 'invariants']) assert.ok(k in r, k);
  });
  ok('determinisme : deux appels -> memes octets (n = 1500 et n = 300)', () => {
    assert.ok(octets(sim().brut).equals(octets(def.brut)));
    assert.ok(octets(sim({}, { n: 300 }).brut).equals(octets(sim({}, { n: 300 }).brut)));
    assert.equal(sim({}, { n: 300 }).brut.length, 300 * S.D);
  });
  ok('bornes : hors bornes ramene, NaN -> defaut, rapport de masses <= 10, reglagesPhysique', () => {
    const r = sim({ m1: 1e9, m2: -5, chi1: 3, chi2: -3, z: 9, distance: 0, inclinaison: 999, fDepart: 1 });
    assert.deepEqual(r.params, { m1: 100, m2: 10, chi1: 0.9, chi2: -0.9, z: 1, distance: 10, inclinaison: 180, fDepart: 10 });
    assert.equal(r.bornee, true, r.raison);
    assert.deepEqual(sim({ m1: NaN, chi1: 'x' }).params, { ...S.params });
    const g = T.reglagesPhysique(ID, { chi1: 5 });
    assert.equal(g.length, Object.keys(S.params).length); assert.equal(g.find((x) => x.nom === 'chi1').valeur, 0.9);
    assert.throws(() => T.simuler('inconnu'));
  });
  ok('aucune fonction transcendante native ni Math.random dans le module', () => {
    const code = texte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const m = code.match(/Math\.(sin|cos|tan|exp|log|pow|atan2?|asin|acos|hypot|cbrt|sinh|cosh|tanh|expm1|log1p|log2|log10|random)\b/g);
    assert.equal(m, null, String(m));
  });
  // 2. transcription (lignes LaTeX copiees -> constantes du module)
  ok('Table I PhenomB (arXiv:0909.2867) : 54 coefficients x, y identiques a la source LaTeX', () => {
    const t = lireTableI();
    for (const k of ['psi2', 'psi3', 'psi4', 'psi6', 'psi7']) assert.deepEqual([...T.PHENOMB_X[k]], t[k], k);
    for (const k of ['fMerg', 'fRing', 'sigma', 'fCut']) assert.deepEqual([...T.PHENOMB_Y[k]], t[k], k);
    return '54/54';
  });
  ok('HBR 2016 (nM = 1, nJ = 2) et BMR 2012 (p0, p1) identiques a la source LaTeX', () => {
    const h = HBR_LIGNE.replace(/\\\\\s*$/, '').split('&').map(nombre);
    assert.deepEqual([T.HBR.k01, T.HBR.k02, T.HBR.k10, T.HBR.k11, T.HBR.k12, T.HBR.xi], h);
    const p = BMR_LIGNE.match(/p_0=([\d.]+).*p_1=([\d.]+)/);
    assert.equal(T.BMR.p0, Number(p[1])); assert.equal(T.BMR.p1, Number(p[2]));
  });
  // 3. limites masse-test de PhenomB contre la physique de Kerr (calculee ici)
  ok('PhenomB eta -> 0 : f_ring a 5 % du mode 220 de Kerr (Berti), f_merg a 5 % de l ISCO de Kerr (chi = 0, 0.5)', () => {
    const d = [];
    for (const c of [0, 0.5]) {
      const p = T.phenomB(1e-9, c), a = rel(p.fRing, piMfQnmBerti(c)), b = rel(p.fMerg, piMfIscoGW(c));
      assert.ok(a < 0.05, `fRing chi ${c} : ${a}`); assert.ok(b < 0.05, `fMerg chi ${c} : ${b}`); d.push(`chi ${c}: ${(a * 100).toFixed(2)} % / ${(b * 100).toFixed(2)} %`);
    }
    return d.join(' ; ');
  });
  ok('PhenomB eta -> 0 : psi3 = 4 beta - 16 pi, beta = 113 chi / 12 (spin-orbite 1.5PN, a 1e-3)', () => {
    for (const c of [-0.8, 0, 0.8]) { const p = T.phenomB(1e-9, c); assert.ok(Math.abs(p.psi[3] - (4 * 113 / 12 * c - 16 * Math.PI)) < 1e-3, `${c}: ${p.psi[3]}`); }
  });
  // 4. GW150914
  ok('GW150914 : masse de chirp = (m1 m2)^(3/5) / M^(1/5) (recalculee) a 1e-9', () => {
    const m = def.invariants.masseChirp.mesure, ref = (36 * 29) ** 0.6 / 65 ** 0.2; assert.ok(rel(m, ref) < 1e-9, `${m} / ${ref}`);
    assert.ok(rel(def.invariants.spins.eta, 36 * 29 / 65 ** 2) < 1e-12); return m.toFixed(3);
  });
  ok('GW150914 : masse finale a 4 % de 62, spin final a 5 % de 0.67 (LIGO 2016)', () => {
    const R = def.invariants.resteFinal; assert.ok(rel(R.masse, 62) < 0.04, String(R.masse)); assert.ok(rel(R.spin, 0.67) < 0.05, String(R.spin));
    return `M_f ${R.masse.toFixed(2)}, chi_f ${R.spin.toFixed(4)}`;
  });
  ok('GW150914 : mode 220 (Berti 2006 sur le reste HBR/BMR) a 5 % de 250 Hz', () => {
    const f = def.invariants.ringdown.frequence; assert.ok(rel(f, 250) < 0.05, String(f));
    return `${f.toFixed(1)} Hz (PhenomB f_ring ${def.invariants.ringdown.fRingPhenomB.toFixed(1)} Hz, sonnerie mesuree ${def.invariants.ringdown.frequenceMesuree.toFixed(1)} Hz)`;
  });
  ok('GW150914 : sonnerie mesuree sur le signal entre f_ring PhenomB et 1.02 x f_220', () => {
    const g = def.invariants.ringdown; assert.ok(g.frequenceMesuree > g.fRingPhenomB && g.frequenceMesuree < 1.02 * g.frequence, JSON.stringify(g));
  });
  // 5. GW170104 et RN
  ok('GW170104 (31.2 + 19.4, chi_eff -0.12) : M_f dans [44.1, 54.4], a_f dans [0.44, 0.73] (LIGO 2017, 90 %)', () => {
    const R = sim({ m1: 31.2, m2: 19.4, chi1: -0.12, chi2: -0.12, z: 0.18, distance: 880 }).invariants.resteFinal;
    assert.ok(R.masse > 44.1 && R.masse < 54.4, String(R.masse)); assert.ok(R.spin > 0.44 && R.spin < 0.73, String(R.spin));
    return `M_f ${R.masse.toFixed(2)} (LIGO 48.7), a_f ${R.spin.toFixed(3)} (LIGO 0.64, avec composantes dans le plan)`;
  });
  ok('Scheel 2009 (RN, q = 1, sans spin) : M_f / M a 4e-4 de 0.95162 ; chi_f a 1e-4 de 0.68646 (contrainte HBR)', () => {
    const R = T.resteAligne(1, 1, 0, 0); assert.ok(Math.abs(R.Mf - 0.95162) < 4e-4, String(R.Mf)); assert.ok(Math.abs(R.chi - 0.68646) < 1e-4, String(R.chi));
    return `M_f ${R.Mf.toFixed(5)}, chi_f ${R.chi.toFixed(5)}`;
  });
  ok('Lovelace 2012 (RN, q = 1, spins 0.97 alignes) : chi_f a 0.006 de 0.94496 ; E_rad 10.952 % (ecart BMR connu, < 15 %)', () => {
    const R = T.resteAligne(1, 1, 0.97, 0.97); assert.ok(Math.abs(R.chi - 0.94496) < 0.006, String(R.chi));
    const e = rel(R.Erad, 0.10952); assert.ok(e < 0.15, String(R.Erad));
    return `chi_f ${R.chi.toFixed(5)} ; E_rad ${(R.Erad * 100).toFixed(2)} % contre 10.952 % (RATE de ${(e * 100).toFixed(1)} %)`;
  });
  ok('reste : spins alignes -> spin final et energie rayonnee plus grands (monotone en chi)', () => {
    let pc = -Infinity, pe = -Infinity;
    for (const c of [-0.9, -0.5, 0, 0.5, 0.9]) { const R = T.resteAligne(36, 29, c, c); assert.ok(R.chi > pc && R.Erad > pe, String(c)); pc = R.chi; pe = R.Erad; }
  });
  // 6. spin-orbite : orbital hang-up
  ok('spin-orbite : chi -0.6 < 0 < +0.6 -> plus de cycles et une spirale plus longue (30 + 30, fDepart 20 Hz)', () => {
    const c = [-0.6, 0, 0.6].map((x) => sim({ m1: 30, m2: 30, chi1: x, chi2: x }).invariants.signal);
    assert.ok(c[0].cycles < c[1].cycles && c[1].cycles < c[2].cycles, c.map((s) => s.cycles).join());
    assert.ok(c[0].duree < c[1].duree && c[1].duree < c[2].duree, c.map((s) => s.duree).join());
    return c.map((s) => `${s.cycles.toFixed(2)} cycles / ${s.duree.toFixed(3)} s`).join(' < ');
  });
  // 7. limite newtonienne, phase stationnaire, amplitude
  ok('df/dt newtonien a 1 % a 0.01 Hz : (96/5) pi^(8/3) Mc^(5/3) f^(11/3), Mc recalcule depuis m1, m2 (3 cas)', () => {
    const d = [];
    for (const p of [{}, { m1: 40, m2: 10, chi1: 0.6, chi2: -0.3 }, { m1: 8, m2: 6, z: 0.5 }]) {
      const r = sim(p), P = r.params, L = r.invariants.limiteNewton, Mc = (P.m1 * P.m2) ** 0.6 / (P.m1 + P.m2) ** 0.2 * (1 + P.z) * T_SOL;
      const ref = 96 / 5 * Math.PI ** (8 / 3) * Mc ** (5 / 3) * 0.01 ** (11 / 3), e = rel(L.mesure, ref);
      assert.ok(e < 0.01, `${JSON.stringify(p)} : ${e}`); d.push((e * 100).toFixed(2) + ' %');
    }
    return d.join(', ');
  });
  ok('FFT inverse contre phase stationnaire au debut de spirale : amplitude a 2 %, frequence a 1 % (3 cas)', () => {
    const d = [];
    for (const p of [{}, { m1: 30, m2: 30, chi1: 0.6, chi2: 0.6 }, { m1: 10, m2: 10, fDepart: 10, z: 0 }]) {
      const s = sim(p).invariants.phaseStationnaire; assert.ok(s, 'pas de point de verification');
      const a = rel(s.ampMesure, s.ampPhaseStationnaire), f = rel(s.fMesure, s.f); assert.ok(a < 0.02 && f < 0.01, `${a} ${f}`); d.push(`${(a * 100).toFixed(2)} % / ${(f * 100).toFixed(2)} %`);
    }
    return d.join(' ; ');
  });
  ok('amplitude du signal a 6 % de l amplitude quadrupolaire 4 eta M v^2 / D (recalculee ; 2 cas)', () => {
    const d = [];
    for (const p of [{}, { m1: 10, m2: 10, fDepart: 10, z: 0 }]) {
      const r = sim(p), P = r.params, s = r.invariants.phaseStationnaire, ms = P.m1 + P.m2, eta = P.m1 * P.m2 / ms / ms, M = ms * (1 + P.z) * T_SOL;
      const v = Math.cbrt(Math.PI * M * s.f), e = rel(s.ampMesure, 4 * eta * M * v * v / (P.distance * MPC_S));
      assert.ok(e < 0.06, String(e)); d.push((e * 100).toFixed(2) + ' %');
    }
    return d.join(', ');
  });
  ok('chirp : frequence croissante (1 point sur 25) de fDepart au pic, ondulation < 1 % ; amplitude en 1 / distance', () => {
    const b = def.brut, nI = def.n - Math.round(def.n / 4);
    for (let i = 25; i < nI; i += 25) assert.ok(b[i * 4 + 3] > b[(i - 25) * 4 + 3], 'point ' + i);
    for (let i = 1; i < nI; i++) assert.ok(b[i * 4 + 3] > 0.99 * b[(i - 1) * 4 + 3], 'ondulation ' + i);
    assert.ok(rel(b[3], 20) < 0.01, String(b[3]));
    const a = def.invariants.signal.strainMax, c = sim({ distance: 820 }).invariants.signal.strainMax; assert.ok(rel(a / c, 2) < 1e-9, String(a / c));
    return `pic ${def.invariants.signal.fPic.toFixed(1)} Hz, h_max ${a.toExponential(3)}`;
  });
  ok('inclinaison 90 degres : hx nul (cos 90 deg), h+ divise par 2', () => {
    const r = sim({ inclinaison: 90 }); let mx = 0, rp = 0;
    for (let i = 0; i < r.n; i++) { mx = Math.max(mx, Math.abs(r.brut[i * 4 + 2])); rp = Math.max(rp, Math.abs(r.brut[i * 4 + 1])); }
    let p0 = 0; for (let i = 0; i < def.n; i++) p0 = Math.max(p0, Math.abs(def.brut[i * 4 + 1]));
    assert.ok(mx < 1e-12 * rp, String(mx)); assert.ok(rel(rp / p0, 0.5) < 1e-9, String(rp / p0));
  });
  ok('coin des bornes (100 + 100, z = 1 ; 100 + 10, chi 0.9) : bornee et fini', () => {
    for (const p of [{ m1: 100, m2: 100, z: 1 }, { m1: 100, m2: 10, chi1: 0.9, chi2: 0.9 }, { m1: 5, m2: 5, chi1: -0.9, chi2: -0.9, fDepart: 40 }]) { const r = sim(p); assert.equal(r.bornee, true, JSON.stringify(p) + ' ' + r.raison); }
  });
  return res;
}

// ---------- banc ----------
const texte = readFileSync(SOURCE, 'utf8');
const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, texte, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
console.log('\nTEMPS simuler (mediane de 3) :');
const chrono = (p, n) => { const t = []; for (let k = 0; k < 3; k++) { const a = performance.now(); T.simuler(ID, p, { n }); t.push(performance.now() - a); } return t.sort((a, b) => a - b)[1]; };
const ms = chrono({}, 1500);
console.log(`  defaut (GW150914), n = 1500 : ${ms.toFixed(1)} ms`);
assertions++; if (!(ms < 300)) ech.push({ nom: 'temps < 300 ms', det: ms.toFixed(1) });
console.log(`  pire coin (5 + 5, fDepart 10 Hz, z = 0 ; ~2000 cycles, FFT de 2^20) : ${chrono({ m1: 5, m2: 5, fDepart: 10, z: 0 }, 1500).toFixed(1)} ms (non borne)`);

// ---------- mutants (copies dans un dossier temporaire ; l import du moteur pointe vers l original) ----------
const MUTANTS = [
  ['PhenomB : coefficient y10 de f_ring 0.1469 -> 0.1569', '0.1469', '0.1569'],
  ['PhenomB : x10 de psi2 -920.9 -> -820.9', '-920.9', '-820.9'],
  ['spin-orbite : signe de 113 chi / 3 inverse', '-16 * PI + 113 / 3 * chi', '-16 * PI - 113 / 3 * chi'],
  ['reste : terme nu^3 de HBR retire', ' + n3 * (HBR.k10 + HBR.k11 * aEff + HBR.k12 * aEff * aEff)', ''],
  ['reste : xi HBR 0.41616 -> 0.51616', 'xi: 0.41616', 'xi: 0.51616'],
  ['reste : p0 BMR 0.04827 -> 0.05827', 'p0: 0.04827', 'p0: 0.05827'],
  ['QNM : coefficient f2 de Berti -1.1568 -> -1.0568', 'f2: -1.1568', 'f2: -1.0568'],
  ['eta faux : m1 m2 / M^2 -> 1.1 m1 m2 / M^2', 'eta = P.m1 * P.m2 / (ms * ms)', 'eta = 1.1 * P.m1 * P.m2 / (ms * ms)'],
  ['nu faux dans le reste : q / (1+q)^2 -> q / (1+q)', 'nu = q / ((1 + q) * (1 + q))', 'nu = q / (1 + q)'],
  ['phase : 3 / (128 eta) -> 3 / (64 eta)', '3 / (128 * eta * v2 * v2 * v)', '3 / (64 * eta * v2 * v2 * v)'],
  ['amplitude : sqrt(5 eta / 24) -> sqrt(5 eta / 12)', 'Math.sqrt(5 * eta / 24)', 'Math.sqrt(5 * eta / 12)'],
  ['FFT : signe du twiddle inverse (FFT directe)', 'S[k] = sinD(a);', 'S[k] = -sinD(a);'],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['Math.exp natif injecte', 'return k < -1070 ? 0 : s * 2 ** k;', 'return Math.exp(x);'],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-fusion-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = texte.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`), mute = texte.replace(de, vers);
    writeFileSync(f, mute.replace("from './tam-moteur.js'", `from '${moteur}'`));
    let r; try { r = suite(await import(pathToFileURL(f).href), mute); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-fusion-20261101 : ${assertions} assertions OK`);
