/* test-naissance-creation-20261025.mjs — LA RECHERCHE DE NAISSANCE COMMENCE AU BLOC DE CREATION QUAND LE SERVEUR L A LU LUI-MEME.
 *
 * Mesure prod (2026-10-25 16:30 UTC) : /api/holders/0xb2…579e restait NON_LU — « blocks 50889088-50891087 were refused by the
 * node ». reconstruireHolders cherchait le premier mint depuis PREMIER_BLOCK_TB (50 861 088) jusqu a la tete : ~1 100 fenetres
 * eth_getLogs de 2 000 blocs par passe, recommencees a zero sur tout refus (regle du 2026-10-09, qui RESTE).
 * Le correctif : debut = bloc du log B20Created lu par le serveur (GRAINE_ROUTEUR, ou scannerNesDuRouteur dans ce processus),
 * sinon PREMIER_BLOCK_TB comme avant. Jamais d une requete client, jamais de la reprise du volume.
 * Les gardes, EXECUTEES sur le fichier livre (tranche routeurEtat -> etendreBlocksRouteur, et reconstruireHolders) contre un
 * noeud simule qui COMPTE les fenetres de recherche de naissance :
 *   C1 block cree pres de la tete, vu par le scan du routeur : 1 fenetre au lieu de ~1 100, la naissance juste.
 *   C2 TEMOIN jeton inconnu : la recherche commence a PREMIER_BLOCK_TB exactement.
 *   C3 entree de GRAINE_ROUTEUR : la recherche commence a son bloc.
 *   C4 TEMOIN entree posee dans routeurEtat.blocks SANS le scan (comme la reprise du volume) : PREMIER_BLOCK_TB.
 *   C5 TEMOIN regle du refus : fenetre de creation refusee -> NON_LUE, arret, aucun mint posterieur pris.
 *   C6 bloc incoherent (sous PREMIER_BLOCK_TB) ou double : jamais un debut plus tard que PREMIER / que le plus bas lu.
 * Usage : node test-naissance-creation-20261025.mjs [chemin/vers/serveur-web.js]   (mutant = une COPIE passee en argument)
 * ⛔ BORNE : aucun noeud reel n est appele ; la vraie limite de debit n est pas exercee ici. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as S from './soldes-jeton.js';
import { scannerNesDuRouteur, adresseNeeDuRouteur, GRAINE_ROUTEUR, PLANCHER_ROUTEUR, RETARD_MAX_INDEX,
  SELECTEUR_CREATE_PAID, FACTORY_B20, TOPIC_B20_CREATED } from './index-routeur.js';
import { CREATE_ROUTER } from './frais-creation.js';
import * as AC from './actions-chaine.js';
import { partsHolders } from './parts-holders.js';
import { FACTORY, TOPIC_CREATED } from './index-blocks.js';

const { TOPIC_TRANSFER, ADRESSE_ZERO } = S;
let n = 0;
const rates = [];
const cas = async (titre, f) => { n++; try { await f(); console.log('  ok  ' + titre); } catch (e) { rates.push(titre); console.error('  x ' + titre + '\n      ' + String(e && e.message).split('\n')[0]); } };

const fichier = process.argv[2] || new URL('./serveur-web.js', import.meta.url);
const src = readFileSync(fichier, 'utf8');
const entre = (debut, fin) => {
  const i = src.indexOf(debut); assert.ok(i > 0, 'ancre introuvable : ' + debut);
  if (fin instanceof RegExp) { const m = fin.exec(src.slice(i)); assert.ok(m, 'fin introuvable apres ' + debut); return src.slice(i, i + m.index + m[0].length); }
  const j = src.indexOf(fin, i); assert.ok(j > i, 'fin introuvable : ' + fin); return src.slice(i, j);
};
const tranche = entre('const routeurEtat = {', 'function rattraperBlocksRouteur() {')
  + '\n' + entre('async function reconstruireHolders(jeton) {', /\r?\n\}\r?\n/)
  + '\n' + entre('async function holdersCorps(jeton) {', /\r?\n\}\r?\n/);
const premierLu = /const PREMIER_BLOCK_TB = (\d+);/.exec(src);
assert.ok(premierLu, 'PREMIER_BLOCK_TB introuvable');
const PREMIER = Number(premierLu[1]);
assert.equal(PREMIER, 50861088, 'le plancher du fichier livre a change : ' + PREMIER);

/* Tete realiste : ~1 100 fenetres de 2 000 blocs au-dessus du plancher (la mesure prod du 2026-10-25). */
const TETE = PREMIER + 1100 * 2000 - 1; /* 53 061 087 */
const mot = (a) => '0x' + String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const hx = (b) => '0x' + b.toString(16);
const SEL = '0x' + '5e'.repeat(32);
const JETON_NEUF = adresseNeeDuRouteur(SEL);
const A = '0x' + 'a1'.repeat(20);

/** Noeud simule. creations : [{ jeton, bloc, tx, sel }] (logs B20Created de la factory) ; mints : [{ jeton, bloc, v }]. */
function noeud({ creations = [], mints = [], refuse = () => false, actions = [] } = {}) {
  const fenetresNaissance = [];
  const rpc = async (methode, params) => {
    if (methode === 'eth_blockNumber') return hx(TETE);
    /* actions de l emetteur : [{ jeton, tx, bloc, recu: true|false }] — code 0xef, recu (log B20Created de la FACTORY), tx de l emetteur */
    const act = actions.find((x) => x.tx === params[0] || x.jeton === params[0]);
    if (methode === 'eth_getCode') return act ? '0xef' : '0x';
    if (methode === 'eth_getTransactionReceipt') {
      if (!act || act.recu === false) return null;
      return { transactionHash: act.tx, status: '0x1', blockNumber: hx(act.bloc), logs: [{ address: FACTORY, blockNumber: hx(act.bloc), transactionHash: act.tx,
        topics: [TOPIC_CREATED, mot(act.jeton), mot('0')], data: '0x' + mot('80').slice(2) + mot('c0').slice(2) + mot('6').slice(2) + mot('100').slice(2)
          + mot('5').slice(2) + Buffer.from('ACTNc').toString('hex').padEnd(64, '0') + mot('5').slice(2) + Buffer.from('ACTNc').toString('hex').padEnd(64, '0') + mot('0').slice(2) }] };
    }
    if (methode === 'eth_getTransactionByHash' && act) return { hash: act.tx, from: AC.CREATEUR_EMETTEUR, to: AC.APPELE_EMETTEUR, input: '0x' };
    if (methode === 'eth_call') return mot(mints.reduce((s, m) => s + m.v, 0n).toString(16));
    if (methode === 'eth_getTransactionByHash') {
      const c = creations.find((x) => x.tx === params[0]);
      return c ? { hash: c.tx, to: CREATE_ROUTER, input: SELECTEUR_CREATE_PAID + mot('1').slice(2) + c.sel.slice(2) + '0'.repeat(64 * 3) } : null;
    }
    if (methode !== 'eth_getLogs') throw new Error('appel non simule : ' + methode);
    const p = params[0];
    const de = parseInt(p.fromBlock, 16), a = parseInt(p.toBlock, 16);
    if (String(p.address).toLowerCase() === FACTORY_B20) {
      return creations.filter((c) => c.bloc >= de && c.bloc <= a).map((c) => ({ address: FACTORY_B20, blockNumber: hx(c.bloc), transactionHash: c.tx,
        topics: [TOPIC_B20_CREATED, mot(c.jeton), mot('0')], data: '0x' }));
    }
    const mintSeul = (p.topics || []).length > 1;
    if (mintSeul) fenetresNaissance.push({ de, a });
    if (refuse(de, a, mintSeul)) throw new Error('over rate limit');
    return mints.filter((m) => m.jeton === p.address && m.bloc >= de && m.bloc <= a)
      .map((m) => ({ blockNumber: hx(m.bloc), topics: [TOPIC_TRANSFER, mot(ADRESSE_ZERO), mot(A)], data: mot(m.v.toString(16)) }));
  };
  rpc.fenetresNaissance = fenetresNaissance;
  return rpc;
}

/** Un « processus » neuf : la tranche livree, son noeud simule. La graine du routeur couvre jusqu a TETE - 2000. */
function monter(rpc, preuves = new Map()) {
  const PARAMS = ['rpcServeur', 'GRAINE_ROUTEUR', 'GRAINE_JUSQUA', 'PLANCHER_ROUTEUR', 'PREMIER_BLOCK_TB', 'noterTeteLue', 'confronterReprise',
    'RETARD_MAX_INDEX', 'PAS_ROUTEUR', 'lecteurLogs', 'scannerNesDuRouteur', 'REPRISES_LECTURE_MS', 'archiveEpuisee', 'noterProgresIndex',
    'holdersCache', 'HOLDERS_MAX', 'lireNaissance', 'naissanceDuJeton', 'passeIncrementale', 'ecrireHolders', 'preuvesActions', 'prouverAction',
    'verifierSomme', 'soldesNegatifs', 'partsHolders', 'POT_FICTIF'];
  const cache = new Map();
  const appelsPreuve = { n: 0 };
  const prouver = async (o) => { appelsPreuve.n += 1; return AC.prouverAction(o); };
  const f = new Function(...PARAMS, '"use strict";\n' + tranche
    + "\n; return { routeurEtat, etendreBlocksRouteur, reconstruireHolders, holdersCorps, noterCreationsLues: typeof noterCreationsLues === 'function' ? noterCreationsLues : null };");
  const m = f(rpc, GRAINE_ROUTEUR, TETE - 2000, PLANCHER_ROUTEUR, PREMIER, () => {}, () => 'VERIFIEE',
    RETARD_MAX_INDEX, 2000, () => ({ rpc, suivi: { essais: 0 }, nonEnvoyee: () => false }), scannerNesDuRouteur, [], () => false, () => {},
    cache, 200, S.lireNaissance, S.naissanceDuJeton, S.passeIncrementale, () => {}, preuves, prouver,
    S.verifierSomme, S.soldesNegatifs, partsHolders, 10n ** 18n);
  m.cache = cache;
  m.appelsPreuve = appelsPreuve;
  return m;
}
const premiere = (rpc) => (rpc.fenetresNaissance[0] || {}).de;

await cas('C1 block cree pres de la tete, lu par le scan du routeur : la recherche part de sa creation (1 fenetre, pas ~1 100)', async () => {
  const CREATION = TETE - 1500;
  const rpc = noeud({ creations: [{ jeton: JETON_NEUF, bloc: CREATION, tx: '0x' + 'c1'.repeat(32), sel: SEL }],
    mints: [{ jeton: JETON_NEUF, bloc: CREATION, v: 1000n }] });
  const m = monter(rpc);
  await m.etendreBlocksRouteur();
  assert.ok(m.routeurEtat.blocks.has(JETON_NEUF), 'le scan du routeur n a pas retenu le block (banc mal monte)');
  const e = await m.reconstruireHolders(JETON_NEUF);
  console.log('      fenetres de recherche de naissance : ' + rpc.fenetresNaissance.length + ' (premiere a ' + premiere(rpc) + ', creation ' + CREATION + ')');
  assert.equal(e.naissance, CREATION, 'naissance ' + e.naissance);
  assert.equal(premiere(rpc), CREATION, 'la recherche a commence au bloc ' + premiere(rpc) + ', pas a la creation lue ' + CREATION);
  assert.equal(rpc.fenetresNaissance.length, 1, rpc.fenetresNaissance.length + ' fenetres de naissance pour un block cree 1 500 blocs sous la tete');
});
await cas('C2 TEMOIN jeton dont la creation n est pas lue par le serveur : la recherche commence a PREMIER_BLOCK_TB exactement', async () => {
  const INCONNU = '0xb200000000000000000000e4b0c5fbe9c8df579e'; /* IB022 : ne de la fabrique directe, hors index du routeur */
  const rpc = noeud({ mints: [{ jeton: INCONNU, bloc: PREMIER + 5000, v: 7n }] });
  const m = monter(rpc);
  await m.etendreBlocksRouteur();
  const e = await m.reconstruireHolders(INCONNU);
  assert.equal(premiere(rpc), PREMIER, 'premiere fenetre ' + premiere(rpc));
  assert.equal(e.naissance, PREMIER + 5000);
  assert.equal(rpc.fenetresNaissance.length, 3);
});
await cas('C3 entree de GRAINE_ROUTEUR (lue on-chain, figee) : la recherche commence a son bloc', async () => {
  const g = GRAINE_ROUTEUR[0];
  const rpc = noeud({ mints: [{ jeton: g.jeton, bloc: g.bloc, v: 5n }] });
  const m = monter(rpc);
  const e = await m.reconstruireHolders(g.jeton);
  assert.equal(premiere(rpc), g.bloc, 'premiere fenetre ' + premiere(rpc) + ' ; bloc de la graine ' + g.bloc);
  assert.equal(e.naissance, g.bloc);
  assert.equal(rpc.fenetresNaissance.length, 1);
});
await cas('C4 TEMOIN entree posee dans routeurEtat.blocks SANS le scan (comme la reprise du volume) : PREMIER_BLOCK_TB', async () => {
  const rpc = noeud({ mints: [{ jeton: JETON_NEUF, bloc: PREMIER + 100, v: 3n }] });
  const m = monter(rpc);
  m.routeurEtat.blocks.set(JETON_NEUF, { jeton: JETON_NEUF, sel: SEL, bloc: TETE - 10, tx: '0x' + 'd4'.repeat(32) });
  const e = await m.reconstruireHolders(JETON_NEUF);
  assert.equal(premiere(rpc), PREMIER, 'un bloc non lu par le scan a servi de debut : ' + premiere(rpc));
  assert.equal(e.naissance, PREMIER + 100);
});
await cas('C5 TEMOIN regle du refus : la fenetre de creation refusee ARRETE la recherche, aucun mint posterieur n est pris', async () => {
  const CREATION = TETE - 9000;
  const rpc = noeud({ creations: [{ jeton: JETON_NEUF, bloc: CREATION, tx: '0x' + 'c5'.repeat(32), sel: SEL }],
    mints: [{ jeton: JETON_NEUF, bloc: CREATION, v: 1000n }, { jeton: JETON_NEUF, bloc: TETE - 100, v: 1n }],
    refuse: (de, a, mintSeul) => mintSeul && de <= CREATION && a >= CREATION });
  const m = monter(rpc);
  m.routeurEtat.jusqua = CREATION - 1; /* le scan du routeur couvre la creation */
  await m.etendreBlocksRouteur();
  const e = await m.reconstruireHolders(JETON_NEUF);
  assert.equal(e.naissance, null, 'naissance retenue ' + e.naissance + ' malgre la fenetre refusee');
  assert.ok(e.rechercheNaissance && e.rechercheNaissance.etat === 'NON_LUE', 'etat ' + (e.rechercheNaissance && e.rechercheNaissance.etat));
  const derniere = rpc.fenetresNaissance[rpc.fenetresNaissance.length - 1];
  assert.ok(derniere.de <= CREATION && derniere.a >= CREATION, 'des fenetres ont ete lues apres la fenetre refusee (derniere ' + derniere.de + '-' + derniere.a + ')');
});
await cas('C6 bloc lu sous PREMIER_BLOCK_TB -> CE bloc (jamais plus tard) ; bloc 0 -> PREMIER ; deux blocs -> le plus BAS', async () => {
  const m0 = monter(noeud());
  assert.equal(typeof m0.noterCreationsLues, 'function', 'noterCreationsLues absente du fichier livre');
  const J2 = '0xb20' + '0'.repeat(33) + 'c6c6', J3 = '0xb20' + '0'.repeat(33) + 'c6c7';
  const rpc = noeud({ mints: [{ jeton: JETON_NEUF, bloc: PREMIER + 10, v: 1n }, { jeton: J2, bloc: TETE - 5000, v: 1n }, { jeton: J3, bloc: PREMIER + 10, v: 1n }] });
  const m = monter(rpc);
  m.noterCreationsLues([{ jeton: JETON_NEUF, bloc: PREMIER - 1 }, { jeton: J2, bloc: TETE - 100 }, { jeton: J2, bloc: TETE - 5000 }, { jeton: J3, bloc: 0 }]);
  await m.reconstruireHolders(JETON_NEUF);
  assert.equal(premiere(rpc), PREMIER - 1, 'creation lue a ' + (PREMIER - 1) + ', recherche partie de ' + premiere(rpc) + ' : plus TARD que la creation');
  rpc.fenetresNaissance.length = 0;
  await m.reconstruireHolders(J3);
  assert.equal(premiere(rpc), PREMIER, 'un bloc 0 a servi de debut : ' + premiere(rpc));
  rpc.fenetresNaissance.length = 0;
  const e2 = await m.reconstruireHolders(J2);
  assert.equal(premiere(rpc), TETE - 5000, 'debut ' + premiere(rpc) + ' : pas le plus bas des deux blocs lus');
  assert.equal(e2.naissance, TETE - 5000);
});

/* ── C7-C11 (2026-10-25, actions tokenisees) : la preuve PROUVE d une action, REJOUEE ici (prouverAction livre), donne le debut ──
 * Formes reelles, copiees de actions-chaine-graine.js (et relues on-chain ce jour par prouverAction, sonde-actions.mjs) :
 *   NVDAc 0xb20000000000000000000078ee7ce2fe4908108c, tx 0x35e3…a507, creee au bloc 49145311 (SOUS le plancher)
 *   NFLXc 0xb20000000000000000000058b8c947e44011dfe6, tx 0xe02a…00e7, creee au bloc 51740136
 * La tx de creation d une action ne frappe rien (0 mint, mesure) : le premier mint vient APRES. Le banc ne lit pas la chaine. */
const NVDAC = { jeton: '0xb20000000000000000000078ee7ce2fe4908108c', tx: '0x35e3070e771162d7abf2a5cb64408cae55b9cf0d307bfbc1bb12b486442fa507', bloc: 49145311 };
const NFLXC = { jeton: '0xb20000000000000000000058b8c947e44011dfe6', tx: '0xe02a851aecefe34b3221756f01412f40c0b0f5d6e431cec7fc9cb73a2c6c00e7', bloc: 51740136 };
const preuve = (a, extra = {}) => new Map([[a.jeton, { etat: 'PROUVE', adr: a.jeton, tx: a.tx, bloc: a.bloc, ...extra }]]);
await cas('C7 action creee SOUS le plancher (forme NVDAc) : la recherche part de sa creation prouvee, et trouve le VRAI premier mint', async () => {
  const PREMIER_MINT = NVDAC.bloc + 500;
  const rpc = noeud({ actions: [NVDAC], mints: [{ jeton: NVDAC.jeton, bloc: PREMIER_MINT, v: 10n }, { jeton: NVDAC.jeton, bloc: PREMIER + 100, v: 5n }] });
  const m = monter(rpc, preuve(NVDAC));
  const e = await m.reconstruireHolders(NVDAC.jeton);
  console.log('      NVDAc : naissance ' + e.naissance + ' (vrai premier mint ' + PREMIER_MINT + '), premiere fenetre ' + premiere(rpc) + ', ' + rpc.fenetresNaissance.length + ' fenetre(s)');
  assert.equal(premiere(rpc), NVDAC.bloc, 'la recherche a commence au bloc ' + premiere(rpc));
  assert.equal(e.naissance, PREMIER_MINT, 'naissance retenue ' + e.naissance + ' : un mint POSTERIEUR au vrai premier mint ' + PREMIER_MINT);
});
await cas('C8 action creee au-dessus du plancher (forme NFLXc) : 1 fenetre au lieu de ~440', async () => {
  const rpc = noeud({ actions: [NFLXC], mints: [{ jeton: NFLXC.jeton, bloc: NFLXC.bloc + 30, v: 10n }] });
  const m = monter(rpc, preuve(NFLXC));
  const e = await m.reconstruireHolders(NFLXC.jeton);
  console.log('      NFLXc : ' + rpc.fenetresNaissance.length + ' fenetre(s) de naissance (premiere a ' + premiere(rpc) + ')');
  assert.equal(premiere(rpc), NFLXC.bloc);
  assert.equal(e.naissance, NFLXC.bloc + 30);
  assert.equal(rpc.fenetresNaissance.length, 1);
});
await cas('C9 le bloc d une preuve relue du volume n est PAS cru : c est le recu relu ICI qui donne le debut', async () => {
  const rpc = noeud({ actions: [NFLXC], mints: [{ jeton: NFLXC.jeton, bloc: NFLXC.bloc + 30, v: 10n }] });
  const m = monter(rpc, preuve(NFLXC, { bloc: TETE - 50 })); /* un fichier abime dirait « creee pres de la tete » */
  await m.reconstruireHolders(NFLXC.jeton);
  assert.equal(premiere(rpc), NFLXC.bloc, 'debut ' + premiere(rpc) + ' : le bloc du fichier a ete pris');
  assert.equal(m.appelsPreuve.n, 1, 'preuve rejouee ' + m.appelsPreuve.n + ' fois');
});
await cas('C10 recu illisible : rien n est note, PREMIER_BLOCK_TB comme avant ; recu servi a la passe suivante : sa creation', async () => {
  const act = { ...NFLXC, recu: false };
  const rpc = noeud({ actions: [act], mints: [{ jeton: NFLXC.jeton, bloc: PREMIER + 10, v: 1n }] });
  const m = monter(rpc, preuve(NFLXC));
  await m.reconstruireHolders(NFLXC.jeton);
  assert.equal(premiere(rpc), PREMIER, 'recu illisible et pourtant debut ' + premiere(rpc));
  /* la meme entree, naissance remise a null : la passe suivante doit relire la preuve (rien n a ete grave a tort) */
  const e = m.cache.get(NFLXC.jeton); e.naissance = null; e.jusqua = null; e.soldes = new Map();
  act.recu = true; rpc.fenetresNaissance.length = 0;
  await m.reconstruireHolders(NFLXC.jeton);
  assert.equal(premiere(rpc), NFLXC.bloc, 'passe suivante : debut ' + premiere(rpc));
});
await cas('C11 TEMOIN jeton sans preuve d action : aucune preuve rejouee, PREMIER_BLOCK_TB', async () => {
  const rpc = noeud({ actions: [NFLXC], mints: [{ jeton: NFLXC.jeton, bloc: PREMIER + 10, v: 1n }] });
  const m = monter(rpc);
  await m.reconstruireHolders(NFLXC.jeton);
  assert.equal(premiere(rpc), PREMIER);
  assert.equal(m.appelsPreuve.n, 0);
});

/* ── C12-C13 (2026-10-25, garde) : une naissance cherchee plus haut que la creation connue est oubliee et recherchee ──
 * Forme PROD (17:2x UTC) : NVDAc « a replay is running but 807 window(s) were refused » — naissance posee, jusqua null. */
await cas('C12 en memoire : naissance posee depuis le plancher (mint posterieur) -> oubliee, recherchee depuis la creation prouvee', async () => {
  const VRAI = NVDAC.bloc + 500, FAUX = PREMIER + 100;
  const rpc = noeud({ actions: [NVDAC], mints: [{ jeton: NVDAC.jeton, bloc: VRAI, v: 10n }, { jeton: NVDAC.jeton, bloc: FAUX, v: 5n }] });
  const m = monter(rpc, preuve(NVDAC));
  m.cache.set(NVDAC.jeton, { soldes: new Map([[A, 5n]]), naissance: FAUX, naissanceDepuis: PREMIER, jusqua: null, ratees: 807, lu: null, enCours: false, rechercheNaissance: null });
  const e = await m.reconstruireHolders(NVDAC.jeton);
  assert.equal(e.naissance, VRAI, 'naissance gardee ' + e.naissance + ' (cherchee depuis ' + PREMIER + ', creation prouvee ' + NVDAC.bloc + ')');
  assert.equal(e.naissanceDepuis, NVDAC.bloc);
});
await cas('C13 TEMOIN block sans creation connue, entree sans naissanceDepuis : gardee telle quelle (comportement d avant)', async () => {
  const TB = '0xb20000000000000000000016d09cd53724fc0601';
  const rpc = noeud({ mints: [{ jeton: TB, bloc: PREMIER + 10, v: 1n }] });
  const m = monter(rpc);
  m.cache.set(TB, { soldes: new Map([[A, 1n]]), naissance: PREMIER + 10, jusqua: TETE - 1, ratees: 0, lu: null, enCours: false });
  const e = await m.reconstruireHolders(TB);
  assert.equal(e.naissance, PREMIER + 10);
  assert.equal(rpc.fenetresNaissance.length, 0, 'une recherche de naissance a ete relancee');
});

await cas('C14 la ROUTE ne sert pas une naissance douteuse deja complete en memoire (avant que la passe ne l oublie)', async () => {
  const FAUX = PREMIER + 100;
  const rpc = noeud({ actions: [NVDAC], mints: [{ jeton: NVDAC.jeton, bloc: NVDAC.bloc + 500, v: 10n }, { jeton: NVDAC.jeton, bloc: FAUX, v: 5n }] });
  const m = monter(rpc, preuve(NVDAC));
  m.cache.set(NVDAC.jeton, { soldes: new Map([[A, 5n]]), naissance: FAUX, naissanceDepuis: PREMIER, jusqua: TETE - 1, ratees: 0, lu: null, enCours: false });
  const j = JSON.parse(await m.holdersCorps(NVDAC.jeton));
  assert.notEqual(j.naissance, FAUX, 'la route sert la naissance ' + j.naissance + ' cherchee depuis le plancher : ' + j.etat + ' — ' + j.pourquoi);
  assert.ok(!Array.isArray(j.detenteurs), 'la route sert des parts depuis une naissance douteuse');
});

console.log((n - rates.length) + '/' + n + ' cas verts' + (rates.length ? ' — ROUGES : ' + rates.join(' | ') : ''));
process.exit(rates.length ? 1 : 0);
