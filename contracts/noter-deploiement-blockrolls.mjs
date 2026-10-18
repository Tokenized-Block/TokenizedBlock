/* contracts/noter-deploiement-blockrolls.mjs — APRES la signature de Phil : inscrit `adresse` + `bloc` dans blockrolls-deploiement.js depuis le
 * RECU de la transaction de creation, et seulement si TOUT concorde. Rien n est signe ni envoye : lecture seule.
 *   Usage : node contracts/noter-deploiement-blockrolls.mjs <txHash> [rpcUrl=https://mainnet.base.org]
 * REFUSE (et n ecrit rien) si : la fiche porte deja une adresse ; le recu n est pas status 0x1 ou n a pas de contractAddress ; l `input` de la
 *   transaction n est pas OCTET POUR OCTET la `creation` de la fiche (la donnee signee n est pas celle preparee) ; une relecture on-chain
 *   (USDC, DEV_WALLET, HOOK, UNIT_POOL_ID, ROLL_PRICE, PASS_PRICE) differe de la fiche ; unitCreator() est nul.
 * `noter()` est pur (fiche + texte + tx + recu + relectures -> nouveau texte ou refus) : teste avec des stubs ; la CLI branche le RPC. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selecteur } from '../keccak.js';

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const motAdr = (hex) => '0x' + String(hex || '').replace(/^0x/, '').slice(-40).toLowerCase();
const motU = (hex) => { const h = String(hex || '').replace(/^0x/, ''); return /^[0-9a-f]{64}$/i.test(h) ? BigInt('0x' + h).toString() : null; };

/** les appels de relecture (selecteur -> champ de la fiche a comparer, et comment decoder) */
export const RELECTURES = Object.freeze([
  { sig: 'USDC()', champ: 'usdc', decode: motAdr },
  { sig: 'DEV_WALLET()', champ: 'devWallet', decode: motAdr },
  { sig: 'HOOK()', champ: 'hook', decode: motAdr },
  { sig: 'UNIT_POOL_ID()', champ: 'unitPoolId', decode: (h) => bas(h) },
  { sig: 'ROLL_PRICE()', champ: 'rollPrice', decode: motU },
  { sig: 'PASS_PRICE()', champ: 'passPrice', decode: motU },
]);

/** pur : rend { ok, pourquoi } ou { ok:true, texte, adresse, bloc } */
export function noter({ fiche, texte, tx, recu, relectures, createur }) {
  const refus = (p) => ({ ok: false, pourquoi: p });
  if (!fiche || fiche.contrat !== 'BlockRolls' || fiche.chaine !== 8453) return refus('the record is not the BlockRolls record for Base');
  if (fiche.adresse !== null || fiche.bloc !== null) return refus('the record already carries an address (' + fiche.adresse + ') — nothing rewritten');
  if (!tx || bas(tx.input) !== bas(fiche.creation)) return refus('the transaction input is not the prepared creation data, byte for byte');
  if (tx.to) return refus('the transaction has a `to`: it is not a contract creation');
  if (!recu || recu.status !== '0x1') return refus('the receipt is not status 0x1');
  const adresse = bas(recu.contractAddress);
  if (!ADR.test(adresse)) return refus('the receipt has no contractAddress');
  const bloc = parseInt(recu.blockNumber, 16);
  if (!Number.isSafeInteger(bloc) || bloc <= 0) return refus('the receipt has no block number');
  for (const r of RELECTURES) {
    const attendu = String(fiche.constructeur[r.champ]).toLowerCase(), lu = relectures[r.sig];
    if (lu === undefined || lu === null) return refus(r.sig + ' could not be read on chain');
    if (String(lu).toLowerCase() !== attendu) return refus(r.sig + ' read ' + lu + ' on chain, the record says ' + attendu);
  }
  if (!ADR.test(bas(createur)) || /^0x0{40}$/.test(bas(createur))) return refus('unitCreator() is zero or unreadable: the hook does not name a creator for UNIT');
  const lignes = String(texte).split('\n');
  const iA = lignes.findIndex((l) => /^\s*adresse: null,\s*$/.test(l)), iB = lignes.findIndex((l) => /^\s*bloc: null,\s*$/.test(l));
  if (iA < 0 || iB < 0) return refus('the record text has no `adresse: null` / `bloc: null` lines to rewrite');
  lignes[iA] = "  adresse: '" + adresse + "',";
  lignes[iB] = '  bloc: ' + bloc + ', /* tx ' + bas(tx.hash) + ' signed by ' + bas(tx.from) + ' */';
  return { ok: true, texte: lignes.join('\n'), adresse, bloc };
}

/* ---------------------------------------------------------------- CLI */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [txHash, rpcUrl = 'https://mainnet.base.org'] = process.argv.slice(2);
  if (!/^0x[0-9a-f]{64}$/i.test(String(txHash || ''))) { console.error('usage: node contracts/noter-deploiement-blockrolls.mjs <txHash> [rpcUrl]'); process.exit(2); }
  const ICI = path.dirname(fileURLToPath(import.meta.url)), chemin = path.join(ICI, '..', 'blockrolls-deploiement.js');
  const { BLOCKROLLS_DEPLOIEMENT: fiche } = await import('../blockrolls-deploiement.js');
  let id = 0;
  const rpc = async (method, params) => {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
    if (r.error) throw new Error(method + ': ' + JSON.stringify(r.error));
    return r.result;
  };
  const tx = await rpc('eth_getTransactionByHash', [txHash]), recu = await rpc('eth_getTransactionReceipt', [txHash]);
  const adresse = recu && recu.contractAddress ? bas(recu.contractAddress) : null;
  const relectures = {};
  let createur = null;
  if (adresse) {
    for (const r of RELECTURES) { try { relectures[r.sig] = r.decode(await rpc('eth_call', [{ to: adresse, data: selecteur(r.sig) }, 'latest'])); } catch (_) { relectures[r.sig] = null; } }
    try { createur = motAdr(await rpc('eth_call', [{ to: adresse, data: selecteur('unitCreator()') }, 'latest'])); } catch (_) { createur = null; }
  }
  const v = noter({ fiche, texte: fs.readFileSync(chemin, 'utf8'), tx, recu, relectures, createur });
  if (!v.ok) { console.error('REFUSED: ' + v.pourquoi); process.exit(1); }
  fs.writeFileSync(chemin, v.texte);
  console.log('blockrolls-deploiement.js: adresse ' + v.adresse + ', bloc ' + v.bloc + ' (creator ' + createur + ')');
}
