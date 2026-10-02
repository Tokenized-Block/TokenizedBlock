// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, console2} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {FullMath} from "v4-core/libraries/FullMath.sol";
import {CustomRevert} from "v4-core/libraries/CustomRevert.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {PoolModifyLiquidityTest} from "v4-core/test/PoolModifyLiquidityTest.sol";
import {LiquidityAmounts} from "../src/lib/LiquidityAmounts.sol";
import {V9Devises} from "../src/V9Devises.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {TBlockBloc24h} from "../src/TBlockBloc24h.sol";
import {TBlockBloc24hFactory} from "../src/TBlockBloc24hFactory.sol";
import {TBlockQuoteFeeHookV9 as V9Zero1} from "./reference/TBlockQuoteFeeHookV9.zero1.sol";

interface IERC20L {
    function balanceOf(address) external view returns (uint256);
    function approve(address, uint256) external returns (bool);
    function transfer(address, uint256) external returns (bool);
}

interface IV8Lite {
    function feeWallet() external view returns (address);
}

interface ICreateRouterL {
    function createPaid(uint8, bytes32, bytes calldata, bytes[] calldata, address) external payable returns (address);
}

interface IInscrireL {
    function inscrire(PoolKey calldata key, uint160 sqrtPriceX96) external payable;
}

/// FORK ONLY — Base mainnet fork, pinned block, Base build of forge (`base = true`: the paired stocks are the REAL
/// B20 precompiles NVDAc / AAPLc, no mock). Nothing is broadcast, nothing is signed with a real key.
abstract contract LLBase is Test {
    using PoolIdLibrary for PoolKey;

    IPoolManager constant PM = IPoolManager(0x498581fF718922c3f8e6A244956aF099B2652b2b);
    address constant CREATE_ROUTER = 0xe05CD0336cD18A0909BCA980a4191A0B00a3FdF5;
    address constant HOOK_V8 = 0x5926abdAbf5D0006Ee960A8270f3e124e5a764cc;
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;
    address constant UR = 0x6fF5693b99212Da76ad316178A184AB56D299b43;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    /// the TB fee sink: receives the quote (ETH / USDC / the paired stock), NEVER the block. Never a test sender.
    address constant SINK = 0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4;
    address constant NVDAc = 0xb20000000000000000000078ee7ce2fE4908108C;
    address constant AAPLc = 0xb200000000000000000000C2e324d24d7eEcd1fb;
    uint256 constant COBALT_TS = 1790791200;
    address constant MORT = 0x000000000000000000000000000000000000dEaD;
    uint160 constant FLAGS_V9 = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
    );
    uint160 constant FLAGS_24H = FLAGS_V9 | uint160(Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG);
    uint256 constant FRAIS_VIE = 300_000_000_000_000;
    uint24 constant TAUX_V9 = 900; // the LIVE V9 constant, unchanged
    uint24 constant P_SINK = 700; // Raksha 10:23 split: 0.07 % sink + 0.03 % creator, in the paired stock
    uint24 constant P_CREA = 300;
    bytes constant MARQUEUR = bytes("%22face%22%3A%7B");
    string constant URI = "data:application/json,%7B%22name%22%3A%22X%22%2C%22face%22%3A%7B%22eyes%22%3A1%7D%7D";
    uint256 constant FRAIS_OUVERTURE = 0.001 ether;
    uint256 constant SUPPLY = 1_000_000_000 ether;
    uint256 constant SEED = 999_000_000 ether; // 99.9 % seeded, 0.1 % retained by the creator (unbacked)
    uint128 constant MINIMUM = 1e8; // creator escrow: 1 NVDAc (8 decimals)
    uint256 constant UN = 1e8; // 1 share of a tokenized stock

    // UNIQUE labels: makeAddr("alice") & co are EIP-7702-delegated on Base mainnet (code at the address)
    address adm = makeAddr("tbll-creator-20261002");
    address alice = makeAddr("tbll-wallet-A-20261002");
    address bob = makeAddr("tbll-wallet-B-20261002");
    address carol = makeAddr("tbll-wallet-C-20261002");
    address passant = makeAddr("tbll-anyone-20261002");

    PoolSwapTest swapper;
    PoolModifyLiquidityTest lp;
    uint256 nonceSel = 0x24b10c;

    struct L {
        TBlockBloc24h t;
        PoolKey key;
        address hook;
        address devise;
        bool devise0; // quote is currency0
        int24 lo;
        int24 hi;
        uint128 liq;
        uint160 sp;
    }

    struct Params {
        uint8 version;
        string name;
        string symbol;
        address initialAdmin;
        uint8 decimals;
    }

    modifier fork() {
        if (!_forkOk()) {
            console2.log("SKIP: not on a Base fork");
            return;
        }
        _;
    }

    function _forkOk() internal view returns (bool) {
        return block.chainid == 8453 && address(PM).code.length > 0 && NVDAc.code.length > 0;
    }

    function setUp() public virtual {
        if (!_forkOk()) return;
        vm.fee(0);
        vm.txGasPrice(0);
        assertEq(IV8Lite(HOOK_V8).feeWallet(), SINK, "the live V8 fee wallet is the TB sink");
        assertGt(block.timestamp, COBALT_TS, "fork block is post-Cobalt");
        address[5] memory w = [adm, alice, bob, carol, passant];
        for (uint256 i; i < 5; ++i) {
            assertEq(w[i].code.length, 0, "test account must be a plain EOA (no EIP-7702 delegation)");
            assertTrue(w[i] != SINK, "the sink is never a test account");
        }
        swapper = new PoolSwapTest(PM);
        lp = new PoolModifyLiquidityTest(PM);
    }

    // ── deployment (CREATE2 through 0x4e59, flags mined — the path a mainnet deploy would use) ──────────
    function _cfg(uint24 hookFee, uint24 pc, uint24 pk, uint8 mc, bool b20, bool s24) internal pure returns (Hook.Config memory c) {
        c.poolManager = PM;
        c.feeWallet = SINK;
        c.fraisVie = FRAIS_VIE;
        c.hookFee = hookFee;
        c.partCreateur = pc;
        c.partCollateral = pk;
        c.modeCollateral = mc;
        c.ancre = false;
        c.largeur = 4000;
        c.seuil = 0;
        c.delaiRetrait = 7 days;
        c.exigerB20 = b20;
        c.devises = V9Devises.liste();
        c.marqueur = MARQUEUR;
        c.suivi24h = s24;
    }

    function _mine(bytes memory init, uint160 flags) internal returns (address cible) {
        bytes32 h0 = keccak256(init);
        bytes32 salt;
        for (uint256 s = nonceSel; s < nonceSel + 800_000; ++s) {
            cible = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), CREATE2_DEPLOYER, bytes32(s), h0)))));
            if (uint160(cible) & Hooks.ALL_HOOK_MASK == flags && cible.code.length == 0) {
                salt = bytes32(s);
                nonceSel = s + 1;
                break;
            }
        }
        require(uint160(cible) & Hooks.ALL_HOOK_MASK == flags, "no salt");
        (bool ok,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, init));
        require(ok && cible.code.length > 0, "create2 failed");
    }

    function _deployHook(Hook.Config memory c) internal returns (Hook) {
        return Hook(_mine(abi.encodePacked(type(Hook).creationCode, abi.encode(c)), c.suivi24h ? FLAGS_24H : FLAGS_V9));
    }

    /// the 24 h memestock configuration: 700 sink / 300 creator (escrowed) / collateral mode 1, cradle ON
    function _hook24h() internal returns (Hook) {
        return _deployHook(_cfg(P_SINK, P_CREA, 0, 1, false, true));
    }

    /// Zero 1's V9, VERBATIM source (test/reference, sha256 checked by fork-test.sh), same solc settings
    function _deployV9Zero1() internal returns (address) {
        bytes memory init = abi.encodePacked(
            type(V9Zero1).creationCode,
            abi.encode(PM, SINK, FRAIS_VIE, uint256(TAUX_V9), true, V9Devises.liste(), MARQUEUR)
        );
        return _mine(init, FLAGS_V9);
    }

    // ── funding with the REAL stock (B20 precompile): the PoolManager's own balance, pranked ─────────────
    function _fundStock(address stock, address who, uint256 amt) internal {
        vm.prank(address(PM));
        require(IERC20L(stock).transfer(who, amt), "fund");
    }

    function _approve(address who, address token) internal {
        vm.startPrank(who);
        IERC20L(token).approve(address(swapper), type(uint256).max);
        IERC20L(token).approve(address(lp), type(uint256).max);
        vm.stopPrank();
    }

    function _cle(address a, address b, address hook) internal pure returns (PoolKey memory k) {
        (address c0, address c1) = a < b ? (a, b) : (b, a);
        k = PoolKey(Currency.wrap(c0), Currency.wrap(c1), 0, 200, IHooks(hook));
    }

    function _plancher(int24 t, int24 s) internal pure returns (int24) {
        int24 q = t / s;
        if (t < 0 && t % s != 0) q -= 1;
        return q * s;
    }

    /// price: 1 stock share (1e8) = 1,000,000 blocks (1e24) → raw ratio 1e16
    function _prix(bool devise0) internal pure returns (uint160 sp, int24 tick) {
        int24 t = TickMath.getTickAtSqrtPrice(
            devise0 ? uint160(FullMath.mulDiv(1e8, 1 << 96, 1)) : uint160(FullMath.mulDiv(1, 1 << 96, 1e8))
        );
        tick = _plancher(t, 200);
        sp = TickMath.getSqrtPriceAtTick(tick);
    }

    /// a cradle block from the NEW factory (no birth yet)
    function _bloc(TBlockBloc24hFactory f, string memory sym) internal returns (TBlockBloc24h t) {
        vm.prank(adm);
        t = TBlockBloc24h(f.creer(sym, sym, URI, SUPPLY, keccak256(abi.encode(sym, nonceSel++))));
    }

    /// BIRTH: register (with escrow if `minimum` > 0) → initialize (arms the 24 h) → 99.9 % single-sided seed
    function _naitre(TBlockBloc24h t, address hook, address devise, uint128 minimum) internal returns (L memory l) {
        return _naitreAvec(t, hook, devise, minimum, SEED);
    }

    function _naitreAvec(TBlockBloc24h t, address hook, address devise, uint128 minimum, uint256 seed)
        internal
        returns (L memory l)
    {
        l.t = t;
        l.hook = hook;
        l.devise = devise;
        l.key = _cle(devise, address(t), hook);
        l.devise0 = Currency.unwrap(l.key.currency0) == devise;
        int24 tick;
        (l.sp, tick) = _prix(l.devise0);
        vm.deal(adm, adm.balance + 1 ether);
        if (minimum == 0) {
            vm.prank(adm);
            IInscrireL(hook).inscrire{value: FRAIS_VIE}(l.key, l.sp);
        } else {
            _fundStock(devise, adm, minimum);
            vm.prank(adm);
            IERC20L(devise).approve(hook, minimum);
            vm.prank(adm);
            Hook(hook).inscrireAvecCaution{value: FRAIS_VIE}(l.key, l.sp, minimum);
        }
        PM.initialize(l.key, l.sp);
        // block-only range on the "block gets dearer" side of the price
        if (l.devise0) {
            // block = currency1: block-only below the price
            l.lo = TickMath.minUsableTick(200);
            l.hi = tick;
            l.liq = LiquidityAmounts.getLiquidityForAmount1(TickMath.getSqrtPriceAtTick(l.lo), l.sp, seed);
        } else {
            l.lo = tick + 200;
            l.hi = TickMath.maxUsableTick(200);
            l.liq = LiquidityAmounts.getLiquidityForAmount0(TickMath.getSqrtPriceAtTick(l.lo), TickMath.getSqrtPriceAtTick(l.hi), seed);
        }
        _approve(adm, address(t));
        _approve(adm, devise);
        vm.prank(adm);
        lp.modifyLiquidity(l.key, IPoolManager.ModifyLiquidityParams(l.lo, l.hi, int256(uint256(l.liq)), bytes32(0)), "");
        address[3] memory w = [alice, bob, carol];
        for (uint256 i; i < 3; ++i) {
            _approve(w[i], address(t));
            _approve(w[i], devise);
        }
    }

    function _lancer(Hook h, address devise, uint128 minimum, string memory sym) internal returns (L memory l) {
        TBlockBloc24hFactory f = new TBlockBloc24hFactory(address(PM), address(h));
        l = _naitre(_bloc(f, sym), address(h), devise, minimum);
    }

    // ── swaps through PoolSwapTest (swap, THEN settle / take: the v4 periphery order) ────────────────────
    function _swapBrut(L memory l, address qui, bool achat, bool exactIn, uint256 m, bool claims)
        internal
        returns (BalanceDelta d)
    {
        bool zfo = achat ? l.devise0 : !l.devise0;
        vm.prank(qui);
        d = swapper.swap(
            l.key,
            IPoolManager.SwapParams(zfo, exactIn ? -int256(m) : int256(m), zfo ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1),
            PoolSwapTest.TestSettings(claims, false),
            ""
        );
    }

    /// buy blocks with exactly `q` raw units of the stock; returns the blocks received
    function _acheter(L memory l, address qui, uint256 q) internal returns (uint256 recu) {
        _fundStock(l.devise, qui, q);
        BalanceDelta d = _swapBrut(l, qui, true, true, q, false);
        recu = uint256(int256(l.devise0 ? d.amount1() : d.amount0()));
    }

    /// sell exactly `m` blocks; returns the stock received
    function _vendre(L memory l, address qui, uint256 m) internal returns (uint256 q) {
        BalanceDelta d = _swapBrut(l, qui, false, true, m, false);
        q = uint256(int256(l.devise0 ? d.amount0() : d.amount1()));
    }

    function _dq(L memory l, BalanceDelta d) internal pure returns (int256) {
        return l.devise0 ? int256(d.amount0()) : int256(d.amount1());
    }

    function _db(L memory l, BalanceDelta d) internal pure returns (int256) {
        return l.devise0 ? int256(d.amount1()) : int256(d.amount0());
    }

    function _sinkQ(L memory l) internal view returns (uint256) {
        return IERC20L(l.devise).balanceOf(SINK);
    }

    function _du(L memory l) internal view returns (uint256 du, uint256 co) {
        (uint128 a, uint128 b) = Hook(l.hook).comptes(l.key.toId());
        return (a, b);
    }

    function _sel(bytes4 s, address q, uint256 c, uint256 m) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(s, q, c, m);
    }

    /// a hook-callback revert, as the PoolManager wraps it
    function _wrapped(address hook, bytes4 cb, bytes memory reason) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(
            CustomRevert.WrappedError.selector, hook, cb, reason, abi.encodeWithSelector(Hooks.HookCallFailed.selector)
        );
    }

    /// INVARIANT: the hook's quote claims == escrow + creator due + collateral + fee fallback; 0 block claims/tokens
    function _invariant(L memory l) internal view {
        Hook h = Hook(l.hook);
        PoolId id = l.key.toId();
        (uint128 du, uint128 co) = h.comptes(id);
        assertEq(
            PM.balanceOf(l.hook, uint256(uint160(l.devise))),
            h.caution(id) + du + co + h.enAttente(Currency.wrap(l.devise)),
            "INVARIANT claims(quote) == escrow + creator due + collateral + fee fallback"
        );
        assertEq(PM.balanceOf(l.hook, uint256(uint160(address(l.t)))), 0, "INVARIANT hook holds 0 block claims");
        assertEq(IERC20L(address(l.t)).balanceOf(l.hook), 0, "INVARIANT hook holds 0 block tokens");
        assertEq(IERC20L(address(l.t)).balanceOf(SINK), 0, "INVARIANT the sink never receives the block");
    }
}
