// SMOKE : les modules de l app, sur un fork Base : creer un block -> le mettre en vie -> l acheter via notre Buy -> frais.
const A = 'file:///D:/Users/VolKov/veilleIA/tblock-app/';
const { paramsAsset, encodeUpdateContractURI, encodeUpdateSupplyCap, encodeBatchMint, encodeCreateB20, adresseAttendue } = await import(A + 'encodeur.js');
const { FACTORY } = await import(A + 'index-blocks.js');
const { SUPPLY_FIXE, DECIMALES_FIXES, HOOK_PREVU, repartitionFrappe, hookDeploye } = await import(A + 'tokenomics.js');
const { planLancement } = await import(A + 'lancer-pool.js');
const { completerInscriptionHook } = await import(A + 'lancer-pool-v2.js');
const { planEchange } = await import(A + 'echange.js');
const { FEE_WALLET } = await import(A + 'frais-creation.js');
const R = 'http://127.0.0.1:8546'; let id = 0;
const rpc = async (m, p) => { const j = await (await fetch(R, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method: m, params: p }) })).json(); if (j.error) throw new Error(j.error.message + (j.error.data ? ' ' + JSON.stringify(j.error.data).slice(0, 200) : '')); return j.result; };
const envoyer = async (from, tx) => {
  const h = await rpc('eth_sendTransaction', [{ from, to: tx.to, data: tx.data || '0x', value: tx.value || '0x0', gas: '0x7a1200' }]);
  let rc = null; for (let i = 0; i < 80 && !rc; i++) { await new Promise(r => setTimeout(r, 1500)); rc = await rpc('eth_getTransactionReceipt', [h]); }
  return rc;
};
const bal = async (a) => BigInt(await rpc('eth_getBalance', [a, 'latest']));
const creator = '0x3333333333333333333333333333333333330003', buyer = '0x4444444444444444444444444444444444440004';
for (const a of [creator, buyer]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x' + (10n ** 19n).toString(16)]); }
// 1. CREATE (chemin gratuit de la factory, identique a calldataCreation pratique)
const rep = repartitionFrappe(SUPPLY_FIXE, creator);
const data = '0x' + encodeCreateB20({ variant: 0, saltTexte: 'smoke-' + Date.now(), params: paramsAsset({ nom: 'Smoke Block', symbole: 'SMK', admin: creator, decimales: DECIMALES_FIXES }),
  initCalls: [encodeUpdateContractURI('data:application/json,{"name":"Smoke Block"}'), encodeUpdateSupplyCap(SUPPLY_FIXE), encodeBatchMint(rep.destinataires, rep.montants)] }).replace(/^0x/, '');
const jeton = await adresseAttendue(rpc, creator, data);
const rc1 = await envoyer(creator, { to: FACTORY, data });
console.log('1 CREATE status', rc1.status, 'token', jeton, 'gas', parseInt(rc1.gasUsed, 16));
// 2. BRING TO LIFE (plan de l app, hook si deploye)
const etatHook = await hookDeploye({ rpc });
let plan = await planLancement({ rpc, chaine: 8453, jeton, compte: creator, valorisationEth: 10, partPourMille: 999, ...(etatHook === 'DEPLOYE' ? { hooks: HOOK_PREVU } : {}) });
if (etatHook === 'DEPLOYE') plan = await completerInscriptionHook({ rpc, plan, compte: creator });
console.log('2 PLAN', plan.etat, plan.pourquoi || '', 'hook', etatHook, 'etapes', (plan.etapes || []).length);
if (!plan.tx) process.exit(1);
for (const tx of [...(plan.etapes || []), plan.tx]) { const rc = await envoyer(creator, tx); console.log('   tx', rc.status, 'gas', parseInt(rc.gasUsed, 16)); if (rc.status !== '0x1') process.exit(1); }
// 3. BUY via notre Buy (0.01 ETH)
const f0 = await bal(FEE_WALLET);
const p = await planEchange({ rpc, chaine: 8453, jeton, compte: buyer, sens: 'ACHAT', montant: 10n ** 16n });
console.log('3 BUY PLAN', p.etat, p.pourquoi || '', JSON.stringify(p.resume, (k,v)=>typeof v==='bigint'?v.toString():v)); const b0 = await bal(buyer);
if (p.etat === 'PRET') {
  for (const tx of [...(p.etapes || []), p.tx]) { const rc = await envoyer(buyer, tx); console.log('   tx', rc.status, rc.transactionHash); globalThis.lastTx = rc.transactionHash; }
  const tokens = BigInt(await rpc('eth_call', [{ to: jeton, data: '0x70a08231' + buyer.slice(2).padStart(64, '0') }, 'latest']));
  console.log('   fee wallet +wei', (await bal(FEE_WALLET)) - f0, '(expected 0.5% of 0.01 ETH = 50000000000000)', 'buyer tokens', tokens, 'buyer eth delta', (await bal(buyer)) - b0);
}
