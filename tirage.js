// tirage.js — un tirage UNIFORME : chaque candidat a exactement la meme chance.
// ================================================================================================
// ⛔ POURQUOI UN MODULE A PART : l ecran promet « every block has the same chance — 1 in N ». Une promesse de ce
//    genre se TESTE (test-tirage.mjs), et un test ne peut pas lire une fonction enfouie dans app.html.
// ⛔ PAS DE `x % n` NAIF : sur 2^32 valeurs, le modulo favorise les petits indices des que n ne divise pas 2^32.
//    On REJETTE la queue [limite, 2^32) — chaque indice garde alors exactement (limite / n) antecedents.
// ⛔ PAS DE Math.random : non garanti uniforme ni imprevisible. crypto.getRandomValues, sinon on refuse.

/**
 * @param {number} n  le nombre de candidats
 * @param {(tab: Uint32Array) => void} [alea]  source d aleatoire (crypto.getRandomValues par defaut ; injectable en test)
 * @returns {number} un indice dans [0, n), ou -1 si n n est pas un entier positif
 */
export function tirageUniforme(n, alea = (t) => globalThis.crypto.getRandomValues(t)) {
  if (!Number.isInteger(n) || n <= 0 || n > 0xffffffff) return -1;
  const limite = Math.floor(0x100000000 / n) * n;
  const b = new Uint32Array(1);
  do { alea(b); } while (b[0] >= limite);
  return b[0] % n;
}
