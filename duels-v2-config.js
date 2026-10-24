/* duels-v2-config.js — la VERIFICATION d un enregistrement de deploiement de BlockDuelsV2 (2026-10-24). Pur ; deployer-duels-v2.html
 * l importe dans le navigateur, le preparateur, le banc et les tests dans node.
 * ⛔ Le constructeur de v2 est CELUI de v1 (usdc, devWallet, rewardPool, guardian : 4 mots statiques, meme ordre) : l encodage et les refus
 *   sont ceux de duels-config.js (reutilises, jamais recopies). Seul le nom du contrat attendu change : une fiche v1 n allume pas la page v2. */
import { ORDRE_ARGS, encoderArgs, refusParametres } from './duels-config.js';
export { ORDRE_ARGS, encoderArgs, refusParametres };

export const CONTRAT_V2 = 'BlockDuelsV2';
const bas = (x) => String(x || '').toLowerCase();

/**
 * Ce que la page verifie AVANT d allumer le bouton. `sha256Hex` = l empreinte de `creation` (crypto.subtle dans le navigateur, node:crypto
 * dans les tests). `v1` (optionnel) = la fiche v1 deployee : ses 4 arguments doivent etre EXACTEMENT ceux de v2 (memes parametres, decision
 * de Phil 2026-10-24). Rend { intacte, pourquoi[] } ; la moindre raison eteint le bouton.
 */
export function verifierEnregistrementV2(D, sha256Hex, v1 = null) {
  const pourquoi = [];
  if (!D || D.contrat !== CONTRAT_V2) pourquoi.push('not a BlockDuelsV2 record');
  if (!D || D.chaine !== 8453) pourquoi.push('not Base (8453)');
  if (D && D.pret !== true) pourquoi.push('not ready: ' + [...(D.manquants || []).map((m) => m + ' is missing'), ...(D.refus || [])].join('; '));
  if (!D || typeof D.creation !== 'string' || !/^0x[0-9a-f]+$/.test(D.creation)) pourquoi.push('creation data unreadable');
  if (pourquoi.length) return { intacte: false, pourquoi };
  if ((D.creation.length - 2) / 2 !== D.octetsCreation) pourquoi.push('creation length differs from the record');
  if (bas(sha256Hex) !== bas(D.sha256Creation)) pourquoi.push('sha256 fingerprint differs from the record');
  let attendu = null;
  try { attendu = encoderArgs(D.constructeur); } catch (e) { pourquoi.push('arguments unreadable: ' + String(e.message || e)); }
  if (attendu && !D.creation.endsWith(attendu)) pourquoi.push('the creation data does not end with the displayed arguments');
  if (attendu && attendu.length / 2 !== D.octetsArgs) pourquoi.push('argument length differs from the record');
  const r = refusParametres(D.constructeur || {});
  if (r.length) pourquoi.push(...r);
  if (v1) for (const k of ORDRE_ARGS) if (bas(v1.constructeur && v1.constructeur[k]) !== bas(D.constructeur && D.constructeur[k])) pourquoi.push(k + ' differs from the v1 duels contract');
  if (D.adresse !== null && D.adresse !== undefined) pourquoi.push('already deployed at ' + D.adresse);
  return { intacte: pourquoi.length === 0, pourquoi };
}
