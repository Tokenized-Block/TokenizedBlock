/* rolls-jeu.js — le pont entre l onglet Game et BlockRolls (contracts/src/BlockRolls.sol). PUR : aucun reseau, aucune cle.
 * - guessDepuisApparence : une FACE de l app (apparence.js) -> le guess du contrat [colorBand, orbit, facet, material, ornament]
 *   (memes listes que faceOf ; la parite est prouvee par test-blockrolls-parite + test-rolls-jeu).
 * - les eth_call de LECTURE (pot, prix, pass d un wallet, gain par score) et leur decodage.
 * ⛔ Phil 2026-10-17 : tirage PAYANT, sa decision. Tant qu aucune adresse de contrat n est servie, l app joue en PRACTICE (0 USDC). */
import { selecteur } from './keccak.js';
import { bandeTeinte, BANDES } from './face-du-jour.js';
import { ORBITES, FACETTES, MATIERES, ORNEMENTS, apparenceDepuisAdresse } from './apparence.js';

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();

/** la face (apparence) -> le guess du contrat ; null si un trait n est pas dans les listes (jamais un guess devine) */
export function guessDepuisApparence(a) {
  if (!a) return null;
  const g = [BANDES.indexOf(bandeTeinte(a.teinte)), ORBITES.indexOf(a.orbite), FACETTES.indexOf(a.facette), MATIERES.indexOf(a.matiere), ORNEMENTS.indexOf(a.ornement)];
  return g.every((x) => Number.isInteger(x) && x >= 0) ? g : null;
}

/* LA FACE D UN ROLL (Phil 2026-10-18) : chaque roll tire une NOUVELLE face au hasard — 20 octets -> une adresse -> son apparence
 *   (apparence.js, la meme fonction que toutes les faces de l app) -> le guess joue. Le ticket du jour reste la face du TIRAGE du jour. */
/** 20 octets -> { adresse, apparence, guess } ; null si ce ne sont pas 20 octets ou si un trait sort des listes (jamais un guess devine) */
export function faceDeRoll(octets) {
  if (!(octets instanceof Uint8Array) || octets.length !== 20) return null;
  const adresse = '0x' + [...octets].map((b) => b.toString(16).padStart(2, '0')).join('');
  const apparence = apparenceDepuisAdresse(adresse), guess = guessDepuisApparence(apparence);
  return guess ? { adresse, apparence, guess } : null;
}
/** une face de roll neuve ; alea(k) rend k octets — par defaut crypto.getRandomValues (un alea cryptographique) */
export const tirerFaceDeRoll = (alea = (k) => crypto.getRandomValues(new Uint8Array(k))) => faceDeRoll(alea(20));

/* ---------------------------------------------------------------- lectures (eth_call) */
const mot = (n) => BigInt(n).toString(16).padStart(64, '0');
export const appelPot = () => selecteur('pot()');
export const appelPrixRoll = () => selecteur('ROLL_PRICE()');
export const appelPrixPass = () => selecteur('PASS_PRICE()');
export function appelPass(wallet) { const w = bas(wallet); if (!ADR.test(w)) return null; return selecteur('passes(address)') + w.slice(2).padStart(64, '0'); }
export const appelGain = (score) => selecteur('payoutFor(uint8)') + mot(score);

/** un uint256 rendu par eth_call ; null si la reponse n est pas un mot (contrat absent = '0x') */
export function lireUint(hex) {
  const s = String(hex || '').replace(/^0x/, '');
  if (s.length < 64 || !/^[0-9a-f]+$/i.test(s)) return null;
  return BigInt('0x' + s.slice(0, 64));
}
/** passes(address) -> { rollsLeft, expiresAt } ; null si illisible */
export function lirePass(hex) {
  const s = String(hex || '').replace(/^0x/, '');
  if (s.length < 128 || !/^[0-9a-f]+$/i.test(s)) return null;
  return { rollsLeft: Number(BigInt('0x' + s.slice(0, 64))), expiresAt: Number(BigInt('0x' + s.slice(64, 128))) };
}
/** un pass jouable maintenant ? (memes regles que rollWithPass) */
export const passActif = (p, maintenant = Math.floor(Date.now() / 1000)) => !!p && p.rollsLeft > 0 && maintenant < p.expiresAt;

/** USDC brut (6 decimales) -> texte « 12.34 » */
export function usdc(brut) {
  if (brut == null) return '—';
  const v = BigInt(brut), e = v / 1000000n, f = (v % 1000000n).toString().padStart(6, '0').slice(0, 2);
  return e.toString() + '.' + f;
}

/** l adresse servie par le serveur : seulement une adresse bien formee, sinon null (= practice) */
export const contratServi = (x) => (ADR.test(bas(x)) ? bas(x) : null);
