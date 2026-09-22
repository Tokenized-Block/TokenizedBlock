// frais-creation.js — life fee source for Create + Launch (tip 2349 product rule).
// ================================================================================================
// ⛔ BETA FREE 2026-09-16 tip 0019: Create FREE. Fee moment = Launch life ≈$1 ETH + TbFeeHook HOOK_PREVU aa6D→a6cf.
//    Prefer in-app ETH→USDC exit so FEE_WALLET shows USDC (hook chops swap currency; TBGAS smokes left tokens not dollars).
// ⛔ HARD RULE Raksha 2026-09-15 tip 2349: Creation stays FREE (factory createB20 on MAIN + Practice).
//    Fee moment = Launch / mise en market (life fee ETH ≈ FRAIS_USD + TbFeeHook → a6cf).
//    CreateRouter (createPaid) stays optional/legacy — app default UX = free factory.
//    Sans prix fiable → Launch REFUSES (Create never needs price). USDC exporte pour compat.
// ⚠️ Pages / Instant Create historiques peuvent encore citer FRAIS_HERITE_WEI (0,00005 ETH) —
//    ce module expose les deux ; l app Railway utilise FRAIS_USD + weiPourDollars at Launch.

/** ⛔ ADRESSE RECOPIEE, jamais de memoire.
 * Legacy 0x37eb…580a receives NOTHING (policy). Old 0x3486… / 0x34E3… still 37eb — unused.
 */
/** ⛔⛔ DESTINATION : LE SMART WALLET, remis le 2026-09-17 apres un aller-retour assume — Phil suit
 * CE wallet (« continue a check que 0xa6cf… se remplisse ») et c est lui qui est GRAVE dans le hook et
 * le CreateRouter deja deployes : une seule caisse, pas deux. Son wallet perso reste connu de nous mais
 * ne sert plus de destination (le mettre dans un depot PUBLIC liait aussi toute son activite perso).
 * ANCIENNE NOTE, gardee parce que la mesure vaut toujours : « envoie les fees direct a mon
 * wallet, je recois toujours sur le smart wallet ». Adresse RECOPIEE de son message.
 * MESURE FAITE AVANT DE CHANGER, sur Base :
 *   · a6cf…f5d4 = CONTRAT de 61 octets, le proxy minimal ERC-1967 d un smart wallet (slot
 *     implementation non nul), solde 0,002294 ETH ;
 *   · le nouveau = EOA, AUCUN code, nonce 48 — un compte qu il signe lui-meme.
 * Les deux savent recevoir de l ETH (le `take` de v4 transmet tout le gas) : c est un choix de
 * destination, pas un correctif de transport. */
export const FEE_WALLET = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
/** ⛔ LE SMART WALLET N EST PAS REMPLACABLE PARTOUT : deux contrats DEJA DEPLOYES le portent en
 * immuable (le hook HOOK_PREVU et le CreateRouter). Ce qu ils encaissent continue d aller la — seule
 * la destination des frais que l APP calcule a change. C est aussi lui qui rachete du TBLOCK. */
export const WALLET_TRESOR_SMART = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
/** FORBIDDEN sink — legacy contracts only. Never send app fees here. */
export const FEE_WALLET_LEGACY_37EB = '0x37eb9b7ce0b51fe12fbf092026e001918128580a';
/** ⛔ GRAVE DANS LE CONTRAT : le CreateRouter deploye paie le smart wallet, pas la nouvelle adresse. */
export const CREATE_ROUTER_FEE_WALLET = WALLET_TRESOR_SMART;
/** ⛔ GRAVE DANS LE CONTRAT : HOOK_PREVU.FEE_WALLET() rend le smart wallet (eth_call tip 2356). */
export const HOOK_FEE_WALLET = WALLET_TRESOR_SMART;
/** Base mainnet CreateRouter — on-chain FEE_WALLET a6cf; sealed 1B 100% creator. */
export const CREATE_ROUTER = '0xe05CD0336cD18A0909BCA980a4191A0B00a3FdF5';
/** On-chain floor inside CreateRouter (0.0003 ETH). App may send more (~$1 oracle). */
export const CREATE_FEE_WEI_FLOOR = 300000000000000n;

/* ══════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔⛔ LE PRIX D OUVERTURE D UN MARCHE — 0,001 ETH, ET CE CHIFFRE EST MESURE (2026-09-21).
 *
 * D OU IL VIENT, EXACTEMENT : `prix-du-lancement.mjs` a lu, sur UN jour et 22 fenetres sans une
 * seule ratee, les 103 marches ouverts par le hook le plus actif de Base. 43 createurs distincts,
 * et la MEDIANE de ce qu ils ont envoye vaut 0,001001 ETH. Ce n est donc ni un chiffre rond choisi
 * pour faire joli, ni un prix recopie d un concurrent qui l annoncait : c est ce que le marche
 * paie, lu sur les transactions elles-memes.
 *
 * POURQUOI ON CHANGE. Deux mesures du meme jour : ~885 pools B20 naissent par jour sur Base, et
 * seulement ~54 adresses distinctes y echangent. Nous prenions 0,5 % aux swappeurs — le cote qui
 * n existe presque pas — et ZERO aux createurs, le seul cote qui paie. Resultat mesure sur 14
 * jours : 0,002798464 ETH. Le concurrent a encaisse 10,865 ETH de createurs en UNE journee.
 *
 * ⛔ DECISION DE PHIL DU 2026-09-21, et elle remplace explicitement la regle dure tip 2349
 *    (« Creation stays FREE »). Je ne l ai pas prise seul : la mesure a ete posee, les options
 *    aussi, et c est lui qui a tranche.
 *
 * ⛔ COMMENT C EST ENCAISSE, SANS UN SEUL CONTRAT NOUVEAU : le hook reverse l INTEGRALITE de
 *    `msg.value` au wallet de frais, pas seulement son minimum — `feeWallet.call{value: msg.value}`
 *    dans `inscrire`. L app envoie donc ce montant a `inscrire`, dans le MEME lot atomique que la
 *    creation. Un seul paiement, une seule signature, et rien qui puisse arriver a moitie.
 *
 * ⛔ CE QUE CE CHIFFRE N EST PAS : une promesse de revenu. Il aligne notre prix sur celui du
 *    marche ; il ne fait venir aucun createur. L effet doit etre MESURE apres coup — creations
 *    avant / apres — et publie meme s il est negatif.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */
export const FRAIS_OUVERTURE_WEI = 1000000000000000n;

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
  /* tip 2349: Create is free everywhere — fee is at Launch (fraisLancementUsd). */
  void chaine;
  return 0;
}

/**
 * Phrase AVANT create.
 * @param {number|null} ethUsd  prix ETH/USD LU, ou null
 * @param {bigint|null} fraisWei  wei exacts du frais (ou null si pas encore calcules)
 * @param {bigint|null} soldeEth  solde ETH natif LU, ou null
 */
export function phraseFrais(chaine, nomReseau, ethUsd = null, fraisWei = null, soldeEth = null) {
  /* ⛔⛔ CETTE PHRASE EST LA PREMIERE QUE LIT UN CREATEUR, et elle annoncait « Create is free.
   *     Bringing it to life costs ≈ $1 in ETH. » Les deux moities sont devenues fausses le
   *     2026-09-21 : le prix d ouverture est passe a 0,001 ETH (mediane MESUREE du marche), et il
   *     est paye dans la meme signature que la creation. Annoncer un prix puis en faire signer un
   *     autre est la seule facon sure de perdre quelqu un au moment du wallet.
   * ⛔ LE MONTANT EST DONNE EN ETH, pas en dollars : c est ce que le wallet affichera. */
  void ethUsd; void fraisWei; void soldeEth;
  const main = Number(chaine) === 8453;
  /* tip 20260922-fee-funnel: Create funnel phrase — fiat + Fees for Dev, never fee addr */
  return main
    ? 'Birth fee: ≈$1 (0.001 ETH), once · Fees for Dev — create and open its market in one signature.'
    : 'Free on Practice — nothing is paid here.';
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
    /* tip 0035 (Phil : pas de jargon, pas ou vont les frais — juste le montant) */
    return 'Reading the ETH price… bringing it to life costs ≈ $' + usd + '.';
  }
  /* ⛔⛔ « Create itself is free » A ETE RETIRE ICI LE 2026-09-21, et pas par gout du changement :
   *     depuis que le frais d ouverture vaut 0,001 ETH, cette phrase restait vraie a la lettre —
   *     l appel `createB20` part bien a value zero — et fausse pour celui qui la lit, puisqu il ne
   *     peut pas creer un block AVEC son marche sans payer. Une phrase exacte qui trompe est pire
   *     qu une phrase approximative : elle se defend.
   * ⛔ ON DIT AUSSI OU VA L ARGENT, EN CLAIR. Le montant est affiche en ETH d abord parce que c est
   *    ce que le wallet fera signer ; le dollar n est qu une aide a la lecture. */
  /* ⛔⛔ LE DOLLAR EST CALCULE DEPUIS LE MONTANT REEL, PAS DEPUIS LA CIBLE. Defaut attrape a
   *     l ecran le 2026-09-21, dans ce changement meme : la phrase affichait « 0.001 ETH (≈ $1 at
   *     ~$3,000/ETH) ». Les trois nombres etaient exacts pris un par un, et la phrase etait fausse :
   *     0,001 ETH a 3 000 $/ETH vaut 3 $. Le `$1` venait encore de `FRAIS_USD`, l ANCIENNE cible,
   *     que le nouveau plancher a cesse de piloter. Un chiffre affiche a cote d un autre doit en
   *     DECOULER, sinon les deux derivent sans que rien ne casse. */
  const usdReel = (Number(fraisWei) / 1e18) * Number(ethUsd);
  const usdLisible = usdReel >= 1 ? usdReel.toFixed(2) : usdReel.toFixed(3);
  let base = 'Opening its market: ' + formaterEthCourt(fraisWei) + ' ETH'
    + ' (≈ $' + usdLisible + ' at ~$' + Math.round(Number(ethUsd)).toLocaleString('en-US') + '/ETH),'
    + ' paid once, in the same signature that creates it.';
  if (soldeEth === null || soldeEth === undefined) return base;
  if (BigInt(soldeEth) < BigInt(fraisWei)) {
    return base + ' ⚠️ Not enough ETH in your wallet yet.';
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
