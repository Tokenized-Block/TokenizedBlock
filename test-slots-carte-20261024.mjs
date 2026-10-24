/* test-slots-carte-20261024.mjs — LES DEUX DEFAUTS DE LA CARTE DES SLOTS (audit slots-app 2026-10-24), sur le VRAI bloc de app.html.
 * Le bloc des slots (de « LES SLOTS (Phil 2026-10-23 » a « EARN (Phil 19:40) ») est EXECUTE tel quel contre un faux DOM, un faux wallet et
 * une fausse chaine (le PoC de l auditeur, scratchpad/slots/poc.mjs, repris). ROUGE sur 0f9d8ec, VERT apres. AFFIRME :
 *   S0    un statut 0 (None) lu sur un noeud en retard d un bloc ne CLOT pas le spin : il est dit « not read », relu, et Settle l offre
 *         ensuite (avant : clos pour de bon, « No spin waiting. », le prix perdu) ;
 *   T256  a la tete cible + 256, la carte n offre pas Settle (la tx tomberait a + 257) et un clic n envoie rien ; nulle part « 0 block(s) » ;
 *   CACHE la tete lue par un cache de 4 s peut retarder de 2 blocs (2 s par bloc) : la carte en tient compte (marge) ; un clic a la tete
 *         reelle cible + 256 lue cible + 254 n envoie rien ;
 *   FIN   a moins de blocs que la marge, la ligne dit que la fenetre FERME (pas « closed ») ; a 1 bloc, le wallet dit « 1 block(s) left ».
 * Chaque affirmation est rejouee sur une COPIE MUTEE du bloc (en memoire) et doit rougir. SLOTS_PLAN_MODULE : une copie mutee de
 * slots-plan.js (muter-correctifs-keeper-20261024.mjs). NE PROUVE PAS : le rendu au navigateur, un wallet reel, un vrai noeud en retard. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { usdc as usdcTexte } from './rolls-jeu.js';
import { keccak256Hex, topic } from './keccak.js';
const Slots = await import(process.env.SLOTS_PLAN_MODULE ? pathToFileURL(process.env.SLOTS_PLAN_MODULE).href : new URL('./slots-plan.js', import.meta.url).href);

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
const CONTRAT = '0x' + 'cc'.repeat(20), MOI = '0x' + 'a1'.repeat(20);
const trois = (g) => [0, 1, 2].map((r) => keccak256Hex(Uint8Array.from([...new TextEncoder().encode(g), r])));
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const TABLE = P.prizes.map(BigInt), { toPot: TO_POT, toDev: TO_DEV } = Slots.partsDuSpin(P.spinPrice, P.potShareBps);
const SEL_SPIN = Slots.planSpin({ contrat: CONTRAT, usdc: CONTRAT, spinPrice: 1 }).appels[1].data.slice(0, 10);
const SEL_APPROVE = Slots.planSpin({ contrat: CONTRAT, usdc: CONTRAT, spinPrice: 1 }).appels[0].data.slice(0, 10);
const SEL_MANY = Slots.planSettleMany({ contrat: CONTRAT, spinIds: [1] }).appels[0].data.slice(0, 10);
/* la fausse chaine : `retard` = un noeud en retard d un bloc (ne connait pas un spin mine a la tete) ; `teteVue` = la tete RENDUE par
 * eth_blockNumber (le cache de l app : en retard de `lagTete` blocs sur la vraie) ; settleMany applique la fenetre du contrat a la VRAIE tete */
function faireChaine({ pot, tete, spins, lagTete = 0 }) {
  const c = { pot: BigInt(pot), tete, lagTete, spins: new Map(), hashes: new Map(), appels: [], retard: false, spinCount: 0 };
  const add = (s) => { c.spins.set(String(s.id), { id: String(s.id), t: s.t, statut: 1, joueur: MOI, ne: s.ne ?? s.t - 2 }); (s.hashes || trois('fond' + s.id)).forEach((h, r) => c.hashes.set(s.t + r, h)); c.spinCount = Math.max(c.spinCount, s.id); };
  for (const s of spins) add(s);
  const juger = (s) => { const h = [0, 1, 2].map((r) => c.hashes.get(s.t + r)); const f = Slots.facesDuSpin(h, s.id); const p = Slots.points(f); return { h, f, p, prix: TABLE[p] }; };
  const reglable = (s) => s && s.statut === 1 && c.tete > s.t + 2 && c.tete <= s.t + 256;
  c.executer = (data) => {
    const d = data.toLowerCase(), sel = d.slice(0, 10), mots = (d.slice(10).match(/.{64}/g) || []).map((x) => BigInt('0x' + x));
    if (sel === SEL_APPROVE) return [];
    if (sel === SEL_SPIN) { const id = c.spinCount + 1; add({ id, t: c.tete + 2, ne: c.tete, hashes: trois(id === 1 ? 'nouveau1x4' : 'nouveau' + id) }); c.pot += TO_POT;
      return [{ address: CONTRAT, topics: [Slots.TOPIC_SPUN, '0x' + w(id), '0x' + w(MOI)], data: '0x' + w(c.tete + 2) + w(TO_POT) + w(TO_DEV) }]; }
    if (sel === SEL_MANY) { const logs = []; for (const id of mots.slice(2)) { const s = c.spins.get(String(id)); if (!reglable(s)) continue; const j = juger(s); if (j.prix > c.pot) continue; s.statut = 2; c.pot -= j.prix;
        logs.push({ address: CONTRAT, topics: [topic(Slots.EV_SETTLED), '0x' + w(s.id), '0x' + w(MOI)], data: '0x' + j.h.map((x) => x.slice(2)).join('') + j.f.flat().map(w).join('') + w(j.p) + w(j.prix) + w(c.pot) + w(0) }); }
      return logs; }
    throw new Error('unknown call ' + sel);
  };
  c.rpc = async (m, p) => {
    const vue = c.retard ? c.tete - 1 : c.tete;
    if (m === 'eth_blockNumber') return '0x' + (c.tete - c.lagTete).toString(16);
    if (m === 'eth_getBlockByNumber') { const b = parseInt(p[0], 16), h = c.hashes.get(b); return h && b < c.tete ? { hash: h } : null; }
    if (m === 'eth_getLogs') { const f = p[0], de = parseInt(f.fromBlock, 16), jq = Math.min(parseInt(f.toBlock, 16), vue);
      return [...c.spins.values()].filter((s) => s.ne >= de && s.ne <= jq).map((s) => ({ address: CONTRAT, topics: [Slots.TOPIC_SPUN, '0x' + w(s.id), '0x' + w(s.joueur)], data: '0x' + w(s.t) + w(TO_POT) + w(TO_DEV) })); }
    if (m === 'eth_call') { const d = p[0].data.toLowerCase();
      if (d === Slots.appelPot()) return '0x' + w(c.pot);
      if (d === Slots.appelPointsDe(MOI) || d === Slots.appelGagneDe(MOI)) return '0x' + w(0);
      if (d.startsWith(Slots.appelSpin(0).slice(0, 10))) { const s = c.spins.get(String(BigInt('0x' + d.slice(10)))); return s && s.ne <= vue ? '0x' + w(s.joueur) + w(s.t) + w(s.statut) : '0x' + w(0) + w(0) + w(0); } }
    throw new Error('rpc ' + m);
  };
  return c;
}
const fiche = (msParBloc) => ({ ok: true, contrat: CONTRAT, prixSpin: P.spinPrice, potShareBps: P.potShareBps, prizes: P.prizes, esperanceBrut: '127862', bloc: 900, regleur: { etat: 'OFF', adresse: null, msParBlocMesure: msParBloc } });
function monter(bloc, chaine, { avantEnvoi = null, msParBloc = 2000, minuteurs = null } = {}) {
  const dom = faireDom(); let dernier = null; const auWallet = [];
  const F = fiche(msParBloc);
  const ctx = { document: dom.document, Slots, usdcTexte, compte: MOI, USDC_BASE: '0x' + '83'.repeat(20), $: (s) => dom.document.querySelector(s), jb: (id, t) => { dom.el(id).textContent = t; },
    rpc: (m, p) => chaine.rpc(m, p), fetch: async () => ({ json: async () => F }), AbortSignal, faceRevelee: () => ({}), logoSvg: () => '<svg/>', paramsLogoDepuisApparence: () => ({}),
    phraseNonConfirme: (r, pre) => pre + ': ' + (r && r.pourquoi ? r.pourquoi : 'not confirmed'),
    envoyerAppels: async (appels) => { auWallet.push(dom.el('slotsEtat').textContent); chaine.appels.push(appels.map((a) => a.data)); if (avantEnvoi) avantEnvoi(chaine); try { dernier = appels.flatMap((a) => chaine.executer(a.data)); return { etat: 'CONFIRME', hash: '0x' + '11'.repeat(32) }; } catch (e) { dernier = []; return { etat: 'ECHEC_ENVOI', pourquoi: String(e.message) }; } },
    recusLogs: async () => ({ logs: dernier || [], manque: 0, n: 1 }), setInterval: () => 0,
    /* 2026-10-24 (« Pay with ») : USDC, le defaut — aucun jeton choisi (le chemin jeton est execute par test-payer-avec-20261024) */
    jetonChoisi: () => null,
    /* les minuteurs du bloc : gardes (minuteurs fourni) et declenches a la main par le scenario, sinon jamais */
    setTimeout: (f) => { if (minuteurs) minuteurs.push(f); return minuteurs ? minuteurs.length : 0; }, clearTimeout: () => {} };
  const noms = Object.keys(ctx);
  const f = new Function(...noms, bloc + '\n;return { peindreSlots, slotsAgir, slotsCfg };');
  return { ...f(...noms.map((k) => ctx[k])), dom, auWallet };
}
const texte = (app) => [app.dom.el('slotsEtat').textContent, ...app.dom.liste(), ...app.auWallet].join(' | ');

/* S0 : le statut 0 d un noeud en retard ne clot pas le spin */
const vider = async () => { for (let k = 0; k < 60; k++) await new Promise((ok) => setImmediate(ok)); };
const declencher = async (minuteurs) => { const fs = minuteurs.splice(0); for (const f of fs) f(); await vider(); };
async function scenarioS0(bloc) {
  const ch = faireChaine({ pot: 0n, tete: 5000, spins: [] });
  const minuteurs = [];
  const app = monter(bloc, ch, { minuteurs });
  await app.peindreSlots(true);
  await app.slotsAgir('spin');
  /* le repeint de 1,5 s apres le recu (le chemin de l audit) tombe sur un noeud en retard d un bloc */
  ch.retard = true;
  await declencher(minuteurs);
  const pendant = { clos: [...app.slotsCfg.clos], spins: [...app.slotsCfg.spins.keys()], liste: app.dom.liste().join(' ') };
  ch.retard = false;
  /* ensuite, SEULS les minuteurs de la carte repeignent (aucun repeint force par le test) */
  for (let k = 0; k < 5; k++) { ch.tete += 2; await declencher(minuteurs); }
  const apres = { etat: app.dom.el('slotsEtat').textContent, btn: app.dom.el('slotsRegler').hidden };
  await app.slotsAgir('settle');
  const s1 = ch.spins.get('1');
  const ok = pendant.clos.length === 0 && pendant.spins.includes('1') && /could not be read just now/.test(pendant.liste) && apres.btn === false && !/No spin waiting/.test(apres.etat) && s1.statut === 2 && ch.appels.length === 2;
  return { ok, pendant, apres, statut: s1.statut };
}
/* T256 : a la tete cible + 256, pas d offre ; un clic n envoie rien ; jamais « 0 block(s) » de cible + 3 a cible + 260 */
async function scenarioT256(bloc) {
  const H = trois('fond1');
  const ch = faireChaine({ pot: 9000000n, tete: 1002 + 256, spins: [{ id: 1, t: 1002, hashes: H }] });
  const app = monter(bloc, ch, { avantEnvoi: (c) => { c.tete += 1; }, msParBloc: 2000 });
  await app.peindreSlots(true);
  const btn = app.dom.el('slotsRegler').hidden;
  await app.slotsAgir('settle');
  const envoye = ch.appels.length;
  let zero = false;
  for (let b = 1002 + 3; b <= 1002 + 260; b += 1) {
    const ch2 = faireChaine({ pot: 9000000n, tete: b, spins: [{ id: 1, t: 1002, hashes: H }] });
    const a2 = monter(bloc, ch2, { avantEnvoi: (c) => { c.tete += 1; } });
    await a2.peindreSlots(true);
    if (!a2.dom.el('slotsRegler').hidden && b >= 1002 + 250) await a2.slotsAgir('settle');
    if (/\b0 block\(s\)/.test(texte(a2))) zero = b;
  }
  return { ok: btn === true && envoye === 0 && zero === false, btn, envoye, zero, txt: texte(app) };
}
/* CACHE : tete reelle cible + 256, lue cible + 254 (cache de 4 s a 2 s par bloc) : rien n est envoye ; lue cible + 253 et reelle + 254 : envoye, regle */
async function scenarioCache(bloc) {
  const H = trois('fond1');
  const ch = faireChaine({ pot: 9000000n, tete: 1002 + 256, lagTete: 2, spins: [{ id: 1, t: 1002, hashes: H }] });
  const app = monter(bloc, ch, { avantEnvoi: (c) => { c.tete += 1; }, msParBloc: 2000 });
  await app.peindreSlots(true);
  const btnA = app.dom.el('slotsRegler').hidden;
  await app.slotsAgir('settle');
  const envA = ch.appels.length;
  const chB = faireChaine({ pot: 9000000n, tete: 1002 + 254, lagTete: 1, spins: [{ id: 1, t: 1002, hashes: H }] });
  const appB = monter(bloc, chB, { avantEnvoi: (c) => { c.tete += 1; }, msParBloc: 2000 });
  await appB.peindreSlots(true);
  await appB.slotsAgir('settle');
  /* la carte peinte plus tot (faces lues), puis le clic a la tete reelle cible + 256 lue cible + 254 : le plan refait au clic garde la marge */
  const chC = faireChaine({ pot: 9000000n, tete: 1002 + 240, spins: [{ id: 1, t: 1002, hashes: H }] });
  const appC = monter(bloc, chC, { avantEnvoi: (c) => { c.tete += 1; }, msParBloc: 2000 });
  await appC.peindreSlots(true);
  chC.tete = 1002 + 256; chC.lagTete = 2;
  await appC.slotsAgir('settle');
  const ok = btnA === true && envA === 0 && chC.appels.length === 0 && chB.appels.length === 1 && chB.spins.get('1').statut === 2 && /Confirm in your wallet now: \d+ block\(s\) left/.test(appB.auWallet[0] || '') && !/\b0 block\(s\)/.test(appB.auWallet[0] || '');
  return { ok, btnA, envA, envB: chB.appels.length, statutB: chB.spins.get('1').statut, wallet: appB.auWallet[0] };
}
/* FIN : a moins de blocs que la marge, la ligne dit que la fenetre FERME ; a 1 bloc de marge, le wallet dit « 1 block(s) left » */
async function scenarioFin(bloc) {
  const H = trois('fond1');
  const ch = faireChaine({ pot: 9000000n, tete: 1002 + 255, spins: [{ id: 1, t: 1002, hashes: H }] });
  const app = monter(bloc, ch, { msParBloc: 2000 });
  await app.peindreSlots(true);
  const ligne = app.dom.liste().join(' ');
  const ch2 = faireChaine({ pot: 9000000n, tete: 1002 + 253, spins: [{ id: 1, t: 1002, hashes: H }] });
  const a2 = monter(bloc, ch2, { avantEnvoi: (c) => { c.tete += 1; }, msParBloc: 2000 });
  await a2.peindreSlots(true);
  await a2.slotsAgir('settle');
  /* a 200 ms par bloc (marge 21) : 1 bloc ou tomber = 0,2 s — jamais « about 0 s » */
  const ch3 = faireChaine({ pot: 9000000n, tete: 1002 + 256 - 21, spins: [{ id: 1, t: 1002, hashes: H }] });
  const a3 = monter(bloc, ch3, { avantEnvoi: (c) => { c.tete += 1; }, msParBloc: 200 });
  await a3.peindreSlots(true);
  await a3.slotsAgir('settle');
  const ok = /window closes within 1 block\(s\), too soon for a new settle to land/.test(ligne) && /Confirm in your wallet now: 1 block\(s\) left/.test(a2.auWallet[0] || '') && ch2.spins.get('1').statut === 2
    && /Confirm in your wallet now: 1 block\(s\) left — under a second/.test(a3.auWallet[0] || '') && !/about 0 s/.test(a3.auWallet[0] || '');
  return { ok, ligne, wallet: a2.auWallet[0], wallet200: a3.auWallet[0] };
}
const SCENARIOS = { S0: scenarioS0, T256: scenarioT256, CACHE: scenarioCache, FIN: scenarioFin };
const SEUL = process.env.CARTE_SANS_MUTANTS === '1';
let kos = 0;
for (const [k, s] of Object.entries(SCENARIOS)) {
  const r = await s(BLOC);
  if (SEUL) { console.log((r.ok ? 'ok  ' : 'KO  ') + k + (r.ok ? '' : ' ' + JSON.stringify(r).slice(0, 400))); if (!r.ok) kos += 1; n += 1; continue; }
  vu(r.ok === true, 'carte executee : ' + k + (r.ok ? '' : ' ' + JSON.stringify(r)));
}
if (SEUL) { console.log(kos ? kos + ' scenario(s) KO' : 'tous verts'); process.exit(kos ? 1 : 0); }
/* les fonctions pures, directement */
vu(Slots.etatSpins({ spuns: [{ spinId: 1n, targetBlock: 1002 }], statuts: new Map([['1', 0]]), tete: 1010 })[0].etat === 'NON_LU', 'etatSpins : statut 0 = NON_LU (jamais clos)');
vu(Slots.etatSpins({ spuns: [{ spinId: 1n, targetBlock: 1002 }], statuts: new Map([['1', 1]]), tete: 1002 + 254, marge: 3 })[0].etat === 'PERDU' && Slots.etatSpins({ spuns: [{ spinId: 1n, targetBlock: 1002 }], statuts: new Map([['1', 1]]), tete: 1002 + 253, marge: 3 })[0].blocsRestants === 1, 'etatSpins tient la marge (tete cible + 254, marge 3 : plus rien a envoyer ; + 253 : 1 bloc)');
vu(Slots.margeEnvoi(2000) === 3 && Slots.margeEnvoi(200) === 21 && Slots.margeEnvoi(null) === 21, 'marge : 1 + les blocs de 4 s (2 s -> 3, 200 ms ou non mesure -> 21)');

/* ---------------------------------------------------------------- les mutants du bloc (en memoire) */
const MUTANTS = [
  ['S0', 'statut 0 clot le spin (0f9d8ec)', '    if (st === 0) st = null;\n', ''],
  ['S0', 'un spin non lu n est jamais relu (pas de minuteur)', "  if (nonLus || plan.lignes.some((l) => l.decision !== 'PERDU'))", "  if (plan.lignes.some((l) => l.decision !== 'PERDU'))"],
  ['CACHE', 'la marge du cache ignoree', '  const marge = Slots.margeEnvoi(msB);', '  const marge = 1;'],
  ['CACHE', 'la vue ne garde pas la marge (le clic replanifie sans)', 'slotsCfg.vue = { spins, pot, table, tete, marge, nonLus };', 'slotsCfg.vue = { spins, pot, table, tete, nonLus };'],
  ['FIN', 'les secondes arrondies a 0', "(sec < 1 ? 'under a second' : 'about ' + Math.round(sec) + ' s')", "('about ' + Math.round(sec) + ' s')"],
];
for (const [s, nom, de, vers] of MUTANTS) {
  vu(BLOC.split(de).length === 2, 'mutant « ' + nom + ' » : ancre unique dans le bloc');
  const r = await SCENARIOS[s](BLOC.replace(de, () => vers));
  vu(r.ok === false, 'MUTANT « ' + nom + ' » : le scenario ' + s + ' ROUGIT');
}
console.log('ok slots-carte - ' + n + ' assertions (' + MUTANTS.length + ' mutants tues) ; NE PROUVE PAS le rendu au navigateur, un wallet reel, un vrai noeud en retard');
