/* signeur-secp256k1.js — signe un digest de 32 octets en ECDSA secp256k1, comme vm.sign de Foundry et comme l ecrecover d Ethereum
 * le relit. Pur JS (BigInt), zero dependance : node:crypto ne sait PAS signer un digest brut sur secp256k1, et le depot n a
 * aucune lib de courbe (une seule dependance : @resvg/resvg-wasm).
 *
 * ⛔ CE QUE CE FICHIER GARANTIT, ET LA OU C EST PROUVE (test-signeur-secp256k1-20261017.mjs + contracts/test/SigneurSecp256k1.t.sol) :
 *   - nonce DETERMINISTE RFC 6979 (HMAC-SHA256, h = digest brut comme Foundry, voir noncesRfc6979) : meme cle + meme digest = meme signature, OCTET POUR OCTET egale a vm.sign
 *     (30 vecteurs Foundry epingles, cles 1, 2, 3, 0xA11CE, n/2, n-1 ; digests 0, 2^256-1 et n inclus) ;
 *   - s BAS (s <= n/2), comme l exige BlockMissionsV3._recover ; quand s est bascule, l id de recuperation l est aussi ;
 *   - CHAQUE signature est relue par recupererAdresse AVANT d etre rendue : une signature qui ne redonne pas l adresse de la
 *     cle ne sort jamais d ici (elle jette).
 * ⛔ CE QU IL NE GARANTIT PAS : le temps CONSTANT. BigInt n est pas a temps constant ; la multiplication scalaire fuit la cle
 *    par le temps a qui peut chronometrer finement de nombreuses signatures. Hors perimetre : la cle de production vit dans un
 *    KMS/HSM, ce module sert aux tests, aux bancs et a la verification. Aucun secret n est jamais journalise ni mis dans un
 *    message d erreur.
 *
 * Constantes de la courbe : NON recopiees sur parole — le test verifie G sur la courbe, n*G = infini, n/2 = la constante de
 * BlockMissionsV3, et adresseDe(1) = vm.addr(1). */
import { createHmac } from 'node:crypto';
import { keccak256 } from './keccak.js';

export const P = 2n ** 256n - 2n ** 32n - 977n;
export const N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141n;
export const G = Object.freeze({
  x: 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798n,
  y: 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8n,
});
const DEMI_N = N >> 1n;

const mod = (a, m) => { const r = a % m; return r < 0n ? r + m : r; };
function puiss(b, e, m) { let r = 1n; b = mod(b, m); while (e > 0n) { if (e & 1n) r = r * b % m; b = b * b % m; e >>= 1n; } return r; }
const inv = (a, m) => { if (mod(a, m) === 0n) throw new Error('signeur: inverse de 0'); return puiss(a, m - 2n, m); }; // P et N premiers

/* Points en coordonnees jacobiennes [X, Y, Z] (x = X/Z^2, y = Y/Z^3) ; Z = 0 = l infini. a = 0 pour secp256k1. */
const INFINI = [0n, 1n, 0n];
function doubler([X, Y, Z]) {
  if (Z === 0n || Y === 0n) return INFINI;
  const A = X * X % P, B = Y * Y % P, C = B * B % P;
  const D = mod(2n * ((X + B) ** 2n - A - C), P), E = 3n * A % P;
  const X3 = mod(E * E - 2n * D, P);
  return [X3, mod(E * (D - X3) - 8n * C, P), 2n * Y * Z % P];
}
function ajouter(p1, p2) {
  if (p1[2] === 0n) return p2;
  if (p2[2] === 0n) return p1;
  const [X1, Y1, Z1] = p1, [X2, Y2, Z2] = p2;
  const Z1Z1 = Z1 * Z1 % P, Z2Z2 = Z2 * Z2 % P;
  const U1 = X1 * Z2Z2 % P, U2 = X2 * Z1Z1 % P;
  const S1 = Y1 * Z2 % P * Z2Z2 % P, S2 = Y2 * Z1 % P * Z1Z1 % P;
  if (U1 === U2) return S1 === S2 ? doubler(p1) : INFINI;
  const H = mod(U2 - U1, P), R = mod(S2 - S1, P), H2 = H * H % P, H3 = H2 * H % P, V = U1 * H2 % P;
  const X3 = mod(R * R - H3 - 2n * V, P);
  return [X3, mod(R * (V - X3) - S1 * H3, P), H * Z1 % P * Z2 % P];
}
function multiplier(k, pt) { // double-and-add, bit de poids fort d abord ; ⛔ PAS a temps constant (voir en-tete)
  let acc = INFINI;
  for (let i = BigInt(k.toString(2).length) - 1n; i >= 0n; i--) { acc = doubler(acc); if ((k >> i) & 1n) acc = ajouter(acc, pt); }
  return acc;
}
function affine(pt) {
  if (pt[2] === 0n) return null;
  const zi = inv(pt[2], P), zi2 = zi * zi % P;
  return { x: pt[0] * zi2 % P, y: pt[1] * zi2 % P * zi % P };
}
const jac = ({ x, y }) => [x, y, 1n];

const hex32 = (n) => n.toString(16).padStart(64, '0');
const octets = (h) => Buffer.from(h, 'hex');

/* ⛔ Les messages d erreur ne citent JAMAIS la valeur recue : une cle mal formee reste une cle. */
function lireCle(privHex) {
  if (typeof privHex !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(privHex)) throw new Error('signeur: cle privee mal formee (attendu 0x + 1 a 64 hex)');
  const d = BigInt(privHex);
  if (d === 0n || d >= N) throw new Error('signeur: cle privee hors de [1, n-1]');
  return d;
}
function lireDigest(digestHex) {
  if (typeof digestHex !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(digestHex)) throw new Error('signeur: digest mal forme (attendu 0x + 64 hex)');
  return BigInt(digestHex);
}

function adresseDuPoint({ x, y }) {
  const brut = Buffer.from(keccak256(octets(hex32(x) + hex32(y)))).subarray(12).toString('hex');
  const h = Buffer.from(keccak256(Buffer.from(brut, 'ascii'))).toString('hex'); // EIP-55
  return '0x' + [...brut].map((c, i) => (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c)).join('');
}

/** l adresse Ethereum (EIP-55) de la cle : keccak256(X || Y) de la cle publique non compressee, 20 derniers octets. */
export function adresseDe(privHex) { return adresseDuPoint(affine(multiplier(lireCle(privHex), jac(G)))); }

/** RFC 6979 §3.2 avec HMAC-SHA256, qlen = 256 : rend les nonces candidats k, dans l ordre.
 *  ⛔ MESURE 2026-10-17 : le h du HMAC est le digest BRUT (32 octets), PAS bits2octets(h) = h mod n de la RFC stricte. C est ce
 *     que fait vm.sign (forge 1.7.1) : avec « h mod n », les 12 vecteurs Foundry a digest >= n (2^256-1 et n) donnaient un autre
 *     nonce (signature VALIDE mais differente) ; avec le digest brut, 30/30 egaux. Les deux ne different que si digest >= n
 *     (~2^-128 pour un keccak). On suit Foundry : le but est l egalite octet pour octet avec vm.sign. */
function* noncesRfc6979(d, z) {
  const x = octets(hex32(d)), h = octets(hex32(z));
  const hmac = (k, ...m) => createHmac('sha256', k).update(Buffer.concat(m)).digest();
  let V = Buffer.alloc(32, 1), K = Buffer.alloc(32, 0);
  K = hmac(K, V, Buffer.from([0]), x, h); V = hmac(K, V);
  K = hmac(K, V, Buffer.from([1]), x, h); V = hmac(K, V);
  for (;;) {
    V = hmac(K, V);
    const k = BigInt('0x' + V.toString('hex'));
    if (k >= 1n && k < N) yield k;
    K = hmac(K, V, Buffer.from([0])); V = hmac(K, V);
  }
}

/** comme signerDigest, avec le detail : { signature, recid, sBascule } (sBascule = s etait haut et a ete remplace par n - s). */
export function signerDigestDetail(privHex, digestHex) {
  const d = lireCle(privHex), z = lireDigest(digestHex);
  for (const k of noncesRfc6979(d, z)) {
    const R = affine(multiplier(k, jac(G)));
    const r = R.x % N;
    if (r === 0n) continue;
    let s = inv(k, N) * (z + r * d) % N;
    if (s === 0n) continue;
    let recid = Number(R.y & 1n) | (R.x >= N ? 2 : 0);
    const sBascule = s > DEMI_N;
    if (sBascule) { s = N - s; recid ^= 1; } // -s retourne R en -R : la parite de y change
    if (recid > 1) throw new Error('signeur: R.x >= n, inexprimable avec v dans {27, 28}'); // probabilite ~ 2^-128
    const signature = '0x' + hex32(r) + hex32(s) + (27 + recid).toString(16);
    if (recupererAdresse(digestHex, signature) !== adresseDe(privHex)) throw new Error('signeur: auto-verification ECHOUEE, signature non rendue');
    return { signature, recid, sBascule };
  }
}

/** signe le digest : '0x' + r (32) + s (32) + v (1), v = 27 + recid, s <= n/2. Deterministe (RFC 6979). */
export function signerDigest(privHex, digestHex) { return signerDigestDetail(privHex, digestHex).signature; }

/** l adresse qui a signe — memes refus que BlockMissionsV3._recover (65 octets, s <= n/2, v dans {27, 28}), mais en JETANT
 *  la ou le contrat rend address(0) : un refus ne doit pas ressembler a une adresse. */
export function recupererAdresse(digestHex, sig) {
  const z = lireDigest(digestHex);
  if (typeof sig !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(sig)) throw new Error('signeur: signature mal formee (attendu 0x + 65 octets)');
  const r = BigInt('0x' + sig.slice(2, 66)), s = BigInt('0x' + sig.slice(66, 130)), v = parseInt(sig.slice(130), 16);
  if (s > DEMI_N) throw new Error('signeur: s haut (> n/2), refuse comme le contrat');
  if (v !== 27 && v !== 28) throw new Error('signeur: v hors de {27, 28}');
  if (r === 0n || r >= N || s === 0n) throw new Error('signeur: r ou s hors de [1, n-1]');
  const c = (r ** 3n + 7n) % P, y = puiss(c, (P + 1n) / 4n, P); // P = 3 mod 4
  if (y * y % P !== c) throw new Error('signeur: r n est l abscisse d aucun point de la courbe');
  const Ry = (y & 1n) === BigInt(v - 27) ? y : P - y;
  const ri = inv(r, N);
  const Q = affine(ajouter(multiplier(mod(-z * ri, N), jac(G)), multiplier(s * ri % N, [r, Ry, 1n])));
  if (!Q) throw new Error('signeur: cle publique recuperee = infini');
  return adresseDuPoint(Q);
}
