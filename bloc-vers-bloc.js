/* bloc-vers-bloc.js — LES SAUTS D UN ECHANGE BLOCK A -> BLOCK B, EN UNE TRANSACTION.
 *
 * ⛔⛔ DECISION DE PHIL, 2026-10-03 : un block s echange contre n importe quel autre block. On VEND A sur SON marche, on
 *   ACHETE B sur le SIEN ; chaque marche preleve son frais de hook sur la chaine, le routeur ne prend rien
 *   (regle unique : pool-sans-hook.js `hooksDeRoute`, jugee par planEchangeMultiSauts).
 * ⛔ CE MODULE NE LIT RIEN ET NE DEVINE RIEN : il recoit les deux marches DEJA LUS (vieDuBlock, cle exacte) et rend les
 *   sauts, ou un refus qui dit pourquoi. La cotation et toutes les gardes de frais restent dans planEchangeMultiSauts.
 * Routes construites :
 *   · meme devise de cotation (ETH/ETH, USDC/USDC, SPCXc/SPCXc…) : A -> devise -> B, 2 sauts ;
 *   · ETH d un cote, USDC de l autre : un saut du milieu sur la pool v4 ETH/USDC SANS hook (500/10), une des quatre
 *     mesurees initialisees (prix-eth.js CLES_PRIX, 2026-09-12) ; si elle ne cote pas, le plan le dit (NON_MESURE).
 *   · tout autre couple de devises : refus nomme — pas de route inventee. */
import { USDC_BASE } from './frais-creation.js';
import { classeBlock } from './pool-sans-hook.js';

/** Les blocks qu on peut RECEVOIR en vendant `ici` (block -> block). ⛔ C est du ROUTAGE, pas de l affichage : le filtre TB
 *  vit ICI et jamais dans app.html (test-r6 : « aucun filtre d affichage sur le classement »). Memes portes que le bouton
 *  « Buy » de la liste : prix LU, liquidite >= liqMin — et un block TB, le seul que les gardes de route admettent.
 *  @param {{ marches: Iterable<[string, {prixUsd:number, liquiditeUsd:number, sym:string}]>, ici: string, liqMin: number }} p */
export function blocsRecevables({ marches, ici, liqMin }) {
  const moi = bas(ici), out = [];
  for (const [adr, m] of marches || []) {
    const a = bas(adr);
    if (a === moi || !/^0xb20{20}[0-9a-f]{18}$/.test(a)) continue;
    if (!m || !(Number(m.prixUsd) > 0) || !(Number(m.liquiditeUsd) >= liqMin)) continue;
    if (classeBlock(a) !== 'TB') continue;
    out.push({ adr: a, symbole: String(m.sym || '?').slice(0, 14), liq: Number(m.liquiditeUsd) || 0 });
  }
  return out.sort((x, y) => y.liq - x.liq);
}

export const ETH_NATIF = '0x0000000000000000000000000000000000000000';
const bas = (a) => String(a || '').toLowerCase();
const ZERO = ETH_NATIF;
/** La pool v4 ETH/USDC sans hook du saut du milieu (cle triee : ETH natif = currency0). */
export const CLE_ETH_USDC_MILIEU = Object.freeze({ currency0: ZERO, currency1: USDC_BASE, fee: 500, tickSpacing: 10, hooks: ZERO });

/** Le cote d une cle qui n est pas `jeton`. */
function autreCote(cle, jeton) {
  const c0 = bas(cle.currency0), c1 = bas(cle.currency1), j = bas(jeton);
  if (c0 === j) return c1;
  if (c1 === j) return c0;
  return null;
}

/**
 * @param {{ adrA:string, marcheA:{etat:string,cle:object}, adrB:string, marcheB:{etat:string,cle:object} }} p
 * @returns {{ etat:'OK', sauts:{cle:object,zeroForOne:boolean}[], pivot:string[] } | { etat:'REFUSE', pourquoi:string }}
 */
export function sautsBlocVersBloc({ adrA, marcheA, adrB, marcheB }) {
  const a = bas(adrA), b = bas(adrB);
  if (!/^0x[0-9a-f]{40}$/.test(a) || !/^0x[0-9a-f]{40}$/.test(b)) return { etat: 'REFUSE', pourquoi: 'not a block address' };
  if (a === b) return { etat: 'REFUSE', pourquoi: 'pick another block than this one' };
  if (!marcheA || marcheA.etat !== 'LUE' || !marcheA.cle) return { etat: 'REFUSE', pourquoi: 'the market of this block could not be read' };
  if (!marcheB || marcheB.etat !== 'LUE' || !marcheB.cle) return { etat: 'REFUSE', pourquoi: 'the market of the block you want could not be read' };
  const pA = autreCote(marcheA.cle, a), pB = autreCote(marcheB.cle, b);
  if (!pA) return { etat: 'REFUSE', pourquoi: 'the market read for this block does not contain it' };
  if (!pB) return { etat: 'REFUSE', pourquoi: 'the market read for the block you want does not contain it' };
  /* VENDRE A : A entre, sa devise sort -> zeroForOne vrai si A est currency0. ACHETER B : la devise entre -> vrai si elle est currency0. */
  const vendreA = { cle: marcheA.cle, zeroForOne: bas(marcheA.cle.currency0) === a };
  const acheterB = { cle: marcheB.cle, zeroForOne: bas(marcheB.cle.currency0) === pB };
  if (pA === pB) return { etat: 'OK', sauts: [vendreA, acheterB], pivot: [pA] };
  const usdc = bas(USDC_BASE);
  if ((pA === ZERO && pB === usdc) || (pA === usdc && pB === ZERO)) {
    /* ETH natif est currency0 de la pool du milieu : ETH -> USDC = zeroForOne vrai */
    const milieu = { cle: CLE_ETH_USDC_MILIEU, zeroForOne: pA === ZERO };
    return { etat: 'OK', sauts: [vendreA, milieu, acheterB], pivot: [pA, pB] };
  }
  return { etat: 'REFUSE', pourquoi: 'these two blocks trade against different assets — no single route between them yet' };
}
