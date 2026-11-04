/* test-agent-autonome-20261104.mjs — PROTOTYPE « mode autonome » : les parties QUI NE SIGNENT PAS (agent-autonome.js).
 * A. demandeAutorisation : bornes (duree, periode, allowance, adresses) — un refus nomme sa raison.
 * B. appelRevocation : calldata NON SIGNE de revoke(SpendPermission) — selecteur par keccak, ABI tuple dynamique decode a la main.
 * C. verdictAutonome : un plan de reference EXECUTER, puis CHAQUE regle cassee une a une doit le faire REFUSER (mutants).
 * D. entreeJournal : forme de l entree visible.
 * ⛔ BORNE : hors reseau. Le selecteur 0x78792f76 a ete vu dans le code deploye de SpendPermissionManager sur Base mainnet
 *   (eth_getCode, 2026-11-04) hors de ce test ; ce test prouve l encodage, pas une execution. Aucun envoi.
 * ⛔ PORTABLE : process.exitCode, jamais process.exit. */
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const A = await import(pathToFileURL(path.join(ICI, 'agent-autonome.js')).href + '?v=' + Math.random());
const { selecteur } = await import(pathToFileURL(path.join(ICI, 'pool.js')).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };

const USER = '0x' + '11'.repeat(20), AGENT = '0x' + '22'.repeat(20), USDC = '0x' + '33'.repeat(20);
const RAIL = '0x' + '44'.repeat(20), AUTRE = '0x' + '55'.repeat(20);
const T0 = 1_800_000_000;
const base = { account: USER, spender: AGENT, token: USDC, allowance: 5_000_000n, periodSec: 86400, start: T0, end: T0 + 7 * 86400 };

/* ── A ── */
{
  const d = A.demandeAutorisation(base);
  ok(d.ok === true && d.etat === 'A_SIGNER_PAR_L_UTILISATEUR', 'A1 demande de reference acceptee, a signer par l utilisateur');
  ok(d.permission.allowance === 5_000_000n && d.permission.period === 86400n && d.permission.salt === 0n, 'A2 champs normalises en BigInt');
  const cas = [
    [{ end: T0 + 30 * 86400 + 1 }, 'longer than 2592000'],
    [{ periodSec: 3599 }, 'shorter than'],
    [{ periodSec: 86399 }, 'shorter than 86400'],
    [{ periodSec: 86401 }, 'longer than 86400'],
    [{ allowance: 0n }, 'positive uint160'],
    [{ allowance: 1n << 160n }, 'positive uint160'],
    [{ start: T0 + 10, end: T0 + 10 }, 'start must be before end'],
    [{ spender: USER }, 'cannot be the account'],
    [{ token: '0x12' }, 'token is not an address'],
    [{ extraData: '0xabc' }, 'not hex bytes'],
  ];
  for (const [m, attendu] of cas) {
    const r = A.demandeAutorisation({ ...base, ...m });
    ok(r.ok === false && r.etat === 'REFUSE' && String(r.pourquoi).includes(attendu), 'A3 refus ' + JSON.stringify(m, (k, v) => typeof v === 'bigint' ? String(v) : v) + ' -> ' + r.pourquoi);
  }
}

/* ── B ── */
{
  const p = A.demandeAutorisation({ ...base, salt: 7n, extraData: '0xdeadbeef' }).permission;
  const r = A.appelRevocation(p);
  ok(r.ok && r.to === A.SPEND_PERMISSION_MANAGER && r.from === USER && r.value === '0x0', 'B1 to = SpendPermissionManager, from = le compte (revoke exige msg.sender == account)');
  ok(selecteur('revoke((address,address,address,uint160,uint48,uint48,uint48,uint256,bytes))') === '78792f76' && r.data.startsWith('0x78792f76'), 'B2 selecteur keccak = 0x78792f76');
  const w = r.data.slice(10).match(/.{64}/g);
  const W = (i) => BigInt('0x' + w[i]);
  ok(w.length === 1 + 9 + 1 + 1, 'B3 1 offset + 9 tetes + longueur + 1 mot de donnees = 12 mots (' + w.length + ')');
  ok(W(0) === 0x20n, 'B4 offset du tuple = 0x20');
  ok(W(1) === BigInt(USER) && W(2) === BigInt(AGENT) && W(3) === BigInt(USDC), 'B5 account, spender, token dans l ordre du struct');
  ok(W(4) === 5_000_000n && W(5) === 86400n && W(6) === BigInt(T0) && W(7) === BigInt(T0 + 7 * 86400) && W(8) === 7n, 'B6 allowance, period, start, end, salt');
  ok(W(9) === 288n && W(10) === 4n && w[11] === 'deadbeef' + '0'.repeat(56), 'B7 extraData : offset 288, longueur 4, rembourre a droite');
  const vide = A.appelRevocation({ ...p, extraData: '0x' });
  ok(vide.ok && vide.data.slice(10).length === 11 * 64 && BigInt('0x' + vide.data.slice(10 + 10 * 64)) === 0n, 'B8 extraData vide : 11 mots, longueur 0');
  ok(A.appelRevocation({ ...p, account: 'x' }).ok === false, 'B9 permission invalide -> pas de calldata');
  const s = A.appelRevocationCommeSpender(p);
  ok(s.ok && s.from === AGENT && s.to === A.SPEND_PERMISSION_MANAGER && s.data.startsWith('0x' + selecteur(A.SIG_REVOKE_AS_SPENDER))
    && s.data.slice(10) === r.data.slice(10) && s.data.slice(0, 10) !== r.data.slice(0, 10),
    'B10 revokeAsSpender : from = le spender (sub account), meme tuple, autre selecteur');
}

/* ── C ── */
const SEL = '0x' + selecteur('swap(bytes)');
const regles = { listeBlanche: { [RAIL]: [SEL] }, plafondTx: 1_000_000n, plafondJour: 3_000_000n, killSwitch: false };
const grant = { permission: { account: USER, spender: AGENT, token: USDC, allowance: 5_000_000n, start: T0, end: T0 + 7 * 86400 }, revoque: false, depenseDansPeriode: 0n };
const plan = { etat: 'PRET', simule: true, appels: [{ to: RAIL, data: SEL + '00'.repeat(32), value: '0x0' }], coutJeton: 500_000n };
const maintenant = T0 + 3600;
const juge = (o = {}) => A.verdictAutonome({ plan, grant, regles, journal: [], maintenant, ...o });
{
  const v = juge();
  ok(v.decision === 'EXECUTER' && v.raisons.length === 0, 'C1 plan de reference EXECUTER');
  const mutants = [
    ['kill switch ON', { regles: { ...regles, killSwitch: true } }, 'kill switch'],
    ['kill switch absent', { regles: { ...regles, killSwitch: undefined } }, 'kill switch'],
    ['APPROBATIONS', { plan: { ...plan, etat: 'APPROBATIONS' } }, 'not PRET'],
    ['NON_MESURE', { plan: { ...plan, etat: 'NON_MESURE' } }, 'not PRET'],
    ['non simule (Game)', { plan: { ...plan, simule: undefined } }, 'not simulated'],
    ['contrat hors liste', { plan: { ...plan, appels: [{ to: AUTRE, data: SEL }] } }, 'not on the allowlist'],
    ['fonction hors liste', { plan: { ...plan, appels: [{ to: RAIL, data: '0x095ea7b3' + '00'.repeat(64) }] } }, 'is not allowed'],
    ['aucun appel', { plan: { ...plan, appels: [] } }, 'no calls'],
    ['cout non mesure', { plan: { ...plan, coutJeton: null } }, 'not measured'],
    ['au-dessus du plafond tx', { plan: { ...plan, coutJeton: 1_000_001n } }, 'per-tx cap'],
    ['plafonds absents', { regles: { ...regles, plafondTx: undefined } }, 'caps are not set'],
    ['plafond 24 h', { journal: [{ t: maintenant - 100, coutJeton: 2_600_000n, decision: 'EXECUTE' }] }, 'daily cap'],
    ['grant absent', { grant: null }, 'no on-chain grant'],
    ['grant revoque', { grant: { ...grant, revoque: true } }, 'revoked'],
    ['revocation non lue', { grant: { ...grant, revoque: undefined } }, 'revoked'],
    ['grant expire', { maintenant: T0 + 7 * 86400 }, 'not active'],
    ['grant pas commence', { maintenant: T0 - 1 }, 'not active'],
    ['periode non lue', { grant: { ...grant, depenseDansPeriode: undefined } }, 'not read'],
    ['allowance epuisee', { grant: { ...grant, depenseDansPeriode: 4_600_000n } }, 'allowance left'],
    ['horloge absente', { maintenant: undefined }, 'no clock'],
  ];
  for (const [nom, o, attendu] of mutants) {
    const r = juge(o);
    ok(r.decision === 'REFUSE' && r.raisons.some((x) => x.includes(attendu)), 'C2 mutant « ' + nom + ' » REFUSE : ' + r.raisons.join(' | '));
  }
  /* les executions hors fenetre 24 h et les REFUS ne comptent pas dans le plafond du jour */
  const vieux = juge({ journal: [{ t: maintenant - 86400, coutJeton: 2_900_000n, decision: 'EXECUTE' }, { t: maintenant - 10, coutJeton: 2_900_000n, decision: 'REFUSE' }] });
  ok(vieux.decision === 'EXECUTER', 'C3 une execution d il y a 24 h pile et un REFUS ne comptent pas');
  const pile = juge({ journal: [{ t: maintenant - 10, coutJeton: 2_500_000n, decision: 'EXECUTE' }] });
  ok(pile.decision === 'EXECUTER', 'C4 2 500 000 + 500 000 = plafond jour exactement -> EXECUTER (borne inclusive)');
  const multi = juge({ regles: { ...regles, killSwitch: true }, plan: { ...plan, etat: 'REFUSE' } });
  ok(multi.raisons.length >= 2, 'C5 toutes les raisons sont rendues, pas la premiere seulement (' + multi.raisons.length + ')');
}

/* ── D ── */
{
  const e = A.entreeJournal({ compte: USER.toUpperCase().replace('0X', '0x'), plan, verdict: juge(), maintenant });
  ok(e.decision === 'EXECUTE' && e.compte === USER && e.appels.length === 1 && e.appels[0].selecteur === SEL && e.coutJeton === '500000' && e.hash === null,
    'D1 entree de journal : decision, compte minuscule, selecteur, cout en texte, hash null avant envoi');
  const r = A.entreeJournal({ compte: USER, plan, verdict: juge({ grant: null }), maintenant });
  ok(r.decision === 'REFUSE' && r.raisons.length > 0, 'D2 un refus est journalise avec ses raisons');
}

console.log((ko ? 'ECHEC ' : 'OK ') + (n - ko) + '/' + n);
if (ko) process.exitCode = 1;
