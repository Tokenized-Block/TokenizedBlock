// 2026-10-02 — hook 7030 (0x643D…24cC) wired behind HOOK_7030_ACTIF (B1 of Zero 1's report on a7fc46c).
// OFF (shipped): nothing changes — 7030 is unknown to the app, copy and launch steps are the old ones.
// ON (temp copy of the modules with the flag flipped): (1) in HOOKS_PAIENT_DEJA_A6CF both ways; (2) router 0 on ETH AND
// non-ETH legs (PLTRc = 10 bps total, all from the hook); (3) estNotreHook knows it (7 stock pairs not refused as
// "not a TokenizedBlock market"); (4) birth = inscrireAvecCaution with the app floor (~$1 of the paired currency).
import { mkdtempSync, readdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
let ko = 0, n = 0;
const ok = (c, m) => { n++; console.log((c ? 'ok  ' : 'KO  ') + m); if (!c) ko++; };
const essai = async (m, f) => { try { await f(); } catch (e) { ok(false, m + ' (threw: ' + String(e && e.message || e).slice(0, 110) + ')'); } };
const ICI = resolve(process.env.DIR || '.');
const H = '0x643dbb5e24d17a1d1d1909fa9f8c6267936124cc';
const ETH = '0x0000000000000000000000000000000000000000';
const PLTRc = '0xb2000000000000000000007d16372840df4dabbe';
const BLOC_HAUT = '0xb2ffffffffffffffffffffffffffffffffffff01'; // sorts after PLTRc -> PLTRc = currency0
const BLOC_BAS = '0xb200000000000000000000000000000000000001';  // sorts before PLTRc -> block = currency0
const RANDOM = '0x1111111111111111111111111111111111111111';
const compte = '0x' + '4'.repeat(40);

/* ON copy: the same modules, only `HOOK_7030_ACTIF = false` -> true in tokenomics.js */
const ON = mkdtempSync(join(tmpdir(), 'h7030-on-'));
for (const f of readdirSync(ICI)) if (f.endsWith('.js')) copyFileSync(join(ICI, f), join(ON, f));
const tk = readFileSync(join(ON, 'tokenomics.js'), 'utf8');
ok(tk.includes('export const HOOK_7030_ACTIF = false;'), 'shipped flag is OFF (export const HOOK_7030_ACTIF = false)');
writeFileSync(join(ON, 'tokenomics.js'), tk.replace('export const HOOK_7030_ACTIF = false;', 'export const HOOK_7030_ACTIF = true;'));
const charger = async (d) => ({
  T: await import(join(d, 'tokenomics.js')), P: await import(join(d, 'paires.js')), E: await import(join(d, 'echange.js')),
  L2: await import(join(d, 'lancer-pool-v2.js')), L: await import(join(d, 'lancer-pool.js')), M: await import(join(d, 'marche.js')) });
const off = await charger(ICI), on = await charger(ON);

// quoter / reads mock: every eth_call returns 1e18 in word 0 (quotes), 0 elsewhere (no code -> fine for plans)
const q = '0x' + (10n ** 18n).toString(16).padStart(64, '0') + '0'.repeat(64);
const rpc = async (m) => (m === 'eth_call' ? q : m === 'eth_chainId' ? '0x2105' : '0x' + '0'.repeat(64));
const clePltr = { currency0: PLTRc, currency1: BLOC_HAUT, fee: 0, tickSpacing: 200, hooks: H };
const clePltrBas = { currency0: BLOC_BAS, currency1: PLTRc, fee: 0, tickSpacing: 200, hooks: H };
const cleEth = { currency0: ETH, currency1: BLOC_HAUT, fee: 0, tickSpacing: 200, hooks: H };
const achat = (X, cle, jeton, sens = 'ACHAT') => X.E.planEchange({ rpc, chaine: 8453, jeton, compte, sens, montant: 10n ** 15n,
  marcheLu: { etat: 'LUE', cle, paire: cle.currency0 === ETH ? 'ETH' : 'PLTRc' } });

await essai('(1) list', async () => {
  ok(on.T.HOOK_7030.toLowerCase() === H, '(1) HOOK_7030 = 0x643DbB5e24D17a1d1D1909fa9F8C6267936124cC');
  const e7 = on.T.HOOKS_PAIENT_DEJA_A6CF.find((e) => String(e.hook).toLowerCase() === H);
  ok(!!e7 && JSON.stringify(e7.sens) === '["ACHAT","VENTE"]', '(1) ON: 7030 in HOOKS_PAIENT_DEJA_A6CF, both directions');
  ok(on.T.hookPaieDejaA6cf(H, 'ACHAT') && on.T.hookPaieDejaA6cf(H, 'VENTE'), '(1) ON: hookPaieDejaA6cf true buy and sell');
  ok(!off.T.HOOKS_PAIENT_DEJA_A6CF.some((e) => String(e.hook).toLowerCase() === H) && !off.T.hookPaieDejaA6cf(H, 'ACHAT'), '(1) negative control OFF: 7030 is not in the list');
  ok(off.T.HOOKS_PAIENT_DEJA_A6CF.length + 1 === on.T.HOOKS_PAIENT_DEJA_A6CF.length, '(1) ON adds exactly one entry; the live entries (V8, V8-open, V1/V2) unchanged');
  ok(on.T.hookPaieDejaA6cf(on.T.HOOK_V8, 'ACHAT') && off.T.hookPaieDejaA6cf(off.T.HOOK_V8, 'VENTE'), '(1) V8 stays in the list both ways (ON and OFF)');
});
await essai('(2) legs', async () => {
  for (const [cle, j, nom] of [[clePltr, BLOC_HAUT, 'PLTRc=currency0'], [clePltrBas, BLOC_BAS, 'block=currency0']]) {
    for (const sens of ['ACHAT', 'VENTE']) {
      const zf = sens === 'ACHAT' ? cle.currency0 !== j : cle.currency0 === j;
      const r = on.E.hookPaieEnDeviseVendable({ cle, sens, zeroForOne: zf, jeton: j });
      ok(r.paie === true && r.devise === PLTRc, '(2) ON ' + nom + ' ' + sens + ': hook fee in PLTRc (never the block) -> router 0');
    }
  }
  const pOn = await achat(on, clePltr, BLOC_HAUT);
  ok(pOn.etat !== 'REFUSE' && pOn.resume && BigInt(pOn.resume.fraisBps) === 0n && BigInt(pOn.resume.frais) === 0n
    && pOn.resume.fraisMarcheBps === 10, '(2) ON PLTRc buy plan: router 0 bps, market fee 10 bps (' + pOn.etat + ' ' + (pOn.pourquoi || '') + ')');
  const vOn = await achat(on, clePltrBas, BLOC_BAS, 'VENTE');
  ok(vOn.etat !== 'REFUSE' && BigInt(vOn.resume.fraisBps) === 0n, '(2) ON PLTRc sell (block=currency0): router 0 (' + vOn.etat + ')');
  const eOn = await achat(on, cleEth, BLOC_HAUT);
  ok(eOn.etat !== 'REFUSE' && BigInt(eOn.resume.fraisBps) === 0n && eOn.resume.fraisMarcheBps === 10, '(2) ON ETH buy plan: router 0, 10 bps hook');
  const eOff = await achat(off, cleEth, BLOC_HAUT);
  ok(eOff.resume && BigInt(eOff.resume.fraisBps) === 50n, '(2) negative control OFF: ETH pool on 7030 keeps the 0.5% router fee (stacked = 60 bps)');
  const multi = await on.E.planEchangeMultiSauts({ rpc, chaine: 8453, compte, entree: BLOC_HAUT, sortie: ETH, montant: 10n ** 18n, prixUsdEntree: null,
    sauts: [{ cle: clePltr, zeroForOne: false }, { cle: { currency0: ETH, currency1: PLTRc, fee: 500, tickSpacing: 10, hooks: ETH }, zeroForOne: false }] });
  ok(!(multi.etat !== 'REFUSE' && multi.resume && BigInt(multi.resume.frais || 0) === 0n), '(2) multi-hop 7030 + hookless leg: router fee NOT skipped (taken or refused)');
});
await essai('(3) recognition', async () => {
  ok(on.T.estNotreHook(H) && on.T.estHookDeNaissance(H), '(3) ON: estNotreHook + estHookDeNaissance know 7030');
  ok(!off.T.estNotreHook(H) && !off.T.estHookDeNaissance(H), '(3) negative control OFF: unknown');
  const r = await achat(off, clePltr, BLOC_HAUT);
  ok(r.etat === 'REFUSE' && /not a TokenizedBlock market/.test(r.pourquoi), '(3) negative control OFF: PLTRc pool refused "not a TokenizedBlock market"');
  for (const [s, a] of [['TOSHI', '0xac1bd2486aaf3b5c0fc3fd868558b082a531b2b4'], ['OUSD', '0xb2000000000000000000002feb517dfec7415344'],
    ['AVGOc', '0xb200000000000000000000fc737aea6196ab5a4c'], ['BEc', '0xb20000000000000000000016f9dfe862feba122b'],
    ['HIMSc', '0xb20000000000000000000043a599976181bcf336'], ['MUc', '0xb200000000000000000000fd2f87532b90095211'], ['PLTRc', PLTRc]]) {
    const cle = { currency0: a, currency1: BLOC_HAUT, fee: 0, tickSpacing: 200, hooks: H };
    const p = await achat(on, cle, BLOC_HAUT);
    ok(p.etat !== 'REFUSE' && BigInt(p.resume.fraisBps) === 0n, '(3) ON ' + s + ' pair tradable, router 0 (' + p.etat + ' ' + (p.pourquoi || '') + ')');
    ok(on.P.refusPrixNouveauBlock(a, 8453, { routable: true, symbole: s, ...on.T.OPTIONS_LANCEMENT }) === null, '(3) ON Create guard admits ' + s);
  }
  ok(off.P.refusPrixNouveauBlock(PLTRc, 8453, { routable: true, symbole: 'PLTRc', ...off.T.OPTIONS_LANCEMENT }) !== null,
    '(3) negative control OFF: Create guard still refuses PLTRc (as base)');
  ok(on.M.CLES_MARCHE[0].hooks === on.T.HOOK_7030 && !off.M.CLES_MARCHE.some((c) => c.hooks === off.T.HOOK_7030), '(3) ETH market discovery: 7030 first only when ON');
  ok(on.P.hookDeLancementPour(RANDOM, 8453, { h7030: true }) === null, '(3) a quote outside the 19 + ETH is not admitted by 7030');
});
await essai('(4) birth', async () => {
  ok(on.P.minimumCautionCreateur({ prixUsd: 2500, decimales: 18 }) === 400000000000000n, '(4) floor: $1 of ETH @2500 = 4e14 wei');
  ok(on.P.minimumCautionCreateur({ prixUsd: 150, decimales: 18 }) === 6666666666666667n, '(4) floor: $1 of a $150 18-dec stock, rounded UP');
  ok(on.P.minimumCautionCreateur({ prixUsd: 0, decimales: 18 }) === null && on.P.minimumCautionCreateur({ prixUsd: 2, decimales: 'x' }) === null, '(4) unreadable price/decimals -> null');
  ok(on.P.minimumCautionCreateur({ prixUsd: 1e9, decimales: 0 }) === 1n, '(4) floor never below 1 raw unit');
  const plan = { etat: 'APPROBATIONS', etapes: [{ nom: 'x', to: RANDOM, data: '0x', value: '0x0' }], cle: cleEth, sqrtVise: 79228162514264337593543950336n, tx: {} };
  const S = on.L2.SIG_INSCRIRE_CAUTION;
  ok(S === 'inscrireAvecCaution((address,address,uint24,int24,address),uint160,uint128)', '(4) signature');
  const { selecteur } = await import(join(ON, 'pool.js'));
  const lecteur = ({ payee = false, qui = ETH, allow = 0n, prix = 0n } = {}) => async (m, p) => {
    const d = String(p[0].data).slice(2, 10);
    const w = (x) => '0x' + BigInt(x).toString(16).padStart(64, '0');
    if (d === selecteur('payee(bytes32)')) return w(payee ? 1 : 0);
    if (d === selecteur('inscrit(bytes32)')) return w(BigInt(qui));
    if (d === selecteur('prixInscrit(bytes32)')) return w(prix);
    if (d === selecteur('createurs(bytes32)')) return w(BigInt(qui)) + '0'.repeat(128);
    if (d === selecteur('allowance(address,address)')) return w(allow);
    return w(0);
  };
  const fw = 10n ** 15n, min = 4n * 10n ** 14n;
  const e = await on.L2.completerInscriptionPayee({ rpc: lecteur(), plan, compte, fraisWei: fw, hook: H, caution: { minimum: min, devise: ETH } });
  const st = e.etapes[e.etapes.length - 1];
  ok(st.data.startsWith('0x' + selecteur(S)) && st.data.startsWith('0xfde76f6a') && on.L2.estEtapeInscription(st.data), '(4) ON ETH birth step = inscrireAvecCaution (0xfde76f6a)');
  ok(BigInt(st.value) === fw + min && st.payant === true && st.cautionWei === min, '(4) ETH: value = birth fee + creator minimum, payant');
  ok(BigInt('0x' + st.data.slice(-64)) === min, '(4) calldata carries the minimum');
  const pp = { ...plan, cle: clePltr };
  const s2 = await on.L2.completerInscriptionPayee({ rpc: lecteur(), plan: pp, compte, fraisWei: fw, hook: H, caution: { minimum: 5000n, devise: PLTRc } });
  const [ap, ic] = s2.etapes.slice(-2);
  ok(ap.to.toLowerCase() === PLTRc && ap.data.startsWith('0x095ea7b3') && ap.data.includes(H.slice(2)) && BigInt('0x' + ap.data.slice(-64)) === 5000n,
    '(4) PLTRc birth: approve(hook, minimum) on PLTRc first');
  ok(ic.data.startsWith('0xfde76f6a') && BigInt(ic.value) === fw && ic.cautionWei === 0n, '(4) PLTRc: inscrireAvecCaution value = birth fee only (caution pulled in PLTRc)');
  const s3 = await on.L2.completerInscriptionPayee({ rpc: lecteur({ allow: 5000n }), plan: pp, compte, fraisWei: fw, hook: H, caution: { minimum: 5000n, devise: PLTRc } });
  ok(!s3.etapes.some((x) => x.data.startsWith('0x095ea7b3')), '(4) allowance already enough -> no approve step');
  const nm = await on.L2.completerInscriptionPayee({ rpc: lecteur(), plan, compte, fraisWei: fw, hook: H, caution: { minimum: null } });
  ok(nm.etat === 'NON_MESURE' && nm.etapes.length === 0, '(4) floor unreadable -> NON_MESURE, nothing asked');
  const nm2 = await on.L2.completerInscriptionPayee({ rpc: lecteur(), plan, compte, fraisWei: fw, hook: H });
  ok(nm2.etat === 'NON_MESURE', '(4) 7030 without caution never falls back to plain inscrire');
  const deja = await on.L2.completerInscriptionPayee({ rpc: lecteur({ payee: true, qui: compte, prix: plan.sqrtVise }), plan, compte, fraisWei: fw, hook: H, caution: { minimum: min, devise: ETH } });
  ok(deja.etapes.length === 1 && deja.etat === 'APPROBATIONS', '(4) already escrowed by me at this price -> no second escrow (DejaCautionne avoided)');
  const autre = await on.L2.completerInscriptionPayee({ rpc: lecteur({ payee: true, qui: RANDOM }), plan, compte, fraisWei: fw, hook: H, caution: { minimum: min, devise: ETH } });
  ok(autre.etat === 'REFUSE', '(4) escrowed by another admin -> refused');
  // flag OFF / other hooks: caution is ignored, steps identical to the call without it
  const v8a = await off.L2.completerInscriptionPayee({ rpc: lecteur(), plan, compte, fraisWei: fw, hook: off.T.HOOK_V8 });
  const v8b = await off.L2.completerInscriptionPayee({ rpc: lecteur(), plan, compte, fraisWei: fw, hook: off.T.HOOK_V8, caution: { minimum: min, devise: ETH } });
  ok(JSON.stringify(v8a, (_, v) => typeof v === 'bigint' ? v.toString() : v) === JSON.stringify(v8b, (_, v) => typeof v === 'bigint' ? v.toString() : v)
    && v8a.etapes[1].data.startsWith('0xbb920fed'), '(4) V8 birth unchanged: inscrire 0xbb920fed, caution ignored');
  const offH = await off.L2.completerInscriptionPayee({ rpc: lecteur(), plan, compte, fraisWei: fw, hook: H, caution: { minimum: min, devise: ETH } });
  ok(!offH.etapes.some((x) => String(x.data).startsWith('0xfde76f6a')), '(4) negative control OFF: no inscrireAvecCaution ever built');
  // launch guard: 7030 admits ETH + its 19, refuses others
  const lr = await on.L.planLancement({ rpc, chaine: 8453, jeton: BLOC_HAUT, compte, valorisationEth: 10, partPourMille: 999, devise: RANDOM, hooks: on.T.HOOK_7030 });
  ok(lr.etat === 'REFUSE' && /can't price a new block on this hook/.test(lr.pourquoi), '(4) launch guard: 7030 refuses a quote it does not admit');
  // copy
  ok(on.P.libellePuceCreation({ symbole: 'PLTRc', h7030: true }) === 'Quote = PLTRc · birth fee 0.001 ETH, once · swap fee 0.1% per trade (app 0.07% · creator 0.03%)',
    '(4) ON copy: "app 0.07% · creator 0.03%"');
  ok(off.P.libellePuceCreation({ symbole: 'PLTRc', h7030: false }) === off.P.libellePuceCreation({ symbole: 'PLTRc' })
    && !off.P.libellePuceCreation({ symbole: 'PLTRc' }).includes('creator 0.03%'), '(4) OFF copy unchanged, no split shown');
});
const app = readFileSync(join(ICI, 'app.html'), 'utf8');
ok(/function paireVa7030\(adr\) \{\s+return HOOK_7030_ACTIF === true/.test(app), 'app: chip split gated on HOOK_7030_ACTIF');
ok((app.match(/caution: await cautionCreateurPour\(/g) || []).length === 3, 'app: the 3 completerInscriptionPayee call sites pass the creator floor');
ok(!/startsWith\('0xbb920fed'\)/.test(app) && (app.match(/estEtapeInscription\(/g) || []).length >= 4,
  'app: inscription steps (prepaid value, balance checks, refuse-before-pay) recognised for both selectors');
ok(/function paireVa7030[\s\S]{0,200}HOOK_7030_ACTIF === true/.test(app) && (app.match(/OPTIONS_LANCEMENT\.h7030 === true && paireVa7030\(/g) || []).length === 2,
  'app: split copy only when the flag is ON (OPTIONS_LANCEMENT.h7030)');
rmSync(ON, { recursive: true, force: true });
console.log(n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
