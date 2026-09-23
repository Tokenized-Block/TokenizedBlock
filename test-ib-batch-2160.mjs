// tip 20260922-same-sig — Instant Birth CreateRouter createPaid FIRST; never factory createB20 value 0; fees→wallet · no sink addr.
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
assert.match(html, /forcerCreateRouterIb/);
assert.match(html, /function estCreateB20ValeurZero/);
assert.match(html, /function refuseSiCreateB20ValeurZero/);
assert.match(html, /CreateRouter createPaid FIRST/);
assert.match(html, /Do NOT call creerEtVivreUneSignature/);
assert.match(html, /creerBlock IB final guard/);
assert.match(html, /CreateRouter · 0\.001 ETH once/);
assert.match(html, /FRAIS_OUVERTURE_WEI/);
assert.doesNotMatch(html, /Fees for Dev/);
assert.doesNotMatch(html, /0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4/i);
assert.doesNotMatch(html, /cIbPrepCreate/);
assert.doesNotMatch(html, /Create block first \(factory · free · not Instant Birth\)/);
assert.match(html, /never solicit factory createB20 value 0 for Instant Birth/);
console.log('PASS tip 20260922-same-sig Instant Birth CreateRouter first · refuse createB20-0 · fees→wallet · no sink addr');
