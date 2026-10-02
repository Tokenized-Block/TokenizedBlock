/* test-multipool.mjs — le routeur multi-pools, HORS RESEAU : graphe, placement du frais, octets.
 *   node test-multipool.mjs
 * ⛔ Chaque propriete a son temoin NEGATIF : un test qui n a jamais dit non ne prouve rien. */
import { cheminsCandidats, placerFrais, construireRoute, segments, cheminV3, rangFrais, fraisSur,
  ADRESSES, FRAIS_BPS, CMD, coterChemin, noeud, CONTRACT_BALANCE, devisesFraisAdmises } from './multipool.js';
import { encodeQuote } from './pool.js';

let n = 0, ko = 0;
const ok = (nom, c, vu) => { n += 1; if (c) console.log('  ok  ' + nom); else { ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '  vu: ' + vu)); } };

const { ETH, USDC, WETH, FEE_WALLET } = ADRESSES;
const AAPL = '0xb200000000000000000000c2e324d24d7eecd1fb';
const HIMS = '0xb20000000000000000000043a599976181bcf336';
const BLUEPILL = '0xb2000000000000000000006745009423d9a49401';
const TBGAS = '0xb200000000000000000000df3ffcd9be89b3843c';
const TOSHI = '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4';
const ADMISES = new Set([AAPL, HIMS, ADRESSES.OUSD]);
const USER = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';

const v4 = (c0, c1, fee = 3000, ts = 60, hooks = ETH, liqUsd = 1e5) => ({ venue: 'uniswap-v4', cle: { currency0: c0, currency1: c1, fee, tickSpacing: ts, hooks }, liqUsd });
const cl = (t0, t1, ts = 10, liqUsd = 1e6) => ({ venue: 'aerodrome-cl', token0: t0, token1: t1, tickSpacing: ts, factory: 3, liqUsd });
const v3 = (t0, t1, fee = 10000, liqUsd = 1e6) => ({ venue: 'uniswap-v3', token0: t0, token1: t1, fee, liqUsd });
const G = [
  v4(ETH, USDC, 500, 10), cl(USDC, WETH, 100), cl(USDC, AAPL), v4(USDC, HIMS, 3000, 60),
  v4(HIMS, BLUEPILL, 0, 200, '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc'), v3(WETH, TOSHI),
  v4(ETH, TBGAS, 0, 200, '0x5926abdabf5d0006ee960a8270f3e124e5a764cc'),
];

console.log('=== 1. graphe et chemins ===');
const c1 = cheminsCandidats(G, BLUEPILL, AAPL, { sautsMax: 3 });
ok('1a. BLUEPILL -> AAPLc trouve (via HIMSc puis USDC)', c1.some((c) => c.length === 3 && c[0].vers === HIMS && c[1].vers === USDC), c1.length);
ok('1b. WETH et ETH sont UN noeud : ETH -> TOSHI passe par la pool WETH/TOSHI', cheminsCandidats(G, ETH, TOSHI).some((c) => c.length === 1));
ok('1c. temoin : aucun chemin vers une adresse sans arete', cheminsCandidats(G, ETH, '0x' + '12'.repeat(20)).length === 0);
ok('1d. pas de chemin de A vers A', cheminsCandidats(G, USDC, USDC).length === 0);

console.log('=== 2. placement du frais : UNE fois, jamais en block ===');
const pTbgasEth = placerFrais([{ de: TBGAS, vers: ETH, e: G[6] }], ADMISES);
ok('2a. vendre TBGAS -> ETH : frais en ETH (noeud 1, la sortie), pas en TBGAS', pTbgasEth.etat === 'OK' && pTbgasEth.devise === ETH && pTbgasEth.indice === 1, JSON.stringify(pTbgasEth));
const chBA = c1.find((c) => c.length === 3);
const pBA = placerFrais(chBA, ADMISES);
ok('2b. BLUEPILL -> HIMSc -> USDC -> AAPLc : frais en USDC (rang 1 bat HIMSc rang 2)', pBA.devise === USDC && pBA.indice === 2, JSON.stringify(pBA));
ok('2c. ETH en entree : frais a l entree (indice 0)', placerFrais([{ de: ETH, vers: TOSHI, e: G[5] }], ADMISES).indice === 0);
ok('2d. TEMOIN : un chemin block -> block sans noeud admis est REFUSE (aucun frais en block)',
  placerFrais([{ de: BLUEPILL, vers: TBGAS, e: v4(BLUEPILL, TBGAS) }], ADMISES).etat === 'REFUSE');
ok('2e. rangFrais(TBGAS) = null, rangFrais(WETH) = 0', rangFrais(TBGAS, ADMISES) === null && rangFrais(WETH, ADMISES) === 0);
ok('2f. frais = floor(m*9/10000) : 10000 -> 9, 1111 -> 0, 1112 -> 1', fraisSur(10000n) === 9n && fraisSur(1111n) === 0n && fraisSur(1112n) === 1n);
ok('2g. le taux par defaut est 9 bps (decision 2026-10-01 22:15)', FRAIS_BPS === 9n);

console.log('=== 3. octets ===');
const base = { montant: 10n ** 18n, minSortie: 1n, destinataire: USER, deadline: 1n << 40n, admises: ADMISES };
const r = construireRoute({ ...base, chemin: chBA, fraisIndice: pBA.indice });
ok('3a. BLUEPILL -> AAPLc se construit', r.etat === 'PRET', r.pourquoi);
const pp = r.commandes.filter((c) => c === CMD.PAY_PORTION).length;
ok('3b. EXACTEMENT un PAY_PORTION', pp === 1, r.commandes.join(','));
ok('3c. sequence : TRANSFER_FROM, V4_SWAP, PAY_PORTION, V3_SWAP(CL), SWEEP', r.commandes.join(',') === '07,10,06,00,04', r.commandes.join(','));
ok('3d. a6cf est nomme dans le calldata, une seule fois', r.data.split(FEE_WALLET.slice(2)).length - 1 === 1);
ok('3e. une approbation ERC-20 du montant exact, pas de msg.value', r.approbation && r.approbation.montant === 10n ** 18n && r.value === '0x0');
const forcee = construireRoute({ ...base, chemin: chBA, fraisIndice: 0 });
ok('3f. TEMOIN NEGATIF : forcer le frais au noeud 0 (BLUEPILL, un block) est REFUSE', forcee.etat === 'REFUSE' && /not ETH, USDC/.test(forcee.pourquoi), forcee.pourquoi);
/* 3g : la regle « jamais de frais en block » est tenue sur une pool block NON facturee par son hook ; sur la pool V8 (G[6]),
 *   le hook facture la jambe lui-meme : le routeur ne preleve RIEN (section 6), donc rien non plus en TBGAS. */
const gTbNonFacture = { ...G[6], cle: { ...G[6].cle, hooks: '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc' } };
const tb = construireRoute({ ...base, chemin: [{ de: TBGAS, vers: ETH, e: gTbNonFacture }], fraisIndice: 0 });
ok('3g. TEMOIN NEGATIF : frais en TBGAS refuse', tb.etat === 'REFUSE');
const tbV8 = construireRoute({ ...base, chemin: [{ de: TBGAS, vers: ETH, e: G[6] }], fraisIndice: 0 });
ok('3g-bis. pool V8 (hook facturant) : aucun frais routeur, donc aucun en TBGAS', tbV8.etat === 'PRET' && !tbV8.commandes.includes(CMD.PAY_PORTION) && tbV8.fraisDevise === null, tbV8.commandes && tbV8.commandes.join(','));
ok('3h. a6cf comme swapper refuse', construireRoute({ ...base, destinataire: FEE_WALLET, chemin: chBA, fraisIndice: 2 }).etat === 'REFUSE');
ok('3i. minimum nul refuse', construireRoute({ ...base, minSortie: 0n, chemin: chBA, fraisIndice: 2 }).etat === 'REFUSE');
const eth = construireRoute({ ...base, chemin: [{ de: ETH, vers: TOSHI, e: G[5] }], fraisIndice: 0 });
ok('3j. ETH -> TOSHI : msg.value = montant, PAY_PORTION(ETH) PUIS WRAP_ETH PUIS swap v3', eth.value === '0x' + (10n ** 18n).toString(16) && eth.commandes.join(',') === '06,0b,00,04', eth.commandes.join(','));
ok('3k. le frais ETH est en ETH natif (mot zero) vers a6cf', eth.data.includes('0'.repeat(64) + '000000000000000000000000' + FEE_WALLET.slice(2)));
ok('3l. chemin CL : tickSpacing 10 avec le drapeau factory 3 = 0x08000a', cheminV3([{ de: USDC, vers: AAPL, e: G[2] }]) === USDC.slice(2) + '08000a' + AAPL.slice(2));
ok('3m. chemin v3 uni : fee 10000 = 0x002710', cheminV3([{ de: ETH, vers: TOSHI, e: G[5] }]) === WETH.slice(2) + '002710' + TOSHI.slice(2));
const sg = segments(chBA, 2);
ok('3n. segments coupes au noeud du frais : [v4(2 sauts), cl3]', sg.map((s) => s.type + s.sauts.length).join(',') === 'v42,cl31', JSON.stringify(sg.map((s) => s.type)));
const parts2 = construireRoute({ ...base, chemin: chBA, fraisIndice: 2, partsFrais: [{ qui: USER, bps: 9n }] });
ok('3o. TEMOIN : une part de frais dont le 1er destinataire n est pas a6cf est refusee', parts2.etat === 'REFUSE');

const tw = construireRoute({ ...base, chemin: [{ de: TOSHI, vers: ETH, e: G[5] }], fraisIndice: 1 });
ok('3p. TOSHI -> ETH (v3 rend du WETH) : UNWRAP vers le routeur PUIS PAY_PORTION(ETH natif) PUIS SWEEP(ETH)', tw.commandes.join(',') === '07,00,0c,06,04', tw.commandes.join(','));
ok('3q. a6cf n est jamais paye en WETH', !tw.data.includes(WETH.slice(2) + '000000000000000000000000' + FEE_WALLET.slice(2)));
console.log('=== 4. devis (rpc simule) ===');
const faux = async (m, [tx]) => { const amt = BigInt('0x' + tx.data.slice(-64 * 2 - 0, -64)); return '0x' + (amt * 2n).toString(16).padStart(64, '0'); };
let vus = [];
const espion = async (m, [tx]) => { vus.push(tx); return '0x' + (123n).toString(16).padStart(64, '0'); };
const q = await coterChemin({ rpc: espion, chemin: [{ de: ETH, vers: TOSHI, e: G[5] }], montant: 10000n, admises: ADMISES });
ok('4a. le premier devis porte le NET apres frais (10000 - 9 = 9991)', vus[0].data.includes((9991n).toString(16).padStart(64, '0')) && q.frais === 9n, q.frais);
const qko = await coterChemin({ rpc: async () => { throw new Error('429'); }, chemin: [{ de: ETH, vers: TOSHI, e: G[5] }], montant: 10000n, admises: ADMISES });
ok('4b. TEMOIN : une lecture ratee rend NON_MESURE, jamais 0', qko.etat === 'NON_MESURE');
const v4q = (await (async () => { vus = []; await coterChemin({ rpc: espion, chemin: [{ de: USDC, vers: HIMS, e: G[3] }], montant: 10n ** 6n, admises: ADMISES }); return vus[0]; })());
ok('4c. le devis V4 est EXACTEMENT encodeQuote de pool.js (pas une copie)', v4q.data === encodeQuote({ cle: G[3].cle, zeroForOne: true, montant: 10n ** 6n - fraisSur(10n ** 6n) }));
console.log('=== 5. devises de frais admises ===');
const adm = devisesFraisAdmises([{ adr: AAPL }, { adr: HIMS }], { blocks: [HIMS] });
ok('5a. une action du registre est admise', adm.has(AAPL));
ok('5b. OUSD est admis, PYPLc (hors registre) aussi', adm.has(ADRESSES.OUSD) && adm.has('0xb200000000000000000000450ad3abe5d4846c6e'));
ok('5c. TEMOIN : une adresse a la fois action et block est RETIREE', !adm.has(HIMS));
ok('5d. TBLOCK n est jamais admis', !adm.has('0xb20000000000000000000024c30d3fcb7931272e') && rangFrais('0xb20000000000000000000024c30d3fcb7931272e', adm) === null);
ok('5e. TOSHI et cbBTC ne sont pas des devises de frais (ni action ni B20 devise)', !adm.has(TOSHI) && !adm.has(ADRESSES.CBBTC));
/* 0,09 % = 900 / 1e6 (Raksha 23:25) : le frais au bips est IDENTIQUE au frais en ppm, au wei */
{
  const { FRAIS_PPM, BASE_PPM } = await import('./multipool.js');
  let ecart = 0; let x = 0x9e3779b97f4a7c15n;
  const ms = [0n, 1n, 111n, 112n, 999n, 1000n, 1111n, 10n ** 6n, 10n ** 17n, 123456789012345678901234567n];
  for (let i = 0; i < 2000; i += 1) { x = (x * 6364136223846793005n + 1442695040888963407n) % (1n << 64n); ms.push(x * (BigInt(i) + 1n)); }
  for (const m of ms) if (fraisSur(m) !== (m * FRAIS_PPM) / BASE_PPM) ecart += 1;
  ok('0,09 % : floor(m x 9 / 1e4) == floor(m x 900 / 1e6) sur ' + ms.length + ' montants', ecart === 0, ecart);
  ok('0,09 % : 1e8 unites USDC (100 $) -> 90000 (0,09 $)', fraisSur(10n ** 8n) === 90000n, fraisSur(10n ** 8n));
}
/* le revert du V4Quoter est NOMME : UnexpectedRevertBytes(NotEnoughLiquidity(poolId)) -> SANS_LIQUIDITE */
{
  const { nommerRevert } = await import('./multipool.js');
  const brut = 'execution reverted: custom error 0x6190b2b0: 000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000247a5ed73416ae461fa509be8739e0da8e5c4bb8de490c56068eb9f87d2e5e553b01df30cf00000000000000000000000000000000000000000000000000000000';
  const n = nommerRevert(new Error(brut));
  ok('revert nomme : NotEnoughLiquidity (vu sur fork, BLUEAI -> NVDAc)', n.liquidite === true && /NotEnoughLiquidity/.test(n.texte) && n.selecteur === '7a5ed734', n.texte);
  const m = nommerRevert(new Error('execution reverted: SPL'));
  ok('revert inconnu : texte brut, pas classe SANS_LIQUIDITE', m.liquidite === false && m.texte.includes('SPL'), m.texte);
}
/* pools pieges : un frais LP de 87,1 % (mesure : ETH/CC, ETH/BUCK, ETH/BLUEPILL) n est pas une arete */
{
  const { areteValide, cheminsCandidats: cc } = await import('./multipool.js');
  const Z = '0x0000000000000000000000000000000000000000', T = '0xb2000000000000000000006226b3d65700000000';
  const piege = { venue: 'uniswap-v4', cle: { currency0: Z, currency1: T, fee: 871435, tickSpacing: 9303, hooks: Z } };
  const tb5 = { venue: 'uniswap-v4', cle: { currency0: Z, currency1: T, fee: 50000, tickSpacing: 500, hooks: Z } };
  const dyn = { venue: 'uniswap-v4', cle: { currency0: Z, currency1: T, fee: 0x800000, tickSpacing: 60, hooks: '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc' } };
  ok('pool piege 87,1 % refusee comme arete', areteValide(piege) === false);
  ok('pool TB 5 % admise', areteValide(tb5) === true);
  ok('frais dynamique V4 (0x800000) admis', areteValide(dyn) === true);
  ok('aucun chemin ne passe par une pool piege', cc([piege], Z, T).length === 0);
}
/* ══ 6. UN SEUL FRAIS PAR JAMBE + REGLEMENT APRES LE SWAP (fondateur 2026-10-02 11:06, Zero 1) ══ */
console.log('=== 6. un seul frais par jambe, reglement apres le swap ===');
{
  const mp = await import('./multipool.js');
  const { HOOKS_FACTURANTS, routeFactureeParHook, unFraisParJambe, ensembleHooksFacturants, OPEN_DELTA } = mp;
  /* les actions V4 a l interieur d un V4_SWAP : mot(0x40) | mot(off) | longueur | codes */
  const actionsV4 = (h) => { const L = Number(BigInt('0x' + h.slice(128, 192))); return h.slice(192, 192 + 2 * L).match(/../g).join(','); };
  const V9 = '0x' + '9'.repeat(36) + '24cc'; /* un hook V9 / 24 h passe par l appelant (adresse de test) */
  const NVDA = '0xb20000000000000000000078ee7ce2fe4908108c', BLOC = '0xb2000000000000000000000000000000000b10c0';
  const jambeV9 = v4(NVDA < BLOC ? NVDA : BLOC, NVDA < BLOC ? BLOC : NVDA, 0, 200, V9);
  const adm9 = new Set([...ADMISES, NVDA]);
  const vente = [{ de: BLOC, vers: NVDA, e: jambeV9 }];
  ok('6a. V8 est dans la liste fermee des hooks facturants', HOOKS_FACTURANTS.includes('0x5926abdabf5d0006ee960a8270f3e124e5a764cc'));
  ok('6b. un hook inconnu n est PAS facturant tant que l appelant ne le nomme pas', !routeFactureeParHook(vente) && routeFactureeParHook(vente, ensembleHooksFacturants([V9])));
  /* sans le nommer : le routeur preleve (au noeud NVDAc, 9 bps) ; en le nommant : RIEN */
  const sansNom = construireRoute({ ...base, admises: adm9, chemin: vente, fraisIndice: 1 });
  const avecNom = construireRoute({ ...base, admises: adm9, chemin: vente, fraisIndice: 1, hooksFacturants: [V9] });
  ok('6c. TEMOIN : hook non nomme => 1 PAY_PORTION (la double facturation serait la)', sansNom.commandes.filter((c) => c === CMD.PAY_PORTION).length === 1, sansNom.commandes.join(','));
  ok('6d. hook facturant nomme => 0 PAY_PORTION, 0 part : seul le hook facture la jambe', avecNom.etat === 'PRET' && !avecNom.commandes.includes(CMD.PAY_PORTION) && !avecNom.commandes.includes(CMD.TRANSFER) && avecNom.fraisParHook === true, avecNom.commandes.join(','));
  ok('6e. a6cf n apparait nulle part dans le calldata du routeur (le hook paie a6cf lui-meme)', !avecNom.data.includes(FEE_WALLET.slice(2)));
  /* 0,18 % IMPOSSIBLE : toute tentative d ajouter une part routeur sur une jambe facturee est REFUSEE */
  const double = construireRoute({ ...base, admises: adm9, chemin: vente, fraisIndice: 1, hooksFacturants: [V9], partsExactes: [{ qui: USER, montant: 1n }], bpsA6cf: 7n });
  ok('6f. TEMOIN : part exacte (split) sur une jambe facturee => REFUSE (0,18 % impossible)', double.etat === 'REFUSE' && /twice/.test(double.pourquoi), double.pourquoi);
  const double2 = construireRoute({ ...base, admises: adm9, chemin: vente, fraisIndice: 1, hooksFacturants: [V9], partsFrais: [{ qui: FEE_WALLET, bps: 9n }, { qui: USER, bps: 9n }] });
  ok('6g. TEMOIN : deux parts en bips sur une jambe facturee => REFUSE', double2.etat === 'REFUSE', double2.pourquoi);
  /* la garde avant envoi : 9 bps routeur + hook facturant => NON ; route facturee sans PAY_PORTION => OUI */
  ok('6h. garde unFraisParJambe : route V9 + PAY_PORTION => false (0,18 %)', unFraisParJambe(sansNom, vente, ensembleHooksFacturants([V9])) === false);
  ok('6i. garde unFraisParJambe : route V9 sans PAY_PORTION => true ; route sans hook avec 1 PAY_PORTION => true', unFraisParJambe(avecNom, vente, ensembleHooksFacturants([V9])) && unFraisParJambe(r, chBA));
  /* le total d une jambe facturee : celui du hook SEUL. 0,10 % (700 + 300 pips) sur q = 1e8 : 100000, jamais 190000 */
  const q8 = 10n ** 8n, hookSeul = (q8 * 700n) / 1000000n + (q8 * 300n) / 1000000n;
  const routeur = avecNom.commandes.includes(CMD.PAY_PORTION) ? fraisSur(q8) : 0n;
  ok('6j. 1 NVDAc : hook 70000 + 30000 = 100000 unites, routeur 0 => total 100000 (0,10 %), pas 190000', hookSeul + routeur === 100000n, String(hookSeul + routeur));
  /* le devis : sur une route facturee, le routeur ne retient rien avant le quoter V4 (qui inclut deja le frais du hook) */
  vus = [];
  const qh = await coterChemin({ rpc: espion, chemin: vente, montant: 10n ** 18n, admises: adm9, hooksFacturants: [V9] });
  ok('6k. devis d une jambe facturee : montant brut au quoter, frais routeur 0', qh.etat === 'OK' && qh.frais === 0n && qh.fraisParHook === true && vus[0].data.includes((10n ** 18n).toString(16).padStart(64, '0')), qh.frais);
  /* REGLEMENT APRES LE SWAP : 1er segment V4 => SWAP(montant exact) ... SETTLE(OPEN_DELTA) TAKE */
  const iV = avecNom.commandes.indexOf(CMD.V4_SWAP);
  ok('6l. vente block (1er segment V4) : actions SWAP puis SETTLE puis TAKE (06,0b,0e)', actionsV4(avecNom.entrees[iV]) === '06,0b,0e', actionsV4(avecNom.entrees[iV]));
  ok('6m. le SWAP porte le montant EXACT (1e18), le SETTLE la dette (OPEN_DELTA = 0)', avecNom.entrees[iV].includes((10n ** 18n).toString(16).padStart(64, '0')) && OPEN_DELTA === 0n);
  const iR = r.commandes.indexOf(CMD.V4_SWAP);
  ok('6n. BLUEPILL -> HIMSc -> USDC (2 sauts V4 en tete) : SWAP(exact), SWAP(OPEN_DELTA), SETTLE, TAKE', actionsV4(r.entrees[iR]) === '06,06,0b,0e', actionsV4(r.entrees[iR]));
  /* frais au noeud 0 PUIS 1er segment V4 : le montant du swap = m - floor(m x 9 / 1e4) */
  const ethUsdc = construireRoute({ ...base, chemin: [{ de: ETH, vers: USDC, e: G[0] }], fraisIndice: 0 });
  const iE = ethUsdc.commandes.indexOf(CMD.V4_SWAP);
  const net = 10n ** 18n - fraisSur(10n ** 18n);
  ok('6o. ETH -> USDC frais a l entree : SWAP du NET (m - floor(m*9/1e4)) puis SETTLE', actionsV4(ethUsdc.entrees[iE]) === '06,0b,0e' && ethUsdc.entrees[iE].includes(net.toString(16).padStart(64, '0')), actionsV4(ethUsdc.entrees[iE]));
  /* TEMOIN : un segment V4 qui SUIT un segment V3 (montant inconnu) garde SETTLE(CONTRACT_BALANCE) d abord */
  const v3puisV4 = construireRoute({ ...base, chemin: [{ de: TOSHI, vers: ETH, e: G[5] }, { de: ETH, vers: USDC, e: G[0] }], fraisIndice: 1 });
  const iS = v3puisV4.commandes.lastIndexOf(CMD.V4_SWAP);
  ok('6p. TEMOIN : V4 apres V3 (montant inconnu) => SETTLE(CONTRACT_BALANCE) PUIS SWAP (ancien ordre, nomme)', actionsV4(v3puisV4.entrees[iS]) === '0b,06,0e' && v3puisV4.entrees[iS].includes(CONTRACT_BALANCE.toString(16).padStart(64, '0')), actionsV4(v3puisV4.entrees[iS]));
}
void faux; void noeud; void CONTRACT_BALANCE;
console.log('\n' + n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
