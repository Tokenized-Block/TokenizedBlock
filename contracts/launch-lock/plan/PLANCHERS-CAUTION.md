# Caution floor per currency (hook 7030) — block 52090382, references read 2026-10-02T19:41:53.933Z

Rule: POOL = ceil($1 / on-chain pool price) when the pool is live, depth >= $500 and within 1000 bps of both references; REFERENCE = ceil($1 / lower of two references that agree within 100 bps) — **no readable on-chain pool price: decision for Grok Bot**.

| # | currency | rule | price source pool | pool price $ | references $ | gap bps | depth $ (v4: virtual in-range) | raw minimum | $ value at the sizing price | $ value at the lower reference |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | ETH | POOL | v3 0xd0b53D9277642d899DF5C87A3966A349A798F224 (Uniswap v3 WETH/USDC 0.05%) | 2665.87866589 | coinbase 2666, kraken 2666.58 | 0 / 2 | 4291011 | 375110845363267 | 1.0000 | 1.0000 |
| 1 | USDC | UNIT | USDC is the unit | - | - | - | - | 1000000 | 1.0000 | - |
| 2 | cbBTC | POOL | cl 0x7C7420DD105E2779316423Ba3E973f434315EFA9 (aerodrome cbBTC/WETH) | 84193.67894402 | coinbase 84217.755, kraken 84208.7 | 2 / 1 | 1669693 | 1188 | 1.0002 | 1.0004 |
| 3 | TOSHI | POOL | v3 0x4b0Aaf3EBb163dd45F663b38b6d93f6093EBC2d3 (uniswap TOSHI/WETH) | 0.00012023 | coinbase 0.0001198, kraken 0.0001199 | 35 / 27 | 483848 | 8317319830414303380420 | 1.0000 | 0.9964 |
| 4 | OUSD | POOL | v4 0xdf5bde0fc414fcd1f803c9d1b52ebbb4db5982d8dca5316ae06b467e06fc429a (uniswap OUSD/USDC) | 1.00000107 | peg 1 | 0 | 15573227728 | 999999 | 1.0000 | 1.0000 |
| 5 | AAPLc | POOL | cl 0xA3b1E3f9747065e2073722Ff4c9027d3eA4994F0 (aerodrome AAPLc/USDC) | 333.7763971 | yahoo 333.83, nasdaq 333.83 | 1 / 1 | 935458 | 299602 | 1.0000 | 1.0002 |
| 6 | AMZNc | POOL | v3 0x7F030e5fD657795C0937a3e8af2929Fd90DA91C7 (uniswap AMZNc/USDC) | 250.80397508 | yahoo 250.74, nasdaq 250.75 | 2 / 2 | 5966 | 398718 | 1.0000 | 0.9997 |
| 7 | AVGOc | REFERENCE (no active liquidity) | cl 0x1f4a5e3112AE53cA2864c89d5C0AEf85282b4C62 (aerodrome AVGOc/USDC) | 355.31573736 | yahoo 355.83, nasdaq 355.92 | 14 / 16 | 1940 | 281034 | 1.0000 | 1.0000 |
| 8 | BEc | POOL | v4 0xa68987c1412e623c3e2a09d0b5d1f5d34ed5c475c798b0d9bbd005ff6fd21c1f (uniswap BEc/USDC) | 285.75011058 | yahoo 291.98, nasdaq 291.98 | 213 / 213 | 20412 | 349957 | 1.0000 | 1.0218 |
| 9 | GOOGLc | POOL | cl 0xB1987CAD1682841b4b641d50E520777eC5Ab5542 (aerodrome GOOGLc/USDC) | 343.27093451 | yahoo 342.995, nasdaq 342.995 | 8 / 8 | 767366 | 291316 | 1.0000 | 0.9992 |
| 10 | HIMSc | POOL | v4 0xa5d57d3527dbc5333b4e828400d0dc200d4eec29c8a45eda889ef238869c6d59 (uniswap HIMSc/USDC) | 28.64340259 | yahoo 28.99, nasdaq 28.99 | 119 / 119 | 73026 | 3491206 | 1.0000 | 1.0121 |
| 11 | METAc | POOL | cl 0xEAF57753BC382E0324a1D43F72E7027705a2273E (aerodrome METAc/USDC) | 727.18070912 | yahoo 726.91, nasdaq 726.91 | 3 / 3 | 796122 | 137518 | 1.0000 | 0.9996 |
| 12 | MSFTc | POOL | cl 0x7103eB3c9590d1281f7dc03b2A9EE27C39dF5D54 (aerodrome MSFTc/USDC) | 515.40130342 | yahoo 515.36, nasdaq 515.362 | 0 / 0 | 517476 | 194024 | 1.0000 | 0.9999 |
| 13 | MSTRc | POOL | v4 0x17ecfe141bada18d94b2c41a2bbaffde8726309a6b4340e1ad7a6910bc7cdf8d (uniswap MSTRc/USDC) | 161.28687688 | yahoo 158.25, nasdaq 158.28 | 191 / 189 | 5191 | 620014 | 1.0000 | 0.9812 |
| 14 | MUc | POOL | cl 0x17e1bEB2cD65493Da73ed4BbbC7BEcAAa0F91C73 (aerodrome MUc/USDC) | 1073.11541176 | yahoo 1073.5, nasdaq 1073.38 | 3 / 2 | 205846 | 93187 | 1.0000 | 1.0003 |
| 15 | NVDAc | POOL | cl 0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9 (aerodrome NVDAc/USDC) | 234.48777826 | yahoo 234.485, nasdaq 234.475 | 0 / 0 | 1206272 | 426462 | 1.0000 | 0.9999 |
| 16 | PLTRc | POOL | cl 0x650cc267AA248191978013d5Ae421e5Dc2A6e242 (aerodrome PLTRc/USDC) | 189.24340319 | yahoo 189.22, nasdaq 189.22 | 1 / 1 | 296863 | 528421 | 1.0000 | 0.9999 |
| 17 | SNDKc | POOL | v3 0x26fa54cdfc64fAacb5364c09De7Ac2F72308052D (uniswap SNDKc/USDC) | 1733.23327865 | yahoo 1719.06, nasdaq 1719.2 | 82 / 81 | 1415 | 57696 | 1.0000 | 0.9918 |
| 18 | SPCXc | POOL | v3 0x127a12FC0953ab2ab89558c67Ba6D597D7140431 (uniswap SPCXc/USDC) | 157.98891238 | yahoo 159.29, nasdaq 159.3 | 81 / 82 | 24596 | 632956 | 1.0000 | 1.0082 |
| 19 | TSLAc | POOL | cl 0x469337fDcc5E8f38e2E4B670B04F57865D13a7BB (aerodrome TSLAc/USDC) | 374.1759851 | yahoo 374.305, nasdaq 374.29 | 3 / 3 | 606600 | 267254 | 1.0000 | 1.0003 |
| 20 | AMDc | POOL | v4 0x3794f7b84c4d243c117e3cba9cd07c23ac001585e0d9464820bbf503f3c0c3be (uniswap AMDc/USDC) | 613.33890705 | yahoo 634.29, nasdaq 634.645 | 330 / 335 | 129591 | 163042 | 1.0000 | 1.0342 |
| 21 | ASTSc | POOL | v4 0x3c4219c9da7abe1ca95e3c7d2d4a9ccfdddf7c70c115b2909aa4b558a6d683b8 (uniswap ASTSc/USDC) | 57.70908026 | yahoo 58.25, nasdaq 58.25 | 92 / 92 | 21165 | 1732830 | 1.0000 | 1.0094 |
| 22 | CAKEc | POOL | v4 0x804fece8c0572619d514faf9cbf5147d6115e215d69508c4bdf0e75d286f44ab (uniswap CAKEc/USDC) | 116.02932406 | yahoo 108.54, nasdaq 108.54 | 690 / 690 | 5330 | 861852 | 1.0000 | 0.9355 |
| 23 | DJTc | POOL | v4 0x08357c323c3b3f635c16df4a9f850e4582e0470fca4d59a8f563116e8ecd27f0 (uniswap DJTc/USDC) | 9.17440322 | yahoo 8.9, nasdaq 8.9 | 308 / 308 | 24108 | 10899892 | 1.0000 | 0.9701 |
| 24 | DUOLc | POOL | v4 0x25c85af41f267598b06dc658f55ceef6c7df2d2719c4077b7e7462149148667e (uniswap DUOLc/USDC) | 149.87834776 | yahoo 144.39, nasdaq 144.39 | 380 / 380 | 5286 | 667208 | 1.0000 | 0.9634 |
| 25 | LLYc | POOL | v4 0xa7cfa6bac05206b5781d2eacff67f4e8046efe60fba79ccd0b13a8e6d5a9db9d (uniswap LLYc/USDC) | 1179.7452485 | yahoo 1146.285, nasdaq 1146.285 | 291 / 291 | 903193 | 84765 | 1.0000 | 0.9716 |
| 26 | MRNAc | POOL | v4 0xd8c5b72395fe0cf680950c6455cfb054d5723aa789c2ef9f166449190e1b453c (uniswap MRNAc/USDC) | 177.70467387 | yahoo 190.195, nasdaq 190.26 | 656 / 659 | 892 | 562732 | 1.0000 | 1.0703 |
| 27 | MRVLc | POOL | v4 0x539a0eec22fa9f760acee8406db3685e3dbb844c7c8b5cecafd940c8fb597d49 (uniswap MRVLc/USDC) | 255.60551115 | yahoo 274.36, nasdaq 274.36 | 683 / 683 | 42166 | 391228 | 1.0000 | 1.0734 |
| 28 | NFLXc | POOL | v4 0x4e7d243e0095037608bef179bc69c1fcd04a3e4d4e723bf2ec75e90bbc186bd0 (uniswap NFLXc/USDC) | 69.1944452 | yahoo 67.01, nasdaq 67.01 | 325 / 325 | 103179 | 1445203 | 1.0000 | 0.9684 |
| 29 | NVAXc | POOL | v4 0xdb5ad710e437dbc22f5eb1286a878ea59ee1cb36fa034cf2e771e06a7ab5b503 (uniswap NVAXc/USDC) | 11.29644101 | yahoo 10.425, nasdaq 10.425 | 835 / 835 | 11011 | 8852346 | 1.0000 | 0.9229 |
| 30 | ORCLc | POOL | v4 0x55092916912c12e39bc6304e2a2326f207ce82094534f40b5e7e54420e0e53aa (uniswap ORCLc/USDC) | 137.78022953 | yahoo 142.545, nasdaq 142.54 | 334 / 333 | 18855 | 725794 | 1.0000 | 1.0345 |
| 31 | PTONc | POOL | v4 0x5ea4feabed47530545c0235d7241e605fa51f6538eeeb9f12fa00174ba20e227 (uniswap PTONc/USDC) | 5.40593715 | yahoo 4.94, nasdaq 4.94 | 943 / 943 | 3735 | 18498181 | 1.0000 | 0.9138 |
| 32 | PYPLc | POOL | v4 0x9fe752e5ab1cd1c5e8b1bc90f38271fbc4485d067448f50a76d6e1474b5e9d40 (uniswap PYPLc/USDC) | 52.02824154 | yahoo 52.78, nasdaq 52.78 | 142 / 142 | 11456 | 1922034 | 1.0000 | 1.0144 |
| 33 | QUBTc | POOL | v4 0xf6c175a40f11dda83bcf403923bc6bb07edadaf6bb161c9188f3c81d1dc960e2 (uniswap QUBTc/USDC) | 8.67283738 | yahoo 8.135, nasdaq 8.135 | 661 / 661 | 27103 | 11530252 | 1.0000 | 0.9380 |
| 34 | RBLXc | REFERENCE (no active liquidity) | cl 0x51642769e591Fe72275219750E0FB469adD35441 (aerodrome RBLXc/USDC) | 44.0185534 | yahoo 44.07, nasdaq 44.07 | 11 / 11 | 1939 | 2269118 | 1.0000 | 1.0000 |
| 35 | RDDTc | POOL | v4 0x63c669a07967107027856d8c36eed06427669d6be5674794da232c6ce27e236e (uniswap RDDTc/USDC) | 149.55514263 | yahoo 148.06, nasdaq 148.0599 | 100 / 100 | 72908 | 668650 | 1.0000 | 0.9900 |
| 36 | TTWOc | POOL | v4 0x5d33e25309769f6fb006cfe17644175620a31b507a27bfbfc1591856b93710bb (uniswap TTWOc/USDC) | 200.71038348 | yahoo 202.925, nasdaq 202.925 | 109 / 109 | 35676 | 498231 | 1.0000 | 1.0110 |
| 37 | WENc | REFERENCE (pool vs reference gap 1061/1061 bps > 1000) | v4 0xfcb3d52e699c52dc071edda41e531d6fc3830a81b55a6d16fdba817041003091 (uniswap WENc/USDC) | 6.80716418 | yahoo 6.154, nasdaq 6.1538 | 1061 / 1061 | 4483 | 16250122 | 1.0000 | 1.0000 |
| 38 | GMEc | POOL | v4 0x723e3c6bf63baa05f38ac34b1801aca48bad08ee053ba87d302443ea33a11df5 (uniswap GMEc/USDC (Dexscreener 2026-10-02 23:04 CEST: the only GMEc pool listed)) | 24.02192802 | yahoo 24.7, nasdaq 24.7 | 274 / 274 | 31179 | 4162864 | 1.0000 | 1.0282 |
| 39 | HTZc | REFERENCE (depth $1 < $500) | cl 0x4DFfb33A4e4059De45C7Bc82212A6d25F62c6f30 (aerodrome HTZc/USDC) | 1.75832403 | yahoo 1.735, nasdaq 1.735 | 134 / 134 | 1 | 57636888 | 1.0000 | 1.0000 |
| 40 | PFEc | REFERENCE (depth $33 < $500; pool vs reference gap 7855/7858 bps > 1000) | v4 0xc9c1898e8d5c2eea14419410815cfd43aab3d21d70ff6fda9a42ddf5e761b30d (uniswap PFEc/USDC) | 49.5220122 | yahoo 27.735, nasdaq 27.73 | 7855 / 7858 | 33 | 3606203 | 1.0000 | 1.0000 |
| 41 | PMc | POOL | cl 0x88274b1e6cadE876082537fC158ceba48338219f (aerodrome PMc/USDC) | 193.1849214 | yahoo 188.5, nasdaq 188.505 | 248 / 248 | 1939 | 517639 | 1.0000 | 0.9757 |
| 42 | AMCc | REFERENCE (no pool declared) | - | - | yahoo 2.77, nasdaq 2.77 | - | - | 36101084 | 1.0000 | 1.0000 |
| 43 | AEOc | REFERENCE (no pool declared) | - | - | yahoo 17.71, nasdaq 17.71 | - | - | 5646528 | 1.0000 | 1.0000 |
| 44 | BMNRc | REFERENCE (no pool declared) | - | - | yahoo 26.27, nasdaq 26.27 | - | - | 3806624 | 1.0000 | 1.0000 |
| 45 | BIRDc | REFERENCE (no pool declared) | - | - | yahoo 3.365, nasdaq 3.365 | - | - | 29717683 | 1.0000 | 1.0000 |
| 46 | BYNDc | REFERENCE (no pool declared) | - | - | yahoo 8.25, nasdaq 8.25 | - | - | 12121213 | 1.0000 | 1.0000 |
| 47 | CIFRc | REFERENCE (no pool declared) | - | - | yahoo 15.71, nasdaq 15.71 | - | - | 6365373 | 1.0000 | 1.0000 |
| 48 | CLSKc | REFERENCE (no pool declared) | - | - | yahoo 12.74, nasdaq 12.74 | - | - | 7849294 | 1.0000 | 1.0000 |
| 49 | CRCLc | REFERENCE (no pool declared) | - | - | yahoo 81.25, nasdaq 81.25 | - | - | 1230770 | 1.0000 | 1.0000 |
| 50 | CRWVc | REFERENCE (no pool declared) | - | - | yahoo 89.62, nasdaq 89.62 | - | - | 1115823 | 1.0000 | 1.0000 |
| 51 | HUTc | REFERENCE (no pool declared) | - | - | yahoo 89.63, nasdaq 89.63 | - | - | 1115698 | 1.0000 | 1.0000 |
| 52 | KSSc | REFERENCE (no pool declared) | - | - | yahoo 18.81, nasdaq 18.81 | - | - | 5316322 | 1.0000 | 1.0000 |
| 53 | LCIDc | REFERENCE (no pool declared) | - | - | yahoo 4.13, nasdaq 4.13 | - | - | 24213076 | 1.0000 | 1.0000 |
| 54 | MARAc | REFERENCE (no pool declared) | - | - | yahoo 11.23, nasdaq 11.23 | - | - | 8904720 | 1.0000 | 1.0000 |
| 55 | OPENc | REFERENCE (no pool declared) | - | - | yahoo 2.44, nasdaq 2.44 | - | - | 40983607 | 1.0000 | 1.0000 |
| 56 | RIOTc | REFERENCE (no pool declared) | - | - | yahoo 19.73, nasdaq 19.73 | - | - | 5068424 | 1.0000 | 1.0000 |
| 57 | SOUNc | REFERENCE (no pool declared) | - | - | yahoo 5.84, nasdaq 5.84 | - | - | 17123288 | 1.0000 | 1.0000 |
| 58 | USDEc | REFERENCE (no pool declared) | - | - | yahoo 14.15, nasdaq 14.15 | - | - | 7067138 | 1.0000 | 1.0000 |
| 59 | VVVc | REFERENCE (no pool declared) | - | - | yahoo 30.58, nasdaq 30.58 | - | - | 3270112 | 1.0000 | 1.0000 |
| 60 | WULFc | REFERENCE (no pool declared) | - | - | yahoo 15.49, nasdaq 15.49 | - | - | 6455778 | 1.0000 | 1.0000 |
| 61 | WWc | REFERENCE (no pool declared) | - | - | yahoo 14.74, nasdaq 14.74 | - | - | 6784261 | 1.0000 | 1.0000 |
| 62 | XYZc | REFERENCE (no pool declared) | - | - | yahoo 74.33, nasdaq 74.33 | - | - | 1345352 | 1.0000 | 1.0000 |
