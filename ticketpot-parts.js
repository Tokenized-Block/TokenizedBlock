/* ticketpot-parts.js — LES PARTS D UN JOUR FERME, A SIGNER PAR LE WALLET VERIFIER (Phil, 2026-10-18 : « je ne mets pas la cle privee, je signe
 * moi-meme »). Pur, cote serveur : pour chaque holder du ticket du jour, la part (potAtClose / n), le ticket (ticketDe), les donnees EIP-712
 * (donneesClaim, celles que le wallet signe par eth_signTypedData_v4) et leur digest ; une signature deja recue n est gardee que si elle porte
 * EXACTEMENT ce digest (une part recalculee differemment la rend caduque). verifierSignaturePart relit le signataire (recupererAdresse) et
 * exige le verifier du contrat : rien d autre n est accepte. Aucune cle ici, rien n est envoye. */
import { ticketDe } from './ticketpot-attestation.js';
import { donneesClaim, digestClaim, partDuJour, claimableUntil, dayDeJourId } from './ticketpot-plan.js';
import { recupererAdresse } from './signeur-secp256k1.js';

const ADR = /^0x[0-9a-f]{40}$/;

/** { chainId, contrat, jourId 'JYYYY-MM-DD', tickets: [wallets], potAtClose (bigint|string), signatures: { wallet: { digest, signature } } }
 *  -> [{ day, jourId, wallet, ticket, amount, deadline, donnees, digest, signature|null }] (tries par wallet) ; [] sans ticket ou pot vide */
export function partsDuJour({ chainId, contrat, jourId, tickets, potAtClose, signatures = {}, poids = null }) {
  const day = dayDeJourId(jourId);
  if (day === null || !ADR.test(String(contrat || '').toLowerCase())) throw new Error('partsDuJour: a day id (JYYYY-MM-DD) and the contract are needed');
  /* 2026-10-18 (Phil : « chaque semaine, autant de chances que de tickets ») : `poids` = { wallet: entrees } -> part = floor(pot x entrees /
   *   total) ; sans `poids`, la part egale du jour. La somme des floor ne depasse jamais le pot (le contrat le garantit aussi). */
  const P = poids && typeof poids === 'object' ? Object.fromEntries(Object.entries(poids).map(([a, n]) => [String(a).toLowerCase(), Number(n)]).filter(([a, n]) => ADR.test(a) && Number.isInteger(n) && n > 0)) : null;
  const liste = P ? Object.keys(P).sort() : [...new Set((tickets || []).map((a) => String(a || '').toLowerCase()))].filter((a) => ADR.test(a)).sort();
  const total = P ? Object.values(P).reduce((s, n) => s + n, 0) : liste.length;
  const montantDe = (w) => (P ? (BigInt(potAtClose) * BigInt(P[w])) / BigInt(total) : partDuJour(potAtClose, liste.length));
  if (!liste.length || total <= 0 || BigInt(potAtClose) <= 0n) return [];
  const deadline = claimableUntil(day), c = String(contrat).toLowerCase();
  return liste.filter((w) => montantDe(w) > 0n).map((w) => {
    const amount = montantDe(w);
    const ticket = ticketDe(w, jourId);
    const donnees = donneesClaim({ chainId, contrat: c, day, wallet: w, ticket, amount: amount.toString(), deadline });
    const digest = digestClaim(donnees);
    const s = signatures && signatures[w];
    return { day, jourId, wallet: w, ticket, amount: amount.toString(), deadline, donnees, digest, signature: s && s.digest === digest && typeof s.signature === 'string' ? s.signature : null };
  });
}

/** true seulement si `signature` (0x + 65 octets, v 27/28) recupere EXACTEMENT `verifier` sur `digest` ; tout le reste -> false */
export function verifierSignaturePart({ digest, signature, verifier }) {
  if (!/^0x[0-9a-f]{64}$/i.test(String(digest || '')) || !/^0x[0-9a-f]{130}$/i.test(String(signature || '')) || !ADR.test(String(verifier || '').toLowerCase())) return false;
  try { return String(recupererAdresse(digest, signature)).toLowerCase() === String(verifier).toLowerCase(); } catch (_) { return false; }
}
