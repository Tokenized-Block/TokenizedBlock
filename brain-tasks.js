// brain-tasks.js — on-chain TASK catalog + 32-signal offer circuit schema (honesty).
// ================================================================================================
// ⛔ NOT AN LLM. Full 128 LIF brain stays OFFCHAIN (cerveau.js). Onchain path = tiny integer circuit
//    on 32 recorded signals → 0 refuse / 1 dinner served. Agents READ; user wallet SIGNS.
// ⛔ Fees → FEE_WALLET 0x37eb…580a when tools execute. Never invent mood/phase/advice.

import { keccak256Hex } from './keccak.js';

export const FEE_WALLET_TASKS = '0x37eb9b7ce0b51fe12fbf092026e001918128580a';
export const TASKS_SCHEMA = 'tblock-brain-tasks/1';
export const OFFER_RECEIPT_SCHEMA = 'tblock-offer-receipt/1';
export const CIRCUIT_VERSION = 'tblock-offer-circuit/1';
export const SIGNALS_COUNT = 32;
/** Dead address — same forever-lock idea as Launch LP (OL locker adapted to Base/TB). */
export const LOCK_FOREVER = '0x000000000000000000000000000000000000dEaD';

/** Catalog of allowed on-chain tasks — honesty for UI + /brain-agent.json. */
export const ONCHAIN_TASKS = Object.freeze([
  {
    id: 'export_snapshot',
    label: 'Export brain facts',
    does: 'Download / window.__TB_BRAIN_SNAPSHOT__ — facts only',
    signs: false,
    fee: 'none',
    fee_sink: null,
    gate: 'always',
  },
  {
    id: 'read_agent_catalog',
    label: 'Read agent catalog',
    does: 'GET /brain-agent.json',
    signs: false,
    fee: 'none',
    fee_sink: null,
    gate: 'always',
  },
  {
    id: 'decision_receipts',
    label: 'Decision receipts',
    does: 'Journal FAIT + offer 0/1 receipts — every decision leaves a trace',
    signs: false,
    fee: 'none',
    fee_sink: null,
    gate: 'after_beat',
  },
  {
    id: 'offer_food',
    label: 'Offer food (token)',
    does: 'One offering at a time → 32-signal circuit returns 0 refuse / 1 dinner served; accept may lock forever',
    signs: true,
    fee: 'gas (+ optional life dust → FEE_WALLET when contract live)',
    fee_sink: FEE_WALLET_TASKS,
    gate: 'offer_slot_free',
  },
  {
    id: 'trade_tblock',
    label: 'Trade TBLOCK / block',
    does: 'In-app Buy/Sell — user wallet signs',
    signs: true,
    fee: '0.5% interface',
    fee_sink: FEE_WALLET_TASKS,
    gate: 'market_alive',
  },
  {
    id: 'launch_wake',
    label: 'Launch / Wake',
    does: 'Life fee then open hooked market',
    signs: true,
    fee: '≈$1 ETH life',
    fee_sink: FEE_WALLET_TASKS,
    gate: 'sleep_or_unpaid',
  },
  {
    id: 'feed_trusted',
    label: 'Feed (trusted gesture)',
    does: 'GM / paid TBLOCK message — sensor food (parallel to offer circuit)',
    signs: true,
    fee: 'gas + 1000 TBLOCK if paid message',
    fee_sink: FEE_WALLET_TASKS,
    gate: 'awake_or_hungry',
  },
  {
    id: 'record_memory',
    label: 'Record memory on chain',
    does: 'Self-transfer 0 — beat / 4×32 fragments (memory shards, not smarter brain)',
    signs: true,
    fee: 'gas only (0 tokens moved)',
    fee_sink: null,
    gate: 'after_beat',
  },
]);

export function bandeNeurone(snap) {
  if (!snap || typeof snap !== 'object') return 'unknown';
  const phase = String(snap.phase || '');
  if (phase === 'MORT') return 'dead';
  if (phase === 'NON_LU' || phase === 'DORMANT') return 'cold';
  const marcheLue = snap.marche && (snap.marche.etatVie === 'LUE' || typeof snap.marche.vie === 'number');
  if (marcheLue && ['CALME', 'CURIEUX', 'EXCITE', 'INQUIET'].includes(phase)) return 'market';
  if (phase === 'EVEILLE' || (snap.nourriture && snap.nourriture.etat === 'LUE')) return 'awake';
  if (['CALME', 'CURIEUX', 'EXCITE', 'INQUIET'].includes(phase)) return 'market';
  return 'unknown';
}

export function tacheAutorisee(taskId, snap, opts = {}) {
  const t = ONCHAIN_TASKS.find((x) => x.id === taskId);
  if (!t) return { ok: false, pourquoi: 'unknown task' };
  const band = bandeNeurone(snap);
  const phase = snap && snap.phase ? String(snap.phase) : null;
  const hasBeat = snap && (snap.tick != null || (snap.journal && snap.journal.length));
  const slotBusy = opts.offerBusy === true;
  switch (t.gate) {
    case 'always':
      return { ok: true, band, phase };
    case 'after_beat':
      return hasBeat ? { ok: true, band, phase } : { ok: false, band, phase, pourquoi: 'needs ≥1 beat / journal line' };
    case 'market_alive':
      if (band === 'dead') return { ok: false, band, phase, pourquoi: 'dead — creator balance read 0' };
      if (band === 'market') return { ok: true, band, phase };
      return { ok: false, band, phase, pourquoi: 'needs market LUE + living phase' };
    case 'sleep_or_unpaid':
      if (band === 'cold' || phase === 'DORMANT' || phase === 'EVEILLE' || phase === 'NON_LU') {
        return { ok: true, band, phase };
      }
      return { ok: false, band, phase, pourquoi: 'Wake/Launch for sleep / unread / no-market' };
    case 'awake_or_hungry':
      if (band === 'dead') return { ok: false, band, phase, pourquoi: 'dead' };
      if (band === 'cold' && phase === 'NON_LU') {
        return { ok: false, band, phase, pourquoi: 'market unread — feed after food/market read' };
      }
      return { ok: true, band, phase };
    case 'offer_slot_free':
      if (band === 'dead') return { ok: false, band, phase, pourquoi: 'dead' };
      if (slotBusy) return { ok: false, band, phase, pourquoi: 'one offering at a time — slot busy' };
      if (!hasBeat) return { ok: false, band, phase, pourquoi: 'needs ≥1 beat so signals are recorded' };
      return { ok: true, band, phase };
    default:
      return { ok: false, band, phase, pourquoi: 'unknown gate' };
  }
}

/**
 * Pack 32 uint8 signals from an existing brain snapshot (recorded facts only).
 * Mirrors future onchain packing — browser stub for honesty / evidence hash.
 */
export function signaux32DepuisSnapshot(snap) {
  const s = new Array(SIGNALS_COUNT).fill(0);
  if (!snap || typeof snap !== 'object') return s;
  const phase = String(snap.phase || '');
  const n = snap.nourriture || {};
  const m = snap.marche || {};
  const hz = snap.hz || {};
  const sp = snap.spikes || {};

  s[0] = m.etatVie === 'LUE' || typeof m.vie === 'number' ? 1 : 0;
  s[1] = typeof m.vie === 'number' && m.vie > 0 ? 1 : 0;
  s[2] = m.hooked === true ? 1 : 0;
  s[3] = m.liqOrdre === 'deep' || m.liqOrdre === 'ok' ? 2 : m.liqOrdre === 'thin' ? 1 : 0;
  s[4] = phase === 'NON_LU' ? 1 : 0;
  s[5] = phase === 'MORT' ? 1 : 0;
  s[6] = phase === 'DORMANT' ? 1 : 0;
  s[7] = n.mort === false ? 1 : n.mort === true ? 0 : 0;

  s[8] = Math.min(255, Number(n.gm) || 0);
  s[9] = Math.min(255, Number(n.messages) || 0);
  s[10] = Math.min(255, Number(n.detenteurs) || 0);
  s[11] = n.etat === 'LUE' ? 1 : 0;
  s[12] = ['CALME', 'CURIEUX', 'EXCITE', 'INQUIET', 'EVEILLE'].includes(phase) ? 1 : 0;
  s[13] = phase === 'EXCITE' ? 2 : phase === 'INQUIET' ? 1 : 0;
  s[14] = Math.min(255, Math.abs(Math.round((Number(hz.virage) || 0) * 100)));
  s[15] = Math.min(255, Number(sp.ce_battement) || Number(sp.actifs) || 0);

  s[16] = m.isTbFeeHook === true ? 1 : 0;
  s[17] = snap.role ? 1 : 0;
  s[18] = typeof snap.memoire === 'number' ? Math.min(255, Math.round(snap.memoire * 100)) : 0;
  s[19] = Number(snap.tick) >= 100000 ? 2 : Number(snap.tick) >= 1000 ? 1 : 0;
  s[20] = Array.isArray(snap.journal) && snap.journal.length ? 1 : 0;
  s[21] = 0; // last offer outcome — filled by caller if known
  s[22] = 0; // lock depth — filled when locker live
  s[23] = 0; // reserved FEE inbound bit

  s[24] = 1; // schema/version marker band
  s[25] = 0; // offer slot busy — set by caller
  s[26] = 0;
  s[27] = 0;
  s[28] = 0;
  s[29] = 0;
  s[30] = 0;
  s[31] = CIRCUIT_VERSION.length & 0xff;
  return s;
}

/**
 * Integer circuit stub (same spirit as future Solidity): weighted sum → 0|1.
 * ⛔ NOT the 128 LIF brain. ⛔ NOT an LLM. Pure integer thresholds on recorded signals.
 */
export function decideOffre(signals32) {
  const s = Array.isArray(signals32) ? signals32 : signaux32DepuisSnapshot(null);
  while (s.length < SIGNALS_COUNT) s.push(0);
  // Refuse hard stops
  if (s[5] === 1) return { decision: 0, pourquoi: 'MORT signal' };
  if (s[4] === 1 && s[0] === 0) return { decision: 0, pourquoi: 'market unread + no life read' };
  if (s[25] === 1) return { decision: 0, pourquoi: 'offer slot busy' };
  // Integer score (toy weights — engraved constants later)
  let score = 0;
  score += s[0] * 3;
  score += s[1] * 2;
  score += s[2] * 2;
  score += s[11] * 2;
  score += s[12] * 2;
  score += Math.min(3, s[8] > 0 ? 1 : 0);
  score += Math.min(2, s[9] > 0 ? 1 : 0);
  score += s[16];
  score -= s[6] * 2;
  score -= s[13] === 1 ? 1 : 0; // worried slightly harder
  const decision = score >= 5 ? 1 : 0;
  return {
    decision,
    score,
    threshold: 5,
    pourquoi: decision === 1 ? 'dinner is served (score≥5)' : 'refused (score<5)',
    circuit_version: CIRCUIT_VERSION,
  };
}

/** Canonical evidence object for hashing (browser stub — keccak later via keccak.js). */
export function evidenceCanonique({ block, offerToken, offerAmount, signals32, snap }) {
  return {
    schema: 'tblock-offer-evidence/1',
    block: block ? String(block).toLowerCase() : null,
    offer_token: offerToken ? String(offerToken).toLowerCase() : null,
    offer_amount: offerAmount != null ? String(offerAmount) : null,
    signals32: (signals32 || []).slice(0, SIGNALS_COUNT),
    phase: snap && snap.phase ? snap.phase : null,
    tick: snap && snap.tick != null ? snap.tick : null,
    marche: snap && snap.marche ? {
      etatVie: snap.marche.etatVie || null,
      hooked: snap.marche.hooked ?? null,
      vie: snap.marche.vie ?? null,
    } : null,
    nourriture_etat: snap && snap.nourriture ? snap.nourriture.etat : null,
  };
}

export function construireRecuOffre({
  block = null,
  offerToken = null,
  offerAmount = null,
  snap = null,
  offerBusy = false,
  evidenceHash = null,
  tx = null,
} = {}) {
  const signals = signaux32DepuisSnapshot(snap);
  if (offerBusy) signals[25] = 1;
  const verdict = decideOffre(signals);
  const evidence = evidenceCanonique({
    block, offerToken, offerAmount, signals32: signals, snap,
  });
  return {
    schema: OFFER_RECEIPT_SCHEMA,
    honesty: 'Full brain OFFCHAIN (128 LIF). Decision circuit = 32 signals → integer 0|1. Not an LLM.',
    block: block ? String(block).toLowerCase() : null,
    offer_token: offerToken ? String(offerToken).toLowerCase() : null,
    offer_amount: offerAmount != null ? String(offerAmount) : null,
    signals32: signals,
    decision: verdict.decision,
    decision_label: verdict.decision === 1 ? 'dinner_served' : 'refused',
    score: verdict.score,
    threshold: verdict.threshold,
    pourquoi: verdict.pourquoi,
    evidence,
    evidence_hash: evidenceHash || keccak256Hex(new TextEncoder().encode(JSON.stringify(evidence))),
    circuit_version: CIRCUIT_VERSION,
    tx,
    fee_sink: FEE_WALLET_TASKS,
    lock: verdict.decision === 1
      ? { forever: true, to: LOCK_FOREVER, status: tx ? 'locked' : 'pending_contract', note: 'OL-style forever lock adapted to Base — contract not deployed in this P0' }
      : null,
    one_offering_at_a_time: true,
  };
}

export function recusDecision(journal, lim = 8) {
  const j = Array.isArray(journal) ? journal : [];
  return j
    .filter((e) => e && (e.genre === 'FAIT' || e.genre === 'AMELIORER'))
    .slice(-lim)
    .reverse()
    .map((e) => ({
      tick: Number(e.tick) || 0,
      genre: e.genre || null,
      texte: String(e.texte || ''),
      parce_que: String(e.parce_que || ''),
      honesty: 'journal fact — not LLM',
    }));
}

export function resumeTaches(snap, opts = {}) {
  const band = bandeNeurone(snap);
  const allowed = ONCHAIN_TASKS.map((t) => {
    const g = tacheAutorisee(t.id, snap, opts);
    return {
      id: t.id,
      label: t.label,
      allowed: g.ok === true,
      gate: t.gate,
      fee: t.fee,
      fee_sink: t.fee_sink,
      signs: t.signs,
      pourquoi: g.pourquoi || null,
    };
  });
  const demo = construireRecuOffre({
    block: snap && snap.address,
    offerToken: null,
    offerAmount: null,
    snap,
    offerBusy: opts.offerBusy === true,
  });
  return {
    schema: TASKS_SCHEMA,
    honesty: '128 LIF offchain decision core · onchain = 32-signal 0/1 circuit. Fees → FEE_WALLET when tools execute.',
    fee_wallet: FEE_WALLET_TASKS,
    neuron_mass_band: band,
    neurones_offchain: 128,
    signals_onchain: SIGNALS_COUNT,
    circuit_version: CIRCUIT_VERSION,
    scale_note: 'Keep 128 LIF offchain. Onchain stays tiny (32 signals). Never overnight 166k, never LLM-as-brain.',
    tasks: allowed,
    receipts: recusDecision(snap && snap.journal, 8),
    offer_preview: demo,
  };
}
