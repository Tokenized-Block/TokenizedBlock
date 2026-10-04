// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {BlockSkins} from "../src/BlockSkins.sol";

/// @dev ERC-20 with a chosen number of decimals (USDC 6, a tokenized stock 8).
contract Jeton {
    string public name = "Jeton";
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(uint8 d) {
        decimals = d;
    }

    function mint(address to, uint256 a) external {
        balanceOf[to] += a;
    }

    function approve(address s, uint256 a) external returns (bool) {
        allowance[msg.sender][s] = a;
        return true;
    }

    function transfer(address to, uint256 a) external virtual returns (bool) {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address to, uint256 a) external virtual returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// @dev takes 1 % on every transfer: must be refused at the bid.
contract JetonATaxe is Jeton(18) {
    function transferFrom(address f, address to, uint256 a) external override returns (bool) {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a - a / 100;
        return true;
    }
}

/// @dev a token with a blacklist (USDC has one): a transfer TO a blocked account reverts.
contract JetonListeNoire is Jeton(6) {
    mapping(address => bool) public bloque;

    function bloquer(address a, bool b) external {
        bloque[a] = b;
    }

    function transfer(address to, uint256 a) external override returns (bool) {
        require(!bloque[to], "blacklisted");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// @dev a bidder / seller that refuses ETH.
contract RefuseEth {
    BlockSkins s;

    constructor(BlockSkins s_) {
        s = s_;
    }

    function encherir(uint256 id, uint256 a) external payable {
        s.bid{value: a}(id, a);
    }

    function retirer() external {
        s.withdraw(address(0));
    }

    receive() external payable {
        revert("no eth");
    }
}

/// @dev re-enters the contract from the ONE callback that carries full gas: the ETH withdrawal. What it tries (a mint, which
///      it can pay for) would SUCCEED without the lock — so a green here is the lock, not a lucky revert.
contract Reentrant {
    BlockSkins s;
    address bloc;
    uint64 recette;
    bool public aTente;
    bool public reentreeReussie;

    constructor(BlockSkins s_, address usdc, address bloc_, uint64 recette_) {
        s = s_;
        bloc = bloc_;
        recette = recette_;
        Jeton(usdc).approve(address(s_), type(uint256).max);
    }

    function encherir(uint256 id, uint256 a) external payable {
        s.bid{value: a}(id, a);
    }

    function retirer() external {
        s.withdraw(address(0));
    }

    receive() external payable {
        aTente = true;
        try s.mint(bloc, recette) returns (uint256) {
            reentreeReussie = true;
        } catch {}
    }
}

contract BlockSkinsTest is Test {
    BlockSkins s;
    Jeton usdc;
    Jeton action; // a tokenized stock, 8 decimals
    address constant FRAIS = address(0xFEE5);
    address constant BLOC = address(0xb200000000000000000000e4B0c5fBE9C8DF579E);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA401);
    address agent = address(0xA6E47);
    uint64 recette;

    function setUp() public {
        usdc = new Jeton(6);
        action = new Jeton(8);
        s = new BlockSkins(address(usdc), FRAIS);
        for (uint256 i = 0; i < 3; i++) {
            address a = [alice, bob, carol][i];
            usdc.mint(a, 1_000e6);
            action.mint(a, 100e8);
            vm.deal(a, 100 ether);
            vm.startPrank(a);
            usdc.approve(address(s), type(uint256).max);
            action.approve(address(s), type(uint256).max);
            vm.stopPrank();
        }
        recette = s.packRecipe([uint16(210), 267, 263, 92, 120, 300, 200]);
    }

    function _mint(address qui) internal returns (uint256 id) {
        vm.prank(qui);
        id = s.mint(BLOC, recette);
    }

    // ─────────────── mint
    function test_mint_paie_exactement_1_usdc_au_wallet_des_frais() public {
        uint256 avant = usdc.balanceOf(alice);
        uint256 id = _mint(alice);
        assertEq(usdc.balanceOf(FRAIS), 1e6, "le wallet des frais recoit 1 USDC");
        assertEq(avant - usdc.balanceOf(alice), 1e6, "l acheteur perd 1 USDC");
        assertEq(usdc.balanceOf(address(s)), 0, "le contrat ne garde rien");
        assertEq(s.ownerOf(id), alice);
        assertEq(s.balanceOf(alice), 1);
        assertEq(s.totalSupply(), 1);
        (address b, uint64 r, address m) = s.skinOf(id);
        assertEq(b, BLOC);
        assertEq(r, recette);
        assertEq(m, alice);
    }

    function test_recette_aller_retour_et_bornes() public {
        uint16[7] memory h = s.unpackRecipe(recette);
        assertEq(h[0], 210);
        assertEq(h[3], 92);
        assertEq(h[6], 200);
        vm.expectRevert(BlockSkins.BadRecipe.selector);
        s.packRecipe([uint16(360), 0, 0, 0, 0, 0, 0]);
        // une recette brute avec une teinte a 511 (9 bits pleins) est refusee au mint
        vm.prank(alice);
        vm.expectRevert(BlockSkins.BadRecipe.selector);
        s.mint(BLOC, uint64(511));
        vm.prank(alice);
        vm.expectRevert(BlockSkins.BadRecipe.selector);
        s.mint(BLOC, uint64(1) << 63);
        vm.prank(alice);
        vm.expectRevert(BlockSkins.BadAddress.selector);
        s.mint(address(0), recette);
    }

    function test_mint_sans_usdc_ou_sans_approbation_echoue() public {
        address pauvre = address(0xDEAD1);
        vm.prank(pauvre);
        vm.expectRevert();
        s.mint(BLOC, recette);
        assertEq(s.totalSupply(), 0);
        assertEq(usdc.balanceOf(FRAIS), 0);
    }

    function test_tokenURI_dit_le_block_et_les_sept_teintes() public {
        uint256 id = _mint(alice);
        string memory u = s.tokenURI(id);
        assertEq(
            u,
            'data:application/json;utf8,{"name":"TokenizedBlock skin #1","description":"A skin for one block: a look, not a right over the block.","block":"0xb200000000000000000000e4b0c5fbe9c8df579e","hues":[210,267,263,92,120,300,200]}'
        );
    }

    // ─────────────── ERC-721
    function test_erc721_transfert_approbation_et_refus() public {
        uint256 id = _mint(alice);
        vm.prank(bob);
        vm.expectRevert(BlockSkins.NotAllowed.selector);
        s.transferFrom(alice, bob, id);
        vm.prank(alice);
        s.approve(bob, id);
        vm.prank(bob);
        s.transferFrom(alice, carol, id);
        assertEq(s.ownerOf(id), carol);
        assertEq(s.getApproved(id), address(0), "l approbation tombe au transfert");
        assertTrue(s.supportsInterface(0x80ac58cd));
        vm.expectRevert(BlockSkins.BadAddress.selector);
        s.ownerOf(999);
    }

    // ─────────────── prix fixe
    function test_vente_usdc_10_pourcent_au_dev_90_au_vendeur() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(usdc), 50e6);
        assertEq(s.ownerOf(id), address(s), "le NFT est tenu par le contrat pendant la vente");
        uint256 fAvant = usdc.balanceOf(FRAIS);
        uint256 aAvant = usdc.balanceOf(alice);
        vm.prank(bob);
        s.buy(id);
        assertEq(s.ownerOf(id), bob);
        assertEq(usdc.balanceOf(FRAIS) - fAvant, 5e6, "10 % au wallet des frais");
        assertEq(usdc.balanceOf(alice) - aAvant, 45e6, "90 % au vendeur");
        assertEq(usdc.balanceOf(address(s)), 0, "le contrat ne garde rien");
    }

    function test_vente_eth_et_mauvais_montant_refuse() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(0), 1 ether);
        vm.prank(bob);
        vm.expectRevert(BlockSkins.WrongValue.selector);
        s.buy{value: 0.9 ether}(id);
        uint256 aAvant = alice.balance;
        vm.prank(bob);
        s.buy{value: 1 ether}(id);
        assertEq(FRAIS.balance, 0.1 ether);
        assertEq(alice.balance - aAvant, 0.9 ether);
        assertEq(address(s).balance, 0);
    }

    function test_vente_en_action_tokenisee_si_admise_seulement() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(BlockSkins.NotAllowed.selector);
        s.list(id, address(action), 1e8);
        s.setCurrency(address(action), true);
        vm.prank(alice);
        s.list(id, address(action), 2e8);
        // retirer la devise ensuite ne bloque PAS la vente en cours
        s.setCurrency(address(action), false);
        vm.prank(bob);
        s.buy(id);
        assertEq(action.balanceOf(FRAIS), 0.2e8);
        assertEq(s.ownerOf(id), bob);
    }

    function test_seul_le_proprietaire_liste_et_le_vendeur_retire() public {
        uint256 id = _mint(alice);
        vm.prank(bob);
        vm.expectRevert(BlockSkins.NotAllowed.selector);
        s.list(id, address(0), 1 ether);
        vm.prank(alice);
        vm.expectRevert(BlockSkins.BadPrice.selector);
        s.list(id, address(0), 0);
        vm.prank(alice);
        s.list(id, address(0), 1 ether);
        vm.prank(bob);
        vm.expectRevert(BlockSkins.NotAllowed.selector);
        s.unlist(id);
        vm.prank(alice);
        s.unlist(id);
        assertEq(s.ownerOf(id), alice);
        vm.prank(bob);
        vm.expectRevert(BlockSkins.NotListed.selector);
        s.buy{value: 1 ether}(id);
    }

    function test_seul_owner_change_les_devises() public {
        vm.prank(alice);
        vm.expectRevert(BlockSkins.NotOwner.selector);
        s.setCurrency(address(action), true);
        vm.prank(alice);
        vm.expectRevert(BlockSkins.NotOwner.selector);
        s.transferOwnership(alice);
    }

    // ─────────────── les deux cochent, un agent execute
    function test_double_validation_executee_par_un_agent_usdc() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(usdc), 20e6);
        vm.prank(agent);
        vm.expectRevert(BlockSkins.NotValidated.selector);
        s.executeValidated(id, bob);
        vm.prank(bob);
        s.validateBuy(id);
        uint256 gAvant = usdc.balanceOf(agent);
        vm.prank(agent);
        s.executeValidated(id, bob);
        assertEq(s.ownerOf(id), bob, "l acheteur recoit le NFT");
        assertEq(usdc.balanceOf(FRAIS), 1e6 + 2e6, "1 USDC de mint + 10 % de la vente");
        assertEq(usdc.balanceOf(agent), gAvant, "l agent ne touche rien");
        assertEq(s.balanceOf(agent), 0, "l agent ne detient jamais le NFT");
    }

    function test_double_validation_eth_et_revocation() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(0), 2 ether);
        vm.prank(bob);
        vm.expectRevert(BlockSkins.WrongValue.selector);
        s.validateBuy{value: 1 ether}(id);
        vm.prank(bob);
        s.validateBuy{value: 2 ether}(id);
        // carol valide aussi, puis c est bob qui est execute : carol reprend son ETH
        vm.prank(carol);
        s.validateBuy{value: 2 ether}(id);
        vm.prank(agent);
        s.executeValidated(id, bob);
        assertEq(s.ownerOf(id), bob);
        assertEq(FRAIS.balance, 0.2 ether);
        uint256 cAvant = carol.balance;
        vm.startPrank(carol);
        s.revokeBuy(id);
        s.withdraw(address(0));
        vm.stopPrank();
        assertEq(carol.balance - cAvant, 2 ether, "la validation non servie rend l ETH en entier");
        assertEq(address(s).balance, 0);
    }

    function test_validation_ne_vaut_que_pour_le_prix_coche() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(usdc), 20e6);
        vm.prank(bob);
        s.validateBuy(id);
        // le vendeur retire et reliste PLUS CHER : la validation de bob ne doit pas le faire payer 500
        vm.startPrank(alice);
        s.unlist(id);
        s.list(id, address(usdc), 500e6);
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(BlockSkins.ListingChanged.selector);
        s.executeValidated(id, bob);
    }

    // ─────────────── encheres
    function test_enchere_complete_en_eth() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        vm.expectRevert(BlockSkins.BadDuration.selector);
        s.startAuction(id, address(0), 0.1 ether, 7 days + 1);
        vm.prank(alice);
        s.startAuction(id, address(0), 0.1 ether, 1 days);
        vm.prank(bob);
        vm.expectRevert(BlockSkins.BidTooLow.selector);
        s.bid{value: 0.05 ether}(id, 0.05 ether);
        vm.prank(bob);
        s.bid{value: 0.1 ether}(id, 0.1 ether);
        vm.prank(carol);
        vm.expectRevert(BlockSkins.BidTooLow.selector);
        s.bid{value: 0.1 ether}(id, 0.1 ether);
        vm.prank(carol);
        s.bid{value: 0.3 ether}(id, 0.3 ether);
        assertEq(s.pending(address(0), bob), 0.1 ether, "l enchere depassee est creditee");
        vm.prank(alice);
        vm.expectRevert(BlockSkins.HasBids.selector);
        s.unlist(id);
        vm.expectRevert(BlockSkins.NotEnded.selector);
        s.settle(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(bob);
        vm.expectRevert(BlockSkins.Ended.selector);
        s.bid{value: 1 ether}(id, 1 ether);
        uint256 aAvant = alice.balance;
        vm.prank(agent);
        s.settle(id); // n importe qui regle
        assertEq(s.ownerOf(id), carol);
        assertEq(FRAIS.balance, 0.03 ether);
        assertEq(alice.balance - aAvant, 0.27 ether);
        uint256 bAvant = bob.balance;
        vm.prank(bob);
        s.withdraw(address(0));
        assertEq(bob.balance - bAvant, 0.1 ether);
        assertEq(address(s).balance, 0, "tout est sorti du contrat");
        vm.expectRevert(BlockSkins.NotListed.selector);
        s.settle(id);
    }

    function test_enchere_sans_offre_rend_le_nft() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(usdc), 10e6, 2 hours);
        vm.warp(block.timestamp + 2 hours);
        s.settle(id);
        assertEq(s.ownerOf(id), alice);
    }

    function test_enchere_tardive_prolonge_mais_jamais_au_dela_de_7_jours() public {
        uint256 id = _mint(alice);
        uint256 t0 = block.timestamp;
        vm.prank(alice);
        s.startAuction(id, address(usdc), 1e6, 7 days);
        vm.warp(t0 + 7 days - 60);
        vm.prank(bob);
        s.bid(id, 1e6);
        (,,,, uint64 fin,,,) = s.listingOf(id);
        assertEq(uint256(fin), t0 + 7 days, "plafonne a 7 jours du depart");
        // une enchere courte, elle, est prolongee de 5 minutes
        uint256 id2 = _mint(alice);
        uint256 t1 = block.timestamp;
        vm.prank(alice);
        s.startAuction(id2, address(usdc), 1e6, 1 hours);
        vm.warp(t1 + 1 hours - 60);
        vm.prank(bob);
        s.bid(id2, 1e6);
        (,,,, uint64 fin2,,,) = s.listingOf(id2);
        assertEq(uint256(fin2), block.timestamp + 5 minutes);
    }

    function test_enchere_usdc_rembourse_par_retrait() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(usdc), 5e6, 1 hours);
        vm.prank(bob);
        s.bid(id, 5e6);
        vm.prank(carol);
        s.bid(id, 9e6);
        uint256 bAvant = usdc.balanceOf(bob);
        vm.prank(bob);
        s.withdraw(address(usdc));
        assertEq(usdc.balanceOf(bob) - bAvant, 5e6);
        vm.prank(bob);
        vm.expectRevert(BlockSkins.NothingToWithdraw.selector);
        s.withdraw(address(usdc));
        vm.warp(block.timestamp + 1 hours);
        s.settle(id);
        assertEq(usdc.balanceOf(address(s)), 0);
        assertEq(usdc.balanceOf(FRAIS), 1e6 + 0.9e6);
    }

    // ─────────────── tricheries
    function test_un_encherisseur_qui_refuse_l_eth_ne_bloque_pas_l_enchere() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(0), 0.1 ether, 1 hours);
        RefuseEth mechant = new RefuseEth(s);
        mechant.encherir{value: 0.1 ether}(id, 0.1 ether);
        vm.prank(bob);
        s.bid{value: 0.2 ether}(id, 0.2 ether); // passe : le mechant est credite, pas rembourse en direct
        assertEq(s.pending(address(0), address(mechant)), 0.1 ether);
        vm.expectRevert(BlockSkins.TransferFailed.selector);
        mechant.retirer(); // il ne bloque que lui-meme
    }

    function test_un_vendeur_qui_refuse_l_eth_est_credite_la_vente_passe() public {
        RefuseEth vendeur = new RefuseEth(s);
        usdc.mint(address(vendeur), 1e6);
        vm.startPrank(address(vendeur));
        usdc.approve(address(s), 1e6);
        uint256 id = s.mint(BLOC, recette);
        s.list(id, address(0), 1 ether);
        vm.stopPrank();
        vm.prank(bob);
        s.buy{value: 1 ether}(id);
        assertEq(s.ownerOf(id), bob, "l acheteur a son NFT");
        assertEq(s.pending(address(0), address(vendeur)), 0.9 ether, "le vendeur est credite");
        assertEq(FRAIS.balance, 0.1 ether);
    }

    function test_reentree_refusee() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(0), 0.1 ether, 1 hours);
        Reentrant r = new Reentrant(s, address(usdc), BLOC, recette);
        usdc.mint(address(r), 1e6); // de quoi PAYER le mint qu il va tenter
        r.encherir{value: 0.1 ether}(id, 0.1 ether);
        vm.prank(bob);
        s.bid{value: 0.2 ether}(id, 0.2 ether);
        uint256 avant = s.totalSupply();
        r.retirer();
        assertTrue(r.aTente(), "il a bien tente de re-entrer pendant son retrait");
        assertFalse(r.reentreeReussie(), "la re-entree est refusee");
        assertEq(s.totalSupply(), avant, "rien n a ete minte pendant le retrait");
        assertEq(address(r).balance, 0.1 ether, "et son retrait, lui, est passe");
    }

    function test_valider_deux_fois_en_eth_ne_perd_pas_le_premier_depot() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(0), 1 ether);
        vm.startPrank(bob);
        s.validateBuy{value: 1 ether}(id);
        s.validateBuy{value: 1 ether}(id);
        vm.stopPrank();
        assertEq(s.pending(address(0), bob), 1 ether, "le premier depot est credite, pas perdu");
        vm.prank(agent);
        s.executeValidated(id, bob);
        uint256 avant = bob.balance;
        vm.prank(bob);
        s.withdraw(address(0));
        assertEq(bob.balance - avant, 1 ether);
        assertEq(address(s).balance, 0, "tout est sorti du contrat");
    }

    function test_jeton_a_taxe_refuse_a_l_enchere() public {
        JetonATaxe taxe = new JetonATaxe();
        s.setCurrency(address(taxe), true);
        taxe.mint(bob, 100 ether);
        vm.prank(bob);
        taxe.approve(address(s), type(uint256).max);
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(taxe), 1 ether, 1 hours);
        vm.prank(bob);
        vm.expectRevert(BlockSkins.FeeOnTransfer.selector);
        s.bid(id, 1 ether);
    }

    function test_eth_envoye_sur_une_vente_en_jeton_est_refuse() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(usdc), 5e6);
        vm.prank(bob);
        vm.expectRevert(BlockSkins.WrongValue.selector);
        s.buy{value: 1}(id);
    }

    // ─────────────── ce que la relecture a trouve (2026-10-04) : chacun ROUGE avant le correctif
    function test_validation_ne_survit_pas_a_une_remise_en_vente_au_meme_prix() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(usdc), 20e6);
        vm.prank(bob);
        s.validateBuy(id);
        vm.startPrank(alice);
        s.unlist(id);
        s.list(id, address(usdc), 20e6); // MEME prix, MEME devise : c est quand meme une autre mise en vente
        vm.stopPrank();
        vm.prank(agent);
        vm.expectRevert(BlockSkins.ListingChanged.selector);
        s.executeValidated(id, bob);
        assertEq(s.ownerOf(id), address(s));
    }

    function test_jeton_a_taxe_refuse_aussi_a_l_achat_et_a_la_validation() public {
        JetonATaxe taxe = new JetonATaxe();
        s.setCurrency(address(taxe), true);
        taxe.mint(bob, 100 ether);
        // le contrat tient deja des jetons de cette devise (le sequestre d un autre) : sans le controle, la vente
        // serait payee avec EUX
        taxe.mint(address(s), 50 ether);
        vm.prank(bob);
        taxe.approve(address(s), type(uint256).max);
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.list(id, address(taxe), 10 ether);
        vm.prank(bob);
        vm.expectRevert(BlockSkins.FeeOnTransfer.selector);
        s.buy(id);
        vm.prank(bob);
        s.validateBuy(id);
        vm.prank(agent);
        vm.expectRevert(BlockSkins.FeeOnTransfer.selector);
        s.executeValidated(id, bob);
        assertEq(taxe.balanceOf(address(s)), 50 ether, "le sequestre des autres est intact");
    }

    function test_un_vendeur_blackliste_ne_bloque_pas_le_reglement() public {
        JetonListeNoire t = new JetonListeNoire();
        s.setCurrency(address(t), true);
        t.mint(bob, 100e6);
        vm.prank(bob);
        t.approve(address(s), type(uint256).max);
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(t), 10e6, 1 hours);
        vm.prank(bob);
        s.bid(id, 10e6);
        t.bloquer(alice, true);
        vm.warp(block.timestamp + 1 hours);
        s.settle(id); // ne revert PAS
        assertEq(s.ownerOf(id), bob, "le gagnant a son NFT");
        assertEq(t.balanceOf(FRAIS), 1e6, "les frais sont payes");
        assertEq(s.pending(address(t), alice), 9e6, "le vendeur est credite");
        assertEq(t.balanceOf(address(s)), 9e6, "et le contrat tient exactement ce credit");
        t.bloquer(alice, false);
        vm.prank(alice);
        s.withdraw(address(t));
        assertEq(t.balanceOf(alice), 9e6);
        assertEq(t.balanceOf(address(s)), 0);
    }

    function test_surenchere_minimale_5_pourcent() public {
        uint256 id = _mint(alice);
        vm.prank(alice);
        s.startAuction(id, address(0), 1 ether, 1 hours);
        vm.prank(bob);
        s.bid{value: 1 ether}(id, 1 ether);
        vm.prank(carol);
        vm.expectRevert(BlockSkins.BidTooLow.selector);
        s.bid{value: 1.049 ether}(id, 1.049 ether);
        vm.prank(carol);
        s.bid{value: 1.05 ether}(id, 1.05 ether);
        (,,,,,, address encherisseur, uint256 mise) = s.listingOf(id);
        assertEq(encherisseur, carol);
        assertEq(mise, 1.05 ether);
    }

    function test_skinsPage_rend_le_detenteur_reel_meme_en_vente() public {
        uint256 a = _mint(alice);
        uint256 b = _mint(bob);
        vm.prank(alice);
        s.list(a, address(usdc), 7e6);
        BlockSkins.SkinView[] memory p = s.skinsPage(0, 50);
        assertEq(p.length, 2);
        assertEq(p[0].tokenId, a);
        assertEq(p[0].holder, alice, "en vente : le detenteur affiche est le VENDEUR, pas le contrat");
        assertTrue(p[0].listed);
        assertFalse(p[0].auction);
        assertEq(p[0].price, 7e6);
        assertEq(p[0].currency, address(usdc));
        assertEq(p[0].recipe, recette);
        assertEq(p[1].tokenId, b);
        assertEq(p[1].holder, bob);
        assertFalse(p[1].listed);
        assertEq(s.skinsPage(2, 1).length, 1);
        assertEq(s.skinsPage(3, 10).length, 0);
    }

    // ─────────────── arithmetique des frais, sur tout l intervalle
    function testFuzz_frais_10_pourcent_et_rien_ne_reste(uint96 prix) public {
        vm.assume(prix > 0);
        uint256 id = _mint(alice);
        vm.deal(bob, uint256(prix));
        vm.prank(alice);
        s.list(id, address(0), prix);
        uint256 fAvant = FRAIS.balance;
        uint256 aAvant = alice.balance;
        vm.prank(bob);
        s.buy{value: prix}(id);
        uint256 frais = FRAIS.balance - fAvant;
        uint256 vendeur = alice.balance - aAvant;
        assertEq(frais, (uint256(prix) * 1000) / 10_000);
        assertEq(frais + vendeur, prix, "frais + vendeur = prix, au wei pres");
        assertEq(address(s).balance, 0);
    }
}
