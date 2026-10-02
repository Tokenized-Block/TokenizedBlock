// FORK ONLY (own anvil :8581, Base). No real tx. App modules with HOOK_7030_ACTIF flipped ON in a temp copy.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const RPC = 'http://127.0.0.1:8581'; let id = 1;
const rpc = async (method, params = []) => {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) });
  const j = await r.json(); if (j.error) { const e = new Error(method + ': ' + j.error.message); e.data = j.error.data; throw e; } return j.result;
};
const CAST = '/home/box/.foundry/versions/base-nightly/cast';
const cast = (...a) => execFileSync(CAST, a).toString().trim();
const ON = '/tmp/h7030-on-18/';
const T = await import(ON + 'tokenomics.js'), P = await import(ON + 'paires.js');
const { planLancement } = await import(ON + 'lancer-pool.js');
const { completerInscriptionPayee } = await import(ON + 'lancer-pool-v2.js');
const { vieDuBlock } = await import(ON + 'marche.js');
const { planEchange } = await import(ON + 'echange.js');
const { FEE_WALLET } = await import(ON + 'frais-creation.js');
const PM = '0x498581ff718922c3f8e6a244956af099b2652b2b', D4E59 = '0x4e59b44847b379578588920ca78fbf26c0b4956c';
const SV = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';
const HOOK = T.HOOK_7030.toLowerCase(), STK = '0xb20000000000000000000058b8c947e44011dfe6' /* NFLXc, one of the 18 */, ETH = '0x0000000000000000000000000000000000000000';
const LL = readFileSync('/workspace/tb-crosscheck/hook7030/wt/contracts/launch-lock/test/LLBase.sol', 'utf8');
const CREATE_ROUTER = LL.match(/CREATE_ROUTER = (0x[0-9a-fA-F]{40})/)[1], URI = LL.match(/string constant URI = "([^"]*)"/)[1];
const eoa = (n) => '0x' + (0x7a1031n * 0x1000n + BigInt(n)).toString(16).padStart(40, '0');
const DEP = eoa(1), ADM = eoa(2), BUYER = eoa(3), ADM2 = eoa(5);
const pad = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const wait = async (h) => { for (let i = 0; i < 300; i++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 150)); } throw new Error('no receipt'); };
const send = async (from, to, data, value = 0n, gas = 15_000_000) => {
  const tx = { from, data, value: '0x' + BigInt(value).toString(16), gas: '0x' + gas.toString(16) }; if (to) tx.to = to;
  const r = await wait(await rpc('eth_sendTransaction', [tx])); return { ...r, cost: BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice) };
};
const must = (r, what) => { if (r.status !== '0x1') throw new Error('tx failed: ' + what); return r; };
const ethBal = async (a) => BigInt(await rpc('eth_getBalance', [a, 'latest']));
const tokBal = async (t, a) => BigInt(await rpc('eth_call', [{ to: t, data: '0x70a08231' + pad(a) }, 'latest']));
const call = async (to, sig, ...args) => rpc('eth_call', [{ to, data: cast('calldata', sig, ...args) }, 'latest']);
const kid = (k) => cast('keccak', cast('abi-encode', 'f(address,address,uint24,int24,address)', k.currency0, k.currency1, String(k.fee), String(k.tickSpacing), k.hooks));
const comptes = async (k) => { const r = await call(HOOK, 'comptes(bytes32)', kid(k)); return { du: BigInt('0x' + r.slice(2, 66)), co: BigInt('0x' + r.slice(66, 130)) }; };
for (const a of [DEP, ADM, BUYER, ADM2]) { await rpc('anvil_setCode', [a, '0x']); await rpc('anvil_setBalance', [a, '0x' + (10n ** 21n).toString(16)]); await rpc('anvil_impersonateAccount', [a]); }
const out = { forkBlock: parseInt(await rpc('eth_blockNumber'), 16) };
// 1. hook via the EXACT plan calldata (0x4e59)
if ((await rpc('eth_getCode', [HOOK, 'latest'])) === '0x') must(await send(DEP, D4E59, readFileSync('/workspace/tb-h41/contracts/launch-lock/plan/deploy-calldata.hex', 'utf8').trim(), 0n, 8_000_000), 'deploy');
const fw = ('0x' + (await call(HOOK, 'feeWallet()')).slice(26)).toLowerCase();
out.hookFeeWalletIsAppFeeWallet = fw === FEE_WALLET.toLowerCase();
out.hookCourantEth = (await T.hookCourant({ rpc, mainnet: true, avecDevise: false, devise: null })).toLowerCase() === HOOK ? 'HOOK_7030' : 'other';
out.hookCourantNflx = (await T.hookCourant({ rpc, mainnet: true, avecDevise: true, devise: STK })).toLowerCase() === HOOK ? 'HOOK_7030' : 'other';
// 2. B20 blocks (CreateRouter.createPaid, label in contractURI) — what Create does before the birth
async function creerB20(sym, adm) {
  const params = cast('abi-encode', 'f((uint8,string,string,address,uint8))', `(1,${sym},${sym},${adm},18)`);
  const salt = cast('keccak', sym + Date.now());
  const data = cast('calldata', 'createPaid(uint8,bytes32,bytes,bytes[],address)', '0', salt, params, `[${cast('calldata', 'updateContractURI(string)', URI)}]`, adm);
  const ret = await rpc('eth_call', [{ from: adm, to: CREATE_ROUTER, data, value: '0x' + (10n ** 15n).toString(16) }, 'latest']);
  must(await send(adm, CREATE_ROUTER, data, 10n ** 15n), 'createPaid'); return '0x' + ret.slice(26, 66);
}
// ETH price for the creator floor: Chainlink ETH/USD on Base (what /api/prix-usd mirrors); NFLXc: fixture (no on-chain feed; issuer API gives none)
const cl = await call('0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', 'latestRoundData()');
const ethUsd = Number(BigInt('0x' + cl.slice(66, 130))) / 1e8;
const STK_USD_FIXTURE = 100;
async function naissance(bloc, devise, adm, prixUsd, decimales) {
  const hooks = await T.hookCourant({ rpc, mainnet: true, avecDevise: devise !== ETH, devise: devise === ETH ? null : devise });
  const valo = devise === ETH ? 10 : 10 * ethUsd / prixUsd;
  let plan = await planLancement({ rpc, chaine: 8453, jeton: bloc, compte: adm, valorisationEth: valo, partPourMille: 999,
    ...(devise !== ETH ? { devise } : { quoteEthWei: 0n }), hooks });
  if (plan.etat === 'REFUSE' || plan.etat === 'NON_MESURE') throw new Error('planLancement ' + plan.etat + ' ' + plan.pourquoi);
  const minimum = P.minimumCautionCreateur({ prixUsd, decimales });
  plan = await completerInscriptionPayee({ rpc, plan, compte: adm, fraisWei: 10n ** 15n, hook: hooks, caution: { minimum, devise } });
  if (plan.etat === 'REFUSE' || plan.etat === 'NON_MESURE') throw new Error('completer ' + plan.etat + ' ' + plan.pourquoi);
  const noms = [];
  const fw0 = await ethBal(fw);
  for (const et of plan.etapes) { must(await send(adm, et.to, et.data, BigInt(et.value || '0x0')), et.nom); noms.push(et.data.slice(0, 10) + (et.payant ? '(payant ' + BigInt(et.value) + ')' : '')); }
  must(await send(adm, plan.tx.to, plan.tx.data, BigInt(plan.tx.value || '0x0')), 'mint');
  const k = plan.cle, i = kid(k);
  const cr = await call(HOOK, 'createurs(bytes32)', i);
  return { k, minimum, etapes: noms, feeWalletBirthDelta: String(await ethBal(fw) - fw0),
    creatorIsAdmin: ('0x' + cr.slice(26, 66)).toLowerCase() === adm.toLowerCase(),
    caution: String(BigInt(await call(HOOK, 'caution(bytes32)', i))), minimumCaution: String(BigInt(await call(HOOK, 'minimumCaution(bytes32)', i))),
    payee: BigInt(await call(HOOK, 'payee(bytes32)', i)) === 1n };
}
const now = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp)) * 1000;
// 3. ETH birth by the app path, then a 0.001 ETH buy by the app path (market DISCOVERED, no clesExactes)
const B1 = await creerB20('H7E' + (out.forkBlock % 10000), ADM);
const nE = await naissance(B1, ETH, ADM, ethUsd, 18);
out.ethUsdChainlink = ethUsd; out.ethBirth = { ...nE, k: undefined };
const mE = await vieDuBlock({ rpc, stateView: SV, jeton: B1 });
out.ethMarketDiscovered = mE.etat + (mE.cle && mE.cle.hooks.toLowerCase() === HOOK ? ' on HOOK_7030' : ' other');
const M = 10n ** 15n;
const pE = await planEchange({ rpc, chaine: 8453, jeton: B1, compte: BUYER, sens: 'ACHAT', montant: M, marcheLu: mE, maintenant: now, fraisDevisesOk: new Set() });
if (pE.etat !== 'PRET') throw new Error('ETH plan ' + pE.etat + ' ' + pE.pourquoi);
{ const w0 = await ethBal(fw), c0 = await comptes(nE.k), e0 = await ethBal(BUYER), b0 = await tokBal(B1, BUYER);
  const r = must(await send(BUYER, pE.tx.to, pE.tx.data, BigInt(pE.tx.value || '0x0'), 3_000_000), 'eth buy');
  const w1 = await ethBal(fw), c1 = await comptes(nE.k);
  out.ethBuy = { routerBps: String(pE.resume.fraisBps), routerFeeWei: String(pE.resume.frais), buyerPaidWei: String(e0 - await ethBal(BUYER) - r.cost),
    feeWalletDeltaWei: String(w1 - w0), creatorDueDeltaWei: String(c1.du - c0.du), blocksReceived: String(await tokBal(B1, BUYER) - b0),
    totalBps: Number((w1 - w0 + c1.du - c0.du) * 100000n / M) / 10 }; }
// 4. NFLXc (one of the 18): fund ADM2 + BUYER from the fork's PoolManager NFLXc float (fork only), birth + buy + sell by the app path
await rpc('anvil_impersonateAccount', [PM]); await rpc('anvil_setBalance', [PM, '0x' + (10n ** 18n).toString(16)]);
for (const a of [ADM2, BUYER]) must(await send(PM, STK, cast('calldata', 'transfer(address,uint256)', a, String(2n * 10n ** 8n)), 0n, 500000), 'fund nflx');
const B2 = await creerB20('H7N' + (out.forkBlock % 10000), ADM2);
const nP = await naissance(B2, STK, ADM2, STK_USD_FIXTURE, 8);
out.nflxUsdFixture = STK_USD_FIXTURE; out.nflxBirth = { ...nP, k: undefined };
const mP = await vieDuBlock({ rpc, stateView: SV, jeton: B2, clesExactes: [nP.k] });
out.nflxMarket = mP.etat + (mP.cle && mP.cle.hooks.toLowerCase() === HOOK ? ' on HOOK_7030' : ' other');
async function echanger(sens, montant, tag) {
  const plan = () => planEchange({ rpc, chaine: 8453, jeton: B2, compte: BUYER, sens, montant, marcheLu: mP, maintenant: now, fraisDevisesOk: new Set([STK]) });
  let p = await plan();
  const etat0 = p.etat + (p.pourquoi ? ': ' + p.pourquoi : '');
  if (p.etat !== 'PRET' && p.etat !== 'APPROBATIONS') throw new Error(tag + ' plan ' + etat0);
  const nAppr = (p.etapes || []).length;
  for (const et of (p.etapes || [])) must(await send(BUYER, et.to, et.data, BigInt(et.value || '0x0'), 500000), 'appr ' + et.nom);
  if (p.etat === 'APPROBATIONS') p = await plan();
  if (p.etat !== 'PRET') throw new Error(tag + ' plan after approvals ' + p.etat + ' ' + p.pourquoi);
  const w0 = await tokBal(STK, fw), c0 = await comptes(nP.k), s0 = await tokBal(STK, BUYER), b0 = await tokBal(B2, BUYER), r0 = await tokBal(STK, p.tx.to);
  must(await send(BUYER, p.tx.to, p.tx.data, BigInt(p.tx.value || '0x0'), 3_000_000), tag);
  const w1 = await tokBal(STK, fw), c1 = await comptes(nP.k), s1 = await tokBal(STK, BUYER), b1 = await tokBal(B2, BUYER);
  const fwD = w1 - w0, crD = c1.du - c0.du;
  /* q = the stock amount that crossed the pool: buy = what the buyer paid; sell = what the buyer got + both fee pieces */
  const q = sens === 'ACHAT' ? s0 - s1 : (s1 - s0) + fwD + crD;
  return { planFirst: etat0, approvals: nAppr, routerBps: String(p.resume.fraisBps), routerFee: String(p.resume.frais),
    stockQRaw: String(q), feeWalletDeltaStockRaw: String(fwD), creatorDueDeltaStockRaw: String(crD),
    sinkIsFloor700: fwD === q * 700n / 1000000n, creatorIsFloor300: crD === q * 300n / 1000000n,
    feeWalletBlockDelta: String(await tokBal(B2, fw)), routerStockLeft: String(await tokBal(STK, p.tx.to) - r0),
    blocksDelta: String(b1 - b0), feeWalletBps: Number(fwD * 1000000n / q) / 100, creatorBps: Number(crD * 1000000n / q) / 100 };
}
out.nflxBuy = await echanger('ACHAT', 10n ** 7n, 'nflx buy'); // 0.1 NFLXc
const recus = await tokBal(B2, BUYER);
out.nflxSell = await echanger('VENTE', recus / 2n, 'nflx sell');
out.state = { B1, B2, kE: nE.k, kP: nP.k, BUYER, now, STK };
writeFileSync('/workspace/tb-feefix-proof/h7030/proof18-out.json', JSON.stringify(out, (_, v) => typeof v === 'bigint' ? v.toString() : v, 1));
console.log(JSON.stringify(out, (_, v) => typeof v === 'bigint' ? v.toString() : v, 1));
