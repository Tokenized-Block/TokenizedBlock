// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BlockSkins — a skin for a block is an NFT; its market lives in the same contract.
/// @notice Phil, 2026-10-04: "when the user pays 1 USDC he receives the NFT of the skin he chose"; "he can resell it on a market
///         made only of block skins"; "auctions with a set duration, one week at most"; "sale and auction in ETH, USDC or a
///         tokenized stock with a deep pool"; "if both tick 'valid' the transaction is automatic, agents make the exchange";
///         "fees: 1 USDC on creation, 10 % on each sale".
///
/// WHAT IT IS
///   - mint(): pulls exactly 1 USDC from the caller to the fee wallet and mints one token. The token stores WHICH block it dresses
///     and its recipe — seven hues from 0 to 359 (ring turn, three ring hues, edges, core, background), the same recipe the app
///     paints. The skin is a look: it gives no right over the block.
///   - a fixed-price listing and an auction. The NFT is held by this contract while listed. A sale pays 10 % to the fee wallet and
///     the rest to the seller, in the listing's currency: ETH (address(0)), USDC, or a token the owner has allowed.
///   - an auction lasts at most 7 days from its start. A bid in the last 5 minutes extends it by 5 minutes, never past the 7 days.
///     An outbid bidder is credited and WITHDRAWS (pull): a bidder that cannot receive can never block the auction.
///     A new bid must raise the highest one by at least 5 %.
///   - "both ticked": the seller's listing is one validation; a buyer's validateBuy() is the other (it is bound to THAT listing
///     — its price and currency never change — and for ETH it holds his payment). Then ANYONE — an agent — may call
///     executeValidated(): the trade happens between the two of them. The agent never holds the funds nor the NFT. A listing
///     that is withdrawn and opened again is a NEW listing: an old validation never applies to it.
///
/// WHAT IT IS NOT, said plainly
///   - not upgradeable, no pause, no way for anyone to move a user's NFT or funds outside the rules above;
///   - the owner can ONLY allow or disallow a payment currency for NEW listings ("deep pool" is judged off chain) and hand
///     over ownership. Disallowing a currency never blocks an existing listing, bid, settlement or withdrawal;
///   - a token that takes a fee on transfer is refused wherever this contract receives it (the amount received must equal the
///     amount asked), otherwise a sale would be paid out of other users' escrow;
///   - a seller or fee wallet that cannot RECEIVE (ETH refused, token transfer reverting — a blacklist) is credited and
///     withdraws later: it can never block a sale or a settlement.
/// @dev No external library: a minimal ERC-721 is written here so the whole behaviour is in one file to read.
contract BlockSkins {
    // ───────────────────────────── constants
    uint256 public constant MINT_PRICE = 1_000_000; // 1 USDC (6 decimals)
    uint256 public constant SALE_FEE_BPS = 1000; // 10 %
    uint256 public constant MAX_AUCTION = 7 days;
    uint256 public constant EXTENSION = 5 minutes;
    uint256 public constant MIN_RAISE_BPS = 500; // a bid must raise the highest one by 5 %
    uint256 private constant MAX_HUE = 359;

    address public immutable USDC;
    address public immutable FEE_WALLET;

    // ───────────────────────────── ERC-721 state
    string public constant name = "TokenizedBlock Skins";
    string public constant symbol = "TBSKIN";
    uint256 public totalSupply;
    mapping(uint256 => address) private _ownerOf;
    mapping(address => uint256) private _balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    // ───────────────────────────── skins
    struct Skin {
        address blockToken; // the block this skin dresses
        uint64 recipe; // seven 9-bit hues: turn | h1 | h2 | h3 | edges | core | background
        address minter;
    }

    mapping(uint256 => Skin) public skinOf;

    // ───────────────────────────── market
    address public owner;
    mapping(address => bool) public currencyAllowed; // address(0) = ETH

    struct Listing {
        address seller;
        address currency;
        uint256 price; // fixed price, or the minimum bid of an auction
        uint64 start; // 0 = fixed price ; otherwise the auction's start
        uint64 end;
        uint64 id; // a new number at every listing: a buyer's validation is for ONE listing, never a later one
        address bidder; // highest bidder (auction)
        uint256 bid; // highest bid, held by this contract
    }

    mapping(uint256 => Listing) public listingOf;
    uint64 private _listingSeq;
    /// @notice credits to withdraw: pending[currency][account]
    mapping(address => mapping(address => uint256)) public pending;

    struct Validation {
        uint64 listing; // the listing he agreed to (0 = none)
        uint256 ethHeld;
    }

    /// @notice a buyer's "valid" tick on a fixed-price listing: validated[tokenId][buyer]
    mapping(uint256 => mapping(address => Validation)) public validated;

    uint256 private _lock = 1;

    // ───────────────────────────── events
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event SkinMinted(uint256 indexed tokenId, address indexed minter, address indexed blockToken, uint64 recipe);
    event Listed(uint256 indexed tokenId, address indexed seller, address currency, uint256 price, uint64 end);
    event Unlisted(uint256 indexed tokenId);
    event Bid(uint256 indexed tokenId, address indexed bidder, uint256 amount, uint64 end);
    event Sold(uint256 indexed tokenId, address indexed seller, address indexed buyer, address currency, uint256 price, uint256 fee);
    event BuyValidated(uint256 indexed tokenId, address indexed buyer, address currency, uint256 price);
    event BuyRevoked(uint256 indexed tokenId, address indexed buyer);
    event CurrencySet(address indexed currency, bool allowed);
    event OwnershipTransferred(address indexed from, address indexed to);

    // ───────────────────────────── errors
    error NotOwner();
    error NotAllowed();
    error BadRecipe();
    error BadAddress();
    error BadPrice();
    error BadDuration();
    error NotListed();
    error NotAuction();
    error IsAuction();
    error Ended();
    error NotEnded();
    error BidTooLow();
    error WrongValue();
    error NothingToWithdraw();
    error NotValidated();
    error ListingChanged();
    error TransferFailed();
    error Reentrancy();
    error UnsafeRecipient();
    error FeeOnTransfer();
    error HasBids();

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    constructor(address usdc, address feeWallet) {
        if (usdc == address(0) || feeWallet == address(0)) revert BadAddress();
        USDC = usdc;
        FEE_WALLET = feeWallet;
        owner = msg.sender;
        currencyAllowed[address(0)] = true;
        currencyAllowed[usdc] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit CurrencySet(address(0), true);
        emit CurrencySet(usdc, true);
    }

    // ───────────────────────────── owner (currencies only)
    function setCurrency(address currency, bool allowed) external {
        if (msg.sender != owner) revert NotOwner();
        currencyAllowed[currency] = allowed;
        emit CurrencySet(currency, allowed);
    }

    function transferOwnership(address to) external {
        if (msg.sender != owner) revert NotOwner();
        if (to == address(0)) revert BadAddress();
        emit OwnershipTransferred(owner, to);
        owner = to;
    }

    // ───────────────────────────── recipe
    /// @notice packs seven hues (each 0..359) into a recipe. Reverts on a hue above 359.
    function packRecipe(uint16[7] calldata hues) public pure returns (uint64 recipe) {
        for (uint256 i = 0; i < 7; i++) {
            if (hues[i] > MAX_HUE) revert BadRecipe();
            recipe |= uint64(hues[i]) << uint64(9 * i);
        }
    }

    /// @notice the seven hues of a recipe: ring turn, ring 1, ring 2, ring 3, edges, core, background.
    function unpackRecipe(uint64 recipe) public pure returns (uint16[7] memory hues) {
        for (uint256 i = 0; i < 7; i++) hues[i] = uint16((recipe >> uint64(9 * i)) & 0x1FF);
    }

    function _checkRecipe(uint64 recipe) private pure {
        if (recipe >> 63 != 0) revert BadRecipe();
        for (uint256 i = 0; i < 7; i++) if (((recipe >> uint64(9 * i)) & 0x1FF) > MAX_HUE) revert BadRecipe();
    }

    // ───────────────────────────── mint: 1 USDC to the fee wallet
    function mint(address blockToken, uint64 recipe) external nonReentrant returns (uint256 tokenId) {
        if (blockToken == address(0)) revert BadAddress();
        _checkRecipe(recipe);
        _pull(USDC, msg.sender, FEE_WALLET, MINT_PRICE);
        tokenId = ++totalSupply;
        skinOf[tokenId] = Skin({blockToken: blockToken, recipe: recipe, minter: msg.sender});
        _ownerOf[tokenId] = msg.sender;
        _balanceOf[msg.sender] += 1;
        emit Transfer(address(0), msg.sender, tokenId);
        emit SkinMinted(tokenId, msg.sender, blockToken, recipe);
    }

    // ───────────────────────────── fixed price
    function list(uint256 tokenId, address currency, uint256 price) external nonReentrant {
        _open(tokenId, currency, price, 0);
    }

    /// @notice the seller takes his NFT back. An auction with a bid cannot be cancelled.
    function unlist(uint256 tokenId) external nonReentrant {
        Listing memory l = listingOf[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (msg.sender != l.seller) revert NotAllowed();
        if (l.bidder != address(0)) revert HasBids();
        delete listingOf[tokenId];
        _move(address(this), l.seller, tokenId);
        emit Unlisted(tokenId);
    }

    function buy(uint256 tokenId) external payable nonReentrant {
        Listing memory l = listingOf[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.start != 0) revert IsAuction();
        delete listingOf[tokenId];
        if (l.currency == address(0)) {
            if (msg.value != l.price) revert WrongValue();
        } else {
            if (msg.value != 0) revert WrongValue();
            _pullIn(l.currency, msg.sender, l.price);
        }
        _payOut(tokenId, l.seller, msg.sender, l.currency, l.price);
    }

    // ───────────────────────────── "both ticked": validated buy, executed by anyone
    /// @notice the buyer agrees to THIS listing (its price and currency). For ETH his payment is held here; for a token he must
    ///         also have approved this contract. Anyone may then call executeValidated.
    function validateBuy(uint256 tokenId) external payable nonReentrant {
        Listing memory l = listingOf[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.start != 0) revert IsAuction();
        Validation memory old = validated[tokenId][msg.sender];
        if (old.ethHeld != 0) pending[address(0)][msg.sender] += old.ethHeld;
        if (l.currency == address(0)) {
            if (msg.value != l.price) revert WrongValue();
        } else if (msg.value != 0) {
            revert WrongValue();
        }
        validated[tokenId][msg.sender] = Validation({listing: l.id, ethHeld: msg.value});
        emit BuyValidated(tokenId, msg.sender, l.currency, l.price);
    }

    function revokeBuy(uint256 tokenId) external nonReentrant {
        Validation memory v = validated[tokenId][msg.sender];
        if (v.listing == 0) revert NotValidated();
        delete validated[tokenId][msg.sender];
        if (v.ethHeld != 0) pending[address(0)][msg.sender] += v.ethHeld;
        emit BuyRevoked(tokenId, msg.sender);
    }

    /// @notice anyone (an agent) executes a trade both sides have validated. It moves funds only between the two of them and
    ///         the fee wallet.
    function executeValidated(uint256 tokenId, address buyer) external nonReentrant {
        Listing memory l = listingOf[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.start != 0) revert IsAuction();
        Validation memory v = validated[tokenId][buyer];
        if (v.listing == 0) revert NotValidated();
        if (v.listing != l.id) revert ListingChanged();
        delete validated[tokenId][buyer];
        delete listingOf[tokenId];
        if (l.currency != address(0)) _pullIn(l.currency, buyer, l.price);
        _payOut(tokenId, l.seller, buyer, l.currency, l.price);
    }

    // ───────────────────────────── auction
    function startAuction(uint256 tokenId, address currency, uint256 minBid, uint256 duration) external nonReentrant {
        if (duration == 0 || duration > MAX_AUCTION) revert BadDuration();
        _open(tokenId, currency, minBid, duration);
    }

    function bid(uint256 tokenId, uint256 amount) external payable nonReentrant {
        Listing storage l = listingOf[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.start == 0) revert NotAuction();
        if (block.timestamp >= l.end) revert Ended();
        uint256 floor = l.bid == 0 ? l.price : l.bid + (l.bid * MIN_RAISE_BPS) / 10_000;
        if (amount < floor || amount <= l.bid) revert BidTooLow();
        address currency = l.currency;
        if (currency == address(0)) {
            if (msg.value != amount) revert WrongValue();
        } else {
            if (msg.value != 0) revert WrongValue();
            _pullIn(currency, msg.sender, amount);
        }
        if (l.bidder != address(0)) pending[currency][l.bidder] += l.bid;
        l.bidder = msg.sender;
        l.bid = amount;
        // a late bid extends the auction, never past 7 days from its start
        uint256 cap = uint256(l.start) + MAX_AUCTION;
        if (uint256(l.end) - block.timestamp < EXTENSION) {
            uint256 e = block.timestamp + EXTENSION;
            l.end = uint64(e > cap ? cap : e);
        }
        emit Bid(tokenId, msg.sender, amount, l.end);
    }

    /// @notice after the end, anyone settles: the winner gets the NFT, the seller 90 %, the fee wallet 10 %. No bid = the NFT
    ///         goes back to the seller.
    function settle(uint256 tokenId) external nonReentrant {
        Listing memory l = listingOf[tokenId];
        if (l.seller == address(0)) revert NotListed();
        if (l.start == 0) revert NotAuction();
        if (block.timestamp < l.end) revert NotEnded();
        delete listingOf[tokenId];
        if (l.bidder == address(0)) {
            _move(address(this), l.seller, tokenId);
            emit Unlisted(tokenId);
        } else {
            _payOut(tokenId, l.seller, l.bidder, l.currency, l.bid);
        }
    }

    function withdraw(address currency) external nonReentrant {
        uint256 amount = pending[currency][msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pending[currency][msg.sender] = 0;
        if (currency == address(0)) {
            (bool ok,) = msg.sender.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            _push(currency, msg.sender, amount);
        }
    }

    // ───────────────────────────── internals
    function _open(uint256 tokenId, address currency, uint256 price, uint256 duration) private {
        if (_ownerOf[tokenId] != msg.sender) revert NotAllowed();
        if (!currencyAllowed[currency]) revert NotAllowed();
        if (price == 0) revert BadPrice();
        _move(msg.sender, address(this), tokenId);
        uint64 start = duration == 0 ? 0 : uint64(block.timestamp);
        uint64 end = duration == 0 ? 0 : uint64(block.timestamp + duration);
        uint64 id = ++_listingSeq;
        listingOf[tokenId] = Listing({
            seller: msg.sender,
            currency: currency,
            price: price,
            start: start,
            end: end,
            id: id,
            bidder: address(0),
            bid: 0
        });
        emit Listed(tokenId, msg.sender, currency, price, end);
    }

    /// @dev the contract holds `price` of `currency`; pays 10 % to the fee wallet, the rest to the seller, the NFT to the buyer.
    ///      A payment the receiver cannot take (ETH refused, token transfer reverting) is CREDITED instead of reverting:
    ///      nobody can block a sale or a settlement by being unable to receive.
    function _payOut(uint256 tokenId, address seller, address buyer, address currency, uint256 price) private {
        uint256 fee = (price * SALE_FEE_BPS) / 10_000;
        uint256 rest = price - fee;
        _move(address(this), buyer, tokenId);
        if (currency == address(0)) {
            _sendEthOrCredit(FEE_WALLET, fee);
            _sendEthOrCredit(seller, rest);
        } else {
            _pushOrCredit(currency, FEE_WALLET, fee);
            _pushOrCredit(currency, seller, rest);
        }
        emit Sold(tokenId, seller, buyer, currency, price, fee);
    }

    /// @dev no return data is copied: a receiver cannot make the payer burn gas on a huge answer.
    function _sendEthOrCredit(address to, uint256 amount) private {
        if (amount == 0) return;
        bool ok;
        assembly ("memory-safe") {
            ok := call(50000, to, amount, 0, 0, 0, 0)
        }
        if (!ok) pending[address(0)][to] += amount;
    }

    function _pull(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool))) || token.code.length == 0) revert TransferFailed();
    }

    /// @dev pulls `amount` INTO this contract and proves it arrived in full: a token that takes a fee on transfer would
    ///      otherwise be paid out of other users' escrow.
    function _pullIn(address token, address from, uint256 amount) private {
        uint256 before = _balance(token, address(this));
        _pull(token, from, address(this), amount);
        if (_balance(token, address(this)) - before != amount) revert FeeOnTransfer();
    }

    function _push(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }

    function _pushOrCredit(address token, address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        if (!ok || (ret.length != 0 && (ret.length < 32 || abi.decode(ret, (uint256)) != 1))) pending[token][to] += amount;
    }

    function _balance(address token, address who) private view returns (uint256) {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSelector(0x70a08231, who));
        if (!ok || ret.length < 32) revert TransferFailed();
        return abi.decode(ret, (uint256));
    }

    function _move(address from, address to, uint256 tokenId) private {
        delete getApproved[tokenId];
        _balanceOf[from] -= 1;
        _balanceOf[to] += 1;
        _ownerOf[tokenId] = to;
        emit Transfer(from, to, tokenId);
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
        _move(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length != 0) {
            (bool ok, bytes memory ret) =
                to.call(abi.encodeWithSelector(0x150b7a02, msg.sender, from, tokenId, data));
            if (!ok || ret.length < 32 || abi.decode(ret, (bytes4)) != bytes4(0x150b7a02)) revert UnsafeRecipient();
        }
    }

    // ───────────────────────────── one read for the app
    struct SkinView {
        uint256 tokenId;
        address holder; // the owner, or the SELLER while the skin is listed (the contract holds it then)
        address blockToken;
        uint64 recipe;
        bool listed;
        bool auction;
        address currency;
        uint256 price;
        uint64 end;
        address bidder;
        uint256 bid;
    }

    /// @notice `count` skins starting at token `from` (the first token is 1). Reads nothing outside this contract.
    function skinsPage(uint256 from, uint256 count) external view returns (SkinView[] memory page) {
        if (from == 0) from = 1;
        uint256 last = totalSupply;
        if (from > last) return new SkinView[](0);
        if (count > last - from + 1) count = last - from + 1;
        page = new SkinView[](count);
        for (uint256 i = 0; i < count; i++) {
            uint256 id = from + i;
            Listing storage l = listingOf[id];
            SkinView memory v = page[i];
            v.tokenId = id;
            v.blockToken = skinOf[id].blockToken;
            v.recipe = skinOf[id].recipe;
            v.listed = l.seller != address(0);
            v.holder = v.listed ? l.seller : _ownerOf[id];
            v.auction = l.start != 0;
            v.currency = l.currency;
            v.price = l.price;
            v.end = l.end;
            v.bidder = l.bidder;
            v.bid = l.bid;
        }
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f; // ERC-165, ERC-721, ERC-721 metadata
    }

    /// @notice on-chain metadata: the block it dresses and its seven hues. No image is hosted anywhere: the app paints it.
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        Skin memory s = skinOf[tokenId];
        uint16[7] memory h = unpackRecipe(s.recipe);
        return string.concat(
            'data:application/json;utf8,{"name":"TokenizedBlock skin #',
            _u(tokenId),
            '","description":"A skin for one block: a look, not a right over the block.","block":"',
            _hex(s.blockToken),
            '","hues":[',
            _u(h[0]), ",", _u(h[1]), ",", _u(h[2]), ",", _u(h[3]), ",", _u(h[4]), ",", _u(h[5]), ",", _u(h[6]),
            "]}"
        );
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
