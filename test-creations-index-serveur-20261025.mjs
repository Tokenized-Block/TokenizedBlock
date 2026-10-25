/* test-creations-index-serveur-20261025.mjs — LES BORNES QUE LE VRAI SERVEUR PUBLIE NE PROMETTENT QUE CE QU IL A LU.
 *
 * ⛔⛔ REVUE ADVERSE DE 2855ce8 : le cote serveur qui publie les bornes (trous, non resolus, position du scan) n etait execute par
 *     AUCUN test — le mutant `trous: [...trousRattrapage], nonResolus: []` survivait a 9 tests sur 9. Or le navigateur CROIT ces
 *     bornes : tout bloc qu elles disent couvert, il ne le relit plus (creations-index.js). Une borne qui ment = un block qui
 *     disparait de la Wallet ou de la Map, sans un mot.
 * ⛔ CE BANC LANCE LE VRAI serveur-web.js (le depot, puis des COPIES mutees — jamais le depot mute) contre un RPC FICTIF qui sait
 *   exactement ce qu il a servi, avec un volume de laboratoire (trending-cache.json) qui declare : un trou du scan vers l avant, un
 *   trou du rattrapage, un createur non resolu, des faits de creation depuis un bloc donne. Puis il CONFRONTE ce que
 *   /api/blocks-de et /api/creations-recentes publient a la verite du laboratoire :
 *     (A) tout bloc que les bornes disent couvert (entre couvertDepuis/faitsDepuis et luJusqua, hors trousPlages) a ete LU —
 *         par le fichier de laboratoire (hors ses trous) ou par une requete reussie au RPC fictif ;
 *     (B) chaque creation de la chaine fictive dans cette zone est servie a la Map, avec son bloc et son symbole ;
 *     (C) le createur non resolu est publie ; (D) les blocks du createur portent leurs faits.
 *   Mutants (copies) : celui de la revue, un serveur qui SURESTIME la position de son scan, un `faitsDepuis` sous-estime, un scan
 *   vers l avant qui ne note plus les faits. Chacun DOIT rougir ; la copie NON mutee doit verdir (temoin du banc lui-meme).
 * ⚠️ NE PROUVE PAS : le comportement contre de vrais noeuds (quotas, archive), ni la relecture des trous par le noeud d archive
 *   (TB_REPLIS=0 : aucun noeud reel, archive comprise).
 * serie-delai-s: 400
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { strict as assert } from 'node:assert';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const { FACTORY, TOPIC_CREATED } = await import(pathToFileURL(path.join(ICI, 'index-blocks.js')).href);
const PREMIER = 50861088;
const T = 53_000_000, S = T - 3000; /* tete du RPC fictif ; le scan vers l avant du laboratoire s est arrete a S */
const CRE = '0x' + '31'.repeat(20);
const J = (k) => '0xb2' + '00'.repeat(9) + k.repeat(10);
const TX = (k) => '0x' + k.repeat(32);
const C = {
  NEW: { jeton: J('a1'), bloc: S + 500, sym: 'NEW', tx: TX('a1') },   /* lu par le scan vers l avant du serveur (apres S) */
  MID: { jeton: J('a2'), bloc: T - 10000, sym: 'MID', tx: TX('a2') }, /* lu par le laboratoire (faits + createur) */
  TROU: { jeton: J('a3'), bloc: T - 12000, sym: 'TRU', tx: TX('a3') }, /* dans un trou du scan vers l avant : JAMAIS lu */
  BAS: { jeton: J('a4'), bloc: T - 30000, sym: 'BAS', tx: TX('a4') }, /* sous faitsDepuis du laboratoire : createur connu, faits non */
  NR: { jeton: J('a5'), bloc: T - 15000, sym: 'NRS', tx: TX('a5') },  /* createur non resolu (sa tx ne se lit pas) */
};
const TROU_AVANT = { de: T - 12500, a: T - 11500 }, TROU_RATTRAPAGE = { de: T - 100000, a: T - 90000 };
const FAITS_DEPUIS = T - 20000;
const GRAINE = { ver: 'quote-v5', a: 0, corps: '', blocsLusJusqua: S, adrs: [C.MID.jeton, C.BAS.jeton], createurs: [[C.MID.jeton, CRE], [C.BAS.jeton, CRE]],
  createursRelecture20261009: true, createursRelecture20261010: true, trouSeme20261009: true, rattrapageDepuis: PREMIER,
  trousCreations: [{ ...TROU_AVANT, fenetres: 1, t: '2026-10-25T00:00:00Z' }], trousRelus: [], createursNonResolus: [{ jeton: C.NR.jeton, tx: C.NR.tx }],
  createursNonResolusJetes: 0, trousRattrapage: [{ ...TROU_RATTRAPAGE, pages: 1 }], trousRattrapageRelus: [],
  /* coherent avec le vrai serveur : un scan note les faits de TOUTE creation lue, createur resolu ou non (NR compris) */
  faitsCreations: [[C.MID.jeton, C.MID.bloc, C.MID.sym], [C.NR.jeton, C.NR.bloc, C.NR.sym]], faitsDepuis: FAITS_DEPUIS };
/* la verite du laboratoire : ce que le fichier declare lu (jusqu a S, hors ses trous) */
const luParLaGraine = (b) => b >= PREMIER && b <= S && !(b >= TROU_AVANT.de && b <= TROU_AVANT.a) && !(b >= TROU_RATTRAPAGE.de && b <= TROU_RATTRAPAGE.a);

const hx = (x) => '0x' + x.toString(16);
const pad = (h) => h.replace(/^0x/, '').padStart(64, '0');
const enc = (s) => pad(hx(s.length)) + Buffer.from(s).toString('hex').padEnd(64, '0');
const libre = () => new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); });
function rpcFictif() {
  const etat = { servies: [], serveur: null };
  const repondre = async (m, p) => {
    if (m === 'eth_blockNumber') return hx(T);
    if (m === 'eth_getLogs') {
      const q = p[0] || {}; const de = parseInt(q.fromBlock, 16), a = parseInt(q.toBlock, 16);
      if (String(q.address || '').toLowerCase() !== FACTORY) return [];
      etat.servies.push([de, a]);
      return Object.values(C).filter((c) => c.bloc >= de && c.bloc <= a).map((c) => ({ address: FACTORY,
        topics: [TOPIC_CREATED, '0x' + pad(c.jeton), '0x' + pad('0x0')], data: '0x' + pad(hx(96)) + pad(hx(160)) + pad(hx(18)) + enc('Lab') + enc(c.sym),
        blockNumber: hx(c.bloc), transactionHash: c.tx }));
    }
    if (m === 'eth_getTransactionByHash') { if (p[0] === C.NR.tx) throw new Error('internal error'); return { from: CRE, hash: p[0] }; }
    if (m === 'eth_getCode') return '0x';
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

const tmp = [];
async function copie(edits) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'tb-bornes-')); tmp.push(dir);
  /* fichiers du dossier racine SEULEMENT (le serveur n importe rien d un sous-dossier) : aucun lien vers le depot, donc le
   *   nettoyage ne peut rien atteindre hors de la copie. Un fichier transitoire disparu entre la liste et la copie est saute. */
  const entrees = (await fs.promises.readdir(ICI, { withFileTypes: true })).filter((f) => f.isFile() && !/\.mutant-\d+\.mjs$/.test(f.name));
  await Promise.all(entrees.map(async (f) => {
    try { await fs.promises.copyFile(path.join(ICI, f.name), path.join(dir, f.name)); } catch (e) { if (e && e.code === 'ENOENT') return; throw e; }
  }));
  for (const [fichier, de, vers] of edits) {
    const p = path.join(dir, fichier); const src = await fs.promises.readFile(p, 'utf8'); const n = src.split(de).length - 1;
    if (n !== 1) throw new Error('motif de mutant trouve ' + n + ' fois dans ' + fichier + ' (attendu 1) : ' + de);
    await fs.promises.writeFile(p, src.replace(de, vers));
  }
  return dir;
}

/* le vrai serveur de `dir`, volume de laboratoire, RPC fictif ; rend ce qu il publie une fois son scan vers l avant fait */
async function lancer(dir) {
  const rpc = rpcFictif(); const portRpc = await libre(); await new Promise((ok) => rpc.serveur.listen(portRpc, '127.0.0.1', ok));
  const port = await libre(); const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-bornes-vol-')); tmp.push(vol);
  fs.writeFileSync(path.join(vol, 'trending-cache.json'), JSON.stringify(GRAINE));
  const u = 'http://127.0.0.1:' + portRpc;
  const enfant = spawn(process.execPath, [path.join(dir, 'serveur-web.js')], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: u, BASE_RPC_LECTURE: u, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '',
      TB_SONDES: '0', TB_REPLIS: '0' } });
  let journal = '', mort = false; enfant.stdout.on('data', (d) => { journal += d; }); enfant.stderr.on('data', (d) => { journal += d; });
  enfant.on('exit', () => { mort = true; });
  const lire = (c) => fetch('http://127.0.0.1:' + port + c, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
  const t0 = Date.now(); let bd = null, cr = null, disque = null;
  try {
    while (Date.now() - t0 < 150000 && !mort) {
      try { bd = await lire('/api/blocks-de?adr=' + CRE); } catch { bd = null; }
      /* fin du premier scan vers l avant : lue au JOURNAL, pas aux bornes (un mutant peut les fausser) */
      if (bd && /\[trending\] scan done/.test(journal)) {
        /* le scan a avance ; on laisse la resolution des non resolus finir (elle echoue toujours ici), puis on lit la Map */
        await new Promise((ok) => setTimeout(ok, 1500));
        bd = await lire('/api/blocks-de?adr=' + CRE);
        cr = await lire('/api/creations-recentes?depuis=' + (T - 43200));
        /* la sauvegarde part a la FIN de la passe (apres les lectures de marche) : on attend que le fichier porte NEW, 60 s au plus */
        for (const t1 = Date.now(); Date.now() - t1 < 60000 && !mort; await new Promise((ok) => setTimeout(ok, 500))) {
          try { disque = JSON.parse(fs.readFileSync(path.join(vol, 'trending-cache.json'), 'utf8')); } catch { disque = null; }
          if (disque && Array.isArray(disque.faitsCreations) && disque.faitsCreations.some((e) => e[0] === C.NEW.jeton)) break;
        }
        break;
      }
      await new Promise((ok) => setTimeout(ok, 400));
    }
  } finally {
    enfant.kill('SIGKILL'); await new Promise((ok) => rpc.serveur.close(ok));
    if (!mort) await new Promise((ok) => { enfant.once('exit', ok); setTimeout(ok, 10000).unref?.(); });
  }
  return { bd, cr, disque, servies: rpc.servies, journal };
}

/* les verifications ; rend la liste des ROUGES (identifiants) */
function verifier({ bd, cr, disque, servies }) {
  const rouges = []; const v = (id, ok) => { if (!ok) rouges.push(id); };
  v('V0 le serveur a publie ses bornes et ses creations', !!(bd && bd.ok && cr && cr.ok));
  if (!(bd && bd.ok && cr && cr.ok)) return rouges;
  const lu = (b) => luParLaGraine(b) || servies.some(([de, a]) => b >= de && b <= a);
  const dansTrou = (b) => (bd.trousPlages || []).some((t) => b >= t.de && b <= t.a);
  const debut = Math.max(T - 43200, bd.couvertDepuis ?? Infinity, bd.faitsDepuis ?? Infinity);
  /* (A) chaque bloc dit couvert a ete lu — on balaye la zone par pas de 50 (les plages du laboratoire sont des multiples de 500) et les bornes exactes */
  const points = new Set([debut, bd.luJusqua, TROU_AVANT.de, TROU_AVANT.a, T, T + 1]);
  for (let b = debut; b <= (bd.luJusqua ?? debut - 1); b += 50) points.add(b);
  const nonLus = [...points].filter((b) => Number.isSafeInteger(b) && b >= debut && b <= bd.luJusqua && !dansTrou(b) && !lu(b));
  v('A1 tout bloc dit couvert a ete LU (premier non lu : ' + (nonLus.sort((x, y) => x - y)[0] ?? '-') + ')', nonLus.length === 0);
  v('A2 la position publiee du scan ne depasse pas la tete du RPC', bd.luJusqua <= T);
  v('A3 les deux trous (scan vers l avant, rattrapage) sont publies', [TROU_AVANT, TROU_RATTRAPAGE].every((t) => dansTrou(t.de) && dansTrou(t.a)));
  v('A4 bornes non tronquees et faitsDepuis publie', bd.trousTronques === false && bd.nonResolusTronques === false && Number.isSafeInteger(bd.faitsDepuis));
  v('A5 faitsDepuis et les faits du fichier sont RELUS au demarrage (pas remis a la tete)', bd.faitsDepuis === FAITS_DEPUIS
    && (cr.creations || []).some((x) => x.jeton === C.MID.jeton && x.symbole === C.MID.sym));
  /* (B) la Map : chaque creation de la chaine fictive dans la zone dite couverte avec faits est servie, bloc et symbole justes */
  const zone = (b) => b >= debut && b <= bd.luJusqua && !dansTrou(b);
  const manquent = Object.values(C).filter((c) => zone(c.bloc) && !(cr.creations || []).some((x) => x.jeton === c.jeton && x.bloc === c.bloc && x.symbole === c.sym));
  v('B1 la Map recoit chaque creation de la zone couverte (manquent : ' + manquent.map((c) => c.sym).join(',') + ')', manquent.length === 0);
  v('B2 creations servies du plus recent au plus ancien, non tronquees', cr.tronque === false
    && (cr.creations || []).every((c, i, a) => i === 0 || a[i - 1].bloc >= c.bloc));
  v('B3 une creation lue par le scan porte aussi decimales et nom (le fil Live lit les decimales d un montant)',
    (cr.creations || []).some((x) => x.jeton === C.NEW.jeton && x.decimales === 18 && x.nom === 'Lab'));
  /* (S) la sauvegarde : faits (NEW lu par le scan, MID relu du fichier) et faitsDepuis, sinon le prochain demarrage repart de la tete */
  v('S1 la sauvegarde ecrit les faits et faitsDepuis', !!disque && disque.faitsDepuis === FAITS_DEPUIS
    && [C.NEW, C.MID].every((c) => (disque.faitsCreations || []).some((e) => e[0] === c.jeton && e[1] === c.bloc && e[2] === c.sym)));
  /* (C) le createur non resolu */
  v('C1 le createur non resolu est publie (avec sa tx)', (bd.nonResolus || []).some((c) => c.jeton === C.NR.jeton && c.tx === C.NR.tx));
  /* (D) les blocks du createur et leurs faits */
  v('D1 les blocks du createur portent bloc et symbole (NEW lu par le scan, MID par le laboratoire)',
    ['NEW', 'MID'].every((k) => bd.blocks.includes(C[k].jeton) && bd.faits && bd.faits[C[k].jeton] && bd.faits[C[k].jeton].bloc === C[k].bloc && bd.faits[C[k].jeton].symbole === C[k].sym));
  return rouges;
}

const MUTANTS = [
  { nom: 'm1 (revue) les trous du scan vers l avant et les non resolus ne partent plus',
    edits: [['serveur-web.js', 'trous: [...trousCreations, ...trousRattrapage], nonResolus: createursNonResolus, faitsDepuis });', 'trous: [...trousRattrapage], nonResolus: [], faitsDepuis });']],
    casse: [/^A1 /, /^A3 /, /^C1 /] },
  { nom: 'm2 position du scan SURESTIMEE (+5 000 blocs)',
    edits: [['serveur-web.js', 'return bornesIndex({ blocsLusJusqua, rattrapageDepuis,', 'return bornesIndex({ blocsLusJusqua: blocsLusJusqua === null ? null : blocsLusJusqua + 5000, rattrapageDepuis,']],
    casse: [/^A1 /, /^A2 /] },
  { nom: 'm3 faitsDepuis SOUS-ESTIME (faits annonces la ou il n y en a pas)',
    edits: [['serveur-web.js', 'nonResolus: createursNonResolus, faitsDepuis });', 'nonResolus: createursNonResolus, faitsDepuis: faitsDepuis === null ? null : faitsDepuis - 100000 });']],
    casse: [/^B1 /] },
  { nom: 'm4 le scan vers l avant ne note plus les faits',
    edits: [['serveur-web.js', 'noterFaits(cr.creations, fin); /*', 'void (cr.creations, fin); /*']],
    casse: [/^B1 /, /^D1 /] },
  /* les aides sont appelees sous `typeof` (des bancs extraient ces fonctions sans elles) : une aide renommee serait sautee EN SILENCE */
  { nom: 'm5 la relecture des faits au demarrage est sautee (aide renommee)',
    edits: [['serveur-web.js', "if (typeof chargerFaits === 'function') chargerFaits(x);", "if (typeof chargerFaitsX === 'function') chargerFaits(x);"]],
    casse: [/^A5 /] },
  { nom: 'm6 la sauvegarde n ecrit plus les faits (aide renommee)',
    edits: [['serveur-web.js', "...(typeof faitsPourDisque === 'function' ? faitsPourDisque() : {}),", "...(typeof faitsPourDisqueX === 'function' ? faitsPourDisque() : {}),"]],
    casse: [/^S1 /] },
];

let echecs = 0;
const dire = (ok, m) => { console.log((ok ? 'ok   ' : 'ROUGE ') + m); if (!ok) echecs++; };
try {
  const voies = [{ nom: 'depot', dir: ICI, mutant: null }, { nom: 'copie non mutee', dir: await copie([]), mutant: null },
    ...await Promise.all(MUTANTS.map(async (m) => ({ nom: m.nom, dir: await copie(m.edits), mutant: m })))];
  const res = await Promise.all(voies.map(async (x) => ({ ...x, r: await lancer(x.dir) })));
  for (const x of res) {
    const rouges = verifier(x.r);
    if (!x.mutant) {
      dire(rouges.length === 0, x.nom + ' : ' + (rouges.length ? 'ROUGES ' + rouges.join(' | ') : 'tout vert'));
      if (rouges.length) console.log('   fin du journal : ' + x.r.journal.slice(-600).replace(/\s+/g, ' '));
    } else {
      const manquants = x.mutant.casse.filter((re) => !rouges.some((id) => re.test(id)));
      dire(rouges.length > 0 && manquants.length === 0, 'mutant ' + x.nom + ' : ' + rouges.length + ' rouge(s) — ' + rouges.join(' | ')
        + (manquants.length ? ' ; NE CASSE PAS ' + manquants.join(', ') : ''));
    }
  }
} finally {
  for (const d of tmp) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* Windows : un dossier encore tenu part plus tard */ } }
}
assert.equal(echecs, 0, echecs + ' echec(s)');
console.log('ok creations-index-serveur — vrai serveur, bornes confrontees a ce qu il a lu ; ' + MUTANTS.length + ' mutants tues');
