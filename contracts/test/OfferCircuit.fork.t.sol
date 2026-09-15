// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {OfferCircuit} from "../src/OfferCircuit.sol";
import {MockERC20} from "./MockERC20.sol";

/**
 * O4 — Fork Base eth_call suite. NEVER --broadcast.
 *
 * Deploys OfferCircuit locally against a Base mainnet fork so life dust hits the
 * real FEE_WALLET address state. Lock / refuse / busy use MockERC20 (+ reentrant).
 *
 * Run:
 *   cd contracts && forge test --match-contract OfferCircuitFork --fork-url https://mainnet.base.org -vv
 */
contract OfferCircuitForkTest is Test {
    OfferCircuit circuit;
    MockERC20 food;

    address constant FEE_WALLET = 0x37Eb9b7ce0b51Fe12fBf092026e001918128580A;
    address constant LOCK_FOREVER = 0x000000000000000000000000000000000000dEaD;
    address offerer = address(0xA11CE);
    address blockToken = address(0xB10C);

    uint8 constant SCHEMA = 1;
    uint8 constant VER_LEN = 22;

    function setUp() public {
        // Require fork: chainid 8453 = Base mainnet
        require(block.chainid == 8453, "O4 requires --fork-url Base (8453)");
        circuit = new OfferCircuit();
        food = new MockERC20();
        vm.deal(offerer, 10 ether);
        food.mint(offerer, 1_000_000 ether);
    }

    function _pack(uint8[32] memory s) internal pure returns (bytes32 out) {
        for (uint256 i = 0; i < 32; i++) {
            out |= bytes32(uint256(s[i]) << (248 - i * 8));
        }
    }

    function _blank() internal pure returns (uint8[32] memory s) {
        s[24] = SCHEMA;
        s[31] = VER_LEN;
    }

    function _acceptSignals() internal pure returns (bytes32) {
        uint8[32] memory s = _blank();
        s[0] = 1;
        s[1] = 1; // score 5
        return _pack(s);
    }

    function _refuseSignals() internal pure returns (bytes32) {
        uint8[32] memory s = _blank();
        s[0] = 1; // score 3
        return _pack(s);
    }

    /// @dev Real FEE_WALLET on Base fork receives life dust (EOA / payable).
    function testFork_lifeDust_increasesFeeWalletBalance() public {
        uint256 before = FEE_WALLET.balance;
        bytes32 packed = _refuseSignals();

        vm.prank(offerer);
        circuit.offer{value: 0.001 ether}(blockToken, address(food), 0, keccak256("fork-dust"), packed);

        assertEq(FEE_WALLET.balance, before + 0.001 ether);
        assertEq(circuit.busy(), false);
        assertEq(circuit.currentOfferer(), address(0));
    }

    /// @dev Refuse: allowance remains; nothing pulled to dEaD.
    function testFork_refuse_leavesAllowance_noLock() public {
        bytes32 packed = _refuseSignals();
        uint256 deadBefore = food.balanceOf(LOCK_FOREVER);

        vm.startPrank(offerer);
        food.approve(address(circuit), 100 ether);
        assertEq(food.allowance(offerer, address(circuit)), 100 ether);
        circuit.offer(blockToken, address(food), 100 ether, keccak256("fork-refuse"), packed);
        vm.stopPrank();

        assertEq(food.allowance(offerer, address(circuit)), 100 ether, "allowance must remain on refuse");
        assertEq(food.balanceOf(LOCK_FOREVER), deadBefore, "no lock on refuse");
        assertEq(circuit.busy(), false);
    }

    /// @dev Accept: amount locked to dEaD; allowance consumed.
    function testFork_accept_locksToDead() public {
        bytes32 packed = _acceptSignals();

        vm.startPrank(offerer);
        food.approve(address(circuit), 50 ether);
        circuit.offer(blockToken, address(food), 50 ether, keccak256("fork-accept"), packed);
        vm.stopPrank();

        assertEq(food.balanceOf(LOCK_FOREVER), 50 ether);
        assertEq(food.allowance(offerer, address(circuit)), 0);
        assertEq(circuit.busy(), false);
    }

    /// @dev Accept + dust in one call: lock + FEE_WALLET delta.
    function testFork_accept_withDust_lockAndFee() public {
        bytes32 packed = _acceptSignals();
        uint256 feeBefore = FEE_WALLET.balance;

        vm.startPrank(offerer);
        food.approve(address(circuit), 25 ether);
        circuit.offer{value: 0.0005 ether}(
            blockToken, address(food), 25 ether, keccak256("fork-both"), packed
        );
        vm.stopPrank();

        assertEq(food.balanceOf(LOCK_FOREVER), 25 ether);
        assertEq(FEE_WALLET.balance, feeBefore + 0.0005 ether);
    }

    /// @dev Reentrant token trying offer() mid-transferFrom hits Busy().
    function testFork_reentry_busyBlocked() public {
        ReentrantFood evil = new ReentrantFood(circuit, blockToken);
        evil.mint(offerer, 100 ether);

        bytes32 packed = _acceptSignals();

        vm.startPrank(offerer);
        evil.approve(address(circuit), 10 ether);
        // Outer offer accepts → transferFrom → evil reenters offer → Busy
        vm.expectRevert(OfferCircuit.Busy.selector);
        circuit.offer(blockToken, address(evil), 10 ether, keccak256("fork-reentry"), packed);
        vm.stopPrank();

        // After revert, busy must be cleared by the LockFailed / Busy path…
        // Outer reverts Busy from inner call; outer's busy was true — but Busy is thrown
        // from *inner* offer while outer still holds busy=true, then outer's transferFrom
        // fails... Actually: outer sets busy=true, then decide=1, then transferFrom which
        // calls evil which calls offer → busy already true → Busy revert bubbles from
        // transferFrom → IERC20 returns false? No — transferFrom reverts Busy, so whole
        // outer offer reverts. State rolls back → busy false.
        assertEq(circuit.busy(), false);
        assertEq(evil.balanceOf(LOCK_FOREVER), 0);
    }

    /// @dev Sanity: FEE_WALLET constant on live-shaped fork matches app.
    function testFork_feeWalletConstant() public view {
        assertEq(circuit.FEE_WALLET(), FEE_WALLET);
        assertTrue(FEE_WALLET.balance >= 0); // readable on fork
    }
}

/// @dev ERC-20 that reenters OfferCircuit.offer during transferFrom.
contract ReentrantFood {
    OfferCircuit public immutable circuit;
    address public immutable blockToken;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(OfferCircuit c, address b) {
        circuit = c;
        blockToken = b;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        // Reenter with refuse-weight signals + schema markers
        uint8[32] memory s;
        s[24] = 1;
        s[31] = 22;
        s[0] = 1;
        bytes32 packed;
        for (uint256 i = 0; i < 32; i++) {
            packed |= bytes32(uint256(s[i]) << (248 - i * 8));
        }
        circuit.offer(blockToken, address(this), 0, keccak256("reenter"), packed);

        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}
