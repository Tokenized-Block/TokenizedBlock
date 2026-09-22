// test-bridge-tab-0922.mjs — Bridge tab MVP (tip 20260922-bridge-tab)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BRIDGE_FEE_BPS, BRIDGE_FEE_RATE, BRIDGE_FEE_LABEL, quoteBridge, formatBridgeAmount,
  confirmerBridgeStub,
} from './bridge.js';

assert.equal(BRIDGE_FEE_BPS, 1n);
assert.equal(BRIDGE_FEE_RATE, 0.0001);
assert.equal(BRIDGE_FEE_LABEL, '0.01%');

const q = quoteBridge({ amount: 1000, fromSym: 'ETH', toSym: 'USDC' });
assert.equal(q.ok, true);
assert.equal(q.fee, 0.1); // 1000 * 0.0001
assert.equal(q.net, 999.9);
assert.equal(q.feeLabel, '0.01%');
assert.equal(q.settleSym, 'ETH');

const q0 = quoteBridge({ amount: 0, fromSym: 'USDC', toSym: 'AAPLc' });
assert.equal(q0.ok, true);
assert.equal(q0.fee, 0);
assert.equal(q0.settleSym, 'USDC');

const bad = quoteBridge({ amount: 'nope' });
assert.equal(bad.ok, false);

assert.match(formatBridgeAmount(0.1, 'ETH'), /0\.1 ETH/);
assert.equal(formatBridgeAmount(null, 'ETH'), '—');

const stub = confirmerBridgeStub(q);
assert.equal(stub.stub, true);
assert.equal(stub.ok, false);
assert.match(stub.pourquoi, /not on-chain yet/i);

const html = readFileSync('./app.html', 'utf8');
assert.match(html, /data-volet="bridge"/);
assert.match(html, /id="v-bridge"/);
assert.match(html, /from\s+'\.\/bridge\.js'/);
assert.match(html, /0\.01%/);
const brStart = html.indexOf('id="v-bridge"');
const brEnd = html.indexOf('</section>', brStart) + '</section>'.length;
const bridgePanel = html.slice(brStart, brEnd);
assert.doesNotMatch(bridgePanel, /0xa6cf|Fees for Dev|≈\s*\$1|≈\$1/i);
assert.doesNotMatch(bridgePanel, /Fees for Dev/i);
assert.match(bridgePanel, /Fee[\s\S]*0\.01%/);

const servi = readFileSync('./serveur-web.js', 'utf8');
assert.match(servi, /bridge\.js/);

const build = /data-build="([^"]+)"/.exec(html);
assert.ok(build && build[1].includes('bridge-tab'), 'data-build tip includes bridge-tab, got ' + (build && build[1]));

console.log('ok — bridge tab 0.01% quote + UI wiring');
