/* liquidite-actions.js — OU ACHETER ET VENDRE CHAQUE ACTION TOKENISEE : TOUS LES LIEUX ATTEIGNABLES, COTES, ET LE MEILLEUR (2026-10-25).
 *
 * ⛔⛔ POURQUOI. Un post public cite RDDTc : sous-jacent ~590 $, devis de vente ~0,20 $ sur Aerodrome, ~150 $ sur Uniswap. Une action
 *   tokenisee peut avoir TROIS lieux d echange sur Base, et ils ne se ressemblent pas :
 *     - 'aero-old'   : la factory CL 0xf8f2…61ef, celle de NOTRE routeur 0x698c…a92f (factory() lue) ; quoter 0x514c…9259 ;
 *     - 'aero-new'   : la factory CL 0x9cb2…7a76 (dexId DexScreener « aero »), ou vit la profondeur de la plupart des actions ;
 *                      notre routeur ne l adresse pas. Son routeur est ROUTEUR_AERO_NOUVEAU (preuve ci-dessous) ;
 *     - 'uniswap-v4' : les pools v4 USDC sans hook de cles-v4-actions.js (frais 3 % a 8 %), par l Universal Router.
 *
 * ⛔⛔ LE ROUTEUR DE LA NOUVELLE FACTORY, PROUVE ET NON SUPPOSE (sonde du 2026-10-25, tete 53 073 403, base-rpc.publicnode.com) :
 *   1. 150 logs Swap lus sur les 6 pools USDC les plus profondes de 0x9cb2… (PLTRc, AMZN, NVDA, AAPL, META, SPCX ; 20 000 derniers
 *      blocs) : 0x9ee35bf1bd69a03c6f0393582030fce8bb93d418 en est le `sender` 35 fois, et `tx.to` de 25 transactions RELUES par
 *      eth_getTransactionByHash (des EOA l appellent directement : tx 0x723ebab6…3d24, 0x13146073…e58, 0x5179f97b…076, status 0x1).
 *   2. `factory()` rend 0x9cb220581b91b0c83223012fe69688b92ad07a76, `WETH9()` le WETH de Base ; son code contient l adresse de la
 *      NOUVELLE factory et pas celle de l ancienne ; il porte les selecteurs exactInputSingle 0xa026383e, multicall, sweepTokenWithFee.
 *      Aucun des 20 autres `sender` ne rend factory() = cette factory.
 *   3. Banc fork (banc-liquidite-actions-fork-20261025.mjs) : achat puis revente executes par CE module, octets compares.
 *   ⚠️ NON PROUVE : qui opere cette factory ; si elle est « officielle » chez Aerodrome. Seule sa difference avec la notre l est.
 *
 * ⛔ LE DEVIS DE LA NOUVELLE FACTORY : aucun quoter de cette factory n a ete trouve. Le quoter 0x514c…9259 de l ANCIENNE porte son
 *   adresse de factory en immutable (3 occurrences exactes dans son code) ; on lui passe, par `stateOverride` d eth_call, son PROPRE
 *   code ou ces 3 mots deviennent la nouvelle factory. Rien n est deploye ni signe. Le banc fork compare ce devis a la sortie EXECUTEE.
 *
 * ⛔⛔ LES REGLES, LES MEMES POUR CHAQUE LIEU (consigne du proprietaire, 2026-10-25) : a 10 USDC, l achat coute au plus 1 % de plus
 *   que le prix moyen de la pool (son frais compris) ; la revente de ce que 10 USDC achetent, cotee au MEME etat, perd au plus 2 % ;
 *   la pool tient au moins 10 000 USDC. Le MEILLEUR lieu qui passe gagne (la plus grande sortie a 10 USDC) ; a egalite, 'aero-old'
 *   (la route d avant, inchangee). ⚠️ La profondeur d une pool v4 n est pas un solde (le PoolManager tient l USDC de TOUTES les pools) :
 *   elle est NON_MESUREE et une pool v4 ne passe donc jamais la regle de profondeur ici — et a 3-8 % de frais, jamais celle d ecart.
 *
 * Pur : `appel` / `appelDevis` injectes. Aucune ecriture, aucune signature. */
import { FACTORY_AERODROME_CL, ROUTEUR_AERODROME_CL, calldataExactInputSingleCL, calldataApprove, FRAIS_INTERFACE_BPS_CL, FRAIS_BPS_MAX_PRUDENT } from './calldata-aerodrome.js';
import { QUOTEUR_AERODROME_CL, SIG_QUOTE_IN } from './rolls-en-action.js';
import { USDC_BASE } from './frais-creation.js';
import { selecteur } from './keccak.js';
import { encodeQuote, poolId } from './pool.js';
import { QUOTEUR as QUOTEURS_V4 } from './echange.js';
import { V4_ADRESSES } from './lancer-pool.js';

export const ROUTEUR_AERO_NOUVEAU = '0x9ee35bf1bd69a03c6f0393582030fce8bb93d418';
export const FACTORY_AERO_NOUVELLE = '0x9cb220581b91b0c83223012fe69688b92ad07a76';
/** `tickSpacings()` LU sur chaque factory le 2026-10-25 (sonde-routeur) */
export const ESPACEMENTS_NOUVELLE = Object.freeze([1, 10, 50, 100, 150, 200, 250]);
export const ESPACEMENTS_ANCIENNE = Object.freeze([1, 50, 100, 200, 2000, 500, 10, 80, 150]);
export const OCCURRENCES_FACTORY_QUOTEUR = 3;
export const QUOTEUR_V4_BASE = QUOTEURS_V4[8453];
export const STATE_VIEW_BASE = V4_ADRESSES[8453].stateView;

export const DEVIS_USDC = 10_000_000n;
export const REGLES = Object.freeze({ ecartMaxBps: 100, perteMaxBps: 200, usdcMin: 10_000_000_000n });
/** au-dela de cet ecart sous la reference, la vente est dite « loin sous la reference » (le seuil du ticket, reference-action.js) */
export const SEUIL_VENTE_LOIN_BPS = 300;

export const VENUES = Object.freeze({
  'aero-old': Object.freeze({ id: 'aero-old', libelle: 'Aerodrome (this app’s router)', factory: FACTORY_AERODROME_CL, routeur: ROUTEUR_AERODROME_CL, espacements: ESPACEMENTS_ANCIENNE }),
  'aero-new': Object.freeze({ id: 'aero-new', libelle: 'Aerodrome (newer pool factory)', factory: FACTORY_AERO_NOUVELLE, routeur: ROUTEUR_AERO_NOUVEAU, espacements: ESPACEMENTS_NOUVELLE }),
  'uniswap-v4': Object.freeze({ id: 'uniswap-v4', libelle: 'Uniswap v4', factory: null, routeur: null, espacements: [] }),
});
/** l ordre de depart a egalite : la route d avant d abord */
export const ORDRE_VENUES = Object.freeze(['aero-old', 'aero-new', 'uniswap-v4']);

const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const motA = (a) => bas(a).slice(2).padStart(64, '0');
const mot = (n) => { const v = BigInt(n); if (v < 0n || v >= (1n << 256n)) throw new Error('word out of range'); return v.toString(16).padStart(64, '0'); };
const motI24 = (n) => { const v = BigInt(n); return (v < 0n ? v + (1n << 256n) : v).toString(16).padStart(64, '0'); };
const premierMot = (hex) => { const h = String(hex || ''); if (!/^0x[0-9a-fA-F]{64,}$/.test(h)) throw new Error('short answer'); return BigInt('0x' + h.slice(2, 66)); };
const court = (e) => String((e && e.message) || e).slice(0, 120);
const SEL = Object.freeze({ getPool: selecteur('getPool(address,address,int24)'), balanceOf: selecteur('balanceOf(address)'), liquidity: selecteur('liquidity()'),
  slot0: selecteur('slot0()'), quoteIn: selecteur(SIG_QUOTE_IN), getSlot0: selecteur('getSlot0(bytes32)') });

/** le bytecode du quoter ou l ancienne factory devient la nouvelle — ou null si le code n a pas la forme lue (3 occurrences exactes) */
export function codeQuoteurNouvelle(code) {
  const c = bas(code), vieille = bas(FACTORY_AERODROME_CL).slice(2), neuve = FACTORY_AERO_NOUVELLE.slice(2);
  if (!/^0x[0-9a-f]+$/.test(c) || c.length < 1000) return null;
  if (c.split(vieille).length - 1 !== OCCURRENCES_FACTORY_QUOTEUR || c.includes(neuve)) return null;
  return c.split(vieille).join(neuve);
}
/** le stateOverride a passer en 3e parametre d eth_call pour coter sur la nouvelle factory */
export function overrideQuoteur(codePatche) { return { [bas(QUOTEUR_AERODROME_CL)]: { code: codePatche } }; }

/** sortie au prix moyen : `montant` du jeton d entree, au sqrtPriceX96 (token1/token0 = s^2/2^192) ; `entreeEst0` = le jeton d entree est token0 */
export function sortieMoyenne({ montant, sqrtP, entreeEst0 }) {
  const s2 = BigInt(sqrtP) * BigInt(sqrtP), Q = 1n << 192n;
  if (s2 === 0n) return 0n;
  return entreeEst0 ? (BigInt(montant) * s2) / Q : (BigInt(montant) * Q) / s2;
}
const bps = (attendu, recu) => (attendu > 0n ? Number(((attendu - recu) * 10000n) / attendu) : null);

/** les donnees de devis CL (quoter Aerodrome, exactInputSingle) */
export function dataDevisCL({ tokenIn, tokenOut, montant, tickSpacing }) {
  return SEL.quoteIn + motA(tokenIn) + motA(tokenOut) + mot(montant) + motI24(tickSpacing) + mot(0);
}

/**
 * LES POOLS USDC D UNE ACTION SUR UNE FACTORY CL, COTEES. Rend { etat, pools:[...] } ; chaque pool porte usdcPool, liquidite, sqrtP,
 * achat (sortie cotee de `montant` USDC), ecartBps, venteMemeEtat (revente de `achat` au meme etat), perteBps — ou `erreur`.
 * @param {(to,data)=>Promise<string>} p.appel       eth_call (au bloc de l appelant)
 * @param {(to,data)=>Promise<string>} [p.appelDevis] eth_call pour le QUOTER (avec override pour 'aero-new') ; defaut `appel`
 */
/** une absence de pool (getPool = 0x0) est relue apres ce delai ; une pool trouvee ne l est jamais (son adresse est fixee par la factory) */
export const POOL_ABSENTE_TTL_MS = 6 * 60 * 60 * 1000;
export async function coterVenueCL({ appel, appelDevis = appel, venue, adr, montant = DEVIS_USDC, usdc = USDC_BASE, cachePools = null, maintenant = Date.now() }) {
  const V = VENUES[venue];
  if (!V || !V.factory) return { etat: 'NON_MESURE', venue, pourquoi: 'not a CL venue', pools: [] };
  const a = bas(adr), u = bas(usdc);
  const pools = []; let refus = 0;
  for (const ts of V.espacements) {
    /* meme cle de cache que actions-chaine.js routeAction ('factory|jeton|ts') : une seule Map pour les deux factories */
    const cle = bas(V.factory) + '|' + a + '|' + ts;
    const enCache = cachePools ? cachePools.get(cle) : null;
    if (enCache && (enCache.pool || maintenant - enCache.t < POOL_ABSENTE_TTL_MS)) { if (enCache.pool) pools.push({ pool: enCache.pool, tickSpacing: ts }); continue; }
    try {
      const r = await appel(V.factory, SEL.getPool + motA(a) + motA(u) + motI24(ts));
      const p = '0x' + String(r).slice(26, 66).toLowerCase();
      if (!/^0x[0-9a-fA-F]{64}/.test(String(r)) || !ADR.test(p)) { refus += 1; continue; }
      const absente = /^0x0{40}$/.test(p);
      if (cachePools) cachePools.set(cle, absente ? { pool: null, t: maintenant } : { pool: p, t: maintenant });
      if (!absente) pools.push({ pool: p, tickSpacing: ts });
    } catch (_) { refus += 1; }
  }
  if (!pools.length) return refus ? { etat: 'NON_MESURE', venue, pourquoi: refus + ' pool lookups refused', pools: [] } : { etat: 'OK', venue, pools: [] };
  const usdcEst0 = BigInt(u) < BigInt(a);
  for (const p of pools) {
    try {
      p.usdcPool = premierMot(await appel(u, SEL.balanceOf + motA(p.pool)));
      p.liquidite = premierMot(await appel(p.pool, SEL.liquidity));
      if (p.liquidite === 0n) { p.code = 'POOL_VIDE'; continue; }
      p.sqrtP = premierMot(await appel(p.pool, SEL.slot0));
    } catch (e) { p.erreur = 'state not read: ' + court(e); continue; }
    try { p.achat = premierMot(await appelDevis(QUOTEUR_AERODROME_CL, dataDevisCL({ tokenIn: u, tokenOut: a, montant, tickSpacing: p.tickSpacing }))); }
    catch (e) { if (/revert|execution/i.test(court(e))) { p.code = 'NON_COTEE'; continue; } p.erreur = 'quote not read: ' + court(e); continue; }
    const moyenne = sortieMoyenne({ montant, sqrtP: p.sqrtP, entreeEst0: usdcEst0 });
    p.ecartBps = bps(moyenne, p.achat);
    if (!(p.achat > 0n)) { p.code = 'NON_COTEE'; continue; }
    try { p.venteMemeEtat = premierMot(await appelDevis(QUOTEUR_AERODROME_CL, dataDevisCL({ tokenIn: a, tokenOut: u, montant: p.achat, tickSpacing: p.tickSpacing }))); }
    catch (e) { if (/revert|execution/i.test(court(e))) { p.code = 'VENTE_NON_COTEE'; continue; } p.erreur = 'sell quote not read: ' + court(e); continue; }
    p.perteBps = bps(BigInt(montant), p.venteMemeEtat);
  }
  const lues = pools.filter((p) => !p.erreur);
  if (!lues.length) return { etat: 'NON_MESURE', venue, pourquoi: pools[0].erreur, pools };
  return { etat: 'OK', venue, pools };
}

/** une cle v4 { currency0, currency1, fee, tickSpacing, hooks } ; USDC est currency0 sur les 20 cles de cles-v4-actions.js */
export async function coterVenueV4({ appel, cles = [], adr, montant = DEVIS_USDC, usdc = USDC_BASE, quoteur = QUOTEUR_V4_BASE, stateView = STATE_VIEW_BASE }) {
  const a = bas(adr), u = bas(usdc);
  const pools = [];
  for (const c of cles) {
    const c0 = bas(c.currency0), c1 = bas(c.currency1);
    if (!((c0 === u && c1 === a) || (c0 === a && c1 === u))) continue;
    const cle = { currency0: c0, currency1: c1, fee: Number(c.fee), tickSpacing: Number(c.tickSpacing), hooks: bas(c.hooks || '0x0000000000000000000000000000000000000000') };
    const p = { pool: poolId(cle), cle, fee: cle.fee, tickSpacing: cle.tickSpacing, usdcPool: null };
    pools.push(p);
    const usdcEst0 = c0 === u;
    try { p.sqrtP = premierMot(await appel(stateView, SEL.getSlot0 + p.pool.slice(2))); } catch (e) { p.erreur = 'slot0 not read: ' + court(e); continue; }
    if (p.sqrtP === 0n) { p.code = 'POOL_VIDE'; continue; }
    try { p.achat = premierMot(await appel(quoteur, encodeQuote({ cle, zeroForOne: usdcEst0, montant: BigInt(montant) }))); }
    catch (e) { if (/revert|execution/i.test(court(e))) { p.code = 'NON_COTEE'; continue; } p.erreur = 'quote not read: ' + court(e); continue; }
    p.ecartBps = bps(sortieMoyenne({ montant, sqrtP: p.sqrtP, entreeEst0: usdcEst0 }), p.achat);
    if (!(p.achat > 0n)) { p.code = 'NON_COTEE'; continue; }
    try { p.venteMemeEtat = premierMot(await appel(quoteur, encodeQuote({ cle, zeroForOne: !usdcEst0, montant: p.achat }))); }
    catch (e) { if (/revert|execution/i.test(court(e))) { p.code = 'VENTE_NON_COTEE'; continue; } p.erreur = 'sell quote not read: ' + court(e); continue; }
    p.perteBps = bps(BigInt(montant), p.venteMemeEtat);
  }
  const lues = pools.filter((p) => !p.erreur);
  if (pools.length && !lues.length) return { etat: 'NON_MESURE', venue: 'uniswap-v4', pourquoi: pools[0].erreur, pools };
  return { etat: 'OK', venue: 'uniswap-v4', pools };
}

/** LA REGLE, pour une pool cotee. Rend { passe, code } ; code null quand elle passe. ⛔ un chiffre absent ne passe JAMAIS. */
export function jugerPool(p, regles = REGLES) {
  if (!p || p.erreur) return { passe: false, code: 'NON_MESURE' };
  if (p.code) return { passe: false, code: p.code };
  if (!(typeof p.achat === 'bigint' && p.achat > 0n)) return { passe: false, code: 'NON_COTEE' };
  if (!Number.isFinite(p.ecartBps) || p.ecartBps > regles.ecartMaxBps) return { passe: false, code: 'ECART' };
  if (!Number.isFinite(p.perteBps) || p.perteBps > regles.perteMaxBps) return { passe: false, code: 'ALLER_RETOUR' };
  if (typeof p.usdcPool !== 'bigint') return { passe: false, code: 'PROFONDEUR_NON_MESUREE' };
  if (p.usdcPool < regles.usdcMin) return { passe: false, code: 'LIQUIDITE_SOUS_SEUIL' };
  return { passe: true, code: null };
}

/** LE VERDICT D UN LIEU : sa meilleure pool qui passe (plus grande sortie a 10 USDC), sinon sa pool la mieux cotee et son refus. */
export function verdictVenue(cote, regles = REGLES) {
  if (!cote || cote.etat !== 'OK') return { venue: cote && cote.venue, etat: 'NON_MESURE', passe: false, code: 'NON_MESURE', pourquoi: (cote && cote.pourquoi) || null };
  if (!cote.pools.length) return { venue: cote.venue, etat: 'OK', passe: false, code: 'SANS_POOL', pool: null };
  const jugees = cote.pools.map((p) => ({ p, j: jugerPool(p, regles) }));
  const plus = (x, y) => ((y.p.achat || 0n) > (x.p.achat || 0n) ? y : x);
  const passent = jugees.filter((x) => x.j.passe);
  /* ⛔⛔ UNE POOL NON LUE INTERDIT LE REFUS (mesure du 2026-10-25, deux passes a 200 blocs d ecart : AVGOc « LIQUIDITE_SOUS_SEUIL » sur sa
   *   pool mince parce que sa pool PROFONDE (102 k$) n avait pas ete lue — 8 actions basculaient ainsi). Sans pool qui passe, une seule
   *   lecture ratee = NON_MESURE, jamais le refus d une autre pool. */
  if (!passent.length && jugees.some((x) => x.p.erreur)) return { venue: cote.venue, etat: 'NON_MESURE', passe: false, code: 'NON_MESURE', pourquoi: jugees.find((x) => x.p.erreur).p.erreur };
  const cotees = jugees.filter((x) => typeof x.p.achat === 'bigint' && x.p.achat > 0n);
  const choisie = passent.length ? passent.reduce(plus) : (cotees.length ? cotees.reduce(plus) : jugees[0]);
  const p = choisie.p;
  return { venue: cote.venue, etat: 'OK', passe: choisie.j.passe, code: choisie.j.code, pool: p.pool, tickSpacing: p.tickSpacing ?? null, cle: p.cle || null,
    usdcPool: p.usdcPool ?? null, achat: p.achat ?? null, venteMemeEtat: p.venteMemeEtat ?? null, ecartBps: p.ecartBps ?? null, perteBps: p.perteBps ?? null };
}

/** LE MEILLEUR LIEU QUI PASSE : plus grande sortie a 10 USDC ; a egalite, l ordre ORDRE_VENUES (la route d avant). null si aucun ne passe. */
export function meilleureVenue(verdicts) {
  let m = null;
  for (const id of ORDRE_VENUES) {
    const v = (verdicts || []).find((x) => x && x.venue === id);
    if (!v || !v.passe || typeof v.achat !== 'bigint') continue;
    if (!m || v.achat > m.achat) m = v;
  }
  return m;
}

/** la vente de `quantite` sur la pool retenue d un lieu, au meme etat (pour comparer les lieux A LA MEME QUANTITE) */
export async function coterVentePool({ appelDevis, verdict, adr, quantite, usdc = USDC_BASE, quoteurV4 = QUOTEUR_V4_BASE }) {
  if (!verdict || !verdict.pool || !(BigInt(quantite) > 0n)) return null;
  try {
    if (verdict.venue === 'uniswap-v4') {
      const cle = verdict.cle; if (!cle) return null;
      return premierMot(await appelDevis(quoteurV4, encodeQuote({ cle, zeroForOne: bas(cle.currency0) === bas(adr), montant: BigInt(quantite) })));
    }
    return premierMot(await appelDevis(QUOTEUR_AERODROME_CL, dataDevisCL({ tokenIn: adr, tokenOut: usdc, montant: quantite, tickSpacing: verdict.tickSpacing })));
  } catch (_) { return null; }
}

/** ecart signe en bps d un prix contre une reference (null si l un manque) */
export function ecartBpsContre(prix, ref) {
  const p = Number(prix), r = Number(ref);
  if (!(p > 0) || !(r > 0) || !Number.isFinite(p) || !Number.isFinite(r)) return null;
  return Math.round(((p - r) / r) * 10000);
}

/**
 * CE QUE L ECRAN DIT DE LA VENTE, AVANT LA SIGNATURE. `ventes` = [{ venue, prixUsd }] (USDC recus par action, chaque lieu coté a la
 * MEME quantite) ; `reference` = { prixUsd, source } (Chainlink lue ; sinon 'best-buy' : le prix d achat le plus bas parmi les lieux cotes,
 * NOMME tel quel — ce que coute de racheter. Le prix moyen de la pool la plus profonde a ete ESSAYE et rejete : ARMc, sa pool la plus
 * profonde (aero-old) cote 197 $ quand la vraie profondeur echange a 220 $ — une reference qui ment).
 * Rend { meilleure, ecartBps, loin, texte } — `loin` : MEME le meilleur lieu paie plus de SEUIL_VENTE_LOIN_BPS sous la reference.
 */
export function phraseVente({ ventes = [], reference = null, seuilBps = SEUIL_VENTE_LOIN_BPS } = {}) {
  const cotees = ventes.filter((v) => v && Number(v.prixUsd) > 0);
  if (!cotees.length) return { meilleure: null, ecartBps: null, loin: false, texte: 'No venue quotes a sale of this stock right now.' };
  const m = cotees.reduce((x, y) => (Number(y.prixUsd) > Number(x.prixUsd) ? y : x));
  const lib = (VENUES[m.venue] && VENUES[m.venue].libelle) || m.venue;
  const usd = (x) => '$' + Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  let texte = 'Best sell: ' + lib + ', about ' + usd(m.prixUsd) + ' per token.';
  const e = reference ? ecartBpsContre(m.prixUsd, reference.prixUsd) : null;
  const loin = e !== null && e < -seuilBps;
  if (e !== null) {
    texte += ' ' + (reference.source === 'chainlink' ? 'Chainlink reference ' : 'Best buy price anywhere ') + usd(reference.prixUsd) + ' (' + (e >= 0 ? '+' : '') + (e / 100).toFixed(2) + ' %).';
    if (loin) texte += ' ⚠ Every venue pays at least ' + (Math.abs(e) / 100).toFixed(1) + ' % below it. A smaller sale, or waiting, may get more.';
  } else texte += ' No reference price to compare with.';
  return { meilleure: m, ecartBps: e, loin, texte };
}

/** la forme servie (JSON, aucun BigInt) d un verdict de lieu */
export function verdictServi(v) {
  if (!v) return null;
  const s = (x) => (typeof x === 'bigint' ? String(x) : x ?? null);
  return { venue: v.venue, passe: !!v.passe, code: v.code ?? null, pool: v.pool ?? null, tickSpacing: v.tickSpacing ?? null,
    usdcPool: s(v.usdcPool), achat: s(v.achat), venteMemeEtat: s(v.venteMemeEtat), ecartBps: v.ecartBps ?? null, perteBps: v.perteBps ?? null };
}

/* ── LE MONTAGE SUR LE ROUTEUR DE LA NOUVELLE FACTORY (meme montage que calldataExactInputAvecFrais, en un saut) ── */
export const SELECTEUR_SWEEP_AVEC_FRAIS = '0xe0e189a0'; /* sweepTokenWithFee(address,uint256,address,uint256,address) */
export const SELECTEUR_MULTICALL = '0xac9650d8';         /* multicall(bytes[]) */
const motAddr = (a) => { if (!ADR.test(String(a || ''))) throw new Error('address expected'); return bas(a).slice(2).padStart(64, '0'); };
const dynamique = (hex) => { const k = hex.length / 2; return mot(k) + hex + '00'.repeat((32 - (k % 32)) % 32); };

/** l autorisation EXACTE de l entree vers le routeur de la nouvelle factory (jamais illimitee) */
export function calldataApproveNouvelle({ token, montant }) {
  return calldataApprove({ token, montant, beneficiaire: ROUTEUR_AERO_NOUVEAU });
}

/** multicall([exactInputSingle(recipient = routeur), sweepTokenWithFee(tokenOut, minUtilisateur, recipient, bps, beneficiaire)]) */
export function calldataEchangeNouvelle({ tokenIn, tokenOut, tickSpacing, recipient, amountIn, amountOutMinimum, deadline, maintenant = null,
  fraisBps = FRAIS_INTERFACE_BPS_CL, beneficiaireFrais }) {
  const b = (() => { try { return BigInt(fraisBps); } catch (_) { return -1n; } })();
  if (b <= 0n || b > FRAIS_BPS_MAX_PRUDENT) return { etat: 'REFUSE', pourquoi: 'the interface fee must be between 1 and ' + FRAIS_BPS_MAX_PRUDENT + ' bps' };
  if (!ADR.test(String(beneficiaireFrais || ''))) return { etat: 'REFUSE', pourquoi: 'a whole fee-recipient address is required, with no default' };
  if (!ADR.test(String(recipient || '')) || /^0x0{40}$/i.test(String(recipient)) || bas(recipient) === ROUTEUR_AERO_NOUVEAU) {
    return { etat: 'REFUSE', pourquoi: 'the recipient must be a whole address, not zero and not the router' };
  }
  const swap = calldataExactInputSingleCL({ tokenIn, tokenOut, tickSpacing, recipient: ROUTEUR_AERO_NOUVEAU, deadline, amountIn, amountOutMinimum, maintenant });
  if (swap.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'inner swap refused: ' + swap.pourquoi };
  const min = BigInt(amountOutMinimum);
  const minUtilisateur = (min * (10000n - b)) / 10000n;
  if (minUtilisateur <= 0n) return { etat: 'REFUSE', pourquoi: 'after our cut the guaranteed minimum would be zero' };
  const balayage = SELECTEUR_SWEEP_AVEC_FRAIS.slice(2) + motAddr(tokenOut) + mot(minUtilisateur) + motAddr(recipient) + mot(b) + motAddr(beneficiaireFrais);
  const elements = [swap.data.slice(2), balayage].map(dynamique);
  let curseur = BigInt(32 * elements.length);
  const offsets = elements.map((e) => { const o = mot(curseur); curseur += BigInt(e.length / 2); return o; });
  return {
    etat: 'PRET', to: ROUTEUR_AERO_NOUVEAU, value: '0x0',
    data: SELECTEUR_MULTICALL + mot(0x20) + mot(elements.length) + offsets.join('') + elements.join(''),
    minPools: String(min), minUtilisateur: String(minUtilisateur), fraisBps: Number(b), beneficiaireFrais: bas(beneficiaireFrais),
  };
}

/* ── LE CHOIX SERVI, LE PLAN ET LA VENTE COMPAREE (serveur-web.js, rails-api.js) ───────────────────────────────────────────── */

/**
 * LE LIEU RETENU POUR UNE ACTION, a partir du verdict de NOTRE route (routeServie, actions-chaine.js — sa regle a lui, inchangee) et du
 * verdict du lieu 'aero-new' (verdictServi, REGLES ci-dessus). 'aero-new' n est retenu que s il PASSE et, quand notre route passe aussi,
 * s il rend STRICTEMENT plus a 10 USDC (`achat` lu des deux cotes) ; sinon la route d avant reste : ses appels sont inchanges.
 */
export function choisirVenue({ route, neuve }) {
  const ancienneOk = !!(route && route.achetable === true);
  const neuveOk = !!(neuve && neuve.passe === true && /^\d+$/.test(String(neuve.achat || '')));
  if (neuveOk && !ancienneOk) return 'aero-new';
  if (neuveOk && ancienneOk && /^\d+$/.test(String(route.achat || '')) && BigInt(neuve.achat) > BigInt(route.achat)) return 'aero-new';
  return ancienneOk ? 'aero-old' : null;
}

let codeQuoteurMemo = null;
/** le code patche du quoter (immuable : lu une fois, garde seulement s il a la forme mesuree) */
export async function lireCodeQuoteurNouvelle(rpc) {
  if (codeQuoteurMemo) return codeQuoteurMemo;
  const c = codeQuoteurNouvelle(await rpc('eth_getCode', [QUOTEUR_AERODROME_CL, 'latest']));
  if (c) codeQuoteurMemo = c;
  return c;
}

const SEL_ALLOWANCE = selecteur('allowance(address,address)');
const SEL_DECIMALS = selecteur('decimals()');
const estRevert = (e) => /revert|execution/i.test(court(e)) && !/rate|limit|timeout|busy/i.test(court(e));

/**
 * LE PLAN D UN ACHAT (USDC -> action) OU D UNE VENTE (action -> USDC) SUR LE LIEU 'aero-new', en un appel au routeur 0x9ee3…d418.
 * Re-cote AU MONTANT DEMANDE (quoter patche, override), minimum = devis - `toleranceBps`, approbation EXACTE, et — une fois
 * l autorisation posee — SIMULE la transaction exacte depuis le compte (eth_call avec `from`). Rend la forme des planificateurs
 * (etat PRET | APPROBATIONS | REFUSE | NON_MESURE, etapes, tx, resume) pour rails-api.js `normaliser`.
 * @param {(m:string,p:any[])=>Promise<any>} p.rpc  ⛔ doit accepter un stateOverride en 3e parametre d eth_call
 * @param {{pool:string,tickSpacing:number}} p.verdict  le verdict servi du lieu (sa pool, son espacement)
 */
export async function planVenueNeuve({ rpc, sens, action, montant, compte, verdict, beneficiaireFrais, maintenant = Date.now(), toleranceBps = 100n, usdc = USDC_BASE }) {
  const a = bas(action), u = bas(usdc), m = BigInt(montant);
  if (!verdict || !ADR.test(String(verdict.pool || '')) || !Number.isInteger(Number(verdict.tickSpacing))) return { etat: 'NON_MESURE', pourquoi: 'the newer-factory pool of this stock is not known yet' };
  if (sens !== 'ACHAT' && sens !== 'VENTE') return { etat: 'REFUSE', pourquoi: 'sens must be ACHAT or VENTE' };
  const tin = sens === 'ACHAT' ? u : a, tout = sens === 'ACHAT' ? a : u, ts = Number(verdict.tickSpacing);
  let code;
  try { code = await lireCodeQuoteurNouvelle(rpc); } catch (e) { return { etat: 'NON_MESURE', pourquoi: 'quoter code not read: ' + court(e) }; }
  if (!code) return { etat: 'NON_MESURE', pourquoi: 'the quoter code no longer has the measured shape: no quote on the newer factory' };
  let q;
  try { q = premierMot(await rpc('eth_call', [{ to: QUOTEUR_AERODROME_CL, data: dataDevisCL({ tokenIn: tin, tokenOut: tout, montant: m, tickSpacing: ts }) }, 'latest', overrideQuoteur(code)])); }
  catch (e) { return estRevert(e) ? { etat: 'REFUSE', pourquoi: 'the newer-factory pool cannot quote this amount' } : { etat: 'NON_MESURE', pourquoi: 'quote not read: ' + court(e) }; }
  if (!(q > 0n)) return { etat: 'REFUSE', pourquoi: 'the newer-factory pool quotes nothing for this amount' };
  /* ⛔ LE DEVIS DOIT ETRE CELUI DE CETTE POOL : un noeud qui ignorerait le stateOverride coterait la pool de l ANCIENNE factory (meme
   *   paire, meme espacement) — un devis plausible et faux. Il est donc confronte au prix moyen de LA pool visee : au-dessus de ce prix
   *   (plus que 10 bps) ou a plus de 50 % dessous, il ne vient pas d elle — REFUSE. Mesure du 2026-10-25 : mainnet.base.org,
   *   base.drpc.org et publicnode honorent l override (AVGOc : 3 099 321 avec, 2 804 951 sans). */
  let impactBps = null;
  try {
    const sq = premierMot(await rpc('eth_call', [{ to: bas(verdict.pool), data: SEL.slot0 }, 'latest']));
    const mid = sortieMoyenne({ montant: m, sqrtP: sq, entreeEst0: BigInt(tin) < BigInt(tout) });
    if (mid > 0n) impactBps = Number(((mid - q) * 10000n) / mid);
  } catch (e) { return { etat: 'NON_MESURE', pourquoi: 'pool price not read: ' + court(e) }; }
  if (impactBps === null) return { etat: 'NON_MESURE', pourquoi: 'pool price not read' };
  if (impactBps < -10) return { etat: 'REFUSE', pourquoi: 'the quote is above this pool’s own price: it does not come from this pool, not offered' };
  if (impactBps > 5000) return { etat: 'REFUSE', pourquoi: 'this amount would get more than 50 % below this pool’s price: not offered — try a smaller amount' };
  impactBps = Math.max(0, impactBps);
  const min = (q * (10000n - BigInt(toleranceBps))) / 10000n;
  const resumeDe = (minU) => ({ paye: String(m), payeDevise: tin, quote: String(q), recoitAuMoins: String(minU), recoitDevise: tout,
    fraisBps: String(FRAIS_INTERFACE_BPS_CL), impactBps: impactBps === null ? null : String(impactBps), venue: 'aero-new', pool: bas(verdict.pool), routeur: ROUTEUR_AERO_NOUVEAU });
  const minUtilisateurDe = (x) => (x * (10000n - FRAIS_INTERFACE_BPS_CL)) / 10000n;
  try {
    const s = premierMot(await rpc('eth_call', [{ to: tin, data: SEL.balanceOf + motA(compte) }, 'latest']));
    if (s < m) return { etat: 'REFUSE', pourquoi: 'this wallet holds less than the amount to pay', resume: resumeDe(minUtilisateurDe(min)) };
  } catch (_) { /* solde non lu : la simulation jugera */ }
  let allow = null;
  try { allow = premierMot(await rpc('eth_call', [{ to: tin, data: SEL_ALLOWANCE + motA(compte) + motA(ROUTEUR_AERO_NOUVEAU) }, 'latest'])); }
  catch (e) { return { etat: 'NON_MESURE', pourquoi: 'allowance not read: ' + court(e) }; }
  if (allow < m) {
    const ap = calldataApproveNouvelle({ token: tin, montant: m });
    if (ap.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: ap.pourquoi };
    return { etat: 'APPROBATIONS', etapes: [{ to: ap.to, data: ap.data, value: '0x0', nom: 'approve the exact amount for the newer-factory router' }], resume: resumeDe(minUtilisateurDe(min)) };
  }
  const t = Math.floor(Number(maintenant) / 1000);
  const c = calldataEchangeNouvelle({ tokenIn: tin, tokenOut: tout, tickSpacing: ts, recipient: compte, amountIn: m, amountOutMinimum: min,
    deadline: t + 600, maintenant: t, beneficiaireFrais });
  if (c.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: c.pourquoi };
  try { await rpc('eth_call', [{ from: bas(compte), to: c.to, data: c.data, value: '0x0' }, 'latest']); }
  catch (e) { return estRevert(e) ? { etat: 'REFUSE', pourquoi: 'the chain refuses this exact swap right now (simulation reverted)' } : { etat: 'NON_MESURE', pourquoi: 'simulation not read: ' + court(e) }; }
  return { etat: 'PRET', tx: { to: c.to, data: c.data, value: '0x0' }, resume: resumeDe(BigInt(c.minUtilisateur)) };
}

/**
 * LA VENTE DE `montant` (brut) D UNE ACTION, COTEE SUR CHAQUE LIEU CONNU AU MEME INSTANT, et la phrase dite avant la signature.
 * Lieux : la pool de NOTRE route (`route.pool`/`route.tickSpacing`, servis), celle de 'aero-new' (`route.venues['aero-new']`), la cle v4
 * MESUREE (`cleV4`). Reference : `refUsd` (Chainlink lue) sinon le prix d achat le plus bas servi (10 USDC / `achat`, 'best-buy').
 * Rend { etat, ventes:[{venue, usdc, prixUsd}], meilleure, ecartBps, loin, texte } — un lieu non cote n est pas dit « 0 ».
 */
export async function venteParVenues({ rpc, action, montant, route, cleV4 = null, refUsd = null, usdc = USDC_BASE }) {
  const a = bas(action), m = BigInt(montant);
  let dec;
  try { dec = Number(premierMot(await rpc('eth_call', [{ to: a, data: SEL_DECIMALS }, 'latest']))); } catch (_) { return { etat: 'NON_MESURE', ventes: [], texte: null }; }
  if (!Number.isInteger(dec) || dec < 0 || dec > 36) return { etat: 'NON_MESURE', ventes: [], texte: null };
  const neuve = route && route.venues ? route.venues['aero-new'] : null;
  const ventes = [];
  const prix = (r) => (Number(r) / 10 ** 6) / (Number(m) / 10 ** dec);
  const coter = async (venue, f) => { try { const r = premierMot(await f()); if (r > 0n) ventes.push({ venue, usdc: String(r), prixUsd: prix(r) }); } catch (_) { /* non cote : pas dit */ } };
  if (route && ADR.test(String(route.pool || '')) && Number.isInteger(Number(route.tickSpacing))) {
    await coter('aero-old', () => rpc('eth_call', [{ to: QUOTEUR_AERODROME_CL, data: dataDevisCL({ tokenIn: a, tokenOut: usdc, montant: m, tickSpacing: route.tickSpacing }) }, 'latest']));
  }
  if (neuve && ADR.test(String(neuve.pool || '')) && Number.isInteger(Number(neuve.tickSpacing))) {
    let code = null; try { code = await lireCodeQuoteurNouvelle(rpc); } catch (_) { code = null; }
    if (code) await coter('aero-new', () => rpc('eth_call', [{ to: QUOTEUR_AERODROME_CL, data: dataDevisCL({ tokenIn: a, tokenOut: usdc, montant: m, tickSpacing: neuve.tickSpacing }) }, 'latest', overrideQuoteur(code)]));
  }
  if (cleV4 && cleV4.currency0 && cleV4.currency1) {
    await coter('uniswap-v4', () => rpc('eth_call', [{ to: QUOTEUR_V4_BASE, data: encodeQuote({ cle: cleV4, zeroForOne: bas(cleV4.currency0) === a, montant: m }) }, 'latest']));
  }
  /* la reference : Chainlink, sinon le prix d achat le plus bas SERVI a 10 USDC (le rachat le moins cher), nomme */
  const achats = [route && route.achetable ? route.achat : null, neuve ? neuve.achat : null].filter((x) => /^\d+$/.test(String(x || '')) && BigInt(x) > 0n)
    .map((x) => 10 / (Number(x) / 10 ** dec));
  const reference = Number(refUsd) > 0 ? { prixUsd: Number(refUsd), source: 'chainlink' } : (achats.length ? { prixUsd: Math.min(...achats), source: 'best-buy' } : null);
  const pv = phraseVente({ ventes, reference });
  return { etat: 'OK', ventes, meilleure: pv.meilleure ? pv.meilleure.venue : null, ecartBps: pv.ecartBps, loin: pv.loin, reference, texte: pv.texte };
}
