// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {LiquidityAmounts} from "../src/lib/LiquidityAmounts.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {LLBase} from "./LLBase.sol";

/// @title The per-swap cap of the creator piece, executed by the REAL hook in collateral mode 0.
/// @notice `_parts` runs twice per swap (beforeSwap via `_repartir`, which writes `duCreateur`; afterSwap via
///         `_verifierRemplissage`, which replays it). A cap that read `duCreateur` made the two totals differ in mode 0
///         (the surplus is not charged there) and reverted `RemplissagePartiel`. The cap reads only `caution`.
///         Escrow 600,000 NVDAc-raw (>= the NVDAc floor): a buy of 15 NVDAc credits X = 450,000 (< escrow, < 2X),
///         a buy of 30 NVDAc (X = 900,000) is capped at the escrow.
contract PlafondIdempotentTest is LLBase {
    uint128 constant CAUTION_ZONE = 600_000;

    function _hookMode0() internal returns (Hook) {
        // collateral mode 0, creator share 300, B20 block required
        return _deployHook(_cfg(700, P_CREA, 0, 0, true));
    }

    /// the case that reverted before the fix: must pass
    function test_mode0_achatExact_dansLaZone_nerevertPlus() public fork {
        Hook h = _hookMode0();
        L memory l = _ouvrirSur(address(h), NVDAc, _creerB20("IDEM"), CAUTION_ZONE);
        assertTrue(h.createurActif(l.key.toId()), "le createur doit etre actif (caution en place)");
        assertEq(h.caution(l.key.toId()), CAUTION_ZONE, "escrow in place");
        _acheter(l, alice, 15 * UN); // reaching here = afterSwap did not revert RemplissagePartiel
        (uint256 du,) = _du(l);
        assertEq(du, 450_000, "credited X = 450,000, under the escrow");
    }

    /// second swap: `duCreateur` already holds X; each swap is capped on its own (the cap reads only the escrow)
    function test_mode0_deuxiemeAchat_nerevertPas() public fork {
        Hook h = _hookMode0();
        L memory l = _ouvrirSur(address(h), NVDAc, _creerB20("IDE2"), CAUTION_ZONE);
        _acheter(l, alice, 15 * UN);
        _acheter(l, alice, 15 * UN);
        (uint256 du,) = _du(l);
        assertEq(du, 900_000, "two swaps of X = 450,000, each under the escrow");
    }

    /// control: the cap still binds (without it, "no longer reverts" would not show the cap bounds anything)
    function test_TEMOIN_mode0_plafondBorneEncore() public fork {
        Hook h = _hookMode0();
        L memory l = _ouvrirSur(address(h), NVDAc, _creerB20("IDE3"), CAUTION_ZONE);
        _acheter(l, alice, 30 * UN); // X = 30e8 * 300 / 1e6 = 900,000 > escrow 600,000
        (uint256 du,) = _du(l);
        assertEq(du, CAUTION_ZONE, "X above the escrow: capped at the escrow");
    }
}
