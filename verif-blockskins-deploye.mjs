/* verif-blockskins-deploye.mjs — RELIT SUR LA CHAINE le deploiement de BlockSkins v2 signe par Phil, AVANT que son adresse n entre dans
 * contracts/preparer-deploiement-blockskins.mjs (DEPLOYE). Lecture seule : rien n est signe ni envoye.
 * AFFIRME : la transaction existe, n a pas de `to` (creation), ne porte aucune valeur, et son input est EXACTEMENT la donnee figee
 *   (blockskins-deploiement.js, octet pour octet) ; le recu est status 1 et cree une adresse ; ce contrat rend USDC(), FEE_WALLET() du
 *   depot, owner() = l expediteur, MINT_PRICE() = 1 USDC ; son code est present. Imprime les quatre valeurs a recopier dans DEPLOYE.
 * ⛔ Le hash vient de Phil (sa page de deploiement l affiche) : jamais complete de memoire, jamais tronque.
 * Usage : node verif-blockskins-deploye.mjs <hash 0x… de 66 caracteres> [url rpc, defaut https://mainnet.base.org] */
import { BLOCKSKINS_DEPLOIEMENT as D } from './blockskins-deploiement.js';
import { USDC_BASE, FEE_WALLET } from './frais-creation.js';
import { selecteur } from './keccak.js';
const hash = String(process.argv[2] || '').toLowerCase();
const URL_RPC = /^https?:/.test(process.argv[3] || '') ? process.argv[3] : 'https://mainnet.base.org';
if (!/^0x[0-9a-f]{64}$/.test(hash)) { console.log('usage : node verif-blockskins-deploye.mjs <hash complet, 0x + 64 hex>'); process.exit(2); }
let id = 0, ko = 0;
const ok = (c, m) => { console.log((c ? 'ok  ' : 'KO  ') + m); if (!c) ko += 1; return c; };
const rpc = async (method, params) => {
  const r = await (await fetch(URL_RPC, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })).json();
  if (r.error) throw new Error(r.error.message); return r.result;
};
const tx = await rpc('eth_getTransactionByHash', [hash]);
if (!ok(!!tx, 'la transaction existe sur ' + URL_RPC)) process.exit(1);
ok(tx.to === null && BigInt(tx.value) === 0n && Number(tx.chainId) === D.chaine, 'creation de contrat (aucun `to`), aucune valeur, chaine ' + D.chaine);
ok(String(tx.input).toLowerCase() === D.creation.toLowerCase(), 'l input de la tx est EXACTEMENT la donnee figee (' + D.octetsCreation + ' octets, sha256 ' + D.sha256Creation.slice(0, 12) + '…)');
const recu = await rpc('eth_getTransactionReceipt', [hash]);
if (!ok(!!recu && recu.status === '0x1' && /^0x[0-9a-f]{40}$/i.test(String(recu.contractAddress)), 'recu status 1, un contrat est cree')) process.exit(1);
const adr = String(recu.contractAddress).toLowerCase(), de = String(tx.from).toLowerCase(), bloc = parseInt(recu.blockNumber, 16);
const lire = async (sig) => rpc('eth_call', [{ to: adr, data: selecteur(sig) }, 'latest']);
const adrDe = (w) => '0x' + String(w).slice(-40).toLowerCase();
const code = await rpc('eth_getCode', [adr, 'latest']);
ok((code.length - 2) / 2 > 10000, 'code present a ' + adr + ' : ' + (code.length - 2) / 2 + ' octets');
ok(adrDe(await lire('USDC()')) === USDC_BASE.toLowerCase() && adrDe(await lire('FEE_WALLET()')) === FEE_WALLET.toLowerCase(), 'USDC() et FEE_WALLET() sont ceux du depot');
ok(adrDe(await lire('owner()')) === de, 'owner() = l expediteur de la tx (' + de + ')');
/* 2026-10-18 : le prix attendu est celui de l enregistrement (mintPriceUsdc, lu dans la source compilee) — 1 USDC pour v2, 10 USDC pour v3 */
ok(BigInt(await lire('MINT_PRICE()')) === BigInt(D.mintPriceUsdc) && BigInt(await lire('totalSupply()')) >= 0n, 'MINT_PRICE() = ' + D.mintPriceUsdc + ' (l enregistrement v' + D.version + ')');
console.log('\n' + (ko ? ko + ' KO — NE PAS noter cette adresse.' : 'Tout concorde. Pour que l app bascule sur ce contrat : node contracts/noter-deploiement-blockskins.mjs ' + hash)
  + "\n  adresse: '" + adr + "',\n  tx: '" + hash + "',\n  bloc: " + bloc + ",\n  owner: '" + de + "',");
process.exit(ko ? 1 : 0);
