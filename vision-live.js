/* vision-live.js — « LIVE » : plusieurs vues a la premiere personne, en direct, cote a cote (proprietaire, 2026-10-26 : « un bouton Live
 *   plus simple, un second panneau a gauche, la vue Inside en direct ; une recherche pour ajouter d autres blocks ; plusieurs vues a la
 *   fois pour suivre tout un trajet »).
 *
 * ⛔⛔ RIEN N EST INVENTE ICI, ET RIEN N EST CALCULE DEUX FOIS : une tuile ne garde QUE les battements que la page a deja executes
 *     (`vu` de cerveau.js#pas, et l objet EXACT de faits qui l a produit). Le cadre d une tuile est `vision-cerveau.js#cadreInterieur` —
 *     le meme renderer que le dialogue « Inside its brain », pas une copie.
 * ⛔⛔ LES TUILES SONT INDEPENDANTES PAR CONSTRUCTION :
 *     · une tuile ne lit que la source de SA propre adresse (`nourrirLive` passe `t.adr` a `sourceDe`, jamais une autre) ;
 *     · un battement n est pris que s il porte le CABLAGE de cette adresse (`vu.cablage` = connectome(adresse).empreinte) — le
 *       battement d un autre block, meme mal aiguille par l appelant, est refuse ;
 *     · une tuile s attache a UN cerveau (la map, Brain ou le profil — trois instances distinctes) et n en melange jamais deux.
 * ⛔ L HUMEUR D UNE TUILE = la phase de SON dernier battement pris ; sans battement, « no beat yet ». Jamais une humeur par defaut.
 * ⛔ PUR : aucun reseau, aucune horloge, aucun hasard, aucun stockage, aucun DOM. La taille gardee par visiteur est lue / ecrite par
 *    l appelant (localStorage sous try/catch) ; ce module ne fait que la BORNER. */
import { connectome } from './cerveau.js';
import { champ, cadreInterieur, humeurCourte, nextBeat, beatSentence, paletteOf } from './vision-cerveau.js';

export const VERSION_LIVE = 'tblock-brain-live/1';
/* 4 vues sur grand ecran, 2 sur telephone : au-dela, chaque vue devient trop petite pour qu un neurone allume se distingue */
export const MAX_LARGE = 4;
export const MAX_ETROIT = 2;
/* les 24 derniers battements de chaque tuile (14,4 s a 600 ms) : assez pour le sol qui tourne, pas une memoire sans fin */
export const HISTO_TUILE = 24;
export const SOURCES = Object.freeze({
  carte: 'its brain on the map (beats every 600 ms)',
  brain: 'its Brain tab (beats while the Brain tab or the control panel is open)',
  profil: 'its block profile (beats while the profile is open)',
  /* game57 #5 : la seule instance de son adresse sur la page (page-brains.js), qui que ce soit qui la fasse battre */
  page: 'its one brain on this page (shared by the map, its profile, Brain and Live)',
});
const ADR = /^0x[0-9a-fA-F]{40}$/;
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
const cablageDe = (adr) => connectome(String(adr).toLowerCase()).empreinte;

export const maxTuiles = (etroit) => (etroit ? MAX_ETROIT : MAX_LARGE);
export function creerLive() { return { version: VERSION_LIVE, tuiles: [] }; }

/** Ajoute une tuile pour `adr`. ⛔ Une adresse illisible, un doublon ou une tuile de trop sont REFUSES, avec la phrase. */
export function ajouterTuile(live, { adr, sym = null } = {}, { etroit = false } = {}) {
  if (!live || !Array.isArray(live.tuiles)) return { ok: false, pourquoi: 'No live panel.' };
  if (!ADR.test(String(adr || ''))) return { ok: false, pourquoi: 'Not a block address.' };
  const a = String(adr).toLowerCase();
  const deja = live.tuiles.find((t) => t.adr === a);
  if (deja) return { ok: false, pourquoi: (deja.sym || 'This block') + ' is already live here.', tuile: deja };
  const max = maxTuiles(etroit);
  if (live.tuiles.length >= max) return { ok: false, pourquoi: 'Up to ' + max + ' live views at once on this screen — remove one first.' };
  const tuile = { adr: a, sym: sym ? String(sym).slice(0, 24) : null, cablage: cablageDe(a), source: null, histo: [], faits: null,
    nourritureLue: null, h: null, refus: 0, vueTick: null };
  live.tuiles.push(tuile);
  return { ok: true, tuile };
}
export function retirerTuile(live, adr) {
  if (!live || !Array.isArray(live.tuiles)) return false;
  const a = String(adr || '').toLowerCase();
  const i = live.tuiles.findIndex((t) => t.adr === a);
  if (i < 0) return false;
  live.tuiles.splice(i, 1);
  return true;
}

/**
 * Donne a UNE tuile le battement que la page vient d executer pour son adresse.
 * @param {object} t      la tuile
 * @param {object|null} b { source: 'carte'|'brain'|'profil', vu, faits, nourritureLue, h } — ou null : rien ne bat pour elle
 * @returns {{ pris: boolean, pourquoi: string }}
 */
export function nourrirTuile(t, b) {
  if (!t) return { pris: false, pourquoi: 'no tile' };
  if (!b || !b.vu || typeof b.vu !== 'object') return { pris: false, pourquoi: 'nothing beats for it' };
  if (!SOURCES[b.source]) return { pris: false, pourquoi: 'unknown source' };
  /* ⛔⛔ LE CABLAGE PROUVE L ADRESSE : le battement d un autre block ne peint jamais cette tuile */
  if (b.vu.cablage !== t.cablage) { t.refus++; return { pris: false, pourquoi: 'beat of another brain' }; }
  if (!Number.isInteger(b.vu.tick)) return { pris: false, pourquoi: 'beat without a tick' };
  /* ⛔ un cerveau a la fois : la map, Brain et le profil sont trois instances, avec chacune sa memoire */
  if (t.source && t.source !== b.source) return { pris: false, pourquoi: 'another instance of its brain' };
  const dernier = t.histo.length ? t.histo[t.histo.length - 1] : null;
  if (dernier && b.vu.tick === dernier.tick) return { pris: false, pourquoi: 'same beat' };
  /* un tick qui recule = le cerveau a ete recree (la map repose ses blocks) : on ne recoud pas deux vies, on repart */
  if (dernier && b.vu.tick < dernier.tick) t.histo = [];
  t.source = b.source;
  t.histo.push(b.vu);
  if (t.histo.length > HISTO_TUILE) t.histo.splice(0, t.histo.length - HISTO_TUILE);
  t.faits = b.faits && typeof b.faits === 'object' ? b.faits : null;
  t.nourritureLue = b.nourritureLue === true ? true : b.nourritureLue === false ? false : null;
  t.h = b.h || null;
  return { pris: true, pourquoi: 'beat ' + b.vu.tick };
}
/** Chaque tuile lit SA source, par SA propre adresse. Rend les adresses des tuiles qui ont pris un battement. */
export function nourrirLive(live, sourceDe) {
  const pris = [];
  if (!live || !Array.isArray(live.tuiles) || typeof sourceDe !== 'function') return pris;
  for (const t of live.tuiles) {
    let b = null;
    try { b = sourceDe(t.adr, t.source); } catch (_) { b = null; }
    if (nourrirTuile(t, b).pris) pris.push(t.adr);
  }
  return pris;
}

/* 2026-10-26 (« feel ») : une tuile REJOUE ses battements a rythme humain. `t.vueTick` = le battement MONTRE (null = le dernier pris).
 * ⛔ L etiquette, le cadre et la phrase parlent du MEME battement : celui-la. */
const indiceMontre = (t) => {
  if (!t || !t.histo.length) return -1;
  if (Number.isSafeInteger(t.vueTick)) { const i = t.histo.findIndex((v) => v.tick === t.vueTick); if (i >= 0) return i; }
  return t.histo.length - 1;
};
/** Avance la tuile au battement suivant a montrer (vision-cerveau.js#nextBeat). Rend ce qui a ete saute ou perdu. */
export function advanceTile(t, o = {}) {
  if (!t) return null;
  const r = nextBeat(t.histo, Number.isSafeInteger(t.vueTick) ? t.vueTick : null, o);
  t.vueTick = r.tick;
  return r;
}
/** L etiquette d une tuile : son symbole et l humeur du battement MONTRE (le dernier pris tant qu aucun n est rejoue), rien d autre. */
export function etiquetteTuile(t) {
  if (!t) return null;
  const i = indiceMontre(t);
  const vu = i >= 0 ? t.histo[i] : null;
  const dernier = t.histo.length ? t.histo[t.histo.length - 1] : null;
  return { adr: t.adr, sym: t.sym, phase: vu ? vu.phase : null, humeur: vu ? humeurCourte(vu.phase) : 'no beat yet',
    tick: vu ? vu.tick : null, spikes: vu ? vu.spikes : null, source: t.source, sourceTexte: t.source ? SOURCES[t.source] : null,
    dernierTick: dernier ? dernier.tick : null, retard: vu ? t.histo.length - 1 - i : null, palette: paletteOf(vu ? vu.phase : null).cle,
    phrase: beatSentence(vu) };
}

/**
 * Le cadre « inside » du dernier battement de la tuile : champ() puis cadreInterieur(), les memes fonctions que le dialogue.
 * @param {object} t
 * @param {object} [o] { voisins, marche, echange, capMap, reduit } — ce que la page tient deja (la map, l index, le fil Live)
 */
export function cadreTuile(t, { voisins = [], marche = null, echange = null, capMap = null, reduit = false } = {}) {
  if (!t || !ADR.test(t.adr)) return null;
  const i = indiceMontre(t);
  const vu = i >= 0 ? t.histo[i] : null;
  const c = champ({ adr: t.adr, faits: t.faits, vu, voisins, marche, echange, nourritureLue: t.nourritureLue });
  if (!c) return null;
  const k = cadreInterieur({ c, faits: t.faits, histo: t.histo, i, capMap: fini(capMap) ? capMap : null, reduit: !!reduit });
  return { c, k };
}

/* ══ LA TAILLE, PAR VISITEUR ══════════════════════════════════════════════════════════════════════════════════════════════
 * Grand ecran : une colonne a GAUCHE, sa largeur 280 .. 900 px en laissant 320 px a la map. Telephone : une feuille en bas, sa
 * hauteur 120 px (l en-tete et une ligne) .. la hauteur utile moins 56 px. ⛔ Une valeur illisible rend null : la taille d origine. */
export const CLE_TAILLE_LIVE = 'tblock.live.taille.v1';
export function bornerTailleLive(axe, v, ecranL, ecranH, nav = 66) {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || typeof v === 'boolean' || !Number.isFinite(n)) return null;
  const L = Number(ecranL), H = Number(ecranH), N = Number.isFinite(Number(nav)) ? Number(nav) : 66;
  if (!Number.isFinite(L) || !Number.isFinite(H)) return null;
  const min = axe === 'h' ? 120 : 280;
  const max = axe === 'h' ? Math.max(min, H - N - 56) : Math.max(min, Math.min(900, L - 320));
  return Math.round(Math.min(max, Math.max(min, n)));
}
/** Le texte garde (localStorage) -> { w?, h? } bornes ; tout ce qui est illisible est ignore. */
export function lireTailleLive(texte, ecranL, ecranH, nav = 66) {
  let o = null;
  try { o = JSON.parse(String(texte ?? 'null')); } catch (_) { o = null; }
  const r = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return r;
  for (const axe of ['w', 'h']) {
    const b = bornerTailleLive(axe, o[axe], ecranL, ecranH, nav);
    if (b !== null) r[axe] = b;
  }
  return r;
}
