/* tam-science.js — game76 (Phil 01/11 : « vasy fait tout ») : MINTER les sciences en direct (physique, fractales, or, quantique, fluides)
 *   avec le contrat TamArt DEJA deploye. Pur : aucun DOM, aucun reseau ; le serveur et la page l importent tous les deux.
 *   ⛔ Pourquoi ca tient sans TamArt v2 (relu dans contracts/src/TamArt.sol#mint) : le contrat ne verifie que l en-tete
 *     ('T' 'A' 'M', VERSION 1, q dans 1..16, drapeau nuage 0/1) et refuse un doublon par keccak ; il ne connait PAS la famille.
 *     Une oeuvre de science est donc encodee au MEME format (tam-moteur.js#encoder), q = 12, et rejouee par n importe qui depuis
 *     ses params publics : simuler (module de la science, deterministe : aucune fonction transcendante native) -> standardiser ->
 *     projeterND (la cascade du moteur) -> quantifier -> tri Morton pour un nuage -> encoder.
 *   ⛔ Certificats d une science : bornee, dans les bornes de son module, et DISTINCTE de toutes les oeuvres mintees (meme seuil que les
 *     attracteurs, 0.20). Pas de seuil de chaos : une orbite de Kepler n est pas chaotique, et elle n a pas a l etre — la carte le dit. */
import * as PHY from './tam-physique.js';
import * as SCI from './tam-sciences.js';
import * as FLU from './tam-fluides.js';
/* game78 : les astres (systeme solaire J2000, S2/Sgr A*, binaire, amas, supernova, galaxies), le cosmos (lumiere et trous noirs, Kerr,
 *   trou de ver, Lagrange, Hulse-Taylor, matiere noire, expansion, Halley, TRAPPIST-1, disque), l invisible (onde gravitationnelle,
 *   courbure, chute, dilatation, tunnel, superposition, dipole, lumiere, Minkowski, Brown) et le quantique (Talbot, oscillateur, Wigner,
 *   marche, Bell, rotor, Landau, Stern-Gerlach) — chaque module a son banc (valeurs connues + mutants) */
import * as AST from './tam-astro.js';
import * as COS from './tam-cosmos.js';
import * as INV from './tam-invisible.js';
import * as QUA from './tam-quantique.js';
/* game79 : la fusion de trous noirs IMRPhenomB (arXiv 0909.2867), spins alignes, restes Hofmann-Barausse-Rezzolla / Barausse-Morozova-Rezzolla */
import * as FUS from './tam-fusion.js';
/* game80 : les « grandes questions » (vide quantique, Big Rip, faux vide, centre de la Terre, Mars, zero absolu, taille de l Univers,
 *   pi, calendrier cosmique ; pendule de Foucault, mouvement de la Terre, etoiles, evaporation des trous noirs, tsunami, geometrie de
 *   l Univers, tailles des etoiles) — chaque valeur sourcee (URL en commentaire), chaque systeme verifie contre la valeur publiee */
import * as GQ1 from './tam-grandes-questions.js';
import * as GQ2 from './tam-grandes-questions-2.js';
/* game81 : les champs quantiques (champ libre, fluctuations du vide, interaction de champs, Schwinger, Unruh, couplage courant, Compton),
 *   les atomes (Slater, raies NIST) et les quarks (potentiel de Cornell, charmonium vs PDG) — valeurs de comparaison sourcees (SOURCES) */
import * as CHQ from './tam-champs-quantiques.js';
/* game88 (Phil : « les principes du vide quantique ») : vide comprime, Casimir dynamique, vide de Higgs, emission spontanee —
 *   adimensionnels, chacun contre sa formule exacte (aucune valeur publiee : SOURCES vide) */
import * as VQ from './tam-vide-quantique.js';
/* game93 (nuit du 01/11, « ce qu il manque comme theories ») : Ising 2D (Onsager), Lotka-Volterra (H conserve), SIR (taille finale exacte),
 *   lentille gravitationnelle (images et amplification exactes), Kuramoto (Kc = 2 gamma), Gibbs (Si(pi) calcule) — SOURCES vide */
import * as T2 from './tam-theories-2.js';
/* game96 : Rutherford (b = k/(2E) cot(theta/2)), logistique (r1 = 3, r2 = 1 + sqrt 6), chaleur (sigma^2 = sigma0^2 + 2Dt),
 *   oscillateur force (amplitude exacte), brachistochrone (sqrt(a/g) theta), Galton (binomiale) — SOURCES vide */
import * as T3 from './tam-theories-3.js';
/* game111 (Phil : « ajoute tout ce qui est relie a l ADN, l ARN et le reste ») : sciences de la vie — mutations de l ADN (Jukes-Cantor),
 *   gene -> ARN -> proteine (Gillespie, moments exacts) — SOURCES vide ; game112 : derive genetique (Wright-Fisher), enzyme (Michaelis-Menten) */
import * as BIO from './tam-biologie.js';
/* game113 (Phil : « ajoute aussi une categorie science chimique ») : reactions en chaine (Bateman), equilibre A <-> B, brusselator
 *   (seuil de Hopf exact) — SOURCES vide (pas de pH : la constante de l eau est une valeur publiee non lue) */
import * as CHI from './tam-chimie.js';
/* game115 (Phil : « un codex math et science extremement complet ») : mathematiques du hasard et des nombres — marches au hasard,
 *   aiguilles de Buffon, anniversaires, spirale d Ulam — SOURCES vide (le nombre de jours d une annee est un curseur) */
import * as MAT from './tam-maths.js';
/* game120 (passe « ce qui manque » : un seul systeme d ondes dans tout le codex) : arc-en-ciel (Descartes), corde vibrante (schema exact
 *   a Courant 1), effet Doppler et cone de Mach — SOURCES vide (l indice de refraction est un curseur) */
import * as OND from './tam-ondes.js';
/* game122 : electricite — lignes de champ de deux charges (flux q1 theta = |q2| phi), circuit RC (la moitie de l energie perdue) */
import * as ELE from './tam-electricite.js';
/* game123 : mecanique — le billard qui compte pi (ceil(pi / theta) - 1 chocs), modes propres d une chaine (2 sin(j pi / 2(N+1))) */
import * as MEC from './tam-mecanique.js';
import { BORNES, motifDefaut, melangerVue, lnD } from './tam-moteur.js';
import { projeterND, encoder, signature, distance, canon, SEUIL_DISTINCT } from './tam-moteur.js';
import { keccak256Hex } from './keccak.js';

export const VERSION_SCIENCE = 'sci1';
export const Q_SCIENCE = 12;
const DEUX_PI = 6.283185307179586, ANGLE_OR = 2.399963229728653;
const ADR = /^0x[0-9a-f]{40}$/;
/* game79 : + melange (une science x un motif fractal / angle d or — des types DIFFERENTS combines), graine (le cerveau qui a tire),
 *   note (ce que le cerveau a mesure et conclu : stockee on-chain AVEC l oeuvre, dans les params, quand quelqu un la minte) */
const CLES = new Set(['v', 'science', 'params', 'angles', 'q', 'minteur', 'melange', 'graine', 'note']);
export const NOTE_MAX = 700;
/* les systemes VUS mais jamais certifies/mintes (aucun aujourd hui : la fusion est bornee par coutFusion ci-dessous) */
export const NON_MINTABLES = Object.freeze(new Set([]));
/** game79 (Phil : « fais que la fusion passe on-chain ») : le cout de la fusion suit le nombre de cycles, ~ (Mc_det x fDepart)^(-5/3)
 *   (Mc_det = masse de chirp detectee = (m1 m2)^(3/5) / (m1+m2)^(1/5) x (1+z)). Mesure 01/11 : defaut (Mc_det x f = 612) 26 ms ;
 *   coin 5+5 Msun, 10 Hz, z = 0 (43.5) 997 ms. Seuil 150 -> ~270 ms au pire, comme la supernova hydrodynamique. */
/* game80 (audit des durees : des coins de reglage depassent 300 ms de calcul serveur) : des gardes de COUT, calculees AVANT toute
 *   simulation, mesurees le 01/11 a n = 1500. Au-dela : visible dans la page, pas certifiable (la raison est dite). */
export const GARDES_COUT = Object.freeze({
  /* game82 : un certificat ne simule plus qu UNE fois (il simulait 3 fois) — gardes re-mesurees seules sur 1 simulation, cible ~400 ms.
   * paquetOscillateur : 16 periodes = 398 ms au pire mesure (x0 0, largeur 2, omega 0.5), 20 = 485 ms -> 16 (etait 8) */
  paquetOscillateur: (p) => (Number(p.periodes) <= 16 ? null : 'at most 16 periods can be certified here (each period costs computing time)'),
  /* amasEtoiles : etoiles^2 x duree / 1600 <= 9 -> 308 ms au pire sur masseTrouNoir x viriel ; 12 -> 428 ms : on garde 9 */
  amasEtoiles: (p) => ((Number(p.etoiles) ** 2) * Number(p.duree) / 1600 <= 9 ? null : 'fewer stars or a shorter run can be certified here (stars^2 x duration / 1600 must stay <= 9)'),
  /* le systeme solaire INTERIEUR (groupe 0) : 244 ms a 100 ans, 482 a 200 -> 150 ans (etait 100) ; le groupe 1 est rapide (37 ms a 400) */
  systemeSolaire: (p) => (Math.round(Number(p.groupe)) === 1 || Number(p.annees) <= 150 ? null : 'at most 150 years of the inner planets can be certified here'),
  /* champDipolaire : 80 ms au pire des bornes (B0 2000, duree 240) -> plus de garde (elle refusait 37 tirages / 200 pour rien) */
});
export const FUSION_PRODUIT_MIN = 90; /* Phil : « augmente les limites » — 150 -> 90 : plus de couples acceptes, pire cas mesure au banc */
export function coutFusion(p) {
  const m1 = Number(p.m1), m2 = Number(p.m2), z = Number(p.z) || 0, f = Number(p.fDepart);
  return chirp(m1, m2) * (1 + z) * f;
}
/* masse de chirp (m1 m2)^(3/5) / (m1+m2)^(1/5) — par exp/ln deterministes (lnD du moteur, expD local) */
function chirp(m1, m2) { return expL(0.6 * lnD(m1 * m2) - 0.2 * lnD(m1 + m2)); }
function expL(x) { /* exp deterministe : 2^k x serie de Taylor sur le reste (meme principe que les modules) */
  const k = Math.round(x / 0.6931471805599453), r = x - k * 0.6931471805599453; let s = 1, t = 1;
  for (let i = 1; i < 30; i++) { t *= r / i; s += t; }
  return s * 2 ** k;
}
const H32 = /^0x[0-9a-f]{64}$/;
/* les motifs offerts au melange : les MEMES que les attracteurs (tam-moteur.js#motifDefaut), sans retouche (une oeuvre = un JSON canonique) */
export const MOTIFS_MELANGE = Object.freeze([['ifs', 'fougere'], ['ifs', 'sierpinski'], ['ifs', 'dragon'], ['julia', null], ['phyllotaxie', null], ['epicycles', null],
  ['lsysteme', 'koch'], ['lsysteme', 'dragon'], ['lsysteme', 'plante']]);

export const SYSTEMES = Object.freeze([PHY, SCI, FLU, AST, COS, INV, QUA, FUS, GQ1, GQ2, CHQ, VQ, T2, T3, BIO, CHI, MAT, OND, ELE, MEC].flatMap((mod) => mod.SYSTEMES.map((s) => Object.freeze({ ...s, mod }))));
export const systeme = (id) => SYSTEMES.find((s) => s.id === id) || null;
/** game82 (audit : le curseur « groupe » glissait par 1/400 et le module l arrondissait) : un parametre ENTIER selon le module lui-meme */
export const paramEntier = (id, k) => { const s = systeme(id); return !!(s && s.mod.ENTIERS && (s.mod.ENTIERS[id] || []).includes(k)); };

/** les angles des plans caches par defaut : l angle d or, comme le moteur (D - 3 angles) */
export function anglesDefaut(D) {
  const a = []; for (let i = 0; i < Math.max(0, D - 3); i++) a.push(Math.round(((i + 1) * ANGLE_OR % DEUX_PI) * 1e6) / 1e6);
  return a;
}
/** les params complets d une oeuvre de science : bornes par son module, angles par defaut, q fixe ; minteur si connu */
export function paramsScience(id, params = {}, { minteur = null, angles = null } = {}) {
  const s = systeme(id); if (!s) throw new Error('science inconnue: ' + id);
  const o = s.mod.simuler(id, params);
  const P = { v: VERSION_SCIENCE, science: id, params: o.params, angles: angles || anglesDefaut(o.D), q: Q_SCIENCE };
  if (minteur && ADR.test(String(minteur).toLowerCase())) P.minteur = String(minteur).toLowerCase();
  return P;
}

/** les params tiennent-ils ? (cles connues, science connue, params = ceux que le module rend apres bornage, angles, q, minteur) */
/** game82 (mesure : un certificat SIMULAIT 3 FOIS la meme oeuvre — valider, puis rejouer = valider + generer ; effetTunnel 923 ms
 *   pour 141 ms de simulation) : la validation garde sa sortie, la generation la reprend. Meme appel, memes nombres : une seule fois. */
export function validerScience(P) { return validerEtSimuler(P).v; }
function validerEtSimuler(P) {
  const sortie = { o: null }, v = validerInterne(P, sortie);
  return { v, o: v.ok ? sortie.o : null };
}
function validerInterne(P, sortie) {
  const non = (raison) => ({ ok: false, code: 'HORS_BORNES', raison });
  if (!P || typeof P !== 'object' || Array.isArray(P)) return non('params absents');
  for (const k of Object.keys(P)) if (!CLES.has(k)) return non('cle inconnue: ' + k);
  if (P.v !== VERSION_SCIENCE) return non('version');
  const s = systeme(P.science); if (!s) return non('science inconnue');
  /* revue game79 (high) : un systeme dont un reglage peut couter des SECONDES de calcul synchrone n est pas certifiable (la route
   *   publique /api/tam/certifier etait un levier de deni de service) ; il reste visible, sans Mint */
  if (NON_MINTABLES.has(P.science)) return non('this system is shown, not minted (too costly to certify on the server)');
  if (GARDES_COUT[P.science] && P.params && typeof P.params === 'object') { const g = GARDES_COUT[P.science](P.params); if (g) return non(g); }
  /* la fusion : le cout borne AVANT toute simulation (la route publique ne peut plus commander des secondes de calcul) */
  if (P.science === 'fusionTrousNoirs' && P.params && typeof P.params === 'object' && !(coutFusion(P.params) >= FUSION_PRODUIT_MIN))
    return non('too many cycles to certify here: raise the masses, the redshift or the starting frequency (chirp mass x (1+z) x fDepart >= ' + FUSION_PRODUIT_MIN + ')');
  if (P.q !== Q_SCIENCE) return non('q');
  if (!P.params || typeof P.params !== 'object' || Array.isArray(P.params)) return non('parametres absents');
  let o; try { o = s.mod.simuler(P.science, P.params); } catch (_) { return non('parametres refuses par le module'); }
  sortie.o = o;
  /* un params hors bornes serait RAMENE par le module : on exige qu il le soit deja (sinon deux JSON differents = la meme oeuvre) */
  if (canon(o.params) !== canon(P.params)) return non('parametres hors bornes (le module les ramene)');
  if (!Array.isArray(P.angles) || P.angles.length !== Math.max(0, o.D - 3) || !P.angles.every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= DEUX_PI)) return non('angles hors bornes');
  if (P.minteur !== undefined && !ADR.test(P.minteur)) return non('minteur');
  if (P.graine !== undefined && !H32.test(P.graine)) return non('graine');
  if (P.note !== undefined && !(typeof P.note === 'string' && P.note.length <= NOTE_MAX && /^[\x20-\x7e·—≈λσπ°]*$/.test(P.note))) return non('note');
  if (P.melange !== undefined) {
    const m = P.melange;
    if (CORPS[P.science]) return non('melange : pas sur un systeme a plusieurs corps');
    if (!m || typeof m !== 'object' || Object.keys(m).sort().join() !== 'motif,operateur,w') return non('melange');
    if (m.operateur !== 'somme' && m.operateur !== 'composition') return non('melange : operateur');
    if (!(typeof m.w === 'number' && m.w >= BORNES.w[0] && m.w <= BORNES.w[1])) return non('melange : poids');
    const ok = MOTIFS_MELANGE.some(([f, v]) => canon(motifDefaut(f, v)) === canon(m.motif));
    if (!ok) return non('melange : motif');
  }
  return { ok: true, code: 'DANS_LES_BORNES', raison: null };
}

/** game78 (systeme solaire en 12-D : la projection N-D melangeait les axes de 4 planetes — boucles emmelees au lieu de 4 orbites) :
 *   les systemes a PLUSIEURS CORPS rangent k coordonnees par corps ; on les dessine dans le MEME espace, corps apres corps.
 *   k = 3 : (x, y, z) par corps ; k = 2 : (x, y) dans le plan, z = 0. */
export const CORPS = Object.freeze({ troisCorps: 3, systemeSolaire: 3, amasEtoiles: 3, lumiereTrouNoir: 3, expansionUnivers: 3, cometeHalley: 3,
  trouDeVer: 3, pulsarHulseTaylor: 3, tourbillonsPonctuels: 2, trappist1: 2 });
/** un nuage (points tires, pas un chemin) : la science elle-meme, ou une COMPOSITION avec un IFS / Julia (comme les attracteurs) */
export const estNuage = (P, o) => !!(o && o.nuage) || !!(P && P.melange && P.melange.operateur === 'composition' && (P.melange.motif.famille === 'ifs' || P.melange.motif.famille === 'julia'));
/** game79 : le NOM de chaque corps (la bulle de survol dit « Earth », pas « body 3 ») ; null = « body k » */
export function nomsCorps(id, params = {}) {
  if (id === 'systemeSolaire') return Number(params.groupe) === 1 ? ['Jupiter', 'Saturn', 'Uranus', 'Neptune'] : ['Mercury', 'Venus', 'Earth', 'Mars'];
  if (id === 'cometeHalley') return ['Halley', 'Earth'];
  if (id === 'troisCorps') return ['Star 1', 'Star 2', 'Star 3'];
  if (id === 'lumiereTrouNoir') return ['Light ray 1', 'Light ray 2', 'Light ray 3', 'Light ray 4'];
  if (id === 'trouDeVer') return ['Light ray 1', 'Light ray 2'];
  return null;
}
/** le corps CENTRAL a l origine du repere de ces systemes (affiche, jamais stocke) */
export const CENTRE = Object.freeze({ systemeSolaire: 'Sun', cometeHalley: 'Sun', trappist1: 'TRAPPIST-1', amasEtoiles: 'black hole', lumiereTrouNoir: 'black hole', trouDeVer: 'throat' });
/** la vue « corps » : m = D/k corps, n/m echantillons chacun (dans l ordre du temps), concatenes ; centree et a l echelle COMMUNE ([-1, 1]) */
export function vueCorps(o, k) {
  const n = o.n, D = o.D, m = Math.max(1, Math.floor(D / k)), par = Math.max(1, Math.floor(n / m)), out = new Float64Array(n * 3);
  for (let p = 0; p < n; p++) {
    const b = Math.min(m - 1, Math.floor(p / par)), j = p - b * par, i = Math.min(n - 1, Math.floor(Math.min(j, par - 1) * n / par));
    out[3 * p] = o.brut[i * D + b * k]; out[3 * p + 1] = o.brut[i * D + b * k + 1]; out[3 * p + 2] = k === 3 ? o.brut[i * D + b * k + 2] : 0;
  }
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) { const v = out[3 * p + c]; if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
  const r = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2, s = r > 0 ? 1 / r : 0;
  for (let p = 0; p < n; p++) for (let c = 0; c < 3; c++) out[3 * p + c] = (out[3 * p + c] - (lo[c] + hi[c]) / 2) * s;
  /* l origine du repere (le Soleil, l etoile, le trou noir), dans la meme echelle — pour l affichage seulement */
  const origine = [0, 1, 2].map((c) => (0 - (lo[c] + hi[c]) / 2) * s);
  return { vue: out, corps: m, par, origine };
}
/** game77 (chasse aux bugs : Rabi 0.1 vs 5 -> distance 0.005, omega, lambda, hauteur -> 0.000) : la standardisation PAR AXE ramenait
 *   chaque axe a la meme taille et effacait ce que ces curseurs reglent. Une science garde ses PROPORTIONS : centree par axe, divisee
 *   par UN seul ecart-type (le plus grand des axes). Aucune science n est mintee (totalSupply = 0 le 01/11). */
/** game82 (audit des 83 systemes) : une colonne d une AUTRE grandeur (le temps, l echappement) ecrasait l echelle commune —
 *   supernova : temps 10 500 ans contre 5 pc -> une ligne [2, 0.003, 0.003] ; versMars, fusion, karman, Mandelbrot zoome idem.
 *   Ces colonnes (indices lus dans tam-legendes.js) ont leur PROPRE echelle et sortent du sMax ; les axes de meme grandeur
 *   gardent leurs proportions (le correctif game77 tient). */
export const ECHELLE_PROPRE = {
  supernova: [3], supernovaHydro: [3, 4], versMars: [2], fusionTrousNoirs: [0, 3], binaireFusion: [0, 3],
  mandelbrot: [2], karman: [2], evaporationTrouNoir: [0, 1, 2, 3],
  /* game88 (vu a l ecran : Higgs dessine en LIGNE, le temps ~260 et V ecrasaient phi ~1) : les principes du vide — seules les colonnes de
   *   MEME grandeur gardent l echelle commune (x et p ; Re phi et Im phi ; le desaccord seul) */
  higgsVide: [2, 3], videComprime: [2, 3], casimirDynamique: [2, 3], emissionSpontanee: [1, 2, 3],
  /* game89 (passe « rien oublie » sur les 87 systemes) : la densite de probabilite ecrasait position et temps [0.074 0.079 1] ; 1/alpha
   *   (~137) ecrasait log10 Q [0.052 1 0.008], et l indice de la force (0/1) est une etiquette, pas une longueur */
  tapisTalbot: [2], couplageCourant: [1, 2],
  /* game92 (audit des curseurs « muets » : effetTunnel V0 changeait la transmission de 98 % a 7 % sans changer le dessin — |psi|^2,
   *   ~0.05, ecrase par la position, ~150) : toute colonne d une AUTRE grandeur a son echelle. Gardees telles quelles, parce qu elles
   *   sont petites pour une raison PHYSIQUE : y de karman, z de Lagrange et du disque, y des lignes de champ, largeur constante du
   *   paquet coherent (son echelle propre gonflerait le bruit numerique a la taille du dessin) */
  effetTunnel: [2], wigner: [2], marcheQuantique: [2, 3], binaireTrouNoir: [3], disqueAccretion: [3], rotorPulse: [3],
  champLibre: [2], interactionChamps: [2, 3], tsunami: [2, 3], mouvementTerre: [3], tailleEtoiles: [3], oscillateurEtats: [1, 2],
  centreTerre: [0, 1, 2, 3],
  /* game93 : les colonnes « autres » declarees par tam-theories-2.js#COLONNES (temps, magnetisation, rang de frequence, N) */
  ising2D: [2, 3], lotkaVolterra: [2], epidemieSIR: [3], kuramoto: [2, 3], gibbsFourier: [0, 3],
  /* game96 : tam-theories-3.js#COLONNES (b et temps, r, x et temps, temps, temps, indice de bille) */
  rutherford: [2, 3], logistique: [0], chaleur: [1, 2], oscillateurForce: [2], brachistochrone: [2], galton: [2],
  /* game111 : tam-biologie.js#COLONNES (base et temps ; temps, ARN, proteine : trois grandeurs differentes) */
  adnMutations: [3, 4], dogmeCentral: [0, 2], /* game116 : dogme = (t, compte / moyenne, molecule) */
  /* game112 : generation, part, numero (3 grandeurs) ; complexe C (bien plus petit que S et P) */
  deriveGenetique: [0, 1, 2], enzyme: [0, 2], /* game116 : enzyme = (t, part, courbe) */
  /* game114 : numero de descendant ; temps, potentiel, courant (3 grandeurs) */
  mendel: [2], neurone: [0, 1, 2],
  /* game115 : numero de pas ; croise ou non ; numero de groupe ; le premier lui-meme */
  marcheAleatoire: [2], aiguilleBuffon: [2], anniversaires: [2], spiraleUlam: [2],
  /* game118 : vitesse (etiquette) ; copies, generation et numero (3 grandeurs) */
  gazParfait: [2], hardyWeinberg: [0, 1, 2],
  /* game120 : hauteur d entree (etiquette) ; position, deplacement, temps ; instant d emission (etiquette) */
  arcEnCiel: [2], cordeVibrante: [0, 1, 2], effetDoppler: [2],
  /* game122 : numero de ligne ; temps et courbe ; numero de ligne du triangle */
  lignesChamp: [2], circuitRC: [0, 2], pascalSierpinski: [2],
  /* game123 : numero du choc ; numero de masse et temps */
  billardPi: [2], modesNormaux: [0, 2],
  /* game124 : angle de tir (etiquette) ; solides : x, y, z de meme nature */
  paraboleTir: [2],
  /* game125 : volume, pression, branche (3 grandeurs) ; parties et strategie ; numero de rayon */
  carnot: [0, 1, 2], montyHall: [0, 2], lentilleMince: [2],
  /* game113 : tam-chimie.js#COLONNES (temps ; temps ; temps) */
  reactionsChaine: [0, 2], equilibreChimique: [2], brusselator: [2], /* game116 : chaine = (t, part, espece) */
};
/** les moyennes et le facteur de chaque colonne : z = (x - m) x k — la vue, les octets mintes et le decor en partent tous */
export function echelleIso(brut, n, D, id) {
  const m = new Float64Array(D), s = new Float64Array(D), k = new Float64Array(D), propre = new Set(ECHELLE_PROPRE[id] || []);
  let sMax = 0;
  for (let j = 0; j < D; j++) {
    let a = 0; for (let i = 0; i < n; i++) a += brut[i * D + j]; m[j] = a / n;
    let v = 0; for (let i = 0; i < n; i++) { const w = brut[i * D + j] - m[j]; v += w * w; }
    s[j] = Math.sqrt(v / n); if (!propre.has(j) && s[j] > sMax) sMax = s[j];
  }
  for (let j = 0; j < D; j++) { const d = propre.has(j) ? s[j] : sMax; k[j] = d > 0 ? 1 / d : 0; }
  return { m, k };
}
export function standardiserIso(brut, n, D, id) {
  const z = new Float64Array(n * D), { m, k } = echelleIso(brut, n, D, id);
  for (let i = 0; i < n; i++) for (let j = 0; j < D; j++) z[i * D + j] = (brut[i * D + j] - m[j]) * k[j];
  return z;
}
/* le tri Morton d un nuage : la MEME cle que tam-moteur.js#morton (10 bits de poids fort par axe) */
function morton(x, y, z, q) {
  let k = 0; const s = q - 10;
  for (let b = 9; b >= 0; b--) k = k * 8 + (((x >> s) >> b & 1) << 2 | ((y >> s) >> b & 1) << 1 | ((z >> s) >> b & 1));
  return k;
}
/** la simulation, puis la vue stockee (points quantifies, comme generer du moteur) */
export function genererScience(P) { return genererDepuis(P, null); }
/* oPre : la sortie de simuler deja calculee par la validation (memes P.science, P.params) ; null = simuler ici */
function genererDepuis(P, oPre) {
  const s = systeme(P.science); if (!s) return { bornee: false, raison: 'science inconnue' };
  const o = oPre || s.mod.simuler(P.science, P.params);
  if (!o.bornee || !o.brut) return { ...o, bornee: false };
  const n = o.n, D = o.D, M = (1 << P.q) - 1, ordre = estNuage(P, o) ? 1 : 0;
  let fin = CORPS[P.science] ? vueCorps(o, CORPS[P.science]).vue : projeterND(standardiserIso(o.brut, n, D, P.science), n, D, P.angles);
  /* game79 : une science MELANGEE a un motif (somme ou composition, comme les attracteurs) */
  if (P.melange) fin = melangerVue(fin, n, P.melange);
  let pts = new Int32Array(n * 3);
  for (let i = 0; i < 3 * n; i++) { const v = Math.round((fin[i] + 1) / 2 * M); pts[i] = v < 0 ? 0 : v > M ? M : v; }
  if (ordre === 1) {
    const idx = Array.from({ length: n }, (_, i) => i), cle = idx.map((i) => morton(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2], P.q));
    idx.sort((a, b) => cle[a] - cle[b] || a - b);
    const t = new Int32Array(n * 3); idx.forEach((src, d) => { t[3 * d] = pts[3 * src]; t[3 * d + 1] = pts[3 * src + 1]; t[3 * d + 2] = pts[3 * src + 2]; }); pts = t;
  }
  return { ...o, points: pts, q: P.q, ordre };
}
/** n importe qui, avec les params publics, recalcule les memes octets */
export function rejouerScience(P) {
  const { v, o: oV } = validerEtSimuler(P); if (!v.ok) return { ok: false, raisons: [v.raison] };
  return rejouerApres(P, oV);
}
/* la fin du rejeu, P DEJA valide et oV sa simulation : generer, encoder, hacher */
function rejouerApres(P, oV) {
  const o = genererDepuis(P, oV); if (!o.bornee) return { ok: false, raisons: ['the simulation left its valid domain'] };
  const octets = encoder({ q: o.q, ordre: o.ordre, points: o.points });
  return { ok: true, octets, hash: keccak256Hex(octets), oeuvre: o };
}
/* ---------- game79 : le CERVEAU choisit parmi TOUTES les sciences, et ecrit ce qu il a mesure ---------- */
/* un tirage deterministe a partir d une empreinte (mulberry32 sur 32 bits de keccak) : rejouable par n importe qui */
function tirage(empreinte) {
  let a = parseInt(String(empreinte).slice(2, 10), 16) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const entier = (r) => Number.isInteger(r.min) && Number.isInteger(r.max) && Number.isInteger(r.valeur) && /^(n|l|m|k|nombre|graine|tours|maxIter|puissance|periodes|groupe)$/.test(r.nom);
/** des params tires UNIFORMEMENT dans les bornes de chaque variable (entiers arrondis), puis bornes par le module (l <= n-1…) */
export function tirerParams(id, alea) {
  const s = systeme(id); if (!s) throw new Error('science inconnue: ' + id);
  const R = s.mod.reglagesPhysique(id, s.mod.simuler(id, {}).params), p = {};
  for (const r of R) { let v = r.min + alea() * (r.max - r.min); if (entier(r)) v = Math.round(v); p[r.chemin.replace(/^params\./, '')] = Math.round(v * 1e6) / 1e6; }
  return s.mod.simuler(id, p).params;
}
/**
 * Le choix du cerveau parmi les sciences : graine (bloc + tirage) et etat du cerveau -> une science, ses variables au hasard dans leurs
 * bornes, un melange une fois sur trois ; le premier essai qui passe les certificats. Deterministe : memes entrees, meme oeuvre.
 * @returns {{ ok, params, certificats, essai, rejets }}
 */
export function choisirScience({ graine, etatCerveau = null, existantes = [], minteur = null, essais = 8, ids = null } = {}) {
  if (!H32.test(String(graine || ''))) throw new Error('graine invalide');
  const liste = (ids && ids.length ? ids : SYSTEMES.map((s) => s.id)).filter((id) => systeme(id));
  const base = keccak256Hex(new TextEncoder().encode(String(graine) + '|' + canon(etatCerveau)));
  const rejets = [];
  for (let e = 0; e < essais; e++) {
    const alea = tirage(keccak256Hex(new TextEncoder().encode(base + ':' + e)));
    const id = liste[Math.floor(alea() * liste.length) % liste.length];
    let P;
    try { P = paramsScience(id, tirerParams(id, alea), { minteur }); } catch (_) { rejets.push({ essai: e, id, raison: 'module' }); continue; }
    /* revue game79 (high) : JAMAIS de melange sur un systeme a plusieurs corps (la page dessine les corps seuls : octets differents) */
    if (!CORPS[id] && alea() < 1 / 3) {
      const [f, v] = MOTIFS_MELANGE[Math.floor(alea() * MOTIFS_MELANGE.length) % MOTIFS_MELANGE.length];
      P.melange = { operateur: alea() < 0.5 ? 'somme' : 'composition', motif: motifDefaut(f, v), w: Math.round((BORNES.w[0] + alea() * (BORNES.w[1] - BORNES.w[0])) * 1e6) / 1e6 };
    }
    P.graine = String(graine).toLowerCase();
    const c = certifierScience(P, existantes);
    if (c.ok) return { ok: true, params: P, certificats: c, essai: e, rejets };
    if (c.etat === 'NON_LU') return { ok: false, etat: 'NON_LU', pourquoi: (c.raisons || []).join('; '), rejets };
    rejets.push({ essai: e, id, raison: (c.raisons || []).join('; ') });
  }
  return { ok: false, etat: 'AUCUNE', rejets };
}
/* un nombre court pour la note (sans exposant inutile) */
const court = (x) => (typeof x !== 'number' || !Number.isFinite(x) ? String(x) : x === 0 ? '0' : Math.abs(x) >= 1e-3 && Math.abs(x) < 1e6 ? String(Math.round(x * 1e4) / 1e4) : x.toExponential(2));
/**
 * Ce que le cerveau ECRIT : ce qu il a choisi, ce qu il a MESURE (invariants contre la theorie, lambda), et sa conclusion — des faits,
 * jamais une promesse. ASCII + quelques symboles, <= NOTE_MAX. Stocke on-chain dans les params QUAND quelqu un minte l oeuvre.
 */
export function noteCerveau(P, { nomCerveau = null, humeur = null, ressenti = null, battement = null } = {}) {
  const s = systeme(P.science); if (!s) return '';
  const o = s.mod.simuler(P.science, P.params), morceaux = [];
  morceaux.push((nomCerveau ? nomCerveau + "'s brain" : 'The brain') + (humeur ? ' (' + humeur + (ressenti ? ', ' + ressenti : '') + (battement !== null ? ', beat ' + battement : '') + ')' : '') + ' chose ' + s.nom + '.');
  const vars = Object.entries(P.params).slice(0, 6).map(([k, v]) => k + '=' + court(v)).join(' ');
  if (vars) morceaux.push('Variables: ' + vars + '.');
  /* (l operateur MATHEMATIQUE du melange, joint par un tableau — jamais concatene comme un nom de wallet, cf. test-no-fee-address-shown) */
  if (P.melange) morceaux.push('Blended with ' + [P.melange.motif.famille, P.melange.motif.variante].filter(Boolean).join(' ') + ' (' + [P.melange.operateur, 'w=' + court(P.melange.w)].join(', ') + ').');
  let conserve = 0, varie = 0, compare = null;
  for (const [k, v] of Object.entries(o.invariants || {})) {
    /* game114 (banc : la graine 20 tombait sur fluctuationsVide, dont la 1re mesure est un TABLEAU de 40 variances : la note le recopiait
     *   en entier, depassait 700 caracteres et perdait sa « Conclusion » — note ecrite on-chain) : seule une mesure et une reference
     *   NUMERIQUES finies sont citees */
    if (v && typeof v === 'object' && 'mesure' in v && ('formule' in v || 'theorie' in v)) { const ref = 'formule' in v ? v.formule : v.theorie;
      if (!compare && typeof v.mesure === 'number' && Number.isFinite(v.mesure) && typeof ref === 'number' && Number.isFinite(ref)) compare = k + ' measured ' + court(v.mesure) + ' vs ' + court(ref); }
    else if (v && typeof v === 'object' && 'derive' in v) { const ref = Math.abs(v.debut ?? 0), rel = ref > 1e-12 ? Math.abs(v.derive) / ref : Math.abs(v.derive); if (rel <= 1e-3) conserve++; else varie++; }
  }
  if (compare) morceaux.push('Check: ' + compare + '.');
  if (conserve || varie) morceaux.push(conserve + ' conserved quantit' + (conserve === 1 ? 'y' : 'ies') + ' held' + (varie ? ', ' + varie + ' varied' : '') + '.');
  const lam = typeof o.lyapunov === 'number' && Number.isFinite(o.lyapunov) ? o.lyapunov : null;
  morceaux.push(lam === null ? 'Conclusion: a ' + (estNuage(P, o) ? 'probability or sample cloud' : 'regular law') + ', no chaos measure applies.'
    : lam > 0.02 ? 'Conclusion: chaotic over this run (lambda ' + court(lam) + ' > 0.02): nearby starts split apart.'
      : 'Conclusion: regular over this run (lambda ' + court(lam) + ' <= 0.02): nearby starts stay together.');
  /* revue game79 : l ellipse d une adresse courte (« 0xb200…bbe3 ») devient « ... » AVANT le filtre ASCII — sinon les deux moitiees
   *   collees fabriquaient un faux identifiant hexadecimal (« 0xb200bbe3 ») ecrit on-chain */
  let t = morceaux.join(' ').replace(/…/g, '...').replace(/[^\x20-\x7e]/g, '');
  if (t.length > NOTE_MAX) t = t.slice(0, NOTE_MAX - 1) + '.';
  return t;
}
/** les certificats d une science : bornes, bornee, distincte de TOUTES les oeuvres mintees (une signature illisible -> NON_LU) */
export function certifierScience(P, existantes = []) {
  const { v, o: oV } = validerEtSimuler(P);
  if (!v.ok) return { ok: false, etat: 'REFUSE', codes: ['HORS_BORNES'], raisons: [v.raison] };
  const r = rejouerApres(P, oV);
  if (!r.ok) return { ok: false, etat: 'REFUSE', codes: ['DIVERGE'], raisons: r.raisons };
  const sig = signature(r.oeuvre.points, r.oeuvre.q);
  let dmin = 1, nonLues = 0;
  for (const e of existantes) {
    const s = e && (e.signature || e);
    if (!s || typeof s.length !== 'number' || s.length !== 512) { nonLues++; continue; }
    const d = distance(sig, s); if (!(d >= 0)) { nonLues++; continue; } if (d < dmin) dmin = d;
  }
  const codes = [], raisons = [];
  if (nonLues > 0) { codes.push('SIGNATURE_NON_LUE'); raisons.push('a minted work could not be read, so distinctness is not measured'); }
  else if (dmin < SEUIL_DISTINCT) { codes.push('DOUBLON'); raisons.push('too close to a minted work (distance ' + (Math.round(dmin * 100) / 100) + ', minimum ' + SEUIL_DISTINCT + ')'); }
  return { ok: codes.length === 0, etat: nonLues > 0 ? 'NON_LU' : codes.length ? 'REFUSE' : 'CERTIFIE', bornee: true, distanceMin: dmin, signaturesNonLues: nonLues,
    lyapunov: typeof r.oeuvre.lyapunov === 'number' ? r.oeuvre.lyapunov : NaN, uniteLyapunov: r.oeuvre.uniteLyapunov, codes, raisons, signature: sig, octets: r.octets, hash: r.hash };
}
