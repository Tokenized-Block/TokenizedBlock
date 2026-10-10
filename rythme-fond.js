/* rythme-fond.js — LE RYTHME DES BOUCLES DE FOND QUI LISENT L HISTOIRE (nos-blocks, routeur), selon le budget d archive.
 * ⛔ 2026-10-10 (prod, budget 10 000/10 000 epuise) : refusParQui = fond nos-blocks 15 193, fond routeur 6 834. Budget epuise, chaque
 *   tour de rattrapage profond est refuse A COUP SUR jusqu a 00:00 UTC, mais nos-blocks repartait toutes les 4 s et le routeur
 *   enchainait jusqu a 40 tours par minute. Budget epuise : nos-blocks attend PAUSE_EPUISE_MS entre deux tours, le routeur fait UN
 *   tour par declenchement (celui de la minute). Rien n est saute ni marque lu : un tour qui n a pas lieu n avance aucune couverture.
 * ⛔ Budget libre : rythme d avant, inchange.
 * ⚠️ 2026-10-10 (refus certain, lecteurLogs de serveur-web.js) — C EST LE SEUL MECANISME DE RYTHME DES DEUX BOUCLES ; ses fonctions et
 *   PAUSE_EPUISE_MS ne changent pas. Ce qui change est ce que serveur-web.js passe a pauseNosBlocks : non plus l epuisement seul, mais
 *   « le dernier tour a laisse une fenetre NON ENVOYEE, budget toujours epuise » (le seul refus certain ; une fenetre profonde n est
 *   plus envoyee budget epuise). routeurEnchaine recoit toujours archiveEpuisee().
 *   ⚠️ Correction du texte ci-dessus pour le routeur : il ne pouvait pas enchainer 40 tours REFUSES — un tour avec une fenetre ratee
 *   arretait deja le declenchement (`ratees`, serveur-web.js). routeurEnchaine borne les tours SANS fenetre ratee (propres, ou a
 *   retour anticipe) budget epuise. */
export const PAUSE_EPUISE_MS = 300000;
/** Pause avant le prochain tour de nos-blocks (`epuisee` : voir ci-dessus ce que serveur-web.js y passe). */
export const pauseNosBlocks = (epuisee, baseMs = 4000) => (epuisee ? PAUSE_EPUISE_MS : baseMs);
/** Le routeur enchaine-t-il un tour de plus dans le meme declenchement ? */
export const routeurEnchaine = (epuisee) => !epuisee;
