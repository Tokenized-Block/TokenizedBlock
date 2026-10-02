#!/usr/bin/env node
/* FFI helper for the fork tests (FOUNDRY_PROFILE=multipool): prints the Aerodrome Universal Router calldata that
 * multipool.js `construireRoute` builds for ONE V4 leg (block <-> stock on our hook). Pure: no RPC, no key, nothing sent.
 *   node route-multipool.mjs <new|old> <de> <vers> <c0> <c1> <fee> <tickSpacing> <hooks> <montant> <minSortie> <destinataire> <fraisIndice> <hookFacturant 0|1> <stock>
 * new = the fix branch (MP_NEW, default /workspace/tb-launchlock-mp) · old = 31d7700 as is (MP_OLD). */
import { pathToFileURL } from 'node:url';
const [quelle, de, vers, c0, c1, fee, ts, hooks, montant, minSortie, dest, fi, fact, stockArg] = process.argv.slice(2);
const dir = quelle === 'old' ? (process.env.MP_OLD || '/workspace/tb-launchlock-mp-base') : (process.env.MP_NEW || '/workspace/tb-launchlock-mp');
const mp = await import(pathToFileURL(dir + '/multipool.js').href);
const e = { venue: 'uniswap-v4', cle: { currency0: c0.toLowerCase(), currency1: c1.toLowerCase(), fee: Number(fee), tickSpacing: Number(ts), hooks: hooks.toLowerCase() } };
/* the admitted fee currency = the paired STOCK only (never the block) */
const admises = new Set([String(stockArg || '').toLowerCase()]);
const opts = { chemin: [{ de: de.toLowerCase(), vers: vers.toLowerCase(), e }], montant: BigInt(montant), minSortie: BigInt(minSortie),
  destinataire: dest.toLowerCase(), deadline: 1n << 40n, fraisIndice: Number(fi), admises };
if (fact === '1') opts.hooksFacturants = [hooks.toLowerCase()];
const r = mp.construireRoute(opts);
if (r.etat !== 'PRET') { process.stderr.write('REFUSE ' + r.pourquoi + '\n'); process.exit(1); }
process.stdout.write(r.data);
