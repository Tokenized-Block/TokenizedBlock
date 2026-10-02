// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

interface IHook24h {
    function consommerSortie(uint256 m) external returns (uint256 pris);
    function consommerEntree(uint256 m) external returns (uint256 vente, uint256 ajout);
}

/// @title TBlockBloc24h — PROTOTYPE, FORK-PROVEN ONLY, NOT DEPLOYED (2026-10-02, branch feat/launch-lock-24h)
/// @notice The "cradle" block: a PLAIN ERC-20 (NOT a B20 — B20 blocks are Rust precompiles whose PolicyRegistry
///         only knows static membership lists, so "sell <= bought" cannot be expressed on them; see the report).
///         Zero 1's Block24hToken (strict design (ii)), with the window armed at BIRTH by the hook:
///   · the 24 h window starts when the bound hook initializes the block's FIRST pool (`armer`, once);
///     before birth the block is restricted too (only the seeder's birth seed can enter our pool), with a
///     7-day safety valve if it is never born (`SOUPAPE`), so tokens can never be frozen forever;
///   · credit is created ONLY when the PoolManager pays x the proceeds of a swap on OUR hooked pools in this tx
///     (the hook's transient net, consumed) — never by any other inflow;
///   · every outgoing transfer of a non-PoolManager holder must be covered by its credit, and the credit MOVES
///     with the tokens — a transfer never creates credit, unbacked tokens cannot move;
///   · an inflow to the PoolManager must pay a swap or a liquidity add on OUR pools in this tx, else it reverts
///     (hookless / foreign v4 pools are unusable for the block during the window);
///   · exemptions: the seeder's liquidity add on our pool before the first credited payout (the birth seed),
///     and a burn to the dead address.
///   After `restrictionsEndAt()` every check is skipped (plain ERC-20) — automatic, no keeper, no tx needed.
contract TBlockBloc24h {
    error CreditInsuffisant(address qui, uint256 credit, uint256 montant);
    error PasNotrePool(uint256 montant, uint256 couvert);
    error Solde();
    error Allocation();
    error PasLeHook();

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Arme(uint256 naissance, uint256 fin);

    address public constant MORT = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant DUREE = 24 hours;
    uint256 public constant SOUPAPE = 7 days;

    string public name;
    string public symbol;
    string public contractURI;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public immutable poolManager;
    IHook24h public immutable hook;
    address public immutable seeder;
    address public immutable factory;
    uint256 public immutable creeLe;

    /// 0 until birth; then birth + 24 h
    uint256 internal _fin;
    mapping(address => uint256) internal _credit;
    /// true once the first credited payout happened (ends the seed exemption)
    bool public trading;

    constructor(string memory n, string memory s, string memory uri, uint256 supply, address seeder_, address pm, address hook_) {
        name = n;
        symbol = s;
        contractURI = uri;
        poolManager = pm;
        hook = IHook24h(hook_);
        seeder = seeder_;
        factory = msg.sender;
        creeLe = block.timestamp;
        totalSupply = supply;
        balanceOf[seeder_] = supply;
        emit Transfer(address(0), seeder_, supply);
    }

    // ── birth ─────────────────────────────────────────────────────────────────────────────────────
    /// @notice called by the bound hook from beforeInitialize: starts the 24 h cradle at the FIRST birth.
    function armer() external returns (uint256) {
        if (msg.sender != address(hook)) revert PasLeHook();
        uint256 f = _fin;
        if (f == 0) {
            f = block.timestamp + DUREE;
            _fin = f;
            emit Arme(block.timestamp, f);
        }
        return f;
    }

    function _actif() internal view returns (bool) {
        uint256 f = _fin;
        return f == 0 ? block.timestamp < creeLe + SOUPAPE : block.timestamp < f;
    }

    // ── scanner-facing views ─────────────────────────────────────────────────────────────────────
    /// @notice end of the cradle (0 = not born yet). After it the token is a plain ERC-20.
    function restrictionsEndAt() external view returns (uint256) {
        return _fin;
    }

    function restreint() external view returns (bool) {
        return _actif();
    }

    /// @notice how many blocks `a` may still send/sell right now (max after the window).
    function sellCredit(address a) external view returns (uint256) {
        return _actif() ? _credit[a] : type(uint256).max;
    }

    /// @dev V9's registration check `hasRole(DEFAULT_ADMIN, msg.sender)`: the seeder (creator) is the block admin.
    function hasRole(bytes32 role, address a) external view returns (bool) {
        return role == bytes32(0) && a == seeder;
    }

    // ── ERC-20 ───────────────────────────────────────────────────────────────────────────────────
    function approve(address sp, uint256 v) external returns (bool) {
        allowance[msg.sender][sp] = v;
        emit Approval(msg.sender, sp, v);
        return true;
    }

    function transfer(address to, uint256 v) external returns (bool) {
        _move(msg.sender, to, v);
        return true;
    }

    function transferFrom(address from, address to, uint256 v) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < v) revert Allocation();
            allowance[from][msg.sender] = a - v;
        }
        _move(from, to, v);
        return true;
    }

    function _move(address from, address to, uint256 v) internal {
        uint256 b = balanceOf[from];
        if (b < v) revert Solde();
        unchecked {
            balanceOf[from] = b - v;
        }
        balanceOf[to] += v;
        if (_actif()) _regle(from, to, v, b - v);
        emit Transfer(from, to, v);
    }

    function _regle(address from, address to, uint256 v, uint256 resteFrom) internal {
        address pm = poolManager;
        if (from == pm) {
            // payout: credit ONLY what our hooked pools paid out in this tx; any other payout arrives unbacked
            uint256 c = hook.consommerSortie(v);
            if (c != 0) {
                _credit[to] += c;
                if (!trading) trading = true;
            }
            return;
        }
        if (to == pm) {
            (uint256 vente, uint256 ajout) = hook.consommerEntree(v);
            if (vente + ajout != v) revert PasNotrePool(v, vente + ajout);
            // the birth seed (seeder's liquidity add on OUR pool, before the first credited payout) is the only
            // unbacked inflow allowed; a sell is always debited, even the seeder's
            uint256 du = (from == seeder && !trading) ? vente : v;
            if (du != 0) _debiter(from, du);
            return;
        }
        if (to == MORT) {
            // burn: always allowed; unbacked tokens burn first, credit trimmed so credit <= balance holds
            if (_credit[from] > resteFrom) _credit[from] = resteFrom;
            return;
        }
        // peer-to-peer (wallets, routers, Safes, V2/V3-style pairs — indistinguishable here): must be backed,
        // and the credit moves with the tokens. A transfer never CREATES credit.
        _debiter(from, v);
        _credit[to] += v;
    }

    function _debiter(address qui, uint256 v) internal {
        uint256 c = _credit[qui];
        if (c < v) revert CreditInsuffisant(qui, c, v);
        unchecked {
            _credit[qui] = c - v;
        }
    }
}
