/* test-pause-logs-base-org-20261010.mjs - UN NOEUD QUI REFUSE TOUS LES getLogs PAR QUOTA N EST PLUS ESSAYE 6 FOIS PAR LECTURE.
 *
 * MESURE 2026-10-10 (onglet Feed, 60 s) : 28 eth_getLogs sur 28 vers mainnet.base.org -> 429 'request limit reached'.
 * Seul dans la liste (50 adresses, 1 000 blocs), chaque lecture y perdait 6 essais (~22 s) avant le decoupage en lots de 9.
 * CE TEST EXECUTE le module livre et rpcReseau EXTRAIT de app.html (TB_APP / TB_REGUL : autres fichiers, pour la preuve rouge).
 * IL AFFIRME : (1) apres K=3 refus de quota la pause s arme, une sonde apres T ; (2) la 2e lecture ne touche plus base.org et
 * sert l UNION des lots de 9 ; (3) tout refuse = rejet, JAMAIS une liste vide ; (4) 'over rate limit' et eth_call ne pausent pas.
 * NE PROUVE PAS : que K=3 / T=5 min sont les bons reglages (ESTIMATION) ; la mesure navigateur avant/apres le dira.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const APP = process.env.TB_APP || new URL('./app.html', import.meta.url);
const REG = process.env.TB_REGUL || new URL('./regulateur-rpc.js', import.meta.url);
const brutReg = readFileSync(REG, 'utf8');
const charger = (txt) => import('data:text/javascript,' + encodeURIComponent(txt));
const PUB = 'https://base-rpc.publicnode.com', ORG = 'https://mainnet.base.org', DRPC = 'https://base.drpc.org';
const hx = (x) => '0x' + x.toString(16);
const adresses = (k) => Array.from({ length: k }, (_, i) => '0xb2' + String(i).padStart(38, '0'));
const horloge = () => { let t = 1000; return { maintenant: () => t, dormir: async (ms) => { t += ms; }, avancer: (ms) => { t += ms; } }; };
const QUOTA = { statut: 429, corps: { jsonrpc: '2.0', id: 1, error: { code: -32011, message: 'request limit reached' } } };
function extraire(html) {
  const debut = html.indexOf('async function rpcReseau(');
  let prof = 0, fin = -1, dans = null;
  for (let i = html.indexOf('{', debut); i < html.length; i++) {
    const c = html[i], p = html[i - 1];
    if (dans) { if (c === dans && p !== '\\') dans = null; continue; }
    if (c === '"' || c === "'" || c === '`') { dans = c; continue; }
    if (c === '{') prof++; else if (c === '}') { prof--; if (!prof) { fin = i + 1; break; } }
  }
  const s = html.slice(debut, fin);
  assert.match(s, /throw derniere \|\| new Error\('RPC unreachable on all nodes'\)/, 'extraction tronquee');
  return s;
}
function fabriquer(source, regul, reponses) {
  const appels = [];
  const fetchLabo = async (url, init) => {
    const corps = JSON.parse(init.body); appels.push({ url, n: (corps.params[0] && corps.params[0].address || []).length, m: corps.method });
    const r = reponses(url, corps);
    return { status: r.statut, ok: r.statut >= 200 && r.statut < 300, json: async () => { if (r.corps === undefined) throw new Error('corps illisible'); return r.corps; } };
  };
  const RESEAUX = { 8453: { rpc: PUB, secours: [ORG, DRPC], b20Rpc: ORG, logsMultiRpc: ORG, logsArchiveRpc: ORG } };
  const compte = { reseau: 0, cache: 0, fusion: 0, reprises: 0, reprisesOk: 0 };
  let faire;
  const rpc = (m, p) => faire(m, p);
  faire = new Function('RESEAUX', 'CHAINE', 'ESSAIS_429', 'fetch', 'setTimeout', 'rpcCompte', 'rpcRegul',
    'etatProfondeur', 'ordreNoeuds', 'rpcTete', 'tourEthCall', 'rpc',
    'let idRpc = 0; return (' + source + ');')(RESEAUX, 8453, 5, fetchLabo, (k) => k(), compte, regul,
    () => ({ etat: 'RECENTE' }), (x) => x, { n: 0 }, 0, rpc);
  return { faire, appels };
}
const filtre50 = () => [{ address: adresses(50), topics: ['0xddf2'], fromBlock: hx(1000), toBlock: hx(1999) }];
/* publicnode sert <= 9 adresses : un log par adresse demandee ; base.org : quota ; drpc : jamais atteint (1 000 blocs) */
const repNormal = (url, c) => (url === ORG ? QUOTA : url === PUB
  ? (c.params[0].address.length > 9 ? { statut: 403, corps: {} } : { statut: 200, corps: { result: c.params[0].address.map((a) => ({ address: a })) } })
  : { statut: 400, corps: {} });

async function scenario(source, mod) {
  const h = horloge(); const regul = mod.creerRegulateur(h);
  const f = fabriquer(source, regul, repNormal);
  const r1 = await f.faire('eth_getLogs', filtre50());
  const org1 = f.appels.filter((a) => a.url === ORG).length;
  const avant2 = f.appels.length;
  const r2 = await f.faire('eth_getLogs', filtre50());
  const org2 = f.appels.slice(avant2).filter((a) => a.url === ORG).length;
  return { r1, r2, org1, org2, regul, h, f };
}

let n = 0; const cas = async (nom, fn) => { try { await fn(); n++; } catch (e) { e.message = nom + ' - ' + e.message; throw e; } };
const source = extraire(readFileSync(APP, 'utf8'));
const mod = await charger(brutReg);

await cas('(1) regulateur : 3 refus de QUOTA arment la pause getLogs, une sonde apres T, un succes la leve', async () => {
  const h = horloge(); const r = mod.creerRegulateur(h);
  assert.equal(typeof r.passer, 'function', 'pas de pause par methode dans le regulateur');
  for (let i = 0; i < 2; i++) r.noter(ORG, 'debit', { methode: 'eth_getLogs', quota: true });
  assert.equal(r.passer(ORG, 'eth_getLogs'), null, 'pause armee avant K');
  r.noter(ORG, 'debit', { methode: 'eth_getLogs', quota: true });
  assert.match(String(r.passer(ORG, 'eth_getLogs')), /paused on mainnet\.base\.org/);
  assert.equal(r.passer(ORG, 'eth_call'), null, 'eth_call ne doit pas etre en pause');
  assert.equal(r.passer(PUB, 'eth_getLogs'), null, 'un autre noeud ne doit pas etre en pause');
  h.avancer(5 * 60 * 1000);
  assert.equal(r.passer(ORG, 'eth_getLogs'), null, 'pas de sonde apres T');
  assert.notEqual(r.passer(ORG, 'eth_getLogs'), null, 'deux sondes de suite');
  r.noter(ORG, 'ok', { methode: 'eth_getLogs' });
  assert.equal(r.passer(ORG, 'eth_getLogs'), null, 'un succes ne leve pas la pause');
  assert.equal(r.instantane()['mainnet.base.org'].sondesLogs, 1);
});
await cas('(4) over rate limit (etranglement) n arme pas la pause', async () => {
  const r = mod.creerRegulateur(horloge());
  for (let i = 0; i < 10; i++) r.noter(ORG, 'debit', { methode: 'eth_getLogs', quota: false });
  for (let i = 0; i < 10; i++) r.noter(ORG, 'debit');
  assert.equal(r.passer(ORG, 'eth_getLogs'), null);
});
await cas('(2) rpcReseau REEL : base.org touche <= 3 fois puis plus du tout ; union des lots de 9 servie', async () => {
  const s = await scenario(source, mod);
  assert.ok(s.org1 <= 3, '1re lecture : ' + s.org1 + ' requetes base.org (6 avant le correctif)');
  assert.equal(s.org2, 0, '2e lecture : base.org encore frappe ' + s.org2 + ' fois');
  for (const r of [s.r1, s.r2]) { assert.ok(Array.isArray(r)); assert.equal(r.length, 50, 'union incomplete'); }
  assert.ok(s.f.appels.filter((a) => a.url === PUB).every((a) => a.n <= 9), 'publicnode a recu > 9 adresses');
});
await cas('(3) tout refuse : la lecture REJETTE, jamais une liste vide - avant ET pendant la pause', async () => {
  const h = horloge(); const regul = mod.creerRegulateur(h);
  const f = fabriquer(source, regul, (url) => (url === ORG ? QUOTA : { statut: 400, corps: {} }));
  for (let k = 0; k < 3; k++) await assert.rejects(() => f.faire('eth_getLogs', filtre50()));
  const f1 = fabriquer(source, regul, (url) => (url === ORG ? QUOTA : { statut: 400, corps: {} }));
  await assert.rejects(() => f1.faire('eth_getLogs', [{ address: adresses(1)[0], fromBlock: hx(1), toBlock: hx(50) }]),
    (e) => /paused|HTTP 4/.test(e.message));
  assert.ok(regul.enPauseLogs(ORG, 'eth_getLogs'), 'pause non armee');
});
await cas('(5) 429 a corps ILLISIBLE : comportement d avant (pas de pause)', async () => {
  const r = mod.creerRegulateur(horloge());
  const f = fabriquer(source, r, (url, c) => (url === ORG ? { statut: 429 } : repNormal(url, c)));
  await f.faire('eth_getLogs', filtre50());
  assert.equal(r.enPauseLogs(ORG, 'eth_getLogs'), false);
});
await cas('MUTANTS : chaque garde, retiree, fait rougir le scenario (2)', async () => {
  const mutants = [
    ['saut retire', source.replace("if (pause) { if (!derniere) derniere = new Error(pause); break; }", ''), brutReg],
    ['regex quota cassee', source.replace('/request limit reached/i', '/jamais/i'), brutReg],
    ['K jamais atteint', source, brutReg.replace('pauseLogsApres = 3', 'pauseLogsApres = 99')],
    ['T nul', source, brutReg.replace('pauseLogsMs = 5 * 60 * 1000', 'pauseLogsMs = 0')],
  ];
  for (const [nom, src, reg] of mutants) {
    assert.notEqual(src + reg, source + brutReg, 'mutant sans effet : ' + nom);
    const s = await scenario(src, await charger(reg));
    assert.ok(s.org2 > 0, 'mutant survivant : ' + nom);
  }
});
assert.equal(n, 6, 'compte de cas : ' + n);
console.log('ok pause-logs-base-org - ' + n + ' cas, 4 mutants tues ; NE PROUVE PAS les reglages K=3/T=5 min (estimation)');