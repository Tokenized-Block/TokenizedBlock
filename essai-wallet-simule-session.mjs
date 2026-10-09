/* essai-wallet-simule-session.mjs — OUVRE UNE SESSION D ESSAI POUR LE NAVIGATEUR : fork fige par un instantane, compte d essai
 *   finance, serveur de CE dossier en mode essai, et l URL a ouvrir. A la fin : le fork est rendu, le serveur arrete.
 *
 * POUR QUI. Un humain ou un agent qui pilote un navigateur sur la vraie interface avec le wallet simule
 *   (ESSAI-WALLET-SIMULE-20261004.md donne les gestes). Le banc sans navigateur est banc-wallet-simule-fork-20261004.mjs.
 * CE QUE CA FAIT : evm_snapshot · un compte NEUF (aucune cle) recoit 1 ETH et 50 USDC sur le fork · `serveur-web.js` demarre sur
 *   un port libre avec `TB_RPC_TEST` = le fork · l URL s affiche · puis ATTEND. La session se termine par Ctrl+C, par le fichier
 *   d arret (son chemin s affiche : le creer suffit), ou apres `--minutes` (defaut 30). Elle affiche alors ce que le compte et
 *   le wallet des frais ont gagne ou perdu (soldes lus), arrete le serveur et fait evm_revert.
 * ⛔ SI CE PROCESSUS EST TUE NET (fenetre fermee, kill -9), RIEN N EST RENDU : l instantane reste, le serveur peut survivre.
 *   Le fichier d etat (chemin affiche) garde l instantane et le pid du serveur ; `--rendre` fait le menage apres coup.
 * ⛔ UN SEUL OUTIL D ESSAI A LA FOIS sur le fork (verrou de outils-essai-fork.mjs) ; et aucun autre banc fork pendant la session.
 * Usage :
 *   node essai-wallet-simule-session.mjs [--minutes 30] [--port 8091] [--externe] [http://127.0.0.1:8549]
 *   node essai-wallet-simule-session.mjs --soldes 0x<compte>     (lecture seule : soldes du compte et du wallet des frais)
 *   node essai-wallet-simule-session.mjs --rendre                (apres un arret brutal : evm_revert de l instantane garde, serveur tue)
 *   `--externe` : laisse le serveur lire DexScreener / OpenLaunch (prix en dollars) ; par defaut aucun fetch ne sort de la machine. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ACTIONS_COINBASE } from './paires.js';
import { RPC_ESSAI_DEFAUT } from './mode-essai.js';
import { lecteurFork, ouvrirFork, compteNeuf, financer, demarrerServeur, solde, pause, ETH, USDC, FRAIS } from './outils-essai-fork.mjs';

const args = process.argv.slice(2);
const option = (nom) => { const i = args.indexOf(nom); return i >= 0 ? (args[i + 1] || '') : null; };
const URL_FORK = args.find((x) => /^https?:/.test(x)) || RPC_ESSAI_DEFAUT;
const rpc = lecteurFork(URL_FORK);
const FICHIER_ETAT = path.join(os.tmpdir(), 'tblock-essai-session.json');
const FICHIER_ARRET = path.join(os.tmpdir(), 'tblock-essai-session.stop');
const action = (s) => { const a = ACTIONS_COINBASE.find((x) => x.symbole === s); return a ? String(a.adr).toLowerCase() : null; };
const BLOCK = (fs.readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').match(/const BLOCK_SONDE = '(0x[0-9a-f]{40})';/) || [])[1];
/* les jetons suivis : ceux du parcours de ESSAI-WALLET-SIMULE-20261004.md (adresses LUES dans le depot) */
const SUIVIS = [[ETH, 'ETH'], [USDC, 'USDC'], [action('NVDAc'), 'NVDAc'], [action('LLYc'), 'LLYc'], [BLOCK, 'IB022']].filter(([a]) => /^0x[0-9a-f]{40}$/.test(String(a)));
const lireSoldes = async (qui) => { const s = {}; for (const [a, nom] of SUIVIS) { try { s[nom] = await solde(rpc, a, qui); } catch (_) { s[nom] = null; } } return s; };
const dire = (titre, s, avant = null) => console.log('  ' + titre.padEnd(18) + SUIVIS.map(([, nom]) => nom + ' ' + (s[nom] === null ? 'not read' : avant ? ((s[nom] - avant[nom]) >= 0n ? '+' : '') + (s[nom] - avant[nom]) : s[nom])).join(' · '));

/* ⛔ 2026-10-09 : plus de `process.exit` apres un fetch — sous Windows (Node 24) il fait planter libuv (assertion UV_HANDLE_CLOSING,
 *   vue sur `--rendre`). Les trois modes sont des branches ; le code de sortie passe par `process.exitCode`.
 * ⛔ ET POUR FINIR UNE SESSION, LE FICHIER D ARRET, PAS UN KILL : tuer ce processus saute le `finally` qui rend le fork
 *   (evm_revert). Le 2026-10-09, un `--rendre` lance apres coup a trouve un instantane (0x5) jamais rendu. */
if (option('--soldes') !== null) {
  const qui = String(option('--soldes')).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(qui)) { console.log('usage: --soldes 0x<whole address>'); process.exitCode = 1; }
  else {
    console.log('fork ' + rpc.url + ' · block ' + parseInt(await rpc('eth_blockNumber', []), 16) + ' · raw units');
    dire('account', await lireSoldes(qui));
    dire('fee wallet', await lireSoldes(FRAIS));
    process.exitCode = 0;
  }
} else if (args.includes('--rendre')) {
  let etat = null;
  try { etat = JSON.parse(fs.readFileSync(FICHIER_ETAT, 'utf8')); } catch (_) { console.log('no saved session state at ' + FICHIER_ETAT + ' — nothing to give back'); process.exitCode = 1; }
  if (etat) {
    try { process.kill(Number(etat.pidServeur)); console.log('server pid ' + etat.pidServeur + ' stopped'); } catch (_) { console.log('server pid ' + etat.pidServeur + ' was not running'); }
    try { await rpc('anvil_stopImpersonatingAccount', [etat.compte]); } catch (_) { /* plus impersonne */ }
    const r = await lecteurFork(etat.fork)('evm_revert', [etat.instantane]);
    console.log('evm_revert ' + etat.instantane + ' -> ' + r + ' · block ' + parseInt(await rpc('eth_blockNumber', []), 16) + ' (was ' + etat.tete + ')');
    try { fs.unlinkSync(FICHIER_ETAT); } catch (_) { /* deja retire */ }
    process.exitCode = r === true ? 0 : 1;
  }
} else {
const minutes = Math.min(180, Math.max(1, Number(option('--minutes')) || 30));
const port = Number(option('--port')) || null;
let session = null, serveur = null, compte = null, fin = null;
process.on('SIGINT', () => { fin = 'Ctrl+C'; });
process.on('SIGTERM', () => { fin = 'SIGTERM'; });
try { fs.unlinkSync(FICHIER_ARRET); } catch (_) { /* pas de fichier d arret d une session passee */ }
let code = 0;
try {
  session = await ouvrirFork(rpc);
  compte = compteNeuf();
  await financer(rpc, compte, { ethWei: 10n ** 18n, usdc: 50n * 10n ** 6n });
  serveur = await demarrerServeur({ rpcEssai: rpc.url, port, garde: !args.includes('--externe') });
  fs.writeFileSync(FICHIER_ETAT, JSON.stringify({ fork: rpc.url, instantane: session.instantane, tete: session.tete, compte, port: serveur.port, pidServeur: serveur.pid, pid: process.pid, depuis: new Date().toISOString() }));
  const departCompte = await lireSoldes(compte), departFrais = await lireSoldes(FRAIS);
  const q = '?panel=1&essai=wallet&compte=' + compte + (rpc.url === RPC_ESSAI_DEFAUT ? '' : '&rpc=' + encodeURIComponent(rpc.url));
  console.log('TEST SESSION OPEN — simulated wallet on a local fork. Nothing here is real.');
  console.log('  fork            ' + rpc.url + ' (' + session.client + ', block ' + session.tete + ', snapshot ' + session.instantane + ')');
  console.log('  server          ' + serveur.url + ' (test mode: ' + JSON.stringify(serveur.sante.essai) + ', build ' + serveur.sante.build + ')');
  console.log('  test account    ' + compte + ' (no key: the fork impersonates it)');
  console.log('  fee wallet      ' + FRAIS);
  console.log('\nOPEN THIS URL (the panel, on IB022):\n  http://localhost:' + serveur.port + '/app.html' + q + '#b=' + BLOCK);
  console.log('\nBalances now (raw units):');
  dire('account', departCompte); dire('fee wallet', departFrais);
  console.log('\nTo read balances during the session:  node essai-wallet-simule-session.mjs --soldes ' + compte);
  console.log('To end the session: Ctrl+C here, or create the file ' + FICHIER_ARRET + ' — it also ends by itself after ' + minutes + ' min.');
  const limite = Date.now() + minutes * 60000;
  while (!fin) {
    if (fs.existsSync(FICHIER_ARRET)) fin = 'stop file';
    else if (Date.now() > limite) fin = minutes + ' min elapsed';
    else if (!serveur.enVie()) fin = 'the server stopped by itself';
    else await pause(1000);
  }
  console.log('\nSESSION ENDING (' + fin + '). What moved during the session (raw units, balances read on the fork):');
  dire('account', await lireSoldes(compte), departCompte); dire('fee wallet', await lireSoldes(FRAIS), departFrais);
  const o = serveur.origines();
  console.log('  the server reached: ' + (o.joints.join(', ') || '(no guard: not recorded)') + (o.bloques.length ? ' · blocked: ' + o.bloques.join(', ') : ''));
} catch (e) {
  code = 1;
  console.log('SESSION FAILED: ' + String((e && e.message) || e).slice(0, 300));
} finally {
  if (serveur) console.log('server stopped (' + await serveur.arreter() + ')');
  if (session) {
    try { if (compte) await rpc('anvil_stopImpersonatingAccount', [compte]); } catch (_) { /* plus impersonne */ }
    const rendu = await session.rendre();
    console.log('fork given back: evm_revert ' + rendu + ' · block ' + parseInt(await rpc('eth_blockNumber', []), 16) + ' (was ' + session.tete + ')');
    if (rendu !== true) code = 1;
  }
  try { fs.unlinkSync(FICHIER_ETAT); } catch (_) { /* jamais ecrit */ }
  try { fs.unlinkSync(FICHIER_ARRET); } catch (_) { /* pas de fichier d arret */ }
}
process.exitCode = code;
}
