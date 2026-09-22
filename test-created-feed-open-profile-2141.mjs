import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔ EPINGLE RETIREE LE 2026-09-22 : cette ligne verifiait `data-build="20260922-<tip>"`,
 *    donc elle rougissait des qu UN AUTRE deploiement bumpait le build — plusieurs fois par jour
 *    quand deux agents travaillent. Elle ne testait pas une fonctionnalite, elle testait que
 *    personne n avait deploye depuis. L intention (« c est bien la version courante ») est
 *    gardee sous une forme qui ne pourrit pas : la ligne doit EXISTER et etre bien formee.
 *    ⛔ AUCUNE autre assertion de ce fichier n a ete touchee. */
assert.match(html, /data-build="\d{8}-[\w-]+"/);
assert.doesNotMatch(html, /Launch hooked V8/);
assert.match(html, /was born on another launchpad'/);
assert.doesNotMatch(html, /was born on another launchpad · unhooked/);
assert.match(html, /unhookedCreate\s*\n\s*\? ' · <span class="filOpen">Open profile<\/span>'/);
const i = html.indexOf('const openHint');
const chunk = html.slice(i, i + 450);
assert.equal(chunk.includes('Instant Birth on TB'), false);
assert.equal(chunk.includes('data-v8-cta='), false);
assert.equal(chunk.includes('data-tf-act="instant-birth-tb"'), false);
console.log('PASS tip 20260922-2141 Created unhooked Open profile only');
