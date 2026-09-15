// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// @title OfferCircuit — sketch only (NOT deployed this tip)
/// @notice 32 recorded signals → integer 0|1. Full 128 LIF brain stays OFFCHAIN.
/// @dev Fees / life dust → FEE_WALLET 0x37eb9b7ce0b51fe12fbf092026e001918128580a
///      Accept (1) may lock tokens forever to dead/locker. One offering at a time.
interface IERC20 { function transferFrom(address,address,uint256) external returns (bool); }
contract OfferCircuitSketch {
    address public constant FEE_WALLET = 0x37eb9b7ce0b51fe12fbf092026e001918128580a;
    address public constant LOCK_FOREVER = 0x000000000000000000000000000000000000dEaD;
    bytes32 public constant CIRCUIT = keccak256("tblock-offer-circuit/1");
    bool public busy;
    event Decision(address indexed blockToken, address indexed offerToken, uint256 amount, uint8 decision, bytes32 evidenceHash);
    function decide(bytes32 /*signalsPacked*/) public pure returns (uint8) {
        // Placeholder — real weights engraved; integer only. Returns 0 or 1.
        return 0;
    }
    function offer(address blockToken, address offerToken, uint256 amount, bytes32 evidenceHash, bytes32 signalsPacked) external {
        require(!busy, "one offering at a time");
        busy = true;
        uint8 d = decide(signalsPacked);
        emit Decision(blockToken, offerToken, amount, d, evidenceHash);
        if (d == 1) {
            // lock forever (adapt OL locker to Base)
            require(IERC20(offerToken).transferFrom(msg.sender, LOCK_FOREVER, amount), "lock");
        }
        // optional: life dust to FEE_WALLET via msg.value in a payable overload
        busy = false;
    }
}
