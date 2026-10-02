// 2026-10-02 fee lot 2 — Zero 1's 3 surgical fixes on 48cfca9 (rebased on 8d19ec1). Each with a negative control.
//  (1) no full-birth simulation (no eth_simulateV1 / sim error) -> createPaid is NOT called, exact refusal copy
//  (2) profile launch (planLancement) refuses a block that would sort as currency0 on V8: 'Not tradable here yet'
//  (3) after 'fee was paid' the stop copy never also says 'nothing was sent' / 'Nothing is lost'
import { readFileSync } from 'node:fs';
import * as LP from './lancer-pool.js';
import * as T from './tokenomics.js';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let ko = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? 'ok  ' : 'KO  ') + m); if (!c) ko++; };
const essai = async (m, f) => { try { await f(); } catch (e) { ok(false, m + ' (threw: ' + String(e && e.message || e).slice(0, 80) + ')'); } };
const COPIE = "Can't check this birth right now, nothing was charged. Try again.";

// ── (1) ──
await essai('(1)', async () => {
  ok(LP.COPIE_NAISSANCE_NON_VERIFIEE === COPIE, '(1) exact refusal copy exported');
  const sq = await LP.simulerSequenceLancement({ rpc: async () => { throw new Error('the method eth_simulateV1 does not exist'); },
    compte: '0x' + '1'.repeat(40), appels: [{ to: '0x' + '2'.repeat(40), data: '0x' }] });
  ok(sq.etat === 'NON_MESURE', '(1) no eth_simulateV1 -> NON_MESURE (never ACCEPTE)');
  const i = html.indexOf('await preverifierNaissancePayee(');
  const j = html.indexOf('envoyerDepuisWallet(', i);
  const zone = i > 0 && j > i ? html.slice(i, j) : '';
  const g = zone.search(/if \(pre\.etat !== 'ACCEPTE'\) \{[\s\S]{0,200}?COPIE_NAISSANCE_NON_VERIFIEE;[\s\S]{0,120}?return;/);
  ok(g >= 0, '(1) Create returns on anything but ACCEPTE, BEFORE the wallet sends createPaid');
  ok(/COPIE_NAISSANCE_NON_VERIFIEE[^\n]*\} from '\.\/lancer-pool\.js'/.test(html), '(1) app imports the copy');
});

// ── (2) ──
await essai('(2)', async () => {
  const NVDAc = '0xb20000000000000000000078ee7ce2fe4908108c';
  let appels = 0;
  const rpc = async () => { appels++; throw new Error('offline'); };
  const base = { rpc, chaine: 8453, compte: '0x' + '3'.repeat(40), valorisationEth: 5, partPourMille: 999, devise: NVDAc, hooks: T.HOOK_V8 };
  const avant = await LP.planLancement({ ...base, jeton: '0xb200000000000000000000000000000000000001' });
  ok(avant.etat === 'REFUSE' && avant.refusFraisEnBlock === true, '(2) block sorting BEFORE NVDAc on V8 -> refused');
  ok(avant.pourquoi === 'Not tradable here yet', '(2) exact copy "Not tradable here yet"');
  ok(appels === 0, '(2) refused before any chain read (so before any wallet request)');
  const apres = await LP.planLancement({ ...base, jeton: '0xb2ffffffffffffffffffffffffffffffffffff01' });
  ok(!apres.refusFraisEnBlock, '(2) negative control: block sorting AFTER NVDAc is not refused by this rule');
  const eth = await LP.planLancement({ ...base, devise: '0x0000000000000000000000000000000000000000', jeton: '0xb200000000000000000000000000000000000001' });
  ok(!eth.refusFraisEnBlock, '(2) negative control: ETH pair (block always currency1) is not refused');
  ok(/e\.textContent = plan\.refusFraisEnBlock \? texteRefusEchange\(plan\.pourquoi\)/.test(html), '(2) profile screen shows the single refusal copy (R4 item 3), no prefix');
  ok(/poolVide && plan && !plan\.refusFraisEnBlock/.test(html), '(2) the empty-pool copy never overwrites it');
});

// ── (3) ──
await essai('(3)', async () => {
  const m = html.match(/function texteArretVie\(etapeN, prepaye, detail\) \{[\s\S]*?\n\}/);
  ok(!!m, '(3) texteArretVie found');
  const f = new Function('ethLisible', m[0] + '; return texteArretVie;')((w) => (Number(w) / 1e18).toString());
  const det = 'Not done (refused by user). you declined in your wallet — nothing was sent';
  const paye = f(2, { wei: '700000000000000' }, det);
  ok(/0\.0007 ETH Create fee was paid/.test(paye), '(3) prepaid: says the fee was paid');
  ok(!/nothing was sent|nothing is lost/i.test(paye), '(3) prepaid: never "nothing was sent" / "Nothing is lost" next to it');
  ok(/you declined in your wallet/.test(paye), '(3) prepaid: the useful part of the detail stays');
  const libre = f(2, null, 'Not done (refused by user). you declined in your wallet');
  ok(/Nothing is lost/.test(libre), '(3) negative control: nothing prepaid -> "Nothing is lost" still shown');
});

console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
