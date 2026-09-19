// test-decimales-lancement.mjs — la plage d un lancement et son prix de depart restent ALIGNES quand la paire n a pas les
// memes decimales que le block (action Coinbase : 8 ; block : 18). ⛔ L erreur visee : une plage posee a ~230 000 ticks du
// prix (facteur 1e10), comme le sqrtPrice faux de 1e8 publie le 2026-09-06. Test ALLER-RETOUR : il ne peut pas se tromper
// deux fois dans le meme sens.
import assert from 'node:assert/strict';
import { parametresLancement } from './lancement.js';
import { sqrtPriceDepuisPrix } from './pool.js';

const ESP = 200;
const tickDeSqrt = (sq) => Math.floor(Math.log(Number(sq) ** 2 / 2 ** 192) / Math.log(1.0001));
let n = 0;

function verifier({ supply, valo, decBlock, decDevise }) {
  const pm = parametresLancement({ supply: BigInt(supply), valorisationEth: valo, espacement: ESP, ecartDecimales: decBlock - decDevise });
  assert.equal(pm.etat, 'OK', JSON.stringify(pm));
  /* block = currency1 : sqrtPrice de 1 unite de devise en blocks, calcule par l autre chemin (celui de l initialisation) */
  const sq = sqrtPriceDepuisPrix({ prixNum: BigInt(Math.round(valo * 1e6)), prixDen: BigInt(supply) * 1000000n,
    decDevise, decBlock, deviseEst0: true });
  const t = tickDeSqrt(sq);
  /* tickPrix est le multiple d espacement juste en dessous du tick du prix */
  assert.ok(t - pm.tickPrix >= 0 && t - pm.tickPrix < ESP, 'plage et prix alignes : tick prix ' + t + ' vs plage ' + pm.tickPrix);
  n++;
  return { t, tickPrix: pm.tickPrix };
}

// 1. ETH / block : 18 et 18 — le comportement d avant, inchange
verifier({ supply: 1_000_000_000, valo: 10, decBlock: 18, decDevise: 18 });
// 2. action Coinbase (8 decimales) : la supply entiere vaut 5 AAPLc
const a = verifier({ supply: 1_000_000_000, valo: 5, decBlock: 18, decDevise: 8 });
// 3. USDC (6 decimales) : la supply entiere vaut 2 000 USDC
verifier({ supply: 1_000_000_000, valo: 2000, decBlock: 18, decDevise: 6 });
// 4. temoin : sans l ecart, l action serait posee a ~230 000 ticks du prix — c est exactement ce que le correctif evite
{
  const faux = parametresLancement({ supply: 1_000_000_000n, valorisationEth: 5, espacement: ESP, ecartDecimales: 0 });
  assert.ok(Math.abs(a.t - faux.tickPrix) > 200000, 'le temoin doit etre FAUX de ~230 000 ticks');
  n++;
}
// 5. ecart hors bornes : refus, jamais un prix
assert.equal(parametresLancement({ supply: 1n, valorisationEth: 1, espacement: ESP, ecartDecimales: 99 }).etat, 'REFUSE');
n++;
console.log('test-decimales-lancement:', n, 'cas, exit 0');
