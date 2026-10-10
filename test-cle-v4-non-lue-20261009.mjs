/* test-cle-v4-non-lue-20261009.mjs — UNE CLE V4 NON LUE N EST PAS UNE CLE ABSENTE.
 *
 * Contexte (audit en lecture du 2026-10-09, budget du noeud d archive epuise) : `cleV4DuPoolId` (serveur-web.js) balaie 59 fenetres
 * de 2 000 blocs a la recherche de l evenement `Initialize` du poolId. Une fenetre REFUSEE (catch) et une fenetre VIDE faisaient
 * toutes deux `continue`, et toutes deux finissaient en `return null` — et `faitsPoolV4` publiait alors « the Initialize event for
 * this poolId was not found in the window read » : une absence affirmee sur des fenetres jamais lues. Les fenetres profondes
 * (au-dela de ~9 000 blocs) n ont que l archive pour les servir (publicnode 403, repli-logs.js) ; budget epuise, elles sont refusees.
 * Les gardes, EXECUTEES sur les fonctions extraites du fichier livre (faux rpc, aucun reseau) :
 *   A. cleV4DuPoolId : tout LU et vide -> null (absente) ; au moins une fenetre refusee et pas de cle -> { etat: 'NON_LUE' } compte ;
 *      une reponse qui n est pas un tableau est un refus ; la tete illisible -> NON_LUE ; une cle trouvee apres des refus -> la cle ;
 *      un NON_LUE n est JAMAIS mis en cache (il se relit au prochain appel).
 *   B. faitsPoolV4 (son seul appelant) : NON_LUE -> cleV4 null + cleNonLue + une raison qui ne dit PAS « not found » ; le glissement
 *      lu reste publie (pas de fermeture sur une lecture ratee) ; une exception n est pas une absence non plus.
 *   C. (LU dans le source, PAS execute) /api/prix-usd : la reponse mise en cache EST celle de faitsPoolV4 (le libelle « non lue »
 *      y voyage), et cleV4DuPoolId n a qu UN appelant — un nouvel appelant fait rougir C2 et doit traiter NON_LUE.
 * ⛔ BORNE : le vrai noeud (base.org / publicnode / CDP) n est pas exerce ici ; les messages d erreur sont ceux qu avecRepliLogs
 *   relance (celui du PRINCIPAL, repli-logs.js), pas ceux du budget. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { decoderInitialize } from './pools-du-jeton.js';
import { LOGS_INITIALIZE_MESURES } from './cles-v4-mesurees.js';
import { glissementBps, TAILLE_REFERENCE_USDC } from './porte-achat.js';
/* 2026-10-11 : cleV4DuPoolId consulte clesPool par cleV4Connue avant de balayer ; clesPool VIDE ici : les cas restent ceux d avant */
import { cleV4Connue } from './cle-v4-connue.js';

const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
const extraire = (entete) => {
  const i = src.indexOf(entete);
  assert.ok(i > 0, entete + ' introuvable');
  const fin = /\r?\n\}\r?\n/.exec(src.slice(i));
  assert.ok(fin, 'fin de ' + entete + ' introuvable');
  return src.slice(i, i + fin.index + fin[0].length);
};
let n = 0; const rouges = [];
const cas = async (titre, f) => { n++; try { await f(); } catch (e) { rouges.push(titre); console.error('✗ ' + titre + '\n    ' + String(e && e.message || e).split('\n')[0]); } };

const PM_V4 = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const TOPIC_INITIALIZE = '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438';
const LOG_OUSD = LOGS_INITIALIZE_MESURES[0];
const ID_OUSD = String(LOG_OUSD.topics[1]).toLowerCase();
const TETE = 52_400_000;
/* ⛔ le message que rpcServeur relance quand base.org (429), publicnode (403) ET l archive (budget) refusent : celui du PRINCIPAL */
const REFUS = 'request limit reached';

/* ── A. cleV4DuPoolId, extraite telle que livree ───────────────────────────────────────────────────────── */
const corpsCle = extraire('async function cleV4DuPoolId(id) {');
/* lecteurLogs (serveur-web.js) quand RPC_ARCHIVE est absent : tout passe par rpcServeur, archiveEpuisee() est faux, rien n attend */
const lecteurLogsSansArchive = (rpc) => () => ({
  /* comme le vrai : seule une liste est une reponse d eth_getLogs ; sans archive, rien n est jamais « non envoye » */
  rpc: async (m, p) => { const r = await rpc(m, p); if (m === 'eth_getLogs' && !Array.isArray(r)) throw new Error('not a list'); return r; },
  nonEnvoyee: () => false, suivi: { nonEnvoyees: 0, essais: 0 } });
function monterCle({ prefill = [], tete = () => '0x' + TETE.toString(16), fenetre, clesV4Absentes = new Map(), apresAbsencesV4 = () => {} }) {
  const clesV4Lues = new Map(prefill);
  const journal = { blockNumber: 0, getLogs: 0 };
  const rpcServeur = async (methode, params) => {
    if (methode === 'eth_blockNumber') { journal.blockNumber++; return tete(); }
    assert.equal(methode, 'eth_getLogs');
    journal.getLogs++;
    const q = params[0];
    assert.equal(q.address, PM_V4); assert.equal(q.topics[0], TOPIC_INITIALIZE);
    const de = parseInt(q.fromBlock, 16), a = parseInt(q.toBlock, 16);
    return fenetre({ de, a, profondeur: TETE - de, id: q.topics[1] });
  };
  /* 2026-10-10 : la fonction retient aussi les absences LUES (clesV4Absentes, bornee) et declenche leur persistance (doublure) */
  /* 2026-10-10 (refus certain) : elle lit ses fenetres par lecteurLogs(tete) — doublure = le helper SANS archive (budget jamais
   *   epuise) : toute fenetre va au faux noeud du banc, comme avant. Le routage reel est juge par test-refus-certain-20261010.mjs. */
  const f = new Function('clesV4Lues', 'rpcServeur', 'PM_V4', 'TOPIC_INITIALIZE', 'decoderInitialize', 'clesV4Absentes', 'CLES_V4_ABSENTES_MAX', 'apresAbsencesV4', 'lecteurLogs', 'cleV4Connue', 'clesPool',
    corpsCle + '\n; return cleV4DuPoolId;')(clesV4Lues, rpcServeur, PM_V4, TOPIC_INITIALIZE, decoderInitialize, clesV4Absentes, 5000, apresAbsencesV4, lecteurLogsSansArchive(rpcServeur), cleV4Connue, new Map());
  return { f, clesV4Lues, journal, clesV4Absentes };
}
const estNonLue = (r) => Boolean(r && typeof r === 'object' && r.etat === 'NON_LUE');

await cas('A1 toutes les fenetres LUES et vides : null (absente), 59 fenetres lues, rien en cache', async () => {
  const { f, clesV4Lues, journal } = monterCle({ fenetre: () => [] });
  assert.equal(await f(ID_OUSD), null);
  assert.equal(journal.blockNumber, 1); assert.equal(journal.getLogs, 59);
  assert.equal(clesV4Lues.size, 0);
});
await cas('A2 UNE fenetre refusee, les autres vides : NON_LUE (1/59), PAS null — et pas en cache', async () => {
  const { f, clesV4Lues } = monterCle({ fenetre: ({ profondeur }) => { if (profondeur === 60_000) throw new Error(REFUS); return []; } });
  const r = await f(ID_OUSD);
  assert.notEqual(r, null, 'une fenetre refusee a ete lue comme vide : « pas de pool » sur un balayage incomplet');
  assert.ok(estNonLue(r), 'etat NON_LUE attendu, rendu : ' + JSON.stringify(r));
  assert.equal(r.ratees, 1); assert.equal(r.fenetres, 59);
  assert.equal(clesV4Lues.size, 0, 'un NON_LUE grave dans clesV4Lues figerait une cecite');
});
await cas('A3 budget d archive epuise : les 55 fenetres au-dela de 9 000 blocs refusees -> NON_LUE 55/59 ; relu au prochain appel', async () => {
  const { f, journal } = monterCle({ fenetre: ({ profondeur }) => { if (profondeur > 9000) throw new Error(REFUS); return []; } });
  const r = await f(ID_OUSD);
  assert.ok(estNonLue(r), 'etat NON_LUE attendu, rendu : ' + JSON.stringify(r));
  assert.equal(r.ratees, 55); assert.equal(r.fenetres, 59);
  assert.match(String(r.pourquoi), /55\/59/);
  const r2 = await f(ID_OUSD);
  assert.ok(estNonLue(r2));
  assert.equal(journal.getLogs, 118, 'le second appel doit RELIRE les 59 fenetres (rien de cache sur un echec)');
});
await cas('A4 une reponse qui n est pas un tableau (null) est un REFUS, pas une fenetre vide', async () => {
  const { f } = monterCle({ fenetre: ({ profondeur }) => (profondeur === 20_000 ? null : []) });
  const r = await f(ID_OUSD);
  assert.ok(estNonLue(r), 'etat NON_LUE attendu, rendu : ' + JSON.stringify(r));
  assert.equal(r.ratees, 1);
});
await cas('A5 la tete illisible (eth_blockNumber refuse) : NON_LUE, aucune fenetre lue — pas « absente »', async () => {
  const { f, journal } = monterCle({ tete: () => { throw new Error(REFUS); }, fenetre: () => [] });
  const r = await f(ID_OUSD);
  assert.ok(estNonLue(r), 'etat NON_LUE attendu, rendu : ' + JSON.stringify(r));
  assert.equal(r.fenetres, 0); assert.equal(journal.getLogs, 0);
});
await cas('A6 la tete rendue n est pas un nombre : NON_LUE', async () => {
  const { f } = monterCle({ tete: () => '0xzz', fenetre: () => [] });
  assert.ok(estNonLue(await f(ID_OUSD)));
});
await cas('A7 des fenetres refusees PUIS la cle trouvee plus loin : la cle (lue, decodee, recalculee) et mise en cache', async () => {
  const { f, clesV4Lues, journal } = monterCle({ fenetre: ({ profondeur, id }) => {
    if (profondeur <= 8000) throw new Error(REFUS);
    return profondeur === 60_000 && id === ID_OUSD ? [LOG_OUSD] : [];
  } });
  const r = await f(ID_OUSD);
  const attendu = decoderInitialize(LOG_OUSD).cle;
  assert.deepEqual(r, attendu);
  assert.deepEqual(clesV4Lues.get(ID_OUSD), attendu);
  const avant = journal.getLogs;
  assert.deepEqual(await f(ID_OUSD), attendu);
  assert.equal(journal.getLogs, avant, 'une cle lue ne se relit pas');
});
await cas('A8 une cle pre-remplie (mesuree) : rendue sans aucun appel', async () => {
  const cle = decoderInitialize(LOG_OUSD).cle;
  const { f, journal } = monterCle({ prefill: [[ID_OUSD, cle]], fenetre: () => { throw new Error('ne doit pas lire'); } });
  assert.deepEqual(await f(ID_OUSD.toUpperCase().replace('0X', '0x')), cle);
  assert.equal(journal.blockNumber + journal.getLogs, 0);
});

/* ── B. faitsPoolV4, extraite telle que livree, sur des lectures de pool simulees ─────────────────────── */
const corpsFaits = extraire('async function faitsPoolV4(poolId, infos) {');
const USDC_SRV = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const AUTRE = '0xb2000000000000000000002feb517dfec7415344';
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
function monterFaits(cleV4DuPoolId) {
  const callLarge = async (to, data) => (String(data).startsWith('SLOT0')
    ? '0x' + mot(2n ** 96n) + mot(0) + mot(0) + mot(0) : '0x' + (10n ** 15n).toString(16));
  return new Function('enFile', 'callLarge', 'STATE_VIEW_SRV', 'SEL_GET_SLOT0', 'SEL_GET_LIQUIDITE', 'NON_MESURE_POOL', 'USDC_SRV',
    'glissementBps', 'TAILLE_REFERENCE_USDC', 'cleV4DuPoolId', 'setTimeout', corpsFaits + '\n; return faitsPoolV4;')(
    (t) => t(), callLarge, '0xstateview', 'SLOT0', 'LIQ', Object.freeze({ glissementBps: null, famille: 'NON_MESURE' }), USDC_SRV,
    glissementBps, TAILLE_REFERENCE_USDC, cleV4DuPoolId, (ok) => ok());
}
const INFOS = { base: AUTRE, quote: USDC_SRV };

await cas('B1 cle NON_LUE : cleV4 null + cleNonLue, raison « not read » avec ses comptes, JAMAIS « not found » ; glissement garde', async () => {
  const f = await monterFaits(async () => ({ etat: 'NON_LUE', ratees: 55, fenetres: 59, pourquoi: '55/59 windows of 2000 blocks not read' }))(ID_OUSD, INFOS);
  assert.equal(f.cleV4, null, 'l objet NON_LUE a ete publie comme une cle');
  assert.equal(f.cleNonLue, true);
  assert.doesNotMatch(String(f.pourquoiCle), /not found/i, 'un NON_LUE publie comme une absence');
  assert.match(String(f.pourquoiCle), /not read/i); assert.match(String(f.pourquoiCle), /55\/59/);
  assert.equal(typeof f.glissementBps, 'number', 'le glissement LU doit rester publie');
  assert.equal(f.famille, 'uniswap-v4');
});
await cas('B2 cle ABSENTE (null, tout lu) : la phrase d avant, sans cleNonLue', async () => {
  const f = await monterFaits(async () => null)(ID_OUSD, INFOS);
  assert.equal(f.cleV4, null); assert.equal(f.cleNonLue, undefined);
  assert.match(String(f.pourquoiCle), /was not found in the window read/);
});
await cas('B3 cle LUE : publiee telle quelle, sans raison', async () => {
  const cle = decoderInitialize(LOG_OUSD).cle;
  const f = await monterFaits(async () => cle)(ID_OUSD, INFOS);
  assert.deepEqual(f.cleV4, cle); assert.equal(f.pourquoiCle, undefined); assert.equal(f.cleNonLue, undefined);
});
await cas('B4 la recherche de cle JETTE : non lue, pas « not found »', async () => {
  const f = await monterFaits(async () => { throw new Error('boom'); })(ID_OUSD, INFOS);
  assert.equal(f.cleV4, null); assert.equal(f.cleNonLue, true);
  assert.doesNotMatch(String(f.pourquoiCle), /not found/i);
});
await cas('B5 de bout en bout (vraie cleV4DuPoolId extraite, budget epuise) : glissement publie, cle NON LUE, pas « not found »', async () => {
  const { f: cle } = monterCle({ fenetre: ({ profondeur }) => { if (profondeur > 9000) throw new Error(REFUS); return []; } });
  const f = await monterFaits(cle)(ID_OUSD, INFOS);
  assert.equal(typeof f.glissementBps, 'number');
  assert.equal(f.cleV4, null); assert.equal(f.cleNonLue, true);
  assert.doesNotMatch(String(f.pourquoiCle), /not found/i);
  assert.match(String(f.pourquoiCle), /55\/59 windows of 2000 blocks not read/, 'le compte des fenetres non lues doit arriver jusqu a la phrase publiee');
});

/* ── C. l appelant HTTP, et l unicite de l appelant ───────────────────────────────────────────────────── */
await cas('C1 /api/prix-usd met en cache la reponse de faitsPoolV4 telle quelle (le libelle « non lue » y voyage)', async () => {
  assert.match(nu, /const complet = \{ \.\.\.r, \.\.\.f, \.\.\.\(alt \? \{ alternativeAerodrome: alt \} : \{\}\) \};/);
  assert.match(nu, /if \(typeof f\.glissementBps === 'number'\) \{\s+prixUsdCache\.set\(adr, \{ t: Date\.now\(\), r: complet \}\);/);
});
await cas('C2 cleV4DuPoolId n a qu UN appelant (faitsPoolV4) : un nouvel appelant devra traiter NON_LUE', async () => {
  assert.equal((nu.match(/cleV4DuPoolId\(/g) || []).length, 2, 'definition + un appel attendus');
  assert.match(nu, /cleV4 = await cleV4DuPoolId\(id\);/);
});

/* ── D. l ecran (app.html) : le drapeau arrive jusqu au classement (revue adversariale du 2026-10-09) ─────────────────────
 * Le serveur publiait `cleNonLue`, l ecran le jetait : ses faits de pool etant lus, `faitsLus` valait VRAI, aucune arete v4
 * sans cle, et classerDevise concluait SANS_ROUTE — « no route » sur une cle jamais lue. */
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const { classerDevise } = await import(new URL('./devises-dentree.js', import.meta.url).href);
await cas('D1 app.html garde cleNonLue dans faitsPoolLus, et faitsLus le compte', async () => {
  assert.match(html, /cleNonLue: d && d\.cleNonLue === true,/);
  assert.match(html, /faitsLus: faitsPoolLus\.has\(String\(p\.adr\)\.toLowerCase\(\)\) && faitsPoolLus\.get\(String\(p\.adr\)\.toLowerCase\(\)\)\.cleNonLue !== true,/);
});
await cas('D2 EXECUTE : faits lus SANS la cle -> NON_MESUREE (« not checked »), jamais SANS_ROUTE (« no route »)', async () => {
  const DEV = '0x' + '1'.repeat(40), BLOCK = '0xb2' + '0'.repeat(38);
  /* la meme expression que app.html, sur une entree de faitsPoolLus telle que le serveur la rend pour une cle non lue */
  const faitsPoolLus = new Map([[DEV, { glissementBps: 12, famille: 'uniswap-v4', cleV4: null, cleNonLue: true }]]);
  const faitsLus = faitsPoolLus.has(DEV) && faitsPoolLus.get(DEV).cleNonLue !== true;
  assert.equal(classerDevise({ devise: DEV, block: BLOCK, aretes: [], faitsLus }).etat, 'NON_MESUREE');
  /* temoin : la cle LUE et absente (pas de drapeau) reste une route absente mesuree */
  const lue = new Map([[DEV, { glissementBps: 12, famille: 'uniswap-v4', cleV4: null, cleNonLue: false }]]);
  assert.equal(classerDevise({ devise: DEV, block: BLOCK, aretes: [], faitsLus: lue.has(DEV) && lue.get(DEV).cleNonLue !== true }).etat, 'SANS_ROUTE');
});

if (rouges.length) { console.error('✗ ' + rouges.length + '/' + n + ' cas rouges'); process.exit(1); }
console.log('✓ ' + n + ' cas — une cle v4 non lue n est plus publiee comme absente ; le glissement lu reste publie');
