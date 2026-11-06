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
const IDS = ['marcheAleatoire', 'aiguilleBuffon', 'anniversaires', 'spiraleUlam', 'pascalSierpinski', 'solidesPlatoniques', 'montyHall', 'apollonius', 'tasDeSable', 'vergerEuclide', 'cerclesFord', 'fermatSteiner', 'causticTasse', 'papillonHofstadter', 'dominosKasteleyn', 'ising', 'aztecDiamond', 'collectionneur', 'ruineJoueur', 'catalanDyck', 'partitionEuler', 'courbeDragon', 'theoremePick', 'percolationLiens', 'napoleon', 'billardElliptique', 'feuerbach', 'jeuDeLaVie', 'marcheAutoEvitante', 'eulerSolides', 'morley', 'bale', 'simsonDroite', 'distinctesImpaires', 'triangulations', 'ramseyR33', 'pascalHexagramme', 'ptolemee', 'sommesCarres', 'equationPell', 'nombresCarmichael', 'theoremeWilson', 'fonctionMertens', 'parfaitsAmicaux', 'nombresBernoulli', 'problemeJosephus', 'zeckendorf', 'theoremeLucas', 'calkinWilf', 'toursHanoi', 'regarderDire', 'derangements', 'nombresHarmoniques', 'suiteCollatz', 'routineKaprekar', 'stirlingBell', 'motzkinChemins', 'periodePisano', 'indicatriceEuler', 'goldbachPaires'];

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
  /* game171 : marches auto-evitantes — reference INDEPENDANTE : comptage ITERATIF par niveaux (chaque marche = une liste de points dans un
   *   Set de chaines, prolongee d un pas), jusqu a n = 9 ; au-dela, symetrie : c(n) = 4 x (marches dont le 1er pas va a droite) ;
   *   valeurs de Grok Bot (A001411, n = 0..12) */
  const sawNiveaux = (N) => { let niv = [[[0, 0]]]; const c = [1];
    for (let k = 1; k <= N; k++) { const suiv = []; for (const m of niv) { const vus = new Set(m.map((p) => p.join(','))), [x, y] = m[m.length - 1];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!vus.has((x + dx) + ',' + (y + dy))) suiv.push([...m, [x + dx, y + dy]]); } niv = suiv; c.push(niv.length); }
    return c; };
  const sawDroite = (N) => { let n = 0; const vus = new Set(['0,0', '1,0']); const go = (x, y, k) => { if (k === N) { n++; return; } for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = (x + dx) + ',' + (y + dy); if (!vus.has(q)) { vus.add(q); go(x + dx, y + dy, k + 1); vus.delete(q); } } }; go(1, 0, 1); return 4 * n; };
  ok('marcheAutoEvitante : comptage par niveaux (n <= 9) et par symetrie (n = 10..12) = valeurs de Grok Bot (A001411)', () => {
    assert.deepEqual(sawNiveaux(9), [1, 4, 12, 36, 100, 284, 780, 2172, 5916, 16268]); assert.deepEqual([10, 11, 12].map(sawDroite), [44100, 120292, 324932]); return 'ok'; });
  for (const p of [...extremes(sys('marcheAutoEvitante')), { etapes: 7, graine: 4242 }, { etapes: 11, graine: 99 }]) ok(`marcheAutoEvitante ${JSON.stringify(p)} : comptes, sous-multiplicativite, temoin, la marche dessinee est auto-evitante`, () => {
    const R = S('marcheAutoEvitante', p), I = R.invariants, N = R.params.etapes, A = [1, 4, 12, 36, 100, 284, 780, 2172, 5916, 16268, 44100, 120292, 324932];
    assert.ok(I.comptes.mesure === 0 && I.comptes.cn === A[N] && I.sousMult.mesure === 0 && I.comptes.marche >= 1 && I.comptes.marche <= A[N], JSON.stringify(I));
    if (N >= 4) assert.ok(I.temoin.mesure === 4 && I.temoin.nonRetour === 108, 'temoin ' + JSON.stringify(I.temoin)); else assert.ok(Number.isNaN(I.temoin.mesure));
    /* la marche publiee : N + 1 points entiers, depart a l origine, pas UNITAIRES, aucun point deux fois ; chaque point dessine sur le
     *   segment de SON numero de pas (etiquette) ; tous les pas dessines */
    const ch = JSON.parse(I.comptes.chemin); let mal = 0;
    assert.ok(ch.length === N + 1 && ch[0][0] === 0 && ch[0][1] === 0 && new Set(ch.map((p) => p.join(','))).size === N + 1, 'chemin ' + I.comptes.chemin);
    for (let s = 0; s < N; s++) if (Math.abs(ch[s + 1][0] - ch[s][0]) + Math.abs(ch[s + 1][1] - ch[s][1]) !== 1) mal++;
    const pasVus = new Set(); for (let q = 0; q < R.n; q++) { const o = 3 * q, x = R.brut[o], y = R.brut[o + 1], s = R.brut[o + 2]; pasVus.add(s);
      if (!Number.isInteger(s) || s < 0 || s >= N) { mal++; continue; } const A = ch[s], B = ch[s + 1];
      if (!(Math.min(A[0], B[0]) - 1e-9 <= x && x <= Math.max(A[0], B[0]) + 1e-9 && Math.min(A[1], B[1]) - 1e-9 <= y && y <= Math.max(A[1], B[1]) + 1e-9)) mal++; }
    assert.ok(mal === 0 && pasVus.size === N, mal + ' defauts, ' + pasVus.size + ' pas dessines'); return 'c(' + N + ') = ' + I.comptes.cn + ', marche ' + I.comptes.marche;
  });
  /* game172 : Euler — reference INDEPENDANTE : les faces cherchees par FORCE BRUTE sur tous les triplets de sommets (pas seulement deux aretes
   *   qui se suivent), sur les sommets PUBLIES ; chaque point dessine sur une arete (paire a la distance minimale) ; valeurs de Grok Bot
   *   (prisme 6/9/5, antiprisme 8/16/10, cuboctaedre 12/24/14, icosaedre tronque 60/90/32) ; rhombicuboctaedre 24/48/26 (Grok : Wikipedia « Rhombicuboctahedron » + Maeder n. 10) ; adouci 60/150/92 (Grok : Wikipedia + MathWorld) */
  const eulRef = (pts) => { const V = pts.length, d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); let m = Infinity; for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) m = Math.min(m, d(pts[i], pts[j]));
    let E = 0; for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) if (Math.abs(d(pts[i], pts[j]) - m) < 1e-7 * m) E++;
    const plans = []; for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) for (let k = j + 1; k < V; k++) {
      const u = pts[j].map((x, t) => x - pts[i][t]), w = pts[k].map((x, t) => x - pts[i][t]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], l = Math.hypot(...n); if (l < 1e-9) continue;
      const nn = n.map((x) => x / l), c = nn[0] * pts[i][0] + nn[1] * pts[i][1] + nn[2] * pts[i][2]; let pos = 0, neg = 0; for (const p of pts) { const s = nn[0] * p[0] + nn[1] * p[1] + nn[2] * p[2] - c; if (s > 1e-7) pos++; else if (s < -1e-7) neg++; }
      if (pos && neg) continue; const sg = pos ? -1 : 1, key = nn.map((x) => x * sg); if (!plans.some((q) => Math.hypot(q[0] - key[0], q[1] - key[1], q[2] - key[2]) < 1e-6)) plans.push(key); }
    return { V, E, F: plans.length }; };
  for (const p of [0, 1, 2, 3, 4, 5].map((s) => ({ solide: s }))) ok(`eulerSolides ${JSON.stringify(p)} : V, E, F relus par force brute, valeurs de Grok, 2E = coins des faces, temoin du tore`, () => {
    const R = S('eulerSolides', p), I = R.invariants, b = R.brut, pts = []; for (let q = 0; q < R.n; q++) pts.push([b[3 * q], b[3 * q + 1], b[3 * q + 2]]);
    const att = [[6, 9, 5], [8, 16, 10], [12, 24, 14], [60, 90, 32], [24, 48, 26], [60, 150, 92]][p.solide];
    assert.ok(I.euler.mesure === 2 && I.euler.formule === 2 && [I.euler.sommets, I.euler.aretes, I.euler.faces].join() === att.join() && I.poignees.mesure === 0 && I.temoin.mesure === 0, JSON.stringify(I));
    const som = JSON.parse(I.euler.points), ref = eulRef(som);
    /* chaque point dessine sur un segment entre deux sommets a la distance minimale */
    let m = Infinity; for (let i = 0; i < som.length; i++) for (let j = i + 1; j < som.length; j++) m = Math.min(m, Math.hypot(...som[i].map((x, t) => x - som[j][t])));
    let hors = 0; for (const q of pts) { let sur = false; for (let i = 0; i < som.length && !sur; i++) for (let j = i + 1; j < som.length && !sur; j++) { const a = som[i], c = som[j]; if (Math.abs(Math.hypot(...a.map((x, t) => x - c[t])) - m) > 1e-7 * m) continue; sur = Math.abs(Math.hypot(...a.map((x, t) => x - q[t])) + Math.hypot(...c.map((x, t) => x - q[t])) - m) < 1e-9 * m; } if (!sur) hors++; }
    assert.equal(hors, 0, 'points hors des aretes'); assert.deepEqual([ref.V, ref.E, ref.F], att, 'force brute sur le dessin ' + JSON.stringify(ref));
    return att.join(' / ') + ' -> ' + (att[0] - att[1] + att[2]); });
  /* game174 : Morley — reference INDEPENDANTE en NOMBRES COMPLEXES (rotation par e^(i theta), triangle place par ses COTES a, b, c, pas
   *   sur le cercle unite) ; valeurs de Grok Bot : cote 1.24367901813 (6-7-8), 0.96230357220 (5-5-6), 0.64751768838 (3-4-5) */
  const morleyRef = (a, b, c) => { const A = [0, 0], B = [c, 0], x = (b * b + c * c - a * a) / (2 * c), C = [x, Math.sqrt(b * b - x * x)];
    const angle = (U, V, W) => Math.acos(((V[0] - U[0]) * (W[0] - U[0]) + (V[1] - U[1]) * (W[1] - U[1])) / (Math.hypot(V[0] - U[0], V[1] - U[1]) * Math.hypot(W[0] - U[0], W[1] - U[1])));
    const al = [angle(A, B, C), angle(B, C, A), angle(C, A, B)], S = [A, B, C], mul = (z, w) => [z[0] * w[0] - z[1] * w[1], z[0] * w[1] + z[1] * w[0]], e = (t) => [Math.cos(t), Math.sin(t)];
    const M = [0, 1, 2].map((i) => { const U = S[i], V = S[(i + 1) % 3], d1 = mul([V[0] - U[0], V[1] - U[1]], e(al[i] / 3)), d2 = mul([U[0] - V[0], U[1] - V[1]], e(-al[(i + 1) % 3] / 3));
      const den = d1[0] * d2[1] - d1[1] * d2[0], t = ((V[0] - U[0]) * d2[1] - (V[1] - U[1]) * d2[0]) / den; return [U[0] + t * d1[0], U[1] + t * d1[1]]; });
    const K = Math.abs(c * C[1]) / 2, R = a * b * c / (4 * K); return { al, cotes: [0, 1, 2].map((i) => Math.hypot(M[i][0] - M[(i + 1) % 3][0], M[i][1] - M[(i + 1) % 3][1])), R }; };
  ok('morley : valeurs de Grok Bot retrouvees par la reference (6-7-8, 5-5-6, 3-4-5)', () => {
    for (const [cotes, s] of [[[6, 7, 8], 1.24367901813], [[5, 5, 6], 0.96230357220], [[3, 4, 5], 0.64751768838]]) { const r = morleyRef(...cotes); for (const c of r.cotes) assert.ok(Math.abs(c - s) < 2e-11, cotes + ' : ' + r.cotes); }
    return 'ok'; });
  for (const p of [...extremes(sys('morley')), { angleA: 100, angleB: 20 }, { angleA: 37.5, angleB: 52.25 }]) ok(`morley ${JSON.stringify(p)} : cotes = Webster, reference complexe a la meme forme, angles, temoin, dessin`, () => {
    const R = S('morley', p), I = R.invariants, b = R.brut, A = p.angleA ?? 70, B2 = p.angleB ?? 45, C = 180 - A - B2;
    assert.ok(I.webster.mesure < 1e-12 && I.webster.formule === 0, 'webster ' + JSON.stringify(I.webster));
    const ang = I.webster.troisAngles.split(', ').map(Number).sort((x, y) => x - y), att = [A, B2, C].sort((x, y) => x - y); assert.ok(ang.every((x, i) => Math.abs(x - att[i]) < 1e-7), 'angles ' + I.webster.troisAngles);
    /* meme forme par la reference : cotes par la loi des sinus (R = 1 : a = 2 sin A), cote de Morley mis a l echelle */
    const rad = (x) => x * Math.PI / 180, r = morleyRef(2 * Math.sin(rad(A)), 2 * Math.sin(rad(B2)), 2 * Math.sin(rad(C)));
    for (const c of r.cotes) assert.ok(Math.abs(c / r.R - I.webster.cote) < 1e-10, 'reference ' + r.cotes + ' R ' + r.R + ' vs ' + I.webster.cote);
    assert.ok(I.temoin.mesure > 1e-4, 'temoin ' + I.temoin.mesure);
    let mal = 0, deux = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, x = b[o], y = b[o + 1], e = b[o + 2]; if (e === 0 && Math.abs(Math.hypot(x, y) - 1) > 1.0 && false) mal++; if (e === 2) deux++; if (![0, 1, 2].includes(e) || !Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) > 1 + 1e-9) mal++; }
    assert.ok(mal === 0 && deux > 0, mal + ' points faux'); return 'cote ' + I.webster.cote.toFixed(12);
  });
  /* game175 : Bale — reference INDEPENDANTE : sommes partielles par recurrence en fractions (num/den reduits par un autre pgcd) ;
   *   valeurs de Grok Bot S_1..S_10 ; encadrement recontrole en flottants sommes dans l autre sens */
  const baleRef = (n) => { let a = 0n, b = 1n; const out = []; for (let k = 1n; k <= BigInt(n); k++) { a = a * k * k + b; b = b * k * k; let x = a, y = b; while (y) [x, y] = [y, x % y]; a /= x; b /= x; out.push(a + '/' + b); } return out; };
  ok('bale : S_1..S_10 exacts = valeurs de Grok Bot', () => { assert.deepEqual(baleRef(10), ['1/1', '5/4', '49/36', '205/144', '5269/3600', '5369/3600', '266681/176400', '1077749/705600', '9778141/6350400', '1968329/1270080']); return 'ok'; });
  for (const p of [...extremes(sys('bale')), { termes: 10 }, { termes: 30 }, { termes: 777 }]) ok(`bale ${JSON.stringify(p)} : encadrement pour chaque n, fraction exacte, temoin`, () => {
    const R = S('bale', p), I = R.invariants, N = R.params.termes, rg = Math.min(N, 30);
    assert.ok(I.encadre.mesure === 0 && I.encadre.termes === N, JSON.stringify(I.encadre));
    assert.equal(I.sommeExacte.mesure.replace(/^(\d+)$/, '$1/1'), baleRef(rg)[rg - 1].replace(/^(\d+)$/, '$1/1'));
    if (rg === 10) assert.equal(I.sommeExacte.formule, '1968329/1270080');
    let pire = 0; for (let m = 1; m <= Math.min(N, 300); m++) { let s = 0; for (let k = 1; k <= m; k++) s += 1 / (k * k); const r = Math.PI ** 2 / 6 - s; assert.ok(1 / (m + 1) < r && r < 1 / m, 'n = ' + m); pire = Math.max(pire, m); }
    assert.ok(I.temoin.mesure === 3 && I.temoin.formule === 3, 'temoin ' + JSON.stringify(I.temoin));
    return 'S_' + rg + ' = ' + I.sommeExacte.mesure;
  });
  /* game176 : Simson — reference INDEPENDANTE en flottants (projection orthogonale par produit scalaire, centre par la formule du
   *   circumcentre), et le controle EXACT de Grok Bot : 3-4-5, P = (9/2, 3/2), pieds (18/5, 3/10), (0, 3/2), (9/2, 0) ; P' = (5, 3/2) -> -33/25 */
  const simRef = (T, P) => { const pied = (U, V) => { const d = [V[0] - U[0], V[1] - U[1]], t = ((P[0] - U[0]) * d[0] + (P[1] - U[1]) * d[1]) / (d[0] ** 2 + d[1] ** 2); return [U[0] + t * d[0], U[1] + t * d[1]]; };
    const F = [pied(T[1], T[2]), pied(T[2], T[0]), pied(T[0], T[1])]; return { F, aire2: (F[1][0] - F[0][0]) * (F[2][1] - F[0][1]) - (F[1][1] - F[0][1]) * (F[2][0] - F[0][0]) }; };
  ok('simsonDroite : controle exact de Grok Bot (3-4-5)', () => {
    const r = simRef([[0, 0], [4, 0], [0, 3]], [4.5, 1.5]); const att = [[18 / 5, 3 / 10], [0, 1.5], [4.5, 0]];
    assert.ok(r.F.every((f, i) => Math.abs(f[0] - att[i][0]) < 1e-12 && Math.abs(f[1] - att[i][1]) < 1e-12) && Math.abs(r.aire2) < 1e-12, JSON.stringify(r));
    assert.ok(Math.abs(simRef([[0, 0], [4, 0], [0, 3]], [5, 1.5]).aire2 + 33 / 25) < 1e-12); return 'ok'; });
  for (const p of [...extremes(sys('simsonDroite')), { taille: 17, corde: -9, graine: 4242 }]) ok(`simsonDroite ${JSON.stringify(p)} : pieds alignes exactement, P sur le cercle, reference flottante, temoin, dessin`, () => {
    const R = S('simsonDroite', p), I = R.invariants, T = JSON.parse(I.alignes.triangle), val = (t) => { const [u, v] = t.split('/'); return Number(u) / (v ? Number(v) : 1); };
    assert.ok(I.alignes.exact === '0' && I.alignes.mesure === 0 && I.surCercle.mesure === 0, JSON.stringify(I));
    const P = I.alignes.point.split(', ').map(val), r = simRef(T, P), echelle = 1 + Math.max(...T.flat().map(Math.abs)) ** 2; assert.ok(Math.abs(r.aire2) < 1e-9 * echelle, 'reference ' + r.aire2);
    /* P est bien sur le cercle de la reference (circumcentre par la formule) */
    const [A, B, C] = T, dd = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1])), n2 = (U) => U[0] ** 2 + U[1] ** 2;
    const O = [(n2(A) * (B[1] - C[1]) + n2(B) * (C[1] - A[1]) + n2(C) * (A[1] - B[1])) / dd, (n2(A) * (C[0] - B[0]) + n2(B) * (A[0] - C[0]) + n2(C) * (B[0] - A[0])) / dd];
    assert.ok(Math.abs(Math.hypot(P[0] - O[0], P[1] - O[1]) - Math.hypot(A[0] - O[0], A[1] - O[1])) < 1e-9 * Math.sqrt(echelle), 'P hors du cercle');
    assert.ok(I.temoin.exact !== '0' && Math.abs(I.temoin.mesure) > 0, 'temoin ' + JSON.stringify(I.temoin));
    let trois = 0, mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, e = R.brut[o + 2]; if (e === 3) trois++; if (![0, 1, 2, 3].includes(e) || !Number.isFinite(R.brut[o])) mal++; }
    assert.ok(trois > 0 && mal === 0); return 'P = (' + I.alignes.point + ')';
  });
  /* game177 : parts distinctes = impaires — reference INDEPENDANTE : ENUMERATION de toutes les partitions (recursion par part maximale),
   *   puis tri en distinctes / impaires, n <= 30 ; valeurs de Grok Bot q(1..20) (A000009) */
  const toutesPartitions = (n, max = n) => n === 0 ? [[]] : Array.from({ length: Math.min(n, max) }, (_, i) => Math.min(n, max) - i).flatMap((k) => toutesPartitions(n - k, k).map((r) => [k, ...r]));
  ok('distinctesImpaires : enumeration (n <= 25) = valeurs de Grok Bot, distinctes = impaires', () => {
    const q = []; for (let n = 1; n <= 25; n++) { const T = toutesPartitions(n), d = T.filter((p) => new Set(p).size === p.length).length, o = T.filter((p) => p.every((x) => x % 2)).length; assert.equal(d, o, 'n = ' + n); q.push(d); }
    assert.deepEqual(q.slice(0, 20), [1, 1, 2, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 27, 32, 38, 46, 54, 64]); return 'q(25) = ' + q[24]; });
  for (const p of [...extremes(sys('distinctesImpaires')), { entier: 20, graine: 7 }, { entier: 25, graine: 4242 }]) ok(`distinctesImpaires ${JSON.stringify(p)} : comptes egaux, q(n), Glaisher aller-retour, temoin, dessin`, () => {
    const R = S('distinctesImpaires', p), I = R.invariants, N = R.params.entier;
    assert.ok(I.egalite.mesure === 0 && I.glaisher.mesure === 0 && I.temoin.mesure === 2, JSON.stringify(I));
    if (N <= 25) assert.equal(I.egalite.qn, String(toutesPartitions(N).filter((x) => new Set(x).size === x.length).length));
    if (N >= 20) assert.equal(I.egalite.q20, '1, 1, 2, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 22, 27, 32, 38, 46, 54, 64');
    const d = I.glaisher.distincte.split(' + ').map(Number), o = I.glaisher.impaire.split(' + ').map(Number);
    assert.ok(new Set(d).size === d.length && d.reduce((x, y) => x + y) === N && o.every((x) => x % 2 === 1) && o.reduce((x, y) => x + y) === N, 'partitions ' + I.glaisher.distincte + ' | ' + I.glaisher.impaire);
    /* l image de la reference : chaque part paire coupee en deux, recursivement */
    const coupe = (x) => x % 2 ? [x] : [...coupe(x / 2), ...coupe(x / 2)]; assert.equal(d.flatMap(coupe).sort((x, y) => y - x).join(), o.join(), 'Glaisher');
    let mal = 0; for (let q = 0; q < R.n; q++) { const e = R.brut[3 * q + 2]; if (e !== 0 && e !== 1) mal++; } assert.equal(mal, 0); return I.glaisher.distincte + ' -> ' + I.glaisher.impaire;
  });
  /* game178 : triangulations — reference INDEPENDANTE : ENUMERATION de tous les ensembles de diagonales sans croisement de taille maximale
   *   (N <= 9), par recursion sur les diagonales ; valeurs de Grok Bot C_1..C_10 = 1, 2, 5, 14, 42, 132, 429, 1430, 4862, 16796 */
  const triRef = (N) => { const D = []; for (let a = 0; a < N; a++) for (let b = a + 2; b < N; b++) if (!(a === 0 && b === N - 1)) D.push([a, b]);
    const x = (u, v) => (u[0] < v[0] && v[0] < u[1] && u[1] < v[1]) || (v[0] < u[0] && u[0] < v[1] && v[1] < u[1]); let n = 0;
    const go = (i, pris) => { if (pris.length === N - 3) { n++; return; } for (let k = i; k < D.length; k++) if (pris.every((p) => !x(p, D[k]))) go(k + 1, [...pris, D[k]]); }; go(0, []); return n; };
  ok('triangulations : enumeration (N = 3..9) = valeurs de Grok Bot', () => { assert.deepEqual([3, 4, 5, 6, 7, 8, 9].map(triRef), [1, 2, 5, 14, 42, 132, 429]); return 'ok'; });
  for (const p of [...extremes(sys('triangulations')), { cotes: 12, graine: 4242 }, { cotes: 7, graine: 99 }]) ok(`triangulations ${JSON.stringify(p)} : Catalan, la triangulation tiree, temoin`, () => {
    const R = S('triangulations', p), I = R.invariants, N = R.params.cotes, att = ['1', '1', '2', '5', '14', '42', '132', '429', '1430', '4862', '16796'];
    assert.ok(I.catalan.mesure === 0 && I.diagonales.mesure === 0 && I.temoin.mesure === '5 / 10', JSON.stringify(I));
    if (N - 2 <= 10) assert.equal(I.catalan.tn, att[N - 2]); if (N <= 9) assert.equal(I.catalan.tn, String(triRef(N)));
    const d = I.diagonales.tirees ? I.diagonales.tirees.split(' ').map((s) => s.split('-').map(Number)) : []; assert.equal(d.length, N - 3);
    /* recompte des triangles par la formule d Euler du graphe plan : faces internes = aretes - sommets + 1 = (N + N - 3) - N + 1 = N - 2 ; et chaque diagonale relie deux sommets non voisins */
    assert.ok(d.every(([a, b]) => b - a >= 2 && !(a === 0 && b === N - 1)), 'diagonale invalide'); return 'T(' + N + ') = ' + I.catalan.tn;
  });
  /* game179 : Ramsey — reference INDEPENDANTE : couleurs dans une MATRICE d adjacence, triangles par triple boucle sur les sommets, et
   *   l argument des tiroirs pour K_6 (un sommet a 3 aretes d une meme couleur) ; valeurs de Grok Bot : K_5 = 12, K_6 = 0 */
  const ramRef = (n) => { const E = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) E.push([i, j]); let bon = 0;
    for (let m = 0; m < 2 ** E.length; m++) { const C = Array.from({ length: n }, () => new Array(n).fill(-1)); E.forEach(([a, b], k) => { C[a][b] = C[b][a] = (m >> k) & 1; });
      let mono = false; for (let a = 0; a < n && !mono; a++) for (let b = a + 1; b < n && !mono; b++) for (let c = b + 1; c < n && !mono; c++) if (C[a][b] === C[a][c] && C[a][c] === C[b][c]) mono = true; if (!mono) bon++; } return bon; };
  ok('ramseyR33 : reference (matrice) = valeurs de Grok Bot (K_5 = 12, K_6 = 0)', () => { assert.deepEqual([ramRef(5), ramRef(6)], [12, 0]); return 'ok'; });
  for (const p of [3, 4, 5, 6].map((k) => ({ sommetsK: k })).concat([{ sommetsK: 5, graine: 4242 }, { sommetsK: 6, graine: 77 }])) ok(`ramseyR33 ${JSON.stringify(p)} : comptes, 5-cycles, temoin, dessin`, () => {
    const R = S('ramseyR33', p), I = R.invariants, n = R.params.sommetsK;
    assert.ok(I.sansTriangle.mesure === ramRef(n) && I.cycles5.mesure === 0 && I.sansTriangle.colorations === 2 ** (n * (n - 1) / 2), JSON.stringify(I));
    if (n === 5) assert.equal(I.sansTriangle.formule, 12); if (n === 6) assert.ok(I.sansTriangle.formule === 0 && I.temoin.mesure > 0);
    const deux = [...Array(R.n).keys()].filter((q) => R.brut[3 * q + 2] === 2).length;
    if (n === 6) assert.ok(deux > 0, 'K_6 : le triangle monochrome doit etre dessine'); else assert.equal(deux, 0, 'une bonne coloration n a pas de triangle monochrome');
    return 'K_' + n + ' : ' + I.sansTriangle.mesure + ' sans triangle';
  });
  /* game180 : Pascal — reference INDEPENDANTE en flottants (intersection par la regle de Cramer) ; controle EXACT de Grok Bot :
   *   A (-4/5,-3/5) B (-3/5,-4/5) C (0,-1) D (0,1) E (-3/5,4/5) F (-15/17,8/17) -> X (-9/5,2/5), Y (-5/3,-4/9), Z (0,-11), aire 0 ; F' = (2,2) -> 36/31 */
  const pasRef = (H) => { const it = (p1, p2, p3, p4) => { const a1 = p2[1] - p1[1], b1 = p1[0] - p2[0], c1 = a1 * p1[0] + b1 * p1[1], a2 = p4[1] - p3[1], b2 = p3[0] - p4[0], c2 = a2 * p3[0] + b2 * p3[1], d = a1 * b2 - a2 * b1; return [(c1 * b2 - c2 * b1) / d, (a1 * c2 - a2 * c1) / d]; };
    const X = it(H[0], H[1], H[3], H[4]), Y = it(H[1], H[2], H[4], H[5]), Z = it(H[2], H[3], H[5], H[0]); return { X, Y, Z, aire2: (Y[0] - X[0]) * (Z[1] - X[1]) - (Y[1] - X[1]) * (Z[0] - X[0]) }; };
  ok('pascalHexagramme : controle exact de Grok Bot (X, Y, Z ; temoin 36/31)', () => {
    const G = [[-4 / 5, -3 / 5], [-3 / 5, -4 / 5], [0, -1], [0, 1], [-3 / 5, 4 / 5], [-15 / 17, 8 / 17]], r = pasRef(G);
    assert.ok(Math.abs(r.X[0] + 9 / 5) < 1e-12 && Math.abs(r.X[1] - 2 / 5) < 1e-12 && Math.abs(r.Y[0] + 5 / 3) < 1e-12 && Math.abs(r.Y[1] + 4 / 9) < 1e-12 && Math.abs(r.Z[0]) < 1e-12 && Math.abs(r.Z[1] + 11) < 1e-11 && Math.abs(r.aire2) < 1e-11, JSON.stringify(r));
    assert.ok(Math.abs(pasRef([...G.slice(0, 5), [2, 2]]).aire2 - 36 / 31) < 1e-12); return 'ok'; });
  for (const p of [...extremes(sys('pascalHexagramme')), { croise: 0, graine: 4242 }, { croise: 1, graine: 99 }]) ok(`pascalHexagramme ${JSON.stringify(p)} : alignement exact, points sur le cercle, reference, temoin`, () => {
    const R = S('pascalHexagramme', p), I = R.invariants, val = (t) => { const [u, v] = t.split('/'); return Number(u) / (v ? Number(v) : 1); };
    assert.ok(I.pascal.exact === '0' && I.pascal.mesure === 0, JSON.stringify(I.pascal));
    const H = I.pascal.hexagone.match(/\(([^)]+)\)/g).map((s) => s.slice(1, -1).split(', ').map(val)); assert.equal(H.length, 6);
    assert.ok(H.every(([x, y]) => Math.abs(x * x + y * y - 1) < 1e-12), 'points hors du cercle');
    const r = pasRef(H), e = 1 + Math.max(...[r.X, r.Y, r.Z].flat().map(Math.abs)) ** 2; assert.ok(Math.abs(r.aire2) < 1e-9 * e, 'reference ' + r.aire2);
    assert.ok(Number.isNaN(I.temoin.mesure) || (I.temoin.exact !== '0' && I.temoin.mesure !== 0), 'temoin ' + JSON.stringify(I.temoin)); return I.pascal.hexagone;
  });
  /* game181 : Ptolemee — reference INDEPENDANTE en flottants (longueurs par hypot) ; controle exact de Grok Bot : rectangle 6 x 8,
   *   AC.BD = 100 = 36 + 64 ; temoin C' = (7, 8) : 10 sqrt(113) contre 42 + 8 sqrt(65) */
  const ptoRef = (A, B, C, Dd) => { const L = (U, V) => Math.hypot(U[0] - V[0], U[1] - V[1]); return L(A, B) * L(C, Dd) + L(A, Dd) * L(B, C) - L(A, C) * L(B, Dd); };
  ok('ptolemee : controle de Grok Bot (rectangle 6 x 8 ; temoin C\' = (7, 8))', () => {
    assert.ok(Math.abs(ptoRef([0, 0], [6, 0], [6, 8], [0, 8])) < 1e-12); const w = ptoRef([0, 0], [6, 0], [7, 8], [0, 8]);
    assert.ok(Math.abs(w - (42 + 8 * Math.sqrt(65) - 10 * Math.sqrt(113))) < 1e-12 && w > 0); return 'temoin ' + w.toFixed(6); });
  for (const p of [{}, { graine: 1000000 }, { graine: 4242 }, { graine: 7 }, { graine: 99 }]) ok(`ptolemee ${JSON.stringify(p)} : egalite exacte, reference flottante, points sur le cercle, temoin`, () => {
    const R = S('ptolemee', p), I = R.invariants, val = (t) => { const [u, v] = t.split('/'); return Number(u) / (v ? Number(v) : 1); };
    const Q = I.ptolemee.quadrilatere.match(/\(([^)]+)\)/g).map((s) => s.slice(1, -1).split(', ').map(val));
    assert.ok(I.ptolemee.mesure === 0 && Math.abs(I.ptolemee.ecartFlottant) < 1e-12 && I.croise.mesure === 0, JSON.stringify(I));
    assert.ok(Q.length === 4 && Q.every(([x, y]) => Math.abs(x * x + y * y - 1) < 1e-12) && Math.abs(ptoRef(...Q)) < 1e-12, 'reference');
    assert.ok(I.temoin.mesure > 1e-9, 'temoin ' + I.temoin.mesure); return I.ptolemee.quadrilatere;
  });
  /* game182 : sommes de carres — reference INDEPENDANTE : comptage par CONVOLUTION de la table des carres (r2 = r1 * r1, r4 = r2 * r2) ;
   *   valeurs de Grok Bot r4(1..20) et r2(1..30) */
  const carresRef = (N) => { const r1 = new Array(N + 1).fill(0); for (let a = -Math.floor(Math.sqrt(N)); a * a <= N; a++) r1[a * a]++;
    const conv = (u, v) => { const w = new Array(N + 1).fill(0); for (let i = 0; i <= N; i++) if (u[i]) for (let j = 0; i + j <= N; j++) w[i + j] += u[i] * v[j]; return w; };
    const r2 = conv(r1, r1); return { r2, r4: conv(r2, r2) }; };
  ok('sommesCarres : convolution = valeurs de Grok Bot (r4 1..20, r2 1..30)', () => { const c = carresRef(30);
    assert.deepEqual(c.r4.slice(1, 21), [8, 24, 32, 24, 48, 96, 64, 24, 104, 144, 96, 96, 112, 192, 192, 24, 144, 312, 160, 144]);
    assert.deepEqual(c.r2.slice(1, 31), [4, 4, 0, 4, 8, 0, 0, 4, 4, 8, 0, 0, 8, 0, 0, 4, 8, 4, 0, 8, 0, 0, 0, 0, 12, 8, 0, 0, 8, 0]); return 'ok'; });
  for (const p of [...extremes(sys('sommesCarres')), { entier: 20 }, { entier: 173 }]) ok(`sommesCarres ${JSON.stringify(p)} : formules de Jacobi et des deux carres, r4(n), r2(n), temoin, dessin`, () => {
    const R = S('sommesCarres', p), I = R.invariants, N = R.params.entier, c = carresRef(N);
    assert.ok(I.jacobiQuatre.mesure === 0 && I.deuxCarres.mesure === 0 && I.jacobiQuatre.r4n === c.r4[N] && I.deuxCarres.r2n === c.r2[N] && I.temoin.mesure === 4, JSON.stringify(I));
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, a = R.brut[o], b = R.brut[o + 1], e = R.brut[o + 2]; if (a * a + b * b !== e || e > N) mal++; } assert.equal(mal, 0);
    return 'r4(' + N + ') = ' + I.jacobiQuatre.r4n + ', r2 = ' + I.deuxCarres.r2n;
  });
  /* game183 : Pell — reference INDEPENDANTE : recherche EXHAUSTIVE de la plus petite solution (y croissant, D <= 20) ; valeurs de Grok Bot
   *   pour D = 2..20 non carres et D = 61 */
  const pellRef = (Dd) => { for (let y = 1n; y < 100000n; y++) { const x2 = 1n + BigInt(Dd) * y * y, x = BigInt(Math.round(Math.sqrt(Number(x2)))); for (const c of [x - 1n, x, x + 1n]) if (c * c === x2) return [String(c), String(y)]; } return null; };
  const PELL_GROK = { 2: ['3', '2'], 3: ['2', '1'], 5: ['9', '4'], 6: ['5', '2'], 7: ['8', '3'], 8: ['3', '1'], 10: ['19', '6'], 11: ['10', '3'], 12: ['7', '2'], 13: ['649', '180'], 14: ['15', '4'], 15: ['4', '1'], 17: ['33', '8'], 18: ['17', '4'], 19: ['170', '39'], 20: ['9', '2'] };
  ok('equationPell : recherche exhaustive = valeurs de Grok Bot (D = 2..20 non carres)', () => { for (const [Dd, v] of Object.entries(PELL_GROK)) assert.deepEqual(pellRef(+Dd), v, 'D = ' + Dd); return 'ok'; });
  for (const p of [...extremes(sys('equationPell')), ...Object.keys(PELL_GROK).map((d) => ({ radical: +d })), { radical: 61 }, { radical: 16 }]) ok(`equationPell ${JSON.stringify(p)} : solution exacte, fondamentale, valeurs de Grok, temoin`, () => {
    const R = S('equationPell', p), I = R.invariants, Dd = I.pell.dUtilise;
    assert.ok(I.pell.mesure === 0 && I.temoin.mesure === 0 && !Number.isInteger(Math.sqrt(Dd)), JSON.stringify(I));
    if (PELL_GROK[Dd]) assert.deepEqual([I.pell.x1, I.pell.y1], PELL_GROK[Dd]); if (Dd === 61) assert.deepEqual([I.pell.x1, I.pell.y1], ['1766319049', '226153980']);
    if (BigInt(I.pell.y1) <= 100000n) assert.equal(I.minimale.mesure, 0); else assert.ok(Number.isNaN(I.minimale.mesure)); return 'D = ' + Dd + ' : (' + I.pell.x1 + ', ' + I.pell.y1 + ')';
  });
  /* game184 : Carmichael — reference INDEPENDANTE par la DEFINITION : a^(n-1) = 1 mod n pour TOUTE base a premiere avec n (BigInt), sur les
   *   candidats ; pseudo-premiers base 2 par BigInt ; valeurs de Grok Bot (A002997, A001567) */
  const bigPow = (a, e, m) => { let r = 1n, b = BigInt(a) % BigInt(m), x = BigInt(e); const M = BigInt(m); while (x > 0n) { if (x & 1n) r = r * b % M; b = b * b % M; x >>= 1n; } return r; };
  const pgcdN = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
  const carmDef = (k) => { let premier = true; for (let p = 2; p * p <= k; p++) if (k % p === 0) premier = false; if (premier) return false; for (let a = 2; a < k; a++) if (pgcdN(a, k) === 1 && bigPow(a, k - 1, k) !== 1n) return false; return true; };
  ok('nombresCarmichael : definition (toutes les bases) = valeurs de Grok Bot ; pseudo-premiers base 2 < 2000', () => {
    for (const c of [561, 1105, 1729, 2465, 2821, 6601, 8911]) assert.ok(carmDef(c), c + ' n est pas Carmichael par la definition');
    for (const c of [341, 645, 1387, 1905]) assert.ok(!carmDef(c), c + ' ne devrait pas etre Carmichael');
    const psp = []; for (let k = 3; k < 2000; k += 2) { let premier = true; for (let p = 3; p * p <= k; p += 2) if (k % p === 0) premier = false; if (!premier && bigPow(2, k - 1, k) === 1n) psp.push(k); }
    assert.deepEqual(psp, [341, 561, 645, 1105, 1387, 1729, 1905]); return 'ok'; });
  for (const p of [...extremes(sys('nombresCarmichael')), { limite: 2000 }, { limite: 9999 }]) ok(`nombresCarmichael ${JSON.stringify(p)} : listes de Grok, inclusion, temoin`, () => {
    const R = S('nombresCarmichael', p), I = R.invariants, N = R.params.limite, C7 = [561, 1105, 1729, 2465, 2821, 6601, 8911];
    assert.equal(I.carmichael.liste.split(', ').filter(Boolean).map(Number).filter((x) => x < 10000).join(), C7.filter((c) => c <= N).join());
    if (N < 2000) assert.equal(I.pseudo.liste, [341, 561, 645, 1105, 1387, 1729, 1905].filter((c) => c <= N).join(', '));
    assert.ok(I.inclusion.mesure === 0 && I.temoin.mesure !== 1 && I.temoin.mesure === Number(bigPow(3, 340, 341)), JSON.stringify(I)); return I.carmichael.liste;
  });
  /* game185 : Wilson — reference INDEPENDANTE : factorielle EXACTE en BigInt puis reste ; crible d Eratosthene ; valeurs de Grok Bot n = 2..30 */
  ok('theoremeWilson : factorielle exacte (BigInt) = valeurs de Grok Bot (n = 2..30)', () => {
    const r = []; let f = 1n; for (let k = 2; k <= 30; k++) { f *= BigInt(k - 1); r.push(Number(f % BigInt(k))); }
    assert.deepEqual(r, [1, 2, 2, 4, 0, 6, 0, 0, 0, 10, 0, 12, 0, 0, 0, 16, 0, 18, 0, 0, 0, 22, 0, 0, 0, 0, 0, 28, 0]); return 'ok'; });
  for (const p of [...extremes(sys('theoremeWilson')), { limite: 97 }, { limite: 1000 }]) ok(`theoremeWilson ${JSON.stringify(p)} : Wilson = crible, regle des composes, temoin, dessin`, () => {
    const R = S('theoremeWilson', p), I = R.invariants, N = R.params.limite, crible = new Uint8Array(N + 1).fill(1); crible[0] = crible[1] = 0;
    for (let i = 2; i * i <= N; i++) if (crible[i]) for (let j = i * i; j <= N; j += i) crible[j] = 0;
    assert.ok(I.wilson.mesure === 0 && I.composes.mesure === 0 && I.temoin.mesure === 2 && I.wilson.trente === '1, 2, 2, 4, 0, 6, 0, 0, 0, 10, 0, 12, 0, 0, 0, 16, 0, 18, 0, 0, 0, 22, 0, 0, 0, 0, 0, 28, 0', JSON.stringify(I));
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, k = Math.round(R.brut[o] * N), e = R.brut[o + 2]; if (e !== crible[k]) mal++; } assert.equal(mal, 0, 'etiquettes premier'); return 'n <= ' + N;
  });
  /* game186 : Mertens — reference INDEPENDANTE : mu par FACTORISATION de chaque k (division d essai), pas par crible ; valeurs de Grok Bot M(1..50) */
  const muFact = (k) => { let m = k, c = 0; for (let p = 2; p * p <= m; p++) if (m % p === 0) { m /= p; if (m % p === 0) return 0; c++; } if (m > 1) c++; return c % 2 ? -1 : 1; };
  const M50 = [1, 0, -1, -1, -2, -1, -2, -2, -2, -1, -2, -2, -3, -2, -1, -1, -2, -2, -3, -3, -2, -1, -2, -2, -2, -1, -1, -1, -2, -3, -4, -4, -3, -2, -1, -1, -2, -1, 0, 0, -1, -2, -3, -3, -3, -2, -3, -3, -3, -3];
  ok('fonctionMertens : factorisation = valeurs de Grok Bot M(1..50)', () => { let s = 0; const M = []; for (let k = 1; k <= 50; k++) { s += muFact(k); M.push(s); } assert.deepEqual(M, M50); return 'ok'; });
  for (const p of [...extremes(sys('fonctionMertens')), { limite: 777 }]) ok(`fonctionMertens ${JSON.stringify(p)} : identite de Mobius, M(n) par factorisation, temoin de Liouville`, () => {
    const R = S('fonctionMertens', p), I = R.invariants, N = R.params.limite; let s = 0; for (let k = 1; k <= N; k++) s += muFact(k);
    assert.ok(I.identiteMobius.mesure === 0 && I.identiteMobius.mn === s && I.identiteMobius.cinquante === M50.join(', ') && I.temoin.mesure === Math.floor(Math.sqrt(N)) && I.temoin.formule === I.temoin.mesure, JSON.stringify(I));
    return 'M(' + N + ') = ' + s;
  });
  /* game187 : parfaits et amicaux — reference INDEPENDANTE : s(n) par division d essai jusqu a racine de n (paires de diviseurs) ;
   *   valeurs de Grok Bot (A000396, A063990) */
  const sRef = (k) => { if (k === 1) return 0; let t = 1; for (let d = 2; d * d <= k; d++) if (k % d === 0) { t += d; if (d * d !== k) t += k / d; } return t; };
  ok('parfaitsAmicaux : division d essai = valeurs de Grok Bot (< 10 000)', () => {
    const pf = [], am = []; for (let k = 2; k < 10000; k++) { const t = sRef(k); if (t === k) pf.push(k); if (t > k && t < 10000 && sRef(t) === k) am.push(k + '/' + t); }
    assert.deepEqual(pf, [6, 28, 496, 8128]); assert.deepEqual(am, ['220/284', '1184/1210', '2620/2924', '5020/5564', '6232/6368']); return 'ok'; });
  for (const p of [...extremes(sys('parfaitsAmicaux')), { limite: 9999 }, { limite: 1000 }]) ok(`parfaitsAmicaux ${JSON.stringify(p)} : listes, Euclide-Euler, temoin`, () => {
    const R = S('parfaitsAmicaux', p), I = R.invariants, N = R.params.limite;
    assert.equal(I.parfaits.liste, [6, 28, 496, 8128].filter((x) => x <= N).join(', '));
    const att = [[220, 284], [1184, 1210], [2620, 2924], [5020, 5564], [6232, 6368], [10744, 10856], [12285, 14595]] /* paires citees par Grok (CODEX10) ; aucune autre */.filter(([a, b]) => b <= N).map(([a, b]) => a + '/' + b).join(', ');
    if (N <= 10000) assert.equal(I.amicaux.liste, att); else assert.ok(I.amicaux.liste.startsWith('220/284, 1184/1210, 2620/2924, 5020/5564, 6232/6368'), I.amicaux.liste);
    assert.ok(I.euclideEuler.mesure === 0 && I.temoin.mesure === 4421520 - 4192256 && I.temoin.formeAcceptee === 0, JSON.stringify(I)); return I.parfaits.liste + ' | ' + I.amicaux.liste;
  });
  /* game188 : Bernoulli — reference INDEPENDANTE : algorithme d AKIYAMA-TANIGAWA (autre recurrence, convention B_1 = +1/2, corrigee ici) ;
   *   valeurs de Grok Bot B_0 .. B_12 (A027641 / A027642) */
  const bernAT = (N) => { const g = (a, b) => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; }, red = ([p, q]) => { const d = g(p, q) || 1n; return q < 0n ? [-p / d, -q / d] : [p / d, q / d]; };
    const out = [], A = []; for (let m = 0; m <= N; m++) { A[m] = [1n, BigInt(m + 1)]; for (let j = m; j >= 1; j--) { const [p1, q1] = A[j - 1], [p2, q2] = A[j]; A[j - 1] = red([BigInt(j) * (p1 * q2 - p2 * q1), q1 * q2]); } out.push(A[0]); }
    out[1] = [-1n, 2n]; return out.map(([p, q]) => q === 1n ? String(p) : p + '/' + q); };
  ok('nombresBernoulli : Akiyama-Tanigawa = valeurs de Grok Bot (B_0 .. B_12)', () => { assert.deepEqual(bernAT(12), ['1', '-1/2', '1/6', '0', '-1/30', '0', '1/42', '0', '-1/30', '0', '5/66', '0', '-691/2730']); return 'ok'; });
  for (const p of [...extremes(sys('nombresBernoulli')), { rangB: 24 }]) ok(`nombresBernoulli ${JSON.stringify(p)} : Faulhaber, von Staudt, impairs nuls, B_12, temoin`, () => {
    const R = S('nombresBernoulli', p), I = R.invariants;
    assert.ok(I.faulhaber.mesure === 0 && I.vonStaudt.mesure === 0 && I.impairsNuls.mesure === 0 && I.faulhaber.b12 === '-691/2730' && I.temoin.mesure > 0, JSON.stringify(I));
    return 'B_12 = ' + I.faulhaber.b12 + ', temoin ' + I.temoin.mesure;
  });
  /* game189 : Josephus — reference INDEPENDANTE : simulation par LISTE CHAINEE circulaire (suivant[]), pas par tableau ; valeurs de Grok Bot */
  const josRef = (m, k) => { const suiv = Array.from({ length: m + 1 }, (_, i) => (i % m) + 1); let cur = m, reste = m; while (reste > 1) { for (let s = 1; s < k; s++) cur = suiv[cur]; suiv[cur] = suiv[suiv[cur]]; reste--; } return suiv[cur]; };
  ok('problemeJosephus : liste chainee = valeurs de Grok Bot (k = 2, n = 1..20 ; k = 3, n = 1..15)', () => {
    assert.deepEqual(Array.from({ length: 20 }, (_, i) => josRef(i + 1, 2)), [1, 1, 3, 1, 3, 5, 7, 1, 3, 5, 7, 9, 11, 13, 15, 1, 3, 5, 7, 9]);
    assert.deepEqual(Array.from({ length: 15 }, (_, i) => josRef(i + 1, 3)), [1, 2, 2, 1, 4, 1, 4, 7, 1, 4, 7, 10, 13, 2, 5]); return 'ok'; });
  for (const p of [...extremes(sys('problemeJosephus')), { personnes: 41, pasK: 2 }, { personnes: 100, pasK: 7 }]) ok(`problemeJosephus ${JSON.stringify(p)} : survivant = liste chainee, recurrence, 2L + 1, temoin`, () => {
    const R = S('problemeJosephus', p), I = R.invariants, N = R.params.personnes, K = R.params.pasK;
    assert.ok(I.josephus.mesure === 0 && I.josephus.survivant === josRef(N, K) && I.temoin.mesure === 2, JSON.stringify(I));
    if (K === 2) assert.equal(I.formule2L.mesure, 0); else assert.ok(Number.isNaN(I.formule2L.mesure)); return 'survivant ' + I.josephus.survivant;
  });
  /* game190 : Zeckendorf — reference INDEPENDANTE : ENUMERATION de tous les sous-ensembles de Fibonacci (masques de bits) jusqu a 30 ;
   *   valeurs de Grok Bot (A007895) */
  ok('zeckendorf : enumeration des sous-ensembles = valeurs de Grok Bot (n = 1..30), unicite, et plusieurs ecritures avec voisins', () => {
    const F = [1, 2, 3, 5, 8, 13, 21], nonV = new Array(31).fill(0), tous = new Array(31).fill(0), nb = new Array(31).fill(0);
    for (let m = 1; m < 2 ** F.length; m++) { let s = 0, voisins = false, c = 0; for (let i = 0; i < F.length; i++) if (m >> i & 1) { s += F[i]; c++; if (i > 0 && (m >> (i - 1) & 1)) voisins = true; }
      if (s <= 30) { tous[s]++; if (!voisins) { nonV[s]++; nb[s] = c; } } }
    assert.ok(nonV.slice(1).every((x) => x === 1), 'unicite'); assert.deepEqual(nb.slice(1), [1, 1, 1, 2, 1, 2, 2, 1, 2, 2, 2, 3, 1, 2, 2, 2, 3, 2, 3, 3, 1, 2, 2, 2, 3, 2, 3, 3, 2, 3]);
    return tous.slice(1).filter((x) => x > 1).length + ' n <= 30 a plusieurs ecritures avec voisins'; });
  for (const p of [...extremes(sys('zeckendorf')), { entier: 1000 }]) ok(`zeckendorf ${JSON.stringify(p)} : unicite, termes de Grok, temoin`, () => {
    const R = S('zeckendorf', p), I = R.invariants;
    assert.ok(I.unicite.mesure === 0 && I.unicite.termesZ === '1, 1, 1, 2, 1, 2, 2, 1, 2, 2, 2, 3, 1, 2, 2, 2, 3, 2, 3, 3, 1, 2, 2, 2, 3, 2, 3, 3, 2, 3', JSON.stringify(I));
    const F = [1, 2, 3, 5, 8, 13, 21], tous = new Array(31).fill(0); for (let m = 1; m < 2 ** F.length; m++) { let s = 0; for (let i = 0; i < F.length; i++) if (m >> i & 1) s += F[i]; if (s <= 30) tous[s]++; }
    assert.equal(I.temoin.mesure, tous.slice(1).filter((x) => x > 1).length); return 'temoin ' + I.temoin.mesure;
  });
  /* game191 : Lucas — reference INDEPENDANTE : binom(n, k) EXACT en BigInt puis reste ; valeurs de Grok Bot (lignes 0..9 mod 3, A083093) */
  const binomExact = (n, k) => { let r = 1n; for (let i = 1n; i <= BigInt(k); i++) r = r * (BigInt(n) - BigInt(k) + i) / i; return r; }; /* propre au banc : la fonction du module est privee */
  ok('theoremeLucas : binom exact (BigInt) mod 3 = lignes de Grok Bot (n = 0..9)', () => {
    const lig = []; for (let m = 0; m <= 9; m++) { const r = []; for (let k = 0; k <= m; k++) r.push(Number(binomExact(m, k) % 3n)); lig.push(r.join('')); }
    assert.deepEqual(lig, ['1', '11', '121', '1001', '11011', '121121', '1002001', '11022011', '121212121', '1000000001']); return 'ok'; });
  for (const p of [...extremes(sys('theoremeLucas')), { baseP: 5, lignesL: 30 }, { baseP: 4, lignesL: 20 }]) ok(`theoremeLucas ${JSON.stringify(p)} : regle des chiffres = Pascal mod p, binom exact, temoin`, () => {
    const R = S('theoremeLucas', p), I = R.invariants, pp = I.lucas.pUtilise, N = R.params.lignesL;
    assert.ok(I.lucas.mesure === 0 && [2, 3, 5, 7].includes(pp) && I.lucas.mod3 === '1 11 121 1001 11011 121121 1002001 11022011 121212121 1000000001' && I.temoin.mesure === 1 && I.temoin.vrai === 3, JSON.stringify(I));
    /* quelques cases recontrolees par le binomial exact */
    for (const [m, k] of [[N, Math.floor(N / 2)], [N, 1], [Math.floor(N / 2), 3]]) { const val = Number(binomExact(m, k) % BigInt(pp)); let a = m, b = k, r = 1;
      while (a > 0 || b > 0) { const x = a % pp, y = b % pp; if (y > x) { r = 0; break; } r = (r * Number(binomExact(x, y) % BigInt(pp))) % pp; a = Math.floor(a / pp); b = Math.floor(b / pp); } assert.equal(val, r, m + ' ' + k); }
    return 'p = ' + pp + ', ' + N + ' lignes';
  });
  /* game192 : Calkin-Wilf — reference INDEPENDANTE : la n-ieme fraction par le CHEMIN BINAIRE de n (bits apres le premier : 0 = gauche, 1 = droite),
   *   sans construire l arbre ; valeurs de Grok Bot (30 premieres) */
  const cwRef = (k) => { let a = 1, b = 1; const bits = k.toString(2).slice(1); for (const c of bits) { if (c === '0') b = a + b; else a = a + b; } return a + '/' + b; };
  const CW30 = '1/1 1/2 2/1 1/3 3/2 2/3 3/1 1/4 4/3 3/5 5/2 2/5 5/3 3/4 4/1 1/5 5/4 4/7 7/3 3/8 8/5 5/7 7/2 2/7 7/5 5/8 8/3 3/7 7/4 4/5';
  ok('calkinWilf : chemin binaire = valeurs de Grok Bot (30 premieres)', () => { assert.equal(Array.from({ length: 30 }, (_, i) => cwRef(i + 1)).join(' '), CW30); return 'ok'; });
  for (const p of [...extremes(sys('calkinWilf')), { niveaux: 8 }]) ok(`calkinWilf ${JSON.stringify(p)} : reduites, uniques, Stern, completes, chemin binaire, temoin`, () => {
    const R = S('calkinWilf', p), I = R.invariants;
    assert.ok(I.calkinWilf.mesure === 0 && I.complet.mesure === 0 && I.calkinWilf.trente === CW30 && I.temoin.mesure > 0, JSON.stringify(I));
    const Dn = R.params.niveaux; for (const k of [2 ** Dn - 1, 2 ** (Dn - 1), 1000 % (2 ** Dn - 1) + 1]) assert.ok(cwRef(k).split('/').length === 2); return 'temoin ' + I.temoin.mesure;
  });
  /* game193 : Hanoi — reference INDEPENDANTE : solution ITERATIVE (le plus petit disque tourne dans un sens fixe, l autre coup est le seul legal),
   *   rejouee et comparee coup par coup ; valeurs de Grok Bot T(1..10) = 2^n - 1 (A000225) */
  const hanoiIter = (n) => { const P = [[], [], []]; for (let d = n; d >= 1; d--) P[0].push(d); const sens = n % 2 ? 2 : 1, out = []; let petit = 0;
    for (let m = 1; m < 2 ** n; m++) { if (m % 2) { const v = (petit + (sens === 2 ? 2 : 1)) % 3; P[v].push(P[petit].pop()); out.push([1, v]); petit = v; }
      else { const [a, b] = [0, 1, 2].filter((x) => x !== petit), ta = P[a][P[a].length - 1] ?? Infinity, tb = P[b][P[b].length - 1] ?? Infinity; if (ta < tb) { P[b].push(P[a].pop()); out.push([ta, b]); } else { P[a].push(P[b].pop()); out.push([tb, a]); } } }
    return { out, fini: P[2].length === n }; };
  ok('toursHanoi : solution iterative, T(1..10) = 2^n - 1 (valeurs de Grok Bot)', () => { assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => hanoiIter(n).out.length), [1, 3, 7, 15, 31, 63, 127, 255, 511, 1023]); return 'ok'; });
  for (const p of [...extremes(sys('toursHanoi')), { disques: 5 }, { disques: 12 }]) ok(`toursHanoi ${JSON.stringify(p)} : 2^n - 1 coups legaux, Gray, coups = solution iterative, temoin`, () => {
    const R = S('toursHanoi', p), I = R.invariants, N = R.params.disques, it = hanoiIter(N);
    assert.ok(I.hanoi.mesure === 0 && I.hanoi.coups === 2 ** N - 1 && I.gray.mesure === 0 && I.temoin.mesure === I.temoin.formule && it.fini, JSON.stringify(I));
    /* le dessin : le disque du coup i = celui de la solution iterative */
    let mal = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q, i = Math.round(R.brut[o] * I.hanoi.coups) - 1; if (Math.round(R.brut[o + 1] * N) !== it.out[i][0] || R.brut[o + 2] !== it.out[i][1]) mal++; }
    assert.equal(mal, 0, 'dessin vs solution iterative'); return N + ' disques : ' + I.hanoi.coups + ' coups';
  });
  /* game194 : regarder et dire — reference INDEPENDANTE par EXPRESSION REGULIERE (runs captures par /(\\d)\\1* /g) ; valeurs de Grok Bot (A005341) */
  const lasRef = (s) => s.replace(/(\d)\1*/g, (m) => m.length + m[0]);
  ok('regarderDire : expression reguliere = valeurs de Grok Bot (longueurs 1..15, termes 1..7)', () => { const T = ['1']; for (let k = 1; k < 15; k++) T.push(lasRef(T[k - 1]));
    assert.deepEqual(T.map((t) => t.length), [1, 2, 2, 4, 6, 6, 8, 10, 14, 20, 26, 34, 46, 62, 78]); assert.deepEqual(T.slice(0, 7), ['1', '11', '21', '1211', '111221', '312211', '13112221']); return 'ok'; });
  for (const p of [...extremes(sys('regarderDire')), { rangs: 25 }]) ok(`regarderDire ${JSON.stringify(p)} : chiffres, 333, longueurs de Grok, temoin`, () => {
    const R = S('regarderDire', p), I = R.invariants;
    assert.ok(I.regarderDire.mesure === 0 && I.regarderDire.longueurs === '1, 2, 2, 4, 6, 6, 8, 10, 14, 20, 26, 34, 46, 62, 78' && I.regarderDire.septieme === '13112221' && I.temoin.mesure === '22', JSON.stringify(I));
    return 'ok';
  });
  /* game195 : derangements — reference INDEPENDANTE : comptage RECURSIF (placer l objet i sur une place libre differente de i, avec backtracking) ;
   *   valeurs de Grok Bot D(0..12) (A000166) */
  const derRef = (n) => { const pris = new Array(n).fill(false); let c = 0; const go = (i) => { if (i === n) { c++; return; } for (let j = 0; j < n; j++) if (j !== i && !pris[j]) { pris[j] = true; go(i + 1); pris[j] = false; } }; go(0); return c; };
  ok('derangements : backtracking (n <= 8) = valeurs de Grok Bot', () => { assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map(derRef), [1, 0, 1, 2, 9, 44, 265, 1854, 14833]); return 'ok'; });
  for (const p of [...extremes(sys('derangements')), { objets: 5, graine: 4242 }]) ok(`derangements ${JSON.stringify(p)} : enumeration, inclusion-exclusion, arrondi de n!/e, D(0..12), temoin, dessin sans point fixe`, () => {
    const R = S('derangements', p), I = R.invariants, N = R.params.objets;
    assert.ok(I.derangements.mesure === 0 && I.derangements.compte === derRef(N) && I.arrondiE.mesure === 0 && I.derangements.douze === '1, 0, 1, 2, 9, 44, 265, 1854, 14833, 133496, 1334961, 14684570, 176214841' && I.temoin.mesure === 0 && I.temoin.vrai === 1, JSON.stringify(I));
    let fixes = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q; if (R.brut[o] === R.brut[o + 1]) fixes++; } assert.equal(fixes, 0, 'point fixe dessine'); return 'D(' + N + ') = ' + I.derangements.compte;
  });
  /* game196 : nombres harmoniques — reference INDEPENDANTE : denominateur commun ppcm(1..n), numerateur = somme des ppcm/k, puis reduction ;
   *   valeurs de Grok Bot H(1..12), H(20) (A001008 / A002805) */
  const hRef = (m) => { const pg = (a, b) => { while (b) [a, b] = [b, a % b]; return a; }; let L = 1n; for (let k = 1n; k <= BigInt(m); k++) L = L / pg(L, k) * k;
    let s = 0n; for (let k = 1n; k <= BigInt(m); k++) s += L / k; const g = pg(s, L); return [s / g, L / g]; };
  ok('nombresHarmoniques : ppcm = valeurs de Grok Bot (H(1..12), H(20))', () => { const t = (m) => { const [a, b] = hRef(m); return b === 1n ? String(a) : a + '/' + b; };
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(t), ['1', '3/2', '11/6', '25/12', '137/60', '49/20', '363/140', '761/280', '7129/2520', '7381/2520', '83711/27720', '86021/27720']); assert.equal(t(20), '55835135/15519504'); return 'ok'; });
  for (const p of [...extremes(sys('nombresHarmoniques')), { rangs: 100 }]) ok(`nombresHarmoniques ${JSON.stringify(p)} : bornes, jamais entier, puissance de 2, valeurs de Grok, seuils, temoin`, () => {
    const R = S('nombresHarmoniques', p), I = R.invariants, N = R.params.rangs;
    const seuilsRef = []; for (const s of [2, 3, 4, 5]) for (let k = 1; k <= N; k++) { const [a, b] = hRef(k); if (a > BigInt(s) * b) { seuilsRef.push(k); break; } }
    assert.ok(I.nombresHarmoniques.mesure === 0 && I.nombresHarmoniques.douze === '1, 3/2, 11/6, 25/12, 137/60, 49/20, 363/140, 761/280, 7129/2520, 7381/2520, 83711/27720, 86021/27720' && I.nombresHarmoniques.vingt === '55835135/15519504' && I.nombresHarmoniques.seuils === seuilsRef.join(' ') && I.temoin.mesure === 1, JSON.stringify(I) + ' ref ' + seuilsRef.join(' '));
    return 'seuils ' + I.nombresHarmoniques.seuils;
  });
  /* game197 : Collatz — reference INDEPENDANTE : vol par RECURSION memoisee (vol(n) = 1 + vol(suivant)), altitude par parcours separe ;
   *   valeurs de Grok Bot vol(1..20) (A006577) */
  const colMemo = new Map([[1, 0]]); const colVol = (x) => { if (colMemo.has(x)) return colMemo.get(x); const v = 1 + colVol(x % 2 === 0 ? x / 2 : 3 * x + 1); colMemo.set(x, v); return v; };
  ok('suiteCollatz : recursion = valeurs de Grok Bot (vol 1..20) ; variante 3n - 1 : 5 revient sur 5', () => {
    assert.deepEqual(Array.from({ length: 20 }, (_, i) => colVol(i + 1)), [0, 1, 7, 2, 5, 8, 16, 3, 19, 6, 14, 9, 9, 17, 17, 4, 12, 20, 20, 7]);
    const vu = []; let x = 5; do { vu.push(x); x = x % 2 ? 3 * x - 1 : x / 2; } while (x !== 5 && vu.length < 50); assert.equal(x, 5); return 'cycle ' + vu.join(' '); });
  for (const p of [...extremes(sys('suiteCollatz')), { limite: 1000 }]) ok(`suiteCollatz ${JSON.stringify(p)} : tout depart atteint 1, vol(2m) = vol(m) + 1, valeurs de Grok, record, temoin`, () => {
    const R = S('suiteCollatz', p), I = R.invariants, N = R.params.limite;
    let rec = 1; for (let d = 2; d <= N; d++) if (colVol(d) > colVol(rec)) rec = d;
    let alt = rec, y = rec; while (y !== 1) { y = y % 2 === 0 ? y / 2 : 3 * y + 1; if (y > alt) alt = y; }
    assert.ok(I.suiteCollatz.mesure === 0 && I.suiteCollatz.vingt === '0, 1, 7, 2, 5, 8, 16, 3, 19, 6, 14, 9, 9, 17, 17, 4, 12, 20, 20, 7' && I.suiteCollatz.record === rec + ' en ' + colVol(rec) + ' pas, altitude ' + alt && I.temoin.mesure === 1, JSON.stringify(I) + ' ref ' + rec + ' ' + alt);
    return I.suiteCollatz.record;
  });
  /* game198 : Kaprekar - reference INDEPENDANTE : chiffres extraits par division (pas de chaines), tri par comptage ;
   *   valeurs de Grok Bot (L = 4 : distribution exhaustive, chemin de 1000) */
  const kRef = (x, L) => { const c = new Array(10).fill(0); for (let i = 0; i < L; i++) { c[x % 10]++; x = Math.floor(x / 10); }
    let hi = 0, lo = 0; for (let d = 9; d >= 0; d--) for (let j = 0; j < c[d]; j++) hi = hi * 10 + d; for (let d = 0; d <= 9; d++) for (let j = 0; j < c[d]; j++) lo = lo * 10 + d; return hi - lo; };
  ok('routineKaprekar : reference par division = chemin de 1000 de Grok Bot', () => { const ch = [1000]; while (ch.length < 10 && kRef(ch[ch.length - 1], 4) !== ch[ch.length - 1]) ch.push(kRef(ch[ch.length - 1], 4));
    assert.deepEqual(ch, [1000, 999, 8991, 8082, 8532, 6174]); return 'ok'; });
  for (const p of [...extremes(sys('routineKaprekar'))]) ok(`routineKaprekar ${JSON.stringify(p)} : un seul point fixe, distribution, temoin`, () => {
    const R = S('routineKaprekar', p), I = R.invariants, L = R.params.longueurK;
    const fx = new Set(), dist = {}; for (let x = 0; x < 10 ** L; x++) { if (new Set(String(x).padStart(L, '0')).size === 1) continue; let y = x, k = 0; while (kRef(y, L) !== y && k < 30) { y = kRef(y, L); k++; } fx.add(y); dist[k] = (dist[k] || 0) + 1; }
    const dRef = Object.keys(dist).sort((a, b) => a - b).map((k) => k + ':' + dist[k]).join(' ');
    assert.ok(I.routineKaprekar.mesure === 0 && fx.size === 1 && I.routineKaprekar.pointFixe === [...fx][0] && I.routineKaprekar.distribution === dRef && I.temoin.mesure === 0, JSON.stringify(I) + ' ref ' + dRef);
    if (L === 4) assert.equal(I.routineKaprekar.distribution, '0:1 1:383 2:576 3:2400 4:1272 5:1518 6:1656 7:2184');
    return 'point fixe ' + I.routineKaprekar.pointFixe + ', au plus ' + I.routineKaprekar.pmax + ' pas';
  });
  /* game199 : Stirling et Bell - reference INDEPENDANTE : chaque fonction de {0..n-1} vers {0..n-1} (n^n) ramenee a sa partition
   *   (ensemble des fibres), dedoublonnee par cle ; valeurs de Grok Bot S(n, k) n <= 8, Bell(0..10) (A008277 / A000110) */
  const partRef = (m) => { const vues = new Set(), parK = new Array(m + 1).fill(0); const f = new Array(m).fill(0);
    for (let c = 0; c < m ** m; c++) { let x = c; for (let i = 0; i < m; i++) { f[i] = x % m; x = Math.floor(x / m); }
      const fib = new Map(); f.forEach((v, i) => { if (!fib.has(v)) fib.set(v, []); fib.get(v).push(i); });
      const cle = [...fib.values()].map((b) => b.join('.')).sort().join('|'); if (!vues.has(cle)) { vues.add(cle); parK[fib.size]++; } } return parK.slice(1); };
  ok('stirlingBell : fibres de n^n fonctions = valeurs de Grok Bot (S(n, k), n = 4..7)', () => {
    assert.deepEqual(partRef(4), [1, 7, 6, 1]); assert.deepEqual(partRef(5), [1, 15, 25, 10, 1]); assert.deepEqual(partRef(6), [1, 31, 90, 65, 15, 1]); assert.deepEqual(partRef(7), [1, 63, 301, 350, 140, 21, 1]); return 'ok'; });
  for (const p of [...extremes(sys('stirlingBell')), { elements: 6, graine: 77 }]) ok(`stirlingBell ${JSON.stringify(p)} : enumeration, recurrence, Aitken, valeurs de Grok, temoin`, () => {
    const R = S('stirlingBell', p), I = R.invariants, N = R.params.elements;
    assert.ok(I.stirlingBell.mesure === 0 && I.stirlingBell.ligneHuit === '1, 127, 966, 1701, 1050, 266, 28, 1' && I.stirlingBell.bellOnze === '1, 1, 2, 5, 15, 52, 203, 877, 4140, 21147, 115975' && I.temoin.mesure === 2, JSON.stringify(I));
    if (N <= 7) assert.equal(I.stirlingBell.partitions, partRef(N).join(' '));
    return N + ' elements : ' + I.stirlingBell.partitions;
  });
  /* game200 : Motzkin - reference INDEPENDANTE : les 3^n mots en {-1, 0, 1} parcourus en base 3, gardes si somme nulle et prefixes >= 0 ;
   *   valeurs de Grok Bot M(0..15) (A001006) */
  const motzRef = (m) => { let c = 0; for (let x = 0; x < 3 ** m; x++) { let y = x, h = 0, ok = true; for (let i = 0; i < m; i++) { h += (y % 3) - 1; y = Math.floor(y / 3); if (h < 0) { ok = false; break; } } if (ok && h === 0) c++; } return c; };
  ok('motzkinChemins : mots en base 3 = valeurs de Grok Bot (M(0..11))', () => { assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(motzRef), [1, 1, 2, 4, 9, 21, 51, 127, 323, 835, 2188, 5798]); return 'ok'; });
  for (const p of [...extremes(sys('motzkinChemins')), { longueurM: 9, graine: 4242 }]) ok(`motzkinChemins ${JSON.stringify(p)} : enumeration, recurrence, somme de Catalan, valeurs de Grok, chemin tire, temoin`, () => {
    const R = S('motzkinChemins', p), I = R.invariants, N = R.params.longueurM;
    assert.ok(I.motzkinChemins.mesure === 0 && I.motzkinChemins.seize === '1, 1, 2, 4, 9, 21, 51, 127, 323, 835, 2188, 5798, 15511, 41835, 113634, 310572' && I.temoin.mesure === 3 && I.temoin.formule === 2, JSON.stringify(I));
    if (N <= 11) assert.equal(I.motzkinChemins.compte, motzRef(N));
    let fin = null, bas = 0; for (let q = 0; q < R.n; q++) { const o = 3 * q; if (R.brut[o + 1] < 0) bas++; if (R.brut[o] === 1) fin = R.brut[o + 1]; } assert.ok(bas === 0 && fin === 0, 'chemin tire sous le sol ou pas revenu : ' + bas + ' ' + fin);
    return 'M(' + N + ') = ' + I.motzkinChemins.compte;
  });
  /* game201 : Pisano - reference INDEPENDANTE : Fibonacci en BigInt (valeurs exactes, sans modulo pendant le calcul), periode = plus petit k
   *   avec F(k) = 0 et F(k + 1) = 1 mod m ; valeurs de Grok Bot pi(1..30) (A001175) */
  const pisRef = (m) => { if (m === 1) return 1; const mb = BigInt(m); let a = 0n, b = 1n; for (let k = 1; k <= 6 * m + 10; k++) { [a, b] = [b, a + b]; if (a % mb === 0n && b % mb === 1n) return k; } return -1; };
  ok('periodePisano : Fibonacci exact en BigInt = valeurs de Grok Bot (pi(1..30))', () => { assert.equal(Array.from({ length: 30 }, (_, i) => pisRef(i + 1)).join(', '), '1, 3, 8, 6, 20, 24, 16, 12, 24, 60, 10, 24, 28, 48, 40, 24, 36, 24, 18, 60, 16, 30, 48, 24, 100, 84, 72, 48, 14, 120'); return 'ok'; });
  for (const p of [...extremes(sys('periodePisano')), { moduleMax: 200 }]) ok(`periodePisano ${JSON.stringify(p)} : cycles, ppcm, parite, 6m, valeurs de Grok, temoin`, () => {
    const R = S('periodePisano', p), I = R.invariants, M = R.params.moduleMax;
    const six = []; for (let m = 1; m <= Math.min(M, 120); m++) if (pisRef(m) === 6 * m) six.push(m);
    assert.ok(I.periodePisano.mesure === 0 && I.periodePisano.trente === '1, 3, 8, 6, 20, 24, 16, 12, 24, 60, 10, 24, 28, 48, 40, 24, 36, 24, 18, 60, 16, 30, 48, 24, 100, 84, 72, 48, 14, 120' && I.temoin.mesure === 1, JSON.stringify(I));
    assert.equal(I.periodePisano.sixM.split(' ').filter((x) => Number(x) <= 120).join(' '), six.join(' '));
    return '6m atteint pour ' + I.periodePisano.sixM;
  });
  /* game202 : indicatrice d Euler - reference INDEPENDANTE : compter les k <= n avec pgcd(k, n) = 1 (definition, sans crible) ;
   *   valeurs de Grok Bot phi(1..40) (A000010) */
  const totRef = (m) => { let c = 0; for (let k = 1; k <= m; k++) { let x = k, y = m; while (y) { [x, y] = [y, x % y]; } if (x === 1) c++; } return c; };
  ok('indicatriceEuler : definition par pgcd = valeurs de Grok Bot (phi(1..40))', () => { assert.equal(Array.from({ length: 40 }, (_, i) => totRef(i + 1)).join(', '), '1, 1, 2, 2, 4, 2, 6, 4, 6, 4, 10, 4, 12, 6, 8, 8, 16, 6, 18, 8, 12, 10, 22, 8, 20, 12, 18, 12, 28, 8, 30, 16, 20, 16, 24, 12, 36, 18, 24, 16'); return 'ok'; });
  for (const p of [...extremes(sys('indicatriceEuler')), { jusquaN: 500 }]) ok(`indicatriceEuler ${JSON.stringify(p)} : sommes sur les diviseurs, multiplicativite, parite, valeurs de Grok, temoin, dessin`, () => {
    const R = S('indicatriceEuler', p), I = R.invariants, N = R.params.jusquaN;
    assert.ok(I.indicatriceEuler.mesure === 0 && I.indicatriceEuler.quarante === '1, 1, 2, 2, 4, 2, 6, 4, 6, 4, 10, 4, 12, 6, 8, 8, 16, 6, 18, 8, 12, 10, 22, 8, 20, 12, 18, 12, 28, 8, 30, 16, 20, 16, 24, 12, 36, 18, 24, 16' && I.temoin.mesure === 2 && I.temoin.formule === 1, JSON.stringify(I));
    let faux = 0; for (let q = 0; q < Math.min(R.n, N); q++) { const o = 3 * q, m = Math.round(R.brut[o] * N); if (Math.abs(R.brut[o + 1] - totRef(m) / m) > 1e-12) faux++; } assert.equal(faux, 0, 'phi(n)/n dessine faux');
    return 'ok';
  });
  /* game203 : Goldbach - reference INDEPENDANTE : primalite par divisions successives (sans crible), couples p <= q premiers impairs ;
   *   valeurs de Grok Bot pour E = 4..60 (A002375) */
  const gbPremier = (x) => { if (x < 2) return false; for (let d = 2; d * d <= x; d++) if (x % d === 0) return false; return true; };
  const gbPrem = Array.from({ length: 8001 }, (_, x) => gbPremier(x)); /* table par DIVISIONS (pas un crible), calculee une fois */
  const gbRef = (E) => { let c = 0; for (let p = 3; p <= E - p; p += 2) if (gbPrem[p] && gbPrem[E - p]) c++; return c; };
  ok('goldbachPaires : divisions successives = valeurs de Grok Bot (E = 4..60)', () => { const v = []; for (let E = 4; E <= 60; E += 2) v.push(gbRef(E));
    assert.equal(v.join(', '), '0, 1, 1, 2, 1, 2, 2, 2, 2, 3, 3, 3, 2, 3, 2, 4, 4, 2, 3, 4, 3, 4, 5, 4, 3, 5, 3, 4, 6'); return 'ok'; });
  for (const p of [...extremes(sys('goldbachPaires')), { pairMax: 1000 }]) ok(`goldbachPaires ${JSON.stringify(p)} : chaque pair des 6 se decompose, valeurs de Grok, temoin, dessin`, () => {
    const R = S('goldbachPaires', p), I = R.invariants, Emax = R.params.pairMax;
    assert.ok(I.goldbachPaires.mesure === 0 && I.goldbachPaires.soixante === '0, 1, 1, 2, 1, 2, 2, 2, 2, 3, 3, 3, 2, 3, 2, 4, 4, 2, 3, 4, 3, 4, 5, 4, 3, 5, 3, 4, 6' && I.temoin.mesure === 0 && I.goldbachPaires.rapportMod3 > 1, JSON.stringify(I));
    let fmax = 0; for (let E = 4; E <= Emax; E += 2) fmax = Math.max(fmax, gbRef(E));
    let faux = 0; for (let q = 0; q < Math.min(R.n, 200); q++) { const o = 3 * q, E = Math.round(R.brut[o] * Emax); if (Math.abs(R.brut[o + 1] - gbRef(E) / fmax) > 1e-12) faux++; } assert.equal(faux, 0, 'comptes dessines faux');
    return 'ok';
  });
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
/* 2026-11-06 (game180) : CIBLES est un litteral d objet — une cle ecrite DEUX FOIS ecrase la premiere EN SILENCE (« pascal » visait
 *   pascalSierpinski, et les 3 mutants de l hexagramme relancaient les tests du mauvais systeme : SURVIT x 3). Garde : cles uniques. */
{ const ligne = moi.split(/\r?\n/).find((l) => /const CIBLES = \{/.test(l)) || '', cles = [...ligne.matchAll(/(\w+): \[/g)].map((m) => m[1]), doubles = cles.filter((c, i) => cles.indexOf(c) !== i);
  assertions++; if (!cles.length || doubles.length) ech.push({ nom: 'CIBLES : cles en double', det: doubles.join(',') || 'ligne introuvable' });
  console.log(`${doubles.length || !cles.length ? 'ECHEC ' : 'OK    '}CIBLES : ${cles.length} cles, aucune en double${doubles.length ? ' (' + doubles.join(',') + ')' : ''}`); }
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
  ['saw : demi-tour permis', 'if (!vu[q]) { vu[q] = 1; dfs(q, k + 1); vu[q] = 0; }', 'if (!vu[q] || q === chemin[chemin.length - 2]) { const w = vu[q]; vu[q] = 1; dfs(q, k + 1); vu[q] = w; }'],
  ['saw : la reference A001411 faussee', 'const SAW_A001411 = [1, 4, 12, 36, 100, 284, 780, 2172, 5916, 16268, 44100, 120292, 324932];', 'const SAW_A001411 = [1, 4, 12, 36, 100, 284, 780, 2172, 5916, 16268, 44100, 120292, 324933];'],
  ['saw : sous-multiplicativite inversee', 'if (c[m + k] > c[m] * c[k]) violations++;', 'if (c[m + k] < c[m] * c[k]) violations++;'],
  ['saw : temoin 4^k', 'if (4 * 3 ** (k - 1) !== c[k]) premier = k;', 'if (4 ** k !== c[k]) premier = k;'],
  ['saw : marche dessinee = la premiere', 'cible = Math.floor(rng() * total)', 'cible = 0 * Math.floor(rng() * total)'],
  ['euler : adouci, xi racine de xi^3 + 2 xi^2 = phi', 'x -= (x ** 3 + 2 * x ** 2 - EUL_PHI ** 2) / (3 * x * x + 4 * x);', 'x -= (x ** 3 + 2 * x ** 2 - EUL_PHI) / (3 * x * x + 4 * x);'],
  ['euler : aretes = paires a 1.5 fois le minimum', 'if (Math.abs(eulDist(P[i], P[j]) - m) < 1e-9 * m) { aretes.push', 'if (eulDist(P[i], P[j]) < 1.5 * m) { aretes.push'],
  ['euler : plans non dedoublonnes', 'if (!plans.some((q) => eulDist(q, cle) < 1e-9)) { plans.push(cle); sommetsFaces += sur; }', '{ plans.push(cle); sommetsFaces += sur; }'],
  ['euler : cuboctaedre en (1,1,1)', 'if (k === 2) return eulUniq(eulPerms([1, 1, 0]).flatMap(eulSignes));', 'if (k === 2) return eulUniq(eulPerms([1, 1, 1]).flatMap(eulSignes));'],
  ['euler : plan d appui coupant accepte', 'if (pos > 0 && neg > 0) continue; const sg = pos ? -1 : 1, cle', 'if (pos > 1 && neg > 0) continue; const sg = pos ? -1 : 1, cle'],
  ['euler : tore ferme en sphere', 'return { D: 3, brut, nuage: true, unite: \'longueur d arete\', invariants: {', 'faces.length = 6; return { D: 3, brut, nuage: true, unite: \'longueur d arete\', invariants: {'],
  ['morley : trisectrices sans le sens du triangle', 'const X = inter(U, rot(du, sens * al[i] / k), V, rot(dv, -sens * al[(i + 1) % 3] / k));', 'const X = inter(U, rot(du, al[i] / k), V, rot(dv, al[(i + 1) % 3] / k));'],
  ['morley : Webster avec 4 R', 'const s = 8 * sinD(T.al[0] / 3)', 'const s = 4 * sinD(T.al[0] / 3)'],
  ['morley : angle voisin mal choisi', 'rot(dv, -sens * al[(i + 1) % 3] / k)', 'rot(dv, -sens * al[(i + 2) % 3] / k)'],
  ['morley : temoin en trois', 'Q = morleyPoints(A, B, 4)', 'Q = morleyPoints(A, B, 3)'],
  ['bale : borne basse 1/n', 'if (!(1 / (m + 1) < r && r < 1 / m)) horsBornes++;', 'if (!(1 / m < r && r < 1 / m)) horsBornes++;'],
  ['bale : fraction sans le carre', 'const d = k * k; num = num * d + den; den = den * d;', 'const d = k; num = num * d + den; den = den * d;'],
  ['bale : pi^2/8', 'const BALE_PI2_6 = PI * PI / 6;', 'const BALE_PI2_6 = PI * PI / 8;'],
  ['bale : temoin avec le carre', 'h += 1 / k; if (h > BALE_PI2_6) depasse = k;', 'h += 1 / (k * k); if (h > BALE_PI2_6) depasse = k;'],
  ['simson : pied au milieu du cote', 'pieds.push([feuAdd(U[0], feuMul(t, d[0])), feuAdd(U[1], feuMul(t, d[1]))]); }', 'pieds.push([feuAdd(U[0], feuMul(feuF(1n, 2n), d[0])), feuAdd(U[1], feuMul(feuF(1n, 2n), d[1]))]); }'],
  ['simson : P pris au centre de la corde', 'if (s[0] !== 0n) P = [feuAdd(A[0], s), feuAdd(A[1], feuMul(s, t))]; }', 'if (s[0] !== 0n) P = [feuAdd(A[0], feuMul(feuF(1n, 2n), s)), feuAdd(A[1], feuMul(feuMul(feuF(1n, 2n), s), t))]; }'],
  ['simson : temoin sur le cercle', 'Q = [feuAdd(O[0], feuMul(feuF(5n, 4n), feuSub(P[0], O[0]))), feuAdd(O[1], feuMul(feuF(5n, 4n), feuSub(P[1], O[1])))]', 'Q = P'],
  ['simson : centre faux', 'const det = feuSub(feuMul(a1, b2), feuMul(a2, b1)), O = [feuDiv(feuSub(feuMul(c1, b2), feuMul(c2, b1)), det), feuDiv(feuSub(feuMul(a1, c2), feuMul(a2, c1)), det)];', 'const det = feuSub(feuMul(a1, b2), feuMul(a2, b1)), O = [feuDiv(feuSub(feuMul(c1, b2), feuMul(c2, b1)), det), feuAdd(feuE(1), feuDiv(feuSub(feuMul(a1, c2), feuMul(a2, c1)), det))];'],
  ['distinctes : sac a dos dans le mauvais sens (parts repetees)', 'for (let k = 1; k <= N; k++) for (let m = N; m >= k; m--) q[m] += q[m - k]; return q; }', 'for (let k = 1; k <= N; k++) for (let m = k; m <= N; m++) q[m] += q[m - k]; return q; }'],
  ['distinctes : impaires avec le 2', 'for (let k = 1; k <= N; k += 2) for (let m = k; m <= N; m++) q[m] += q[m - k]; return q; }', 'for (let k = 1; k <= N; k += (k === 1 ? 1 : 2)) for (let m = k; m <= N; m++) q[m] += q[m - k]; return q; }'],
  ['distinctes : Glaisher coupe en 2 au lieu de 2^a', 'for (let i = 0; i < 2 ** a; i++) image.push(b);', 'for (let i = 0; i < 2 * a + 1; i++) image.push(b);'],
  /* comparer p(n) aux parts IMPAIRES serait EQUIVALENT (distinctes = impaires : c est le theoreme) : on mute vers un decalage */
  ['distinctes : temoin decale d un rang', 'if (tous[m] !== A[m]) premier = m;', 'if (tous[m] !== A[m]) premier = m + 1;'],
  ['triangulations : recursion sans le produit', 'for (let k = 1; k <= m - 2; k++) s += T[k + 1] * T[m - k];', 'for (let k = 1; k <= m - 2; k++) s += T[k + 1] + T[m - k];'],
  ['triangulations : croisement mal detecte', 'return (p < r && r < q && q < s) || (r < p && p < s && s < q); };', 'return (p < r && r < q && q < s); };'],
  ['triangulations : tirage sans la seconde moitie', 'triTirage(i, k, T, rng, diag); triTirage(k, j, T, rng, diag); return; }', 'triTirage(i, k, T, rng, diag); return; }'],
  ['triangulations : temoin sur un hexagone', 'const D5 = [[2, 4], [1, 4], [1, 3], [0, 3], [0, 2]];', 'const D5 = [[2, 5], [1, 4], [1, 3], [0, 3], [0, 2]];'],
  ['ramsey : triangle a deux aretes', 'if (c === ((m >> t[1]) & 1) && c === ((m >> t[2]) & 1)) { if (mono === null) mono = t;', 'if (c === ((m >> t[1]) & 1)) { if (mono === null) mono = t;'],
  ['ramsey : cycles sans la connexite', "if (deg.some((d) => d !== 2) || vu.size !== 5) cyclesFaux++; }", "if (deg.some((d) => d !== 3)) cyclesFaux++; }"],
  ['ramsey : temoin sur le bleu aussi', 'if (c === 0) rouge = true; }', 'rouge = true; }'],
  ['ramsey : triangle non dessine', 'tri && tri.includes(k) ? 2 : (m >> k) & 1', '(m >> k) & 1'],
  ['hexagramme : cotes voisins au lieu d opposes', 'const X = pascalInter(H[0], H[1], H[3], H[4]), Y', 'const X = pascalInter(H[0], H[1], H[2], H[3]), Y'],
  ['hexagramme : point hors du cercle', 'return [feuF(1n - T * T, d), feuF(2n * T, d)]; });', 'return [feuF(1n - T * T, d), feuF(2n * T + 1n, d)]; });'],
  ['hexagramme : temoin sur le cercle', 'H2 = [...H.slice(0, 5), [feuE(2), feuE(2)]]', 'H2 = [...H.slice(0, 5), H[5]]'],
  ['ptolemee : signe de la racine oublie', 'return { egal: g[0] >= 0n && feuEq(feuMul(g, g), droite)', 'return { egal: feuEq(feuMul(g, g), droite) || g[0] < 0n'],
  ['ptolemee : facteur 2 au lieu de 4', 'droite = feuMul(feuE(4), feuMul(feuMul(ab, cd), feuMul(da, bc)));', 'droite = feuMul(feuE(2), feuMul(feuMul(ab, cd), feuMul(da, bc)));'],
  ['ptolemee : ordre du cercle perdu', 'Q.sort((u, v) => atan2D(feuNb(u[1]), feuNb(u[0])) - atan2D(feuNb(v[1]), feuNb(v[0])));', 'Q.sort((u, v) => feuNb(u[0]) - feuNb(v[0]));'],
  ['ptolemee : temoin sur le cercle', 'C2 = [feuMul(feuF(6n, 5n), Q[2][0]), feuMul(feuF(6n, 5n), Q[2][1])]', 'C2 = Q[2]'],
  ['carres : Jacobi avec tous les diviseurs', 'if (m % d === 0) { s += d; if (d % 4) j += d;', 'if (m % d === 0) { s += d; j += d;'],
  ['carres : deux carres d1 + d3', 'if (r2[m] !== 4 * (d1 - d3)) e2++;', 'if (r2[m] !== 4 * (d1 + d3)) e2++;'],
  ['carres : d sans le signe moins', 'for (let d = -R; d <= R; d++) { const s4 = s3 + d * d; if (s4 <= N) r4[s4]++; } } }', 'for (let d = 0; d <= R; d++) { const s4 = s3 + d * d; if (s4 <= N) r4[s4]++; } } }'],
  ['carres : temoin avec la bonne formule', 'if (premier === null && r4[m] !== 8 * s) premier = m;', 'if (premier === null && r4[m] !== 8 * j) premier = m;'],
  ['pell : arret a -1 aussi', 'if (p1 * p1 - BigInt(Dd) * q1 * q1 === 1n) return', 'if (p1 * p1 - BigInt(Dd) * q1 * q1 === 1n || p1 * p1 - BigInt(Dd) * q1 * q1 === -1n) return'],
  ['pell : reduites sans le terme precedent', '[p0, p1] = [p1, a * p1 + p0];', '[p0, p1] = [p1, a * p1];'],
  ['pell : temoin sur x^2 - 3 y^2 = +1', 'const x2 = 3n * y * y - 1n,', 'const x2 = 3n * y * y + 1n,'],
  ['pell : carre non saute', 'let Dd = P.radical; while (Number.isInteger(Math.sqrt(Dd))) Dd++;', 'let Dd = P.D;'],
  ['carmichael : Korselt sans le facteur carre', 'const sansCarre = new Set(f).size === f.length;', 'const sansCarre = true;'],
  ['carmichael : p au lieu de p - 1', 'f.every((p) => (k - 1) % (p - 1) === 0)', 'f.every((p) => (k - 1) % p === 0)'],
  ['carmichael : pseudo base 3', 'if (k % 2 === 1 && carPuiss(2, k - 1, k) === 1) psp2.push(k); }', 'if (k % 2 === 1 && carPuiss(3, k - 1, k) === 1) psp2.push(k); }'],
  ['carmichael : temoin en base 2', 'const temoin = carPuiss(3, 340, 341);', 'const temoin = carPuiss(2, 340, 341);'],
  ['wilson : produit jusqu a n inclus', 'for (let i = 2; i < k; i++) r = (r * i) % k; return r % k; }', 'for (let i = 2; i <= k; i++) r = (r * i) % k; return r % k; }'],
  ['wilson : n = 4 non exempte', "if (!premier && r !== (k === 4 ? 2 : 0)) regle++; }", "if (!premier && r !== 0) regle++; }"],
  ['wilson : primalite par divisibilite par 2 seulement', 'for (let d = 2; d * d <= k; d++) if (k % d === 0) { premier = false; break; }', 'if (k > 2 && k % 2 === 0) premier = false;'],
  ['mertens : facteurs carres non annules', 'for (let j = p * p; j <= N; j += p * p) mu[j] = 0;', ''],
  ['mertens : identite avec M(k) au lieu de M(n div k)', 'for (let k = 1; k <= m; k++) s += M[Math.floor(m / k)];', 'for (let k = 1; k <= m; k++) s += M[k];'],
  ['mertens : Liouville sans multiplicite', 'for (let q = p; q <= N; q *= p) for (let m = q; m <= N; m += q) lam[m] = -lam[m]; }', 'for (let m = p; m <= N; m += p) lam[m] = -lam[m]; }'],
  ['aliquote : n compte parmi ses diviseurs', 'for (let m = 2 * d; m <= N; m += d) s[m] += d; return s; }', 'for (let m = d; m <= N; m += d) s[m] += d; return s; }'],
  ['aliquote : paires sans reciprocite', 'if (t > k && t <= N && s[t] === k) paires.push([k, t]); }', 'if (t > k && t <= N) paires.push([k, t]); }'],
  ['aliquote : Euclide sans primalite', 'return m === 2 ** p - 1 && prem; };', 'return m === 2 ** p - 1; };'],
  ['aliquote : temoin avec 2047 premier', 'const sigma = (2 ** 11 - 1) * (23 + 1) * (89 + 1)', 'const sigma = (2 ** 11 - 1) * (2047 + 1)'],
  ['bernoulli : binom(m, k) au lieu de binom(m + 1, k)', 's = feuAdd(s, feuMul(feuF(binomB(m + 1, k), 1n), B[k]));', 's = feuAdd(s, feuMul(feuF(binomB(m, k), 1n), B[k]));'],
  ['bernoulli : von Staudt avec q au lieu de q - 1', 'if (prem && k % (q - 1) === 0) s = feuAdd(s, feuF(1n, BigInt(q)));', 'if (prem && k % q === 0) s = feuAdd(s, feuF(1n, BigInt(q)));'],
  ['bernoulli : Faulhaber jusqu a m inclus', 'for (let k = 0n; k < BigInt(m); k++) gauche += k ** BigInt(p);', 'for (let k = 0n; k <= BigInt(m); k++) gauche += k ** BigInt(p);'],
  ['bernoulli : temoin avec la convention moderne', 'if (!bernFaulhaber(B, p, m, [1n, 2n])) fauxF2++;', 'if (!bernFaulhaber(B, p, m, B[1])) fauxF2++;'],
  ['josephus : pas k au lieu de k - 1', 'while (cercle.length > 1) { i = (i + k - 1) % cercle.length;', 'while (cercle.length > 1) { i = (i + k) % cercle.length;'],
  ['josephus : recurrence sans le + 1', 'if (m > 1) J = ((J + K - 1) % m) + 1;', 'if (m > 1) J = ((J + K - 1) % m);'],
  ['josephus : 2L - 1', 'if (K === 2 && 2 * L + 1 !== J) ecarts2L++; }', 'if (K === 2 && 2 * L - 1 !== J) ecarts2L++; }'],
  ['josephus : temoin avec k = 2', 'J3 = ((J3 + 2) % m) + 1;', 'J3 = ((J3 + 1) % m) + 1;'],
  ['zeckendorf : glouton qui saute le plus grand', 'for (let i = F.length - 1; i >= 0 && r > 0; i--) if (F[i] <= r) { idx.push(i); r -= F[i]; }', 'for (let i = F.length - 2; i >= 0 && r > 0; i--) if (F[i] <= r) { idx.push(i); r -= F[i]; }'],
  ['zeckendorf : voisins jamais refuses', 'if (consecutifs || !pris) c += go(r - F[i], i + 1, 1);', 'c += go(r - F[i], i + 1, 1);'],
  ['zeckendorf : Fibonacci 1, 1, 2', 'function zeckFib(N) { const F = [1, 2];', 'function zeckFib(N) { const F = [1, 1];'],
  /* « continue » au lieu de « return 0 » ferait BOUCLER le banc (n, k jamais mis a jour) ; retirer la ligne serait equivalent (binom(a, b) = 0 si b > a) */
  ['lucas : chiffres de n et k inverses', 'const a = n % p, b = k % p; if (b > a) return 0;', 'const a = k % p, b = n % p; if (b > a) return 0;'],
  ['lucas : Pascal sans le modulo', 'suivante.push((ligne[k - 1] + ligne[k]) % p); suivante.push(1); ligne = suivante; }', 'suivante.push(ligne[k - 1] + ligne[k]); suivante.push(1); ligne = suivante; }'],
  ['lucas : p non premier garde', 'while (!prem(p)) p++;', ''],
  ['lucas : temoin en base 3', 'mesure: lucasRegle(6, 2, 4), formule: 1', 'mesure: lucasRegle(6, 2, 3), formule: 1'],
  ['calkin : enfant gauche (a + b)/a', 'const [a, b] = fr[i]; fr.push([a, a + b], [a + b, b]); }', 'const [a, b] = fr[i]; fr.push([a + b, a], [a + b, b]); }'],
  ['calkin : fusc pair = fusc(n) + 1', 'fusc.push(k % 2 ? fusc[(k - 1) / 2] + fusc[(k + 1) / 2] : fusc[k / 2]);', 'fusc.push(k % 2 ? fusc[(k - 1) / 2] + fusc[(k + 1) / 2] : fusc[k / 2] + 1);'],
  ['calkin : completude jusqu a D + 2', 'for (let s = 2; s <= Dn + 1; s++) for (let p = 1; p < s; p++)', 'for (let s = 2; s <= Dn + 2; s++) for (let p = 1; p < s; p++)'],
  ['calkin : temoin reduit', "const q = s - p, d = g(p, q), cle = (p / d) + '/' + (q / d);", "const q = s - p, d = 1, cle = (p / d) + '/' + (q / d);"],
  ['hanoi : piquet intermediaire inverse', 'bouge(k - 1, de, via, vers); const disque', 'bouge(k - 1, de, vers, via); const disque'],
  ['hanoi : disque 1 + ctz(m) - 1', 'if (disque !== z + 1 || bits !== 1 || p !== z) horsGray++;', 'if (disque !== z || bits !== 1 || p !== z) horsGray++;'],
  ['hanoi : Gray sans le decalage', 'const x = (m ^ (m >> 1)) ^ ((m - 1) ^ ((m - 1) >> 1));', 'const x = m ^ (m - 1);'],
  ['hanoi : temoin sans multi-bits', 'if (c > 1) binaireMulti++; });', 'if (c > 2) binaireMulti++; });'],
  ['regarder : chiffre puis compte', 'r.push((j - i) + s[i]); i = j; }', 'r.push(s[i] + (j - i)); i = j; }'],
  /* « 333 » -> « 3333 » serait EQUIVALENT (aucun des deux n apparait) : on mute la garde des chiffres dans le sens qui DOIT rougir */
  ['regarder : chiffre 3 compte comme interdit', 'if (/[4-9]/.test(t)) horsChiffres++;', 'if (/[3-9]/.test(t)) horsChiffres++;'],
  ['regarder : temoin depuis 23', "let g = '22'; for (let k = 0; k < 10; k++) g = lasSuivant(g);", "let g = '23'; for (let k = 0; k < 10; k++) g = lasSuivant(g);"],
  ['derangements : point fixe accepte', 'if (a.every((v, i) => v !== i)) { compte++;', 'if (a.some((v, i) => v !== i)) { compte++;'],
  ['derangements : recurrence en (m + 1)', 'for (let m = 2; m <= 30; m++) Dr.push(BigInt(m - 1) * (Dr[m - 1] + Dr[m - 2]));', 'for (let m = 2; m <= 30; m++) Dr.push(BigInt(m) * (Dr[m - 1] + Dr[m - 2]));'],
  ['derangements : arrondi par defaut', '2n * mf * KF < (d2 + 1n) * A &&', '2n * mf * KF < d2 * A &&'],
  ['derangements : temoin avec 1/2', 'mesure: Math.round(1 / e), formule: 0, vrai: 1', 'mesure: Math.round(1 / 2), formule: 0, vrai: 1'],
  ['harmoniques : fraction non reduite', 'let g = harmPgcd(a, b); hn = a / g;', 'let g = 1n; hn = a / g;'],
  ['harmoniques : borne basse en ln(n + 2)', 'if (!(lnD(k + 1) < hk && hk', 'if (!(lnD(k + 2) < hk && hk'],
  ['harmoniques : puissance de 4', 'while (d % 2n === 0n) { d /= 2n; e++; }', 'while (d % 4n === 0n) { d /= 4n; e++; }'],
  ['harmoniques : temoin pris a n = 2', 'temoin: { mesure: Number(dens[1]), formule: 1,', 'temoin: { mesure: Number(dens[2]), formule: 1,'],
  /* plafond de 10 000 pas : un mutant qui cycle s ARRETE (pas de banc fige) */
  ['collatz : 3n - 1 au lieu de 3n + 1', 'const [v, m, a] = syrVol(d, (x) => 3 * x + 1);', 'const [v, m, a] = syrVol(d, (x) => 3 * x - 1);'],
  ['collatz : doublement en + 2', 'if (vols[2 * m] !== vols[m] + 1) doubles++;', 'if (vols[2 * m] !== vols[m] + 2) doubles++;'],
  ['collatz : altitude divisee', 'pas++; alt = Math.max(alt, x); }', 'pas++; alt = Math.max(alt, x / 2); }'],
  ['collatz : temoin en 3n + 1', 't = t % 2 ? 3 * t - 1 : t / 2;', 't = t % 2 ? 3 * t + 1 : t / 2;'],
  ['kaprekar : zeros en tete perdus', "const kc = String(x).padStart(L, '0').split('')", "const kc = String(x).split('')"],
  ['kaprekar : croissant moins decroissant', 'return Number(kg.join(\'\')) - Number(kd.join(\'\')); }', 'return Number(kd.join(\'\')) - Number(kg.join(\'\')); }'],
  ['kaprekar : plafond a 6 pas', 'while (k < 20 && kt[y] !== y)', 'while (k < 6 && kt[y] !== y)'],
  ['kaprekar : temoin non repete', "const rep = Number('1'.repeat(L)),", "const rep = Number('1'.repeat(L - 1) + '2'),"],
  ['stirling : bloc neuf interdit', 'for (let b = 0; b <= ouverts && b < N; b++) { rgsPart[i] = b;', 'for (let b = 0; b < ouverts && b < N; b++) { rgsPart[i] = b;'],
  ['stirling : recurrence en (k + 1)', 'r.push(BigInt(k) * (Sr[m - 1][k] || 0n) + (Sr[m - 1][k - 1] || 0n));', 'r.push(BigInt(k + 1) * (Sr[m - 1][k] || 0n) + (Sr[m - 1][k - 1] || 0n));'],
  ['stirling : Aitken decale', 'for (const x of rang) nv.push(nv[nv.length - 1] + x);', 'for (const x of rang) nv.push(nv[nv.length - 1] + x + 1n);'],
  ['stirling : temoin sans les deux constantes', 'if (x !== 0 && x !== 2 ** N - 1) surj++;', 'if (x !== 0) surj++;'],
  ['motzkin : descente sous le sol', '+ (h > 0 ? motzCompte(i + 1, h - 1) : 0); };', '+ (h > -1 ? motzCompte(i + 1, h - 1) : 0); };'],
  ['motzkin : recurrence decalee', 'for (let k = 0; k <= m - 2; k++) s += Mr[k] * Mr[m - 2 - k];', 'for (let k = 0; k <= m - 2; k++) s += Mr[k] * Mr[m - 1 - k];'],
  ['motzkin : C(m, k) au lieu de C(m, 2k)', 's += binM(m, 2 * k) * (binM(2 * k, k)', 's += binM(m, k) * (binM(2 * k, k)'],
  ['motzkin : temoin sans DU', 'for (const b of [-1, 0, 1]) if (a + b === 0) libres++;', 'for (const b of [-1, 0, 1]) if (a + b === 0 && a >= 0) libres++;'],
  /* plafond 6m + 10 : un mutant qui ne referme jamais le cycle s ARRETE */
  ['pisano : retour sur (1, 0)', '} while (!(a === 0 && b === 1) && k < 6 * m + 10); return [a === 0 && b === 1 ? k : -1, zeros]; }', '} while (!(a === 1 && b === 0) && k < 6 * m + 10); return [a === 1 && b === 0 ? k : -1, zeros]; }'],
  ['pisano : produit au lieu du ppcm', 'per[a * b] !== ppcmP(per[a], per[b])) ppcmFaux++;', 'per[a * b] !== per[a] * per[b]) ppcmFaux++;'],
  ['pisano : parite des m = 2', 'for (let m = 3; m <= M; m++) if (per[m] % 2) impairs++;', 'for (let m = 2; m <= M; m++) if (per[m] % 2) impairs++;'],
  ['pisano : temoin a m = 4', 'temoin: { mesure: per[2] % 2, formule: 0,', 'temoin: { mesure: per[4] % 2, formule: 0,'],
  ['totient : crible en p au lieu de phi/p', 'totF[q] -= totF[q] / p; nbP[q]++; }', 'totF[q] -= totF[q] / q; nbP[q]++; }'],
  ['totient : somme des diviseurs decalee', 'for (let q = d; q <= N; q += d) somme[q] += totF[d];', 'for (let q = d; q <= N; q += d) somme[q] += totF[q];'],
  ['totient : multiplicativite sans pgcd', 'if (pgcdE(a, b) === 1 && totF[a * b] !== totF[a] * totF[b]) multFausses++;', 'if (totF[a * b] !== totF[a] * totF[b]) multFausses++;'],
  ['totient : temoin phi(2) au carre', 'temoin: { mesure: totF[4], formule: totF[2] * totF[2],', 'temoin: { mesure: totF[2] * totF[2], formule: totF[2] * totF[2],'],
  ['goldbach : 2 compte comme premier impair', 'for (let p = 3; p <= E / 2; p += 2) if (crible[p] && crible[E - p]) facons[E]++;', 'for (let p = 2; p <= E / 2; p += 1) if (crible[p] && crible[E - p]) facons[E]++;'],
  ['goldbach : p = q exclu', 'for (let p = 3; p <= E / 2; p += 2) if', 'for (let p = 3; p < E / 2; p += 2) if'],
  ['goldbach : crible des le carre manque', 'for (let q = p * p; q <= Emax; q += p) crible[q] = 0;', 'for (let q = p * p + p; q <= Emax; q += p) crible[q] = 0;'],
  ['goldbach : temoin a 6', 'temoin: { mesure: facons[4], formule: 0,', 'temoin: { mesure: facons[6], formule: 0,'],
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
    const CIBLES = { goldbach: ['goldbachPaires'], totient: ['indicatriceEuler'], pisano: ['periodePisano'], motzkin: ['motzkinChemins'], stirling: ['stirlingBell'], kaprekar: ['routineKaprekar'], collatz: ['suiteCollatz'], harmoniques: ['nombresHarmoniques'], derangements: ['derangements'], regarder: ['regarderDire'], hanoi: ['toursHanoi'], calkin: ['calkinWilf'], lucas: ['theoremeLucas'], zeckendorf: ['zeckendorf'], josephus: ['problemeJosephus'], bernoulli: ['nombresBernoulli'], aliquote: ['parfaitsAmicaux'], mertens: ['fonctionMertens'], wilson: ['theoremeWilson'], carmichael: ['nombresCarmichael'], pell: ['equationPell'], carres: ['sommesCarres'], ptolemee: ['ptolemee'], hexagramme: ['pascalHexagramme'], ramsey: ['ramseyR33'], triangulations: ['triangulations'], distinctes: ['distinctesImpaires'], simson: ['simsonDroite'], bale: ['bale'], morley: ['morley'], euler: ['eulerSolides'], saw: ['marcheAutoEvitante'], vie: ['jeuDeLaVie'], feuerbach: ['feuerbach'], billard: ['billardElliptique'], napoleon: ['napoleon'], percolation: ['percolationLiens'], pick: ['theoremePick'], dragon: ['courbeDragon'], partitions: ['partitionEuler'], catalan: ['catalanDyck'], marche: ['marcheAleatoire'], buffon: ['aiguilleBuffon'], anniversaires: ['anniversaires'], ulam: ['spiraleUlam'], pascal: ['pascalSierpinski'], solides: ['solidesPlatoniques'], monty: ['montyHall'], apollo: ['apollonius'], sable: ['tasDeSable'], verger: ['vergerEuclide'], ford: ['cerclesFord'], steiner: ['fermatSteiner'], caustique: ['causticTasse'], hofstadter: ['papillonHofstadter'], dominos: ['dominosKasteleyn'], ising: ['ising'], azteque: ['aztecDiamond'], coupons: ['collectionneur'], ruine: ['ruineJoueur'] };
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
