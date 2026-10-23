/* contracts/noter-deploiement-slots.mjs — APRES la signature du proprietaire : inscrit `adresse` + `bloc` dans slots-deploiement.js depuis
 * le RECU de la transaction de creation, et seulement si TOUT concorde. Rien n est signe ni envoye : lecture seule.
 *   Usage : node contracts/noter-deploiement-slots.mjs <txHash> [rpcUrl=https://mainnet.base.org]
 * REFUSE (et n ecrit rien) si : la fiche porte deja une adresse ; le recu n est pas status 0x1 ou n a pas de contractAddress ; l `input` de
 *   la transaction n est pas OCTET POUR OCTET la `creation` de la fiche ; `to` est present ; une relecture on-chain (USDC, DEV_WALLET,
 *   SPIN_PRICE, POT_SHARE_BPS, prizes()) differe de la fiche ou n a pas ete lue.
 * `noter()` est pur (fiche + texte + tx + recu + relectures -> nouveau texte ou refus) : teste avec des stubs ; la CLI branche le RPC. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selecteur } from '../keccak.js';

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const motAdr = (hex) => '0x' + String(hex || '').replace(/^0x/, '').slice(-40).toLowerCase();
const motU = (hex) => { const h = String(hex || '').replace(/^0x/, ''); return /^[0-9a-f]{64}$/i.test(h) ? BigInt('0x' + h).toString() : null; };
const mots16 = (hex) => { const m = String(hex || '').replace(/^0x/, '').match(/.{64}/g) || []; return m.length === 16 ? m.map((w) => BigInt('0x' + w).toString()).join(',') : null; };

/** les appels de relecture (signature -> champ de la fiche a comparer, et comment decoder) */
export const RELECTURES = Object.freeze([
  { sig: 'USDC()', champ: 'usdc', decode: motAdr },
  { sig: 'DEV_WALLET()', champ: 'devWallet', decode: motAdr },
  { sig: 'SPIN_PRICE()', champ: 'spinPrice', decode: motU },
  { sig: 'POT_SHARE_BPS()', champ: 'potShareBps', decode: motU },
  { sig: 'prizes()', champ: 'prizes', decode: mots16, attendu: (c) => c.prizes.map(String).join(',') },
]);

/** pur : rend { ok:false, pourquoi } ou { ok:true, texte, adresse, bloc } */
export function noter({ fiche, texte, tx, recu, relectures }) {
  const refus = (p) => ({ ok: false, pourquoi: p });
  if (!fiche || fiche.contrat !== 'BlockSlots' || fiche.chaine !== 8453) return refus('the record is not the BlockSlots record for Base');
  if (fiche.adresse !== null || fiche.bloc !== null) return refus('the record already carries an address (' + fiche.adresse + ') — nothing rewritten');
  if (!tx || bas(tx.input) !== bas(fiche.creation)) return refus('the transaction input is not the prepared creation data, byte for byte');
  if (tx.to) return refus('the transaction has a `to`: it is not a contract creation');
  if (!recu || recu.status !== '0x1') return refus('the receipt is not status 0x1');
  const adresse = bas(recu.contractAddress);
  if (!ADR.test(adresse)) return refus('the receipt has no contractAddress');
  const bloc = parseInt(recu.blockNumber, 16);
  if (!Number.isSafeInteger(bloc) || bloc <= 0) return refus('the receipt has no block number');
  for (const r of RELECTURES) {
    const attendu = r.attendu ? r.attendu(fiche.constructeur) : String(fiche.constructeur[r.champ]).toLowerCase(), lu = relectures && relectures[r.sig];
    if (lu === undefined || lu === null) return refus(r.sig + ' could not be read on chain');
    if (String(lu).toLowerCase() !== attendu) return refus(r.sig + ' read ' + lu + ' on chain, the record says ' + attendu);
  }
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
  if (!/^0x[0-9a-f]{64}$/i.test(String(txHash || ''))) { console.error('usage: node contracts/noter-deploiement-slots.mjs <txHash> [rpcUrl]'); process.exit(2); }
  const ICI = path.dirname(fileURLToPath(import.meta.url)), chemin = path.join(ICI, '..', 'slots-deploiement.js');
  const { SLOTS_DEPLOIEMENT: fiche } = await import('../slots-deploiement.js');
  let id = 0;
  const rpc = async (method, params) => {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
    if (r.error) throw new Error(method + ': ' + JSON.stringify(r.error));
    return r.result;
  };
  const tx = await rpc('eth_getTransactionByHash', [txHash]), recu = await rpc('eth_getTransactionReceipt', [txHash]);
  const adresse = recu && recu.contractAddress ? bas(recu.contractAddress) : null;
  const relectures = {};
  if (adresse) for (const r of RELECTURES) { try { relectures[r.sig] = r.decode(await rpc('eth_call', [{ to: adresse, data: selecteur(r.sig) }, 'latest'])); } catch (_) { relectures[r.sig] = null; } }
  const v = noter({ fiche, texte: fs.readFileSync(chemin, 'utf8'), tx, recu, relectures });
  if (!v.ok) { console.error('REFUSED: ' + v.pourquoi); process.exit(1); }
  fs.writeFileSync(chemin, v.texte);
  console.log('slots-deploiement.js: adresse ' + v.adresse + ', bloc ' + v.bloc);
}
