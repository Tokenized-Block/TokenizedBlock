// tip 20260922-eth-fixe / ib-preflight — fixed FRAIS_OUVERTURE_WEI, no oracle refuse, balance wei gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

assert.match(html, /data-build="20260922-(no-unhooked|same-sig|ib-paid|ib-batch|eth-fixe)"/);
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
