/* banc-missions-factory-fork-20261017.mjs — LE DEPLOIEMENT DES MISSIONS AVEC RAIL, sur un FORK de Base (base-anvil : UNIT est un B20).
 * Usage : "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://mainnet.base.org --port 9981
 *         node banc-missions-factory-fork-20261017.mjs http://127.0.0.1:9981 <missions-deploiement.js genere avec verifier = cle de test 0xA11CE>
 * ⛔ FORK LOCAL SEULEMENT. Cles : comptes anvil + la cle de TEST publique 0xA11CE (verifier). Comptes impersonnes : le createur REEL de la pool
 *   UNIT (LU au hook via createurs(poolId), jamais recopie).
 * DEROULE : (1) la donnee `creation` de MissionsDeployer est envoyee TELLE QUELLE (sans `to`) ; (2) relecture : missions(), rail(), V3.RAIL,
 *   rail.MISSIONS, owner = la factory, pendingOwner = le signataire, OPERATOR = le signataire, routeOf(UNIT) = 2 sauts ; acceptOwnership ;
 *   (3) une mission payee en UNIT sur la VRAIE pool UNIT/ETH (hook 7030) ; le joueur agit ; claim signe par la cle de test ;
 *   devOwed(UNIT) = 1,4 % de R ; (4) le rail vend cette part : convertDevShare -> USDC au dev wallet, 0 unite au dev, les unites dans le
 *   PoolManager. AVANT tout achat, puis (si refuse) APRES un achat de UNIT en ETH : la mesure dit si la pool UNIT avait de l ETH en face.
 * NE PROUVE PAS : Phil signant sur mainnet ; un vrai vendeur de UNIT au moment de la conversion. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { selecteur, keccak256Hex } from './keccak.js';
import { signerDigest } from './signeur-secp256k1.js';
import { planPoster, planReclamer } from './missions-plan.js';
import { UNIT_BLOCK, RAIL_ROUTE } from './missions-rail.js';

const URL_RPC = process.argv[2] || 'http://127.0.0.1:9981';
const { MISSIONS_DEPLOIEMENT: D } = await import(pathToFileURL(process.argv[3]).href);
let idr = 0;
const rpc = async (method, params = []) => {
  const r = await fetch(URL_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idr, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + (r.error.message || JSON.stringify(r.error)) + (r.error.data ? ' ' + JSON.stringify(r.error.data).slice(0, 120) : ''));
  return r.result;
};
let n = 0, ko = 0;
const vu = (c, m) => { n++; if (!c) ko++; console.log((c ? '  ok  ' : '  KO  ') + m); };
const sel = (s) => selecteur(s).replace(/^0x/, '');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const adr = (x) => String(x).toLowerCase().slice(2).padStart(64, '0');
const lireAdr = async (to, sig, arg = '') => ('0x' + String(await rpc('eth_call', [{ to, data: '0x' + sel(sig) + arg }, 'latest'])).slice(-40)).toLowerCase();
const lireU = async (to, data) => BigInt(await rpc('eth_call', [{ to, data }, 'latest']));
const solde = (j, c) => lireU(j, '0x70a08231' + adr(c));
const E18 = 10n ** 18n;
async function envoyer(from, to, data, value = '0x0') {
  const h = await rpc('eth_sendTransaction', [{ from, ...(to ? { to } : {}), data, value, gas: '0x' + (12_000_000).toString(16) }]);
  let r = null; for (let k = 0; k < 120 && !r; k++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await new Promise((ok) => setTimeout(ok, 500)); }
  if (!r) throw new Error('no receipt ' + h);
  return r;
}
const chaine = parseInt(await rpc('eth_chainId'), 16);
if (!/^http:\/\/127\.0\.0\.1:/.test(URL_RPC) || chaine !== 8453) throw new Error('local Base fork only');
if (!D.pret || D.contrat !== 'MissionsDeployer') throw new Error('deploy data not ready / not the factory');
const [DEP, , , , , JOUEUR] = (await rpc('eth_accounts')).map((x) => x.toLowerCase());
const CLE = '0x' + (0xA11CEn).toString(16).padStart(64, '0');
const C = D.constructeur;

/* (1) le deploiement EXACT */
const r0 = await envoyer(DEP, null, D.creation);
vu(r0.status === '0x1', 'creation de MissionsDeployer envoyee telle quelle : status ' + r0.status + ' (' + parseInt(r0.gasUsed, 16) + ' gas)');
const fac = r0.contractAddress.toLowerCase();
const V3 = await lireAdr(fac, 'missions()'), RAIL = await lireAdr(fac, 'rail()');
/* (2) relecture */
vu(await lireAdr(V3, 'RAIL()') === RAIL && await lireAdr(RAIL, 'MISSIONS()') === V3, 'liens : V3.RAIL = rail et rail.MISSIONS = V3');
vu(await lireAdr(V3, 'owner()') === fac && await lireAdr(V3, 'pendingOwner()') === DEP && await lireAdr(RAIL, 'OPERATOR()') === DEP, 'owner = la factory, ownership PROPOSE au signataire, OPERATOR = le signataire');
for (const [k, g] of [['hook', 'HOOK()'], ['poolManager', 'POOL_MANAGER()'], ['devWallet', 'DEV_WALLET()'], ['communityReserve', 'COMMUNITY_RESERVE()'], ['usdc', 'USDC()'], ['verifier', 'verifier()'], ['guardian', 'guardian()']]) {
  vu(await lireAdr(V3, g) === C[k], 'V3.' + k + ' = ' + C[k]);
}
vu(await lireAdr(RAIL, 'DEV_WALLET()') === C.devWallet && await lireAdr(RAIL, 'USDC()') === C.usdc && await lireAdr(RAIL, 'POOL_MANAGER()') === C.poolManager, 'rail : meme dev wallet, USDC, PoolManager');
let dd = 0; for (const a of D.devDirect) dd += Number(await lireU(V3, '0x' + sel('devDirect(address)') + adr(a)));
vu(dd === D.devDirect.length && await lireU(V3, '0x' + sel('devDirect(address)') + adr(UNIT_BLOCK)) === 0n, 'devDirect ' + dd + '/' + D.devDirect.length + ', UNIT absent');
const route = String(await rpc('eth_call', [{ to: RAIL, data: '0x' + sel('routeOf(address)') + adr(UNIT_BLOCK) }, 'latest']));
vu(BigInt('0x' + route.slice(2 + 64, 2 + 128)) === 2n, 'rail.routeOf(UNIT) = 2 sauts');
await envoyer(DEP, V3, '0x' + sel('acceptOwnership()'));
vu(await lireAdr(V3, 'owner()') === DEP, 'acceptOwnership : le signataire est owner');

/* (3) une mission payee en UNIT sur la VRAIE pool UNIT/ETH du hook 7030 */
const cle = { currency0: '0x' + '0'.repeat(40), currency1: UNIT_BLOCK, fee: 0, tickSpacing: 200, hooks: C.hook };
const poolId = keccak256Hex(Buffer.from([cle.currency0, cle.currency1].map(adr).join('') + mot(0) + mot(200) + adr(cle.hooks), 'hex'));
/* createurs(bytes32) rend (address, uint256) : l adresse est le PREMIER mot (lire les 40 derniers caracteres donnait le second, 0) */
const brutC = String(await rpc('eth_call', [{ to: C.hook, data: '0x' + sel('createurs(bytes32)') + poolId.slice(2) }, 'latest']));
const CREA = ('0x' + brutC.slice(2 + 24, 2 + 64)).toLowerCase();
vu(/^0x[0-9a-f]{40}$/.test(CREA) && CREA !== '0x' + '0'.repeat(40), 'createur de UNIT/ETH LU au hook : ' + CREA);
await rpc('anvil_impersonateAccount', [CREA]); await rpc('anvil_setBalance', [CREA, '0x' + (10n ** 18n).toString(16)]);
const CE = JSON.parse(readFileSync(new URL('./contracts/out/BancMissionsStubs.sol/CibleE.json', import.meta.url), 'utf8'));
const cible = (await envoyer(DEP, null, CE.bytecode.object)).contractAddress.toLowerCase();
const now = parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
const R = 1000n * E18;
const plan = planPoster({ contrat: V3, cle, params: { rewardToken: UNIT_BLOCK, reward: R.toString(), maxDone: 1, perWallet: 1, expiry: now + 7 * 86400, target: cible,
  topic0: keccak256Hex(new TextEncoder().encode('Fait(address)')), descHash: keccak256Hex(new TextEncoder().encode('do it')) }, hold: { minBlock: E18.toString(), window: 86400 }, maintenant: now, poolManager: C.poolManager });
vu(plan.etat === 'PRET', 'planPoster PRET (' + (plan.pourquoi || plan.budget) + ')');
for (const c of plan.appels) { const r = await envoyer(CREA, c.to, c.data); vu(r.status === '0x1', 'createur : ' + c.quoi + ' -> ' + r.status); }
await envoyer(CREA, UNIT_BLOCK, '0xa9059cbb' + adr(JOUEUR) + mot(100n * E18));
const act = await envoyer(JOUEUR, cible, '0x' + sel('faire()'));
const t1 = parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
const held = { heldBlock: (100n * E18).toString(), heldPaired: '0', windowEnd: t1, deadline: t1 + 600 };
const digest = await rpc('eth_call', [{ to: V3, data: '0x' + sel('claimDigest(uint256,address,bytes32,(uint256,uint256,uint64,uint256))') + mot(0) + adr(JOUEUR) + act.transactionHash.slice(2) + mot(held.heldBlock) + mot(0) + mot(held.windowEnd) + mot(held.deadline) }, 'latest']);
const claim = planReclamer({ contrat: V3, taskId: 0, txHash: act.transactionHash, held, signature: signerDigest(CLE, digest) }).appels[0];
const rc = await envoyer(JOUEUR, claim.to, claim.data);
vu(rc.status === '0x1', 'claim (signature JS de la cle de test) : status ' + rc.status);
const du = await lireU(V3, '0x' + sel('devOwed(address)') + adr(UNIT_BLOCK));
vu(du === R * 1000n / 10000n * 7000n / 10000n * 2000n / 10000n, 'devOwed(UNIT) = 1,4 % de R = ' + du + ' (avec rail : la part ATTEND la vente, rien a la reserve a sa place)');

/* (4) le rail vend la part : AVANT tout achat (mesure : la pool UNIT a-t-elle de l ETH en face ?) */
const dev0 = { usdc: await solde(C.usdc, C.devWallet), unit: await solde(UNIT_BLOCK, C.devWallet), pm: await solde(UNIT_BLOCK, C.poolManager) };
const tA = parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
await envoyer(DEP, RAIL, '0x' + sel('arm(address,uint256,uint64)') + adr(UNIT_BLOCK) + mot(1) + mot(tA + 600));
const essai = await rpc('eth_call', [{ from: DEP, to: V3, data: '0x' + sel('convertDevShare(address,uint256,uint256)') + adr(UNIT_BLOCK) + mot(du) + mot(1) }, 'latest']).then(() => 'PASSE', (e) => 'REFUSE ' + String(e.message).slice(0, 140));
console.log('     MESURE vente de ' + du + ' UNIT par le rail, sans achat prealable : ' + essai);
if (essai === 'PASSE') {
  const rv = await envoyer(DEP, V3, '0x' + sel('convertDevShare(address,uint256,uint256)') + adr(UNIT_BLOCK) + mot(du) + mot(1));
  vu(rv.status === '0x1', 'convertDevShare : status 1 (' + parseInt(rv.gasUsed, 16) + ' gas)');
  const gUsdc = await solde(C.usdc, C.devWallet) - dev0.usdc;
  vu(gUsdc > 0n, 'dev wallet +' + gUsdc + ' USDC (6 dec)');
  vu(await solde(UNIT_BLOCK, C.devWallet) === dev0.unit, 'dev wallet : 0 unite de UNIT recue');
  vu(await solde(UNIT_BLOCK, C.poolManager) - dev0.pm >= du, 'les ' + du + ' unites sont DANS le PoolManager (vendues dans la pool)');
  vu(await lireU(V3, '0x' + sel('devOwed(address)') + adr(UNIT_BLOCK)) === 0n, 'devOwed(UNIT) = 0');
} else {
  vu(await lireU(V3, '0x' + sel('devOwed(address)') + adr(UNIT_BLOCK)) === du, 'vente refusee : la part reste DUE (rien perdu), ni au dev ni ailleurs');
}
console.log((ko ? 'ECHEC ' : 'ok ') + 'banc-missions-factory-fork - ' + n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
