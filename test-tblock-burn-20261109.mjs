// test-tblock-burn-20261109.mjs — the burn counter. Pure checks; LIVE=1 reads Base mainnet (read-only).
import { readBurn, burnShare, burnSources, burnLogsFilter, TBLOCK, DEAD, POOL_MANAGER, TOPIC_TRANSFER } from './tblock-burn.js';
let ok = 0, ko = 0;
const t = (n, c, x = '') => { if (c) ok++; else { ko++; console.log('RED', n, x); } };
const E18 = 10n ** 18n;

t('Transfer topic is the ERC-20 one', TOPIC_TRANSFER.startsWith('0xddf252ad'));
let s = burnShare({ deadBalance: 11_452_650n * E18, totalSupply: 10n ** 27n });
t('11,452,650 of 1e9 = 1.1452 %', s && s.tokens === 11_452_650 && Math.abs(s.pct - 1.1452) < 1e-9, JSON.stringify(s, (k, v) => typeof v === 'bigint' ? v.toString() : v));
t('missing read -> null', burnShare({ deadBalance: null, totalSupply: 1n }) === null && burnShare({ deadBalance: 1n, totalSupply: 0n }) === null);
t('more burned than supply -> null (a read is wrong)', burnShare({ deadBalance: 2n, totalSupply: 1n }) === null);

const pad = (a) => '0x' + a.slice(2).padStart(64, '0');
const lg = (o = {}) => ({ address: o.address || TBLOCK, topics: [o.t0 || TOPIC_TRANSFER, pad(o.from || POOL_MANAGER), pad(o.to || DEAD)], data: '0x' + (o.v ?? E18).toString(16) });
const BUY = '0x' + 'bb'.repeat(20), ME = '0x' + '12'.repeat(20);
const r = burnSources([lg(), lg({ v: 2n * E18 }), lg({ from: BUY, v: 10n * E18 }), lg({ from: ME }), lg({ address: '0x' + 'aa'.repeat(20) }), lg({ to: ME }), lg({ t0: '0x' + '00'.repeat(32) })], { [BUY]: 'buyback' });
const by = Object.fromEntries(r.sources.map((x) => [x.label, x]));
t('only TBLOCK transfers to dead are counted (4 of 7)', r.transfers === 4, String(r.transfers));
t('pool hook cut summed', by['trades (pool hook cut)'] && by['trades (pool hook cut)'].raw === 3n * E18 && by['trades (pool hook cut)'].transfers === 2);
t('named contract labelled', by.buyback && by.buyback.raw === 10n * E18);
t('anyone else grouped', by['people sending it there'] && by['people sending it there'].raw === E18);
t('largest source first', r.sources[0].label === 'buyback');
t('a fake contract emitting the same event is ignored', !Object.values(by).some((x) => x.raw === 0n));
const f = burnLogsFilter(100, 200);
t('filter: TBLOCK, Transfer, to dead, hex range', f.address === TBLOCK && f.topics[0] === TOPIC_TRANSFER && f.topics[1] === null && f.topics[2] === pad(DEAD) && f.fromBlock === '0x64' && f.toBlock === '0xc8');

/* readBurn: both reads at ONE block, a public shape without BigInt, and every missing read told as NOT_READ */
const w32 = (n) => '0x' + n.toString(16).padStart(64, '0');
const seen = [];
const fake = (bal, sup) => async (to, data, b) => { seen.push({ to, data, b }); return data.startsWith('0x70a08231') ? bal : sup; };
let rb = await readBurn({ lire: fake(w32(11_542_324n * E18), w32(10n ** 27n)), block: 777 });
t('readBurn ok: 11,542,324 TBLOCK = 1.1542 %', rb.ok === true && rb.tokens === 11_542_324 && rb.pct === 1.1542 && rb.block === 777, String(rb.tokens) + ' ' + String(rb.pct));
t('readBurn: strings, no BigInt (JSON-safe)', typeof rb.dead === 'string' && rb.supply === (10n ** 27n).toString() && (() => { try { return JSON.stringify(rb).length > 0; } catch (_) { return false; } })());
t('readBurn: two reads, both on TBLOCK, both at the block given', seen.length === 2 && seen.every((c) => c.to === TBLOCK && c.b === 777));
t('readBurn: balanceOf(dead) and totalSupply()', seen.some((c) => c.data === '0x70a08231' + pad(DEAD).slice(2)) && seen.some((c) => c.data === '0x18160ddd'));
rb = await readBurn({ lire: fake(w32(0n), w32(10n ** 27n)), block: 1 });
t('readBurn: nothing at dead is a real 0, not a failure', rb.ok === true && rb.tokens === 0 && rb.pct === 0);
rb = await readBurn({ lire: fake('0x', w32(10n ** 27n)), block: 1 });
t('readBurn: empty balance -> NOT_READ', rb.ok === false && rb.state === 'NOT_READ' && rb.tokens === undefined && /empty or cut/.test(rb.why), JSON.stringify(rb));
rb = await readBurn({ lire: fake('0x01', w32(10n ** 27n)), block: 1 });
t('readBurn: a cut balance word is not read as 1 wei', rb.ok === false && /empty or cut/.test(rb.why), JSON.stringify(rb));
rb = await readBurn({ lire: fake(w32(1n), '0x01'), block: 1 });
t('readBurn: a cut supply word -> NOT_READ', rb.ok === false && /empty or cut/.test(rb.why), JSON.stringify(rb));
rb = await readBurn({ lire: fake(w32(1n), '0x'), block: 1 });
t('readBurn: empty supply -> NOT_READ', rb.ok === false && rb.state === 'NOT_READ' && /empty or cut/.test(rb.why));
rb = await readBurn({ lire: fake(w32(2n), w32(1n)), block: 1 });
t('readBurn: dead above supply -> NOT_READ', rb.ok === false && /do not fit/.test(rb.why));
rb = await readBurn({ lire: fake(w32(1n), w32(0n)), block: 1 });
t('readBurn: supply 0 -> NOT_READ', rb.ok === false);
let thrown = null;
try { await readBurn({ lire: async () => { throw new Error('node down'); }, block: 1 }); } catch (e) { thrown = e; }
t('readBurn: a lecteur that throws is not turned into a number', thrown && thrown.message === 'node down');

if (process.env.LIVE === '1') {
  const rpc = async (method, params) => { const j = await fetch('https://base-rpc.publicnode.com', { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }).then((x) => x.json()); if (j.error) throw new Error(JSON.stringify(j.error)); return j.result; };
  const bal = await rpc('eth_call', [{ to: TBLOCK, data: '0x70a08231' + DEAD.slice(2).padStart(64, '0') }, 'latest']);
  const sup = await rpc('eth_call', [{ to: TBLOCK, data: '0x18160ddd' }, 'latest']);
  const sh = burnShare({ deadBalance: bal, totalSupply: sup });
  console.log('LIVE burned', sh.tokens, sh.pct + '%');
  t('LIVE: dead holds more than 11M TBLOCK, supply 1e9', sh.tokens > 11_000_000 && sh.supply === 10n ** 27n);
  const head = Number(BigInt(await rpc('eth_blockNumber', [])));
  const logs = await rpc('eth_getLogs', [burnLogsFilter(head - 40000, head)]);
  const src = burnSources(logs);
  console.log('LIVE last 40k blocks', JSON.stringify(src, (k, v) => typeof v === 'bigint' ? (v / E18).toString() : v));
  t('LIVE: the pool hook cut appears among recent burns', src.sources.some((x) => x.label === 'trades (pool hook cut)'));
}
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
process.exitCode = ko ? 1 : 0;
