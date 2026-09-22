// SUPERSEDED by tip 20260922-2140 — free-Create-then-Give-birth is no longer the primary funnel.
// Kept so old CI paths don't silently assert the wrong product. Delegates to Instant Birth primary.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
assert.match(html, /data-build="20260922-2140"/);
assert.match(html, /Instant Birth · 0\.001 ETH · Fees for Dev · V8/);
assert.doesNotMatch(html, /Launch hooked V8/);
assert.doesNotMatch(html, /Create this block \(free\) — then Give birth/);
assert.match(html, /Give birth · V8 = Instant Birth vieAuto/);
assert.match(html, /creerSansVie/);
console.log('PASS (superseded 2125 → 2140) Instant Birth primary; free create Advanced; vieAuto on Give birth');
