// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/TicketPot.sol";

/// @dev USDC de test : 6 decimales, transferFrom standard, et un mode « rend false » pour la garde SafeERC20.
contract UsdcTP {
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public renvoieFaux;

    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function setFaux(bool f) external { renvoieFaux = f; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }

    function transfer(address to, uint256 a) external virtual returns (bool) {
        if (renvoieFaux) return false;
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        if (renvoieFaux) return false;
        require(allowance[f][msg.sender] >= a, "allowance");
        require(balanceOf[f] >= a, "balance");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// @dev jeton HOSTILE : pendant le paiement d un holder, il tente de re-entrer dans claim() (la MEME attestation, ou celle d un autre holder).
contract UsdcHostileTP is UsdcTP {
    TicketPot public cible;
    bytes public rejeu;
    bytes4 public erreurVue;
    bool public reentreeReussie;

    function armer(TicketPot c, bytes calldata appel) external { cible = c; rejeu = appel; }

    function transfer(address to, uint256 a) external override returns (bool) {
        if (address(cible) != address(0) && msg.sender == address(cible)) {
            (bool ok, bytes memory ret) = address(cible).call(rejeu);
            reentreeReussie = ok;
            if (!ok && ret.length >= 4) erreurVue = bytes4(ret);
        }
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract TicketPotTest is Test {
    UsdcTP usdc;
    TicketPot tp;
    uint256 constant CLE = 0xA11CE; /* la cle de TEST publique des bancs (jamais une cle reelle) */
    uint256 constant AUTRE_CLE = 0xB0B;
    address VERIF;
    address GUARDIAN = address(0x6A2D);
    address FEE_WALLET = address(0xFEE);
    address H1 = address(0xA11);
    address H2 = address(0xA22);
    address H3 = address(0xA33);
    address TIERS = address(0xB22);
    uint256 constant T0 = 1_700_006_400; /* 2023-11-15 00:00:00 UTC exactement : / 86400 = 19676 */
    uint32 constant J0 = 19676;
    bytes20 constant TICKET = bytes20(hex"0102030405060708090a0b0c0d0e0f1011121314");
    bytes20 constant T2 = bytes20(uint160(0x2222));
    bytes20 constant T3 = bytes20(uint160(0x3333));

    event Funded(uint32 indexed day, address indexed from, uint256 amount, uint256 potAfter);
    event Closed(uint32 indexed day, uint256 pot, address by);
    event Claimed(uint32 indexed day, address indexed wallet, bytes20 ticket, uint256 amount, uint256 potLeft, address by);
    event RolledOver(uint32 indexed fromDay, uint32 indexed toDay, uint256 amount, uint256 potAfter);
    event Proposed(bytes32 indexed what, address value, uint64 readyAt);
    event Accepted(bytes32 indexed what, address value);

    function setUp() public {
        vm.warp(T0);
        vm.roll(1000);
        VERIF = vm.addr(CLE);
        usdc = new UsdcTP();
        tp = new TicketPot(address(usdc), VERIF, GUARDIAN);
        usdc.mint(FEE_WALLET, 1_000_000_000);
        usdc.mint(TIERS, 1_000_000_000);
    }

    /* ------------------------------------------------------------ outils */

    function _fund(uint32 day, uint256 a) internal {
        vm.startPrank(FEE_WALLET);
        usdc.approve(address(tp), a);
        tp.fund(day, a);
        vm.stopPrank();
    }

    function _sig(uint256 cle, uint32 day, address wallet, bytes20 ticket, uint256 amount, uint64 deadline) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(cle, tp.claimDigest(day, wallet, ticket, amount, deadline));
        return abi.encodePacked(r, s, v);
    }

    function _claim(address wallet, bytes20 ticket, uint256 amount, uint64 deadline) internal {
        bytes memory s = _sig(CLE, J0, wallet, ticket, amount, deadline);
        tp.claim(J0, wallet, ticket, amount, deadline, s);
    }

    /// @dev J0 fonde de `pot`, la chaine le LENDEMAIN a 00:02 UTC (le bloc E), le jour FERME par l owner ; rend une echeance d 1 h
    function _jourFerme(uint256 pot) internal returns (uint64 deadline) {
        _fund(J0, pot);
        vm.warp(T0 + 86400 + 120);
        tp.close(J0);
        deadline = uint64(block.timestamp + 3600);
    }

    /* ------------------------------------------------------------ configuration */

    function test_Config() public view {
        assertEq(tp.USDC(), address(usdc));
        assertEq(tp.verifier(), VERIF);
        assertEq(tp.guardian(), GUARDIAN);
        assertEq(tp.owner(), address(this));
        assertEq(tp.GRACE(), 7 days);
        assertEq(tp.FUNDING_DELAY(), 12 hours);
        assertEq(tp.ADMIN_DELAY(), 48 hours);
        assertEq(tp.today(), J0);
        assertEq(tp.dayEnd(J0), uint64(T0 + 86400));
        assertEq(tp.claimableUntil(J0), uint64(T0 + 86400 + 7 days));
        assertFalse(tp.paused());
        assertEq(tp.totalPots(), 0);
    }

    function test_ConfigRefusee() public {
        vm.expectRevert(TicketPot.BadAddress.selector);
        new TicketPot(address(0), VERIF, GUARDIAN);
        vm.expectRevert(TicketPot.BadAddress.selector);
        new TicketPot(address(0x1234), VERIF, GUARDIAN); /* usdc sans code */
        vm.expectRevert(TicketPot.BadAddress.selector);
        new TicketPot(address(usdc), address(0), GUARDIAN);
        TicketPot sansGardien = new TicketPot(address(usdc), VERIF, address(0)); /* gardien facultatif */
        assertEq(sansGardien.guardian(), address(0));
    }

    function test_DomaineEip712() public view {
        bytes32 attendu = keccak256(abi.encode(tp.DOMAIN_TYPEHASH(), keccak256("TicketPot"), keccak256("1"), block.chainid, address(tp)));
        assertEq(tp.domainSeparator(), attendu);
        assertEq(tp.CLAIM_TYPEHASH(), keccak256("Claim(uint32 day,address wallet,bytes20 ticket,uint256 amount,uint64 deadline)"));
    }

    /* ------------------------------------------------------------ fund / close */

    function test_FundAlimenteLeJour() public {
        vm.startPrank(FEE_WALLET);
        usdc.approve(address(tp), 10_000_000);
        vm.expectEmit(true, true, false, true);
        emit Funded(J0, FEE_WALLET, 10_000_000, 10_000_000);
        tp.fund(J0, 10_000_000);
        vm.stopPrank();
        assertEq(tp.dayPot(J0), 10_000_000);
        assertEq(tp.totalPots(), 10_000_000);
        assertEq(usdc.balanceOf(address(tp)), 10_000_000);
        _fund(J0, 2_000_000);
        assertEq(tp.dayPot(J0), 12_000_000, "deux fund s additionnent");
        _fund(J0 - 3, 1_000_000); /* un jour passe non ferme : admis (la part des frais arrive apres la fin du jour) */
        assertEq(tp.dayPot(J0 - 3), 1_000_000);
        assertFalse(tp.closed(J0));
        assertEq(tp.potAtClose(J0), 0, "rien n est fige avant close()");
    }

    function test_FundRefus() public {
        vm.startPrank(FEE_WALLET);
        usdc.approve(address(tp), 10_000_000);
        vm.expectRevert(TicketPot.ZeroAmount.selector);
        tp.fund(J0, 0);
        vm.expectRevert(TicketPot.FutureDay.selector);
        tp.fund(J0 + 1, 1_000_000); /* un jour futur : refuse (un fond ne doit pas dormir une semaine de trop par faute de frappe) */
        usdc.approve(address(tp), 999);
        vm.expectRevert(TicketPot.TransferFailed.selector);
        tp.fund(J0, 1_000);
        vm.stopPrank();
    }

    function test_CloseFigeLePotEtFermeLeFund() public {
        _fund(J0, 10_000_000);
        vm.expectRevert(TicketPot.DayNotOver.selector);
        tp.close(J0); /* le jour dure encore */
        vm.warp(T0 + 86400);
        vm.prank(TIERS);
        vm.expectRevert(TicketPot.TooEarly.selector);
        tp.close(J0); /* un tiers attend FUNDING_DELAY */
        vm.expectEmit(true, false, false, true);
        emit Closed(J0, 10_000_000, address(this));
        tp.close(J0); /* l owner : des la fin du jour */
        assertTrue(tp.closed(J0));
        assertEq(tp.potAtClose(J0), 10_000_000);
        assertEq(tp.dayPot(J0), 10_000_000);
        vm.startPrank(FEE_WALLET);
        usdc.approve(address(tp), 1_000_000);
        vm.expectRevert(TicketPot.DayClosed.selector);
        tp.fund(J0, 1_000_000); /* un fond tardif ne change plus les parts : il ira a aujourd hui */
        tp.fund(J0 + 1, 1_000_000); /* aujourd hui */
        vm.stopPrank();
        vm.expectRevert(TicketPot.DayClosed.selector);
        tp.close(J0); /* une seule fermeture */
        assertEq(tp.potAtClose(J0), 10_000_000, "le pot fige ne bouge plus");
    }

    function test_CloseParUnTiersApresLeDelai() public {
        _fund(J0, 10_000_000);
        vm.warp(T0 + 86400 + 12 hours - 1);
        vm.prank(TIERS);
        vm.expectRevert(TicketPot.TooEarly.selector);
        tp.close(J0);
        vm.warp(T0 + 86400 + 12 hours);
        vm.prank(TIERS);
        tp.close(J0);
        assertEq(tp.potAtClose(J0), 10_000_000, "un jour que personne ne ferme paie quand meme ses holders");
    }

    function test_ClosePotVide() public {
        vm.warp(T0 + 86400);
        tp.close(J0); /* un jour sans frais : ferme a 0, rien a reclamer */
        assertEq(tp.potAtClose(J0), 0);
    }

    function test_TransfertDirectNEntrePasAuPotSaufAbsorb() public {
        vm.prank(TIERS);
        usdc.transfer(address(tp), 3_000_000);
        assertEq(tp.dayPot(J0), 0, "seul fund() compte");
        vm.warp(T0 + 86400 * 2);
        vm.expectEmit(true, true, false, true);
        emit Funded(J0 + 2, address(0), 3_000_000, 3_000_000);
        tp.absorb();
        assertEq(tp.dayPot(J0 + 2), 3_000_000, "absorb() verse le surplus au pot du JOUR COURANT (jamais ferme)");
        assertEq(tp.totalPots(), 3_000_000);
        vm.expectRevert(TicketPot.NothingToAbsorb.selector);
        tp.absorb();
    }

    /* ------------------------------------------------------------ claim : pro rata, chaque holder sa part */

    function test_DeuxHoldersReclamentLeurPart() public {
        uint64 deadline = _jourFerme(10_000_000);
        uint256 part = tp.potAtClose(J0) / 2; /* ce que le serveur calcule : floor(potAtClose / nTickets) */
        vm.expectEmit(true, true, false, true);
        emit Claimed(J0, H1, TICKET, part, 5_000_000, TIERS);
        bytes memory s1 = _sig(CLE, J0, H1, TICKET, part, deadline);
        vm.prank(TIERS); /* n importe qui envoie : le holder est paye, jamais l appelant */
        tp.claim(J0, H1, TICKET, part, deadline, s1);
        _claim(H2, T2, part, deadline);
        assertEq(usdc.balanceOf(H1), 5_000_000);
        assertEq(usdc.balanceOf(H2), 5_000_000);
        assertEq(usdc.balanceOf(TIERS), 1_000_000_000, "l appelant ne touche rien");
        assertEq(tp.dayPot(J0), 0);
        assertEq(tp.paid(J0), 10_000_000);
        assertEq(tp.totalPots(), 0);
        assertEq(tp.ticketOf(J0, H1), TICKET, "le ticket (preuve non fongible) est grave par wallet");
        assertEq(tp.ticketOf(J0, H2), T2);
        assertTrue(tp.claimed(J0, H1) && tp.claimed(J0, H2) && !tp.claimed(J0, H3));
        assertEq(usdc.balanceOf(address(tp)), 0);
    }

    function test_TroisiemeClaimAuDelaDuResteRefuse() public {
        uint64 deadline = _jourFerme(10_000_000);
        _claim(H1, TICKET, 4_000_000, deadline);
        _claim(H2, T2, 4_000_000, deadline);
        assertEq(tp.dayPot(J0), 2_000_000);
        bytes memory s3 = _sig(CLE, J0, H3, T3, 4_000_000, deadline);
        vm.expectRevert(TicketPot.AmountOverPot.selector);
        tp.claim(J0, H3, T3, 4_000_000, deadline, s3); /* la somme des claims ne depasse jamais le pot fige */
        bytes memory s3b = _sig(CLE, J0, H3, T3, 2_000_001, deadline);
        vm.expectRevert(TicketPot.AmountOverPot.selector);
        tp.claim(J0, H3, T3, 2_000_001, deadline, s3b);
        _claim(H3, T3, 2_000_000, deadline); /* exactement le reste : passe */
        assertEq(tp.dayPot(J0), 0);
        assertEq(tp.paid(J0), 10_000_000);
    }

    function test_MemeWalletDeuxFoisRefuse() public {
        uint64 deadline = _jourFerme(10_000_000);
        _claim(H1, TICKET, 2_000_000, deadline);
        bytes memory s = _sig(CLE, J0, H1, TICKET, 2_000_000, deadline);
        vm.expectRevert(TicketPot.AlreadyClaimed.selector);
        tp.claim(J0, H1, TICKET, 2_000_000, deadline, s); /* la meme attestation rejouee */
        bytes memory s2 = _sig(CLE, J0, H1, T2, 2_000_000, deadline);
        vm.expectRevert(TicketPot.AlreadyClaimed.selector);
        tp.claim(J0, H1, T2, 2_000_000, deadline, s2); /* un autre ticket pour le meme wallet, le meme jour */
        assertEq(usdc.balanceOf(H1), 2_000_000, "paye une fois");
        assertEq(tp.dayPot(J0), 8_000_000);
    }

    function test_MemeWalletDeuxJours() public {
        _fund(J0 - 1, 1_000_000);
        uint64 deadline = _jourFerme(2_000_000);
        tp.close(J0 - 1);
        bytes20 t1 = bytes20(uint160(0xAAAA));
        bytes memory s = _sig(CLE, J0 - 1, H1, t1, 1_000_000, deadline);
        tp.claim(J0 - 1, H1, t1, 1_000_000, deadline, s);
        _claim(H1, TICKET, 2_000_000, deadline); /* un autre jour, un autre ticket : admis */
        assertEq(tp.ticketOf(J0 - 1, H1), t1);
        assertEq(tp.ticketOf(J0, H1), TICKET);
        assertEq(usdc.balanceOf(H1), 3_000_000);
    }

    function test_ClaimAvantLaFermetureRefuse() public {
        _fund(J0, 10_000_000);
        vm.warp(T0 + 86400 + 120);
        uint64 deadline = uint64(block.timestamp + 3600);
        bytes memory s = _sig(CLE, J0, H1, TICKET, 5_000_000, deadline);
        vm.expectRevert(TicketPot.NotClosed.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, s); /* le pot n est pas fige : aucune part n est finale */
        tp.close(J0);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, s);
    }

    function test_ClaimSignatureRefusee() public {
        uint64 deadline = _jourFerme(10_000_000);
        bytes memory autre = _sig(AUTRE_CLE, J0, H1, TICKET, 5_000_000, deadline);
        vm.expectRevert(TicketPot.BadProof.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, autre);
        bytes memory sig = _sig(CLE, J0, H1, TICKET, 1_000_000, deadline);
        vm.expectRevert(TicketPot.BadProof.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, sig); /* un montant different de celui signe */
        sig = _sig(CLE, J0, H1, TICKET, 5_000_000, deadline);
        vm.expectRevert(TicketPot.BadProof.selector);
        tp.claim(J0, H2, TICKET, 5_000_000, deadline, sig); /* un autre wallet */
        vm.expectRevert(TicketPot.BadProof.selector);
        tp.claim(J0, H1, T2, 5_000_000, deadline, sig); /* un autre ticket */
        vm.expectRevert(TicketPot.BadProof.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline - 1, sig); /* une autre echeance */
        vm.expectRevert(TicketPot.BadProof.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, hex"00");
        vm.expectRevert(TicketPot.BadProof.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, "");
        assertEq(tp.dayPot(J0), 10_000_000, "rien n est sorti");
    }

    function test_ClaimSignatureMalleableRefusee() public {
        uint64 deadline = _jourFerme(10_000_000);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(CLE, tp.claimDigest(J0, H1, TICKET, 5_000_000, deadline));
        bytes32 sHaut = bytes32(0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141 - uint256(s));
        vm.expectRevert(TicketPot.BadProof.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, abi.encodePacked(r, sHaut, v == 27 ? uint8(28) : uint8(27))); /* EIP-2 */
        vm.expectRevert(TicketPot.BadProof.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, abi.encodePacked(r, s, uint8(29)));
        vm.expectRevert(TicketPot.BadProof.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, abi.encodePacked(r, s, uint8(v - 27)));
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, abi.encodePacked(r, s, v)); /* la vraie passe */
    }

    function test_ClaimParametresNuls() public {
        uint64 deadline = _jourFerme(10_000_000);
        bytes memory s0 = _sig(CLE, J0, H1, TICKET, 0, deadline);
        vm.expectRevert(TicketPot.BadParams.selector);
        tp.claim(J0, H1, TICKET, 0, deadline, s0);
        bytes memory s1 = _sig(CLE, J0, address(0), TICKET, 1, deadline);
        vm.expectRevert(TicketPot.BadParams.selector);
        tp.claim(J0, address(0), TICKET, 1, deadline, s1);
        bytes memory s2 = _sig(CLE, J0, H1, bytes20(0), 1, deadline);
        vm.expectRevert(TicketPot.BadParams.selector);
        tp.claim(J0, H1, bytes20(0), 1, deadline, s2);
    }

    function test_ClaimEcheance() public {
        uint64 deadline = _jourFerme(10_000_000);
        bytes memory sig = _sig(CLE, J0, H1, TICKET, 5_000_000, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(TicketPot.SignatureExpired.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, sig);
        vm.warp(deadline); /* = deadline : encore valable */
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, sig);
    }

    function test_ClaimEcheanceAuDelaDuDelaiDeGrace() public {
        _jourFerme(10_000_000);
        uint64 trop = tp.claimableUntil(J0) + 1;
        bytes memory s = _sig(CLE, J0, H1, TICKET, 5_000_000, trop);
        vm.expectRevert(TicketPot.DeadlineTooFar.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, trop, s);
        uint64 max = tp.claimableUntil(J0); /* = fin du jour + 7 j : la derniere echeance admise */
        vm.warp(max);
        _claim(H1, TICKET, 5_000_000, max);
    }

    function test_ClaimMauvaisJour() public {
        _fund(J0 - 1, 10_000_000);
        uint64 deadline = _jourFerme(10_000_000);
        tp.close(J0 - 1);
        bytes memory sigJ0 = _sig(CLE, J0, H1, TICKET, 10_000_000, deadline);
        vm.expectRevert(TicketPot.BadProof.selector);
        tp.claim(J0 - 1, H1, TICKET, 10_000_000, deadline, sigJ0); /* l attestation du jour J0 ne paie pas le pot de la veille */
        tp.claim(J0, H1, TICKET, 10_000_000, deadline, sigJ0);
        assertEq(tp.dayPot(J0 - 1), 10_000_000, "la veille est intacte");
    }

    /* ------------------------------------------------------------ rollover : seulement le RESTE, vers aujourd hui */

    function test_RolloverAvantLaGraceRefuse() public {
        _fund(J0, 10_000_000);
        vm.warp(T0 + 86400 + 120);
        vm.expectRevert(TicketPot.GraceNotOver.selector);
        tp.rollover(J0);
        vm.warp(tp.claimableUntil(J0)); /* dernier instant du claim : pas encore */
        vm.expectRevert(TicketPot.GraceNotOver.selector);
        tp.rollover(J0);
        vm.warp(tp.claimableUntil(J0) + 1); /* J0 + 8 jours, 00:00:01 */
        uint32 auj = tp.today();
        assertEq(auj, J0 + 8);
        vm.expectEmit(true, true, false, true);
        emit RolledOver(J0, auj, 10_000_000, 10_000_000);
        vm.prank(TIERS); /* sans permission */
        tp.rollover(J0);
        assertEq(tp.dayPot(J0), 0);
        assertEq(tp.dayPot(auj), 10_000_000, "vers le jour COURANT, jamais un jour ferme");
        assertEq(tp.totalPots(), 10_000_000, "rien ne sort du contrat");
        vm.expectRevert(TicketPot.NothingToRoll.selector);
        tp.rollover(J0);
    }

    function test_RolloverSeulementLeReste() public {
        uint64 deadline = _jourFerme(10_000_000);
        uint256 part = uint256(10_000_000) / 3; /* 3 tickets : 3 333 333 chacun, 1 de poussiere */
        _claim(H1, TICKET, part, deadline);
        _claim(H2, T2, part, deadline);
        /* H3 ne reclame jamais */
        vm.warp(tp.claimableUntil(J0) + 1);
        uint32 auj = tp.today();
        tp.rollover(J0);
        assertEq(tp.dayPot(auj), 10_000_000 - 2 * part, "le reste = la part non reclamee + la poussiere (3 333 334)");
        assertEq(tp.paid(J0), 2 * part, "ce qui a ete paye reste compte");
        assertEq(tp.potAtClose(J0), 10_000_000, "le pot fige est une archive : il ne bouge pas");
        assertEq(usdc.balanceOf(address(tp)), tp.totalPots());
    }

    function test_ClaimApresRolloverRefuse() public {
        _jourFerme(10_000_000);
        uint64 max = tp.claimableUntil(J0);
        bytes memory sig = _sig(CLE, J0, H1, TICKET, 5_000_000, max);
        vm.warp(max + 1);
        tp.rollover(J0);
        vm.expectRevert(TicketPot.SignatureExpired.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, max, sig); /* l echeance maximale est passee : plus aucun claim de J0 */
        uint32 auj = tp.today();
        assertEq(tp.dayPot(auj), 10_000_000);
        /* le jour courant, lui, se ferme le lendemain et paie SES holders */
        vm.warp(tp.dayEnd(auj));
        tp.close(auj);
        uint64 d = tp.claimableUntil(auj);
        bytes memory s2 = _sig(CLE, auj, H2, T2, 10_000_000, d);
        tp.claim(auj, H2, T2, 10_000_000, d, s2);
        assertEq(usdc.balanceOf(H2), 10_000_000);
    }

    function test_RolloverDUnJourJamaisFerme() public {
        _fund(J0, 10_000_000);
        vm.warp(tp.claimableUntil(J0) + 1);
        tp.rollover(J0); /* personne n a ferme J0 : son pot n est pas perdu */
        assertEq(tp.dayPot(tp.today()), 10_000_000);
        assertFalse(tp.closed(J0));
    }

    /* ------------------------------------------------------------ pause */

    function test_PauseBloqueLesClaimsPasLesFonds() public {
        uint64 deadline = _jourFerme(10_000_000);
        bytes memory sig = _sig(CLE, J0, H1, TICKET, 5_000_000, deadline);
        vm.prank(GUARDIAN);
        tp.setPaused(true);
        vm.expectRevert(TicketPot.Paused.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, sig);
        _fund(J0 + 1, 1_000_000); /* fund passe en pause */
        vm.warp(tp.dayEnd(J0 + 1));
        tp.close(J0 + 1); /* close aussi */
        vm.warp(tp.claimableUntil(J0) + 1);
        tp.rollover(J0); /* rollover aussi : la pause ne bloque que la sortie vers une personne */
        assertEq(tp.dayPot(tp.today()), 10_000_000);
    }

    function test_PauseQuiPeutQuoi() public {
        vm.prank(TIERS);
        vm.expectRevert(TicketPot.NotOwner.selector);
        tp.setPaused(true);
        vm.prank(GUARDIAN);
        tp.setPaused(true);
        vm.expectRevert(TicketPot.NotReady.selector);
        tp.setPaused(false); /* l owner attend ADMIN_DELAY sur une pause du gardien */
        vm.warp(block.timestamp + 48 hours);
        tp.setPaused(false);
        assertFalse(tp.paused());
        vm.prank(GUARDIAN);
        tp.setPaused(true);
        vm.prank(GUARDIAN);
        tp.setPaused(false); /* le gardien leve SA pause */
        tp.setPaused(true);
        vm.prank(GUARDIAN);
        vm.expectRevert(TicketPot.NotOwner.selector);
        tp.setPaused(false); /* pas celle de l owner */
        vm.expectRevert(TicketPot.NotReady.selector);
        tp.setPaused(true); /* deja en pause : rien a enregistrer */
        tp.setPaused(false);
        vm.expectRevert(TicketPot.NotPaused.selector);
        tp.setPaused(false);
    }

    function test_GardienRevoque() public {
        tp.revokeGuardian();
        assertEq(tp.guardian(), address(0));
        vm.prank(GUARDIAN);
        vm.expectRevert(TicketPot.NotOwner.selector);
        tp.setPaused(true);
        vm.prank(address(0)); /* « l adresse zero » n est pas un gardien : un gardien revoque n ouvre rien */
        vm.expectRevert(TicketPot.NotOwner.selector);
        tp.setPaused(true);
        vm.prank(TIERS);
        vm.expectRevert(TicketPot.NotOwner.selector);
        tp.revokeGuardian();
    }

    /* ------------------------------------------------------------ verifier / gardien : propose puis accepte 48 h plus tard */

    function test_VerifierProposePuisAccepte() public {
        address nouveau = vm.addr(AUTRE_CLE);
        vm.prank(TIERS);
        vm.expectRevert(TicketPot.NotOwner.selector);
        tp.proposeVerifier(nouveau);
        vm.expectRevert(TicketPot.BadAddress.selector);
        tp.proposeVerifier(address(0));
        vm.expectEmit(true, false, false, true);
        emit Proposed("verifier", nouveau, uint64(block.timestamp + 48 hours));
        tp.proposeVerifier(nouveau);
        (address v, uint64 ready) = tp.nextVerifier();
        assertEq(v, nouveau);
        assertEq(ready, uint64(block.timestamp + 48 hours));
        vm.expectRevert(TicketPot.NotReady.selector);
        tp.acceptVerifier();
        vm.warp(block.timestamp + 48 hours - 1);
        vm.expectRevert(TicketPot.NotReady.selector);
        tp.acceptVerifier();
        vm.warp(block.timestamp + 1);
        vm.prank(TIERS);
        vm.expectRevert(TicketPot.NotOwner.selector);
        tp.acceptVerifier();
        assertEq(tp.verifier(), VERIF, "pendant les 48 h, l ancien verifier signe encore");
        vm.expectEmit(true, false, false, true);
        emit Accepted("verifier", nouveau);
        tp.acceptVerifier();
        assertEq(tp.verifier(), nouveau);
        (v, ready) = tp.nextVerifier();
        assertEq(v, address(0)); assertEq(ready, 0);
        vm.expectRevert(TicketPot.NotReady.selector);
        tp.acceptVerifier(); /* rien en attente */
    }

    function test_PropositionPerimee() public {
        tp.proposeVerifier(vm.addr(AUTRE_CLE));
        vm.warp(block.timestamp + 48 hours + 72 hours + 1);
        vm.expectRevert(TicketPot.NotReady.selector);
        tp.acceptVerifier();
        assertEq(tp.verifier(), VERIF);
    }

    function test_NouveauVerifierSigneLAncienNonApresAcceptation() public {
        _fund(J0, 10_000_000);
        tp.proposeVerifier(vm.addr(AUTRE_CLE));
        vm.warp(block.timestamp + 48 hours);
        tp.acceptVerifier();
        tp.close(J0);
        uint64 deadline = uint64(block.timestamp + 3600);
        bytes memory ancien = _sig(CLE, J0, H1, TICKET, 5_000_000, deadline);
        vm.expectRevert(TicketPot.BadProof.selector);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, ancien);
        bytes memory nouveau = _sig(AUTRE_CLE, J0, H1, TICKET, 5_000_000, deadline);
        tp.claim(J0, H1, TICKET, 5_000_000, deadline, nouveau);
    }

    function test_GardienProposePuisAccepte() public {
        address g2 = address(0x6A2E);
        tp.proposeGuardian(g2);
        vm.expectRevert(TicketPot.NotReady.selector);
        tp.acceptGuardian();
        vm.warp(block.timestamp + 48 hours);
        tp.acceptGuardian();
        assertEq(tp.guardian(), g2);
        vm.prank(GUARDIAN);
        vm.expectRevert(TicketPot.NotOwner.selector);
        tp.setPaused(true);
        vm.prank(g2);
        tp.setPaused(true);
        assertTrue(tp.paused());
    }

    function test_ProprieteEnDeuxTemps() public {
        vm.expectRevert(TicketPot.BadAddress.selector);
        tp.transferOwnership(address(0));
        tp.transferOwnership(TIERS);
        assertEq(tp.owner(), address(this), "pas encore");
        vm.prank(H1);
        vm.expectRevert(TicketPot.NotOwner.selector);
        tp.acceptOwnership();
        vm.prank(TIERS);
        tp.acceptOwnership();
        assertEq(tp.owner(), TIERS);
        assertEq(tp.pendingOwner(), address(0));
        vm.expectRevert(TicketPot.NotOwner.selector);
        tp.proposeVerifier(TIERS);
    }

    /* ------------------------------------------------------------ aucun retrait, jetons hostiles */

    function test_AucunRetrait() public {
        _fund(J0, 10_000_000);
        (bool ok,) = address(tp).call(abi.encodeWithSignature("withdraw(uint256)", 1));
        assertFalse(ok);
        (ok,) = address(tp).call(abi.encodeWithSignature("withdraw(address,uint256)", address(usdc), 1));
        assertFalse(ok);
        (ok,) = address(tp).call(abi.encodeWithSignature("sweep(address)", address(this)));
        assertFalse(ok);
        (ok,) = address(tp).call(abi.encodeWithSignature("rescue(address,address,uint256)", address(usdc), address(this), 1));
        assertFalse(ok);
        assertEq(usdc.balanceOf(address(tp)), 10_000_000, "l owner ne peut rien sortir : seul un claim signe paie");
    }

    function test_JetonQuiRendFauxRefuse() public {
        vm.startPrank(FEE_WALLET);
        usdc.approve(address(tp), 1_000_000);
        usdc.setFaux(true);
        vm.expectRevert(TicketPot.TransferFailed.selector);
        tp.fund(J0, 1_000_000);
        usdc.setFaux(false);
        tp.fund(J0, 1_000_000);
        vm.stopPrank();
        vm.warp(T0 + 86400 + 120);
        tp.close(J0);
        uint64 deadline = uint64(block.timestamp + 3600);
        bytes memory s = _sig(CLE, J0, H1, TICKET, 1_000_000, deadline);
        usdc.setFaux(true);
        vm.expectRevert(TicketPot.TransferFailed.selector);
        tp.claim(J0, H1, TICKET, 1_000_000, deadline, s);
        assertFalse(tp.claimed(J0, H1), "un paiement refuse ne marque pas le wallet paye");
        assertEq(tp.paid(J0), 0);
    }

    function test_ReentreeRefusee() public {
        UsdcHostileTP hu = new UsdcHostileTP();
        TicketPot t2 = new TicketPot(address(hu), VERIF, GUARDIAN);
        hu.mint(FEE_WALLET, 100_000_000);
        vm.startPrank(FEE_WALLET);
        hu.approve(address(t2), 20_000_000);
        t2.fund(J0, 20_000_000);
        vm.stopPrank();
        vm.warp(T0 + 86400 + 120);
        t2.close(J0);
        uint64 deadline = uint64(block.timestamp + 3600);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(CLE, t2.claimDigest(J0, H2, T2, 10_000_000, deadline));
        /* pendant le paiement de H1, le jeton tente le claim (valide !) de H2 : le verrou le refuse ; H2 reclamera lui-meme */
        hu.armer(t2, abi.encodeWithSelector(TicketPot.claim.selector, J0, H2, T2, 10_000_000, deadline, abi.encodePacked(r, s, v)));
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(CLE, t2.claimDigest(J0, H1, TICKET, 10_000_000, deadline));
        t2.claim(J0, H1, TICKET, 10_000_000, deadline, abi.encodePacked(r1, s1, v1));
        assertFalse(hu.reentreeReussie(), "la reentree ne passe pas");
        assertEq(hu.erreurVue(), TicketPot.Reentrancy.selector);
        assertEq(hu.balanceOf(H1), 10_000_000);
        assertEq(hu.balanceOf(H2), 0);
        assertEq(t2.dayPot(J0), 10_000_000);
        hu.armer(TicketPot(address(0)), "");
        t2.claim(J0, H2, T2, 10_000_000, deadline, abi.encodePacked(r, s, v));
        assertEq(hu.balanceOf(H2), 10_000_000);
    }

    /// @dev fuzz : n holders a parts egales (ce que le serveur signe) : tous payes, la poussiere reste, le contrat tient exactement les pots
    function testFuzz_PartsEgalesPuisPoussiere(uint96 potBrut, uint8 nBrut, uint96 autre) public {
        uint256 pot = uint256(potBrut) % 1_000_000_000 + 1;
        uint256 n = uint256(nBrut) % 12 + 1;
        uint256 fb = uint256(autre) % 1_000_000_000 + 1;
        usdc.mint(FEE_WALLET, 2_000_000_000);
        _fund(J0, pot);
        _fund(J0 - 1, fb); /* un autre jour, jamais touche */
        vm.warp(T0 + 86400 + 120);
        tp.close(J0);
        uint64 deadline = uint64(block.timestamp + 3600);
        uint256 part = tp.potAtClose(J0) / n;
        if (part == 0) return; /* un pot plus petit que n : le serveur ne signe rien (amount 0 refuse) */
        for (uint256 i = 0; i < n; i++) {
            address h = address(uint160(0x1000 + i));
            bytes20 t = bytes20(uint160(0x5000 + i));
            bytes memory s = _sig(CLE, J0, h, t, part, deadline);
            tp.claim(J0, h, t, part, deadline, s);
            assertEq(usdc.balanceOf(h), part);
        }
        /* un (n+1)-ieme holder (invente) ne peut pas toucher une part : seule la poussiere reste */
        if (part <= pot - n * part) return; /* (impossible : poussiere < part par definition de la division) */
        bytes memory sx = _sig(CLE, J0, address(0xF00D), bytes20(uint160(0xF00D)), part, deadline);
        vm.expectRevert(TicketPot.AmountOverPot.selector);
        tp.claim(J0, address(0xF00D), bytes20(uint160(0xF00D)), part, deadline, sx);
        assertEq(tp.dayPot(J0), pot - n * part, "la poussiere de la division");
        assertEq(tp.paid(J0), n * part);
        assertEq(tp.paid(J0) + tp.dayPot(J0), tp.potAtClose(J0));
        assertEq(tp.dayPot(J0 - 1), fb, "l autre jour est intact");
        assertEq(usdc.balanceOf(address(tp)), tp.totalPots());
        assertEq(tp.totalPots(), tp.dayPot(J0) + tp.dayPot(J0 - 1));
    }

    /* ------------------------------------------------------------ PARITE avec ticketpot-plan.js (digestClaim) */
    /* ⛔ Ces valeurs sont recalculees par test-ticketpot-plan-20261018.mjs avec le module de l app : si l un des deux cotes derive, l un des
     *    deux tests rougit. Chaine 8453, contrat 0x1111...1111 (etch du runtime), jour 20744 (2026-10-18), wallet 0xa1..a1, ticket 0x01..14. */
    function test_PariteDigestAvecLeModuleJs() public {
        vm.chainId(8453);
        address fixe = address(0x1111111111111111111111111111111111111111);
        vm.etch(fixe, address(tp).code);
        TicketPot t = TicketPot(fixe);
        assertEq(t.domainSeparator(), 0x1ff308e3d49e71d485f625a3bb98fb95e7e7ce1089fe71e450d06dac1bdb6b6d, "domaine = ticketpot-plan.js domaineSeparateur(8453, 0x11..11)");
        assertEq(t.claimableUntil(20744), 1792972800, "J2026-10-18 : claimable jusqu au 2026-10-26 00:00 UTC");
        assertEq(t.claimDigest(20744, address(0xA1A1a1a1A1A1A1A1A1a1a1a1a1a1A1A1a1A1a1a1), TICKET, 10_000_000, 1792972800),
            0x80fba4d5aea469691a386204e79b4008f6e9a769fa05e2d7f0f27674e7d092b0, "digest = ticketpot-plan.js digestClaim (bytes20 aligne a gauche)");
    }
}
