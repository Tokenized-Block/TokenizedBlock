/* banc-agent-spend-permission-fork-20261105.mjs — la SpendPermission construite par agent-autonome.js CONTRE LE VRAI
 * SpendPermissionManager de Base, sur un FORK LOCAL (anvil). Rien n est envoye a Base.
 *
 * Usage : anvil --fork-url https://mainnet.base.org --port 9643 --config-out <fichier.json>
 *         node banc-agent-spend-permission-fork-20261105.mjs http://127.0.0.1:9643 <fichier.json>
 *   Le fichier --config-out d anvil donne les cles de TEST d anvil (publiques, affichees par anvil a chaque demarrage) ;
 *   elles ne sont utilisees QUE pour signer sur ce fork. Le banc verifie que chaque cle donne bien l adresse de eth_accounts.
 *
 * Sources LUES (2026-11-05), aucune adresse de memoire :
 *   - SpendPermissionManager : agent-autonome.js (README de github.com/coinbase/spend-permissions) ; code relu ici (eth_getCode).
 *   - CoinbaseSmartWalletFactory v1.1 = 0xBA5ED110eFDBa3D005bfC882d75358ACBbB85842 : tableau « Factory Address » du README de
 *     github.com/coinbase/smart-wallet (branche main) ; code relu ici. createAccount(bytes[] owners, uint256 nonce),
 *     getAddress(bytes[],uint256), execute(address,uint256,bytes) onlyEntryPointOrOwner, addOwnerAddress(address) onlyOwner,
 *     replaySafeHash(bytes32), SignatureWrapper{uint256 ownerIndex; bytes signatureData} : src/CoinbaseSmartWallet.sol,
 *     src/MultiOwnable.sol, src/ERC1271.sol du meme depot.
 *   - USDC de Base : frais-creation.js (USDC_BASE). Source d USDC : une pool de pools-actions-aerodrome.js, impersonnee (fork).
 *
 * CE QUE LE BANC PROUVE (sur le fork) :
 *   A. hashAutorisation(p, 8453) == SpendPermissionManager.getHash(p) ;
 *   B. un smart wallet Coinbase (cree par la VRAIE factory, owner = compte anvil #0) : approveWithSignature avec une signature
 *      du owner sur replaySafeHash(getHash(p)) est ACCEPTEE ; signature d un autre, d une autre permission, ownerIndex faux : REFUSEES ;
 *   C. spend dans le plafond passe (soldes USDC lus), au-dela du plafond du jour REFUSE (ExceededSpendPermission), le jour
 *      suivant le plafond se recharge ; spend par un autre que le spender REFUSE ;
 *   D. revoke envoye par le wallet (execute -> SpendPermissionManager.revoke) coupe tout ; revoke par un tiers REFUSE ;
 *      revokeAsSpender par le spender coupe aussi ;
 *   E. TEMOIN EOA : un EOA comme `account` peut etre approuve (approve direct) mais spend REVERT (pas de execute) ;
 *   F. verdictAutonome nourri par les LECTURES on-chain (isRevoked, getCurrentPeriod) suit le contrat ;
 *   M. mutants de calldata/signature joues contre le contrat reel : chacun doit etre refuse.
 * NE PROUVE PAS : un Base Account reel (passkey, popup, ajout du SpendPermissionManager comme owner via ERC-6492 par le SDK),
 *   un sub account, ni le chemin approveWithSignature avec un wallet NON deploye (prepareData ERC-6492). Ici le smart wallet a
 *   un owner EOA et le SpendPermissionManager est ajoute comme owner par un appel direct du owner.
 * ⛔ PORTABLE : process.exitCode. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const A = await import(pathToFileURL(path.join(ICI, 'agent-autonome.js')).href);
const { selecteur } = await import(pathToFileURL(path.join(ICI, 'keccak.js')).href);
const { adresseDe, signerDigest } = await import(pathToFileURL(path.join(ICI, 'signeur-secp256k1.js')).href);
const F = await import(pathToFileURL(path.join(ICI, 'frais-creation.js')).href);
const { POOLS_ACTIONS_AERODROME } = await import(pathToFileURL(path.join(ICI, 'pools-actions-aerodrome.js')).href);

const URL_FORK = process.argv[2] || 'http://127.0.0.1:9643';
const CONFIG = process.argv[3];
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exitCode = 1; throw new Error('stop'); }
let n = 0, ko = 0, idRpc = 0, mut = 0, mutTues = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const mutant = (tue, m) => { mut += 1; if (tue) mutTues += 1; ok(tue, 'mutant ' + (tue ? 'tue' : 'VIVANT') + ' : ' + m); };
const rpcBrut = async (method, params = []) => fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
const rpc = async (method, params = []) => { const r = await rpcBrut(method, params); if (r.error) throw new Error(method + ': ' + r.error.message); return r.result; };
const SPM = A.SPEND_PERMISSION_MANAGER.toLowerCase();
const FACTORY = '0xba5ed110efdba3d005bfc882d75358acbbb85842';
const USDC = F.USDC_BASE.toLowerCase();
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const sel = (sig) => selecteur(sig).slice(2);
const octets = (h) => { const d = String(h).slice(2); return mot(d.length / 2) + d.padEnd(Math.ceil(d.length / 64) * 64, '0'); };
const lire = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const soldeUsdc = async (q) => BigInt(await lire(USDC, '0x' + sel('balanceOf(address)') + adrMot(q)));
async function recu(h) {
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
const envoyer = async (de, to, data, gas = 1_500_000) => recu(await rpc('eth_sendTransaction', [{ from: de, to, data, gas: hex(gas) }]));
/* la raison d un refus : le meme appel en eth_call, selecteur de l erreur (4 premiers octets des donnees de revert) */
const raison = async (de, to, data) => {
  const r = await rpcBrut('eth_call', [{ from: de, to, data, gas: hex(1_500_000) }, 'latest']);
  if (!r.error) return null;
  const d = typeof r.error.data === 'string' ? r.error.data : (r.error.data && r.error.data.data) || '';
  return String(d).slice(0, 10).toLowerCase() || 'revert';
};
const ERR = (sig) => selecteur(sig).toLowerCase();
const E_SPEND_DEPASSE = ERR('ExceededSpendPermission(uint256,uint256)');
const E_NON_AUTORISE = ERR('UnauthorizedSpendPermission()');
const E_SIGNATURE = ERR('InvalidSignature()');
const E_SENDER = ERR('InvalidSender(address,address)');
const lireBool = async (nom, p) => { const a = A.appelLecture(nom, p); return BigInt(await lire(a.to, a.data)) === 1n; };
const periode = async (p) => { const a = A.appelLecture('getCurrentPeriod', p); const w = String(await lire(a.to, a.data)).slice(2).match(/.{64}/g).map((x) => BigInt('0x' + x)); return { start: w[0], end: w[1], spend: w[2] }; };
const maintenantFork = async () => BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp);

/* ── 0. le fork, les comptes de test, les contrats LUS ── */
const chaine = parseInt(await rpc('eth_chainId'), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + parseInt(await rpc('eth_blockNumber'), 16));
if (!ok(chaine === 8453, 'le fork est Base (8453) : sinon ce banc ne prouve rien')) { process.exitCode = 1; throw new Error('stop'); }
const comptes = (await rpc('eth_accounts')).map((x) => x.toLowerCase());
const cfg = CONFIG ? JSON.parse(fs.readFileSync(CONFIG, 'utf8')) : null;
const cles = cfg ? cfg.private_keys : [];
ok(cles.length >= 4 && [0, 1, 2, 3].every((i) => adresseDe(cles[i]).toLowerCase() === comptes[i]), 'les 4 premieres cles de TEST d anvil (--config-out) donnent les adresses de eth_accounts');
const [OWNER, SPENDER, TIERS, EOA] = comptes;
/* ⛔ CONSTAT DU 2026-11-05 : sur Base mainnet, les comptes de test anvil (cles publiques) portent une DELEGATION EIP-7702
 *   (code 0xef0100 || adresse d un contrat tiers). Un premier passage de ce banc a vu le temoin EOA (E3) REUSSIR un spend : le
 *   code delegue acceptait execute(). Ces comptes ne sont donc PAS des EOA sur le fork tant que ce code n est pas efface.
 *   Le banc LIT ce code, le nomme, puis l efface SUR LE FORK SEULEMENT (anvil_setCode -> 0x) pour les 4 comptes utilises. */
for (const a of [OWNER, SPENDER, TIERS, EOA]) {
  const c = String(await rpc('eth_getCode', [a, 'latest'])).toLowerCase();
  if (c !== '0x') console.log('    note : ' + a + ' porte du code sur Base (' + (c.startsWith('0xef0100') ? 'delegation EIP-7702 vers 0x' + c.slice(8) : (c.length - 2) / 2 + ' octets') + ') -> efface sur le fork');
  await rpc('anvil_setCode', [a, '0x']);
}
ok((await Promise.all([OWNER, SPENDER, TIERS, EOA].map((a) => rpc('eth_getCode', [a, 'latest'])))).every((c) => c === '0x'), 'les 4 comptes de test sont de vrais EOA sur le fork (aucun code)');
for (const [nom, a] of [['SpendPermissionManager', SPM], ['CoinbaseSmartWalletFactory v1.1', FACTORY], ['USDC', USDC]]) {
  const c = await rpc('eth_getCode', [a, 'latest']);
  ok(c.length > 100, nom + ' ' + a + ' a du code sur le fork (' + (c.length - 2) / 2 + ' octets)');
}

/* ── 1. le smart wallet : la VRAIE factory, owner = compte anvil #0 ── */
const owners = mot(0x40) + mot(0) + mot(1) + mot(0x20) + mot(32) + adrMot(OWNER); // (bytes[] [abi.encode(OWNER)], nonce 0)
const WALLET = ('0x' + String(await lire(FACTORY, '0x' + sel('getAddress(bytes[],uint256)') + owners)).slice(26)).toLowerCase();
const cw = await envoyer(OWNER, FACTORY, '0x' + sel('createAccount(bytes[],uint256)') + owners);
ok(cw.status === '0x1' && (await rpc('eth_getCode', [WALLET, 'latest'])).length > 2, 'smart wallet cree par la factory : ' + WALLET);
ok(BigInt(await lire(WALLET, '0x' + sel('isOwnerAddress(address)') + adrMot(OWNER))) === 1n, 'le compte anvil #0 est owner du smart wallet');
const execWallet = (to, data) => '0x' + sel('execute(address,uint256,bytes)') + adrMot(to) + mot(0) + mot(0x60) + octets(data);

/* USDC reel au smart wallet et a l EOA temoin, depuis une pool du fork */
let source = null;
for (const t of POOLS_ACTIONS_AERODROME.values()) { if (t.pool && (await soldeUsdc(t.pool)) >= 100_000_000n) { source = t.pool.toLowerCase(); break; } }
ok(!!source, 'une pool du fork tient >= 100 USDC (source ' + source + ')');
await rpc('anvil_impersonateAccount', [source]); await rpc('anvil_setBalance', [source, hex(10n ** 18n)]);
for (const q of [WALLET, EOA]) ok((await envoyer(source, USDC, '0x' + sel('transfer(address,uint256)') + adrMot(q) + mot(50_000_000n))).status === '0x1', '50 USDC reels a ' + q);

/* ── A. la permission : construite par demandeAutorisation ; son hash = celui du contrat ── */
const T0 = await maintenantFork();
const PLAFOND = 10_000_000n;  // 10 USDC par jour
const d = A.demandeAutorisation({ account: WALLET, spender: SPENDER, token: USDC, allowance: PLAFOND, periodSec: 86400, start: T0, end: T0 + 30n * 86400n });
ok(d.ok, 'demandeAutorisation accepte : 10 USDC / jour, 30 jours');
const p = d.permission;
const hChaine = String(await lire(SPM, A.appelLecture('getHash', p).data)).toLowerCase();
ok(A.hashAutorisation(p, 8453) === hChaine, 'A1 hashAutorisation(p, 8453) = getHash(p) du contrat : ' + hChaine.slice(0, 18) + '…');
mutant(A.hashAutorisation(p, 1) !== hChaine, 'hash calcule pour une autre chaine (1) != getHash');
mutant(A.hashAutorisation({ ...p, salt: 1n }, 8453) !== hChaine, 'hash d une permission au salt different != getHash');
const td = A.donneesAutorisation(p, 8453);
ok(td.ok && td.typedData.domain.verifyingContract === A.SPEND_PERMISSION_MANAGER && td.typedData.message.allowance === '10000000', 'A2 typedData pour eth_signTypedData_v4 : domaine = SpendPermissionManager, montants en texte');

/* temoin : rien n est approuve, spend refuse */
const sp = (pp, v) => A.appelDepense(pp, v);
ok(!(await lireBool('isApproved', p)) && (await raison(SPENDER, SPM, sp(p, 1_000_000n).data)) === E_NON_AUTORISE, 'temoin : avant approbation, isApproved = false et spend -> UnauthorizedSpendPermission');

/* ── B. approveWithSignature : signature du owner sur replaySafeHash(getHash(p)) ── */
const rsh = async (h) => String(await lire(WALLET, '0x' + sel('replaySafeHash(bytes32)') + h.slice(2))).toLowerCase();
const enveloppe = (index, sig) => '0x' + mot(0x20) + mot(index) + mot(0x40) + octets(sig);
const sigOwner = signerDigest(cles[0], await rsh(hChaine));
const essai = async (sigBytes, quoi) => {
  const a = A.appelApprobationAvecSignature(p, sigBytes);
  const r = await raison(TIERS, a.to, a.data);
  mutant(r === E_SIGNATURE && !(await lireBool('isApproved', p)), quoi + ' -> InvalidSignature (' + r + ')');
};
await essai(enveloppe(0, signerDigest(cles[2], await rsh(hChaine))), 'signature d un NON owner (compte anvil #2)');
const pAutre = { ...p, allowance: PLAFOND * 100n };
await essai(enveloppe(0, signerDigest(cles[0], await rsh(A.hashAutorisation(pAutre, 8453)))), 'signature du owner pour une AUTRE permission (allowance x100)');
await essai(enveloppe(0, signerDigest(cles[0], hChaine)), 'signature du owner sur getHash BRUT (sans replaySafeHash)');
{
  const a = A.appelApprobationAvecSignature(p, enveloppe(1, sigOwner));
  const r = await raison(TIERS, a.to, a.data);
  mutant(r !== null && !(await lireBool('isApproved', p)), 'bonne signature, ownerIndex 1 (inexistant) -> revert (' + r + ')');
}
const aps = A.appelApprobationAvecSignature(p, enveloppe(0, sigOwner));
const rAp = await envoyer(TIERS, aps.to, aps.data);
ok(rAp.status === '0x1' && (await lireBool('isApproved', p)) && (await lireBool('isValid', p)), 'B1 approveWithSignature (pose par un TIERS) ACCEPTE : isApproved et isValid = true (gaz ' + BigInt(rAp.gasUsed) + ')');

/* ── C. spend : il faut que le SpendPermissionManager soit owner du wallet ── */
ok((await raison(SPENDER, SPM, sp(p, 1_000_000n).data)) !== null, 'temoin : approuve mais SpendPermissionManager PAS owner du wallet -> spend revert (execute refuse)');
const rOw = await envoyer(OWNER, WALLET, '0x' + sel('addOwnerAddress(address)') + adrMot(SPM));
ok(rOw.status === '0x1' && BigInt(await lire(WALLET, '0x' + sel('isOwnerAddress(address)') + adrMot(SPM))) === 1n, 'le owner ajoute le SpendPermissionManager comme owner du wallet');
const w0 = await soldeUsdc(WALLET), s0 = await soldeUsdc(SPENDER);
const r4 = await envoyer(SPENDER, SPM, sp(p, 4_000_000n).data);
ok(r4.status === '0x1' && w0 - (await soldeUsdc(WALLET)) === 4_000_000n && (await soldeUsdc(SPENDER)) - s0 === 4_000_000n, 'C1 spend 4 USDC dans le plafond PASSE : wallet -4, spender +4 (soldes lus)');
ok((await periode(p)).spend === 4_000_000n, 'C2 getCurrentPeriod.spend = 4 USDC');
ok((await raison(TIERS, SPM, sp(p, 1_000_000n).data)) === E_SENDER, 'C3 spend envoye par un autre que le spender -> InvalidSender');
const r6 = await envoyer(SPENDER, SPM, sp(p, 6_000_000n).data);
ok(r6.status === '0x1' && (await periode(p)).spend === PLAFOND, 'C4 spend 6 USDC : total 10 = plafond du jour exactement -> PASSE (borne inclusive)');
const w1 = await soldeUsdc(WALLET);
ok((await raison(SPENDER, SPM, sp(p, 1n).data)) === E_SPEND_DEPASSE, 'C5 spend de 1 unite au-dela du plafond du jour -> ExceededSpendPermission');
const rx = await envoyer(SPENDER, SPM, sp(p, 1n).data);
ok(rx.status === '0x0' && (await soldeUsdc(WALLET)) === w1, 'C6 la meme tx ENVOYEE echoue (status 0) et le solde du wallet ne bouge pas');

/* ── F. verdictAutonome nourri par les lectures on-chain ── */
const SEL_RAIL = '0x' + sel('swap(bytes)'), RAIL = '0x' + '44'.repeat(20);
const regles = { listeBlanche: { [RAIL]: [SEL_RAIL] }, plafondTx: 5_000_000n, plafondJour: 10_000_000n, killSwitch: false };
const plan = { etat: 'PRET', simule: true, appels: [{ to: RAIL, data: SEL_RAIL, value: '0x0' }], coutJeton: 1_000_000n };
const grantLu = async () => ({ permission: p, revoque: await lireBool('isRevoked', p), depenseDansPeriode: (await periode(p)).spend });
const v1 = A.verdictAutonome({ plan, grant: await grantLu(), regles, journal: [], maintenant: await maintenantFork() });
ok(v1.decision === 'REFUSE' && v1.raisons.some((x) => x.includes('allowance left 0')), 'F1 plafond on-chain du jour epuise -> verdictAutonome REFUSE (' + v1.raisons.join(' | ') + ')');

/* le jour suivant : la periode se recharge */
await rpc('evm_increaseTime', [86400]); await rpc('evm_mine', []);
ok((await periode(p)).spend === 0n, 'C7 un jour plus tard : getCurrentPeriod.spend = 0 (nouvelle periode)');
const v2 = A.verdictAutonome({ plan, grant: await grantLu(), regles, journal: [], maintenant: await maintenantFork() });
ok(v2.decision === 'EXECUTER', 'F2 nouvelle periode lue -> verdictAutonome EXECUTER');
ok((await envoyer(SPENDER, SPM, sp(p, 3_000_000n).data)).status === '0x1', 'C8 spend 3 USDC le jour suivant PASSE');

/* ── D. revoke ── */
const rev = A.appelRevocation(p);
ok(rev.from === WALLET, 'appelRevocation : from = le wallet (account)');
ok((await raison(TIERS, rev.to, rev.data)) === E_SENDER && !(await lireBool('isRevoked', p)), 'D1 revoke envoye par un TIERS -> InvalidSender, rien de revoque');
const rR = await envoyer(OWNER, WALLET, execWallet(rev.to, rev.data));
ok(rR.status === '0x1' && (await lireBool('isRevoked', p)) && !(await lireBool('isValid', p)), 'D2 revoke par le wallet (owner -> execute -> revoke) : isRevoked = true, isValid = false');
ok((await raison(SPENDER, SPM, sp(p, 1n).data)) === E_NON_AUTORISE, 'D3 apres revoke, meme 1 unite -> UnauthorizedSpendPermission');
const v3 = A.verdictAutonome({ plan, grant: await grantLu(), regles, journal: [], maintenant: await maintenantFork() });
ok(v3.decision === 'REFUSE' && v3.raisons.some((x) => x.includes('revoked')), 'F3 revocation lue -> verdictAutonome REFUSE');

/* revokeAsSpender sur une seconde permission (salt 1), approuvee par le wallet via execute -> approve */
const p2 = A.demandeAutorisation({ account: WALLET, spender: SPENDER, token: USDC, allowance: PLAFOND, periodSec: 86400, start: await maintenantFork(), end: (await maintenantFork()) + 86400n * 30n, salt: 1n }).permission;
const ap2 = A.appelApprobation(p2);
ok((await envoyer(OWNER, WALLET, execWallet(ap2.to, ap2.data))).status === '0x1' && (await lireBool('isValid', p2)), 'D4 approve direct depuis le wallet (execute -> approve) : seconde permission valide');
ok((await envoyer(SPENDER, SPM, sp(p2, 2_000_000n).data)).status === '0x1', 'D5 spend 2 USDC sur la seconde permission');
const ras = A.appelRevocationCommeSpender(p2);
ok((await envoyer(SPENDER, ras.to, ras.data)).status === '0x1' && (await lireBool('isRevoked', p2)) && (await raison(SPENDER, SPM, sp(p2, 1n).data)) === E_NON_AUTORISE, 'D6 revokeAsSpender par le spender : revoquee, spend refuse');

/* ── E. TEMOIN EOA ── */
const pE = A.demandeAutorisation({ account: EOA, spender: SPENDER, token: USDC, allowance: PLAFOND, periodSec: 86400, start: await maintenantFork(), end: (await maintenantFork()) + 86400n * 30n }).permission;
const apE = A.appelApprobation(pE);
ok((await raison(TIERS, apE.to, apE.data)) === E_SENDER, 'E1 approve d une permission EOA envoye par un tiers -> InvalidSender');
ok((await envoyer(EOA, apE.to, apE.data)).status === '0x1' && (await lireBool('isValid', pE)), 'E2 un EOA PEUT approuver sa permission (approve direct, msg.sender == account)');
await envoyer(EOA, USDC, '0x' + sel('approve(address,uint256)') + adrMot(SPM) + mot(PLAFOND));
const eE = await soldeUsdc(EOA);
const rE = await envoyer(SPENDER, SPM, sp(pE, 1_000_000n).data);
ok(rE.status === '0x0' && (await soldeUsdc(EOA)) === eE, 'E3 TEMOIN : account EOA (meme avec un approve ERC-20 au manager) -> spend ECHOUE : il faut un smart wallet');

/* ── M. mutants de calldata joues contre le contrat reel ── */
{
  const pV = A.demandeAutorisation({ account: WALLET, spender: SPENDER, token: USDC, allowance: PLAFOND, periodSec: 86400, start: await maintenantFork(), end: (await maintenantFork()) + 86400n * 30n, salt: 2n }).permission;
  const apV = A.appelApprobation(pV);
  ok((await envoyer(OWNER, WALLET, execWallet(apV.to, apV.data))).status === '0x1', 'M0 troisieme permission (salt 2) approuvee pour les mutants');
  const bon = sp(pV, 1_000_000n).data;
  ok((await raison(SPENDER, SPM, bon)) === null, 'M0 temoin : le calldata NON mute passe en eth_call');
  const mots = (h) => h.slice(10).match(/.{64}/g);
  const remonte = (ws) => bon.slice(0, 10) + ws.join('');
  const muter = (i, v) => { const w = mots(bon); w[i] = mot(v); return remonte(w); };
  /* disposition : [0]=offset tuple, [1]=valeur, [2..]=tuple (account, spender, token, allowance, period, start, end, salt, off, len) */
  for (const [nom, data] of [
    ['allowance gonflee dans le calldata (x1000)', muter(5, PLAFOND * 1000n)],
    ['period gonflee (30 jours)', muter(6, 30n * 86400n)],
    ['salt change', muter(9, 7n)],
    ['spender remplace par le tiers', muter(3, BigInt(TIERS))],
  ]) {
    const r = await raison(SPENDER, SPM, data);
    mutant(r !== null, nom + ' -> refuse (' + r + ')');
  }
  mutant((await raison(SPENDER, SPM, sp(pV, PLAFOND + 1n).data)) === E_SPEND_DEPASSE, 'valeur = plafond + 1 en un seul spend -> ExceededSpendPermission');
  mutant(A.appelDepense(pV, 0n).ok === false && A.appelDepense(pV, 1n << 160n).ok === false, 'appelDepense refuse 0 et 2^160 avant tout envoi');
}

await rpc('anvil_stopImpersonatingAccount', [source]);
console.log((ko ? 'ECHEC ' : 'OK ') + (n - ko) + '/' + n + ', mutants ' + mutTues + '/' + mut + ' tues'
  + ' - NE PROUVE PAS un Base Account reel (passkey, SDK, ERC-6492 sur wallet non deploye) ni un sub account');
if (ko) process.exitCode = 1;
