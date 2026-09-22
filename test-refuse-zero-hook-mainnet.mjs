// tip 20260922-1934 / 20260922-2023 — MAIN permanent Launch = HOOK_V8 only (Birth=V8).
import assert from 'node:assert/strict';
import { planLancement, ADRESSE_NULLE, PROPRIETAIRE_PERMANENT } from './lancer-pool.js';
import { HOOK_V8, HOOK_PREVU, HOOK_V7 } from './tokenomics.js';

const JETON = '0xb200000000000000000000000000000000000001';
const COMPTE = '0x1111111111111111111111111111111111111111';
const rpc = async () => { throw new Error('rpc must not be reached for non-V8 permanent refuse'); };

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

{
  const plan = await planLancement({
    rpc, chaine: 8453, jeton: JETON, compte: COMPTE, valorisationEth: 10,
    hooks: ADRESSE_NULLE, proprietaire: PROPRIETAIRE_PERMANENT,
  });
  eq(plan.etat, 'REFUSE', 'MAIN permanent + hooks=0 → REFUSE before RPC');
  ok(/Birth=V8 only|HOOK_V8 only/i.test(plan.pourquoi || ''), plan.pourquoi);
}

{
  const plan = await planLancement({
    rpc, chaine: 8453, jeton: JETON, compte: COMPTE, valorisationEth: 10,
    hooks: HOOK_PREVU, proprietaire: PROPRIETAIRE_PERMANENT,
  });
  eq(plan.etat, 'REFUSE', 'MAIN permanent + legacy HOOK_PREVU → REFUSE (Birth=V8 only)');
  ok(/Birth=V8 only|HOOK_V8 only/i.test(plan.pourquoi || ''), plan.pourquoi);
}

{
  const plan = await planLancement({
    rpc, chaine: 8453, jeton: JETON, compte: COMPTE, valorisationEth: 10,
    hooks: HOOK_V7, proprietaire: PROPRIETAIRE_PERMANENT,
  });
  eq(plan.etat, 'REFUSE', 'MAIN permanent + V7 → REFUSE (Birth=V8 only)');
  ok(/Birth=V8 only|HOOK_V8 only/i.test(plan.pourquoi || ''), plan.pourquoi);
}

{
  /* Add liquidity path: proprietaire = compte → non-V8 allowed past this gate (may hit RPC). */
  let hit = false;
  const rpc2 = async () => { hit = true; throw new Error('stop-after-gate'); };
  const plan = await planLancement({
    rpc: rpc2, chaine: 8453, jeton: JETON, compte: COMPTE, valorisationEth: 10,
    hooks: ADRESSE_NULLE, proprietaire: COMPTE,
  });
  ok(hit || plan.etat === 'NON_MESURE', 'Add-liq (owner=compte) passes V8-only gate and reaches RPC');
  ok(!(plan.etat === 'REFUSE' && /Birth=V8 only|HOOK_V8 only/i.test(plan.pourquoi || '')),
    'Add-liq must not get Birth=V8 refuse');
}

{
  const plan = await planLancement({
    rpc, chaine: 84532, jeton: JETON, compte: COMPTE, valorisationEth: 10,
    hooks: ADRESSE_NULLE,
  });
  ok(!(plan.etat === 'REFUSE' && /Birth=V8 only|HOOK_V8 only/i.test(plan.pourquoi || '')),
    'Practice permanent zero-hook is not the MAIN V8 refuse');
}

{
  let hit = false;
  const rpc3 = async () => { hit = true; throw new Error('stop'); };
  const plan = await planLancement({
    rpc: rpc3, chaine: 8453, jeton: JETON, compte: COMPTE, valorisationEth: 10,
    hooks: HOOK_V8,
  });
  ok(hit || plan.etat === 'NON_MESURE', 'V8 permanent Launch passes the Birth=V8 gate');
  ok(!(plan.etat === 'REFUSE' && /Birth=V8 only|HOOK_V8 only/i.test(plan.pourquoi || '')),
    'V8 must not be refused as non-V8');
}

console.log('test-refuse-zero-hook-mainnet: ' + n + ' assertions, OK');
