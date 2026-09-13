// memoire-chaine.js — graver la memoire d un cerveau dans une transaction, et la relire depuis la chaine.
// ================================================================================================
// ⛔ DECISION DE PHIL (2026-09-13) : « rejouable avec une tx d enregistrement de data du Brain AI ». La memoire
//    locale depend du navigateur ; gravee dans le message d un transfert de 0 a soi-meme (`messages.js`), elle
//    devient lisible par tout le monde et reprenable sur n importe quelle machine.
// ⛔ LE MESSAGE EST LIMITE A 256 OCTETS : la memoire exacte (128 potentiels + 128 traces) n y tient pas. On grave
//    donc (1) un INSTANTANE QUANTIFIE — un octet par neurone, 4 bits de potentiel (−4..4) et 4 bits de trace (0..1),
//    en base64url — et (2) une EMPREINTE keccak de la memoire EXACTE. L instantane se reprend a ~0,27 pres sur un
//    potentiel et ~0,033 sur une trace ; l empreinte prouve quelle memoire exacte etait gardee.
// ⛔ LA VERSION EST DANS LE PREFIXE (`tbm3` = tblock-fly-brain/3) : une memoire d une autre dynamique n est
//    jamais reprise.
import { serialiserMemoire, restaurerMemoire, VERSION_CERVEAU, NEURONES, empreinte } from './cerveau.js';

const VERSION_COURTE = 'tbm' + String(VERSION_CERVEAU).split('/').pop();
export const PREFIXE_MEMOIRE = VERSION_COURTE + ' ';
export const ETATS_MEMOIRE_CHAINE = ['LU', 'PAS_MEMOIRE', 'ILLISIBLE'];

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
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); }
  }
  return out;
}
const quantPot = (x) => Math.max(0, Math.min(15, Math.round(((x + 4) / 8) * 15)));
const dequantPot = (q) => (q / 15) * 8 - 4;
const quantMem = (x) => Math.max(0, Math.min(15, Math.round(x * 15)));
const dequantMem = (q) => q / 15;

/** Le texte a graver : `tbm3 t=<tick> h=<16 hex> s=<base64url de 128 octets>`. */
export function encoderMemoireChaine(etat) {
  const exacte = serialiserMemoire(etat);
  const h = empreinte(JSON.stringify(exacte)).slice(2, 18);
  const octets = exacte.potentiels.map((p, i) => (quantPot(p) << 4) | quantMem(exacte.memoire[i]));
  return PREFIXE_MEMOIRE + 't=' + exacte.tick + ' h=' + h + ' s=' + versBase64url(octets);
}

/** Relit un message. `PAS_MEMOIRE` pour tout autre message ; `ILLISIBLE` pour une memoire abimee. */
export function decoderMemoireChaine(texte) {
  const t = String(texte ?? '');
  if (!t.startsWith(PREFIXE_MEMOIRE)) return { etat: 'PAS_MEMOIRE' };
  const m = t.match(/^tbm\d+ t=(\d{1,15}) h=([0-9a-f]{16}) s=([A-Za-z0-9_-]+)$/);
  if (!m) return { etat: 'ILLISIBLE', pourquoi: 'memory message malformed' };
  const tick = Number(m[1]);
  const octets = depuisBase64url(m[3]);
  if (!Number.isSafeInteger(tick) || !octets || octets.length !== NEURONES) return { etat: 'ILLISIBLE', pourquoi: 'memory snapshot has the wrong size' };
  return { etat: 'LU', tick, empreinte: m[2],
    potentiels: octets.map((o) => dequantPot(o >> 4)), memoire: octets.map((o) => dequantMem(o & 15)) };
}

/** Reprend un cerveau depuis une memoire relue sur la chaine. `null` si elle n est pas reprenable. */
export function restaurerDepuisChaine(adresse, lu) {
  if (!lu || lu.etat !== 'LU') return null;
  return restaurerMemoire(adresse, { v: VERSION_CERVEAU, tick: lu.tick, spikes: 0, potentiels: lu.potentiels, memoire: lu.memoire });
}

/** La memoire exacte gardee localement correspond-elle a l empreinte gravee ? */
export function memoireCorrespond(etat, lu) {
  return !!lu && lu.etat === 'LU' && empreinte(JSON.stringify(serialiserMemoire(etat))).slice(2, 18) === lu.empreinte;
}
