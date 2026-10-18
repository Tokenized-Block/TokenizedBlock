/* banc-deployer-blockrolls-fork-20261018.mjs — LA DONNEE FIGEE QUE PHIL SIGNERA, envoyee TELLE QUELLE sur un fork de Base, puis relue.
 * Usage : (cd contracts && forge build && node preparer-deploiement-blockrolls.mjs) ;
 *         "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://mainnet.base.org --port 9619
 *         node banc-deployer-blockrolls-fork-20261018.mjs [http://127.0.0.1:9619]
 * CE QUE LE BANC FAIT : un compte impersonne envoie { data: D.creation } sans `to` (exactement ce que la page envoie) ; le contrat cree est
 *   relu avec les MEMES lectures que la page (USDC, DEV_WALLET, HOOK, UNIT_POOL_ID, ROLL_PRICE, PASS_PRICE, unitCreator, currentRules) et
 *   chaque valeur est comparee a l enregistrement ; unitCreator() est compare au vrai hook ; puis l etape « Fund the pot » de la page
 *   (approve EXACT + fund 50) avec de l USDC reel, et pot() relu.
 * ⛔ FORK LOCAL SEULEMENT, aucune cle, rien n est envoye a Base. Ne prouve ni un vrai wallet ni le deploiement reel. */
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { BLOCKROLLS_DEPLOIEMENT as D } from './blockrolls-deploiement.js';
import { verifierEnregistrement } from './blockrolls-config.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { selecteur } from './keccak.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9619';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exit(1); }
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpc = async (method, params = []) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + r.error.message);
  return r.result;
};
const C = D.constructeur;
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const appel = async (to, sig, args = '') => String(await rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']));
const lireAdr = async (to, sig) => ('0x' + (await appel(to, sig)).slice(-40)).toLowerCase();
const lireU = async (to, sig, args = '') => BigInt(await appel(to, sig, args));
async function recu(h) {
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
const envoyer = async (de, tx, gas = 600000) => recu(await rpc('eth_sendTransaction', [{ from: de, ...(tx.to ? { to: tx.to } : {}), data: tx.data || '0x', gas: hex(gas) }]));
const compte = async (a) => { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, hex(10n ** 18n)]); return a; };

const chaine = parseInt(await rpc('eth_chainId'), 16), tete = parseInt(await rpc('eth_blockNumber'), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453 && chaine === D.chaine, 'le fork est Base (8453), la chaine de l enregistrement')) process.exit(1);
const v = verifierEnregistrement(D, crypto.createHash('sha256').update(Buffer.from(D.creation.slice(2), 'hex')).digest('hex'));
if (!ok(v.intacte, 'l enregistrement passe la verification de la page (' + (v.pourquoi.join('; ') || 'intact') + ')')) process.exit(1);
/* la donnee figee est bien le bytecode COMPILE + le Config : si forge a recompile depuis, le preparateur doit etre relance */
const art = JSON.parse(readFileSync(new URL('./contracts/out/BlockRolls.sol/BlockRolls.json', import.meta.url), 'utf8'));
ok(D.creation.startsWith(String(art.bytecode.object)), 'la donnee figee commence par le bytecode compile present dans contracts/out (sinon : relancer le preparateur)');

const phil = await compte('0x00000000000000000000000000000000de9107e4');
const d = await envoyer(phil, { data: D.creation }, 3_000_000);
if (!ok(d.status === '0x1' && /^0x[0-9a-f]{40}$/i.test(String(d.contractAddress)), 'la donnee figee, envoyee TELLE QUELLE sans `to`, cree le contrat (gaz ' + BigInt(d.gasUsed) + ')')) process.exit(1);
const A = String(d.contractAddress).toLowerCase();
console.log('contrat ' + A + ' · bloc ' + parseInt(d.blockNumber, 16));
/* les MEMES lectures que la page */
const relu = { usdc: await lireAdr(A, 'USDC()'), devWallet: await lireAdr(A, 'DEV_WALLET()'), hook: await lireAdr(A, 'HOOK()'), unitPoolId: (await appel(A, 'UNIT_POOL_ID()')).toLowerCase(),
  rollPrice: (await lireU(A, 'ROLL_PRICE()')).toString(), passPrice: (await lireU(A, 'PASS_PRICE()')).toString() };
for (const k of Object.keys(relu)) ok(relu[k] === String(C[k]).toLowerCase(), 'relu ' + k + '() = ' + relu[k] + ' = l enregistrement');
ok((await lireU(A, 'PASS_ROLLS()')).toString() === String(C.passRolls) && (await lireU(A, 'PASS_WINDOW()')).toString() === String(C.passWindow) && (await lireU(A, 'POT_SHARE_BPS()')).toString() === String(C.potShareBps),
  'relu PASS_ROLLS / PASS_WINDOW / POT_SHARE_BPS = ' + C.passRolls + ' / ' + C.passWindow + ' / ' + C.potShareBps);
const regles = (await appel(A, 'currentRules()')).slice(2).match(/.{64}/g).map((w) => BigInt('0x' + w).toString());
ok(regles.join() === [C.prize5, C.prize4, C.prize3, C.minScore].map(String).join(), 'relu currentRules() = ' + regles.join(' / ') + ' = l enregistrement');
const createur = await lireAdr(A, 'unitCreator()');
const auHook = ('0x' + (await appel(C.hook, 'createurs(bytes32)', C.unitPoolId.slice(2))).slice(26, 66)).toLowerCase();
ok(/^0x[0-9a-f]{40}$/.test(createur) && !/^0x0{40}$/.test(createur) && createur === auHook, 'relu unitCreator() = ' + createur + ' = createurs(poolId) du VRAI hook 7030 du fork');
ok((await lireU(A, 'pot()')) === 0n && (await lireU(A, 'rollCount()')) === 0n && (await lireU(A, 'rulesVersion()')) === 1n, 'etat initial : pot 0, 0 roll, regles version 1');

/* l etape « Fund the pot » de la page : approve EXACT + fund 50, avec de l USDC reel pris a une pool du fork */
const USDC = C.usdc;
const pools = [...POOLS_ACTIONS_AERODROME.values()].map((t) => t.pool).filter(Boolean);
let source = null;
for (const p of pools) { if ((await lireU(USDC, 'balanceOf(address)', adrMot(p))) >= 100_000_000n) { source = p.toLowerCase(); break; } }
if (ok(!!source, 'une pool du fork tient >= 100 USDC reels (source ' + source + ')')) {
  await compte(source);
  ok((await envoyer(source, { to: USDC, data: selecteur('transfer(address,uint256)') + adrMot(phil) + mot(50_000_000n) })).status === '0x1', '50 USDC reels au signataire (impersonne)');
  const FONDS = 50_000_000n;
  const r1 = await envoyer(phil, { to: USDC, data: selecteur('approve(address,uint256)') + adrMot(A) + mot(FONDS) });
  const r2 = await envoyer(phil, { to: A, data: selecteur('fund(uint256)') + mot(FONDS) });
  ok(r1.status === '0x1' && r2.status === '0x1' && (await lireU(A, 'pot()')) === FONDS && (await lireU(USDC, 'balanceOf(address)', adrMot(A))) === FONDS,
    'Fund the pot : approve EXACT 50 + fund 50 -> pot() = 50 USDC = balanceOf(contrat) (gaz fund ' + BigInt(r2.gasUsed) + ')');
  ok((await lireU(USDC, 'allowance(address,address)', adrMot(phil) + adrMot(A))) === 0n, 'l approbation est consommee : rien ne reste approuve');
}
console.log((ko ? 'ECHEC ' : 'ok ') + 'banc-deployer-blockrolls-fork - ' + n + ' assertions, ' + ko + ' KO ; fork Base, compte impersonne, rien de signe');
process.exit(ko ? 1 : 0);
