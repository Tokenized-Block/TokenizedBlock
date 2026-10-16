// banc-unit-lancement-fork-20261017.mjs - rehearsal of UNIT's remaining step on an anvil fork of Base (impersonated creator, no key).
// Usage: anvil --fork-url https://mainnet.base.org --port 8549 --chain-id 8453 ; node banc-unit-lancement-fork-20261017.mjs [url]
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const L = await imp('lancer-pool.js'), L2 = await imp('lancer-pool-v2.js'), T = await imp('tokenomics.js'), D = await imp('hook-7030-descripteur.js');
const { selecteur, poolId } = await imp('pool.js');
const URL_FORK = process.argv[2] || 'http://127.0.0.1:8549';
const UNIT = process.env.UNIT || '0xb2000000000000000000007afa7ed748b0874f27';
const CREATEUR = process.env.CREATEUR || '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
let id = 0, n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { ko++; console.log('KO  ' + m); } };
const rpc = async (method, params) => { const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json()); if (r.error) throw new Error(r.error.message); return r.result; };
const H = T.HOOK_7030;
const SV = L.V4_ADRESSES[8453].stateView;
console.log('hook', H, 'stateView', SV, 'posm', L.V4_ADRESSES[8453].posm);
const cle0 = L.cleDePool ? null : null;
const blocF = await rpc('eth_getBlockByNumber', ['latest', false]);
const maintenant = Number(BigInt(blocF.timestamp)) * 1000;
console.log('fork block', BigInt(blocF.number), 'time', new Date(maintenant).toString());
const plan0 = await L.planLancement({ rpc, chaine: 8453, jeton: UNIT, compte: CREATEUR, valorisationEth: 10, partPourMille: 999, hooks: H, quoteEthWei: 0n, maintenant });
console.log('planLancement etat', plan0.etat, plan0.pourquoi || '', 'etapes', (plan0.etapes || []).length);
const pid = poolId(plan0.cle);
console.log('poolId', pid);
const plan = await L2.completerInscriptionPayee({ rpc, plan: plan0, compte: CREATEUR, fraisWei: 300000000000000n, hook: H,
  caution: { minimum: D.plancher7030(T.ETH_NATIF || '0x0000000000000000000000000000000000000000') || 1n, devise: '0x0000000000000000000000000000000000000000' } });
console.log('plan etat', plan.etat, plan.pourquoi || '', 'inscriptionPayee', plan.inscriptionPayee);
const etapes = plan.etapes || [];
ok(etapes.length === 0, 'no step before the launch tx (got ' + etapes.length + ': ' + etapes.map((e) => e.nom).join(' | ') + ')');
ok(!!plan.tx, 'one launch tx');
ok(BigInt(plan.sqrtVise) === 10000n << 96n, 'sqrtVise = 10000<<96 (' + plan.sqrtVise + ')');
ok(plan.tx && !L2.estEtapeInscription(plan.tx.data) && String(plan.tx.to).toLowerCase() !== String(H).toLowerCase(), 'launch tx is not a hook payment');
console.log('TX to    ', plan.tx.to);
console.log('TX value ', plan.tx.value);
console.log('TX seed (ethRequis wei)', String(plan.ethRequis), 'blocks placed', String(plan.blocksRequis), 'L', String(plan.L));
(await import('node:fs')).writeFileSync(path.join(process.env.TEMP || ICI, 'unit-plan-calldata.txt'), plan.tx.data);
console.log('TX data len', (plan.tx.data.length - 2) / 2, 'bytes, sha-free prefix', plan.tx.data.slice(0, 10));
const slot = async () => await rpc('eth_call', [{ to: SV, data: '0x' + selecteur('getSlot0(bytes32)') + pid.slice(2) }, 'latest']);
const liq = async () => BigInt('0x' + (await rpc('eth_call', [{ to: SV, data: '0x' + selecteur('getTickLiquidity(bytes32,int24)') + pid.slice(2) + BigInt.asUintN(256, BigInt(plan0.p.tickHaut)).toString(16).padStart(64, '0') }, 'latest'])).slice(2, 66));
ok(BigInt('0x' + (await slot()).slice(2, 66)) === 0n, 'before: pool not initialized');
const bal = async (a) => BigInt(await rpc('eth_getBalance', [a, 'latest']));
const balTok = async (t, a) => BigInt(await rpc('eth_call', [{ to: t, data: '0x70a08231' + a.slice(2).toLowerCase().padStart(64, '0') }, 'latest']));
await rpc('anvil_impersonateAccount', [CREATEUR]);
const ethAv = await bal(CREATEUR), hookAv = await bal(H), tokAv = await balTok(UNIT, CREATEUR);
let gas = 3000000n; try { gas = BigInt(await rpc('eth_estimateGas', [{ from: CREATEUR, ...plan.tx }])) * 13n / 10n; } catch (e) { console.log('estimate failed', e.message); }
const h = await rpc('eth_sendTransaction', [{ from: CREATEUR, to: plan.tx.to, data: plan.tx.data, value: plan.tx.value, gas: '0x' + gas.toString(16) }]);
let r = null; for (let i = 0; i < 100 && !r; i++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await new Promise((o) => setTimeout(o, 100)); }
ok(r && r.status === '0x1', 'launch tx status 1 (gasUsed ' + (r && BigInt(r.gasUsed)) + ')');
const s = await slot();
const sq = BigInt('0x' + s.slice(2, 66));
ok(sq === 10000n << 96n, 'after: StateView sqrtPriceX96 = ' + sq + ' (!= 0, = registered)');
const lq = await liq();
ok(lq > 0n, 'after: liquidityGross at the position upper tick ' + plan0.p.tickHaut + ' = ' + lq + ' (active liquidity is 0 by design: block-only range below the price)');
const ml = (r.logs || []).find((x) => x.topics[0] === '0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec');
ok(!!ml && BigInt.asIntN(256, BigInt('0x' + ml.data.slice(130, 194))) === BigInt(plan.L), 'ModifyLiquidity log liquidityDelta = plan L ' + plan.L);
if (process.env.REF_INPUT) { const ref = (await import('node:fs')).readFileSync(process.env.REF_INPUT, 'utf8').trim().toLowerCase(); const a = plan.tx.data.toLowerCase(); let d = 0; for (let i = 0; i < Math.max(a.length, ref.length); i++) if (a[i] !== ref[i]) d++; console.log('calldata vs mainnet tx 0x980ae60d: same length', a.length === ref.length, 'differing hex chars', d); }
const gasPaid = BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice);
ok(await bal(H) === hookAv, 'hook ETH balance unchanged (no hook fee): ' + hookAv);
console.log('creator ETH delta (excl. gas)', String(ethAv - (await bal(CREATEUR)) - gasPaid), 'UNIT placed', String(tokAv - (await balTok(UNIT, CREATEUR))));
const replan = await L2.completerInscriptionPayee({ rpc, plan: await L.planLancement({ rpc, chaine: 8453, jeton: UNIT, compte: CREATEUR, valorisationEth: 10, partPourMille: 999, hooks: H, quoteEthWei: 0n, maintenant }), compte: CREATEUR, fraisWei: 300000000000000n, hook: H, caution: { minimum: 1n, devise: '0x0000000000000000000000000000000000000000' } });
console.log('replan after open:', replan.etat, replan.pourquoi || '', 'poolExiste', replan.poolExiste);
console.log(ko ? 'KO ' + ko + '/' + n : 'ok banc-unit-lancement-fork - ' + n + ' assertions');
process.exit(ko ? 1 : 0);