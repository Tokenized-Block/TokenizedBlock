// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {TBlockBloc24h} from "./TBlockBloc24h.sol";

/// @title TBlockBloc24hFactory — PROTOTYPE, FORK-PROVEN ONLY, NOT DEPLOYED (2026-10-02)
/// @notice NEW factory for the custom-ERC-20 cradle blocks (the B20 factory 0xB20f…0 cannot mint them).
///         Bound for life to ONE PoolManager and ONE 24h hook (immutables, no owner). The whole supply goes to the
///         caller (= seeder = block admin for the hook's `inscrire*`). Deterministic address per (creator, salt).
contract TBlockBloc24hFactory {
    event BlocCree(address indexed bloc, address indexed createur, string symbole, uint256 supply);

    address public immutable poolManager;
    address public immutable hook;
    mapping(address => bool) public estBloc;

    constructor(address pm, address hook_) {
        poolManager = pm;
        hook = hook_;
    }

    function creer(string calldata nom, string calldata symbole, string calldata uri, uint256 supply, bytes32 salt)
        external
        returns (address bloc)
    {
        bloc = address(
            new TBlockBloc24h{salt: keccak256(abi.encode(msg.sender, salt))}(nom, symbole, uri, supply, msg.sender, poolManager, hook)
        );
        estBloc[bloc] = true;
        emit BlocCree(bloc, msg.sender, symbole, supply);
    }
}
