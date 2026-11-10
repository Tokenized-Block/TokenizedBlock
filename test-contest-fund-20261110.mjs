// test-contest-fund-20261110.mjs — "Add TBLOCK to the pot" on contest.html: parseUnits18 + fundPlan (block-contest.js), pure.
// Proves: typed text -> exact raw units (no float), refusals before the wallet opens, the clip to the room under the cap, and
// that the batch sent approves EXACTLY what fund() pulls. Does NOT prove: that a wallet signs it, nor the deployed contract.
import { parseUnits18, fundPlan, fundBatch, SEL, TOKEN_SEL, CONTEST, TBLOCK } from './block-contest.js';
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0;
const t = (n, c, x = '') => { if (c) ok++; else { ko++; console.log('RED', n, x); } };
const E = 10n ** 18n;

t('parse 17241', parseUnits18('17241') === 17241n * E);
t('parse 1,234.5 (comma thousands)', parseUnits18('1,234.5') === 12345n * E / 10n);
t('parse 0.000000000000000001 = 1 wei', parseUnits18('0.000000000000000001') === 1n);
t('parse keeps 18 decimals exact (no float)', parseUnits18('862000.123456789012345678') === 862000n * E + 123456789012345678n);
t('19 decimals refused', parseUnits18('1.0000000000000000001') === null);
t('0 refused', parseUnits18('0') === null && parseUnits18('0.0') === null);
t('negative, text, empty, exponent refused', [' -1', 'abc', '', null, undefined, '1e5', '1.', '.5', '0x10'].every((s) => parseUnits18(s) === null));

const room = 862000n * E, bal = 1_000_000n * E;
let p = fundPlan({ text: '100000', room, balance: bal });
t('plan ok 100000', p.ok && p.amount === 100000n * E && p.clipped === false);
p = fundPlan({ text: '900000', room, balance: bal });
t('plan clipped to the room', p.ok && p.amount === room && p.clipped === true);
p = fundPlan({ text: '100', room: 0n, balance: bal });
t('full round refused with its reason', !p.ok && /cap/.test(p.why));
p = fundPlan({ text: '100', room, balance: 99n * E });
t('balance too low refused', !p.ok && /holds 99 TBLOCK/.test(p.why));
p = fundPlan({ text: '900000', room, balance: room });
t('balance checked against the CLIPPED amount', p.ok && p.amount === room);
p = fundPlan({ text: 'x', room, balance: bal });
t('bad text refused', !p.ok && /Type an amount/.test(p.why));

const b = fundBatch({ round: 0n, amount: p.ok ? 0n : 100000n * E, room });
const w = (h, i) => BigInt('0x' + h.slice(10 + 64 * i, 10 + 64 * (i + 1)));
t('batch = approve then fund', b.length === 2 && b[0].to === TBLOCK && b[0].data.startsWith('0x' + TOKEN_SEL.approve) && b[1].to === CONTEST && b[1].data.startsWith('0x' + SEL.fund));
t('approve EXACTLY what fund pulls', w(b[0].data, 1) === 100000n * E && w(b[1].data, 1) === 100000n * E && w(b[0].data, 0) === BigInt(CONTEST));

const html = readFileSync(new URL('./contest.html', import.meta.url), 'utf8');
t('page wires fundPlan then fundBatch on data-fund', /d\.fund\)[\s\S]{0,200}C\.fundPlan\(/.test(html) && /C\.fundBatch\(\{ round: S\.chainRound, amount: plan\.amount, room: my\.room \}\)/.test(html));
t('page reads fundRoom for the wallet round', /room: C\.decodeUint\(await rd\(C\.VIEW\.fundRoom\(r\)\)\)/.test(html));

console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
process.exitCode = ko ? 1 : 0;
