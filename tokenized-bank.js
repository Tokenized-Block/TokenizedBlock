// tokenized-bank.js — TokenizedBank MVP: proof of hold = ERC-20 balanceOf on Base.
// ================================================================================================
// PRODUCT (Raksha 2026-09-22 + model update same day):
//   · B20 = fund wallet. Graft onto TokenizedBank to hold.
//   · Credit / yield is on the TOTALITY of linked/grafted blocks (basket), not a single block.
//   · User must HOLD to maintain credit.
//   · Losing ONE block does NOT kill credit — surviving linked blocks keep backing.
//   · Yield is SHARED with early holders (who pooled to create/open that TokenizedBank).
//   · Agent runs ops; user one-click confirms. Base.
//
// ⛔ NO BANK / CREDIT CONTRACT YET. This module only READs balanceOf. Opening credit is UI stub.
// ⛔ NEVER invent a balance. Illisible / invalid → etat NON_LU or INVALIDE, balance null.
// ⛔ Create stays free; FRAIS_OUVERTURE_WEI untouched; never surface fee sink a6cf in UI copy.

import { selecteur } from './pool.js';

/** No TokenizedBank credit contract on Base yet — honest null, not a fake address. */
export const BANK_CONTRACT = null;

/** Base USDC (display / future credit path). Not minted by this module. */
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;

function padAdr(a) {
  return String(a).replace(/^0x/i, '').toLowerCase().padStart(64, '0');
}

function adrOk(a) {
  return ADRESSE.test(String(a || ''));
}

/**
 * Live proof of hold: eth_call ERC-20 balanceOf(holder) on `block`.
 *
 * @param {{rpc:Function, block:string, holder:string}} p
 * @returns {Promise<{etat:'LU'|'NON_LU'|'INVALIDE', balance:bigint|null, block:string|null,
 *   holder:string|null, data?:string, pourquoi?:string}>}
 */
export async function proofOfHold({ rpc, block, holder }) {
  const b = String(block || '').toLowerCase();
  const h = String(holder || '').toLowerCase();
  if (!adrOk(b) || !adrOk(h)) {
    return { etat: 'INVALIDE', balance: null, block: null, holder: null,
      pourquoi: 'block and holder must be 0x addresses' };
  }
  const data = '0x' + selecteur('balanceOf(address)') + padAdr(h);
  try {
    const raw = await rpc('eth_call', [{ to: b, data }, 'latest']);
    /* empty 0x = no code / revert-as-empty on many nodes — not a proven zero hold */
    if (raw == null || raw === '' || raw === '0x') {
      return { etat: 'NON_LU', balance: null, block: b, holder: h, data,
        pourquoi: 'balanceOf returned empty' };
    }
    const hex = String(raw);
    if (!/^0x[0-9a-fA-F]+$/.test(hex)) {
      return { etat: 'NON_LU', balance: null, block: b, holder: h, data,
        pourquoi: 'balanceOf unreadable' };
    }
    const balance = BigInt(hex);
    return { etat: 'LU', balance, block: b, holder: h, data };
  } catch (e) {
    return { etat: 'NON_LU', balance: null, block: b, holder: h, data,
      pourquoi: String((e && e.message) || e) };
  }
}

/** True when a live proof shows a strictly positive balance. */
export function preuvePositive(preuve) {
  return !!(preuve && preuve.etat === 'LU' && preuve.balance != null && preuve.balance > 0n);
}

/**
 * Proof of hold across a basket of grafted blocks.
 * Credit backs on survivors with balance > 0 — unread/zero do not invent backing.
 *
 * @returns {Promise<{etat:'LU'|'PARTIEL'|'VIDE'|'INVALIDE', preuves:object[],
 *   survivants:string[], pourquoi?:string}>}
 */
export async function proofOfHoldPanier({ rpc, blocks, holder }) {
  const list = [...new Set((blocks || []).map((a) => String(a).toLowerCase()).filter(adrOk))];
  if (!adrOk(holder)) {
    return { etat: 'INVALIDE', preuves: [], survivants: [], pourquoi: 'holder must be 0x address' };
  }
  if (!list.length) {
    return { etat: 'VIDE', preuves: [], survivants: [], pourquoi: 'basket empty' };
  }
  const preuves = [];
  for (const block of list) {
    preuves.push(await proofOfHold({ rpc, block, holder }));
  }
  const survivants = preuves.filter(preuvePositive).map((p) => p.block);
  const nonLu = preuves.some((p) => p.etat === 'NON_LU' || p.etat === 'INVALIDE');
  if (!survivants.length) {
    return { etat: nonLu ? 'PARTIEL' : 'VIDE', preuves, survivants, pourquoi: 'no positive hold in basket' };
  }
  return { etat: nonLu ? 'PARTIEL' : 'LU', preuves, survivants };
}

/**
 * Model rule: removing / losing ONE block does not kill credit if another linked block still holds.
 * @param {string[]} basketAvant — grafted addresses before loss
 * @param {string} blockPerdu
 * @param {Map|Object|Array} preuves — proofs keyed by block, or array of proof objects
 */
export function creditSurvitPerte(basketAvant, blockPerdu, preuves) {
  const perdu = String(blockPerdu || '').toLowerCase();
  const reste = (basketAvant || []).map((a) => String(a).toLowerCase()).filter((a) => a !== perdu && adrOk(a));
  if (!reste.length) return { survit: false, survivants: [], pourquoi: 'no linked blocks left' };
  const map = new Map();
  if (preuves instanceof Map) {
    for (const [k, v] of preuves) map.set(String(k).toLowerCase(), v);
  } else if (Array.isArray(preuves)) {
    for (const p of preuves) if (p && p.block) map.set(String(p.block).toLowerCase(), p);
  } else if (preuves && typeof preuves === 'object') {
    for (const k of Object.keys(preuves)) map.set(String(k).toLowerCase(), preuves[k]);
  }
  const survivants = reste.filter((b) => preuvePositive(map.get(b)));
  if (!survivants.length) {
    return { survit: false, survivants: [], pourquoi: 'no surviving positive hold' };
  }
  return { survit: true, survivants, pourquoi: null };
}

/**
 * Local graft registry (no custody). Keyed by holder → list of block addresses (the basket).
 * ⛔ UI state only — not an on-chain graft until BANK_CONTRACT exists.
 */
export function lireGreffes(stockage, holder) {
  const h = String(holder || '').toLowerCase();
  if (!adrOk(h) || !stockage) return [];
  try {
    const raw = stockage.getItem('tb.tokenizedBank.grafts.' + h);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.map((a) => String(a).toLowerCase()).filter(adrOk))];
  } catch { return []; }
}

export function grefferBlock(stockage, holder, block) {
  const h = String(holder || '').toLowerCase();
  const b = String(block || '').toLowerCase();
  if (!adrOk(h) || !adrOk(b) || !stockage) {
    return { ok: false, grafts: [], pourquoi: 'invalid holder/block or storage' };
  }
  const grafts = lireGreffes(stockage, h);
  if (!grafts.includes(b)) grafts.push(b);
  stockage.setItem('tb.tokenizedBank.grafts.' + h, JSON.stringify(grafts));
  return { ok: true, grafts };
}

/** Ungraft one block — basket may keep credit if other linked holds remain (caller checks proofs). */
export function retirerGreffe(stockage, holder, block) {
  const h = String(holder || '').toLowerCase();
  const b = String(block || '').toLowerCase();
  if (!adrOk(h) || !adrOk(b) || !stockage) {
    return { ok: false, grafts: [], pourquoi: 'invalid holder/block or storage' };
  }
  const grafts = lireGreffes(stockage, h).filter((x) => x !== b);
  stockage.setItem('tb.tokenizedBank.grafts.' + h, JSON.stringify(grafts));
  return { ok: true, grafts };
}

/** Early holders who pooled to open this bank (local stub until contract). */
export function lireEarlyHolders(stockage, holderBank) {
  const h = String(holderBank || '').toLowerCase();
  if (!adrOk(h) || !stockage) return [];
  try {
    const raw = stockage.getItem('tb.tokenizedBank.early.' + h);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.map((a) => String(a).toLowerCase()).filter(adrOk))];
  } catch { return []; }
}

export function noterEarlyHolder(stockage, holderBank, early) {
  const h = String(holderBank || '').toLowerCase();
  const e = String(early || '').toLowerCase();
  if (!adrOk(h) || !adrOk(e) || !stockage) {
    return { ok: false, early: [], pourquoi: 'invalid address or storage' };
  }
  const list = lireEarlyHolders(stockage, h);
  if (!list.includes(e)) list.push(e);
  stockage.setItem('tb.tokenizedBank.early.' + h, JSON.stringify(list));
  return { ok: true, early: list };
}

/**
 * Stub credit open on the BASKET — no mint path until credit contract ships.
 * Requires ≥1 grafted block with positive proof. Yield shared with early holders (stub list).
 */
export function ouvrirCreditUsdcStub({
  holder, block = null, preuve = null, blocks = null, preuves = null,
  stockage = null, agent = 'Zero 1 / Brain',
}) {
  const basket = [...new Set([...(blocks || []), block].filter(Boolean)
    .map((a) => String(a).toLowerCase()).filter(adrOk))];
  let listePreuves = Array.isArray(preuves) ? [...preuves] : [];
  if (preuve) listePreuves.push(preuve);
  const positifs = listePreuves.filter(preuvePositive);
  if (!basket.length) {
    return { etat: 'REFUSE', pourquoi: 'basket empty — graft at least one block', creditUsdc: null };
  }
  if (!positifs.length) {
    return { etat: 'REFUSE', pourquoi: 'proof of hold must be > 0 on at least one linked block', creditUsdc: null };
  }
  let early = [];
  if (stockage && adrOk(holder)) {
    noterEarlyHolder(stockage, holder, holder);
    early = lireEarlyHolders(stockage, holder);
  }
  return {
    etat: 'PENDING_CONTRACT',
    creditUsdc: null,
    holder: String(holder).toLowerCase(),
    basket,
    survivants: positifs.map((p) => p.block),
    proofBalances: Object.fromEntries(positifs.map((p) => [p.block, String(p.balance)])),
    earlyHolders: early,
    holdRequired: true,
    oneLostDoesNotKill: true,
    yieldSharedWithEarlyHolders: true,
    bankContract: BANK_CONTRACT,
    usdc: USDC_BASE,
    agent,
    note: 'USDC credit is on the basket totality; hold to maintain; one block lost ≠ credit dead; '
      + 'yield shared with early holders. Mint path not deployed — agent runs ops after confirm.',
  };
}
