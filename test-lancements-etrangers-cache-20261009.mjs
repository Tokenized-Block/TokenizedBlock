/* test-lancements-etrangers-cache-20261009.mjs — /api/lancements-etrangers : 6 CLES DE CACHE AU PLUS, UN SEUL SCAN EN VOL PAR CLE.
 *
 * Audit du 2026-10-09 (budget du noeud d archive) : h n etait que borne, pas arrondi — h=1.0001, 1.0002... ouvraient chacun une cle
 * neuve, donc un scan entier chacun (h=6 : 77 getLogs), et la Map grossissait sans fin ; deux requetes identiques en meme temps
 * lancaient chacune leur scan (le cache n etait ecrit qu a la fin).
 * Les gardes, EXECUTEES : la ROUTE et lancementsEtrangers sont extraites du serveur-web.js livre et jouees ensemble, comme en prod,
 * avec un faux rpcServeur / scannerLancements / horloge.
 *   A1 h fractionnaire : une seule cle, un seul scan ;
 *   A2 toute la plage de h : un entier 1..6, deBloc = tete - h*1800, 6 cles au plus ;
 *   A3 requetes identiques simultanees : un seul scan, la meme reponse pour toutes ;
 *   A4 un scan qui echoue : partage, DIT (ok:false + raison), jamais mis en cache — la requete suivante relance ;
 *   A5 le cache de 5 min tient toujours ; A6 des fenetres refusees restent complet:false (une fenetre refusee n est pas vide) ;
 *   A7 1 000 valeurs de h au hasard (graine fixe) : toujours 6 cles au plus.
 * ⛔ BORNE : le serveur ne demarre pas ici ; aucune lecture de chaine. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const i = src.indexOf('const etrangersCache = new Map();');
const k = src.indexOf('async function lancementsEtrangers(', i);
const finF = /\r?\n\}\r?\n/.exec(src.slice(k));
assert.ok(i > 0 && k > i && finF, 'lancementsEtrangers introuvable');
const fonction = src.slice(i, k + finF.index + finF[0].length);
const r0 = src.indexOf("if (chemin === '/api/lancements-etrangers') {");
const finR = /\r?\n    return;\r?\n  \}/.exec(src.slice(r0));
assert.ok(r0 > 0 && finR, 'route /api/lancements-etrangers introuvable');
const route = src.slice(r0, r0 + finR.index + finR[0].length);

/* chaque cas est joue meme si un precedent est rouge : la preuve « rouge avant » montre TOUS les cas, pas le premier */
let n = 0, ko = 0;
const cas = async (titre, f) => {
  n++;
  try { await f(); console.log('  ok ' + titre); } catch (e) { ko++; console.error('✗ ' + titre + '\n    ' + String((e && e.message) || e).split('\n')[0]); }
};
const dort = (ms) => new Promise((ok) => setTimeout(ok, ms));
const TETE = 52400000;
const scanOk = (o, ratees = 0) => ({ lancements: [{ jeton: '0xab', bloc: o.aBloc }], fenetres: 77, ratees, nonAffines: 0, parLaunchpad: { x: 1 } });

function monter(scanner) {
  const horloge = { t: 1.8e12 };
  class D extends Date { static now() { return horloge.t; } }
  const appels = { tete: 0, scans: [] };
  const rpcServeur = async (m) => {
    if (m === 'eth_blockNumber') { appels.tete++; return '0x' + TETE.toString(16); }
    throw new Error('lecture inattendue : ' + m);
  };
  const scannerLancements = async (o) => { appels.scans.push(o); return scanner(o); };
  const { lancementsEtrangers, etrangersCache } = new Function('rpcServeur', 'scannerLancements', 'Date',
    fonction + '\n; return { lancementsEtrangers, etrangersCache };')(rpcServeur, scannerLancements, D);
  const jouerRoute = new Function('chemin', 'req', 'res', 'lancementsEtrangers', route);
  const appeler = (h) => new Promise((ok) => {
    const r = { code: null, corps: null };
    const res = { writeHead: (c) => { r.code = c; }, end: (b) => { r.corps = JSON.parse(b); ok(r); } };
    const url = '/api/lancements-etrangers' + (h === undefined ? '' : '?h=' + encodeURIComponent(h));
    jouerRoute('/api/lancements-etrangers', { url }, res, lancementsEtrangers);
  });
  return { appeler, etrangersCache, appels, horloge };
}

await cas('A1 h fractionnaire (1.0001, 1.0002...) : une seule cle, un seul scan', async () => {
  const m = monter((o) => scanOk(o));
  const hs = Array.from({ length: 40 }, (_, j) => (1 + (j + 1) / 10000).toFixed(4)).concat(['1', '1.4', '0.6']);
  const rs = [];
  for (const h of hs) rs.push(await m.appeler(h));
  assert.equal(m.appels.scans.length, 1, hs.length + ' requetes successives ont lance ' + m.appels.scans.length + ' scans');
  assert.equal(m.etrangersCache.size, 1, m.etrangersCache.size + ' cles de cache : ' + [...m.etrangersCache.keys()].join(', ').slice(0, 80));
  rs.forEach((r, j) => {
    assert.equal(r.corps.ok, true);
    assert.equal(r.corps.heures, 1, 'h=' + hs[j] + ' servi comme ' + r.corps.heures + ' h');
  });
});

await cas('A2 toute la plage de h : un entier 1..6, deBloc = tete - h*1800, 6 cles au plus', async () => {
  const m = monter((o) => scanOk(o));
  const attendu = { '': 1, abc: 1, '-5': 1, 0: 1, 0.4: 1, 0.6: 1, 1.49: 1, 1.5: 2, 2: 2, 2.5: 3, 3.2: 3, 3.5: 4, 4.49: 4, 4.7: 5, 5.49: 5, 5.5: 6,
    6: 6, 6.4: 6, 7: 6, '1e9': 6, Infinity: 6, NaN: 1, '0x5': 5 };
  const sansH = await m.appeler(undefined);
  assert.equal(sansH.corps.heures, 1, 'sans h : 1 h');
  for (const [h, hAttendu] of Object.entries(attendu)) {
    const r = await m.appeler(h);
    assert.equal(r.corps.heures, hAttendu, 'h=' + JSON.stringify(h) + ' -> ' + r.corps.heures);
    assert.ok(Number.isInteger(r.corps.heures) && r.corps.heures >= 1 && r.corps.heures <= 6);
    assert.equal(r.corps.deBloc, TETE - hAttendu * 1800, 'h=' + h + ' : deBloc');
    assert.equal(r.corps.aBloc, TETE);
  }
  assert.ok(m.etrangersCache.size <= 6, m.etrangersCache.size + ' cles de cache');
  assert.equal(m.appels.scans.length, 6, 'un scan par heure entiere 1..6, pas un par valeur de h');
  assert.deepEqual(m.appels.scans.map((o) => TETE - o.deBloc).sort((a, b) => a - b), [1800, 3600, 5400, 7200, 9000, 10800]);
});

await cas('A3 5 requetes identiques simultanees : un seul scan, la meme reponse pour toutes', async () => {
  let lacher;
  const porte = new Promise((ok) => { lacher = ok; });
  const m = monter(async (o) => { await porte; return scanOk(o); });
  const enCours = [1, 2, 3, 4, 5].map(() => m.appeler('6'));
  await dort(20);
  assert.equal(m.appels.scans.length, 1, '5 requetes simultanees ont lance ' + m.appels.scans.length + ' scans');
  assert.equal(m.appels.tete, 1, 'la tete a ete lue ' + m.appels.tete + ' fois');
  lacher();
  const rs = await Promise.all(enCours);
  for (const r of rs) { assert.equal(r.code, 200); assert.deepEqual(r.corps, rs[0].corps); }
  assert.equal(rs[0].corps.ok, true);
  assert.equal(rs[0].corps.heures, 6);
  await m.appeler('6');
  assert.equal(m.appels.scans.length, 1, 'apres le scan partage, le cache sert');
});

await cas('A4 un scan qui echoue : partage, DIT, jamais mis en cache — la requete suivante relance', async () => {
  let lacher, fois = 0;
  const porte = new Promise((ok) => { lacher = ok; });
  const m = monter(async (o) => {
    if (++fois === 1) { await porte; throw new Error('request limit reached'); }
    return scanOk(o);
  });
  const enCours = [1, 2, 3].map(() => m.appeler('3'));
  await dort(20);
  assert.equal(m.appels.scans.length, 1, '3 requetes simultanees ont lance ' + m.appels.scans.length + ' scans');
  lacher();
  for (const r of await Promise.all(enCours)) {
    assert.equal(r.corps.ok, false, 'un echec servi comme un resultat');
    assert.match(r.corps.pourquoi, /request limit reached/);
    assert.equal(r.corps.lancements, undefined, 'un echec rendu comme une liste');
  }
  assert.equal(m.etrangersCache.size, 0, 'un echec a ete mis en cache');
  const r = await m.appeler('3');
  assert.equal(m.appels.scans.length, 2, 'apres un echec, la requete suivante doit relancer');
  assert.equal(r.corps.ok, true);
});

await cas('A5 le cache de 5 min tient toujours (299 s : servi ; 301 s : relu)', async () => {
  const m = monter((o) => scanOk(o));
  await m.appeler('2');
  m.horloge.t += 299000;
  await m.appeler('2');
  assert.equal(m.appels.scans.length, 1);
  m.horloge.t += 2000;
  await m.appeler('2');
  assert.equal(m.appels.scans.length, 2);
});

await cas('A6 des fenetres refusees : complet:false et leur nombre, servis tels quels (une fenetre refusee n est pas vide)', async () => {
  const m = monter((o) => scanOk(o, 14));
  const r = await m.appeler('6');
  assert.equal(r.corps.complet, false);
  assert.equal(r.corps.fenetresRatees, 14);
  assert.equal(r.corps.fenetres, 77);
});

await cas('A7 1 000 valeurs de h tirees au hasard (graine fixe) : cles dans {1..6}, 6 scans au plus, chaque reponse un entier 1..6', async () => {
  const m = monter((o) => scanOk(o));
  let g = 20261009;
  const alea = () => { g = (g * 1103515245 + 12345) % 2147483648; return g / 2147483648; };
  const formes = [
    () => (alea() * 8 - 1).toFixed(1 + Math.floor(alea() * 6)),   /* -1..7, 1 a 6 decimales */
    () => String(alea() * 1e7),                                      /* tres grand, fractionnaire */
    () => (-alea() * 100).toFixed(3),                                 /* negatif */
    () => (1 + alea() * 5).toExponential(4),                          /* 1..6 en notation e */
  ];
  for (let j = 0; j < 1000; j++) {
    const h = formes[j % formes.length]();
    const r = await m.appeler(h);
    assert.ok(Number.isInteger(r.corps.heures) && r.corps.heures >= 1 && r.corps.heures <= 6, 'h=' + h + ' -> ' + r.corps.heures);
  }
  const cles = [...m.etrangersCache.keys()];
  assert.ok(cles.every((x) => /^[1-6]$/.test(x)), 'cles hors 1..6 : ' + cles.filter((x) => !/^[1-6]$/.test(x)).slice(0, 5).join(', ') + ' (' + cles.length + ' cles)');
  assert.ok(m.appels.scans.length <= 6, '1 000 requetes ont lance ' + m.appels.scans.length + ' scans');
});

assert.equal(n, 7, 'le banc ne s est pas compte : ' + n + ' cas');
if (ko) { console.error('⛔ ' + ko + '/' + n + ' cas ROUGES'); process.exit(1); }
console.log('✓ ' + n + ' cas — h arrondi a 1..6 (6 cles au plus), un seul scan en vol par cle, un echec dit et jamais mis en cache');
