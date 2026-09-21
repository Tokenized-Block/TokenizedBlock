// Instant Birth index-launch patch — math + fee invariant (no fork broadcast)
import { mathsNaissanceInstantanee, MARGE_POUR_MILLE, MICRO_SWAP_ETH_WEI, construireAppelMicroSwapNaissance } from './lancer-pool.js';
import { CREATE_FEE_WEI_FLOOR, FRAIS_OUVERTURE_WEI } from './frais-creation.js';
import { montantsPosition } from './pool.js';
import { HOOK_PREVU } from './tokenomics.js';

let fails = 0;
function ok(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); fails++; }
  else console.log('ok:', msg);
}

const supply = 1_000_000_000n * 10n ** 18n;
const aPlacer = (supply * MARGE_POUR_MILLE) / 1000n;

{
  const r = mathsNaissanceInstantanee({ aPlacer, quoteEthWei: 0n, blockEst1: true });
  ok(r.etat === 'REFUSE', 'quoteEth=0 REFUSE (dust fail-closed)');
  ok(/positive ETH seed|quoteEthWei/i.test(r.pourquoi || ''), 'refuse mentions seed: ' + r.pourquoi);
}

{
  const r = mathsNaissanceInstantanee({ aPlacer, quoteEthWei: null, blockEst1: true });
  ok(r.etat === 'REFUSE', 'quoteEth=null REFUSE');
}

{
  const quote = CREATE_FEE_WEI_FLOOR;
  const r = mathsNaissanceInstantanee({ aPlacer, quoteEthWei: quote, blockEst1: true });
  ok(r.etat === 'OK', 'quoteEth>0 OK: ' + (r.pourquoi || ''));
  ok(r.ethRequis > 0n, 'ethRequis > 0 ⇒ tx.value would be set');
  ok(r.ethRequis <= quote, 'ethRequis <= quote');
  ok(r.blocksRequis > 0n, 'blocksRequis > 0');
  ok(r.tickHaut > r.tickBas, 'range open');
  const m = montantsPosition(r.L, r.sqrtVise, r.sqA, r.sqB);
  ok(m.regime === 'DANS_LA_PLAGE', 'straddles price');
  ok(m.montant0 > 0n && m.montant1 > 0n, 'both ETH and tokens required');
}

{
  const quote = 10n ** 18n;
  const r = mathsNaissanceInstantanee({ aPlacer, quoteEthWei: quote, blockEst1: true });
  ok(r.etat === 'OK', '1 ETH seed OK');
  ok(r.ethRequis > 0n, '1 ETH ethRequis > 0');
}

ok(FRAIS_OUVERTURE_WEI === 1000000000000000n, 'FRAIS_OUVERTURE_WEI === 0.001 ETH (1e15) UNCHANGED');
ok(FRAIS_OUVERTURE_WEI === 10n ** 15n, 'FRAIS_OUVERTURE_WEI === 10n**15');
ok(FRAIS_OUVERTURE_WEI > CREATE_FEE_WEI_FLOOR, 'open fee still above CreateRouter floor');
ok(MICRO_SWAP_ETH_WEI > 0n && MICRO_SWAP_ETH_WEI < CREATE_FEE_WEI_FLOOR, 'micro-swap tiny but > 0');

{
  const cle = {
    currency0: '0x0000000000000000000000000000000000000000',
    currency1: '0xb200000000000000000000000000000000000001',
    fee: 0, tickSpacing: 200, hooks: HOOK_PREVU,
  };
  const ms = construireAppelMicroSwapNaissance({ cle, chaine: 8453, blockEst1: true });
  ok(ms.etat === 'OK', 'micro-swap call builds');
  ok(ms.call && ms.call.to && ms.call.data && ms.call.value, 'micro-swap has to/data/value');
  ok(BigInt(ms.call.value) === MICRO_SWAP_ETH_WEI, 'micro-swap value matches constant');
}

ok(String(HOOK_PREVU).toLowerCase() === '0xaa6d7bd9fc7d394bc717137936f2939834382044', 'HOOK_PREVU unchanged');

if (fails) { console.error(fails + ' failure(s)'); process.exit(1); }
console.log('ALL PASS Instant Birth index-launch math + fee invariant');
