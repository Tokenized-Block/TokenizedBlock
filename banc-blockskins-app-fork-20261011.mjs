/* banc-blockskins-app-fork-20261011.mjs - LE CONTRAT BlockSkins REEL (deploye le 2026-10-04, 0xea6c…e77d), JOUE SUR UN FORK DE BASE PAR LES
 * APPELS DE L APP (blockskins.js) - jamais un bytecode recompose : l adresse deployee, telle qu elle est sur la chaine.
 * Phil, 2026-10-11 : « skin du block » (pas « NFT »), 1 USDC, marche avec frais de l app, enchères, visible sur le brain et le wallet.
 * JUGE SUR LES SOLDES ET LA VITRINE (skinsPage), jamais sur un evenement :
 *   1. mint (1 USDC, approbation EXACTE) : le wallet de frais +1 USDC, la skin est a l acheteur, liee au block, recette exacte ;
 *   2. vente a prix fixe en USDC : vendeur +90 %, wallet de frais +10 %, la skin change de detenteur ;
 *   3. enchere en ETH : deux offres (la 2e = offreMinimale), fin + reglement : gagnant detenteur, vendeur +90 %, frais 10 % (soldes) ;
 *   4. skinPortee rend la skin DETENUE pour ce block.
 * ⛔ BORNES : un fork (base-anvil, comptes impersonnes, aucune cle). L USDC est pris a Morpho Blue impersonne - ce transfert n existe
 *   pas sur mainnet. Jamais depuis a6cf. Ne prouve ni l interface, ni un vrai wallet.
 * Usage : base-anvil --fork-url <rpc Base> --port 8549 ; node banc-blockskins-app-fork-20261011.mjs [url du fork] */
import * as S from './blockskins.js';
import * as F from './frais-creation.js';
import { selecteur } from './encodeur.js';
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8549';
let n = 0, ko = 0, id = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpc = async (method, params) => { const r = await (await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })).json(); if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; } return r.result; };
const hex = (v) => '0x' + BigInt(v).toString(16);
const pad = (a) => a.slice(2).toLowerCase().padStart(64, '0');
const USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase();
const MORPHO = '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb'; /* detenteur d USDC sur le fork - copie d un recu verifie (borrow Morpho, 2026-10-11) */
const IB022 = '0xb200000000000000000000e4b0c5fbe9c8df579e'; /* BLOCK_SONDE de serveur-web.js */
const solde = async (jeton, qui) => (jeton === S.ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : BigInt(await rpc('eth_call', [{ to: jeton, data: '0x70a08231' + pad(qui) }, 'latest'])));
async function envoyer(de, tx) {
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data, value: tx.value || '0x0', gas: hex(1500000) }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { status: r.status, gaz: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || '0x0') }; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('no receipt ' + h);
}
let graine = 0;
const compte = async () => { const a = '0x' + ('5c1a' + (++graine).toString(16)).padEnd(40, '7'); await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, hex(10n ** 18n)]); return a; };
const donnerUsdc = async (a, m) => { await rpc('anvil_impersonateAccount', [MORPHO]); await rpc('anvil_setBalance', [MORPHO, hex(10n ** 18n)]); return envoyer(MORPHO, { to: USDC, data: '0xa9059cbb' + pad(a) + m.toString(16).padStart(64, '0') }); };

const tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · bloc ' + tete + ' · contrat ' + S.BLOCKSKINS);
ok(((await rpc('eth_getCode', [S.BLOCKSKINS, 'latest'])).length - 2) / 2 > 10000, 'le contrat DEPLOYE est present sur le fork (bloc >= 52 175 537)');
const snap = await rpc('evm_snapshot', []);
try {
  const R = { id: 'random', angle: 123, h: [45, 67, 89], cube: 211, noyau: 7, fond: 180 };
  const [alice, bob, carol, dave] = [await compte(), await compte(), await compte(), await compte()];
  /* 1. mint */
  ok((await donnerUsdc(alice, 5000000n)).status === '0x1' && await solde(USDC, alice) === 5000000n, 'alice recoit 5 USDC (fork)');
  const f0 = await solde(USDC, FRAIS), sup0 = BigInt(await rpc('eth_call', [{ to: S.BLOCKSKINS, data: '0x' + selecteur('totalSupply()') }, 'latest']));
  const sansApprob = await envoyer(alice, S.appelMint(IB022, R));
  ok(sansApprob.status === '0x0', 'TEMOIN : sans approbation, le mint reverte (rien de pris)');
  ok((await envoyer(alice, S.appelApprouver(USDC, S.SKIN_MINT_USDC))).status === '0x1' && (await envoyer(alice, S.appelMint(IB022, R))).status === '0x1', 'approbation EXACTE de 1 USDC puis mint : status 1');
  ok(await solde(USDC, FRAIS) - f0 === 1000000n && await solde(USDC, alice) === 4000000n, 'le wallet de frais a +1 USDC (solde), alice -1 USDC');
  const allowanceRestante = BigInt(await rpc('eth_call', [{ to: USDC, data: '0xdd62ed3e' + pad(alice) + pad(S.BLOCKSKINS) }, 'latest']));
  ok(allowanceRestante === 0n, 'il ne reste AUCUNE autorisation apres le mint (approbation exacte consommee)');
  let v = await S.lireSkins({ rpc });
  const t1 = sup0 + 1n, s1 = v.etat === 'LU' && v.skins.find((x) => x.tokenId === t1);
  ok(!!s1 && s1.detenteur === alice && s1.block === IB022 && JSON.stringify(s1.recette) === JSON.stringify(R) && !s1.enVente, 'vitrine : la skin #' + t1 + ' est a alice, liee a IB022, recette exacte');
  ok(S.skinPortee(v.skins, alice, IB022)?.tokenId === t1 && S.skinPortee(v.skins, bob, IB022) === null, 'skinPortee : alice la porte sur IB022, bob non');
  /* 2. vente a prix fixe en USDC */
  ok((await envoyer(alice, S.appelMettreEnVente(t1, USDC, 2000000n))).status === '0x1', 'alice met la skin en vente a 2 USDC');
  v = await S.lireSkins({ rpc });
  const enVente = v.skins.find((x) => x.tokenId === t1);
  ok(enVente.enVente && !enVente.enchere && enVente.detenteur === alice && enVente.prix === 2000000n && enVente.devise === USDC, 'vitrine : en vente, detenteur = la vendeuse, 2 USDC');
  await donnerUsdc(bob, 3000000n);
  const [fA, fB] = [await solde(USDC, FRAIS), await solde(USDC, alice)];
  ok((await envoyer(bob, S.appelApprouver(USDC, 2000000n))).status === '0x1' && (await envoyer(bob, S.appelAcheter(t1, USDC, 2000000n))).status === '0x1', 'bob approuve EXACTEMENT 2 USDC et achete');
  ok(await solde(USDC, FRAIS) - fA === 200000n && await solde(USDC, alice) - fB === 1800000n, 'partage sur les soldes : frais +0,2 USDC (10 %), alice +1,8 USDC (90 %)');
  v = await S.lireSkins({ rpc });
  ok(v.skins.find((x) => x.tokenId === t1).detenteur === bob && S.skinPortee(v.skins, bob, IB022)?.tokenId === t1 && S.skinPortee(v.skins, alice, IB022) === null, 'la skin est a bob ; elle n habille plus le block d alice');
  /* 3. enchere en ETH */
  const ouverture = 10n ** 15n;
  ok((await envoyer(bob, S.appelOuvrirEnchere(t1, S.ETH, ouverture, 86400n))).status === '0x1', 'bob ouvre une enchere en ETH (1 jour, 0,001 ETH minimum)');
  ok((await envoyer(carol, S.appelEncherir(t1, S.ETH, ouverture))).status === '0x1', 'carol offre 0,001 ETH');
  v = await S.lireSkins({ rpc });
  const min2 = S.offreMinimale(v.skins.find((x) => x.tokenId === t1));
  ok(min2 === ouverture + ouverture / 20n, 'offre minimale suivante = +5 % (' + min2 + ')');
  ok((await envoyer(dave, S.appelEncherir(t1, S.ETH, min2 - 1n))).status === '0x0', 'TEMOIN : une offre sous +5 % reverte');
  ok((await envoyer(dave, S.appelEncherir(t1, S.ETH, min2))).status === '0x1', 'dave offre exactement le minimum');
  ok((await envoyer(dave, S.appelRegler(t1))).status === '0x0', 'TEMOIN : regler avant la fin reverte');
  await rpc('evm_increaseTime', [86400 + 400]); await rpc('evm_mine', []);
  const [eF, eB] = [await solde(S.ETH, FRAIS), await solde(S.ETH, bob)];
  const reg = await envoyer(carol, S.appelRegler(t1));
  ok(reg.status === '0x1', 'apres la fin, n importe qui regle (carol)');
  const fraisEth = min2 / 10n;
  const pendFrais = BigInt(await rpc('eth_call', [{ to: S.BLOCKSKINS, data: '0x' + selecteur('pending(address,address)') + pad(S.ETH) + pad(FRAIS) }, 'latest']));
  ok((await solde(S.ETH, FRAIS)) - eF + pendFrais === fraisEth, 'frais ETH : 10 % au wallet de frais (verse ' + ((await solde(S.ETH, FRAIS)) - eF) + ' + credit ' + pendFrais + ')');
  ok((await solde(S.ETH, bob)) - eB === min2 - fraisEth, 'bob recoit 90 % de l offre gagnante (solde)');
  const pendCarol = BigInt(await rpc('eth_call', [{ to: S.BLOCKSKINS, data: '0x' + selecteur('pending(address,address)') + pad(S.ETH) + pad(carol) }, 'latest']));
  ok(pendCarol === ouverture, 'l offre depassee de carol lui est due (credit a retirer)');
  v = await S.lireSkins({ rpc });
  ok(v.skins.find((x) => x.tokenId === t1).detenteur === dave && S.skinPortee(v.skins, dave, IB022)?.tokenId === t1, 'dave detient la skin et la porte sur IB022');
} finally { await rpc('evm_revert', [snap]); }
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
