// test-tam-formule-20261101.mjs -- banc de tam-formule.js (la formule de l utilisateur : analyseur sur, modes, solveurs) + mutants sur COPIES.
//
// Chaque verification est une assertion node:assert/strict ; la suite tourne sur le module ET sur chaque mutant (copie dans un dossier
// temporaire, l import du moteur repointe vers l original). Un mutant est TUE si au moins une assertion rougit.
// Les valeurs de reference viennent des mathematiques connues (sqrt 2, k*pi, point fixe de cos = 0.739085133215..., equilibres de
// Lorenz (0,0,0) et (+-sqrt 72, +-sqrt 72, 27)), pas du module.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const ICI = dirname(fileURLToPath(import.meta.url)), SOURCE = join(ICI, 'tam-formule.js');
const LORENZ = ['10*(y-x)', 'x*(28-z)-y', 'x*y-8/3*z'];
const S72 = Math.sqrt(72);

function suite(T, src, mesures = null) {
  const r = [];
  const v = (nom, fn) => { try { fn(); r.push({ nom, ok: true }); } catch (e) { r.push({ nom, ok: false, det: e && e.message ? e.message.split('\n')[0] : String(e) }); } };
  const proche = (a, b, tol, m) => assert.ok(Math.abs(a - b) <= tol, (m || '') + ' ' + a + ' vs ' + b + ' (tol ' + tol + ')');

  // ---------- analyseur : priorites, fonctions, constantes, multiplication implicite ----------
  v('2+3*4 = 14', () => assert.equal(T.evaluer('2+3*4'), 14));
  v('2^3^2 = 512 (^ a droite)', () => assert.equal(T.evaluer('2^3^2'), 512));
  v('-2^2 = -4 (moins unaire sous ^)', () => assert.equal(T.evaluer('-2^2'), -4));
  v('(-2)^2 = 4', () => assert.equal(T.evaluer('(-2)^2'), 4));
  v('2^-1 = 0.5', () => assert.equal(T.evaluer('2^-1'), 0.5));
  v('2*-3 = -6, 2--3 = 5', () => { assert.equal(T.evaluer('2*-3'), -6); assert.equal(T.evaluer('2--3'), 5); });
  v('10/4/2 = 1.25 (gauche)', () => assert.equal(T.evaluer('10/4/2'), 1.25));
  v('8-3-2 = 3 (gauche)', () => assert.equal(T.evaluer('8-3-2'), 3));
  v('nombres 1e-3, .5, 2E+2', () => { assert.equal(T.evaluer('1e-3'), 0.001); assert.equal(T.evaluer('.5'), 0.5); assert.equal(T.evaluer('2E+2'), 200); });
  v('constantes pi, e, phi', () => { assert.equal(T.evaluer('pi'), Math.PI); assert.equal(T.evaluer('e'), Math.E); proche(T.evaluer('phi'), (1 + Math.sqrt(5)) / 2, 1e-15); proche(T.evaluer('phi^2-phi'), 1, 1e-14); });
  v('implicite : 2x, 3sin(t), 2(x+1), (x+1)(x-1), 2e', () => {
    assert.equal(T.evaluer('2x', { x: 3 }), 6); proche(T.evaluer('3sin(t)', { t: Math.PI / 2 }), 3, 1e-14);
    assert.equal(T.evaluer('2(x+1)', { x: 3 }), 8); assert.equal(T.evaluer('(x+1)(x-1)', { x: 3 }), 8); assert.equal(T.evaluer('2e'), 2 * Math.E);
  });
  v('fonctions a plusieurs arguments', () => { assert.equal(T.evaluer('max(1, 5, 3)'), 5); assert.equal(T.evaluer('min(4,-2)'), -2); assert.equal(T.evaluer('mod(-7, 3)'), 2); proche(T.evaluer('atan2(1, -1)'), 3 * Math.PI / 4, 1e-15); });
  v('abs floor sign', () => { assert.equal(T.evaluer('abs(-3)'), 3); assert.equal(T.evaluer('floor(-2.5)'), -3); assert.equal(T.evaluer('sign(-0.1)'), -1); assert.equal(T.evaluer('sign(0)'), 0); });
  v('parametres a..d bornes a [-100, 100]', () => { assert.equal(T.evaluer('a+b+c+d', { a: 1, b: 2, c: 3, d: 4 }), 10); assert.equal(T.evaluer('a', { a: 1e9 }), 100); assert.equal(T.evaluer('a', { a: -1e9 }), -100); });
  v('analyser liste les variables', () => { const a = T.analyser('a*x^2 + sin(t)'); assert.equal(a.ok, true); assert.deepEqual(a.variables, ['a', 't', 'x']); });
  v('erreur avec position', () => { const a = T.analyser('2+*3'); assert.equal(a.ok, false); assert.match(a.erreur, /position 3/); });
  v('parenthese non fermee', () => { const a = T.analyser('sin(x'); assert.equal(a.ok, false); assert.match(a.erreur, /\)/); });
  v('arite verifiee', () => { assert.equal(T.analyser('sin(1,2)').ok, false); assert.equal(T.analyser('mod(1)').ok, false); });
  v('variable hors mode refusee (t dans une courbe)', () => {
    const a = T.analyser('t+x', { autorisees: ['x', 'a', 'b', 'c', 'd'] }); assert.equal(a.ok, false); assert.match(a.erreur, /'t'/);
    const s = T.simulerFormule({ mode: 'courbe', expressions: { y: 't*x' } }); assert.equal(s.bornee, false); assert.equal(s.brut, null); assert.ok(s.erreurs.length === 1);
  });

  // ---------- surete : tout est REFUSE, rien n est execute ----------
  const MECHANTS = ['constructor', '__proto__', 'alert(1)', 'x.constructor', 'this', 'globalThis', 'process.exit()', "require('fs')", '`x`', '${x}', 'x;1', 'x=1',
    'toString', 'toString(1)', 'valueOf()', 'hasOwnProperty(x)', 'constructor(1)', 'eval(1)', 'Function(1)', 'import(1)', 'x[0]', '{}', 'new Date', 'a=>a', '"x"', 'x\u0000', 'x ',
    'x'.repeat(301), '('.repeat(100) + 'x' + ')'.repeat(100), 'sin('.repeat(41) + 'x' + ')'.repeat(41), Array(60).fill('x').join('+'), '', '   '];
  const avant = Object.keys(globalThis).length;
  for (const m of MECHANTS) {
    v('refuse : ' + JSON.stringify(m.length > 30 ? m.slice(0, 27) + '...(' + m.length + ')' : m), () => {
      const a = T.analyser(m); assert.equal(a.ok, false); assert.equal(typeof a.erreur, 'string'); assert.ok(a.erreur.length > 10); assert.equal(a.ast, undefined);
      assert.throws(() => T.racines(m, { a: 0, b: 1 }));
      const s = T.simulerFormule({ mode: 'courbe', expressions: { y: m } }); assert.equal(s.brut, null); assert.ok(s.erreurs.length >= 1);
    });
  }
  v('nom inconnu nomme dans le message', () => { const a = T.analyser('foo(x) + bar'); assert.equal(a.ok, false); assert.match(a.erreur, /'foo'/); assert.match(a.erreur, /'bar'/); });
  v('aucune globale creee', () => assert.equal(Object.keys(globalThis).length, avant));
  v('limites : 300 caracteres acceptes, 40 parentheses acceptees', () => {
    assert.equal(T.analyser('1+' + ' '.repeat(296) + 'x').ok, true);
    assert.equal(T.analyser('('.repeat(40) + 'x' + ')'.repeat(40)).ok, true);
    assert.equal(T.analyser('('.repeat(41) + 'x' + ')'.repeat(41)).ok, false);
  });
  v('source : aucun eval / Function / with / import dynamique / require', () => {
    for (const re of [/\beval\s*\(/, /\bFunction\s*\(/, /new\s+Function/, /\bwith\s*\(/, /\bimport\s*\(/, /\brequire\s*\(/, /setTimeout|setInterval/]) assert.ok(!re.test(src), 'trouve ' + re);
  });
  v('source : aucune transcendante native ni hasard', () => {
    const m = src.match(/Math\.(sin|cos|tan|exp|log|pow|atan|atan2|asin|acos|sinh|cosh|tanh|hypot|cbrt|expm1|log1p|log2|log10|random)\b/g);
    assert.equal(m, null, 'trouve ' + (m || []).join(', '));
  });

  // ---------- determinisme + accord avec Math (le banc seul appelle Math.*) ----------
  v('sin, cos, tan contre Math (1e-12)', () => {
    for (let k = 0; k <= 200; k++) { const x = -50 + k * 0.5013; proche(T.evaluer('sin(x)', { x }), Math.sin(x), 1e-12, 'sin'); proche(T.evaluer('cos(x)', { x }), Math.cos(x), 1e-12, 'cos'); }
    for (const x of [-1.3, -0.7, 0, 0.2, 1, 1.5]) proche(T.evaluer('tan(x)', { x }), Math.tan(x), 1e-12 * Math.max(1, Math.abs(Math.tan(x))), 'tan');
  });
  v('atan, asin, acos contre Math (1e-12)', () => {
    for (const x of [-1e6, -30, -2, -1, -0.999, -0.5, -1e-9, 0, 0.1, 0.4142, 0.9, 1, 1.7, 10, 1e8]) proche(T.evaluer('atan(x)', { x }), Math.atan(x), 1e-12, 'atan ' + x);
    for (const x of [-1, -0.9999, -0.5, 0, 0.3, 0.7071, 0.99999, 1]) { proche(T.evaluer('asin(x)', { x }), Math.asin(x), 1e-12, 'asin ' + x); proche(T.evaluer('acos(x)', { x }), Math.acos(x), 1e-12, 'acos ' + x); }
    assert.ok(Number.isNaN(T.evaluer('asin(x)', { x: 1.5 })));
  });
  v('exp, ln, sinh, cosh, tanh, cbrt, x^0.5 contre Math (relatif 1e-13)', () => {
    const rel = (a, b, m) => proche(a, b, 1e-13 * Math.max(1, Math.abs(b)), m);
    for (const x of [-20, -3.3, -0.4, -1e-7, 0, 1e-7, 0.3, 0.49, 0.51, 2, 7.5, 30]) {
      rel(T.evaluer('exp(x)', { x }), Math.exp(x), 'exp ' + x); rel(T.evaluer('sinh(x)', { x }), Math.sinh(x), 'sinh ' + x);
      rel(T.evaluer('cosh(x)', { x }), Math.cosh(x), 'cosh ' + x); rel(T.evaluer('tanh(x)', { x }), Math.tanh(x), 'tanh ' + x); rel(T.evaluer('cbrt(x)', { x }), Math.cbrt(x), 'cbrt ' + x);
    }
    for (const x of [1e-9, 0.5, 1, 2, 10, 12345.678]) { proche(T.evaluer('ln(x)', { x }), Math.log(x), 1e-13, 'ln ' + x); rel(T.evaluer('x^0.5', { x }), Math.sqrt(x), 'x^0.5 ' + x); }
    assert.ok(Number.isNaN(T.evaluer('(-8)^(1/3)'))); proche(T.evaluer('cbrt(-8)'), -2, 1e-15);
  });
  v('meme spec -> memes octets (systeme, courbe, parametrique, surface)', () => {
    const specs = [{ mode: 'systeme', expressions: { x: LORENZ[0], y: LORENZ[1], z: LORENZ[2] } }, { mode: 'courbe', expressions: { y: 'a*sin(3x)/x' }, intervalle: [-9, 9], vars: { a: 2 } },
      { mode: 'parametrique', expressions: { x: 'cos(t)', y: 'sin(t)', z: 't/5' } }, { mode: 'surface', expressions: { z: 'exp(-(x^2+y^2)/4)*cos(2x)' } }];
    for (const s of specs) {
      const A = T.simulerFormule(s), B = T.simulerFormule(JSON.parse(JSON.stringify(s)));
      assert.ok(A.brut && A.brut.length > 0);
      assert.ok(Buffer.from(A.brut.buffer, A.brut.byteOffset, A.brut.byteLength).equals(Buffer.from(B.brut.buffer, B.brut.byteOffset, B.brut.byteLength)), 'octets differents ' + s.mode);
      assert.equal(A.lyapunov, B.lyapunov);
    }
  });

  // ---------- solveurs contre les valeurs connues ----------
  v('racines x^2-2 sur [0,2] = sqrt 2 (1e-10), residu < 1e-10', () => {
    const R = T.racines('x^2-2', { a: 0, b: 2 }); assert.equal(R.length, 1); proche(R[0].x, Math.SQRT2, 1e-10); assert.ok(Math.abs(R[0].fx) < 1e-10);
    assert.equal(R[0].fx, R[0].x * R[0].x - 2, 'fx = residu relu sur la formule');
    if (mesures) mesures.sqrt2 = Math.abs(R[0].x - Math.SQRT2);
  });
  v('racines sin(x) sur [1,10] = pi, 2pi, 3pi', () => {
    const R = T.racines('sin(x)', { a: 1, b: 10 }); assert.equal(R.length, 3);
    let pire = 0; R.forEach((r, k) => { proche(r.x, (k + 1) * Math.PI, 1e-10); assert.ok(Math.abs(r.fx) < 1e-10); pire = Math.max(pire, Math.abs(r.x - (k + 1) * Math.PI)); });
    if (mesures) mesures.kpi = pire;
  });
  v('racines x^3-x = -1, 0, 1 (grilles decalees)', () => {
    for (const [a, b] of [[-2, 2], [-2, 2.1], [-1.7, 3.3]]) { const R = T.racines('x^3 - x', { a, b }); assert.deepEqual(R.length, 3, a + ',' + b); [-1, 0, 1].forEach((x0, k) => proche(R[k].x, x0, 1e-10)); }
  });
  v('racine tangente (x-0.3)^2 -> 0.3 (double)', () => {
    const R = T.racines('(x-0.3)^2', { a: -1, b: 1 }); assert.equal(R.length, 1); proche(R[0].x, 0.3, 1e-9); assert.match(R[0].methode, /tangent/);
    const R2 = T.racines('x^4 - 2x^2 + 1', { a: -2, b: 2.05 }); assert.equal(R2.length, 2); proche(R2[0].x, -1, 1e-6); proche(R2[1].x, 1, 1e-6);
  });
  v('deux racines dans une seule maille (x-0.3)^2 - 1e-10', () => {
    const R = T.racines('(x-0.3)^2 - 1e-10', { a: -1, b: 1 }); assert.equal(R.length, 2); proche(R[0].x, 0.3 - 1e-5, 1e-12); proche(R[1].x, 0.3 + 1e-5, 1e-12);
  });
  v('poles rejetes : 1/x n a pas de racine, tan sur [1,5] -> pi seul', () => {
    assert.equal(T.racines('1/x', { a: -1, b: 2 }).length, 0);
    const R = T.racines('tan(x)', { a: 1, b: 5 }); assert.equal(R.length, 1); proche(R[0].x, Math.PI, 1e-10);
  });
  v('parametre a : a*x - 1 avec a = 4 -> 0.25', () => { const R = T.racines('a*x - 1', { a: -1, b: 1, vars: { a: 4 } }); assert.equal(R.length, 1); proche(R[0].x, 0.25, 1e-12); });
  v('intersections cos(x) = x -> 0.739085133215', () => {
    const R = T.intersections('cos(x)', 'x', { a: -3, b: 3 }); assert.equal(R.length, 1); proche(R[0].x, 0.7390851332151607, 1e-10); assert.ok(Math.abs(R[0].fx) < 1e-10); proche(R[0].y, R[0].x, 1e-10);
    if (mesures) mesures.dottie = Math.abs(R[0].x - 0.7390851332151607);
  });
  v('extremums x^3-3x -> max en -1 (2), min en 1 (-2)', () => {
    const X = T.extremums('x^3-3x', { a: -3, b: 3 }); assert.equal(X.length, 2);
    assert.equal(X[0].type, 'max'); proche(X[0].x, -1, 1e-6); proche(X[0].fx, 2, 1e-10); assert.ok(Math.abs(X[0].derivee) < 1e-5);
    assert.equal(X[1].type, 'min'); proche(X[1].x, 1, 1e-6); proche(X[1].fx, -2, 1e-10); assert.ok(Math.abs(X[1].derivee) < 1e-5);
    if (mesures) mesures.extremum = Math.max(Math.abs(X[0].x + 1), Math.abs(X[1].x - 1));
  });
  v('extremums cos sur [0.5, 10] -> pi (min), 2pi (max), 3pi (min)', () => {
    const X = T.extremums('cos(x)', { a: 0.5, b: 10 }); assert.deepEqual(X.map((e) => e.type), ['min', 'max', 'min']);
    X.forEach((e, k) => proche(e.x, (k + 1) * Math.PI, 1e-6));
  });
  v('integrale sin sur [0, pi] = 2 (1e-9), erreur estimee coherente', () => {
    const I = T.integrale('sin(x)', { a: 0, b: Math.PI }); proche(I.valeur, 2, 1e-9); assert.ok(I.erreurEstimee >= 0 && I.erreurEstimee < 1e-8); assert.equal(I.erreur, undefined);
    if (mesures) mesures.integrale = Math.abs(I.valeur - 2);
  });
  v('integrale exp(-x^2) sur [-6,6] = sqrt(pi) ; x^2 sur [0,3] = 9', () => {
    proche(T.integrale('exp(-x^2)', { a: -6, b: 6 }).valeur, Math.sqrt(Math.PI), 1e-9); proche(T.integrale('x^2', { a: 0, b: 3 }).valeur, 9, 1e-12);
  });

  // ---------- systeme : Lorenz tape par l utilisateur ----------
  let L = null;
  v('Lorenz : borne, n*3 finis, Lyapunov dans [0.5, 1.2]', () => {
    const t0 = performance.now();
    L = T.simulerFormule({ mode: 'systeme', expressions: { x: LORENZ[0], y: LORENZ[1], z: LORENZ[2] }, depart: [1, 1, 1], dt: 0.01, pas: 4 }, { n: 1500 });
    const ms = performance.now() - t0;
    assert.equal(L.bornee, true); assert.equal(L.D, 3); assert.equal(L.n, 1500); assert.equal(L.brut.length, 4500); assert.ok(L.brut.every(Number.isFinite));
    assert.ok(L.lyapunov > 0.5 && L.lyapunov < 1.2, 'lyapunov ' + L.lyapunov); assert.deepEqual(L.erreurs, []);
    assert.ok(ms < 200, 'systeme n=1500 en ' + ms + ' ms');
    if (mesures) { mesures.lyapunov = L.lyapunov; mesures.msSysteme = ms; }
  });
  v('Lorenz : divergence du champ = -41/3 (verification)', () => { proche(L.invariants.divergence.moyenne, -41 / 3, 1e-6); proche(L.invariants.divergence.min, -41 / 3, 1e-6); proche(L.invariants.divergence.max, -41 / 3, 1e-6); });
  v('Lorenz : equilibres (0,0,0), (+-sqrt72, +-sqrt72, 27), residu < 1e-9, origine = selle', () => {
    const Q = T.equilibres(LORENZ[0], LORENZ[1], LORENZ[2]); assert.equal(Q.length, 3);
    const att = [[-S72, -S72, 27], [0, 0, 0], [S72, S72, 27]];
    Q.forEach((q, k) => { proche(q.x, att[k][0], 1e-9); proche(q.y, att[k][1], 1e-9); proche(q.z, att[k][2], 1e-9); assert.ok(q.residu < 1e-9, 'residu ' + q.residu); });
    assert.equal(Q[1].type, 'saddle'); assert.equal(Q[0].type, 'saddle-focus'); assert.equal(Q[2].type, 'saddle-focus');
    const vp = Q[1].valeursPropres.map((e) => e.re), s = Math.sqrt(121 + 4 * 270);
    proche(vp[0], (-11 - s) / 2, 1e-6); proche(vp[1], -8 / 3, 1e-6); proche(vp[2], (-11 + s) / 2, 1e-6);
    if (mesures) mesures.eqResidu = Math.max(...Q.map((q) => q.residu));
  });
  v('equilibres : aucun pour dx/dt = 1 + x^2 (Newton non converge -> rejete)', () => assert.deepEqual(T.equilibres('1 + x^2', 'y', 'z'), []));
  v('equilibres : noeud stable, spirale stable, noeud instable', () => {
    assert.equal(T.equilibres('-x', '-2y', '-3z')[0].type, 'stable node');
    assert.equal(T.equilibres('-0.1x - y', 'x - 0.1y', '-z')[0].type, 'stable spiral (focus)');
    assert.equal(T.equilibres('x', '2y', '3z')[0].type, 'unstable node');
  });
  v('echappement : dx/dt = x^2 -> bornee false avec le point d echappement', () => {
    const s = T.simulerFormule({ mode: 'systeme', expressions: { x: 'x^2', y: '0', z: '0' }, depart: [1, 0, 0], dt: 0.01, pas: 4 });
    assert.equal(s.bornee, false); assert.ok(s.echappeA > 0 && s.echappeA < 40, 'echappeA ' + s.echappeA); assert.ok(s.erreurs.length === 1);
  });

  // ---------- courbe, parametrique, surface ----------
  v('parametrique : helice n*3 finis', () => {
    const s = T.simulerFormule({ mode: 'parametrique', expressions: { x: 'cos(t)', y: 'sin(t)', z: 't/5' }, intervalle: [0, 20] }, { n: 800 });
    assert.equal(s.bornee, true); assert.equal(s.n, 800); assert.equal(s.brut.length, 2400); assert.ok(s.brut.every(Number.isFinite));
    for (let i = 0; i < 800; i += 97) proche(s.brut[3 * i] ** 2 + s.brut[3 * i + 1] ** 2, 1, 1e-14);
  });
  v('courbe : n*3 finis, z = 0', () => {
    const s = T.simulerFormule({ mode: 'courbe', expressions: { y: 'x^2 - 3' }, intervalle: [-2, 2] }, { n: 1000 });
    assert.equal(s.n, 1000); assert.equal(s.brut.length, 3000); assert.ok(s.brut.every(Number.isFinite));
    for (let i = 0; i < 1000; i += 111) { assert.equal(s.brut[3 * i + 2], 0); assert.equal(s.brut[3 * i + 1], s.brut[3 * i] ** 2 - 3); }
  });
  v('courbe : division par zero -> point retire et compte', () => {
    const s = T.simulerFormule({ mode: 'courbe', expressions: { y: '1/x' }, intervalle: [-1, 1] }, { n: 3 });
    assert.equal(s.n, 2); assert.equal(s.rejets.nonFinis, 1); assert.ok(s.erreurs.some((m) => /dropped/.test(m)));
  });
  v('surface : nuage sur grille', () => {
    const s = T.simulerFormule({ mode: 'surface', expressions: { z: 'x*y' }, intervalle: [-1, 1], intervalleY: [-1, 1] }, { n: 400 });
    assert.equal(s.nuage, true); assert.equal(s.n, 400); assert.ok(s.brut.every(Number.isFinite));
  });
  v('MODES expose les 4 modes', () => assert.deepEqual(T.MODES.map((m) => m.id), ['courbe', 'parametrique', 'systeme', 'surface']));

  // ---------- temps ----------
  v('racines d une fonction chargee < 100 ms', () => {
    const t0 = performance.now(); const R = T.racines('sin(50x)*exp(-x^2/20) + 0.1*cos(7x)', { a: -10, b: 10 }); const ms = performance.now() - t0;
    assert.ok(R.length > 100, 'racines ' + R.length); assert.ok(R.every((q) => Math.abs(q.fx) < 1e-10)); assert.ok(ms < 100, ms + ' ms');
    if (mesures) { mesures.msRacines = ms; mesures.nRacines = R.length; }
  });
  return r;
}

// ---------- module original ----------
const brut = readFileSync(SOURCE, 'utf8');
const mesures = {};
const T = await import(pathToFileURL(SOURCE).href);
const res = suite(T, brut, mesures);
const ech = res.filter((x) => !x.ok);
let assertions = res.length;
console.log('MESURES :');
for (const [k, val] of Object.entries(mesures)) console.log('  ' + k + ' = ' + (typeof val === 'number' ? val.toPrecision(4) : val));

// ---------- mutants (copies ; l import du moteur pointe vers l original) ----------
const MUTANTS = [
  ['^ casse (exposant sans recursion : 2^3^2 refuse, 2^-1 refuse)', 'const exposant = unaire();', 'const exposant = primaire();'],
  ['bissection arretee tot (1e-6)', 'TOL_BISSECTION = 1e-12', 'TOL_BISSECTION = 1e-6'],
  ['Newton sans verification du residu', 'if (!(res <= TOL_EQ)) continue;', ''],
  ['Math.sin injecte', 'sin: { n: 1, f: sinD }', 'sin: { n: 1, f: Math.sin }'],
  ['racines tangentes retirees', "else if (Math.abs(fm) <= tolT) pousser(xm, 'tangent root: golden-section on |f|');", ''],
  ['filtre des poles retire', 'if (Math.abs(fx) <= Math.max(Math.abs(flo), Math.abs(fhi))) pousser(x, methode);', 'pousser(x, methode);'],
  ['Lyapunov sans renormalisation', 'e[j] = y[j] + (e[j] - y[j]) * D0 / d;', 'e[j] = e[j];'],
  ['liste blanche des variables par mode ignoree', 'if (a_(EMPLACEMENTS, nom) && autorisees.includes(nom))', 'if (a_(EMPLACEMENTS, nom))'],
  ['Simpson tolerance relachee', 'if (Math.abs(delta) <= 15 * eps)', 'if (Math.abs(delta) <= 15e6 * eps)'],
  ['moins unaire au-dessus de ^ (-2^2 = 4)', "if (t && t.t === '-') { i++; return noeud({ k: 'u', a: unaire() }); }", "if (t && t.t === '-') { i++; const b = primaire(); return puissApres(noeud({ k: 'u', a: b })); }\n    function puissApres(b) { const t = voir(); if (t && t.t === '^') { i++; return noeud({ k: 'b', op: '^', a: b, b: unaire() }); } return b; }"],
];
const moteur = pathToFileURL(join(ICI, 'tam-moteur.js')).href;
const dossier = mkdtempSync(join(process.env.TAM_TMP || tmpdir(), 'tam-formule-mutants-'));
let tues = 0;
console.log('\nMUTANTS :');
try {
  for (let i = 0; i < MUTANTS.length; i++) {
    const [nom, de, vers] = MUTANTS[i], k = brut.split(de).length - 1;
    if (k !== 1) { console.log(`  M${i + 1} ${nom} : NON APPLIQUE (motif trouve ${k} fois) -> SURVIVANT`); continue; }
    const f = join(dossier, `mutant-${i + 1}.mjs`), code = brut.replace(de, vers).replace("from './tam-moteur.js'", `from '${moteur}'`);
    writeFileSync(f, code);
    let r; try { r = suite(await import(pathToFileURL(f).href), code); } catch (e) { r = [{ nom: 'exception: ' + e.message, ok: false }]; }
    const rouges = r.filter((x) => !x.ok);
    if (rouges.length) tues++;
    console.log(`  M${i + 1} ${nom} : ${rouges.length ? 'TUE' : 'SURVIT'} (${rouges.length} rouges${rouges.length ? ', ex: ' + rouges.slice(0, 2).map((x) => x.nom).join(' | ') : ''})`);
  }
} finally { rmSync(dossier, { recursive: true, force: true }); }
assertions++; if (tues !== MUTANTS.length) ech.push({ nom: 'mutants', det: `${tues}/${MUTANTS.length}` });
console.log(`\nMUTANTS : ${tues}/${MUTANTS.length} tues`);
if (ech.length) { console.log('\nECHECS :'); for (const e of ech) console.log('  ' + e.nom + '  ' + (e.det || '')); process.exit(1); }
console.log(`test-tam-formule-20261101 : ${assertions} assertions OK`);
