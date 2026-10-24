/* Replays the server pass (actionsChaineTour logic, same module functions, same bounds) against the production default nodes,
 * read-only, and counts JSON-RPC calls: pass 1 cold (no disk), pass 2 right after, pass 3 with every route older than ROUTE_TTL_MS
 * (pool cache warm). Prints per-pass counts; per-hour is derived in the report from these. */
import { writeFileSync } from 'node:fs';
import { candidatsActions, decouvrirActions, lireUnites, routeAction, routeServie, lecteurPreuves, ROUTES_PAR_TOUR, ROUTE_TTL_MS } from './actions-chaine.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { lireActionsEmetteur } from './actions-emetteur.js';
const LISTE = ['https://mainnet.base.org', 'https://base.drpc.org'];
let id = 0, tour = 0;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function un(url, m, p) {
  const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(12000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
  const j = await r.json().catch(() => null);
  if (!j) throw new Error('HTTP ' + r.status);
  if (j.error) { const e = new Error(String(j.error.message)); e.definitif = !/rate|limit|timeout|exceed|too many|capacity|unavailable|busy/i.test(e.message); throw e; }
  return j.result;
}
let http = 0;
async function rails(m, p) { /* like rpcRails: rotation, a read answering 0x is retried, a revert is final */
  let dernier;
  for (let k = 0; k < LISTE.length * 2; k += 1) {
    const url = LISTE[tour++ % LISTE.length]; http += 1;
    try { const r = await un(url, m, p); if (r === '0x') { dernier = new Error('empty'); continue; } return r; }
    catch (e) { if (e.definitif) throw e; dernier = e; await pause(200 * (k + 1)); }
  }
  throw dernier;
}
const serveur = async (m, p) => { http += 1; return un(LISTE[0], m, p); };
const drpc = async (m, p) => { http += 1; return un(LISTE[1], m, p); };
const c = { preuves: 0, unites: 0, routes: 0, bloc: 0 };
const compte = (f, k) => async (...a) => { c[k] += 1; return f(...a); };
const em = await lireActionsEmetteur(async (u) => { const x = await fetch(u, { headers: { 'x-ms-monitor': '1' }, signal: AbortSignal.timeout(10000) }); return x.ok ? x.json() : null; });
const preuves = new Map(), unites = new Map(), routes = new Map(), pools = new Map();
const res = [];
let decalage = 0; /* simulated clock offset */
const noms = ['froid-1','froid-2','froid-3','froid-4','froid-5','froid-6','froid-7','froid-8','aussitot','apres-TTL'];
let demarrage = true;
for (const nom of noms) {
  if (nom === 'aussitot' && demarrage) { /* drained */ }
  if (nom === 'apres-TTL') decalage += ROUTE_TTL_MS + 1000;
  const maintenant = () => Date.now() + decalage;
  for (const k of Object.keys(c)) c[k] = 0; http = 0;
  const t0 = Date.now();
  const cand = candidatsActions({ emetteur: em.etat === 'OK' ? em.adresses : [], symbolesEmetteur: em.symboles || {} });
  const t = await decouvrirActions({ rpc: compte(lecteurPreuves([serveur, drpc]), 'preuves'), candidats: cand, cache: preuves, pause: 120 });
  let ul = 0;
  for (const p of t.prouvees) { const u = unites.get(p.adr); if (u && u.v !== null && maintenant() - u.t < 6 * 3600e3) continue; if (ul >= 60) break; ul += 1; unites.set(p.adr, { v: await lireUnites({ rpc: compte(rails, 'unites'), adr: p.adr }), t: maintenant() }); }
  const age = (a) => { const r = routes.get(a); return r ? r.t : 0; };
  const ordre = [...t.prouvees].sort((x, y) => (Number(POOLS_ACTIONS_AERODROME.has(y.adr)) - Number(POOLS_ACTIONS_AERODROME.has(x.adr))) || (age(x.adr) - age(y.adr)));
  const bloc = parseInt(await compte(rails, 'bloc')('eth_blockNumber', []), 16) - 10;
  const appel = compte((to, data) => rails('eth_call', [{ to, data }, '0x' + bloc.toString(16)]), 'routes');
  let rl = 0;
  for (const p of ordre) {
    const u = unites.get(p.adr); if (!u || !(u.v > 0n)) continue;
    const r = routes.get(p.adr); if (r && maintenant() - r.t < ROUTE_TTL_MS) continue;
    if (rl >= ROUTES_PAR_TOUR) break; rl += 1;
    const v = await routeAction({ appel, adr: p.adr, cachePools: pools, bloc, maintenant: maintenant() });
    if (v.etat === 'OK') routes.set(p.adr, { r: routeServie(v), t: maintenant() });
  }
  const ligne = { tour: nom, etat: t.etat, prouvees: t.prouvees.length, refusees: t.refusees.length, nonMesurees: t.nonMesurees.length,
    nonMesureesCodes: t.nonMesurees.reduce((o, x) => { o[x.code] = (o[x.code] || 0) + 1; return o; }, {}), neuves: t.neuves, unitesLues: ul, routesLues: rl,
    appels: { ...c, total: c.preuves + c.unites + c.routes + c.bloc }, requetesHttp: http, secondes: Math.round((Date.now() - t0) / 1000), bloc };
  res.push(ligne); console.log(JSON.stringify(ligne));
  if (nom.startsWith('froid') && t.etat === 'COMPLET' && rl < ROUTES_PAR_TOUR) { const i = noms.indexOf('aussitot'); noms.splice(noms.indexOf(nom) + 1, i - noms.indexOf(nom) - 1); }
}
/* passes needed to drain: cold has PREUVES_PAR_TOUR=40 bound; report it */
writeFileSync(process.argv[2] || 'cout-tours.json', JSON.stringify(res, null, 1));
