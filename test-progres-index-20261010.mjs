/* test-progres-index-20261010.mjs — L AVANCEMENT DES DEUX INDEX (/api/nos-blocks, /api/blocks-routeur) SURVIT AU REDEPLOIEMENT.
 *
 * Mesure prod (2026-10-10) : /api/nos-blocks jusqua = 52109849 et /api/blocks-routeur jusqua = 52095000, les memes valeurs que la
 *   veille au soir (~300 000 blocs sous la tete, couvertureComplete faux) ; journal au demarrage : « graine recue … graine admise ».
 *   L avancement vivait en MEMOIRE : chaque deploiement repartait de la graine, et le rattrapage (archive) recommencait.
 * Ce banc EXECUTE le code livre (serveur-web.js, de `const PAS_ROUTEUR = 2000;` a la section suivante) contre une fausse chaine
 *   et un faux disque :
 *   S  pas de fichier (ou pas de volume) : la graine exactement comme avant (re-verification par recus, lecture depuis jusqua+1) ;
 *   W  apres une avancee, le fichier est ecrit (atomique), et re-ecrit a l avancee suivante ;
 *   R  au redemarrage il est relu : plage et blocks repris, graine NON re-verifiee (0 recu), lecture depuis jusqua+1 du fichier ;
 *   M  un fichier abime (json, version, adresse, comptes, plancher, sel, routeur, ...) n adopte RIEN de sa section ;
 *   C  jamais plus que lu : graine absente de la plage, pas mieux que la graine, fenetre refusee (le curseur ecrit = celui de la
 *      memoire, jamais la tete), teteAtteinte jamais relu (complet seulement apres une lecture propre jusqu a la tete) ;
 *   E  mode essai : ni ecrit ni relu ; F  trop gros : rien n est ecrit (jamais un ensemble coupe) ; F2 ni relu ;
 *   T  (revue adverse du 2026-10-10, contre-exemple jusqua = tete + 10 000 000 adopte et dit complet) : une reprise n est acquise
 *      qu une fois confrontee a une tete LUE dans ce processus — au-dessus de la tete de plus de RETARD_MAX_INDEX : abandonnee
 *      (etat de depart exact) ; un peu au-dessus : attente, ni lu ni complet ; W3/W4/R3 : les trous r1-r7 de la meme revue ;
 *      T5/T6 (seconde revue) : la borne est la plus BASSE tete lue par l une ou l autre boucle, et une reprise lance le tour de fond.
 *   Puis chaque MUTANT du code de persistance DOIT rougir (temoin : le code livre est vert).
 * ⛔ BORNE : ni le vrai volume Railway ni la vraie chaine ne sont exerces ; la prod le dira dans `reprise` de chaque reponse.
 * ⛔ PORTABLE LF/CRLF : motifs de mutants sur une ligne. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as IR from './index-routeur.js';
import * as O from './origine.js';
import { FEE_WALLET, CREATE_ROUTER } from './frais-creation.js';
import { prochaineFenetre } from './fenetre-scan.js';
import { frappesVers } from './mes-blocks.js';

const SRC = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const FICHIER = '/data/progres-index.json';
const TOPIC_TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const mot = (a) => '0x' + '0'.repeat(24) + String(a).toLowerCase().slice(2);
const A6CF = FEE_WALLET.toLowerCase();
const AUTRE = '0x1111111111111111111111111111111111111111';
const PLANCHER = 50861088, GJ = O.GRAINE_NOS_JUSQUA, GJR = IR.GRAINE_JUSQUA, PR = IR.PLANCHER_ROUTEUR;
const NOUVEAU = '0xb200000000000000000000c0ffee00000000beef'; /* frappe vers a6cf APRES la graine */
const VIEUX = '0xb200000000000000000000feed000000000000f3'; /* frappe vers a6cf DANS une fenetre refusee */
const SEL = '0x' + 'ab'.repeat(32), NE = IR.adresseNeeDuRouteur(SEL), TX_NE = '0x' + 'cd'.repeat(32); /* ne du routeur apres GRAINE_JUSQUA */
/* blocks que SEUL un fichier dit : absents de la fausse chaine (un abandon de reprise doit les jeter) */
const FANTOME = '0xb2' + '0'.repeat(32) + 'fa4e00';
const SEL2 = '0x' + 'ef'.repeat(32), NE2 = IR.adresseNeeDuRouteur(SEL2), TX_NE2 = '0x' + '77'.repeat(32);
const RMI = IR.RETARD_MAX_INDEX;
const laisser = async () => { for (let k = 0; k < 6; k++) await new Promise((r) => setImmediate(r)); };

/* fausse chaine : tete, frappes vers a6cf, naissances du routeur ; refus de getLogs a la demande ; compte ce qui est lu */
function chaine(o = {}) {
  const e = { tete: o.tete ?? GJ + 6000, frappes: [[NOUVEAU, GJ + 100], ...(o.frappes || [])], nes: [{ jeton: NE, sel: SEL, bloc: GJR + 500, tx: TX_NE }],
    refuseFrappes: o.refuseFrappes || (() => false), refuseRouteur: o.refuseRouteur || (() => false), fenetresFrappes: [], fenetresRouteur: [], recus: 0 };
  e.rpc = async (m, p) => {
    if (m === 'eth_blockNumber') return '0x' + e.tete.toString(16);
    if (m === 'eth_getLogs') {
      const q = p[0] || {}; const de = parseInt(q.fromBlock, 16), a = parseInt(q.toBlock, 16); const t = q.topics || [];
      if (t[0] === TOPIC_TRANSFER) {
        e.fenetresFrappes.push([de, a]);
        if (e.refuseFrappes(de, a)) throw new Error('HTTP 429 over rate limit');
        if (String(t[2]).toLowerCase() !== mot(A6CF)) return [];
        return e.frappes.filter(([, b]) => de <= b && b <= a).map(([adr, b]) => ({ address: adr, topics: [TOPIC_TRANSFER, t[1], t[2]], data: '0x',
          blockNumber: '0x' + b.toString(16), transactionHash: '0x' + 'ee'.repeat(32) }));
      }
      if (String(q.address).toLowerCase() === IR.FACTORY_B20) {
        e.fenetresRouteur.push([de, a]);
        if (e.refuseRouteur(de, a)) throw new Error('HTTP 429 over rate limit');
        return e.nes.filter((n) => de <= n.bloc && n.bloc <= a).map((n) => ({ address: IR.FACTORY_B20, topics: [IR.TOPIC_B20_CREATED, mot(n.jeton)],
          blockNumber: '0x' + n.bloc.toString(16), transactionHash: n.tx }));
      }
      return [];
    }
    if (m === 'eth_getTransactionByHash') {
      const n = e.nes.find((x) => x.tx === p[0]);
      return n ? { to: CREATE_ROUTER, input: IR.SELECTEUR_CREATE_PAID + '0'.repeat(64) + n.sel.slice(2) + '0'.repeat(64) } : null;
    }
    if (m === 'eth_getTransactionReceipt') {
      e.recus += 1;
      const g = O.GRAINE_NOS_BLOCKS.find((x) => x.tx === String(p[0]).toLowerCase());
      return g ? { status: '0x1', blockNumber: '0x' + g.bloc.toString(16), logs: [{ address: g.jeton, topics: [TOPIC_TRANSFER, mot('0x' + '0'.repeat(40)), mot(g.compte)] }] } : null;
    }
    if (m === 'eth_getCode') return e.frappes.some(([adr]) => adr === String(p[0]).toLowerCase()) ? '0xef0100' + 'ab'.repeat(20) : '0x';
    throw new Error('methode non simulee : ' + m);
  };
  return e;
}

/* le code LIVRE, monte dans un « processus » neuf : faux disque partage entre redemarrages, minuteurs sans delai, boucles de fond
 *   muettes (le banc appelle etendre* lui-meme : il sait ce qui a ete lu, et quand) */
function monter(source, { disque = new Map(), c = chaine(), volume = true, essai = false, env = {} } = {}) {
  const i = source.indexOf('const PAS_ROUTEUR = 2000;'); const f = source.indexOf('/* ══ QUI DETIENT UN BLOCK', i);
  if (!(i > 0 && f > i)) throw new Error('bloc des deux index introuvable');
  const journal = [], ops = [], fonds = [], intervalles = [];
  /* 2026-10-10 (refus certain) : les deux boucles lisent leurs fenetres par lecteurLogs(tete) et lisent archiveEpuisee() — doublures =
   *   le helper SANS archive (budget jamais epuise) : tout va a la fausse chaine, comme avant. Le routage reel, le refus sans envoi et
   *   le rythme : test-refus-certain-20261010.mjs. */
  const lecteurLogs = () => ({
    /* comme le vrai : seule une liste est une reponse d eth_getLogs ; sans archive, rien n est jamais « non envoye » */
    rpc: async (m, p) => { const r = await c.rpc(m, p); if (m === 'eth_getLogs' && !Array.isArray(r)) throw new Error('not a list'); return r; },
    nonEnvoyee: () => false, suivi: { nonEnvoyees: 0, essais: 0 } });
  const M = new Function('rpcServeur', 'scannerNesDuRouteur', 'GRAINE_ROUTEUR', 'GRAINE_JUSQUA', 'PLANCHER_ROUTEUR', 'RETARD_MAX_INDEX', 'neDuRouteur',
    'ROUTEURS_ANCIENS', 'consommateurArchive', 'FEE_WALLET', 'CREATE_ROUTER', 'process', 'console', 'graineNosBlocksAdmise', 'verifierGraineNos',
    'NOS_BLOCKS_GENESE', 'GRAINE_NOS_BLOCKS', 'prochaineFenetre', 'frappesVers', 'setTimeout', 'setInterval', 'ESSAI_SRV',
    'existsSync', 'join', 'readFileSync', 'writeFileSync', 'renameSync', 'lecteurLogs', 'archiveEpuisee',
    source.slice(i, f) + '\n; return { routeurEtat, nosBlocksEtat, etendreNosBlocks, etendreBlocksRouteur, nosBlocksCorps, blocksRouteurCorps, nosBlocksComplet };')(
    c.rpc, IR.scannerNesDuRouteur, IR.GRAINE_ROUTEUR, IR.GRAINE_JUSQUA, IR.PLANCHER_ROUTEUR, IR.RETARD_MAX_INDEX, IR.neDuRouteur, IR.ROUTEURS_ANCIENS,
    { run: (l, fn) => { fonds.push(String(l)); return String(l).startsWith('fond') ? new Promise(() => {}) : fn(); } }, FEE_WALLET, CREATE_ROUTER, { env: { TB_NOS_CREATEURS: '', ...env } },
    { log: (...a) => journal.push(a.join(' ')), warn: (...a) => journal.push(a.join(' ')), error: (...a) => journal.push(a.join(' ')) },
    O.graineNosBlocksAdmise, O.verifierGraineNos, O.NOS_BLOCKS_GENESE, O.GRAINE_NOS_BLOCKS, prochaineFenetre, frappesVers,
    (fn) => { setImmediate(fn); return { unref() {} }; }, (fn) => { intervalles.push(fn); return { unref() {} }; }, { actif: essai },
    (p) => (p === '/data' ? volume : disque.has(p)), (...x) => x.join('/'),
    (p) => { if (!disque.has(p)) throw Object.assign(new Error('ENOENT ' + p), { code: 'ENOENT' }); return disque.get(p); },
    (p, v) => { ops.push(['ecrit', p]); disque.set(p, String(v)); },
    (a, b) => { if (!disque.has(a)) throw Object.assign(new Error('ENOENT ' + a), { code: 'ENOENT' }); ops.push(['renomme', a, b]); disque.set(b, disque.get(a)); disque.delete(a); },
    lecteurLogs, () => false);
  return { ...M, c, disque, journal, ops, fonds, intervalles };
}
const lu = (disque) => (disque.has(FICHIER) ? JSON.parse(disque.get(FICHIER)) : null);
const bonNos = (o = {}) => ({ comptes: [A6CF], plancher: PLANCHER, depuis: PLANCHER, jusqua: GJ + 4000,
  blocks: [...O.NOS_BLOCKS_GENESE, ...O.GRAINE_NOS_BLOCKS.map((g) => g.jeton), NOUVEAU], ...o });
const bonRouteur = (o = {}) => ({ routeur: CREATE_ROUTER.toLowerCase(), plancher: PR, depuis: PR, jusqua: GJR + 4000,
  blocks: [...IR.GRAINE_ROUTEUR.map((g) => ({ ...g })), { jeton: NE, sel: SEL, bloc: GJR + 500, tx: TX_NE }], ...o });
const fichier = (o = {}) => new Map([[FICHIER, typeof o === 'string' ? o : JSON.stringify({ ver: 1, nos: bonNos(), routeur: bonRouteur(), ...o })]]);
/* l etat « graine, comme avant » de chaque section (`?? null` : le code d avant ce correctif n a pas de champ `reprise` — ces gardes
 *   doivent tenir sur lui aussi, seuls les cas de persistance rougissent avant le correctif) */
const nosSurGraine = (m) => m.nosBlocksEtat.depuis === null && m.nosBlocksEtat.jusqua === null && m.nosBlocksEtat.graine === 'A_VERIFIER'
  && (m.nosBlocksEtat.reprise ?? null) === null && m.nosBlocksEtat.blocks.size === O.NOS_BLOCKS_GENESE.length && m.nosBlocksEtat.teteAtteinte === false;
const routeurSurGraine = (m) => m.routeurEtat.depuis === PR && m.routeurEtat.jusqua === GJR && (m.routeurEtat.reprise ?? null) === null
  && m.routeurEtat.blocks.size === IR.GRAINE_ROUTEUR.length;

async function suite(source) {
  const res = [];
  const cas = async (id, f) => { try { await f(); res.push({ id, ok: true }); } catch (e) { res.push({ id, ok: false, err: String(e && e.message || e).slice(0, 300) }); } };

  await cas('S1 pas de fichier : la graine comme avant (2 recus relus, lecture depuis jusqua+1 de la graine, couverture complete)', async () => {
    const m = monter(source);
    assert.ok(nosSurGraine(m), 'nos-blocks ne part pas de la graine'); assert.ok(routeurSurGraine(m), 'le routeur ne part pas de la graine');
    assert.ok(!m.journal.some((l) => /avancement (relu|du volume)/.test(l)), 'une reprise a ete annoncee sans fichier');
    await m.etendreNosBlocks();
    assert.equal(m.c.recus, O.GRAINE_NOS_BLOCKS.length, 'la graine n a pas ete re-verifiee sur la chaine');
    assert.equal(m.nosBlocksEtat.graine, 'ADMISE');
    assert.equal(Math.min(...m.c.fenetresFrappes.map((w) => w[0])), GJ + 1, 'un bloc sous la graine a ete relu');
    assert.equal(m.nosBlocksEtat.jusqua, m.c.tete); assert.ok(m.nosBlocksComplet());
    await m.etendreBlocksRouteur();
    assert.equal(Math.min(...m.c.fenetresRouteur.map((w) => w[0])), GJR + 1); assert.equal(m.routeurEtat.jusqua, GJR + 2000);
  });
  await cas('S2 pas de volume : rien n est ecrit ni relu, meme apres des avancees', async () => {
    const disque = fichier();
    const m = monter(source, { disque, volume: false });
    assert.ok(nosSurGraine(m) && routeurSurGraine(m), 'un fichier a ete relu sans volume');
    await m.etendreNosBlocks(); await m.etendreBlocksRouteur(); await laisser();
    assert.equal(m.ops.length, 0, 'ecrit sans volume : ' + JSON.stringify(m.ops));
  });

  await cas('W1 apres une avancee, le fichier est ecrit (atomique : .tmp puis rename) avec la plage PROUVEE et tous les blocks', async () => {
    const m = monter(source);
    await m.etendreNosBlocks(); await m.etendreBlocksRouteur(); await laisser();
    const x = lu(m.disque);
    assert.ok(x, 'rien n a ete ecrit sur le volume');
    assert.ok(!m.disque.has(FICHIER + '.tmp'), 'un .tmp est reste');
    assert.ok(m.ops.length > 0 && m.ops.every((o) => (o[0] === 'ecrit' ? o[1] === FICHIER + '.tmp' : o[2] === FICHIER)), 'ecriture non atomique : ' + JSON.stringify(m.ops));
    assert.equal(x.ver, 1);
    assert.deepEqual([x.nos.depuis, x.nos.jusqua], [m.nosBlocksEtat.depuis, m.nosBlocksEtat.jusqua]);
    assert.deepEqual([x.nos.depuis, x.nos.jusqua], [PLANCHER, m.c.tete]);
    assert.deepEqual([...x.nos.blocks].sort(), [...m.nosBlocksEtat.blocks].sort());
    assert.ok(x.nos.blocks.includes(NOUVEAU) && O.GRAINE_NOS_BLOCKS.every((g) => x.nos.blocks.includes(g.jeton)));
    assert.deepEqual(x.nos.comptes, [A6CF]); assert.equal(x.nos.plancher, PLANCHER);
    assert.equal(x.routeur.jusqua, GJR + 2000); assert.equal(x.routeur.routeur, CREATE_ROUTER.toLowerCase());
    assert.ok(x.routeur.blocks.some((b) => b.jeton === NE && b.sel === SEL) && IR.GRAINE_ROUTEUR.every((g) => x.routeur.blocks.some((b) => b.jeton === g.jeton)));
    assert.ok(!('teteAtteinte' in x.nos) && !('tete' in x.nos) && !('tete' in x.routeur), 'la tete ou teteAtteinte a ete persistee');
  });
  await cas('W2 l avancee SUIVANTE re-ecrit le fichier (la temporisation se re-arme)', async () => {
    const m = monter(source);
    await m.etendreNosBlocks(); await m.etendreBlocksRouteur(); await laisser();
    m.c.tete += 3000;
    await m.etendreNosBlocks(); await m.etendreBlocksRouteur(); await laisser();
    const x = lu(m.disque);
    assert.equal(x.nos.jusqua, m.c.tete, 'la 2e avancee de nos-blocks n a pas ete ecrite');
    assert.equal(x.routeur.jusqua, GJR + 4000, 'la 2e avancee du routeur n a pas ete ecrite');
  });
  await cas('W3 le routeur ECRIT de lui-meme : son avancee seule (nos-blocks deja ecrit, immobile) est persistee', async () => {
    const m = monter(source);
    await m.etendreNosBlocks(); await laisser();
    assert.equal(lu(m.disque).routeur.jusqua, GJR, 'temoin : avant le tour du routeur, le fichier dit la graine');
    await m.etendreBlocksRouteur(); await laisser();
    assert.equal(lu(m.disque).routeur.jusqua, GJR + 2000, 'l avancee du routeur seul n a pas ete ecrite');
  });
  await cas('W4 rien de neuf, rien d ecrit : un tour refuse du routeur (meme plage, memes blocks) ne re-ecrit pas le fichier', async () => {
    let refuse = false;
    const m = monter(source, { c: chaine({ refuseRouteur: () => refuse }) });
    await m.etendreNosBlocks(); await m.etendreBlocksRouteur(); await laisser();
    const n0 = m.ops.length;
    assert.ok(n0 > 0, 'temoin : rien n a ete ecrit au premier tour');
    refuse = true; m.c.tete += 5000;
    await m.etendreBlocksRouteur(); await laisser();
    assert.ok(m.routeurEtat.ratees > 0, 'temoin : le tour devait etre refuse');
    assert.equal(m.ops.length, n0, 're-ecrit sans rien de neuf : ' + JSON.stringify(m.ops.slice(n0)));
  });

  await cas('R1 redemarrage : le fichier est relu — plage et blocks repris, graine NON re-verifiee, lecture depuis jusqua+1, dit dans `reprise`', async () => {
    const disque = new Map();
    const a = monter(source, { disque });
    await a.etendreNosBlocks(); await a.etendreBlocksRouteur(); await laisser();
    const jN = a.nosBlocksEtat.jusqua, jR = a.routeurEtat.jusqua;
    const c = chaine({ tete: a.c.tete + 1000 });
    const b = monter(source, { disque, c });
    assert.deepEqual([b.nosBlocksEtat.depuis, b.nosBlocksEtat.jusqua], [PLANCHER, jN], 'nos-blocks n a pas repris la plage du volume');
    assert.equal(b.nosBlocksEtat.graine, 'VOLUME'); assert.deepEqual(b.nosBlocksEtat.reprise, { depuis: PLANCHER, jusqua: jN });
    assert.ok(b.nosBlocksEtat.blocks.has(NOUVEAU)); assert.equal(b.nosBlocksEtat.teteAtteinte, false);
    assert.deepEqual([b.routeurEtat.depuis, b.routeurEtat.jusqua], [PR, jR]); assert.ok(b.routeurEtat.blocks.has(NE));
    assert.deepEqual(b.routeurEtat.reprise, { depuis: PR, jusqua: jR });
    const rN = JSON.parse(b.nosBlocksCorps()), rR = JSON.parse(b.blocksRouteurCorps());
    assert.equal(rN.couvertureComplete, false, 'complet avant toute tete lue'); assert.deepEqual(rN.reprise, { depuis: PLANCHER, jusqua: jN }); assert.equal(rN.graine, 'VOLUME');
    assert.equal(rR.couvertureComplete, false, 'routeur complet avant toute tete lue'); assert.deepEqual(rR.reprise, { depuis: PR, jusqua: jR });
    await b.etendreNosBlocks();
    assert.equal(c.recus, 0, 'la graine a ete re-verifiee (recus d archive) malgre la reprise');
    assert.equal(Math.min(...c.fenetresFrappes.map((w) => w[0])), jN + 1, 'des blocs deja prouves ont ete relus');
    assert.equal(b.nosBlocksEtat.jusqua, c.tete); assert.ok(b.nosBlocksComplet());
    await b.etendreBlocksRouteur();
    assert.equal(Math.min(...c.fenetresRouteur.map((w) => w[0])), jR + 1); assert.equal(b.routeurEtat.jusqua, jR + 2000);
  });
  await cas('R2 graine refusee sur sa forme (compte surveille non couvert) : une plage contigue partielle bien formee est reprise', async () => {
    const comptes = [A6CF, AUTRE].sort();
    const disque = fichier({ nos: bonNos({ comptes, depuis: GJ - 1000, blocks: [...O.NOS_BLOCKS_GENESE, NOUVEAU] }) });
    const m = monter(source, { disque, env: { TB_NOS_CREATEURS: AUTRE } });
    assert.equal(m.nosBlocksEtat.graine, 'REFUSEE');
    assert.deepEqual([m.nosBlocksEtat.depuis, m.nosBlocksEtat.jusqua], [GJ - 1000, GJ + 4000], 'la plage partielle n a pas ete reprise');
    /* temoin : la meme plage descendue sur le bloc d une entree de la graine, SANS cette entree : refusee */
    const d2 = fichier({ nos: bonNos({ comptes, depuis: O.GRAINE_NOS_BLOCKS[0].bloc - 10, blocks: [...O.NOS_BLOCKS_GENESE, NOUVEAU] }) });
    const m2 = monter(source, { disque: d2, env: { TB_NOS_CREATEURS: AUTRE } });
    assert.equal(m2.nosBlocksEtat.jusqua, null, 'une plage couvrant une entree de la graine sans elle a ete reprise');
  });
  await cas('R3 graine refusee (le chemin ou « pas mieux que la graine » ne protege pas) : depuis sous le plancher, ou jusqua sous depuis -> rien de repris', async () => {
    const comptes = [A6CF, AUTRE].sort(), env = { TB_NOS_CREATEURS: AUTRE };
    const t = monter(source, { disque: fichier({ nos: bonNos({ comptes }) }), env });
    assert.deepEqual([t.nosBlocksEtat.depuis, t.nosBlocksEtat.jusqua], [PLANCHER, GJ + 4000], 'temoin : la plage bien formee doit etre reprise');
    const a = monter(source, { disque: fichier({ nos: bonNos({ comptes, depuis: PLANCHER - 1 }) }), env });
    assert.equal(a.nosBlocksEtat.jusqua, null, 'plage reprise avec depuis sous le plancher');
    const b = monter(source, { disque: fichier({ nos: bonNos({ comptes, depuis: GJ + 10, jusqua: GJ }) }), env });
    assert.equal(b.nosBlocksEtat.jusqua, null, 'plage reprise avec jusqua < depuis');
  });

  await cas('M0 temoin : le fichier fabrique bien forme est adopte (les refus ci-dessous ne sont pas vides)', async () => {
    const m = monter(source, { disque: fichier() });
    assert.deepEqual([m.nosBlocksEtat.depuis, m.nosBlocksEtat.jusqua, m.nosBlocksEtat.graine], [PLANCHER, GJ + 4000, 'VOLUME']);
    assert.equal(m.routeurEtat.jusqua, GJR + 4000); assert.ok(m.routeurEtat.blocks.has(NE));
  });
  const abimes = [
    ['pas du json', '{"ver":1,"nos":', 'tout'], ['un tableau', '[]', 'tout'], ['version 2', { ver: 2 }, 'tout'],
    ['nos : adresse mal formee', { nos: bonNos({ blocks: [...bonNos().blocks, '0xPASUNEADRESSE'] }) }, 'nos'],
    ['nos : adresse en majuscules', { nos: bonNos({ blocks: [...bonNos().blocks, NOUVEAU.toUpperCase().replace('0X', '0x')] }) }, 'nos'],
    ['nos : autres comptes surveilles', { nos: bonNos({ comptes: [A6CF, AUTRE].sort() }) }, 'nos'],
    ['nos : autre plancher', { nos: bonNos({ plancher: PLANCHER - 1 }) }, 'nos'],
    ['nos : jusqua non entier', { nos: bonNos({ jusqua: String(GJ + 4000) }) }, 'nos'],
    ['nos : jusqua sous depuis', { nos: bonNos({ depuis: PLANCHER, jusqua: PLANCHER - 5 }) }, 'nos'],
    ['nos : depuis sous le plancher', { nos: bonNos({ depuis: PLANCHER - 1 }) }, 'nos'],
    ['nos : genese absente', { nos: bonNos({ blocks: bonNos().blocks.filter((b) => b !== O.NOS_BLOCKS_GENESE[1]) }) }, 'nos'],
    ['nos : blocks pas un tableau', { nos: bonNos({ blocks: 'x' }) }, 'nos'],
    ['routeur : sel qui ne redonne pas le jeton', { routeur: bonRouteur({ blocks: [...IR.GRAINE_ROUTEUR, { jeton: NE, sel: SEL.slice(0, -1) + 'c', bloc: GJR + 500, tx: TX_NE }] }) }, 'routeur'],
    ['routeur : ancien routeur inconnu', { routeur: bonRouteur({ blocks: [...IR.GRAINE_ROUTEUR, { jeton: NE, sel: SEL, routeur: '0x' + '12'.repeat(20), bloc: GJR + 500, tx: TX_NE }] }) }, 'routeur'],
    ['routeur : autre CreateRouter', { routeur: bonRouteur({ routeur: '0x' + '99'.repeat(20) }) }, 'routeur'],
    ['routeur : autre plancher', { routeur: bonRouteur({ plancher: PR + 1 }) }, 'routeur'],
    ['routeur : bloc sous le plancher', { routeur: bonRouteur({ blocks: [...IR.GRAINE_ROUTEUR, { jeton: NE, sel: SEL, bloc: PR - 1, tx: TX_NE }] }) }, 'routeur'],
    ['routeur : tx mal formee', { routeur: bonRouteur({ blocks: [...IR.GRAINE_ROUTEUR, { jeton: NE, sel: SEL, bloc: GJR + 500, tx: '0x12' }] }) }, 'routeur'],
    ['routeur : blocks pas un tableau', { routeur: bonRouteur({ blocks: {} }) }, 'routeur'],
    ['routeur : depuis au-dessus du plancher', { routeur: bonRouteur({ depuis: PR + 1 }) }, 'routeur'],
    ['routeur : jusqua non entier', { routeur: bonRouteur({ jusqua: String(GJR + 4000) }) }, 'routeur'],
  ];
  for (const [nom, contenu, section] of abimes) {
    await cas('M ' + nom + ' : la section n adopte RIEN (la graine), l autre section est reprise', async () => {
      const m = monter(source, { disque: fichier(contenu) });
      if (section !== 'routeur') assert.ok(nosSurGraine(m), 'nos-blocks a adopte un fichier abime : ' + JSON.stringify([m.nosBlocksEtat.depuis, m.nosBlocksEtat.jusqua, m.nosBlocksEtat.blocks.size]));
      if (section !== 'nos') assert.ok(routeurSurGraine(m), 'le routeur a adopte un fichier abime : ' + JSON.stringify([m.routeurEtat.jusqua, m.routeurEtat.blocks.size]));
      if (section === 'nos') assert.equal(m.routeurEtat.jusqua, GJR + 4000, 'une section saine a ete jetee avec l autre');
      if (section === 'routeur') assert.equal(m.nosBlocksEtat.jusqua, GJ + 4000, 'une section saine a ete jetee avec l autre');
    });
  }

  await cas('C1 une plage qui couvre le bloc d une entree de la graine SANS cette entree n est pas reprise (nos-blocks ET routeur)', async () => {
    const m = monter(source, { disque: fichier({ nos: bonNos({ blocks: bonNos().blocks.filter((b) => b !== O.GRAINE_NOS_BLOCKS[0].jeton) }) }) });
    assert.ok(nosSurGraine(m), 'reprise avec une entree de la graine manquante');
    const r = monter(source, { disque: fichier({ routeur: bonRouteur({ blocks: bonRouteur().blocks.filter((b) => b.jeton !== IR.GRAINE_ROUTEUR[3].jeton) }) }) });
    assert.ok(routeurSurGraine(r), 'routeur repris avec une entree de la graine manquante');
  });
  await cas('C2 pas mieux que la graine : nos jusqua = celui de la graine, nos partiel quand la graine est admissible, routeur jusqua = GRAINE_JUSQUA', async () => {
    assert.ok(nosSurGraine(monter(source, { disque: fichier({ nos: bonNos({ jusqua: GJ }) }) })), 'nos repris a jusqua = graine');
    assert.ok(nosSurGraine(monter(source, { disque: fichier({ nos: bonNos({ depuis: PLANCHER + 1 }) }) })), 'nos partiel repris alors que la graine est admissible');
    assert.ok(routeurSurGraine(monter(source, { disque: fichier({ routeur: bonRouteur({ jusqua: GJR }) }) })), 'routeur repris a jusqua = graine');
  });
  await cas('C3 fenetre refusee (nos-blocks, F3) : le curseur ECRIT est celui de la memoire, sous la fenetre ; le redemarrage la relit et y trouve le block', async () => {
    const TROU = GJ + 3000;
    let refuse = true;
    const disque = new Map();
    const a = monter(source, { disque, c: chaine({ frappes: [[VIEUX, TROU]], refuseFrappes: (de, x) => refuse && de <= TROU && TROU <= x }) });
    await a.etendreNosBlocks(); await laisser();
    const x = lu(disque);
    assert.equal(a.nosBlocksEtat.jusqua, GJ + 2000, 'F3 : la memoire devait avancer jusque sous la fenetre refusee');
    assert.equal(x.nos.jusqua, a.nosBlocksEtat.jusqua, 'le fichier dit autre chose que la memoire');
    assert.ok(x.nos.jusqua < TROU && !x.nos.blocks.includes(VIEUX));
    refuse = false;
    const c = chaine({ tete: a.c.tete, frappes: [[VIEUX, TROU]] });
    const b = monter(source, { disque, c });
    assert.equal(b.nosBlocksEtat.jusqua, GJ + 2000);
    await b.etendreNosBlocks();
    assert.equal(Math.min(...c.fenetresFrappes.map((w) => w[0])), GJ + 2001, 'la fenetre refusee n a pas ete relue');
    assert.ok(b.nosBlocksEtat.blocks.has(VIEUX), 'le block de la fenetre refusee manque'); assert.ok(b.nosBlocksComplet());
  });
  await cas('C3b tout refuse : rien n avance, le fichier garde la graine (jamais repris) ; routeur : un tour refuse n avance pas le curseur ecrit', async () => {
    const disque = new Map();
    let refuseR = false;
    const a = monter(source, { disque, c: chaine({ refuseFrappes: () => true, refuseRouteur: () => refuseR }) });
    await a.etendreNosBlocks(); await a.etendreBlocksRouteur(); await laisser();
    assert.equal(lu(disque).nos.jusqua, GJ, 'un tour refuse a avance le curseur ecrit');
    assert.equal(lu(disque).routeur.jusqua, GJR + 2000);
    refuseR = true; a.c.tete += 5000;
    await a.etendreBlocksRouteur(); await laisser();
    assert.ok(a.routeurEtat.ratees > 0);
    assert.equal(lu(disque).routeur.jusqua, GJR + 2000, 'un tour refuse du routeur a avance le curseur ecrit');
    assert.ok(nosSurGraine(monter(source, { disque })), 'une plage sans avancee sur la graine a ete reprise');
  });
  await cas('C4 teteAtteinte n est jamais relu : reprise a 100 blocs de la tete, tete lue, fenetre refusee -> PAS complete ; relue -> complete', async () => {
    const c = chaine({ tete: GJ + 4100 });
    let refuse = true; c.refuseFrappes = () => refuse;
    const m = monter(source, { disque: fichier(), c });
    assert.equal(m.nosBlocksEtat.teteAtteinte, false);
    await m.etendreNosBlocks();
    assert.equal(m.nosBlocksEtat.tete, GJ + 4100);
    assert.equal(m.nosBlocksComplet(), false, 'complet sur la seule reprise (jamais lu jusqu a la tete dans ce processus)');
    assert.equal(JSON.parse(m.nosBlocksCorps()).couvertureComplete, false);
    refuse = false;
    await m.etendreNosBlocks();
    assert.equal(m.nosBlocksComplet(), true); assert.equal(m.nosBlocksEtat.jusqua, GJ + 4100);
  });
  await cas('E mode essai (fork) : un fichier present n est pas relu, et rien n est ecrit', async () => {
    const disque = fichier(); const avant = disque.get(FICHIER);
    const m = monter(source, { disque, essai: true });
    assert.ok(nosSurGraine(m) && routeurSurGraine(m), 'mode essai : le fichier a ete relu');
    await m.etendreNosBlocks(); await m.etendreBlocksRouteur(); await laisser();
    assert.equal(m.ops.length, 0); assert.equal(disque.get(FICHIER), avant);
  });
  await cas('F trop gros : RIEN n est ecrit (le fichier precedent reste, jamais un ensemble coupe), et c est dit', async () => {
    const disque = new Map();
    const m = monter(source, { disque });
    await m.etendreNosBlocks(); await laisser();
    const avant = disque.get(FICHIER);
    assert.ok(avant);
    for (let k = 0; k < 50000; k++) m.nosBlocksEtat.blocks.add('0xb2' + k.toString(16).padStart(38, '0'));
    m.c.tete += 10;
    await m.etendreNosBlocks(); await laisser();
    assert.equal(disque.get(FICHIER), avant, 'un fichier de plus de 2 Mo (ou coupe) a ete ecrit');
    assert.ok(m.journal.some((l) => /rien n est ecrit/.test(l)), 'le refus d ecrire n est pas dit');
  });
  await cas('F2 trop gros a la RELECTURE : un fichier bien forme de plus de 2 Mo n est pas adopte, et c est dit', async () => {
    const gros = [...bonNos().blocks]; for (let k = 0; k < 60000; k++) gros.push('0xb2' + k.toString(16).padStart(38, '0'));
    const disque = fichier({ nos: bonNos({ blocks: gros }) });
    assert.ok(disque.get(FICHIER).length > 2 * 1024 * 1024, 'temoin : le fichier fabrique doit depasser 2 Mo');
    const m = monter(source, { disque });
    assert.ok(nosSurGraine(m) && routeurSurGraine(m), 'un fichier de plus de 2 Mo a ete adopte');
    assert.ok(m.journal.some((l) => /trop gros/.test(l)), 'le refus de relire n est pas dit');
  });

  /* ── T : une reprise n est acquise qu une fois confrontee a une tete LUE dans ce processus (revue adverse du 2026-10-10) ── */
  await cas('T1 contre-exemple de la revue : jusqua = tete + 10 000 000 relu -> ABANDONNE au premier tour (graine, blocks du fichier jetes), jamais complet', async () => {
    const c = chaine();
    const LOIN = c.tete + 10000000;
    const disque = fichier({ nos: bonNos({ jusqua: LOIN, blocks: [...bonNos().blocks, FANTOME] }),
      routeur: bonRouteur({ jusqua: LOIN, blocks: [...bonRouteur().blocks, { jeton: NE2, sel: SEL2, bloc: GJR + 700, tx: TX_NE2 }] }) });
    const m = monter(source, { disque, c });
    assert.equal(m.routeurEtat.jusqua, LOIN, 'temoin : sans tete lue, le fichier est adopte (a verifier)');
    assert.equal(m.nosBlocksEtat.jusqua, LOIN, 'temoin : idem nos-blocks');
    await m.etendreBlocksRouteur();
    const rR = JSON.parse(m.blocksRouteurCorps());
    assert.equal(rR.couvertureComplete, false, 'routeur complet sur une plage au-dela de la tete (retard ' + (rR.tete - rR.jusqua) + ')');
    assert.equal(m.routeurEtat.reprise, null, 'la reprise impossible est encore annoncee');
    assert.ok(!m.routeurEtat.blocks.has(NE2), 'un block que seul le fichier abandonne disait est reste');
    assert.ok(IR.GRAINE_ROUTEUR.every((g) => m.routeurEtat.blocks.has(g.jeton)) && m.routeurEtat.blocks.has(NE));
    assert.equal(Math.min(...c.fenetresRouteur.map((w) => w[0])), GJR + 1, 'le routeur n a pas repris depuis la graine');
    assert.equal(m.routeurEtat.jusqua, GJR + 2000);
    assert.ok(m.journal.some((l) => /\[routeur\].*ABANDONNE/.test(l)), 'l abandon du routeur n est pas dit');
    await m.etendreNosBlocks();
    assert.equal(m.nosBlocksEtat.reprise, null, 'la reprise impossible est encore annoncee (nos-blocks)');
    assert.equal(c.recus, O.GRAINE_NOS_BLOCKS.length, 'apres abandon la graine n a pas ete re-verifiee');
    assert.equal(m.nosBlocksEtat.graine, 'ADMISE');
    assert.ok(!m.nosBlocksEtat.blocks.has(FANTOME), 'un block que seul le fichier abandonne disait est reste (nos-blocks)');
    assert.ok(m.nosBlocksEtat.blocks.has(NOUVEAU));
    assert.equal(Math.min(...c.fenetresFrappes.map((w) => w[0])), GJ + 1, 'nos-blocks n a pas repris depuis la graine');
    assert.equal(m.nosBlocksEtat.jusqua, c.tete); assert.ok(m.nosBlocksComplet());
    assert.ok(m.journal.some((l) => /\[nos-blocks\].*ABANDONNE/.test(l)), 'l abandon de nos-blocks n est pas dit');
  });
  await cas('T2 reprise un peu au-dessus de la tete (noeud en retard) : on ATTEND (rien lu, pas complet), puis acquise quand la tete la depasse', async () => {
    const c = chaine();
    const J = c.tete + 100;
    const m = monter(source, { disque: fichier({ nos: bonNos({ jusqua: J }), routeur: bonRouteur({ jusqua: J }) }), c });
    await m.etendreBlocksRouteur(); await m.etendreNosBlocks();
    assert.equal(c.fenetresRouteur.length + c.fenetresFrappes.length, 0, 'une fenetre a ete lue en attendant');
    assert.equal(JSON.parse(m.blocksRouteurCorps()).couvertureComplete, false, 'routeur complet sur une reprise pas encore confrontee');
    assert.equal(m.nosBlocksComplet(), false);
    assert.deepEqual(m.routeurEtat.reprise, { depuis: PR, jusqua: J }); assert.deepEqual(m.nosBlocksEtat.reprise, { depuis: PLANCHER, jusqua: J });
    c.tete = J + 300;
    await m.etendreBlocksRouteur(); await m.etendreNosBlocks();
    assert.equal(Math.min(...c.fenetresRouteur.map((w) => w[0])), J + 1); assert.equal(m.routeurEtat.jusqua, J + 300);
    assert.equal(JSON.parse(m.blocksRouteurCorps()).couvertureComplete, true, 'routeur pas complet apres confrontation et lecture');
    assert.equal(Math.min(...c.fenetresFrappes.map((w) => w[0])), J + 1); assert.ok(m.nosBlocksComplet());
    assert.equal(c.recus, 0, 'la graine a ete re-verifiee alors que la reprise etait acquise');
  });
  await cas('T3 borne exacte : jusqua = tete + RETARD_MAX_INDEX -> ATTEND ; tete + RETARD_MAX_INDEX + 1 -> ABANDONNE (routeur ET nos-blocks)', async () => {
    const c1 = chaine(); const m1 = monter(source, { disque: fichier({ routeur: bonRouteur({ jusqua: c1.tete + RMI }) }), c: c1 });
    await m1.etendreBlocksRouteur();
    assert.deepEqual(m1.routeurEtat.reprise, { depuis: PR, jusqua: c1.tete + RMI }, 'routeur abandonne A la borne'); assert.equal(c1.fenetresRouteur.length, 0);
    const c2 = chaine(); const m2 = monter(source, { disque: fichier({ routeur: bonRouteur({ jusqua: c2.tete + RMI + 1 }) }), c: c2 });
    await m2.etendreBlocksRouteur();
    assert.equal(m2.routeurEtat.reprise, null, 'routeur garde au-dela de la borne'); assert.equal(m2.routeurEtat.jusqua, GJR + 2000);
    const c3 = chaine(); const m3 = monter(source, { disque: fichier({ nos: bonNos({ jusqua: c3.tete + RMI }) }), c: c3 });
    await m3.etendreNosBlocks();
    assert.deepEqual(m3.nosBlocksEtat.reprise, { depuis: PLANCHER, jusqua: c3.tete + RMI }, 'nos-blocks abandonne A la borne'); assert.equal(c3.fenetresFrappes.length, 0);
    const c4 = chaine(); const m4 = monter(source, { disque: fichier({ nos: bonNos({ jusqua: c4.tete + RMI + 1 }) }), c: c4 });
    await m4.etendreNosBlocks();
    assert.equal(m4.nosBlocksEtat.reprise, null, 'nos-blocks garde au-dela de la borne'); assert.equal(m4.nosBlocksEtat.graine, 'ADMISE');
  });
  await cas('T4 une ATTENTE ne vaut pas verification : une tete lue ensuite bien plus bas fait encore abandonner (routeur ET nos-blocks)', async () => {
    const c = chaine();
    const J = c.tete + 100;
    const m = monter(source, { disque: fichier({ nos: bonNos({ jusqua: J }), routeur: bonRouteur({ jusqua: J }) }), c });
    await m.etendreBlocksRouteur(); await m.etendreNosBlocks();
    assert.ok(m.routeurEtat.reprise && m.nosBlocksEtat.reprise, 'temoin : premier tour = attente');
    c.tete = J - RMI - 1;
    await m.etendreBlocksRouteur(); await m.etendreNosBlocks();
    assert.equal(m.routeurEtat.reprise, null, 'routeur : l attente a ete prise pour une verification');
    assert.equal(m.nosBlocksEtat.reprise, null, 'nos-blocks : l attente a ete prise pour une verification');
  });
  await cas('T5 contre-exemple F1 de la revue : refuse au demarrage => refuse aussi par un premier tour du routeur venu TARD (tete montee entre-temps)', async () => {
    const c = chaine();
    const J = c.tete + RMI + 3000;
    const m = monter(source, { disque: fichier({ routeur: bonRouteur({ jusqua: J }) }), c });
    await m.etendreNosBlocks(); /* une tete lue au demarrage (par l AUTRE boucle) */
    c.tete = J + 1000; /* ~2 h plus tard : la tete a depasse le jusqua du fichier */
    await m.etendreBlocksRouteur();
    assert.equal(m.routeurEtat.reprise, null, 'admis par un premier tour tardif alors que la tete du demarrage le refusait');
    assert.equal(Math.min(...c.fenetresRouteur.map((w) => w[0])), GJR + 1, 'le routeur n a pas repris depuis la graine');
    /* temoin : le meme fichier, sans tete lue avant le tour tardif, est admis (c est la limite dite dans l en-tete) */
    const c2 = chaine(); c2.tete = J + 1000;
    const m2 = monter(source, { disque: fichier({ routeur: bonRouteur({ jusqua: J }) }), c: c2 });
    await m2.etendreBlocksRouteur();
    assert.deepEqual(m2.routeurEtat.reprise, { depuis: PR, jusqua: J }, 'temoin : sans tete plus ancienne, rien ne permet de refuser');
  });
  await cas('T6 une reprise a confronter lance le tour de FOND des deux boucles (sans visite) ; sans reprise, rien (paresseux comme avant)', async () => {
    const m = monter(source, { disque: fichier() });
    for (const f of m.intervalles) f();
    await laisser();
    assert.ok(m.fonds.includes('fond routeur'), 'routeur : la reprise attend une visite pour etre confrontee');
    assert.ok(m.fonds.includes('fond nos-blocks'), 'nos-blocks : la reprise attend une visite pour etre confrontee');
    const t = monter(source);
    for (const f of t.intervalles) f();
    await laisser();
    assert.equal(t.intervalles.length, 2, 'temoin : deux tours de fond attendus'); assert.deepEqual(t.fonds, [], 'tour de fond lance sans reprise ni visite');
  });
  return res;
}

/* ── MUTANTS du code de persistance : chacun DOIT rougir ─────────────────────────────────────────────────────────────────────── */
const MUTANTS = [
  ['n1 nos : la tete ecrite a la place de jusqua (plus que lu)', 'depuis: nosBlocksEtat.depuis, jusqua: nosBlocksEtat.jusqua, blocks: [...nosBlocksEtat.blocks] };',
    'depuis: nosBlocksEtat.depuis, jusqua: Math.max(nosBlocksEtat.jusqua, nosBlocksEtat.tete ?? 0), blocks: [...nosBlocksEtat.blocks] };', [/^C3 /]],
  ['n2 routeur : la tete ecrite a la place de jusqua', 'plancher: PLANCHER_ROUTEUR, depuis: routeurEtat.depuis, jusqua: routeurEtat.jusqua,',
    'plancher: PLANCHER_ROUTEUR, depuis: routeurEtat.depuis, jusqua: Math.max(routeurEtat.jusqua, routeurEtat.tete ?? 0),', [/^C3b /]],
  ['n3 nos : ensemble coupe a l ecriture', 'jusqua: nosBlocksEtat.jusqua, blocks: [...nosBlocksEtat.blocks] };', 'jusqua: nosBlocksEtat.jusqua, blocks: [...nosBlocksEtat.blocks].slice(-2) };', [/^R1 /]],
  ['n4 teteAtteinte relu avec la reprise', 'nosBlocksEtat.depuis = n.depuis; nosBlocksEtat.jusqua = n.jusqua;', 'nosBlocksEtat.depuis = n.depuis; nosBlocksEtat.jusqua = n.jusqua; nosBlocksEtat.teteAtteinte = true;', [/^C4 /]],
  ['n5 nos : entree de la graine absente acceptee', 'if (!GRAINE_NOS_BLOCKS.every((g) => g.bloc < depuis || g.bloc > jusqua || ens.has(g.jeton))) return null;', 'if (false) return null;', [/^C1 /]],
  ['n6 nos : pas mieux que la graine accepte', 'if (GRAINE_NOS.ok && !(depuis === PREMIER_BLOCK_TB && jusqua > GRAINE_NOS.jusqua)) return null;', 'if (false) return null;', [/^C2 /]],
  ['n7 nos : comptes surveilles non compares', '|| JSON.stringify(x.comptes) !== JSON.stringify(comptesNosTries())) return null;', ') return null;', [/^M nos : autres comptes/]],
  ['n8 routeur : sel non verifie par la formule', '&& (b.routeur === undefined ? neDuRouteur(b.jeton, b.sel) : ROUTEURS_ANCIENS.includes(b.routeur) && neDuRouteur(b.jeton, b.sel, b.routeur));', '&& true;', [/^M routeur : sel/]],
  ['n9 graine re-verifiee malgre la reprise (jusqua ecrase par la graine)', "if (nosBlocksEtat.graine === 'A_VERIFIER') nosBlocksEtat.graine = 'VOLUME';", '/* pas de VOLUME */', [/^R1 /]],
  ['n10 temporisation jamais re-armee', 'progresEcritureArmee = false;', '/* jamais re-armee */', [/^W2 /]],
  ['n11 mode essai : ecrit et relu', 'const FICHIER_PROGRES_INDEX = !ESSAI_SRV.actif && (', 'const FICHIER_PROGRES_INDEX = (', [/^E /]],
  ['n12 ecriture non atomique', "writeFileSync(FICHIER_PROGRES_INDEX + '.tmp', payload);", 'writeFileSync(FICHIER_PROGRES_INDEX, payload);', [/^W1 /]],
  ['n13 nos : adresses non verifiees', 'if (!Array.isArray(blocks) || !blocks.every(adrProgresSaine)) return null;', 'if (!Array.isArray(blocks)) return null;', [/^M nos : adresse mal formee/]],
  ['n14 routeur : entree de la graine absente acceptee', 'if (!GRAINE_ROUTEUR.every((g) => g.bloc < x.depuis || g.bloc > x.jusqua || ens.has(g.jeton))) return null;', 'if (false) return null;', [/^C1 /]],
  ['n15 routeur : pas mieux que la graine accepte', '|| x.jusqua <= GRAINE_JUSQUA) return null;', ') return null;', [/^C2 /]],
  ['n16 fichier jamais relu', '(function relireProgresIndex() {', '(function relireProgresIndex() { return;', [/^R1 /, /^M0 /]],
  ['n17 trop gros : ecrit quand meme', 'if (payload.length > PROGRES_INDEX_MAX_OCTETS) {', 'if (false) {', [/^F /]],
  ['n18 nos : genese non exigee', 'if (!NOS_BLOCKS_GENESE.every((b) => ens.has(b))) return null;', '', [/^M nos : genese absente/]],
  /* trous signales par la revue adverse du 2026-10-10 (r1, r2, r3, r4, r6, r7) */
  ['n19 routeur : n ecrit plus de lui-meme (r1)', 'noterProgresIndex(); /* 2026-10-10 : la plage du routeur prouvee ici survit au redeploiement */', '', [/^W3 /]],
  ['n20 nos : n ecrit plus de lui-meme', 'noterProgresIndex(); /* 2026-10-10 : la plage de nos-blocks prouvee ici survit au redeploiement */', '', [/^C3 /, /^F /]],
  ['n21 routeur : jusqua non entier accepte (r2)', 'if (x.depuis !== PLANCHER_ROUTEUR || !Number.isSafeInteger(x.jusqua) || ', 'if (x.depuis !== PLANCHER_ROUTEUR || ', [/^M routeur : jusqua non entier/]],
  ['n22 nos : jusqua sous depuis accepte (r3)', '|| depuis < PREMIER_BLOCK_TB || jusqua < depuis) return null;', '|| depuis < PREMIER_BLOCK_TB) return null;', [/^R3 /]],
  ['n23 nos : depuis sous le plancher accepte (r4)', '|| depuis < PREMIER_BLOCK_TB || jusqua < depuis) return null;', '|| jusqua < depuis) return null;', [/^R3 /]],
  ['n24 relecture non bornee en taille (r6)', "if (brut.length > PROGRES_INDEX_MAX_OCTETS) { console.log('[progres-index] fichier trop gros", "if (false) { console.log('[progres-index] fichier trop gros", [/^F2 /]],
  ['n25 ecriture non dedupliquee (r7)', 'if (payload === progresDernierEcrit) return;', '', [/^W4 /]],
  /* la confrontation a la tete (correctif du contre-exemple) */
  ['n26 reprise jamais abandonnee', "if (jusqua - teteMinLue > RETARD_MAX_INDEX) return 'ABANDONNER';", '', [/^T1 /, /^T3 /, /^T4 /, /^T5 /]],
  ['n27 borne decalee d un bloc', 'if (jusqua - teteMinLue > RETARD_MAX_INDEX)', 'if (jusqua - teteMinLue >= RETARD_MAX_INDEX)', [/^T3 /]],
  ['n28 routeur complet sans confrontation', '&& !routeurEtat.repriseAVerifier', '', [/^T2 /]],
  ['n29 abandon routeur : blocks du fichier gardes', 'routeurEtat.blocks.clear();', '', [/^T1 /]],
  ['n30 abandon nos : blocks du fichier gardes', 'nosBlocksEtat.blocks.clear();', '', [/^T1 /]],
  ['n31 routeur : reprise jamais a verifier', 'routeurEtat.repriseAVerifier = true;', '', [/^T1 /, /^T2 /]],
  ['n32 nos : reprise jamais a verifier', 'nosBlocksEtat.repriseAVerifier = true;', '', [/^T1 /]],
  ['n33 abandon nos : graine VOLUME gardee', "nosBlocksEtat.graine = GRAINE_NOS.ok ? 'A_VERIFIER' : 'REFUSEE'; /* l etat de depart, exactement */", '', [/^T1 /]],
  ['n34 abandon routeur : jusqua du fichier garde', 'routeurEtat.jusqua = GRAINE_JUSQUA; routeurEtat.reprise = null;', 'routeurEtat.reprise = null;', [/^T1 /]],
  ['n35 routeur : attente prise pour verification', "if (v === 'ATTENDRE') return; /* routeur : ni lu ni complet, toujours a verifier */", '', [/^T2 /, /^T4 /]],
  ['n36 nos : attente prise pour verification', "if (v === 'ATTENDRE') return; /* nos-blocks : ni lu ni complet, toujours a verifier */", '', [/^T4 /]],
  /* seconde revue adverse (F1 : premier tour tardif ; F4 : attente jamais reprise sans visite) */
  ['n37 routeur : reprise sans tour de fond', 'if (routeurEtat.lu !== null || routeurEtat.repriseAVerifier) rattraperBlocksRouteur();', 'if (routeurEtat.lu !== null) rattraperBlocksRouteur();', [/^T6 /]],
  ['n38 nos : reprise sans tour de fond', 'if (nosBlocksEtat.lu !== null || nosBlocksEtat.repriseAVerifier) rattraperNosBlocks();', 'if (nosBlocksEtat.lu !== null) rattraperNosBlocks();', [/^T6 /]],
  ['n39 confrontee a la tete du tour, pas a la plus basse', 'if (jusqua - teteMinLue > RETARD_MAX_INDEX)', 'if (jusqua - tete > RETARD_MAX_INDEX)', [/^T5 /]],
  ['n40 attente prise pour acquise', "return jusqua <= tete ? 'VERIFIEE' : 'ATTENDRE';", "return 'VERIFIEE';", [/^T2 /]],
  ['n41 nos ne note pas sa tete', 'noterTeteLue(fin);', '', [/^T5 /]],
  ['n42 la plus HAUTE tete au lieu de la plus basse', 'Math.min(teteMinLue, t)', 'Math.max(teteMinLue, t)', [/^T4 /, /^T5 /]],
];

let ko = 0, n = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('  KO ' + m); } };
const base = await suite(SRC);
for (const r of base) ok(r.ok, 'code livre : ' + r.id + (r.err ? ' — ' + r.err : ''));
console.log('code livre : ' + base.length + ' cas, ' + base.filter((r) => !r.ok).length + ' KO');
let tues = 0;
for (const [nom, de, vers, casse] of MUTANTS) {
  const fois = SRC.split(de).length - 1;
  ok(fois === 1, 'mutant ' + nom + ' : motif trouve ' + fois + ' fois (attendu 1)');
  if (fois !== 1) continue;
  const r = await suite(SRC.replace(de, vers));
  const rouges = r.filter((x) => !x.ok).map((x) => x.id);
  if (rouges.length) tues += 1;
  console.log('mutant ' + nom + ' : ' + rouges.length + ' rouge(s) — ' + rouges.map((x) => x.split(' ').slice(0, 2).join(' ')).join(' | '));
  ok(rouges.length > 0, 'mutant ' + nom + ' : le banc doit devenir ROUGE');
  for (const re of casse) ok(rouges.some((id) => re.test(id)), 'mutant ' + nom + ' : doit casser ' + re);
}
console.log('mutants tues : ' + tues + '/' + MUTANTS.length);
console.log(n + ' assertions, ' + ko + ' KO');
if (n === 0) { console.log('⛔ aucune assertion executee'); process.exit(1); }
process.exit(ko ? 1 : 0);
