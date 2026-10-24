/* contracts/noter-deploiement-duelsv2.mjs — APRES la signature de Phil : inscrit `adresse` + `bloc` dans duels-v2-deploiement.js depuis le RECU
 * de la transaction de creation, et seulement si TOUT concorde. Rien n est signe ni envoye : lecture seule.
 *   Usage : node contracts/noter-deploiement-duelsv2.mjs <txHash> [rpcUrl=https://mainnet.base.org]
 * REFUSE (et n ecrit rien) si : la fiche n est pas la fiche BlockDuelsV2 de Base, pas prete, ou porte deja une adresse ; la transaction n est
 *   pas sur Base (chainId 0x2105, s il est donne) ou a un `to` ; le recu n est pas status 0x1 ou n a pas de contractAddress ; l `input` n est
 *   pas OCTET POUR OCTET la `creation` de la fiche ; une relecture (USDC, DEV_WALLET, REWARD_POOL, GUARDIAN) differe de la fiche ; tokenOk(USDC)
 *   n est pas vrai ; nextId() n est pas 1 ; WINNER_BPS / POOL_BPS / SETTLE_WINDOW ne sont pas 9000 / 700 / 256 ; le code deploye n a pas le
 *   selecteur de settleDefault(uint256) (un v1 deploye par erreur) ; le NOEUD lu ne repond pas eth_chainId 0x2105 ; le hash de son bloc du
 *   recu n est pas le blockHash du recu.
 * ⛔ BORNE : un anvil lance avec --chain-id 8453 repond 0x2105 et des hashes coherents avec lui-meme : ces deux gardes ne le distinguent PAS de
 *   Base. Le rpcUrl par defaut est mainnet.base.org ; en passer un autre, c est le croire.
 * `noter()` est pur (fiche + texte + tx + recu + relectures -> nouveau texte ou refus) : teste avec des stubs ; la CLI branche le RPC. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { selecteur } from '../keccak.js';

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const motAdr = (hex) => '0x' + String(hex || '').replace(/^0x/, '').slice(-40).toLowerCase();

/** les appels de relecture d adresses (selecteur -> champ de la fiche a comparer) */
export const RELECTURES = Object.freeze([
  { sig: 'USDC()', champ: 'usdc' },
  { sig: 'DEV_WALLET()', champ: 'devWallet' },
  { sig: 'REWARD_POOL()', champ: 'rewardPool' },
  { sig: 'GUARDIAN()', champ: 'guardian' },
]);
/** les constantes relues (texte decimal attendu) */
export const CONSTANTES = Object.freeze([
  { sig: 'WINNER_BPS()', attendu: '9000' },
  { sig: 'POOL_BPS()', attendu: '700' },
  { sig: 'SETTLE_WINDOW()', attendu: '256' },
]);
/** les 4 premiers octets de settleDefault(uint256), cherches dans le code deploye (le PUSH4 du dispatcher) */
export const SELECTEUR_DEFAUT = selecteur('settleDefault(uint256)').replace(/^0x/, '').toLowerCase();

/** pur : rend { ok:false, pourquoi } ou { ok:true, texte, adresse, bloc } */
export function noter({ fiche, texte, tx, recu, relectures, usdcAdmis, nextId, constantes = {}, code = null, chaineNoeud = null, hashBlocNoeud = null }) {
  const refus = (p) => ({ ok: false, pourquoi: p });
  if (!fiche || fiche.contrat !== 'BlockDuelsV2' || fiche.chaine !== 8453) return refus('the record is not the BlockDuelsV2 record for Base');
  if (fiche.pret !== true || !fiche.creation) return refus('the record is not ready (no creation data): nothing to match');
  if (fiche.adresse !== null || fiche.bloc !== null) return refus('the record already carries an address (' + fiche.adresse + ') — nothing rewritten');
  if (!tx || bas(tx.input) !== bas(fiche.creation)) return refus('the transaction input is not the prepared creation data, byte for byte');
  if (tx.to) return refus('the transaction has a `to`: it is not a contract creation');
  if (tx.chainId !== undefined && tx.chainId !== null && bas(tx.chainId) !== '0x2105') return refus('the transaction is not on Base (chainId ' + tx.chainId + ')');
  if (!recu || recu.status !== '0x1') return refus('the receipt is not status 0x1');
  const adresse = bas(recu.contractAddress);
  if (!ADR.test(adresse)) return refus('the receipt has no contractAddress');
  const bloc = parseInt(recu.blockNumber, 16);
  if (!Number.isSafeInteger(bloc) || bloc <= 0) return refus('the receipt has no block number');
  /* revue 2026-10-24 (LOW) : le chainId que la tx DECLARE ne dit rien du noeud qui l a servie. Le NOEUD lu doit etre Base (eth_chainId), et
   *   son bloc du recu doit porter le MEME hash que le recu (un recu d une branche abandonnee, ou d un autre noeud, est refuse). */
  if (chaineNoeud !== '0x2105') return refus('the node read is not Base: eth_chainId ' + chaineNoeud + ', expected 0x2105');
  const hb = bas(recu.blockHash);
  if (!/^0x[0-9a-f]{64}$/.test(hb)) return refus('the receipt has no blockHash');
  if (bas(hashBlocNoeud) !== hb) return refus('block ' + bloc + ' on the node has hash ' + hashBlocNoeud + ', the receipt says ' + hb);
  for (const r of RELECTURES) {
    const attendu = bas(fiche.constructeur[r.champ]), lu = relectures && relectures[r.sig];
    if (lu === undefined || lu === null) return refus(r.sig + ' could not be read on chain');
    if (bas(lu) !== attendu) return refus(r.sig + ' read ' + lu + ' on chain, the record says ' + attendu);
  }
  if (usdcAdmis !== true) return refus('tokenOk(USDC) is not true on chain');
  if (nextId !== '1') return refus('nextId() is ' + nextId + ', not 1 for a fresh contract');
  for (const c of CONSTANTES) if (constantes[c.sig] !== c.attendu) return refus(c.sig + ' read ' + constantes[c.sig] + ' on chain, expected ' + c.attendu);
  if (typeof code !== 'string' || !bas(code).includes('63' + SELECTEUR_DEFAUT)) return refus('the deployed code has no settleDefault(uint256): not BlockDuelsV2');
  const lignes = String(texte).split('\n');
  const iA = lignes.findIndex((l) => /^\s*adresse: null,\s*$/.test(l)), iB = lignes.findIndex((l) => /^\s*bloc: null,\s*$/.test(l));
  if (iA < 0 || iB < 0) return refus('the record text has no `adresse: null` / `bloc: null` lines to rewrite');
  /* une fiche en CRLF (checkout Windows, core.autocrlf) garde ses fins de ligne : seules ces deux lignes changent */
  const cr = (l) => (l.endsWith('\r') ? '\r' : '');
  lignes[iA] = "  adresse: '" + adresse + "'," + cr(lignes[iA]);
  lignes[iB] = '  bloc: ' + bloc + ', /* tx ' + bas(tx.hash) + ' signed by ' + bas(tx.from) + ' */' + cr(lignes[iB]);
  return { ok: true, texte: lignes.join('\n'), adresse, bloc };
}

/** les lectures on-chain de noter(), par un `rpc(method, params)` donne (CLI et banc anvil : la MEME fonction) */
export async function lireChaine(rpc, txHash, fiche) {
  let chaineNoeud = null; try { chaineNoeud = bas(await rpc('eth_chainId', [])); } catch (_) { chaineNoeud = null; }
  const tx = await rpc('eth_getTransactionByHash', [txHash]), recu = await rpc('eth_getTransactionReceipt', [txHash]);
  let hashBlocNoeud = null;
  if (recu && /^0x[0-9a-f]+$/i.test(String(recu.blockNumber || ''))) {
    try { const b = await rpc('eth_getBlockByNumber', [recu.blockNumber, false]); hashBlocNoeud = b && b.hash ? bas(b.hash) : null; } catch (_) { hashBlocNoeud = null; }
  }
  const adresse = recu && recu.contractAddress ? bas(recu.contractAddress) : null;
  const relectures = {}, constantes = {};
  let usdcAdmis = null, nextId = null, code = null;
  if (adresse) {
    const lire = async (sig, args = '') => { try { return await rpc('eth_call', [{ to: adresse, data: selecteur(sig) + args }, 'latest']); } catch (_) { return null; } };
    for (const r of RELECTURES) { const v = await lire(r.sig); relectures[r.sig] = v ? motAdr(v) : null; }
    const ok = await lire('tokenOk(address)', bas(fiche.constructeur.usdc).slice(2).padStart(64, '0'));
    usdcAdmis = ok ? BigInt(ok) === 1n : null;
    const nx = await lire('nextId()'); nextId = nx ? BigInt(nx).toString() : null;
    for (const c of CONSTANTES) { const v = await lire(c.sig); constantes[c.sig] = v ? BigInt(v).toString() : null; }
    try { code = await rpc('eth_getCode', [adresse, 'latest']); } catch (_) { code = null; }
  }
  return { tx, recu, relectures, usdcAdmis, nextId, constantes, code, chaineNoeud, hashBlocNoeud };
}

/* ---------------------------------------------------------------- CLI */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [txHash, rpcUrl = 'https://mainnet.base.org'] = process.argv.slice(2);
  if (!/^0x[0-9a-f]{64}$/i.test(String(txHash || ''))) { console.error('usage: node contracts/noter-deploiement-duelsv2.mjs <txHash> [rpcUrl]'); process.exit(2); }
  const ICI = path.dirname(fileURLToPath(import.meta.url)), chemin = process.env.FICHE || path.join(ICI, '..', 'duels-v2-deploiement.js');
  const { DUELS_V2_DEPLOIEMENT: fiche } = await import(new URL('file:///' + chemin.replace(/\\/g, '/')).href);
  let id = 0;
  const rpc = async (method, params) => {
    const r = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) }).then((x) => x.json());
    if (r.error) throw new Error(method + ': ' + JSON.stringify(r.error));
    return r.result;
  };
  const lu = await lireChaine(rpc, txHash, fiche);
  const v = noter({ fiche, texte: fs.readFileSync(chemin, 'utf8'), ...lu });
  if (!v.ok) { console.error('REFUSED: ' + v.pourquoi); process.exit(1); }
  fs.writeFileSync(chemin, v.texte);
  console.log(path.basename(chemin) + ': adresse ' + v.adresse + ', bloc ' + v.bloc);
}
