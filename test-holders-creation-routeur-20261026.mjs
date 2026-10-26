/* test-holders-creation-routeur-20261026.mjs — UN BLOCK DU ROUTEUR REPRIS DU VOLUME : SA NAISSANCE SE CHERCHE DEPUIS SA CREATION PROUVEE.
 *
 * Mesure prod (game54, x-ms-monitor) : /api/blocks-routeur sert UNIT (0xb2000000000000000000007afa7ed748b0874f27) avec sa tx de creation
 *   (reprise du volume [51354834, 53113737]) ; creationsLuesIci ne le connaissait pas (seul un scan DE CE PROCESSUS y ecrit), et
 *   /api/holders cherchait sa naissance depuis PREMIER_BLOCK_TB. Relu on-chain le 2026-10-26 (publicnode) : le recu de cette tx porte
 *   le log B20Created emis par la factory 0xb20f…0000 pour UNIT, statut 0x1, bloc 52 694 118.
 * Le correctif : apprendreCreationRouteur (serveur-web.js) prend la TX de l index, et le BLOC du RECU relu ici (creation-b20-prouvee.js).
 * Gardes EXECUTEES sur le fichier livre (tranche routeurEtat -> rattraperBlocksRouteur, reconstruireHolders, holdersCorps) :
 *   P1..P5 prouverCreationB20 seule : PROUVE sur le recu ; REFUSE log hors factory, autre jeton, statut 0x0 ; NON_MESURE recu absent / autre tx.
 *   R1 entree reprise (bloc de la reprise FAUX expres) + recu valide : la recherche part du bloc du RECU, pas de PREMIER ni de la reprise.
 *   R2 TEMOIN recu dont le log vient d un autre contrat : PREMIER_BLOCK_TB, comme avant.
 *   R3 recu non lu a la 1re passe : PREMIER ; lu a la passe suivante : la creation est apprise (retente, pas gravee).
 *   R4 tete illisible : jamais « no mint found up to block <PREMIER-1> » (zero fenetre lue = pas une absence).
 * Usage : node test-holders-creation-routeur-20261026.mjs [copie/serveur-web.js] [copie/creation-b20-prouvee.js]   (mutants = COPIES)
 * ⛔ BORNE : noeud simule ; le recu reel d UNIT est relu par la sonde de la session, pas par ce banc. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as S from './soldes-jeton.js';
import { scannerNesDuRouteur, GRAINE_ROUTEUR, PLANCHER_ROUTEUR, RETARD_MAX_INDEX } from './index-routeur.js';
import * as AC from './actions-chaine.js';
import { partsHolders } from './parts-holders.js';
import { FACTORY, TOPIC_CREATED } from './index-blocks.js';

const { prouverCreationB20 } = await import(process.argv[3] ? pathToFileURL(process.argv[3]).href : './creation-b20-prouvee.js');
const { TOPIC_TRANSFER, ADRESSE_ZERO } = S;
let n = 0;
const rates = [];
const cas = async (titre, f) => { n++; try { await f(); console.log('  ok  ' + titre); } catch (e) { rates.push(titre); console.error('  x ' + titre + '\n      ' + String(e && e.message).split('\n')[0]); } };

const src = readFileSync(process.argv[2] || new URL('./serveur-web.js', import.meta.url), 'utf8');
const entre = (debut, fin) => {
  const i = src.indexOf(debut); assert.ok(i > 0, 'ancre introuvable : ' + debut);
  if (fin instanceof RegExp) { const m = fin.exec(src.slice(i)); assert.ok(m, 'fin introuvable apres ' + debut); return src.slice(i, i + m.index + m[0].length); }
  const j = src.indexOf(fin, i); assert.ok(j > i, 'fin introuvable : ' + fin); return src.slice(i, j);
};
const tranche = entre('const routeurEtat = {', 'function rattraperBlocksRouteur() {')
  + '\n' + entre('async function reconstruireHolders(jeton) {', /\r?\n\}\r?\n/)
  + '\n' + entre('async function holdersCorps(jeton) {', /\r?\n\}\r?\n/);
const PREMIER = Number(/const PREMIER_BLOCK_TB = (\d+);/.exec(src)[1]);
assert.equal(PREMIER, 50861088, 'le plancher du fichier livre a change : ' + PREMIER);

const TETE = 53114036;                                   /* tete lue le 2026-10-26 (eth_blockNumber, mainnet.base.org) */
const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
const TX_UNIT = '0xe99513f6ce0dd841559545632ea75eeee2b1cae87ffc91564bddc7f4a9bc8d65'; /* copiee de /api/blocks-routeur (prod) et du log relu */
const CREATION = 52694118;                               /* blockNumber du recu de TX_UNIT, relu le 2026-10-26 */
const AUTRE = '0x' + 'c0'.repeat(20);
const mot = (a) => '0x' + String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const hx = (b) => '0x' + b.toString(16);

const recuDe = ({ tx = TX_UNIT, bloc = CREATION, emetteur = FACTORY, jeton = UNIT, status = '0x1', hash = tx } = {}) => ({
  transactionHash: hash, status, blockNumber: hx(bloc),
  logs: [{ address: emetteur, blockNumber: hx(bloc), transactionHash: tx, topics: [TOPIC_CREATED, mot(jeton), mot('0')], data: '0x' }] });

/** noeud simule : recus par tx ; mints par jeton ; compte les fenetres de recherche de naissance */
function noeud({ recus = new Map(), mints = [], tete = hx(TETE) } = {}) {
  const fenetresNaissance = [];
  const rpc = async (methode, params) => {
    if (methode === 'eth_blockNumber') return tete;
    if (methode === 'eth_getTransactionReceipt') { const r = recus.get(params[0]); return typeof r === 'function' ? r() : (r || null); }
    if (methode === 'eth_call') return mot(mints.reduce((s, m) => s + m.v, 0n).toString(16));
    if (methode === 'eth_getCode') return '0x';
    if (methode === 'eth_getTransactionByHash') return null;
    if (methode !== 'eth_getLogs') throw new Error('appel non simule : ' + methode);
    const p = params[0];
    const de = parseInt(p.fromBlock, 16), a = parseInt(p.toBlock, 16);
    if ((p.topics || []).length > 1) fenetresNaissance.push({ de, a });
    return mints.filter((m) => m.jeton === String(p.address).toLowerCase() && m.bloc >= de && m.bloc <= a)
      .map((m) => ({ blockNumber: hx(m.bloc), topics: [TOPIC_TRANSFER, mot(ADRESSE_ZERO), mot('0x' + 'a1'.repeat(20))], data: mot(m.v.toString(16)) }));
  };
  rpc.fenetresNaissance = fenetresNaissance;
  return rpc;
}
function monter(rpc) {
  const PARAMS = ['rpcServeur', 'GRAINE_ROUTEUR', 'GRAINE_JUSQUA', 'PLANCHER_ROUTEUR', 'PREMIER_BLOCK_TB', 'noterTeteLue', 'confronterReprise',
    'RETARD_MAX_INDEX', 'PAS_ROUTEUR', 'lecteurLogs', 'scannerNesDuRouteur', 'REPRISES_LECTURE_MS', 'archiveEpuisee', 'noterProgresIndex',
    'holdersCache', 'HOLDERS_MAX', 'lireNaissance', 'naissanceDuJeton', 'passeIncrementale', 'ecrireHolders', 'preuvesActions', 'prouverAction',
    'verifierSomme', 'soldesNegatifs', 'partsHolders', 'POT_FICTIF', 'prouverCreationB20'];
  const cache = new Map();
  const f = new Function(...PARAMS, '"use strict";\n' + tranche + '\n; return { routeurEtat, reconstruireHolders, holdersCorps };');
  const m = f(rpc, GRAINE_ROUTEUR, TETE - 2000, PLANCHER_ROUTEUR, PREMIER, () => {}, () => 'VERIFIEE',
    RETARD_MAX_INDEX, 2000, () => ({ rpc, suivi: { essais: 0 }, nonEnvoyee: () => false }), scannerNesDuRouteur, [], () => false, () => {},
    cache, 200, S.lireNaissance, S.naissanceDuJeton, S.passeIncrementale, () => {}, new Map(), AC.prouverAction,
    S.verifierSomme, S.soldesNegatifs, partsHolders, 10n ** 18n, prouverCreationB20);
  m.cache = cache;
  return m;
}
/* l entree telle que la reprise du volume la pose (bloc FAUX expres : il ne doit jamais servir de depart) */
const reprise = (m, bloc = CREATION - 777) => m.routeurEtat.blocks.set(UNIT, { jeton: UNIT, sel: '0x' + 'ba'.repeat(32), bloc, tx: TX_UNIT });
const premiere = (rpc) => (rpc.fenetresNaissance[0] || {}).de;

await cas('P1 recu valide (statut 0x1, log B20Created de la FACTORY pour ce jeton) : PROUVE, bloc = blockNumber du recu', async () => {
  const r = await prouverCreationB20({ rpc: async () => recuDe(), adr: UNIT, tx: TX_UNIT });
  assert.equal(r.etat, 'PROUVE', JSON.stringify(r)); assert.equal(r.bloc, CREATION);
});
await cas('P2 le meme evenement emis par un AUTRE contrat : REFUSE (SANS_LOG_FACTORY)', async () => {
  const r = await prouverCreationB20({ rpc: async () => recuDe({ emetteur: AUTRE }), adr: UNIT, tx: TX_UNIT });
  assert.equal(r.etat, 'REFUSE', JSON.stringify(r)); assert.equal(r.code, 'SANS_LOG_FACTORY');
});
await cas('P3 log de la factory pour un AUTRE jeton : REFUSE', async () => {
  const r = await prouverCreationB20({ rpc: async () => recuDe({ jeton: '0xb2' + '0'.repeat(37) + '1' }), adr: UNIT, tx: TX_UNIT });
  assert.equal(r.etat, 'REFUSE', JSON.stringify(r));
});
await cas('P4 statut 0x0 : REFUSE (TX_ECHOUEE)', async () => {
  const r = await prouverCreationB20({ rpc: async () => recuDe({ status: '0x0' }), adr: UNIT, tx: TX_UNIT });
  assert.equal(r.code, 'TX_ECHOUEE', JSON.stringify(r));
});
await cas('P5 recu absent, recu d une autre tx, noeud qui leve : NON_MESURE (jamais un bloc)', async () => {
  for (const rpc of [async () => null, async () => recuDe({ hash: '0x' + '11'.repeat(32) }), async () => { throw new Error('over rate limit'); }]) {
    const r = await prouverCreationB20({ rpc, adr: UNIT, tx: TX_UNIT });
    assert.equal(r.etat, 'NON_MESURE', JSON.stringify(r)); assert.equal(r.bloc, undefined);
  }
});
await cas('R1 UNIT repris du volume + recu valide : la recherche de naissance part du bloc du RECU (52 694 118)', async () => {
  const rpc = noeud({ recus: new Map([[TX_UNIT, recuDe()]]), mints: [{ jeton: UNIT, bloc: CREATION, v: 10n ** 21n }] });
  const m = monter(rpc); reprise(m);
  const e = await m.reconstruireHolders(UNIT);
  console.log('      fenetres de naissance : ' + rpc.fenetresNaissance.length + ' (premiere a ' + premiere(rpc) + ')');
  assert.equal(premiere(rpc), CREATION, 'premiere fenetre ' + premiere(rpc) + ' (PREMIER = ' + PREMIER + ', bloc de la reprise = ' + (CREATION - 777) + ')');
  assert.equal(e.naissance, CREATION);
  assert.equal(e.naissanceDepuis, CREATION);
  assert.equal(rpc.fenetresNaissance.length, 1);
});
await cas('R2 TEMOIN recu dont le log vient d un autre contrat : PREMIER_BLOCK_TB exactement (comme avant)', async () => {
  const rpc = noeud({ recus: new Map([[TX_UNIT, recuDe({ emetteur: AUTRE })]]), mints: [{ jeton: UNIT, bloc: PREMIER + 10, v: 1n }] });
  const m = monter(rpc); reprise(m);
  await m.reconstruireHolders(UNIT);
  assert.equal(premiere(rpc), PREMIER, 'premiere fenetre ' + premiere(rpc));
});
await cas('R3 recu non lu a la 1re passe : PREMIER ; lu a la passe suivante : la creation est apprise', async () => {
  let lu = false;
  const rpc = noeud({ recus: new Map([[TX_UNIT, () => (lu ? recuDe() : null)]]), mints: [] });
  const m = monter(rpc); reprise(m);
  await m.reconstruireHolders(UNIT);
  assert.equal(premiere(rpc), PREMIER, '1re passe : ' + premiere(rpc));
  lu = true; rpc.fenetresNaissance.length = 0;
  await m.reconstruireHolders(UNIT);
  assert.equal(premiere(rpc), CREATION, '2e passe : ' + premiere(rpc));
});
await cas('R4 tete illisible : jamais « no mint found … up to block ' + (PREMIER - 1) + ' » (rien lu n est pas une absence)', async () => {
  const rpc = noeud({ tete: null });
  const m = monter(rpc);
  await m.reconstruireHolders(UNIT);
  const corps = JSON.parse(await m.holdersCorps(UNIT));
  assert.ok(!/no mint found/.test(String(corps.pourquoi)), corps.pourquoi);
  assert.equal(corps.etat, 'NON_LU');
});

console.log((rates.length ? 'ROUGE ' : 'ok ') + 'holders-creation-routeur - ' + (n - rates.length) + '/' + n
  + ' ; NE PROUVE PAS la reponse de /api/holders en prod (deploiement non fait), ni la limite de debit reelle');
if (rates.length) process.exit(1);
