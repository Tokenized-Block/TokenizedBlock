// create-vault-tip.js — the OPTIONAL TBLOCK part of a birth (Phil 2026-11-10: "a bit in ETH, the rest in TBLOCK, up to $5,
// into the community vault"; chosen: optional, top-up to $5). Pure, no network.
// The birth itself never changes: 0.001 ETH is fixed in the deployed router and hook. This is a SEPARATE signature, offered
// only after the block is alive, so a missing TBLOCK balance can never stop a birth.
// One call: TBLOCK.transfer(VAULT, amount) from the creator's own wallet. Nothing else, no approval, no contract of ours in between.
import { TBLOCK, VAULT, wAddr, wUint, fmt } from './economie.js';

export const TARGET_USD = 5;
export const BIRTH_FEE_WEI = 1000000000000000n; /* 0.001 ETH, the birth fee every page shows */
const SCALE = 1000000n; /* prices handled in millionths of a cent-free unit: exact BigInt maths after one rounding */

/* micro-units of a positive finite number, or null */
const micro = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? BigInt(Math.round(x * 1e6)) : null);

/** usd left to reach TARGET_USD once the ETH fee is paid; 0 when the ETH fee alone covers it */
export function usdLeft(ethUsd) {
  const e = micro(ethUsd);
  if (e === null) return null;
  const feeMicro = (BIRTH_FEE_WEI * e) / 10n ** 18n; /* fee value in micro-dollars */
  const left = BigInt(TARGET_USD) * SCALE - feeMicro;
  return left > 0n ? left : 0n; /* micro-dollars */
}

/**
 * plan({ ethUsd, tblockUsd, balance }) -> { ok:true, usdMicro, amount, call } | { ok:false, why }
 * amount is in TBLOCK wei (18 decimals), rounded DOWN so the creator never pays above the target.
 */
export function plan({ ethUsd, tblockUsd, balance }) {
  if (!VAULT) return { ok: false, why: 'The community vault is not deployed yet.' };
  const left = usdLeft(ethUsd);
  if (left === null) return { ok: false, why: 'The ETH price could not be read just now.' };
  if (left === 0n) return { ok: false, why: 'The ETH fee already reaches $' + TARGET_USD + ': nothing to add.' };
  if (!(typeof tblockUsd === 'number' && Number.isFinite(tblockUsd) && tblockUsd > 0)) return { ok: false, why: 'The TBLOCK price could not be read just now.' };
  /* price in 1e-18 dollars per TBLOCK wei is tblockUsd; amount = left(micro$) / 1e6 / tblockUsd * 1e18 */
  const p = BigInt(Math.round(tblockUsd * 1e18)); /* dollars * 1e18 for ONE whole TBLOCK */
  if (p <= 0n) return { ok: false, why: 'The TBLOCK price could not be read just now.' };
  /* wei = (left / 1e6 dollars) / (p / 1e18 dollars per whole TBLOCK) * 1e18 = left * 1e36 / (p * 1e6) */
  const amount = (left * 10n ** 36n) / (p * SCALE);
  if (amount <= 0n) return { ok: false, why: 'Nothing to add.' };
  if (typeof balance !== 'bigint') return { ok: false, why: 'Your TBLOCK balance could not be read just now.' };
  if (balance < amount) return { ok: false, why: 'This needs ' + fmt(amount) + ' TBLOCK; this wallet holds ' + fmt(balance) + '.' };
  return { ok: true, usdMicro: left, amount, call: Object.freeze({ to: TBLOCK, data: '0xa9059cbb' + wAddr(VAULT) + wUint(amount), value: '0x0' }) };
}
