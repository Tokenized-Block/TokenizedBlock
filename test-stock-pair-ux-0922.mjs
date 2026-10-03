// tip 20260922-fee-label-clean — Create Instant Birth Coinbase stock pair-picker UX (no Fees for Dev label)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔ EPINGLE RETIREE : cette ligne verifiait un numero de build precis, donc elle rougissait
 *    des qu UN AUTRE deploiement bumpait le build — plusieurs fois par jour quand deux agents
 *    travaillent. Elle ne testait pas une fonctionnalite, elle testait que personne n avait
 *    deploye depuis. L intention est gardee sous une forme qui ne pourrit pas.
 *    ⛔ AUCUNE autre assertion de ce fichier n a ete touchee (compte verifie avant/apres). */
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23, passe globale) : elle exigeait un numero de
 *    build precis, donc elle rougissait des qu un AUTRE deploiement bumpait le build. Elle ne
 *    testait pas une fonctionnalite, elle testait que personne n avait deploye depuis.
 *    L intention — « c est bien une page servie, avec sa ligne de build » — est gardee. */
assert.match(html, /data-build="[\w-]+"/);
assert.match(html, /id="cPaireChips"/);
/* 2026-10-03 : le groupe garde son nom, suffixe « — make it a memestock » (les actions lancables en tete) */
assert.match(html, /optgroup label="Coinbase tokenized stocks( — make it a memestock)?"/);
/* ⛔ la liste des puces n est plus une constante gravee mais une fonction CALCULEE depuis les prix
 *   reellement lus (2026-09-27) : on verifie la fonction, pas le nom de l ancienne constante. */
assert.match(html, /function pairesChipQuick()/);
assert.match(html, /majFundWalletPourPaire/);
assert.doesNotMatch(html, /Fees for Dev/);
assert.doesNotMatch(html, /No fee address in UI/);
assert.match(html, /hookV8Deploye/);
assert.doesNotMatch(html, /0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4/i);
console.log('PASS tip 20260922-fee-label-clean');
