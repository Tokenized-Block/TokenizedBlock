/* test-cle-v4-absente-20261010.mjs — LA CLE V4 D UN POOLID : UNE ABSENCE LUE SE RETIENT, LA SUIVANTE NE LIT QUE LES BLOCS NOUVEAUX.
 *
 * Mesure en prod (compteur d archive par consommateur, 2026-10-10) : `route /api/prix-usd` = 2e consommateur. cleV4DuPoolId balaie
 * 59 fenetres de 2 000 blocs (~55 au-dela de la profondeur de publicnode, donc a l archive) et ne retenait que les succes ; la
 * reponse de /api/prix-usd ne vit que 300 s. Meme remede que /api/cle (test-cle-pool-absente-20261010.mjs, revue adversariale),
 * EXECUTE sur la fonction extraite du fichier livre, faux noeud qui compte ses getLogs :
 *   A. absence lue : 59 fenetres, la grille d avant, plage retenue ; B. la suivante ne lit que les blocs nouveaux ; C. une pool nee
 *   depuis est trouvee ; D. un NON_LUE n est JAMAIS retenu ; E. une memoire qui ne touche plus la fenetre est oubliee (rien sous BAS) ;
 *   F. tete illisible / nulle : NON_LUE sans memoire ; G. ecriture concurrente : union des plages lues qui se touchent ;
 *   H. persistance ecrite, relue au redemarrage ; I. relecture : plages bien formees seulement.
 * ⛔ BORNE : les vrais noeuds ne sont pas exerces ; la prod le dira dans /sante.archive.parQui. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { decoderInitialize } from './pools-du-jeton.js';
import { LOGS_INITIALIZE_MESURES } from './cles-v4-mesurees.js';
/* 2026-10-11 : cleV4DuPoolId consulte clesPool (cache de /api/cle) par cleV4Connue avant de balayer ; ici clesPool est VIDE : rien
 *   n est trouve, chaque cas de ce banc lit ses fenetres comme avant (test-cle-v4-connue juge la recherche elle-meme). */
import { cleV4Connue } from './cle-v4-connue.js';

const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const i = src.indexOf('const CLES_V4_ABSENTES_MAX = 5000;');
const iF = src.indexOf('async function cleV4DuPoolId(id) {', i);
const finF = /\r?\n\}\r?\n/.exec(src.slice(iF));
assert.ok(i > 0 && iF > i && finF, 'bloc cleV4DuPoolId introuvable');
const blocCle = src.slice(i, iF + finF.index + finF[0].length);
const iP = src.indexOf('const FICHIER_CLES_V4_ABSENTES = ');
const fP = src.indexOf('})();', src.indexOf('(function relireClesV4Absentes() {', iP));
assert.ok(iP > 0 && fP > iP, 'bloc de persistance v4 introuvable');
const blocP = src.slice(iP, fP + '})();'.length);
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const TOPIC = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
const LOG = LOGS_INITIALIZE_MESURES[0];
const ID = String(LOG.topics[1]).toLowerCase();
const T0 = 52_400_000, BAS0 = T0 - 59 * 2000, HAUT0 = T0 - 1;
let n = 0;
const cas = async (t, f) => { n++; try { await f(); } catch (e) { console.error('✗ ' + t); throw e; } };

function monter({ tete = T0, disque = null, refuse = () => false, pool = null, log = LOG } = {}) {
  const e = { tete, teteBrute: undefined, appels: [], pendantLogs: null, pool };
  const rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return e.teteBrute !== undefined ? e.teteBrute : '0x' + e.tete.toString(16);
    const de = parseInt(p[0].fromBlock, 16), a = parseInt(p[0].toBlock, 16);
    e.appels.push([de, a]);
    if (e.pendantLogs) { const f = e.pendantLogs; e.pendantLogs = null; f(); }
    if (refuse(de, a)) throw new Error('request limit reached');
    return e.pool !== null && e.pool >= de && e.pool <= a ? [{ ...log, blockNumber: '0x' + e.pool.toString(16) }] : [];
  };
  const fichiers = disque || new Map();
  /* 2026-10-10 (refus certain) : cleV4DuPoolId lit ses fenetres par lecteurLogs(tete) — doublure = le helper SANS archive (budget
   *   jamais epuise) : tout va au faux noeud du banc, comme avant. Le routage reel : test-refus-certain-20261010.mjs. */
  const lecteurLogs = () => ({
    /* comme le vrai : seule une liste est une reponse d eth_getLogs ; sans archive, rien n est jamais « non envoye » */
    rpc: async (m, p) => { const r = await rpc(m, p); if (m === 'eth_getLogs' && !Array.isArray(r)) throw new Error('not a list'); return r; },
    nonEnvoyee: () => false, suivi: { nonEnvoyees: 0, essais: 0 } });
  const M = new Function('clesV4Lues', 'rpcServeur', 'PM_V4', 'TOPIC_INITIALIZE', 'decoderInitialize', 'process', 'existsSync', 'join',
    'readFileSync', 'writeFileSync', 'renameSync', 'setTimeout', 'console', 'lecteurLogs', 'cleV4Connue', 'clesPool', 'clesCache',
    blocCle + '\n' + (disque ? blocP : '') + '\n; return { cleV4DuPoolId, clesV4Absentes, CLES_V4_ABSENTES_MAX };')(
    new Map(), rpc, PM, TOPIC, decoderInitialize, { env: {} }, (p) => p === '/data' || fichiers.has(p), (...x) => x.join('/'),
    (p) => fichiers.get(p), (p, v) => fichiers.set(p, v), (a, b) => { fichiers.set(b, fichiers.get(a)); fichiers.delete(a); },
    (f) => { f(); return { unref() {} }; }, { log() {}, warn() {} }, lecteurLogs, cleV4Connue, new Map(), new Map());
  return { ...M, e };
}

await cas('A absence LUE : 59 fenetres, la grille d avant ([tete-2000, tete-1] en tete, [tete-118000, tete-116001] en dernier), plage retenue', async () => {
  const { cleV4DuPoolId, clesV4Absentes, e } = monter();
  assert.equal(await cleV4DuPoolId(ID), null);
  assert.equal(e.appels.length, 59);
  assert.deepEqual(e.appels[0], [T0 - 2000, T0 - 1]); assert.deepEqual(e.appels[58], [T0 - 118000, T0 - 116001]);
  assert.deepEqual(clesV4Absentes.get(ID), { depuis: BAS0, jusqua: HAUT0 });
});
await cas('B la suivante ne lit QUE les blocs nouveaux (+1 500 blocs = 1 fenetre), pas 59', async () => {
  const { cleV4DuPoolId, e } = monter();
  await cleV4DuPoolId(ID);
  e.tete += 1500; e.appels.length = 0;
  assert.equal(await cleV4DuPoolId(ID), null);
  assert.deepEqual(e.appels, [[HAUT0 + 1, T0 + 1500 - 1]]);
});
await cas('C une pool NEE depuis est trouvee, la cle gardee, l absence oubliee', async () => {
  const { cleV4DuPoolId, clesV4Absentes, e } = monter();
  await cleV4DuPoolId(ID);
  e.tete += 3000; e.pool = T0 + 1000;
  assert.deepEqual(await cleV4DuPoolId(ID), decoderInitialize(LOG).cle);
  assert.equal(clesV4Absentes.has(ID), false);
});
await cas('D un NON_LUE (fenetres refusees) n est JAMAIS retenu : la suivante relit les 59', async () => {
  const { cleV4DuPoolId, clesV4Absentes, e } = monter({ refuse: (de) => T0 - de > 9000 });
  const r = await cleV4DuPoolId(ID);
  assert.equal(r && r.etat, 'NON_LUE'); assert.equal(r.ratees, 55);
  assert.equal(clesV4Absentes.has(ID), false);
  e.appels.length = 0; await cleV4DuPoolId(ID);
  assert.equal(e.appels.length, 59);
});
await cas('E une memoire qui ne touche plus la fenetre est OUBLIEE : balayage plein, rien lu sous BAS', async () => {
  const { cleV4DuPoolId, clesV4Absentes, e } = monter();
  await cleV4DuPoolId(ID);
  e.tete += 300_000; e.appels.length = 0;
  assert.equal(await cleV4DuPoolId(ID), null);
  assert.equal(e.appels.length, 59);
  const bas = e.tete - 118000;
  assert.ok(e.appels.every(([de]) => de >= bas));
  assert.deepEqual(clesV4Absentes.get(ID), { depuis: bas, jusqua: e.tete - 1 });
});
await cas('F tete illisible ou nulle : NON_LUE, aucune lecture, rien retenu', async () => {
  for (const brute of [null, '0x', '0x0']) {
    const { cleV4DuPoolId, clesV4Absentes, e } = monter();
    e.teteBrute = brute;
    const r = await cleV4DuPoolId(ID);
    assert.equal(r && r.etat, 'NON_LUE'); assert.equal(e.appels.length, 0); assert.equal(clesV4Absentes.has(ID), false);
  }
});
await cas('G une ecriture concurrente qui TOUCHE est unie ; une qui ne touche pas est ecrasee par la lecture recente', async () => {
  const a = monter();
  a.e.pendantLogs = () => { a.clesV4Absentes.set(ID, { depuis: BAS0 - 50_000, jusqua: BAS0 - 1 }); };
  await a.cleV4DuPoolId(ID);
  assert.deepEqual(a.clesV4Absentes.get(ID), { depuis: BAS0 - 50_000, jusqua: HAUT0 });
  const b = monter();
  b.e.pendantLogs = () => { b.clesV4Absentes.set(ID, { depuis: 100, jusqua: 200 }); };
  await b.cleV4DuPoolId(ID);
  assert.deepEqual(b.clesV4Absentes.get(ID), { depuis: BAS0, jusqua: HAUT0 });
});
await cas('H persistance : ecrite apres une absence lue, relue au redemarrage — la suivante lit 1 fenetre, pas 59', async () => {
  const disque = new Map();
  const a = monter({ disque });
  await a.cleV4DuPoolId(ID);
  assert.ok(disque.has('/data/cles-v4-absentes.json'));
  const b = monter({ disque, tete: T0 + 1500 });
  assert.deepEqual(b.clesV4Absentes.get(ID), { depuis: BAS0, jusqua: HAUT0 });
  await b.cleV4DuPoolId(ID);
  assert.equal(b.e.appels.length, 1);
});
await cas('I relecture : seules les plages bien formees entrent (fichier abime : rien d invente)', async () => {
  const disque = new Map([['/data/cles-v4-absentes.json', JSON.stringify([[ID, { depuis: 10, jusqua: 20 }], ['0x12', { depuis: 1, jusqua: 2 }],
    ['0x' + 'c'.repeat(64), { depuis: 30, jusqua: 20 }], ['0x' + 'd'.repeat(64), { depuis: 0, jusqua: 5 }], 'x', null])]]);
  const b = monter({ disque });
  assert.deepEqual([...b.clesV4Absentes.keys()], [ID]);
});

/* ── revue adversariale du 2026-10-10 : adjacence des deux cotes + les quatre trous de couverture ─────────────────────────────── */
await cas('J la tete RECULE sous le bas de la memoire puis remonte : la pool au milieu est TROUVEE (contre-exemple de la revue)', async () => {
  const { cleV4DuPoolId, clesV4Absentes, e } = monter({ tete: 52_400_000 });
  await cleV4DuPoolId(ID);
  e.tete = 52_000_000; await cleV4DuPoolId(ID);
  assert.deepEqual(clesV4Absentes.get(ID), { depuis: 51_882_000, jusqua: 51_999_999 }, 'des blocs jamais lus ont ete fusionnes');
  e.tete = 52_100_000; e.pool = 52_050_000;
  assert.deepEqual(await cleV4DuPoolId(ID), decoderInitialize(LOG).cle);
});
await cas('K la borne : 5 001 absences -> 5 000, la plus ancienne partie', async () => {
  const { cleV4DuPoolId, clesV4Absentes, CLES_V4_ABSENTES_MAX } = monter();
  const id = (k) => '0x' + k.toString(16).padStart(64, '0');
  for (let k = 1; k <= CLES_V4_ABSENTES_MAX + 1; k++) await cleV4DuPoolId(id(k));
  assert.equal(clesV4Absentes.size, CLES_V4_ABSENTES_MAX); assert.equal(clesV4Absentes.has(id(1)), false); assert.ok(clesV4Absentes.has(id(CLES_V4_ABSENTES_MAX + 1)));
});
await cas('L une absence relue repasse EN FIN (le plus ancien part le premier)', async () => {
  const { cleV4DuPoolId, clesV4Absentes, e } = monter();
  const id = (k) => '0x' + k.toString(16).padStart(64, '0');
  for (const k of [1, 2, 3]) await cleV4DuPoolId(id(k));
  e.tete += 10; await cleV4DuPoolId(id(1));
  assert.deepEqual([...clesV4Absentes.keys()], [id(2), id(3), id(1)]);
});
await cas('M un Initialize trouve mais REFUSE par decoderInitialize : null, et la memoire n est pas touchee', async () => {
  /* un log dont un champ ne recalcule plus le poolId : le decodeur le refuse */
  const rejete = { ...LOG, topics: [LOG.topics[0], LOG.topics[1], '0x' + '0'.repeat(24) + 'ff'.repeat(20), LOG.topics[3]] };
  assert.ok(decoderInitialize(rejete).erreur, 'temoin : ce log doit etre refuse par le decodeur');
  const { cleV4DuPoolId, clesV4Absentes, e } = monter({ log: rejete });
  await cleV4DuPoolId(ID);
  const avant = clesV4Absentes.get(ID);
  e.tete += 1500; e.pool = T0 + 500; /* le refuse apparait dans les blocs nouveaux */
  assert.equal(await cleV4DuPoolId(ID), null);
  assert.deepEqual(clesV4Absentes.get(ID), avant, 'un Initialize refuse par le decodeur a modifie la memoire');
});

console.log('✓ ' + n + ' cas — la cle v4 d un poolId : une absence lue se retient, la suivante ne lit que les blocs nouveaux');
