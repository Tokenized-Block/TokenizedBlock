// tam-moteur.js -- TAM (Tokenized Art Mathematique), PHASE A : le moteur mathematique PUR.
//
// Pur : aucun DOM, aucun reseau, aucune horloge, aucun hasard (Math.random = 0 occurrence).
// Aucun Math.sin/cos/log/exp non plus : la norme JS ne garantit PAS leurs bits d'un moteur a
// l'autre ; sinD/cosD/lnD ci-dessous n'utilisent que + - * / et Math.sqrt/round/floor (IEEE-754
// exacts). Seules les sorties quantifiees en entiers sont stockees -> meme graine = memes octets.
//
// Honnetete : le moteur fabrique de NOUVELLES COMBINAISONS de familles connues (generateur x
// parametres x operateur x projection) et en CERTIFIE des proprietes mesurables. Ce n'est pas
// "de nouvelles mathematiques".
//
// Mapping graine -> oeuvre (documente, rejouable) :
//   base   = keccak256( octets(graine) || keccak256(utf8(canon(etatCerveau))) )
//   essai e: flux  = keccak256(base || u32be(e)) ; le flux etend par keccak256(flux || u32be(compteur))
//   tirages, DANS CET ORDRE : operateur (u32 % 4) ; porteuse (u32 % taille) ; [lorenz96: dim] ;
//   [couplage: k = 2 + u32%3, eps] ; jitter de chaque parametre (cles triees, +-4 % ODE, +-3 % map) ;
//   angles des plans caches (D-3 angles, unite*2pi) ; [somme/composition: motif, ses params, w].
//   Si l'essai echoue a un certificat, e+1 (jusqu'a ESSAIS_MAX). Tout est dans params -> rejouer().
//
// Projection N-D -> 3-D (2026-10-31, phase C) : rotations de Givens (m, m+3) en cascade DECROISSANTE (m = D-4 .. 0) aux angles
//   tires, puis x1..x3. Chaque dimension cachee descend vers x1/x2/x3 : toutes comptent dans la vue STOCKEE (l ordre croissant
//   d avant laissait x7..x12 invisibles). Voir projeterND.
import { keccak256, keccak256Hex } from './keccak.js';

export const VERSION = 1;
export const LYAP_MIN = 0.02;       // exposant maximal minimum (par unite de temps ODE / par iteration map)
export const DIM_MIN = 1.1;         // dimension boite minimale (une courbe ~1.0)
export const SEUIL_DISTINCT = 0.2;  // distance (variation totale, 0..1) minimale a toute oeuvre existante
export const ESSAIS_MAX = 24;
// 2026-11-01 (campagne de simulation, scratchpad tam-sim) : le certificat chaotique sur les 1500 points stockes etait FAUX sur ~7,5 %
//   (lambda > 0.02 sur 1500 pas, ~0 sur 4500 : cycles limites lents). Lambda est donc AUSSI estime sur une trajectoire LONGUE,
//   distincte de la stockee (elle la PROLONGE : memes x et e, apres le dernier point stocke), coupee en FENETRES disjointes ; chacune
//   doit depasser LYAP_MIN. Les octets stockes ne changent pas.
export const LYAP_ETAPES_LONG = 6000, LYAP_FENETRES = 2;
// certificat de geometrie : sqrt(ev3/ev1) de la covariance des points projetes (quantifies) ; en dessous, une feuille ou une ligne vue
//   de profil (4 « degenerees » sur 1000, dont i=158 rossler/couplage plat 0.020, i=906 aizawa/couplage 0.014).
export const PLAT_MIN = 0.03;
// couplage : des copies quasi synchronisees tracent une courbe epaissie (halvorsen/couplage dim 1.10..1.11, lambda long ~0) -> 1.2
export const DIM_MIN_COUPLAGE = 1.2;
const PI = 3.141592653589793, DEUX_PI = 6.283185307179586, PI_2 = 1.5707963267948966;
const LN2 = 0.6931471805599453;
const ANGLE_OR = 2.399963229728653; // pi*(3 - sqrt 5), angle d'or (phyllotaxie)
const D0 = 1e-8;                    // separation initiale Benettin

// ---------- arithmetique deterministe ----------
export function sinD(x) {
  if (!(x - x === 0)) return NaN;
  let r = x - Math.round(x / DEUX_PI) * DEUX_PI;
  if (r > PI_2) r = PI - r; else if (r < -PI_2) r = -PI - r;
  const r2 = r * r; let t = r, s = r;
  for (let n = 1; n <= 11; n++) { t = -t * r2 / ((2 * n) * (2 * n + 1)); s += t; }
  return s;
}
export function cosD(x) { return sinD(x + PI_2); }
export function lnD(x) {
  if (x === 0) return -Infinity;
  if (!(x > 0) || x === Infinity) return NaN;
  let e = 0;
  while (x >= 2) { x /= 2; e++; }
  while (x < 1) { x *= 2; e--; }
  const y = (x - 1) / (x + 1), y2 = y * y; let t = y, s = 0;
  for (let k = 1; k <= 41; k += 2) { s += t / k; t *= y2; }
  return 2 * s + e * LN2;
}
const frac = (v) => v - Math.floor(v);

// ---------- graine et flux ----------
function hexEnOctets(h) {
  const s = String(h).replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]*$/.test(s) || s.length % 2) throw new Error('graine hex invalide');
  const o = new Uint8Array(s.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  return o;
}
const enHex = (o) => '0x' + [...o].map((b) => b.toString(16).padStart(2, '0')).join('');
const concat = (a, b) => { const o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
const u32be = (n) => Uint8Array.of(n >>> 24 & 255, n >>> 16 & 255, n >>> 8 & 255, n & 255);
export function canon(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v) || ArrayBuffer.isView(v)) return '[' + Array.from(v, canon).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}
class Flux {
  constructor(g) { this.g = g; this.c = 0; this.b = null; this.i = 32; }
  octet() {
    if (this.i >= 32) { this.b = keccak256(concat(this.g, u32be(this.c++))); this.i = 0; }
    return this.b[this.i++];
  }
  u32() { return ((this.octet() << 24) | (this.octet() << 16) | (this.octet() << 8) | this.octet()) >>> 0; }
  unite() { return this.u32() / 4294967296; }
  choix(n) { return this.u32() % n; }
  entre(a, b) { return a + (b - a) * this.unite(); }
}
function xorshift(s) { let x = (s >>> 0) || 0x9e3779b9; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

// ---------- familles ----------
// f(x, d, p, o, D) ecrit la derivee des composantes o..o+2 (ou de toutes, si dim variable).
export const ODE = {
  lorenz: { dim: 3, p: { s: 10, r: 28, b: 8 / 3 }, dt: 0.005, pas: 4, x0: [1, 1, 1],
    f: (x, d, p, o) => { const a = x[o], b = x[o + 1], c = x[o + 2]; d[o] = p.s * (b - a); d[o + 1] = a * (p.r - c) - b; d[o + 2] = a * b - p.b * c; } },
  rossler: { dim: 3, p: { a: 0.2, b: 0.2, c: 5.7 }, dt: 0.01, pas: 6, x0: [1, 1, 0],
    f: (x, d, p, o) => { const a = x[o], b = x[o + 1], c = x[o + 2]; d[o] = -b - c; d[o + 1] = a + p.a * b; d[o + 2] = p.b + c * (a - p.c); } },
  aizawa: { dim: 3, p: { a: 0.95, b: 0.7, c: 0.6, d: 3.5, e: 0.25, f: 0.1 }, dt: 0.01, pas: 4, x0: [0.1, 0, 0],
    f: (x, d, p, o) => { const a = x[o], b = x[o + 1], c = x[o + 2]; d[o] = (c - p.b) * a - p.d * b; d[o + 1] = p.d * a + (c - p.b) * b; d[o + 2] = p.c + p.a * c - c * c * c / 3 - (a * a + b * b) * (1 + p.e * c) + p.f * c * a * a * a; } },
  thomas: { dim: 3, p: { b: 0.208186 }, dt: 0.05, pas: 4, x0: [1.1, 1.1, -0.01],
    f: (x, d, p, o) => { const a = x[o], b = x[o + 1], c = x[o + 2]; d[o] = sinD(b) - p.b * a; d[o + 1] = sinD(c) - p.b * b; d[o + 2] = sinD(a) - p.b * c; } },
  halvorsen: { dim: 3, p: { a: 1.89 }, dt: 0.005, pas: 4, x0: [-1.48, -1.51, 2.04],
    f: (x, d, p, o) => { const a = x[o], b = x[o + 1], c = x[o + 2]; d[o] = -p.a * a - 4 * b - 4 * c - b * b; d[o + 1] = -p.a * b - 4 * c - 4 * a - c * c; d[o + 2] = -p.a * c - 4 * a - 4 * b - a * a; } },
  dadras: { dim: 3, p: { a: 3, b: 2.7, c: 1.7, d: 2, e: 9 }, dt: 0.005, pas: 5, x0: [1.1, 2.1, -2],
    f: (x, d, p, o) => { const a = x[o], b = x[o + 1], c = x[o + 2]; d[o] = b - p.a * a + p.b * b * c; d[o + 1] = p.c * b - a * c + c; d[o + 2] = p.d * a * b - p.e * c; } },
  chen: { dim: 3, p: { a: 35, b: 3, c: 28 }, dt: 0.002, pas: 6, x0: [-10, 0, 37],
    f: (x, d, p, o) => { const a = x[o], b = x[o + 1], c = x[o + 2]; d[o] = p.a * (b - a); d[o + 1] = (p.c - p.a) * a - a * c + p.c * b; d[o + 2] = a * b - p.b * c; } },
  sprott: { dim: 3, p: { a: 1, b: 1 }, dt: 0.01, pas: 5, x0: [0.1, 0.1, 0.1], // Sprott B
    f: (x, d, p, o) => { const a = x[o], b = x[o + 1], c = x[o + 2]; d[o] = p.a * b * c; d[o + 1] = a - b; d[o + 2] = p.b - a * b; } },
  lorenz96: { dim: null, p: { F: 8 }, dt: 0.01, pas: 3, // N-D natif : dx_i = (x_{i+1} - x_{i-2}) x_{i-1} - x_i + F
    f: (x, d, p, o, D) => { for (let i = 0; i < D; i++) d[i] = (x[(i + 1) % D] - x[(i + D - 2) % D]) * x[(i + D - 1) % D] - x[i] + p.F; } },
  explosion: { dim: 3, test: true, p: {}, dt: 0.01, pas: 4, x0: [1, 1, 1], // TEMOIN de divergence, jamais choisi
    f: (x, d, p, o) => { d[o] = x[o] * x[o]; d[o + 1] = -x[o + 1]; d[o + 2] = -x[o + 2]; } },
};
export const MAPS = {
  clifford: { p: { a: -1.4, b: 1.6, c: 1.0, d: 0.7 }, x0: [0.1, 0.1],
    f: (s, p) => { const x = s[0], y = s[1]; s[0] = sinD(p.a * y) + p.c * cosD(p.a * x); s[1] = sinD(p.b * x) + p.d * cosD(p.b * y); } },
  dejong: { p: { a: 1.4, b: -2.3, c: 2.4, d: -2.1 }, x0: [0.1, 0.1],
    f: (s, p) => { const x = s[0], y = s[1]; s[0] = sinD(p.a * y) - cosD(p.b * x); s[1] = sinD(p.c * x) - cosD(p.d * y); } },
};
const IFS = {
  fougere: [[0, 0, 0, 0.16, 0, 0, 0.01], [0.85, 0.04, -0.04, 0.85, 0, 1.6, 0.85], [0.2, -0.26, 0.23, 0.22, 0, 1.6, 0.07], [-0.15, 0.28, 0.26, 0.24, 0, 0.44, 0.07]],
  sierpinski: [[0.5, 0, 0, 0.5, 0, 0, 1 / 3], [0.5, 0, 0, 0.5, 0.5, 0, 1 / 3], [0.5, 0, 0, 0.5, 0.25, 0.5, 1 / 3]],
  dragon: [[0.5, -0.5, 0.5, 0.5, 0, 0, 0.5], [-0.5, -0.5, 0.5, -0.5, 1, 0, 0.5]],
};
const JULIA_C = [[-0.8, 0.156], [0.285, 0.01], [-0.4, 0.6], [-0.70176, -0.3842], [-0.835, -0.2321]];
const LSYS = {
  koch: { axiome: 'F', regles: { F: 'F+F-F-F+F' }, angle: 90, iter: 4 },
  dragon: { axiome: 'FX', regles: { X: 'X+YF+', Y: '-FX-Y' }, angle: 90, iter: 10 },
  plante: { axiome: 'X', regles: { X: 'F+[[X]-X]-F[-FX]+X', F: 'FF' }, angle: 25, iter: 5 },
};
export const PORTEUSES_3D = ['lorenz', 'rossler', 'aizawa', 'thomas', 'halvorsen', 'dadras', 'chen', 'sprott'];
export const PORTEUSES = [...PORTEUSES_3D, 'lorenz96', 'clifford', 'dejong'];
export const MOTIFS = ['ifs', 'julia', 'phyllotaxie', 'epicycles', 'lsysteme'];
export const OPERATEURS = ['seul', 'somme', 'composition', 'couplage'];

// ---------- choix du cerveau ----------
function tirerMotif(fl) {
  const famille = MOTIFS[fl.choix(MOTIFS.length)];
  const m = { famille };
  if (famille === 'ifs') {
    const v = Object.keys(IFS)[fl.choix(3)]; m.variante = v;
    m.cartes = IFS[v].map((c) => c.map((x, j) => (j < 6 ? x * (1 + (2 * fl.unite() - 1) * 0.02) : x)));
    m.s = fl.u32();
  } else if (famille === 'julia') {
    const c = JULIA_C[fl.choix(JULIA_C.length)];
    m.c = [c[0] * (1 + (2 * fl.unite() - 1) * 0.01), c[1] * (1 + (2 * fl.unite() - 1) * 0.01)]; m.s = fl.u32();
  } else if (famille === 'phyllotaxie') {
    m.torsion = fl.entre(0, PI);
  } else if (famille === 'epicycles') {
    const K = 3 + fl.choix(4); m.termes = []; m.verticaux = [];
    for (let k = 0; k < K; k++) { let f = fl.choix(15) - 7; if (f === 0) f = 1; m.termes.push([1 / (k + 1), f, fl.entre(0, DEUX_PI)]); }
    for (let k = 0; k < 2; k++) m.verticaux.push([0.5 / (k + 1), 1 + fl.choix(5)]);
  } else {
    m.variante = Object.keys(LSYS)[fl.choix(3)]; m.dAngle = (2 * fl.unite() - 1) * 0.02;
  }
  return m;
}
function tirerParams(fl) {
  const P = { v: VERSION, operateur: OPERATEURS[fl.choix(4)] };
  if (P.operateur === 'couplage') P.famille = PORTEUSES_3D[fl.choix(PORTEUSES_3D.length)];
  else P.famille = PORTEUSES[fl.choix(PORTEUSES.length)];
  if (P.famille === 'lorenz96') P.dim = [6, 8, 12][fl.choix(3)];
  if (P.operateur === 'couplage') { P.k = 2 + fl.choix(3); P.eps = fl.entre(0.05, 0.5); }
  const fam = ODE[P.famille] || MAPS[P.famille], J = MAPS[P.famille] ? 0.03 : 0.04;
  P.params = {};
  for (const c of Object.keys(fam.p).sort()) P.params[c] = fam.p[c] * (1 + (2 * fl.unite() - 1) * J);
  const D = dimension(P);
  P.angles = []; for (let i = 0; i < D - 3; i++) P.angles.push(fl.unite() * DEUX_PI);
  if (P.operateur === 'somme' || P.operateur === 'composition') { P.motif = tirerMotif(fl); P.w = fl.entre(0.15, 0.4); }
  return P;
}
function dimension(P) {
  if (MAPS[P.famille]) return 2;
  const fam = ODE[P.famille]; const base = fam.dim ?? P.dim ?? 6;
  return base * (P.operateur === 'couplage' ? P.k : 1);
}

/** une signature de distinction lisible : 512 cases finies, >= 0 */
export const signatureLisible = (s) => !!s && typeof s.length === 'number' && s.length === 512 && Array.prototype.every.call(s, (x) => typeof x === 'number' && x >= 0 && x <= 1);
const ADR_MINTEUR = /^0x[0-9a-fA-F]{40}$/;

// 2026-11-01 : `minteur` (adresse du wallet qui mintera) entre dans la graine : deux joueurs sur le MEME bloc ne recoivent jamais la meme
//   oeuvre. base = keccak256(graine || keccak(canon(etat)) || minteur 20 octets) ; sans minteur : l ancienne formule (exploration, banc).
//   Le minteur est ecrit dans params (P.minteur) : rejouer() n en a pas besoin (tout est dans params), mais il dit pour QUI l oeuvre fut tiree.
export function choisirOeuvre({ graine, etatCerveau = null, existantes = [], minteur = null } = {}) {
  const g = graine instanceof Uint8Array ? graine : hexEnOctets(graine);
  if (minteur !== null && minteur !== undefined && !ADR_MINTEUR.test(String(minteur))) throw new Error('minteur invalide (0x + 40 hex)');
  const mt = minteur ? String(minteur).toLowerCase() : null;
  /* ⛔ une signature existante illisible : on ne choisit PAS (la distance n est pas mesurable) — jamais ecartee en silence */
  const nonLues = existantes.filter((e) => !signatureLisible(e && (e.signature || e))).length;
  if (nonLues > 0) return { ok: false, etat: 'NON_LU', pourquoi: nonLues + ' existing work signature(s) could not be read', rejets: [] };
  const he = keccak256(new TextEncoder().encode(canon(etatCerveau)));
  const base = keccak256(mt ? concat(concat(g, he), hexEnOctets(mt)) : concat(g, he));
  const rejets = [];
  for (let essai = 0; essai < ESSAIS_MAX; essai++) {
    const fl = new Flux(keccak256(concat(base, u32be(essai))));
    const P = tirerParams(fl);
    P.graine = enHex(g); P.empreinteEtat = enHex(he); P.essai = essai;
    if (mt) P.minteur = mt;
    const o = generer(P); const c = certifier(o, existantes);
    if (c.ok) { const octets = encoderOeuvre(o); return { ok: true, params: o.params, oeuvre: o, certificats: c, octets, hash: keccak256Hex(octets), rejets }; }
    rejets.push({ essai, famille: P.famille, operateur: P.operateur, raisons: c.raisons, codes: c.codes });
  }
  return { ok: false, etat: 'AUCUNE', rejets };
}

// ---------- reglages (2026-11-01, Phil 31/10 : « l utilisateur peut CHANGER LES VARIABLES ») ----------
// Un espace VASTE (jamais « infini ») : familles x operateurs x dimension (jusqu a 12) x chaque parametre, dans des BORNES fixees ici.
// Une oeuvre reglee passe les MEMES certificats (certifierReglage) et se rejoue aux memes octets : tout ce qui la fait est dans params.
// Le CERVEAU peut aussi bouger des variables (coupDePouce) : deterministe, keccak de son etat et des params, dit « the brain moved X ».
const ARRONDI = 1e6, arrondir = (v) => Math.round(v * ARRONDI) / ARRONDI;
export const BORNES = Object.freeze({ eps: [0.02, 0.8], w: [0.1, 0.6], k: [2, 4], dim96: [4, 12], angle: [0, DEUX_PI], facteur: [0.5, 1.5] });
const MOTIF_DEFAUT = {
  ifs: (v = 'fougere') => ({ famille: 'ifs', variante: v, cartes: IFS[v].map((c) => c.slice()), s: 1 }),
  julia: () => ({ famille: 'julia', c: JULIA_C[0].slice(), s: 1 }),
  phyllotaxie: () => ({ famille: 'phyllotaxie', torsion: 0.5 }),
  epicycles: () => ({ famille: 'epicycles', termes: [[1, 1, 0], [0.5, -3, 1], [1 / 3, 5, 2]], verticaux: [[0.5, 2], [0.25, 3]] }),
  lsysteme: (v = 'plante') => ({ famille: 'lsysteme', variante: v, dAngle: 0 }),
};
/** le motif par defaut d une famille de motif (pour un reglage qui passe a somme/composition) */
export const motifDefaut = (famille, variante) => (MOTIF_DEFAUT[famille] ? MOTIF_DEFAUT[famille](variante) : null);
export function bornesParam(famille, cle) {
  const fam = ODE[famille] || MAPS[famille], v = fam && fam.p[cle];
  if (typeof v !== 'number') return null;
  const a = v * BORNES.facteur[0], b = v * BORNES.facteur[1];
  return [Math.min(a, b), Math.max(a, b)];
}
/** les curseurs d une oeuvre : { chemin, nom, min, max, valeur } — chemin = 'params.<cle>' | 'eps' | 'w' | 'angles.<i>' */
export function reglagesDe(P) {
  const fam = ODE[P.famille] || MAPS[P.famille]; if (!fam) return [];
  const L = [];
  for (const c of Object.keys(fam.p).sort()) { const [min, max] = bornesParam(P.famille, c); L.push({ chemin: 'params.' + c, nom: c, min, max, valeur: (P.params && P.params[c]) ?? fam.p[c] }); }
  if (P.operateur === 'couplage') L.push({ chemin: 'eps', nom: 'coupling', min: BORNES.eps[0], max: BORNES.eps[1], valeur: P.eps ?? 0.2 });
  if (P.operateur === 'somme' || P.operateur === 'composition') L.push({ chemin: 'w', nom: 'blend weight', min: BORNES.w[0], max: BORNES.w[1], valeur: P.w ?? 0.25 });
  (P.angles || []).forEach((a, i) => L.push({ chemin: 'angles.' + i, nom: 'hidden plane ' + (i + 1), min: BORNES.angle[0], max: BORNES.angle[1], valeur: a }));
  return L;
}
const clone = (P) => JSON.parse(JSON.stringify(P));
/** ecrit UNE variable (chemin) dans une COPIE des params, arrondie a 1e-6, bornee ; ne touche rien d autre que ce chemin et `regle` */
export function appliquerReglage(P, chemin, valeur) {
  const Q = clone(P), r = reglagesDe(Q).find((x) => x.chemin === chemin);
  if (!r) throw new Error('reglage inconnu: ' + chemin);
  const v = arrondir(Math.min(r.max, Math.max(r.min, Number(valeur))));
  if (!Number.isFinite(v)) throw new Error('valeur non finie');
  const [tete, sous] = chemin.split('.');
  if (tete === 'params') { Q.params = { ...(Q.params || {}) }; Q.params[sous] = v; }
  else if (tete === 'angles') Q.angles[Number(sous)] = v;
  else Q[tete] = v;
  Q.regle = true;
  return Q;
}
/** la STRUCTURE d une oeuvre reglee : famille, operateur, dimension (jusqu a 12), motif. Rend des params complets, angles a la bonne taille. */
export function structurer({ famille, operateur = 'seul', copies = 1, dim96 = 6, motif = null, base = null } = {}) {
  if (!PORTEUSES.includes(famille)) throw new Error('famille inconnue: ' + famille);
  if (!OPERATEURS.includes(operateur)) throw new Error('operateur inconnu: ' + JSON.stringify({ op: operateur }));
  if (operateur === 'couplage' && !PORTEUSES_3D.includes(famille)) throw new Error('couplage : une porteuse 3-D seulement');
  const fam = ODE[famille] || MAPS[famille], b = base && base.famille === famille ? base : null;
  const P = { v: VERSION, operateur, famille, params: {} };
  for (const c of Object.keys(fam.p).sort()) P.params[c] = b && b.params && typeof b.params[c] === 'number' ? b.params[c] : fam.p[c];
  if (famille === 'lorenz96') P.dim = Math.min(BORNES.dim96[1], Math.max(BORNES.dim96[0], Math.round(Number(dim96) || 6)));
  if (operateur === 'couplage') { P.k = Math.min(BORNES.k[1], Math.max(BORNES.k[0], Math.round(Number(copies) || 2))); P.eps = base && typeof base.eps === 'number' ? base.eps : 0.2; }
  if (operateur === 'somme' || operateur === 'composition') {
    const complet = motif && Object.keys(motif).some((k) => k !== 'famille' && k !== 'variante');
    P.motif = motif && MOTIF_DEFAUT[motif.famille] ? (complet ? clone(motif) : motifDefaut(motif.famille, motif.variante)) : motifDefaut('phyllotaxie');
    P.w = base && typeof base.w === 'number' ? base.w : 0.25;
  }
  const D = dimension(P), anc = (base && base.angles) || [];
  P.angles = []; for (let i = 0; i < D - 3; i++) P.angles.push(typeof anc[i] === 'number' ? anc[i] : arrondir((i + 1) * ANGLE_OR % DEUX_PI));
  for (const k of ['graine', 'empreinteEtat', 'minteur']) if (base && base[k]) P[k] = base[k];
  P.regle = true;
  return P;
}
const CLES_PARAMS = new Set(['v', 'operateur', 'famille', 'dim', 'k', 'eps', 'params', 'angles', 'motif', 'w', 'graine', 'empreinteEtat', 'essai', 'minteur', 'regle', 'reglage',
  'n', 'q', 'dt', 'pas', 'transitoire', 'ordre']);
const H32 = /^0x[0-9a-f]{64}$/, entier = (x, a, b) => Number.isInteger(x) && x >= a && x <= b, dans = (x, a, b) => typeof x === 'number' && Number.isFinite(x) && x >= a && x <= b;
const proche = (x, ref, tol) => typeof x === 'number' && Math.abs(x - ref) <= Math.abs(ref) * tol + 1e-12;
function motifValide(m) {
  if (!m || typeof m !== 'object' || !MOTIF_DEFAUT[m.famille]) return 'motif inconnu';
  if (m.famille === 'ifs') {
    const ref = IFS[m.variante]; if (!ref || !Array.isArray(m.cartes) || m.cartes.length !== ref.length) return 'IFS invalide';
    for (let i = 0; i < ref.length; i++) for (let j = 0; j < 7; j++) if (!(j < 6 ? proche(m.cartes[i][j], ref[i][j], 0.021) : m.cartes[i][j] === ref[i][j])) return 'IFS hors bornes';
    return entier(m.s, 0, 4294967295) ? null : 'IFS : graine invalide';
  }
  if (m.famille === 'julia') return Array.isArray(m.c) && m.c.length === 2 && JULIA_C.some((c) => proche(m.c[0], c[0], 0.011) && proche(m.c[1], c[1], 0.011)) && entier(m.s, 0, 4294967295) ? null : 'Julia hors bornes';
  if (m.famille === 'phyllotaxie') return dans(m.torsion, 0, PI) ? null : 'phyllotaxie hors bornes';
  if (m.famille === 'epicycles') {
    if (!Array.isArray(m.termes) || m.termes.length < 3 || m.termes.length > 6 || !Array.isArray(m.verticaux) || m.verticaux.length !== 2) return 'epicycles invalides';
    if (!m.termes.every((t, k) => Array.isArray(t) && t.length === 3 && t[0] === 1 / (k + 1) && entier(t[1], -7, 7) && t[1] !== 0 && dans(t[2], 0, DEUX_PI))) return 'epicycles hors bornes';
    return m.verticaux.every((t, k) => Array.isArray(t) && t.length === 2 && t[0] === 0.5 / (k + 1) && entier(t[1], 1, 5)) ? null : 'epicycles hors bornes';
  }
  return LSYS[m.variante] && dans(m.dAngle, -0.02, 0.02) ? null : 'L-systeme hors bornes';
}
/** les params tiennent-ils dans les BORNES ? (un curseur ne peut pas sortir de l espace certifiable ; n, q, dt, pas = ceux du moteur) */
export function validerReglage(P) {
  const non = (raison) => ({ ok: false, code: 'HORS_BORNES', raison });
  if (!P || typeof P !== 'object' || Array.isArray(P)) return non('params absents');
  for (const k of Object.keys(P)) if (!CLES_PARAMS.has(k)) return non('cle inconnue: ' + k);
  if (P.v !== VERSION) return non('version');
  if (!PORTEUSES.includes(P.famille)) return non('famille');
  if (!OPERATEURS.includes(P.operateur)) return non('operateur');
  const fam = ODE[P.famille] || MAPS[P.famille];
  if (P.operateur === 'couplage') { if (!PORTEUSES_3D.includes(P.famille) || !entier(P.k, BORNES.k[0], BORNES.k[1]) || !dans(P.eps, BORNES.eps[0], BORNES.eps[1])) return non('couplage hors bornes'); }
  else if (P.k !== undefined || P.eps !== undefined) return non('k/eps sans couplage');
  if (P.famille === 'lorenz96') { if (!entier(P.dim, BORNES.dim96[0], BORNES.dim96[1])) return non('dimension hors bornes'); } else if (P.dim !== undefined) return non('dim hors lorenz96');
  if (!P.params || typeof P.params !== 'object') return non('parametres absents');
  const cles = Object.keys(fam.p).sort();
  if (Object.keys(P.params).sort().join() !== cles.join()) return non('parametres inattendus');
  for (const c of cles) { const [a, b] = bornesParam(P.famille, c); if (!dans(P.params[c], a, b)) return non(c + ' hors bornes'); }
  const D = dimension(P);
  if (D > 12) return non('plus de 12 dimensions');
  if (!Array.isArray(P.angles) || P.angles.length !== Math.max(0, D - 3) || !P.angles.every((x) => dans(x, BORNES.angle[0], BORNES.angle[1]))) return non('angles hors bornes');
  if (P.operateur === 'somme' || P.operateur === 'composition') { const e = motifValide(P.motif); if (e) return non(e); if (!dans(P.w, BORNES.w[0], BORNES.w[1])) return non('poids hors bornes'); }
  else if (P.motif !== undefined || P.w !== undefined) return non('motif sans somme/composition');
  if (P.n !== undefined && P.n !== 1500) return non('n'); if (P.q !== undefined && P.q !== 12) return non('q');
  if (ODE[P.famille]) { if ((P.dt !== undefined && P.dt !== fam.dt) || (P.pas !== undefined && P.pas !== fam.pas) || (P.transitoire !== undefined && P.transitoire !== 4000)) return non('pas d integration'); }
  else if ((P.dt !== undefined || P.pas !== undefined) || (P.transitoire !== undefined && P.transitoire !== 300)) return non('pas d iteration');
  const ordre = (MAPS[P.famille] || (P.operateur === 'composition' && (P.motif.famille === 'ifs' || P.motif.famille === 'julia'))) ? 1 : 0;
  if (P.ordre !== undefined && P.ordre !== ordre) return non('ordre');
  for (const k of ['graine', 'empreinteEtat']) if (P[k] !== undefined && !H32.test(P[k])) return non(k);
  if (P.minteur !== undefined && !ADR_MINTEUR.test(P.minteur)) return non('minteur');
  if (P.essai !== undefined && !entier(P.essai, 0, ESSAIS_MAX - 1)) return non('essai');
  if (P.reglage !== undefined && JSON.stringify(P.reglage).length > 800) return non('reglage trop long');
  return { ok: true, code: 'DANS_LES_BORNES', raison: null };
}
/** LE portail d une oeuvre reglee (joueur ou cerveau) : bornes, puis generer, puis les MEMES certificats que le choix du cerveau */
export function certifierReglage(P, existantes = []) {
  const v = validerReglage(P);
  if (!v.ok) return { ok: false, etat: 'REFUSE', codes: ['HORS_BORNES'], raisons: [v.raison], oeuvre: null };
  if (existantes.some((e) => !signatureLisible(e && (e.signature || e)))) return { ok: false, etat: 'NON_LU', codes: ['SIGNATURE_NON_LUE'], raisons: [RAISONS.SIGNATURE_NON_LUE], oeuvre: null };
  const o = generer(P), c = certifier(o, existantes);
  return c.ok ? { ...c, oeuvre: o, octets: encoderOeuvre(o) } : { ...c, oeuvre: o };
}
/**
 * LE CERVEAU BOUGE DES VARIABLES. Deterministe : h = keccak256(utf8(canon(etat) + '|' + canon(params sans reglage))). 1 ou 2 curseurs
 * choisis par h, chacun deplace de +-15 % de sa plage (h), borne, arrondi. Rend { params, mouvements: [{ chemin, nom, de, a }] } ;
 * params.reglage = { par: 'cerveau', empreinteEtat, mouvements } — la carte le dit tel quel.
 */
export function coupDePouce(P, etatCerveau) {
  const { reglage: _r, ...nu } = P;
  const h = keccak256(new TextEncoder().encode(canon(etatCerveau) + '|' + canon(nu)));
  const R = reglagesDe(P); if (!R.length) return { params: clone(P), mouvements: [] };
  const nb = 1 + (h[0] % 2), pris = [], mouvements = [];
  let Q = clone(nu);
  for (let m = 0, o = 1; m < nb && o + 4 < 32; m++, o += 5) {
    let idx = ((h[o] << 8) | h[o + 1]) % R.length;
    while (pris.includes(idx)) idx = (idx + 1) % R.length;
    pris.push(idx);
    const r = R[idx], depl = ((h[o + 2] / 255) * 2 - 1) * 0.15 * (r.max - r.min);
    const de = reglagesDe(Q).find((x) => x.chemin === r.chemin).valeur;
    Q = appliquerReglage(Q, r.chemin, de + depl);
    mouvements.push({ chemin: r.chemin, nom: r.nom, de: arrondir(de), a: reglagesDe(Q).find((x) => x.chemin === r.chemin).valeur });
  }
  Q.reglage = { par: 'cerveau', empreinteEtat: keccak256Hex(new TextEncoder().encode(canon(etatCerveau))), mouvements };
  return { params: Q, mouvements };
}

// ---------- generation ----------
function completer(params) {
  const P = JSON.parse(JSON.stringify(params));
  const fam = ODE[P.famille] || MAPS[P.famille];
  if (!fam) throw new Error('famille inconnue: ' + P.famille);
  P.operateur ??= 'seul'; P.params = { ...fam.p, ...(P.params || {}) };
  P.n ??= 1500; P.q ??= 12; P.angles ??= [];
  if (ODE[P.famille]) { P.dt ??= fam.dt; P.pas ??= fam.pas; P.transitoire ??= 4000; } else P.transitoire ??= 300;
  if (P.ordre === undefined) P.ordre = (MAPS[P.famille] || (P.operateur === 'composition' && (P.motif.famille === 'ifs' || P.motif.famille === 'julia'))) ? 1 : 0;
  return P;
}
function horsBorne(x, D, B) { for (let i = 0; i < D; i++) { const v = x[i]; if (!(v <= B && v >= -B)) return true; } return false; }

function genererPorteuse(P) {
  const n = P.n;
  if (MAPS[P.famille]) {
    const m = MAPS[P.famille], p = P.params, s = [m.x0[0], m.x0[1]], B = 1e3;
    for (let i = 0; i < P.transitoire; i++) { m.f(s, p); if (horsBorne(s, 2, B)) return { D: 2, bornee: false, echappeA: i }; }
    const e = [s[0] + D0, s[1]], brut = new Float64Array(n * 2); let somme = 0;
    for (let i = 0; i < n; i++) {
      m.f(s, p); m.f(e, p);
      if (horsBorne(s, 2, B)) return { D: 2, bornee: false, echappeA: P.transitoire + i };
      const dx = e[0] - s[0], dy = e[1] - s[1], d = Math.sqrt(dx * dx + dy * dy);
      somme += lnD(d / D0);
      if (d > 0) { e[0] = s[0] + dx * D0 / d; e[1] = s[1] + dy * D0 / d; } else { e[0] = s[0] + D0; e[1] = s[1]; }
      brut[2 * i] = s[0]; brut[2 * i + 1] = s[1];
    }
    let long = null; // la trajectoire LONGUE : prolonge s et e apres le dernier point stocke ; calculee une fois, a la demande
    const prolonger = () => {
      if (long) return long;
      const parF = Math.floor(LYAP_ETAPES_LONG / LYAP_FENETRES), sommes = [];
      for (let w = 0; w < LYAP_FENETRES; w++) {
        let sw = 0;
        for (let i = 0; i < parF; i++) {
          m.f(s, p); m.f(e, p);
          if (horsBorne(s, 2, B)) return (long = { bornee: false, etapes: w * parF + i, fenetres: sommes });
          const dx = e[0] - s[0], dy = e[1] - s[1], d = Math.sqrt(dx * dx + dy * dy);
          sw += lnD(d / D0);
          if (d > 0) { e[0] = s[0] + dx * D0 / d; e[1] = s[1] + dy * D0 / d; } else { e[0] = s[0] + D0; e[1] = s[1]; }
        }
        sommes.push(sw / parF);
      }
      return (long = { bornee: true, etapes: parF * LYAP_FENETRES, fenetres: sommes });
    };
    return { D: 2, bornee: true, brut, lyapunov: somme / n, unite: 'par iteration', prolonger };
  }
  const fam = ODE[P.famille], k = P.operateur === 'couplage' ? P.k : 1, D = dimension(P);
  const p = P.params, eps = P.eps || 0, dt = P.dt, B = fam.borne || 1e3;
  const f = fam.dim === null ? (x, d) => fam.f(x, d, p, 0, D) : (x, d) => {
    for (let j = 0; j < k; j++) { fam.f(x, d, p, 3 * j, D); if (k > 1) d[3 * j] += eps * (x[3 * ((j + 1) % k)] - x[3 * j]); }
  };
  const x = new Float64Array(D);
  if (fam.dim === null) { x.fill(p.F); x[0] += 0.01; } else for (let j = 0; j < k; j++) for (let c = 0; c < 3; c++) x[3 * j + c] = fam.x0[c] + 0.01 * j * (c + 1);
  const k1 = new Float64Array(D), k2 = new Float64Array(D), k3 = new Float64Array(D), k4 = new Float64Array(D), t = new Float64Array(D), h = dt / 6;
  const rk4 = (y) => {
    f(y, k1); for (let i = 0; i < D; i++) t[i] = y[i] + 0.5 * dt * k1[i];
    f(t, k2); for (let i = 0; i < D; i++) t[i] = y[i] + 0.5 * dt * k2[i];
    f(t, k3); for (let i = 0; i < D; i++) t[i] = y[i] + dt * k3[i];
    f(t, k4); for (let i = 0; i < D; i++) y[i] += h * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  };
  for (let i = 0; i < P.transitoire; i++) { rk4(x); if (horsBorne(x, D, B)) return { D, bornee: false, echappeA: i }; }
  const e = new Float64Array(D), u = D0 / Math.sqrt(D); for (let i = 0; i < D; i++) e[i] = x[i] + u;
  const brut = new Float64Array(n * D); let somme = 0;
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < P.pas; s++) { rk4(x); rk4(e); }
    if (horsBorne(x, D, B)) return { D, bornee: false, echappeA: P.transitoire + i * P.pas };
    let d2 = 0; for (let j = 0; j < D; j++) { const v = e[j] - x[j]; d2 += v * v; }
    const d = Math.sqrt(d2); somme += lnD(d / D0);
    for (let j = 0; j < D; j++) e[j] = d > 0 ? x[j] + (e[j] - x[j]) * D0 / d : x[j] + u;
    brut.set(x, i * D);
  }
  let long = null; // la trajectoire LONGUE (voir LYAP_ETAPES_LONG) : prolonge x et e, jamais stockee
  const prolonger = () => {
    if (long) return long;
    const parF = Math.floor(LYAP_ETAPES_LONG / LYAP_FENETRES), sommes = [];
    for (let w = 0; w < LYAP_FENETRES; w++) {
      let sw = 0;
      for (let i = 0; i < parF; i++) {
        for (let s = 0; s < P.pas; s++) { rk4(x); rk4(e); }
        if (horsBorne(x, D, B)) return (long = { bornee: false, etapes: w * parF + i, fenetres: sommes });
        let d2 = 0; for (let j = 0; j < D; j++) { const v = e[j] - x[j]; d2 += v * v; }
        const d = Math.sqrt(d2); sw += lnD(d / D0);
        for (let j = 0; j < D; j++) e[j] = d > 0 ? x[j] + (e[j] - x[j]) * D0 / d : x[j] + u;
      }
      sommes.push(sw / (parF * P.pas * dt));
    }
    return (long = { bornee: true, etapes: parF * LYAP_FENETRES, fenetres: sommes });
  };
  return { D, bornee: true, brut, lyapunov: somme / (n * P.pas * dt), unite: 'par unite de temps', prolonger };
}

function normaliser(a) { // centre milieu, echelle commune -> [-1, 1], aspect conserve
  const n = a.length / 3, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const v = a[3 * i + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
  const r = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, s = r > 0 ? 1 / r : 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) a[3 * i + c] = (a[3 * i + c] - (lo[c] + hi[c]) / 2) * s;
  return a;
}
function standardiser(brut, n, D) {
  const z = new Float64Array(n * D);
  for (let j = 0; j < D; j++) {
    let m = 0; for (let i = 0; i < n; i++) m += brut[i * D + j]; m /= n;
    let v = 0; for (let i = 0; i < n; i++) { const w = brut[i * D + j] - m; v += w * w; }
    const s = v > 0 ? 1 / Math.sqrt(v / n) : 0;
    for (let i = 0; i < n; i++) z[i * D + j] = (brut[i * D + j] - m) * s;
  }
  return z;
}
// N-D -> 3-D : rotations de Givens dans les plans (m, m+3), m = D-4 .. 0 (DECROISSANT), puis 3 premieres.
// 2026-10-31 (phase C, decision du lead, aucune oeuvre mintee) : l ordre CROISSANT d avant ne laissait jamais voir x7..x12 (le plan
//   (m, m+3) avec m >= 3 ne mele que deux dimensions cachees APRES que x1..x3 ont recu leur part). En cascade decroissante, la
//   dimension d descend vers d-3, d-6, ... jusqu a x1/x2/x3 : chaque dimension touche la vue stockee (poids = produit de sinus des
//   angles tires, nul seulement pour un angle exactement 0 ou pi). Choisi parce que c est le plus petit changement (memes angles, meme
//   format) ; une projection orthonormee N->3 tiree de la graine aurait ajoute des tirages.
// Map 2-D -> 3-D : plongement a retard (x_n, y_n, x_{n-1}).
/** la vue stockee d un etat N-D standardise `z` (n x D) : pure, exportee pour le banc « chaque dimension compte » */
export function projeterND(z, n, D, angles) {
  const out = new Float64Array(n * 3), cs = angles.map(cosD), sn = angles.map(sinD), v = new Float64Array(D);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < D; j++) v[j] = z[i * D + j];
    for (let m = D - 4; m >= 0; m--) { const a = v[m], b = v[m + 3], c = cs[m] ?? 1, s = sn[m] ?? 0; v[m] = c * a - s * b; v[m + 3] = s * a + c * b; }
    out[3 * i] = v[0]; out[3 * i + 1] = v[1]; out[3 * i + 2] = v[2];
  }
  return normaliser(out);
}
export function standardiserND(brut, n, D) { return standardiser(brut, n, D); }
function projeter(car, P) {
  const n = P.n, D = car.D, out = new Float64Array(n * 3);
  if (D === 2) {
    const b = car.brut;
    for (let i = 0; i < n; i++) { out[3 * i] = b[2 * i]; out[3 * i + 1] = b[2 * i + 1]; out[3 * i + 2] = b[2 * Math.max(0, i - 1)]; }
    return normaliser(out);
  }
  return projeterND(standardiser(car.brut, n, D), n, D, P.angles);
}

const polylignes = new Map();
function tortue(variante, dAngle) {
  const cle = variante + ':' + dAngle; if (polylignes.has(cle)) return polylignes.get(cle);
  const L = LSYS[variante]; let s = L.axiome;
  for (let i = 0; i < L.iter; i++) { let t = ''; for (const ch of s) t += L.regles[ch] ?? ch; s = t; }
  const a = L.angle * (1 + dAngle) * PI / 180, pts = [], pile = []; let x = 0, y = 0, h = PI_2;
  for (const ch of s) {
    if (ch === 'F') { x += cosD(h); y += sinD(h); pts.push(x, y); }
    else if (ch === '+') h += a; else if (ch === '-') h -= a;
    else if (ch === '[') pile.push([x, y, h]); else if (ch === ']') [x, y, h] = pile.pop();
  }
  polylignes.set(cle, pts); return pts;
}
function genererMotif(M, n, u) {
  const out = new Float64Array(n * 3), uu = (i) => u[i];
  if (M.famille === 'ifs') {
    const r = xorshift(M.s), cum = []; let acc = 0; for (const c of M.cartes) cum.push(acc += c[6]);
    let x = 0, y = 0;
    for (let i = -20; i < n; i++) {
      const w = (u && i >= 0 ? uu(i) : r()) * acc; let j = 0; while (j < cum.length - 1 && w >= cum[j]) j++;
      const c = M.cartes[j]; const nx = c[0] * x + c[1] * y + c[4]; y = c[2] * x + c[3] * y + c[5]; x = nx;
      if (i >= 0) { out[3 * i] = x; out[3 * i + 1] = y; }
    }
  } else if (M.famille === 'julia') {
    const r = xorshift(M.s); let zr = 0.5, zi = 0.5;
    for (let i = -30; i < n; i++) {
      const wr = zr - M.c[0], wi = zi - M.c[1], m = Math.sqrt(wr * wr + wi * wi);
      let a = Math.sqrt((m + wr) / 2), b = Math.sqrt(Math.max(0, (m - wr) / 2)); if (wi < 0) b = -b;
      if ((u && i >= 0 ? uu(i) : r()) < 0.5) { a = -a; b = -b; }
      zr = a; zi = b; if (i >= 0) { out[3 * i] = zr; out[3 * i + 1] = zi; }
    }
  } else if (M.famille === 'phyllotaxie') {
    for (let i = 0; i < n; i++) {
      const z = 1 - 2 * (i + 0.5) / n, r = Math.sqrt(1 - z * z), th = i * ANGLE_OR + M.torsion * z, s = u ? 0.6 + 0.4 * uu(i) : 1;
      out[3 * i] = s * r * cosD(th); out[3 * i + 1] = s * r * sinD(th); out[3 * i + 2] = s * z;
    }
  } else if (M.famille === 'epicycles') {
    for (let i = 0; i < n; i++) {
      const t = u ? uu(i) : i / n; let x = 0, y = 0, z = 0;
      for (const [a, f, ph] of M.termes) { x += a * cosD(DEUX_PI * f * t + ph); y += a * sinD(DEUX_PI * f * t + ph); }
      for (const [b, g] of M.verticaux) z += b * sinD(DEUX_PI * g * t);
      out[3 * i] = x; out[3 * i + 1] = y; out[3 * i + 2] = z;
    }
  } else {
    const pts = tortue(M.variante, M.dAngle), L = pts.length / 2;
    for (let i = 0; i < n; i++) { const j = u ? Math.min(L - 1, Math.floor(uu(i) * L)) : Math.floor(i * L / n); out[3 * i] = pts[2 * j]; out[3 * i + 1] = pts[2 * j + 1]; }
  }
  return normaliser(out);
}
function combiner(proj, P) {
  const n = P.n, out = new Float64Array(n * 3);
  if (P.operateur === 'somme') {
    const m = genererMotif(P.motif, n, null);
    for (let i = 0; i < 3 * n; i++) out[i] = (1 - P.w) * proj[i] + P.w * m[i];
  } else { // composition : motif( u(porteuse) ), u = frac(97 * x_porteuse normalise)
    /* game77 (chasse aux bugs, mesure : w=0.1 et w=0.6 donnaient le MEME hash, 11/11 familles) : le curseur « blend weight » etait
     *   offert mais jamais lu ici. Il dose maintenant la part de la porteuse en z (w = 0.5 : l ancien melange). Aucune oeuvre mintee
     *   (TamArt totalSupply = 0 le 01/11) : aucun rejeu stocke ne change. */
    const u = new Float64Array(n); for (let i = 0; i < n; i++) u[i] = frac((proj[3 * i] + 1) * 0.5 * 97);
    const m = genererMotif(P.motif, n, u);
    for (let i = 0; i < n; i++) { out[3 * i] = m[3 * i]; out[3 * i + 1] = m[3 * i + 1]; out[3 * i + 2] = (1 - P.w) * m[3 * i + 2] + P.w * proj[3 * i + 2]; }
  }
  return normaliser(out);
}
function morton(x, y, z, q) {
  let k = 0; const s = q - 10;
  for (let b = 9; b >= 0; b--) k = k * 8 + (((x >> s) >> b & 1) << 2 | ((y >> s) >> b & 1) << 1 | ((z >> s) >> b & 1));
  return k;
}

/** game77 : la vue VIVANTE d un melange (somme/composition) — la meme combinaison que la vue stockee, appliquee a une projection
 *   vivante (couches eteintes, plans caches qui tournent) ; avant, la vue vivante ne montrait que la porteuse. */
export function combinerVue(proj, params) {
  const P = completer(params);
  return P.operateur === 'somme' || P.operateur === 'composition' ? combiner(proj, P) : proj;
}
/** game79 : le MEME melange (somme / composition avec un motif) applique a une vue 3-D quelconque — une science par exemple.
 *   melange = { operateur, motif, w } ; proj normalisee n x 3. */
export function melangerVue(proj, n, melange) {
  return combiner(Float64Array.from(proj), { n, operateur: melange.operateur, motif: melange.motif, w: melange.w });
}
/** game77 : l AFFICHAGE dense d une map 2-D seule (De Jong, Clifford) — N iterations apres le transitoire, pour la VUE seulement :
 *   jamais stockees ni mintees (l oeuvre reste ses n points). Avant : 1 500 points pales, la forme illisible. null si elle s echappe. */
export function nuageMap(params, N = 40000) {
  const P = completer(params), m = MAPS[P.famille];
  if (!m || P.operateur !== 'seul') return null;
  const p = P.params, s = [m.x0[0], m.x0[1]];
  for (let i = 0; i < P.transitoire; i++) { m.f(s, p); if (horsBorne(s, 2, 1e3)) return null; }
  const out = new Float32Array(2 * N);
  for (let i = 0; i < N; i++) { m.f(s, p); if (horsBorne(s, 2, 1e3)) return null; out[2 * i] = s[0]; out[2 * i + 1] = s[1]; }
  return out;
}
export function generer(params) {
  const P = completer(params), car = genererPorteuse(P);
  if (!car.bornee) return { params: P, D: car.D, bornee: false, echappeA: car.echappeA, lyapunov: NaN, points: null };
  let fin = projeter(car, P);
  if (P.operateur === 'somme' || P.operateur === 'composition') fin = combiner(fin, P);
  const n = P.n, M = (1 << P.q) - 1; let pts = new Int32Array(n * 3);
  for (let i = 0; i < 3 * n; i++) { const v = Math.round((fin[i] + 1) / 2 * M); pts[i] = v < 0 ? 0 : v > M ? M : v; }
  if (P.ordre === 1) {
    const idx = Array.from({ length: n }, (_, i) => i), cle = idx.map((i) => morton(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2], P.q));
    idx.sort((a, b) => cle[a] - cle[b] || a - b);
    const t = new Int32Array(n * 3); idx.forEach((s, d) => { t[3 * d] = pts[3 * s]; t[3 * d + 1] = pts[3 * s + 1]; t[3 * d + 2] = pts[3 * s + 2]; }); pts = t;
  }
  return { params: P, D: car.D, n, bornee: true, brut: car.brut, lyapunov: car.lyapunov, uniteLyapunov: car.unite, points: pts, prolonger: car.prolonger };
}

// ---------- certificats ----------
export function dimensionBoites(points, q, kMin = 2, kMax = 5) {
  const n = points.length / 3, xs = [], ys = [], comptes = [];
  for (let k = kMin; k <= kMax; k++) {
    const s = q - k, S = new Set();
    for (let i = 0; i < n; i++) S.add(((points[3 * i] >> s) * (1 << k) + (points[3 * i + 1] >> s)) * (1 << k) + (points[3 * i + 2] >> s));
    xs.push(k); ys.push(lnD(S.size) / LN2); comptes.push(S.size);
  }
  const m = xs.length, mx = xs.reduce((a, b) => a + b) / m, my = ys.reduce((a, b) => a + b) / m;
  let nu = 0, de = 0; for (let i = 0; i < m; i++) { nu += (xs[i] - mx) * (ys[i] - my); de += (xs[i] - mx) ** 2; }
  return { dimension: nu / de, comptes, echelles: xs.map((k) => 1 << k) };
}
export function signature(points, q) { // histogramme 8x8x8 normalise
  const h = new Float64Array(512), n = points.length / 3, s = q - 3;
  for (let i = 0; i < n; i++) h[((points[3 * i] >> s) * 8 + (points[3 * i + 1] >> s)) * 8 + (points[3 * i + 2] >> s)] += 1 / n;
  return h;
}
export function distance(a, b) { let t = 0; for (let i = 0; i < 512; i++) t += Math.abs(a[i] - b[i]); return t / 2; }

// geometrie des points projetes : valeurs propres de la covariance 3x3 (Jacobi cyclique, racines carrees SEULEMENT -> bits identiques
//   d un moteur JS a l autre ; ni atan2 ni sin/cos). Rend ev decroissantes, plat = sqrt(ev3/ev1), ligne = sqrt(ev2/ev1).
export function geometrie(points) {
  const n = points.length / 3, mu = [0, 0, 0];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) mu[c] += points[3 * i + c];
  for (let c = 0; c < 3; c++) mu[c] /= n;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < n; i++) {
    const v0 = points[3 * i] - mu[0], v1 = points[3 * i + 1] - mu[1], v2 = points[3 * i + 2] - mu[2], v = [v0, v1, v2];
    for (let a = 0; a < 3; a++) for (let b = a; b < 3; b++) A[a][b] += v[a] * v[b];
  }
  for (let a = 0; a < 3; a++) for (let b = a; b < 3; b++) { A[a][b] /= n; A[b][a] = A[a][b]; }
  for (let balayage = 0; balayage < 30; balayage++) {
    const hors = Math.abs(A[0][1]) + Math.abs(A[0][2]) + Math.abs(A[1][2]);
    if (!(hors > 1e-12 * (Math.abs(A[0][0]) + Math.abs(A[1][1]) + Math.abs(A[2][2]) + 1e-300))) break;
    for (let p = 0; p < 2; p++) for (let q = p + 1; q < 3; q++) {
      if (A[p][q] === 0) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const x = A[k][p], y = A[k][q]; A[k][p] = c * x - s * y; A[k][q] = s * x + c * y; }
      for (let k = 0; k < 3; k++) { const x = A[p][k], y = A[q][k]; A[p][k] = c * x - s * y; A[q][k] = s * x + c * y; }
    }
  }
  const ev = [A[0][0], A[1][1], A[2][2]].map((x) => Math.max(0, x)).sort((a, b) => b - a);
  return { ev, plat: ev[0] > 0 ? Math.sqrt(ev[2] / ev[0]) : 0, ligne: ev[0] > 0 ? Math.sqrt(ev[1] / ev[0]) : 0 };
}

/** la trajectoire longue d une oeuvre (prolonge la stockee) ; regeneree depuis les params si l objet ne la porte pas */
export function lyapunovLong(o) {
  const f = o && typeof o.prolonger === 'function' ? o.prolonger : (() => { const g = generer(o.params); return g.bornee ? g.prolonger : () => ({ bornee: false, etapes: 0, fenetres: [] }); })();
  return f();
}

// les raisons d un refus : un CODE stable (l ecran le traduit) et une phrase. Ordre des tests = ordre des raisons.
export const RAISONS = Object.freeze({
  DIVERGE: 'diverge',
  DIVERGE_LONG: 'diverge (trajectoire longue)',
  CYCLE: 'non chaotique (cycle limite ou point fixe)',
  CYCLE_LONG: 'non chaotique sur la trajectoire longue (cycle limite lent)',
  COURBE: 'dimension trop basse (courbe)',
  PLAT: 'plat (feuille ou ligne vue de profil)',
  DOUBLON: 'quasi-doublon',
  SIGNATURE_NON_LUE: 'signature d une oeuvre existante non lue',
});

export function certifier(o, existantes = []) {
  const raisons = [], codes = [];
  const refus = (code) => { codes.push(code); raisons.push(RAISONS[code]); };
  if (!o.bornee) return { ok: false, bornee: false, echappeA: o.echappeA, lyapunov: NaN, dimension: NaN, distanceMin: NaN, raisons: [RAISONS.DIVERGE], codes: ['DIVERGE'] };
  const lyap = o.lyapunov, bd = dimensionBoites(o.points, o.params.q), sig = signature(o.points, o.params.q), geo = geometrie(o.points);
  /* ⛔ une signature existante ILLISIBLE n est jamais ecartee en silence : la distance n est pas mesuree, l oeuvre est refusee (NON_LU) */
  let dmin = 1, nonLues = 0;
  for (const e of existantes) {
    const s = e && (e.signature || e);
    if (!s || typeof s.length !== 'number' || s.length !== 512) { nonLues++; continue; }
    const d = distance(sig, s); if (!(d >= 0)) { nonLues++; continue; } if (d < dmin) dmin = d;
  }
  const L = lyap > LYAP_MIN ? lyapunovLong(o) : null;
  const dimMin = o.params.operateur === 'couplage' ? DIM_MIN_COUPLAGE : DIM_MIN;
  if (!(lyap > LYAP_MIN)) refus('CYCLE');
  else if (!L || !L.bornee) refus('DIVERGE_LONG');
  else if (!(L.fenetres.length === LYAP_FENETRES && L.fenetres.every((x) => x > LYAP_MIN))) refus('CYCLE_LONG');
  if (!(bd.dimension > dimMin)) refus('COURBE');
  if (!(geo.plat >= PLAT_MIN)) refus('PLAT');
  if (nonLues > 0) refus('SIGNATURE_NON_LUE');
  else if (dmin < SEUIL_DISTINCT) refus('DOUBLON');
  return { ok: raisons.length === 0, etat: nonLues > 0 ? 'NON_LU' : raisons.length ? 'REFUSE' : 'CERTIFIE', bornee: true, etapes: o.params.n, lyapunov: lyap, uniteLyapunov: o.uniteLyapunov,
    lyapunovFenetres: L ? L.fenetres : [], etapesLongues: L ? L.etapes : 0,
    dimension: bd.dimension, dimensionMin: dimMin, comptesBoites: bd.comptes, plat: geo.plat, distanceMin: dmin, signaturesNonLues: nonLues, signature: sig, raisons, codes };
}

// ---------- couches (chaque dimension / chaque paire, separement) ----------
export function couches(o, max = 400) {
  const { D, n, brut } = o, pas = Math.ceil(n / max), q = (v, lo, hi) => (hi > lo ? Math.round((v - lo) / (hi - lo) * 1023) : 0);
  const lo = [], hi = [];
  for (let j = 0; j < D; j++) { let a = Infinity, b = -Infinity; for (let i = 0; i < n; i++) { const v = brut[i * D + j]; if (v < a) a = v; if (v > b) b = v; } lo.push(a); hi.push(b); }
  const series = [], paires = [];
  for (let j = 0; j < D; j++) { const v = []; for (let i = 0; i < n; i += pas) v.push(q(brut[i * D + j], lo[j], hi[j])); series.push({ dim: j, valeurs: v }); }
  for (let a = 0; a < D; a++) for (let b = a + 1; b < D; b++) {
    const p = []; for (let i = 0; i < n; i += pas) p.push([q(brut[i * D + a], lo[a], hi[a]), q(brut[i * D + b], lo[b], hi[b])]);
    paires.push({ i: a, j: b, points: p });
  }
  const plansCaches = o.params.angles.map((ang, m) => ({ plan: [m, m + 3], angle: ang }));
  return { D, series, paires, plansCaches };
}

// ---------- encodage condense ----------
// Format : 'T' 'A' 'M' VERSION q ordre varint(n) puis, par coordonnee, zigzag-varint du residu.
// ordre 0 (trajectoire) : residu = v - (2 v[i-1] - v[i-2]) ; ordre 1 (nuage, tri Morton) : residu = v - v[i-1].
function pushVarint(o, v) { while (v >= 0x80) { o.push((v & 0x7f) | 0x80); v >>>= 7; } o.push(v); }
export function encoder({ q, ordre, points }) {
  const n = points.length / 3, o = [0x54, 0x41, 0x4d, VERSION, q, ordre]; pushVarint(o, n);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
    const v = points[3 * i + c], a = i >= 1 ? points[3 * (i - 1) + c] : 0, b = i >= 2 ? points[3 * (i - 2) + c] : a;
    const pred = ordre === 0 ? (i >= 2 ? 2 * a - b : a) : a, d = v - pred;
    pushVarint(o, ((d << 1) ^ (d >> 31)) >>> 0);
  }
  return Uint8Array.from(o);
}
export function decoder(o) {
  if (o[0] !== 0x54 || o[1] !== 0x41 || o[2] !== 0x4d || o[3] !== VERSION) throw new Error('pas un TAM v' + VERSION);
  const q = o[4], ordre = o[5]; let p = 6;
  const lire = () => { let v = 0, m = 1, b; do { b = o[p++]; if (b === undefined) throw new Error('tronque'); v += (b & 0x7f) * m; m *= 128; } while (b & 0x80); return v; };
  const n = lire(), pts = new Int32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
    const z = lire(), d = (z >>> 1) ^ -(z & 1);
    const a = i >= 1 ? pts[3 * (i - 1) + c] : 0, b = i >= 2 ? pts[3 * (i - 2) + c] : a;
    pts[3 * i + c] = (ordre === 0 ? (i >= 2 ? 2 * a - b : a) : a) + d;
  }
  if (p !== o.length) throw new Error('octets en trop');
  const M = (1 << q) - 1, positions = Float64Array.from(pts, (v) => v / M * 2 - 1);
  return { q, ordre, n, points: pts, positions };
}
export function encoderOeuvre(o) { return encoder({ q: o.params.q, ordre: o.params.ordre, points: o.points }); }

// ---------- rejeu ----------
// N'importe qui, avec les params (publics), recalcule les memes octets ; le hash ne PROUVE que
// l'integrite (un hash ne se decode pas : ce sont les octets qui se stockent).
export function rejouer(params) {
  const o = generer(params);
  if (!o.bornee) return { ok: false, raisons: ['diverge'] };
  const octets = encoderOeuvre(o); return { ok: true, octets, hash: keccak256Hex(octets), oeuvre: o };
}
