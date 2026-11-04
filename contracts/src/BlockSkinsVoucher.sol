// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockSkinsVoucher — a block skin bought on a Shopify store (paid in USDC there), claimed here with a voucher.
/// @notice Phil, 2026-11-04: "skins bought on Shopify are delivered by a CLAIM VOUCHER: the paid order opens an entitlement; the
///         buyer connects their wallet in the app and claims; a NEW skins contract accepts an EIP-712 voucher signed by a dedicated
///         server signer key (minting power only, the server never holds or moves funds; the buyer's own wallet sends the claim tx)."
///
/// WHAT IT IS
///   - claim(): the BUYER's wallet sends it. It carries an EIP-712 voucher {recipient, orderId, blockToken, recipe, deadline}
///     signed by `signer`. recipient must be msg.sender; one orderId mints at most once; nothing is paid here (the payment
///     happened on Shopify): this contract pulls no token and accepts no ETH.
///   - orderId is keccak256 of the Shopify order GID ("gid://shopify/Order/<n>"): no personal data reaches the chain.
///   - the skin itself is the one BlockSkins paints: the same seven-hue recipe, the same on-chain SVG image in tokenURI
///     (copied from BlockSkins v2, 2026-10-11, so this file reads alone).
///
/// WHAT IT IS NOT, said plainly
///   - no market, no fee on resale, no royalty (EIP-2981 or other): Shopify's NFT page, read 2026-11-04, says "Certain NFT types
///     and distribution methods are not supported" and lists among them NFTs with secondary royalties and reselling NFTs one is
///     not the creator of (https://help.shopify.com/en/manual/products/digital-service-product/nfts ; risks and requirements:
///     https://help.shopify.com/en/manual/products/digital-service-product/nfts/risks-requirements).
///     A holder may transfer the token like any ERC-721; this contract takes nothing on it.
///   - not upgradeable, no pause, no way for anyone to move a holder's token.
///   - the owner can ONLY (a) rotate `signer` (a leaked key is cut at once), (b) cancel an UNCLAIMED orderId (a refunded order),
///     (c) hand ownership over in two steps. The owner cannot mint, cannot move a token, holds no funds.
/// ⚠ TRUST POINT, said plainly: whoever holds the signer key can mint free skins to any wallet that then claims (it never moves
///   anyone's funds — there are none here — but it can dilute the skins). The key lives in the server environment; rotating it
///   is the owner's gesture. The signer never sends a transaction: it signs vouchers off chain.
contract BlockSkinsVoucher {
    // ───────────────────────────── constants
    bytes32 public constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 public constant VOUCHER_TYPEHASH =
        keccak256("SkinVoucher(address recipient,bytes32 orderId,address blockToken,uint64 recipe,uint64 deadline)");
    bytes32 private constant NAME_HASH = keccak256("BlockSkinsVoucher");
    bytes32 private constant VERSION_HASH = keccak256("1");
    uint256 private constant HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;
    uint256 private constant MAX_HUE = 359;

    // ───────────────────────────── ERC-721 state
    string public constant name = "TokenizedBlock Skins (Shopify)";
    string public constant symbol = "TBSKINS";
    uint256 public totalSupply;
    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) private _balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    struct Skin {
        address blockToken; // the block this skin dresses
        uint64 recipe; // seven 9-bit hues: turn | h1 | h2 | h3 | edges | core | background
        bytes32 orderId; // keccak256 of the Shopify order GID
    }

    mapping(uint256 => Skin) public skinOf;

    // ───────────────────────────── vouchers
    address public signer;
    address public owner;
    address public pendingOwner;
    /// @notice 0 = never used ; otherwise the token minted for it, or type(uint256).max when the owner cancelled it.
    mapping(bytes32 => uint256) public orderUsed;
    uint256 public constant CANCELLED = type(uint256).max;

    // ───────────────────────────── events
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event SkinClaimed(uint256 indexed tokenId, address indexed recipient, bytes32 indexed orderId, address blockToken, uint64 recipe);
    event OrderCancelled(bytes32 indexed orderId);
    event SignerChanged(address indexed from, address indexed to);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    // ───────────────────────────── errors
    error NotOwner();
    error NotAllowed();
    error BadAddress();
    error BadRecipe();
    error BadSignature();
    error Expired();
    error NotRecipient();
    error OrderAlreadyUsed();
    error UnsafeRecipient();

    constructor(address signer_) {
        if (signer_ == address(0)) revert BadAddress();
        signer = signer_;
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
        emit SignerChanged(address(0), signer_);
    }

    // ───────────────────────────── owner: signer, cancel, ownership — nothing else
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function setSigner(address s) external onlyOwner {
        if (s == address(0)) revert BadAddress();
        emit SignerChanged(signer, s);
        signer = s;
    }

    /// @notice blocks an orderId that was never claimed (a refunded order). A claimed one cannot be cancelled: the token stays.
    function cancelOrder(bytes32 orderId) external onlyOwner {
        if (orderUsed[orderId] != 0) revert OrderAlreadyUsed();
        orderUsed[orderId] = CANCELLED;
        emit OrderCancelled(orderId);
    }

    function transferOwnership(address to) external onlyOwner {
        if (to == address(0)) revert BadAddress();
        pendingOwner = to;
        emit OwnershipTransferStarted(owner, to);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ───────────────────────────── EIP-712
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    /// @notice the digest the signer signs: shopify-usdc.js digestBon must give the same bytes (test-shopify-bon).
    function voucherDigest(address recipient, bytes32 orderId, address blockToken, uint64 recipe, uint64 deadline)
        public
        view
        returns (bytes32)
    {
        bytes32 st = keccak256(abi.encode(VOUCHER_TYPEHASH, recipient, orderId, blockToken, recipe, deadline));
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), st));
    }

    // ───────────────────────────── claim: the buyer's own wallet, no payment here
    function claim(address recipient, bytes32 orderId, address blockToken, uint64 recipe, uint64 deadline, bytes calldata sig)
        external
        returns (uint256 tokenId)
    {
        if (recipient != msg.sender) revert NotRecipient();
        if (block.timestamp > deadline) revert Expired();
        if (blockToken == address(0)) revert BadAddress();
        _checkRecipe(recipe);
        if (orderUsed[orderId] != 0) revert OrderAlreadyUsed();
        address got = _recover(voucherDigest(recipient, orderId, blockToken, recipe, deadline), sig);
        if (got == address(0) || got != signer) revert BadSignature();
        tokenId = ++totalSupply;
        orderUsed[orderId] = tokenId;
        skinOf[tokenId] = Skin({blockToken: blockToken, recipe: recipe, orderId: orderId});
        _ownerOf[tokenId] = recipient;
        _balanceOf[recipient] += 1;
        emit Transfer(address(0), recipient, tokenId);
        emit SkinClaimed(tokenId, recipient, orderId, blockToken, recipe);
    }

    /// @dev 65 bytes, s <= n/2 (EIP-2), v in {27, 28}; anything else recovers to address(0), which is never the signer.
    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > HALF_N) return address(0);
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }

    // ───────────────────────────── recipe (same packing as BlockSkins)
    function unpackRecipe(uint64 recipe) public pure returns (uint16[7] memory hues) {
        for (uint256 i = 0; i < 7; i++) hues[i] = uint16((recipe >> uint64(9 * i)) & 0x1FF);
    }

    function _checkRecipe(uint64 recipe) private pure {
        if (recipe >> 63 != 0) revert BadRecipe();
        for (uint256 i = 0; i < 7; i++) if (((recipe >> uint64(9 * i)) & 0x1FF) > MAX_HUE) revert BadRecipe();
    }

    // ───────────────────────────── ERC-721 (minimal)
    function ownerOf(uint256 tokenId) public view returns (address o) {
        o = _ownerOf[tokenId];
        if (o == address(0)) revert BadAddress();
    }

    function balanceOf(address account) external view returns (uint256) {
        if (account == address(0)) revert BadAddress();
        return _balanceOf[account];
    }

    function approve(address to, uint256 tokenId) external {
        address o = ownerOf(tokenId);
        if (msg.sender != o && !isApprovedForAll[o][msg.sender]) revert NotAllowed();
        getApproved[tokenId] = to;
        emit Approval(o, to, tokenId);
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address o = ownerOf(tokenId);
        if (o != from || to == address(0)) revert BadAddress();
        if (msg.sender != o && getApproved[tokenId] != msg.sender && !isApprovedForAll[o][msg.sender]) revert NotAllowed();
        delete getApproved[tokenId];
        _balanceOf[from] -= 1;
        _balanceOf[to] += 1;
        _ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length != 0) {
            (bool ok, bytes memory ret) = to.call(abi.encodeWithSelector(0x150b7a02, msg.sender, from, tokenId, data));
            if (!ok || ret.length < 32 || abi.decode(ret, (bytes4)) != bytes4(0x150b7a02)) revert UnsafeRecipient();
        }
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f; // ERC-165, ERC-721, ERC-721 metadata — NOT 2981
    }

    // ───────────────────────────── metadata: the image BlockSkins paints, on chain (copied from BlockSkins v2)
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        Skin memory s = skinOf[tokenId];
        uint16[7] memory h = unpackRecipe(s.recipe);
        string memory b = _hex(s.blockToken);
        string memory head = string.concat(
            '{"name":"TokenizedBlock skin #',
            _u(tokenId),
            '","description":"A skin for one block, bought on Shopify: a look, not a right over the block.","image":"data:image/svg+xml;base64,',
            _b64(bytes(_svg(h))),
            '","block":"',
            b
        );
        string memory hues = string.concat(_u(h[0]), ",", _u(h[1]), ",", _u(h[2]), ",", _u(h[3]));
        hues = string.concat(hues, ",", _u(h[4]), ",", _u(h[5]), ",", _u(h[6]));
        string memory json = string.concat(head, '","hues":[', hues, '],"attributes":[{"trait_type":"Block","value":"', b, '"}]}');
        return string.concat("data:application/json;base64,", _b64(bytes(json)));
    }

    function _svg(uint16[7] memory h) private pure returns (string memory) {
        string memory defs = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400"><defs>',
            '<linearGradient id="a" gradientTransform="rotate(',
            _u(h[0]),
            ' .5 .5)"><stop offset="0" stop-color="',
            _hsl(h[1], 62),
            '"/><stop offset=".33" stop-color="',
            _hsl(h[2], 38),
            '"/><stop offset=".66" stop-color="',
            _hsl(h[3], 70)
        );
        defs = string.concat(
            defs,
            '"/><stop offset="1" stop-color="',
            _hsl(h[2], 30),
            '"/></linearGradient><radialGradient id="c"><stop offset="0" stop-color="',
            _hsl(h[5], 70),
            '"/><stop offset="1" stop-color="',
            _hsl(h[5], 25),
            '"/></radialGradient></defs>'
        );
        return string.concat(
            defs,
            '<rect width="400" height="400" fill="hsl(',
            _u(h[6]),
            ',45%,9%)"/><circle cx="200" cy="200" r="182" fill="none" stroke="url(#a)" stroke-width="14"/>',
            '<circle cx="200" cy="200" r="58" fill="url(#c)"/><g fill="none" stroke="',
            _hsl(h[4], 60),
            '" stroke-width="5" stroke-linejoin="round"><path d="M200 90 295 145 295 255 200 310 105 255 105 145Z"/>',
            '<path d="M105 145 200 200 295 145M200 200V310"/></g></svg>'
        );
    }

    function _hsl(uint256 hue, uint256 light) private pure returns (string memory) {
        return string.concat("hsl(", _u(hue), ",90%,", _u(light), "%)");
    }

    function _b64(bytes memory data) private pure returns (string memory) {
        uint256 n = data.length;
        if (n == 0) return "";
        bytes memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        bytes memory out = new bytes(4 * ((n + 2) / 3));
        uint256 j;
        for (uint256 i = 0; i < n; i += 3) {
            uint256 t = uint256(uint8(data[i])) << 16;
            if (i + 1 < n) t |= uint256(uint8(data[i + 1])) << 8;
            if (i + 2 < n) t |= uint256(uint8(data[i + 2]));
            out[j++] = table[(t >> 18) & 63];
            out[j++] = table[(t >> 12) & 63];
            out[j++] = i + 1 < n ? table[(t >> 6) & 63] : bytes1("=");
            out[j++] = i + 2 < n ? table[t & 63] : bytes1("=");
        }
        return string(out);
    }

    function _u(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 n = v;
        uint256 len;
        while (n != 0) {
            len++;
            n /= 10;
        }
        bytes memory b = new bytes(len);
        while (v != 0) {
            b[--len] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(b);
    }

    function _hex(address a) private pure returns (string memory) {
        bytes memory out = new bytes(42);
        out[0] = "0";
        out[1] = "x";
        bytes16 digits = "0123456789abcdef";
        uint160 v = uint160(a);
        for (uint256 i = 0; i < 40; i++) {
            out[41 - i] = digits[v & 0xf];
            v >>= 4;
        }
        return string(out);
    }
}
