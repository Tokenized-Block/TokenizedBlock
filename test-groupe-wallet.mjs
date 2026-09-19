// groupe-wallet.js : detection EIP-5792, lecture des statuts, envoi groupe, et le « block prevu ».
import assert from 'node:assert/strict';
import { peutGrouper, lireStatutGroupe, envoyerGroupe, rpcAvecBlockPrevu } from './groupe-wallet.js';
import { selecteur } from './pool.js';
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

// 1. selecteurs recopies = selecteurs calcules (un selecteur faux ferait lire la chaine au lieu du block prevu)
ok(selecteur('totalSupply()') === '18160ddd' && selecteur('decimals()') === '313ce567', 'selecteurs ERC20');
ok(selecteur('balanceOf(address)') === '70a08231' && selecteur('allowance(address,address)') === 'dd62ed3e', 'selecteurs ERC20 2');
ok(selecteur('allowance(address,address,address)') === '927da105', 'selecteur Permit2');

// 2. capacites : oui seulement si atomique annonce ; faux au moindre doute
const eth = (caps, jette = false) => ({ request: async ({ method }) => { if (jette) throw new Error('x'); if (method === 'wallet_getCapabilities') return caps; } });
ok(await peutGrouper({ eth: eth({ '0x2105': { atomic: { status: 'supported' } } }), compte: '0x1', chaineHex: '0x2105' }) === true, 'supported');
ok(await peutGrouper({ eth: eth({ '0x2105': { atomic: { status: 'ready' } } }), compte: '0x1', chaineHex: '0x2105' }) === false, 'ready = mise a niveau du compte requise -> pas de lot');
ok(await peutGrouper({ eth: eth({ '0x2105': { atomic: { status: 'unsupported' } } }), compte: '0x1', chaineHex: '0x2105' }) === false, 'unsupported');
ok(await peutGrouper({ eth: eth({ '0x1': { atomic: { status: 'supported' } } }), compte: '0x1', chaineHex: '0x2105' }) === false, 'autre chaine');
ok(await peutGrouper({ eth: eth({ '0x2105': { atomicBatch: { supported: true } } }), compte: '0x1', chaineHex: '0x2105' }) === true, 'v1 atomicBatch');
ok(await peutGrouper({ eth: eth(null, true), compte: '0x1', chaineHex: '0x2105' }) === false, 'methode inconnue');
ok(await peutGrouper({ eth: null, compte: '0x1', chaineHex: '0x2105' }) === false, 'pas de wallet');
// le cas reel de Phil : un wallet qui ne repond JAMAIS -> faux, et vite (pas de blocage)
{
  const muet = { request: () => new Promise(() => {}) };
  const t0 = performance.now();
  const r = await peutGrouper({ eth: muet, compte: '0x1', chaineHex: '0x2105', delaiMs: 200 });
  const dt = performance.now() - t0;
  ok(r === false && dt < 1000, 'wallet muet -> faux en ' + Math.round(dt) + ' ms');
}
// statut muet puis confirme : le suivi ne se fige pas sur une question sans reponse
{
  let n = 0;
  const e = { request: async ({ method }) => {
    if (method === 'wallet_sendCalls') return { id: 'x' };
    n++; if (n === 1) return new Promise(() => {}); return { status: 200, receipts: [{ status: '0x1', transactionHash: '0xok' }] };
  } };
  const r = await envoyerGroupe({ eth: e, compte: '0x1', chaineHex: '0x2105', calls: [{ to: '0x2' }], pauseMs: 1, attendreMs: 30000 });
  ok(r.etat === 'CONFIRME', 'statut muet une fois puis confirme -> ' + r.etat);
}

// 3. statuts : un recu en echec = ECHEC, jamais CONFIRME
ok(lireStatutGroupe({ status: 200, receipts: [{ status: '0x1', transactionHash: '0xa' }] }).etat === 'CONFIRME', '200 ok');
ok(lireStatutGroupe({ status: 200, receipts: [{ status: '0x1' }, { status: '0x0' }] }).etat === 'ECHEC', '200 avec un revert');
ok(lireStatutGroupe({ status: 200, receipts: [] }).etat === 'ECHEC', '200 sans recu');
ok(lireStatutGroupe({ status: 'CONFIRMED', receipts: [{ status: '0x1' }] }).etat === 'CONFIRME', 'v1 confirmed');
ok(lireStatutGroupe({ status: 100 }).etat === 'EN_COURS' && lireStatutGroupe({ status: 'PENDING' }).etat === 'EN_COURS', 'en cours');
ok(lireStatutGroupe({ status: 500 }).etat === 'ECHEC' && lireStatutGroupe({ status: 400 }).etat === 'ECHEC', '400/500');
ok(lireStatutGroupe({ status: 600 }).etat === 'PARTIEL', '600 partiel');

// 4. envoi : atomicRequired toujours vrai ; refus utilisateur = REFUSE ; suivi jusqu au verdict
let recu = null, tours = 0;
const ethEnvoi = { request: async ({ method, params }) => {
  if (method === 'wallet_sendCalls') { recu = params[0]; return { id: 'lot1' }; }
  if (method === 'wallet_getCallsStatus') { tours++; return tours < 2 ? { status: 100 } : { status: 200, receipts: [{ status: '0x1', transactionHash: '0xfin' }] }; }
} };
const r = await envoyerGroupe({ eth: ethEnvoi, compte: '0xabc', chaineHex: '0x2105', calls: [{ to: '0x1', data: '0x12' }, { to: '0x2', value: '0x5' }], pauseMs: 1 });
ok(r.etat === 'CONFIRME' && r.hash === '0xfin', 'confirme apres attente');
ok(recu.atomicRequired === true && recu.chainId === '0x2105' && recu.calls.length === 2 && recu.calls[1].data === '0x' && recu.calls[0].value === '0x0', 'lot bien forme');
const refus = await envoyerGroupe({ eth: { request: async () => { throw Object.assign(new Error('User rejected'), { code: 4001 }); } }, compte: '0x1', chaineHex: '0x2105', calls: [] });
ok(refus.etat === 'REFUSE', 'refus');
const sansId = await envoyerGroupe({ eth: { request: async () => ({}) }, compte: '0x1', chaineHex: '0x2105', calls: [] });
ok(sansId.etat === 'ECHEC', 'sans id');

// 5. block prevu : repond pour LE jeton prevu et LE compte ; le reste part a la chaine
const J = '0xb2000000000000000000001234567890abcdef12', C = '0x00000000000000000000000000000000000beefc', P2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
const vus = [];
const vrai = async (m, p) => { vus.push(m); return '0xVRAI'; };
const r2 = rpcAvecBlockPrevu(vrai, { jeton: J, compte: C, supply: 10n ** 27n, dec: 18, solde: 10n ** 27n, permit2: P2 });
const pad = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
ok(BigInt(await r2('eth_call', [{ to: J, data: '0x18160ddd' }, 'latest'])) === 10n ** 27n, 'supply');
ok(BigInt(await r2('eth_call', [{ to: J.toUpperCase().replace('0X', '0x'), data: '0x313ce567' }, 'latest'])) === 18n, 'decimales (casse)');
ok(BigInt(await r2('eth_call', [{ to: J, data: '0x70a08231' + pad(C) }, 'latest'])) === 10n ** 27n, 'solde createur');
ok(BigInt(await r2('eth_call', [{ to: J, data: '0x70a08231' + pad('0x1') }, 'latest'])) === 0n, 'solde autre = 0');
ok(BigInt(await r2('eth_call', [{ to: J, data: '0xdd62ed3e' + pad(C) + pad(P2) }, 'latest'])) === 0n, 'allowance 0');
ok(await r2('eth_call', [{ to: P2, data: '0x927da105' + pad(C) + pad(J) + pad('0x9') }, 'latest']) === '0x' + '0'.repeat(192), 'permit2 0');
ok(await r2('eth_call', [{ to: P2, data: '0x927da105' + pad(C) + pad('0x7') + pad('0x9') }, 'latest']) === '0xVRAI', 'permit2 autre jeton -> chaine');
ok(await r2('eth_call', [{ to: '0x5', data: '0x18160ddd' }, 'latest']) === '0xVRAI', 'autre contrat -> chaine');
ok(await r2('eth_blockNumber', []) === '0xVRAI', 'autre methode -> chaine');
console.log('test-groupe-wallet :', n, 'assertions OK');
