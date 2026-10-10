/* test-bloc-vers-action-20261003.mjs — VENDRE UN BLOCK CONTRE UNE ACTION TOKENISEE (Phil : « Blocks/stock et stocks/blocks »).
 * A. bloc-vers-bloc.js : cheminBlocVersAction (forme de test-r4 FR3), actionsRecevables (Aerodrome seulement). Hors reseau.
 * B. Base mainnet, LECTURE SEULE : IB022 -> NVDAc par planFranchissement avec le meme resolveur que l app. Le compte de
 *    simulation ne detient rien : on exige que le LOT soit construit et cote (pas un refus de forme ni de route), avec
 *    UN frais par lot, celui du hook (jambe 1), routeur 0. Ne prouve PAS un echange execute.
 * C. app.html : « Receive » liste les actions, la vente passe par planFranchissement, l ecran re-prepare en VENTE. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const BB = await imp('bloc-vers-bloc.js');
const PF = await imp('plan-franchissement.js');
const E = await imp('echange.js');
const T = await imp('tokenomics.js');
const P = await imp('paires.js');
const { vieDuBlock } = await imp('marche.js');
const { V4_ADRESSES } = await imp('lancer-pool.js');
const { CLES_PRIX } = await imp('prix-eth.js');
const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const bas = (a) => String(a || '').toLowerCase();
const ETH = '0x' + '0'.repeat(40), USDC = bas(USDC_BASE);

/* ── A ── */
const A = '0xb2' + '0'.repeat(20) + '1'.repeat(18), X = '0xb2' + '0'.repeat(20) + '9'.repeat(18);
const cle = (x, y) => { const [c0, c1] = bas(x) < bas(y) ? [x, y] : [y, x]; return { currency0: c0, currency1: c1, fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 }; };
const cE = BB.cheminBlocVersAction({ adrA: A, marcheA: { etat: 'LUE', cle: cle(ETH, A) }, action: X });
ok(cE.etat === 'OK' && cE.chemin.length === 3 && cE.chemin.map((h) => h.famille).join() === 'uniswap-v4,uniswap-v4,aerodrome'
  && bas(cE.chemin[1].vers) === USDC && bas(cE.chemin[2].vers) === bas(X), 'block cote ETH : A -> ETH -> USDC (v4) -> action (Aerodrome)');
const cU = BB.cheminBlocVersAction({ adrA: A, marcheA: { etat: 'LUE', cle: cle(USDC, A) }, action: X });
ok(cU.etat === 'OK' && cU.chemin.length === 2, 'block cote USDC : A -> USDC (v4) -> action (Aerodrome)');
ok(BB.cheminBlocVersAction({ adrA: A, marcheA: { etat: 'LUE', cle: cle(X, A) }, action: X }).etat === 'REFUSE', 'autre cotation : REFUSE, rien d invente');
ok(BB.cheminBlocVersAction({ adrA: A, marcheA: { etat: 'NON_LUE' }, action: X }).etat === 'REFUSE', 'marche illisible : REFUSE');
const ar = BB.actionsRecevables({ marches: [[X, { dex: 'aerodrome', poolAdr: '0x' + 'a'.repeat(40), liquiditeUsd: 9 }], [A, { dex: 'uniswap', poolAdr: null, liquiditeUsd: 99 }]],
  actions: [{ adr: X, symbole: 'XXc' }, { adr: A, symbole: 'AAc' }] });
ok(ar.length === 1 && ar[0].symbole === 'XXc', 'actionsRecevables : seulement celles dont le marche est Aerodrome');

/* ── C ── */
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
ok(/actionsRecevables\(\{ marches: marcheParAdr, actions: ACTIONS_COINBASE \}\)/.test(html) && /o\.dataset\.kind = 'action'/.test(html), '« Receive » liste les actions (Aerodrome)');
ok(/if \(optC && optC\.dataset\.kind === 'action'\) \{/.test(html) && /planFranchissement\(\{ rpc, chaine: CHAINE, compte, chemin: c\.chemin, devise: adr, block: cible,/.test(html),
  'vente vers une action : planFranchissement (le moteur existant), entree = le block, sortie = l action');
ok(/afficherFranchissement\(\{ pf, e, dec, symBlock: symCible, symPaye: symProfil \|\| 'blocks', relance: 'VENTE' \}\)/.test(html)
  && /void preparerEchange\(relance\)\);/.test(html) && /signerEchange\(et, relance, true\)/.test(html), 'ecran du franchissement : relance et approbation dans le sens VENTE');

/* ── B. Base mainnet, lecture seule ── */
let id = 0;
const rpc = async (method, params) => {
  let der;
  for (let e = 0; e < 5; e += 1) for (const url of ['https://mainnet.base.org', 'https://base-rpc.publicnode.com']) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' }, signal: AbortSignal.timeout(30000),
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
      if (r.error) { const err = new Error(r.error.message + (r.error.data ? ' data=' + r.error.data : '')); err.data = r.error.data; throw err; }
      return r.result;
    } catch (err) { der = err; if (!/rate|limit|429|timeout|ECONN|fetch failed|network|503|502|504|too many|socket|aborted/i.test(String(err.message))) throw err; await new Promise((o) => setTimeout(o, 700)); }
  }
  throw der;
};
const ps = fs.readFileSync(path.join(ICI, 'pool-sans-hook.js'), 'utf8');
const IB = (ps.match(/'(0xb20+e4b0[0-9a-f]+)', \/\* IB022/i) || [])[1];
const NV = P.ACTIONS_COINBASE.find((a) => a.symbole === 'NVDAc').adr;
const COMPTE = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
try {
  let cles = [];
  try { const d = await fetch('https://tokenizedblock.space/api/cle/' + bas(IB), { headers: { 'x-ms-monitor': '1' } }).then((r) => r.json()); cles = d.ok ? d.cles : []; } catch (_) {}
  const mA = await vieDuBlock({ rpc, stateView: V4_ADRESSES[8453].stateView, jeton: IB, clesExactes: cles });
  ok(mA.etat === 'LUE' && bas(mA.cle.hooks) === bas(T.HOOK_V8), 'IB022 : marche V8 lu (' + mA.etat + ')');
  const c = BB.cheminBlocVersAction({ adrA: IB, marcheA: mA, action: NV });
  const resoudre = async ({ de, vers, montant }) => {
    const paire = new Set([bas(de), bas(vers)]);
    const k = paire.has(bas(mA.cle.currency0)) && paire.has(bas(mA.cle.currency1)) ? mA.cle : null;
    const sup = k ? [{ fee: Number(k.fee), tickSpacing: Number(k.tickSpacing), hooks: k.hooks }] : [];
    return E.meilleureClePourMontant({ rpc, chaine: 8453, de, vers, montant, candidates: sup.concat(CLES_PRIX) });
  };
  const pf = await PF.planFranchissement({ rpc, chaine: 8453, compte: COMPTE, chemin: c.chemin, devise: IB, block: NV, montant: 10n ** 24n,
    decimalesEntree: 18, prixUsdEntree: null, resoudreV4: resoudre, beneficiaireFrais: FEE_WALLET, fraisDevisesOk: new Set([USDC]) });
  const r = pf.resume || {};
  console.log('    plan :', pf.etat, String(pf.pourquoi || pf.etape || '').slice(0, 120));
  ok(['PRET', 'APPROBATIONS'].includes(pf.etat) || (pf.etat === 'REFUSE' && /not enough|approval|balance|insufficient/i.test(String(pf.pourquoi))),
    'IB022 -> NVDAc : forme acceptee, jambe 1 (vente sur V8) cotee et simulee jusqu au solde — ' + pf.etat
      /* 2026-10-10 : la RAISON part dans le libelle - un KO en serie la jetait (le runner n imprime que les lignes KO) */
      + (pf.etat === 'REFUSE' ? ' (' + String(pf.pourquoi || '').slice(0, 140) + ')' : '')
    + (pf.etat === 'REFUSE' ? ' ; jambe Aerodrome NON atteinte avec un compte vide (FR3 de test-r4 la juge)' : ''));
  if (pf.resume) ok(r.jambesPayantes === 1 && r.fraisParHook === true && BigInt(r.fraisBpsJambe1 || 0) === 0n && BigInt(r.fraisBpsJambe2 || 0) === 0n,
    'UN frais par lot, celui du hook V8 (jambe 1), routeur 0 sur les deux jambes');
  else console.log('note  pas de resume (etat ' + pf.etat + ') : frais non juges ici — FR3 de test-r4 les juge sur RPC fictif');
} catch (err) {
  ok(false, 'lecture reseau impossible — NON MESURE, pas un vert : ' + String(err && err.message).slice(0, 100));
}
console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
