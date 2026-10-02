// FORK ONLY. Negative controls on the SAME fork state as proof.mjs: flag OFF (shipped tree) and base 87a49cb.
import { readFileSync } from 'node:fs';
const RPC = 'http://127.0.0.1:8581'; let id = 1;
const rpc = async (method, params = []) => { const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }) }); const j = await r.json(); if (j.error) throw new Error(j.error.message); return j.result; };
const S = JSON.parse(readFileSync('/workspace/tb-feefix-proof/h7030/proof-out.json', 'utf8')).state;
const SV = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71', PLTRc = '0xb2000000000000000000007d16372840df4dabbe';
const out = {};
for (const [v, dir] of Object.entries({ 'wired-OFF': '/workspace/tb-h7030/', 'base-87a49cb': '/workspace/tb-feefix2-rb/' })) {
  const T = await import(dir + 'tokenomics.js'), { vieDuBlock } = await import(dir + 'marche.js'), { planEchange } = await import(dir + 'echange.js');
  const r = {};
  r.hookCourantEth = String(await T.hookCourant({ rpc, mainnet: true, avecDevise: false, devise: null })).toLowerCase() === String(T.HOOK_V8).toLowerCase() ? 'HOOK_V8' : 'other';
  const mD = await vieDuBlock({ rpc, stateView: SV, jeton: S.B1 });
  r.ethDiscovery = mD.etat + (mD.cle ? ' hooks=' + mD.cle.hooks.slice(0, 6) : '');
  const mE = await vieDuBlock({ rpc, stateView: SV, jeton: S.B1, clesExactes: [S.kE] });
  const pE = await planEchange({ rpc, chaine: 8453, jeton: S.B1, compte: S.BUYER, sens: 'ACHAT', montant: 10n ** 15n, marcheLu: mE, maintenant: S.now, fraisDevisesOk: new Set() });
  r.ethBuy = pE.etat + ' routerBps=' + (pE.resume ? String(pE.resume.fraisBps) : '-') + ' (+10 hook = ' + (pE.resume ? 10 + Number(pE.resume.fraisBps) : '-') + ' bps total)';
  const mP = await vieDuBlock({ rpc, stateView: SV, jeton: S.B2, clesExactes: [S.kP] });
  const pP = await planEchange({ rpc, chaine: 8453, jeton: S.B2, compte: S.BUYER, sens: 'ACHAT', montant: 10n ** 7n, marcheLu: mP, maintenant: S.now, fraisDevisesOk: new Set([PLTRc]) });
  r.pltrBuy = pP.etat + ': ' + (pP.pourquoi || '');
  out[v] = r;
}
console.log(JSON.stringify(out, null, 1));
