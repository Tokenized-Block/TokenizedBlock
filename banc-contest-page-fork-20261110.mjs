// banc-contest-page-fork-20261110.mjs — FORK ONLY (base-anvil, FORK_URL, default http://127.0.0.1:8659).
// Proves that the call batches built by the PAGE module (block-contest.js) work against the DEPLOYED BlockContest contract.
// Every state-changing contest call is built by the module (enterBatch, voteBatch, buildSettle, buildClaim) and sent, call by
// call and in order, from an impersonated wallet with eth_sendTransaction; every assertion that has a module reader uses it.
// The only calls not built by the module are the SETUP ones: anvil_* methods and the TBLOCK transfers that hand test wallets
// their tokens from the dead address (impersonated; the module has no transfer builder, and a page never does this).
// No private key, nothing signed, nothing broadcast: it refuses to run on a node that does not answer anvil_nodeInfo.
import * as C from './block-contest.js';
import { selecteur } from './keccak.js';

const FORK = process.env.FORK_URL || 'http://127.0.0.1:8659';
const DEAD = '0x000000000000000000000000000000000000dead';
/* candidates: blocks born on hook 7030 with the wallet its registry names (copied from contracts/test/BlockContest.fork.t.sol);
 * nothing here is trusted: each one must pass the module's readCreatorCheck on the fork or it is dropped */
const CANDIDATES = [
  { name: 'UNIT', block: '0xb2000000000000000000007AFa7ed748B0874f27', creator: '0x31e0DBc9038C82184B9fa6a90057a3ED500BdE3B' },
  { name: 'BLK2', block: '0xb200000000000000000000e0E18f3D8fD5A50164', creator: '0xcaFCEd36364578a1DFADac08ea59DD78eBf61B2a' },
].map((c) => ({ ...c, block: c.block.toLowerCase(), creator: c.creator.toLowerCase(),
  key: { currency0: '0x0000000000000000000000000000000000000000', currency1: c.block.toLowerCase(), fee: 0, tickSpacing: 200, hooks: C.HOOK } }));
const VOTERS = [1, 2, 3].map((i) => '0x00000000000000000000000000000000c0de000' + i);
const STRANGER = '0x00000000000000000000000000000000c0de0009';
const ERRORS = ['BadParams', 'Reentrancy', 'TransferFailed', 'RoundEnded', 'NotEntryWindow', 'NotVoteWindow', 'NotB20', 'AlreadyEntered',
  'WrongHook', 'NotInKey', 'NotCreator', 'NoSuchEntry', 'NotEnded', 'AlreadySettled', 'NothingToClaim', 'NoSurplus', 'PayeeAlreadyEntered',
  'RoundTooFar', 'NotBlockSide', 'GasReserve', 'NothingToBurn'];
const ERR_BY_SEL = new Map(ERRORS.map((n) => [selecteur(n + '()').toLowerCase(), n]));

let ok = 0, ko = 0;
const t = (name, cond, detail = '') => { if (cond) { ok++; console.log('ok  ', name); } else { ko++; console.log('KO  ', name, detail); } };
const say = (...a) => console.log('    ', ...a);
const u = (x) => C.formatUnits18(x, 6) + ' TBLOCK (' + x + ')';

const rpcRaw = async (m, p) => fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }) }).then((x) => x.json());
const rpc = async (m, p) => { const j = await rpcRaw(m, p); if (j.error) throw new Error(m + ' ' + JSON.stringify(j.error)); return j.result; };
try { await rpc('anvil_nodeInfo', []); } catch (_) { console.log('not an anvil fork: refusing to run'); process.exit(2); }

/* the read the page injects into the module */
const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const rd = (v) => call(v.to, v.data);
const bal = async (who) => C.decodeUint(await rd(C.VIEW.balanceOf(who)));
const allowance = async (who) => C.decodeUint(await rd(C.VIEW.allowance(who)));
const chainNow = async () => BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);
const warp = async (ts) => { await rpc('evm_setNextBlockTimestamp', ['0x' + BigInt(ts).toString(16)]); await rpc('evm_mine', []); };
const receipt = async (h) => { let r = null; for (let k = 0; k < 40 && !r; k++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) { await rpc('evm_mine', []).catch(() => null); await new Promise((o) => setTimeout(o, 250)); } } return r; };
const arm = async (who) => { await rpc('anvil_impersonateAccount', [who]); await rpc('anvil_setBalance', [who, '0x' + (10n ** 18n).toString(16)]); };
/* why a call would revert, asked BEFORE sending it (same from/to/data): the contract's error name, or '' */
async function whyRevert(from, c) {
  const j = await rpcRaw('eth_call', [{ from, to: c.to, data: c.data, value: c.value }, 'latest']);
  if (!j.error) return '';
  const d = String((j.error.data && (j.error.data.data || j.error.data)) || '').toLowerCase();
  return ERR_BY_SEL.get(d.slice(0, 10)) || ('revert ' + (d.slice(0, 10) || j.error.message));
}
/* one unsigned call of the module, sent as is from an impersonated wallet */
async function sendCall(from, c) {
  const why = await whyRevert(from, c);
  const r = await receipt(await rpc('eth_sendTransaction', [{ from, to: c.to, data: c.data, value: c.value, gas: '0x2dc6c0' }]));
  return { status: r && r.status, why, gasUsed: r ? BigInt(r.gasUsed) : 0n };
}
/* a batch of the module, in order; stops at the first call that fails (a wallet batch is atomic: here the earlier calls STAY) */
async function sendBatch(from, calls) {
  const out = [];
  for (const c of calls) { const r = await sendCall(from, c); out.push(r); if (r.status !== '0x1') break; }
  return { allOk: out.length === calls.length && out.every((r) => r.status === '0x1'), steps: out, last: out[out.length - 1] };
}
/* setup only: TBLOCK from the dead address (impersonated) to a test wallet */
async function give(to, amount) {
  const data = '0x' + selecteur('transfer(address,uint256)').replace(/^0x/, '') + C.wAddr(to) + C.wUint(amount);
  const r = await receipt(await rpc('eth_sendTransaction', [{ from: DEAD, to: C.TBLOCK, data, gas: '0x493e0' }]));
  if (!r || r.status !== '0x1') throw new Error('setup: could not hand TBLOCK to ' + to);
}

/* ------------------------------------------------------------------ what the contract says about itself */
const code = await rpc('eth_getCode', [C.CONTEST, 'latest']);
t('the contest contract has code on the fork', code && code.length > 4, code);
const P = await C.readParams(call);
say('GENESIS', P.genesis, 'ENTRY_PERIOD', P.entryPeriod, 'VOTE_PERIOD', P.votePeriod);
say('ENTRY_FEE', u(P.entryFee), '| VOTE_PRICE', u(P.votePrice), '| BURN_BPS', P.burnBps, '| SPLITS', P.split1, P.split2, P.split3);
say('MIN_VOTES', P.minVotes, 'MIN_VOTERS', P.minVoters, 'MIN_QUALIFIED_ENTRIES', P.minQualifiedEntries, '| MAX_POT', u(P.maxPot));
t('readParams: the contract was built with the module\'s TBLOCK and HOOK', P.tblock === C.TBLOCK && P.hook === C.HOOK, P.tblock + ' ' + P.hook);

/* creators the module itself accepts */
const eligible = [];
for (const c of CANDIDATES) {
  const chk = await C.readCreatorCheck(call, { blockToken: c.block, key: c.key, wallet: c.creator });
  say('readCreatorCheck', c.name, c.block, 'creator', c.creator, '->', chk.ok ? 'ok, poolId ' + chk.poolId : 'refused: ' + chk.why);
  if (chk.ok) eligible.push(c);
}
const TWO = eligible.length >= 2;
t('two creator-owned blocks on the hook pass readCreatorCheck', TWO, 'found ' + eligible.length);
if (!eligible.length) { console.log('no eligible creator-owned block: nothing can be entered'); console.log('banc-contest-page-fork : ' + ok + ' ok, ' + (ko + 1) + ' KO'); process.exit(1); }
if (!TWO) say('ONLY ONE eligible block: the round must NOT pay; the no-quorum rollover is asserted instead');
const A = eligible[0], B = eligible[1] || null;

for (const w of [A.creator, B && B.creator, ...VOTERS, STRANGER, DEAD].filter(Boolean)) await arm(w);
const deadStart = await bal(DEAD);
say('dead address holds', u(deadStart), 'before the setup');
const stake = P.entryFee * 3n + P.votePrice * 10n;
for (const w of [A.creator, B && B.creator, ...VOTERS, STRANGER].filter(Boolean)) await give(w, stake);
say('setup: each test wallet received', u(stake), 'from the dead address (fork only)');

/* ------------------------------------------------------------------ 1. before GENESIS */
let now = await chainNow();
let when = C.phaseAt(P, now);
say('chain time', now, 'phaseAt ->', when.phase, 'round', when.round, 'seconds left', when.secondsLeft);
const R = when.phase === 'BEFORE_START' ? 0n : when.round + 1n; /* the round this bench plays: the first one not started yet */
if (when.phase === 'BEFORE_START') {
  t('1. phaseAt says BEFORE_START before GENESIS', true);
  const r = await sendBatch(A.creator, C.enterBatch({ blockToken: A.block, key: A.key, entryFee: P.entryFee }));
  t('1. enterBatch before GENESIS: the enter call fails (NotEntryWindow)', !r.allOk && r.last.status === '0x0' && r.last.why === 'NotEntryWindow', JSON.stringify(r.steps.map((s) => [s.status, s.why])));
  t('1. no entry was recorded', (await C.readRound(call, 0n)).entryCount === 0);
} else {
  t('1. the fork is before GENESIS', false, 'the fork is already at ' + when.phase + ' of round ' + when.round + ': the before-start case was NOT tested');
}

/* ------------------------------------------------------------------ 2. entry window */
await warp(C.roundStart(P, R) + 60n);
now = await chainNow(); when = C.phaseAt(P, now);
t('2. after the warp phaseAt says ENTRY of round ' + R, when.phase === 'ENTRY' && when.round === R, when.phase + ' ' + when.round);
t('2. the contract agrees on the round (currentRound)', C.decodeUint(await rd(C.VIEW.currentRound())) === R);
const r0 = await C.readRound(call, R);
say('round', R, 'before the entries: pot', u(r0.pot), 'entries', r0.entryCount, 'room under the cap', u(C.decodeUint(await rd(C.VIEW.fundRoom(R)))));
const feeFits = P.maxPot - r0.pot >= P.entryFee * 2n;
if (!feeFits) say('NOTE: the round is too close to its cap for both fees: the contract places the overflow in the next rounds');

async function enterAndMeasure(c, label) {
  const b0 = await bal(c.creator), pot0 = (await C.readRound(call, R)).pot, li0 = C.decodeUint(await rd(C.VIEW.liabilities()));
  const chk = await C.readCreatorCheck(call, { blockToken: c.block, key: c.key, wallet: c.creator });
  const r = await sendBatch(c.creator, C.enterBatch({ blockToken: c.block, key: c.key, entryFee: P.entryFee }));
  const b1 = await bal(c.creator), rr = await C.readRound(call, R), li1 = C.decodeUint(await rd(C.VIEW.liabilities()));
  say(label, c.name, 'batch of', r.steps.length, 'call(s), status', r.steps.map((s) => s.status).join(' '), 'gas', r.steps.map((s) => s.gasUsed).join(' + '));
  say(label, 'wallet delta', b1 - b0, '| pot delta', rr.pot - pot0, '| liabilities delta', li1 - li0, '| allowance left', await allowance(c.creator));
  t('2. ' + label + ': readCreatorCheck ok and enterBatch succeeds', chk.ok && r.allOk, JSON.stringify(r.steps.map((s) => [s.status, s.why])));
  t('2. ' + label + ': exactly the entry fee left the wallet', b0 - b1 === P.entryFee, String(b0 - b1));
  if (feeFits) t('2. ' + label + ': the round pot grew by the entry fee', rr.pot - pot0 === P.entryFee, String(rr.pot - pot0));
  t('2. ' + label + ': liabilities grew by the entry fee', li1 - li0 === P.entryFee, String(li1 - li0));
  t('2. ' + label + ': allowance left = 0', (await allowance(c.creator)) === 0n);
  const e = rr.entries.find((x) => x.blockToken === c.block);
  t('2. ' + label + ': the entry names the block and pays its creator', !!e && e.payee === c.creator, JSON.stringify(e, (k, v) => typeof v === 'bigint' ? String(v) : v));
  t('2. ' + label + ': entered / enteredBy are true', C.decodeBool(await rd(C.VIEW.entered(R, c.block))) && C.decodeBool(await rd(C.VIEW.enteredBy(R, c.creator))));
  return e ? e.id : -1;
}
const idA = await enterAndMeasure(A, 'entry A');

/* negative: a vote during the entry window */
{
  const b0 = await bal(VOTERS[0]);
  const r = await sendBatch(VOTERS[0], C.voteBatch({ round: R, entryId: idA, votes: 1n, votePrice: P.votePrice }));
  t('2. voteBatch in the entry window fails (NotVoteWindow) and costs nothing', !r.allOk && r.last.status === '0x0' && r.last.why === 'NotVoteWindow' && (await bal(VOTERS[0])) === b0, JSON.stringify(r.steps.map((s) => [s.status, s.why])));
}
/* negative: a wallet that is not the creator, with someone else's block (B before B enters, else A's) */
{
  const target = B || A;
  const chk = await C.readCreatorCheck(call, { blockToken: target.block, key: target.key, wallet: STRANGER });
  t('2. readCreatorCheck refuses a non-creator wallet', chk.ok === false && chk.creator === target.creator, JSON.stringify(chk));
  const b0 = await bal(STRANGER), n0 = (await C.readRound(call, R)).entryCount;
  const r = await sendBatch(STRANGER, C.enterBatch({ blockToken: target.block, key: target.key, entryFee: P.entryFee }));
  const expected = B ? 'NotCreator' : 'AlreadyEntered';
  say('non-creator enter of', target.name, '->', r.last.status, r.last.why);
  t('2. a non-creator enterBatch fails (' + expected + '), no fee taken, no entry added', !r.allOk && r.last.status === '0x0' && r.last.why === expected && (await bal(STRANGER)) === b0 && (await C.readRound(call, R)).entryCount === n0, JSON.stringify(r.steps.map((s) => [s.status, s.why])));
}
const idB = B ? await enterAndMeasure(B, 'entry B') : -1;
/* negative: the same creator again */
{
  const b0 = await bal(A.creator);
  const r = await sendBatch(A.creator, C.enterBatch({ blockToken: A.block, key: A.key, entryFee: P.entryFee }));
  say('second enter by the same creator ->', r.last.status, r.last.why);
  t('2. the same creator entering twice fails (AlreadyEntered), no second fee', !r.allOk && r.last.status === '0x0' && r.last.why === 'AlreadyEntered' && (await bal(A.creator)) === b0, JSON.stringify(r.steps.map((s) => [s.status, s.why])));
}
const r1 = await C.readRound(call, R);
t('2. entries count = ' + (TWO ? 2 : 1) + ' more than before', r1.entryCount - r0.entryCount === (TWO ? 2 : 1), String(r1.entryCount));
say('round', R, 'after the entries: pot', u(r1.pot), 'entries', r1.entryCount);

/* ------------------------------------------------------------------ 3. vote window */
await warp(C.voteStart(P, R) + 60n);
now = await chainNow(); when = C.phaseAt(P, now);
t('3. after the warp phaseAt says VOTE of round ' + R, when.phase === 'VOTE' && when.round === R, when.phase + ' ' + when.round);
const pendingBefore = C.decodeUint(await rd(C.VIEW.pendingBurn()));
let burnedTotal = 0n, votesCast = 0n;
async function voteAndMeasure(voter, entryId, votes, label) {
  const cost = C.voteCost(votes, P.votePrice), split = C.voteSplit(cost, P);
  const b0 = await bal(voter), d0 = await bal(DEAD), pot0 = (await C.readRound(call, R)).pot, pb0 = C.decodeUint(await rd(C.VIEW.pendingBurn()));
  const r = await sendBatch(voter, C.voteBatch({ round: R, entryId, votes, votePrice: P.votePrice }));
  const b1 = await bal(voter), d1 = await bal(DEAD), pot1 = (await C.readRound(call, R)).pot, pb1 = C.decodeUint(await rd(C.VIEW.pendingBurn()));
  say(label, 'status', r.steps.map((s) => s.status).join(' '), 'gas', r.steps.map((s) => s.gasUsed).join(' + '), '| voter delta', b1 - b0, '| dead delta', d1 - d0, '| pot delta', pot1 - pot0, '| pendingBurn delta', pb1 - pb0);
  t('3. ' + label + ': voteBatch succeeds', r.allOk, JSON.stringify(r.steps.map((s) => [s.status, s.why])));
  t('3. ' + label + ': exactly the cost left the voter', b0 - b1 === cost, String(b0 - b1));
  t('3. ' + label + ': the dead address received the burned share directly (pendingBurn unchanged)', d1 - d0 === split.burned && pb1 === pb0, (d1 - d0) + ' vs ' + split.burned + ', pendingBurn ' + pb1);
  t('3. ' + label + ': the pot moved by the pot share only', pot1 - pot0 === split.toPot, String(pot1 - pot0));
  t('3. ' + label + ': allowance left = 0 and hasVoted is true', (await allowance(voter)) === 0n && C.decodeBool(await rd(C.VIEW.hasVoted(R, entryId, voter))));
  if (r.allOk) { burnedTotal += d1 - d0; votesCast += BigInt(votes); }
}
for (let i = 0; i < VOTERS.length; i++) {
  await voteAndMeasure(VOTERS[i], idA, 1n, 'voter ' + (i + 1) + ' -> A');
  if (TWO) await voteAndMeasure(VOTERS[i], idB, 1n, 'voter ' + (i + 1) + ' -> B');
}
if (TWO) await voteAndMeasure(VOTERS[0], idA, 1n, 'voter 1 -> A (extra)');
const r2 = await C.readRound(call, R);
const eA = r2.entries.find((e) => e.id === idA), eB = TWO ? r2.entries.find((e) => e.id === idB) : null;
say('entry A: votes', eA.votes, 'voters', eA.voters, 'qualified', eA.qualified, eB ? '| entry B: votes ' + eB.votes + ' voters ' + eB.voters + ' qualified ' + eB.qualified : '');
say('round', R, ': totalVotes', r2.totalVotes, 'qualifiedCount', r2.qualifiedCount, 'topIds', JSON.stringify(r2.topIds), 'pot', u(r2.pot), '| burned in total', u(burnedTotal));
t('3. readRound: A has ' + (TWO ? 4 : 3) + ' votes from 3 voters', eA.votes === (TWO ? 4n : 3n) && eA.voters === 3n);
t('3. entryQualifies(A) is true and the contract flags it qualified', C.entryQualifies(eA, P) && eA.qualified);
t('3. readRound: totalVotes = votes cast', r2.totalVotes - r0.totalVotes === votesCast, r2.totalVotes + ' vs ' + votesCast);
t('3. total burned = votes cast x vote price x BURN_BPS', burnedTotal === C.voteSplit(votesCast * P.votePrice, P).burned, String(burnedTotal));
t('3. pendingBurn did not move during the votes', C.decodeUint(await rd(C.VIEW.pendingBurn())) === pendingBefore);
if (TWO) {
  t('3. readRound: B has 3 votes from 3 voters', eB.votes === 3n && eB.voters === 3n);
  t('3. entryQualifies(B) is true and the contract flags it qualified', C.entryQualifies(eB, P) && eB.qualified);
  t('3. qualifiedCount = 2 and roundQualifies is true', r2.qualifiedCount === 2n && C.roundQualifies(r2.qualifiedCount, P));
  t('3. the podium is [A, B]', r2.topIds[0] === idA && r2.topIds[1] === idB, JSON.stringify(r2.topIds));
} else {
  t('3. one qualified entry only: roundQualifies is false', r2.qualifiedCount === 1n && !C.roundQualifies(r2.qualifiedCount, P), String(r2.qualifiedCount));
}

/* ------------------------------------------------------------------ 4. settle */
{ /* negative: before the end */
  const r = await sendBatch(STRANGER, [C.buildSettle(R)]);
  t('4. buildSettle before the round end fails (NotEnded)', r.last.status === '0x0' && r.last.why === 'NotEnded', JSON.stringify(r.steps.map((s) => [s.status, s.why])));
}
await warp(C.roundEnd(P, R) + 1n);
now = await chainNow();
const sBefore = await C.readState(call, { now, params: P });
const pastBefore = sBefore.past.find((x) => x.round === R);
const pot = pastBefore ? pastBefore.pot : -1n;
const prize = C.prizesOf(pot < 0n ? 0n : pot, P)[0];
say('after the end: readState chainRound', sBefore.chainRound, 'round', R, 'pot', u(pot < 0n ? 0n : pot), 'outcome', pastBefore && pastBefore.outcome.state, '| prizesOf(pot)[0]', u(prize));
t('4. readState before settle: round ' + R + ' is ' + (TWO ? 'TO_PAY with winner A' : 'NO_WINNER_YET'), !!pastBefore && (TWO
  ? pastBefore.outcome.state === 'TO_PAY' && pastBefore.outcome.winner.payee === A.creator
  : pastBefore.outcome.state === 'NO_WINNER_YET'), pastBefore && pastBefore.outcome.state);
const toRound = sBefore.chainRound + 1n;
const a0 = await bal(A.creator), bB0 = B ? await bal(B.creator) : 0n, c0 = await bal(C.CONTEST), li0 = sBefore.liabilities, d0 = await bal(DEAD);
const potTo0 = (await C.readRound(call, toRound)).pot;
const st = await sendBatch(STRANGER, [C.buildSettle(R)]);
const a1 = await bal(A.creator), bB1 = B ? await bal(B.creator) : 0n, c1 = await bal(C.CONTEST), d1 = await bal(DEAD);
const sAfter = await C.readState(call, { now: await chainNow(), params: P });
const pastAfter = sAfter.past.find((x) => x.round === R);
const potTo1 = (await C.readRound(call, toRound)).pot;
say('settle(' + R + ') by a stranger: status', st.last.status, st.last.why, 'gas', st.last.gasUsed);
say('payee A delta', a1 - a0, '| payee B delta', bB1 - bB0, '| contract delta', c1 - c0, '| liabilities delta', sAfter.liabilities - li0, '| round ' + toRound + ' pot delta', potTo1 - potTo0, '| dead delta', d1 - d0);
t('4. buildSettle(' + R + ') from any wallet succeeds', st.allOk, JSON.stringify(st.steps.map((s) => [s.status, s.why])));
t('4. the round is settled and its pot is 0', !!pastAfter && pastAfter.settled && pastAfter.pot === 0n);
if (TWO) {
  t('4. payee A received exactly prizesOf(pot)[0]', a1 - a0 === prize && prize > 0n, (a1 - a0) + ' vs ' + prize);
  t('4. payee B received exactly prizesOf(pot)[1]', bB1 - bB0 === C.prizesOf(pot, P)[1], String(bB1 - bB0));
  t('4. readState after settle: PAID, winner A', pastAfter.outcome.state === 'PAID' && pastAfter.outcome.winner.payee === A.creator && pastAfter.outcome.winner.id === idA, pastAfter.outcome.state);
  t('4. nothing was deferred: claimable(A) = 0', C.decodeUint(await rd(C.VIEW.claimable(A.creator))) === 0n);
  const paid = C.prizesOf(pot, P).reduce((s, x) => s + x, 0n);
  t('4. the contract paid out exactly the prizes, liabilities fell by the same', c0 - c1 === paid && li0 - sAfter.liabilities === paid, (c0 - c1) + ' / ' + (li0 - sAfter.liabilities));
  t('4. the unpaid rest of the pot rolled to round ' + toRound, potTo1 - potTo0 === pot - paid, String(potTo1 - potTo0));
} else {
  t('4. no quorum: nobody was paid', a1 === a0 && c1 === c0, (a1 - a0) + ' / ' + (c1 - c0));
  t('4. no quorum: the whole pot rolled to round ' + toRound + ' (nothing burned)', potTo1 - potTo0 === pot && d1 === d0 && sAfter.liabilities === li0, (potTo1 - potTo0) + ' vs ' + pot);
  t('4. readState after settle: NO_WINNER', pastAfter.outcome.state === 'NO_WINNER', pastAfter.outcome.state);
}
t('4. the contract still holds at least its liabilities', c1 >= sAfter.liabilities, c1 + ' vs ' + sAfter.liabilities);
{ /* negatives: settle twice; claim with no credit */
  const again = await sendBatch(STRANGER, [C.buildSettle(R)]);
  t('4. settling the same round twice fails (AlreadySettled)', again.last.status === '0x0' && again.last.why === 'AlreadySettled', JSON.stringify([again.last.status, again.last.why]));
  const cl = await sendBatch(A.creator, [C.buildClaim(A.creator)]);
  t('4. buildClaim with no credit fails (NothingToClaim): the call reaches claim()', cl.last.status === '0x0' && cl.last.why === 'NothingToClaim', JSON.stringify([cl.last.status, cl.last.why]));
}

for (const w of [A.creator, B && B.creator, ...VOTERS, STRANGER, DEAD].filter(Boolean)) await rpc('anvil_stopImpersonatingAccount', [w]).catch(() => null);
console.log('banc-contest-page-fork : ' + ok + ' ok, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
