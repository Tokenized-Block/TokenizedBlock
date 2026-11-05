/* tam-legendes.js — game80 (Phil : « il faut comprendre ce qu on voit, pas juste des graphes et des courbes ») :
 *   pour CHAQUE systeme de tam-science.js SYSTEMES, la legende exacte de ce qui est dessine, en anglais simple.
 *   Chaque colonne a ete relue dans le code de simuler du module (l ecriture de brut) puis confirmee en lancant simuler
 *   aux params par defaut (formes et plages) — voir test-tam-legendes-20261101.mjs. Rien n est devine : une colonne
 *   dont le sens n est pas ecrit dans le module le dit (« not documented in the module »).
 *   Pur : aucun DOM, aucun reseau. Les chaines visibles sont en ASCII (pas de lettre grecque, pas de tiret long).
 *   La vue : la plupart des systemes dessinent brut standardise puis projete N-D -> 3-D ; les systemes de CORPS
 *   (tam-science.js#CORPS) dessinent chaque corps dans le meme espace, une couleur par corps ; un nuage = des tirages ;
 *   un FILM (o.film du module) se dessine image par image, une couleur par moment — sa disposition ici = celle du module. */
import { SYSTEMES, CORPS } from './tam-science.js';

const N_DEFAUT = 1500;
/* la couleur hors corps (tam-onglet.js#dimDominante) : la colonne la plus loin de sa moyenne en ce point */
const court = (c) => String(c).split(' (')[0].split(':')[0];
function couleursDominantes(colonnes) {
  return 'Colour = the column that is farthest from its own average at that point (after scaling): '
    + colonnes.map((c, j) => 'colour ' + (j + 1) + ' = ' + court(c)).join(', ') + '.';
}
function couleursCorps(noms, centre) {
  return 'One colour per body, in this order: ' + noms.map((b, j) => 'colour ' + (j + 1) + ' = ' + b).join(', ') + '.'
    + (centre ? ' The marker at the centre is the ' + centre + '.' : '');
}
/* bornage local (meme regle que les modules : non fini -> defaut, ramene dans les bornes, entier arrondi) */
function lire(id, params, cle, entier) {
  const s = SYSTEMES.find((x) => x.id === id); if (!s) return undefined;
  let v = Number(params && params[cle]); if (!Number.isFinite(v)) v = s.params[cle];
  const b = s.bornes[cle]; if (b) v = Math.min(b[1], Math.max(b[0], v));
  return entier ? Math.round(v) : v;
}
/* game80 : les grandes questions dont les NOMS vivent dans le module (table d etoiles, evenements) : relus dans sa sortie, jamais recopies */
function lusDansLeModule(id, params) { const s = SYSTEMES.find((x) => x.id === id); return s.mod.simuler(id, params, { n: 40 }).invariants; }
/* game81 : les champs quantiques declarent leur film (o.film) et leur configuration ; on les relit dans la sortie du module
 *   (n lignes), jamais recalcules ici. Petit cache : la page redemande la legende a chaque dessin. */
const CACHE_MODULE = new Map();
function sortieDuModule(id, params, n) {
  const cle = id + '|' + n + '|' + JSON.stringify(params || {});
  if (!CACHE_MODULE.has(cle)) { if (CACHE_MODULE.size > 64) CACHE_MODULE.clear(); const s = SYSTEMES.find((x) => x.id === id); CACHE_MODULE.set(cle, s.mod.simuler(id, params, { n })); }
  return CACHE_MODULE.get(cle);
}
/* les films de tam-champs-quantiques.js : la disposition = o.film du module ; colonneTemps et le sens d une image dits ici */
const FILMS_DU_MODULE = {
  champLibre: { colonneTemps: 1 },
  fluctuationsVide: { colonneTemps: null, note: 'each moment is an independent random sample of the vacuum, not a later time' },
  interactionChamps: { colonneTemps: 1 },
  paireSchwinger: { colonneTemps: null, note: 'each frame is the whole worldline of one particle (an electron, then its positron, pair after pair), not one instant' },
  couplageCourant: { colonneTemps: null, note: 'frame 1 is the electromagnetic curve, frame 2 the strong-force curve; they are not instants of time' },
  atomes: { colonneTemps: null, note: 'each frame is the cloud of one electron, in filling order' },
  quarks: { colonneTemps: null, note: 'the string is stretched from frame to frame; the last frame is after it has broken' },
  /* game88 : tam-vide-quantique.js — chaque image = l etat des modes a un instant */
  emissionSpontanee: { colonneTemps: 1 },
  /* game93 : tam-theories-2.js */
  kuramoto: { colonneTemps: 3 },
  gibbsFourier: { colonneTemps: null, note: 'each frame adds more sine terms (N grows); frames are not instants of time' },
  /* game96 : tam-theories-3.js */
  rutherford: { colonneTemps: 3, note: 'each frame is one trajectory (one impact parameter), not an instant' },
  chaleur: { colonneTemps: 1 },
  brachistochrone: { colonneTemps: 2, note: 'frame 1 is the cycloid, 2 the straight line, 3 the circular arc; the same start and end' },
  /* game111 : tam-biologie.js — chaque image = la meme sequence a un instant plus tard */
  adnMutations: { colonneTemps: 4 },
  /* game112 */
  deriveGenetique: { colonneTemps: 0, note: 'each frame is one population, followed over all its generations' },
  /* game113 : chaque image = les memes molecules a un instant plus tard */
  equilibreChimique: { colonneTemps: 2 },
  /* game114 */
  /* game120 */
  cordeVibrante: { colonneTemps: 2 },
  /* game123 */
  modesNormaux: { colonneTemps: 2 },
  /* game126 */
  penduleAmplitude: { colonneTemps: 2, note: 'each frame is one release angle, from theta0/6 to theta0' },
  phasesLune: { colonneTemps: null, note: 'each frame is one phase, from full Moon (0) to the phase chosen' },
  /* game118 */
  gazParfait: { colonneTemps: null, note: 'each frame is the same gas a little later (positions are exact, folded off the walls)' },
  /* game115 */
  marcheAleatoire: { colonneTemps: 2, note: 'each frame is one walker, followed step by step' },
  neurone: { colonneTemps: 0, note: 'each frame is one input current, from 0.4 to 1.6 times the one chosen; frames are not instants' },
};
const COUPLAGES = ['Electromagnetic coupling (1/alpha)', 'Strong coupling (1/alpha_s)'];
/* atomes : les sous-couches remplies, lues dans la configuration que le module rend (ex. « 1s2 2s2 2p6 ... ») */
function sousCouches(params) {
  return sortieDuModule('atomes', params, N_DEFAUT).invariants.configuration.split(' ').map((t) => 'Subshell ' + t.slice(0, 2) + ' (' + t.slice(2) + ' electron' + (t.slice(2) === '1' ? '' : 's') + ')');
}
const SURFACES = ['Sphere (closed universe, curvature +1)', 'Flat plane (curvature 0)', 'Hyperbolic surface (open universe, curvature -1)'];
const TRAPPIST = ['b', 'c', 'd', 'e', 'f', 'g', 'h'];
const PLANETES = ['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const CENTRES = { systemeSolaire: 'Sun', cometeHalley: 'Sun', trappist1: 'star TRAPPIST-1', amasEtoiles: 'centre of mass, near where the black hole starts (the black hole itself also moves and is not drawn)', lumiereTrouNoir: 'black hole', trouDeVer: 'wormhole throat' };

/** le nom de chaque corps, dans l ordre des colonnes ; null hors systeme de corps */
export function nomsDe(id, params = {}) {
  switch (id) {
    case 'systemeSolaire': return lire(id, params, 'groupe', true) === 1 ? PLANETES.slice(4, 8) : PLANETES.slice(0, 4);
    case 'trappist1': { const p = lire(id, params, 'premiere', true); return TRAPPIST.slice(p, p + 4).map((x) => 'TRAPPIST-1 ' + x); }
    case 'tourbillonsPonctuels': { const k = lire(id, params, 'nombre', true); return Array.from({ length: k }, (_, i) => 'Vortex ' + (i + 1)); }
    case 'troisCorps': return ['Star 1', 'Star 2', 'Star 3'];
    case 'amasEtoiles': return ['Star 1', 'Star 2', 'Star 3', 'Star 4'];
    case 'lumiereTrouNoir': return ['Light ray 1', 'Light ray 2', 'Light ray 3', 'Light ray 4'];
    case 'expansionUnivers': return ['Galaxy 1', 'Galaxy 2', 'Galaxy 3', 'Galaxy 4'];
    case 'cometeHalley': return ['Halley', 'Earth'];
    case 'trouDeVer': return ['Light ray 1', 'Light ray 2'];
    case 'pulsarHulseTaylor': return ['Pulsar', 'Companion star'];
    /* game80 : les grandes questions qui dessinent des objets nommes (pas des systemes de CORPS : la page les projette) */
    case 'versMars': { const a = lire(id, params, 'aCible'); return ['Spacecraft', 'Earth', Math.abs(a - 1.524) < 0.005 ? 'Mars' : 'Target planet (orbit at ' + (Math.round(a * 1000) / 1000) + ' AU)']; }
    case 'bigRip': return Array.from({ length: 12 }, (_, i) => 'Galaxy ' + (i + 1));
    case 'geometrieUnivers': return SURFACES.slice();
    case 'etoilesHR': return lusDansLeModule(id, params).etoiles.noms.slice();
    case 'tailleEtoiles': return lusDansLeModule(id, params).rayons.map((r) => r.nom);
    case 'calendrierCosmique': return lusDansLeModule(id, params).evenements.map((e) => e.nom);
    /* game81 : les deux courbes du couplage courant ; les sous-couches d un atome */
    case 'couplageCourant': return COUPLAGES.slice();
    case 'atomes': return sousCouches(params);
    default: return null;
  }
}
const xyz = (nom, u) => ['x of ' + nom + ' (' + u + ')', 'y of ' + nom + ' (' + u + ')', 'z of ' + nom + ' (' + u + ')'];
const parCorps = (noms, u) => noms.flatMap((b) => xyz(b, u));

/* game80 : la disposition d un film, la MEME regle que les modules (tam-invisible.js#filmDe) : image(i) = numero d image de la
 *   ligne i ; debuts / tailles par image ; parImage = taille commune si toutes egales, sinon null (comme le module le dit) */
function disposition(n, image) {
  const debuts = []; let p = -1;
  for (let i = 0; i < n; i++) { const f = image(i); if (f !== p) { debuts.push(i); p = f; } }
  const tailles = debuts.map((d, k) => (k + 1 < debuts.length ? debuts[k + 1] : n) - d);
  return { images: debuts.length, parImage: tailles.every((t) => t === tailles[0]) ? tailles[0] : null, debuts, tailles };
}
/* images regulieres de m lignes, les lignes en trop (n - F m) hors de toute image (tam-grandes-questions*.js : { images, parImage }) */
function regulieres(n, F, m) {
  return { images: F, parImage: m, debuts: Array.from({ length: F }, (_, k) => k * m), tailles: Array(F).fill(m), ...(n > F * m ? { reste: n - F * m } : {}) };
}
/** un film : les lignes sont des images successives ; colonneTemps = la colonne qui porte l instant (null : aucune) */
function filmDe(id, params = {}, n = N_DEFAUT) {
  let f = null, colonneTemps = null, note = null;
  if (FILMS_DU_MODULE[id]) {
    const M = sortieDuModule(id, params, n).film; if (!M) return null;
    f = { images: M.images, parImage: M.parImage ?? null, debuts: M.debuts.slice(), tailles: M.tailles.slice() };
    colonneTemps = FILMS_DU_MODULE[id].colonneTemps; note = FILMS_DU_MODULE[id].note || null;
  } else switch (id) {
    case 'supernova': case 'supernovaHydro': f = disposition(n, (i) => Math.min(15, Math.floor(i * 16 / n))); colonneTemps = 3; break;
    case 'collisionGalaxies': { let F = 1; for (let d = Math.min(12, n); d >= 1; d--) if (n % d === 0 && n / d >= 2) { F = d; break; }
      f = disposition(n, (i) => Math.floor(i / (n / F))); note = 'moments from before the encounter to the end'; break; }
    case 'effetTunnel': { const m = Math.ceil(n / 25); f = disposition(n, (i) => Math.min(24, Math.floor(i / m))); colonneTemps = 1; break; }
    case 'superpositionQuantique': { const F = lire(id, params, 'images', true), m = Math.ceil(n / F); f = disposition(n, (i) => Math.min(F - 1, Math.floor(i / m))); colonneTemps = 2; break; }
    case 'ondeGravitationnelle': { const N = lire(id, params, 'masses', true); f = disposition(n, (i) => Math.floor(i / N)); colonneTemps = 2; break; }
    /* game80 : les grandes questions */
    case 'fauxVide': { const F = Math.min(12, n); f = regulieres(n, F, Math.floor(n / F)); colonneTemps = null; break; }
    case 'versMars': { const F = Math.max(1, Math.floor(n / 3)); if (F < 2) return null; f = regulieres(n, F, 3); colonneTemps = 2; note = 'each moment has 3 points: the spacecraft, Earth, then the target planet'; break; }
    case 'tsunami': { const F = Math.min(24, n); f = regulieres(n, F, Math.max(1, Math.floor(n / F))); colonneTemps = 3; break; }
    default: return null;
  }
  /* game82 (audit, atomes Z = 1) : la page ne lit un film qu a partir de 2 images (tam-onglet.js#filmDe) ; 1 image = pas de film */
  if (!(f.images >= 2)) return null;
  if (f.parImage === null) note = 'frames of unequal size: ' + [...new Set(f.tailles)].join(' or ') + ' rows' + (note ? '; ' + note : '');
  if (f.reste) note = (note ? note + '; ' : '') + 'the last ' + f.reste + ' rows repeat points of the last moment and belong to no frame';
  return { images: f.images, parImage: f.parImage, debuts: Object.freeze(f.debuts), tailles: Object.freeze(f.tailles), ordre: 'images-successives', colonneTemps, ...(note ? { note } : {}) };
}
/* ce que la page dessine dans un film (tam-onglet.js#dessiner) : une couleur par moment (couleurDim(q % 12)), le moment courant
 *   en clair, les deux precedents en pale ; la couleur par colonne n y sert pas */
function couleursFilm(F) {
  return 'A film of ' + F.images + ' moments: each moment has its own colour (12 colours that repeat); the current moment is bright and the two moments before it are faint.';
}

/* ---- les legendes ; colonnes = tableau, ou fonction des params (systemes dont la taille ou les noms changent) ---- */
const L = {
  /* ---------- tam-physique.js ---------- */
  schwarzschild: {
    titre: 'Orbit around a black hole',
    enUnePhrase: 'A small body circling a non-rotating black hole, seen from above, with time lifting the path into a spiral staircase.',
    colonnes: ['x in the orbit plane (black-hole mass units, G = c = M = 1)', 'y in the orbit plane (same units)', 'time (scaled so it ends at twice the largest distance; goes up as the path is drawn)'],
    aRegarder: ['The orbit does not close: each turn starts a little further round. That is general relativity\'s precession (Mercury does the same, much more slowly).', 'Compare with the Newtonian orbit, same start: there the loops close exactly.'],
    fin: 'ends early at the horizon (r = 2M) if the body falls in, or at 10 times the starting distance if it is not bound and flies away for ever',
  },
  kepler: {
    titre: 'Newtonian orbit',
    enUnePhrase: 'The same start as the black-hole orbit, under Newton\'s gravity: a closed ellipse, lifted by time.',
    colonnes: ['x in the orbit plane (central-mass units, G = M = 1)', 'y in the orbit plane (same units)', 'time (scaled so it ends at twice the largest distance; goes up as the path is drawn)'],
    aRegarder: ['Seen from above every loop lands exactly on the previous one: no precession in Newton\'s gravity.'],
    fin: 'ends at 10 times the starting distance if the speed is above escape speed (the path is then a hyperbola or parabola, not an ellipse)',
  },
  troisCorps: {
    titre: 'Three-body problem',
    enUnePhrase: 'Three equal stars pulling on each other; with no nudge they chase each other along one figure-eight.',
    colonnes: () => parCorps(nomsDe('troisCorps'), 'units with G = mass = 1'),
    aRegarder: ['With the nudge at 0 the three paths lie on the same figure-eight.', 'A small nudge breaks the eight: the paths drift apart and become chaotic.', 'The z columns stay at 0 unless the nudge lifts star 1 out of the plane.'],
    fin: 'stops early only if two stars collide or one escapes',
  },
  tokamak: {
    titre: 'Particle in a tokamak field',
    enUnePhrase: 'One charged particle spiralling round a doughnut-shaped magnetic field, seen in 3-D.',
    colonnes: ['x (the doughnut\'s main radius is 1)', 'y (same units)', 'z, height above the middle plane (same units)'],
    aRegarder: ['The fast tiny circles are the gyration around the field line.', 'If the particle reverses along the field it is trapped on a banana-shaped orbit; otherwise it goes all the way round.'],
    fin: 'stops early if the particle touches the wall (distance 0.8 from the doughnut\'s core)',
  },
  doublePendule: {
    titre: 'Double pendulum',
    enUnePhrase: 'The path of the lower bob of a double pendulum, lifted by how fast the lower arm spins.',
    colonnes: ['x of the lower bob (arm length 1)', 'y of the lower bob (arm length 1, negative = below the pivot)', 'spin speed of the lower arm (radians per time unit, g = 1)', 'spin speed of the upper arm (radians per time unit; hidden dimension)'],
    aRegarder: ['The path never repeats: tiny changes in the start angles give a completely different picture (chaos).'],
    fin: null,
  },
  lorentzRelativiste: {
    titre: 'Relativistic charge in crossed fields',
    enUnePhrase: 'A charged particle in an electric field crossed with a magnetic field: it loops while drifting sideways.',
    colonnes: ['x, along the electric field (units with c = charge = mass = B = 1)', 'y, the drift direction (same units)', 'z, along the magnetic field (same units)'],
    aRegarder: ['The loops are the gyration; the steady slide along y is the E x B drift.', 'The loops are not perfect circles: the particle speeds up and slows down, and relativity changes its mass.'],
    fin: null,
  },
  hydrogene: {
    titre: 'Hydrogen electron cloud',
    enUnePhrase: 'Where the electron of a hydrogen atom can be found: each dot is one possible position, not a path.',
    colonnes: ['x (Bohr radii, about 0.053 nm)', 'y (Bohr radii)', 'z, the quantisation axis (Bohr radii)'],
    aRegarder: ['Dense lobes = likely places; empty shells and cones are nodes where the electron is never found.', 'The electron has no orbit: the order of the dots means nothing.'],
    fin: null,
  },
  /* ---------- tam-sciences.js ---------- */
  mandelbrot: {
    titre: 'Mandelbrot set boundary',
    enUnePhrase: 'Points just outside the Mandelbrot set, raised by how long they took to escape.',
    colonnes: ['real part of c (horizontal position in the complex plane)', 'imaginary part of c (vertical position)', 'natural log of the escape time (number of steps before |z| > 2)'],
    aRegarder: ['The highest points hug the boundary: the closer to the set, the longer they take to escape.'],
    fin: null,
  },
  mandelbulb: {
    titre: 'Mandelbulb surface',
    enUnePhrase: 'Points on the outer surface of the 3-D Mandelbulb fractal, one per direction.',
    colonnes: ['x (fractal coordinates; the whole shape fits inside radius 2)', 'y (same units)', 'z (same units)'],
    aRegarder: ['The bumps repeat around the vertical axis (power minus 1 times per turn).', 'Only the outer skin is sampled: hidden folds inside are not drawn.'],
    fin: null,
  },
  spiraleOr: {
    titre: 'Golden spiral',
    enUnePhrase: 'A spiral that grows by the golden ratio every quarter turn, climbing slowly, next to the corners of Fibonacci squares.',
    colonnes: ['x (scaled so the largest square corner is at distance 1 from the spiral centre)', 'y (same units)', 'height (climbs with the angle; the square corners sit at the height of their quarter turn)'],
    aRegarder: ['The first rows are the smooth spiral; the last rows (4 per square) are the corners of the Fibonacci squares.', 'The squares only approach the golden rectangle: their sides are whole numbers.'],
    fin: null,
  },
  phyllotaxieOr: {
    titre: 'Golden-angle phyllotaxis',
    enUnePhrase: 'Seeds placed on a ball, each one turned by the golden angle (137.5 degrees) from the last, like a sunflower head.',
    colonnes: ['x on the unit sphere', 'y on the unit sphere', 'z on the unit sphere (seed 1 at the top, the last seed at the bottom)'],
    aRegarder: ['With the golden angle the seeds spread evenly with no gaps; move the offset slider and spokes appear.'],
    fin: null,
  },
  ifs3d: {
    titre: 'Sierpinski tetrahedron',
    enUnePhrase: 'The chaos game: jump part of the way to a random corner of a tetrahedron, again and again; the dots draw a fractal.',
    colonnes: ['x (the tetrahedron fits in the unit cube)', 'y (unit cube)', 'z (unit cube)'],
    aRegarder: ['Each small tetrahedron is a copy of the whole. At ratio 1/2 the holes are exact; below 1/2 the copies separate.'],
    fin: null,
  },
  bloch: {
    titre: 'Spin-1/2 Rabi oscillation',
    enUnePhrase: 'The direction of a quantum spin driven by a field, drawn as an arrow tip moving on a ball of radius 1.',
    colonnes: ['spin x component (average value, from -1 to 1)', 'spin y component (average value, from -1 to 1)', 'spin z component (1 = up, -1 = down)'],
    aRegarder: ['The path stays exactly on the ball: a pure quantum state.', 'Off resonance the spin never fully flips: the lowest point stays above the bottom.'],
    fin: null,
  },
  paquetOscillateur: {
    titre: 'Wavepacket in a harmonic well',
    enUnePhrase: 'A quantum wave packet sloshing in a bowl-shaped well, drawn as its average position, average momentum and width.',
    colonnes: ['average position (units with hbar = mass = 1)', 'average momentum (same units)', 'width of the packet (spread of position)'],
    aRegarder: ['Position and momentum trace a circle or ellipse: the packet swings like a classical ball.', 'At width 1 the third column stays flat (a coherent state); other widths make the packet breathe twice per swing.'],
    fin: null,
  },
  fentesYoung: {
    titre: 'Double-slit detections',
    enUnePhrase: 'Single particles hitting a screen behind two slits, one dot per hit, stacked in the order they arrived.',
    colonnes: ['position across the screen (mm)', 'position along the slits (mm; spread evenly, no physics in it)', 'order of arrival (scaled to the screen window width; first hit at the bottom)'],
    aRegarder: ['Each particle lands at one spot, yet together they build bands: the interference pattern of a wave.', 'The bands appear only after many hits: look at the bottom (few hits) versus the top.'],
    fin: null,
  },
  boiteQuantique: {
    titre: 'Particle in a box',
    enUnePhrase: 'Where a quantum particle trapped in a hard-walled cube can be found: each dot is one possible position.',
    colonnes: ['x inside the box (box side 1, centred on 0)', 'y inside the box', 'z inside the box'],
    aRegarder: ['Empty flat planes are nodes: the particle is never found there. Their number follows the three quantum numbers.'],
    fin: null,
  },
  /* ---------- tam-fluides.js ---------- */
  tourbillonsPonctuels: {
    titre: 'Point vortices',
    enUnePhrase: 'Three or four tiny whirlpools in a flat ideal fluid, each one pushed around by the others, seen from above.',
    colonnes: (p) => nomsDe('tourbillonsPonctuels', p).flatMap((b) => ['x of ' + b + ' (fluid length units)', 'y of ' + b + ' (fluid length units)']),
    aRegarder: ['Three vortices dance in a regular pattern; four usually become chaotic.', 'The weighted centre and spread of the vortices never change: the fluid conserves them.'],
    fin: 'stops early only if two vortices collide',
  },
  doubleGyre: {
    titre: 'Double gyre',
    enUnePhrase: 'One floating speck carried by two side-by-side whirls that sway back and forth, lifted by time.',
    colonnes: ['x in the box (0 to 2)', 'y in the box (0 to 1)', 'time (scaled from 0 to 2; goes up as the path is drawn)'],
    aRegarder: ['The speck jumps between the left and right whirl at irregular times: chaotic mixing by a simple flow.'],
    fin: null,
  },
  karman: {
    titre: 'Von Karman vortex street',
    enUnePhrase: 'A floating speck carried by two rows of whirlpools, like the wake behind a pole in a river.',
    colonnes: ['x along the street (vortex spacing = 1)', 'y across the street (same units)', 'time, as the distance the vortex street has drifted (same units)'],
    aRegarder: ['The speck loops around passing vortices while being swept along.'],
    fin: 'stops early if the speck gets too close to a vortex centre',
  },
  rayleighBenard: {
    titre: 'Convection rolls',
    enUnePhrase: 'A floating speck in rolls of rising and sinking fluid whose walls sway sideways, lifted by time.',
    colonnes: ['x, sideways (one roll is 1 wide)', 'height in the fluid layer (0 = bottom, 1 = top)', 'time (scaled from 0 to 2; goes up as the path is drawn)'],
    aRegarder: ['With no sway the speck circles in one roll forever; with sway it hops from roll to roll.'],
    fin: 'stops early if the speck leaves the layer',
  },
  /* ---------- tam-astro.js ---------- */
  systemeSolaire: {
    titre: 'Our solar system',
    enUnePhrase: 'Four planets going around the Sun, from 1 January 2000, real orbits in 3-D.',
    colonnes: (p) => parCorps(nomsDe('systemeSolaire', p), 'AU, Sun at the centre, ecliptic plane'),
    aRegarder: ['Inner planets go round much faster than outer ones (Kepler\'s third law).', 'The orbits are slightly tilted and off-centre ellipses, as measured.'],
    fin: null,
  },
  etoileS2: {
    titre: 'Star S2 around our black hole',
    enUnePhrase: 'The star S2 orbiting the giant black hole at the centre of our galaxy, on its measured orbit.',
    colonnes: ['x (AU; axes follow the published orbit angles, exact sky orientation not documented in the module)', 'y (AU)', 'z (AU)'],
    aRegarder: ['A very stretched ellipse: S2 dives to about 120 AU from the black hole, then swings out to about 2000 AU.', 'The real precession (12 arc-minutes per orbit) is too small to see by eye.'],
    fin: null,
  },
  binaireTrouNoir: {
    titre: 'Black hole binary inspiral',
    enUnePhrase: 'Two black holes spiralling together as they lose energy to gravitational waves, drawn as their relative orbit.',
    colonnes: ['x of the relative orbit (total-mass units, G = c = 1)', 'y of the relative orbit (same units)', 'time (scaled so it ends at twice the starting size)', 'eccentricity (0 = circle, near 1 = very stretched)'],
    aRegarder: ['The orbit shrinks and becomes rounder: eccentricity falls as the waves carry energy away.', 'The ellipse also turns slowly (relativistic periastron advance).'],
    fin: 'stops when the closest approach reaches 6 mass units (this averaged model ends before the merger)',
  },
  amasEtoiles: {
    titre: 'Star cluster around a black hole',
    enUnePhrase: 'Four stars of a small cluster moving around a central black hole, all pulling on each other.',
    colonnes: () => parCorps(nomsDe('amasEtoiles'), 'cluster units with G = 1, total star mass 1'),
    aRegarder: ['Only 4 of the stars are drawn; the others still pull on them.', 'Close passes kick stars onto new paths: the motion is chaotic.'],
    fin: null,
  },
  supernova: {
    titre: 'Supernova remnant',
    enUnePhrase: 'The shock front of an exploded star at 16 moments, each moment a shell of dots.',
    colonnes: ['x (parsecs)', 'y (parsecs)', 'z (parsecs)', 'time since the explosion (years, 16 moments evenly spaced on a log scale)'],
    aRegarder: ['Early shells grow fast (free expansion), late shells slowly (the blast wave slows as it sweeps up gas).'],
    fin: null,
  },
  supernovaHydro: {
    titre: 'Supernova blast wave (hydrodynamics)',
    enUnePhrase: 'The gas pushed by a point explosion, computed by real fluid equations, at 16 moments.',
    colonnes: ['x (parsecs)', 'y (parsecs)', 'z (parsecs)', 'time since the explosion (years)', 'gas density divided by the surrounding density'],
    aRegarder: ['Most dots crowd just behind the shock: the swept-up gas piles there, up to about 4 times denser.', 'The shell radius grows as time to the power 2/5, as Sedov and Taylor predicted.'],
    fin: null,
  },
  binaireFusion: {
    titre: 'Black hole merger signal',
    enUnePhrase: 'The gravitational-wave signal of two black holes merging: wave height against time, getting faster and stronger.',
    colonnes: ['time (seconds; 0 = start of the final ringing)', 'wave height, plus polarisation (x 1e21, no detector response)', 'wave height, cross polarisation (x 1e21)', 'wave frequency (Hz)'],
    aRegarder: ['The chirp: frequency and height grow faster and faster before the merger.', 'After the merger the new black hole rings at one frequency and fades.'],
    fin: 'merger, then the ringing of the final black hole dies out',
  },
  collisionGalaxies: {
    titre: 'Colliding galaxies',
    /* game80 : la collision est un FILM (12 moments : les noyaux s approchent, se croisent, les queues de maree se forment) */
    enUnePhrase: 'A film of two disk galaxies flying past each other: the cores approach, swing around each other and tides pull out long tails of stars.',
    colonnes: ['x (units of the closest-approach distance)', 'y (same units)', 'z (same units)'],
    aRegarder: ['Move the Moment slider (or let it play): each moment shows the same stars at a later time.', 'Long tails of stars are thrown out by tides when a disk spins the same way as the encounter; a disk spinning the other way stays almost intact.'],
    fin: 'the tidal tails are fully formed at the last moment',
  },
  /* ---------- tam-cosmos.js ---------- */
  lumiereTrouNoir: {
    titre: 'Light bending around a black hole',
    enUnePhrase: 'Four light rays passing a black hole, each lifted by the angle it has swept around it.',
    colonnes: () => nomsDe('lumiereTrouNoir').flatMap((b) => ['x of ' + b + ' (black-hole mass units)', 'y of ' + b + ' (same units)', 'angle swept by ' + b + ' (radians)']),
    aRegarder: ['A ray aimed closer than 5.2 units is swallowed; just outside it, the ray circles the black hole before escaping.', 'Far rays are only slightly bent.'],
    fin: 'rays below the critical distance end at the horizon',
  },
  kerr: {
    titre: 'Orbit around a spinning black hole',
    enUnePhrase: 'A small body orbiting a spinning black hole on a tilted orbit, in 3-D.',
    colonnes: ['x (black-hole mass units)', 'y (same units)', 'z, along the spin axis (same units)'],
    aRegarder: ['The tilted orbit plane slowly turns around the spin axis: the black hole drags space with it (frame dragging).'],
    fin: 'stops early if the body falls through the horizon',
  },
  trouDeVer: {
    titre: 'Light through a wormhole',
    enUnePhrase: 'Two light rays on the shape of a theoretical wormhole: one goes through the throat, one turns back.',
    colonnes: () => nomsDe('trouDeVer').flatMap((b) => ['x of ' + b + ' (throat-radius units)', 'y of ' + b + ' (same units)', 'height on the wormhole shape for ' + b + ' (negative = first side, positive = other side)']),
    aRegarder: ['The ray that crosses height 0 went through the throat to the other side.', 'The other ray turns back before the throat.'],
    fin: null,
  },
  trouDeVerSurface: {
    titre: 'Wormhole embedding surface',
    enUnePhrase: 'The shape of space around a theoretical wormhole: two funnels joined at a narrow throat.',
    colonnes: ['x (throat-radius units)', 'y (same units)', 'height on the shape (0 = the throat)'],
    aRegarder: ['The narrowest ring is the throat; the two flaring sides are two separate regions of space.'],
    fin: null,
  },
  pointsLagrange: {
    titre: 'Trojans and Lagrange points',
    enUnePhrase: 'A small body near a balance point of a star and its planet, in a frame that turns with the planet.',
    colonnes: ['x in the turning frame (star-planet distance = 1; star near 0, planet near 1)', 'y in the turning frame (same units)', 'z, out of the orbit plane (same units; 0 unless started above the plane)'],
    aRegarder: ['A tadpole loop around the point 60 degrees ahead of the planet (a Trojan), or a horseshoe sliding past it.'],
    fin: 'stops early if the body hits the star or planet or escapes',
  },
  pulsarHulseTaylor: {
    titre: 'Hulse-Taylor binary pulsar',
    enUnePhrase: 'A pulsar and its companion star orbiting each other while the orbit shrinks, hugely sped up up to its merger.',
    colonnes: () => parCorps(nomsDe('pulsarHulseTaylor'), 'light-seconds, centre of mass at 0'),
    aRegarder: ['The two stars stay on opposite sides of the centre; the pulsar, slightly heavier, moves a little less.', 'The orbit shrinks over hundreds of millions of years: gravitational waves carry energy away.'],
    fin: 'the orbit shrinks toward merger (about 300 million years)',
  },
  courbeRotation: {
    titre: 'Galaxy rotation curve',
    enUnePhrase: 'Stars of a model galaxy at increasing distance from the centre, with their orbital speed with and without dark matter.',
    colonnes: ['x (kpc)', 'y (kpc)', 'orbital speed with the dark-matter halo (km/s)', 'orbital speed from visible matter only (km/s)'],
    aRegarder: ['Speed with the halo stays almost flat far out; without it, it falls. That gap is the evidence for dark matter.', 'The four arms wind up because inner stars go round faster.'],
    fin: null,
  },
  expansionUnivers: {
    titre: 'Expanding universe',
    enUnePhrase: 'Four galaxies moving away from us as the universe expands, from the Big Bang onward.',
    colonnes: () => parCorps(nomsDe('expansionUnivers'), 'billion parsecs, physical distance, we are at the centre'),
    aRegarder: ['Each galaxy moves straight outward: space stretches, the galaxies do not travel through it.', 'Dots are evenly spaced in time: the gaps shrink while gravity slows the expansion, then grow again once dark energy speeds it up.'],
    fin: null,
  },
  cometeHalley: {
    titre: 'Halley\'s comet',
    enUnePhrase: 'Halley\'s comet on its long, tilted, backward orbit around the Sun, with Earth\'s orbit for scale.',
    colonnes: () => [...xyz('Halley', 'AU, Sun at the centre'), 'x of Earth (AU)', 'y of Earth (AU)', 'z of Earth (always 0: Earth is drawn in its own orbit plane)'],
    aRegarder: ['The comet spends most of its 75 years far out and rushes past the Sun.', 'It goes round the opposite way to Earth (retrograde).'],
    fin: null,
  },
  trappist1: {
    titre: 'TRAPPIST-1 planets',
    enUnePhrase: 'Four planets of the star TRAPPIST-1 on circular orbits, seen from above.',
    colonnes: (p) => nomsDe('trappist1', p).flatMap((b) => ['x of ' + b + ' (AU)', 'y of ' + b + ' (AU)']),
    aRegarder: ['The whole system would fit inside Mercury\'s orbit.', 'Neighbouring periods are close to simple ratios like 8:5 and 3:2 (a resonant chain).'],
    fin: null,
  },
  disqueAccretion: {
    titre: 'Black hole accretion disk',
    enUnePhrase: 'Particles of a thin disk swirling around a black hole and slowly drifting inward.',
    colonnes: ['x (black-hole mass units)', 'y (same units)', 'z, the disk\'s thin thickness (same units)', 'orbital speed seen by a still observer (fraction of light speed)'],
    aRegarder: ['The hole in the middle is the innermost stable orbit (6 mass units): nothing orbits closer.', 'The inner particles are fastest, close to half the speed of light.'],
    fin: null,
  },
  /* ---------- tam-invisible.js ---------- */
  ondeGravitationnelle: {
    titre: 'Gravitational wave on a ring',
    enUnePhrase: 'A ring of floating masses squeezed and stretched by a passing gravitational wave, one ring per moment, stacked up in time.',
    colonnes: ['x of a mass (ring radius 1; the wave effect is exaggerated)', 'y of a mass (same units)', 'time (scaled from 0 to 2; one ring per moment)'],
    aRegarder: ['The ring becomes an ellipse one way, then the other way, at the wave\'s rhythm.', 'The plus wave stretches along the axes, the cross wave along the diagonals.'],
    fin: null,
  },
  courbureEspaceTemps: {
    titre: 'Curved space around a black hole',
    enUnePhrase: 'A funnel showing how space is curved around a black hole, with a falling observer on it.',
    colonnes: ['x (black-hole mass units; for the observer, the distance from the centre)', 'y (same units; 0 for the observer)', 'height on the funnel (an embedding drawing, not a real direction)'],
    aRegarder: ['The first rows are the funnel surface, the last fifth is the falling observer.', 'The funnel gets steep near the horizon (2 mass units): distances there are longer than they look.'],
    fin: 'the observer reaches the horizon',
  },
  chuteTrouNoir: {
    titre: 'Falling into a black hole',
    enUnePhrase: 'An observer falling into a black hole: distance from the centre against their own clock and against a faraway clock.',
    colonnes: ['distance from the centre (black-hole mass units)', 'time on the falling observer\'s own clock (same units)', 'time on a faraway clock (same units; clipped, it never reaches the horizon)'],
    aRegarder: ['The observer\'s own clock reaches the centre in a finite time.', 'The faraway clock shoots up at the horizon (distance 2): from far away the fall never ends.'],
    fin: 'the observer reaches the centre; the faraway time is held at the clip from the horizon on',
  },
  dilatationTemps: {
    titre: 'Clocks that tick slower',
    enUnePhrase: 'Several clocks as helices: each turn is the same faraway time, the height is how much each clock really ticked.',
    colonnes: ['x (distance from the mass, mass units)', 'y (same units)', 'time ticked on that clock (same units)'],
    aRegarder: ['Rows come in blocks, one helix per clock: the nearest clock to the mass first, the moving clock last (outermost).', 'Flatter helices = slower clocks: near the mass and when moving fast.'],
    fin: null,
  },
  effetTunnel: {
    titre: 'Quantum tunnelling',
    enUnePhrase: 'A quantum wave packet hitting a barrier, shown as its probability at 25 moments.',
    colonnes: ['position (units with hbar = mass = 1; the barrier starts at 0)', 'time (same units; one moment per frame)', 'probability density |psi|^2'],
    aRegarder: ['Part of the packet passes through a barrier it classically could not cross: that is tunnelling.', 'The ripples before the barrier are the incoming wave interfering with the reflected one.'],
    fin: 'the packet splits into a reflected and a transmitted part',
  },
  superpositionQuantique: {
    titre: 'Quantum superposition',
    enUnePhrase: 'Snapshots of a hydrogen atom in two states at once: its electron cloud sloshes up and down over time.',
    colonnes: ['x (Bohr radii)', 'z, up-down (Bohr radii)', 'time (4 = one full slosh)'],
    aRegarder: ['The cloud leans up, then down, at a beat set by the energy gap of the two states.', 'Each frame is a fresh set of random samples, not the same dots moving.'],
    fin: null,
  },
  champDipolaire: {
    titre: 'Earth\'s magnetic trap',
    enUnePhrase: 'Magnetic field lines of an Earth-like magnet and one charged particle bouncing between the poles along them.',
    colonnes: ['x (Earth radii)', 'y (Earth radii; 0 for the field lines)', 'z, along the magnetic axis (Earth radii)'],
    aRegarder: ['The first 30 percent of rows are field lines; the rest is the particle.', 'The particle bounces between mirror points near the poles and slowly drifts around the Earth, like the Van Allen belts.'],
    fin: null,
  },
  ondeLumiere: {
    titre: 'Light as a wave',
    enUnePhrase: 'The electric and magnetic fields of a light wave along its path, next to the glow pattern of a radio antenna.',
    colonnes: ['wave rows: position along the beam (wavelengths, starts at 3); pattern rows: x of the pattern', 'wave rows: field across, sideways (E, or B times c); pattern rows: y of the pattern', 'wave rows: field across, up (E, or B times c); pattern rows: z, along the antenna'],
    aRegarder: ['The first half of the rows is the wave: rows alternate between the electric field tip and the magnetic field tip.', 'E and B stay at right angles to each other and to the direction of travel.', 'The second half is the doughnut-shaped antenna pattern: no light goes along the antenna axis.'],
    fin: null,
  },
  diagrammeEspaceTemps: {
    titre: 'Spacetime diagram',
    enUnePhrase: 'A grid of events, the light cone and the two twins\' paths, as seen by an observer moving at a chosen speed.',
    colonnes: ['position seen by the moving observer (c = 1)', 'time seen by the moving observer', 'grid rows: interval time^2 - position^2 divided by 5; light-cone rows: 0; twin rows: time ticked by that twin'],
    aRegarder: ['Rows in order: half the rows are the grid, one sixth the light cone, then the stay-at-home twin, then the traveller.', 'The grid tilts with speed, but the light cone does not move: light speed is the same for everyone.', 'The traveller\'s height ends lower: they aged less.'],
    fin: null,
  },
  mouvementBrownien: {
    titre: 'Brownian motion',
    enUnePhrase: 'Random-walk paths of a few particles from the same start, like pollen jiggling in water.',
    colonnes: ['x (length units; each step has spread set by the diffusion slider)', 'y (same units)', 'z (same units)'],
    aRegarder: ['Rows come in blocks of steps plus one, one path per particle, each starting at the origin; the last path is cut short.', 'The spread grows like the square root of time (Einstein\'s law).'],
    fin: null,
  },
  /* ---------- tam-quantique.js ---------- */
  tapisTalbot: {
    titre: 'Quantum carpet (Talbot revivals)',
    enUnePhrase: 'Where a quantum particle bouncing in a box can be found, at every moment: the probability weaves a carpet.',
    colonnes: ['position in the box (box width 1)', 'time (in units of the full revival time)', 'probability density at that place and time'],
    aRegarder: ['At time 1 the starting packet comes back exactly; at time 0.5 it comes back mirrored.', 'Each dot picks a random moment: this is a cloud, not frames in order.'],
    fin: null,
  },
  oscillateurEtats: {
    titre: 'Harmonic oscillator eigenstates',
    enUnePhrase: 'The probability curve of one quantum state in a bowl-shaped well, filled with dots under the curve.',
    colonnes: ['position (units with hbar = mass = 1)', 'random height under the probability curve (the dots fill the area)', 'signed wave amplitude psi at that position'],
    aRegarder: ['The number of gaps (zeros) equals the state number.', 'This state does not move in time.'],
    fin: null,
  },
  wigner: {
    titre: 'Wigner function of a cat state',
    enUnePhrase: 'A quantum "cat" in two places at once, drawn on the position-momentum plane, height = Wigner value.',
    colonnes: ['position', 'momentum', 'Wigner value W (can be negative)'],
    aRegarder: ['Two humps = the two places; the stripes between them dip below zero. Negative values have no classical meaning: that is quantum interference.'],
    fin: null,
  },
  marcheQuantique: {
    titre: 'Quantum walk vs random walk',
    enUnePhrase: 'Where a quantum walker can be found after each step, with the quantum and the ordinary coin-flip probabilities.',
    colonnes: ['position on the line', 'step number', 'quantum probability at that position and step', 'ordinary random-walk probability at that position and step'],
    aRegarder: ['The quantum walker spreads in two sharp fronts moving at constant speed; the ordinary walker stays in a hump that widens slowly.'],
    fin: null,
  },
  bellCHSH: {
    titre: 'Bell correlations (CHSH)',
    enUnePhrase: 'Measured agreement between two entangled spins for random pairs of detector angles.',
    colonnes: ['detector angle a (radians)', 'detector angle b (radians)', 'measured correlation (from -1 to 1, from random sampling)', 'quantum formula -cos(a - b)'],
    aRegarder: ['The measured dots follow the formula wave closely.', 'This reproduces the quantum prediction on one computer; it is not itself a test of nonlocality.'],
    fin: null,
  },
  rotorPulse: {
    titre: 'Quantum kicked rotor',
    enUnePhrase: 'A spinning rotor kicked again and again: quantum momenta next to classical momenta, kick after kick.',
    colonnes: ['kick number', 'quantum momentum (drawn from the quantum probability)', 'classical momentum (one particle of the classical ensemble)', 'classical angle (radians, 0 to 2 pi)'],
    aRegarder: ['The classical spread keeps growing; the quantum spread stops growing: dynamical localisation.'],
    fin: null,
  },
  niveauxLandau: {
    titre: 'Landau levels',
    enUnePhrase: 'Where an electron in a magnetic field can be found, over time: a ring, whose centre circles if two levels are mixed.',
    colonnes: ['x (units with hbar = mass = charge = 1)', 'y (same units)', 'time (in cyclotron periods)'],
    aRegarder: ['The density is a ring; only its average position goes round, at the cyclotron frequency.'],
    fin: null,
  },
  sternGerlach: {
    titre: 'Stern-Gerlach splitting',
    enUnePhrase: 'Atoms flying through a magnet: each one goes either up or down, never in between.',
    colonnes: ['position across the beam (scaled units)', 'distance along the beam (0 to 1 inside the magnet, 1 to 2 in free flight)', 'up-down deflection (scaled units)'],
    aRegarder: ['The beam splits into two spots: spin is quantised.', 'The share going up is cos^2 of half the preparation angle.'],
    fin: null,
  },
  /* ---------- tam-fusion.js ---------- */
  fusionTrousNoirs: {
    titre: 'Spinning black hole merger (IMRPhenomB)',
    enUnePhrase: 'The gravitational-wave signal of two spinning black holes merging: wave height against time.',
    colonnes: ['time (seconds; 0 = peak of the signal)', 'wave height, plus polarisation (x 1e21, no detector response)', 'wave height, cross polarisation (x 1e21)', 'wave frequency (Hz; noisy after the signal has faded)'],
    aRegarder: ['The chirp rises to a peak at time 0, then rings down.', 'Spins aligned with the orbit make the signal last longer before merging.'],
    fin: 'merger at the peak (t = 0), then the ringing dies out',
  },
  /* ---------- tam-grandes-questions.js (game80) ---------- */
  videQuantique: {
    titre: 'The quantum vacuum (Casimir effect)',
    enUnePhrase: 'Empty space between two metal plates: only some vacuum waves fit between them, all of them fit outside, and that difference pushes the plates together.',
    colonnes: ['position across the gap, in units of the gap width (the plates are at 0 and 1; below 0 or above 1 = outside the plates)', 'wave number of a vacuum wave, in units of pi divided by the gap (inside: whole numbers only, 1 up to the Modes setting; outside: any value)', 'strength of that wave at that point (arbitrary units, from -0.4 to 0.4)'],
    aRegarder: ['Between the plates only whole-number waves fit, so the dots line up in rows; outside every wave is allowed and the dots fill the space.', 'Fewer waves inside than outside means the vacuum pushes the plates together: at the default gap of 1 micrometre the pressure is about 1.3 thousandths of a pascal.', 'Halve the gap and the pressure grows 16 times (it goes as one over the gap to the fourth power).'],
    fin: null,
  },
  bigRip: {
    titre: 'The Big Rip',
    enUnePhrase: 'Twelve galaxies carried apart by a dark energy that keeps getting stronger, until space stretches without limit at a finite time.',
    colonnes: ['x of a galaxy, on a log scale (its starting distance, 0.3 to 1, times 1 + log10 of how many times space has stretched since today)', 'y of a galaxy (same log scale)', 'time from today (billions of years)'],
    aRegarder: ['Each galaxy runs straight outward; on this log scale every equal step outward means space has stretched 10 more times.', 'The paths stop about 0.02 billion years before the Big Rip, once space has stretched 10 000 times; with the default settings the rip comes about 22 billion years from now.', 'The galaxies are test points: the tearing apart of galaxies, stars and atoms themselves is not simulated.'],
    fin: 'space stretches without limit at a finite time (the Big Rip); the last point drawn is shortly before it',
    objets: (noms) => 'Rows come in ' + noms.length + ' blocks, one per galaxy, from today onward: ' + noms.join(', ') + '.',
  },
  fauxVide: {
    titre: 'False vacuum decay',
    enUnePhrase: 'A film of one slice of space in a false vacuum: bubbles of true vacuum appear at random, grow at nearly the speed of light and merge.',
    colonnes: ['x in the box (box side 1)', 'y in the box (box side 1; every point lies on one slice through the middle of the box)', 'state of that point at that moment: 0.3 = already true vacuum, 0 = still false vacuum (a marker, not a distance)'],
    aRegarder: ['Move the Moment slider (or let it play): the same points at a later moment, more of them inside bubbles.', 'The share of true vacuum follows the Kolmogorov-Johnson-Mehl-Avrami formula; by the last moment nearly all space (about 97 to 98 percent) has decayed.', 'The rate at which bubbles appear is illustrative, not a prediction for our universe.'],
    fin: 'nearly all of the slice is true vacuum at the last moment',
  },
  centreTerre: {
    titre: 'A fall through the Earth',
    enUnePhrase: 'A body dropped into a straight tunnel through the centre of the Earth, with no air: it falls, shoots through the centre and comes back.',
    colonnes: ['position along the tunnel, in Earth radii (1 = the starting surface, 0 = the centre, -1 = the far side)', 'speed along the tunnel (km/s; the sign gives the direction)', 'time since the drop (minutes)', 'gravity at that depth (m/s^2)'],
    aRegarder: ['With the layered (PREM) Earth the one-way trip takes about 38 minutes; with a constant-density Earth it takes about 42.', 'Gravity first grows as you fall, to about 10.7 m/s^2 at the top of the iron core, then drops to 0 at the centre.', 'The speed peaks at the centre, near 10 km/s; with no air the body comes back to the start and keeps going back and forth.'],
    fin: null,
  },
  versMars: {
    titre: 'Getting to Mars',
    enUnePhrase: 'A film of the cheapest simple trip to Mars: the spacecraft coasts on half an ellipse around the Sun while Earth and Mars move on their orbits.',
    colonnes: ['x (AU, Sun at the centre)', 'y (AU)', 'days since launch (the 3 points of a moment share it)'],
    aRegarder: ['The spacecraft leaves Earth\'s orbit and arrives at Mars\'s orbit on the far side of the Sun: about 259 days (8.5 months) of coasting.', 'Launch works only when Mars is about 44 degrees ahead of Earth; that line-up comes back every 780 days (about 26 months).', 'Planet gravity and the real tilted, slightly oval Mars orbit are left out, so real trips differ by weeks.'],
    fin: 'arrival at the target orbit, on the far side of the Sun from the launch point',
    objets: (noms) => 'In each moment the 3 points are, in order: ' + noms.join(', ') + '.',
  },
  zeroAbsolu: {
    titre: 'Near absolute zero (Bose-Einstein condensate)',
    enUnePhrase: 'A cloud of very cold atoms held in a bowl-shaped trap: below a critical temperature many of them fall into the same lowest state.',
    colonnes: ['x of an atom in the trap (trap length unit: sqrt(hbar / (atom mass x trap angular frequency)))', 'y of an atom (same unit)', 'z of an atom (same unit)'],
    aRegarder: ['The dense core is the Bose-Einstein condensate (atoms all in the lowest state); the wide haze is the ordinary thermal gas.', 'At the default temperature (0.6 of the critical temperature) about 78 percent of the atoms are in the core; above 1 the core disappears.', 'Each dot is one sampled atom position, not a path.'],
    fin: null,
  },
  tailleUnivers: {
    titre: 'How big is the observable universe',
    enUnePhrase: 'Points out to the edge of the observable universe, placed at their distance today and lifted by when the light we see from them set off.',
    colonnes: ['x today (billions of parsecs, comoving distance; we are at the centre)', 'y today (same unit; every point lies in one flat slice)', 'cosmic time when the light we now see left that place (billions of years after the Big Bang: about 13.8 here and now, 0 at the edge)'],
    aRegarder: ['The outer ring (the first tenth of the points) is the edge, about 14 billion parsecs (46 billion light years) away, although the universe is only 13.8 billion years old: space kept stretching while the light travelled.', 'The farther the point, the earlier its light left: the third value falls from about 13.8 nearby to 0 at the edge.', 'A model universe with the Planck 2018 parameters, not a map of real galaxies.'],
    fin: null,
  },
  nombrePi: {
    titre: 'Three roads to pi',
    enUnePhrase: 'Random points thrown into a square: the share that lands inside a quarter circle gives pi, and each point is lifted by how wrong the estimate still is.',
    colonnes: ['x of a random point in the unit square (0 to 1)', 'y of a random point (0 to 1)', 'error of the running estimate of pi after this many points: |4 x (share inside the quarter circle) - pi|'],
    aRegarder: ['The height jumps around for the first points, then settles low: the error of random points shrinks only like 1 over the square root of their number.', 'The other two roads are measured, not drawn: 1000 terms of the Leibniz series still miss pi by 0.001, while Machin\'s formula reaches the limit of computer precision in about 10 terms.'],
    fin: null,
  },
  calendrierCosmique: {
    titre: 'The cosmic calendar',
    enUnePhrase: 'The whole history of the universe squeezed into one year, drawn as a spiral with one turn per month and a small stick at each key event.',
    colonnes: ['x on the calendar spiral (one turn per month; radius 1 on 1 January, 3 at midnight on 31 December; no unit)', 'y on the calendar spiral (same)', 'height: 0 on the spiral; the short vertical sticks (0 to 1) mark the events'],
    aRegarder: ['The Big Bang is midnight on 1 January and today is midnight at the end of 31 December.', 'The Sun and Earth form only in early September; the last dinosaurs die out on 30 December.', 'Homo sapiens appears only about 11 minutes before midnight on 31 December.'],
    fin: null,
    objets: (noms) => 'After the spiral, one stick per event, in this order: ' + noms.join(', ') + '.',
  },
  /* ---------- tam-grandes-questions-2.js (game80) ---------- */
  penduleFoucault: {
    titre: 'Foucault pendulum',
    enUnePhrase: 'A long pendulum swinging for hours on the turning Earth: the far ends of its swing slowly go round, because the floor turns underneath it.',
    colonnes: ['east-west position of the bob at a far end of its swing (m; east positive)', 'north-south position of the bob at that far end (m; north positive)', 'time (hours)'],
    aRegarder: ['Each dot is one far end of a swing; together they show the swing plane slowly turning.', 'The swing plane turns clockwise in the northern hemisphere, anticlockwise in the southern one, and not at all on the equator.', 'At Paris (latitude 48.85 degrees, the default) one full turn takes about 32 hours; at a pole it takes about 24 hours.'],
    fin: null,
  },
  mouvementTerre: {
    titre: 'Earth\'s real path through space',
    enUnePhrase: 'Earth going round the Sun while the Sun itself races around the Milky Way: the yearly loop becomes a stretched corkscrew.',
    colonnes: ['x of Earth (AU, measured from where the Sun was at the start; Earth\'s orbit plane)', 'y of Earth (AU, same frame)', 'z of Earth, out of Earth\'s orbit plane (AU)', 'time (years)'],
    aRegarder: ['The Sun moves at more than 200 km/s, so each year the corkscrew moves on by about 50 AU while the yearly loop is only 2 AU wide.', 'The Sun\'s motion is tilted about 60 degrees to Earth\'s orbit plane.', 'Over these few years the Sun\'s path around the galaxy is treated as a straight line; the Moon and planets are left out.'],
    fin: null,
  },
  etoilesHR: {
    titre: 'Real stars on the Hertzsprung-Russell diagram',
    enUnePhrase: 'Real stars placed by their published temperature, brightness and size, next to the line that ordinary stars like the Sun follow.',
    colonnes: ['log10 of the surface temperature (kelvin)', 'log10 of the luminosity (Sun = 0)', 'log10 of the radius (Sun = 0)'],
    aRegarder: ['Only the first points are stars (named below); all later points draw a straight-line fit through the main-sequence stars.', 'Main-sequence stars like the Sun lie along that line; giants and supergiants such as Betelgeuse sit far above it, white dwarfs such as Sirius B far below.', 'Each star is checked against the black-body law L = 4 pi R^2 sigma T^4.'],
    fin: null,
    objets: (noms) => 'The first ' + noms.length + ' points are the stars, in this order: ' + noms.join(', ') + '; every later point is on the main-sequence line.',
  },
  evaporationTrouNoir: {
    titre: 'Black hole evaporation',
    enUnePhrase: 'A black hole slowly losing mass as it glows (Hawking radiation): the smaller it gets, the hotter it glows and the faster it shrinks.',
    colonnes: ['time as a fraction of the black hole\'s whole lifetime (from the first step, 1/1500, to 0.9999)', 'mass left, as a fraction of the starting mass', 'log10 of how many times hotter it is than at the start (it heats up as the mass shrinks)', 'log10 of (1 + time in years)'],
    aRegarder: ['The mass hardly changes for most of the life, then plunges at the very end.', 'A black hole of one solar mass (the default) would take about 10^67 years to evaporate; double the mass and it lasts 8 times longer.', 'Today it would not shrink at all: at about 0.00000006 K it is colder than the cosmic microwave background (2.7 K) and absorbs more than it emits.'],
    fin: 'drawn up to 99.99 percent of the lifetime; the very last instant is not drawn',
  },
  tsunami: {
    titre: 'Tsunami crossing an ocean',
    enUnePhrase: 'A film of a tsunami front: rays of the wave fan out across a deep ocean, then slow down, bend and grow on the shallow shelf near the coast.',
    colonnes: ['distance from the source toward the coast (km)', 'sideways position (km)', 'wave height (m; it grows as the water gets shallower)', 'time since the wave started (hours)'],
    aRegarder: ['Over the 4000 m deep ocean the wave travels at about 700 km/h, as fast as a jet airliner, and crosses about 10 000 km in about 14 hours.', 'On the shallow shelf it slows down and grows: 0.5 m in the open ocean becomes about 2.2 m at the coast (Green\'s law).', 'Rays that start at an angle turn to face the coast as the water gets shallower (Snell\'s law).'],
    fin: 'the rays stop at the coast (water 10 m deep)',
  },
  geometrieUnivers: {
    titre: 'Flat, closed or open universe',
    enUnePhrase: 'The same triangle and circle drawn on a sphere, a flat plane and a saddle-like hyperbolic surface: the shape of space changes the geometry.',
    colonnes: ['x for display (the three surfaces are placed side by side; curvature radius 1)', 'y for display (same unit)', 'z for display (same unit)', 'curvature of that surface: +1 sphere, 0 flat plane, -1 hyperbolic'],
    aRegarder: ['The same triangle (three equal sides of 1.2) has angles adding up to more than 180 degrees on the sphere (about 224), exactly 180 on the plane and less on the hyperbolic surface (about 150).', 'A circle of the same radius is shorter on the sphere than on the plane, and longer on the hyperbolic surface.', 'Planck 2018 finds our space flat within its errors.'],
    fin: null,
    objets: (noms) => 'Rows come in three blocks, in this order: ' + noms.join(', ') + '; in each block, half the points are the triangle edges, a quarter the circle and a quarter the surface.',
  },
  tailleEtoiles: {
    titre: 'How big stars really are',
    enUnePhrase: 'The Earth, the Sun and well-known stars drawn as spheres around one centre, at their true relative sizes.',
    colonnes: ['x on the surface of a sphere (solar radii)', 'y (solar radii)', 'z (solar radii)', 'which body: 0 = Earth, 1 = Sun, then the stars in the order of the names'],
    aRegarder: ['All spheres share one centre and one scale: the Earth and the Sun vanish next to the red supergiants.', 'The Sun is about 109 times wider than Earth.', 'Supergiant sizes are very uncertain.'],
    fin: null,
    objets: (noms) => 'Rows come in blocks, one sphere per body, in this order: ' + noms.join(', ') + '.',
  },
  /* ---------- tam-champs-quantiques.js (game81) ---------- */
  champLibre: {
    titre: 'A free quantum field: a travelling wave packet',
    enUnePhrase: 'A film of a bump in a field with mass, on a ring of 256 points: it travels along the ring and slowly spreads out.',
    colonnes: ['lattice site number (the ring has 256 sites, spacing 1; its two ends join up)', 'time (natural units: c = 1, lattice spacing 1; one value per moment)', 'field value phi at that site and moment (natural units)'],
    aRegarder: ['The bump travels at about 0.75 times the speed of light: its group velocity, slower than light because the field has a mass.', 'It slowly widens as it goes: waves of different lengths travel at different speeds (dispersion).', 'This is the field equation treated as a classical wave on a lattice; quantum fluctuations are not included.'],
    fin: null,
  },
  fluctuationsVide: {
    titre: 'The quantum vacuum of a free field',
    enUnePhrase: 'Snapshots of a field in its lowest-energy state, the vacuum: even with nothing in it, the field is never flat.',
    colonnes: ['lattice site number (the ring has 64 sites, spacing 1)', 'sample number (0 to 11: each is an independent random draw, not a time)', 'field value phi at that site in that sample (natural units, hbar = c = 1)'],
    aRegarder: ['Every sample is jagged: the vacuum of a quantum field always jitters.', 'The samples are independent draws from the exact vacuum probability law of a field with mass on 64 points; they are not a film of motion.', 'Averaged over 3000 samples, each wave of the field has the spread quantum theory predicts (variance 1/(2 omega)).'],
    fin: null,
  },
  interactionChamps: {
    titre: 'Two interacting fields (preheating)',
    enUnePhrase: 'A film of a field phi swinging up and down everywhere at once, which pumps energy into a second field chi coupled to it.',
    colonnes: ['position along the line (units of 1 / the phi mass; lattice spacing 0.5, 256 sites)', 'time (units of 1 / the phi mass)', 'phi field value (the oscillating condensate; 1 everywhere at the start)', 'chi field value (tiny random noise at the start, about a millionth)'],
    aRegarder: ['At first phi swings everywhere together while chi looks flat at zero.', 'Waves of chi of one favoured length then grow exponentially, like a swing pumped at the right rhythm (parametric resonance): the growth rate is about 0.125 per unit time, as the Mathieu-equation theory predicts.', 'By the end about 15 percent of the energy has moved into chi. A classical-field approximation of a quantum process, on a 1-D lattice.'],
    fin: null,
  },
  paireSchwinger: {
    titre: 'Pairs torn out of the vacuum (Schwinger effect)',
    enUnePhrase: 'A very strong electric field pulls electron-positron pairs out of empty space; each particle is drawn as its path through space and time.',
    colonnes: ['position along the electric field (natural units: hbar / (m c) of the electron; electrons move toward negative values, positrons toward positive)', 'sideways position where the pair appeared (same units; fixed for each particle)', 'second sideways position (same units; fixed)', 'time (natural units: hbar / (m c^2) of the electron; each path starts when its pair appears)'],
    aRegarder: ['Each pair appears at rest, the electron and the positron already a small distance apart; the field then pushes them apart on curved paths that approach the speed of light.', 'The 40 pairs drawn are an illustrative sample: at the default field (half the critical field, about 6.6 x 10^17 V/m) only about 0.3 pairs would actually be expected in this box and time.', 'The rate is the one-loop Schwinger formula; it is tiny for fields well below the critical field of about 1.3 x 10^18 V/m.'],
    fin: null,
  },
  effetUnruh: {
    titre: 'An accelerated observer sees a warm vacuum (Unruh effect)',
    enUnePhrase: 'An observer who keeps accelerating finds empty space glowing with heat: their path through spacetime, with the energies of the quanta they would detect.',
    colonnes: ['position x (units c^2 / a, a = the acceleration; the path is the hyperbola x^2 - t^2 = 1)', 'time t of a non-accelerating observer (units c / a)', 'energy of one detected quantum (units hbar a / c; drawn at random from a thermal spectrum)', 'proper time on the accelerated observer\'s own clock (units c / a; -3 to 3 by default)'],
    aRegarder: ['The path bends into a hyperbola: the observer speeds up forever but never reaches the speed of light.', 'The heights follow a thermal (Planck) spectrum: the vacuum looks warm to this observer, with an average quantum energy about 2.7 times the temperature.', 'The effect is tiny: 1 m/s^2 gives about 4 x 10^-21 K, and about 2.5 x 10^20 m/s^2 is needed for 1 kelvin.'],
    fin: null,
  },
  couplageCourant: {
    titre: 'Running coupling constants',
    enUnePhrase: 'How strong electromagnetism and the strong nuclear force are, depending on the energy at which you probe them.',
    colonnes: ['log10 of the momentum scale Q (GeV; -4 is 0.1 MeV, 3 is 1000 GeV)', 'one over the coupling strength: 1/alpha for electromagnetism (first half of the rows), 1/alpha_s for the strong force (second half, from 3 GeV up)', 'which force: 0 = electromagnetism, 1 = strong force'],
    aRegarder: ['Electromagnetism gets slightly stronger at high energy: 1/alpha falls from about 137 at low energy to about 133 at the Z boson mass (91 GeV). Only the three charged leptons are counted; quark loops are not computed.', 'The strong force does the opposite (asymptotic freedom): alpha_s is about 0.17 at 10 GeV, 0.118 at 91 GeV and 0.088 at 1000 GeV.', 'Both curves are one-loop approximations; the strong curve starts from the measured value 0.1179 at the Z mass.'],
    fin: null,
    objets: (noms) => 'The two curves, in frame order: ' + noms.join(', ') + '.',
  },
  comptonKleinNishina: {
    titre: 'A photon scattering off an electron (Compton)',
    enUnePhrase: 'Where photons go after bouncing off a free electron: each dot is one possible direction, raised by how much energy the photon kept.',
    colonnes: ['x of the scattered photon\'s direction (unit sphere; the photon came in along z)', 'y of that direction (unit sphere)', 'z of that direction (cosine of the scattering angle: 1 = straight on, -1 = straight back)', 'fraction of its energy the photon keeps (1 when going straight on, lowest when bounced straight back)'],
    aRegarder: ['At the default energy (half the electron rest energy, about 0.26 MeV) about 65 percent of the photons scatter forward; at very low energy the split would be even, 50 percent.', 'A photon bounced straight back keeps only half its energy here: the Compton shift.', 'The total cross-section is about 56 percent of the low-energy Thomson value (Klein-Nishina formula, lowest order of QED).'],
    fin: null,
  },
  atomes: {
    titre: 'Electron clouds of atoms',
    enUnePhrase: 'Where the electrons of an atom can be found, one electron per frame, shell by shell from the innermost out.',
    colonnes: ['x (Bohr radii)', 'y (Bohr radii)', 'z (Bohr radii)', 'which subshell the electron is in: n + l/10 (1 = 1s, 2 = 2s, 2.1 = 2p, 3.2 = 3d)'],
    aRegarder: ['The default atom is iron (26 electrons, 1s2 2s2 2p6 3s2 3p6 4s2 3d6); each frame is the cloud of one electron, filled in Madelung order.', 'Inner electrons feel almost the whole nuclear charge and sit very close (1s: about 0.06 Bohr radii on average); the screened outer 4s electrons spread out to about 6 Bohr radii.', 'Each cloud is a hydrogen-like orbital with an effective charge from Slater\'s rules: an approximation of a many-electron atom, not an exact solution.'],
    fin: null,
    objets: (noms) => 'Frames go electron by electron through these subshells, in this order: ' + noms.join(', ') + '.',
  },
  quarks: {
    titre: 'Quark confinement and string breaking',
    enUnePhrase: 'A film of a charm quark and its antiquark pulled apart: the colour string between them stores more and more energy until it breaks into two mesons.',
    colonnes: ['position along the string between the quark and the antiquark (fm; 1 fm = 10^-15 m)', 'sideways spread of the string (fm; an illustrative width of 0.15 fm, not computed)', 'second sideways spread (fm; same illustrative width)', 'energy stored in the string at that separation (GeV; the Cornell potential V(r), quark masses not included)'],
    aRegarder: ['In every frame but the last the pair is pulled further apart, from 0.2 fm to about 1.2 fm, and the stored energy keeps rising, like a rubber band that never goes slack (confinement).', 'In the last frame the string has broken: its energy was enough to create a new quark pair, so two clusters (two D mesons) remain instead of free quarks.', 'A phenomenological potential model, not lattice QCD; it gives charmonium levels of about 3090 MeV (J/psi) and 3672 MeV (psi(2S)).'],
    fin: 'the string breaks into two D mesons in the last frame',
  },
  /* game88 : les principes du vide qui manquaient (tam-vide-quantique.js) — formules seulement, aucun chiffre publie */
  videComprime: {
    titre: 'Squeezed vacuum',
    enUnePhrase: 'The vacuum of one light mode, squeezed: the unavoidable quantum jitter is pushed out of one direction and into the other, while their product stays at its quantum minimum.',
    colonnes: ['x quadrature (dimensionless, hbar = 1; the ordinary vacuum has variance 1/2)', 'p quadrature (same units)', 'time (each point is an independent sample, turned by the oscillator up to that time)', 'Wigner function W(x, p) at that point (exact formula, between 0 and 1/pi)'],
    aRegarder: ['The cloud is an ellipse, not the round ordinary vacuum: thinner along one direction, wider along the other.', 'The product of the two spreads stays at the minimum quantum theory allows (Delta x Delta p = 1/2): squeezing moves the noise, it does not remove it.', 'A squeezed vacuum is not empty: it holds sinh^2 r photons on average; with time the ellipse turns (the spreads repeat at twice the oscillator frequency).'],
    fin: null,
  },
  casimirDynamique: {
    titre: 'Light made from the vacuum (dynamical Casimir effect)',
    enUnePhrase: 'A cavity mirror shaken at twice the frequency of a light mode turns vacuum jitter into real photons, whose number grows exponentially.',
    colonnes: ['x of a point on the 1-sigma ellipse of the mode (dimensionless quadrature; the vacuum spread is 1/2)', 'p of that point (same units)', 'time (units of 1 / the mode frequency)', 'photons created from the vacuum so far, N(t)'],
    aRegarder: ['At the start the ellipse is the round vacuum: zero photons.', 'Shaking at twice the mode frequency pumps the mode like a swing (parametric resonance): the ellipse stretches and squeezes, and N(t) follows sinh^2(eps omega0 t / 2).', 'The photons are made in pairs out of vacuum fluctuations, not from light already in the cavity. One mode, no losses: a simplified model, a drawing of the formula.'],
    fin: null,
  },
  higgsVide: {
    titre: 'The Higgs vacuum (spontaneous symmetry breaking)',
    enUnePhrase: 'A field released at the top of a "Mexican hat" rolls down and settles somewhere on the circle of lowest energy: the vacuum picks a direction that the laws themselves do not.',
    colonnes: ['real part of the field phi (dimensionless)', 'imaginary part of phi (same units)', 'potential energy V(phi) = -mu^2 |phi|^2 + lambda |phi|^4', 'time (dimensionless)'],
    aRegarder: ['Every point of the circle |phi| = v = mu / sqrt(2 lambda) is an equally good vacuum; another seed (another tiny nudge) settles somewhere else on it.', 'Across the circle the field rings at a frequency set by the curvature: the massive Higgs mode, m_H^2 = 2 mu^2.', 'Along the circle nothing pushes back: the massless Goldstone direction. A classical, uniform field with friction: no quantum fluctuations and no space, a drawing of the formula.'],
    fin: null,
  },
  emissionSpontanee: {
    titre: 'Spontaneous emission: an atom and the vacuum',
    enUnePhrase: 'An excited atom alone in the vacuum still gives off light, because it is coupled to the vacuum modes; the excitation leaks out at the rate Fermi\'s golden rule predicts.',
    colonnes: ['detuning of a vacuum mode from the atom frequency (mode number x spacing, dimensionless)', 'time of the frame', 'population of that mode |c_k|^2 (the chance the photon is in it)', 'probability that the atom is still excited, P_e(t)'],
    aRegarder: ['P_e(t) falls exponentially at Gamma = 2 pi g^2 / spacing (Fermi\'s golden rule).', 'The emitted photon fills the modes with a Lorentzian shape: the natural width of a spectral line.', 'With a finite set of modes the light comes back to the atom at the recurrence time 2 pi / spacing: a revival that a true continuum of modes would never show. One excitation and evenly spaced modes: a simplified model.'],
    fin: null,
  },
  /* game93 : six theories classiques (tam-theories-2.js) — formules seulement, aucun chiffre publie */
  ising2D: {
    titre: 'A magnet on a lattice (2D Ising model)',
    enUnePhrase: 'Tiny magnets on a grid, each pointing up or down, quenched from disorder: below a critical temperature they line up into large domains, above it they stay mixed.',
    colonnes: ['x, column of the lattice (lattice spacing 1)', 'y, row of the lattice (same units)', 'local magnetisation: the mean of the 5 x 5 spins around the site (-1 to 1)', 'the spin itself (+1 up, -1 down)'],
    aRegarder: ['Below the critical temperature Tc = 2 / ln(1 + sqrt 2) (computed in the code, units J = k = 1) the grid splits into big up and down domains; above it, only small speckles.', 'The measured magnetisation is compared with Onsager\'s exact formula M(T) = (1 - sinh(2/T)^-4)^(1/8).', 'A finite grid simulated by Monte Carlo: near Tc the agreement is only statistical, a drawing of the formula.'],
    fin: null,
  },
  lotkaVolterra: {
    titre: 'Predators and prey (Lotka-Volterra)',
    enUnePhrase: 'Prey and predators in a closed loop: more prey feed more predators, more predators eat the prey, and both numbers cycle for ever.',
    colonnes: ['prey density x', 'predator density y (same units)', 'time t'],
    aRegarder: ['The path is a closed loop: the cycle repeats exactly, because H = d x - c ln x + b y - a ln y never changes.', 'Averaged over whole cycles the populations sit exactly at the balance point.', 'Small cycles last 2 pi / sqrt(a c); bigger swings last longer. Turn up "prey crowding" (limited room for prey) and the loop becomes a spiral that winds into the balance point. No age, no chance: a simplified model.'],
    fin: null,
  },
  epidemieSIR: {
    titre: 'How an epidemic runs (SIR model)',
    enUnePhrase: 'A population split into susceptible, infected and recovered people: an outbreak grows, peaks and fades, and never reaches everyone.',
    colonnes: ['susceptible fraction s (population fraction)', 'infected fraction i (same units)', 'recovered fraction r (same units)', 'time (in units of the average time to recover)'],
    aRegarder: ['The outbreak only takes off if R0 times the susceptible fraction is above 1; the infected curve peaks exactly when s falls to 1 / R0.', 'The peak height and the share never infected both follow exact formulas, checked against the simulation.', 'Turn up "immunity fading" and recovered people slowly become susceptible again: the disease comes back in smaller waves and settles at an exact endemic level. Everyone mixes with everyone, no vaccines: a simplified model.'],
    fin: null,
  },
  lentilleGravitationnelle: {
    titre: 'A gravitational lens',
    enUnePhrase: 'A mass bends the light of a small source behind it: we see two distorted images, and a full ring when the source is exactly behind.',
    colonnes: ['image position theta x (in Einstein radii)', 'image position theta y (same units)', 'source position beta x (same units)', 'source position beta y (same units)'],
    aRegarder: ['The two images sit at theta = (beta +- sqrt(beta^2 + 4)) / 2, on either side of the lens.', 'Their total brightness grows as the source lines up: magnification (u^2 + 2) / (u sqrt(u^2 + 4)) for a point source.', 'With beta = 0 the images merge into the Einstein ring. A point mass and a thin lens: a simplified model.'],
    fin: null,
  },
  kuramoto: {
    titre: 'Fireflies falling into step (Kuramoto model)',
    enUnePhrase: 'A film of many oscillators, each with its own natural rhythm, pulling on each other: above a critical coupling a crowd of them ticks together.',
    colonnes: ['cos of the phase (the point runs round the unit circle)', 'sin of the phase (same units)', 'rank of the natural frequency (-1/2 to 1/2)', 'time'],
    aRegarder: ['Below the critical coupling Kc = 2 gamma the points stay spread round the circle; above it they bunch together.', 'How tightly they bunch, r, follows sqrt(1 - Kc / K) for a very large crowd.', 'Oscillators near the middle frequency lock first; the fastest and slowest keep drifting. A finite crowd, so r jitters.'],
    fin: null,
  },
  gibbsFourier: {
    titre: 'Building a square wave from sines (Gibbs phenomenon)',
    enUnePhrase: 'A film of more and more sine waves added up: they rebuild a square wave, but next to each jump a small overshoot never goes away.',
    colonnes: ['x, the angle (radians)', 'the sum of the first N sines, S_N(x)', 'the error, square wave minus S_N (same units)', 'the number of terms N'],
    aRegarder: ['As N grows the curve hugs the square wave, but the peak next to the jump stays about 9 percent of the jump too high: the Gibbs constant (2 / pi) Si(pi), computed in the code.', 'The overshoot only gets narrower, closer to the jump, as N grows.', 'The squared error falls like 1 / N.'],
    fin: null,
  },
  /* game96 : six theories de plus (tam-theories-3.js) — formules seulement */
  rutherford: {
    titre: 'Alpha particles on a nucleus (Rutherford scattering)',
    enUnePhrase: 'A film of charged particles fired past a fixed nucleus that repels them, one frame per impact parameter b: the closer they pass, the harder they are thrown back.',
    colonnes: ['x (units k = mass = 1, nucleus at the origin)', 'y (same units)', 'impact parameter b of this trajectory (a label)', 'time since entering the window'],
    aRegarder: ['The measured deflection follows Rutherford\'s law b = (k / (2E)) cot(theta / 2). Switch on "opposite charges" and the nucleus pulls them round it instead: same law with k = -1, same angle on the other side.', 'Energy and angular momentum stay constant along each path; the closest approach is computed exactly.', 'A point nucleus that does not recoil, classical mechanics: a simplified model.'],
    fin: null,
  },
  logistique: {
    titre: 'Order to chaos (logistic map)',
    enUnePhrase: 'For each growth rate r, the values the rule x -> r x (1 - x) settles on: one value, then 2, 4, 8, then chaos.',
    colonnes: ['growth rate r', 'state x_n (0 to 1)', 'next state x_n+1 (same units)'],
    aRegarder: ['Below r = 3 everything settles on the single value x = 1 - 1/r.', 'The first doublings sit exactly at r = 3 and r = 1 + sqrt 6, both measured and compared.', 'The later doublings crowd together by a nearly constant ratio: it is measured here, not typed in.'],
    fin: null,
  },
  chaleur: {
    titre: 'Heat spreading along a bar (heat equation)',
    enUnePhrase: 'A film of a narrow block of heat on an insulated bar spreading into a bell.',
    colonnes: ['position x along the bar (length units, the middle of the bar)', 'time t', 'temperature u'],
    aRegarder: ['The total heat never changes on insulated walls; with loss to the air k it fades as e^(-k t) while the spread grows just the same.', 'The width grows exactly as sigma^2 = sigma0^2 + 2 D t: faster with a larger diffusion D.', 'The peak approaches the Gaussian bell once the start is much narrower than the spread.'],
    fin: null,
  },
  oscillateurForce: {
    titre: 'A driven spring and resonance (damped driven oscillator)',
    enUnePhrase: 'A mass on a spring, damped and pushed by a periodic force, released from x0: the start dies away and it settles into a steady swing.',
    colonnes: ['displacement x (natural frequency omega0 = 1)', 'velocity v (same units)', 'time t'],
    aRegarder: ['The steady swing is the closed ellipse; its size follows A = F0 / sqrt((omega0^2 - omega^2)^2 + (2 gamma omega)^2).', 'Sweeping the drive frequency finds the resonance peak at sqrt(1 - 2 gamma^2); with strong damping there is no peak.', 'The release point only changes the start: every start ends on the same ellipse.'],
    fin: null,
  },
  brachistochrone: {
    titre: 'The fastest slide (brachistochrone)',
    enUnePhrase: 'A film of three beads sliding without friction from the same start to the same end: on a cycloid, a straight line and a circular arc.',
    colonnes: ['x (length units)', 'height y (the start is at 0)', 'time t since release'],
    aRegarder: ['The cycloid always arrives first, even though it is longer than the straight line.', 'Its time matches sqrt(a / g) theta exactly; the straight line has its own exact time.', 'The arc has no simple formula: its time is only measured.'],
    fin: null,
  },
  galton: {
    titre: 'Balls through pegs (Galton board)',
    enUnePhrase: 'Balls fall through rows of pegs, bouncing left or right at random, and pile up into a bell.',
    colonnes: ['x (peg spacings)', 'height: down the rows along a path, then the pile rising from the floor under the bins', 'index of the ball (a label)'],
    aRegarder: ['The pile follows the binomial law C(L, k) / 2^L, with mean 0 and variance L / 4.', 'With more rows the bell gets wider and smoother: the central limit theorem.', 'A finite number of balls: the match is statistical, and a new seed gives a slightly different pile.'],
    fin: null,
  },
  /* game111 : sciences de la vie (tam-biologie.js) — formules seulement, aucune valeur publiee */
  adnMutations: {
    titre: 'DNA that mutates (Jukes-Cantor model)',
    enUnePhrase: 'The start of a DNA sequence drawn as a double helix, frame by frame, while random copying mistakes change its bases.',
    colonnes: ['x (drawn double helix, not to scale)', 'y (same)', 'position along the sequence (drawn)', 'base: 0 = A, 1 = C, 2 = G, 3 = T (the second strand is the complement: A with T, C with G)', 'time t'],
    aRegarder: ['The share of sites that differ from the ancestor follows 3/4 (1 - e^(-4 mu t / 3)) and never passes 3/4.', 'Real base changes outnumber the differences once a site is hit twice; the distance -3/4 ln(1 - 4p/3) corrects for it.', 'A finite sequence: the match is statistical, and a new seed gives another history.'],
    fin: null,
  },
  dogmeCentral: {
    titre: 'Gene to RNA to protein (the central dogma, one molecule at a time)',
    enUnePhrase: 'Two curves over the last 30 mRNA lifetimes: how many mRNA and how many protein molecules the cell holds, each divided by its exact mean, so 1 is the average.',
    colonnes: ['time t (mRNA lifetimes, the last 30)', 'count divided by its exact mean (1 = the mean)', 'which molecule (0 = mRNA, 1 = protein)'],
    aRegarder: ['The mRNA count jumps one by one around k: Poisson noise, variance equal to the mean.', 'Proteins come in bursts from each mRNA, so their noise is larger: Fano factor 1 + kp / (1 + gp).', 'The means, the noises and the mRNA-protein covariance are compared with exact formulas, with uncertainties measured on the run.'],
    fin: null,
  },
  /* game112 */
  deriveGenetique: {
    titre: 'Genes drifting by chance (Wright-Fisher genetic drift)',
    enUnePhrase: 'The share of one gene variant in small populations, generation after generation, one population per frame.',
    colonnes: ['generation', 'share of the variant (0 = lost, 1 = fixed)', 'population number (a label)'],
    aRegarder: ['Each population wanders by pure chance until the variant is lost or fixed; smaller populations decide faster.', 'On average nothing moves: the mean share stays p0, while the variety 2p(1 - p) fades exactly as (1 - 1/2N)^t.', 'A variant ends up winning in a share p0 of the populations.'],
    fin: null,
  },
  enzyme: {
    titre: 'An enzyme at work (Michaelis-Menten kinetics)',
    enUnePhrase: 'Three curves over the whole reaction: the substrate left, the product made, and the share of the enzyme that is busy.',
    colonnes: ['time t', 'share: substrate left S/S0, product made P/S0, enzyme busy C/E0', 'which curve (0 = substrate, 1 = product, 2 = busy enzyme)'],
    aRegarder: ['Total enzyme and total matter stay constant at every step.', 'The rate follows Vmax S / (Km + S) only when there is little enzyme: the error scale E0 / (S0 + Km) is shown.', 'Raise the enzyme and the complex takes up substrate before the law can hold: the formula visibly fails.'],
    fin: null,
  },
  /* game114 */
  mendel: {
    titre: 'The laws of Mendel (a cross of two double hybrids)',
    enUnePhrase: 'Each offspring of two AaBb parents placed on the grid of its genotype: copies of A across, copies of B up.',
    colonnes: ['copies of the dominant allele A (0, 1, 2)', 'copies of the dominant allele B (0, 1, 2)', 'offspring number (a label)'],
    aRegarder: ['The middle cell (AaBb, like the parents) holds a quarter of the offspring; each gene splits 1 : 2 : 1.', 'Counted by traits, independent genes give 9 : 3 : 3 : 1.', 'Lower the recombination rate: the genes travel together and the corner cells AAbb, aaBB empty out.'],
    fin: null,
  },
  neurone: {
    titre: 'A neuron that fires (integrate-and-fire)',
    enUnePhrase: 'The membrane potential of a model neuron for seven input currents, one per frame: it charges, fires at 1, resets.',
    colonnes: ['time t', 'membrane potential v (rest 0, threshold 1)', 'input current I of the frame'],
    aRegarder: ['Below the threshold current 1 the potential creeps up to v = I and never fires.', 'Above it the neuron fires every t_ref + tau ln(I / (I - 1)): exact, compared frame by frame.', 'More current, faster firing, but never faster than one spike per refractory time.'],
    fin: null,
  },
  /* game146 */
  kapitza: {
    titre: 'The pendulum of Kapitza (standing upside down)',
    enUnePhrase: 'A pendulum turned upside down on a pivot shaken up and down twenty times a second: its tilt, its speed and the time.',
    colonnes: ['tilt from the upright theta (degrees)', 'angular speed', 'time t'],
    aRegarder: ['It does not fall: the tilt rocks slowly from side to side around the top, and every shake adds a small shiver.', 'Shake harder and it rocks faster; the slow rhythm matches the linear Floquet theory, and the classical Kapitza formula falls behind as the shaking grows.', 'Too weak a shake and it falls; too strong a shake and it falls again, although the Kapitza formula still says it should stand.'],
    fin: null,
  },
  /* game145 */
  penduleRessort: {
    titre: 'A pendulum on a spring (the 2 : 1 resonance)',
    enUnePhrase: 'Where a weight on a spring goes when it is let go stretched straight down, with the faintest push sideways.',
    colonnes: ['x (sideways)', 'height y (the pivot is at 0)', 'time t'],
    aRegarder: ['At first the weight only bounces up and down: the sideways push is a millionth of the bounce.', 'When the bounce is exactly twice as fast as the swing, the push grows every bounce until the weight swings instead of bouncing, then hands the energy back.', 'Move the ratio away from 2 (try 2.5): the push never grows and the weight bounces for ever.'],
    fin: null,
  },
  /* game144 */
  toupie: {
    titre: 'A spinning top (nutation and precession)',
    enUnePhrase: 'How far the axis of a spinning top has turned around the vertical and how tilted it is, over time: let go tilted, then launched in steady precession.',
    colonnes: ['angle turned around the vertical phi (radians)', 'tilt of the axis theta (degrees)', 'time t'],
    aRegarder: ['Let go from rest, the axis first falls, then the spin swings it sideways: the curve makes a cusp each time it comes back up, where it stops turning for an instant.', 'Spin faster: the dips get smaller and quicker, and the slow turn around the vertical gets slower, about M g l / (I3 omega3).', 'The straight line is the same top launched at the exact steady rate: no dip at all, the tilt stays put.'],
    fin: null,
  },
  /* game143 */
  dzhanibekov: {
    titre: 'The tumbling racket (Dzhanibekov effect)',
    enUnePhrase: 'The spin of a free body, seen from the body itself, thrown about the middle one of its three axes, then about the other two.',
    colonnes: ['spin about axis 1 (least inertia)', 'spin about axis 2 (the middle one)', 'spin about axis 3 (most inertia)'],
    aRegarder: ['The big loop is the middle-axis spin: it runs from one pole to the opposite one and back, the body turning over each time.', 'The two small loops are spins about the other two axes, thrown with the same tiny wobble: it never grows.', 'Make the wobble ten times smaller: the turn-over comes later, but only by a fixed step, the logarithm of the wobble.'],
    fin: null,
  },
  /* game142 */
  perleCerceau: {
    titre: 'A bead on a spinning hoop (a pitchfork)',
    enUnePhrase: 'How a bead on a spinning hoop moves and where it comes to rest, run at many spins, drawn as spin, angle and time.',
    colonnes: ['spin omega (units of sqrt(g / R))', 'angle theta of the bead from the bottom (radians)', 'time t'],
    aRegarder: ['At slow spins every path dies out at angle zero: the bead returns to the bottom.', 'Past the critical spin the paths settle away from zero, half on one side and half on the other: one rest place has split into two.', 'The rest angle follows cos theta = 1 / omega^2 exactly; more friction only makes the bead settle sooner, not elsewhere.'],
    fin: null,
  },
  /* game141 */
  echelleGlisse: {
    titre: 'A ladder sliding down a wall',
    enUnePhrase: 'A ladder let go against a smooth wall, drawn at several instants until its top leaves the wall, with the path of its middle.',
    colonnes: ['x (the wall is x = 0)', 'height y (the floor is y = 0)', 'time t'],
    aRegarder: ['The middle of the ladder moves on a quarter circle around the corner while both ends touch.', 'The top leaves the wall at two thirds of its starting height, whether the ladder started nearly upright or already low.', 'The push of the wall is never put in: it is read from how the middle speeds up sideways, and it fades to zero exactly there.'],
    fin: null,
  },
  /* game140 */
  chainette: {
    titre: 'A hanging chain (the catenary)',
    enUnePhrase: 'A chain of rigid links hanging from two hooks, its shape found by letting it sink as low as the links allow, drawn beside the continuous catenary.',
    colonnes: ['x (the chain hangs from -1 to 1)', 'height y', 'curve (0 = links found, 1 = continuous catenary)'],
    aRegarder: ['The links are steepest at the hooks and flat in the middle: from one link to the next the slope changes by the same step.', 'Add links and the chain closes in on the smooth catenary a cosh(x / a), not on a parabola of the same length.', 'Make the chain longer than the span: it sags deeper, and the catenary and the parabola drift further apart.'],
    fin: null,
  },
  /* game139 */
  tautochrone: {
    titre: 'The cycloid where every ball arrives together (tautochrone)',
    enUnePhrase: 'Balls let go at the same moment from different heights on an upside-down cycloid: how far each one is from the bottom, along the curve, as time goes on.',
    colonnes: ['time t', 'distance s along the curve from the bottom', 'ball (1 = released lowest)'],
    aRegarder: ['Every curve crosses zero at the same instant: low or high, every ball reaches the bottom together, at t = pi.', 'The curves are pure sine waves of one period, 4 pi: along the cycloid the swing is exactly harmonic.', 'Raise the highest release towards 170 degrees: the balls still arrive together, while a pendulum on a circle released as high (the witness) falls behind.'],
    fin: null,
  },
  /* game138 */
  pendulesCouples: {
    titre: 'Two pendulums joined by a spring',
    enUnePhrase: 'The swing of two pendulums joined by a spring: the first one started, the motion passes to the second and back.',
    colonnes: ['time t', 'swing x', 'pendulum (0 = first, 1 = second)'],
    aRegarder: ['One pendulum slows to a stop while the other one swings fully, then the other way round: the energy is handed over.', 'The hand-over takes pi / (sqrt(1 + 2 k) - 1): weaken the spring and it takes longer.', 'Start the second one at the same swing (start = 1): nothing passes across, they swing together for ever.'],
    fin: null,
  },
  /* game137 */
  anneauxNewton: {
    titre: 'Newton\'s rings',
    enUnePhrase: 'Light reflected by a curved lens lying on flat glass, seen from above: bright and dark rings.',
    colonnes: ['x (mm)', 'y (mm)', 'reflected intensity (0 dark, 1 bright)'],
    aRegarder: ['The centre is dark where the lens touches the glass: one of the two reflections flips the wave.', 'The rings crowd together outwards: their squared radii grow by the same step, lambda R.', 'Move the wavelength from blue to red: the rings widen. Lift the lens a little: the rings slide inwards and disappear at the centre.'],
    fin: null,
  },
  /* game136 */
  desintegration: {
    titre: 'Radioactive decay, atom by atom',
    enUnePhrase: 'How many atoms are left at each step when every one of them decays by chance, counted and compared with N0 2^(-t/T).',
    colonnes: ['time (steps)', 'atoms left', 'curve (0 = counted, 1 = formula)'],
    aRegarder: ['No atom knows when it will decay, yet the count halves every half-life: the exponential comes out of chance alone.', 'The counted curve is a staircase that wanders a little around the smooth formula: fewer atoms, bigger wanderings.', 'Change the seed: the staircase changes, the half-life measured stays within a few standard deviations of T.'],
    fin: null,
  },
  /* game135 */
  refractionSnell: {
    titre: 'Light bending into water (Fermat and the Snell window)',
    enUnePhrase: 'Rays from a point under water to targets in the air, each one the fastest path; steeper rays reflected back.',
    colonnes: ['x (the surface is y = 0)', 'height y (water below, air above)', 'ray number'],
    aRegarder: ['Each ray bends at the surface: it is the path that takes the least TIME, light being slower in water.', 'Under water the rays crowd into a cone of half-angle asin(1 / n): the whole sky seen through a window (48.8 degrees for n = 1.33 by the formula).', 'Rays steeper than that never get out: they are reflected back down.'],
    fin: null,
  },
  /* game134 */
  reseauFentes: {
    titre: 'Light through many slits (a diffraction grating)',
    enUnePhrase: 'Brightness seen in each direction behind 2 slits, a middle number, and N slits, the waves summed slit by slit.',
    colonnes: ['sin theta (direction seen)', 'intensity I / N^2', 'number of slits N'],
    aRegarder: ['The bright orders do not move when slits are added: they stay where d sin theta = m lambda.', 'More slits, sharper orders: that is why a grating splits colours so finely.', 'Between two orders, count the dark fringes: N - 1; and the small bumps: N - 2.'],
    fin: null,
  },
  /* game133 */
  corpsNoir: {
    titre: 'The glow of hot bodies (Planck\'s law)',
    enUnePhrase: 'How much light a body gives off at each wavelength, one curve per temperature (Planck\'s law).',
    colonnes: ['wavelength lambda (units of h c / (k T0))', 'spectral radiance B', 'curve (0 = coolest, T = 1)'],
    aRegarder: ['Hotter bodies peak at shorter wavelengths: lambda_max T is the same for every curve (Wien).', 'The area under a curve grows as T to the fourth power: the hottest curve dwarfs the others (Stefan-Boltzmann).', 'At long wavelengths every curve falls slowly; at short ones it drops to nothing: no ultraviolet catastrophe.'],
    fin: null,
  },
  /* game127 */
  dureeJour: {
    titre: 'How long the day lasts through the year',
    enUnePhrase: 'Hours of daylight on each day of the year at the latitude chosen, counted and computed.',
    colonnes: ['day of the year (0 = equinox)', 'hours of daylight', 'curve (0 = counted, 1 = formula)'],
    aRegarder: ['At the equator every day lasts 12 hours, whatever the tilt.', 'Further from the equator the swing grows; past the polar circle the curve touches 24 hours (midnight sun) and 0 (polar night).', 'The two curves lie on top of each other: counting minute by minute and the formula cos H0 = -tan(latitude) tan(declination) agree.'],
    fin: null,
  },
  courseRoulante: {
    titre: 'The rolling race (sphere, cylinder, ring)',
    enUnePhrase: 'Distance down a slope against time for a block, a sphere, a cylinder and a ring let go together.',
    colonnes: ['time t', 'distance down the slope', 'body (0 block, 1 sphere, 2 cylinder, 3 ring)'],
    aRegarder: ['The sphere always beats the cylinder, which beats the ring: spinning takes a share of the energy (k = 2/5, 1/2, 1).', 'Without friction nothing rolls: all four slide and arrive together.', 'Below the friction k/(1 + k) tan theta a body slides instead of rolling and part of the energy becomes heat.'],
    fin: null,
  },
  /* game126 */
  penduleAmplitude: {
    titre: 'A pendulum swinging high (the exact period)',
    enUnePhrase: 'Loops of angle against speed for a pendulum released from six angles, the largest one chosen.',
    colonnes: ['angle theta (radians)', 'angular speed', 'time t'],
    aRegarder: ['Small swings are ellipses and take 2 pi; wide swings flatten at the ends and take longer.', 'The period is exactly 2 pi / AGM(1, cos(theta0/2)), the arithmetic-geometric mean of Gauss.', 'Close to 180 degrees the pendulum lingers at the top and the period grows without bound.'],
    fin: null,
  },
  phasesLune: {
    titre: 'The phases of the Moon',
    enUnePhrase: 'The lit part of the Moon as seen from the Earth, frame by frame from full Moon.',
    colonnes: ['x on the disc', 'y on the disc', 'phase angle in degrees (0 = full Moon)'],
    aRegarder: ['The edge between light and dark is half an ellipse: the Moon is a ball lit from one side.', 'The lit share is exactly (1 + cos phi) / 2: half at the quarters.', 'Nothing hides the Moon: the phases are only the angle between the Sun and us.'],
    fin: null,
  },
  /* game125 */
  carnot: {
    titre: 'The Carnot cycle (the best possible engine)',
    enUnePhrase: 'One Carnot cycle of an ideal gas drawn in the (volume, pressure) plane.',
    colonnes: ['volume V', 'pressure P', 'leg of the cycle (0 hot expansion, 1 cooling, 2 cold compression, 3 heating)'],
    aRegarder: ['The area inside the loop is the work the engine gives in one cycle.', 'Work divided by the heat taken in is exactly 1 - Tc/Th.', 'Change the gas (degrees of freedom): the loop changes shape, the efficiency does not.'],
    fin: null,
  },
  montyHall: {
    titre: 'The Monty Hall problem',
    enUnePhrase: 'Two curves: the share of games won so far by sticking with the first door, and by switching.',
    colonnes: ['games played', 'share of games won so far', 'strategy (0 = stick, 1 = switch)'],
    aRegarder: ['With three doors, switching wins two games in three; sticking, one in three.', 'With n doors: switching (n - 1)/(n (n - 2)), sticking 1/n; switching always wins more.', 'Early on the curves wander; they settle as the games add up.'],
    fin: null,
  },
  lentilleMince: {
    titre: 'A thin lens forms an image',
    enUnePhrase: 'Nine rays from one point of an object, through a lens of focal length 1, meeting again at the image.',
    colonnes: ['x along the axis (lens at 0)', 'height y', 'ray number (a label)'],
    aRegarder: ['All rays meet at one point, at 1/do + 1/di = 1/f.', 'The image is upside down, magnified by -di/do.', 'Inside the focal length the rays spread: a virtual image appears in front of the lens (a magnifying glass).'],
    fin: null,
  },
  /* game124 */
  paraboleTir: {
    titre: 'The best angle to throw (projectiles and the safety parabola)',
    enUnePhrase: 'Stones thrown at the same speed under every angle from a height h, and the parabola that bounds them all.',
    colonnes: ['distance x', 'height y', 'launch angle in degrees (a label; 0 = the safety parabola)'],
    aRegarder: ['From the ground the longest throw is at 45 degrees.', 'From higher up the best angle is flatter: atan(1 / sqrt(1 + 2 h)).', 'No path crosses the safety parabola; each touches it once.'],
    fin: null,
  },
  solidesPlatoniques: {
    titre: 'The five Platonic solids',
    enUnePhrase: 'One of the five regular solids, drawn by its edges in 3-D.',
    colonnes: ['x', 'y', 'z'],
    aRegarder: ['Count them: vertices - edges + faces = 2, for every solid (Euler).', 'The cube and the octahedron swap faces and vertices; so do the dodecahedron and the icosahedron.', 'The angle between two faces is exact: sin(theta / 2) = cos(pi / q) / sin(pi / p).'],
    fin: null,
  },
  /* game123 : mecanique (tam-mecanique.js) */
  billardPi: {
    titre: 'Colliding blocks that count pi',
    enUnePhrase: 'The state of two blocks after each collision, drawn in a plane where kinetic energy is a circle.',
    colonnes: ['sqrt(M) times the big block speed', 'sqrt(m) times the small block speed', 'collision number (a label)'],
    aRegarder: ['Every state sits on one circle: the energy never changes.', 'Each pair of collisions turns the state by the same small angle 2 theta.', 'Count the collisions: 3, 31, 314, 3141... the digits of pi.'],
    fin: null,
  },
  modesNormaux: {
    titre: 'Normal modes of a chain of springs',
    enUnePhrase: 'A chain of masses on springs swinging in one of its normal modes, frame by frame over one period.',
    colonnes: ['mass number along the chain (the ends are fixed)', 'displacement', 'time t'],
    aRegarder: ['Every mass swings in step: the shape keeps its nodes and only grows and shrinks.', 'The period is exactly 2 pi / omega_j with omega_j = 2 sin(j pi / (2 (N + 1))).', 'Higher modes have more nodes and swing faster.'],
    fin: null,
  },
  /* game122 : electricite (tam-electricite.js) et Pascal */
  lignesChamp: {
    titre: 'Field lines of two charges',
    enUnePhrase: 'Electric field lines leaving a positive charge (left) and landing on a negative one (right), or escaping.',
    colonnes: ['x (charges at -1 and +1)', 'y', 'field line number (a label)'],
    aRegarder: ['Each line lands at the angle set by the flux: q1 theta = |q2| phi, exactly.', 'Make the negative charge weaker: lines run out of room on it and escape to infinity.', 'Equal and opposite charges: in 2-D every line is a circle through both.'],
    fin: null,
  },
  circuitRC: {
    titre: 'Charging a capacitor (RC circuit)',
    enUnePhrase: 'Two curves: the capacitor voltage and the current, while it charges (t < 6) then discharges.',
    colonnes: ['time t (charge until 6, then discharge)', 'voltage V (curve 0) or R times current (curve 1)', 'which curve (0 = voltage, 1 = current)'],
    aRegarder: ['The voltage climbs as 1 - e^(-t/tau): two thirds of the way after one tau.', 'The resistor turns into heat exactly as much energy as the capacitor keeps: half of what the battery gives, for a full charge.', 'A large tau is too slow to finish by t = 6: then less than half is lost.'],
    fin: null,
  },
  pascalSierpinski: {
    titre: 'The triangle of Pascal, odd numbers only (Sierpinski)',
    enUnePhrase: 'The odd numbers of the triangle of Pascal, row by row from the top: the Sierpinski triangle.',
    colonnes: ['position in the row', 'row (from the top)', 'row number n (a label)'],
    aRegarder: ['Row n has exactly 2^(number of 1s in n in binary) odd numbers.', 'The first 2^m rows hold exactly 3^m of them.', 'The pattern repeats itself at every scale: a fractal.'],
    fin: null,
  },
  /* game120 : ondes (tam-ondes.js) */
  arcEnCiel: {
    titre: 'Why a rainbow (rays in a raindrop)',
    enUnePhrase: 'Light rays coming from the left, bending into a round drop, bouncing once off its back and leaving.',
    colonnes: ['x (drop of radius 1)', 'y (same)', 'height b at which the ray came in (a label)'],
    aRegarder: ['Every ray turns back by at least one smallest angle, and many rays leave close to it: the light piles up there.', 'That angle is Descartes\' exact cos^2 i = (n^2 - 1)/3; the rainbow sits at 180 degrees minus it.', 'Change the index n: a different colour bends differently, which spreads the bow into colours.'],
    fin: null,
  },
  cordeVibrante: {
    titre: 'A plucked string (the wave equation)',
    enUnePhrase: 'A string plucked at one point, frame by frame over half a period.',
    colonnes: ['position along the string (0 to 1)', 'displacement u', 'time (in units of L / c)'],
    aRegarder: ['The kink splits in two and travels both ways; after half a period the shape is upside down and mirrored.', 'After a full period the string is back in its exact starting shape (the scheme is exact for this equation).', 'Pluck it in the middle: every even harmonic vanishes.'],
    fin: null,
  },
  effetDoppler: {
    titre: 'The Doppler effect and the sonic boom',
    enUnePhrase: 'The wavefronts sent once per period by a source moving to the right.',
    colonnes: ['x (wavelengths)', 'y (wavelengths)', 'time the front was sent (a label)'],
    aRegarder: ['Ahead of the source the fronts bunch up to (c - v) T: a higher pitch.', 'Behind they spread to (c + v) T: a lower pitch.', 'Faster than the waves (M > 1) the fronts gather on a cone with sin(theta) = 1/M: the sonic boom.'],
    fin: null,
  },
  /* game118 */
  gazParfait: {
    titre: 'An ideal gas (molecules in a box)',
    enUnePhrase: 'Molecules flying in a square box and bouncing off its walls, frame by frame.',
    colonnes: ['x in the box', 'y in the box', 'speed of the molecule (a label)'],
    aRegarder: ['Each hit on the right wall is counted; the push per unit length is the pressure.', 'It follows the ideal gas law P A = N T: double the temperature, double the pressure.', 'Speeds spread out as Maxwell predicts; their mean is exactly sqrt(pi T / 2).'],
    fin: null,
  },
  hardyWeinberg: {
    titre: 'Hardy-Weinberg (one generation of random mating)',
    enUnePhrase: 'Parents (below) that are all AA or aa, and their children (above) after one round of random mating.',
    colonnes: ['copies of allele A (0, 1, 2)', 'generation (0 = parents, 1 = children)', 'individual number (a label)'],
    aRegarder: ['The parents have no Aa at all, yet the children have a share 2 p q of them.', 'One generation is enough: AA : Aa : aa = p^2 : 2 p q : q^2, exactly.', 'A finite number of children: the match is statistical.'],
    fin: null,
  },
  /* game115 : mathematiques (tam-maths.js) */
  marcheAleatoire: {
    titre: 'Random walks on a grid',
    enUnePhrase: 'The path of a walker stepping to a random neighbour on a grid, one walker per frame.',
    colonnes: ['x (grid steps)', 'y (grid steps)', 'step number'],
    aRegarder: ['Each path wanders with no plan, yet the mean squared distance after n steps is exactly n.', 'Doubling the steps only multiplies the typical distance by sqrt 2.', 'A finite number of walkers: the match is statistical.'],
    fin: null,
  },
  aiguilleBuffon: {
    titre: 'Buffon\'s needles (finding pi by throwing needles)',
    enUnePhrase: 'Needles thrown at random on a floor of boards one unit wide; each needle is drawn by its two ends.',
    colonnes: ['x (floor widths)', 'y (floor widths; the lines are at whole numbers)', 'crosses a line (1) or not (0)'],
    aRegarder: ['The share of needles crossing a line is exactly 2 l / pi.', 'So the needles estimate pi: 2 l divided by that share.', 'The estimate tightens slowly: four times the needles for twice the precision.'],
    fin: null,
  },
  anniversaires: {
    titre: 'The birthday paradox',
    enUnePhrase: 'The birthdays of groups of people drawn round a circle, one ring per group.',
    colonnes: ['x (birthday as an angle round the circle)', 'y (same)', 'group number (a label)'],
    aRegarder: ['With 23 people and 365 days, two share a birthday more often than not: 1 - prod (1 - i/D) is above one half.', 'There are k (k - 1) / 2 pairs in a group, each with a 1/D chance: that is why it happens so fast.', 'A finite number of groups: the match is statistical.'],
    fin: null,
  },
  spiraleUlam: {
    titre: 'Primes on the Ulam spiral',
    enUnePhrase: 'The integers wound in a square spiral from 1 in the middle; only the primes are drawn.',
    colonnes: ['x on the Ulam spiral', 'y on the Ulam spiral', 'the prime itself'],
    aRegarder: ['The primes gather along diagonals, a pattern nobody has fully explained.', 'Their exact count (from a sieve) is compared with Li(N) and N / ln N, approximations from the prime number theorem.', 'Near N, primes are on average about ln N apart.'],
    fin: null,
  },
  /* game113 : chimie (tam-chimie.js) */
  reactionsChaine: {
    titre: 'A chain of reactions A to B to C (Bateman)',
    enUnePhrase: 'Three curves over time: the share of molecules that are still A, that are B in between, and that have become C.',
    colonnes: ['time t', 'share of the molecules (0..1)', 'which species (0 = A, 1 = B, 2 = C)'],
    aRegarder: ['A falls as e^(-k1 t); C rises to take everything in the end.', 'The intermediate B rises then falls, peaking at the exact time t* = ln(k1/k2)/(k1 - k2).', 'A finite number of molecules: the match is statistical, and a new seed gives another run.'],
    fin: null,
  },
  equilibreChimique: {
    titre: 'A reaction going both ways (chemical equilibrium A <-> B)',
    enUnePhrase: 'Molecules hopping between two wells, A on the left and B on the right, frame by frame from an all-A start.',
    colonnes: ['x: well A on the left, well B on the right (the place inside a well is drawn)', 'y (drawn)', 'time t'],
    aRegarder: ['The share of B rises as pi (1 - e^(-(kf + kb) t)) with pi = kf / (kf + kb).', 'Molecules never stop hopping, but the flows balance: [B]/[A] settles at K = kf / kb.', 'A finite number of molecules: the match is statistical.'],
    fin: null,
  },
  brusselator: {
    titre: 'A chemical clock (the Brusselator)',
    enUnePhrase: 'Two concentrations of an oscillating reaction over time, from a start next to the balance point (A, B/A).',
    colonnes: ['concentration x', 'concentration y', 'time t'],
    aRegarder: ['Below the exact threshold B = 1 + A^2 the reaction spirals into its balance point at the exact linear rate.', 'Above it the reaction never settles: it ticks on a closed loop like a clock.', 'Near the threshold the period is close to 2 pi / A; further away it is measured only.'],
    fin: null,
  },
  /* ---------- familles hors science ---------- */
  __attracteur: {
    titre: 'Strange attractor',
    enUnePhrase: 'The path of a chaotic system of equations, followed step by step.',
    colonnes: (p) => Array.from({ length: Math.max(2, Math.floor(Number(p && p.D) || 3)) }, (_, j) => 'x' + (j + 1) + ': state variable ' + (j + 1) + ' of the equations (no physical unit)'),
    aRegarder: ['The path never repeats but stays on the same shape: that shape is the attractor.'],
    fin: null,
  },
  __formule: {
    titre: 'Your formula',
    enUnePhrase: 'The points your formula produces.',
    colonnes: ['x of your formula', 'y of your formula', 'z of your formula'],
    aRegarder: ['Change one term at a time and watch which part of the shape moves.'],
    fin: null,
  },
};

/** la legende complete d un systeme, noms, colonnes et film resolus pour ces params ; null si inconnu */
export function legende(id, params = {}) {
  const e = L[id]; if (!e) return null;
  const colonnes = Object.freeze(typeof e.colonnes === 'function' ? e.colonnes(params) : e.colonnes.slice());
  const noms = nomsDe(id, params);
  const film = filmDe(id, params);
  /* game80 : un film se colore par moment (pas par colonne) ; des objets nommes hors systeme de corps sont dits en plus */
  const couleurs = (CORPS[id] && noms ? couleursCorps(noms, CENTRES[id]) : film ? couleursFilm(film) : couleursDominantes(colonnes))
    /* game81 : un « moment » d un film de champs quantiques n est pas toujours un instant : le module le dit, la legende aussi */
    + (film && FILMS_DU_MODULE[id] && FILMS_DU_MODULE[id].note ? ' Here ' + FILMS_DU_MODULE[id].note + '.' : '')
    + (noms && !CORPS[id] && e.objets ? ' ' + e.objets(noms) : '');
  return Object.freeze({
    titre: e.titre, enUnePhrase: e.enUnePhrase, colonnes, couleurs,
    aRegarder: Object.freeze(e.aRegarder.slice()), fin: e.fin,
    film: film ? Object.freeze(film) : null, noms: noms ? Object.freeze(noms) : null,
  });
}
/** toutes les legendes aux params par defaut */
export const LEGENDES = Object.freeze(Object.fromEntries(Object.keys(L).map((id) => [id, legende(id, {})])));
