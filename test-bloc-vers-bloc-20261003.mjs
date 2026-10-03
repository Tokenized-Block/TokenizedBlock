/* test-bloc-vers-bloc-20261003.mjs — BLOCK A -> BLOCK B EN UNE TRANSACTION (decision de Phil, 2026-10-03).
 *
 * A. bloc-vers-bloc.js (hors reseau) : les sauts sont construits dans le bon SENS, la route ETH<->USDC passe par la pool du
 *    milieu sans hook, tout autre couple est refuse, jamais devine.
 * B. Base mainnet, LECTURE SEULE : IB022 -> baa5 (deux blocks V8 cotes en ETH, adresses lues dans pool-sans-hook.js) — les
 *    deux marches lus par vieDuBlock avec la cle de /api/cle (prod), les deux sauts COTES sur le Quoter reel, et le plan
 *    annonce : routeur 0, 2 jambes de hook, 100 bps de marche, block -> block. Le compte de simulation ne detient rien :
 *    le plan s arrete a une approbation ou a « not enough funds » — ce banc ne prouve PAS un echange execute.
 * C. app.html `ligneFraisMultiSauts` (extraite, pas copiee) : la ligne dite avant la signature. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const BB = await imp('bloc-vers-bloc.js');
const E = await imp('echange.js');
const T = await imp('tokenomics.js');
const { vieDuBlock } = await imp('marche.js');
const { V4_ADRESSES } = await imp('lancer-pool.js');
const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');

let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const bas = (a) => String(a || '').toLowerCase();
const ETH = '0x' + '0'.repeat(40), USDC = bas(USDC_BASE);

/* ── A. constructeur ── */
const A = '0xb2' + '0'.repeat(20) + '1'.repeat(18), B = '0xb2' + '0'.repeat(20) + '2'.repeat(18), X = '0xb2' + '0'.repeat(20) + '3'.repeat(18);
const cle = (x, y, h = T.HOOK_V8) => { const [c0, c1] = bas(x) < bas(y) ? [x, y] : [y, x]; return { currency0: c0, currency1: c1, fee: 0, tickSpacing: 200, hooks: h }; };
const lu = (c) => ({ etat: 'LUE', cle: c });
const e1 = BB.sautsBlocVersBloc({ adrA: A, marcheA: lu(cle(ETH, A)), adrB: B, marcheB: lu(cle(ETH, B)) });
ok(e1.etat === 'OK' && e1.sauts.length === 2 && e1.sauts[0].zeroForOne === false && e1.sauts[1].zeroForOne === true,
  'ETH/ETH : 2 sauts — vendre A (ETH c0 -> zeroForOne faux), acheter B (ETH entre, c0 -> vrai)');
const e2 = BB.sautsBlocVersBloc({ adrA: A, marcheA: lu(cle(ETH, A)), adrB: B, marcheB: lu(cle(USDC, B)) });
ok(e2.etat === 'OK' && e2.sauts.length === 3 && bas(e2.sauts[1].cle.hooks) === ETH && e2.sauts[1].zeroForOne === true
  && bas(e2.sauts[1].cle.currency1) === USDC && e2.sauts[1].cle.fee === 500, 'ETH -> USDC : saut du milieu sur la pool v4 ETH/USDC SANS hook (500/10), ETH -> USDC');
const e3 = BB.sautsBlocVersBloc({ adrA: A, marcheA: lu(cle(USDC, A)), adrB: B, marcheB: lu(cle(ETH, B)) });
ok(e3.etat === 'OK' && e3.sauts.length === 3 && e3.sauts[1].zeroForOne === false, 'USDC -> ETH : milieu dans l autre sens');
ok(BB.sautsBlocVersBloc({ adrA: A, marcheA: lu(cle(ETH, A)), adrB: B, marcheB: lu(cle(X, B)) }).etat === 'REFUSE', 'devises sans route connue : REFUSE (rien d invente)');
ok(BB.sautsBlocVersBloc({ adrA: A, marcheA: lu(cle(ETH, A)), adrB: A, marcheB: lu(cle(ETH, A)) }).etat === 'REFUSE', 'le meme block : REFUSE');
ok(BB.sautsBlocVersBloc({ adrA: A, marcheA: { etat: 'NON_LUE' }, adrB: B, marcheB: lu(cle(ETH, B)) }).etat === 'REFUSE', 'marche A illisible : REFUSE');
ok(BB.sautsBlocVersBloc({ adrA: A, marcheA: lu(cle(ETH, X)), adrB: B, marcheB: lu(cle(ETH, B)) }).etat === 'REFUSE', 'marche lu qui ne contient pas A : REFUSE');

/* ── C. la ligne de l ecran ── */
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
const i0 = html.indexOf('function ligneFraisMultiSauts(');
let src = null;
if (i0 >= 0) { let p = 0; for (let k = html.indexOf('{', i0); k < html.length; k += 1) { if (html[k] === '{') p += 1; else if (html[k] === '}') { p -= 1; if (p === 0) { src = html.slice(i0, k + 1); break; } } } }
ok(!!src, 'ligneFraisMultiSauts extraite d app.html');
const ligne = new Function(src + '\nreturn ligneFraisMultiSauts;')();
ok(/^Fee: about 1% in total — each of the 2 block markets crossed takes its own fee/.test(ligne({ fraisParHook: true, fraisMarcheBps: 100, jambesHook: 2 }, 0)),
  'ecran block -> block : « about 1% in total », 2 marches');
ok(/^Fee: 0\.5%, taken by the block/.test(ligne({ fraisParHook: true, fraisMarcheBps: 50, jambesHook: 1 }, 0)), 'ecran 1 hook : 0.5 %, pris par le marche (plus jamais « Fee: 0% »)');
ok(ligne({ fraisParHook: false }, 0.2) === 'Fee: 0.2% of what you pay, inside the same transaction', 'TEMOIN routeur seul : texte d avant, inchange');
ok(/symPaye = null, relance = 'ACHAT'/.test(html) && /signerEchange\(et, relance, true\)/.test(html) && /signerEchange\(p\.tx, relance, false\)/.test(html),
  'ecran : approbation et signature re-preparent dans le SENS de la vente (relance), pas en achat');

/* ── B. Base mainnet, lecture seule ── */
const URLS = ['https://mainnet.base.org', 'https://base-rpc.publicnode.com'];
let id = 0;
const rpc = async (method, params) => {
  let der = null;
  for (let t = 0; t < 4; t += 1) for (const url of URLS) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
        signal: AbortSignal.timeout(30000), body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
      if (r.error) { const err = new Error(r.error.message + (r.error.data ? ' data=' + r.error.data : '')); err.data = r.error.data; throw err; }
      return r.result;
    } catch (err) { der = err; if (!/rate|limit|429|timeout|ECONN|fetch failed|network|503|502|504|too many|socket|aborted/i.test(String(err.message))) throw err; await new Promise((o) => setTimeout(o, 800)); }
  }
  throw der;
};
const cles = async (adr) => { const d = await fetch('https://tokenizedblock.space/api/cle/' + bas(adr), { headers: { 'x-ms-monitor': '1' } }).then((r) => r.json()); return d && d.ok ? d.cles : []; };
const ps = fs.readFileSync(path.join(ICI, 'pool-sans-hook.js'), 'utf8');
const IB = (ps.match(/'(0xb20+e4b0[0-9a-f]+)', \/\* IB022/i) || [])[1], BA = (ps.match(/'(0xb20+baa5[0-9a-f]+)'/i) || [])[1];
ok(/^0x[0-9a-f]{40}$/i.test(IB || '') && /^0x[0-9a-f]{40}$/i.test(BA || ''), 'IB022 et baa5 lus dans pool-sans-hook.js : ' + IB + ' · ' + BA);
const COMPTE = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b'; /* compte de simulation de l audit : ne detient ni IB022 ni baa5 */
try {
  const sv = V4_ADRESSES[8453].stateView;
  const mA = await vieDuBlock({ rpc, stateView: sv, jeton: IB, clesExactes: await cles(IB) });
  const mB = await vieDuBlock({ rpc, stateView: sv, jeton: BA, clesExactes: await cles(BA) });
  ok(mA.etat === 'LUE' && mB.etat === 'LUE' && bas(mA.cle.hooks) === bas(T.HOOK_V8) && bas(mB.cle.hooks) === bas(T.HOOK_V8),
    'IB022 et baa5 : marches V8 LUS (' + mA.etat + ' ' + mB.etat + ')');
  const b = BB.sautsBlocVersBloc({ adrA: IB, marcheA: mA, adrB: BA, marcheB: mB });
  ok(b.etat === 'OK' && b.sauts.length === 2, 'IB022 -> baa5 : 2 sauts construits (' + b.etat + ' ' + (b.pourquoi || '') + ')');
  const p = await E.planEchangeMultiSauts({ rpc, chaine: 8453, compte: COMPTE, sauts: b.sauts, entree: IB, sortie: BA,
    montant: 10n ** 24n, decimalesEntree: 18, prixUsdEntree: null, fraisDevisesOk: new Set([USDC]) });
  const r = p.resume || {};
  ok(!!p.resume && BigInt(r.quote || 0) > 0n, 'les DEUX sauts cotes sur le Quoter reel : sortie ' + r.quote + ' baa5 (' + p.etat + ' ' + String(p.pourquoi || '').slice(0, 70) + ')');
  ok(r.blocAbloc === true && r.jambesHook === 2 && r.fraisMarcheBps === 100 && BigInt(r.fraisBps || 0) === 0n && BigInt(r.frais || 0) === 0n && !r.beneficiaireFrais,
    'plan : block -> block, 2 jambes de hook, 100 bps de marche, routeur 0 (' + JSON.stringify({ b: r.blocAbloc, j: r.jambesHook, m: r.fraisMarcheBps, f: String(r.fraisBps) }) + ')');
  ok(['PRET', 'APPROBATIONS', 'REFUSE'].includes(p.etat) && (p.etat !== 'REFUSE' || /not enough|approval/i.test(String(p.pourquoi))),
    'etat attendu pour un compte vide : approbation ou « not enough » — jamais un refus de route (' + p.etat + ')');
  /* ⛔ PAS DE VERT A VIDE : compte vide -> pas d octets. Les octets block -> block sont verifies dans test-r4 (juger2, PRET). */
  if (p.tx) ok(!String(p.tx.data || '').toLowerCase().includes(FEE_WALLET.slice(2).toLowerCase()), 'aucun TAKE vers a6cf dans les octets : ce sont les hooks qui paient');
  else console.log('note  octets non produits ici (compte vide, ' + p.etat + ') — absence de TAKE a6cf verifiee dans test-r4 juger2');
} catch (err) {
  ok(false, 'lecture reseau impossible — NON MESURE, pas un vert : ' + String(err && err.message).slice(0, 100));
}

console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
