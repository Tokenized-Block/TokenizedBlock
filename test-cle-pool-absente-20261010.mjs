/* test-cle-pool-absente-20261010.mjs — UNE ABSENCE LUE D INITIALIZE SE RETIENT ; LA SUIVANTE NE LIT QUE LES BLOCS NOUVEAUX.
 *
 * Mesure en prod (compteur d archive par consommateur, 2026-10-10 01:08-01:13 UTC) : `route /api/cle/:adr` = 136 appels d archive
 * sur 347 (39 %), premier consommateur. resoudreClePool ne retenait que les succes : chaque visite d un block sans pool v4 recente
 * rebalayait 40 fenetres x 2 getLogs (~62 au-dela de la profondeur de publicnode, donc a l archive), et douze requetes identiques
 * faisaient douze balayages. Les gardes, EXECUTEES sur le code extrait du fichier livre (faux noeud qui compte ses getLogs) :
 *   A. premiere absence : la couverture d avant (40 fenetres de 999, du plus recent au plus ancien), resultat ok:false inchange ;
 *   B. la requete suivante ne lit que les blocs NOUVEAUX ; C. une pool nee depuis est TROUVEE (meme couverture) et l absence oubliee ;
 *   D. douze requetes en meme temps = un balayage ; E. un getLogs qui leve n est JAMAIS retenu comme absence ;
 *   F. 10 fenetres puis 40 : seule la partie plus profonde manquante est lue ; G. la carte est bornee.
 * ⛔ BORNE : le vrai noeud (base.org 429 / publicnode / archive) n est pas exerce ; la prod le dira dans /sante.archive.parQui. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const i = src.indexOf('async function resoudreClePool(token, fenetres = 40) {');
const fin = src.indexOf('const clesPoolEnVol = new Map();', i);
assert.ok(i > 0 && fin > i, 'bloc resoudreClePool introuvable');
const bloc = src.slice(i, fin + 'const clesPoolEnVol = new Map();'.length);
const TOPIC = '0x' + 'dd'.repeat(32), PM = '0x' + '44'.repeat(20);
const JETON = '0xb2' + '0'.repeat(36) + 'aa', AUTRE = '0x' + '0'.repeat(40);
let n = 0;
const cas = async (t, f) => { n++; try { await f(); } catch (e) { console.error('✗ ' + t); throw e; } };

function monter({ tete = 1_000_000, pools = [], refuse = () => false } = {}) {
  const e = { tete, pools, appels: [], clesPool: new Map(), teteBrute: undefined, pendantLogs: null };
  const rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return e.teteBrute !== undefined ? e.teteBrute : '0x' + e.tete.toString(16);
    const { fromBlock, toBlock, topics } = p[0];
    const de = parseInt(fromBlock, 16), a = parseInt(toBlock, 16);
    e.appels.push([de, a]);
    if (e.pendantLogs) { const f = e.pendantLogs; e.pendantLogs = null; f(); }
    if (refuse(de, a)) throw new Error('HTTP 429 over rate limit');
    const cote = topics.length === 4 ? 'c1' : 'c0';
    return e.pools.filter((x) => x.bloc >= de && x.bloc <= a && x.cote === cote).map((x) => ({
      topics: [TOPIC, '0x' + 'ab'.repeat(32), '0x' + (cote === 'c0' ? JETON : AUTRE).slice(2).padStart(64, '0'), '0x' + (cote === 'c1' ? JETON : AUTRE).slice(2).padStart(64, '0')],
      data: '0x' + (500).toString(16).padStart(64, '0') + (10).toString(16).padStart(64, '0') + '0'.repeat(64),
      blockNumber: '0x' + x.bloc.toString(16) }));
  };
  const M = new Function('clesPool', 'rpcServeur', 'TOPIC_INITIALIZE', 'PM_V4',
    bloc + '\n; return { resoudreClePool, clesPoolAbsentes, clesPoolEnVol, CLES_POOL_ABSENTES_MAX };')(e.clesPool, rpc, TOPIC, PM);
  return { ...M, e };
}

await cas('A premiere absence : 40 fenetres x 2, du plus recent au plus ancien ; ok:false et son message inchanges', async () => {
  const { resoudreClePool, e, clesPoolAbsentes } = monter();
  const r = await resoudreClePool(JETON);
  assert.equal(r.ok, false); assert.equal(r.pourquoi, 'no Initialize found in the last 39960 blocks'); assert.equal(r.balaye, 39960);
  assert.equal(e.appels.length, 80);
  assert.deepEqual(e.appels[0], [1_000_000 - 998, 1_000_000], 'la premiere fenetre est la plus recente');
  assert.deepEqual(e.appels[79], [1_000_000 - 39960 + 1, 1_000_000 - 39 * 999], 'la derniere fenetre finit au meme bloc que l ancienne boucle');
  assert.deepEqual(clesPoolAbsentes.get(JETON), { depuis: 1_000_000 - 39960 + 1, jusqua: 1_000_000 });
});
await cas('B la suivante ne lit QUE les blocs nouveaux (1 500 blocs = 2 fenetres x 2), pas 80 getLogs', async () => {
  const { resoudreClePool, e } = monter();
  await resoudreClePool(JETON);
  e.appels.length = 0; e.tete += 1500;
  const r = await resoudreClePool(JETON);
  assert.equal(r.ok, false);
  assert.deepEqual(e.appels, [[1_000_000 + 1500 - 998, 1_001_500], [1_000_000 + 1500 - 998, 1_001_500], [1_000_001, 1_000_000 + 1500 - 999], [1_000_001, 1_000_000 + 1500 - 999]]);
  e.appels.length = 0;
  await resoudreClePool(JETON); /* tete inchangee : rien a lire */
  assert.equal(e.appels.length, 0);
});
await cas('C une pool NEE depuis la premiere lecture est trouvee (meme couverture) ; l absence est oubliee, la cle gardee', async () => {
  const { resoudreClePool, e, clesPoolAbsentes } = monter();
  await resoudreClePool(JETON);
  e.tete += 3000; e.pools.push({ bloc: 1_002_000, cote: 'c0' });
  const r = await resoudreClePool(JETON);
  assert.equal(r.ok, true); assert.equal(r.cles.length, 1); assert.equal(r.cles[0].bloc, 1_002_000); assert.equal(r.cles[0].tickSpacing, 10);
  assert.equal(clesPoolAbsentes.has(JETON), false); assert.ok(e.clesPool.has(JETON));
});
await cas('D douze requetes en meme temps : UN balayage (80 getLogs, pas 960)', async () => {
  const { resoudreClePool, e, clesPoolEnVol } = monter();
  const rs = await Promise.all(Array.from({ length: 12 }, () => resoudreClePool(JETON)));
  assert.ok(rs.every((r) => r.ok === false)); assert.equal(e.appels.length, 80); assert.equal(clesPoolEnVol.size, 0, 'une resolution finie reste en vol');
});
await cas('E un getLogs qui LEVE : la resolution leve, RIEN n est retenu, la suivante rebalaie tout', async () => {
  let couper = true;
  const { resoudreClePool, e, clesPoolAbsentes } = monter({ refuse: (de) => couper && de < 980_000 });
  await assert.rejects(resoudreClePool(JETON), /429/);
  assert.equal(clesPoolAbsentes.has(JETON), false, 'un echec reseau a ete retenu comme absence');
  couper = false; e.appels.length = 0;
  const r = await resoudreClePool(JETON);
  assert.equal(r.ok, false); assert.equal(e.appels.length, 80);
});
await cas('F 10 fenetres (clesRails) puis 40 (la route) : seule la partie PLUS PROFONDE manquante est lue', async () => {
  const { resoudreClePool, e, clesPoolAbsentes } = monter();
  await resoudreClePool(JETON, 10);
  assert.equal(e.appels.length, 20);
  e.appels.length = 0;
  const r = await resoudreClePool(JETON, 40);
  assert.equal(r.ok, false); assert.equal(e.appels.length, 60, 'les 30 fenetres manquantes x 2');
  assert.ok(e.appels.every(([de, a]) => a < 1_000_000 - 9990 + 1), 'une fenetre deja lue a ete relue');
  assert.deepEqual(clesPoolAbsentes.get(JETON), { depuis: 1_000_000 - 39960 + 1, jusqua: 1_000_000 });
});
await cas('F2 40 fenetres, puis 10, puis 40 : la couverture profonde DEJA lue n est jamais oubliee (zero getLogs a la 3e)', async () => {
  const { resoudreClePool, e, clesPoolAbsentes } = monter();
  await resoudreClePool(JETON, 40);
  await resoudreClePool(JETON, 10);
  e.appels.length = 0;
  await resoudreClePool(JETON, 40);
  assert.equal(e.appels.length, 0, 'la partie profonde lue a la 1re requete a ete relue');
  assert.equal(clesPoolAbsentes.get(JETON).depuis, 1_000_000 - 39960 + 1);
});
await cas('G2 la borne tient : 5 001 absences -> 5 000, la plus ancienne partie', async () => {
  const { resoudreClePool, clesPoolAbsentes, CLES_POOL_ABSENTES_MAX } = monter();
  const j = (k) => '0xb2' + String(k).padStart(38, '0');
  for (let k = 0; k <= CLES_POOL_ABSENTES_MAX; k++) await resoudreClePool(j(k), 1);
  assert.equal(clesPoolAbsentes.size, CLES_POOL_ABSENTES_MAX); assert.equal(clesPoolAbsentes.has(j(0)), false); assert.ok(clesPoolAbsentes.has(j(CLES_POOL_ABSENTES_MAX)));
});
await cas('G la carte des absences est BORNEE (le plus ancien part)', async () => {
  const { resoudreClePool, clesPoolAbsentes, CLES_POOL_ABSENTES_MAX } = monter();
  assert.equal(CLES_POOL_ABSENTES_MAX, 5000);
  const j = (k) => '0xb2' + String(k).padStart(38, '0');
  for (let k = 0; k < 3; k++) await resoudreClePool(j(k), 1);
  assert.deepEqual([...clesPoolAbsentes.keys()], [j(0), j(1), j(2)]);
  /* re-lire j(0) le remet en fin : c est j(1) qui partirait le premier */
  await resoudreClePool(j(0), 1);
  assert.deepEqual([...clesPoolAbsentes.keys()], [j(1), j(2), j(0)]);
});

/* ── revue adversariale (2026-10-10) : quatre constats confirmes, chacun garde ici ─────────────────────────────────────────── */
await cas('H HAUT : une memoire qui ne touche plus la fenetre est OUBLIEE — 80 getLogs une semaine plus tard (pas 606), et pas de pool hors fenetre', async () => {
  const { resoudreClePool, e, clesPoolAbsentes } = monter();
  await resoudreClePool(JETON);
  e.pools.push({ bloc: 1_100_000, cote: 'c0' }); /* nee APRES la premiere lecture, mais plus vieille que la fenetre de la seconde */
  e.tete += 302_400; e.appels.length = 0;
  const r = await resoudreClePool(JETON);
  assert.equal(r.ok, false, 'une pool plus ancienne que la fenetre demandee a ete rendue');
  assert.equal(e.appels.length, 80, 'l ecart entier a ete relu');
  const bas = e.tete - 39960 + 1;
  assert.ok(e.appels.every(([de]) => de >= bas), 'un bloc sous la fenetre demandee a ete lu');
  assert.deepEqual(clesPoolAbsentes.get(JETON), { depuis: bas, jusqua: e.tete }, 'la memoire a ete fusionnee par-dessus un ecart jamais lu');
});
await cas('I MOYEN : une tete illisible (null, "0x") fait LEVER — aucune absence inventee sans lecture', async () => {
  for (const brute of [null, '0x', 'zz']) {
    const { resoudreClePool, e, clesPoolAbsentes } = monter();
    e.teteBrute = brute;
    await assert.rejects(resoudreClePool(JETON), /chain head not read/);
    assert.equal(clesPoolAbsentes.has(JETON), false); assert.equal(e.appels.length, 0);
  }
});
await cas('J BAS : une tete a 0 (noeud en synchro) avec une memoire : leve, et ne balaie pas l historique', async () => {
  const { resoudreClePool, e } = monter();
  await resoudreClePool(JETON);
  e.teteBrute = '0x0'; e.appels.length = 0;
  await assert.rejects(resoudreClePool(JETON), /chain head not read/);
  assert.equal(e.appels.length, 0);
});
await cas('J2 BAS : une tete qui RECULE (noeud en retard, > 0) : la partie profonde est plafonnee a la tete, rien au-dessus n est lu', async () => {
  const { resoudreClePool, e } = monter();
  await resoudreClePool(JETON, 10); /* memoire { 990 011, 1 000 000 } */
  e.tete = 980_000; e.appels.length = 0; /* recul de 20 000 blocs : la tete passe SOUS le bas de la memoire */
  const r = await resoudreClePool(JETON, 40);
  assert.equal(r.ok, false);
  assert.ok(e.appels.length > 0 && e.appels.every(([, a]) => a <= 980_000), 'un bloc au-dessus de la tete lue a ete demande : ' + JSON.stringify(e.appels.slice(0, 2)));
  assert.ok(e.appels.length <= 80, 'plus de fenetres que demande : ' + e.appels.length);
});
await cas('K BAS : une autre resolution ecrit PENDANT le balayage — l union des deux plages lues est gardee (la couverture profonde ne se perd pas)', async () => {
  const { resoudreClePool, e, clesPoolAbsentes } = monter();
  /* pendant le balayage a 10 fenetres, une resolution a 40 (meme tete) termine et ecrit sa plage */
  e.pendantLogs = () => { clesPoolAbsentes.set(JETON, { depuis: 1_000_000 - 39960 + 1, jusqua: 1_000_000 }); };
  await resoudreClePool(JETON, 10);
  assert.deepEqual(clesPoolAbsentes.get(JETON), { depuis: 1_000_000 - 39960 + 1, jusqua: 1_000_000 }, 'la plage profonde lue par l autre a ete ecrasee');
  /* temoin : deux plages qui ne se touchent PAS ne sont jamais fusionnees */
  const b = monter();
  b.e.pendantLogs = () => { b.clesPoolAbsentes.set(JETON, { depuis: 100, jusqua: 200 }); };
  await b.resoudreClePool(JETON, 10);
  assert.deepEqual(b.clesPoolAbsentes.get(JETON), { depuis: 1_000_000 - 9990 + 1, jusqua: 1_000_000 });
});

console.log('✓ ' + n + ' cas — une absence lue d Initialize se retient ; la suivante ne lit que les blocs nouveaux, et une pool nee depuis est trouvee');
