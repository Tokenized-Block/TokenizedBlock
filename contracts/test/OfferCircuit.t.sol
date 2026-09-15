// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OfferCircuit} from "../src/OfferCircuit.sol";
import {MockERC20} from "./MockERC20.sol";

/**
 * O2 unit tests — integer 0/1 decide ↔ brain-tasks.js decideOffre.
 * NO broadcast. NO mainnet fork (fork = O4+ documented in DIG).
 *
 * Fixtures use the same hard stops + CURRENT_TOY_V1 weights / THRESHOLD=5 as:
 *   /workspace/tb-gh-app/brain-tasks.js → OFFER_TOY_V1 / decideOffre
 * Schema marker: s[24]=1, s[31]=22 (len of "tblock-offer-circuit/1").
 * Dig O5: CURRENT_TOY_V1 frozen 2026-09-15 — circuit stays /1.
 */
contract OfferCircuitTest is Test {
    OfferCircuit circuit;
    MockERC20 food;

    address constant FEE_WALLET = 0x37Eb9b7ce0b51Fe12fBf092026e001918128580A;
    address constant LOCK_FOREVER = 0x000000000000000000000000000000000000dEaD;
    address offerer = address(0xA11CE);
    address blockToken = address(0xB10C);

    uint8 constant SCHEMA = 1;
    uint8 constant VER_LEN = 22; // "tblock-offer-circuit/1".length

    function setUp() public {
        circuit = new OfferCircuit();
        food = new MockERC20();
        vm.deal(offerer, 10 ether);
        food.mint(offerer, 1_000_000 ether);
    }

    /// @dev Pack 32 uint8 → bytes32 (byte 0 = s[0]), matching OfferCircuit.unpack.
    function _pack(uint8[32] memory s) internal pure returns (bytes32 out) {
        for (uint256 i = 0; i < 32; i++) {
            out |= bytes32(uint256(s[i]) << (248 - i * 8));
        }
    }

    function _blank() internal pure returns (uint8[32] memory s) {
        s[24] = SCHEMA;
        s[31] = VER_LEN;
    }

    // --- decide / unpack (JS parity) ---

    function test_constants_matchBrainTasks() public view {
        assertEq(circuit.THRESHOLD(), 5);
        assertEq(circuit.TOY_ID(), "CURRENT_TOY_V1");
        assertEq(circuit.FEE_WALLET(), FEE_WALLET);
        assertEq(circuit.LOCK_FOREVER(), LOCK_FOREVER);
        assertEq(circuit.CIRCUIT(), keccak256("tblock-offer-circuit/1"));
    }

    function test_unpack_roundtrip() public view {
        uint8[32] memory s = _blank();
        s[0] = 1;
        s[5] = 1;
        s[13] = 2;
        s[25] = 1;
        bytes32 packed = _pack(s);
        uint8[32] memory u = circuit.unpack(packed);
        for (uint256 i = 0; i < 32; i++) {
            assertEq(u[i], s[i], "unpack mismatch");
        }
    }

    function test_decide_hardStop_MORT() public view {
        uint8[32] memory s = _blank();
        s[0] = 1;
        s[1] = 1;
        s[2] = 1;
        s[11] = 1;
        s[12] = 1; // would score 11 if not MORT
        s[5] = 1; // MORT
        (uint8 d, uint16 sc) = circuit.decide(_pack(s));
        assertEq(d, 0);
        assertEq(sc, 0);
    }

    function test_decide_hardStop_unreadNoLife() public view {
        uint8[32] memory s = _blank();
        s[4] = 1; // NON_LU
        s[0] = 0; // no life read
        s[11] = 1;
        s[12] = 1;
        (uint8 d, uint16 sc) = circuit.decide(_pack(s));
        assertEq(d, 0);
        assertEq(sc, 0);
    }

    function test_decide_hardStop_slotBusy() public view {
        uint8[32] memory s = _blank();
        s[0] = 1;
        s[1] = 1;
        s[2] = 1;
        s[11] = 1;
        s[12] = 1;
        s[25] = 1; // busy
        (uint8 d, uint16 sc) = circuit.decide(_pack(s));
        assertEq(d, 0);
        assertEq(sc, 0);
    }

    /// @dev JS: s[0]*3 alone = 3 < 5 → refuse
    function test_decide_refuse_belowThreshold() public view {
        uint8[32] memory s = _blank();
        s[0] = 1; // score 3
        (uint8 d, uint16 sc) = circuit.decide(_pack(s));
        assertEq(d, 0);
        assertEq(sc, 3);
    }

    /// @dev JS: s[0]*3 + s[1]*2 = 5 → accept (threshold)
    function test_decide_accept_exactThreshold() public view {
        uint8[32] memory s = _blank();
        s[0] = 1;
        s[1] = 1; // 3+2=5
        (uint8 d, uint16 sc) = circuit.decide(_pack(s));
        assertEq(d, 1);
        assertEq(sc, 5);
    }

    /// @dev Full living-market band like a healthy snapshot.
    /// score = 3+2+2+2+2 + gm1 + msg1 + hookFee1 = 14
    function test_decide_accept_healthySnapshotWeights() public view {
        uint8[32] memory s = _blank();
        s[0] = 1; // market LUE
        s[1] = 1; // vie > 0
        s[2] = 1; // hooked
        s[8] = 3; // gm > 0 → +1
        s[9] = 2; // messages > 0 → +1
        s[11] = 1; // food LUE
        s[12] = 1; // living phase
        s[16] = 1; // isTbFeeHook
        (uint8 d, uint16 sc) = circuit.decide(_pack(s));
        assertEq(d, 1);
        assertEq(sc, 14);
    }

    /// @dev DORMANT subtracts 2; INQUIET (s[13]==1) subtracts 1.
    /// base 3+2=5 → after dormant 3 → after inquiet 2 → refuse
    function test_decide_dormantAndInquiet_penalties() public view {
        uint8[32] memory s = _blank();
        s[0] = 1;
        s[1] = 1; // 5
        s[6] = 1; // DORMANT -2 → 3
        s[13] = 1; // INQUIET -1 → 2
        (uint8 d, uint16 sc) = circuit.decide(_pack(s));
        assertEq(d, 0);
        assertEq(sc, 2);
    }

    /// @dev EXCITE sets s[13]=2 in JS packer — penalty only when ===1, so no subtract.
    function test_decide_excite_noInquietPenalty() public view {
        uint8[32] memory s = _blank();
        s[0] = 1;
        s[1] = 1; // 5
        s[13] = 2; // EXCITE — JS only penalizes ===1
        (uint8 d, uint16 sc) = circuit.decide(_pack(s));
        assertEq(d, 1);
        assertEq(sc, 5);
    }

    // --- offer() unit (local mock, not fork) ---

    function test_offer_badSignals_reverts() public {
        bytes32 zero;
        vm.expectRevert(OfferCircuit.BadSignals.selector);
        circuit.offer(blockToken, address(food), 0, bytes32(0), zero);
    }

    function test_offer_refuse_doesNotPullTokens() public {
        uint8[32] memory s = _blank();
        s[0] = 1; // score 3 → refuse
        bytes32 packed = _pack(s);
        uint256 before = food.balanceOf(LOCK_FOREVER);

        vm.startPrank(offerer);
        food.approve(address(circuit), 100 ether);
        circuit.offer(blockToken, address(food), 100 ether, keccak256("ev"), packed);
        vm.stopPrank();

        assertEq(food.balanceOf(LOCK_FOREVER), before);
        assertEq(circuit.busy(), false);
        assertEq(circuit.currentOfferer(), address(0));
    }

    function test_offer_accept_locksToDead() public {
        uint8[32] memory s = _blank();
        s[0] = 1;
        s[1] = 1; // score 5 → accept
        bytes32 packed = _pack(s);

        vm.startPrank(offerer);
        food.approve(address(circuit), 50 ether);
        circuit.offer(blockToken, address(food), 50 ether, keccak256("ev"), packed);
        vm.stopPrank();

        assertEq(food.balanceOf(LOCK_FOREVER), 50 ether);
        assertEq(circuit.busy(), false);
    }

    function test_offer_lifeDust_toFeeWallet() public {
        uint8[32] memory s = _blank();
        s[0] = 1; // refuse path — dust still sends
        bytes32 packed = _pack(s);
        uint256 before = FEE_WALLET.balance;

        vm.prank(offerer);
        circuit.offer{value: 0.001 ether}(blockToken, address(food), 0, keccak256("ev"), packed);

        assertEq(FEE_WALLET.balance, before + 0.001 ether);
    }

    function test_receive_reverts() public {
        vm.expectRevert();
        (bool ok,) = address(circuit).call{value: 1 wei}("");
        ok; // silence
    }
}
