/* voucher-config.js — PUR (navigateur et Node) : ce que deployer-voucher.html construit et verifie pour deployer BlockSkinsVoucher.
 *   La page, le banc fork (banc-deployer-voucher-fork-20261105.mjs) et le test de la page appellent CES fonctions : les octets que le
 *   banc envoie sont ceux que la page enverrait.
 * Le constructeur, lu dans contracts/src/BlockSkinsVoucher.sol : `constructor(address signer_)` — refuse address(0) ; `owner = msg.sender`
 *   (le wallet qui deploie devient OWNER : il peut tourner le signataire, annuler une commande non reclamee, ceder la propriete en deux temps).
 * Le signataire est une adresse que Phil COLLE (celle de la cle dediee SHOPIFY_VOUCHER_SIGNER_KEY du serveur) : jamais devinee, jamais
 *   completee ; une casse mixte doit etre un checksum EIP-55 juste ; le wallet qui deploie est REFUSE comme signataire (sa cle finirait
 *   dans l environnement du serveur).
 * Aucune cle, aucun reseau ici. */
import { keccak256Hex, selecteur } from './keccak.js';

const HEX40 = /^0x[0-9a-fA-F]{40}$/;
const ZERO = '0x' + '0'.repeat(40);
const enc = new TextEncoder();
const kTexte = (s) => keccak256Hex(enc.encode(s));
const octetsDe = (h) => Uint8Array.from((String(h).replace(/^0x/, '').match(/../g) || []).map((x) => parseInt(x, 16)));
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');

/** EIP-55 : l adresse en casse de controle */
export function checksum(adresse) {
  const a = String(adresse).toLowerCase().replace(/^0x/, '');
  const h = keccak256Hex(enc.encode(a)).slice(2);
  return '0x' + [...a].map((c, i) => (parseInt(h[i], 16) >= 8 ? c.toUpperCase() : c)).join('');
}

/** L adresse COLLEE du signataire : { ok, adresse (minuscules), pourquoi } */
export function validerSignataire(texte, { deployeur = null } = {}) {
  const t = String(texte == null ? '' : texte).trim();
  if (!t) return { ok: false, adresse: null, pourquoi: 'paste the signer address' };
  if (!HEX40.test(t)) return { ok: false, adresse: null, pourquoi: 'not a whole address: 0x and 40 hex characters' };
  const corps = t.slice(2);
  if (corps !== corps.toLowerCase() && corps !== corps.toUpperCase() && checksum(t) !== t) return { ok: false, adresse: null, pourquoi: 'the capital letters do not match the address checksum (EIP-55): a character is wrong' };
  const a = t.toLowerCase();
  if (a === ZERO) return { ok: false, adresse: null, pourquoi: 'the zero address cannot sign' };
  if (deployeur && a === String(deployeur).toLowerCase()) return { ok: false, adresse: null, pourquoi: 'the signer must be a dedicated server key, not the wallet that deploys and owns the contract' };
  return { ok: true, adresse: a, pourquoi: null };
}

/** la donnee de creation : le code FIGE + abi.encode(signer) */
export function creationAvec(D, signataire) {
  const v = validerSignataire(signataire);
  if (!v.ok) throw new Error('creationAvec: ' + v.pourquoi);
  return D.code + v.adresse.slice(2).padStart(64, '0');
}

/** la fiche figee est-elle intacte ? (sha256 du code recalcule par l appelant) */
export function verifierFiche(D, sha256Code) {
  const pourquoi = [];
  if (!D || D.chaine !== 8453) pourquoi.push('not Base');
  if (!D || D.contrat !== 'BlockSkinsVoucher') pourquoi.push('not BlockSkinsVoucher');
  if (!D || !/^0x[0-9a-f]+$/.test(String(D.code))) pourquoi.push('no creation code');
  else {
    if ((D.code.length - 2) / 2 !== D.octetsCode) pourquoi.push('size differs');
    if (sha256Code !== D.sha256Code) pourquoi.push('fingerprint differs');
  }
  if (!D || JSON.stringify(D.ordre) !== '["signer"]') pourquoi.push('constructor differs');
  if (!D || !/^0x[0-9a-f]{64}$/.test(String(D.keccakRuntime))) pourquoi.push('no runtime fingerprint');
  if (D && D.adresse) pourquoi.push('already deployed');
  return { intacte: pourquoi.length === 0, pourquoi };
}

/** = BlockSkinsVoucher.domainSeparator() a cette adresse sur cette chaine */
export function separateurAttendu(adresse, chaine = 8453) {
  return keccak256Hex(octetsDe(kTexte('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)').slice(2)
    + kTexte('BlockSkinsVoucher').slice(2) + kTexte('1').slice(2) + mot(chaine) + String(adresse).toLowerCase().slice(2).padStart(64, '0')));
}

/** les lectures a faire apres le recu : [nom, donnees d appel] */
export const LECTURES = Object.freeze(['signer()', 'owner()', 'pendingOwner()', 'totalSupply()', 'domainSeparator()'].map((s) => [s, selecteur(s)]));

/** compare ce que le contrat relit a ce qui a ete signe. lu = { code, 'signer()', 'owner()', ... } (mots hex bruts d eth_call) */
export function verifierRelecture(D, { adresse, code, lu, signataire, deployeur }) {
  const ecarts = [];
  const adr = (w) => ('0x' + String(w || '').slice(-40)).toLowerCase();
  if (!code || code === '0x' || keccak256Hex(octetsDe(code)) !== D.keccakRuntime) ecarts.push('deployed code differs from the compiled runtime');
  if (adr(lu['signer()']) !== String(signataire).toLowerCase()) ecarts.push('signer() differs');
  if (adr(lu['owner()']) !== String(deployeur).toLowerCase()) ecarts.push('owner() is not the deploying wallet');
  if (adr(lu['pendingOwner()']) !== ZERO) ecarts.push('pendingOwner() is not empty');
  let total = null; try { total = BigInt(lu['totalSupply()']); } catch (_) { total = null; }
  if (total !== 0n) ecarts.push('totalSupply() is not 0');
  if (String(lu['domainSeparator()'] || '').toLowerCase() !== separateurAttendu(adresse, D.chaine)) ecarts.push('domainSeparator() differs');
  return { bon: ecarts.length === 0, ecarts };
}

/** ce que Phil pose sur le serveur — l adresse vient du RECU ; la cle, il la pose lui-meme (jamais collee ici) */
export function variablesEnv(adresse, signataire) {
  return [
    'SHOPIFY_VOUCHER_CONTRACT=' + String(adresse).toLowerCase(),
    'SHOPIFY_VOUCHER_SIGNER_KEY=<the private key of ' + String(signataire).toLowerCase() + ' — set it on the server yourself; never paste it in a page>',
  ];
}
