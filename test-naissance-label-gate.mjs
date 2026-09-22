// tip 20260922-2112 — Created→IB: engraved refuse = porteLeLabel, CTA gated for NON
import { readFileSync } from 'fs';
import { blockPorteLeLabel, ETATS_LABEL, SEL_PORTE_LABEL, HOOK_V5 } from './tokenomics.js';

const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };
const page = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

ok(page.includes('20260922-2112') || page.includes('20260922-2125') || page.includes('20260922-2140') || page.includes('20260922-eth-fixe') || page.includes('20260922-ib-batch'), 'data-build tip 2112 lineage / 2125 / 2140');
ok(page.includes('POURQUOI_PAS_LABEL'), 'honest label refuse constant');
ok(page.includes('eligibleNaissanceV8'), 'eligibility helper');
ok(!page.includes("this block was not engraved by this app's Create, so its market cannot open here"),
  'old engraved-session refuse string removed');
ok(page.includes('V8 birth needs a face engraved at Create (on-chain label)'),
  'new refuse / CTA copy names on-chain label');
ok(page.includes('instant-birth-tb') || page.includes('create-here'), 'secondary Instant Birth on TB / create-here when ineligible');
ok(SEL_PORTE_LABEL === '0x330676aa', 'porteLeLabel selector');
ok(ETATS_LABEL.includes('NON') && ETATS_LABEL.includes('NON_LU'), 'three label states');

// unit: NON vs NON_LU vs OUI mapping used by UI
const rpcOui = async () => '0x' + '0'.repeat(63) + '1';
const rpcNon = async () => '0x' + '0'.repeat(64);
const rpcVide = async () => '0x';
const J = '0xb20000000000000000000024c30d3fcb7931272e';
ok(await blockPorteLeLabel({ rpc: rpcOui, jeton: J }) === 'OUI', 'spy OUI');
ok(await blockPorteLeLabel({ rpc: rpcNon, jeton: J }) === 'NON', 'spy NON');
ok(await blockPorteLeLabel({ rpc: rpcVide, jeton: J }) === 'NON_LU', 'spy empty → NON_LU');
ok(HOOK_V5.startsWith('0x'), 'label read still on V5 address (tokenomics)');

if (process.exitCode) process.exit(process.exitCode);
console.log('PASS test-naissance-label-gate');
