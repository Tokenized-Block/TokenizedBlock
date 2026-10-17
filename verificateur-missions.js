/* verificateur-missions.js — LE VERIFIER DE BlockMissionsV3 : ce qu il mesure avant de signer un claim. PUR + entrees injectees.
 * ⛔ NE SIGNE RIEN LUI-MEME : il rend les donnees typees EIP-712 ; la signature est faite par une cle dans un KMS/HSM, hors de ce depot.
 * ⛔ NI BRANCHE NI SERVI tant que BlockMissionsV3 n est pas deploye (drapeau de Phil) : aucune route ne l importe.
 *
 * Ce qu il prouve avant de rendre quoi que ce soit (sinon NON_MESURE / REFUSE, jamais une valeur devinee) :
 *  1. la TACHE : le recu de txHash a status 0x1, le PAYEUR (tx.from, ou le sender d une UserOperation EntryPoint — payeurDe) est le
 *     completer, et un log EMIS PAR task.target porte topic0 == task.topic0. Un evenement seul ne suffit pas : il faut la transaction.
 *  2. la DETENTION : le minimum EXACT du solde sur [fin - fenetre, fin], reconstruit a rebours depuis le solde LU a la fin et les logs
 *     Transfer EMIS PAR le jeton (from ou to == completer). ⛔ TEMOIN OBLIGATOIRE : le solde reconstruit au debut doit egaler le solde
 *     LU au bloc de debut (archive). Un jeton qui bouge un solde sans log (rebase, frais caches) casse l egalite -> NON_MESURE, on ne signe pas.
 *     Revue V3 (2026-10-17) : un echantillonnage de quelques hauteurs laissait un meme sac passer de wallet en wallet ; le minimum exact non.
 *  3. la FRAICHEUR : windowEnd = l horodatage du bloc de fin, signe ; le contrat refuse une fenetre finie depuis plus d 1 h.
 * MESURE 2026-10-17 : AAPLc (B20, code de taille 1) emet des Transfer standard (13 logs / 10 blocs, emis par le jeton, 3 topics).
 *   AMZNc et UNIT : 0 log sur les memes 10 blocs — NON CONCLUANT pour eux ; le temoin (2.) tranche par jeton et par claim. */
import { keccak256 } from './keccak.js';
import { payeurDe } from './revenu-externe.js';

const enHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const k256 = (s) => '0x' + enHex(keccak256(typeof s === 'string' ? new TextEncoder().encode(s) : s));
const hexVersOctets = (h) => { const s = String(h).replace(/^0x/, ''); const o = new Uint8Array(s.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16); return o; };
const mot = (v) => BigInt.asUintN(256, BigInt(v)).toString(16).padStart(64, '0');
const motAdr = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
export const TOPIC_TRANSFER = k256('Transfer(address,address,uint256)');

/** 1. la tache : recu, payeur = completer, log de la cible. Rend {ok:true} | {ok:false, etat, pourquoi}. */
export function verifierTache({ tx, recu, completer, target, topic0, topic1 = null }) {
  if (!tx || !recu) return { ok: false, etat: 'NON_LU', pourquoi: 'transaction or receipt not readable yet' };
  if (String(recu.status) !== '0x1') return { ok: false, etat: 'REFUSE', pourquoi: 'the transaction failed' };
  if (bas(recu.transactionHash) !== bas(tx.hash)) return { ok: false, etat: 'REFUSE', pourquoi: 'receipt of another transaction' };
  const p = payeurDe({ tx, recu });
  if (!p || p !== bas(completer)) return { ok: false, etat: 'REFUSE', pourquoi: 'this transaction was not sent by this player' };
  /* chasse 2026-10-17 soir (MED, confirme) : (cible, topic0) seuls laissaient un swap MINUSCULE sur N IMPORTE QUELLE pool remplir une mission
   *   « swap sur ce block ». topic1 (quand la mission le fixe, obligatoire sur le PoolManager) = le PREMIER topic indexe exige (le poolId). */
  const t1 = topic1 && !/^0x0{64}$/.test(bas(topic1)) ? bas(topic1) : null;
  const vu = (recu.logs || []).some((l) => bas(l.address) === bas(target) && (l.topics || []).length && bas(l.topics[0]) === bas(topic0)
    && (!t1 || bas((l.topics || [])[1]) === t1));
  if (!vu) return { ok: false, etat: 'REFUSE', pourquoi: 'the task event is not in this transaction' };
  return { ok: true };
}

/**
 * 2. le minimum EXACT sur la fenetre. transferts = logs Transfer du jeton dans ]debut, fin], from ou to == compte, triables par
 * (blockNumber, logIndex). soldeFin = balanceOf(compte) lu AU bloc de fin ; soldeDebutLu = balanceOf AU bloc de debut (temoin).
 * Rend { ok:true, minimum, soldeDebut } | { ok:false, etat:'NON_MESURE', pourquoi }.
 */
export function minimumFenetre({ jeton, compte, soldeFin, soldeDebutLu, transferts }) {
  const c = bas(compte), j = bas(jeton);
  if (!ADR.test(c) || !ADR.test(j)) return { ok: false, etat: 'NON_MESURE', pourquoi: 'bad address' };
  let fin, debutLu;
  try { fin = BigInt(soldeFin); debutLu = BigInt(soldeDebutLu); } catch (_) { return { ok: false, etat: 'NON_MESURE', pourquoi: 'balances not read' }; }
  const cle = (l) => [parseInt(l.blockNumber, 16), parseInt(l.logIndex, 16)];
  const tries = [...(transferts || [])].filter((l) => bas(l.address) === j && (l.topics || []).length === 3 && bas(l.topics[0]) === TOPIC_TRANSFER)
    .sort((a, b) => { const [x1, y1] = cle(a), [x2, y2] = cle(b); return x1 - x2 || y1 - y2; });
  const vus = new Set();
  let solde = fin, minimum = fin;
  for (let i = tries.length - 1; i >= 0; i--) { /* a rebours : solde AVANT ce transfert */
    const l = tries[i];
    const id = bas(l.transactionHash) + ':' + parseInt(l.logIndex, 16);
    if (vus.has(id)) continue; /* un log present dans les deux requetes (from == to == compte) ne compte qu une fois */
    vus.add(id);
    const de = '0x' + bas(l.topics[1]).slice(26), vers = '0x' + bas(l.topics[2]).slice(26);
    let m; try { m = BigInt(l.data); } catch (_) { return { ok: false, etat: 'NON_MESURE', pourquoi: 'unreadable transfer amount' }; }
    if (vers === c) solde -= m;
    if (de === c) solde += m;
    if (solde < 0n) return { ok: false, etat: 'NON_MESURE', pourquoi: 'reconstruction went negative: logs incomplete' };
    if (solde < minimum) minimum = solde;
  }
  if (solde !== debutLu) return { ok: false, etat: 'NON_MESURE', pourquoi: 'the balance read at the window start does not match the transfers: this token moves balances without logs' };
  return { ok: true, minimum, soldeDebut: solde };
}

/** lecture des transferts du compte sur ]deBloc, aBloc], par tranches (les noeuds plafonnent les fenetres). rpc injecte. */
export async function lireTransferts({ rpc, jeton, compte, deBloc, aBloc, tranche = 2000 }) {
  const out = [];
  for (let bas_ = deBloc + 1; bas_ <= aBloc; bas_ += tranche) {
    const haut = Math.min(aBloc, bas_ + tranche - 1);
    const f = { address: jeton, fromBlock: '0x' + bas_.toString(16), toBlock: '0x' + haut.toString(16) };
    const [de, vers] = await Promise.all([
      rpc('eth_getLogs', [{ ...f, topics: [TOPIC_TRANSFER, '0x' + motAdr(compte)] }]),
      rpc('eth_getLogs', [{ ...f, topics: [TOPIC_TRANSFER, null, '0x' + motAdr(compte)] }]),
    ]);
    if (!Array.isArray(de) || !Array.isArray(vers)) throw new Error('logs not a list'); /* une reponse qui n est pas une liste n est pas une tranche vide */
    out.push(...de, ...vers);
  }
  return out;
}

/** 3. les donnees typees EIP-712 que le KMS signe (exactement le CLAIM_TYPEHASH de BlockMissionsV3, version "3"). */
export const TYPES_CLAIM = Object.freeze({
  Claim: [
    { name: 'taskId', type: 'uint256' }, { name: 'completer', type: 'address' }, { name: 'txHash', type: 'bytes32' },
    { name: 'heldBlock', type: 'uint256' }, { name: 'heldPaired', type: 'uint256' }, { name: 'window', type: 'uint32' },
    { name: 'windowEnd', type: 'uint64' }, { name: 'deadline', type: 'uint256' },
  ],
});
export function donneesClaim({ chainId, contrat, taskId, completer, txHash, heldBlock, heldPaired, window, windowEnd, deadline }) {
  return {
    domain: { name: 'BlockMissions', version: '3', chainId: Number(chainId), verifyingContract: contrat },
    types: TYPES_CLAIM, primaryType: 'Claim',
    message: { taskId: String(taskId), completer: bas(completer), txHash: bas(txHash), heldBlock: String(heldBlock), heldPaired: String(heldPaired),
      window: Number(window), windowEnd: String(windowEnd), deadline: String(deadline) },
  };
}

/** le digest que le contrat recalcule (claimDigest) — pour verifier une signature AVANT de la rendre, et pour les tests de parite. */
export function digestClaim(d) {
  const typeDomaine = k256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
  const dom = k256(hexVersOctets(typeDomaine.slice(2) + k256('BlockMissions').slice(2) + k256('3').slice(2) + mot(d.domain.chainId) + motAdr(d.domain.verifyingContract)));
  const typeClaim = k256('Claim(uint256 taskId,address completer,bytes32 txHash,uint256 heldBlock,uint256 heldPaired,uint32 window,uint64 windowEnd,uint256 deadline)');
  const m = d.message;
  const st = k256(hexVersOctets(typeClaim.slice(2) + mot(m.taskId) + motAdr(m.completer) + bas(m.txHash).slice(2).padStart(64, '0') + mot(m.heldBlock)
    + mot(m.heldPaired) + mot(m.window) + mot(m.windowEnd) + mot(m.deadline)));
  return k256(hexVersOctets('1901' + dom.slice(2) + st.slice(2)));
}
