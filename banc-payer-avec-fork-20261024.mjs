/* banc-payer-avec-fork-20261024.mjs — « PAY WITH » DE app.html EXECUTE SUR UN FORK DE BASE, CONTRE LES CONTRATS VIVANTS.
 * Le banc-misables-fork-20261024 executait le plan de misables.js appele par LUI ; celui-ci execute les appels que LE SELECTEUR DE L APP
 * batit : le vrai code de app.html (bloc PAY WITH + rollPaye / autoRollLot / passPaye / slotsAgir, charges par payer-avec-harnais) avec
 *   - la chaine = le fork (eth_call, eth_getBlockByNumber, recus : le noeud anvil) ;
 *   - le wallet = un wallet FACTICE dont chaque envoi devient une vraie transaction du joueur sur le fork (compte impersonne par anvil,
 *     AUCUNE cle) ; « lot » : toutes les tx du lot dans UN bloc (automine coupe, evm_mine) ; « suite » : une tx par signature ;
 *   - la liste /api/misables = la VRAIE regle du serveur (coterMisableTailles -> ligneMisable) lue SUR LE FORK pour NVDAc et l ETH.
 * Usage : "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --fork-url https://base-rpc.publicnode.com --port 9794
 *         puis node banc-payer-avec-fork-20261024.mjs [http://127.0.0.1:9794]
 * DEROULE : NVDAc -> 1 Roll (lot) ; NVDAc -> Auto-roll x5 (lot) ; ETH -> 1 Spin (suite) ; NVDAc -> 1 Spin (lot) ; NVDAc -> Week pass (lot) ;
 *   puis refus SUR LE FORK : la tete avance de 31 blocs apres le devis (rien n est envoye).
 *   Pour chacun : chaque recu status 0x1 ; l evenement du jeu pour CE joueur ; la pool rend EXACTEMENT la sortie visee ; le jeton depense
 *   <= l approve exact (= le max-in du resume) ; allowance jeton -> routeur = 0 et USDC -> jeu = 0 apres ; le resume affiche = le lot envoye.
 * NE PROUVE PAS : un vrai wallet (wallet_sendCalls d un vrai wallet, son atomicite), les pixels, le reglement des rolls/spins. */
import { BLOCKROLLS_DEPLOIEMENT } from './blockrolls-deploiement.js';
import { SLOTS_DEPLOIEMENT } from './slots-deploiement.js';
import * as MIS from './misables.js';
import { ROUTEUR_AERODROME_CL } from './calldata-aerodrome.js';
import { selecteur, topic } from './keccak.js';
import { EV_ROLLED, EV_PASS_BOUGHT } from './blockrolls-plan.js';
import { EV_SPUN } from './slots-plan.js';
import * as Slots from './slots-plan.js';
import { lireApp, charger, choisir, walletFactice, appelsEnvoyes, MESURE } from './payer-avec-harnais-20261024.mjs';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9794';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exit(1); }
/* ⛔ PAS de temps rapide ici : fetch (undici) a besoin des vrais minuteurs ; les pauses d envoi.js (1,5 a 2 s) courent pour de vrai */
const remettre = () => {};
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpcBrut = async (method, params = []) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + r.error.message);
  return r.result;
};
/* un recu pas encore mine : anvil demande au noeud amont, qui peut refuser — une course de lecture, on relit */
const rpc = async (method, params = []) => {
  if (method !== 'eth_getTransactionReceipt') return rpcBrut(method, params);
  for (let i = 0; i < 50; i += 1) { try { const r = await rpcBrut(method, params); if (r) return r; } catch (_) { /* relire */ } await new Promise((o) => setImmediate(o)); }
  return null;
};
const bas = (x) => String(x || '').toLowerCase();
const adrMot = (a) => bas(a).slice(2).padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const lireU = async (to, sig, args = '') => BigInt(await rpcBrut('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']));
const solde = (jeton, qui) => (bas(jeton) === MIS.ETH ? rpcBrut('eth_getBalance', [qui, 'latest']).then(BigInt) : lireU(jeton, 'balanceOf(address)', adrMot(qui)));
const allowance = (jeton, qui, a) => lireU(jeton, 'allowance(address,address)', adrMot(qui) + adrMot(a));
const T_TRANSFER = topic('Transfer(address,address,uint256)');

/* 0. un fork de Base, et les jeux vivants */
let info = null; try { info = await rpcBrut('anvil_nodeInfo'); } catch (_) { info = null; }
if (!ok(!!info, 'le noeud repond a anvil_nodeInfo : un fork local, pas le mainnet')) process.exit(1);
const chaine = parseInt(await rpcBrut('eth_chainId'), 16), tete0 = parseInt(await rpcBrut('eth_blockNumber'), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete0);
if (!ok(chaine === 8453, 'le fork est Base (8453)')) process.exit(1);
const ROLLS = bas(BLOCKROLLS_DEPLOIEMENT.adresse), SLOTS = bas(SLOTS_DEPLOIEMENT.adresse);
for (const [nom, a] of [['BlockRolls', ROLLS], ['BlockSlots', SLOTS]]) ok(String(await rpcBrut('eth_getCode', [a, 'latest'])).length > 2, nom + ' vivant a ' + a + ' a du code sur le fork');
const rollPrice = await lireU(ROLLS, 'ROLL_PRICE()'), passPrice = await lireU(ROLLS, 'PASS_PRICE()'), passRolls = Number(await lireU(ROLLS, 'PASS_ROLLS()')), spinPrice = await lireU(SLOTS, 'SPIN_PRICE()');
console.log('ROLL_PRICE ' + rollPrice + ' · PASS_PRICE ' + passPrice + ' · PASS_ROLLS ' + passRolls + ' · SPIN_PRICE ' + spinPrice + ' (lus sur les contrats)');

/* 1. le joueur : 2 ETH (anvil_setBalance) et 0,1 NVDAc pris a la pool du MARCHE (nouvelle factory), pas a celle ou l app swappe */
const joueur = bas('0x' + ('9a7e0' + tete0.toString(16)).padEnd(40, '3').slice(0, 40));
await rpcBrut('anvil_impersonateAccount', [joueur]);
await rpcBrut('anvil_setBalance', [joueur, hex(2n * 10n ** 18n)]);
const nvC = MIS.CANDIDATS_CL.find((c) => c.symbole === 'NVDAc'), ethC = MIS.CANDIDATS_CL.find((c) => c.natif === true && c.tickSpacing === 50);
const mNv = MESURE.table.find((t) => t.jeton === nvC.jeton);
const source = bas(mNv.marche.poolAdr);
if (!ok(!!source && source !== bas(nvC.pool), 'source de NVDAc = la pool du Market ' + source + ', pas la pool du swap ' + nvC.pool)) process.exit(1);
await rpcBrut('anvil_impersonateAccount', [source]);
await rpcBrut('anvil_setBalance', [source, hex(10n ** 18n)]);
const tx0 = await rpcBrut('eth_sendTransaction', [{ from: source, to: nvC.jeton, data: selecteur('transfer(address,uint256)') + adrMot(joueur) + mot(10n ** 7n), gas: hex(200000) }]);
ok((await rpc('eth_getTransactionReceipt', [tx0])).status === '0x1' && (await solde(nvC.jeton, joueur)) >= 10n ** 7n, 'le joueur detient 0,1 NVDAc (10 000 000 bruts)');

/* 2. la liste servie, par la regle du serveur, lue SUR LE FORK (NVDAc avec sa reference du Market ; l ETH : ses deux pools) */
const lignes = [];
for (const c of [nvC, ...MIS.CANDIDATS_CL.filter((x) => x.natif)]) {
  const ref = c === nvC ? { pool: source } : null;
  lignes.push(MIS.ligneMisable(c, await MIS.coterMisableTailles({ rpc, candidat: c, sorties: MIS.TAILLES_USDC, reference: ref })));
}
const LIGNES = JSON.parse(JSON.stringify(MIS.listeMisables(lignes), (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
const NV = LIGNES.find((l) => l.symbole === 'NVDAc'), ETHL = LIGNES.find((l) => l.symbole === 'ETH');
ok(NV && NV.tailles.every((t) => t.misable) && ETHL && ETHL.tailles.every((t) => t.misable), 'sur le fork, NVDAc et ETH sont misables aux trois tailles (' + (NV && NV.tailles.map((t) => t.ecartBps + ' bps').join(' / ')) + ' ; ETH ' + (ETHL && ETHL.tailles.map((t) => t.ecartBps + ' bps').join(' / ')) + ')');

/* le wallet : chaque envoi = une vraie tx du joueur sur le fork */
const hashes = [];
async function envoyer(genre, calls) {
  const hs = [];
  if (genre === 'lot') {
    await rpcBrut('evm_setAutomine', [false]);
    try { for (const c of calls) hs.push(await rpcBrut('eth_sendTransaction', [{ from: joueur, to: c.to, data: c.data, value: c.value || '0x0', gas: hex(900000) }])); await rpcBrut('evm_mine', []); }
    finally { await rpcBrut('evm_setAutomine', [true]); }
  } else for (const c of calls) hs.push(await rpcBrut('eth_sendTransaction', [{ from: joueur, to: c.to, data: c.data, value: c.value || '0x0', gas: hex(900000) }]));
  hashes.push(...hs);
  return hs;
}
const APP = lireApp();
async function jouer(titre, { flux, mode, ligne, contrat, ev, rpcJeu = rpc }) {
  console.log('--- ' + titre);
  const w = walletFactice({ mode, joueur, envoyer });
  const ch = charger(APP, { compte: joueur, rpc: rpcJeu, eth: w.eth, lignes: LIGNES,
    rollsCfg: { contrat: ROLLS, prixRoll: String(rollPrice), prixPass: String(passPrice), passRolls, bloc: 1 }, slotsJ: { ok: true, contrat: SLOTS, prixSpin: String(spinPrice) } });
  await ch.api.peindrePayerAvec();
  if (!ok(choisir(ch, ligne.jeton), 'le selecteur propose ' + ligne.symbole + ' : « ' + (ch.ecran.el('payerJeton').options.find((o) => o.value === ligne.jeton) || {}).textContent + ' »')) return null;
  const jetonPaye = ligne.natif ? MIS.ETH : ligne.jeton;
  const avant = { tok: await solde(jetonPaye, joueur), usdc: await solde(MIS.USDC, joueur) };
  const h0 = hashes.length, e0 = ch.ecran.ecrits.length;
  await (flux === 'roll' ? ch.api.rollPaye() : flux === 'auto' ? ch.api.autoRollLot(joueur) : flux === 'pass' ? ch.api.passPaye() : ch.api.slotsAgir('spin'));
  const env = appelsEnvoyes(w.requetes), hs = hashes.slice(h0);
  const etat = flux === 'pass' ? 'potEtat' : flux === 'spin' ? 'slotsEtat' : 'rollsEtat';
  const textes = ch.ecran.ecrits.slice(e0).filter((x) => x.id === etat).map((x) => x.texte);
  textes.forEach((x) => console.log('    [' + etat + '] ' + x));
  return { ch, w, env, hs, avant, jetonPaye, textes };
}
async function verifier(r, { ligne, contrat, ev, nEv, besoin }) {
  if (!r) return;
  const recus = []; for (const h of r.hs) recus.push(await rpc('eth_getTransactionReceipt', [h]));
  ok(r.hs.length === r.env.length && r.env.length > 0 && recus.every((x) => x && x.status === '0x1'), 'les ' + r.env.length + ' appels BATIS PAR L APP passent (status 0x1), ' + new Set(recus.map((x) => x && x.blockNumber)).size + ' bloc(s)');
  const iSwap = r.env.findIndex((c) => c.to === bas(ROUTEUR_AERODROME_CL));
  const tr = (recus[iSwap] ? recus[iSwap].logs : []).filter((l) => bas(l.address) === MIS.USDC && l.topics[0] === T_TRANSFER).map((l) => ({ de: '0x' + l.topics[1].slice(26), vers: '0x' + l.topics[2].slice(26), v: BigInt(l.data) }));
  const sortie = tr.filter((t) => t.de === bas(ligne.pool)).reduce((s, t) => s + t.v, 0n), auJoueur = tr.filter((t) => t.vers === joueur).reduce((s, t) => s + t.v, 0n);
  const vise = MIS.usdcAViser({ besoin });
  ok(sortie === vise, 'la pool rend EXACTEMENT ' + vise + ' USDC bruts (exact-output) : ' + sortie);
  ok(auJoueur >= besoin, 'le joueur recoit ' + auJoueur + ' USDC >= le besoin du jeu ' + besoin);
  const ap = r.env.find((c) => c.data.startsWith(selecteur('approve(address,uint256)')) && c.to === ligne.jeton);
  const maxIn = ligne.natif ? r.env[iSwap].value : BigInt('0x' + ap.data.slice(74, 138));
  const apres = { tok: await solde(r.jetonPaye, joueur), usdc: await solde(MIS.USDC, joueur) };
  let depense = r.avant.tok - apres.tok;
  if (ligne.natif) depense -= recus.reduce((s, x) => s + BigInt(x.gasUsed) * BigInt(x.effectiveGasPrice), 0n);
  ok(depense > 0n && depense <= maxIn, ligne.symbole + ' depense ' + depense + ' <= le max-in envoye ' + maxIn + (ligne.natif ? ' (gaz deduit ; le reste de l ETH est revenu)' : ''));
  const resume = r.textes.find((x) => x.startsWith('Pay with '));
  ok(!!resume && resume.includes('at most ' + r.ch.api.qteJeton(maxIn, ligne.natif ? 18 : 8, 6, true) + ' ' + ligne.symbole + ' in, exactly ' + Slots.usdcPrecis(vise) + ' USDC out'), 'le resume affiche avant la signature = le lot envoye (max-in ' + maxIn + ', sortie ' + vise + ')');
  ok(apres.usdc - r.avant.usdc === auJoueur - besoin, 'USDC du joueur : delta ' + (apres.usdc - r.avant.usdc) + ' = recu - besoin (le jeu a pris ' + besoin + ')');
  if (!ligne.natif) ok((await allowance(ligne.jeton, joueur, ROUTEUR_AERODROME_CL)) === 0n, 'allowance ' + ligne.symbole + ' -> routeur remise a 0');
  ok((await allowance(MIS.USDC, joueur, contrat)) === 0n, 'allowance USDC -> jeu consommee (0)');
  const evs = recus.flatMap((x) => x.logs).filter((l) => bas(l.address) === contrat && l.topics[0] === topic(ev) && l.topics.some((t) => bas(t) === '0x' + adrMot(joueur)));
  ok(evs.length === nEv, 'le contrat du jeu emet ' + nEv + ' ' + ev.split('(')[0] + ' pour ce joueur (' + evs.length + ')');
}

const rR = await jouer('NVDAc -> 1 Roll (lot, BlockRolls vivant)', { flux: 'roll', mode: 'lot', ligne: NV });
await verifier(rR, { ligne: NV, contrat: ROLLS, ev: EV_ROLLED, nEv: 1, besoin: rollPrice });
const rA = await jouer('NVDAc -> Auto-roll x5 (lot)', { flux: 'auto', mode: 'lot', ligne: NV });
await verifier(rA, { ligne: NV, contrat: ROLLS, ev: EV_ROLLED, nEv: 5, besoin: rollPrice * 5n });
const rE = await jouer('ETH -> 1 Spin (suite : une signature par appel, BlockSlots vivant)', { flux: 'spin', mode: 'suite', ligne: ETHL });
ok(!!rE && rE.textes.some((x) => x.includes('the USDC lands in your wallet first')), 'la suite dit avant la signature que l USDC arrive d abord dans le wallet');
await verifier(rE, { ligne: ETHL, contrat: SLOTS, ev: EV_SPUN, nEv: 1, besoin: spinPrice });
const rS = await jouer('NVDAc -> 1 Spin (lot)', { flux: 'spin', mode: 'lot', ligne: NV });
await verifier(rS, { ligne: NV, contrat: SLOTS, ev: EV_SPUN, nEv: 1, besoin: spinPrice });
const rP = await jouer('NVDAc -> Week pass (lot)', { flux: 'pass', mode: 'lot', ligne: NV });
await verifier(rP, { ligne: NV, contrat: ROLLS, ev: EV_PASS_BOUGHT, nEv: 1, besoin: passPrice });

/* refus SUR LE FORK : 31 blocs mines entre le devis et la relecture de la tete -> refuse, rien n est envoye */
console.log('--- refus : devis perime sur le fork');
let devisVus = 0;
const rpcPerime = async (m, p) => {
  const r = await rpc(m, p);
  if (m === 'eth_call' && bas(p[0].to) === MIS.QUOTEUR_CL && ++devisVus === 1) await rpcBrut('anvil_mine', [hex(MIS.DEVIS_BLOCS_MAX + 1)]);
  return r;
};
const nHash = hashes.length;
const rX = await jouer('NVDAc -> 1 Roll, tete +31 apres le devis', { flux: 'roll', mode: 'lot', ligne: NV, rpcJeu: rpcPerime });
ok(!!rX && hashes.length === nHash && rX.env.length === 0 && rX.w.requetes.every((q) => !/sendCalls|sendTransaction|getCapabilities/.test(q.method)), 'aucune transaction, aucune demande au wallet');
ok(!!rX && /blocks old \(more than 30\)/.test(rX.textes[rX.textes.length - 1] || '') && /Nothing was sent\.$/.test(rX.textes[rX.textes.length - 1] || ''), 'le refus est dit sur la ligne du Roll');

remettre();
console.log((ko ? 'KO ' : 'OK ') + (n - ko) + '/' + n + ' sur le fork au bloc ' + tete0 + ' — les appels batis par le selecteur de app.html');
process.exit(ko ? 1 : 0);
