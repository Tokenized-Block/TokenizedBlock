/* test-essai-autonome-20261105.mjs — la page d essai du mode autonome (essai-autonome.js), HORS RESEAU.
 * Un faux wallet + un faux SpendPermissionManager EN MEMOIRE (hash, plafond, revocation, owner) rejouent les etapes 1 a 6 ; les
 * encodages attendus sont calcules par agent-autonome.js (pas par le module teste).
 * MUTANTS : sur des COPIES du module (dossier temporaire) ; chacun doit faire rougir au moins un scenario.
 * ⛔ BORNE : aucun reseau, aucune cle. NE PROUVE PAS le vrai contrat (-> banc-essai-autonome-fork-20261105.mjs), ni le vrai SDK.
 * ⛔ PORTABLE : process.exitCode, jamais process.exit. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const abs = (m) => pathToFileURL(path.join(ICI, m)).href;
const A = await import(abs('agent-autonome.js'));
const { selecteur } = await import(abs('pool.js'));
const { USDC_BASE } = await import(abs('frais-creation.js'));
const SRC = fs.readFileSync(path.join(ICI, 'essai-autonome.js'), 'utf8');
const DOSSIER = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-essai-autonome-'));
let nCopies = 0;
async function charger(src) {
  const f = path.join(DOSSIER, 'essai-autonome-' + (nCopies += 1) + '.mjs');
  let s = src;
  for (const m of ['agent-autonome.js', 'frais-creation.js', 'agent-sous-compte.js', 'pool.js']) s = s.split("from './" + m + "'").join("from '" + abs(m) + "'");
  fs.writeFileSync(f, s);
  return import(pathToFileURL(f).href);
}

const S = (sig) => '0x' + selecteur(sig);
const SPM = A.SPEND_PERMISSION_MANAGER.toLowerCase(), USDC = USDC_BASE.toLowerCase();
const U = '0x' + 'a1'.repeat(20), SUB = '0x' + 'b2'.repeat(20), TIERS = '0x' + 'c3'.repeat(20);
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const revert = (data) => Object.assign(new Error('execution reverted'), { code: 3, data, revert: true });
const ERR = { depasse: S('ExceededSpendPermission(uint256,uint256)'), nonAut: S('UnauthorizedSpendPermission()'), sender: S('InvalidSender(address,address)'),
  sig: S('InvalidSignature()'), wallet: S('Unauthorized()') };
const TUPLE = '((address,address,address,uint160,uint48,uint48,uint48,uint256,bytes))';
const SEL = { isApproved: S('isApproved' + TUPLE), isRevoked: S('isRevoked' + TUPLE), isValid: S('isValid' + TUPLE), getCurrentPeriod: S('getCurrentPeriod' + TUPLE),
  getHash: S('getHash' + TUPLE), spend: S(A.SIG_SPEND), approveSig: S(A.SIG_APPROVE_WITH_SIGNATURE), revoke: S(A.SIG_REVOKE),
  balanceOf: S('balanceOf(address)'), isOwner: S('isOwnerAddress(address)') };
/* le tuple a partir du mot `i` (en mots de 32 octets apres le selecteur) */
function tupleA(data, i) {
  const w = data.slice(10).match(/.{64}/g);
  const a = (k) => '0x' + w[i + k].slice(24);
  const b = (k) => BigInt('0x' + w[i + k]);
  const len = Number(b(9));
  return { account: a(0), spender: a(1), token: a(2), allowance: b(3), period: b(4), start: b(5), end: b(6), salt: b(7), extraData: '0x' + w.slice(i + 10).join('').slice(0, len * 2) };
}

/** Le faux monde : un wallet (universel + sub account) et un faux SpendPermissionManager. */
function monde({ code = '0x6001', chainId = '0x2105', spmOwner = true, hashFaux = false, ment = null, sansHash = false } = {}) {
  const st = { approuve: new Set(), revoque: new Set(), depense: new Map(), solde: { [U]: 5_000_000n, [SUB]: 0n }, t: 1_800_000_000, sub: null };
  const journal = [];
  let ids = 0;
  const cle = (p) => A.hashAutorisation(p, 8453);
  const periode = (p) => { const s = Number(p.start) + Math.floor((st.t - Number(p.start)) / 86400) * 86400; return { start: s, end: s + 86400, spend: st.depense.get(cle(p) + ':' + s) || 0n }; };
  const valide = (p) => st.approuve.has(cle(p)) && !st.revoque.has(cle(p)) && st.t >= Number(p.start) && st.t < Number(p.end);
  /* l EXECUTION d un appel au faux SPM depuis `from` ; ecrire = true pour un envoi */
  function executer(from, to, data, ecrire) {
    from = from.toLowerCase(); to = to.toLowerCase();
    const s = data.slice(0, 10);
    if (to === USDC && s === SEL.balanceOf) return '0x' + mot(st.solde['0x' + data.slice(34)] || 0n);
    if (s === SEL.isOwner) { const q = '0x' + data.slice(34); return '0x' + mot(to === U ? (q === U || (q === SPM && spmOwner)) : to === SUB ? q === U : 0); }
    if (to !== SPM) throw revert('0x');
    if (s === SEL.getHash) return hashFaux ? '0x' + 'ee'.repeat(32) : cle(tupleA(data, 1));
    if ([SEL.isApproved, SEL.isRevoked, SEL.isValid].includes(s)) {
      const p = tupleA(data, 1);
      return '0x' + mot(s === SEL.isApproved ? st.approuve.has(cle(p)) : s === SEL.isRevoked ? st.revoque.has(cle(p)) : valide(p));
    }
    if (s === SEL.getCurrentPeriod) { const pr = periode(tupleA(data, 1)); return '0x' + mot(pr.start) + mot(pr.end) + mot(pr.spend); }
    if (s === SEL.approveSig) {
      const p = tupleA(data, 2);
      const w = data.slice(10).match(/.{64}/g); const off = Number(BigInt('0x' + w[1])) / 32; const len = Number(BigInt('0x' + w[off]));
      const sig = '0x' + w.slice(off + 1).join('').slice(0, len * 2);
      if (sig !== cle(p) + '1b') throw revert(ERR.sig);
      if (ecrire) st.approuve.add(cle(p));
      return '0x' + mot(1);
    }
    if (s === SEL.spend) {
      const v = BigInt('0x' + data.slice(74, 138)); const p = tupleA(data, 2);
      if (from !== p.spender) throw revert(ERR.sender + mot(from) + mot(p.spender));
      if (!valide(p)) throw revert(ERR.nonAut);
      const pr = periode(p);
      if (pr.spend + v > p.allowance) throw revert(ERR.depasse + mot(pr.spend + v) + mot(p.allowance));
      if (!spmOwner) throw revert(ERR.wallet);
      if (ecrire) { st.depense.set(cle(p) + ':' + pr.start, pr.spend + v); st.solde[p.account] -= v; st.solde[p.spender] = (st.solde[p.spender] || 0n) + v; }
      return '0x';
    }
    if (s === SEL.revoke) {
      const p = tupleA(data, 1);
      if (from !== p.account) throw revert(ERR.sender + mot(from) + mot(p.account));
      if (ecrire) st.revoque.add(cle(p));
      return '0x';
    }
    throw revert('0x');
  }
  const envois = new Map();
  const request = async ({ method, params = [] }) => {
    journal.push({ method, params: JSON.parse(JSON.stringify(params)) });
    switch (method) {
      case 'eth_requestAccounts': return [U];
      case 'eth_chainId': return chainId;
      case 'wallet_switchEthereumChain': throw Object.assign(new Error('no'), { code: 4902 });
      case 'eth_getCode': return String(params[0]).toLowerCase() === U ? code : String(params[0]).toLowerCase() === SUB && st.sub ? '0x6002' : '0x';
      case 'eth_getBalance': return '0x0';
      case 'eth_getBlockByNumber': return { timestamp: '0x' + st.t.toString(16) };
      case 'wallet_getSubAccounts': return { subAccounts: st.sub ? [{ address: st.sub }] : [] };
      case 'wallet_addSubAccount': if (params[0] && params[0].version === '1' && params[0].account.type === 'create') { st.sub = SUB; return { address: SUB }; } throw Object.assign(new Error('bad'), { code: -32602 });
      case 'eth_signTypedData_v4': {
        const td = JSON.parse(params[1]); const m = td.message;
        const p = { ...m, allowance: BigInt(m.allowance), period: BigInt(m.period), start: BigInt(m.start), end: BigInt(m.end), salt: BigInt(m.salt) };
        return cle(p) + '1b';
      }
      case 'eth_call': return executer(params[0].from || TIERS, params[0].to, params[0].data, false);
      case 'wallet_sendCalls': {
        const c = params[0]; const id = 'id' + (ids += 1);
        if (ment && ment(c)) { envois.set(id, { status: '0x1' }); return { id }; }   // le wallet ne fait RIEN et dira 200
        let status = '0x1';
        try { executer(c.from, c.calls[0].to, c.calls[0].data, true); } catch (_) { status = '0x0'; }
        envois.set(id, { status }); return { id };
      }
      case 'wallet_getCallsStatus': { const e = envois.get(params[0]); return { status: e.status === '0x1' ? 200 : 500, receipts: [sansHash ? { status: e.status } : { transactionHash: '0x' + mot(params[0].length), status: e.status }] }; }
      case 'eth_getTransactionReceipt': return { status: [...envois.values()].pop().status, blockNumber: '0x1' };
      default: throw new Error('unexpected ' + method);
    }
  };
  return { request, journal, st };
}
const WALLET = ['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'wallet_switchEthereumChain', 'wallet_addSubAccount', 'wallet_getSubAccounts',
  'eth_signTypedData_v4', 'wallet_sendCalls', 'wallet_getCallsStatus'];
const rapide = { pause: async () => {}, pasMs: 1, attenteMaxMs: 5, domaine: 'https://exemple.test' };
const envoisDe = (w) => w.journal.filter((j) => j.method === 'wallet_sendCalls');
/* le wallet tel que le SDK se comporte en prod chez Phil : -32603 sur toute methode qui n est pas un geste (et sur `panne`) */
function walletSeul(w, { panne = [], chainId = null } = {}) {
  const recues = [];
  const request = async (a) => {
    recues.push(a.method);
    if (!WALLET.includes(a.method) || panne.includes(a.method)) throw Object.assign(new Error('failed to fetch rpc request'), { code: -32603 });
    if (chainId && a.method === 'eth_chainId') return chainId;
    return w.request(a);
  };
  return { request, recues };
}
async function jusquA(M, w, n, provider = walletSeul(w)) {
  const log = [];
  const e = M.creerEssai({ provider, lecteur: (m, p) => w.request({ method: m, params: p }), journal: (x) => log.push(x), ...rapide, tirerSalt: () => 7n });
  const r = { e, log, provider };
  r[1] = await e.connecter(); if (n === 1) return r;
  r['2a'] = await e.trouverSousCompte(); r['2b'] = await e.creerSousCompte(); if (n === 2) return r;
  r['3a'] = await e.construirePermission(); r['3b'] = await e.signer(); r['3c'] = await e.enregistrer(); if (n === 3) return r;
  r[4] = await e.depenser(); if (n === 4) return r;
  r[5] = await e.depasser(); if (n === 5) return r;
  r[6] = await e.revoquer(); return r;
}

async function suite(M) {
  const R = {};
  /* S1 : le chemin entier, chaque chiffre lu dans le faux monde */
  {
    const w = monde();
    const r = await jusquA(M, w, 6);
    const p = r.e.etat.permission;
    R['S1.1 connecter : universel, chaine, owner SPM lu'] = r[1].ok && r[1].universel === U && r[1].spmOwner === true && r[1].usdc === 5_000_000n;
    R['S1.2 sub account cree par {version:1,type:create}'] = r['2a'].aCreer === true && r['2b'].ok && r['2b'].sousCompte === SUB;
    R['S1.3 permission = 1 USDC / 1 jour / vie 1 jour, spender = sub account'] = !!p && p.allowance === 1_000_000n && p.period === 86400n && p.end - p.start === 86400n
      && p.spender === SUB && p.account === U && p.token === USDC_BASE && p.salt === 7n;
    const sig = w.journal.find((j) => j.method === 'eth_signTypedData_v4');
    R['S1.4 signTypedData demande a l universel, typedData de agent-autonome'] = !!sig && sig.params[0] === U && sig.params[1] === JSON.stringify(A.donneesAutorisation(p, 8453).typedData);
    const env = envoisDe(w);
    R['S1.5 trois envois : approve (sub), spend (sub), revoke (universel)'] = env.length === 3
      && env[0].params[0].from === SUB && env[0].params[0].calls[0].data === A.appelApprobationAvecSignature(p, A.hashAutorisation(p, 8453) + '1b').data
      && env[1].params[0].from === SUB && env[1].params[0].calls[0].data === A.appelDepense(p, 10_000n).data
      && env[2].params[0].from === U && env[2].params[0].calls[0].data === A.appelRevocation(p).data
      && env.every((x) => x.params[0].version === '2.0' && x.params[0].chainId === '0x2105' && x.params[0].atomicRequired === true && x.params[0].calls[0].to === A.SPEND_PERMISSION_MANAGER);
    R['S1.6 spend : soldes -0.01 / +0.01, periode 0.01'] = r[4].ok && r[4].ecarts.universel === -10_000n && r[4].ecarts.sousCompte === 10_000n && w.st.solde[U] === 4_990_000n && w.st.solde[SUB] === 10_000n;
    R['S1.7 depassement 0.990001 -> ExceededSpendPermission, en eth_call'] = r[5].ok && r[5].valeur === 990_001n && r[5].erreur.nom === 'ExceededSpendPermission';
    R['S1.8 revoke relu : isRevoked, isValid faux, spend apres -> Unauthorized'] = r[6].ok && r[6].isRevoked === true && r[6].isValid === false && r[6].spendApres === 'UnauthorizedSpendPermission';
    R['S1.9 chaque envoi precede de sa simulation (eth_call, memes octets, meme from)'] = env.every((x) => {
      const i = w.journal.indexOf(x); const pr = w.journal[i - 1];
      return pr && pr.method === 'eth_call' && pr.params[0].from === x.params[0].from && pr.params[0].data === x.params[0].calls[0].data;
    });
  }
  /* S11 : le wallet ne recoit QUE des gestes (les lectures vont a nos noeuds) */
  { const w = monde(); const r = await jusquA(M, w, 6);
    R['S11 le provider ne recoit que des methodes wallet'] = r[6].ok && r.provider.recues.length > 0 && r.provider.recues.every((m) => WALLET.includes(m))
      && !r.provider.recues.includes('eth_call') && !r.provider.recues.includes('eth_getCode'); }
  /* S12 : comme en prod chez Phil : -32603 sur les lectures ET sur wallet_getCallsStatus / wallet_getSubAccounts -> tout passe quand meme */
  { const w = monde(); const r = await jusquA(M, w, 6, walletSeul(w, { panne: ['wallet_getCallsStatus', 'wallet_getSubAccounts'] }));
    const errs = r.log.filter((x) => x.what === 'wallet error');
    R['S12.1 -32603 partout hors gestes : les 6 etapes passent'] = r[1].ok && r['2b'].ok && r['3c'].ok && r[4].ok && r[5].ok && r[6].ok && w.st.solde[SUB] === 10_000n;
    R['S12.2 getSubAccounts en panne : creation proposee, cause dite'] = r['2a'].ok && r['2a'].aCreer === true && /wallet_getSubAccounts: -32603 failed to fetch/.test(r['2a'].nonListe);
    R['S12.3 confirmation par EFFET lu on-chain, recu non lu dit'] = r['3c'].recus.length === 0 && r.log.filter((x) => x.what === 'no receipt from the wallet; the effect was read on-chain').length === 3;
    R['S12.4 chaque erreur wallet au journal : etape, methode, code, message'] = errs.some((x) => x.step === 2 && x.method === 'wallet_getSubAccounts' && x.code === -32603 && x.message === 'failed to fetch rpc request')
      && errs.some((x) => x.step === 3 && x.method === 'wallet_getCallsStatus' && x.code === -32603); }
  /* S12b : getCallsStatus en panne ET le wallet n a rien fait : pas d effet lu -> echec */
  { const w = monde({ ment: (c) => c.calls[0].data.startsWith(SEL.approveSig) });
    const r = await jusquA(M, w, 3, walletSeul(w, { panne: ['wallet_getCallsStatus'] }));
    R['S12b statut en panne, aucun effet -> pas de succes'] = !r['3c'].ok && /no effect read on-chain/.test(r['3c'].pourquoi) && /-32603/.test(r['3c'].pourquoi); }
  /* S12c : un geste refuse par le wallet est dit avec SA methode */
  { const w = monde(); const r = await jusquA(M, w, 3, walletSeul(w, { panne: ['eth_signTypedData_v4'] }));
    R['S12c erreur de signature : methode + code dans la raison et le journal'] = !r['3b'].ok && r['3b'].pourquoi === 'wallet error on eth_signTypedData_v4: -32603 failed to fetch rpc request'
      && r.log.some((x) => x.what === 'wallet error' && x.method === 'eth_signTypedData_v4' && x.step === 3); }
  /* S13 : lecteurRpc, repli de noeud en noeud, revert = reponse, echec total = toutes les causes */
  {
    const appels = [];
    const rep = (corps, status = 200) => ({ ok: status === 200, status, json: async () => corps });
    const faux = (plan) => async (url, init) => { appels.push(url); return plan[url](JSON.parse(init.body), init); };
    const l1 = M.lecteurRpc(['a', 'b', 'c'], { fetchImpl: faux({ a: () => { throw new TypeError('Failed to fetch'); }, b: () => rep({}, 429), c: (q) => rep({ jsonrpc: '2.0', id: q.id, result: '0x2105' }) }) });
    const v1 = await l1('eth_chainId', []);
    const n1 = appels.splice(0).join(',');
    const l2 = M.lecteurRpc(['a', 'b'], { fetchImpl: faux({ a: () => rep({ error: { code: 3, message: 'execution reverted', data: ERR.depasse + mot(2) + mot(1) } }), b: () => rep({ result: '0x' }) }) });
    let e2 = null; try { await l2('eth_call', [{}]); } catch (e) { e2 = e; }
    const n2 = appels.splice(0).join(',');
    const l3 = M.lecteurRpc(['a', 'b'], { fetchImpl: faux({ a: () => rep({ error: { code: -32005, message: 'limit exceeded' } }), b: () => rep({}, 503) }) });
    let e3 = null; try { await l3('eth_getCode', []); } catch (e) { e3 = e; }
    const l4 = M.lecteurRpc(['a', 'b'], { timeoutMs: 20, fetchImpl: faux({ a: (q, init) => new Promise((_, ko) => init.signal.addEventListener('abort', () => ko(Object.assign(new Error('aborted'), { name: 'AbortError' })))), b: () => rep({ result: '0x1' }) }) });
    const v4 = await l4('eth_blockNumber', []);
    R['S13.1 reseau KO puis 429 -> 3e noeud'] = v1 === '0x2105' && n1 === 'a,b,c';
    R['S13.2 revert = reponse : pas de noeud suivant, donnees gardees'] = !!e2 && e2.revert === true && n2 === 'a' && M.decoderErreur(M.donneesRevert(e2)).nom === 'ExceededSpendPermission';
    R['S13.3 tout echoue -> erreur EXACTE de chaque noeud'] = !!e3 && e3.code === 'RPC_UNREACHABLE' && /a -32005 limit exceeded/.test(e3.message) && /b HTTP 503/.test(e3.message);
    R['S13.4 timeout -> noeud suivant'] = v4 === '0x1';
  }
  /* S14 : les noeuds sont CEUX de l app (RESEAUX[8453] : rpc puis secours, lus dans app.html) */
  { const app = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8');
    const i = app.indexOf('8453: { nom:');
    const bloc = app.slice(i, i + 6000);
    const rpc = (/rpc: '([^']+)'/.exec(bloc) || [])[1], secours = ((/secours: \[([^\]]*)\]/.exec(bloc) || [])[1] || '').match(/'[^']+'/g) || [];
    R['S14 NOEUDS_BASE = RESEAUX[8453] d app.html'] = i > 0 && !!rpc && JSON.stringify(M.NOEUDS_BASE) === JSON.stringify([rpc, ...secours.map((x) => x.slice(1, -1))]); }
  /* S2 : getHash on-chain different -> rien a signer */
  { const w = monde({ hashFaux: true }); const r = await jusquA(M, w, 3);
    R['S2 hash local != getHash -> arret, aucune signature demandee'] = !r['3a'].ok && !w.journal.some((j) => j.method === 'eth_signTypedData_v4'); }
  /* S3 : SPM pas owner -> spend refuse en simulation, rien envoye */
  { const w = monde({ spmOwner: false }); const r = await jusquA(M, w, 4);
    R['S3 SPM pas owner -> stop en simulation, un seul envoi (approve)'] = r['3c'].ok && !r[4].ok && /spend simulation/.test(r[4].pourquoi) && envoisDe(w).length === 1 && w.st.solde[U] === 5_000_000n; }
  /* S4-S6 : arrets de l etape 1 */
  { R['S4 delegation 7702 -> arret'] = !(await jusquA(M, monde({ code: '0xef0100' + '56'.repeat(20) }), 1))[1].ok;
    R['S5 code vide -> arret'] = !(await jusquA(M, monde({ code: '0x' }), 1))[1].ok;
    { const w = monde(); const r = await jusquA(M, w, 1, walletSeul(w, { chainId: '0x1' }));
      R['S6 wallet sur la chaine 0x1 -> arret'] = !r[1].ok && /wallet is not on Base/.test(r[1].pourquoi); }
    { const w = monde({ chainId: '0x1' }); const r = await jusquA(M, w, 1, walletSeul(w, { chainId: '0x2105' }));
      R['S6b noeud de lecture pas sur Base -> arret'] = !r[1].ok && /read node is not Base/.test(r[1].pourquoi); } }
  /* S7 : le wallet ment (200 sans rien faire) sur approve, spend, revoke */
  { const sp = (c) => c.calls[0].data.startsWith(SEL.spend), ap = (c) => c.calls[0].data.startsWith(SEL.approveSig), rv = (c) => c.calls[0].data.startsWith(SEL.revoke);
    const r7a = await jusquA(M, monde({ ment: ap }), 3);
    R['S7a approve « 200 » sans effet -> la page relit et refuse'] = !r7a['3c'].ok;
    const r7b = await jusquA(M, monde({ ment: sp }), 4);
    R['S7b spend « 200 » sans effet -> ECART'] = !r7b[4].ok && /MISMATCH/.test(r7b[4].pourquoi);
    const r7c = await jusquA(M, monde({ ment: rv }), 6);
    R['S7c revoke « 200 » sans effet -> la page relit et refuse'] = !r7c[6].ok; }
  /* S8 : apres revoke, le depassement est refuse pour une AUTRE raison : la page ne doit pas crier victoire */
  { const w = monde(); const r = await jusquA(M, w, 6); const d = await r.e.depasser();
    R['S8 depasser apres revoke -> Unauthorized, pas « OK depassement »'] = !d.ok && /not for exceeding the cap/.test(d.pourquoi); }
  /* S10 : le wallet dit 200 sans hash de tx : aucun recu a relire -> l etape ne se declare pas reussie */
  { const r = await jusquA(M, monde({ sansHash: true }), 3);
    R['S10 statut 200 sans transactionHash -> pas de succes (recu non relu)'] = r['3b'].ok && !r['3c'].ok && /status 200/.test(r['3c'].pourquoi); }
  /* S9 : fonctions pures */
  {
    const p = M.permissionEssai({ universel: U, sousCompte: SUB, maintenant: 1_800_000_000, salt: 3n }).permission;
    R['S9.1 estPermissionEssai refuse allowance x2, vie +1 s, periode x2, autre jeton'] = M.estPermissionEssai(p)
      && !M.estPermissionEssai({ ...p, allowance: 2_000_000n }) && !M.estPermissionEssai({ ...p, end: p.end + 1n })
      && !M.estPermissionEssai({ ...p, period: 172_800n }) && !M.estPermissionEssai({ ...p, token: TIERS });
    R['S9.2 requeteDepense : 0.01 seulement, from = spender'] = M.requeteDepense(p, 20_000n) === null && M.requeteDepense(p, 9_999n) === null
      && M.requeteDepense(p).params[0].from === SUB && M.requeteDepense({ ...p, allowance: 50_000_000n }) === null;
    R['S9.3 requeteApprobation : from = spender ou account, sinon null'] = M.requeteApprobation(p, '0x' + '11'.repeat(65), TIERS) === null
      && M.requeteApprobation(p, '0x' + '11'.repeat(65), SUB).params[0].from === SUB && M.requeteApprobation(p, '0x' + '11'.repeat(65), U).params[0].from === U;
    const x = M.requeteDepassement(p, 10_000n);
    R['S9.4 requeteDepassement : eth_call depuis le spender, valeur = reste + 1'] = x.requete.method === 'eth_call' && x.valeur === 990_001n && x.requete.params[0].from === SUB
      && x.requete.params[0].data === A.appelDepense(p, 990_001n).data;
    R['S9.5 requeteRevocation : from = account'] = M.requeteRevocation(p).params[0].from === U && M.requeteRevocation(p).params[0].calls[0].data === A.appelRevocation(p).data;
    R['S9.6 typeDeCode'] = M.typeDeCode('0x') === 'VIDE' && M.typeDeCode('0xef0100' + '56'.repeat(20)) === 'DELEGATION_7702' && M.typeDeCode('0x6080') === 'CONTRAT' && M.typeDeCode(null) === 'VIDE';
    R['S9.7 etatAppels : 100 pas fini ; 200 sans recu ou recu 0x0 = pas ok ; CONFIRMED ok'] = !M.etatAppels({ status: 100 }).fini
      && !M.etatAppels({ status: 200, receipts: [] }).ok && !M.etatAppels({ status: 200, receipts: [{ status: '0x0', transactionHash: '0x' + mot(1) }] }).ok
      && M.etatAppels({ status: 'CONFIRMED', receipts: [{ status: '0x1', transactionHash: '0x' + mot(1) }] }).ok && M.etatAppels({ status: 500 }).fini && !M.etatAppels({ status: 500 }).ok;
    R['S9.8 decoderErreur / donneesRevert'] = M.decoderErreur(M.donneesRevert({ data: ERR.depasse + mot(5) + mot(4) })).nom === 'ExceededSpendPermission'
      && M.decoderErreur(M.donneesRevert({ data: { data: ERR.nonAut } })).nom === 'UnauthorizedSpendPermission'
      && M.decoderErreur(M.donneesRevert({ message: 'reverted with ' + ERR.wallet })).nom.startsWith('Unauthorized (')
      && M.decoderErreur(null).nom === 'revert without data';
    R['S9.9 usdcTexte'] = M.usdcTexte(10_000n) === '0.01' && M.usdcTexte(1_000_000n) === '1' && M.usdcTexte(-10_000n) === '-0.01' && M.usdcTexte(990_001n) === '0.990001';
    const j = M.permissionVersJson(p);
    R['S9.10 stockage : aller-retour exact, JSON trafique (allowance x2) refuse'] = JSON.stringify(M.permissionDeJson(j), (k, v) => (typeof v === 'bigint' ? String(v) : v)) === j
      && M.permissionDeJson(j.replace('"allowance":"1000000"', '"allowance":"2000000"')) === null && M.permissionDeJson('{') === null;
    R['S9.11 simulationDe : memes octets, meme from'] = JSON.stringify(M.simulationDe(M.requeteDepense(p)).params[0]) === JSON.stringify({ from: SUB, to: A.SPEND_PERMISSION_MANAGER, data: A.appelDepense(p, 10_000n).data });
    R['S9.12 ESSAI fige'] = Object.isFrozen(M.ESSAI) && M.SDK_SUB_ACCOUNTS.funding === 'manual';
  }
  return R;
}

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const vrai = await suite(await import(abs('essai-autonome.js')));
for (const [k, v] of Object.entries(vrai)) ok(v === true, k);

const MUTANTS = [
  ['plafond 2 USDC', 'plafondBrut: 1_000_000n', 'plafondBrut: 2_000_000n'],
  ['duree 2 jours', 'dureeSec: 86400,', 'dureeSec: 172800,'],
  ['depense 0.1 USDC', 'depenseBrut: 10_000n', 'depenseBrut: 100_000n'],
  ['depassement ENVOYE', "requete: { method: 'eth_call'", "requete: { method: 'wallet_sendCalls'"],
  ['spend depuis l universel', 'return a.ok ? requeteEnvoi(p.spender, a) : null;', 'return a.ok ? requeteEnvoi(p.account, a) : null;'],
  ['revoke depuis le sub account', 'return a.ok ? requeteEnvoi(p.account, a) : null;', 'return a.ok ? requeteEnvoi(p.spender, a) : null;'],
  ['hash non compare', 'if (hLocal !== hChaine)', 'if (false)'],
  ['ecart de solde ignore', 'if (!exact) return stop(4', 'if (false) return stop(4'],
  ['spend sans simulation', "if (!s.ok) return stop(4, 'spend simulation", "if (false) return stop(4, 'spend simulation"],
  ['7702 accepte', "if (type === 'DELEGATION_7702') return stop", "if (false) return stop"],
  ['code vide accepte', "if (type === 'VIDE') return stop", "if (false) return stop"],
  ['chaine ignoree', "if (min(ch) !== CHAINE_BASE_HEX) return stop", "if (false) return stop"],
  ['recus vides acceptes (etatAppels)', "recus.length > 0 && recus.every((r) => r && (r.status", "recus.every((r) => r && (r.status"],
  ['recus vides acceptes (envoyer)', 'const ok = fin.ok && recus.length > 0 && recus.every', 'const ok = fin.ok && recus.every'],
  ['toute permission acceptee', 'if (!p) return false;', 'if (!p) return false; return true;'],
  ['approve non relu', 'if (approuve !== true || valide !== true)', 'if (false)'],
  ['revoke non relu', 'if (revoque !== true || valide !== false)', 'if (false)'],
  ['depassement : autre refus pris pour succes', "if (err.nom !== 'ExceededSpendPermission')", 'if (false)'],
  ['approve depuis n importe qui', 'if (min(from) !== min(p.spender) && min(from) !== min(p.account)) return null;', ''],
  ['depassement = reste (pas +1)', '- BigInt(depenseDansPeriode) + 1n;', '- BigInt(depenseDansPeriode);'],
  ['funding auto', "funding: 'manual'", "funding: 'spend-permissions'"],
  ['eth_getCode par le wallet', "const code = await lire('eth_getCode', [u, 'latest']);", "const code = await req({ method: 'eth_getCode', params: [u, 'latest'] });"],
  ['garde retiree + eth_call par le wallet', ['    if (!METHODES_WALLET.includes(r.method)) throw', '    if (false) throw'],
    ["const ethCall = (to, data, from) => lire('eth_call', [from ? { from, to, data } : { to, data }, 'latest']);", "const ethCall = (to, data, from) => req({ method: 'eth_call', params: [from ? { from, to, data } : { to, data }, 'latest'] });"]],
  ['garde retiree + bloc par le wallet', ['    if (!METHODES_WALLET.includes(r.method)) throw', '    if (false) throw'],
    ["const bloc = await lire('eth_getBlockByNumber', ['latest', false]);", "const bloc = await req({ method: 'eth_getBlockByNumber', params: ['latest', false] });"]],
  ['garde retiree + simulation par le wallet', ['    if (!METHODES_WALLET.includes(r.method)) throw', '    if (false) throw'], ['try { await lire(s.method, s.params);', 'try { await req(s);']],
  ['effet ignore', 'if (vu) { parEffet = true; break; }', 'if (false) { parEffet = true; break; }'],
  ['effet toujours vrai', 'try { vu = (await effet()) === true; }', 'try { vu = true; }'],
  ['getSubAccounts en panne = arret', 'return { ok: true, sousCompte: null, aCreer: true, nonListe:', 'return { ok: false, sousCompte: null, aCreer: true, nonListe:'],
  ['erreur wallet non journalisee', "catch (e) { log(etapeCourante, 'wallet error',", 'catch (e) { ((...a) => a)(etapeCourante, 0,'],
  ['lecteur sans repli', 'for (const url of urls) {', 'for (const url of urls.slice(0, 1)) {'],
  ['revert fait tourner les noeuds', 'if (estRevert(j.error)) throw', 'if (false) throw'],
  ['noeud non Base accepte', "if (min(chLu) !== CHAINE_BASE_HEX) return stop", 'if (false) return stop'],
];
let tues = 0;
for (const [nom, ...paires] of MUTANTS) {
  const lot = Array.isArray(paires[0]) ? paires : [paires];
  let src = SRC, mauvais = null;
  for (const [de, vers] of lot) { const occ = src.split(de).length - 1; if (occ !== 1) { mauvais = occ; break; } src = src.replace(de, vers); }
  if (mauvais !== null) { ok(false, 'mutant « ' + nom + ' » : motif trouve ' + mauvais + ' fois (attendu 1)'); continue; }
  let R;
  try { R = await suite(await charger(src)); } catch (e) { R = { ['exception ' + e.message]: false }; }
  const rouges = Object.entries(R).filter(([, v]) => v !== true).map(([k]) => k.split(' ')[0]);
  if (rouges.length) tues += 1;
  ok(rouges.length > 0, 'mutant ' + (rouges.length ? 'tue' : 'VIVANT') + ' : ' + nom + (rouges.length ? ' (' + rouges.join(', ') + ')' : ''));
}
fs.rmSync(DOSSIER, { recursive: true, force: true });
console.log((ko ? 'ECHEC ' : 'OK ') + (n - ko) + '/' + n + ', mutants ' + tues + '/' + MUTANTS.length + ' tues - hors reseau, faux SPM ; le vrai contrat : banc fork');
if (ko) process.exitCode = 1;
