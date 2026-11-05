/* banc-essai-autonome-fork-20261105.mjs — la page d essai (essai-autonome.js, le MEME code que essai-autonome.html) jouee de bout
 * en bout CONTRE LE VRAI SpendPermissionManager et la VRAIE factory Coinbase Smart Wallet, sur un FORK LOCAL de Base (anvil).
 * Rien n est envoye a Base.
 *
 * Usage : anvil --fork-url https://mainnet.base.org --port <p> --config-out <fichier.json>
 *         node banc-essai-autonome-fork-20261105.mjs http://127.0.0.1:<p> <fichier.json>
 *         node banc-essai-autonome-fork-20261105.mjs http://127.0.0.1:<p> <fichier.json> --servir <port>
 *           -> pas d assertions : sert essai-autonome.html sur 127.0.0.1:<port> avec un provider de TEST relaye vers le fork,
 *              pour cliquer la page dans un navigateur. La page n accepte ce provider que sur 127.0.0.1 / localhost.
 *   Les cles viennent du --config-out d anvil (cles de TEST publiques) et ne signent QUE sur ce fork.
 *
 * LE PROVIDER DE TEST (fournisseurFork) joue le role du wallet :
 *   - universel = un smart wallet cree par la VRAIE factory v1.1 (owner = compte anvil #0) ; le SpendPermissionManager y est
 *     ajoute comme owner par le owner (⛔ ce que fait un vrai Base Account n est PAS prouve ici : la page le LIT) ;
 *   - wallet_addSubAccount {version:'1', account:{type:'create'}} -> un second smart wallet, owners = [universel, compte anvil #1]
 *     (le #1 tient le role de la CryptoKey du navigateur) ;
 *   - eth_signTypedData_v4 : relit le typedData RECU, redemande getHash au contrat avec SON propre encodeur, signe
 *     replaySafeHash(getHash) avec la cle du owner, rend SignatureWrapper(0, sig) ;
 *   - wallet_sendCalls : execute(to, 0, data) du wallet `from`, envoye par son owner EOA, avec EXACTEMENT les octets recus ;
 *   - le reste (eth_call, eth_getCode...) est relaye au fork.
 * CE QUE LE BANC PROUVE : les etapes 1 a 6 de la page, les octets qu elle construit, les relectures on-chain, et ses arrets
 *   (SpendPermissionManager pas owner, code vide, delegation 7702, mauvaise chaine, 4100, 4001, wallet qui ment sur le statut).
 * NE PROUVE PAS : le vrai SDK, le popup, une signature passkey (WebAuthn / ERC-6492), un vrai sub account (userOp 4337 via
 *   wallet_prepareCalls ; ⛔ un bundle 4337 a un recu status 0x1 meme si l appel interne revert — d ou les relectures), qui paie
 *   le gas du sub account. ⛔ PORTABLE : process.exitCode. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (m) => import(pathToFileURL(path.join(ICI, m)).href);
const E = await imp('essai-autonome.js');
const A = await imp('agent-autonome.js');
const { selecteur } = await imp('keccak.js');
const { adresseDe, signerDigest } = await imp('signeur-secp256k1.js');
const F = await imp('frais-creation.js');
const { POOLS_ACTIONS_AERODROME } = await imp('pools-actions-aerodrome.js');

const URL_FORK = process.argv[2] || '';
const CONFIG = process.argv[3];
const iServir = process.argv.indexOf('--servir');
const PORT_SERVI = iServir > 0 ? Number(process.argv[iServir + 1]) : null;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exitCode = 1; throw new Error('stop'); }
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpcBrut = async (method, params = []) => fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
const rpc = async (method, params = []) => { const r = await rpcBrut(method, params); if (r.error) throw Object.assign(new Error(method + ': ' + r.error.message), r.error); return r.result; };
const SPM = A.SPEND_PERMISSION_MANAGER.toLowerCase();
const FACTORY = '0xba5ed110efdba3d005bfc882d75358acbbb85842';   // README github.com/coinbase/smart-wallet (lu par le banc du 2026-11-05)
const USDC = F.USDC_BASE.toLowerCase();
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const sel = (sig) => selecteur(sig).slice(2);
const octets = (h) => { const d = String(h).slice(2); return mot(d.length / 2) + d.padEnd(Math.ceil(d.length / 64) * 64, '0'); };
const lire = (to, data, from) => rpc('eth_call', [from ? { from, to, data } : { to, data }, 'latest']);
const soldeUsdc = async (q) => BigInt(await lire(USDC, '0x' + sel('balanceOf(address)') + adrMot(q)));
const recu = async (h) => { for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 100)); } throw new Error('no receipt ' + h); };
const envoyerTx = async (de, to, data, gas = 2_000_000) => recu(await rpc('eth_sendTransaction', [{ from: de, to, data, gas: hex(gas) }]));
const aleaNonce = () => BigInt('0x' + [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, '0')).join(''));
const execWallet = (to, data) => '0x' + sel('execute(address,uint256,bytes)') + adrMot(to) + mot(0) + mot(0x60) + octets(data);
/* (bytes[] owners, uint256 nonce), chaque owner = abi.encode(address) */
const ownersEnc = (adrs, nonce) => { const k = adrs.length; let offs = '', corps = ''; adrs.forEach((a, i) => { offs += mot(k * 32 + i * 64); corps += mot(32) + adrMot(a); }); return mot(0x40) + mot(nonce) + mot(k) + offs + corps; };
/* MON encodeur du tuple SpendPermission (independant de agent-autonome.js) */
const tupleEnc = (m) => adrMot(m.account) + adrMot(m.spender) + adrMot(m.token) + mot(m.allowance) + mot(m.period) + mot(m.start) + mot(m.end) + mot(m.salt) + mot(9 * 32) + octets(m.extraData);
const lireBoolSpm = async (nom, m) => BigInt(await lire(SPM, '0x' + sel(nom + '((address,address,address,uint160,uint48,uint48,uint48,uint256,bytes))') + mot(0x20) + tupleEnc(m))) === 1n;

/* ── 0. fork, comptes ── */
const chaine = parseInt(await rpc('eth_chainId'), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + parseInt(await rpc('eth_blockNumber'), 16));
if (!ok(chaine === 8453, 'le fork est Base (8453)')) { process.exitCode = 1; throw new Error('stop'); }
const comptes = (await rpc('eth_accounts')).map((x) => x.toLowerCase());
const cles = CONFIG ? JSON.parse(fs.readFileSync(CONFIG, 'utf8')).private_keys : [];
ok(cles.length >= 3 && [0, 1, 2].every((i) => adresseDe(cles[i]).toLowerCase() === comptes[i]), 'les cles de TEST d anvil (--config-out) donnent les adresses de eth_accounts');
const [OWNER, SUBKEY, TIERS] = comptes;
const CLE_DE = { [OWNER]: cles[0], [SUBKEY]: cles[1] };
/* les comptes de test anvil portent une delegation EIP-7702 sur Base (constat du banc du 2026-11-05) : effacee SUR LE FORK */
for (const a of [OWNER, SUBKEY, TIERS]) await rpc('anvil_setCode', [a, '0x']);

async function creerWallet(adrs) {
  const enc = ownersEnc(adrs, aleaNonce());
  const w = ('0x' + String(await lire(FACTORY, '0x' + sel('getAddress(bytes[],uint256)') + enc)).slice(26)).toLowerCase();
  const r = await envoyerTx(OWNER, FACTORY, '0x' + sel('createAccount(bytes[],uint256)') + enc);
  if (r.status !== '0x1') throw new Error('createAccount failed');
  return w;
}
let source = null;
for (const t of POOLS_ACTIONS_AERODROME.values()) { if (t.pool && (await soldeUsdc(t.pool)) >= 100_000_000n) { source = t.pool.toLowerCase(); break; } }
ok(!!source, 'une pool du fork tient >= 100 USDC (source ' + source + ')');
await rpc('anvil_impersonateAccount', [source]); await rpc('anvil_setBalance', [source, hex(10n ** 18n)]);
const crediter = async (q, v) => (await envoyerTx(source, USDC, '0x' + sel('transfer(address,uint256)') + adrMot(q) + mot(v))).status === '0x1';

/** Un universel neuf : smart wallet, 5 USDC, SpendPermissionManager owner (sauf `sansSpm`). */
async function universelNeuf({ sansSpm = false } = {}) {
  const u = await creerWallet([OWNER]);
  await crediter(u, 5_000_000n);
  if (!sansSpm) await envoyerTx(OWNER, u, '0x' + sel('addOwnerAddress(address)') + adrMot(SPM));
  return u;
}

/* ── LE PROVIDER DE TEST ── */
function fournisseurFork({ universel, chainIdForce = null, refus4100 = false, refuseSignature = false }) {
  const journal = [];          // toutes les requetes recues, telles quelles
  const envois = new Map();    // id -> { hash, from, to, data }
  let sousCompte = null;
  const proprio = (from) => (String(from).toLowerCase() === universel ? OWNER : sousCompte && String(from).toLowerCase() === sousCompte ? SUBKEY : null);
  const erreur = (code, message) => Object.assign(new Error(message), { code });
  const request = async ({ method, params = [] }) => {
    journal.push({ method, params: JSON.parse(JSON.stringify(params)) });
    switch (method) {
      case 'eth_requestAccounts': case 'eth_accounts': return [universel];
      case 'eth_chainId': return chainIdForce || rpc('eth_chainId');
      case 'wallet_switchEthereumChain': throw erreur(4902, 'test provider: no switch');
      case 'wallet_getSubAccounts': {
        if (refus4100) throw erreur(4100, 'Requested method not supported');
        if (String(params[0] && params[0].account).toLowerCase() !== universel) throw erreur(-32602, 'wrong account');
        return { subAccounts: sousCompte ? [{ address: sousCompte, factory: FACTORY, factoryData: '0x' }] : [] };
      }
      case 'wallet_addSubAccount': {
        if (refus4100) throw erreur(4100, 'Requested method not supported');
        const p = params[0] || {};
        if (p.version !== '1' || !p.account || p.account.type !== 'create') throw erreur(-32602, 'bad wallet_addSubAccount params');
        if (!sousCompte) sousCompte = await creerWallet([universel, SUBKEY]);
        return { address: sousCompte, factory: FACTORY, factoryData: '0x' };
      }
      case 'eth_signTypedData_v4': {
        if (refuseSignature) throw erreur(4001, 'User rejected');
        if (String(params[0]).toLowerCase() !== universel) throw erreur(-32602, 'signer is not the universal account');
        const td = JSON.parse(params[1]);
        if (td.primaryType !== 'SpendPermission' || String(td.domain.verifyingContract).toLowerCase() !== SPM || Number(td.domain.chainId) !== 8453) throw erreur(-32602, 'unexpected typed data');
        const h = String(await lire(SPM, '0x' + sel('getHash((address,address,address,uint160,uint48,uint48,uint48,uint256,bytes))') + mot(0x20) + tupleEnc(td.message))).toLowerCase();
        const rsh = String(await lire(universel, '0x' + sel('replaySafeHash(bytes32)') + h.slice(2))).toLowerCase();
        const sig = signerDigest(CLE_DE[OWNER], rsh);
        return '0x' + mot(0x20) + mot(0) + mot(0x40) + octets(sig);   // SignatureWrapper(ownerIndex 0, signatureData)
      }
      case 'wallet_sendCalls': {
        const c = params[0] || {};
        const eoa = proprio(c.from);
        if (c.version !== '2.0' || c.chainId !== '0x2105' || !eoa || !Array.isArray(c.calls) || c.calls.length !== 1) throw erreur(-32602, 'bad wallet_sendCalls');
        const { to, data } = c.calls[0];
        const h = await rpc('eth_sendTransaction', [{ from: eoa, to: c.from, data: execWallet(to, data), gas: hex(2_000_000) }]);
        await recu(h);
        const id = 'essai-' + h.slice(2, 18);
        envois.set(id, { hash: h, from: String(c.from).toLowerCase(), to, data });
        return { id };
      }
      case 'wallet_getCallsStatus': {
        const e = envois.get(params[0]);
        if (!e) throw erreur(-32602, 'unknown id');
        const h = e.hash;
        const r = await rpc('eth_getTransactionReceipt', [h]);
        return { version: '2.0', id: params[0], chainId: '0x2105', atomic: true, status: r.status === '0x1' ? 200 : 500,
          receipts: [{ transactionHash: h, status: r.status, blockNumber: r.blockNumber, gasUsed: r.gasUsed, logs: [] }] };
      }
      default: return rpc(method, params);
    }
  };
  return { request, journal, envois, sousCompte: () => sousCompte };
}

/* ══ MODE --servir : la page dans un navigateur, provider de test relaye vers le fork ══ */
if (PORT_SERVI) {
  const u = await universelNeuf();
  const f = fournisseurFork({ universel: u });
  const SERVIS = { '/essai-autonome.html': 'text/html', '/essai-autonome.js': 'text/javascript', '/agent-autonome.js': 'text/javascript',
    '/agent-sous-compte.js': 'text/javascript', '/frais-creation.js': 'text/javascript', '/pool.js': 'text/javascript', '/keccak.js': 'text/javascript', '/icon.png': 'image/png' };
  const relais = '<script>window.__fournisseurEssai={isTest:true,request:(a)=>fetch("/__rpc-essai",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(a)}).then((r)=>r.json()).then((r)=>{if(r.error)throw r.error;return r.result;})};</script>';
  http.createServer(async (req, res) => {
    const u2 = new URL(req.url, 'http://x');
    if (req.method === 'POST' && u2.pathname === '/__rpc-essai') {
      let corps = ''; for await (const c of req) corps += c;
      let sortie;
      try { sortie = { result: await f.request(JSON.parse(corps)) }; }
      catch (e) { sortie = { error: { code: e.code, message: e.message, data: e.data } }; }
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(sortie)); return;
    }
    const type = SERVIS[u2.pathname];
    if (!type) { res.writeHead(404); res.end(); return; }
    let b = fs.readFileSync(path.join(ICI, u2.pathname.slice(1)));
    if (u2.pathname === '/essai-autonome.html') b = Buffer.from(b.toString('utf8').replace('<script type="module">', relais + '\n<script type="module">'));
    res.writeHead(200, { 'content-type': type + (type.startsWith('text') ? '; charset=utf-8' : '') }); res.end(b);
  }).listen(PORT_SERVI, '127.0.0.1', () => console.log('servi : http://127.0.0.1:' + PORT_SERVI + '/essai-autonome.html · universel de test ' + u + ' (5 USDC, SpendPermissionManager owner)'));
} else {
  await scenarios();
}

async function scenarios() {
  const rapide = { pause: async () => {}, pasMs: 1, attenteMaxMs: 50, tirerSalt: aleaNonce };
  const journalPage = [];
  const entrees = (etape) => journalPage.filter((x) => x.step === etape);

  /* ── PRINCIPAL : etapes 1 a 6 ── */
  const U = await universelNeuf();
  const f = fournisseurFork({ universel: U });
  const essai = E.creerEssai({ provider: f, journal: (x) => journalPage.push(x), domaine: 'http://127.0.0.1', ...rapide });
  const r1 = await essai.connecter();
  ok(r1.ok && r1.universel === U && r1.spmOwner === true && r1.usdc === 5_000_000n, '1 connecter : smart wallet ' + U + ', chaine 8453, SpendPermissionManager owner lu, 5 USDC lus');
  const r2 = await essai.trouverSousCompte();
  ok(r2.ok && r2.aCreer === true && f.journal.some((j) => j.method === 'wallet_getSubAccounts' && j.params[0].domain === 'http://127.0.0.1'), '2a wallet_getSubAccounts {account, domain} : aucun -> a creer');
  const r2c = await essai.creerSousCompte();
  const SUB = f.sousCompte();
  ok(r2c.ok && r2c.sousCompte === SUB && r2c.code === 'CONTRAT' && r2c.universelOwner === true, '2b wallet_addSubAccount {version:1, type:create} -> ' + SUB + ' ; relu : contrat, universel owner');
  const r3 = await essai.construirePermission();
  const p = r3.permission;
  ok(r3.ok && p.allowance === 1_000_000n && p.period === 86400n && p.end - p.start === 86400n && p.spender === SUB && p.account === U && p.token.toLowerCase() === USDC,
    '3a permission : 1 USDC / 86400 s, vie 86400 s, spender = sub account, token USDC ; hash local = getHash on-chain');
  const r3s = await essai.signer();
  const sigRecue = f.journal.filter((j) => j.method === 'eth_signTypedData_v4');
  ok(r3s.ok && sigRecue.length === 1 && JSON.stringify(sigRecue[0].params) === JSON.stringify(E.requeteSignature(p).params), '3b eth_signTypedData_v4 : le wallet recoit EXACTEMENT requeteSignature(p)');
  ok(!(await lireBoolSpm('isApproved', p)), '3c temoin : signe mais pas encore on-chain -> isApproved = false');
  const r3e = await essai.enregistrer('sous-compte');
  const envAp = [...f.envois.values()].pop();
  const txAp = await rpc('eth_getTransactionByHash', [envAp.hash]);
  const attenduAp = E.requeteApprobation(p, r3s.signature, SUB).params[0].calls[0];
  ok(r3e.ok && envAp.from === SUB && txAp.to.toLowerCase() === SUB && txAp.input === execWallet(attenduAp.to, attenduAp.data),
    '3d approveWithSignature envoye depuis le sub account : l input de la tx = execute(SPM, 0, octets de la page)');
  ok((await lireBoolSpm('isApproved', p)) && (await lireBoolSpm('isValid', p)), '3e relu par le banc (son encodeur) : isApproved = isValid = true');

  const u0 = await soldeUsdc(U), s0 = await soldeUsdc(SUB);
  const r4 = await essai.depenser();
  const envSp = [...f.envois.values()].pop();
  const txSp = await rpc('eth_getTransactionByHash', [envSp.hash]);
  const attenduSp = E.requeteDepense(p).params[0].calls[0];
  ok(r4.ok && txSp.input === execWallet(attenduSp.to, attenduSp.data) && envSp.from === SUB, '4a spend envoye depuis le sub account avec EXACTEMENT requeteDepense(p)');
  ok(u0 - (await soldeUsdc(U)) === 10_000n && (await soldeUsdc(SUB)) - s0 === 10_000n, '4b soldes relus par le banc : universel -0.01, sub account +0.01 USDC');
  ok(entrees(4).some((x) => x.what === 'simulation OK (eth_call from ' + SUB + ')'), '4c la page a simule le spend depuis le sub account avant envoi');

  const nEnvois5 = f.journal.filter((j) => j.method === 'wallet_sendCalls').length;
  const r5 = await essai.depasser();
  ok(r5.ok && r5.erreur.nom === 'ExceededSpendPermission' && r5.valeur === 990_001n, '5a depassement (0.990001 USDC apres 0.01) -> ExceededSpendPermission, args ' + r5.erreur.args.join(','));
  ok(f.journal.filter((j) => j.method === 'wallet_sendCalls').length === nEnvois5 && (await soldeUsdc(U)) === u0 - 10_000n, '5b etape 5 : aucun wallet_sendCalls, soldes inchanges');

  const r6 = await essai.revoquer();
  const envRv = [...f.envois.values()].pop();
  const txRv = await rpc('eth_getTransactionByHash', [envRv.hash]);
  const attenduRv = E.requeteRevocation(p).params[0].calls[0];
  ok(r6.ok && envRv.from === U && txRv.from.toLowerCase() === OWNER && txRv.input === execWallet(attenduRv.to, attenduRv.data), '6a revoke envoye depuis l universel avec EXACTEMENT requeteRevocation(p)');
  ok((await lireBoolSpm('isRevoked', p)) && !(await lireBoolSpm('isValid', p)) && r6.spendApres === 'UnauthorizedSpendPermission', '6b relu : isRevoked = true, isValid = false, spend de 1 unite -> UnauthorizedSpendPermission');
  const ap = await (async () => { try { await lire(SPM, A.appelDepense(p, 1n).data, SUB); return 'PASSE'; } catch (e) { return String(e.data || '').slice(0, 10); } })();
  ok(ap === selecteur('UnauthorizedSpendPermission()').toLowerCase(), '6c temoin banc : spend apres revoke revert UnauthorizedSpendPermission');

  /* ── TEMOINS : la page doit S ARRETER ── */
  /* T1 : SpendPermissionManager PAS owner -> l etape 4 refuse en simulation, rien n est envoye */
  {
    const U1 = await universelNeuf({ sansSpm: true });
    const f1 = fournisseurFork({ universel: U1 });
    const e1 = E.creerEssai({ provider: f1, domaine: 'x', ...rapide });
    const c = await e1.connecter(); await e1.trouverSousCompte(); await e1.creerSousCompte();
    await e1.construirePermission(); await e1.signer();
    const ap1 = await e1.enregistrer('sous-compte');
    const avant = f1.journal.filter((j) => j.method === 'wallet_sendCalls').length;
    const b0 = await soldeUsdc(U1);
    const d1 = await e1.depenser();
    ok(c.spmOwner === false && ap1.ok && !d1.ok && /spend simulation/.test(d1.pourquoi) && f1.journal.filter((j) => j.method === 'wallet_sendCalls').length === avant && (await soldeUsdc(U1)) === b0,
      'T1 SpendPermissionManager pas owner : connecter le dit (false), spend refuse EN SIMULATION, aucun envoi (' + d1.pourquoi + ')');
    const rv = await e1.revoquer();
    ok(rv.ok, 'T1 la revocation marche quand meme (nettoyage)');
  }
  /* T2 : code vide ; T3 : delegation 7702 */
  {
    const vide = '0x' + '12'.repeat(20);
    const e2 = E.creerEssai({ provider: fournisseurFork({ universel: vide }), ...rapide });
    const r = await e2.connecter();
    ok(!r.ok && /eth_getCode is empty/.test(r.pourquoi), 'T2 adresse sans code -> arret (' + r.pourquoi.slice(0, 40) + '…)');
    const d7702 = '0x' + '34'.repeat(20);
    await rpc('anvil_setCode', [d7702, '0xef0100' + '56'.repeat(20)]);
    const r3x = await E.creerEssai({ provider: fournisseurFork({ universel: d7702 }), ...rapide }).connecter();
    ok(!r3x.ok && /7702/.test(r3x.pourquoi), 'T3 delegation EIP-7702 -> arret');
  }
  /* T4 : mauvaise chaine ; T5 : 4100 ; T6 : signature refusee 4001 */
  {
    const U4 = await universelNeuf();
    const r4x = await E.creerEssai({ provider: fournisseurFork({ universel: U4, chainIdForce: '0x1' }), ...rapide }).connecter();
    ok(!r4x.ok && /not on Base/.test(r4x.pourquoi), 'T4 wallet sur la chaine 1 -> arret');
    const f5 = fournisseurFork({ universel: U4, refus4100: true });
    const e5 = E.creerEssai({ provider: f5, ...rapide });
    await e5.connecter();
    const t5a = await e5.trouverSousCompte(), t5b = await e5.creerSousCompte();
    ok(!t5a.ok && /4100/.test(t5a.pourquoi) && !t5b.ok && /4100/.test(t5b.pourquoi), 'T5 le wallet repond 4100 -> arret, dit');
    const f6 = fournisseurFork({ universel: U4, refuseSignature: true });
    const e6 = E.creerEssai({ provider: f6, ...rapide });
    await e6.connecter(); await e6.trouverSousCompte(); await e6.creerSousCompte(); await e6.construirePermission();
    const s6 = await e6.signer();
    const s6b = await e6.enregistrer('sous-compte');
    ok(!s6.ok && /4001/.test(s6.pourquoi) && !s6b.ok && !f6.journal.some((j) => j.method === 'wallet_sendCalls'), 'T6 signature refusee (4001) -> rien a enregistrer, aucun envoi');
  }
  /* T7 : le wallet MENT (statut 200 avec le recu d une autre tx) : la page relit et dit l ECART */
  {
    const U7 = await universelNeuf();
    const f7 = fournisseurFork({ universel: U7 });
    const e7 = E.creerEssai({ provider: f7, ...rapide });
    await e7.connecter(); await e7.trouverSousCompte(); await e7.creerSousCompte(); await e7.construirePermission(); await e7.signer();
    ok((await e7.enregistrer('universel')).ok && [...f7.envois.values()][0].from === U7, 'T7 repli : approveWithSignature envoye depuis l universel -> relu isApproved');
    const autre = [...f7.envois.values()][0].hash;   // une tx REUSSIE, mais pas un spend
    /* le spend est remplace par un appel qui ne fait rien, le wallet dit 200 */
    const vraiReq = f7.request;
    const faux = async (a) => (a.method === 'wallet_sendCalls' ? { id: 'mensonge' } : a.method === 'wallet_getCallsStatus'
      ? { version: '2.0', id: 'mensonge', chainId: '0x2105', status: 200, receipts: [{ transactionHash: autre, status: '0x1' }] } : vraiReq(a));
    const e7b = E.creerEssai({ provider: { request: faux }, ...rapide });
    Object.assign(e7b.etat, e7.etat);
    const d7 = await e7b.depenser();
    ok(!d7.ok && /MISMATCH/.test(d7.pourquoi), 'T7 le wallet dit « 200 » sans que rien ne bouge on-chain -> la page dit MISMATCH (relu, pas cru)');
    await e7.revoquer();
  }

  await rpc('anvil_stopImpersonatingAccount', [source]);
  console.log((ko ? 'ECHEC ' : 'OK ') + (n - ko) + '/' + n
    + ' - NE PROUVE PAS le vrai SDK, le popup, une signature passkey (ERC-6492), un vrai sub account 4337, ni qui paie son gas');
  if (ko) process.exitCode = 1;
}
