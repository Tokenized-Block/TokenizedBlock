/* agent-autonome.js — PROTOTYPE NON DEPLOYE (2026-11-04) : le « mode autonome » propose a Phil, parties QUI NE SIGNENT PAS.
 *
 * ⛔ CE MODULE NE SIGNE RIEN, N ENVOIE RIEN, NE TIENT AUCUNE CLE. Il :
 *   1. construit la DEMANDE d autorisation (un SpendPermission, struct de coinbase/spend-permissions) que le wallet de
 *      l utilisateur signera lui-meme — ou refuse de la construire si elle sort des bornes ;
 *   2. encode l appel NON SIGNE `revoke(SpendPermission)` que l utilisateur envoie depuis SON wallet pour tout couper ;
 *   3. juge, en fonction pure, si un plan PEUT etre execute sans l humain (couche 2 de la double securite) ;
 *   4. met en forme l entree de journal visible de chaque execution autonome.
 *
 * Sources (lues le 2026-11-04, pas de memoire) :
 *   - struct + fonctions : https://github.com/coinbase/spend-permissions (src/SpendPermissionManager.sol) :
 *     (account, spender, token, uint160 allowance, uint48 period, uint48 start, uint48 end, uint256 salt, bytes extraData) ;
 *     spend() transfere account -> SPENDER (pas vers un contrat choisi) ; revoke() exige msg.sender == account.
 *   - adresse SpendPermissionManager (README du meme depot), code present sur Base mainnet (eth_getCode lu le 2026-11-04).
 *   - NATIVE_TOKEN (ERC-7528) : constante du meme fichier source.
 * ⛔ BORNE : une SpendPermission ne borne QUE le montant tire par periode. Elle ne choisit PAS les contrats appeles ensuite :
 *   cette liste blanche vit dans `verdictAutonome`.
 * DECISION DE PHIL (2026-11-04) : le `spender` est le SUB ACCOUNT Coinbase de l utilisateur, dont la cle est une CryptoKey
 *   non extractible dans SON navigateur (agent-sous-compte.js). La voie « Server Wallet » (cle chez nous + Policy Engine) est
 *   PARQUEE : TokenizedBlock ne tient ni cle ni fonds. Bornes : au plus 1 jour par periode, au plus 30 jours de vie. */
import { selecteur } from './pool.js';
import { keccak256Hex } from './keccak.js';

export const SPEND_PERMISSION_MANAGER = '0xf85210B21cC50302F477BA56686d2019dC9b67Ad';
export const NATIVE_TOKEN = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const ADR = /^0x[0-9a-fA-F]{40}$/;
const TUPLE = '(address,address,address,uint160,uint48,uint48,uint48,uint256,bytes)';
export const SIG_REVOKE = 'revoke(' + TUPLE + ')';
/* Signatures lues dans src/SpendPermissionManager.sol (github.com/coinbase/spend-permissions, branche main, 2026-11-04). */
export const SIG_REVOKE_AS_SPENDER = 'revokeAsSpender(' + TUPLE + ')';
export const SIG_SPEND = 'spend(' + TUPLE + ',uint160)';
export const SIG_APPROVE_WITH_SIGNATURE = 'approveWithSignature(' + TUPLE + ',bytes)';
const U48 = (1n << 48n) - 1n, U160 = (1n << 160n) - 1n, U256 = (1n << 256n) - 1n;

/* Bornes du mode autonome — decision de Phil du 2026-11-04 : au plus 30 jours ; la periode est le JOUR (plafond par jour ON-CHAIN). */
export const BORNES_DEFAUT = Object.freeze({
  dureeMaxSec: 30 * 86400,     // une autorisation ne vit pas plus de 30 jours
  periodeMinSec: 86400,        // periode de remise a zero : exactement 1 jour
  periodeMaxSec: 86400,
});

const big = (x) => { try { return BigInt(x); } catch (_) { return null; } };
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const adrMot = (a) => a.slice(2).toLowerCase().padStart(64, '0');

/** La demande que l utilisateur signera (couche 1). Refuse tout ce qui sort des bornes ; ne signe rien. */
export function demandeAutorisation({ account, spender, token, allowance, periodSec, start, end, salt = 0n, extraData = '0x' }, bornes = BORNES_DEFAUT) {
  const r = (pourquoi) => ({ ok: false, etat: 'REFUSE', pourquoi });
  if (!ADR.test(String(account || ''))) return r('account is not an address');
  if (!ADR.test(String(spender || ''))) return r('spender is not an address');
  if (!ADR.test(String(token || ''))) return r('token is not an address');
  if (String(account).toLowerCase() === String(spender).toLowerCase()) return r('spender cannot be the account itself');
  const al = big(allowance), pe = big(periodSec), st = big(start), en = big(end), sa = big(salt);
  if (al === null || al <= 0n || al > U160) return r('allowance must be a positive uint160');
  if (pe === null || pe <= 0n || pe > U48) return r('period must be a positive uint48');
  if (st === null || en === null || st < 0n || en > U48 || st >= en) return r('start must be before end (uint48)');
  if (sa === null || sa < 0n || sa > U256) return r('salt must be a uint256');
  if (pe < BigInt(bornes.periodeMinSec)) return r('period shorter than ' + bornes.periodeMinSec + ' s');
  if (pe > BigInt(bornes.periodeMaxSec)) return r('period longer than ' + bornes.periodeMaxSec + ' s');
  if (en - st > BigInt(bornes.dureeMaxSec)) return r('grant lasts longer than ' + bornes.dureeMaxSec + ' s');
  if (!/^0x([0-9a-fA-F]{2})*$/.test(String(extraData))) return r('extraData is not hex bytes');
  return { ok: true, etat: 'A_SIGNER_PAR_L_UTILISATEUR',
    permission: { account, spender, token, allowance: al, period: pe, start: st, end: en, salt: sa, extraData: String(extraData) },
    pourquoi: null };
}

/** L appel NON SIGNE de revocation : `to` = SpendPermissionManager, envoye par le wallet de l utilisateur (msg.sender == account). */
export function appelRevocation(permission) { return revocationEncodee(permission, SIG_REVOKE, 'account'); }

/** Variante : `revokeAsSpender(SpendPermission)` envoye DEPUIS le sub account (msg.sender == spender), sur un geste de l utilisateur. */
export function appelRevocationCommeSpender(permission) { return revocationEncodee(permission, SIG_REVOKE_AS_SPENDER, 'spender'); }

/* la permission relue SANS les bornes du mode autonome (une permission existante peut etre plus large : on l encode telle quelle) */
const permissionLue = (permission) => {
  const p = permission || {};
  return demandeAutorisation({ ...p, periodSec: p.period }, { dureeMaxSec: Number(U48), periodeMinSec: 1, periodeMaxSec: Number(U48) });
};
const octetsRembourres = (hex) => { const d = String(hex).slice(2); return mot(d.length / 2) + d.padEnd(Math.ceil(d.length / 64) * 64, '0'); };
/* le CORPS du tuple SpendPermission (dynamique a cause de extraData) : 9 tetes + longueur + donnees rembourrees */
const corpsTuple = (q) => adrMot(q.account) + adrMot(q.spender) + adrMot(q.token)
  + mot(q.allowance) + mot(q.period) + mot(q.start) + mot(q.end) + mot(q.salt)
  + mot(9 * 32)                                    // offset de extraData dans le tuple
  + octetsRembourres(q.extraData);

function revocationEncodee(permission, sig, qui) {
  const d = permissionLue(permission);
  if (!d.ok) return { ok: false, etat: 'REFUSE', pourquoi: 'not a valid permission: ' + d.pourquoi };
  const q = d.permission;
  const corps = '0x' + selecteur(sig) + mot(0x20) + corpsTuple(q);   // 0x20 = offset du tuple
  return { ok: true, etat: 'A_SIGNER_PAR_L_UTILISATEUR', from: q[qui], to: SPEND_PERMISSION_MANAGER, value: '0x0', data: corps };
}

/* ═══ Ajout 2026-11-05 — encodeurs prouves contre le VRAI SpendPermissionManager sur un fork de Base (banc-agent-spend-permission-fork-20261105.mjs).
 * Source relue le 2026-11-05 : github.com/coinbase/spend-permissions, src/SpendPermissionManager.sol (branche main) :
 *   - approve(SpendPermission) exige msg.sender == account ; approveWithSignature(SpendPermission, bytes) : n importe qui l envoie,
 *     la signature est validee par PublicERC6492Validator.isValidSignatureNowAllowSideEffects(account, getHash(p), sig) ;
 *   - spend(SpendPermission, uint160) exige msg.sender == spender, puis _transferFrom appelle CoinbaseSmartWallet(account).execute(...) :
 *     ⛔ un `account` EOA n a pas de execute -> spend REVERT. L account doit etre un smart wallet (Base Account) dont le
 *     SpendPermissionManager est OWNER (le banc le prouve, temoin EOA compris) ;
 *   - getHash = EIP-712, domaine (name "Spend Permission Manager", version "1", chainId, verifyingContract = ce contrat),
 *     type SpendPermission(address account,address spender,address token,uint160 allowance,uint48 period,uint48 start,uint48 end,uint256 salt,bytes extraData). */
export const SIG_APPROVE = 'approve(' + TUPLE + ')';
export const TYPE_PERMISSION = 'SpendPermission(address account,address spender,address token,uint160 allowance,uint48 period,uint48 start,uint48 end,uint256 salt,bytes extraData)';
export const NOM_DOMAINE_SPM = 'Spend Permission Manager';
export const VERSION_DOMAINE_SPM = '1';
const LECTURES = Object.freeze({ isApproved: 'isApproved', isRevoked: 'isRevoked', isValid: 'isValid', getCurrentPeriod: 'getCurrentPeriod', getHash: 'getHash' });
const HEX_OCTETS = /^0x([0-9a-fA-F]{2})*$/;
const k = (octets) => keccak256Hex(octets);
const octetsDe = (hex) => Uint8Array.from((String(hex).slice(2).match(/../g) || []).map((x) => parseInt(x, 16)));
const kTexte = (s) => k(new TextEncoder().encode(s)).slice(2);

/** Les donnees EIP-712 que le wallet de l utilisateur signe (eth_signTypedData_v4). Ne signe rien. */
export function donneesAutorisation(permission, chainId) {
  const d = permissionLue(permission);
  if (!d.ok) return { ok: false, etat: 'REFUSE', pourquoi: 'not a valid permission: ' + d.pourquoi };
  const q = d.permission;
  return { ok: true, typedData: {
    domain: { name: NOM_DOMAINE_SPM, version: VERSION_DOMAINE_SPM, chainId: Number(chainId), verifyingContract: SPEND_PERMISSION_MANAGER },
    primaryType: 'SpendPermission',
    types: { SpendPermission: [{ name: 'account', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'token', type: 'address' },
      { name: 'allowance', type: 'uint160' }, { name: 'period', type: 'uint48' }, { name: 'start', type: 'uint48' }, { name: 'end', type: 'uint48' },
      { name: 'salt', type: 'uint256' }, { name: 'extraData', type: 'bytes' }] },
    message: { account: q.account, spender: q.spender, token: q.token, allowance: String(q.allowance), period: String(q.period),
      start: String(q.start), end: String(q.end), salt: String(q.salt), extraData: q.extraData },
  } };
}

/** = SpendPermissionManager.getHash(p) sur la chaine `chainId` (compare au contrat reel par le banc fork). */
export function hashAutorisation(permission, chainId) {
  const d = permissionLue(permission);
  if (!d.ok) return null;
  const q = d.permission;
  const dom = k(octetsDe('0x' + kTexte('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
    + kTexte(NOM_DOMAINE_SPM) + kTexte(VERSION_DOMAINE_SPM) + mot(chainId) + adrMot(SPEND_PERMISSION_MANAGER)));
  const st = k(octetsDe('0x' + kTexte(TYPE_PERMISSION) + adrMot(q.account) + adrMot(q.spender) + adrMot(q.token)
    + mot(q.allowance) + mot(q.period) + mot(q.start) + mot(q.end) + mot(q.salt) + k(octetsDe(q.extraData)).slice(2)));
  return k(octetsDe('0x1901' + dom.slice(2) + st.slice(2)));
}

/** approve(p) : NON SIGNE, `from` = l account (pour un smart wallet : appel interne via execute). */
export function appelApprobation(permission) {
  const d = permissionLue(permission);
  if (!d.ok) return { ok: false, etat: 'REFUSE', pourquoi: 'not a valid permission: ' + d.pourquoi };
  return { ok: true, etat: 'A_SIGNER_PAR_L_UTILISATEUR', from: d.permission.account, to: SPEND_PERMISSION_MANAGER, value: '0x0',
    data: '0x' + selecteur(SIG_APPROVE) + mot(0x20) + corpsTuple(d.permission) };
}

/** approveWithSignature(p, signature) : la signature vient du wallet de l utilisateur ; n importe qui peut poser l appel. */
export function appelApprobationAvecSignature(permission, signature) {
  const d = permissionLue(permission);
  if (!d.ok) return { ok: false, etat: 'REFUSE', pourquoi: 'not a valid permission: ' + d.pourquoi };
  if (!HEX_OCTETS.test(String(signature || '')) || String(signature).length <= 2) return { ok: false, etat: 'REFUSE', pourquoi: 'signature is not hex bytes' };
  const t = corpsTuple(d.permission);
  return { ok: true, etat: 'A_ENVOYER', to: SPEND_PERMISSION_MANAGER, value: '0x0',
    data: '0x' + selecteur(SIG_APPROVE_WITH_SIGNATURE) + mot(0x40) + mot(0x40 + t.length / 2) + t + octetsRembourres(signature) };
}

/** spend(p, valeur) : NON SIGNE, `from` = le spender (le sub account). Le plafond par periode est verifie PAR LE CONTRAT. */
export function appelDepense(permission, valeur) {
  const d = permissionLue(permission);
  if (!d.ok) return { ok: false, etat: 'REFUSE', pourquoi: 'not a valid permission: ' + d.pourquoi };
  const v = big(valeur);
  if (v === null || v <= 0n || v > U160) return { ok: false, etat: 'REFUSE', pourquoi: 'value must be a positive uint160' };
  return { ok: true, etat: 'A_SIGNER_PAR_LE_SPENDER', from: d.permission.spender, to: SPEND_PERMISSION_MANAGER, value: '0x0',
    data: '0x' + selecteur(SIG_SPEND) + mot(0x40) + mot(v) + corpsTuple(d.permission) };
}

/** eth_call de lecture (isApproved | isRevoked | isValid | getCurrentPeriod | getHash) : de quoi remplir `grant` de verdictAutonome. */
export function appelLecture(nom, permission) {
  if (!Object.prototype.hasOwnProperty.call(LECTURES, nom)) return { ok: false, pourquoi: 'unknown read ' + nom };
  const d = permissionLue(permission);
  if (!d.ok) return { ok: false, pourquoi: 'not a valid permission: ' + d.pourquoi };
  return { ok: true, to: SPEND_PERMISSION_MANAGER, data: '0x' + selecteur(LECTURES[nom] + '(' + TUPLE + ')') + mot(0x20) + corpsTuple(d.permission) };
}

/**
 * COUCHE 2 — le cerveau decide si un plan peut partir SANS l humain. Fonction pure ; rien n est lu ni envoye.
 *   plan       : { etat, simule, appels: [{to, data, value}], coutJeton } — coutJeton = ce que le plan tire de l autorisation (unites brutes)
 *   grant      : { permission, revoque, depenseDansPeriode, debutPeriode } — lu on-chain (getCurrentPeriod / isRevoked) par l appelant
 *   regles     : { listeBlanche: { [adresseMinuscule]: [selecteurs 0x........] }, plafondTx, plafondJour, killSwitch }
 *   journal    : [{ t (s), coutJeton, decision }] — les executions autonomes passees de CE compte
 *   maintenant : secondes (horloge de l appelant)
 * Rend { decision: 'EXECUTER' | 'REFUSE', raisons: [...] } — TOUTES les raisons de refus, pas la premiere seulement.
 */
export function verdictAutonome({ plan, grant, regles, journal = [], maintenant }) {
  const raisons = [];
  const t = big(maintenant);
  if (t === null) raisons.push('no clock');
  if (!regles || regles.killSwitch !== false) raisons.push('kill switch is on (or not set)');
  if (!plan || plan.etat !== 'PRET') raisons.push('plan is not PRET (' + (plan && plan.etat) + ')');
  if (!plan || plan.simule !== true) raisons.push('plan was not simulated');
  const appels = plan && Array.isArray(plan.appels) ? plan.appels : [];
  if (!appels.length) raisons.push('plan has no calls');
  const lb = (regles && regles.listeBlanche) || {};
  for (const [i, c] of appels.entries()) {
    const to = String((c && c.to) || '').toLowerCase();
    const sel = String((c && c.data) || '').slice(0, 10).toLowerCase();
    const permis = Object.prototype.hasOwnProperty.call(lb, to) ? lb[to] : null;
    if (!permis) { raisons.push('call ' + i + ': ' + (to || 'no destination') + ' is not on the allowlist'); continue; }
    if (!permis.map((s) => String(s).toLowerCase()).includes(sel)) raisons.push('call ' + i + ': function ' + sel + ' is not allowed on ' + to);
  }
  const cout = big(plan && plan.coutJeton);
  if (cout === null || cout < 0n) raisons.push('plan cost is not measured');
  const pTx = big(regles && regles.plafondTx), pJour = big(regles && regles.plafondJour);
  if (pTx === null || pJour === null) raisons.push('caps are not set');
  if (cout !== null && pTx !== null && cout > pTx) raisons.push('cost ' + cout + ' above per-tx cap ' + pTx);
  if (cout !== null && pJour !== null && t !== null) {
    let deja = 0n;
    for (const e of journal) {
      const te = big(e && e.t), ce = big(e && e.coutJeton);
      if (e && e.decision === 'EXECUTE' && te !== null && ce !== null && te > t - 86400n && te <= t) deja += ce;
    }
    if (deja + cout > pJour) raisons.push('24 h total ' + (deja + cout) + ' above daily cap ' + pJour);
  }
  const p = grant && grant.permission;
  if (!p) raisons.push('no on-chain grant');
  else {
    if (grant.revoque !== false) raisons.push('grant revoked (or not read)');
    const st = big(p.start), en = big(p.end), al = big(p.allowance), dep = big(grant.depenseDansPeriode);
    if (t !== null && st !== null && en !== null && (t < st || t >= en)) raisons.push('grant not active now');
    if (dep === null) raisons.push('spend in current period not read');
    else if (al !== null && cout !== null && dep + cout > al) raisons.push('grant allowance left ' + (al - dep) + ' < cost ' + cout);
  }
  return raisons.length ? { decision: 'REFUSE', raisons } : { decision: 'EXECUTER', raisons: [] };
}

/** L entree de journal VISIBLE (panneau + /api) de chaque decision autonome — ecrite AVANT l envoi, completee par le hash. */
export function entreeJournal({ compte, plan, verdict, maintenant, hash = null }) {
  return {
    t: Number(maintenant), compte: String(compte || '').toLowerCase(),
    decision: verdict && verdict.decision === 'EXECUTER' ? 'EXECUTE' : 'REFUSE',
    raisons: (verdict && verdict.raisons) || [],
    appels: ((plan && plan.appels) || []).map((c) => ({ to: c.to, selecteur: String(c.data || '').slice(0, 10), value: c.value || '0x0' })),
    coutJeton: plan && plan.coutJeton != null ? String(plan.coutJeton) : null,
    hash,
  };
}
