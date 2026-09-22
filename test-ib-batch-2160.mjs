// tip 20260922-ib-batch — Instant Birth never opens solitary createB20 value 0; refuse wired; fee-first batch.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

assert.match(html, /data-build="20260922-ib-batch"/);
assert.match(html, /function estCreateB20ValeurZero/);
assert.match(html, /function refuseSiCreateB20ValeurZero/);
assert.match(html, /creerBlock IB sequential live path/);
assert.match(html, /etapesOrd/);
assert.match(html, /payant\) - Number\(!!a\.payant\)|Number\(!!b\.payant\) - Number\(!!a\.payant\)/);
assert.match(html, /do NOT early-return on !peutGrouper/);
assert.match(html, /const capsOk = await peutGrouper/);
assert.match(html, /cIbPrepCreate/);
assert.match(html, /not Instant Birth/);
// refuse must be invoked on creerBlock IB path (not dead definition-only)
assert.match(html, /refuseSiCreateB20ValeurZero\(\{ to, value, e, contexte: 'creerBlock IB sequential live path' \}\)/);
// one-sig still requires value leg
assert.match(html, /batch has no ETH value/);
assert.match(html, /FRAIS_OUVERTURE_WEI/);
console.log('PASS tip 20260922-ib-batch Instant Birth refuse createB20-0 + fee-first batch');
