// 2026-10-02 14:49 — (a) no router fee on ANY V8 pool whatever the quote (TBLOCK(e7e9)/SPCXc measured double fee:
// hook 4,975 + router 5,000 on a 1e6 SPCXc-wei buy); (b) multi-hop: the router steps aside ONLY if EVERY hop's hook pays.
import * as E from './echange.js';
import * as T from './tokenomics.js';
let ko = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? 'ok  ' : 'KO  ') + m); if (!c) ko++; };
const essai = async (m, f) => { try { await f(); } catch (e) { ok(false, m + ' (threw: ' + String(e && e.message || e).slice(0, 90) + ')'); } };
const SPCXc = '0xb2000000000000000000007b9fcbd005511acbd5', BLOC = '0xb200000000000000000000e7e9db76e8234f8f56';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', ETH = '0x0000000000000000000000000000000000000000';
const cleV8 = { currency0: SPCXc, currency1: BLOC, fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 };

await essai('(a)', async () => {
  const a = E.hookPaieEnDeviseVendable({ cle: cleV8, sens: 'ACHAT', zeroForOne: true, jeton: BLOC });
  ok(a.paie === true && a.devise === SPCXc, '(a) V8 SPCXc pool, buy, price NOT supplied: the hook pays (in SPCXc) -> router 0');
  const v = E.hookPaieEnDeviseVendable({ cle: cleV8, sens: 'VENTE', zeroForOne: false, jeton: BLOC });
  ok(v.paie === true && v.devise === SPCXc, '(a) V8 SPCXc pool, sell: the hook pays (in SPCXc) -> router 0');
  const v1 = E.hookPaieEnDeviseVendable({ cle: { ...cleV8, hooks: T.HOOK_PREVU }, sens: 'ACHAT', zeroForOne: true, jeton: BLOC });
  ok(v1.paie === false, '(a) negative control: V1 buy (hook pays nothing to a6cf) -> router keeps its fee');
  const devant = E.hookPaieEnDeviseVendable({ cle: { currency0: BLOC, currency1: '0xb2ffffffffffffffffffffffffffffffffffff01', fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 },
    sens: 'ACHAT', zeroForOne: false, jeton: BLOC });
  ok(devant.paie === false, '(a) negative control: V8 pool where the block is currency0 (hook fee in block) is never "paid"');
});

// (b) quoter mock: every quote returns 1e18; any other read returns 0
const q = '0x' + (10n ** 18n).toString(16).padStart(64, '0') + '0'.repeat(64);
const rpc = async (m, p) => (m === 'eth_call' ? q : m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64));
const compte = '0x' + '4'.repeat(40);
const blocUsdc = { currency0: USDC, currency1: BLOC, fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 };
const usdcEthSansHook = { currency0: ETH, currency1: USDC, fee: 500, tickSpacing: 10, hooks: ETH };
const usdcEthV8 = { ...usdcEthSansHook, fee: 0, tickSpacing: 200, hooks: T.HOOK_V8 };
await essai('(b)', async () => {
  const base = { rpc, chaine: 8453, compte, entree: BLOC, sortie: ETH, montant: 10n ** 21n, prixUsdEntree: null };
  const mixte = await E.planEchangeMultiSauts({ ...base, sauts: [{ cle: blocUsdc, zeroForOne: false }, { cle: usdcEthSansHook, zeroForOne: false }] });
  const fraisSaute = mixte.etat !== 'REFUSE' && mixte.resume && BigInt(mixte.resume.frais || 0) === 0n;
  ok(!fraisSaute, '(b) hop 1 V8 (pays) + hop 2 unhooked: the router fee is NOT skipped (taken, or the route refused)');
  ok(mixte.etat === 'REFUSE', '(b) here the fee would be in the block (entry), so the route is refused — nothing sent');
  const tout = await E.planEchangeMultiSauts({ ...base, sauts: [{ cle: blocUsdc, zeroForOne: false }, { cle: usdcEthV8, zeroForOne: false }] });
  ok(tout.resume && BigInt(tout.resume.frais) === 0n && BigInt(tout.resume.fraisBps) === 0n,
    '(b) negative control: every hop V8-paying -> router fee 0 (' + tout.etat + ' ' + (tout.pourquoi || '') + ')');
});
console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
