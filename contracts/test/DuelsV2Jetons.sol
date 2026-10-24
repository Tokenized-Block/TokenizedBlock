// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/* Les jetons de test de BlockDuelsV2 : les MEMES que ceux de BlockDuels.t.sol (v1), renommes (V2*) pour que les deux suites compilent
 * ensemble sans conflit de noms et que muter-duelsv2.mjs n ait pas besoin de la suite v1. */

/// @dev jeton de test : decimales au choix, transferFrom standard, un mode « rend false », une liste noire de DESTINATAIRES (comme USDC).
contract V2Jeton {
    uint8 public decimals;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public noire;
    bool public renvoieFaux;

    constructor(uint8 d) { decimals = d; }
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function setFaux(bool f) external { renvoieFaux = f; }
    function setNoire(address a, bool b) external { noire[a] = b; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }

    function transfer(address to, uint256 a) external virtual returns (bool) {
        if (renvoieFaux) return false;
        require(!noire[to], "blacklisted");
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }

    function transferFrom(address f, address to, uint256 a) external virtual returns (bool) {
        if (renvoieFaux) return false;
        require(allowance[f][msg.sender] >= a, "allowance");
        require(balanceOf[f] >= a, "balance");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// @dev jeton SANS bool (style USDT) : transfer / transferFrom ne rendent rien.
contract V2JetonSansBool {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external { allowance[msg.sender][s] = a; }
    function transfer(address to, uint256 a) external {
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
    }
    function transferFrom(address f, address to, uint256 a) external {
        require(allowance[f][msg.sender] >= a, "allowance");
        require(balanceOf[f] >= a, "balance");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a;
    }
}

/// @dev jeton a FRAIS de transfert (1 %) : le contrat recevrait moins que la mise.
contract V2JetonAFrais is V2Jeton {
    constructor() V2Jeton(18) {}
    function transferFrom(address f, address to, uint256 a) external override returns (bool) {
        require(allowance[f][msg.sender] >= a, "allowance");
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[to] += a - a / 100;
        return true;
    }
}

/// @dev jeton HOSTILE : pendant un transfert SORTANT du duel, il tente de re-entrer (appel arme a l avance) et note l erreur vue.
contract V2JetonHostile is V2Jeton {
    address public cible;
    bytes public appelArme;
    bytes4 public erreurVue;
    bool public reentreeReussie;
    uint256 public tentatives;

    constructor() V2Jeton(6) {}
    function armer(address c, bytes calldata d) external { cible = c; appelArme = d; }

    function transfer(address to, uint256 a) external override returns (bool) {
        if (cible != address(0) && msg.sender == cible && appelArme.length != 0) {
            tentatives++;
            (bool ok, bytes memory ret) = cible.call(appelArme);
            reentreeReussie = reentreeReussie || ok;
            if (!ok && ret.length >= 4) erreurVue = bytes4(ret);
        }
        require(balanceOf[msg.sender] >= a, "balance");
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
        return true;
    }
}

/// @dev le hook 7030 tel que BlockRolls le lit (seulement pour construire un BlockRolls de comparaison)
contract V2HookStub {
    function createurs(bytes32) external pure returns (address, uint256) { return (address(0x1), 0); }
}
