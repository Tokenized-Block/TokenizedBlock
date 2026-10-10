/* rythme-fond.js — LE RYTHME DES BOUCLES DE FOND QUI LISENT L HISTOIRE (nos-blocks, routeur), selon le budget d archive.
 * ⛔ 2026-10-10 (prod, budget 10 000/10 000 epuise) : refusParQui = fond nos-blocks 15 193, fond routeur 6 834. Budget epuise, chaque
 *   tour de rattrapage profond est refuse A COUP SUR jusqu a 00:00 UTC, mais nos-blocks repartait toutes les 4 s et le routeur
 *   enchainait jusqu a 40 tours par minute. Budget epuise : nos-blocks attend PAUSE_EPUISE_MS entre deux tours, le routeur fait UN
 *   tour par declenchement (celui de la minute). Rien n est saute ni marque lu : un tour qui n a pas lieu n avance aucune couverture.
 * ⛔ Budget libre : rythme d avant, inchange. */
export const PAUSE_EPUISE_MS = 300000;
/** Pause avant le prochain tour de nos-blocks. */
export const pauseNosBlocks = (epuisee, baseMs = 4000) => (epuisee ? PAUSE_EPUISE_MS : baseMs);
/** Le routeur enchaine-t-il un tour de plus dans le meme declenchement ? */
export const routeurEnchaine = (epuisee) => !epuisee;
