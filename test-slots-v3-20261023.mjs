/* test-slots-v3-20261023.mjs — LE 2e VERDICT ADVERSE (slots, 2026-10-23) SUR LE VRAI CODE DE LA CARTE, PAS SUR SON TEXTE.
 * Le bloc des slots de app.html (de « LES SLOTS (Phil 2026-10-23 » a « EARN (Phil 19:40) ») est EXECUTE ici, tel quel, contre un faux DOM,
 * un faux wallet et une fausse chaine (un modele de BlockSlots v4 : settleMany SAUTE un spin que le pot ne couvre pas, acceptCapped paie
 * min(prix, pot) au-dessus du minimum ; v4 : AUCUN remboursement, et la carte n envoie jamais expire — un tel appel est « inconnu » ici).
 * Les faces des spins sont celles de forge (graines « v3slots656 » id 1
 * et « v3slots10500 » id 2 : 8 points chacun, test_V3_LotDuJoueurSautePotCourt). AFFIRME :
 *   D1  (defaut 1 du verdict) deux spins a 8 points, pot 5,00 : Settle n envoie QUE #1 ; AVANT la signature la carte dit #1 « 5.00 paid in
 *       full » ET #2 « 5.00 USDC short » ; APRES le recu, les deux sont dits (paye, et le manque de #2) ; le bouton dit ce qu il paie ;
 *   D1b pot 7,00 : #2 est « 3.00 short », Accept envoie acceptCapped(2, 2.00) et le bilan dit « the pot paid 2.00 — 3.00 short » ;
 *   R2  entre le clic et le wallet, UNE seule lecture (la tete) : ni getLogs, ni bloc, ni statut, ni pot ; un recu sans Settled apres la
 *       fenetre dit « window closed … the spin is lost, nothing is returned » ; un spin saute parce que le pot a baisse dit « nothing was taken » ;
 *   PERDU (v4) une fenetre passee : aucun bouton de remboursement, la ligne dit le spin perdu, rien n est envoye ;
 *   PERDANT (v4) un spin sans prix part dans Settle (ses points), « no prize » dit avant et apres ;
 *   REGLEUR (v4) la regle dit « A spin not settled in time is lost », l etat du regleur du serveur (on / off) et la fenetre au temps de
 *       bloc MESURE (celui du regleur, sinon deux blocs lus, une fois toutes les 10 min, succes ou echec) ;
 *   FORCE un repeint force demande pendant un repeint repart apres (il etait perdu) ;
 *   RPC  en regime etabli, un repeint complet fait <= 4 lectures pour un spin en attente (avant : ~8) et le minuteur de 3 s UNE (la tete).
 * Chaque affirmation est rejouee sur une COPIE MUTEE du bloc (en memoire) et doit alors rougir. NE PROUVE PAS : le rendu au navigateur,
 * un wallet reel, Base. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as Slots from './slots-plan.js';
import { usdc as usdcTexte } from './rolls-jeu.js';
import { keccak256Hex, topic } from './keccak.js';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const lire = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const APP = lire('app.html');
const P = JSON.parse(lire('contracts/slots-parametres.json'));
const entre = (t, a, b) => { const i = t.indexOf(a), j = t.indexOf(b, i + 1); return i >= 0 && j > i ? t.slice(i, j) : ''; };
const BLOC = entre(APP, '/* ══ LES SLOTS (Phil 2026-10-23', '/* ══ EARN (Phil 19:40)');
vu(BLOC.length > 5000, 'le bloc des slots est extrait de app.html');

/* ---------------------------------------------------------------- le faux DOM */
function faireDom() {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      const e = { id, textContent: '', innerHTML: '', hidden: true, disabled: false, dataset: {}, enfants: [], ecoute: {},
        classList: { contains: (c) => (id === 'v-missions' && c === 'on') }, append(x) { this.enfants.push(x); }, setAttribute() {},
        addEventListener(t, f) { this.ecoute[t] = f; } };
      Object.defineProperty(e, 'textContent', { get() { return this._t || ''; }, set(v) { this._t = String(v); if (v === '') this.enfants = []; } });
      els.set(id, e);
    }
    return els.get(id);
  };
  const faces = [el('f1'), el('f2'), el('f3')];
  const document = {
    hidden: false,
    querySelector: (s) => (s === '.jeuBandeau' ? el('bandeau') : s === '#slotsTable tbody' ? el('tbody') : s.startsWith('#') ? el(s.slice(1)) : null),
    querySelectorAll: (s) => (s === '#slotsFaces .jourFace' ? faces : []),
    getElementById: (id) => el(id),
    createElement: () => ({ textContent: '', dataset: {}, enfants: [], append(x) { this.enfants.push(x); } }),
  };
  return { el, document, liste: () => el('slotsListe').enfants.map((x) => x.textContent) };
}

/* ---------------------------------------------------------------- la fausse chaine (modele de BlockSlots v3) */
const CONTRAT = '0x' + 'cc'.repeat(20), MOI = '0x' + 'a1'.repeat(20), AUTRE = '0x' + 'b2'.repeat(20);
const trois = (g) => [0, 1, 2].map((r) => keccak256Hex(Uint8Array.from([...new TextEncoder().encode(g), r])));
const w = (x) => BigInt(x).toString(16).padStart(64, '0');
const TABLE = P.prizes.map(BigInt), PRIX = BigInt(P.spinPrice), { toPot: TO_POT, toDev: TO_DEV } = Slots.partsDuSpin(P.spinPrice, P.potShareBps);
function faireChaine({ pot, tete, spins }) {
  const c = { pot: BigInt(pot), tete, spins: new Map(), hashes: new Map(), pts: 0n, gagne: 0n, appels: [], lectures: [], plages: [] };
  for (const s of spins) {
    c.spins.set(String(s.id), { id: String(s.id), t: s.t, statut: s.statut ?? 1, joueur: s.joueur || MOI });
    (s.hashes || trois('fond' + s.id)).forEach((h, r) => c.hashes.set(s.t + r, h));
  }
  const juger = (s) => { const h = [0, 1, 2].map((r) => c.hashes.get(s.t + r)); const f = Slots.facesDuSpin(h, s.id); const p = Slots.points(f); return { h, f, p, prix: TABLE[p] }; };
  const settledLog = (s, j, paie) => ({ address: CONTRAT, topics: [topic(Slots.EV_SETTLED), '0x' + w(s.id), '0x' + w(s.joueur)],
    data: '0x' + j.h.map((x) => x.slice(2)).join('') + j.f.flat().map(w).join('') + w(j.p) + w(paie) + w(c.pot) + w(c.pts) });
  const reglable = (s) => s && s.statut === 1 && c.tete > s.t + 2 && c.tete <= s.t + 256;
  c.payer = (s, j, paie) => { s.statut = 2; c.pot -= paie; c.pts += BigInt(j.p); c.gagne += paie; return settledLog(s, j, paie); };
  c.executer = (data) => {
    const d = data.toLowerCase(), sel = d.slice(0, 10), mots = (d.slice(10).match(/.{64}/g) || []).map((x) => BigInt('0x' + x));
    const logs = [];
    c.blocInclus = c.tete; /* 2026-10-24 (revue keeper 5) : le bloc d inclusion, rendu par le recu (l app le lit pour dire POURQUOI un spin est saute) */
    if (sel === Slots.planSettleMany({ contrat: CONTRAT, spinIds: [1] }).appels[0].data.slice(0, 10)) {
      for (const id of mots.slice(2)) { const s = c.spins.get(String(id)); if (!reglable(s)) continue; const j = juger(s); if (j.prix > c.pot) continue; logs.push(c.payer(s, j, j.prix)); }
    } else if (sel === Slots.planAccepter({ contrat: CONTRAT, spinId: 1, minimum: 0 }).appels[0].data.slice(0, 10)) {
      const s = c.spins.get(String(mots[0])); if (!reglable(s)) throw new Error('revert');
      const j = juger(s); const paie = j.prix < c.pot ? j.prix : c.pot; if (paie < mots[1]) throw new Error('BelowMinimum'); logs.push(c.payer(s, j, paie));
    } else throw new Error('appel inconnu ' + sel);
    return logs;
  };
  c.rpc = async (m, p) => {
    c.lectures.push(m === 'eth_call' ? 'eth_call:' + p[0].data.slice(0, 10) : m);
    if (m === 'eth_blockNumber') return '0x' + c.tete.toString(16);
    if (m === 'eth_getTransactionReceipt') return c.blocInclus !== undefined ? { status: '0x1', blockNumber: '0x' + c.blocInclus.toString(16), logs: [] } : null;
    if (m === 'eth_getBlockByNumber') {
      const b = parseInt(p[0], 16), h = c.hashes.get(b);
      /* v4 : un horodatage (secondes) pour la mesure du temps de bloc, quand la chaine en donne (c.msBloc) ; le hash seulement s il est connu */
      if (b > c.tete) return null;
      const ts = c.msBloc ? Math.floor((b * c.msBloc) / 1000) : undefined;
      return h && b < c.tete ? { hash: h, timestamp: ts !== undefined ? '0x' + ts.toString(16) : undefined } : ts !== undefined ? { timestamp: '0x' + ts.toString(16) } : null;
    }
    if (m === 'eth_getLogs') {
      const f = p[0], de = parseInt(f.fromBlock, 16), jq = parseInt(f.toBlock, 16);
      if (jq - de + 1 > 1000 || jq < de) throw new Error('getLogs : plage refusee (Base : 1000 blocs au plus)');
      c.plages.push(jq - de + 1);
      return [...c.spins.values()].filter((s) => s.t - 2 >= de && s.t - 2 <= jq && '0x' + w(s.joueur) === f.topics[2])
        .map((s) => ({ address: CONTRAT, topics: [Slots.TOPIC_SPUN, '0x' + w(s.id), '0x' + w(s.joueur)], data: '0x' + w(s.t) + w(TO_POT) + w(TO_DEV) }));
    }
    if (m === 'eth_call') {
      const d = p[0].data.toLowerCase();
      if (d === Slots.appelPot()) return '0x' + w(c.pot);
      if (d === Slots.appelPointsDe(MOI)) return '0x' + w(c.pts);
      if (d === Slots.appelGagneDe(MOI)) return '0x' + w(c.gagne);
      if (d.startsWith(Slots.appelSpin(0).slice(0, 10))) { const s = c.spins.get(String(BigInt('0x' + d.slice(10)))); return s ? '0x' + w(s.joueur) + w(s.t) + w(s.statut) : '0x' + w(0) + w(0) + w(0); }
    }
    throw new Error('rpc inattendu ' + m);
  };
  return c;
}

/* ---------------------------------------------------------------- le bloc execute */
const FICHE = { ok: true, contrat: CONTRAT, prixSpin: P.spinPrice, potShareBps: P.potShareBps, prizes: P.prizes, esperanceBrut: '127862', bloc: 900, regleur: { etat: 'OFF', adresse: null, msParBlocMesure: null } };
function monter(code, chaine, { avantEnvoi = null, fiche = FICHE } = {}) {
  const dom = faireDom();
  const minuteurs = [];
  let dernierEnvoi = null;
  const ctx = {
    document: dom.document, Slots, usdcTexte, compte: MOI, USDC_BASE: '0x' + '83'.repeat(20),
    $: (s) => dom.document.querySelector(s), jb: (id, t) => { dom.el(id).textContent = t; },
    rpc: (m, p) => chaine.rpc(m, p),
    fetch: async () => ({ json: async () => fiche }), AbortSignal,
    faceRevelee: () => ({}), logoSvg: () => '<svg/>', paramsLogoDepuisApparence: () => ({}),
    phraseNonConfirme: (r, pre) => pre + ': ' + (r && r.pourquoi ? r.pourquoi : 'not confirmed'),
    envoyerAppels: async (appels) => {
      chaine.appels.push(appels.map((a) => a.data));
      if (avantEnvoi) avantEnvoi({ dom, chaine });
      chaine.lecturesAuWallet = [...chaine.lectures];
      try { dernierEnvoi = appels.flatMap((a) => chaine.executer(a.data)); return { etat: 'CONFIRME', hash: '0x' + '11'.repeat(32) }; }
      catch (e) { dernierEnvoi = []; return { etat: 'ECHEC_ENVOI', pourquoi: String(e.message) }; }
    },
    recusLogs: async () => ({ logs: dernierEnvoi || [], manque: 0, n: 1 }),
    setTimeout: (f) => { minuteurs.push(f); return minuteurs.length; }, clearTimeout: () => {}, setInterval: () => 0,
  };
  const noms = Object.keys(ctx);
  const f = new Function(...noms, code + '\n;return { peindreSlots, slotsAgir, slotsCfg, slotsTic };');
  return { ...f(...noms.map((k) => ctx[k])), dom, ctx, minuteurs };
}
const clic = async (app, quoi) => { chaine_(app).lectures = []; await app.slotsAgir(quoi); };
const chaine_ = (app) => app.chaine;
const H1 = trois('v3slots656'), H2 = trois('v3slots10500');
vu(Slots.points(Slots.facesDuSpin(H1, 1)) === 8 && Slots.points(Slots.facesDuSpin(H2, 2)) === 8, 'les graines de forge : #1 et #2 a 8 points (5,00 USDC chacun)');

/* ---------------------------------------------------------------- les scenarios (chacun rend true si la carte se comporte bien) */
async function scenarioD1(code) {
  const ch = faireChaine({ pot: 5000000n, tete: 1015, spins: [{ id: 1, t: 1002, hashes: H1 }, { id: 2, t: 1012, hashes: H2 }] });
  let listeAuWallet = null, etatAuWallet = null;
  const app = monter(code, ch, { avantEnvoi: ({ dom }) => { listeAuWallet = dom.liste(); etatAuWallet = dom.el('slotsEtat').textContent; } });
  app.chaine = ch;
  await app.peindreSlots(true);
  const avant = app.dom.liste();
  const bouton = app.dom.el('slotsRegler');
  const okAvant = avant.some((t) => /^Spin #1: 8 points → 5\.00 USDC, paid in full by Settle\.$/.test(t))
    && avant.some((t) => /^Spin #2: 8 points → prize 5\.00 USDC, but the pot holds 0\.00 USDC after the spins above: 5\.00 USDC short\. Settle leaves it out\./.test(t))
    && bouton.hidden === false && bouton.textContent === 'Settle spin #1 · 5.00 USDC' && app.dom.el('slotsAccepter').hidden === true;
  await clic(app, 'settle');
  const envoye = ch.appels.length === 1 && ch.appels[0].length === 1 && ch.appels[0][0] === Slots.planSettleMany({ contrat: CONTRAT, spinIds: ['1'] }).appels[0].data;
  const okAuWallet = (listeAuWallet || []).some((t) => /Spin #2: .*5\.00 USDC short/.test(t)) && /Confirm in your wallet now: \d+ block\(s\) left/.test(etatAuWallet || '');
  const apres = app.dom.el('slotsEtat').textContent;
  const okApres = /Spin #1: 8 points, 5\.00 USDC paid to your wallet by the contract, in full\./.test(apres) && /Spin #2: 8 points → prize 5\.00 USDC, but the pot holds 0\.00 USDC after the spins above: 5\.00 USDC short\./.test(apres);
  const st2 = ch.spins.get('2').statut;
  return { ok: okAvant && envoye && okAuWallet && okApres && st2 === 1, okAvant, envoye, okAuWallet, okApres, st2, avant, apres };
}
async function scenarioD1b(code) {
  const ch = faireChaine({ pot: 7000000n, tete: 1015, spins: [{ id: 1, t: 1002, hashes: H1 }, { id: 2, t: 1012, hashes: H2 }] });
  const app = monter(code, ch); app.chaine = ch;
  await app.peindreSlots(true);
  const bA = app.dom.el('slotsAccepter');
  /* tant que #1 se paie en entier, Accept attend (le montant de #2 dependrait de l ordre) ; la liste dit deja le plancher et le manque */
  const okAvant = bA.hidden === true && app.dom.liste().some((t) => /^Spin #2: 8 points → prize 5\.00 USDC, but the pot holds 2\.00 USDC after the spins above: 3\.00 USDC short\. Settle leaves it out\. Once Settle has paid the spins above, you can accept 2\.00 USDC for it \(3\.00 short\)/.test(t));
  await clic(app, 'settle');
  await app.peindreSlots(true);
  const okBouton = bA.hidden === false && bA.textContent === 'Accept 2.00 USDC for spin #2 (3.00 short)';
  await clic(app, 'accepter');
  const envoye = ch.appels.length === 2 && ch.appels[1][0] === Slots.planAccepter({ contrat: CONTRAT, spinId: '2', minimum: 2000000n }).appels[0].data;
  const apres = app.dom.el('slotsEtat').textContent;
  const okApres = /Spin #2: 8 points, prize 5\.00 USDC; the pot paid 2\.00 USDC — 3\.00 USDC short\./.test(apres);
  return { ok: okAvant && okBouton && envoye && okApres, okAvant, okBouton, envoye, okApres, apres, liste: app.dom.liste() };
}
async function scenarioR2(code) {
  /* le wallet confirme APRES la fenetre : settleMany saute, le recu n a pas de Settled */
  const ch = faireChaine({ pot: 9000000n, tete: 1015, spins: [{ id: 1, t: 1002, hashes: H1 }] });
  const app = monter(code, ch, { avantEnvoi: ({ chaine }) => { chaine.tete = 1002 + 257; } }); app.chaine = ch;
  await app.peindreSlots(true);
  await clic(app, 'settle');
  const lect = ch.lecturesAuWallet || [];
  const leger = lect.length === 1 && lect[0] === 'eth_blockNumber';
  const apres = app.dom.el('slotsEtat').textContent;
  const fenetre = /Spin #1: the 256-block window closed before your settle was included — the spin is lost, nothing is returned\./.test(apres) && !/refund/i.test(apres);
  /* le pot baisse entre la lecture et l inclusion : settleMany saute, rien n est pris, et c est dit */
  const ch2 = faireChaine({ pot: 9000000n, tete: 1015, spins: [{ id: 1, t: 1002, hashes: H1 }] });
  const app2 = monter(code, ch2, { avantEnvoi: ({ chaine }) => { chaine.pot = 1000000n; } }); app2.chaine = ch2;
  await app2.peindreSlots(true);
  await clic(app2, 'settle');
  const saute = /Spin #1: not settled — when your settle was included the pot could not pay its full 5\.00 USDC prize, so nothing was taken\. It is still yours to settle until block 1258; after that it is lost\./.test(app2.dom.el('slotsEtat').textContent);
  return { ok: leger && fenetre && saute, leger, lect, fenetre, saute, apres };
}
async function scenarioPerdu(code) {
  /* v4 : une fenetre passee — aucun bouton de remboursement, la ligne et l etat disent le spin PERDU, rien n est envoye */
  const ch = faireChaine({ pot: 250000n, tete: 1400, spins: [{ id: 3, t: 1100 }] });
  const app = monter(code, ch); app.chaine = ch;
  await app.peindreSlots(true);
  const etat = app.dom.el('slotsEtat').textContent;
  const okVu = app.dom.el('slotsRegler').hidden === true && app.dom.el('slotsAccepter').hidden === true
    && app.dom.liste().some((t) => t === 'Spin #3: its 256-block window closed before it was settled — it is lost, nothing is returned.')
    && etat === '1 spin was not settled in time and is lost — nothing is returned.';
  /* 2026-10-24 : la regle vit en deux elements (a l ecran + le pli) : les deux sont lus */
  const regle = app.dom.el('slotsRegle').textContent + ' ' + app.dom.el('slotsComment').textContent;
  const sansRemb = !/refund/i.test(regle + ' ' + etat + ' ' + app.dom.liste().join(' '));
  await clic(app, 'settle');
  const rien = ch.appels.length === 0 && ch.spins.get('3').statut === 1;
  return { ok: okVu && sansRemb && rien, okVu, sansRemb, rien, etat, liste: app.dom.liste() };
}
async function scenarioPerdant(code) {
  /* v4 : 0 point — rien a payer, mais Settle le prend (ses points ; laisse, il serait perdu) ; « no prize » dit avant et apres */
  const ch = faireChaine({ pot: 9000000n, tete: 1015, spins: [{ id: 1, t: 1002, hashes: trois('v3slots0') }] });
  const app = monter(code, ch); app.chaine = ch;
  await app.peindreSlots(true);
  const bR = app.dom.el('slotsRegler');
  const vu1 = bR.hidden === false && bR.textContent === 'Record spin #1\'s points (no prize)' /* 2026-10-25 (test live) : jamais « · 0.00 USDC » */ && app.dom.liste().some((t) => t === 'Spin #1: 0 points, no prize — Settle records its points.');
  await clic(app, 'settle');
  const envoye = ch.appels.length === 1 && ch.appels[0][0] === Slots.planSettleMany({ contrat: CONTRAT, spinIds: ['1'] }).appels[0].data && ch.spins.get('1').statut === 2;
  const dit = app.dom.el('slotsEtat').textContent === 'Spin #1: 0 points, no prize.';
  return { ok: vu1 && envoye && dit, vu1, envoye, dit, etat: app.dom.el('slotsEtat').textContent, liste: app.dom.liste() };
}
async function scenarioRegleur(code) {
  /* (a) regleur OFF, la chaine donne des horodatages a 200 ms : la carte mesure elle-meme (la tete et 1000 blocs plus tot) */
  const ch = faireChaine({ pot: 9000000n, tete: 1015, spins: [{ id: 1, t: 1002, hashes: H1 }] }); ch.msBloc = 200;
  const app = monter(code, ch); app.chaine = ch;
  await app.peindreSlots(true);
  /* 2026-10-24 (carte de 821 px mesuree en prod game31) : la regle est coupee, phrases inchangees — « lost » + fenetre + regleur restent
   *   A L ECRAN (#slotsRegle), la moyenne et la meilleure strategie passent dans le pli « How the slots work » (#slotsComment). Ce banc
   *   affirmait la meilleure strategie dans #slotsRegle : il l affirme maintenant dans le pli, ET plus a l ecran (la position est le sujet). */
  const r1 = app.dom.el('slotsRegle').textContent, p1 = app.dom.el('slotsComment').textContent;
  const a = /A spin not settled in time is lost: nothing is returned\. Settle within 256 blocks of the first face block — about 51 s at the block time measured just now \(200 ms a block\)\./.test(r1)
    && /The server settles spins automatically when its keeper is on \(it is off right now\); anyone can settle, and the prize always goes to the spin's player\./.test(r1)
    && /settling every spin is the best play: 0\.127862 USDC a spin on average/.test(p1) && !/best play/.test(r1)
    && /^A spin costs 0\.50 USDC: /.test(r1) && /from 0 to 5\.00 USDC a spin, never more than the pot holds\./.test(r1)
    /* 2026-10-25 (Phil : regles courtes et ordonnees) : le pli commence par les faces, leurs blocs dits (2, 3 et 4 blocs apres le spin :
     *   DELAI_CIBLE + r, r < REELS — ce banc affirmait « The three faces come from three different blocks ») ; le pot court / Accept
     *   restent HORS de la regle a l ecran (ils sont sous la table) */
    && /^Each spin draws three faces from three different blocks: the blocks 2, 3 and 4 blocks after the spin, one face each\./.test(p1) && !/three different blocks|PotShort|accept what the pot holds|accept less/.test(r1)
    && !/refund|held by the contract|back to you/i.test(r1 + ' ' + p1);
  /* la mesure vaut 10 min : un 2e repeint ne relit aucun bloc pour elle */
  ch.lectures = []; await app.peindreSlots(true);
  const pasDeRelecture = !ch.lectures.includes('eth_getBlockByNumber');
  /* (b) regleur ON, son temps de bloc mesure (2 s) : la carte le dit, et ne lit aucun bloc pour mesurer */
  const ch2 = faireChaine({ pot: 9000000n, tete: 1015, spins: [{ id: 1, t: 1002, hashes: H1 }] }); ch2.msBloc = 200;
  const app2 = monter(code, ch2, { fiche: { ...FICHE, regleur: { etat: 'ON', adresse: '0x' + '7e'.repeat(20), msParBlocMesure: 2000 } } }); app2.chaine = ch2;
  await app2.peindreSlots(true);
  const r2 = app2.dom.el('slotsRegle').textContent;
  const b = /\(it is on right now\)/.test(r2) && /about 512 s at the block time measured just now \(2000 ms a block\)/.test(r2) && ch2.lectures.filter((x) => x === 'eth_getBlockByNumber').length === 3;
  /* (c) aucune mesure possible (pas d horodatage) : les deux cas dits, rien d invente */
  const ch3 = faireChaine({ pot: 9000000n, tete: 1015, spins: [{ id: 1, t: 1002, hashes: H1 }] });
  const app3 = monter(code, ch3); app3.chaine = ch3;
  await app3.peindreSlots(true);
  const c = /about 8\.5 min at 2-second blocks, about 51 s at 200 ms blocks \(the block time was not measured just now\)/.test(app3.dom.el('slotsRegle').textContent);
  return { ok: a && pasDeRelecture && b && c, a, pasDeRelecture, b, c, r1, r2 };
}
async function scenarioForce(code) {
  const ch = faireChaine({ pot: 9000000n, tete: 1015, spins: [{ id: 1, t: 1002, hashes: H1 }] });
  const app = monter(code, ch); app.chaine = ch;
  await app.peindreSlots();
  let lectPoints = () => ch.lectures.filter((x) => x === 'eth_call:' + Slots.appelPointsDe(MOI).slice(0, 10)).length;
  const avant = lectPoints();
  const p1 = app.peindreSlots(), p2 = app.peindreSlots(true);
  await Promise.all([p1, p2]);
  /* le repeint FORCE relit les points ; sans lui (force perdu), le second appel attendait le premier et ne relisait rien */
  return { ok: lectPoints() === avant + 1, avant, apres: lectPoints() };
}
async function scenarioRpc(code) {
  const ch = faireChaine({ pot: 9000000n, tete: 1015, spins: [{ id: 1, t: 1002, hashes: H1 }] });
  const app = monter(code, ch); app.chaine = ch;
  await app.peindreSlots(true);
  const premiere = ch.plages[0];
  ch.tete = 1016; ch.lectures = []; ch.plages = [];
  await app.peindreSlots();
  const complet = [...ch.lectures], plage = ch.plages[0];
  ch.tete = 1017; ch.lectures = [];
  await app.slotsTic();
  const tic = [...ch.lectures];
  /* premiere tranche : jusqu au deploiement (bloc 900) ou 999 blocs ; puis seulement le bloc nouveau + 8 de recouvrement */
  return { ok: premiere === 1015 - 900 + 1 && plage <= 9 && complet.length <= 4 && !complet.includes('eth_getBlockByNumber') && tic.length === 1 && tic[0] === 'eth_blockNumber', premiere, plage, complet, tic };
}
/* 2026-10-25 (Phil : regles reecrites, « aucun chiffre tape a la main que le code calcule ») : la carte montee avec une AUTRE fiche (prix
 *   1,00, 60 % au pot, table divisee par deux) — chaque chiffre des regles (#slotsRegle, #slotsComment, #slotsTableNote, #slotsPayer) doit
 *   suivre cette fiche, calcule ici par slots-plan.js sur la meme fiche ; un chiffre tape (0.50, 50 %, 0.25, 5.00, 0.127862) y rougit, et
 *   les phrases-cles (prix toujours en USDC, seul le joueur accepte moins, les points ne paient rien) sont exigees mot pour mot. */
async function scenarioRegleFiche(code) {
  const prizes2 = P.prizes.map((x) => String(BigInt(x) / 2n)), prix2 = 1000000n, part2 = 6000;
  const ev2 = Slots.esperance(prizes2.map(BigInt), prix2, part2), haut2 = BigInt(prizes2[prizes2.length - 1]);
  const ev1 = Slots.esperance(TABLE, PRIX, P.potShareBps);
  const fiche = { ...FICHE, prixSpin: String(prix2), potShareBps: part2, prizes: prizes2, esperanceBrut: String(ev2.brut) };
  const ch = faireChaine({ pot: 9000000n, tete: 1015, spins: [{ id: 1, t: 1002, hashes: H1 }] }); ch.msBloc = 200;
  const app = monter(code, ch, { fiche }); app.chaine = ch;
  await app.peindreSlots(true);
  const r = app.dom.el('slotsRegle').textContent, p = app.dom.el('slotsComment').textContent, nt = app.dom.el('slotsTableNote').textContent, py = app.dom.el('slotsPayer').textContent;
  const u = usdcTexte, x = (s) => s.replace(/[.()]/g, (c) => '\\' + c);
  /* la fiche differe vraiment de la vraie (sinon un chiffre tape passerait) */
  const differe = u(prix2) !== u(PRIX) && Slots.usdcPrecis(ev2.meilleureBrut) !== Slots.usdcPrecis(ev1.meilleureBrut) && u(haut2) !== u(TABLE[TABLE.length - 1]) && Slots.usdcPrecis(ev2.toDev) !== Slots.usdcPrecis(ev1.toDev);
  const rOk = r.startsWith('A spin costs ' + u(prix2) + ' USDC: 60% goes to the slots pot and 40% (' + Slots.usdcPrecis(ev2.toDev) + ' USDC) to TokenizedBlock, when you spin, whatever happens next. ')
    && r.includes('a fixed prize per points, from 0 to ' + u(haut2) + ' USDC a spin, never more than the pot holds.');
  const pOk = new RegExp(x(Slots.pourcentTexte(ev2.probGainBps)) + '% of spins pay something, but only ' + x(Slots.pourcentTexte(ev2.probMiseBps)) + '% pay back at least the ' + x(u(prix2)) + ' USDC stake\\.').test(p)
    && p.includes('settling every spin is the best play: ' + Slots.usdcPrecis(ev2.meilleureBrut) + ' USDC a spin on average — less while the pot holds less than ' + u(haut2) + ' USDC — below the ' + u(prix2) + ' USDC price.')
    && (p.match(/on average/g) || []).length === 1 && p.endsWith('Points also add up as a running total kept on chain; prizes are paid per spin, points pay nothing on their own.')
    && !/last \d+ blocks/.test(p + r + nt + py);
  const nOk = nt.includes(', with ' + Slots.usdcPrecis(9000000n) + ' USDC in the pot.') && nt.includes('Settle pays a prize only in full') && nt.includes('Only you can accept less — what the pot holds, for that one spin — or you can wait for the pot to grow until its window closes.');
  const yOk = py.includes('your wallet first swaps it for the ' + u(prix2) + ' USDC the spin takes, then pays the spin in USDC;') && py.includes(' Prizes are always paid in USDC. ');
  return { ok: differe && rOk && pOk && nOk && yOk, differe, rOk, pOk, nOk, yOk, r, p, nt, py };
}
const SCENARIOS = { D1: scenarioD1, D1b: scenarioD1b, R2: scenarioR2, PERDU: scenarioPerdu, PERDANT: scenarioPerdant, REGLEUR: scenarioRegleur, REGLE_FICHE: scenarioRegleFiche, FORCE: scenarioForce, RPC: scenarioRpc };
for (const [k, s] of Object.entries(SCENARIOS)) { const r = await s(BLOC); vu(r.ok === true, 'carte executee : ' + k + (r.ok ? '' : ' ' + JSON.stringify(r, (_, v) => (typeof v === 'bigint' ? String(v) : v)))); }

/* ---------------------------------------------------------------- les mutants du bloc (en memoire) */
const MUTANTS = [
  ['D1', 'le lot reprend tous les spins reglables (le defaut 1)', "envoyes = p.lignes.filter((l) => l.decision === 'LOT');", "envoyes = p.lignes.filter((l) => l.etat === 'REGLABLE');"],
  ['D1', 'avant la signature, les spins laisses hors du lot ne sont pas dits', 'slotsListe([...envoyes, ...laisses].map(', 'slotsListe([...envoyes].map('],
  ['D1', 'apres le recu, le manque des spins laisses n est pas dit', '...laisses.map((l) => Slots.phraseAvant(l))].join', '].join'],
  ['D1', 'la liste ne montre que le dernier spin', 'const lignes = slotsLignes(plan);', 'const lignes = slotsLignes(plan).slice(-1);'],
  ['D1', 'le bouton Settle compte les spins que le pot ne couvre pas', "const lot = plan.lignes.filter((l) => l.decision === 'LOT');", "const lot = plan.lignes.filter((l) => l.etat === 'REGLABLE');"],
  ['D1b', 'Accept sans le minimum vu', 'plan = Slots.planAccepter({ contrat, spinId: l.id, minimum: l.paie });', 'plan = Slots.planAccepter({ contrat, spinId: l.id, minimum: 0n });'],
  ['D1b', 'le bilan ignore les Settled du recu', 'const bilan = Slots.bilanReglement({ envoyes, settled: st,', 'const bilan = Slots.bilanReglement({ envoyes, settled: [],'],
  ['R2', 'repeint avant la signature', "const tete = parseInt(await rpc('eth_blockNumber', []), 16);\n      const p = Slots.planReglement({ ...vue, tete });", "await peindreSlots(true); const tete = parseInt(await rpc('eth_blockNumber', []), 16);\n      const p = Slots.planReglement({ ...vue, tete });"],
  ['R2', 'le recu sans Settled n est pas relu', 'if (sansRecu.length) {', 'if (false) {'],
  /* 2026-10-24 (revue keeper 5) : slotsResume separe la fenetre qui FERME (fermant) de celle FERMEE (clos) ; l ancre suit */
  ['PERDU', 'les spins perdus ne sont pas dits', "if (clos.length) p.push(", "if (false) p.push("],
  ['PERDU', 'un spin perdu part dans Settle', "envoyes = p.lignes.filter((l) => l.decision === 'LOT');", "envoyes = p.lignes.filter((l) => l.decision === 'LOT' || l.decision === 'PERDU');"],
  ['PERDANT', 'un spin sans prix laisse hors du lot', "envoyes = p.lignes.filter((l) => l.decision === 'LOT');", "envoyes = p.lignes.filter((l) => l.decision === 'LOT' && l.paie > 0n);"],
  ['REGLEUR', 'l etat du regleur tape « on »', "const reg = j.regleur && j.regleur.etat === 'ON' ? 'on'", "const reg = true ? 'on'"],
  ['REGLEUR', 'la regle ne dit plus qu un spin non regle est perdu', "'A spin not settled in time is lost: nothing is returned. Settle within '", "'Settle within '"],
  ['REGLEUR', '2026-10-24 : l explication recollee a la regle a l ecran (le pli vide)', "if (rgPli) rgPli.textContent = 'Each spin draws", "if (rg) rg.textContent += ' ' + 'Each spin draws"],
  /* 2026-10-25 : chaque chiffre de la regle suit une AUTRE fiche (REGLE_FICHE) — un chiffre tape a la main, ou une phrase tombee, rougit */
  ['REGLE_FICHE', 'le prix du spin tape dans « Pay with »', "swaps it for the ' + usdcTexte(prix) + ' USDC the spin takes", "swaps it for the 0.50 USDC the spin takes"],
  ['REGLE_FICHE', 'la part du pot tapee', "' + (part / 100) + '% goes to the slots pot", "50% goes to the slots pot"],
  ['REGLE_FICHE', 'la meilleure strategie tapee', "Slots.usdcPrecis(ev.meilleureBrut) + ' USDC a spin on average", "'0.127862 USDC a spin on average"],
  ['REGLE_FICHE', 'le prix maximum tape dans le pli', "less while the pot holds less than ' + usdcTexte(haut) + ' USDC — below", "less while the pot holds less than 5.00 USDC — below"],
  ['REGLE_FICHE', '« Prizes are always paid in USDC » tombe', ' Prizes are always paid in USDC. ', ' '],
  ['REGLE_FICHE', '« seul le joueur accepte moins » tombe', " Only you can accept less — what the pot holds, for that one spin — or you can wait for the pot to grow until its window closes.'", "'"],
  ['REGLE_FICHE', '« points pay nothing on their own » tombe', "; prizes are paid per spin, points pay nothing on their own.';", ".';"],
  ['REGLE_FICHE', 'la part du dev tapee', "' + Slots.usdcPrecis(ev.toDev) + ' USDC) to TokenizedBlock", "0.25 USDC) to TokenizedBlock"],
  ['REGLEUR', '2026-10-24 : la regle a l ecran perd le prix maximum', "a fixed prize per points, from 0 to ' + usdcTexte(haut) + ' USDC a spin, never more than the pot holds. '", "a fixed prize per points. '"],
  ['REGLEUR', 'le temps de bloc du regleur ignore', '  if (srv) return srv;\n', ''],
  ['REGLEUR', 'la mesure relue a chaque repeint', '  if (slotsCfg.msBlocA && Date.now() - slotsCfg.msBlocA < 600000) return slotsCfg.msBloc;\n', ''],
  ['REGLEUR', 'la fenetre au temps de bloc suppose (200 ms) au lieu du mesure', "const fenetreTxt = msB ? 'about ' + Math.round(Slots.secondesFenetre(msB))", "const fenetreTxt = msB ? 'about ' + Math.round(Slots.secondesFenetre(200))"],
  ['FORCE', 'force perdu pendant un repeint (l ancien code)', '    if (!force) return slotsCfg.peint;\n', '    return slotsCfg.peint;\n'],
  ['RPC', 'les hashes de bloc relus a chaque repeint', 'manquent = ns.filter((n) => !slotsCfg.hashes.has(n));', 'manquent = ns;'],
  ['RPC', 'les Spun relus depuis le debut a chaque repeint', 'scanne: slotsCfg.scanne, tete', 'scanne: null, tete'],
  ['RPC', 'le minuteur repeint tout a chaque tic', "  if (etats(tete) !== etats(vue.tete)) { await slotsTicRepeindre(); return; }", "  { await peindreSlots(); return; }"],
];
for (const [s, nom, de, vers] of MUTANTS) {
  vu(BLOC.split(de).length === 2, 'mutant « ' + nom + ' » : ancre unique dans le bloc');
  const r = await SCENARIOS[s](BLOC.replace(de, () => vers));
  vu(r.ok === false, 'MUTANT « ' + nom + ' » : le scenario ' + s + ' ROUGIT');
}
console.log('ok slots-v3 - ' + n + ' assertions ; NE PROUVE PAS le rendu au navigateur, un wallet reel, ni Base');
