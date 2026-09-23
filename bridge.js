// bridge.js — Bridge tab quote + 0.01% fee skim + honest legs (tip 20260923-bridge-x402-brain).
// ================================================================================================
// PRODUCT (Raksha / Zero 1 · 2026-09-22/23):
//   · Bridge tab = fiat→tokenized Fund path + sell/swap tokenized↔tokenized VIA a Bridge block.
//   · Fee = 0.01% of transfer volume (bps = 1) → same fee sink as Create/hook (a6cf on-chain).
//   · Prefer ETH or USDC settlement. NEVER surface fee address in UI.
//   · Amount-only labels — no « Fees for Dev », no ≈$1.
//   · Instant Birth / CreateRouter / openFeeDejaPayePour / V8 / BuySell 0.5% untouched.
//
// ON-CHAIN FEE PATH (this tip):
//   Client-side skim — user-signed ETH value send OR USDC ERC-20 transfer of feeUnits → FEE_WALLET.
//   Why not reuse Buy/Sell router? FRAIS_INTERFACE_BPS is sealed at 50 (0.5%) with fail-closed
//   assertFraisInterfaceA6cf; no live contract exposes TAKE_PORTION at 1 bps.
//
// SECURITY (document, do not hide):
//   · Fee is a SEPARATE user-signed tx (or first call in a future atomic batch) — not enforced by
//     a Bridge router. User can refuse; nothing is custodial.
//   · Full tokenized↔tokenized swap of the NET via hub is NOT on-chain yet → GO Phil: BridgeRouter
//     (or 1 bps TAKE_PORTION) so fee+swap are atomic. Confirm still sends the fee skim only when
//     From is ETH/USDC; net swap stays blocked with clear copy.
//   · Fail-closed if fee rounds to 0 wei/units (amount too small for 1 bps).
//   · FEE_WALLET address never appears in UI strings returned here.

/** Bridge fee = 0.01% of volume = 1 basis point. */
export const BRIDGE_FEE_BPS = 1n;
export const BRIDGE_FEE_RATE = 0.0001;
export const BRIDGE_FEE_LABEL = '0.01%';

/** Settlement assets preferred for fee display (symbols only — never fee sink address). */
export const BRIDGE_SETTLEMENT = ['ETH', 'USDC'];

/**
 * Dig §1 Bridge legs — UI labels only. Fee sink never appears here.
 * Equity = future leg label (honest "later"), not a live broker / FINRA / C4A clone.
 * Hub token↔token net swap stays Phil-blocked until BridgeRouter 1 bps GO.
 */
export const BRIDGE_LEGS = Object.freeze([
  {
    id: 'fund',
    label: 'Fiat → wallet',
    live: true,
    fee: 'provider',
    note: 'Fund mode — Coinbase/MoonPay lands ETH/USDC in YOUR wallet. Not a TB skim.',
  },
  {
    id: 'skim',
    label: 'ETH/USDC skim',
    live: true,
    fee: '0.01%',
    note: 'Confirm sends 0.01% when From is ETH or USDC (wallet signs). Fail-closed if fee rounds to 0.',
  },
  {
    id: 'hub',
    label: 'Block / Token hub',
    live: false,
    fee: '0.01%',
    goPhil: true,
    note: 'Quote stub only — atomic token↔token net via hub needs Phil BridgeRouter 1 bps. Not live.',
  },
  {
    id: 'equity',
    label: 'Tokenized equity leg',
    live: false,
    fee: 'later',
    note: 'Future Bridge leg when a real venue exists — not a TB equities broker, not C4A/FINRA.',
  },
]);

/** Short honest legs blurb for Bridge panel (no sink, no ≈$1, no 2x/leverage). */
export function phraseBridgeLegs() {
  return 'Legs: Fund (fiat→your wallet) · ETH/USDC 0.01% skim (live) · Block/Token hub quote (net swap Phil-blocked) · tokenized equity later — not a broker.';
}

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
 * Parse a human decimal string/number into integer token units (bigint).
 * Fail-closed on bad input — never silently truncates wrong.
 */
export function unitsFromHuman(amount, decimals) {
  const d = Number(decimals);
  if (!Number.isInteger(d) || d < 0 || d > 36) throw new Error('bad decimals');
  const raw = String(amount == null ? '' : amount).trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error('bad amount');
  const [whole, frac = ''] = raw.split('.');
  if (frac.length > d) throw new Error('too many decimals');
  const padded = frac.padEnd(d, '0');
  const joined = (whole + padded).replace(/^0+(?=\d)/, '') || '0';
  return BigInt(joined);
}

/**
 * Plan client-side 0.01% fee skim for Bridge confirm.
 * Caller fills `to` / calldata with FEE_WALLET (never pass the address into UI copy).
 *
 * Live path only when From is ETH or USDC (user holds the settlement asset).
 * Net swap via hub = Phil GO (no 1 bps router yet).
 *
 * @param {{amount:number|string, fromSym?:string, toSym?:string, settleSym?:string}} p
 * @returns {{ok:boolean, live:boolean, stub?:boolean, feeUnits?:bigint, totalUnits?:bigint,
 *   netUnits?:bigint, decimals?:number, asset?:'ETH'|'USDC', settleSym:string,
 *   fromSym:string, toSym:string, feeBps:number, feeLabel:string, pourquoi?:string,
 *   goPhil?:boolean}}
 */
export function planBridgeFeeSkim(p) {
  const q = quoteBridge(p);
  if (!q.ok) {
    return { ok: false, live: false, settleSym: q.settleSym, fromSym: q.fromSym, toSym: q.toSym,
      feeBps: q.feeBps, feeLabel: q.feeLabel, pourquoi: q.pourquoi || 'Invalid quote' };
  }
  if (!(q.amount > 0)) {
    return { ok: false, live: false, settleSym: q.settleSym, fromSym: q.fromSym, toSym: q.toSym,
      feeBps: q.feeBps, feeLabel: q.feeLabel, pourquoi: 'Enter an amount above zero' };
  }
  const from = q.fromSym;
  if (from !== 'ETH' && from !== 'USDC') {
    return {
      ok: false, live: false, stub: true, goPhil: true,
      settleSym: q.settleSym, fromSym: q.fromSym, toSym: q.toSym,
      feeBps: q.feeBps, feeLabel: q.feeLabel,
      pourquoi: 'Bridge fee path is live for ETH / USDC From only. Tokenized↔tokenized net swap via hub needs a 1 bps on-chain router (Phil).',
    };
  }
  const decimals = from === 'USDC' ? 6 : 18;
  let totalUnits;
  try {
    totalUnits = unitsFromHuman(q.amount, decimals);
  } catch (e) {
    return { ok: false, live: false, settleSym: q.settleSym, fromSym: q.fromSym, toSym: q.toSym,
      feeBps: q.feeBps, feeLabel: q.feeLabel, pourquoi: 'Enter a valid amount' };
  }
  const feeUnits = (totalUnits * BRIDGE_FEE_BPS) / 10000n;
  if (feeUnits <= 0n) {
    return { ok: false, live: false, settleSym: q.settleSym, fromSym: q.fromSym, toSym: q.toSym,
      feeBps: q.feeBps, feeLabel: q.feeLabel,
      pourquoi: 'Amount too small for 0.01% fee — raise the amount' };
  }
  return {
    ok: true,
    live: true,
    goPhil: true, /* net swap still Phil-blocked */
    feeUnits,
    totalUnits,
    netUnits: totalUnits - feeUnits,
    decimals,
    asset: from,
    settleSym: from,
    fromSym: q.fromSym,
    toSym: q.toSym,
    feeBps: Number(BRIDGE_FEE_BPS),
    feeLabel: BRIDGE_FEE_LABEL,
    pourquoi: 'Fee skim ready — wallet will send 0.01% only. Net swap via Bridge hub needs Phil 1 bps router.',
  };
}

/**
 * Build the wallet call for a planned skim. feeWallet / usdc MUST come from frais-creation
 * constants in the caller — never hardcode a second copy here for UI leakage risk.
 *
 * @param {{plan:object, feeWallet:string, usdc:string, encodeTransfer:(to:string,amt:bigint)=>string}} args
 * @returns {{ok:boolean, to?:string, data?:string, value?:string, pourquoi?:string}}
 */
export function buildBridgeFeeCall({ plan, feeWallet, usdc, encodeTransfer }) {
  if (!plan || !plan.ok || !plan.live) {
    return { ok: false, pourquoi: (plan && plan.pourquoi) || 'No live Bridge fee plan' };
  }
  const sink = String(feeWallet || '').trim();
  if (!ADRESSE.test(sink)) return { ok: false, pourquoi: 'Fee sink misconfigured — nothing sent' };
  if (plan.asset === 'ETH') {
    return {
      ok: true,
      to: sink,
      data: '0x',
      value: '0x' + plan.feeUnits.toString(16),
    };
  }
  if (plan.asset === 'USDC') {
    const token = String(usdc || '').trim();
    if (!ADRESSE.test(token)) return { ok: false, pourquoi: 'USDC misconfigured — nothing sent' };
    let data;
    try { data = encodeTransfer(sink, plan.feeUnits); }
    catch (e) { return { ok: false, pourquoi: 'Could not encode USDC fee transfer' }; }
    return { ok: true, to: token, data, value: '0x0' };
  }
  return { ok: false, pourquoi: 'Unsupported fee asset' };
}

/**
 * Honest stub confirm — kept for tests / non-ETH-USDC From. UI prefers planBridgeFeeSkim.
 * @returns {{ok:false, stub:true, pourquoi:string, quote:object}}
 */
export function confirmerBridgeStub(quote) {
  return {
    ok: false,
    stub: true,
    goPhil: true,
    /* Retired: any copy that promised atomic tokenized↔tokenized without Phil GO */
    pourquoi: 'Atomic token↔token net via Bridge hub is blocked until Phil BridgeRouter (1 bps). '
      + 'Fee skim is live when From is ETH or USDC only. Equity leg = later — not a live trade.',
    quote: quote || null,
  };
}
