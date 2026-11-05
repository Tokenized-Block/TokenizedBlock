/* essai-autonome.js — la page d ESSAI du mode autonome (essai-autonome.html), pour que Phil le teste LUI-MEME avec SON Base Account.
 *
 * ⛔ CE MODULE NE SIGNE RIEN, NE TIENT AUCUNE CLE. Tout passe par `provider.request` : le provider du Base Account SDK dans la
 *   page (le wallet de l utilisateur signe, dans SA fenetre), un provider de test relaye vers un fork anvil dans les bancs.
 * ⛔ MODE_AUTONOME_DRAPEAU (agent-sous-compte.js) N EST NI LU NI CHANGE ICI : cette page est separee, non liee depuis l app.
 * ⛔ MONTANTS EN DUR, refuses s ils bougent : plafond 1 USDC par jour, duree 1 jour, UNE depense de 0,01 USDC. La depense va du
 *   Base Account de l utilisateur vers SON sub account : aucun fonds ne sort de chez lui.
 * ⛔ CHAQUE ENVOI EST SIMULE (eth_call depuis l expediteur) AVANT d etre propose au wallet ; un revert = rien n est envoye.
 * ⛔ CHAQUE RESULTAT EST RELU ON-CHAIN (isApproved, isValid, getCurrentPeriod, isRevoked, soldes USDC), jamais deduit de la reponse
 *   du wallet.
 *
 * Sources (lues le 2026-11-05) :
 *   - le SDK SERVI par l app : vendor/npm/@base-org/account@2.5.13/dist/base-account.min.js (sha256 c279fa76… du manifeste),
 *     relu dans le bundle : `subAccount.create` envoie wallet_addSubAccount {version:'1', account:{type:'create'}} ; avec
 *     `subAccounts.funding` = 'spend-permissions' (DEFAUT) un wallet_sendCalls depuis le sub account SANS permission en memoire
 *     part dans un flux de permission AUTOMATIQUE (popup) -> la page cree le SDK avec funding 'manual' ;
 *     eth_signTypedData_v4 depuis l universel -> popup ; wallet_sendCalls dont `from` = sub account -> signe par la cle navigateur
 *     du sub account (wallet_prepareCalls / wallet_sendPreparedCalls), sans popup documente ; methodes inconnues -> RPC de la chaine.
 *   - `requestSpendPermission` / `prepareSpendCallData` NE SONT PAS dans ce bundle UMD (0 occurrence) : la page fait donc
 *     elle-meme ce que la doc Coinbase decrit (agent-sous-compte.js, en-tete) : signature EIP-712 du SpendPermission par
 *     eth_signTypedData_v4, puis approveWithSignature(p, sig) envoye par le spender, puis spend(p, v) envoye par le spender.
 *   - SpendPermissionManager, struct, erreurs : agent-autonome.js (github.com/coinbase/spend-permissions) ;
 *     isOwnerAddress(address) : src/MultiOwnable.sol de github.com/coinbase/smart-wallet.
 * ⛔ NON PROUVE ICI : le vrai popup, la vraie forme de la signature d un Base Account (ERC-6492 ?), que le SpendPermissionManager
 *   soit owner du Base Account (spend en depend : la page le LIT et le dit), qui paie le gas du sub account. */
import { demandeAutorisation, donneesAutorisation, hashAutorisation, appelApprobationAvecSignature, appelDepense,
  appelRevocation, appelLecture, SPEND_PERMISSION_MANAGER } from './agent-autonome.js';
import { USDC_BASE } from './frais-creation.js';
import { CHAINE_BASE, CHAINE_BASE_HEX, sousCompteExistant } from './agent-sous-compte.js';
import { selecteur } from './pool.js';

/* ── LES BORNES DE L ESSAI, EN DUR ── */
export const ESSAI = Object.freeze({
  plafondBrut: 1_000_000n,   // 1 USDC par jour (6 decimales)
  dureeSec: 86400,           // la permission vit 1 jour
  periodeSec: 86400,         // periode de remise a zero : 1 jour
  depenseBrut: 10_000n,      // UNE depense de 0,01 USDC
});
export const SDK_SUB_ACCOUNTS = Object.freeze({ creation: 'manual', defaultAccount: 'universal', funding: 'manual' });

const ADR = /^0x[0-9a-fA-F]{40}$/;
const HEX = /^0x([0-9a-fA-F]{2})*$/;
const min = (a) => String(a || '').toLowerCase();
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const adrMot = (a) => a.slice(2).toLowerCase().padStart(64, '0');
const sel = (sig) => '0x' + selecteur(sig);

/* les erreurs du SpendPermissionManager (agent-autonome.js / SpendPermissionManager.sol) et d un smart wallet Coinbase */
export const ERREURS = Object.freeze({
  [sel('ExceededSpendPermission(uint256,uint256)')]: 'ExceededSpendPermission',
  [sel('UnauthorizedSpendPermission()')]: 'UnauthorizedSpendPermission',
  [sel('InvalidSender(address,address)')]: 'InvalidSender',
  [sel('InvalidSignature()')]: 'InvalidSignature',
  [sel('ZeroValue()')]: 'ZeroValue',
  [sel('AfterSpendPermissionEnd(uint48,uint48)')]: 'AfterSpendPermissionEnd',
  [sel('BeforeSpendPermissionStart(uint48,uint48)')]: 'BeforeSpendPermissionStart',
  [sel('Unauthorized()')]: 'Unauthorized (smart wallet: caller is not an owner)',
});

/** USDC brut -> texte (« 0.01 »). */
export function usdcTexte(brut) {
  const b = BigInt(brut), neg = b < 0n, v = neg ? -b : b;
  const e = v / 1_000_000n, d = v % 1_000_000n;
  return (neg ? '-' : '') + e + (d ? '.' + String(d).padStart(6, '0').replace(/0+$/, '') : '');
}

/** Le code d une adresse : VIDE (EOA ou compte pas encore deploye), DELEGATION_7702 (EOA delegue), CONTRAT. */
export function typeDeCode(code) {
  const c = min(code);
  if (!HEX.test(c) || c === '0x') return 'VIDE';
  if (c.startsWith('0xef0100') && c.length === 2 + 46) return 'DELEGATION_7702';
  return 'CONTRAT';
}
/** Les memes etats, en anglais, pour l ecran et le journal. */
export const CODE_EN = Object.freeze({ VIDE: 'EMPTY', DELEGATION_7702: 'EIP7702_DELEGATION', CONTRAT: 'CONTRACT' });

/** La permission de l essai : universel -> sub account, USDC, 1 USDC / 1 jour, vie 1 jour. Refuse toute autre borne. */
export function permissionEssai({ universel, sousCompte, maintenant, salt }) {
  const r = (pourquoi) => ({ ok: false, pourquoi });
  if (!ADR.test(String(universel || ''))) return r('universal account is not an address');
  if (!ADR.test(String(sousCompte || ''))) return r('sub account is not an address');
  const t = Number(maintenant);
  if (!Number.isInteger(t) || t <= 0) return r('no clock');
  const d = demandeAutorisation({ account: universel, spender: sousCompte, token: USDC_BASE, allowance: ESSAI.plafondBrut,
    periodSec: ESSAI.periodeSec, start: t, end: t + ESSAI.dureeSec, salt: salt == null ? 0n : salt });
  if (!d.ok) return r(d.pourquoi);
  const p = d.permission;
  /* la garde de l ESSAI, en plus des bornes du module : exactement ces valeurs, rien d autre */
  if (p.allowance !== ESSAI.plafondBrut || p.period !== BigInt(ESSAI.periodeSec) || p.end - p.start !== BigInt(ESSAI.dureeSec)
    || min(p.token) !== min(USDC_BASE) || p.extraData !== '0x') return r('trial bounds changed');
  return { ok: true, permission: p };
}

/** Garde d une permission RELUE (stockage local, etat) : refuse si ce n est pas une permission d essai. */
export function estPermissionEssai(p) {
  if (!p) return false;
  const q = permissionEssai({ universel: p.account, sousCompte: p.spender, maintenant: Number(p.start), salt: p.salt });
  return q.ok && q.permission.end === BigInt(p.end) && min(p.token) === min(USDC_BASE)
    && BigInt(p.allowance) === ESSAI.plafondBrut && BigInt(p.period) === BigInt(ESSAI.periodeSec);
}

export const permissionVersJson = (p) => JSON.stringify({ account: p.account, spender: p.spender, token: p.token,
  allowance: String(p.allowance), period: String(p.period), start: String(p.start), end: String(p.end), salt: String(p.salt), extraData: p.extraData });
export function permissionDeJson(s) {
  try {
    const o = JSON.parse(s);
    const p = { account: o.account, spender: o.spender, token: o.token, allowance: BigInt(o.allowance), period: BigInt(o.period),
      start: BigInt(o.start), end: BigInt(o.end), salt: BigInt(o.salt), extraData: o.extraData };
    return estPermissionEssai(p) ? p : null;
  } catch (_) { return null; }
}

/* ── LES REQUETES ENVOYEES AU WALLET (ce que la page construit, octet pour octet) ── */

/** eth_signTypedData_v4 : le wallet de l universel signe le SpendPermission EIP-712 (popup). */
export function requeteSignature(p) {
  if (!estPermissionEssai(p)) return null;
  const td = donneesAutorisation(p, CHAINE_BASE);
  if (!td.ok) return null;
  return { method: 'eth_signTypedData_v4', params: [p.account, JSON.stringify(td.typedData)] };
}

/** wallet_sendCalls (EIP-5792 v2) d UN appel, atomique. */
export function requeteEnvoi(from, appel) {
  if (!ADR.test(String(from || '')) || !appel || !ADR.test(String(appel.to || '')) || !HEX.test(String(appel.data || ''))) return null;
  return { method: 'wallet_sendCalls', params: [{ version: '2.0', from, chainId: CHAINE_BASE_HEX, atomicRequired: true,
    calls: [{ to: appel.to, data: appel.data, value: '0x0' }] }] };
}

/** approveWithSignature(p, sig) : envoye par `from` = le sub account (chemin de la doc) ou, en repli, l universel. */
export function requeteApprobation(p, signature, from) {
  if (!estPermissionEssai(p)) return null;
  if (min(from) !== min(p.spender) && min(from) !== min(p.account)) return null;
  const a = appelApprobationAvecSignature(p, signature);
  return a.ok ? requeteEnvoi(from, a) : null;
}

/** spend(p, 0,01 USDC) envoye par le sub account. Toute autre valeur est refusee. */
export function requeteDepense(p, valeur = ESSAI.depenseBrut) {
  if (!estPermissionEssai(p) || BigInt(valeur) !== ESSAI.depenseBrut) return null;
  const a = appelDepense(p, valeur);
  return a.ok ? requeteEnvoi(p.spender, a) : null;
}

/** revoke(p) envoye par l universel (msg.sender == account). */
export function requeteRevocation(p) {
  if (!estPermissionEssai(p)) return null;
  const a = appelRevocation(p);
  return a.ok ? requeteEnvoi(p.account, a) : null;
}

/** La simulation d un envoi : un eth_call depuis l expediteur, MEME octets. */
export function simulationDe(requete) {
  const c = requete && requete.params && requete.params[0];
  if (!c || !Array.isArray(c.calls) || c.calls.length !== 1) return null;
  return { method: 'eth_call', params: [{ from: c.from, to: c.calls[0].to, data: c.calls[0].data }, 'latest'] };
}

/** L etape 5 : spend au-dela du plafond, en eth_call SEULEMENT (jamais un wallet_sendCalls). */
export function requeteDepassement(p, depenseDansPeriode) {
  if (!estPermissionEssai(p)) return null;
  const v = BigInt(p.allowance) - BigInt(depenseDansPeriode) + 1n;
  const a = appelDepense(p, v);
  return a.ok ? { valeur: v, requete: { method: 'eth_call', params: [{ from: p.spender, to: a.to, data: a.data }, 'latest'] } } : null;
}

/* ── LECTURES ── */
export const lectureSoldeUsdc = (q) => ({ to: USDC_BASE, data: sel('balanceOf(address)') + adrMot(q) });
export const lectureEstOwner = (wallet, q) => ({ to: wallet, data: sel('isOwnerAddress(address)') + adrMot(q) });
export function decoderBool(h) {
  const s = String(h || '');
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) return null;
  const v = BigInt(s);
  return v === 1n ? true : v === 0n ? false : null;
}
export function decoderUint(h) { const s = String(h || ''); return /^0x[0-9a-fA-F]{64}$/.test(s) ? BigInt(s) : null; }
export function decoderPeriode(h) {
  const s = String(h || '');
  if (!/^0x[0-9a-fA-F]{192}$/.test(s)) return null;
  const w = s.slice(2).match(/.{64}/g).map((x) => BigInt('0x' + x));
  return { start: w[0], end: w[1], spend: w[2] };
}

/** Les octets de revert d une erreur de provider, ou null. */
export function donneesRevert(e) {
  const cands = [e && e.data, e && e.data && e.data.data, e && e.error && e.error.data, e && e.cause && e.cause.data,
    e && e.data && e.data.originalError && e.data.originalError.data];
  for (const c of cands) if (typeof c === 'string' && /^0x[0-9a-fA-F]{8,}$/.test(c)) return c.toLowerCase();
  const m = /(0x[0-9a-fA-F]{8,})/.exec(String((e && e.message) || ''));
  return m ? m[1].toLowerCase() : null;
}
export function decoderErreur(donnees) {
  if (!donnees) return { nom: 'revert without data', selecteur: null, args: [] };
  const s = min(donnees).slice(0, 10);
  const args = (min(donnees).slice(10).match(/.{64}/g) || []).map((x) => BigInt('0x' + x));
  return { nom: ERREURS[s] || 'unknown error', selecteur: s, args };
}

/** Le statut EIP-5792 (wallet_getCallsStatus) : numerique (v2 : 100 pending, 200 confirme, 400+ echec) ou texte (v1). */
export function etatAppels(st) {
  if (!st || typeof st !== 'object') return { fini: false, ok: false, hashes: [] };
  const s = st.status;
  const recus = Array.isArray(st.receipts) ? st.receipts : [];
  const hashes = recus.map((r) => r && r.transactionHash).filter((h) => /^0x[0-9a-fA-F]{64}$/.test(String(h || '')));
  const fini = (typeof s === 'number' && s >= 200) || s === 'CONFIRMED';
  const ok = (s === 200 || s === 'CONFIRMED') && recus.length > 0 && recus.every((r) => r && (r.status === '0x1' || r.status === 1 || r.status === 'success'));
  return { fini, ok, hashes, statut: s };
}
export const idAppels = (res) => (typeof res === 'string' ? res : res && typeof res.id === 'string' ? res.id : null);

/* ── LES TEXTES EN CLAIR (ce qu on va signer) ── */
export function texteEtape(n, ctx = {}) {
  const p = ctx.permission;
  switch (n) {
    case 1: return 'Connect: your Base Account shares its address with this page. Nothing is signed, nothing is sent.';
    case 2: return 'Sub account: your wallet creates (or finds) a sub account for this site. Its key stays in your browser. '
      + 'No funds move.';
    case 3: return p ? 'You sign (in your Base Account popup) a SpendPermission: the sub account ' + p.spender + ' may pull at most '
      + usdcTexte(p.allowance) + ' USDC per day from your Base Account ' + p.account + ', for 1 day (until '
      + new Date(Number(p.end) * 1000).toISOString() + '). Then it is recorded on-chain (approveWithSignature, sent by the '
      + 'sub account; fallback: by your Base Account).' : null;
    case 4: return 'The sub account pulls ' + usdcTexte(ESSAI.depenseBrut) + ' USDC from your Base Account to itself (spend). '
      + 'Both accounts are yours: nothing leaves your hands. Simulated before sending.';
    case 5: return 'A spend ABOVE the daily cap, as an eth_call simulation only: nothing is sent, nothing is signed. '
      + 'The contract must refuse it (ExceededSpendPermission).';
    case 6: return 'You send revoke(SpendPermission) from your Base Account (popup): the permission is cut for good.';
    default: return null;
  }
}

/* ══ LE DEROULE — partage par la page et par le banc fork : les MEMES requetes, construites par les fonctions ci-dessus. ══ */
export function creerEssai({ provider, journal = () => {}, domaine, pause = (ms) => new Promise((o) => setTimeout(o, ms)),
  attenteMaxMs = 120000, pasMs = 1500, tirerSalt } = {}) {
  const etat = { universel: null, sousCompte: null, permission: null, signature: null, revoque: false, depenseFaite: false };
  const req = (r) => provider.request(r);
  const log = (etape, quoi, d) => journal({ t: new Date().toISOString(), step: etape, what: quoi, ...(d || {}) });
  const ethCall = (to, data, from) => req({ method: 'eth_call', params: [from ? { from, to, data } : { to, data }, 'latest'] });
  const lireBool = async (nom, p) => { const a = appelLecture(nom, p); return decoderBool(await ethCall(a.to, a.data)); };
  const lirePeriode = async (p) => { const a = appelLecture('getCurrentPeriod', p); return decoderPeriode(await ethCall(a.to, a.data)); };
  const lireUsdc = async (q) => { const a = lectureSoldeUsdc(q); return decoderUint(await ethCall(a.to, a.data)); };
  const lireOwner = async (w, q) => { try { const a = lectureEstOwner(w, q); return decoderBool(await ethCall(a.to, a.data)); } catch (_) { return null; } };
  const stop = (etape, pourquoi, d) => { log(etape, 'STOP', { reason: pourquoi, ...(d || {}) }); return { ok: false, pourquoi, ...(d || {}) }; };

  async function simuler(etape, requete) {
    const s = simulationDe(requete);
    try { await req(s); log(etape, 'simulation OK (eth_call from ' + s.params[0].from + ')'); return { ok: true }; }
    catch (e) { const err = decoderErreur(donneesRevert(e)); return { ok: false, erreur: err, message: String((e && e.message) || e) }; }
  }
  /* envoie, attend la confirmation, RELIT chaque recu on-chain */
  async function envoyer(etape, requete) {
    let res;
    try { res = await req(requete); }
    catch (e) { return { ok: false, pourquoi: e && e.code === 4001 ? 'rejected in the wallet (4001)' : 'wallet error ' + ((e && e.code) || '') + ' ' + String((e && e.message) || '') }; }
    const id = idAppels(res);
    log(etape, 'wallet_sendCalls accepted', { id });
    if (!id) return { ok: false, pourquoi: 'unreadable wallet answer' };
    let fin = null;
    for (let t = 0; t <= attenteMaxMs; t += pasMs) {
      let st = null;
      try { st = await req({ method: 'wallet_getCallsStatus', params: [id] }); } catch (_) { st = null; }
      const e = etatAppels(st);
      if (e.fini) { fin = e; break; }
      await pause(pasMs);
    }
    if (!fin) return { ok: false, id, pourquoi: 'no confirmation within ' + Math.round(attenteMaxMs / 1000) + ' s (read it again later with the id)' };
    const recus = [];
    for (const h of fin.hashes) {
      let r = null;
      try { r = await req({ method: 'eth_getTransactionReceipt', params: [h] }); } catch (_) { r = null; }
      recus.push({ hash: h, status: r ? r.status : null, bloc: r ? parseInt(r.blockNumber, 16) : null });
    }
    log(etape, 'receipts read on-chain', { id, recus });
    const ok = fin.ok && recus.length > 0 && recus.every((r) => r.status === '0x1');
    return ok ? { ok: true, id, recus } : { ok: false, id, recus, pourquoi: 'status ' + fin.statut + ' / receipt ' + recus.map((r) => r.status).join(',') };
  }

  /* 1. connecter : chaine 8453, smart wallet (code non vide, pas une delegation 7702, isOwnerAddress lisible) */
  async function connecter() {
    let comptes;
    try { comptes = await req({ method: 'eth_requestAccounts' }); }
    catch (e) { return stop(1, e && e.code === 4001 ? 'connection rejected (4001)' : 'cannot connect: ' + String((e && e.message) || e)); }
    const u = Array.isArray(comptes) ? comptes.find((x) => ADR.test(String(x || ''))) : null;
    if (!u) return stop(1, 'the wallet returned no address');
    let ch = await req({ method: 'eth_chainId' });
    if (min(ch) !== CHAINE_BASE_HEX) {
      try { await req({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAINE_BASE_HEX }] }); } catch (_) { /* relu juste apres */ }
      ch = await req({ method: 'eth_chainId' });
    }
    if (min(ch) !== CHAINE_BASE_HEX) return stop(1, 'the wallet is not on Base (chainId ' + ch + ', expected 0x2105)');
    const code = await req({ method: 'eth_getCode', params: [u, 'latest'] });
    const type = typeDeCode(code);
    log(1, 'account read', { account: u, chainId: ch, code: CODE_EN[type], codeBytes: (String(code).length - 2) / 2 });
    if (type === 'VIDE') return stop(1, 'eth_getCode is empty: not a deployed smart wallet (a Base Account that never sent a transaction is not deployed yet; '
      + 'this trial needs a deployed account)', { universel: u });
    if (type === 'DELEGATION_7702') return stop(1, 'this account is an EOA with an EIP-7702 delegation, not a Base Account', { universel: u });
    const ownerDeLuiMeme = await lireOwner(u, u);
    if (ownerDeLuiMeme === null) return stop(1, 'isOwnerAddress unreadable: this contract is not a Coinbase smart wallet', { universel: u });
    const spmOwner = await lireOwner(u, SPEND_PERMISSION_MANAGER);
    const usdc = await lireUsdc(u);
    const eth = BigInt(await req({ method: 'eth_getBalance', params: [u, 'latest'] }));
    etat.universel = u;
    log(1, 'Base Account OK', { spendPermissionManagerOwner: spmOwner, usdc: usdc === null ? null : usdcTexte(usdc), ethWei: String(eth) });
    return { ok: true, universel: u, spmOwner, usdc, eth };
  }

  /* 2. sub account : wallet_getSubAccounts, sinon (geste) wallet_addSubAccount */
  async function trouverSousCompte() {
    if (!etat.universel) return stop(2, 'do step 1 first');
    const r = await sousCompteExistant({ provider, universel: etat.universel, domaine });
    if (!r.ok) return stop(2, r.pourquoi === 'wallet does not support sub accounts' ? 'the wallet answers 4100: no sub accounts here. Stopped.' : r.pourquoi);
    log(2, 'wallet_getSubAccounts', { domain: domaine, subAccount: r.sousCompte });
    if (r.sousCompte) return relireSousCompte(r.sousCompte);
    return { ok: true, sousCompte: null, aCreer: true };
  }
  async function creerSousCompte() {
    if (!etat.universel) return stop(2, 'do step 1 first');
    let res;
    try { res = await req({ method: 'wallet_addSubAccount', params: [{ version: '1', account: { type: 'create' } }] }); }
    catch (e) { return stop(2, e && e.code === 4100 ? 'the wallet answers 4100: no sub accounts here. Stopped.' : e && e.code === 4001 ? 'creation rejected (4001)' : 'wallet error ' + ((e && e.code) || '') + ' ' + String((e && e.message) || '')); }
    const a = res && res.address;
    if (!ADR.test(String(a || ''))) return stop(2, 'unreadable wallet_addSubAccount answer');
    log(2, 'wallet_addSubAccount', { subAccount: a });
    return relireSousCompte(a);
  }
  async function relireSousCompte(a) {
    if (min(a) === min(etat.universel)) return stop(2, 'the returned sub account is the main account itself');
    const type = typeDeCode(await req({ method: 'eth_getCode', params: [a, 'latest'] }));
    const universelOwner = type === 'CONTRAT' ? await lireOwner(a, etat.universel) : null;
    etat.sousCompte = a;
    log(2, 'sub account read', { subAccount: a, code: type === 'VIDE' ? 'EMPTY (not deployed yet: it will be on its first send)' : CODE_EN[type], mainAccountIsOwner: universelOwner });
    return { ok: true, sousCompte: a, code: type, universelOwner };
  }

  /* 3a. construire + signer la SpendPermission */
  async function construirePermission() {
    if (!etat.universel || !etat.sousCompte) return stop(3, 'do steps 1 and 2 first');
    const bloc = await req({ method: 'eth_getBlockByNumber', params: ['latest', false] });
    const t = Number(BigInt(bloc.timestamp));
    const salt = typeof tirerSalt === 'function' ? tirerSalt() : 0n;
    const r = permissionEssai({ universel: etat.universel, sousCompte: etat.sousCompte, maintenant: t, salt });
    if (!r.ok) return stop(3, r.pourquoi);
    etat.permission = r.permission; etat.signature = null; etat.revoque = false; etat.depenseFaite = false;
    const hLocal = hashAutorisation(r.permission, CHAINE_BASE);
    const g = appelLecture('getHash', r.permission);
    const hChaine = min(await ethCall(g.to, g.data));
    log(3, 'permission built', { permission: JSON.parse(permissionVersJson(r.permission)), hashLocal: hLocal, getHashOnChain: hChaine });
    if (hLocal !== hChaine) { etat.permission = null; return stop(3, 'local hash differs from on-chain getHash: nothing is offered for signing'); }
    return { ok: true, permission: r.permission, hash: hLocal };
  }
  async function signer() {
    const p = etat.permission;
    const r = requeteSignature(p);
    if (!r) return stop(3, 'no trial permission to sign');
    let sig;
    try { sig = await req(r); }
    catch (e) { return stop(3, e && e.code === 4001 ? 'signature rejected (4001)' : 'wallet error ' + ((e && e.code) || '') + ' ' + String((e && e.message) || '')); }
    if (!HEX.test(String(sig || '')) || String(sig).length <= 2) return stop(3, 'unreadable signature');
    etat.signature = sig;
    log(3, 'eth_signTypedData_v4 signed', { bytes: (sig.length - 2) / 2, erc6492: min(sig).endsWith('6492649264926492649264926492649264926492649264926492649264926492'), signature: sig });
    return { ok: true, signature: sig };
  }
  async function enregistrer(depuis = 'sous-compte') {
    const p = etat.permission;
    if (!p || !etat.signature) return stop(3, 'sign first');
    const from = depuis === 'universel' ? p.account : p.spender;
    const r = requeteApprobation(p, etat.signature, from);
    if (!r) return stop(3, 'approveWithSignature request refused');
    const s = await simuler(3, r);
    if (!s.ok) return stop(3, 'approveWithSignature simulation: revert ' + s.erreur.nom + ' — nothing sent', { erreur: s.erreur });
    const e = await envoyer(3, r);
    const approuve = await lireBool('isApproved', p), valide = await lireBool('isValid', p);
    const spmOwner = await lireOwner(p.account, SPEND_PERMISSION_MANAGER);
    log(3, 'read on-chain', { isApproved: approuve, isValid: valide, spendPermissionManagerOwner: spmOwner });
    if (!e.ok) return stop(3, 'send: ' + e.pourquoi, { depuis, isApproved: approuve, isValid: valide });
    if (approuve !== true || valide !== true) return stop(3, 'sent, but isApproved/isValid are not true on-chain');
    return { ok: true, depuis, isApproved: approuve, isValid: valide, spmOwner, recus: e.recus };
  }

  /* 4. une depense de 0,01 USDC, soldes et periode relus avant/apres */
  async function depenser() {
    const p = etat.permission;
    const r = requeteDepense(p);
    if (!r) return stop(4, 'no trial permission');
    const avant = { universel: await lireUsdc(p.account), sousCompte: await lireUsdc(p.spender), periode: await lirePeriode(p) };
    log(4, 'before', { mainAccount: usdcTexte(avant.universel), subAccount: usdcTexte(avant.sousCompte), spentToday: usdcTexte(avant.periode.spend) });
    if (avant.universel < ESSAI.depenseBrut) return stop(4, 'your Base Account holds ' + usdcTexte(avant.universel) + ' USDC: at least 0.01 is needed');
    const s = await simuler(4, r);
    if (!s.ok) return stop(4, 'spend simulation: revert ' + s.erreur.nom + ' — nothing sent'
      + (s.erreur.nom === 'unknown error' || s.erreur.nom === 'revert without data' ? ' (likely cause: the SpendPermissionManager is not an owner of your Base Account)' : ''), { erreur: s.erreur });
    const e = await envoyer(4, r);
    const apres = { universel: await lireUsdc(p.account), sousCompte: await lireUsdc(p.spender), periode: await lirePeriode(p) };
    const d = { universel: apres.universel - avant.universel, sousCompte: apres.sousCompte - avant.sousCompte, periode: apres.periode.spend - avant.periode.spend };
    log(4, 'after (read on-chain)', { mainAccount: usdcTexte(apres.universel), subAccount: usdcTexte(apres.sousCompte), spentToday: usdcTexte(apres.periode.spend),
      deltas: { mainAccount: usdcTexte(d.universel), subAccount: usdcTexte(d.sousCompte), today: usdcTexte(d.periode) } });
    if (!e.ok) return stop(4, 'send: ' + e.pourquoi);
    const exact = d.universel === -ESSAI.depenseBrut && d.sousCompte === ESSAI.depenseBrut && d.periode === ESSAI.depenseBrut;
    if (!exact) return stop(4, 'MISMATCH: the balances read on-chain did not move by exactly 0.01 USDC', { ecarts: d });
    etat.depenseFaite = true;
    return { ok: true, avant, apres, ecarts: d, recus: e.recus };
  }

  /* 5. depassement : eth_call seulement */
  async function depasser() {
    const p = etat.permission;
    if (!p) return stop(5, 'no trial permission');
    const per = await lirePeriode(p);
    const x = requeteDepassement(p, per.spend);
    if (!x) return stop(5, 'request refused');
    try {
      await req(x.requete);
      return stop(5, 'ALERT: the spend of ' + usdcTexte(x.valeur) + ' USDC above the cap PASSES in simulation', { valeur: x.valeur });
    } catch (e) {
      const err = decoderErreur(donneesRevert(e));
      log(5, 'refused by the contract (simulation, nothing sent)', { value: usdcTexte(x.valeur), erreur: err.nom, args: err.args.map(String) });
      if (err.nom !== 'ExceededSpendPermission') return stop(5, 'refused, but not for exceeding the cap: ' + err.nom, { erreur: err });
      return { ok: true, valeur: x.valeur, erreur: err };
    }
  }

  /* 6. revoke depuis le Base Account */
  async function revoquer() {
    const p = etat.permission;
    const r = requeteRevocation(p);
    if (!r) return stop(6, 'no trial permission');
    const s = await simuler(6, r);
    if (!s.ok) return stop(6, 'revoke simulation: revert ' + s.erreur.nom + ' — nothing sent', { erreur: s.erreur });
    const e = await envoyer(6, r);
    const revoque = await lireBool('isRevoked', p), valide = await lireBool('isValid', p);
    let apres = null;
    try { const a = appelDepense(p, 1n); await ethCall(a.to, a.data, p.spender); apres = 'PASSE'; }
    catch (x) { apres = decoderErreur(donneesRevert(x)).nom; }
    log(6, 'read on-chain', { isRevoked: revoque, isValid: valide, spendOf1UnitAfter: apres });
    if (!e.ok) return stop(6, 'send: ' + e.pourquoi, { isRevoked: revoque });
    if (revoque !== true || valide !== false) return stop(6, 'sent, but isRevoked/isValid are not cut on-chain');
    etat.revoque = true;
    return { ok: true, isRevoked: revoque, isValid: valide, spendApres: apres, recus: e.recus };
  }

  /* relire l etat d une permission retrouvee (stockage local) */
  async function relirePermission() {
    const p = etat.permission;
    if (!p) return { ok: false };
    const lu = { isApproved: await lireBool('isApproved', p), isRevoked: await lireBool('isRevoked', p), isValid: await lireBool('isValid', p), periode: await lirePeriode(p) };
    etat.revoque = lu.isRevoked === true;
    log(0, 'saved permission found, read on-chain', { isApproved: lu.isApproved, isRevoked: lu.isRevoked, isValid: lu.isValid, spentToday: lu.periode ? usdcTexte(lu.periode.spend) : null });
    return { ok: true, ...lu };
  }

  return { etat, connecter, trouverSousCompte, creerSousCompte, construirePermission, signer, enregistrer, depenser, depasser, revoquer, relirePermission };
}
