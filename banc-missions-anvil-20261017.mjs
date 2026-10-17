/* banc-missions-anvil-20261017.mjs — BLOCK MISSIONS DE BOUT EN BOUT sur un anvil LOCAL (chaine 31337, aucun reseau), avec le contrat COMPILE.
 * Usage : (dans contracts/) forge build ; anvil --port P ; node banc-missions-anvil-20261017.mjs P
 * Cles : les comptes anvil par defaut (deverrouilles par anvil) + la cle de TEST publique 0xA11CE pour le verifier. Rien ne touche Base.
 * DEROULE (vraies transactions, vraies lectures par attester()) :
 *   1. le joueur fait l action AVANT la fenetre ; 43 300 blocs a 2 s (24 h) ; il la refait AVANT la mission ; la mission est postee
 *      (planPoster : approve EXACT + postTask) ; il la refait APRES ; il sort 30 unites puis les recupere (minimum 70 sur la fenetre).
 *   2. attester() : refuse l action d avant la fenetre, refuse celle d avant la mission, SIGNE la bonne avec held = 70 (pas 100).
 *   3. planReclamer -> claim() envoye par le joueur : status 1 ; joueur +9, createur +0,3, reserve +0,7, dev 0 (unites, rail 0).
 *   4. AVANT le claim, la signature envoyee par un autre wallet : BadProof ; APRES, rejouer le meme claim : TxUsed (erreurs exigees).
 * NE PROUVE PAS : Base (hook 7030 reel, B20, archive) — le fork de Grok et la preuve de deploiement le couvrent ; ici le hook est un stub. */
import { readFileSync } from 'node:fs';
import { attester } from './missions-attestation.js';
import { planPoster, planReclamer } from './missions-plan.js';
import { adresseDe } from './signeur-secp256k1.js';
import { selecteur, topic, keccak256Hex } from './keccak.js';

const PORT = process.argv[2] || '9562';
const URL_RPC = 'http://127.0.0.1:' + PORT;
let idr = 0;
const rpc = async (method, params = []) => {
  const r = await fetch(URL_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idr, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + (r.error.message || JSON.stringify(r.error)));
  return r.result;
};
let n = 0, ko = 0;
const vu = (c, m) => { n++; if (!c) ko++; console.log((c ? '  ok  ' : '  KO  ') + m); };
const art = (f, c) => JSON.parse(readFileSync(new URL('./contracts/out/' + f + '/' + c + '.json', import.meta.url), 'utf8'));
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const adr = (x) => String(x).toLowerCase().slice(2).padStart(64, '0');
const sel = (s) => selecteur(s).replace(/^0x/, '');
const E18 = 10n ** 18n;

async function envoyer(from, to, data) {
  const h = await rpc('eth_sendTransaction', [{ from, ...(to ? { to } : {}), data, gas: '0x' + (8_000_000).toString(16) }]);
  let r = null; for (let k = 0; k < 60 && !r; k++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await new Promise((ok) => setTimeout(ok, 200)); }
  if (!r) throw new Error('no receipt ' + h);
  return r;
}
const deployer = async (from, a, args = '') => { const r = await envoyer(from, null, a.bytecode.object + args); if (r.status !== '0x1') throw new Error('deploy failed'); return r.contractAddress.toLowerCase(); };
const lireU = async (to, data) => BigInt(await rpc('eth_call', [{ to, data }, 'latest']));
const solde = (j, c) => lireU(j, '0x70a08231' + adr(c));

const [DEP, CREA, JOUEUR, AUTRE, PM, DEV, RES, GARDE] = (await rpc('eth_accounts')).map((x) => x.toLowerCase());
const CLE = '0x' + (0xA11CEn).toString(16).padStart(64, '0');
const VERIF = adresseDe(CLE).toLowerCase();
const chaineId = parseInt(await rpc('eth_chainId'), 16);
console.log('anvil ' + URL_RPC + ' chaine ' + chaineId + ' ; verifier (cle de test 0xA11CE) ' + VERIF);

/* deploiements */
const JE = art('BancMissionsStubs.sol', 'JetonE'), CE = art('BancMissionsStubs.sol', 'CibleE'), HS = art('SigneurSecp256k1.t.sol', 'HookS');
const MV3 = art('BlockMissionsV3.sol', 'BlockMissionsV3');
const blk = await deployer(DEP, JE), amzn = await deployer(DEP, JE), usdc = await deployer(DEP, JE), cible = await deployer(DEP, CE), hook = await deployer(DEP, HS);
const argsM = [hook, PM, DEV, RES, usdc, VERIF, GARDE, '0x' + '00'.repeat(20)].map(adr).join('') + mot(9 * 32) + mot(0);
const contrat = await deployer(DEP, MV3, argsM);
vu(('0x' + (await rpc('eth_call', [{ to: contrat, data: '0x' + sel('verifier()') }, 'latest'])).slice(-40)) === VERIF, 'contrat deploye, verifier() = la cle de test');

/* la pool du block : blk / amzn sur NOTRE hook (stub), createur CREA */
const [c0, c1] = BigInt(blk) < BigInt(amzn) ? [blk, amzn] : [amzn, blk];
const cle = { currency0: c0, currency1: c1, fee: 0, tickSpacing: 200, hooks: hook };
const motsCle = adr(c0) + adr(c1) + mot(0) + mot(200) + adr(hook);
const poolId = keccak256Hex(Buffer.from(motsCle, 'hex'));
vu(poolId === (await rpc('eth_call', [{ to: contrat, data: '0x' + sel('poolIdOf((address,address,uint24,int24,address))') + motsCle }, 'latest'])), 'poolId JS = poolIdOf() du contrat');
await envoyer(DEP, hook, '0x' + sel('set(bytes32,address,address)') + poolId.slice(2) + adr(CREA) + adr(blk));
const FAIRE = '0x' + sel('faire()'), TOPIC_FAIT = topic('Fait(address)');

/* 1. la chronologie */
await envoyer(DEP, blk, '0x' + sel('mint(address,uint256)') + adr(CREA) + mot(1000n * E18));
await envoyer(DEP, blk, '0x' + sel('mint(address,uint256)') + adr(JOUEUR) + mot(100n * E18));
const txAvantFenetre = (await envoyer(JOUEUR, cible, FAIRE)).transactionHash;
/* 25 h en 60 blocs de 1 500 s. ⛔ MESURE 2026-10-17 : anvil_mine de 43 300 blocs (2 s, comme Base) depasse 300 s, meme par tranches de
 *   2 000 -> fetch coupe. Des blocs LENTS exercent en plus la recherche exacte du bloc de debut (blocDebut ne suppose plus 2 s). */
await rpc('anvil_mine', ['0x3c', '0x5dc']);
const txAvantMission = (await envoyer(JOUEUR, cible, FAIRE)).transactionHash;
const maintenant = parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
const params = { rewardToken: blk, reward: (10n * E18).toString(), maxDone: 2, perWallet: 1, expiry: maintenant + 20 * 86400, target: cible, topic0: TOPIC_FAIT, descHash: keccak256Hex(Buffer.from('do faire() on the target')) };
const hold = { minBlock: (50n * E18).toString(), minPaired: 0, bonusMinBlock: 0, bonusBps: 0, window: 86400 };
const plan = planPoster({ contrat, cle, params, hold, maintenant });
vu(plan.etat === 'PRET' && plan.budget === (20n * E18).toString() && plan.appels.length === 2, 'planPoster : approve EXACT 20 + postTask');
for (const c of plan.appels) { const r = await envoyer(CREA, c.to, c.data); vu(r.status === '0x1', 'createur : ' + c.quoi + ' -> status ' + r.status + ' (' + parseInt(r.gasUsed, 16) + ' gas)'); }
vu(await lireU(contrat, '0x' + sel('escrowLeft(uint256)') + mot(0)) === 20n * E18 && await lireU(blk, '0x' + sel('allowance(address,address)') + adr(CREA) + adr(contrat)) === 0n, 'sequestre 20 lu sur le contrat, approbation consommee a 0');
const txBonne = (await envoyer(JOUEUR, cible, FAIRE)).transactionHash;
await envoyer(JOUEUR, blk, '0x' + sel('transfer(address,uint256)') + adr(AUTRE) + mot(30n * E18));
await envoyer(AUTRE, blk, '0x' + sel('transfer(address,uint256)') + adr(JOUEUR) + mot(30n * E18));
await rpc('anvil_mine', ['0x5', '0x2']);

/* 2. le verifier, sur la VRAIE chaine anvil */
const io = { rpcEtat: rpc, rpcLogs: rpc, chaineId, contrat, cle: CLE, tranche: 5000 };
const r1 = await attester(io, { taskId: 0, completer: JOUEUR, txHash: txAvantFenetre });
vu(r1.etat === 'REFUSE' && /before your holding window/.test(r1.pourquoi), 'action d avant la fenetre -> REFUSE (' + r1.pourquoi + ')');
const r2 = await attester(io, { taskId: 0, completer: JOUEUR, txHash: txAvantMission });
vu(r2.etat === 'REFUSE' && /before the mission was posted/.test(r2.pourquoi), 'action d avant la mission -> REFUSE');
const r3 = await attester(io, { taskId: 0, completer: JOUEUR, txHash: txBonne });
vu(r3.ok === true && r3.held.heldBlock === (70n * E18).toString(), 'action neuve -> SIGNE, held = 70 (le minimum de la fenetre, pas 100) ' + JSON.stringify(r3.held || r3));
const r4 = await attester(io, { taskId: 0, completer: AUTRE, txHash: txBonne });
vu(r4.etat === 'REFUSE', 'la tx d un autre joueur -> REFUSE');

/* 3. le claim, envoye par le joueur avec planReclamer */
const avant = { j: await solde(blk, JOUEUR), c: await solde(blk, CREA), r: await solde(blk, RES), d: await solde(blk, DEV) };
const claim = planReclamer({ contrat, taskId: 0, txHash: txBonne, held: r3.held, signature: r3.signature }).appels[0];
/* ⛔ 2026-10-17 : ce test tournait APRES le claim et passait sur TxUsed (0x21298361), pas sur la signature. AVANT le claim, et l erreur exigee. */
const erreur = (e) => (String(e.message).match(/0x[0-9a-f]{8}/) || [''])[0];
const vol = await rpc('eth_call', [{ from: AUTRE, to: claim.to, data: claim.data }, 'latest']).then(() => 'passe', erreur);
vu(vol === selecteur('BadProof()'), 'la signature du joueur envoyee par un autre wallet AVANT le claim : BadProof (' + vol + ')');
const rc = await envoyer(JOUEUR, claim.to, claim.data);
vu(rc.status === '0x1', 'claim() accepte par le contrat compile : status ' + rc.status + ' (' + parseInt(rc.gasUsed, 16) + ' gas)');
const d = { j: await solde(blk, JOUEUR) - avant.j, c: await solde(blk, CREA) - avant.c, r: await solde(blk, RES) - avant.r, dv: await solde(blk, DEV) - avant.d };
vu(d.j === 9n * E18 && d.c === 3n * E18 / 10n && d.r === 7n * E18 / 10n && d.dv === 0n, 'soldes : joueur +9, createur +0,3, reserve +0,7, dev 0 (' + [d.j, d.c, d.r, d.dv].join(' / ') + ')');
vu(await lireU(contrat, '0x' + sel('escrowLeft(uint256)') + mot(0)) === 10n * E18, 'sequestre restant 10 (une completion sur deux)');

/* 4. rejeu et vol de signature */
const rejeu = await rpc('eth_call', [{ from: JOUEUR, to: claim.to, data: claim.data }, 'latest']).then(() => 'passe', erreur);
vu(rejeu === selecteur('TxUsed()'), 'le meme claim rejoue : TxUsed (' + rejeu + ')');
const r5 = await attester(io, { taskId: 0, completer: JOUEUR, txHash: txBonne });
vu(r5.etat === 'REFUSE' && /already paid/.test(r5.pourquoi), 'attester la tx deja payee : REFUSE, lu dans txUsed() du contrat (Grok A8b)');
console.log((ko ? 'ECHEC ' : 'ok ') + 'banc-missions-anvil - ' + n + ' assertions, ' + ko + ' KO ; NE PROUVE PAS Base (hook stub)');
process.exit(ko ? 1 : 0);
