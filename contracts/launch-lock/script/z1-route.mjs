#!/usr/bin/env node
/* Zero 1 FFI: multipool.js construireRoute for an N-hop V4 path. Pure (no RPC, no key, nothing sent).
 * arg1 = new|old ; arg2 = JSON {hops:[{de,vers,c0,c1,fee,ts,hooks}], montant, dest, fi, fact:[hooks], admises:[tokens]} */
import { pathToFileURL } from 'node:url';
const [quelle, js] = process.argv.slice(2);
const q = JSON.parse(js);
const dir = quelle === 'old' ? process.env.MP_OLD : process.env.MP_NEW;
const mp = await import(pathToFileURL(dir + '/multipool.js').href);
const b = (x) => String(x).toLowerCase();
const chemin = q.hops.map((h) => ({ de: b(h.de), vers: b(h.vers), e: { venue: 'uniswap-v4',
  cle: { currency0: b(h.c0), currency1: b(h.c1), fee: Number(h.fee), tickSpacing: Number(h.ts), hooks: b(h.hooks) } } }));
const opts = { chemin, montant: BigInt(q.montant), minSortie: 1n, destinataire: b(q.dest), deadline: 1n << 40n,
  fraisIndice: Number(q.fi), admises: new Set(q.admises.map(b)) };
if (q.fact && q.fact.length) opts.hooksFacturants = q.fact.map(b);
const r = mp.construireRoute(opts);
if (r.etat !== 'PRET') { process.stderr.write('REFUSE ' + r.pourquoi + '\n'); process.stdout.write('0x'); process.exit(0); }
process.stdout.write(r.data);
