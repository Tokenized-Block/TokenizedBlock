// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockMissionsV3} from "../src/BlockMissionsV3.sol";

/// @dev PARITE signeur-secp256k1.js <-> vm.sign de Foundry. Cles de TEST PUBLIQUES uniquement (1, 2, 3, 0xA11CE, n/2, n-1).
///      Ce test IMPRIME vm.sign(cle, digest) ; test-signeur-secp256k1-20261017.mjs epingle ces r, s, v octet pour octet.
contract SigneurParite is Test {
    uint256 constant N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;

    function cles() internal pure returns (uint256[6] memory k) {
        k = [uint256(1), 2, 3, 0xA11CE, N >> 1, N - 1];
    }

    function digests() internal pure returns (bytes32[5] memory d) {
        d = [
            keccak256("tokenizedblock signeur 1"),
            keccak256("tokenizedblock signeur 2"),
            bytes32(0),
            bytes32(type(uint256).max), // > n : le signeur doit reduire mod n comme Foundry
            bytes32(N)                  // == n : z mod n = 0
        ];
    }

    function test_imprime_vm_sign() public pure {
        uint256[6] memory k = cles();
        bytes32[5] memory d = digests();
        for (uint256 i = 0; i < k.length; i++) {
            for (uint256 j = 0; j < d.length; j++) {
                (uint8 v, bytes32 r, bytes32 s) = vm.sign(k[i], d[j]);
                console.log(string.concat("VEC ", vm.toString(k[i]), " ", vm.toString(d[j]), " ", vm.toString(abi.encodePacked(r, s, v)), " ", vm.toString(vm.addr(k[i]))));
                assertLe(uint256(s), N / 2, "vm.sign rend un s bas");
            }
        }
    }
}


contract JetonS {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true;
    }
}

/// @dev le hook 7030 tel que BlockMissionsV3 le lit : createurs(bytes32) -> (creator, ...) et cotes(PoolKey) -> (devise, bloc).
contract HookS {
    mapping(bytes32 => address) public c;
    mapping(bytes32 => address) public bloc;
    function set(bytes32 id, address creator_, address bloc_) external { c[id] = creator_; bloc[id] = bloc_; }
    function createurs(bytes32 id) external view returns (address, uint256) { return (c[id], 0); }
    function cotes(BlockMissionsV3.PoolKey calldata k) external view returns (address devise, address b) {
        b = bloc[keccak256(abi.encode(k))];
        devise = b == k.currency0 ? k.currency1 : k.currency0;
    }
}

/// @dev ACCEPTATION PAR LE CONTRAT : BlockMissionsV3.claim (le vrai, contracts/src) avec des signatures produites par signeur-secp256k1.js
///      (cle de test PUBLIQUE 0xA11CE = le verifier), PAS par vm.sign. Les digests sont imprimes ici, signes en JS, puis epingles.
contract SigneurClaim is Test {
    uint256 constant N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    BlockMissionsV3 m;
    HookS hook;
    JetonS blk; JetonS usdc;
    address creator = address(0xC0);
    uint256 constant VK = 0xA11CE;
    uint256 id;

    // [i] = (digest attendu, signature JS) pour joueur address(uint160(0xB0B0 + i)), tx keccak256(abi.encode("tx", i))
    bytes32[] digestsEpingles;
    bytes[] sigsJs;

    function setUp() public {
        hook = new HookS();
        blk = new JetonS(); usdc = new JetonS();
        m = new BlockMissionsV3(address(hook), address(0x9A11), address(0xDE5), address(0xFEE), address(usdc), vm.addr(VK), address(0x6A2D), address(0), new address[](0));
        (address c0, address c1) = address(usdc) < address(blk) ? (address(usdc), address(blk)) : (address(blk), address(usdc));
        BlockMissionsV3.PoolKey memory k = BlockMissionsV3.PoolKey(c0, c1, 0, 200, address(hook));
        hook.set(m.poolIdOf(k), creator, address(blk));
        usdc.mint(creator, 1_000_000e6);
        vm.prank(creator); usdc.approve(address(m), type(uint256).max);
        vm.warp(1_800_000_000);
        vm.prank(creator);
        id = m.postTask(k, BlockMissionsV3.TaskParams(address(usdc), 10e6, 8, 1, uint64(block.timestamp + 7 days), address(0x7A26E7), keccak256("Swap()"), keccak256("text"), bytes32(0)),
            BlockMissionsV3.Hold(50e18, 0, 0, 0, 24 hours));
        for (uint256 i = 0; i < 8; i++) blk.mint(joueur(i), 100e18);
        digestsEpingles.push(0x3d0d0c507db36b62d445446a64e1edb2890e5e14256e0bb9a2cc9a941999ed3a); sigsJs.push(hex"0fca428893253aee0ee5e8b8c2822b39a0725173b9b33eac9f3eac96016058b02efab0fb36c5f6fec5e2c2f4fb3c8f73a64cbd265e3bd3cc3d1ba611d405a5561b"); // 0 s BASCULE
        digestsEpingles.push(0xa06ea660b96a1d5e96190177d5624b1ff0df9a9e9e5e62d59069ccb4ea357a8c); sigsJs.push(hex"cd0c905b49371e4f6d3e8b74819083e6d200eb1572a511fc6c75e490f844b18f7b30f4bcdefe0f912f91822630c03009fe57c5af42a7148dfc87c3b7eb2413c61c"); // 1
        digestsEpingles.push(0x061e7c02909d167581d2fd7b21e9630e5a7db6e1b083078b231f82eced907ac3); sigsJs.push(hex"bd6033867c5b49891ebe362d7b9fd8a07afa7fb26504705472c6fe9fec6de17d0f12720cf9ba6ba58cb4d9feccece7e4e9e54134f8277e0808b103523ea9f1021c"); // 2
        digestsEpingles.push(0xbebdc92e7c3184eea3afbd5efb4fb61ab0dd44a82157e5e6e578468a9dd8b7da); sigsJs.push(hex"e7d82bbb10f75dc65adc46937cc04f873874f5a57908d64c230798d2afde65cb53785cd78c1ed28ffc4b104e5fcc5bd12bea8ad0cdb56ed2fad13d45754910801c"); // 3
        digestsEpingles.push(0xb5f18293a88ec233d113fbaaae47e4ceafc3f9217b2ab40edd4c1bc7d0362a2b); sigsJs.push(hex"404df927fd5d2e06eb29604b6a0319e13f54a1b75c105c8d9523129de5b3bbb27719436a6ff8607f145d79f3e28a7432f0f6a19d2decfe945c7ad4e6855c94b41b"); // 4
        digestsEpingles.push(0x2f01db85416d4705e756fd74365f12b3bf4bacd5fa02a84dea5d183eb8fd5234); sigsJs.push(hex"55364cb14dd73534663ae6c00d54d01d400f528136808ef3963ab1fb03449f653d1a039a32c41d0dcc1b4d7b6f1a5887f9c63bc9bfb9a391d4365e2c43fad0571b"); // 5
        digestsEpingles.push(0x1664df2bef144f006263eb484753e4b08a430c2ce9d2c5ca852dd1d3d13295ee); sigsJs.push(hex"aed99bf3a72db5ea4758d5e310a1b2e4565f58de172ce373356f02024a82d82755a316254270e2a9a2a4db5f176dea4a2828fc452e3466356ca5af9d8b181c1b1b"); // 6
        digestsEpingles.push(0x264760a58673d0adcad0c2d0da5745fded409192e901be39dcd71ed6283ea48c); sigsJs.push(hex"77783ee9373a3323283835b6e69ee5855c9fb6674463d33ea4aa3a0d985424824f6711fedb5af23fb73141c7a430927ad53e31b67bc645ba5021d336883fd4fe1b"); // 7 s BASCULE
    }

    function joueur(uint256 i) internal pure returns (address) { return address(uint160(0xB0B0 + i)); }
    function txh(uint256 i) internal pure returns (bytes32) { return keccak256(abi.encode("tx", i)); }
    function held() internal view returns (BlockMissionsV3.Held memory) { return BlockMissionsV3.Held(60e18, 0, uint64(block.timestamp - 1), block.timestamp + 10 minutes); }

    function test_imprime_digests() public view {
        for (uint256 i = 0; i < 8; i++) console.log(string.concat("DIGEST ", vm.toString(i), " ", vm.toString(m.claimDigest(id, joueur(i), txh(i), held()))));
    }

    function sParts(bytes memory sig) internal pure returns (bytes32 r, bytes32 s, uint8 v) {
        assembly { r := mload(add(sig, 32)) s := mload(add(sig, 64)) v := byte(0, mload(add(sig, 96))) }
    }

    /// les 8 signatures JS : le digest epingle est celui que le contrat recalcule, la signature = vm.sign, s bas, et claim() PAIE.
    function test_claims_signes_en_js_acceptes_par_le_contrat() public {
        assertEq(sigsJs.length, 8);
        for (uint256 i = 0; i < 8; i++) {
            assertEq(m.claimDigest(id, joueur(i), txh(i), held()), digestsEpingles[i], "digest epingle = claimDigest du contrat");
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(VK, digestsEpingles[i]);
            assertEq(sigsJs[i], abi.encodePacked(r, s, v), "signature JS = vm.sign octet pour octet");
            (, bytes32 sj, uint8 vj) = sParts(sigsJs[i]);
            assertLe(uint256(sj), N / 2, "s bas");
            assertTrue(vj == 27 || vj == 28, "v dans {27, 28}");
            vm.prank(joueur(i));
            m.claim(id, txh(i), held(), sigsJs[i]);
            assertEq(usdc.balanceOf(joueur(i)), 9e6, "claim paye 90 % au joueur");
        }
    }

    function attendRefus(uint256 i, BlockMissionsV3.Held memory h, bytes memory sig) internal {
        vm.prank(joueur(i));
        vm.expectRevert(BlockMissionsV3.BadProof.selector);
        m.claim(id, txh(i), h, sig);
    }

    /// cas 0 et 7 = s bascule par la normalisation low-s du signeur JS : la jumelle (n - s, v inverse) est une signature ECDSA
    /// VALIDE (l ecrecover nu la rend au verifier) mais le contrat la REFUSE. Sans la normalisation, le signeur aurait rendu celle-la.
    function test_jumelle_haute_valide_pour_ecrecover_mais_refusee() public {
        uint256[2] memory cas = [uint256(0), 7];
        for (uint256 j = 0; j < 2; j++) {
            uint256 i = cas[j];
            (bytes32 r, bytes32 s, uint8 v) = sParts(sigsJs[i]);
            bytes32 sHaut = bytes32(N - uint256(s));
            uint8 vInv = v == 27 ? 28 : 27;
            assertGt(uint256(sHaut), N / 2);
            assertEq(ecrecover(digestsEpingles[i], vInv, r, sHaut), vm.addr(VK), "la jumelle haute est valide pour le precompile");
            assertEq(ecrecover(digestsEpingles[i], v, r, s), vm.addr(VK), "la basse aussi");
            attendRefus(i, held(), abi.encodePacked(r, sHaut, vInv));
            vm.prank(joueur(i));
            m.claim(id, txh(i), held(), sigsJs[i]); // la basse passe ensuite : le refus venait bien de s haut
        }
    }

    function test_refus_v_longueur_digest_altere_mauvais_joueur() public {
        (bytes32 r, bytes32 s, uint8 v) = sParts(sigsJs[1]);
        attendRefus(1, held(), abi.encodePacked(r, s, v == 27 ? uint8(28) : uint8(27))); // mauvais v (27 <-> 28)
        attendRefus(1, held(), abi.encodePacked(r, s, v - 27));                         // v = 0/1 (forme brute)
        attendRefus(1, held(), abi.encodePacked(r, s));                                 // 64 octets
        attendRefus(1, held(), abi.encodePacked(r, s, v, uint8(0)));                    // 66 octets
        BlockMissionsV3.Held memory h = held(); h.heldBlock = 61e18;
        attendRefus(1, h, sigsJs[1]);                                                   // digest altere (autre Held)
        attendRefus(2, held(), sigsJs[1]);                                              // la preuve d un autre joueur
        vm.prank(joueur(1));
        m.claim(id, txh(1), held(), sigsJs[1]);                                         // l originale passe toujours
        assertEq(usdc.balanceOf(joueur(1)), 9e6);
    }
}
