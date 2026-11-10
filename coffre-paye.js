// coffre-paye.js — CREATE-ONE-PATH step 3: has this wallet paid the community vault in TBLOCK for this block? Pure, injected reader.
// A TBLOCK transfer does not name the block, so "paid for this block" = a TBLOCK Transfer from this wallet to the vault mined AFTER the
// block existed (and after the vault was deployed). An event is not a transaction: each candidate is checked against its transaction
// (tx.from = the wallet, tx.to = TBLOCK) before it counts. The scan is bounded; beyond the bound the answer is NON_MESURE, never "unpaid".
// Does NOT prove: which block a payment meant to pay when one wallet births several blocks in a row (the first payment after each birth
// counts for it; two births then one payment reads as paid for both — the card says what it read).

export const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const COFFRE_DEPLOYE_BLOC = 55600290; /* TBlockVault 0x025D…f331, first block with code (read on chain 2026-11-10) */
const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (a) => String(a || '').toLowerCase();
const topicAdr = (a) => '0x' + bas(a).slice(2).padStart(64, '0');
const hex = (n) => '0x' + Number(n).toString(16);

/** the first block where `bloc` has code, searched in [depuis, tete]; null when it has none at tete */
export async function blocDeCreation({ rpc, bloc, depuis, tete }) {
  const code = async (n) => { const c = String(await rpc('eth_getCode', [bloc, hex(n)]) || '0x'); return c !== '0x' && c !== '0x0'; };
  if (!(await code(tete))) return null;
  if (await code(depuis)) return depuis;
  let lo = depuis, hi = tete;
  while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (await code(m)) hi = m; else lo = m; }
  return hi;
}

/**
 * lireCoffrePaye({ rpc, compte, bloc, coffre, tblock, tete?, pas = 2000, maxFenetres = 80 })
 * -> { etat:'LU', paye:true, hash, bloc, montant } | { etat:'LU', paye:false, depuis } | { etat:'NON_MESURE', pourquoi }
 */
export async function lireCoffrePaye({ rpc, compte, bloc, coffre, tblock, tete = null, pas = 2000, maxFenetres = 80 } = {}) {
  if (typeof rpc !== 'function') return { etat: 'NON_MESURE', pourquoi: 'no chain reader' };
  if (![compte, bloc, coffre, tblock].every((a) => ADR.test(String(a || '')))) return { etat: 'NON_MESURE', pourquoi: 'whole addresses required' };
  try {
    const head = Number.isSafeInteger(tete) ? tete : parseInt(await rpc('eth_blockNumber', []), 16);
    const ne = await blocDeCreation({ rpc, bloc, depuis: COFFRE_DEPLOYE_BLOC, tete: head });
    if (ne === null) return { etat: 'LU', paye: false, depuis: null, pasNe: true };
    const depuis = Math.max(ne, COFFRE_DEPLOYE_BLOC);
    const fenetres = Math.ceil((head - depuis + 1) / pas);
    if (fenetres > maxFenetres) return { etat: 'NON_MESURE', pourquoi: 'the block was born too long ago for this read (' + fenetres + ' windows)' };
    for (let a = depuis; a <= head; a += pas) {
      const b = Math.min(head, a + pas - 1);
      const logs = await rpc('eth_getLogs', [{ address: bas(tblock), fromBlock: hex(a), toBlock: hex(b), topics: [TRANSFER, topicAdr(compte), topicAdr(coffre)] }]);
      if (!Array.isArray(logs)) return { etat: 'NON_MESURE', pourquoi: 'a logs window came back without a list' };
      for (const l of logs) {
        const tx = await rpc('eth_getTransactionByHash', [l.transactionHash]);
        if (!tx || bas(tx.from) !== bas(compte)) continue; /* an event is not a transaction */
        const r = await rpc('eth_getTransactionReceipt', [l.transactionHash]);
        if (!r || r.status !== '0x1') continue;
        return { etat: 'LU', paye: true, hash: l.transactionHash, bloc: parseInt(l.blockNumber, 16), montant: BigInt(l.data).toString() };
      }
    }
    return { etat: 'LU', paye: false, depuis };
  } catch (e) {
    return { etat: 'NON_MESURE', pourquoi: 'the vault payment could not be read just now: ' + String((e && e.message) || e).slice(0, 100) };
  }
}
