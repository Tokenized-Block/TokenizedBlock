/* compter-lectures-plan-20261004.mjs — COMBIEN DE LECTURES DE CHAINE UN PLAN DEMANDE-T-IL, ET COMBIEN DE TEMPS SI CHACUNE COUTE D ms ?
 *
 * Copie de l outil de session `compter-lectures.mjs` (2026-10-04), rendue portable (chemins relatifs) et comparable :
 *   node compter-lectures-plan-20261004.mjs [dossier des modules] [delai ms par lecture] [froid]
 *   - sans argument : les modules de CE dossier, 0 ms ajoute ;
 *   - avec un dossier : les modules d un AUTRE arbre (ex. l arbre de prod), pour comparer avant / apres avec le MEME instrument ;
 *   - `froid` : la memoire des decimales est videe avant CHAQUE plan (le premier plan d un jeton apres un redemarrage). Sans ce
 *     mot, les plans se suivent dans le meme processus, comme sur le serveur : les decimales deja lues ne sont pas relues.
 *
 * ⛔ CE QUE L OUTIL FAIT : il n envoie QUE des lectures au fork local (http://127.0.0.1:8549) — `eth_call`, `eth_getCode`,
 *   `eth_getBalance`, `eth_estimateGas`, `eth_gasPrice`. Aucune transaction, aucun `evm_*`, aucun `anvil_*` : toute autre
 *   methode est refusee AVANT l envoi.
 * ⛔ CE QU IL MESURE : le NOMBRE de lectures d un plan, le nombre MAXIMAL de lectures en vol au meme instant, et le temps mur
 *   quand on AJOUTE un delai fixe a chaque lecture (un modele de noeud lent : chaque lecture coute D ms, sans limite de debit).
 * ⛔ CE QU IL NE MESURE PAS : le temps en production. Les noeuds publics LIMITENT le debit : des lectures en parallele peuvent
 *   y etre refusees (429) et reessayees par `rpcRails`, ce que ce modele ne reproduit pas. Le gain reel ne se lit qu apres un deploy.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ICI = new URL('./', import.meta.url);
const D = process.argv[2] ? pathToFileURL(resolve(process.argv[2]) + '/') : ICI;
const DELAI = Number(process.argv[3] || 0);
/* ⛔ 2026-10-09 : le port 8549 est dans une plage RESERVEE par Windows sur cette machine (os error 10013) ; le fork tourne sur 9549.
 *   Le port se passe par TB_FORK_PORT, 8549 reste le defaut historique. */
const FORK = 'http://127.0.0.1:' + (Number(process.env.TB_FORK_PORT) || 8549);
/* les seules methodes envoyees : des LECTURES (aucune ne change l etat du fork) ; tout le reste est refuse avant l envoi */
const LECTURES = new Set(['eth_call', 'eth_getCode', 'eth_getBalance', 'eth_estimateGas', 'eth_gasPrice']);

const FROID = process.argv[4] === 'froid';
const R = await import(new URL('rails-api.js', D));
/* l arbre d avant n a pas de memoire des decimales : rien a vider chez lui */
const { oublierDecimales = null } = await import(new URL('marche.js', D));
const { ACTIONS_COINBASE } = await import(new URL('paires.js', D));
const { V4_ADRESSES } = await import(new URL('lancer-pool.js', D));
const { USDC_BASE } = await import(new URL('frais-creation.js', D));
const { LOGS_INITIALIZE_ACTIONS } = await import(new URL('cles-v4-actions.js', D));
const { decoderInitialize } = await import(new URL('pools-du-jeton.js', D));
const { POOLS_ACTIONS_AERODROME } = await import(new URL('pools-actions-aerodrome.js', D));
const { WETH_BASE } = await import(new URL('plan-eth-block.js', D));
/* l adresse du block de sonde est LUE dans le serveur du meme arbre, jamais recopiee */
const BLOCK = (readFileSync(new URL('serveur-web.js', D), 'utf8').match(/const BLOCK_SONDE = '(0x[0-9a-f]{40})';/) || [])[1];

const adr = (s) => String(ACTIONS_COINBASE.find((a) => a.symbole === s).adr).toLowerCase();
const usdc = USDC_BASE.toLowerCase(), pm = String(V4_ADRESSES[8453].poolm).toLowerCase(), weth = String(WETH_BASE).toLowerCase();
const cles = new Map();
for (const l of LOGS_INITIALIZE_ACTIONS) {
  const d = decoderInitialize(l);
  if (d && d.cle) for (const c of [d.cle.currency0, d.cle.currency1]) { const k = String(c).toLowerCase(); if (k !== usdc) cles.set(k, [d.cle]); }
}

let id = 0;
const lignes = [];
async function mesurer(nom, de, vers, montant, compte) {
  const par = new Map(); let n = 0, echecs = 0, enVol = 0, maxEnVol = 0;
  const rpc = async (method, params) => {
    if (!LECTURES.has(method)) throw new Error('this tool only reads: ' + method + ' refused');
    n += 1; enVol += 1; if (enVol > maxEnVol) maxEnVol = enVol;
    const cible = method === 'eth_call' ? String(params[0].to).toLowerCase() + ' ' + String(params[0].data).slice(0, 10) : method;
    par.set(cible, (par.get(cible) || 0) + 1);
    try {
      if (DELAI) await new Promise((ok) => setTimeout(ok, DELAI));
      const j = await (await fetch(FORK, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })).json();
      if (j.error) { echecs += 1; const e = new Error(j.error.message); e.data = j.error.data; throw e; }
      return j.result;
    } finally { enVol -= 1; }
  };
  if (FROID && typeof oublierDecimales === 'function') oublierDecimales();
  const t0 = Date.now();
  const p = await R.planRail({ de, vers, montant: String(montant), compte }, { rpc, clesDe: async (a) => cles.get(String(a).toLowerCase()) || [] });
  const ms = Date.now() - t0;
  lignes.push({ nom, etat: p.etat, via: p.via || null, lectures: n, erreurs: echecs, maxEnVol, ms });
  console.log(nom.padEnd(18) + String(p.etat).padEnd(13) + String(n).padStart(3) + ' lectures, ' + String(echecs).padStart(2) + ' en erreur (revert), '
    + String(maxEnVol).padStart(2) + ' en vol au plus, ' + String(ms).padStart(6) + ' ms' + (p.etat === 'PRET' || p.etat === 'APPROBATIONS' ? '' : '  | ' + String(p.pourquoi).slice(0, 90)));
  for (const [k, v] of [...par.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) console.log('     ' + String(v).padStart(3) + ' x ' + k);
}

console.log('modules : ' + D.href + '   delai ajoute par lecture : ' + DELAI + ' ms   decimales : ' + (FROID ? 'videes avant chaque plan' : 'gardees d un plan a l autre') + '   block de sonde : ' + BLOCK);
await mesurer('USDC > LLYc', usdc, adr('LLYc'), 5000000n, pm);
await mesurer('ETH > LLYc', 'ETH', adr('LLYc'), 2000000000000000n, weth);
await mesurer('LLYc > USDC', adr('LLYc'), usdc, 100000n, pm);
await mesurer('LLYc > ETH', adr('LLYc'), 'ETH', 100000n, pm);
await mesurer('LLYc > block', adr('LLYc'), BLOCK, 100000n, pm);
await mesurer('ETH > block', 'ETH', BLOCK, 100000000000000n, weth);
await mesurer('ETH > USDC', 'ETH', usdc, 1000000000000000n, weth);
await mesurer('USDC > ETH', usdc, 'ETH', 5000000n, pm);
await mesurer('USDC > NVDAc', usdc, adr('NVDAc'), 5000000n, pm);
await mesurer('ETH > NVDAc', 'ETH', adr('NVDAc'), 2000000000000000n, weth);
await mesurer('NVDAc > ETH', adr('NVDAc'), 'ETH', 100000n, String(POOLS_ACTIONS_AERODROME.get(adr('NVDAc')).pool).toLowerCase());
console.log('JSON ' + JSON.stringify(lignes));
