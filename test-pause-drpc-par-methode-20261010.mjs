/* test-pause-drpc-par-methode-20261010.mjs - base.drpc.org (re-QA : ~10-15 HTTP 429/min en navigateur) RECOIT LA MEME PAUSE MESUREE QUE base.org,
 * PAR NOEUD ET PAR METHODE. Execute le module livre et rpcReseau EXTRAIT de app.html (TB_APP / TB_REGUL : autres fichiers, preuve rouge).
 * AFFIRME : (1) apres 3 HTTP 429 a corps lisible sur eth_call, drpc n est plus essaye pour eth_call (repli publicnode servi) ; eth_getBalance
 *   et un autre noeud ne sont pas en pause ; (2) drpc SEUL : la pause ne saute jamais le dernier noeud - la requete part, le refus
 *   REJETTE (jamais un resultat vide) ; (3) un succes leve la pause ; mutants.
 * NE PROUVE PAS : le corps exact des 429 de drpc (suppose JSON lisible ; illisible = comportement d avant) ; K=3 / T=5 min (estimation).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const APP = process.env.TB_APP || new URL('./app.html', import.meta.url);
const REG = process.env.TB_REGUL || new URL('./regulateur-rpc.js', import.meta.url);
const brutReg = readFileSync(REG, 'utf8');
const charger = (txt) => import('data:text/javascript,' + encodeURIComponent(txt));
const PUB = 'https://base-rpc.publicnode.com', ORG = 'https://mainnet.base.org', DRPC = 'https://base.drpc.org';
const horloge = () => { let t = 1000; return { maintenant: () => t, dormir: async (ms) => { t += ms; }, avancer: (ms) => { t += ms; } }; };
const T429 = { statut: 429, corps: { jsonrpc: '2.0', id: 1, error: { code: 429, message: 'Too many requests' } } };
function extraire(html) {
  const debut = html.indexOf('async function rpcReseau(');
  let prof = 0, fin = -1, dans = null;
  for (let i = html.indexOf('{', debut); i < html.length; i++) {
    const c = html[i], p = html[i - 1];
    if (dans) { if (c === dans && p !== '\\') dans = null; continue; }
    if (c === '"' || c === "'" || c === '`') { dans = c; continue; }
    if (c === '{') prof++; else if (c === '}') { prof--; if (!prof) { fin = i + 1; break; } }
  }
  return html.slice(debut, fin);
}
function fabriquer(source, regul, reponses, reseau) {
  const appels = [];
  const fetchLabo = async (url, init) => {
    const corps = JSON.parse(init.body); appels.push({ url, m: corps.method });
    const r = reponses(url, corps);
    return { status: r.statut, ok: r.statut >= 200 && r.statut < 300, json: async () => { if (r.corps === undefined) throw new Error('illisible'); return r.corps; } };
  };
  const RESEAUX = { 8453: reseau };
  const compte = { reseau: 0, cache: 0, fusion: 0, reprises: 0, reprisesOk: 0 };
  let faire; const rpc = (m, p) => faire(m, p);
  faire = new Function('RESEAUX', 'CHAINE', 'ESSAIS_429', 'fetch', 'setTimeout', 'rpcCompte', 'rpcRegul',
    'etatProfondeur', 'ordreNoeuds', 'rpcTete', 'tourEthCall', 'rpc',
    'let idRpc = 0; return (' + source + ');')(RESEAUX, 8453, 5, fetchLabo, (k) => k(), compte, regul,
    () => ({ etat: 'RECENTE' }), (x) => x, { n: 0 }, 0, rpc);
  return { faire, appels };
}
const DEUX = { rpc: DRPC, secours: [PUB], b20Rpc: ORG, logsMultiRpc: ORG, logsArchiveRpc: ORG };
const rep = (url) => (url === DRPC ? T429 : url === PUB ? { statut: 200, corps: { jsonrpc: '2.0', id: 1, result: '0x01' } } : { statut: 400, corps: {} });
const CALL = [{ to: '0x' + '1'.repeat(40), data: '0x' }, 'latest'];
async function scenario(src, mod) {
  const h = horloge(); const regul = mod.creerRegulateur(h); const f = fabriquer(src, regul, rep, DEUX);
  for (let k = 0; k < 12; k++) { h.avancer(2000); /* le repos court (<=1,2 s) est passe : seule la PAUSE peut sauter drpc */ assert.equal(await f.faire('eth_call', CALL), '0x01', 'repli publicnode non servi'); }
  if (process.env.DBG) console.log(f.appels.map((a) => a.url.slice(13, 17)).join(','), JSON.stringify(regul.pausesInstantane && regul.pausesInstantane()));
  const drpc = f.appels.filter((a) => a.url === DRPC);
  return { regul, f, h, drpcTotal: drpc.length, drpcFin: f.appels.slice(-6).filter((a) => a.url === DRPC).length };
}
const source = extraire(readFileSync(APP, 'utf8')); const mod = await charger(brutReg);
let n = 0; const cas = async (nom, fn) => { try { await fn(); n++; } catch (e) { e.message = nom + ' - ' + e.message; throw e; } };
await cas('(1) eth_call : drpc pause apres 3 refus, repli servi, autre methode libre', async () => {
  const s = await scenario(source, mod);
  assert.ok(s.drpcTotal <= 3, 'drpc frappe ' + s.drpcTotal + ' fois en 12 lectures (une sur deux avant le correctif)');
  assert.equal(s.drpcFin, 0, 'drpc encore frappe en fin de serie');
  assert.ok(s.regul.enPause(DRPC, 'eth_call'), 'pause eth_call non armee');
  assert.equal(s.regul.enPause(DRPC, 'eth_getBalance'), false, 'pause etendue a une autre methode');
  assert.equal(s.regul.enPause(PUB, 'eth_call'), false, 'pause etendue a un autre noeud');
  s.h.avancer(5 * 60 * 1000 + 1); s.f.appels.length = 0;
  for (let k = 0; k < 4; k++) await s.f.faire('eth_call', CALL); /* rotation : drpc n est pas toujours le premier essaye */
  assert.equal(s.f.appels.filter((a) => a.url === DRPC).length, 1, 'pas de sonde unique apres T');
});
await cas('(2) drpc SEUL : jamais saute sans requete, refus = rejet', async () => {
  const regul = mod.creerRegulateur(horloge());
  const f = fabriquer(source, regul, rep, { ...DEUX, secours: [] });
  for (let k = 0; k < 4; k++) await assert.rejects(() => f.faire('eth_call', CALL));
  const avant = f.appels.length; await assert.rejects(() => f.faire('eth_call', CALL));
  assert.ok(f.appels.length > avant, 'dernier noeud saute sans requete');
});
await cas('(3) un succes leve la pause', async () => {
  const s = await scenario(source, mod);
  s.regul.noter(DRPC, 'ok', { methode: 'eth_call' });
  assert.equal(s.regul.enPause(DRPC, 'eth_call'), false);
});
await cas('MUTANTS', async () => {
  const mutants = [
    ['429 lisible ne compte plus', source.replace('(/request limit reached/i.test(String(j.error.message)) || limite)', '/request limit reached/i.test(String(j.error.message))'), brutReg],
    ['pause logs seulement', source, brutReg.replace("if (!methode) return null;\n", "if (methode !== 'eth_getLogs') return null;\n").replace("if (!methode) return null;\r\n", "if (methode !== 'eth_getLogs') return null;\r\n")],
  ];
  for (const [nom, src, reg] of mutants) {
    assert.notEqual(src + reg, source + brutReg, 'mutant sans effet : ' + nom);
    const s = await scenario(src, await charger(reg));
    assert.ok(s.drpcFin > 0, 'mutant survivant : ' + nom);
  }
  const m3 = brutReg.replace("if (methode !== 'eth_getLogs' && Array.isArray(autres)", 'if (false && Array.isArray(autres)');
  assert.notEqual(m3, brutReg);
  const regul = (await charger(m3)).creerRegulateur(horloge());
  const f = fabriquer(source, regul, rep, { ...DEUX, secours: [] });
  for (let k = 0; k < 4; k++) await f.faire('eth_call', CALL).catch(() => {});
  const avant = f.appels.length; await f.faire('eth_call', CALL).catch(() => {});
  assert.equal(f.appels.length, avant, 'mutant survivant : garde du dernier noeud');
});
assert.equal(n, 4);
console.log('ok pause-drpc-par-methode - ' + n + ' cas, 3 mutants tues ; NE PROUVE PAS le corps reel des 429 drpc ni K/T');