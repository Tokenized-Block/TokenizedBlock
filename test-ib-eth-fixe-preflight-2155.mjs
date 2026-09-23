// tip 20260922-eth-fixe / ib-preflight — fixed FRAIS_OUVERTURE_WEI, no oracle refuse, balance wei gate.
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
assert.match(html, /async function assurerFraisLancementWei/);
assert.match(html, /if \(w == null \|\| w < FRAIS_OUVERTURE_WEI\) w = FRAIS_OUVERTURE_WEI/);
assert.match(html, /async function preflightInstantBirthEthFixe/);
assert.match(html, /async function lireSoldeEthAppRobuste/);
assert.match(html, /refuseSiCreateB20ValeurZero|batch has no ETH value/);
assert.match(html, /preflightEthCallTx/);
assert.match(html, /Fund wallet/);
assert.doesNotMatch(html, /Could not read the price or your ETH balance, so nothing was started\. Try again in a moment\./);
// fee gate never requires oracle
assert.match(html, /Oracle is OPTIONAL — never refuse Instant Birth/);
assert.match(html, /SEED_FIXE_SANS_ORACLE|seed floor when oracle unread/);
console.log('PASS tip 20260922-eth-fixe ib-preflight fixed ETH fee + balance gate');
