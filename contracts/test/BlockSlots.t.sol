// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/BlockSlots.sol";

/// @dev USDC de test : 6 decimales, transferFrom standard, et un mode « rend false » pour la garde SafeERC20.
contract UsdcS {
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

/// @dev jeton HOSTILE : pendant le paiement d un gain, il tente de re-entrer dans settle() (ou settleMany) d un autre spin.
contract UsdcHostileS is UsdcS {
    BlockSlots public cible;
    uint256 public autre;
    bool public parLot;
    bytes4 public erreurVue;
    bool public reentreeReussie;

    function armer(BlockSlots c, uint256 id, bool lot) external { cible = c; autre = id; parLot = lot; }

    function transfer(address to, uint256 a) external override returns (bool) {
        if (address(cible) != address(0) && msg.sender == address(cible)) {
            bytes memory d;
            if (parLot) {
                uint256[] memory ids = new uint256[](1);
                ids[0] = autre;
                d = abi.encodeWithSelector(BlockSlots.settleMany.selector, ids);
            } else {
                d = abi.encodeWithSelector(BlockSlots.settle.selector, autre);
            }
            (bool ok, bytes memory ret) = address(cible).call(d);
            reentreeReussie = ok;
            if (!ok && ret.length >= 4) erreurVue = bytes4(ret);
        }
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract BlockSlotsTest is Test {
    UsdcS usdc;
    BlockSlots bs;
    address DEV = address(0xD3F);
    address JOUEUR = address(0xA11);
    address AUTRE = address(0xB22);
    address DONATEUR = address(0xC33);

    uint256 constant SPIN = 500_000;
    /* la table de contracts/slots-parametres.json (0..15 points), en USDC brut */
    uint64[16] TABLE = [uint64(0), 0, 0, 250_000, 750_000, 2_000_000, 5_000_000, 10_000_000, 25_000_000, 50_000_000, 100_000_000, 250_000_000, 500_000_000, 1000_000_000, 1000_000_000, 1000_000_000];

    event Spun(uint256 indexed spinId, address indexed player, uint256 targetBlock, uint256 toPot, uint256 toDev);
    event Expired(uint256 indexed spinId, address indexed player);

    function setUp() public {
        vm.roll(1000);
        usdc = new UsdcS();
        bs = new BlockSlots(_cfg(address(usdc)));
        usdc.mint(JOUEUR, 10_000_000_000);
        usdc.mint(AUTRE, 10_000_000_000);
        usdc.mint(DONATEUR, 100_000_000_000);
    }

    function _cfg(address t) internal view returns (BlockSlots.Config memory c) {
        c = BlockSlots.Config(t, DEV, SPIN, 5000, TABLE);
    }

    function _refuse(BlockSlots.Config memory c) internal {
        vm.expectRevert(BlockSlots.BadConfig.selector);
        new BlockSlots(c);
    }

    function _spin(address p) internal returns (uint256 id) {
        vm.startPrank(p);
        usdc.approve(address(bs), SPIN);
        id = bs.spin();
        vm.stopPrank();
    }

    function _fund(uint256 a) internal {
        vm.startPrank(DONATEUR);
        usdc.approve(address(bs), a);
        bs.fund(a);
        vm.stopPrank();
    }

    function _revele(uint256 id, bytes32 h) internal {
        (, uint40 t,) = bs.spins(id);
        vm.roll(uint256(t) + 1);
        vm.setBlockhash(t, h);
    }

    /* ------------------------------------------------------------ configuration */

    function test_ConfigImmuable() public view {
        assertEq(bs.USDC(), address(usdc));
        assertEq(bs.DEV_WALLET(), DEV);
        assertEq(bs.SPIN_PRICE(), SPIN);
        assertEq(bs.POT_SHARE_BPS(), 5000);
        uint64[16] memory p = bs.prizes();
        for (uint256 k = 0; k < 16; k++) assertEq(p[k], TABLE[k], "table lue = table construite");
        assertEq(bs.SETTLE_WINDOW(), 256);
        assertEq(bs.TARGET_DELAY(), 2);
        assertEq(bs.MAX_POINTS(), 15);
    }

    function test_ConfigRefusee() public {
        BlockSlots.Config memory c = _cfg(address(usdc));
        c.usdc = address(0); _refuse(c);
        c = _cfg(address(usdc)); c.usdc = address(0x1234); _refuse(c); /* pas de code */
        c = _cfg(address(usdc)); c.devWallet = address(0); _refuse(c);
        c = _cfg(address(usdc)); c.spinPrice = 0; _refuse(c);
        /* prix nul avec une table nulle : l esperance (0) ne refuserait pas a elle seule */
        c = _cfg(address(usdc)); c.spinPrice = 0;
        for (uint256 k = 0; k < 16; k++) c.prizes[k] = 0;
        _refuse(c);
        c = _cfg(address(usdc)); c.spinPrice = 1000_000001; _refuse(c);
        c = _cfg(address(usdc)); c.potShareBps = 0; _refuse(c);
        c = _cfg(address(usdc)); c.potShareBps = 10_001; _refuse(c);
    }

    function test_TableNonOrdonneeRefusee() public {
        BlockSlots.Config memory c = _cfg(address(usdc));
        c.prizes[4] = 200_000; /* 4 points paierait moins que 3 */
        _refuse(c);
    }

    function test_TableAuDelaDuMaxRefusee() public {
        BlockSlots.Config memory c = _cfg(address(usdc));
        c.prizes[15] = 1000_000001;
        _refuse(c);
    }

    /// @dev ⛔ l avantage de la maison : une table dont l esperance atteint la part du pot est REFUSEE par le constructeur
    function test_EsperanceTropHauteRefusee() public {
        BlockSlots.Config memory c = _cfg(address(usdc));
        c.prizes[3] = 1_000_000; c.prizes[4] = 1_000_000; c.prizes[5] = 2_000_000; /* 3 points : 0,136 x 1 = 0,136 deja, total > 0,25 */
        _refuse(c);
        /* la meme table passe si toute la mise va au pot (esperance < 0,50) */
        c.potShareBps = 10_000;
        new BlockSlots(c);
    }

    /// @dev le bord EXACT : une table « x pour 3 points et plus » ; le plus grand x admis est lim, lim + 1 est refuse
    function test_EsperanceAuBordExact() public {
        uint256[16] memory d = bs.distribution();
        uint256 s3;
        for (uint256 k = 3; k < 16; k++) s3 += d[k];
        uint256 r = SPIN * 5000 * bs.DIST_DENOM();
        uint256 lim = (r - 1) / (s3 * 10_000);
        BlockSlots.Config memory c = _cfg(address(usdc));
        for (uint256 k = 0; k < 16; k++) c.prizes[k] = k >= 3 ? uint64(lim) : 0;
        BlockSlots admis = new BlockSlots(c);
        assertLt(admis.expectedNumerator(c.prizes) * 10_000, r, "lim : sous le bord");
        for (uint256 k = 3; k < 16; k++) c.prizes[k] = uint64(lim + 1);
        _refuse(c);
    }

    /* ------------------------------------------------------------ distribution exacte */

    function test_DistributionSommeAuDenominateur() public view {
        uint256[16] memory d = bs.distribution();
        uint256 s;
        for (uint256 k = 0; k < 16; k++) s += d[k];
        assertEq(s, bs.DIST_DENOM(), "somme des probabilites = 1 exactement");
        assertEq(d[14], 0, "14 points est impossible");
        assertEq(bs.DIST_DENOM(), uint256(1) << 144);
    }

    function test_EsperanceDeLaTable() public view {
        /* 0,151707 USDC par spin (151 707 brut, arrondi vers le bas), recalcule par test-slots-ev en node */
        assertEq(bs.expectedPayout(), 151_707);
        assertLt(bs.expectedPayout() * 10_000, SPIN * 5000, "esperance < part du pot (0,25)");
    }

    /* ------------------------------------------------------------ spin */

    function test_SpinPaieEtPartage() public {
        uint256 j0 = usdc.balanceOf(JOUEUR);
        vm.startPrank(JOUEUR);
        usdc.approve(address(bs), SPIN);
        vm.expectEmit(true, true, false, true);
        emit Spun(1, JOUEUR, 1002, 250_000, 250_000);
        uint256 id = bs.spin();
        vm.stopPrank();
        assertEq(id, 1);
        assertEq(j0 - usdc.balanceOf(JOUEUR), SPIN, "le joueur paie le prix exact");
        assertEq(usdc.balanceOf(DEV), 250_000, "50 % au dev tout de suite");
        assertEq(bs.pot(), 250_000, "50 % au pot");
        assertEq(usdc.balanceOf(address(bs)), 250_000);
        (address p, uint40 t, BlockSlots.Status s) = bs.spins(1);
        assertEq(p, JOUEUR);
        assertEq(t, 1002, "cible = bloc + 2");
        assertEq(uint256(s), uint256(BlockSlots.Status.Pending));
        assertEq(usdc.allowance(JOUEUR, address(bs)), 0, "approve exact consomme");
    }

    function test_SpinApprobationInsuffisante() public {
        vm.startPrank(JOUEUR);
        usdc.approve(address(bs), SPIN - 1);
        vm.expectRevert(BlockSlots.TransferFailed.selector);
        bs.spin();
        vm.stopPrank();
    }

    /* ------------------------------------------------------------ fenetre */

    function test_SettleTropTot() public {
        uint256 id = _spin(JOUEUR);
        vm.expectRevert(BlockSlots.TooEarly.selector);
        bs.settle(id);
        vm.roll(1002);
        vm.expectRevert(BlockSlots.TooEarly.selector);
        bs.settle(id);
    }

    function test_SettleDernierBlocDeLaFenetre() public {
        uint256 id = _spin(JOUEUR);
        vm.roll(1002 + 256);
        vm.setBlockhash(1002, keccak256("dernier"));
        assertEq(bs.settleableUntil(id), 1258);
        bs.settle(id);
        assertEq(bs.settleableUntil(id), 0);
    }

    function test_SettleHorsFenetreEtExpire() public {
        uint256 id = _spin(JOUEUR);
        vm.roll(1002 + 257);
        vm.expectRevert(BlockSlots.TooLate.selector);
        bs.settle(id);
        uint256 pot0 = bs.pot();
        uint256 b0 = usdc.balanceOf(address(bs));
        vm.expectEmit(true, true, false, false);
        emit Expired(id, JOUEUR);
        bs.expire(id);
        (,, BlockSlots.Status s) = bs.spins(id);
        assertEq(uint256(s), uint256(BlockSlots.Status.Expired));
        assertEq(bs.pot(), pot0, "aucun fonds ne bouge : la part est deja au pot");
        assertEq(usdc.balanceOf(address(bs)), b0);
        vm.expectRevert(BlockSlots.NotPending.selector);
        bs.expire(id);
    }

    function test_ExpireAvantLaFinRefuse() public {
        uint256 id = _spin(JOUEUR);
        vm.roll(1002 + 256);
        vm.expectRevert(BlockSlots.StillSettleable.selector);
        bs.expire(id);
    }

    /// @dev ⛔ aucun remboursement : rien ne rend le prix au joueur apres la fenetre (sinon il ne reglerait que ses gagnants)
    function test_PasDeRemboursement() public {
        uint256 id = _spin(JOUEUR);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        vm.roll(1002 + 300);
        bs.expire(id);
        (bool ok,) = address(bs).call(abi.encodeWithSignature("refund(uint256)", id));
        assertFalse(ok, "pas de refund()");
        assertEq(usdc.balanceOf(JOUEUR), j0, "le joueur ne recupere rien");
    }

    function test_SettleDeuxFoisEtInexistant() public {
        uint256 id = _spin(JOUEUR);
        _revele(id, keccak256("deux"));
        bs.settle(id);
        vm.expectRevert(BlockSlots.NotPending.selector);
        bs.settle(id);
        vm.expectRevert(BlockSlots.NotPending.selector);
        bs.settle(42);
        vm.expectRevert(BlockSlots.NotPending.selector);
        bs.expire(42);
    }

    function test_SettleHashNulRefuse() public {
        uint256 id = _spin(JOUEUR);
        vm.roll(1003);
        vm.setBlockhash(1002, bytes32(0));
        vm.expectRevert(BlockSlots.HashUnavailable.selector);
        bs.settle(id);
    }

    /* ------------------------------------------------------------ points */

    function _f(uint8[5] memory a, uint8[5] memory b, uint8[5] memory c) internal pure returns (uint8[5][3] memory f) {
        f[0] = a; f[1] = b; f[2] = c;
    }

    function test_PointsParTrait() public view {
        assertEq(bs.pointsFor(_f([0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2])), 0, "trois faces toutes differentes : 0");
        assertEq(bs.pointsFor(_f([3, 0, 0, 0, 0], [3, 1, 1, 1, 1], [2, 2, 2, 2, 2])), 1, "une paire (faces 0 et 1) : 1");
        assertEq(bs.pointsFor(_f([3, 0, 0, 0, 0], [1, 1, 1, 1, 1], [3, 2, 2, 2, 2])), 1, "une paire (faces 0 et 2) : 1");
        assertEq(bs.pointsFor(_f([0, 0, 0, 0, 0], [3, 1, 1, 1, 1], [3, 2, 2, 2, 2])), 1, "une paire (faces 1 et 2) : 1");
        assertEq(bs.pointsFor(_f([3, 0, 0, 0, 0], [3, 1, 1, 1, 1], [3, 2, 2, 2, 2])), 3, "un brelan : 3");
        assertEq(bs.pointsFor(_f([1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5])), 15, "trois faces identiques : 15 (jackpot)");
        assertEq(bs.pointsFor(_f([1, 2, 3, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 6])), 13, "4 brelans + 1 paire : 13");
        assertEq(bs.pointsFor(_f([1, 2, 3, 4, 5], [1, 2, 3, 4, 6], [1, 2, 3, 4, 7])), 12, "4 brelans : 12");
        assertEq(bs.pointsFor(_f([1, 2, 3, 4, 5], [1, 2, 3, 0, 0], [1, 2, 3, 0, 0])), 11, "3 brelans + 2 paires : 11");
    }

    /// @dev les graines « slotsN » (keccak256 de la chaine, spin #1) donnent 0..9 points : trouvees par test-slots-parite en node
    function _paiePourGraine(string memory graine, uint8 pointsAttendus, uint256 don) internal returns (uint256 gain, uint256 potAvant) {
        if (don != 0) _fund(don);
        uint256 id = _spin(JOUEUR);
        assertEq(id, 1);
        potAvant = bs.pot();
        bytes32 h = keccak256(bytes(graine));
        _revele(id, h);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        (uint8 p, uint256 pay) = bs.settle(id);
        assertEq(p, pointsAttendus, "points");
        gain = usdc.balanceOf(JOUEUR) - j0;
        assertEq(gain, pay, "gain rendu = gain recu");
        uint256 attendu = TABLE[p] < potAvant ? TABLE[p] : potAvant;
        assertEq(gain, attendu, "gain = min(table[points], pot)");
        assertEq(bs.pot(), potAvant - gain, "le pot baisse exactement du gain");
        assertEq(bs.pointsOf(JOUEUR), p, "points ajoutes au wallet");
        assertEq(bs.wonOf(JOUEUR), gain);
    }

    function test_Points0Rien() public { (uint256 g,) = _paiePourGraine("slots1", 0, 100_000_000); assertEq(g, 0); }
    function test_Points2Rien() public { (uint256 g,) = _paiePourGraine("slots8", 2, 100_000_000); assertEq(g, 0); }
    function test_Points3() public { (uint256 g,) = _paiePourGraine("slots13", 3, 100_000_000); assertEq(g, 250_000); }
    function test_Points4() public { (uint256 g,) = _paiePourGraine("slots10", 4, 100_000_000); assertEq(g, 750_000); }
    function test_Points5() public { (uint256 g,) = _paiePourGraine("slots82", 5, 100_000_000); assertEq(g, 2_000_000); }
    function test_Points6() public { (uint256 g,) = _paiePourGraine("slots33", 6, 100_000_000); assertEq(g, 5_000_000); }
    function test_Points7() public { (uint256 g,) = _paiePourGraine("slots1368", 7, 100_000_000); assertEq(g, 10_000_000); }
    function test_Points8() public { (uint256 g,) = _paiePourGraine("slots637", 8, 100_000_000); assertEq(g, 25_000_000); }
    function test_Points9() public { (uint256 g,) = _paiePourGraine("slots18837", 9, 100_000_000); assertEq(g, 50_000_000); }

    function test_GainPlafonneParLePot() public {
        /* pot = 0,25 (le spin seul) : 9 points (50 USDC) ne touchent que 0,25 */
        (uint256 g, uint256 p0) = _paiePourGraine("slots18837", 9, 0);
        assertEq(p0, 250_000);
        assertEq(g, 250_000, "payout = min(prix, pot)");
        assertEq(bs.pot(), 0);
        assertEq(usdc.balanceOf(address(bs)), 0);
    }

    function test_PointsSAdditionnentParWallet() public {
        _fund(100_000_000);
        uint256 total;
        for (uint256 i = 0; i < 6; i++) {
            uint256 id = _spin(JOUEUR);
            bytes32 h = keccak256(abi.encode("cumul", i));
            _revele(id, h);
            (uint8 p,) = bs.settle(id);
            total += p;
            assertEq(p, bs.pointsFor(bs.facesOf(h, id)), "points = pointsFor(facesOf(hash, id))");
            assertEq(bs.pointsOf(JOUEUR), total, "cumul");
        }
        assertEq(bs.pointsOf(AUTRE), 0, "un autre wallet n a rien");
    }

    function test_GainVaAuJoueurPasALAppelant() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        _revele(id, keccak256(bytes("slots82")));
        uint256 a0 = usdc.balanceOf(AUTRE);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        vm.prank(AUTRE);
        bs.settle(id);
        assertEq(usdc.balanceOf(AUTRE), a0, "l appelant ne touche rien");
        assertEq(usdc.balanceOf(JOUEUR) - j0, 2_000_000, "le joueur touche son gain");
    }

    /// @dev deux spins du MEME bloc ont des faces differentes (l id entre dans la graine)
    function test_DeuxSpinsMemeBlocIndependants() public {
        uint256 a = _spin(JOUEUR);
        uint256 b = _spin(AUTRE);
        (, uint40 ta,) = bs.spins(a);
        (, uint40 tb,) = bs.spins(b);
        assertEq(ta, tb, "meme bloc cible");
        bytes32 h = keccak256("meme bloc");
        uint8[5][3] memory fa = bs.facesOf(h, a);
        uint8[5][3] memory fb = bs.facesOf(h, b);
        assertTrue(keccak256(abi.encode(fa)) != keccak256(abi.encode(fb)), "faces differentes");
        assertTrue(bs.seedOf(h, a, 0) != bs.seedOf(h, a, 1) && bs.seedOf(h, a, 1) != bs.seedOf(h, a, 2), "trois graines distinctes");
    }

    /* ------------------------------------------------------------ settleMany */

    function test_SettleManyRegleEtSaute() public {
        _fund(100_000_000);
        uint256 a = _spin(JOUEUR);
        uint256 b = _spin(AUTRE);
        vm.roll(1003);
        vm.setBlockhash(1002, keccak256("lot"));
        uint256 c = _spin(JOUEUR); /* cible 1005 : trop tot */
        uint256[] memory ids = new uint256[](5);
        ids[0] = a; ids[1] = b; ids[2] = c; ids[3] = 999; ids[4] = a;
        uint256 n = bs.settleMany(ids);
        assertEq(n, 2, "a et b regles, c trop tot, 999 inexistant, a deja regle");
        (,, BlockSlots.Status sc) = bs.spins(c);
        assertEq(uint256(sc), uint256(BlockSlots.Status.Pending));
    }

    function test_SettleManyMemeResultatQueSettle() public {
        _fund(100_000_000);
        uint256 a = _spin(JOUEUR);
        bytes32 h = keccak256(bytes("slots82"));
        uint256 snap = vm.snapshotState();
        _revele(a, h);
        bs.settle(a);
        uint256 viaSettle = usdc.balanceOf(JOUEUR);
        vm.revertToState(snap);
        _revele(a, h);
        uint256[] memory ids = new uint256[](1);
        ids[0] = a;
        bs.settleMany(ids);
        assertEq(usdc.balanceOf(JOUEUR), viaSettle);
    }

    function test_SettleManyBornesDeLaFenetre() public {
        uint256 a = _spin(JOUEUR);
        uint256[] memory ids = new uint256[](1);
        ids[0] = a;
        vm.roll(1002 + 257);
        vm.setBlockhash(1002, keccak256("tard"));
        assertEq(bs.settleMany(ids), 0, "hors fenetre : saute");
    }

    function test_SettleManyDernierBlocDeLaFenetre() public {
        uint256 a = _spin(JOUEUR);
        uint256[] memory ids = new uint256[](1);
        ids[0] = a;
        vm.roll(1002 + 256);
        vm.setBlockhash(1002, keccak256("dernier du lot"));
        assertEq(bs.settleMany(ids), 1, "cible + 256 : encore regle par le lot");
    }

    function test_SettleManyPremierBlocApresLaCible() public {
        uint256 a = _spin(JOUEUR);
        uint256[] memory ids = new uint256[](1);
        ids[0] = a;
        vm.roll(1002);
        assertEq(bs.settleMany(ids), 0, "a la cible : trop tot, saute");
        vm.roll(1003);
        vm.setBlockhash(1002, keccak256("premier du lot"));
        assertEq(bs.settleMany(ids), 1, "cible + 1 : regle");
    }

    /* ------------------------------------------------------------ fuzz */

    /// @dev quel que soit le hash et le pot : payout = min(table[points], pot) ; le solde du contrat = le pot ; le pot ne passe jamais sous 0
    function testFuzz_PayoutPlafonneEtSoldeEgalPot(bytes32 h, uint96 dons) public {
        uint256 d = uint256(dons) % 5_000_000_000;
        if (d != 0) _fund(d);
        uint256 id = _spin(JOUEUR);
        vm.assume(h != bytes32(0));
        uint256 p0 = bs.pot();
        _revele(id, h);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        (uint8 p, uint256 pay) = bs.settle(id);
        assertLe(p, 15);
        assertTrue(p != 14, "14 points impossible");
        assertEq(p, bs.pointsFor(bs.facesOf(h, id)));
        uint256 attendu = TABLE[p] < p0 ? TABLE[p] : p0;
        assertEq(pay, attendu);
        assertEq(usdc.balanceOf(JOUEUR) - j0, pay);
        assertEq(bs.pot(), p0 - pay);
        assertEq(usdc.balanceOf(address(bs)), bs.pot(), "solde = pot");
    }

    /// @dev N spins sur des hashes au hasard : la somme des gains <= dons + parts entrees au pot ; solde = pot ; le dev recoit 50 % de chaque spin
    function testFuzz_SommeDesGains(bytes32 graine, uint8 n, uint64 don) public {
        uint256 k = uint256(n) % 12 + 1;
        uint256 d = uint256(don) % 200_000_000;
        if (d != 0) _fund(d);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint256 gains;
        for (uint256 i = 0; i < k; i++) {
            uint256 id = _spin(JOUEUR);
            bytes32 h = keccak256(abi.encode(graine, i));
            _revele(id, h);
            (, uint256 pay) = bs.settle(id);
            gains += pay;
        }
        assertLe(gains, d + k * 250_000, "on ne paie que ce qui est entre");
        assertEq(usdc.balanceOf(address(bs)), bs.pot(), "solde = pot");
        assertEq(bs.pot(), d + k * 250_000 - gains, "pot = entrees - gains");
        assertEq(usdc.balanceOf(DEV), k * 250_000, "dev : la moitie de chaque spin");
        assertEq(j0 + gains - k * SPIN, usdc.balanceOf(JOUEUR), "joueur : gains - prix");
        assertEq(bs.wonOf(JOUEUR), gains);
    }

    /// @dev la fenetre : pour tout decalage, settle passe ssi cible < bloc <= cible + 256
    function testFuzz_Fenetre(uint16 delta) public {
        uint256 id = _spin(JOUEUR);
        uint256 b = 1002 + uint256(delta) % 600;
        vm.roll(b);
        vm.setBlockhash(1002, keccak256("fenetre"));
        if (b <= 1002) { vm.expectRevert(BlockSlots.TooEarly.selector); bs.settle(id); }
        else if (b > 1002 + 256) { vm.expectRevert(BlockSlots.TooLate.selector); bs.settle(id); }
        else bs.settle(id);
    }

    /* ------------------------------------------------------------ jetons hostiles */

    function test_JetonQuiRendFauxRefuse() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        _revele(id, keccak256(bytes("slots82")));
        usdc.setFaux(true);
        vm.expectRevert(BlockSlots.TransferFailed.selector);
        bs.settle(id);
        vm.startPrank(JOUEUR);
        usdc.approve(address(bs), SPIN);
        vm.expectRevert(BlockSlots.TransferFailed.selector);
        bs.spin();
        vm.stopPrank();
    }

    function _reentree(bool lot) internal {
        UsdcHostileS hu = new UsdcHostileS();
        BlockSlots b2 = new BlockSlots(_cfg(address(hu)));
        hu.mint(JOUEUR, 1_000_000_000);
        vm.startPrank(JOUEUR);
        hu.approve(address(b2), 1_000_000_000);
        b2.fund(500_000_000);
        uint256 a = b2.spin();
        uint256 b = b2.spin();
        vm.stopPrank();
        hu.armer(b2, b, lot);
        vm.roll(1003);
        /* une graine qui paie au spin a (id 1) : slots82 donne 5 points pour l id 1 */
        vm.setBlockhash(1002, keccak256(bytes("slots82")));
        b2.settle(a);
        assertFalse(hu.reentreeReussie(), "la reentree ne passe pas");
        assertEq(hu.erreurVue(), BlockSlots.Reentrancy.selector);
        (,, BlockSlots.Status sb) = b2.spins(b);
        assertEq(uint256(sb), uint256(BlockSlots.Status.Pending), "l autre spin reste en attente");
    }

    function test_ReentreeSettleRefusee() public { _reentree(false); }
    function test_ReentreeSettleManyRefusee() public { _reentree(true); }

    /* ------------------------------------------------------------ PARITE avec face-du-jour.js (memes epingles que BlockRolls) */

    function _parite(bytes32 h, uint8 bande, uint8 orbite, uint8 facette, uint8 matiere, uint8 ornement) internal view {
        uint8[5] memory f = bs.faceOf(h);
        assertEq(f[0], bande); assertEq(f[1], orbite); assertEq(f[2], facette); assertEq(f[3], matiere); assertEq(f[4], ornement);
    }

    function test_PariteFaceDuJour() public view {
        _parite(0x33670809921ee57e8248123f30ff8dbb27acac3454bcd1f5a4336580d0d68521, 4, 7, 12, 7, 2);
        _parite(0xb711d32e79a26668135e088a66b12e421cbe6b55f6a929dd9e49896f952ccac8, 0, 5, 3, 2, 0);
        _parite(0x494a1264ca7b526bafe16d03fdb088252af07d5ece0f3e9a5e02cdef14e9968c, 0, 4, 5, 7, 2);
        _parite(0x0000000000000000000000000000000000000000000000000000000000000000, 1, 2, 7, 6, 0);
    }

    /* ⛔ Ces trois faces par (hash, id) sont RECALCULEES par test-slots-parite-20261023.mjs avec les modules de l app (keccak.js +
     *    traitsDepuisHash) : si l un des deux cotes derive, l un des deux tests rougit. Ne pas editer a la main. */
    function _pariteSpin(bytes32 h, uint256 id, uint8[15] memory v, uint8 pts) internal view {
        uint8[5][3] memory f = bs.facesOf(h, id);
        for (uint256 r = 0; r < 3; r++) for (uint256 i = 0; i < 5; i++) assertEq(f[r][i], v[r * 5 + i], "trait");
        assertEq(bs.pointsFor(f), pts, "points");
    }

    function test_PariteTroisFaces() public view {
        _pariteSpin(0x33670809921ee57e8248123f30ff8dbb27acac3454bcd1f5a4336580d0d68521, 1, [uint8(5), 3, 2, 5, 2, 5, 8, 6, 8, 4, 4, 6, 15, 6, 3], 1);
        _pariteSpin(0x33670809921ee57e8248123f30ff8dbb27acac3454bcd1f5a4336580d0d68521, 2, [uint8(4), 4, 17, 4, 1, 2, 2, 6, 2, 1, 5, 4, 6, 6, 3], 3);
        _pariteSpin(0x0000000000000000000000000000000000000000000000000000000000000000, 1, [uint8(2), 6, 3, 4, 7, 3, 8, 9, 1, 0, 2, 9, 9, 5, 4], 2);
        _pariteSpin(0x0000000000000000000000000000000000000000000000000000000000000000, 77, [uint8(0), 9, 0, 7, 1, 5, 2, 3, 0, 0, 2, 5, 15, 3, 6], 0);
        _pariteSpin(0x4649bfb672e1ba6238f8f691562ccc7b1c8af762f644dba5add955e9c74962cb, 77, [uint8(2), 7, 1, 8, 3, 0, 0, 16, 2, 7, 4, 7, 2, 0, 6], 1);
    }

    /* ------------------------------------------------------------ aucun retrait */

    function test_AucunRetrait() public {
        _fund(1_000_000);
        vm.startPrank(DEV);
        (bool ok,) = address(bs).call(abi.encodeWithSignature("withdraw(uint256)", 1));
        assertFalse(ok);
        (ok,) = address(bs).call(abi.encodeWithSignature("sweep(address)", DEV));
        assertFalse(ok);
        (ok,) = address(bs).call(abi.encodeWithSignature("setPrizes(uint64[16])", TABLE));
        assertFalse(ok, "la table ne se change pas");
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(bs)), 1_000_000);
    }

    function test_TransfertDirectNEntrePasAuPot() public {
        vm.prank(DONATEUR);
        usdc.transfer(address(bs), 7);
        assertEq(bs.pot(), 0);
    }

    function test_FundZeroRefuse() public {
        vm.expectRevert(BlockSlots.ZeroAmount.selector);
        bs.fund(0);
    }

    function test_PayoutFor() public {
        _fund(3_000_000);
        assertEq(bs.payoutFor(5), 2_000_000);
        assertEq(bs.payoutFor(9), 3_000_000, "plafonne par le pot");
        assertEq(bs.payoutFor(2), 0);
        assertEq(bs.payoutFor(16), 0, "hors table");
    }
}
