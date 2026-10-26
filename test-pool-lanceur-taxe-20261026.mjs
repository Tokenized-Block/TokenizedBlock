/* test-pool-lanceur-taxe-20261026.mjs — UNE LIGNE DU MARKET DONT LA POOL A HOOK TIERS EST VIDE / TAXE LA REVENTE DIT SA CAUSE LUE, SANS BUY.
 *
 * POURQUOI : 129 lignes du trending (pools ETH / B20, fee 100, tickSpacing 1, un hook par jeton) disaient « its pool cannot be quoted
 *   (empty, or a third-party hook that taxes resale) » — un « ou » qui ne dit pas laquelle. Mesure du 2026-10-26 (pool-lanceur-taxe.js) :
 *   les deux, 129 / 129 — liquidite en cours 0, taxBps 9999 / 10000.
 * CE BANC :
 *   I.   phraseRefusPool : chaque cause lue -> son code ; rien de mesure -> null (la phrase generale reste) ; une taxe incoherente -> null.
 *   II.  lireCauseRefusPool : bons selecteurs vers les bons contrats ; une lecture ratee = NON LUE (null), jamais 0.
 *   III. raisonSansBuy (routage.js, le module de l ecran) : la cause servie passe avant le seuil DexScreener ; un code etranger ne passe
 *        pas ; une ligne achetable ne recoit aucune raison.
 *   IV.  cablage : le serveur pose `l.achatRefus` depuis le verdict ; l ecran le passe a raisonSansBuy ; le module est servi a qui l importe.
 *   V.   CHAINE (lecture seule, LIVE=0 pour sauter) : les 3 pools mesurees (ADOF, BaseDay, replicas) -> POOL_VIDE_TAXE_REVENTE aujourd hui.
 * Usage : node test-pool-lanceur-taxe-20261026.mjs   (LIVE=0 : sans reseau) */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); return c; };
const imp = async (f) => { try { return await import(pathToFileURL(path.join(ICI, f)).href); } catch (e) { return { __err: String(e.message || e).slice(0, 160) }; } };
const T = await imp('pool-lanceur-taxe.js');
const R = await imp('routage.js');
const P = await imp('pool.js');
if (!ok(!T.__err, 'pool-lanceur-taxe.js importe' + (T.__err ? ' : ' + T.__err : ''))) { console.log(`\n${n - ko}/${n} ok, ${ko} KO`); process.exit(1); }

/* I. phrases */
const pvt = T.phraseRefusPool({ liquidite: 0n, taxBps: 9999n, denom: 10000n });
ok(pvt && pvt.code === 'POOL_VIDE_TAXE_REVENTE' && /99\.99%/.test(pvt.phrase) && /empty/.test(pvt.phrase), 'vide + 9999/10000 -> POOL_VIDE_TAXE_REVENTE, « 99.99% » : ' + (pvt && pvt.phrase));
const pv = T.phraseRefusPool({ liquidite: 0n, taxBps: null, denom: null });
ok(pv && pv.code === 'POOL_VIDE' && !/%/.test(pv.phrase), 'vide, taxe non lue -> POOL_VIDE, aucun pourcentage invente');
const pt = T.phraseRefusPool({ liquidite: 5n, taxBps: 9999n, denom: 10000n });
ok(pt && pt.code === 'TAXE_REVENTE' && /99\.99%/.test(pt.phrase), 'liquide + 9999/10000 -> TAXE_REVENTE');
ok(T.phraseRefusPool({ liquidite: 5n, taxBps: 30n, denom: 10000n }) === null, 'liquide + 0,3 % -> null (pas une cause : la phrase generale reste)');
ok(T.phraseRefusPool({ liquidite: 5n, taxBps: 5000n, denom: 10000n }) === null, 'taxe a 50 % pile -> null (le seuil est strict)');
ok(T.phraseRefusPool({ liquidite: 5n, taxBps: 20000n, denom: 10000n }) === null, 'taxe > denominateur -> null (incoherent, rien d affirme)');
ok(T.phraseRefusPool({ liquidite: 5n, taxBps: 9999n, denom: 0n }) === null, 'denominateur 0 -> null');
ok(T.phraseRefusPool({ liquidite: null, taxBps: null, denom: null }) === null, 'rien lu -> null (une lecture ratee n est pas une pool vide)');
ok(T.phraseRefusPool(null) === null, 'pas de cause -> null');
ok(T.tauxTaxe({ taxBps: 9999n, denom: 10000n }) === 99.99, 'tauxTaxe 9999/10000 = 99.99');

/* II. lecture */
const SV = '0x' + 'a'.repeat(40), HOOK = '0x' + 'b'.repeat(40), ID = '0x' + 'c'.repeat(64);
const motH = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
const vus = [];
const faux = async (to, data) => { vus.push(to + ' ' + data.slice(0, 10)); if (to === SV && data === '0xfa6793d5' + 'c'.repeat(64)) return motH(0); if (to === HOOK && data === '0x3eacd2f8') return motH(9999); if (to === HOOK && data === '0xe1a45218') return motH(10000); throw new Error('unexpected ' + to + ' ' + data); };
const c1 = await T.lireCauseRefusPool({ appel: faux, stateView: SV, cle: { hooks: HOOK }, poolId: ID });
ok(c1.liquidite === 0n && c1.taxBps === 9999n && c1.denom === 10000n && c1.lu === true, 'lecture : liquidite 0, taxBps 9999, denom 10000, lu');
ok(vus.length === 3, '3 eth_call exactement : ' + vus.join(' | '));
ok(P.selecteur && P.selecteur('getLiquidity(bytes32)') === T.SEL_GET_LIQUIDITY && P.selecteur('taxBps()') === T.SEL_TAX_BPS, 'selecteurs recalcules par keccak : getLiquidity, taxBps');
const panne = async () => { throw new Error('429'); };
const c2 = await T.lireCauseRefusPool({ appel: panne, stateView: SV, cle: { hooks: HOOK }, poolId: ID });
ok(c2.liquidite === null && c2.lu === false && T.phraseRefusPool(c2) === null, 'noeud qui refuse -> NON LUE (null), aucune phrase');
vus.length = 0;
const c3 = await T.lireCauseRefusPool({ appel: faux, stateView: SV, cle: { hooks: '0x0000000000000000000000000000000000000000' }, poolId: ID });
ok(c3.taxBps === null && vus.length === 1, 'pool sans hook : seule la liquidite est lue');

/* III. ecran */
ok(!R.__err && Array.isArray(R.CODES_REFUS_SERVI), 'routage.js expose CODES_REFUS_SERVI' + (R.__err ? ' : ' + R.__err : ''));
const v0 = R.verdictRoutage ? R.verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: null }) : null;
const r1 = R.raisonSansBuy && R.raisonSansBuy(v0, { liqOk: false, liqMin: 500, refusServi: pvt });
ok(r1 && r1.code === 'POOL_VIDE_TAXE_REVENTE' && r1.phrase === pvt.phrase, 'cause servie AVANT le seuil DexScreener : ' + (r1 && r1.code));
const r2 = R.raisonSansBuy && R.raisonSansBuy(v0, { liqOk: true, refusServi: { code: 'AUTRE', phrase: 'Buy now!' } });
ok(r2 && r2.code === 'NON_COTEE', 'code etranger -> ignore, phrase generale : ' + (r2 && r2.code));
const r3 = R.raisonSansBuy && R.raisonSansBuy({ achetableEnEth: true }, { liqOk: true, refusServi: pvt });
ok(r3 === null, 'ligne achetable -> aucune raison (la cause servie ne masque pas un Buy reel)');
const r4 = R.raisonSansBuy && R.raisonSansBuy(v0, { liqOk: true });
ok(r4 && r4.code === 'NON_COTEE', 'sans cause servie : la phrase d avant, inchangee');

/* IV. cablage */
const srv = readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
const app = readFileSync(path.join(ICI, 'app.html'), 'utf8');
ok(/import \{ lireCauseRefusPool, phraseRefusPool \} from '\.\/pool-lanceur-taxe\.js'/.test(srv), 'serveur : importe pool-lanceur-taxe.js');
ok(/l\.achatRefus = \{ code: v\.refus\.code, phrase: v\.refus\.phrase \}/.test(srv) && /l\.achatRefus = null;/.test(srv), 'serveur : pose l.achatRefus depuis le verdict, remis a null a chaque tour');
ok(/refus: phraseRefusPool\(cause\)/.test(srv) && /achatsParJeton\.set\(jeton, \{ t: Date\.now\(\), empreinte, v \}\)/.test(srv), 'serveur : la cause est gardee AVEC le verdict (meme cache)');
ok(/raisonSansBuy\(vR, \{ liqOk, liqMin: LIQ_MIN_BUY_USD, refusServi: l\.achatRefus \}\)/.test(app), 'ecran : la ligne passe l.achatRefus a raisonSansBuy');

/* V. chaine (lecture seule) */
if (process.env.LIVE !== '0') {
  const NOEUD = process.env.RPC || 'https://base-rpc.publicnode.com';
  let id = 0;
  const appel = async (to, data) => { const r = await fetch(NOEUD, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: 'eth_call', params: [{ to, data }, 'latest'] }) }).then((x) => x.json()); if (r.error) throw new Error(r.error.message); return r.result; };
  const L = await imp('lancer-pool.js');
  const ETH = '0x0000000000000000000000000000000000000000';
  for (const [sym, jeton, hooks] of [['ADOF', '0xb200000000000000000000d83f3b67055baa2938', '0xe4af54e1bb9d710a08c45f9bcf5b88e81d2380cc'],
    ['BaseDay', '0xb200000000000000000000e47efb88cbb6418de4', '0xb03e31adaacbc78c739baed8ee60e42f1323a8c4'],
    ['replicas', '0xb2000000000000000000008d7319e4c7e7928510', '0xdaba36389d4ac80664d56cc9bb675b779c8f00cc']]) {
    const cle = { currency0: ETH, currency1: jeton, fee: 100, tickSpacing: 1, hooks };
    const c = await T.lireCauseRefusPool({ appel, stateView: L.V4_ADRESSES[8453].stateView, cle, poolId: P.poolId(cle) });
    const ph = T.phraseRefusPool(c);
    ok(c.lu && ph && ph.code === 'POOL_VIDE_TAXE_REVENTE', 'chaine ' + sym + ' : liquidite ' + c.liquidite + ', taxBps ' + c.taxBps + '/' + c.denom + ' -> ' + (ph && ph.code));
  }
} else console.log('--  V. chaine sautee (LIVE=0)');
console.log(`\n${n - ko}/${n} ok, ${ko} KO`);
process.exit(ko ? 1 : 0);
