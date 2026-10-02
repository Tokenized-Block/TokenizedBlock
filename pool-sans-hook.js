/* ══ 2026-10-02 — REGLE DU FONDATEUR (13:27) : AUCUNE POOL SANS HOOK POUR UN BLOCK TokenizedBlock ═════════════════════
 * ⛔⛔ Le routage de l app (cotations, achat, vente, pont, sortie de route) ne choisit JAMAIS une pool dont `hooks` vaut
 *     0x0 quand un block TokenizedBlock en est une des deux devises. C est une regle de ROUTAGE, pas d affichage :
 *     aucun libelle, aucun badge, aucun avertissement ne la montre a l ecran. Le message de refus reste generique.
 *   · Un block TB = TBLOCK, TBGAS, ou le jeton B20 (0xb2…) echange par l appelant (`blocks`) — sauf s il est une devise de base
 *     (ETH, USDC, cbBTC, actions Coinbase…) : une jambe ETH→USDC hors hook (pont) n est pas une pool de block.
 *   · Exception unique : le format OpenLaunch (frais 3 %, espacement 200) — pools partenaires, hors de notre perimetre.
 *   Fait mesure (fork 52074517) : TBLOCK n a AUCUNE pool ETH avec hook ; sa seule pool ETH (frais 0, espacement 200)
 *   est sans hook — elle n est donc plus jamais choisie, et ce qui en dependait est refuse avant le wallet. */
import { TBLOCK, TBGAS, deviseFraisHook } from './tokenomics.js';
import { DEVISES_BASE, ACTIONS_COINBASE } from './paires.js';

const bas = (a) => String(a || '').toLowerCase();
const ZERO = '0x0000000000000000000000000000000000000000';
const BLOCKS_TB = new Set([bas(TBLOCK), bas(TBGAS)]);
const DEVISES = new Set([ZERO, ...DEVISES_BASE.map((d) => bas(d.adr)), ...ACTIONS_COINBASE.map((d) => bas(d.adr))]
  .filter((a) => !BLOCKS_TB.has(a)));

export const MESSAGE_SANS_POOL = 'this block has no market the app can trade on right now — nothing was sent';

export function cleSansHook(cle) {
  return !!cle && /^0x0{40}$/i.test(String(cle.hooks || ZERO));
}
export function estBlockTb(adr, blocks = []) {
  const a = bas(adr);
  if (!/^0x[0-9a-f]{40}$/.test(a)) return false;
  if (BLOCKS_TB.has(a)) return true;
  /* un block = un jeton B20 (0xb2…) ; un jeton exterieur (memecoin hors B20) n est pas concerne par la regle */
  return a.startsWith('0xb2') && blocks.map(bas).includes(a) && !DEVISES.has(a);
}
function formatOpenLaunch(cle) {
  return Number(cle.fee) === 30000 && Number(cle.tickSpacing) === 200;
}
/** Vrai = cette cle est INTERDITE au routage (pool sans hook avec un block TB dedans). */
export function poolSansHookInterdite(cle, blocks = []) {
  if (!cleSansHook(cle) || formatOpenLaunch(cle)) return false;
  return estBlockTb(cle.currency0, blocks) || estBlockTb(cle.currency1, blocks);
}
/** Le premier indice de cle interdite, ou -1. */
export function indexPoolSansHookInterdite(cles, blocks = []) {
  return (cles || []).findIndex((c) => poolSansHookInterdite(c, blocks));
}

/* ══ 2026-10-02 13:58 — DECISION DU FONDATEUR : PLUS AUCUNE ROUTE PAR TBLOCK ═════════════════════════════════════════
 * ⛔⛔ TBLOCK n est plus une jambe intermediaire : un block s echange directement contre sa devise appariee (action
 *     tokenisee, USDC, ETH) sur une pool hookee, et le frais va a a6cf dans CETTE devise — jamais en block. TBLOCK
 *     lui-meme reste bloque dans l app (aucune pool hookee TBLOCK/ETH). `ROUTE_VIA_TBLOCK` ferme `routeViaTblock`. */
export const ROUTE_VIA_TBLOCK = false;
/** Vrai = cette cle passe par TBLOCK (une de ses deux devises). */
export function cleTouchTblock(cle) {
  return !!cle && (bas(cle.currency0) === bas(TBLOCK) || bas(cle.currency1) === bas(TBLOCK));
}

/* ══ 2026-10-02 13:59 — FONDATEUR : a6cf recoit ETH, USDC ou l action appariee, JAMAIS le block ═══════════════════════
 * ⛔⛔ Mesure fork (stock-proof, NVDAc) : sur une pool V8 ou le block est currency0, le HOOK verse a6cf en BLOCK
 *     (69 549 931 494 498 013 106 unites sur un achat de 71 247 NVDAc) et le routeur ajoutait 356 NVDAc — deux frais,
 *     dont un en block. Le contrat ne se change pas : l app REFUSE ces pools (Create ne les fabrique plus : item 2). */
export const REFUS_FRAIS_HOOK_EN_BLOCK = true;
/** Texte EXACT montre a l ecran pour ces blocks (decision 14:07 : rien d autre). */
export const MESSAGE_PAS_ICI = 'Not tradable here yet';
/** Vrai = le hook de cette pool verserait son frais dans le block `jeton` pour ce sens. */
export function fraisHookEnBlock(cle, jeton, sens, zeroForOne) {
  const d = deviseFraisHook(cle, sens, zeroForOne);
  return !!d && bas(d) === bas(jeton);
}
