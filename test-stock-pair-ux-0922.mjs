// tip 20260922-fee-label-clean — Create Instant Birth Coinbase stock pair-picker UX (no Fees for Dev label)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔ EPINGLE RETIREE : cette ligne verifiait un numero de build precis, donc elle rougissait
 *    des qu UN AUTRE deploiement bumpait le build — plusieurs fois par jour quand deux agents
 *    travaillent. Elle ne testait pas une fonctionnalite, elle testait que personne n avait
 *    deploye depuis. L intention est gardee sous une forme qui ne pourrit pas.
 *    ⛔ AUCUNE autre assertion de ce fichier n a ete touchee (compte verifie avant/apres). */
assert.match(html, /data-build="[\w-]+"/);
assert.match(html, /id="cPaireChips"/);
assert.match(html, /optgroup label="Coinbase tokenized stocks"/);
assert.match(html, /PAIRES_CHIP_QUICK/);
assert.match(html, /majFundWalletPourPaire/);
assert.doesNotMatch(html, /Fees for Dev/);
assert.doesNotMatch(html, /No fee address in UI/);
assert.match(html, /hookV8Deploye/);
assert.doesNotMatch(html, /0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4/i);
console.log('PASS tip 20260922-fee-label-clean');
