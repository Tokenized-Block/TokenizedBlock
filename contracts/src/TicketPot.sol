// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TicketPot -- the USDC day pots of the ticket draw, paid PRO RATA to every ticket holder of the day (Phil, 2026-10-18 09:00 :
///        « tous les fees generes par les users seront redistribues, calcules sur la journee, pour ceux qui possedent un ticket … non
///        fongible, seul moyen de prouver l acces a la pool de reward … comme le roll mais seulement 1 jour » ; lead 2026-10-18 after
///        pump.fun's live « Holder Rewards » : fees go to a distribution pot and are paid pro rata to the holders above a threshold).
/// @notice ONE pot per UTC day (day = timestamp / 86400). Anyone funds a day (the fee wallet funds the day's community share once the day
///         is over). close(day) FREEZES the pot (potAtClose) : after it, fund(day) is refused -- what the holders share is final before any
///         attestation is issued. The server NEVER moves funds : it holds the day's ticket list (volume >= $10 verified on chain, or a skin
///         pass), reads potAtClose(day) and SIGNS, for each holder, an EIP-712 attestation (day, wallet, ticket, amount, deadline) with
///         amount = floor(potAtClose / nTickets). Anyone sends claim() : `amount` (<= what is left of the day pot) goes to `wallet`, once
///         per wallet per day. The ticket is the 20-byte id the app derives (app.html adresseTicket : SHA-256(wallet|'JYYYY-MM-DD'), first
///         20 bytes) : graved in the Claimed event and in ticketOf(day, wallet) as the non-fungible proof ; the verifier vouches for it.
/// @dev ⛔ WHAT IS GRAVED HERE, AND WHY :
///   - NO OWNER WITHDRAWAL, EVER. USDC leaves only through claim() with a valid attestation. The owner can close a day early, pause claims,
///     propose a new verifier or guardian (48 h public notice, 72 h to accept), hand ownership over : nothing else.
///   - a day is CLOSED by anyone FUNDING_DELAY (12 h) after its end, or by the owner as soon as it is over (right after funding its share).
///     No claim before the close : the shares are computed on a frozen pot. A fund sent to a closed day is refused : fund today instead.
///   - sum of the claims of a day <= potAtClose (dayPot is what is LEFT) ; one claim per wallet per day.
///   - what is left GRACE (7 days) after the day's end (dust of the division, holders who never claimed, a day never closed) rolls into
///     the CURRENT day's pot, by anyone (rollover) ; a signature cannot outlive the grace (deadline <= claimableUntil(day)), so claim and
///     rollover never overlap : claim up to the last second of the grace, rollover from the second after. The current day is never closed
///     (close needs the day over), so a rollover never changes a frozen pot.
///   - a future day cannot be funded.
///   - verifier/guardian changes copy BlockMissionsV3 : PROPOSED (event) then ACCEPTED after ADMIN_DELAY, void after PROPOSAL_TTL.
///     The guardian may pause claims ; it cannot lift the owner's pause ; the owner lifts a guardian pause ADMIN_DELAY after it, or
///     revokes the guardian at once (taking a pause power away redirects no value).
///   - reentrancy lock ; SafeERC20-style calls (the token must succeed AND return empty or true) ; USDC on Base returns true.
///   - pots are COUNTED (fund/claim/rollover), not balanceOf : a direct transfer is in no pot until absorb() puts the surplus into
///     TODAY's pot (by anyone ; never to a person). Invariant : totalPots == USDC.balanceOf(this) minus unabsorbed surplus.
/// ⚠ TRUST POINT : the verifier key (set by Phil in the server environment ; a stolen key signs any wallet for the closed pots, within
///   each day pot). Its rotation is public 48 h ahead.
contract TicketPot {
    uint64 public constant DAY = 86400;
    uint64 public constant GRACE = 7 days;
    uint64 public constant FUNDING_DELAY = 12 hours;
    uint64 public constant ADMIN_DELAY = 48 hours;
    uint64 public constant PROPOSAL_TTL = 72 hours;
    bytes32 public constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant CLAIM_TYPEHASH = keccak256("Claim(uint32 day,address wallet,bytes20 ticket,uint256 amount,uint64 deadline)");

    address public immutable USDC;
    address public owner;
    address public pendingOwner;
    address public verifier;
    address public guardian;
    struct Proposal { address value; uint64 readyAt; }
    Proposal public nextVerifier;
    Proposal public nextGuardian;
    bool public paused;
    uint64 public guardianPausedAt; // 0 = the current pause (if any) was set by the owner

    /// @notice what is LEFT in a day's pot (funded, minus claims, minus rollover)
    mapping(uint32 => uint256) public dayPot;
    /// @notice the pot frozen by close(day) : the server divides THIS by the number of tickets
    mapping(uint32 => uint256) public potAtClose;
    mapping(uint32 => bool) public closed;
    /// @notice what has been paid to holders out of a day's pot (sum of its claims) : paid + dayPot == potAtClose until a rollover
    mapping(uint32 => uint256) public paid;
    /// @notice the ticket a wallet claimed with on a day (bytes20(0) = not claimed) : the non-fungible proof, graved once
    mapping(uint32 => mapping(address => bytes20)) public ticketOf;
    uint256 public totalPots;
    uint256 private _lock = 1;

    event Funded(uint32 indexed day, address indexed from, uint256 amount, uint256 potAfter);
    event Closed(uint32 indexed day, uint256 pot, address by);
    event Claimed(uint32 indexed day, address indexed wallet, bytes20 ticket, uint256 amount, uint256 potLeft, address by);
    event RolledOver(uint32 indexed fromDay, uint32 indexed toDay, uint256 amount, uint256 potAfter);
    event Proposed(bytes32 indexed what, address value, uint64 readyAt);
    event Accepted(bytes32 indexed what, address value);
    event GuardianRevoked(address indexed former);
    event PausedSet(bool paused, address by);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    error BadAddress(); error BadParams(); error ZeroAmount(); error FutureDay(); error DayNotOver(); error DayClosed(); error NotClosed();
    error TooEarly(); error SignatureExpired(); error DeadlineTooFar(); error AlreadyClaimed(); error AmountOverPot(); error BadProof();
    error GraceNotOver(); error NothingToRoll(); error NothingToAbsorb(); error NotOwner(); error NotReady(); error Paused(); error NotPaused();
    error TransferFailed(); error Reentrancy();

    modifier nonReentrant() { if (_lock != 1) revert Reentrancy(); _lock = 2; _; _lock = 1; }
    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    constructor(address usdc, address verifier_, address guardian_) {
        if (usdc == address(0) || usdc.code.length == 0 || verifier_ == address(0)) revert BadAddress();
        USDC = usdc;
        verifier = verifier_;
        guardian = guardian_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /* ================================================================ days */

    function today() public view returns (uint32) { return uint32(block.timestamp / DAY); }
    /// @notice the first second AFTER the day (its end)
    function dayEnd(uint32 day) public pure returns (uint64) { return (uint64(day) + 1) * DAY; }
    /// @notice the LAST second a claim of this day can pass (deadline cap) ; rollover opens the second after
    function claimableUntil(uint32 day) public pure returns (uint64) { return dayEnd(day) + GRACE; }
    function claimed(uint32 day, address wallet) public view returns (bool) { return ticketOf[day][wallet] != bytes20(0); }

    /* ================================================================ fund / close */

    /// @notice anyone adds USDC to a day's pot (today or a past day not yet closed : the community share of a day's fees). No way back.
    function fund(uint32 day, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (day > today()) revert FutureDay();
        if (closed[day]) revert DayClosed();
        dayPot[day] += amount;
        totalPots += amount;
        _pull(msg.sender, amount);
        emit Funded(day, msg.sender, amount, dayPot[day]);
    }

    /// @notice FREEZES a day's pot : no more fund(day), claims open. The owner once the day is over (right after funding its share) ;
    ///         anyone FUNDING_DELAY after the day's end (a day nobody closes still pays its holders).
    function close(uint32 day) external {
        if (block.timestamp < dayEnd(day)) revert DayNotOver();
        if (closed[day]) revert DayClosed();
        if (msg.sender != owner && block.timestamp < dayEnd(day) + FUNDING_DELAY) revert TooEarly();
        closed[day] = true;
        potAtClose[day] = dayPot[day];
        emit Closed(day, dayPot[day], msg.sender);
    }

    /// @notice USDC that reached the contract outside fund() (a direct transfer) goes to TODAY's pot. Anyone ; never to a person.
    function absorb() external nonReentrant {
        (bool ok, bytes memory ret) = USDC.staticcall(abi.encodeWithSelector(0x70a08231, address(this)));
        if (!ok || ret.length < 32) revert TransferFailed();
        uint256 b = abi.decode(ret, (uint256));
        if (b <= totalPots) revert NothingToAbsorb();
        uint256 a = b - totalPots;
        uint32 d = today();
        dayPot[d] += a;
        totalPots += a;
        emit Funded(d, address(0), a, dayPot[d]);
    }

    /* ================================================================ claim / rollover */

    /// @notice pays `amount` of day `day`'s pot to `wallet`, once per wallet per day, on the verifier's EIP-712 attestation over
    ///         (day, wallet, ticket, amount, deadline). Callable by anyone (the holder from the app, or a keeper) : the money goes to
    ///         `wallet`, never to the caller. Refused : paused, day not closed, signature past its deadline, deadline beyond the grace,
    ///         wallet already paid for that day, amount 0 or above what is left of the day pot, signature not the verifier's.
    function claim(uint32 day, address wallet, bytes20 ticket, uint256 amount, uint64 deadline, bytes calldata sig) external nonReentrant {
        if (paused) revert Paused();
        if (!closed[day]) revert NotClosed();
        if (block.timestamp > deadline) revert SignatureExpired();
        if (deadline > claimableUntil(day)) revert DeadlineTooFar();
        if (ticketOf[day][wallet] != bytes20(0)) revert AlreadyClaimed();
        if (wallet == address(0) || ticket == bytes20(0) || amount == 0) revert BadParams();
        if (amount > dayPot[day]) revert AmountOverPot();
        if (_recover(claimDigest(day, wallet, ticket, amount, deadline), sig) != verifier) revert BadProof();
        ticketOf[day][wallet] = ticket;
        dayPot[day] -= amount;
        paid[day] += amount;
        totalPots -= amount;
        _push(wallet, amount);
        emit Claimed(day, wallet, ticket, amount, dayPot[day], msg.sender);
    }

    /// @notice GRACE after a day's end, what is LEFT in its pot (dust, unclaimed shares, a day never closed) rolls into TODAY's pot
    ///         (never a closed one). Anyone.
    function rollover(uint32 day) external nonReentrant {
        if (block.timestamp <= claimableUntil(day)) revert GraceNotOver();
        uint256 a = dayPot[day];
        if (a == 0) revert NothingToRoll();
        uint32 d = today();
        dayPot[day] = 0;
        dayPot[d] += a;
        emit RolledOver(day, d, a, dayPot[d]);
    }

    /* ================================================================ EIP-712 */

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("TicketPot"), keccak256("1"), block.chainid, address(this)));
    }

    /// @notice the digest the verifier signs : ticketpot-plan.js digestClaim must give the same bytes (test-ticketpot-plan)
    function claimDigest(uint32 day, address wallet, bytes20 ticket, uint256 amount, uint64 deadline) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), keccak256(abi.encode(CLAIM_TYPEHASH, day, wallet, ticket, amount, deadline))));
    }

    /* ================================================================ admin : everything that can redirect value waits ADMIN_DELAY in public */

    function proposeVerifier(address v) external onlyOwner { if (v == address(0)) revert BadAddress(); nextVerifier = _propose("verifier", v); }
    function acceptVerifier() external onlyOwner { verifier = _accept(nextVerifier, "verifier"); delete nextVerifier; }
    function proposeGuardian(address g) external onlyOwner { if (g == address(0)) revert BadAddress(); nextGuardian = _propose("guardian", g); }
    function acceptGuardian() external onlyOwner { guardian = _accept(nextGuardian, "guardian"); delete nextGuardian; }
    /// @notice the owner REMOVES the guardian at once (a pause power taken away redirects no value) ; a guardian pause still waits ADMIN_DELAY
    function revokeGuardian() external onlyOwner { emit GuardianRevoked(guardian); guardian = address(0); delete nextGuardian; }

    function _propose(bytes32 what, address v) private returns (Proposal memory p) {
        p = Proposal(v, uint64(block.timestamp + ADMIN_DELAY));
        emit Proposed(what, v, p.readyAt);
    }

    function _accept(Proposal memory p, bytes32 what) private returns (address) {
        if (p.readyAt == 0 || block.timestamp < p.readyAt || block.timestamp > uint256(p.readyAt) + PROPOSAL_TTL) revert NotReady();
        emit Accepted(what, p.value);
        return p.value;
    }

    /// @notice pause claims : owner or guardian. Unpause : the guardian ONLY a pause it set ; the owner his own at once, a guardian pause
    ///         ADMIN_DELAY after it. fund(), close(), absorb() and rollover() are never paused : nothing there goes to a person.
    function setPaused(bool p) external {
        bool g = msg.sender == guardian && guardian != address(0);
        if (msg.sender != owner && !g) revert NotOwner();
        if (p) {
            if (paused) revert NotReady();
            paused = true;
            guardianPausedAt = g ? uint64(block.timestamp) : 0;
        } else {
            if (!paused) revert NotPaused();
            if (g && guardianPausedAt == 0) revert NotOwner();
            if (!g && guardianPausedAt != 0 && block.timestamp < guardianPausedAt + ADMIN_DELAY) revert NotReady();
            paused = false;
            guardianPausedAt = 0;
        }
        emit PausedSet(p, msg.sender);
    }

    function transferOwnership(address to) external onlyOwner { if (to == address(0)) revert BadAddress(); pendingOwner = to; emit OwnershipTransferStarted(owner, to); }
    function acceptOwnership() external { if (msg.sender != pendingOwner) revert NotOwner(); emit OwnershipTransferred(owner, msg.sender); owner = msg.sender; pendingOwner = address(0); }

    /* ================================================================ internals */

    /// @dev 65 bytes, s <= n/2 (EIP-2) ; v outside {27, 28} already recovers to address(0) in ecrecover, which is never the verifier
    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(digest, v, r, s);
    }

    /// @dev transferFrom, SafeERC20-style : the call must succeed AND return empty or `true`
    function _pull(address from, uint256 amount) private {
        (bool ok, bytes memory ret) = USDC.call(abi.encodeWithSelector(0x23b872dd, from, address(this), amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _push(address to, uint256 amount) private {
        (bool ok, bytes memory ret) = USDC.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
