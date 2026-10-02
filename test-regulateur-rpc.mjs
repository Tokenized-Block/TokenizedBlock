/* test-regulateur-rpc.mjs — LES NOEUDS PUBLICS : NE PAS ENVOYER CE QUI SERA REFUSE, ET RALENTIR APRES UN 429.
 *
 * ⛔⛔ MESURE DU 2026-10-02 (onglet Feed, navigateur sans tete, 120 s) : 124 erreurs console, dont
 *     112 HTTP 429 (debit), 9 HTTP 400 de drpc (plage > ~100 blocs, sonde directe : 100 -> 200,
 *     120 -> 400) et 3 HTTP 403 de publicnode (getLogs a 50 adresses, plafond mesure : 9).
 *
 * ⛔ CE TEST EXECUTE LE CODE LIVRE : le module, puis `rpcReseau` EXTRAIT de app.html avec un
 *   regulateur reel et un `fetch` de laboratoire. Chaque garde a son TEMOIN NEGATIF : le meme
 *   scenario sans regulateur (ou avec une capacite mutee) DOIT donner l ancien comportement.
 * ⛔ CE QUE CE TEST NE PROUVE PAS : les quotas reels des fournisseurs, ni que l ecart choisi suffit
 *   sur tous les reseaux. Ca, c est la mesure en navigateur qui le dit (avant / apres, 2 min).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { CAPACITES_LOGS, noeudPeutServir, creerRegulateur, hoteDe } from './regulateur-rpc.js';

let n = 0;
const v = (nom, fn) => { try { fn(); n++; } catch (e) { e.message = nom + ' — ' + e.message; throw e; } };
const PUB = 'https://base-rpc.publicnode.com', ORG = 'https://mainnet.base.org', DRPC = 'https://base.drpc.org';
const hx = (x) => '0x' + x.toString(16);
const logs = (de, a, adr = '0x498581ff718922c3f8e6a244956af099b2652b2b') => [{ address: adr, fromBlock: hx(de), toBlock: hx(a) }];
const adresses = (k) => Array.from({ length: k }, (_, i) => '0xb2' + String(i).padStart(38, '0'));

/* ── 1. capacites : les bornes mesurees, des deux cotes ─────────────────────────────────────── */
v('drpc sert 100 blocs', () => assert.equal(noeudPeutServir(DRPC, 'eth_getLogs', logs(1000, 1099)), true));
v('drpc ne recoit pas 101 blocs', () => assert.equal(noeudPeutServir(DRPC, 'eth_getLogs', logs(1000, 1100)), false));
v('publicnode sert 9 adresses', () => assert.equal(noeudPeutServir(PUB, 'eth_getLogs', logs(1, 2, adresses(9))), true));
v('publicnode ne recoit pas 10 adresses', () => assert.equal(noeudPeutServir(PUB, 'eth_getLogs', logs(1, 2, adresses(10))), false));
v('publicnode ne recoit pas l archive (> 10 000 blocs sous la tete)', () => {
  assert.equal(noeudPeutServir(PUB, 'eth_getLogs', logs(100, 109), 10100), true);
  assert.equal(noeudPeutServir(PUB, 'eth_getLogs', logs(100, 109), 10101), false);
});
v('tete inconnue : la profondeur ne decide rien', () => assert.equal(noeudPeutServir(PUB, 'eth_getLogs', logs(1, 9), 0), true));
v('un eth_call va partout', () => assert.equal(noeudPeutServir(DRPC, 'eth_call', [{ to: '0x1' }]), true));
v('un noeud inconnu n est jamais exclu', () => assert.equal(noeudPeutServir('https://x.example', 'eth_getLogs', logs(1, 9999)), true));
v('mainnet.base.org n a pas de capacite inventee', () => assert.equal(CAPACITES_LOGS[hoteDe(ORG)], undefined));

/* ── 2. ordonner : filtre, jamais jusqu a vide ; ralenti = derriere, jamais retire ──────────── */
const horloge = () => { let t = 1000; return { maintenant: () => t, dormir: async (ms) => { t += ms; }, avancer: (ms) => { t += ms; } }; };
v('une plage de 500 blocs ne part plus chez drpc', () => {
  const r = creerRegulateur(horloge());
  assert.deepEqual(r.ordonner([PUB, ORG, DRPC], 'eth_getLogs', logs(1, 500)), [PUB, ORG]);
});
v('si AUCUN noeud n est capable, la liste revient intacte (on ne vide jamais)', () => {
  const r = creerRegulateur(horloge());
  assert.deepEqual(r.ordonner([DRPC], 'eth_getLogs', logs(1, 500)), [DRPC]);
});
v('apres un 429, le noeud passe DERRIERE, puis revient a sa place', () => {
  const h = horloge(); const r = creerRegulateur(h);
  r.noter(PUB, 'debit');
  assert.deepEqual(r.ordonner([PUB, ORG, DRPC], 'eth_blockNumber', []), [ORG, DRPC, PUB]);
  h.avancer(10000);
  assert.deepEqual(r.ordonner([PUB, ORG, DRPC], 'eth_blockNumber', []), [PUB, ORG, DRPC]);
});
v('un refus de FORME (400) ne ralentit pas le noeud', () => {
  const r = creerRegulateur(horloge()); r.noter(PUB, 'autre');
  assert.deepEqual(r.ordonner([PUB, ORG], 'eth_blockNumber', []), [PUB, ORG]);
});

/* ── 3. creneau : ecart, adaptation, borne ────────────────────────────────────────────────── */
const CRENEAUX = [];
async function creneaux(r, h, url, k) { const t = []; for (let i = 0; i < k; i++) { const lib = await r.creneau(url); t.push(h.maintenant()); lib(); } return t; }
CRENEAUX.push(['ecart de base : 150 ms entre deux requetes au meme noeud', async () => {
  const h = horloge(); const r = creerRegulateur(h);
  const t = await creneaux(r, h, ORG, 3);
  assert.deepEqual(t.map((x) => x - t[0]), [0, 150, 300]);
}]);
CRENEAUX.push(['deux noeuds differents ne s attendent pas', async () => {
  const h = horloge(); const r = creerRegulateur(h);
  const a = await r.creneau(ORG); const b = await r.creneau(PUB);
  assert.equal(h.maintenant(), 1000); a(); b();
}]);
CRENEAUX.push(['un 429 allonge l ecart (min 300 ms, +50 %), un succes le resserre', async () => {
  const h = horloge(); const r = creerRegulateur(h);
  r.noter(ORG, 'debit');
  assert.equal(r.instantane()['mainnet.base.org'].ecart, 300);
  r.noter(ORG, 'debit');
  assert.equal(r.instantane()['mainnet.base.org'].ecart, 450);
  for (let i = 0; i < 40; i++) r.noter(ORG, 'ok');
  assert.equal(r.instantane()['mainnet.base.org'].ecart, 150);
}]);
CRENEAUX.push(['l ecart est BORNE a 1,2 s, et l attente a 3 s : jamais de gel', async () => {
  const h = horloge(); const r = creerRegulateur(h);
  for (let i = 0; i < 20; i++) r.noter(ORG, 'debit');
  assert.equal(r.instantane()['mainnet.base.org'].ecart, 1200);
  const avant = h.maintenant(); (await r.creneau(ORG))();
  assert.ok(h.maintenant() - avant <= 3000, 'attente ' + (h.maintenant() - avant));
}]);
CRENEAUX.push(['concurrence : au plus 2 en vol par noeud', async () => {
  const h = horloge(); const r = creerRegulateur({ ...h, ecartMs: 0 });
  const a = await r.creneau(ORG); await r.creneau(ORG);
  let troisieme = false; const p = r.creneau(ORG).then((lib) => { troisieme = true; lib(); });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(troisieme, false, 'un troisieme creneau a ete donne sans liberation');
  a(); await p; assert.equal(troisieme, true);
}]);

/* ── 4. rpcReseau REEL + regulateur : drpc epargne, noeud en 429 contourne ─────────────────── */
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const debut = html.indexOf('async function rpcReseau(');
assert.ok(debut > 0, 'rpcReseau introuvable');
let prof = 0, fin = -1, dansTexte = null;
for (let i = html.indexOf('{', debut); i < html.length; i++) {
  const c = html[i], p = html[i - 1];
  if (dansTexte) { if (c === dansTexte && p !== '\\') dansTexte = null; continue; }
  if (c === '"' || c === "'" || c === '`') { dansTexte = c; continue; }
  if (c === '{') prof++; else if (c === '}') { prof--; if (!prof) { fin = i + 1; break; } }
}
const source = html.slice(debut, fin);
assert.match(source, /throw derniere \|\| new Error\('RPC unreachable on all nodes'\)/, 'extraction tronquee');
assert.match(source, /rpcRegul\.ordonner\(/, 'rpcReseau n utilise pas le regulateur');
function fabriquer(regul, reponses) {
  const appels = [];
  const fetchLabo = async (url) => {
    appels.push(url);
    const r = reponses(url, appels.length);
    return { status: r.statut, ok: r.statut >= 200 && r.statut < 300, json: async () => r.corps };
  };
  const RESEAUX = { 8453: { rpc: PUB, secours: [ORG, DRPC], b20Rpc: ORG, logsMultiRpc: ORG, logsArchiveRpc: ORG } };
  const compte = { reseau: 0, cache: 0, fusion: 0, reprises: 0, reprisesOk: 0 };
  const faire = new Function('RESEAUX', 'CHAINE', 'ESSAIS_429', 'fetch', 'setTimeout', 'rpcCompte', 'rpcRegul',
    'etatProfondeur', 'ordreNoeuds', 'rpcTete', 'tourEthCall',
    'let idRpc = 0; return (' + source + ');')(
    RESEAUX, 8453, 5, fetchLabo, (k) => k(), compte, regul,
    () => ({ etat: 'RECENTE' }), (x) => x, { n: 0 }, 0);
  return { faire, appels };
}
CRENEAUX.push(['⛔⛔ un getLogs de 500 blocs refuse par publicnode et base.org NE finit PAS chez drpc', async () => {
  const rep = (url) => (url === DRPC ? { statut: 400 } : { statut: 429 });
  const avec = fabriquer(creerRegulateur(horloge()), rep);
  await assert.rejects(() => avec.faire('eth_getLogs', logs(1, 500)));
  assert.ok(!avec.appels.includes(DRPC), 'drpc a recu une plage qu il refuse : ' + avec.appels.join(' → '));
  /* TEMOIN NEGATIF : sans regulateur, la meme lecture finit bien chez drpc (l ancien 400). */
  const sans = fabriquer(null, rep);
  await assert.rejects(() => sans.faire('eth_getLogs', logs(1, 500)));
  assert.ok(sans.appels.includes(DRPC), 'temoin : sans regulateur, drpc aurait du etre essaye');
}]);
CRENEAUX.push(['⛔⛔ apres un 429 de publicnode, la lecture SUIVANTE commence ailleurs', async () => {
  const rep = (url, k) => (url === PUB && k === 1 ? { statut: 429 } : { statut: 200, corps: { result: '0x1' } });
  const avec = fabriquer(creerRegulateur(horloge()), rep);
  assert.equal(await avec.faire('eth_blockNumber', []), '0x1');
  assert.equal(await avec.faire('eth_blockNumber', []), '0x1');
  assert.deepEqual(avec.appels, [PUB, ORG, ORG], 'la seconde lecture est retournee frapper le noeud en 429');
  /* TEMOIN NEGATIF : sans regulateur, la seconde lecture repart chez publicnode. */
  const sans = fabriquer(null, rep);
  await sans.faire('eth_blockNumber', []); await sans.faire('eth_blockNumber', []);
  assert.deepEqual(sans.appels, [PUB, ORG, PUB]);
}]);
CRENEAUX.push(['un 400 n est toujours PAS rejoue, regulateur ou pas', async () => {
  const avec = fabriquer(creerRegulateur(horloge()), () => ({ statut: 400 }));
  await assert.rejects(() => avec.faire('eth_blockNumber', []), /HTTP 400/);
  assert.deepEqual(avec.appels, [PUB, ORG, DRPC], 'un 400 a ete rejoue sur le meme noeud');
}]);
CRENEAUX.push(['TEMOIN NEGATIF par mutation : la borne drpc remontee a 1 000 laisse passer la plage de 500', async () => {
  /* ⛔ Une garde qui n a jamais rougi ne garde rien : on mute le MODULE LIVRE (texte relu, borne
   *   changee) et la meme question doit changer de reponse. Sinon le test lirait autre chose. */
  const brut = readFileSync(new URL('./regulateur-rpc.js', import.meta.url), 'utf8');
  assert.ok(brut.includes("'base.drpc.org': Object.freeze({ plageMax: 100 })"), 'borne drpc introuvable dans le module');
  const mutant = await import('data:text/javascript,' + encodeURIComponent(brut.replace('plageMax: 100', 'plageMax: 1000')));
  assert.equal(mutant.noeudPeutServir(DRPC, 'eth_getLogs', logs(1, 500)), true, 'la mutation n a rien change : test aveugle');
  assert.equal(noeudPeutServir(DRPC, 'eth_getLogs', logs(1, 500)), false, 'la vraie borne doit refuser');
}]);

for (const [nom, fn] of CRENEAUX) { try { await fn(); n++; } catch (e) { e.message = nom + ' — ' + e.message; throw e; } }
assert.equal(n, 22, 'compte de cas inattendu : ' + n);
console.log('ok regulateur-rpc — ' + n + ' cas : capacites mesurees, ecart adaptatif borne, rpcReseau REEL execute');
console.log('⚠️ NE PROUVE PAS les quotas reels des fournisseurs : la mesure navigateur avant/apres le dit.');
