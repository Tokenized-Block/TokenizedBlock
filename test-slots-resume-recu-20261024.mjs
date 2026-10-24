/* test-slots-resume-recu-20261024.mjs — LA REVUE KEEPER, DEFAUT 5 (2026-10-24) : les mots de la carte des slots, sur le VRAI bloc de app.html.
 * Le bloc des slots (de « LES SLOTS (Phil 2026-10-23 » a « EARN (Phil 19:40) ») est EXECUTE tel quel contre un faux DOM, un faux wallet et une
 * fausse chaine (le banc de test-slots-carte-20261024.mjs, repris ; ici la chaine rend aussi le RECU et son bloc). ROUGE sur 518653b. AFFIRME :
 *   RESUME  tant que la fenetre du CONTRAT est ouverte (a cible + 255, marge de l app 3 blocs a 2 s), la phrase d etat (slotsResume) ne dit
 *           PAS « not settled in time and is lost » : elle dit que la fenetre ferme, trop tard pour un settle d ici, et que le regleur du
 *           serveur (s il est ON) ou un settle deja envoye peut encore tomber ; a cible + 256 (fenetre fermee) : « lost » ;
 *   RECU    un settle INCLUS A TEMPS (cible + 250) mais saute parce que le pot ne couvrait plus le prix (vide par une autre tx), relu quand
 *           la fenetre est passee (cible + 260) : « included in time (block …) … pot could not pay … » — jamais « the window closed before
 *           your settle was included » (faux) ; un settle inclus APRES la fenetre : FENETRE, comme avant ;
 *   PUR     slots-plan.js bilanReglement / phraseApres : SAUTE_PERDU, TROP_TOT, FENETRE, FERME (bloc du recu non lu), SAUTE.
 * Chaque affirmation est rejouee sur une COPIE MUTEE (le bloc en memoire ; slots-plan.js en copie .mutant-slots-plan-resume-<pid>.js, a cote,
 * effacee a la fin) et doit rougir. NE PROUVE PAS : le rendu au navigateur, un wallet reel, Base. */
import { strict as assert } from 'node:assert';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { usdc as usdcTexte } from './rolls-jeu.js';
import { keccak256Hex, topic } from './keccak.js';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const Slots0 = await import(new URL('./slots-plan.js', import.meta.url).href);

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html');
const P = JSON.parse(lire('contracts/slots-parametres.json'));
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const BLOC = entre(APP, '/* ══ LES SLOTS (Phil 2026-10-23', '/* ══ EARN (Phil 19:40)');
vu(BLOC.length > 5000, 'le bloc des slots est extrait de app.html');

function faireDom() {
  const els = new Map();
  const el = (id) => { if (!els.has(id)) { const e = { id, innerHTML: '', hidden: true, disabled: false, dataset: {}, enfants: [], classList: { contains: (c) => (id === 'v-missions' && c === 'on') }, append(x) { this.enfants.push(x); }, setAttribute() {}, addEventListener() {} };
    Object.defineProperty(e, 'textContent', { get() { return this._t || ''; }, set(v) { this._t = String(v); if (v === '') this.enfants = []; } }); els.set(id, e); } return els.get(id); };
  const faces = [el('f1'), el('f2'), el('f3')];
  const document = { hidden: false, querySelector: (s) => (s === '.jeuBandeau' ? el('bandeau') : s === '#slotsTable tbody' ? el('tbody') : s.startsWith('#') ? el(s.slice(1)) : null),
    querySelectorAll: (s) => (s === '#slotsFaces .jourFace' ? faces : []), getElementById: (id) => el(id), createElement: () => ({ textContent: '', dataset: {}, enfants: [], append(x) { this.enfants.push(x); } }) };
  return { el, document, liste: () => el('slotsListe').enfants.map((x) => x.textContent) };
}
const CONTRAT = '0x' + 'cc'.repeat(20), MOI = '0x' + 'a1'.repeat(20), HASH_TX = '0x' + '11'.repeat(32);
const trois = (g) => [0, 1, 2].map((r) => keccak256Hex(Uint8Array.from([...new TextEncoder().encode(g), r])));
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
/* la fausse chaine : settleMany applique la fenetre et le pot du contrat a la tete au moment de l INCLUSION ; le recu rend ce bloc */
function faireChaine(Slots, { pot, tete, spins }) {
  const TABLE = P.prizes.map(BigInt), { toPot: TO_POT, toDev: TO_DEV } = Slots.partsDuSpin(P.spinPrice, P.potShareBps);
  const SEL_MANY = Slots.planSettleMany({ contrat: CONTRAT, spinIds: [1] }).appels[0].data.slice(0, 10);
  const c = { pot: BigInt(pot), tete, spins: new Map(), hashes: new Map(), appels: [], blocInclus: null };
  for (const s of spins) { c.spins.set(String(s.id), { id: String(s.id), t: s.t, statut: 1, joueur: MOI, ne: s.t - 2 }); s.hashes.forEach((h, r) => c.hashes.set(s.t + r, h)); }
  const juger = (s) => { const h = [0, 1, 2].map((r) => c.hashes.get(s.t + r)); const f = Slots.facesDuSpin(h, s.id); const p = Slots.points(f); return { h, f, p, prix: TABLE[p] }; };
  c.executer = (data) => {
    const d = data.toLowerCase(), sel = d.slice(0, 10), mots = (d.slice(10).match(/.{64}/g) || []).map((x) => BigInt('0x' + x));
    if (sel !== SEL_MANY) throw new Error('unknown call ' + sel);
    c.blocInclus = c.tete;
    const logs = [];
    for (const id of mots.slice(2)) { const s = c.spins.get(String(id)); if (!s || s.statut !== 1 || c.tete <= s.t + 2 || c.tete > s.t + 256) continue; const j = juger(s); if (j.prix > c.pot) continue; s.statut = 2; c.pot -= j.prix;
      logs.push({ address: CONTRAT, topics: [topic(Slots.EV_SETTLED), '0x' + w(s.id), '0x' + w(MOI)], data: '0x' + j.h.map((x) => x.slice(2)).join('') + j.f.flat().map(w).join('') + w(j.p) + w(j.prix) + w(c.pot) + w(0) }); }
    return logs;
  };
  c.rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x' + c.tete.toString(16);
    if (m === 'eth_getBlockByNumber') { const b = parseInt(p[0], 16), h = c.hashes.get(b); return h && b < c.tete ? { hash: h } : null; }
    if (m === 'eth_getLogs') { const f = p[0], de = parseInt(f.fromBlock, 16), jq = Math.min(parseInt(f.toBlock, 16), c.tete);
      return [...c.spins.values()].filter((s) => s.ne >= de && s.ne <= jq).map((s) => ({ address: CONTRAT, topics: [Slots.TOPIC_SPUN, '0x' + w(s.id), '0x' + w(s.joueur)], data: '0x' + w(s.t) + w(TO_POT) + w(TO_DEV) })); }
    if (m === 'eth_getTransactionReceipt') return p[0] === HASH_TX && c.blocInclus !== null ? { status: '0x1', blockNumber: '0x' + c.blocInclus.toString(16), logs: [] } : null;
    if (m === 'eth_call') { const d = p[0].data.toLowerCase();
      if (d === Slots.appelPot()) return '0x' + w(c.pot);
      if (d === Slots.appelPointsDe(MOI) || d === Slots.appelGagneDe(MOI)) return '0x' + w(0);
      if (d.startsWith(Slots.appelSpin(0).slice(0, 10))) { const s = c.spins.get(String(BigInt('0x' + d.slice(10)))); return s ? '0x' + w(s.joueur) + w(s.t) + w(s.statut) : '0x' + w(0) + w(0) + w(0); } }
    throw new Error('rpc ' + m);
  };
  return c;
}
function monter(bloc, Slots, chaine, { avantEnvoi = null, apresEnvoi = null, msParBloc = 2000, regleur = 'OFF' } = {}) {
  const dom = faireDom(); let dernier = null; const auWallet = [];
  const F = { ok: true, contrat: CONTRAT, prixSpin: P.spinPrice, potShareBps: P.potShareBps, prizes: P.prizes, esperanceBrut: '127862', bloc: 900, regleur: { etat: regleur, adresse: null, msParBlocMesure: msParBloc } };
  const ctx = { document: dom.document, Slots, usdcTexte, compte: MOI, USDC_BASE: '0x' + '83'.repeat(20), $: (s) => dom.document.querySelector(s), jb: (id, t) => { dom.el(id).textContent = t; },
    rpc: (m, p) => chaine.rpc(m, p), fetch: async () => ({ json: async () => F }), AbortSignal, faceRevelee: () => ({}), logoSvg: () => '<svg/>', paramsLogoDepuisApparence: () => ({}),
    phraseNonConfirme: (r, pre) => pre + ': ' + (r && r.pourquoi ? r.pourquoi : 'not confirmed'),
    envoyerAppels: async (appels) => { auWallet.push(dom.el('slotsEtat').textContent); chaine.appels.push(appels.map((a) => a.data)); if (avantEnvoi) avantEnvoi(chaine);
      dernier = appels.flatMap((a) => chaine.executer(a.data)); if (apresEnvoi) apresEnvoi(chaine); return { etat: 'CONFIRME', hash: HASH_TX }; },
    recusLogs: async () => ({ logs: dernier || [], manque: 0, n: 1 }), setInterval: () => 0, setTimeout: () => 0, clearTimeout: () => {} };
  const noms = Object.keys(ctx);
  const f = new Function(...noms, bloc + '\n;return { peindreSlots, slotsAgir, slotsCfg };');
  return { ...f(...noms.map((k) => ctx[k])), dom, auWallet };
}
/* un spin #1 qui GAGNE (>= 3 points : un prix > 0, sinon un pot vide le paierait encore) — graine cherchee, deterministe */
const H = (() => { for (let i = 0; i < 20000; i++) { const h = trois('resume1-' + i); if (Slots0.points(Slots0.facesDuSpin(h, 1n)) >= 3) return h; } throw new Error('no seed'); })();
/* RESUME : cible + 255 a 2 s par bloc (marge 3) — la fenetre du contrat est ouverte ; cible + 256 — fermee */
async function scenarioResume(bloc, Slots) {
  const lu = async (tete, regleur) => { const ch = faireChaine(Slots, { pot: 9000000n, tete, spins: [{ id: 1, t: 1002, hashes: H }] }); const app = monter(bloc, Slots, ch, { msParBloc: 2000, regleur }); await app.peindreSlots(true); return app.dom.el('slotsEtat').textContent; };
  const ouvertOn = await lu(1002 + 255, 'ON'), ouvertOff = await lu(1002 + 255, 'OFF'), ferme = await lu(1002 + 256, 'ON');
  const ok = !/not settled in time/.test(ouvertOn) && !/not settled in time/.test(ouvertOff) && /window closes within 1 block\(s\): too soon for a new settle from here\. The server's keeper/.test(ouvertOn)
    && /A settle already sent can still land in time; if none does, it is lost\./.test(ouvertOff) && !/keeper/.test(ouvertOff) && /1 spin was not settled in time and is lost — nothing is returned\./.test(ferme);
  return { ok, ouvertOn, ouvertOff, ferme };
}
/* RECU : le pot est vide par une autre tx juste avant l inclusion (cible + 250, a temps) ; relu a cible + 260 */
async function scenarioRecu(bloc, Slots) {
  const ch = faireChaine(Slots, { pot: 9000000n, tete: 1002 + 249, spins: [{ id: 1, t: 1002, hashes: H }] });
  const app = monter(bloc, Slots, ch, { msParBloc: 2000, avantEnvoi: (c) => { c.tete += 1; c.pot = 0n; }, apresEnvoi: (c) => { c.tete = 1002 + 260; } });
  await app.peindreSlots(true);
  await app.slotsAgir('settle');
  const txt = app.dom.el('slotsEtat').textContent;
  /* inclus APRES la fenetre : FENETRE (inchange) */
  const ch2 = faireChaine(Slots, { pot: 9000000n, tete: 1002 + 252, spins: [{ id: 1, t: 1002, hashes: H }] });
  const a2 = monter(bloc, Slots, ch2, { msParBloc: 2000, avantEnvoi: (c) => { c.tete = 1002 + 258; } });
  await a2.peindreSlots(true);
  await a2.slotsAgir('settle');
  const txt2 = a2.dom.el('slotsEtat').textContent;
  const ok = ch.appels.length === 1 && ch.spins.get('1').statut === 1 && /Spin #1: not settled — your settle was included in time \(block 1252\), but the pot could not pay its full [0-9.]+ USDC prize, so it was skipped and nothing was taken\. Its window has closed since \(block 1258\): the spin is lost, nothing is returned\./.test(txt)
    && !/window closed before your settle was included/.test(txt) && ch2.appels.length === 1 && /Spin #1: the 256-block window closed before your settle was included/.test(txt2);
  return { ok, txt, txt2 };
}
/* PUR : bilanReglement / phraseApres */
function scenarioPur(Slots) {
  const T = P.prizes.map(BigInt);
  const b = (blocRecu, tete) => Slots.bilanReglement({ envoyes: [{ id: '3', t: 1002, prix: 5000000n }], settled: [], statuts: new Map([['3', 1]]), tete, table: T, blocRecu })[0];
  const sp = b(1250, 1260), tt = b(1003, 1010), tf = b(1004 - 2, 1300), fe = b(1259, 1260), fm = b(null, 1260), so = b(1250, 1252);
  const ok = sp.issue === 'SAUTE_PERDU' && /included in time \(block 1250\)/.test(Slots.phraseApres(sp)) && tt.issue === 'TROP_TOT' && /still yours to settle until block 1258/.test(Slots.phraseApres(tt))
    && tf.issue === 'TROP_TOT' && /Its window has closed since \(block 1258\): the spin is lost/.test(Slots.phraseApres(tf))
    && fe.issue === 'FENETRE' && fm.issue === 'FERME' && /whether the pot was short or the window had closed is not known/.test(Slots.phraseApres(fm)) && so.issue === 'SAUTE'
    && !/refund/i.test([sp, tt, tf, fe, fm, so].map((x) => Slots.phraseApres(x)).join(' '));
  return { ok, issues: [sp, tt, tf, fe, fm, so].map((x) => x.issue) };
}

const r1 = await scenarioResume(BLOC, Slots0);
vu(r1.ok, 'RESUME : fenetre du contrat ouverte, pas « lost » ; fermee, « lost » ' + (r1.ok ? '' : JSON.stringify(r1)));
const r2 = await scenarioRecu(BLOC, Slots0);
vu(r2.ok, 'RECU : inclus a temps et saute pour le pot, puis fenetre fermee — dit tel quel ; inclus trop tard — FENETRE ' + (r2.ok ? '' : JSON.stringify(r2)));
const r3 = scenarioPur(Slots0);
vu(r3.ok, 'PUR : SAUTE_PERDU, TROP_TOT (ouvert / ferme), FENETRE, FERME, SAUTE ' + (r3.ok ? '' : JSON.stringify(r3)));

/* ---------------------------------------------------------------- les mutants : le bloc de app.html (en memoire) */
const MUT_BLOC = [
  ['RESUME', 'slotsResume dit perdu tout spin PERDU (518653b)', "const fermant = plan.lignes.filter((l) => l.decision === 'PERDU' && l.fermeDans > 0), clos = plan.lignes.filter((l) => l.decision === 'PERDU' && !(l.fermeDans > 0));", "const fermant = [], clos = plan.lignes.filter((l) => l.decision === 'PERDU');"],
  ['RESUME', 'le regleur toujours promis', "const reg = slotsCfg.j && slotsCfg.j.regleur && slotsCfg.j.regleur.etat === 'ON';", 'const reg = true;'],
  ['RECU', 'le bloc du recu n est pas passe au bilan (518653b)', 'table: vue.table, blocRecu });', 'table: vue.table });'],
];
for (const [s, nom, de, vers] of MUT_BLOC) {
  vu(BLOC.split(de).length === 2, 'mutant « ' + nom + ' » : ancre unique dans le bloc');
  const r = s === 'RESUME' ? await scenarioResume(BLOC.replace(de, () => vers), Slots0) : await scenarioRecu(BLOC.replace(de, () => vers), Slots0);
  vu(r.ok === false, 'MUTANT « ' + nom + ' » : le scenario ' + s + ' ROUGIT');
}
/* ---------------------------------------------------------------- les mutants : slots-plan.js (une COPIE a cote, ancres \r?\n-sures) */
const SRC = readFileSync(path.join(ICI, 'slots-plan.js'), 'utf8');
const MUT_PLAN = [
  ['un saute relu fenetre fermee redevient FENETRE (518653b)', "if (b !== null) return { id, issue: ferme ? 'SAUTE_PERDU' : 'SAUTE',", "if (b !== null) return { id, issue: ferme ? 'FENETRE' : 'SAUTE',"],
  ['inclus apres la fenetre : plus FENETRE', 'if (b !== null && b > fin) return', 'if (false) return'],
  ['inclus trop tot : plus TROP_TOT', 'if (b !== null && b <= Number(x.t) + REELS - 1) return', 'if (false) return'],
  ['sans bloc du recu : FENETRE affirme', "return { id, issue: ferme ? 'FERME' : 'SAUTE', prix: x.prix, dernierBloc: fin };", "return { id, issue: ferme ? 'FENETRE' : 'SAUTE', prix: x.prix, dernierBloc: fin };"],
];
const COPIE = path.join(ICI, '.mutant-slots-plan-resume-' + process.pid + '.js');
try {
  for (const [nom, de, vers] of MUT_PLAN) {
    vu(SRC.split(de).length === 2, 'mutant slots-plan « ' + nom + ' » : ancre unique');
    writeFileSync(COPIE, SRC.replace(de, () => vers));
    const S = await import(pathToFileURL(COPIE).href + '?m=' + n);
    const r = [await scenarioRecu(BLOC, S), scenarioPur(S)];
    vu(r.some((x) => x.ok === false), 'MUTANT slots-plan « ' + nom + ' » : RECU ou PUR ROUGIT');
  }
} finally { rmSync(COPIE, { force: true }); }
console.log('ok slots-resume-recu - ' + n + ' assertions (' + (MUT_BLOC.length + MUT_PLAN.length) + ' mutants tues) ; NE PROUVE PAS le rendu au navigateur, un wallet reel, Base');
