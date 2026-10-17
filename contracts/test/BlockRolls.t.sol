// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/BlockRolls.sol";

/// @dev USDC de test : 6 decimales, transferFrom standard, et un mode « rend false » pour la garde SafeERC20.
contract UsdcT {
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

/// @dev jeton HOSTILE : pendant le paiement d un gain, il tente de re-entrer dans settle() d un autre roll.
contract UsdcHostile is UsdcT {
    BlockRolls public cible;
    uint256 public autreRoll;
    bytes4 public erreurVue;
    bool public reentreeReussie;

    function armer(BlockRolls c, uint256 id) external { cible = c; autreRoll = id; }

    function transfer(address to, uint256 a) external override returns (bool) {
        if (address(cible) != address(0) && msg.sender == address(cible)) {
            (bool ok, bytes memory ret) = address(cible).call(abi.encodeWithSelector(BlockRolls.settle.selector, autreRoll));
            reentreeReussie = ok;
            if (!ok && ret.length >= 4) erreurVue = bytes4(ret);
        }
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

contract BlockRollsTest is Test {
    UsdcT usdc;
    BlockRolls br;
    address DEV = address(0xD3F);
    address JOUEUR = address(0xA11);
    address AUTRE = address(0xB22);
    address DONATEUR = address(0xC33);

    uint256 constant ROLL = 500_000;
    uint256 constant PASS = 10_000_000;

    function setUp() public {
        vm.roll(1000);
        vm.warp(1_700_000_000);
        usdc = new UsdcT();
        br = _deployer(address(usdc));
        usdc.mint(JOUEUR, 1_000_000_000);
        usdc.mint(AUTRE, 1_000_000_000);
        usdc.mint(DONATEUR, 1_000_000_000);
    }

    function _deployer(address t) internal returns (BlockRolls) {
        return new BlockRolls(t, DEV, ROLL, PASS, 30, 24 hours, 5000, 5000, 1000, 100);
    }

    function _g(uint8 a, uint8 b, uint8 c, uint8 d, uint8 e) internal pure returns (uint8[5] memory g) {
        g[0] = a; g[1] = b; g[2] = c; g[3] = d; g[4] = e;
    }

    function _roll(address p, uint8[5] memory g) internal returns (uint256 id) {
        vm.startPrank(p);
        usdc.approve(address(br), ROLL);
        id = br.roll(g);
        vm.stopPrank();
    }

    function _fund(uint256 a) internal {
        vm.startPrank(DONATEUR);
        usdc.approve(address(br), a);
        br.fund(a);
        vm.stopPrank();
    }

    /// @dev amene la chaine juste apres la cible et y grave le hash voulu
    function _revele(uint256 id, bytes32 h) internal {
        (, uint48 t,,) = br.rolls(id);
        vm.roll(uint256(t) + 1);
        vm.setBlockhash(t, h);
    }

    /// @dev un guess qui partage EXACTEMENT `k` traits avec la face (les autres decales de 1, modulo la taille de la liste)
    function _guessScore(uint8[5] memory face, uint8 k) internal pure returns (uint8[5] memory g) {
        uint8[5] memory n = [uint8(6), 10, 19, 9, 8];
        for (uint256 i = 0; i < 5; i++) g[i] = i < k ? face[i] : uint8((uint256(face[i]) + 1) % n[i]);
    }

    /* ------------------------------------------------------------ configuration */

    function test_ConfigImmuable() public view {
        assertEq(br.USDC(), address(usdc));
        assertEq(br.DEV_WALLET(), DEV);
        assertEq(br.ROLL_PRICE(), 500_000);
        assertEq(br.PASS_PRICE(), 10_000_000);
        assertEq(br.PASS_ROLLS(), 30);
        assertEq(br.PASS_WINDOW(), 24 hours);
        assertEq(br.POT_SHARE_BPS(), 5000);
        assertEq(br.P5_BPS(), 5000);
        assertEq(br.P4_BPS(), 1000);
        assertEq(br.P3_BPS(), 100);
    }

    function test_ConfigRefusee() public {
        vm.expectRevert(BlockRolls.BadConfig.selector);
        new BlockRolls(address(0), DEV, ROLL, PASS, 30, 1 days, 5000, 5000, 1000, 100);
        vm.expectRevert(BlockRolls.BadConfig.selector);
        new BlockRolls(address(0x1234), DEV, ROLL, PASS, 30, 1 days, 5000, 5000, 1000, 100); /* pas de code */
        vm.expectRevert(BlockRolls.BadConfig.selector);
        new BlockRolls(address(usdc), address(0), ROLL, PASS, 30, 1 days, 5000, 5000, 1000, 100);
        vm.expectRevert(BlockRolls.BadConfig.selector);
        new BlockRolls(address(usdc), DEV, 0, PASS, 30, 1 days, 5000, 5000, 1000, 100);
        vm.expectRevert(BlockRolls.BadConfig.selector);
        new BlockRolls(address(usdc), DEV, ROLL, PASS, 0, 1 days, 5000, 5000, 1000, 100);
        vm.expectRevert(BlockRolls.BadConfig.selector);
        new BlockRolls(address(usdc), DEV, ROLL, PASS, 30, 1 days, 10001, 5000, 1000, 100);
        vm.expectRevert(BlockRolls.BadConfig.selector);
        new BlockRolls(address(usdc), DEV, ROLL, PASS, 30, 1 days, 5000, 10001, 1000, 100);
        vm.expectRevert(BlockRolls.BadConfig.selector);
        new BlockRolls(address(usdc), DEV, ROLL, PASS, 30, 1 days, 5000, 1000, 5000, 100); /* P4 > P5 */
        vm.expectRevert(BlockRolls.BadConfig.selector);
        new BlockRolls(address(usdc), DEV, ROLL, PASS, 30, 1 days, 5000, 5000, 100, 1000); /* P3 > P4 */
    }

    /* ------------------------------------------------------------ prix et partage 50/50 */

    function test_RollPaieEtPartage() public {
        uint256 j0 = usdc.balanceOf(JOUEUR);
        uint256 id = _roll(JOUEUR, _g(0, 0, 0, 0, 0));
        assertEq(id, 1);
        assertEq(usdc.balanceOf(JOUEUR), j0 - 500_000, "joueur -0,50");
        assertEq(usdc.balanceOf(DEV), 250_000, "dev +0,25 tout de suite");
        assertEq(br.pot(), 250_000, "pot +0,25");
        assertEq(usdc.balanceOf(address(br)), 250_000, "le contrat tient exactement le pot");
        (address p, uint48 t, BlockRolls.Status s,) = br.rolls(id);
        assertEq(p, JOUEUR);
        assertEq(uint256(t), 1002, "cible = bloc + 2");
        assertEq(uint256(s), uint256(BlockRolls.Status.Pending));
    }

    function test_RollApprobationInsuffisante() public {
        vm.startPrank(JOUEUR);
        usdc.approve(address(br), ROLL - 1);
        vm.expectRevert(BlockRolls.TransferFailed.selector);
        br.roll(_g(0, 0, 0, 0, 0));
        vm.stopPrank();
    }

    function test_GuessEnregistreEtRendu() public {
        uint256 id = _roll(JOUEUR, _g(5, 9, 18, 8, 7));
        uint8[5] memory g = br.guessOf(id);
        assertEq(g[0], 5); assertEq(g[1], 9); assertEq(g[2], 18); assertEq(g[3], 8); assertEq(g[4], 7);
    }

    /* ------------------------------------------------------------ bornes du guess */

    function test_GuessHorsBornesRefuse() public {
        uint8[5] memory ok = _g(5, 9, 18, 8, 7);
        uint8[5] memory n = [uint8(6), 10, 19, 9, 8];
        for (uint256 i = 0; i < 5; i++) {
            uint8[5] memory g = _g(ok[0], ok[1], ok[2], ok[3], ok[4]); /* copie : `= ok` partagerait la memoire */
            g[i] = n[i];
            vm.startPrank(JOUEUR);
            usdc.approve(address(br), ROLL);
            vm.expectRevert(BlockRolls.BadGuess.selector);
            br.roll(g);
            vm.stopPrank();
        }
        _roll(JOUEUR, ok); /* les maxima valides passent */
        assertEq(br.rollCount(), 1);
    }

    function test_GuessHorsBornesRefuseAvecPass() public {
        _acheterPass(JOUEUR);
        vm.prank(JOUEUR);
        vm.expectRevert(BlockRolls.BadGuess.selector);
        br.rollWithPass(_g(0, 0, 19, 0, 0));
        (uint32 left,) = br.passes(JOUEUR);
        assertEq(left, 30, "un guess refuse ne consomme pas de roll");
    }

    /* ------------------------------------------------------------ pass */

    function _acheterPass(address p) internal {
        vm.startPrank(p);
        usdc.approve(address(br), PASS);
        br.buyPass();
        vm.stopPrank();
    }

    function test_PassPrixEtPartage() public {
        _acheterPass(JOUEUR);
        assertEq(usdc.balanceOf(DEV), 5_000_000);
        assertEq(br.pot(), 5_000_000);
        (uint32 left, uint64 exp) = br.passes(JOUEUR);
        assertEq(left, 30);
        assertEq(exp, uint64(block.timestamp + 24 hours));
    }

    function test_PassTrenteRollsPuisRefus() public {
        _acheterPass(JOUEUR);
        uint256 dev0 = usdc.balanceOf(DEV);
        vm.startPrank(JOUEUR);
        for (uint256 i = 0; i < 30; i++) br.rollWithPass(_g(0, 0, 0, 0, 0));
        vm.expectRevert(BlockRolls.NoPass.selector);
        br.rollWithPass(_g(0, 0, 0, 0, 0));
        vm.stopPrank();
        assertEq(br.rollCount(), 30);
        assertEq(usdc.balanceOf(DEV), dev0, "un roll de pass ne paie rien de plus");
    }

    function test_PassExpire() public {
        _acheterPass(JOUEUR);
        vm.warp(block.timestamp + 24 hours - 1);
        vm.prank(JOUEUR);
        br.rollWithPass(_g(0, 0, 0, 0, 0));
        vm.warp(block.timestamp + 1); /* = expiresAt */
        vm.prank(JOUEUR);
        vm.expectRevert(BlockRolls.NoPass.selector);
        br.rollWithPass(_g(0, 0, 0, 0, 0));
    }

    function test_SansPassRefuse() public {
        vm.prank(JOUEUR);
        vm.expectRevert(BlockRolls.NoPass.selector);
        br.rollWithPass(_g(0, 0, 0, 0, 0));
    }

    function test_PassActifNonRachetable() public {
        _acheterPass(JOUEUR);
        vm.startPrank(JOUEUR);
        usdc.approve(address(br), PASS);
        vm.expectRevert(BlockRolls.PassActive.selector);
        br.buyPass();
        vm.stopPrank();
    }

    function test_PassRachetableQuandEpuiseOuExpire() public {
        _acheterPass(JOUEUR);
        vm.startPrank(JOUEUR);
        for (uint256 i = 0; i < 30; i++) br.rollWithPass(_g(0, 0, 0, 0, 0));
        vm.stopPrank();
        _acheterPass(JOUEUR); /* epuise : rachat admis */
        vm.prank(JOUEUR);
        br.rollWithPass(_g(0, 0, 0, 0, 0));
        vm.warp(block.timestamp + 24 hours); /* expire avec 29 restants */
        _acheterPass(JOUEUR);
        (uint32 left,) = br.passes(JOUEUR);
        assertEq(left, 30, "les rolls expires ne se cumulent pas");
    }

    /* ------------------------------------------------------------ settle : avant / dans / apres la fenetre */

    function test_SettleTropTot() public {
        uint256 id = _roll(JOUEUR, _g(0, 0, 0, 0, 0));
        vm.expectRevert(BlockRolls.TooEarly.selector);
        br.settle(id);
        vm.roll(1002); /* = cible : son hash n est pas encore lisible */
        vm.expectRevert(BlockRolls.TooEarly.selector);
        br.settle(id);
    }

    function test_SettleDernierBlocDeLaFenetre() public {
        uint256 id = _roll(JOUEUR, _g(0, 0, 0, 0, 0));
        vm.roll(1002 + 256);
        vm.setBlockhash(1002, keccak256("x"));
        br.settle(id);
        (,, BlockRolls.Status s,) = br.rolls(id);
        assertEq(uint256(s), uint256(BlockRolls.Status.Settled));
    }

    function test_SettleHorsFenetreEtExpire() public {
        uint256 id = _roll(JOUEUR, _g(0, 0, 0, 0, 0));
        vm.roll(1002 + 256);
        vm.expectRevert(BlockRolls.StillSettleable.selector);
        br.expire(id);
        vm.roll(1002 + 257);
        vm.setBlockhash(1002, keccak256("x")); /* meme si un hash etait lisible, la fenetre est fermee */
        vm.expectRevert(BlockRolls.TooLate.selector);
        br.settle(id);
        uint256 pot0 = br.pot();
        br.expire(id);
        (,, BlockRolls.Status s,) = br.rolls(id);
        assertEq(uint256(s), uint256(BlockRolls.Status.Expired));
        assertEq(br.pot(), pot0, "expirer ne rembourse rien et ne sort rien du pot");
        vm.expectRevert(BlockRolls.NotPending.selector);
        br.settle(id);
        vm.expectRevert(BlockRolls.NotPending.selector);
        br.expire(id);
    }

    function test_SettleDeuxFoisRefuse() public {
        uint256 id = _roll(JOUEUR, _g(0, 0, 0, 0, 0));
        _revele(id, keccak256("y"));
        br.settle(id);
        vm.expectRevert(BlockRolls.NotPending.selector);
        br.settle(id);
    }

    function test_SettleRollInexistant() public {
        vm.expectRevert(BlockRolls.NotPending.selector);
        br.settle(42);
        vm.expectRevert(BlockRolls.NotPending.selector);
        br.expire(42);
    }

    function test_SettleHashNulRefuse() public {
        uint256 id = _roll(JOUEUR, _g(0, 0, 0, 0, 0));
        vm.roll(1003);
        vm.setBlockhash(1002, bytes32(0));
        vm.expectRevert(BlockRolls.HashUnavailable.selector);
        br.settle(id);
    }

    /* ------------------------------------------------------------ paliers de gain */

    function _paiePourScore(uint8 k) internal returns (uint256 gain, uint256 potAvant) {
        bytes32 h = keccak256(abi.encode("palier", k));
        uint8[5] memory face = br.faceOf(h);
        _fund(100_000_000);
        uint256 id = _roll(JOUEUR, _guessScore(face, k));
        potAvant = br.pot();
        _revele(id, h);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        (uint8 s, uint256 p) = br.settle(id);
        assertEq(s, k, "score");
        gain = usdc.balanceOf(JOUEUR) - j0;
        assertEq(gain, p, "gain rendu = gain recu");
        assertEq(br.pot(), potAvant - gain, "pot diminue exactement du gain");
    }

    function test_PalierP5() public {
        (uint256 g, uint256 p0) = _paiePourScore(5);
        assertEq(g, p0 / 2, "P5 = 50 % du pot");
        assertEq(g, 50_125_000);
    }

    function test_PalierP4() public {
        (uint256 g, uint256 p0) = _paiePourScore(4);
        assertEq(g, p0 / 10, "P4 = 10 %");
    }

    function test_PalierP3() public {
        (uint256 g, uint256 p0) = _paiePourScore(3);
        assertEq(g, p0 / 100, "P3 = 1 %");
    }

    function test_PaliersSansGain() public {
        for (uint8 k = 0; k < 3; k++) {
            (uint256 g,) = _paiePourScore(k);
            assertEq(g, 0, "0, 1 ou 2 traits : rien");
        }
    }

    function test_GainCapeParLePot() public {
        /* pot minuscule : deux P5 a la suite ; le second prend la moitie de ce qui RESTE, jamais plus */
        bytes32 h = keccak256("cap");
        uint8[5] memory face = br.faceOf(h);
        uint256 a = _roll(JOUEUR, face);
        uint256 b = _roll(AUTRE, face); /* meme bloc, meme cible */
        assertEq(br.pot(), 500_000);
        _revele(a, h);
        (, uint256 pa) = br.settle(a);
        (, uint256 pb) = br.settle(b);
        assertEq(pa, 250_000);
        assertEq(pb, 125_000);
        assertEq(br.pot(), 125_000);
        assertEq(usdc.balanceOf(address(br)), br.pot());
    }

    function test_GainVaAuJoueurPasALAppelant() public {
        bytes32 h = keccak256("tiers");
        uint8[5] memory face = br.faceOf(h);
        _fund(10_000_000);
        uint256 id = _roll(JOUEUR, face);
        _revele(id, h);
        uint256 a0 = usdc.balanceOf(AUTRE);
        uint256 j0 = usdc.balanceOf(JOUEUR);
        vm.prank(AUTRE);
        (, uint256 p) = br.settle(id);
        assertGt(p, 0);
        assertEq(usdc.balanceOf(AUTRE), a0, "l appelant ne touche rien");
        assertEq(usdc.balanceOf(JOUEUR), j0 + p);
    }

    /// @dev fuzz : quel que soit le hash et le guess, le pot ne devient jamais negatif et le contrat tient toujours le pot
    function testFuzz_PotJamaisNegatif(bytes32 h, uint8[5] memory g, uint96 dons) public {
        vm.assume(h != bytes32(0));
        for (uint256 i = 0; i < 5; i++) g[i] = uint8(uint256(g[i]) % [uint256(6), 10, 19, 9, 8][i]);
        uint256 d = uint256(dons) % 500_000_000;
        if (d != 0) _fund(d);
        uint256 id = _roll(JOUEUR, g);
        uint256 p0 = br.pot();
        _revele(id, h);
        (uint8 s, uint256 p) = br.settle(id);
        assertLe(p, p0 / 2, "jamais plus que la part P5");
        assertEq(br.pot(), p0 - p);
        assertGe(usdc.balanceOf(address(br)), br.pot());
        assertEq(s, br.scoreOf(g, br.faceOf(h)));
    }

    function test_FundAjouteAuPot() public {
        _fund(7_000_000);
        assertEq(br.pot(), 7_000_000);
        vm.prank(DONATEUR);
        vm.expectRevert(BlockRolls.ZeroAmount.selector);
        br.fund(0);
    }

    function test_TransfertDirectNEntrePasAuPot() public {
        vm.prank(DONATEUR);
        usdc.transfer(address(br), 1_000_000);
        assertEq(br.pot(), 0, "seul fund() alimente le pot compte");
    }

    /* ------------------------------------------------------------ jetons hostiles */

    function test_JetonQuiRendFauxRefuse() public {
        vm.startPrank(JOUEUR);
        usdc.approve(address(br), ROLL);
        usdc.setFaux(true);
        vm.expectRevert(BlockRolls.TransferFailed.selector);
        br.roll(_g(0, 0, 0, 0, 0));
        vm.stopPrank();
    }

    function test_ReentreeRefusee() public {
        UsdcHostile hu = new UsdcHostile();
        BlockRolls b2 = _deployer(address(hu));
        hu.mint(JOUEUR, 100_000_000);
        bytes32 h = keccak256("reentree");
        uint8[5] memory face = b2.faceOf(h);
        vm.startPrank(JOUEUR);
        hu.approve(address(b2), 100_000_000);
        b2.fund(50_000_000);
        uint256 a = b2.roll(face);
        uint256 b = b2.roll(face);
        vm.stopPrank();
        hu.armer(b2, b);
        vm.roll(1003);
        vm.setBlockhash(1002, h);
        b2.settle(a);
        assertFalse(hu.reentreeReussie(), "la reentree ne passe pas");
        assertEq(hu.erreurVue(), BlockRolls.Reentrancy.selector);
        (,, BlockRolls.Status sb,) = b2.rolls(b);
        assertEq(uint256(sb), uint256(BlockRolls.Status.Pending), "l autre roll reste en attente");
    }

    /* ------------------------------------------------------------ PARITE avec face-du-jour.js */
    /* ⛔ Ces valeurs sont lues ET recalculees par test-blockrolls-parite-20261017.mjs avec les modules de l app
     *    (faceRevelee + bandeTeinte) : si l un des deux cotes derive, l un des deux tests rougit. Ne pas editer a la main. */

    function _parite(bytes32 h, uint8 bande, uint8 orbite, uint8 facette, uint8 matiere, uint8 ornement, uint16 teinte) internal view {
        uint8[5] memory f = br.faceOf(h);
        assertEq(f[0], bande, "bande");
        assertEq(f[1], orbite, "orbite");
        assertEq(f[2], facette, "facette");
        assertEq(f[3], matiere, "matiere");
        assertEq(f[4], ornement, "ornement");
        assertEq(br.hueOf(h), teinte, "teinte");
    }

    function test_PariteFaceDuJour() public view {
        _parite(0x33670809921ee57e8248123f30ff8dbb27acac3454bcd1f5a4336580d0d68521, 4, 7, 12, 7, 2, 211);
        _parite(0x4649bfb672e1ba6238f8f691562ccc7b1c8af762f644dba5add955e9c74962cb, 2, 3, 10, 7, 4, 137);
        _parite(0x614a41e7fca4a30ed399723e1109b10db840fe6e83bb3bf746a0b31eb8d6de50, 1, 0, 2, 8, 1, 68);
        _parite(0x57b276e85e2da230e1f9dc29f618212b46b9da654f479ec9225b30f15f310785, 1, 2, 13, 3, 7, 82);
        _parite(0x5fad981384084d5de477813bf9d958e4805a76ff0f6008c1eb4a3b127a96abee, 4, 4, 7, 0, 4, 268);
        _parite(0xb711d32e79a26668135e088a66b12e421cbe6b55f6a929dd9e49896f952ccac8, 0, 5, 3, 2, 0, 332);
        _parite(0x494a1264ca7b526bafe16d03fdb088252af07d5ece0f3e9a5e02cdef14e9968c, 0, 4, 5, 7, 2, 360);
        _parite(0x0000000000000000000000000000000000000000000000000000000000000000, 1, 2, 7, 6, 0, 78);
    }
}
