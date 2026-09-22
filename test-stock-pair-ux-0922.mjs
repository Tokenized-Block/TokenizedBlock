// tip 20260922-stock-pair-ux — Create Instant Birth Coinbase stock pair-picker UX
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
assert.match(html, /data-build="20260922-stock-pair-ux"/);
assert.match(html, /id="cPaireChips"/);
assert.match(html, /optgroup label="Coinbase tokenized stocks"/);
assert.match(html, /PAIRES_CHIP_QUICK/);
assert.match(html, /majFundWalletPourPaire/);
assert.match(html, /Fees for Dev/);
assert.match(html, /hookV8Deploye/);
assert.doesNotMatch(html, /0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4/i);
console.log('PASS tip 20260922-stock-pair-ux');
