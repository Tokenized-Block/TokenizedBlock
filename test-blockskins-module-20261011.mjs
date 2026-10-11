/* test-blockskins-module-20261011.mjs - blockskins.js : l app et le contrat BlockSkins DEPLOYE (skin du block, decision de Phil le 2026-10-11).
 * AFFIRME (EXECUTE) : la recette de l app -> 7 teintes dans l ordre du contrat (tour, anneau 1-3, aretes, noyau, fond), pack/unpack
 *   aller-retour, refus hors 0..359 ; les appels portent le bon selecteur, l adresse DEPLOYEE, la valeur ETH seulement pour l ETH ;
 *   approbation EXACTE (jamais illimitee) ; enchere > 7 jours refusee ; offre minimale = +5 % ET strictement au-dessus ; partage 90/10 ;
 *   decodage d une vitrine skinsPage (11 mots par skin) ; skinPortee = la derniere skin DETENUE pour CE block.
 * NE PROUVE PAS : l accord avec le contrat reel (sonde eth_call packRecipe + banc fork), ni un vrai wallet. */
import { strict as assert } from 'node:assert';
import * as S from './blockskins.js';
import { selecteur } from './encodeur.js';
import { BLOCKSKINS_DEPLOIEMENT } from './blockskins-deploiement.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const R = { id: 'random', angle: 10, h: [20, 30, 359], cube: 0, noyau: 200, fond: 300 };
vu(S.BLOCKSKINS === BLOCKSKINS_DEPLOIEMENT.adresse.toLowerCase(), 'l adresse n est pas celle du contrat deploye');
/* Phil, 2026-10-11 : « v2 avant tout mint ». La porte suit l ENREGISTREMENT de deploiement (genere), jamais un drapeau a la main :
 *   ouverte si et seulement si imageDansLeWallet === true ; le v1 (0xea6c…, tokenURI sans image) la garde FERMEE. */
vu(S.SKIN_MINT_OUVERT === (BLOCKSKINS_DEPLOIEMENT.imageDansLeWallet === true), 'la porte du mint ne suit pas l enregistrement de deploiement');
vu(BLOCKSKINS_DEPLOIEMENT.adresse.toLowerCase() !== '0xea6ccb19714504ae3286e82febbe627f9d0ce77d' || S.SKIN_MINT_OUVERT === false, 'le mint est OUVERT sur le contrat v1 qui ne montre pas la skin dans un wallet');
vu(JSON.stringify(S.recetteVersTeintes(R)) === '[10,20,30,359,0,200,300]', 'ordre des teintes faux');
const p = S.packRecette(R);
vu(p === (10n | 20n << 9n | 30n << 18n | 359n << 27n | 0n << 36n | 200n << 45n | 300n << 54n) && (p >> 63n) === 0n, 'pack faux : ' + p);
vu(JSON.stringify(S.unpackRecette(p)) === JSON.stringify(R), 'aller-retour pack/unpack faux');
for (const mauvais of [{ ...R, angle: 360 }, { ...R, h: [1, 2] }, { ...R, fond: -1 }, { ...R, id: 'gold' }, null]) {
  let leve = false; try { S.packRecette(mauvais); } catch (_) { leve = true; }
  vu(leve, 'recette invalide acceptee : ' + JSON.stringify(mauvais));
}
const B = '0xb200000000000000000000e4b0c5fbe9c8df579e', USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const m = S.appelMint(B, R);
vu(m.to === S.BLOCKSKINS && m.data.startsWith('0x' + selecteur('mint(address,uint64)')) && m.data.slice(10, 74).endsWith(B.slice(2)) && BigInt('0x' + m.data.slice(74)) === p && m.value === '0x0', 'mint mal encode');
const a = S.appelApprouver(USDC, S.SKIN_MINT_USDC);
vu(a.to === USDC && a.data.startsWith('0x095ea7b3') && a.data.slice(10, 74).endsWith(S.BLOCKSKINS.slice(2)) && BigInt('0x' + a.data.slice(74)) === 1000000n, 'approbation pas exacte');
let leve = false; try { S.appelApprouver(USDC, 0n); } catch (_) { leve = true; } vu(leve, 'approbation de 0 acceptee');
/* le nom de chaque etape S AFFICHE dans la carte de signature (« Step 2 of 2: ... ») : jamais « NFT » (Phil, 2026-10-11).
 *   ROUGE sur 3693e6f : 'Mint this skin as your NFT — 1 USDC to TokenizedBlock'. */
const etapes = [m, a, S.appelMettreEnVente(7n, USDC, 2000000n), S.appelRetirer(7n), S.appelAcheter(7n, USDC, 2000000n), S.appelOuvrirEnchere(7n, USDC, 1000000n, 3600n),
  S.appelEncherir(7n, USDC, 9n), S.appelRegler(7n), S.appelRetirerCredit(USDC)];
vu(etapes.every((x) => typeof x.nom === 'string' && x.nom.length > 0 && !/\bNFTs?\b/i.test(x.nom)), 'une etape affichee dit « NFT » ou n a pas de nom : ' + etapes.map((x) => x.nom).filter((t) => !t || /\bNFTs?\b/i.test(t)).join(' | '));
vu(S.appelAcheter(7n, S.ETH, 5n * 10n ** 15n).value === '0x' + (5n * 10n ** 15n).toString(16) && S.appelAcheter(7n, USDC, 2000000n).value === '0x0', 'valeur ETH / jeton fausse a l achat');
vu(S.appelEncherir(7n, S.ETH, 9n).value === '0x9' && S.appelEncherir(7n, USDC, 9n).value === '0x0', 'valeur ETH / jeton fausse a l enchere');
leve = false; try { S.appelOuvrirEnchere(7n, USDC, 1000000n, 604801n); } catch (_) { leve = true; } vu(leve, 'enchere de plus de 7 jours acceptee');
vu(S.appelOuvrirEnchere(7n, USDC, 1000000n, 604800n).data.startsWith('0x' + selecteur('startAuction(uint256,address,uint256,uint256)')), 'startAuction mal encode');
/* 2026-10-11 : le test passait en lisant le MEME mauvais champ que le module (`enchere`) - le banc fork l a attrape (minimum 2 wei).
 *   Il lit desormais les objets que rend decoderPage (`offre`, et `enchere` = booleen), comme l app. */
vu(S.offreMinimale({ prix: 100n, offre: 0n, enchere: true }) === 100n && S.offreMinimale({ prix: 100n, offre: 1000n, enchere: true }) === 1050n
  && S.offreMinimale({ prix: 1n, offre: 10n, enchere: true }) === 11n, 'offre minimale fausse (prix sans offre, +5 %, strictement au-dessus)');
vu(S.partage(1000000n).frais === 100000n && S.partage(1000000n).vendeur === 900000n && S.partage(9n).frais === 0n, 'partage 90/10 faux');
/* une vitrine de 2 skins (11 mots chacune), telle que la rend skinsPage */
const w = (x) => BigInt(x).toString(16).padStart(64, '0'), aw = (x) => x.slice(2).padStart(64, '0');
const MOI = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b', AUTRE = '0x' + '5'.repeat(40);
const skin = (id, det, blk, rec, vente, ench, dev, prix, fin, enc, offre) => [w(id), aw(det), aw(blk), w(rec), w(vente), w(ench), aw(dev), w(prix), w(fin), aw(enc), w(offre)].join('');
const page = '0x' + w(32) + w(2) + skin(1, MOI, B, p, 0, 0, S.ETH, 0, 0, S.ETH, 0) + skin(2, AUTRE, B, p, 1, 1, USDC, 3000000, 1800000000, MOI, 3150000);
const d = S.decoderPage(page);
vu(d.length === 2 && d[0].tokenId === 1n && d[0].detenteur === MOI && d[0].block === B && JSON.stringify(d[0].recette) === JSON.stringify(R) && !d[0].enVente, 'skin 1 mal decodee');
vu(d[1].enVente && d[1].enchere && d[1].devise === USDC && d[1].prix === 3000000n && d[1].fin === 1800000000 && d[1].encherisseur === MOI && d[1].offre === 3150000n, 'skin 2 mal decodee');
vu(S.offreMinimale(d[1]) === 3307500n && S.offreMinimale(d[0]) === 0n, 'offreMinimale sur une skin DECODEE (3 150 000 + 5 %) : ' + S.offreMinimale(d[1]));
leve = false; try { S.decoderPage('0x' + w(32) + w(3) + skin(1, MOI, B, p, 0, 0, S.ETH, 0, 0, S.ETH, 0)); } catch (_) { leve = true; } vu(leve, 'une vitrine tronquee est acceptee');
vu(S.skinPortee(d, MOI, B).tokenId === 1n && S.skinPortee(d, MOI, AUTRE) === null && S.skinsDe(d, AUTRE).length === 1, 'skin portee / skins d un compte faux');
/* lireSkins : une lecture ratee n est JAMAIS une vitrine vide */
const r = await S.lireSkins({ rpc: async () => { throw new Error('429'); } });
vu(r.etat === 'NON_LU' && !Array.isArray(r.skins), 'une lecture ratee rend une liste vide');
const r0 = await S.lireSkins({ rpc: async () => '0x' + w(0) });
vu(r0.etat === 'LU' && r0.total === 0 && r0.skins.length === 0, 'zero skin mintee : pas LU/vide');
console.log('ok blockskins-module - ' + n + ' assertions ; NE PROUVE PAS l accord avec le contrat reel (sonde + banc fork)');
