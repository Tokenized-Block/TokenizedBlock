// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Stubs du banc anvil banc-missions-anvil-20261017.mjs (JAMAIS deployes ailleurs qu'un anvil local).
///      JetonE : un ERC-20 qui EMET ses Transfer (le verificateur reconstruit la detention a partir d'eux ; JetonS n'en emet pas).
///      CibleE : la cible d'une mission ; faire() emet Fait(msg.sender) — l'evenement que la tache exige.
contract JetonE {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; emit Transfer(address(0), to, a); }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; emit Approval(msg.sender, s, a); return true; }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; emit Transfer(msg.sender, to, a); return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) {
        allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; emit Transfer(f, to, a); return true;
    }
}

contract CibleE {
    event Fait(address indexed qui);
    function faire() external { emit Fait(msg.sender); }
}
