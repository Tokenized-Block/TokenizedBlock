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
  + '\n' + entre('async function reconstruireHolders(jeton) {', /\r?\n\}\r?\n/);
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
function noeud({ creations = [], mints = [], refuse = () => false } = {}) {
  const fenetresNaissance = [];
  const rpc = async (methode, params) => {
    if (methode === 'eth_blockNumber') return hx(TETE);
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
function monter(rpc) {
  const PARAMS = ['rpcServeur', 'GRAINE_ROUTEUR', 'GRAINE_JUSQUA', 'PLANCHER_ROUTEUR', 'PREMIER_BLOCK_TB', 'noterTeteLue', 'confronterReprise',
    'RETARD_MAX_INDEX', 'PAS_ROUTEUR', 'lecteurLogs', 'scannerNesDuRouteur', 'REPRISES_LECTURE_MS', 'archiveEpuisee', 'noterProgresIndex',
    'holdersCache', 'HOLDERS_MAX', 'lireNaissance', 'naissanceDuJeton', 'passeIncrementale', 'ecrireHolders'];
  const cache = new Map();
  const f = new Function(...PARAMS, '"use strict";\n' + tranche
    + "\n; return { routeurEtat, etendreBlocksRouteur, reconstruireHolders, noterCreationsLues: typeof noterCreationsLues === 'function' ? noterCreationsLues : null };");
  const m = f(rpc, GRAINE_ROUTEUR, TETE - 2000, PLANCHER_ROUTEUR, PREMIER, () => {}, () => 'VERIFIEE',
    RETARD_MAX_INDEX, 2000, () => ({ rpc, suivi: { essais: 0 }, nonEnvoyee: () => false }), scannerNesDuRouteur, [], () => false, () => {},
    cache, 200, S.lireNaissance, S.naissanceDuJeton, S.passeIncrementale, () => {});
  m.cache = cache;
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
await cas('C6 bloc sous PREMIER_BLOCK_TB -> PREMIER ; deux blocs pour un jeton -> le plus BAS', async () => {
  const m0 = monter(noeud());
  assert.equal(typeof m0.noterCreationsLues, 'function', 'noterCreationsLues absente du fichier livre');
  const J2 = '0xb20' + '0'.repeat(33) + 'c6c6';
  const rpc = noeud({ mints: [{ jeton: JETON_NEUF, bloc: PREMIER + 10, v: 1n }, { jeton: J2, bloc: TETE - 5000, v: 1n }] });
  const m = monter(rpc);
  m.noterCreationsLues([{ jeton: JETON_NEUF, bloc: PREMIER - 1 }, { jeton: J2, bloc: TETE - 100 }, { jeton: J2, bloc: TETE - 5000 }]);
  await m.reconstruireHolders(JETON_NEUF);
  assert.equal(premiere(rpc), PREMIER, 'un bloc sous le plancher a servi de debut : ' + premiere(rpc));
  rpc.fenetresNaissance.length = 0;
  const e2 = await m.reconstruireHolders(J2);
  assert.equal(premiere(rpc), TETE - 5000, 'debut ' + premiere(rpc) + ' : pas le plus bas des deux blocs lus');
  assert.equal(e2.naissance, TETE - 5000);
});

console.log((n - rates.length) + '/' + n + ' cas verts' + (rates.length ? ' — ROUGES : ' + rates.join(' | ') : ''));
process.exit(rates.length ? 1 : 0);
