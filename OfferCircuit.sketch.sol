// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OfferCircuit — deploy-candidate sketch (NOT broadcast this tip)
/// @notice 32 recorded uint8 signals → integer 0 (refuse) | 1 (dinner served).
/// @dev Full 128 LIF brain stays OFFCHAIN (`cerveau.js`). This contract is NOT an LLM.
///
/// FEE_WALLET: 0x37eb9b7ce0b51fe12fbf092026e001918128580a
/// CIRCUIT:    keccak256("tblock-offer-circuit/1")  ↔  brain-tasks.js CIRCUIT_VERSION
/// RECEIPT:    tblock-offer-receipt/1 (offchain evidence + onchain Decision event)
///
/// ALIGNMENT WITH browser stub (`brain-tasks.js` decideOffre / signaux32DepuisSnapshot):
///   - same hard stops: MORT (s[5]), unread+no-life (s[4]&&!s[0]), slot busy (s[25])
///   - same toy weights + threshold 5 (engrave / freeze before mainnet)
///   - packing: signalsPacked = 32 bytes, signal i = byte i (big-endian left → s[0])
///
/// NEXT SHIP STEPS (no smoke / no broadcast until Raksha greenlights):
///   1. Move this file into a Foundry package (sibling of tb-fee-hook / tb-create-router).
///   2. Forge unit tests: pack/unpack ↔ JS vectors; decide() matches decideOffre fixtures.
///   3. Fork Base: offer refuse (0) leaves allowance; accept (1) locks to LOCK_FOREVER;
///      life dust msg.value → FEE_WALLET; busy reentry blocked.
///   4. Wire app: brain-tasks offer_food Prepare → approve + offer(...) calldata;
///      fail-closed if FEE_WALLET absent when lifeDustWei>0; tip bump only after bug-sweep.
///   5. Update brain-agent.json deploy_status → address + circuit_version when live.
///   6. Optional later: OL-style ownerless locker instead of dead address (Base-adapted).

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract OfferCircuitSketch {
    address public constant FEE_WALLET = 0x37eb9b7ce0b51fe12fbf092026e001918128580a;
    /// @dev Same forever-lock idea as Launch LP dead-owner (OL locker adapted to Base/TB).
    address public constant LOCK_FOREVER = 0x000000000000000000000000000000000000dEaD;
    bytes32 public constant CIRCUIT = keccak256("tblock-offer-circuit/1");
    /// @dev Must match brain-tasks.js decideOffre threshold until weights are engraved.
    uint8 public constant THRESHOLD = 5;

    bool public busy;
    address public currentOfferer;

    event Decision(
        address indexed blockToken,
        address indexed offerToken,
        address indexed offerer,
        uint256 amount,
        uint8 decision,
        bytes32 evidenceHash,
        bytes32 signalsPacked
    );
    event LifeDust(address indexed from, uint256 amount);

    error Busy();
    error BadSignals();
    error LockFailed();
    error DustFailed();

    /// @notice Unpack 32 uint8 signals from a bytes32 (byte 0 = s[0] … byte 31 = s[31]).
    function unpack(bytes32 packed) public pure returns (uint8[32] memory s) {
        for (uint256 i = 0; i < 32; i++) {
            s[i] = uint8(bytes1(packed << (i * 8)));
        }
    }

    /// @notice Integer circuit — mirrors brain-tasks.js decideOffre (toy weights).
    /// @dev Returns only 0 or 1. Not the 128 LIF brain.
    function decide(bytes32 signalsPacked) public pure returns (uint8 decision, uint16 score) {
        uint8[32] memory s = unpack(signalsPacked);

        // Hard stops (same as JS)
        if (s[5] == 1) return (0, 0); // MORT
        if (s[4] == 1 && s[0] == 0) return (0, 0); // market unread + no life read
        if (s[25] == 1) return (0, 0); // offer slot busy

        uint16 sc = 0;
        sc += uint16(s[0]) * 3;
        sc += uint16(s[1]) * 2;
        sc += uint16(s[2]) * 2;
        sc += uint16(s[11]) * 2;
        sc += uint16(s[12]) * 2;
        if (s[8] > 0) sc += 1;
        if (s[9] > 0) sc += 1;
        sc += uint16(s[16]);
        if (s[6] > 0) {
            unchecked {
                sc = sc >= 2 ? sc - 2 : 0;
            }
        }
        if (s[13] == 1 && sc > 0) {
            unchecked {
                sc -= 1;
            }
        }

        decision = sc >= THRESHOLD ? 1 : 0;
        score = sc;
    }

    /// @notice One offering at a time. Accept (1) pulls `amount` of `offerToken` → LOCK_FOREVER.
    /// @param blockToken  Block being offered to (indexed for receipts).
    /// @param offerToken  ERC-20 food token.
    /// @param amount      Wei of offerToken to lock on accept (0 allowed for signal-only probe).
    /// @param evidenceHash keccak256(canonical offchain evidence JSON).
    /// @param signalsPacked 32×uint8 recorded facts (browser packs from snapshot).
    /// @dev Optional life dust: msg.value → FEE_WALLET (gas-only path when msg.value==0).
    function offer(
        address blockToken,
        address offerToken,
        uint256 amount,
        bytes32 evidenceHash,
        bytes32 signalsPacked
    ) external payable {
        if (busy) revert Busy();
        // Refuse all-zero packed as "forgot to pack" — at least schema marker s[24] or version s[31]
        // should be set by honest packers (brain-tasks sets s[24]=1, s[31]=len).
        uint8[32] memory peek = unpack(signalsPacked);
        if (peek[24] == 0 && peek[31] == 0) revert BadSignals();

        busy = true;
        currentOfferer = msg.sender;

        (uint8 d, ) = decide(signalsPacked);
        emit Decision(blockToken, offerToken, msg.sender, amount, d, evidenceHash, signalsPacked);

        if (d == 1 && amount > 0) {
            // Pull-payment: offerer must have approved this contract beforehand.
            bool ok = IERC20(offerToken).transferFrom(msg.sender, LOCK_FOREVER, amount);
            if (!ok) {
                busy = false;
                currentOfferer = address(0);
                revert LockFailed();
            }
        }

        if (msg.value > 0) {
            (bool sent, ) = FEE_WALLET.call{value: msg.value}("");
            if (!sent) {
                busy = false;
                currentOfferer = address(0);
                revert DustFailed();
            }
            emit LifeDust(msg.sender, msg.value);
        }

        busy = false;
        currentOfferer = address(0);
    }

    /// @dev Receive blocked — life dust only via offer(...).
    receive() external payable {
        revert();
    }
}
