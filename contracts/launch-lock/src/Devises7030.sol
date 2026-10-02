// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {V9Devises} from "./V9Devises.sol";

/// @notice The quote list of the 0.07 % / 0.03 % hook ("7030"): the V9 list (19, ETH implicit) + the 18 Coinbase
///         stocks added 2026-10-02 (feat/new-stocks-26-20261002-mesure-fork @ 0ea4661: real pool proven on fork;
///         GMEc, HTZc, PFEc, PMc left out — no healthy pool) = 37 + ETH. FIXED at construction:
///         no owner, no setter.
/// @dev Source of the 18: api.coinbase.com/v1/tokenized-stocks (issuer list), each address cross-checked against the
///      app's paires.js @ 0ea4661 and read on a Base fork (B20 precompile: code == 0xef, decimals 8, supply > 0).
///      WHY A FIXED LIST and not "any genuine Coinbase stock": every B20 attribute readable on chain (roles incl.
///      DEFAULT_ADMIN, policy IDs, name/symbol/decimals, contractURI, extraMetadata, variant byte) is chosen by
///      whoever calls B20Factory.createB20, and initCalls bypass role gates — a fake "NFLXc" can copy them all. The
///      only binding to the deployer is the address tail = keccak256(deployer, salt)[0:9] (72 bits): a
///      registrant-supplied salt proof is forgeable by a ~2^36 birthday search. No robust permissionless check exists.
library Devises7030 {
    address internal constant AMDc = 0xB2000000000000000000000d8Ce462E99ee7A47B;
    address internal constant ASTSc = 0xB200000000000000000000B1a29cF17A1819288a;
    address internal constant CAKEc = 0xb200000000000000000000f215E4C890CFb7176B;
    address internal constant DJTc = 0xb200000000000000000000428E3a3eebBb20692B;
    address internal constant DUOLc = 0xb200000000000000000000A613D12dEAfBBb1Db7;
    address internal constant LLYc = 0xB200000000000000000000f1a0F91e34892E4718;
    address internal constant MRNAc = 0xB200000000000000000000e215e9B76ecBA02468;
    address internal constant MRVLc = 0xB200000000000000000000eC3c4c7395Cc609813;
    address internal constant NFLXc = 0xb20000000000000000000058B8c947e44011dFE6;
    address internal constant NVAXc = 0xB200000000000000000000C597c476FCf9Aed3a8;
    address internal constant ORCLc = 0xb200000000000000000000347AFbA223D7B6b63C;
    address internal constant PTONc = 0xB2000000000000000000009272A491812842Aa84;
    address internal constant PYPLc = 0xb200000000000000000000450ad3abE5d4846c6E;
    address internal constant QUBTc = 0xb200000000000000000000CA425ab42e07C35bC3;
    address internal constant RBLXc = 0xB2000000000000000000005bd7AE89b9E6189Bb5;
    address internal constant RDDTc = 0xb20000000000000000000066242d4067724cB7A1;
    address internal constant TTWOc = 0xB200000000000000000000f720C26062Bc3067Da;
    address internal constant WENc = 0xB20000000000000000000044E3CD7a0E1028E57a;

    uint256 internal constant N = 37;

    function nouvelles() internal pure returns (address[18] memory n) {
        n = [AMDc, ASTSc, CAKEc, DJTc, DUOLc, LLYc, MRNAc, MRVLc, NFLXc, NVAXc, ORCLc, PTONc, PYPLc, QUBTc, RBLXc, RDDTc, TTWOc, WENc];
    }

    function liste() internal pure returns (address[] memory l) {
        address[] memory v9 = V9Devises.liste();
        address[18] memory n = nouvelles();
        l = new address[](N);
        for (uint256 i; i < v9.length; ++i) l[i] = v9[i];
        for (uint256 i; i < 18; ++i) l[v9.length + i] = n[i];
    }
}
