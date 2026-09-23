import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
assert.match(html, /function openFeeDejaPayePour/);
assert.match(html, /function recupererPrepayeCreateRouter/);
assert.match(html, /CreateRouter-onchain/);
assert.match(html, /feeDejaVerif/);
assert.match(html, /dejaPaye = openFeeDejaPayePour/);
assert.match(html, /!plan\.v2 && !feeDejaPaye/);
/* tip 20260922-prepaye-inscrire-dust superseded blind value 0x0 on all payant etapes */
assert.match(html, /prepaye-inscrire-dust/);
assert.match(html, /open fee already paid via Create/);
console.log('PASS tip 20260922-prepaye-skip (superseded by inscrire-dust)');
