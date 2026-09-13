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
import { selecteur, cleDePool, poolId, liquiditeUnilaterale, montantsPosition, sqrtPriceDepuisPrix,
  encodeMintPosition, encodeInitializePool, encodeMulticall, encodeApprove, encodePermit2Approve,
  MAX_UINT256, MAX_UINT160, MAX_UINT48 } from './pool.js';
import { parametresLancement, classementValoLancement } from './lancement.js';

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

async function lireAppel(rpc, to, data) {
  const r = await rpc('eth_call', [{ to, data }, 'latest']);
  if (!r || r === '0x') throw new Error('empty answer from ' + to);
  return r;
}

/**
 * Le plan de lancement d un block.
 * @returns {Promise<object>} `etat` ∈ PRET | APPROBATIONS | REFUSE | NON_MESURE
 */
export async function planLancement({ rpc, chaine, jeton, compte, valorisationEth, maintenant = Date.now() }) {
  const V = V4_ADRESSES[Number(chaine)];
  if (!V) return { etat: 'REFUSE', pourquoi: 'this network has no Uniswap v4 addresses here' };
  if (!ADRESSE.test(String(jeton || ''))) return { etat: 'REFUSE', pourquoi: 'the block is not an address' };
  if (!ADRESSE.test(String(compte || ''))) return { etat: 'REFUSE', pourquoi: 'connect your wallet first' };
  const classement = classementValoLancement(valorisationEth);
  if (classement.etat === 'ILLISIBLE') return { etat: 'REFUSE', pourquoi: 'the valuation must be a positive number of ETH' };
  const valo = Number(valorisationEth);

  /* ── lectures ── */
  let supply, dec, solde, s0;
  const cle = cleDePool(ETH_NATIF, jeton, { fee: FEE_POOL, tickSpacing: TICK_SPACING_POOL });
  const blockEst1 = String(cle.currency1).toLowerCase() === String(jeton).toLowerCase();
  try {
    supply = BigInt(await lireAppel(rpc, jeton, '0x' + selecteur('totalSupply()')));
    dec = Number(BigInt(await lireAppel(rpc, jeton, '0x' + selecteur('decimals()'))));
    solde = BigInt(await lireAppel(rpc, jeton, '0x' + selecteur('balanceOf(address)') + pad(compte)));
    s0 = await lireAppel(rpc, V.stateView, '0x' + selecteur('getSlot0(bytes32)') + poolId(cle).slice(2));
  } catch (e) {
    return { etat: 'NON_MESURE', pourquoi: 'the block or its pool could not be read: ' + String((e && e.message) || e) };
  }
  if (!Number.isInteger(dec) || dec < 0 || dec > 36) return { etat: 'NON_MESURE', pourquoi: 'decimals out of range' };
  if (solde === 0n) return { etat: 'REFUSE', pourquoi: 'this account holds none of this block' };
  const entiere = supply / 10n ** BigInt(dec);
  const sqrtExistant = BigInt('0x' + String(s0).slice(2, 66));
  const tickCourant = sqrtExistant === 0n ? null : Number(BigInt.asIntN(24, BigInt('0x' + String(s0).slice(66, 130))));

  /* ── prix, plage, liquidite ── */
  const p = parametresLancement({ supply: entiere, valorisationEth: valo, espacement: TICK_SPACING_POOL, tickCourant });
  if (p.etat !== 'OK') return { etat: 'REFUSE', pourquoi: p.pourquoi };
  const sqrtVise = sqrtExistant !== 0n ? sqrtExistant
    : sqrtPriceDepuisPrix({ prixNum: BigInt(Math.round(valo * 1e6)), prixDen: entiere * 1000000n,
      decDevise: 18, decBlock: dec, deviseEst0: blockEst1 });
  const sqA = sqrtDeTick(p.tickBas), sqB = sqrtDeTick(p.tickHaut);
  const aPlacer = (solde * MARGE_POUR_MILLE) / 1000n;
  const L = liquiditeUnilaterale({ montant: aPlacer, cote: blockEst1 ? 1 : 0, sqrtMin: sqA, sqrtMax: sqB });
  if (!L) return { etat: 'REFUSE', pourquoi: 'no liquidity is computable for this range' };
  const m = montantsPosition(L, sqrtVise, sqA, sqB);
  const ethRequis = blockEst1 ? m.montant0 : m.montant1;
  const blocksRequis = blockEst1 ? m.montant1 : m.montant0;
  /* ⛔ TROIS REFUS, AUCUN REDONDANT — repris tels quels de l ecran qui a marche. */
  if (ethRequis !== 0n) return { etat: 'REFUSE', pourquoi: 'the range is on the wrong side of the price — it would ask for ETH' };
  if (blocksRequis === 0n) return { etat: 'REFUSE', pourquoi: 'this would place nothing at all' };
  if (blocksRequis > solde) return { etat: 'REFUSE', pourquoi: 'it would place more blocks than you hold' };

  const base = { cle, blockEst1, supply, dec, solde, entiere, poolExiste: sqrtExistant !== 0n, tickCourant,
    p, sqrtVise, L, blocksRequis, ethRequis, resteAuCreateur: solde - blocksRequis, classement, V };

  /* ── autorisations Permit2, MESUREES ── */
  let okP2 = null, okPosm = null;
  try {
    const all = BigInt(await lireAppel(rpc, jeton, '0x' + selecteur('allowance(address,address)') + pad(compte) + pad(PERMIT2)));
    okP2 = all > 0n;
  } catch (e) { okP2 = null; }
  try {
    const raw = await lireAppel(rpc, PERMIT2, '0x' + selecteur('allowance(address,address,address)')
      + pad(compte) + pad(jeton) + pad(V.posm));
    let montant = BigInt('0x' + String(raw).slice(2, 66));
    const expiration = BigInt('0x' + String(raw).slice(66, 130));
    /* ⛔ UNE EXPIRATION PASSEE VAUT ZERO, meme si le montant est positif. */
    if (montant > 0n && expiration > 0n && expiration < BigInt(Math.floor(maintenant / 1000))) montant = 0n;
    okPosm = montant > 0n;
  } catch (e) { okPosm = null; }

  if (okP2 === null || okPosm === null) {
    return { ...base, etat: 'NON_MESURE', etapes: [],
      pourquoi: 'an approval could not be read — nothing is offered to sign until it is measured' };
  }
  const etapes = [];
  if (!okP2) etapes.push({ nom: 'Allow Permit2 to move this block', to: jeton, data: encodeApprove(PERMIT2, MAX_UINT256), value: '0x0' });
  if (!okPosm) etapes.push({ nom: 'Allow the Uniswap position manager (through Permit2)', to: PERMIT2,
    data: encodePermit2Approve(jeton, V.posm, MAX_UINT160, MAX_UINT48), value: '0x0' });

  /* ── la transaction de lancement : UNE seule, atomique ── */
  const mint = encodeMintPosition({ cle, tickBas: p.tickBas, tickHaut: p.tickHaut, liquidite: L,
    max0: blockEst1 ? 0n : (blocksRequis * 102n) / 100n,
    max1: blockEst1 ? (blocksRequis * 102n) / 100n : 0n,
    /* ⛔⛔ LE PROPRIETAIRE DE LA POSITION EST L ADRESSE MORTE, PAS LE COMPTE : c est ce qui rend la pool
     * permanente. Le compte PAIE (via Permit2), mais ne possede pas la position — il ne pourra ni
     * retirer ni collecter, et personne d autre non plus. */
    proprietaire: PROPRIETAIRE_PERMANENT, deadline: BigInt(Math.floor(maintenant / 1000) + DELAI_S) });
  const donnee = sqrtExistant !== 0n ? mint : encodeMulticall([encodeInitializePool(cle, sqrtVise), mint]);
  const tx = { to: V.posm, data: donnee, value: '0x0' };

  return { ...base, etat: etapes.length ? 'APPROBATIONS' : 'PRET', etapes, tx,
    permanente: true, proprietairePosition: PROPRIETAIRE_PERMANENT,
    approbationsIllimitees: 'Permit2 gets an unlimited allowance for this block (MAX_UINT256), and the position '
      + 'manager an unlimited Permit2 allowance (MAX_UINT160) — both until you revoke them.' };
}

/**
 * Demande a la chaine d executer la transaction de lancement, SANS l envoyer.
 * ⛔ FAIL-CLOSED : « je n ai pas pu verifier » n est jamais « c est accepte ».
 */
export async function simulerLancement({ rpc, compte, tx }) {
  let sim;
  try {
    sim = await rpc('eth_simulateV1', [{ blockStateCalls: [{ calls: [{ from: compte, to: tx.to, data: tx.data }] }],
      validation: false, traceTransfers: false }, 'latest']);
  } catch (e) {
    return { etat: 'NON_MESURE', pourquoi: 'the chain was not asked: ' + String((e && e.message) || e) };
  }
  const appels = (sim && sim[0] && sim[0].calls) || [];
  if (appels.length < 1) return { etat: 'NON_MESURE', pourquoi: 'the node returned no result for the launch' };
  if (appels[0].status !== '0x1') {
    const err = appels[0].error || {};
    return { etat: 'REFUSE', pourquoi: String(err.message || 'the chain refuses this launch'), donnees: err.data || null };
  }
  return { etat: 'ACCEPTE', gasUtilise: appels[0].gasUsed ? BigInt(appels[0].gasUsed) : null };
}
