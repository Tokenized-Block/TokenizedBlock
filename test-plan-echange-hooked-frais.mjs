// tip 20260922-2023 — hooked pool Buy/Sell still encodes interface 0.5% TAKE/TAKE_PORTION → a6cf.
import assert from 'node:assert/strict';
import { planEchange, FRAIS_INTERFACE_BPS, QUOTEUR, ROUTEUR } from './echange.js';
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

for (const hooks of [HOOK_V8, HOOK_PREVU]) {
  const cle = cleDePool(ETH, JETON, { fee: 5000, tickSpacing: 200, hooks });
  const marcheLu = { etat: 'LUE', cle, paire: null };
  const label = hooks.slice(0, 10);

  {
    const plan = await planEchange({
      rpc: makeRpc(), chaine: 8453, jeton: JETON, compte: COMPTE, sens: 'ACHAT',
      montant: 10n ** 16n, marcheLu, maintenant: Date.now(),
    });
    ok(plan.etat === 'PRET', 'ACHAT hooked ' + label + ' → PRET (' + plan.etat + ' ' + (plan.pourquoi || '') + ')');
    eq(plan.resume && plan.resume.fraisBps, FRAIS_INTERFACE_BPS, 'ACHAT fraisBps=50 on hooked ' + label);
    eq(String(plan.resume.beneficiaireFrais).toLowerCase(), FEE_WALLET.toLowerCase(), 'ACHAT fee → a6cf');
    ok(plan.resume.frais > 0n, 'ACHAT frais > 0');
    ok(String(plan.tx && plan.tx.data || '').toLowerCase().includes(sink),
      'ACHAT calldata carries TAKE to fee sink (assertFraisInterfaceA6cf already required it)');
  }

  {
    const plan = await planEchange({
      rpc: makeRpc({ amountOut: 5n * 10n ** 15n }), chaine: 8453, jeton: JETON, compte: COMPTE,
      sens: 'VENTE', montant: 10n ** 18n, marcheLu, maintenant: Date.now(),
    });
    ok(plan.etat === 'PRET' || plan.etat === 'APPROBATIONS',
      'VENTE hooked ' + label + ' → ' + plan.etat + ' ' + (plan.pourquoi || ''));
    eq(plan.resume && plan.resume.fraisBps, FRAIS_INTERFACE_BPS, 'VENTE fraisBps=50 on hooked ' + label);
    eq(String(plan.resume.beneficiaireFrais).toLowerCase(), FEE_WALLET.toLowerCase(), 'VENTE fee → a6cf');
    ok(plan.resume.frais > 0n, 'VENTE frais > 0');
    if (plan.etat === 'PRET') {
      ok(String(plan.tx && plan.tx.data || '').toLowerCase().includes(sink),
        'VENTE calldata carries TAKE_PORTION to fee sink');
    }
  }
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

console.log('test-plan-echange-hooked-frais: ' + n + ' assertions, OK');
