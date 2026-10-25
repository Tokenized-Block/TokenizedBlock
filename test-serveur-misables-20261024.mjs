/* test-serveur-misables-20261024.mjs — CE QUE LE VRAI SERVEUR SERT SUR /api/misables. serveur-web.js est LANCE contre un faux noeud local
 *   qui REJOUE le bloc 53 048 993 de mesures/misables-live-20261025.json (2026-10-25 ; avant : bloc 53 031 600 du 24/10) : pour chaque pool candidate, son slot0, l USDC qu elle tient et
 *   factory() ; pour le quoter CL, le montantIn MESURE a chaque taille (une taille non cotee ce jour-la : revert). Une seule entorse,
 *   voulue : la pool TSLAc repond factory() = la NOUVELLE factory (injoignable par notre routeur).
 * AFFIRME : (1) /api/misables sert ok:true, la regle (1 %, 10 000 USDC, 30 blocs, tailles 0,50/5/10) et une ligne par jeton ;
 *   (2) les ecarts servis sont ceux de la mesure (NVDAc 5/5/5 bps) et les codes ceux de la regle (BILIc ECART, HSAIc 0,50 seulement,
 *   TSLAc ROUTE_INJOIGNABLE) ; le nombre de misables a 0,50 et chaque ligne a chaque taille = un ORACLE calcule sur l enregistrement
 *   sans misables.js (TSLAc retire) ; (3) le nombre d appels de chaine reste sous
 *   appelsMax, et une deuxieme requete dans les 60 s est servie du CACHE (aucun nouvel appel au quoter) ; (4) misables.js est servi (200).
 * SERVEUR_MODULE : le chemin d une copie de serveur-web.js. ⛔ PORTABLE : process.exitCode.
 * NE PROUVE PAS : le comportement contre un vrai noeud (mesure-misables-20261024.mjs et banc-misables-fork-20261024.mjs le font).
 * serie-delai-s: 240 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const { selecteur } = await import(pathToFileURL(path.join(ICI, 'keccak.js')).href);
const M = await import(pathToFileURL(path.join(ICI, 'misables.js')).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const bas = (x) => String(x || '').toLowerCase();
/* 2026-10-25 : RE-BASE sur l enregistrement du 25/10 (mesure-misables-20261024.mjs relancee : mesures/misables-live-20261025.json,
 *   bloc 53 048 993). Celui du 24/10 n a pas les pools de SANc / SEc / NOKc / LIc (entrees au registre le 25/10) : son « 19 » ne decrit
 *   plus la liste des candidats d aujourd hui. */
const J = JSON.parse(fs.readFileSync(path.join(ICI, 'mesures', 'misables-live-20261025.json'), 'utf8'));
/* L ATTENDU, DERIVE DE L ENREGISTREMENT par un oracle qui n utilise PAS misables.js : ecart <= 100 bps, USDC de la pool >= 10 000 USDC,
 *   factory = celle de notre routeur (l entorse : la pool TSLAc repond la nouvelle factory). SANS reference : le serveur de ce banc ne lit
 *   la pool du Market que par le faux noeud, qui ne connait pas les pools du Market (slot0 = 0 : reference non lue, non jugee).
 *   Un candidat dont la pool n est pas dans l enregistrement : « non mesure dans cet enregistrement », jamais misable. */
const VIEILLE = bas(J.factoryAerodromeCl);
const ORACLE = new Map(), NON_MESURES = [];
for (const c of M.CANDIDATS_CL) {
  const t = J.table.find((x) => x.jeton === c.jeton);
  const r = t && t.routes.find((x) => x.route === 'aerodrome-cl' && x.pool === c.pool);
  if (!r) NON_MESURES.push(c.symbole);
  const k = [0, 1, 2].map((i) => {
    const d = r && r.devis && r.devis[i];
    return !!d && d.ok === true && c.symbole !== 'TSLAc' && bas(r.factory) === VIEILLE && Number(d.ecartBps) <= 100 && BigInt(r.usdcPool || 0) >= 10000000000n;
  });
  ORACLE.set(c.jeton, (ORACLE.get(c.jeton) || [false, false, false]).map((v, i) => v || k[i]));
}
const ATTENDU_050 = [...ORACLE.values()].filter((v) => v[0]).length;
/* sans l entorse, TSLAc serait-il misable dans l enregistrement ? (sinon l entorse ne retire rien et son assertion est vide) */
const tslaT = J.table.find((x) => x.symbole === 'TSLAc'), tslaR = tslaT && tslaT.routes.find((x) => x.route === 'aerodrome-cl' && x.tickSpacing === 10);
const TSLA_MISABLE_SANS_ENTORSE = !!tslaR && tslaR.devis[0].ok && tslaR.devis[0].ecartBps <= 100 && BigInt(tslaR.usdcPool) >= 10000000000n;

/* le rejeu : pool -> etat ; (jetonIn, ts, montant) -> montantIn */
const POOLS = new Map(), DEVIS = new Map();
for (const t of J.table) for (const r of t.routes) if (r.route === 'aerodrome-cl') {
  POOLS.set(r.pool, { sqrtP: r.sqrtPriceX96 || '0', usdc: r.usdcPool || '0' });
  for (const d of r.devis || []) if (d.ok) DEVIS.set(bas(r.jetonIn) + '|' + r.tickSpacing + '|' + d.usdc, d.montantIn);
}
const TSLA = M.CANDIDATS_CL.find((c) => c.symbole === 'TSLAc');
const SEL = { q: selecteur(M.SIG.quoteExactOutputSingle), slot0: selecteur('slot0()'), factory: selecteur('factory()'), bal: selecteur('balanceOf(address)') };
const compte = { quoter: 0, misables: 0 };
function noeud() {
  return http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      let j = {}; try { j = JSON.parse(b); } catch (_) {}
      const un = (q) => {
        const m = q.method, p = q.params || [];
        const r = (result) => ({ jsonrpc: '2.0', id: q.id, result }), err = () => ({ jsonrpc: '2.0', id: q.id, error: { code: -32000, message: 'execution reverted' } });
        if (m === 'eth_chainId') return r('0x2105');
        if (m === 'eth_blockNumber') return r('0x' + J.bloc.toString(16));
        if (m === 'eth_getLogs') return r([]);
        if (m === 'eth_getBlockByNumber') return r({ number: '0x' + J.bloc.toString(16), hash: '0x' + 'ab'.repeat(32), timestamp: '0x' + J.horodatageBloc.toString(16) });
        if (m === 'eth_call') {
          const to = bas(p[0] && p[0].to), data = String((p[0] && p[0].data) || '');
          const s = data.slice(0, 10);
          if (to === M.QUOTEUR_CL && s === SEL.q) {
            compte.quoter += 1; compte.misables += 1;
            const w = (i) => data.slice(10 + i * 64, 10 + (i + 1) * 64);
            const k = '0x' + w(0).slice(24) + '|' + BigInt('0x' + w(3)) + '|' + BigInt('0x' + w(2));
            return DEVIS.has(k) ? r('0x' + mot(DEVIS.get(k)) + mot(0) + mot(0) + mot(0)) : err();
          }
          if (POOLS.has(to) && s === SEL.slot0) { compte.misables += 1; return r('0x' + mot(POOLS.get(to).sqrtP) + mot(0).repeat(6)); }
          if (POOLS.has(to) && s === SEL.factory) { compte.misables += 1; return r('0x' + mot(BigInt(to === TSLA.pool ? M.FACTORY_NOUVELLE_INJOIGNABLE : J.factoryAerodromeCl))); }
          if (to === M.USDC && s === SEL.bal) { const pool = '0x' + data.slice(34, 74); if (POOLS.has(pool)) { compte.misables += 1; return r('0x' + mot(POOLS.get(pool).usdc)); } }
        }
        return r('0x' + '0'.repeat(64));
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(Array.isArray(j) ? j.map(un) : un(j)));
    });
  });
}
const SRV = process.env.SERVEUR_MODULE || path.join(ICI, 'serveur-web.js');
const nd = noeud(); await new Promise((o) => nd.listen(0, '127.0.0.1', o));
const u = 'http://127.0.0.1:' + nd.address().port;
const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-misables-'));
const port = 30000 + Math.floor(Math.random() * 15000);
const env = { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: u, BASE_RPC_LECTURE: u, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '', TB_REPLIS: '0' };
delete env.SLOTS_KEEPER_KEY; delete env.TB_RPC_TEST; delete env.BASE_RPC_ARCHIVE;
const enfant = spawn(process.execPath, [SRV], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'], env });
let stderr = ''; enfant.stdout.on('data', () => {}); enfant.stderr.on('data', (c) => { stderr += c; });
const srv = 'http://127.0.0.1:' + port;
let up = false;
for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(srv + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await new Promise((o) => setTimeout(o, 500)); } }
const json = async (x) => { try { return await (await fetch(x, { signal: AbortSignal.timeout(60000) })).json(); } catch (_) { return null; } };
try {
  ok(up, 'serveur demarre' + (up ? '' : ' — ' + stderr.slice(0, 300)));
  if (up) {
    const a = await json(srv + '/api/misables');
    ok(a && a.ok === true && a.etat === 'LU' && a.bloc === J.bloc, '(1) /api/misables : ok, LU, au bloc rejoue ' + (a && a.bloc));
    ok(a && a.regle && a.regle.seuilEcartBps === 100 && a.regle.profondeurMinUsdc === '10000000000' && a.regle.devisBlocsMax === 30 && a.regle.taillesUsdc.join() === '500000,5000000,10000000', '(1) la regle servie : 1 %, 10 000 USDC, 30 blocs, 0,50 / 5 / 10 USDC');
    const L = (sym) => a && a.lignes.find((l) => l.symbole === sym);
    ok(a && new Set(a.lignes.map((l) => l.jeton)).size === a.lignes.length, '(1) une ligne par jeton (' + (a && a.lignes.length) + ')');
    const nv = L('NVDAc');
    ok(nv && nv.misable && nv.tailles.map((t) => t.ecartBps).join('/') === '5/5/5' && nv.tailles.every((t) => t.misable) && nv.factory === J.factoryAerodromeCl, '(2) NVDAc : misable aux 3 tailles, ecarts 5/5/5 bps, factory de notre routeur');
    ok(L('BILIc') && !L('BILIc').misable && L('BILIc').tailles[0].code === 'ECART', '(2) BILIc : ECART (' + (L('BILIc') && L('BILIc').tailles[0].ecartBps) + ' bps)');
    const hs = L('HSAIc');
    ok(hs && hs.tailles[0].misable && !hs.tailles[1].misable && hs.tailles[1].code === 'ECART', '(2) HSAIc : misable a 0,50 seulement');
    ok(L('TSLAc') && !L('TSLAc').misable && L('TSLAc').tailles[0].code === 'ROUTE_INJOIGNABLE', '(2) TSLAc dont la pool repond la nouvelle factory : ROUTE_INJOIGNABLE');
    /* 2026-10-25 : le compte attendu est DERIVE (oracle ci-dessus) au lieu du « 19 » tape le 24/10 (20 moins TSLAc) */
    ok(TSLA_MISABLE_SANS_ENTORSE, '(2) sans l entorse, TSLAc serait misable a 0,50 dans l enregistrement : l entorse retire bien une ligne');
    ok(a && a.misables.length === ATTENDU_050 && a.misables.includes(M.ETH) && !a.misables.includes(TSLA.jeton),
      '(2) ' + ATTENDU_050 + ' jetons misables a 0,50 attendus par l oracle (TSLAc retire), ETH compris : ' + (a && a.misables.length) + ' servis');
    /* chaque ligne servie, a chaque taille, = l oracle ; et un candidat non enregistre n est jamais misable */
    const ecarts = a ? a.lignes.filter((l) => ORACLE.has(l.jeton) && l.tailles.some((t, i) => t.misable !== ORACLE.get(l.jeton)[i])).map((l) => l.symbole) : ['pas de reponse'];
    ok(a && a.lignes.length === ORACLE.size && ecarts.length === 0, '(2) ' + (a && a.lignes.length) + ' lignes servies, misable a chaque taille = l oracle (' + ecarts.length + ' differente(s) ' + ecarts.join(' ') + ')');
    ok(a && NON_MESURES.every((s) => { const l = L(s); return !l || !l.tailles.some((t) => t.misable); }),
      '(2) non mesures dans cet enregistrement : ' + (NON_MESURES.join(' ') || 'aucun') + ' — aucun servi misable');
    ok(a && a.appelsRpc > 0 && a.appelsRpc <= a.appelsMax && compte.misables <= a.appelsMax, '(3) appels de chaine : ' + (a && a.appelsRpc) + ' comptes par le serveur, ' + compte.misables + ' vus par le noeud, plafond ' + (a && a.appelsMax));
    const q1 = compte.quoter;
    const b = await json(srv + '/api/misables');
    /* un rafraichissement lance EN FOND (cache servi pendant la relecture) appellerait le quoter APRES la reponse : on attend 3 s avant de compter */
    await new Promise((o) => setTimeout(o, 3000));
    ok(b && b.lu === a.lu && compte.quoter === q1, '(3) deuxieme requete servie du cache : meme lecture, 0 nouvel appel au quoter (3 s apres : ' + (compte.quoter - q1) + ')');
    let code = 0; try { code = (await fetch(srv + '/misables.js', { signal: AbortSignal.timeout(10000) })).status; } catch (_) { code = 0; }
    ok(code === 200, '(4) /misables.js servi (' + code + ')');
    let code405 = 0; try { code405 = (await fetch(srv + '/api/misables', { method: 'POST', signal: AbortSignal.timeout(10000) })).status; } catch (_) { code405 = 0; }
    ok(code405 === 405, 'POST /api/misables : 405 (lecture seule)');
  }
} finally {
  enfant.kill(); nd.close(); try { fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {}
}
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
