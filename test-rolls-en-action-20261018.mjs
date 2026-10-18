/* test-rolls-en-action-20261018.mjs — UN ROLL PAYE EN ACTION TOKENISEE, ET LE GAIN EN ACTION (rolls-en-action.js).
 * A. Hors reseau, rpc STUB (devis fixes, prix 2 USDC bruts par unite brute d action) :
 *    - la cible cotee = ceil(ceil(besoin / (1 - 10 bps)) / (1 - tolerance)) (0,50 USDC -> 505 557) ;
 *    - le lot : [approve action EXACT -> routeur, multicall vente+balayage, approve USDC EXACTEMENT N x rollPrice -> BlockRolls, N x roll(guess)],
 *      dans cet ordre, exigeAtomique ; minimum apres frais >= besoin ; le reste au compte est dit ;
 *    - CHAQUE refus : rolls hors 1..10, guess hors bornes, un guess par roll, action hors table, chaine != 8453, contrat sans code,
 *      code illisible (NON_MESURE), devis illisible (NON_MESURE), solde court (sansFonds + manque), simulation qui reverte (etape nommee),
 *      simulation illisible (NON_MESURE) ; une recotation courte monte le montant d un pas (tours 2) ;
 *    - le gain : [approve USDC EXACT, achat Aerodrome], minimum = devis x (1 - tol) x (1 - frais), refus solde / table / montant / devis ;
 *    - le quoter est celui de multipool.js (QUOTEUR_CL3) et le calldata de devis est le sien a l octet.
 * B. Base mainnet, LECTURE SEULE (rien n est signe) : factory() du quoter = la factory Aerodrome CL ; NVDAc -> USDC pour 0,50 USDC
 *    d equivalent (montant d action, sortie cotee >= cible) ; 5 USDC -> AAPLc (sortie cotee, apres frais) ; planGainEnAction simule
 *    depuis un payeur riche en USDC (une pool du fork : aucun compte a nous n a 5 USDC a montrer). Chiffres IMPRIMES, rien d envoye.
 * L EXECUTION (fork) est prouvee par banc-rolls-en-action-fork-20261018.mjs. */
import * as R from './rolls-en-action.js';
import * as P from './blockrolls-plan.js';
import { ADRESSES, devisSaut } from './multipool.js';
import { ROUTEUR_AERODROME_CL, FACTORY_AERODROME_CL, SELECTEURS } from './calldata-aerodrome.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { USDC_BASE, FEE_WALLET } from './frais-creation.js';
import { selecteur } from './keccak.js';
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const bas = (a) => String(a || '').toLowerCase();
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const motAdr = (a) => bas(a).slice(2).padStart(64, '0');
const USDC = bas(USDC_BASE), NV = '0xb20000000000000000000078ee7ce2fe4908108c', AA = '0xb200000000000000000000c2e324d24d7eecd1fb';
const C = '0x' + 'cc'.repeat(20), COMPTE = '0x' + 'ab'.repeat(20), ROUTEUR = bas(ROUTEUR_AERODROME_CL);
const GUESS = [2, 3, 4, 5, 6];
const sel = (s) => selecteur(s).slice(2);
const SEL = { balanceOf: sel('balanceOf(address)'), decimals: sel('decimals()'), token0: sel('token0()'), slot0: sel('slot0()'), getPool: SELECTEURS.getPool.slice(2),
  qIn: sel(R.SIG_QUOTE_IN), qOut: sel(R.SIG_QUOTE_OUT) };

/* ── A. le stub : prix 2 USDC bruts par unite brute d action (exact-out : montant = sortie / 2 ; exact-in : sortie = montant x 2) ── */
/* sqrtPriceX96 d un prix token1/token0 = 0,5 (token0 = USDC, token1 = action) : sqrt(0,5) x 2^96 */
const SQRT_DEMI = BigInt(Math.floor(Math.SQRT1_2 * 2 ** 48)) << 48n;
function stub(o = {}) {
  const s = { soldeAction: 10n ** 9n, soldeUsdc: 10n ** 8n, code: '0x6080', codeThrow: false, qOutThrow: false, qInThrow: false, qInCourt: 0, qInPlafond: null, simKo: -1, simThrow: false, ...o };
  const appels = [];
  const rpc = async (m, params) => {
    appels.push({ m, params });
    if (m === 'eth_getCode') { if (s.codeThrow) throw new Error('boom'); return bas(params[0]) === C ? s.code : '0x'; }
    if (m === 'eth_simulateV1') {
      if (s.simThrow) throw new Error('method not found');
      const calls = params[0].blockStateCalls[0].calls;
      return [{ calls: calls.map((_, i) => (i === s.simKo ? { status: '0x0', error: { message: 'execution reverted: TransferFailed' } } : { status: '0x1', returnData: '0x' })) }];
    }
    if (m !== 'eth_call') throw new Error('stub: ' + m);
    const { to, data } = params[0];
    const t = bas(to), d = data.slice(2), fn = d.slice(0, 8), args = d.slice(8).match(/.{64}/g) || [];
    if (t === bas(R.QUOTEUR_AERODROME_CL)) {
      const montant = BigInt('0x' + args[2]);
      /* exact-out : ceil(sortie / 2) — une cible IMPAIRE (505 557) sinon rendrait un montant dont l exact-in fait 1 de moins */
      if (fn === SEL.qOut) { if (s.qOutThrow) throw new Error('execution reverted'); return '0x' + mot((montant + 1n) / 2n) + mot(SQRT_DEMI) + mot(1) + mot(100000); }
      if (fn === SEL.qIn) {
        if (s.qInThrow) throw new Error('execution reverted');
        const court = s.qInCourt > 0; if (court) s.qInCourt -= 1;
        let sortie = court ? montant * 2n - 2n : montant * 2n; /* -2 : avec l exact-out en ceil, -1 retombe exactement sur une cible impaire */
        if (s.qInPlafond !== null && sortie > s.qInPlafond) sortie = s.qInPlafond; /* une pool qui ne rend jamais plus : toujours courte */
        return '0x' + mot(sortie) + mot(SQRT_DEMI) + mot(1) + mot(100000);
      }
    }
    if (t === bas(FACTORY_AERODROME_CL) && fn === SEL.getPool) {
      const a = '0x' + args[0].slice(24), b = '0x' + args[1].slice(24);
      const x = POOLS_ACTIONS_AERODROME.get(a) || POOLS_ACTIONS_AERODROME.get(b);
      return '0x' + motAdr(x ? x.pool : '0x' + '0'.repeat(40));
    }
    if (fn === SEL.token0) return '0x' + motAdr(USDC);
    if (fn === SEL.slot0) return '0x' + mot(SQRT_DEMI) + mot(0) + mot(0) + mot(0) + mot(0) + mot(0) + mot(1);
    if (fn === SEL.decimals) return '0x' + mot(8);
    if (fn === SEL.balanceOf) return '0x' + mot(t === USDC ? s.soldeUsdc : t === NV || t === AA ? s.soldeAction : 0n);
    throw new Error('stub: eth_call ' + t + ' ' + fn);
  };
  return { rpc, appels, s };
}
const base = { chaine: 8453, compte: COMPTE, contrat: C, usdc: USDC, action: NV, guess: GUESS };

/* le quoter et son calldata = multipool.js, a l octet */
ok(bas(R.QUOTEUR_AERODROME_CL) === bas(ADRESSES.QUOTEUR_CL3) && bas(ADRESSES.FACTORY_CL3) === bas(FACTORY_AERODROME_CL), 'le quoter est QUOTEUR_CL3 de multipool.js (factory = FACTORY_AERODROME_CL)');
{ const mine = R.calldataDevis({ tokenIn: NV, tokenOut: USDC, tickSpacing: 10, montant: 123n });
  const leur = devisSaut({ de: NV, vers: USDC, e: { venue: 'aerodrome-cl', factory: 3, tickSpacing: 10 } }, 123n);
  ok(bas(mine.to) === bas(leur.to) && mine.data === leur.data, 'calldata exact-in = devisSaut de multipool.js a l octet'); }
ok(R.calldataDevis({ tokenIn: NV, tokenOut: USDC, tickSpacing: 10, montant: 5n, exactOut: true }).data.startsWith(selecteur(R.SIG_QUOTE_OUT)), 'calldata exact-out porte le selecteur quoteExactOutputSingle');

/* la cible cotee */
ok(R.sortieCibleUsdc({ besoin: 500000n }) === 505557n, '0,50 USDC : cible cotee 505 557 (ceil(ceil(500000/0,999)/0,99))');
/* 3 rolls : ceil(1 500 000 x 10000 / 9990) = 1 501 502 ; ceil(1 501 502 x 10000 / 9900) = 1 516 669 (ma 1re valeur a la main, 1 516 668, etait fausse d un) */
ok(R.sortieCibleUsdc({ besoin: 1500000n }) === 1516669n && R.sortieCibleUsdc({ besoin: 500000n, fraisBps: 0n, toleranceBps: 0n }) === 500000n && R.sortieCibleUsdc({ besoin: 0n }) === null, 'cible : 3 rolls 1 516 669 ; sans frais ni tolerance = besoin ; 0 refuse');

/* le lot, 3 rolls */
{
  const { rpc, appels } = stub();
  const r = await R.planRollEnAction({ rpc, ...base, rolls: 3 });
  ok(r.etat === 'PRET' && r.exigeAtomique === true && r.appels.length === 6, 'planRollEnAction x3 : PRET, 6 appels, atomicite exigee' + (r.pourquoi ? ' — ' + r.pourquoi : ''));
  const d = r.detail || {};
  const cible = R.sortieCibleUsdc({ besoin: 1500000n });
  ok(d.besoinUsdc === 1500000n && d.montantAction === (cible + 1n) / 2n && d.usdcCote >= cible && d.toursDeDevis === 1, 'montant d action = devis exact-out de la cible (' + d.montantAction + ' pour ' + cible + ' USDC), recote en 1 tour');
  ok(r.appels[0].to === NV && r.appels[0].data === '0x095ea7b3' + motAdr(ROUTEUR) + mot(d.montantAction), '1. approve(routeur Aerodrome, montant d action EXACT)');
  ok(r.appels[1].to === ROUTEUR && r.appels[1].data.startsWith(SELECTEURS.multicall) && r.appels[1].data.includes(SELECTEURS.sweepTokenWithFee.slice(2)) && r.appels[1].data.includes(motAdr(FEE_WALLET)), '2. multicall(exactInput, sweepTokenWithFee -> a6cf) sur le routeur');
  ok(r.appels[2].to === USDC && r.appels[2].data === '0x095ea7b3' + motAdr(C) + mot(1500000), '3. approve(BlockRolls, EXACTEMENT 3 x 0,50 USDC) — jamais plus, jamais l infini');
  ok([3, 4, 5].every((i) => r.appels[i].to === C && r.appels[i].data === selecteur(P.SIG_ROLL) + GUESS.map(mot).join('')), '4-6. trois roll(guess) identiques a planRoll');
  ok(d.usdcAuMoins >= d.besoinUsdc && d.usdcAttendu >= d.usdcAuMoins && d.resteUsdcAttendu === d.usdcAttendu - d.besoinUsdc && d.resteUsdcAuMoins === d.usdcAuMoins - d.besoinUsdc,
    'minimum apres frais ' + d.usdcAuMoins + ' >= besoin ; reste attendu ' + d.resteUsdcAttendu + ', au moins ' + d.resteUsdcAuMoins);
  ok(d.fraisBps === 10n && d.fraisAttenduUsdc === d.usdcCote * 10n / 10000n && d.beneficiaireFrais === bas(FEE_WALLET) && d.simule === true && d.decimalesAction === 8 && d.symbole === 'NVDAc', 'frais 10 bps au wallet des frais, simule, 8 decimales, NVDAc');
  /* deux simulations : celle de la vente (planAerodromeSegment, 2 appels) puis celle du LOT (6) — on juge la derniere */
  const sims = appels.filter((a) => a.m === 'eth_simulateV1').map((a) => a.params[0].blockStateCalls[0].calls);
  ok(sims.length === 2 && sims[0].length === 2 && sims[1].length === 6 && sims[1].every((c) => bas(c.from) === COMPTE), 'la vente est simulee (2 appels), puis le LOT ENTIER (6 appels) depuis le compte');
  const g2 = await R.planRollEnAction({ rpc, ...base, guess: null, guesses: [GUESS, [0, 0, 0, 0, 0]], rolls: 2 });
  ok(g2.etat === 'PRET' && g2.appels[4].data === selecteur(P.SIG_ROLL) + [0, 0, 0, 0, 0].map(mot).join(''), 'guesses : un guess par roll, dans l ordre');
}
/* la recotation courte monte d un pas */
{
  const { rpc } = stub({ qInCourt: 1 });
  const r = await R.planRollEnAction({ rpc, ...base });
  const cible = R.sortieCibleUsdc({ besoin: 500000n });
  ok(r.etat === 'PRET' && r.detail.toursDeDevis === 2 && r.detail.montantAction > cible / 2n && r.detail.usdcCote >= cible, 'recotation courte : 2 tours, montant monte (' + r.detail.montantAction + ' > ' + cible / 2n + '), sortie >= cible');
  const r3 = await R.planRollEnAction({ rpc: stub({ qInPlafond: cible - 1n }).rpc, ...base });
  ok(r3.etat === 'REFUSE' && /re-quotes/.test(r3.pourquoi), 'une pool qui plafonne sous la cible : toujours court apres 3 tours, REFUSE (' + String(r3.pourquoi).slice(0, 60) + ')');
}
/* chaque refus */
const refus = async (o, re, m, extra = () => true) => { const r = await R.planRollEnAction({ rpc: stub(o.stub || {}).rpc, ...base, ...o.p }); ok(r.etat === (o.etat || 'REFUSE') && re.test(String(r.pourquoi)) && r.appels.length === 0 && extra(r), m + ' : ' + r.etat + ' — ' + String(r.pourquoi).slice(0, 90)); };
await refus({ p: { rolls: 0 } }, /1\.\.10/, 'rolls 0');
await refus({ p: { rolls: 11 } }, /1\.\.10/, 'rolls 11');
await refus({ p: { rolls: 1.5 } }, /1\.\.10/, 'rolls 1,5');
await refus({ p: { guess: [0, 0, 19, 0, 0] } }, /facet/, 'guess hors bornes (facet 19)');
await refus({ p: { guess: null, guesses: [GUESS], rolls: 2 } }, /one guess per roll/, 'deux rolls, un seul guess');
await refus({ p: { action: '0x' + '12'.repeat(20) } }, /no measured Aerodrome pool/, 'action hors table');
await refus({ p: { action: USDC } }, /plain roll/, 'payer en USDC = le roll ordinaire');
await refus({ p: { chaine: 1 } }, /Base/, 'chaine 1');
await refus({ p: { rollPrice: 0n } }, /roll price/, 'rollPrice 0');
await refus({ p: { toleranceBps: 1001n } }, /tolerance/, 'tolerance > 10 %');
await refus({ stub: { code: '0x' } }, /no code/, 'contrat sans code');
await refus({ stub: { codeThrow: true }, etat: 'NON_MESURE' }, /code could not be read/, 'code illisible');
await refus({ stub: { qOutThrow: true }, etat: 'NON_MESURE' }, /could not be quoted/, 'devis exact-out illisible');
await refus({ stub: { qInThrow: true }, etat: 'NON_MESURE' }, /could not be quoted/, 'devis exact-in illisible');
await refus({ stub: { soldeAction: 1000n } }, /not enough NVDAc/, 'solde d action court', (r) => r.sansFonds === true && r.manque === (R.sortieCibleUsdc({ besoin: 500000n }) + 1n) / 2n - 1000n);
await refus({ stub: { simKo: 3 } }, /step 4/, 'simulation : le 1er roll reverte -> etape 4 nommee', (r) => r.etape === 4 && r.sansFonds === true);
await refus({ stub: { simThrow: true }, etat: 'NON_MESURE' }, /could not be simulated/, 'simulation illisible');
/* simuler: false ne saute que la simulation du LOT : un roll qui reverterait (etape 4) n est plus vu, et detail.simule le DIT ; la vente (2 appels) reste simulee */
{ const r = await R.planRollEnAction({ rpc: stub({ simKo: 3 }).rpc, ...base, simuler: false }); ok(r.etat === 'PRET' && r.detail.simule === false, 'simuler: false -> PRET sans voir le roll qui reverte, detail.simule = false (dit, pas cache)'); }
{ const r = await R.planRollEnAction({ rpc: stub({ simKo: 0 }).rpc, ...base, simuler: false }); ok(r.etat === 'REFUSE' && /selling the stock/.test(r.pourquoi), 'simuler: false : la VENTE reste simulee par planAerodromeSegment (approve qui reverte -> REFUSE)'); }
ok(R.ROLLS_MAX === 10 && R.ETATS.length === 3, 'ROLLS_MAX 10 ; trois etats');

/* le gain en action */
{
  const { rpc } = stub({ soldeUsdc: 5000000n });
  const g = await R.planGainEnAction({ rpc, chaine: 8453, compte: COMPTE, usdc: USDC, action: AA, montantUsdc: 5000000n });
  ok(g.etat === 'PRET' && g.appels.length === 2 && g.exigeAtomique === false, 'planGainEnAction 5 USDC -> AAPLc : PRET, 2 appels, pas de lot exige' + (g.pourquoi ? ' — ' + g.pourquoi : ''));
  const d = g.detail || {};
  ok(g.appels[0].to === USDC && g.appels[0].data === '0x095ea7b3' + motAdr(ROUTEUR) + mot(5000000) && g.appels[1].to === ROUTEUR && g.appels[1].data.startsWith(SELECTEURS.multicall), 'approve(routeur, 5 USDC EXACT) puis multicall achat + balayage');
  const minPools = (10000000n * 9900n) / 10000n;
  ok(d.actionCotee === 10000000n && d.minPools === minPools && d.actionAuMoins === (minPools * 9990n) / 10000n && d.actionAttendue === 10000000n - 10000n && d.fraisAttenduAction === 10000n && d.symbole === 'AAPLc' && d.simule === true,
    'devis 10 000 000 bruts ; minimum pools x 0,99 ; au moins x 0,999 (' + d.actionAuMoins + ') ; frais 10 bps en AAPLc ; simule');
  const q = await R.coterAchatAction({ rpc, action: AA, montantUsdc: 5000000n });
  ok(q.etat === 'PRET' && q.actionCotee === 10000000n && q.actionAttendue === d.actionAttendue, 'coterAchatAction (lecture seule) = le devis du plan');
  const gr = async (o, re, m) => { const r = await R.planGainEnAction({ rpc: stub(o.stub || {}).rpc, chaine: 8453, compte: COMPTE, usdc: USDC, action: AA, montantUsdc: 5000000n, ...o.p }); ok(r.etat === (o.etat || 'REFUSE') && re.test(String(r.pourquoi)) && r.appels.length === 0, m + ' : ' + r.etat + ' — ' + String(r.pourquoi).slice(0, 80)); };
  await gr({ stub: { soldeUsdc: 4999999n } }, /not enough USDC/, 'gain : USDC court');
  await gr({ p: { action: '0x' + '12'.repeat(20) } }, /no measured Aerodrome pool/, 'gain : action hors table');
  await gr({ p: { montantUsdc: 0n } }, /above zero/, 'gain : montant 0');
  await gr({ p: { chaine: 84532 } }, /Base/, 'gain : chaine 84532');
  await gr({ stub: { qInThrow: true }, etat: 'NON_MESURE' }, /could not be quoted/, 'gain : devis illisible');
  await gr({ stub: { simKo: 1 } }, /buying the stock/, 'gain : l achat reverte en simulation');
}

/* ── B. Base mainnet, lecture seule ── */
let id = 0;
const rpcReel = async (method, params) => {
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
try {
  const bloc = parseInt(await rpcReel('eth_blockNumber', []), 16);
  const fab = '0x' + String(await rpcReel('eth_call', [{ to: R.QUOTEUR_AERODROME_CL, data: selecteur('factory()') }, 'latest'])).slice(-40);
  ok(bas(fab) === bas(FACTORY_AERODROME_CL), 'mainnet (bloc ' + bloc + ') : factory() du quoter = la factory Aerodrome CL ' + fab);
  const cible = R.sortieCibleUsdc({ besoin: 500000n });
  const v = await R.coterVenteAction({ rpc: rpcReel, action: NV, sortieVisee: cible });
  ok(v.etat === 'PRET' && v.usdcCote >= cible && v.montantAction > 0n, 'mainnet : 0,50 USDC de roll = ' + (v.montantAction || '?') + ' NVDAc bruts (' + (Number(v.montantAction || 0) / 1e8).toFixed(8) + ' NVDAc) -> ' + (Number(v.usdcCote || 0) / 1e6).toFixed(6)
    + ' USDC cotes (cible ' + (Number(cible) / 1e6).toFixed(6) + ', ' + v.tours + ' tour(s)) — ' + v.etat + (v.pourquoi ? ' ' + v.pourquoi : ''));
  const a = await R.coterAchatAction({ rpc: rpcReel, action: AA, montantUsdc: 5000000n });
  ok(a.etat === 'PRET' && a.actionAttendue > 0n, 'mainnet : 5 USDC de gain = ' + (a.actionCotee || '?') + ' AAPLc bruts cotes (' + (Number(a.actionCotee || 0) / 1e8).toFixed(8) + ' AAPLc), ' + (Number(a.actionAttendue || 0) / 1e8).toFixed(8) + ' apres notre frais de 0,1 % — ' + a.etat + (a.pourquoi ? ' ' + a.pourquoi : ''));
  /* le plan complet du gain, simule depuis un payeur riche en USDC (la pool AMZNc : rien n est signe, c est un eth_simulateV1) */
  const payeur = POOLS_ACTIONS_AERODROME.get('0xb200000000000000000000d9192b6b456483c2e8').pool;
  const g = await R.planGainEnAction({ rpc: rpcReel, chaine: 8453, compte: payeur, action: AA, montantUsdc: 5000000n });
  ok(['PRET', 'NON_MESURE'].includes(g.etat), 'mainnet : planGainEnAction 5 USDC -> AAPLc depuis un payeur riche : ' + g.etat + (g.pourquoi ? ' — ' + String(g.pourquoi).slice(0, 120) : ' ; au moins ' + (Number(g.detail.actionAuMoins) / 1e8).toFixed(8) + ' AAPLc, simule ' + g.detail.simule));
  const sansContrat = await R.planRollEnAction({ rpc: rpcReel, chaine: 8453, compte: payeur, contrat: C, usdc: USDC, action: NV, guess: GUESS });
  /* 2026-10-18 : rouge UNE fois sous la serie (3 en parallele), vert seul x3 — la raison part dans le libelle (le runner n imprime que les KO) */
  ok(sansContrat.etat === 'REFUSE' && /no code/.test(sansContrat.pourquoi), 'mainnet : BlockRolls n est pas deploye -> planRollEnAction REFUSE sur le code, rien de bati ('
    + sansContrat.etat + ' — ' + String(sansContrat.pourquoi || '').slice(0, 120) + ')');
} catch (err) {
  ok(false, 'lecture reseau impossible — NON MESURE, pas un vert : ' + String(err && err.message).slice(0, 100));
}
console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
