// relais-rpc.js — game341: what the server relay /api/rpc accepts from the page. Pure, no network.
// Why (Grok's live test 2026-11-10): the page reads the chain on free public nodes; when all of them answer 429, a birth stopped in the
// middle could not be resumed ("this block's market could not be read right now"). Prod counts since 14:45Z: mainnet.base.org 18,131
// rate-limited of 41,919, base.drpc.org 9,896 of 16,787. The server holds a keyed node (CDP) that answered every probe "ok". The page uses
// the relay ONLY after every public node refused; the relay reads, it never sends: no eth_sendRawTransaction, no account method.
// Does NOT prove: the relay's own node budget is enough on a busy day (it is capped per day and per IP, and says so when spent).

export const RELAIS_METHODES = Object.freeze(new Set([
  'eth_call', 'eth_getBalance', 'eth_blockNumber', 'eth_getCode', 'eth_chainId', 'eth_getTransactionReceipt',
  'eth_getTransactionCount', 'eth_getBlockByNumber', 'eth_estimateGas', 'eth_getLogs', 'eth_getStorageAt',
]));
export const RELAIS_LOGS_BLOCS_MAX = 2000;   /* a getLogs window above it is refused: the page reads deep history elsewhere */
export const RELAIS_LOGS_ADRESSES_MAX = 9;   /* the same bound the page already uses for publicnode */
export const RELAIS_CORPS_MAX = 32 * 1024;   /* bytes of the request body */

const HEX = /^0x[0-9a-fA-F]*$/;
const ADR = /^0x[0-9a-fA-F]{40}$/;
const BLOC = (b) => b === 'latest' || b === 'pending' || b === 'safe' || b === 'finalized' || (typeof b === 'string' && /^0x[0-9a-fA-F]{1,16}$/.test(b));

/** validerRelais({ method, params }) -> { ok:true } | { ok:false, why } — shape checks only; the node judges the rest */
export function validerRelais(body) {
  if (!body || typeof body !== 'object') return { ok: false, why: 'JSON body { method, params } expected' };
  const { method, params } = body;
  if (!RELAIS_METHODES.has(method)) return { ok: false, why: 'method not relayed: ' + String(method).slice(0, 40) };
  if (!Array.isArray(params) || params.length > 3) return { ok: false, why: 'params must be an array of at most 3' };
  if (method === 'eth_call' || method === 'eth_estimateGas') {
    const t = params[0];
    if (!t || typeof t !== 'object' || (t.to !== undefined && !ADR.test(String(t.to))) || (t.data !== undefined && !HEX.test(String(t.data)))) return { ok: false, why: 'call object expected' };
    if (params[1] !== undefined && !BLOC(params[1])) return { ok: false, why: 'block tag expected' };
  }
  if (method === 'eth_getBlockByNumber' && (!BLOC(params[0]) || params[1] !== false)) return { ok: false, why: 'block tag and false (no full transactions) expected' };
  if (method === 'eth_getLogs') {
    const f = params[0];
    if (!f || typeof f !== 'object' || f.blockHash) return { ok: false, why: 'a filter with fromBlock and toBlock expected' };
    if (!/^0x[0-9a-fA-F]{1,16}$/.test(String(f.fromBlock)) || !/^0x[0-9a-fA-F]{1,16}$/.test(String(f.toBlock))) return { ok: false, why: 'numeric fromBlock and toBlock expected' };
    const n = parseInt(f.toBlock, 16) - parseInt(f.fromBlock, 16);
    if (!(n >= 0) || n > RELAIS_LOGS_BLOCS_MAX) return { ok: false, why: 'a logs window of at most ' + RELAIS_LOGS_BLOCS_MAX + ' blocks' };
    const a = Array.isArray(f.address) ? f.address : (f.address ? [f.address] : []);
    if (a.length === 0 || a.length > RELAIS_LOGS_ADRESSES_MAX || !a.every((x) => ADR.test(String(x)))) return { ok: false, why: '1 to ' + RELAIS_LOGS_ADRESSES_MAX + ' addresses expected' };
  }
  if (['eth_getBalance', 'eth_getCode', 'eth_getTransactionCount'].includes(method) && (!ADR.test(String(params[0])) || (params[1] !== undefined && !BLOC(params[1])))) return { ok: false, why: 'address and block tag expected' };
  if (method === 'eth_getTransactionReceipt' && !/^0x[0-9a-fA-F]{64}$/.test(String(params[0]))) return { ok: false, why: 'transaction hash expected' };
  return { ok: true };
}
