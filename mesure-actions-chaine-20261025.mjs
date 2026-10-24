/* mesure-actions-chaine-20261025.mjs — LE PIPELINE DU SERVEUR (actions-chaine.js), JOUE EN ENTIER SUR LA VRAIE API ET LA VRAIE CHAINE.
 * lireActionsEmetteur (toutes les pages) -> candidatsActions -> decouvrirActions (preuve : code 0xef + log de la factory B20 + tx.from)
 * -> lireUnites -> routeAction (toutes celles qui ont des unites, table comprise). Les MEMES fonctions que serveur-web.js, sans budget
 * par tour (une passe complete). Compte « avant » (registre fige de l app a 857a529 : 71, table 25) et « apres ».
 * RPC : base-rpc.publicnode.com seulement, lecture seule. Usage : node mesure-actions-chaine-20261025.mjs [sortie.json] */
import { writeFileSync } from 'node:fs';
import { lireActionsEmetteur } from './actions-emetteur.js';
import { candidatsActions, decouvrirActions, lireUnites, routeAction } from './actions-chaine.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { ACTIONS_COINBASE } from './paires.js';

const AJOUTS_20261025 = new Set(['SANc', 'SEc', 'ULc', 'NOKc', 'LIc']);
const RPC = 'https://base-rpc.publicnode.com';
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
async function rpc(m, p) {
  for (let k = 0; k < 6; k += 1) {
    n += 1;
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: n, method: m, params: p }) });
      if (r.status === 429 || r.status >= 500) { await pause(1000 * (k + 1)); continue; }
      const j = await r.json();
      if (j.error) { if (/rate|limit/i.test(j.error.message)) { await pause(1000 * (k + 1)); continue; } throw new Error(j.error.message); }
      return j.result;
    } catch (e) { if (k === 5 || /revert|execution/i.test(e.message)) throw e; await pause(800 * (k + 1)); }
  }
  throw new Error('no answer');
}
const bloc = parseInt(await rpc('eth_blockNumber', []), 16);
const em = await lireActionsEmetteur(async (url) => (await fetch(url)).json());
console.log('emetteur : ' + em.etat + ' · ' + em.adresses.length + ' adresses · ' + em.pages + ' page(s)');
const candidats = candidatsActions({ emetteur: em.etat === 'OK' ? em.adresses : [], symbolesEmetteur: em.symboles || {} });
const tour = await decouvrirActions({ rpc, candidats, cache: new Map(), max: 10000 });
console.log('preuves : ' + tour.etat + ' · ' + tour.prouvees.length + ' prouvees, ' + tour.refusees.length + ' refusees, ' + tour.nonMesurees.length + ' non mesurees');
const appel = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
const registre = new Set(ACTIONS_COINBASE.map((a) => String(a.adr).toLowerCase()));
const lignes = [];
for (const p of tour.prouvees) {
  const u = await lireUnites({ rpc, adr: p.adr });
  const l = { adr: p.adr, sym: p.symboleEmetteur || p.symbole, unites: u === null ? null : String(u), registre: registre.has(p.adr), table: POOLS_ACTIONS_AERODROME.has(p.adr), route: null };
  if (u > 0n) {
    const v = await routeAction({ appel, adr: p.adr });
    l.route = v.etat === 'OK' ? (v.achetable ? 'ACHETABLE' : v.code) : 'NON_MESURE';
    l.ecartBps = v.ecartBps ?? null;
  }
  lignes.push(l);
}
const avecU = lignes.filter((l) => l.unites !== null && l.unites !== '0');
const ach = lignes.filter((l) => l.route === 'ACHETABLE');
const avantTable = (l) => l.table && !AJOUTS_20261025.has(l.sym);
const res = {
  bloc, rpc: RPC, requetes: n, emetteur: { etat: em.etat, n: em.adresses.length, pages: em.pages },
  preuves: { etat: tour.etat, prouvees: tour.prouvees.length, refusees: tour.refusees.length, nonMesurees: tour.nonMesurees.length },
  avecUnites: avecU.length, sansUnites: lignes.filter((l) => l.unites === '0').length, unitesNonLues: lignes.filter((l) => l.unites === null).length,
  routes: lignes.filter((l) => l.route).reduce((o, l) => { o[l.route] = (o[l.route] || 0) + 1; return o; }, {}),
  /* « tradable » = route ACHETABLE (la regle commune) — avant : la table seule donnait le Buy (25, sans regle), apres : la regle sur tout */
  tradableAvant_tableSansRegle: lignes.filter(avantTable).length,
  tradableApres: ach.length, tradableApresListe: ach.map((l) => l.sym),
  tableRefusees: lignes.filter((l) => l.table && l.route && l.route !== 'ACHETABLE').map((l) => l.sym + ':' + l.route + (l.ecartBps != null ? ' ' + l.ecartBps + 'bps' : '')),
  achetablesHorsRegistre: ach.filter((l) => !l.registre).map((l) => l.sym),
  avecUnitesHorsRegistre: avecU.filter((l) => !l.registre).map((l) => l.sym + ':' + l.route),
  lignes,
};
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(res, null, 1));
console.log(JSON.stringify({ ...res, lignes: undefined }, null, 1));
