// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILikesView {
    function epochEnd(uint256 e) external view returns (uint256);
    function spentIn(uint256 e, address a) external view returns (uint256);
    function totalSpentIn(uint256 e) external view returns (uint256);
    function topOf(uint256 e) external view returns (address);
    function currentEpoch() external view returns (uint256);
}

interface IContestFund {
    function currentRound() external view returns (uint256);
    function fundRoom(uint256 r) external view returns (uint256);
    function fund(uint256 r, uint256 amount) external;
}

/// @title TBlockVault - the community vault of TokenizedBlock (Phil 2026-11-10).
/// @notice Holds TBLOCK sent to it (buyback v2 output, Create fees paid in TBLOCK, anyone) and pays it out ONLY by these
///         fixed rules. No upgrade, no burn. The ONLY hand on it is the dev rescue (rule 3): announced on chain, 7 days of delay,
///         free part only, and renounceable for good.
///
/// 1. PLAYERS FIRST. Each epoch of BlockLikes (people burn TBLOCK to +1 blocks), once the epoch has ended, anyone calls
///    closeEpoch(e). It reserves a budget = min(free * REWARD_BPS, MAX_EPOCH_BUDGET, what can actually be paid). Then each player
///    of that epoch calls claim(e) within CLAIM_WINDOW seconds:
///      share = budget * (1 - TOP_BPS) * spent / totalSpent, capped at spent * REBATE_BPS   (the "airdrop" to every player)
///      + if the player is the epoch's top contributor: budget * TOP_BPS, capped at spent * REBATE_BPS  (the top bonus)
///    With REBATE_BPS <= 5000 a player never gets back more than what they burned: liking cannot be farmed for profit.
///    claim() requires the claimer to HOLD at least MIN_HOLD TBLOCK at that call (read at the call, not over time).
///    After the window, release(e) returns what was not claimed to the free balance.
/// 2. THEN THE CONTEST. feedContest() (anyone, at most once per FEED_COOLDOWN) adds min(free, MAX_FEED_PER_CALL, room left
///    under the cap) to the pot of the contest's current round. Reserved budgets are never used for this.
/// "free" = TBLOCK held - TBLOCK reserved for open epochs.
/// 3. DEV RESCUE (Phil 2026-11-10: "le dev peut deverouiller le coffre au besoin"; then: TWO wallets, the TBLOCK dev wallet and Grok's).
///    DEV and DEV2 (immutable, set at construction, NOT the deployer) can take TBLOCK out by hand, but only in public and slowly:
///    either announces (announceRescue) a RESCUE_DELAY countdown visible on chain (event + rescueAt); after it, either executes rescue(),
///    which pays at most min(amount, free) to the dev who executes it, never a reserved player budget. Either can cancel, and either can
///    renounce the power FOR BOTH, for good (renounceRescue): after that nobody can ever move the vault by hand.
contract TBlockVault {
    uint256 public constant BPS = 10_000;

    address public immutable TBLOCK;
    address public immutable LIKES;
    address public immutable CONTEST;
    uint256 public immutable MIN_HOLD;          // raw TBLOCK a claimer must hold
    uint256 public immutable REWARD_BPS;        // part of the free balance reserved for an epoch at close
    uint256 public immutable TOP_BPS;           // part of an epoch budget kept for its top contributor
    uint256 public immutable REBATE_BPS;        // a player's share (and the top bonus) never exceed spent * REBATE_BPS
    uint256 public immutable MAX_EPOCH_BUDGET;  // raw TBLOCK
    uint256 public immutable CLAIM_WINDOW;      // seconds after close
    uint256 public immutable MAX_FEED_PER_CALL; // raw TBLOCK
    uint256 public immutable FEED_COOLDOWN;     // seconds
    address public immutable DEV;               // first dev wallet (rescue rights)
    address public immutable DEV2;              // second dev wallet (same rights)
    uint256 public constant RESCUE_DELAY = 7 days;
    uint256 public constant FEED_QUIET = 1 days;  // no feeding in the last day of an epoch that has players
    uint256 public closeCursor;                   // every epoch below it is closed or had no players

    uint256 public rescueAmount;   // announced amount, 0 = none pending
    uint256 public rescueAt;       // earliest time rescue() can run
    bool public rescueRenounced;

    struct Epoch { uint256 budget; uint256 paid; uint64 closedAt; bool closed; bool released; }
    mapping(uint256 => Epoch) public epochs;
    mapping(uint256 => mapping(address => bool)) public claimed;
    uint256 public reserved;
    uint256 public lastFeedAt;
    uint256 private _lock = 1;

    event EpochClosed(uint256 indexed epoch, uint256 budget, uint256 totalSpent);
    event Claimed(uint256 indexed epoch, address indexed player, uint256 share, uint256 topBonus);
    event Released(uint256 indexed epoch, uint256 amount);
    event ContestFed(uint256 indexed round, uint256 amount);
    event RescueAnnounced(uint256 amount, uint256 executableAt);
    event RescueCancelled();
    event Rescued(uint256 amount);
    event RescueRenounced();

    error BadParams();
    error Locked();
    error EpochNotOver(uint256 endsAt);
    error AlreadyClosed();
    error NotClosed();
    error WindowClosed();
    error WindowOpen();
    error AlreadyClaimed();
    error AlreadyReleased();
    error NothingToClaim();
    error HoldTooLow(uint256 balance, uint256 minHold);
    error Cooldown(uint256 nextAt);
    error NothingToFeed();
    error PlayersFirst(uint256 epochToClose);
    error NotDev();
    error Renounced();
    error NoRescue();
    error TooEarly(uint256 at);
    error TransferFailed();

    modifier lock() {
        if (_lock != 1) revert Locked();
        _lock = 2;
        _;
        _lock = 1;
    }

    struct Config {
        address tblock; address likes; address contest; uint256 minHold; uint256 rewardBps; uint256 topBps; uint256 rebateBps;
        uint256 maxEpochBudget; uint256 claimWindow; uint256 maxFeedPerCall; uint256 feedCooldown; address dev; address dev2;
    }

    constructor(Config memory c) {
        if (c.tblock == address(0) || c.likes == address(0) || c.contest == address(0)) revert BadParams();
        if (c.rewardBps == 0 || c.rewardBps > BPS || c.rebateBps == 0 || c.rebateBps > 5_000) revert BadParams();
        if (c.maxEpochBudget == 0 || c.claimWindow == 0 || c.maxFeedPerCall == 0) revert BadParams();
        if (c.claimWindow > 365 days || c.feedCooldown > 30 days || c.topBps >= 5_000) revert BadParams();
        TBLOCK = c.tblock; LIKES = c.likes; CONTEST = c.contest; MIN_HOLD = c.minHold; REWARD_BPS = c.rewardBps; TOP_BPS = c.topBps;
        REBATE_BPS = c.rebateBps; MAX_EPOCH_BUDGET = c.maxEpochBudget; CLAIM_WINDOW = c.claimWindow;
        MAX_FEED_PER_CALL = c.maxFeedPerCall; FEED_COOLDOWN = c.feedCooldown;
        if (c.dev == address(0) || c.dev2 == address(0) || c.dev == c.dev2) revert BadParams();
        DEV = c.dev; DEV2 = c.dev2;
    }

    function _onlyDev() private view { if (msg.sender != DEV && msg.sender != DEV2) revert NotDev(); }

    // ------------------------------------------------------------------ 3. dev rescue: public, delayed, free part only

    function announceRescue(uint256 amount) external lock {
        _onlyDev();
        if (rescueRenounced) revert Renounced();
        if (amount == 0) revert BadParams();
        rescueAmount = amount;
        rescueAt = block.timestamp + RESCUE_DELAY;
        emit RescueAnnounced(amount, rescueAt);
    }
    function cancelRescue() external lock {
        _onlyDev();
        if (rescueAmount == 0) revert NoRescue();
        rescueAmount = 0; rescueAt = 0;
        emit RescueCancelled();
    }
    function rescue() external lock returns (uint256 amount) {
        _onlyDev();
        if (rescueRenounced) revert Renounced();
        if (rescueAmount == 0) revert NoRescue();
        if (block.timestamp < rescueAt) revert TooEarly(rescueAt);
        amount = rescueAmount;
        uint256 f = free();
        if (amount > f) amount = f; // never a reserved player budget
        rescueAmount = 0; rescueAt = 0;
        if (amount == 0) revert NoRescue();
        _send(msg.sender, amount); // the dev who executes receives it
        emit Rescued(amount);
    }
    function renounceRescue() external lock {
        _onlyDev();
        rescueRenounced = true; rescueAmount = 0; rescueAt = 0;
        emit RescueRenounced();
    }

    // ------------------------------------------------------------------ views

    function balance() public view returns (uint256) { return _bal(address(this)); }
    function free() public view returns (uint256) { uint256 b = balance(); return b > reserved ? b - reserved : 0; }

    /// @notice what claim(e) would pay `player` now (0,0 if nothing): the same arithmetic as claim, without the checks on time/hold.
    function owed(uint256 e, address player) public view returns (uint256 share, uint256 topBonus) {
        Epoch storage E = epochs[e];
        if (!E.closed || E.budget == 0 || claimed[e][player]) return (0, 0);
        ILikesView L = ILikesView(LIKES);
        uint256 spent = L.spentIn(e, player);
        uint256 total = L.totalSpentIn(e);
        if (spent == 0 || total == 0) return (0, 0);
        uint256 cap = spent * REBATE_BPS / BPS;
        share = E.budget * (BPS - TOP_BPS) / BPS * spent / total;
        if (share > cap) share = cap;
        if (L.topOf(e) == player) {
            topBonus = E.budget * TOP_BPS / BPS;
            if (topBonus > cap) topBonus = cap;
        }
    }

    // ------------------------------------------------------------------ 1. players first

    function closeEpoch(uint256 e) external lock returns (uint256 budget) {
        Epoch storage E = epochs[e];
        if (E.closed) revert AlreadyClosed();
        ILikesView L = ILikesView(LIKES);
        uint256 end = L.epochEnd(e);
        if (block.timestamp < end) revert EpochNotOver(end);
        uint256 total = L.totalSpentIn(e);
        budget = free() * REWARD_BPS / BPS;
        if (budget > MAX_EPOCH_BUDGET) budget = MAX_EPOCH_BUDGET;
        uint256 payable_ = total * REBATE_BPS / BPS * 2; // most that can ever be paid: every share + the top bonus, both capped
        if (budget > payable_) budget = payable_;
        E.closed = true; E.closedAt = uint64(block.timestamp); E.budget = budget;
        reserved += budget;
        emit EpochClosed(e, budget, total);
    }

    function claim(uint256 e) external lock returns (uint256 paid) {
        Epoch storage E = epochs[e];
        if (!E.closed) revert NotClosed();
        if (block.timestamp >= uint256(E.closedAt) + CLAIM_WINDOW) revert WindowClosed();
        if (claimed[e][msg.sender]) revert AlreadyClaimed();
        uint256 held = _bal(msg.sender);
        if (held < MIN_HOLD) revert HoldTooLow(held, MIN_HOLD);
        (uint256 share, uint256 bonus) = owed(e, msg.sender);
        paid = share + bonus;
        if (paid > E.budget - E.paid) paid = E.budget - E.paid; // never more than the epoch's budget
        if (paid == 0) revert NothingToClaim();
        claimed[e][msg.sender] = true;
        E.paid += paid;
        reserved -= paid;
        _send(msg.sender, paid);
        emit Claimed(e, msg.sender, share, bonus);
    }

    function release(uint256 e) external lock returns (uint256 back) {
        Epoch storage E = epochs[e];
        if (!E.closed) revert NotClosed();
        if (block.timestamp < uint256(E.closedAt) + CLAIM_WINDOW) revert WindowOpen();
        if (E.released) revert AlreadyReleased();
        E.released = true;
        back = E.budget - E.paid;
        reserved -= back;
        emit Released(e, back);
    }

    // ------------------------------------------------------------------ 2. then the contest

    function feedContest() external lock returns (uint256 amount) {
        if (lastFeedAt != 0 && block.timestamp < lastFeedAt + FEED_COOLDOWN) revert Cooldown(lastFeedAt + FEED_COOLDOWN);
        /* players first, ENFORCED: (a) every ended epoch with players must be closed (its budget reserved) before the contest is fed;
         * (b) no feeding during the last FEED_QUIET of an epoch that has players, so its budget cannot be drained just before close */
        ILikesView Lk = ILikesView(LIKES);
        uint256 cur = Lk.currentEpoch();
        uint256 k = closeCursor;
        while (k < cur && (epochs[k].closed || Lk.totalSpentIn(k) == 0)) k++;
        if (k < cur) revert PlayersFirst(k);
        closeCursor = k;
        if (block.timestamp + FEED_QUIET >= Lk.epochEnd(cur) && Lk.totalSpentIn(cur) > 0) revert PlayersFirst(cur);
        IContestFund C = IContestFund(CONTEST);
        uint256 r = C.currentRound();
        amount = free();
        if (amount > MAX_FEED_PER_CALL) amount = MAX_FEED_PER_CALL;
        uint256 room = C.fundRoom(r);
        if (amount > room) amount = room;
        if (amount == 0) revert NothingToFeed();
        lastFeedAt = block.timestamp;
        uint256 before = balance();
        _approve(CONTEST, amount);
        C.fund(r, amount);
        _approve(CONTEST, 0);
        uint256 gone = before - balance();
        if (gone > amount) revert TransferFailed(); // the contest pulled more than approved: impossible with a sane token
        emit ContestFed(r, gone);
        amount = gone;
    }

    // ------------------------------------------------------------------ token plumbing

    function _bal(address a) private view returns (uint256) {
        (bool ok, bytes memory r) = TBLOCK.staticcall(abi.encodeWithSelector(0x70a08231, a));
        if (!ok || r.length < 32) revert TransferFailed();
        return abi.decode(r, (uint256));
    }
    function _send(address to, uint256 a) private {
        uint256 before = _bal(to);
        (bool ok, bytes memory r) = TBLOCK.call(abi.encodeWithSelector(0xa9059cbb, to, a));
        if (!ok || (r.length != 0 && (r.length < 32 || !abi.decode(r, (bool))))) revert TransferFailed();
        if (_bal(to) - before != a) revert TransferFailed();
    }
    function _approve(address s, uint256 a) private {
        (bool ok, bytes memory r) = TBLOCK.call(abi.encodeWithSelector(0x095ea7b3, s, a));
        if (!ok || (r.length != 0 && (r.length < 32 || !abi.decode(r, (bool))))) revert TransferFailed();
    }
}
