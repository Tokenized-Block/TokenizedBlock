// tokenomics.js — la tokenomics v2 de TokenizedBlock (DECISIONS-regles-du-jeu-2026-09-13, section 1bis).
// ================================================================================================
// ⛔ 5 % DE LA SUPPLY D UN NOUVEAU BLOCK AU WALLET DE FRAIS, 95 % AU CREATEUR. Decide par Phil le 2026-09-13.
//    Mesure du meme jour (eth_call sur la factory, rien envoye) : une creation dont `batchMint` frappe vers
//    DEUX destinataires sous le plafond scelle est ACCEPTEE ; le temoin qui depasse le plafond est REFUSE.
// ⛔ LE TOTAL FRAPPE EST EXACTEMENT LA SUPPLY : la part du createur est « supply − part des frais », jamais
//    un second arrondi — sinon quelques unites manqueraient au plafond, ou le depasseraient.
// ⛔ TBLOCK EXISTE (cree par Phil le 2026-09-13, adresse LUE dans le log B20Created de sa transaction).
// ⚠️ LE HOOK N EST PAS DEPLOYE : son adresse est celle minee par la simulation du 2026-09-13. Rien ne doit
//    l utiliser tant que `hookDeploye` ne rend pas DEPLOYE — et il ne doit pas l etre avant l audit.
import { FEE_WALLET } from './frais-creation.js';

export const PART_FRAIS_POUR_CENT = 5n;
/** Fixed sealed supply for every TB Create: 1 billion units × 18 decimals. Indestructible = cap == mint, nobody can mint more. */
export const DECIMALES_FIXES = 18;
export const SUPPLY_FIXE = 1_000_000_000n * 10n ** BigInt(DECIMALES_FIXES);
/** TBLOCK, lu dans le log B20Created de la tx 0xda396460…4cf3 (bloc 51 260 745). */
export const TBLOCK = '0xb20000000000000000000024c30d3fcb7931272e';
/** Adresse MINEE du hook (simulation forge sans --broadcast, 2026-09-13) — PAS une adresse deployee. */
export const HOOK_PREVU = '0xc3Fc7C671Dc2bA698943E7Cd961A0F561585E044';
export const ETATS_HOOK = ['DEPLOYE', 'ABSENT', 'NON_LU'];

/** Destinataires et montants de la frappe initiale d un nouveau block. */
export function repartitionFrappe(supply, compte) {
  if (typeof supply !== 'bigint' || supply <= 0n) throw new Error('supply must be a positive bigint');
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(compte || ''))) throw new Error('creator account required');
  if (String(compte).toLowerCase() === FEE_WALLET.toLowerCase()) {
    /* le wallet de frais qui cree un block recoit tout : deux lignes vers la meme adresse ne servent a rien */
    return { destinataires: [compte], montants: [supply], frais: 0n, createur: supply };
  }
  const frais = (supply * PART_FRAIS_POUR_CENT) / 100n;
  const createur = supply - frais;
  return { destinataires: [FEE_WALLET, compte], montants: [frais, createur], frais, createur };
}

/** Le hook existe-t-il sur la chaine ? Lu sur son code, jamais suppose. */
export async function hookDeploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_PREVU, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
