// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockLikes - "+1" a block by burning TBLOCK (TokenizedBlock, Phil 2026-11-10).
/// @notice like(block, n) takes n * LIKE_PRICE TBLOCK from the caller and sends it to 0x...dEaD (TBLOCK has no burn():
///         the dead address is where it leaves circulation for good). The block's +1 counter grows by n.
///         Each like is also RECORDED as play: how much TBLOCK each address burned in each epoch, the epoch total, and the
///         biggest contributor of the epoch. A rewards contract (the community vault) reads these to pay players by a fixed
///         rule; this contract itself pays nobody and holds nothing.
///
/// RULES (all immutable, no owner, no admin, no upgrade):
///   - block must be a B20 address (top 10 bytes 0xb2000000000000000000). The counter is per block address, nothing more.
///   - 1 <= n <= MAX_LIKES_PER_CALL.
///   - after paying, the caller must still hold at least MIN_HOLD TBLOCK (the "hold to play" rule). This is read at the call:
///     it proves the balance at that block, not for how long it was held.
///   - exactly n * LIKE_PRICE must arrive at 0x...dEaD, measured by the dead address balance before/after, or it reverts.
///   - epochs are EPOCH seconds long from GENESIS; epoch e = [GENESIS + e*EPOCH, GENESIS + (e+1)*EPOCH).
///   - top contributor of an epoch: the address with the largest burned amount in it; on a tie, the one that reached it first.
contract BlockLikes {
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant B20_PREFIX = 0xb2000000000000000000; // top 10 bytes of a B20 address
    uint256 public constant MAX_LIKES_PER_CALL = 1000;

    address public immutable TBLOCK;
    uint256 public immutable LIKE_PRICE; // raw TBLOCK units per +1
    uint256 public immutable MIN_HOLD;   // raw TBLOCK units the caller must still hold after paying
    uint64 public immutable GENESIS;
    uint64 public immutable EPOCH;

    mapping(address => uint256) public likesOf;                         // block => +1 count, all time
    mapping(uint256 => mapping(address => uint256)) public spentIn;      // epoch => liker => TBLOCK burned
    mapping(uint256 => uint256) public totalSpentIn;                     // epoch => TBLOCK burned by everyone
    mapping(uint256 => address) public topOf;                            // epoch => biggest contributor
    uint256 public totalLikes;
    uint256 public totalBurned;
    uint256 private _lock = 1;

    event Liked(uint256 indexed epoch, address indexed blockToken, address indexed liker, uint256 likes, uint256 burned);

    error BadParams();
    error NotABlock();
    error BadCount();
    error PaymentShort(uint256 expected, uint256 arrived);
    error HoldTooLow(uint256 balance, uint256 minHold);
    error TransferFailed();
    error Locked();

    modifier lock() {
        if (_lock != 1) revert Locked();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address tblock, uint256 likePrice, uint256 minHold, uint64 genesis, uint64 epoch) {
        if (tblock == address(0) || likePrice == 0 || epoch == 0 || genesis == 0) revert BadParams();
        if (likePrice > type(uint256).max / MAX_LIKES_PER_CALL) revert BadParams();
        TBLOCK = tblock; LIKE_PRICE = likePrice; MIN_HOLD = minHold; GENESIS = genesis; EPOCH = epoch;
    }

    /// @notice epoch of timestamp t (0 before GENESIS: likes sent before it count in epoch 0).
    function epochAt(uint256 t) public view returns (uint256) {
        return t < GENESIS ? 0 : (t - GENESIS) / EPOCH;
    }
    function currentEpoch() public view returns (uint256) { return epochAt(block.timestamp); }
    /// @notice end (exclusive) of epoch e: rewards for e can only be computed once block.timestamp >= epochEnd(e).
    function epochEnd(uint256 e) public view returns (uint256) { return uint256(GENESIS) + (e + 1) * uint256(EPOCH); }

    /// @notice +1 `blockToken` n times; pays n * LIKE_PRICE TBLOCK to 0x...dEaD.
    function like(address blockToken, uint256 n) external lock returns (uint256 burned) {
        if (uint256(uint160(blockToken)) >> 80 != B20_PREFIX) revert NotABlock();
        if (n == 0 || n > MAX_LIKES_PER_CALL) revert BadCount();
        burned = n * LIKE_PRICE;

        uint256 deadBefore = _bal(DEAD);
        (bool ok, bytes memory r) = TBLOCK.call(abi.encodeWithSelector(0x23b872dd, msg.sender, DEAD, burned)); // transferFrom
        if (!ok || (r.length != 0 && (r.length < 32 || !abi.decode(r, (bool))))) revert TransferFailed();
        uint256 arrived = _bal(DEAD) - deadBefore;
        if (arrived != burned) revert PaymentShort(burned, arrived);

        uint256 left = _bal(msg.sender);
        if (left < MIN_HOLD) revert HoldTooLow(left, MIN_HOLD);

        uint256 e = currentEpoch();
        likesOf[blockToken] += n;
        totalLikes += n;
        totalBurned += burned;
        uint256 mine = spentIn[e][msg.sender] + burned;
        spentIn[e][msg.sender] = mine;
        totalSpentIn[e] += burned;
        address top = topOf[e];
        if (top != msg.sender && mine > spentIn[e][top]) topOf[e] = msg.sender;
        emit Liked(e, blockToken, msg.sender, n, burned);
    }

    function _bal(address a) private view returns (uint256) {
        (bool ok, bytes memory r) = TBLOCK.staticcall(abi.encodeWithSelector(0x70a08231, a));
        if (!ok || r.length < 32) revert TransferFailed();
        return abi.decode(r, (uint256));
    }
}
