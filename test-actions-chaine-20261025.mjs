/* test-actions-chaine-20261025.mjs — LA DECOUVERTE DES ACTIONS DE L EMETTEUR SUR UNE CHAINE FICTIVE, ET CE QU ELLE REFUSE.
 *
 * ⛔⛔ LE CAS QUE CE BANC EXISTE POUR TENIR : un jeton de SPAM avec un evenement B20Created FORGE et un prefixe d adresse COPIE
 *   (0xb200…) doit etre REFUSE ; une vraie action de l emetteur ACCEPTEE. Et chacune des trois preuves doit compter SEULE : un B20
 *   natif cree par un autre wallet (n importe qui peut appeler la factory) est refuse au `tx.from`.
 * Hors reseau : la chaine est une table en memoire. ⚠️ NE PROUVE PAS que mainnet reponde ainsi — la sonde live et le banc fork le font.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FACTORY, TOPIC_CREATED } from './index-blocks.js';
import { prouverAction, decouvrirActions, candidatsActions, routeAction, routeServie, resumeActions, sortieMoyenne, lireUnites,
  CREATEUR_EMETTEUR, APPELE_EMETTEUR, CREATIONS_GRAINE, ECART_MAX_BPS, USDC_MIN_POOL, POOLS_REFUSEES_EXECUTION } from './actions-chaine.js';
import { lireActionsEmetteur, URL_EMETTEUR, EMETTEUR_RETOMBEE, PAGES_MAX } from './actions-emetteur.js';
import { avecPoolAction, POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { verdictRoutage, raisonSansBuy } from './routage.js';
import { FACTORY_AERODROME_CL } from './calldata-aerodrome.js';
import { USDC_BASE } from './frais-creation.js';
import { selecteur } from './keccak.js';

let n = 0;
const cas = async (t, f) => { n += 1; try { await f(); } catch (e) { console.error('✗ ' + t); throw e; } };
const bas = (x) => String(x).toLowerCase();
const pad = (a) => '0x' + bas(a).slice(2).padStart(64, '0');
const hex64 = (k) => '0x' + k.toString(16).padStart(64, '0');

/* ── la chaine fictive ── */
const VRAIE = '0xb20000000000000000000017bb66e9301e913a99';                        /* SANc, copiee de la graine */
const TX_VRAIE = CREATIONS_GRAINE.get(VRAIE).tx;
const SPAM = '0xb200000000000000000000000000000000000bad';                         /* prefixe copie, PAS un B20 */
const TX_SPAM = hex64(0xbadn);
const IMPOSTEUR = '0xb2000000000000000000000000000000000000ff';                     /* VRAI B20 natif, cree par un autre wallet */
const TX_IMP = hex64(0xffn);
const FORGE = '0xb2000000000000000000000000000000000000aa';                         /* B20 natif ; l evenement de SA tx vient d un autre contrat */
const TX_FORGE = hex64(0xaan);
const AUTRE = '0x1111111111111111111111111111111111111111';
/* le data d un B20Created : offsets nom/symbole, decimals 8, variantEventParams vide */
const chaineAbi = (s) => { const h = Buffer.from(s, 'utf8').toString('hex'); return BigInt(s.length).toString(16).padStart(64, '0') + h.padEnd(Math.ceil(h.length / 64) * 64 || 64, '0'); };
const dataCreation = (nom, sym) => {
  const a = chaineAbi(nom), b = chaineAbi(sym);
  const offNom = 4 * 32, offSym = offNom + a.length / 2, offVar = offSym + b.length / 2;
  return '0x' + [offNom, offSym, 8, offVar].map((x) => BigInt(x).toString(16).padStart(64, '0')).join('') + a + b + '0'.repeat(64);
};
const logCreation = (emetteur, jeton, sym) => ({ address: emetteur, topics: [TOPIC_CREATED, pad(jeton), hex64(1n)], data: dataCreation(sym + ' Inc', sym), blockNumber: '0x10' });
function chaine({ sansRecu = false, panne = null } = {}) {
  const code = new Map([[VRAIE, '0xef'], [IMPOSTEUR, '0xef'], [FORGE, '0xef'], [SPAM, '0x6080604052']]);
  const recus = new Map([
    [TX_VRAIE, { transactionHash: TX_VRAIE, status: '0x1', blockNumber: '0x31f5f4f', logs: [logCreation(FACTORY, VRAIE, 'SANc')] }],
    [TX_SPAM, { transactionHash: TX_SPAM, status: '0x1', blockNumber: '0x20', logs: [logCreation(SPAM, SPAM, 'SANc')] }],
    [TX_IMP, { transactionHash: TX_IMP, status: '0x1', blockNumber: '0x21', logs: [logCreation(FACTORY, IMPOSTEUR, 'NVDAc')] }],
    [TX_FORGE, { transactionHash: TX_FORGE, status: '0x1', blockNumber: '0x22', logs: [logCreation(AUTRE, FORGE, 'AAPLc')] }],
  ]);
  const txs = new Map([
    [TX_VRAIE, { hash: TX_VRAIE, from: CREATEUR_EMETTEUR, to: APPELE_EMETTEUR }],
    [TX_SPAM, { hash: TX_SPAM, from: CREATEUR_EMETTEUR, to: APPELE_EMETTEUR }], /* meme le bon from ne sauve pas un faux B20 */
    [TX_IMP, { hash: TX_IMP, from: AUTRE, to: APPELE_EMETTEUR }],
    [TX_FORGE, { hash: TX_FORGE, from: CREATEUR_EMETTEUR, to: APPELE_EMETTEUR }],
  ]);
  const appels = [];
  const rpc = async (m, p) => {
    appels.push(m);
    if (panne && panne(m)) throw new Error('429 rate limited');
    if (m === 'eth_getCode') return code.get(bas(p[0])) || '0x';
    if (m === 'eth_getTransactionReceipt') return sansRecu ? null : (recus.get(p[0]) || null);
    if (m === 'eth_getTransactionByHash') return txs.get(p[0]) || null;
    if (m === 'eth_call') return hex64(332700000000n);
    throw new Error('methode inattendue ' + m);
  };
  return { rpc, appels, recus, txs, code };
}

await cas('⛔⛔⛔ LE SPAM (prefixe copie + evenement forge) EST REFUSE ; LA VRAIE ACTION EST ACCEPTEE', async () => {
  const c = chaine();
  const v = await prouverAction({ rpc: c.rpc, adr: VRAIE, tx: TX_VRAIE });
  assert.equal(v.etat, 'PROUVE', JSON.stringify(v));
  assert.equal(v.symbole, 'SANc'); assert.equal(v.decimales, 8); assert.equal(v.createur, CREATEUR_EMETTEUR);
  const s = await prouverAction({ rpc: c.rpc, adr: SPAM, tx: TX_SPAM });
  assert.equal(s.etat, 'REFUSE'); assert.equal(s.code, 'MARQUEUR', 'le spam doit tomber sur le code, AVANT tout evenement');
  assert.match(SPAM, /^0xb200/, 'le temoin doit vraiment copier le prefixe');
});

await cas('⛔⛔ CHAQUE PREUVE COMPTE SEULE : un B20 natif d un autre wallet, un evenement hors factory, une tx echouee', async () => {
  const c = chaine();
  const i = await prouverAction({ rpc: c.rpc, adr: IMPOSTEUR, tx: TX_IMP });
  assert.equal(i.etat, 'REFUSE'); assert.equal(i.code, 'CREATEUR', 'un B20 natif cree par un autre wallet passe pour une action : ' + JSON.stringify(i));
  const f = await prouverAction({ rpc: c.rpc, adr: FORGE, tx: TX_FORGE });
  assert.equal(f.etat, 'REFUSE'); assert.equal(f.code, 'EVENEMENT_HORS_FACTORY', 'un evenement emis par un autre contrat est accepte : ' + JSON.stringify(f));
  /* la tx de quelqu un d autre : le recu ne contient aucun log de creation de CE jeton */
  const x = await prouverAction({ rpc: c.rpc, adr: VRAIE, tx: TX_IMP });
  assert.equal(x.etat, 'REFUSE'); assert.equal(x.code, 'SANS_LOG_FACTORY');
  c.recus.get(TX_VRAIE).status = '0x0';
  assert.equal((await prouverAction({ rpc: c.rpc, adr: VRAIE, tx: TX_VRAIE })).code, 'TX_ECHOUEE');
  c.recus.get(TX_VRAIE).status = '0x1';
  c.txs.get(TX_VRAIE).to = AUTRE;
  assert.equal((await prouverAction({ rpc: c.rpc, adr: VRAIE, tx: TX_VRAIE })).code, 'APPELE');
});

await cas('⛔ UNE LECTURE RATEE EST NON_MESURE, JAMAIS UN REFUS (et rien n est grave)', async () => {
  const sans = chaine({ sansRecu: true });
  assert.equal((await prouverAction({ rpc: sans.rpc, adr: VRAIE, tx: TX_VRAIE })).etat, 'NON_MESURE');
  const panne = chaine({ panne: (m) => m === 'eth_getCode' });
  assert.equal((await prouverAction({ rpc: panne.rpc, adr: VRAIE, tx: TX_VRAIE })).etat, 'NON_MESURE');
  assert.equal((await prouverAction({ rpc: chaine().rpc, adr: VRAIE, tx: null })).code, 'SANS_TX');
  const cache = new Map();
  const t = await decouvrirActions({ rpc: panne.rpc, candidats: [{ adr: VRAIE, tx: TX_VRAIE, sources: ['emetteur'] }], cache });
  assert.equal(t.etat, 'PARTIEL'); assert.equal(cache.size, 0, 'un NON_MESURE a ete grave dans le cache definitif');
});

await cas('⛔ LA DECOUVERTE : candidats unis, preuves bornees par tour, verdicts definitifs caches', async () => {
  const c = chaine();
  const cand = candidatsActions({ emetteur: [VRAIE, SPAM], symbolesEmetteur: { [SPAM]: 'SANc' },
    creationsVues: [{ jeton: IMPOSTEUR, tx: TX_IMP, createur: AUTRE }, { jeton: FORGE, tx: TX_FORGE, createur: CREATEUR_EMETTEUR }],
    graine: new Map([[VRAIE, { tx: TX_VRAIE, symbole: 'SANc' }]]) });
  assert.deepEqual(cand.map((x) => x.adr).sort(), [VRAIE, SPAM, FORGE].sort(), 'une creation d un AUTRE createur est devenue candidate');
  assert.deepEqual(cand.find((x) => x.adr === VRAIE).sources.sort(), ['emetteur', 'recensement']);
  /* SPAM n a pas de tx : candidat de l API, NON_MESURE (SANS_TX) — il n est NI liste NI refuse ; on lui en donne une */
  cand.find((x) => x.adr === SPAM).tx = TX_SPAM;
  const cache = new Map();
  const t1 = await decouvrirActions({ rpc: c.rpc, candidats: cand, cache, max: 2 });
  assert.equal(t1.etat, 'PARTIEL'); assert.equal(t1.neuves, 2); assert.equal(t1.nonMesurees.length, 1);
  const lectures = c.appels.length;
  const t2 = await decouvrirActions({ rpc: c.rpc, candidats: cand, cache, max: 2 });
  assert.equal(t2.etat, 'COMPLET', JSON.stringify(t2.nonMesurees));
  assert.deepEqual(t2.prouvees.map((p) => p.adr), [VRAIE]);
  assert.deepEqual(t2.refusees.map((p) => p.code).sort(), ['EVENEMENT_HORS_FACTORY', 'MARQUEUR']);
  assert.ok(c.appels.length - lectures <= 3, 'le second tour a relu des verdicts definitifs : ' + (c.appels.length - lectures));
  const t3 = await decouvrirActions({ rpc: c.rpc, candidats: cand, cache });
  assert.equal(t3.neuves, 0, 'un troisieme tour a relu la chaine');
});

await cas('⛔ LA GRAINE : 202 actions, un createur, chacune avec sa tx et son bloc', async () => {
  assert.equal(CREATIONS_GRAINE.size, 202);
  for (const [a, g] of CREATIONS_GRAINE) {
    assert.match(a, /^0xb2[0-9a-f]{38}$/); assert.match(g.tx, /^0x[0-9a-f]{64}$/); assert.ok(Number.isSafeInteger(g.bloc) && g.bloc > 49_000_000);
  }
  assert.equal(new Set([...CREATIONS_GRAINE.values()].map((g) => g.tx)).size, 202, 'deux actions partagent une tx de creation');
  assert.equal(CREATEUR_EMETTEUR, '0xe090ecbee12d4b6aee5e73ff60945f2545ef5c6f');
});

/* ── la liste de l emetteur, paginee ── */
const page = (adrs, suite) => ({ tokens: adrs.map((a, i) => ({ contract_address: a, symbol: 'S' + i })), next_page_token: suite });
const A = (k) => '0xb2' + k.toString(16).padStart(38, '0');
await cas('⛔⛔⛔ TOUTES LES PAGES SONT LUES ; UNE PAGE MANQUANTE NE REND JAMAIS `OK`', async () => {
  const vues = [];
  const pages = { [URL_EMETTEUR]: page([A(1), A(2)], 'p2'), [URL_EMETTEUR + '?page_token=p2']: page([A(3)], 'p3'), [URL_EMETTEUR + '?page_token=p3']: page([A(4)], null) };
  const r = await lireActionsEmetteur(async (u) => { vues.push(u); return pages[u] || null; });
  assert.equal(r.etat, 'OK'); assert.equal(r.adresses.length, 4, 'la premiere page seule : le bug du 2026-10-24'); assert.equal(r.pages, 3);
  assert.equal(vues[0], URL_EMETTEUR);
  const trou = await lireActionsEmetteur(async (u) => (u.includes('p3') ? null : pages[u]));
  assert.equal(trou.etat, 'RETOMBEE', 'une page manquante a rendu ' + trou.etat); assert.deepEqual(trou.adresses, [...EMETTEUR_RETOMBEE]);
  let tours = 0;
  const boucle = await lireActionsEmetteur(async (u) => { tours += 1; return u === URL_EMETTEUR ? page([A(1)], 'x') : page([A(2)], 'x'); });
  assert.equal(boucle.etat, 'RETOMBEE', 'un jeton de page qui revient a ete suivi');
  assert.equal(tours, 2, 'la boucle n est arretee que par la borne de pages (' + tours + ' lectures), pas par le jeton qui revient');
  let k = 0; const sansFin = await lireActionsEmetteur(async () => page([A(++k)], 't' + k));
  assert.equal(sansFin.etat, 'RETOMBEE'); assert.equal(k, PAGES_MAX, 'la borne de pages n a pas arrete la lecture');
  const vide = await lireActionsEmetteur(async (u) => (u === URL_EMETTEUR ? page([A(1)], 'z') : { tokens: [], next_page_token: null }));
  assert.equal(vide.etat, 'OK', 'une derniere page vide apres une pleine est une fin de liste'); assert.equal(vide.adresses.length, 1);
});

/* ── la route ── */
const USDC = bas(USDC_BASE);
const POOL = '0x' + 'ab'.repeat(20);
const S = { getPool: selecteur('getPool(address,address,int24)'), bal: selecteur('balanceOf(address)'), liq: selecteur('liquidity()'), s0: selecteur('slot0()'),
  q: selecteur('quoteExactInputSingle((address,address,uint256,int24,uint160))') };
const ADM = () => true; /* admission forcee : on juge la ROUTE seule ; l admission a son propre cas */
const SQRT = 2n ** 96n * 3n; /* 9 unites brutes de jeton par unite brute d USDC */
function pools({ ts = 1, usdc = 30_000_000_000n, liq = 10n ** 15n, garde = 9990n, revert = false, pool = POOL, panne = false } = {}) {
  return async (to, data) => {
    if (panne) throw new Error('refused by all 2 endpoints (429)');
    if (bas(to) === bas(FACTORY_AERODROME_CL) && data.startsWith(S.getPool)) return BigInt('0x' + data.slice(-64)) === BigInt(ts) ? pad(pool) : hex64(0n);
    if (bas(to) === USDC && data.startsWith(S.bal)) return hex64(usdc);
    if (data === S.liq) return hex64(liq);
    if (data === S.s0) return hex64(SQRT) + '0'.repeat(64 * 6);
    if (data.startsWith(S.q)) { if (revert) throw new Error('execution reverted'); return hex64(10_000_000n * 9n * garde / 10000n) + '0'.repeat(64 * 3); }
    throw new Error('appel inattendu ' + to + ' ' + data.slice(0, 10));
  };
}
await cas('⛔⛔ LE VERDICT DE ROUTE : achetable seulement sur NOTRE factory, cotee a <= 1 %, >= 500 USDC', async () => {
  assert.equal(sortieMoyenne({ montant: 10n, sqrtP: SQRT, usdcEst0: true }), 90n);
  const bon = await routeAction({ appel: pools(), adr: VRAIE, admise: ADM });
  assert.equal(bon.achetable, true, JSON.stringify(bon)); assert.equal(bon.pool, POOL); assert.equal(bon.tickSpacing, 1); assert.equal(bon.ecartBps, 10);
  assert.equal(bon.factory, bas(FACTORY_AERODROME_CL));
  const loin = await routeAction({ appel: pools({ garde: 9500n }), adr: VRAIE, admise: ADM });
  assert.equal(loin.code, 'ECART'); assert.ok(loin.ecartBps > ECART_MAX_BPS); assert.match(loin.phrase, /% less/);
  const mince = await routeAction({ appel: pools({ usdc: USDC_MIN_POOL - 1n }), adr: VRAIE, admise: ADM });
  assert.equal(mince.code, 'LIQUIDITE_SOUS_SEUIL'); assert.match(mince.phrase, /\$500/);
  assert.equal((await routeAction({ appel: pools({ liq: 0n }), adr: VRAIE, admise: ADM })).code, 'POOL_VIDE');
  assert.equal((await routeAction({ appel: pools({ ts: 7 }), adr: VRAIE, admise: ADM })).code, 'SANS_POOL_ROUTEUR');
  assert.equal((await routeAction({ appel: pools({ revert: true }), adr: VRAIE, admise: ADM })).code, 'NON_COTEE');
  const p = await routeAction({ appel: pools({ panne: true }), adr: VRAIE, admise: ADM });
  assert.equal(p.etat, 'NON_MESURE', 'un noeud muet a produit un verdict : ' + JSON.stringify(p));
  /* 2026-10-25 : SEc s execute sur fork, la liste servie est VIDE ; le mecanisme est teste avec une liste injectee */
  assert.equal(POOLS_REFUSEES_EXECUTION.size, 0, 'une pool est refusee a l execution sans banc qui le montre');
  const refuseesExecution = new Map([[POOL, 'No buy: it failed when executed on a fork.']]);
  const sec = await routeAction({ appel: pools(), adr: VRAIE, admise: ADM, refuseesExecution });
  assert.equal(sec.code, 'EXECUTION_ECHOUEE', 'la pool qui revertait sur fork recoit un Buy');
  assert.equal(routeServie({ etat: 'NON_MESURE' }), null);
  /* ⛔⛔ L ADMISSION (banc fork du 2026-10-25) : une bonne pool d une action HORS registre n a PAS de Buy — la fiche refuserait le frais */
  /* SANc (VRAIE) est au registre depuis le 2026-10-25 : l admission reelle l admet ; une action hors registre est simulee par admise */
  assert.equal((await routeAction({ appel: pools(), adr: VRAIE })).achetable, true, 'SANc, entree au registre, n est pas admise');
  const hors = await routeAction({ appel: pools(), adr: VRAIE, admise: () => false });
  assert.equal(hors.achetable, false, 'une action hors registre recoit un Buy que le planificateur refusera'); assert.equal(hors.code, 'HORS_REGISTRE');
  assert.match(hors.phrase, /not in this app's stock list/);
  const nflx = await routeAction({ appel: pools(), adr: '0xb2000000000000000000000000000000000000ce', admise: (a) => a === '0xb2000000000000000000000000000000000000ce' });
  assert.equal(nflx.achetable, true);
});

await cas('⛔⛔ LE MARKET : la route servie donne le Buy OU la raison mesuree ; la table garde la main', async () => {
  /* HORS : une action prouvee HORS de la table (BUDc, copiee de la graine) — SANc (VRAIE) est entree a la table le 2026-10-25 */
  const HORS = '0xb200000000000000000000c36ce081dd09e86ca2';
  assert.ok(CREATIONS_GRAINE.has(HORS) && !POOLS_ACTIONS_AERODROME.has(HORS));
  const bon = routeServie(await routeAction({ appel: pools(), adr: HORS, admise: ADM }));
  const ligne = { adr: HORS, dex: 'aero', poolAdr: '0x' + '9c'.repeat(20), liquiditeUsd: 50000, routeAction: bon };
  const lA = avecPoolAction(ligne);
  assert.equal(lA.dex, 'aerodrome'); assert.equal(lA.poolAdr, POOL); assert.equal(lA.poolSource, 'aerodrome-chaine');
  const v = verdictRoutage({ aMarche: true, dex: lA.dex, poolAdr: lA.poolAdr, routeAction: lA.routeAction });
  assert.ok(v.achetableEnUsdc && v.achetableEnEth); assert.equal(raisonSansBuy(v, { liqOk: true, liqMin: 500 }), null);
  /* refus : une ligne « aerodrome » de l agregateur ne recoit PAS de Buy, et la raison est celle mesuree */
  const refus = routeServie(await routeAction({ appel: pools({ garde: 9500n }), adr: HORS, admise: ADM }));
  const l2 = avecPoolAction({ adr: HORS, dex: 'aerodrome', poolAdr: POOL, liquiditeUsd: 50000, routeAction: refus });
  const v2 = verdictRoutage({ aMarche: true, dex: l2.dex, poolAdr: l2.poolAdr, routeAction: l2.routeAction });
  assert.equal(v2.achetableEnUsdc, false); assert.equal(v2.achetableEnEth, false);
  assert.equal(raisonSansBuy(v2, { liqOk: true }).code, 'ECART'); assert.match(raisonSansBuy(v2, { liqOk: true }).phrase, /mid price/);
  /* une route mal formee (autre factory) ne donne rien */
  assert.equal(avecPoolAction({ adr: HORS, dex: 'aero', routeAction: { ...bon, factory: '0x' + '9c'.repeat(20) } }).poolSource, undefined);
  /* la table gagne LA POOL */
  const aapl = '0xb200000000000000000000c2e324d24d7eecd1fb';
  assert.equal(avecPoolAction({ adr: aapl, dex: 'aero', routeAction: bon }).poolSource, 'aerodrome-mesure');
  /* ⛔ 2026-10-25 : mais PAS le Buy — une entree de table dont la route servie refuse (ECART sur SA pool) n a pas de Buy */
  const wrd = '0xb200000000000000000000e88efe88d8ade3f0da', tw = POOLS_ACTIONS_AERODROME.get(wrd);
  const lw = avecPoolAction({ adr: wrd, dex: 'aerodrome', poolAdr: tw.pool, liquiditeUsd: 50000, routeAction: { ...refus, pool: tw.pool } });
  const vw = verdictRoutage({ aMarche: true, dex: lw.dex, poolAdr: lw.poolAdr, routeAction: lw.routeAction });
  assert.equal(lw.poolAdr, tw.pool); assert.equal(vw.achetableEnUsdc || vw.achetableEnEth || vw.achetableIci, false, 'WRDc (table) garde un Buy malgre un refus mesure sur sa pool');
  assert.equal(raisonSansBuy(vw, { liqOk: true }).code, 'ECART');
  /* sans routeAction : le verdict d avant, inchange */
  assert.deepEqual(verdictRoutage({ aMarche: true, dex: 'aero', poolAdr: POOL }), verdictRoutage({ aMarche: true, dex: 'aero', poolAdr: POOL, routeAction: null }));
});

await cas('⛔ LE COMPTE SERVI', async () => {
  const c = chaine();
  const t = await decouvrirActions({ rpc: c.rpc, candidats: candidatsActions({ graine: new Map([[VRAIE, { tx: TX_VRAIE }], [SPAM, { tx: TX_SPAM }]]) }), cache: new Map() });
  const unites = new Map([[VRAIE, await lireUnites({ rpc: c.rpc, adr: VRAIE, admise: ADM })]]);
  const r = resumeActions({ tour: t, unites, routes: new Map([[VRAIE, { achetable: true }]]), listees: 1, emetteurEtat: 'OK', emetteurCompte: 202 });
  assert.deepEqual([r.etat, r.candidats, r.prouvees, r.refusees, r.avecUnites, r.listeesAuMarche, r.achetablesHorsTable], ['COMPLET', 2, 1, 1, 1, 1, 1]);
  assert.deepEqual(r.refusParCode, { MARQUEUR: 1 });
  assert.equal(r.sansUnites, 0);
  assert.equal(resumeActions({ tour: null, unites: new Map(), routes: new Map() }).etat, 'NON_MESURE');
  /* sans unites : compte a part (le Market le dit) ; une action de la table compte dans tableLues, pas dans achetablesHorsTable */
  const r0 = resumeActions({ tour: t, unites: new Map([[VRAIE, 0n]]), routes: new Map([[VRAIE, { achetable: false, code: 'ECART' }]]), table: new Set([VRAIE]) });
  assert.deepEqual([r0.avecUnites, r0.sansUnites, r0.unitesNonLues, r0.achetablesHorsTable, r0.tableLues, r0.tableRefusees.join()], [0, 1, 0, 0, 1, 'ECART']);
  const rn = resumeActions({ tour: t, unites: new Map(), routes: new Map() });
  assert.deepEqual([rn.sansUnites, rn.unitesNonLues], [0, 1], 'une supply NON LUE a ete comptee « sans unites » (non lu n est pas zero)');
});

await cas('⛔⛔ LE CABLAGE SERVEUR : prouvees lues chez DexScreener, marquees, route par ligne, compte servi', async () => {
  const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(srv, /const ac = await actionsChaineTour\(em\);\n\s+for \(const a of ac\.prouvees\) blocksConnus\.add\(a\);\n\s+const adrs = \[\.\.\.blocksConnus\]/, 'les prouvees ne sont pas demandees a DexScreener');
  assert.match(srv, /actionsEmetteur: marquees/);
  assert.match(srv, /l\.routeAction = r && \(!t \|\| r\.r\.pool === t\.pool\) \? r\.r : null;/, 'la route n est pas posee sur chaque ligne (ou une entree de table recoit un refus portant sur une autre pool)');
  /* 2026-10-25 : les entrees de la table sont relues aussi (4 sur 25 ne passaient plus la regle) — la boucle ne les saute plus */
  assert.doesNotMatch(srv, /if \(POOLS_ACTIONS_AERODROME\.has\(p\.adr\)\) continue;/, 'la table echappe encore a la regle du Buy');
  assert.match(srv, /for \(const p of ordre\) \{/);
  const html0 = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  assert.match(html0, /d\.actionsChaine\.sansUnites > 0 \? ', ' \+ d\.actionsChaine\.sansUnites \+ ' with no units in circulation yet \(not listed\)'/, 'le Market ne dit pas combien d actions prouvees n ont aucune unite');
  assert.match(srv, /achatMarche, actionsChaine,/, 'le compte n est pas servi sur \/api\/trending');
  assert.match(srv, /retenirCreationsEmetteur\(cr\.creations,/, 'les creations du scan ne deviennent pas candidates');
  assert.match(srv, /decouvrirActions\(\{ rpc: rpcServeur,/, 'les preuves ne lisent pas le recu par le lecteur qui sert les tx (mainnet.base.org)');
  const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  assert.match(html, /verdictRoutage\(\{ aMarche: true, dex: lA\.dex, poolAdr: lA\.poolAdr, routeAction: lA\.routeAction \}\)/);
});

console.log('✓ test-actions-chaine-20261025 : ' + n + ' cas');
console.log('   spam (prefixe 0xb200 copie + evenement forge) REFUSE au code ; B20 natif d un autre wallet REFUSE au tx.from ;');
console.log('   evenement hors factory REFUSE ; la vraie action PROUVEE. Pagination : 3 pages lues, une manquante = RETOMBEE.');
console.log('   ⚠️ chaine fictive : ne prouve pas mainnet (sonde live, banc fork).');
