/* entree-vers-bloc.js — COMMENT UNE ENTREE PAIE UN BLOCK (route 1 de rails-api.js), PUR : aucune lecture, aucun reseau.
 *
 * ⛔⛔ 2026-10-26 (mesure prod game51, 375 px, block 0xb200…579e cote en ETH) : « Pay with » offrait ETH, USDC, OUSD et 20 actions,
 *   mais NI EURC, NI cbBTC (rangee « no route »), NI WETH — alors que depuis game48 le serveur les route vers un block
 *   (lotPivotUsdcVersBloc ; EURC -> ce block mesure PRET en prod ; banc fork 64/0).
 *   ⇒ La decision vivait dans rails-api.js, un module SERVEUR que la page ne charge pas. Elle est ici, servie, et rails-api.js
 *     l importe et la re-exporte : la page et le serveur lisent LA MEME fonction, pas deux copies qui divergeraient.
 * ⛔ CE MODULE N OFFRE RIEN QUE LE SERVEUR REFUSERAIT : `devisesPivotVersBloc` ne rend que les devises pour lesquelles
 *   `entreeVersBloc` dit PIVOT_AERODROME — la branche exacte que planRail construit. */
import { DEVISES_VIA_USDC_AERODROME, POOLS_PIVOTS_AERODROME, DEVISES_BANNIES } from './plan-franchissement.js';
import { DEVISES_BASE } from './paires.js';
import { USDC_BASE } from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';

const bas = (a) => String(a || '').toLowerCase();
const ETH = '0x0000000000000000000000000000000000000000';
const USDC = bas(USDC_BASE);
const OUSD = bas((DEVISES_BASE.find((d) => d.symbole === 'OUSD') || {}).adr);

/** Comment une entree `de` paie un block cote en `quote` (route 1). Pur : aucune lecture.
 *  - DIRECT : `de` est la cotation (planEchange) ;
 *  - V4 : USDC ou OUSD vers un block cote en ETH ou USDC, ETH vers un block cote en USDC — un seul appel au routeur Uniswap ;
 *  - PIVOT_AERODROME : une devise de POOLS_PIVOTS_AERODROME (WETH, cbBTC, EURC) vers un block cote en ETH ou USDC — le lot de la 4 ter :
 *    X -> USDC sur sa pool Aerodrome epinglee, puis USDC -> (ETH ->) block ;
 *  - REFUS : le reste (la phrase dit avec quoi payer). */
export function entreeVersBloc({ de, quote }) {
  const d = bas(de), q = bas(quote);
  /* ⛔⛔ 2026-10-26 (Phil) : une devise bannie (EURC) ne paie rien — meme un block qui serait cote en elle */
  if (DEVISES_BANNIES.has(d) || DEVISES_BANNIES.has(q)) return 'REFUS';
  if (d === q) return 'DIRECT';
  const coteeEthOuUsdc = q === ETH || q === USDC;
  if ((d === USDC || d === OUSD) && coteeEthOuUsdc) return 'V4';
  if (d === ETH && q === USDC) return 'V4';
  if (DEVISES_VIA_USDC_AERODROME.has(d) && coteeEthOuUsdc) return 'PIVOT_AERODROME';
  return 'REFUS';
}

/** Les devises pivot (WETH, cbBTC, EURC) qui paient un block cote en `quote` par le lot du serveur : [{ adr, symbole }].
 *  ⛔ Le symbole est LU dans la table epinglee (« USDC/EURC » -> EURC), jamais recopie ; une ligne sans symbole lisible n est pas rendue.
 *  ⛔ Ordre stable (par symbole) : l ecran ne se reordonne pas d un repeint a l autre. Vide si la cotation n est ni ETH ni USDC. */
export function devisesPivotVersBloc(quote) {
  return pivotsDeLaTable((adr) => entreeVersBloc({ de: adr, quote }) === 'PIVOT_AERODROME');
}
/** les pivots de la table epinglee que `passe(adr)` admet, symbole lu dans la table, tries par symbole */
function pivotsDeLaTable(passe) {
  const out = [];
  for (const [k, v] of POOLS_PIVOTS_AERODROME) {
    const adr = k.split('|').find((t) => t !== USDC);
    const symbole = String((v && v.symbole) || '').split('/')[1] || null;
    if (!/^0x[0-9a-f]{40}$/.test(String(adr)) || !symbole || DEVISES_BANNIES.has(adr)) continue;
    if (!passe(adr)) continue;
    out.push({ adr, symbole });
  }
  return out.sort((a, b) => a.symbole.localeCompare(b.symbole));
}

/** Comment une entree `de` paie une ACTION tokenisee `action` par un pivot — la condition de la route « 4 quater » de rails-api.js
 *  (X -> USDC -> action, deux sauts Aerodrome) : l action est dans la table Aerodrome MESUREE et X a sa pool X/USDC epinglee.
 *  PIVOT_AERODROME, sinon REFUS (une action hors table n a aucune route pivot ici : le serveur la refuse). Pur : aucune lecture. */
export function entreeVersAction({ de, action }) {
  const d = bas(de), a = bas(action);
  if (DEVISES_BANNIES.has(d)) return 'REFUS';
  return POOLS_ACTIONS_AERODROME.has(a) && DEVISES_VIA_USDC_AERODROME.has(d) ? 'PIVOT_AERODROME' : 'REFUS';
}

/** Les devises pivot qui paient l action `action` par la route 4 quater : [{ adr, symbole }], meme table, meme ordre que
 *  devisesPivotVersBloc. ⛔ 2026-10-26 (QA game56 : METAc n offrait que USDC / ETH alors que le serveur route cbBTC, WETH, AUDF vers
 *  elle) : rien n est offert que `entreeVersAction` ne dise PIVOT_AERODROME. */
export function devisesPivotVersAction(action) {
  return pivotsDeLaTable((adr) => entreeVersAction({ de: adr, action }) === 'PIVOT_AERODROME');
}
