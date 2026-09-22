// lancer-pool.js — ouvrir le marche d un block B20 : le plan, calcule et verifie, JAMAIS signe ici.
// ================================================================================================
// ⛔⛔ DECISION DE PHIL, 2026-09-13 : « garder le B20 echange ». Doppler ne peut pas lancer un B20
//    (mesure : il cree toujours son propre token). Le block reste donc l objet achete et vendu, et
//    sa pool Uniswap v4 est ouverte par le wallet de l utilisateur.
//
// ⛔⛔ CE MODULE RECOPIE LE LANCEMENT QUI A DEJA MARCHE, IL NE LE REINVENTE PAS. Chaque etape vient de
//    `index.html` (qui a cree de vraies positions sur mainnet) : cle 0,5 % / espacement 200 contre
//    l ETH natif, placement unilateral a 999/1000 du solde (100 % REVERTE, mesure), une seule
//    transaction `multicall` initialize + mint (sans etat intermediaire ou une pool vide survit),
//    autorisations Permit2 MESUREES avant, et simulation de la chaine AVANT d ouvrir le bouton.
//    Les constantes recopiees sont comparees a `index.html` par `test-lancer-pool.mjs`.
//
// ⛔ AUCUNE SIGNATURE, AUCUN ENVOI. Le plan rend des etapes (to, data, value) ; c est l ecran qui les
//    fait signer par `envoi.js`, avec sa garde chaine + compte.
//
// ⛔ FAIL-CLOSED PARTOUT : une lecture ratee rend NON_MESURE et n offre AUCUNE etape a signer —
//    une autorisation qu on n a pas su lire n est pas une autorisation absente, et un calldata
//    construit sur une lecture ratee serait un pari.
import { selecteur, cleDePool, poolId, liquiditeUnilaterale, liquiditeBilaterale, montantsPosition, sqrtPriceDepuisPrix,
  encodeMintPosition, encodeInitializePool, encodeMulticall, encodeApprove, encodePermit2Approve,
  encodeSwapExactInSingle, SANS_MINHOP, MAX_UINT256, MAX_UINT160, MAX_UINT48 } from './pool.js';
import { parametresLancement, classementValoLancement, tickMinAligne, tickMaxAligne } from './lancement.js';
import { CREATE_FEE_WEI_FLOOR } from './frais-creation.js';

/* ══ CONSTANTES — RECOPIEES DE index.html, COMPAREES PAR UN TEST ═════════════════════════════ */
export const ETH_NATIF = '0x0000000000000000000000000000000000000000';
/** ⛔ `V4` dans index.html. */
export const V4_ADRESSES = {
  84532: { poolm: '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408', posm: '0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80',
           stateView: '0x571291b572ed32ce6751a2Cb2486EbEe8DEfB9B4' },
  8453:  { poolm: '0x498581fF718922c3f8e6A244956aF099B2652b2b', posm: '0x7C5f5A4bBd8fD63184577525326123B519429bDc',
           stateView: '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71' },
};
/** ⛔ `PERMIT2` dans index.html. */
export const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3';
/* ⛔⛔ REGLE DU JEU DE PHIL, 2026-09-13 : POOL PERMANENTE, FRAIS 0 (DECISIONS-regles-du-jeu-2026-09-13.md).
 *    La position est creee au nom de l adresse morte : personne — ni le createur, ni nous — ne peut
 *    jamais retirer la liquidite. Mesure (recherche du 2026-09-13) : le PositionManager v4 n a ni
 *    proprietaire ni proxy, et `onlyIfApproved` garde a la fois le retrait ET la collecte. Donc les
 *    frais ne pourraient jamais etre collectes : ils sont a 0 %, pour que les acheteurs ne paient pas
 *    un frais que personne ne touche.
 * ⚠️ DIVERGENCE VOLONTAIRE avec l ancien ecran, qui applique 0,5 % au createur. Le test la PROUVE au
 *    lieu d exiger l egalite, et verifie que la map lit bien cette cle (sinon nos propres blocks
 *    lances afficheraient « pas de marche »). */
export const FEE_POOL = 0;
/** Ce que l ancien ecran applique (`FRAIS_LAUNCH` dans index.html) — garde pour le test de divergence. */
export const FEE_ANCIEN_ECRAN = 5000;
/** ⛔ `ESPACEMENT_LAUNCH` dans index.html. */
export const TICK_SPACING_POOL = 200;
/** ⛔ L adresse morte, RECOPIEE de `frais-05.mjs` (const MORTE) — un test compare. */
export const PROPRIETAIRE_PERMANENT = '0x000000000000000000000000000000000000dEaD';
/** ⛔ 999/1000 : place a 1000/1000 le mint REVERTE (TRANSFER_FROM_FAILED), mesure du 2026-09-06. */
export const MARGE_POUR_MILLE = 999n;
/** Delai de validite du mint. */
export const DELAI_S = 1800;

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;
const pad = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');

/**
 * sqrt(1.0001^tick) * 2^96, en FLOTTANTS — exactement comme index.html.
 * ⚠️ L erreur relative ~1e-16 vaut ~1e17 wei sur 7,9e32 : c est elle que la marge de 0,1 % absorbe.
 */
export function sqrtDeTick(t) {
  return BigInt(Math.floor(Math.sqrt(Math.pow(1.0001, t)) * 2 ** 96));
}

/* ⛔⛔ BUG DE PHIL DU 2026-09-13 : « Not measured … an approval could not be read » en lancant TBLOCK/ETH. Mesure
 *    au meme moment : le noeud public repondait « over rate limit » (HTTP 429). La limite de debit est
 *    TRANSITOIRE : on reessaie (0,6 s, 1,2 s, 2,4 s) avant de conclure « non mesure ». Toute AUTRE erreur echoue
 *    tout de suite — on ne masque pas une vraie panne en insistant. */
export const ESSAIS_DEBIT = 3;
const estLimiteDeDebit = (e) => /rate limit|too many requests|429/i.test(String((e && e.message) || e));
/* ⚠️ Fonction de module, pas une fleche en parametre par defaut : la regle 5 de verifie-coherence ne voit pas
 *    un parametre-fonction appele directement (meme remarque dans achats.js). */
function patienter(ms) { return new Promise((ok) => setTimeout(ok, ms)); }
async function lireAppel(rpc, to, data) {
  for (let essai = 0; ; essai++) {
    let r;
    try {
      r = await rpc('eth_call', [{ to, data }, 'latest']);
    } catch (e) {
      if (estLimiteDeDebit(e) && essai < ESSAIS_DEBIT) { await patienter(600 * 2 ** essai); continue; }
      throw e;
    }
    if (!r || r === '0x') throw new Error('empty answer from ' + to);
    return r;
  }
}

/**
 * Le plan de lancement d un block.
 * @returns {Promise<object>} `etat` ∈ PRET | APPROBATIONS | REFUSE | NON_MESURE
 */
export const ADRESSE_NULLE = '0x0000000000000000000000000000000000000000';

/**
 * ⛔⛔ PAIRE ET HOOK PARAMETRES (tokenomics v2, 2026-09-13) : `devise` = ETH natif par defaut (inchange), ou
 *    TBLOCK ; `hooks` = aucun par defaut, ou le hook de frais. Avec l ETH natif (adresse 0), le block est
 *    TOUJOURS currency1. Avec TBLOCK, il peut etre currency0 : la plage unilaterale doit alors etre AU-DESSUS
 *    du prix. On calcule dans l orientation « block = currency1 » (celle que `parametresLancement` connait) et
 *    on MIROITE les ticks — le prix inverse est le tick oppose, et un multiple de l espacement reste aligne.
 * ⚠️ `valorisationEth` est une valorisation EN DEVISE de la paire : ETH, ou TBLOCK. Le plancher de
 *    `classementValoLancement` est en ETH : il ne s applique pas a une autre devise.
 */
/**
 * Pure Instant Birth range math (no RPC) — used by planLancement and unit tests.
 * quoteEthWei > 0 ⇒ two-sided full-range straddle; ethRequis must be > 0.
 */
export function mathsNaissanceInstantanee({ aPlacer, quoteEthWei, blockEst1 = true, espacement = TICK_SPACING_POOL }) {
  if (typeof aPlacer !== 'bigint' || aPlacer <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'Instant Birth needs a positive token amount to place' };
  }
  if (typeof quoteEthWei !== 'bigint' || quoteEthWei <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'Instant Birth needs a positive ETH seed for the pool (quoteEthWei)' };
  }
  const tickBas = tickMinAligne(espacement);
  const tickHaut = tickMaxAligne(espacement);
  if (tickBas == null || tickHaut == null || tickHaut <= tickBas) {
    return { etat: 'REFUSE', pourquoi: 'Instant Birth tick range could not be aligned' };
  }
  /* Raw ratio: deviseEst0 + dec=0 → currency1/currency0 = aPlacer/quoteEthWei when ETH is c0. */
  let sqrtVise;
  try {
    sqrtVise = sqrtPriceDepuisPrix({
      prixNum: blockEst1 ? quoteEthWei : aPlacer,
      prixDen: blockEst1 ? aPlacer : quoteEthWei,
      decDevise: 0, decBlock: 0, deviseEst0: true,
    });
  } catch (e) {
    return { etat: 'REFUSE', pourquoi: 'Instant Birth price from ETH seed is not computable' };
  }
  const sqA = sqrtDeTick(tickBas), sqB = sqrtDeTick(tickHaut);
  const montant0 = blockEst1 ? quoteEthWei : aPlacer;
  const montant1 = blockEst1 ? aPlacer : quoteEthWei;
  const L = liquiditeBilaterale({ montant0, montant1, sqrtP: sqrtVise, sqrtMin: sqA, sqrtMax: sqB });
  if (!L) {
    return { etat: 'REFUSE', pourquoi: 'Instant Birth could not compute two-sided liquidity for this ETH seed' };
  }
  const m = montantsPosition(L, sqrtVise, sqA, sqB);
  if (m.regime !== 'DANS_LA_PLAGE') {
    return { etat: 'REFUSE', pourquoi: 'Instant Birth range must straddle the price so both ETH and tokens are required' };
  }
  const ethRequis = blockEst1 ? m.montant0 : m.montant1;
  const blocksRequis = blockEst1 ? m.montant1 : m.montant0;
  if (ethRequis === 0n) {
    return { etat: 'REFUSE', pourquoi: 'Instant Birth refused: computed ethRequis is 0 (one-sided birth is forbidden)' };
  }
  if (blocksRequis === 0n) {
    return { etat: 'REFUSE', pourquoi: 'Instant Birth would place no tokens' };
  }
  if (ethRequis > quoteEthWei) {
    return { etat: 'REFUSE', pourquoi: 'Instant Birth computed ETH for the pool exceeds your seed' };
  }
  if (blocksRequis > aPlacer) {
    return { etat: 'REFUSE', pourquoi: 'Instant Birth would place more tokens than available' };
  }
  /* Forbidden legacy one-sided: tickHaut <= tickPrix ⇒ ethRequis=0. We use full-range straddle. */
  return {
    etat: 'OK', tickBas, tickHaut, tickPrix: tickBas + Math.floor((tickHaut - tickBas) / 2),
    sqrtVise, L, ethRequis, blocksRequis, sqA, sqB, montant0: m.montant0, montant1: m.montant1,
    espacement: Number(espacement),
  };
}

/** Micro first-swap at Instant Birth — tiny ETH→token buy so indexers see ≥1 Transfer+Swap post-mint. */
export const MICRO_SWAP_ETH_WEI = 10000000000000n; /* 0.00001 ETH */
/** Universal Router addresses (same as echange.js) — micro-swap target. */
export const ROUTEUR_V4 = {
  84532: '0x492E6456D9528771018DeB9E87ef7750EF184104',
  8453: '0x6ff5693b99212DA76aD316178A184AB56D299b43',
};

/**
 * Build Universal Router call for a tiny ETH→block buy after mint.
 * Uses SANS_MINHOP (deployed Base UR). Fail-closed if amount/cle invalid.
 * zeroForOne = true when ETH is currency0 (blockEst1).
 */
export function construireAppelMicroSwapNaissance({ cle, chaine, montantEth = MICRO_SWAP_ETH_WEI,
  deadline = null, forme = SANS_MINHOP, blockEst1 = true }) {
  const R = ROUTEUR_V4[Number(chaine)];
  if (!R) return { etat: 'REFUSE', pourquoi: 'no Universal Router on this network for Instant Birth micro-swap' };
  if (!cle || !cle.currency0) return { etat: 'REFUSE', pourquoi: 'Instant Birth micro-swap needs a pool key' };
  const m = typeof montantEth === 'bigint' ? montantEth : BigInt(montantEth || 0);
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'Instant Birth micro-swap amount must be > 0' };
  const dl = deadline != null ? BigInt(deadline) : BigInt(Math.floor(Date.now() / 1000) + DELAI_S);
  const zeroForOne = !!blockEst1; /* ETH is c0 ⇒ buy block (c1) = zeroForOne */
  const data = encodeSwapExactInSingle({
    cle, zeroForOne, montant: m, sortieMin: 0n, deadline: dl, forme,
  });
  return {
    etat: 'OK',
    call: { to: R, data, value: '0x' + m.toString(16) },
    montantEth: m,
  };
}

export async function planLancement({ rpc, chaine, jeton, compte, valorisationEth, maintenant = Date.now(),
  devise = ETH_NATIF, hooks = ADRESSE_NULLE, partPourMille = Number(MARGE_POUR_MILLE), proprietaire = PROPRIETAIRE_PERMANENT,
  quoteEthWei = null, soldePresume = null }) {
  /* ⛔⛔ OUTILS DE LIQUIDITE (Phil, 2026-09-13) : un detenteur peut AJOUTER ses blocks a un marche existant en GARDANT
   *    sa position (retirable). Le proprietaire est donc soit l adresse morte (lancement permanent, regle 1), soit
   *    le COMPTE qui signe — jamais une troisieme adresse : donner la position a un tiers depuis cet ecran serait
   *    un piege, pas un outil. */
  if (String(proprietaire).toLowerCase() !== PROPRIETAIRE_PERMANENT.toLowerCase()
    && String(proprietaire).toLowerCase() !== String(compte || '').toLowerCase()) {
    return { etat: 'REFUSE', pourquoi: 'the position can belong only to the dead address (permanent) or to you' };
  }
  if (!Number.isInteger(partPourMille) || partPourMille < 1 || partPourMille > Number(MARGE_POUR_MILLE)) {
    return { etat: 'REFUSE', pourquoi: 'the share to place must be between 0.1 % and 99.9 % of your balance' };
  }
  const V = V4_ADRESSES[Number(chaine)];
  if (!V) return { etat: 'REFUSE', pourquoi: 'this network has no Uniswap v4 addresses here' };
  if (!ADRESSE.test(String(jeton || ''))) return { etat: 'REFUSE', pourquoi: 'the block is not an address' };
  if (!ADRESSE.test(String(compte || ''))) return { etat: 'REFUSE', pourquoi: 'connect your wallet first' };
  if (!ADRESSE.test(String(devise || '')) || !ADRESSE.test(String(hooks || ''))) return { etat: 'REFUSE', pourquoi: 'pair or hook is not an address' };
  if (String(devise).toLowerCase() === String(jeton).toLowerCase()) return { etat: 'REFUSE', pourquoi: 'a block cannot be paired with itself' };
  const enEth = String(devise).toLowerCase() === ETH_NATIF;
  const classement = enEth ? classementValoLancement(valorisationEth)
    : (Number(valorisationEth) > 0 && Number.isFinite(Number(valorisationEth)) ? { etat: 'NON_APPLICABLE' } : { etat: 'ILLISIBLE' });
  if (classement.etat === 'ILLISIBLE') return { etat: 'REFUSE', pourquoi: 'the valuation must be a positive number' };
  const valo = Number(valorisationEth);

  /* ── lectures ── */
  let supply, dec, solde, s0, decDevise = 18;
  const cle = cleDePool(devise, jeton, { fee: FEE_POOL, tickSpacing: TICK_SPACING_POOL, hooks });
  const blockEst1 = String(cle.currency1).toLowerCase() === String(jeton).toLowerCase();
  const avantCreate = soldePresume != null;
  try {
    if (avantCreate) {
      /* Atomic Create+Launch: token not on chain yet — CREATE2 address + sealed 1B supply presumed. */
      dec = 18;
      supply = soldePresume;
      solde = soldePresume;
      s0 = '0x' + '0' * 128; /* empty slot0 */
    } else {
      supply = BigInt(await lireAppel(rpc, jeton, '0x' + selecteur('totalSupply()')));
      dec = Number(BigInt(await lireAppel(rpc, jeton, '0x' + selecteur('decimals()'))));
      solde = BigInt(await lireAppel(rpc, jeton, '0x' + selecteur('balanceOf(address)') + pad(compte)));
      s0 = await lireAppel(rpc, V.stateView, '0x' + selecteur('getSlot0(bytes32)') + poolId(cle).slice(2));
    }
    if (!enEth) decDevise = Number(BigInt(await lireAppel(rpc, devise, '0x' + selecteur('decimals()'))));
  } catch (e) {
    return { etat: 'NON_MESURE', pourquoi: 'the block or its pool could not be read: ' + String((e && e.message) || e) };
  }
  if (!Number.isInteger(dec) || dec < 0 || dec > 36) return { etat: 'NON_MESURE', pourquoi: 'decimals out of range' };
  /* ⛔ DECIMALES DIFFERENTES (V3, 2026-09-19) : l ecart est passe au calcul de la plage (et sqrtPriceDepuisPrix le connait
   *    deja) — le test aller-retour prouve que plage et prix de depart restent alignes. Au-dela de 30 : refus. */
  if (!Number.isInteger(decDevise) || decDevise < 0 || decDevise > 36) return { etat: 'NON_MESURE', pourquoi: 'pair decimals out of range' };
  if (soldePresume != null) {
    if (typeof soldePresume !== 'bigint' || soldePresume <= 0n) {
      return { etat: 'REFUSE', pourquoi: 'presumed balance for Instant Birth must be a positive bigint' };
    }
    solde = soldePresume;
    if (supply == null || supply === 0n) supply = soldePresume;
  }
  if (solde === 0n) return { etat: 'REFUSE', pourquoi: 'this account holds none of this block' };
  const entiere = supply / 10n ** BigInt(dec);
  const sqrtExistant = BigInt('0x' + String(s0).slice(2, 66));
  const tickCourant = sqrtExistant === 0n ? null : Number(BigInt.asIntN(24, BigInt('0x' + String(s0).slice(66, 130))));
  const naissance = quoteEthWei != null;
  const part = BigInt(partPourMille);
  const aPlacer = (solde * part) / 1000n;

  let p, sqrtVise, L, ethRequis, blocksRequis, modeNaissance = false;

  if (naissance) {
    /* ══ Instant Birth (index patch 2026-09-21 / tip 0021): two-sided ETH seed — NEVER ethRequis=0 ══ */
    modeNaissance = true;
    if (!enEth) {
      return { etat: 'REFUSE', pourquoi: 'Instant Birth only pairs against native ETH (USDC refused: 6 vs 18 decimals)' };
    }
    if (typeof quoteEthWei !== 'bigint') {
      return { etat: 'REFUSE', pourquoi: 'Instant Birth quoteEthWei must be a bigint' };
    }
    if (quoteEthWei <= 0n) {
      return { etat: 'REFUSE', pourquoi: 'Instant Birth needs a positive ETH seed for the pool — quote dust refused' };
    }
    /* MAIN: floor 0.0003 ETH seed (CreateRouter floor). Life fee FRAIS_OUVERTURE stays separate. */
    if (Number(chaine) === 8453 && quoteEthWei < CREATE_FEE_WEI_FLOOR) {
      return { etat: 'REFUSE', pourquoi: 'ETH seed is dust — need at least 0.0003 ETH in the pool (CreateRouter floor)' };
    }
    if (sqrtExistant !== 0n) {
      return { etat: 'REFUSE', pourquoi: 'Instant Birth opens a new pool — this market already exists (use Add liquidity)' };
    }
    const math = mathsNaissanceInstantanee({ aPlacer, quoteEthWei, blockEst1, espacement: TICK_SPACING_POOL });
    if (math.etat !== 'OK') return { etat: 'REFUSE', pourquoi: math.pourquoi };
    p = { etat: 'OK', tickBas: math.tickBas, tickHaut: math.tickHaut, tickPrix: math.tickPrix,
      prixImpose: false, espacement: TICK_SPACING_POOL, naissance: true };
    sqrtVise = math.sqrtVise;
    L = math.L;
    ethRequis = math.ethRequis;
    blocksRequis = math.blocksRequis;
    if (blocksRequis > solde) return { etat: 'REFUSE', pourquoi: 'it would place more blocks than you hold' };
  } else {
    /* ── prix, plage, liquidite — UNILATERAL (Add liquidity / non-birth Launch) ── */
    const pm = parametresLancement({ supply: entiere, valorisationEth: valo, espacement: TICK_SPACING_POOL,
      tickCourant: tickCourant === null ? null : (blockEst1 ? tickCourant : -tickCourant), ecartDecimales: dec - decDevise });
    if (pm.etat !== 'OK') return { etat: 'REFUSE', pourquoi: pm.pourquoi };
    p = blockEst1 ? pm : { ...pm, tickBas: -pm.tickHaut, tickHaut: -pm.tickBas, tickPrix: -pm.tickPrix };
    sqrtVise = sqrtExistant !== 0n ? sqrtExistant
      : sqrtPriceDepuisPrix({ prixNum: BigInt(Math.round(valo * 1e6)), prixDen: entiere * 1000000n,
        decDevise, decBlock: dec, deviseEst0: blockEst1 });
    const sqA = sqrtDeTick(p.tickBas), sqB = sqrtDeTick(p.tickHaut);
    L = liquiditeUnilaterale({ montant: aPlacer, cote: blockEst1 ? 1 : 0, sqrtMin: sqA, sqrtMax: sqB });
    if (!L) return { etat: 'REFUSE', pourquoi: 'no liquidity is computable for this range' };
    const m = montantsPosition(L, sqrtVise, sqA, sqB);
    ethRequis = blockEst1 ? m.montant0 : m.montant1;
    blocksRequis = blockEst1 ? m.montant1 : m.montant0;
    /* ⛔ TROIS REFUS, AUCUN REDONDANT — repris tels quels de l ecran qui a marche. */
    if (ethRequis !== 0n) return { etat: 'REFUSE', pourquoi: 'the range is on the wrong side of the price — it would ask for ETH' };
    if (blocksRequis === 0n) return { etat: 'REFUSE', pourquoi: 'this would place nothing at all' };
    if (blocksRequis > solde) return { etat: 'REFUSE', pourquoi: 'it would place more blocks than you hold' };
  }

  const base = { cle, blockEst1, supply, dec, solde, entiere, poolExiste: sqrtExistant !== 0n, tickCourant,
    p, sqrtVise, L, blocksRequis, ethRequis, resteAuCreateur: solde - blocksRequis, classement, V,
    naissance: modeNaissance, quoteEthWei: modeNaissance ? quoteEthWei : 0n };

  /* ── autorisations Permit2, MESUREES (or forced for pre-create Instant Birth) ── */
  let okP2 = null, okPosm = null;
  if (avantCreate) {
    okP2 = false;
    okPosm = false;
  } else {
    try {
      const all = BigInt(await lireAppel(rpc, jeton, '0x' + selecteur('allowance(address,address)') + pad(compte) + pad(PERMIT2)));
      okP2 = all > 0n;
    } catch (e) { okP2 = null; }
    try {
      const raw = await lireAppel(rpc, PERMIT2, '0x' + selecteur('allowance(address,address,address)')
        + pad(compte) + pad(jeton) + pad(V.posm));
      let montant = BigInt('0x' + String(raw).slice(2, 66));
      const expiration = BigInt('0x' + String(raw).slice(66, 130));
      if (montant > 0n && expiration > 0n && expiration < BigInt(Math.floor(maintenant / 1000))) montant = 0n;
      okPosm = montant > 0n;
    } catch (e) { okPosm = null; }
  }

  if (okP2 === null || okPosm === null) {
    return { ...base, etat: 'NON_MESURE', etapes: [],
      pourquoi: 'an approval could not be read — nothing is offered to sign until it is measured' };
  }
  const etapes = [];
  if (!okP2) etapes.push({ nom: 'Allow Permit2 to move this block', to: jeton, data: encodeApprove(PERMIT2, MAX_UINT256), value: '0x0' });
  if (!okPosm) etapes.push({ nom: 'Allow the Uniswap position manager (through Permit2)', to: PERMIT2,
    data: encodePermit2Approve(jeton, V.posm, MAX_UINT160, MAX_UINT48), value: '0x0' });

  /* ── la transaction de lancement : UNE seule, atomique ── */
  /* Instant Birth: BOTH max0 and max1 allow the ETH side. Unilateral keeps 0n on ETH. */
  let max0, max1;
  if (modeNaissance) {
    const slack0 = blockEst1 ? ethRequis : blocksRequis;
    const slack1 = blockEst1 ? blocksRequis : ethRequis;
    max0 = (slack0 * 102n) / 100n;
    max1 = (slack1 * 102n) / 100n;
    if (max0 === 0n || max1 === 0n) {
      return { etat: 'REFUSE', pourquoi: 'Instant Birth mint caps refused — ETH or token max would be 0 (fail-closed)' };
    }
  } else {
    max0 = blockEst1 ? 0n : (blocksRequis * 102n) / 100n;
    max1 = blockEst1 ? (blocksRequis * 102n) / 100n : 0n;
  }
  const mint = encodeMintPosition({ cle, tickBas: p.tickBas, tickHaut: p.tickHaut, liquidite: L,
    max0, max1,
    /* ⛔⛔ LE PROPRIETAIRE DE LA POSITION EST L ADRESSE MORTE, PAS LE COMPTE : c est ce qui rend la pool
     * permanente. Instant Birth keeps dead-address lock. */
    proprietaire, deadline: BigInt(Math.floor(maintenant / 1000) + DELAI_S) });
  const donnee = sqrtExistant !== 0n ? mint : encodeMulticall([encodeInitializePool(cle, sqrtVise), mint]);
  const txValue = modeNaissance && ethRequis > 0n ? ('0x' + ethRequis.toString(16)) : '0x0';
  const tx = { to: V.posm, data: donnee, value: txValue };

  /* Mandatory micro first-swap call (appended by UI into atomic batch). Fail-closed if unbuildable. */
  /* tip 0211: micro first-swap is best-effort for indexers. A failed build must NOT block
   * seed+fee Launch — measured IB022: mint path stuck while open fee already paid. */
  let microSwap = null;
  if (modeNaissance) {
    const ms = construireAppelMicroSwapNaissance({
      cle, chaine, montantEth: MICRO_SWAP_ETH_WEI, blockEst1,
      deadline: BigInt(Math.floor(maintenant / 1000) + DELAI_S),
    });
    if (ms.etat === 'OK') microSwap = ms.call;
    /* else: leave null — UI launches mint+seed without micro */
  }

  return { ...base, etat: etapes.length ? 'APPROBATIONS' : 'PRET', etapes, tx, microSwap,
    permanente: String(proprietaire).toLowerCase() === PROPRIETAIRE_PERMANENT.toLowerCase(), proprietairePosition: proprietaire,
    approbationsIllimitees: 'Permit2 gets an unlimited allowance for this block (MAX_UINT256), and the position '
      + 'manager an unlimited Permit2 allowance (MAX_UINT160) — both until you revoke them.' };
}

/**
 * Demande a la chaine d executer la transaction de lancement, SANS l envoyer.
 * ⛔ FAIL-CLOSED : « je n ai pas pu verifier » n est jamais « c est accepte ».
 */
export async function simulerLancement({ rpc, compte, tx }) {
  /* tip 0211: eth_simulateV1 alone has been seen to REFUSE Instant Birth mint after a paid V8
   * inscription while eth_estimateGas on the same mint accepts (and the mint would land). Ask
   * estimateGas as a second opinion before locking the user out. Mint only — micro-swap is
   * best-effort and is not part of this simulation. */
  const call = { from: compte, to: tx.to, data: tx.data, value: tx.value || '0x0' };
  let simPourquoi = null;
  let simDonnees = null;
  try {
    const sim = await rpc('eth_simulateV1', [{ blockStateCalls: [{ calls: [call] }],
      validation: false, traceTransfers: false }, 'latest']);
    const appels = (sim && sim[0] && sim[0].calls) || [];
    if (appels.length >= 1 && appels[0].status === '0x1') {
      return { etat: 'ACCEPTE', gasUtilise: appels[0].gasUsed ? BigInt(appels[0].gasUsed) : null, via: 'simulateV1' };
    }
    if (appels.length >= 1) {
      const err = appels[0].error || {};
      simPourquoi = String(err.message || 'the chain refuses this launch');
      simDonnees = err.data || null;
    } else {
      simPourquoi = 'the node returned no result for the launch';
    }
  } catch (e) {
    simPourquoi = 'the chain was not asked: ' + String((e && e.message) || e);
  }
  try {
    const gas = await rpc('eth_estimateGas', [call]);
    return { etat: 'ACCEPTE', gasUtilise: gas ? BigInt(gas) : null, via: 'estimateGas',
      note: simPourquoi ? ('simulateV1 said no (' + simPourquoi + '); estimateGas accepted') : null };
  } catch (e2) {
    const estPourquoi = String((e2 && e2.message) || e2);
    return { etat: 'REFUSE', pourquoi: (simPourquoi ? simPourquoi + ' · ' : '') + estPourquoi, donnees: simDonnees };
  }
}
