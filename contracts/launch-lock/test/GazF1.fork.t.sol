// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

// Grok Bot 2026-10-02 — gas of fix F1 with the ORIENTATION PINNED (block < NVDAc and block > NVDAc measured apart).
// E4's numbers move with the mined hook salt (a bytecode change moves every block address, hence the pool orientation
// and the tick rounding), so E4 alone cannot give a clean before/after. Run this file on 6260b7c and on the fix.
// FORK ONLY. Nothing broadcast.
import {console2} from "forge-std/console2.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {TBlockLaunchLockHook as Hook} from "../src/TBlockLaunchLockHook.sol";
import {TBlockBloc24h} from "../src/TBlockBloc24h.sol";
import {TBlockBloc24hFactory} from "../src/TBlockBloc24hFactory.sol";
import {LLBase, IERC20L} from "./LLBase.sol";

interface IVmCool {
    function cool(address target) external;
}

contract GazF1Test is LLBase {
    function _oriente(Hook h, bool blocAvantNvda, string memory sym) internal returns (L memory l) {
        TBlockBloc24hFactory f = new TBlockBloc24hFactory(address(PM), address(h));
        TBlockBloc24h t;
        for (uint256 i; i < 64; ++i) {
            t = _bloc(f, string.concat(sym, vm.toString(i)));
            if ((address(t) < NVDAc) == blocAvantNvda) break;
        }
        require((address(t) < NVDAc) == blocAvantNvda, "orientation not found");
        l = _naitre(t, address(h), NVDAc, MINIMUM);
    }

    function _mesurer(L memory l, string memory tag, bool froid) internal {
        _fundStock(NVDAc, alice, 10 * UN);
        _fundStock(NVDAc, bob, 10 * UN);
        _approve(alice, address(l.t));
        _approve(bob, address(l.t));
        _approve(bob, NVDAc);
        _swapBrut(l, alice, true, true, UN / 10, false); // prime
        _swapBrut(l, bob, true, true, UN / 10, false);
        if (froid) _froid(l);
        uint256 g = gasleft();
        BalanceDelta d = _swapBrut(l, alice, true, true, UN / 10, false);
        uint256 gBuy = g - gasleft();
        uint256 r = uint256(_db(l, d));
        if (froid) _froid(l);
        g = gasleft();
        _swapBrut(l, alice, false, true, r / 2, false);
        uint256 gSell = g - gasleft();
        if (froid) _froid(l);
        vm.prank(alice);
        g = gasleft();
        IERC20L(address(l.t)).transfer(bob, r / 8);
        uint256 gP2p = g - gasleft();
        console2.log(tag, froid ? "COLD hook+token storage" : "warm");
        console2.log("  buy exactIn / sell exactIn / p2p transfer", gBuy, gSell, gP2p);
    }

    /// cold storage on the hook and the token (as in a fresh tx). Skipped if this forge build lacks vm.cool.
    function _froid(L memory l) internal {
        IVmCool(address(vm)).cool(l.hook);
        IVmCool(address(vm)).cool(address(l.t));
    }

    function test_GazF1_blocApresNvda() public fork {
        _mesurer(_oriente(_hook24h(), false, "GA"), "F1-gas block > NVDAc INSIDE 24 h", false);
        _mesurer(_oriente(_hook24h(), false, "GB"), "F1-gas block > NVDAc INSIDE 24 h", true);
    }

    function test_GazF1_blocAvantNvda() public fork {
        _mesurer(_oriente(_hook24h(), true, "GC"), "F1-gas block < NVDAc INSIDE 24 h", false);
        _mesurer(_oriente(_hook24h(), true, "GD"), "F1-gas block < NVDAc INSIDE 24 h", true);
    }

    function test_GazF1_apres24h() public fork {
        L memory l = _oriente(_hook24h(), false, "GE");
        vm.warp(l.t.restrictionsEndAt());
        _mesurer(l, "F1-gas block > NVDAc AFTER 24 h", false);
    }
}
