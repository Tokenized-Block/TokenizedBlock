/* block-contest.js — the block contest (BlockContest, Base mainnet), seen from a page: unsigned calls and decoded reads.
 * PURE: no DOM, no network. Reads are injected as `call(to, data) -> hex`; every builder returns an UNSIGNED { to, data, value }.
 * Nothing here signs or sends: the user's own wallet does.
 * Every signature below is copied from contracts/src/BlockContest.sol; the 4-byte prefixes are COMPUTED (keccak.js), never typed,
 * and test-block-contest-ui-20261110.mjs recomputes each one from the Solidity source.
 * The three addresses are copies of block-contest-deploiement.js (adresse, config.tblock, config.hook); the bench compares them
 * to that record, so a drift fails there. The contract's NUMBERS (periods, prices, quorum, cap) are not copied here: they are
 * read on chain by readParams(). */
import { selecteur, keccak256Hex } from './keccak.js';
import { symboleDepuisReponse } from './texte-onchain.js';

export const CONTEST = '0x001ead57218f3ab79e2dcacb05ddfc4574ef177c';
export const CONTEST_DEPLOY_BLOCK = 55357716;
export const TBLOCK = '0xb200000000000000000000ba9bf8330307f8830e';
export const HOOK = '0x32f3f572dd17625bab9035789c953e1d001864cc';
export const CHAIN_ID_HEX = '0x2105';
export const BPS = 10000n;
const KEY_TUPLE = '(address,address,uint24,int24,address)';

/* name -> canonical signature (tuple = the pool key struct of the contract) */
export const SIGNATURES = Object.freeze({
  /* gestures */
  enter: 'enter(address,' + KEY_TUPLE + ')',
  vote: 'vote(uint256,uint256,uint256)',
  settle: 'settle(uint256)',
  claim: 'claim(address)',
  fund: 'fund(uint256,uint256)',
  sweepSurplus: 'sweepSurplus()',
  flushBurn: 'flushBurn()',
  /* views */
  currentRound: 'currentRound()',
  roundLength: 'roundLength()',
  roundStart: 'roundStart(uint256)',
  voteStart: 'voteStart(uint256)',
  roundEnd: 'roundEnd(uint256)',
  qualifiedCount: 'qualifiedCount(uint256)',
  fundRoom: 'fundRoom(uint256)',
  roundInfo: 'roundInfo(uint256)',
  entryCount: 'entryCount(uint256)',
  entryOf: 'entryOf(uint256,uint256)',
  sidesOf: 'sidesOf(' + KEY_TUPLE + ')',
  creatorOf: 'creatorOf(bytes32)',
  isPairCurrency: 'isPairCurrency(address)',
  entered: 'entered(uint256,address)',
  enteredBy: 'enteredBy(uint256,address)',
  hasVoted: 'hasVoted(uint256,uint256,address)',
  claimable: 'claimable(address)',
  liabilities: 'liabilities()',
  pendingBurn: 'pendingBurn()',
  /* fixed numbers of the contract (public getters) */
  TBLOCK: 'TBLOCK()', HOOK: 'HOOK()', GENESIS: 'GENESIS()', ENTRY_PERIOD: 'ENTRY_PERIOD()', VOTE_PERIOD: 'VOTE_PERIOD()',
  VOTE_PRICE: 'VOTE_PRICE()', ENTRY_FEE: 'ENTRY_FEE()', BURN_BPS: 'BURN_BPS()', SPLIT1: 'SPLIT1()', SPLIT2: 'SPLIT2()', SPLIT3: 'SPLIT3()',
  MIN_VOTES: 'MIN_VOTES()', MIN_VOTERS: 'MIN_VOTERS()', MIN_QUALIFIED_ENTRIES: 'MIN_QUALIFIED_ENTRIES()', MAX_POT: 'MAX_POT()',
  MAX_FUND_AHEAD: 'MAX_FUND_AHEAD()', FUND_AHEAD_MAX: 'FUND_AHEAD_MAX()', DEAD: 'DEAD()',
});
/* the token side (ERC-20 surface of TBLOCK) */
export const TOKEN_SIGNATURES = Object.freeze({
  approve: 'approve(address,uint256)', allowance: 'allowance(address,address)', balanceOf: 'balanceOf(address)', symbol: 'symbol()',
});

const strip = (h) => String(h).toLowerCase().replace(/^0x/, '');
export const SEL = Object.freeze(Object.fromEntries(Object.entries(SIGNATURES).map(([k, s]) => [k, strip(selecteur(s))])));
export const TOKEN_SEL = Object.freeze(Object.fromEntries(Object.entries(TOKEN_SIGNATURES).map(([k, s]) => [k, strip(selecteur(s))])));

/* ------------------------------------------------------------------ encoding (strict: a bad input throws, it is never padded) */
const ADR = /^0x[0-9a-f]{40}$/;
const MAX256 = (1n << 256n) - 1n;
export function wAddr(a) {
  const s = String(a).toLowerCase();
  if (!ADR.test(s)) throw new Error('not an address: ' + a);
  return s.slice(2).padStart(64, '0');
}
export function wUint(x, bits = 256) {
  const n = typeof x === 'bigint' ? x : BigInt(x);
  if (n < 0n || n >= (1n << BigInt(bits))) throw new Error('out of range for uint' + bits + ': ' + n);
  return n.toString(16).padStart(64, '0');
}
export function wInt24(x) {
  const n = BigInt(x);
  if (n < -(1n << 23n) || n >= (1n << 23n)) throw new Error('out of range for int24: ' + n);
  return BigInt.asUintN(256, n).toString(16).padStart(64, '0');
}
export function wBytes32(h) {
  const s = strip(h);
  if (!/^[0-9a-f]{64}$/.test(s)) throw new Error('not a 32-byte word: ' + h);
  return s;
}
/** the five words of a pool key { currency0, currency1, fee, tickSpacing, hooks } */
export function wKey(k) {
  if (!k) throw new Error('pool key required');
  return wAddr(k.currency0) + wAddr(k.currency1) + wUint(k.fee, 24) + wInt24(k.tickSpacing) + wAddr(k.hooks);
}
/** keccak256(abi.encode(key)) — what the contract computes itself before asking who created the pool */
export function poolIdOfKey(k) {
  const hex = wKey(k);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return keccak256Hex(bytes);
}

const callTo = (to, sel, args = '') => Object.freeze({ to, data: '0x' + sel + args, value: '0x0' });

/* ------------------------------------------------------------------ unsigned gestures */
export const buildApprove = (amount) => {
  const n = BigInt(amount);
  if (n <= 0n) throw new Error('approval amount must be positive');
  return callTo(TBLOCK, TOKEN_SEL.approve, wAddr(CONTEST) + wUint(n));
};
export const buildEnter = (blockToken, key) => callTo(CONTEST, SEL.enter, wAddr(blockToken) + wKey(key));
export const buildVote = (round, entryId, votes) => {
  const v = BigInt(votes);
  if (v <= 0n || v >= (1n << 64n)) throw new Error('votes must be between 1 and 2^64-1');
  return callTo(CONTEST, SEL.vote, wUint(round) + wUint(entryId) + wUint(v));
};
export const buildSettle = (round) => callTo(CONTEST, SEL.settle, wUint(round));
export const buildClaim = (to) => callTo(CONTEST, SEL.claim, wAddr(to));
export const buildFund = (round, amount) => {
  if (BigInt(amount) <= 0n) throw new Error('amount must be positive');
  return callTo(CONTEST, SEL.fund, wUint(round) + wUint(amount));
};
export const buildSweepSurplus = () => callTo(CONTEST, SEL.sweepSurplus);
export const buildFlushBurn = () => callTo(CONTEST, SEL.flushBurn);

/** what `votes` votes cost, in raw TBLOCK units (the contract: votes * VOTE_PRICE) */
export function voteCost(votes, votePrice) {
  const v = BigInt(votes), p = BigInt(votePrice);
  if (v <= 0n || p <= 0n) throw new Error('votes and vote price must be positive');
  const c = v * p;
  if (c > MAX256) throw new Error('vote cost overflows');
  return c;
}
/** ONE batch: approve EXACTLY the cost, then vote. Never an unlimited approval. */
export function voteBatch({ round, entryId, votes, votePrice }) {
  const cost = voteCost(votes, votePrice);
  return Object.freeze([buildApprove(cost), buildVote(round, entryId, votes)]);
}
/** ONE batch: approve EXACTLY the entry fee (when there is one), then enter. */
export function enterBatch({ blockToken, key, entryFee }) {
  const fee = BigInt(entryFee);
  if (fee < 0n) throw new Error('entry fee cannot be negative');
  const enter = buildEnter(blockToken, key);
  return Object.freeze(fee === 0n ? [enter] : [buildApprove(fee), enter]);
}
/** ONE batch: approve EXACTLY what fund() will pull — the contract clips the amount to the room left under the cap. */
export function fundBatch({ round, amount, room }) {
  const a = BigInt(amount), r = BigInt(room);
  if (a <= 0n) throw new Error('amount must be positive');
  if (r <= 0n) throw new Error('this round is already at its cap');
  const pulled = a < r ? a : r;
  return Object.freeze([buildApprove(pulled), buildFund(round, pulled)]);
}

/* ------------------------------------------------------------------ view calls ({ to, data } for an eth_call) */
const view = (to, sel, args = '') => Object.freeze({ to, data: '0x' + sel + args });
export const VIEW = Object.freeze({
  param: (name) => { if (!(name in SEL)) throw new Error('unknown getter ' + name); return view(CONTEST, SEL[name]); },
  currentRound: () => view(CONTEST, SEL.currentRound),
  roundInfo: (r) => view(CONTEST, SEL.roundInfo, wUint(r)),
  qualifiedCount: (r) => view(CONTEST, SEL.qualifiedCount, wUint(r)),
  fundRoom: (r) => view(CONTEST, SEL.fundRoom, wUint(r)),
  entryOf: (r, id) => view(CONTEST, SEL.entryOf, wUint(r) + wUint(id)),
  entered: (r, blockToken) => view(CONTEST, SEL.entered, wUint(r) + wAddr(blockToken)),
  enteredBy: (r, payee) => view(CONTEST, SEL.enteredBy, wUint(r) + wAddr(payee)),
  hasVoted: (r, id, voter) => view(CONTEST, SEL.hasVoted, wUint(r) + wUint(id) + wAddr(voter)),
  claimable: (payee) => view(CONTEST, SEL.claimable, wAddr(payee)),
  creatorOf: (poolId) => view(CONTEST, SEL.creatorOf, wBytes32(poolId)),
  sidesOf: (key) => view(CONTEST, SEL.sidesOf, wKey(key)),
  isPairCurrency: (a) => view(CONTEST, SEL.isPairCurrency, wAddr(a)),
  liabilities: () => view(CONTEST, SEL.liabilities),
  pendingBurn: () => view(CONTEST, SEL.pendingBurn),
  balanceOf: (who, token = TBLOCK) => view(token, TOKEN_SEL.balanceOf, wAddr(who)),
  allowance: (owner) => view(TBLOCK, TOKEN_SEL.allowance, wAddr(owner) + wAddr(CONTEST)),
  symbol: (token) => view(token, TOKEN_SEL.symbol),
});

/* ------------------------------------------------------------------ decoding (strict: a wrong length throws, never a silent 0) */
export function words(hex, n) {
  const s = strip(hex);
  if (!/^[0-9a-f]*$/.test(s) || s.length !== 64 * n) throw new Error('expected ' + n + ' word(s), got ' + s.length / 64);
  const out = [];
  for (let i = 0; i < n; i++) out.push(s.slice(64 * i, 64 * i + 64));
  return out;
}
const toUint = (w) => BigInt('0x' + w);
function toAddr(w) {
  if (!/^0{24}/.test(w)) throw new Error('not a clean address word');
  return '0x' + w.slice(24);
}
function toBool(w) {
  const n = toUint(w);
  if (n !== 0n && n !== 1n) throw new Error('not a boolean word');
  return n === 1n;
}
export const decodeUint = (hex) => toUint(words(hex, 1)[0]);
export const decodeAddress = (hex) => toAddr(words(hex, 1)[0]);
export const decodeBool = (hex) => toBool(words(hex, 1)[0]);
/** roundInfo(r): pot, totalVotes, entries, settled, topIds[3], topCount. Only the first topCount ids mean something. */
export function decodeRoundInfo(hex) {
  const w = words(hex, 8);
  const topCount = Number(toUint(w[7]));
  if (topCount > 3) throw new Error('top count above 3');
  return {
    pot: toUint(w[0]), totalVotes: toUint(w[1]), entryCount: Number(toUint(w[2])), settled: toBool(w[3]),
    topIds: [w[4], w[5], w[6]].slice(0, topCount).map((x) => Number(toUint(x))), topCount,
  };
}
/** entryOf(r, id): blockToken, payee, votes, voters (distinct addresses), qualified */
export function decodeEntry(hex) {
  const w = words(hex, 5);
  return { blockToken: toAddr(w[0]), payee: toAddr(w[1]), votes: toUint(w[2]), voters: toUint(w[3]), qualified: toBool(w[4]) };
}
/** sidesOf(key): (paired, block) */
export function decodeSides(hex) {
  const w = words(hex, 2);
  return { paired: toAddr(w[0]), block: toAddr(w[1]) };
}
/** a symbol() answer, through the ONE string decoder of the app (texte-onchain.js: UTF-8, cleaned for the screen), 16 characters
 *  at most; an answer it cannot read throws, so the caller shows nothing instead of garbage */
export function decodeString(hex) {
  const s = symboleDepuisReponse(hex, 16);
  if (!s) throw new Error('not a readable string');
  return s;
}

/* ------------------------------------------------------------------ the rules, as arithmetic (mirrors of the contract's views) */
export const PARAM_NAMES = Object.freeze(['GENESIS', 'ENTRY_PERIOD', 'VOTE_PERIOD', 'VOTE_PRICE', 'ENTRY_FEE', 'BURN_BPS', 'SPLIT1', 'SPLIT2',
  'SPLIT3', 'MIN_VOTES', 'MIN_VOTERS', 'MIN_QUALIFIED_ENTRIES', 'MAX_POT', 'MAX_FUND_AHEAD', 'FUND_AHEAD_MAX']);
const CAMEL = (n) => n.toLowerCase().replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

/** the contract's fixed numbers, read on chain (all bigint) + the two addresses it was built with */
export async function readParams(call) {
  const p = {};
  for (const name of PARAM_NAMES) { const v = VIEW.param(name); p[CAMEL(name)] = decodeUint(await call(v.to, v.data)); }
  for (const name of ['TBLOCK', 'HOOK']) { const v = VIEW.param(name); p[name.toLowerCase()] = decodeAddress(await call(v.to, v.data)); }
  return Object.freeze(p);
}
export const roundLength = (p) => p.entryPeriod + p.votePeriod;
export const roundStart = (p, r) => p.genesis + BigInt(r) * roundLength(p);
export const voteStart = (p, r) => roundStart(p, r) + p.entryPeriod;
export const roundEnd = (p, r) => roundStart(p, r) + roundLength(p);

/** where `now` (unix seconds) falls. BEFORE_START: nothing is open; ENTRY: creators enter; VOTE: votes are bought. */
export function phaseAt(p, now) {
  const t = BigInt(now);
  if (t < p.genesis) return { phase: 'BEFORE_START', round: 0n, endsAt: p.genesis, secondsLeft: p.genesis - t };
  const round = (t - p.genesis) / roundLength(p);
  const vs = voteStart(p, round), end = roundEnd(p, round);
  return t < vs
    ? { phase: 'ENTRY', round, endsAt: vs, secondsLeft: vs - t, roundEndsAt: end }
    : { phase: 'VOTE', round, endsAt: end, secondsLeft: end - t, roundEndsAt: end };
}
/** an entry counts toward the quorum once it has the minimum votes AND the minimum distinct voter addresses */
export const entryQualifies = (e, p) => e.votes >= p.minVotes && e.voters >= p.minVoters;
/** a round pays only if enough entries qualified */
export const roundQualifies = (qualifiedCount, p) => BigInt(qualifiedCount) >= p.minQualifiedEntries;
/** what each podium place would get from `pot` (floor, like the contract): [first, second, third] */
export const prizesOf = (pot, p) => [p.split1, p.split2, p.split3].map((s) => BigInt(pot) * s / BPS);
/** share of a vote that is sent to the dead address, and the share that goes to the pot */
export function voteSplit(cost, p) {
  const burned = BigInt(cost) * p.burnBps / BPS;
  return { burned, toPot: BigInt(cost) - burned };
}

/** one round: its totals, its quorum count, and its entries (at most maxEntries are read; the rest is counted, not hidden) */
export async function readRound(call, r, { maxEntries = 40 } = {}) {
  const rd = (v) => call(v.to, v.data);
  const info = decodeRoundInfo(await rd(VIEW.roundInfo(r)));
  const qualifiedCount = decodeUint(await rd(VIEW.qualifiedCount(r)));
  const n = Math.min(info.entryCount, maxEntries);
  const entries = [];
  for (let id = 0; id < n; id++) entries.push({ id, ...decodeEntry(await rd(VIEW.entryOf(r, id))) });
  return { round: BigInt(r), ...info, qualifiedCount, entries, entriesNotRead: info.entryCount - n };
}
/** the podium of a round: ranked ids (qualified entries only, most votes first) joined to their entry when it was read */
export function podiumOf(round) {
  return round.topIds.map((id) => round.entries.find((e) => e.id === id) || { id, notRead: true });
}
/** a finished round in one line: PAID / TO_PAY (quorum reached; settled or not) or NO_WINNER / NO_WINNER_YET (quorum missed) */
export function outcomeOf(round, p) {
  const quorum = roundQualifies(round.qualifiedCount, p) && round.topCount > 0;
  if (!quorum) return { state: round.settled ? 'NO_WINNER' : 'NO_WINNER_YET', winner: null };
  return { state: round.settled ? 'PAID' : 'TO_PAY', winner: podiumOf(round)[0] };
}

/** everything the page shows, from injected reads. `now` = unix seconds (the page passes the chain's own clock). */
export async function readState(call, { now, pastRounds = 3, maxEntries = 40, params = null } = {}) {
  const p = params || await readParams(call);
  const rd = (v) => call(v.to, v.data);
  const chainRound = decodeUint(await rd(VIEW.currentRound()));
  const when = phaseAt(p, now);
  const current = await readRound(call, chainRound, { maxEntries });
  const past = [];
  if (when.phase !== 'BEFORE_START') {
    for (let r = chainRound - 1n, k = 0; r >= 0n && k < pastRounds; r--, k++) {
      const pr = await readRound(call, r, { maxEntries });
      past.push({ ...pr, outcome: outcomeOf(pr, p) });
    }
  }
  return {
    params: p, when, chainRound, current, past,
    qualified: roundQualifies(current.qualifiedCount, p),
    prizes: prizesOf(current.pot, p),
    liabilities: decodeUint(await rd(VIEW.liabilities())),
    pendingBurn: decodeUint(await rd(VIEW.pendingBurn())),
    /* the local clock and the chain disagree on the round (a clock off by more than the gap to a boundary): the page says so */
    clockMismatch: when.phase !== 'BEFORE_START' && when.round !== chainRound,
  };
}

/** is `wallet` the creator the contract will accept for `blockToken` with `key`? Both answers come from the contract's own views. */
export async function readCreatorCheck(call, { blockToken, key, wallet }) {
  const b = String(blockToken).toLowerCase(), w = String(wallet).toLowerCase();
  if (String(key.hooks).toLowerCase() !== HOOK) return { ok: false, why: 'this pool is not on the creator registry the contest reads' };
  let sides, creator;
  try { const v = VIEW.sidesOf(key); sides = decodeSides(await call(v.to, v.data)); } catch (_) { return { ok: false, why: 'the registry does not name a block side for this pool' }; }
  if (sides.block !== b) return { ok: false, why: 'the block is the paired side of this pool, not its block side' };
  try { const v = VIEW.creatorOf(poolIdOfKey(key)); creator = decodeAddress(await call(v.to, v.data)); } catch (_) { return { ok: false, why: 'no creator is recorded for this pool' }; }
  if (creator !== w) return { ok: false, why: 'another wallet is recorded as the creator', creator };
  return { ok: true, creator, poolId: poolIdOfKey(key) };
}

/* ------------------------------------------------------------------ display helpers (pure) */
/** raw 18-decimal units -> "1,234.5" (at most `digits` decimals, truncated, never rounded up) */
export function formatUnits18(raw, digits = 2) {
  const n = BigInt(raw), unit = 10n ** 18n;
  const whole = n / unit, frac = (n % unit).toString().padStart(18, '0').slice(0, digits).replace(/0+$/, '');
  return whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac ? '.' + frac : '');
}
/** "1,234.5" typed by a person -> raw 18-decimal units, exact (no float). null if it is not a plain positive amount. */
export function parseUnits18(text) {
  const s = String(text == null ? '' : text).trim().replace(/[,_\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [w, f = ''] = s.split('.');
  if (f.length > 18) return null;
  const raw = BigInt(w) * 10n ** 18n + BigInt((f + '0'.repeat(18)).slice(0, 18));
  return raw > 0n ? raw : null;
}
/** what an "Add to the pot" click would pull, checked BEFORE the wallet opens. room = fundRoom(round), balance = the wallet's TBLOCK.
 *  { ok:true, amount, clipped } or { ok:false, why }. The contract clips to the room too; this only says it first. */
export function fundPlan({ text, room, balance }) {
  const a = parseUnits18(text);
  if (a === null) return { ok: false, why: 'Type an amount of TBLOCK, for example 100000.' };
  const r = BigInt(room), b = BigInt(balance);
  if (r <= 0n) return { ok: false, why: 'This round is already at its cap: nothing more can be added to it.' };
  const amount = a < r ? a : r;
  if (b < amount) return { ok: false, why: 'This wallet holds ' + formatUnits18(b) + ' TBLOCK; adding ' + formatUnits18(amount) + ' needs more.' };
  return { ok: true, amount, clipped: amount < a };
}
/** seconds -> "1d 02h 03m 04s" */
export function formatDuration(seconds) {
  let s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) s = 0;
  s = Math.floor(s);
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  const two = (v) => String(v).padStart(2, '0');
  return (d ? d + 'd ' : '') + two(h) + 'h ' + two(m) + 'm ' + two(x) + 's';
}
