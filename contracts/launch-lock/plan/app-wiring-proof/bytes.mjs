// FORK ONLY. Flag OFF = base, to the byte: the txs the app builds (Create birth steps + mint, Buy, Sell) from the
// shipped tree (HOOK_7030_ACTIF=false) vs base 87a49cb, same fork state, same clock.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
const RPC = 'http://127.0.0.1:8581'; let id = 1;
const rpc = async (method, params = []) => { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) }); const j = await r.json(); if (j.error) throw new Error(method + ': ' + j.error.message); return j.result; };
const cast = (...a) => execFileSync('/home/box/.foundry/versions/base-nightly/cast', a).toString().trim();
const wait = async (h) => { for (let i = 0; i < 300; i++) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 150)); } };
const send = async (from, to, data, value = 0n) => { const r = await wait(await rpc('eth_sendTransaction', [{ from, to, data, value: '0x' + BigInt(value).toString(16), gas: '0xe4e1c0' }])); if (r.status !== '0x1') throw new Error('fail ' + data.slice(0, 10)); return r; };
const LL = readFileSync('/workspace/tb-crosscheck/hook7030/wt/contracts/launch-lock/test/LLBase.sol', 'utf8');
const CREATE_ROUTER = LL.match(/CREATE_ROUTER = (0x[0-9a-fA-F]{40})/)[1], URI = LL.match(/string constant URI = "([^"]*)"/)[1];
const ADM = '0x' + (0x7a1032n * 0x1000n + 2n).toString(16).padStart(40, '0'), BUYER = '0x' + (0x7a1032n * 0x1000n + 3n).toString(16).padStart(40, '0');
for (const a of [ADM, BUYER]) { await rpc('anvil_setCode', [a, '0x']); await rpc('anvil_setBalance', [a, '0x' + (10n ** 21n).toString(16)]); await rpc('anvil_impersonateAccount', [a]); }
const params = cast('abi-encode', 'f((uint8,string,string,address,uint8))', `(1,BYT,BYT,${ADM},18)`);
const data = cast('calldata', 'createPaid(uint8,bytes32,bytes,bytes[],address)', '0', cast('keccak', 'BYT' + Date.now()), params, `[${cast('calldata', 'updateContractURI(string)', URI)}]`, ADM);
const ret = await rpc('eth_call', [{ from: ADM, to: CREATE_ROUTER, data, value: '0x38d7ea4c68000' }, 'latest']);
await send(ADM, CREATE_ROUTER, data, 10n ** 15n);
const B = '0x' + ret.slice(26, 66);
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', SV = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';
const now = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp)) * 1000;
const J = (x) => JSON.stringify(x, (_, v) => typeof v === 'bigint' ? '0x' + v.toString(16) : v);
const txs = (p) => J({ etat: p.etat, etapes: (p.etapes || []).map((e) => [e.to, e.data, e.value || '0x0', !!e.payant]), tx: p.tx ? [p.tx.to, p.tx.data, p.tx.value] : null });
const res = {};
const trees = { off: '/workspace/tb-h7030/', base: '/workspace/tb-feefix2-rb/' };
for (const [v, dir] of Object.entries(trees)) {
  const T = await import(dir + 'tokenomics.js'), { planLancement } = await import(dir + 'lancer-pool.js'), L2 = await import(dir + 'lancer-pool-v2.js');
  const r = {};
  for (const devise of [null, USDC]) {
    const hooks = await T.hookCourant({ rpc, mainnet: true, avecDevise: !!devise, devise });
    let plan = await planLancement({ rpc, chaine: 8453, jeton: B, compte: ADM, valorisationEth: devise ? 27000 : 10, partPourMille: 999, maintenant: now,
      ...(devise ? { devise } : { quoteEthWei: 0n }), hooks });
    /* the app passes `caution: await cautionCreateurPour(hook, devise)` = null when the flag is OFF */
    plan = await L2.completerInscriptionPayee({ rpc, plan, compte: ADM, fraisWei: 10n ** 15n, hook: hooks, ...(v === 'off' ? { caution: null } : {}) });
    r['create-' + (devise ? 'USDC' : 'ETH')] = txs(plan);
  }
  res[v] = r;
}
// execute the base ETH birth so a V8 market exists, then Buy and Sell plans from both trees
{ const T = await import(trees.base + 'tokenomics.js'), { planLancement } = await import(trees.base + 'lancer-pool.js'), L2 = await import(trees.base + 'lancer-pool-v2.js');
  const hooks = await T.hookCourant({ rpc, mainnet: true, avecDevise: false, devise: null });
  let plan = await planLancement({ rpc, chaine: 8453, jeton: B, compte: ADM, valorisationEth: 10, partPourMille: 999, quoteEthWei: 0n, hooks });
  plan = await L2.completerInscriptionPayee({ rpc, plan, compte: ADM, fraisWei: 10n ** 15n, hook: hooks });
  for (const e of plan.etapes) await send(ADM, e.to, e.data, BigInt(e.value || '0x0'));
  await send(ADM, plan.tx.to, plan.tx.data, BigInt(plan.tx.value || '0x0')); }
for (const [v, dir] of Object.entries(trees)) {
  const { vieDuBlock } = await import(dir + 'marche.js'), { planEchange } = await import(dir + 'echange.js');
  const m = await vieDuBlock({ rpc, stateView: SV, jeton: B });
  res[v].market = J(m.cle);
  res[v].buy = txs(await planEchange({ rpc, chaine: 8453, jeton: B, compte: BUYER, sens: 'ACHAT', montant: 10n ** 15n, marcheLu: m, maintenant: now, fraisDevisesOk: new Set() }));
}
{ const { vieDuBlock } = await import(trees.base + 'marche.js'), { planEchange } = await import(trees.base + 'echange.js');
  const m = await vieDuBlock({ rpc, stateView: SV, jeton: B });
  const p = await planEchange({ rpc, chaine: 8453, jeton: B, compte: BUYER, sens: 'ACHAT', montant: 10n ** 15n, marcheLu: m, maintenant: now, fraisDevisesOk: new Set() });
  await send(BUYER, p.tx.to, p.tx.data, BigInt(p.tx.value)); }
const solde = BigInt(await rpc('eth_call', [{ to: B, data: '0x70a08231' + BUYER.slice(2).padStart(64, '0') }, 'latest']));
for (const [v, dir] of Object.entries(trees)) {
  const { vieDuBlock } = await import(dir + 'marche.js'), { planEchange } = await import(dir + 'echange.js');
  const m = await vieDuBlock({ rpc, stateView: SV, jeton: B });
  res[v].sell = txs(await planEchange({ rpc, chaine: 8453, jeton: B, compte: BUYER, sens: 'VENTE', montant: solde / 2n, marcheLu: m, maintenant: now, fraisDevisesOk: new Set() }));
}
const cmp = {};
for (const k of Object.keys(res.base)) cmp[k] = { identical: res.off[k] === res.base[k], bytes: res.base[k].length, etat: (res.base[k].match(/"etat":"(\w+)"/) || [])[1], hookIsV8: k === 'market' ? res.base[k].toLowerCase().includes('5926abdabf5d0006ee960a8270f3e124e5a764cc') : undefined, usdcInCreate: k === 'create-USDC' ? res.base[k].includes('833589fcd6edb6e08f4c7c32d4f71b54bda02913') : undefined };
writeFileSync('/workspace/tb-feefix-proof/h7030/bytes-out.json', J(res));
console.log(JSON.stringify(cmp, null, 1));
