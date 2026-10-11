// approbations-exactes.js - LES DEUX AUTORISATIONS PERMIT2 D UN ECHANGE, AU MONTANT EXACT ET AVEC UNE EXPIRATION.
// Decision de Phil (chat, 2026-10-11) : « montant exact partout ». Test reel de Grok le meme matin (USDC -> IB022, chemin v4) : le
//   wallet a signe une approbation USDC -> Permit2 ILLIMITEE (MAX_UINT256) puis Permit2 -> routeur ILLIMITEE et SANS expiration
//   (MAX_UINT160, MAX_UINT48), et la carte ne le disait pas. Le chemin Aerodrome refusait deja l illimite (calldata-aerodrome.js).
// ⛔ Ici : jeton -> Permit2 = le montant de CET echange ; Permit2 -> routeur = le meme montant, valable DUREE_PERMIT2_S. Un montant nul,
//   negatif ou au-dela de uint160 est REFUSE (jamais « arrondi » a l illimite). Le prix : les autorisations se consomment a chaque
//   echange, donc jusqu a deux signatures de plus par echange v4 - c est le choix de Phil.
import { encodeApprove, encodePermit2Approve } from './pool.js';

export const DUREE_PERMIT2_S = 3600n;
const MAX_UINT160 = (1n << 160n) - 1n;
const ADR = /^0x[0-9a-fA-F]{40}$/;

/**
 * jeton, permit2, routeur : adresses entieres ; montant : unites brutes (bigint) ; maintenantSec : l instant (secondes) ;
 * okP2 / okR : les autorisations EXISTANTES suffisent deja (lues par l appelant) ; libelleJeton : ce que la personne lit.
 * Rend { etat: 'OK', etapes: [...] } (0, 1 ou 2 etapes) ou { etat: 'REFUSE', pourquoi }.
 */
export function etapesPermit2Exactes({ jeton, permit2, routeur, montant, maintenantSec, okP2 = false, okR = false, libelleJeton = 'this token' }) {
  if (![jeton, permit2, routeur].every((a) => ADR.test(String(a || '')))) return { etat: 'REFUSE', pourquoi: 'whole addresses are required for an approval' };
  let m;
  try { m = BigInt(montant); } catch (_) { return { etat: 'REFUSE', pourquoi: 'the approved amount must be raw integer units' }; }
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'nothing to approve: the amount is zero' };
  if (m > MAX_UINT160) return { etat: 'REFUSE', pourquoi: 'an unlimited approval is refused — the amount exceeds what Permit2 can hold' };
  let t;
  try { t = BigInt(maintenantSec); } catch (_) { return { etat: 'REFUSE', pourquoi: 'a reference instant is required to set the approval expiry' }; }
  if (t <= 0n) return { etat: 'REFUSE', pourquoi: 'a reference instant is required to set the approval expiry' };
  const etapes = [];
  if (!okP2) etapes.push({ nom: 'Allow Permit2 to move exactly this amount of ' + libelleJeton, to: jeton, data: encodeApprove(permit2, m), value: '0x0' });
  if (!okR) etapes.push({ nom: 'Allow the Uniswap router to take exactly this amount (through Permit2, for 1 hour)', to: permit2,
    data: encodePermit2Approve(jeton, routeur, m, t + DUREE_PERMIT2_S), value: '0x0' });
  return { etat: 'OK', etapes };
}
