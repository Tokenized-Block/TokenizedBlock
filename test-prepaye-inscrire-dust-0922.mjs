import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
assert.match(html, /data-build="20260922-prepaye-inscrire-dust"/);
assert.match(html, /tip 20260922-prepaye-inscrire-dust/);
assert.match(html, /Register on V8 — 0\.0003 ETH min/);
assert.match(html, /isInscrire && !hookPayee/);
assert.match(html, /CREATE_FEE_WEI_FLOOR/);
assert.match(html, /0xbb920fed/);
assert.match(html, /inscrireDust/);
assert.match(html, /MontantInsuffisant/);
/* must NOT blindly zero all payant etapes anymore without the inscrire floor branch */
assert.match(html, /open fee already paid via Create/);
console.log('PASS tip 20260922-prepaye-inscrire-dust');
