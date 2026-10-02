/* ══ 2026-10-02 — REGLE DU FONDATEUR (13:27) : AUCUNE POOL SANS HOOK POUR UN BLOCK TokenizedBlock ═════════════════════
 * ⛔⛔ Le routage de l app (cotations, achat, vente, pont, sortie de route) ne choisit JAMAIS une pool dont `hooks` vaut
 *     0x0 quand un block TokenizedBlock en est une des deux devises. C est une regle de ROUTAGE, pas d affichage :
 *     aucun libelle, aucun badge, aucun avertissement ne la montre a l ecran. Le message de refus reste generique.
 *   · Un block TB = TBLOCK, TBGAS, ou le jeton B20 (0xb2…) echange par l appelant (`blocks`) — sauf s il est une devise de base
 *     (ETH, USDC, cbBTC, actions Coinbase…) : une jambe ETH→USDC hors hook (pont) n est pas une pool de block.
 *   · Exception unique : le format OpenLaunch (frais 3 %, espacement 200) — pools partenaires, hors de notre perimetre.
 *   Fait mesure (fork 52074517) : TBLOCK n a AUCUNE pool ETH avec hook ; sa seule pool ETH (frais 0, espacement 200)
 *   est sans hook — elle n est donc plus jamais choisie, et ce qui en dependait est refuse avant le wallet. */
import { TBLOCK, TBGAS } from './tokenomics.js';
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
