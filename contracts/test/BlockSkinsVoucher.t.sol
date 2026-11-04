// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockSkinsVoucher} from "../src/BlockSkinsVoucher.sol";

/// @dev Keys here are test keys (vm.addr of small integers): none is a real key. Nothing is deployed; no fork.
contract BlockSkinsVoucherTest is Test {
    BlockSkinsVoucher v;
    uint256 constant SIGNER_KEY = 0xA11CE;
    uint256 constant OTHER_KEY = 0xB0B;
    address signer;
    address buyer = address(0xBEEF);
    address blockToken = address(0x1234);
    uint64 recipe; // hues 10,20,30,40,50,60,70
    bytes32 orderId = keccak256("gid://shopify/Order/820982911946154508");

    function setUp() public {
        signer = vm.addr(SIGNER_KEY);
        v = new BlockSkinsVoucher(signer);
        uint16[7] memory h = [uint16(10), 20, 30, 40, 50, 60, 70];
        for (uint256 i = 0; i < 7; i++) recipe |= uint64(h[i]) << uint64(9 * i);
        vm.warp(1_800_000_000);
    }

    function _sign(uint256 key, address to, bytes32 oid, uint64 deadline) internal view returns (bytes memory) {
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(key, v.voucherDigest(to, oid, blockToken, recipe, deadline));
        return abi.encodePacked(r, s, vv);
    }

    function test_validClaim() public {
        uint64 dl = uint64(block.timestamp + 1800);
        bytes memory sig = _sign(SIGNER_KEY, buyer, orderId, dl);
        vm.prank(buyer);
        uint256 id = v.claim(buyer, orderId, blockToken, recipe, dl, sig);
        assertEq(id, 1);
        assertEq(v.ownerOf(1), buyer);
        assertEq(v.balanceOf(buyer), 1);
        assertEq(v.orderUsed(orderId), 1);
        (address bt, uint64 rc, bytes32 oid) = v.skinOf(1);
        assertEq(bt, blockToken);
        assertEq(rc, recipe);
        assertEq(oid, orderId);
        assertEq(address(v).balance, 0);
        string memory uri = v.tokenURI(1);
        assertTrue(bytes(uri).length > 100);
    }

    function test_noValueAccepted() public {
        uint64 dl = uint64(block.timestamp + 1800);
        bytes memory sig = _sign(SIGNER_KEY, buyer, orderId, dl);
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        (bool ok,) = address(v).call{value: 1 wei}(
            abi.encodeCall(BlockSkinsVoucher.claim, (buyer, orderId, blockToken, recipe, dl, sig))
        );
        assertFalse(ok, "claim is not payable");
    }

    function test_replayRefused() public {
        uint64 dl = uint64(block.timestamp + 1800);
        bytes memory sig = _sign(SIGNER_KEY, buyer, orderId, dl);
        vm.prank(buyer);
        v.claim(buyer, orderId, blockToken, recipe, dl, sig);
        vm.prank(buyer);
        vm.expectRevert(BlockSkinsVoucher.OrderAlreadyUsed.selector);
        v.claim(buyer, orderId, blockToken, recipe, dl, sig);
        // a SECOND voucher for the same order (other deadline) is refused too: single use per orderId, not per signature
        uint64 dl2 = dl + 60;
        bytes memory sig2 = _sign(SIGNER_KEY, buyer, orderId, dl2);
        vm.prank(buyer);
        vm.expectRevert(BlockSkinsVoucher.OrderAlreadyUsed.selector);
        v.claim(buyer, orderId, blockToken, recipe, dl2, sig2);
        assertEq(v.totalSupply(), 1);
    }

    function test_wrongSigner() public {
        uint64 dl = uint64(block.timestamp + 1800);
        bytes memory sig = _sign(OTHER_KEY, buyer, orderId, dl);
        vm.prank(buyer);
        vm.expectRevert(BlockSkinsVoucher.BadSignature.selector);
        v.claim(buyer, orderId, blockToken, recipe, dl, sig);
    }

    function test_tamperedFieldsRefused() public {
        uint64 dl = uint64(block.timestamp + 1800);
        bytes memory sig = _sign(SIGNER_KEY, buyer, orderId, dl);
        vm.startPrank(buyer);
        vm.expectRevert(BlockSkinsVoucher.BadSignature.selector);
        v.claim(buyer, orderId, address(0x9999), recipe, dl, sig);
        vm.expectRevert(BlockSkinsVoucher.BadSignature.selector);
        v.claim(buyer, orderId, blockToken, recipe + 1, dl, sig);
        vm.expectRevert(BlockSkinsVoucher.BadSignature.selector);
        v.claim(buyer, keccak256("gid://shopify/Order/2"), blockToken, recipe, dl, sig);
        vm.expectRevert(BlockSkinsVoucher.BadSignature.selector);
        v.claim(buyer, orderId, blockToken, recipe, dl + 1, sig);
        vm.stopPrank();
    }

    function test_malformedSignatures() public {
        uint64 dl = uint64(block.timestamp + 1800);
        bytes32 d = v.voucherDigest(buyer, orderId, blockToken, recipe, dl);
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, d);
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        // the malleable twin (n - s, flipped v) recovers the same signer in ecrecover: it must be refused here
        bytes memory twin = abi.encodePacked(r, bytes32(n - uint256(s)), vv == 27 ? uint8(28) : uint8(27));
        assertEq(ecrecover(d, vv == 27 ? 28 : 27, r, bytes32(n - uint256(s))), signer);
        vm.startPrank(buyer);
        vm.expectRevert(BlockSkinsVoucher.BadSignature.selector);
        v.claim(buyer, orderId, blockToken, recipe, dl, twin);
        vm.expectRevert(BlockSkinsVoucher.BadSignature.selector);
        v.claim(buyer, orderId, blockToken, recipe, dl, abi.encodePacked(r, s));
        vm.expectRevert(BlockSkinsVoucher.BadSignature.selector);
        v.claim(buyer, orderId, blockToken, recipe, dl, abi.encodePacked(r, s, uint8(vv - 27)));
        vm.stopPrank();
    }

    function test_expired() public {
        uint64 dl = uint64(block.timestamp + 1800);
        bytes memory sig = _sign(SIGNER_KEY, buyer, orderId, dl);
        vm.warp(uint256(dl) + 1);
        vm.prank(buyer);
        vm.expectRevert(BlockSkinsVoucher.Expired.selector);
        v.claim(buyer, orderId, blockToken, recipe, dl, sig);
        vm.warp(uint256(dl)); // the deadline itself is still valid
        vm.prank(buyer);
        v.claim(buyer, orderId, blockToken, recipe, dl, sig);
    }

    function test_recipientMustBeSender() public {
        uint64 dl = uint64(block.timestamp + 1800);
        bytes memory sig = _sign(SIGNER_KEY, buyer, orderId, dl);
        vm.prank(address(0xCAFE));
        vm.expectRevert(BlockSkinsVoucher.NotRecipient.selector);
        v.claim(buyer, orderId, blockToken, recipe, dl, sig);
        // and someone else cannot rewrite the recipient to themselves: the signature is over the recipient
        vm.prank(address(0xCAFE));
        vm.expectRevert(BlockSkinsVoucher.BadSignature.selector);
        v.claim(address(0xCAFE), orderId, blockToken, recipe, dl, sig);
    }

    function test_signerRotation() public {
        uint64 dl = uint64(block.timestamp + 1800);
        bytes memory oldSig = _sign(SIGNER_KEY, buyer, orderId, dl);
        vm.prank(buyer);
        vm.expectRevert(BlockSkinsVoucher.NotOwner.selector);
        v.setSigner(buyer);
        vm.prank(signer);
        vm.expectRevert(BlockSkinsVoucher.NotOwner.selector);
        v.setSigner(signer); // the signer itself has no admin power
        vm.expectRevert(BlockSkinsVoucher.BadAddress.selector);
        v.setSigner(address(0));
        v.setSigner(vm.addr(OTHER_KEY)); // this test contract is the owner
        assertEq(v.signer(), vm.addr(OTHER_KEY));
        vm.prank(buyer);
        vm.expectRevert(BlockSkinsVoucher.BadSignature.selector);
        v.claim(buyer, orderId, blockToken, recipe, dl, oldSig); // vouchers of the old key die at once
        bytes memory newSig = _sign(OTHER_KEY, buyer, orderId, dl);
        vm.prank(buyer);
        v.claim(buyer, orderId, blockToken, recipe, dl, newSig);
        assertEq(v.ownerOf(1), buyer);
    }

    function test_cancelOrder() public {
        uint64 dl = uint64(block.timestamp + 1800);
        bytes memory sig = _sign(SIGNER_KEY, buyer, orderId, dl);
        vm.prank(buyer);
        vm.expectRevert(BlockSkinsVoucher.NotOwner.selector);
        v.cancelOrder(orderId);
        v.cancelOrder(orderId);
        assertEq(v.orderUsed(orderId), v.CANCELLED());
        vm.prank(buyer);
        vm.expectRevert(BlockSkinsVoucher.OrderAlreadyUsed.selector);
        v.claim(buyer, orderId, blockToken, recipe, dl, sig);
        // a claimed order cannot be cancelled: the token stays
        bytes32 o2 = keccak256("gid://shopify/Order/2");
        bytes memory sig2 = _sign(SIGNER_KEY, buyer, o2, dl);
        vm.prank(buyer);
        v.claim(buyer, o2, blockToken, recipe, dl, sig2);
        vm.expectRevert(BlockSkinsVoucher.OrderAlreadyUsed.selector);
        v.cancelOrder(o2);
    }

    function test_ownershipTwoSteps() public {
        v.transferOwnership(buyer);
        assertEq(v.owner(), address(this));
        vm.prank(address(0xCAFE));
        vm.expectRevert(BlockSkinsVoucher.NotOwner.selector);
        v.acceptOwnership();
        vm.prank(buyer);
        v.acceptOwnership();
        assertEq(v.owner(), buyer);
        vm.expectRevert(BlockSkinsVoucher.NotOwner.selector);
        v.setSigner(buyer);
    }

    function test_badRecipeAndNoRoyaltyInterface() public {
        uint64 dl = uint64(block.timestamp + 1800);
        uint64 bad = uint64(360); // hue 0 = 360 > 359
        bytes32 d = v.voucherDigest(buyer, orderId, blockToken, bad, dl);
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(SIGNER_KEY, d);
        vm.prank(buyer);
        vm.expectRevert(BlockSkinsVoucher.BadRecipe.selector);
        v.claim(buyer, orderId, blockToken, bad, dl, abi.encodePacked(r, s, vv));
        assertFalse(v.supportsInterface(0x2a55205a), "no EIP-2981 royalty");
        assertTrue(v.supportsInterface(0x80ac58cd));
    }

    function test_transferWorksWithoutFee() public {
        uint64 dl = uint64(block.timestamp + 1800);
        bytes memory sig = _sign(SIGNER_KEY, buyer, orderId, dl);
        vm.prank(buyer);
        v.claim(buyer, orderId, blockToken, recipe, dl, sig);
        vm.prank(buyer);
        v.transferFrom(buyer, address(0xCAFE), 1);
        assertEq(v.ownerOf(1), address(0xCAFE));
    }

    /// @dev parity with shopify-usdc.js: the JS test signs the SAME voucher with the same test key, for this contract's address
    ///      and chain 31337; the printed values are pinned there (test-shopify-bon-20261104.mjs).
    function test_parityVectorPrinted() public view {
        uint64 dl = 1_800_001_800;
        bytes32 d = v.voucherDigest(buyer, orderId, blockToken, recipe, dl);
        console.log("contract", address(v));
        console.log("chainid", block.chainid);
        console.logBytes32(d);
    }

    /// @dev the signature produced by shopify-usdc.js signerBon (key 0xA11CE, the vector above) is accepted by this contract.
    function test_jsSignatureAccepted() public {
        uint64 dl = 1_800_001_800;
        bytes memory jsSig = JS_SIG;
        vm.prank(buyer);
        uint256 id = v.claim(buyer, orderId, blockToken, recipe, dl, jsSig);
        assertEq(id, 1);
    }

    /// @dev produced by signeur-secp256k1.js signerDigest(0xA11CE, shopify-usdc.js digestBon(...)) — digest
    ///      0xc13b4431c297de68d4dba0453ec2eb5bf1c040e6a9ad196dd51d80808be6499f, the same bytes voucherDigest prints above.
    bytes constant JS_SIG =
        hex"7148a84da5f2ecdecdb511a34e44b43a6f27b944b59d17b091a54e1dfdf4072411cd85b57c83778bf1fde5086ecd0e0ce2f5f220efc2f89cbe3e46de86adc9cb1b";

    /// @dev shopify-usdc.js encoderClaim for the vector: the exact bytes abi.encodeCall gives, and the claim it carries mints.
    bytes constant JS_CALLDATA =
        hex"328b8e58000000000000000000000000000000000000000000000000000000000000beefb65dce3d520383c90b56655f1b7602bf32ad2ca60c4f81bc99471b8ff9779a370000000000000000000000000000000000000000000000000000000000001234000000000000000000000000000000000000000000000000118783214078280a000000000000000000000000000000000000000000000000000000006b49d90800000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000417148a84da5f2ecdecdb511a34e44b43a6f27b944b59d17b091a54e1dfdf4072411cd85b57c83778bf1fde5086ecd0e0ce2f5f220efc2f89cbe3e46de86adc9cb1b00000000000000000000000000000000000000000000000000000000000000";

    function test_jsCalldataParity() public {
        assertEq(
            keccak256(JS_CALLDATA),
            keccak256(abi.encodeCall(BlockSkinsVoucher.claim, (buyer, orderId, blockToken, recipe, 1_800_001_800, JS_SIG)))
        );
        vm.prank(buyer);
        (bool ok,) = address(v).call(JS_CALLDATA);
        assertTrue(ok);
        assertEq(v.ownerOf(1), buyer);
    }

    function test_jsDigestPinned() public view {
        assertEq(
            v.voucherDigest(buyer, orderId, blockToken, recipe, 1_800_001_800),
            0xc13b4431c297de68d4dba0453ec2eb5bf1c040e6a9ad196dd51d80808be6499f
        );
        assertEq(address(v), 0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f);
    }
}
