/* contracts/noter-deploiement-ticketpot.mjs — APRES la signature de Phil : inscrit `adresse` + `bloc` dans ticketpot-deploiement.js depuis le
 * RECU de la transaction de creation, et seulement si TOUT concorde. Rien n est signe ni envoye : lecture seule.
 *   Usage : node contracts/noter-deploiement-ticketpot.mjs <txHash> [rpcUrl=https://mainnet.base.org]
 * REFUSE (et n ecrit rien) si : la fiche n est pas prete ou porte deja une adresse ; le recu n est pas status 0x1 ou n a pas de
 *   contractAddress ; l `input` de la transaction n est pas OCTET POUR OCTET la `creation` de la fiche ; une relecture on-chain (USDC,
 *   verifier, guardian) differe de la fiche ; owner() n est pas le signataire (tx.from) ; domainSeparator() n est pas celui que le serveur
 *   signe (ticketpot-plan.js domaineSeparateur) ; totalPots() n est pas 0.
 * `noter()` est pur (fiche + texte + tx + recu + relectures -> nouveau texte ou refus) : teste avec des stubs ; la CLI branche le RPC. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selecteur } from '../keccak.js';
import { domaineSeparateur } from '../ticketpot-plan.js';

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const motAdr = (hex) => '0x' + String(hex || '').replace(/^0x/, '').slice(-40).toLowerCase();

/** les appels de relecture (selecteur -> champ de la fiche a comparer) */
export const RELECTURES = Object.freeze([
  { sig: 'USDC()', champ: 'usdc' },
  { sig: 'verifier()', champ: 'verifier' },
  { sig: 'guardian()', champ: 'guardian' },
]);

/** pur : rend { ok:false, pourquoi } ou { ok:true, texte, adresse, bloc } */
export function noter({ fiche, texte, tx, recu, relectures, owner, domaine, totalPots }) {
  const refus = (p) => ({ ok: false, pourquoi: p });
  if (!fiche || fiche.contrat !== 'TicketPot' || fiche.chaine !== 8453) return refus('the record is not the TicketPot record for Base');
  if (fiche.pret !== true || !fiche.creation) return refus('the record is not ready (no creation data): nothing to match');
  if (fiche.adresse !== null || fiche.bloc !== null) return refus('the record already carries an address (' + fiche.adresse + ') — nothing rewritten');
  if (!tx || bas(tx.input) !== bas(fiche.creation)) return refus('the transaction input is not the prepared creation data, byte for byte');
  if (tx.to) return refus('the transaction has a `to`: it is not a contract creation');
  if (!recu || recu.status !== '0x1') return refus('the receipt is not status 0x1');
  const adresse = bas(recu.contractAddress);
  if (!ADR.test(adresse)) return refus('the receipt has no contractAddress');
  const bloc = parseInt(recu.blockNumber, 16);
  if (!Number.isSafeInteger(bloc) || bloc <= 0) return refus('the receipt has no block number');
  for (const r of RELECTURES) {
    const attendu = bas(fiche.constructeur[r.champ]), lu = relectures[r.sig];
    if (lu === undefined || lu === null) return refus(r.sig + ' could not be read on chain');
    if (bas(lu) !== attendu) return refus(r.sig + ' read ' + lu + ' on chain, the record says ' + attendu);
  }
  if (!ADR.test(bas(owner)) || bas(owner) !== bas(tx.from)) return refus('owner() is ' + owner + ', not the signer ' + bas(tx.from));
  if (bas(domaine) !== domaineSeparateur(fiche.chaine, adresse)) return refus('domainSeparator() is not the EIP-712 domain the server signs for this address');
  if (totalPots !== '0') return refus('totalPots() is ' + totalPots + ', not 0 for a fresh contract');
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
  if (!/^0x[0-9a-f]{64}$/i.test(String(txHash || ''))) { console.error('usage: node contracts/noter-deploiement-ticketpot.mjs <txHash> [rpcUrl]'); process.exit(2); }
  const ICI = path.dirname(fileURLToPath(import.meta.url)), chemin = path.join(ICI, '..', 'ticketpot-deploiement.js');
  const { TICKETPOT_DEPLOIEMENT: fiche } = await import('../ticketpot-deploiement.js');
  let id = 0;
  const rpc = async (method, params) => {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
    if (r.error) throw new Error(method + ': ' + JSON.stringify(r.error));
    return r.result;
  };
  const tx = await rpc('eth_getTransactionByHash', [txHash]), recu = await rpc('eth_getTransactionReceipt', [txHash]);
  const adresse = recu && recu.contractAddress ? bas(recu.contractAddress) : null;
  const relectures = {};
  let owner = null, domaine = null, totalPots = null;
  if (adresse) {
    const lire = async (sig) => { try { return await rpc('eth_call', [{ to: adresse, data: selecteur(sig) }, 'latest']); } catch (_) { return null; } };
    for (const r of RELECTURES) { const v = await lire(r.sig); relectures[r.sig] = v ? motAdr(v) : null; }
    const o = await lire('owner()'); owner = o ? motAdr(o) : null;
    domaine = bas(await lire('domainSeparator()'));
    const t = await lire('totalPots()'); totalPots = t ? BigInt(t).toString() : null;
  }
  const v = noter({ fiche, texte: fs.readFileSync(chemin, 'utf8'), tx, recu, relectures, owner, domaine, totalPots });
  if (!v.ok) { console.error('REFUSED: ' + v.pourquoi); process.exit(1); }
  fs.writeFileSync(chemin, v.texte);
  console.log('ticketpot-deploiement.js: adresse ' + v.adresse + ', bloc ' + v.bloc + ' (owner ' + owner + ')');
}
