/* test-reponse-spin-20261024.mjs — LE PANNEAU DE REPONSE DU SPIN (reponse-spin.js) : PUR, PUIS SUR LE VRAI CODE DE app.html.
 * Demande (Phil 2026-10-24, capture de game35) : « il ne faut pas 2 jeux mais un seul, mets-le au CENTRE : un clic, un contrat lance, une
 *   reponse avec les actions a faire pour les utilisateurs ». Sous le bouton Spin, UN panneau : (1) envoye — spin #N ; (2) l attente des
 *   blocs t, t+1, t+2, comptee en direct, puis les rouleaux qui se posent ; (3) le resultat : points et prix de la table du contrat ;
 *   (4) L ACTION SUIVANTE en une phrase, son bouton dans la ligne.
 * PARTIE A — reponseSpin, PUR, sur CHAQUE etat que la carte connait (planReglement : ATTENDRE, LOT avec et sans prix, COURT avec et sans
 *   ce que le pot tient, PERDU (fenetre fermee ou fermant), NON_LU ; bilanReglement : PAYE, PLAFONNE, FENETRE, PERDU, REGLE_AILLEURS,
 *   NON_LU ; le regleur du serveur ON ; un paiement en jeton arrete ; sans wallet) : EXACTEMENT une cle d action, son bouton, ses etapes.
 * PARTIE B — le bloc des rouleaux ET le bloc des slots de app.html EXECUTES ensemble (faux DOM, fausse chaine a 2 s par bloc, fausse
 *   horloge, vraies faces, vraie table de contracts/slots-parametres.json) :
 *   SANS_WALLET  le bouton dit « Connect a wallet to spin » (visible), aucun panneau d action ;
 *   ATTENTE      un spin envoye (TROP_TOT) : « Sent — spin #N », « Waiting for blocks a, b, c — k of 3 in » avec k qui MONTE au fil des
 *                blocs (le minuteur de 3 s, sans lecture de plus), puis « the reels are landing », puis « drew your three faces » ; le
 *                resultat = Slots.points des faces (l oracle) et le prix de la table ; l action « Settle now — S s left » avec S = les blocs
 *                restants x 2 s (+- 1 bloc), le bouton Settle visible ;
 *   REGLEUR      le regleur du serveur ON : en attente « the server's keeper settles it » ; reglable, la phrase de Settle le dit ;
 *   COURT        le pot plus petit que le prix : « Accept what the pot holds » et le bouton Accept ; pot vide : « wait for it to grow », aucun bouton ;
 *   PERDU        fenetre passee : « Lost: the 256-block window of spin #N closed. », aucun Settle ;
 *   SUIT         un spin recent en attente et un ancien reglable : le panneau parle du MEME spin que les rouleaux (celui de Settle) ;
 *   REGLE        Settle (recu Settled) : « P points → X USDC paid to you » et « Nothing to do: X USDC is in your wallet. » ;
 *   RESUME       Pay with NVDAc pour un Spin (wallet qui groupe) : le resume affiche dit le max-in = l approve envoye au wallet.
 * Chaque affirmation est rejouee sur des COPIES MUTEES (reponse-spin.js et app.html, en memoire) et doit rougir.
 * NE PROUVE PAS : les pixels (mesure au navigateur a part), un wallet reel, un spin reel sur Base, le regleur reel. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as Slots from './slots-plan.js';
import * as RS from './reponse-spin.js';
import * as MIS from './misables.js';
import { faceRevelee } from './face-du-jour.js';
import { logoSvg, paramsLogoDepuisApparence } from './logo.js';
import { usdc as usdcTexte } from './rolls-jeu.js';
import { topic } from './keccak.js';
import { lireApp as lireAppPayer, chaineFactice, lignesServies, walletFactice, appelsEnvoyes, charger as chargerPayer, choisir, tempsRapide } from './payer-avec-harnais-20261024.mjs';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html'), ROU = lire('rouleaux.js'), SRC_RS = lire('reponse-spin.js');
const P = JSON.parse(lire('contracts/slots-parametres.json'));
const TABLE = P.prizes.map((x) => BigInt(x));
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const importer = async (code) => import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const fmt = (x) => Number(x).toLocaleString('en-US');
const H = (b) => '0x' + createHash('sha256').update('bloc:' + b).digest('hex');
const u = Slots.usdcPrecis;

/* ================================================================ PARTIE A : reponseSpin, pur */
const ligne = (o) => ({ id: '7', t: 1000, dernierBloc: 1256, ...o });
const planDe = (lignes) => ({ lignes, lot: lignes.filter((l) => l.decision === 'LOT').map((l) => l.id), courts: lignes.filter((l) => l.decision === 'COURT'), perdus: lignes.filter((l) => l.decision === 'PERDU').map((l) => l.id) });
const CAS = [
  /* [nom, entree, cle attendue, bouton attendu, controle du texte, controle des etapes] */
  ['sans wallet', { moi: false }, null, null, () => true, (e) => e.length === 0],
  ['rien en cours', { moi: true, plan: planDe([]) }, 'JOUER', null, (t) => t === 'Spin: the next three Base blocks draw your three faces.', (e) => e.length === 0],
  ['envoye, 0 de 3 blocs', { moi: true, suivi: { id: '7', t: 1000 }, tete: 999, plan: planDe([ligne({ decision: 'ATTENDRE', etat: 'TROP_TOT', blocsAvant: 3 })]) }, 'ATTENDRE', null,
    (t) => t === 'Nothing to do yet: Settle opens once its 3 blocks are in (3 to go).', (e) => e[0].texte === 'Sent — spin #7' && e[1].texte === 'Waiting for blocks 1,000, 1,001, 1,002 — 0 of 3 in' && e[1].etat === 'encours' && e[2].etat === 'attente'],
  ['2 de 3 blocs', { moi: true, suivi: { id: '7', t: 1000 }, tete: 1001, plan: planDe([ligne({ decision: 'ATTENDRE', blocsAvant: 1 })]) }, 'ATTENDRE', null, (t) => /\(1 to go\)\.$/.test(t), (e) => e[1].texte.endsWith('— 2 of 3 in')],
  ['regleur ON, en attente', { moi: true, suivi: { id: '7', t: 1000 }, tete: 999, regleurOn: true, plan: planDe([ligne({ decision: 'ATTENDRE', blocsAvant: 3 })]) }, 'ATTENDRE_REGLEUR', null, (t) => t === 'Nothing to do: the server\'s keeper settles it once its blocks are in.', () => true],
  /* ⛔ 2026-10-24 (revue 3, defaut 1) : ce cas controlait le texte avec () => true — le prix etait dit avant la 3e face. Le texte EXACT : */
  ['blocs la, rouleaux en vol', { moi: true, suivi: { id: '7', t: 1000 }, tete: 1003, posees: false, plan: planDe([ligne({ decision: 'LOT', points: 6, prix: 1000000n, paie: 1000000n, blocsRestants: 200 })]) }, 'POSE', null,
    (t) => t === 'Landing…', (e) => e[1].texte === 'Blocks 1,000, 1,001, 1,002 are in — the reels are landing' && e[2].etat === 'attente' && e[2].texte === 'Result: points per trait and the prize'],
  ['pot court, rouleaux en vol (Accept)', { moi: true, suivi: { id: '7', t: 1000 }, tete: 1003, posees: false, plan: planDe([ligne({ decision: 'COURT', points: 9, prix: 5000000n, paie: 2000000n, manque: 3000000n, blocsRestants: 10 })]) }, 'POSE', null,
    (t) => t === 'Landing…', (e) => e[2].etat === 'attente' && !/USDC/.test(e.map((x) => x.texte).join(' '))],
  ['regle ici, rouleaux en vol', { moi: true, suivi: { id: '7', t: null }, posees: false, plan: planDe([]), bilan: { id: '7', issue: 'PAYE', points: 6, prix: 1000000n, paie: 1000000n, manque: 0n } }, 'POSE', null,
    (t) => t === 'Landing…', (e) => e[1].texte === 'Its three blocks are in — the reels are landing' && e[2].etat === 'attente'],
  /* revue 3, defaut 3 : un ancien #7 reglable a cote du #8 suivi (envoye, en attente) : chaque ligne nomme son spin */
  ['ancien reglable, recent suivi en attente', { moi: true, suivi: { id: '8', t: 1010 }, tete: 1005, msParBloc: 2000, plan: planDe([ligne({ decision: 'LOT', points: 6, prix: 1000000n, paie: 1000000n, blocsRestants: 50 }), ligne({ id: '8', t: 1010, decision: 'ATTENDRE', blocsAvant: 8 })]) }, 'REGLER', 'regler',
    (t) => t === 'Settle spin #7 now — 100 s left: 1.00 USDC.', (e) => e[0].texte === 'Sent — spin #8' && e[1].texte === 'Spin #8: Waiting for blocks 1,010, 1,011, 1,012 — 0 of 3 in' && e[2].texte === 'Spin #8: Result: points per trait and the prize'],
  ['recent suivi en attente, regleur ON, ancien en attente aussi', { moi: true, suivi: { id: '8', t: 1010 }, tete: 1005, regleurOn: true, plan: planDe([ligne({ t: 1009, decision: 'ATTENDRE', blocsAvant: 7 }), ligne({ id: '8', t: 1010, decision: 'ATTENDRE', blocsAvant: 8 })]) }, 'ATTENDRE_REGLEUR', null,
    (t) => t === 'Nothing to do: the server\'s keeper settles spin #8 once its blocks are in.', () => true],
  ['reglable, prix paye en entier', { moi: true, suivi: { id: '7', t: 1000 }, tete: 1003, posees: true, msParBloc: 2000, plan: planDe([ligne({ decision: 'LOT', points: 6, prix: 1000000n, paie: 1000000n, blocsRestants: 21 })]) }, 'REGLER', 'regler',
    (t) => t === 'Settle now — 42 s left: 1.00 USDC.', (e) => e[1].etat === 'fait' && e[2].texte === '6 points → prize 1.00 USDC (the contract\'s table)' && e[2].etat === 'fait'],
  ['reglable, 200 ms, regleur ON, deux spins', { moi: true, suivi: { id: '8', t: 1001 }, tete: 1004, posees: true, regleurOn: true, plan: planDe([ligne({ decision: 'LOT', points: 6, prix: 1000000n, paie: 1000000n, blocsRestants: 3 }), ligne({ id: '8', t: 1001, decision: 'LOT', points: 0, prix: 0n, paie: 0n, blocsRestants: 4 })]) }, 'REGLER', 'regler',
    (t) => t === 'Settle spins #7, #8 now — under 1 s left: 1.00 USDC. The server\'s keeper also settles them on its own.', (e) => e[2].texte === 'Spin #8: 0 points → no prize'],
  ['reglable, aucun prix', { moi: true, suivi: { id: '7', t: 1000 }, tete: 1003, posees: true, plan: planDe([ligne({ decision: 'LOT', points: 0, prix: 0n, paie: 0n, blocsRestants: 100 })]) }, 'SANS_PRIX', 'regler', (t) => t === 'Nothing to do: no prize. Settle only adds its points.', () => true],
  ['pot court : accepter', { moi: true, suivi: { id: '7', t: 1000 }, tete: 1003, posees: true, msParBloc: 2000, plan: planDe([ligne({ decision: 'COURT', points: 9, prix: 5000000n, paie: 2000000n, manque: 3000000n, blocsRestants: 10 })]) }, 'ACCEPTER', 'accepter',
    (t) => t === 'Accept what the pot holds: 2.00 USDC for spin #7 (3.00 short) — 20 s left.', (e) => e[2].texte === '9 points → prize 5.00 USDC (the contract\'s table); the pot pays 2.00 now'],
  ['pot vide', { moi: true, suivi: { id: '7', t: 1000 }, tete: 1003, posees: true, msParBloc: 2000, plan: planDe([ligne({ decision: 'COURT', points: 9, prix: 5000000n, paie: 0n, manque: 5000000n, blocsRestants: 10 })]) }, 'POT_VIDE', null,
    (t) => t === 'Nothing to do now: the pot is empty — wait for it to grow (20 s left).', () => true],
  ['fenetre passee (spin suivi)', { moi: true, suivi: { id: '7', t: 1000 }, tete: 1300, posees: true, plan: planDe([ligne({ decision: 'PERDU', paie: 0n, blocsRestants: 0 })]) }, 'PERDU', null, (t) => t === 'Lost: the 256-block window of spin #7 closed.', (e) => e[2].texte === 'Not settled in time — lost'],
  ['fenetre passee (aucun spin suivi)', { moi: true, suivi: null, tete: 1300, plan: planDe([ligne({ id: '4', decision: 'PERDU', paie: 0n, blocsRestants: 0 })]) }, 'PERDU', null, (t) => t === 'Lost: the 256-block window of spin #4 closed.', (e) => e.length === 0],
  ['non lu', { moi: true, suivi: { id: '7', t: 1000 }, tete: 1003, posees: true, plan: planDe([ligne({ decision: 'NON_LU' })]) }, 'NON_LU', null, (t) => /^Its result was not read just now/.test(t), () => true],
  ['regle ici, paye', { moi: true, suivi: { id: '7', t: null }, posees: true, plan: planDe([]), bilan: { id: '7', issue: 'PAYE', points: 6, prix: 1000000n, paie: 1000000n, manque: 0n } }, 'PAYE', null,
    (t) => t === 'Nothing to do: 1.00 USDC is in your wallet.', (e) => e[1].texte === 'Its three blocks drew your faces' && e[2].texte === '6 points → 1.00 USDC paid to you'],
  ['regle ici, sans prix', { moi: true, suivi: { id: '7', t: null }, posees: true, plan: planDe([]), bilan: { id: '7', issue: 'PAYE', points: 0, prix: 0n, paie: 0n, manque: 0n } }, 'SANS_PRIX', null, (t) => t === 'Nothing to do: no prize.', (e) => e[2].texte === '0 points → no prize'],
  ['regle ici, plafonne', { moi: true, suivi: { id: '7', t: null }, posees: true, plan: planDe([]), bilan: { id: '7', issue: 'PLAFONNE', points: 9, prix: 5000000n, paie: 2000000n, manque: 3000000n } }, 'PLAFONNE', null,
    (t) => t === 'Nothing to do: the pot paid 2.00 USDC to your wallet.', (e) => e[2].texte === '9 points → 2.00 USDC paid to you (3.00 short of the 5.00 prize)'],
  ['regle trop tard (FENETRE)', { moi: true, suivi: { id: '7', t: null }, plan: planDe([]), bilan: { id: '7', issue: 'FENETRE' } }, 'PERDU', null, (t) => t === 'Lost: the 256-block window of spin #7 closed.', () => true],
  ['regle par un autre, resultat non lu', { moi: true, suivi: { id: '7', t: null }, plan: planDe([]), bilan: { id: '7', issue: 'REGLE_AILLEURS' } }, 'REGLE_AILLEURS', null,
    (t) => t === 'Nothing to do: another transaction settled it (the server\'s keeper, or anyone); any prize went to you.', (e) => e[2].texte === 'Settled by another transaction — its result was not read' && e[2].etat === 'fait'],
  /* revue 3, defaut 2 : regle par le regleur (ou une autre tx) — son RESULTAT, et sa source */
  ['regle par le regleur, evenement lu', { moi: true, suivi: { id: '7', t: null }, posees: true, plan: planDe([]), bilan: { id: '7', issue: 'REGLE_AILLEURS', points: 6, prix: 1000000n, paie: 1000000n, source: 'evenement' } }, 'REGLE_AILLEURS', null,
    (t) => t === 'Nothing to do: another transaction settled it (the server\'s keeper, or anyone) — 1.00 USDC went to your wallet.', (e) => e[2].texte === 'Settled — 1.00 USDC paid to you (6 points; read from its Settled event)'],
  ['regle par le regleur, recalcule', { moi: true, suivi: { id: '7', t: null }, posees: true, plan: planDe([]), bilan: { id: '7', issue: 'REGLE_AILLEURS', points: 1, prix: 0n, paie: 0n, source: 'calcul' } }, 'REGLE_AILLEURS', null,
    (t) => t === 'Nothing to do: another transaction settled it (the server\'s keeper, or anyone) — no prize.', (e) => e[2].texte === 'Settled — no prize (1 point; computed from its faces and the contract\'s table; its Settled event was not read)'],
  ['regle ailleurs, montant non lu', { moi: true, suivi: { id: '7', t: null }, posees: true, plan: planDe([]), bilan: { id: '7', issue: 'REGLE_AILLEURS', points: 9, prix: 5000000n, source: 'calcul' } }, 'REGLE_AILLEURS', null,
    (t) => /; any prize went to you\.$/.test(t), (e) => e[2].texte === 'Settled — 9 points, prize 5.00 USDC; the amount paid was not read'],
  ['regle ailleurs, rouleaux en vol', { moi: true, suivi: { id: '7', t: null }, posees: false, plan: planDe([]), bilan: { id: '7', issue: 'REGLE_AILLEURS', points: 6, prix: 1000000n, paie: 1000000n, source: 'evenement' } }, 'POSE', null,
    (t) => t === 'Landing…', (e) => e[2].etat === 'attente'],
  ['bilan d un AUTRE spin ignore', { moi: true, suivi: { id: '7', t: null }, plan: planDe([]), bilan: { id: '9', issue: 'PAYE', points: 6, prix: 1000000n, paie: 1000000n, manque: 0n } }, 'JOUER', null, () => true, (e) => e[2].etat === 'attente'],
  ['paiement en jeton arrete', { moi: true, suivi: { id: '7', t: 1000 }, tete: 1003, posees: true, arret: true, plan: planDe([ligne({ decision: 'LOT', points: 6, prix: 1000000n, paie: 1000000n, blocsRestants: 21 })]) }, 'ARRET', null, (t) => /the line below says what went through/.test(t), () => true],
];
function partieA(M) {
  const res = [];
  for (const [nom, e, cle, bouton, txt, et] of CAS) {
    const r = M.reponseSpin(e);
    const ok = (cle === null ? r.action === null : !!r.action && r.action.cle === cle && r.action.bouton === bouton && txt(r.action.texte)) && et(r.etapes);
    res.push({ nom, ok, cle: r.action && r.action.cle, texte: r.action && r.action.texte, etapes: r.etapes.map((x) => x.texte) });
  }
  /* chaque cle d action atteinte au moins une fois (aucun etat sans phrase) */
  const vus = new Set(res.map((x) => x.cle).filter(Boolean));
  const toutes = Object.keys(M.ACTIONS).every((k) => vus.has(k));
  const html = M.etapesHtml([{ cle: 'envoye', texte: 'a <b> & "c"', etat: 'fait' }]) === '<li data-etat="fait" data-cle="envoye"><b>1</b> a &lt;b&gt; &amp; &quot;c&quot;</li>';
  const bad = res.filter((x) => !x.ok);
  return { ok: bad.length === 0 && toutes && html, toutes, html, bad: bad.slice(0, 3), vus: [...vus] };
}

/* ================================================================ PARTIE B : le vrai code de app.html */
const CONTRAT = '0x' + 'cc'.repeat(20), MOI = '0x' + 'a1'.repeat(20);
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const { toPot: TO_POT, toDev: TO_DEV } = Slots.partsDuSpin(P.spinPrice, P.potShareBps);
const fiche = (regleur = 'OFF') => ({ ok: true, contrat: CONTRAT, prixSpin: P.spinPrice, potShareBps: P.potShareBps, prizes: P.prizes, esperanceBrut: '127862', bloc: 900, regleur: { etat: regleur, adresse: null, msParBlocMesure: 2000 } });
function faireHorloge() {
  let t = 1_000_000, seq = 0;
  const q = [];
  const planifier = (f, ms, rep = 0) => { const id = ++seq; q.push({ id, at: t + Math.max(0, Number(ms) || 0), f, rep }); return id; };
  const annuler = (id) => { const i = q.findIndex((x) => x.id === id); if (i >= 0) q.splice(i, 1); };
  const vider = async () => { for (let k = 0; k < 6; k++) await new Promise((r) => setImmediate(r)); };
  return {
    maintenant: () => t, setTimeout: (f, ms) => planifier(f, ms), clearTimeout: annuler, setInterval: (f, ms) => planifier(f, ms, Math.max(1, Number(ms) || 1)),
    async avancer(ms, apresChaque = null) {
      const fin = t + ms;
      for (;;) {
        q.sort((a, b) => a.at - b.at || a.id - b.id);
        const x = q[0];
        if (!x || x.at > fin) break;
        q.shift(); t = x.at;
        if (x.rep) q.push({ ...x, at: t + x.rep });
        try { x.f(); } catch (e) { if (!(e instanceof ReferenceError)) throw e; }
        await vider();
        if (apresChaque) apresChaque(t);
      }
      t = fin; await vider();
    },
  };
}
function faireChaine(h, { msBloc = 2000, depart = 1000, spins = [], pot = 50000000n }) {
  const t0 = h.maintenant();
  const c = { pot: BigInt(pot), spins: new Map(spins.map((s) => [String(s.id), { statut: 1, ...s, id: String(s.id) }])), settled: [], settledJette: false, lectures: [] };
  c.tete = () => depart + Math.floor((h.maintenant() - t0) / msBloc);
  c.rpc = async (m, p) => {
    c.lectures.push(m);
    if (m === 'eth_blockNumber') return '0x' + c.tete().toString(16);
    if (m === 'eth_getBlockByNumber') { const b = parseInt(p[0], 16); if (b > c.tete()) return null; return { hash: H(b), parentHash: H(b - 1), timestamp: '0x' + Math.floor((b * msBloc) / 1000).toString(16) }; }
    if (m === 'eth_getLogs' && p[0].topics[0] === topic(Slots.EV_SETTLED)) {
      /* les Settled (revue 3) : CE contrat, CE spin (topic 1), CE joueur (topic 2), dans la plage demandee */
      if (c.settledJette) throw new Error('getLogs refuse');
      const f = p[0], de = parseInt(f.fromBlock, 16), jq = parseInt(f.toBlock, 16);
      return c.settled.filter((l) => l.address === f.address && l.topics[1] === f.topics[1] && l.topics[2] === f.topics[2] && l.bloc >= de && l.bloc <= jq);
    }
    if (m === 'eth_getLogs') {
      const f = p[0], de = parseInt(f.fromBlock, 16), jq = parseInt(f.toBlock, 16);
      return [...c.spins.values()].filter((s) => !s.indexEnRetard && s.t - 2 >= de && s.t - 2 <= jq && '0x' + w(MOI) === f.topics[2])
        .map((s) => ({ address: CONTRAT, topics: [Slots.TOPIC_SPUN, '0x' + w(s.id), '0x' + w(MOI)], data: '0x' + w(s.t) + w(TO_POT) + w(TO_DEV) }));
    }
    if (m === 'eth_call') {
      const d = p[0].data.toLowerCase();
      if (d === Slots.appelPot()) return '0x' + w(c.pot);
      if (d === Slots.appelPointsDe(MOI) || d === Slots.appelGagneDe(MOI)) return '0x' + w(0);
      if (d.startsWith(Slots.appelSpin(0).slice(0, 10))) { const s = c.spins.get(String(BigInt('0x' + d.slice(10)))); return s ? '0x' + w(MOI) + w(s.t) + w(s.statut) : '0x' + w(0) + w(0) + w(0); }
    }
    throw new Error('rpc inattendu ' + m);
  };
  return c;
}
function faireDom() {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      const e = { id, innerHTML: '', hidden: true, disabled: false, dataset: {}, enfants: [], ecoute: {}, attrs: {}, _c: new Set(), on: true };
      e.classList = { contains: (c) => (id === 'v-missions' && c === 'on' ? e.on : e._c.has(c)), toggle: (c, on) => { if (on) e._c.add(c); else e._c.delete(c); } };
      e.append = (x) => { e.enfants.push(x); };
      e.setAttribute = (k, v) => { e.attrs[k] = String(v); };
      e.getAttribute = (k) => (k in e.attrs ? e.attrs[k] : null);
      e.addEventListener = (t, f) => { e.ecoute[t] = f; };
      Object.defineProperty(e, 'textContent', { get() { return this._t || ''; }, set(v) { this._t = String(v); if (v === '') this.enfants = []; } });
      els.set(id, e);
    }
    return els.get(id);
  };
  const cases = [el('f1'), el('f2'), el('f3')];
  el('tirCarte').hidden = false;
  const document = {
    hidden: false,
    querySelector: (s) => (s === '.jeuBandeau' ? el('bandeau') : s === '#slotsTable tbody' ? el('tbody') : s.startsWith('#') ? el(s.slice(1)) : null),
    querySelectorAll: (s) => (s === '#slotsFaces .jourFace' ? cases : []),
    getElementById: (id) => el(id),
    createElement: () => { const x = { dataset: {}, enfants: [], append(y) { this.enfants.push(y); } }; Object.defineProperty(x, 'textContent', { get() { return this._t || ''; }, set(v) { this._t = String(v); } }); return x; },
    addEventListener: () => {},
  };
  return { el, document, cases };
}
const blocRouleaux = (t) => entre(t, '/* ══ LES ROULEAUX DE LA CARTE DRAWS', '/* ══ FIN DES ROULEAUX */');
const blocSlots = (t) => entre(t, '/* ══ LES SLOTS (Phil 2026-10-23', '/* ══ EARN (Phil 19:40)');
const R = await importer(ROU);
async function monter(texte, ch, h, { compte = MOI, regleur = 'OFF', M = RS, envoyer = null } = {}) {
  const dom = faireDom();
  const ctx = {
    document: dom.document, window: { matchMedia: () => ({ matches: false }) }, creerRouleaux: R.creerRouleaux,
    faceRevelee, logoSvg, paramsLogoDepuisApparence, Slots, usdcTexte, compte, USDC_BASE: '0x' + '83'.repeat(20),
    $: (s) => dom.document.querySelector(s), jb: (id, t) => { dom.el(id).textContent = t; }, rpc: (m, p) => ch.rpc(m, p),
    fetch: async () => ({ json: async () => fiche(regleur) }), AbortSignal: { timeout: () => undefined },
    phraseNonConfirme: (r, pre) => pre, envoyerAppels: envoyer || (async () => ({ etat: 'ECHEC_ENVOI' })), recusLogs: async (r) => ({ logs: (r && r.logs) || [] }),
    jetonChoisi: () => null, connecter: async () => {}, allerA: () => {},
    setTimeout: h.setTimeout, clearTimeout: h.clearTimeout, setInterval: h.setInterval, Date: { now: h.maintenant }, peindreChoixJeu: () => {},
    reponseSpin: M.reponseSpin, etapesHtml: M.etapesHtml, topicDe: topic,
    /* revue 3, defaut 4 : le peintre redonne le focus attendu quand Spin devient visible (l espion note l etat de Spin a chaque appel) */
    jeuReprendreFocus: () => { focusAppels.push(dom.el('slotsSpin').hidden); return false; },
  };
  const focusAppels = [];
  const noms = Object.keys(ctx);
  const f = new Function(...noms, blocRouleaux(texte) + '\n' + blocSlots(texte) + '\n;return { rouleauxJeu, rouleauxTete, peindreSlots, slotsCfg, slotsAgir };');
  return { ...f(...noms.map((k) => ctx[k])), dom, ctx, focusAppels };
}
/* un Settled de CE contrat (22 mots : 3 hashes, 15 faces, points, payout, potAfter, playerPoints), au bloc `bloc` */
function logSettled(id, t, pts, payout, potApres, bloc) {
  const hs = [H(t), H(t + 1), H(t + 2)], faces = Slots.facesDuSpin(hs, id);
  return { address: CONTRAT, bloc, topics: [topic(Slots.EV_SETTLED), '0x' + w(id), '0x' + w(MOI)], data: '0x' + hs.map((x) => x.slice(2)).join('') + faces.flat().map(w).join('') + w(pts) + w(payout) + w(potApres) + w(pts) };
}
const pts_ = (p) => p + ' point' + (p === 1 ? '' : 's');
const etapesDe = (app) => [...String(app.dom.el('slotsEtapes').innerHTML).matchAll(/<li data-etat="([^"]+)" data-cle="([^"]+)"><b>\d<\/b> ([^<]*)<\/li>/g)].map((m) => ({ etat: m[1], cle: m[2], texte: m[3].replace(/&amp;/g, '&').replace(/&#39;/g, "'") }));
const actionDe = (app) => (app.dom.el('slotsSuite').hidden ? null : app.dom.el('slotsSuiteTxt').textContent);
/* un spin dont les faces (blocs t, t+1, t+2 : les hash du banc) donnent `veut` : un prix > 0, ou aucun */
function chercherT(depart, id, veut) {
  for (let t = depart; t < depart + 4000; t += 1) {
    const pts = Slots.points(Slots.facesDuSpin([H(t), H(t + 1), H(t + 2)], id));
    if ((veut === 'prix' && TABLE[pts] > 0n && TABLE[pts] <= 5000000n) || (veut === 'rien' && TABLE[pts] === 0n)) return { t, pts };
  }
  throw new Error('aucun t');
}

const S = {};
S.A = async (M) => partieA(M);
S.SANS_WALLET = async (M, texte = APP) => {
  const h = faireHorloge(), ch = faireChaine(h, {}), app = await monter(texte, ch, h, { compte: null, M });
  await app.peindreSlots(true);
  const b = app.dom.el('slotsSpin');
  const focus = app.focusAppels.includes(false);
  return { ok: focus && b.hidden === false && b.textContent === 'Connect a wallet to spin' && actionDe(app) === null && etapesDe(app).length === 0 && /^Pot 50\.00 USDC\. A spin costs /.test(app.dom.el('slotsEtat').textContent), b: b.textContent, focus };
};
S.ATTENTE = async (M, texte = APP) => {
  const id = '7', { t, pts } = chercherT(1003, id, 'prix');
  const h = faireHorloge(), ch = faireChaine(h, { depart: t - 2, spins: [{ id, t }] }), app = await monter(texte, ch, h, { M });
  app.rouleauxTete(ch.tete());
  await app.peindreSlots(true);
  const vus = [], comptes = new Set();
  let landing = false, fini = false, faux = false, poseA = null, drewA = null, prixTot = null;
  const noter = () => {
    const e = etapesDe(app), a = actionDe(app);
    if (!e.length) return;
    if (e[0].texte !== 'Sent — spin #' + id) faux = true;
    const m = /^Waiting for blocks ([\d,]+), ([\d,]+), ([\d,]+) — (\d) of 3 in$/.exec(e[1].texte);
    if (m) { comptes.add(Number(m[4])); if ([m[1], m[2], m[3]].join() !== [t, t + 1, t + 2].map(fmt).join()) faux = true; if (!/^Nothing to do yet: Settle opens once its 3 blocks are in/.test(a || '')) faux = true; }
    /* ⛔ revue 3, defaut 1 : pendant la pose, l action dit « Landing… » et RIEN d autre (aucun prix avant la 3e face) */
    if (/are in — the reels are landing$/.test(e[1].texte)) { landing = true; if (a !== 'Landing…' || e[2].etat !== 'attente') { faux = true; prixTot = prixTot || a; } }
    if (/drew your three faces$/.test(e[1].texte)) { fini = true; if (drewA === null) drewA = h.maintenant(); }
    if (poseA === null && app.rouleauxJeu.pose(id)) poseA = h.maintenant();
    vus.push(e[1].texte);
  };
  noter();
  await h.avancer(40000, noter);
  const e = etapesDe(app), a = actionDe(app) || '';
  const prix = TABLE[pts];
  const resultat = e[2] && e[2].texte === pts + ' point' + (pts === 1 ? '' : 's') + ' → prize ' + u(prix) + ' USDC (the contract\'s table)';
  const m = /^Settle now — (\d+) s left: ([\d.]+) USDC\.$/.exec(a);
  const reste = Slots.etatReglement(t, ch.tete(), app.slotsCfg.vue ? app.slotsCfg.vue.marge : 1).blocsRestants;
  const secondes = !!m && Math.abs(Number(m[1]) - reste * 2) <= 4 && m[2] === u(prix);
  const bouton = app.dom.el('slotsRegler').hidden === false;
  /* la 3e face posee : le panneau le dit DANS LE MEME tour (surPose), pas au minuteur suivant */
  const aussitot = poseA !== null && drewA === poseA;
  return { ok: !faux && comptes.size >= 2 && [...comptes].every((k) => k < 3) && landing && fini && resultat && secondes && bouton && aussitot, aussitot, poseA, drewA, faux, prixTot, comptes: [...comptes], landing, fini, resultat, secondes, bouton, a, e3: e[2] && e[2].texte, vus: [...new Set(vus)] };
};
S.REGLEUR = async (M, texte = APP) => {
  const id = '7', { t } = chercherT(1003, id, 'prix');
  const h = faireHorloge(), ch = faireChaine(h, { depart: t - 2, spins: [{ id, t }] }), app = await monter(texte, ch, h, { regleur: 'ON', M });
  app.rouleauxTete(ch.tete());
  await app.peindreSlots(true);
  const avant = actionDe(app);
  await h.avancer(40000);
  const apres = actionDe(app) || '';
  return { ok: avant === 'Nothing to do: the server\'s keeper settles it once its blocks are in.' && /^Settle now — \d+ s left: [\d.]+ USDC\. The server's keeper also settles it on its own\.$/.test(apres), avant, apres };
};
S.COURT = async (M, texte = APP) => {
  const id = '7', { t, pts } = chercherT(1003, id, 'prix');
  const prix = TABLE[pts], potCourt = prix / 2n;
  const h = faireHorloge(), ch = faireChaine(h, { depart: t + 10, spins: [{ id, t }], pot: potCourt }), app = await monter(texte, ch, h, { M });
  app.rouleauxTete(ch.tete());
  await app.peindreSlots(true); await h.avancer(6000);
  const a = actionDe(app) || '';
  const okA = new RegExp('^Accept what the pot holds: ' + u(potCourt).replace('.', '\\.') + ' USDC for spin #7 \\(' + u(prix - potCourt).replace('.', '\\.') + ' short\\) — \\d+ s left\\.$').test(a) && app.dom.el('slotsAccepter').hidden === false && app.dom.el('slotsRegler').hidden === true;
  const h2 = faireHorloge(), ch2 = faireChaine(h2, { depart: t + 10, spins: [{ id, t }], pot: 0n }), app2 = await monter(texte, ch2, h2, { M });
  app2.rouleauxTete(ch2.tete());
  await app2.peindreSlots(true); await h2.avancer(6000);
  const b = actionDe(app2) || '';
  const okB = /^Nothing to do now: the pot is empty — wait for it to grow \(\d+ s left\)\.$/.test(b) && app2.dom.el('slotsAccepter').hidden === true && app2.dom.el('slotsRegler').hidden === true;
  return { ok: okA && okB, a, b };
};
S.PERDU = async (M, texte = APP) => {
  const id = '7', { t } = chercherT(1003, id, 'prix');
  const h = faireHorloge(), ch = faireChaine(h, { depart: t + 300, spins: [{ id, t }] }), app = await monter(texte, ch, h, { M });
  app.rouleauxTete(ch.tete());
  await app.peindreSlots(true);
  const a = actionDe(app);
  return { ok: a === 'Lost: the 256-block window of spin #7 closed.' && app.dom.el('slotsRegler').hidden === true && app.dom.el('slotsAccepter').hidden === true, a };
};
S.SUIT = async (M, texte = APP) => {
  /* un ancien spin #5 reglable (Settle parle de lui) et un recent #6 en attente : rouleaux ET panneau sur #5 */
  const a5 = chercherT(1003, '5', 'prix');
  const h = faireHorloge(), ch = faireChaine(h, { depart: a5.t + 5, spins: [{ id: '5', t: a5.t }, { id: '6', t: a5.t + 7 }] }), app = await monter(texte, ch, h, { M });
  app.rouleauxTete(ch.tete());
  await app.peindreSlots(true); await h.avancer(5000);
  const e = etapesDe(app);
  const leg = app.dom.el('rouleauxLegende').textContent;
  return { ok: e.length === 3 && e[0].texte === 'Sent — spin #5' && /^Spin #5: /.test(leg) && /^Settle spin #5 /.test(app.dom.el('slotsRegler').textContent), e0: e[0] && e[0].texte, leg };
};
S.REGLE = async (M, texte = APP) => {
  const id = '7', { t, pts } = chercherT(1003, id, 'prix');
  const prix = TABLE[pts];
  const h = faireHorloge(), ch = faireChaine(h, { depart: t + 10, spins: [{ id, t }] });
  const hs = [H(t), H(t + 1), H(t + 2)], faces = Slots.facesDuSpin(hs, id);
  const log = { address: CONTRAT, topics: [topic(Slots.EV_SETTLED), '0x' + w(id), '0x' + w(MOI)], data: '0x' + hs.map((x) => x.slice(2)).join('') + faces.flat().map(w).join('') + w(pts) + w(prix) + w(ch.pot - prix) + w(pts) };
  const envoyer = async () => { ch.spins.get(id).statut = 2; ch.pot -= prix; return { etat: 'CONFIRME', hash: '0x' + '11'.repeat(32), logs: [log] }; };
  const app = await monter(texte, ch, h, { M, envoyer });
  app.rouleauxTete(ch.tete());
  await app.peindreSlots(true); await h.avancer(5000);
  await app.slotsAgir('settle');
  await h.avancer(8000);
  const e = etapesDe(app), a = actionDe(app);
  const ok = a === 'Nothing to do: ' + u(prix) + ' USDC is in your wallet.' && e[0].texte === 'Sent — spin #7' && e[2].texte === pts + ' points → ' + u(prix) + ' USDC paid to you';
  return { ok, a, e: e.map((x) => x.texte) };
};
/* ---------------------------------------------------------------- revue 3 (defauts 2 et 3) : sur le vrai code, avec la fausse chaine */
/* REGLE PAR LE REGLEUR : le spin suivi passe au statut 2 sur la chaine (le regleur l a regle, pas ce navigateur) : le panneau dit SON resultat
 *   (lu dans le Settled, ou recalcule si getLogs refuse — la source est dite) et le garde (60 s plus tard, rouleaux repartis en LIVE) */
async function regleurRegle(M, texte, evenement) {
  const id = '7', { t, pts } = chercherT(1003, id, 'prix');
  const prix = TABLE[pts];
  const h = faireHorloge(), ch = faireChaine(h, { depart: t - 2, spins: [{ id, t }] }), app = await monter(texte, ch, h, { regleur: 'ON', M });
  app.rouleauxTete(ch.tete());
  await app.peindreSlots(true); await h.avancer(20000);
  const avant = actionDe(app) || '';
  /* le regleur regle (une AUTRE transaction) au bloc courant */
  ch.spins.get(id).statut = 2; ch.pot -= prix;
  if (evenement) ch.settled.push(logSettled(id, t, pts, prix, ch.pot, ch.tete())); else ch.settledJette = true;
  const vus = [];
  await h.avancer(25000, () => { const a = actionDe(app); if (a) vus.push(a); });
  const e1 = etapesDe(app), a1 = actionDe(app);
  await h.avancer(60000);
  const e2 = etapesDe(app), a2 = actionDe(app);
  /* 2026-10-25 (revue adverse) : sans evenement Settled lu, le montant paye n est JAMAIS affirme (acceptCapped regle aussi avec moins) */
  const res = evenement ? 'Settled — ' + u(prix) + ' USDC paid to you (' + pts_(pts) + '; read from its Settled event)'
    : 'Settled — ' + pts_(pts) + ', prize ' + u(prix) + ' USDC; the amount paid was not read';
  const act = evenement ? 'Nothing to do: another transaction settled it (the server\'s keeper, or anyone) — ' + u(prix) + ' USDC went to your wallet.'
    : 'Nothing to do: another transaction settled it (the server\'s keeper, or anyone); any prize went to you.';
  /* jamais « Spin: the next three Base blocks… » (le panneau vide) apres le reglement */
  const vide = vus.some((x) => /^Spin: the next three/.test(x));
  const ok = /^Settle now — /.test(avant) && !vide && [e1, e2].every((e) => e.length === 3 && e[0].texte === 'Sent — spin #7' && e[2].texte === res) && a1 === act && a2 === act;
  return { ok, avant, vide, e1: e1.map((x) => x.texte), a1, e2: e2.map((x) => x.texte), a2 };
}
S.REGLEUR_REGLE = async (M, texte = APP) => regleurRegle(M, texte, true);
S.REGLEUR_RECALCULE = async (M, texte = APP) => regleurRegle(M, texte, false);
/* UN SPIN : #7 regle ICI (paye), puis Spin envoie #8 (regleur ON), puis le regleur regle #8. Apres l envoi, CHAQUE etat peint du panneau
 *   parle de #8 (jamais de #7, deja paye), jusqu a son resultat. */
const spunLog = (id, t) => ({ address: CONTRAT, topics: [Slots.TOPIC_SPUN, '0x' + w(id), '0x' + w(MOI)], data: '0x' + w(t) + w(TO_POT) + w(TO_DEV) });
S.UN_SPIN = async (M, texte = APP) => {
  const a7 = chercherT(1003, '7', 'prix');
  const prix7 = TABLE[a7.pts];
  const h = faireHorloge(), ch = faireChaine(h, { depart: a7.t + 10, spins: [{ id: '7', t: a7.t }] });
  let mode = 'settle', t8 = null;
  const envoyer = async () => {
    if (mode === 'settle') { ch.spins.get('7').statut = 2; ch.pot -= prix7; const l = logSettled('7', a7.t, a7.pts, prix7, ch.pot, ch.tete()); return { etat: 'CONFIRME', hash: '0x' + '11'.repeat(32), logs: [l] }; }
    t8 = ch.tete() + 2; ch.spins.set('8', { id: '8', t: t8, statut: 1 });
    return { etat: 'CONFIRME', hash: '0x' + '22'.repeat(32), logs: [spunLog('8', t8)] };
  };
  const app = await monter(texte, ch, h, { regleur: 'ON', M, envoyer });
  app.rouleauxTete(ch.tete());
  await app.peindreSlots(true); await h.avancer(5000);
  await app.slotsAgir('settle'); await h.avancer(3000);
  const paye7 = actionDe(app) === 'Nothing to do: ' + u(prix7) + ' USDC is in your wallet.';
  mode = 'spin';
  await app.slotsAgir('spin');
  const autres = [];
  const noter = () => { const e = etapesDe(app); if (!e.length || e[0].texte !== 'Sent — spin #8') autres.push(e.length ? e[0].texte : '(vide) ' + actionDe(app)); };
  noter();
  await h.avancer(20000, noter);
  /* le regleur regle #8 */
  const pts8 = Slots.points(Slots.facesDuSpin([H(t8), H(t8 + 1), H(t8 + 2)], '8')), prix8 = TABLE[pts8];
  ch.spins.get('8').statut = 2; ch.pot -= prix8;
  ch.settled.push(logSettled('8', t8, pts8, prix8, ch.pot, ch.tete()));
  await h.avancer(30000, noter);
  const e = etapesDe(app), a = actionDe(app) || '';
  const res8 = e[2] && e[2].texte === 'Settled — ' + (prix8 > 0n ? u(prix8) + ' USDC paid to you' : 'no prize') + ' (' + pts_(pts8) + '; read from its Settled event)';
  const ok = paye7 && autres.length === 0 && res8 && /^Nothing to do: another transaction settled it \(the server's keeper, or anyone\) — /.test(a);
  return { ok, paye7, autres: [...new Set(autres)].slice(0, 4), e: e.map((x) => x.texte), a };
};
/* SANS RECU : #7 regle ICI (paye), puis un Spin dont le recu ne montre pas le Spun et que l index des logs ne rend pas encore : le panneau
 *   ne revient PAS sur #7 (ses faces, son « paid to you ») — l envoi a tout remis a zero */
S.SANS_RECU = async (M, texte = APP) => {
  const a7 = chercherT(1003, '7', 'prix');
  const prix7 = TABLE[a7.pts];
  const h = faireHorloge(), ch = faireChaine(h, { depart: a7.t + 10, spins: [{ id: '7', t: a7.t }] });
  let mode = 'settle';
  const envoyer = async () => {
    if (mode === 'settle') { ch.spins.get('7').statut = 2; ch.pot -= prix7; return { etat: 'CONFIRME', hash: '0x' + '11'.repeat(32), logs: [logSettled('7', a7.t, a7.pts, prix7, ch.pot, ch.tete())] }; }
    ch.spins.set('8', { id: '8', t: ch.tete() + 2, statut: 1, indexEnRetard: true });
    return { etat: 'CONFIRME', hash: '0x' + '22'.repeat(32), logs: [] };
  };
  const app = await monter(texte, ch, h, { M, envoyer });
  app.rouleauxTete(ch.tete());
  await app.peindreSlots(true); await h.avancer(5000);
  await app.slotsAgir('settle'); await h.avancer(3000);
  const paye7 = /^Nothing to do: [\d.]+ USDC is in your wallet\.$/.test(actionDe(app) || '');
  mode = 'spin';
  await app.slotsAgir('spin');
  const sept = [];
  const noter = () => { const e = etapesDe(app); if (e.some((x) => /#7\b/.test(x.texte)) || /#7\b|paid to you|in your wallet/.test(actionDe(app) || '')) sept.push(e.map((x) => x.texte).join(' | ') + ' / ' + actionDe(app)); };
  noter();
  await h.avancer(12000, noter);
  return { ok: paye7 && sept.length === 0, paye7, sept: [...new Set(sept)].slice(0, 3) };
};
/* DEUX SPINS VIVANTS : #7 reglable (non regle), Spin envoie #8. Le panneau suit #8 (et les rouleaux avec lui) ; l action Settle NOMME #7 ;
 *   les etapes de #8 disent « Spin #8: » ; aucun repeint ne revient sur #7. */
S.DEUX_SPINS = async (M, texte = APP) => {
  const a7 = chercherT(1003, '7', 'prix');
  const h = faireHorloge(), ch = faireChaine(h, { depart: a7.t + 10, spins: [{ id: '7', t: a7.t }] });
  let t8 = null;
  const envoyer = async () => { t8 = ch.tete() + 2; ch.spins.set('8', { id: '8', t: t8, statut: 1 }); return { etat: 'CONFIRME', hash: '0x' + '22'.repeat(32), logs: [spunLog('8', t8)] }; };
  const app = await monter(texte, ch, h, { M, envoyer });
  app.rouleauxTete(ch.tete());
  await app.peindreSlots(true); await h.avancer(5000);
  await app.slotsAgir('spin');
  const autres = [], actions = [], legendes = [];
  const noter = () => {
    const e = etapesDe(app), a = actionDe(app);
    if (!e.length || e[0].texte !== 'Sent — spin #8') autres.push(e.length ? e[0].texte : '(vide)');
    if (e[1] && /Waiting for blocks/.test(e[1].texte)) { actions.push(a); if (!/^Spin #8: Waiting for blocks /.test(e[1].texte)) autres.push(e[1].texte); legendes.push(app.dom.el('rouleauxLegende').textContent); }
  };
  /* la legende des rouleaux se peint au tour suivant de leur minuteur (0 ms) : 1 ms d horloge */
  await h.avancer(1);
  noter();
  await h.avancer(4000, noter);
  const nomme = actions.length > 0 && actions.every((x) => /^Settle spin #7 now — \d+ s left: [\d.]+ USDC\.$/.test(x || ''));
  const leg = legendes.length > 0 && legendes.every((x) => /^Spin #8/.test(x));
  return { ok: autres.length === 0 && nomme && leg, autres: [...new Set(autres)].slice(0, 4), actions: [...new Set(actions)].slice(0, 3), legendes: [...new Set(legendes)].slice(0, 3) };
};
/* RESUME : « Pay with » NVDAc pour un Spin — le resume affiche avant la signature = le lot envoye au wallet */
const LIGNES = await lignesServies();
S.RESUME = async (M, texte = APP) => {
  const remettre = tempsRapide();
  try {
    const NV = LIGNES.find((l) => l.symbole === 'NVDAc'), J = '0x' + 'a1'.repeat(20);
    const c = chaineFactice({ soldes: new Map([[NV.jeton, 6000000n]]), joueur: J }), wl = walletFactice({ mode: 'lot', joueur: J });
    const ch = chargerPayer(texte, { compte: J, rpc: c.rpc, eth: wl.eth, lignes: LIGNES });
    await ch.api.peindrePayerAvec(); choisir(ch, NV.jeton);
    await ch.api.slotsAgir('spin');
    const env = appelsEnvoyes(wl.requetes);
    const maxIn = env.length ? BigInt('0x' + env[0].data.slice(74, 138)) : 0n;
    const phrase = ch.ecran.ecrits.filter((x) => x.id === 'slotsEtat').map((x) => x.texte).find((x) => x.startsWith('Pay with NVDAc')) || '';
    return { ok: env.length === 5 && phrase.includes('at most ' + ch.api.qteJeton(maxIn, 8, 6, true) + ' NVDAc in'), phrase: phrase.slice(0, 90), n: env.length };
  } finally { remettre(); }
};

for (const [k, f] of Object.entries(S)) { const r = await f(RS); vu(r.ok === true, 'scenario ' + k + ' ' + JSON.stringify(r, (_, v) => (typeof v === 'bigint' ? v.toString() : v)).slice(0, 1200)); }

/* ---------------------------------------------------------------- les mutants (copies en memoire) */
const MUT_RS = [
  ['A', 'mauvaise action : Settle offert quand le pot est court', "  const court = lot.length ? null : lignes.find((l) => l.decision === 'COURT' && l.paie > 0n) || null;", "  const court = null;"],
  ['A', 'Settle offert apres la fenetre (un perdu compte dans le lot)', "  const lot = lignes.filter((l) => l.decision === 'LOT');", "  const lot = lignes.filter((l) => l.decision === 'LOT' || l.decision === 'PERDU').map((l) => ({ paie: 0n, blocsRestants: 0, ...l, paie: l.paie || 0n }));"],
  ['A', 'les secondes ignorent le temps de bloc mesure', "  const ms = Number(msParBloc) > 0 ? Number(msParBloc) : 200;", '  const ms = 200;'],
  ['A', 'le bilan d un autre spin pris pour le spin suivi', "  const b = bilan && id && String(bilan.id) === id ? bilan : null;", '  const b = bilan || null;'],
  ['A', 'regleur ON jamais dit', "  if (ligne && ligne.decision === 'ATTENDRE') return regleurOn", "  if (ligne && ligne.decision === 'ATTENDRE') return false"],
  ['A', 'le compte des blocs fige a 0', "      const dans = Number.isSafeInteger(Number(tete)) ? Math.max(0, Math.min(3, Number(tete) - t + 1)) : 0;", '      const dans = 0;'],
  /* revue 3 : ce mutant-ci survivait au banc (le cas « rouleaux en vol » controlait son texte avec () => true) — remplace par : */
  ['A', 'le prix dit pendant la pose (action)', "  if (enVol) return action(ACTIONS.POSE, 'Landing…');\n", ''],
  ['ATTENTE', 'le prix dit pendant la pose (vrai code de la page)', "  if (enVol) return action(ACTIONS.POSE, 'Landing…');\n", ''],
  ['A', 'le resultat dit pendant la pose (etapes)', "    if (enVol) res = null;\n    else if (b && (b.issue === 'PAYE'", "    if (false) res = null;\n    else if (b && (b.issue === 'PAYE'"],
  ['A', 'les lignes ne nomment plus leur spin', "  const nomme = !!id && lignes.some((l) => String(l.id) !== id && l.decision !== 'PERDU');", '  const nomme = false;'],
  ['A', 'Settle ne nomme pas l autre spin', '  const seul = lot.length === 1 && String(lot[0].id) === id;', '  const seul = lot.length === 1;'],
  ['DEUX_SPINS', 'Settle ne nomme pas l autre spin (vrai code de la page)', '  const seul = lot.length === 1 && String(lot[0].id) === id;', '  const seul = lot.length === 1;'],
  ['A', 'la source du chiffre dite a l envers', "b.source === 'evenement' ? 'read from its Settled event'", "b.source !== 'evenement' ? 'read from its Settled event'"],
  ['A', 'regle ailleurs sans son resultat', "    else if (b && b.issue === 'REGLE_AILLEURS') res = { texte: regleAilleurs(b, fmt), etat: 'fait' };\n", ''],
  ['A', 'perdu dit sans nommer de spin suivi', "  const perdu = ligne && ligne.decision === 'PERDU' ? ligne : !ligne && !b ? lignes.find((l) => l.decision === 'PERDU') || null : null;", "  const perdu = ligne && ligne.decision === 'PERDU' ? ligne : null;"],
];
const MUT_APP = [
  ['SUIT', 'le panneau suit un autre spin que les rouleaux', '  slotsCfg.suivi = montre ? { id: String(montre.id), t: montre.t }', '  slotsCfg.suivi = spins.length ? { id: String(spins[spins.length - 1].id), t: spins[spins.length - 1].t }'],
  ['ATTENTE', 'le minuteur ne repeint plus le panneau (compte fige)', '  try { peindreReponseSlots(tete); } catch (_) { /* hors de la page (banc) */ }\n', ''],
  ['ATTENTE', 'la pose des rouleaux ne repeint plus le panneau', " try { peindreReponseSlots(); } catch (_) { /* le panneau se repeint au tour suivant */ } },", ' },'],
  ['REGLE', 'le bilan n est pas donne au panneau', '      slotsCfg.dernierBilan = bilan;\n', ''],
  ['SANS_WALLET', 'sans wallet le bouton Spin reste cache', '  bS.hidden = false; bS.disabled = slotsCfg.enCours;', '  bS.hidden = !moi; bS.disabled = slotsCfg.enCours;'],
  /* revue 3 (defauts 2, 3, 4) */
  ['DEUX_SPINS', 'le panneau suit le spin du bouton a chaque repeint', '  const sid = slotsCfg.suivi ? String(slotsCfg.suivi.id) : null;\n  const lui = sid', '  const sid = null;\n  const lui = sid'],
  ['UN_SPIN', 'le panneau suit le spin du bouton a chaque repeint (regle par le regleur)', '  const sid = slotsCfg.suivi ? String(slotsCfg.suivi.id) : null;\n  const lui = sid', '  const sid = null;\n  const lui = sid'],
  ['REGLEUR_REGLE', 'un spin regle ailleurs n est pas lu', '    if (ferme.st === 2 && (!a0 || (!a0.lu && a0.essais < 3))) {', '    if (false) {'],
  ['REGLEUR_REGLE', 'le resultat regle ailleurs n est pas donne au panneau', "  const bilan = ici && ici.issue !== 'REGLE_AILLEURS' && ici.issue !== 'NON_LU' ? ici : ailleurs || ici ||", '  const bilan = ici ||'],
  ['REGLEUR_RECALCULE', 'sans Settled lu, aucun recalcul', '  const h = await hashesSlots(tt);\n  if (!h) return r;', '  const h = null;\n  if (!h) return r;'],
  ['REGLEUR_REGLE', 'le resultat s efface quand les rouleaux repartent en LIVE', '  else if (s && slotsCfg.poseVu === String(s.id)) posees = true;\n', ''],
  ['REGLEUR_RECALCULE', 'un recalcul affirme le montant paye', "  return { ...r, hashes: h, bilan: { id: String(id), issue: 'REGLE_AILLEURS', points, prix, source: 'calcul' } };", "  return { ...r, hashes: h, bilan: { id: String(id), issue: 'REGLE_AILLEURS', points, prix, source: 'calcul', paie: prix } };"],
  ['SANS_RECU', 'un envoi garde les faces du spin d avant', 'slotsCfg.dernierBilan = null; slotsCfg.dernierFaces = null; slotsCfg.ailleurs = null; slotsCfg.poseVu = null;', 'slotsCfg.dernierBilan = null;'],
  ['SANS_WALLET', 'le peintre des Slots ne redonne pas le focus attendu', '  /* 2026-10-24 (revue 3) : un lien froid #game/slots (ou la tuile) tape avant /api/slots : le focus attendu arrive maintenant sur Spin */\n  try { jeuReprendreFocus(); } catch (_) { /* hors de la page (banc) */ }\n', ''],
  ['REGLEUR', 'le panneau ignore le regleur servi', "regleurOn: !!(j && j.regleur && j.regleur.etat === 'ON')", 'regleurOn: false'],
  ['RESUME', 'le resume Pay with dit le devis, pas le max-in envoye', "  const phrase = 'Pay with ' + sym + ': at most ' + qteJeton(r.maxEntree, dec, 6, true)", "  const phrase = 'Pay with ' + sym + ': at most ' + qteJeton(r.entreeCotee, dec, 6, true)"],
];
let tues = 0;
for (const [s, nom, de, vers] of MUT_RS) {
  vu(SRC_RS.split(de).length === 2, 'mutant reponse-spin « ' + nom + ' » : ancre unique');
  const M = await importer(SRC_RS.replace(de, () => vers).replace("from './slots-plan.js'", "from '" + new URL('./slots-plan.js', import.meta.url).href + "'"));
  let r; try { r = await S[s](M); } catch (e) { r = { ok: false, jete: String(e && e.message) }; }
  vu(r.ok === false, 'MUTANT reponse-spin « ' + nom + ' » : ' + s + ' ROUGIT');
  tues += 1;
}
for (const [s, nom, de, vers] of MUT_APP) {
  vu(APP.split(de).length === 2, 'mutant app « ' + nom + ' » : ancre unique');
  const copie = APP.replace(de, () => vers);
  let r; try { r = await S[s](RS, copie); } catch (e) { r = { ok: false, jete: String(e && e.message), syntaxe: e instanceof SyntaxError }; }
  vu(r.syntaxe !== true, 'mutant app « ' + nom + ' » : code valide');
  vu(r.ok === false, 'MUTANT app « ' + nom + ' » : ' + s + ' ROUGIT');
  tues += 1;
}
console.log('ok reponse-spin - ' + n + ' assertions, ' + Object.keys(S).length + ' scenarios (' + CAS.length + ' etats purs), ' + tues + '/' + (MUT_RS.length + MUT_APP.length) + ' mutants tues ; NE PROUVE PAS les pixels, un wallet reel, un spin reel sur Base');
