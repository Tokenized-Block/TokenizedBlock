// tip 20260922-1934 — permanent MAIN Launch must REFUSE hooks=0x0 (no RPC needed).
import assert from 'node:assert/strict';
import { planLancement, ADRESSE_NULLE, PROPRIETAIRE_PERMANENT } from './lancer-pool.js';
import { HOOK_V8 } from './tokenomics.js';

const JETON = '0xb200000000000000000000000000000000000001';
const COMPTE = '0x1111111111111111111111111111111111111111';
const rpc = async () => { throw new Error('rpc must not be reached for zero-hook permanent refuse'); };

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

{
  const plan = await planLancement({
    rpc, chaine: 8453, jeton: JETON, compte: COMPTE, valorisationEth: 10,
    hooks: ADRESSE_NULLE, proprietaire: PROPRIETAIRE_PERMANENT,
  });
  eq(plan.etat, 'REFUSE', 'MAIN permanent + hooks=0 → REFUSE before RPC');
  ok(/zero-hook mint blocked/i.test(plan.pourquoi || ''), plan.pourquoi);
}

{
  /* Add liquidity path: proprietaire = compte → zero hook allowed past this gate (may hit RPC). */
  let hit = false;
  const rpc2 = async () => { hit = true; throw new Error('stop-after-gate'); };
  const plan = await planLancement({
    rpc: rpc2, chaine: 8453, jeton: JETON, compte: COMPTE, valorisationEth: 10,
    hooks: ADRESSE_NULLE, proprietaire: COMPTE,
  });
  ok(hit || plan.etat === 'NON_MESURE', 'Add-liq (owner=compte) passes zero-hook gate and reaches RPC');
  ok(!(plan.etat === 'REFUSE' && /zero-hook mint blocked/i.test(plan.pourquoi || '')),
    'Add-liq must not get zero-hook refuse');
}

{
  const plan = await planLancement({
    rpc, chaine: 84532, jeton: JETON, compte: COMPTE, valorisationEth: 10,
    hooks: ADRESSE_NULLE,
  });
  ok(!(plan.etat === 'REFUSE' && /zero-hook mint blocked/i.test(plan.pourquoi || '')),
    'Practice permanent zero-hook is not the MAIN refuse');
}

{
  let hit = false;
  const rpc3 = async () => { hit = true; throw new Error('stop'); };
  const plan = await planLancement({
    rpc: rpc3, chaine: 8453, jeton: JETON, compte: COMPTE, valorisationEth: 10,
    hooks: HOOK_V8,
  });
  ok(hit || plan.etat === 'NON_MESURE', 'V8 permanent Launch passes the zero-hook gate');
  ok(!(plan.etat === 'REFUSE' && /zero-hook mint blocked/i.test(plan.pourquoi || '')),
    'V8 must not be refused as zero-hook');
}

console.log('test-refuse-zero-hook-mainnet: ' + n + ' assertions, OK');
