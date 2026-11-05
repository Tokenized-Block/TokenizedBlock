// test-tam-maths-20261103.mjs -- banc de tam-maths.js (mathematiques du hasard et des nombres, vue non frappable) + mutants sur COPIES.
// Lancer : node test-tam-maths-20261103.mjs
// serie-delai-s: 900 — MESURE 2026-11-05 : 294 s SEUL (13 systemes, 66 mutants rejouant toute la suite), DELAI 300 s sous la charge d une serie a 3.
// Le banc a le droit a Math.exp/log/sin/cos : ses references sont calculees independamment du module :
//   marche : E[r^2] et E[r^4] par ENUMERATION des 4^n chemins (n = 1..7) ; Buffon : 2 l / pi par quadrature de Simpson de (l/pi) sin ;
//   anniversaires : le produit par exp(sum ln) ; Ulam : pi(N) par DIVISION D ESSAI, Li(N) en u = ln t (200 000 points), la spirale
//   reimplementee ici (marche le long des cotes) pour placer chaque premier dessine.
// Tolerances annoncees (mesurees le 2026-11-03, 40 graines par reglage) : |z| < 5 ; etalonnage sd des z dans [0.5, 1.7] (mesure 0.71..1.24).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ICI, 'tam-maths.js');
const octets = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
const IDS = ['marcheAleatoire', 'aiguilleBuffon', 'anniversaires', 'spiraleUlam', 'pascalSierpinski', 'solidesPlatoniques', 'montyHall', 'apollonius', 'tasDeSable', 'vergerEuclide', 'cerclesFord', 'fermatSteiner', 'causticTasse', 'papillonHofstadter', 'dominosKasteleyn', 'ising', 'aztecDiamond', 'collectionneur', 'ruineJoueur', 'catalanDyck', 'partitionEuler', 'courbeDragon', 'theoremePick', 'percolationLiens', 'napoleon', 'billardElliptique', 'feuerbach', 'jeuDeLaVie'];

// ---------- references independantes ----------
function momentsMarche(n) { let s2 = 0, s4 = 0, tot = 0; const rec = (k, x, y) => { if (k === n) { const r2 = x * x + y * y; s2 += r2; s4 += r2 * r2; tot++; return; } rec(k + 1, x + 1, y); rec(k + 1, x - 1, y); rec(k + 1, x, y + 1); rec(k + 1, x, y - 1); }; rec(0, 0, 0); return { m2: s2 / tot, m4: s4 / tot }; }
function buffonRef(l) { const M = 2000, h = Math.PI / M; let s = 0; for (let i = 0; i <= M; i++) s += (i === 0 || i === M ? 1 : i % 2 ? 4 : 2) * (l / Math.PI) * Math.sin(i * h); return s * h / 3; }
const anniversRef = (k, D) => { let s = 0; for (let i = 0; i < k; i++) s += Math.log(1 - i / D); return 1 - Math.exp(s); };
const estPremier = (m) => { if (m < 2) return false; for (let d = 2; d * d <= m; d++) if (m % d === 0) return false; return true; };
/* Li(N) en u = ln t, Simpson sur 200 000 intervalles, Math.exp (10 fois plus fin que le module, autre exponentielle) */
function LiRef(N) { const M = 200000, a = Math.log(2), b = Math.log(N), h = (b - a) / M, f = (u) => Math.exp(u) / u; let s = f(a) + f(b); for (let i = 1; i < M; i++) s += (i % 2 ? 4 : 2) * f(a + i * h); return s * h / 3; }
/* spirale d Ulam reimplementee : on marche 1, 1, 2, 2, 3, 3... pas, en tournant (droite, haut, gauche, bas) */
function spiraleRef(N) { const P = new Map(); let x = 0, y = 0, m = 1, d = 0, L = 1; const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]]; P.set(1, [0, 0]);
  while (m < N) { for (let rep = 0; rep < 2 && m < N; rep++) { for (let s = 0; s < L && m < N; s++) { x += dirs[d][0]; y += dirs[d][1]; m++; P.set(m, [x, y]); } d = (d + 1) % 4; } L++; } return P; }
/* tas de sable : references INDEPENDANTES du module. Stabiliser par balayages de toute la grille (un grain a la fois) ; recurrentes
 *   comptees comme l ORBITE du tas plein (3 partout) quand on ajoute des grains (definition de Dhar), pas par le test de brulage ;
 *   det du Laplacien par le produit de ses valeurs propres 4 - 2 cos(i pi/(c+1)) - 2 cos(j pi/(c+1)) (Math.cos, arrondi) */
function stabRef(h, c) { let chg = true; while (chg) { chg = false; for (let y = 0; y < c; y++) for (let x = 0; x < c; x++) { const i = y * c + x; while (h[i] >= 4) { h[i] -= 4; chg = true; if (x > 0) h[i - 1]++; if (x < c - 1) h[i + 1]++; if (y > 0) h[i - c]++; if (y < c - 1) h[i + c]++; } } } return h; }
function orbiteRef(c) { const N = c * c, vu = new Uint8Array(4 ** N), cle = (h) => { let k = 0; for (let i = N - 1; i >= 0; i--) k = 4 * k + h[i]; return k; }, de = (k) => { const h = new Int32Array(N); for (let i = 0; i < N; i++) { h[i] = k & 3; k >>= 2; } return h; };
  const file = [cle(new Int32Array(N).fill(3))]; vu[file[0]] = 1; for (let q = 0; q < file.length; q++) for (let i = 0; i < N; i++) { const h = de(file[q]); h[i]++; const k = cle(stabRef(h, c)); if (!vu[k]) { vu[k] = 1; file.push(k); } } return file.length; }
const detValeursPropres = (c) => { let p = 1; for (let i = 1; i <= c; i++) for (let j = 1; j <= c; j++) p *= 4 - 2 * Math.cos(i * Math.PI / (c + 1)) - 2 * Math.cos(j * Math.PI / (c + 1)); return Math.round(p); };
const ORBITES = [orbiteRef(2), orbiteRef(3)];
/* verger : references INDEPENDANTES. Visible = aucun diviseur commun > 1 trouve par ESSAI (pas Euclide) ; phi(k) et mu(k) par
 *   factorisation par essai (pas de crible) ; 6/pi^2 par Math.PI */
/* tous les points dessines dans le rectangle [0, L] x [0, m] */
const x0ok = (b, n, L, m) => { for (let q = 0; q < n; q++) { const o = 3 * q; if (b[o] < 0 || b[o] > L || b[o + 1] < 0 || b[o + 1] > m) return false; } return true; };
/* p(n) pour n <= 30, par le comptage par pieces recopie ici (verification croisee de l enumeration) */
const partPieces30 = (N) => { const p = new Array(N + 1).fill(0); p[0] = 1; for (let k = 1; k <= N; k++) for (let m = k; m <= N; m++) p[m] += p[m - k]; return p[N]; };
const vergerRef = (N) => { let V = 0; for (let a = 1; a <= N; a++) for (let b = 1; b <= N; b++) { let ok = true; for (let d = 2; d <= Math.min(a, b) && ok; d++) if (a % d === 0 && b % d === 0) ok = false; if (ok) V++; } return V; };
const facteurs = (k) => { const f = []; for (let p = 2; p * p <= k; p++) if (k % p === 0) { let e = 0; while (k % p === 0) { k /= p; e++; } f.push([p, e]); } if (k > 1) f.push([k, 1]); return f; };
/* Ford : F_n par l algorithme des MEDIANTS (terme suivant (a, b, c, d) -> (c, d, k c - a, k d - b), k = floor((n + b)/d)), pas par
 *   enumeration ; meme methode que les valeurs de controle de Grok Bot (|F_5| = 11, |F_8| = 23, |F_20| = 129) */
const fareyRef = (n) => { const out = [[0, 1]]; let a = 0, b = 1, c = 1, d = n; while (c <= n) { out.push([c, d]); const k = Math.floor((n + b) / d); [a, b, c, d] = [c, d, k * c - a, k * d - b]; } return out; };
const phiRef = (k) => facteurs(k).reduce((r, [p, e]) => r * (p - 1) * p ** (e - 1), 1), muRef = (k) => { const f = facteurs(k); return f.some(([, e]) => e > 1) ? 0 : (f.length % 2 ? -1 : 1); };
function identiteRef(c) { const N = c * c, s = stabRef(new Int32Array(N).fill(6), c), e = new Int32Array(N); for (let i = 0; i < N; i++) e[i] = 6 - s[i]; return stabRef(e, c); }
function standardiser(b, n, D, groupes = []) {
  const z = new Float64Array(n * D), moy = [], et = [];
  for (let j = 0; j < D; j++) { let m = 0; for (let i = 0; i < n; i++) m += b[i * D + j]; m /= n; let v = 0; for (let i = 0; i < n; i++) v += (b[i * D + j] - m) ** 2; moy.push(m); et.push(Math.sqrt(v / n)); }
  for (const g of groupes) { const e = Math.sqrt(g.reduce((a, j) => a + et[j] * et[j], 0) / g.length); for (const j of g) et[j] = e; }
  for (let j = 0; j < D; j++) { const s = et[j] > 0 ? 1 / et[j] : 0; for (let i = 0; i < n; i++) z[i * D + j] = (b[i * D + j] - moy[j]) * s; }
  return z;
}
const ecartDessin = (a, b) => { let t = 0; for (let i = 0; i < a.length; i++) t += Math.abs(a[i] - b[i]); return t / a.length; };
function extremes(s) {
  const ks = Object.keys(s.params), cs = [{}];
  for (const k of ks) { cs.push({ [k]: s.bornes[k][0] }); cs.push({ [k]: s.bornes[k][1] }); }
  cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][0]]))); cs.push(Object.fromEntries(ks.map((k) => [k, s.bornes[k][1]])));
  return cs;
}
const z = (v) => (v.mesure - v.formule) / v.sigma;
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);
const SPIRALE = spiraleRef(40000);

/* 2026-11-05 (le banc depassait 300 s, 294 s seul : chaque mutant relancait les 19 systemes) : un mutant ne relance que les tests de SON
 *   systeme (seul = liste d ids ; null = tout), comme test-tam-mecanique (game126). Un test est rattache a un systeme par le premier mot
 *   de son nom ; « etalonnage » couvre marche, Buffon, anniversaires ; tout autre premier mot (SYSTEMES, bornage...) tourne toujours. */
const RATTACHE = { marche: ['marcheAleatoire'], etalonnage: ['marcheAleatoire', 'aiguilleBuffon', 'anniversaires'] };
function suite(T, bavard = false, seul = null) {
  const res = [];
  const ok = (nom, f) => {
    if (seul) { const tete = String(nom).split(/[\s:]/)[0], ids = T.SYSTEMES.some((s) => s.id === tete) ? [tete] : RATTACHE[tete] || null; if (ids && !ids.some((i) => seul.includes(i))) return; }
    let c = false, det = '';
    try { const r = f(); c = r !== false; if (typeof r === 'string') det = r; } catch (e) { det = e.message.split('\n')[0]; }
    res.push({ nom, ok: c, det }); if (bavard) console.log((c ? 'OK    ' : 'ECHEC ') + nom + (det ? '  ' + det : ''));
  };
  const cache = new Map(), S = (id, p = {}) => { const k = id + JSON.stringify(p); if (!cache.has(k)) cache.set(k, T.simuler(id, p)); return cache.get(k); };
  const sys = (id) => T.SYSTEMES.find((s) => s.id === id);
  ok('SYSTEMES gele, 7 systemes, SOURCES vide, COLONNES couvre chaque colonne, ENTIERS par systeme', () => {
    assert.ok(Object.isFrozen(T.SYSTEMES)); assert.deepEqual(T.SYSTEMES.map((s) => s.id), IDS); assert.equal(Object.keys(T.SOURCES).length, 0); assert.deepEqual(Object.keys(T.ENTIERS), IDS);
    for (const s of T.SYSTEMES) { const C = T.COLONNES[s.id]; assert.equal(C.colonnes.length, s.D); assert.deepEqual([...C.memeLongueur.flat(), ...C.autres].sort(), [...Array(s.D).keys()]); }
  });
  for (const s of T.SYSTEMES) {
    ok(`${s.id} : bornee, brut n*D fini, lyapunov null, phrase anglaise sans accent`, () => {
      const r = S(s.id); assert.equal(r.bornee, true, r.raison); assert.equal(r.D, s.D); assert.equal(r.brut.length, 1500 * s.D);
      assert.equal(r.lyapunov, null); assert.ok(/^A visualisation of /.test(s.phrase) && !/[^\x20-\x7e]/.test(s.phrase + s.nom));
    });
    ok(`${s.id} : determinisme`, () => { const a = T.simuler(s.id, {}), b = T.simuler(s.id, {}); assert.ok(octets(a.brut).equals(octets(b.brut))); assert.equal(JSON.stringify(a.invariants), JSON.stringify(b.invariants)); });
    ok(`${s.id} : petits n (2 et 7) bornes et finis`, () => { for (const n of [2, 7]) { const r = T.simuler(s.id, {}, { n }); assert.ok(r.bornee && r.brut.length === n * s.D); } });
    ok(`${s.id} : bornee a chaque extreme de curseur`, () => { const e = extremes(s); for (const p of e) assert.ok(S(s.id, p).bornee, JSON.stringify(p)); return e.length + ' reglages'; });
    ok(`${s.id} : chaque curseur change le DESSIN (standardise), min et max`, () => {
      const C = T.COLONNES[s.id], d0 = S(s.id), z0 = standardiser(d0.brut, d0.n, d0.D, C.memeLongueur), out = [];
      for (const k of Object.keys(s.params)) for (const v of s.bornes[k]) { if (v === s.params[k]) continue; const r = S(s.id, { [k]: v }), e = ecartDessin(z0, standardiser(r.brut, r.n, r.D, C.memeLongueur)); assert.ok(e > 1e-3, k + '=' + v + ' : ' + e); out.push(k + ' ' + e.toFixed(2)); }
      return out.join(' ; ');
    });
  }
  ok('marche : E[r^2] = n et E[r^4] = 2 n^2 - n par enumeration des 4^n chemins (n = 1..7)', () => { for (let n = 1; n <= 7; n++) { const m = momentsMarche(n); assert.ok(Math.abs(m.m2 - n) < 1e-12 && Math.abs(m.m4 - (2 * n * n - n)) < 1e-9, 'n ' + n + ' ' + JSON.stringify(m)); } });
  for (const p of extremes(sys('marcheAleatoire'))) ok(`marcheAleatoire ${JSON.stringify(p)} : <r^2> = n, sigma sqrt((n^2 - n)/M), chemins de pas unitaires`, () => {
    const R = S('marcheAleatoire', p), P = R.params, I = R.invariants, b = R.brut, N = P.pas, M = P.marcheurs;
    assert.equal(I.carreDistance.formule, N); assert.ok(rel(I.carreDistance.sigma, Math.sqrt((N * N - N) / M)) < 1e-12); assert.ok(Math.abs(z(I.carreDistance)) < 5, 'r2 z ' + z(I.carreDistance));
    assert.ok(rel(I.centre.sigma, Math.sqrt(N / (2 * M))) < 1e-12 && Math.abs(z(I.centre)) < 5, 'centre z ' + z(I.centre));
    for (let f = 0; f < R.film.images; f++) { const d0 = R.film.debuts[f], c = R.film.tailles[f]; assert.ok(b[3 * d0] === 0 && b[3 * d0 + 1] === 0 && b[3 * d0 + 2] === 0, 'depart a l origine');
      for (let q = 1; q < c; q++) { const o = 3 * (d0 + q), dn = b[o + 2] - b[o - 1]; assert.ok(dn >= 0 && Math.abs(b[o] - b[o - 3]) + Math.abs(b[o + 1] - b[o - 2]) <= dn && (Math.abs(b[o] - b[o - 3]) + Math.abs(b[o + 1] - b[o - 2]) - dn) % 2 === 0, 'pas unitaires, parite'); } }
    return `r2 ${I.carreDistance.mesure.toFixed(2)}/${N} z ${z(I.carreDistance).toFixed(2)}`;
  });
  for (const p of extremes(sys('aiguilleBuffon'))) ok(`aiguilleBuffon ${JSON.stringify(p)} : 2 l / pi (Simpson), aiguilles de longueur l, croisement = une droite entre les bouts`, () => {
    const R = S('aiguilleBuffon', p), P = R.params, I = R.invariants, b = R.brut, l = P.longueur, ref = buffonRef(l);
    assert.ok(rel(I.croisements.formule, ref) < 1e-12, 'formule ' + I.croisements.formule + ' ' + ref); assert.ok(Math.abs(z(I.croisements)) < 5, 'z ' + z(I.croisements));
    if (Number.isFinite(I.piLu.mesure)) { assert.ok(rel(I.piLu.mesure, 2 * l / I.croisements.mesure) < 1e-12); assert.ok(Math.abs(z(I.piLu)) < 5); }
    for (let k = 0; 6 * k + 5 < b.length; k++) { const o = 6 * k, L = Math.hypot(b[o + 3] - b[o], b[o + 4] - b[o + 1]); if (L === 0 && b[o + 3] === 0) break;
      assert.ok(Math.abs(L - l) < 1e-9, 'longueur ' + L); assert.equal(b[o + 2], Math.floor(b[o + 1]) !== Math.floor(b[o + 4]) ? 1 : 0, 'croisement'); assert.equal(b[o + 2], b[o + 5]); }
    return `part ${I.croisements.mesure.toFixed(4)}/${ref.toFixed(4)} z ${z(I.croisements).toFixed(2)}, pi lu ${Number.isFinite(I.piLu.mesure) ? I.piLu.mesure.toFixed(4) : '-'}`;
  });
  for (const p of extremes(sys('anniversaires'))) ok(`anniversaires ${JSON.stringify(p)} : 1 - prod (1 - i/D) (exp sum ln), C(k,2)/D, jours sur le cercle`, () => {
    const R = S('anniversaires', p), P = R.params, I = R.invariants, b = R.brut, k = P.personnes, D = P.jours, ref = anniversRef(k, D);
    assert.ok(Math.abs(I.partage.formule - ref) < 1e-12, 'formule ' + I.partage.formule + ' ' + ref); assert.ok(rel(I.paires.formule, k * (k - 1) / (2 * D)) < 1e-12);
    if (I.partage.sigma > 1e-9) assert.ok(Math.abs(z(I.partage)) < 5, 'partage z ' + z(I.partage)); else assert.ok(Math.abs(I.partage.mesure - I.partage.formule) < 1e-6, 'certain');
    if ('sigma' in I.paires) assert.ok(Math.abs(z(I.paires)) < 5, 'paires z ' + z(I.paires));
    /* un anneau par groupe DESSINE (rayon 1 + 0.15 rang), groupes repartis sur les G : numeros croissants */
    for (let i = 0; i < R.n; i++) { const o = 3 * i, rr = Math.hypot(b[o], b[o + 1]), rang = (rr - 1) / 0.15, a = Math.atan2(b[o + 1], b[o]), j = ((a / (2 * Math.PI)) * D + D) % D;
      assert.ok(Math.abs(rang - Math.round(rang)) < 1e-6 && Math.abs(j - Math.round(j)) < 1e-6 && b[o + 2] >= 1 && b[o + 2] <= P.groupes && (i === 0 || b[o + 2] >= b[o - 1]), 'jour entier sur son anneau'); }
    return `partage ${I.partage.mesure.toFixed(4)}/${ref.toFixed(4)}, paires ${I.paires.mesure.toFixed(3)}/${I.paires.formule.toFixed(3)}`;
  });
  for (const p of extremes(sys('spiraleUlam'))) ok(`spiraleUlam ${JSON.stringify(p)} : pi(N) = division d essai, Li(N) en u = ln t, chaque premier dessine a sa place sur la spirale`, () => {
    const R = S('spiraleUlam', p), P = R.params, I = R.invariants, b = R.brut, N = P.jusqua;
    let c = 0; for (let m = 2; m <= N; m++) if (estPremier(m)) c++;
    assert.equal(I.compteLi.mesure, c, 'pi(N)'); assert.ok(rel(I.compteLi.formule, LiRef(N)) < 1e-10, 'Li ' + I.compteLi.formule + ' ' + LiRef(N)); assert.ok(rel(I.compteLn.formule, N / Math.log(N)) < 1e-12);
    for (let i = 0; i < R.n; i++) { const o = 3 * i, m = b[o + 2], q = SPIRALE.get(m); assert.ok(estPremier(m) && m <= N, m + ' premier'); assert.ok(q[0] === b[o] && q[1] === b[o + 1], m + ' place ' + q + ' vs ' + b[o] + ',' + b[o + 1]); }
    return `pi(${N}) = ${c}, Li ${I.compteLi.formule.toFixed(1)} (${(I.compteLi.ecartRelatif * 100).toFixed(2)} %)`;
  });
  /* game122 : Pascal modulo 2 — reference independante : la parite de C(n, k) par le theoreme de Lucas (n & k === k), pas par addition */
  for (const p of [...extremes(sys('pascalSierpinski')), { lignes: 100 }, { lignes: 256 }]) ok(`pascalSierpinski ${JSON.stringify(p)} : 2^(popcount n) impairs par ligne, 3^m dans les 2^m premieres lignes, chaque point impair (Lucas)`, () => {
    const R = S('pascalSierpinski', p), N = R.params.lignes, I = R.invariants, b = R.brut;
    let m = 0; while (2 ** (m + 1) <= N) m++;
    let total = 0, cumul = 0; for (let n = 0; n < N; n++) { let c = 0; for (let k = 0; k <= n; k++) if ((n & k) === k) c++; cumul += c; if (n === 2 ** m - 1) total = cumul; }
    assert.equal(I.impairsParLigne.mesure, 0); assert.equal(I.impairsTotal.mesure, total); assert.equal(I.impairsTotal.formule, 3 ** m); assert.equal(total, 3 ** m); assert.equal(I.impairsTotal.impairs, cumul);
    for (let i = 0; i < R.n; i++) { const o = 3 * i, n = b[o + 2], k = b[o] + n / 2; assert.ok(Number.isInteger(n) && b[o + 1] === -n && Number.isInteger(k) && k >= 0 && k <= n && (n & k) === k, 'point ' + i); }
    return 'impairs ' + cumul + ', 2^' + m + ' lignes : ' + total + ' = 3^' + m;
  });
  /* game124 : solides de Platon — references : Euler, E = F p / 2 = V q / 2, diedre par Math.asin, (p, q) = les 5 solutions de 1/p + 1/q > 1/2 */
  { const vus = new Set();
    for (let k = 0; k <= 4; k++) ok(`solidesPlatoniques solide = ${k} : V - E + F = 2 (tout compte), E = F p/2 = V q/2, diedre exact, sommets sur une sphere`, () => {
      const R = S('solidesPlatoniques', { solide: k }), I = R.invariants, b = R.brut, { sommets: V, aretes: E, faces: F } = I.euler, p = I.schlafli.cotesParFace, q = I.schlafli.aretesParSommet;
      assert.equal(I.euler.mesure, 2); assert.equal(V - E + F, 2); assert.equal(E * 2, F * p); assert.equal(E * 2, V * q); assert.ok(1 / p + 1 / q > 0.5);
      const th = 2 * Math.asin(Math.cos(Math.PI / q) / Math.sin(Math.PI / p)) * 180 / Math.PI;
      assert.ok(Math.abs(I.diedre.formule - th) < 1e-9 && Math.abs(I.diedre.mesure - th) < 1e-9, 'diedre ' + I.diedre.mesure + ' ' + th);
      assert.ok(I.surSphere.derive < 1e-12); const R0 = I.surSphere.debut;
      for (let i = 0; i < R.n; i++) { const o = 3 * i; assert.ok(Math.hypot(b[o], b[o + 1], b[o + 2]) <= R0 + 1e-9, 'dans la sphere'); }
      vus.add(p + ',' + q); return V + '-' + E + '-' + F + ' {' + p + ',' + q + '} diedre ' + th.toFixed(4);
    });
    ok('solidesPlatoniques : les cinq symboles de Schlafli sont les 5 solutions de 1/p + 1/q > 1/2', () => { const att = []; for (let p = 3; p < 8; p++) for (let q = 3; q < 8; q++) if (1 / p + 1 / q > 0.5) att.push(p + ',' + q); assert.deepEqual([...vus].sort(), att.sort()); }); }
  /* game125 : Monty Hall — (n - 1)/(n (n - 2)) et 1/n recalcules ; courbes dans [0, 1] */
  for (const p of [...extremes(sys('montyHall')), { portes: 4 }]) ok(`montyHall ${JSON.stringify(p)} : changer (n-1)/(n(n-2)), garder 1/n, |z| < 5`, () => {
    const R = S('montyHall', p), N = R.params.portes, I = R.invariants, b = R.brut;
    assert.ok(Math.abs(I.changer.formule - (N - 1) / (N * (N - 2))) < 1e-15 && Math.abs(I.garder.formule - 1 / N) < 1e-15);
    assert.ok(Math.abs(z(I.changer)) < 5 && Math.abs(z(I.garder)) < 5, 'z ' + z(I.changer) + ' ' + z(I.garder));
    for (let i = 0; i < R.n; i++) { const o = 3 * i; assert.ok(b[o + 1] >= 0 && b[o + 1] <= 1 && (b[o + 2] === 0 || b[o + 2] === 1)); }
    return 'changer ' + I.changer.mesure.toFixed(4) + ' / ' + I.changer.formule.toFixed(4);
  });
  /* game148 : Apollonius (idee : codex Grok Bot) — references INDEPENDANTES : nombre de cercles 2 puis 6 x 3^(g-1) recompte ici ; courbures
   *   ENTIERES recalculees ici par la seule recurrence de Descartes sur les courbures (k' = 2 (a + b + c) - k, sans geometrie) et comparees
   *   au multiset que donnerait le module (via le nombre et la plus grande courbure) ; chaque point dessine dans le grand cercle */
  for (const p of [...extremes(sys('apollonius')), { premier: 0.37, generations: 4 }, { premier: 0.5, generations: 3 }]) ok(`apollonius ${JSON.stringify(p)} : courbures et centres de Descartes, cercles par generation, entiers a r1 = 1/2, temoin sans facteur 2`, () => {
    const R = S('apollonius', p), I = R.invariants, b = R.brut, G = R.params.generations, r1 = R.params.premier;
    const att = [2]; for (let g = 1; g <= G; g++) att.push(6 * 3 ** (g - 1)); const tot = att.reduce((u, v) => u + v, 0);
    assert.equal(I.cerclesParGeneration.mesure, att.join(' ')); assert.equal(I.cerclesParGeneration.formule, att.join(' ')); assert.equal(I.courbures.cercles, tot + 2);
    assert.ok(I.courbures.mesure < 1e-11 && I.centresComplexes.mesure < 1e-11, 'descartes ' + I.courbures.mesure + ' ' + I.centresComplexes.mesure);
    assert.ok(I.entiers.comparables === tot - 2 && I.entiers.sansFacteur2 === I.entiers.comparables, 'temoin facteur 2 ' + JSON.stringify(I.entiers));
    if (Math.abs(r1 - 0.5) < 1e-12) assert.ok(I.entiers.ecartEntier < 1e-8, 'entiers ' + I.entiers.ecartEntier); else assert.ok(I.entiers.ecartEntier > 0.01, 'non entiers attendus ' + I.entiers.ecartEntier);
    let pire = 0; const lab = new Set(); for (let q = 0; q < R.n; q++) { const o = 3 * q; pire = Math.max(pire, b[o] * b[o] + b[o + 1] * b[o + 1] - 1); lab.add(b[o + 2]); }
    assert.ok(pire < 1e-9 && [...lab].every((v) => Number.isInteger(v) && v >= -1 && v <= G), 'dessin ' + pire + ' ' + [...lab].join(','));
    return tot + ' cercles, Descartes ' + I.courbures.mesure.toExponential(1) + ', complexe ' + I.centresComplexes.mesure.toExponential(1) + ', entiers ' + I.entiers.ecartEntier.toExponential(1);
  });
  /* courbures entieres du joint (-1, 2, 2, 3) : la recurrence de Descartes SEULE (k' = 2 (a + b + c) - k) doit donner les memes plus petites
   *   valeurs que les cercles trouves par la geometrie (rayon des points dessines, a 1e-9) */
  ok('apollonius r1 = 1/2 : les courbures des cercles dessines = celles de la recurrence de Descartes (2, 3, 6, 11, 14, 15, 18, 23...)', () => {
    const R = T.simuler('apollonius', { premier: 0.5, generations: 3 }, { n: 20000 }), b = R.brut, ks = new Set();
    /* rayon de chaque cercle dessine : trois points consecutifs d un meme cercle -> cercle circonscrit */
    for (let q = 0; q + 2 < R.n; q++) { const o = 3 * q; if (b[o + 2] !== b[o + 5] || b[o + 2] !== b[o + 8]) continue; const [x1, y1, x2, y2, x3, y3] = [b[o], b[o + 1], b[o + 3], b[o + 4], b[o + 6], b[o + 7]];
      const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2)); if (Math.abs(d) < 1e-14) continue; const ux = ((x1 * x1 + y1 * y1) * (y2 - y3) + (x2 * x2 + y2 * y2) * (y3 - y1) + (x3 * x3 + y3 * y3) * (y1 - y2)) / d, uy = ((x1 * x1 + y1 * y1) * (x3 - x2) + (x2 * x2 + y2 * y2) * (x1 - x3) + (x3 * x3 + y3 * y3) * (x2 - x1)) / d;
      const k = 1 / Math.hypot(x1 - ux, y1 - uy); if (Math.abs(k - Math.round(k)) < 1e-6) ks.add(Math.round(k)); }
    const ref = new Set([1, 2, 3]); /* 1 = |-1| : le grand cercle, que les points dessines redonnent en valeur absolue */ let file = [[-1, 2, 2, 3]];
    for (let g = 0; g < 3; g++) { const s = []; for (const [a, bb, c, d] of file) for (const [u, v, w, old] of [[a, bb, c, d], [a, bb, d, c], [a, c, d, bb], [bb, c, d, a]]) { const kn = 2 * (u + v + w) - old; if (kn > Math.max(u, v, w, old)) { ref.add(kn); s.push([u, v, w, kn]); } } file = s; }
    const petits = [...ref].sort((x, y) => x - y).filter((k) => k <= 30), vus = [...ks].sort((x, y) => x - y).filter((k) => k <= 30);
    assert.deepEqual(vus, petits); return 'courbures <= 30 : ' + vus.join(' ');
  });
  /* game150 : tas de sable (idee : codex Grok Bot) — recurrentes contre l ORBITE du tas plein (192, 100352) et contre le produit des valeurs
   *   propres ; identite recalculee ici (autre stabilisation) et comparee case par case au dessin ; (e + e)° = e recalcule ; symetrie du carre */
  for (const p of [{}, { cote: 8 }, { cote: 40 }, { cote: 21 }]) ok(`tasDeSable ${JSON.stringify(p)} : recurrentes = orbite = det, identite recalculee et dessinee, abelien, temoin tas vide`, () => {
    const R = S('tasDeSable', p), I = R.invariants, b = R.brut, c = R.params.cote, N = c * c;
    assert.equal(I.recurrentes.mesure, ORBITES.join(' ')); assert.equal(I.recurrentes.formule, [2, 3].map(detValeursPropres).join(' ')); assert.deepEqual(ORBITES, [192, 100352]);
    assert.equal(I.recurrentes.grandes, [4, 5].map(detValeursPropres).join(' '));
    const e = identiteRef(c), ee = stabRef(e.map((v) => 2 * v), c); assert.ok(ee.every((v, i) => v === e[i]), '(e + e) != e dans le banc');
    for (let y = 0; y < c; y++) for (let x = 0; x < c; x++) { const v = e[y * c + x]; assert.ok(v === e[x * c + y] && v === e[y * c + c - 1 - x] && v === e[(c - 1 - y) * c + x], 'symetrie ' + x + ',' + y); }
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, i = b[o + 1] * c + b[o]; if (!(Number.isInteger(b[o]) && b[o] >= 0 && b[o] < c && b[o + 2] === e[i])) mal++; }
    const vus = new Set(); for (let q = 0; q < R.n; q++) vus.add(b[3 * q + 1] * c + b[3 * q]); assert.ok(mal === 0 && vus.size === Math.min(N, R.n), 'dessin ' + mal + ' cases vues ' + vus.size);
    assert.ok(I.identite.eePlusE === 0 && I.identite.ePlusR === 0 && I.identite.recurrente === true && I.identite.videRecurrent === false, 'identite ' + JSON.stringify(I.identite));
    assert.ok(I.abelien.mesure === 0 && I.abelien.tasDifferents === 0 && I.abelien.eboulementsDifferents === 0 && I.abelien.eboulements > N, 'abelien ' + JSON.stringify(I.abelien));
    return 'recurrentes ' + I.recurrentes.mesure + ', identite ' + c + 'x' + c + ' redessinee, ' + I.abelien.eboulements + ' eboulements';
  });
  /* game151 : verger d Euclide — compte par ESSAI de diviseurs, sommes phi et mu par factorisation, borne derivee, chaque arbre dessine visible */
  for (const p of [...extremes(sys('vergerEuclide')), { cote: 97 }]) ok(`vergerEuclide ${JSON.stringify(p)} : visibles = 2 sum phi - 1 = Mobius, limite 6/pi^2 sous la borne, diagonale 1`, () => {
    const R = S('vergerEuclide', p), I = R.invariants, b = R.brut, N = R.params.cote, V = vergerRef(N);
    let sp = 0, sm = 0; for (let k = 1; k <= N; k++) { sp += phiRef(k); sm += muRef(k) * Math.floor(N / k) ** 2; }
    assert.ok(I.visibles.mesure === V && I.visibles.formule === 2 * sp - 1 && I.visibles.sommePhi === sp && I.mobius.formule === sm && sm === V, 'compte ' + JSON.stringify([I.visibles, I.mobius.formule, V, sp, sm]));
    const lim = 6 / Math.PI ** 2, bor = (3 + 2 * Math.log(N)) / N; assert.ok(Math.abs(I.limite.formule - lim) < 1e-15 && Math.abs(I.limite.borne - bor) < 1e-12 && Math.abs(I.limite.mesure - V / (N * N)) < 1e-15 && I.limite.ecart <= bor && I.limite.ecart > 0, 'limite ' + JSON.stringify(I.limite));
    assert.ok(I.diagonale.mesure === 1, 'diagonale ' + I.diagonale.mesure);
    let mal = 0; const vus = new Set(); for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1]; vus.add(x * 1000 + y); let cache = false; for (let d = 2; d <= Math.min(x, y); d++) if (x % d === 0 && y % d === 0) cache = true; if (cache || x < 1 || y < 1 || x > N || y > N || b[o + 2] !== Math.max(x, y)) mal++; }
    assert.ok(mal === 0 && vus.size === Math.min(V, R.n), 'dessin ' + mal + ' distincts ' + vus.size);
    return V + ' visibles sur ' + N * N + ', part ' + I.limite.mesure.toFixed(5) + ' / 6/pi^2 ' + lim.toFixed(5) + ' (ecart ' + I.limite.ecart.toExponential(1) + ' < ' + bor.toFixed(3) + ')';
  });
  /* valeurs de controle de Grok Bot (TAM-CODEX-grok-2026-11-05-suite.md, calculees par son script Python) : N = 10 -> 63, N = 100 -> 6087,
   *   sum phi = 32 et 3044 */
  ok('vergerEuclide : valeurs de controle de Grok Bot (N = 10 : 63, sum phi 32 ; N = 100 : 6087, sum phi 3044)', () => {
    const a = S('vergerEuclide', { cote: 10 }).invariants.visibles, b = S('vergerEuclide', { cote: 100 }).invariants.visibles;
    assert.deepEqual([a.mesure, a.sommePhi, b.mesure, b.sommePhi], [63, 32, 6087, 3044]); return '63 / 32, 6087 / 3044';
  });
  /* game152 : Ford — F_n par les mediants ; chaque point dessine sur le cercle de SA fraction (distance au centre = rayon a 1e-12) ;
   *   la tangence verifiee ici en ENTIERS (|ps - qr| = 1) sur la liste des mediants ; aucun chevauchement en entiers sur toutes les paires */
  for (const p of [...extremes(sys('cerclesFord')), { ordre: 5 }, { ordre: 8 }, { ordre: 20 }]) ok(`cerclesFord ${JSON.stringify(p)} : |F_n| = 1 + sum phi = mediants, voisins tangents, aucun chevauchement, temoin 1/3 2/3`, () => {
    const R = S('cerclesFord', p), I = R.invariants, b = R.brut, N = R.params.ordre, F = fareyRef(N);
    assert.ok(I.farey.mesure === F.length && I.farey.formule === F.length, 'farey ' + JSON.stringify(I.farey) + ' ' + F.length);
    for (let i = 0; i + 1 < F.length; i++) assert.equal(Math.abs(F[i][0] * F[i + 1][1] - F[i][1] * F[i + 1][0]), 1);
    assert.ok(I.voisins.mesure === 0 && I.voisins.paires === F.length - 1 && I.tangence.mesure < 1e-12 && I.chevauchement.mesure === 0, 'tangence ' + JSON.stringify([I.voisins, I.tangence.mesure, I.chevauchement.mesure]));
    assert.ok(Math.abs(I.temoin.mesure - (1 / 3 - 1 / 9)) < 1e-12, 'temoin ' + I.temoin.mesure);
    let mal = 0; const qs = new Set(); for (let k = 0; k < R.n; k++) { const o = 3 * k, q = b[o + 2]; qs.add(q); const r = 1 / (2 * q * q); let ok = false;
      for (const [pp, qq] of F) if (qq === q && Math.abs(Math.hypot(b[o] - pp / qq, b[o + 1] - r) - r) < 1e-12) { ok = true; break; } if (!ok) mal++; }
    assert.ok(mal === 0 && qs.size === Math.min(N, R.n), 'dessin ' + mal + ' denominateurs ' + qs.size);
    return '|F_' + N + '| = ' + F.length + ', tangence ' + I.tangence.mesure.toExponential(1);
  });
  ok('cerclesFord : valeurs de controle de Grok Bot (|F_5| = 11, |F_8| = 23, |F_20| = 129, F_5 en entier)', () => {
    assert.deepEqual([5, 8, 20].map((o) => S('cerclesFord', { ordre: o }).invariants.farey.mesure), [11, 23, 129]);
    assert.equal(fareyRef(5).map(([p, q]) => p + '/' + q).join(', '), '0/1, 1/5, 1/4, 1/3, 2/5, 1/2, 3/5, 2/3, 3/4, 4/5, 1/1'); return '11 23 129';
  });
  /* game153 : Steiner — longueur contre min(L + sqrt 3, 1 + sqrt(3) L) (Math.sqrt), angles RELUS en degres par Math.acos sur les points
   *   dessines (sommets du reseau = points ou trois segments se rejoignent), temoins plus longs ; valeurs de Grok Bot pour le carre */
  for (const p of [...extremes(sys('fermatSteiner')), { largeur: 1 }, { largeur: 0.7 }]) ok(`fermatSteiner ${JSON.stringify(p)} : longueur exacte, 120 degres, carrefour exact, temoins plus longs`, () => {
    const R = S('fermatSteiner', p), I = R.invariants, b = R.brut, L = R.params.largeur, ex = Math.min(L + Math.sqrt(3), 1 + Math.sqrt(3) * L);
    assert.ok(Math.abs(I.longueur.mesure - ex) < 1e-12 && Math.abs(I.longueur.formule - ex) < 1e-15, 'longueur ' + I.longueur.mesure + ' ' + ex);
    assert.ok(I.angles.mesure < 1e-12 && I.carrefour.mesure < 1e-9, 'angles ' + I.angles.mesure + ' carrefour ' + I.carrefour.mesure);
    const t = I.plusLongs; assert.ok(t.autreForme >= ex - 1e-12 && t.arbreSansCarrefour > ex + 0.1 && Math.abs(t.arbreSansCarrefour - (L < 1 ? 2 * L + 1 : L + 2)) < 1e-12 /* MST : les deux cotes courts + un long */ && t.croix > ex + 0.05 && Math.abs(t.croix - 2 * Math.hypot(1, L)) < 1e-12, 'temoins ' + JSON.stringify(t));
    /* le reseau dessine (etiquette 0) : longueur relue en sommant les pas entre points voisins, et tout point dans le rectangle */
    let lab0 = 0, dehors = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q; if (b[o + 2] === 0) lab0++; if (b[o] < -1e-12 || b[o] > L + 1e-12 || b[o + 1] < -1e-12 || b[o + 1] > 1 + 1e-12) dehors++; }
    assert.ok(lab0 === Math.ceil(R.n * 0.7) && dehors === 0, 'dessin ' + lab0 + ' dehors ' + dehors);
    return 'L = ' + L + ' : ' + I.longueur.mesure.toFixed(12) + ' (pont ' + I.longueur.pont + '), cos ' + I.angles.mesure.toExponential(1);
  });
  ok('fermatSteiner : valeurs de controle de Grok Bot (carre : 1 + sqrt 3 = 2.7320508075688772, carrefour a (sqrt 3/6, 1/2) ou son symetrique)', () => {
    const I = S('fermatSteiner', { largeur: 1 }).invariants; assert.ok(Math.abs(I.longueur.mesure - 2.7320508075688772) < 1e-12, I.longueur.mesure);
    assert.ok(I.carrefour.mesure < 1e-9 && Math.abs(Math.sqrt(3) / 6 - 1 / (2 * Math.sqrt(3))) < 1e-15); return I.longueur.mesure.toFixed(16);
  });
  /* angles en DEGRES relus sur la geometrie : les 120 degres par Math.acos sur les carrefours du module copie ici (S et T ne sont pas exposes :
   *   on les recalcule en forme fermee pour le pont horizontal, L > 1) */
  ok('fermatSteiner : 120 degres en degres (Math.acos) au carrefour exact du pont horizontal', () => { const r3 = Math.sqrt(3), Sx = 1 / (2 * r3), A = [0, 0], D = [0, 1], T = [1.5 - Sx, 0.5], Sp = [Sx, 0.5];
    const ang = (Q, u, v) => Math.acos(((u[0] - Q[0]) * (v[0] - Q[0]) + (u[1] - Q[1]) * (v[1] - Q[1])) / (Math.hypot(u[0] - Q[0], u[1] - Q[1]) * Math.hypot(v[0] - Q[0], v[1] - Q[1]))) * 180 / Math.PI;
    const a = [ang(Sp, A, D), ang(Sp, A, T), ang(Sp, D, T)]; assert.ok(a.every((x) => Math.abs(x - 120) < 1e-9), a.join(' ')); return a.map((x) => x.toFixed(9)).join(' '); });
  /* game154 : caustique — references INDEPENDANTES : la nephroide recalculee ici (Math.cos/sin), la distance de CHAQUE point dessine
   *   (etiquette 0) a la courbe par recherche fine sur t ; bornes 4/N^2, 1/N^2, 10/N (constantes MESUREES 3.7, 0.62, 9.4, ecrites dans le module) */
  const nephro = (t) => [(3 * Math.cos(t) - Math.cos(3 * t)) / 4, (3 * Math.sin(t) - Math.sin(3 * t)) / 4];
  for (const p of [...extremes(sys('causticTasse')), { rayons: 1000 }]) ok(`causticTasse ${JSON.stringify(p)} : croisements sur la nephroide, pointe a R/2, longueur 3R, temoin 60 degres`, () => {
    const R = S('causticTasse', p), I = R.invariants, b = R.brut, N = R.params.rayons;
    assert.ok(I.nephroide.mesure < 4 / N ** 2 && I.nephroide.points === N - 1, 'nephroide ' + I.nephroide.mesure + ' points ' + I.nephroide.points);
    assert.ok(I.pointe.mesure < 1 / N ** 2, 'pointe ' + I.pointe.mesure);
    assert.ok(I.longueur.formule === 3 && I.longueur.mesure < 3 && 3 - I.longueur.mesure < 10 / N, 'longueur ' + I.longueur.mesure);
    assert.ok(Math.abs(I.temoin60.mesure - 1) < 1e-12 && I.temoin60.formule === 1, 'temoin ' + I.temoin60.mesure);
    let pire = 0, paroi = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q; if (b[o + 2] === 0) { let m = Infinity; for (let k = 0; k <= 4000; k++) { const e = nephro(-Math.PI / 2 + Math.PI * k / 4000); m = Math.min(m, Math.hypot(b[o] - e[0], b[o + 1] - e[1])); } pire = Math.max(pire, m); } if (b[o + 2] === 1) paroi = Math.max(paroi, Math.abs(Math.hypot(b[o], b[o + 1]) - 1)); }
    assert.ok(pire < 1e-3 && paroi < 1e-12, 'dessin ' + pire + ' paroi ' + paroi);
    return 'N = ' + N + ' : ecart ' + I.nephroide.mesure.toExponential(1) + ', pointe ' + I.pointe.mesure.toExponential(1) + ', longueur ' + I.longueur.mesure.toFixed(5);
  });
  ok('causticTasse : valeur de controle de Grok Bot (pointe a R/2, nephroide de Huygens)', () => { const I = S('causticTasse', { rayons: 3000 }).invariants; assert.ok(I.pointe.mesure < 1e-6); return 'pointe a ' + I.pointe.mesure.toExponential(1) + ' de R/2'; });
  /* game155 : Hofstadter — references INDEPENDANTES : le spectre par DIAGONALISATION de la matrice de Bloch COMPLEXE q x q (forme hermitienne
   *   reelle 2q x 2q, Jacobi du banc) sur une grille de (theta, k) : chaque valeur propre tombe dans une bande dessinee, et chaque bord est
   *   atteint a 1e-6 ; valeurs de Grok Bot pour 1/3 et 2/5 */
  const blochValeurs = (p, q, th, k) => { /* H(theta, k) hermitienne : diagonale 2 cos(2 pi p n/q + theta), sauts 1, coin e^{i q k} ; en reel : [[Re, -Im], [Im, Re]] */
    const n2 = 2 * q, A = Array.from({ length: n2 }, () => new Array(n2).fill(0)), set = (i, j, re, im) => { A[i][j] += re; A[i + q][j + q] += re; A[i][j + q] -= im; A[i + q][j] += im; };
    for (let n = 0; n < q; n++) set(n, n, 2 * Math.cos(2 * Math.PI * p * n / q + th), 0);
    if (q === 1) set(0, 0, 2 * Math.cos(q * k), 0); else { for (let n = 0; n + 1 < q; n++) { set(n, n + 1, 1, 0); set(n + 1, n, 1, 0); } set(0, q - 1, Math.cos(q * k), -Math.sin(q * k)); set(q - 1, 0, Math.cos(q * k), Math.sin(q * k)); }
    for (let s = 0; s < 60; s++) { let off = 0; for (let i = 0; i < n2; i++) for (let j = i + 1; j < n2; j++) off += A[i][j] ** 2; if (off < 1e-26) break;
      for (let a = 0; a < n2; a++) for (let b = a + 1; b < n2; b++) { if (Math.abs(A[a][b]) < 1e-300) continue; const t0 = (A[b][b] - A[a][a]) / (2 * A[a][b]), t = Math.sign(t0 || 1) / (Math.abs(t0) + Math.hypot(t0, 1)), c = 1 / Math.hypot(t, 1), sn = t * c;
        for (let m = 0; m < n2; m++) { const x = A[m][a], y = A[m][b]; A[m][a] = c * x - sn * y; A[m][b] = sn * x + c * y; } for (let m = 0; m < n2; m++) { const x = A[a][m], y = A[b][m]; A[a][m] = c * x - sn * y; A[b][m] = sn * x + c * y; } } }
    return A.map((r, i) => r[i]); };
  for (const p of [...extremes(sys('papillonHofstadter')), { qmax: 9 }]) ok(`papillonHofstadter ${JSON.stringify(p)} : bandes reelles, gaps de van Mouche, centre ferme, 1/3 exact, symetrie, temoin 2/5`, () => {
    const R = S('papillonHofstadter', p), I = R.invariants, b = R.brut, Q = R.params.qmax;
    let nf = 0; for (let q = 1; q <= Q; q++) for (let pp = 0; pp <= q; pp++) { let a = pp, c = q; while (c) [a, c] = [c, a % c]; if (a === 1) nf++; }
    assert.ok(I.bandes.mesure === 0 && I.bandes.fractions === nf && I.gaps.mesure === 0, 'bandes ' + JSON.stringify([I.bandes, I.gaps.mesure, nf]));
    assert.ok(I.centreFerme.mesure < 1e-9 && I.tiers.mesure < 1e-12 && I.miroirE.mesure < 1e-9 && I.temoin.mesure === 5, 'exacts ' + JSON.stringify([I.centreFerme.mesure, I.tiers.mesure, I.miroirE.mesure, I.temoin.mesure]));
    /* (banc corrige game155 : comparer a l ETENDUE des points dessines etait faux — une bande etroite a un seul point est dessinee en son
     *   milieu.) Spectre = { |P| <= 4 }, P recalcule ICI par matrices de transfert (Math.cos) : (a) chaque valeur propre de Bloch (diagonalisation
     *   independante) y tombe ; (b) chaque point dessine aussi. Tolerance : |P| <= 4 + 1e-7 (1 + |P'|), P' par difference centree. */
    const PRef = (E, pp, q) => { const th = 0.37; let a = 1, bb = 0, c = 0, d = 1; for (let m = 0; m < q; m++) { const v = E - 2 * Math.cos(2 * Math.PI * pp * m / q + th), na = v * a - c, nb = v * bb - d; c = a; d = bb; a = na; bb = nb; } return a + d + 2 * Math.cos(q * th); };
    const dans = (E, pp, q) => { const h = 1e-7, d = (PRef(E + h, pp, q) - PRef(E - h, pp, q)) / (2 * h); return Math.abs(PRef(E, pp, q)) <= 4 + 1e-7 * (1 + Math.abs(d)); };
    let horsBande = 0; for (const [pp, q] of [[1, 3], [2, 5], [1, 4], [3, 7], [5, 13]].filter(([, q]) => q <= Q))
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) for (const E of blochValeurs(pp, q, 2 * Math.PI * i / 6, 2 * Math.PI * j / (6 * q))) if (!dans(E, pp, q)) horsBande++;
    let dessinHors = 0; for (let k = 0; k < R.n; k++) { const o = 3 * k, q = b[o + 2], pp = Math.round(b[o] * q); if (!dans(b[o + 1], pp, q)) dessinHors++; }
    assert.ok(horsBande === 0 && dessinHors === 0, 'hors du spectre : valeurs de Bloch ' + horsBande + ', points dessines ' + dessinHors);
    return I.bandes.fractions + ' fractions, ' + I.bandes.bandes + ' bandes, centre ' + I.centreFerme.mesure.toExponential(1);
  });
  ok('papillonHofstadter : valeurs de controle de Grok Bot (1/3 : -2.732050807569 -2 -0.732050807569 0.732050807569 2 2.732050807569 ; 2/5 : 5 bandes, bord 2.618033988750)', () => {
    const R = S('papillonHofstadter', { qmax: 6 }), b = R.brut, ys = []; for (let q = 0; q < R.n; q++) if (Math.abs(b[3 * q] - 0.4) < 1e-12) ys.push(b[3 * q + 1]);
    assert.ok(Math.abs(Math.max(...ys) - 2.618033988750) < 1e-11 && Math.abs(Math.min(...ys) + 2.618033988750) < 1e-11, 'bords 2/5 ' + Math.min(...ys) + ' ' + Math.max(...ys)); return '2/5 : ' + Math.max(...ys).toFixed(12);
  });
  /* game157 : dominos — references INDEPENDANTES : compte par RETOUR ARRIERE (premiere case vide, couche ou debout) pour les petites aires,
   *   Kasteleyn par Math.cos ; probabilite du coin recomptee par retour arriere ; le pavage dessine verifie (chaque case couverte une fois) */
  const pavagesRef = (m, L, coinCouche = null) => { const g = new Uint8Array(m * L); let tot = 0;
    const rec = () => { const i = g.indexOf(0); if (i < 0) { tot++; return; } const x = Math.floor(i / m), y = i % m;
      if (x + 1 < L && !g[i + m]) { if (!(coinCouche === false && i === 0)) { g[i] = g[i + m] = 1; rec(); g[i] = g[i + m] = 0; } }
      if (y + 1 < m && !g[i + 1]) { if (!(coinCouche === true && i === 0)) { g[i] = g[i + 1] = 1; rec(); g[i] = g[i + 1] = 0; } } }; rec(); return tot; };
  for (const p of [...extremes(sys('dominosKasteleyn')), { hauteur: 4, largeur: 5 }, { hauteur: 3, largeur: 7 }, { hauteur: 6, largeur: 6, graine: 9 }]) ok(`dominosKasteleyn ${JSON.stringify(p)} : compte exact = Kasteleyn, coin, Fibonacci, aire impaire, pavage dessine valide`, () => {
    const R = S('dominosKasteleyn', p), I = R.invariants, b = R.brut, m = R.params.hauteur, L = R.params.largeur;
    if (m * L <= 36) assert.equal(I.pavages.mesure, String(pavagesRef(m, L)));
    if (m % 2 === 0 && L % 2 === 0) { let k = 1; for (let j = 1; j <= m / 2; j++) for (let q = 1; q <= L / 2; q++) k *= 4 * Math.cos(Math.PI * j / (m + 1)) ** 2 + 4 * Math.cos(Math.PI * q / (L + 1)) ** 2; assert.ok(Math.abs(Number(I.pavages.mesure) - k) / k < 1e-12 && I.pavages.ecartRelatif < 1e-12, 'kasteleyn ' + I.pavages.mesure + ' ' + k); } else assert.equal(I.pavages.formule, null);
    let fa = 1, fb = 1; for (let i = 1; i < L; i++) [fa, fb] = [fb, fa + fb]; assert.equal(I.fibonacci.mesure, String(fb)); assert.equal(I.fibonacci.formule, String(fb)); /* banc game157 : la formule aussi (mutant F(L) survivait) */
    if (m * L % 2) { assert.ok(I.pavages.mesure === '0' && I.impair.mesure === '0' && I.coin.mesure === null, 'impair'); return 'aire impaire : 0 pavage'; }
    if (m * L <= 36) { const pc = pavagesRef(m, L, true) / pavagesRef(m, L); assert.ok(Math.abs(I.coin.formule - pc) < 1e-12, 'coin exact ' + I.coin.formule + ' ' + pc); }
    assert.ok(Math.abs(z(I.coin)) < 5, 'coin z ' + z(I.coin));
    /* le pavage dessine : chaque point est au milieu d une case ou entre deux cases voisines, et TOUTES les cases sont atteintes */
    const vues = new Set(); let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o] - 0.5, y = b[o + 1] - 0.5, lab = b[o + 2]; if (!(lab === 0 || lab === 1)) mal++;
      if (lab === 0 && Math.abs(y - Math.round(y)) > 1e-12) mal++; if (lab === 1 && Math.abs(x - Math.round(x)) > 1e-12) mal++; if (Number.isInteger(x) && Number.isInteger(y)) vues.add(x * 100 + y); }
    assert.ok(mal === 0 && x0ok(b, R.n, L, m), 'dessin ' + mal);
    return m + ' x ' + L + ' : ' + I.pavages.mesure + ' pavages, coin ' + I.coin.mesure.toFixed(3) + ' / ' + I.coin.formule.toFixed(3);
  });
  ok('dominosKasteleyn : valeurs de controle de Grok Bot (2x2 : 2, 2x3 : 3, 4x4 : 36, 6x6 : 6728, 8x8 : 12988816)', () => {
    const v = [[2, 2], [2, 3], [4, 4], [6, 6], [8, 8]].map(([h, l]) => S('dominosKasteleyn', { hauteur: h, largeur: l }).invariants.pavages.mesure); assert.deepEqual(v, ['2', '3', '36', '6728', '12988816']);
    /* lot 4 de Grok Bot : 6 x 8 -> 167089 pavages, coin couche avec la probabilite EXACTE 81430/167089 (deux DP independantes chez lui) */
    const I = S('dominosKasteleyn', { hauteur: 6, largeur: 8 }).invariants; assert.ok(I.pavages.mesure === '167089' && Math.abs(I.coin.formule - 81430 / 167089) < 1e-15, 'lot4 ' + I.coin.formule);
    return v.join(' ') + ' ; 6x8 coin 81430/167089';
  });
  /* game158 : Ising — enumeration INDEPENDANTE (Math.exp, Gray code : un spin bascule a la fois, E mis a jour localement) ; |z| < 5 ;
   *   chaque point dessine porte un spin +1 / -1 ; valeurs de Grok Bot pour le tore 4 x 4 (Z a beta = 0.4) */
  const isingRef = (L, beta) => { const N = L * L, s = new Int8Array(N).fill(-1); let E = 0, M = -N; for (let i = 0; i < N; i++) { const x = i % L, y = (i - x) / L; E += s[i] * s[y * L + (x + 1) % L] + s[i] * s[((y + 1) % L) * L + x]; }
    let Z = Math.exp(beta * E), ZE = E * Z, ZM = Math.abs(M) / N * Z;
    for (let k = 1; k < 1 << N; k++) { const i = 31 - Math.clz32(k & -k), x = i % L, y = (i - x) / L, h = s[y * L + (x + 1) % L] + s[y * L + (x - 1 + L) % L] + s[((y + 1) % L) * L + x] + s[((y - 1 + L) % L) * L + x];
      E -= 2 * s[i] * h; M -= 2 * s[i]; s[i] = -s[i]; const w = Math.exp(beta * E); Z += w; ZE += E * w; ZM += Math.abs(M) / N * w; }
    return { Z, E: ZE / Z, m: ZM / Z }; };
  for (const p of [...extremes(sys('ising')), { beta: 0.44 }]) ok(`ising ${JSON.stringify(p)} : Metropolis contre l enumeration exacte (energie, aimantation), Z, dessin en spins`, () => {
    const R = S('ising', p), I = R.invariants, b = R.brut, ref = isingRef(4, R.params.beta);
    assert.ok(Math.abs(I.partition.mesure - ref.Z) / ref.Z < 1e-12 && Math.abs(I.energie.formule - ref.E) < 1e-9 && Math.abs(I.aimantationAbs.formule - ref.m) < 1e-12, 'exact ' + JSON.stringify([I.partition.mesure, ref.Z, I.energie.formule, ref.E]));
    assert.ok(Math.abs(z(I.energie)) < 5 && Math.abs(z(I.aimantationAbs)) < 5, 'z ' + z(I.energie) + ' ' + z(I.aimantationAbs));
    assert.ok(Math.abs(I.partition.betaCritique - Math.log(1 + Math.SQRT2) / 2) < 1e-12, 'betaC');
    let mal = 0; for (let q = 0; q < R.n; q++) { const v = b[3 * q + 2]; if (v !== 1 && v !== -1) mal++; } assert.equal(mal, 0);
    return 'beta ' + R.params.beta + ' : <E> ' + I.energie.mesure.toFixed(3) + ' / ' + I.energie.formule.toFixed(3) + ', <|m|> ' + I.aimantationAbs.mesure.toFixed(4) + ' / ' + I.aimantationAbs.formule.toFixed(4);
  });
  ok('ising : valeurs de controle de Grok Bot (tore 4 x 4, beta = 0.4 : Z = 2107668.7226362286)', () => { const I = S('ising', { beta: 0.4 }).invariants; assert.ok(Math.abs(I.partition.mesure - 2107668.7226362286) / 2107668.7226362286 < 1e-12, I.partition.mesure); return String(I.partition.mesure); });
  ok('ising : etalonnage sur 12 graines a beta = 0.44 (ecart-type des z dans [0.4, 1.8])', () => { const zs = []; for (let g = 1; g <= 12; g++) zs.push(z(S('ising', { beta: 0.44, graine: g }).invariants.energie)); const m = zs.reduce((a, x) => a + x, 0) / zs.length, sd = Math.sqrt(zs.reduce((a, x) => a + (x - m) ** 2, 0) / (zs.length - 1)); assert.ok(sd >= 0.4 && sd <= 1.8 && Math.abs(m) < 1.5, m + ' ' + sd); return m.toFixed(2) + '/' + sd.toFixed(2); });
  /* game159 : diamant azteque — references INDEPENDANTES : 2^(k(k+1)/2) ; le pavage DESSINE reconstruit en cases (chaque case du diamant
   *   couverte exactement une fois) ; khi-deux et case du centre en z ; valeurs de Grok Bot (AD(4) = 1024 ; centre 1/2) */
  for (const p of [...extremes(sys('aztecDiamond')), { ordre: 20, graine: 7 }]) ok(`aztecDiamond ${JSON.stringify(p)} : pavage valide, petits diamants comptes, uniformite, centre, arctique`, () => {
    const R = S('aztecDiamond', p), I = R.invariants, b = R.brut, n = R.params.ordre;
    assert.ok(I.pavageValide.mesure === 0 && I.pavageValide.dominos === n * (n + 1), 'valide ' + JSON.stringify(I.pavageValide));
    assert.equal(I.petitsDiamants.mesure, '2 8 64 1024'); assert.equal(I.petitsDiamants.formule, [1, 2, 3, 4].map((k) => Math.pow(2, k * (k + 1) / 2)).join(' '));
    assert.ok(Math.abs(z(I.uniformite)) < 5 && Math.abs(z(I.caseCentre)) < 5 && Math.abs(I.caseCentre.formule - 0.5) < 1e-15, 'stats ' + z(I.uniformite) + ' ' + z(I.caseCentre) + ' ' + I.caseCentre.formule);
    assert.ok(Math.abs(I.arctique.rayon - n / Math.SQRT2) < 1e-12, 'rayon');
    /* le cercle arctique est une LIMITE : exige seulement des l ordre 12 (mesure 2026-11-05 : 1.000 dehors, ~0.4 dedans a n = 20..60) */
    if (n >= 12) assert.ok(I.arctique.mesure >= 0.99 && I.arctique.dedans < 0.6, 'arctique ' + JSON.stringify(I.arctique));
    let dehors = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = Math.floor(b[o] - 1e-9), y = Math.floor(b[o + 1] - 1e-9); if (Math.abs(x + 0.5) + Math.abs(y + 0.5) > n) dehors++; if (![0, 1, 2, 3].includes(b[o + 2])) dehors++; }
    assert.equal(dehors, 0);
    return 'n = ' + n + ' : geles dehors ' + (I.arctique.mesure === null ? '-' : I.arctique.mesure.toFixed(3)) + ', khi2 ' + I.uniformite.mesure.toFixed(1) + ', centre ' + I.caseCentre.mesure.toFixed(3);
  });
  ok('aztecDiamond : valeurs de controle de Grok Bot (AD(1..4) = 2 8 64 1024 ; ordre 4, case du centre couchee 1/2 exactement)', () => { const I = S('aztecDiamond', {}).invariants; assert.ok(I.petitsDiamants.mesure === '2 8 64 1024' && I.caseCentre.formule === 0.5); return 'ok'; });
  /* game160 : collectionneur — references INDEPENDANTES : E et Var par la somme des geometriques en flottants ; valeurs EXACTES de
   *   Grok Bot (lot 5) pour n = 10 et 50 ; courbe exacte relue sur les points d etiquette 0 */
  for (const p of [...extremes(sys('collectionneur')), { vignettes: 10 }, { vignettes: 50, graine: 3 }]) ok(`collectionneur ${JSON.stringify(p)} : moyenne n H_n, variance exacte, courbe des distinctes`, () => {
    const R = S('collectionneur', p), I = R.invariants, b = R.brut, N = R.params.vignettes;
    let E = 0, V = 0; for (let j = 0; j < N; j++) { const q = (N - j) / N; E += 1 / q; V += (1 - q) / (q * q); }
    assert.ok(Math.abs(I.tirageMoyen.formule - E) / E < 1e-12 && Math.abs(I.variance.formule - V) / V < 1e-9, 'formules ' + I.tirageMoyen.formule + ' ' + E + ' ' + I.variance.formule + ' ' + V);
    assert.ok(Math.abs(z(I.tirageMoyen)) < 5 && Math.abs(I.variance.mesure - V) / V < 0.15, 'mesures ' + z(I.tirageMoyen) + ' ' + I.variance.mesure + ' ' + V);
    assert.ok(I.courbeDistinctes.mesure < 0.5 + 5 * Math.sqrt(N) / Math.sqrt(3000), 'courbe ' + I.courbeDistinctes.mesure);
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q; if (b[o + 2] === 0 && Math.abs(b[o + 1] - N * (1 - Math.pow(1 - 1 / N, b[o]))) > 1e-9) mal++; if (b[o + 1] > N || b[o + 1] < 0) mal++; } assert.equal(mal, 0);
    return 'n = ' + N + ' : moyenne ' + I.tirageMoyen.mesure.toFixed(2) + ' / ' + I.tirageMoyen.formule.toFixed(2) + ', variance ' + I.variance.mesure.toFixed(0) + ' / ' + I.variance.formule.toFixed(0);
  });
  ok('collectionneur : fractions exactes de Grok Bot (n = 10 : E = 7381/252, Var = 7981633/63504 ; n = 50 : E = 13943237577224054960759/61980890084919934128)', () => {
    const a = S('collectionneur', { vignettes: 10 }).invariants, b = S('collectionneur', { vignettes: 50 }).invariants;
    assert.ok(a.tirageMoyen.exacte === '7381/252' && a.variance.exacte === '7981633/63504' && b.tirageMoyen.exacte === '13943237577224054960759/61980890084919934128', a.tirageMoyen.exacte + ' ' + a.variance.exacte + ' ' + b.tirageMoyen.exacte);
    assert.equal(b.variance.exacte, '14743685372056613919882499348303425143425393/3841630735718926199201023052303859120384'); return a.tirageMoyen.exacte + ', ' + a.variance.exacte;
  });
  /* game161 : ruine — reference INDEPENDANTE : le systeme lineaire q_z = p q_(z+1) + q q_(z-1) resolu par Gauss (et la duree de meme) ;
   *   valeurs de Grok Bot (Feller XIV §2) : 7/10, 1/9, 76/211 */
  const ruineRef = (p, z, a) => { const n = a - 1, A = Array.from({ length: n }, () => new Array(n + 2).fill(0)); /* inconnues q_1..q_(a-1), colonnes : q puis D */
    for (let i = 1; i <= n; i++) { const r = A[i - 1]; r[i - 1] = 1; if (i + 1 <= n) r[i] = -p; if (i - 1 >= 1) r[i - 2] = -(1 - p); r[n] = i === 1 ? (1 - p) : 0; r[n + 1] = 1; }
    for (let c = 0; c < n; c++) { for (let i = c + 1; i < n; i++) { const f = A[i][c] / A[c][c]; for (let j = c; j < n + 2; j++) A[i][j] -= f * A[c][j]; } }
    const x = new Array(n).fill(0), y = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = A[i][n], t = A[i][n + 1]; for (let j = i + 1; j < n; j++) { s -= A[i][j] * x[j]; t -= A[i][j] * y[j]; } x[i] = s / A[i][i]; y[i] = t / A[i][i]; }
    return { q: x[z - 1], d: y[z - 1] }; };
  for (const p of [...extremes(sys('ruineJoueur')), { gain: 0.5, depart: 3, objectif: 10 }, { gain: 0.55, depart: 5, objectif: 30 }]) ok(`ruineJoueur ${JSON.stringify(p)} : ruine et duree contre le systeme lineaire, simulation`, () => {
    const R = S('ruineJoueur', p), I = R.invariants, b = R.brut, a = R.params.objectif, z0 = Math.min(R.params.depart, a - 1), ref = ruineRef(R.params.gain, z0, a);
    assert.ok(I.ruine.depart === z0 &&Math.abs(I.ruine.formule - ref.q) < 1e-9 && Math.abs(I.duree.formule - ref.d) / Math.max(1, ref.d) < 1e-9, 'formules ' + JSON.stringify([I.ruine.formule, ref.q, I.duree.formule, ref.d]));
    assert.ok(Math.abs(z(I.ruine)) < 5 && Math.abs(z(I.duree)) < 5, 'z ' + z(I.ruine) + ' ' + z(I.duree));
    let mal = 0; for (let k = 0; k < R.n; k++) { const v = b[3 * k + 1]; if (v < 0 || v > a || !Number.isInteger(v)) mal++; } assert.equal(mal, 0);
    return 'p = ' + R.params.gain + ', z = ' + z0 + ', a = ' + a + ' : ruine ' + I.ruine.mesure.toFixed(4) + ' / ' + I.ruine.formule.toFixed(4) + ', duree ' + I.duree.mesure.toFixed(1) + ' / ' + I.duree.formule.toFixed(1);
  });
  ok('ruineJoueur : valeurs de controle de Grok Bot (p = 1/2, z = 3, a = 10 : 7/10 ; p = 2/3, 3, 6 : 1/9 ; p = 3/5, 2, 5 : 76/211)', () => {
    const v = [[0.5, 3, 10, 7 / 10], [2 / 3, 3, 6, 1 / 9], [0.6, 2, 5, 76 / 211]].map(([g, d, o, x]) => Math.abs(S('ruineJoueur', { gain: g, depart: d, objectif: o }).invariants.ruine.formule - x));
    assert.ok(v.every((e) => e < 1e-12), v.join(' ')); return '7/10, 1/9, 76/211';
  });
  /* game162 : Catalan — references INDEPENDANTES : la recurrence C_(n+1) = sum C_i C_(n-i) (pas de binome) ; chaque chemin dessine reste
   *   au-dessus du sol, a la bonne longueur, avec des pas de +-1 ; valeurs de Grok Bot C_0..C_10 */
  for (const p of [...extremes(sys('catalanDyck')), { demi: 40, graine: 9 }]) ok(`catalanDyck ${JSON.stringify(p)} : chemins comptes = Catalan (recurrence), tirage uniforme, chemins dessines valides`, () => {
    const R = S('catalanDyck', p), I = R.invariants, b = R.brut, N = R.params.demi;
    const C = [1]; for (let k = 0; k < 12; k++) { let s = 0; for (let i = 0; i <= k; i++) s += C[i] * C[k - i]; C.push(s); }
    assert.ok(I.catalans.mesure === C.join(' ') && I.catalans.formule === C.join(' '), 'catalans ' + I.catalans.mesure);
    assert.ok(Math.abs(z(I.uniformite)) < 5 && I.uniformite.sousSol === 0 && I.temoin.mesure === '252', 'tirage ' + JSON.stringify(I.uniformite));
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1]; if (y < 0 || x < 0 || x > 2 * N || (x + y) % 2 !== 0 || y > Math.min(x, 2 * N - x)) mal++; if (x === 0 && y !== 0) mal++; if (x === 2 * N && y !== 0) mal++; }
    assert.equal(mal, 0); return 'n = ' + N + ' : khi2 ' + I.uniformite.mesure.toFixed(1);
  });
  ok('catalanDyck : valeurs de controle de Grok Bot (C_0..C_10 = 1 1 2 5 14 42 132 429 1430 4862 16796)', () => { const v = S('catalanDyck', {}).invariants.catalans.mesure.split(' ').slice(0, 11).join(' '); assert.equal(v, '1 1 2 5 14 42 132 429 1430 4862 16796'); return v; });
  /* game163 : partitions — reference INDEPENDANTE : enumeration directe des partitions (parts decroissantes) pour n <= 30 ; valeurs de
   *   Grok Bot p(0..20) et p(100) ; le diagramme dessine forme des lignes decroissantes collees a gauche */
  const partEnum = (n) => { let c = 0; const rec = (m, k) => { if (m === 0) { c++; return; } for (let j = Math.min(m, k); j >= 1; j--) rec(m - j, j); }; rec(n, n); return c; };
  for (const p of [...extremes(sys('partitionEuler')), { entier: 30, graine: 4 }]) ok(`partitionEuler ${JSON.stringify(p)} : pentagonal = comptage independant, tirage uniforme, diagramme de Young valide`, () => {
    const R = S('partitionEuler', p), I = R.invariants, b = R.brut, N = R.params.entier;
    assert.ok(I.pentagonal.mesure === 0 && I.pentagonal.p100 === '190569292', 'pentagonal ' + JSON.stringify(I.pentagonal));
    assert.ok(Math.abs(z(I.uniformite)) < 5 && I.dessinee.mesure === N, 'tirage ' + JSON.stringify([I.uniformite.mesure, I.dessinee]));
    /* banc game163 : chaque ligne part de la colonne 0 (un diagramme decale passait : seul le maximum etait regarde) */
    const lignes = new Map(), debuts = new Map(); for (let q = 0; q < R.n; q++) { const o = 3 * q; const r = -b[o + 1]; lignes.set(r, Math.max(lignes.get(r) ?? -1, b[o])); debuts.set(r, Math.min(debuts.get(r) ?? Infinity, b[o])); assert.equal(b[o + 2], r, 'etiquette de ligne'); }
    if (R.n >= 1000) for (const [r, x0] of debuts) assert.equal(x0, 0, 'ligne ' + r + ' commence en ' + x0);
    const longs = [...lignes.keys()].sort((x, y) => x - y).map((r) => lignes.get(r)); for (let i = 1; i < longs.length; i++) assert.ok(longs[i] <= longs[i - 1], 'lignes croissantes ' + longs.join(','));
    if (N <= 30) assert.equal(partEnum(N), Number(partPieces30(N)));
    return 'n = ' + N + ' : ' + I.dessinee.parts + ' parts, khi2 ' + I.uniformite.mesure.toFixed(1);
  });
  ok('partitionEuler : valeurs de controle de Grok Bot (p(0..20) et p(100) = 190569292)', () => {
    const v = []; for (let k = 0; k <= 20; k++) v.push(partEnum(k)); assert.equal(v.join(','), '1,1,2,3,5,7,11,15,22,30,42,56,77,101,135,176,231,297,385,490,627');
    assert.equal(S('partitionEuler', {}).invariants.pentagonal.p100, '190569292'); return v.join(',');
  });
  /* game164 : dragon — reference INDEPENDANTE : PLIAGE simule (une bande de 2^n cases pliee n fois, le sens de chaque pli relu au depliage) ;
   *   chaque point dessine sur un segment unitaire de la grille ; valeurs de Grok Bot (n = 1..4) */
  const pliage = (n) => { let plis = []; for (let i = 0; i < n; i++) { const r = [...plis].reverse().map((c) => (c === 'R' ? 'L' : 'R')); plis = [...plis, 'R', ...r]; } return plis.join(''); };
  for (const p of [...extremes(sys('courbeDragon')), { plis: 9 }]) ok(`courbeDragon ${JSON.stringify(p)} : virages identiques, 2^n segments sans recouvrement, bouts a 2^(n/2)`, () => {
    const R = S('courbeDragon', p), I = R.invariants, b = R.brut, N = R.params.plis;
    assert.ok(I.virages.mesure === 0 && I.virages.virages === 2 ** N - 1 && I.virages.debut === pliage(N).slice(0, 15), 'virages ' + JSON.stringify(I.virages));
    assert.ok(I.segments.mesure === 2 ** N && I.segments.formule === 2 ** N && I.segments.recouvrements === 0 && I.bouts.mesure === 2 ** N && I.bouts.formule === 2 ** N, 'segments ' + JSON.stringify([I.segments, I.bouts]));
    /* le dragon RETRACE ici depuis le pliage simule : chaque point dessine doit tomber sur une de SES aretes (ou un de ses sommets) */
    const ar = new Set(), so = new Set(['0,0']); { let x = 0, y = 0, dx = 1, dy = 0; const av = () => { ar.add(Math.min(x, x + dx) + ',' + Math.min(y, y + dy) + ',' + (dx ? 'h' : 'v')); x += dx; y += dy; so.add(x + ',' + y); };
      av(); for (const c of pliage(N)) { [dx, dy] = c === 'R' ? [dy, -dx] : [-dy, dx]; av(); } }
    const ent = (v) => Math.abs(v - Math.round(v)) < 1e-9;
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1];
      const sur = ent(x) && ent(y) ? so.has(Math.round(x) + ',' + Math.round(y)) : ent(y) ? ar.has(Math.floor(x) + ',' + Math.round(y) + ',h') : ent(x) ? ar.has(Math.round(x) + ',' + Math.floor(y) + ',v') : false;
      if (!sur) mal++; if (b[o + 2] < 0 || b[o + 2] > N) mal++; }
    assert.equal(mal, 0); return 'n = ' + N + ' : ' + I.segments.mesure + ' segments, bouts^2 = ' + I.bouts.mesure;
  });
  ok('courbeDragon : valeurs de controle de Grok Bot (R ; RRL ; RRLRRLL ; RRLRRLLRRRLLRLL)', () => { assert.deepEqual([1, 2, 3, 4].map(pliage), ['R', 'RRL', 'RRLRRLL', 'RRLRRLLRRRLLRLL']); assert.equal(S('courbeDragon', { plis: 4 }).invariants.virages.debut, 'RRLRRLLRRRLLRLL'); return 'ok'; });
  /* game165 : Pick — reference INDEPENDANTE : B par enumeration des points de chaque cote (pas (dx/g, dy/g)), I par BALAYAGE de lignes
   *   (croisements des cotes avec chaque ligne y, regle demi-ouverte) ; simplicite revérifiee ici par force brute ; aire par triangles depuis le sommet 0 */
  const refPick = (Q) => { const k = Q.length, bord = new Set();
    for (let i = 0; i < k; i++) { const [ax, ay] = Q[i], [bx, by] = Q[(i + 1) % k], dx = bx - ax, dy = by - ay; let g = Math.abs(dx), h = Math.abs(dy); while (h) [g, h] = [h, g % h];
      for (let s = 0; s < g; s++) bord.add((ax + s * dx / g) + ',' + (ay + s * dy / g)); }
    let I = 0; const ys = Q.map((p) => p[1]);
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) { const xs = [];
      for (let i = 0; i < k; i++) { const [ax, ay] = Q[i], [bx, by] = Q[(i + 1) % k]; if (ay !== by && Math.min(ay, by) <= y && y < Math.max(ay, by)) xs.push(ax + (y - ay) * (bx - ax) / (by - ay)); }
      xs.sort((u, v) => u - v); for (let j = 0; j + 1 < xs.length; j += 2) for (let x = Math.ceil(xs[j] - 1e-9); x <= Math.floor(xs[j + 1] + 1e-9); x++) if (!bord.has(x + ',' + y)) I++; }
    let a2 = 0; for (let i = 1; i + 1 < k; i++) a2 += (Q[i][0] - Q[0][0]) * (Q[i + 1][1] - Q[0][1]) - (Q[i + 1][0] - Q[0][0]) * (Q[i][1] - Q[0][1]);
    const cr = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]); let croise = 0;
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) { const a = Q[i], b = Q[(i + 1) % k], c = Q[j], d = Q[(j + 1) % k]; if (j === i + 1 || (i === 0 && j === k - 1)) continue;
      const s1 = cr(a, b, c), s2 = cr(a, b, d), s3 = cr(c, d, a), s4 = cr(c, d, b), dans = (p, q, r) => Math.min(p[0], q[0]) <= r[0] && r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);
      if ((s1 * s2 < 0 && s3 * s4 < 0) || (s1 === 0 && dans(a, b, c)) || (s2 === 0 && dans(a, b, d)) || (s3 === 0 && dans(c, d, a)) || (s4 === 0 && dans(c, d, b))) croise++; }
    return { I, B: bord.size, a2: Math.abs(a2), bord, croise }; };
  for (const p of [...extremes(sys('theoremePick')), { sommets: 17, rayon: 23, graine: 4242 }, { sommets: 30, rayon: 8, graine: 7 }]) ok(`theoremePick ${JSON.stringify(p)} : I et B recomptes par balayage, aire par triangles, Pick exact, polygone simple`, () => {
    const R = S('theoremePick', p), I = R.invariants, b = R.brut, Q = JSON.parse(I.bordPgcd.polygone), F = refPick(Q);
    assert.ok(F.croise === 0 && Q.length >= 3, 'polygone non simple : ' + I.bordPgcd.polygone);
    assert.ok(I.pick.interieurs === F.I && I.pick.pointsBord === F.B && I.pick.aire === F.a2 / 2, 'comptes ' + JSON.stringify([I.pick, F.I, F.B, F.a2]));
    assert.ok(F.a2 === 2 * F.I + F.B - 2 && I.pick.mesure === 0 && I.pick.formule === 0 && I.bordPgcd.mesure === 0, 'Pick ' + JSON.stringify(I.pick));
    assert.ok(I.temoin.mesure === 17 && I.temoin.formule === 17 && I.temoin.lacet === 0, 'temoin ' + JSON.stringify(I.temoin));
    let mal = 0, interieurs = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1], e = b[o + 2], cle = x + ',' + y;
      if (e === 0) { let sur = false; for (let i = 0; i < Q.length && !sur; i++) { const a = Q[i], c = Q[(i + 1) % Q.length]; sur = Math.abs((c[0] - a[0]) * (y - a[1]) - (c[1] - a[1]) * (x - a[0])) < 1e-6 && Math.min(a[0], c[0]) - 1e-9 <= x && x <= Math.max(a[0], c[0]) + 1e-9 && Math.min(a[1], c[1]) - 1e-9 <= y && y <= Math.max(a[1], c[1]) + 1e-9; } if (!sur) mal++; }
      else if (e === 2) { if (!F.bord.has(cle)) mal++; } else if (e === 1) { interieurs++; if (F.bord.has(cle) || !Number.isInteger(x) || !Number.isInteger(y)) mal++; } else mal++; }
    assert.ok(mal === 0 && (F.I === 0 || interieurs > 0), 'dessin ' + mal + ' points faux');
    return Q.length + ' sommets : A = ' + I.pick.aire + ' = ' + F.I + ' + ' + F.B + '/2 - 1';
  });
  ok('theoremePick : valeurs de controle (carre 0..4 : I = 9, B = 16, A = 16 ; triangle (0,0) (4,0) (0,3) : I = 3, B = 8, A = 6)', () => {
    const c = refPick([[0, 0], [4, 0], [4, 4], [0, 4]]), t = refPick([[0, 0], [4, 0], [0, 3]]);
    assert.deepEqual([c.I, c.B, c.a2, t.I, t.B, t.a2], [9, 16, 32, 3, 8, 12]); return 'ok'; });
  /* game166 : percolation — reference INDEPENDANTE : parcours en LARGEUR depuis le bord gauche (pas d union-find), liens dans un autre ordre ;
   *   enumeration des petits cas refaite ici ; valeurs de Grok Bot (64/128, 65536/131072) ; le dessin relu lien par lien */
  const percoRef = (W, H, ouvertH, ouvertV) => { const vu = new Set(), file = []; for (let y = 0; y <= H; y++) { vu.add('0,' + y); file.push([0, y]); }
    while (file.length) { const [x, y] = file.pop(); if (x === W) return true;
      for (const [nx, ny, o] of [[x + 1, y, x < W && ouvertH(x, y)], [x - 1, y, x > 0 && ouvertH(x - 1, y)], [x, y + 1, y < H && ouvertV(x, y)], [x, y - 1, y > 0 && ouvertV(x, y - 1)]])
        if (o && !vu.has(nx + ',' + ny)) { vu.add(nx + ',' + ny); file.push([nx, ny]); } }
    return false; };
  const percoEnum = (W, H) => { const nh = W * (H + 1), nv = (W + 1) * H; let t = 0;
    for (let c = 0; c < 2 ** (nh + nv); c++) if (percoRef(W, H, (x, y) => (c >> (y * W + x)) & 1, (x, y) => (c >> (nh + y * (W + 1) + x)) & 1)) t++; return t + '/' + 2 ** (nh + nv); };
  ok('percolationLiens : enumeration refaite (largeur) = valeurs de Grok Bot ; carre 2x2 = 2752/4096 ; couche 1x2 = 112/128', () => {
    assert.deepEqual([percoEnum(2, 1), percoEnum(3, 2), percoEnum(2, 2), percoEnum(1, 2)], ['64/128', '65536/131072', '2752/4096', '112/128']);
    const I = S('percolationLiens', { cote: 5 }).invariants; assert.ok(I.dualite.mesure === 0 && I.dualite.n1 === '64/128' && I.dualite.n2 === '65536/131072' && I.temoin.mesure === '2752/4096' && I.temoin.formule === '2752/4096', JSON.stringify(I));
    return 'ok'; });
  for (const p of [...extremes(sys('percolationLiens')), { cote: 17, graine: 4242 }]) ok(`percolationLiens ${JSON.stringify(p)} : 400 rectangles a 4 sigma de 1/2, dessin sur des liens, etiquettes relues`, () => {
    const R = S('percolationLiens', p), I = R.invariants, b = R.brut, N = R.params.cote, W = N + 1, H = N;
    assert.ok(I.simulee.formule === 0.5 && I.simulee.parties === 400 && Math.abs(I.simulee.sigma - 0.025) < 1e-15 && Math.abs(I.simulee.mesure - 0.5) <= 4 * I.simulee.sigma, 'simulee ' + JSON.stringify(I.simulee));
    /* le dessin : chaque point sur un lien du rectangle ; les liens dessines sont ouverts -> on reconstruit le reseau ouvert DEPUIS le dessin,
     *   et l etiquette 2 (amas qui traverse) doit etre presente ssi ce reseau traverse (parcours en largeur) */
    const H1 = new Set(), V1 = new Set(); let mal = 0, deux = 0;
    for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1], e = b[o + 2], xi = Math.floor(x + 1e-12), yi = Math.floor(y + 1e-12), ent = (v) => Math.abs(v - Math.round(v)) < 1e-9;
      if (![0, 1, 2].includes(e)) mal++; if (e === 2) deux++;
      if (ent(y) && x >= 0 && x <= W && y >= 0 && y <= H) { if (!ent(x)) H1.add(xi + ',' + Math.round(y)); }
      else if (ent(x) && x >= 0 && x <= W && y >= 0 && y <= H) V1.add(Math.round(x) + ',' + yi); else mal++; }
    assert.equal(mal, 0, 'points hors des liens');
    const trav = percoRef(W, H, (x, y) => H1.has(x + ',' + y), (x, y) => V1.has(x + ',' + y));
    if (trav) assert.ok(deux > 0, 'le reseau dessine traverse mais aucun point etiquete 2');
    return 'n = ' + N + ' : ' + I.simulee.mesure + ' traverses (z = ' + ((I.simulee.mesure - 0.5) / I.simulee.sigma).toFixed(2) + ')';
  });
  /* game167 : Napoleon — reference INDEPENDANTE en flottants par NOMBRES COMPLEXES (rotation par e^(i pi/3), pas de Q(sqrt 3)) ;
   *   centres de Grok Bot pour (0,0) (6,0) (0,8) : (3, -sqrt3), (3 + 4 sqrt3/3, 4 + sqrt3), (-4 sqrt3/3, 4) */
  const napRef = (T, sens) => { const z = T.map(([x, y]) => [x, y]), w = [0.5, sens * Math.sqrt(3) / 2], mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
    /* sommet exterieur sur PQ (sens direct) : P + (Q - P) e^(-i pi/3) */
    const G = [0, 1, 2].map((i) => { const P = z[i], Q = z[(i + 1) % 3], d = mul([Q[0] - P[0], Q[1] - P[1]], w), E = [P[0] + d[0], P[1] + d[1]]; return [(P[0] + Q[0] + E[0]) / 3, (P[1] + Q[1] + E[1]) / 3]; });
    const L = [0, 1, 2].map((i) => Math.hypot(G[i][0] - G[(i + 1) % 3][0], G[i][1] - G[(i + 1) % 3][1])); return { G, L }; };
  ok('napoleon : centres de Grok Bot retrouves (triangle (0,0) (6,0) (0,8)) ; cote^2 = 100/3 + 16 sqrt3 = (a^2 + b^2 + c^2 + 4 sqrt3 aire)/6', () => {
    const r = napRef([[0, 0], [6, 0], [0, 8]], -1), s3 = Math.sqrt(3), at = [[3, -s3], [3 + 4 * s3 / 3, 4 + s3], [-4 * s3 / 3, 4]];
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(r.G[i][0] - at[i][0]) < 1e-12 && Math.abs(r.G[i][1] - at[i][1]) < 1e-12, 'centre ' + i + ' ' + r.G[i]);
    assert.ok(Math.abs(r.L[0] ** 2 - (100 / 3 + 16 * s3)) < 1e-11 && Math.abs((200 + 4 * s3 * 24) / 6 - (100 / 3 + 16 * s3)) < 1e-12); return 'cote = ' + r.L[0].toFixed(12); });
  for (const p of [...extremes(sys('napoleon')), { taille: 23, graine: 4242 }]) ok(`napoleon ${JSON.stringify(p)} : exterieur et interieur equilateraux (exact ET en complexes), aires, dessin`, () => {
    const R = S('napoleon', p), I = R.invariants, b = R.brut, T = JSON.parse(I.equilateral.triangle), X = napRef(T, -1), Y = napRef(T, 1);
    assert.ok(I.equilateral.mesure === 0 && I.interieur.mesure === 0 && I.aires.mesure === 0 && /^0 \+ 0 sqrt3$/.test(I.aires.exact), JSON.stringify(I));
    const tol = 1e-9 * (1 + X.L[0]); assert.ok(Math.abs(X.L[0] - X.L[1]) < tol && Math.abs(X.L[1] - X.L[2]) < tol && Math.abs(Y.L[0] - Y.L[1]) < tol, 'reference ' + X.L + ' ' + Y.L);
    const [a, c, s] = I.equilateral.cote2.split(/ \+ | sqrt3/).map((t) => { const [u, v] = t.split('/'); return Number(u) / (v ? Number(v) : 1); });
    assert.ok(Math.abs(a + c * Math.sqrt(3) - X.L[0] ** 2) < 1e-9 * (1 + X.L[0] ** 2), 'cote2 exact ' + I.equilateral.cote2 + ' vs ' + X.L[0] ** 2);
    const aire = Math.abs((T[1][0] - T[0][0]) * (T[2][1] - T[0][1]) - (T[1][1] - T[0][1]) * (T[2][0] - T[0][0])) / 2;
    assert.ok(aire > 0 && Math.abs(Math.sqrt(3) / 4 * (X.L[0] ** 2 - Y.L[0] ** 2) - aire) < 1e-9 * (1 + aire), 'aires en complexes');
    assert.equal(I.temoin.mesure, '116, 130, 98');
    /* dessin : etiquette 2 sur le triangle des centres de la reference, 0 sur le triangle */
    const surSeg = (P, A, B) => { const ab = [B[0] - A[0], B[1] - A[1]], l = Math.hypot(...ab), cr = (P[0] - A[0]) * ab[1] - (P[1] - A[1]) * ab[0], d = ((P[0] - A[0]) * ab[0] + (P[1] - A[1]) * ab[1]) / l; return Math.abs(cr / l) < 1e-9 && d >= -1e-9 && d <= l + 1e-9; };
    let mal = 0, deux = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, P = [b[o], b[o + 1]], e = b[o + 2], tri = e === 2 ? X.G : T;
      if (e === 1) continue; if (e === 2) deux++; if (![0, 1, 2].some((i) => surSeg(P, tri[i], tri[(i + 1) % 3]))) mal++; }
    assert.ok(mal === 0 && deux > 0, mal + ' points hors de leur triangle'); return 'cote^2 = ' + I.equilateral.cote2;
  });
  /* game168 : billard — reference INDEPENDANTE : pour chaque corde, L par le PRODUIT DES DISTANCES SIGNEES DES FOYERS a la droite
   *   (d1 d2 = b^2 - L pour toute tangente a la confocale de parametre L), avec sa propre reflexion (bissectrice des rayons focaux, pas
   *   le gradient). ⛔ 1re version : le discriminant corde / conique de Grok — MAL CONDITIONNE pour une caustique hyperbole (7e-7 pour
   *   une derive reelle de 2e-14, corde presque parallele a une asymptote) : le banc accusait le module a tort ;
   *   controle de Grok : a = 2, b = 1, caustique a' = 1.8 -> L = a^2 - a'^2 = 0.76 */
  const billardRef = (b, t0, tir, N, L) => { const b2 = b * b, c = Math.sqrt(1 - b2); let p = [Math.cos(t0), b * Math.sin(t0)], v = [Math.cos(tir), Math.sin(tir)];
    if (v[0] * p[0] + v[1] * p[1] / b2 > 0) v = [-v[0], -v[1]]; let pire = 0;
    for (let k = 0; k < N; k++) {
      /* produit des distances signees des foyers (+-c, 0) a la droite n.x = d : b^2 - d1 d2 doit valoir L */
      const n = [-v[1], v[0]], dd = n[0] * p[0] + n[1] * p[1], d1 = n[0] * c - dd, d2 = -n[0] * c - dd;
      pire = Math.max(pire, Math.abs(b2 - d1 * d2 - L));
      const a = v[0] ** 2 + v[1] ** 2 / b2, bb = 2 * (p[0] * v[0] + p[1] * v[1] / b2), cc = p[0] ** 2 + p[1] ** 2 / b2 - 1, s = (-bb + Math.sqrt(Math.max(0, bb * bb - 4 * a * cc))) / (2 * a);
      const q = [p[0] + s * v[0], p[1] + s * v[1]], u1 = [c - q[0], -q[1]], u2 = [-c - q[0], -q[1]], l1 = Math.hypot(...u1), l2 = Math.hypot(...u2);
      let g = [u1[0] / l1 + u2[0] / l2, u1[1] / l1 + u2[1] / l2]; const gl = Math.hypot(...g); g = [g[0] / gl, g[1] / gl]; /* bissectrice des rayons focaux = normale */
      const vg = v[0] * g[0] + v[1] * g[1]; v = [v[0] - 2 * vg * g[0], v[1] - 2 * vg * g[1]]; const r = Math.sqrt(q[0] ** 2 + q[1] ** 2 / b2); p = [q[0] / r, q[1] / r]; }
    return pire; };
  ok('billardElliptique : controle de Grok Bot (a = 2, b = 1, caustique a\' = 1.8 : la corde tangente en theta = 0.7 donne L = 0.76)', () => {
    const ap = 1.8, bp = Math.sqrt(ap * ap - 3), th = 0.7, T = [ap * Math.cos(th), bp * Math.sin(th)], n = [Math.cos(th) / ap, Math.sin(th) / bp], nl = Math.hypot(...n), nu = [n[0] / nl, n[1] / nl], d = nu[0] * T[0] + nu[1] * T[1];
    assert.ok(Math.abs(4 * nu[0] ** 2 + nu[1] ** 2 - d * d - 0.76) < 1e-14); return 'L = 0.76'; });
  for (const p of [...extremes(sys('billardElliptique')), { petitAxe: 0.5, lancer: 17, tir: 10, rebonds: 900 }, { petitAxe: 0.8, lancer: 200, tir: 95, rebonds: 1500 }]) ok(`billardElliptique ${JSON.stringify(p)} : chaque corde tangente a la conique du premier L (produit des foyers), foyers, temoin, dessin`, () => {
    const R = S('billardElliptique', p), I = R.invariants, b = R.brut, P2 = R.params, L = I.caustique.lambda0, b2 = P2.petitAxe ** 2;
    assert.ok(I.caustique.formule === 0 && I.caustique.mesure < 1e-10 && I.foyers.mesure < 1e-12 && I.caustique.rebonds === P2.rebonds, JSON.stringify(I));
    assert.ok(L > 0 && L < 1 && Math.abs(L - b2) > 1e-9 && (L < b2) === /^ellipse/.test(I.caustique.typeCaustique), 'L ' + L);
    const ecartF = billardRef(P2.petitAxe, P2.lancer * Math.PI / 180, P2.tir * Math.PI / 180, P2.rebonds, L); assert.ok(ecartF < 1e-11, 'produit des foyers : ecart ' + ecartF);
    assert.ok(I.temoin.mesure > 1e-4, 'temoin ' + I.temoin.mesure);
    let mal = 0, deux = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1], e = b[o + 2], f = x * x + y * y / b2;
      if (e === 0 && Math.abs(f - 1) > 1e-9) mal++; if (e === 1 && f > 1 + 1e-9) mal++;
      if (e === 2) { deux++; if (Math.abs(x * x / (1 - L) + y * y / (b2 - L) - 1) > 1e-9) mal++; } if (![0, 1, 2].includes(e)) mal++; }
    assert.ok(mal === 0 && deux > 0, mal + ' points faux, ' + deux + ' sur la caustique'); return I.caustique.typeCaustique.split(' ')[0] + ', L = ' + L.toFixed(6) + ', derive ' + I.caustique.mesure.toExponential(1);
  });
  /* game169 : Feuerbach — reference INDEPENDANTE en flottants, par d AUTRES constructions : N = centre du cercle des TROIS MILIEUX
   *   (la definition du cercle des neuf points, pas (O + H)/2), I et excentres par INTERSECTION DES BISSECTRICES (vecteurs unitaires) ;
   *   valeurs de Grok Bot pour 6-8-10 : R = 5, r = 2, exinscrits {4, 6, 12}, d(N,I) = 1/2, d(N,I_x) = 13/2, 17/2, 29/2 */
  const feuRef = (S) => { const [A, B, C] = S, mil = (U, V) => [(U[0] + V[0]) / 2, (U[1] + V[1]) / 2], M = [mil(B, C), mil(C, A), mil(A, B)];
    const cc = (P, Q, R) => { const d = 2 * (P[0] * (Q[1] - R[1]) + Q[0] * (R[1] - P[1]) + R[0] * (P[1] - Q[1])), n2 = (U) => U[0] ** 2 + U[1] ** 2;
      return [(n2(P) * (Q[1] - R[1]) + n2(Q) * (R[1] - P[1]) + n2(R) * (P[1] - Q[1])) / d, (n2(P) * (R[0] - Q[0]) + n2(Q) * (P[0] - R[0]) + n2(R) * (Q[0] - P[0])) / d]; };
    const N = cc(...M), rho = Math.hypot(N[0] - M[0][0], N[1] - M[0][1]);
    const u = (P, Q) => { const d = [Q[0] - P[0], Q[1] - P[1]], l = Math.hypot(...d); return [d[0] / l, d[1] / l]; };
    const inter = (P, dP, Q, dQ) => { const den = dP[0] * dQ[1] - dP[1] * dQ[0], t = ((Q[0] - P[0]) * dQ[1] - (Q[1] - P[1]) * dQ[0]) / den; return [P[0] + t * dP[0], P[1] + t * dP[1]]; };
    const bisInt = (P, Q, R) => { const a = u(P, Q), b = u(P, R); return [a[0] + b[0], a[1] + b[1]]; }, bisExt = (P, Q, R) => { const a = u(P, Q), b = u(P, R); return [a[0] - b[0], a[1] - b[1]]; };
    const distDroite = (P, U, V) => Math.abs((V[0] - U[0]) * (U[1] - P[1]) - (U[0] - P[0]) * (V[1] - U[1])) / Math.hypot(V[0] - U[0], V[1] - U[1]);
    const I = inter(A, bisInt(A, B, C), B, bisInt(B, C, A)), r = distDroite(I, A, B);
    const Ia = inter(B, bisExt(B, C, A), C, bisExt(C, A, B)), Ib = inter(C, bisExt(C, A, B), A, bisExt(A, B, C)), Ic = inter(A, bisExt(A, B, C), B, bisExt(B, C, A));
    const ex = [Ia, Ib, Ic].map((P) => ({ P, r: distDroite(P, B, C) }));
    const d = (P) => Math.hypot(P[0] - N[0], P[1] - N[1]); return { N, rho, I, r, ex, dI: d(I), dEx: ex.map((e) => d(e.P)) }; };
  ok('feuerbach : valeurs de Grok Bot sur 6-8-10 (C = (0,0), B = (6,0), A = (0,8)) retrouvees par la reference', () => {
    const f = feuRef([[0, 8], [6, 0], [0, 0]]); assert.ok(Math.abs(f.rho - 2.5) < 1e-12 && Math.abs(f.r - 2) < 1e-12 && Math.abs(f.dI - 0.5) < 1e-12, JSON.stringify(f));
    assert.deepEqual(f.ex.map((e) => Math.round(e.r * 1e9) / 1e9).sort((x, y) => x - y), [4, 6, 12]); assert.deepEqual(f.dEx.map((v) => Math.round(v * 1e9) / 1e9).sort((x, y) => x - y), [6.5, 8.5, 14.5]); return 'ok'; });
  for (const p of [...extremes(sys('feuerbach')), { taille: 33, graine: 4242 }, { taille: 12, graine: 77 }]) ok(`feuerbach ${JSON.stringify(p)} : quatre tangences exactes ET par bissectrices, rayons, temoin d Euler, dessin`, () => {
    const R = S('feuerbach', p), I = R.invariants, b = R.brut, T = JSON.parse(I.interne.triangle), f = feuRef(T);
    assert.ok(I.interne.mesure === 0 && I.externes.mesure === 0 && I.neufPoints.mesure === 0, JSON.stringify(I));
    const tol = 1e-9 * (1 + f.rho);
    assert.ok(Math.abs(f.dI - Math.abs(f.rho - f.r)) < tol && f.dEx.every((dv, i) => Math.abs(dv - (f.rho + f.ex[i].r)) < tol * 10), 'reference ' + JSON.stringify(f));
    const fr = I.externes.rayons.split(', ').map((t) => { const [u, v] = t.split('/'); return Number(u) / (v ? Number(v) : 1); });
    assert.ok(Math.abs(fr[0] / 2 - f.rho) < tol && Math.abs(fr[1] - f.r) < tol && fr.slice(2).every((q, i) => Math.abs(q - f.ex[i].r) < tol * 10), 'rayons ' + I.externes.rayons);
    /* temoin d Euler : OI^2 = R^2 - 2Rr, et ce n est pas (R - r)^2 */
    const val = (t) => { const [u, v] = String(t).split('/'); return Number(u) / (v ? Number(v) : 1); };
    assert.ok(I.temoin.mesure === I.temoin.formule && Math.abs(val(I.temoin.mesure) - (fr[0] ** 2 - 2 * fr[0] * fr[1])) < 1e-9 * (1 + fr[0] ** 2) && val(I.temoin.carreRmoinsr) > val(I.temoin.mesure), 'temoin ' + JSON.stringify(I.temoin));
    /* dessin : etiquette 1 sur le cercle des neuf points de la reference, 2 sur l inscrit */
    let mal = 0, un = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1], e = b[o + 2];
      if (e === 1) { un++; if (Math.abs(Math.hypot(x - f.N[0], y - f.N[1]) - f.rho) > tol * 10) mal++; }
      if (e === 2 && Math.abs(Math.hypot(x - f.I[0], y - f.I[1]) - f.r) > tol * 10) mal++; if (![0, 1, 2, 3].includes(e)) mal++; }
    assert.ok(mal === 0 && un > 0, mal + ' points hors de leur cercle'); return 'rayons ' + I.externes.rayons;
  });
  /* game170 : jeu de la vie — reference INDEPENDANTE sur une GRILLE (tableau 2D avec une marge assez large pour que rien n atteigne le bord),
   *   pas d ensemble de chaines ; motifs recopies des RLE de LifeWiki ; valeurs de Grok Bot (2, 3, 15 ; 3, 48, 12 cellules) */
  const vieGrille = (cells, gens) => { const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]), M = 2 * gens + 4, W = Math.max(...xs) - Math.min(...xs) + 1 + 2 * M, H = Math.max(...ys) - Math.min(...ys) + 1 + 2 * M;
    let g = Array.from({ length: H }, () => new Uint8Array(W)); for (const [x, y] of cells) g[y - Math.min(...ys) + M][x - Math.min(...xs) + M] = 1;
    const etats = [g.map((r) => r.join('')).join('/')];
    for (let t = 0; t < gens; t++) { const h = Array.from({ length: H }, () => new Uint8Array(W));
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { let v = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) v += g[y + dy][x + dx]; h[y][x] = v === 3 || (v === 2 && g[y][x]) ? 1 : 0; }
      g = h; etats.push(g.map((r) => r.join('')).join('/')); }
    return etats; };
  const vieCellules = { 0: [[0, 0], [1, 0], [2, 0]], 2: [[2, 0], [7, 0], [0, 1], [1, 1], [3, 1], [4, 1], [5, 1], [6, 1], [8, 1], [9, 1], [2, 2], [7, 2]],
    1: (() => { const c = [], L = [2, 3, 4, 8, 9, 10]; for (const y of [0, 5, 7, 12]) for (const x of L) c.push([x, y]); for (const y of [2, 3, 4, 8, 9, 10]) for (const x of [0, 5, 7, 12]) c.push([x, y]); return c; })() };
  for (const p of [{ oscillateur: 0 }, { oscillateur: 1 }, { oscillateur: 2 }]) ok(`jeuDeLaVie ${JSON.stringify(p)} : periode = premier retour sur GRILLE, valeurs de Grok, dessin = les phases`, () => {
    const R = S('jeuDeLaVie', p), I = R.invariants, k = p.oscillateur, cells = vieCellules[k], attendu = [2, 3, 15][k];
    const e = vieGrille(cells, attendu); const premier = e.findIndex((s, i) => i > 0 && s === e[0]);
    assert.ok(premier === attendu && cells.length === [3, 48, 12][k], 'reference ' + premier + ' / ' + cells.length);
    assert.ok(I.retour.mesure === attendu && I.retour.formule === attendu && I.retour.vivantes === cells.length, JSON.stringify(I.retour));
    assert.equal(I.temoin.mesure, I.temoin.formule);
    const gens = new Set(); let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = R.brut[o], y = R.brut[o + 1], g = R.brut[o + 2]; if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(g) || g < 0 || g >= attendu) mal++; gens.add(g); }
    assert.ok(mal === 0 && gens.size === attendu, mal + ' points faux, ' + gens.size + ' generations dessinees'); return I.retour.motif + ' : periode ' + attendu;
  });
  ok('jeuDeLaVie : temoin — le planeur sur GRILLE ne revient pas, et apres 4 il est decale de (1,1)', () => {
    const e = vieGrille([[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]], 12); assert.ok(!e.slice(1).includes(e[0]));
    const lignes = (s) => s.split('/'), a = lignes(e[0]), b = lignes(e[4]); assert.ok(a.slice(0, -1).every((r, y) => '0' + r.slice(0, -1) === b[y + 1]), 'decalage (1,1)'); return 'ok'; });
  ok('montyHall : etalonnage sur 20 graines (ecart-type des z dans [0.5, 1.7])', () => { const zs = []; for (let g = 1; g <= 20; g++) zs.push(z(T.simuler('montyHall', { graine: g }).invariants.changer)); const m = zs.reduce((a, x) => a + x, 0) / 20, sd = Math.sqrt(zs.reduce((a, x) => a + (x - m) ** 2, 0) / 19); assert.ok(sd >= 0.5 && sd <= 1.7 && Math.abs(m) < 1.2, m + ' ' + sd); return m.toFixed(2) + '/' + sd.toFixed(2); });
  ok('etalonnage : 20 graines aux defauts, ecart-type des z dans [0.5, 1.7] (r^2, croisements, partage)', () => {
    const zs = { r2: [], buffon: [], anniv: [] };
    for (let g = 1; g <= 20; g++) { zs.r2.push(z(T.simuler('marcheAleatoire', { graine: g }).invariants.carreDistance)); zs.buffon.push(z(T.simuler('aiguilleBuffon', { graine: g }).invariants.croisements)); zs.anniv.push(z(T.simuler('anniversaires', { graine: g }).invariants.partage)); }
    const out = []; for (const [k, v] of Object.entries(zs)) { const m = v.reduce((a, x) => a + x, 0) / v.length, sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); assert.ok(sd >= 0.5 && sd <= 1.7 && Math.abs(m) < 1.2, k + ' ' + m + ' ' + sd); out.push(`${k} ${m.toFixed(2)}/${sd.toFixed(2)}`); }
    return out.join(', ');
  });
  ok('bornage : hors bornes ramene (verifie AVANT de simuler), NaN -> defaut, entiers arrondis', () => {
    assert.equal(T.reglagesPhysique('marcheAleatoire', { pas: -5 })[1].valeur, 10);
    assert.deepEqual(T.simuler('anniversaires', { personnes: 1.4, jours: 9999, groupes: NaN, graine: 2.6 }, { n: 20 }).params, { personnes: 2, jours: 400, groupes: 2000, graine: 3 });
  });
  return res;
}

const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, true), ech = res.filter((x) => !x.ok);
let assertions = res.length;
const src = readFileSync(SOURCE, 'utf8'), moi = readFileSync(fileURLToPath(import.meta.url), 'utf8');
const interdits = src.match(/Math\.(sin|cos|tan|exp|log|pow|atan2?|asin|acos|hypot|sinh|cosh|tanh|asinh|acosh|cbrt|expm1|log1p|log2|log10|random)\b/g);
assertions++; if (interdits) ech.push({ nom: 'source sans Math transcendante', det: interdits.join(',') });
console.log(`${interdits ? 'ECHEC ' : 'OK    '}source : aucune Math.sin/cos/exp/log/pow/atan/... ni Math.random`);
const marque = new RegExp(['de m' + 'emoire', 'from m' + 'emory', 'de t' + 'ete', 'a sour' + 'cer', 'unsour' + 'ced', 'non sour' + 'ce', 'TO' + 'DO'].join('|'), 'i');
const marques = [src, moi].flatMap((t, i) => t.split(/\r?\n/).map((l, j) => [i ? 'test' : 'module', j + 1, l]).filter(([, , l]) => marque.test(l)));
assertions++; if (marques.length) ech.push({ nom: 'valeur marquee sans source lue', det: marques.map(([f, j]) => f + ':' + j).join(',') });
console.log(`${marques.length ? 'ECHEC ' : 'OK    '}aucune valeur marquee sans source lue (module + banc)`);
console.log('\nTEMPS simuler(id) a n = 1500, defauts et chaque extreme de curseur :');
for (const s of T.SYSTEMES) { let pire = 0, ou = ''; for (const p of extremes(s)) { const a = performance.now(); T.simuler(s.id, p); const t = performance.now() - a; if (t > pire) { pire = t; ou = JSON.stringify(p); } } console.log(`  ${s.id} : pire ${pire.toFixed(0)} ms (${ou})`); }

const MUTANTS = [
  ['marche : sigma sans le - n (et divise par n)', 'sigma: Math.sqrt((N * N - N) / M)', 'sigma: Math.sqrt((N - 1) / M)'],
  ['marche : pas diagonal une fois sur quatre', 'else if (u === 2) y++; else y--;', 'else if (u === 2) { y++; x++; } else y--;'],
  ['buffon : P = l / pi', 'const p = 2 * l / PI,', 'const p = l / PI,'],
  ['buffon : pi relu sans le facteur 2', "mesure: croise ? 2 * l / ph : NaN", "mesure: croise ? l / ph : NaN"],
  ['anniversaires : personnes qui partagent au lieu des paires', 'paires += vu[j];', 'paires += vu[j] > 0 ? 1 : 0;'],
  ['anniversaires : produit decale (1 - (i + 1)/D)', 'tousDiff *= 1 - i / D;', 'tousDiff *= 1 - (i + 1) / D;'],
  ['ulam : N lui-meme jamais raye du crible', 'for (let j = i * i; j <= N; j += i)', 'for (let j = i * i; j < N; j += i)'],
  ['ulam : Li integre depuis ln 1.9', 'u0 = lnD(2), u1', 'u0 = lnD(1.9), u1'],
  ['ulam : spirale tournee dans l autre sens', 'if (d < t) return [k - d, -k];', 'if (d < t) return [-k + d, -k];'],
  ['pascal : OU au lieu de la somme modulo 2', 'suiv[k] = (ligne[k - 1] + ligne[k]) & 1;', 'suiv[k] = ligne[k - 1] | ligne[k];'],
  ['pascal : popcount qui compte chaque bit', 'pc += x & 1;', 'pc += 1;'],
  ['pascal : total 3^m + 1', 'formule: 3 ** m,', 'formule: 3 ** m + 1,'],
  ['solides : face acceptee meme avec des sommets des deux cotes', 'if (pos && neg) continue;', 'if (pos && neg && pos > 1) continue;'],
  ['solides : diedre avec p et q echanges', 'cosD(PI / q) / sinD(PI / p)', 'cosD(PI / p) / sinD(PI / q)'],
  ['solides : dodecaedre faux (1.6 au lieu de phi)', 'signes([0, 1 / ph, ph])', 'signes([0, 1 / ph, 1.6])'],
  ['monty : l animateur peut ouvrir la voiture', 'if (d !== choix && d !== voiture) perdantes.push(d);', 'if (d !== choix) perdantes.push(d);'],
  ['monty : changer (n - 1)/n', 'pC = (N - 1) / (N * (N - 2))', 'pC = (N - 1) / N'],
  ['apollo : jacobien du grand cercle de signe faux', 'F.push(d + r - 1 / -q.k); J.push([dx / d, dy / d, 1]);', 'F.push(d + r - 1 / -q.k); J.push([dx / d, dy / d, -1]);'],
  ['apollo : Descartes avec 2.01', 'descartes = (p, q, s) => p + q + s + 2 * rad(p, q, s),', 'descartes = (p, q, s) => p + q + s + 2.01 * rad(p, q, s),'],
  ['apollo : Descartes complexe faux', 'qi += 2 * wr * wi;', 'qi += wr * wi;'],
  ['apollo : 2^(g-1) au lieu de 3^(g-1)', 'attendu.push(6 * 3 ** (g - 1));', 'attendu.push(6 * 2 ** (g - 1));'],
  ['apollo : un interstice oublie', 'suite.push([a, b, d], [b, c, d], [c, a, d]);', 'suite.push([a, b, d], [b, c, d]);'],
  ['apollo : second cercle pas tangent', 'B = { x: r1, y: 0, k: 1 / (1 - r1), g: 0 };', 'B = { x: r1, y: 0, k: 1 / (1.01 - r1), g: 0 };'],
  ['apollo : cercles dessines 1 % trop grands', 'brut[3 * o] = c.x + R * cosD(t);', 'brut[3 * o] = c.x + 1.01 * R * cosD(t);'],
  ['apollo : Newton arrete trop tot', '< 1e-15 * (1 + Math.abs(x) + Math.abs(y))) break;', '< 1e-3 * (1 + Math.abs(x) + Math.abs(y))) break;'],
  ['sable : brulage trop strict', 'if (!br[i] && h[i] >= nv[i])', 'if (!br[i] && h[i] > nv[i])'],
  ['sable : diagonale du Laplacien 3', 'l[i] = 4n;', 'l[i] = 3n;'],
  ['sable : Bareiss sans division', 'prec = M[k][k]; } return M[N - 1][N - 1];', 'prec = 1n; } return M[N - 1][N - 1];'],
  ['sable : dernier tas jamais compte', 'for (let m = 0; m < 4 ** N; m++)', 'for (let m = 0; m < 4 ** N - 1; m++)'],
  ['sable : voisin du bas oublie', 'if (y < c - 1) V[4 * i + k++] = i + c;', ''],
  ['sable : identite avec 7 grains', 'e[i] = 6 - s[i];', 'e[i] = 7 - s[i];'],
  ['sable : r pas recurrent', 'r[i] = 3 + Math.floor(rng() * 4);', 'r[i] = Math.floor(rng() * 4);'],
  ['sable : Laplacien de u avec 3', 'let lap = 4 * u1[i];', 'let lap = 3 * u1[i];'],
  ['sable : dessine (6)° au lieu de e', 'brut[o + 2] = e[i];', 'brut[o + 2] = s[i];'],
  ['sable : dessin decale d une case', 'brut[o] = i % c;', 'brut[o] = (i + 1) % c;'],
  ['verger : pgcd qui s arrete un pas trop tot', 'function pgcd(a, b) { while (b) {', 'function pgcd(a, b) { while (b > 1) {'],
  ['verger : formule sans le - 1', 'formule: 2 * sPhi - 1, sommePhi', 'formule: 2 * sPhi, sommePhi'],
  ['verger : crible phi qui oublie p', 'phi[m] -= phi[m] / p;', 'if (m > p) phi[m] -= phi[m] / p;'],
  ['verger : mu sans les carres', 'for (let m = p * p; m <= N; m += p * p) mu[m] = 0;', ''],
  ['verger : limite 6/pi', 'limite = 6 / (PI * PI),', 'limite = 6 / (PI * 3.2),'],
  ['verger : borne sans le ln', 'borne = (3 + 2 * lnD(N)) / N;', 'borne = 3 / N;'],
  ['verger : diagonale qui compte aussi b = 2a', 'if (a === b) diag++;', 'if (a === b || b === 2 * a) diag++;'],
  ['verger : dessin decale d un arbre', 'brut[o] = vis[2 * i]; brut[o + 1] = vis[2 * i + 1];', 'brut[o] = vis[2 * i] + 1; brut[o + 1] = vis[2 * i + 1];'],
  ['ford : tri par numerateur seul', 'F.sort((u, v) => u[0] * v[1] - v[0] * u[1]);', 'F.sort((u, v) => u[0] - v[0] || u[1] - v[1]);'],
  ['ford : rayon 1/q^2', 'const R = (q) => 1 / (2 * q * q);', 'const R = (q) => 1 / (q * q);'],
  ['ford : 1 + sum phi sans le 1', 'formule: 1 + sPhi, note', 'formule: sPhi, note'],
  ['ford : p = q oublie (1/1 manque)', 'for (let p = 0; p <= q; p++) if (pgcd(p, q) === 1)', 'for (let p = 0; p < q; p++) if (pgcd(p, q) === 1)'],
  ['ford : chevauchement sans le - 1', 'minChev = Math.min(minChev, x * x - 1);', 'minChev = Math.min(minChev, x * x);'],
  ['ford : cercles dessines 1 % trop grands', 'brut[3 * o] = p / q + r * cosD(t);', 'brut[3 * o] = p / q + 1.01 * r * cosD(t);'],
  ['ford : temoin avec 2/5', 'const t1 = 1 / 3, t2 = 2 / 3,', 'const t1 = 1 / 3, t2 = 2 / 5,'],
  ['steiner : poids 1/d^2 au lieu de 1/d', 'const wa = 1 / Math.max(dist(Q, a), 1e-300), wb', 'const wa = 1 / Math.max(dist(Q, a) ** 2, 1e-300), wb'],
  ['steiner : 3 iterations seulement', 'for (let k = 0; k < 2000; k++) { S = fermat(S, s1, s2, T);', 'for (let k = 0; k < 3; k++) { S = fermat(S, s1, s2, T);'],
  ['steiner : garde la forme la plus LONGUE', 'best = h.long <= v.long ? h : v,', 'best = h.long >= v.long ? h : v,'],
  ['steiner : formule L + sqrt 2', 'ex = Math.min(L + r3, 1 + r3 * L),', 'ex = Math.min(L + Math.sqrt(2), 1 + r3 * L),'],
  ['steiner : arbre sans carrefour 2 + L partout', 'arbreSansCarrefour: 2 * Math.min(L, 1) + Math.max(L, 1),', 'arbreSansCarrefour: 2 + L,'],
  ['steiner : reseau dessine decale', 'brut[o] = p[0] + u * (q[0] - p[0]);', 'brut[o] = p[0] + u * (q[0] - p[0]) + 0.01;'],
  ['steiner : angle mesure avec cos + 0.4', 'Math.abs(cosA(Q, u, v) + 0.5)', 'Math.abs(cosA(Q, u, v) + 0.4)'],
  ['caustique : reflexion d = (-cos t, -sin t)', 'd: [-cosD(2 * t), -sinD(2 * t)]', 'd: [-cosD(t), -sinD(t)]'],
  ['caustique : nephroide avec cos 2t', 'ex = [R * (3 * cosD(m) - cosD(3 * m)) / 4,', 'ex = [R * (3 * cosD(m) - cosD(2 * m)) / 4,'],
  ['caustique : longueur 2R', 'formule: 3 * R, note', 'formule: 2 * R, note'],
  ['caustique : pointe cherchee en R/3', 'pointe = Math.min(pointe, Math.sqrt((X[0] - R / 2) ** 2', 'pointe = Math.min(pointe, Math.sqrt((X[0] - R / 3) ** 2'],
  ['caustique : temoin a 45 degres', 'const r60 = ray(PI / 3),', 'const r60 = ray(PI / 4),'],
  ['caustique : paroi dessinee 1 % trop grande', 'brut[o] = R * cosD(t); brut[o + 1] = R * sinD(t); brut[o + 2] = 1;', 'brut[o] = 1.01 * R * cosD(t); brut[o + 1] = R * sinD(t); brut[o + 2] = 1;'],
  ['caustique : croisement de rayons non voisins', 'b = a + PI / N, X = croise(ray(a), ray(b));', 'b = a + 5 * PI / N, X = croise(ray(a), ray(b));'],
  ['hofstadter : phase sans p', 'A[n][n] = 2 * cosD(2 * PI * p * n / q + th);', 'A[n][n] = 2 * cosD(2 * PI * n / q + th);'],
  ['hofstadter : coin antiperiodique +1', '...jacobiSym(harperMat(p, q, PI / q, -1))', '...jacobiSym(harperMat(p, q, PI / q, 1))'],
  ['hofstadter : seuil |P| <= 2', 'if (Math.abs(harperP((lo + hi) / 2, p, q)) > 4 + 1e-9) malBandes++;', 'if (Math.abs(harperP((lo + hi) / 2, p, q)) > 2 + 1e-9) malBandes++;'],
  ['hofstadter : gaps attendus q - 1 toujours', 'if (ouverts !== (q % 2 ? q - 1 : q - 2)) malGaps++;', 'if (ouverts !== q - 1) malGaps++;'],
  ['hofstadter : Jacobi arrete trop tot', 'if (off < 1e-30) break;\n    for (let p = 0; p < n; p++)', 'if (off < 1e-2) break;\n    for (let p = 0; p < n; p++)'],
  ['hofstadter : 1/3 avec sqrt 2', 'const r3 = Math.sqrt(3), ex13', 'const r3 = Math.sqrt(2), ex13'],
  ['hofstadter : dessin decale en energie', 'brut[3 * o + 1] = m === 1 ? (lo + hi) / 2 : lo + (hi - lo) * j / (m - 1);', 'brut[3 * o + 1] = 0.01 + (m === 1 ? (lo + hi) / 2 : lo + (hi - lo) * j / (m - 1));'],
  ['dominos : domino debout sur la case occupee', "if (i + 1 < m && !(e >> (i + 1) & 1)) { ch.push([1, i]);", "if (i + 1 < m) { ch.push([1, i]);"],
  ['dominos : Kasteleyn avec 2 cos^2', 'kast *= 4 * cosD(PI * j / (m + 1)) ** 2 + 4 * cosD(PI * k / (L + 1)) ** 2;', 'kast *= 2 * cosD(PI * j / (m + 1)) ** 2 + 4 * cosD(PI * k / (L + 1)) ** 2;'],
  ['dominos : tirage biaise (premier choix toujours)', 'if (u < w) { cols.push(t.choix); e = t.sortie; break; } u -= w;', 'if (u < w || true) { cols.push(t.choix); e = t.sortie; break; } u -= w;'],
  ['dominos : probabilite du coin avec le mauvais reste', 'h += R[L - 1][t.sortie];', 'h += R[L - 1][0];'],
  ['dominos : Fibonacci F(L)', 'for (let i = 1; i < L; i++) [fa, fb] = [fb, fa + fb];', 'for (let i = 2; i < L; i++) [fa, fb] = [fb, fa + fb];'],
  ['dominos : dessin d un domino couche vers le haut', 'doms.push(k === 0 ? [c, i, c + 1, i, 0] : [c, i, c, i + 1, 1])', 'doms.push(k === 0 ? [c, i, c + 1, i + 1, 0] : [c, i, c, i + 1, 1])'],
  ['ising : energie sans le voisin du bas (exact)', 'E += s * (((c >> (y * L + (x + 1) % L)) & 1) ? 1 : -1) + s * (((c >> (((y + 1) % L) * L + x)) & 1) ? 1 : -1);', 'E += s * (((c >> (y * L + (x + 1) % L)) & 1) ? 1 : -1);'],
  ['ising : Metropolis accepte avec e^(-beta k)', 'acc.push(expD(-beta * 2 * k));', 'acc.push(expD(-beta * k));'],
  ['ising : aimantation signee', 'ZM += Math.abs(M) / N * w;', 'ZM += M / N * w;'],
  ['ising : beta_c avec sqrt 3', 'const betaC = lnD(1 + Math.sqrt(2)) / 2;', 'const betaC = lnD(1 + Math.sqrt(3)) / 2;'],
  ['ising : un seul lot (sigma faux)', 'for (let b = 0; b < 20; b++) { let sE = 0', 'for (let b = 0; b < 2; b++) { let sE = 0'],
  ['azteque : convention de couleur inverse', 'const c = (d.x + d.y + k + 1) & 1;', 'const c = (d.x + d.y + k) & 1;'],
  ['azteque : destruction oubliee (N contre S)', 'if (j !== undefined && fl[j] === 1) mort[i] = mort[j] = 1;', 'if (j !== undefined && fl[j] === 1 && false) mort[i] = mort[j] = 1;'],
  ['azteque : creation biaisee (70 % couches)', 'if (rng() < 0.5) nouv.push({ x, y, h: 1 }', 'if (rng() < 0.7) nouv.push({ x, y, h: 1 }'],
  ['azteque : formule 2^(k^2/2)', 'formules = [1, 2, 3, 4].map((k) => 2 ** (k * (k + 1) / 2))', 'formules = [1, 2, 3, 4].map((k) => 2 ** (k * k / 2))'],
  ['azteque : rayon n/2', 'const R = N / Math.SQRT2;', 'const R = N / 2;'],
  ['azteque : dessin decale', 'brut[o] = q.x + 0.5 + (q.h ? u : 0);', 'brut[o] = q.x + 1.5 + (q.h ? u : 0);'],
  ['coupons : H_n sans le dernier terme', 'for (let k = 1n; k <= BigInt(N); k++) { H = fracAdd(H, [1n, k]);', 'for (let k = 1n; k < BigInt(N); k++) { H = fracAdd(H, [1n, k]);'],
  ['coupons : variance sans le - n H_n', 'V = fracAdd([Nb * Nb * H2[0], H2[1]], [-E[0], E[1]]);', 'V = fracAdd([Nb * Nb * H2[0], H2[1]], [0n, 1n]);'],
  ['coupons : tirage biaise vers les petites vignettes (se termine toujours ; n - 1 vignettes bouclait sans fin le 2026-11-05)', 'const v = Math.floor(rng() * N);', 'const v = Math.floor(rng() * rng() * N);'],
  ['coupons : courbe exacte (1 - 1/n)^(t+1)', 'const ex = N * (1 - (1 - 1 / N) ** t);', 'const ex = N * (1 - (1 - 1 / N) ** (t + 1));'],
  ['coupons : courbe dessinee decalee', "brut[o + 1] = g < Dn ? courbes[g][t] : N * (1 - (1 - 1 / N) ** t);", "brut[o + 1] = g < Dn ? courbes[g][t] : N * (1 - (1 - 1 / N) ** (t + 1));"],
  ['ruine : r = p/q', 'r = q / p, egal =', 'r = p / q, egal ='],
  ['ruine : 1 - z/a remplace par z/a', 'const qz = egal ? 1 - z / a :', 'const qz = egal ? z / a :'],
  ['ruine : duree z (a + z)', ', dz = egal ? z * (a - z) :', ', dz = egal ? z * (a + z) :'],
  ['ruine : gain avec <= au lieu de <', 'x += rng() < p ? 1 : -1;', 'x += rng() < p + 0.02 ? 1 : -1;'],
  ['ruine : arret a 1 au lieu de 0', 'while (x > 0 && x < a) {', 'while (x > 1 && x < a) {'],
  ['catalan : descente permise sous le sol', 'if (d < u) rec(u, d + 1);', 'if (d <= u) rec(u, d + 1);'],
  ['catalan : binome sur n au lieu de n + 1', 'formules.push(String(binomB(2 * k, k) / BigInt(k + 1)));', 'formules.push(String(binomB(2 * k, k) / BigInt(k + 2)));'],
  ['catalan : rotation au dernier minimum', 'if (h < min) { min = h; im = i; }', 'if (h <= min) { min = h; im = i; }'],
  ['catalan : n descentes seulement', 'for (let i = 0; i <= n; i++) s.push(-1);', 'for (let i = 0; i < n; i++) s.push(-1);'],
  ['catalan : temoin binom(10, 4)', "mesure: String(binomB(10, 5)), formule: '252'", "mesure: String(binomB(10, 4)), formule: '252'"],
  ['partitions : signe pentagonal inverse', 'const sg = k % 2 ? 1n : -1n;', 'const sg = k % 2 ? -1n : 1n;'],
  ['partitions : second pentagonal oublie', 'if (g2 <= n) s += sg * p[n - g2];', ''],
  ['partitions : tirage avec parts <= k + 1', 'parts.push(j); m -= j; k = j; break;', 'parts.push(j); m -= j; k = j + 1; break;'],
  ['partitions : diagramme dessine decale', 'brut[o] = q[0]; brut[o + 1] = q[1];', 'brut[o] = q[0] + 1; brut[o + 1] = q[1];'],
  ['dragon : complement oublie', "c += h[k] === 'R' ? 'L' : 'R';", 'c += h[k];'],
  ['dragon : regle des bits avec j impair', "h += ((x - 1) / 2) % 2 === 0 ? 'R' : 'L';", "h += ((x - 1) / 2) % 2 === 1 ? 'R' : 'L';"],
  ['dragon : virage R tourne a gauche', "const ndx = c === 'R' ? dy : -dy, ndy = c === 'R' ? -dx : dx;", "const ndx = c === 'R' ? -dy : -dy, ndy = c === 'R' ? dx : dx;"],
  ['dragon : formule 2^(n+1)', 'formule: 2 ** N, recouvrements', 'formule: 2 ** (N + 1), recouvrements'],
  ['dragon : dessin decale', 'brut[o] = a[0] + u * (b[0] - a[0]);', 'brut[o] = a[0] + 0.3 + u * (b[0] - a[0]);'],
  ['pick : formule 2I + B - 1', 'pick: { mesure: a2 - (2 * I + B - 2)', 'pick: { mesure: a2 - (2 * I + B - 1)'],
  ['pick : pgcd remplace par 1', 'sg += pgcd(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));', 'sg += 1;'],
  /* « croisements comptes a gauche au lieu de droite » serait EQUIVALENT (la parite ne change pas) : on mute la decision elle-meme */
  ['pick : dedans compte a l envers', 'if (c) { I++; pts.push([x, y, 1]); }', 'if (!c) { I++; pts.push([x, y, 1]); }'],
  ['pick : bord sans les extremites', 'r[0] <= Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);', 'r[0] < Math.max(p[0], q[0]) && Math.min(p[1], q[1]) <= r[1] && r[1] <= Math.max(p[1], q[1]);'],
  ['pick : temoin carre', 'papillon = [[0, 0], [4, 4], [4, 0], [0, 4]]', 'papillon = [[0, 0], [4, 0], [4, 4], [0, 4]]'],
  ['pick : points interieurs decales', 'brut[o] = pe[0]; brut[o + 1] = pe[1];', 'brut[o] = pe[0] + 1; brut[o + 1] = pe[1];'],
  ['percolation : bord droit oublie', 'bord[f(y * (W + 1) + W)] |= 2;', 'bord[f(y * (W + 1))] |= 2;'],
  ['percolation : liens verticaux decales', 'E.push([id(x, y), id(x, y + 1), x, y, 1]);', 'E.push([id(x, y), id(Math.min(W, x + 1), y + 1), x, y, 1]);'],
  ['percolation : ouverture 0.6', 'ouvert[k] = rng() < 0.5 ? 1 : 0; if (percoAmas', 'ouvert[k] = rng() < 0.6 ? 1 : 0; if (percoAmas'],
  ['percolation : valeur absolue oubliee', 'mesure: Math.abs(e1.t / e1.total - 0.5) + Math.abs(e2.t / e2.total - 0.5)', 'mesure: (e1.t / e1.total - 0.5) + (e2.t / e2.total - 0.75)'],
  ['percolation : dessin decale', "brut[o] = li[0] + (li[2] === 0 ? u : 0);", "brut[o] = li[0] + 0.5 + (li[2] === 0 ? u : 0);"],
  ['napoleon : rotation de 90 au lieu de 60', 'const NAP_DEMI = [[1n, 2n], [0n, 1n]], NAP_R = [[0n, 1n], [1n, 2n]]', 'const NAP_DEMI = [[0n, 1n], [0n, 1n]], NAP_R = [[1n, 1n], [0n, 1n]]'],
  ['napoleon : centre = milieu de deux sommets', 'NAP_TIERS = [[1n, 3n], [0n, 1n]];', 'NAP_TIERS = [[1n, 2n], [0n, 1n]];'],
  ['napoleon : sqrt3^2 = 2', 'napFM(napFM(x[1], y[1]), [3n, 1n])', 'napFM(napFM(x[1], y[1]), [2n, 1n])'],
  ['napoleon : interieur = exterieur', 'const ext = (P, Q) => exterieur ? napSommet(P, Q) : napSommet(Q, P)', 'const ext = (P, Q) => napSommet(P, Q)'],
  ['napoleon : triangle non reoriente', 'else if (cr < 0) T = [t[0], t[2], t[1]]; }', 'else if (cr < 0) T = t; }'],
  ['billard : normale radiale', 'let g = radiale ? [q[0], q[1]] : [q[0], q[1] / b2];', 'let g = [q[0], q[1]];'],
  ['billard : L sans b^2', 'L.push(n[0] * n[0] + b2 * n[1] * n[1] - d * d);', 'L.push(n[0] * n[0] + n[1] * n[1] - d * d);'],
  ['billard : foyers a 1 - b', 'const c = Math.sqrt(1 - b2);', 'const c = 1 - b;'],
  ['billard : caustique hyperbole prise pour ellipse', 'L0 = R.L0, ellipse = L0 < b2;', 'L0 = R.L0, ellipse = true;'],
  ['billard : trajectoire hors de la table', 'brut[o] = x; brut[o + 1] = y; brut[o + 2] = e; }', 'brut[o] = e === 1 ? 1.2 * x : x; brut[o + 1] = y; brut[o + 2] = e; }'],
  ['feuerbach : excentre au mauvais signe', 'Ia = bar(-a, b, c)', 'Ia = bar(a, -b, c)'],
  ['feuerbach : R = abc / 2K', 'const R = feuDiv(feuE(a * b * c), feuMul(feuE(4), K))', 'const R = feuDiv(feuE(a * b * c), feuMul(feuE(2), K))'],
  ['feuerbach : N = O', 'const N = [feuDiv(feuAdd(O[0], H[0]), feuE(2)), feuDiv(feuAdd(O[1], H[1]), feuE(2))];', 'const N = O;'],
  ['feuerbach : inscrit tangent de l exterieur', 'interne: feuEq(d2(N, I), carre(feuSub(R2, r)))', 'interne: feuEq(d2(N, I), carre(feuAdd(R2, r)))'],
  ['feuerbach : temoin (R - r)^2', 'temoin: { mesure: feuTexte(F.oi2), formule: feuTexte(F.euler)', 'temoin: { mesure: feuTexte(F.oi2), formule: feuTexte(F.rMoinsR2)'],
  ['feuerbach : cercle inscrit decale', 'brut[o] = feuNb(Cc[0]) + feuNb(rr) * cosD(ang);', 'brut[o] = feuNb(Cc[0]) + (e === 2 ? 0.3 : 0) + feuNb(rr) * cosD(ang);'],
  ['vie : survie a 2 seulement', 'if (v === 3 || (v === 2 && S.has(c))) T.add(c);', 'if ((v === 3 && !S.has(c)) || (v === 2 && S.has(c))) T.add(c);'],
  ['vie : naissance a 2', 'if (v === 3 || (v === 2 && S.has(c))) T.add(c);', 'if (v === 3 || v === 2) T.add(c);'],
  ['vie : periode = premiere phase de meme TAILLE', 'if (vieEgal(S, S0)) p = t; else phases.push(S);', 'if (S.size === S0.size) p = t; else phases.push(S);'],
  ['vie : voisinage sans les diagonales', 'if (dx || dy) { const c = vieCle(x + dx, y + dy);', 'if ((dx || dy) && !(dx && dy)) { const c = vieCle(x + dx, y + dy);'],
  ['vie : pentadecathlon a 13 cellules', "['pentadecathlon', '2bo4bo$2ob4ob2o$2bo4bo!', 15]", "['pentadecathlon', '2bo4bo$2ob4ob2o$2bo3bo!', 15]"],
  ['bornage retire', 'v = Math.min(b, Math.max(a, v));', ''],
  ['Math.random injecte (marche)', 'rng = mulberry32(P.graine), K =', 'rng = Math.random, K ='],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-maths-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = src.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`);
    writeFileSync(f, src.replace(de, vers).replace("from './tam-moteur.js'", `from '${moteur}'`));
    /* le systeme vise par le mutant, d apres le premier mot de son nom ; « bornage » et le reste : tout */
    const CIBLES = { vie: ['jeuDeLaVie'], feuerbach: ['feuerbach'], billard: ['billardElliptique'], napoleon: ['napoleon'], percolation: ['percolationLiens'], pick: ['theoremePick'], dragon: ['courbeDragon'], partitions: ['partitionEuler'], catalan: ['catalanDyck'], marche: ['marcheAleatoire'], buffon: ['aiguilleBuffon'], anniversaires: ['anniversaires'], ulam: ['spiraleUlam'], pascal: ['pascalSierpinski'], solides: ['solidesPlatoniques'], monty: ['montyHall'], apollo: ['apollonius'], sable: ['tasDeSable'], verger: ['vergerEuclide'], ford: ['cerclesFord'], steiner: ['fermatSteiner'], caustique: ['causticTasse'], hofstadter: ['papillonHofstadter'], dominos: ['dominosKasteleyn'], ising: ['ising'], azteque: ['aztecDiamond'], coupons: ['collectionneur'], ruine: ['ruineJoueur'] };
    const cible = CIBLES[nom.split(' ')[0]] || null;
    let r; try { r = suite(await import(pathToFileURL(f).href), false, cible); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-maths-20261103 : ${assertions} assertions OK`);
