// test-fly-guard-20261108.mjs — the browser-side guard on what the fly's key may sign (fly-guard.js), on REAL calldata built by the
// repo's own planners (calldataApproveNouvelle, calldataEchangeNouvelle), with mutants. Its addresses are checked against the repo's
// constants: copied, never recalled.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = dirname(fileURLToPath(import.meta.url));
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const imp = (f) => import(pathToFileURL(join(ICI, f)).href);

async function banc(dir) {
  n = 0;
  const G = await import(pathToFileURL(join(dir, 'fly-guard.js')).href + '?t=' + Date.now() + Math.random());
  const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');
  const { WETH_BASE } = await imp('plan-eth-block.js');
  const { PERMIT2 } = await imp('lancer-pool.js');
  const { ROUTEUR_AERO_NOUVEAU, calldataApproveNouvelle, calldataEchangeNouvelle } = await imp('liquidite-actions.js');
  const { ROUTEUR_AERODROME_CL } = await imp('calldata-aerodrome.js');
  const { ROUTEUR_UNIVERSEL } = await imp('calldata-v3.js');
  const { POOLS_ACTIONS_AERODROME } = await imp('pools-actions-aerodrome.js');
  const { selecteur } = await imp('keccak.js');
  const K = G.KNOWN, lc = (x) => String(x).toLowerCase();
  ok(K.usdc === lc(USDC_BASE) && K.weth === lc(WETH_BASE) && K.permit2 === lc(PERMIT2) && K.feeWallet === lc(FEE_WALLET), 'USDC, WETH, Permit2 and the fee wallet are the repo constants');
  ok(JSON.stringify(K.routers) === JSON.stringify([lc(ROUTEUR_AERO_NOUVEAU), lc(ROUTEUR_AERODROME_CL), lc(ROUTEUR_UNIVERSEL[8453])]), 'the three routers are the repo constants');
  ok(['multicall(bytes[])', 'multicall(uint256,bytes[])', 'execute(bytes,bytes[],uint256)', 'execute(bytes,bytes[])'].map(selecteur).join() === '0xac9650d8,0x5ae401dc,0x3593564c,0x24856bc3', 'nested-call selectors computed, not typed');
  ok(selecteur('approve(address,uint256)') === '0x095ea7b3' && selecteur('transfer(address,uint256)') === '0xa9059cbb' && selecteur('approve(address,address,uint160,uint48)') === '0x87517c45', 'selectors computed, not typed');

  const NV = [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === 'NVDAc')[0];
  const fly = '0x' + '5a'.repeat(20), thief = '0x' + '7e'.repeat(20), now = 1_800_000_000, A = 1_000_000n;
  const ap = calldataApproveNouvelle({ token: USDC_BASE, montant: A });
  const sw = calldataEchangeNouvelle({ tokenIn: USDC_BASE, tokenOut: NV, tickSpacing: 100, recipient: fly, amountIn: A, amountOutMinimum: 500000n, deadline: now + 600, maintenant: now, beneficiaireFrais: FEE_WALLET });
  ok(ap.etat === 'PRET' && sw.etat === 'PRET', 'real calldata built by the repo planners');
  const buy = [{ to: ap.to, data: ap.data, value: '0x0' }, { to: sw.to, data: sw.data, value: '0x0' }];
  const chk = (calls, o = {}) => G.checkPlanCalls({ calls, fly, pay: USDC_BASE, receive: NV, amount: A, nowSec: now, ...o });
  ok(chk(buy) === null, 'a real BUY plan (exact approve + swap swept to the fly with the fee) is allowed');
  ok(G.addressesIn(sw.data).has(fly) && G.addressesIn(sw.data).has(lc(FEE_WALLET)), 'the scan finds the fly and the fee wallet inside the nested multicall');
  /* the same swap, recipient = a thief: refused */
  const bad = calldataEchangeNouvelle({ tokenIn: USDC_BASE, tokenOut: NV, tickSpacing: 100, recipient: thief, amountIn: A, amountOutMinimum: 500000n, deadline: now + 600, maintenant: now, beneficiaireFrais: FEE_WALLET });
  ok(/unknown address/.test((chk([{ to: bad.to, data: bad.data, value: '0x0' }]) || {}).why || ''), 'the same swap paying a stranger is refused');
  const badFee = calldataEchangeNouvelle({ tokenIn: USDC_BASE, tokenOut: NV, tickSpacing: 100, recipient: fly, amountIn: A, amountOutMinimum: 500000n, deadline: now + 600, maintenant: now, beneficiaireFrais: thief });
  ok(chk([{ to: badFee.to, data: badFee.data, value: '0x0' }]) !== null, 'the same swap with the fee sent to a stranger is refused');
  /* approvals and transfers */
  const w = (a) => a.slice(2).toLowerCase().padStart(64, '0'), u = (x) => BigInt(x).toString(16).padStart(64, '0');
  ok(chk([{ to: USDC_BASE, data: '0x095ea7b3' + w(thief) + u(A), value: '0x0' }]) !== null, 'approve to a stranger refused');
  ok(chk([{ to: USDC_BASE, data: '0x095ea7b3' + w(ROUTEUR_AERO_NOUVEAU) + u(A + 1n), value: '0x0' }]) !== null, 'approve above the amount refused');
  ok(chk([{ to: NV, data: '0x095ea7b3' + w(ROUTEUR_AERO_NOUVEAU) + u(A), value: '0x0' }]) !== null, 'approve on the token NOT paid refused');
  ok(chk([{ to: USDC_BASE, data: '0xa9059cbb' + w(thief) + u(1), value: '0x0' }]) !== null, 'a transfer to a stranger refused, even of 1 unit');
  ok(chk([{ to: USDC_BASE, data: '0xa9059cbb' + w(FEE_WALLET) + u(A / 100n), value: '0x0' }]) === null && chk([{ to: USDC_BASE, data: '0xa9059cbb' + w(FEE_WALLET) + u(A / 100n + 1n), value: '0x0' }]) !== null, 'the fee transfer: 1% allowed, one unit more refused');
  const p2 = (tok, sp, amt, exp) => ({ to: PERMIT2, data: '0x87517c45' + w(tok) + w(sp) + u(amt) + u(exp), value: '0x0' });
  ok(chk([p2(USDC_BASE, ROUTEUR_UNIVERSEL[8453], A, now + 3600)]) === null, 'Permit2 approval for 1 h to the Universal Router allowed');
  ok(chk([p2(USDC_BASE, ROUTEUR_UNIVERSEL[8453], A, now + 7201)]) !== null && chk([p2(USDC_BASE, thief, A, now + 60)]) !== null && chk([p2(NV, ROUTEUR_UNIVERSEL[8453], A, now + 60)]) !== null, 'Permit2: too long, to a stranger, or another token: refused');
  ok(chk([{ ...buy[1], value: '0x1' }]) !== null, 'ETH attached refused');
  ok(chk([{ to: thief, data: sw.data, value: '0x0' }]) !== null, 'the swap sent to an unknown contract refused');
  ok(chk([]) !== null, 'an empty plan is not signed');
  const noFly = calldataEchangeNouvelle({ tokenIn: USDC_BASE, tokenOut: NV, tickSpacing: 100, recipient: ROUTEUR_AERODROME_CL, amountIn: A, amountOutMinimum: 500000n, deadline: now + 600, maintenant: now, beneficiaireFrais: FEE_WALLET });
  ok(noFly.etat === 'PRET' && /does not pay the fly/.test((chk([{ to: noFly.to, data: noFly.data, value: '0x0' }]) || {}).why || ''), 'a swap paying a KNOWN address that is not the fly (another router) is refused');
  ok(/not readable/.test((chk([{ to: sw.to, data: sw.data.slice(0, 200), value: '0x0' }]) || {}).why || ''), 'a truncated multicall is refused, not half-read');
  ok(chk(buy, { fly: thief }) !== null, 'the guard is bound to THIS fly: the plan built for another account is refused');
  return n;
}

const total = await banc(ICI);
console.log('test-fly-guard-20261108 : ' + total + ' assertions OK');
const MUTANTS = [
  ['adresses inconnues tolerees', (s) => s.replace("for (const a of found) if (!allowed.has(a)) return no(", "for (const a of found) if (false) return no(")],
  ['multicall non parcouru', (s) => s.replace('const nest = NESTED[sel];', 'const nest = null;')],
  ['elements lus sans leur selecteur', (s) => s.replace("addressesIn(nest.selector ? '0x' + body : '0x00000000' + body, depth + 1)", "addressesIn('0x00000000' + body, depth + 1)")],
  ['destinataire non exige', (s) => s.replace("if (!found.has(F)) return no('the swap does not pay the fly itself');", '')],
  ['approve sans plafond', (s) => s.replace("if (word(d, 1) > A) return no('approves more than the amount paid');", '')],
  ['approve a tout spender', (s) => s.replace("if (!routers.has(addrAt(d, 0)) && addrAt(d, 0) !== lc(known.permit2)) return no(", "if (false) return no(")],
  ['transfer a tout le monde', (s) => s.replace("|| addrAt(d, 0) !== lc(known.feeWallet)) return no(", ") return no(")],
  ['frais sans plafond', (s) => s.replace("if (word(d, 1) * 10000n > A * MAX_FEE_BPS) return no('a fee above 1% of the amount paid');", '')],
  ['permit2 sans expiration', (s) => s.replace("if (word(d, 3) > BigInt(nowSec) + MAX_PERMIT_S) return no('Permit2 approval lasting more than 2 hours');", '')],
  ['ETH accepte', (s) => s.replace("if (v !== 0n) return no('ETH attached');", '')],
  ['tout contrat', (s) => s.replace("if (!routers.has(to)) return no('a call to an unknown contract ' + to);", '')],
  ['plan vide signe', (s) => s.replace("if (!Array.isArray(calls) || !calls.length) return { index: -1, why: 'no call to sign' };", "if (!Array.isArray(calls)) return { index: -1, why: 'no call to sign' };")],
  ['approve sur un autre jeton', (s) => s.replace("if (to !== P || d.length !== 138) return no('an approve that is not on the token paid');", "if (d.length !== 138) return no('an approve that is not on the token paid');")],
];
let tues = 0;
const source = readFileSync(join(ICI, 'fly-guard.js'), 'utf8');
for (const [nom, muter] of MUTANTS) {
  const muted = muter(source);
  if (muted === source) { console.log('  ' + nom + ' : MOTIF ABSENT'); continue; }
  const d = mkdtempSync(join(tmpdir(), 'flyguard-mut-'));
  writeFileSync(join(d, 'fly-guard.js'), muted);
  try { await banc(d); console.log('  ' + nom + ' : SURVIT'); } catch (e) { tues++; console.log('  ' + nom + ' : TUE (' + String(e.message).slice(0, 80) + ')'); }
}
assert.equal(tues, MUTANTS.length, 'MUTANTS : ' + tues + '/' + MUTANTS.length);
console.log('MUTANTS : ' + tues + '/' + MUTANTS.length + ' tues');
