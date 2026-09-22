// tip 20260922-2125 — Create CTA must not masquerade as Instant Birth / 0.001 ETH.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
assert.match(html, /data-build="20260922-2125"/);
assert.match(html, /Create this block \(free\)/);
assert.match(html, /Create this block \(free\) — then Give birth · V8/);
assert.doesNotMatch(
  html,
  /boutonCreer\.textContent = Number\(CHAINE\) === 8453\s*\n\s*\? 'Review → Bring it to life — ≈\$1/
);
assert.match(html, /Give birth · V8 = Instant Birth vieAuto/);
assert.match(html, /asleep Created blocks → Instant Birth \(vieAuto\)/);
assert.match(html, /Created\/deep-link Give birth must run Instant Birth/);
/* Factory create stays value 0 */
assert.match(html, /Creation stays FREE — factory createB20/);
console.log('ALL PASS tip 20260922-2125 Create CTA ≠ Instant Birth; vieAuto on Give birth');
