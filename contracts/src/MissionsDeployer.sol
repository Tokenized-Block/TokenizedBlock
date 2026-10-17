// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BlockMissionsV3} from "./BlockMissionsV3.sol";
import {RailSellToUsdcV4} from "./rails/RailSellToUsdcV4.sol";

/// @title MissionsDeployer — the rail and BlockMissionsV3 in ONE transaction, bound to each other by construction.
/// @notice Phil 2026-10-17 (confirmed in chat): a fixed rail UNIT -> USDC, so the dev's 1.4 % of a reward paid in UNIT reaches the dev
///         wallet in USDC instead of the reserve. The rail and V3 point at each other through IMMUTABLES (V3.RAIL, rail.MISSIONS).
///         Grok's first scheme predicted V3's address from the SIGNER's nonce across two transactions: anything sent in between broke the
///         binding (it failed closed, but both contracts had to be redeployed). Here the nonces are THIS contract's own: a fresh contract
///         starts at nonce 1, so rail = CREATE(this, 1), bound to CREATE(this, 2) = V3. Nothing can come in between.
///         Ownership of V3 is OFFERED to the signer (two-step): the signer calls acceptOwnership(). Until then the owner is this contract,
///         which has no function at all — nothing can be done in its name. The rail's OPERATOR (who arms a sale) is the signer, immutable.
contract MissionsDeployer {
    struct V3Args {
        address hook; address poolManager; address devWallet; address communityReserve; address usdc; address verifier; address guardian;
    }

    BlockMissionsV3 public immutable missions;
    RailSellToUsdcV4 public immutable rail;

    event Deployed(address indexed missions, address indexed rail, address indexed owner);
    error Unbound();

    constructor(
        V3Args memory a,
        address[] memory devDirect,
        address[] memory routeTokens,
        uint8[] memory hopCount,
        RailSellToUsdcV4.Hop[] memory hops
    ) {
        address futur = _createAddress(address(this), 2);
        RailSellToUsdcV4 r = new RailSellToUsdcV4(
            RailSellToUsdcV4.Config(a.poolManager, a.usdc, a.devWallet, futur, msg.sender), routeTokens, hopCount, hops
        );
        BlockMissionsV3 m = _missions(a, address(r), devDirect);
        if (address(m) != futur || m.RAIL() != address(r) || r.MISSIONS() != address(m)) revert Unbound();
        m.transferOwnership(msg.sender);
        missions = m;
        rail = r;
        emit Deployed(address(m), address(r), msg.sender);
    }

    function _missions(V3Args memory a, address r, address[] memory devDirect) private returns (BlockMissionsV3) {
        return new BlockMissionsV3(a.hook, a.poolManager, a.devWallet, a.communityReserve, a.usdc, a.verifier, a.guardian, r, devDirect);
    }

    /// @dev CREATE address for nonce 1..127: keccak256(rlp([deployer, nonce]))[12:] = keccak256(0xd6 0x94 deployer nonce).
    function _createAddress(address d, uint256 nonce) private pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), d, bytes1(uint8(nonce)))))));
    }
}
