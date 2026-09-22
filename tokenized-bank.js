// tokenized-bank.js — TokenizedBank MVP: proof of hold = ERC-20 balanceOf on Base.
// ================================================================================================
// PRODUCT (Raksha 2026-09-22): a Tokenized Block (B20) is a fund wallet. User grafts it onto
// TokenizedBank to store/hold; yield path = USDC credit from on-chain proof of hold — not
// traditional underwriting. Agent runs ops; user one-click confirms.
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
  if (!ADRESSE.test(b) || !ADRESSE.test(h)) {
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
 * Local graft registry (no custody). Keyed by holder → list of block addresses.
 * ⛔ This is UI state only — not an on-chain graft until BANK_CONTRACT exists.
 */
export function lireGreffes(stockage, holder) {
  const h = String(holder || '').toLowerCase();
  if (!ADRESSE.test(h) || !stockage) return [];
  try {
    const raw = stockage.getItem('tb.tokenizedBank.grafts.' + h);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return [...new Set(arr.map((a) => String(a).toLowerCase()).filter((a) => ADRESSE.test(a)))];
  } catch { return []; }
}

export function grefferBlock(stockage, holder, block) {
  const h = String(holder || '').toLowerCase();
  const b = String(block || '').toLowerCase();
  if (!ADRESSE.test(h) || !ADRESSE.test(b) || !stockage) {
    return { ok: false, grafts: [], pourquoi: 'invalid holder/block or storage' };
  }
  const grafts = lireGreffes(stockage, h);
  if (!grafts.includes(b)) grafts.push(b);
  stockage.setItem('tb.tokenizedBank.grafts.' + h, JSON.stringify(grafts));
  return { ok: true, grafts };
}

/**
 * Stub credit open — no mint path until credit contract ships.
 * Returns an honest PENDING_CONTRACT payload for UI / agent handoff.
 */
export function ouvrirCreditUsdcStub({ holder, block, preuve, agent = 'Zero 1 / Brain' }) {
  if (!preuvePositive(preuve)) {
    return { etat: 'REFUSE', pourquoi: 'proof of hold must be > 0', creditUsdc: null };
  }
  return {
    etat: 'PENDING_CONTRACT',
    creditUsdc: null,
    holder: String(holder).toLowerCase(),
    block: String(block).toLowerCase(),
    proofBalance: String(preuve.balance),
    bankContract: BANK_CONTRACT,
    usdc: USDC_BASE,
    agent,
    note: 'USDC credit mint path not deployed — agent will run ops after user confirms.',
  };
}
