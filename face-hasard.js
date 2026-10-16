/* face-hasard.js - « Surprise me » ne tire que des faces que la creation acceptera (2026-10-16).
 * Mesure (test-surprise-sous-plafond-20261016.mjs, logo.js reel, nom 32 + symbole 8) : 1 572 tirages libres sur 20 000
 * depassaient le plafond des metadonnees gravees, pire cas 67 542 octets -> « Engraved metadata is too big » au clic Create.
 * On retire jusqu a `essais` fois avec la VRAIE mesure de l appelant (uriCreation dans app.html) ; rien de trouve -> null. */
export const PLAFOND_URI_OCTETS = 24000;
export function tirerSousPlafond({ tirer, mesure, plafond = PLAFOND_URI_OCTETS, essais = 64 }) {
  for (let i = 0; i < essais; i++) {
    const apparence = tirer();
    let taille = null;
    try { taille = mesure(apparence); } catch (_) { taille = null; }
    if (typeof taille === 'number' && Number.isFinite(taille) && taille <= plafond) return { apparence, taille, essais: i + 1 };
  }
  return null;
}