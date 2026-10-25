/* test-creations-index-20261025.mjs — LA WALLET ET LA MAP NE RELISENT PLUS DEPUIS LE NAVIGATEUR CE QUE L INDEX DU SERVEUR COUVRE DEJA.
 *
 * ⛔⛔ MESURE (2026-10-25, navigateur integre, 375 px, serveur local, wallet en lecture seule, page + Wallet + Bank, 60 s) :
 *     237 JSON-RPC navigateur, 70 eth_getLogs, et « ⚠️ 17 chain window(s) refused by the node » — le chiffre du testeur en prod.
 *     `mesCreations` relisait 43 200 blocs de la factory (22 fenetres) + la tx de chaque creation, alors que `/api/blocks-de`
 *     (en prod : couvertureComplete, 0 trou, 0 non resolu) savait deja quels blocks ce compte a crees.
 * ⛔⛔ REVUE ADVERSE DE 2855ce8 (sonde rev-sonde-symbole.mjs) : un block cree il y a 5 000 blocs, couvert par l index, revenait
 *     { symbole: null, bloc: null } et APRES un block plus ancien — « ? » a la Wallet. Le cas (P) ci-dessous rougit sur 2855ce8
 *     (TB_RACINE=<copie de 2855ce8> node test-creations-index-20261025.mjs) et verdit ici.
 * ⛔ CE TEST EXECUTE LE CODE LIVRE : `mesCreations` EXTRAITE de app.html, `rpcReseau` EXTRAITE de app.html, le vrai
 *   `listerCreations` / `creationsDe` (index-blocks.js), le vrai creations-index.js (`planCreations`, `creationsDeLaCarte`) et le
 *   vrai regulateur-rpc.js, contre un `rpc` / `fetch` de laboratoire qui comptent. Temoins negatifs : index absent, ancien, troue
 *   sans liste, tronque, trop court -> l ANCIEN balayage complet. Mutants a la fin : chacun DOIT rougir.
 * ⛔ UNE FENETRE REFUSEE RESTE DITE : une plage du reste refusee par le noeud arrive dans `r.fenetresRatees`, jamais en vide.
 * ⚠️ NE PROUVE PAS : que l index du serveur soit juste (c est test-creations-index-serveur-20261025 qui confronte les bornes
 *   publiees par le VRAI serveur a ce qu il a reellement lu), ni les quotas reels des noeuds.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { strict as assert } from 'node:assert';

const RACINE = process.env.TB_RACINE ? pathToFileURL(process.env.TB_RACINE.replace(/[\\/]*$/, '/')) : new URL('./', import.meta.url);
const { listerCreations, creationsDe, FACTORY, FENETRE_MAX, TOPIC_CREATED } = await import(new URL('index-blocks.js', RACINE).href);
const brutCI = readFileSync(new URL('creations-index.js', RACINE), 'utf8');
const brutReg = readFileSync(new URL('regulateur-rpc.js', RACINE), 'utf8');
const charger = (txt) => import('data:text/javascript,' + encodeURIComponent(txt));
const CI = await charger(brutCI);
const { planCreations, bornesIndex, INDEX_TROUS_MAX } = CI;

let n = 0;
const v = async (nom, fn) => { try { await fn(); n++; } catch (e) { e.message = nom + ' — ' + e.message; throw e; } };
const app = readFileSync(new URL('app.html', RACINE), 'utf8');

/* ── 1. le plan, pur ────────────────────────────────────────────────────────────────────────────── */
const TETE = 53_000_000, BLOCS = 43200, DEBUT = TETE - BLOCS;
const plein = (x = {}) => ({ ok: true, luJusqua: TETE - 300, couvertDepuis: 50_000_000, trousPlages: [], trousTronques: false, nonResolus: [], nonResolusTronques: false,
  faitsDepuis: DEBUT - 1000, ...x });
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
await v('⛔ sous `faitsDepuis` (le serveur n a ni symbole ni bloc) la fenetre est relue ICI', () => {
  const p = planCreations({ index: plein({ faitsDepuis: DEBUT + 5000 }), tete: TETE, blocs: BLOCS });
  assert.equal(p.mode, 'INDEX');
  assert.deepEqual(p.plages, [{ de: DEBUT, a: DEBUT + 4999 }, { de: TETE - 299, a: TETE }]);
});
for (const [nom, idx] of [
  ['index non lu', null], ['ok false', plein({ ok: false })], ['tete du scan absente', plein({ luJusqua: null })],
  ['ne remonte pas assez', plein({ couvertDepuis: DEBUT + 1 })], ['trous tronques', plein({ trousTronques: true })],
  ['trous non dits (ancien serveur)', { ok: true, blocks: [] }], ['non resolus tronques', plein({ nonResolusTronques: true })],
  ['non resolu sans tx', plein({ nonResolus: [{ jeton: '0x' + 'b2'.repeat(20), tx: null }] })],
  ['scan serveur sous la fenetre', plein({ luJusqua: DEBUT - 5 })],
  ['faits non servis (serveur 2855ce8)', plein({ faitsDepuis: undefined })],
  ['faits depuis la tete', plein({ faitsDepuis: TETE })],
]) {
  await v('temoin : ' + nom + ' -> fenetre entiere, comme avant', () => {
    const p = planCreations({ index: idx, tete: TETE, blocs: BLOCS });
    assert.equal(p.mode, 'CHAINE');
    assert.deepEqual(p.plages, [{ de: DEBUT, a: TETE }]);
  });
}
await v('bornesIndex : borne la liste des trous et le dit ; `faitsDepuis` passe tel quel, sinon null', () => {
  const trous = Array.from({ length: INDEX_TROUS_MAX + 1 }, (_, i) => ({ de: TETE - 1000 - i * 10, a: TETE - 995 - i * 10 }));
  const b = bornesIndex({ blocsLusJusqua: TETE, rattrapageDepuis: 40_000_000, couvertureComplete: false, plancher: 30_000_000, trous, faitsDepuis: 12 });
  assert.equal(b.trousTronques, true);
  assert.equal(b.couvertDepuis, 40_000_000);
  assert.equal(b.faitsDepuis, 12);
  assert.equal(planCreations({ index: { ok: true, ...b }, tete: TETE, blocs: BLOCS }).mode, 'CHAINE');
  const c = bornesIndex({ blocsLusJusqua: null, rattrapageDepuis: null, couvertureComplete: false, plancher: 1, trous: [] });
  assert.equal(c.luJusqua, null);
  assert.equal(c.faitsDepuis, null);
  assert.equal(planCreations({ index: { ok: true, ...c }, tete: TETE, blocs: BLOCS }).mode, 'CHAINE');
});

/* ── 2. mesCreations, extraite de app.html et executee ──────────────────────────────────────────── */
function extraireMes(html) {
  const i0 = html.indexOf('let lectureCreations = null;');
  const iF = html.indexOf('function mesCreations()', i0);
  const fin = /\r?\n\}\r?\n/.exec(html.slice(iF));
  assert.ok(i0 > 0 && iF > i0 && fin, 'mesCreations introuvable dans app.html');
  return html.slice(i0, iF + fin.index + fin[0].length);
}
const sourceMes = extraireMes(app);
const COMPTE = '0x' + '31'.repeat(20);
const MIEN = '0xb2' + '00'.repeat(9) + 'aa'.repeat(10);
const DE_L_INDEX = '0x' + 'b2'.repeat(20);
const hx = (x) => '0x' + x.toString(16);
const pad = (h) => h.replace(/^0x/, '').padStart(64, '0');
const enc = (s) => pad(hx(s.length)) + Buffer.from(s).toString('hex').padEnd(64, '0');
const logCreation = (jeton, bloc, tx, sym = 'MIN') => ({ address: FACTORY, topics: [TOPIC_CREATED, '0x' + pad(jeton), '0x' + pad('0x0')],
  data: '0x' + pad(hx(96)) + pad(hx(160)) + pad(hx(18)) + enc('Mine') + enc(sym), blockNumber: hx(bloc), transactionHash: tx });
/* `chaine` : [{ jeton, bloc, sym }] — les creations REELLES du laboratoire, toutes de COMPTE */
async function session({ index, refuseQueue = false, chaine = [{ jeton: MIEN, bloc: TETE - 100, sym: 'MIN' }], source = sourceMes, plan = planCreations }) {
  const appels = { factoryLogs: 0, tx: 0, blocksDe: 0 };
  const rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return hx(TETE);
    if (m === 'eth_getLogs') {
      appels.factoryLogs++;
      const de = parseInt(p[0].fromBlock, 16), a = parseInt(p[0].toBlock, 16);
      if (refuseQueue && a === TETE) throw new Error('HTTP 429 on https://mainnet.base.org');
      return chaine.filter((c) => c.bloc >= de && c.bloc <= a).map((c, i) => logCreation(c.jeton, c.bloc, '0x' + String(i + 1).padStart(2, '0').repeat(32), c.sym));
    }
    if (m === 'eth_getTransactionByHash') { appels.tx++; return { from: COMPTE, blockNumber: hx(1) }; }
    throw new Error('rpc inattendu ' + m);
  };
  const fetch = async (url) => {
    assert.ok(String(url).startsWith('/api/blocks-de?adr='), 'fetch inattendu ' + url);
    appels.blocksDe++;
    if (index === 'panne') throw new Error('reseau');
    return { ok: true, json: async () => ({ blocks: [DE_L_INDEX], ...index }) };
  };
  const f = new Function('listerCreations', 'creationsDe', 'planCreations', 'rpc', 'fetch', 'CHAINE', 'compte',
    source + '\nreturn mesCreations;');
  const mes = f(listerCreations, creationsDe, plan, rpc, fetch, 8453, COMPTE);
  const res = await mes();
  return { appels, res };
}
const fenetresCompletes = Math.ceil((BLOCS + 1) / FENETRE_MAX) + 1;
await v('⛔⛔ index complet : 1 getLogs de la factory au lieu de ~22, le block recent est TROUVE, celui de l index aussi', async () => {
  const { appels, res } = await session({ index: plein() });
  assert.ok(appels.factoryLogs <= 1, 'le navigateur relit encore ' + appels.factoryLogs + ' fenetres de la factory');
  const jetons = res.gardees.map((c) => String(c.jeton).toLowerCase());
  assert.ok(jetons.includes(MIEN), 'le block cree il y a 100 blocs (queue non scannee par le serveur) a disparu');
  assert.ok(jetons.includes(DE_L_INDEX), 'le block de l index serveur a disparu');
  assert.equal(res.r.fenetresRatees.length, 0);
});
/* (P) LE CAS DE LA REVUE : cree il y a 5 000 blocs, couvert par l index (le navigateur ne le relit pas), plus un block ancien */
const RECENT = '0xb2' + '00'.repeat(9) + 'cc'.repeat(10);
const ANCIEN = '0xb2' + '00'.repeat(9) + 'bb'.repeat(10);
const indexP = (x = {}) => plein({ blocks: [ANCIEN, RECENT], faits: { [RECENT]: { bloc: TETE - 5000, symbole: 'RCT' } }, ...x });
await v('⛔⛔ (P) un block cree il y a 5 000 blocs, couvert par l index : son SYMBOLE et son BLOC, et il passe AVANT l ancien', async () => {
  const { appels, res } = await session({ index: indexP(), chaine: [{ jeton: RECENT, bloc: TETE - 5000, sym: 'RCT' }] });
  assert.ok(appels.factoryLogs <= 1, appels.factoryLogs + ' fenetres relues');
  const r = res.gardees.find((c) => c.jeton === RECENT);
  assert.ok(r, 'le block recent a disparu');
  assert.equal(r.symbole, 'RCT', 'symbole perdu (la Wallet affiche « ? »)');
  assert.equal(r.bloc, TETE - 5000, 'bloc de creation perdu');
  const iR = res.gardees.findIndex((c) => c.jeton === RECENT), iA = res.gardees.findIndex((c) => c.jeton === ANCIEN);
  assert.ok(iA >= 0 && iR < iA, 'ordre : le block d aujourd hui passe apres un ancien (' + res.gardees.map((c) => c.jeton.slice(-2)).join(',') + ')');
});
await v('⛔ (P2) le plus recent d abord sur TOUTE la liste : queue lue ici, puis l index, puis l ancien sans bloc', async () => {
  const QUEUE = '0xb2' + '00'.repeat(9) + 'dd'.repeat(10);
  const { res } = await session({ index: indexP(), chaine: [{ jeton: RECENT, bloc: TETE - 5000, sym: 'RCT' }, { jeton: QUEUE, bloc: TETE - 50, sym: 'QUE' }] });
  assert.deepEqual(res.gardees.map((c) => c.jeton), [QUEUE, RECENT, ANCIEN]);
  assert.deepEqual(res.gardees.slice(0, 2).map((c) => [c.symbole, c.bloc]), [['QUE', TETE - 50], ['RCT', TETE - 5000]]);
});
await v('⛔ (P3) faits servis seulement depuis peu (`faitsDepuis` dans la fenetre) : la partie basse est relue ICI, symbole lu sur la chaine', async () => {
  const BAS = '0xb2' + '00'.repeat(9) + 'ee'.repeat(10);
  const { appels, res } = await session({ index: indexP({ faitsDepuis: TETE - 3000, blocks: [BAS, RECENT] }),
    chaine: [{ jeton: BAS, bloc: TETE - 20000, sym: 'BAS' }, { jeton: RECENT, bloc: TETE - 5000, sym: 'RCT' }] });
  const b = res.gardees.find((c) => c.jeton === BAS);
  assert.ok(b && b.symbole === 'BAS' && b.bloc === TETE - 20000, 'le block sous faitsDepuis n a pas ses faits : ' + JSON.stringify(b));
  assert.ok(appels.factoryLogs < fenetresCompletes, 'pas plus que la fenetre entiere');
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
await v('un createur non resolu par le serveur est lu ICI (sa tx), pas oublie — avec ses faits', async () => {
  const autre = '0xb2' + '00'.repeat(9) + 'cc'.repeat(10);
  const { appels, res } = await session({ index: plein({ nonResolus: [{ jeton: autre, tx: '0x' + 'cd'.repeat(32) }], faits: { [autre]: { bloc: TETE - 7000, symbole: 'NRS' } } }) });
  assert.ok(appels.tx >= 2, 'la tx du non resolu n a pas ete lue');
  const c = res.gardees.find((x) => String(x.jeton).toLowerCase() === autre);
  assert.ok(c && c.symbole === 'NRS' && c.bloc === TETE - 7000, JSON.stringify(c));
});

/* ── 3. la Map : creationsDeLaCarte (creations-index.js), branchee dans app.html ───────────────────── */
await v('app.html : la Map lit par creationsDeLaCarte (et plus son propre balayage de 43 200 blocs)', () => {
  const i = app.indexOf('async function charger()');
  const corps = app.slice(i, app.indexOf('async function', i + 10));
  assert.ok(/await creationsDeLaCarte\(\{ rpc, fetch: .{1,40}?, listerCreations, blocs: 43200 \}\)/.test(corps), 'charger() ne passe plus par creationsDeLaCarte');
  assert.ok(!/await listerCreations\(\{ rpc, blocs: 43200 \}\)/.test(corps), 'le balayage complet de la Map est revenu');
  assert.ok(/import \{[^}]*creationsDeLaCarte[^}]*\} from '\.\/creations-index\.js'/.test(app), 'creationsDeLaCarte non importe');
});
async function carte({ index, chaine, refuseQueue = false, mod = CI }) {
  const appels = { factoryLogs: 0, plages: [], urls: [] };
  const rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return hx(TETE);
    if (m === 'eth_getLogs') {
      appels.factoryLogs++;
      const de = parseInt(p[0].fromBlock, 16), a = parseInt(p[0].toBlock, 16); appels.plages.push([de, a]);
      if (refuseQueue && a === TETE) throw new Error('HTTP 429 on https://mainnet.base.org');
      return chaine.filter((c) => c.bloc >= de && c.bloc <= a).map((c) => logCreation(c.jeton, c.bloc, '0x' + 'ab'.repeat(32), c.sym));
    }
    throw new Error('rpc inattendu ' + m);
  };
  const fetch = async (url) => { appels.urls.push(url); if (index === 'panne') throw new Error('reseau'); return { ok: true, json: async () => index }; };
  const r = await mod.creationsDeLaCarte({ rpc, fetch, listerCreations, blocs: BLOCS });
  return { appels, r };
}
const J = (k) => '0xb2' + '00'.repeat(9) + k.repeat(10);
const CHAINE_CARTE = [{ jeton: J('11'), bloc: TETE - 40000, sym: 'OLD' }, { jeton: J('22'), bloc: TETE - 9000, sym: 'MID' }, { jeton: J('33'), bloc: TETE - 20, sym: 'NEW' }];
const servies = (x = {}) => plein({ creations: [{ jeton: J('22'), bloc: TETE - 9000, symbole: 'MID', decimales: 18, nom: 'Middle' },{ jeton: J('11'), bloc: TETE - 40000, symbole: 'OLD' },
  { jeton: J('99'), bloc: DEBUT - 10, symbole: 'HORS' }], tronque: false, ...x });
await v('⛔⛔ Map, index qui qualifie : 1 getLogs (la queue) au lieu de ~22 ; creations du serveur + queue, du plus recent au plus ancien', async () => {
  const { appels, r } = await carte({ index: servies(), chaine: CHAINE_CARTE });
  assert.ok(appels.factoryLogs <= 1, appels.factoryLogs + ' getLogs de la factory depuis le navigateur');
  assert.ok(String(appels.urls[0]).startsWith('/api/creations-recentes?depuis=' + DEBUT), appels.urls[0]);
  assert.deepEqual(r.creations.map((c) => [c.symbole, c.bloc]), [['NEW', TETE - 20], ['MID', TETE - 9000], ['OLD', TETE - 40000]]);
  assert.deepEqual(r.fenetre, { de: DEBUT, a: TETE });
  assert.equal(r.fenetresRatees.length, 0);
  const mid = r.creations.find((c) => c.jeton === J('22'));
  assert.ok(mid.decimales === 18 && mid.nom === 'Middle', 'decimales / nom servis perdus (le fil Live lit les decimales) : ' + JSON.stringify(mid));
});
await v('⛔ Map : une creation que le serveur dit dans une plage RELUE ici (trou nomme) est ignoree — la lecture d ici fait foi', async () => {
  const { r } = await carte({ index: servies({ trousPlages: [{ de: TETE - 9500, a: TETE - 8500 }], creations: [{ jeton: J('44'), bloc: TETE - 9000, symbole: 'FAUX' }] }), chaine: CHAINE_CARTE });
  assert.ok(!r.creations.some((c) => c.jeton === J('44')), 'creation du serveur gardee dans une plage relue');
  assert.ok(r.creations.some((c) => c.jeton === J('22') && c.symbole === 'MID'), 'la creation lue ici dans le trou a disparu');
});
for (const [nom, idx] of [['index en panne', 'panne'], ['liste tronquee', servies({ tronque: true })], ['tronque non dit', servies({ tronque: undefined })],
  ['creations absentes', plein()], ['faits non servis', servies({ faitsDepuis: null })], ['trous tronques', servies({ trousTronques: true })]]) {
  await v('temoin Map : ' + nom + ' -> fenetre entiere, comme avant', async () => {
    const { appels, r } = await carte({ index: idx, chaine: CHAINE_CARTE });
    assert.ok(appels.factoryLogs >= fenetresCompletes - 2, 'seulement ' + appels.factoryLogs + ' fenetres');
    assert.deepEqual(r.creations.map((c) => c.symbole), ['NEW', 'MID', 'OLD']);
  });
}
/* lecture d ici (un trou + la queue) ET creations du serveur, melangees : la Map recoit le plus recent d abord */
const ordreCarte = (mod = CI) => async () => {
  const { r } = await carte({ mod, index: servies({ trousPlages: [{ de: TETE - 30500, a: TETE - 29500 }] }),
    chaine: [...CHAINE_CARTE, { jeton: J('55'), bloc: TETE - 30000, sym: 'TRU' }] });
  assert.deepEqual(r.creations.map((c) => c.symbole), ['NEW', 'MID', 'TRU', 'OLD']);
};
await v('⛔ Map : lecture d ici + serveur, du plus recent au plus ancien', ordreCarte());
await v('⛔ Map : la queue refusee reste NON LUE et se dit', async () => {
  const { r } = await carte({ index: servies(), chaine: CHAINE_CARTE, refuseQueue: true });
  assert.equal(r.fenetresRatees.length, 1);
  assert.ok(!r.creations.some((c) => c.symbole === 'NEW'));
});

/* ── 4. les refus PERMANENTS mesures le meme jour, Retry-After, et le quota du point d acces drpc ─────────────────────────────
 *   Mesure (meme session) : 10 eth_getLogs SANS adresse (les blocks recus par le wallet, mes-blocks.js frappesVers) envoyes a
 *   publicnode, 10 refus « -32701 Please specify an address in your request » — permanent. */
const REG = await charger(brutReg);
const { noeudPeutServir, creerRegulateur } = REG;
const PUB = 'https://base-rpc.publicnode.com', ORG = 'https://mainnet.base.org', DRPC = 'https://base.drpc.org';
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
/* rpcReseau EXTRAITE et executee contre le vrai regulateur (meme harnais que test-pause-drpc-par-methode-20261010) */
function extraireRpc(html) {
  const debut = html.indexOf('async function rpcReseau(');
  let prof = 0, fin = -1, dans = null;
  for (let i = html.indexOf('{', debut); i < html.length; i++) {
    const c = html[i], p = html[i - 1];
    if (dans) { if (c === dans && p !== '\\') dans = null; continue; }
    if (c === '"' || c === "'" || c === '`') { dans = c; continue; }
    if (c === '{') prof++; else if (c === '}') { prof--; if (!prof) { fin = i + 1; break; } }
  }
  return html.slice(debut, fin);
}
const sourceRpc = extraireRpc(app);
const horloge = () => { let t = 1000; return { maintenant: () => t, dormir: async (ms) => { t += ms; }, avancer: (ms) => { t += ms; } }; };
/* le corps REEL mesure le 2026-10-25 (curl depuis la machine de mesure, 3 sur 3) */
const QUOTA_DRPC = { statut: 429, corps: { id: 1, jsonrpc: '2.0', error: { message: 'You reached Public endpoint rate limit, please upgrade to paid plan', code: 15 } } };
function fabriquer(source, regul, reponses, reseau) {
  const appels = [];
  const fetchLabo = async (url, init) => {
    const corps = JSON.parse(init.body); appels.push({ url, m: corps.method });
    const r = reponses(url, corps);
    return { status: r.statut, ok: r.statut >= 200 && r.statut < 300, headers: { get: () => null },
      json: async () => { if (r.corps === undefined) throw new Error('illisible'); return r.corps; } };
  };
  const compte = { reseau: 0, cache: 0, fusion: 0, reprises: 0, reprisesOk: 0 };
  let faire; const rpc = (m, p) => faire(m, p);
  faire = new Function('RESEAUX', 'CHAINE', 'ESSAIS_429', 'fetch', 'setTimeout', 'rpcCompte', 'rpcRegul',
    'etatProfondeur', 'ordreNoeuds', 'rpcTete', 'tourEthCall', 'rpc',
    'let idRpc = 0; return (' + source + ');')({ 8453: reseau }, 8453, 5, fetchLabo, (k) => k(), compte, regul,
    () => ({ etat: 'RECENTE' }), (x) => x, { n: 0 }, 0, rpc);
  return { faire, appels };
}
const DEUX = { rpc: DRPC, secours: [PUB], b20Rpc: ORG, logsMultiRpc: ORG, logsArchiveRpc: ORG };
const repQuota = (url) => (url === DRPC ? QUOTA_DRPC : url === PUB ? { statut: 200, corps: { jsonrpc: '2.0', id: 1, result: '0x01' } } : { statut: 400, corps: {} });
const CALL = [{ to: '0x' + '1'.repeat(40), data: '0x' }, 'latest'];
async function quotaDrpc(source = sourceRpc, reg = REG) {
  const h = horloge(); const regul = reg.creerRegulateur(h); const f = fabriquer(source, regul, repQuota, DEUX);
  for (let k = 0; k < 8; k++) { h.avancer(2000); assert.equal(await f.faire(k % 2 ? 'eth_getBalance' : 'eth_call', CALL), '0x01', 'repli publicnode non servi'); }
  return { regul, f, h, drpc: f.appels.filter((a) => a.url === DRPC).length };
}
await v('⛔⛔ drpc « Public endpoint rate limit » (quota du point d acces) : UN refus met l hote en pause, TOUTES methodes ; publicnode sert', async () => {
  const s = await quotaDrpc();
  assert.equal(s.drpc, 1, 'drpc frappe ' + s.drpc + ' fois en 8 lectures de 2 methodes (avant : 3 par methode)');
  assert.ok(s.regul.enPause(DRPC, 'eth_call') && s.regul.enPause(DRPC, 'eth_getBalance'), 'pause d hote non armee');
  assert.equal(s.regul.enPause(PUB, 'eth_call'), false, 'pause etendue a un autre noeud');
  s.h.avancer(5 * 60 * 1000 + 1); s.f.appels.length = 0;
  for (let k = 0; k < 4; k++) await s.f.faire('eth_call', CALL);
  assert.equal(s.f.appels.filter((a) => a.url === DRPC).length, 1, 'pas de sonde unique apres T');
});
await v('drpc SEUL en quota : jamais saute sans requete (le dernier noeud est essaye), refus = rejet', async () => {
  const regul = REG.creerRegulateur(horloge());
  const f = fabriquer(sourceRpc, regul, repQuota, { ...DEUX, secours: [] });
  for (let k = 0; k < 3; k++) await assert.rejects(() => f.faire('eth_call', CALL));
  const avant = f.appels.length; await assert.rejects(() => f.faire('eth_call', CALL));
  assert.ok(f.appels.length > avant, 'dernier noeud saute sans requete');
});
await v('temoin : un 429 SANS ce corps garde la regle d avant (pause par methode, pas d hote)', async () => {
  const h = horloge(); const regul = REG.creerRegulateur(h);
  const f = fabriquer(sourceRpc, regul, (url) => (url === DRPC ? { statut: 429, corps: { jsonrpc: '2.0', id: 1, error: { code: 429, message: 'Too many requests' } } } : repQuota(url)), DEUX);
  for (let k = 0; k < 8; k++) { h.avancer(2000); await f.faire('eth_call', CALL); }
  assert.ok(!regul.enPause(DRPC, 'eth_getBalance'), 'un 429 ordinaire met l hote entier en pause');
});

/* ── 5. MUTANTS (copies en memoire, jamais le depot) : chacun DOIT rougir ─────────────────────────── */
const echoue = async (fn) => { try { await fn(); return false; } catch (_) { return true; } };
const unique = (src, de, vers, nom) => { assert.equal(src.split(de).length - 1, 1, 'motif du mutant « ' + nom + ' » trouve ' + (src.split(de).length - 1) + ' fois'); return src.replace(de, vers); };
if (!process.env.TB_RACINE) {
  const casP = (source, plan) => async () => {
    const { res } = await session({ index: indexP(), chaine: [{ jeton: RECENT, bloc: TETE - 5000, sym: 'RCT' }], source, plan });
    const r = res.gardees.find((c) => c.jeton === RECENT);
    assert.ok(r && r.symbole === 'RCT' && r.bloc === TETE - 5000);
    assert.ok(res.gardees.findIndex((c) => c.jeton === RECENT) < res.gardees.findIndex((c) => c.jeton === ANCIEN));
  };
  const casP3 = (plan) => async () => {
    const BAS = J('ee');
    const { res } = await session({ index: indexP({ faitsDepuis: TETE - 3000, blocks: [BAS, RECENT] }), plan,
      chaine: [{ jeton: BAS, bloc: TETE - 20000, sym: 'BAS' }, { jeton: RECENT, bloc: TETE - 5000, sym: 'RCT' }] });
    const b = res.gardees.find((c) => c.jeton === BAS); assert.ok(b && b.symbole === 'BAS');
  };
  const MUT = [
    ['mesCreations ignore les faits servis', async () => casP(unique(sourceMes, 'const f = faitsIdx[String(jeton', 'const f = ({})[String(jeton', 'faits'), planCreations)()],
    ['mesCreations ne trie plus (ordre de l index)', async () => casP(unique(sourceMes, 'gardees.splice(0, gardees.length, ...tries);', '', 'tri'), planCreations)()],
    ['planCreations ne relit plus sous faitsDepuis', async () => casP3((await charger(unique(brutCI, 'if (faitsDepuis > debut) brutes.push(', 'if (false) brutes.push(', 'sous'))).planCreations)()],
    ['planCreations accepte un index sans faitsDepuis', async () => {
      const m = await charger(unique(brutCI, "if (!entier(faitsDepuis)) return chaine('server index does not serve creation details');", '', 'sans'));
      assert.equal(m.planCreations({ index: plein({ faitsDepuis: undefined }), tete: TETE, blocs: BLOCS }).mode, 'CHAINE');
    }],
    ['Map garde une creation servie dans une plage relue', async () => {
      const m = await charger(unique(brutCI, '|| relue(c.bloc) ', '', 'relue'));
      const { r } = await carte({ mod: m, index: servies({ trousPlages: [{ de: TETE - 9500, a: TETE - 8500 }], creations: [{ jeton: J('44'), bloc: TETE - 9000, symbole: 'FAUX' }] }), chaine: CHAINE_CARTE });
      assert.ok(!r.creations.some((c) => c.jeton === J('44')));
    }],
    ['Map accepte une liste tronquee', async () => {
      const m = await charger(unique(brutCI, 'index.tronque === false && ', '', 'tronque'));
      const { appels } = await carte({ mod: m, index: servies({ tronque: true }), chaine: CHAINE_CARTE });
      assert.ok(appels.factoryLogs >= fenetresCompletes - 2);
    }],
    ['Map ne trie plus', async () => {
      const m = await charger(unique(brutCI, 'r.creations = plusRecentesDabord(r.creations);', '', 'tri carte'));
      await ordreCarte(m)();
    }],
    ['rpcReseau ne transmet plus quotaPoste', async () => {
      const s = await quotaDrpc(unique(sourceRpc, 'quotaPoste: !!(j && j.error', 'quotaPoste: false && !!(j && j.error', 'quotaPoste'));
      assert.equal(s.drpc, 1);
    }],
    ['regulateur : quotaPoste ignore', async () => {
      const s = await quotaDrpc(sourceRpc, await charger(unique(brutReg, "if (issue === 'debit' && opts && opts.quotaPoste) {", 'if (false) {', 'regul')));
      assert.equal(s.drpc, 1);
    }],
    ['regulateur : pause d hote saute le dernier noeud', async () => {
      const reg = await charger(unique(brutReg, "if (seulLibre && methode !== 'eth_getLogs') return null;", '', 'dernier'));
      const regul = reg.creerRegulateur(horloge());
      const f = fabriquer(sourceRpc, regul, repQuota, { ...DEUX, secours: [] });
      for (let k = 0; k < 3; k++) await f.faire('eth_call', CALL).catch(() => {});
      const avant = f.appels.length; await f.faire('eth_call', CALL).catch(() => {});
      assert.ok(f.appels.length > avant);
    }],
  ];
  let tues = 0;
  for (const [nom, fn] of MUT) { const rouge = await echoue(fn); console.log((rouge ? 'tue       ' : 'SURVIVANT ') + nom); assert.ok(rouge, 'mutant survivant : ' + nom); tues++; }
  console.log('mutants : ' + tues + '/' + MUT.length + ' tues');
}
console.log('test-creations-index-20261025 : ' + n + ' verts' + (process.env.TB_RACINE ? ' (racine ' + process.env.TB_RACINE + ', sans mutants)' : ''));
