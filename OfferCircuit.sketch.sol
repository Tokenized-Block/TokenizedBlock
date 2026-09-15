// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev MOVED (O1 2026-09-15): deploy-candidate lives at
///      `contracts/src/OfferCircuit.sol` (Foundry package under this app).
///      Unit tests: `contracts/test/OfferCircuit.t.sol`
///      Run: `cd contracts && forge test -vv`
///      NOT broadcast. FEE_WALLET → Base smart wallet a6cf…f5d4 (tip 2220).
///      See /workspace/DIG-OFFERCIRCUIT-O123-2026-09-15.md
contract OfferCircuitSketchMoved {
    function movedTo() external pure returns (string memory) {
        return "contracts/src/OfferCircuit.sol";
    }
}
