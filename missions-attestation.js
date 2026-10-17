/* missions-attestation.js — LE VERIFIER DE BlockMissionsV3 DE BOUT EN BOUT : lire la mission, prouver la tache, mesurer la detention EXACTE sur
 * la fenetre, puis signer (EIP-712) ce que le contrat recalculera. Entrees injectees (rpc, cle), aucun etat : testable a sec.
 * ⛔ La CLE n est jamais ecrite, loggee ni rendue : elle arrive en argument (le serveur la lit dans son environnement, pose par Phil).
 * ⛔ On ne signe RIEN si : la cle n est pas le verifier() du contrat, la tache n est pas prouvee, la reconstruction de solde ne colle pas au
 *   solde lu au debut (jeton qui bouge sans log), ou la detention est sous le minimum. Chaque refus dit pourquoi, avec les chiffres.
 * Fenetre : [windowEnd - window, windowEnd], windowEnd = horodatage du bloc de fin (2 blocs sous la tete) ; le contrat exige windowEnd <= 1 h. */
import { SEL, appel, decoderTache, decoderDetention } from './missions-lecture.js';
import { verifierTache, minimumFenetre, lireTransferts, donneesClaim, digestClaim } from './verificateur-missions.js';
import { adresseDe, signerDigest, recupererAdresse } from './signeur-secp256k1.js';
import { topic } from './keccak.js';

/* event TaskPosted(uint256 indexed taskId, address indexed blockToken, address indexed creator, address rewardToken, uint256 reward,
 *   uint32 maxDone, uint64 expiry, bytes32 poolId) — signature recalculee depuis l ABI compilee dans test-missions-attestation. */
export const TOPIC_TASK_POSTED = topic('TaskPosted(uint256,address,address,address,uint256,uint32,uint64,bytes32)');

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const mot = (a) => bas(a).slice(2).padStart(64, '0');
export const DELAI_SIGNATURE = 50 * 60; // la signature vaut 50 min apres la fin de fenetre (le contrat plafonne a 1 h)

async function solde(rpc, jeton, compte, bloc) {
  return BigInt(await rpc('eth_call', [{ to: jeton, data: '0x70a08231' + mot(compte) }, '0x' + bloc.toString(16)]));
}

/** le bloc de debut : le DERNIER bloc dont l horodatage est <= windowEnd - window. Estimation a 2 s/bloc (Base), puis recherche exacte :
 *  ⛔ 2026-10-17 (banc anvil : blocs a 1 500 s) l ancienne version supposait 2 s/bloc, partait sous le bloc 0 et pouvait rendre un bloc
 *  bien AVANT la cible. Ici : descente bornee jusqu a un bloc <= cible, montee exponentielle jusqu a un bloc > cible, puis dichotomie.
 *  Sur Base (2 s exactes) : 2 lectures. */
async function blocDebut(rpcEtat, fin, finTs, window) {
  const cible = finTs - window;
  const ts = async (b) => parseInt((await rpcEtat('eth_getBlockByNumber', ['0x' + b.toString(16), false])).timestamp, 16);
  let lo = -1, hi = fin, b = Math.max(0, fin - Math.ceil(window / 2));
  for (let k = 0; k < 40 && lo < 0; k++) {
    const t = await ts(b);
    if (t <= cible) { lo = b; break; }
    if (b === 0) throw new Error('the window starts before the first block');
    hi = b;
    b = Math.max(0, b - Math.max(1, Math.ceil((t - cible) / 2)) * (k + 1));
  }
  if (lo < 0) throw new Error('window start block not found');
  for (let pas = 1, k = 0; k < 40 && lo + pas < hi; pas *= 2, k++) {
    const b2 = lo + pas;
    if (await ts(b2) <= cible) lo = b2; else { hi = b2; break; }
  }
  for (let k = 0; k < 64 && hi - lo > 1; k++) { const mi = Math.floor((lo + hi) / 2); if (await ts(mi) <= cible) lo = mi; else hi = mi; }
  return lo;
}

async function detention(io, jeton, compte, debut, fin) {
  const [soldeFin, soldeDebutLu] = await Promise.all([solde(io.rpcEtat, jeton, compte, fin), solde(io.rpcEtat, jeton, compte, debut)]);
  const transferts = await lireTransferts({ rpc: io.rpcLogs, jeton, compte, deBloc: debut, aBloc: fin, tranche: io.tranche || 2000 });
  return minimumFenetre({ jeton, compte, soldeFin, soldeDebutLu, transferts });
}

/**
 * @param io { rpcEtat (etat historique : ARCHIVE), rpcLogs, chaineId, contrat, cle (hex), maintenant? (s) }
 * @returns { ok:true, taskId, held:{...}, signature } | { ok:false, etat:'PAS_OUVERT'|'NON_LU'|'NON_MESURE'|'REFUSE', pourquoi }
 */
export async function attester(io, { taskId, completer, txHash }) {
  const c = bas(completer), h = bas(txHash);
  if (!ADR.test(bas(io.contrat))) return { ok: false, etat: 'PAS_OUVERT', pourquoi: 'the mission board is not deployed yet' };
  if (!ADR.test(c) || !/^0x[0-9a-f]{64}$/.test(h) || !Number.isSafeInteger(taskId) || taskId < 0) return { ok: false, etat: 'REFUSE', pourquoi: 'a mission id, a wallet and a transaction hash are needed' };
  if (!io.cle) return { ok: false, etat: 'PAS_OUVERT', pourquoi: 'the mission checker key is not set on this server' };
  let signataire;
  try { signataire = bas(adresseDe(io.cle)); } catch (_) { return { ok: false, etat: 'PAS_OUVERT', pourquoi: 'the mission checker key on this server is not a valid key' }; }
  let t, hold, verifier;
  try {
    const [rt, rh, rv] = await Promise.all([
      io.rpcEtat('eth_call', [{ to: io.contrat, data: appel('tasks', taskId) }, 'latest']),
      io.rpcEtat('eth_call', [{ to: io.contrat, data: appel('holdOf', taskId) }, 'latest']),
      io.rpcEtat('eth_call', [{ to: io.contrat, data: '0x' + SEL.verifier }, 'latest']),
    ]);
    t = decoderTache(rt); hold = decoderDetention(rh); verifier = '0x' + String(rv).slice(-40).toLowerCase();
  } catch (_) { return { ok: false, etat: 'NON_LU', pourquoi: 'the mission could not be read just now' }; }
  if (!t || !hold) return { ok: false, etat: 'NON_LU', pourquoi: 'the mission could not be read' };
  if (verifier !== signataire) return { ok: false, etat: 'PAS_OUVERT', pourquoi: 'this server key is not the checker the contract trusts' };
  if (c === t.creator) return { ok: false, etat: 'REFUSE', pourquoi: 'the creator cannot complete their own mission' };
  /* 1. la tache */
  let tx = null, recu = null;
  try { [tx, recu] = await Promise.all([io.rpcEtat('eth_getTransactionByHash', [h]), io.rpcEtat('eth_getTransactionReceipt', [h])]); } catch (_) { /* dit plus bas */ }
  const preuve = verifierTache({ tx, recu, completer: c, target: t.target, topic0: t.topic0 });
  if (!preuve.ok) return preuve;
  /* 2. la fenetre */
  let fin, finTs, debut;
  try {
    fin = parseInt(await io.rpcEtat('eth_blockNumber', []), 16) - 2;
    finTs = parseInt((await io.rpcEtat('eth_getBlockByNumber', ['0x' + fin.toString(16), false])).timestamp, 16);
    debut = await blocDebut(io.rpcEtat, fin, finTs, hold.window);
  } catch (_) { return { ok: false, etat: 'NON_LU', pourquoi: 'the holding window could not be placed on the chain' }; }
  /* 2 bis. ⛔ 2026-10-17 (trouve en relisant : verifierTache ne regardait pas la DATE, et txUsed est global) : un joueur actif a des dizaines
   *   de vieilles tx qui portent l evenement demande ; chacune aurait « fait » la mission une fois, sans rien faire de neuf. L action doit
   *   (a) tomber DANS la fenetre de detention [debut, fin] et (b) venir APRES la publication de la mission : aucun TaskPosted(taskId) entre
   *   son bloc et la fin (meme bloc = refuse, l ordre n est pas tranche). (a) borne (b) a la taille de la fenetre. */
  const blocTx = parseInt(recu.blockNumber, 16);
  if (!Number.isSafeInteger(blocTx)) return { ok: false, etat: 'NON_LU', pourquoi: 'the transaction block could not be read' };
  if (blocTx > fin) return { ok: false, etat: 'NON_LU', pourquoi: 'this transaction is a few seconds too recent: send it again in a moment' };
  if (blocTx < debut) return { ok: false, etat: 'REFUSE', pourquoi: 'this action was done before your holding window started (block ' + blocTx + ' < ' + debut + '): do it again' };
  try {
    const pas = io.tranche || 2000;
    for (let de = blocTx; de <= fin; de += pas) {
      const poses = await io.rpcLogs('eth_getLogs', [{ address: io.contrat, fromBlock: '0x' + de.toString(16), toBlock: '0x' + Math.min(fin, de + pas - 1).toString(16),
        topics: [TOPIC_TASK_POSTED, '0x' + BigInt(taskId).toString(16).padStart(64, '0')] }]);
      if (!Array.isArray(poses)) throw new Error('logs not a list');
      if (poses.length) return { ok: false, etat: 'REFUSE', pourquoi: 'this action was done before the mission was posted: do it again now' };
    }
  } catch (_) { return { ok: false, etat: 'NON_MESURE', pourquoi: 'the mission start could not be checked just now' }; }
  /* 3. la detention, exacte, avec son temoin */
  let db, dp = null;
  try {
    db = await detention(io, t.blockToken, c, debut, fin);
    if (BigInt(hold.minPaired) > 0n) dp = await detention(io, t.paired, c, debut, fin);
  } catch (_) { return { ok: false, etat: 'NON_MESURE', pourquoi: 'the holding could not be measured over the whole window (an archive node is needed)' }; }
  if (!db.ok) return db;
  if (dp && !dp.ok) return dp;
  if (db.minimum < BigInt(hold.minBlock)) return { ok: false, etat: 'REFUSE', pourquoi: 'held at least ' + db.minimum + ' block units over the window; the mission asks ' + hold.minBlock };
  if (dp && dp.minimum < BigInt(hold.minPaired)) return { ok: false, etat: 'REFUSE', pourquoi: 'held at least ' + dp.minimum + ' of the paired asset over the window; the mission asks ' + hold.minPaired };
  /* 4. la signature */
  const held = { heldBlock: db.minimum.toString(), heldPaired: dp ? dp.minimum.toString() : '0', windowEnd: finTs, deadline: finTs + DELAI_SIGNATURE };
  const donnees = donneesClaim({ chainId: io.chaineId, contrat: io.contrat, taskId, completer: c, txHash: h, heldBlock: held.heldBlock, heldPaired: held.heldPaired,
    window: hold.window, windowEnd: held.windowEnd, deadline: held.deadline });
  const digest = digestClaim(donnees);
  const signature = signerDigest(io.cle, digest);
  if (bas(recupererAdresse(digest, signature)) !== verifier) return { ok: false, etat: 'NON_MESURE', pourquoi: 'the signature did not recover to the checker: nothing returned' };
  return { ok: true, taskId, held, signature, blocs: { debut, fin } };
}
