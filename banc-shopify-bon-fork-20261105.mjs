/* banc-shopify-bon-fork-20261105.mjs — le bon de skin Shopify DE BOUT EN BOUT sur un FORK LOCAL de Base (anvil) :
 *   webhook orders/paid (HMAC d un secret de TEST) -> magasin de droits -> corpsBon (la route /api/shopify/bon, cle de TEST)
 *   -> claim() envoye par le wallet de l acheteur -> BlockSkinsVoucher DEPLOYE sur le fork minte.
 * Usage : (cd contracts && forge build --contracts src/BlockSkinsVoucher.sol)
 *         anvil --fork-url https://mainnet.base.org --port 9643
 *         node banc-shopify-bon-fork-20261105.mjs http://127.0.0.1:9643
 * Cles : la cle du SIGNATAIRE des bons et celle d un faux signataire sont TIREES AU HASARD a chaque passage (crypto.randomBytes) :
 *   aucune cle reelle, aucune variable d environnement lue. Les comptes qui envoient sont ceux d anvil (eth_accounts, debloques) ;
 *   leur delegation EIP-7702 de Base mainnet est lue puis effacee SUR LE FORK (voir banc-agent-spend-permission-fork-20261105.mjs).
 * PROUVE : digestBon = voucherDigest du contrat ; claim minte (ownerOf, orderUsed, totalSupply, evenement SkinClaimed) ; REFUS :
 *   rejeu du meme bon, bon utilise par un autre wallet, deadline depassee, mauvais signataire, signataire tourne (setSigner),
 *   et des mutants du calldata/de la signature (recette, block, deadline, s haut, v).
 * NE PROUVE PAS : une vraie boutique Shopify, un vrai webhook, le deploiement reel (Phil seul signe), ni Base mainnet.
 * ⛔ PORTABLE : process.exitCode. */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHmac } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const S = await import(pathToFileURL(path.join(ICI, 'shopify-usdc.js')).href);
const { selecteur, topic } = await import(pathToFileURL(path.join(ICI, 'keccak.js')).href);
const { adresseDe, signerDigest, N } = await import(pathToFileURL(path.join(ICI, 'signeur-secp256k1.js')).href);

const URL_FORK = process.argv[2] || 'http://127.0.0.1:9643';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exitCode = 1; throw new Error('stop'); }
let n = 0, ko = 0, idRpc = 0, mut = 0, mutTues = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const mutant = (tue, m) => { mut += 1; if (tue) mutTues += 1; ok(tue, 'mutant ' + (tue ? 'tue' : 'VIVANT') + ' : ' + m); };
const rpcBrut = async (method, params = []) => fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
const rpc = async (method, params = []) => { const r = await rpcBrut(method, params); if (r.error) throw new Error(method + ': ' + r.error.message); return r.result; };
const hex = (v) => '0x' + BigInt(v).toString(16);
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const sel = (sig) => selecteur(sig).slice(2);
const lire = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
async function recu(h) {
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
const envoyer = async (de, to, data, gas = 3_000_000) => recu(await rpc('eth_sendTransaction', [{ from: de, ...(to ? { to } : {}), data, gas: hex(gas) }]));
const raison = async (de, to, data) => {
  const r = await rpcBrut('eth_call', [{ from: de, to, data, gas: hex(3_000_000) }, 'latest']);
  if (!r.error) return null;
  const d = typeof r.error.data === 'string' ? r.error.data : (r.error.data && r.error.data.data) || '';
  return String(d).slice(0, 10).toLowerCase() || 'revert';
};
const ERR = (s) => selecteur(s).toLowerCase();
const E = { deja: ERR('OrderAlreadyUsed()'), recipient: ERR('NotRecipient()'), expire: ERR('Expired()'), sig: ERR('BadSignature()') };
const cleTest = () => { for (;;) { const k = '0x' + randomBytes(32).toString('hex'); const v = BigInt(k); if (v > 0n && v < N) return k; } };
const maintenantFork = async () => Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));

/* ── 0. fork, comptes ── */
const chaine = parseInt(await rpc('eth_chainId'), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + parseInt(await rpc('eth_blockNumber'), 16));
if (!ok(chaine === S.CHAINE_BASE, 'le fork est Base (' + S.CHAINE_BASE + ', la chaine que corpsBon met dans le domaine)')) { process.exitCode = 1; throw new Error('stop'); }
const [PHIL, ACHETEUR, CURIEUX] = (await rpc('eth_accounts')).slice(0, 3).map((x) => x.toLowerCase());
for (const a of [PHIL, ACHETEUR, CURIEUX]) await rpc('anvil_setCode', [a, '0x']);
ok((await Promise.all([PHIL, ACHETEUR, CURIEUX].map((a) => rpc('eth_getCode', [a, 'latest'])))).every((c) => c === '0x'), 'les 3 comptes de test sont de vrais EOA sur le fork (delegation 7702 effacee sur le fork)');

/* ── 1. deploiement de BlockSkinsVoucher(signer = cle de TEST) ── */
const CLE = cleTest(), FAUSSE = cleTest();
const SIGNER = adresseDe(CLE).toLowerCase();
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'contracts/out/BlockSkinsVoucher.sol/BlockSkinsVoucher.json'), 'utf8'));
const dep = await envoyer(PHIL, null, art.bytecode.object + adrMot(SIGNER), 6_000_000);
if (!ok(dep.status === '0x1', 'BlockSkinsVoucher deploye sur le fork (gaz ' + BigInt(dep.gasUsed) + ')')) { process.exitCode = 1; throw new Error('stop'); }
const C = dep.contractAddress.toLowerCase();
ok(('0x' + String(await lire(C, '0x' + sel('signer()'))).slice(26)) === SIGNER, 'signer() = l adresse de la cle de TEST tiree au hasard');
const supply = async () => BigInt(await lire(C, '0x' + sel('totalSupply()')));

/* ── 2. la commande payee : webhook HMAC (secret de TEST) -> magasin ── */
const env = {
  [S.NOM_SECRET]: 'secret-de-banc-' + randomBytes(8).toString('hex'), [S.NOM_DOMAINE]: 'banc-tblock.myshopify.com', [S.NOM_URL_BOUTIQUE]: 'https://banc-tblock.example',
  [S.NOM_CLE_BON]: CLE, [S.NOM_CONTRAT_BON]: C,
};
const GID = 'gid://shopify/Order/' + (5_000_000_000 + Math.floor(Math.random() * 1e6));
const commande = { admin_graphql_api_id: GID, financial_status: 'paid', test: false, line_items: [{ sku: 'TB-SKIN', quantity: 2, properties: [{ name: 'wallet', value: ACHETEUR }] }] };
const corps = Buffer.from(JSON.stringify(commande));
const magasin = S.creerMagasin();
const w = S.traiterWebhook({ env, magasin, corpsBrut: corps, entetes: {
  'x-shopify-hmac-sha256': createHmac('sha256', env[S.NOM_SECRET]).update(corps).digest('base64'), 'x-shopify-shop-domain': env[S.NOM_DOMAINE],
  'x-shopify-webhook-id': 'wid-' + randomBytes(4).toString('hex'), 'x-shopify-topic': S.SUJET_PAYE } });
ok(w.statut === 200 && w.corps.etat === 'NOTE' && w.corps.droits === 1, 'webhook orders/paid (HMAC de test) : droit de 2 skins NOTE pour le wallet de l acheteur');

const BLOCK = '0x' + 'b1'.repeat(20);   // adresse de banc (le contrat ne lit que != 0)
const RECETTE = [10, 120, 240, 300, 45, 200, 330].reduce((r, h, i) => r | (BigInt(h) << BigInt(9 * i)), 0n);
const bon = async (unite) => S.corpsBon({ env, magasin, commande: GID, adresse: ACHETEUR, block: BLOCK, recipe: RECETTE, unite, maintenantS: await maintenantFork() });

/* ── 3. un bon, son digest compare au contrat, le claim ── */
const b1 = await bon(1);
ok(b1.statut === 200 && b1.corps.ok && String(b1.corps.bon.signer).toLowerCase() === SIGNER, 'corpsBon rend un bon signe (unite 1), signer = cle de TEST');
const m1 = b1.corps.bon.message;
const vd = (m) => '0x' + sel('voucherDigest(address,bytes32,address,uint64,uint64)') + adrMot(m.recipient) + m.orderId.slice(2) + adrMot(m.blockToken) + mot(m.recipe) + mot(m.deadline);
const digestChaine = String(await lire(C, vd(m1))).toLowerCase();
ok(S.digestBon(b1.corps.bon) === digestChaine, 'digestBon(bon) = voucherDigest du contrat deploye : ' + digestChaine.slice(0, 18) + '…');
mutant(S.digestBon({ ...b1.corps.bon, domain: { ...b1.corps.bon.domain, chainId: 1 } }) !== digestChaine, 'digest calcule pour la chaine 1 != voucherDigest');
ok(m1.orderId === S.orderIdDe(GID, 1), 'orderId = keccak("<GID>#1") (orderIdDe)');

const appel = b1.corps.appel;
ok(appel.to === C && appel.data === '0x' + S.encoderClaim(m1, b1.corps.bon.signature).replace(/^0x/, ''), 'appel = claim(...) encode par encoderClaim, vers le contrat');
ok((await raison(CURIEUX, appel.to, appel.data)) === E.recipient, 'REFUS : le bon de l acheteur envoye par un AUTRE wallet -> NotRecipient');
const r1 = await envoyer(ACHETEUR, appel.to, appel.data);
const evSkin = r1.logs.find((l) => l.topics[0] === topic('SkinClaimed(uint256,address,bytes32,address,uint64)'));
ok(r1.status === '0x1' && ('0x' + String(await lire(C, '0x' + sel('ownerOf(uint256)') + mot(1))).slice(26)) === ACHETEUR
  && BigInt(await lire(C, '0x' + sel('orderUsed(bytes32)') + m1.orderId.slice(2))) === 1n && (await supply()) === 1n && !!evSkin && evSkin.topics[3] === m1.orderId,
  'claim par l acheteur MINTE : ownerOf(1) = acheteur, orderUsed = 1, totalSupply = 1, SkinClaimed(orderId) (gaz ' + BigInt(r1.gasUsed) + ')');
const uri = String(await lire(C, '0x' + sel('tokenURI(uint256)') + mot(1)));
const texte = Buffer.from(uri.slice(2 + 128), 'hex').toString('utf8').replace(/\0+$/, '');
ok(texte.startsWith('data:application/json;base64,') && JSON.parse(Buffer.from(texte.split(',')[1], 'base64').toString('utf8')).hues.join() === '10,120,240,300,45,200,330', 'tokenURI(1) : JSON on-chain, les 7 teintes de la recette');

/* ── 4. les refus demandes ── */
ok((await raison(ACHETEUR, appel.to, appel.data)) === E.deja, 'REFUS : rejeu du MEME bon -> OrderAlreadyUsed');
const rr = await envoyer(ACHETEUR, appel.to, appel.data);
ok(rr.status === '0x0' && (await supply()) === 1n, 'le rejeu ENVOYE echoue (status 0), totalSupply reste 1');

const b2 = await bon(2);
const m2 = b2.corps.bon.message;
ok((await raison(ACHETEUR, b2.corps.appel.to, b2.corps.appel.data)) === null, 'temoin : le bon de l unite 2, encore dans les temps, passerait (eth_call)');
await rpc('evm_increaseTime', [S.DUREE_BON_S + 1]); await rpc('evm_mine', []);
ok((await raison(ACHETEUR, b2.corps.appel.to, b2.corps.appel.data)) === E.expire, 'REFUS : deadline depassee (+' + (S.DUREE_BON_S + 1) + ' s) -> Expired');

const b3 = await bon(2);   // un bon neuf pour l unite 2, apres l avance du temps
const m3 = b3.corps.bon.message;
const sigFausse = signerDigest(FAUSSE, S.digestBon(b3.corps.bon));
ok((await raison(ACHETEUR, C, '0x' + S.encoderClaim(m3, sigFausse).replace(/^0x/, ''))) === E.sig, 'REFUS : meme bon signe par une AUTRE cle -> BadSignature');
ok((await raison(ACHETEUR, b3.corps.appel.to, b3.corps.appel.data)) === null, 'temoin : le bon neuf signe par la bonne cle passerait (eth_call)');

/* mutants du calldata et de la signature, chacun joue contre le contrat */
const sig3 = b3.corps.bon.signature;
const claimDe = (m, s) => '0x' + S.encoderClaim(m, s).replace(/^0x/, '');
mutant((await raison(ACHETEUR, C, claimDe({ ...m3, recipe: String(BigInt(m3.recipe) ^ 1n) }, sig3))) === E.sig, 'recette changee d un bit -> BadSignature');
mutant((await raison(ACHETEUR, C, claimDe({ ...m3, blockToken: '0x' + 'b2'.repeat(20) }, sig3))) === E.sig, 'block remplace -> BadSignature');
mutant((await raison(ACHETEUR, C, claimDe({ ...m3, deadline: String(BigInt(m3.deadline) + 86400n) }, sig3))) === E.sig, 'deadline prolongee d un jour -> BadSignature');
mutant((await raison(ACHETEUR, C, claimDe({ ...m3, orderId: S.orderIdDe(GID, 1) }, sig3))) !== null, 'orderId de l unite 1 (deja mintee) -> refuse');
{
  const r = sig3.slice(2, 66), s = BigInt('0x' + sig3.slice(66, 130)), v = parseInt(sig3.slice(130, 132), 16);
  const sHaut = '0x' + r + (N - s).toString(16).padStart(64, '0') + (v === 27 ? '1c' : '1b');
  mutant((await raison(ACHETEUR, C, claimDe(m3, sHaut))) === E.sig, 'signature malleable (s haut, v inverse) -> BadSignature (EIP-2)');
  mutant((await raison(ACHETEUR, C, claimDe(m3, '0x' + r + sig3.slice(66, 130) + (v === 27 ? '1c' : '1b')))) === E.sig, 'v inverse seul -> BadSignature');
}

/* rotation du signataire : l ancien bon meurt */
const NOUVEAU = adresseDe(cleTest()).toLowerCase();
ok((await raison(CURIEUX, C, '0x' + sel('setSigner(address)') + adrMot(NOUVEAU))) !== null, 'setSigner par un autre que le owner -> refuse');
ok((await envoyer(PHIL, C, '0x' + sel('setSigner(address)') + adrMot(NOUVEAU))).status === '0x1', 'setSigner par le owner (deployeur) : cle tournee');
ok((await raison(ACHETEUR, b3.corps.appel.to, b3.corps.appel.data)) === E.sig, 'REFUS : apres rotation, un bon de l ancienne cle -> BadSignature');
ok((await supply()) === 1n, 'au total : 1 skin minte, aucun autre');

console.log((ko ? 'ECHEC ' : 'OK ') + (n - ko) + '/' + n + ', mutants ' + mutTues + '/' + mut + ' tues'
  + ' - NE PROUVE PAS une vraie boutique, un vrai webhook, ni le deploiement reel');
if (ko) process.exitCode = 1;
