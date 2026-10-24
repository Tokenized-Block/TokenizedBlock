// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../src/BlockRolls.sol";
import "../src/BlockDuels.sol";

/* AUDIT ROLLS-DUELS 2026-10-24 — les PoC du verificateur (D:\tmp\audit-verify-rolls-duels\contracts\test\VerifyRD.t.sol), copies tels quels
 * (contrat renomme). Ils PASSENT : ils prouvent que les defauts existent dans le code DEPLOYE (contracts/src, immuable, non modifie). La parade
 * est cote app / serveur / texte : test-duels-ouverture-20261024, test-rolls-regles-20261024, test-rolls-risques-textes-20261024,
 * test-serveur-regles-duels-20261024, banc-rolls-regles-anvil-20261024. Un PoC qui ROUGIT un jour veut dire que le contrat a change. */
contract T6 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function decimals() external pure returns (uint8) { return 6; }
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
}
contract Hk { address public c; constructor(address a){c=a;} function createurs(bytes32) external view returns (address, uint256) { return (c, 0); } }

contract AuditRollsDuels20261024 is Test {
    T6 u;
    function setUp() public { vm.roll(5000); vm.warp(1_800_000_000); u = new T6(); }
    function g(uint256 s) internal pure returns (uint8[5] memory x) {
        bytes32 r = keccak256(abi.encode("v", s));
        x[0]=uint8(r[0])%6; x[1]=uint8(r[1])%10; x[2]=uint8(r[2])%19; x[3]=uint8(r[3])%9; x[4]=uint8(r[4])%8;
    }

    /* DUEL: one concrete duel the CREATOR wins; joiner stays silent; creator returns at t+257 and cannot settle; refund. */
    function test_V_DuelCreatorWinBecomesRefund() public {
        BlockDuels d = new BlockDuels(address(u), address(0xDE), address(0x70), address(0x6A));
        address A = address(0xA1); address B = address(0xB1);
        u.mint(A, 5e6); u.mint(B, 5e6);
        // find a hash where A strictly beats B
        uint8[5] memory ga = g(1); uint8[5] memory gb = g(2);
        bytes32 h; uint256 k;
        for (k = 0; k < 1000; k++) { h = keccak256(abi.encode("h", k)); uint8[5] memory f = d.faceOf(h); if (d.scoreOf(ga,f) > d.scoreOf(gb,f)) break; }
        vm.startPrank(A); u.approve(address(d), 5e6); uint256 id = d.create(address(u), 5e6, ga, 7 days); vm.stopPrank();
        vm.startPrank(B); u.approve(address(d), 5e6); d.join(id, gb); vm.stopPrank();
        (,,,,, uint40 t,,,) = d.duels(id);
        vm.roll(uint256(t) + 1); vm.setBlockhash(t, h);
        // B sees it lost (computes off-chain) and does nothing. Window passes.
        vm.roll(uint256(t) + 257);
        vm.prank(A); vm.expectRevert(BlockDuels.TooLate.selector); d.settle(id);
        vm.prank(B); d.refundExpired(id);
        emit log_named_uint("A balance after (won the face, raw)", u.balanceOf(A));
        emit log_named_uint("B balance after (lost the face, raw)", u.balanceOf(B));
        assertEq(u.balanceOf(A), 5e6); assertEq(u.balanceOf(B), 5e6);
    }

    /* DUEL EV: joiner-with-option vs creator offline, 2000 duels */
    function test_V_DuelEV() public {
        BlockDuels d = new BlockDuels(address(u), address(0xDE), address(0x70), address(0x6A));
        address A = address(0xA1); address B = address(0xB1);
        u.mint(A, 1e13); u.mint(B, 1e13);
        vm.prank(A); u.approve(address(d), type(uint256).max);
        vm.prank(B); u.approve(address(d), type(uint256).max);
        uint256 w; uint256 l; uint256 ti;
        for (uint256 i = 0; i < 2000; i++) {
            vm.prank(A); uint256 id = d.create(address(u), 1e6, g(1000+i), 7 days);
            vm.prank(B); d.join(id, g(9000+i));
            (,,,,, uint40 t,,,) = d.duels(id);
            bytes32 h = keccak256(abi.encode("hh", i));
            vm.roll(uint256(t) + 1); vm.setBlockhash(t, h);
            uint8[5] memory f = d.faceOf(h);
            uint8 a = d.scoreOf(g(1000+i), f); uint8 b = d.scoreOf(g(9000+i), f);
            if (b > a) { d.settle(id); w++; } else if (a > b) { vm.roll(uint256(t) + 257); d.refundExpired(id); l++; } else { d.settle(id); ti++; }
            vm.roll(block.number + 1);
        }
        emit log_named_uint("joiner wins settled", w); emit log_named_uint("joiner losses refunded", l); emit log_named_uint("ties", ti);
        emit log_named_int("joiner net raw", int256(u.balanceOf(B)) - 1e13);
        emit log_named_int("creator net raw", int256(u.balanceOf(A)) - 1e13);
    }

    /* DAY POT: re-arm after window works; honest draw inside window would stop it */
    function test_V_DayPotGrind() public {
        BlockRolls r = new BlockRolls(BlockRolls.Config(address(u), address(0xDE), address(new Hk(address(0xC0))), bytes32(uint256(1)), 500_000, 10_000_000, 30, 1 days, 5000, 5_000_000, 3_000_000, 1_000_000, 500_000, 2));
        address[4] memory bs = [address(0x11), address(0x12), address(0x13), address(0xBAD)];
        for (uint256 i; i < 4; i++) { u.mint(bs[i], 10e6); vm.startPrank(bs[i]); u.approve(address(r), 10e6); r.buyPass(); vm.stopPrank(); }
        uint32 day = r.today();
        vm.warp(block.timestamp + 1 days);
        uint256 tries;
        for (tries = 1; tries < 200; tries++) {
            vm.prank(address(0xBAD)); r.closeDay(day);
            (, uint40 t,) = r.dayPots(day);
            // closeDay cannot be re-armed inside the window
            vm.roll(uint256(t) + 256);
            vm.prank(address(0xBAD)); vm.expectRevert(BlockRolls.StillSettleable.selector); r.closeDay(day);
            bytes32 h = keccak256(abi.encode("d", tries));
            vm.setBlockhash(t, h);
            if (bs[uint256(h) % 4] == address(0xBAD)) { vm.prank(address(0xBAD)); r.drawDay(day); break; }
            vm.roll(uint256(t) + 257);
        }
        emit log_named_uint("tries", tries);
        emit log_named_uint("attacker balance (raw, paid 10e6 for pass)", u.balanceOf(address(0xBAD)));
        assertEq(u.balanceOf(address(0xBAD)), 20e6);
    }

    /* setRules drain */
    function test_V_SetRulesDrain() public {
        address CR = address(0xC0);
        BlockRolls r = new BlockRolls(BlockRolls.Config(address(u), address(0xDE), address(new Hk(CR)), bytes32(uint256(1)), 500_000, 10_000_000, 30, 1 days, 5000, 5_000_000, 3_000_000, 1_000_000, 500_000, 2));
        address F = address(0xF0); u.mint(F, 50e6); vm.startPrank(F); u.approve(address(r), 50e6); r.fund(50e6); vm.stopPrank();
        vm.prank(address(0x99)); vm.expectRevert(BlockRolls.NotCreator.selector); r.setRules(1000e6,1000e6,1000e6,1000e6,2);
        vm.prank(CR); r.setRules(1000e6,1000e6,1000e6,1000e6,2);
        u.mint(CR, 100e6); vm.prank(CR); u.approve(address(r), type(uint256).max);
        uint256 n;
        for (n = 1; n < 300 && r.pot() > 0; n++) {
            vm.prank(CR); uint256 id = r.roll(g(500+n));
            (, uint40 t,,,) = r.rolls(id);
            vm.roll(uint256(t) + 1); vm.setBlockhash(t, keccak256(abi.encode("r", n))); r.settle(id);
        }
        emit log_named_uint("creator rolls", n-1);
        emit log_named_int("creator net raw", int256(u.balanceOf(CR)) - 100e6);
        emit log_named_uint("pot after", r.pot());
    }
}
