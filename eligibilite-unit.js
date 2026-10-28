/* eligibilite-unit.js — QUI PARTAGE LE POT UNIT D UN JOUR (Phil 2026-10-28, relaye par le lead) : le ticket du jour (memes regles qu aujourd hui)
 * ET au moins 10 $ d UNIT detenus A LA FIN DU JOUR. Le pot USDC ne change pas.
 * ⛔ DIFFICILE A JOUER :
 *   - le SOLDE est balanceOf(wallet) lu AU DERNIER BLOC du jour UTC (blocAuTemps, recherche par horodatage), jamais au bloc courant :
 *     acheter juste avant le claim ne sert a rien ;
 *   - le PRIX de l UNIT en USD est le spot de la pool UNIT de l app (ETH/UNIT, getSlot0 par StateView) fois le prix de l ETH (mediane des
 *     pools ETH/USDC de prix-eth.js, au moins LECTURES_MIN lectures, ecart <= ECART_MAX), AU MEME BLOC — et le PLUS BAS de ce prix et de
 *     celui ~10 minutes plus tot (bloc de fin_du_jour - 600 s) : une pool mince poussee pendant un bloc ne fait pas passer le seuil ;
 *   - solde ou prix NON LU -> NON eligible, et la raison est dite. Jamais un zero, jamais un « eligible par defaut ».
 * PUR : les lectures sont injectees (lireTs(n) -> horodatage du bloc n ; lire(to, data, bloc) -> mot hex d un eth_call a ce bloc). */
import { selecteur } from './keccak.js';
import { mediane, ecartRelatif, LECTURES_MIN, ECART_MAX } from './prix-eth.js';

export const SEUIL_USD_UNIT = 10;
export const RECUL_PRIX_S = 600;
const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const SEL_SLOT0 = selecteur('getSlot0(bytes32)').replace(/^0x/, '');
const SEL_BAL = selecteur('balanceOf(address)').replace(/^0x/, '');

/** le DERNIER bloc dont l horodatage est <= ts (recherche dichotomique sur [1, tete]) ; null si illisible */
export async function blocAuTemps({ lireTs, tete, ts }) {
  let lo = 1, hi = Number(tete);
  if (!Number.isSafeInteger(hi) || hi < 1) return null;
  const tHi = await lireTs(hi);
  if (!Number.isFinite(tHi)) return null;
  if (tHi <= ts) return null; /* le moment n est pas encore passe a la tete lue : pas de « dernier bloc » */
  const tLo = await lireTs(lo);
  if (!Number.isFinite(tLo) || tLo > ts) return null;
  while (hi - lo > 1) {
    const mi = Math.floor((lo + hi) / 2), t = await lireTs(mi);
    if (!Number.isFinite(t)) return null;
    if (t <= ts) lo = mi; else hi = mi;
  }
  return lo;
}

/** currency1 brut par currency0 brut, depuis la reponse de getSlot0 ; null si illisible */
export function prixDuSlot0(hex) {
  const s = String(hex || '');
  if (!/^0x[0-9a-fA-F]{64,}$/.test(s)) return null;
  const sqrt = BigInt('0x' + s.slice(2, 66));
  if (sqrt <= 0n) return null;
  const x = Number(sqrt) / 2 ** 96;
  const p = x * x;
  return Number.isFinite(p) && p > 0 ? p : null;
}

/** le prix d 1 UNIT en USD au bloc `bloc` ; null si une lecture manque. UNIT pool : currency0 = ETH, currency1 = UNIT (18 / 18) ;
 *  ETH/USDC : currency0 = ETH, currency1 = USDC (18 / 6). */
export async function prixUnitUsd({ lire, stateView, idUnit, idsEth, bloc }) {
  let unitParEth = null;
  try { unitParEth = prixDuSlot0(await lire(stateView, '0x' + SEL_SLOT0 + bas(idUnit).replace(/^0x/, ''), bloc)); } catch (_) { unitParEth = null; }
  if (unitParEth === null) return null;
  const eth = [];
  for (const id of idsEth || []) {
    let p = null;
    try { p = prixDuSlot0(await lire(stateView, '0x' + SEL_SLOT0 + bas(id).replace(/^0x/, ''), bloc)); } catch (_) { p = null; }
    if (p !== null) eth.push(p * 1e12);
  }
  if (eth.length < LECTURES_MIN) return null;
  const e = ecartRelatif(eth);
  if (e === null || e > ECART_MAX) return null;
  const usdParEth = mediane(eth);
  return usdParEth === null ? null : usdParEth / unitParEth;
}

/** LA REGLE : solde (UNIT brut, 18) x le PLUS BAS des deux prix >= seuil ; tout ce qui n est pas lu -> non eligible, avec la raison */
export function eligibleUnit({ balance, prixFin, prixAvant, seuilUsd = SEUIL_USD_UNIT }) {
  if (balance === null || balance === undefined) return { ok: false, usd: null, pourquoi: 'UNIT balance not read' };
  if (!Number.isFinite(prixFin) || !Number.isFinite(prixAvant) || prixFin <= 0 || prixAvant <= 0) return { ok: false, usd: null, pourquoi: 'UNIT price not read' };
  const prix = Math.min(prixFin, prixAvant);
  const usd = (Number(BigInt(balance)) / 1e18) * prix;
  return usd >= seuilUsd ? { ok: true, usd, pourquoi: null } : { ok: false, usd, pourquoi: 'holds $' + usd.toFixed(2) + ' of UNIT at the end of the day, below $' + seuilUsd };
}

/** UN jour : { ok, blocFin, blocAvant, prixFin, prixAvant, parWallet: { w: { ok, usd, pourquoi } } } ; ok:false si le jour n est pas fini
 *  ou si les blocs ne se lisent pas (alors chaque wallet est NON eligible, la raison dite) */
export async function evaluerJour({ day, wallets, lireTs, tete, lire, stateView, idUnit, idsEth, unit, seuilUsd = SEUIL_USD_UNIT }) {
  const liste = [...new Set((wallets || []).map(bas))].filter((w) => ADR.test(w));
  const tous = (pourquoi) => Object.fromEntries(liste.map((w) => [w, { ok: false, usd: null, pourquoi }]));
  const fin = (Number(day) + 1) * 86400 - 1;
  const blocFin = await blocAuTemps({ lireTs, tete, ts: fin }).catch(() => null);
  if (blocFin === null) return { ok: false, pourquoi: 'the last block of the day could not be read (or the day is not over)', parWallet: tous('UNIT balance not read') };
  const blocAvant = await blocAuTemps({ lireTs, tete, ts: fin - RECUL_PRIX_S }).catch(() => null);
  const prixFin = await prixUnitUsd({ lire, stateView, idUnit, idsEth, bloc: blocFin });
  const prixAvant = blocAvant === null ? null : await prixUnitUsd({ lire, stateView, idUnit, idsEth, bloc: blocAvant });
  const parWallet = {};
  for (const w of liste) {
    let balance = null;
    try { const r = await lire(unit, '0x' + SEL_BAL + w.slice(2).padStart(64, '0'), blocFin); balance = /^0x[0-9a-fA-F]{1,64}$/.test(String(r)) ? BigInt(r) : null; } catch (_) { balance = null; }
    parWallet[w] = { ...eligibleUnit({ balance, prixFin, prixAvant, seuilUsd }), balance: balance === null ? null : balance.toString() };
  }
  return { ok: true, blocFin, blocAvant, prixFin, prixAvant, parWallet };
}
