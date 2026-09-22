// bridge.js — Bridge tab quote math (MVP stub). Tip 20260922-bridge-tab.
// ================================================================================================
// PRODUCT (Raksha / Zero 1 · 2026-09-22):
//   · Bridge tab = fiat→tokenized Fund path + sell/swap tokenized↔tokenized VIA a Bridge block.
//   · Fee = 0.01% of transfer volume (bps = 1) → same fee sink as Create/hook (a6cf on-chain).
//   · Prefer ETH or USDC settlement. NEVER surface fee address in UI.
//   · Amount-only labels — no « Fees for Dev », no ≈$1.
//   · Instant Birth / CreateRouter / openFeeDejaPayePour / V8 untouched.
//
// ⛔ ON-CHAIN PATH IS STUB. This module only computes quotes. Confirm CTA does not send txs yet.

/** Bridge fee = 0.01% of volume = 1 basis point. */
export const BRIDGE_FEE_BPS = 1n;
export const BRIDGE_FEE_RATE = 0.0001;
export const BRIDGE_FEE_LABEL = '0.01%';

/** Settlement assets preferred for fee display (symbols only — never fee sink address). */
export const BRIDGE_SETTLEMENT = ['ETH', 'USDC'];

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Stub quote: fee = amount * 0.0001; net = amount − fee.
 * Amounts are human decimal numbers (not wei). Returns null fields when amount invalid.
 *
 * @param {{amount:number|string, fromSym?:string, toSym?:string, settleSym?:string}} p
 * @returns {{ok:boolean, amount:number|null, fee:number|null, net:number|null,
 *   feeBps:number, feeLabel:string, settleSym:string, fromSym:string, toSym:string,
 *   pourquoi?:string}}
 */
export function quoteBridge(p) {
  const fromSym = String((p && p.fromSym) || 'ETH').trim() || 'ETH';
  const toSym = String((p && p.toSym) || 'USDC').trim() || 'USDC';
  let settleSym = String((p && p.settleSym) || '').trim();
  if (!settleSym) {
    settleSym = BRIDGE_SETTLEMENT.includes(fromSym) ? fromSym
      : (BRIDGE_SETTLEMENT.includes(toSym) ? toSym : 'ETH');
  }
  const raw = p && p.amount;
  const amount = typeof raw === 'number' ? raw : Number(String(raw == null ? '' : raw).replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, amount: null, fee: null, net: null, feeBps: Number(BRIDGE_FEE_BPS),
      feeLabel: BRIDGE_FEE_LABEL, settleSym, fromSym, toSym,
      pourquoi: 'Enter a valid amount' };
  }
  if (amount === 0) {
    return { ok: true, amount: 0, fee: 0, net: 0, feeBps: Number(BRIDGE_FEE_BPS),
      feeLabel: BRIDGE_FEE_LABEL, settleSym, fromSym, toSym };
  }
  const fee = amount * BRIDGE_FEE_RATE;
  const net = amount - fee;
  return { ok: true, amount, fee, net, feeBps: Number(BRIDGE_FEE_BPS),
    feeLabel: BRIDGE_FEE_LABEL, settleSym, fromSym, toSym };
}

/**
 * Format a quote amount for UI — amount + unit only (no dollar approx, no fee-addr).
 * Trims trailing zeros; keeps enough decimals for tiny 0.01% fees.
 */
export function formatBridgeAmount(n, sym) {
  if (n == null || !Number.isFinite(n)) return '—';
  const s = String(sym || '').trim();
  let body;
  if (n === 0) body = '0';
  else if (Math.abs(n) >= 1) body = n.toFixed(6).replace(/\.?0+$/, '');
  else if (Math.abs(n) >= 0.0001) body = n.toFixed(8).replace(/\.?0+$/, '');
  else body = n.toFixed(10).replace(/\.?0+$/, '');
  return s ? (body + ' ' + s) : body;
}

/** localStorage key for the chosen Bridge hub block (normal TB block address). */
export const BRIDGE_BLOCK_KEY = 'tb.bridge.block';

export function lireBridgeBlock() {
  try {
    const a = String(localStorage.getItem(BRIDGE_BLOCK_KEY) || '').trim();
    return ADRESSE.test(a) ? a.toLowerCase() : '';
  } catch (_) { return ''; }
}

export function ecrireBridgeBlock(adr) {
  const a = String(adr || '').trim();
  if (!ADRESSE.test(a)) {
    try { localStorage.removeItem(BRIDGE_BLOCK_KEY); } catch (_) {}
    return '';
  }
  const n = a.toLowerCase();
  try { localStorage.setItem(BRIDGE_BLOCK_KEY, n); } catch (_) {}
  return n;
}

/**
 * Honest stub confirm — no wallet, no calldata. UI shows this until on-chain lands.
 * @returns {{ok:false, stub:true, pourquoi:string, quote:object}}
 */
export function confirmerBridgeStub(quote) {
  return {
    ok: false,
    stub: true,
    pourquoi: 'Bridge transfers are not on-chain yet — quote only. Wallet confirm comes next.',
    quote: quote || null,
  };
}
