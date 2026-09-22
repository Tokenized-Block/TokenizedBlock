// tip 20260922-same-sig — Instant Birth CreateRouter createPaid FIRST; never factory createB20 value 0; no Fees for Dev.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

assert.match(html, /data-build="20260922-same-sig"/);
assert.match(html, /forcerCreateRouterIb/);
assert.match(html, /function estCreateB20ValeurZero/);
assert.match(html, /function refuseSiCreateB20ValeurZero/);
assert.match(html, /CreateRouter createPaid FIRST/);
assert.match(html, /Do NOT call creerEtVivreUneSignature/);
assert.match(html, /creerBlock IB final guard/);
assert.match(html, /CreateRouter · 0\.001 ETH once/);
assert.match(html, /FRAIS_OUVERTURE_WEI/);
assert.doesNotMatch(html, /Fees for Dev/);
assert.doesNotMatch(html, /cIbPrepCreate/);
assert.doesNotMatch(html, /Create block first \(factory · free · not Instant Birth\)/);
assert.match(html, /never solicit factory createB20 value 0 for Instant Birth/);
console.log('PASS tip 20260922-same-sig Instant Birth CreateRouter first · refuse createB20-0 · no Fees for Dev');
