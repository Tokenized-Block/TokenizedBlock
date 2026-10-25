/* test-serveur-regles-duels-20261024.mjs — AUDIT ROLLS-DUELS (2026-10-24) : CE QUE LE VRAI SERVEUR SERT. serveur-web.js est LANCE (deux
 *   instances) contre deux faux noeuds locaux qui repondent par selecteur :
 *   noeud A : currentRules() = (7, 4, 2, 1 USDC, min 3), rulesVersion() = 2, unitCreator() = 0xc0c0…, MAX_PRIZE() = 1000 USDC — des regles
 *             DIFFERENTES de la fiche de deploiement (5 / 3 / 1 / 0,50, min 2), comme apres un setRules ;
 *   noeud B : currentRules() et rulesVersion() REFUSES (erreur JSON-RPC).
 * AFFIRME : (1) /api/tirage sur A sert les regles LUES (prizes, minScore, regles.version / createur / maxPrize / lu) — jamais la fiche ;
 *   (2) sur B : prizes / minScore / regles = null (l app dit « could not be read ») — jamais la fiche ; (3) /api/duels porte regleur
 *   { etat, adresse, regleDuels } et, le regleur etant OFF (pas de SLOTS_KEEPER_KEY), regleDuels = false : l app ne propose ni de creer ni de
 *   rejoindre (2026-10-25 : sur une copie du serveur dont la fiche v2 est ramenee a avant son deploiement) ; (3L) le serveur reel, fiche v2
 *   deployee, sert version 2 sur le contrat de la fiche, sans champ regleur ; (4) rolls-regles.js est servi (200), sinon l app ne charge pas (page morte).
 * SERVEUR_MODULE : le chemin d une COPIE mutee de serveur-web.js (muter-rolls-duels-ui-20261024.mjs). ⛔ PORTABLE : process.exitCode.
 * NE PROUVE PAS : le bytecode reel (banc-rolls-regles-anvil-20261024.mjs) ; un regleur des duels (autre chantier).
 * serie-delai-s: 240 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const { selecteur } = await import(pathToFileURL(path.join(ICI, 'keccak.js')).href);
const { BLOCKROLLS_DEPLOIEMENT } = await import(pathToFileURL(path.join(ICI, 'blockrolls-deploiement.js')).href);
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const CR = '0x' + 'c0'.repeat(20);
const SEL = { regles: selecteur('currentRules()'), version: selecteur('rulesVersion()'), createur: selecteur('unitCreator()'), max: selecteur('MAX_PRIZE()'), pot: selecteur('pot()') };
const ROLLS = String(BLOCKROLLS_DEPLOIEMENT.adresse || '').toLowerCase();

function noeud(refuseRegles) {
  return http.createServer((req, res) => {
    let b = ''; req.on('data', (c) => { b += c; });
    req.on('end', () => {
      let j = {}; try { j = JSON.parse(b); } catch (_) {}
      const un = (q) => {
        const m = q.method, p = q.params || [];
        const r = (result) => ({ jsonrpc: '2.0', id: q.id, result }), err = () => ({ jsonrpc: '2.0', id: q.id, error: { code: -32000, message: 'execution reverted' } });
        if (m === 'eth_chainId') return r('0x2105');
        if (m === 'eth_blockNumber') return r('0x100000');
        if (m === 'eth_getLogs') return r([]);
        if (m === 'eth_getBlockByNumber') return r({ number: '0x100000', hash: '0x' + 'ab'.repeat(32), timestamp: '0x' + Math.floor(Date.now() / 1000).toString(16) });
        if (m === 'eth_call' && String(p[0] && p[0].to).toLowerCase() === ROLLS) {
          const s = String(p[0].data).slice(0, 10);
          if (s === SEL.regles) return refuseRegles ? err() : r('0x' + [7e6, 4e6, 2e6, 1e6, 3].map(mot).join(''));
          if (s === SEL.version) return refuseRegles ? err() : r('0x' + mot(2));
          if (s === SEL.createur) return r('0x' + mot(BigInt(CR)));
          if (s === SEL.max) return r('0x' + mot(1000e6));
          if (s === SEL.pot) return r('0x' + mot(250000));
        }
        return r('0x' + '0'.repeat(64));
      };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(Array.isArray(j) ? j.map(un) : un(j)));
    });
  });
}
const SRV = process.env.SERVEUR_MODULE || path.join(ICI, 'serveur-web.js');
/* 2026-10-25 : BlockDuelsV2 deploye (duels-v2-deploiement.js porte adresse + bloc) -> le vrai serveur sert v2 a /api/duels (version 2, aucun
 *   regleur : creer / rejoindre ne dependent plus de lui). Le (3) du chemin v1 (regleur OFF -> regleDuels false) tourne donc sur une COPIE du
 *   MEME serveur (SERVEUR_MODULE compris, pour que ses mutants rougissent toujours) dont la seule difference est la fiche v2 ramenee a l etat
 *   d avant (memes octets, adresse et bloc null) : sinon il lirait v2 et le (3) v1 passerait a vide ou rougirait pour rien. Le serveur reel
 *   (A) prouve l etat LIVE : version 2 sur le contrat de la fiche, sans champ regleur. */
const { DUELS_V2_DEPLOIEMENT: DV2 } = await import(pathToFileURL(path.join(ICI, 'duels-v2-deploiement.js')).href);
const V2_DEPLOYE = /^0x[0-9a-f]{40}$/.test(String(DV2.adresse)) && Number.isSafeInteger(DV2.bloc) && DV2.bloc > 0;
const ANCRE_V2 = "import('./duels-v2-deploiement.js')";
const ficheAvant = path.join(ICI, '.tmp-regles-duels-' + process.pid + '-fiche.mjs'), srvAvant = path.join(ICI, '.tmp-regles-duels-' + process.pid + '-srv.js');
const srcSrv = fs.readFileSync(SRV, 'utf8');
fs.writeFileSync(ficheAvant, "import { DUELS_V2_DEPLOIEMENT as X } from './duels-v2-deploiement.js';\nexport const DUELS_V2_DEPLOIEMENT = Object.freeze({ ...X, adresse: null, bloc: null });\n");
fs.writeFileSync(srvAvant, srcSrv.replace(ANCRE_V2, () => "import('./" + path.basename(ficheAvant) + "')"));
const nettoyer = () => { for (const f of [ficheAvant, srvAvant]) try { fs.unlinkSync(f); } catch (_) {} };
async function lancer(refuse, module = SRV) {
  const nd = noeud(refuse); await new Promise((o) => nd.listen(0, '127.0.0.1', o));
  const u = 'http://127.0.0.1:' + nd.address().port;
  const vol = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-regles-duels-'));
  /* 30000..44999 : hors des plages exclues de Windows (voir test-mcp-game-20261018.mjs) */
  const port = 30000 + Math.floor(Math.random() * 15000);
  const env = { ...process.env, NODE_OPTIONS: '', PORT: String(port), BASE_RPC: u, BASE_RPC_LECTURE: u, RAILWAY_VOLUME_MOUNT_PATH: vol, TB_NOS_CREATEURS: '', TB_REPLIS: '0' };
  delete env.SLOTS_KEEPER_KEY; delete env.TB_RPC_TEST; delete env.BASE_RPC_ARCHIVE;
  const enfant = spawn(process.execPath, [module], { cwd: ICI, stdio: ['ignore', 'pipe', 'pipe'], env });
  let stderr = ''; enfant.stdout.on('data', () => {}); enfant.stderr.on('data', (c) => { stderr += c; });
  const srv = 'http://127.0.0.1:' + port;
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(srv + '/sante', { signal: AbortSignal.timeout(2000) })).ok; } catch (_) { await new Promise((o) => setTimeout(o, 500)); } }
  return { srv, up, stderr: () => stderr, fin: () => { enfant.kill(); nd.close(); try { fs.rmSync(vol, { recursive: true, force: true }); } catch (_) {} } };
}
const json = async (u) => { try { return await (await fetch(u, { signal: AbortSignal.timeout(20000) })).json(); } catch (_) { return null; } };
/* la premiere lecture des regles est asynchrone (au demarrage) : relire /api/tirage jusqu a ce qu elle soit servie, 30 s au plus */
async function tirageApres(srv, attendu) { let t = null; for (let i = 0; i < 30; i++) { t = await json(srv + '/api/tirage'); if (t && t.rolls && attendu(t.rolls)) return t; await new Promise((o) => setTimeout(o, 1000)); } return t; }

ok(/^0x[0-9a-f]{40}$/.test(ROLLS), 'la fiche BlockRolls porte une adresse (' + ROLLS + ')');
ok(srcSrv.split(ANCRE_V2).length === 2, 'la fiche v2 est importee UNE fois par le serveur (l ancre de la copie d avant le deploiement existe)');
let A, B, A0;
try {
[A, B, A0] = await Promise.all([lancer(false), lancer(true), lancer(false, srvAvant)]);
ok(A.up && B.up && A0.up, 'trois serveurs demarres (A, B, A0 = A avec la fiche v2 d avant)' + (A.up && B.up && A0.up ? '' : ' — ' + (A.stderr() + B.stderr() + A0.stderr()).slice(0, 300)));
if (A.up && B.up && A0.up) {
  const tA = await tirageApres(A.srv, (r) => Array.isArray(r.prizes));
  const rA = tA && tA.rolls;
  ok(rA && Array.isArray(rA.prizes) && rA.prizes.join() === '7000000,4000000,2000000,1000000' && rA.minScore === 3, '(1) /api/tirage : les gains LUS sur le contrat (7/4/2/1, min 3), pas la fiche (' + (rA && JSON.stringify(rA.prizes)) + ', min ' + (rA && rA.minScore) + ')');
  ok(rA && rA.regles && rA.regles.version === 2 && rA.regles.createur === CR && rA.regles.maxPrize === '1000000000' && !Number.isNaN(Date.parse(rA.regles.lu)), '(1) regles : version 2, createur de UNIT lu, MAX_PRIZE lu, heure de lecture');
  ok(rA && rA.prixRoll === String(BLOCKROLLS_DEPLOIEMENT.constructeur.rollPrice) && rA.contrat === ROLLS, '(1) le prix du roll (immuable) reste celui de la fiche ; le contrat est celui de la fiche');
  await new Promise((o) => setTimeout(o, 3000));
  const tB = await json(B.srv + '/api/tirage');
  const rB = tB && tB.rolls;
  ok(rB && rB.contrat === ROLLS && rB.prizes === null && rB.minScore === null && rB.regles === null, '(2) regles refusees par le noeud : prizes / minScore / regles = null — jamais la fiche (' + (rB && JSON.stringify(rB.prizes)) + ')');
  const d0 = await json(A0.srv + '/api/duels');
  ok(d0 && d0.version === undefined && d0.regleur && d0.regleur.etat === 'OFF' && d0.regleur.regleDuels === false && d0.regleur.adresse === null, '(3) /api/duels sur v1 (fiche v2 d avant) : regleur OFF, regleDuels false (' + (d0 && JSON.stringify(d0.regleur)) + ')');
  const dA = await json(A.srv + '/api/duels');
  ok(V2_DEPLOYE ? dA && dA.version === 2 && dA.contrat === DV2.adresse && !('regleur' in dA) : dA && dA.regleur && dA.regleur.regleDuels === false,
    '(3L) /api/duels du serveur REEL : ' + (V2_DEPLOYE ? 'v2 live (version 2, contrat ' + DV2.adresse + '), aucun champ regleur' : 'v2 pas deploye -> v1, regleDuels false') + ' (lu : version ' + (dA && dA.version) + ', contrat ' + (dA && dA.contrat) + ', etat ' + (dA && dA.etat) + ')');
  const st = await json(A.srv + '/sante');
  ok(st && st.slotsRegleur && st.slotsRegleur.etat === 'OFF', '(3) /sante dit le meme regleur OFF');
  let code = 0; try { code = (await fetch(A.srv + '/rolls-regles.js', { signal: AbortSignal.timeout(10000) })).status; } catch (_) { code = 0; }
  ok(code === 200, '(4) /rolls-regles.js servi (' + code + ')');
}
} finally { for (const s of [A, B, A0]) if (s) s.fin(); nettoyer(); }
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
