/* The real memory circuit of the fly (hemibrain v1.2, Janelia FlyEM, CC BY 4.0) living READ-ONLY on a tokenized stock's real trades.
 * The brain and the protocol live in fly-core.js, shared with the server; this file only shows them: the map, the log, the gauges, the
 * beats, the memory kept in this browser, and the server's shared fly.
 * Price: /api/fly/price/<address> (the stock's Aerodrome pool, slot0, 24/7). Trades: /api/activite/<address> (Transfer logs, each
 * confirmed by its transaction's signer). Reference: /api/actions/reference/ (Chainlink) shown, never fed. Shared fly: /api/fly/state. */
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { createFly, createSession, foreseeNext, decide } from './fly-core.js';
import { checkPlanCalls } from './fly-guard.js';
import { USDC_BASE, displayShort } from './frais-creation.js';
import { selecteur } from './keccak.js';

/* Order: 24 h volume measured by Coinbase search_tokens on 2026-11-07 (mesures/coinbase-actions-20261107.json). ADDRESSES come from the
 * registry, never from here. */
const ORDER = ['SNDKc', 'MSTRc', 'SPCXc', 'NVDAc', 'AMZNc', 'GOOGLc', 'METAc', 'MSFTc', 'TSLAc', 'MUc', 'AAPLc', 'PLTRc'];
/* then every other stock of the measured pool table with at least 10,000 USDC in its pool (the liquidity rule of misables.js), deepest
 *   first: a near-empty pool would give absurd orders */
const LIQUIDITE_MIN_USDC = 10000;
const STOCKS = [...ORDER.map((s) => [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === s)).filter(Boolean),
  ...[...POOLS_ACTIONS_AERODROME.entries()].filter(([, t]) => !ORDER.includes(t.symbole) && t.usdcMesure >= LIQUIDITE_MIN_USDC).sort((a, b) => b[1].usdcMesure - a[1].usdcMesure)]
  .map(([address, t]) => ({ address, symbol: t.symbole }));

const COLOR = { PN: '#4fd1c5', KC: '#f6c453', MBON: '#f472b6', DAN: '#a78bfa', APL: '#f87171' };
const FAMILIES = ['PN', 'KC', 'MBON', 'DAN', 'APL'];
const POLL_MS = 30000, REF_MS = 60000, SHARED_MS = 20000;

const canvas = document.getElementById('canvas'), ctx = canvas.getContext('2d');
const spark = document.getElementById('spark'), sctx = spark.getContext('2d');
const $ = (id) => document.getElementById(id);
const fmt = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x, d = 2) => (x > 0 ? '+' : x < 0 ? '−' : '') + fmt(Math.abs(x) * 100, d) + '%';
const clock = (t = Date.now()) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const mixText = (mix) => Object.entries(mix).filter(([, v]) => v > 0).map(([k, v]) => `${k} $${fmt(v, 0)}`).join(', ') || 'nothing';
/* text from the server, a node or storage, before it enters HTML (security review H2) */
const esc = (x) => String(x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SAY = { approach: 'leans toward it', avoid: 'pulls away from it', undecided: 'is undecided', quiet: 'barely reacts' };

let fly = null, shadow = null, session = null, N = [], act = new Float64Array(0);
let current = STOCKS[0], lastPrice = null, history = [], timer = null, refTimer = null;

function log(text, kind, link) {
  const p = document.createElement('p'); if (kind) p.className = kind;
  p.textContent = clock() + ' · ' + text;
  if (link) { const a = document.createElement('a'); a.href = link.href; a.textContent = link.text; a.target = '_blank'; a.rel = 'noopener'; p.append(' · ', a); }
  $('log').prepend(p);
  while ($('log').children.length > 80) $('log').lastChild.remove();
}

/* Deterministic layout: PNs left, Kenyon cells centre, MBONs right (approach side above, avoid side below), dopamine arc, APL at the core. */
function place(neurons) {
  const W = canvas.width, H = canvas.height, by = {};
  for (const n of neurons) (by[n.family] = by[n.family] || []).push(n);
  const cloud = (list, cx, cy, rx, ry) => list.forEach((n, i) => {
    const t = i * 2.399963, r = Math.sqrt((i + 0.5) / list.length);
    n.x = cx + rx * r * Math.cos(t); n.y = cy + ry * r * Math.sin(t);
  });
  cloud(by.PN || [], W * 0.15, H * 0.42, W * 0.11, H * 0.30);
  cloud(by.KC || [], W * 0.50, H * 0.36, W * 0.15, H * 0.24);
  const mb = by.MBON || [];
  cloud(mb.filter((n) => n.valence === 'approach'), W * 0.86, H * 0.25, W * 0.06, H * 0.13);
  cloud(mb.filter((n) => n.valence !== 'approach'), W * 0.86, H * 0.58, W * 0.06, H * 0.13);
  (by.DAN || []).forEach((n, i, l) => { const t = Math.PI * (0.12 + 0.76 * (i / Math.max(1, l.length - 1))), j = (i % 5) * 9;
    n.x = W * 0.5 - (W * 0.38 + j) * Math.cos(t); n.y = H * 0.50 + (H * 0.36 + j) * Math.sin(t) * 0.9; });
  (by.APL || []).forEach((n) => { n.x = W * 0.50; n.y = H * 0.70; });
}

/* ── EVENTS from fly-core, shown. The shared fly's events (server) use the same shapes. ── */
let flash = [];
function showTrace(e, kind) {
  const until = Date.now() + 6000; flash = e.top.map(({ i, j }) => [i, j, until]);
  if (!e.weakened) { log('… no synapse changed enough to show (below 0.2%)', kind); return; }
  log(`… ${e.weakened} synapses weakened (${Object.entries(e.sides).map(([s, c]) => c + ' ' + s + ' side').join(', ')}); strongest: `
    + e.top.slice(0, 3).map(({ i, j, d }) => `${N[i].type} #${N[i].id} → ${N[j].type} ${pct(d, 1)}`).join(' · '), kind);
}
function show(e, symbol) {
  const kind = e.sim ? 'sim' : 'live';
  if (e.type === 'skipped') log(`${e.n} recent transactions already on chain: the fly starts smelling from the next ones`);
  else if (e.type === 'tx') log(`${e.kind}: ${fmt(e.units, 4)} ${symbol} ($${fmt(e.usd, 0)})`, 'live', { href: 'https://basescan.org/tx/' + e.tx, text: 'tx ' + e.tx.slice(0, 10) + '…' });
  else if (e.type === 'predict') log(`smells ${mixText(e.mix)} → the circuit ${SAY[e.word]} (approach ${fmt(e.ap * 100, 1)}% / avoid ${fmt(e.av * 100, 1)}% of a naive fly)${e.sim ? '' : ' — prediction for the next window'}`, kind);
  else if (e.type === 'taught') { log(`taught: ${mixText(e.mix)} was followed by ${pct(e.move, 3)} → ${e.move > 0 ? 'reward (PAM)' : 'punishment (PPL1)'} dopamine ${fmt(e.strength * 100, 0)}%`, kind); showTrace(e, kind); }
  else if (e.type === 'verdict') log(`consequence: predicted ${e.prediction}, the price moved ${pct(e.move, 3)} → ${e.kind === 'flat' ? 'flat, no verdict' : e.kind === 'consistent' ? 'it matched' : 'it went the other way'}`, 'verdict');
}
/* ── THE FLY TRADER: its decision on the live smell, said in full. Paper only, never an order, never advice. ── */
const ACT = { buy: 'BUY', sell: 'SELL', hold: 'HOLD', stay_out: 'STAY OUT' };
let lastDecision = null, simOnLive = false;
function renderDecision(e) {
  lastDecision = e;
  const el = $('verdict'); el.textContent = (e.sim ? 'SIMULATED · ' : '') + ACT[e.action];
  el.className = 'decision ' + e.action; void el.offsetWidth; el.classList.add('flash');
  const n = Object.values(e.mix).filter((v) => v > 0).length;
  /* who taught it: real windows, or (for a simulation) the move just injected — said as it is */
  const fell = e.sim ? 'the injected move was a <b>fall</b> (punishment dopamine), on top of what real windows taught it' : 'windows that smelled like this were followed by <b>falls</b> (punishment dopamine)';
  const rose = e.sim ? 'the injected move was a <b>rise</b> (reward dopamine), on top of what real windows taught it' : 'windows that smelled like this were followed by <b>rises</b> (reward dopamine)';
  const memory = Math.abs(e.ap - e.av) < 0.005
    ? (e.ap > 0.995 ? 'It has learned nothing yet about this smell: both sides answer like a naive fly.'
      : `It has learned this smell both ways about equally (approach ${fmt(e.ap * 100, 1)}%, avoid ${fmt(e.av * 100, 1)}% of a naive fly): rises and falls cancel out, no pull either way.`)
    : e.ap < e.av ? `Its approach synapses for this smell are weaker (<b>${fmt(e.ap * 100, 1)}%</b> left, avoid side ${fmt(e.av * 100, 1)}%): ${fell}.`
      : `Its avoid synapses for this smell are weaker (<b>${fmt(e.av * 100, 1)}%</b> left, approach side ${fmt(e.ap * 100, 1)}%): ${rose}.`;
  const rule = e.action === 'buy' ? 'It was out of the stock and is drawn to this smell: <b>it buys</b> (on paper).'
    : e.action === 'sell' ? 'It held the stock and is repelled by this smell: <b>it sells</b> (on paper).'
      : e.action === 'hold' ? 'It holds the stock and this smell does not repel it: <b>it keeps it</b>.'
        : 'It is out, and this smell does not draw it in: <b>it stays out</b>.';
  $('why').innerHTML = `${e.sim ? (simOnLive ? '<b>Simulation</b> on the smell of the last real window. ' : '<b>Simulation</b> on a stand-in smell (no real trade smelled yet). ') : ''}`
    + `<b>Smelled</b>${e.sim && !simOnLive ? '' : ' in the last window'}: ${mixText(e.mix)} (${n} kind${n > 1 ? 's' : ''} of trade). `
    + `${memory} ${rule} <span class="state">${auto.s && auto.s.running ? 'Its own wallet acts on this decision with real money (card below); not advice.' : 'Paper only, not advice.'} Judged on the next window's price.</span>`;
}

/* ── TRADE FOR REAL: the user's own wallet signs each order the fly proposes. The fly NEVER signs, nothing is sent without a click.
 * The order is built and simulated by the app's own planner (/api/rails/plan, the same one as the control panel): approvals first,
 * then the swap, re-planned after the approvals. BUY spends the user's budget in USDC; SELL sells the whole stock balance read on chain.
 * ⛔ A simulated decision never proposes a real order. "Stop" ends proposals at once. ── */
const live = { account: null, stopped: false, plan: null, action: null, busy: false, decimals: null };
const eth = () => (typeof window !== 'undefined' ? window.ethereum : null);
function liveSay(t) { $('liveState').textContent = t; }
function liveNote(html) { const p = document.createElement('div'); p.innerHTML = clock() + ' · ' + html; $('liveLog').prepend(p); }
async function connect() {
  if (!eth()) { liveSay('No browser wallet found on this page (install one, or open the page inside your wallet).'); return; }
  try {
    const accs = await eth().request({ method: 'eth_requestAccounts' });
    const chain = await eth().request({ method: 'eth_chainId' });
    if (String(chain).toLowerCase() !== '0x2105') { liveSay('Your wallet is not on Base (chain ' + chain + '). Switch to Base and connect again.'); return; }
    live.account = String(accs[0] || '').toLowerCase(); live.stopped = false;
    liveSay('Connected: ' + displayShort(live.account) + ' on Base. The fly will propose an order at its next BUY or SELL.');
  } catch (err) { liveSay('Connection refused: ' + String((err && err.message) || err).slice(0, 120)); }
}
async function stockBalance() {
  const data = selecteur('balanceOf(address)') + live.account.slice(2).padStart(64, '0');
  return BigInt(await eth().request({ method: 'eth_call', params: [{ to: current.address, data }, 'latest'] }));
}
async function proposeLive(e) {
  if (e.sim || live.stopped || !live.account || (e.action !== 'buy' && e.action !== 'sell')) return;
  live.action = e.action; live.plan = null; $('sign').disabled = true;
  try {
    let de, vers, montant;
    if (e.action === 'buy') {
      const usdc = Math.floor(Number($('budget').value) * 1e6);
      if (!(usdc >= 1e6)) { $('livePlan').textContent = 'Set a budget of at least 1 USDC.'; return; }
      de = USDC_BASE; vers = current.address; montant = String(usdc);
    } else {
      const bal = await stockBalance();
      if (bal <= 0n) { $('livePlan').innerHTML = 'The fly decided <b>SELL</b>, but this wallet holds no ' + current.symbol + ': nothing to sell.'; return; }
      de = current.address; vers = USDC_BASE; montant = bal.toString();
    }
    const q = new URLSearchParams({ de, vers, montant, compte: live.account });
    const r = await fetch('/api/rails/plan?' + q, { cache: 'no-store' }).then((x) => x.json());
    live.plan = { r, de, vers, montant, action: e.action };
    const s = r.resume || {};
    const dPay = e.action === 'buy' ? 6 : (live.decimals ?? 8), dGet = e.action === 'buy' ? (live.decimals ?? 8) : 6;
    const units = (v, d) => v == null ? '?' : fmt(Number(BigInt(v)) / 10 ** d, d > 6 ? 6 : 2);
    $('livePlan').innerHTML = `<b>The fly's live order: ${ACT[e.action]} ${current.symbol}</b> · pay ${units(s.paye, dPay)} ${e.action === 'buy' ? 'USDC' : current.symbol}, `
      + `receive at least ${units(s.recoitAuMoins, dGet)} ${e.action === 'buy' ? current.symbol : 'USDC'} (quote ${units(s.quote, dGet)}), fee ${esc(s.fraisBps ?? '?')} bps, price impact ${esc(s.impactBps ?? '?')} bps, venue ${esc(s.venue || '?')}. `
      + `Plan state: <b>${esc(r.etat)}</b>${r.pourquoi ? ' — ' + esc(String(r.pourquoi).slice(0, 140)) : ''}${r.suite ? ' — ' + esc(r.suite) : ''}.`;
    $('sign').disabled = !(r.ok && Array.isArray(r.aSigner) && r.aSigner.length);
  } catch (err) { $('livePlan').textContent = 'The order could not be built: ' + String((err && err.message) || err).slice(0, 140); }
}
async function signLive() {
  if (live.busy || !live.plan || !live.account || live.stopped) return;
  if (!$('risk').checked) { liveSay('Tick the risk box first: you can lose the money you trade.'); return; }
  live.busy = true; $('sign').disabled = true;
  try {
    /* re-plan right before signing: prices move, and approvals change what is returned */
    const q = new URLSearchParams({ de: live.plan.de, vers: live.plan.vers, montant: live.plan.montant, compte: live.account });
    let r = await fetch('/api/rails/plan?' + q, { cache: 'no-store' }).then((x) => x.json());
    for (let round = 0; round < 2 && r && r.ok; round++) {
      const calls = r.aSigner || [];
      if (r.atomique && calls.length > 1) {
        const id = await eth().request({ method: 'wallet_sendCalls', params: [{ version: '1.0', chainId: '0x2105', from: live.account, calls: calls.map((c) => ({ to: c.to, data: c.data, value: c.value })) }] });
        liveNote('batch sent: ' + esc(String(id && (id.id || id)).slice(0, 20)) + '…');
      } else {
        for (const c of calls) {
          const h = await eth().request({ method: 'eth_sendTransaction', params: [{ from: live.account, to: c.to, data: c.data, value: c.value }] });
          liveNote(`${esc(c.nom || c.role || 'transaction')} sent · ` + (/^0x[0-9a-fA-F]{64}$/.test(String(h)) ? `<a href="https://basescan.org/tx/${h}" target="_blank" rel="noopener">tx ${String(h).slice(0, 10)}…</a>` : esc(String(h).slice(0, 20))));
          await waitReceipt(h);
        }
      }
      if (r.etat !== 'APPROBATIONS') break;
      r = await fetch('/api/rails/plan?' + q, { cache: 'no-store' }).then((x) => x.json()); /* approvals done: now the swap */
    }
    liveSay(r && r.ok ? 'Done. Check the transactions above on Basescan.' : 'Stopped: ' + String((r && r.pourquoi) || 'plan refused').slice(0, 140));
  } catch (err) { liveSay('Not sent: ' + String((err && err.message) || err).slice(0, 140)); }
  finally { live.busy = false; live.plan = null; }
}
async function waitReceipt(h) {
  for (let k = 0; k < 60; k++) {
    const rc = await eth().request({ method: 'eth_getTransactionReceipt', params: [h] }).catch(() => null);
    if (rc) { if (rc.status !== '0x1') throw new Error('transaction failed on chain (' + h.slice(0, 10) + '…)'); return rc; }
    await new Promise((o) => setTimeout(o, 2000));
  }
  throw new Error('no receipt after 2 minutes (' + h.slice(0, 10) + '…): check it on Basescan before trying again');
}
function stopFly() { live.stopped = true; live.plan = null; $('sign').disabled = true; $('livePlan').textContent = ''; liveSay('The fly is stopped: it proposes no order. Connect again to resume.'); }

/* ── THE FLY ALONE (CLAUDE.md exception decided by Phil 2026-11-08): the user signs ONE transaction that funds the fly's own wallet;
 * after it, the fly trades that budget on its own, on its live (never simulated) decisions, within the user's caps; Stop halts it,
 * Withdraw all sends everything back to the wallet that funded it. The key is made and kept ONLY in this browser (fly-wallet.js,
 * @noble). The server plans each order, but the fly signs a call only if fly-guard.js (here, in the browser) finds it is an exact
 * approval, the app fee, or a swap that pays the fly itself and names no unknown address (security review 2026-11-08, H1). Text from
 * the server or a node is never written as HTML (H2). The money path was proven on a fork through the relay (18/0); the stock leg
 * cannot run on a fork (B20 precompile) and is NOT proven until a real small trade. ── */
const AUTO_KEY = 'fly-auto-wallet-v1', AUTO_GAS_ETH = 200000000000000n /* 0.0002 ETH */, AUTO_ETH_KEEP = 5000000000000n /* L1 fee dust */;
const ADDR_RE = /^0x[0-9a-f]{40}$/, HASH_RE = /^0x[0-9a-f]{64}$/;
const auto = { W: null, s: null, busy: false };
function autoLoad() {
  try {
    const x = JSON.parse(localStorage.getItem(AUTO_KEY) || 'null');
    if (!x || !/^0x[0-9a-f]{64}$/.test(x.key) || !ADDR_RE.test(x.address)) return null;
    /* everything else is re-checked: it becomes a destination (owner) or a token to withdraw (traded) */
    x.owner = ADDR_RE.test(String(x.owner)) ? x.owner : null;
    x.traded = Array.isArray(x.traded) ? x.traded.filter((a) => STOCKS.some((s) => s.address === a)) : [];
    x.today = Number.isInteger(x.today) && x.today >= 0 ? x.today : 0; x.running = x.running === true; x.day = String(x.day || '').slice(0, 10);
    return x;
  } catch (_) { return null; }
}
function autoSave() { try { localStorage.setItem(AUTO_KEY, JSON.stringify(auto.s)); return JSON.parse(localStorage.getItem(AUTO_KEY)).key === auto.s.key; } catch (_) { return false; } }
/* several tabs share one key: re-read the stored state before acting, so a Stop pressed in another tab is obeyed (review M2) */
function autoRefresh() { const x = autoLoad(); if (x && auto.s && x.key === auto.s.key) auto.s = x; return auto.s; }
async function flyWallet() { if (!auto.W) auto.W = await import('./fly-wallet.js'); return auto.W; }
function autoSay(t) { $('autoState').textContent = t; }
/* a log line from plain parts: strings are TEXT, { tx } a Basescan link (only a well-formed hash), { b } bold text */
function autoNote(...parts) {
  const p = document.createElement('div'); p.append(clock() + ' · ');
  for (const x of parts) {
    if (x && x.tx && HASH_RE.test(String(x.tx).toLowerCase())) { const a = document.createElement('a'); a.href = 'https://basescan.org/tx/' + x.tx; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'tx ' + x.tx.slice(0, 10) + '…'; p.append(a); }
    else if (x && x.b != null) { const b = document.createElement('b'); b.textContent = String(x.b); p.append(b); }
    else p.append(String(x));
  }
  $('autoLog').prepend(p);
}
const usd6 = (x) => fmt(Number(BigInt(x)) / 1e6, 2);
function autoRender() {
  const s = auto.s, el = $('autoWallet');
  el.textContent = '';
  if (!s) el.textContent = 'No fly wallet in this browser yet.';
  else {
    el.append('Fly wallet ', Object.assign(document.createElement('b'), { textContent: displayShort(s.address) }), ' (');
    el.append(Object.assign(document.createElement('a'), { href: 'https://basescan.org/address/' + s.address, target: '_blank', rel: 'noopener', textContent: 'Basescan' }));
    el.append(`) · funded by ${s.owner ? displayShort(s.owner) : 'nobody yet'} · ${s.running ? 'TRADING ALONE' : 'stopped'} · ${s.today} trade${s.today === 1 ? '' : 's'} today`);
  }
  $('autoCreate').disabled = !!s; $('autoFund').disabled = !s; $('autoStart').disabled = !s || !s.owner || s.running;
  $('autoWithdraw').disabled = !s || !s.owner; $('autoExport').disabled = !s;
  $('inject').disabled = !!(s && s.running);
}
async function autoAccount(token) {
  const r = await fetch('/api/fly/account/' + auto.s.address + (token ? '?token=' + token : ''), { cache: 'no-store' }).then((x) => x.json());
  if (!r || !r.ok) throw new Error('balances not read: ' + String((r && r.why) || 'no answer').slice(0, 120));
  return r;
}
const postJson = (u, b) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json());
async function autoCreate() {
  if (!$('autoRisk').checked) { autoSay('Tick the box first: you can lose this money, and the key lives only in this browser.'); return; }
  if (auto.s) return;
  try {
    const W = await flyWallet(), key = W.newKeyHex();
    auto.s = { v: 1, key, address: W.addressOf(key), owner: null, running: false, day: '', today: 0, traded: [], created: Date.now() };
    /* a key this browser cannot keep would lose the money sent to it: then no wallet at all */
    if (!autoSave()) { auto.s = null; autoSay('This browser refuses to keep data for this site (private window?). No fly wallet was created: its key could not be kept.'); return; }
    autoNote('fly wallet created in this browser: ' + displayShort(auto.s.address) + '. Nothing is in it yet.');
  } catch (e) { autoSay('The fly wallet could not be created: ' + String((e && e.message) || e).slice(0, 120)); }
  autoRender();
}
async function autoFund() {
  if (!auto.s || !$('autoRisk').checked) { autoSay('Tick the box first.'); return; }
  if (!live.account) await connect();
  if (!live.account) { autoSay('Connect your wallet first (button above).'); return; }
  /* the network is read again right before sending: a wallet switched to another chain since "connect" would send there (review L1) */
  const chain = String(await eth().request({ method: 'eth_chainId' }).catch(() => '')).toLowerCase();
  if (chain !== '0x2105') { autoSay('Your wallet is not on Base right now (chain ' + chain + '): nothing sent. Switch to Base and press again.'); return; }
  const payer = live.account.toLowerCase();
  const usdc = BigInt(Math.round(Math.min(100, Math.max(1, Number($('autoBudget').value) || 0)) * 1e6));
  const word = (a) => a.slice(2).toLowerCase().padStart(64, '0');
  const calls = [{ to: USDC_BASE, data: selecteur('transfer(address,uint256)') + word(auto.s.address) + usdc.toString(16).padStart(64, '0'), value: '0x0' },
    { to: auto.s.address, data: '0x', value: '0x' + AUTO_GAS_ETH.toString(16) }];
  try {
    let batched = false;
    try {
      const id = await eth().request({ method: 'wallet_sendCalls', params: [{ version: '2.0.0', chainId: '0x2105', from: payer, atomicRequired: true, calls }] });
      batched = true; autoNote(`funding sent in ONE signature: ${usd6(usdc)} USDC + 0.0002 ETH for gas (batch ${String(id && (id.id || id)).slice(0, 16)}…)`);
    } catch (err) {
      /* only a wallet that does not know the method gets the two-signature path: any other error may mean the batch went out */
      if (!(err && (err.code === 4200 || err.code === -32601 || /not supported|does not exist|unsupported/i.test(String(err.message))))) throw err;
    }
    if (!batched) {
      autoNote('your wallet does not batch calls: two signatures instead (USDC, then the gas ETH)');
      for (const c of calls) { const h = await eth().request({ method: 'eth_sendTransaction', params: [{ from: payer, ...c }] }); autoNote('sent ', { tx: h }); await waitReceipt(h); }
    }
    /* the owner (where Withdraw sends) is the wallet that paid, set only once the funding went out (review L2) */
    autoRefresh(); auto.s.owner = payer; autoSave(); autoRender();
    autoSay('Funded. Its balance shows below once the transaction is mined; then press "Let it trade alone".');
    setTimeout(autoShowBalance, 8000);
  } catch (err) { autoSay('Not funded: ' + String((err && err.message) || err).slice(0, 140)); }
}
async function autoShowBalance() {
  if (!auto.s) return;
  try { const a = await autoAccount(current.address);
    autoSay(`In the fly's wallet: ${usd6(a.usdc)} USDC · ${current.symbol} ${a.stock == null ? '?' : fmt(Number(BigInt(a.stock)) / 10 ** (live.decimals ?? 8), 6)} · ${fmt(Number(BigInt(a.eth)) / 1e18, 6)} ETH for gas (block ${a.block}).`);
  } catch (e) { autoSay(String(e.message)); }
}
/* one call, signed by the fly's key and relayed; waits for its receipt (status 0x1 or it throws). `sweep`: send all the ETH left,
 * computed with the SAME gas and fee as the signature (review M4). */
async function flySend(c, { sweep = false } = {}) {
  const W = await flyWallet(), a = await autoAccount();
  const g = await postJson('/api/fly/estimate', { from: auto.s.address, to: c.to, data: c.data, value: sweep ? '0x1' : (c.value || '0x0') });
  if (!g || !g.ok) throw new Error('the chain refuses this call (gas estimate): ' + String((g && g.why) || '').slice(0, 120));
  const gas = BigInt(g.gas) * 13n / 10n, prio = 1000000n, maxFee = BigInt(a.baseFeePerGas) * 2n + prio;
  const value = sweep ? BigInt(a.eth) - gas * maxFee - AUTO_ETH_KEEP : BigInt(c.value || '0x0');
  if (sweep && value <= 0n) return null;
  if (BigInt(a.eth) < gas * maxFee + value + (sweep ? 0n : AUTO_ETH_KEEP)) throw new Error('out of ETH for gas: the fly stops (send it a little ETH, or withdraw)');
  const s = W.signTx({ chainId: 8453, nonce: BigInt(a.nonce), maxPriorityFeePerGas: prio, maxFeePerGas: maxFee, gas, to: c.to, value, data: c.data || '0x' }, auto.s.key);
  const r = await postJson('/api/fly/relay', { raw: s.raw });
  if (!r || !r.ok) throw new Error('not sent: ' + String((r && r.why) || 'no answer').slice(0, 140));
  if (String(r.hash).toLowerCase() !== s.hash.toLowerCase()) throw new Error('the relay answered another transaction hash: stopped');
  for (let k = 0; k < 60; k++) {
    const q = await fetch('/api/fly/receipt/' + s.hash, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
    if (q && q.ok && q.receipt) { if (q.receipt.status !== '0x1') throw new Error('failed on chain: ' + s.hash); return { hash: s.hash, value }; }
    await new Promise((o) => setTimeout(o, 2000));
  }
  throw new Error('no receipt after 2 minutes: check ' + s.hash + ' on Basescan before anything else');
}
/* one tab trades at a time (Web Locks where the browser has them) */
const withLock = (fn) => (navigator.locks ? navigator.locks.request('fly-auto', { ifAvailable: true }, (l) => (l ? fn() : 'locked')) : fn());
async function autoTrade(e) {
  if (!auto.s || e.sim || e.type !== 'decision') return;
  autoRefresh();
  const s = auto.s;
  if (!s.running) return;
  if (auto.busy) { autoNote(`decided ${ACT[e.action]} while a trade was still in flight: this decision is skipped`); return; }
  auto.busy = true;
  const stock = current;
  try {
    const done = await withLock(async () => {
      const today = new Date().toISOString().slice(0, 10);
      if (s.day !== today) { s.day = today; s.today = 0; }
      const maxDay = Math.min(50, Math.max(1, Math.floor(Number($('autoDay').value) || 0)));
      const a = await autoAccount(stock.address), held = a.stock ? BigInt(a.stock) : 0n;
      /* the REAL position decides, not the paper book: after a reload or a stock switch the paper book starts out (review L3) */
      const action = decide(e.word, held > 0n ? 1 : 0);
      if (action !== 'buy' && action !== 'sell') return;
      if (s.today >= maxDay) { autoNote(`decided ${ACT[action]}, but today's cap of ${maxDay} trades is reached: nothing sent`); return; }
      let de, vers, montant;
      if (action === 'buy') {
        const cap = BigInt(Math.round(Math.min(100, Math.max(0.5, Number($('autoCap').value) || 0)) * 1e6)), have = BigInt(a.usdc);
        const amt = have < cap ? have : cap;
        if (amt < 100000n) { autoNote(`decided BUY ${stock.symbol}, but it holds ${usd6(have)} USDC: nothing to buy with`); return; }
        de = USDC_BASE; vers = stock.address; montant = amt.toString();
      } else { de = stock.address; vers = USDC_BASE; montant = held.toString(); }
      const q = new URLSearchParams({ de, vers, montant, compte: s.address });
      let p = await fetch('/api/rails/plan?' + q, { cache: 'no-store' }).then((x) => x.json());
      for (let round = 0; round < 3; round++) {
        if (!p || !p.ok) { autoNote(`decided ${ACT[action]} ${stock.symbol}: no order (${String((p && p.etat) || '?')}${p && p.pourquoi ? ' — ' + String(p.pourquoi).slice(0, 120) : ''})`); return; }
        if (!p.resume || String(p.resume.paye) !== montant) throw new Error('the plan does not pay the amount asked (' + String(p.resume && p.resume.paye) + ' vs ' + montant + ')');
        /* ⛔ H1: nothing is signed that the browser's own guard does not accept */
        const refused = checkPlanCalls({ calls: p.aSigner, fly: s.address, pay: de, receive: vers, amount: montant, nowSec: Math.floor(Date.now() / 1000) });
        if (refused) throw new Error('the fly refused to sign: ' + refused.why);
        for (const c of p.aSigner) {
          if (!autoRefresh().running) { autoNote('stopped before sending: nothing more goes out'); return; }
          const r = await flySend(c);
          autoNote(`${ACT[action]} ${stock.symbol} · ${String(c.nom || c.role || 'call').slice(0, 80)} mined · `, { tx: r.hash });
        }
        if (p.etat !== 'APPROBATIONS') break;
        p = await fetch('/api/rails/plan?' + q, { cache: 'no-store' }).then((x) => x.json());
      }
      autoRefresh(); auto.s.today++; if (!auto.s.traded.includes(stock.address)) auto.s.traded.push(stock.address); autoSave();
      autoNote({ b: `${ACT[action]} ${stock.symbol} done` }, ` on its own (${auto.s.today}/${maxDay} today). The app's interface fee was in the plan (${String((p.resume && p.resume.fraisBps) || '?')} bps); see Basescan.`);
    });
    if (done === 'locked') autoNote('another tab of this page is trading with the same fly: this tab does nothing');
  } catch (err) {
    autoNote({ b: 'error, the fly stops' }, ': ' + String((err && err.message) || err).slice(0, 200));
    autoRefresh(); auto.s.running = false; autoSave();
  } finally { auto.busy = false; autoRender(); autoShowBalance(); }
}
function autoStart() { if (!auto.s || !auto.s.owner) return; if (!$('autoRisk').checked) { autoSay('Tick the box first.'); return; }
  autoRefresh(); auto.s.running = true; autoSave(); autoRender();
  autoNote(`trading alone on ${current.symbol}, on its live decisions only, max ${$('autoCap').value} USDC per buy, ${$('autoDay').value} trades a day. Stop halts it.`); }
function autoStop() { if (!auto.s) return; autoRefresh(); auto.s.running = false; autoSave(); autoRender(); autoNote({ b: 'stopped' }, ': it sends nothing more' + (auto.busy ? ' after the call already in flight' : '') + '.'); }
async function autoWithdraw() {
  if (!auto.s || !auto.s.owner) return;
  autoStop();
  if (!confirm('Send everything in the fly wallet back to ' + auto.s.owner + ' (the wallet that funded it)?')) return;
  /* a trade in flight finishes first, so its result is withdrawn too (review M4) */
  for (let k = 0; k < 90 && auto.busy; k++) await new Promise((o) => setTimeout(o, 2000));
  if (auto.busy) { autoNote('a trade is still in flight after 3 minutes: withdraw not started, press again later'); return; }
  const word = (a) => a.slice(2).toLowerCase().padStart(64, '0'), T = selecteur('transfer(address,uint256)'), to = auto.s.owner;
  try {
    /* each stock on its own: one balance that cannot be read must not keep the USDC and the ETH from coming back */
    const unread = [];
    for (const tok of [...new Set([...auto.s.traded, ...STOCKS.map((x) => x.address)])].slice(0, 40)) {
      let a = null;
      try { a = await autoAccount(tok); } catch (_) { unread.push((STOCKS.find((x) => x.address === tok) || {}).symbol || displayShort(tok)); }
      if (a && a.stock && BigInt(a.stock) > 0n) autoNote('stock back: ', { tx: (await flySend({ to: tok, data: T + word(to) + BigInt(a.stock).toString(16).padStart(64, '0'), value: '0x0' })).hash });
      await new Promise((o) => setTimeout(o, 2100)); /* the server's per-minute budget for balance reads */
    }
    if (unread.length) autoNote({ b: 'not read' }, ': ' + unread.join(', ') + ' — their balance could not be read this time; press Withdraw again later for them.');
    const u = await autoAccount();
    if (BigInt(u.usdc) > 0n) autoNote(usd6(u.usdc) + ' USDC back: ', { tx: (await flySend({ to: USDC_BASE, data: T + word(to) + BigInt(u.usdc).toString(16).padStart(64, '0'), value: '0x0' })).hash });
    const r = await flySend({ to, data: '0x' }, { sweep: true });
    if (r) autoNote(fmt(Number(r.value) / 1e18, 6) + ' ETH back: ', { tx: r.hash });
    autoNote({ b: 'withdrawn' }, '. A dust of ETH (about 0.000005) stays for the network fee of that last send.');
  } catch (err) { autoNote({ b: 'withdraw stopped' }, ': ' + String((err && err.message) || err).slice(0, 200) + ' — what was sent is above; press again to retry.'); }
  autoShowBalance();
}
function autoExport() {
  if (!auto.s || !confirm('Show the fly wallet key? Anyone who sees it can take the money in it. Copy it somewhere only you can read.')) return;
  autoSay('Key (keep it secret, hidden again in 60 s): ' + auto.s.key);
  setTimeout(() => { if ($('autoState').textContent.includes(auto.s.key)) autoSay('Key hidden again.'); }, 60000);
}
function autoWire() {
  auto.s = autoLoad();
  if (auto.s && auto.s.running) { auto.s.running = false; autoSave(); autoNote('page reopened: the fly was trading alone, it is now ', { b: 'stopped' }, ' until you press "Let it trade alone" again.'); }
  /* another tab pressed Stop (or started it): obey at once */
  window.addEventListener('storage', (ev) => { if (ev.key === AUTO_KEY) { const x = autoLoad(); if (x && auto.s && x.key === auto.s.key) { auto.s = x; autoRender(); } } });
  $('autoCreate').addEventListener('click', autoCreate); $('autoFund').addEventListener('click', autoFund); $('autoStart').addEventListener('click', autoStart);
  $('autoStop').addEventListener('click', autoStop); $('autoWithdraw').addEventListener('click', autoWithdraw); $('autoExport').addEventListener('click', autoExport);
  autoRender(); if (auto.s) autoShowBalance();
}

function onEvent(e) {
  show(e, current.symbol);
  if (e.type === 'tx') ripple(e.kind, e.usd);
  if (e.type === 'decision') { renderDecision(e); proposeLive(e); autoTrade(e); if (!e.sim) { thoughts.push({ ...e, at: Date.now() }); if (thoughts.length > 6) thoughts.shift(); }
    /* after the session has recorded this decision (its callback runs right after the event) */
    setTimeout(renderThoughts, 0); }
  if (e.type === 'verdict' || e.type === 'taught') { renderTally(); }
  if (e.type === 'taught' && !e.sim) saveMemory();
}

/* ── ITS THOUGHTS: before (the live decisions, with the synapses that carried them), now, and next (computed on a shadow fly). ── */
const thoughts = [];
function synapseChips(path, limit = 3) {
  return '<div class="walk">' + path.slice(0, limit).map(({ i, j, side, m }) => `<button data-walk="${i}" data-to="${j}" style="border-color:${side === 'approach' ? '#4ade80' : '#f87171'}" title="Kenyon cell #${N[i].id} (smell memory) → output ${esc(N[j].type)} (${side}); this synapse keeps ${fmt(m * 100, 1)}% of the strength it had in a newborn fly">`
    + `smell cell → “${side === 'approach' ? 'go toward' : 'keep away'}” output · ${fmt(m * 100, 0)}% strength</button>`).join('') + '</div>';
}
function thoughtLine(when, e, extra = '') {
  return `<div class="th"><div class="when">${when}</div><span class="act ${e.action}">${ACT[e.action]}</span> · ${SAY[e.word]} (pull toward ${fmt(e.ap * 100, 1)}% · push away ${fmt(e.av * 100, 1)}%)${extra}${e.path && e.path.length ? synapseChips(e.path) : ''}</div>`;
}
function renderThoughts() {
  if (!fly || !session) return;
  const past = thoughts.slice(0, -1).reverse(), now = thoughts[thoughts.length - 1];
  let html = past.length ? past.map((e) => thoughtLine('before · ' + clock(e.at), e, ' · smelled ' + mixText(e.mix))).join('') : '<div class="th"><div class="when">before</div><span class="state">no earlier live decision in this visit</span></div>';
  html += now ? thoughtLine('now · ' + clock(now.at), now, ' · smelled ' + mixText(now.mix)) : '<div class="th"><div class="when">now</div><span class="state">waiting for a window with real trades</span></div>';
  const fc = foreseeNext(shadow, fly, session);
  if (!fc.exact) html += `<div class="th"><div class="when">next</div><span class="state">${fc.why || 'the fly is mid-thought: the forecast waits until it rests'}</span></div>`;
  else {
    const learn = fc.learnsFrom ? 'it will first learn from the last smell (' + mixText(fc.learnsFrom) + ') with that move' : 'the last window had no trade: nothing to learn';
    html += `<div class="th"><div class="when">next · if the next window smells like the last real trades (${mixText(fc.nextMix)}) · ${fc.pos ? 'holding' : 'out of'} the stock</div><span class="state">${learn}, then:</span></div>`
      + fc.scenarios.map((sc) => thoughtLine(sc.move ? 'if the price makes a usual ' + (sc.move > 0 ? 'rise' : 'fall') + ' (' + pct(sc.move, 3) + ')' : 'if the price does not move (no lesson)', sc)).join('');
  }
  $('thoughts').innerHTML = html;
  $('thoughts').querySelectorAll('button[data-walk]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.walk), j = Number(b.dataset.to); flash = [[i, j, Date.now() + 6000]]; walkTo(i);
  }));
}

function renderBook(st = session.state(), el = $('book')) {
  el.innerHTML = `<div class="state">Paper P&amp;L after ${st.settled} windows, pool fee ${st.feePips == null ? '?' : fmt(st.feePips / 1e4, 2) + '%'} per switch:</div>`
    + Object.values(st.books).map((b) => `<div class="row"><span>${b.label}</span><span>${pct(b.ret - 1, 3)}</span><span>${b.pos ? 'in' : 'out'} · ${b.switches} switches</span></div>`).join('');
}
function tallyText(t) {
  const n = t.consistent + t.opposite;
  return `${t.consistent} matched · ${t.opposite} opposite · ${t.flat} flat · ${t.undecided} undecided` + (n ? ` · ${fmt((t.consistent / n) * 100, 0)}% on ${n} judged` : ' · nothing judged yet');
}
function renderTally() { $('tally').textContent = tallyText(session.state().tally); }

function measure() {
  const r = {}; for (const f of FAMILIES) r[f] = { s: 0, n: 0, total: 0 };
  let top = null;
  N.forEach((n, j) => { const x = r[n.family]; x.total++; x.s += act[j]; if (act[j] > 0.05) x.n++;
    if (n.family === 'MBON' && (top == null || act[j] > act[top])) top = j; });
  r.top = top != null && act[top] > 0.02 ? `${N[top].type} (${fmt(act[top] * 100, 0)}%, ${N[top].valence || 'no dopamine'})` : 'none';
  return r;
}

/* ── TRANSACTIONS ARRIVING, SHOWN: each real trade of a window is a ring on its PN group (received, sent, moved), spread over the window
 * instead of one burst. Visual only: the neural activity stays what fly-core computes. ── */
const KIND_COLOR = { received: '#4fd1c5', sent: '#f472b6', moved: '#a78bfa' };
const KIND_OF = { received: 0n, sent: 1n, moved: 2n };
let ripples = [], txSlot = 0;
function ripple(kind, usd) {
  const at = Date.now() + (txSlot++ % 10) * 2400;
  ripples.push({ kind, at, size: Math.min(1, Math.log10(Math.max(10, usd)) / 5) });
}
function pnCenter(kind) {
  if (!N.pnCenter) {
    N.pnCenter = {};
    for (const [k, r] of Object.entries(KIND_OF)) {
      const l = N.filter((n) => n.family === 'PN' && BigInt(n.id) % 3n === r);
      N.pnCenter[k] = { list: l, ids: new Set(l.map((n) => n.id)) };
    }
  }
  const g = N.pnCenter[kind]; return { ...centre(g.list), ids: g.ids };
}

/* Drawing is batched (one stroke per colour and intensity, no shadow blur): the old one stroke per edge and blurred glow cost too much
 * on phones. Quiet circuit = ~10 frames/s, activity = ~30. */
/* ── 3D VIEW (Phil 08/11: "see the connections in 3D, zoom in and out"). The circuit file carries NO positions (hemibrain coordinates
 * need neuPrint), so depth is OURS: each family on its own layer (smell inputs at the back, Kenyon cells in the middle, outputs at the
 * front), a fixed per-neuron jitter, and the 2D layout above for the rest. Drag to turn, wheel or two fingers to zoom, shift-drag to
 * move. Every drawing routine keeps using n.x / n.y: they are the projection of (bx, by, bz) through the camera, at every frame. ── */
const cam = { yaw: -0.55, pitch: 0.22, zoom: 1, panX: 0, panY: 0, moving: 0 };
const CAM_HOME = { yaw: -0.55, pitch: 0.22, zoom: 1, panX: 0, panY: 0 };
const DEPTH = { PN: -320, KC: 0, MBON: 300, APL: 40 };
function init3d(list) {
  const W = canvas.width, H = canvas.height;
  list.forEach((n, j) => {
    n.bx = n.x - W / 2; n.by = n.y - H / 2;
    const jitter = (((j * 7919) % 97) / 97 - 0.5) * 140;
    n.bz = (n.family === 'DAN' ? (j % 2 ? 200 : -200) : DEPTH[n.family] ?? 0) + jitter;
  });
}
function project() {
  const W = canvas.width, H = canvas.height, cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), D = 1700;
  for (const n of N) {
    const x1 = n.bx * cy - n.bz * sy, z1 = n.bx * sy + n.bz * cy;
    const y2 = n.by * cp - z1 * sp, z2 = n.by * sp + z1 * cp, f = D / Math.max(200, D + z2) * cam.zoom;
    n.x = W / 2 + x1 * f + cam.panX; n.y = H / 2 + y2 * f + cam.panY; n.f = f;
  }
}
/* the screen point of a group's centre (labels, rings) */
function centre(list) { let x = 0, y = 0; for (const n of list) { x += n.x; y += n.y; } return { x: x / list.length, y: y / list.length }; }
function zoomBy(k) { cam.zoom = Math.min(8, Math.max(0.35, cam.zoom * k)); cam.moving = Date.now(); }
function wire3d() {
  const ptrs = new Map(); let dragged = 0, lastPinch = null;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; };
  canvas.addEventListener('pointerdown', (e) => { ptrs.set(e.pointerId, pos(e)); dragged = 0; lastPinch = null; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const p = pos(e), q = ptrs.get(e.pointerId); ptrs.set(e.pointerId, p);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch) zoomBy(d / lastPinch); lastPinch = d; dragged += 10; return;
    }
    const dx = p.x - q.x, dy = p.y - q.y; dragged += Math.abs(dx) + Math.abs(dy);
    if (e.shiftKey) { cam.panX += dx; cam.panY += dy; } else { cam.yaw += dx * 0.006; cam.pitch = Math.max(-1.3, Math.min(1.3, cam.pitch + dy * 0.006)); }
    cam.moving = Date.now();
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) lastPinch = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  /* a drag must not also select the neuron under the finger */
  canvas.addEventListener('click', (e) => { if (dragged > 6) { e.stopImmediatePropagation(); dragged = 0; } }, true);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  $('zoomIn').addEventListener('click', () => zoomBy(1.25));
  $('zoomOut').addEventListener('click', () => zoomBy(0.8));
  $('viewReset').addEventListener('click', () => { Object.assign(cam, CAM_HOME); cam.moving = Date.now(); });
  $('viewFlat').addEventListener('click', () => { Object.assign(cam, { yaw: 0, pitch: 0 }); cam.moving = Date.now(); });
}

const ALPHAS = 6;
function draw(now) {
  if (!N.edges) return;
  const W = canvas.width, H = canvas.height, t = Date.now();
  project();
  /* while the view turns, a full clear (the soft trail would smear the whole map) */
  ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = t - cam.moving < 400 ? 'rgb(5,7,13)' : 'rgba(5,7,13,0.35)'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const focus = selected != null ? selected : hovered;
  const buckets = new Map();
  for (const [i, j, w] of N.edges) {
    if (hidden.has(N[i].family) || hidden.has(N[j].family)) continue;
    const a = act[i], base = (focus != null ? 0.008 : 0.025) + 0.05 * (w / N.wMax);
    const alpha = Math.min(0.9, base + a * 0.45 * (0.3 + w / N.wMax)), q = Math.min(ALPHAS - 1, Math.floor(alpha * ALPHAS / 0.9)), thick = a > 0.3 ? 1 : 0;
    const key = N[i].family + '|' + q + '|' + thick;
    let b = buckets.get(key); if (!b) { b = []; buckets.set(key, b); } b.push(i, j);
  }
  for (const [key, list] of buckets) {
    const [fam, q, thick] = key.split('|');
    ctx.strokeStyle = COLOR[fam]; ctx.globalAlpha = (Number(q) + 0.5) * 0.9 / ALPHAS; ctx.lineWidth = thick === '1' ? 1.4 : 0.5;
    ctx.beginPath(); for (let k = 0; k < list.length; k += 2) { ctx.moveTo(N[list[k]].x, N[list[k]].y); ctx.lineTo(N[list[k + 1]].x, N[list[k + 1]].y); } ctx.stroke();
  }
  /* signals travelling along the active connections */
  let dots = 0; const byColor = new Map();
  for (const [i, j] of N.edges) {
    if (dots >= 220) break;
    if (act[i] < 0.25 || hidden.has(N[i].family) || hidden.has(N[j].family)) continue;
    const f = ((t / 900) + ((i * 31 + j * 17) % 97) / 97) % 1, c = COLOR[N[i].family];
    let l = byColor.get(c); if (!l) { l = []; byColor.set(c, l); } l.push(N[i].x + (N[j].x - N[i].x) * f, N[i].y + (N[j].y - N[i].y) * f); dots++;
  }
  ctx.globalAlpha = 0.9;
  for (const [c, l] of byColor) { ctx.fillStyle = c; ctx.beginPath(); for (let k = 0; k < l.length; k += 2) { ctx.moveTo(l[k] + 2.2, l[k + 1]); ctx.arc(l[k], l[k + 1], 2.2, 0, Math.PI * 2); } ctx.fill(); }
  /* the focused neuron's real connections: inputs in cyan, outputs in gold, width by synapse count */
  if (focus != null) {
    const wMax = Math.max(1, ...N.in[focus].map(([, w]) => w), ...N.out[focus].map(([, w]) => w));
    for (const [list, color] of [[N.in[focus], '#67e8f9'], [N.out[focus], '#fde68a']]) {
      ctx.strokeStyle = color;
      for (const [k, w] of list) { if (hidden.has(N[k].family)) continue; ctx.globalAlpha = 0.25 + 0.6 * w / wMax; ctx.lineWidth = 0.6 + 2.4 * w / wMax;
        ctx.beginPath(); ctx.moveTo(N[focus].x, N[focus].y); ctx.lineTo(N[k].x, N[k].y); ctx.stroke(); }
    }
  }
  /* rings of the transactions arriving now, and their PN group lit for as long as the ring lives */
  ripples = ripples.filter((r) => t < r.at + 1800);
  const lit = new Set();
  for (const r of ripples) {
    if (t < r.at) continue;
    const p = (t - r.at) / 1800, c = pnCenter(r.kind);
    ctx.strokeStyle = KIND_COLOR[r.kind]; ctx.globalAlpha = 0.8 * (1 - p); ctx.lineWidth = 2 + 4 * r.size;
    ctx.beginPath(); ctx.arc(c.x, c.y, 20 + p * (90 + 120 * r.size), 0, Math.PI * 2); ctx.stroke();
    for (const id of c.ids) lit.add(id);
  }
  /* quiet neurons in one fill per colour; active ones get a soft halo (no shadow blur) */
  const quiet = new Map();
  for (let j = 0; j < N.length; j++) {
    if (hidden.has(N[j].family)) continue;
    const n = N[j], a = Math.max(act[j], lit.has(n.id) ? 0.35 : 0), r = (n.family === 'APL' ? 7 : n.family === 'MBON' ? 3.2 : 2.2) + a * 5 + (j === focus ? 5 : 0);
    const c = n.family === 'DAN' && n.dan === 'punishment' ? '#fb923c' : COLOR[n.family];
    if (a <= 0.08 && j !== focus) { let l = quiet.get(c); if (!l) { l = []; quiet.set(c, l); } l.push(n.x, n.y, r); continue; }
    ctx.fillStyle = c; ctx.globalAlpha = 0.18 * a; ctx.beginPath(); ctx.arc(n.x, n.y, r * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.35 + a * 0.65; ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 0.35;
  for (const [c, l] of quiet) { ctx.fillStyle = c; ctx.beginPath(); for (let k = 0; k < l.length; k += 3) { ctx.moveTo(l[k] + l[k + 2], l[k + 1]); ctx.arc(l[k], l[k + 1], l[k + 2], 0, Math.PI * 2); } ctx.fill(); }
  /* the synapses the last learning step weakened, in white for 6 s */
  flash = flash.filter((f) => f[2] > t);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6;
  for (const [i, j, until] of flash) { ctx.globalAlpha = Math.min(0.9, (until - t) / 3000); ctx.beginPath(); ctx.moveTo(N[i].x, N[i].y); ctx.lineTo(N[j].x, N[j].y); ctx.stroke(); }
  ctx.globalAlpha = 0.75; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#8a96ad'; ctx.font = '22px system-ui'; ctx.textAlign = 'center';
  if (!N.sides) N.sides = { ap: N.filter((n) => n.family === 'MBON' && n.valence === 'approach'), av: N.filter((n) => n.family === 'MBON' && n.valence && n.valence !== 'approach') };
  const ca = centre(N.sides.ap), cv = centre(N.sides.av);
  ctx.fillText('go toward', ca.x, ca.y - 70 * cam.zoom); ctx.fillText('keep away', cv.x, cv.y + 80 * cam.zoom);
  ctx.globalAlpha = 1;
}

function drawSpark() {
  const W = spark.width, H = spark.height; sctx.clearRect(0, 0, W, H);
  if (history.length < 2) return;
  const ps = history.map((h) => h.p), lo = Math.min(...ps), hi = Math.max(...ps), span = hi - lo || hi * 1e-4;
  const t0 = history[0].t, t1 = history[history.length - 1].t || t0 + 1;
  sctx.strokeStyle = ps[ps.length - 1] >= ps[0] ? '#4ade80' : '#f87171'; sctx.lineWidth = 2; sctx.beginPath();
  history.forEach((h, i) => { const x = ((h.t - t0) / Math.max(1, t1 - t0)) * (W - 4) + 2, y = H - 4 - ((h.p - lo) / span) * (H - 8); if (i) sctx.lineTo(x, y); else sctx.moveTo(x, y); });
  sctx.stroke();
}

function gauges() {
  const m = measure(), names = { PN: 'PN', KC: 'Kenyon', MBON: 'MBON', DAN: 'Dopa.', APL: 'APL' };
  const t = lastDecision ? { t: (lastDecision.ap - lastDecision.av) / Math.max(1e-6, lastDecision.ap + lastDecision.av) } : { t: 0 };
  $('gauges').innerHTML = FAMILIES.map((f) => { const p = m[f].total ? m[f].s / m[f].total : 0;
    return `<div><span>${names[f]}</span><span class="bar"><i style="width:${Math.min(100, p * 100 * 3)}%;background:${COLOR[f]}"></i></span><span>${fmt(p * 100, 1)}%</span></div>`; }).join('');
  $('output').textContent = `Most active output: ${m.top}`;
  const pos = 50 + 50 * Math.max(-1, Math.min(1, t.t * 4));
  $('needle').style.left = pos + '%';
}

/* ── THE MAP, INTERACTIVE: hover or tap a neuron to see what it is, its real connections, and what it has learned. ── */
const ROLE = {
  PN: 'Projection neuron: carries a smell from the antenna into the memory centre. Here it carries one kind of transaction.',
  KC: 'Kenyon cell: one of the cells that code which smell it is. Only about 10% fire at once, so each smell has its own small set.',
  MBON: 'Output neuron: its vote pushes the fly toward or away from the smell.',
  DAN: 'Dopamine neuron: the teacher. It weakens the Kenyon to output synapses that were active when it fired.',
  APL: 'APL: one giant inhibitory cell that keeps Kenyon activity sparse.',
};
let hovered = null, selected = null;
const hidden = new Set();
function nearest(e) {
  const r = canvas.getBoundingClientRect(), x = (e.clientX - r.left) * canvas.width / r.width, y = (e.clientY - r.top) * canvas.height / r.height;
  let best = null, bd = 18 * 18;
  N.forEach((n, j) => { if (hidden.has(n.family)) return; const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; best = j; } });
  return best;
}
/* which smell each Kenyon cell belongs to: the cells in the top 10% for one kind of trade (computed once, from the measured synapses) */
let kcCode = null;
function codeOf(j) {
  if (!kcCode) {
    kcCode = new Map();
    for (const kind of Object.keys(KIND_OF)) {
      const d = fly.odorDrive({ received: 0, sent: 0, moved: 0, [kind]: 5000 });
      const sc = fly.kcIdx.map((k) => [k, fly.inputs[k].reduce((s, [i, w]) => s + w * (d[i] || 0), 0)]).sort((a, b) => b[1] - a[1]);
      sc.slice(0, Math.round(fly.kcIdx.length * 0.1)).forEach(([k, v]) => { if (v > 0) kcCode.set(k, [...(kcCode.get(k) || []), kind]); });
    }
  }
  return kcCode.get(j) || [];
}
const back = [];
function walkTo(k) { if (selected != null && selected !== k) back.push(selected); selected = k; describe(k); }
function chips(list, title) {
  if (!list.length) return '';
  const top = [...list].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return `<div class="state" style="margin-top:6px">${title}</div><div class="walk">`
    + top.map(([k, w]) => `<button data-walk="${k}" style="border-color:${COLOR[N[k].family]}">${N[k].family} ${N[k].type || ''} · ${w} syn.</button>`).join('') + '</div>';
}
function describe(j) {
  if (j == null) { $('neuron').innerHTML = '<div class="state">Hover or tap a neuron on the map, then walk through its synapses with the buttons. Tap the legend to hide a family.</div>'; return; }
  const n = N[j], ins = N.in[j], outs = N.out[j], syn = (l) => l.reduce((s, [, w]) => s + w, 0), inputs = fly.inputs;
  let role;
  if (n.family === 'PN') {
    const kind = Object.keys(KIND_OF).find((k) => KIND_OF[k] === BigInt(n.id) % 3n);
    role = ROLE.PN + ` Here it belongs to the <b>${kind}</b> group: it lights up when a window has trades where ${kind === 'received' ? 'the signer received the stock' : kind === 'sent' ? 'the signer sent the stock' : 'the stock moved between two other addresses'}, harder for bigger trades (our mapping, by id).`;
  } else if (n.family === 'KC') {
    const c = codeOf(j);
    role = ROLE.KC + (c.length ? ` In this model it is part of the code for <b>${c.join(' and ')}</b> trades: those smells reach it among the strongest 10%.` : ' None of the three trade smells reaches it among the strongest 10%: it stays silent for them.');
  } else if (n.family === 'DAN') {
    const comp = outs.filter(([k]) => N[k].family === 'MBON').map(([k]) => N[k].type);
    role = ROLE.DAN + (n.dan === 'reward' ? ' This one is a <b>reward</b> neuron (PAM): a price rise after a smell drives it, and it weakens that smell\'s Kenyon synapses onto ' + (comp.length ? comp.slice(0, 4).join(', ') : 'its output neurons') + ' (the avoid side), so the fly leans toward that smell next time.'
      : n.dan === 'punishment' ? ' This one is a <b>punishment</b> neuron (PPL1): a price fall after a smell drives it, and it weakens that smell\'s Kenyon synapses onto ' + (comp.length ? comp.slice(0, 4).join(', ') : 'its output neurons') + ' (the approach side), so the fly pulls away next time.'
        : ' It is neither PAM nor PPL1, so it teaches nothing here.');
  } else if (n.family === 'MBON') {
    role = ROLE.MBON + (n.valence ? ` Most of its dopamine comes from ${n.valence === 'avoid' ? 'reward (PAM)' : 'punishment (PPL1)'} neurons, so it sits on the <b>${n.valence}</b> side: when learning weakens its Kenyon synapses, its vote drops and the fly is pulled the other way. Its votes are what the trader card reads.` : ' It receives no dopamine in this circuit, so learning never changes it.');
  } else role = ROLE[n.family];
  let learned = '';
  if (n.family === 'KC') {
    const w = []; for (const [k] of outs) if (N[k].family === 'MBON') for (const e of inputs[k]) if (e[0] === j && e[2] != null && e[2] < 0.999) w.push(`${N[k].type} ${pct(e[2] - 1, 1)}`);
    learned = w.length ? `<div class="state">Learned so far (weaker synapses): ${w.slice(0, 6).join(' · ')}</div>` : '<div class="state">Nothing learned through this cell yet.</div>';
  }
  if (n.family === 'MBON') {
    let low = 0, tot = 0; for (const e of inputs[j]) if (e[2] != null) { tot++; if (e[2] < 0.999) low++; }
    learned = `<div class="state">${low} of its ${tot} Kenyon synapses have been weakened by learning.</div>`;
  }
  $('neuron').innerHTML = `<div class="nname" style="color:${COLOR[n.family]}">${n.family} · ${n.type || 'untyped'}</div>`
    + `<div class="state">Body id ${n.id} (hemibrain v1.2) · activity now ${fmt(act[j] * 100, 1)}%</div>`
    + `<div style="margin:6px 0">${role}</div>`
    + `<div class="state">Inputs: ${ins.length} neurons, ${syn(ins)} synapses (cyan) · Outputs: ${outs.length} neurons, ${syn(outs)} synapses (gold), counted at 5 synapses or more within this circuit.</div>`
    + learned
    + chips(ins, 'Walk upstream (who talks to it):') + chips(outs, 'Walk downstream (who it talks to):')
    + (back.length ? '<div class="walk" style="margin-top:8px"><button data-back="1">← back</button></div>' : '');
  $('neuron').querySelectorAll('button[data-walk]').forEach((b) => b.addEventListener('click', () => walkTo(Number(b.dataset.walk))));
  const bb = $('neuron').querySelector('button[data-back]'); if (bb) bb.addEventListener('click', () => { selected = back.pop(); describe(selected); });
}
function wireMap() {
  canvas.addEventListener('pointermove', (e) => { const j = nearest(e); if (j !== hovered) { hovered = j; if (selected == null) describe(j); } });
  canvas.addEventListener('pointerleave', () => { hovered = null; if (selected == null) describe(null); });
  canvas.addEventListener('click', (e) => { const j = nearest(e); selected = j === selected ? null : j; describe(selected != null ? selected : null); });
  document.querySelectorAll('.legend span[data-family]').forEach((s) => s.addEventListener('click', () => {
    const f = s.dataset.family; if (hidden.has(f)) hidden.delete(f); else hidden.add(f);
    document.querySelectorAll(`.legend span[data-family="${f}"]`).forEach((x) => x.classList.toggle('off', hidden.has(f)));
  }));
  describe(null);
}

/* ── TRAINING THAT LASTS IN THIS BROWSER: per stock, so this fly keeps training from visit to visit. Per viewer only; a private window
 * or cleared site data starts a naive fly, and the page says so. The shared fly (server) is the one that trains when nobody watches. ── */
const memKey = (s) => 'fly-brain-memory-v1-' + s;
function saveMemory() {
  try { localStorage.setItem(memKey(current.symbol), JSON.stringify({ m: fly.exportMemory(), ...session.state(), at: Date.now() })); }
  catch (_) { /* storage refused: the fly still learns, it just forgets on reload */ }
}
function loadMemory() {
  let x = null; try { x = JSON.parse(localStorage.getItem(memKey(current.symbol)) || 'null'); } catch (_) { x = null; }
  fly.importMemory(x && x.m); session.restore(x);
  log(x ? `memory restored for ${current.symbol}: trained since ${new Date(x.at).toLocaleString('en-GB')}, ${session.settled} windows` : `a naive fly for ${current.symbol} (no memory kept in this browser yet)`);
  renderTally(); renderBook();
}
function forget() {
  try { localStorage.removeItem(memKey(current.symbol)); } catch (_) { /* nothing kept */ }
  loadMemory(); log('memory erased: the fly is naive again');
}

/* ── THE SHARED FLY: the server runs the same fly-core on one stock, every minute, whether anyone watches or not. Its memory starts again
 * when the server restarts (a deploy), and the panel says since when it has been training. ── */
async function readShared() {
  try {
    const s = await fetch('/api/fly/state', { cache: 'no-store' }).then((x) => x.json());
    if (!s || !s.ok) { $('shared').innerHTML = `<div class="state">The shared fly is not running: ${esc((s && s.why) || 'no answer')}.</div>`; return; }
    const since = new Date(s.trainingSince || s.aliveSince).toLocaleString('en-GB');
    const mem = s.persisted ? 'memory kept across server restarts' + (s.restored ? ' (reloaded at the last restart, ' + new Date(s.aliveSince).toLocaleString('en-GB') + ')' : '')
      : 'memory NOT kept: it starts again when the server restarts' + (s.saveError ? ' (' + esc(s.saveError) + ')' : '');
    $('shared').innerHTML = `<div class="state">${esc(s.symbol)} · training since ${esc(since)} · ${s.windows} windows (${s.windowsRead} read, ${s.windowsMissed} not read) · ${s.weakened} synapses weakened so far · ${mem}</div>`
      + `<div class="state" style="margin-top:4px">${tallyText(s.session.tally)}</div><div id="sharedBook" class="book"></div>`
      + (s.foresight && s.foresight.exact && s.foresight.scenarios.length ? `<div class="state" style="margin-top:4px">Next, computed on its shadow (${s.foresight.pos ? 'holding' : 'out'}, if the next trades smell like the last): `
        + s.foresight.scenarios.map((sc) => `${sc.move ? pct(sc.move, 0) : '0%'} → <span class="act ${sc.action}">${ACT[sc.action]}</span>`).join(' · ') + '</div>'
        : `<div class="state" style="margin-top:4px">Next: no forecast yet (${esc((s.foresight && s.foresight.why) || 'not computed yet')}).</div>`)
      + `<div class="log" style="margin-top:6px;max-height:180px">${s.events.slice(-12).reverse().map((e) => `<p class="${e.type === 'verdict' ? 'verdict' : 'live'}">${clock(e.at)} · ${esc(eventText(e, s.symbol))}</p>`).join('')}</div>`;
    renderBook(s.session, $('sharedBook'));
  } catch (_) { $('shared').innerHTML = '<div class="state">The shared fly could not be read this time.</div>'; }
}
function eventText(e, symbol) {
  if (e.type === 'tx') return `${e.kind}: ${fmt(e.units, 4)} ${symbol} ($${fmt(e.usd, 0)}) · tx ${String(e.tx).slice(0, 10)}…`;
  if (e.type === 'predict') return `smells ${mixText(e.mix)} → ${SAY[e.word]}`;
  if (e.type === 'taught') return `taught: followed by ${pct(e.move, 3)}, ${e.weakened} synapses weakened`;
  if (e.type === 'verdict') return `predicted ${e.prediction}, moved ${pct(e.move, 3)} → ${e.kind}`;
  if (e.type === 'decision') return `decides ${ACT[e.action]} (paper)`;
  if (e.type === 'skipped') return `${e.n} past transactions skipped at start`;
  return e.type;
}

/* ── BEATS: the computed activity, played. A neuron "fires" on a step when a hash of (step, neuron) falls under its activity: no
 * Math.random, so the same moves give the same rhythm, like the block brain. Off until asked: browsers refuse sound without a click. ── */
const PENTA = [0, 2, 4, 7, 9];
let audio = null, master = null;
const fires = (j, t) => ((Math.imul(t + 1, 2654435761) ^ Math.imul(j + 7, 40503)) >>> 0) / 4294967296;
function voice({ freq, type = 'sine', dur = 0.12, vol = 0.08, noise = false, at = 0 }) {
  const t0 = audio.currentTime + at, g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(master);
  if (noise) {
    const b = audio.createBuffer(1, Math.ceil(audio.sampleRate * dur), audio.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = fires(i, fly.ticks) * 2 - 1;
    const s = audio.createBufferSource(), f = audio.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    s.buffer = b; s.connect(f); f.connect(g); s.start(t0); return;
  }
  const o = audio.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0); o.connect(g); o.start(t0); o.stop(t0 + dur + 0.02);
}
function beat() {
  if (!audio) return;
  const t = fly.ticks; let n = 0; const cap = 7, slot = 0.12 / cap;
  fly.kcIdx.forEach((j, k) => { if (act[j] > 0 && fires(j, t) < act[j] * 0.5 && n < cap) voice({ freq: 220 * 2 ** ((PENTA[k % 5] + 12 * ((k / 5 | 0) % 3)) / 12), type: 'triangle', dur: 0.18, vol: 0.05, at: slot * n++ }); });
  for (const j of fly.mbonIdx) if (N[j].valence && fires(j, t) < act[j] * 0.6 && n < cap) voice({ freq: N[j].valence === 'approach' ? 660 : 110, type: 'sine', dur: 0.3, vol: 0.06, at: slot * n++ });
  let rew = 0, pun = 0, pn = 0;
  N.forEach((x, j) => { if (x.dan === 'reward') rew = Math.max(rew, act[j]); if (x.dan === 'punishment') pun = Math.max(pun, act[j]); if (x.family === 'PN') pn += act[j]; });
  if (rew > 0.05 && t % 2 === 0) voice({ freq: 1320, type: 'sine', dur: 0.5, vol: 0.05 * rew });
  if (pun > 0.05 && t % 2 === 0) voice({ freq: 55, type: 'square', dur: 0.25, vol: 0.09 * pun });
  if (pn > 1 && t % 2 === 1) voice({ noise: true, dur: 0.04, vol: 0.03 });
}
function listen() {
  if (audio) { audio.close(); audio = null; $('listen').textContent = 'Listen to the brain'; return; }
  audio = new (window.AudioContext || window.webkitAudioContext)();
  master = audio.createGain(); master.gain.value = 0.7; master.connect(audio.destination);
  $('listen').textContent = 'Mute';
}

/* The brain steps on a timer, the drawing on animation frames: a background tab gets no frames, and its fly must keep living. */
function tick() { fly.tick(); act = fly.act; beat(); if (fly.ticks % 4 === 0) gauges(); }
let lastDraw = 0;
function loop(now) {
  const busy = flash.length || ripples.length || hovered != null || selected != null || Date.now() - cam.moving < 400 || (fly && fly.peak && act.some((a) => a > 0.01));
  if (now - lastDraw >= (busy ? 33 : 100)) { lastDraw = now; draw(now); }
  requestAnimationFrame(loop);
}

/* One window, every 30 s: price + new transactions, handed to the shared protocol. */
async function readWindow() {
  const stock = current;
  const [r, ac] = await Promise.all([
    fetch('/api/fly/price/' + stock.address, { cache: 'no-store' }).then((x) => x.json()).catch(() => null),
    fetch('/api/activite/' + stock.address, { cache: 'no-store' }).then((x) => x.json()).catch(() => null),
  ]);
  if (stock !== current) return;
  const price = r && r.ok && typeof r.priceUsd === 'number' ? r : null;
  if (!price) {
    const last = history.length ? ` · showing the last price read at ${clock(history[history.length - 1].t)}` : '';
    $('state').textContent = 'live price not read this time (' + ((r && r.why) || 'empty response') + ')' + last + ' · next try in 30 s';
  } else {
    $('price').textContent = '$' + fmt(price.priceUsd);
    $('state').textContent = `live on-chain price · Aerodrome pool · block ${price.block.toLocaleString('en-US')} · ${clock(Date.parse(price.readAt))}`;
    history.push({ t: Date.now(), p: price.priceUsd }); while (history.length && Date.now() - history[0].t > 3600000) history.shift();
    drawSpark();
    if (lastPrice == null) log(`${stock.symbol} live at $${fmt(price.priceUsd)} (on-chain pool, block ${price.block.toLocaleString('en-US')})`);
    lastPrice = price.priceUsd; if (Number.isInteger(price.tokenDecimals)) live.decimals = price.tokenDecimals;
  }
  if (ac && !ac.ok && ac.pourquoi) log('trades not read this time: ' + ac.pourquoi);
  txSlot = 0;
  session.window({ symbol: stock.symbol, price, transactions: ac && ac.ok && Array.isArray(ac.transactions) ? ac.transactions : null });
  renderBook(); renderTally(); saveMemory();
}

/* The Chainlink reference next to the live price: on a weekend it holds Friday's close, and the gap is the market's own view. */
async function readReference() {
  const stock = current;
  try {
    const r = await fetch('/api/actions/reference/' + stock.address, { cache: 'no-store' }).then((x) => x.json());
    if (stock !== current) return;
    const ref = r && r.reference;
    if (!r || !r.ok || !ref || ref.etat !== 'LU' || typeof ref.prixUsd !== 'number') { $('ref').textContent = 'reference not read'; return; }
    const gap = lastPrice ? lastPrice / ref.prixUsd - 1 : null;
    $('ref').textContent = `Reference $${fmt(ref.prixUsd)} (${ref.libelle}, ${ref.fraicheur === 'DERNIERE_VALEUR' ? 'US market closed, last value' : 'live'})`
      + (gap == null ? '' : ` · on-chain ${pct(gap)} vs reference`);
  } catch (_) { $('ref').textContent = 'reference not read'; }
}

function select(i) {
  current = STOCKS[i]; lastPrice = null; history = []; drawSpark(); lastDecision = null;
  $('watching').textContent = `watching ${current.symbol} · every 30 s its real trades are a smell`;
  $('verdict').textContent = 'Waiting for a smell'; $('verdict').className = 'decision';
  session.reset(); loadMemory(); thoughts.length = 0; renderThoughts();
  $('price').textContent = '—'; $('state').textContent = 'reading…'; $('ref').textContent = '';
  clearInterval(timer); clearInterval(refTimer);
  readWindow().then(readReference); timer = setInterval(readWindow, POLL_MS); refTimer = setInterval(readReference, REF_MS);
}

async function start() {
  $('pick').innerHTML = STOCKS.map((a, i) => `<option value="${i}">${a.symbol}</option>`).join('');
  $('pick').addEventListener('change', (e) => select(Number(e.target.value)));
  const slider = $('size'), showSize = () => { const v = Number(slider.value) / 1000; $('sizeValue').textContent = pct(v, 1); };
  slider.addEventListener('input', showSize); showSize();
  $('listen').addEventListener('click', listen);
  $('forget').addEventListener('click', forget);
  $('connect').addEventListener('click', connect);
  $('sign').addEventListener('click', signLive);
  $('stop').addEventListener('click', stopFly);
  autoWire();
  const circuit = await fetch('fly-brain-circuit.json').then((r) => r.json());
  fly = createFly(circuit); shadow = createFly(circuit); N = fly.N; act = fly.act;
  session = createSession(fly, onEvent);
  const idx = new Map(N.map((n, i) => [n.id, i]));
  N.edges = circuit.edges.map(([a, b, w]) => [idx.get(a), idx.get(b), w]);
  /* drawn edges: the 1,800 strongest (900 on a phone), so the canvas stays readable and light */
  N.edges = N.edges.sort((x, y) => y[2] - x[2]).slice(0, canvas.clientWidth && canvas.clientWidth < 600 ? 900 : 1800); N.wMax = N.edges[0][2];
  place(N); init3d(N);
  /* simulation, injected on what is REALLY happening (Phil 08/11): the odor of the last window that had real trades, followed by the
   *   chosen move — taught, then asked again on that same live odor, so the needle moves on the market's own smell. Before any real trade
   *   was smelled, a $5,000 "received" odor stands in, and the log says so. */
  $('inject').addEventListener('click', () => { const v = Number(slider.value) / 1000; if (!v) return;
    /* a simulation teaches THIS fly: while its wallet trades alone, it would steer real orders (security review M1) */
    if (auto.s && auto.s.running) { log('SIMULATION refused: the fly wallet is trading alone on these decisions; stop it first', 'sim'); return; }
    const live = session.lastOdor, mix = live || { received: 5000, sent: 0, moved: 0 }; simOnLive = !!live;
    log(`SIMULATION · ${live ? 'on the last real window (' + mixText(mix) + ')' : 'no real trade smelled yet, a stand-in ' + mixText(mix)} followed by ${pct(v, 1)}`, 'sim');
    if (live) for (const [k, usd] of Object.entries(mix)) if (usd > 0) ripple(k, usd);
    session.learn(mix, v, true); session.predict(mix, true); });
  log(`circuit loaded: ${N.length} neurons, ${circuit.edges.length} connections ≥ ${circuit.synapseThreshold} synapses; `
    + `${N.counts.approach} approach-side and ${N.counts.avoid} avoid-side MBONs, from measured dopamine inputs`);
  wireMap(); wire3d();
  setInterval(tick, 120);
  requestAnimationFrame(loop);
  select(0);
  readShared(); setInterval(readShared, SHARED_MS);
}
start().catch((e) => log('error: ' + (e && e.message || e)));
