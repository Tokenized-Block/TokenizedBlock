// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title RailSellToUsdcV4 — the "rail" of BlockMissionsV3: sells the dev's 20 % of a NON-USDC reward token to USDC on Uniswap v4.
/// @notice DRAFT 2026-10-17 (Grok, for Claude's review). NOT DEPLOYED. Matches V3's call exactly:
///         sellToUsdc(address token, uint256 amount, uint256 minUsdcOut, address to) — V3 approves `amount`, calls, then re-checks
///         on balances (missions lost exactly `amount`, dev gained >= minUsdcOut USDC and 0 units).
/// WHAT THE RAIL ENFORCES ITSELF (defence in depth, independent of V3's checks):
///   - caller == MISSIONS (immutable), recipient == DEV_WALLET (immutable): USDC goes to the dev wallet only.
///   - units go nowhere but the v4 PoolManager (the pool): the rail pulls exactly `amount`, sells exactly `amount` (exact-input,
///     input delta checked == -amount on every hop), and ends with 0 units / 0 USDC / 0 ETH of its own.
///   - MIN-OUT: out >= max(minUsdcOut, armed floor). DEADLINE: an OPERATOR (immutable) must ARM a token first with a floor and a
///     deadline <= now + MAX_ARM; the arm is consumed by one sale; a sale after the deadline reverts. So neither a stale nor a
///     1-wei-minOut call can sell (review M2).
///   - ROUTES are fixed in the constructor (no setter): token -> 1..2 v4 hops ending in USDC. A new route = a new rail = a new V3:
///     since 326299c V3.RAIL is IMMUTABLE (8th constructor arg, no proposeRail/acceptRail).
/// DEPLOYMENT (326299c, circular immutables): MISSIONS here and RAIL in V3 point at each other. Deploy THIS rail first with
///   missions = the CREATE address V3 will get (deployer D, nonce n+1 if the rail is deployed by D at nonce n), then deploy V3 from D
///   with rail = this contract, then CHECK V3.RAIL() == rail && rail.MISSIONS() == V3. A wrong prediction fails CLOSED (every sale
///   reverts NotMissions; the owner can only releaseDevShareToReserve) - redeploy both.
/// FEES: no extra skim here. Repo rule D17 (DESIGN-BLOCKMISSIONS §review C2 HIGH2): ONE fee point per flow — the hops go through
///   the block's own pool (hook 7030), whose swap fee (dev + creator share) is the TB rail fee, paid inside the swap.
contract RailSellToUsdcV4 {
    struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }
    struct SwapParams { bool zeroForOne; int256 amountSpecified; uint160 sqrtPriceLimitX96; }
    struct Hop { PoolKey key; bool zeroForOne; }
    struct Arm { uint256 floor; uint64 deadline; }

    uint160 internal constant MIN_SQRT_PRICE_P1 = 4295128739 + 1;
    uint160 internal constant MAX_SQRT_PRICE_M1 = 1461446703485210103287273052203988822378723970342 - 1;
    uint256 public constant MAX_ARM = 1 hours;

    address public immutable POOL_MANAGER;
    address public immutable USDC;
    address public immutable DEV_WALLET;
    address public immutable MISSIONS;
    address public immutable OPERATOR;

    mapping(address => Hop[]) internal _route;
    mapping(address => Arm) public armed;
    uint256 private _lock = 1;

    event Armed(address indexed token, uint256 floor, uint64 deadline);
    event Sold(address indexed token, uint256 amount, uint256 usdcOut);

    error NotMissions(); error NotOperator(); error NotPoolManager(); error BadRoute(); error BadParams(); error NotArmed();
    error DeadlinePassed(); error MinOut(); error Leak(); error TransferFailed(); error Reentrancy(); error PartialFill();

    struct Config { address poolManager; address usdc; address devWallet; address missions; address operator; }

    /// @param tokens token i uses hopCount[i] consecutive entries of `hops` (1 or 2), the last hop ending in USDC.
    constructor(Config memory c, address[] memory tokens, uint8[] memory hopCount, Hop[] memory hops) {
        if (c.poolManager == address(0) || c.usdc == address(0) || c.devWallet == address(0) || c.missions == address(0) || c.operator == address(0)) revert BadParams();
        if (tokens.length != hopCount.length) revert BadRoute();
        POOL_MANAGER = c.poolManager; USDC = c.usdc; DEV_WALLET = c.devWallet; MISSIONS = c.missions; OPERATOR = c.operator;
        uint256 at;
        for (uint256 i; i < tokens.length; ++i) at = _addRoute(tokens[i], hopCount[i], hops, at, c.usdc);
        if (at != hops.length) revert BadRoute();
    }

    function _addRoute(address token, uint8 n, Hop[] memory hops, uint256 at, address usdc) private returns (uint256) {
        if (token == address(0) || token == usdc || n == 0 || n > 2 || at + n > hops.length || _route[token].length != 0) revert BadRoute();
        address cur = token;
        for (uint256 j; j < n; ++j) {
            Hop memory h = hops[at + j];
            (address tin, address tout) = h.zeroForOne ? (h.key.currency0, h.key.currency1) : (h.key.currency1, h.key.currency0);
            if (tin != cur) revert BadRoute();
            cur = tout;
            _route[token].push(h);
        }
        if (cur != usdc) revert BadRoute();
        return at + n;
    }

    function routeOf(address token) external view returns (Hop[] memory) { return _route[token]; }

    /// @notice the operator (the missions owner) arms ONE sale of `token`: min USDC floor + deadline (<= 1 h ahead).
    function arm(address token, uint256 floor, uint64 deadline) external {
        if (msg.sender != OPERATOR) revert NotOperator();
        if (_route[token].length == 0 || floor == 0 || deadline < block.timestamp || deadline > block.timestamp + MAX_ARM) revert BadParams();
        armed[token] = Arm(floor, deadline);
        emit Armed(token, floor, deadline);
    }

    function sellToUsdc(address token, uint256 amount, uint256 minUsdcOut, address to) external returns (uint256 out) {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        uint256 floor = _consumeArm(token, amount, minUsdcOut, to);
        uint256 t0 = _bal(token, address(this));
        uint256 u0 = _bal(USDC, DEV_WALLET);
        uint256 e0 = address(this).balance;
        _call(token, abi.encodeWithSelector(0x23b872dd, msg.sender, address(this), amount));
        if (_bal(token, address(this)) - t0 != amount) revert TransferFailed();
        out = _unlock(token, amount);
        if (out < floor) revert MinOut();
        if (_bal(token, address(this)) != t0 || address(this).balance != e0 || _bal(USDC, address(this)) != 0) revert Leak();
        if (_bal(USDC, DEV_WALLET) - u0 != out) revert Leak();
        emit Sold(token, amount, out);
        _lock = 1;
    }

    function _consumeArm(address token, uint256 amount, uint256 minUsdcOut, address to) private returns (uint256 floor) {
        if (msg.sender != MISSIONS) revert NotMissions();
        if (to != DEV_WALLET || amount == 0 || minUsdcOut == 0 || _route[token].length == 0) revert BadParams();
        Arm memory a = armed[token];
        if (a.deadline == 0) revert NotArmed();
        if (block.timestamp > a.deadline) revert DeadlinePassed();
        delete armed[token];
        floor = minUsdcOut > a.floor ? minUsdcOut : a.floor;
    }

    function _unlock(address token, uint256 amount) private returns (uint256) {
        (bool ok, bytes memory ret) = POOL_MANAGER.call(abi.encodeWithSignature("unlock(bytes)", abi.encode(token, amount)));
        if (!ok) _bubble(ret);
        return abi.decode(abi.decode(ret, (bytes)), (uint256));
    }

    /// @dev v4 flash accounting: exact-input hops; the intermediate currency nets to 0 inside the PoolManager.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != POOL_MANAGER) revert NotPoolManager();
        (address token, uint256 amount) = abi.decode(data, (address, uint256));
        Hop[] storage hops = _route[token];
        uint256 amountIn = amount;
        for (uint256 j; j < hops.length; ++j) {
            Hop memory h = hops[j];
            int256 d = _swap(h, amountIn);
            int128 d0 = int128(d >> 128);
            int128 d1 = int128(d);
            (int128 dIn, int128 dOut) = h.zeroForOne ? (d0, d1) : (d1, d0);
            if (dIn != -int128(int256(amountIn)) || dOut <= 0) revert PartialFill();
            amountIn = uint256(int256(dOut));
        }
        // pay the units in (only place units ever go), take USDC straight to the dev wallet
        _pm(abi.encodeWithSignature("sync(address)", token));
        _call(token, abi.encodeWithSelector(0xa9059cbb, POOL_MANAGER, amount));
        _pm(abi.encodeWithSignature("settle()"));
        _pm(abi.encodeWithSignature("take(address,address,uint256)", USDC, DEV_WALLET, amountIn));
        return abi.encode(amountIn);
    }

    function _swap(Hop memory h, uint256 amountIn) private returns (int256 d) {
        SwapParams memory p = SwapParams(h.zeroForOne, -int256(amountIn), h.zeroForOne ? MIN_SQRT_PRICE_P1 : MAX_SQRT_PRICE_M1);
        bytes memory ret = _pm(abi.encodeWithSelector(0xf3cd914c, h.key, p, bytes("")));
        d = abi.decode(ret, (int256));
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
}
