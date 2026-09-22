// tip 20260922-ib-paid — Instant Birth never solicits solitary createB20 value 0; CreateRouter paid fallback.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

assert.match(html, /data-build="20260922-ib-paid"/);
assert.match(html, /forcerCreateRouterIb/);
assert.match(html, /function estCreateB20ValeurZero/);
assert.match(html, /function refuseSiCreateB20ValeurZero/);
assert.match(html, /creerBlock IB → switch CreateRouter paid/);
assert.match(html, /creerBlock IB final guard/);
assert.match(html, /CreateRouter · 0.001 ETH once/);
assert.match(html, /FRAIS_OUVERTURE_WEI/);
assert.match(html, /do NOT early-return on !peutGrouper/);
assert.doesNotMatch(html, /cIbPrepCreate/);
assert.doesNotMatch(html, /Create block first \(factory · free · not Instant Birth\)/);
// measured regression: never leave solitary factory value-0 as IB wallet solicit
assert.match(html, /must NEVER solicit solitary factory createB20 value 0/);
console.log('PASS tip 20260922-ib-paid Instant Birth CreateRouter paid · refuse createB20-0');
