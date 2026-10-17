// ajouter-paire.js — AJOUTER UNE SECONDE PAIRE a un block deja ne : block/ETH reste, block/<action> s ouvre a cote, sur le hook 7030.
// ================================================================================================
// ⛔⛔ POURQUOI « AJOUTER » ET JAMAIS « DEPLACER » (mesure 2026-10-17) : la position de naissance appartient a 0x…dEaD ; personne
//    ne peut la retirer, donc block/ETH ne peut pas devenir block/AAPLc sur place. La seule voie est d OUVRIR une seconde pool.
//    Le hook verifie « deja ouverte » PAR POOL (DejaOuverte sur le slot0 de la nouvelle cle), pas par block : sur fork, l inscription
//    UNIT/AAPLc du createur passe pour 0,001 ETH.
// ⛔ AUCUNE SIGNATURE, AUCUN ENVOI : le plan rend des appels non signes (to, data, value), dans l ordre, a mettre dans UN lot
//    (wallet_sendCalls) — c est le wallet de la personne qui signe.
// ⛔ CE QUI EST REPRIS, PAS RECOPIE : l inscription payee + la caution du createur (lancer-pool-v2.js `completerInscriptionPayee`,
//    qui LIT le frais au hook), la cle de naissance (frais LP 0, espacement 200, position a 0x…dEaD — lancer-pool.js), les
//    autorisations Permit2 au montant exact (approbations-exactes.js), le multicall initialize + mint (pool.js), la simulation de la
//    sequence entiere avant de rien demander (lancer-pool.js `simulerSequenceLancement`), le plancher de caution et la liste des
//    devises du hook (hook-7030-descripteur.js), la regle du minimum de l app (paires.js `minimumCautionCreateur`).
// ⛔ CE QUI EST NEUF, ET POURQUOI : le PRIX DE DEPART. Une naissance le derive d une valorisation choisie ; ici il est DERIVE DU
//    MARCHE EXISTANT du block (slot0 de block/ETH sur nos hooks de naissance) x ETH/USD (mediane de pools, prix-eth.js) / prix de
//    l action (reference Chainlink, reference-action.js). Aucune lecture -> aucun prix : REFUSE / NON_MESURE, jamais une supposition.
//    Et la position est A DEUX COTES (le depot de devise du createur + les blocks qui l equilibrent, pleine etendue) au prix EXACT
//    choisi : le hook exige que l initialize soit au prix inscrit A L UNITE PRES (PrixDifferent), donc la liquidite est calculee AU prix
//    vise (pool.js liquiditeBilaterale / montantsPosition), au lieu de deriver le prix des montants (mathsNaissanceInstantanee, ETH seul).
// ⛔ DRAPEAU AJOUTER_PAIRE_ACTIF = false : RIEN n est montre a l ecran tant qu il est eteint. Le planificateur reste appelable (banc fork).
import { selecteur, cleDePool, poolId, encodeMintPosition, encodeInitializePool, encodeMulticall, isqrt, liquiditeBilaterale,
  montantsPosition, SQRT_MIN, SQRT_MAX } from './pool.js';
import { V4_ADRESSES, PERMIT2, FEE_POOL, TICK_SPACING_POOL, PROPRIETAIRE_PERMANENT, DELAI_S, ETH_NATIF, sqrtDeTick,
  simulerSequenceLancement } from './lancer-pool.js';
import { tickMinAligne, tickMaxAligne } from './lancement.js';
import { completerInscriptionPayee, estEtapeInscription } from './lancer-pool-v2.js';
import { etapesPermit2Exactes } from './approbations-exactes.js';
import { HOOK_7030, HOOK_V8, estHook7030, hook7030Deploye } from './tokenomics.js';
import { DESCRIPTEUR_7030, plancher7030 } from './hook-7030-descripteur.js';
import { hookDeLancementPour, minimumCautionCreateur } from './paires.js';
import { REFUS_FRAIS_HOOK_EN_BLOCK, fraisHookEnBlock, MESSAGE_PAS_ICI } from './pool-sans-hook.js';
import { FRAIS_OUVERTURE_WEI } from './frais-creation.js';
import { lireReferenceAction, FEEDS_CHAINLINK } from './reference-action.js';
import { prixEthUsd } from './prix-eth.js';
import { symboleDepuisReponse } from './texte-onchain.js';

/** ALLUME le 2026-10-17 soir : les DEUX conditions sont reunies — banc fork entierement vert sur le HEAD du jour (48/48, base-anvil,
 *  vrai hook 7030 : UNIT/AAPLc ouverte a cote de UNIT/ETH intacte, 0,001 ETH a a6cf une fois, achat en AAPLc -> 7 bps a a6cf + 3 bps au
 *  createur, reprise au prix inscrit sans second frais) ET la decision de Phil au chat (« unit/eth est vivant … pour faire les multipools …
 *  t'as mis standby continue »). Le plan ne signe toujours rien : le wallet du createur signe le lot. */
export const AJOUTER_PAIRE_ACTIF = true;
export const ETATS_AJOUT = Object.freeze(['PRET', 'APPROBATIONS', 'REFUSE', 'NON_MESURE']);
/** Les hooks de naissance dont le marche block/ETH sert de prix (frais LP 0, espacement 200 — la cle de toute naissance). */
export const HOOKS_MARCHE_EXISTANT = Object.freeze([HOOK_7030, HOOK_V8]);
/** Fraicheurs de reference Chainlink acceptees pour fixer un prix PERMANENT (reference-action.js `fraicheurReference`). */
export const FRAICHEURS_ACCEPTEES = Object.freeze(['A_JOUR', 'DERNIERE_VALEUR']);
/** Ce que l ecran propose : les devises du hook 7030 qui ont une reference Chainlink (sans elle, le plan REFUSE : prix jamais devine). */
export const DEVISES_AJOUTABLES = Object.freeze(DESCRIPTEUR_7030.devises
  .filter((d) => d.sym !== 'ETH' && FEEDS_CHAINLINK.has(d.adresse))
  .map((d) => Object.freeze({ adresse: d.adresse, sym: d.sym, decimales: d.decimales })));

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;
const bas = (a) => String(a || '').toLowerCase();
const pad = (a) => bas(a).slice(2).padStart(64, '0');
const Q192 = 1n << 192n;

/** Des unites brutes en texte lisible (sans zeros de queue). */
export function texteUnites(brut, dec, chiffres = 8) {
  const b = BigInt(brut), d = Number(dec);
  const s = b.toString().padStart(d + 1, '0');
  const ent = s.slice(0, s.length - d), frac = s.slice(s.length - d).slice(0, chiffres).replace(/0+$/, '');
  return Number(ent).toLocaleString('en-US') + (frac ? '.' + frac : '');
}

/**
 * LE PRIX DE DEPART de la nouvelle paire, en entiers, depuis trois LECTURES :
 *   - sqrtBlocEth : slot0 de block/ETH (ETH = currency0 toujours : adresse 0) -> blocks bruts par wei = S^2 / 2^192 ;
 *   - ethUsdE6    : le prix d 1 ETH en micro-dollars (mediane de pools, prix-eth.js) ;
 *   - refReponse / refDecimales : le prix d UN jeton de l action en dollars (Chainlink, multiplicateur deja compris).
 * wei par unite brute de devise = ref * 1e18 * 1e6 / (10^refDec * ethE6 * 10^decDevise).
 * Rend { num, den } (blocks bruts par unite brute de devise = num / den) et sqrtCible (sqrtPriceX96 de la NOUVELLE cle), ou null.
 */
export function prixDeLaNouvellePaire({ sqrtBlocEth, ethUsdE6, refReponse, refDecimales, decDevise, blockEst0 }) {
  let S, e, r, rd, dd;
  try { S = BigInt(sqrtBlocEth); e = BigInt(ethUsdE6); r = BigInt(refReponse); rd = BigInt(refDecimales); dd = BigInt(decDevise); } catch { return null; }
  if (S <= 0n || e <= 0n || r <= 0n || rd < 0n || rd > 36n || dd < 0n || dd > 36n) return null;
  const num = S * S * r * 10n ** 24n;
  const den = Q192 * 10n ** rd * e * 10n ** dd;
  /* nouvelle cle : ratio = currency1 / currency0 en unites brutes. block = currency0 -> devise par block = den / num. */
  const sqrtCible = blockEst0 ? isqrt((den << 192n) / num) : isqrt((num << 192n) / den);
  if (sqrtCible <= SQRT_MIN || sqrtCible >= SQRT_MAX) return null;
  return { num, den, sqrtCible };
}

/** Blocks bruts qui equilibrent `montantDevise` unites brutes de devise au prix sqrt (de la nouvelle cle). */
export function blocsPourDevise({ montantDevise, sqrtPriceX96, blockEst0 }) {
  const m = BigInt(montantDevise), s = BigInt(sqrtPriceX96);
  if (m <= 0n || s <= 0n) return 0n;
  return blockEst0 ? (m * Q192) / (s * s) : (m * s * s) / Q192;
}

/**
 * Le plan qui ouvre block/<devise> a cote de block/ETH, en UN lot d appels non signes.
 * @param {object} o
 * @param {(m:string,p:any[])=>Promise<any>} o.rpc  lecteur JSON-RPC (Base mainnet, ou un fork)
 * @param {string} o.compte         le createur (admin du block) qui signera
 * @param {string} o.block          le block (B20) deja ne
 * @param {string} o.devise         l action appariee (une des 62 devises du hook 7030)
 * @param {bigint} o.montantDevise  unites brutes de devise que le createur DEPOSE dans la position (+ les blocks qui l equilibrent)
 * @returns {Promise<object>} etat ∈ PRET | APPROBATIONS | REFUSE | NON_MESURE ; `appels` (le lot, dans l ordre), `pourquoi`, `cout`
 */
export async function planAjouterPaire({ rpc, chaine = 8453, compte, block, devise, montantDevise, maintenant = Date.now(),
  fraisWei = FRAIS_OUVERTURE_WEI, simuler = true }) {
  const refus = (pourquoi, x = {}) => ({ etat: 'REFUSE', appels: [], etapes: [], pourquoi, ...x });
  const nonMesure = (pourquoi, x = {}) => ({ etat: 'NON_MESURE', appels: [], etapes: [], pourquoi: pourquoi + ' — nothing was asked', ...x });
  if (Number(chaine) !== 8453) return refus('a second pair on our hook exists on Base mainnet only');
  if (typeof rpc !== 'function') return nonMesure('no chain reader');
  if (!ADRESSE.test(String(compte || ''))) return refus('connect your wallet first');
  if (!ADRESSE.test(String(block || ''))) return refus('the block is not an address');
  if (!ADRESSE.test(String(devise || ''))) return refus('the currency is not an address');
  if (typeof montantDevise !== 'bigint' || montantDevise <= 0n) return refus('say how much of the currency you put in the new pool (raw units, more than 0)');
  const H = HOOK_7030;
  if (!estHook7030(H)) return refus('the 7030 hook is switched off in this app');
  const dv = bas(devise), bl = bas(block);
  if (dv === bas(ETH_NATIF)) return refus('ETH is already the pair this block was born with — pick a stock to add next to it');
  if (dv === bl) return refus('a block cannot be paired with itself');
  /* ⛔ LA LISTE DU HOOK EST FIXE (aucun setter) : une devise hors liste reverterait PaireNonAdmise apres signature. Meme source que Create. */
  const desc = DESCRIPTEUR_7030.devises.find((d) => d.adresse === dv) || null;
  if (plancher7030(dv) === null || !desc || hookDeLancementPour(dv, 8453, { h7030: true }) !== '7030') {
    return refus('our hook does not accept this currency: its list of ' + (DESCRIPTEUR_7030.devises.length - 1) + ' currencies is fixed in the contract and cannot be changed');
  }
  if (bl.startsWith('0xb2') && DESCRIPTEUR_7030.devises.some((d) => d.adresse === bl)) return refus('two listed currencies cannot be paired together on this hook (one side must be your block)');
  const cle = cleDePool(dv, bl, { fee: FEE_POOL, tickSpacing: TICK_SPACING_POOL, hooks: H });
  const blockEst0 = bas(cle.currency0) === bl, blockEst1 = !blockEst0;
  if (REFUS_FRAIS_HOOK_EN_BLOCK && ['ACHAT', 'VENTE'].some((sens) => fraisHookEnBlock(cle, bl, sens,
    sens === 'ACHAT' ? bas(cle.currency0) !== bl : bas(cle.currency0) === bl))) {
    return refus(MESSAGE_PAS_ICI, { refusFraisEnBlock: true });
  }
  const V = V4_ADRESSES[8453];
  const id = poolId(cle);
  const lire = async (to, data) => {
    const r = await rpc('eth_call', [{ to, data }, 'latest']);
    if (typeof r !== 'string' || r === '0x' || !/^0x[0-9a-fA-F]*$/.test(r)) throw new Error('empty answer from ' + to);
    return r;
  };
  const u = (h) => BigInt('0x' + String(h).slice(2, 66));
  const base = { cle, poolId: id, hook: H, blockEst0, devise: dv, block: bl, symboleDevise: desc.sym };

  /* ── 1. le hook est la, et la nouvelle pool n existe pas encore ── */
  const etatHook = await hook7030Deploye({ rpc });
  if (etatHook === 'ABSENT') return refus('our hook has no code on this network', base);
  if (etatHook !== 'DEPLOYE') return nonMesure('the hook code could not be read', base);
  let sqrtNouvelle;
  try { sqrtNouvelle = u(await lire(V.stateView, '0x' + selecteur('getSlot0(bytes32)') + id.slice(2))); }
  catch { return nonMesure('the new pool could not be read', base); }
  if (sqrtNouvelle !== 0n) return refus('this pair is already open — use Buy, Sell or Add liquidity on it', { ...base, poolExiste: true });

  /* ── 2. le marche EXISTANT du block (son prix), sur nos hooks de naissance ── */
  let marche = null;
  try {
    for (const h of HOOKS_MARCHE_EXISTANT) {
      const k = cleDePool(ETH_NATIF, bl, { fee: FEE_POOL, tickSpacing: TICK_SPACING_POOL, hooks: h });
      const s = u(await lire(V.stateView, '0x' + selecteur('getSlot0(bytes32)') + poolId(k).slice(2)));
      if (s !== 0n) { marche = { cle: k, poolId: poolId(k), hook: h, sqrtPriceX96: s }; break; }
    }
  } catch { return nonMesure('the price of this block\'s ETH market could not be read', base); }
  if (!marche) return refus('this block has no ETH market on our hooks to take its price from — the new pool\'s starting price would be a guess, so nothing is offered', base);

  /* les deux prix (ETH/USD, l action) partent maintenant, en parallele des lectures du 3 ; ni l un ni l autre ne jette (etats) */
  const enVolEth = prixEthUsd({ rpc, stateView: V.stateView });
  const enVolRef = lireReferenceAction({ rpc, jeton: dv, maintenantSec: Math.floor(maintenant / 1000) });

  /* ── 3. droits, soldes, decimales — lus ── */
  let admin, label, decDevise, decBlock, soldeBlock, soldeDevise, soldeEth, symboleBlock = null, delaiRetrait = null, prixInscrit = 0n, inscrit = null, payee = false, cautionne = false;
  try {
    /* en parallele (11 lectures independantes) : dans l app, en serie, le plan prenait plus d une minute (mesure, fork) ; une seule
     *   lecture ratee fait toujours tout rater -> NON_MESURE */
    const r = await Promise.all([
      lire(H, '0x' + selecteur('estAdminDuBlock(address,address)') + pad(bl) + pad(compte)),
      lire(H, '0x' + selecteur('porteLeLabel(address)') + pad(bl)),
      lire(dv, '0x' + selecteur('decimals()')),
      lire(bl, '0x' + selecteur('decimals()')),
      lire(bl, '0x' + selecteur('balanceOf(address)') + pad(compte)),
      lire(dv, '0x' + selecteur('balanceOf(address)') + pad(compte)),
      rpc('eth_getBalance', [compte, 'latest']),
      lire(H, '0x' + selecteur('payee(bytes32)') + id.slice(2)),
      lire(H, '0x' + selecteur('inscrit(bytes32)') + id.slice(2)),
      lire(H, '0x' + selecteur('prixInscrit(bytes32)') + id.slice(2)),
      lire(H, '0x' + selecteur('createurs(bytes32)') + id.slice(2)),
    ]);
    admin = u(r[0]) === 1n;
    label = u(r[1]) === 1n;
    decDevise = Number(u(r[2]));
    decBlock = Number(u(r[3]));
    soldeBlock = u(r[4]);
    soldeDevise = u(r[5]);
    soldeEth = BigInt(r[6]);
    payee = u(r[7]) !== 0n;
    inscrit = '0x' + String(r[8]).slice(26, 66);
    prixInscrit = u(r[9]);
    cautionne = !/^0x0{40}$/.test('0x' + String(r[10]).slice(26, 66));
  } catch { return nonMesure('your rights on this block, your balances or the currency could not be read', base); }
  /* le symbole, par LE decodeur de chaine du depot (UTF-8, invisibles retires) — jamais un octet = un caractere */
  try { symboleBlock = symboleDepuisReponse(await lire(bl, '0x' + selecteur('symbol()'))); } catch { symboleBlock = null; }
  try { delaiRetrait = Number(u(await lire(H, '0x' + selecteur('DELAI_RETRAIT()')))); } catch { delaiRetrait = null; }
  if (!admin) return refus('only the block\'s admin can open a pair for it on our hook', base);
  if (!label) return refus('our hook does not see this block\'s engraved face, so it would refuse the registration', base);
  if (![decDevise, decBlock].every((d) => Number.isInteger(d) && d >= 0 && d <= 36)) return nonMesure('decimals out of range', base);
  if (decDevise !== desc.decimales) return refus('the currency\'s decimals on chain do not match the hook\'s list', base);
  const nomBlock = symboleBlock || 'the block';

  /* ── 4. le prix : ETH/USD (mediane de pools) et l action (Chainlink) — lus, sinon rien ── */
  const ethUsd = await enVolEth;
  if (ethUsd.etat !== 'LU') return nonMesure('the ETH price could not be agreed (' + (ethUsd.pourquoi || ethUsd.etat) + ')', base);
  const ethUsdE6 = BigInt(Math.round(ethUsd.usd * 1e6));
  const lu = await enVolRef;
  const ref = lu && lu.reference;
  if (!ref || ref.etat === 'NON_DISPONIBLE') return refus('no published reference price for ' + desc.sym + ' (Chainlink) — the starting price would be a guess, so nothing is offered', base);
  if (ref.etat !== 'LU') return nonMesure('the ' + desc.sym + ' reference price could not be read', base);
  if (!FRAICHEURS_ACCEPTEES.includes(ref.fraicheur)) return refus('the ' + desc.sym + ' reference price is ' + (ref.fraicheur === 'FIGE_PAUSE' ? 'frozen for a corporate action' : 'stale') + ' — a permanent pool is not priced on it', base);
  const pr = prixDeLaNouvellePaire({ sqrtBlocEth: marche.sqrtPriceX96, ethUsdE6, refReponse: ref.reponse, refDecimales: ref.decimales, decDevise, blockEst0 });
  if (!pr) return refus('the starting price is out of the range a pool can hold', base);

  /* ⛔ DEJA INSCRITE PAR TOI (un lot coupe en deux, par ex.) : le hook n acceptera l initialize QU AU prix inscrit. On termine a ce prix,
   *   on ne le recalcule pas. Inscrite par un autre : refus. */
  const moi = bas(compte);
  let sqrtVise = pr.sqrtCible, repriseInscription = false;
  if (payee && bas(inscrit) === moi && prixInscrit > 0n) { sqrtVise = prixInscrit; repriseInscription = true; }
  else if (!/^0x0{40}$/.test(String(inscrit)) && bas(inscrit) !== moi) return refus('another admin already registered this pair', base);

  /* ── 5. la position : deux cotes, pleine etendue, AU prix vise ── */
  const tickBas = tickMinAligne(TICK_SPACING_POOL), tickHaut = tickMaxAligne(TICK_SPACING_POOL);
  const sqA = sqrtDeTick(tickBas), sqB = sqrtDeTick(tickHaut);
  if (!(sqrtVise > sqA && sqrtVise < sqB)) return refus('the starting price is outside the pool\'s full range', base);
  const aPlacer = blocsPourDevise({ montantDevise, sqrtPriceX96: sqrtVise, blockEst0 });
  if (aPlacer <= 0n) return refus('this deposit is too small to be matched by any block', base);
  const L = liquiditeBilaterale({ montant0: blockEst0 ? aPlacer : montantDevise, montant1: blockEst0 ? montantDevise : aPlacer, sqrtP: sqrtVise, sqrtMin: sqA, sqrtMax: sqB });
  if (!L) return refus('no liquidity is computable for this deposit', base);
  const m = montantsPosition(L, sqrtVise, sqA, sqB);
  if (m.regime !== 'DANS_LA_PLAGE') return refus('the position would not hold both sides', base);
  const depotDevise = blockEst0 ? m.montant1 : m.montant0, depotBlock = blockEst0 ? m.montant0 : m.montant1;
  if (depotDevise === 0n || depotBlock === 0n) return refus('this deposit is too small to place anything on both sides', base);
  if (depotDevise > montantDevise) return refus('the position would take more of the currency than you offered', base);

  /* ── 6. le minimum du createur (caution) : max(1 $ du jour, plancher du hook) — la regle de l ecran ── */
  const minimumApp = minimumCautionCreateur({ prixUsd: ref.prixUsd, decimales: decDevise });
  if (minimumApp === null || minimumApp === undefined) return nonMesure('the creator minimum could not be worked out', base);
  const plancher = plancher7030(dv);
  const minimum = plancher > BigInt(minimumApp) ? plancher : BigInt(minimumApp);
  /* deja cautionnee (par toi : sinon refus plus haut) -> le hook ne reprend pas de caution ; deja payee -> pas de second frais */
  const cautionDue = cautionne ? 0n : minimum;

  /* ── 7. assez de fonds ? (on le dit avec les chiffres, avant toute signature) ── */
  if (soldeBlock < depotBlock + 1n) return refus('you hold ' + texteUnites(soldeBlock, decBlock) + ' ' + nomBlock + '; this deposit needs ' + texteUnites(depotBlock + 1n, decBlock) + ' ' + nomBlock + ' next to it — put in less ' + desc.sym, base);
  if (soldeDevise < depotDevise + 1n + cautionDue) return refus('you hold ' + texteUnites(soldeDevise, decDevise) + ' ' + desc.sym + '; this needs ' + texteUnites(depotDevise + 1n + cautionDue, decDevise) + ' (deposit + creator minimum)', base);
  if (!payee && soldeEth < fraisWei) return refus('you need at least 0.001 ETH for the birth fee (plus network gas)', base);

  /* ── 8. autorisations Permit2 au montant exact, pour les DEUX jetons du mint ── */
  const plafond = (requis, dispo) => { const c = (requis * 102n) / 100n; return c < dispo ? c : dispo; };
  const capBlock = plafond(depotBlock, soldeBlock), capDevise = plafond(depotDevise, soldeDevise - cautionDue);
  const t = Math.floor(maintenant / 1000);
  const etapes = [];
  for (const [jeton, cap, libelle] of [[bl, capBlock, nomBlock], [dv, capDevise, desc.sym]]) {
    let okP2, okR;
    try {
      okP2 = u(await lire(jeton, '0x' + selecteur('allowance(address,address)') + pad(compte) + pad(PERMIT2))) >= cap;
      const r = await lire(PERMIT2, '0x' + selecteur('allowance(address,address,address)') + pad(compte) + pad(jeton) + pad(V.posm));
      okR = BigInt('0x' + r.slice(2, 66)) >= cap && BigInt('0x' + r.slice(66, 130)) >= BigInt(t + 300);
    } catch { return nonMesure('an approval could not be read', base); }
    const ap = etapesPermit2Exactes({ jeton, permit2: PERMIT2, routeur: V.posm, montant: cap, maintenantSec: t, okP2, okR,
      libelleJeton: libelle, libelleRouteur: 'the Uniswap position manager' });
    if (ap.etat !== 'OK') return refus(ap.pourquoi, base);
    /* deux jetons, deux etapes Permit2 -> position manager : chacune dit DE QUEL jeton elle parle */
    etapes.push(...ap.etapes.map((e) => (bas(e.to) === bas(PERMIT2) ? { ...e, nom: e.nom.replace('this amount', 'this amount of ' + libelle) } : e)));
  }

  /* ── 9. initialize + mint en UNE transaction (multicall du PositionManager), position a 0x…dEaD ── */
  const mint = encodeMintPosition({ cle, tickBas, tickHaut, liquidite: L, max0: blockEst0 ? capBlock : capDevise, max1: blockEst0 ? capDevise : capBlock,
    proprietaire: PROPRIETAIRE_PERMANENT, deadline: BigInt(t + DELAI_S) });
  const tx = { nom: 'Open ' + nomBlock + '/' + desc.sym + ' and place your deposit (for good)', to: V.posm,
    data: encodeMulticall([encodeInitializePool(cle, sqrtVise), mint]), value: '0x0' };

  /* ── 10. l inscription payee + la caution, DICTEES PAR LE HOOK (la fonction de la naissance, telle quelle) ── */
  const plan0 = { etat: etapes.length ? 'APPROBATIONS' : 'PRET', etapes, tx, cle, sqrtVise, poolExiste: false };
  const plan = await completerInscriptionPayee({ rpc, plan: plan0, compte, fraisWei, hook: H, caution: { minimum, devise: dv } });
  if (plan.etat !== 'PRET' && plan.etat !== 'APPROBATIONS') return { ...base, ...plan, appels: [], etapes: [] };
  const ins = (plan.etapes || []).find((e) => estEtapeInscription(e.data)) || null;
  if (ins && ins.payant && (typeof ins.du !== 'bigint' || BigInt(ins.value) !== ins.du)) {
    return refus('the birth fee read on the hook (' + String(ins.du) + ' wei) is not what the call would pay — nothing was asked', base);
  }
  const fraisNaissanceWei = ins && ins.payant ? BigInt(ins.value) : 0n;
  const etapesFinales = (plan.etapes || []).map((e) => ({ ...e, nom: e.nom || 'step' }));
  const appels = [...etapesFinales, tx];

  /* ── 11. le prix et le cout, dits en clair ── */
  const prixBlocEnDevise = Number(sqrtVise) ** 2 / 2 ** 192; /* affichage seulement */
  const unBlocEnDevise = (blockEst0 ? prixBlocEnDevise : 1 / prixBlocEnDevise) * 10 ** (decBlock - decDevise);
  const unBlocEnEth = (Number(marche.sqrtPriceX96) ** 2 / 2 ** 192) ** -1 * 10 ** (decBlock - 18);
  const jours = delaiRetrait ? Math.round(delaiRetrait / 86400) : null;
  const cout = {
    fraisNaissanceWei,
    caution: { montant: cautionDue, devise: dv, decimales: decDevise, retour: 'yours: held by the hook; ask for it back, then take it ' + (jours ? jours + ' days' : 'after the hook\'s notice period') + ' later (your 0.03 % share stops when you ask)' },
    depotDevise, depotBlock, permanent: true, proprietairePosition: PROPRIETAIRE_PERMANENT,
    gas: 'network gas is extra (not counted here)',
  };
  const prix = { sqrtVise, sqrtCible: pr.sqrtCible, repriseInscription, marcheExistant: { hook: marche.hook, poolId: marche.poolId, sqrtPriceX96: marche.sqrtPriceX96, unBlocEnEth },
    ethUsd: ethUsd.usd, ethUsdE6: ethUsdE6.toString(), reference: { feed: ref.feed, reponse: ref.reponse, decimales: ref.decimales, prixUsd: ref.prixUsd, majA: ref.majA, fraicheur: ref.fraicheur },
    unBlocEnDevise };
  const phraseCout = (fraisNaissanceWei > 0n ? texteUnites(fraisNaissanceWei, 18) + ' ETH (birth fee, to the fee wallet) + ' : '')
    + (cautionDue > 0n ? texteUnites(cautionDue, decDevise) + ' ' + desc.sym + ' creator minimum (stays yours in the hook; ask for it back and wait ' + (jours ? jours + ' days' : 'the hook\'s notice period') + ') + ' : '')
    + texteUnites(depotDevise, decDevise) + ' ' + desc.sym + ' and ' + texteUnites(depotBlock, decBlock) + ' ' + nomBlock
    + ' placed in the pool for good (the position belongs to 0x…dEaD: nobody can take it out). Network gas is extra.';
  const phrasePrix = 'Starting price 1 ' + nomBlock + ' = ' + unBlocEnDevise.toPrecision(4) + ' ' + desc.sym
    + (repriseInscription ? ' — the price you already registered on the hook' : ', from ' + nomBlock + '/ETH (1 ' + nomBlock + ' = ' + unBlocEnEth.toPrecision(4) + ' ETH), ETH at $'
      + ethUsd.usd.toFixed(2) + ' and ' + desc.sym + ' at $' + Number(ref.prixUsd).toFixed(2) + ' (Chainlink, ' + (ref.fraicheur === 'A_JOUR' ? 'current' : 'last value while markets are closed') + ')') + '.';

  /* ── 12. la sequence ENTIERE est-elle acceptee par la chaine, dans l ordre, depuis ce compte ? ── */
  let simulation = null;
  if (simuler) {
    simulation = await simulerSequenceLancement({ rpc, compte, appels });
    if (simulation.etat === 'NON_MESURE') return nonMesure('the chain could not check the whole batch (' + simulation.pourquoi + ')', { ...base, prix, cout, simulation });
    if (simulation.etat !== 'ACCEPTE') {
      return refus('the chain would refuse this batch: ' + String(simulation.pourquoi || 'refused').slice(0, 200) + ' — nothing was asked', { ...base, prix, cout, simulation });
    }
  }
  const etat = appels.length > 1 ? 'APPROBATIONS' : 'PRET';
  return {
    ...base, etat, appels, etapes: etapesFinales, tx, sqrtVise, L, tickBas, tickHaut, plafonds: { block: capBlock, devise: capDevise },
    caution: cautionDue, inscriptionPayee: !!plan.inscriptionPayee, prix, cout, simulation,
    pourquoi: (etat === 'PRET' ? 'Ready: ' : 'Ready in one batch of ' + appels.length + ' calls: ') + 'open ' + nomBlock + '/' + desc.sym + ' next to ' + nomBlock
      + '/ETH, which stays as it is. ' + phrasePrix + ' It costs ' + phraseCout + (simulation ? ' The whole batch was checked on chain before anything is asked.' : ' (not simulated)'),
  };
}
