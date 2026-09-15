// export-cerveau.js — facts the fly brain already computed, frozen for agents (Zero 1 / tools).
// ================================================================================================
// ⛔ NOT AN LLM SNAPSHOT. Every field is copied from cerveau.js / journal / rules / sensors already
//    painted in the UI. Nothing is invented, scored, or "interpreted" here.
// ⛔ Mood/phase stay owned by the fly brain. Agents READ; they do not decide.
// ⛔ Browser-local: the Railway server has no neuron state. Agents use window.__TB_BRAIN_SNAPSHOT__
//    or the downloaded JSON. See /brain-agent.json for the curlable how-to.

import { VERSION_CERVEAU, PARAMETRES, nomHumeur, phraseDePhase } from './cerveau.js';

export const EXPORT_SCHEMA = 'tblock-brain-snapshot/1';

/**
 * Build a machine-readable dump of what Brain AI already shows.
 * @param {object} o
 * @returns {object} JSON-safe facts only
 */
export function snapshotCerveau({
  address = null,
  symbole = null,
  role = null,
  vu = null,
  etat = null,
  spikesDepuisOuverture = 0,
  journal = [],
  reglesLignes = [],
  compteurs = {},
  nourriture = null,
  vie = null,
  etatVie = null,
  build = null,
  at = null,
} = {}) {
  const phase = vu && typeof vu.phase === 'string' ? vu.phase : null;
  const n = nourriture && nourriture.etat === 'LUE' ? {
    etat: 'LUE',
    gm: Number(nourriture.gm) || 0,
    messages: Number(nourriture.messages) || 0,
    detenteurs: Number(nourriture.detenteurs) || 0,
    mort: nourriture.mort === true ? true : nourriture.mort === false ? false : null,
    pourquoiMort: nourriture.pourquoiMort || null,
  } : nourriture ? {
    etat: String(nourriture.etat || 'NON_LUE'),
    pourquoi: nourriture.pourquoi || null,
  } : { etat: 'NON_LUE', pourquoi: 'not read yet' };

  const lignes = Array.isArray(journal) ? journal.map((e) => ({
    tick: Number(e.tick) || 0,
    genre: e.genre || null,
    texte: String(e.texte || ''),
    parce_que: String(e.parce_que || ''),
  })) : [];

  return {
    schema: EXPORT_SCHEMA,
    honesty: 'Facts only from the deterministic fly brain + chain reads. Not an LLM. Never signs. Agents must not invent mood.',
    version_cerveau: VERSION_CERVEAU,
    parametres: { ...PARAMETRES },
    build: build || null,
    at: at || new Date().toISOString(),
    address: address ? String(address).toLowerCase() : null,
    symbole: symbole || null,
    role: role || null,
    phase,
    humeur: phase ? nomHumeur(phase) : null,
    phrase: phase ? phraseDePhase(phase, symbole || 'this block') : null,
    tick: vu && Number.isFinite(vu.tick) ? vu.tick : (etat && Number.isFinite(etat.tick) ? etat.tick : null),
    hz: vu ? {
      gauche: Number(vu.gauche_hz),
      droite: Number(vu.droite_hz),
      virage: Number(vu.virage),
      vitesse: Number(vu.vitesse),
    } : null,
    spikes: vu ? {
      ce_battement: Number(vu.spikes) || 0,
      actifs: Number(vu.actifs) || 0,
      neurones: PARAMETRES.neurones,
      depuis_ouverture: Number(spikesDepuisOuverture) || 0,
      indices: Array.isArray(vu.indices) ? vu.indices.slice() : [],
    } : null,
    memoire: vu && typeof vu.memoire === 'number' ? vu.memoire : null,
    entree: vu && vu.entree ? String(vu.entree) : null,
    marche: {
      vie: typeof vie === 'number' && Number.isFinite(vie) ? vie : null,
      etatVie: etatVie || null,
    },
    nourriture: n,
    journal: lignes,
    regles: {
      lignes: Array.isArray(reglesLignes) ? reglesLignes.slice() : [],
      compteurs: compteurs && typeof compteurs === 'object' ? { ...compteurs } : {},
    },
    ensemble_note: ensembleNote(vu, phase),
  };
}

/** Short agent-facing note from Hz / steering / tick — still facts, not invented mood. */
export function ensembleNote(vu, phase) {
  if (!vu || !phase) return null;
  const g = Number(vu.gauche_hz), d = Number(vu.droite_hz), v = Number(vu.virage);
  const sym = Number.isFinite(g) && Number.isFinite(d) && Math.abs(g - d) < 0.5;
  const calmeSteer = Number.isFinite(v) && Math.abs(v) < 0.05;
  const parts = [];
  if (phase === 'CALME' && sym && calmeSteer) {
    parts.push('symmetric Hz + near-0 steering = balanced calm ensemble');
  } else if (sym && calmeSteer) {
    parts.push('symmetric Hz + near-0 steering (balanced wings)');
  }
  if (Number.isFinite(vu.tick) && vu.tick >= 100000) {
    parts.push('long tick run = continuity product (browser-local resume)');
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Pretty JSON for download / dump. */
export function texteSnapshot(snap) {
  return JSON.stringify(snap, null, 2);
}
