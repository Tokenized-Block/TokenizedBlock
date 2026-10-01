/* PREUVE DE BOUT EN BOUT : /api/prix-usd REND-IL LE PRIX QUAND LA CHAINE NE REPOND JAMAIS ?
 *
 * ⛔⛔ LE ROUGE EXISTE, ET IL A ETE MESURE EN PRODUCTION (2026-10-01) : quatre `curl` de suite,
 *     HTTP 000 a 12 s / 20 s / 20 s / 20 s, pendant que `/sante` rendait 200. Ce banc le REJOUE a
 *     la demande au lieu d attendre le prochain deploiement pour le revoir.
 *
 * ⭐ LE TROU NOIR EST LE COEUR DU BANC. On lance un serveur TCP qui ACCEPTE la connexion et ne
 *   repond JAMAIS — pas un refus, pas un 500, pas un `ECONNREFUSED`. Un refus serait rejete tout
 *   de suite et ne prouverait rien : c est l ATTENTE qui faisait le mutisme. `BASE_RPC_LECTURE`
 *   pointe dessus, et c est exactement la variable que lit `RPC_FAITS_POOL`, donc exactement la
 *   lecture on-chain qui retenait le prix en otage.
 *
 * ⛔⛔⛔ TROIS CONDITIONS DE VALIDITE, parce qu un banc de ce depot a deja ete VERT sur une
 *      transaction `status 0x0` :
 *        1. LE TEMOIN NEGATIF D ABORD : avec le trou noir, un endpoint NON borne doit etre
 *           constate muet. Sans ce rouge, un vert ne prouve pas la borne — il prouve peut-etre que
 *           le trou noir n est jamais atteint.
 *        2. La reponse bornee doit arriver SOUS la borne + marge, et porter le PRIX.
 *        3. Elle doit porter `famille: 'NON_MESURE'` et un `pourquoiFaits` qui NOMME la borne.
 *           Un prix sans l aveu de son aveuglement serait pire que le mutisme.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : que la condition de production etait exactement celle-la. Elle
 *   venait d un `over rate limit` amont, pas d un trou noir. Ce banc prouve la BORNE, pas la cause.
 */
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

/* ⛔ LE BANC SE SITUE PAR RAPPORT A LUI-MEME : un chemin absolu le casserait pour quiconque
 *   clone ce depot, et un banc qui ne tourne que sur une machine ne garde rien. */
const ICI = dirname(fileURLToPath(import.meta.url));

const PORT_APP = '8613';
const PORT_TROU = 8614;
const BORNE_ANNONCEE_MS = 6000;
const ADR = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'; /* USDC sur Base, lu dans le depot */

let n = 0, ko = 0;
const ok = (nom, cond, vu) => {
  n += 1;
  if (cond) { console.log('  ok  ' + nom); return true; }
  ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '\n        vu: ' + vu));
  return false;
};
const dors = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── LE TROU NOIR ───────────────────────────────────────────────────────────────────────────── */
const sockets = [];
const trou = createServer((s) => { sockets.push(s); /* ⛔ on ne repond RIEN, et on ne ferme pas */ });
await new Promise((r) => trou.listen(PORT_TROU, '127.0.0.1', r));
console.log('trou noir RPC sur 127.0.0.1:' + PORT_TROU + ' (accepte, ne repond jamais)');

/* ── LE SERVEUR, SA LECTURE ON-CHAIN DIRIGEE VERS LE TROU ───────────────────────────────────── */
const srv = spawn(process.execPath, ['serveur-web.js'], {
  cwd: ICI,
  env: { ...process.env, PORT: PORT_APP, BASE_RPC_LECTURE: 'http://127.0.0.1:' + PORT_TROU },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let journal = '';
srv.stdout.on('data', (d) => { journal += d; });
srv.stderr.on('data', (d) => { journal += d; });

const base = 'http://127.0.0.1:' + PORT_APP;
/* ⛔ ON ATTEND QUE LE SERVEUR SOIT LA, PAR UNE SONDE, pas par un `sleep` au doigt mouille. */
let debout = false;
for (let i = 0; i < 60; i += 1) {
  try { const r = await fetch(base + '/sante', { signal: AbortSignal.timeout(1500) }); if (r.ok) { debout = true; break; } }
  catch (_) {}
  await dors(500);
}
if (!ok('0. le serveur local repond sur /sante', debout)) {
  console.log(journal.slice(-1500)); srv.kill(); trou.close(); process.exit(1);
}

/** Appelle un chemin et rend { ms, statut, corps } ; `statut: 0` = muet (abandon par nous). */
async function sonde(chemin, plafondMs) {
  const t0 = Date.now();
  try {
    const r = await fetch(base + chemin, { signal: AbortSignal.timeout(plafondMs), headers: { 'x-ms-monitor': '1' } });
    const corps = await r.text();
    return { ms: Date.now() - t0, statut: r.status, corps };
  } catch (e) { return { ms: Date.now() - t0, statut: 0, corps: String((e && e.name) || e) }; }
}

/* ── TEMOIN NEGATIF : UN ENDPOINT NON BORNE, AVEC LE MEME TROU NOIR ────────────────────────── */
console.log('');
console.log('=== TEMOIN NEGATIF : le trou noir rend-il bien quelque chose MUET ? ===');
/* ⛔ `/api/cle` lit la chaine et n a PAS recu de borne aujourd hui. S il repond vite malgre le
 *   trou noir, c est que ma variable ne dirige pas la lecture que je crois — et alors le vert
 *   d en dessous ne vaudrait RIEN. */
const t = await sonde('/api/cle/0xb20000000000000000000003d296be435ae4bbe3', 9000);
const temoinMuet = t.statut === 0 || t.ms > BORNE_ANNONCEE_MS;
ok('1. TEMOIN — une lecture NON bornee reste pendue sur le trou noir',
  temoinMuet, t.statut + ' en ' + t.ms + ' ms : ' + t.corps.slice(0, 110));
if (!temoinMuet) {
  console.log('     ⛔ LE TROU NOIR N EST PEUT-ETRE PAS SUR LE CHEMIN DE LA LECTURE.');
  console.log('        Tout vert obtenu ensuite serait sans valeur. On le dit au lieu de continuer.');
}

/* ── LA BORNE ──────────────────────────────────────────────────────────────────────────────── */
console.log('');
console.log('=== LA BORNE SUR /api/prix-usd ===');
const p = await sonde('/api/prix-usd?adr=' + ADR, 20000);
ok('2. il REPOND (il ne reste pas muet)', p.statut === 200, p.statut + ' en ' + p.ms + ' ms');
ok('3. et il repond SOUS la borne + 3 s de marge', p.statut === 200 && p.ms < BORNE_ANNONCEE_MS + 3000,
  p.ms + ' ms (borne annoncee ' + BORNE_ANNONCEE_MS + ' ms)');
let j = null;
try { j = JSON.parse(p.corps); } catch (_) {}
ok('4. la charge est du JSON lisible', !!j, p.corps.slice(0, 140));
if (j) {
  ok('5. LE PRIX EST LA — c est tout l objet de la borne', j.ok === true && Number(j.prixUsd) > 0,
    'ok=' + j.ok + ' prixUsd=' + j.prixUsd + ' pourquoi=' + (j.pourquoi || '—'));
  /* ⛔⛔ UN PRIX SANS L AVEU DE SON AVEUGLEMENT SERAIT PIRE QUE LE MUTISME : le client lirait
   *   l absence de glissement comme une absence de risque. */
  ok('6. et il AVOUE son aveuglement : famille NON_MESURE, glissementBps null',
    j.famille === 'NON_MESURE' && j.glissementBps === null,
    'famille=' + j.famille + ' glissementBps=' + JSON.stringify(j.glissementBps));
  ok('7. `pourquoiFaits` NOMME la borne ET sa valeur',
    typeof j.pourquoiFaits === 'string' && j.pourquoiFaits.includes(String(BORNE_ANNONCEE_MS)),
    JSON.stringify(j.pourquoiFaits));
}

/* ── ET PAS DE DOUBLE REPONSE ──────────────────────────────────────────────────────────────── */
console.log('');
console.log('=== LE VERROU : la borne a-t-elle fait crasher le handler ? ===');
/* ⛔ Si l enrichissement se reveillait et repondait a son tour, Node leverait
 *   `Cannot set headers after they are sent`. On laisse passer du temps, PUIS on regarde le
 *   journal du serveur — et on verifie qu il est toujours vivant. */
await dors(4000);
ok('8. aucun `Cannot set headers` dans le journal du serveur',
  !/Cannot set headers|ERR_HTTP_HEADERS_SENT/.test(journal),
  (journal.match(/Cannot set headers[^\n]*/) || ['—'])[0]);
const apres = await sonde('/sante', 5000);
ok('9. le serveur est TOUJOURS debout apres la borne', apres.statut === 200, apres.statut);

for (const s of sockets) { try { s.destroy(); } catch (_) {} }
srv.kill(); trou.close();
console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) console.log(journal.slice(-2000));
process.exit(ko ? 1 : 0);
