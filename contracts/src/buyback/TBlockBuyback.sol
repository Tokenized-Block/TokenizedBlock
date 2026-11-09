// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TBlockBuyback — ownerless TBLOCK buyback-and-burn for the TokenizedBlock app on Base.
/// @notice DRAFT 2026-11-09 (rev 4, after reviews SEC-001..006, NEW-1..4, L-1/L-2/T-1). NOT DEPLOYED, NOT AUDITED.
///
/// WHAT IT DOES
///   - Anyone may send ETH (receive()). Stray WETH sent here is unwrapped and spent like ETH.
///   - buyback(amount) spends `amount` ETH (MIN_SPEND <= amount <= min(balance, MAX_PER_CALL)), at most once per COOLDOWN:
///       ETH -> WETH -> wtCOIN on ONE fixed Uniswap v3 pool (direct pool swap + callback),
///       wtCOIN -> TBLOCK on ONE fixed Uniswap v4 pool (unlock + flash accounting, exact input),
///     and the PoolManager pays every TBLOCK bought straight to 0x...dEaD. Stray TBLOCK held here is burned in the same call.
///   - WHO may call (SEC-001, NEW-1): the immutable KEEPER as soon as the pot is ready (it ignores `armed`); ANYONE ELSE
///     only while the pot is ARMED and has been ready for PUBLIC_DELAY without the keeper calling (so the ETH never depends
///     on the keeper being alive). KEEPER == address(0) means "public only, no delay" (still requires `armed`).
///     "Pot ready" = max(lastBuyAt + COOLDOWN, fundedAt).
///     ARMING: receive() (a normal ETH send) and arm() set armed = true and fundedAt = now the first time the balance is
///     >= MIN_SPEND while disarmed. buyback() disarms when it leaves the balance < MIN_SPEND. Force-sent ETH (selfdestruct,
///     coinbase) and WETH sent as a token never run receive(), so on their own they cannot start the public clock; arm()
///     (anyone, any time) unwraps stray WETH and arms if the balance is then >= MIN_SPEND. That is what guarantees the
///     public path can always be opened, whatever form the funding took. The keeper path never needs arming.
///   - Public callers get a small tip (TIP_BPS of `amount`, capped by MAX_TIP) so the fallback actually gets called.
///     The keeper gets NO tip: no ETH ever flows back to the owner's side.
///
/// WHAT NOBODY CAN DO (there is no code path for it)
///   - No owner, no admin, no setter, no withdraw, no rescue, no upgrade, no selfdestruct, no delegatecall.
///
/// PRICE PROTECTION (exactly what is implemented — no more)
///   1. Size: amount <= MAX_PER_CALL, once per COOLDOWN: the hard bound on what any one call can lose.
///   2. Caller (SEC-001): before PUBLIC_DELAY only KEEPER (a plain key, no code that runs around the call) can trigger a buy,
///      so an attacker cannot wrap OUR buy inside HIS transaction (atomic sandwich) while the keeper is alive. He can still
///      try to order his own transactions around the keeper's (Base has no public mempool; this needs sequencer ordering
///      luck or a private feed). After PUBLIC_DELAY anyone can call, atomic sandwiches included: bounded by (1).
///   3. v3 leg (ETH->wtCOIN): spot tick after our swap must be within MAX_V3_DEV_TICKS of the pool's TWAP (TWAP_WINDOW s).
///   4. v4 leg (wtCOIN->TBLOCK): no oracle exists. Two in-call checks, both relative to the pool state AT our call:
///      (a) own impact: tickBefore - tickAfter <= MAX_V4_IMPACT_TICKS;
///      (b) output floor (SEC-002, NEW-3/4): out >= wtIn * P(sqrtPriceBefore) * (1e6 - BUDGET) / 1e6, with
///          BUDGET = lpFee + protocolFee (our direction's 12-bit half, read from the same slot in the same call)
///                   + MAX_HOOK_PPM + 100 * MAX_V4_IMPACT_TICKS   (ppm; 1 tick moves the price by less than 100 ppm).
///          The floor allows that COMBINED budget: any mix of LP fee, protocol fee, hook cut and own impact whose total
///          stays within BUDGET passes. It is not a separate cap on the hook: a hook cut above MAX_HOOK_PPM passes if our
///          impact used less than its share. It is relative to the price at our call, so it does NOT catch a price
///          pushed before our swap — that is what (2) is for.
///   Every guard fails CLOSED: a failed check reverts the whole call (cooldown not consumed, ETH not spent).
///
/// KNOWN LIMITS
///   - Tokens other than ETH / WETH / TBLOCK sent here (USDC, wtCOIN, ...) stay stuck forever (spending an unbounded stray
///     balance would let anyone push the v4 leg past its bounds and brick buyback()).
///   - FUNDERS (L-2): send ETH with a normal call (any wallet does), NOT Solidity transfer()/send(): receive() writes storage
///     when it arms, so a 2300-gas transfer that would arm reverts. Funds that arrived another way (WETH, force-sent ETH,
///     or a 2300-gas path that skipped arming) are armed by calling arm() — the keeper should call it after such funding.
///     While already armed, 2300-gas transfers work (no write).
///   - Anyone may ARM (normal send or arm()) once the balance is >= MIN_SPEND. That starts the public clock at that
///     moment; it cannot back-date it. A live keeper that buys within PUBLIC_DELAY of any arming keeps the public path
///     closed (after each buy, the public time is lastBuyAt + COOLDOWN + PUBLIC_DELAY).
///   - If the v3 pool's observations cannot cover TWAP_WINDOW, or the market really moves faster than the guards, buyback()
///     reverts until it can (liveness, not safety); amount can always be lowered to MIN_SPEND (SEC-003).
///   - If either pool dies, the ETH stays here forever: there is no rescue by design.
contract TBlockBuyback {
    struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
    struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }

    struct Config {
        address poolManager;      // Uniswap v4 PoolManager
        PoolKey v4Key;            // wtCOIN / TBLOCK pool (static fee)
        address v3Pool;           // WETH / wtCOIN Uniswap v3 pool
        address weth;
        address wtcoin;
        address tblock;
        address keeper;           // address(0) = public only
        uint256 publicDelay;      // seconds the pot must stay ready before non-keepers may call (ignored if keeper == 0)
        uint256 maxPerCall;       // wei of ETH per call (tip included)
        uint256 minSpend;         // smallest amount per call
        uint256 cooldown;         // seconds between two successful calls
        uint32 twapWindow;        // seconds
        int24 maxV3DevTicks;      // v3 spot-after vs TWAP, 1 tick = ~1 bp
        int24 maxV4ImpactTicks;   // v4 own price impact
        uint24 maxHookPpm;        // max cut the v4 hook may take on our output, ppm
        uint16 tipBps;            // public-caller tip, <= 100 (1 %)
        uint256 maxTip;           // wei cap on the tip
    }

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint160 internal constant MIN_SQRT_PRICE_P1 = 4295128739 + 1;
    uint160 internal constant MAX_SQRT_PRICE_M1 = 1461446703485210103287273052203988822378723970342 - 1;
    uint256 internal constant V4_POOLS_SLOT = 6; // PoolManager.pools mapping slot (verified on Base: lpFee 3000 read there)
    uint24 internal constant DYNAMIC_FEE_FLAG = 0x800000;
    uint256 internal constant Q96 = 2 ** 96;
    uint256 internal constant MAX_PROTOCOL_FEE = 1000; // v4 ProtocolFeeLibrary.MAX_PROTOCOL_FEE (pips), per direction
    uint256 public constant MAX_COOLDOWN = 7 days;
    uint256 public constant MAX_PUBLIC_DELAY = 7 days;
    uint32 public constant MAX_TWAP_WINDOW = 1 hours;

    address public immutable POOL_MANAGER;
    address public immutable V3_POOL;
    address public immutable WETH;
    address public immutable WTCOIN;
    address public immutable TBLOCK;
    address public immutable KEEPER;
    uint256 public immutable PUBLIC_DELAY;
    bool public immutable V3_ZERO_FOR_ONE; // WETH is token0
    bool public immutable V4_ZERO_FOR_ONE; // wtCOIN is currency0
    bytes32 public immutable V4_POOL_ID;
    bytes32 internal immutable V4_STATE_SLOT;
    uint256 public immutable MAX_PER_CALL;
    uint256 public immutable MIN_SPEND;
    uint256 public immutable COOLDOWN;
    uint32 public immutable TWAP_WINDOW;
    int24 public immutable MAX_V3_DEV_TICKS;
    int24 public immutable MAX_V4_IMPACT_TICKS;
    uint24 public immutable MAX_HOOK_PPM;
    uint256 public immutable V4_FLOOR_PPM; // 1e6 - lpFee - MAX_HOOK_PPM - 100 * MAX_V4_IMPACT_TICKS (protocol fee: at call)
    uint16 public immutable TIP_BPS;
    uint256 public immutable MAX_TIP;
    uint24 internal immutable V4_FEE;
    int24 internal immutable V4_TICK_SPACING;
    address internal immutable V4_HOOKS;

    uint256 public lastBuyAt;
    uint256 public fundedAt;
    bool public armed;
    uint256 private _lock = 1;
    uint256 private _v3Due; // WETH owed to the v3 pool by the swap in flight (0 outside it)

    event Bought(uint256 ethIn, uint256 wtcoinMid, uint256 tblockToDead, address indexed caller);
    event Tipped(address indexed caller, uint256 amount);
    event Swept(uint256 amount);
    event Armed(uint256 fundedAt);

    error Reentrancy(); error BadParams(); error BadPool(); error TooEarly(uint256 at); error BadAmount(); error NotArmed();
    error PriceOffTwap(int24 twapTick, int24 tickAfter); error ImpactTooHigh(int24 tickBefore, int24 tickAfter);
    error OutputTooLow(uint256 out, uint256 floor);
    error PartialFill(); error NotPool(); error NotPoolManager(); error Leak(); error TransferFailed();

    modifier locked() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(Config memory c) {
        if (c.poolManager == address(0) || c.v3Pool == address(0) || c.weth == address(0) || c.wtcoin == address(0) || c.tblock == address(0)) revert BadParams();
        if (c.maxPerCall == 0 || c.minSpend == 0 || c.minSpend > c.maxPerCall) revert BadParams();
        if (c.cooldown == 0 || c.cooldown > MAX_COOLDOWN || c.twapWindow < 60 || c.twapWindow > MAX_TWAP_WINDOW) revert BadParams();
        if (c.publicDelay > MAX_PUBLIC_DELAY) revert BadParams();
        if (c.maxV3DevTicks <= 0 || c.maxV4ImpactTicks <= 0 || c.tipBps > 100 || (c.tipBps != 0 && c.maxTip == 0)) revert BadParams();
        if (c.keeper != address(0) && c.publicDelay == 0) revert BadParams();
        PoolKey memory k = c.v4Key;
        if (k.fee & DYNAMIC_FEE_FLAG != 0) revert BadPool(); // the floor needs a static LP fee
        uint256 slack = uint256(k.fee) + c.maxHookPpm + 100 * uint256(uint24(c.maxV4ImpactTicks));
        if (slack + MAX_PROTOCOL_FEE >= 1e6) revert BadParams();

        address t0 = _addr(c.v3Pool, abi.encodeWithSignature("token0()"));
        address t1 = _addr(c.v3Pool, abi.encodeWithSignature("token1()"));
        if (!((t0 == c.weth && t1 == c.wtcoin) || (t0 == c.wtcoin && t1 == c.weth))) revert BadPool();
        if (!((k.currency0 == c.wtcoin && k.currency1 == c.tblock) || (k.currency0 == c.tblock && k.currency1 == c.wtcoin))) revert BadPool();
        bytes32 id = keccak256(abi.encode(k));
        bytes32 slot = keccak256(abi.encode(id, V4_POOLS_SLOT));

        POOL_MANAGER = c.poolManager; V3_POOL = c.v3Pool; WETH = c.weth; WTCOIN = c.wtcoin; TBLOCK = c.tblock;
        KEEPER = c.keeper; PUBLIC_DELAY = c.keeper == address(0) ? 0 : c.publicDelay;
        V3_ZERO_FOR_ONE = t0 == c.weth;
        V4_ZERO_FOR_ONE = k.currency0 == c.wtcoin;
        V4_POOL_ID = id; V4_STATE_SLOT = slot;
        V4_FEE = k.fee; V4_TICK_SPACING = k.tickSpacing; V4_HOOKS = k.hooks;
        MAX_PER_CALL = c.maxPerCall; MIN_SPEND = c.minSpend; COOLDOWN = c.cooldown; TWAP_WINDOW = c.twapWindow;
        MAX_V3_DEV_TICKS = c.maxV3DevTicks; MAX_V4_IMPACT_TICKS = c.maxV4ImpactTicks; MAX_HOOK_PPM = c.maxHookPpm;
        V4_FLOOR_PPM = 1e6 - slack;
        TIP_BPS = c.tipBps; MAX_TIP = c.maxTip;
        fundedAt = block.timestamp;

        if (_extsload(c.poolManager, slot) == 0) revert BadPool(); // not initialized (or wrong PoolManager)
    }

    /// @notice ETH in. Arms the public path (NEW-1) the first time the balance is >= MIN_SPEND while disarmed.
    ///         WETH unwraps (2300 gas, during buyback) skip the write.
    receive() external payable {
        if (msg.sender != WETH) _tryArm();
    }

    /// @notice L-1: anyone may arm the public path for funds that did not come through receive() (WETH, force-sent ETH).
    ///         Unwraps any stray WETH held here (ETH stays here), then arms iff disarmed and balance >= MIN_SPEND.
    ///         Moves no ETH out. Can only set fundedAt to NOW, and only when disarmed: it cannot move fundedAt backwards,
    ///         cannot re-start the clock of an armed pot, and does not touch the keeper path.
    function arm() external locked returns (bool) {
        uint256 strayWeth = _bal(WETH, address(this));
        if (strayWeth != 0) _call(WETH, abi.encodeWithSignature("withdraw(uint256)", strayWeth));
        _tryArm();
        return armed;
    }

    function _tryArm() private {
        if (!armed && address(this).balance >= MIN_SPEND) {
            armed = true;
            fundedAt = block.timestamp;
            emit Armed(block.timestamp);
        }
    }

    /// @notice when the keeper may call, and when anyone may call (type(uint256).max while disarmed).
    function readyAt() public view returns (uint256 keeperAt, uint256 publicAt) {
        uint256 cd = lastBuyAt == 0 ? 0 : lastBuyAt + COOLDOWN;
        keeperAt = cd > fundedAt ? cd : fundedAt;
        publicAt = armed ? keeperAt + PUBLIC_DELAY : type(uint256).max;
        if (KEEPER == address(0)) keeperAt = publicAt;
    }

    /// @notice Spend `amount` ETH on TBLOCK and send it all to 0x...dEaD.
    /// @return tblockToDead increase of 0x...dEaD's TBLOCK balance during this call (our swap output + stray TBLOCK + any
    ///         TBLOCK the pool hook itself sends to 0x...dEaD on this swap)
    /// @return tblockFromSwap TBLOCK paid to 0x...dEaD by the PoolManager for our swap
    function buyback(uint256 amount) external locked returns (uint256 tblockToDead, uint256 tblockFromSwap) {
        (uint256 spend, uint256 tip) = _admit(amount); // checks + effects
        (tblockToDead, tblockFromSwap) = _execute(spend); // interactions + balance re-checks
        // a caller that rejects ETH simply forfeits the tip (it stays here for later buybacks): never blocks the buyback
        if (tip != 0) {
            (bool ok,) = msg.sender.call{value: tip}("");
            if (ok) emit Tipped(msg.sender, tip);
        }
        if (address(this).balance < MIN_SPEND) armed = false; // NEW-1: the next normal deposit re-arms and restarts the clock
    }

    function _admit(uint256 amount) private returns (uint256 spend, uint256 tip) {
        (uint256 keeperAt, uint256 publicAt) = readyAt();
        bool isKeeper = msg.sender == KEEPER && KEEPER != address(0);
        if (!isKeeper && !armed) revert NotArmed();
        uint256 at = isKeeper ? keeperAt : publicAt;
        if (block.timestamp < at) revert TooEarly(at);
        uint256 strayWeth = _bal(WETH, address(this));
        if (strayWeth != 0) _call(WETH, abi.encodeWithSignature("withdraw(uint256)", strayWeth)); // stray WETH -> ETH (fixed WETH9)
        if (amount < MIN_SPEND || amount > MAX_PER_CALL || amount > address(this).balance) revert BadAmount();
        if (!isKeeper) {
            tip = amount * TIP_BPS / 10_000;
            if (tip > MAX_TIP) tip = MAX_TIP;
        }
        spend = amount - tip;
        lastBuyAt = block.timestamp;
    }

    /// @dev all calls go to immutable, pre-verified contracts.
    function _execute(uint256 spend) private returns (uint256 tblockToDead, uint256 tblockFromSwap) {
        uint256 ethBefore = address(this).balance;
        uint256 wtBefore = _bal(WTCOIN, address(this));
        uint256 deadBefore = _bal(TBLOCK, DEAD);
        uint256 wtMid = _swapV3(spend);
        if (_bal(WTCOIN, address(this)) < wtBefore + wtMid) revert Leak();
        tblockFromSwap = _swapV4(wtMid);
        uint256 stray = _bal(TBLOCK, address(this));
        if (stray != 0) _call(TBLOCK, abi.encodeWithSelector(0xa9059cbb, DEAD, stray));

        // ---- re-checks on balances (SEC-004: ">=" for wtCOIN / ETH / WETH, a rebate stays here instead of bricking)
        if (_bal(TBLOCK, address(this)) != 0) revert Leak();
        if (_bal(WTCOIN, address(this)) < wtBefore) revert Leak();
        if (address(this).balance < ethBefore - spend) revert Leak();
        tblockToDead = _bal(TBLOCK, DEAD) - deadBefore;
        if (tblockToDead < tblockFromSwap + stray) revert Leak();
        emit Bought(spend, wtMid, tblockToDead, msg.sender);
    }

    /// @notice Send every TBLOCK this contract holds to 0x...dEaD. Callable by anyone. The only token that can leave.
    function sweepToDead() external locked returns (uint256 amount) {
        amount = _bal(TBLOCK, address(this));
        if (amount != 0) {
            _call(TBLOCK, abi.encodeWithSelector(0xa9059cbb, DEAD, amount));
            emit Swept(amount);
        }
    }

    // ------------------------------------------------------------------ v3 leg

    function _swapV3(uint256 spend) private returns (uint256 out) {
        int24 twap = _twapTick();
        _v3Due = spend;
        (bool ok, bytes memory ret) = V3_POOL.call(abi.encodeWithSignature(
            "swap(address,bool,int256,uint160,bytes)",
            address(this), V3_ZERO_FOR_ONE, int256(spend), V3_ZERO_FOR_ONE ? MIN_SQRT_PRICE_P1 : MAX_SQRT_PRICE_M1, bytes("")
        ));
        if (!ok) _bubble(ret);
        if (_v3Due != 0) revert PartialFill(); // callback did not run / did not pay in full
        (int256 a0, int256 a1) = abi.decode(ret, (int256, int256));
        (int256 aIn, int256 aOut) = V3_ZERO_FOR_ONE ? (a0, a1) : (a1, a0);
        if (aIn != int256(spend) || aOut >= 0) revert PartialFill();
        int24 tickAfter = _v3Tick();
        // WETH->wtCOIN: zeroForOne lowers the tick (worse for us), oneForZero raises it
        if (V3_ZERO_FOR_ONE ? tickAfter < twap - MAX_V3_DEV_TICKS : tickAfter > twap + MAX_V3_DEV_TICKS) revert PriceOffTwap(twap, tickAfter);
        out = uint256(-aOut);
    }

    /// @dev paid exactly once, by the fixed pool, during our own swap, for exactly what we asked to spend.
    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata) external {
        if (msg.sender != V3_POOL || _lock != 2) revert NotPool();
        int256 owed = V3_ZERO_FOR_ONE ? amount0Delta : amount1Delta;
        uint256 due = _v3Due;
        if (owed <= 0 || uint256(owed) != due) revert PartialFill();
        _v3Due = 0;
        (bool ok, bytes memory ret) = WETH.call{value: due}(abi.encodeWithSignature("deposit()"));
        if (!ok) _bubble(ret);
        _call(WETH, abi.encodeWithSelector(0xa9059cbb, V3_POOL, due));
    }

    function _twapTick() private view returns (int24 t) {
        uint32[] memory ago = new uint32[](2);
        ago[0] = TWAP_WINDOW;
        (bool ok, bytes memory ret) = V3_POOL.staticcall(abi.encodeWithSignature("observe(uint32[])", ago));
        if (!ok) _bubble(ret);
        (int56[] memory cum,) = abi.decode(ret, (int56[], uint160[]));
        int56 d = cum[1] - cum[0];
        int56 w = int56(uint56(TWAP_WINDOW));
        t = int24(d / w);
        if (d < 0 && d % w != 0) t--; // round toward -infinity (as OracleLibrary)
    }

    function _v3Tick() private view returns (int24 tick) {
        (bool ok, bytes memory ret) = V3_POOL.staticcall(abi.encodeWithSignature("slot0()"));
        if (!ok || ret.length < 64) revert BadPool();
        (, tick) = abi.decode(ret, (uint160, int24));
    }

    // ------------------------------------------------------------------ v4 leg

    function _swapV4(uint256 wtIn) private returns (uint256) {
        (bool ok, bytes memory ret) = POOL_MANAGER.call(abi.encodeWithSignature("unlock(bytes)", abi.encode(wtIn)));
        if (!ok) _bubble(ret);
        return abi.decode(abi.decode(ret, (bytes)), (uint256));
    }

    /// @dev exact-input wtCOIN -> TBLOCK; pay wtCOIN in, take TBLOCK straight to 0x...dEaD. Deltas net to zero.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != POOL_MANAGER || _lock != 2) revert NotPoolManager();
        uint256 wtIn = abi.decode(data, (uint256));
        uint256 out = _v4SwapChecked(wtIn);
        _pm(abi.encodeWithSignature("sync(address)", WTCOIN));
        _call(WTCOIN, abi.encodeWithSelector(0xa9059cbb, POOL_MANAGER, wtIn));
        _pm(abi.encodeWithSignature("settle()"));
        _pm(abi.encodeWithSignature("take(address,address,uint256)", TBLOCK, DEAD, out));
        return abi.encode(out);
    }

    /// @dev the swap itself + impact bound + output floor, all read inside the same unlock.
    function _v4SwapChecked(uint256 wtIn) private returns (uint256 out) {
        (uint160 sqrtBefore, int24 tickBefore, uint256 protocolFee) = _v4Slot0();
        uint256 floor = v4Floor(wtIn, sqrtBefore, protocolFee);

        SwapParams memory p = SwapParams(V4_ZERO_FOR_ONE, -int256(wtIn), V4_ZERO_FOR_ONE ? MIN_SQRT_PRICE_P1 : MAX_SQRT_PRICE_M1);
        int256 d = abi.decode(_pm(abi.encodeWithSelector(0xf3cd914c, _v4Key(), p, bytes(""))), (int256));
        int128 d0 = int128(d >> 128);
        int128 d1 = int128(d);
        (int128 dIn, int128 dOut) = V4_ZERO_FOR_ONE ? (d0, d1) : (d1, d0);
        if (dIn != -int128(int256(wtIn)) || dOut <= 0) revert PartialFill();
        (, int24 tickAfter,) = _v4Slot0();
        int256 moved = V4_ZERO_FOR_ONE ? int256(tickBefore) - int256(tickAfter) : int256(tickAfter) - int256(tickBefore);
        if (moved > MAX_V4_IMPACT_TICKS) revert ImpactTooHigh(tickBefore, tickAfter);
        out = uint256(int256(dOut));
        if (out < floor) revert OutputTooLow(out, floor);
    }

    /// @notice floor: wtIn * P(sqrtPriceX96) * (V4_FLOOR_PPM - protocolFee) / 1e6, P = TBLOCK per wtCOIN at that price.
    ///         protocolFee = our direction's 12-bit half of slot0.protocolFee (<= 1000 pips by v4 rules).
    function v4Floor(uint256 wtIn, uint160 sqrtP, uint256 protocolFee) public view returns (uint256) {
        uint256 atMid = V4_ZERO_FOR_ONE
            ? mulDiv(mulDiv(wtIn, sqrtP, Q96), sqrtP, Q96)
            : mulDiv(mulDiv(wtIn, Q96, sqrtP), Q96, sqrtP);
        if (protocolFee > MAX_PROTOCOL_FEE) revert BadPool();
        return mulDiv(atMid, V4_FLOOR_PPM - protocolFee, 1e6);
    }

    function _v4Key() private view returns (PoolKey memory) {
        (address c0, address c1) = V4_ZERO_FOR_ONE ? (WTCOIN, TBLOCK) : (TBLOCK, WTCOIN);
        return PoolKey(c0, c1, V4_FEE, V4_TICK_SPACING, V4_HOOKS);
    }

    /// @dev Pool.Slot0 packing: sqrtPriceX96 (160) | tick (24) | protocolFee (24: low 12 = zeroForOne, high 12 = oneForZero)
    ///      | lpFee (24).
    function _v4Slot0() private view returns (uint160 sqrtP, int24 tick, uint256 protocolFee) {
        uint256 v = uint256(_extsload(POOL_MANAGER, V4_STATE_SLOT));
        sqrtP = uint160(v);
        tick = int24(uint24(v >> 160));
        uint256 pf = (v >> 184) & 0xffffff;
        protocolFee = V4_ZERO_FOR_ONE ? pf & 0xfff : pf >> 12;
    }

    // ------------------------------------------------------------------ math

    /// @notice floor(a * b / d) with a 512-bit intermediate (FullMath, Remco Bloemen's algorithm). Reverts if d == 0 or
    ///         the result overflows 256 bits.
    function mulDiv(uint256 a, uint256 b, uint256 d) public pure returns (uint256 result) {
        unchecked {
            uint256 prod0;
            uint256 prod1;
            assembly {
                let mm := mulmod(a, b, not(0))
                prod0 := mul(a, b)
                prod1 := sub(sub(mm, prod0), lt(mm, prod0))
            }
            if (prod1 == 0) {
                if (d == 0) revert BadParams();
                return prod0 / d;
            }
            if (d <= prod1) revert BadParams();
            uint256 remainder;
            assembly {
                remainder := mulmod(a, b, d)
                prod1 := sub(prod1, gt(remainder, prod0))
                prod0 := sub(prod0, remainder)
            }
            uint256 twos = d & (~d + 1);
            assembly {
                d := div(d, twos)
                prod0 := div(prod0, twos)
                twos := add(div(sub(0, twos), twos), 1)
            }
            prod0 |= prod1 * twos;
            uint256 inv = (3 * d) ^ 2;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            inv *= 2 - d * inv;
            result = prod0 * inv;
        }
    }

    // ------------------------------------------------------------------ low level

    function _extsload(address pm, bytes32 slot) private view returns (bytes32 v) {
        (bool ok, bytes memory ret) = pm.staticcall(abi.encodeWithSignature("extsload(bytes32)", slot));
        if (!ok || ret.length < 32) revert BadPool();
        v = abi.decode(ret, (bytes32));
    }

    function _pm(bytes memory data) private returns (bytes memory ret) {
        bool ok;
        (ok, ret) = POOL_MANAGER.call(data);
        if (!ok) _bubble(ret);
    }

    function _bubble(bytes memory ret) private pure { assembly { revert(add(ret, 32), mload(ret)) } }

    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && (ret.length < 32 || abi.decode(ret, (uint256)) != 1))) revert TransferFailed();
    }

    function _bal(address token, address who) private view returns (uint256) {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
        if (!ok || ret.length < 32) revert TransferFailed();
        return abi.decode(ret, (uint256));
    }

    function _addr(address target, bytes memory data) private view returns (address) {
        (bool ok, bytes memory ret) = target.staticcall(data);
        if (!ok || ret.length < 32) revert BadPool();
        return abi.decode(ret, (address));
    }
}
