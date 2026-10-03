/* cles-v4-mesurees.js — des evenements `Initialize` LUS SUR LA CHAINE, gardes tels quels.
 *
 * ⛔⛔ POURQUOI (2026-10-02, OUSD liste chez Coinbase) : `/api/prix-usd` rendait pour OUSD
 *   « cleV4: null — the Initialize event for this poolId was not found in the window read ». VRAI : la pool
 *   OUSD/USDC est nee au bloc 51962957, ~129 500 blocs avant la mesure — HORS de la fenetre de
 *   120 000 que le serveur remonte. Sans cle, la route via OUSD etait COTABLE et pas CONSTRUCTIBLE.
 *   (Je l avais d abord attribue a des fenetres refusees : erreur de conversion hex de ma part, corrigee.)
 * ⛔ CE QUI EST GARDE : le LOG BRUT (topics + data), pas une cle recopiee. Il passe par le decodeur canonique
 *   `decoderInitialize`, qui RECALCULE le poolId et refuse toute cle incoherente — un log altere ne donne rien.
 * Source : eth_getLogs sur mainnet.base.org, PoolManager, bloc 51962957, tx 0x776dd72539eaf83cbffc20154c9586921cccfd315509e5c813278cd898e5e8dd. */
/* 2026-10-03 : + les 20 pools v4 USDC des actions tokenisees (cles-v4-actions.js), lues de la meme facon. OUSD reste en [0]. */
import { LOGS_INITIALIZE_ACTIONS } from './cles-v4-actions.js';
export const LOGS_INITIALIZE_MESURES = Object.freeze([
  /* OUSD/USDC — Uniswap V4, fee 100, tickSpacing 1, sans hook ; ~10 M$ de liquidite (dexscreener, 2026-10-02) */
  Object.freeze({
    "blockNumber": "0x318e44d",
    "transactionHash": "0x776dd72539eaf83cbffc20154c9586921cccfd315509e5c813278cd898e5e8dd",
    "topics": [
      "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438",
      "0xdf5bde0fc414fcd1f803c9d1b52ebbb4db5982d8dca5316ae06b467e06fc429a",
      "0x000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      "0x000000000000000000000000b2000000000000000000002feb517dfec7415344"
    ],
    "data": "0x00000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
  }),
  ...LOGS_INITIALIZE_ACTIONS,
]);
