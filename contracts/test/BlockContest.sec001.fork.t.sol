// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockContest} from "../src/BlockContest.sol";
import {Pairs7030} from "./Pairs7030.sol";

interface IB20p { function transfer(address, uint256) external returns (bool); function approve(address, uint256) external returns (bool); }

/// @notice SEC-001 regression, on the LIVE hook 7030: can a STRANGER become "creator" (createurs) of a NEW pool for someone
///         else's block, and so enter it in BlockContest? Measured 2026-11-09 (fork block 55296649): NO.
///         - inscrireAvecCaution (the app's registration, lancer-pool-v2.js) reverts PasAdminDuBlock() = 0x37d927c1
///           (name also mapped in wt-tblock/verifie-parcours-v4.mjs:26) for a non-admin, whatever key he picks;
///         - PoolManager.initialize without registration reverts WrappedError(hook, beforeInitialize, PasInscrite() = 0x93a2a14a,
///           HookCallFailed()) -> the pool never exists, createurs(newPoolId) stays 0, BlockContest.enter reverts NotCreator.
///         Controls: the block's admin (UNIT creator) passes the same steps and becomes createurs() of the new pool.
/// Runs in base-forge's in-memory fork of the base-anvil on 8655: nothing is sent to the anvil node or to mainnet.
contract Sec001ProbeForkTest is Test {
    struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }

    address constant TBLOCK = 0xB200000000000000000000BA9BF8330307f8830E;
    address constant HOOK = 0x32F3f572Dd17625bAb9035789C953E1d001864cc;   // hook-7030-descripteur.js:11
    address constant UNIT = 0xb2000000000000000000007AFa7ed748B0874f27;
    address constant UNIT_CREATOR = 0x31e0DBc9038C82184B9fa6a90057a3ED500BdE3B;
    address constant OUSD = 0xB2000000000000000000002fEb517dFeC7415344;   // admitted pair currency (descriptor line 23)
    address constant POOL_MANAGER = 0x498581fF718922c3f8e6A244956aF099B2652b2b; // lancer-pool.js V4_ADRESSES[8453].poolm
    address constant STATE_VIEW = 0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71;   // lancer-pool.js V4_ADRESSES[8453].stateView
    uint256 constant ETH_FLOOR = 375110845363267;  // descriptor ETH plancher
    uint256 constant OUSD_FLOOR = 999999;          // descriptor OUSD plancher
    bytes4 constant PAS_ADMIN_DU_BLOCK = 0x37d927c1; // cast sig "PasAdminDuBlock()"
    bytes4 constant PAS_INSCRITE = 0x93a2a14a;       // cast sig "PasInscrite()"
    bytes4 constant WRAPPED_ERROR = 0x90bfb865;      // cast sig "WrappedError(address,bytes4,bytes,bytes)"

    address stranger = makeAddr("sec001-stranger");

    function _id(PoolKey memory k) internal pure returns (bytes32) { return keccak256(abi.encode(k)); }
    function _creator(bytes32 id) internal view returns (address) {
        (bool ok, bytes memory r) = HOOK.staticcall(abi.encodeWithSignature("createurs(bytes32)", id));
        require(ok && r.length >= 32, "createurs unreadable");
        return abi.decode(r, (address));
    }
    function _fees() internal view returns (uint256) {
        (, bytes memory a) = HOOK.staticcall(abi.encodeWithSignature("fraisVie()"));
        (, bytes memory b) = HOOK.staticcall(abi.encodeWithSignature("fraisCreation()"));
        return abi.decode(a, (uint256)) + abi.decode(b, (uint256));
    }
    function _unitEthSqrt() internal view returns (uint160 s) {
        PoolKey memory k = PoolKey(address(0), UNIT, 0, 200, HOOK);
        (bool ok, bytes memory r) = STATE_VIEW.staticcall(abi.encodeWithSignature("getSlot0(bytes32)", _id(k)));
        require(ok, "slot0");
        s = uint160(uint256(bytes32(r)));
    }
    function _isAdmin(address blk, address who) internal view returns (bool) {
        (bool ok, bytes memory r) = HOOK.staticcall(abi.encodeWithSignature("estAdminDuBlock(address,address)", blk, who));
        return ok && r.length == 32 && abi.decode(r, (uint256)) == 1;
    }
    function _sel(bytes memory ret) internal pure returns (bytes4 s) { if (ret.length >= 4) assembly { s := mload(add(ret, 32)) } }

    /// the app's registration step (lancer-pool-v2.js encodeInscrireAvecCaution, 3-arg overload), then PoolManager.initialize.
    function _registerAndInit(address who, PoolKey memory k, uint160 sqrtP, uint256 minimum, uint256 ethValue)
        internal returns (bool regOk, bytes memory regRet, bool initOk, bytes memory initRet)
    {
        vm.deal(who, 1 ether);
        vm.prank(who);
        (regOk, regRet) = HOOK.call{value: ethValue}(abi.encodeWithSignature(
            "inscrireAvecCaution((address,address,uint24,int24,address),uint160,uint128)", k, sqrtP, uint128(minimum)));
        vm.prank(who);
        (initOk, initRet) = POOL_MANAGER.call(abi.encodeWithSignature(
            "initialize((address,address,uint24,int24,address),uint160)", k, sqrtP));
    }

    function _onFork() internal returns (bool) {
        if (block.chainid != 8453 || HOOK.code.length == 0) { vm.skip(true); return false; }
        return true;
    }

    function _contest() internal returns (BlockContest c) {
        c = new BlockContest(BlockContest.Config({
            tblock: TBLOCK, hook: HOOK, genesis: uint64(block.timestamp + 60), entryPeriod: 3 days, votePeriod: 4 days,
            votePrice: 8_621e18, entryFee: 17_241e18, burnBps: 10_000, split1: 10_000, split2: 0, split3: 0, minVotes: 3,
            minVoters: 3, minQualifiedEntries: 2, maxPot: 862_000e18
        }), Pairs7030.list());
        vm.warp(c.roundStart(0));
    }

    function _assertStrangerRefused(PoolKey memory k, uint160 sqrtP, uint256 minimum, uint256 value) internal {
        bytes32 id = _id(k);
        assertEq(_creator(id), address(0), "new pool unknown before");
        (bool a, bytes memory ra, bool b, bytes memory rb) = _registerAndInit(stranger, k, sqrtP, minimum, value);
        emit log_named_bytes("stranger inscrireAvecCaution revert", ra);
        emit log_named_bytes("stranger initialize revert", rb);
        assertFalse(a, "stranger registration refused");
        assertEq(_sel(ra), PAS_ADMIN_DU_BLOCK, "refused as PasAdminDuBlock()");
        assertFalse(b, "stranger initialize refused");
        assertEq(_sel(rb), WRAPPED_ERROR, "initialize: WrappedError from the hook");
        bytes4 inner;
        // rb = len | sel | target | bytes4 hookSel | off(reason) | off(details) | len(reason) | reason... -> reason at 32+4+5*32
        assembly { inner := mload(add(rb, 196)) }
        assertEq(inner, PAS_INSCRITE, "wrapped reason = PasInscrite()");
        assertEq(_creator(id), address(0), "createurs(newPoolId) still 0");
        // and so BlockContest refuses the stranger for that key
        BlockContest c = _contest();
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        vm.expectRevert(BlockContest.NotCreator.selector);
        c.enter(UNIT, BlockContest.PoolKey(k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks));
    }

    function test_sec001_strangerIsNotAdmin() public {
        if (!_onFork()) return;
        assertFalse(_isAdmin(UNIT, stranger));
        assertTrue(_isAdmin(UNIT, UNIT_CREATOR));
    }

    function test_sec001_stranger_ETH_UNIT_otherTickSpacing_refused() public {
        if (!_onFork()) return;
        _assertStrangerRefused(PoolKey(address(0), UNIT, 0, 100, HOOK), _unitEthSqrt(), ETH_FLOOR, _fees() + ETH_FLOOR);
    }

    function test_sec001_stranger_ETH_UNIT_otherFee_refused() public {
        if (!_onFork()) return;
        _assertStrangerRefused(PoolKey(address(0), UNIT, 3000, 200, HOOK), _unitEthSqrt(), ETH_FLOOR, _fees() + ETH_FLOOR);
    }

    function test_sec001_stranger_OUSD_UNIT_canonical_refused() public {
        if (!_onFork()) return;
        vm.prank(POOL_MANAGER); IB20p(OUSD).transfer(stranger, 10 * OUSD_FLOOR);
        vm.prank(stranger); IB20p(OUSD).approve(HOOK, type(uint256).max);
        _assertStrangerRefused(PoolKey(OUSD, UNIT, 0, 200, HOOK), uint160(1 << 96), OUSD_FLOOR, _fees());
    }

    function test_sec001_control_admin_OUSD_UNIT_becomesCreator() public {
        if (!_onFork()) return;
        PoolKey memory k = PoolKey(OUSD, UNIT, 0, 200, HOOK);
        vm.prank(POOL_MANAGER); IB20p(OUSD).transfer(UNIT_CREATOR, 10 * OUSD_FLOOR);
        vm.prank(UNIT_CREATOR); IB20p(OUSD).approve(HOOK, type(uint256).max);
        (bool a,, bool b,) = _registerAndInit(UNIT_CREATOR, k, uint160(1 << 96), OUSD_FLOOR, _fees());
        assertTrue(a && b, "admin registers and initializes");
        assertEq(_creator(_id(k)), UNIT_CREATOR);
    }

    function test_sec001_control_admin_ETH_UNIT_otherTickSpacing() public {
        if (!_onFork()) return;
        // informative control: does the hook let the ADMIN open a non-canonical ETH/UNIT pool? (either way he is the same payee)
        PoolKey memory k = PoolKey(address(0), UNIT, 0, 100, HOOK);
        (bool a, bytes memory ra, bool b, bytes memory rb) = _registerAndInit(UNIT_CREATOR, k, _unitEthSqrt(), ETH_FLOOR, _fees() + ETH_FLOOR);
        emit log_named_string("admin ts100 registration ok", a ? "true" : "false");
        emit log_named_bytes("  revert", ra);
        emit log_named_string("admin ts100 initialize ok", b ? "true" : "false");
        emit log_named_bytes("  revert", rb);
        emit log_named_address("createurs(ts100)", _creator(_id(k)));
        address cr = _creator(_id(k));
        assertTrue(cr == address(0) || cr == UNIT_CREATOR, "never anyone but the admin");
    }
}
