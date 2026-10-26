/* mesure-stables-fiat-20261026.mjs — LES STABLECOINS ADOSSES A UNE MONNAIE (hors USD/EUR, et les USD pas encore offerts) SUR BASE,
 * JUGES PAR LA REGLE DES ACTIONS (liquidite-actions.js REGLES : achat de 10 USDC a <= 1 % du prix moyen de la pool, aller-retour
 * <= 2 %, au moins 10 000 USDC UTILISABLES au prix courant). Lecture seule, bloc epingle, publicnode.
 *
 * ⛔ D OU VIENNENT LES ADRESSES : aucune n est ecrite de memoire. Elles sont COPIEES des reponses de DefiLlama
 *   (stablecoins.llama.fi/stablecoin/<id>, chainConfig.chains.base) ou de DexScreener (api.dexscreener.com/latest/dex/search, paires
 *   chainId base), sauvegardees a cote (argv[2]). Puis RELUES sur la chaine : code present, symbol(), name(), decimals(), totalSupply().
 *   Un symbole lu different de celui annonce est dit (SYMBOLE_DIFFERENT), jamais corrige.
 * ⛔ LES LIEUX : 'aero-old' = la factory que declare notre routeur Aerodrome (celle de POOLS_PIVOTS_AERODROME, la SEULE que le
 *   mecanisme pivot sait executer) ; 'aero-new' = la factory 0x9cb2…7a76, cotee avec le quoter patche (override), DITE mais pas
 *   executable par le lot pivot. Uniswap v3 : la profondeur USDC (balanceOf) seulement, dite.
 * Usage : node mesure-stables-fiat-20261026.mjs <candidats.json> <sortie.json> */
import { readFileSync, writeFileSync } from 'node:fs';
import { coterVenueCL, verdictVenue, lireCodeQuoteurNouvelle, overrideQuoteur, REGLES, seuilUtilisable } from './liquidite-actions.js';
import { selecteur } from './keccak.js';
import { USDC_BASE } from './frais-creation.js';

const RPC = process.env.RPC || 'https://base-rpc.publicnode.com';
const FACTORY_V3 = '0x33128a8fc17869897dce68ed026d694621f6fdfd'; /* copie de multipool.js ADRESSES.FACTORY_V3 */
let n = 0, id = 0;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(m, p) {
  for (let k = 0; k < 6; k += 1) {
    n += 1;
    try {
      const r = await fetch(RPC, { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) });
      if (r.status === 429 || r.status >= 500) { await pause(1000 * (k + 1)); continue; }
      const j = await r.json();
      if (j.error) { if (/rate|limit/i.test(j.error.message)) { await pause(1000 * (k + 1)); continue; } throw new Error(j.error.message); }
      return j.result;
    } catch (e) { if (k === 5 || /revert|execution/i.test(e.message)) throw e; await pause(800 * (k + 1)); }
  }
  throw new Error('no answer');
}
const bloc = parseInt(await rpc('eth_blockNumber', []), 16) - 10;
const tag = '0x' + bloc.toString(16);
const appel = async (to, data) => { const r = await rpc('eth_call', [{ to, data }, tag]); if (r === '0x') throw new Error('empty answer'); return r; };
const codeNeuf = await lireCodeQuoteurNouvelle((m, p) => rpc(m, p));
const appelDevisNeuf = codeNeuf ? async (to, data) => { const r = await rpc('eth_call', [{ to, data }, tag, overrideQuoteur(codeNeuf)]); if (r === '0x') throw new Error('empty answer'); return r; } : null;

const motA = (a) => String(a).toLowerCase().slice(2).padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
function chaine(hex) {
  const h = String(hex || '').slice(2);
  if (h.length === 64) return Buffer.from(h, 'hex').toString('utf8').replace(/\0+$/, ''); /* bytes32 */
  try { const off = Number(BigInt('0x' + h.slice(0, 64))) * 2, len = Number(BigInt('0x' + h.slice(off, off + 64))); return Buffer.from(h.slice(off + 64, off + 64 + len * 2), 'hex').toString('utf8'); } catch { return null; }
}
const lire = async (to, sig) => { try { return await appel(to, selecteur(sig)); } catch { return null; } };

const candidats = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const lignes = [];
for (const c of candidats) {
  const adr = String(c.adr).toLowerCase();
  const l = { annonce: c.symbole, peg: c.peg, source: c.source, adr };
  try {
    const code = await rpc('eth_getCode', [adr, tag]);
    l.code = code && code !== '0x' ? (code.length - 2) / 2 : 0;
    const sym = await lire(adr, 'symbol()'), nom = await lire(adr, 'name()'), dec = await lire(adr, 'decimals()'), ts = await lire(adr, 'totalSupply()');
    l.symbole = sym ? chaine(sym) : null; l.nom = nom ? chaine(nom) : null;
    l.decimales = dec ? Number(BigInt(dec.slice(0, 66))) : null;
    l.totalSupply = ts ? BigInt(ts.slice(0, 66)).toString() : null;
    l.symboleDifferent = !!(l.symbole && c.symbole && l.symbole.toLowerCase() !== String(c.symbole).toLowerCase());
    if (!l.code) { l.verdict = 'SANS_CODE'; lignes.push(l); continue; }
    const v = {};
    for (const venue of ['aero-old', 'aero-new']) {
      if (venue === 'aero-new' && !appelDevisNeuf) { v[venue] = { etat: 'NON_MESURE', pourquoi: 'patched quoter code not read' }; continue; }
      const cote = await coterVenueCL({ appel, appelDevis: venue === 'aero-new' ? appelDevisNeuf : appel, venue, adr });
      const vv = verdictVenue(cote);
      v[venue] = { ...vv, pools: (cote.pools || []).map((p) => ({ pool: p.pool, ts: p.tickSpacing, usdcPool: p.usdcPool != null ? String(p.usdcPool) : null,
        usdcUtilisable: p.usdcUtilisable != null ? String(p.usdcUtilisable) : null, ecartBps: p.ecartBps ?? null, perteBps: p.perteBps ?? null, code: p.code || null, erreur: p.erreur || null })) };
      for (const k of ['usdcPool', 'usdcUtilisable', 'achat', 'venteMemeEtat']) if (typeof v[venue][k] === 'bigint') v[venue][k] = String(v[venue][k]);
    }
    /* Uniswap v3 : profondeur dite seulement */
    v['uniswap-v3'] = [];
    for (const fee of [100, 500, 3000, 10000]) {
      try {
        const r = await appel(FACTORY_V3, selecteur('getPool(address,address,uint24)') + motA(adr) + motA(USDC_BASE) + mot(fee));
        const p = '0x' + r.slice(26, 66);
        if (/^0x0{40}$/.test(p)) continue;
        const b = await appel(USDC_BASE, selecteur('balanceOf(address)') + motA(p));
        v['uniswap-v3'].push({ fee, pool: p, usdcPool: BigInt(b.slice(0, 66)).toString() });
      } catch (e) { v['uniswap-v3'].push({ fee, erreur: String(e.message || e).slice(0, 80) }); }
    }
    l.venues = v;
    l.verdict = v['aero-old'].passe ? 'PASSE_ROUTEUR' : (v['aero-new'] && v['aero-new'].passe ? 'PASSE_FACTORY_NEUVE_SEULEMENT' : 'NE_PASSE_PAS');
  } catch (e) { l.verdict = 'NON_MESURE'; l.erreur = String(e.message || e).slice(0, 120); }
  lignes.push(l);
}
const res = { bloc, rpc: RPC, regles: { ...REGLES, usdcMin: String(REGLES.usdcMin), seuilUtilisable: String(seuilUtilisable()) }, requetesHttp: n, lignes };
writeFileSync(process.argv[3] || 'stables-fiat.json', JSON.stringify(res, null, 1));
const usd = (x) => (x == null ? '-' : Math.round(Number(x) / 1e6).toLocaleString('en-US'));
for (const l of lignes) {
  const o = (l.venues || {})['aero-old'] || {}, nn = (l.venues || {})['aero-new'] || {};
  const v3 = ((l.venues || {})['uniswap-v3'] || []).reduce((m, p) => Math.max(m, Number(p.usdcPool || 0) / 1e6), 0);
  console.log([String(l.annonce).padEnd(7), String(l.symbole).padEnd(7), String(l.peg).padEnd(11), l.verdict.padEnd(30),
    'old:', o.code || (o.passe ? 'OK' : '-'), 'ts', o.tickSpacing ?? '-', 'pool$', usd(o.usdcPool), 'util$', usd(o.usdcUtilisable), 'ecart', o.ecartBps ?? '-', 'ar', o.perteBps ?? '-',
    '| new:', nn.code || (nn.passe ? 'OK' : '-'), 'pool$', usd(nn.usdcPool), 'util$', usd(nn.usdcUtilisable), 'ecart', nn.ecartBps ?? '-', 'ar', nn.perteBps ?? '-', '| v3 max pool$', Math.round(v3)].join(' '));
}
console.log(JSON.stringify({ bloc, candidats: lignes.length, passeRouteur: lignes.filter((l) => l.verdict === 'PASSE_ROUTEUR').map((l) => l.symbole), requetesHttp: n }));
