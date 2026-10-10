/* test-pause-noeud-libre-echoue-20261010.mjs - revue adverse de Claude, point 3 (d83f9f4) : « libre » = « pas en pause », pas « n a pas
 *   echoue ». drpc en pause pour eth_call + publicnode qui rend 503 : AVANT, rpcReseau jetait `HTTP 503` sans jamais demander drpc,
 *   pendant les 5 min de pause. APRES : le noeud libre a echoue -> le noeud en pause est essaye (sa reponse est servie).
 *   Execute rpcReseau EXTRAIT de app.html + le regulateur livre (meme banc que test-pause-drpc-par-methode).
 *   NE PROUVE PAS : le comportement reel de drpc/publicnode ; serveur-web.js (rpcServeur, hors de ma zone) n est pas couvert. */import { readFileSync } from 'node:fs';
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
const CALL = [{ to: '0x' + '1'.repeat(40), data: '0x' }, 'latest'];
const OK = (v) => ({ statut: 200, corps: { jsonrpc: '2.0', id: 1, result: v } });
let phase = 1;
const rep = (url) => (url === DRPC ? (phase === 1 ? T429 : OK('0x02')) : url === PUB ? (phase === 2 ? { statut: 503 } : OK('0x01')) : { statut: 400, corps: {} });
async function banc(src, regMod) {
  phase = 1;
  const h = horloge(); const regul = regMod.creerRegulateur(h); const f = fabriquer(src, regul, rep, DEUX);
  for (let k = 0; k < 12; k++) { h.avancer(2000); await f.faire('eth_call', CALL); }
  assert.ok(regul.enPause(DRPC, 'eth_call'), 'pause drpc non armee (banc)');
  return { h, regul, f };
}
const source = extraire(readFileSync(APP, 'utf8')); const mod = await charger(brutReg);
let ko = 0; const ok = (c, m) => { console.log((c ? 'ok  ' : 'KO  ') + m); if (!c) ko++; };
/* 1. ADVERSE : publicnode 503, drpc en pause mais sain -> drpc servi, a chaque lecture (les deux ordres de rotation) */
{
  const { h, f } = await banc(source, mod); phase = 2; f.appels.length = 0;
  const res = [];
  for (let k = 0; k < 4; k++) { h.avancer(2000); res.push(await f.faire('eth_call', CALL).then((v) => v, (e) => 'THROW ' + e.message)); }
  ok(res.every((v) => v === '0x02') && f.appels.some((a) => a.url === DRPC), '1 adverse : publicnode 503 + drpc en pause -> drpc essaye et servi (' + res.join(' | ') + ')');
}
/* 2. TEMOIN NEGATIF : publicnode sain -> drpc reste saute (la pause garde son effet) */
{
  const { h, f } = await banc(source, mod); phase = 3; f.appels.length = 0;
  for (let k = 0; k < 4; k++) { h.avancer(2000); await f.faire('eth_call', CALL); }
  ok(f.appels.every((a) => a.url !== DRPC), '2 temoin : publicnode sain -> aucune requete vers drpc en pause (' + f.appels.length + ' appels)');
}
/* 3. eth_getLogs n est pas touche : en pause = saute, meme si le libre echoue (repli mesure = lots de 9) */
{
  const h = horloge(); const regul = mod.creerRegulateur(h);
  for (let k = 0; k < 3; k++) regul.noter(DRPC, 'debit', { methode: 'eth_getLogs', quota: true });
  phase = 2; const f = fabriquer(source, regul, rep, DEUX);
  const r = await f.faire('eth_getLogs', [{ fromBlock: '0x1', toBlock: '0x2' }]).then((v) => v, (e) => 'THROW');
  ok(r === 'THROW' && f.appels.every((a) => a.url !== DRPC), '3 eth_getLogs en pause : jamais rejoue par ce correctif (' + JSON.stringify(r) + ')');
}
console.log(ko ? ko + ' KO' : 'ok pause-noeud-libre-echoue - 3 cas');
process.exit(ko ? 1 : 0);