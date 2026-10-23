/* test-journal-pulse-20261023.mjs — LES DEFAUTS DU VERDICT ADVERSE DU 2026-10-23 SUR LE JOURNAL DU JOUR (branche claude/journal-20261018b).
 *
 * DEFAUT 1 (regression) : le rattrapage (curseur qui remonte le jour) AJOUTE des evenements du matin des heures apres le chargement de la
 *   page ; peindreJournalMap prenait « id jamais vu » pour « vient d arriver » et faisait pulser un roll de 06:10 a 18:00. Reproduit ici :
 *   passage 1 = [live@17:59], passage 2 = le meme + [old-catchup@06:10] -> l ancienne regle anime old-catchup.
 * DEFAUT 3 : couvreLaJournee vrai alors que la garde (400) avait jete les plus anciens du jour -> `coupes` compte, couverture fausse.
 * DEFAUT 4 : un rattrapage refuse etait redemande a CHAQUE tour, pour toujours -> attente tour x 2^(refus-1), servie (`refus`, `prochainEssai`).
 * DEFAUT 5 : lu a rebours, un Settled avant son Rolled perdait « on block N », un Bid avant son Listed son montant -> completerJournal.
 *
 * AFFIRME :
 *   (P) journalAPulser, EXTRAITE de app.html et executee : la reproduction du verdict ne pulse plus ; un vrai nouvel evenement pulse ; le
 *       premier passage ne pulse que ce qui est plus jeune que la page ; scan inconnu -> horloge de la page ; serveur sans `maintenant` ->
 *       horloge locale ; redemarrage du serveur (scan qui recule) -> le plus haut scan vu tient ; peindreJournalMap l appelle.
 *   (S) module pur : garderJournal compte les coupes ; completerJournal rend EXACTEMENT le texte d une lecture dans l ordre de la chaine.
 *   (B) vrai serveur local, faux noeud (minuit ~14 000 blocs sous la tete, rattrapage necessaire) : garde 5 -> coupes 5 et couvreLaJournee
 *       false ; garde par defaut -> coupes 0, couvreLaJournee true ; le Settled du direct dit « on block N » une fois le Rolled rattrape ;
 *       noeud qui refuse le rattrapage -> refus compte, attente qui double, AUCUNE requete du rattrapage pendant l attente.
 *   (M) mutants sur COPIES (app.html en memoire, module et serveur copies) : chacun DOIT rougir.
 * NE PROUVE PAS : le rendu a l ecran (aucun navigateur ici), de vrais logs mainnet, le cout reel en archive d un redemarrage (seulement
 *   COMPTE par `fenetresRattrapage`, pas mesure en prod).
 * ⛔ PORTABLE : process.exitCode, jamais process.exit. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (!c) { ko++; console.error('KO ' + m); } };
const dormir = (ms) => new Promise((o) => setTimeout(o, ms));

/* ── P. qui pulse (app.html) ── */
console.log('— P. journalAPulser (app.html)');
const HTML = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
function extraire(h) {
  const i = h.indexOf('function journalAPulser(');
  if (i < 0) return null;
  const fin = h.slice(i).search(/\n\}\n/);
  if (fin < 0) return null;
  try { return new Function('return (' + h.slice(i, i + fin + 2) + ')')(); } catch (_) { return null; }
}
const H0 = Date.UTC(2026, 9, 23, 0, 0, 0);
const at = (hh, mm) => H0 + (hh * 60 + mm) * 60000;
const ev = (id, t, b) => ({ id, t, baseBlock: b, kind: 'roll', text: id });
function serieP(h, nom) {
  const r = [];
  const v = (c, m) => { if (!c) r.push(nom + ' : ' + m); };
  const f = extraire(h);
  v(typeof f === 'function', 'journalAPulser absente ou illisible');
  if (typeof f !== 'function') return r;
  const ids = (x) => x.neufs.map((e) => e.id).join(',');
  /* P1 : la reproduction du verdict. Page chargee a 17:58, passage 1 a 18:00. */
  const live = ev('live', at(17, 59), 1000), vieux = ev('old-catchup', at(6, 10), 500);
  const p1 = f([live], null, { maintenant: at(18, 0), scanJusqua: 1000 }, 120000, at(18, 0));
  v(ids(p1) === 'live', 'P1 passage 1 : le live plus jeune que la page pulse (lu : ' + ids(p1) + ')');
  const p2 = f([live, vieux], p1.etat, { maintenant: at(18, 0) + 25000, scanJusqua: 1000 }, 145000, at(18, 0) + 25000);
  v(ids(p2) === '', 'P1 passage 2 : l evenement de 06:10 ajoute par le rattrapage NE pulse PAS (lu : ' + ids(p2) + ')');
  /* P2 : un vrai nouvel evenement du direct */
  const neuf = ev('neuf', at(18, 1), 1010);
  const p3 = f([neuf, live, vieux], p2.etat, { maintenant: at(18, 1), scanJusqua: 1010 }, 180000, at(18, 1));
  v(ids(p3) === 'neuf', 'P2 : le nouvel evenement du direct (bloc au-dessus du scan) pulse (lu : ' + ids(p3) + ')');
  const p4 = f([neuf, live, vieux], p3.etat, { maintenant: at(18, 2), scanJusqua: 1010 }, 240000, at(18, 2));
  v(ids(p4) === '', 'P2 : un evenement deja vu ne pulse jamais deux fois (lu : ' + ids(p4) + ')');
  /* P3 : premier passage avec des evenements plus vieux que la page */
  const p5 = f([live, vieux, ev('matin', at(9, 0), 700)], null, { maintenant: at(18, 30), scanJusqua: 1000 }, 60000, at(18, 30));
  v(ids(p5) === '', 'P3 : au premier passage, rien de plus vieux que la page ne pulse (lu : ' + ids(p5) + ')');
  /* P4 : le serveur n a encore rien lu (scanJusqua null) ; sa premiere lecture apporte 5 h d histoire + un evenement d apres le chargement */
  const q1 = f([], null, { maintenant: at(18, 0), scanJusqua: null }, 1000, at(18, 0));
  const q2 = f([ev('apres', at(18, 0) + 10000, 990), ev('h-5', at(13, 0), 100)], q1.etat, { maintenant: at(18, 0) + 25000, scanJusqua: null }, 26000, at(18, 0) + 25000);
  v(ids(q2) === 'apres', 'P4 : scan inconnu -> seul ce qui est plus jeune que la page pulse (lu : ' + ids(q2) + ')');
  const q3 = f([ev('apres', at(18, 0) + 10000, 990), ev('h-5', at(13, 0), 100), ev('rattrape', at(7, 0), 50)], q2.etat, { maintenant: at(18, 1), scanJusqua: 1000 }, 61000, at(18, 1));
  v(ids(q3) === '', 'P4 : puis le rattrapage, scan connu -> rien ne pulse (lu : ' + ids(q3) + ')');
  /* P5 : serveur sans `maintenant` : premier passage muet, l horloge locale borne les suivants */
  const s1 = f([], null, { scanJusqua: null }, 5000, at(18, 0));
  const s2 = f([ev('vieux2', at(8, 0), 300)], s1.etat, { scanJusqua: null }, 30000, at(18, 0) + 25000);
  v(ids(s2) === '', 'P5 : sans `maintenant`, un evenement du matin ne pulse pas (lu : ' + ids(s2) + ')');
  /* P6 : redemarrage du serveur, scan qui recule : le plus haut scan vu tient */
  const r1 = f([ev('a', at(17, 0), 2000)], null, { maintenant: at(17, 0), scanJusqua: 2000 }, 1000, at(17, 0));
  const r2 = f([ev('a', at(17, 0), 2000)], r1.etat, { maintenant: at(17, 1), scanJusqua: 1500 }, 61000, at(17, 1));
  const r3 = f([ev('a', at(17, 0), 2000), ev('relu', at(16, 59), 1700)], r2.etat, { maintenant: at(17, 2), scanJusqua: 1600 }, 121000, at(17, 2));
  v(ids(r3) === '', 'P6 : apres un scan qui recule, un evenement sous le plus haut scan vu ne pulse pas (lu : ' + ids(r3) + ')');
  /* P7 : cablage */
  const iP = h.indexOf('async function peindreJournalMap() {'), finP = iP > 0 ? h.slice(iP).search(/\n\}\n/) : -1;
  const p = iP > 0 && finP > 0 ? h.slice(iP, iP + finP) : '';
  v(/const r = journalAPulser\(journal, journalVus, j, performance\.now\(\), Date\.now\(\)\);/.test(p) && /journalVus = r\.etat;/.test(p) && /for \(const e of neufs\.slice\(0, 3\)\)/.test(p),
    'P7 : peindreJournalMap decide par journalAPulser');
  v(!/!journalVus\.has\(e\.id\)/.test(p), 'P7 : plus de regle « id jamais vu » en ligne');
  return r;
}
const fautesP = serieP(HTML, 'app');
ok(fautesP.length === 0, 'P : ' + (fautesP.join(' ; ') || '7 scenarios tenus'));
for (const x of fautesP) console.error('   ' + x);
const MUTANTS_P = [
  ['ancienne regle : id jamais vu = neuf', '!avant.vus.has(e.id) && (Number.isSafeInteger(e.baseBlock) && avant.scan !== null ? e.baseBlock > avant.scan : e.t >= avant.plafond)', '!avant.vus.has(e.id)'],
  ['premier passage sans borne de page', 'neufs = maintenant ? liste.filter((e) => maintenant - e.t <= ecoule) : [];', 'neufs = liste.slice();'],
  ['sans `maintenant`, pas de repli horloge', '(maintenant || Number(horloge) || 0) - (Number(ecoule) || 0)', '(maintenant || 0) - (Number(ecoule) || 0)'],
  ['scan qui recule suivi', 'Math.max(avant.scan, scanRecu)', 'Math.min(avant.scan, scanRecu)'],
  ['peindreJournalMap revient a la regle en ligne', 'const r = journalAPulser(journal, journalVus, j, performance.now(), Date.now());\n    const neufs = r.neufs;\n    journalVus = r.etat;',
    'const neufs = journalVus === null ? [] : journal.filter((e) => !journalVus.has(e.id));\n    journalVus = new Set(journal.map((e) => e.id));'],
];
for (const [nom, de, a] of MUTANTS_P) {
  const m = HTML.includes(de) ? HTML.replace(de, a) : null;
  ok(m !== null && serieP(m, 'mutant').length > 0, 'MUTANT APP SURVIVANT (ou ancre absente) : ' + nom);
}

/* ── S. module pur ── */
console.log('— S. module pur (garderJournal, completerJournal)');
const { topic } = await import(pathToFileURL(path.join(ICI, 'keccak.js')).href);
const { BLOCKROLLS_DEPLOIEMENT } = await import(pathToFileURL(path.join(ICI, 'blockrolls-deploiement.js')).href);
const ROLLS = String(BLOCKROLLS_DEPLOIEMENT.adresse).toLowerCase(), SKINS = '0x' + 'cd'.repeat(20);
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', DEV = { [USDC]: { sym: 'USDC', dec: 6 } };
const W1 = '0x' + '12'.repeat(19) + 'ab', W2 = '0x' + '34'.repeat(20);
const tA = (a) => '0x' + '0'.repeat(24) + a.slice(2);
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const hx = (k) => '0x' + k.toString(16);
const txh = (k) => '0x' + k.toString(16).padStart(64, '0');
const G = [1, 2, 3, 4, 5].map(u).join('');
async function serieS(M, nom) {
  const r = [];
  const v = (c, m) => { if (!c) r.push(nom + ' : ' + m); };
  const lRolled = (rid, w, cible, b, k) => ({ address: ROLLS, topics: [M.T_ROLLED, '0x' + u(rid), tA(w)], data: '0x' + G + u(cible) + u(0) + u(250000) + u(250000), blockNumber: hx(b), logIndex: '0x0', transactionHash: txh(k) });
  const lSettled = (rid, w, score, gain, b, k) => ({ address: ROLLS, topics: [M.T_SETTLED, '0x' + u(rid), tA(w)], data: '0x' + G + u(0) + u(score) + u(gain) + u(0), blockNumber: hx(b), logIndex: '0x0', transactionHash: txh(k) });
  const lListed = (sk, b, k) => ({ address: SKINS, topics: [M.T_LISTED, '0x' + u(sk)], data: '0x' + u(USDC) + u(1000000) + u(1792900000), blockNumber: hx(b), logIndex: '0x0', transactionHash: txh(k) });
  const lBid = (sk, w, amt, b, k) => ({ address: SKINS, topics: [M.T_BID, '0x' + u(sk), tA(w)], data: '0x' + u(amt) + u(1792900000), blockNumber: hx(b), logIndex: '0x0', transactionHash: txh(k) });
  const horo = (b) => 1792300000 + b, C = { rolls: ROLLS, skins: SKINS };
  /* garderJournal */
  const evs = Array.from({ length: 8 }, (_, i) => ({ id: 'x' + i, t: 1000 + i, kind: 'roll', wallet: null, text: 't' + i, baseBlock: i, logIndex: 0 }));
  const g = M.garderJournal([], evs, { depuisMs: 0, max: 5 });
  v(g.evenements.length === 5 && g.coupes === 3 && g.evenements[0].id === 'x7' && g.evenements[4].id === 'x3', 'garderJournal(8, max 5) -> 5 gardes (les plus recents), coupes 3 (lu : ' + g.coupes + ')');
  const g2 = M.garderJournal(evs.slice(0, 3), evs.slice(2), { depuisMs: 1002, max: 10 });
  v(g2.coupes === 0 && g2.evenements.length === 6, 'garderJournal : doublons et veille (avant depuisMs) ne sont PAS des coupes (lu : ' + g2.coupes + ')');
  /* completerJournal : Settled lu avant son Rolled */
  const seul = M.lireEvenementsJeu([lSettled(41, W1, 3, 1500000, 900, 2)], C, { horodatage: horo, devises: DEV }).evenements;
  const ensemble = M.lireEvenementsJeu([lRolled(41, W1, 777, 100, 1), lSettled(41, W1, 3, 1500000, 900, 2)], C, { horodatage: horo, devises: DEV }).evenements;
  const attenduS = ensemble.find((e) => e.kind === 'settled');
  v(seul.length === 1 && !/on block/.test(seul[0].text), 'Settled seul : sans « on block » (lu : ' + (seul[0] && seul[0].text) + ')');
  const cS = M.completerJournal(seul, { cibles: new Map([['41', 777]]), devisesListees: new Map(), devises: DEV });
  v(cS[0] && attenduS && cS[0].text === attenduS.text && cS[0].cible === 777, 'Settled complete = la lecture dans l ordre (' + (cS[0] && cS[0].text) + ' vs ' + (attenduS && attenduS.text) + ')');
  const cS0 = M.completerJournal(seul, { cibles: new Map([['99', 5]]), devisesListees: new Map(), devises: DEV });
  v(cS0[0] && cS0[0].text === seul[0].text && cS0[0].cible === null, 'Settled dont le Rolled est inconnu : inchange');
  /* Bid lu avant son Listed */
  const bSeul = M.lireEvenementsJeu([lBid(12, W2, 2500000, 900, 4)], C, { horodatage: horo, devises: DEV }).evenements;
  const bEns = M.lireEvenementsJeu([lListed(12, 100, 3), lBid(12, W2, 2500000, 900, 4)], C, { horodatage: horo, devises: DEV }).evenements;
  v(bSeul.length === 1 && bSeul[0].text === W2.slice(0, 6) + '…' + W2.slice(-4) + ' bid on skin #12', 'Bid seul : sans montant (lu : ' + (bSeul[0] && bSeul[0].text) + ')');
  const cB = M.completerJournal(bSeul, { cibles: new Map(), devisesListees: new Map([['12', USDC]]), devises: DEV });
  v(cB[0] && bEns[0] && cB[0].text === bEns[0].text && /2\.50 USDC/.test(cB[0].text), 'Bid complete = la lecture dans l ordre (' + (cB[0] && cB[0].text) + ' vs ' + (bEns[0] && bEns[0].text) + ')');
  const cB0 = M.completerJournal(bSeul, { cibles: new Map(), devisesListees: new Map([['12', '0x' + '99'.repeat(20)]]), devises: DEV });
  v(cB0[0] && cB0[0].text === bSeul[0].text, 'Bid dont la devise listee est inconnue : inchange (aucun montant invente)');
  const deja = M.completerJournal(bEns, { cibles: new Map(), devisesListees: new Map([['12', USDC]]), devises: DEV });
  v(deja[0] === bEns[0], 'un Bid deja complet n est pas reecrit');
  return r;
}
/* une exception (fonction absente sur une base plus vieille) est un KO COMPTE, jamais un plantage sans chiffre (defaut 2 du verdict) */
let fautesS;
try { fautesS = await serieS(await import(pathToFileURL(path.join(ICI, 'journal-jeu.js')).href + '?v=p'), 'module'); } catch (e) { fautesS = ['module : la serie a leve ' + String((e && e.message) || e).slice(0, 160)]; }
ok(fautesS.length === 0, 'S : ' + (fautesS.join(' ; ') || 'garderJournal + completerJournal tenus'));
for (const x of fautesS) console.error('   ' + x);
const srcJ = fs.readFileSync(path.join(ICI, 'journal-jeu.js'), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-journal-pulse-mut-'));
const versOriginaux = (s) => s.replace(/from '\.\/([^']+)'/g, (_, f) => "from '" + pathToFileURL(path.join(ICI, f)).href + "'");
const MUTANTS_S = [
  ['coupes jamais comptees', 'coupes: Math.max(0, tous.length - m) };', 'coupes: 0 };'],
  ['Settled jamais complete', "if (e && e.kind === 'settled' && e.cible === null", "if (false && e.kind === 'settled' && e.cible === null"],
  ['Bid jamais complete', "if (e && e.kind === 'skin_bid' && e.devise === null", "if (false && e.kind === 'skin_bid' && e.devise === null"],
  ['Settled complete sans cible connue', '&& Number.isSafeInteger(c.get(e.rollId)) &&', '&&'],
  ['Bid complete sans devise connue', '&& dl.has(e.skin) && dv[dl.get(e.skin)] &&', '&& dl.has(e.skin) &&'],
];
let k = 0;
for (const [nom, de, a] of MUTANTS_S) {
  const s = srcJ.replace(/\r\n/g, '\n');
  if (!s.includes(de)) { ok(false, 'ancre du mutant absente : ' + nom); continue; }
  const f = path.join(tmp, 'journal-jeu-p' + (++k) + '.js');
  fs.writeFileSync(f, versOriginaux(s.replace(de, a)));
  let rouge = false;
  try { rouge = (await serieS(await import(pathToFileURL(f).href), 'mutant')).length > 0; } catch (_) { rouge = true; }
  ok(rouge, 'MUTANT MODULE SURVIVANT : ' + nom);
}
fs.rmSync(tmp, { recursive: true, force: true });
ok(fs.readFileSync(path.join(ICI, 'journal-jeu.js'), 'utf8') === srcJ, 'le module sur disque est intact apres les mutants');

/* ── B. vrai serveur, faux noeud : minuit ~14 000 blocs sous la tete (le direct lit 9 000 blocs, le rattrapage le reste) ── */
console.log('— B. endpoint (serveur local, faux noeud)');
const M0 = await import(pathToFileURL(path.join(ICI, 'journal-jeu.js')).href + '?v=b');
const H = 3000000;
const nowS = Math.floor(Date.now() / 1000), minuitS = Math.floor(nowS / 86400) * 86400;
const sB = Math.max(nowS - minuitS, 30) / 14000;
const tsB = (b) => nowS - Math.floor((H - b) * sB);
let P = null;
for (let b = H - 20000; b <= H; b++) if (tsB(b) >= minuitS) { P = b; break; }
ok(Number.isSafeInteger(P) && H - P > 11000, 'faux noeud : minuit UTC au bloc ' + P + ' (' + (H - P) + ' sous la tete)');
const CIBLE = P + 7;
function logsNoeud() {
  const out = [
    /* le Rolled PROFOND (rattrapage) et son Settled dans le direct : lu a rebours, le Settled arrive AVANT le Rolled */
    { address: ROLLS, topics: [M0.T_ROLLED, '0x' + u(41), tA(W1)], data: '0x' + G + u(CIBLE) + u(0) + u(250000) + u(250000), blockNumber: hx(P + 5), logIndex: '0x0', transactionHash: txh(501) },
    { address: ROLLS, topics: [M0.T_SETTLED, '0x' + u(41), tA(W1)], data: '0x' + G + u(0) + u(3) + u(1500000) + u(0), blockNumber: hx(H - 100), logIndex: '0x0', transactionHash: txh(502) },
  ];
  /* 8 rolls de plus dans le direct : 10 evenements du jour en tout */
  for (let i = 0; i < 8; i++) out.push({ address: ROLLS, topics: [M0.T_ROLLED, '0x' + u(60 + i), tA(W2)], data: '0x' + G + u(H - 290 + i) + u(0) + u(250000) + u(250000), blockNumber: hx(H - 300 + i), logIndex: '0x0', transactionHash: txh(600 + i) });
  return out;
}
function fauxNoeud(refuseSous, refusees) {
  return http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      let id = 1, m = '', p = []; try { const j = JSON.parse(b); id = j.id; m = j.method; p = j.params || []; } catch (_) {}
      let result = '0x', error = null;
      if (m === 'eth_blockNumber') result = hx(H);
      else if (m === 'eth_getBlockByNumber') { const num = Math.min(H, parseInt(p[0], 16) || H); result = { number: hx(num), hash: '0x' + 'ab'.repeat(32), timestamp: hx(tsB(num)) }; }
      else if (m === 'eth_getLogs') {
        const f = p[0] || {}, lo = parseInt(f.fromBlock, 16), hi = parseInt(f.toBlock, 16);
        /* seule la requete du JOURNAL (adresses en tableau, nos rolls dedans) est refusee et comptee : les autres lecteurs du serveur
         *  (duels, XP, createurs) interrogent le meme faux noeud et ne doivent pas brouiller le compte */
        const duJournal = Array.isArray(f.address) && f.address.map((x) => String(x).toLowerCase()).includes(ROLLS);
        if (duJournal && refuseSous !== null && lo < refuseSous) { refusees.push(Date.now()); error = { code: -32005, message: 'request limit reached' }; }
        else result = duJournal
          ? logsNoeud().filter((l) => { const bn = parseInt(l.blockNumber, 16); return bn >= lo && bn <= hi; }) : [];
      } else if (m === 'eth_chainId') result = '0x2105';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result }));
    });
  });
}
/** lance le serveur (ou une COPIE mutee), attend `attendre(j)`, puis `ensuite(j, srv)` (optionnel) avant de tout arreter */
async function lancer({ refuseSous = null, garde = '', serveur = 'serveur-web.js', attendre, ensuite = null }) {
  const refusees = [];
  const noeud = fauxNoeud(refuseSous, refusees);
  await new Promise((o) => noeud.listen(0, '127.0.0.1', o));
  const urlNoeud = 'http://127.0.0.1:' + noeud.address().port;
  const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-journal-pulse-'));
  const port = await new Promise((o) => { const s = http.createServer(); s.listen(0, '0.0.0.0', () => { const p = s.address().port; s.close(() => o(p)); }); });
  const enfant = spawn(process.execPath, [path.join(ICI, serveur)], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: urlNoeud, BASE_RPC_LECTURE: urlNoeud, BASE_RPC_ARCHIVE: '', RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '', TB_REPLIS: '0',
      TB_JOURNAL_PREMIER_MS: '1000', TB_JOURNAL_TOUR_MS: '1000', TB_JOURNAL_GARDE: garde } });
  let stderr = ''; enfant.stdout.on('data', () => {}); enfant.stderr.on('data', (c) => { stderr += c; });
  const srv = 'http://127.0.0.1:' + port;
  const lire = async () => { try { return await (await fetch(srv + '/api/jeu/journal', { signal: AbortSignal.timeout(5000) })).json(); } catch (_) { return null; } };
  let demarre = false;
  for (let i = 0; i < 120 && !demarre; i += 1) { try { demarre = (await fetch(srv + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await dormir(500); } }
  let j = null, apres = null;
  if (demarre) {
    for (let i = 0; i < 120; i++) { j = await lire(); if (j && j.ok && attendre(j)) break; await dormir(500); }
    if (ensuite && j) apres = await ensuite(j, lire, refusees);
  }
  enfant.kill(); noeud.close();
  try { fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {}
  return { demarre, j, apres, stderr, refusees };
}
const settledTxt = (j) => { const e = j && Array.isArray(j.evenements) ? j.evenements.find((x) => x.tx === txh(502)) : null; return e ? e.text : null; };
const attenduSettled = W1.slice(0, 6) + '…' + W1.slice(-4) + ' rolled 3/5 on block ' + M0.numeroBloc(CIBLE) + ' · +1.50 USDC';
const couvert = (j) => j.couvertureDepuis === P && j.premierBlocDuJour === P;

function verifierCoupes(r, garde) {
  const f = [];
  if (!r.demarre) return ['serveur non demarre — ' + r.stderr.slice(0, 200)];
  const j = r.j;
  if (!j || !couvert(j)) return ['couverture jamais atteinte (' + JSON.stringify(j && { d: j.couvertureDepuis, p: j.premierBlocDuJour, r: j.rattrapage }) + ')'];
  if (garde) {
    if (!(j.coupes === 5)) f.push('garde 5, 10 evenements du jour : coupes = 5 attendu (lu : ' + j.coupes + ')');
    if (j.couvreLaJournee !== false) f.push('journal coupe mais couvreLaJournee = ' + j.couvreLaJournee);
  } else {
    if (j.coupes !== 0 || j.couvreLaJournee !== true) f.push('garde par defaut : coupes 0 et couvreLaJournee true attendus (lu : ' + j.coupes + ', ' + j.couvreLaJournee + ')');
    if (!j.evenements.some((e) => e.tx === txh(501))) f.push('le Rolled profond (rattrape) manque');
  }
  if (!(j.fenetresRattrapage >= 3)) f.push('fenetresRattrapage compte les fenetres du rattrapage (>= 3 attendu, lu : ' + j.fenetresRattrapage + ')');
  if (settledTxt(j) !== attenduSettled) f.push('le Settled du direct, complete apres le rattrapage du Rolled : ' + JSON.stringify(settledTxt(j)) + ' attendu ' + JSON.stringify(attenduSettled));
  return f;
}
const attendreCouvert = (j) => couvert(j) && settledTxt(j) !== null && j.fenetresRattrapage >= 3;
/* B1 : garde 5 */
const b1 = await lancer({ garde: '5', attendre: (j) => attendreCouvert(j) && j.coupes > 0 && settledTxt(j) === attenduSettled });
const f1 = verifierCoupes(b1, true);
ok(f1.length === 0, 'B1 (garde 5) : ' + (f1.join(' ; ') || 'coupes 5, couvreLaJournee false, Settled complete'));
/* B2 : garde par defaut */
const b2 = await lancer({ attendre: (j) => attendreCouvert(j) && j.couvreLaJournee === true && settledTxt(j) === attenduSettled });
const f2 = verifierCoupes(b2, false);
ok(f2.length === 0, 'B2 (garde 400) : ' + (f2.join(' ; ') || 'coupes 0, couvreLaJournee true, Settled complete'));
/* B3 : le rattrapage refuse -> attente qui double, aucune requete du rattrapage pendant l attente */
async function observerAttente(j0, lire, refusees) {
  let j = j0;
  for (let essai = 0; essai < 40; essai++) {
    if (j && j.rattrapage && j.rattrapage.refus >= 3 && j.rattrapage.prochainEssai) {
      const reste = Date.parse(j.rattrapage.prochainEssai) - Date.now() - 400;
      if (reste >= 1500) {
        const c0 = refusees.length, fen = Math.min(reste, 3000);
        await dormir(fen);
        return { refus: j.rattrapage.refus, attenteMs: Date.parse(j.rattrapage.prochainEssai) - Date.parse(j.rattrapage.lu), pendant: refusees.length - c0, fen, total: refusees.length };
      }
    }
    await dormir(400); j = await lire();
  }
  return null;
}
function verifierAttente(r) {
  if (!r.demarre) return ['serveur non demarre — ' + r.stderr.slice(0, 200)];
  const a = r.apres, f = [];
  if (!a) return ['aucun etat de refus >= 3 observable avec une attente >= 1,5 s (rattrapage : ' + JSON.stringify(r.j && r.j.rattrapage) + ')'];
  if (!(a.attenteMs >= 3500)) f.push('au 3e refus l attente vaut ~4 tours (lu : ' + a.attenteMs + ' ms)');
  if (a.pendant !== 0) f.push(a.pendant + ' requete(s) du rattrapage PENDANT l attente (' + a.fen + ' ms)');
  if (!/request limit reached/.test(String(r.j && r.j.rattrapage && r.j.rattrapage.pourquoi))) f.push('le refus est dit');
  if (r.j && r.j.couvreLaJournee !== false) f.push('couvreLaJournee doit rester false');
  return f;
}
const b3 = await lancer({ refuseSous: H - 10000, attendre: (j) => j.rattrapage && j.rattrapage.refus >= 1, ensuite: observerAttente });
const f3 = verifierAttente(b3);
console.log('   B1 coupes=' + (b1.j && b1.j.coupes) + ' couvreLaJournee=' + (b1.j && b1.j.couvreLaJournee) + ' fenetresRattrapage=' + (b1.j && b1.j.fenetresRattrapage)
  + ' · B2 coupes=' + (b2.j && b2.j.coupes) + ' couvreLaJournee=' + (b2.j && b2.j.couvreLaJournee) + ' · B3 ' + JSON.stringify(b3.apres));
ok(f3.length === 0, 'B3 (refus) : ' + (f3.join(' ; ') || 'refus ' + b3.apres.refus + ', attente ' + b3.apres.attenteMs + ' ms, 0 requete pendant ' + b3.apres.fen + ' ms (' + b3.apres.total + ' refusees en tout)'));

/* ── M. mutants du SERVEUR (copies dans ce dossier, effacees apres) ── */
console.log('— M. mutants du serveur (copies)');
const srcS = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
const MUTANTS_SRV = [
  ['couverture qui ignore les coupes', 'couvreLaJournee: journalEtat.coupes === 0 && journeeCouverte(', 'couvreLaJournee: journeeCouverte(', { garde: '5', attendre: (j) => attendreCouvert(j) && j.coupes > 0 }, (r) => verifierCoupes(r, true)],
  ['textes jamais completes', 'journalEtat.evenements = completerJournal(g.evenements, { cibles: journalEtat.cibles, devisesListees: journalEtat.devisesListees, devises: DEVISES_SKIN_SRV });', 'journalEtat.evenements = g.evenements;',
    { attendre: (j) => attendreCouvert(j) && j.couvreLaJournee === true }, (r) => verifierCoupes(r, false)],
  ['rattrapage refuse retente a chaque tour', 'const attendRattrapage = Date.now() < journalEtat.rattrapageApres;', 'const attendRattrapage = false;',
    { refuseSous: H - 10000, attendre: (j) => j.rattrapage && j.rattrapage.refus >= 1, ensuite: observerAttente }, verifierAttente],
];
let km = 0;
for (const [nom, de, a, opts, verifier] of MUTANTS_SRV) {
  if (!srcS.includes(de)) { ok(false, 'ancre du mutant serveur absente : ' + nom); continue; }
  const nomCopie = 'serveur-web.mut-pulse-' + process.pid + '-' + (++km) + '.js';
  fs.writeFileSync(path.join(ICI, nomCopie), srcS.replace(de, a));
  let rouge = false;
  try { const fm = verifier(await lancer({ ...opts, serveur: nomCopie })); rouge = fm.length > 0; console.log('   mutant « ' + nom + ' » : ' + (fm[0] || 'VERT')); } catch (e) { rouge = true; console.log('   mutant « ' + nom + ' » : leve ' + e.message); }
  finally { try { fs.rmSync(path.join(ICI, nomCopie), { force: true }); } catch (_) {} }
  ok(rouge, 'MUTANT SERVEUR SURVIVANT : ' + nom);
}
ok(fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8') === srcS, 'le serveur sur disque est intact apres les mutants');

console.log(n + ' assertions, ' + ko + ' KO');
console.log('NE PROUVE PAS : le rendu a l ecran, de vrais logs mainnet, le cout reel en archive d un redemarrage (compte, pas mesure en prod).');
process.exitCode = ko ? 1 : 0;
