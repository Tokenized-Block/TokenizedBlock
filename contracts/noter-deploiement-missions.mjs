/* contracts/noter-deploiement-missions.mjs — APRES les signatures de Phil : inscrit `factory` + `adresse` (BlockMissionsV3) dans
 * missions-deploiement.js depuis le RECU de la creation de MissionsDeployer, et seulement si TOUT concorde. Lecture seule.
 *   Usage : node contracts/noter-deploiement-missions.mjs <txHash> [rpcUrl=https://mainnet.base.org]
 * REFUSE (et n ecrit rien) si : la fiche n est pas prete (adresses de Phil manquantes) ou porte deja une adresse ; le recu n est pas 0x1 ou
 *   sans contractAddress ; l `input` de la tx n est pas OCTET POUR OCTET la `creation` ; factory.missions() / factory.rail() illisibles ;
 *   V3.RAIL() != rail ou rail.MISSIONS() != V3 (les deux ne se nomment pas) ; un immuable de V3 (HOOK, POOL_MANAGER, DEV_WALLET,
 *   COMMUNITY_RESERVE, USDC, verifier, guardian) differe de la fiche. `noter()` est pur ; la CLI branche le RPC. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selecteur } from '../keccak.js';

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const motAdr = (hex) => { const h = String(hex || '').replace(/^0x/, ''); return /^[0-9a-f]{64}$/i.test(h) ? '0x' + h.slice(-40).toLowerCase() : null; };

/** les immuables de V3 relus et compares a la fiche (champ -> signature) */
export const IMMUABLES_V3 = Object.freeze({ hook: 'HOOK()', poolManager: 'POOL_MANAGER()', devWallet: 'DEV_WALLET()', communityReserve: 'COMMUNITY_RESERVE()', usdc: 'USDC()', verifier: 'verifier()', guardian: 'guardian()' });

/** pur : { ok:false, pourquoi } ou { ok:true, texte, factory, adresse, rail, bloc } */
export function noter({ fiche, texte, tx, recu, lectures }) {
  const refus = (p) => ({ ok: false, pourquoi: p });
  if (!fiche || fiche.contrat !== 'MissionsDeployer' || fiche.chaine !== 8453) return refus('the record is not the MissionsDeployer record for Base');
  if (fiche.pret !== true || !/^0x[0-9a-f]+$/i.test(String(fiche.creation || ''))) return refus('the record is not ready (missing: ' + (fiche.manquants || []).join(', ') + ') — nothing could have been signed from it');
  if (fiche.factory !== null || fiche.adresse !== null) return refus('the record already carries an address (' + fiche.adresse + ') — nothing rewritten');
  if (!tx || bas(tx.input) !== bas(fiche.creation)) return refus('the transaction input is not the prepared creation data, byte for byte');
  if (tx.to) return refus('the transaction has a `to`: it is not a contract creation');
  if (!recu || recu.status !== '0x1') return refus('the receipt is not status 0x1');
  const factory = bas(recu.contractAddress);
  if (!ADR.test(factory)) return refus('the receipt has no contractAddress');
  const bloc = parseInt(recu.blockNumber, 16);
  if (!Number.isSafeInteger(bloc) || bloc <= 0) return refus('the receipt has no block number');
  const L = lectures || {};
  const adresse = bas(L.missions), rail = bas(L.rail);
  if (!ADR.test(adresse) || /^0x0{40}$/.test(adresse)) return refus('factory.missions() is zero or unreadable');
  if (!ADR.test(rail) || /^0x0{40}$/.test(rail)) return refus('factory.rail() is zero or unreadable');
  if (bas(L.v3Rail) !== rail) return refus('BlockMissionsV3.RAIL() (' + L.v3Rail + ') is not the factory\'s rail (' + rail + ')');
  if (bas(L.railMissions) !== adresse) return refus('rail.MISSIONS() (' + L.railMissions + ') is not the factory\'s missions (' + adresse + ')');
  for (const [champ, sig] of Object.entries(IMMUABLES_V3)) {
    const attendu = bas(fiche.constructeur[champ]), lu = bas((L.v3 || {})[sig]);
    if (!ADR.test(lu)) return refus(sig + ' could not be read on chain');
    if (lu !== attendu) return refus(sig + ' read ' + lu + ' on chain, the record says ' + attendu);
  }
  const lignes = String(texte).split('\n');
  const iF = lignes.findIndex((l) => /^\s*factory: null,\s*$/.test(l)), iA = lignes.findIndex((l) => /^\s*adresse: null,\s*$/.test(l));
  if (iF < 0 || iA < 0) return refus('the record text has no `factory: null` / `adresse: null` lines to rewrite');
  lignes[iF] = "  factory: '" + factory + "', /* block " + bloc + ', tx ' + bas(tx.hash) + ' signed by ' + bas(tx.from) + ' ; rail ' + rail + ' */';
  lignes[iA] = "  adresse: '" + adresse + "',";
  return { ok: true, texte: lignes.join('\n'), factory, adresse, rail, bloc };
}

/* ---------------------------------------------------------------- CLI */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [txHash, rpcUrl = 'https://mainnet.base.org'] = process.argv.slice(2);
  if (!/^0x[0-9a-f]{64}$/i.test(String(txHash || ''))) { console.error('usage: node contracts/noter-deploiement-missions.mjs <txHash> [rpcUrl]'); process.exit(2); }
  const ICI = path.dirname(fileURLToPath(import.meta.url)), chemin = path.join(ICI, '..', 'missions-deploiement.js');
  const { MISSIONS_DEPLOIEMENT: fiche } = await import('../missions-deploiement.js');
  let id = 0;
  const rpc = async (method, params) => {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
    if (r.error) throw new Error(method + ': ' + JSON.stringify(r.error));
    return r.result;
  };
  const lire = async (to, sig) => { try { return motAdr(await rpc('eth_call', [{ to, data: selecteur(sig) }, 'latest'])); } catch (_) { return null; } };
  const tx = await rpc('eth_getTransactionByHash', [txHash]), recu = await rpc('eth_getTransactionReceipt', [txHash]);
  const lectures = {};
  if (recu && recu.contractAddress) {
    const fac = bas(recu.contractAddress);
    lectures.missions = await lire(fac, 'missions()'); lectures.rail = await lire(fac, 'rail()');
    if (lectures.missions) { lectures.v3Rail = await lire(lectures.missions, 'RAIL()'); lectures.v3 = {}; for (const sig of Object.values(IMMUABLES_V3)) lectures.v3[sig] = await lire(lectures.missions, sig); }
    if (lectures.rail) lectures.railMissions = await lire(lectures.rail, 'MISSIONS()');
  }
  const v = noter({ fiche, texte: fs.readFileSync(chemin, 'utf8'), tx, recu, lectures });
  if (!v.ok) { console.error('REFUSED: ' + v.pourquoi); process.exit(1); }
  fs.writeFileSync(chemin, v.texte);
  console.log('missions-deploiement.js: factory ' + v.factory + ', missions ' + v.adresse + ', rail ' + v.rail + ', block ' + v.bloc);
}
