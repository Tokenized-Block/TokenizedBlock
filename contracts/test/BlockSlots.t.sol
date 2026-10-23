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

/// @dev jeton HOSTILE : pendant un paiement du contrat (gain, remboursement, part du dev), il tente de re-entrer avec `donnee`
///      (settle, settleMany, expire, payDev d un autre spin).
contract UsdcHostileS is UsdcS {
    BlockSlots public cible;
    bytes public donnee;
    bytes4 public erreurVue;
    bool public reentreeReussie;
    bool public tente;

    function armer(BlockSlots c, uint256 id, bool lot) external {
        cible = c;
        if (lot) {
            uint256[] memory ids = new uint256[](1);
            ids[0] = id;
            donnee = abi.encodeWithSelector(BlockSlots.settleMany.selector, ids);
        } else {
            donnee = abi.encodeWithSelector(BlockSlots.settle.selector, id);
        }
    }

    function armerDonnee(BlockSlots c, bytes memory d) external { cible = c; donnee = d; }

    function transfer(address to, uint256 a) external override returns (bool) {
        if (address(cible) != address(0) && msg.sender == address(cible)) {
            tente = true;
            bytes memory d = donnee;
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
    uint64[16] TABLE = [uint64(0), 0, 0, 250_000, 750_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000, 5_000_000];

    event Spun(uint256 indexed spinId, address indexed player, uint256 targetBlock, uint256 toPot, uint256 toDev);
    /// @dev v3 : l expiration REMBOURSE la part du dev (tenue par le contrat) au joueur
    event Expired(uint256 indexed spinId, address indexed player, uint256 refund);

    /* ⛔ v3 (verdict adverse 2026-10-23 + regles de Phil) : les fonctions NOUVELLES (acceptCapped, payDev, escrow, devOwed, REFUND,
     *    bestPlayNumerator) sont appelees ICI par des appels BAS NIVEAU : ce fichier compile donc contre l ANCIEN contrat (e14bd89), et
     *    chaque test v3 peut y etre lance pour ROUGIR (et non « ne compile pas », defaut 2 du verdict). */
    function _lireU(string memory sig) internal view returns (uint256) {
        (bool ok, bytes memory r) = address(bs).staticcall(abi.encodeWithSignature(sig));
        require(ok && r.length == 32, string.concat("lecture impossible : ", sig));
        return abi.decode(r, (uint256));
    }

    function _accepter(address qui, uint256 id, uint256 minimum) internal returns (bool ok, bytes memory r) {
        vm.prank(qui);
        (ok, r) = address(bs).call(abi.encodeWithSignature("acceptCapped(uint256,uint256)", id, minimum));
    }

    function _payDev(address qui) internal returns (bool ok, bytes memory r) {
        vm.prank(qui);
        (ok, r) = address(bs).call(abi.encodeWithSignature("payDev()"));
    }

    function _erreur(bytes memory r) internal pure returns (bytes4 e) {
        if (r.length >= 4) e = bytes4(r);
    }

    /// @dev l invariant de caisse : le solde USDC du contrat = pot + parts du dev en attente (escrow) + parts du dev dues (devOwed)
    function _caisse() internal view {
        assertEq(usdc.balanceOf(address(bs)), bs.pot() + _lireU("escrow()") + _lireU("devOwed()"), "solde = pot + escrow + devOwed");
    }

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

    /// @dev trois hashes distincts tires d un seul (pour les tests qui n epinglent pas les faces)
    function _deriver(bytes32 h) internal pure returns (bytes32[3] memory d) {
        d[0] = h;
        d[1] = keccak256(abi.encode(h, uint256(1)));
        d[2] = keccak256(abi.encode(h, uint256(2)));
    }

    /// @dev pose les hashes des blocs cible, +1, +2 et avance au premier bloc ou le spin se regle (cible + 3)
    function _revele(uint256 id, bytes32 h) internal {
        _reveleTrois(id, _deriver(h));
    }

    function _poserTrois(uint256 t, bytes32[3] memory h) internal {
        for (uint256 r = 0; r < 3; r++) vm.setBlockhash(t + r, h[r]);
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
        assertEq(_lireU("TO_POT()"), 250_000, "part du pot d un spin");
        assertEq(_lireU("REFUND()"), 250_000, "remboursement d une fenetre manquee = la part du dev");
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
        c.prizes[3] = 1_200_000; c.prizes[4] = 1_200_000; c.prizes[5] = 2_000_000; /* 3 points : 0,136 x 1,2 = 0,163 deja, total ~0,28 > 0,25 */
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
        /* 0,127862 USDC par spin (127 862 brut, arrondi vers le bas), recalcule par test-slots-ev et test-slots-v2 en node */
        assertEq(bs.expectedPayout(), 127_862);
        assertLt(bs.expectedPayout(), SPIN, "esperance strictement sous le prix");
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
        assertEq(usdc.balanceOf(DEV), 0, "v3 : la part du dev est TENUE jusqu au settle (rendue si la fenetre passe)");
        assertEq(bs.pot(), 250_000, "50 % au pot");
        assertEq(_lireU("escrow()"), 250_000, "50 % tenus pour le dev");
        assertEq(usdc.balanceOf(address(bs)), 500_000);
        _caisse();
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
        _poserTrois(1002, _deriver(keccak256("dernier")));
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
        uint256 j0 = usdc.balanceOf(JOUEUR);
        vm.expectEmit(true, true, false, true);
        emit Expired(id, JOUEUR, 250_000);
        bs.expire(id);
        (,, BlockSlots.Status s) = bs.spins(id);
        assertEq(uint256(s), uint256(BlockSlots.Status.Expired));
        assertEq(bs.pot(), pot0, "le pot garde sa part");
        assertEq(usdc.balanceOf(JOUEUR) - j0, 250_000, "v3 : la part du dev revient au joueur");
        assertEq(b0 - usdc.balanceOf(address(bs)), 250_000);
        _caisse();
        vm.expectRevert(BlockSlots.NotPending.selector);
        bs.expire(id);
    }

    function test_ExpireAvantLaFinRefuse() public {
        uint256 id = _spin(JOUEUR);
        vm.roll(1002 + 256);
        vm.expectRevert(BlockSlots.StillSettleable.selector);
        bs.expire(id);
    }

    /// @dev v3 (regle de Phil : fenetre manquee = remboursement) : la PART DU DEV revient au joueur, pas la part du pot. Un remboursement
    ///      du prix ENTIER est impossible avec « esperance strictement sous le prix » : test_V3_MeilleureStrategieSousLePrix le chiffre.
    ///      expire() par N IMPORTE QUI : le remboursement va TOUJOURS au joueur, jamais a l appelant ; pas de refund() a part.
    function test_RemboursementDeLaPartDuDevSeulement() public {
        uint256 id = _spin(JOUEUR);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint256 a0 = usdc.balanceOf(AUTRE);
        vm.roll(1002 + 300);
        vm.prank(AUTRE);
        bs.expire(id);
        (bool ok,) = address(bs).call(abi.encodeWithSignature("refund(uint256)", id));
        assertFalse(ok, "pas de refund() a part");
        assertEq(usdc.balanceOf(JOUEUR) - j0, 250_000, "le joueur recupere la part du dev, pas plus");
        assertEq(usdc.balanceOf(AUTRE), a0, "l appelant ne touche rien");
        assertEq(bs.pot(), 250_000, "la part du pot reste au pot");
        assertEq(_lireU("devOwed()"), 0, "le dev ne touche rien d un spin rembourse");
        _caisse();
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
        vm.roll(1005);
        vm.setBlockhash(1002, keccak256("h0"));
        vm.setBlockhash(1003, keccak256("h1"));
        vm.setBlockhash(1004, bytes32(0)); /* le TROISIEME hash illisible suffit a refuser */
        vm.expectRevert(BlockSlots.HashUnavailable.selector);
        bs.settle(id);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        assertEq(bs.settleMany(ids), 0, "le lot saute un spin a hash illisible");
        vm.setBlockhash(1004, keccak256("h2"));
        vm.setBlockhash(1002, bytes32(0)); /* le PREMIER aussi */
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

    /// @dev les graines « v2slotsN » (trois hashes _trois(graine), spin #1) donnent 0..10 points : trouvees et recalculees par
    ///      test-slots-parite en node. Pot suffisant : settle() ; pot court : seul acceptCapped(id, min) du JOUEUR paie (v3).
    function _paiePourGraine(string memory graine, uint8 pointsAttendus, uint256 don) internal returns (uint256 gain, uint256 potAvant) {
        if (don != 0) _fund(don);
        uint256 id = _spin(JOUEUR);
        assertEq(id, 1);
        potAvant = bs.pot();
        _reveleTrois(id, _trois(graine));
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint8 p;
        uint256 pay;
        if (TABLE[pointsAttendus] <= potAvant) {
            vm.prank(JOUEUR);
            (p, pay) = bs.settle(id);
        } else {
            vm.prank(JOUEUR);
            vm.expectRevert(BlockSlots.PotShort.selector);
            bs.settle(id);
            (bool ok, bytes memory r) = _accepter(JOUEUR, id, potAvant);
            assertTrue(ok, "le joueur accepte le pot");
            (p, pay) = abi.decode(r, (uint8, uint256));
        }
        assertEq(p, pointsAttendus, "points");
        gain = usdc.balanceOf(JOUEUR) - j0;
        assertEq(gain, pay, "gain rendu = gain recu");
        uint256 attendu = TABLE[p] < potAvant ? TABLE[p] : potAvant;
        assertEq(gain, attendu, "gain = min(table[points], pot)");
        assertEq(bs.pot(), potAvant - gain, "le pot baisse exactement du gain");
        assertEq(bs.pointsOf(JOUEUR), p, "points ajoutes au wallet");
        assertEq(bs.wonOf(JOUEUR), gain);
    }

    function test_Points0Rien() public { (uint256 g,) = _paiePourGraine("v2slots4", 0, 100_000_000); assertEq(g, 0); }
    function test_Points1Rien() public { (uint256 g,) = _paiePourGraine("v2slots1", 1, 100_000_000); assertEq(g, 0); }
    function test_Points2Rien() public { (uint256 g,) = _paiePourGraine("v2slots3", 2, 100_000_000); assertEq(g, 0); }
    function test_Points3() public { (uint256 g,) = _paiePourGraine("v2slots16", 3, 100_000_000); assertEq(g, 250_000); }
    function test_Points4() public { (uint256 g,) = _paiePourGraine("v2slots0", 4, 100_000_000); assertEq(g, 750_000); }
    function test_Points5() public { (uint256 g,) = _paiePourGraine("v2slots24", 5, 100_000_000); assertEq(g, 2_000_000); }
    function test_Points6() public { (uint256 g,) = _paiePourGraine("v2slots314", 6, 100_000_000); assertEq(g, 3_000_000); }
    function test_Points7() public { (uint256 g,) = _paiePourGraine("v2slots6", 7, 100_000_000); assertEq(g, 4_000_000); }
    function test_Points8() public { (uint256 g,) = _paiePourGraine("v2slots12083", 8, 100_000_000); assertEq(g, 5_000_000); }
    function test_Points9() public { (uint256 g,) = _paiePourGraine("v2slots3465", 9, 100_000_000); assertEq(g, 5_000_000); }
    function test_Points10() public { (uint256 g,) = _paiePourGraine("v2slots292116", 10, 100_000_000); assertEq(g, 5_000_000, "10 points : 5 USDC, le plafond"); }

    function test_GainPlafonneParLePot() public {
        /* pot = 0,25 (le spin seul) : 9 points (5 USDC) ne touchent que 0,25 -- settle() refuse, le JOUEUR accepte (acceptCapped) */
        (uint256 g, uint256 p0) = _paiePourGraine("v2slots3465", 9, 0);
        assertEq(p0, 250_000);
        assertEq(g, 250_000, "payout = min(prix, pot)");
        assertEq(bs.pot(), 0);
        assertEq(usdc.balanceOf(address(bs)), 250_000, "reste la part du dev, due");
        _caisse();
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
            assertEq(p, bs.pointsFor(bs.facesOf(_deriver(h), id)), "points = pointsFor(facesOf(trois hashes, id))");
            assertEq(bs.pointsOf(JOUEUR), total, "cumul");
        }
        assertEq(bs.pointsOf(AUTRE), 0, "un autre wallet n a rien");
    }

    function test_GainVaAuJoueurPasALAppelant() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        _reveleTrois(id, _trois("v2slots24"));
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
        uint8[5][3] memory fa = bs.facesOf(_deriver(h), a);
        uint8[5][3] memory fb = bs.facesOf(_deriver(h), b);
        assertTrue(keccak256(abi.encode(fa)) != keccak256(abi.encode(fb)), "faces differentes");
        assertTrue(bs.seedOf(h, a, 0) != bs.seedOf(h, a, 1) && bs.seedOf(h, a, 1) != bs.seedOf(h, a, 2), "trois graines distinctes");
    }

    /* ------------------------------------------------------------ settleMany */

    function test_SettleManyRegleEtSaute() public {
        _fund(100_000_000);
        uint256 a = _spin(JOUEUR);
        uint256 b = _spin(AUTRE);
        vm.roll(1005);
        _poserTrois(1002, _deriver(keccak256("lot")));
        uint256 c = _spin(JOUEUR); /* cible 1007 : trop tot */
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
        bytes32 h = keccak256(bytes("meme resultat"));
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
        _poserTrois(1002, _deriver(keccak256("dernier du lot")));
        assertEq(bs.settleMany(ids), 1, "cible + 256 : encore regle par le lot");
    }

    function test_SettleManyPremierBlocApresLaCible() public {
        uint256 a = _spin(JOUEUR);
        uint256[] memory ids = new uint256[](1);
        ids[0] = a;
        vm.roll(1002);
        assertEq(bs.settleMany(ids), 0, "a la cible : trop tot, saute");
        vm.roll(1005);
        _poserTrois(1002, _deriver(keccak256("premier du lot")));
        assertEq(bs.settleMany(ids), 1, "cible + 3 (le 3e hash existe) : regle");
    }

    /* ------------------------------------------------------------ fuzz */

    /// @dev quel que soit le hash et le pot : settle() paie le prix ENTIER ou refuse (PotShort) ; acceptCapped du joueur paie min(prix, pot) ;
    ///      jamais plus de 5 USDC ; la caisse tient (solde = pot + escrow + devOwed)
    function testFuzz_PayoutPlafonneEtCaisse(bytes32 h, uint96 dons) public {
        uint256 d = uint256(dons) % 5_000_000_000;
        if (d != 0) _fund(d);
        uint256 id = _spin(JOUEUR);
        vm.assume(h != bytes32(0));
        uint256 p0 = bs.pot();
        _revele(id, h);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint8 attenduP = bs.pointsFor(bs.facesOf(_deriver(h), id));
        uint8 p;
        uint256 pay;
        if (TABLE[attenduP] <= p0) {
            vm.prank(JOUEUR);
            (p, pay) = bs.settle(id);
        } else {
            vm.prank(JOUEUR);
            vm.expectRevert(BlockSlots.PotShort.selector);
            bs.settle(id);
            (bool ok, bytes memory r) = _accepter(JOUEUR, id, 0);
            assertTrue(ok, "acceptCapped du joueur");
            (p, pay) = abi.decode(r, (uint8, uint256));
        }
        assertLe(p, 15);
        assertTrue(p != 14, "14 points impossible");
        assertEq(p, attenduP);
        assertLe(pay, 5_000_000, "jamais plus de 5 USDC par spin");
        uint256 attendu = TABLE[p] < p0 ? TABLE[p] : p0;
        assertEq(pay, attendu);
        assertEq(usdc.balanceOf(JOUEUR) - j0, pay);
        assertEq(bs.pot(), p0 - pay);
        _caisse();
    }

    /// @dev N spins sur des hashes au hasard, chacun REGLE (settle, ou acceptCapped si le pot est court) OU laisse EXPIRER (rembourse) :
    ///      gains <= dons + parts du pot ; caisse tenue a chaque pas ; le dev touche la part des spins regles SEULEMENT (apres payDev) ;
    ///      le joueur : gains + remboursements - prix
    function testFuzz_SommeDesGains(bytes32 graine, uint8 n, uint64 don, uint16 masqueExpire) public {
        uint256 k = uint256(n) % 12 + 1;
        uint256 d = uint256(don) % 200_000_000;
        if (d != 0) _fund(d);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint256 gains;
        uint256 regles;
        uint256 rembourses;
        for (uint256 i = 0; i < k; i++) {
            uint256 id = _spin(JOUEUR);
            bytes32 h = keccak256(abi.encode(graine, i));
            if ((masqueExpire >> i) & 1 == 1) {
                (, uint40 t,) = bs.spins(id);
                vm.roll(uint256(t) + 257);
                bs.expire(id);
                rembourses++;
            } else {
                _revele(id, h);
                (bool ok, bytes memory r) = _accepter(JOUEUR, id, 0);
                assertTrue(ok, "acceptCapped du joueur");
                (, uint256 pay) = abi.decode(r, (uint8, uint256));
                gains += pay;
                regles++;
            }
            _caisse();
        }
        assertLe(gains, d + k * 250_000, "on ne paie que ce qui est entre");
        assertEq(bs.pot(), d + k * 250_000 - gains, "pot = entrees - gains");
        assertEq(usdc.balanceOf(DEV), 0, "rien au dev avant payDev");
        (bool okDev,) = _payDev(AUTRE);
        assertTrue(okDev, "payDev par n importe qui");
        assertEq(usdc.balanceOf(DEV), regles * 250_000, "dev : la part des spins REGLES seulement");
        assertEq(usdc.balanceOf(address(bs)), bs.pot(), "apres payDev : solde = pot");
        assertEq(j0 + gains + rembourses * 250_000 - k * SPIN, usdc.balanceOf(JOUEUR), "joueur : gains + remboursements - prix");
        assertEq(bs.wonOf(JOUEUR), gains);
    }

    /// @dev la fenetre : pour tout decalage, settle passe ssi cible + 2 < bloc <= cible + 256 (les trois hashes, la fenetre du premier)
    function testFuzz_Fenetre(uint16 delta) public {
        uint256 id = _spin(JOUEUR);
        uint256 b = 1002 + uint256(delta) % 600;
        vm.roll(b);
        bytes32[3] memory h = _deriver(keccak256("fenetre"));
        for (uint256 r = 0; r < 3; r++) if (1002 + r <= b) vm.setBlockhash(1002 + r, h[r]);
        if (b <= 1004) {
            vm.expectRevert(BlockSlots.TooEarly.selector); bs.settle(id);
            (bool ok, bytes memory r) = _accepter(JOUEUR, id, 0);
            assertTrue(!ok && _erreur(r) == BlockSlots.TooEarly.selector, "acceptCapped : meme borne basse");
        } else if (b > 1002 + 256) {
            vm.expectRevert(BlockSlots.TooLate.selector); bs.settle(id);
            (bool ok, bytes memory r) = _accepter(JOUEUR, id, 0);
            assertTrue(!ok && _erreur(r) == BlockSlots.TooLate.selector, "acceptCapped : meme borne haute");
        } else {
            (bool ok,) = _accepter(JOUEUR, id, 0);
            assertTrue(ok, "dans la fenetre : le joueur regle");
        }
    }

    /* ------------------------------------------------------------ jetons hostiles */

    function test_JetonQuiRendFauxRefuse() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        _reveleTrois(id, _trois("v2slots24"));
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
        vm.roll(1005);
        /* une graine qui paie au spin a (id 1) : v2slots24 donne 5 points pour l id 1 */
        _poserTrois(1002, _trois("v2slots24"));
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
    /// @dev les trois hashes sont ceux de _trois(graine) (keccak256(abi.encodePacked(graine, uint8(r)))) ; le test node les recalcule
    function _pariteSpin(string memory graine, uint256 id, uint8[15] memory v, uint8 pts) internal view {
        uint8[5][3] memory f = bs.facesOf(_trois(graine), id);
        for (uint256 r = 0; r < 3; r++) for (uint256 i = 0; i < 5; i++) assertEq(f[r][i], v[r * 5 + i], "trait");
        assertEq(bs.pointsFor(f), pts, "points");
    }

    function test_PariteTroisFaces() public view {
        _pariteSpin("pin-a", 1, [uint8(2), 6, 9, 4, 1, 3, 9, 8, 6, 7, 5, 7, 12, 2, 3], 0);
        _pariteSpin("pin-b", 2, [uint8(3), 9, 0, 4, 2, 4, 5, 12, 5, 0, 4, 0, 2, 4, 5], 2);
        _pariteSpin("pin-c", 77, [uint8(1), 2, 10, 2, 5, 5, 0, 17, 6, 7, 1, 2, 9, 1, 4], 2);
        _pariteSpin("pin-d", 9, [uint8(4), 5, 4, 0, 5, 2, 2, 16, 8, 5, 0, 4, 5, 2, 3], 1);
        _pariteSpin("pin-e", 123456, [uint8(0), 2, 13, 4, 0, 5, 4, 7, 8, 1, 3, 0, 16, 4, 2], 1);
        /* pin-a : le hash du bloc cible + 1 vient bien de _trois (temoin d ancrage pour le test node) */
        assertEq(_trois("pin-a")[1], 0x086ab6dbdf5fa1c77ebe9c75bbf3bab40ab706ed8e2ed2138c6f20f1ac947b50);
    }

    /* ------------------------------------------------------------ V2 (verdict adverse + decisions de Phil, 2026-10-23) */
    /* ⛔ ecrits AVANT le changement du contrat, avec les seules fonctions de l ancien (seedOf, faceOf, pointsFor) : ils doivent y rougir. */

    /// @dev les trois hashes d une graine : h_r = keccak256(abi.encodePacked(g, uint8(r))) — recalcules par test-slots-parite en node
    function _trois(string memory g) internal pure returns (bytes32[3] memory h) {
        for (uint256 r = 0; r < 3; r++) h[r] = keccak256(abi.encodePacked(g, uint8(r)));
    }

    function _reveleTrois(uint256 id, bytes32[3] memory h) internal {
        (, uint40 t,) = bs.spins(id);
        vm.roll(uint256(t) + 3);
        for (uint256 r = 0; r < 3; r++) vm.setBlockhash(uint256(t) + r, h[r]);
    }

    function _pointsDeTroisBlocs(bytes32[3] memory h, uint256 id) internal view returns (uint8) {
        uint8[5][3] memory f;
        for (uint256 r = 0; r < 3; r++) f[r] = bs.faceOf(bs.seedOf(h[r], id, r));
        return bs.pointsFor(f);
    }

    /// @dev (a) chaque face vient de SON bloc : cible, cible + 1, cible + 2 (v2slots6 : 7 points ainsi, 2 sur le seul hash de la cible)
    function test_V2_UneFaceParBloc() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        bytes32[3] memory h = _trois("v2slots6");
        _reveleTrois(id, h);
        (uint8 p,) = bs.settle(id);
        assertEq(p, _pointsDeTroisBlocs(h, id), "points = faces des trois blocs");
        assertEq(p, 7);
    }

    /// @dev (a) le reglement attend le TROISIEME hash : cible + 1 et cible + 2 sont trop tot, cible + 3 regle
    function test_V2_TropTotAvantLeTroisiemeBloc() public {
        uint256 id = _spin(JOUEUR);
        vm.roll(1003);
        vm.setBlockhash(1002, keccak256(abi.encode("tot", 0)));
        vm.expectRevert(BlockSlots.TooEarly.selector);
        bs.settle(id);
        vm.roll(1004);
        vm.setBlockhash(1003, keccak256(abi.encode("tot", 1)));
        vm.expectRevert(BlockSlots.TooEarly.selector);
        bs.settle(id);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        assertEq(bs.settleMany(ids), 0, "cible + 2 : le lot saute");
        vm.roll(1005);
        vm.setBlockhash(1004, keccak256(abi.encode("tot", 2)));
        bs.settle(id);
    }

    /// @dev (b) 5 USDC au plus par spin : une table a 5,000001 est refusee, 5 admis
    function test_V2_PlafondCinqUsdc() public {
        assertEq(uint256(bs.MAX_PRIZE()), 5_000_000);
        BlockSlots.Config memory c = _cfg(address(usdc));
        c.prizes[15] = 5_000_001;
        _refuse(c);
        c.prizes[15] = 5_000_000;
        new BlockSlots(c);
    }

    /// @dev (b) le contrat juge et paie lui-meme au settle : 9 points -> 5 USDC (le plafond), au joueur
    function test_V2_NeufPointsPaientCinq() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        _reveleTrois(id, _trois("v2slots3465"));
        uint256 j0 = usdc.balanceOf(JOUEUR);
        (uint8 p, uint256 pay) = bs.settle(id);
        assertEq(p, 9);
        assertEq(pay, 5_000_000);
        assertEq(usdc.balanceOf(JOUEUR) - j0, 5_000_000);
    }

    /// @dev R1 : un TIERS ne peut pas faire accepter un gain plafonne par le pot ; le joueur, lui, le peut
    function test_V2_TiersNeRegleSurPotCourt() public {
        uint256 id = _spin(JOUEUR); /* pot 0,25 */
        _reveleTrois(id, _trois("v2slots24")); /* 5 points : 2 USDC > pot */
        vm.prank(AUTRE);
        vm.expectRevert(bytes4(keccak256("PotShort()")));
        bs.settle(id);
        uint256[] memory ids = new uint256[](1);
        ids[0] = id;
        vm.prank(AUTRE);
        assertEq(bs.settleMany(ids), 0, "le lot d un tiers saute le spin a pot court");
        (,, BlockSlots.Status s) = bs.spins(id);
        assertEq(uint256(s), uint256(BlockSlots.Status.Pending), "le spin reste au joueur");
        uint256 j0 = usdc.balanceOf(JOUEUR);
        /* v3 : le joueur accepte EXPLICITEMENT (acceptCapped, avec le minimum qu il a vu) ; un tiers ne le peut pas */
        (bool okA, bytes memory rA) = _accepter(AUTRE, id, 0);
        assertTrue(!okA && _erreur(rA) == bytes4(keccak256("NotPlayer()")), "acceptCapped : le joueur seulement");
        (bool ok, bytes memory r) = _accepter(JOUEUR, id, 250_000);
        assertTrue(ok, "le joueur choisit d accepter le pot");
        (, uint256 pay) = abi.decode(r, (uint8, uint256));
        assertEq(pay, 250_000);
        assertEq(usdc.balanceOf(JOUEUR) - j0, 250_000);
    }

    /// @dev R1 : avec un pot suffisant, un tiers regle toujours, et le gain va au joueur
    function test_V2_TiersRegleSiLePotSuffit() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        _reveleTrois(id, _trois("v2slots24"));
        uint256 j0 = usdc.balanceOf(JOUEUR);
        vm.prank(AUTRE);
        (, uint256 pay) = bs.settle(id);
        assertEq(pay, 2_000_000);
        assertEq(usdc.balanceOf(JOUEUR) - j0, 2_000_000);
    }

    /* ------------------------------------------------------------ V3 (verdict adverse 2026-10-23, regles de Phil) */
    /* ⛔ ecrits AVANT le changement du contrat ; ils compilent contre l ancien (appels bas niveau) et doivent y ROUGIR. */

    /// @dev les deux spins du verdict : le MEME joueur, deux spins a 8 points (5 USDC chacun), un pot de 5 USDC. Defaut 1 : son
    ///      settleMany([1,2]) reglait #2 a 0 sans le dire. v3 : le lot SAUTE #2 (pot court), meme pour le joueur ; #2 reste a lui.
    function test_V3_LotDuJoueurSautePotCourt() public {
        uint256 a = _spin(JOUEUR); /* bloc 1000, cible 1002 */
        vm.roll(1010);
        uint256 b = _spin(JOUEUR); /* cible 1012 : trois autres blocs */
        _fund(4_500_000); /* pot 0,25 + 0,25 + 4,50 = 5,00 */
        assertEq(bs.pot(), 5_000_000);
        vm.roll(1015);
        _poserTrois(1002, _trois("v3slots656"));
        _poserTrois(1012, _trois("v3slots10500"));
        assertEq(bs.pointsFor(bs.facesOf(_trois("v3slots656"), a)), 8, "#1 : 8 points");
        assertEq(bs.pointsFor(bs.facesOf(_trois("v3slots10500"), b)), 8, "#2 : 8 points");
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint256[] memory ids = new uint256[](2);
        ids[0] = a; ids[1] = b;
        vm.prank(JOUEUR);
        assertEq(bs.settleMany(ids), 1, "le lot regle #1 en entier et SAUTE #2");
        assertEq(usdc.balanceOf(JOUEUR) - j0, 5_000_000, "#1 paye 5 USDC");
        (,, BlockSlots.Status sb) = bs.spins(b);
        assertEq(uint256(sb), uint256(BlockSlots.Status.Pending), "#2 n est PAS clos a 0");
        assertEq(bs.pot(), 0);
        /* le joueur lui-meme : settle() ne prend pas un gain plafonne non plus */
        vm.prank(JOUEUR);
        vm.expectRevert(BlockSlots.PotShort.selector);
        bs.settle(b);
        /* accepter EXPLICITEMENT, avec le minimum vu : sous le minimum, refuse */
        (bool ok, bytes memory r) = _accepter(JOUEUR, b, 1);
        assertTrue(!ok && _erreur(r) == bytes4(keccak256("BelowMinimum()")), "pot vide : sous le minimum vu, refuse");
        _fund(3_000_000);
        (ok, r) = _accepter(JOUEUR, b, 3_000_000);
        assertTrue(ok, "le joueur accepte 3 USDC sur 5");
        (uint8 p, uint256 pay) = abi.decode(r, (uint8, uint256));
        assertEq(p, 8);
        assertEq(pay, 3_000_000);
        assertEq(bs.wonOf(JOUEUR), 8_000_000);
        _caisse();
    }

    /// @dev acceptCapped avec un pot SUFFISANT paie le prix entier (c est un settle) ; et pas plus
    function test_V3_AccepterAvecPotSuffisant() public {
        _fund(100_000_000);
        uint256 id = _spin(JOUEUR);
        _reveleTrois(id, _trois("v2slots24")); /* 5 points : 2 USDC */
        (bool ok, bytes memory r) = _accepter(JOUEUR, id, 2_000_000);
        assertTrue(ok);
        (, uint256 pay) = abi.decode(r, (uint8, uint256));
        assertEq(pay, 2_000_000);
        (ok, r) = _accepter(JOUEUR, id, 0);
        assertTrue(!ok && _erreur(r) == BlockSlots.NotPending.selector, "deja regle");
    }

    /// @dev la part du dev est TENUE jusqu au settle, puis due (devOwed) ; payDev() par n importe qui l envoie au DEV_WALLET seul
    function test_V3_PartDuDevPayeeAuReglement() public {
        uint256 id = _spin(JOUEUR);
        assertEq(usdc.balanceOf(DEV), 0, "rien au dev au spin");
        _reveleTrois(id, _trois("v3slots0")); /* 0 point pour l id 1 */
        vm.prank(AUTRE);
        (uint8 p, uint256 pay) = bs.settle(id);
        assertEq(p, 0);
        assertEq(pay, 0);
        assertEq(_lireU("escrow()"), 0);
        assertEq(_lireU("devOwed()"), 250_000);
        _caisse();
        uint256 a0 = usdc.balanceOf(AUTRE);
        (bool ok,) = _payDev(AUTRE);
        assertTrue(ok);
        assertEq(usdc.balanceOf(DEV), 250_000, "au DEV_WALLET");
        assertEq(usdc.balanceOf(AUTRE), a0, "rien a l appelant");
        assertEq(_lireU("devOwed()"), 0);
        (ok,) = _payDev(AUTRE);
        assertTrue(ok, "un second payDev ne paie rien de plus");
        assertEq(usdc.balanceOf(DEV), 250_000);
        assertEq(bs.pot(), 250_000, "le pot n est pas touche");
        _caisse();
    }

    /// @dev « esperance strictement sous le prix » AVEC le remboursement : la meilleure strategie (regler si le prix depasse le
    ///      remboursement, sinon laisser expirer) rend en moyenne 7252695144110113090426044529286962642681856000000 / 2^144 = 325 222 brut
    ///      (0,325222 USDC) par spin de 0,50. Le remboursement du prix ENTIER rendrait >= 0,50 : impossible avec la regle (556 549 ici).
    function test_V3_MeilleureStrategieSousLePrix() public view {
        uint256 best = _lireU("bestPlayNumerator()");
        assertEq(best, 7252695144110113090426044529286962642681856000000);
        assertEq(best / bs.DIST_DENOM(), 325_222);
        assertLt(best, SPIN * bs.DIST_DENOM(), "meilleure strategie strictement sous le prix");
        uint256[16] memory d = bs.distribution();
        uint256 plein;
        for (uint256 k = 0; k < 16; k++) plein += d[k] * (TABLE[k] > SPIN ? TABLE[k] : SPIN);
        assertGe(plein, SPIN * bs.DIST_DENOM(), "rembourser le prix ENTIER : la meilleure strategie atteint le prix");
        assertEq(plein / bs.DIST_DENOM(), 556_549);
    }

    /// @dev la garde est EXACTE sur ce qui ENTRE au pot (arrondi bas) : spin 500 001, part 50 % -> 250 000 au pot, 250 001 rendables.
    ///      Une table « x pour 3 points et plus » d esperance entre 250 000 et 250 000,5 passait l ancienne garde (prix x part / BPS, sans
    ///      l arrondi) : la preuve « meilleure strategie <= esperance + rendable < part du pot + rendable = prix » n y tient plus (a moins
    ///      d une unite brute pres). Refusee ; x - 1 admis.
    function test_V3_GardeSurLaPartQuiEntreAuPot() public {
        uint256[16] memory d = bs.distribution();
        uint256 s3;
        for (uint256 k = 3; k < 16; k++) s3 += d[k];
        uint256 x = (250_000 * bs.DIST_DENOM() + s3 - 1) / s3; /* ceil */
        BlockSlots.Config memory c = _cfg(address(usdc));
        c.spinPrice = 500_001;
        for (uint256 k = 0; k < 16; k++) c.prizes[k] = k >= 3 ? uint64(x) : 0;
        assertLt(x * s3 * 10_000, c.spinPrice * 5000 * bs.DIST_DENOM(), "l ancienne garde l admettait");
        _refuse(c);
        for (uint256 k = 3; k < 16; k++) c.prizes[k] = uint64(x - 1);
        new BlockSlots(c);
    }

    /// @dev pour TOUTE table admise par le constructeur : meilleure strategie < prix (E[max(X, r)] <= E[X] + r < part du pot + r = prix)
    function testFuzz_V3_TableAdmiseSousLePrix(uint64[8] memory pas, uint32 prix, uint16 part) public {
        BlockSlots.Config memory c = _cfg(address(usdc));
        c.spinPrice = uint256(prix) % 2_000_000 + 1;
        c.potShareBps = uint16(uint256(part) % 10_000 + 1);
        uint64 v;
        for (uint256 k = 0; k < 16; k++) {
            if (k >= 3 && k < 11) v += uint64(uint256(pas[k - 3]) % 700_000);
            if (v > 5_000_000) v = 5_000_000;
            c.prizes[k] = v;
        }
        try new BlockSlots(c) returns (BlockSlots b2) {
            (bool ok, bytes memory r) = address(b2).staticcall(abi.encodeWithSignature("bestPlayNumerator()"));
            assertTrue(ok && r.length == 32, "bestPlayNumerator");
            assertLt(abi.decode(r, (uint256)), c.spinPrice * b2.DIST_DENOM(), "table admise : meilleure strategie < prix");
            (ok, r) = address(b2).staticcall(abi.encodeWithSignature("REFUND()"));
            assertTrue(ok);
            assertEq(abi.decode(r, (uint256)) + (c.spinPrice * c.potShareBps) / 10_000, c.spinPrice, "rendable + part du pot = prix");
        } catch {}
    }

    /// @dev les paiements de expire (remboursement) et de payDev passent sous le verrou : un jeton hostile qui re-entre est refuse
    function test_V3_ReentreeExpireEtPayDev() public {
        UsdcHostileS hu = new UsdcHostileS();
        BlockSlots b2 = new BlockSlots(_cfg(address(hu)));
        hu.mint(JOUEUR, 1_000_000_000);
        vm.startPrank(JOUEUR);
        hu.approve(address(b2), 1_000_000_000);
        uint256 a = b2.spin();
        uint256 b = b2.spin();
        vm.stopPrank();
        vm.roll(1002 + 257);
        hu.armerDonnee(b2, abi.encodeWithSignature("payDev()"));
        b2.expire(a);
        assertTrue(hu.tente(), "le remboursement passe par transfer");
        assertFalse(hu.reentreeReussie(), "pas de re-entree pendant expire");
        assertEq(hu.erreurVue(), BlockSlots.Reentrancy.selector);
        assertEq(hu.balanceOf(JOUEUR), 1_000_000_000 - 2 * SPIN + 250_000, "le joueur est rembourse une fois");
        (,, BlockSlots.Status sb) = b2.spins(b);
        assertEq(uint256(sb), uint256(BlockSlots.Status.Pending));
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
        /* v3 : payDev existe, mais n envoie que la part DUE des spins regles (ici 0), jamais le pot */
        (ok,) = _payDev(DEV);
        assertTrue(ok, "payDev sans rien du");
        assertEq(usdc.balanceOf(DEV), 0, "le pot ne sort pas par payDev");
        assertEq(usdc.balanceOf(address(bs)), 1_000_000);
        assertEq(bs.pot(), 1_000_000);
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
