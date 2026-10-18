/* banc-blockskins-v3-fork-20261018.mjs — BlockSkins v3 (MINT_PRICE 10 USDC, Phil 2026-10-18 : « tous les skins a 10 dollars »), DEPLOYE SUR UN
 * FORK DE BASE DEPUIS LA DONNEE FIGEE DE L ENREGISTREMENT, contre le VRAI USDC.
 *
 * CE QUE LE BANC FAIT (juge sur les SOLDES et les status des recus, jamais sur un evenement) :
 *   1. deploie `creation` de blockskins-deploiement.js (octet pour octet : ce que Phil signera) depuis un compte impersonne ; relit
 *      MINT_PRICE() = mintPriceUsdc de l enregistrement (10 000 000), USDC(), FEE_WALLET(), owner() ;
 *   2. rejoue noter() (contracts/noter-deploiement-blockskins.mjs) sur la VRAIE transaction et le VRAI recu du fork : ok ;
 *   3. mint avec du vrai USDC (pris a un detenteur impersonne) : approbation de 9,999999 USDC -> REVERT ; approbation de 10 -> mint ;
 *      le wallet des frais recoit EXACTEMENT +10 USDC, l acheteur -10, le contrat 0, l autorisation restante 0 ;
 *   4. vente a prix fixe en USDC (15) : frais +1,5, vendeur +13,5, la skin change de main ;
 *   5. enchere en ETH : ouverture, offre, surenchere +5 % (une offre sous +5 % reverte), reglement apres la fin : gagnant detenteur,
 *      frais 10 % (verses ou credites), vendeur 90 % ;
 *   6. v2 (le contrat de l app aujourd hui) est intact sur le fork : MINT_PRICE() 1 USDC, les deux coexistent.
 * ⛔ BORNES : un fork (base-anvil, comptes impersonnes, aucune cle). L USDC est pris a Morpho Blue impersonne - ce transfert n existe pas
 *   sur mainnet. Ne prouve ni un vrai wallet, ni l interface, ni le deploiement reel (que seul Phil signe).
 * Usage : (cd contracts && forge build && node preparer-deploiement-blockskins.mjs)
 *         "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://mainnet.base.org --port 9647
 *         node banc-blockskins-v3-fork-20261018.mjs [http://127.0.0.1:9647] */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as F from './frais-creation.js';
import { selecteur } from './keccak.js';
import { BLOCKSKINS_DEPLOIEMENT as DEP } from './blockskins-deploiement.js';
import { noter } from './contracts/noter-deploiement-blockskins.mjs';
import { usdcTexte } from './blockskins-actif.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9647';
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpc = async (method, params) => { const r = await (await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) })).json(); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; };
const USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase(), ETH = '0x0000000000000000000000000000000000000000';
const MORPHO = '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb'; /* detenteur d USDC sur Base (Morpho Blue), impersonne sur le fork seulement */
const BLOC = '0xb200000000000000000000e4b0c5fbe9c8df579e';
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const lire = async (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const lireU = async (to, sig, args = '') => BigInt(await lire(to, sig, args));
const lireA = async (to, sig) => '0x' + String(await lire(to, sig)).slice(-40).toLowerCase();
const solde = async (jeton, qui) => (jeton === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : lireU(jeton, 'balanceOf(address)', adrMot(qui)));
async function envoyer(de, tx) {
  const h = await rpc('eth_sendTransaction', [{ from: de, ...(tx.to ? { to: tx.to } : {}), data: tx.data || '0x', value: tx.value || '0x0', gas: hex(tx.gas || 3000000) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { h, recu: r, status: r.status, contrat: r.contractAddress ? r.contractAddress.toLowerCase() : null, gasUsed: BigInt(r.gasUsed) }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
const compte = async (a) => { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, hex(10n ** 18n)]); return a; };
const donnerUsdc = async (a, m) => { await compte(MORPHO); return envoyer(MORPHO, { to: USDC, data: selecteur('transfer(address,uint256)') + adrMot(a) + mot(m) }); };
const approuver = (qui, jeton, pour, montant) => envoyer(qui, { to: jeton, data: selecteur('approve(address,uint256)') + adrMot(pour) + mot(montant) });

const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete + ' · enregistrement v' + DEP.version + ' mintPriceUsdc ' + DEP.mintPriceUsdc);
if (!ok(chaine === 8453, 'le fork est Base (sinon ce banc ne prouve rien)')) process.exit(1);
const P = BigInt(DEP.mintPriceUsdc);
ok(DEP.version === 3 && P === 10000000n && DEP.adresse === null, 'l enregistrement est v3, 10 USDC, pas encore deploye sur la chaine (adresse null)');
ok(crypto.createHash('sha256').update(Buffer.from(DEP.creation.slice(2), 'hex')).digest('hex') === DEP.sha256Creation && (DEP.creation.length - 2) / 2 === DEP.octetsCreation,
  'la donnee de creation a l empreinte qu elle annonce (' + DEP.sha256Creation.slice(0, 12) + '…, ' + DEP.octetsCreation + ' octets)');
const cheminArt = path.join(ICI, 'contracts/out/BlockSkins.sol/BlockSkins.json');
if (fs.existsSync(cheminArt)) {
  const art = JSON.parse(fs.readFileSync(cheminArt, 'utf8'));
  ok(DEP.creation === String(art.bytecode.object) + adrMot(USDC) + adrMot(FRAIS), 'la donnee figee = le bytecode compile + (USDC, wallet des frais) du depot');
} else console.log('--  artefact forge absent : la donnee figee est jugee par son empreinte seulement');

const instantane = await rpc('evm_snapshot', []);
try {
  const phil = await compte('0x00000000000000000000000000000000de9107e4'), alice = await compte('0x' + 'a11ce'.padEnd(40, '1')), bob = await compte('0x' + 'b0b'.padEnd(40, '2')),
    carol = await compte('0x' + 'ca401'.padEnd(40, '3')), dave = await compte('0x' + 'da7e'.padEnd(40, '4'));
  /* ── 1. deploiement de la donnee figee ── */
  console.log('— 1. deploiement');
  const d = await envoyer(phil, { data: DEP.creation, gas: 6000000 });
  if (!ok(d.status === '0x1' && /^0x[0-9a-f]{40}$/.test(String(d.contrat)), 'le contrat se deploie depuis la donnee figee (gaz ' + d.gasUsed + ')')) throw new Error('deploy failed');
  const S = d.contrat;
  const taille = ((await rpc('eth_getCode', [S, 'latest'])).length - 2) / 2;
  ok(taille > 0 && taille <= 24576, 'code deploye : ' + taille + ' octets (limite EIP-170 : 24 576)');
  const prixLu = await lireU(S, 'MINT_PRICE()');
  ok(prixLu === P, 'MINT_PRICE() relu sur le contrat = ' + prixLu + ' = mintPriceUsdc de l enregistrement (' + usdcTexte(prixLu) + ' USDC)');
  ok(await lireA(S, 'USDC()') === USDC && await lireA(S, 'FEE_WALLET()') === FRAIS && await lireA(S, 'owner()') === phil, 'USDC(), FEE_WALLET() du depot ; owner = le deployeur');
  ok(await lireU(S, 'SALE_FEE_BPS()') === 1000n && await lireU(S, 'MAX_AUCTION()') === 604800n && await lireU(S, 'MIN_RAISE_BPS()') === 500n, 'les autres regles n ont pas bouge : 10 %, 7 jours, +5 %');
  /* ── 2. noter() sur la vraie tx et le vrai recu du fork ── */
  console.log('— 2. noter() sur le recu reel du fork');
  const tx = await rpc('eth_getTransactionByHash', [d.h]);
  const relectures = { 'USDC()': await lireA(S, 'USDC()'), 'FEE_WALLET()': await lireA(S, 'FEE_WALLET()'), 'MINT_PRICE()': prixLu.toString(), 'owner()': await lireA(S, 'owner()') };
  const texte = fs.readFileSync(path.join(ICI, 'blockskins-deploiement.js'), 'utf8');
  const v = noter({ fiche: DEP, texte, tx, recu: d.recu, relectures });
  ok(v.ok === true && v.adresse === S && v.texte.includes("  adresse: '" + S + "',") && v.texte.includes('MINT_PRICE() ' + P + ' read back'), 'noter() accepte la tx reelle du fork (input = creation, status 1, relectures = fiche) et ecrirait ' + S + (v.ok ? '' : ' — ' + v.pourquoi));
  const vFaux = noter({ fiche: DEP, texte, tx, recu: d.recu, relectures: { ...relectures, 'MINT_PRICE()': '1000000' } });
  ok(vFaux.ok === false && /MINT_PRICE\(\) read 1000000/.test(vFaux.pourquoi), 'temoin : si la chaine disait 1 USDC, noter() refuserait (' + vFaux.pourquoi + ')');
  /* ── 3. mint a 10 USDC, vrai USDC ── */
  console.log('— 3. mint');
  ok((await donnerUsdc(alice, 25n * 10n ** 6n)).status === '0x1' && await solde(USDC, alice) === 25n * 10n ** 6n, 'alice recoit 25 USDC (fork)');
  const teintes = [210, 267, 263, 92, 120, 300, 200];
  const recette = BigInt(await lire(S, 'packRecipe(uint16[7])', teintes.map(mot).join('')));
  const mint = (qui) => envoyer(qui, { to: S, data: selecteur('mint(address,uint64)') + adrMot(BLOC) + mot(recette), gas: 400000 });
  let fA = await solde(USDC, FRAIS), aA = await solde(USDC, alice);
  ok((await approuver(alice, USDC, S, P - 1n)).status === '0x1' && (await mint(alice)).status === '0x0' && await lireU(S, 'totalSupply()') === 0n && await solde(USDC, FRAIS) === fA,
    'temoin : avec 9,999999 USDC d autorisation, le mint REVERTE — rien n est pris, rien n est cree');
  ok((await approuver(alice, USDC, S, P)).status === '0x1' && (await mint(alice)).status === '0x1', 'approbation EXACTE de 10 USDC puis mint : status 1');
  ok(await solde(USDC, FRAIS) - fA === P && aA - await solde(USDC, alice) === P && await solde(USDC, S) === 0n,
    'le wallet des frais recoit EXACTEMENT +10 USDC (' + (await solde(USDC, FRAIS) - fA) + ' unites), alice -10, le contrat ne garde rien');
  ok(await lireU(USDC, 'allowance(address,address)', adrMot(alice) + adrMot(S)) === 0n, 'il ne reste AUCUNE autorisation apres le mint');
  ok(('0x' + (await lire(S, 'ownerOf(uint256)', mot(1))).slice(-40)) === alice, 'la skin n°1 est a alice');
  const sansSou = await compte('0x' + '5a55'.padEnd(40, '5'));
  ok((await mint(sansSou)).status === '0x0' && await lireU(S, 'totalSupply()') === 1n, 'temoin : sans USDC ni autorisation, le mint REVERTE');
  /* ── 4. vente a prix fixe en USDC ── */
  console.log('— 4. vente a prix fixe (USDC)');
  const PRIX = 15n * 10n ** 6n;
  ok((await envoyer(alice, { to: S, data: selecteur('list(uint256,address,uint256)') + mot(1) + adrMot(USDC) + mot(PRIX) })).status === '0x1', 'alice met la skin en vente a 15 USDC');
  await donnerUsdc(bob, 30n * 10n ** 6n);
  fA = await solde(USDC, FRAIS); aA = await solde(USDC, alice);
  ok((await approuver(bob, USDC, S, PRIX)).status === '0x1' && (await envoyer(bob, { to: S, data: selecteur('buy(uint256)') + mot(1) })).status === '0x1', 'bob approuve exactement 15 USDC et achete');
  ok(await solde(USDC, FRAIS) - fA === PRIX / 10n && await solde(USDC, alice) - aA === PRIX - PRIX / 10n && ('0x' + (await lire(S, 'ownerOf(uint256)', mot(1))).slice(-40)) === bob,
    'frais +1,5 USDC (10 %), alice +13,5 USDC (90 %), la skin est a bob');
  /* ── 5. enchere en ETH ── */
  console.log('— 5. enchere (ETH)');
  const OUV = 10n ** 15n;
  ok((await envoyer(bob, { to: S, data: selecteur('startAuction(uint256,address,uint256,uint256)') + mot(1) + adrMot(ETH) + mot(OUV) + mot(3600) })).status === '0x1', 'bob ouvre une enchere en ETH (1 h, 0,001 ETH)');
  ok((await envoyer(carol, { to: S, data: selecteur('bid(uint256,uint256)') + mot(1) + mot(OUV), value: hex(OUV) })).status === '0x1', 'carol offre 0,001 ETH');
  const MIN2 = OUV + OUV / 20n;
  ok((await envoyer(dave, { to: S, data: selecteur('bid(uint256,uint256)') + mot(1) + mot(MIN2 - 1n), value: hex(MIN2 - 1n) })).status === '0x0', 'temoin : une offre sous +5 % REVERTE');
  ok((await envoyer(dave, { to: S, data: selecteur('bid(uint256,uint256)') + mot(1) + mot(MIN2), value: hex(MIN2) })).status === '0x1', 'dave offre exactement +5 %');
  ok((await envoyer(dave, { to: S, data: selecteur('settle(uint256)') + mot(1) })).status === '0x0', 'temoin : regler avant la fin REVERTE');
  await rpc('evm_increaseTime', [3601]); await rpc('evm_mine', []);
  const eF = await solde(ETH, FRAIS), eB = await solde(ETH, bob);
  ok((await envoyer(carol, { to: S, data: selecteur('settle(uint256)') + mot(1) })).status === '0x1', 'apres la fin, n importe qui regle (carol)');
  const credFrais = await lireU(S, 'pending(address,address)', adrMot(ETH) + adrMot(FRAIS));
  ok(('0x' + (await lire(S, 'ownerOf(uint256)', mot(1))).slice(-40)) === dave && (await solde(ETH, FRAIS)) - eF + credFrais === MIN2 / 10n && (await solde(ETH, bob)) - eB === MIN2 - MIN2 / 10n,
    'dave detient la skin ; frais 10 % en ETH (verse ' + ((await solde(ETH, FRAIS)) - eF) + ' + credit ' + credFrais + ') ; bob 90 %');
  ok(await lireU(S, 'pending(address,address)', adrMot(ETH) + adrMot(carol)) === OUV, 'l offre depassee de carol lui est due (retrait)');
  /* ── 6. v2 intact ── */
  console.log('— 6. v2, le contrat de l app aujourd hui');
  const V2 = DEP.precedent.adresse;
  ok(await lireU(V2, 'MINT_PRICE()') === BigInt(DEP.precedent.mintPriceUsdc) && (await lireU(V2, 'MINT_PRICE()')) === 1000000n, 'v2 (' + V2 + ') grave toujours 1 USDC = son enregistrement ; v3 (' + S + ') grave 10 : les deux coexistent, l app bascule quand v3 est note');
} catch (e) {
  ok(false, 'le banc a leve : ' + String((e && e.message) || e).slice(0, 200));
} finally {
  await rpc('evm_revert', [instantane]);
}
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
