// tip 20260922-2140 — Instant Birth hooked V8 DIRECT is the ONLY primary Create CTA.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

assert.match(html, /data-build="20260922-2140"/);
assert.match(html, /Instant Birth · 0\.001 ETH · Fees for Dev · V8/);
assert.match(html, /Instant Birth · Bring to life · 0\.001 ETH · Fees for Dev · V8/);
assert.match(html, /Instant Birth on TB · 0\.001 ETH · V8/);
assert.match(html, /Advanced · create without opening a market/);
assert.match(html, /id="cCreerFree"/);
assert.match(html, /creerSansVie/);
assert.match(html, /data-tf-act="instant-birth-tb"/);
assert.doesNotMatch(html, /Launch hooked V8/);
assert.doesNotMatch(html, /Create a new block here \(free\)/);
assert.doesNotMatch(html, /Create this block \(free\) — then Give birth/);
assert.doesNotMatch(html, /Connect wallet → Create this block \(free\)/);
/* Give birth / vieAuto Instant Birth path kept for asleep / profile */
assert.match(html, /Give birth · V8 = Instant Birth vieAuto/);
assert.match(html, /Birth = V8|HOOK_V8|hook.*V8/i);
console.log('PASS tip 20260922-2140 Instant Birth primary · free create Advanced · feed/profile Instant Birth on TB');
