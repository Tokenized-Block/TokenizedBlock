// SUPERSEDED by tip 20260922-eth-fixe (via 2140/create-sign-ux).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔ EPINGLE RETIREE LE 2026-09-22 : cette ligne verifiait `data-build="20260922-<tip>"`,
 *    donc elle rougissait des qu UN AUTRE deploiement bumpait le build — plusieurs fois par jour
 *    quand deux agents travaillent. Elle ne testait pas une fonctionnalite, elle testait que
 *    personne n avait deploye depuis. L intention (« c est bien la version courante ») est
 *    gardee sous une forme qui ne pourrit pas : la ligne doit EXISTER et etre bien formee.
 *    ⛔ AUCUNE autre assertion de ce fichier n a ete touchee. */
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23, passe globale) : elle exigeait un numero de
 *    build precis, donc elle rougissait des qu un AUTRE deploiement bumpait le build. Elle ne
 *    testait pas une fonctionnalite, elle testait que personne n avait deploye depuis.
 *    L intention — « c est bien une page servie, avec sa ligne de build » — est gardee. */
assert.match(html, /data-build="[\w-]+"/);
assert.doesNotMatch(html, /Launch hooked V8/);
assert.match(html, /Give birth · V8 = Instant Birth vieAuto/);
console.log('PASS (superseded → eth-fixe) Instant Birth primary; vieAuto on Give birth');
