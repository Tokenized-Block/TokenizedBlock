/* test-graine-nos-blocks-r9b.mjs — R9b : GRAINE de /api/nos-blocks (origine.js), comme GRAINE_ROUTEUR.
 * ⛔ Prod 20261003-r9-blocks-tb : au redemarrage le serveur redescendait jusqu au bloc 50 861 088 (~19 min) ; couvertureComplete
 *   restait faux, donc sourcesTbLues() aussi : PEXRA et les jetons o1 bloques. Avec la graine, seul [jusqua + 1, tete] est lu.
 * Ce banc : (U) admission de la graine — la vraie passe ; une entree hors comptes surveilles, hors plage, mal formee, ou un
 *   compte surveille non couvert : graine ENTIERE refusee ; re-verification d une entree par son recu. (S) le VRAI serveur
 *   (serveur-web.js d une copie du depot) redemarre contre un RPC fictif a 1 jour de la graine : la premiere reponse n est pas
 *   complete, puis couvertureComplete passe a vrai en moins de 2 min sans lire un seul bloc sous la graine, et le block frappe
 *   apres la graine est servi ; avec une graine FORGEE, le serveur la refuse et redescend depuis la tete. (S6-S8, clignotement
 *   PEXRA/o1) une fenetre ratee est RELUE sur place ; une fois complete, la couverture n est jamais remise a zero. (X1-X2) idem
 *   pour /api/blocks-routeur (l autre moitie de sourcesTbLues()).
 * ⛔ PORTABLE LF/CRLF : chemins par pathToFileURL / fileURLToPath ; motifs de mutants sur une ligne.
 * ⛔ TEMOINS NEGATIFS : copie non mutee verte, puis chaque mutant DOIT rougir. */
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (dir, f) => import(pathToFileURL(path.join(dir, f)).href);
const A6CF = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
const AUTRE = '0x1111111111111111111111111111111111111111';
const PLANCHER = 50861088;
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const mot = (a) => '0x' + '0'.repeat(24) + String(a).toLowerCase().slice(2);
/* ce que /api/nos-blocks servait en prod (lu 2026-10-03 06:29 UTC, couvertureComplete vrai) */
const PROD = ['0xb20000000000000000000024c30d3fcb7931272e', '0xb20000000000000000000003d296be435ae4bbe3',
  '0xb200000000000000000000e63ffc3f40bf92a042', '0xb200000000000000000000ab549fa65ad4edae3f'];
const NOUVEAU = '0xb200000000000000000000c0ffee00000000beef'; /* frappe vers a6cf APRES la graine (RPC fictif) */
const libre = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });

const FACTORY_B20 = '0xb20f000000000000000000000000000000000000';
function rpcFictif(jusqua, o = {}) {
  const etat = { tete: o.tete || jusqua + 43200, fenetresFrappes: [], sousLaGraine: 0, echecs: o.echecs ?? 3, rates: [],
    echecsRouteur: o.echecsRouteur || 0, fenetresRouteur: [], ratesRouteur: [] };
  const repondre = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x' + etat.tete.toString(16);
    if (m === 'eth_getLogs') {
      const q = p[0] || {}; const de = parseInt(q.fromBlock, 16), a = parseInt(q.toBlock, 16); const t = q.topics || [];
      if (t[0] === TOPIC_TRANSFER && t[1] === mot('0x' + '0'.repeat(40)) && String(t[2]).toLowerCase() === mot(A6CF)) {
        etat.fenetresFrappes.push([de, a]); if (de <= jusqua) etat.sousLaGraine += 1;
        await new Promise((ok) => setTimeout(ok, 100)); /* latence d un RPC public */
        /* une fenetre RATEE : les `echecs` prochaines requetes echouent (rpcServeur reessaie 3 fois : 3 echecs = une fenetre ratee) */
        if (etat.echecs > 0) { etat.echecs -= 1; etat.rates.push([de, a]); throw new Error('internal error'); }
        const b = jusqua + 100;
        return de <= b && b <= a ? [{ address: NOUVEAU, topics: [TOPIC_TRANSFER, t[1], t[2]], data: '0x', blockNumber: '0x' + b.toString(16), transactionHash: '0x' + 'ab'.repeat(32) }] : [];
      }
      /* ⛔ seules les fenetres du routeur (pas 1000, alignees sur GRAINE_JUSQUA + 1) : le balayage trending lit aussi la factory */
      if (String(q.address).toLowerCase() === FACTORY_B20 && o.baseRouteur && de > o.baseRouteur && (de - o.baseRouteur - 1) % 1000 === 0 && a - de <= 999) {
        etat.fenetresRouteur.push([de, a]); await new Promise((ok) => setTimeout(ok, 100));
        if (etat.echecsRouteur > 0) { etat.echecsRouteur -= 1; etat.ratesRouteur.push([de, a]); throw new Error('internal error'); }
      }
      return [];
    }
    if (m === 'eth_getCode') return String(p[0]).toLowerCase() === NOUVEAU ? '0xef0100' + 'ab'.repeat(20) : '0x';
    throw Object.assign(new Error('execution reverted'), { code: 3 });
  };
  etat.serveur = http.createServer((req, res) => {
    let corps = ''; req.on('data', (c) => { corps += c; });
    req.on('end', async () => {
      let j; try { j = JSON.parse(corps); } catch { res.writeHead(400); res.end(); return; }
      const un = async (x) => { try { return { jsonrpc: '2.0', id: x.id, result: await repondre(x.method, x.params || []) }; }
        catch (e) { return { jsonrpc: '2.0', id: x.id, error: { code: 3, message: e.message } }; } };
      const r = Array.isArray(j) ? await Promise.all(j.map(un)) : await un(j);
      res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r));
    });
  });
  return etat;
}

/* Le vrai serveur de `dir`, redemarre a froid contre le RPC fictif. */
async function redemarrer(dir, jusqua, { attenteMax = 120000, rpcO = {}, routeurSeul = false } = {}) {
  const rpc = rpcFictif(jusqua, rpcO); const portRpc = await libre(); await new Promise((ok) => rpc.serveur.listen(portRpc, '127.0.0.1', ok));
  const port = await libre(); const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-r9b-vol-')); tmp.push(vol);
  const u = 'http://127.0.0.1:' + portRpc;
  const enfant = spawn(process.execPath, [path.join(dir, 'serveur-web.js')], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: u, BASE_RPC_LECTURE: u, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '' } });
  let journal = '', mort = false; enfant.stdout.on('data', (d) => { journal += d; }); enfant.stderr.on('data', (d) => { journal += d; });
  enfant.on('exit', () => { mort = true; });
  /* ⛔ un serveur mort (port pris) ne doit jamais laisser lire celui d un autre mutant */
  const t0 = Date.now(); const lire = (chemin = '/api/nos-blocks') => { if (mort) return Promise.reject(new Error('serveur mort'));
    return fetch('http://127.0.0.1:' + port + chemin, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()); };
  let premiere = null, derniere = null, complet = null; const vues = [];
  const arreter = async () => { enfant.kill('SIGKILL'); await new Promise((ok) => rpc.serveur.close(ok)); };
  try {
    while (!routeurSeul && Date.now() - t0 < attenteMax) {
      try { derniere = await lire(); vues.push(derniere); if (!premiere) premiere = derniere; } catch { await new Promise((ok) => setTimeout(ok, 200)); continue; }
      if (derniere.couvertureComplete === true) { complet = Date.now() - t0; break; }
      if (rpc.sousLaGraine > 0 && Date.now() - t0 > 4000) break; /* il redescend sous la graine : inutile d attendre 19 min */
      await new Promise((ok) => setTimeout(ok, 500));
    }
  } catch (e) { await arreter(); throw e; }
  /* lit pendant `ms` (chaque lecture relance le rattrapage, comme les visites en prod) */
  const suivre = async (ms, assez = () => false, chemin) => { const r = []; const t = Date.now();
    while (Date.now() - t < ms && !assez(r)) { try { r.push(await lire(chemin)); } catch {} await new Promise((ok) => setTimeout(ok, 400)); } return r; };
  return { premiere, derniere, complet, rpc, vues, suivre, arreter, get journal() { return journal; } };
}

/* scenarios du serveur : R redemarrage (S1-S4, S6), F clignotement (S7, S8), G graine forgee (S5), X/Y index routeur (X1/X2) */
async function banc(dir, scen = 'RFGXY') {
  const res = []; const v = (id, c) => res.push({ id, ok: !!c });
  const O = await imp(dir, 'origine.js');
  const J = O.GRAINE_NOS_JUSQUA;
  /* U — admission */
  const vraie = O.graineNosBlocksAdmise({ comptes: [A6CF], plancher: PLANCHER });
  v('U1 la graine livree est admise pour a6cf : 2 blocks, jusqua pinne ; avec la genese = les 4 blocks servis en prod',
    vraie.ok && vraie.blocks.length === 2 && vraie.jusqua === 52109849 && J === 52109849
    && JSON.stringify([...new Set([...O.NOS_BLOCKS_GENESE, ...vraie.blocks])].sort()) === JSON.stringify([...PROD].sort()));
  v('U1b chaque entree porte jeton / compte / bloc / tx (re-verifiable)', O.GRAINE_NOS_BLOCKS.every((g) => /^0xb20{20}[0-9a-f]{18}$/.test(g.jeton)
    && g.compte === A6CF && Number.isSafeInteger(g.bloc) && /^0x[0-9a-f]{64}$/.test(g.tx)));
  const base = O.GRAINE_NOS_BLOCKS;
  const forgee = [...base, { jeton: '0xb200000000000000000000deadbeef00000000aa', compte: AUTRE, bloc: 52000000, tx: '0x' + 'cd'.repeat(32) }];
  const f = O.graineNosBlocksAdmise({ comptes: [A6CF], plancher: PLANCHER, graine: forgee });
  v('U2 graine FORGEE (entree vers un compte hors liste surveillee) : refusee en entier', f.ok === false && f.rejetees.length === 1 && !f.blocks);
  const hors = (b) => O.graineNosBlocksAdmise({ comptes: [A6CF], plancher: PLANCHER, graine: [{ ...base[0], bloc: b }] });
  v('U3 entree hors plage (apres jusqua, avant le plancher) : refusee', hors(J + 1).ok === false && hors(PLANCHER - 1).ok === false && hors(J).ok === true);
  v('U4 compte surveille non couvert par la graine (TB_NOS_CREATEURS) : refusee ; aucun compte : refusee',
    O.graineNosBlocksAdmise({ comptes: [A6CF, AUTRE], plancher: PLANCHER }).ok === false && O.graineNosBlocksAdmise({ comptes: [], plancher: PLANCHER }).ok === false);
  v('U5 entree mal formee (hors B20, tx invalide) : refusee', O.graineNosBlocksAdmise({ comptes: [A6CF], plancher: PLANCHER, graine: [{ ...base[0], jeton: AUTRE }] }).ok === false
    && O.graineNosBlocksAdmise({ comptes: [A6CF], plancher: PLANCHER, graine: [{ ...base[0], tx: '0x12' }] }).ok === false);
  /* U6 — re-verification par le recu */
  const e = base[0];
  const recu = (o = {}) => async () => ({ status: '0x1', blockNumber: '0x' + e.bloc.toString(16), logs: [{ address: e.jeton,
    topics: [TOPIC_TRANSFER, mot('0x' + '0'.repeat(40)), mot(o.vers || e.compte)] }], ...(o.r || {}) });
  v('U6 re-verification : OK sur le bon recu ; FAUX si vers un autre compte, autre bloc, ou tx en echec ; NON_LU si illisible',
    await O.verifierEntreeGraineNos({ rpc: recu(), entree: e }) === 'OK'
    && await O.verifierEntreeGraineNos({ rpc: recu({ vers: AUTRE }), entree: e }) === 'FAUX'
    && await O.verifierEntreeGraineNos({ rpc: recu({ r: { blockNumber: '0x1' } }), entree: e }) === 'FAUX'
    && await O.verifierEntreeGraineNos({ rpc: recu({ r: { status: '0x0' } }), entree: e }) === 'FAUX'
    && await O.verifierEntreeGraineNos({ rpc: async () => { throw new Error('x'); }, entree: e }) === 'NON_LU');
  /* S — le vrai serveur, redemarre (la PREMIERE fenetre lue rate 3 fois de suite = une fenetre ratee pour rpcServeur : S6) */
  if (!scen) return res;
  const s = await redemarrer(dir, J);
  if (dir === ICI) console.log('redemarrage : couvertureComplete vrai apres ' + s.complet + ' ms ; ' + s.rpc.fenetresFrappes.length + ' fenetre(s) de frappes lues, de ' + (J + 1) + ' a ' + s.rpc.tete);
  v('S1 apres redemarrage, la premiere reponse ne se dit PAS complete (la tete n est pas encore lue)', !!s.premiere && s.premiere.couvertureComplete === false);
  v('S2 apres redemarrage, couvertureComplete vrai en moins de 2 min (graine a 1 jour de la tete)', s.complet !== null && s.complet < 120000
    && s.derniere.fenetresRatees === 0 && s.derniere.depuis === PLANCHER && s.derniere.jusqua === s.rpc.tete);
  v('S3 aucun bloc sous la graine n est relu ; [jusqua + 1, tete] lu en entier', s.rpc.sousLaGraine === 0 && s.rpc.fenetresFrappes.length > 0
    && Math.min(...s.rpc.fenetresFrappes.map((w) => w[0])) === J + 1 && Math.max(...s.rpc.fenetresFrappes.map((w) => w[1])) === s.rpc.tete);
  v('S4 servi : la genese, la graine et le block frappe apres la graine', !!s.derniere && [...PROD, NOUVEAU].every((b) => s.derniere.blocks.includes(b)));
  /* S6..S8 — le clignotement PEXRA/o1 (Claude, prod : une fenetre ratee rendait sourcesTbLues() faux jusqu au tour suivant) */
  const rate1 = s.rpc.rates[0];
  v('S6 fenetre ratee au redemarrage : RELUE sur place (meme fenetre redemandee), aucune reponse ne montre de trou',
    !!rate1 && s.rpc.rates.length === 3 && s.rpc.rates.every((w) => w[0] === rate1[0] && w[1] === rate1[1])
    && s.rpc.fenetresFrappes.filter((w) => w[0] === rate1[0] && w[1] === rate1[1]).length === 4
    && s.vues.every((x) => x.fenetresRatees === 0 && x.fenetresEnAttente === 0) && s.complet !== null);
  let s7 = [], s8 = [], tete7 = null, jusqua8 = null;
  if (s.complet !== null && scen.includes('F')) {
    s.rpc.tete += 100; tete7 = s.rpc.tete; s.rpc.echecs = 3;
    s7 = await s.suivre(7000);
    jusqua8 = s7.length ? s7[s7.length - 1].jusqua : null;
    s.rpc.tete += 100; s.rpc.echecs = 100000;
    s8 = await s.suivre(24000, (r) => r.findIndex((x) => x.fenetresEnAttente > 0) >= 0 && r.length - r.findIndex((x) => x.fenetresEnAttente > 0) >= 4);
  }
  await s.arreter();
  if (scen.includes('F')) v('S7 apres la couverture, une fenetre ratee puis relue : couvertureComplete RESTE vrai, aucun trou servi, la tete est rattrapee',
    s7.length > 3 && s7.every((x) => x.couvertureComplete === true && x.fenetresRatees === 0 && x.fenetresEnAttente === 0) && s7[s7.length - 1].jusqua === tete7);
  if (scen.includes('F')) v('S8 fenetre qui rate encore apres les reprises : couverture GARDEE (vrai, depuis = plancher, jusqua inchange), dite « en attente », jamais en trou',
    s8.length > 3 && s8.every((x) => x.couvertureComplete === true && x.fenetresRatees === 0 && x.depuis === PLANCHER && x.jusqua === jusqua8)
    && s8.some((x) => x.fenetresEnAttente > 0));
  /* X1-X2 — /api/blocks-routeur : meme clignotement (Claude). Tete a 3000 blocs de GRAINE_ROUTEUR (retard max 1800). */
  if (scen.includes('X')) {
    const IRm = await imp(dir, 'index-routeur.js');
    const x = await redemarrer(dir, J, { routeurSeul: true, rpcO: { tete: IRm.GRAINE_JUSQUA + 3000, echecs: 0, echecsRouteur: 3, baseRouteur: IRm.GRAINE_JUSQUA } });
    const R = '/api/blocks-routeur'; const tX = x.rpc.tete;
    const fini = (r) => r.length >= 3 && r.slice(-3).every((y) => y.couvertureComplete === true && y.jusqua === tX);
    const x1 = await x.suivre(20000, fini, R);
    const jX = x1.length ? x1[x1.length - 1].jusqua : null;
    let x2 = [];
    if (fini(x1) && scen.includes('Y')) {
      x.rpc.tete += 500; x.rpc.echecsRouteur = 100000;
      const vu = (r) => r.findIndex((y) => y.fenetresEnAttente > 0);
      x2 = await x.suivre(24000, (r) => vu(r) >= 0 && r.length - vu(r) >= 4, R);
    }
    await x.arreter();
    const r1 = x.rpc.ratesRouteur[0];
    if (dir === ICI) console.log('routeur : ' + x.rpc.fenetresRouteur.length + ' fenetre(s) lues, ' + x.rpc.ratesRouteur.length + ' ratee(s) ' + JSON.stringify(x.rpc.ratesRouteur)
      + ' ; ' + x1.length + ' lecture(s), fenetresRatees vues ' + JSON.stringify([...new Set(x1.map((y) => y.fenetresRatees))]) + ', derniere jusqua ' + jX + ' / tete ' + tX);
    v('X1 index routeur : fenetre ratee RELUE sur place, jamais servie en trou, puis complet jusqu a la tete',
      !!r1 && x.rpc.ratesRouteur.slice(0, 3).every((w) => w[0] === r1[0] && w[1] === r1[1])
      && x.rpc.fenetresRouteur.filter((w) => w[0] === r1[0] && w[1] === r1[1]).length === 4
      && x1.length > 0 && x1.every((y) => y.fenetresRatees === 0) && fini(x1));
    if (scen.includes('Y')) v('X2 index routeur : apres la couverture, une lecture qui rate encore garde couvertureComplete vrai (retard borne), dite « en attente »',
      x2.length > 3 && x2.every((y) => y.couvertureComplete === true && y.fenetresRatees === 0 && y.jusqua === jX && y.depuis === IRm.PLANCHER_ROUTEUR)
      && x2.some((y) => y.fenetresEnAttente > 0));
  }
  if (!scen.includes('G')) return res;
  /* S5 — graine forgee dans une copie : le serveur la refuse et redescend depuis la tete */
  const dF = copie({ nom: 'graine forgee', edits: [['origine.js', "  { jeton: '0xb200000000000000000000ab549fa65ad4edae3f', compte:",
    "  { jeton: '0xb200000000000000000000deadbeef00000000aa', compte: '0x1111111111111111111111111111111111111111', bloc: 52000000, tx: '0x" + 'cd'.repeat(32) + "' },\n  { jeton: '0xb200000000000000000000ab549fa65ad4edae3f', compte:"]] }, dir);
  const sf = await redemarrer(dF, J, { attenteMax: 15000 }); await sf.arreter();
  v('S5 graine forgee : refusee au demarrage (journal), balayage depuis la tete sous la graine, jamais complete d emblee',
    /graine refusee/.test(sf.journal) && sf.rpc.sousLaGraine > 0 && !!sf.premiere && sf.premiere.couvertureComplete === false
    && !(sf.derniere && sf.derniere.blocks.includes('0xb200000000000000000000deadbeef00000000aa')));
  return res;
}

const tmp = [];
function copie(mutation, source = ICI) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-r9b-')); tmp.push(dir);
  for (const f of fs.readdirSync(source, { withFileTypes: true })) {
    if (f.name === '.git') continue;
    const de = path.join(source, f.name);
    if (f.isDirectory() || f.isSymbolicLink()) fs.symlinkSync(fs.realpathSync(de), path.join(dir, f.name));
    else fs.copyFileSync(de, path.join(dir, f.name));
  }
  for (const [fichier, de, vers] of (mutation ? mutation.edits : [])) {
    const p = path.join(dir, fichier); const src = fs.readFileSync(p, 'utf8'); const n = src.split(de).length - 1;
    if (n !== 1) throw new Error('mutant ' + mutation.nom + ' : motif trouve ' + n + ' fois dans ' + fichier + ' (attendu 1)');
    fs.writeFileSync(p, src.replace(de, vers));
  }
  return dir;
}
const MUTANTS = [
  { nom: 'n1 pas de graine (le serveur repart de zero)', scen: 'R', edits: [['serveur-web.js', 'depuis: GRAINE_NOS.ok ? PREMIER_BLOCK_TB : null, jusqua: GRAINE_NOS.ok ? GRAINE_NOS.jusqua : null,', 'depuis: null, jusqua: null,']], casse: [/^S2 /, /^S3 /] },
  { nom: 'n2 complet sur la seule graine (tete jamais exigee)', scen: 'R', edits: [['serveur-web.js', '&& nosBlocksEtat.depuis <= PREMIER_BLOCK_TB && nosBlocksEtat.teteAtteinte;', '&& nosBlocksEtat.depuis <= PREMIER_BLOCK_TB;']], casse: [/^S1 /] },
  { nom: 'n3 comptes surveilles non verifies par entree', scen: 'G', edits: [['origine.js', '&& surveilles.has(String(g.compte)) && couv.has(String(g.compte))', '']], casse: [/^U2 /, /^S5 /] },
  { nom: 'n4 plage non verifiee', scen: '', edits: [['origine.js', '&& g.bloc >= plancher && g.bloc <= jusqua', '']], casse: [/^U3 /] },
  { nom: 'n5 couverture des comptes non verifiee', scen: '', edits: [['origine.js', 'if (!surveilles.size || horsCouverture.length) return', 'if (false) return']], casse: [/^U4 /] },
  { nom: 'n6 re-verification sans le destinataire', scen: '', edits: [['origine.js', '&& String(l.topics[2]).toLowerCase() === mot(entree.compte));', ');']], casse: [/^U6 /] },
  { nom: 'n7 une entree de graine perdue', scen: '', edits: [['origine.js', "  { jeton: '0xb200000000000000000000e63ffc3f40bf92a042', compte:", "  { jeton: '0xb200000000000000000000e63ffc3f40bf92a043', compte:"]], casse: [/^U1 /] },
  { nom: 'n8 ratees ecrasees au tour suivant (pas de relecture)', scen: 'R', edits: [['serveur-web.js', '      for (const ms of REPRISES_LECTURE_MS) {', '      for (const ms of []) {']], casse: [/^S6 /] },
  { nom: 'n9 trou servi pour une fenetre au-dela de la couverture', scen: 'RF', edits: [['serveur-web.js', 'fenetresRatees: nosBlocksComplet() ? 0 : nosBlocksEtat.ratees,', 'fenetresRatees: nosBlocksEtat.ratees,']], casse: [/^S8 /] },
  { nom: 'n10 couverture remise a zero sur une lecture ratee', scen: 'RF', edits: [['serveur-web.js', '  nosBlocksEtat.ratees = ratees;', '  nosBlocksEtat.ratees = ratees; if (ratees) nosBlocksEtat.teteAtteinte = false;']], casse: [/^S8 /] },
  { nom: 'n11 index routeur : ratees ecrasees (pas de relecture)', scen: 'X', edits: [['serveur-web.js', '    if (!r.fenetresRatees) break;', '    break;']], casse: [/^X1 /] },
  { nom: 'n12 index routeur : trou servi pour une lecture au-dela de jusqua', scen: 'XY', edits: [['serveur-web.js', 'fenetresRatees: complet ? 0 : routeurEtat.ratees,', 'fenetresRatees: routeurEtat.ratees,']], casse: [/^X2 /] },
  { nom: 'n13 index routeur : couverture coupee par une lecture ratee (etat R8)', scen: 'XY', edits: [['serveur-web.js', '  const complet = routeurEtat.depuis <= PLANCHER_ROUTEUR && routeurEtat.tete !== null', '  const complet = routeurEtat.depuis <= PLANCHER_ROUTEUR && routeurEtat.tete !== null && !routeurEtat.ratees']], casse: [/^X2 /] },
];

let nAssert = 0, ko = 0;
const ok = (c, m) => { nAssert += 1; if (!c) { ko += 1; console.log('  KO ' + m); } };
try {
  /* depot, copie non mutee et mutants en parallele (5 voies : le banc tient sous le delai de la suite) ; sortie dans l ordre */
  const resultats = new Array(MUTANTS.length); let suivant = 0;
  const [reel, temoin] = await Promise.all([banc(ICI), banc(copie(null)),
    ...[0, 1, 2].map(async () => { while (suivant < MUTANTS.length) { const i = suivant++; resultats[i] = await banc(copie(MUTANTS[i]), MUTANTS[i].scen); } })]);
  for (const x of reel) ok(x.ok, 'depot : ' + x.id);
  console.log('depot : ' + reel.length + ' verifications, ' + reel.filter((x) => !x.ok).length + ' KO');
  ok(temoin.length === reel.length && temoin.every((x) => x.ok), 'copie non mutee : verte');
  for (const [i, M] of MUTANTS.entries()) {
    const r = resultats[i];
    const rouges = r.filter((x) => !x.ok).map((x) => x.id);
    console.log('mutant ' + M.nom + ' : ' + rouges.length + ' rouge(s) — ' + rouges.join(' | '));
    ok(rouges.length > 0, 'mutant ' + M.nom + ' : le banc doit devenir ROUGE');
    for (const re of M.casse) ok(rouges.some((id) => re.test(id)), 'mutant ' + M.nom + ' : doit casser ' + re);
  }
} finally {
  for (const d of tmp) fs.rmSync(d, { recursive: true, force: true });
}
console.log(nAssert + ' assertions, ' + ko + ' KO');
if (nAssert === 0) { console.log('⛔ aucune assertion executee'); process.exit(1); }
process.exit(ko ? 1 : 0);
