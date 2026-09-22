// tip 20260922-2140 → 20260922-ib-batch — Instant Birth hooked V8 DIRECT primary; fee = fixed 0.001 ETH.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

assert.match(html, /data-build="20260922-(ib-batch|eth-fixe)"/);
assert.match(html, /FRAIS_OUVERTURE_WEI/);
assert.match(html, /preflightInstantBirthEthFixe/);
assert.match(html, /tip 20260922-eth-fixe HARD/);
assert.match(html, /Review → sign Instant Birth|Connect wallet → review → Instant Birth/);
assert.doesNotMatch(html, /Could not read the price or your ETH balance, so nothing was started/);
assert.doesNotMatch(html, /Launch hooked V8/);
assert.match(html, /Give birth · V8 = Instant Birth vieAuto/);
assert.match(html, /Birth = V8|HOOK_V8/i);
assert.match(html, /Fees for Dev/);
assert.doesNotMatch(html, /0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4/);
console.log('PASS tip 20260922-eth-fixe Instant Birth fixed 0.001 ETH · no oracle refuse · preflight');
