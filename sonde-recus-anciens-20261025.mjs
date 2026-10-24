import { GRAINE_ACTIONS } from './actions-chaine-graine.js';
const URLS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://base.drpc.org', 'https://1rpc.io/base', 'https://developer-access-mainnet.base.org'];
const tri = [...GRAINE_ACTIONS].sort((a, b) => a[2] - b[2]);
const anciens = tri.slice(0, 14);
console.log('14 oldest blocks:', anciens.map((x) => x[3] + '@' + x[2]).join(' '));
let id = 0;
async function rpc(url, m, p) {
  try {
    const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { return 'HTTP ' + r.status + ' ' + t.slice(0, 60); }
    if (j.error) return 'ERR ' + String(j.error.message).slice(0, 70);
    if (j.result === null) return 'null';
    return j.result;
  } catch (e) { return 'NET ' + String(e.name || e).slice(0, 30); }
}
for (const url of URLS) {
  const res = { ok: 0, null: 0, err: {} };
  for (const [adr, tx, bloc, sym] of anciens.slice(0, 12)) {
    const r = await rpc(url, 'eth_getTransactionReceipt', [tx]);
    const t = await rpc(url, 'eth_getTransactionByHash', [tx]);
    const okR = r && typeof r === 'object' && r.status === '0x1';
    const okT = t && typeof t === 'object' && t.from;
    if (okR && okT) res.ok += 1; else { const k = (typeof r === 'string' ? r : 'R?') + ' | ' + (typeof t === 'string' ? t : 'T?'); res.err[k] = (res.err[k] || 0) + 1; }
    await new Promise((x) => setTimeout(x, 250));
  }
  console.log(url, JSON.stringify(res));
}
