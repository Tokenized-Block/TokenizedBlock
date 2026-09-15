// frais-creation.js — le frais FIXE de creation, une seule source pour les deux ecrans.
// ================================================================================================
// ⛔ MAIN (8453): one payable createPaid → CreateRouter (fee ETH forwarded after create).
//    Practice: free createB20 on factory (NonPayable). Fail-closed if fee price unread.
//
// ⛔⛔ DECISION RAKSHA 2026-09-14 : LIFE FEE MAIN = ETH ≈ FRAIS_USD dollars (birth at Create,
//    stay-alive / wake market at Launch). Calcule via `prix-eth.js` (mediane multi-pools).
//    Sans prix fiable → Create / Launch REFUSES. USDC exporte pour compat ; rail app = ETH.
//    Sleep / no-market = not paying life yet. Raw external factory creates stay unpaid until Launch.
// ⚠️ Pages / Instant Create historiques peuvent encore citer FRAIS_HERITE_WEI (0,00005 ETH) —
//    ce module expose les deux ; l app Railway utilise FRAIS_USD + weiPourDollars.

/** ⛔ ADRESSE RECOPIEE, jamais de memoire.
 * HARD RULE Raksha 2026-09-15: ALL fees → only Base smart wallet a6cf…f5d4.
 * Legacy 0x37eb…580a must receive NOTHING (policy). CreateRouter+TbFeeHook still
 * engrave 0x37eb on-chain until redeploy — dig honesty, not a destination.
 */
export const FEE_WALLET = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
/** FORBIDDEN sink — eth_call truth only. Live CreateRouter+Hook still return this; must redeploy. Never send app fees here. */
export const FEE_WALLET_LEGACY_37EB = '0x37eb9b7ce0b51fe12fbf092026e001918128580a';
/** eth_call CreateRouter.FEE_WALLET() — still 0x37eb (WRONG vs hard rule). Redeploy pack dig. */
export const CREATE_ROUTER_FEE_WALLET = FEE_WALLET; /* tip 2290: new CreateRouter on-chain a6cf */
/** eth_call TbFeeHook.FEE_WALLET() — still 0x37eb (WRONG vs hard rule). New CREATE2 required. */
export const HOOK_FEE_WALLET = FEE_WALLET_LEGACY_37EB;
/** Base mainnet CreateRouter 0x3486…ff0a — on-chain still forwards to 0x37eb until redeploy; sealed 1B 100% creator. */
export const CREATE_ROUTER = '0xe05CD0336cD18A0909BCA980a4191A0B00a3FdF5';
/** On-chain floor inside CreateRouter (0.0003 ETH). App may send more (~$1 oracle). */
export const CREATE_FEE_WEI_FLOOR = 300000000000000n;

/** 0,00005 ETH — ancien ecran Pages (garde pour tests d alignement). */
export const FRAIS_HERITE_WEI = 50000000000000n;
export const FRAIS_REEL_WEI = FRAIS_HERITE_WEI;

/** Cible en dollars (Create MAIN). */
export const FRAIS_USD = 1;

/** USDC Base — encore utile pour soldes / digs ; Create app = ETH. */
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const USDC_DECIMALES = 6;
export const FRAIS_USDC_UNITES = 1000000n;

export const CHAINES_PAYANTES = [8453];

/** @deprecated Pages/heritage micro-ETH only. MAIN Create uses FRAIS_USD + weiPourDollars — never this. */
export function fraisCreationWei(chaine) {
  return CHAINES_PAYANTES.includes(Number(chaine)) ? FRAIS_HERITE_WEI : 0n;
}

export function fraisCreationUsd(chaine) {
  return CHAINES_PAYANTES.includes(Number(chaine)) ? FRAIS_USD : 0;
}

/**
 * Phrase AVANT create.
 * @param {number|null} ethUsd  prix ETH/USD LU, ou null
 * @param {bigint|null} fraisWei  wei exacts du frais (ou null si pas encore calcules)
 * @param {bigint|null} soldeEth  solde ETH natif LU, ou null
 */
export function phraseFrais(chaine, nomReseau, ethUsd = null, fraisWei = null, soldeEth = null) {
  const usd = fraisCreationUsd(chaine);
  if (usd === 0) {
    return 'No life fee on ' + (nomReseau || 'this network') + ' — testnet blocks are free. '
      + 'One signature: the creation itself.';
  }
  /* ⛔ Grok Super P0 2026-09-14: jamais CTA « $1 » sans wei mesure; prix illu = Create ferme. */
  if (ethUsd === null || ethUsd === undefined || fraisWei === null || fraisWei === undefined) {
    return 'Life-fee price unread — Create closed. Need a measured ETH amount ≈ $' + usd
      + ' · Fees for BaseAPP Holders (Uniswap v4 median). No silent micro-ETH fallback. Life fee ≠ automatic buyback.';
  }
  let base = 'Life fee (birth): ' + formaterEthCourt(fraisWei) + ' ETH'
    + ' (≈ $' + usd + ' at ~$' + Math.round(Number(ethUsd)).toLocaleString('en-US')
    + '/ETH median) · Fees for BaseAPP Holders'
    + '. One signature: CreateRouter (life fee ETH only after create succeeds — revert refunds you). Life fee ≠ automatic buyback.';
  if (soldeEth === null || soldeEth === undefined) return base;
  if (BigInt(soldeEth) < BigInt(fraisWei)) {
    return base + ' ⚠️ Your ETH balance is below the life fee, so creation cannot start.';
  }
  return base;
}

/** Same FRAIS_USD on MAIN — Launch / wake market life fee (stage 2). Practice = 0. */
export function fraisLancementUsd(chaine) {
  return CHAINES_PAYANTES.includes(Number(chaine)) ? FRAIS_USD : 0;
}

/**
 * Phrase AVANT Launch (wake market) — life fee to stay alive / open life on-chain.
 * Sleep / no-market blocks stay free until this step.
 */
export function phraseFraisLancement(chaine, nomReseau, ethUsd = null, fraisWei = null, soldeEth = null) {
  const usd = fraisLancementUsd(chaine);
  if (usd === 0) {
    return 'No Launch life fee on ' + (nomReseau || 'this network') + ' — Practice wake is free.';
  }
  if (ethUsd === null || ethUsd === undefined || fraisWei === null || fraisWei === undefined) {
    return 'Life-fee price unread — Launch closed. Need a measured ETH amount ≈ $' + usd
      + ' · Fees for BaseAPP Holders (Uniswap v4 median). Sleep stays free until Launch pays life.';
  }
  let base = 'Life fee (Launch / stay alive): ' + formaterEthCourt(fraisWei) + ' ETH'
    + ' (≈ $' + usd + ' at ~$' + Math.round(Number(ethUsd)).toLocaleString('en-US')
    + '/ETH median) · Fees for BaseAPP Holders'
    + '. Separate ETH transfer first (≥ CreateRouter floor 0.0003 ETH), verified for BaseAPP Holders before Launch. Same path as Create birth fee. Life fee ≠ automatic buyback.';
  if (soldeEth === null || soldeEth === undefined) return base;
  if (BigInt(soldeEth) < BigInt(fraisWei)) {
    return base + ' ⚠️ Your ETH balance is below the life fee, so Launch cannot start.';
  }
  return base;
}

export function arrondiAffichage(wei, n = 6) {
  const t = formaterEthCourt(wei);
  const [ent, frac = ''] = t.split('.');
  if (!frac) return ent;
  const coupe = frac.slice(0, n).replace(/0+$/, '');
  if (!coupe) return ent === '0' && BigInt(wei) > 0n ? '<0.' + '0'.repeat(n - 1) + '1' : ent;
  return ent + '.' + coupe;
}

export function formaterEthCourt(wei) {
  const s = BigInt(wei).toString().padStart(19, '0');
  const ent = s.slice(0, s.length - 18);
  const frac = s.slice(s.length - 18).replace(/0+$/, '');
  return frac === '' ? ent : ent + '.' + frac;
}
