// referent-o1.js — la part « referrer » d o1 Launchpad, PUBLIQUE et DOCUMENTEE, sur les achats que TB route.
// ================================================================================================
// ⛔ CE N EST PAS UN FRAIS DE PLUS. Le hook o1 (LaunchHook 0x1f91…2AcC, source verifiee Sourcify « exact_match »)
//    prend 1 % du montant en devise appariee sur CHAQUE swap, quoi qu il arrive : 0,50 % createur, 0,30 % plateforme,
//    0,20 % referrer. Sans referrer valide, les 0,20 % vont a la plateforme o1. Avec `hookData = abi.encode(a6cf,
//    bytes32 commentaire)`, ils sont credites a a6cf dans le FeeEscrow o1 (0xB3F1…6866), reclamables par
//    `claimFor(a6cf, devise)` — permissionless, les fonds vont TOUJOURS a a6cf (a6cf ne signe jamais rien).
// ⛔ PREUVE SUR FORK (bloc 52 074 194, BRIAN, 0,01 ETH) : sans hookData plateforme +5e13, a6cf 0 ; avec hookData
//    a6cf +2e13 EXACTEMENT, plateforme +3e13, et l acheteur recoit EXACTEMENT le meme nombre de tokens.
//    Controle negatif : referrer = createur -> ignore par le hook (createur +5e13, plateforme +5e13).
// ⛔ SEULEMENT le LaunchHook Standard ACTUEL (enveloppe lue a la source : referrer = 32 premiers octets,
//    commentaire = 32 suivants). Les hooks o1 historiques et le hook Tax (« ignores that slot financially ») : non.
// ⛔ DRAPEAU ON (2026-10-02, staging o1 — demande explicite ; NON deploye). Le marche ouvert (V8-open) reste OFF :
//    la garde refusMarcheOuvertIncoherent (tokenomics.js) refuse si son drapeau passe ON avec une liste V8-open vide.
import { FEE_WALLET } from './frais-creation.js';

export const REFERENT_O1_ACTIF = true;
export const O1_LAUNCH_HOOK_STANDARD = '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc';
export const O1_FEE_ESCROW = '0xb3f11a3fb06a88059b7f7f423ec0dda506356866';
/** part du referrer, en bps du montant echange (lue on-chain : feeComponents(2) = REFERRER, 20). */
export const PART_REFERENT_BPS = 20n;
/** bytes32("tokenizedblock"), visible dans l evenement public Trade du hook. */
export const COMMENTAIRE_O1 = '746f6b656e697a6564626c6f636b000000000000000000000000000000000000';

export function estHookO1Standard(h) {
  return String(h || '').toLowerCase() === O1_LAUNCH_HOOK_STANDARD;
}

/**
 * Le hookData a joindre au swap de cette pool : '' (aucun) ou 128 hex sans 0x = abi.encode(address, bytes32).
 * ⛔ Le referrer est TOUJOURS le wallet de frais TB, jamais un parametre de l appelant.
 */
export function hookDataReferentO1({ cle, actif = REFERENT_O1_ACTIF }) {
  if (!actif || !cle || !estHookO1Standard(cle.hooks)) return '';
  return FEE_WALLET.slice(2).toLowerCase().padStart(64, '0') + COMMENTAIRE_O1;
}

/** La phrase a l ecran : ce que TB recoit, et que ca ne coute rien de plus a l acheteur. */
export function phraseReferentO1(hookData) {
  return hookData
    ? 'This market (o1 Launchpad) charges 1 % on every trade, wherever you buy. Bought here, 0.2 % of that 1 % goes to TokenizedBlock instead of o1 — you pay the same.'
    : '';
}
