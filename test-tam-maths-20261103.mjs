// test-tam-maths-20261103.mjs -- banc de tam-maths.js (mathematiques du hasard et des nombres, vue non frappable) + mutants sur COPIES.
// Lancer : node test-tam-maths-20261103.mjs
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
const IDS = ['marcheAleatoire', 'aiguilleBuffon', 'anniversaires', 'spiraleUlam', 'pascalSierpinski'];

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
  ok('SYSTEMES gele, 5 systemes, SOURCES vide, COLONNES couvre chaque colonne, ENTIERS par systeme', () => {
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
