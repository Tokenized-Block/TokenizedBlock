// tip 0021 — Instant Birth math (no fork broadcast)
import { mathsNaissanceInstantanee, MARGE_POUR_MILLE } from './lancer-pool.js';
import { CREATE_FEE_WEI_FLOOR } from './frais-creation.js';
import { montantsPosition } from './pool.js';

let fails = 0;
function ok(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); fails++; }
  else console.log('ok:', msg);
}

const supply = 1_000_000_000n * 10n ** 18n;
const aPlacer = (supply * MARGE_POUR_MILLE) / 1000n;

{
  const r = mathsNaissanceInstantanee({ aPlacer, quoteEthWei: 0n, blockEst1: true });
  ok(r.etat === 'REFUSE', 'quoteEth=0 REFUSE');
  ok(/positive ETH seed|quoteEthWei/i.test(r.pourquoi || ''), 'refuse mentions seed: ' + r.pourquoi);
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

ok(true, 'unilateral ethRequis=0 path stays behind quoteEthWei=null in planLancement');

if (fails) { console.error(fails + ' failure(s)'); process.exit(1); }
console.log('ALL PASS tip 0021 Instant Birth math');
