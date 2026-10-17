/* missions-rail.js — LA ROUTE FIXE du rail de BlockMissionsV3 (Phil 2026-10-17 soir, confirme au chat : « Oui, ajoute le rail »).
 * Le rail (RailSellToUsdcV4) vend la part dev (1,4 %) d une recompense payee en UNIT, en USDC, vers le wallet du dev. Ses routes sont FIXEES
 *   a la construction (aucun setter) : changer de route = un nouveau rail = un nouveau V3. D ou une SEULE source, ici.
 * MESURES 2026-10-17 (Base, StateView) : UNIT/ETH sur le hook 7030 = pool 0x79a40c32… INITIALISEE ; ETH/USDC v4 (frais 500, espacement 10,
 *   sans hook) = pool 0x96d4b53a… INITIALISEE, L 2,5e16. UNIT : symbol() = « UNIT » lu sur la chaine.
 * ⛔ La liquidite ACTIVE de la pool UNIT valait 0 a la lecture : une vente ne rend que ce que les acheteurs y ont mis. Le rail revert
 *   (PartialFill / plancher arme) plutot que de vendre a perte ; la part attend (devOwed) ou va a la reserve. */
import { HOOK_7030 } from './tokenomics.js';
import { USDC_BASE } from './frais-creation.js';

const Z = '0x0000000000000000000000000000000000000000';
export const UNIT_BLOCK = '0xb2000000000000000000007afa7ed748b0874f27';
/** une seule route : UNIT -> ETH (pool UNIT/ETH du hook 7030, UNIT = currency1 -> zeroForOne false) -> USDC (ETH = currency0 -> true) */
export const RAIL_ROUTE = Object.freeze({
  tokens: Object.freeze([UNIT_BLOCK]),
  hopCount: Object.freeze([2]),
  hops: Object.freeze([
    Object.freeze({ key: Object.freeze({ currency0: Z, currency1: UNIT_BLOCK, fee: 0, tickSpacing: 200, hooks: String(HOOK_7030).toLowerCase() }), zeroForOne: false }),
    Object.freeze({ key: Object.freeze({ currency0: Z, currency1: String(USDC_BASE).toLowerCase(), fee: 500, tickSpacing: 10, hooks: Z }), zeroForOne: true }),
  ]),
});

const mot = (x) => String(x).toLowerCase().replace(/^0x/, '').padStart(64, '0');
const nb = (n) => { let v = BigInt(n); if (v < 0n) v += 1n << 256n; return v.toString(16).padStart(64, '0'); };

/** abi.encode(V3Args, address[] devDirect, address[] routeTokens, uint8[] hopCount, Hop[] hops) — le constructeur de MissionsDeployer.
 *  V3Args = 7 adresses (tuple statique, en ligne), puis 4 tableaux dynamiques (offsets depuis le debut des arguments). Hop = 6 mots statiques. */
export function encoderArgsDeployer(v3, devDirect, route = RAIL_ROUTE) {
  const tete = [v3.hook, v3.poolManager, v3.devWallet, v3.communityReserve, v3.usdc, v3.verifier, v3.guardian].map(mot);
  const queues = [
    [nb(devDirect.length), ...devDirect.map(mot)],
    [nb(route.tokens.length), ...route.tokens.map(mot)],
    [nb(route.hopCount.length), ...route.hopCount.map(nb)],
    [nb(route.hops.length), ...route.hops.flatMap((h) => [mot(h.key.currency0), mot(h.key.currency1), nb(h.key.fee), nb(h.key.tickSpacing), mot(h.key.hooks), nb(h.zeroForOne ? 1 : 0)])],
  ];
  let decalage = (tete.length + queues.length) * 32;
  const offsets = [];
  for (const q of queues) { offsets.push(nb(decalage)); decalage += q.length * 32; }
  return [...tete, ...offsets, ...queues.flat()].join('');
}
