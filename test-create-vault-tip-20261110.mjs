// test-create-vault-tip-20261110.mjs — create-vault-tip.js, pure. No network.
// Proves: the TBLOCK part tops the 0.001 ETH fee up to $5 and never above (rounded down); refuses with a reason (never a 0 call)
// when a price, the balance or the vault is missing; the call is exactly TBLOCK.transfer(vault, amount); the app offers it only
// AFTER a birth succeeded and never inside the birth batch; the module is served.
// Does NOT prove: a wallet signing it, nor the price served at that moment.
import { readFileSync } from 'node:fs';
import * as T from './create-vault-tip.js';
import { TBLOCK, VAULT } from './economie.js';
let ok = 0, ko = 0;
const t = (n, c, x = '') => { if (c) ok++; else { ko++; console.log('RED', n, x); } };
const E18 = 10n ** 18n;

/* ETH at $3,000: fee = $3, left = $2; TBLOCK at $0.000005: 400,000 TBLOCK */
t('usdLeft at ETH 3000 = 2,000,000 micro-dollars', T.usdLeft(3000) === 2000000n, String(T.usdLeft(3000)));
const p = T.plan({ ethUsd: 3000, tblockUsd: 0.000005, balance: 10n ** 30n });
t('plan ok', p.ok === true, JSON.stringify(p.why));
t('400,000 TBLOCK for $2 at $0.000005', p.amount === 400000n * E18, String(p.amount));
t('call goes to TBLOCK', p.call.to === TBLOCK);
t('call is transfer(vault, amount)', p.call.data === '0xa9059cbb' + VAULT.slice(2).padStart(64, '0') + p.amount.toString(16).padStart(64, '0'));
t('call sends no ETH', p.call.value === '0x0');
t('call is frozen', Object.isFrozen(p.call));
/* the value never exceeds the target, whatever the rounding */
for (const [eu, tu] of [[3333.33, 0.0000057639], [2500.5, 0.00000123], [4100, 0.00001], [1234.567, 0.0000059]]) {
  const q = T.plan({ ethUsd: eu, tblockUsd: tu, balance: 10n ** 30n });
  const usd = Number(q.amount) / 1e18 * tu + 0.001 * eu;
  t('total <= $5 at ETH ' + eu, q.ok && usd <= 5 + 1e-9, String(usd));
  t('total within one cent of $5 at ETH ' + eu, q.ok && usd > 4.99, String(usd));
}
/* refusals carry a reason, never a call */
const r1 = T.plan({ ethUsd: 6000, tblockUsd: 0.000005, balance: 10n ** 30n });
t('ETH fee above $5: refused, nothing to add', r1.ok === false && /nothing to add/.test(r1.why) && !r1.call);
t('ETH fee exactly $5: refused', T.plan({ ethUsd: 5000, tblockUsd: 0.000005, balance: 10n ** 30n }).ok === false);
t('ETH price unread: refused', T.plan({ ethUsd: null, tblockUsd: 0.000005, balance: 1n }).ok === false);
t('ETH price NaN: refused', T.plan({ ethUsd: NaN, tblockUsd: 0.000005, balance: 1n }).ok === false);
t('TBLOCK price 0: refused', T.plan({ ethUsd: 3000, tblockUsd: 0, balance: 10n ** 30n }).ok === false);
t('TBLOCK price unread: refused', T.plan({ ethUsd: 3000, tblockUsd: undefined, balance: 10n ** 30n }).ok === false);
t('balance unread: refused', T.plan({ ethUsd: 3000, tblockUsd: 0.000005, balance: null }).ok === false);
const r2 = T.plan({ ethUsd: 3000, tblockUsd: 0.000005, balance: 399999n * E18 });
t('balance one TBLOCK short: refused with both numbers', r2.ok === false && /400,000/.test(r2.why) && /399,999/.test(r2.why), r2.why);
t('balance exactly enough: ok', T.plan({ ethUsd: 3000, tblockUsd: 0.000005, balance: 400000n * E18 }).ok === true);

/* the app: offered after a success only, never inside the birth batch */
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
t('app imports the module', /import \* as TIP from '\.\/create-vault-tip\.js'/.test(app));
t('the tip is built inside the success note (class cVaultTip), its button hidden until a plan is ok', /box.className = 'cVaultTip'/.test(app) && /btn.type = 'button'; btn.hidden = true;/.test(app));
const calls = app.match(/proposerTipCoffre\(/g) || [];
t('offered at both success points (+ its definition)', calls.length === 3, String(calls.length));
const fn = app.slice(app.indexOf('function proposerTipCoffre('), app.indexOf('function proposerTipCoffre(') + 4000);
t('the send uses TIP.plan and envoyerAppels with that ONE call', /TIP\.plan\(/.test(fn) && /envoyerAppels\(\[\s*\{ to: q\.call\.to, data: q\.call\.data, value: q\.call\.value \}\s*\]/.test(fn));
t('no birth plan carries the tip', !/appels[^\n]{0,200}TIP\./.test(app.replace(fn, '')));
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
t('module is served', /'create-vault-tip\.js'/.test(srv));
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
