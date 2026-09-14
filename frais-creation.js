// frais-creation.js — le frais FIXE de creation, une seule source pour les deux ecrans.
// ================================================================================================
// ⛔ LE FRAIS EST UN TRANSFERT SEPARE, VISIBLE, SIGNE PAR L UTILISATEUR. createB20 refuse toute value
//    (`NonPayable()`). Deux gestes, dits AVANT — fail-closed si le frais echoue.
//
// ⛔⛔ DECISION RAKSHA 2026-09-14 : le frais MAIN se paie en ETH, equivalent a FRAIS_USD dollars,
//    calcule via `prix-eth.js` (mediane multi-pools). Sans prix fiable → creation REFUSEE.
//    USDC reste exporte pour compat / lectures anciennes, mais n est plus le rail Create de l app.
// ⚠️ Pages / Instant Create historiques peuvent encore citer FRAIS_HERITE_WEI (0,00005 ETH) —
//    ce module expose les deux ; l app Railway utilise FRAIS_USD + weiPourDollars.

/** ⛔ ADRESSE RECOPIEE, jamais de memoire. */
export const FEE_WALLET = '0x37eb9b7ce0b51fe12fbf092026e001918128580a';

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
  const walletCourt = FEE_WALLET.slice(0, 6) + '…' + FEE_WALLET.slice(-4);
  if (usd === 0) {
    return 'No creation fee on ' + (nomReseau || 'this network') + ' — testnet blocks are free. '
      + 'One signature: the creation itself.';
  }
  /* ⛔ Grok Super P0 2026-09-14: jamais CTA « $1 » sans wei mesure; prix illu = Create ferme. */
  if (ethUsd === null || ethUsd === undefined || fraisWei === null || fraisWei === undefined) {
    return 'Fee price unread — Create closed. Need a measured ETH amount ≈ $' + usd
      + ' to ' + walletCourt + ' (Uniswap v4 median). No silent micro-ETH fallback. Create fee ≠ automatic buyback.';
  }
  let base = 'Creation fee: ' + formaterEthCourt(fraisWei) + ' ETH'
    + ' (≈ $' + usd + ' at ~$' + Math.round(Number(ethUsd)).toLocaleString('en-US')
    + '/ETH median) → ' + walletCourt
    + '. Stages: 1) Pay fee (ETH) · 2) Create. If the fee fails, nothing is created. Create fee ≠ automatic buyback.';
  if (soldeEth === null || soldeEth === undefined) return base;
  if (BigInt(soldeEth) < BigInt(fraisWei)) {
    return base + ' ⚠️ Your ETH balance is below the fee, so creation cannot start.';
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
