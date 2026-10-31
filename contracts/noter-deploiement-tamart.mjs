/* contracts/noter-deploiement-tamart.mjs — APRES la signature du proprietaire : inscrit `adresse` + `bloc` dans tamart-deploiement.js
 * depuis le RECU de la transaction de creation, et seulement si TOUT concorde. Rien n est signe ni envoye : lecture seule (2026-11-01).
 *   Usage : TX=<txHash> node contracts/noter-deploiement-tamart.mjs [rpcUrl=https://mainnet.base.org]
 * REFUSE (et n ecrit rien) si : la fiche n est pas prete, porte deja une adresse, ou n est plus le texte que son ecrivain produit ;
 *   la fiche ne dit plus USDC_BASE / FEE_WALLET du depot ; sha256(creation) n est plus sha256Creation ; la tx a un `to` ; son `input`
 *   n est pas OCTET POUR OCTET la `creation` ; le recu n est pas status 0x1, n a pas de contractAddress ou de bloc ; une relecture
 *   eth_call differe : PRICE() != 5 000 000, beneficiaire() != FEE_WALLET, USDC() != USDC_BASE (frais-creation.js, pas la fiche).
 * L ecriture passe par texteFicheTamart (fiche-tamart.mjs), l ecrivain du preparateur : jamais a la main.
 * `noter()` est pur ; `noterDepuisRpc()` branche un `rpc(methode, params)` injecte (faux dans le banc, fetch dans la CLI). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { selecteur } from '../keccak.js';
import { FEE_WALLET, USDC_BASE } from '../frais-creation.js';
import { texteFicheTamart } from './fiche-tamart.mjs';

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const motAdr = (hex) => (/^0x[0-9a-fA-F]{64}$/.test(String(hex || '')) ? '0x' + String(hex).slice(-40).toLowerCase() : null);
export const PRIX_ATTENDU = 5000000n;

/** pur : rend { ok:false, pourquoi } ou { ok:true, texte, adresse, bloc } */
export function noter({ fiche, texte, txHash, tx, recu, lu }) {
  const refus = (p) => ({ ok: false, pourquoi: p });
  if (!fiche || fiche.contrat !== 'TamArt' || fiche.chaine !== 8453) return refus('the record is not the TamArt record for Base');
  if (fiche.pret !== true || !/^0x[0-9a-f]+$/.test(String(fiche.creation || ''))) return refus('the record is not ready (no creation data): nothing to match');
  if (fiche.adresse !== null || fiche.bloc !== null) return refus('the record already carries an address (' + fiche.adresse + ') — nothing rewritten');
  /* CRLF : core.autocrlf=true sur Windows extrait la fiche en CRLF (index en LF) ; on compare et on ecrit en LF, comme le preparateur */
  if (texteFicheTamart(fiche) !== String(texte).replace(/\r\n/g, '\n')) return refus('the record file is not what its writer produces (hand-edited?) — nothing rewritten');
  if (bas(fiche.constructeur && fiche.constructeur.usdc) !== bas(USDC_BASE) || bas(fiche.constructeur && fiche.constructeur.beneficiaire) !== bas(FEE_WALLET)) return refus('the record constructor no longer matches USDC_BASE / FEE_WALLET in the repo');
  if (crypto.createHash('sha256').update(Buffer.from(fiche.creation.slice(2), 'hex')).digest('hex') !== fiche.sha256Creation) return refus('sha256(creation) is not the frozen sha256Creation');
  if (!/^0x[0-9a-f]{64}$/.test(bas(txHash))) return refus('no transaction hash (TX=0x… 32 bytes)');
  if (!tx || bas(tx.hash) !== bas(txHash)) return refus('the transaction ' + txHash + ' was not found');
  if (tx.to) return refus('the transaction has a `to`: it is not a contract creation');
  if (bas(tx.input) !== fiche.creation) return refus('the transaction input is not the frozen creation data, byte for byte');
  if (!ADR.test(bas(tx.from))) return refus('the transaction has no readable sender');
  if (!recu || bas(recu.transactionHash) !== bas(txHash)) return refus('the receipt of ' + txHash + ' was not found (not mined yet?)');
  if (recu.status !== '0x1') return refus('the receipt is status ' + recu.status + ', not 0x1: the deployment reverted');
  const adresse = bas(recu.contractAddress);
  if (!ADR.test(adresse) || /^0x0{40}$/.test(adresse)) return refus('the receipt has no contractAddress');
  const bloc = parseInt(recu.blockNumber, 16);
  if (!Number.isSafeInteger(bloc) || bloc <= 0) return refus('the receipt has no block number');
  if (!lu) return refus('the contract was not read on chain');
  let prix = null; try { prix = /^0x[0-9a-fA-F]{1,64}$/.test(String(lu.PRICE)) ? BigInt(lu.PRICE) : null; } catch (_) { prix = null; }
  if (prix !== PRIX_ATTENDU) return refus('PRICE() read ' + lu.PRICE + ' on chain, not 5000000');
  if (motAdr(lu.beneficiaire) !== bas(FEE_WALLET)) return refus('beneficiaire() read ' + lu.beneficiaire + ' on chain, the repo FEE_WALLET is ' + bas(FEE_WALLET));
  if (motAdr(lu.USDC) !== bas(USDC_BASE)) return refus('USDC() read ' + lu.USDC + ' on chain, the repo USDC_BASE is ' + bas(USDC_BASE));
  const nouveau = texteFicheTamart({ ...fiche, adresse, bloc, tx: bas(txHash), signataire: bas(tx.from) });
  return { ok: true, texte: nouveau, adresse, bloc, signataire: bas(tx.from) };
}

/** lit tx, recu et les trois relectures par `rpc`, puis noter() ; une lecture ratee = null = refus (jamais un succes suppose) */
export async function noterDepuisRpc({ rpc, txHash, fiche, texte }) {
  const ou = async (p) => { try { return await p; } catch (_) { return null; } };
  const tx = await ou(rpc('eth_getTransactionByHash', [txHash])), recu = await ou(rpc('eth_getTransactionReceipt', [txHash]));
  let lu = null;
  const a = recu && bas(recu.contractAddress);
  if (a && ADR.test(a)) {
    const lire = (sig) => ou(rpc('eth_call', [{ to: a, data: selecteur(sig) }, 'latest']));
    lu = { PRICE: await lire('PRICE()'), beneficiaire: await lire('beneficiaire()'), USDC: await lire('USDC()') };
  }
  return noter({ fiche, texte, txHash, tx, recu, lu });
}

/* ---------------------------------------------------------------- CLI */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const txHash = String(process.env.TX || '');
  const rpcUrl = process.argv[2] || 'https://mainnet.base.org';
  if (!/^0x[0-9a-f]{64}$/i.test(txHash)) { console.error('usage: TX=<txHash> node contracts/noter-deploiement-tamart.mjs [rpcUrl]'); process.exit(2); }
  const ICI = path.dirname(fileURLToPath(import.meta.url));
  const chemin = process.env.FICHE_CHEMIN || path.join(ICI, '..', 'tamart-deploiement.js'); /* FICHE_CHEMIN : le banc ecrit sur une COPIE */
  const { TAMART_DEPLOIEMENT: fiche } = await import(pathToFileURL(chemin).href);
  let id = 0;
  const rpc = async (method, params) => {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
    if (r.error) throw new Error(method + ': ' + JSON.stringify(r.error));
    return r.result;
  };
  const v = await noterDepuisRpc({ rpc, txHash, fiche, texte: fs.readFileSync(chemin, 'utf8') });
  /* exitCode, pas process.exit() : sous Windows, process.exit() avec les sockets keep-alive de fetch encore ouverts plante libuv
   *   (assertion UV_HANDLE_CLOSING, code 3221226505) — le refus serait juste mais le code de sortie faux */
  if (!v.ok) { console.error('REFUSED: ' + v.pourquoi); process.exitCode = 1; }
  else {
    fs.writeFileSync(chemin, v.texte);
    console.log(path.basename(chemin) + ': adresse ' + v.adresse + ', bloc ' + v.bloc + ' (deployed by ' + v.signataire + ')');
  }
}
