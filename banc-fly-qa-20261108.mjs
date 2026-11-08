// banc-fly-qa-20261108.mjs — QA of the autonomous fly by SIMULATION (2026-11-08).
// Default: a LONG headless run of the page's own pure modules (fly-core.js, fly-seal.js) on real-shaped synthetic windows — every stock
//   the page offers, hundreds of windows each, restarts in the middle — and it checks: no NaN anywhere, memory in bounds, the pulse queue
//   drained, the stored memory per stock and for all of them (what the page writes to localStorage), heap growth, and that a restart
//   (server deploy / page reload) costs no fake fee. PROD_SIZES=1 takes the trade sizes from the shared fly's real events
//   (https://tokenizedblock.space/api/fly/state, read-only, x-ms-monitor: 1).
// --fund <fly address> / --balance <address>: fund a fly wallet / read a balance ON THE FORK ONLY (refused unless FORK_RPC answers
//   anvil_nodeInfo). The page harness (banc-fly-page-qa-20261108.js) is PASTED into the page: the page CSP refuses a script or a fetch
//   from any other origin, so --harness (a CORS file server on 9094) does not work for it; it is kept only to fund a test user.
// Usage: node --expose-gc banc-fly-qa-20261108.mjs [windows=300]   |   FORK_RPC=http://127.0.0.1:8612 node banc-fly-qa-20261108.mjs --harness
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFly, createSession, foreseeNext, recordEdge } from './fly-core.js';
import { memoryFingerprint, sealData, readSeal } from './fly-seal.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';

const ICI = dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { ko++; console.log('KO  ' + m); } };

if (process.argv.includes('--fund') || process.argv.includes('--balance')) {
  /* --fund <fly>: the user's ONE opt-in, simulated ON THE FORK ONLY (10 USDC from the SNDKc pool, impersonated, + 0.002 ETH);
   * --balance <address>: its USDC and ETH on the fork */
  const FORK = process.env.FORK_RPC, who = String(process.argv[process.argv.length - 1]).toLowerCase();
  let id = 0; const rpc = async (method, params = []) => { const r = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json()); if (r.error) throw new Error(method + ': ' + JSON.stringify(r.error)); return r.result; };
  const info = FORK ? await rpc('anvil_nodeInfo').catch(() => null) : null;
  if (!info || !info.currentBlockNumber || !/^0x[0-9a-f]{40}$/.test(who)) { console.log('REFUSED: FORK_RPC must be an anvil fork and the last argument an address. Nothing sent.'); process.exit(2); }
  const { USDC_BASE } = await import('./frais-creation.js'), { selecteur } = await import('./keccak.js');
  const usdcOf = async (a) => BigInt(await rpc('eth_call', [{ to: USDC_BASE, data: selecteur('balanceOf(address)') + a.slice(2).padStart(64, '0') }, 'latest']));
  if (process.argv.includes('--fund')) {
    const pool = [...POOLS_ACTIONS_AERODROME.values()].find((t) => t.symbole === 'SNDKc').pool;
    await rpc('anvil_setBalance', [who, '0x' + (2n * 10n ** 15n).toString(16)]);
    await rpc('anvil_impersonateAccount', [pool]); await rpc('anvil_setBalance', [pool, '0x' + (10n ** 18n).toString(16)]);
    await rpc('eth_sendTransaction', [{ from: pool, to: USDC_BASE, data: selecteur('transfer(address,uint256)') + who.slice(2).padStart(64, '0') + (10n * 10n ** 6n).toString(16).padStart(64, '0') }]);
  }
  console.log(who + ' on the fork: ' + (await usdcOf(who)) + ' USDC units, ' + BigInt(await rpc('eth_getBalance', [who, 'latest'])) + ' wei');
} else if (process.argv.includes('--harness')) {
  const FORK = process.env.FORK_RPC;
  if (FORK) {
    let id = 0; const rpc = async (method, params = []) => { const r = await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json()); if (r.error) throw new Error(method + ': ' + JSON.stringify(r.error)); return r.result; };
    const info = await rpc('anvil_nodeInfo').catch(() => null);
    if (!info || !info.currentBlockNumber) { console.log('REFUSED: ' + FORK + ' is not an anvil fork. Nothing sent.'); process.exit(2); }
    const { USDC_BASE } = await import('./frais-creation.js'), { selecteur } = await import('./keccak.js');
    const user = process.env.QA_USER || '0x' + 'c0ffee'.padEnd(40, '1');
    const pool = [...POOLS_ACTIONS_AERODROME.values()].find((t) => t.symbole === 'SNDKc').pool;
    await rpc('anvil_impersonateAccount', [user]); await rpc('anvil_setBalance', [user, '0x' + (10n ** 18n).toString(16)]);
    await rpc('anvil_impersonateAccount', [pool]); await rpc('anvil_setBalance', [pool, '0x' + (10n ** 18n).toString(16)]);
    await rpc('eth_sendTransaction', [{ from: pool, to: USDC_BASE, data: selecteur('transfer(address,uint256)') + user.slice(2).padStart(64, '0') + (50n * 10n ** 6n).toString(16).padStart(64, '0') }]);
    console.log('fork user ready (impersonated, 1 ETH + 50 USDC, fork only): ' + user);
  }
  createServer((req, res) => {
    res.setHeader('access-control-allow-origin', '*');
    if (req.url.startsWith('/banc-fly-page-qa-20261108.js')) { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(readFileSync(join(ICI, 'banc-fly-page-qa-20261108.js'))); }
    else { res.writeHead(404); res.end(); }
  }).listen(9094, '127.0.0.1', () => console.log('harness on http://127.0.0.1:9094/banc-fly-page-qa-20261108.js'));
} else {
  const W = Number(process.argv[2]) || 300;
  const circuit = JSON.parse(readFileSync(join(ICI, 'fly-brain-circuit.json'), 'utf8'));
  /* the stocks the page offers: its ORDER, then the pools with 10,000 USDC or more (fly-brain.js) */
  const stocks = [...POOLS_ACTIONS_AERODROME.entries()].filter(([, t]) => t.usdcMesure >= 10000).map(([a, t]) => ({ address: a, symbol: t.symbole }));
  /* deterministic random (no Math.random: a replayable bench) */
  let seed = 20261108; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  let sizes = null;
  if (process.env.PROD_SIZES === '1') {
    try { const s = await fetch('https://tokenizedblock.space/api/fly/state', { headers: { 'x-ms-monitor': '1' } }).then((x) => x.json());
      sizes = (s.events || []).filter((e) => e.type === 'tx' && Number.isFinite(e.usd) && e.usd > 0).map((e) => e.usd);
      console.log('real trade sizes from the shared fly: ' + sizes.length + ' (' + s.symbol + ', ' + s.windows + ' windows, persisted ' + s.persisted + ')'); } catch (e) { console.log('prod sizes not read: ' + e.message); }
  }
  if (!sizes || !sizes.length) sizes = null;
  const SIGNER = '0x' + 'a'.repeat(40), OTHER = '0x' + 'b'.repeat(40);
  let txk = 0;
  const gc = () => { if (global.gc) global.gc(); return process.memoryUsage().heapUsed; };
  const fly = createFly(circuit), shadow = createFly(circuit);
  const heap0 = gc(); let heapMid = null;
  const stored = new Map(); let nanAt = null, undrained = 0, decisions = 0, restarts = 0, fakeFees = 0, maxSeen = 0, events = 0;
  const t0 = Date.now();
  for (const [si, st] of stocks.entries()) {
    let session = createSession(fly, (e) => { events++; if (e.type === 'decision') decisions++; });
    fly.importMemory(null); session.restore(null);
    let p = 50 + 900 * rnd(); const vol = 0.0002 + 0.002 * rnd(), decimals = 8;
    for (let w = 0; w < W; w++) {
      p *= 1 + vol * gauss();
      const k = rnd() < 0.55 ? Math.floor(rnd() * 4) : 0, txs = [];
      for (let j = 0; j < k; j++) {
        const usd = sizes ? sizes[Math.floor(rnd() * sizes.length)] : Math.exp(3 + 2.2 * gauss()), units = BigInt(Math.max(1, Math.round((usd / p) * 10 ** decimals)));
        const kind = rnd(); txs.push({ tx: '0x' + (++txk).toString(16).padStart(64, '0'), bloc: txk, signataire: SIGNER,
          mouvements: [kind < 0.45 ? { de: OTHER, vers: SIGNER, montant: String(units) } : kind < 0.9 ? { de: SIGNER, vers: OTHER, montant: String(units) } : { de: OTHER, vers: '0x' + 'c'.repeat(40), montant: String(units) }] });
      }
      /* the activity endpoint returns its recent rows, old ones included: the session must smell only the new */
      const price = rnd() < 0.03 ? null : { priceUsd: p, tokenDecimals: decimals, feePips: 500, block: w };
      const transactions = rnd() < 0.03 ? null : txs;
      session.window({ symbol: st.symbol, price, transactions });
      fly.drain();
      if (fly.saveState().queued || fly.saveState().pulseSteps) undrained++;
      if (w % 25 === 24) foreseeNext(shadow, fly, session);
      const s = session.state();
      const bad = [s.typical, s.books.fly.ret, s.books.hold.ret, s.books.momentum.ret].some((x) => !Number.isFinite(x)) || fly.exportMemory().some((x) => !Number.isFinite(x) || x < 5000 || x > 100000);
      if (bad && !nanAt) nanAt = st.symbol + ' window ' + w;
      /* a restart every 100 windows, as the page reload / the server deploy do it: memory + state through JSON */
      if (w % 100 === 99) {
        const sw = s.books.hold.switches, x = JSON.parse(JSON.stringify({ m: fly.exportMemory(), ...s, at: Date.now() }));
        session = createSession(fly, (e) => { events++; if (e.type === 'decision') decisions++; }); fly.importMemory(x.m); session.restore(x); restarts++;
        if (session.state().books.hold.switches !== sw || session.state().books.hold.pos !== s.books.hold.pos) fakeFees++;
      }
    }
    const payload = JSON.stringify({ m: fly.exportMemory(), ...session.state(), at: Date.now() });
    stored.set(st.symbol, payload.length);
    if (si === Math.floor(stocks.length / 2)) heapMid = gc();
    /* the seal of this memory reads back */
    const fp = memoryFingerprint(fly.exportMemory()), note = sealData({ stock: st.address, fingerprint: fp, windows: session.settled }), back = readSeal(note);
    if (!back || back.fingerprint !== fp || back.stock !== st.address) ok(false, st.symbol + ': seal does not read back');
    maxSeen = Math.max(maxSeen, txk);
  }
  const heap1 = gc();
  const total = [...stored.values()].reduce((a, b) => a + b, 0);
  ok(!nanAt, 'no NaN / out-of-bounds value in ' + stocks.length + ' stocks x ' + W + ' windows' + (nanAt ? ' — first at ' + nanAt : ''));
  ok(undrained === 0, 'the pulse queue is drained after every window (' + undrained + ' left)');
  ok(fakeFees === 0, restarts + ' restarts, none moved a paper position or paid a fake switch fee (' + fakeFees + ')');
  ok(decisions > 0 && events > 0, decisions + ' decisions, ' + events + ' events in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
  const maxOne = Math.max(...stored.values());
  /* localStorage counts UTF-16: 2 bytes a character; browsers allow about 5 MB per site, shared with the whole app */
  ok(maxOne < 40000 && total * 2 < 2.5e6, 'stored memory: ' + (maxOne / 1024).toFixed(1) + ' KB for one stock at most, ' + (total / 1024).toFixed(0) + ' KB of text (' + (total * 2 / 1048576).toFixed(2) + ' MB in UTF-16) for all ' + stocks.length);
  ok(heap1 - heapMid < 8e6, 'heap ' + (heap0 / 1048576).toFixed(1) + ' -> ' + (heapMid / 1048576).toFixed(1) + ' (half) -> ' + (heap1 / 1048576).toFixed(1) + ' MB (end)' + (global.gc ? '' : ' [run with --expose-gc for a real figure]'));
  const r = recordEdge({ consistent: 0, opposite: 0 }); ok(r.p === 1, 'an empty record is a coin flip (p = 1)');
  console.log(n + ' assertions, ' + ko + ' KO');
  process.exitCode = ko ? 1 : 0;
}
