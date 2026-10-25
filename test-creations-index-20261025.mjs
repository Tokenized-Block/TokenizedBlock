/* test-creations-index-20261025.mjs — LA WALLET NE RELIT PLUS DEPUIS LE NAVIGATEUR CE QUE L INDEX DU SERVEUR COUVRE DEJA.
 *
 * ⛔⛔ MESURE (2026-10-25, navigateur integre, 375 px, serveur local, wallet en lecture seule, page + Wallet + Bank, 60 s) :
 *     237 JSON-RPC navigateur, 70 eth_getLogs, et « ⚠️ 17 chain window(s) refused by the node » — le chiffre du testeur en prod.
 *     `mesCreations` relisait 43 200 blocs de la factory (22 fenetres) + la tx de chaque creation, alors que `/api/blocks-de`
 *     (en prod : couvertureComplete, 0 trou, 0 non resolu) savait deja quels blocks ce compte a crees.
 *
 * ⛔ CE TEST EXECUTE LE CODE LIVRE : `mesCreations` EXTRAITE de app.html, avec le vrai `listerCreations` / `creationsDe`
 *   (index-blocks.js), le vrai `planCreations`, un `rpc` de laboratoire qui compte les getLogs de la factory, et un `fetch`
 *   qui sert l index. Temoins negatifs : index absent, index trou, index qui ne remonte pas assez -> l ANCIEN balayage complet.
 * ⛔ UNE FENETRE REFUSEE RESTE DITE : une plage du reste refusee par le noeud arrive dans `r.fenetresRatees`, jamais en vide.
 * ⚠️ NE PROUVE PAS : que l index du serveur soit juste (il est cru sur ses bornes), ni les quotas reels des noeuds.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { listerCreations, creationsDe, FACTORY, FENETRE_MAX, TOPIC_CREATED } from './index-blocks.js';
import { planCreations, bornesIndex, INDEX_TROUS_MAX } from './creations-index.js';

let n = 0;
const v = async (nom, fn) => { try { await fn(); n++; } catch (e) { e.message = nom + ' — ' + e.message; throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

/* ── 1. le plan, pur ────────────────────────────────────────────────────────────────────────────── */
const TETE = 53_000_000, BLOCS = 43200, DEBUT = TETE - BLOCS;
const plein = (x = {}) => ({ ok: true, luJusqua: TETE - 300, couvertDepuis: 50_000_000, trousPlages: [], trousTronques: false, nonResolus: [], nonResolusTronques: false, ...x });
await v('index complet : seule la queue au-dela du scan serveur est lue ici', () => {
  const p = planCreations({ index: plein(), tete: TETE, blocs: BLOCS });
  assert.equal(p.mode, 'INDEX');
  assert.deepEqual(p.plages, [{ de: TETE - 299, a: TETE }]);
});
await v('un trou nomme DANS la fenetre est relu ici', () => {
  const p = planCreations({ index: plein({ trousPlages: [{ de: TETE - 9000, a: TETE - 8000 }, { de: 1, a: 2 }] }), tete: TETE, blocs: BLOCS });
  assert.equal(p.mode, 'INDEX');
  assert.deepEqual(p.plages, [{ de: TETE - 9000, a: TETE - 8000 }, { de: TETE - 299, a: TETE }]);
});
for (const [nom, idx] of [
  ['index non lu', null], ['ok false', plein({ ok: false })], ['tete du scan absente', plein({ luJusqua: null })],
  ['ne remonte pas assez', plein({ couvertDepuis: DEBUT + 1 })], ['trous tronques', plein({ trousTronques: true })],
  ['trous non dits (ancien serveur)', { ok: true, blocks: [] }], ['non resolus tronques', plein({ nonResolusTronques: true })],
  ['non resolu sans tx', plein({ nonResolus: [{ jeton: '0x' + 'b2'.repeat(20), tx: null }] })],
  ['scan serveur sous la fenetre', plein({ luJusqua: DEBUT - 5 })],
]) {
  await v('temoin : ' + nom + ' -> fenetre entiere, comme avant', () => {
    const p = planCreations({ index: idx, tete: TETE, blocs: BLOCS });
    assert.equal(p.mode, 'CHAINE');
    assert.deepEqual(p.plages, [{ de: DEBUT, a: TETE }]);
  });
}
await v('bornesIndex : borne la liste des trous et le dit', () => {
  const trous = Array.from({ length: INDEX_TROUS_MAX + 1 }, (_, i) => ({ de: TETE - 1000 - i * 10, a: TETE - 995 - i * 10 }));
  const b = bornesIndex({ blocsLusJusqua: TETE, rattrapageDepuis: 40_000_000, couvertureComplete: false, plancher: 30_000_000, trous });
  assert.equal(b.trousTronques, true);
  assert.equal(b.couvertDepuis, 40_000_000);
  assert.equal(planCreations({ index: { ok: true, ...b }, tete: TETE, blocs: BLOCS }).mode, 'CHAINE');
  const c = bornesIndex({ blocsLusJusqua: null, rattrapageDepuis: null, couvertureComplete: false, plancher: 1, trous: [] });
  assert.equal(c.luJusqua, null);
  assert.equal(planCreations({ index: { ok: true, ...c }, tete: TETE, blocs: BLOCS }).mode, 'CHAINE');
});

/* ── 2. mesCreations, extraite de app.html et executee ──────────────────────────────────────────── */
const i0 = app.indexOf('let lectureCreations = null;');
const iF = app.indexOf('function mesCreations()', i0);
const fin = /\r?\n\}\r?\n/.exec(app.slice(iF));
assert.ok(i0 > 0 && iF > i0 && fin, 'mesCreations introuvable dans app.html');
const i1 = iF + fin.index + fin[0].length;
const source = app.slice(i0, i1);
const COMPTE = '0x' + '31'.repeat(20);
const MIEN = '0xb2' + '00'.repeat(9) + 'aa'.repeat(10);
const hx = (x) => '0x' + x.toString(16);
const pad = (h) => h.replace(/^0x/, '').padStart(64, '0');
const enc = (s) => pad(hx(s.length)) + Buffer.from(s).toString('hex').padEnd(64, '0');
const logCreation = (jeton, bloc, tx) => ({ address: FACTORY, topics: [TOPIC_CREATED, '0x' + pad(jeton), '0x' + pad('0x0')],
  data: '0x' + pad(hx(96)) + pad(hx(160)) + pad(hx(18)) + enc('Mine') + enc('MIN'), blockNumber: hx(bloc), transactionHash: tx });
async function session({ index, refuseQueue = false }) {
  const appels = { factoryLogs: 0, tx: 0, blocksDe: 0 };
  const TXM = '0x' + 'ab'.repeat(32);
  const rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return hx(TETE);
    if (m === 'eth_getLogs') {
      appels.factoryLogs++;
      const de = parseInt(p[0].fromBlock, 16), a = parseInt(p[0].toBlock, 16);
      if (refuseQueue && a === TETE) throw new Error('HTTP 429 on https://mainnet.base.org');
      const b = TETE - 100; /* le block de CE compte, cree il y a 100 blocs : dans la queue que le serveur n a pas encore lue */
      return b >= de && b <= a ? [logCreation(MIEN, b, TXM)] : [];
    }
    if (m === 'eth_getTransactionByHash') { appels.tx++; return { from: COMPTE, blockNumber: hx(1) }; }
    throw new Error('rpc inattendu ' + m);
  };
  const fetch = async (url) => {
    assert.ok(String(url).startsWith('/api/blocks-de?adr='), 'fetch inattendu ' + url);
    appels.blocksDe++;
    if (index === 'panne') throw new Error('reseau');
    return { ok: true, json: async () => ({ blocks: ['0x' + 'b2'.repeat(20)], ...index }) };
  };
  const f = new Function('listerCreations', 'creationsDe', 'planCreations', 'rpc', 'fetch', 'CHAINE', 'compte',
    source + '\nreturn mesCreations;');
  const mes = f(listerCreations, creationsDe, planCreations, rpc, fetch, 8453, COMPTE);
  const res = await mes();
  return { appels, res };
}
const fenetresCompletes = Math.ceil((BLOCS + 1) / FENETRE_MAX) + 1;
await v('⛔⛔ index complet : 1 getLogs de la factory au lieu de ~22, le block recent est TROUVE, celui de l index aussi', async () => {
  const { appels, res } = await session({ index: plein() });
  assert.ok(appels.factoryLogs <= 1, 'le navigateur relit encore ' + appels.factoryLogs + ' fenetres de la factory');
  const jetons = res.gardees.map((c) => String(c.jeton).toLowerCase());
  assert.ok(jetons.includes(MIEN), 'le block cree il y a 100 blocs (queue non scannee par le serveur) a disparu');
  assert.ok(jetons.includes('0x' + 'b2'.repeat(20)), 'le block de l index serveur a disparu');
  assert.equal(res.r.fenetresRatees.length, 0);
});
await v('temoin : index ANCIEN (sans bornes) -> balayage complet, exactement comme avant', async () => {
  const { appels, res } = await session({ index: { ok: true } });
  assert.ok(appels.factoryLogs >= fenetresCompletes - 2, 'seulement ' + appels.factoryLogs + ' fenetres sans bornes d index');
  assert.ok(res.gardees.some((c) => String(c.jeton).toLowerCase() === MIEN));
});
await v('temoin : index en panne -> balayage complet, la liste locale reste', async () => {
  const { appels, res } = await session({ index: 'panne' });
  assert.ok(appels.factoryLogs >= fenetresCompletes - 2);
  assert.ok(res.gardees.some((c) => String(c.jeton).toLowerCase() === MIEN));
});
await v('⛔ la queue refusee par le noeud reste NON LUE et se dit (jamais « aucun block »)', async () => {
  const { res } = await session({ index: plein(), refuseQueue: true });
  assert.equal(res.r.fenetresRatees.length, 1, 'la fenetre refusee a ete tue');
  assert.ok(res.r.fenetre && res.r.fenetre.a === TETE && res.r.fenetre.de === DEBUT, 'la fenetre annoncee n est plus celle des 43 200 blocs');
});
await v('un createur non resolu par le serveur est lu ICI (sa tx), pas oublie', async () => {
  const autre = '0xb2' + '00'.repeat(9) + 'cc'.repeat(10);
  const { appels, res } = await session({ index: plein({ nonResolus: [{ jeton: autre, tx: '0x' + 'cd'.repeat(32) }] }) });
  assert.ok(appels.tx >= 2, 'la tx du non resolu n a pas ete lue');
  assert.ok(res.gardees.some((c) => String(c.jeton).toLowerCase() === autre));
});
/* ── 3. les refus PERMANENTS mesures le meme jour, et Retry-After ───────────────────────────────────────────────────────
 *   Mesure (meme session) : 10 eth_getLogs SANS adresse (les blocks recus par le wallet, mes-blocks.js frappesVers) envoyes a
 *   publicnode, 10 refus « -32701 Please specify an address in your request » — permanent, et `rpcReseau` jette sur une erreur
 *   JSON-RPC sans essayer le noeud suivant : la fenetre etait perdue a coup sur. */
const { noeudPeutServir, creerRegulateur } = await import('./regulateur-rpc.js');
const PUB = 'https://base-rpc.publicnode.com', ORG = 'https://mainnet.base.org';
await v('publicnode ne recoit plus un getLogs sans adresse', () => {
  assert.equal(noeudPeutServir(PUB, 'eth_getLogs', [{ fromBlock: '0x1', toBlock: '0x2', topics: ['0x1'] }]), false);
  assert.equal(noeudPeutServir(PUB, 'eth_getLogs', [{ fromBlock: '0x1', toBlock: '0x2', address: [], topics: ['0x1'] }]), false);
  assert.equal(noeudPeutServir(PUB, 'eth_getLogs', [{ fromBlock: '0x1', toBlock: '0x2', address: '0x' + '11'.repeat(20) }]), true);
  assert.equal(noeudPeutServir(ORG, 'eth_getLogs', [{ fromBlock: '0x1', toBlock: '0x2', topics: ['0x1'] }]), true);
});
await v('un 429 avec Retry-After repose le noeud au moins ce temps-la (borne a 60 s)', () => {
  let t = 1000;
  const r = creerRegulateur({ maintenant: () => t });
  r.noter(ORG, 'debit', { methode: 'eth_call', retryApresMs: 20000 });
  t += 19000; assert.equal(r.auRepos(ORG), true, 'le noeud est repris avant son Retry-After');
  t += 2000; assert.equal(r.auRepos(ORG), false);
  const r2 = creerRegulateur({ maintenant: () => t });
  r2.noter(ORG, 'debit', { methode: 'eth_call', retryApresMs: 3_600_000 });
  t += 61000; assert.equal(r2.auRepos(ORG), false, 'un Retry-After d une heure gele le noeud');
});
await v('Retry-After lu dans app.html sur le 429 (secondes ou date HTTP)', () => {
  assert.ok(/retryApresMs: retryApres\(r\)/.test(app), 'rpcReseau ne transmet pas Retry-After au regulateur');
});
console.log('test-creations-index-20261025 : ' + n + ' verts');
