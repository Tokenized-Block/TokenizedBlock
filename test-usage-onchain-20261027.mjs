// test-usage-onchain-20261027.mjs -- the COUNTING RULES of usage-onchain.js (users, DAU, WAU, volume, exclusions, unread ranges),
// run on the real module AND on mutants (copies with one rule broken): each mutant must make at least one check fail.
// ⛔ Mutants are written to COPIES next to the module (relative imports), removed at the end; the module itself is never touched.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.join(ICI, 'usage-onchain.js');
const pad = (a) => '0x' + a.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const hex = (n) => '0x' + BigInt(n).toString(16);
const A = '0x' + 'a1'.repeat(20), B = '0x' + 'b2'.repeat(20), C = '0x' + 'c3'.repeat(20);
/* copied from revenu-externe.js ENTRY_POINTS (v0.7) */
const EP = '0x0000000071727de22e5e9d8baf0edac6f37da032';

async function suite(m) {
  const echecs = [];
  const check = (cond, nom) => { if (!cond) echecs.push(nom); };
  const SLOTS = m.CONTRATS.find((c) => c.nom === 'BlockSlots').adresse;
  const USDC = Object.keys(m.STABLES_USD).find((k) => m.STABLES_USD[k].sym === 'USDC');
  const FEE = m.EQUIPE[0].adresse;
  const tx = (h, from, extra = {}) => ({ hash: h, from, to: SLOTS, value: '0x0', ...extra });
  const recu = (h, logs, status = '0x1', b = 100) => ({ transactionHash: h, status, blockNumber: hex(b), logs });
  const logSlots = (nomme) => ({ address: SLOTS, topics: ['0x' + '11'.repeat(32), pad('1'), pad(nomme)], data: '0x' });
  const usdcVers = (de, vers, montant) => ({ address: USDC, topics: [m.T_TRANSFER, pad(de), pad(vers)], data: pad(hex(montant)) });

  /* 1. the user is tx.from, NOT the address our log names */
  const h1 = '0x' + '01'.repeat(32);
  const r1 = m.ligneDeTx({ tx: tx(h1, A), recu: recu(h1, [logSlots(B)]), pools: new Map(), ethUsd: 2000, ts: 1000 });
  check(r1.from === A, 'sender = tx.from, not the log field');
  /* 2. ERC-4337: the EntryPoint's UserOperation sender, not the bundler */
  const h2 = '0x' + '02'.repeat(32);
  const uop = { address: EP, topics: [m.T_USER_OP, '0x' + '99'.repeat(32), pad(C), pad('0')], data: '0x' };
  const r2 = m.ligneDeTx({ tx: tx(h2, A, { to: EP }), recu: recu(h2, [logSlots(B), uop]), pools: new Map(), ethUsd: 2000, ts: 1000 });
  check(r2.from === C, '4337: sender = UserOperation sender');
  /* 3. a log naming us, emitted by SOMEONE ELSE, is not our surface */
  const h3 = '0x' + '03'.repeat(32);
  const faux = { address: '0x' + 'dd'.repeat(20), topics: ['0x' + '11'.repeat(32), pad(SLOTS)], data: '0x' };
  check(m.ligneDeTx({ tx: tx(h3, A), recu: recu(h3, [faux]), pools: new Map(), ts: 1 }).refus === 'NOT_OUR_SURFACE', 'foreign emitter ignored');
  /* 4. a failed tx does not count */
  check(m.ligneDeTx({ tx: tx(h1, A), recu: recu(h1, [logSlots(B)], '0x0'), pools: new Map(), ts: 1 }).refus === 'FAILED', 'failed tx refused');
  /* 5. volume = LARGEST leg, never the sum: 0.001 ETH (2 $) + 5 USDC into the game -> 5 */
  const h5 = '0x' + '05'.repeat(32);
  const r5 = m.ligneDeTx({ tx: tx(h5, A, { value: hex(10n ** 15n) }), recu: recu(h5, [logSlots(A), usdcVers(A, SLOTS, 5_000_000)]), pools: new Map(), ethUsd: 2000, ts: 1 });
  check(Math.abs(r5.usd - 5) < 1e-9, 'volume = max leg (5), not the sum (7)');
  /* 6. a stable sent to the fee wallet WITHOUT a swap is a gift, not a trade */
  const h6 = '0x' + '06'.repeat(32);
  const r6 = m.ligneDeTx({ tx: tx(h6, A, { to: USDC }), recu: recu(h6, [usdcVers(A, FEE, 1_000_000)]), pools: new Map(), ts: 1 });
  check(r6.refus === 'NOT_OUR_SURFACE', 'fee-wallet transfer without swap not counted');

  /* 7. dedup + windows + exclusions */
  const fin = 10 * 86400;
  const L = [
    { h: 'x1', from: A, ts: fin, usd: 10, cats: ['s'], nonPrice: [] },
    { h: 'x1', from: A, ts: fin, usd: 10, cats: ['s'], nonPrice: [] },           /* same tx twice */
    { h: 'x2', from: A, ts: fin - 100, usd: 1, cats: ['s'], nonPrice: [] },      /* same sender, other tx */
    { h: 'x3', from: B, ts: fin - 86400, usd: 2, cats: ['s'], nonPrice: [] },    /* exactly 24 h before: NOT in DAU */
    { h: 'x4', from: C, ts: fin - 7 * 86400 + 1, usd: 3, cats: ['s'], nonPrice: [] },
    { h: 'x5', from: FEE, ts: fin - 50, usd: 100, cats: ['s'], nonPrice: [] },   /* team wallet */
    { h: 'x6', from: B, ts: fin - 31 * 86400, usd: 1000, cats: ['s'], nonPrice: [] },
  ];
  const c = m.compter(L, { finTs: fin });
  check(c.avecEquipe.txs === 6, 'dedup by hash: 6 txs');
  check(c.avecEquipe.usersAllTime === 4, 'distinct senders: 4 with team');
  check(c.sansEquipe.usersAllTime === 3, 'distinct senders: 3 without team');
  check(c.avecEquipe.dau === 2 && c.sansEquipe.dau === 1, 'DAU: (fin-24h, fin], team excluded');
  check(c.avecEquipe.wau === 4 && c.sansEquipe.wau === 3, 'WAU: 7 days');
  check(c.avecEquipe.volumeUsdAllTime === 1116 && c.sansEquipe.volumeUsdAllTime === 1016, 'all-time volume, deduped');
  check(c.avecEquipe.volumeUsd30d === 116 && c.sansEquipe.volumeUsd30d === 16, '30-day volume');

  /* 8. a range the node refuses is UNREAD, never empty; capacity refusals split */
  const rpcRefuse = async (meth, [f]) => { const n = parseInt(f.toBlock, 16) - parseInt(f.fromBlock, 16) + 1; if (n > 100) throw new Error('exceed maximum block range'); if (parseInt(f.toBlock, 16) >= 160) throw new Error('boom outage'); return [{ blockNumber: f.fromBlock }]; };
  const d = await m.logsDecoupes(rpcRefuse, {}, 0, 199, { min: 50 });
  check(d.nonLus.length === 1 && d.nonLus[0].de === 100 && d.nonLus[0].a === 199, 'outage range reported unread');
  check(d.logs.length === 1, 'split ranges read');

  /* 9. the incremental engine never passes a window whose tx it could not read */
  const rpcMoteur = async (meth, p) => {
    if (meth === 'eth_blockNumber') return hex(1005 + 10);
    if (meth === 'eth_getBlockByNumber') return { timestamp: hex(fin) };
    if (meth === 'eth_getLogs') { const f = p[0]; return Array.isArray(f.address) && f.address.includes(SLOTS) && parseInt(f.fromBlock, 16) <= 1003 ? [{ address: SLOTS, transactionHash: h1, topics: [] }] : []; }
    if (meth === 'eth_getTransactionByHash') return null; /* not readable */
    if (meth === 'eth_getTransactionReceipt') return null;
    return null;
  };
  const mo = m.moteurUsage({ rpc: rpcMoteur, graine: { lignes: [], fin: { bloc: 999, ts: fin - 100 }, nonLus: [] }, fenetre: 10 });
  await mo.avancer();
  check(mo.etat.fin === 999 && !!mo.etat.erreur, 'unreadable tx: end block not advanced');
  return echecs;
}

const mutants = [
  ['sender read from a log field', 'const from = payeurDe({ tx, recu });', "const from = '0x' + bas((((recu.logs || [])[0] || {}).topics || [])[2] || '').slice(26);"],
  ['no dedup by hash', 'for (const r of fusionner(lignes)) {', 'for (const r of lignes.filter((x) => x && !x.refus)) {'],
  ['DAU bound inclusive', 'if (r.ts > finTs - 86400 && r.ts <= finTs) j.add(r.from);', 'if (r.ts >= finTs - 86400 && r.ts <= finTs) j.add(r.from);'],
  ['team not excluded', 'sansEquipe: un((r) => !ex.has(bas(r.from)))', 'sansEquipe: un(() => true)'],
  ['refused range counted as empty', 'out.nonLus.push({ de: x, a: y, cause });', 'void cause;'],
  ['volume summed', 'usd: legs.length ? Math.max(...legs) : 0', 'usd: legs.reduce((s, x) => s + x, 0)'],
];

const src = readFileSync(SOURCE, 'utf8');
const vrai = await import(pathToFileURL(SOURCE).href);
const e0 = await suite(vrai);
assert.deepEqual(e0, [], 'real module: ' + e0.join(' | '));
console.log('real module: all checks pass');
let tues = 0;
for (const [nom, de, vers] of mutants) {
  assert.ok(src.includes(de), 'mutant anchor found: ' + nom);
  const f = path.join(ICI, '.mutant-usage-' + tues + '-' + Date.now() + '.mjs');
  writeFileSync(f, src.replace(de, vers));
  try {
    const e = await suite(await import(pathToFileURL(f).href));
    assert.ok(e.length > 0, 'mutant SURVIVED: ' + nom);
    console.log('mutant killed: ' + nom + ' (' + e.join('; ') + ')');
    tues += 1;
  } finally { unlinkSync(f); }
}
console.log('OK ' + tues + '/' + mutants.length + ' mutants killed');
