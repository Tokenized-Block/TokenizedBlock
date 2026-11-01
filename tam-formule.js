// tam-formule.js -- TAM, la vue FORMULE : l utilisateur tape SA formule, on la dessine en 3-D et on « resout » dessus.
//
// VUE SEULEMENT : rien ici ne se frappe. Sortie de simulerFormule() = la forme de tam-physique.js#simuler :
//   { params, D: 3, n, bornee, brut (Float64Array n*3), lyapunov, uniteLyapunov, nuage?, points: null, invariants, rejets, erreurs }
//   -> la vue 3-D la dessine sans changement.
//
// SURETE : la formule n est JAMAIS executee comme du code. Lexeur ecrit a la main (liste blanche de caracteres) -> analyseur
//   a descente recursive -> arbre (AST) -> petit interprete (arbre de fermetures). Aucune evaluation dynamique de texte, aucun
//   acces de propriete : un nom n est accepte que s il est dans une table a prototype nul (fonctions, constantes, variables).
//   Limites : 300 caracteres, profondeur d arbre 40, imbrication de parentheses 40, 400 noeuds.
//
// DETERMINISME : aucune fonction transcendante native (la norme JS ne fixe pas leurs bits). sin/cos/ln = ceux du moteur ;
//   exp, atan, tan, asin, acos, sinh, cosh, tanh, cbrt, puissance = ici, avec + - * / et Math.sqrt/floor/round/abs (IEEE exacts).
//   Meme spec -> memes octets sur tous les moteurs.
//
// GRAMMAIRE (priorites croissantes) :
//   somme   := terme (('+' | '-') terme)*
//   terme   := unaire (('*' | '/') unaire | <multiplication implicite> unaire)*
//   unaire  := ('-' | '+') unaire | puiss
//   puiss   := primaire ('^' unaire)?            -> ^ associatif a droite : 2^3^2 = 2^9 = 512 ; 2^-1 = 0.5
//   primaire:= nombre | constante | variable | fonction '(' somme (',' somme)* ')' | '(' somme ')'
//   Convention : le moins unaire est MOINS prioritaire que ^ : -2^2 = -(2^2) = -4 (comme en mathematiques).
//   Multiplication implicite : seulement APRES un nombre ou une parenthese fermante, devant un nom ou '(' :
//     2x, 3sin(t), 2(x+1), (x+1)(x-1), (x+1)x. Pas entre deux noms (« xy » est un nom inconnu, ecrire x*y).
//     2^3x = (2^3)*x. Un nombre : 12, 1.5, .5, 1e-3, 2E+4 ; « 2e » = 2*e (e suivi d un chiffre seulement = exposant).
//
// SOLVEURS : NUMERIQUES, pas symboliques. Chaque reponse porte sa verification relue sur la vraie formule (residu f(x),
//   derivee aux differences finies, norme de F a l equilibre, erreur estimee de Simpson).
import { sinD, cosD, lnD } from './tam-moteur.js';

const PI = 3.141592653589793, PI_2 = 1.5707963267948966, LN2 = 0.6931471805599453, LN10 = 2.302585092994046;
const PHI = 1.618033988749895, E_ = 2.718281828459045;
const D0 = 1e-8, BORNE = 1e6;
export const LIMITES = Object.freeze({ longueur: 300, profondeur: 40, noeuds: 400, parentheses: 40 });
const BORNE_VAR = 100, BORNE_INTERVALLE = 1e4;
const TOL_BISSECTION = 1e-12, TOL_DOREE = 1e-12, TOL_EQ = 1e-10;

// ---------- arithmetique deterministe ----------
function expD(x) { /* e^x avec + - * / seulement (meme fonction que tam-physique.js) */
  if (x === -Infinity) return 0;
  if (!(x - x === 0)) return NaN;
  const k = Math.round(x / LN2), r = x - k * LN2; let t = 1, s = 1;
  for (let i = 1; i <= 22; i++) { t *= r / i; s += t; }
  return k < -1070 ? 0 : s * 2 ** k;
}
function atanD(x) { /* reduction : |x| > 1 -> pi/2 - atan(1/x) ; trois demi-angles x/(1+sqrt(1+x^2)) ; serie de Taylor */
  if (x !== x) return NaN;
  if (x === Infinity) return PI_2;
  if (x === -Infinity) return -PI_2;
  let s = 1; if (x < 0) { x = -x; s = -1; }
  let inv = false; if (x > 1) { x = 1 / x; inv = true; }
  for (let i = 0; i < 3; i++) x = x / (1 + Math.sqrt(1 + x * x));
  const x2 = x * x; let t = x, r = x;
  for (let k = 1; k <= 15; k++) { t *= -x2; r += t / (2 * k + 1); }
  r *= 8;
  if (inv) r = PI_2 - r;
  return s * r;
}
function atan2D(y, x) {
  if (y !== y || x !== x) return NaN;
  if (x > 0) return atanD(y / x);
  if (x < 0) return y >= 0 ? atanD(y / x) + PI : atanD(y / x) - PI;
  return y > 0 ? PI_2 : y < 0 ? -PI_2 : 0;
}
function asinD(x) {
  if (!(x >= -1 && x <= 1)) return NaN;
  if (x === 1) return PI_2;
  if (x === -1) return -PI_2;
  return atanD(x / Math.sqrt((1 - x) * (1 + x)));
}
function acosD(x) { /* 2 atan(sqrt((1-x)/(1+x))) : precis pres de 1, vaut pi en -1 */
  if (!(x >= -1 && x <= 1)) return NaN;
  return 2 * atanD(Math.sqrt((1 - x) / (1 + x)));
}
function tanD(x) { return sinD(x) / cosD(x); }
function sinhD(x) {
  if (Math.abs(x) < 0.5) { const x2 = x * x; let t = x, s = x; for (let k = 1; k <= 12; k++) { t *= x2 / ((2 * k) * (2 * k + 1)); s += t; } return s; }
  const u = expD(x); return (u - 1 / u) / 2;
}
function coshD(x) { const u = expD(x); return (u + 1 / u) / 2; }
function tanhD(x) {
  if (x !== x) return NaN;
  if (x > 20) return 1;
  if (x < -20) return -1;
  if (Math.abs(x) < 0.5) return sinhD(x) / coshD(x);
  const u = expD(2 * x); return (u - 1) / (u + 1);
}
function cbrtD(x) {
  if (x === 0 || x !== x || x === Infinity || x === -Infinity) return x;
  const s = x < 0 ? -1 : 1, a = s * x; let r = expD(lnD(a) / 3);
  r -= (r * r * r - a) / (3 * r * r);
  return s * r;
}
/* x^y : exposant entier -> exponentiation binaire (multiplications seulement) ; sinon exp(y ln x) pour x > 0 ; 0^0 = 1 */
function puissance(x, y) {
  if (y === 0) return 1;
  if (Number.isInteger(y) && Math.abs(y) <= 2147483647) {
    let n = Math.abs(y), b = x, r = 1;
    while (n > 0) { if (n % 2 === 1) r *= b; n = Math.floor(n / 2); if (n > 0) b *= b; }
    return y < 0 ? 1 / r : r;
  }
  if (x > 0) return expD(y * lnD(x));
  if (x === 0) return y > 0 ? 0 : Infinity;
  return NaN;
}
const signe = (x) => (x > 0 ? 1 : x < 0 ? -1 : x);
const modulo = (a, b) => (b === 0 ? NaN : a - b * Math.floor(a / b));
const nb = (v) => (typeof v === 'number' ? v : NaN);

/* table des fonctions : prototype NUL, gelee ; n = arite exacte, ou [min, max] */
const FONCTIONS = Object.freeze(Object.assign(Object.create(null), {
  sin: { n: 1, f: sinD }, cos: { n: 1, f: cosD }, tan: { n: 1, f: tanD },
  asin: { n: 1, f: asinD }, acos: { n: 1, f: acosD }, atan: { n: 1, f: atanD }, atan2: { n: 2, f: atan2D },
  sinh: { n: 1, f: sinhD }, cosh: { n: 1, f: coshD }, tanh: { n: 1, f: tanhD },
  exp: { n: 1, f: expD }, ln: { n: 1, f: lnD }, log: { n: 1, f: lnD }, log10: { n: 1, f: (x) => lnD(x) / LN10 },
  sqrt: { n: 1, f: (x) => Math.sqrt(x) }, cbrt: { n: 1, f: cbrtD }, abs: { n: 1, f: (x) => Math.abs(x) },
  floor: { n: 1, f: (x) => Math.floor(x) }, ceil: { n: 1, f: (x) => Math.ceil(x) }, round: { n: 1, f: (x) => Math.round(x) },
  sign: { n: 1, f: signe }, mod: { n: 2, f: modulo }, pow: { n: 2, f: puissance },
  min: { n: [1, 8], f: (...a) => Math.min(...a) }, max: { n: [1, 8], f: (...a) => Math.max(...a) },
}));
const CONSTANTES = Object.freeze(Object.assign(Object.create(null), { pi: PI, e: E_, phi: PHI }));
/* emplacements fixes de l environnement d evaluation (Float64Array) */
const EMPLACEMENTS = Object.freeze(Object.assign(Object.create(null), { x: 0, y: 1, z: 2, t: 3, a: 4, b: 5, c: 6, d: 7 }));
const PARAMS = ['a', 'b', 'c', 'd'];
const a_ = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
export const FONCTIONS_DISPONIBLES = Object.freeze(Object.keys(FONCTIONS));
export const CONSTANTES_DISPONIBLES = Object.freeze(Object.keys(CONSTANTES));

// ---------- lexeur (liste blanche) ----------
class ErreurFormule extends Error {}
const chiffre = (c) => c >= '0' && c <= '9';
const lettre = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
function decrireCar(c) {
  const k = c.charCodeAt(0);
  return k < 32 || k > 126 ? 'character code ' + k : "'" + c + "'";
}
function lexer(s) {
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (chiffre(c) || (c === '.' && chiffre(s[i + 1] || ''))) {
      const p = i;
      while (chiffre(s[i] || '')) i++;
      if (s[i] === '.') { i++; while (chiffre(s[i] || '')) i++; }
      if ((s[i] === 'e' || s[i] === 'E') && (chiffre(s[i + 1] || '') || ((s[i + 1] === '+' || s[i + 1] === '-') && chiffre(s[i + 2] || '')))) {
        i += 2; while (chiffre(s[i] || '')) i++;
      }
      const v = Number(s.slice(p, i));
      if (!Number.isFinite(v)) throw new ErreurFormule('The number at position ' + (p + 1) + ' is too large.');
      toks.push({ t: 'num', v, p: p + 1 });
      continue;
    }
    if (lettre(c)) {
      const p = i;
      while (lettre(s[i] || '') || chiffre(s[i] || '')) i++;
      toks.push({ t: 'id', v: s.slice(p, i), p: p + 1 });
      continue;
    }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '^' || c === '(' || c === ')' || c === ',') { toks.push({ t: c, v: c, p: i + 1 }); i++; continue; }
    throw new ErreurFormule('The character ' + decrireCar(c) + ' at position ' + (i + 1) + ' is not allowed. Use numbers, names, + - * / ^ ( ) and commas.');
  }
  return toks;
}

// ---------- analyseur a descente recursive ----------
function parser(source, autorisees) {
  const toks = lexer(source);
  let i = 0, noeuds = 0, parentheses = 0;
  const inconnus = [];
  const voir = () => toks[i] || null;
  const fin = () => (toks.length ? toks[toks.length - 1].p + 1 : 1);
  const noeud = (n) => { if (++noeuds > LIMITES.noeuds) throw new ErreurFormule('The formula is too long (more than ' + LIMITES.noeuds + ' parts).'); return n; };
  const attendu = (quoi) => { const t = voir(); throw new ErreurFormule('Expected ' + quoi + (t ? " but found '" + t.v + "' at position " + t.p : ' at the end (position ' + fin() + ')') + '.'); };
  function somme() {
    let g = terme();
    for (let t = voir(); t && (t.t === '+' || t.t === '-'); t = voir()) { i++; g = noeud({ k: 'b', op: t.t, a: g, b: terme() }); }
    return g;
  }
  function terme() {
    let g = unaire();
    for (;;) {
      const t = voir();
      if (t && (t.t === '*' || t.t === '/')) { i++; g = noeud({ k: 'b', op: t.t, a: g, b: unaire() }); continue; }
      const prec = toks[i - 1];
      if (t && (t.t === 'id' || t.t === '(') && prec && (prec.t === 'num' || prec.t === ')')) { g = noeud({ k: 'b', op: '*', a: g, b: unaire() }); continue; }
      return g;
    }
  }
  function unaire() {
    const t = voir();
    if (t && t.t === '-') { i++; return noeud({ k: 'u', a: unaire() }); }
    if (t && t.t === '+') { i++; return unaire(); }
    return puiss();
  }
  function puiss() {
    const base = primaire();
    const t = voir();
    if (t && t.t === '^') { i++; const exposant = unaire(); return noeud({ k: 'b', op: '^', a: base, b: exposant }); }
    return base;
  }
  function primaire() {
    const t = voir();
    if (!t) attendu('a number, a name or (');
    if (t.t === 'num') { i++; return noeud({ k: 'n', v: t.v }); }
    if (t.t === '(') {
      if (++parentheses > LIMITES.parentheses) throw new ErreurFormule('Too many nested parentheses (more than ' + LIMITES.parentheses + ').');
      i++; const e = somme();
      if (!voir() || voir().t !== ')') attendu("')' to close the '(' at position " + t.p);
      i++; parentheses--;
      return e;
    }
    if (t.t === 'id') {
      i++;
      const nom = t.v, suivant = voir();
      if (suivant && suivant.t === '(') {
        if (++parentheses > LIMITES.parentheses) throw new ErreurFormule('Too many nested parentheses (more than ' + LIMITES.parentheses + ').');
        i++;
        const args = [];
        if (voir() && voir().t === ')') attendu('a value inside ' + nom + '( )');
        args.push(somme());
        while (voir() && voir().t === ',') { i++; args.push(somme()); }
        if (!voir() || voir().t !== ')') attendu("')' to close " + nom + '( at position ' + t.p);
        i++; parentheses--;
        if (!a_(FONCTIONS, nom)) { inconnus.push({ nom, p: t.p, fonction: true }); return noeud({ k: 'n', v: NaN }); }
        const ar = FONCTIONS[nom].n, [mi, ma] = Array.isArray(ar) ? ar : [ar, ar];
        if (args.length < mi || args.length > ma) throw new ErreurFormule(nom + ' takes ' + (mi === ma ? mi : mi + ' to ' + ma) + ' value' + (ma > 1 ? 's' : '') + ', not ' + args.length + ' (position ' + t.p + ').');
        return noeud({ k: 'f', nom, args });
      }
      if (a_(FONCTIONS, nom)) throw new ErreurFormule(nom + ' is a function: write ' + nom + '(...) (position ' + t.p + ').');
      if (a_(CONSTANTES, nom)) return noeud({ k: 'n', v: CONSTANTES[nom], nom });
      if (a_(EMPLACEMENTS, nom) && autorisees.includes(nom)) return noeud({ k: 'v', nom, i: EMPLACEMENTS[nom] });
      inconnus.push({ nom, p: t.p, variable: a_(EMPLACEMENTS, nom) });
      return noeud({ k: 'n', v: NaN });
    }
    if (t.t === ')') throw new ErreurFormule("Unexpected ')' at position " + t.p + '.');
    attendu('a number, a name or (');
  }
  if (!toks.length) throw new ErreurFormule('The formula is empty.');
  const ast = somme();
  if (i < toks.length) {
    const t = toks[i];
    throw new ErreurFormule("Unexpected '" + t.v + "' at position " + t.p + (t.t === 'num' ? ' (write * between numbers)' : t.t === 'id' ? ' (write * between names, e.g. x*y)' : '') + '.');
  }
  if (inconnus.length) {
    const noms = inconnus.map((u) => "'" + u.nom + "' (position " + u.p + ')').join(', ');
    const pasIci = inconnus.filter((u) => u.variable).map((u) => u.nom);
    throw new ErreurFormule('Unknown name' + (inconnus.length > 1 ? 's' : '') + ': ' + noms + '.'
      + (pasIci.length ? ' ' + [...new Set(pasIci)].join(', ') + ' cannot be used here.' : '')
      + ' Allowed variables: ' + autorisees.join(', ') + '; constants: pi, e, phi; functions: ' + FONCTIONS_DISPONIBLES.join(', ') + '.');
  }
  const prof = profondeur(ast);
  if (prof > LIMITES.profondeur) throw new ErreurFormule('The formula is nested too deeply (depth ' + prof + ', limit ' + LIMITES.profondeur + ').');
  return { ast, noeuds };
}
function profondeur(n) {
  if (n.k === 'n' || n.k === 'v') return 1;
  if (n.k === 'u') return 1 + profondeur(n.a);
  if (n.k === 'b') return 1 + Math.max(profondeur(n.a), profondeur(n.b));
  let m = 0; for (const a of n.args) m = Math.max(m, profondeur(a)); return 1 + m;
}
function variablesDe(n, acc) {
  if (n.k === 'v') acc.add(n.nom);
  else if (n.k === 'u') variablesDe(n.a, acc);
  else if (n.k === 'b') { variablesDe(n.a, acc); variablesDe(n.b, acc); }
  else if (n.k === 'f') for (const a of n.args) variablesDe(a, acc);
  return acc;
}

/** analyser(texte, { autorisees }) -> { ok, ast?, variables: [...], erreur?: message anglais avec position } ; ne leve jamais */
export function analyser(texte, { autorisees = ['x', 'y', 'z', 't', ...PARAMS] } = {}) {
  if (typeof texte !== 'string') return { ok: false, variables: [], erreur: 'The formula must be text.' };
  if (texte.length > LIMITES.longueur) return { ok: false, variables: [], erreur: 'The formula is too long (' + texte.length + ' characters, limit ' + LIMITES.longueur + ').' };
  try {
    const { ast, noeuds } = parser(texte, autorisees);
    return { ok: true, ast, noeuds, profondeur: profondeur(ast), variables: [...variablesDe(ast, new Set())].sort() };
  } catch (e) {
    if (e instanceof ErreurFormule) return { ok: false, variables: [], erreur: e.message };
    if (e instanceof RangeError) return { ok: false, variables: [], erreur: 'The formula is nested too deeply.' };
    throw e;
  }
}

// ---------- interprete : AST -> arbre de fermetures sur un environnement Float64Array(8) ----------
function compiler(n) {
  switch (n.k) {
    case 'n': { const v = n.v; return () => v; }
    case 'v': { const j = n.i; return (E) => E[j]; }
    case 'u': { const f = compiler(n.a); return (E) => -f(E); }
    case 'b': {
      const f = compiler(n.a), g = compiler(n.b);
      switch (n.op) {
        case '+': return (E) => f(E) + g(E);
        case '-': return (E) => f(E) - g(E);
        case '*': return (E) => f(E) * g(E);
        case '/': return (E) => f(E) / g(E);
        case '^': return (E) => puissance(f(E), g(E));
      }
      break;
    }
    case 'f': {
      const F = FONCTIONS[n.nom].f, A = n.args.map(compiler);
      if (A.length === 1) { const p = A[0]; return (E) => nb(F(p(E))); }
      if (A.length === 2) { const p = A[0], q = A[1]; return (E) => nb(F(p(E), q(E))); }
      return (E) => nb(F(...A.map((p) => p(E))));
    }
  }
  throw new Error('noeud inconnu');
}
/* texte -> fonction (E) => nombre ; leve ErreurFormule (message anglais) si la formule est refusee */
function preparer(texte, autorisees, etiquette) {
  const r = analyser(texte, { autorisees });
  if (!r.ok) throw new ErreurFormule((etiquette ? etiquette + ': ' : '') + r.erreur);
  return compiler(r.ast);
}
function bornerVars(vars) {
  const o = {};
  for (const k of PARAMS) { let v = Number(vars && vars[k]); if (!Number.isFinite(v)) v = 1; o[k] = Math.min(BORNE_VAR, Math.max(-BORNE_VAR, v)); }
  return o;
}
function environnement(vars) { const E = new Float64Array(8); E[4] = vars.a; E[5] = vars.b; E[6] = vars.c; E[7] = vars.d; return E; }

/** evaluer('2+3*4') -> 14 ; valeurs = { x, y, z, t, a, b, c, d } (absent -> 0, sauf a..d -> 1) */
export function evaluer(texte, valeurs = {}) {
  const f = preparer(texte, ['x', 'y', 'z', 't', ...PARAMS]), E = environnement(bornerVars(valeurs));
  for (const k of ['x', 'y', 'z', 't']) { const v = Number(valeurs[k]); E[EMPLACEMENTS[k]] = Number.isFinite(v) ? v : 0; }
  return f(E);
}

// ---------- modes ----------
export const MODES = Object.freeze([
  { id: 'courbe', nom: 'Curve y = f(x)', expressions: ['y'], variables: ['x'], phrase: 'A plane curve y = f(x) for x in [from, to], drawn at z = 0.' },
  { id: 'parametrique', nom: 'Parametric curve', expressions: ['x', 'y', 'z'], variables: ['t'], phrase: 'A space curve (x(t), y(t), z(t)) for t in [from, to].' },
  { id: 'systeme', nom: 'Differential system', expressions: ['x', 'y', 'z'], variables: ['x', 'y', 'z', 't'], phrase: 'dx/dt, dy/dt, dz/dt as functions of x, y, z, t, integrated with RK4 from a starting point; chaos measured by a Lyapunov exponent.' },
  { id: 'surface', nom: 'Surface z = f(x, y)', expressions: ['z'], variables: ['x', 'y'], nuage: true, phrase: 'A surface z = f(x, y) sampled on a grid, shown as a cloud of points.' },
].map((m) => Object.freeze({ ...m, expressions: Object.freeze(m.expressions), variables: Object.freeze(m.variables) })));
const DEFAUTS = {
  courbe: { expressions: { y: 'sin(x)' }, intervalle: [-6.283185307179586, 6.283185307179586] },
  parametrique: { expressions: { x: 'cos(t)', y: 'sin(t)', z: 't/6' }, intervalle: [0, 25.132741228718345] },
  systeme: { expressions: { x: '10*(y-x)', y: 'x*(28-z)-y', z: 'x*y-8/3*z' }, depart: [1, 1, 1], dt: 0.01, pas: 4 },
  surface: { expressions: { z: 'sin(x)*cos(y)' }, intervalle: [-3.141592653589793, 3.141592653589793], intervalleY: [-3.141592653589793, 3.141592653589793] },
};
const fini = (v, d) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
const pince = (v, a, b) => Math.min(b, Math.max(a, v));
function intervalleDe(v, d) {
  let a = pince(fini(Array.isArray(v) ? v[0] : NaN, d[0]), -BORNE_INTERVALLE, BORNE_INTERVALLE);
  let b = pince(fini(Array.isArray(v) ? v[1] : NaN, d[1]), -BORNE_INTERVALLE, BORNE_INTERVALLE);
  if (a > b) { const t = a; a = b; b = t; }
  if (a === b) b = a + 1;
  return [a, b];
}
/** spec normalisee et bornee (jamais d exception) */
export function normaliserSpec(spec = {}) {
  const mode = MODES.find((m) => m.id === (spec && spec.mode)) ? spec.mode : 'courbe', M = MODES.find((m) => m.id === mode), D = DEFAUTS[mode];
  const ex = {};
  for (const k of M.expressions) { const v = spec && spec.expressions && spec.expressions[k]; ex[k] = typeof v === 'string' ? v : D.expressions[k]; }
  const P = { mode, expressions: ex, vars: bornerVars(spec && spec.vars) };
  if (mode === 'systeme') {
    const dep = Array.isArray(spec.depart) ? spec.depart : D.depart;
    P.depart = [0, 1, 2].map((j) => pince(fini(dep[j], D.depart[j]), -BORNE_INTERVALLE, BORNE_INTERVALLE));
    P.dt = pince(fini(spec.dt, D.dt), 1e-4, 0.1);
    P.pas = Math.round(pince(fini(spec.pas, D.pas), 1, 50));
  } else {
    P.intervalle = intervalleDe(spec.intervalle, D.intervalle);
    if (mode === 'surface') P.intervalleY = intervalleDe(spec.intervalleY, D.intervalleY);
  }
  return P;
}
function resume(v) { return { min: v.min, max: v.max, moyenne: v.n ? v.s / v.n : NaN }; }
const accu = () => ({ min: Infinity, max: -Infinity, s: 0, n: 0 });
const ajouter = (A, v) => { if (v < A.min) A.min = v; if (v > A.max) A.max = v; A.s += v; A.n++; };

/** simulerFormule(spec, { n = 1500 }) -> la forme de tam-physique.js#simuler (voir l en-tete) */
export function simulerFormule(spec, { n = 1500 } = {}) {
  const P = normaliserSpec(spec), M = MODES.find((m) => m.id === P.mode);
  n = Math.max(2, Math.min(20000, Math.floor(fini(n, 1500))));
  const autorisees = [...M.variables, ...PARAMS], erreurs = [], F = {};
  for (const k of M.expressions) {
    try { F[k] = preparer(P.expressions[k], autorisees, P.mode === 'systeme' ? 'd' + k + '/dt' : k + '(' + M.variables.join(', ') + ')'); }
    catch (e) { if (!(e instanceof ErreurFormule)) throw e; erreurs.push(e.message); }
  }
  const vide = (raison) => ({ params: P, D: 3, n: 0, bornee: false, raison, brut: null, lyapunov: null, uniteLyapunov: 'none', points: null, invariants: null, rejets: { nonFinis: 0, horsBornes: 0 }, erreurs });
  if (erreurs.length) return vide('formula refused');
  const E = environnement(P.vars);
  if (P.mode === 'systeme') return simulerSysteme(P, F, E, n, erreurs);
  const sortie = new Float64Array(n * 3), rejets = { nonFinis: 0, horsBornes: 0 }, inv = {};
  let m = 0;
  const garder = (x, y, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) { rejets.nonFinis++; return false; }
    if (Math.abs(x) > BORNE || Math.abs(y) > BORNE || Math.abs(z) > BORNE) { rejets.horsBornes++; return false; }
    sortie[3 * m] = x; sortie[3 * m + 1] = y; sortie[3 * m + 2] = z; m++; return true;
  };
  if (P.mode === 'courbe') {
    const [a, b] = P.intervalle, A = accu();
    for (let i = 0; i < n; i++) { const x = a + (b - a) * i / (n - 1); E[0] = x; const y = F.y(E); if (garder(x, y, 0)) ajouter(A, y); }
    inv.y = resume(A);
  } else if (P.mode === 'parametrique') {
    const [a, b] = P.intervalle, R = accu();
    for (let i = 0; i < n; i++) {
      E[3] = a + (b - a) * i / (n - 1);
      const x = F.x(E), y = F.y(E), z = F.z(E);
      if (garder(x, y, z)) ajouter(R, Math.sqrt(x * x + y * y + z * z));
    }
    inv.rayon = resume(R);
  } else {
    const c = Math.max(2, Math.floor(Math.sqrt(n))), [a, b] = P.intervalle, [a2, b2] = P.intervalleY, Z = accu();
    for (let i = 0; i < c; i++) for (let j = 0; j < c; j++) {
      const x = a + (b - a) * i / (c - 1), y = a2 + (b2 - a2) * j / (c - 1);
      E[0] = x; E[1] = y; const z = F.z(E);
      if (garder(x, y, z)) ajouter(Z, z);
    }
    inv.z = resume(Z);
  }
  inv.rejets = { ...rejets };
  if (rejets.nonFinis + rejets.horsBornes) erreurs.push((rejets.nonFinis + rejets.horsBornes) + ' point(s) dropped: ' + rejets.nonFinis + ' not a number (division by zero, sqrt of a negative...), ' + rejets.horsBornes + ' beyond +-' + BORNE + '.');
  const r = { params: P, D: 3, n: m, bornee: m >= 2, brut: sortie.slice(0, 3 * m), lyapunov: null, uniteLyapunov: 'not applicable (a drawn formula, not a dynamical system)', points: null, invariants: inv, rejets, erreurs };
  if (m < 2) r.raison = 'fewer than 2 drawable points';
  if (P.mode === 'surface') r.nuage = true;
  return r;
}

/* RK4 non autonome a tampons propres ; derivee(y, t, out) */
function fabriquerDerivee(F, E) {
  return (y, t, o) => { E[0] = y[0]; E[1] = y[1]; E[2] = y[2]; E[3] = t; o[0] = F.x(E); o[1] = F.y(E); o[2] = F.z(E); };
}
function fabriquerRK4(der) {
  const k1 = new Float64Array(3), k2 = new Float64Array(3), k3 = new Float64Array(3), k4 = new Float64Array(3), u = new Float64Array(3);
  return (y, t, h) => {
    der(y, t, k1); for (let j = 0; j < 3; j++) u[j] = y[j] + 0.5 * h * k1[j];
    der(u, t + 0.5 * h, k2); for (let j = 0; j < 3; j++) u[j] = y[j] + 0.5 * h * k2[j];
    der(u, t + 0.5 * h, k3); for (let j = 0; j < 3; j++) u[j] = y[j] + h * k3[j];
    der(u, t + h, k4); for (let j = 0; j < 3; j++) y[j] += h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]);
  };
}
const dehors = (y) => !(Math.abs(y[0]) <= BORNE && Math.abs(y[1]) <= BORNE && Math.abs(y[2]) <= BORNE);
/* divergence du champ (trace du jacobien, differences centrees) : taux de contraction des volumes */
function divergence(der, y, t) {
  const p = Float64Array.from(y), o1 = new Float64Array(3), o2 = new Float64Array(3); let s = 0;
  for (let j = 0; j < 3; j++) {
    const h = 1e-5 * Math.max(1, Math.abs(y[j]));
    p[j] = y[j] + h; der(p, t, o1); p[j] = y[j] - h; der(p, t, o2); p[j] = y[j];
    s += (o1[j] - o2[j]) / (2 * h);
  }
  return s;
}
function simulerSysteme(P, F, E, n, erreurs) {
  const der = fabriquerDerivee(F, E), rk4 = fabriquerRK4(der), h = P.dt, pas = P.pas;
  const y = Float64Array.from(P.depart), e = Float64Array.from(P.depart), dep = new Float64Array(3);
  for (let j = 0; j < 3; j++) dep[j] = 1 + 0.37 * ((j * 5) % 7);
  { let q = 0; for (let j = 0; j < 3; j++) q += dep[j] * dep[j]; q = D0 / Math.sqrt(q); for (let j = 0; j < 3; j++) { dep[j] *= q; e[j] += dep[j]; } }
  const brut = new Float64Array(n * 3), DV = accu();
  let t = 0, somme = 0;
  const noter = (i) => { brut[3 * i] = y[0]; brut[3 * i + 1] = y[1]; brut[3 * i + 2] = y[2]; const dv = divergence(der, y, t); if (Number.isFinite(dv)) ajouter(DV, dv); };
  if (dehors(y)) { erreurs.push('The starting point is not a finite number.'); return { params: P, D: 3, n: 0, bornee: false, echappeA: 0, raison: 'invalid start', brut: null, lyapunov: null, uniteLyapunov: 'per unit of time', points: null, invariants: null, rejets: { nonFinis: 1, horsBornes: 0 }, erreurs }; }
  noter(0);
  for (let i = 1; i < n; i++) {
    for (let s = 0; s < pas; s++) { rk4(y, t, h); rk4(e, t, h); t += h; }
    if (dehors(y)) {
      const raison = y.every(Number.isFinite) ? 'escaped beyond +-' + BORNE : 'not a number (division by zero or invalid value)';
      erreurs.push('The trajectory ' + (raison.startsWith('escaped') ? 'escaped' : 'became ' + raison) + ' at stored point ' + i + ' (t = ' + t + ').');
      return { params: P, D: 3, n: i, bornee: false, echappeA: i, raison, brut: brut.slice(0, 3 * i), lyapunov: null, uniteLyapunov: 'per unit of time', points: null,
        invariants: { divergence: resume(DV), tempsFinal: t }, rejets: { nonFinis: 0, horsBornes: 0 }, erreurs };
    }
    let d2 = 0; for (let j = 0; j < 3; j++) { const v = e[j] - y[j]; d2 += v * v; }
    const d = Math.sqrt(d2);
    if (d > 0 && Number.isFinite(d)) { somme += lnD(d / D0); for (let j = 0; j < 3; j++) e[j] = y[j] + (e[j] - y[j]) * D0 / d; }
    else for (let j = 0; j < 3; j++) e[j] = y[j] + dep[j];
    noter(i);
  }
  return { params: P, D: 3, n, bornee: true, brut, lyapunov: t > 0 ? somme / t : null, uniteLyapunov: 'per unit of time (Benettin, two trajectories 1e-8 apart, renormalised at every stored point)', points: null,
    invariants: { divergence: resume(DV), tempsFinal: t }, rejets: { nonFinis: 0, horsBornes: 0 }, erreurs };
}

// ---------- solveurs (numeriques ; chaque resultat porte sa verification) ----------
function fonction1(texte, vars, variable = 'x') {
  const f = preparer(texte, [variable, ...PARAMS]), E = environnement(bornerVars(vars)), j = EMPLACEMENTS[variable];
  return (x) => { E[j] = x; return f(E); };
}
function bornesAB(o, defaut = [-10, 10]) { return intervalleDe([o && o.a, o && o.b], defaut); }
/* section doree : minimum de g sur [lo, hi] */
function doree(g, lo, hi) {
  const r = 0.6180339887498949;
  let x1 = hi - r * (hi - lo), x2 = lo + r * (hi - lo), g1 = g(x1), g2 = g(x2);
  for (let k = 0; k < 200 && hi - lo > TOL_DOREE * Math.max(1, Math.abs(lo) + Math.abs(hi)); k++) {
    if (g1 <= g2) { hi = x2; x2 = x1; g2 = g1; x1 = hi - r * (hi - lo); g1 = g(x1); }
    else { lo = x1; x1 = x2; g1 = g2; x2 = lo + r * (hi - lo); g2 = g(x2); }
  }
  return (lo + hi) / 2;
}
/* bissection sur [lo, hi] avec f(lo), f(hi) de signes opposes */
function bissection(f, lo, hi, flo) {
  for (let k = 0; k < 400; k++) {
    if (!(hi - lo > TOL_BISSECTION * Math.max(1, Math.abs(lo)))) break;
    const m = lo + (hi - lo) / 2;
    if (m <= lo || m >= hi) break;
    const fm = f(m);
    if (fm === 0) return m;
    if ((fm < 0) === (flo < 0)) { lo = m; flo = fm; } else hi = m;
  }
  return lo + (hi - lo) / 2;
}
function grilleDe(f, a, b, N) {
  const X = new Float64Array(N + 1), Y = new Float64Array(N + 1);
  for (let i = 0; i <= N; i++) { X[i] = i === N ? b : a + (b - a) * i / N; Y[i] = f(X[i]); }
  return { X, Y };
}
function racinesFn(f, a, b, N) {
  const { X, Y } = grilleDe(f, a, b, N), sol = [];
  let echelle = 0; for (let i = 0; i <= N; i++) if (Number.isFinite(Y[i])) echelle = Math.max(echelle, Math.abs(Y[i]));
  const tolT = 1e-12 * Math.max(1, echelle);
  const pousser = (x, methode) => { const fx = f(x); if (Number.isFinite(fx)) sol.push({ x, fx, methode }); };
  /* changement de signe : bissection ; rejete si le residu depasse les extremites (un pole, pas une racine) */
  const crochet = (lo, hi, flo, fhi, methode) => {
    const x = bissection(f, lo, hi, flo), fx = f(x);
    if (Math.abs(fx) <= Math.max(Math.abs(flo), Math.abs(fhi))) pousser(x, methode);
  };
  for (let i = 0; i <= N; i++) {
    if (Y[i] === 0) pousser(X[i], 'exact grid point');
    if (i < N && Number.isFinite(Y[i]) && Number.isFinite(Y[i + 1]) && Y[i] !== 0 && Y[i + 1] !== 0 && (Y[i] < 0) !== (Y[i + 1] < 0)) crochet(X[i], X[i + 1], Y[i], Y[i + 1], 'sign change + bisection');
  }
  /* racines tangentes (multiplicite paire) et paires de racines dans une seule maille : minimum local de |f| sans changement de signe.
     Section doree sur f (ou -f) : extremum de signe oppose -> deux crochets ; extremum ~ 0 -> racine tangente. */
  for (let i = 1; i < N; i++) {
    const g = Y[i - 1], c = Y[i], d = Y[i + 1];
    if (!(Number.isFinite(g) && Number.isFinite(c) && Number.isFinite(d)) || c === 0) continue;
    if ((g < 0) !== (c < 0) || (d < 0) !== (c < 0)) continue;
    if (!(Math.abs(c) <= Math.abs(g) && Math.abs(c) <= Math.abs(d)) || Math.abs(c) === Math.abs(g) && Math.abs(c) === Math.abs(d)) continue;
    const s = c > 0 ? 1 : -1, xm = doree((x) => s * f(x), X[i - 1], X[i + 1]), fm = f(xm);
    if (!Number.isFinite(fm)) continue;
    if (fm !== 0 && (fm < 0) !== (c < 0)) { crochet(X[i - 1], xm, g, fm, 'pair of close roots: golden-section + bisection'); crochet(xm, X[i + 1], fm, d, 'pair of close roots: golden-section + bisection'); }
    else if (Math.abs(fm) <= tolT) pousser(xm, 'tangent root: golden-section on |f|');
  }
  sol.sort((p, q) => p.x - q.x);
  const out = [];
  for (const r of sol) {
    const der = out[out.length - 1];
    if (der && Math.abs(r.x - der.x) <= 1e-9 * Math.max(1, Math.abs(r.x))) { if (Math.abs(r.fx) < Math.abs(der.fx)) out[out.length - 1] = r; }
    else out.push(r);
  }
  return out;
}
const mailles = (o) => Math.round(pince(fini(o && o.grille, 4000), 10, 100000));

/** racines('x^2-2', { a: 0, b: 2, vars }) -> [{ x, fx (residu relu sur la formule), methode }] ; leve si la formule est refusee */
export function racines(expr, o = {}) {
  const f = fonction1(expr, o.vars), [a, b] = bornesAB(o);
  return racinesFn(f, a, b, mailles(o));
}
/** intersections(f, g, opts) -> [{ x, y = f(x), fx = f(x) - g(x) (residu), methode }] */
export function intersections(fe, ge, o = {}) {
  const f = fonction1(fe, o.vars), g = fonction1(ge, o.vars), [a, b] = bornesAB(o);
  return racinesFn((x) => f(x) - g(x), a, b, mailles(o)).map((r) => ({ x: r.x, y: f(r.x), fx: r.fx, methode: r.methode }));
}
/* derivee centree (verification) */
function deriveeCentree(f, x) { const h = 1e-5 * Math.max(1, Math.abs(x)); return (f(x + h) - f(x - h)) / (2 * h); }
/** extremums(expr, opts) -> [{ x, fx, type: 'min' | 'max', derivee (differences centrees, ~0), methode }] (interieur de [a, b]) */
export function extremums(expr, o = {}) {
  const f = fonction1(expr, o.vars), [a, b] = bornesAB(o), N = mailles(o), { X, Y } = grilleDe(f, a, b, N), out = [];
  let sPrec = 0, iPrec = 0;
  for (let i = 0; i < N; i++) {
    const dlt = Y[i + 1] - Y[i];
    if (!Number.isFinite(dlt)) { sPrec = 0; continue; }
    const s = dlt > 0 ? 1 : dlt < 0 ? -1 : 0;
    if (s === 0) continue;
    if (sPrec !== 0 && s !== sPrec) {
      const type = sPrec > 0 ? 'max' : 'min', k = type === 'max' ? -1 : 1;
      const x = doree((u) => k * f(u), X[Math.max(0, iPrec)], X[i + 1]), fx = f(x);
      if (Number.isFinite(fx)) out.push({ x, fx, type, derivee: deriveeCentree(f, x), methode: 'derivative sign change + golden-section' });
    }
    sPrec = s; iPrec = i;
  }
  return out;
}
/** integrale(expr, { a, b, vars, tol }) -> { valeur, erreurEstimee, evaluations, methode } (Simpson adaptatif + Richardson) */
export function integrale(expr, o = {}) {
  const f = fonction1(expr, o.vars), [a, b] = intervalleDe([o && o.a, o && o.b], [0, 1]), tol = pince(fini(o && o.tol, 1e-10), 1e-14, 1e-2);
  let evals = 0, erreur = 0, profondeurAtteinte = false;
  const F = (x) => { evals++; return f(x); };
  const simpson = (fa, fm, fb, h) => h / 6 * (fa + 4 * fm + fb);
  function pas(a0, b0, fa, fm, fb, S, eps, prof) {
    const m = (a0 + b0) / 2, lm = (a0 + m) / 2, rm = (m + b0) / 2, flm = F(lm), frm = F(rm);
    const G = simpson(fa, flm, fm, m - a0), D = simpson(fm, frm, fb, b0 - m), delta = G + D - S;
    if (prof <= 0 || evals > 2000000) { profondeurAtteinte = true; erreur += Math.abs(delta) / 15; return G + D + delta / 15; }
    if (Math.abs(delta) <= 15 * eps) { erreur += Math.abs(delta) / 15; return G + D + delta / 15; }
    return pas(a0, m, fa, flm, fm, G, eps / 2, prof - 1) + pas(m, b0, fm, frm, fb, D, eps / 2, prof - 1);
  }
  const fa = F(a), fb = F(b), fm = F((a + b) / 2);
  if (![fa, fb, fm].every(Number.isFinite)) return { valeur: NaN, erreurEstimee: NaN, evaluations: evals, methode: 'adaptive Simpson', erreur: 'The formula is not a finite number at the ends or the middle of the interval.' };
  const v = pas(a, b, fa, fm, fb, simpson(fa, fm, fb, b - a), tol, 50);
  const r = { valeur: v, erreurEstimee: erreur, evaluations: evals, methode: 'adaptive Simpson (Richardson-corrected)' };
  if (!Number.isFinite(v)) r.erreur = 'The integral is not finite on this interval (a pole or an invalid value).';
  else if (profondeurAtteinte) r.erreur = 'Refinement limit reached: the error estimate may be optimistic (sharp feature or singularity).';
  return r;
}

// ---------- equilibres d un systeme ----------
function resoudre3(J, r) { /* Gauss a pivot partiel ; null si singulier */
  const A = [[J[0], J[1], J[2], r[0]], [J[3], J[4], J[5], r[1]], [J[6], J[7], J[8], r[2]]];
  for (let c = 0; c < 3; c++) {
    let p = c; for (let l = c + 1; l < 3; l++) if (Math.abs(A[l][c]) > Math.abs(A[p][c])) p = l;
    if (!(Math.abs(A[p][c]) > 1e-300)) return null;
    if (p !== c) { const t = A[p]; A[p] = A[c]; A[c] = t; }
    for (let l = c + 1; l < 3; l++) { const q = A[l][c] / A[c][c]; for (let k = c; k < 4; k++) A[l][k] -= q * A[c][k]; }
  }
  const x = [0, 0, 0];
  for (let l = 2; l >= 0; l--) { let s = A[l][3]; for (let k = l + 1; k < 3; k++) s -= A[l][k] * x[k]; x[l] = s / A[l][l]; }
  return x.every(Number.isFinite) ? x : null;
}
function jacobien(der, p) {
  const J = new Float64Array(9), q = Float64Array.from(p), o1 = new Float64Array(3), o2 = new Float64Array(3);
  for (let j = 0; j < 3; j++) {
    const h = 1e-6 * Math.max(1, Math.abs(p[j]));
    q[j] = p[j] + h; der(q, 0, o1); q[j] = p[j] - h; der(q, 0, o2); q[j] = p[j];
    for (let i = 0; i < 3; i++) J[3 * i + j] = (o1[i] - o2[i]) / (2 * h);
  }
  return J;
}
const norme = (v) => Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
/* valeurs propres d une 3x3 : polynome caracteristique l^3 + A l^2 + B l + C ; une racine reelle par bissection + Newton, puis le quotient du second degre */
export function valeursPropres3(J) {
  const tr = J[0] + J[4] + J[8];
  const m2 = (J[0] * J[4] - J[1] * J[3]) + (J[0] * J[8] - J[2] * J[6]) + (J[4] * J[8] - J[5] * J[7]);
  const det = J[0] * (J[4] * J[8] - J[5] * J[7]) - J[1] * (J[3] * J[8] - J[5] * J[6]) + J[2] * (J[3] * J[7] - J[4] * J[6]);
  const A = -tr, B = m2, C = -det, p = (l) => ((l + A) * l + B) * l + C;
  const R = 1 + Math.max(Math.abs(A), Math.abs(B), Math.abs(C));
  let lo = -R, hi = R;
  for (let k = 0; k < 300 && hi - lo > 0; k++) { const m = lo + (hi - lo) / 2; if (m <= lo || m >= hi) break; if (p(m) < 0) lo = m; else hi = m; }
  let r = (lo + hi) / 2;
  for (let k = 0; k < 3; k++) { const dp = (3 * r + 2 * A) * r + B; if (dp !== 0) { const r2 = r - p(r) / dp; if (Math.abs(p(r2)) <= Math.abs(p(r))) r = r2; } }
  const q1 = A + r, q0 = B + r * q1, disc = q1 * q1 - 4 * q0;
  const vp = [{ re: r, im: 0 }];
  if (disc >= 0) {
    const sq = Math.sqrt(disc), u = q1 >= 0 ? (-q1 - sq) / 2 : (-q1 + sq) / 2;
    vp.push({ re: u, im: 0 }, { re: u !== 0 ? q0 / u : 0, im: 0 });
  } else { const im = Math.sqrt(-disc) / 2; vp.push({ re: -q1 / 2, im }, { re: -q1 / 2, im: -im }); }
  return vp.sort((x, y) => x.re - y.re || x.im - y.im);
}
export function classer(vp) {
  const echelle = Math.max(1, ...vp.map((v) => Math.sqrt(v.re * v.re + v.im * v.im))), eps = 1e-8 * echelle;
  if (vp.some((v) => Math.abs(v.re) <= eps)) return { type: 'non-hyperbolic (linear test inconclusive)', stable: null };
  const complexe = vp.some((v) => Math.abs(v.im) > eps), neg = vp.filter((v) => v.re < 0).length;
  if (complexe) {
    if (neg === 3) return { type: 'stable spiral (focus)', stable: true };
    if (neg === 0) return { type: 'unstable spiral (focus)', stable: false };
    return { type: 'saddle-focus', stable: false };
  }
  if (neg === 3) return { type: 'stable node', stable: true };
  if (neg === 0) return { type: 'unstable node', stable: false };
  return { type: 'saddle', stable: false };
}
/** equilibres(F, G, H, { vars, boite: [[x0,x1],[y0,y1],[z0,z1]], graines }) -> [{ x, y, z, residu, valeursPropres, type, stable, iterations }] */
export function equilibres(Fe, Ge, He, o = {}) {
  const aut = ['x', 'y', 'z', 't', ...PARAMS];
  const Fx = { x: preparer(Fe, aut, 'dx/dt'), y: preparer(Ge, aut, 'dy/dt'), z: preparer(He, aut, 'dz/dt') };
  const E = environnement(bornerVars(o.vars)), der = fabriquerDerivee(Fx, E);
  const bx = Array.isArray(o.boite) ? o.boite : [];
  const boite = [0, 1, 2].map((j) => intervalleDe(bx[j], [-30, 30]));
  const g = Math.round(pince(fini(o.graines, 5), 1, 9));
  const trouves = [], val = new Float64Array(3);
  const F = (p) => { der(p, 0, val); return [val[0], val[1], val[2]]; };
  for (let i = 0; i < g; i++) for (let j = 0; j < g; j++) for (let k = 0; k < g; k++) {
    const pos = (ix, B) => (g === 1 ? (B[0] + B[1]) / 2 : B[0] + (B[1] - B[0]) * ix / (g - 1));
    let p = [pos(i, boite[0]), pos(j, boite[1]), pos(k, boite[2])], fp = F(p), res = norme(fp), it = 0;
    for (; it < 60 && Number.isFinite(res) && res > 1e-15; it++) {
      const dx = resoudre3(jacobien(der, p), fp);
      if (!dx) break;
      let lam = 1, q = null, fq = null, rq = Infinity;
      for (let h = 0; h < 30; h++, lam /= 2) { q = [p[0] - lam * dx[0], p[1] - lam * dx[1], p[2] - lam * dx[2]]; fq = F(q); rq = norme(fq); if (rq < res) break; }
      if (!(rq < res)) break;
      p = q; fp = fq; res = rq;
    }
    if (!(res <= TOL_EQ)) continue;
    if (p.some((v, d) => v < boite[d][0] - 1e-9 || v > boite[d][1] + 1e-9)) continue;
    const dup = trouves.find((e) => Math.abs(e.x - p[0]) + Math.abs(e.y - p[1]) + Math.abs(e.z - p[2]) <= 1e-6 * Math.max(1, Math.abs(p[0]) + Math.abs(p[1]) + Math.abs(p[2])));
    if (dup) { if (res < dup.residu) { dup.x = p[0]; dup.y = p[1]; dup.z = p[2]; dup.residu = res; } continue; }
    trouves.push({ x: p[0], y: p[1], z: p[2], residu: res, iterations: it });
  }
  for (const e of trouves) {
    const J = jacobien(der, [e.x, e.y, e.z]), vp = valeursPropres3(J), c = classer(vp);
    e.residu = norme(F([e.x, e.y, e.z]));
    e.jacobien = Array.from(J); e.valeursPropres = vp; e.type = c.type; e.stable = c.stable;
  }
  return trouves.sort((p, q) => p.x - q.x || p.y - q.y || p.z - q.z);
}
