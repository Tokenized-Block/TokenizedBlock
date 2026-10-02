// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice The V9 quote list for Base mainnet (native ETH is implicit and always admitted).
/// @dev Source: app `paires.js` DEVISES_BASE (minus ETH / TBLOCK) + ACTIONS_COINBASE (15), read on 2026-10-01.
///      FIXED at construction. Every address below was checked on chain by the fork tests / sim
///      (B20 stocks: code == 0xef, prefix 0xb2…; USDC/cbBTC/TOSHI: plain ERC-20).
library V9Devises {
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant CBBTC = 0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf;
    address internal constant TOSHI = 0xAC1Bd2486aAf3B5C0fc3Fd868558b082a531B2B4;
    address internal constant OUSD = 0xB2000000000000000000002fEb517dFeC7415344;
    address internal constant AAPLc = 0xb200000000000000000000C2e324d24d7eEcd1fb;
    address internal constant AMZNc = 0xb200000000000000000000d9192b6B456483C2E8;
    address internal constant AVGOc = 0xB200000000000000000000Fc737aeA6196aB5a4c;
    address internal constant BEc = 0xb20000000000000000000016f9dfe862feBA122b;
    address internal constant GOOGLc = 0xb2000000000000000000002D0BA3164cc74f58B7;
    address internal constant HIMSc = 0xB20000000000000000000043a599976181Bcf336;
    address internal constant METAc = 0xb2000000000000000000008bC8786B856E61707C;
    address internal constant MSFTc = 0xB200000000000000000000Ab99cFa739E253872B;
    address internal constant MSTRc = 0xb2000000000000000000004884b426556b92883d;
    address internal constant MUc = 0xb200000000000000000000Fd2f87532B90095211;
    address internal constant NVDAc = 0xb20000000000000000000078ee7ce2fE4908108C;
    address internal constant PLTRc = 0xb2000000000000000000007d16372840dF4dAbbe;
    address internal constant SNDKc = 0xb200000000000000000000397293Cb8cda9a10c5;
    address internal constant SPCXc = 0xb2000000000000000000007b9fcbd005511aCBd5;
    address internal constant TSLAc = 0xb2000000000000000000001e800a7f5189430cD0;

    function liste() internal pure returns (address[] memory l) {
        l = new address[](19);
        l[0] = USDC; l[1] = CBBTC; l[2] = TOSHI; l[3] = OUSD;
        l[4] = AAPLc; l[5] = AMZNc; l[6] = AVGOc; l[7] = BEc; l[8] = GOOGLc; l[9] = HIMSc; l[10] = METAc;
        l[11] = MSFTc; l[12] = MSTRc; l[13] = MUc; l[14] = NVDAc; l[15] = PLTRc; l[16] = SNDKc; l[17] = SPCXc;
        l[18] = TSLAc;
    }

}
