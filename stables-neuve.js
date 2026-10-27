/* stables-neuve.js — LES STABLECOINS EN MONNAIE LOCALE ROUTES PAR LE LIEU 'aero-new' (2026-10-27).
 *
 * POURQUOI. CADD (dollar canadien), MXNB (peso mexicain) et USDT passent la regle (liquidite-actions.js REGLES : 10 000 USDC
 *   utilisables, ecart d achat <= 1 %, aller-retour <= 2 %) SEULEMENT sur la factory CL 0x9cb2…7a76 (mesures/stables-fiat-20261026.json,
 *   bloc 53 106 990). Notre routeur ne la traite pas ; le lieu 'aero-new' (routeur 0x9ee3…d418, planVenueNeuve) si — il route deja les
 *   actions. Ce module dit QUAND une paire USDC <-> stable peut l emprunter.
 *
 * ⛔⛔ PORTE FAIL-CLOSED : une paire USDC <-> stable n est planifiee que si le SERVEUR a, il y a moins de STABLE_NEUVE_MAX_MS, mesure la
 *   pool 'aero-new' de ce stable (coterVenueCL au bloc epingle) et que ce verdict PASSE la regle (verdictVenue, la meme que les actions).
 *   Sans mesure, mesure perimee ou mesure qui echoue : « measured, not routed », avec la raison mesuree. Puis planVenueNeuve re-cote AU
 *   MONTANT, confronte le devis au prix de la pool et SIMULE la transaction avant PRET : aucun Buy sans devis frais qui passe.
 * ⛔ EURC est banni (DEVISES_BANNIES) : jamais ici. AUDF n est pas ici : son achat reste non route (adresse non confirmee par l emetteur).
 * ⛔ Les adresses viennent de wallet-fiat.js A_VENIR (copiees du fichier de mesure, recoupees par test-wallet-fiat-20261026.mjs),
 *   jamais d une memoire. Pur : aucune lecture, aucun reseau, aucune signature. */
import { A_VENIR, MESURES_ROUTEES, raisonStable } from './wallet-fiat.js';
import { POOLS_PIVOTS_AERODROME, DEVISES_BANNIES } from './plan-franchissement.js';
import { USDC_BASE } from './frais-creation.js';
import { verdictVenue, verdictServi, REGLES } from './liquidite-actions.js';

const bas = (a) => String(a || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const USDC = bas(USDC_BASE);

/** une mesure servie plus vieille que ceci ne decide plus rien */
export const STABLE_NEUVE_MAX_MS = 15 * 60 * 1000;
/** la cadence de la mesure du serveur */
export const STABLE_NEUVE_TOUR_MS = 5 * 60 * 1000;

const routeesAerodrome = new Set([...POOLS_PIVOTS_AERODROME.keys()].map((k) => k.split('|').find((t) => t !== USDC)));
/** adr -> { symbole, monnaie, code } : les lignes « mesure, pas route » de A_VENIR, moins les bannies, les deja routees et AUDF */
export const STABLES_NEUVE = new Map(A_VENIR
  .filter((x) => ADR.test(bas(x.adr)) && !DEVISES_BANNIES.has(bas(x.adr)) && !routeesAerodrome.has(bas(x.adr)) && !(bas(x.adr) in MESURES_ROUTEES))
  .map((x) => [bas(x.adr), Object.freeze({ symbole: x.symbole, monnaie: x.monnaie, code: x.code })]));

export const estStableNeuve = (a) => STABLES_NEUVE.has(bas(a)) && !DEVISES_BANNIES.has(bas(a));

/** le verdict servi (JSON) d une cotation 'aero-new' d un stable — la regle des actions, sans registre d actions */
export function verdictStableNeuve(cote, regles = REGLES) {
  return verdictServi(verdictVenue(cote, regles));
}

export { raisonStable };

/**
 * LA PORTE. `servi` = ce que le serveur garde pour ce stable : { v: verdictServi, t, bloc } (ou null).
 * Rend { etat: 'OK', v, s } quand la paire peut emprunter 'aero-new' ; sinon { etat: 'REFUSE' | 'NON_MESURE', pourquoi } — dit tel quel.
 */
export function porteStableNeuve({ adr, servi, maintenant = Date.now() }) {
  const a = bas(adr), s = STABLES_NEUVE.get(a);
  if (!s || DEVISES_BANNIES.has(a)) return { etat: 'REFUSE', pourquoi: 'this currency is not routed through the newer Aerodrome pool factory' };
  const tete = s.symbole + ' is measured, not routed right now: ';
  if (!servi || !servi.v || !Number.isFinite(servi.t) || maintenant - servi.t > STABLE_NEUVE_MAX_MS || servi.t > maintenant + 60_000) {
    return { etat: 'NON_MESURE', pourquoi: tete + 'the server has no fresh measurement of its newer-factory pool — try again in a few minutes' };
  }
  const v = servi.v;
  if (v.passe !== true) return { etat: v.code === 'NON_MESURE' ? 'NON_MESURE' : 'REFUSE', pourquoi: tete + raisonStable(v.code) + ' (measured at block ' + servi.bloc + ')' };
  if (!ADR.test(bas(v.pool)) || !Number.isInteger(Number(v.tickSpacing)) || v.tickSpacing === null) {
    return { etat: 'NON_MESURE', pourquoi: tete + 'its newer-factory pool is not known' };
  }
  return { etat: 'OK', v, s };
}

/** la phrase du choix, posee sur le plan */
export const CHOIX_STABLE_NEUVE = 'Routed through Aerodrome’s newer pool factory (router 0x9ee3…d418): the server measured this pool within the last 15 minutes and it passes our rule (10,000 USDC usable, buy gap ≤ 1 %, round trip ≤ 2 %)';
