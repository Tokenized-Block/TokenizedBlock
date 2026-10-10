/* banque-morpho.js — TokenizedBank, PHASE 1 : preter de l USDC, ou deposer une ACTION TOKENISEE en garantie et emprunter de l USDC,
 *   sur les marches Morpho Blue QUI EXISTENT DEJA sur Base. Aucun contrat neuf, aucune signature ici : des plans NON SIGNES.
 *   Design et decisions ouvertes : vault `TOKENIZEDBANK-design-2026-10-10.md`.
 *
 * ⛔⛔ MESURE AVANT DE CODER (2026-10-10, lecture seule) :
 *   - blue-api.morpho.org : 13 marches Base dont la garantie est une action de notre registre, tous pretent de l USDC (≈ 17 k$ en tout,
 *     utilisation ≈ 90 %). Forme de l API lue par introspection.
 *   - MORPHO_BLUE ci-dessous : adresse RENDUE PAR L API (morphoBlue.address, chaine 8453), code lu sur la chaine (15 623 octets) ;
 *     idToMarketParams(GOOGLc/USDC) lu sur la chaine == parametres de l API ; price() de l oracle -> 1 GOOGLc = 352,63 USDC.
 *   - Les 10 signatures appelees ici : leur selecteur figure dans le bytecode deploye (PUSH4), un temoin invente n y est pas.
 *
 * ⛔ DOCTRINE (celle des rails) : trois etats (PRET / REFUSE / NON_MESURE) ; une lecture ratee n est JAMAIS 0 ni un « oui » ;
 *   chaque plan est SIMULE par eth_simulateV1 depuis le compte avant d etre PRET (le meme jour, 11 actions avaient un achat PRET
 *   qui revertait : un plan non simule fait payer du gaz pour un echec) ; approbations au MONTANT EXACT, jamais l infini.
 * ⛔ PERIMETRE : seulement les marches dont la GARANTIE est une action de NOTRE registre (ACTIONS_COINBASE). Un block en garantie
 *   N EST PAS ouvert : decision de Phil en attente (pools minces = prix manipulable, voir le design §4).
 */
import { selecteur } from './encodeur.js';
import { simulerSequenceLancement } from './lancer-pool.js';
import { ACTIONS_COINBASE } from './paires.js';

export const MORPHO_BLUE = '0xbbbbbbbbbb9cc5e90e3b3af64bdaf62c37eeffcb';
/** Marge d emprunt : au plus 70 % de ce que le LLTV permet (a LLTV 77 %, ≈ 54 % de la valeur de la garantie). Proposition,
 *  pas une decision de Phil — ecrite UNE fois ici. */
export const MARGE_EMPRUNT_BPS = 7000n;
const WAD = 10n ** 18n, ECHELLE_PRIX = 10n ** 36n;
const ADR = /^0x[0-9a-f]{40}$/;
const ACTIONS = new Map(ACTIONS_COINBASE.map((a) => [String(a.adr).toLowerCase(), a.symbole]));
const MP = '(address,address,address,address,uint256)';
export const SEL = Object.freeze({
  supply: selecteur('supply(' + MP + ',uint256,uint256,address,bytes)'),
  withdraw: selecteur('withdraw(' + MP + ',uint256,uint256,address,address)'),
  borrow: selecteur('borrow(' + MP + ',uint256,uint256,address,address)'),
  repay: selecteur('repay(' + MP + ',uint256,uint256,address,bytes)'),
  supplyCollateral: selecteur('supplyCollateral(' + MP + ',uint256,address,bytes)'),
  withdrawCollateral: selecteur('withdrawCollateral(' + MP + ',uint256,address,address)'),
  position: selecteur('position(bytes32,address)'),
  market: selecteur('market(bytes32)'),
  idToMarketParams: selecteur('idToMarketParams(bytes32)'),
  price: selecteur('price()'),
  approve: selecteur('approve(address,uint256)'),
  allowance: selecteur('allowance(address,address)'),
  balanceOf: selecteur('balanceOf(address)'),
});

const motAdr = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const motNb = (n) => BigInt(n).toString(16).padStart(64, '0');
const mots = (hex) => String(hex || '').replace(/^0x/, '').match(/.{64}/g) || [];
const motVersAdr = (w) => '0x' + w.slice(24);
const mpMots = (p) => motAdr(p.loanToken) + motAdr(p.collateralToken) + motAdr(p.oracle) + motAdr(p.irm) + motNb(p.lltv);
const BYTES_VIDES = motNb(0); /* longueur 0 */

/* ── l encodage, une fonction par appel (tete statique ; `bytes` vide en queue) ───────────────────────────────────────────── */
export const appelSupply = (p, assets, onBehalf) => '0x' + SEL.supply + mpMots(p) + motNb(assets) + motNb(0) + motAdr(onBehalf) + motNb(9 * 32) + BYTES_VIDES;
export const appelBorrow = (p, assets, onBehalf, receiver) => '0x' + SEL.borrow + mpMots(p) + motNb(assets) + motNb(0) + motAdr(onBehalf) + motAdr(receiver);
export const appelRepayAssets = (p, assets, onBehalf) => '0x' + SEL.repay + mpMots(p) + motNb(assets) + motNb(0) + motAdr(onBehalf) + motNb(9 * 32) + BYTES_VIDES;
export const appelRepayShares = (p, shares, onBehalf) => '0x' + SEL.repay + mpMots(p) + motNb(0) + motNb(shares) + motAdr(onBehalf) + motNb(9 * 32) + BYTES_VIDES;
export const appelSupplyCollateral = (p, assets, onBehalf) => '0x' + SEL.supplyCollateral + mpMots(p) + motNb(assets) + motAdr(onBehalf) + motNb(8 * 32) + BYTES_VIDES;
export const appelWithdrawCollateral = (p, assets, onBehalf, receiver) => '0x' + SEL.withdrawCollateral + mpMots(p) + motNb(assets) + motAdr(onBehalf) + motAdr(receiver);
export const appelWithdraw = (p, assets, onBehalf, receiver) => '0x' + SEL.withdraw + mpMots(p) + motNb(assets) + motNb(0) + motAdr(onBehalf) + motAdr(receiver);
const appelApprove = (spender, montant) => '0x' + SEL.approve + motAdr(spender) + motNb(montant);

const nonMesure = (pourquoi) => ({ etat: 'NON_MESURE', pourquoi, aSigner: [] });
const refuse = (pourquoi, resume) => ({ etat: 'REFUSE', pourquoi, aSigner: [], ...(resume ? { resume } : {}) });
const divHaut = (a, b) => (a + b - 1n) / b;

/** Un marche Morpho, LU sur la chaine : parametres, totaux, prix de l oracle. NON_LU si une seule lecture manque. */
export async function lireMarche({ rpc, id }) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(String(id || ''))) return { etat: 'REFUSE', pourquoi: 'a whole market id (bytes32) is required' };
  const k = String(id).toLowerCase();
  try {
    const w = mots(await rpc('eth_call', [{ to: MORPHO_BLUE, data: '0x' + SEL.idToMarketParams + k.slice(2) }, 'latest']));
    if (w.length < 5) return { etat: 'NON_LU', pourquoi: 'market params not read' };
    const params = { loanToken: motVersAdr(w[0]), collateralToken: motVersAdr(w[1]), oracle: motVersAdr(w[2]), irm: motVersAdr(w[3]), lltv: BigInt('0x' + w[4]) };
    if (/^0x0{40}$/.test(params.loanToken)) return { etat: 'REFUSE', pourquoi: 'no Morpho market has this id' };
    const t = mots(await rpc('eth_call', [{ to: MORPHO_BLUE, data: '0x' + SEL.market + k.slice(2) }, 'latest']));
    if (t.length < 6) return { etat: 'NON_LU', pourquoi: 'market totals not read' };
    const totaux = { supplyAssets: BigInt('0x' + t[0]), supplyShares: BigInt('0x' + t[1]), borrowAssets: BigInt('0x' + t[2]), borrowShares: BigInt('0x' + t[3]) };
    const p = mots(await rpc('eth_call', [{ to: params.oracle, data: '0x' + SEL.price }, 'latest']));
    if (p.length < 1) return { etat: 'NON_LU', pourquoi: 'oracle price not read' };
    const prix = BigInt('0x' + p[0]);
    if (prix <= 0n) return { etat: 'NON_LU', pourquoi: 'oracle price is zero' };
    return { etat: 'LU', id: k, params, totaux, prix, liquidite: totaux.supplyAssets > totaux.borrowAssets ? totaux.supplyAssets - totaux.borrowAssets : 0n };
  } catch (e) { return { etat: 'NON_LU', pourquoi: 'market not read: ' + String((e && e.message) || e).slice(0, 100) }; }
}

/** La position d un compte : garantie, dette (en actifs, arrondie VERS LE HAUT — la dette n est jamais sous-estimee). */
export async function lirePosition({ rpc, marche, compte }) {
  try {
    const w = mots(await rpc('eth_call', [{ to: MORPHO_BLUE, data: '0x' + SEL.position + marche.id.slice(2) + motAdr(compte) }, 'latest']));
    if (w.length < 3) return { etat: 'NON_LU' };
    const supplyShares = BigInt('0x' + w[0]), borrowShares = BigInt('0x' + w[1]), garantie = BigInt('0x' + w[2]);
    const { borrowAssets, borrowShares: tot } = marche.totaux;
    const dette = borrowShares === 0n ? 0n : tot === 0n ? 0n : divHaut(borrowShares * borrowAssets, tot);
    return { etat: 'LU', supplyShares, borrowShares, garantie, dette };
  } catch (_) { return { etat: 'NON_LU' }; }
}

/** Ce qu une garantie permet d emprunter : max (LLTV) et plafond (marge). En unites brutes de l actif prete. */
export function capacite({ garantie, prix, lltv }) {
  const valeur = (garantie * prix) / ECHELLE_PRIX; /* unites brutes de pret */
  const max = (valeur * lltv) / WAD;
  return { valeur, max, plafond: (max * MARGE_EMPRUNT_BPS) / 10000n };
}

async function lireEntier(rpc, to, data) { const w = mots(await rpc('eth_call', [{ to, data }, 'latest'])); return w.length ? BigInt('0x' + w[0]) : null; }

async function finaliser({ rpc, compte, appels, resume }) {
  const s = await simulerSequenceLancement({ rpc, compte, appels });
  if (s.etat === 'ACCEPTE') return { etat: 'PRET', pourquoi: null, aSigner: appels, resume: { ...resume, simule: true } };
  if (s.etat === 'REFUSE') return { etat: 'REFUSE', pourquoi: 'the chain refuses this exact sequence — ' + s.pourquoi, aSigner: [], resume };
  return { etat: 'NON_MESURE', pourquoi: 'not simulated, so not offered: ' + s.pourquoi, aSigner: [], resume };
}

function garde({ marche, compte }) {
  if (!ADR.test(String(compte || '').toLowerCase())) return refuse('a whole account address is required');
  if (marche.etat !== 'LU') return marche.etat === 'REFUSE' ? refuse(marche.pourquoi) : nonMesure(marche.pourquoi);
  if (!ACTIONS.has(marche.params.collateralToken)) return refuse('this market\'s collateral is not a tokenized stock of our registry — not offered here');
  return null;
}

/** Deposer `garantie` unites brutes d une action (0 = aucune) et emprunter `emprunt` unites brutes de l actif prete. */
export async function planEmprunter({ rpc, compte, id, garantie = 0n, emprunt }) {
  const marche = await lireMarche({ rpc, id });
  const g = garde({ marche, compte }); if (g) return g;
  let G, E; try { G = BigInt(garantie); E = BigInt(emprunt); } catch (_) { return refuse('amounts are raw integer units'); }
  if (G < 0n || E <= 0n) return refuse('borrow a positive amount; collateral cannot be negative');
  const c = String(compte).toLowerCase(), p = marche.params;
  const pos = await lirePosition({ rpc, marche, compte: c });
  if (pos.etat !== 'LU') return nonMesure('your position on this market could not be read');
  const cap = capacite({ garantie: pos.garantie + G, prix: marche.prix, lltv: p.lltv });
  const resume = { marche: marche.id, garantieAction: ACTIONS.get(p.collateralToken), garantieApres: (pos.garantie + G).toString(),
    detteApres: (pos.dette + E).toString(), plafond: cap.plafond.toString(), maxLltv: cap.max.toString(), lltv: p.lltv.toString(),
    liquiditeMarche: marche.liquidite.toString(), marge: Number(MARGE_EMPRUNT_BPS) / 100 + ' % of the LLTV limit' };
  if (pos.dette + E > cap.plafond) return refuse('too much for this collateral: at most ' + (cap.plafond > pos.dette ? cap.plafond - pos.dette : 0n) + ' raw units more (we keep a ' + resume.marge + ' margin)', resume);
  if (E > marche.liquidite) return refuse('this market has only ' + marche.liquidite + ' raw units to lend right now', resume);
  /* le prix de la garantie auquel la position devient liquidable (unites brutes de pret par unite brute de garantie × 1e36) */
  const garantieApres = pos.garantie + G;
  resume.prixLiquidation = garantieApres > 0n ? divHaut((pos.dette + E) * WAD * ECHELLE_PRIX, garantieApres * p.lltv).toString() : null;
  resume.prixActuel = marche.prix.toString();
  const appels = [];
  if (G > 0n) {
    let solde, autorise;
    try { solde = await lireEntier(rpc, p.collateralToken, '0x' + SEL.balanceOf + motAdr(c)); autorise = await lireEntier(rpc, p.collateralToken, '0x' + SEL.allowance + motAdr(c) + motAdr(MORPHO_BLUE)); } catch (_) { solde = null; }
    if (solde === null || autorise === null) return nonMesure('your balance or allowance of the collateral could not be read');
    if (solde < G) return refuse('this wallet holds ' + solde + ' raw units of the collateral, not ' + G, resume);
    if (autorise < G) appels.push({ to: p.collateralToken, data: appelApprove(MORPHO_BLUE, G), value: '0x0', nom: 'allow Morpho to take exactly this collateral' });
    appels.push({ to: MORPHO_BLUE, data: appelSupplyCollateral(p, G, c), value: '0x0', nom: 'deposit the stock as collateral on Morpho' });
  }
  appels.push({ to: MORPHO_BLUE, data: appelBorrow(p, E, c, c), value: '0x0', nom: 'borrow on Morpho, to your own wallet' });
  return finaliser({ rpc, compte: c, appels, resume });
}

/** Preter `montant` unites brutes de l actif prete du marche (USDC). */
export async function planPreter({ rpc, compte, id, montant }) {
  const marche = await lireMarche({ rpc, id });
  const g = garde({ marche, compte }); if (g) return g;
  let M; try { M = BigInt(montant); } catch (_) { return refuse('amounts are raw integer units'); }
  if (M <= 0n) return refuse('lend a positive amount');
  const c = String(compte).toLowerCase(), p = marche.params;
  let solde, autorise;
  try { solde = await lireEntier(rpc, p.loanToken, '0x' + SEL.balanceOf + motAdr(c)); autorise = await lireEntier(rpc, p.loanToken, '0x' + SEL.allowance + motAdr(c) + motAdr(MORPHO_BLUE)); } catch (_) { solde = null; }
  if (solde === null || autorise === null) return nonMesure('your balance or allowance could not be read');
  const resume = { marche: marche.id, garantieAction: ACTIONS.get(p.collateralToken), prete: M.toString(), offreAvant: marche.totaux.supplyAssets.toString() };
  if (solde < M) return refuse('this wallet holds ' + solde + ' raw units, not ' + M, resume);
  const appels = [];
  if (autorise < M) appels.push({ to: p.loanToken, data: appelApprove(MORPHO_BLUE, M), value: '0x0', nom: 'allow Morpho to take exactly this amount' });
  appels.push({ to: MORPHO_BLUE, data: appelSupply(p, M, c), value: '0x0', nom: 'lend on Morpho (you can withdraw what is not borrowed)' });
  return finaliser({ rpc, compte: c, appels, resume });
}

/** Rembourser : `montant` unites brutes, ou `tout: true` (par parts : la dette entiere, interets courus compris). */
export async function planRembourser({ rpc, compte, id, montant = null, tout = false }) {
  const marche = await lireMarche({ rpc, id });
  const g = garde({ marche, compte }); if (g) return g;
  const c = String(compte).toLowerCase(), p = marche.params;
  const pos = await lirePosition({ rpc, marche, compte: c });
  if (pos.etat !== 'LU') return nonMesure('your position could not be read');
  if (pos.borrowShares === 0n) return refuse('nothing to repay on this market');
  /* ⛔ par parts, la dette grossit entre la lecture et l envoi : on autorise la dette lue + 0,1 % (arrondi haut), dit dans le resume */
  const besoin = tout ? divHaut(pos.dette * 10010n, 10000n) : BigInt(montant || 0);
  if (besoin <= 0n) return refuse('repay a positive amount, or all');
  let solde, autorise;
  try { solde = await lireEntier(rpc, p.loanToken, '0x' + SEL.balanceOf + motAdr(c)); autorise = await lireEntier(rpc, p.loanToken, '0x' + SEL.allowance + motAdr(c) + motAdr(MORPHO_BLUE)); } catch (_) { solde = null; }
  if (solde === null || autorise === null) return nonMesure('your balance or allowance could not be read');
  const resume = { marche: marche.id, detteLue: pos.dette.toString(), autorise: besoin.toString(), tout: !!tout, ...(tout ? { tolerance: 'the debt read + 0.1 % (interest accrues until the transaction lands)' } : {}) };
  if (solde < (tout ? pos.dette : besoin)) return refuse('this wallet holds ' + solde + ' raw units, the debt is ' + pos.dette, resume);
  const appels = [];
  if (autorise < besoin) appels.push({ to: p.loanToken, data: appelApprove(MORPHO_BLUE, besoin), value: '0x0', nom: 'allow Morpho to take at most this amount' });
  appels.push({ to: MORPHO_BLUE, data: tout ? appelRepayShares(p, pos.borrowShares, c) : appelRepayAssets(p, besoin, c), value: '0x0', nom: tout ? 'repay the whole debt on Morpho' : 'repay on Morpho' });
  return finaliser({ rpc, compte: c, appels, resume });
}

/** Retirer `montant` unites brutes de garantie — seulement si la dette restante tient sous le plafond (marge comprise). */
export async function planRetirerGarantie({ rpc, compte, id, montant }) {
  const marche = await lireMarche({ rpc, id });
  const g = garde({ marche, compte }); if (g) return g;
  let M; try { M = BigInt(montant); } catch (_) { return refuse('amounts are raw integer units'); }
  const c = String(compte).toLowerCase(), p = marche.params;
  const pos = await lirePosition({ rpc, marche, compte: c });
  if (pos.etat !== 'LU') return nonMesure('your position could not be read');
  if (M <= 0n || M > pos.garantie) return refuse('you can withdraw between 1 and ' + pos.garantie + ' raw units');
  const cap = capacite({ garantie: pos.garantie - M, prix: marche.prix, lltv: p.lltv });
  const resume = { marche: marche.id, garantieApres: (pos.garantie - M).toString(), dette: pos.dette.toString(), plafondApres: cap.plafond.toString() };
  if (pos.dette > cap.plafond) return refuse('your debt would be too close to liquidation after this withdrawal — repay first', resume);
  return finaliser({ rpc, compte: c, appels: [{ to: MORPHO_BLUE, data: appelWithdrawCollateral(p, M, c, c), value: '0x0', nom: 'withdraw your collateral from Morpho' }], resume });
}
