// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {TBlockFeeLocker, IPositionManager, PoolKey, Currency} from "./TBlockFeeLocker.sol";

/* ⛔⛔ CE QUE CES TESTS PROUVENT, ET CE QU ILS NE PROUVENT PAS.
 *
 *     ILS PROUVENT, A L EXECUTION : que le calldata REELLEMENT emis vers le PositionManager porte
 *     `DECREASE_LIQUIDITY` avec une liquidite de ZERO, jamais autre chose ; qu aucun depot etranger
 *     n est accepte ; qu une position ne peut pas etre reinscrite ; que le partage tombe juste, y
 *     compris pour l ETH natif.
 *
 *     ⛔ ILS NE PROUVENT PAS que le vrai PositionManager se comporte comme ce mock. Le mock rend ce
 *       qu on lui dit de rendre. La preuve que `DECREASE_LIQUIDITY(0)` ne touche pas au principal a
 *       ete faite AILLEURS et AUTREMENT : lecture de `PositionManager._decrease` a la source, ou
 *       le slippage est verifie sur `(liquidityDelta - feesAccrued)` — nul quand la liquidite
 *       retiree est nulle. Et une mesure du 2026-09-01 sur la vraie position 27264 avait deja
 *       etabli que `0x…dEaD` obtient `NotApproved`, ce qui est la raison d etre de ce contrat.
 *     ⛔ ILS NE PROUVENT PAS non plus qu il n existe aucune autre porte : ca se lit sur la SURFACE
 *       du contrat, et c est garde separement (`test-locker-surface-fermee.mjs`).
 */

contract JetonFactice {
    mapping(address => uint256) public balanceOf;
    function frapper(address a, uint256 m) external { balanceOf[a] += m; }
    function transfer(address to, uint256 m) external returns (bool) {
        require(balanceOf[msg.sender] >= m, "solde");
        balanceOf[msg.sender] -= m;
        balanceOf[to] += m;
        return true;
    }
}

/* Un PositionManager factice : il enregistre le calldata recu et verse ce qu on lui a dit de verser. */
contract PosmFactice {
    PoolKey public cle;
    bytes public dernierUnlock;
    uint256 public dernierDeadline;
    uint256 public appels;

    address public jeton0;
    address public jeton1;
    uint256 public aVerser0;
    uint256 public aVerser1;

    function definirCle(PoolKey memory k) external { cle = k; }
    function definirVersements(address j0, address j1, uint256 m0, uint256 m1) external {
        jeton0 = j0; jeton1 = j1; aVerser0 = m0; aVerser1 = m1;
    }

    function getPoolAndPositionInfo(uint256) external view returns (PoolKey memory, uint256) {
        return (cle, 0);
    }
    function getPositionLiquidity(uint256) external pure returns (uint128) { return 0; }
    function ownerOf(uint256) external view returns (address) { return address(this); }

    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable {
        dernierUnlock = unlockData;
        dernierDeadline = deadline;
        appels++;
        /* simule TAKE_PAIR : les frais atterrissent chez l appelant */
        if (aVerser0 > 0) {
            if (jeton0 == address(0)) { (bool ok,) = msg.sender.call{value: aVerser0}(""); require(ok, "eth0"); }
            else JetonFactice(jeton0).transfer(msg.sender, aVerser0);
        }
        if (aVerser1 > 0) {
            if (jeton1 == address(0)) { (bool ok,) = msg.sender.call{value: aVerser1}(""); require(ok, "eth1"); }
            else JetonFactice(jeton1).transfer(msg.sender, aVerser1);
        }
    }

    function deposer(TBlockFeeLocker locker, address createur, uint256 tokenId) external {
        locker.onERC721Received(address(this), createur, tokenId, "");
    }

    receive() external payable {}
}

contract TBlockFeeLockerTest is Test {
    TBlockFeeLocker locker;
    PosmFactice posm;
    JetonFactice jetonA;
    address constant FEE_WALLET = address(0xFEE);
    address constant CREATEUR = address(0xC0FFEE);
    uint256 constant PART_CREATEUR = 300_000; // 30 %

    function setUp() public {
        posm = new PosmFactice();
        jetonA = new JetonFactice();
        locker = new TBlockFeeLocker(IPositionManager(address(posm)), FEE_WALLET, PART_CREATEUR);
        posm.definirCle(PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(address(jetonA)),
            fee: 10_000, tickSpacing: 200, hooks: address(0)
        }));
    }

    /* ⛔⛔ LA PREUVE CENTRALE : la liquidite emise est ZERO, lue dans le calldata REELLEMENT envoye. */
    function test_laLiquiditeEmiseEstZero() public {
        posm.deposer(locker, CREATEUR, 42);
        locker.collect(42);

        (bytes memory actions, bytes[] memory params) =
            abi.decode(posm.dernierUnlock(), (bytes, bytes[]));

        assertEq(actions, hex"0111", "les actions ne sont plus DECREASE_LIQUIDITY puis TAKE_PAIR");
        (uint256 id, uint256 liquidite, uint128 min0, uint128 min1,) =
            abi.decode(params[0], (uint256, uint256, uint128, uint128, bytes));
        assertEq(id, 42, "mauvais tokenId");
        /* ⛔ SI CE ZERO DEVENAIT NON NUL, LE PRINCIPAL SORTIRAIT. C est la seule ligne qui separe
         *   « les frais sortent » de « la liquidite sort ». */
        assertEq(liquidite, 0, "la liquidite retiree n est plus zero : le principal pourrait sortir");
        assertEq(min0, 0, "min0 devrait etre 0 : il n y a pas de principal a proteger a liquidite nulle");
        assertEq(min1, 0, "min1 devrait etre 0 : idem");
    }

    /* ⛔ LE DESTINATAIRE DU TAKE_PAIR EST LE LOCKER : le partage ne peut pas se faire dans l action. */
    function test_leTakeVaAuLockerPuisSePartage() public {
        posm.deposer(locker, CREATEUR, 7);
        locker.collect(7);
        (, bytes[] memory params) = abi.decode(posm.dernierUnlock(), (bytes, bytes[]));
        (,, address destinataire) = abi.decode(params[1], (Currency, Currency, address));
        assertEq(destinataire, address(locker), "le TAKE_PAIR ne vient plus au locker");
    }

    /* ⛔ SEUL LE POSITION MANAGER DEPOSE. Sinon n importe qui inscrit un tokenId et s attribue une part. */
    function test_unDepotEtrangerEstRefuse() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(TBlockFeeLocker.NotThePositionManager.selector);
        locker.onERC721Received(address(0xBAD), CREATEUR, 1, "");
    }

    /* ⛔ ON N ECRASE JAMAIS UN CREATEUR : un second depot changerait le destinataire. */
    function test_uneRepriseDeDepotEstRefusee() public {
        posm.deposer(locker, CREATEUR, 5);
        vm.expectRevert(TBlockFeeLocker.AlreadyKnown.selector);
        posm.deposer(locker, address(0xDEAD), 5);
        assertEq(locker.creatorOf(5), CREATEUR, "le createur a change");
    }

    function test_collecteSurPositionInconnueRefusee() public {
        vm.expectRevert(TBlockFeeLocker.UnknownPosition.selector);
        locker.collect(999);
    }

    /* ⛔ LE PARTAGE TOMBE JUSTE, ET LE RESTE VA AU WALLET — jamais l inverse par arrondi. */
    function test_lePartageTombeJuste() public {
        posm.deposer(locker, CREATEUR, 9);
        jetonA.frapper(address(posm), 1000);
        vm.deal(address(posm), 10 ether);
        posm.definirVersements(address(0), address(jetonA), 1 ether, 1000);

        locker.collect(9);

        assertEq(CREATEUR.balance, 0.3 ether, "part creatrice en ETH fausse");
        assertEq(FEE_WALLET.balance, 0.7 ether, "part du wallet en ETH fausse");
        assertEq(jetonA.balanceOf(CREATEUR), 300, "part creatrice en jeton fausse");
        assertEq(jetonA.balanceOf(FEE_WALLET), 700, "part du wallet en jeton fausse");
    }

    /* ⛔ UNE DEVISE SANS FRAIS NE BLOQUE RIEN : pas de transfert, pas de revert. */
    function test_zeroFraisNeBloquePas() public {
        posm.deposer(locker, CREATEUR, 11);
        posm.definirVersements(address(0), address(jetonA), 0, 0);
        locker.collect(11);
        assertEq(FEE_WALLET.balance, 0, "rien ne devait sortir");
    }

    /* ⛔ UNE PART DE CREATEUR AU-DESSUS DE 100 % EST REFUSEE AU DEPLOIEMENT : sinon la soustraction
     *   `solde - partCreateur` deborderait par en dessous. */
    function test_partAberranteRefuseeAuDeploiement() public {
        vm.expectRevert(TBlockFeeLocker.ShareTooHigh.selector);
        new TBlockFeeLocker(IPositionManager(address(posm)), FEE_WALLET, 1_000_001);
    }
}
