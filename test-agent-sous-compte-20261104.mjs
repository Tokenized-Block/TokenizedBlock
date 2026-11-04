/* test-agent-sous-compte-20261104.mjs — PROTOTYPE mode autonome par Coinbase SUB ACCOUNT (agent-sous-compte.js).
 * A. validerPlafonds / usdcBrut : 0 < x <= 100 USDC par jour, 1..30 jours entiers, pas de flottant.
 * B. demandeSousCompte : requete requestSpendPermission (universel -> sub account, USDC, 1 jour, fin = +jours).
 * C. modeAutonomeVisible / sousCompteExistant / creerSousCompte : drapeau OFF par defaut, isBaseAccount, 4100, geste.
 * D. executerDepuisSousCompte : faux provider ; REFUSE n appelle JAMAIS le provider ; lot from = sub account, atomique.
 * E. revocationUtilisateur + texteModeAutonome.
 * MUTANTS : sur des COPIES du module (dossier temporaire) ; chacun doit faire rougir au moins un scenario.
 * ⛔ BORNE : hors reseau, faux provider. NE PROUVE PAS : le vrai SDK, un popup reel, une signature, un envoi, la forme reelle
 *   de la reponse wallet_sendCalls, ni que prepareSpendCallData rend exactement ces appels. Aucun envoi, aucune cle.
 * ⛔ PORTABLE : process.exitCode, jamais process.exit. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const abs = (m) => pathToFileURL(path.join(ICI, m)).href;
const { selecteur } = await import(abs('pool.js'));
const AA = await import(abs('agent-autonome.js'));
const { USDC_BASE } = await import(abs('frais-creation.js'));
const SRC = fs.readFileSync(path.join(ICI, 'agent-sous-compte.js'), 'utf8');
const DOSSIER = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-souscompte-'));
let nCopies = 0;
async function charger(src) {
  const f = path.join(DOSSIER, 'agent-sous-compte-' + (nCopies += 1) + '.mjs');
  let s = src;
  for (const m of ['frais-creation.js', 'pool.js', 'agent-autonome.js']) s = s.split("from './" + m + "'").join("from '" + abs(m) + "'");
  fs.writeFileSync(f, s);
  return import(pathToFileURL(f).href);
}

const UNIV = '0x' + '11'.repeat(20), SUB = '0x' + '22'.repeat(20), RAIL = '0x' + '44'.repeat(20);
const T0 = 1_800_000_000;
const SEL_SWAP = '0x' + selecteur('swap(bytes)');
const SEL_SPEND = '0x' + selecteur(AA.SIG_SPEND), SEL_APPROVE = '0x' + selecteur(AA.SIG_APPROVE_WITH_SIGNATURE);
const SPM = AA.SPEND_PERMISSION_MANAGER;

function fauxProvider({ isBaseAccount = true, reponses = {}, erreurs = {} } = {}) {
  const appels = [];
  return { isBaseAccount, appels, async request(a) {
    appels.push(a);
    if (erreurs[a.method]) { const e = new Error('x'); e.code = erreurs[a.method]; throw e; }
    return reponses[a.method];
  } };
}

async function scenarios(src) {
  const M = await charger(src);
  const R = {};
  const vrai = (k, f) => { try { R[k] = !!f(); } catch (e) { R[k] = false; R[k + ':err'] = String(e && e.message).slice(0, 120); } };
  /* ── A ── */
  vrai('A1 12.5 USDC -> 12 500 000 brut', () => M.usdcBrut('12.5') === 12_500_000n && M.usdcBrut(100) === 100_000_000n && M.usdcBrut('0.000001') === 1n);
  vrai('A2 7 decimales / exposant / negatif illisibles', () => M.usdcBrut('1.0000001') === null && M.usdcBrut(1e-7) === null && M.usdcBrut('-1') === null && M.usdcBrut('') === null);
  const ref = M.validerPlafonds({ usdcParJour: '25', jours: 7 });
  vrai('A3 reference 25 USDC x 7 j acceptee', () => ref.ok && ref.allowanceBrut === 25_000_000n && ref.plafondJour === 25_000_000n && ref.totalMaxBrut === 175_000_000n);
  vrai('A4 100 USDC et 30 j pile acceptes (bornes inclusives)', () => M.validerPlafonds({ usdcParJour: 100, jours: 30 }).ok);
  vrai('A5 100.000001 refuse', () => /above 100/.test(M.validerPlafonds({ usdcParJour: '100.000001', jours: 1 }).pourquoi));
  vrai('A6 0 refuse', () => /above 0/.test(M.validerPlafonds({ usdcParJour: 0, jours: 1 }).pourquoi));
  vrai('A7 31 j refuse', () => /above 30/.test(M.validerPlafonds({ usdcParJour: 1, jours: 31 }).pourquoi));
  vrai('A8 0 j refuse', () => /at least 1/.test(M.validerPlafonds({ usdcParJour: 1, jours: 0 }).pourquoi));
  vrai('A9 1.5 j refuse', () => /whole number/.test(M.validerPlafonds({ usdcParJour: 1, jours: 1.5 }).pourquoi));
  vrai('A10 curseurs bornes a 100 et 30', () => M.CURSEURS.usdcParJour.max === 100 && M.CURSEURS.jours.max === 30 && M.CURSEURS.usdcParJour.min > 0 && M.CURSEURS.jours.min === 1);
  /* ── B ── */
  const d = M.demandeSousCompte({ universel: UNIV, sousCompte: SUB, plafonds: { usdcParJour: '25', jours: 7 }, maintenant: T0 });
  vrai('B1 requete : universel -> sub account, USDC Base, chaine 8453, 1 jour', () => d.ok && d.requete.account === UNIV && d.requete.spender === SUB
    && d.requete.token === USDC_BASE && d.requete.chainId === 8453 && d.requete.periodInDays === 1 && d.requete.allowance === 25_000_000n);
  vrai('B2 start / end en Date, fin = +7 j', () => d.requete.start.getTime() === T0 * 1000 && d.requete.end.getTime() === (T0 + 7 * 86400) * 1000);
  vrai('B3 permission miroir (periode 86400 s, end - start = 7 j)', () => d.permission.period === 86400n && d.permission.end - d.permission.start === BigInt(7 * 86400));
  vrai('B4 plafonds hors bornes -> pas de requete', () => M.demandeSousCompte({ universel: UNIV, sousCompte: SUB, plafonds: { usdcParJour: 101, jours: 7 }, maintenant: T0 }).ok === false);
  vrai('B5 sub account = universel refuse', () => M.demandeSousCompte({ universel: UNIV, sousCompte: UNIV, plafonds: { usdcParJour: 1, jours: 1 }, maintenant: T0 }).ok === false);
  vrai('B6 sans horloge refuse', () => /no clock/.test(M.demandeSousCompte({ universel: UNIV, sousCompte: SUB, plafonds: { usdcParJour: 1, jours: 1 } }).pourquoi));
  /* ── C ── */
  vrai('C1 drapeau OFF par defaut : invisible meme pour un Base Account', () => M.MODE_AUTONOME_DRAPEAU === false && M.modeAutonomeVisible({ provider: { isBaseAccount: true } }) === false);
  vrai('C2 drapeau ON + isBaseAccount -> visible', () => M.modeAutonomeVisible({ drapeau: true, provider: { isBaseAccount: true } }) === true);
  vrai('C3 drapeau ON + autre wallet -> invisible', () => M.modeAutonomeVisible({ drapeau: true, provider: { isMetaMask: true } }) === false
    && M.modeAutonomeVisible({ drapeau: true, provider: { isBaseAccount: 'yes' } }) === false && M.modeAutonomeVisible({ drapeau: true }) === false);
  {
    const p = fauxProvider({ reponses: { wallet_getSubAccounts: { subAccounts: [{ address: SUB, factory: '0x', factoryData: '0x' }] } } });
    const r = await M.sousCompteExistant({ provider: p, universel: UNIV, domaine: 'https://tokenizedblock.space' });
    R['C4 wallet_getSubAccounts {account, domain} -> le sub account'] = r.ok && r.sousCompte === SUB && p.appels[0].method === 'wallet_getSubAccounts'
      && p.appels[0].params[0].account === UNIV && p.appels[0].params[0].domain === 'https://tokenizedblock.space';
    const r4100 = await M.sousCompteExistant({ provider: fauxProvider({ erreurs: { wallet_getSubAccounts: 4100 } }), universel: UNIV, domaine: 'x' });
    R['C5 4100 -> non supporte'] = r4100.ok === false && /does not support/.test(r4100.pourquoi);
    const vide = await M.sousCompteExistant({ provider: fauxProvider({ reponses: { wallet_getSubAccounts: { subAccounts: [] } } }), universel: UNIV, domaine: 'x' });
    R['C6 liste vide -> ok, aucun sub account'] = vide.ok === true && vide.sousCompte === null;
    const pc = fauxProvider({ reponses: { wallet_addSubAccount: { address: SUB } } });
    const sansGeste = await M.creerSousCompte({ provider: pc });
    const avec = await M.creerSousCompte({ provider: pc, geste: true });
    R['C7 creation : rien sans geste, puis wallet_addSubAccount {type:create}'] = sansGeste.ok === false && avec.ok && avec.sousCompte === SUB
      && pc.appels.length === 1 && pc.appels[0].method === 'wallet_addSubAccount' && pc.appels[0].params[0].account.type === 'create';
  }
  /* ── D ── */
  const permission = d.permission;
  const plan = { etat: 'PRET', simule: true, simuleDepuis: SUB, appels: [{ to: RAIL, data: SEL_SWAP + '00'.repeat(32), value: '0x0' }], coutJeton: 2_000_000n };
  const regles = { listeBlanche: { [RAIL]: [SEL_SWAP] }, plafondTx: ref.plafondTx, plafondJour: ref.plafondJour, killSwitch: false };
  const grant = { permission, revoque: false, depenseDansPeriode: 0n };
  const maintenant = T0 + 3600;
  const verdict = AA.verdictAutonome({ plan, grant, regles, journal: [], maintenant });
  R['D0 verdict de reference EXECUTER'] = verdict.decision === 'EXECUTER';
  const depenseOk = async ({ amount }) => [{ to: SPM, data: SEL_APPROVE + '00'.repeat(32), value: '0x0' }, { to: SPM, data: SEL_SPEND + amount.toString(16).padStart(64, '0'), value: '0x0' }];
  const exec = async (o = {}) => {
    const provider = o.provider || fauxProvider({ reponses: { wallet_sendCalls: { id: '0xabc' } } });
    const r = await M.executerDepuisSousCompte({ verdict, plan, sousCompte: SUB, permission, preparerDepense: depenseOk, provider, maintenant, ...o, provider });
    return { r, provider };
  };
  {
    const { r, provider } = await exec();
    const q = provider.appels[0];
    R['D1 un seul appel provider : wallet_sendCalls from = sub account, 2.0, atomique, Base'] = r.envoye === true && provider.appels.length === 1
      && q.method === 'wallet_sendCalls' && q.params[0].from === SUB && q.params[0].version === '2.0' && q.params[0].atomicRequired === true && q.params[0].chainId === '0x2105';
    R['D2 lot = [approveWithSignature, spend(cout), swap] dans cet ordre'] = q.params[0].calls.length === 3 && q.params[0].calls[0].data.startsWith(SEL_APPROVE)
      && q.params[0].calls[1].data.startsWith(SEL_SPEND) && q.params[0].calls[1].data.endsWith((2_000_000).toString(16).padStart(64, '0')) && q.params[0].calls[2].to === RAIL;
    R['D3 journal EXECUTE, compte = sub account, id du lot note'] = r.entree.decision === 'EXECUTE' && r.entree.compte === SUB && r.entree.hash === '0xabc' && r.entree.envoi === 'ENVOYE' && r.entree.appels.length === 3;
    const brut = await exec({ provider: fauxProvider({ reponses: { wallet_sendCalls: '0xdef' } }) });
    R['D4 reponse chaine nue acceptee comme id'] = brut.r.entree.hash === '0xdef';
  }
  const refuse = async (nom, o, motif) => {
    const { r, provider } = await exec(o);
    R['D5 ' + nom + ' -> REFUSE, provider jamais appele'] = r.envoye === false && provider.appels.length === 0 && r.entree.decision === 'REFUSE'
      && r.entree.raisons.some((x) => x.includes(motif));
  };
  await refuse('verdict REFUSE', { verdict: { decision: 'REFUSE', raisons: ['kill switch is on (or not set)'] } }, 'kill switch');
  await refuse('verdict absent', { verdict: undefined }, 'did not say EXECUTER');
  await refuse('spender != sub account', { sousCompte: '0x' + '66'.repeat(20) }, 'not this sub account');
  await refuse('token != USDC', { permission: { ...permission, token: '0x' + '77'.repeat(20) } }, 'not USDC');
  await refuse('plan simule depuis l universel', { plan: { ...plan, simuleDepuis: UNIV } }, 'not simulated from the sub account');
  await refuse('depense vers un autre contrat', { preparerDepense: async () => [{ to: RAIL, data: SEL_SPEND }] }, 'not to SpendPermissionManager');
  await refuse('depense : autre fonction', { preparerDepense: async () => [{ to: SPM, data: '0x095ea7b3' }, { to: SPM, data: SEL_SPEND }] }, 'is not spend/approveWithSignature');
  await refuse('depense sans spend()', { preparerDepense: async () => [{ to: SPM, data: SEL_APPROVE }] }, 'no spend()');
  await refuse('depense non preparee', { preparerDepense: async () => { throw new Error('x'); } }, 'not prepared');
  {
    const { r } = await exec({ provider: fauxProvider({ erreurs: { wallet_sendCalls: 4001 } }) });
    R['D6 rejet wallet : EXECUTE garde (compte dans 24 h), envoi ECHEC, user rejected'] = r.envoye === false && r.entree.decision === 'EXECUTE' && r.entree.envoi === 'ECHEC' && r.entree.erreur === 'user rejected';
  }
  /* ── E ── */
  {
    const sans = M.revocationUtilisateur({ permission, regles, maintenant });
    R['E1 revocation sans geste -> rien'] = sans.ok === false && sans.regles === regles;
    const s = M.revocationUtilisateur({ permission, regles, geste: true, maintenant });
    R['E2 voie sub account : revokeAsSpender from = sub account, kill switch ON'] = s.ok && s.regles.killSwitch === true && regles.killSwitch === false
      && s.appel.from === SUB && s.appel.to === SPM && s.appel.data.startsWith('0x' + selecteur(AA.SIG_REVOKE_AS_SPENDER)) && s.entree.decision === 'REVOKE';
    const u = M.revocationUtilisateur({ permission, regles, geste: true, voie: 'universel', maintenant });
    R['E3 voie universel : revoke from = universel'] = u.ok && u.appel.from === UNIV && u.appel.data.startsWith('0x' + selecteur(AA.SIG_REVOKE));
    const apres = AA.verdictAutonome({ plan, grant, regles: s.regles, journal: [], maintenant });
    R['E4 apres revocation le cerveau REFUSE'] = apres.decision === 'REFUSE';
    const t = M.texteModeAutonome(ref) || [];
    const tout = t.join(' ');
    R['E5 texte : sub account, plafonds choisis, aucune cle ni fonds chez nous, revoke'] = /from YOUR sub account/.test(tout) && /25 USDC per day, for 7 days/.test(tout)
      && /holds no key and no funds/.test(tout) && /Revoke/.test(tout) && /not covered/.test(tout);
    R['E6 texte : 12.5 USDC rendu sans flottant'] = (M.texteModeAutonome(M.validerPlafonds({ usdcParJour: '12.5', jours: 1 })) || []).join(' ').includes('12.5 USDC per day, for 1 day.');
    R['E7 texte refuse des plafonds hors bornes'] = M.texteModeAutonome({ usdcParJour: 500, jours: 1 }) === null;
  }
  return R;
}

let n = 0, ko = 0;
const R = await scenarios(SRC);
for (const [k, v] of Object.entries(R)) { if (k.endsWith(':err')) continue; n += 1; if (v) console.log('ok  ' + k); else { ko += 1; console.log('KO  ' + k + (R[k + ':err'] ? ' (' + R[k + ':err'] + ')' : '')); } }

const remplacer = (s, a, b) => { if (!s.includes(a)) throw new Error('mutant sans cible : ' + a.slice(0, 60)); return s.split(a).join(b); };
const MUTANTS = [
  ['drapeau ON par defaut', 'export const MODE_AUTONOME_DRAPEAU = false;', 'export const MODE_AUTONOME_DRAPEAU = true;'],
  ['visible pour tout wallet', "provider.isBaseAccount === true;", 'true;'],
  ['plafond jour 1000', 'export const PLAFOND_JOUR_MAX_USDC = 100;', 'export const PLAFOND_JOUR_MAX_USDC = 1000;'],
  ['duree 365 j', 'export const DUREE_MAX_JOURS = 30;', 'export const DUREE_MAX_JOURS = 365;'],
  ['zero accepte', 'if (brut <= 0n)', 'if (brut < 0n)'],
  ['jours non entiers', 'if (!Number.isInteger(jours))', 'if (false)'],
  ['periode 7 jours', 'periodInDays: 1,', 'periodInDays: 7,'],
  ['executer sans verdict', "if (!verdict || verdict.decision !== 'EXECUTER')", 'if (false)'],
  ['spender non verifie', "raisons.push('grant spender is not this sub account');", ';'],
  ['simulation from non verifiee', "raisons.push('plan was not simulated from the sub account');", ';'],
  ['depense vers tout contrat', "raisons.push('spend call ' + i + ' is not to SpendPermissionManager');", ';'],
  ['from = universel', 'from: sousCompte, chainId', 'from: permission.account, chainId'],
  ['non atomique', 'atomicRequired: true', 'atomicRequired: false'],
  ['echec envoi journalise REFUSE', "envoi: 'ECHEC'", "decision: 'REFUSE', envoi: 'ECHEC'"],
  ['revocation sans kill switch', 'killSwitch: true };', 'killSwitch: false };'],
  ['revocation sans geste', "if (geste !== true) return { ok: false, pourquoi: 'needs a user click', regles };", ''],
  ['texte qui cache le sub account', 'from YOUR sub account', 'from an account'],
];
let tues = 0;
for (const [nom, a, b] of MUTANTS) {
  let rouges = [];
  try {
    const Rm = await scenarios(remplacer(SRC, a, b));
    rouges = Object.entries(Rm).filter(([k, v]) => !k.endsWith(':err') && !v).map(([k]) => k);
  } catch (e) { rouges = ['(chargement) ' + String(e && e.message).slice(0, 80)]; }
  n += 1;
  if (rouges.length) { tues += 1; console.log('ok  mutant tue : ' + nom + ' -> ' + rouges.slice(0, 3).join(', ')); } else { ko += 1; console.log('KO  mutant VIVANT : ' + nom); }
}
try { fs.rmSync(DOSSIER, { recursive: true, force: true }); } catch (_) { /* dossier temporaire du banc */ }
console.log((ko ? 'ECHEC ' : 'OK ') + (n - ko) + '/' + n + ', mutants ' + tues + '/' + MUTANTS.length
  + ' tues - NE PROUVE PAS le vrai SDK, un popup, une signature, un envoi ni la forme reelle des reponses wallet');
if (ko) process.exitCode = 1;
