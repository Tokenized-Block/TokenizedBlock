/* banc-misables-fork-20261024.mjs — PAYER UN JEU EN NVDAc OU EN ETH : LE PLAN DE misables.js EXECUTE SUR UN FORK DE BASE, CONTRE LES
 * CONTRATS VIVANTS (BlockRolls de blockrolls-deploiement.js, BlockSlots de slots-deploiement.js — leurs adresses mainnet, sur le fork).
 * Usage : "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://base-rpc.publicnode.com --port 9793
 *         puis node banc-misables-fork-20261024.mjs [http://127.0.0.1:9793]
 * DEROULE (vraies transactions sur le FORK, comptes impersonnes par anvil, aucune cle, rien n est envoye a Base) :
 *   0. le noeud EST un fork (anvil_nodeInfo repond ; le mainnet rend -32601) et c est la chaine 8453 ; les deux jeux ont du code ;
 *   1. un joueur NEUF (adresse derivee du bloc), 2 ETH poses par anvil_setBalance ; 0,02 NVDAc pris a la pool NVDAc de la NOUVELLE factory
 *      (celle du Market, lue dans mesures/misables-20261024.json) — PAS a la pool ou le plan swappe : sa comptabilite reste intacte ;
 *   2. NVDAc -> 1 roll sur BlockRolls : coterMisable (devis vivant SUR LE FORK, exact-output 0,5005 USDC), planPayerEnJeton, puis les 5 appels
 *      du plan en 5 tx du MEME compte dans UN bloc (anvil n a pas wallet_sendCalls : automine coupe, un evm_mine) ; verifie : chaque recu
 *      status 0x1 ; NVDAc depense <= max-in annonce ; l USDC sorti du swap = EXACTEMENT la sortie visee ; >= besoin au joueur ; le reste au
 *      wallet des frais ; allowance NVDAc -> routeur = 0 apres ; un Rolled du contrat pour CE joueur ; USDC du joueur : delta = recu - besoin ;
 *   3. NVDAc -> 1 spin sur BlockSlots : idem, un Spun pour ce joueur ;
 *   4. ETH natif -> 1 spin : multicall payable (exactOutputSingle WETH -> USDC, sweepTokenWithFee, refundETH) ; ETH depense (gaz deduit)
 *      <= max-in ; l ETH non utilise revient ; un Spun ;
 *   5. temoins de refus SUR LE FORK : devis de plus de 30 blocs ; BILIc (pool ts 1 dont la liquidite n est pas au prix) ; montant du devis
 *      different du besoin du jeu.
 * NE PROUVE PAS : un vrai wallet_sendCalls (atomicite du wallet), l interface (aucune carte n est touchee), le reglement des rolls/spins,
 *   ni le comportement a une autre heure que le bloc du fork. */
import { readFileSync } from 'node:fs';
import { BLOCKROLLS_DEPLOIEMENT } from './blockrolls-deploiement.js';
import { SLOTS_DEPLOIEMENT } from './slots-deploiement.js';
import { CANDIDATS_CL, coterMisable, planPayerEnJeton, usdcAViser, planJeuUsdc, besoinDuJeu, USDC, ETH, DEVIS_BLOCS_MAX } from './misables.js';
import { ROUTEUR_AERODROME_CL } from './calldata-aerodrome.js';
import { FEE_WALLET } from './frais-creation.js';
import { selecteur, topic } from './keccak.js';
import { EV_ROLLED } from './blockrolls-plan.js';
import { EV_SPUN } from './slots-plan.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9793';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exit(1); }
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpc = async (method, params = []) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + r.error.message + (r.error.data ? ' ' + JSON.stringify(r.error.data).slice(0, 160) : ''));
  return r.result;
};
const bas = (x) => String(x || '').toLowerCase();
const adrMot = (a) => bas(a).slice(2).padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const lireU = async (to, sig, args = '') => BigInt(await rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']));
const solde = (jeton, qui) => (bas(jeton) === ETH ? rpc('eth_getBalance', [qui, 'latest']).then(BigInt) : lireU(jeton, 'balanceOf(address)', adrMot(qui)));
const allowance = (jeton, qui, a) => lireU(jeton, 'allowance(address,address)', adrMot(qui) + adrMot(a));
async function recu(h) {
  /* ⛔ un recu pas encore mine : anvil demande au noeud amont, qui peut REFUSER (publicnode : « Archive requests require a personal
   *   token ») — ce refus n est pas un echec de la transaction, c est une course de lecture : on relit */
  for (let i = 0; i < 300; i += 1) {
    let r = null;
    try { r = await rpc('eth_getTransactionReceipt', [h]); } catch (_) { r = null; }
    if (r) return r;
    await new Promise((o) => setTimeout(o, 100));
  }
  throw new Error('receipt never came for ' + h);
}
const T_TRANSFER = topic('Transfer(address,address,uint256)');
const T_ROLLED = topic(EV_ROLLED), T_SPUN = topic(EV_SPUN);
const transfertsUsdc = (logs) => logs.filter((l) => bas(l.address) === USDC && l.topics[0] === T_TRANSFER)
  .map((l) => ({ de: '0x' + l.topics[1].slice(26), vers: '0x' + l.topics[2].slice(26), v: BigInt(l.data) }));

/* 0. un fork de Base, et les deux jeux vivants */
let info = null;
try { info = await rpc('anvil_nodeInfo'); } catch (_) { info = null; }
if (!ok(!!info, 'le noeud repond a anvil_nodeInfo : c est un fork local, pas le mainnet')) process.exit(1);
const chaine = parseInt(await rpc('eth_chainId'), 16), tete0 = parseInt(await rpc('eth_blockNumber'), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete0);
if (!ok(chaine === 8453, 'le fork est Base (8453)')) process.exit(1);
const ROLLS = bas(BLOCKROLLS_DEPLOIEMENT.adresse), SLOTS = bas(SLOTS_DEPLOIEMENT.adresse);
for (const [nom, a] of [['BlockRolls', ROLLS], ['BlockSlots', SLOTS]]) ok(String(await rpc('eth_getCode', [a, 'latest'])).length > 2, nom + ' vivant a ' + a + ' a du code sur le fork');
const rollPrice = await lireU(ROLLS, 'ROLL_PRICE()'), spinPrice = await lireU(SLOTS, 'SPIN_PRICE()');
console.log('ROLL_PRICE ' + rollPrice + ' · SPIN_PRICE ' + spinPrice + ' (lus sur les contrats)');

/* 1. le joueur, et ses jetons */
const joueur = bas('0x' + ('5a1e0' + tete0.toString(16)).padEnd(40, '7').slice(0, 40));
await rpc('anvil_impersonateAccount', [joueur]);
await rpc('anvil_setBalance', [joueur, hex(2n * 10n ** 18n)]);
const nv = CANDIDATS_CL.find((c) => c.symbole === 'NVDAc'), weth = CANDIDATS_CL.find((c) => c.natif === true && c.tickSpacing === 50), bili = CANDIDATS_CL.find((c) => c.symbole === 'BILIc');
ok(!!nv && !!weth && !!bili, 'candidats NVDAc, ETH (WETH/USDC ts 50) et BILIc presents dans misables.js');
const mesure = JSON.parse(readFileSync(new URL('./mesures/misables-20261024.json', import.meta.url), 'utf8'));
const ligneNv = mesure.table.find((t) => t.jeton === nv.jeton);
const poolSource = ligneNv && ligneNv.marche && ligneNv.marche.factory !== null && ligneNv.marche.injoignable ? bas(ligneNv.marche.poolAdr) : null;
if (!ok(!!poolSource && poolSource !== bas(nv.pool), 'la source de NVDAc est la pool du Market (nouvelle factory) ' + poolSource + ', pas la pool du swap ' + nv.pool)) process.exit(1);
await rpc('anvil_impersonateAccount', [poolSource]);
await rpc('anvil_setBalance', [poolSource, hex(10n ** 18n)]);
const decNv = Number(await lireU(nv.jeton, 'decimals()'));
const donne = 2n * 10n ** BigInt(decNv - 2); /* 0,02 NVDAc */
const tx0 = await recu(await rpc('eth_sendTransaction', [{ from: poolSource, to: nv.jeton, data: selecteur('transfer(address,uint256)') + adrMot(joueur) + mot(donne), gas: hex(200000) }]));
ok(tx0.status === '0x1' && (await solde(nv.jeton, joueur)) >= donne, 'le joueur detient ' + donne + ' NVDAc bruts (' + decNv + ' decimales)');

/* le jeu paye avec un jeton : devis vivant sur le fork, plan, lot dans un bloc, verifications */
async function jouer(titre, candidat, jeu, evTopic) {
  console.log('--- ' + titre);
  const planJeu = planJeuUsdc(jeu);
  const besoin = besoinDuJeu(planJeu, jeu.contrat);
  ok(besoin !== null && besoin > 0n, 'le plan du jeu (module du jeu, inchange) demande ' + besoin + ' USDC bruts');
  const vise = usdcAViser({ besoin });
  const devis = await coterMisable({ rpc, candidat, usdcSortie: vise });
  if (!ok(devis.etat === 'PRET', 'devis exact-output sur le fork : ' + vise + ' USDC <- ' + devis.montantIn + ' ' + candidat.symbole + ' (ecart ' + devis.ecartBps + ' bps, pool ' + devis.usdcPool + ' USDC, factory ' + devis.factory + ')'))
    { console.log(JSON.stringify(devis)); return; }
  const tete = parseInt(await rpc('eth_blockNumber'), 16);
  const bloc = await rpc('eth_getBlockByNumber', ['latest', false]);
  const plan = planPayerEnJeton({ devis, compte: joueur, jeu, blocActuel: tete, maintenant: Number(BigInt(bloc.timestamp)) });
  if (!ok(plan.etat === 'PRET', 'plan PRET (' + plan.appels.length + ' appels) : ' + (plan.resume ? plan.resume.phrase : plan.pourquoi))) return;
  const r = plan.resume;
  const natif = candidat.natif === true;
  const jetonPaye = natif ? ETH : candidat.jeton;
  const avant = { tok: await solde(jetonPaye, joueur), usdc: await solde(USDC, joueur), frais: await solde(USDC, FEE_WALLET) };
  /* le lot : automine coupe, toutes les tx du joueur dans UN bloc, puis evm_mine */
  await rpc('evm_setAutomine', [false]);
  const hs = [];
  try {
    for (const a of plan.appels) hs.push(await rpc('eth_sendTransaction', [{ from: joueur, to: a.to, data: a.data, value: a.value || '0x0', gas: hex(900000) }]));
    await rpc('evm_mine', []);
  } finally { await rpc('evm_setAutomine', [true]); }
  const recus = [];
  for (const h of hs) recus.push(await recu(h));
  const blocs = new Set(recus.map((x) => x.blockNumber));
  ok(recus.every((x) => x.status === '0x1'), 'les ' + recus.length + ' appels passent (status 0x1), dans ' + blocs.size + ' bloc');
  recus.forEach((x, i) => console.log('    ' + (x.status === '0x1' ? 'ok' : 'KO') + ' ' + plan.appels[i].quoi + ' (gaz ' + BigInt(x.gasUsed) + ')'));
  const iSwap = plan.appels.findIndex((a) => bas(a.to) === bas(ROUTEUR_AERODROME_CL));
  const tr = transfertsUsdc(recus[iSwap].logs);
  const sortiePool = tr.filter((t) => bas(t.vers) === bas(ROUTEUR_AERODROME_CL) || bas(t.vers) === joueur).filter((t) => bas(t.de) === bas(candidat.pool)).reduce((s, t) => s + t.v, 0n);
  const auJoueur = tr.filter((t) => bas(t.vers) === joueur).reduce((s, t) => s + t.v, 0n);
  const auxFrais = tr.filter((t) => bas(t.vers) === bas(FEE_WALLET)).reduce((s, t) => s + t.v, 0n);
  ok(sortiePool === vise, 'la pool rend EXACTEMENT ' + vise + ' USDC bruts (exact-output) : ' + sortiePool);
  ok(auJoueur >= besoin, 'le joueur recoit ' + auJoueur + ' USDC >= le besoin du jeu ' + besoin + ' (destinataire = le joueur)');
  ok(auxFrais === sortiePool - auJoueur, 'le wallet des frais recoit le reste : ' + auxFrais + ' (' + r.fraisBps + ' bps)');
  const apres = { tok: await solde(jetonPaye, joueur), usdc: await solde(USDC, joueur), frais: await solde(USDC, FEE_WALLET) };
  let depense = avant.tok - apres.tok;
  if (natif) { const gaz = recus.reduce((s, x) => s + BigInt(x.gasUsed) * BigInt(x.effectiveGasPrice), 0n); depense -= gaz; }
  ok(depense > 0n && depense <= r.maxEntree, candidat.symbole + ' depense ' + depense + ' <= max-in annonce ' + r.maxEntree + (natif ? ' (gaz deduit ; l ETH non utilise est revenu : value ' + BigInt(plan.appels[iSwap].value) + ')' : ''));
  ok(apres.usdc - avant.usdc === auJoueur - besoin, 'USDC du joueur : delta ' + (apres.usdc - avant.usdc) + ' = recu - besoin (le jeu a pris ' + besoin + ')');
  if (!natif) ok((await allowance(candidat.jeton, joueur, ROUTEUR_AERODROME_CL)) === 0n, 'allowance ' + candidat.symbole + ' -> routeur remise a 0');
  ok((await allowance(USDC, joueur, jeu.contrat)) === 0n, 'allowance USDC -> jeu consommee (0)');
  const ev = recus.flatMap((x) => x.logs).filter((l) => bas(l.address) === bas(jeu.contrat) && l.topics[0] === evTopic && l.topics.some((t) => bas(t) === '0x' + adrMot(joueur)));
  ok(ev.length === 1, 'le contrat du jeu emet UN evenement ' + (evTopic === T_ROLLED ? 'Rolled' : 'Spun') + ' pour ce joueur');
  return { devis, plan };
}

const g1 = await jouer('NVDAc -> 1 roll sur BlockRolls (vivant)', nv, { genre: 'rolls', contrat: ROLLS, guesses: [[1, 2, 3, 1, 2]], rollPrice }, T_ROLLED);
await jouer('NVDAc -> 1 spin sur BlockSlots (vivant)', nv, { genre: 'spins', contrat: SLOTS, n: 1, spinPrice }, T_SPUN);
await jouer('ETH natif -> 1 spin sur BlockSlots (vivant)', weth, { genre: 'spins', contrat: SLOTS, n: 1, spinPrice }, T_SPUN);

/* 5. temoins de refus, sur le fork */
console.log('--- refus');
const jeuR = { genre: 'rolls', contrat: ROLLS, guesses: [[0, 0, 0, 0, 0]], rollPrice };
const vise = usdcAViser({ besoin: rollPrice });
const dv = await coterMisable({ rpc, candidat: nv, usdcSortie: vise });
const ts = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
const vieux = planPayerEnJeton({ devis: dv, compte: joueur, jeu: jeuR, blocActuel: dv.bloc + DEVIS_BLOCS_MAX + 1, maintenant: ts });
ok(vieux.etat === 'REFUSE' && vieux.code === 'DEVIS_PERIME', 'un devis de ' + (DEVIS_BLOCS_MAX + 1) + ' blocs est refuse : ' + vieux.pourquoi);
const db = await coterMisable({ rpc, candidat: bili, usdcSortie: vise });
const pb = db.etat === 'PRET' ? planPayerEnJeton({ devis: db, compte: joueur, jeu: jeuR, blocActuel: db.bloc, maintenant: ts }) : db;
ok(pb.etat !== 'PRET', 'BILIc (ecart lu sur le fork ' + db.ecartBps + ' bps) n est pas misable : ' + pb.pourquoi);
const autre = planPayerEnJeton({ devis: { ...dv, usdcSortie: vise + 1n }, compte: joueur, jeu: jeuR, blocActuel: dv.bloc, maintenant: ts });
ok(autre.etat === 'REFUSE' && autre.code === 'DEVIS_MONTANT', 'un devis pour un autre montant que le besoin du jeu est refuse');
ok(!!g1, 'le parcours NVDAc -> roll a ete execute');

console.log((ko ? 'KO ' : 'OK ') + (n - ko) + '/' + n + ' sur le fork au bloc ' + tete0);
process.exit(ko ? 1 : 0);
