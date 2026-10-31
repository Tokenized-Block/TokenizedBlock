// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/TamArt.sol";
import "./TamEchantillons.sol";

/// @dev USDC-like : 6 decimals, transferFrom returns true, reverts without allowance or balance.
contract UsdcSimule {
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "ERC20: transfer amount exceeds allowance");
        require(balanceOf[from] >= amount, "ERC20: transfer amount exceeds balance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract Jeton18 {
    uint8 public constant decimals = 18;
}

contract TamArtTest is Test {
    TamArt tam;
    UsdcSimule usdc;
    address constant BENEF = address(0xBEEF);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    event Minted(uint256 indexed tokenId, address indexed minter, bytes32 indexed empreinte, bytes32 graine);

    function setUp() public {
        usdc = new UsdcSimule();
        tam = new TamArt(address(usdc), BENEF);
        usdc.mint(alice, 100e6);
        usdc.mint(bob, 100e6);
    }

    function _mint(address qui, uint256 i) internal returns (uint256 id) {
        vm.startPrank(qui);
        usdc.approve(address(tam), 5e6);
        id = tam.mint(TamEchantillons.donnees(i), TamEchantillons.graine(i), TamEchantillons.params(i));
        vm.stopPrank();
    }

    // ───────── paiement : exactement 5 USDC, tout droit au beneficiaire, le contrat reste a 0
    function test_mint_paie_exactement_5_usdc_au_beneficiaire_contrat_a_zero() public {
        for (uint256 i = 1; i <= TamEchantillons.nombre(); i++) {
            uint256 avantA = usdc.balanceOf(alice);
            uint256 avantB = usdc.balanceOf(BENEF);
            uint256 id = _mint(alice, i);
            assertEq(id, i);
            assertEq(avantA - usdc.balanceOf(alice), 5_000_000, "le minteur paie exactement 5 USDC");
            assertEq(usdc.balanceOf(BENEF) - avantB, 5_000_000, "le beneficiaire recoit exactement 5 USDC");
            assertEq(usdc.balanceOf(address(tam)), 0, "le contrat ne tient jamais d USDC");
            assertEq(address(tam).balance, 0, "ni d ETH");
            assertEq(usdc.allowance(alice, address(tam)), 0, "allowance consommee en entier");
            assertEq(tam.ownerOf(id), alice);
        }
        assertEq(tam.balanceOf(alice), 5);
        assertEq(tam.totalSupply(), 5);
        assertEq(tam.PRICE(), 5_000_000);
        assertEq(tam.beneficiaire(), BENEF);
        assertEq(tam.USDC(), address(usdc));
    }

    function test_mint_emet_Minted() public {
        vm.startPrank(alice);
        usdc.approve(address(tam), 5e6);
        vm.expectEmit(true, true, true, true, address(tam));
        emit Minted(1, alice, TamEchantillons.hashJs(1), TamEchantillons.graine(1));
        tam.mint(TamEchantillons.donnees(1), TamEchantillons.graine(1), TamEchantillons.params(1));
        vm.stopPrank();
    }

    // ───────── doublon
    function test_doublon_refuse() public {
        _mint(alice, 1);
        vm.startPrank(bob);
        usdc.approve(address(tam), 5e6);
        bytes memory d = TamEchantillons.donnees(1);
        vm.expectRevert(abi.encodeWithSelector(TamArt.Duplicate.selector, uint256(1)));
        tam.mint(d, bytes32(uint256(7)), "autre graine, autres params : memes octets");
        vm.stopPrank();
        assertEq(usdc.balanceOf(bob), 100e6, "le doublon ne coute rien");
        assertEq(tam.tokenOfHash(keccak256(d)), 1);
        // un seul octet change -> une autre oeuvre, admise
        d[d.length - 1] = d[d.length - 1] ^ 0x02;
        vm.prank(bob);
        assertEq(tam.mint(d, 0, ""), 2);
    }

    // ───────── relecture : octet pour octet, keccak = celui du JS
    function test_relecture_octet_pour_octet_et_keccak_du_js() public {
        for (uint256 i = 1; i <= TamEchantillons.nombre(); i++) {
            uint256 id = _mint(alice, i);
            bytes memory lu = tam.donnees(id);
            bytes memory attendu = TamEchantillons.donnees(i);
            assertEq(lu.length, attendu.length, "meme longueur");
            assertEq(lu, attendu, "octet pour octet");
            assertEq(keccak256(lu), TamEchantillons.hashJs(i), "keccak recalcule = keccak du moteur JS");
            assertEq(tam.empreinte(id), TamEchantillons.hashJs(i), "keccak stocke = keccak du moteur JS");
            assertEq(tam.params(id), TamEchantillons.params(i), "params relus a l identique");
            assertEq(tam.graine(id), TamEchantillons.graine(i));
            assertEq(tam.tokenOfHash(keccak256(lu)), id);
            // le pointeur SSTORE2 : 0x00 (STOP) puis les octets ; l appeler ne fait rien
            address p = tam.pointeur(id);
            assertEq(p.code.length, 1 + attendu.length + TamEchantillons.params(i).length);
            assertEq(uint8(p.code[0]), 0);
        }
    }

    // ───────── tokenURI : JSON valide, image SVG = celle que le JS construit, octet pour octet
    function test_tokenURI_json_valide_et_svg_egal_au_decodeur_js() public {
        for (uint256 i = 1; i <= TamEchantillons.nombre(); i++) {
            uint256 id = _mint(alice, i);
            uint256 g = gasleft();
            string memory uri = tam.tokenURI(id);
            emit log_named_uint(string.concat("gaz tokenURI (eth_call) echantillon ", vm.toString(i)), g - gasleft());
            bytes memory u = bytes(uri);
            bytes memory pre = "data:application/json;base64,";
            for (uint256 k = 0; k < pre.length; k++) assertEq(u[k], pre[k]);
            string memory json = string(_b64dec(_sous(u, pre.length)));
            // vm.parseJson* echoue sur un JSON invalide : c est la preuve de validite
            assertEq(vm.parseJsonString(json, ".name"), string.concat("TAM #", vm.toString(id)));
            assertEq(vm.parseJsonUint(json, ".attributes[0].value"), TamEchantillons.donnees(i).length);
            assertEq(vm.parseJsonBytes32(json, ".keccak"), TamEchantillons.hashJs(i));
            string memory image = vm.parseJsonString(json, ".image");
            bytes memory preI = "data:image/svg+xml;base64,";
            for (uint256 k = 0; k < preI.length; k++) assertEq(bytes(image)[k], preI[k]);
            bytes memory svg = _b64dec(_sous(bytes(image), preI.length));
            assertEq(svg, TamEchantillons.svgJs(i), "SVG = projection construite par le decodeur JS");
        }
    }

    function test_tokenURI_donnees_tronquees_ne_revert_pas() public {
        bytes memory d = TamEchantillons.donnees(2);
        bytes memory t = new bytes(100);
        for (uint256 k = 0; k < 100; k++) t[k] = d[k];
        vm.startPrank(alice);
        usdc.approve(address(tam), 5e6);
        uint256 id = tam.mint(t, 0, "");
        vm.stopPrank();
        bytes memory u = bytes(tam.tokenURI(id));
        assertGt(u.length, 100);
    }

    // ───────── sans allowance / sans solde / mauvais format
    function test_mint_sans_allowance_revert() public {
        bytes memory d = TamEchantillons.donnees(1);
        vm.prank(alice);
        vm.expectRevert(TamArt.TransferFailed.selector); // le revert du jeton (allowance) remonte en TransferFailed
        tam.mint(d, 0, "");
        vm.startPrank(alice);
        usdc.approve(address(tam), 5e6 - 1);
        vm.expectRevert(TamArt.TransferFailed.selector); // le revert du jeton (allowance) remonte en TransferFailed
        tam.mint(d, 0, "");
        vm.stopPrank();
        assertEq(tam.totalSupply(), 0, "rien n est minte");
        assertEq(tam.tokenOfHash(keccak256(d)), 0, "rien n est reserve");
    }

    function test_mint_sans_solde_revert() public {
        address pauvre = address(0xDEAD);
        vm.startPrank(pauvre);
        usdc.approve(address(tam), 5e6);
        vm.expectRevert(TamArt.TransferFailed.selector); // le revert du jeton (solde) remonte en TransferFailed
        tam.mint(TamEchantillons.donnees(1), 0, "");
        vm.stopPrank();
    }

    function test_format_refuse() public {
        vm.startPrank(alice);
        usdc.approve(address(tam), 5e6);
        bytes memory d = TamEchantillons.donnees(1);
        d[0] = "X";
        vm.expectRevert(TamArt.BadData.selector);
        tam.mint(d, 0, "");
        vm.expectRevert(TamArt.BadData.selector);
        tam.mint(hex"54414d01", 0, ""); // trop court
        // trop long, avec un en-tete VALIDE (sinon c est l en-tete qui refuse, pas la taille)
        bytes memory long_ = new bytes(16_385);
        bytes memory bon = TamEchantillons.donnees(1);
        for (uint256 k = 0; k < 7; k++) long_[k] = bon[k];
        vm.expectRevert(TamArt.BadData.selector);
        tam.mint(long_, 0, "");
        vm.expectRevert(TamArt.BadData.selector);
        tam.mint(bon, 0, new bytes(4_097)); // params trop longs
        // a la borne exacte : admis
        assembly {
            mstore(long_, 16384)
        }
        assertEq(tam.mint(long_, 0, new bytes(4_096)), 1);
        vm.stopPrank();
    }

    function test_constructeur_refuse() public {
        vm.expectRevert(TamArt.BadAddress.selector);
        new TamArt(address(usdc), address(0));
        vm.expectRevert(TamArt.BadAddress.selector);
        new TamArt(address(0x1234), BENEF);
        Jeton18 j = new Jeton18();
        vm.expectRevert(TamArt.BadToken.selector);
        new TamArt(address(j), BENEF);
    }

    // ───────── aucune fonction de retrait, aucun owner, pas d ETH accepte
    function test_aucune_fonction_de_retrait() public {
        _mint(alice, 1);
        string[12] memory sigs = [
            "withdraw()",
            "withdraw(address)",
            "withdraw(uint256)",
            "withdraw(address,uint256)",
            "withdrawAll()",
            "sweep(address)",
            "rescue(address,address,uint256)",
            "rescueERC20(address,uint256)",
            "owner()",
            "transferOwnership(address)",
            "setBeneficiaire(address)",
            "upgradeTo(address)"
        ];
        for (uint256 k = 0; k < sigs.length; k++) {
            (bool ok,) = address(tam).call(abi.encodeWithSignature(sigs[k], address(this), uint256(1), uint256(1)));
            assertFalse(ok, sigs[k]);
        }
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool okEth,) = address(tam).call{value: 1}("");
        assertFalse(okEth, "pas de receive/fallback");
    }

    // ───────── ERC-721
    function test_transfert_erc721() public {
        uint256 id = _mint(alice, 1);
        vm.prank(bob);
        vm.expectRevert(TamArt.NotAllowed.selector);
        tam.transferFrom(alice, bob, id);
        vm.prank(alice);
        tam.transferFrom(alice, bob, id);
        assertEq(tam.ownerOf(id), bob);
        assertEq(tam.balanceOf(alice), 0);
        assertTrue(tam.supportsInterface(0x80ac58cd));
    }

    // ───────── gaz (mesure, journalisee ; le rapport les convertit au prix Base lu en direct)
    function test_gaz_mint_et_deploiement() public {
        // deploiement : execution mesuree + 32000 (CREATE) + 21000 + calldata de creation
        bytes memory creation = abi.encodePacked(type(TamArt).creationCode, abi.encode(address(usdc), BENEF));
        uint256 g = gasleft();
        TamArt t = new TamArt(address(usdc), BENEF);
        uint256 execDeploy = g - gasleft();
        emit log_named_uint("deploy: execution mesuree (inclut CREATE 32000 + code depose)", execDeploy);
        emit log_named_uint("deploy: octets de creation", creation.length);
        emit log_named_uint("deploy: octets de runtime", address(t).code.length);
        emit log_named_uint("deploy: total estime (= exec + 21000 + calldata)", execDeploy + 21000 + _calldata(creation));
        uint256[2] memory lesquels = [uint256(1), uint256(2)];
        for (uint256 k = 0; k < 2; k++) {
            uint256 i = lesquels[k];
            vm.prank(alice);
            usdc.approve(address(t), 5e6);
            bytes memory d = TamEchantillons.donnees(i);
            bytes memory p = TamEchantillons.params(i);
            bytes memory cd = abi.encodeCall(TamArt.mint, (d, TamEchantillons.graine(i), p));
            vm.prank(alice);
            g = gasleft();
            t.mint(d, TamEchantillons.graine(i), p);
            uint256 exec = g - gasleft();
            emit log_named_uint(string.concat("mint echantillon ", vm.toString(i), ": octets data"), d.length);
            emit log_named_uint(string.concat("mint echantillon ", vm.toString(i), ": octets params"), p.length);
            emit log_named_uint(string.concat("mint echantillon ", vm.toString(i), ": octets calldata"), cd.length);
            emit log_named_uint(string.concat("mint echantillon ", vm.toString(i), ": execution mesuree"), exec);
            emit log_named_uint(string.concat("mint echantillon ", vm.toString(i), ": total estime (+21000 +calldata)"), exec + 21000 + _calldata(cd));
        }
    }

    // ───────── outils
    function _calldata(bytes memory b) internal pure returns (uint256 c) {
        for (uint256 i = 0; i < b.length; i++) c += b[i] == 0 ? 4 : 16;
    }

    function _sous(bytes memory b, uint256 debut) internal pure returns (bytes memory r) {
        r = new bytes(b.length - debut);
        for (uint256 i = 0; i < r.length; i++) r[i] = b[debut + i];
    }

    function _b64v(uint8 c) internal pure returns (uint256) {
        if (c >= 65 && c <= 90) return c - 65;
        if (c >= 97 && c <= 122) return c - 71;
        if (c >= 48 && c <= 57) return c + 4;
        if (c == 43) return 62;
        if (c == 47) return 63;
        revert("base64 invalide");
    }

    function _b64dec(bytes memory s) internal pure returns (bytes memory out) {
        require(s.length % 4 == 0, "base64 longueur");
        uint256 pad = s.length == 0 ? 0 : (s[s.length - 1] == "=" ? (s[s.length - 2] == "=" ? 2 : 1) : 0);
        out = new bytes(s.length / 4 * 3 - pad);
        uint256 j;
        for (uint256 i = 0; i < s.length; i += 4) {
            uint256 t = _b64v(uint8(s[i])) << 18 | _b64v(uint8(s[i + 1])) << 12;
            if (s[i + 2] != "=") t |= _b64v(uint8(s[i + 2])) << 6;
            if (s[i + 3] != "=") t |= _b64v(uint8(s[i + 3]));
            if (j < out.length) out[j++] = bytes1(uint8(t >> 16));
            if (j < out.length) out[j++] = bytes1(uint8(t >> 8));
            if (j < out.length) out[j++] = bytes1(uint8(t));
        }
    }
}
