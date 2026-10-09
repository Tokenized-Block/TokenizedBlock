/* outils-essai-fork.mjs — ce que le banc du wallet simule ET la session navigateur partagent : parler au fork, financer un compte
 *   d essai, demarrer et arreter une copie du serveur en mode essai.
 *
 * ⛔ CES OUTILS ENVOIENT DES TRANSACTIONS SUR UN FORK LOCAL (base-anvil) ET NULLE PART AILLEURS : l adresse du fork passe par
 *   `urlLocale` (une boucle locale, sinon refus), et `ouvrirFork` exige un noeud qui se dit anvil sur la chaine Base.
 * ⛔ TOUT SE PASSE ENTRE `evm_snapshot` ET `evm_revert` : `ouvrirFork` rend la fonction `rendre()` ; l appelant la met dans un
 *   `finally`. Un seul banc fork a la fois (le fork est partage).
 * ⛔ AUCUNE CLE : les comptes sont impersonnes par le fork. L USDC d essai est pris a une pool Aerodrome du fork par un transfert
 *   impersonne — impossible sur la vraie chaine, et annule par le `evm_revert`. */
import { spawn } from 'node:child_process';
import net from 'node:net';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { urlLocale, RPC_ESSAI_DEFAUT } from './mode-essai.js';
import { USDC_BASE, FEE_WALLET } from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';

export const ICI = dirname(fileURLToPath(import.meta.url));
export const ETH = '0x0000000000000000000000000000000000000000';
export const USDC = String(USDC_BASE).toLowerCase();
export const FRAIS = String(FEE_WALLET).toLowerCase();
export const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
export const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
export const pause = (ms) => new Promise((o) => setTimeout(o, ms));

/** Un lecteur JSON-RPC du fork : rend le resultat, jette l erreur du noeud (avec `data`). */
export function lecteurFork(urlFork = RPC_ESSAI_DEFAUT) {
  const url = urlLocale(urlFork);
  if (!url) throw new Error('the fork must be a plain http address on this machine');
  let id = 0;
  const rpc = async (method, params = []) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    const j = await r.json();
    if (j.error) { const e = new Error(j.error.message); e.code = j.error.code; e.data = j.error.data; throw e; }
    return j.result;
  };
  rpc.url = url;
  return rpc;
}

export const solde = async (rpc, jeton, qui) => (jeton === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest']))
  : BigInt(await rpc('eth_call', [{ to: jeton, data: '0x70a08231' + adrMot(qui) }, 'latest'])));

/** Envoi DIRECT au fork depuis un compte impersonne (la preparation du banc — jamais le chemin juge). */
export async function envoyerBrut(rpc, de, tx) {
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: tx.gas || '0x493e0' }]);
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return { h, status: r.status }; await pause(100); }
  throw new Error('receipt never came for ' + h);
}

/* ── UN SEUL OUTIL D ESSAI A LA FOIS SUR LE FORK : un verrou (fichier) entre le banc et la session navigateur ──
 * Deux instantanes imbriques se detruisent : le `evm_revert` du premier ouvert annule aussi ce que le second croit tenir.
 * ⛔ BORNE : ce verrou ne connait que les outils de CE fichier. Les autres bancs fork du depot ne le prennent pas : la regle
 *   « un seul banc fork a la fois » reste a tenir a la main pour eux. Un verrou dont le processus est mort est repris. */
export const FICHIER_VERROU = join(tmpdir(), 'tblock-fork-essai.lock');
function prendreVerrou() {
  try {
    const tenu = JSON.parse(readFileSync(FICHIER_VERROU, 'utf8'));
    let vivant = false;
    try { process.kill(Number(tenu.pid), 0); vivant = true; } catch (_) { vivant = false; }
    if (vivant && Number(tenu.pid) !== process.pid) throw Object.assign(new Error('another test tool holds the fork (pid ' + tenu.pid + ', since ' + tenu.depuis + '): one fork session at a time'), { verrou: true });
  } catch (e) { if (e && e.verrou) throw e; /* pas de verrou, ou illisible, ou processus mort : on le prend */ }
  writeFileSync(FICHIER_VERROU, JSON.stringify({ pid: process.pid, depuis: new Date().toISOString() }));
}
function rendreVerrou() {
  try { const tenu = JSON.parse(readFileSync(FICHIER_VERROU, 'utf8')); if (Number(tenu.pid) === process.pid) unlinkSync(FICHIER_VERROU); } catch (_) { /* deja rendu */ }
}

/** Ouvre une session sur le fork : verifie que c est un fork anvil de Base, prend le verrou puis l instantane.
 *  Rend `rendre()` (evm_revert + verrou rendu) — a mettre dans un `finally`. */
export async function ouvrirFork(rpc) {
  const client = String(await rpc('web3_clientVersion', []));
  if (!/^anvil\b/i.test(client)) throw new Error('this node is not anvil (“' + client.slice(0, 40) + '”): nothing is sent');
  const chaine = parseInt(await rpc('eth_chainId', []), 16);
  if (chaine !== 8453) throw new Error('the fork is on chain ' + chaine + ', not Base: nothing is sent');
  prendreVerrou();
  let tete, instantane;
  try {
    tete = parseInt(await rpc('eth_blockNumber', []), 16);
    instantane = await rpc('evm_snapshot', []);
  } catch (e) { rendreVerrou(); throw e; }
  let rendu = false;
  return { client, tete, instantane, rendre: async () => {
    if (rendu) return true;
    rendu = true;
    try { return await rpc('evm_revert', [instantane]); } finally { rendreVerrou(); }
  } };
}

/** Un compte d essai neuf : une adresse sans cle connue, differente a chaque session (jamais le wallet des frais). */
export function compteNeuf(prefixe = '5e55') {
  const a = '0x' + (prefixe + Date.now().toString(16) + Math.floor(Math.random() * 0xffff).toString(16)).padEnd(40, 'e').slice(0, 40).toLowerCase();
  if (a === FRAIS) throw new Error('never the fee wallet');
  return a;
}

/** Finance le compte d essai : de l ETH (anvil_setBalance) et de l USDC pris a une pool Aerodrome du fork.
 *  `saufPool` : une pool que le banc va traiter (on ne la vide pas de son USDC avant de la traverser). */
export async function financer(rpc, compte, { ethWei = 10n ** 18n, usdc = 100n * 10n ** 6n, saufAction = null } = {}) {
  await rpc('anvil_setBalance', [compte, '0x' + BigInt(ethWei).toString(16)]);
  if (usdc > 0n) {
    const source = [...POOLS_ACTIONS_AERODROME.entries()].find(([adr]) => String(adr).toLowerCase() !== String(saufAction || '').toLowerCase());
    if (!source) throw new Error('no Aerodrome pool in the table to take test USDC from');
    const pool = source[1].pool;
    const avant = await solde(rpc, USDC, compte);
    await rpc('anvil_impersonateAccount', [pool]);
    await rpc('anvil_setBalance', [pool, '0x' + (10n ** 18n).toString(16)]);
    const r = await envoyerBrut(rpc, pool, { to: USDC, data: '0xa9059cbb' + adrMot(compte) + mot(usdc) });
    await rpc('anvil_stopImpersonatingAccount', [pool]);
    if (r.status !== '0x1' || (await solde(rpc, USDC, compte)) - avant !== BigInt(usdc)) throw new Error('the test USDC did not arrive');
  }
  return { eth: await solde(rpc, ETH, compte), usdc: await solde(rpc, USDC, compte) };
}

export const portLibre = () => new Promise((ok, ko) => {
  const s = net.createServer();
  s.on('error', ko);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); });
});

/**
 * Demarre le serveur de CE dossier sur un port libre, en mode essai (`TB_RPC_TEST`), sondes coupees.
 * `garde` (defaut vrai) : precharge garde-reseau-essai.mjs — aucun fetch du serveur ne sort de la machine, et les origines
 *   jointes / bloquees sont rendues par `origines()`.
 * ⛔ L environnement du serveur est construit ICI : aucune variable `RAILWAY_*` ni `BASE_RPC*` heritee ne s y glisse.
 */
export async function demarrerServeur({ rpcEssai = RPC_ESSAI_DEFAUT, port = null, garde = true, fichier = 'serveur-web.js', env = {}, attenteMs = 30000 } = {}) {
  const p0 = port || await portLibre();
  const propre = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(RAILWAY_|BASE_RPC|TB_|PORT$|NODE_ENV$)/.test(k)));
  const args = (garde ? ['--import', pathToFileURL(join(ICI, 'garde-reseau-essai.mjs')).href] : []).concat([fichier]);
  const proc = spawn(process.execPath, args, { cwd: ICI, env: { ...propre, PORT: String(p0), TB_SONDES: '0', ...(rpcEssai ? { TB_RPC_TEST: rpcEssai } : {}), ...env } });
  let journal = '';
  proc.stdout.on('data', (d) => { journal += d; });
  proc.stderr.on('data', (d) => { journal += d; });
  let sorti = null;
  proc.on('exit', (code) => { sorti = code === null ? 'killed' : code; });
  const url = 'http://127.0.0.1:' + p0;
  const arreter = async () => {
    if (sorti === null) { try { proc.kill(); } catch (_) { /* deja parti */ } }
    for (let i = 0; i < 50 && sorti === null; i += 1) await pause(100);
    return sorti;
  };
  const debut = Date.now();
  let sante = null;
  while (Date.now() - debut < attenteMs && sorti === null) {
    try { const r = await fetch(url + '/sante', { signal: AbortSignal.timeout(2000) }); sante = await r.json(); break; } catch (_) { await pause(250); }
  }
  if (!sante) { await arreter(); throw new Error('the server did not start (exit ' + sorti + '): ' + journal.split('\n').slice(-6).join(' | ').slice(0, 400)); }
  const origines = () => {
    const joints = new Set(), bloques = new Set();
    for (const m of journal.matchAll(/\[garde-reseau\] (JOINT|BLOQUE) (\S+)/g)) (m[1] === 'JOINT' ? joints : bloques).add(m[2]);
    return { joints: [...joints], bloques: [...bloques] };
  };
  /* `pid` : sans lui, le fichier d etat d essai-wallet-simule-session ecrivait `pidServeur: undefined` et `--rendre` ne pouvait
   *   PAS arreter un serveur orphelin (vu le 2026-10-09 : « server pid undefined was not running »). */
  return { port: p0, url, pid: proc.pid, sante, arreter, journal: () => journal, origines, enVie: () => sorti === null };
}
