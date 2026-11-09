// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockContest - a recurring "best new block" competition paid in TBLOCK, run only by its own rules.
/// @notice DRAFT 2026-11-09. NOT DEPLOYED. No owner, no admin, no upgrade, no pause, no withdraw.
///
/// SCHEDULE (immutable, permissionless - nobody "opens" a round):
///   round r starts at GENESIS + r * (ENTRY_PERIOD + VOTE_PERIOD).
///   [start, start + ENTRY_PERIOD)              entry window: the CREATOR of a block (per the app's hook) enters it.
///   [start + ENTRY_PERIOD, end)                vote window: anyone buys votes for an entry, paid in TBLOCK.
///   end = start + ENTRY_PERIOD + VOTE_PERIOD   from then on, ANYONE may call settle(r).
///   Round r+1 begins exactly when round r ends.
///
/// MONEY IN (all TBLOCK, every transferFrom is checked by balance delta):
///   fund(r, amount)   anyone adds to the pot of a round that has not ended and is at most FUND_AHEAD_MAX (2) rounds ahead
///                     (the owner funds from his wallet this way), never past MAX_POT: the amount is CLIPPED to fundRoom(r)
///                     (only that is pulled); it reverts PotFull only if the round is already full. FUND_AHEAD_MAX (2) only
///                     stops fund() from pre-filling the far rounds of the placement window (MAX_FUND_AHEAD = 8). It does NOT
///                     make that window unreachable: anyone can still fill it by sending TBLOCK and calling sweepSurplus(). That
///                     costs the attacker his own TBLOCK, which becomes prize money for future rounds; he gains nothing from it.
///   enter(block, key) pays ENTRY_FEE (anti-spam) into the current round's pot; what does not fit under MAX_POT is placed in
///                     the next rounds with room (up to currentRound() + MAX_FUND_AHEAD), burned only if none has room.
///   vote(r, id, n)    pays n * VOTE_PRICE; BURN_BPS of it goes to 0x...dEaD (TBLOCK has no burn function), the rest to the pot
///                     (same overflow placement). BURN_BPS may be 10000 (the owner's chosen config): every vote is then 100 %
///                     burned - pure buy pressure - nothing of it reaches the pot, and the pot is only funding + entry fees.
///   sweepSurplus()    TBLOCK sent here by plain transfer (not via fund) is added by anyone to the current round's pot, with
///                     the same overflow placement.
///
/// MONEY OUT (only these paths exist):
///   settle(r)  QUORUM first: the round pays only if at least MIN_QUALIFIED_ENTRIES entries QUALIFY (>= MIN_VOTES votes from
///              >= MIN_VOTERS distinct addresses); otherwise the whole pot rolls over. Then the top 1/2/3 QUALIFIED entries,
///              ranked by total votes, get SPLIT1/2/3 bps of the pot (an unqualified entry is never on the podium, so one
///              wallet's mass votes for an entry with too few voters cannot block or take the prize). Unpaid places,
///              failed-quorum pots and the rounding dust roll over to currentRound() + 1 at settle time (a round whose entry
///              window is still entirely ahead; never a settled round), and what does not fit there under MAX_POT goes on to
///              the next rounds with room, up to currentRound() + MAX_FUND_AHEAD - never to an address. Payouts happen
///              before any burn.
///   flushBurn() retries burns the token refused (pendingBurn); anyone can call it.
///   claim(to)  if pushing a prize to a payee failed (e.g. the token refused that recipient), the prize is kept as a credit that
///              only that payee can withdraw, to an address of his choice. settle can therefore never be blocked by one
///              recipient, and a griefer cannot force this path with a tight gas limit (EIP-150 63/64 makes it impossible for a
///              token as cheap as TBLOCK; each payout also requires gasleft() >= PAYOUT_GAS_RESERVE, see that constant).
///
/// RULES CHOSEN:
///   - Vote weight is linear in TBLOCK paid. Without identity, any "one address one vote" or quadratic rule is broken by
///     splitting across wallets; a linear price makes splitting useless: 1,000 bot wallets buy exactly as many votes as one
///     wallet with the same TBLOCK. Votes are not refunded; voters get nothing back (no passive fee sharing).
///   - Ties: more votes first; on equal votes the EARLIER entry (lower entry id) wins. Deterministic, no randomness.
///   - Entry: ONLY the block's creator. The caller passes the v4 PoolKey of the block's pool; the contract requires
///     key.hooks == HOOK (the app's hook, immutable), block == key.currency0 or key.currency1, computes
///     poolId = keccak256(abi.encode(key)) itself, reads HOOK.createurs(poolId) and requires its FIRST 32-byte word to be
///     msg.sender (and non-zero). msg.sender becomes the payee. The block address must also carry the 10-byte B20 prefix
///     0xb2000000000000000000, must not be TBLOCK, and must not be one of the hook's admitted PAIR currencies (fixed list
///     passed to the constructor, no setter). One entry per block per round AND one entry per payee per round.
///     (HOOK.createurDe(bytes32) reverts on the live 7030 hook - not used.)
///   - Why the hook record is enough (fork probe 2026-11-09, test/BlockContest.sec001.fork.t.sol): opening a NEW pool for an
///     existing block on hook 7030 requires inscrireAvecCaution, which reverts PasAdminDuBlock() (0x37d927c1) for anyone but the
///     block's admin, and PoolManager.initialize without it reverts PasInscrite() (0x93a2a14a, wrapped). A stranger therefore
///     cannot become createurs() of any pool of someone else's block, whatever fee/tickSpacing/pair he picks.
///
/// KNOWN LIMITS (stated, not solved):
///   - Only blocks born on HOOK can enter. Blocks born on older/other hooks (V5..V9, TbFeeHook...) are refused.
///   - The hook's creator record is TRUSTED as is. The hook names the block's ADMIN at registration time; if a block's admin
///     role passes to someone else, the new admin can open a new pool and enter the block (once per round, first come).
///   - The pair-currency list is the one fixed in hook 7030; a hook with a different list needs a new contest contract.
///   - The B20 prefix is shared by every B20 (TBLOCK, tokenized stocks...); it is a cheap filter, the hook check is the real one.
///   - VOTE BUYING. An entrant who buys V votes for his own block pays V * VOTE_PRICE; (BPS - BURN_BPS) of it enters the pot
///     he may win, and SPLIT1 of the pot comes back to him if he wins.
///       * Owner's config (BURN_BPS = 10000, splits 10000/0/0, MIN_VOTES = 3): he recovers 0 % of his votes - all are burned.
///         Buying the win costs the full vote price, and the prize is capped at the owner's funding + the round's entry fees
///         (vote money never reaches the pot). It is profitable only while V * VOTE_PRICE < funding + entry fees, i.e. while
///         fewer than about pot / VOTE_PRICE votes beat the leader: with a ~$5 pot and ~$0.05 votes, ~100 votes. So in a quiet
///         round a whale CAN still buy the ~$5 prize for less than ~$5 - every such vote is burned TBLOCK (buy pressure), but
///         the win is bought. MIN_VOTES / MIN_VOTERS / MIN_QUALIFIED_ENTRIES only raise the floor of that purchase.
///       * For comparison, with 20 % burn and a 60 % first place he would get back 0.6 * 0.8 = 48 % of his own vote spend.
///     Paid voting without identity cannot remove this; it only prices it.
///   - A QUIET ROUND CAN BE WON CHEAPLY BY ONE PERSON. With MIN_VOTES 3, MIN_VOTERS 3, quorum 2: someone who administers
///     two blocks (two payee wallets) and holds 3 voter wallets makes both entries qualify with 3 + 3 votes, +1 to break the
///     tie in his favour: ~6-7 burned votes (~$0.30-0.35 at 8,621 TBLOCK/vote, $0.0000058) plus two entry fees, to take a
///     ~$5 pot. All of it is burned TBLOCK, but in a round nobody else enters, the owner's funding goes to him.
///   - NO JACKPOT: a round's pot never exceeds MAX_POT, so the most anyone can win in one round is MAX_POT, however many
///     quiet rounds came before. fund() is clipped to the room (the funder never pays more than fits, never burns). Entry
///     fees, vote shares, swept surplus and rollovers that do not fit are placed in the next rounds with room, up to
///     currentRound() + MAX_FUND_AHEAD; only what fits in none of them is burned (event Burned). The owner's funding is
///     therefore burned only if all 8 future rounds are already full. fund() only reaches FUND_AHEAD_MAX = 2 rounds ahead,
///     but someone can still fill all 8 with his own TBLOCK via a plain transfer + sweepSurplus(): that would make a quiet
///     round's pot burn, at the price of donating up to 8 x MAX_POT that later winners receive. Costly, and no gain to him.
///   - BURNS NEVER BLOCK SETTLE / ENTER / SWEEP: if the token refuses the transfer to DEAD, the amount is kept as pendingBurn
///     (inside liabilities) and anyone can retry with flushBurn(). A VOTE's burn is strict: if DEAD is refused, vote()
///     reverts (with BURN_BPS = 10000 there is no pot to fall back to); the voter keeps his TBLOCK, nothing else is blocked.
///   - DISTINCT ADDRESSES ARE NOT DISTINCT PEOPLE. MIN_VOTERS counts distinct voter ADDRESSES on chain. A single person with
///     3 wallets satisfies it; each extra sybil wallet costs only its gas plus the (burned) vote price it pays. It filters
///     lazy single-wallet self-voting, nothing more. Same for MIN_QUALIFIED_ENTRIES: two entries can belong to one person
///     if he administers two blocks.
///   - Last-second votes ("sniping") are possible; the vote window has a hard end.
contract BlockContest {
    /// @dev voters = distinct addresses that voted for this entry; qualified = votes >= MIN_VOTES && voters >= MIN_VOTERS
    ///      (monotone: votes and voters only grow, so once qualified, always qualified).
    struct Entry { address blockToken; address payee; uint128 votes; uint64 voters; bool qualified; }
    /// @dev Uniswap v4 PoolKey layout; poolId = keccak256(abi.encode(key)).
    struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
    // top: entryId + 1, 0 = empty place (ranked by TOTAL votes); qualifiedCount: entries that reached MIN_VOTES and MIN_VOTERS
    struct Round { uint256 pot; uint256 totalVotes; uint32[3] top; bool settled; uint256 qualifiedCount; }

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant B20_PREFIX = 0xb2000000000000000000; // top 10 bytes of a B20 address
    uint256 public constant BPS = 10_000;
    /// @notice overflow (rollovers, entry fees, vote shares, surplus) is placed in rounds up to currentRound() + MAX_FUND_AHEAD.
    uint256 public constant MAX_FUND_AHEAD = 8;
    /// @notice fund(r) is refused for r > currentRound() + FUND_AHEAD_MAX (SEC-301). This only stops fund() from reaching the far
    ///         rounds of the placement window; sweepSurplus() can still fill them (at the sender's cost, as future prize money).
    uint256 public constant FUND_AHEAD_MAX = 2;
    /// @notice minimum gasleft() before each prize transfer. A real TBLOCK transfer measured on a Base fork 2026-11-09:
    ///         eth_estimateGas 54,738 for the whole tx (21,000 intrinsic included) -> ~34k for the call; 150k leaves the call
    ///         >= ~147k after the 63/64 rule, so it cannot run out of gas: a failure there is a real refusal by the token.
    ///         HONEST NOTE (SEC-105): for TBLOCK this guard is belt-and-braces, not the protection itself. By EIP-150, a call
    ///         starved into out-of-gas leaves the caller only 1/64 of what it forwarded; recording a credit (claimable SSTORE +
    ///         event) needs ~25-30k, so griefing into the claimable path needs a token whose transfer costs > ~1.6-1.9M gas.
    ///         TBLOCK costs ~34k. A mutant removing this line is NOT killed by the test suite for exactly that reason; the
    ///         property itself (no gas limit yields a deferred payout) is tested over a range of gas limits.
    uint256 public constant PAYOUT_GAS_RESERVE = 150_000;

    address public immutable TBLOCK;
    /// @notice the app's v4 hook whose createurs(poolId) names each block's creator (live: hook 7030).
    address public immutable HOOK;
    uint64 public immutable GENESIS;
    uint64 public immutable ENTRY_PERIOD;
    uint64 public immutable VOTE_PERIOD;
    uint256 public immutable VOTE_PRICE;
    uint256 public immutable ENTRY_FEE;
    uint256 public immutable BURN_BPS;
    uint256 public immutable SPLIT1;
    uint256 public immutable SPLIT2;
    uint256 public immutable SPLIT3;
    /// @notice a podium place pays only if its entry has at least this many votes.
    uint256 public immutable MIN_VOTES;
    /// @notice an entry qualifies only if its votes come from at least this many distinct addresses (owner's config: 3).
    uint256 public immutable MIN_VOTERS;
    /// @notice quorum: a round pays only if at least this many entries qualify (owner's config: 2).
    uint256 public immutable MIN_QUALIFIED_ENTRIES;
    /// @notice no round's pot ever exceeds this (owner's config: 862,000e18 = one round's funding). fund() is clipped to it;
    ///         overflow goes to the next rounds with room (up to MAX_FUND_AHEAD), burned only if none has room. No jackpot.
    uint256 public immutable MAX_POT;

    /// @notice the hook's admitted pair currencies; written ONLY in the constructor (no setter), refused as entries.
    mapping(address => bool) public isPairCurrency;
    mapping(uint256 => Round) internal _rounds;
    mapping(uint256 => Entry[]) internal _entries;
    mapping(uint256 => mapping(address => bool)) public entered; // round => block => already entered
    mapping(uint256 => mapping(address => bool)) public enteredBy; // round => payee => already has an entry
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVoted; // round => entryId => voter => voted
    mapping(address => uint256) public claimable;
    /// @notice TBLOCK this contract owes or must still burn: pots of unsettled rounds + unclaimed prizes (claimable) +
    ///         pendingBurn. balance - liabilities = surplus (sweepable). Checked as an invariant in BlockContest.invariant.t.sol.
    uint256 public liabilities;
    /// @notice burns the token refused (transfer to DEAD failed) in settle / enter / sweepSurplus; counted in `liabilities`
    ///         until flushBurn() succeeds. Never paid to anyone.
    uint256 public pendingBurn;
    uint256 private _lock = 1;

    event Funded(uint256 indexed round, address indexed from, uint256 amount);
    event Entered(uint256 indexed round, uint256 indexed entryId, address indexed blockToken, address payee, bytes32 poolId, uint256 fee);
    event Voted(uint256 indexed round, uint256 indexed entryId, address indexed voter, uint256 votes, uint256 toPot, uint256 burned);
    event Settled(uint256 indexed round, uint256 pot, uint256[3] winnerIds, uint256[3] prizes, uint256 rolledOver, uint256 toRound);
    event Paid(uint256 indexed round, address indexed payee, uint256 amount);
    event PayoutDeferred(uint256 indexed round, address indexed payee, uint256 amount);
    event Claimed(address indexed payee, address indexed to, uint256 amount);
    event SurplusSwept(uint256 indexed round, uint256 amount);
    /// @notice `amount` left this contract to DEAD. reason: "ENTRY_FEE", "VOTE", "SURPLUS" (overflow that fit in no round of the
    ///         placement window; round = the current round), "ROLLOVER" (round = the settled round it came from) or "FLUSH"
    ///         (a deferred burn retried by flushBurn; round = the current round). The vote's own BURN_BPS share is reported in
    ///         Voted.burned, not here.
    event Burned(uint256 indexed round, uint256 amount, bytes32 reason);
    /// @notice `amount` was put into `round`'s pot (reason: "ENTRY_FEE", "VOTE", "SURPLUS", "ROLLOVER").
    event Placed(uint256 indexed round, uint256 amount, bytes32 reason);
    /// @notice the token refused the transfer of `amount` to DEAD; it is kept as pendingBurn for flushBurn().
    event BurnDeferred(uint256 indexed round, uint256 amount, bytes32 reason);

    error BadParams(); error Reentrancy(); error TransferFailed(); error RoundEnded(); error NotEntryWindow(); error NotVoteWindow();
    error NotB20(); error AlreadyEntered(); error WrongHook(); error NotInKey(); error NotCreator(); error NoSuchEntry(); error NotEnded(); error AlreadySettled();
    error NothingToClaim(); error NoSurplus(); error PayeeAlreadyEntered(); error RoundTooFar(); error NotBlockSide();
    error GasReserve(); error PotFull(uint256 round, uint256 room); error NothingToBurn();

    struct Config {
        address tblock; address hook; uint64 genesis; uint64 entryPeriod; uint64 votePeriod; uint256 votePrice; uint256 entryFee;
        uint256 burnBps; uint256 split1; uint256 split2; uint256 split3; uint256 minVotes; uint256 minVoters;
        uint256 minQualifiedEntries; uint256 maxPot;
    }

    /// @param pairCurrencies the hook's admitted pair currencies (for hook 7030: the 62 of hook-7030-descripteur.js DEVISES_7030).
    constructor(Config memory c, address[] memory pairCurrencies) {
        if (c.tblock == address(0) || c.hook == address(0) || c.entryPeriod == 0 || c.votePeriod == 0 || c.votePrice == 0) revert BadParams();
        if (c.minVotes == 0 || pairCurrencies.length == 0) revert BadParams();
        for (uint256 i; i < pairCurrencies.length; ++i) isPairCurrency[pairCurrencies[i]] = true;
        MIN_VOTES = c.minVotes;
        if (c.minVoters == 0 || c.minVoters > type(uint64).max || c.minQualifiedEntries == 0) revert BadParams();
        MIN_VOTERS = c.minVoters;
        MIN_QUALIFIED_ENTRIES = c.minQualifiedEntries;
        if (c.maxPot == 0) revert BadParams();
        MAX_POT = c.maxPot;
        if (c.burnBps > BPS || c.split1 + c.split2 + c.split3 != BPS || c.split1 < c.split2 || c.split2 < c.split3) revert BadParams();
        if (c.genesis < block.timestamp) revert BadParams();
        TBLOCK = c.tblock; HOOK = c.hook; GENESIS = c.genesis; ENTRY_PERIOD = c.entryPeriod; VOTE_PERIOD = c.votePeriod;
        VOTE_PRICE = c.votePrice; ENTRY_FEE = c.entryFee; BURN_BPS = c.burnBps;
        SPLIT1 = c.split1; SPLIT2 = c.split2; SPLIT3 = c.split3;
    }

    modifier lock() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ------------------------------------------------------------------ views

    function roundLength() public view returns (uint256) { return uint256(ENTRY_PERIOD) + VOTE_PERIOD; }

    /// @notice the round whose [start, end) contains now; 0 before GENESIS (round 0 is then fundable but not open yet).
    function currentRound() public view returns (uint256) {
        if (block.timestamp < GENESIS) return 0;
        return (block.timestamp - GENESIS) / roundLength();
    }

    function roundStart(uint256 r) public view returns (uint256) { return GENESIS + r * roundLength(); }
    function voteStart(uint256 r) public view returns (uint256) { return roundStart(r) + ENTRY_PERIOD; }
    function roundEnd(uint256 r) public view returns (uint256) { return roundStart(r) + roundLength(); }

    function qualifiedCount(uint256 r) external view returns (uint256) { return _rounds[r].qualifiedCount; }

    /// @notice how much fund(r, .) can still add before round r's pot reaches MAX_POT (the owner funds this, not a fixed sum:
    ///         a rollover may already have filled part or all of the round).
    function fundRoom(uint256 r) public view returns (uint256) {
        uint256 p = _rounds[r].pot;
        return p >= MAX_POT ? 0 : MAX_POT - p;
    }

    function roundInfo(uint256 r) external view returns (uint256 pot, uint256 totalVotes, uint256 entries, bool settled, uint256[3] memory topIds, uint256 topCount) {
        Round storage R = _rounds[r];
        (topIds, topCount) = _topIds(R);
        return (R.pot, R.totalVotes, _entries[r].length, R.settled, topIds, topCount);
    }

    function entryCount(uint256 r) external view returns (uint256) { return _entries[r].length; }
    function entryOf(uint256 r, uint256 id) external view returns (Entry memory) {
        if (id >= _entries[r].length) revert NoSuchEntry();
        return _entries[r][id];
    }

    // ------------------------------------------------------------------ money in

    /// @notice add TBLOCK to the pot of round `r` (current, or at most FUND_AHEAD_MAX = 2 ahead). Credits what actually arrived.
    ///         CLIPPED to fundRoom(r): only min(amount, room) is pulled, so the funder never pays more than fits and never burns;
    ///         a 1-wei pre-fund or an entry fee cannot make his call revert. Reverts PotFull only if the round is already full.
    function fund(uint256 r, uint256 amount) external lock {
        if (amount == 0) revert BadParams();
        uint256 cur = currentRound();
        // SEC-403: the bound first, so a huge r reverts RoundTooFar instead of overflowing inside roundEnd(r)
        if (r > cur + FUND_AHEAD_MAX) revert RoundTooFar(); // SEC-301: funding window 2, placement window MAX_FUND_AHEAD
        if (r < cur || block.timestamp >= roundEnd(r)) revert RoundEnded();
        uint256 room = fundRoom(r);
        if (room == 0) revert PotFull(r, 0);
        if (amount > room) amount = room;   // clip: never more than fits
        uint256 got = _pull(amount, false); // got <= amount <= room: the pot stays <= MAX_POT
        _rounds[r].pot += got;
        liabilities += got;
        emit Funded(r, msg.sender, got);
    }

    /// @notice enter `blockToken` in the current round. `key` is the v4 PoolKey of the block's pool on HOOK; msg.sender must be
    ///         the creator the hook records for that pool, and becomes the payee.
    function enter(address blockToken, PoolKey calldata key) external lock returns (uint256 entryId) {
        uint256 r = currentRound();
        if (block.timestamp < GENESIS || block.timestamp >= voteStart(r)) revert NotEntryWindow();
        if ((uint256(uint160(blockToken)) >> 80) != B20_PREFIX || blockToken == TBLOCK || isPairCurrency[blockToken]) revert NotB20();
        if (key.hooks != HOOK) revert WrongHook();
        if (blockToken != key.currency0 && blockToken != key.currency1) revert NotInKey();
        if (entered[r][blockToken]) revert AlreadyEntered();
        if (enteredBy[r][msg.sender]) revert PayeeAlreadyEntered();
        (, address blk) = sidesOf(key);
        if (blk != blockToken) revert NotBlockSide(); // the hook, not the caller, says which side is the block
        bytes32 poolId = keccak256(abi.encode(key));
        if (creatorOf(poolId) != msg.sender) revert NotCreator();
        entered[r][blockToken] = true;
        enteredBy[r][msg.sender] = true;
        entryId = _entries[r].length;
        _entries[r].push(Entry(blockToken, msg.sender, 0, 0, false));
        if (ENTRY_FEE != 0) {
            uint256 placed = _place(r, ENTRY_FEE, "ENTRY_FEE"); // this round, then the next ones with room
            liabilities += placed;
            _pull(ENTRY_FEE, true);
            if (placed < ENTRY_FEE) _burnOrDefer(r, ENTRY_FEE - placed, "ENTRY_FEE", false); // only if all 9 rounds are full
        }
        emit Entered(r, entryId, blockToken, msg.sender, poolId, ENTRY_FEE);
    }

    /// @notice which side of `key` is the BLOCK, as HOOK says: cotes(key) -> (devise, bloc) (same call and decoding as
    ///         BlockMissionsV3.sidesOf). Measured on the Base fork 2026-11-09: UNIT key -> (0x0, UNIT); OUSD/UNIT -> (OUSD, UNIT);
    ///         pair/pair, block/block and ETH/pair keys revert PaireNonAdmise() (0x9e16f763). Reverts NotBlockSide if the call
    ///         fails, returns < 64 bytes, or the answer is not exactly the two currencies of the key.
    function sidesOf(PoolKey calldata key) public view returns (address paired, address blk) {
        (bool ok, bytes memory ret) = HOOK.staticcall(abi.encodeWithSignature("cotes((address,address,uint24,int24,address))", key));
        if (!ok || ret.length < 64) revert NotBlockSide();
        (uint256 w0, uint256 w1) = abi.decode(ret, (uint256, uint256));
        if (w0 > type(uint160).max || w1 > type(uint160).max) revert NotBlockSide(); // dirty upper bits: not an address
        (paired, blk) = (address(uint160(w0)), address(uint160(w1)));
        if (blk == address(0) || !((blk == key.currency0 && paired == key.currency1) || (blk == key.currency1 && paired == key.currency0))) {
            revert NotBlockSide();
        }
    }

    /// @notice the creator HOOK records for `poolId`: first 32-byte word of createurs(poolId). Reverts NotCreator if the call
    ///         fails, returns < 32 bytes, the word is not a clean address, or it is zero (unknown pool).
    function creatorOf(bytes32 poolId) public view returns (address creator) {
        (bool ok, bytes memory ret) = HOOK.staticcall(abi.encodeWithSignature("createurs(bytes32)", poolId));
        if (!ok || ret.length < 32) revert NotCreator();
        uint256 w;
        assembly { w := mload(add(ret, 32)) }
        if (w == 0 || w > type(uint160).max) revert NotCreator();
        creator = address(uint160(w));
    }

    /// @notice buy `votes` votes for entry `entryId` of round `r` (must be the round in its vote window).
    function vote(uint256 r, uint256 entryId, uint256 votes) external lock {
        if (r != currentRound() || block.timestamp < voteStart(r)) revert NotVoteWindow(); // end is implied by r == currentRound
        if (entryId >= _entries[r].length) revert NoSuchEntry();
        if (votes == 0 || votes > type(uint64).max) revert BadParams();
        uint256 cost = votes * VOTE_PRICE;
        uint256 burned = cost * BURN_BPS / BPS;
        uint256 toPot = cost - burned;

        // effects
        Round storage R = _rounds[r];
        Entry storage e = _entries[r][entryId];
        e.votes += uint128(votes);
        if (!hasVoted[r][entryId][msg.sender]) { hasVoted[r][entryId][msg.sender] = true; e.voters += 1; }
        if (!e.qualified && e.votes >= MIN_VOTES && e.voters >= MIN_VOTERS) { e.qualified = true; R.qualifiedCount += 1; }
        R.totalVotes += votes;
        uint256 placed = _place(r, toPot, "VOTE"); // the vote share fills this round, then the next ones with room
        uint256 excess = toPot - placed;           // only what fits nowhere is burned, with the vote's own burn share
        burned += excess;
        toPot = placed;
        liabilities += toPot;
        // the podium ranks QUALIFIED entries only, by total votes: an unqualified entry (e.g. one wallet's 1,000 votes) can
        // neither win nor push a qualified one off the podium. Qualification and votes only grow, so the incremental top-3
        // stays exact (an entry joining the qualified set is one key rising from nothing).
        if (e.qualified) _bumpTop(R, _entries[r], entryId);

        // interactions (balance-checked). cost > 0 always (votes > 0, VOTE_PRICE > 0), so no zero-amount transferFrom; with
        // BURN_BPS == BPS, burned == cost and toPot == 0: everything pulled is pushed on to DEAD, and the contract must end
        // exactly where it started (net check below), so `liabilities` and the pot are unchanged by the vote.
        // A vote's burn is STRICT (reverts if DEAD is refused): with BURN_BPS == BPS there is no pot to fall back to, so a
        // token refusing DEAD makes vote() revert. Accepted: the voter keeps his TBLOCK, nothing else is blocked.
        uint256 b0 = _bal(address(this));
        _pull(cost, true);
        if (burned != 0) _burn(burned);
        if (_bal(address(this)) - b0 != toPot) revert TransferFailed();
        if (excess != 0) emit Burned(r, excess, "VOTE");
        emit Voted(r, entryId, msg.sender, votes, toPot, burned);
    }

    /// @notice TBLOCK that reached this contract outside fund/enter/vote is added to the current round's pot.
    function sweepSurplus() external lock {
        uint256 bal = _bal(address(this));
        if (bal <= liabilities) revert NoSurplus();
        uint256 s = bal - liabilities;
        uint256 r = currentRound();
        uint256 placed = _place(r, s, "SURPLUS");
        liabilities += placed;
        emit SurplusSwept(r, placed);
        if (s > placed) _burnOrDefer(r, s - placed, "SURPLUS", false);
    }

    /// @notice retries burns that were deferred because the token refused the transfer to DEAD. Permissionless.
    ///         SEC-401: same rule as _burnOrDefer - what the contract ACTUALLY lost is counted as burned and leaves pendingBurn,
    ///         the rest stays pending (a token that shaves or half-moves cannot lock pendingBurn forever). Reverts if nothing
    ///         left (still refused: pendingBurn unchanged) or if the contract lost MORE than pendingBurn.
    function flushBurn() external lock {
        uint256 amt = pendingBurn;
        if (amt == 0) revert NothingToBurn();
        uint256 b0 = _bal(address(this));
        (bool ok,) = TBLOCK.call(abi.encodeWithSelector(0xa9059cbb, DEAD, amt));
        ok; // the return value is not trusted either way: the balance delta decides
        uint256 b1 = _bal(address(this));
        uint256 lost = b0 > b1 ? b0 - b1 : 0;
        if (lost == 0 || lost > amt) revert TransferFailed();
        pendingBurn = amt - lost;
        liabilities -= lost;
        emit Burned(currentRound(), lost, "FLUSH");
    }

    // ------------------------------------------------------------------ money out

    /// @notice callable by anyone once round `r` has ended. Pays only if the quorum holds (qualifiedCount >=
    ///         MIN_QUALIFIED_ENTRIES, counted over ALL entries of the round); then the top 3 QUALIFIED entries (ranked by total
    ///         votes, ties to the earlier entry) get SPLIT1/2/3. Everything unpaid rolls to currentRound() + 1.
    function settle(uint256 r) external lock {
        if (block.timestamp < roundEnd(r)) revert NotEnded();
        Round storage R = _rounds[r];
        if (R.settled) revert AlreadySettled();
        R.settled = true;

        uint256 pot = R.pot;
        R.pot = 0;
        (uint256[3] memory ids, uint256 n) = _topIds(R);
        uint256[3] memory prizes;
        uint256 paid;
        if (R.qualifiedCount >= MIN_QUALIFIED_ENTRIES) {
            uint256[3] memory splits = [SPLIT1, SPLIT2, SPLIT3];
            for (uint256 i; i < n; ++i) {
                if (!_entries[r][ids[i]].qualified) continue; // defensive: only qualified entries are ever on the podium
                prizes[i] = pot * splits[i] / BPS;
                paid += prizes[i];
            }
        }
        uint256 rolled = pot - paid;
        // r has ended, so currentRound() >= r + 1 and `to` >= r + 2. `to` has not even started: its entry window is entirely
        // ahead, it cannot be settled (settle needs its end), and to == currentRound() + 1 <= currentRound() + MAX_FUND_AHEAD.
        // The rollover fills rounds to .. currentRound()+MAX_FUND_AHEAD up to MAX_POT each (stays inside `liabilities`); only
        // what fits in none of those 8 rounds is burned - i.e. the owner's funding is burned only if 8 future rounds are full.
        uint256 to = currentRound() + 1;
        uint256 placed = rolled == 0 ? 0 : _place(to, rolled, "ROLLOVER");
        emit Settled(r, pot, ids, prizes, placed, to);

        // payouts FIRST, independent of the burn: a token refusing DEAD can never block a winner's prize
        for (uint256 i; i < n; ++i) if (prizes[i] != 0) _payOrCredit(r, _entries[r][ids[i]].payee, prizes[i]);
        if (rolled > placed) _burnOrDefer(r, rolled - placed, "ROLLOVER", true);
    }

    /// @notice withdraw a prize whose automatic payment failed, to `to` (the payee's own address or another one he controls,
    ///         e.g. when the token refuses his address). Only msg.sender's own credit can be moved.
    function claim(address to) external lock {
        if (to == address(0) || to == address(this)) revert BadParams();
        uint256 amt = claimable[msg.sender];
        if (amt == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        liabilities -= amt;
        _push(to, amt);
        emit Claimed(msg.sender, to, amt);
    }

    // ------------------------------------------------------------------ internals

    /// @dev top-3 maintained on every vote. Votes only grow and only one entry changes per call, so removing it and re-inserting
    ///      it by (votes desc, id asc) keeps the exact top 3 (proved against brute force in the fuzz test).
    function _bumpTop(Round storage R, Entry[] storage es, uint256 id) private {
        uint32[3] memory t = R.top;
        if (id >= type(uint32).max) revert BadParams(); // SEC-204: id + 1 must fit the uint32 podium slot
        uint32 key = uint32(id + 1);
        uint256 k;
        uint32[3] memory rest; // current top without `id`
        for (uint256 i; i < 3; ++i) if (t[i] != 0 && t[i] != key) rest[k++] = t[i];
        uint32[3] memory out;
        uint256 o;
        bool placed;
        uint256 v = es[id].votes;
        for (uint256 i; i < k && o < 3; ++i) {
            if (!placed && _beats(v, id, es[rest[i] - 1].votes, rest[i] - 1)) { out[o++] = key; placed = true; if (o == 3) break; }
            out[o++] = rest[i];
        }
        if (!placed && o < 3) out[o] = key;
        R.top = out;
    }

    function _beats(uint256 va, uint256 ida, uint256 vb, uint256 idb) private pure returns (bool) {
        return va > vb || (va == vb && ida < idb);
    }

    function _topIds(Round storage R) private view returns (uint256[3] memory ids, uint256 n) {
        for (uint256 i; i < 3; ++i) { if (R.top[i] == 0) break; ids[n++] = R.top[i] - 1; }
    }

    /// @dev pulls `amount` from msg.sender. exact=true: revert unless exactly `amount` arrived (fee-on-transfer refused).
    function _pull(uint256 amount, bool exact) private returns (uint256 got) {
        uint256 b0 = _bal(address(this));
        _call(abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), amount));
        got = _bal(address(this)) - b0;
        if (got == 0 || got > amount || (exact && got != amount)) revert TransferFailed();
    }

    /// @dev adds up to `amount` to round r's pot without passing MAX_POT; returns what was added and the excess. Only called by
    ///      _place, which moves the excess on to the next round. Never touches `liabilities` itself.
    function _capAdd(uint256 r, uint256 amount) private returns (uint256 added, uint256 excess) {
        uint256 room = fundRoom(r);
        added = amount < room ? amount : room;
        excess = amount - added;
        _rounds[r].pot += added;
    }

    /// @dev puts `amount` into the pots of rounds first .. currentRound() + MAX_FUND_AHEAD (at most 9), each filled up to
    ///      MAX_POT; returns what was placed (the caller burns the rest). `first` is the current round or currentRound()+1,
    ///      so no target has ended or been settled. Never touches `liabilities`.
    function _place(uint256 first, uint256 amount, bytes32 reason) private returns (uint256 placed) {
        uint256 last = currentRound() + MAX_FUND_AHEAD;
        for (uint256 k = first; k <= last && placed < amount; ++k) {
            (uint256 added,) = _capAdd(k, amount - placed);
            if (added != 0) { placed += added; emit Placed(k, added, reason); }
        }
    }

    /// @dev NON-FATAL burn for settle / enter / sweepSurplus: try the transfer to DEAD and account with what the contract
    ///      ACTUALLY lost. Whatever did not leave (refused call, false return, partial transfer) is kept as `pendingBurn`
    ///      (inside `liabilities`, so balance >= liabilities still holds) for flushBurn() to retry. A token that shaves the
    ///      amount on the way to DEAD (DEAD gains less than the contract lost) is accepted: the tokens left the contract either
    ///      way. Never reverts for any of these; it reverts only if the contract lost MORE than `amount` (a token taking more
    ///      than asked would break the books - refusing is the only safe answer).
    ///      inLiabilities: whether `amount` is already counted in `liabilities` (rollover) or not yet (fee / surplus excess).
    function _burnOrDefer(uint256 r, uint256 amount, bytes32 reason, bool inLiabilities) private {
        uint256 b0 = _bal(address(this));
        uint256 d0 = _bal(DEAD);
        (bool ok, bytes memory ret) = TBLOCK.call(abi.encodeWithSelector(0xa9059cbb, DEAD, amount));
        ok = ok && (ret.length == 0 || (ret.length == 32 && abi.decode(ret, (bool))));
        uint256 b1 = _bal(address(this));
        uint256 lost = b0 > b1 ? b0 - b1 : 0;
        if (lost > amount) revert TransferFailed();
        uint256 d1 = _bal(DEAD);
        if (ok && lost == amount && d1 >= d0 && d1 - d0 == amount) {
            if (inLiabilities) liabilities -= amount;
            emit Burned(r, amount, reason);
            return;
        }
        // mismatch or refusal (SEC-302): what left is burned, the rest is deferred
        uint256 unburned = amount - lost;
        if (lost != 0) {
            if (inLiabilities) liabilities -= lost;
            emit Burned(r, lost, reason);
        }
        if (unburned != 0) {
            pendingBurn += unburned;
            if (!inLiabilities) liabilities += unburned;
            emit BurnDeferred(r, unburned, reason);
        }
    }

    function _burn(uint256 amount) private {
        uint256 d0 = _bal(DEAD);
        _push(DEAD, amount);
        if (_bal(DEAD) - d0 != amount) revert TransferFailed();
    }

    /// @dev transfer that reverts on failure, checked on our balance.
    function _push(address to, uint256 amount) private {
        uint256 b0 = _bal(address(this));
        _call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (b0 - _bal(address(this)) != amount) revert TransferFailed();
    }

    /// @dev a prize: try to transfer; if the token refuses, keep it as a claimable credit so settle cannot be blocked.
    function _payOrCredit(uint256 r, address to, uint256 amount) private {
        uint256 b0 = _bal(address(this));
        // SEC-105: with less than the reserve, revert the whole settle (nothing changes) instead of letting the transfer run
        // out of gas and land in `claimable`. Checked right before the call, after the balance read.
        if (gasleft() < PAYOUT_GAS_RESERVE) revert GasReserve();
        (bool ok, bytes memory ret) = TBLOCK.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (ok && (ret.length == 0 || (ret.length == 32 && abi.decode(ret, (bool))))) {
            if (b0 - _bal(address(this)) != amount) revert TransferFailed();
            liabilities -= amount;
            emit Paid(r, to, amount);
        } else {
            if (_bal(address(this)) != b0) revert TransferFailed();
            claimable[to] += amount; // stays inside `liabilities`
            emit PayoutDeferred(r, to, amount);
        }
    }

    function _call(bytes memory data) private {
        (bool ok, bytes memory ret) = TBLOCK.call(data);
        if (!ok || (ret.length != 0 && (ret.length != 32 || !abi.decode(ret, (bool))))) revert TransferFailed();
    }

    function _bal(address who) private view returns (uint256) { return _balOf(TBLOCK, who); }

    function _balOf(address token, address who) private view returns (uint256) {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
        if (!ok || ret.length != 32) revert TransferFailed();
        return abi.decode(ret, (uint256));
    }
}
