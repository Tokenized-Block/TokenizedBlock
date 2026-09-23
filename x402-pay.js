// x402-pay.js — micropay recognition stub (tip 20260923-bridge-x402-brain).
// ================================================================================================
// PRODUCT (Raksha / Zero 1 · P2 after C2 dig DIG-BRIDGE-X402-BRAIN-2026-09-23):
//   · Option A only: Brain PROPOSES → user / capped session PAYS → Brain WRITES journal.
//   · Recognition helper in prepaye spirit ("fee already recognized" for a bot session).
//   · Settlement asset = ETH or USDC only (never TBGAS). Destination = on-chain sink — NEVER
//     returned in UI-facing strings from this module.
//   · Does NOT replace Instant Birth / CreateRouter 0.001 ETH, Buy/Sell 0.5%, or Bridge 0.01% skim.
//   · Must NOT double-charge with Bridge skim (assertNoDoubleChargeWithBridge).
//   · NOT a full HTTP 402 x402 protocol server — stub module + event log for P2.
//   · Option B (bot allowance auto-pay) = NOT now.
//
// Fee matrix (code comments = dig §2 — keep in sync when editing):
//   Brain/bot data-tool micropay  → x402 YES (primary)
//   Bridge 0.01% skim             → wallet today; x402 hybrid later (never both)
//   Buy/Sell 0.5%                 → on-chain ONLY
//   Instant Birth 0.001 ETH       → on-chain ONLY (CreateRouter)
//   Phil BridgeRouter 1 bps       → on-chain ONLY (no x402 substitute)

export const X402_SCHEMA = 'tblock-x402-recog/1';
export const X402_TIP = '20260923-bridge-x402-brain';
export const X402_SETTLEMENT = Object.freeze(['ETH', 'USDC']);

/** Dig §2 — which TB fee rails may use x402 recognition in P2. */
export const X402_FEE_MATRIX = Object.freeze({
  brain_data_tool: { x402: true, why: 'primary micropay for agent data/tool loop' },
  bridge_skim_001: { x402: 'hybrid_later', why: 'today = wallet skim; never double with x402' },
  buy_sell_05: { x402: false, why: 'hooked / interface on-chain only' },
  instant_birth_0001: { x402: false, why: 'CreateRouter same-sig lock — never substitute' },
  bridge_router_1bps: { x402: false, why: 'atomicity is on-chain; x402 is not a BridgeRouter' },
  prepaye_spirit: { x402: true, why: 'receipt can mark bot session fee recognized — not a birth fee' },
});

const CLE_EVENTS = 'tb.x402.events';
const CLE_RECOG = 'tb.x402.recog';
const ADRESSE = /^0x[0-9a-fA-F]{40}$/;

function lireEvents() {
  try {
    const a = JSON.parse(localStorage.getItem(CLE_EVENTS) || '[]');
    return Array.isArray(a) ? a : [];
  } catch (_) { return []; }
}

function ecrireEvents(list) {
  try { localStorage.setItem(CLE_EVENTS, JSON.stringify(list.slice(-40))); } catch (_) {}
}

/**
 * @param {string} rail — key of X402_FEE_MATRIX
 * @returns {{ok:boolean, x402:boolean|string, pourquoi:string}}
 */
export function mayUseX402(rail) {
  const row = X402_FEE_MATRIX[rail];
  if (!row) return { ok: false, x402: false, pourquoi: 'unknown fee rail' };
  if (row.x402 === true) return { ok: true, x402: true, pourquoi: row.why };
  if (row.x402 === 'hybrid_later') {
    return { ok: false, x402: 'hybrid_later', pourquoi: row.why + ' — use wallet Bridge skim today' };
  }
  return { ok: false, x402: false, pourquoi: row.why };
}

/**
 * Fail-closed: Bridge skim + x402 recognition must never both apply to the same volume.
 * @param {{x402Used?:boolean, bridgeSkimUsed?:boolean}} p
 */
export function assertNoDoubleChargeWithBridge(p) {
  if (p && p.x402Used && p.bridgeSkimUsed) {
    return { ok: false, pourquoi: 'Refuse — Bridge 0.01% skim and x402 must not both charge the same volume' };
  }
  return { ok: true };
}

/**
 * Propose a bot/Brain action that may later need a micropay (Option A — no auto-sign).
 * @param {{action:string, rail?:string, asset?:string, amountHuman?:string|number, note?:string}} p
 */
export function recordPropose(p) {
  const action = String((p && p.action) || '').trim();
  if (!action) return { ok: false, pourquoi: 'Propose needs an action label' };
  const rail = String((p && p.rail) || 'brain_data_tool').trim();
  const gate = mayUseX402(rail);
  const asset = String((p && p.asset) || 'ETH').trim().toUpperCase() || 'ETH';
  if (gate.ok && !X402_SETTLEMENT.includes(asset)) {
    return { ok: false, pourquoi: 'x402 settlement is ETH or USDC only' };
  }
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ev = {
    schema: X402_SCHEMA,
    kind: 'propose',
    id,
    at: Date.now(),
    action,
    rail,
    asset,
    amountHuman: p && p.amountHuman != null ? String(p.amountHuman) : null,
    note: String((p && p.note) || '').slice(0, 200),
    x402Allowed: gate.ok === true,
    tip: X402_TIP,
    /* Option A mark — Brain never freestyle-signs */
    signeParUtilisateur: true,
    brainSigns: false,
  };
  const list = lireEvents();
  list.push(ev);
  ecrireEvents(list);
  return { ok: true, event: ev, gate };
}

/**
 * Record that the user / capped session paid (or recognition of an on-chain ETH/USDC settle).
 * Does not send txs — caller signs via existing wallet rails when live.
 * @param {{proposeId:string, asset?:string, amountHuman?:string|number, txHash?:string, bridgeSkimUsed?:boolean}} p
 */
export function recordPay(p) {
  const proposeId = String((p && p.proposeId) || '').trim();
  if (!proposeId) return { ok: false, pourquoi: 'Pay needs proposeId' };
  const events = lireEvents();
  const prop = events.filter((e) => e.kind === 'propose' && e.id === proposeId).pop();
  if (!prop) return { ok: false, pourquoi: 'No matching propose — pay refused' };
  const dub = assertNoDoubleChargeWithBridge({
    x402Used: true,
    bridgeSkimUsed: !!(p && p.bridgeSkimUsed),
  });
  if (!dub.ok) return dub;
  const asset = String((p && p.asset) || prop.asset || 'ETH').trim().toUpperCase();
  if (!X402_SETTLEMENT.includes(asset)) {
    return { ok: false, pourquoi: 'Pay settlement is ETH or USDC only' };
  }
  const txHash = String((p && p.txHash) || '').trim();
  if (txHash && !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, pourquoi: 'txHash looks invalid — nothing recognized' };
  }
  const ev = {
    schema: X402_SCHEMA,
    kind: 'pay',
    id: 'pay' + Date.now().toString(36),
    proposeId,
    at: Date.now(),
    asset,
    amountHuman: p && p.amountHuman != null ? String(p.amountHuman) : prop.amountHuman,
    txHash: txHash || null,
    tip: X402_TIP,
    signeParUtilisateur: true,
    brainSigns: false,
  };
  events.push(ev);
  ecrireEvents(events);
  /* Session recognition (prepaye spirit) — keyed by propose action+rail, not by sink address */
  const recogKey = prop.rail + ':' + prop.action;
  try {
    const map = JSON.parse(localStorage.getItem(CLE_RECOG) || '{}') || {};
    map[recogKey] = { at: Date.now(), proposeId, asset, tip: X402_TIP };
    localStorage.setItem(CLE_RECOG, JSON.stringify(map));
  } catch (_) {}
  return { ok: true, event: ev, recognized: recogKey };
}

/**
 * After pay (or free propose), hook a journal write — Brain writes; does not sign.
 * @param {{proposeId:string, journalLine?:{genre:string,texte:string,parce_que:string}}} p
 */
export function recordJournalHook(p) {
  const proposeId = String((p && p.proposeId) || '').trim();
  if (!proposeId) return { ok: false, pourquoi: 'Journal hook needs proposeId' };
  const events = lireEvents();
  const prop = events.filter((e) => e.kind === 'propose' && e.id === proposeId).pop();
  if (!prop) return { ok: false, pourquoi: 'No matching propose' };
  const paid = events.some((e) => e.kind === 'pay' && e.proposeId === proposeId);
  const line = (p && p.journalLine) || {
    genre: 'FAIT',
    texte: 'Bot action proposed: ' + prop.action + (paid ? ' — pay recognized; journal updated.' : ' — waiting for signer pay.'),
    parce_que: 'Option A bot loop · tip ' + X402_TIP + (paid ? ' · pay event present' : ' · propose only'),
  };
  const ev = {
    schema: X402_SCHEMA,
    kind: 'journal',
    id: 'j' + Date.now().toString(36),
    proposeId,
    at: Date.now(),
    paid,
    line,
    tip: X402_TIP,
    brainSigns: false,
    signeParUtilisateur: true,
  };
  events.push(ev);
  ecrireEvents(events);
  return { ok: true, event: ev, line, paid };
}

/**
 * Prepaye-spirit: has this bot session already recognized a fee for rail:action?
 * @param {string} rail
 * @param {string} action
 * @param {{maxAgeMs?:number}} [opts]
 */
export function feeAlreadyRecognized(rail, action, opts = {}) {
  const key = String(rail || '') + ':' + String(action || '');
  try {
    const map = JSON.parse(localStorage.getItem(CLE_RECOG) || '{}') || {};
    const row = map[key];
    if (!row || !row.at) return { ok: false, recognized: false };
    const maxAge = opts.maxAgeMs != null ? Number(opts.maxAgeMs) : 24 * 3600 * 1000;
    if (Date.now() - Number(row.at) > maxAge) return { ok: false, recognized: false, pourquoi: 'recognition expired' };
    return { ok: true, recognized: true, at: row.at, asset: row.asset, proposeId: row.proposeId };
  } catch (_) {
    return { ok: false, recognized: false };
  }
}

/** Recent events for Brain UI / tests — never includes fee sink address. */
export function listX402Events(lim = 12) {
  return lireEvents().slice(-(lim || 12));
}

/**
 * Honest UI blurb — no sink addr, no Fees for Dev, no ≈$1, no "Brain signs markets".
 */
export function phraseOptionA() {
  return 'Option A: Brain proposes · you (or a capped session) pay · Brain writes the journal. '
    + 'Brain never freestyle-signs markets. x402 may recognize ETH/USDC micropay for data/tools — '
    + 'never Instant Birth 0.001 ETH, never Buy/Sell 0.5%, never a second Bridge 0.01% skim.';
}

/** Sanity: module strings must not leak sink / banned labels (used by tip test). */
export function assertCleanCopy() {
  const blob = [
    phraseOptionA(),
    JSON.stringify(X402_FEE_MATRIX),
    ...listX402Events(40).map((e) => JSON.stringify(e)),
  ].join('\n');
  if (/0xa6cf|Fees for Dev|≈\s*\$1|Brain signs markets/i.test(blob)) {
    return { ok: false, pourquoi: 'x402 module leaked forbidden copy' };
  }
  if (ADRESSE.test(blob)) {
    /* full 0x…40 in event txHash is OK; fee sink is 0xa6cf… — already caught above */
  }
  return { ok: true };
}
