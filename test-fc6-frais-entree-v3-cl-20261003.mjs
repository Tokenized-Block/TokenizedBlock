/* test-fc6-frais-entree-v3-cl-20261003.mjs — « ACHETER AVEC USDC » SUR UN MARCHE V3 / AERODROME : a6cf N EST JAMAIS PAYE DANS
 * UN BLOCK NI DANS UN JETON TIERS (Zero 1, F-c6, KO sur bd6b6ce ; regle : ETH / USDC / action appariee seulement).
 *   Fork de Zero 1 : USDC -> XC sur la pool CL 0x3dfdecc3… (ts 200), plan PRET, a6cf recevait 579 545 475 176 244 939 wei de XC
 *   par sweepTokenWithFee. Correctifs : (1) planAchatUsdcV3 refuse un block TB AVANT toute lecture (garde de Zero 1) ;
 *   (2) sur Aerodrome (frais en SORTIE) le frais n est pris que si la sortie est une devise connue ; (3) garde de profondeur
 *   dans calldataExactInputAvecFrais ; (4) Uniswap v3 : frais sur l ENTREE USDC (PERMIT2_TRANSFER_FROM), inchange.
 * R8 (logique inversee, C2) : XC n est pas dans la liste blanche -> traite en block dans TOUS les etats de l index (REFUSE avant
 *   toute lecture). Le jeton NON TB libere est PEXRA (liste explicite), et seulement sources TB lues.
 * XC = 0xb200000000000000000000cfbdf64a8706a94a01 : sa pool CL USDC/XC est nee au bloc 50 490 577 (avant le Block 0 de TB,
 *   50 861 088, et avant le CreateRouter, 51 354 834) — PAS un block TB au sens R6 ; il n est refuse que si l index est illisible.
 * ⛔ TEMOINS NEGATIFS : copie du depot (verte), puis mutants (chacun doit rougir). Le rpc est scripte et COMPTE ses appels. */
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (dir, f) => import(pathToFileURL(path.join(dir, f)).href);
const charger = async (dir) => ({ V3: await imp(dir, 'echange-v3.js'), PO: await imp(dir, 'pool.js'), PU: await imp(dir, 'plan-usdc-block.js'),
  A: await imp(dir, 'calldata-aerodrome.js'), F: await imp(dir, 'frais-creation.js'), IR: await imp(dir, 'index-routeur.js'),
  P: await imp(dir, 'paires.js'), LP: await imp(dir, 'lancer-pool.js'), PE: await imp(dir, 'plan-eth-block.js') });
const bas = (a) => String(a).toLowerCase();
const XC = '0xb200000000000000000000cfbdf64a8706a94a01';
const POOL_XC = '0x3dfdecc334a8f2618321c78a9de0e9428438f871';
const PEXRA = '0xb200000000000000000000c21042dc554628d2ac';
const NE_ROUTEUR = '0xb20000000000000000000005090fb1d9da0e5949';
const POOL_X = '0x' + '7'.repeat(40);
const COMPTE = '0x041e9e88288c0c62b8549c50a759a74a1a65b6b7';
const MAINTENANT = 1790604967;
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const motAdr = (a) => bas(a).replace(/^0x/, '').padStart(64, '0');

async function banc(M) {
  const { V3, PO, PU, A, F, IR, P, LP, PE } = M;
  const res = [];
  const v = (id, ok, detail = '') => res.push({ id, ok: !!ok, detail });
  const USDC = bas(PU.USDC_BASE), A6 = bas(F.FEE_WALLET).slice(2);
  const TSLA = bas(P.ACTIONS_COINBASE.find((a) => a.symbole === 'TSLAc').adr);
  const sel = (s) => PO.selecteur(s).replace(/^0x/, '');
  /* rpc scripte : une pool (famille, jeton) dont la factory confirme l adresse ; allowances pleines ; simulation OK */
  const faireRpc = ({ jeton, pool, famille, ts = 200, fee = 10000 }) => {
    const journal = [];
    const [t0, t1] = bas(USDC) < bas(jeton) ? [USDC, bas(jeton)] : [bas(jeton), USDC];
    const fab = bas(famille === 'cl' ? A.FACTORY_AERODROME_CL : V3.FACTORY_UNISWAP_V3);
    const rpc = async (m, params) => {
      const p = (params && params[0]) || {};
      const to = bas(p.to || ''), s = String(p.data || '').replace(/^0x/, '').slice(0, 8);
      journal.push({ to, s });
      if (p.from) return '0x';
      if (to === bas(pool)) {
        if (s === sel('slot0()')) return '0x' + mot(2n ** 96n) + mot(0).repeat(6);
        if (s === sel('fee()')) return '0x' + mot(fee);
        if (s === sel('token0()')) return '0x' + motAdr(t0);
        if (s === sel('token1()')) return '0x' + motAdr(t1);
        if (s === sel('tickSpacing()')) return '0x' + mot(ts);
        if (s === sel('liquidity()')) return '0x' + mot(10n ** 30n);
      }
      if (to === fab) return '0x' + motAdr(pool);
      if (to === USDC && s === sel('allowance(address,address)')) return '0x' + mot(1n << 200n);
      if (to === bas(LP.PERMIT2)) return '0x' + mot(1n << 150n) + mot(BigInt(MAINTENANT + 86400)) + mot(0);
      throw new Error('execution reverted: unscripted ' + to + ' ' + s);
    };
    return { rpc, journal };
  };
  const achat = async (jeton, pool, famille, ts) => {
    const { rpc, journal } = faireRpc({ jeton, pool, famille, ts });
    const r = await V3.planAchatUsdcV3({ rpc, compte: COMPTE, block: jeton, pool, montantUsdc: 100000000n, famille, toleranceBps: 100, maintenantSec: MAINTENANT });
    return { r, lectures: journal.length };
  };
  const pret = (r) => r.etat === 'PRET' || r.etat === 'APPROBATIONS';
  const data = (r) => bas((r.plan && r.plan.appel && r.plan.appel.data) || '');
  const LU = () => { IR.chargerIndexRouteur({ ok: true, couvertureComplete: true, fenetresRatees: 0, tete: 1, jusqua: 1, teteLueA: Date.now(),
    blocks: IR.GRAINE_ROUTEUR.map((g) => ({ jeton: g.jeton, sel: g.sel })) }); IR.chargerNosBlocksTb({ ok: true, couvertureComplete: true, fenetresRatees: 0, tete: 1, jusqua: 1, teteLueA: Date.now(), blocks: ['0xb20000000000000000000024c30d3fcb7931272e'] }); };

  LU();
  /* ══ 1. un block TB : REFUSE avant toute lecture de chaine ══ */
  for (const fam of ['cl', 'v3']) {
    const { r, lectures } = await achat(NE_ROUTEUR, POOL_X, fam, 200);
    v('TB ' + fam + ' : block ne du routeur -> REFUSE, 0 lecture', r.etat === 'REFUSE' && r.refusBlocSansHookTb === true && lectures === 0, r.etat + ' lectures=' + lectures);
  }
  { const { r, lectures } = await achat(XC, POOL_XC, 'cl', 200);
    v('TB XC index LU (hors liste blanche = block) -> REFUSE, 0 lecture', r.etat === 'REFUSE' && r.refusBlocSansHookTb === true && lectures === 0, r.etat + ' lectures=' + lectures); }
  IR.indexRouteurIllisible('test');
  { const { r, lectures } = await achat(XC, POOL_XC, 'cl', 200);
    v('TB XC index illisible -> REFUSE, 0 lecture', r.etat === 'REFUSE' && lectures === 0, r.etat + ' lectures=' + lectures);
    const p = await achat(PEXRA, POOL_X, 'cl', 200);
    v('TB PEXRA index illisible : rien n est libere -> REFUSE, 0 lecture', p.r.etat === 'REFUSE' && p.lectures === 0, p.r.etat); }
  LU();
  /* ══ 2. jeton NON TB : a6cf jamais paye dans ce jeton ; Uniswap v3 : frais pris sur l ENTREE USDC ══ */
  { const { r } = await achat(PEXRA, POOL_X, 'cl', 200);
    v('NT PEXRA sur Aerodrome (sources lues, tiers libere) : planifie, AUCUN frais dans PEXRA (a6cf absent du calldata)', pret(r) && r.plan && r.plan.beneficiaireFrais === null
      && Number(r.plan.fraisBps) === 0 && !data(r).includes(A6), r.etat + ' ' + (r.pourquoi || '') + ' benef=' + (r.plan && r.plan.beneficiaireFrais)); }
  { const { r } = await achat(PEXRA, POOL_X, 'v3', 0);
    v('NT PEXRA sur Uniswap v3 : frais sur l ENTREE USDC vers a6cf', pret(r) && r.plan && bas(r.plan.beneficiaireFrais || '') === bas(F.FEE_WALLET)
      && Number(r.plan.fraisBps) > 0 && r.plan.jetonPaye === USDC && data(r).includes(A6), r.etat + ' ' + (r.pourquoi || '')); }
  /* ══ 3. TSLAc (action appariee) : toujours PRET, frais pris ══ */
  { const { r } = await achat(TSLA, POOL_X, 'cl', 10);
    v('TSLAc sur Aerodrome : PRET, frais a6cf (en action appariee)', pret(r) && r.plan && bas(r.plan.beneficiaireFrais || '') === bas(F.FEE_WALLET) && data(r).includes(A6), r.etat + ' ' + (r.pourquoi || '')); }
  { const { r } = await achat(TSLA, POOL_X, 'v3', 0);
    v('TSLAc sur Uniswap v3 : PRET, frais sur l entree USDC', pret(r) && r.plan && Number(r.plan.fraisBps) > 0 && data(r).includes(A6), r.etat + ' ' + (r.pourquoi || '')); }
  /* ══ 4. garde de profondeur : tout rail CL refuse un frais pris dans une sortie qui n est pas une devise ══ */
  const avec = (vers) => A.calldataExactInputAvecFrais({ sauts: [{ de: USDC, vers, tickSpacing: 200 }], recipient: COMPTE, amountIn: 10n ** 8n,
    amountOutMinimum: 10n ** 12n, deadline: BigInt(MAINTENANT + 300), maintenant: BigInt(MAINTENANT), fraisBps: 10, beneficiaireFrais: F.FEE_WALLET });
  const gx = avec(XC), gt = avec(TSLA), gw = avec('0x4200000000000000000000000000000000000006');
  v('GARDE sweep dans XC -> REFUSE', gx.etat === 'REFUSE' && gx.refusFraisHorsDevise === true, gx.etat);
  v('GARDE sweep dans TSLAc / WETH -> PRET', gt.etat === 'PRET' && gw.etat === 'PRET', gt.etat + ' ' + gw.etat + ' ' + (gt.pourquoi || gw.pourquoi || ''));
  /* ══ 5. rail voisin ETH -> USDC -> action -> block (plan-eth-block, Aerodrome) : pas de frais dans le block, frais sur l action ══
   *   Pools REELLES recopiees de test-plan-eth-trois-sauts.mjs (MUc / TE). */
  const PIV = [{ pool: '0x493e74eda2720e127baccc1a19b2d567bc14ab43', tickSpacing: 10, fee: 500, wethEst0: true, famille: 'aerodrome', sqrtPriceX96: '4102067387922704494368960' }];
  const MUC = '0xb200000000000000000000fd2f87532b90095211', TE = '0x3c573bdd88008c94f025e5023212f28e5f39744c';
  const deux = { action: MUC, montantWei: 10n ** 18n, poolsPivot: PIV, recipient: COMPTE, deadline: BigInt(MAINTENANT + 300), maintenant: BigInt(MAINTENANT),
    poolAction: { pool: '0x17e1beb2cd65493da73ed4bbbc7becaaa0f91c73', tickSpacing: 10, fee: 500, actionEst0: false, famille: 'aerodrome', sqrtPriceX96: '24238673428508397000179791066' },
    beneficiaireFrais: F.FEE_WALLET };
  const trois = { ...deux, block: TE, poolBlock: { pool: '0x8d6ad9946b9220e666690e77ce49f933e1ff15c9', tickSpacing: 80, fee: 10000, blockEst0: true, famille: 'aerodrome', sqrtPriceX96: '396113904605052806495' } };
  const e3 = PE.planEthVersAction(trois), e2 = PE.planEthVersAction(deux);
  const d3 = bas((e3.appels && e3.appels[0] && e3.appels[0].data) || ''), d2 = bas((e2.appels && e2.appels[0] && e2.appels[0].data) || '');
  v('ETH3 ETH->USDC->MUc->TE : PRET, AUCUN frais dans le block', e3.etat === 'PRET' && !d3.includes(A6) && e3.beneficiaireFrais === null, e3.etat + ' ' + (e3.pourquoi || ''));
  v('ETH2 ETH->USDC->MUc : frais a6cf sur l action appariee', e2.etat === 'PRET' && d2.includes(A6) && d2.includes('e0e189a0'), e2.etat + ' ' + (e2.pourquoi || ''));
  return res;
}

const tmp = [];
function copie(mutation) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-fc6-')); tmp.push(dir);
  for (const f of fs.readdirSync(ICI)) if (/\.js$/.test(f) || f === 'package.json') fs.copyFileSync(path.join(ICI, f), path.join(dir, f));
  for (const [fichier, de, vers] of (mutation ? mutation.edits : [])) {
    const p = path.join(dir, fichier);
    const src = fs.readFileSync(p, 'utf8');
    const n = src.split(de).length - 1;
    if (n !== 1) throw new Error('mutant ' + mutation.nom + ' : motif trouve ' + n + ' fois dans ' + fichier + ' (attendu 1)');
    fs.writeFileSync(p, src.replace(de, vers));
  }
  return dir;
}
let nAssert = 0, ko = 0;
const ok = (c, m) => { nAssert += 1; if (!c) { ko += 1; console.log('  KO ' + m); } };
const MUTANTS = [
  { nom: 'm1 garde F-c6 de Zero 1 retiree', edits: [['echange-v3.js', "if (estBlockAJonction(block)) return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusBlocSansHookTb: true };", '']], casse: [/^TB /] },
  { nom: 'm2 frais CL meme si la sortie n est pas une devise', edits: [['echange-v3.js', '(porteNotreFrais(porteFrais) && estDeviseConnue(block))', 'porteNotreFrais(porteFrais)']], casse: [/^NT PEXRA sur Aerodrome/] },
  { nom: 'm2b frais CL coupe pour tout le monde', edits: [['echange-v3.js', '(porteNotreFrais(porteFrais) && estDeviseConnue(block))', 'false']], casse: [/^TSLAc sur Aerodrome/] },
  { nom: 'm3 garde de profondeur retiree', edits: [['calldata-aerodrome.js', "if (sortieFrais && !estDeviseConnue(sortieFrais) && sortieFrais !== WETH_SORTIE_FRAIS) {", 'if (false) {']], casse: [/^GARDE sweep dans XC/] },
  { nom: 'm5 plan-eth-block : frais meme dans un block (garde F-c6 retiree, garde de profondeur aussi)', edits: [['plan-eth-block.js', '&& estDeviseConnue(troisSauts ? block : action);', ';'], ['calldata-aerodrome.js', "if (sortieFrais && !estDeviseConnue(sortieFrais) && sortieFrais !== WETH_SORTIE_FRAIS) {", 'if (false) {']], casse: [/^ETH3 /] },
  { nom: 'm5b plan-eth-block : garde F-c6 retiree seule (la profondeur refuse alors l achat)', edits: [['plan-eth-block.js', '&& estDeviseConnue(troisSauts ? block : action);', ';']], casse: [/^ETH3 /] },
  { nom: 'm4 frais v3 sur l entree retire', edits: [['plan-usdc-block.js', "const fraisV3 = famille === 'v3' &&", 'const fraisV3 = false &&']], casse: [/^NT PEXRA sur Uniswap v3/, /^TSLAc sur Uniswap v3/] },
];
try {
  const reel = await banc(await charger(ICI));
  for (const r of reel) { ok(r.ok, 'depot : ' + r.id + ' — ' + r.detail); if (r.ok) console.log('  ok  ' + r.id); }
  console.log('depot : ' + reel.length + ' verifications, ' + reel.filter((r) => !r.ok).length + ' KO');
  const t = await banc(await charger(copie(null)));
  ok(t.length > 0 && t.every((r) => r.ok), 'copie non mutee : verte');
  for (const M of MUTANTS) {
    const r = await banc(await charger(copie(M)));
    const rouges = r.filter((x) => !x.ok).map((x) => x.id);
    console.log('mutant ' + M.nom + ' : ' + rouges.length + ' rouge(s) — ' + rouges.join(' | '));
    ok(rouges.length > 0, 'mutant ' + M.nom + ' : le banc doit devenir ROUGE');
    for (const re of M.casse) ok(rouges.some((id) => re.test(id)), 'mutant ' + M.nom + ' : doit casser ' + re);
  }
} finally { for (const d of tmp) fs.rmSync(d, { recursive: true, force: true }); }
console.log(nAssert + ' assertions, ' + ko + ' KO');
if (nAssert === 0) { console.log('⛔ aucune assertion executee'); process.exit(1); }
process.exit(ko ? 1 : 0);
