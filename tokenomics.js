// tokenomics.js — la tokenomics v2 de TokenizedBlock (DECISIONS-regles-du-jeu-2026-09-13, section 1bis).
// ================================================================================================
// ⛔ RAKSHA 2026-09-14 : Create MAIN fee = ETH ≈ $1 → FEE_WALLET. No 5% / 50M token mint to fee.
//    Sealed 1B supply mints 100% to the creator (CreateRouter + Practice factory path).
// ⛔ TBLOCK EXISTE (cree par Phil le 2026-09-13, adresse LUE dans le log B20Created de sa transaction).
// ✅ TbFeeHook LIVE Base CREATE2 HOOK_PREVU 0xaa6D…2044 — FEE_WALLET() = a6cf (tip 2356). Legacy 0x34E3…6044 still 37eb — unused by new Launch.
/** @deprecated Was 5n (50M of 1B). Create fee is ETH only — keep 0 so Social never keys on a fee mint. */
export const PART_FRAIS_POUR_CENT = 0n;
/** Fixed sealed supply for every TB Create: 1 billion units × 18 decimals. Indestructible = cap == mint, nobody can mint more. */
export const DECIMALES_FIXES = 18;
export const SUPPLY_FIXE = 1_000_000_000n * 10n ** BigInt(DECIMALES_FIXES);
/** TBLOCK, lu dans le log B20Created de la tx 0xda396460…4cf3 (bloc 51 260 745). */
export const TBLOCK = '0xb20000000000000000000024c30d3fcb7931272e';
/** TBGAS — Tokenized Gas · MAIN Launch 2026-09-15 hooked HOOK_PREVU → a6cf (tip 2357). */
export const TBGAS = '0xb200000000000000000000df3ffcd9be89b3843c';
/** tip 0016: Uniswap v4 PoolId = Initialize topic1 · Launch 0x17d20e41…dcc5 · Dex/Gecko pairAddress. */
export const TBGAS_POOL_ID = '0x085294111dc0da95e5496d5c81deaa094fdf73bd5a1e08163679e5ea3b062a46';
/** tip 0019: keep HOOK_PREVU aa6D (proven TBGAS) — do NOT redeploy same bytecode. FEE_WALLET=a6cf. Dollar visibility = ETH→USDC / USDC-side volume (Launch refuses USDC pair: 6 vs 18 decimals). */
/** TbFeeHook LIVE on Base — CREATE2 a6cf (salt 56999). FEE_WALLET() = a6cf. */
export const HOOK_PREVU = '0xaa6D7bD9FC7D394bc717137936f2939834382044';
/* ⛔⛔ HOOK V2 (2026-09-19) : la mise en vie est PAYEE ON-CHAIN (inscrire payable, beforeInitialize refuse sans paiement).
 *    Mesure qui l a motivee : 2 marches sur 4 ouverts avec HOOK_PREVU en 72 h, sans les frais de vie (appel direct au
 *    PositionManager). Adresse = celle MINEE par script/DeployTBlockFeeHookV2.s.sol (simulation du 2026-09-19), deployee
 *    par Phil. Tant qu elle n a pas de code, l app garde HOOK_PREVU : la bascule est lue sur la chaine, jamais supposee. */
export const HOOK_V2 = '0x8E1Eb57AD2A87a4f7bc89ce94eFD5cd77aEc2044';
/* ⛔ HOOK V3 (2026-09-19) : le V2 + les ACTIONS TOKENISEES et gros jetons (USDC, cbBTC, 13 actions Coinbase), liste FIXEE au
 *    deploiement. Adresse = celle minee par script/DeployTBlockFeeHookV3.s.sol (simulation du 2026-09-19). Tant qu elle n a
 *    pas de code, ces paires restent « soon » dans Create : la bascule est lue sur la chaine. */
export const HOOK_V3 = '0x7a7cEBB2Ccb84C9fBfa2730e6cB23Bb192166044';
/** Un marche est-il sur NOTRE hook (V1, V2 ou V3) ? La seule fonction qui en decide. */
export function estNotreHook(h) {
  const x = String(h || '').toLowerCase();
  return x === HOOK_PREVU.toLowerCase() || x === HOOK_V2.toLowerCase() || x === HOOK_V3.toLowerCase();
}
/** Le V3 est-il deploye ? Lu sur son code. */
export async function hookV3Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V3, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/** La V2 est-elle deployee ? Lu sur son code. */
export async function hookV2Deploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_V2, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
/* tip 2300/2356: HOOK_PREVU = 0xaa6D…2044 a6cf. Legacy 0x34E3…6044 still 37eb — unused by new Launch. */
export const ETATS_HOOK = ['DEPLOYE', 'ABSENT', 'NON_LU'];

/** Destinataires et montants de la frappe initiale d un nouveau block — 100% creator. */
export function repartitionFrappe(supply, compte) {
  if (typeof supply !== 'bigint' || supply <= 0n) throw new Error('supply must be a positive bigint');
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(compte || ''))) throw new Error('creator account required');
  return { destinataires: [compte], montants: [supply], frais: 0n, createur: supply };
}

/** Le hook existe-t-il sur la chaine ? Lu sur son code, jamais suppose. */
export async function hookDeploye({ rpc }) {
  try {
    const code = String(await rpc('eth_getCode', [HOOK_PREVU, 'latest']) || '');
    return code === '0x' || code === '' ? 'ABSENT' : 'DEPLOYE';
  } catch { return 'NON_LU'; }
}
