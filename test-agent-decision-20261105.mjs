/* test-agent-decision-20261105.mjs — la jonction CERVEAU x COUCHE 2 du mode autonome (agent-decision.js).
 * A. une tache n est AUTONOME que si drapeau VRAI, cerveau d accord (tacheAutorisee), tache qui signe, verdictAutonome EXECUTER ;
 *    chaque condition cassee seule -> HUMAIN, avec sa raison ; toutes les raisons rendues.
 * B. le cerveau n est PAS change : sur une matrice taches x instantanes, la part « cerveau » de la decision = tacheAutorisee.
 * C. l executeur (executerDepuisSousCompte, faux provider) : un refus du CERVEAU l empeche d appeler le provider, meme quand
 *    la couche 2 seule disait EXECUTER ; une decision AUTONOME le laisse appeler une fois.
 * MUTANTS : sur des COPIES de agent-decision.js (dossier temporaire) ; chacun doit faire rougir au moins un scenario.
 * ⛔ BORNE : hors reseau, faux provider ; aucune cle, aucun envoi. ⛔ PORTABLE : process.exitCode. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const abs = (m) => pathToFileURL(path.join(ICI, m)).href;
const { selecteur } = await import(abs('pool.js'));
const BT = await import(abs('brain-tasks.js'));
const AA = await import(abs('agent-autonome.js'));
const AS = await import(abs('agent-sous-compte.js'));
const { USDC_BASE } = await import(abs('frais-creation.js'));
const SRC = fs.readFileSync(path.join(ICI, 'agent-decision.js'), 'utf8');
const DOSSIER = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-decision-'));
let nCopies = 0;
async function charger(src) {
  const f = path.join(DOSSIER, 'agent-decision-' + (nCopies += 1) + '.mjs');
  let s = src;
  for (const m of ['brain-tasks.js', 'agent-autonome.js', 'agent-sous-compte.js']) s = s.split("from './" + m + "'").join("from '" + abs(m) + "'");
  fs.writeFileSync(f, s);
  return import(pathToFileURL(f).href);
}

const UNIVERSEL = '0x' + '11'.repeat(20), SOUS = '0x' + '22'.repeat(20), RAIL = '0x' + '44'.repeat(20);
const T0 = 1_800_000_000, maintenant = T0 + 3600;
const SEL = '0x' + selecteur('swap(bytes)');
const regles = { listeBlanche: { [RAIL]: [SEL] }, plafondTx: 1_000_000n, plafondJour: 3_000_000n, killSwitch: false };
const permission = { account: UNIVERSEL, spender: SOUS, token: USDC_BASE, allowance: 5_000_000n, period: 86400n, start: BigInt(T0), end: BigInt(T0 + 7 * 86400), salt: 0n, extraData: '0x' };
const grant = { permission, revoque: false, depenseDansPeriode: 0n };
const plan = { etat: 'PRET', simule: true, simuleDepuis: SOUS, appels: [{ to: RAIL, data: SEL + '00'.repeat(32), value: '0x0' }], coutJeton: 500_000n };
const SNAP_VIVANT = { phase: 'CALME', marche: { etatVie: 'LUE', vie: 5 }, tick: 3, journal: [1] };
const SNAP_MORT = { phase: 'MORT', tick: 3 };
const SNAP_NON_LU = { phase: 'NON_LU' };
const base = { tache: 'trade_tblock', snap: SNAP_VIVANT, plan, grant, regles, journal: [], maintenant, drapeau: true };

/* un faux provider qui COMPTE ses appels, et le preparateur de depense (forme du SDK : [spend] vers SpendPermissionManager) */
const fauxProvider = () => { const p = { appels: 0, request: async () => { p.appels += 1; return '0xid'; } }; return p; };
const preparerDepense = async ({ amount }) => [AA.appelDepense(permission, amount)].map((a) => ({ to: a.to, data: a.data, value: '0x0' }));

async function scenarios(src) {
  const R = {};
  const D = await charger(src);
  const dec = (o = {}) => D.decisionAutonome({ ...base, ...o });
  try {
    const a1 = dec();
    R['A1 drapeau VRAI + cerveau d accord + tache qui signe + couche 2 EXECUTER -> AUTONOME'] = a1.mode === 'AUTONOME' && a1.verdict.decision === 'EXECUTER' && a1.raisons.length === 0;
    const { drapeau: _d, ...sansDrapeau } = base;
    const a2 = D.decisionAutonome(sansDrapeau);
    R['A2 drapeau par defaut (= MODE_AUTONOME_DRAPEAU, faux en prod) -> HUMAIN'] = AS.MODE_AUTONOME_DRAPEAU === false && a2.mode === 'HUMAIN' && a2.raisons.includes('autonomous mode is off');
    R['A3 drapeau "true" (texte) n allume rien'] = dec({ drapeau: 'true' }).mode === 'HUMAIN';
    const a4 = dec({ snap: SNAP_MORT });
    R['A4 cerveau REFUSE (block mort) alors que la couche 2 seule dit EXECUTER -> HUMAIN'] = a4.couche2.decision === 'EXECUTER' && a4.mode === 'HUMAIN'
      && a4.verdict.decision === 'REFUSE' && a4.raisons.some((x) => x.startsWith('brain refuses the task: dead'));
    const a5 = dec({ snap: SNAP_NON_LU });
    R['A5 cerveau REFUSE (marche non lu) -> HUMAIN'] = a5.mode === 'HUMAIN' && a5.cerveau.ok === false;
    const a6 = dec({ regles: { ...regles, killSwitch: true } });
    R['A6 cerveau d accord, couche 2 REFUSE (kill switch) -> HUMAIN, raison de la couche 2'] = a6.cerveau.ok === true && a6.mode === 'HUMAIN' && a6.raisons.some((x) => x.startsWith('layer 2: kill switch'));
    const a7 = dec({ snap: SNAP_MORT, regles: { ...regles, killSwitch: true }, drapeau: false });
    R['A7 les trois refus a la fois -> les trois raisons rendues'] = a7.raisons.some((x) => x === 'autonomous mode is off') && a7.raisons.some((x) => x.startsWith('brain refuses')) && a7.raisons.some((x) => x.startsWith('layer 2:'));
    const a8 = dec({ tache: 'export_snapshot' });
    R['A8 tache qui ne signe rien (export_snapshot, cerveau d accord) -> HUMAIN'] = a8.cerveau.ok === true && a8.mode === 'HUMAIN' && a8.raisons.includes('task signs nothing: nothing to execute');
    const a9 = dec({ tache: 'inventee' });
    R['A9 tache inconnue -> HUMAIN (le cerveau dit unknown task)'] = a9.mode === 'HUMAIN' && a9.raisons.some((x) => x.includes('unknown task'));
    const a10 = dec({ tache: 'offer_food', optsTache: { offerBusy: true } });
    R['A10 offer_food, creneau occupe (optsTache transmis au cerveau) -> HUMAIN'] = a10.mode === 'HUMAIN' && a10.raisons.some((x) => x.includes('slot busy'));
    R['A11 offer_food, creneau libre -> AUTONOME'] = dec({ tache: 'offer_food', optsTache: { offerBusy: false } }).mode === 'AUTONOME';
    R['A12 plan non simule -> HUMAIN'] = dec({ plan: { ...plan, simule: false } }).mode === 'HUMAIN';

    /* B. le cerveau inchange : la part cerveau = tacheAutorisee, sur une matrice */
    const snaps = [SNAP_VIVANT, SNAP_MORT, SNAP_NON_LU, { phase: 'DORMANT' }, { phase: 'EVEILLE', tick: 1 }, { phase: 'INQUIET', marche: { vie: 0 } }, null, {}];
    let egal = 0, total = 0;
    for (const t of BT.ONCHAIN_TASKS.map((x) => x.id).concat(['inventee'])) for (const s of snaps) for (const busy of [false, true]) {
      total += 1;
      const c = BT.tacheAutorisee(t, s, { offerBusy: busy });
      const d = dec({ tache: t, snap: s, optsTache: { offerBusy: busy } });
      if (d.cerveau.ok === (c.ok === true) && d.cerveau.pourquoi === (c.pourquoi || null)) egal += 1;
    }
    R['B1 la part cerveau = tacheAutorisee sur ' + total + ' cas (taches x instantanes x creneau)'] = egal === total && total > 50;

    /* C. l executeur */
    const pRefus = fauxProvider();
    const c1 = await AS.executerDepuisSousCompte({ verdict: a4.verdict, plan, sousCompte: SOUS, permission, preparerDepense, provider: pRefus, maintenant });
    R['C1 refus du cerveau -> executeur n appelle PAS le provider, entree REFUSE'] = c1.envoye === false && pRefus.appels === 0 && c1.entree.decision === 'REFUSE';
    const pTemoin = fauxProvider();
    const c0 = await AS.executerDepuisSousCompte({ verdict: a4.couche2, plan, sousCompte: SOUS, permission, preparerDepense, provider: pTemoin, maintenant });
    R['C0 temoin : la couche 2 SEULE aurait laisse partir l executeur (1 appel)'] = c0.envoye === true && pTemoin.appels === 1;
    const pOk = fauxProvider();
    const c2 = await AS.executerDepuisSousCompte({ verdict: a1.verdict, plan, sousCompte: SOUS, permission, preparerDepense, provider: pOk, maintenant });
    R['C2 decision AUTONOME -> executeur appelle le provider une fois, entree EXECUTE'] = c2.envoye === true && pOk.appels === 1 && c2.entree.decision === 'EXECUTE';
  } catch (e) { R['(exception) ' + String(e && e.message).slice(0, 80)] = false; }
  return R;
}

let n = 0, ko = 0;
const R = await scenarios(SRC);
for (const [k, v] of Object.entries(R)) { n += 1; if (v) console.log('ok  ' + k); else { ko += 1; console.log('KO  ' + k); } }

const remplacer = (s, a, b) => { if (!s.includes(a)) throw new Error('mutant sans cible : ' + a.slice(0, 60)); return s.split(a).join(b); };
const MUTANTS = [
  ['drapeau ignore', "if (drapeau !== true) raisons.push('autonomous mode is off');", ';'],
  ['drapeau vrai par defaut', 'drapeau = MODE_AUTONOME_DRAPEAU }', 'drapeau = true }'],
  ['drapeau « truthy »', 'if (drapeau !== true)', 'if (!drapeau)'],
  ['cerveau ignore', "if (!cerveau || cerveau.ok !== true) raisons.push(", 'if (false) raisons.push('],
  ['cerveau consulte sans ses options', 'tacheAutorisee(tache, snap, optsTache)', 'tacheAutorisee(tache, snap, {})'],
  ['tache qui ne signe rien acceptee', "if (def && def.signs !== true) raisons.push('task signs nothing: nothing to execute');", ';'],
  ['couche 2 ignoree', "if (!couche2 || couche2.decision !== 'EXECUTER')", 'if (false)'],
  ['verdict = couche 2 seule', "verdict: autonome ? { decision: 'EXECUTER', raisons: [] } : { decision: 'REFUSE', raisons },", 'verdict: couche2,'],
  ['toujours autonome', 'const autonome = raisons.length === 0;', 'const autonome = true;'],
  ['premiere raison seulement', 'raisons,\n  };', 'raisons: raisons.slice(0, 1),\n  };'],
];
let tues = 0;
const SRC_LF = SRC.replace(/\r\n/g, '\n');
for (const [nom, a, b] of MUTANTS) {
  let rouges = [];
  try {
    const Rm = await scenarios(remplacer(SRC_LF, a, b));
    rouges = Object.entries(Rm).filter(([, v]) => !v).map(([k]) => k);
  } catch (e) { rouges = ['(chargement) ' + String(e && e.message).slice(0, 80)]; }
  n += 1;
  if (rouges.length) { tues += 1; console.log('ok  mutant tue : ' + nom + ' -> ' + rouges.slice(0, 2).join(', ')); } else { ko += 1; console.log('KO  mutant VIVANT : ' + nom); }
}
try { fs.rmSync(DOSSIER, { recursive: true, force: true }); } catch (_) { /* dossier temporaire du banc */ }
console.log((ko ? 'ECHEC ' : 'OK ') + (n - ko) + '/' + n + ', mutants ' + tues + '/' + MUTANTS.length
  + ' tues - NE PROUVE PAS le vrai SDK ni un envoi ; le cerveau (brain-tasks.js) n est pas modifie');
if (ko) process.exitCode = 1;
