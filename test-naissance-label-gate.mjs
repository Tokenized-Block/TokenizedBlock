// tip 20260922-2112 — Created→IB: engraved refuse = porteLeLabel, CTA gated for NON
import { readFileSync } from 'fs';
import { blockPorteLeLabel, ETATS_LABEL, SEL_PORTE_LABEL, HOOK_V5 } from './tokenomics.js';

const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };
const page = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

ok(page.includes('20260922-2112') || page.includes('20260922-2125') || page.includes('20260922-2140') || page.includes('20260922-eth-fixe') || page.includes('20260922-ib-batch') || page.includes('20260922-no-unhooked') || page.includes('20260922-same-sig'), 'data-build tip 2112 lineage / 2125 / 2140');
ok(page.includes('POURQUOI_PAS_LABEL'), 'honest label refuse constant');
ok(page.includes('eligibleNaissanceV8'), 'eligibility helper');
ok(!page.includes("this block was not engraved by this app's Create, so its market cannot open here"),
  'old engraved-session refuse string removed');
/* 2026-10-01 (Raksha : « V8 », « on-chain label » a l ecran = jargon interne) : la phrase de refus est
 * reecrite en clair. On epingle la NOUVELLE, et on verifie que l ANCIENNE ne revient pas. */
ok(page.includes("const POURQUOI_PAS_LABEL = 'This block was created somewhere else, so its market can\\'t be opened here. You can create a new one — 0.001 ETH.';"),
  'refuse copy says it plainly: created elsewhere, create a new one');
ok(!page.includes('V8 birth needs a face engraved at Create (on-chain label)'),
  'old jargon refuse (V8 / on-chain label) removed');
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
