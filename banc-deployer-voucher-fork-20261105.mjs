/* banc-deployer-voucher-fork-20261105.mjs — ce que deployer-voucher.html enverrait, ENVOYE sur un FORK LOCAL de Base (anvil), depuis un
 * compte de test : les MEMES fonctions que la page (voucher-config.js creationAvec / verifierFiche / verifierRelecture, envoi-creation.js
 * creerEnvoiCreation) avec, pour wallet, un adaptateur `request` vers le fork. Rien n est envoye a Base.
 * Usage : (cd contracts && forge build --contracts src/BlockSkinsVoucher.sol && node preparer-deploiement-voucher.mjs)
 *         anvil --fork-url https://mainnet.base.org --port <libre>  puis  node banc-deployer-voucher-fork-20261105.mjs http://127.0.0.1:<port>
 * PROUVE (sur le fork) : la tx envoyee porte EXACTEMENT creationAvec(fiche, signataire) ; le code deploye = runtime de l artefact forge
 *   (keccak, relu aussi dans l artefact) ; signer(), owner(), pendingOwner(), totalSupply(), domainSeparator() relus = attendus ; un bon
 *   signe par la cle du signataire colle minte sur CE contrat (shopify-usdc.js) ; un 2e envoi est bloque. TEMOINS : wallet sur une autre
 *   chaine -> rien n est envoye ; adresse de signataire invalide -> aucune donnee construite. MUTANTS : relectures falsifiees, contrat
 *   deploye avec un AUTRE signataire que celui colle.
 * NE PROUVE PAS : la page dans un vrai navigateur avec un vrai wallet, ni le deploiement reel (Phil seul signe), ni Base mainnet.
 * ⛔ PORTABLE : process.exitCode. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const { VOUCHER_DEPLOIEMENT: D } = await imp('voucher-deploiement.js');
const V = await imp('voucher-config.js');
const { creerEnvoiCreation } = await imp('envoi-creation.js');
const { keccak256Hex } = await imp('keccak.js');
const { adresseDe, signerDigest, N } = await imp('signeur-secp256k1.js');
const S = await imp('shopify-usdc.js');

const URL_FORK = process.argv[2] || 'http://127.0.0.1:9651';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exitCode = 1; throw new Error('stop'); }
let n = 0, ko = 0, idRpc = 0, mut = 0, mutTues = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const mutant = (tue, m) => { mut += 1; if (tue) mutTues += 1; ok(tue, 'mutant ' + (tue ? 'tue' : 'VIVANT') + ' : ' + m); };
const rpc = async (method, params = []) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(method + ': ' + r.error.message); e.code = r.error.code; throw e; }
  return r.result;
};
const octets = (h) => Buffer.from(String(h).replace(/^0x/, ''), 'hex');
const cleTest = () => { for (;;) { const k = '0x' + crypto.randomBytes(32).toString('hex'); const v = BigInt(k); if (v > 0n && v < N) return k; } };
const stock = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
/* le « wallet » : un adaptateur request() vers le fork, qui COMPTE les eth_sendTransaction */
const wallet = (surcharge = {}) => {
  const w = { envois: 0, request: async ({ method, params }) => {
    if (surcharge[method]) return surcharge[method](params);
    if (method === 'eth_sendTransaction') w.envois += 1;
    return rpc(method, params || []);
  } };
  return w;
};
const lireTout = async (a) => { const lu = {}; for (const [nom, data] of V.LECTURES) lu[nom] = await rpc('eth_call', [{ to: a, data }, 'latest']); return lu; };

/* ── 0. le fork, le compte de test ── */
const chaine = parseInt(await rpc('eth_chainId'), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + parseInt(await rpc('eth_blockNumber'), 16));
if (!ok(chaine === 8453, 'le fork est Base (8453)')) { process.exitCode = 1; throw new Error('stop'); }
const [PHIL, AUTRE] = (await rpc('eth_accounts')).slice(0, 2).map((x) => x.toLowerCase());
/* les comptes de test anvil portent une delegation EIP-7702 sur Base mainnet (constat du 2026-11-05) : effacee SUR LE FORK */
for (const a of [PHIL, AUTRE]) await rpc('anvil_setCode', [a, '0x']);
ok((await rpc('eth_getCode', [PHIL, 'latest'])) === '0x', 'le compte de test qui deploie est un vrai EOA sur le fork');

/* ── 1. la fiche, verifiee comme dans la page ── */
const sha = crypto.createHash('sha256').update(octets(D.code)).digest('hex');
ok(V.verifierFiche(D, sha).intacte, 'verifierFiche : empreinte sha256 du code recalculee, fiche intacte');
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'contracts/out/BlockSkinsVoucher.sol/BlockSkinsVoucher.json'), 'utf8'));
ok(String(art.bytecode.object).toLowerCase() === D.code && keccak256Hex(octets(art.deployedBytecode.object)) === D.keccakRuntime, 'la fiche = l artefact forge (code de creation identique, keccak du runtime identique)');

/* ── 2. TEMOINS : signataire invalide -> aucune donnee ; autre chaine -> rien n est envoye ── */
const CLE = cleTest(), SIGNER = adresseDe(CLE).toLowerCase();
for (const [t, attendu] of [['', 'paste'], ['0x1234', 'whole address'], ['0x' + '0'.repeat(40), 'zero'], [SIGNER.slice(0, 41), 'whole address'],
  [V.checksum(SIGNER).replace(/[a-f]/, (c) => c.toUpperCase()), 'checksum'], [PHIL, 'dedicated']]) {
  const v = V.validerSignataire(t, { deployeur: PHIL });
  let jete = t === PHIL; /* le deployeur est une adresse valide pour creationAvec : seule la page (validerSignataire avec deployeur) le refuse */
  if (!jete) { try { V.creationAvec(D, t); } catch (_) { jete = true; } }
  ok(!v.ok && String(v.pourquoi).includes(attendu) && jete, 'TEMOIN signataire refuse « ' + (t || '(vide)').slice(0, 14) + '… » : ' + v.pourquoi);
}
ok(V.validerSignataire(V.checksum(SIGNER), { deployeur: PHIL }).ok && V.validerSignataire(SIGNER.toUpperCase().replace('0X', '0x'), { deployeur: PHIL }).ok, 'le checksum EIP-55 juste et la casse unique sont acceptes');
const creation = V.creationAvec(D, SIGNER);
ok(creation === D.code + SIGNER.slice(2).padStart(64, '0'), 'creationAvec = code fige + abi.encode(signer)');
{
  const w = wallet({ eth_chainId: async () => '0x1', wallet_switchEthereumChain: async () => { throw Object.assign(new Error('rejected'), { code: 4001 }); } });
  const r = await creerEnvoiCreation({ eth: () => w, chaineHex: '0x2105', creation, cle: 'k', stockage: stock(), pasMs: 0 }).envoyer(PHIL);
  ok(r.etat === 'PAS_BASE' && w.envois === 0, 'TEMOIN wallet sur Ethereum (0x1) qui refuse de changer -> PAS_BASE, 0 envoi');
  const w2 = wallet({ eth_chainId: async () => '0x1', wallet_switchEthereumChain: async () => null });
  const r2 = await creerEnvoiCreation({ eth: () => w2, chaineHex: '0x2105', creation, cle: 'k', stockage: stock(), pasMs: 0 }).envoyer(PHIL);
  ok(r2.etat === 'PAS_BASE' && w2.envois === 0, 'TEMOIN wallet qui dit oui au changement mais reste sur 0x1 -> PAS_BASE, 0 envoi (eth_chainId relu)');
}

/* ── 3. l envoi de la page, sur le fork ── */
const w = wallet();
const E = creerEnvoiCreation({ eth: () => w, chaineHex: '0x2105', creation, cle: 'tb.deploy.' + D.contrat + '.' + D.sha256Code, stockage: stock(), pasMs: 50 });
const r = await E.envoyer(PHIL);
if (!ok(r.etat === 'CONFIRME' && w.envois === 1, 'envoyer() : CONFIRME, 1 seul eth_sendTransaction (gaz ' + (r.recu ? BigInt(r.recu.gasUsed) : '?') + ')')) { process.exitCode = 1; throw new Error('stop'); }
const tx = await rpc('eth_getTransactionByHash', [r.tx]);
ok(String(tx.input).toLowerCase() === creation && !tx.to && BigInt(tx.value) === 0n && tx.from.toLowerCase() === PHIL, 'la tx porte EXACTEMENT les octets de creationAvec (' + (creation.length - 2) / 2 + ' octets), sans `to`, valeur 0, depuis le compte connecte');
const A = String(r.recu.contractAddress).toLowerCase();
const code = await rpc('eth_getCode', [A, 'latest']);
ok(keccak256Hex(octets(code)) === D.keccakRuntime && String(code).toLowerCase() === String(art.deployedBytecode.object).toLowerCase(), 'code deploye = runtime de l artefact, octet pour octet (' + (code.length - 2) / 2 + ' octets)');
const lu = await lireTout(A);
const rel = V.verifierRelecture(D, { adresse: A, code, lu, signataire: SIGNER, deployeur: PHIL });
ok(rel.bon, 'verifierRelecture : signer() = colle, owner() = deployeur, pendingOwner() = 0, totalSupply() = 0, domainSeparator() recalcule' + (rel.ecarts.length ? ' -- ' + rel.ecarts.join('; ') : ''));
ok(V.variablesEnv(A, SIGNER)[0] === 'SHOPIFY_VOUCHER_CONTRACT=' + A && !V.variablesEnv(A, SIGNER).join('').includes(CLE.slice(2)), 'variablesEnv : SHOPIFY_VOUCHER_CONTRACT = l adresse du RECU ; la cle n y figure jamais');
const r2 = await E.envoyer(PHIL);
ok(r2.etat === 'DEJA_ENVOYE' && w.envois === 1, 'un 2e appui : DEJA_ENVOYE, aucun 2e envoi');

/* le contrat deploye par la page sert vraiment : un bon signe par la cle du signataire colle minte (chemin de shopify-usdc.js) */
{
  const now = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp));
  const d = S.donneesBon({ chainId: 8453, contrat: A, recipient: AUTRE, orderId: S.orderIdDe('gid://shopify/Order/1', 1), blockToken: '0x' + 'b1'.repeat(20), recipe: 0, deadline: now + 600 });
  const h = await rpc('eth_sendTransaction', [{ from: AUTRE, to: A, data: '0x' + S.encoderClaim(d.message, signerDigest(CLE, S.digestBon(d))).replace(/^0x/, '') }]);
  let rc = null; for (let i = 0; i < 50 && !rc; i += 1) { rc = await rpc('eth_getTransactionReceipt', [h]); if (!rc) await new Promise((o) => setTimeout(o, 100)); }
  ok(rc && rc.status === '0x1' && BigInt(await rpc('eth_call', [{ to: A, data: V.LECTURES.find((x) => x[0] === 'totalSupply()')[1] }, 'latest'])) === 1n, 'un bon signe par la cle du signataire colle minte sur le contrat deploye (totalSupply 1)');
}

/* ── 4. MUTANTS : chaque ecart doit etre vu par la relecture ── */
const muter = (cle, v) => V.verifierRelecture(D, { adresse: A, code, lu: { ...lu, [cle]: v }, signataire: SIGNER, deployeur: PHIL });
const motAdr = (a) => '0x' + String(a).slice(2).padStart(64, '0');
mutant(!muter('signer()', motAdr(AUTRE)).bon, 'signer() relu = une autre adresse');
mutant(!muter('owner()', motAdr(AUTRE)).bon, 'owner() relu = un autre wallet');
mutant(!muter('pendingOwner()', motAdr(AUTRE)).bon, 'pendingOwner() non vide');
mutant(!muter('totalSupply()', '0x' + '1'.padStart(64, '0')).bon, 'totalSupply() = 1');
mutant(!muter('domainSeparator()', V.separateurAttendu(AUTRE)).bon, 'domainSeparator() d une autre adresse');
mutant(!V.verifierRelecture(D, { adresse: A, code: code.slice(0, -2) + (code.slice(-2) === '00' ? '01' : '00'), lu, signataire: SIGNER, deployeur: PHIL }).bon, 'code deploye different d un octet');
mutant(!V.verifierRelecture(D, { adresse: A, code: '0x', lu, signataire: SIGNER, deployeur: PHIL }).bon, 'aucun code a l adresse');
const codeMute = D.code.slice(0, -2) + (D.code.slice(-2) === '00' ? '01' : '00'); /* l empreinte est RECALCULEE sur le code mute, comme la page le ferait */
mutant(!V.verifierFiche({ ...D, code: codeMute }, crypto.createHash('sha256').update(octets(codeMute)).digest('hex')).intacte && !V.verifierFiche({ ...D, chaine: 1 }, sha).intacte && !V.verifierFiche({ ...D, adresse: A }, sha).intacte, 'fiche alteree (un octet / autre chaine / deja deployee) refusee');
{
  /* un VRAI contrat deploye avec un AUTRE signataire que celui colle : la relecture le refuse */
  const AUTRE_SIGNER = adresseDe(cleTest()).toLowerCase();
  const w3 = wallet();
  const r3 = await creerEnvoiCreation({ eth: () => w3, chaineHex: '0x2105', creation: V.creationAvec(D, AUTRE_SIGNER), cle: 'k3', stockage: stock(), pasMs: 50 }).envoyer(PHIL);
  const A3 = String(r3.recu.contractAddress).toLowerCase();
  const v3 = V.verifierRelecture(D, { adresse: A3, code: await rpc('eth_getCode', [A3, 'latest']), lu: await lireTout(A3), signataire: SIGNER, deployeur: PHIL });
  mutant(!v3.bon && v3.ecarts.includes('signer() differs') && v3.ecarts.length === 1, 'contrat reel deploye avec un autre signataire que celui colle -> seul « signer() differs »');
  const v4 = V.verifierRelecture(D, { adresse: A3, code: await rpc('eth_getCode', [A3, 'latest']), lu: await lireTout(A3), signataire: AUTRE_SIGNER, deployeur: AUTRE });
  mutant(!v4.bon && v4.ecarts.includes('owner() is not the deploying wallet'), 'relu comme si un autre wallet avait deploye -> « owner() is not the deploying wallet »');
}
console.log((ko ? 'ECHEC ' : 'OK ') + (n - ko) + '/' + n + ', mutants ' + mutTues + '/' + mut + ' tues'
  + ' - NE PROUVE PAS la page dans un navigateur avec un vrai wallet, ni le deploiement reel');
if (ko) process.exitCode = 1;
