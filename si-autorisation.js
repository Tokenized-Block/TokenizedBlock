/* si-autorisation.js — MODE S.I : UNE signature de la personne, une autorisation PLAFONNEE SUR LA CHAINE (Permit2), puis l execution
 *   cote serveur sans confirmation par trade. ⛔ DERRIERE UN DRAPEAU OFF (SI_AUTORISATION=1 cote serveur pour l allumer ; rien
 *   ne l allume par defaut). Design : DESIGN-SI-AUTORISATION-20261010.md.
 * ⛔ CE MODULE NE SIGNE RIEN ET N ENVOIE RIEN : il construit le message EIP-712 que le WALLET DE LA PERSONNE signera, et il juge si
 *   un trade propose tient dans l autorisation. L execution vivra dans un module serveur SEPARE (le wallet serveur du block, CDP),
 *   jamais dans un module du cerveau (test-cerveau-ne-signe-pas).
 * ⛔ LIMITES DURES : SPOT seulement (un swap sur nos rails, sortie rendue a la personne), aucun levier, aucun emprunt ; plafond =
 *   budget, expiration <= 24 h, toutes deux POSEES SUR LA CHAINE par Permit2 (amount uint160, expiration uint48) ; revocable a tout
 *   moment par la personne (Permit2.lockdown ou approve(token, spender, 0, 0)).
 * ⛔ ETH natif ne passe pas par Permit2 : l ETH du budget est d abord enveloppe en WETH (une transaction de la personne). */
import { PERMIT2 } from './lancer-pool.js';

export const SI_AUTORISATION_ACTIVE = typeof process !== 'undefined' && process.env && process.env.SI_AUTORISATION === '1';
export const DUREE_MAX_S = 24 * 3600;
export const TYPES_PERMIT_SINGLE = Object.freeze({
  PermitDetails: [{ name: 'token', type: 'address' }, { name: 'amount', type: 'uint160' }, { name: 'expiration', type: 'uint48' }, { name: 'nonce', type: 'uint48' }],
  PermitSingle: [{ name: 'details', type: 'PermitDetails' }, { name: 'spender', type: 'address' }, { name: 'sigDeadline', type: 'uint256' }],
});
const ADR = /^0x[0-9a-fA-F]{40}$/;
const MAX160 = (1n << 160n) - 1n;

/** Le message a faire signer (eth_signTypedData_v4 par le wallet de la personne). Rend { etat:'PRET', typedData } ou un REFUS nomme. */
export function messageAutorisation({ chaine = 8453, jeton, budget, parTrade, dureeS, executeur, nonce, maintenantS }) {
  if (!SI_AUTORISATION_ACTIVE) return { etat: 'REFUSE', pourquoi: 'S.I authorization is off' };
  if (!ADR.test(String(jeton || '')) || /^0x0{40}$/i.test(String(jeton))) return { etat: 'REFUSE', pourquoi: 'the budget must be an ERC-20 (wrap ETH first)' };
  if (!ADR.test(String(executeur || ''))) return { etat: 'REFUSE', pourquoi: 'the executor address is required' };
  let b, t; try { b = BigInt(budget); t = BigInt(parTrade); } catch (_) { return { etat: 'REFUSE', pourquoi: 'amounts must be integers in raw units' }; }
  if (!(b > 0n) || b > MAX160) return { etat: 'REFUSE', pourquoi: 'the budget must be positive and fit uint160' };
  if (!(t > 0n) || t > b) return { etat: 'REFUSE', pourquoi: 'the per-trade amount must be positive and at most the budget' };
  const d = Number(dureeS);
  if (!Number.isInteger(d) || d <= 0 || d > DUREE_MAX_S) return { etat: 'REFUSE', pourquoi: 'the duration must be 1 s to 24 h' };
  const now = Number(maintenantS);
  if (!Number.isInteger(now) || now <= 0) return { etat: 'REFUSE', pourquoi: 'the current time is required' };
  if (!Number.isInteger(Number(nonce)) || Number(nonce) < 0) return { etat: 'REFUSE', pourquoi: 'the Permit2 nonce must be READ on chain first' };
  return { etat: 'PRET', parTrade: t.toString(), typedData: {
    domain: { name: 'Permit2', chainId: chaine, verifyingContract: PERMIT2 },
    types: TYPES_PERMIT_SINGLE, primaryType: 'PermitSingle',
    message: { details: { token: jeton, amount: b.toString(), expiration: String(now + d), nonce: String(nonce) }, spender: executeur, sigDeadline: String(now + 1800) },
  } };
}

/** Un trade propose tient-il dans l autorisation ? SPOT seulement : rien d autre qu un swap de `jeton` dont la sortie revient a `compte`. */
export function tradeAdmis({ autorisation, depense, maintenantS, trade }) {
  if (!SI_AUTORISATION_ACTIVE) return { ok: false, pourquoi: 'S.I authorization is off' };
  const m = autorisation && autorisation.typedData && autorisation.typedData.message;
  if (!m) return { ok: false, pourquoi: 'no authorization' };
  if (!trade || trade.type !== 'swap') return { ok: false, pourquoi: 'spot swaps only' };
  if (trade.levier || trade.emprunt || trade.marge) return { ok: false, pourquoi: 'no leverage, no borrowing' };
  if (String(trade.de).toLowerCase() !== String(m.details.token).toLowerCase()) return { ok: false, pourquoi: 'only the authorized token is spent' };
  if (!ADR.test(String(trade.destinataire || '')) || String(trade.destinataire).toLowerCase() !== String(trade.compte || '').toLowerCase()) return { ok: false, pourquoi: 'the output must go back to the wallet that signed' };
  if (Number(maintenantS) >= Number(m.details.expiration)) return { ok: false, pourquoi: 'the authorization has expired' };
  const x = BigInt(trade.montant), deja = BigInt(depense || 0);
  if (x > BigInt(autorisation.parTrade)) return { ok: false, pourquoi: 'over the per-trade amount' };
  if (deja + x > BigInt(m.details.amount)) return { ok: false, pourquoi: 'over the budget' };
  return { ok: true };
}
