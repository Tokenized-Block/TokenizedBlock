// test-openlaunch-launch.mjs — la calldata du launch OpenLaunch, comparee a `cast calldata` (fixture generee le 2026-09-16).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLaunchOL, tickPourFdv, fdvDepuisTick, PART_TOKENIZEDBLOCK_BPS } from './openlaunch-launch.js';
import { FEE_WALLET } from './frais-creation.js';

const L = '0x34d01cf8d3810799f985386ee6ffcf62b5115517', salt = '0x' + '11'.repeat(32);
const ref = readFileSync(new URL('./fixture-ol-launch-cast.txt', import.meta.url), 'utf8').trim();
let n = 0;
const ok = (f) => { f(); n++; };

ok(() => {
  const p = planLaunchOL({ nom: 'Test Block', symbole: 'TBX', lanceur: L, startTick: 184200, lpFee: 10000, salt });
  assert.equal(p.etat, 'OK');
  assert.equal(p.tx.data, ref);
  assert.equal(p.tx.value, '0x0');
  assert.equal(PART_TOKENIZEDBLOCK_BPS, 5000);
  assert.equal(p.resume.partLanceurPct, 50);
  assert.equal(p.resume.partTokenizedBlockPct, 50);
  /* le wallet de frais figure dans la calldata, le lanceur aussi */
  assert.ok(p.tx.data.includes(FEE_WALLET.slice(2).toLowerCase()));
  assert.ok(p.tx.data.includes(L.slice(2)));
});

ok(() => {
  /* temoin : lpFee 0 -> personne n est nomme, le wallet de frais n apparait pas */
  const p = planLaunchOL({ nom: 'Zero', symbole: 'Z', lanceur: L, startTick: 184200, lpFee: 0, salt });
  assert.equal(p.etat, 'OK');
  assert.ok(!p.tx.data.includes(FEE_WALLET.slice(2).toLowerCase()));
  assert.equal(p.resume.partTokenizedBlockPct, 0);
});

ok(() => {
  const base = { nom: 'A', symbole: 'A', lanceur: L, startTick: 184200, lpFee: 10000, salt };
  for (const [k, v] of [['lpFee', 5000], ['lpFee', 40000], ['startTick', 184201], ['startTick', 999999], ['lanceur', null], ['lanceur', FEE_WALLET],
    ['symbole', 'A B'], ['symbole', ''], ['nom', ''], ['salt', '0x12']]) {
    assert.equal(planLaunchOL({ ...base, [k]: v }).etat, 'REFUSE', k + '=' + v);
  }
});

ok(() => {
  assert.equal(tickPourFdv(10), 184200);
  assert.ok(Math.abs(fdvDepuisTick(184200) - 10) < 0.1);
  assert.equal(tickPourFdv(0), null);
  assert.equal(tickPourFdv(NaN), null);
});

console.log('test-openlaunch-launch : ' + n + ' blocs verts');
