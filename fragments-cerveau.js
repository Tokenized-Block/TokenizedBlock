// fragments-cerveau.js — FRAGMENTER le cerveau d un block pour le graver on-chain, et le RECONSTRUIRE a l identique.
// ================================================================================================
// ⛔ DEMANDE DE PHIL (2026-09-13) : « que les gens puissent fragmenter le Brain AI pour le reconstruire, toutes ses
//    fonctions, ajoute-leur un bouton ». La memoire gravee jusqu ici (`memoire-chaine.js`) est un INSTANTANE a ~0,27
//    pres : le message d un transfert est borne a 256 octets. Fragmentee, la memoire EXACTE tient.
// ⛔ FORMAT D UN FRAGMENT (un message par transfert de 0) :
//        tbf3 t=<tick> k=<spikes> h=<16 hex> i=<index>/<total> d=<base64url>
//    `h` = l empreinte keccak de la memoire EXACTE (la meme que `memoire-chaine.js`). Chaque neurone = 4 octets :
//    17 bits de potentiel ((p + 4) x 10 000, p arrondi a 1e-4) et 14 bits de trace (m x 10 000).
// ⛔⛔ UNE RECONSTRUCTION N EST DITE EXACTE QUE SI L EMPREINTE RECALCULEE EGALE `h`. Un fragment faux (n importe qui
//    peut ecrire un message qui ressemble) casse l empreinte : il est refuse, jamais melange en silence.
// ⛔ LE CERVEAU EST TOUT ENTIER DANS L ADRESSE + LA MEMOIRE : le connectome (liens, ailes) se retire de l adresse,
//    la dynamique de la version. Reconstruire la memoire exacte, c est donc reconstruire le cerveau entier, a ce tick.
import { serialiserMemoire, restaurerMemoire, VERSION_CERVEAU, NEURONES, empreinte } from './cerveau.js';

const VERSION_COURTE = 'tbf' + String(VERSION_CERVEAU).split('/').pop();
export const PREFIXE_FRAGMENT = VERSION_COURTE + ' ';
export const NEURONES_PAR_FRAGMENT = 32;
export const ETATS_FRAGMENT = ['LU', 'PAS_FRAGMENT', 'ILLISIBLE'];
export const ETATS_RECONSTRUCTION = ['EXACTE', 'INCOMPLETE', 'EMPREINTE_FAUSSE', 'AUCUNE'];

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function versBase64url(octets) {
  let s = '';
  for (let i = 0; i < octets.length; i += 3) {
    const n = (octets[i] << 16) | ((octets[i + 1] ?? 0) << 8) | (octets[i + 2] ?? 0);
    const reste = octets.length - i;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (reste > 1 ? B64[(n >> 6) & 63] : '') + (reste > 2 ? B64[n & 63] : '');
  }
  return s;
}
function depuisBase64url(s) {
  const out = [];
  let acc = 0, bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    acc = ((acc << 6) | v) & 0xffffff; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); }
  }
  return out;
}

/** L empreinte de la memoire exacte — IDENTIQUE a celle de memoire-chaine.js. */
export function empreinteMemoire(etat) {
  return empreinte(JSON.stringify(serialiserMemoire(etat))).slice(2, 18);
}

/**
 * Coupe la memoire exacte en fragments graveables.
 * ⛔ Les valeurs sont celles de `serialiserMemoire` (arrondies a 1e-4) : c est cette memoire-la que l empreinte signe.
 */
export function fragmenterMemoire(etat) {
  const exacte = serialiserMemoire(etat);
  const h = empreinte(JSON.stringify(exacte)).slice(2, 18);
  const total = Math.ceil(NEURONES / NEURONES_PAR_FRAGMENT);
  const out = [];
  for (let f = 0; f < total; f++) {
    const octets = [];
    for (let i = f * NEURONES_PAR_FRAGMENT; i < Math.min(NEURONES, (f + 1) * NEURONES_PAR_FRAGMENT); i++) {
      const p = Math.round(exacte.potentiels[i] * 10000) + 40000;   // 0..80000, 17 bits
      const m = Math.round(exacte.memoire[i] * 10000);              // 0..10000, 14 bits
      const mot = (p * 16384) + m;                                  // < 2^31
      octets.push((mot >>> 24) & 255, (mot >>> 16) & 255, (mot >>> 8) & 255, mot & 255);
    }
    out.push(PREFIXE_FRAGMENT + 't=' + exacte.tick + ' k=' + exacte.spikes + ' h=' + h + ' i=' + (f + 1) + '/' + total
      + ' d=' + versBase64url(octets));
  }
  return out;
}

/** Relit un message : `PAS_FRAGMENT` pour tout autre message, `ILLISIBLE` pour un fragment abime. */
export function lireFragment(texte) {
  const t = String(texte ?? '');
  if (!t.startsWith(PREFIXE_FRAGMENT)) return { etat: 'PAS_FRAGMENT' };
  const m = t.match(/^tbf\d+ t=(\d{1,15}) k=(\d{1,15}) h=([0-9a-f]{16}) i=(\d{1,3})\/(\d{1,3}) d=([A-Za-z0-9_-]+)$/);
  if (!m) return { etat: 'ILLISIBLE', pourquoi: 'fragment malformed' };
  const [tick, spikes, index, total] = [Number(m[1]), Number(m[2]), Number(m[4]), Number(m[5])];
  const attendu = Math.ceil(NEURONES / NEURONES_PAR_FRAGMENT);
  if (total !== attendu || index < 1 || index > total) return { etat: 'ILLISIBLE', pourquoi: 'fragment index out of range' };
  const octets = depuisBase64url(m[6]);
  const n = Math.min(NEURONES_PAR_FRAGMENT, NEURONES - (index - 1) * NEURONES_PAR_FRAGMENT);
  if (!octets || octets.length !== n * 4) return { etat: 'ILLISIBLE', pourquoi: 'fragment has the wrong size' };
  const potentiels = [], memoire = [];
  for (let i = 0; i < n; i++) {
    const mot = ((octets[i * 4] << 24) >>> 0) + (octets[i * 4 + 1] << 16) + (octets[i * 4 + 2] << 8) + octets[i * 4 + 3];
    const p = Math.floor(mot / 16384), q = mot % 16384;
    if (p > 80000 || q > 10000) return { etat: 'ILLISIBLE', pourquoi: 'fragment value out of range' };
    potentiels.push((p - 40000) / 10000);
    memoire.push(q / 10000);
  }
  return { etat: 'LU', tick, spikes, empreinte: m[3], index, total, potentiels, memoire };
}

/**
 * Reconstruit le cerveau a partir de fragments LUS (dans n importe quel ordre, de n importe quels comptes).
 * Groupe par (tick, empreinte), essaie le groupe le plus recent d abord.
 * @returns {{etat:'EXACTE', cerveau, tick, empreinte} | {etat:'INCOMPLETE', tick, empreinte, manquants:number[]}
 *   | {etat:'EMPREINTE_FAUSSE', tick, empreinte} | {etat:'AUCUNE'}}
 */
export function reconstruireCerveau(adresse, fragmentsLus) {
  const groupes = new Map();
  for (const f of Array.isArray(fragmentsLus) ? fragmentsLus : []) {
    if (!f || f.etat !== 'LU') continue;
    const cle = f.tick + ':' + f.empreinte + ':' + f.spikes;
    if (!groupes.has(cle)) groupes.set(cle, { tick: f.tick, spikes: f.spikes, empreinte: f.empreinte, parIndex: new Map() });
    const g = groupes.get(cle);
    if (!g.parIndex.has(f.index)) g.parIndex.set(f.index, []);
    g.parIndex.get(f.index).push(f);
  }
  if (!groupes.size) return { etat: 'AUCUNE' };
  const total = Math.ceil(NEURONES / NEURONES_PAR_FRAGMENT);
  let meilleurIncomplet = null, faux = null;
  for (const g of [...groupes.values()].sort((a, b) => b.tick - a.tick)) {
    const manquants = [];
    for (let i = 1; i <= total; i++) if (!g.parIndex.has(i)) manquants.push(i);
    if (manquants.length) { if (!meilleurIncomplet) meilleurIncomplet = { etat: 'INCOMPLETE', tick: g.tick, empreinte: g.empreinte, manquants }; continue; }
    /* ⛔ plusieurs versions d un meme index (quelqu un a grave un faux) : on essaie les combinaisons, bornees */
    const choix = [...Array(total)].map((_, k) => g.parIndex.get(k + 1).slice(0, 3));
    let essais = 0;
    const essayer = (k, pris) => {
      if (essais > 81) return null;
      if (k === total) {
        essais++;
        const memo = { v: VERSION_CERVEAU, tick: g.tick, spikes: g.spikes,
          potentiels: pris.flatMap((f) => f.potentiels), memoire: pris.flatMap((f) => f.memoire) };
        const cerveau = restaurerMemoire(adresse, memo);
        return cerveau && empreinteMemoire(cerveau) === g.empreinte ? cerveau : null;
      }
      for (const f of choix[k]) { const r = essayer(k + 1, [...pris, f]); if (r) return r; }
      return null;
    };
    const cerveau = essayer(0, []);
    if (cerveau) return { etat: 'EXACTE', cerveau, tick: g.tick, empreinte: g.empreinte };
    if (!faux) faux = { etat: 'EMPREINTE_FAUSSE', tick: g.tick, empreinte: g.empreinte };
  }
  return meilleurIncomplet || faux;
}
