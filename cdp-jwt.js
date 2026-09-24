/* cdp-jwt.js — LE JETON D AUTHENTIFICATION CDP, SIGNE ICI, SANS JAMAIS LE FAIRE SORTIR.
 *
 * ⛔⛔ POURQUOI CE FICHIER EST SEPARE DU RESTE. Le secret CDP ne doit traverser qu UN seul module.
 *     Tant qu il traine dans le module de transport, il est sur le chemin de chaque message
 *     d erreur, de chaque journal, de chaque `JSON.stringify` d un objet de contexte. Ici il entre
 *     par un argument, il sert a signer, et il ne ressort sous aucune forme.
 *
 * ⚠️⚠️ CE QUI EST PROUVE ET CE QUI NE L EST PAS — lire avant de faire confiance.
 *     PROUVE (test-cdp-jwt.mjs, avec une cle EC ephemere fabriquee sur place) : la forme du jeton,
 *       les trois parties, le base64url sans remplissage, les champs d en-tete et de charge utile,
 *       la fenetre de validite, et surtout QUE LA SIGNATURE SE VERIFIE avec la cle publique
 *       correspondante, en format JOSE brut.
 *     NON PROUVE : que Coinbase l accepte. Aucune cle CDP n existe ici. Personne ne doit lire
 *       « 24 cas verts » comme « le rail encaisse ».
 */
import { createSign, randomBytes, createPrivateKey, sign as signerBrut } from 'node:crypto';

/* ⛔⛔ CDP A DEUX GENERATIONS DE CLES, ET LE CODE N EN CONNAISSAIT QU UNE.
 *     Mesure du 2026-09-24, en production, la cle enfin posee : la route a cesse de repondre
 *     « no CDP credentials » — donc la cle etait bien chargee — pour repondre
 *     « CDP key could not sign: ERR_OSSL_UNSUPPORTED ». C est l erreur d OpenSSL 3 quand on lui
 *     donne une cle dont il ne reconnait pas le format.
 *     Explication : la cle n est pas une EC P-256 au format PEM (l ancienne generation, signee en
 *     ES256) mais une cle **Ed25519** encodee en base64 brut (la nouvelle). `createPrivateKey` la
 *     refuse telle quelle, et l algorithme du JWT doit alors etre EdDSA, pas ES256.
 *
 *   ⛔ ON SUPPORTE LES DEUX, ET ON NE DEVINE PAS : la FORME de la cle decide. Un PEM commence par
 *     `-----BEGIN` ; tout le reste est traite comme du base64 Ed25519. Se tromper de branche
 *     donnerait la meme erreur opaque qu aujourd hui.
 *   ⛔ AUCUNE DE CES FONCTIONS NE JOURNALISE LA CLE, dans aucune branche. */

/** Prefixe PKCS#8 d une cle privee Ed25519 : c est l enveloppe que node attend autour des 32 octets de graine. */
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * Rend { cle, alg } a partir du secret, quelle que soit sa generation.
 * ⛔ Jette une erreur NOMMEE plutot que de laisser remonter un message d OpenSSL : « unsupported »
 *   tout seul a coute une demi-heure ici.
 */
function cleEtAlgorithme(secret) {
  if (typeof secret !== 'string') return { cle: secret, alg: 'ES256' }; /* objet KeyObject deja pret */
  const s = secret.trim();
  if (s.includes('-----BEGIN')) return { cle: createPrivateKey(s), alg: 'ES256' };
  /* base64 : la nouvelle generation CDP. 64 octets = 32 de graine + 32 de cle publique ; node ne
   * veut QUE la graine, enveloppee en PKCS#8. */
  let brut;
  try { brut = Buffer.from(s, 'base64'); }
  catch (_) { throw new Error('CDP_SECRET_ILLISIBLE'); }
  if (brut.length !== 64 && brut.length !== 32) throw new Error('CDP_SECRET_TAILLE_INATTENDUE');
  const graine = brut.subarray(0, 32);
  const cle = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519, graine]), format: 'der', type: 'pkcs8',
  });
  return { cle, alg: 'EdDSA' };
}

const b64url = (buf) => Buffer.from(buf).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* ⛔ DUREE DE VIE COURTE ET NON REGLABLE. CDP documente deux minutes. En faire un parametre
 *   inviterait quelqu un a fabriquer un jeton longue duree « pour deboguer » — un secret de plus,
 *   valable des heures, dans un journal. */
export const DUREE_JWT_S = 120;

/**
 * Construit et signe le JWT d un appel CDP.
 * @param {object} o
 * @param {string} o.cleId    l identifiant PUBLIC de la cle (il figure dans l en-tete du jeton)
 * @param {string|object} o.secretPem la cle privee. ⛔ ELLE N EST NI JOURNALISEE NI RENDUE.
 * @param {string} o.methode  'POST'
 * @param {string} o.hote     'api.developer.coinbase.com'
 * @param {string} o.chemin   '/onramp/v1/token'
 * @param {number} o.maintenantS l horloge, EN ARGUMENT — voir la note plus bas.
 */
export function signerJwtCdp({ cleId, secretPem, methode, hote, chemin, maintenantS } = {}) {
  if (typeof cleId !== 'string' || !cleId.trim()) {
    return { etat: 'REFUSE', pourquoi: 'CDP key id missing' };
  }
  if (!secretPem || (typeof secretPem === 'string' && !secretPem.trim())) {
    return { etat: 'REFUSE', pourquoi: 'CDP key secret missing' };
  }
  for (const [nom, val] of [['method', methode], ['host', hote], ['path', chemin]]) {
    if (typeof val !== 'string' || !val.trim()) return { etat: 'REFUSE', pourquoi: 'request ' + nom + ' missing' };
  }
  /* ⛔ L HORLOGE EST UN ARGUMENT, PAS UN APPEL A Date.now(). Une fonction qui lit l heure elle-meme
   *   ne peut pas etre testee sur sa fenetre de validite : on ne saurait jamais si `exp` tombe
   *   vraiment deux minutes apres `nbf`, ni si un `nbf` dans le futur serait rejete. */
  const maintenant = Number.isFinite(Number(maintenantS))
    ? Math.floor(Number(maintenantS)) : Math.floor(Date.now() / 1000);
  /* ⛔ `uri` DOIT decrire exactement la requete signee : c est ce qui empeche un jeton vole sur une
   *   route d etre rejoue sur une autre. Le construire ailleurs que juste a cote de l appel reel
   *   est le motif `canonical-helper-weaker-copy`. */
  const uri = methode.toUpperCase() + ' ' + hote + chemin;
  /* ⛔ L ALGORITHME EST CELUI DE LA CLE, jamais une constante : annoncer ES256 sur une cle Ed25519
   *   donnerait un jeton que le serveur rejette avec un 401 muet — la meme classe de panne que la
   *   signature DER, et aussi difficile a diagnostiquer. */
  let cleSignature, alg;
  try { ({ cle: cleSignature, alg } = cleEtAlgorithme(secretPem)); }
  catch (e) {
    return { etat: 'REFUSE',
      pourquoi: 'CDP key format not recognised (' + String((e && e.message) || 'unknown') + ')' };
  }
  const enTete = { alg, kid: cleId, typ: 'JWT', nonce: randomBytes(16).toString('hex') };
  const charge = { iss: 'cdp', sub: cleId, aud: ['cdp_service'],
    nbf: maintenant, exp: maintenant + DUREE_JWT_S, uris: [uri] };
  const corps = b64url(JSON.stringify(enTete)) + '.' + b64url(JSON.stringify(charge));
  try {
    if (alg === 'EdDSA') {
      /* ⛔ Ed25519 se signe EN UN COUP, sans passer par un objet de hachage : l algorithme
       *   integre son propre hachage. `createSign('SHA256')` sur une cle Ed25519 echoue — c est
       *   exactement ce qui rendait ERR_OSSL_UNSUPPORTED. */
      const sig = signerBrut(null, Buffer.from(corps, 'utf8'), cleSignature);
      return { etat: 'OK', jwt: corps + '.' + b64url(sig), expire: charge.exp };
    }
    const cle = cleSignature;
    const s = createSign('SHA256');
    s.update(corps);
    s.end();
    /* ⛔⛔ LE PIEGE QUI FAIT ECHOUER LES INTEGRATIONS ES256 EN SILENCE. Par defaut, Node signe ECDSA
     *     en DER. JOSE exige le format BRUT r‖s ('ieee-p1363'). Les deux sont des signatures
     *     valides : rien n echoue ici, rien n avertit — le serveur distant rend simplement 401, et
     *     on va chercher le probleme du cote de la cle. Le test verifie le format, pas seulement
     *     que « ca signe ». */
    const sig = s.sign({ key: cle, dsaEncoding: 'ieee-p1363' });
    return { etat: 'OK', jwt: corps + '.' + b64url(sig), expire: charge.exp };
  } catch (e) {
    /* ⛔ Le message d erreur de node sur une cle illisible ne contient pas la cle, mais on le tronque
     *   quand meme : une exception future pourrait, elle, en citer un morceau. */
    return { etat: 'REFUSE', pourquoi: 'CDP key could not sign: ' + String((e && e.code) || 'unreadable').slice(0, 40) };
  }
}
