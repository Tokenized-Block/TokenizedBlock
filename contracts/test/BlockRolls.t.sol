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

/// @dev le hook 7030 tel que BlockRolls le lit : createurs(bytes32) -> (creator, ...)
contract HookStub {
    mapping(bytes32 => address) public c;
    function set(bytes32 id, address a) external { c[id] = a; }
    function createurs(bytes32 id) external view returns (address, uint256) { return (c[id], 0); }
}

/* l id de la pool UNIT/ETH sur le hook 7030 -- recalcule par test-blockrolls-plan (poolIdDe), pas une valeur de confiance */
bytes32 constant POOL = 0x79a40c325329a45db0874896a0ecd6f24ca2df12e1deb909bdfb3e5045b1c321;

contract BlockRollsTest is Test {
    UsdcT usdc;
    HookStub hook;
    BlockRolls br;
    address DEV = address(0xD3F);
    address JOUEUR = address(0xA11);
    address AUTRE = address(0xB22);
    address DONATEUR = address(0xC33);
    address CREATEUR = address(0x31e0DBc9038C82184B9fa6a90057a3ED500BdE3B); /* mesure du jour sur mainnet ; le test ne depend pas de la valeur */

    uint256 constant ROLL = 500_000;
    uint256 constant PASS = 10_000_000;
    uint64 constant PRIX = 5_000_000;
    uint256 constant T0 = 1_700_006_400; /* 2023-11-15 00:00:00 UTC exactement : 1_700_006_400 / 86400 = 19676 */
    uint32 constant JOUR0 = 19676;

    event RulesSet(uint16 indexed version, uint64 prize5, uint64 prize4, uint64 prize3, uint8 minScore, address by);
    event PassBought(address indexed player, uint32 indexed day, uint32 rollsLeft, uint64 expiresAt, uint256 paid, uint256 dayPotAfter);
    event DayClosed(uint32 indexed day, uint256 targetBlock, uint256 buyers, uint256 dayPot, address by);
    event DayDrawn(uint32 indexed day, address indexed winner, bytes32 blockHash, uint256 amount, uint256 buyers);

    function setUp() public {
        vm.roll(1000);
        vm.warp(T0);
        usdc = new UsdcT();
        hook = new HookStub();
        hook.set(POOL, CREATEUR);
        br = _deployer(address(usdc));
        usdc.mint(JOUEUR, 1_000_000_000);
        usdc.mint(AUTRE, 1_000_000_000);
        usdc.mint(DONATEUR, 1_000_000_000);
    }

    function _cfg(address t) internal view returns (BlockRolls.Config memory c) {
        c = BlockRolls.Config(t, DEV, address(hook), POOL, ROLL, PASS, 30, 24 hours, 5000, PRIX, PRIX, PRIX, 3);
    }

    function _deployer(address t) internal returns (BlockRolls) {
        return new BlockRolls(_cfg(t));
    }

    function _refuse(BlockRolls.Config memory c) internal {
        vm.expectRevert(BlockRolls.BadConfig.selector);
        new BlockRolls(c);
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

    function _acheterPass(address p) internal {
        vm.startPrank(p);
        usdc.approve(address(br), PASS);
        br.buyPass();
        vm.stopPrank();
    }

    /// @dev amene la chaine juste apres la cible et y grave le hash voulu
    function _revele(uint256 id, bytes32 h) internal {
        (, uint40 t,,,) = br.rolls(id);
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
        assertEq(br.HOOK(), address(hook));
        assertEq(br.UNIT_POOL_ID(), POOL);
        assertEq(br.ROLL_PRICE(), 500_000);
        assertEq(br.PASS_PRICE(), 10_000_000);
        assertEq(br.PASS_ROLLS(), 30);
        assertEq(br.PASS_WINDOW(), 24 hours);
        assertEq(br.POT_SHARE_BPS(), 5000);
        (uint64 p5, uint64 p4, uint64 p3, uint8 ms) = br.currentRules();
        assertEq(p5, PRIX); assertEq(p4, PRIX); assertEq(p3, PRIX); assertEq(ms, 3);
        assertEq(br.rulesVersion(), 1);
        assertEq(br.unitCreator(), CREATEUR, "le createur est LU au hook, jamais stocke");
    }

    function test_ConfigRefusee() public {
        BlockRolls.Config memory c;
        c = _cfg(address(0)); _refuse(c);
        c = _cfg(address(0x1234)); _refuse(c); /* usdc sans code */
        c = _cfg(address(usdc)); c.devWallet = address(0); _refuse(c);
        c = _cfg(address(usdc)); c.hook = address(0x1234); _refuse(c); /* hook sans code */
        c = _cfg(address(usdc)); c.unitPoolId = bytes32(0); _refuse(c);
        c = _cfg(address(usdc)); c.rollPrice = 0; _refuse(c);
        c = _cfg(address(usdc)); c.passPrice = 0; _refuse(c);
        c = _cfg(address(usdc)); c.passRolls = 0; _refuse(c);
        c = _cfg(address(usdc)); c.passWindow = 0; _refuse(c);
        c = _cfg(address(usdc)); c.potShareBps = 10001; _refuse(c);
        c = _cfg(address(usdc)); c.prize5 = 1000_000001; _refuse(c); /* prix > 1000 USDC */
        c = _cfg(address(usdc)); c.prize3 = 1000_000001; _refuse(c);
        c = _cfg(address(usdc)); c.minScore = 2; _refuse(c); /* minScore < 3 */
        c = _cfg(address(usdc)); c.minScore = 6; _refuse(c);
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
        (address p, uint40 t, BlockRolls.Status s,, uint16 v) = br.rolls(id);
        assertEq(p, JOUEUR);
        assertEq(uint256(t), 1002, "cible = bloc + 2");
        assertEq(uint256(s), uint256(BlockRolls.Status.Pending));
        assertEq(v, 1, "le roll porte la version des regles");
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

    function test_PassPrixEtPartageVersLeJour() public {
        vm.startPrank(JOUEUR);
        usdc.approve(address(br), PASS);
        vm.expectEmit(true, true, false, true);
        emit PassBought(JOUEUR, JOUR0, 30, uint64(T0 + 24 hours), PASS, 5_000_000);
        br.buyPass();
        vm.stopPrank();
        assertEq(usdc.balanceOf(DEV), 5_000_000);
        assertEq(br.pot(), 0, "le pot des ROLLS ne bouge pas");
        (uint256 dp, uint40 t, BlockRolls.DayState st) = br.dayPots(JOUR0);
        assertEq(dp, 5_000_000, "le pot du JOUR +5");
        assertEq(t, 0);
        assertEq(uint256(st), uint256(BlockRolls.DayState.Open));
        assertEq(br.buyerCount(JOUR0), 1);
        assertTrue(br.entered(JOUR0, JOUEUR));
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
        _acheterPass(JOUEUR); /* epuise : rachat admis, MEME jour : une seule entree au tirage, mais le pot du jour +5 */
        assertEq(br.buyerCount(JOUR0), 1, "un wallet = une entree par jour");
        (uint256 dp,,) = br.dayPots(JOUR0);
        assertEq(dp, 10_000_000, "le second achat alimente quand meme le pot du jour");
        vm.prank(JOUEUR);
        br.rollWithPass(_g(0, 0, 0, 0, 0));
        vm.warp(block.timestamp + 24 hours); /* expire avec 29 restants ; jour suivant */
        _acheterPass(JOUEUR);
        (uint32 left,) = br.passes(JOUEUR);
        assertEq(left, 30, "les rolls expires ne se cumulent pas");
        assertEq(br.buyerCount(JOUR0 + 1), 1, "entree au tirage du NOUVEAU jour");
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
        (,, BlockRolls.Status s,,) = br.rolls(id);
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
        (,, BlockRolls.Status s,,) = br.rolls(id);
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

    /* ------------------------------------------------------------ prix fixes, plafonnes par le pot */

    function _paiePourScore(uint8 k, uint256 don) internal returns (uint256 gain, uint256 potAvant) {
        bytes32 h = keccak256(abi.encode("prix", k));
        uint8[5] memory face = br.faceOf(h);
        if (don != 0) _fund(don);
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

    function test_PrixFixe5Pour5Et4Et3() public {
        (uint256 g5,) = _paiePourScore(5, 100_000_000);
        assertEq(g5, 5_000_000, "5/5 : 5 USDC fixes, pas une part du pot");
        (uint256 g4,) = _paiePourScore(4, 0);
        assertEq(g4, 5_000_000);
        (uint256 g3,) = _paiePourScore(3, 0);
        assertEq(g3, 5_000_000);
    }

    function test_SousLeScoreMinimumRien() public {
        for (uint8 k = 0; k < 3; k++) {
            (uint256 g,) = _paiePourScore(k, k == 0 ? 100_000_000 : 0);
            assertEq(g, 0, "0, 1 ou 2 traits : rien");
        }
    }

    function test_GainPlafonneParLePot() public {
        /* pot = 0,25 apres un seul roll : le 5/5 ne touche que 0,25, pas 5 */
        (uint256 g, uint256 p0) = _paiePourScore(5, 0);
        assertEq(p0, 250_000);
        assertEq(g, 250_000, "payout = min(prix, pot)");
        assertEq(br.pot(), 0);
        assertEq(usdc.balanceOf(address(br)), 0);
    }

    function test_DeuxGagnantsMemeBlocPotCourt() public {
        /* pot 7 : le premier regle prend 5, le second ce qui RESTE (2) -- l ordre des settles decide */
        bytes32 h = keccak256("cap");
        uint8[5] memory face = br.faceOf(h);
        _fund(6_500_000);
        uint256 a = _roll(JOUEUR, face);
        uint256 b = _roll(AUTRE, face);
        assertEq(br.pot(), 7_000_000);
        _revele(a, h);
        (, uint256 pb) = br.settle(b);
        (, uint256 pa) = br.settle(a);
        assertEq(pb, 5_000_000);
        assertEq(pa, 2_000_000);
        assertEq(br.pot(), 0);
        assertEq(usdc.balanceOf(address(br)), br.pot());
    }

    function test_TroisGagnantsMemeBlocPotLarge() public {
        bytes32 h = keccak256("trio");
        uint8[5] memory face = br.faceOf(h);
        _fund(80_000_000);
        uint256 a = _roll(JOUEUR, face);
        uint256 b = _roll(AUTRE, face);
        uint256 c = _roll(DONATEUR, face);
        _revele(a, h);
        (, uint256 pc) = br.settle(c);
        (, uint256 pa) = br.settle(a);
        (, uint256 pb) = br.settle(b);
        assertEq(pc + pa + pb, 15_000_000, "3 x 5 : chacun le prix plein quand le pot suffit");
        assertEq(br.pot(), 80_750_000 - 15_000_000);
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
        uint256 d = uint256(dons) % 20_000_000;
        if (d != 0) _fund(d);
        uint256 id = _roll(JOUEUR, g);
        uint256 p0 = br.pot();
        _revele(id, h);
        (uint8 s, uint256 p) = br.settle(id);
        assertLe(p, p0, "jamais plus que le pot");
        assertLe(p, 5_000_000, "jamais plus que le prix");
        assertEq(br.pot(), p0 - p);
        assertGe(usdc.balanceOf(address(br)), br.pot());
        assertEq(s, br.scoreOf(g, br.faceOf(h)));
        if (s < 3) assertEq(p, 0);
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

    function test_PayoutForLitLesReglesCourantes() public {
        assertEq(br.payoutFor(5), 0, "pot vide : 0");
        _fund(1_000_000);
        assertEq(br.payoutFor(5), 1_000_000, "plafonne par le pot");
        _fund(9_000_000);
        assertEq(br.payoutFor(5), 5_000_000);
        assertEq(br.payoutFor(2), 0);
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
        (,, BlockRolls.Status sb,,) = b2.rolls(b);
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

    /* ============================================================ REGLES fixees par le createur de UNIT */

    function test_SetRulesSeulLeCreateur() public {
        vm.prank(JOUEUR);
        vm.expectRevert(BlockRolls.NotCreator.selector);
        br.setRules(10_000_000, 5_000_000, 1_000_000, 3);
        vm.prank(DEV);
        vm.expectRevert(BlockRolls.NotCreator.selector);
        br.setRules(10_000_000, 5_000_000, 1_000_000, 3);
        vm.expectEmit(true, false, false, true);
        emit RulesSet(2, 10_000_000, 5_000_000, 1_000_000, 4, CREATEUR);
        vm.prank(CREATEUR);
        br.setRules(10_000_000, 5_000_000, 1_000_000, 4);
        (uint64 p5, uint64 p4, uint64 p3, uint8 ms) = br.currentRules();
        assertEq(p5, 10_000_000); assertEq(p4, 5_000_000); assertEq(p3, 1_000_000); assertEq(ms, 4);
        assertEq(br.rulesVersion(), 2);
    }

    function test_SetRulesSuitLeHook() public {
        hook.set(POOL, AUTRE); /* le hook change de createur : le droit suit */
        vm.prank(CREATEUR);
        vm.expectRevert(BlockRolls.NotCreator.selector);
        br.setRules(PRIX, PRIX, PRIX, 3);
        vm.prank(AUTRE);
        br.setRules(PRIX, PRIX, PRIX, 3);
        hook.set(POOL, address(0)); /* pool inconnue : personne */
        vm.prank(AUTRE);
        vm.expectRevert(BlockRolls.NotCreator.selector);
        br.setRules(PRIX, PRIX, PRIX, 3);
        vm.prank(address(0)); /* pas meme « l adresse zero » : un createur illisible n ouvre rien */
        vm.expectRevert(BlockRolls.NotCreator.selector);
        br.setRules(PRIX, PRIX, PRIX, 3);
    }

    function test_SettleManyReentreeRefusee() public {
        UsdcHostile hu = new UsdcHostile();
        BlockRolls b2 = _deployer(address(hu));
        hu.mint(JOUEUR, 100_000_000);
        bytes32 h = keccak256("reentree-many");
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
        uint256[] memory ids = new uint256[](1);
        ids[0] = a;
        b2.settleMany(ids);
        assertFalse(hu.reentreeReussie(), "settleMany tient le meme verrou que settle");
        assertEq(hu.erreurVue(), BlockRolls.Reentrancy.selector);
    }

    function test_SetRulesBornes() public {
        vm.startPrank(CREATEUR);
        vm.expectRevert(BlockRolls.BadRules.selector);
        br.setRules(1000_000001, PRIX, PRIX, 3);
        vm.expectRevert(BlockRolls.BadRules.selector);
        br.setRules(PRIX, 1000_000001, PRIX, 3);
        vm.expectRevert(BlockRolls.BadRules.selector);
        br.setRules(PRIX, PRIX, 1000_000001, 3);
        vm.expectRevert(BlockRolls.BadRules.selector);
        br.setRules(PRIX, PRIX, PRIX, 2);
        vm.expectRevert(BlockRolls.BadRules.selector);
        br.setRules(PRIX, PRIX, PRIX, 6);
        br.setRules(1000_000000, 1000_000000, 1000_000000, 5); /* maxima admis */
        br.setRules(0, 0, 0, 3); /* un jeu ferme : admis, rien ne sort */
        vm.stopPrank();
    }

    function test_ReglesSAppliquentAuxRollsSuivantsSeulement() public {
        bytes32 h = keccak256("regles-v");
        uint8[5] memory face = br.faceOf(h);
        _fund(100_000_000);
        uint256 avant = _roll(JOUEUR, face);
        vm.prank(CREATEUR);
        br.setRules(20_000_000, 1_000_000, 100_000, 3);
        uint256 apres = _roll(AUTRE, face); /* meme bloc, meme cible */
        (,,,, uint16 vA) = br.rolls(avant);
        (,,,, uint16 vB) = br.rolls(apres);
        assertEq(vA, 1); assertEq(vB, 2);
        _revele(avant, h);
        (, uint256 ga) = br.settle(avant);
        (, uint256 gb) = br.settle(apres);
        assertEq(ga, 5_000_000, "le roll d AVANT paie 5 (ses regles)");
        assertEq(gb, 20_000_000, "le roll d APRES paie 20 (les nouvelles)");
    }

    function test_PrixDistinctsParScore() public {
        vm.prank(CREATEUR);
        br.setRules(20_000_000, 2_000_000, 1_000_000, 3);
        bytes32 h = keccak256("distincts");
        uint8[5] memory face = br.faceOf(h);
        _fund(100_000_000);
        uint256 r5 = _roll(JOUEUR, face);
        uint256 r4 = _roll(AUTRE, _guessScore(face, 4));
        uint256 r3 = _roll(DONATEUR, _guessScore(face, 3));
        _revele(r5, h);
        (, uint256 g5) = br.settle(r5);
        (, uint256 g4) = br.settle(r4);
        (, uint256 g3) = br.settle(r3);
        assertEq(g5, 20_000_000, "5/5 : prize5");
        assertEq(g4, 2_000_000, "4/5 : prize4, pas prize5");
        assertEq(g3, 1_000_000, "3/5 : prize3");
    }

    function test_SettleableUntilEtDrawableUntil() public {
        assertEq(br.settleableUntil(1), 0, "inexistant : 0");
        uint256 id = _roll(JOUEUR, _g(0, 0, 0, 0, 0));
        assertEq(br.settleableUntil(id), 1002 + 256, "cible + 256 = le dernier bloc reglable");
        vm.roll(1002 + 256);
        vm.setBlockhash(1002, keccak256("u"));
        br.settle(id);
        assertEq(br.settleableUntil(id), 0, "regle : 0");
        uint256 perdu = _roll(JOUEUR, _g(0, 0, 0, 0, 0));
        vm.roll(block.number + 2 + 257);
        assertEq(br.settleableUntil(perdu), block.number - 1, "la valeur reste lisible meme depassee (le gardien voit qu il est trop tard)");
        /* le jour */
        _acheteursDuJour();
        assertEq(br.drawableUntil(JOUR0), 0, "pas ferme : 0");
        vm.warp(T0 + 86400);
        vm.roll(5000);
        br.closeDay(JOUR0);
        assertEq(br.drawableUntil(JOUR0), 5002 + 256);
        vm.roll(5003);
        vm.setBlockhash(5002, keccak256("d"));
        br.drawDay(JOUR0);
        assertEq(br.drawableUntil(JOUR0), 0, "tire : 0");
    }

    function test_SettleManyBornesDeLaFenetre() public {
        bytes32 h = keccak256("bornes");
        uint8[5] memory face = br.faceOf(h);
        _fund(20_000_000);
        uint256 a = _roll(JOUEUR, face);
        uint256 b = _roll(AUTRE, face);
        uint256[] memory un = new uint256[](1);
        vm.roll(1003); /* premier bloc apres la cible : reglable */
        vm.setBlockhash(1002, h);
        un[0] = a;
        assertEq(br.settleMany(un), 1, "cible + 1 : regle");
        vm.roll(1002 + 256); /* dernier bloc de la fenetre : reglable */
        vm.setBlockhash(1002, h);
        un[0] = b;
        assertEq(br.settleMany(un), 1, "cible + 256 : regle");
    }

    function test_MinScoreSAppliqueParVersion() public {
        bytes32 h = keccak256("min");
        uint8[5] memory face = br.faceOf(h);
        _fund(100_000_000);
        uint256 avant = _roll(JOUEUR, _guessScore(face, 3));
        vm.prank(CREATEUR);
        br.setRules(PRIX, PRIX, PRIX, 4);
        uint256 apres = _roll(AUTRE, _guessScore(face, 3));
        _revele(avant, h);
        (, uint256 ga) = br.settle(avant);
        (, uint256 gb) = br.settle(apres);
        assertEq(ga, 5_000_000, "3/5 gagne sous les regles d avant");
        assertEq(gb, 0, "3/5 ne gagne plus sous minScore 4");
    }

    function test_RulesVersionLisible() public {
        vm.prank(CREATEUR);
        br.setRules(1_000_000, PRIX, PRIX, 3);
        (uint64 p5,,,) = br.rules(1);
        (uint64 q5,,,) = br.rules(2);
        assertEq(p5, PRIX); assertEq(q5, 1_000_000);
        _fund(10_000_000);
        assertEq(br.payoutFor(5), 1_000_000, "payoutFor lit les regles COURANTES");
    }

    /* ============================================================ settleMany */

    function test_SettleManyRegleEtSaute() public {
        bytes32 h = keccak256("many");
        uint8[5] memory face = br.faceOf(h);
        _fund(10_000_000);
        uint256 a = _roll(JOUEUR, face);
        uint256 b = _roll(AUTRE, _guessScore(face, 4));
        _revele(a, h);
        uint256 tard = _roll(DONATEUR, face); /* cible pas encore atteinte : saute */
        br.settle(b);
        uint256[] memory ids = new uint256[](5);
        ids[0] = a; ids[1] = b; ids[2] = tard; ids[3] = 999; ids[4] = a; /* b deja regle, 999 inexistant, a en double */
        uint256 j0 = usdc.balanceOf(JOUEUR);
        vm.prank(DONATEUR);
        uint256 faits = br.settleMany(ids);
        assertEq(faits, 1, "un seul regle : a ; les autres sautes, rien ne revert");
        assertEq(usdc.balanceOf(JOUEUR) - j0, 5_000_000);
        (,, BlockRolls.Status sa,,) = br.rolls(a);
        (,, BlockRolls.Status st,,) = br.rolls(tard);
        assertEq(uint256(sa), uint256(BlockRolls.Status.Settled));
        assertEq(uint256(st), uint256(BlockRolls.Status.Pending), "le roll trop tot reste en attente");
        (, uint40 tt,,,) = br.rolls(tard);
        vm.roll(uint256(tt) + 300); /* hors fenetre, hash toujours grave : saute aussi (expire() le marquera) */
        vm.setBlockhash(tt, h);
        uint256[] memory un = new uint256[](1);
        un[0] = tard;
        assertEq(br.settleMany(un), 0);
        assertEq(br.settleMany(new uint256[](0)), 0);
    }

    function test_SettleManyMemeResultatQueSettle() public {
        bytes32 h = keccak256("meme");
        uint8[5] memory face = br.faceOf(h);
        _fund(12_000_000);
        uint256[] memory ids = new uint256[](3);
        ids[0] = _roll(JOUEUR, face);
        ids[1] = _roll(AUTRE, face);
        ids[2] = _roll(DONATEUR, face);
        _revele(ids[0], h);
        assertEq(br.pot(), 12_750_000);
        assertEq(br.settleMany(ids), 3);
        /* 5, 5, puis 2,75 (ce qui reste) */
        assertEq(br.pot(), 0);
        assertEq(usdc.balanceOf(address(br)), 0);
    }

    /* ============================================================ TIRAGE DU JOUR */

    function _acheteursDuJour() internal {
        _acheterPass(JOUEUR);
        vm.warp(T0 + 3600);
        _acheterPass(AUTRE);
        vm.warp(T0 + 7200);
        _acheterPass(DONATEUR);
    }

    function test_DayClosePasAvantLaFinDuJour() public {
        _acheteursDuJour();
        vm.warp(T0 + 86399); /* 23:59:59 */
        vm.expectRevert(BlockRolls.DayNotOver.selector);
        br.closeDay(JOUR0);
        vm.expectRevert(BlockRolls.DayNotOver.selector);
        br.closeDay(JOUR0 + 1);
        vm.warp(T0 + 86400); /* 00:00:00 du lendemain */
        vm.roll(2000);
        vm.expectEmit(true, false, false, true);
        emit DayClosed(JOUR0, 2002, 3, 15_000_000, address(this));
        br.closeDay(JOUR0);
        (uint256 dp, uint40 t, BlockRolls.DayState st) = br.dayPots(JOUR0);
        assertEq(dp, 15_000_000);
        assertEq(t, 2002);
        assertEq(uint256(st), uint256(BlockRolls.DayState.Armed));
    }

    function test_DaySansAcheteurs() public {
        vm.warp(T0 + 86400);
        vm.expectRevert(BlockRolls.NoBuyers.selector);
        br.closeDay(JOUR0);
    }

    function test_DayDrawPaieToutLePotAUnAcheteurDuJour() public {
        _acheteursDuJour();
        vm.warp(T0 + 86400 + 10);
        usdc.mint(address(0xEEE), PASS);
        _acheterPass(address(0xEEE)); /* acheteur du LENDEMAIN : pas dans le tirage de JOUR0 */
        vm.roll(2000);
        br.closeDay(JOUR0);
        vm.expectRevert(BlockRolls.TooEarly.selector);
        br.drawDay(JOUR0);
        vm.roll(2003);
        bytes32 h = bytes32(uint256(7)); /* 7 % 3 = 1 -> AUTRE */
        vm.setBlockhash(2002, h);
        uint256 a0 = usdc.balanceOf(AUTRE);
        vm.expectEmit(true, true, false, true);
        emit DayDrawn(JOUR0, AUTRE, h, 15_000_000, 3);
        vm.prank(address(0x5E77));
        (address w, uint256 amt) = br.drawDay(JOUR0);
        assertEq(w, AUTRE, "buyers[hash % n], l appelant ne touche rien");
        assertEq(amt, 15_000_000, "TOUT le pot du jour");
        assertEq(usdc.balanceOf(AUTRE), a0 + 15_000_000);
        (uint256 dp,, BlockRolls.DayState st) = br.dayPots(JOUR0);
        assertEq(dp, 0);
        assertEq(uint256(st), uint256(BlockRolls.DayState.Drawn));
        (uint256 dp1,,) = br.dayPots(JOUR0 + 1);
        assertEq(dp1, 5_000_000, "le pot du lendemain est intact");
        assertEq(usdc.balanceOf(address(br)), 5_000_000);
    }

    function test_DayGagnantParmiLesAcheteursSeulement() public {
        _acheteursDuJour();
        vm.warp(T0 + 86400);
        vm.roll(2000);
        br.closeDay(JOUR0);
        vm.roll(2003);
        address[] memory b = br.buyersOf(JOUR0);
        for (uint256 k = 0; k < 9; k++) {
            uint256 snap = vm.snapshotState();
            bytes32 h = keccak256(abi.encode("jour", k));
            vm.setBlockhash(2002, h);
            (address w,) = br.drawDay(JOUR0);
            assertEq(w, b[uint256(h) % 3], "gagnant = buyers[hash % n]");
            vm.revertToState(snap);
        }
    }

    function test_DayUnSeulTirage() public {
        _acheteursDuJour();
        vm.warp(T0 + 86400);
        vm.roll(2000);
        br.closeDay(JOUR0);
        vm.roll(2003);
        vm.setBlockhash(2002, keccak256("un"));
        br.drawDay(JOUR0);
        vm.expectRevert(BlockRolls.DayNotArmed.selector);
        br.drawDay(JOUR0);
        vm.roll(2003 + 1000);
        vm.expectRevert(BlockRolls.DayDone.selector);
        br.closeDay(JOUR0);
    }

    function test_DayDrawSansCloseRefuse() public {
        _acheteursDuJour();
        vm.warp(T0 + 86400);
        vm.expectRevert(BlockRolls.DayNotArmed.selector);
        br.drawDay(JOUR0);
    }

    function test_DayRearmSeulementApresExpiration() public {
        _acheteursDuJour();
        vm.warp(T0 + 86400);
        vm.roll(2000);
        br.closeDay(JOUR0);
        vm.roll(2003);
        vm.expectRevert(BlockRolls.StillSettleable.selector);
        br.closeDay(JOUR0); /* pendant la fenetre : impossible de changer la cible */
        vm.roll(2002 + 256);
        vm.expectRevert(BlockRolls.StillSettleable.selector);
        br.closeDay(JOUR0); /* dernier bloc de la fenetre : toujours tirable */
        vm.roll(2002 + 257);
        vm.expectRevert(BlockRolls.TooLate.selector);
        br.drawDay(JOUR0);
        br.closeDay(JOUR0); /* fenetre ratee : re-arme */
        (uint256 dp, uint40 t, BlockRolls.DayState st) = br.dayPots(JOUR0);
        assertEq(t, 2002 + 257 + 2);
        assertEq(dp, 15_000_000, "le pot du jour est intact");
        assertEq(uint256(st), uint256(BlockRolls.DayState.Armed));
        vm.roll(uint256(t) + 1);
        vm.setBlockhash(t, keccak256("re"));
        (, uint256 amt) = br.drawDay(JOUR0);
        assertEq(amt, 15_000_000);
    }

    function test_DayHashNulRefuse() public {
        _acheteursDuJour();
        vm.warp(T0 + 86400);
        vm.roll(2000);
        br.closeDay(JOUR0);
        vm.roll(2003);
        vm.setBlockhash(2002, bytes32(0));
        vm.expectRevert(BlockRolls.HashUnavailable.selector);
        br.drawDay(JOUR0);
    }

    function test_DayPotSepareDuPotDesRolls() public {
        _acheteursDuJour();
        _fund(1_000_000);
        uint256 id = _roll(JOUEUR, br.faceOf(keccak256("sep")));
        _revele(id, keccak256("sep"));
        (, uint256 p) = br.settle(id);
        assertEq(p, 1_250_000, "un gain de roll ne puise que dans le pot des ROLLS (1 + 0,25), jamais dans le jour");
        (uint256 dp,,) = br.dayPots(JOUR0);
        assertEq(dp, 15_000_000);
        assertEq(usdc.balanceOf(address(br)), 15_000_000);
    }

    /* ------------------------------------------------------------ aucun retrait */

    function test_AucunRetrait() public {
        _fund(1_000_000);
        _acheterPass(JOUEUR);
        vm.startPrank(CREATEUR);
        (bool ok,) = address(br).call(abi.encodeWithSignature("withdraw(uint256)", 1));
        assertFalse(ok);
        (ok,) = address(br).call(abi.encodeWithSignature("sweep(address)", CREATEUR));
        assertFalse(ok);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(br)), 6_000_000);
    }
}
