// test-block-contest-ui-20261110.mjs — bench of block-contest.js (the page side of the block contest) on a FAKE chain.
//
// What it proves:
//   A. every 4-byte prefix the module uses equals keccak(signature) where the signature is REBUILT from the Solidity source
//      (contracts/src/BlockContest.sol), not copied from the module. keccak itself is checked against the three literal
//      prefixes the Solidity source carries (transfer / transferFrom / balanceOf).
//   B. the addresses in the module equal the deployment record (block-contest-deploiement.js).
//   C. calldata round-trips through an INDEPENDENT decoder written here; a vote batch approves EXACTLY votes * price.
//   D. decoders on fixture words (and they throw on a wrong length instead of returning 0).
//   E. the schedule / quorum arithmetic equals what a fake chain (coded here from the Solidity rules) answers.
//   F. the page and its module are in the served list.
//   G. mutants: each mutation is applied to a COPY of the module in a temp dir (never in place); the pristine copy must pass
//      first, and each mutant must die on an AssertionError (a missing module or a syntax error does not count as a kill).
//
// What it does NOT prove: that the deployed contract behaves like its source, that a wallet accepts the batch, or that the
// page renders. No network here.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { selecteur } from './keccak.js';
import { CONTEST_DEPLOIEMENT } from './block-contest-deploiement.js';

const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const sol = readFileSync(here('./contracts/src/BlockContest.sol'), 'utf8');

/* ---------------------------------------------------------------- signatures rebuilt from the Solidity source */
const KEY_FIELDS = (sol.match(/struct PoolKey\s*\{([^}]*)\}/) || [])[1];
assert.ok(KEY_FIELDS, 'struct PoolKey found in the Solidity source');
const KEY_TUPLE = '(' + KEY_FIELDS.split(';').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+/)[0]).join(',') + ')';
const ENTRY_FIELDS = (sol.match(/struct Entry\s*\{([^}]*)\}/) || [])[1].split(';').map((s) => s.trim()).filter(Boolean).map((s) => s.split(/\s+/));
const canon = (t) => (t === 'PoolKey' ? KEY_TUPLE : t);
const solSig = new Map();      /* name -> signature */
const solWrites = new Set();   /* external/public functions that are not views */
for (const m of sol.matchAll(/^\s*function\s+(\w+)\s*\(([^)]*)\)\s*([^{;]*)/gm)) {
  const [, name, params, tail] = m;
  if (!/\b(external|public)\b/.test(tail)) continue;
  const types = params.split(',').map((s) => s.trim()).filter(Boolean).map((s) => canon(s.split(/\s+/)[0]));
  solSig.set(name, name + '(' + types.join(',') + ')');
  if (!/\b(view|pure)\b/.test(tail)) solWrites.add(name);
}
for (const m of sol.matchAll(/^\s*(mapping\(.*\)|[\w\[\]]+)\s+public\s+(?:constant\s+|immutable\s+)?(\w+)\s*[;=]/gm)) {
  const keys = [...m[1].matchAll(/mapping\(\s*(\w+)\s*=>/g)].map((k) => k[1]);
  solSig.set(m[2], m[2] + '(' + keys.join(',') + ')');
}
const solSel = (name) => selecteur(solSig.get(name)).slice(2);

/* ---------------------------------------------------------------- independent ABI helpers (bench side) */
const pad = (h) => h.replace(/^0x/, '').toLowerCase().padStart(64, '0');
const u = (n) => BigInt(n).toString(16).padStart(64, '0');
const splitWords = (hex) => { const s = hex.replace(/^0x/, ''); const o = []; for (let i = 0; i < s.length; i += 64) o.push(s.slice(i, i + 64)); return o; };
const cfg = CONTEST_DEPLOIEMENT.config;
const A = (n) => '0x' + n.toString(16).padStart(40, '0');           /* synthetic addresses for fixtures */
const B20 = (n) => '0xb2000000000000000000' + n.toString(16).padStart(20, '0');

/* a fake chain coded from the Solidity rules; it answers by the prefixes REBUILT FROM THE SOURCE */
function fakeChain({ now, rounds = {}, liabilities = 0n, pendingBurn = 0n, creators = {}, blockSides = {} }) {
  const G = BigInt(cfg.genesis), EP = BigInt(cfg.entryPeriod), VP = BigInt(cfg.votePeriod), LEN = EP + VP;
  const params = { GENESIS: G, ENTRY_PERIOD: EP, VOTE_PERIOD: VP, VOTE_PRICE: BigInt(cfg.votePrice), ENTRY_FEE: BigInt(cfg.entryFee),
    BURN_BPS: BigInt(cfg.burnBps), SPLIT1: BigInt(cfg.split1), SPLIT2: BigInt(cfg.split2), SPLIT3: BigInt(cfg.split3),
    MIN_VOTES: BigInt(cfg.minVotes), MIN_VOTERS: BigInt(cfg.minVoters), MIN_QUALIFIED_ENTRIES: BigInt(cfg.minQualifiedEntries),
    MAX_POT: BigInt(cfg.maxPot), MAX_FUND_AHEAD: 8n, FUND_AHEAD_MAX: 2n };
  const R = (r) => rounds[String(r)] || { pot: 0n, totalVotes: 0n, settled: false, topIds: [], qualifiedCount: 0n, entries: [] };
  const table = new Map();
  for (const [k, v] of Object.entries(params)) table.set(solSel(k), () => u(v));
  table.set(solSel('TBLOCK'), () => pad(cfg.tblock));
  table.set(solSel('HOOK'), () => pad(cfg.hook));
  table.set(solSel('currentRound'), () => u(BigInt(now) < G ? 0n : (BigInt(now) - G) / LEN));
  table.set(solSel('roundStart'), (w) => u(G + BigInt('0x' + w[0]) * LEN));
  table.set(solSel('voteStart'), (w) => u(G + BigInt('0x' + w[0]) * LEN + EP));
  table.set(solSel('roundEnd'), (w) => u(G + BigInt('0x' + w[0]) * LEN + LEN));
  table.set(solSel('qualifiedCount'), (w) => u(R(BigInt('0x' + w[0])).qualifiedCount));
  table.set(solSel('roundInfo'), (w) => {
    const r = R(BigInt('0x' + w[0]));
    const top = [0, 1, 2].map((i) => u(r.topIds[i] ?? 0));
    return u(r.pot) + u(r.totalVotes) + u(r.entries.length) + u(r.settled ? 1 : 0) + top.join('') + u(r.topIds.length);
  });
  table.set(solSel('entryOf'), (w) => {
    const e = R(BigInt('0x' + w[0])).entries[Number(BigInt('0x' + w[1]))];
    if (!e) throw new Error('execution reverted');
    return pad(e.blockToken) + pad(e.payee) + u(e.votes) + u(e.voters) + u(e.qualified ? 1 : 0);
  });
  table.set(solSel('liabilities'), () => u(liabilities));
  table.set(solSel('pendingBurn'), () => u(pendingBurn));
  table.set(solSel('creatorOf'), (w) => { const c = creators['0x' + w[0]]; if (!c) throw new Error('execution reverted'); return pad(c); });
  table.set(solSel('sidesOf'), (w) => {
    const c0 = '0x' + w[0].slice(24), c1 = '0x' + w[1].slice(24);
    const blk = blockSides[c0] ? c0 : blockSides[c1] ? c1 : null;
    if (!blk) throw new Error('execution reverted');
    return pad(blk === c0 ? c1 : c0) + pad(blk);
  });
  const seen = [];
  const call = async (to, data) => {
    assert.equal(to, CONTEST_DEPLOIEMENT.adresse, 'reads of the contest go to the deployed address');
    const sel = data.slice(2, 10), f = table.get(sel);
    if (!f) throw new Error('fake chain: unknown prefix ' + sel);
    seen.push(sel);
    return '0x' + f(splitWords(data.slice(10)));
  };
  return { call, seen, params };
}

/* ---------------------------------------------------------------- the suite (runs on the real module, then on each copy) */
async function suite(M, count) {
  const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); count.n++; };
  const ok = (c, m) => { assert.ok(c === true, m); count.n++; };
  const throws = (f, m) => { assert.throws(f, Error, m); count.n++; };

  /* A. prefixes: module vs keccak(signature rebuilt from the Solidity source) */
  const names = Object.keys(M.SIGNATURES);
  ok(names.length >= 40, 'the module names at least 40 contract signatures (got ' + names.length + ')');
  for (const name of names) {
    ok(solSig.has(name), name + ' exists in the Solidity source as an external/public member');
    eq(M.SIGNATURES[name], solSig.get(name), name + ': the module signature equals the one rebuilt from the source');
    eq(M.SEL[name], solSel(name), name + ': the module prefix equals keccak(source signature)');
  }
  /* every state-changing function of the contract has a signature in the module (no gesture forgotten) */
  eq([...solWrites].sort(), ['claim', 'enter', 'flushBurn', 'fund', 'settle', 'sweepSurplus', 'vote'], 'the seven state-changing functions of the source');
  for (const w of solWrites) ok(w in M.SIGNATURES, 'gesture ' + w + ' is covered');
  /* the token prefixes: the three the Solidity source carries as literals + approve from the same keccak */
  eq(M.TOKEN_SEL.balanceOf, '70a08231', 'balanceOf prefix equals the literal in the Solidity source');
  eq(M.TOKEN_SEL.approve, selecteur('approve(address,uint256)').slice(2), 'approve prefix is computed');
  eq(M.TOKEN_SEL.allowance, selecteur('allowance(address,address)').slice(2), 'allowance prefix is computed');

  /* B. addresses equal the deployment record */
  eq(M.CONTEST, CONTEST_DEPLOIEMENT.adresse.toLowerCase(), 'contest address equals the deployment record');
  eq(M.TBLOCK, cfg.tblock.toLowerCase(), 'TBLOCK equals the deployment record');
  eq(M.HOOK, cfg.hook.toLowerCase(), 'registry address equals the deployment record');
  eq(M.CONTEST_DEPLOY_BLOCK, CONTEST_DEPLOIEMENT.bloc, 'deploy block equals the deployment record');
  eq(parseInt(M.CHAIN_ID_HEX, 16), CONTEST_DEPLOIEMENT.chaine, 'chain id equals the deployment record');

  /* C. calldata round-trips (independent decoder) */
  const price = BigInt(cfg.votePrice);
  const v = M.buildVote(7n, 3n, 5n);
  eq(v.to, M.CONTEST, 'vote goes to the contest'); eq(v.value, '0x0', 'vote carries no ETH');
  eq(v.data.slice(2, 10), solSel('vote'), 'vote prefix');
  eq(splitWords(v.data.slice(10)).map((w) => BigInt('0x' + w)), [7n, 3n, 5n], 'vote(round, entryId, votes) in this order');
  throws(() => M.buildVote(1n, 0n, 0n), 'zero votes refused');
  throws(() => M.buildVote(1n, 0n, 1n << 64n), 'votes above uint64 refused');

  const batch = M.voteBatch({ round: 7n, entryId: 3n, votes: 5n, votePrice: price });
  eq(batch.length, 2, 'vote batch = approve + vote');
  eq(batch[0].to, M.TBLOCK, 'approval goes to TBLOCK'); eq(batch[0].value, '0x0', 'approval carries no ETH');
  eq(batch[0].data.slice(2, 10), selecteur('approve(address,uint256)').slice(2), 'approval prefix');
  const aw = splitWords(batch[0].data.slice(10));
  eq(aw.length, 2, 'approval has two words');
  eq('0x' + aw[0].slice(24), M.CONTEST, 'approval spender is the contest');
  eq(BigInt('0x' + aw[1]), 5n * price, 'approval is EXACTLY votes * price');
  eq(batch[1], v, 'second call of the batch is the vote');
  eq(M.voteCost(1n, price), price, 'one vote costs the vote price');
  throws(() => M.buildApprove(0n), 'zero approval refused');

  const key = { currency0: B20(0x11), currency1: B20(0x22), fee: 0x800000, tickSpacing: -60, hooks: cfg.hook };
  const e = M.buildEnter(B20(0x22), key);
  eq(e.to, M.CONTEST, 'enter goes to the contest'); eq(e.data.slice(2, 10), solSel('enter'), 'enter prefix');
  const ew = splitWords(e.data.slice(10));
  eq(ew.length, 6, 'enter = block + five words of the key');
  eq(ew[0], pad(B20(0x22)), 'enter word 0 = block'); eq(ew[1], pad(key.currency0), 'word 1 = currency0'); eq(ew[2], pad(key.currency1), 'word 2 = currency1');
  eq(BigInt('0x' + ew[3]), 0x800000n, 'word 3 = fee');
  eq(BigInt.asIntN(256, BigInt('0x' + ew[4])), -60n, 'word 4 = tickSpacing, sign-extended');
  eq(ew[5], pad(cfg.hook), 'word 5 = hooks');
  throws(() => M.buildEnter('0x1234', key), 'short address refused');
  throws(() => M.buildEnter(B20(0x22), { ...key, tickSpacing: 1 << 23 }), 'tickSpacing out of int24 refused');
  throws(() => M.buildEnter(B20(0x22), { ...key, fee: 1 << 24 }), 'fee out of uint24 refused');
  const eb = M.enterBatch({ blockToken: B20(0x22), key, entryFee: BigInt(cfg.entryFee) });
  eq(eb.length, 2, 'enter batch = approve + enter when there is a fee');
  eq(BigInt('0x' + splitWords(eb[0].data.slice(10))[1]), BigInt(cfg.entryFee), 'enter approval is EXACTLY the entry fee');
  eq(eb[1], e, 'second call is enter');
  eq(M.enterBatch({ blockToken: B20(0x22), key, entryFee: 0n }).length, 1, 'no approval when the fee is zero');
  /* pool id = keccak of the five words (independent recomputation through the keccak witness path) */
  eq(M.poolIdOfKey(key).replace(/^0x/, '').length, 64, 'pool id is one word');
  ok(M.poolIdOfKey(key) !== M.poolIdOfKey({ ...key, tickSpacing: 60 }), 'pool id depends on the sign of tickSpacing');

  eq(M.buildSettle(4n).data, '0x' + solSel('settle') + u(4), 'settle(round)');
  eq(M.buildClaim(A(0xabc)).data, '0x' + solSel('claim') + pad(A(0xabc)), 'claim(to)');
  eq(M.buildFund(2n, 10n).data, '0x' + solSel('fund') + u(2) + u(10), 'fund(round, amount)');
  eq(M.buildSweepSurplus().data, '0x' + solSel('sweepSurplus'), 'sweepSurplus()');
  eq(M.buildFlushBurn().data, '0x' + solSel('flushBurn'), 'flushBurn()');
  const fb = M.fundBatch({ round: 0n, amount: 100n, room: 40n });
  eq(BigInt('0x' + splitWords(fb[0].data.slice(10))[1]), 40n, 'fund approval is clipped to the room, like the contract');
  eq(BigInt('0x' + splitWords(fb[1].data.slice(10))[1]), 40n, 'fund amount is clipped to the room');
  throws(() => M.fundBatch({ round: 0n, amount: 1n, room: 0n }), 'funding a full round refused');

  /* D. decoders on fixture words */
  const ri = M.decodeRoundInfo('0x' + u(900) + u(12) + u(4) + u(1) + u(2) + u(0) + u(9) + u(2));
  eq(ri, { pot: 900n, totalVotes: 12n, entryCount: 4, settled: true, topIds: [2, 0], topCount: 2 }, 'roundInfo: only the first topCount ids are kept');
  const en = M.decodeEntry('0x' + pad(B20(5)) + pad(A(6)) + u(7) + u(3) + u(1));
  eq(en, { blockToken: B20(5), payee: A(6), votes: 7n, voters: 3n, qualified: true }, 'entry: votes then distinct voters');
  eq(ENTRY_FIELDS.map((f) => f[1]), ['blockToken', 'payee', 'votes', 'voters', 'qualified'], 'the Solidity struct has these fields in this order');
  eq(M.decodeSides('0x' + pad(A(1)) + pad(B20(2))), { paired: A(1), block: B20(2) }, 'sides: (paired, block)');
  eq(M.decodeUint('0x' + u(42)), 42n, 'uint'); eq(M.decodeBool('0x' + u(0)), false, 'bool false'); eq(M.decodeAddress('0x' + pad(A(9))), A(9), 'address');
  throws(() => M.decodeUint('0x'), 'empty answer is not zero');
  throws(() => M.decodeUint('0x' + u(1) + u(2)), 'an extra word is refused');
  throws(() => M.decodeEntry('0x' + u(1)), 'short entry refused');
  throws(() => M.decodeBool('0x' + u(2)), '2 is not a boolean');
  throws(() => M.decodeAddress('0x' + 'f'.repeat(64)), 'dirty address word refused');
  throws(() => M.decodeRoundInfo('0x' + u(0).repeat(7) + u(4)), 'top count above 3 refused');
  eq(M.decodeString('0x' + u(32) + u(6) + Buffer.from('TBLOCK').toString('hex').padEnd(64, '0')), 'TBLOCK', 'ABI string');

  /* E. schedule and quorum against the fake chain */
  const G = BigInt(cfg.genesis), EP = BigInt(cfg.entryPeriod), VP = BigInt(cfg.votePeriod);
  const before = fakeChain({ now: G - 100n });
  const p = await M.readParams(before.call);
  eq(p.genesis, G, 'genesis read'); eq(p.entryPeriod, EP, 'entry period read'); eq(p.votePeriod, VP, 'vote period read');
  eq(p.votePrice, price, 'vote price read'); eq(p.entryFee, BigInt(cfg.entryFee), 'entry fee read'); eq(p.maxPot, BigInt(cfg.maxPot), 'cap read');
  eq(p.burnBps, BigInt(cfg.burnBps), 'burn share read'); eq([p.split1, p.split2, p.split3], [BigInt(cfg.split1), BigInt(cfg.split2), BigInt(cfg.split3)], 'splits read');
  eq([p.minVotes, p.minVoters, p.minQualifiedEntries], [BigInt(cfg.minVotes), BigInt(cfg.minVoters), BigInt(cfg.minQualifiedEntries)], 'quorum read');
  eq([p.maxFundAhead, p.fundAheadMax], [8n, 2n], 'funding horizon read');
  eq(p.tblock, cfg.tblock.toLowerCase(), 'TBLOCK read'); eq(p.hook, cfg.hook.toLowerCase(), 'registry read');
  for (const r of [0n, 1n, 5n]) {
    eq(u(M.roundStart(p, r)), (await before.call(M.CONTEST, '0x' + solSel('roundStart') + u(r))).slice(2), 'roundStart(' + r + ') equals the chain');
    eq(u(M.voteStart(p, r)), (await before.call(M.CONTEST, '0x' + solSel('voteStart') + u(r))).slice(2), 'voteStart(' + r + ') equals the chain');
    eq(u(M.roundEnd(p, r)), (await before.call(M.CONTEST, '0x' + solSel('roundEnd') + u(r))).slice(2), 'roundEnd(' + r + ') equals the chain');
  }
  eq(M.roundLength(p), EP + VP, 'round length = entry + vote');
  eq(M.phaseAt(p, G - 100n), { phase: 'BEFORE_START', round: 0n, endsAt: G, secondsLeft: 100n }, 'before genesis');
  eq(M.phaseAt(p, G).phase, 'ENTRY', 'genesis second = entry open');
  eq(M.phaseAt(p, G + EP - 1n), { phase: 'ENTRY', round: 0n, endsAt: G + EP, secondsLeft: 1n, roundEndsAt: G + EP + VP }, 'last entry second');
  eq(M.phaseAt(p, G + EP).phase, 'VOTE', 'first vote second');
  eq(M.phaseAt(p, G + EP + VP - 1n), { phase: 'VOTE', round: 0n, endsAt: G + EP + VP, secondsLeft: 1n, roundEndsAt: G + EP + VP }, 'last vote second');
  eq(M.phaseAt(p, G + EP + VP).round, 1n, 'next round starts at the end');
  eq(M.phaseAt(p, G + EP + VP).phase, 'ENTRY', 'next round opens with entries');

  const mv = p.minVotes, mr = p.minVoters;
  eq(M.entryQualifies({ votes: mv, voters: mr }, p), true, 'minimum votes and minimum voters qualify');
  eq(M.entryQualifies({ votes: mv - 1n, voters: mr }, p), false, 'one vote short does not qualify');
  eq(M.entryQualifies({ votes: mv + 10n, voters: mr - 1n }, p), false, 'many votes from too few addresses do not qualify');
  eq(M.roundQualifies(p.minQualifiedEntries, p), true, 'quorum reached at the minimum');
  eq(M.roundQualifies(p.minQualifiedEntries - 1n, p), false, 'quorum missed one short');
  eq(M.prizesOf(1001n, { split1: 6000n, split2: 3000n, split3: 1000n }), [600n, 300n, 100n], 'prizes floor like the contract');
  eq(M.prizesOf(BigInt(cfg.maxPot), p), [BigInt(cfg.maxPot) * BigInt(cfg.split1) / 10000n, BigInt(cfg.maxPot) * BigInt(cfg.split2) / 10000n, BigInt(cfg.maxPot) * BigInt(cfg.split3) / 10000n], 'prizes at the cap');
  eq(M.voteSplit(1000n, { burnBps: 2500n }), { burned: 250n, toPot: 750n }, 'vote split');

  /* state before the start: nothing open, pot 0 */
  const s0 = await M.readState(before.call, { now: G - 100n });
  eq(s0.when.phase, 'BEFORE_START', 'state: not started'); eq(s0.current.pot, 0n, 'state: pot 0'); eq(s0.current.entries, [], 'state: no entries');
  eq(s0.past, [], 'state: no past round before the start'); eq(s0.qualified, false, 'state: not qualified'); eq(s0.clockMismatch, false, 'state: clocks agree');

  /* state in the vote window of round 1, with a settled round 0 */
  const E = (i, votes, voters) => ({ blockToken: B20(0x100 + i), payee: A(0x200 + i), votes: BigInt(votes), voters: BigInt(voters), qualified: BigInt(votes) >= mv && BigInt(voters) >= mr });
  const LEN = EP + VP, nowV = G + LEN + EP + 10n;
  const live = fakeChain({ now: nowV, liabilities: 777n, pendingBurn: 5n, rounds: {
    0: { pot: 500n, totalVotes: 9n, settled: true, topIds: [1, 0], qualifiedCount: 2n, entries: [E(0, 4, 3), E(1, 5, 4)] },
    1: { pot: 862n, totalVotes: 10n, settled: false, topIds: [2], qualifiedCount: 1n, entries: [E(0, 2, 2), E(1, 5, 1), E(2, 3, 3)] } } });
  const s1 = await M.readState(live.call, { now: nowV });
  eq(s1.chainRound, 1n, 'state: round 1'); eq(s1.when.phase, 'VOTE', 'state: vote window'); eq(s1.when.secondsLeft, VP - 10n, 'state: time left');
  eq(s1.current.entries.length, 3, 'state: three entries read'); eq(s1.current.entriesNotRead, 0, 'state: none left unread');
  eq(s1.current.entries.map((x) => [x.id, x.votes, x.voters, x.qualified]), [[0, 2n, 2n, false], [1, 5n, 1n, false], [2, 3n, 3n, true]], 'state: votes and distinct voters per entry');
  eq(s1.current.qualifiedCount, 1n, 'state: one qualified entry'); eq(s1.qualified, false, 'state: quorum not reached with one');
  eq(s1.prizes, M.prizesOf(862n, p), 'state: prizes from the pot'); eq(s1.liabilities, 777n, 'state: liabilities'); eq(s1.pendingBurn, 5n, 'state: pending burn');
  eq(s1.past.length, 1, 'state: one past round'); eq(s1.past[0].outcome.state, 'PAID', 'past round with quorum and settled = PAID');
  eq(s1.past[0].outcome.winner.payee, A(0x201), 'past winner = first of the podium');
  eq(M.outcomeOf({ settled: true, qualifiedCount: 1n, topCount: 1, topIds: [0], entries: [E(0, 9, 9)] }, p).state, 'NO_WINNER', 'settled without quorum = no winner');
  eq(M.outcomeOf({ settled: false, qualifiedCount: 2n, topCount: 2, topIds: [0, 1], entries: [E(0, 9, 9), E(1, 4, 4)] }, p).state, 'TO_PAY', 'quorum, not settled yet');
  const capped = await M.readRound(live.call, 1n, { maxEntries: 2 });
  eq([capped.entries.length, capped.entriesNotRead], [2, 1], 'entries above the read limit are counted, not hidden');
  const off = await M.readState(live.call, { now: G + 5n });
  eq(off.clockMismatch, true, 'a local clock in another round than the chain is flagged');

  /* creator check through the contract's own views */
  const wallet = A(0x999), pid = M.poolIdOfKey(key);
  const reg = fakeChain({ now: G, creators: { [pid]: wallet }, blockSides: { [B20(0x22)]: true } });
  eq((await M.readCreatorCheck(reg.call, { blockToken: B20(0x22), key, wallet })).ok, true, 'recorded creator accepted');
  eq((await M.readCreatorCheck(reg.call, { blockToken: B20(0x22), key, wallet: A(0x998) })).ok, false, 'another wallet refused');
  eq((await M.readCreatorCheck(reg.call, { blockToken: B20(0x11), key, wallet })).ok, false, 'the paired side cannot be entered');
  eq((await M.readCreatorCheck(reg.call, { blockToken: B20(0x22), key: { ...key, hooks: A(1) }, wallet })).ok, false, 'a pool outside the registry refused');
  eq((await M.readCreatorCheck(reg.call, { blockToken: B20(0x22), key: { ...key, fee: 1 }, wallet })).ok, false, 'a key with no recorded creator refused');

  /* display helpers */
  eq(M.formatUnits18(BigInt(cfg.votePrice)), '8,621', 'vote price formatted');
  eq(M.formatUnits18(1999999999999999999n, 2), '1.99', 'truncated, never rounded up');
  eq(M.formatUnits18(0n), '0', 'zero'); eq(M.formatDuration(90061), '1d 01h 01m 01s', 'duration'); eq(M.formatDuration(-5), '00h 00m 00s', 'negative duration clamps');
}

/* ---------------------------------------------------------------- run on the real module */
const count = { n: 0 };
const real = await import('./block-contest.js');
/* keccak witness FIRST: the three literal prefixes found in the Solidity source */
for (const [sig, lit] of [['transfer(address,uint256)', '0xa9059cbb'], ['transferFrom(address,address,uint256)', '0x23b872dd'], ['balanceOf(address)', '0x70a08231']]) {
  assert.ok(sol.includes('abi.encodeWithSelector(' + lit), 'the Solidity source carries the literal ' + lit); count.n++;
  assert.equal(selecteur(sig), lit, 'keccak witness: ' + sig); count.n++;
}
assert.ok(solSig.size >= 40, 'signatures were rebuilt from the source (' + solSig.size + ')'); count.n++;
assert.equal(KEY_TUPLE, '(address,address,uint24,int24,address)', 'pool key tuple rebuilt from the struct'); count.n++;
await suite(real, count);

/* F. served list: the page, its module, and everything they import */
const serveur = readFileSync(here('./serveur-web.js'), 'utf8');
const blocServis = serveur.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/);
assert.ok(blocServis, 'served list found'); count.n++;
const servis = new Set([...blocServis[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
assert.ok(servis.has('holders.html'), 'witness: holders.html is in the list read'); count.n++;
const importsOf = (t) => [...t.matchAll(/(?:^|\s)import\s+(?:[^'";]*?from\s*)?['"]\.\/([^'"]+)['"]/g), ...t.matchAll(/import\s*\(\s*['"]\.\/([^'"]+)['"]\s*\)/g)].map((m) => m[1]);
const todo = ['contest.html'], walked = new Set();
while (todo.length) {
  const f = todo.pop();
  if (walked.has(f)) continue;
  walked.add(f);
  assert.ok(existsSync(here('./' + f)), f + ' exists'); count.n++;
  assert.ok(servis.has(f), f + ' is in the served list'); count.n++;
  todo.push(...importsOf(readFileSync(here('./' + f), 'utf8')));
}
assert.ok(walked.has('block-contest.js') && walked.has('keccak.js'), 'the page reaches block-contest.js and keccak.js'); count.n++;
/* the page: plain statements that must be there, words that must not */
const page = readFileSync(here('./contest.html'), 'utf8');
assert.ok(/not refundable/i.test(page), 'the page says votes are not refundable'); count.n++;
assert.ok(!/uniswap/i.test(page), 'the page never names the exchange protocol'); count.n++;
assert.ok(!/\bdisabled\b/.test(page.replace(/\.disabled\s*=\s*true;\s*\/\* busy \*\//g, '')), 'no button is shipped disabled as a placeholder'); count.n++;
assert.ok(!page.includes('\r') && !readFileSync(here('./block-contest.js'), 'utf8').includes('\r'), 'page and module are LF'); count.n++;

/* G. mutants, on a COPY in a temp dir */
const dir = mkdtempSync(join(tmpdir(), 'contest-ui-mut-'));
const source = readFileSync(here('./block-contest.js'), 'utf8');
for (const dep of ['keccak.js', 'texte-onchain.js']) copyFileSync(here('./' + dep), join(dir, dep));   /* every module the copy imports */
writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
const MUTANTS = [
  ['approval one unit above the cost', 'Object.freeze([buildApprove(cost), buildVote(round, entryId, votes)])', 'Object.freeze([buildApprove(cost + 1n), buildVote(round, entryId, votes)])'],
  ['round and entry id swapped in vote', 'wUint(round) + wUint(entryId) + wUint(v)', 'wUint(entryId) + wUint(round) + wUint(v)'],
  ['quorum of an entry: AND turned into OR', 'e.votes >= p.minVotes && e.voters >= p.minVoters', 'e.votes >= p.minVotes || e.voters >= p.minVoters'],
  ['votes and distinct voters swapped when decoding', 'votes: toUint(w[2]), voters: toUint(w[3])', 'votes: toUint(w[3]), voters: toUint(w[2])'],
  ['vote window starts after the vote period', 'roundStart(p, r) + p.entryPeriod;', 'roundStart(p, r) + p.votePeriod;'],
  ['vote signature with a wrong type', "vote: 'vote(uint256,uint256,uint256)'", "vote: 'vote(uint256,uint256,uint64)'"],
  ['round quorum strict instead of at-least', 'BigInt(qualifiedCount) >= p.minQualifiedEntries', 'BigInt(qualifiedCount) > p.minQualifiedEntries'],
  ['fund approval not clipped to the room', 'const pulled = a < r ? a : r;', 'const pulled = a;'],
  ['decoder accepts extra words', 's.length !== 64 * n', 's.length < 64 * n'],
  ['tickSpacing not sign-extended', 'BigInt.asUintN(256, n).toString(16)', 'BigInt.asUintN(24, n).toString(16)'],
];
let killed = 0;
try {
  writeFileSync(join(dir, 'pristine.js'), source);
  const pristine = { n: 0 };
  await suite(await import(pathToFileURL(join(dir, 'pristine.js')).href), pristine);
  assert.equal(pristine.n > 150, true, 'the pristine COPY passes the whole suite in the temp dir (' + pristine.n + ' assertions)'); count.n++;
  for (let i = 0; i < MUTANTS.length; i++) {
    const [label, anchor, repl] = MUTANTS[i];
    assert.equal(source.split(anchor).length - 1, 1, 'mutant anchor is unique: ' + label); count.n++;
    const mutated = source.replace(anchor, () => repl);
    assert.notEqual(mutated, source, 'mutant changes the copy: ' + label); count.n++;
    const file = join(dir, 'mutant-' + i + '.js');
    writeFileSync(file, mutated);
    const mod = await import(pathToFileURL(file).href);   /* an import failure here is a bench failure, not a kill */
    let death = null;
    try { await suite(mod, { n: 0 }); } catch (err) { death = err; }
    assert.ok(death, 'mutant SURVIVED: ' + label); count.n++;
    assert.equal(death.code, 'ERR_ASSERTION', 'mutant must die on an assertion, not on ' + (death && death.message) + ' : ' + label); count.n++;
    killed++;
    console.log('  mutant ' + (i + 1) + '/' + MUTANTS.length + ' killed (' + label + ') by: ' + String(death.message).split('\n')[0].slice(0, 110));
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
assert.equal(source, readFileSync(here('./block-contest.js'), 'utf8'), 'the module in place was not touched by the mutants'); count.n++;

console.log('test-block-contest-ui-20261110 : ' + count.n + ' assertions, ' + killed + '/' + MUTANTS.length + ' mutants killed on a copy, 0 failure');
