// tip 20260922-2023 / 20260922-2026 — hooked pool Buy/Sell still encodes interface 0.5% TAKE/TAKE_PORTION → a6cf.
import assert from 'node:assert/strict';
import { planEchange, FRAIS_INTERFACE_BPS, QUOTEUR, ROUTEUR, RACHAT_AUTO } from './echange.js';
import { readFileSync } from 'node:fs';
import { FEE_WALLET } from './frais-creation.js';
import { HOOK_V8, HOOK_PREVU } from './tokenomics.js';
import { cleDePool } from './pool.js';
import { PERMIT2 } from './lancer-pool.js';

const ETH = '0x0000000000000000000000000000000000000000';
const JETON = '0xb2000000000000000000000000000000000000aa';
const COMPTE = '0x1111111111111111111111111111111111111111';
const Q = QUOTEUR[8453].toLowerCase();
const R = ROUTEUR[8453].toLowerCase();
const sink = FEE_WALLET.slice(2).toLowerCase();

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

function word(hexOrBig) {
  const h = typeof hexOrBig === 'bigint' ? hexOrBig.toString(16) : String(hexOrBig).replace(/^0x/, '');
  return h.padStart(64, '0');
}

/** Mock RPC: quoter returns amountOut; router probes/sims succeed; Permit2 allowances maxed. */
function makeRpc({ amountOut = 10n ** 18n } = {}) {
  return async (method, params) => {
    if (method !== 'eth_call') throw new Error('unexpected method ' + method);
    const tx = params[0] || {};
    const to = String(tx.to || '').toLowerCase();
    const data = String(tx.data || '').toLowerCase();
    if (to === Q) return '0x' + word(amountOut);
    if (to === R) return '0x' + word(0n);
    if (data.startsWith('0xdd62ed3e')) return '0x' + word((1n << 256n) - 1n);
    if (to === PERMIT2.toLowerCase() && data.startsWith('0x927da105')) {
      const amount = word((1n << 160n) - 1n);
      const exp = word(BigInt(Math.floor(Date.now() / 1000) + 86400 * 365));
      const nonce = word(0n);
      return '0x' + amount + exp + nonce;
    }
    return '0x' + word(0n);
  };
}

/* ⛔⛔ 2026-10-02 — UN FRAIS PAR JAMBE (regle de Raksha), et c est une MESURE qui le permet : sur fork
 *     (bloc 52072599, callTracer), le hook V8 verse 0,5 % ETH a a6cf a l achat ET a la vente, V1/V2 a la
 *     vente. L ancienne regle « stacked fees beat zero fees » (tip 20260922-2023) partait d un hook qui ne
 *     versait rien ; ce n est plus le cas, et l empilement faisait payer deux fois la meme jambe.
 *   Table attendue : V8 achat 0 · V8 vente 0 · V1 achat 50 (le hook prend du BLOCK) · V1 vente 0. */
const ATTENDU = [[HOOK_V8, 'ACHAT', 0n], [HOOK_V8, 'VENTE', 0n], [HOOK_PREVU, 'ACHAT', FRAIS_INTERFACE_BPS], [HOOK_PREVU, 'VENTE', 0n]];
for (const [hooks, sens, bpsAttendu] of ATTENDU) {
  const cle = cleDePool(ETH, JETON, { fee: 5000, tickSpacing: 200, hooks });
  const marcheLu = { etat: 'LUE', cle, paire: null };
  const label = hooks.slice(0, 10) + ' ' + sens;
  const plan = await planEchange({
    rpc: makeRpc(sens === 'VENTE' ? { amountOut: 5n * 10n ** 15n } : {}), chaine: 8453, jeton: JETON, compte: COMPTE,
    sens, montant: sens === 'VENTE' ? 10n ** 18n : 10n ** 16n, marcheLu, maintenant: Date.now(),
  });
  ok(plan.etat === 'PRET' || plan.etat === 'APPROBATIONS', label + ' → ' + plan.etat + ' ' + (plan.pourquoi || ''));
  eq(plan.resume && plan.resume.fraisBps, bpsAttendu, label + ' fraisBps');
  if (bpsAttendu > 0n) {
    eq(String(plan.resume.beneficiaireFrais).toLowerCase(), FEE_WALLET.toLowerCase(), label + ' fee → a6cf');
    ok(plan.resume.frais > 0n, label + ' frais > 0');
    eq(plan.resume.fraisDevise, 'ETH', label + ' fee asset ETH (not TBLOCK/TBGAS)');
    if (plan.etat === 'PRET') ok(String(plan.tx.data).toLowerCase().includes(sink), label + ' calldata carries the router TAKE');
  } else {
    /* le hook paie : AUCUN TAKE routeur vers a6cf (sinon double frais) */
    eq(plan.resume.beneficiaireFrais, null, label + ' no router beneficiary');
    eq(BigInt(plan.resume.frais), 0n, label + ' router fee 0');
    if (plan.etat === 'PRET') ok(!String(plan.tx.data).toLowerCase().includes(sink), label + ' no router TAKE to a6cf');
  }
}
/* controle negatif : un hook ETRANGER garde le frais routeur (une seule fois) */
{
  const cle = cleDePool(ETH, JETON, { fee: 0, tickSpacing: 200, hooks: '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc' });
  const plan = await planEchange({ rpc: makeRpc(), chaine: 8453, jeton: JETON, compte: COMPTE, sens: 'ACHAT',
    montant: 10n ** 16n, marcheLu: { etat: 'LUE', cle, paire: null }, maintenant: Date.now() });
  eq(plan.resume && plan.resume.fraisBps, FRAIS_INTERFACE_BPS, 'foreign hook ACHAT keeps the 0.5% router fee');
  ok(plan.etat === 'PRET' && String(plan.tx.data).toLowerCase().includes(sink), 'foreign hook ACHAT: router TAKE present');
}

{
  const cle = cleDePool(ETH, JETON, { fee: 5000, tickSpacing: 200, hooks: HOOK_V8 });
  const marcheLu = { etat: 'LUE', cle, paire: null };
  const plan = await planEchange({
    rpc: makeRpc(), chaine: 8453, jeton: JETON, compte: FEE_WALLET, sens: 'ACHAT',
    montant: 10n ** 16n, marcheLu, maintenant: Date.now(),
  });
  eq(plan.resume && plan.resume.fraisBps, 0n, 'fee-wallet buyback exempt (bps=0)');
}

eq(RACHAT_AUTO, false, 'RACHAT_AUTO must stay false — fee is ETH/USDC not TBLOCK buyback');
{
  const src = readFileSync(new URL('./echange.js', import.meta.url), 'utf8');
  ok(!/takePortion\(TBLOCK,\s*FEE_WALLET/.test(src), 'no TAKE_PORTION(TBLOCK, FEE_WALLET) in source');
  const liveTakes = [...src.matchAll(/paramsAction\.take\(TBLOCK,\s*FEE_WALLET/g)];
  ok(liveTakes.length === 0 || src.includes('RACHAT_AUTO &&'),
    'TAKE(TBLOCK, FEE_WALLET) only behind RACHAT_AUTO guard');
}

console.log('test-plan-echange-hooked-frais: ' + n + ' assertions, OK');
