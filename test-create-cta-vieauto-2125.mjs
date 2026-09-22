// SUPERSEDED by tip 20260922-eth-fixe (via 2140/create-sign-ux).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
assert.match(html, /data-build="20260922-(ib-paid|ib-batch|eth-fixe)"/);
assert.doesNotMatch(html, /Launch hooked V8/);
assert.match(html, /Give birth · V8 = Instant Birth vieAuto/);
console.log('PASS (superseded → eth-fixe) Instant Birth primary; vieAuto on Give birth');
