// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {V9Devises} from "./V9Devises.sol";

/// @notice The quote list of the 0.07 % / 0.03 % hook ("7030"): the V9 list (19, ETH implicit) + the 18 Coinbase
///         stocks added 2026-10-02 (0ea4661) + the 25 other stocks the issuer declares (2026-10-03) = 62 + ETH.
///         FIXED at construction: no owner, no setter.
/// @dev Source: api.coinbase.com/v1/tokenized-stocks (issuer list: 58 tokens on 2026-10-03; 33 were already among the 37,
///      the 4 others of the 37 are USDC, cbBTC, TOSHI, OUSD). Each of the 25 read on Base mainnet on 2026-10-03:
///      code == 0xef (B20 precompile), symbol() == the issuer's symbol, decimals 8. 5 are minted (GMEc 3011, HTZc 16949,
///      PFEc 182, PMc 27, SOUNc 843 units); 20 exist with supply 0 — admitted NOW because the list can never change:
///      once Coinbase mints them, blocks can be paired with them without a new hook.
///      Checksums computed from the read addresses (the issuer API's casing is not strict EIP-55 for 5 of them).
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

    // ── the 25 other stocks declared by the issuer (2026-10-03), read on chain the same day ──────────────────────────
    address internal constant AMCc = 0xB200000000000000000000CD7e6b8042cb7c2BB5;
    address internal constant AEOc = 0xB2000000000000000000006064f8EC027f042294;
    address internal constant BMNRc = 0xB200000000000000000000eA2df44A307CaB279C;
    address internal constant BIRDc = 0xB200000000000000000000535fE96f18204BFD96;
    address internal constant BYNDc = 0xB200000000000000000000801830b13b8E493423;
    address internal constant CIFRc = 0xB200000000000000000000690275843B6e246286;
    address internal constant CLSKc = 0xB200000000000000000000fa63cFFF5c794dbB95;
    address internal constant CRCLc = 0xB20000000000000000000019f6E7C675b73C2e4D;
    address internal constant CRWVc = 0xB200000000000000000000F111184A74720787E6;
    address internal constant GMEc = 0xb2000000000000000000007790ed6E48e06eD935;
    address internal constant HTZc = 0xb2000000000000000000002601C5C94F435da168;
    address internal constant HUTc = 0xb2000000000000000000006Ee1C139a723872e09;
    address internal constant KSSc = 0xB200000000000000000000105A1f43ff3605C5De;
    address internal constant LCIDc = 0xB20000000000000000000081050Ac3d4395Df527;
    address internal constant MARAc = 0xB200000000000000000000a310e034E09186Fb2d;
    address internal constant OPENc = 0xb200000000000000000000259694B27Bf052E7d7;
    address internal constant PFEc = 0xB20000000000000000000018FE7eC7d6DfeeB528;
    address internal constant PMc = 0xB2000000000000000000008FC2A8C23cf5937b66;
    address internal constant RIOTc = 0xb200000000000000000000bd0C7627b663c581A6;
    address internal constant SOUNc = 0xB2000000000000000000002137743D4a01Fe4e88;
    address internal constant USDEc = 0xB2000000000000000000009426B660396eBCf343;
    address internal constant VVVc = 0xb200000000000000000000FEC679b39992F67627;
    address internal constant WULFc = 0xb200000000000000000000432a1d2Bd864ACEc82;
    address internal constant WWc = 0xb20000000000000000000089221e238277d52515;
    address internal constant XYZc = 0xB20000000000000000000067C8C151f24E1c9924;

    uint256 internal constant N = 62;

    function nouvelles() internal pure returns (address[18] memory n) {
        n = [AMDc, ASTSc, CAKEc, DJTc, DUOLc, LLYc, MRNAc, MRVLc, NFLXc, NVAXc, ORCLc, PTONc, PYPLc, QUBTc, RBLXc, RDDTc, TTWOc, WENc];
    }

    /// @notice the 25 added on 2026-10-03 (5 minted, 20 created with supply 0).
    function emetteur25() internal pure returns (address[25] memory e) {
        e = [AMCc, AEOc, BMNRc, BIRDc, BYNDc, CIFRc, CLSKc, CRCLc, CRWVc, GMEc, HTZc, HUTc, KSSc, LCIDc, MARAc, OPENc,
            PFEc, PMc, RIOTc, SOUNc, USDEc, VVVc, WULFc, WWc, XYZc];
    }

    function liste() internal pure returns (address[] memory l) {
        address[] memory v9 = V9Devises.liste();
        address[18] memory n = nouvelles();
        address[25] memory e = emetteur25();
        l = new address[](N);
        for (uint256 i; i < v9.length; ++i) l[i] = v9[i];
        for (uint256 i; i < 18; ++i) l[v9.length + i] = n[i];
        for (uint256 i; i < 25; ++i) l[v9.length + 18 + i] = e[i];
    }
}
