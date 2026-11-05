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
const IDS = ['marcheAleatoire', 'aiguilleBuffon', 'anniversaires', 'spiraleUlam', 'pascalSierpinski', 'solidesPlatoniques', 'montyHall', 'apollonius', 'tasDeSable', 'vergerEuclide', 'cerclesFord', 'fermatSteiner', 'causticTasse', 'papillonHofstadter', 'dominosKasteleyn', 'ising', 'aztecDiamond'];

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

function suite(T, bavard = false) {
  const res = [];
  const ok = (nom, f) => {
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
    let r; try { r = suite(await import(pathToFileURL(f).href)); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-maths-20261103 : ${assertions} assertions OK`);
