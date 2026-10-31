/* payer-unit.js — PAYER UN JEU AVEC UNIT (Phil 2026-10-28 : « UNIT = UNE option de plus dans Pay with, chemin multiple »).
 * UNIT = 0xb2000000000000000000007afa7ed748b0874f27 (B20, 18 decimales). Sa SEULE pool : ETH/UNIT de l app (v4, hook 7030, fee 0, tick 200).
 * Il n a pas de pool UNIT/USDC : le chemin a DEUX jambes, que le WALLET DU JOUEUR signe en UN lot atomique (jamais a la suite) :
 *   1. Permit2 exact (UNIT -> Permit2, Permit2 -> Universal Router, montant EXACT, 1 h) puis la vente EXACT-IN de UNIT pour au moins
 *      `maxInEth` ETH sur la pool UNIT (le chemin du Sell de l app : SETTLE_ALL / TAKE_ALL, struct sans minHop) ;
 *   2. le chemin ETH natif deja servi (misables.js planPayerEnJeton, candidat WETH/USDC ts 50) : exactOutputSingle payable (value =
 *      maxInEth), sweepTokenWithFee, refundETH — puis les appels du jeu, tels que les batit SON module.
 *   L ETH de la jambe 1 couvre la `value` de la jambe 2 (sortieMin = maxInEth) : l ETH du joueur n est pas entame (hors gas) ; le surplus
 *   (la tolerance) lui reste.
 * ⛔ LA REGLE DE UNIT (Phil) : la profondeur se juge au MONTANT REEL paye (0,50 USDC pour un spin), PAS a 10 000 USDC. UNIT est offert SSI
 *   un devis FRAIS a cette taille montre une perte <= 1 % (SEUIL_ECART_BPS, la meme que les autres) ; devis NON LU = non offert, avec la
 *   raison ; au-dessus de 1 % = la raison mesuree. Pas de rang special : la ligne servie a la forme des autres, triee par la meme regle.
 * ⛔ LA PERTE (ecartBps) : la valeur au prix moyen (slot0 des deux pools, LUS AU MEME BLOC) de ce que le joueur cede, NET de l ETH qui lui
 *   revient, contre l USDC qui sort ; frais des pools et du hook compris (le quoter les simule), frais d interface 0,1 % non compris
 *   (comme pour tout misable).
 * ⛔ NON PROUVE ICI : un B20 ne s execute pas hors du noeud Base (pas de bytecode) — aucun fork local ne simule ce swap. Les devis sont des
 *   eth_call sur le noeud Base (le quoter v4 simule le hook) ; l envoi n est pas simule par l app.
 * Pur sauf `coterUnit*`, dont le `rpc` est INJECTE. Rien n est signe ni envoye ici. */
import { USDC, ETH, CANDIDATS_CL, coterMisableTailles, planPayerEnJeton, maxEntree, SEUIL_ECART_BPS, TAILLES_USDC, TOLERANCE_DEFAUT_BPS, DELAI_S } from './misables.js';
import { encodeQuote, encodeV4Swap, paramsAction, ACTIONS_V4, SANS_MINHOP, poolId } from './pool.js';
import { ROUTEUR, QUOTEUR, hookPaieEnDeviseVendable } from './echange.js';
import { etapesPermit2Exactes } from './approbations-exactes.js';
import { PERMIT2, V4_ADRESSES, FEE_POOL, TICK_SPACING_POOL } from './lancer-pool.js';
import { HOOK_7030 } from './tokenomics.js';
import { hookDataReferentO1 } from './referent-o1.js';
import { selecteur } from './keccak.js';

export const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
export const CLE_UNIT = Object.freeze({ currency0: ETH, currency1: UNIT, fee: FEE_POOL, tickSpacing: TICK_SPACING_POOL, hooks: String(HOOK_7030).toLowerCase() });
export const UNIT_POOL_ID = poolId(CLE_UNIT);
export const ROUTE_UNIT = 'unit-v4-eth-cl';
/** la jambe ETH -> USDC : la pool WETH/USDC ts 50 de la factory de notre routeur (765 291 USDC mesures le 24/10) — un candidat de misables.js */
export const CANDIDAT_ETH = CANDIDATS_CL.find((c) => c.natif === true && Number(c.tickSpacing) === 50);
/** la marge de la jambe 1 : on vend assez de UNIT pour ~ maxInEth x (1 + 0,5 %) ; le minimum exige reste maxInEth */
export const MARGE_JAMBE1_BPS = 50n;
const QUOTES_PAR_TAILLE = 3;
/** le plafond des appels d un coterUnitTailles : la jambe ETH (1 tete + 3 etat + 1 devis par taille) + slot0 UNIT + 3 devis v4 par taille */
export const UNIT_APPELS_MAX = (n) => 1 + 3 + n + 1 + QUOTES_PAR_TAILLE * n;

const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const Q192 = 1n << 192n;
const entier = (v) => { try { return v === null || v === undefined || v === '' ? null : BigInt(v); } catch (_) { return null; } };
const refuse = (code, pourquoi, extra = {}) => ({ etat: 'REFUSE', code, pourquoi, appels: [], ...extra });
const nonMesure = (pourquoi, extra = {}) => ({ etat: 'NON_MESURE', code: 'NON_MESURE', pourquoi, appels: [], ...extra });
const mot1 = (hex) => { const h = String(hex || '').slice(2, 66); return /^[0-9a-fA-F]{64}$/.test(h) ? BigInt('0x' + h) : null; };
/** un echec de devis : REVERT (la pool ne remplit pas) ou NON LU (transport, debit, `0x`) — la regle de misables.js */
const estRevert = (e) => { const m = String((e && e.message) || e || ''); return /revert/i.test(m) || (e && typeof e.data === 'string' && /^0x[0-9a-f]{2,}$/i.test(e.data)); };

/* ═══════════════════════════════════════════ LA REGLE ═══════════════════════════════════════════ */

/** la perte (bps) du chemin UNIT -> ETH -> USDC au prix moyen. Tout en wei d ETH :
 *  cede = unitIn au prix moyen UNIT/ETH ; revient = ethSortie - montantInEth (l ETH de la jambe 1 que la jambe 2 ne prend pas) ;
 *  ideal = usdcSortie au prix moyen WETH/USDC. perte = (cede - revient) / ideal - 1. null si un prix manque. */
export function perteUnitBps({ unitIn, ethSortie, montantInEth, usdcSortie, sqrtUnit, sqrtEth }) {
  const u = entier(unitIn), q = entier(ethSortie), m = entier(montantInEth), o = entier(usdcSortie), su = entier(sqrtUnit), se = entier(sqrtEth);
  if (!(u > 0n) || !(q > 0n) || !(m > 0n) || !(o > 0n) || !(su > 0n) || !(se > 0n)) return null;
  /* UNIT est currency1 de ETH/UNIT : UNIT par ETH = su^2 / 2^192 ; WETH (0x42…) < USDC (0x83…) : USDC par WETH = se^2 / 2^192 */
  const cede = (u * Q192) / (su * su);
  const ideal = (o * Q192) / (se * se);
  if (!(ideal > 0n)) return null;
  const net = cede - (q - m);
  return Number(((net - ideal) * 10000n) / ideal);
}

/** EST-CE OFFERT ? Un devis UNIT a UNE taille -> { ok, code, raison, ecartBps }. ⛔ Aucune profondeur minimum : la taille EST le test. */
export function eligibiliteUnit(d, { seuilBps = SEUIL_ECART_BPS } = {}) {
  const non = (code, raison, extra = {}) => ({ ok: false, code, raison, ecartBps: null, ...extra });
  if (!d || typeof d !== 'object') return non('NON_MESURE', 'the UNIT quote was not read');
  if (d.nonLu === true) return non('NON_MESURE', 'the UNIT quote was not read' + (d.erreur ? ' (' + String(d.erreur).slice(0, 80) + ')' : ''));
  if (d.ok !== true || !(entier(d.montantIn) > 0n)) return non('SANS_DEVIS', 'no UNIT quote at ' + String(d.usdc || '?') + ' raw USDC' + (d.erreur ? ' (' + String(d.erreur).slice(0, 80) + ')' : ''));
  const e = Number(d.ecartBps);
  if (d.ecartBps === null || d.ecartBps === undefined || !Number.isFinite(e)) return non('SANS_DEVIS', 'the UNIT quote has no price gap');
  const s = Number(seuilBps);
  if (e > s) return non('ECART', 'paying ' + String(d.usdc) + ' raw USDC with UNIT costs ' + (e / 100).toFixed(2) + '% over the pools mid price (above ' + (s / 100).toFixed(2) + '%)', { ecartBps: e });
  return { ok: true, code: 'MISABLE', raison: null, ecartBps: e };
}

/* ═════════════════════════════════════ LE DEVIS (rpc injecte, lecture seule) ═════════════════════════════════════ */

/**
 * LES DEVIS UNIT pour chaque sortie USDC de `sorties`, TOUS AU MEME BLOC : la jambe ETH (coterMisableTailles du candidat WETH/USDC ts 50),
 * le slot0 de la pool UNIT (StateView), puis, par taille, la quantite de UNIT qui rend au moins maxEntree(montantInEth) x (1 + 0,5 %) ETH
 * (quoter v4 exact-in, au plus 3 devis).
 */
export async function coterUnitTailles({ rpc, sorties = TAILLES_USDC, bloc: blocEpingle = null, stateView = V4_ADRESSES[8453].stateView, quoteur = QUOTEUR[8453] }) {
  if (!CANDIDAT_ETH) return nonMesure('no WETH/USDC pool for the ETH leg');
  const outs = (Array.isArray(sorties) ? sorties : []).map(entier);
  if (!outs.length || outs.some((o) => o === null || o <= 0n)) return nonMesure('each USDC output must be > 0');
  let bloc = Number.isSafeInteger(Number(blocEpingle)) && Number(blocEpingle) > 0 ? Number(blocEpingle) : null;
  if (bloc === null) { try { bloc = Number(BigInt(await rpc('eth_blockNumber', []))); } catch (_) { return nonMesure('the head block could not be read'); } }
  const tag = '0x' + bloc.toString(16);
  const eth = await coterMisableTailles({ rpc, candidat: CANDIDAT_ETH, sorties: outs, bloc });
  if (!eth || eth.etat !== 'PRET') return nonMesure('the ETH leg could not be read: ' + String((eth && eth.pourquoi) || 'no answer').slice(0, 100), { bloc });
  let sqrtUnit = null;
  try { sqrtUnit = mot1(await rpc('eth_call', [{ to: stateView, data: '0x' + selecteur('getSlot0(bytes32)').replace(/^0x/, '') + UNIT_POOL_ID.slice(2) }, tag])); } catch (_) { sqrtUnit = null; }
  if (!(sqrtUnit > 0n)) return nonMesure('the UNIT pool price could not be read', { bloc });
  const coter = async (u) => {
    try { const r = await rpc('eth_call', [{ to: quoteur, data: encodeQuote({ cle: CLE_UNIT, zeroForOne: false, montant: u }) }, tag]); const q = mot1(r); return q === null ? { nonLu: true, erreur: 'quote answer unreadable' } : { q }; }
    catch (e) { return estRevert(e) ? { revert: true, erreur: String((e && e.message) || e).slice(0, 100) } : { nonLu: true, erreur: String((e && e.message) || e).slice(0, 100) }; }
  };
  const devis = [];
  for (let i = 0; i < outs.length; i += 1) {
    const de = eth.devis[i], usdc = String(outs[i]);
    if (!de || de.ok !== true) { devis.push({ usdc, ok: false, ...(de && de.nonLu ? { nonLu: true } : {}), erreur: 'ETH leg: ' + String((de && de.erreur) || 'no quote') }); continue; }
    const montantInEth = BigInt(de.montantIn), maxInEth = maxEntree(montantInEth, TOLERANCE_DEFAUT_BPS);
    const cible = (maxInEth * (10000n + MARGE_JAMBE1_BPS) + 9999n) / 10000n;
    /* premier essai : la cible au prix moyen ; puis on corrige au prorata du devis, au plus QUOTES_PAR_TAILLE devis */
    let u = (cible * sqrtUnit * sqrtUnit + Q192 - 1n) / Q192 + 1n, q = null, fin = null;
    for (let k = 0; k < QUOTES_PAR_TAILLE; k += 1) {
      const r = await coter(u);
      if (r.nonLu) { fin = { nonLu: true, erreur: r.erreur }; break; }
      if (r.revert || !(r.q > 0n)) { fin = { erreur: r.erreur || 'empty quote' }; break; }
      q = r.q;
      if (q >= cible) break;
      u = (u * cible + q - 1n) / q + u / 10000n + 1n;
      q = null;
    }
    if (q === null) { devis.push({ usdc, ok: false, ...(fin && fin.nonLu ? { nonLu: true } : {}), erreur: (fin && fin.erreur) || 'the UNIT pool does not fill this amount' }); continue; }
    const ecartBps = perteUnitBps({ unitIn: u, ethSortie: q, montantInEth, usdcSortie: outs[i], sqrtUnit, sqrtEth: eth.sqrtPriceX96 });
    devis.push({ usdc, ok: ecartBps !== null, montantIn: u, ethSortie: q, montantInEth, maxInEth, ecartBps, ...(ecartBps === null ? { erreur: 'price gap not computable' } : {}) });
  }
  return { etat: 'PRET', jeton: UNIT, symbole: 'UNIT', famille: 'unit', route: ROUTE_UNIT, poolUnit: UNIT_POOL_ID, bloc, sqrtUnit, eth, devis };
}

/** LE DEVIS VIVANT pour UNE sortie (celle que le plan exige : usdcAViser) — la forme que planPayerEnUnit lit */
export async function coterUnit({ rpc, usdcSortie, ...o }) {
  const t = await coterUnitTailles({ rpc, sorties: [usdcSortie], ...o });
  if (t.etat !== 'PRET') return t;
  const d = t.devis[0], de = t.eth.devis[0];
  const { devis: _d, ...ethBase } = t.eth;
  return { etat: 'PRET', jeton: UNIT, symbole: 'UNIT', route: ROUTE_UNIT, bloc: t.bloc, usdcSortie: entier(usdcSortie), ...d,
    eth: de && de.ok ? { ...ethBase, usdcSortie: de.usdcSortie, montantIn: de.montantIn, ecartBps: de.ecartBps } : null };
}

/** LA LIGNE SERVIE (/api/misables), a la forme de ligneMisable : la regle de UNIT a chaque taille */
export function ligneUnit(cot) {
  const ok = !!(cot && cot.etat === 'PRET');
  const tailles = TAILLES_USDC.map((t, i) => {
    const d = ok ? cot.devis.find((x) => entier(x.usdc) === t) || null : null;
    const e = ok ? eligibiliteUnit(d) : { ok: false, code: 'NON_MESURE', raison: (cot && cot.pourquoi) || 'not read', ecartBps: null };
    return { usdc: String(t), misable: e.ok === true, code: e.code, raison: e.raison, ecartBps: e.ecartBps ?? (d && Number.isFinite(Number(d.ecartBps)) ? d.ecartBps : null), coutReferenceBps: null,
      montantIn: d && d.ok ? String(d.montantIn) : null };
  });
  return { jeton: UNIT, symbole: 'UNIT', famille: 'unit', natif: false, route: ROUTE_UNIT, pool: CANDIDAT_ETH ? bas(CANDIDAT_ETH.pool) : null, poolUnit: UNIT_POOL_ID,
    tickSpacing: TICK_SPACING_POOL, factory: ok ? cot.eth.factory : null, usdcPool: null, referencePool: null, ecartReferenceBps: null, bloc: ok ? cot.bloc : null,
    misable: tailles[0].misable, tailles };
}

/* ══════════════════════════════════════════════ LE PLAN ══════════════════════════════════════════════ */

/**
 * PAYER UN JEU AVEC UNIT. Pur. Rend { etat, code, pourquoi, appels, resume, exigeAtomique: true }.
 * @param {object} p.devis  coterUnit (un devis VIVANT a la sortie exacte du plan)
 */
export function planPayerEnUnit({ devis, compte, jeu, blocActuel, maintenant, seuilBps = SEUIL_ECART_BPS, ...reste } = {}) {
  if (!devis || bas(devis.jeton) !== UNIT) return refuse('SANS_DEVIS', 'no live UNIT quote: nothing is built on an unread price');
  if (devis.etat && devis.etat !== 'PRET') return refuse('NON_MESURE', 'the UNIT quote was not read: ' + String(devis.pourquoi || '').slice(0, 100));
  const el = eligibiliteUnit(devis, { seuilBps });
  if (!el.ok) return refuse(el.code, 'not payable with UNIT: ' + el.raison, { ecartBps: el.ecartBps });
  if (!devis.eth || Number(devis.eth.bloc) !== Number(devis.bloc)) return refuse('DEVIS', 'the two legs were not read at the same block');
  const planEth = planPayerEnJeton({ devis: devis.eth, compte, jeu, blocActuel, maintenant, seuilBps, ...reste });
  if (planEth.etat !== 'PRET') return refuse(planEth.code || 'JEU', 'the ETH leg refuses: ' + String(planEth.pourquoi || ''), { ecartBps: planEth.ecartBps ?? null });
  const r2 = planEth.resume, unitIn = entier(devis.montantIn), q = entier(devis.ethSortie), maxInEth = entier(devis.maxInEth);
  if (maxInEth !== r2.maxEntree) return refuse('DEVIS_MONTANT', 'the UNIT leg was sized for ' + devis.maxInEth + ' wei, the ETH leg needs ' + r2.maxEntree + ': quote again');
  if (!(q >= maxInEth)) return refuse('DEVIS', 'the UNIT leg returns less ETH than the ETH leg may take');
  const hp = hookPaieEnDeviseVendable({ cle: CLE_UNIT, sens: 'VENTE', zeroForOne: false, jeton: UNIT });
  if (!hp.paie) return refuse('FRAIS', 'the UNIT pool hook does not take its fee in ETH here: no fee route is proven, nothing is built');
  const now = Number(maintenant);
  const ap = etapesPermit2Exactes({ jeton: UNIT, permit2: PERMIT2, routeur: ROUTEUR[8453], montant: unitIn, maintenantSec: now, libelleJeton: 'UNIT' });
  if (ap.etat !== 'OK') return refuse('APPROBATION', ap.pourquoi);
  let data;
  try {
    data = encodeV4Swap({ cle: CLE_UNIT, zeroForOne: false, montant: unitIn, sortieMin: maxInEth, deadline: BigInt(now + DELAI_S), forme: SANS_MINHOP,
      actions: [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(UNIT, unitIn) }, { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(ETH, maxInEth) }],
      hookData: hookDataReferentO1({ cle: CLE_UNIT }) });
  } catch (e) { return refuse('CALLDATA', String((e && e.message) || e).slice(0, 160)); }
  const appels = [
    ...ap.etapes.map((x) => ({ to: bas(x.to), data: x.data, value: '0x0', quoi: x.nom })),
    { to: bas(ROUTEUR[8453]), data, value: '0x0', quoi: 'sell exactly ' + unitIn + ' raw UNIT for at least ' + maxInEth + ' wei ETH on the UNIT pool' },
    ...planEth.appels,
  ];
  return {
    etat: 'PRET', code: 'PRET', pourquoi: null, appels,
    /* ⛔ ATOMIQUE EXIGE : a la suite, un arret entre la jambe 1 et la jambe 2 laisserait de l ETH et des approbations que l ecran d arret
     *   (payer-arret.js) ne sait pas nommer pour ce chemin. Sans lot atomique : refuse, rien n est envoye. */
    exigeAtomique: true, atomiquePrefere: true,
    resume: { ...r2, jeton: UNIT, symbole: 'UNIT', natif: false, route: ROUTE_UNIT, poolUnit: UNIT_POOL_ID, maxEntree: unitIn, entreeCotee: unitIn,
      ethIntermediaire: maxInEth, ethSortieCotee: q, ecartBps: Number(devis.ecartBps), devisBloc: Number(devis.bloc) },
  };
}
