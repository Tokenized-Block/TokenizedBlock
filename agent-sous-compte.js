/* agent-sous-compte.js — PROTOTYPE NON DEPLOYE (2026-11-04) : le mode autonome par COINBASE SUB ACCOUNT (decision de Phil).
 *
 * Le modele : l utilisateur (Base Account / Coinbase Smart Wallet) cree, depuis SON navigateur, un sub account dont la cle est une
 * CryptoKey non extractible gardee par le SDK. Il accorde a ce sub account une SpendPermission USDC bornee PAR LUI (curseurs :
 * au plus 100 USDC par jour, au plus 30 jours). Le cerveau decide (verdictAutonome, couche 2) ; s il dit EXECUTER, ce module
 * construit le lot `wallet_sendCalls` envoye FROM le sub account via le provider du SDK, dans le navigateur de l utilisateur.
 * ⛔ TokenizedBlock ne tient ni cle ni fonds. ⛔ Ce module ne signe rien lui-meme : il passe par un `provider.request` INJECTE
 *   (le SDK en vrai, un faux dans les tests). ⛔ Drapeau OFF par defaut.
 *
 * Sources lues le 2026-11-04 (rien de memoire) :
 *   - https://docs.cdp.coinbase.com/coinbase-wallet/improve-ux/sub-accounts.md : wallet_addSubAccount {account:{type:'create'}}
 *     (le SDK genere la cle navigateur si pas de publicKey), wallet_getSubAccounts {account, domain}, envoi par wallet_sendCalls
 *     avec `from` = sub account ; funding 'spend-permissions' (defaut) ou 'manual'.
 *   - https://docs.cdp.coinbase.com/coinbase-wallet/reference/core/provider-rpc-methods/wallet_getSubAccounts.md : erreur 4100
 *     « Requested method not supported » quand le wallet ne sait pas faire.
 *   - https://docs.cdp.coinbase.com/coinbase-wallet/improve-ux/spend-permissions.md : requestSpendPermission({account, spender,
 *     token, chainId, allowance, periodInDays, provider}), prepareSpendCallData({permission, amount}) -> [approveWithSignature?, spend],
 *     envoi wallet_sendCalls version '2.0' atomicRequired true ; requestRevoke (popup) / prepareRevokeCallData (spender, silencieux).
 *   - github.com/base/account-sdk (master) : requestSpendPermission accepte aussi start/end (Date) ; BaseAccountProvider porte
 *     `isBaseAccount = true`.
 * ⛔ INCONNU (non documente) : allowance/periode que propose le popup des AUTO Spend Permissions -> on n en depend PAS (funding
 *   'manual' + permission EXPLICITE bornee par les curseurs) ; disponibilite des Spend Permissions dans l app Coinbase Wallet
 *   (page : « coming soon ») ; absence de popup a l envoi depuis le sub account (implicite dans la doc, jamais mesure ici). */
import { USDC_BASE } from './frais-creation.js';
import { selecteur } from './pool.js';
import { demandeAutorisation, entreeJournal, appelRevocation, appelRevocationCommeSpender,
  SPEND_PERMISSION_MANAGER, SIG_SPEND, SIG_APPROVE_WITH_SIGNATURE } from './agent-autonome.js';

export const MODE_AUTONOME_DRAPEAU = false;          // ⛔ OFF tant que Phil ne l allume pas
export const CHAINE_BASE = 8453;
export const CHAINE_BASE_HEX = '0x2105';
export const USDC_DECIMALES = 6;
/* Bornes de Phil (2026-11-04) : ce sont les MAXIMA des curseurs ; l utilisateur choisit dedans. */
export const PLAFOND_JOUR_MAX_USDC = 100;
export const DUREE_MAX_JOURS = 30;
export const CURSEURS = Object.freeze({
  usdcParJour: Object.freeze({ min: 1, max: PLAFOND_JOUR_MAX_USDC, pas: 1 }),
  jours: Object.freeze({ min: 1, max: DUREE_MAX_JOURS, pas: 1 }),
});
const ADR = /^0x[0-9a-fA-F]{40}$/;
const UN_USDC = 10n ** BigInt(USDC_DECIMALES);
const SEL_SPEND = '0x' + selecteur(SIG_SPEND);
const SEL_APPROVE_SIG = '0x' + selecteur(SIG_APPROVE_WITH_SIGNATURE);

/** « 12.5 » -> 12 500 000 (unites brutes USDC). Pas de flottant : texte decimal, 6 decimales au plus. null si illisible. */
export function usdcBrut(x) {
  const s = typeof x === 'number' ? (Number.isFinite(x) ? String(x) : '') : String(x == null ? '' : x).trim();
  const m = /^(\d+)(?:\.(\d{1,6}))?$/.exec(s);
  if (!m) return null;
  return BigInt(m[1]) * UN_USDC + BigInt((m[2] || '').padEnd(USDC_DECIMALES, '0') || '0');
}

/** (a) Les plafonds CHOISIS par l utilisateur : 0 < usdcParJour <= 100, jours entier dans 1..30. Fonction pure. */
export function validerPlafonds({ usdcParJour, jours } = {}) {
  const r = (pourquoi) => ({ ok: false, etat: 'REFUSE', pourquoi });
  const brut = usdcBrut(usdcParJour);
  if (brut === null) return r('daily amount is not a USDC amount (max 6 decimals)');
  if (brut <= 0n) return r('daily amount must be above 0');
  if (brut > BigInt(PLAFOND_JOUR_MAX_USDC) * UN_USDC) return r('daily amount above ' + PLAFOND_JOUR_MAX_USDC + ' USDC');
  if (!Number.isInteger(jours)) return r('duration must be a whole number of days');
  if (jours < 1) return r('duration must be at least 1 day');
  if (jours > DUREE_MAX_JOURS) return r('duration above ' + DUREE_MAX_JOURS + ' days');
  return { ok: true, allowanceBrut: brut, jours, plafondJour: brut, plafondTx: brut, totalMaxBrut: brut * BigInt(jours), pourquoi: null };
}

/** La requete `requestSpendPermission` (SDK) : universel -> sub account, USDC, 1 jour, fin = maintenant + jours. Ne signe rien. */
export function demandeSousCompte({ universel, sousCompte, plafonds, maintenant } = {}) {
  const r = (pourquoi) => ({ ok: false, etat: 'REFUSE', pourquoi });
  if (!ADR.test(String(universel || ''))) return r('universal account is not an address');
  if (!ADR.test(String(sousCompte || ''))) return r('sub account is not an address');
  const v = validerPlafonds(plafonds);
  if (!v.ok) return r(v.pourquoi);
  if (!Number.isInteger(maintenant) || maintenant <= 0) return r('no clock');
  const fin = maintenant + v.jours * 86400;
  const d = demandeAutorisation({ account: universel, spender: sousCompte, token: USDC_BASE, allowance: v.allowanceBrut,
    periodSec: 86400, start: maintenant, end: fin });
  if (!d.ok) return r(d.pourquoi);
  return { ok: true, etat: 'A_SIGNER_PAR_L_UTILISATEUR', plafonds: v, permission: d.permission,
    requete: { account: universel, spender: sousCompte, token: USDC_BASE, chainId: CHAINE_BASE, allowance: v.allowanceBrut,
      periodInDays: 1, start: new Date(maintenant * 1000), end: new Date(fin * 1000) },
    texte: texteModeAutonome(v), pourquoi: null };
}

/** (c) Visible SEULEMENT si le drapeau est allume ET que le provider est celui du Base Account SDK (`isBaseAccount === true`). */
export function modeAutonomeVisible({ drapeau = MODE_AUTONOME_DRAPEAU, provider } = {}) {
  return drapeau === true && !!provider && provider.isBaseAccount === true;
}

/** Lit le sub account de CE domaine (aucun popup documente). 4100 = le wallet ne sait pas -> mode cache. */
export async function sousCompteExistant({ provider, universel, domaine }) {
  if (!provider || typeof provider.request !== 'function') return { ok: false, sousCompte: null, pourquoi: 'no provider' };
  if (!ADR.test(String(universel || ''))) return { ok: false, sousCompte: null, pourquoi: 'universal account is not an address' };
  try {
    const res = await provider.request({ method: 'wallet_getSubAccounts', params: [{ account: universel, domain: String(domaine) }] });
    const liste = res && Array.isArray(res.subAccounts) ? res.subAccounts : null;
    if (!liste) return { ok: false, sousCompte: null, pourquoi: 'unreadable wallet answer' };
    const a = liste.map((s) => s && s.address).find((x) => ADR.test(String(x || '')));
    return { ok: true, sousCompte: a || null, pourquoi: null };
  } catch (e) {
    return { ok: false, sousCompte: null, pourquoi: e && e.code === 4100 ? 'wallet does not support sub accounts' : 'wallet error ' + ((e && e.code) || '') };
  }
}

/** Cree le sub account (popup de creation cote wallet) — UNIQUEMENT sur un geste de l utilisateur. */
export async function creerSousCompte({ provider, geste }) {
  if (geste !== true) return { ok: false, sousCompte: null, pourquoi: 'needs a user click' };
  if (!provider || typeof provider.request !== 'function') return { ok: false, sousCompte: null, pourquoi: 'no provider' };
  try {
    const res = await provider.request({ method: 'wallet_addSubAccount', params: [{ account: { type: 'create' } }] });
    return ADR.test(String(res && res.address || '')) ? { ok: true, sousCompte: res.address, pourquoi: null }
      : { ok: false, sousCompte: null, pourquoi: 'unreadable wallet answer' };
  } catch (e) {
    return { ok: false, sousCompte: null, pourquoi: e && e.code === 4001 ? 'user rejected' : 'wallet error ' + ((e && e.code) || '') };
  }
}

/**
 * (b) L EXECUTEUR. Ne part que si verdictAutonome a dit EXECUTER ; tout autre cas -> entree REFUSE, provider JAMAIS appele.
 *   preparerDepense : le `prepareSpendCallData` du SDK (injecte) -> [approveWithSignature?, spend] tirant `coutJeton` USDC
 *     de l universel vers le sub account ; chaque appel est REVERIFIE (to = SpendPermissionManager, selecteur spend/approve).
 *   Le lot : [ ...depense, ...plan.appels ], from = sub account, atomique (tout ou rien).
 * ⛔ Une entree EXECUTE est rendue meme si l envoi echoue (erreur notee) : elle compte dans le plafond 24 h (fail-closed).
 */
export async function executerDepuisSousCompte({ verdict, plan, sousCompte, permission, preparerDepense, provider, maintenant }) {
  const refus = (raisons) => ({ envoye: false, entree: entreeJournal({ compte: sousCompte, plan, verdict: { decision: 'REFUSE', raisons }, maintenant }) });
  if (!verdict || verdict.decision !== 'EXECUTER') return refus((verdict && verdict.raisons && verdict.raisons.length) ? verdict.raisons : ['brain did not say EXECUTER']);
  const raisons = [];
  const sc = String(sousCompte || '').toLowerCase();
  if (!ADR.test(sc)) raisons.push('sub account is not an address');
  if (!permission || String(permission.spender || '').toLowerCase() !== sc) raisons.push('grant spender is not this sub account');
  if (!permission || String(permission.token || '').toLowerCase() !== USDC_BASE.toLowerCase()) raisons.push('grant token is not USDC');
  if (!plan || String(plan.simuleDepuis || '').toLowerCase() !== sc) raisons.push('plan was not simulated from the sub account');
  if (!provider || typeof provider.request !== 'function') raisons.push('no provider');
  if (typeof preparerDepense !== 'function') raisons.push('no spend preparer');
  if (raisons.length) return refus(raisons);
  let depense;
  try { depense = await preparerDepense({ permission, amount: BigInt(plan.coutJeton) }); } catch (_) { depense = null; }
  if (!Array.isArray(depense) || !depense.length) return refus(['spend calls not prepared']);
  for (const [i, c] of depense.entries()) {
    const sel = String((c && c.data) || '').slice(0, 10).toLowerCase();
    if (String((c && c.to) || '').toLowerCase() !== SPEND_PERMISSION_MANAGER.toLowerCase()) raisons.push('spend call ' + i + ' is not to SpendPermissionManager');
    else if (sel !== SEL_SPEND && sel !== SEL_APPROVE_SIG) raisons.push('spend call ' + i + ': function ' + sel + ' is not spend/approveWithSignature');
  }
  if (!depense.some((c) => String((c && c.data) || '').slice(0, 10).toLowerCase() === SEL_SPEND)) raisons.push('no spend() in spend calls');
  if (raisons.length) return refus(raisons);
  const calls = [...depense, ...plan.appels].map((c) => ({ to: c.to, data: c.data || '0x', value: c.value || '0x0' }));
  const requete = { method: 'wallet_sendCalls', params: [{ version: '2.0', from: sousCompte, chainId: CHAINE_BASE_HEX, atomicRequired: true, calls }] };
  const entree = { ...entreeJournal({ compte: sousCompte, plan: { ...plan, appels: calls }, verdict, maintenant }), envoi: 'EN_COURS', erreur: null };
  try {
    const res = await provider.request(requete);
    const id = typeof res === 'string' ? res : (res && typeof res.id === 'string' ? res.id : null);
    return { envoye: true, requete, entree: { ...entree, hash: id, envoi: id ? 'ENVOYE' : 'REPONSE_ILLISIBLE' } };
  } catch (e) {
    return { envoye: false, requete, entree: { ...entree, envoi: 'ECHEC', erreur: e && e.code === 4001 ? 'user rejected' : 'wallet error ' + ((e && e.code) || '') } };
  }
}

/**
 * (d) REVOCATION declenchee par l UTILISATEUR (geste obligatoire). Coupe d abord le kill switch LOCAL (aucune execution de plus),
 *   puis rend l appel a envoyer : `revokeAsSpender` depuis le sub account (pas de popup documente) ou `revoke` depuis l universel.
 */
export function revocationUtilisateur({ permission, regles, geste, voie = 'sous-compte', maintenant }) {
  if (geste !== true) return { ok: false, pourquoi: 'needs a user click', regles };
  const coupees = { ...(regles || {}), killSwitch: true };
  const appel = voie === 'universel' ? appelRevocation(permission) : appelRevocationCommeSpender(permission);
  const compte = appel.ok ? appel.from : (permission && permission.account);
  return { ok: appel.ok, pourquoi: appel.ok ? null : appel.pourquoi, regles: coupees, appel: appel.ok ? appel : null,
    entree: { t: Number(maintenant), compte: String(compte || '').toLowerCase(), decision: 'REVOKE', raisons: ['user revoked'], appels: [], coutJeton: null, hash: null } };
}

/** Le texte du panneau : dit EN CLAIR que le cerveau depensera depuis le sub account de l utilisateur, dans SES plafonds. */
export function texteModeAutonome(plafonds) {
  const v = plafonds && plafonds.allowanceBrut != null ? plafonds : validerPlafonds(plafonds);
  if (!v.ok) return null;
  const ent = v.allowanceBrut / UN_USDC, dec = v.allowanceBrut % UN_USDC;
  const usdc = String(ent) + (dec ? '.' + String(dec).padStart(USDC_DECIMALES, '0').replace(/0+$/, '') : '');
  return [
    'Autonomous mode: the brain will spend USDC from YOUR sub account, without asking you each time.',
    'Your limits: at most ' + usdc + ' USDC per day, for ' + v.jours + ' day' + (v.jours > 1 ? 's' : '') + '. You chose them.',
    'A spend permission you sign caps, on-chain, what can move from your main account to the sub account. Funds already in the sub account are not covered by it.',
    'The sub account key stays in your browser. TokenizedBlock holds no key and no funds.',
    'The brain only runs simulated, ready plans on allowed contracts, and logs every run and every refusal with its reasons.',
    'You can stop everything at any time with Revoke.',
  ];
}
