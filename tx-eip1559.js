/* tx-eip1559.js — encode et signe une transaction EIP-1559 (type 2) pour eth_sendRawTransaction. Pur JS (BigInt), zero dependance.
 * Ecrit le 2026-10-23 pour le regleur des slots (slots-regleur.js) : le depot n avait AUCUN encodeur de transaction brute (recherche
 * « rlp », « eth_sendRawTransaction » : rien hors d une liste de methodes refusees). La signature est celle de signeur-secp256k1.js
 * (RFC 6979, s bas, auto-verifiee par recuperation), le seul signeur du depot.
 *
 * ⛔ CE QUE CE FICHIER GARANTIT, ET LA OU C EST PROUVE (test-tx-eip1559-20261023.mjs) :
 *   - RLP : les exemples de la specification (chaine vide, octet seul, chaine de 55 / 56 octets, listes imbriquees, entiers) ;
 *   - la transaction signee est OCTET POUR OCTET celle de `cast mktx` (Foundry 1.x, une autre implementation) sur des vecteurs fixes,
 *     cle de test publique 0x…01 (jamais une vraie cle) ; le hash = keccak256(octets bruts) = celui que cast rend ;
 *   - `cast decode-transaction` relit l emetteur = l adresse de la cle.
 * ⛔ CE QU IL NE FAIT PAS : aucune liste d acces (toujours vide), aucun type 0/1/3/4. Il refuse un champ hors bornes au lieu de le tronquer.
 * ⛔ La cle n est JAMAIS journalisee ni mise dans une erreur (les erreurs du signeur ne citent pas la valeur recue). */
import { keccak256 } from './keccak.js';
import { signerDigestDetail, recupererAdresse } from './signeur-secp256k1.js';

const hex = (o) => '0x' + Buffer.from(o).toString('hex');
const deHex = (h) => {
  const s = String(h).replace(/^0x/, '');
  if (s.length % 2 || !/^[0-9a-fA-F]*$/.test(s)) throw new Error('tx: hexadecimal mal forme');
  return Uint8Array.from(Buffer.from(s, 'hex'));
};
const concat = (...xs) => { const t = new Uint8Array(xs.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of xs) { t.set(x, i); i += x.length; } return t; };

/** un entier >= 0 -> ses octets big-endian MINIMAUX (0 -> aucun octet), comme le veut RLP pour un scalaire */
export function octetsEntier(n) {
  const v = BigInt(n);
  if (v < 0n) throw new Error('tx: entier negatif');
  if (v === 0n) return new Uint8Array(0);
  let s = v.toString(16);
  if (s.length % 2) s = '0' + s;
  return Uint8Array.from(Buffer.from(s, 'hex'));
}

const longueur = (n, base) => { if (n < 56) return Uint8Array.of(base + n); const l = octetsEntier(n); return concat(Uint8Array.of(base + 55 + l.length), l); };

/** RLP : un element = Uint8Array (chaine d octets) ou tableau d elements (liste) */
export function rlp(x) {
  if (Array.isArray(x)) { const corps = concat(...x.map(rlp)); return concat(longueur(corps.length, 0xc0), corps); }
  if (!(x instanceof Uint8Array)) throw new Error('tx: element RLP inattendu');
  if (x.length === 1 && x[0] < 0x80) return x;
  return concat(longueur(x.length, 0x80), x);
}

const MAX256 = (1n << 256n) - 1n;
const champ = (nom, v, max = MAX256) => {
  let b;
  try { b = BigInt(v); } catch (_) { throw new Error('tx: ' + nom + ' illisible'); }
  if (b < 0n || b > max) throw new Error('tx: ' + nom + ' hors bornes');
  return b;
};

/** les champs normalises d une tx type 2 ; refuse tout champ hors bornes (rien n est tronque) */
export function normaliser(tx) {
  const to = String(tx.to || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(to)) throw new Error('tx: destinataire mal forme (la creation de contrat n est pas prise en charge)');
  const data = String(tx.data || '0x');
  deHex(data);
  if (Array.isArray(tx.accessList) && tx.accessList.length) throw new Error('tx: liste d acces non prise en charge');
  const n = {
    chainId: champ('chainId', tx.chainId, (1n << 64n) - 1n),
    nonce: champ('nonce', tx.nonce, (1n << 64n) - 2n),
    maxPriorityFeePerGas: champ('maxPriorityFeePerGas', tx.maxPriorityFeePerGas),
    maxFeePerGas: champ('maxFeePerGas', tx.maxFeePerGas),
    gas: champ('gas', tx.gas, (1n << 64n) - 1n),
    to,
    value: champ('value', tx.value ?? 0),
    data: data.toLowerCase(),
  };
  if (n.chainId === 0n) throw new Error('tx: chainId nul');
  if (n.maxPriorityFeePerGas > n.maxFeePerGas) throw new Error('tx: maxPriorityFeePerGas > maxFeePerGas');
  return n;
}

const liste = (n) => [octetsEntier(n.chainId), octetsEntier(n.nonce), octetsEntier(n.maxPriorityFeePerGas), octetsEntier(n.maxFeePerGas),
  octetsEntier(n.gas), deHex(n.to), octetsEntier(n.value), deHex(n.data), []];

/** les octets SIGNES (EIP-1559) : 0x02 || rlp([chainId, nonce, prio, max, gas, to, value, data, accessList]) */
export function octetsASigner(tx) { return concat(Uint8Array.of(2), rlp(liste(normaliser(tx)))); }
export const digestASigner = (tx) => hex(keccak256(octetsASigner(tx)));

/**
 * signe : rend { brut: '0x02…', hash: keccak256(brut), de: l adresse qui a signe (relue par recuperation) }. ⛔ `cle` ne sort jamais d ici.
 */
export function signerEip1559(tx, cle) {
  const n = normaliser(tx);
  const digest = hex(keccak256(concat(Uint8Array.of(2), rlp(liste(n)))));
  const { signature, recid } = signerDigestDetail(cle, digest);
  const r = BigInt('0x' + signature.slice(2, 66)), s = BigInt('0x' + signature.slice(66, 130));
  const brut = concat(Uint8Array.of(2), rlp([...liste(n), octetsEntier(recid), octetsEntier(r), octetsEntier(s)]));
  return { brut: hex(brut), hash: hex(keccak256(brut)), de: recupererAdresse(digest, signature) };
}

/** le hash d une tx brute : keccak256 de ses octets (le hash que rend eth_sendRawTransaction) */
export const hashBrut = (brut) => hex(keccak256(deHex(brut)));
