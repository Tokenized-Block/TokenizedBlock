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
  CREATEUR_EMETTEUR, APPELE_EMETTEUR, CREATIONS_GRAINE, ECART_MAX_BPS, USDC_MIN_POOL, POOLS_REFUSEES_EXECUTION,
  verdictGravable, lecteurPreuves, routePourLigne, ROUTE_EN_COURS, ROUTE_SERVIE_MAX_MS, PERTE_ALLER_RETOUR_MAX_BPS, POOL_ABSENTE_TTL_MS } from './actions-chaine.js';
import { lireActionsEmetteur, URL_EMETTEUR, EMETTEUR_RETOMBEE, PAGES_MAX } from './actions-emetteur.js';
import { avecPoolAction, POOLS_ACTIONS_AERODROME, ALLER_RETOUR_REFUSES, phraseAllerRetour } from './pools-actions-aerodrome.js';
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

await cas('⛔⛔⛔ REVUE 2026-10-25 : UN `0x`, UNE REPONSE DECALEE, UN LOG MAL FORME = NON_MESURE, JAMAIS UN REFUS GRAVE', async () => {
  /* le scenario de la revue : un noeud rend `0x` (en retard), le tour suivant un noeud sain — l action doit etre PROUVEE */
  const c = chaine();
  c.code.set(VRAIE, '0x');
  const cache = new Map();
  const cand = [{ adr: VRAIE, tx: TX_VRAIE, txs: [TX_VRAIE], sources: ['emetteur'] }];
  const t1 = await decouvrirActions({ rpc: c.rpc, candidats: cand, cache });
  assert.equal(t1.nonMesurees.length, 1, JSON.stringify(t1)); assert.equal(t1.nonMesurees[0].code, 'CODE_VIDE');
  assert.equal(cache.size, 0, 'un `0x` a ete grave comme refus');
  c.code.set(VRAIE, '0xef');
  const t2 = await decouvrirActions({ rpc: c.rpc, candidats: cand, cache });
  assert.deepEqual(t2.prouvees.map((p) => p.adr), [VRAIE], 'la vraie action reste de-listee apres un seul `0x`');
  /* reponse vide sous une autre forme */
  c.code.set(SPAM, '');
  assert.equal((await prouverAction({ rpc: c.rpc, adr: SPAM, tx: TX_SPAM })).etat, 'NON_MESURE');
  c.code.set(SPAM, '0x6080604052');
  /* du code PRESENT et different : refus, avec ce qui a ete lu */
  const s = await prouverAction({ rpc: c.rpc, adr: SPAM, tx: TX_SPAM });
  assert.equal(s.code, 'MARQUEUR'); assert.equal(s.codeLu, '0x6080604052'); assert.equal(verdictGravable(s), true);
  /* recu / tx d une AUTRE transaction : un noeud qui deraille, pas la chaine */
  const r0 = c.recus.get(TX_VRAIE);
  c.recus.set(TX_VRAIE, { ...r0, transactionHash: TX_IMP });
  const ra = await prouverAction({ rpc: c.rpc, adr: VRAIE, tx: TX_VRAIE });
  assert.equal(ra.etat, 'NON_MESURE'); assert.equal(ra.code, 'RECU_AUTRE');
  c.recus.set(TX_VRAIE, r0);
  const x0 = c.txs.get(TX_VRAIE);
  c.txs.set(TX_VRAIE, { ...x0, hash: TX_IMP });
  const ta = await prouverAction({ rpc: c.rpc, adr: VRAIE, tx: TX_VRAIE });
  assert.equal(ta.etat, 'NON_MESURE'); assert.equal(ta.code, 'TX_AUTRE');
  c.txs.set(TX_VRAIE, x0);
  /* un log de la factory mal forme (topics[2] absent : decoderCreation leve) ne fait pas tomber le tour */
  const MAL = '0xb2000000000000000000000000000000000000cc', TX_MAL = hex64(0xccn);
  c.code.set(MAL, '0xef');
  c.recus.set(TX_MAL, { transactionHash: TX_MAL, status: '0x1', blockNumber: '0x23', logs: [{ address: FACTORY, topics: [TOPIC_CREATED, pad(MAL)], data: null }] });
  c.txs.set(TX_MAL, { hash: TX_MAL, from: CREATEUR_EMETTEUR, to: APPELE_EMETTEUR });
  const tm = await decouvrirActions({ rpc: c.rpc, candidats: [{ adr: MAL, tx: TX_MAL, sources: ['chaine'] }, ...cand], cache: new Map() });
  assert.equal(tm.nonMesurees[0].code, 'LOG_ILLISIBLE', JSON.stringify(tm.nonMesurees)); assert.deepEqual(tm.prouvees.map((p) => p.adr), [VRAIE], 'un log mal forme a fait tomber le tour');
  /* et une exception quelconque d une preuve non plus */
  c.recus.set(TX_MAL, { transactionHash: TX_MAL, status: '0x1', get logs() { throw new TypeError('boom'); } });
  const te = await decouvrirActions({ rpc: c.rpc, candidats: [{ adr: MAL, tx: TX_MAL }, ...cand], cache: new Map() });
  assert.equal(te.nonMesurees[0].code, 'EXCEPTION', JSON.stringify(te.nonMesurees)); assert.equal(te.prouvees.length, 1, 'une exception d une preuve a fait tomber le tour');
  /* les refus graves par le code d AVANT (sur `0x`, ou une reponse decalee) ne reviennent pas du disque */
  assert.equal(verdictGravable({ etat: 'REFUSE', adr: VRAIE, code: 'MARQUEUR', pourquoi: 'x' }), false, 'un MARQUEUR sans le code lu (ancien `0x`) est relu du disque');
  assert.equal(verdictGravable({ etat: 'REFUSE', adr: VRAIE, code: 'RECU_AUTRE' }), false);
  assert.equal(verdictGravable({ etat: 'REFUSE', adr: VRAIE, code: 'TX_AUTRE' }), false);
  assert.equal(verdictGravable({ etat: 'REFUSE', adr: VRAIE, code: 'CREATEUR', tx: TX_IMP }), true);
  assert.equal(verdictGravable({ etat: 'NON_MESURE', adr: VRAIE, code: 'CODE_VIDE' }), false);
  assert.equal(verdictGravable({ etat: 'PROUVE', adr: VRAIE, tx: TX_VRAIE }), true);
});

await cas('⛔⛔ UN REFUS EST REJUGE QUAND UNE AUTRE TX DE CREATION EST ANNONCEE', async () => {
  const c = chaine();
  const cache = new Map();
  /* VRAIE annoncee d abord avec la tx d un autre (refus SANS_LOG_FACTORY), puis le scan annonce la vraie tx */
  const t1 = await decouvrirActions({ rpc: c.rpc, candidats: [{ adr: VRAIE, tx: TX_IMP, txs: [TX_IMP], sources: ['chaine'] }], cache });
  assert.equal(t1.refusees[0].code, 'SANS_LOG_FACTORY'); assert.equal(cache.get(VRAIE).etat, 'REFUSE');
  const lus = c.appels.length;
  const t2 = await decouvrirActions({ rpc: c.rpc, candidats: [{ adr: VRAIE, tx: TX_IMP, txs: [TX_IMP], sources: ['chaine'] }], cache });
  assert.equal(t2.neuves, 0); assert.equal(c.appels.length, lus, 'un refus definitif a ete relu sans tx nouvelle');
  const cand = candidatsActions({ creationsVues: [{ jeton: VRAIE, tx: TX_IMP, createur: CREATEUR_EMETTEUR }], graine: new Map([[VRAIE, { tx: TX_VRAIE, symbole: 'SANc' }]]) });
  assert.deepEqual(cand[0].txs.sort(), [TX_VRAIE, TX_IMP].sort(), 'les deux tx annoncees ne sont pas gardees');
  const t3 = await decouvrirActions({ rpc: c.rpc, candidats: cand, cache });
  assert.deepEqual(t3.prouvees.map((p) => p.adr), [VRAIE], 'le refus n a pas ete rejuge sur la nouvelle tx : ' + JSON.stringify(t3.refusees));
  assert.equal(cache.get(VRAIE).etat, 'PROUVE');
  /* un refus rejuge qui refuse encore garde les DEUX tx jugees : il ne se relit plus */
  const c2 = chaine(); const cache2 = new Map();
  await decouvrirActions({ rpc: c2.rpc, candidats: [{ adr: IMPOSTEUR, tx: TX_IMP, txs: [TX_IMP] }], cache: cache2 });
  await decouvrirActions({ rpc: c2.rpc, candidats: [{ adr: IMPOSTEUR, tx: TX_IMP, txs: [TX_IMP, TX_FORGE] }], cache: cache2 });
  assert.deepEqual(cache2.get(IMPOSTEUR).jugees.sort(), [TX_IMP, TX_FORGE].sort());
  const n2 = c2.appels.length;
  await decouvrirActions({ rpc: c2.rpc, candidats: [{ adr: IMPOSTEUR, tx: TX_IMP, txs: [TX_IMP, TX_FORGE] }], cache: cache2 });
  assert.equal(c2.appels.length, n2);
});

await cas('⛔⛔ LES 12 PLUS ANCIENNES : le lecteur des preuves essaie le suivant (publicnode refuse l archive, base.org/drpc servent)', async () => {
  const c = chaine();
  const archive = async () => { throw new Error('Archive requests require a personal token'); };
  const muet = async () => null;
  const rpc = lecteurPreuves([archive, muet, c.rpc]);
  assert.equal((await prouverAction({ rpc, adr: VRAIE, tx: TX_VRAIE })).etat, 'PROUVE');
  /* tous muets : null rendu (NON_MESURE), jamais un refus */
  assert.equal((await prouverAction({ rpc: lecteurPreuves([archive, muet]), adr: VRAIE, tx: TX_VRAIE })).etat, 'NON_MESURE');
  /* `0x` de l un, 0xef de l autre : 0xef */
  const vide = async (m) => (m === 'eth_getCode' ? '0x' : null);
  assert.equal((await prouverAction({ rpc: lecteurPreuves([vide, c.rpc]), adr: VRAIE, tx: TX_VRAIE })).etat, 'PROUVE');
  await assert.rejects(lecteurPreuves([archive])('eth_getCode', [VRAIE, 'latest']), /Archive/);
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
  /* ⛔⛔ revue 2026-10-25 : une page VIDE annoncee par un jeton est une page non lue — l API reelle finit par une page pleine sans jeton */
  const vide = await lireActionsEmetteur(async (u) => (u === URL_EMETTEUR ? page([A(1)], 'z') : { tokens: [], next_page_token: null }));
  assert.equal(vide.etat, 'RETOMBEE', 'une page vide apres un jeton a rendu ' + vide.etat);
  const videObj = await lireActionsEmetteur(async (u) => (u === URL_EMETTEUR ? page([A(1)], 'z') : {}));
  assert.equal(videObj.etat, 'RETOMBEE');
  /* une page 2 qui REPETE la page 1 (curseur ignore) : RETOMBEE, pas 100 adresses « OK » */
  const rep = await lireActionsEmetteur(async (u) => (u === URL_EMETTEUR ? page([A(1), A(2)], 'q') : page([A(1), A(2)], null)));
  assert.equal(rep.etat, 'RETOMBEE', 'une page qui repete la precedente a rendu ' + rep.etat);
  const partiel = await lireActionsEmetteur(async (u) => (u === URL_EMETTEUR ? page([A(1), A(2)], 'q') : page([A(2), A(3)], null)));
  assert.equal(partiel.etat, 'RETOMBEE', 'une page qui recouvre la precedente a rendu ' + partiel.etat);
  /* et le cablage serveur borne chaque page dans le temps */
  const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
  assert.match(srv, /fetch\(url, \{ headers: \{ 'x-ms-monitor': '1' \}, signal: AbortSignal\.timeout\(10000\) \}\)/, 'la liste de l emetteur est lue sans delai borne');
});

/* ── la route ── */
const USDC = bas(USDC_BASE);
const POOL = '0x' + 'ab'.repeat(20);
const S = { getPool: selecteur('getPool(address,address,int24)'), bal: selecteur('balanceOf(address)'), liq: selecteur('liquidity()'), s0: selecteur('slot0()'),
  q: selecteur('quoteExactInputSingle((address,address,uint256,int24,uint160))') };
const ADM = () => true; /* admission forcee : on juge la ROUTE seule ; l admission a son propre cas */
const SQRT = 2n ** 96n * 3n; /* 9 unites brutes de jeton par unite brute d USDC */
/* `retourGarde` : la part rendue a la REVENTE (10000 = au prix moyen) ; la vente cote amountIn / 9 x retourGarde / 10000 */
function pools({ ts = 1, usdc = 30_000_000_000n, liq = 10n ** 15n, garde = 9990n, revert = false, pool = POOL, panne = false, retourGarde = 9990n, revertVente = false, panneVente = false, compte = null } = {}) {
  return async (to, data) => {
    if (compte) compte.n += 1;
    if (panne) throw new Error('refused by all 2 endpoints (429)');
    if (bas(to) === bas(FACTORY_AERODROME_CL) && data.startsWith(S.getPool)) { if (compte) compte.getPool += 1; return BigInt('0x' + data.slice(-64)) === BigInt(ts) ? pad(pool) : hex64(0n); }
    if (bas(to) === USDC && data.startsWith(S.bal)) return hex64(usdc);
    if (data === S.liq) return hex64(liq);
    if (data === S.s0) return hex64(SQRT) + '0'.repeat(64 * 6);
    if (data.startsWith(S.q)) {
      const tokenIn = '0x' + data.slice(10 + 24, 10 + 64);
      const amountIn = BigInt('0x' + data.slice(10 + 128, 10 + 192));
      if (tokenIn === USDC) { if (revert) throw new Error('execution reverted'); return hex64(amountIn * 9n * garde / 10000n) + '0'.repeat(64 * 3); }
      if (panneVente) throw new Error('refused by all 2 endpoints (429)');
      if (revertVente) throw new Error('execution reverted');
      return hex64(amountIn * retourGarde / 9n / 10000n) + '0'.repeat(64 * 3);
    }
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

await cas('⛔⛔⛔ REVUE 2026-10-25 : LE COTE VENTE — un aller-retour de 10 USDC qui perd > 2 % n a PAS de Buy (LIc -16,6 %, SEc -6,5 %)', async () => {
  const bon = await routeAction({ appel: pools(), adr: VRAIE, admise: ADM });
  assert.equal(bon.achetable, true); assert.equal(bon.perteBps, 19, JSON.stringify(bon));
  /* LIc : achat a 1 bps du moyen, mais la revente rend 8,34 sur 10 */
  const lic = await routeAction({ appel: pools({ garde: 9999n, retourGarde: 8341n }), adr: VRAIE, admise: ADM });
  assert.equal(lic.achetable, false, 'un aller-retour a -16,6 % garde son Buy'); assert.equal(lic.code, 'ALLER_RETOUR');
  assert.ok(lic.perteBps > 1600 && lic.perteBps < 1700, String(lic.perteBps)); assert.match(lic.phrase, /sells for 8\.34 USDC at its current state, a 16\.\d% gap between buying and selling/);
  /* NOKc : -1,6 % passe ; la borne est 2 % exactement (200 bps passe, 201 non) */
  assert.equal((await routeAction({ appel: pools({ garde: 9999n, retourGarde: 9841n }), adr: VRAIE, admise: ADM })).achetable, true, 'NOKc (-1,6 %) refuse');
  assert.equal(PERTE_ALLER_RETOUR_MAX_BPS, 200);
  const juste = await routeAction({ appel: pools({ garde: 10000n, retourGarde: 9800n }), adr: VRAIE, admise: ADM });
  assert.equal(juste.perteBps, 200); assert.equal(juste.achetable, true);
  const audela = await routeAction({ appel: pools({ garde: 10000n, retourGarde: 9799n }), adr: VRAIE, admise: ADM });
  assert.equal(audela.perteBps, 201); assert.equal(audela.code, 'ALLER_RETOUR');
  /* la vente qui reverte est une reponse (refus nomme) ; une vente non lue n est pas un verdict */
  const vnc = await routeAction({ appel: pools({ revertVente: true }), adr: VRAIE, admise: ADM });
  assert.equal(vnc.code, 'VENTE_NON_COTEE'); assert.equal(vnc.achetable, false, 'une vente qui reverte garde son Buy');
  assert.equal((await routeAction({ appel: pools({ panneVente: true }), adr: VRAIE, admise: ADM })).etat, 'NON_MESURE');
  /* les DEUX jambes au meme bloc : le bloc epingle par l appelant est servi avec le verdict */
  const b = await routeAction({ appel: pools(), adr: VRAIE, admise: ADM, bloc: 53046326 });
  assert.equal(b.bloc, 53046326); assert.equal(routeServie(b).bloc, 53046326); assert.equal(routeServie(lic).perteBps, lic.perteBps);
});

await cas('⛔⛔ REVUE 2026-10-25 : getPool EN CACHE — une pool trouvee ne se relit jamais, une absence apres POOL_ABSENTE_TTL_MS', async () => {
  const cache = new Map(), k1 = { n: 0, getPool: 0 };
  await routeAction({ appel: pools({ compte: k1 }), adr: VRAIE, admise: ADM, cachePools: cache, maintenant: 1000 });
  const nEsp = k1.getPool; assert.ok(nEsp >= 5, 'espacements sondes : ' + nEsp);
  const k2 = { n: 0, getPool: 0 };
  const v2 = await routeAction({ appel: pools({ compte: k2 }), adr: VRAIE, admise: ADM, cachePools: cache, maintenant: 2000 });
  assert.equal(k2.getPool, 0, 'getPool relu avec un cache chaud'); assert.equal(v2.achetable, true); assert.equal(k2.n, k1.n - nEsp);
  /* au-dela du TTL, seules les ABSENCES sont relues ; la pool trouvee, jamais */
  const k3 = { n: 0, getPool: 0 };
  await routeAction({ appel: pools({ compte: k3 }), adr: VRAIE, admise: ADM, cachePools: cache, maintenant: 2000 + POOL_ABSENTE_TTL_MS + 1 });
  assert.equal(k3.getPool, nEsp - 1, 'au-dela du TTL : ' + k3.getPool + ' getPool');
  /* une lecture refusee n entre pas au cache */
  const c2 = new Map();
  await routeAction({ appel: pools({ panne: true }), adr: VRAIE, admise: ADM, cachePools: c2 });
  assert.equal(c2.size, 0, 'une lecture refusee a ete mise en cache');
});

await cas('⛔⛔⛔ REVUE 2026-10-25 : FAIL-CLOSED — une action SANS verdict de route n a PAS de Buy ; la fiche suit le Market', async () => {
  const now = 10 * ROUTE_SERVIE_MAX_MS;
  const ok = routeServie(await routeAction({ appel: pools(), adr: VRAIE, admise: ADM }));
  assert.equal(routePourLigne({ v: null, maintenant: now }), ROUTE_EN_COURS);
  assert.equal(routePourLigne({ v: { r: ok, t: now - ROUTE_SERVIE_MAX_MS - 1 }, maintenant: now }), ROUTE_EN_COURS, 'un verdict perime donne encore un Buy');
  assert.equal(routePourLigne({ v: { r: ok, t: now - 1000 }, maintenant: now }), ok);
  /* table : un verdict sur une AUTRE pool n est pas le sien */
  assert.equal(routePourLigne({ v: { r: ok, t: now }, table: { pool: '0x' + 'cd'.repeat(20) }, maintenant: now }), ROUTE_EN_COURS);
  assert.equal(routePourLigne({ v: { r: ok, t: now }, table: { pool: POOL }, maintenant: now }), ok);
  const sansPool = { achetable: false, code: 'POOL_VIDE', phrase: 'No buy: x', pool: null };
  assert.equal(routePourLigne({ v: { r: sansPool, t: now }, table: { pool: POOL }, maintenant: now }), sansPool);
  /* ROUTE_EN_COURS retire le Buy (Market ET fiche, meme verdictRoutage) et dit qu on verifie */
  const v = verdictRoutage({ aMarche: true, dex: 'aerodrome', poolAdr: POOL, routeAction: ROUTE_EN_COURS });
  assert.equal(v.achetableIci || v.achetableEnEth || v.achetableEnUsdc, false, 'une action sans verdict a un Buy');
  assert.match(raisonSansBuy(v, { liqOk: true }).phrase, /checking its route/);
  assert.equal(raisonSansBuy(v, { liqOk: true }).code, 'ROUTE_EN_COURS');
  /* le cablage serveur : toute ligne d action porte un verdict (routePourLigne), la table d abord, routes persistees avec leur bloc */
  const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(srv, /l\.routeAction = estAction\(a\) \? routePourLigne\(\{ v: ac\.prouvees\.has\(a\) \? routesActions\.get\(a\) : null, table: POOLS_ACTIONS_AERODROME\.get\(a\) \|\| null \}\) : null;/);
  assert.match(srv, /const estAction = \(a\) => ac\.prouvees\.has\(a\) \|\| marqueesSet\.has\(a\) \|\| CREATIONS_GRAINE\.has\(a\) \|\| POOLS_ACTIONS_AERODROME\.has\(a\);/);
  assert.match(srv, /\(Number\(POOLS_ACTIONS_AERODROME\.has\(y\.adr\)\) - Number\(POOLS_ACTIONS_AERODROME\.has\(x\.adr\)\)\)/, 'la table n est pas lue d abord');
  assert.match(srv, /routes: \[\.\.\.routesActions\]\.map\(\(\[adr, v\]\) => \(\{ adr, r: v\.r, t: v\.t \}\)\), pools: \[\.\.\.poolsActionsCache\]/, 'les routes ne sont pas persistees');
  assert.match(srv, /for \(const v of Array\.isArray\(x && x\.routes\) \? x\.routes : \[\]\)/, 'les routes ne sont pas relues du disque');
  assert.match(srv, /routeAction\(\{ appel: appelEpingle, adr: p\.adr, cachePools: poolsActionsCache, bloc \}\)/);
  assert.match(srv, /rpcRails\('eth_call', \[\{ to, data \}, '0x' \+ bloc\.toString\(16\)\]\)/, 'les jambes ne sont pas epinglees au meme bloc');
  assert.match(srv, /if \(p && \/\^0x\[0-9a-f\]\{40\}\$\/\.test\(p\.adr\) && verdictGravable\(p\)\) preuvesActions\.set/, 'le disque rend des refus non definitifs');
  assert.match(srv, /lecteurPreuves\(\[rpcServeur, \.\.\.replisPreuves\]\)/);
  /* un corps de trending ecrit AVANT le fail-closed (routeAction null sur les actions) n est pas servi au demarrage */
  assert.match(srv, /const champsAttendus = \['emetteurEtat', 'actionsChaine', 'routesFermees'\];/);
  assert.match(srv, /achatMarche, actionsChaine, routesFermees: true,/);
  assert.match(srv, /lecteurUrl\('https:\/\/base\.drpc\.org'\)/);
  /* la fiche (carte) : le meme verdict que le Market */
  const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  assert.match(html, /const routeActionLue = mkPublic && !\(mkPublic\.achat && mkPublic\.achat\.cle\) \? \(mkPublic\.routeAction \|\| null\) : null;/);
  assert.match(html, /const entreeRoutage = \{ aMarche, dex: dexLu, poolAdr: poolAdrLu, routeAction: routeActionLue \};/, 'la fiche de la carte juge sans la route du serveur');
});

await cas('⛔⛔ LES POOLS A ALLER-RETOUR > 2 % : dans la table (vraie pool), hors du jeu', async () => {
  assert.ok(ALLER_RETOUR_REFUSES.size >= 2);
  for (const [a, r] of ALLER_RETOUR_REFUSES) {
    const t = POOLS_ACTIONS_AERODROME.get(a);
    assert.ok(t, r.symbole + ' : adresse absente de la table (recopie fausse ?)'); assert.equal(t.symbole, r.symbole);
    assert.ok(r.perteBps > 200 && Number.isSafeInteger(r.bloc));
  }
  assert.ok(ALLER_RETOUR_REFUSES.has('0xb200000000000000000000d61efd9f54a23ef9eb') && ALLER_RETOUR_REFUSES.has('0xb2000000000000000000003088798f6d0722aaac'), 'LIc et SEc');
  assert.ok(!ALLER_RETOUR_REFUSES.has('0xb2000000000000000000005ac674f707e357409c'), 'NOKc (-1,6 %) est refuse');
  assert.match(phraseAllerRetour('0xb200000000000000000000d61efd9f54a23ef9eb'), /what 10 USDC buys sells for 16\.5% less/);
  assert.equal(phraseAllerRetour('0xb2000000000000000000005ac674f707e357409c'), null);
  const { planRollEnAction, planGainEnAction } = await import('./rolls-en-action.js');
  const LIC = '0xb200000000000000000000d61efd9f54a23ef9eb', NOK = '0xb2000000000000000000005ac674f707e357409c';
  const W = '0x' + '11'.repeat(20);
  const muet = async () => { throw new Error('aucune lecture attendue avant le refus'); };
  const r1 = await planRollEnAction({ rpc: muet, chaine: 8453, compte: W, contrat: W, action: LIC, rolls: 1, guess: 5 });
  assert.equal(r1.etat, 'REFUSE'); assert.match(r1.pourquoi, /cannot pay a roll here: on its pool, what 10 USDC buys sells for 16\.5% less/, 'un roll se paie encore dans une action a -16 % : ' + r1.pourquoi);
  const r2 = await planGainEnAction({ rpc: muet, chaine: 8453, compte: W, action: LIC, montantUsdc: 5_000_000n });
  assert.equal(r2.etat, 'REFUSE'); assert.match(r2.pourquoi, /prize cannot be converted to this stock here: on its pool/);
  /* NOKc passe la garde (le refus suivant, s il y en a, n est pas celui-la) */
  const r3 = await planRollEnAction({ rpc: muet, chaine: 8453, compte: W, contrat: W, action: NOK, rolls: 1, guess: 5 }).catch((e) => ({ etat: 'LEVE', pourquoi: e.message }));
  assert.doesNotMatch(String(r3.pourquoi || ''), /between buying and selling/);
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
  assert.match(srv, /l\.routeAction = estAction\(a\) \? routePourLigne\(/, 'la route n est pas posee sur chaque ligne d action');
  /* 2026-10-25 : les entrees de la table sont relues aussi (4 sur 25 ne passaient plus la regle) — la boucle ne les saute plus */
  assert.doesNotMatch(srv, /if \(POOLS_ACTIONS_AERODROME\.has\(p\.adr\)\) continue;/, 'la table echappe encore a la regle du Buy');
  assert.match(srv, /for \(const p of appelEpingle \? ordre : \[\]\) \{/);
  const html0 = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  assert.match(html0, /d\.actionsChaine\.sansUnites > 0 \? ', ' \+ d\.actionsChaine\.sansUnites \+ ' with no units in circulation yet \(not listed\)'/, 'le Market ne dit pas combien d actions prouvees n ont aucune unite');
  assert.match(srv, /achatMarche, actionsChaine,/, 'le compte n est pas servi sur \/api\/trending');
  assert.match(srv, /retenirCreationsEmetteur\(cr\.creations,/, 'les creations du scan ne deviennent pas candidates');
  assert.match(srv, /decouvrirActions\(\{ rpc: rpcPreuves,/, 'les preuves ne lisent pas le recu par la liste de lecteurs qui sert les vieux recus');
  const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  assert.match(html, /verdictRoutage\(\{ aMarche: true, dex: lA\.dex, poolAdr: lA\.poolAdr, routeAction: lA\.routeAction \}\)/);
});

console.log('✓ test-actions-chaine-20261025 : ' + n + ' cas');
console.log('   spam (prefixe 0xb200 copie + evenement forge) REFUSE au code ; B20 natif d un autre wallet REFUSE au tx.from ;');
console.log('   evenement hors factory REFUSE ; la vraie action PROUVEE. Pagination : 3 pages lues, une manquante = RETOMBEE.');
console.log('   ⚠️ chaine fictive : ne prouve pas mainnet (sonde live, banc fork).');
