// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TBlockBuybackUnitTestV2} from "./TBlockBuybackV2.t.sol";
import {TBlockBuybackV2 as TBlockBuyback} from "../src/buyback/TBlockBuybackV2.sol";

/// V2 only: the destination of every TBLOCK bought must be set, and cannot be the pool manager, the v3 pool or TBLOCK itself.
contract TBlockBuybackDestTestV2 is TBlockBuybackUnitTestV2 {
    function test_dest_guards() public {
        TBlockBuyback.Config memory c = _cfg();
        assertEq(new TBlockBuyback(c).DEST(), c.dest);
        c.dest = address(0);
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.dest = c.poolManager;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.dest = c.v3Pool;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
        c = _cfg(); c.dest = c.tblock;
        vm.expectRevert(TBlockBuyback.BadParams.selector); new TBlockBuyback(c);
    }
}
