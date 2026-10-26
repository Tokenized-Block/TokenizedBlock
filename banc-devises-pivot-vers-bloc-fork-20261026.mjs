/* ⛔⛔ 2026-10-26 (soir) : EURC est BANNI (Phil) et le block de test est UNIT, plus IB022 — ce banc est REMPLACE par
 *   banc-pivot-audf-unit-fork-20261026.mjs (AUDF, WETH, cbBTC -> UNIT ; AUDF -> SSTR ; repli ; EURC refuse). Garde pour l historique :
 *   relance tel quel, il ROUGIT sur EURC (« les trois devises pivot »), c est attendu.
 * banc-devises-pivot-vers-bloc-fork-20261026.mjs — GAPS 4 et 7 (2026-10-26) : EURC, cbBTC, WETH PAIENT UN BLOCK, et ETH paie un block
 *   cote en USDC. Route : X -> USDC sur la pool Aerodrome EPINGLEE (POOLS_PIVOTS_AERODROME : approbation exacte, devis du quoteur CL,
 *   minimum), puis USDC -> (ETH ->) block sur Uniswap v4 — le MEME lot que la 4 ter (action Aerodrome -> block), le meme frais.
 * AFFIRME sur un fork de Base (anvil, compte usurpe, fork DEDIE) :
 *   - plan PRET, `atomique`, via `deviseAerodromeVersBloc` ; chaque appel part tel quel (to / data / value de la transaction
 *     minee = ceux du plan, octet pour octet) et passe (status 0x1), dans l ordre du lot ;
 *   - devis = execution : USDC sorti de la jambe 1 (brut, avant notre retenue) a moins de TOL_BPS du devis de la jambe 1 ; block
 *     recu a moins de TOL_BPS du devis de la jambe 2 ; block recu >= `recoitAuMoins` ;
 *   - toutes les autorisations posees par le plan reviennent a 0 (ERC-20 et Permit2) ;
 *   - le frais est la ou la 4 ter le met : hook qui paie -> 0 sur Aerodrome ; sinon 10 bps EN USDC sur la jambe Aerodrome, exacts au
 *     wei, et jamais dans la devise payee ni dans le block ;
 *   - TEMOIN NEGATIF : la jambe v4 seule (sans la jambe Aerodrome) reverte ;
 *   - REPLI SANS LOT : X -> USDC (route neuve, un seul segment) puis USDC -> block pour `pivotAuMoins`, deux plans ordinaires.
 * NE PROUVE PAS : l envoi groupe EIP-5792 d un vrai wallet (les appels partent un par un, du meme compte, dans l ordre du lot) ; la
 *   prod (le fork lit l etat de Base a sa tete, une fois).
 * Usage : node banc-devises-pivot-vers-bloc-fork-20261026.mjs [url du fork, defaut http://127.0.0.1:8611]
 */
import * as R from './rails-api.js';
import * as F from './frais-creation.js';
import { POOLS_PIVOTS_AERODROME, DEVISES_VIA_USDC_AERODROME } from './plan-franchissement.js';
import { WETH_BASE } from './plan-eth-block.js';
import { decoderInitialize } from './pools-du-jeton.js';
import { keccak256Hex, selecteur } from './keccak.js';
import fs from 'node:fs';
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:8611';
const TOL_BPS = 10n;
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (!c) { ko += 1; console.log('KO  ' + m); } else console.log('ok  ' + m); return c; };
const rpc = async (method, params) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(r.error.message); e.data = r.error.data; throw e; }
  return r.result;
};
const ETH = R.ETH, USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase(), WETH = WETH_BASE.toLowerCase();
const mot = (x) => String(x).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const hexOctets = (h) => Uint8Array.from(String(h).replace(/^0x/, '').match(/../g).map((b) => parseInt(b, 16)));
const solde = async (j, qui) => (j === ETH ? BigInt(await rpc('eth_getBalance', [qui, 'latest'])) : BigInt(await rpc('eth_call', [{ to: j, data: selecteur('balanceOf(address)') + mot(qui) }, 'latest'])));
const SEL_APPROVE = selecteur('approve(address,uint256)'), SEL_APPROVE_P2 = selecteur('approve(address,address,uint160,uint48)');
async function envoyer(de, tx) {
  let gas = 3000000n;
  try { gas = BigInt(await rpc('eth_estimateGas', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0' }])) * 13n / 10n; } catch (_) { /* on l envoie pour lire le status */ }
  const h = await rpc('eth_sendTransaction', [{ from: de, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x' + gas.toString(16) }]);
  for (let i = 0; i < 100; i += 1) {
    const r = await rpc('eth_getTransactionReceipt', [h]);
    if (r) {
      const t = await rpc('eth_getTransactionByHash', [h]);
      const memes = String(t.input).toLowerCase() === String(tx.data || '0x').toLowerCase() && String(t.to).toLowerCase() === String(tx.to).toLowerCase()
        && BigInt(t.value) === BigInt(tx.value || '0x0');
      return { status: r.status, gaz: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice || '0x0'), memes };
    }
    await new Promise((o) => setTimeout(o, 100));
  }
  throw new Error('receipt never came');
}
/* le solde d un jeton pose par le stockage (slot de la table des soldes cherche, puis remis s il ne repond pas) ; sinon null */
async function crediter(jeton, qui, montant) {
  for (let s = 0; s < 64; s += 1) {
    const slot = keccak256Hex(hexOctets(mot(qui) + mot(s.toString(16))));
    const avant = await rpc('eth_getStorageAt', [jeton, slot, 'latest']);
    await rpc('anvil_setStorageAt', [jeton, slot, '0x' + mot(montant.toString(16))]);
    if ((await solde(jeton, qui)) === montant) return 'slot ' + s;
    await rpc('anvil_setStorageAt', [jeton, slot, '0x' + mot(avant)]);
  }
  return null;
}
async function approbationsAZero(compte, appels) {
  const out = [];
  for (const c of appels) {
    const d = String(c.data || '').toLowerCase();
    if (d.startsWith(SEL_APPROVE)) {
      const spender = '0x' + d.slice(10 + 24, 10 + 64);
      const a = BigInt(await rpc('eth_call', [{ to: c.to, data: selecteur('allowance(address,address)') + mot(compte) + mot(spender) }, 'latest']));
      out.push({ ou: 'ERC20 ' + String(c.to).slice(0, 8) + ' -> ' + spender.slice(0, 8), reste: a });
    } else if (d.startsWith(SEL_APPROVE_P2)) {
      const token = '0x' + d.slice(10 + 24, 10 + 64), spender = '0x' + d.slice(10 + 64 + 24, 10 + 128);
      const r = await rpc('eth_call', [{ to: c.to, data: selecteur('allowance(address,address,address)') + mot(compte) + mot(token) + mot(spender) }, 'latest']);
      out.push({ ou: 'Permit2 ' + token.slice(0, 8) + ' -> ' + spender.slice(0, 8), reste: BigInt('0x' + String(r).slice(2, 66)) });
    }
  }
  return out;
}
const SSTR_LOG = JSON.parse(fs.readFileSync(new URL('./mesures/sstr-initialize-20261026.json', import.meta.url), 'utf8'));
const SSTR_D = decoderInitialize(SSTR_LOG);
const SSTR = SSTR_D && SSTR_D.cle ? String(SSTR_D.cle.currency1).toLowerCase() : null;
const clesDe = async (a) => (SSTR && String(a).toLowerCase() === SSTR ? [SSTR_D.cle] : []);
const plan = (de, vers, montant, compte) => R.planRail({ de, vers, montant: String(montant), compte }, { rpc, clesDe });
const pivot = (x) => [...POOLS_PIVOTS_AERODROME].find(([k]) => k.split('|').includes(x))[1];

const chaine = parseInt(await rpc('eth_chainId', []), 16), tete = parseInt(await rpc('eth_blockNumber', []), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base')) process.exit(1);
try { await rpc('anvil_nodeInfo', []); } catch (_) { ok(false, 'anvil_nodeInfo repond : ce n est PAS un fork, rien n est envoye'); process.exit(1); }
/* IB022 = le block de la sonde de sante (serveur-web.js BLOCK_SONDE) ; lu dans pool-sans-hook.js, jamais recopie de memoire */
const IB022 = (fs.readFileSync(new URL('./pool-sans-hook.js', import.meta.url), 'utf8').match(/'(0x[0-9a-f]{40})', \/\* IB022 /) || [])[1];
const SONDE = (fs.readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').match(/const BLOCK_SONDE = '(0x[0-9a-f]{40})'/) || [])[1];
ok(/^0x[0-9a-f]{40}$/.test(String(IB022)) && IB022 === SONDE, 'IB022 (pool-sans-hook.js) = BLOCK_SONDE de la sante (' + IB022 + ')');
ok(!!SSTR && !SSTR_D.erreur && String(SSTR_D.cle.currency0).toLowerCase() === USDC, 'SSTR : cle v4 decodee du log Initialize mesure (poolId recalcule), cotee en USDC (' + SSTR + ', fee ' + (SSTR_D.cle || {}).fee + ', ts ' + (SSTR_D.cle || {}).tickSpacing + ')');
const EURC = [...DEVISES_VIA_USDC_AERODROME].find((x) => pivot(x).symbole === 'USDC/EURC');
const CBBTC = [...DEVISES_VIA_USDC_AERODROME].find((x) => pivot(x).symbole === 'USDC/cbBTC');
const nom = (j) => ({ [ETH]: 'ETH', [USDC]: 'USDC', [WETH]: 'WETH', [EURC]: 'EURC', [CBBTC]: 'cbBTC', [IB022]: 'IB022', [SSTR]: 'SSTR' })[j] || j.slice(0, 8);
ok(!!EURC && !!CBBTC && DEVISES_VIA_USDC_AERODROME.has(WETH), 'les trois devises pivot se lisent dans POOLS_PIVOTS_AERODROME (EURC ' + EURC + ', cbBTC ' + CBBTC + ', WETH)');

const snap = await rpc('evm_snapshot', []);
const resultats = [];
try {
  const compte = '0x' + ('a5e7' + tete).padEnd(40, 'd').slice(0, 40);
  await rpc('anvil_impersonateAccount', [compte]);
  await rpc('anvil_setBalance', [compte, '0x' + (10n ** 18n).toString(16)]);
  async function lot(x, montant, block, { temoin = false } = {}) {
    const titre = nom(x) + ' > ' + nom(block);
    const s0 = await rpc('evm_snapshot', []);
    try {
      let credit;
      if (x === WETH) { const r = await envoyer(compte, { to: WETH, data: selecteur('deposit()'), value: '0x' + montant.toString(16) }); credit = r.status === '0x1' ? 'deposit()' : null; }
      else credit = await crediter(x, compte, montant);
      if (!ok(!!credit && (await solde(x, compte)) >= montant, titre + ' : le compte detient ' + montant + ' unites de ' + nom(x) + ' (' + credit + ')')) return;
      const p = await plan(x, block, montant, compte);
      if (!ok(p.etat === 'PRET' && p.atomique === true && p.via === 'deviseAerodromeVersBloc', titre + ' : plan ' + p.etat + ' via ' + p.via + (p.pourquoi ? ' — ' + String(p.pourquoi).slice(0, 200) : ''))) { resultats.push({ titre, etat: p.etat, pourquoi: p.pourquoi }); return; }
      const rs = p.resume;
      if (temoin) {
        const s1 = await rpc('evm_snapshot', []);
        const st = [];
        for (const c of p.aSigner.slice(2)) st.push((await envoyer(compte, c)).status);
        ok(st[st.length - 1] !== '0x1', titre + ' : TEMOIN NEGATIF, la jambe v4 seule (sans Aerodrome) reverte : ' + st.join(','));
        await rpc('evm_revert', [s1]);
      }
      const jetons = [ETH, WETH, USDC, x, block].filter((j, i, a) => a.indexOf(j) === i);
      const av = { c: {}, f: {} };
      for (const j of jetons) { av.c[j] = await solde(j, compte); av.f[j] = await solde(j, FRAIS); }
      let gaz = 0n; const st = [];
      for (const c of p.aSigner) { const r = await envoyer(compte, c); gaz += r.gaz; st.push(r); if (r.status !== '0x1') break; }
      ok(st.length === p.aSigner.length && st.every((r) => r.status === '0x1'), titre + ' : ' + p.aSigner.length + ' appels du lot executes sans revert, dans l ordre');
      ok(st.every((r) => r.memes), titre + ' : octets executes = octets du plan (to, data, value de chaque transaction minee)');
      const d = { c: {}, f: {} };
      for (const j of jetons) { d.c[j] = (await solde(j, compte)) - av.c[j]; d.f[j] = (await solde(j, FRAIS)) - av.f[j]; }
      d.c[ETH] += gaz;
      const recu = d.c[block], min = BigInt(rs.recoitAuMoins), q2 = BigInt(rs.quoteJambe2), q1 = BigInt(rs.pivotCote);
      ok(-d.c[x] === montant, titre + ' : paye exactement ' + montant + ' ' + nom(x));
      ok(recu >= min, titre + ' : recu ' + recu + ' >= minimum ' + min);
      const brut1 = d.c[USDC] + BigInt(rs.pivotAuMoins) + d.f[USDC];
      const e1 = brut1 > q1 ? brut1 - q1 : q1 - brut1, e2 = recu > q2 ? recu - q2 : q2 - recu;
      ok(e1 * 10000n <= q1 * TOL_BPS, titre + ' : jambe 1, USDC sorti ' + brut1 + ' vs devis ' + q1 + ' (ecart ' + (q1 ? (e1 * 1000000n / q1) : 0n) + ' ppm, tolerance ' + TOL_BPS + ' bps)');
      ok(e2 * 10000n <= q2 * TOL_BPS, titre + ' : jambe 2, block recu ' + recu + ' vs devis ' + q2 + ' (ecart ' + (q2 ? (e2 * 1000000n / q2) : 0n) + ' ppm)');
      const restes = await approbationsAZero(compte, p.aSigner);
      ok(restes.length >= 2 && restes.every((a) => a.reste === 0n), titre + ' : autorisations revenues a 0 : ' + restes.map((a) => a.ou + '=' + a.reste).join(' · '));
      const bps = BigInt(rs.fraisBpsJambe1);
      if (rs.fraisParHook === true) {
        ok(bps === 0n && d.f[USDC] === 0n, titre + ' : le hook paie -> 0 bps sur Aerodrome, 0 USDC au wallet des frais (comme la 4 ter)');
      } else {
        ok(bps === 10n && d.f[USDC] === (brut1 * bps) / 10000n, titre + ' : hook qui ne paie pas -> ' + bps + ' bps EN USDC sur la jambe Aerodrome : ' + d.f[USDC] + ' = floor(' + brut1 + ' x ' + bps + ' / 10000)');
      }
      ok(d.f[x] <= 0n && d.f[block] === 0n, titre + ' : aucun frais dans la devise payee ni dans le block');
      console.log('     frais (wallet ' + FRAIS.slice(0, 8) + ') : ' + jetons.map((j) => nom(j) + ' ' + d.f[j]).join(' · ') + ' · fraisParHook ' + rs.fraisParHook + ' · fraisMarcheBps ' + rs.fraisMarcheBps);
      console.log('     USDC reste au compte : ' + d.c[USDC] + ' (la marge de la jambe 1 au-dela de son minimum)');
      resultats.push({ titre, etat: 'EXECUTE', paye: montant, recu, min, q1, brut1, q2, fraisUsdc: d.f[USDC], fraisEth: d.f[ETH], fraisParHook: rs.fraisParHook });
    } finally { await rpc('evm_revert', [s0]); }
  }
  async function v4EthVersBloc(montant, block) {
    const titre = 'ETH > ' + nom(block);
    const s0 = await rpc('evm_snapshot', []);
    try {
      const p = await plan('ETH', block, montant, compte);
      if (!ok(p.etat === 'PRET' && p.via === 'planEchangeMultiSauts' && p.aSigner.length === 1, titre + ' : plan ' + p.etat + ' via ' + p.via + (p.pourquoi ? ' — ' + String(p.pourquoi).slice(0, 200) : ''))) { resultats.push({ titre, etat: p.etat, pourquoi: p.pourquoi }); return; }
      const rs = p.resume;
      const jetons = [ETH, USDC, block];
      const av = { c: {}, f: {} };
      for (const j of jetons) { av.c[j] = await solde(j, compte); av.f[j] = await solde(j, FRAIS); }
      const r = await envoyer(compte, p.aSigner[0]);
      ok(r.status === '0x1' && r.memes, titre + ' : un appel, execute, octets = plan (status ' + r.status + ')');
      const d = { c: {}, f: {} };
      for (const j of jetons) { d.c[j] = (await solde(j, compte)) - av.c[j]; d.f[j] = (await solde(j, FRAIS)) - av.f[j]; }
      d.c[ETH] += r.gaz;
      const recu = d.c[block], min = BigInt(rs.recoitAuMoins), q = BigInt(rs.quote), e = recu > q ? recu - q : q - recu;
      ok(-d.c[ETH] === montant, titre + ' : paye exactement ' + montant + ' wei');
      ok(recu >= min, titre + ' : recu ' + recu + ' >= minimum ' + min);
      ok(e * 10000n <= q * TOL_BPS, titre + ' : recu vs devis ' + q + ' (ecart ' + (q ? e * 1000000n / q : 0n) + ' ppm)');
      const frais = BigInt(rs.frais || 0);
      ok(rs.fraisParHook === true ? d.f[ETH] >= 0n && d.f[block] === 0n : d.f[ETH] === frais && frais > 0n && d.f[block] === 0n,
        titre + ' : frais ' + (rs.fraisParHook ? 'par le hook' : rs.fraisBps + ' bps EN ETH, ' + d.f[ETH] + ' wei = resume.frais ' + frais) + ', rien en block');
      resultats.push({ titre, etat: 'EXECUTE', paye: montant, recu, min, q, fraisEth: d.f[ETH], fraisParHook: rs.fraisParHook });
    } finally { await rpc('evm_revert', [s0]); }
  }
  async function repliDeuxTrades(x, montant, block) {
    const titre = 'REPLI ' + nom(x) + ' > USDC puis USDC > ' + nom(block);
    const s0 = await rpc('evm_snapshot', []);
    try {
      ok(!!(await crediter(x, compte, montant)), titre + ' : compte credite');
      const pl = await plan(x, block, montant, compte);
      const piv = pl.resume && pl.resume.pivotAuMoins;
      ok(pl.etat === 'PRET' && String(pl.resume.pivot) === USDC && /^\d+$/.test(String(piv)), titre + ' : le lot porte pivot USDC et pivotAuMoins ' + piv + ' (ce que lit bcDeuxTrades)');
      const p1 = await plan(x, USDC, montant, compte);
      ok(p1.etat === 'PRET' && p1.via === 'planAerodromeSegment' && p1.route.endsWith('>USDC'), titre + ' : trade 1 ' + nom(x) + ' > USDC : ' + p1.etat + ' via ' + p1.via + (p1.pourquoi ? ' — ' + p1.pourquoi : ''));
      if (p1.etat !== 'PRET') return;
      const u0 = await solde(USDC, compte), f0 = await solde(USDC, FRAIS);
      for (const c of p1.aSigner) { const r = await envoyer(compte, c); if (!ok(r.status === '0x1' && r.memes, titre + ' : trade 1, appel execute (octets = plan)')) return; }
      const du = (await solde(USDC, compte)) - u0, df = (await solde(USDC, FRAIS)) - f0;
      ok(du >= BigInt(p1.resume.recoitAuMoins) && df === ((du + df) * BigInt(p1.resume.fraisBps)) / 10000n, titre + ' : trade 1, ' + du + ' USDC >= minimum ' + p1.resume.recoitAuMoins + ', frais ' + df + ' USDC (' + p1.resume.fraisBps + ' bps, la retenue Aerodrome existante)');
      ok((await approbationsAZero(compte, p1.aSigner)).every((a) => a.reste === 0n), titre + ' : trade 1, autorisation revenue a 0');
      let p2 = await plan(USDC, block, piv, compte), tours = 0;
      while (p2.etat === 'APPROBATIONS' && tours < 3) { tours += 1; for (const c of p2.aSigner) await envoyer(compte, c); p2 = await plan(USDC, block, piv, compte); }
      ok(p2.etat === 'PRET', titre + ' : trade 2 USDC > ' + nom(block) + ' pour pivotAuMoins : ' + p2.etat + (p2.pourquoi ? ' — ' + p2.pourquoi : ''));
      if (p2.etat !== 'PRET') return;
      const b0 = await solde(block, compte);
      const r2 = await envoyer(compte, p2.aSigner[p2.aSigner.length - 1]);
      const db = (await solde(block, compte)) - b0;
      ok(r2.status === '0x1' && db >= BigInt(p2.resume.recoitAuMoins), titre + ' : trade 2 execute, ' + db + ' >= minimum ' + p2.resume.recoitAuMoins);
    } finally { await rpc('evm_revert', [s0]); }
  }
  await lot(EURC, 5000000n, IB022, { temoin: true });
  await lot(CBBTC, 10000n, IB022);
  await lot(WETH, 3n * 10n ** 15n, IB022);
  await lot(EURC, 5000000n, SSTR);
  await v4EthVersBloc(2n * 10n ** 15n, SSTR);
  await repliDeuxTrades(EURC, 5000000n, IB022);
} finally { await rpc('evm_revert', [snap]); }
console.log('RESULTATS ' + JSON.stringify(resultats, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));
console.log((n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) — fork rendu a son etat d avant le banc');
process.exit(ko ? 1 : 0);
