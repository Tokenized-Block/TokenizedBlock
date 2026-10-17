// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockMissionsV3 — a block's own task market, paid in the block's units OR in the asset it is paired with.
/// @notice DRAFT 2026-10-17 (Claude, built on Grok's v2 5cc7b89 + the adversarial review of 2026-10-17). NOT DEPLOYED. It holds funds in
///         escrow: review + Base-fork rehearsal before any deploy.
///
/// WHAT CHANGED FROM v2 (each line answers a measured finding or Phil's 2026-10-17 brief)
///   - CREATOR PROVEN ON CHAIN, no owner registry: postTask() takes the block's v4 PoolKey; the key must use OUR hook (HOOK, immutable)
///     and HOOK.createurs(poolId) must be msg.sender. The owner can no longer name anyone creator of anything.
///   - REWARD IN UNITS OR IN THE PAIRED ASSET (Phil: "a block paired with AMZN pays its missions in units or in AMZN"): rewardToken is the
///     block or the other currency of the pool (an ERC-20; native ETH can be a HOLDING condition, never a reward).
///   - HOLD CONDITIONS, both proven: minHoldBlock (mandatory — holding is the ticket) and minHoldPaired (optional; native ETH allowed),
///     each = the MINIMUM balance over the task's window (24 h..7 d), signed by the verifier, AND re-read live at claim. A tier bonus
///     (≤ 20 %, escrowed up front) rewards a deeper block holding. Holding through the window, not touching in and out, is what pays.
///   - review M1: verifier and guardian changes are PROPOSED then ACCEPTED after ADMIN_DELAY (48 h > CANCEL_DELAY; the rail is immutable); a pause set by
///     the guardian can be lifted by the guardian, or by the owner only ADMIN_DELAY after it.
///   - review M2 (then M2 residual 2): the rail (the only path of the dev's 20 % out of non-USDC tokens) is IMMUTABLE, or none; a reward
///     paid in USDC sends the dev's 20 % straight to DEV_WALLET, no rail at all.
///   - review L2: a push never turns a SHORTFALL into an IOU: if the contract does not hold the amount, the claim reverts.
///   - review L3: finalizeCancel() is closed while paused, opens CANCEL_DELAY after max(request, last unpause) and closes CANCEL_WINDOW
///     later (a stale request must be renewed, so a creator cannot sit on it and front-run claims days later).
///   - REVIEW OF V3 (2026-10-17, 14 agents, PoCs run): a no-op unpause reset every cancel clock (HIGH) -> unpause only when paused;
///     the 48 h notice did not protect escrow because a pause closes finalizeCancel (HIGH) -> accept only while unpaused and 48 h after
///     the last unpause; the caller chose which side is the block (MED) -> HOOK.cotes(key) says it (measured on UNIT); window end not
///     signed (MED) -> signed, ≤ 1 h old; native-ETH holding cannot be measured exactly (MED) -> refused; new posts into an insolvent
///     token (MED) -> refused, sweep() sends any surplus to the reserve.
/// UNCHANGED from v2: fee 10 % of the reward (30 % creator, 70 % TB -> 80 % COMMUNITY_RESERVE in the reward token, 20 % dev), caps
///   (DAILY_CAP per wallet, TASK_DAILY_CAP, TOKEN_DAILY_CAP per block), txHash pays once, EIP-712 with a ≤ 1 h deadline, 2-step
///   ownership, fee-on-transfer refused, push-or-credit for a recipient that cannot receive, BLOCKERIE_PAID_DRAW = false (D18).
/// ⚠ TRUST POINTS: the verifier key (KMS/HSM; a stolen key signs fake completions within the caps, and its rotation is now public 48 h
///   ahead) and the owner (can pause, propose; cannot touch escrow, cannot name a creator).
contract BlockMissionsV3 {
    uint256 public constant FEE_BPS = 1000;
    uint256 public constant TB_SHARE_BPS = 7000;
    uint256 public constant RESERVE_SHARE_BPS = 8000;
    uint256 public constant DAILY_CAP = 5;
    uint256 public constant TASK_DAILY_CAP = 20;
    uint256 public constant TOKEN_DAILY_CAP = 100;
    uint256 public constant MAX_DURATION = 30 days;
    uint32 public constant MAX_COMPLETIONS = 10_000;
    uint256 public constant MAX_DEADLINE = 1 hours;
    uint256 public constant CANCEL_DELAY = 24 hours;
    uint256 public constant CANCEL_WINDOW = 72 hours;
    uint32 public constant MIN_HOLD_WINDOW = 24 hours;
    uint32 public constant MAX_HOLD_WINDOW = 7 days;
    uint256 public constant MAX_BONUS_BPS = 2000;
    uint256 public constant ADMIN_DELAY = 48 hours;
    bool public constant BLOCKERIE_PAID_DRAW = false;
    address public constant FORBIDDEN_LEGACY = 0x37Eb9b7ce0b51Fe12fBf092026e001918128580A;
    bytes32 public constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant CLAIM_TYPEHASH =
        keccak256("Claim(uint256 taskId,address completer,bytes32 txHash,uint256 heldBlock,uint256 heldPaired,uint32 window,uint64 windowEnd,uint256 deadline)");

    address public immutable HOOK;
    /// @notice review M2 residual (Grok's PoC on V3, 2026-10-17): a rail accepted after the timelock could still keep the dev's units
    ///         for 1 wei of USDC. convertDevShare now requires the units to land IN the v4 PoolManager (sold into a pool), never elsewhere.
    address public immutable POOL_MANAGER;
    /// @notice review L4: below this many raw units a reward pays no dev/creator share at all (8-decimal stocks made it visible).
    uint256 public constant MIN_REWARD = 1000;
    address public immutable COMMUNITY_RESERVE;
    address public immutable DEV_WALLET;
    address public immutable USDC;

    address public owner;
    address public pendingOwner;
    address public verifier;
    address public guardian;
    /// @notice review M2 residual 2 (Grok, REAL PoolManager, 2026-10-17): a REPLACEABLE rail could pass every balance check (deposit the
    ///         units into the PoolManager, mint itself ERC-6909 claims, take them later; or sell into a pool at a rigged price). The rail is
    ///         now IMMUTABLE — fixed, reviewed code with fixed routes — or address(0): then the dev's 20 % of a non-USDC reward goes straight
    ///         to the COMMUNITY_RESERVE at claim time (the dev never holds units, nothing waits on a rail).
    address public immutable RAIL;
    struct Proposal { address value; uint64 readyAt; }
    Proposal public nextVerifier;
    Proposal public nextGuardian;
    bool public paused;
    uint64 public guardianPausedAt; // 0 = the current pause (if any) was set by the owner
    uint64 public lastUnpausedAt;

    /// @dev Uniswap v4 PoolKey, same field order and types: poolId = keccak256(abi.encode(key)).
    struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
    struct TaskParams {
        address rewardToken; uint256 reward; uint32 maxDone; uint8 perWallet; uint64 expiry; address target; bytes32 topic0; bytes32 descHash;
    }
    struct Hold { uint256 minBlock; uint256 minPaired; uint256 bonusMinBlock; uint16 bonusBps; uint32 window; }
    struct Task {
        address blockToken; address paired; address rewardToken; address creator; uint256 reward;
        uint32 maxDone; uint32 done; uint8 perWallet; uint64 expiry; address target; bytes32 topic0; bytes32 descHash;
    }

    Task[] private _tasks;
    mapping(uint256 => Hold) public holdOf;
    mapping(uint256 => uint256) public escrowLeft;
    mapping(address => uint256) public devOwed; // reward token => dev's 20 % waiting for the rail (never paid out as that token)
    mapping(bytes32 => bool) public txUsed;
    mapping(uint256 => mapping(address => uint256)) public doneBy;
    mapping(address => mapping(uint256 => uint256)) public claimsOnDay;
    mapping(uint256 => mapping(uint256 => uint256)) public taskClaimsOnDay;
    mapping(address => mapping(uint256 => uint256)) public tokenClaimsOnDay; // block => day => count
    mapping(address => mapping(address => uint256)) public pending; // token => account => credit (recipient could not receive)
    mapping(uint256 => uint256) public cancelRequestedAt;
    /// @notice everything this contract OWES in a token: open escrows + credits + dev's share. Review L2: every payment first checks
    ///         balance >= owed, so a token whose balance shrank (rebase, clawback) halts instead of paying task A out of task B's escrow.
    mapping(address => uint256) public owed;
    uint256 private _lock = 1;

    event TaskPosted(uint256 indexed taskId, address indexed blockToken, address indexed creator, address rewardToken, uint256 reward, uint32 maxDone, uint64 expiry, bytes32 poolId);
    event TaskHold(uint256 indexed taskId, uint256 minBlock, uint256 minPaired, uint256 bonusMinBlock, uint16 bonusBps, uint32 window);
    event TaskClaimed(uint256 indexed taskId, address indexed completer, bytes32 indexed txHash, uint256 paid, uint256 toReserve, uint256 toDev, uint256 toCreator);
    event TaskClosed(uint256 indexed taskId, uint256 refunded, bool cancelled);
    event CancelRequested(uint256 indexed taskId, uint256 at);
    event Proposed(bytes32 indexed what, address value, uint64 readyAt);
    event Accepted(bytes32 indexed what, address value);
    event PausedSet(bool paused, address by);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);
    event Withdrawn(address indexed token, address indexed account, uint256 amount);
    event DevPaid(address indexed token, uint256 amount);
    event DevShareConverted(address indexed token, uint256 amount, uint256 usdcToDev);

    error NotOwner(); error NotCreator(); error BadAddress(); error BadParams(); error FeeOnTransfer(); error Expired(); error NotExpired();
    error ReserveEmpty(); error SelfDealing(); error TxUsed(); error CapReached(); error BadProof(); error NothingToRefund();
    error NothingToWithdraw(); error TransferFailed(); error Reentrancy(); error NotHolder(); error Paused(); error SignatureExpired();
    error CancelPending(); error CancelStale(); error DeadlineTooFar(); error UnitsToDev(); error SlippageUsdc(); error NotReady();
    error Shortfall(); error WrongHook(); error NotSold(); error NotPaused(); error StaleWindow();

    modifier nonReentrant() { if (_lock != 1) revert Reentrancy(); _lock = 2; _; _lock = 1; }
    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier whenNotPaused() { if (paused) revert Paused(); _; }

    constructor(address hook, address poolManager, address devWallet, address communityReserve, address usdc, address verifier_, address guardian_, address rail_) {
        if (hook == address(0) || poolManager == address(0) || devWallet == address(0) || communityReserve == address(0) || usdc == address(0) || verifier_ == address(0)) revert BadAddress();
        if (devWallet == FORBIDDEN_LEGACY || communityReserve == FORBIDDEN_LEGACY || communityReserve == devWallet) revert BadAddress();
        if (rail_ == devWallet || rail_ == communityReserve) revert BadAddress();
        /* review F5 (Grok, 2026-10-17): a non-zero rail must be deployed code and none of the contracts it talks to */
        if (rail_ != address(0) && (rail_.code.length == 0 || rail_ == hook || rail_ == poolManager || rail_ == usdc)) revert BadAddress();
        HOOK = hook; POOL_MANAGER = poolManager; DEV_WALLET = devWallet; COMMUNITY_RESERVE = communityReserve; USDC = usdc; RAIL = rail_;
        verifier = verifier_; guardian = guardian_; owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ───────────────────────────── admin: everything that can redirect value waits ADMIN_DELAY in public (review M1/M2)
    function proposeVerifier(address v) external onlyOwner { if (v == address(0)) revert BadAddress(); nextVerifier = _propose("verifier", v); }
    function acceptVerifier() external { verifier = _accept(nextVerifier, "verifier"); delete nextVerifier; }
    function proposeGuardian(address g) external onlyOwner { nextGuardian = _propose("guardian", g); }
    function acceptGuardian() external { guardian = _accept(nextGuardian, "guardian"); delete nextGuardian; }

    function _propose(bytes32 what, address v) private returns (Proposal memory p) {
        p = Proposal(v, uint64(block.timestamp + ADMIN_DELAY));
        emit Proposed(what, v, p.readyAt);
    }
    /// @dev review V3 HIGH (2026-10-17): the 48 h notice must be 48 h of OPEN contract — a pause closes finalizeCancel, so an owner who
    ///      pauses then accepts would leave creators no exit. Accept only while unpaused AND ADMIN_DELAY after the last unpause
    ///      (ADMIN_DELAY 48 h > CANCEL_DELAY 24 h: every creator can cancel and finalize before a new verifier/guardian/rail applies).
    function _accept(Proposal memory p, bytes32 what) private returns (address) {
        if (p.readyAt == 0 || block.timestamp < p.readyAt) revert NotReady();
        if (paused || block.timestamp < uint256(lastUnpausedAt) + ADMIN_DELAY) revert NotReady();
        emit Accepted(what, p.value);
        return p.value;
    }

    /// @notice pause: owner or guardian. Unpause: the guardian at any time; the owner only if HE paused, or ADMIN_DELAY after a guardian pause.
    function setPaused(bool p) external {
        bool g = msg.sender == guardian && guardian != address(0);
        if (msg.sender != owner && !g) revert NotOwner();
        if (p) {
            paused = true;
            if (g) guardianPausedAt = uint64(block.timestamp);
        } else {
            /* review V3 HIGH: a no-op unpause moved lastUnpausedAt and reset every cancel clock at will */
            if (!paused) revert NotPaused();
            if (!g && guardianPausedAt != 0 && block.timestamp < guardianPausedAt + ADMIN_DELAY) revert NotReady();
            paused = false; guardianPausedAt = 0; lastUnpausedAt = uint64(block.timestamp);
        }
        emit PausedSet(p, msg.sender);
    }

    function transferOwnership(address to) external onlyOwner { if (to == address(0)) revert BadAddress(); pendingOwner = to; emit OwnershipTransferStarted(owner, to); }
    function acceptOwnership() external { if (msg.sender != pendingOwner) revert NotOwner(); emit OwnershipTransferred(owner, msg.sender); owner = msg.sender; pendingOwner = address(0); }

    // ───────────────────────────── tasks
    function poolIdOf(PoolKey calldata key) public pure returns (bytes32) { return keccak256(abi.encode(key)); }

    /// @notice the creator REGISTERED on our hook for this pool (first word of createurs(bytes32)); address(0) if unreadable.
    function creatorOfPool(PoolKey calldata key) public view returns (address c) {
        (bool ok, bytes memory ret) = HOOK.staticcall(abi.encodeWithSignature("createurs(bytes32)", poolIdOf(key)));
        if (ok && ret.length >= 32) c = abi.decode(ret, (address));
    }

    /// @notice which side is the BLOCK, as the hook itself says: cotes(key) -> (devise, bloc). MEASURED on Base 2026-10-17 for UNIT's pool:
    ///         (0x0 = ETH, UNIT). Review V3 MED: the caller used to choose the side and could declare USDC/AMZNc "the block".
    function sidesOf(PoolKey calldata key) public view returns (address paired, address blk) {
        (bool ok, bytes memory ret) = HOOK.staticcall(abi.encodeWithSignature("cotes((address,address,uint24,int24,address))", key));
        if (!ok || ret.length < 64) revert BadParams();
        (paired, blk) = abi.decode(ret, (address, address));
        if (blk == address(0) || !((blk == key.currency0 && paired == key.currency1) || (blk == key.currency1 && paired == key.currency0))) revert BadParams();
    }

    function postTask(PoolKey calldata key, TaskParams calldata p, Hold calldata h)
        external nonReentrant whenNotPaused returns (uint256 id)
    {
        (address blk, address paired) = _checkPost(key, p, h);
        uint256 budget = _escrow(p, h);
        id = _tasks.length;
        _tasks.push(Task(blk, paired, p.rewardToken, msg.sender, p.reward, p.maxDone, 0, p.perWallet, p.expiry, p.target, p.topic0, p.descHash));
        escrowLeft[id] = budget;
        holdOf[id] = h;
        _emitPosted(id, blk, p, poolIdOf(key));
        emit TaskHold(id, h.minBlock, h.minPaired, h.bonusMinBlock, h.bonusBps, h.window);
    }

    function _emitPosted(uint256 id, address blk, TaskParams calldata p, bytes32 poolId) private {
        emit TaskPosted(id, blk, msg.sender, p.rewardToken, p.reward, p.maxDone, p.expiry, poolId);
    }

    function _checkPost(PoolKey calldata key, TaskParams calldata p, Hold calldata h) private view returns (address blk, address paired) {
        if (key.hooks != HOOK) revert WrongHook();
        (paired, blk) = sidesOf(key);
        if (creatorOfPool(key) != msg.sender) revert NotCreator();
        /* review V3 MED: native ETH has no Transfer log, so no EXACT window minimum can be computed: never a holding condition */
        if (paired == address(0) && h.minPaired != 0) revert BadParams();
        if (p.rewardToken == address(0) || (p.rewardToken != blk && p.rewardToken != paired)) revert BadParams();
        if (h.minBlock == 0 || h.window < MIN_HOLD_WINDOW || h.window > MAX_HOLD_WINDOW || h.bonusBps > MAX_BONUS_BPS) revert BadParams();
        if ((h.bonusBps != 0) != (h.bonusMinBlock != 0) || (h.bonusMinBlock != 0 && h.bonusMinBlock < h.minBlock)) revert BadParams();
        if (
            p.reward < MIN_REWARD || p.maxDone == 0 || p.maxDone > MAX_COMPLETIONS || p.perWallet == 0 || p.expiry <= block.timestamp
                || p.expiry > block.timestamp + MAX_DURATION || p.target == address(0) || p.target == blk || p.target == p.rewardToken || p.topic0 == bytes32(0)
        ) revert BadParams();
    }

    function _escrow(TaskParams calldata p, Hold calldata h) private returns (uint256 budget) {
        budget = (p.reward + p.reward * h.bonusBps / 10_000) * p.maxDone;
        uint256 before = _balance(p.rewardToken, address(this));
        /* review V3 MED: no new money into a token that is already insolvent (it would be frozen with the rest) */
        if (before < owed[p.rewardToken]) revert Shortfall();
        _call(p.rewardToken, abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), budget));
        if (_balance(p.rewardToken, address(this)) - before != budget) revert FeeOnTransfer();
        owed[p.rewardToken] += budget;
    }

    /// @notice what the verifier measured and signed: the MINIMUM balances over [windowEnd - window, windowEnd] (exact, from the tokens'
    ///         own Transfer logs), the window's end, and the signature deadline.
    struct Held { uint256 heldBlock; uint256 heldPaired; uint64 windowEnd; uint256 deadline; }

    /// @notice review V3 MED: the window END is signed and must be recent (≤ MAX_DEADLINE ago): a minimum measured days ago no longer pays.
    function claim(uint256 id, bytes32 txHash, Held calldata m, bytes calldata proof) external nonReentrant whenNotPaused {
        if (block.timestamp > m.deadline) revert SignatureExpired();
        if (m.deadline > block.timestamp + MAX_DEADLINE) revert DeadlineTooFar();
        if (m.windowEnd > block.timestamp || block.timestamp - m.windowEnd > MAX_DEADLINE) revert StaleWindow();
        Task storage t = _tasks[id];
        Hold storage h = holdOf[id];
        _checks(id, t, txHash);
        if (_recover(claimDigest(id, msg.sender, txHash, m), proof) != verifier) revert BadProof();
        uint256 liveBlock = _balance(t.blockToken, msg.sender);
        if (m.heldBlock < h.minBlock || liveBlock < h.minBlock) revert NotHolder();
        if (h.minPaired != 0 && (m.heldPaired < h.minPaired || _balance(t.paired, msg.sender) < h.minPaired)) revert NotHolder();
        uint256 bonus;
        if (h.bonusMinBlock != 0 && m.heldBlock >= h.bonusMinBlock && liveBlock >= h.bonusMinBlock) bonus = t.reward * h.bonusBps / 10_000;
        _pay(id, t, txHash, bonus);
    }

    /// @notice anything above what is owed (donation, airdrop, the overshoot of a Shortfall cure) goes to the community reserve. Anyone.
    function sweep(address token) external nonReentrant {
        uint256 b = _balance(token, address(this));
        uint256 o = owed[token];
        if (b <= o) revert NothingToWithdraw();
        _call(token, abi.encodeWithSelector(0xa9059cbb, COMMUNITY_RESERVE, b - o));
    }

    function _checks(uint256 id, Task storage t, bytes32 txHash) private view {
        if (block.timestamp >= t.expiry) revert Expired();
        if (t.done >= t.maxDone) revert ReserveEmpty();
        if (msg.sender == t.creator || msg.sender == verifier || msg.sender == t.blockToken) revert SelfDealing();
        if (txUsed[txHash]) revert TxUsed();
        uint256 day = block.timestamp / 1 days;
        if (doneBy[id][msg.sender] >= t.perWallet || claimsOnDay[msg.sender][day] >= DAILY_CAP) revert CapReached();
        if (taskClaimsOnDay[id][day] >= TASK_DAILY_CAP || tokenClaimsOnDay[t.blockToken][day] >= TOKEN_DAILY_CAP) revert CapReached();
    }

    function _pay(uint256 id, Task storage t, bytes32 txHash, uint256 bonus) private {
        uint256 day = block.timestamp / 1 days;
        txUsed[txHash] = true;
        doneBy[id][msg.sender] += 1;
        claimsOnDay[msg.sender][day] += 1;
        taskClaimsOnDay[id][day] += 1;
        tokenClaimsOnDay[t.blockToken][day] += 1;
        t.done += 1;
        escrowLeft[id] -= t.reward + bonus;
        (uint256 paid, uint256 feeTb, uint256 toCreator) = split(t.reward + bonus);
        (uint256 toReserve, uint256 toDev) = splitTb(feeTb);
        address tok = t.rewardToken;
        _pushOrCredit(tok, msg.sender, paid);
        _pushOrCredit(tok, COMMUNITY_RESERVE, toReserve);
        _pushOrCredit(tok, t.creator, toCreator);
        if (tok == USDC) { _pushOrCredit(tok, DEV_WALLET, toDev); if (toDev != 0) emit DevPaid(tok, toDev); }
        else if (RAIL == address(0)) { _pushOrCredit(tok, COMMUNITY_RESERVE, toDev); toReserve += toDev; toDev = 0; } /* no rail: never units to the dev */
        else devOwed[tok] += toDev;
        emit TaskClaimed(id, msg.sender, txHash, paid, toReserve, toDev, toCreator);
    }

    /// @notice a REQUEST; a stale one (past its window) is renewed by calling again.
    function cancel(uint256 id) external nonReentrant {
        if (msg.sender != _tasks[id].creator) revert NotCreator();
        uint256 at = cancelRequestedAt[id];
        if (at == 0 || block.timestamp > _cancelBase(at) + CANCEL_DELAY + CANCEL_WINDOW) {
            cancelRequestedAt[id] = block.timestamp;
            emit CancelRequested(id, block.timestamp);
        }
    }

    function finalizeCancel(uint256 id) external nonReentrant whenNotPaused {
        Task storage t = _tasks[id];
        if (msg.sender != t.creator) revert NotCreator();
        uint256 at = cancelRequestedAt[id];
        if (at == 0) revert CancelPending();
        uint256 base = _cancelBase(at);
        if (block.timestamp < base + CANCEL_DELAY) revert CancelPending();
        if (block.timestamp > base + CANCEL_DELAY + CANCEL_WINDOW) revert CancelStale();
        _close(id, t, true);
    }

    /// @dev the cancel clock restarts at the last unpause: players get a full CANCEL_DELAY of open claims after any pause.
    function _cancelBase(uint256 at) private view returns (uint256) { return lastUnpausedAt > at ? lastUnpausedAt : at; }

    function refund(uint256 id) external nonReentrant {
        Task storage t = _tasks[id];
        if (block.timestamp < t.expiry) revert NotExpired();
        _close(id, t, false);
    }

    function withdraw(address token) external nonReentrant {
        uint256 a = pending[token][msg.sender];
        if (a == 0) revert NothingToWithdraw();
        pending[token][msg.sender] = 0;
        if (_balance(token, address(this)) < owed[token]) revert Shortfall();
        owed[token] -= a;
        _call(token, abi.encodeWithSelector(0xa9059cbb, msg.sender, a));
        emit Withdrawn(token, msg.sender, a);
    }

    /// @notice a dev share that the fixed rail cannot sell (no route for that token) is released to the COMMUNITY_RESERVE — never to the dev.
    function releaseDevShareToReserve(address token, uint256 amount) external onlyOwner nonReentrant {
        if (amount == 0 || amount > devOwed[token]) revert BadParams();
        devOwed[token] -= amount;
        _pushOrCredit(token, COMMUNITY_RESERVE, amount);
    }

    /// @notice the dev's 20 % of a non-USDC reward token, sold on the IMMUTABLE rail. Checked on BALANCES: this contract lost exactly
    ///         `amount`, the PoolManager gained it, the dev wallet gained >= minUsdcOut USDC and not one unit of `token`.
    function convertDevShare(address token, uint256 amount, uint256 minUsdcOut) external onlyOwner nonReentrant {
        address r = RAIL;
        if (r == address(0) || token == USDC || amount == 0 || amount > devOwed[token] || minUsdcOut == 0) revert BadParams();
        devOwed[token] -= amount;
        if (_balance(token, address(this)) < owed[token]) revert Shortfall();
        owed[token] -= amount;
        uint256 u0 = _balance(USDC, DEV_WALLET);
        uint256 d0 = _balance(token, DEV_WALLET);
        uint256 m0 = _balance(token, address(this));
        uint256 pm0 = _balance(token, POOL_MANAGER);
        _call(token, abi.encodeWithSelector(0x095ea7b3, r, amount));
        (bool ok,) = r.call(abi.encodeWithSignature("sellToUsdc(address,uint256,uint256,address)", token, amount, minUsdcOut, DEV_WALLET));
        if (!ok) revert TransferFailed();
        _call(token, abi.encodeWithSelector(0x095ea7b3, r, 0));
        if (_balance(token, DEV_WALLET) != d0) revert UnitsToDev();
        if (m0 - _balance(token, address(this)) != amount) revert TransferFailed();
        if (_balance(token, POOL_MANAGER) < pm0 + amount) revert NotSold();
        uint256 got = _balance(USDC, DEV_WALLET) - u0;
        if (got < minUsdcOut) revert SlippageUsdc();
        emit DevShareConverted(token, amount, got);
    }

    // ───────────────────────────── views
    function tasks(uint256 id) external view returns (Task memory) { return _tasks[id]; }
    function taskCount() external view returns (uint256) { return _tasks.length; }

    function split(uint256 reward) public pure returns (uint256 paid, uint256 feeTb, uint256 feeCreator) {
        uint256 fee = reward * FEE_BPS / 10_000;
        feeTb = fee * TB_SHARE_BPS / 10_000;
        feeCreator = fee - feeTb;
        paid = reward - fee;
    }

    function splitTb(uint256 feeTb) public pure returns (uint256 toReserve, uint256 toDev) {
        toDev = feeTb * (10_000 - RESERVE_SHARE_BPS) / 10_000;
        toReserve = feeTb - toDev;
    }

    function claimDigest(uint256 id, address completer, bytes32 txHash, Held calldata m) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), _claimStruct(id, completer, txHash, m)));
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("BlockMissions"), keccak256("3"), block.chainid, address(this)));
    }

    function _claimStruct(uint256 id, address completer, bytes32 txHash, Held calldata m) private view returns (bytes32) {
        return keccak256(abi.encode(CLAIM_TYPEHASH, id, completer, txHash, m.heldBlock, m.heldPaired, holdOf[id].window, m.windowEnd, m.deadline));
    }

    // ───────────────────────────── internals
    function _close(uint256 id, Task storage t, bool cancelled) private {
        uint256 left = escrowLeft[id];
        if (left == 0) revert NothingToRefund();
        escrowLeft[id] = 0;
        t.maxDone = t.done;
        if (t.expiry > block.timestamp) t.expiry = uint64(block.timestamp);
        _pushOrCredit(t.rewardToken, t.creator, left);
        emit TaskClosed(id, left, cancelled);
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && (ret.length < 32 || abi.decode(ret, (uint256)) != 1))) revert TransferFailed();
    }

    /// @dev review L2: insolvent in this token (balance < owed) -> revert, never an IOU the contract cannot pay and never task B's escrow
    ///      paying task A. Only a recipient that refuses the transfer is credited (the amount stays owed, withdraw() pays it later).
    function _pushOrCredit(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        if (_balance(token, address(this)) < owed[token]) revert Shortfall();
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length != 0 && (ret.length < 32 || abi.decode(ret, (uint256)) != 1))) pending[token][to] += amount;
        else owed[token] -= amount;
    }

    function _balance(address token, address who) private view returns (uint256) {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
        if (!ok || ret.length < 32) revert TransferFailed();
        return abi.decode(ret, (uint256));
    }
}
