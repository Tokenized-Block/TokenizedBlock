/* mesurer-usage-onchain-20261027.mjs -- READ-ONLY measure of the app's on-chain usage (users, DAU, WAU, volume), for a grant form.
 *
 * usage: node mesures/mesurer-usage-onchain-20261027.mjs [rpcUrl]   (default: https://base-rpc.publicnode.com)
 * Writes mesures/usage-onchain-20261027.json. Rules: usage-onchain.js (shared with GET /api/usage).
 * ⛔ No signing, no sending, no key: only eth_blockNumber / eth_getLogs / eth_getTransactionByHash / eth_getTransactionReceipt /
 *   eth_getBlockByNumber / eth_call. A window the node refuses is written to `nonLus` and NEVER counted as empty.
 * ⛔ Never process.exit after a fetch (Windows/Node 24 libuv assertion, outils/poser-rpc-archive.mjs): exitCode only. */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOC_DEPART, SECONDES_PAR_BLOC, STATE_VIEW, CONTRATS, HOOKS, EQUIPE, balayerFenetre, ligneDeTx, compter } from '../usage-onchain.js';
import { prixEthUsd } from '../prix-eth.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RPC = process.argv[2] || 'https://base-rpc.publicnode.com';
const FENETRE = 50000;
const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
const stats = { appels: 0, relances: 0 };

/** One JSON-RPC call (or a batch when `corps` is an array), retried with backoff on 429 / rate limits / timeouts. */
async function brut(corps) {
  let dernier = null;
  for (let k = 0; k < 7; k += 1) {
    stats.appels += 1;
    try {
      const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps), signal: AbortSignal.timeout(60000) });
      if (r.status === 429 || r.status >= 500) throw Object.assign(new Error('HTTP ' + r.status), { relance: true });
      const j = await r.json();
      const errs = (Array.isArray(j) ? j : [j]).map((x) => x && x.error).filter(Boolean);
      if (errs.some((e) => /rate|limit reached|too many requests|busy|timeout/i.test(String(e.message)) && !/range|exceed/i.test(String(e.message)))) {
        throw Object.assign(new Error(String(errs[0].message)), { relance: true });
      }
      return j;
    } catch (e) {
      dernier = e;
      if (!(e.relance || /abort|timeout|fetch failed|ECONN/i.test(String(e && (e.name + ' ' + e.message))))) throw e;
      stats.relances += 1;
      await attendre(1000 * 2 ** k);
    }
  }
  throw new Error('gave up after retries: ' + String(dernier && dernier.message));
}
async function rpc(methode, params) {
  const j = await brut({ jsonrpc: '2.0', id: 1, method: methode, params });
  if (j.error) throw new Error(String(j.error.message || 'rpc error'));
  return j.result;
}

async function main() {
  const t0 = Date.now();
  const tete = parseInt(await rpc('eth_blockNumber', []), 16) - 5;
  const bTete = await rpc('eth_getBlockByNumber', ['0x' + tete.toString(16), false]);
  const tsTete = parseInt(bTete.timestamp, 16);
  const tsDe = (b) => tsTete - (tete - b) * SECONDES_PAR_BLOC;
  /* the 2 s block time is CHECKED on three blocks, not assumed */
  const controleTemps = [];
  for (const b of [tete - 30 * 43200, tete - 7 * 43200, tete - 43200]) {
    try { const x = await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false]); controleTemps.push({ bloc: b, lu: parseInt(x.timestamp, 16), calcule: tsDe(b) }); }
    catch (e) { controleTemps.push({ bloc: b, erreur: String(e.message).slice(0, 120) }); }
  }
  console.log('head', tete, new Date(tsTete * 1000).toISOString(), 'time check', JSON.stringify(controleTemps));

  const pools = new Map();
  const hashes = new Set();
  const nonLus = [];
  /* USAGE_DEPART: a smoke run on a recent range only (the published JSON is always a full run from BLOC_DEPART) */
  const depart = Number(process.env.USAGE_DEPART) > 0 ? Number(process.env.USAGE_DEPART) : BLOC_DEPART;
  for (let de = depart; de <= tete; de += FENETRE) {
    const a = Math.min(tete, de + FENETRE - 1);
    const r = await balayerFenetre({ rpc, de, a, pools, min: 1000 });
    for (const h of r.hashes) hashes.add(h);
    nonLus.push(...r.nonLus);
    console.log('window', de, a, 'pools', pools.size, 'txs', hashes.size, 'unread', nonLus.length, Math.round((Date.now() - t0) / 1000) + 's');
  }

  /* tx + receipt, batched 10 hashes (20 calls) per request */
  const lus = new Map();
  const liste = [...hashes];
  for (let i = 0; i < liste.length; i += 10) {
    const lot = liste.slice(i, i + 10);
    const corps = lot.flatMap((h, k) => [{ jsonrpc: '2.0', id: 2 * k, method: 'eth_getTransactionByHash', params: [h] },
      { jsonrpc: '2.0', id: 2 * k + 1, method: 'eth_getTransactionReceipt', params: [h] }]);
    let rep = null;
    try { rep = await brut(corps); } catch (e) { rep = []; }
    const parId = new Map((Array.isArray(rep) ? rep : []).map((x) => [x.id, x.result]));
    lot.forEach((h, k) => lus.set(h, { tx: parId.get(2 * k) || null, recu: parId.get(2 * k + 1) || null }));
  }
  /* second pass, one by one, for whatever the batch missed */
  for (const [h, v] of lus) {
    if (v.tx && v.recu) continue;
    try { v.tx = v.tx || await rpc('eth_getTransactionByHash', [h]); v.recu = v.recu || await rpc('eth_getTransactionReceipt', [h]); } catch (_) { /* stays NOT_READ */ }
  }

  /* ETH price: on-chain median of 4 v4 ETH/USDC pools (prix-eth.js), read at the LAST block of each UTC day that has a tx */
  const prixJour = {};
  const jourDe = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
  const jours = new Set([...lus.values()].filter((v) => v.recu).map((v) => jourDe(tsDe(parseInt(v.recu.blockNumber, 16)))));
  for (const j of [...jours].sort()) {
    const finJour = Date.parse(j + 'T23:59:59Z') / 1000;
    const b = Math.min(tete, tete - Math.ceil((tsTete - finJour) / SECONDES_PAR_BLOC));
    const rpcA = (m, p) => rpc(m, m === 'eth_call' ? [p[0], '0x' + b.toString(16)] : p);
    const r = await prixEthUsd({ rpc: rpcA, stateView: STATE_VIEW });
    prixJour[j] = { bloc: b, etat: r.etat, usd: r.usd, lectures: r.lectures, ecart: r.ecart, pourquoi: r.pourquoi };
  }

  const lignes = [];
  const refus = {};
  const refusDetail = [];
  for (const [h, v] of lus) {
    const ts = v.recu ? tsDe(parseInt(v.recu.blockNumber, 16)) : null;
    const p = ts ? prixJour[jourDe(ts)] : null;
    const r = ligneDeTx({ tx: v.tx ? v.tx : { hash: h }, recu: v.recu, pools, ethUsd: p && p.usd, ts });
    if (r.refus) { refus[r.refus] = (refus[r.refus] || 0) + 1; refusDetail.push({ h, refus: r.refus, to: v.tx && v.tx.to, from: v.tx && v.tx.from, b: v.recu && parseInt(v.recu.blockNumber, 16) }); continue; }
    lignes.push(r);
  }
  lignes.sort((x, y) => x.b - y.b);
  const resultats = compter(lignes, { finTs: tsTete });
  /* per category: a tx can carry several categories, so these do not add up to the total */
  const parCategorie = {};
  for (const r of lignes) for (const c of r.cats) {
    const s = parCategorie[c] || (parCategorie[c] = { txs: 0, senders: new Set(), usd: 0 });
    s.txs += 1; s.senders.add(r.from); s.usd += r.usd;
  }
  for (const c of Object.keys(parCategorie)) parCategorie[c] = { txs: parCategorie[c].txs, senders: parCategorie[c].senders.size, usd: Math.round(parCategorie[c].usd * 100) / 100 };
  const nonPrix = {};
  for (const r of lignes) for (const n of r.nonPrice) nonPrix[n] = (nonPrix[n] || 0) + 1;
  const equipe = EQUIPE.map((e) => ({ ...e, txs: lignes.filter((r) => r.from === e.adresse).length }));

  const sortie = {
    mesure: 'usage-onchain-20261027', rpc: RPC, regles: 'usage-onchain.js',
    fin: { bloc: tete, ts: tsTete, iso: new Date(tsTete * 1000).toISOString() }, depart, fenetre: FENETRE,
    controleTemps, contrats: CONTRATS, hooks: HOOKS, equipe,
    poolsSurNosHooks: [...pools.entries()].map(([id, p]) => ({ id, ...p })),
    nonLus, refus, refusDetail, prixEthParJour: prixJour, nonPrix, parCategorie, resultats,
    appels: stats, dureeS: Math.round((Date.now() - t0) / 1000),
    lignes: lignes.map((r) => ({ h: r.h, b: r.b, ts: r.ts, from: r.from, cats: r.cats, usd: Math.round(r.usd * 1e6) / 1e6, nonPrice: r.nonPrice, ...(r.derive ? { derive: true } : {}) })),
    txsVolumeDerivedFromFee: lignes.filter((r) => r.derive).length,
  };
  writeFileSync(path.join(ICI, depart === BLOC_DEPART ? 'usage-onchain-20261027.json' : 'usage-onchain-essai.json'),JSON.stringify(sortie, null, 1));
  console.log(JSON.stringify({ resultats, parCategorie, nonLus: nonLus.length, refus, nonPrix }, null, 1));
}

main().catch((e) => { console.error('FAILED', e && e.stack || e); process.exitCode = 1; });
