/* test-journal-jeu-20261018.mjs — LE JOURNAL DU JOUR (Phil 2026-10-18 : « les brains sont les occupants de la Map »).
 *
 * AFFIRME :
 *   (A) module pur journal-jeu.js, sur de FAUX logs construits ici : Rolled / Settled / PassBought lus SEULEMENT sur l adresse BlockRolls,
 *       SkinMinted / Bid / Sold SEULEMENT sur l adresse BlockSkins ; le meme topic emis par un autre contrat est ignore ; un wallet mal
 *       encode (octets hauts non nuls) ou l adresse 0 est ignore ; de-doublonnage par (tx, logIndex) ; un log sans horodatage n est pas
 *       date (sansHeure) ; textes courts ; du plus recent au plus ancien ; plafond 100 ; filtre « aujourd hui » ; avecBlocks ; practice.
 *   (B) l endpoint, sur un VRAI serveur local (serveur-web.js) branche a un FAUX noeud : GET /api/jeu/journal rend
 *       { ok, jour, lu, maintenant, couvertureDepuis, couvreLaJournee, scanJusqua, sources, evenements } ; les logs du faux noeud y arrivent
 *       une fois chacun (le faux noeud les rend a CHAQUE fenetre), le log d un autre contrat n y arrive pas, un roll practice POSTe y arrive ;
 *       POST -> 405.
 *   (C) le cablage de l app (lecture de app.html / commandes-panel.js) : Map relue seulement visible, toutes les 20-30 s, garde avant fetch ;
 *       bouton « Today » cache tant qu il n y a rien, liste fermee par defaut ; onde transitoire sur le block du wallet ; carte « Today » du
 *       Game sous les tuiles ; commande « log » ; rien dans liveEvts.
 *   (D) mutants sur COPIES (module copie dans un dossier temporaire ; app.html mute en memoire) : chacun DOIT rougir.
 * NE PROUVE PAS : le rendu a l ecran (navigateur), ni la tenue sous les refus des noeuds publics. Lecture de vrais logs mainnet : PAS ici
 *   (faux noeud) — vue a part le 2026-10-18 sur un serveur local : 1 Rolled + 1 Settled de BlockRolls (tx 0x6678…a876 et 0xdb64…d1f1,
 *   from 0x31e0…de3b, to BlockRolls, status 1, relus par eth_getTransactionReceipt sur mainnet.base.org).
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
const { topic } = await import(pathToFileURL(path.join(ICI, 'keccak.js')).href);
const { BLOCKROLLS_DEPLOIEMENT } = await import(pathToFileURL(path.join(ICI, 'blockrolls-deploiement.js')).href);
const { BLOCKSKINS } = await import(pathToFileURL(path.join(ICI, 'blockskins-actif.js')).href);

const ROLLS = String(BLOCKROLLS_DEPLOIEMENT.adresse).toLowerCase(), SKINS = String(BLOCKSKINS).toLowerCase();
const AUTRE = '0x' + 'de'.repeat(20), USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const W1 = '0x' + '12'.repeat(19) + 'ab', W2 = '0x' + '34'.repeat(20), W3 = '0x' + '56'.repeat(20);
const tA = (a) => '0x' + '0'.repeat(24) + a.slice(2);
const u = (x) => BigInt(x).toString(16).padStart(64, '0');
const hx = (n) => '0x' + n.toString(16);
const txh = (k) => '0x' + k.toString(16).padStart(64, '0');
const T = {
  rolled: topic('Rolled(uint256,address,uint8[5],uint256,bool,uint256,uint256)'), settled: topic('Settled(uint256,address,bytes32,uint8[5],uint8,uint256,uint256)'),
  pass: topic('PassBought(address,uint32,uint32,uint64,uint256,uint256)'), minted: topic('SkinMinted(uint256,address,address,uint64)'),
  listed: topic('Listed(uint256,address,address,uint256,uint64)'), bid: topic('Bid(uint256,address,uint256,uint64)'), sold: topic('Sold(uint256,address,address,address,uint256,uint256)'),
};
const BASE = 1000000;
function fauxLogs() {
  return [
    /* bloc BASE : W1 roule (rollId 7, cible 52 771 493, paye 0.25 + 0.25) */
    { address: ROLLS, topics: [T.rolled, '0x' + u(7), tA(W1)], data: '0x' + [1, 2, 3, 4, 5].map(u).join('') + u(52771493) + u(0) + u(250000) + u(250000), blockNumber: hx(BASE), logIndex: '0x0', transactionHash: txh(1) },
    /* bloc BASE+2 : le roll 7 est regle : 3/5, +1.00 USDC */
    { address: ROLLS, topics: [T.settled, '0x' + u(7), tA(W1)], data: '0x' + u(0xabc) + [1, 2, 3, 0, 0].map(u).join('') + u(3) + u(1000000) + u(5000000), blockNumber: hx(BASE + 2), logIndex: '0x1', transactionHash: txh(2) },
    /* bloc BASE+3 : W2 achete le Week pass, 10 USDC */
    { address: ROLLS, topics: [T.pass, tA(W2), '0x' + u(20379)], data: '0x' + u(30) + u(1792400000) + u(10000000) + u(5000000), blockNumber: hx(BASE + 3), logIndex: '0x0', transactionHash: txh(3) },
    /* bloc BASE+4 : skin #12 mintee par W3 pour le block 0xb2…, listee en USDC, enchere de W2 a 1.05 USDC, vendue a W2 */
    { address: SKINS, topics: [T.minted, '0x' + u(12), tA(W3), tA('0xb2000000000000000000007afa7ed748b0874f27')], data: '0x' + u(123), blockNumber: hx(BASE + 4), logIndex: '0x0', transactionHash: txh(4) },
    { address: SKINS, topics: [T.listed, '0x' + u(12), tA(W3)], data: '0x' + u(USDC) + u(1000000) + u(0), blockNumber: hx(BASE + 4), logIndex: '0x1', transactionHash: txh(4) },
    { address: SKINS, topics: [T.bid, '0x' + u(12), tA(W2)], data: '0x' + u(1050000) + u(1792400000), blockNumber: hx(BASE + 5), logIndex: '0x0', transactionHash: txh(5) },
    { address: SKINS, topics: [T.sold, '0x' + u(12), tA(W3), tA(W2)], data: '0x' + u(USDC) + u(1050000) + u(105000), blockNumber: hx(BASE + 6), logIndex: '0x0', transactionHash: txh(6) },
    /* ⛔ le MEME Rolled emis par un AUTRE contrat : pas le notre -> ignore */
    { address: AUTRE, topics: [T.rolled, '0x' + u(8), tA(W3)], data: '0x' + [1, 2, 3, 4, 5].map(u).join('') + u(1) + u(0) + u(250000) + u(250000), blockNumber: hx(BASE + 7), logIndex: '0x0', transactionHash: txh(7) },
    /* ⛔ un topic de skin emis par BlockRolls : pas son evenement -> ignore */
    { address: ROLLS, topics: [T.sold, '0x' + u(13), tA(W3), tA(W2)], data: '0x' + u(USDC) + u(1) + u(0), blockNumber: hx(BASE + 7), logIndex: '0x1', transactionHash: txh(8) },
    /* ⛔ un wallet mal encode (octets hauts non nuls) -> illisible, ignore */
    { address: ROLLS, topics: [T.pass, '0x' + 'ff'.repeat(12) + W3.slice(2), '0x' + u(20379)], data: '0x' + u(30) + u(1) + u(10000000) + u(0), blockNumber: hx(BASE + 8), logIndex: '0x0', transactionHash: txh(9) },
    /* ⛔ le DOUBLON exact du Settled (meme tx, meme logIndex) -> une ligne */
    { address: ROLLS, topics: [T.settled, '0x' + u(7), tA(W1)], data: '0x' + u(0xabc) + [1, 2, 3, 0, 0].map(u).join('') + u(3) + u(1000000) + u(5000000), blockNumber: hx(BASE + 2), logIndex: '0x1', transactionHash: txh(2) },
  ];
}

async function serieA(M, nom) {
  const t0 = 1792300000;
  const horo = (b) => t0 + (b - BASE) * 2;
  const r = M.lireEvenementsJeu(fauxLogs(), { rolls: ROLLS, skins: SKINS }, { horodatage: horo, devises: { [USDC]: { sym: 'USDC', dec: 6 } } });
  const k = r.evenements.map((e) => e.kind).join(',');
  ok(k === 'roll,settled,pass,skin_minted,skin_bid,skin_sold', nom + ' : 6 evenements lus dans l ordre de la chaine (lus : ' + k + ')');
  ok(!r.evenements.some((e) => e.tx === txh(7) || e.tx === txh(8)), nom + ' : un log d un autre contrat (ou d un autre evenement du contrat) est ignore');
  ok(!r.evenements.some((e) => e.tx === txh(9)) && r.illisibles >= 1, nom + ' : un wallet mal encode est ignore et compte illisible (' + r.illisibles + ')');
  ok(r.evenements.filter((e) => e.tx === txh(2)).length === 1, nom + ' : le doublon (tx, logIndex) ne fait qu une ligne');
  const st = r.evenements.find((e) => e.kind === 'settled');
  ok(st && st.text === '0x1212…12ab rolled 3/5 on block 52,771,493 · +1.00 USDC' && st.wallet === W1 && st.t === (t0 + 4) * 1000 && st.id === txh(2) + ':1', nom + ' : Settled -> « ' + (st && st.text) + ' », date du bloc, id tx:logIndex');
  ok(r.evenements[0].text === '0x1212…12ab rolled on block 52,771,493 · 0.50 USDC', nom + ' : Rolled paye -> ' + r.evenements[0].text);
  ok(r.evenements.find((e) => e.kind === 'pass').text === '0x3434…3434 bought a Week pass · 10.00 USDC', nom + ' : PassBought');
  ok(r.evenements.find((e) => e.kind === 'skin_bid').text === '0x3434…3434 bid on skin #12 · 1.05 USDC', nom + ' : Bid ecrit la devise vue au Listed');
  ok(r.evenements.find((e) => e.kind === 'skin_sold').text === '0x3434…3434 bought skin #12 · 1.05 USDC' && r.evenements.find((e) => e.kind === 'skin_sold').wallet === W2, nom + ' : Sold -> l acheteur');
  ok(r.evenements.find((e) => e.kind === 'skin_minted').skinBlock === '0xb2000000000000000000007afa7ed748b0874f27', nom + ' : SkinMinted garde le block de la skin');
  /* sans la devise (Listed hors fenetre) : pas de chiffre invente */
  const sansListed = M.lireEvenementsJeu(fauxLogs().filter((l) => l.topics[0] !== T.listed), { rolls: ROLLS, skins: SKINS }, { horodatage: horo, devises: { [USDC]: { sym: 'USDC', dec: 6 } } });
  ok(sansListed.evenements.find((e) => e.kind === 'skin_bid').text === '0x3434…3434 bid on skin #12', nom + ' : Bid sans devise vue -> aucun montant');
  /* sans adresse skins : les logs skins ne sont pas lus */
  ok(M.lireEvenementsJeu(fauxLogs(), { rolls: ROLLS, skins: null }, { horodatage: horo }).evenements.every((e) => !e.kind.startsWith('skin')), nom + ' : sans adresse BlockSkins, rien de skins');
  /* sans horodatage : rien n est date au hasard */
  const sh = M.lireEvenementsJeu(fauxLogs(), { rolls: ROLLS, skins: SKINS }, { horodatage: (b) => (b === BASE + 3 ? null : horo(b)) });
  ok(sh.sansHeure === 1 && !sh.evenements.some((e) => e.kind === 'pass'), nom + ' : un bloc sans horodatage -> sansHeure 1, pas de ligne');
  /* fusion : plus recent d abord, de-doublonne, plafond, filtre du jour */
  const f = M.fusionnerJournal(r.evenements, r.evenements, { depuisMs: 0 });
  ok(f.length === 6 && f[0].kind === 'skin_sold' && f[5].kind === 'roll', nom + ' : fusion de-doublonnee, du plus recent au plus ancien');
  const beaucoup = Array.from({ length: 150 }, (_, i) => ({ id: 'x' + i, t: 1000 + i, kind: 'practice', wallet: null, text: 'p', baseBlock: null, logIndex: null }));
  const fc = M.fusionnerJournal([], beaucoup, {});
  ok(fc.length === 100 && fc[0].t === 1149 && M.JOURNAL_MAX === 100, nom + ' : plafond 100, les plus recents gardes');
  ok(M.fusionnerJournal(r.evenements, [], { depuisMs: (t0 + 5) * 1000 }).length === 4, nom + ' : seul ce qui date d apres `depuisMs` reste');
  ok(M.fusionnerJournal([], [{ id: 'z', t: 1, kind: 'jackpot', wallet: null, text: 'x' }], {}).length === 0, nom + ' : un genre inconnu est refuse');
  /* avecBlocks */
  const ab = M.avecBlocks(f, (w) => (w === W1 ? '0xb2' + '00'.repeat(19) : null));
  ok(ab.find((e) => e.kind === 'settled').block === '0xb2' + '00'.repeat(19) && ab.find((e) => e.kind === 'pass').block === null && f.every((e) => e.block === null), nom + ' : avecBlocks pose le block du createur, sans muter');
  /* practice */
  const p = M.evenementsPractice([{ t: 5, bloc: 52771493, score: 3 }, { t: 6, bloc: 0, score: 3 }, { t: 7, bloc: 1, score: 9 }]);
  ok(p.length === 1 && p[0].kind === 'practice' && p[0].wallet === null && p[0].text === 'Practice roll · 3/5 on block 52,771,493', nom + ' : practice (forme fausse ignoree)');
  ok(M.GENRES.includes('duel') && M.SOURCE_DUELS === null, nom + ' : crochet des duels type, sans source (aucune donnee inventee)');
}

console.log('— A. module pur');
await serieA(await import(pathToFileURL(path.join(ICI, 'journal-jeu.js')).href + '?v=a'), 'A');

/* ── D (module). Mutants sur COPIES : le module et ses deux dependances copies dans un dossier temporaire ── */
console.log('— D. mutants du module (copies)');
const srcJ = fs.readFileSync(path.join(ICI, 'journal-jeu.js'), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-journal-mut-'));
/* la copie mutee importe les dependances ORIGINALES par URL absolue : seul le module mute vit dans le dossier temporaire */
const versOriginaux = (s) => s.replace(/from '\.\/([^']+)'/g, (_, f) => "from '" + pathToFileURL(path.join(ICI, f)).href + "'");
const MUTANTS = [
  ['adresse du contrat ignoree', 'const deRolls = rolls !== null && adr === rolls && TOPICS_ROLLS.includes(t0);', 'const deRolls = TOPICS_ROLLS.includes(t0);'],
  ['de-doublonnage retire', 'if (valide(e) && e.t >= depuisMs && !parId.has(e.id)) parId.set(e.id, e);', 'if (valide(e) && e.t >= depuisMs) parId.set(e.id + Math.random(), e);'],
  ['ordre inverse', 'sort((a, b) => b.t - a.t ||', 'sort((a, b) => a.t - b.t ||'],
  ['plafond retire', '.slice(0, Math.max(0, max));', ';'],
  ['wallet sans controle d encodage', "if (!/^0x0{24}[0-9a-f]{40}$/.test(h)) return null;", "if (!/^0x[0-9a-f]{64}$/.test(h)) return null;"],
  ['sans horodatage date quand meme', "if (!Number.isSafeInteger(s) || s <= 0) { sansHeure++; continue; }", ''],
];
let k = 0;
for (const [nom, de, a] of MUTANTS) {
  if (!srcJ.includes(de)) { ok(false, 'ancre du mutant absente : ' + nom); continue; }
  const f = path.join(tmp, 'journal-jeu-m' + (++k) + '.js');
  fs.writeFileSync(f, versOriginaux(srcJ.replace(de, a)));
  const avant = ko, avantN = n, err = console.error;
  console.error = () => {};
  try { await serieA(await import(pathToFileURL(f).href), 'mutant ' + k); } catch (_) { ko++; }
  console.error = err;
  const rouge = ko > avant;
  ko = avant; n = avantN;
  ok(rouge, 'MUTANT SURVIVANT : ' + nom);
}
fs.rmSync(tmp, { recursive: true, force: true });
ok(fs.readFileSync(path.join(ICI, 'journal-jeu.js'), 'utf8') === srcJ, 'le module sur disque est intact apres les mutants');

/* ── C. le cablage de l app (lecture) ── */
console.log('— C. cablage app');
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
const cmd = fs.readFileSync(path.join(ICI, 'commandes-panel.js'), 'utf8');
function verifierApp(h) {
  const r = [];
  const v = (c, m) => { if (!c) r.push(m); };
  const iP = h.indexOf('async function peindreJournalMap() {');
  const finP = iP > 0 ? h.slice(iP).search(/\n\}\n/) : -1; /* portable : pas d ancre de position litterale */
  const p = iP > 0 && finP > 0 ? h.slice(iP, iP + finP) : '';
  v(iP > 0, 'peindreJournalMap absente');
  v(/^async function peindreJournalMap\(\) \{\n  if \(!mapVisible\(\) \|\| journalEnCours\) return;/.test(p), 'la garde de visibilite ouvre peindreJournalMap');
  v(p.indexOf('if (!mapVisible()') >= 0 && p.indexOf('if (!mapVisible()') < p.indexOf('lireJournal('), 'la garde precede la lecture');
  const ms = /const JOURNAL_MAP_MS = (\d+);/.exec(h);
  v(ms && Number(ms[1]) >= 20000 && Number(ms[1]) <= 30000, 'JOURNAL_MAP_MS entre 20 et 30 s');
  v(/setInterval\(\(\) => \{ if \(mapVisible\(\)\) void peindreJournalMap\(\); \}, JOURNAL_MAP_MS\);/.test(h), 'minuteur garde par mapVisible');
  v(/if \(nom === 'map'\) void peindreJournalMap\(\);/.test(h), 'ouvrir la Map relit le journal');
  v(/<button type="button" class="bMasquer bJournal" id="bJourMap" aria-expanded="false" aria-controls="journalMap" hidden>Today<\/button>/.test(h), 'bouton Today cache par defaut, ferme');
  v(/<div class="journalMap" id="journalMap" hidden>/.test(h), 'liste fermee par defaut');
  v(/\$\('#bJourMap'\)\.hidden = !journal\.length;/.test(h), 'le bouton n apparait que s il y a des evenements (pas de bouton mort)');
  v(h.split('id="bJourMap"').length === 2 && h.split('id="journalMap"').length === 2 && h.split('id="journalCarte"').length === 2, 'ids du journal uniques dans la page');
  v(/onde\(cible, accentVif\(\), motJournal\(e\)\)/.test(p) && /h\.el\.classList\.add\('pulse'\)/.test(p), 'onde + pulse transitoires sur le block du wallet');
  v(/e\.kind === 'practice'\) continue;/.test(p), 'les practice restent a peindreRollsMap (pas de double onde)');
  v(/neufs\.slice\(0, 3\)/.test(p), 'au plus 3 ondes par passage');
  v(!/liveEvts|cleEvtLive|lireLive/.test(p), 'le journal ne touche pas le fil Live');
  const b1 = h.indexOf('</div>', h.indexOf('<div class="jeuBandeau"'));
  const iC = h.indexOf('<div class="carte" id="journalCarte" hidden>');
  v(iC > b1 && iC < h.indexOf('<div class="carte" id="tirCarte">'), 'carte Today du Game sous les tuiles, avant le tirage');
  v(/function peindreJournalJeu\(\) \{[\s\S]*?journal\.slice\(0, 10\)/.test(h), 'la carte Game montre les 10 derniers');
  v(/if \(c\.type === 'log'\) \{ void bcCommandeLog\(\); return true; \}/.test(h) && /async function bcCommandeLog\(\) \{[\s\S]*?journal\.slice\(0, 10\)/.test(h), 'commande log : les 10 derniers dans le Chat');
  v(/fetch\('\/api\/jeu\/journal'/.test(h), 'lit /api/jeu/journal');
  return r;
}
const fautes = verifierApp(html);
ok(fautes.length === 0, 'app : ' + (fautes.join(' ; ') || 'cablage complet'));
/* integration 2026-10-18 : la commande vit dans la TABLE COMMANDES (palette Ctrl+K et chat lisent la meme) */
ok(/cle: 'log', lire: \(t\) => \(\/\^\(log\|today\)\$\/i\.test\(t\) \? \{ ok: true, commande: \{ type: 'log' \} \} : null\)/.test(cmd) && /'log · today /.test(cmd), 'commandes-panel : log / today analyses (table COMMANDES) et dans l aide');
const MUTANTS_APP = [
  ['garde de visibilite retiree', 'if (!mapVisible() || journalEnCours) return;', 'if (journalEnCours) return;'],
  ['minuteur sans visibilite', 'setInterval(() => { if (mapVisible()) void peindreJournalMap(); }, JOURNAL_MAP_MS);', 'setInterval(() => { void peindreJournalMap(); }, JOURNAL_MAP_MS);'],
  ['liste ouverte par defaut', '<div class="journalMap" id="journalMap" hidden>', '<div class="journalMap" id="journalMap">'],
  ['bouton toujours la', "$('#bJourMap').hidden = !journal.length;", "$('#bJourMap').hidden = false;"],
  ['relecture a 2 s', /const JOURNAL_MAP_MS = \d+;/, 'const JOURNAL_MAP_MS = 2000;'],
  ['commande log retiree', "if (c.type === 'log') { void bcCommandeLog(); return true; }", ''],
];
for (const [nom, de, a] of MUTANTS_APP) {
  const m = typeof de === 'string' ? (html.includes(de) ? html.replace(de, a) : null) : (de.test(html) ? html.replace(de, a) : null);
  ok(m !== null && verifierApp(m).length > 0, 'MUTANT APP SURVIVANT (ou ancre absente) : ' + nom);
}

/* ── B. l endpoint, vrai serveur, faux noeud ── */
console.log('— B. endpoint (serveur local, faux noeud)');
const HEAD = BASE + 40;
const nowS = Math.floor(Date.now() / 1000);
const noeud = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => { b += c; });
  req.on('end', () => {
    let id = 1, m = '', p = []; try { const j = JSON.parse(b); id = j.id; m = j.method; p = j.params || []; } catch (_) {}
    let result = '0x';
    if (m === 'eth_blockNumber') result = hx(HEAD);
    else if (m === 'eth_getBlockByNumber') { const num = parseInt(p[0], 16) || HEAD; result = { number: hx(num), hash: '0x' + 'ab'.repeat(32), timestamp: hx(nowS - (HEAD - num) * 2) }; }
    else if (m === 'eth_getLogs') {
      /* le journal lit les DEUX contrats en une requete (address = tableau) : lui seul recoit les faux logs, a chaque fenetre */
      const f = p[0] || {};
      const lo = parseInt(f.fromBlock, 16), hi = parseInt(f.toBlock, 16);
      result = Array.isArray(f.address) && f.address.map((x) => String(x).toLowerCase()).includes(ROLLS)
        ? fauxLogs().filter((l) => { const bn = parseInt(l.blockNumber, 16); return bn >= lo && bn <= hi; }).concat(fauxLogs().filter((l) => l.transactionHash === txh(2))) : [];
    } else if (m === 'eth_chainId') result = '0x2105';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));
  });
});
await new Promise((o) => noeud.listen(0, '127.0.0.1', o));
const urlNoeud = 'http://127.0.0.1:' + noeud.address().port;
const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-journal-'));
const port = 30000 + Math.floor(Math.random() * 15000);
const enfant = spawn(process.execPath, [path.join(ICI, 'serveur-web.js')], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: urlNoeud, BASE_RPC_LECTURE: urlNoeud, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '', TB_REPLIS: '0', TB_JOURNAL_PREMIER_MS: '1500' } });
let stderr = ''; enfant.stdout.on('data', () => {}); enfant.stderr.on('data', (c) => { stderr += c; });
const srv = 'http://127.0.0.1:' + port;
let demarre = false;
for (let i = 0; i < 120 && !demarre; i += 1) { try { demarre = (await fetch(srv + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await new Promise((o) => setTimeout(o, 500)); } }
ok(demarre, 'serveur demarre (port ' + port + ')' + (demarre ? '' : ' — ' + stderr.slice(0, 300)));
if (demarre) {
  await fetch(srv + '/api/jeu/roll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ bloc: 52771493, score: 4 }) });
  let j = null;
  for (let i = 0; i < 40; i++) {
    try { j = await (await fetch(srv + '/api/jeu/journal', { signal: AbortSignal.timeout(5000) })).json(); } catch (_) { j = null; }
    if (j && j.ok && Array.isArray(j.evenements) && j.evenements.some((e) => e.kind !== 'practice')) break;
    await new Promise((o) => setTimeout(o, 500));
  }
  const forme = j && j.ok === true && /^J\d{4}-\d{2}-\d{2}$/.test(j.jour) && typeof j.lu === 'string' && Number.isFinite(j.maintenant) && 'couvertureDepuis' in j && typeof j.couvreLaJournee === 'boolean'
    && Number.isSafeInteger(j.scanJusqua) && j.sources && j.sources.rolls === ROLLS && j.sources.duels === null && Array.isArray(j.evenements);
  ok(forme, 'GET /api/jeu/journal : la forme (ok, jour, lu, maintenant, couvertureDepuis, couvreLaJournee, scanJusqua, sources, evenements) — lu : ' + JSON.stringify(j && Object.keys(j)));
  if (forme) {
    const ev = j.evenements, kinds = ev.map((e) => e.kind).join(',');
    ok(ev.every((e) => ['id', 't', 'kind', 'wallet', 'block', 'text', 'tx'].every((c) => c in e)), 'chaque evenement porte { id, t, kind, wallet, block, text, tx }');
    ok(ev.filter((e) => e.tx === txh(2)).length === 1, 'le Settled rendu a chaque fenetre (et en double) n apparait qu une fois');
    ok(!ev.some((e) => e.tx === txh(7) || e.tx === txh(8) || e.tx === txh(9)), 'aucun log d un autre contrat, ni mal encode');
    ok(ev.some((e) => e.kind === 'practice' && e.text === 'Practice roll · 4/5 on block 52,771,493'), 'le roll practice POSTe est dans le journal');
    ok(ev.every((x, i) => i === 0 || ev[i - 1].t >= x.t) && ev.length <= 100, 'du plus recent au plus ancien, au plus 100 (' + ev.length + ' : ' + kinds + ')');
    ok(['roll', 'settled', 'pass', 'skin_minted', 'skin_bid', 'skin_sold'].every((x) => kinds.includes(x)) || SKINS !== String(BLOCKSKINS).toLowerCase(), 'les 6 genres de chaine arrivent (' + kinds + ')');
  }
  const post = await fetch(srv + '/api/jeu/journal', { method: 'POST' });
  ok(post.status === 405, 'POST /api/jeu/journal -> 405 (lu : ' + post.status + ')');
}
enfant.kill(); noeud.close();
try { fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {}
console.log(n + ' assertions, ' + ko + ' KO');
console.log('NE PROUVE PAS : le rendu (navigateur), de vrais logs mainnet, la tenue sous les refus des noeuds publics.');
process.exitCode = ko ? 1 : 0;
