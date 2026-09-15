// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title OfferCircuit — deploy-candidate (NOT broadcast this tip)
/// @notice 32 recorded uint8 signals → integer 0 (refuse) | 1 (dinner served).
/// @dev Full 128 LIF brain stays OFFCHAIN (`cerveau.js`). This contract is NOT an LLM.
///
/// FEE_WALLET: 0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4 (app smart wallet · tip 2220; not broadcast)
/// CIRCUIT:    keccak256("tblock-offer-circuit/1")  ↔  brain-tasks.js CIRCUIT_VERSION
/// RECEIPT:    tblock-offer-receipt/1 (offchain evidence + onchain Decision event)
///
/// ALIGNMENT WITH browser stub (`brain-tasks.js` decideOffre / OFFER_TOY_V1):
///   - same hard stops: MORT (s[5]), unread+no-life (s[4]&&!s[0]), slot busy (s[25])
///   - CURRENT_TOY_V1 frozen 2026-09-15 (named weights below ↔ brain-tasks.js OFFER_TOY_V1)
///   - packing: signalsPacked = 32 bytes, signal i = byte i (big-endian left → s[0])
///   - circuit stays /1 (freeze only — no weight change → no /2 bump)
///
/// Moved from repo-root OfferCircuit.sketch.sol → contracts/src/OfferCircuit.sol (O1).
/// Dig: DIG-OFFERCIRCUIT-O56-2026-09-15.md · O5 freeze · NO broadcast.

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract OfferCircuit {
    address public constant FEE_WALLET = 0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4;
    /// @dev Same forever-lock idea as Launch LP dead-owner (OL locker adapted to Base/TB).
    address public constant LOCK_FOREVER = 0x000000000000000000000000000000000000dEaD;
    bytes32 public constant CIRCUIT = keccak256("tblock-offer-circuit/1");

    // --- CURRENT_TOY_V1 (frozen 2026-09-15) — must match brain-tasks.js OFFER_TOY_V1 ---
    /// @dev Lead autonomy freeze; Raksha may re-engrave later. Circuit version stays /1.
    string public constant TOY_ID = "CURRENT_TOY_V1";
    uint8 public constant THRESHOLD = 5; // OFFER_TOY_V1.THRESHOLD
    uint8 internal constant W_LIFE_READ = 3; // s[0]
    uint8 internal constant W_LIFE_GT0 = 2; // s[1]
    uint8 internal constant W_HOOKED = 2; // s[2]
    uint8 internal constant W_FOOD_LUE = 2; // s[11]
    uint8 internal constant W_LIVING_PHASE = 2; // s[12]
    uint8 internal constant W_GM_ANY = 1; // s[8] > 0
    uint8 internal constant W_MSG_ANY = 1; // s[9] > 0
    uint8 internal constant W_TB_FEE_HOOK = 1; // s[16]
    uint8 internal constant PEN_DORMANT = 2; // s[6] > 0
    uint8 internal constant PEN_INQUIET = 1; // s[13] == 1

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

    /// @notice Integer circuit — mirrors brain-tasks.js decideOffre (CURRENT_TOY_V1).
    /// @dev Returns only 0 or 1. Not the 128 LIF brain.
    function decide(bytes32 signalsPacked) public pure returns (uint8 decision, uint16 score) {
        uint8[32] memory s = unpack(signalsPacked);

        // Hard stops (same as JS)
        if (s[5] == 1) return (0, 0); // MORT
        if (s[4] == 1 && s[0] == 0) return (0, 0); // market unread + no life read
        if (s[25] == 1) return (0, 0); // offer slot busy

        // CURRENT_TOY_V1 named weights (↔ brain-tasks.js OFFER_TOY_V1)
        uint16 sc = 0;
        sc += uint16(s[0]) * W_LIFE_READ;
        sc += uint16(s[1]) * W_LIFE_GT0;
        sc += uint16(s[2]) * W_HOOKED;
        sc += uint16(s[11]) * W_FOOD_LUE;
        sc += uint16(s[12]) * W_LIVING_PHASE;
        if (s[8] > 0) sc += W_GM_ANY;
        if (s[9] > 0) sc += W_MSG_ANY;
        sc += uint16(s[16]) * W_TB_FEE_HOOK;
        // JS: score -= PEN_DORMANT when s[6]>0 — snapshot only sets 0|1
        if (s[6] > 0) {
            unchecked {
                sc = sc >= PEN_DORMANT ? sc - PEN_DORMANT : 0;
            }
        }
        // JS: score -= PEN_INQUIET when s[13]==1
        if (s[13] == 1 && sc >= PEN_INQUIET) {
            unchecked {
                sc -= PEN_INQUIET;
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
