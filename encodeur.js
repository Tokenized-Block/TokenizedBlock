// encodeur.js — construit le calldata de createB20 DANS LE NAVIGATEUR.
// ================================================================================================
// ⛔ POURQUOI C EST DANGEREUX, ET COMMENT ON S EN PROTEGE.
// L implementation native de B20 rejette une calldata non canonique avec `AbiDecodeFailed` —
// APRES le gaz, et pas a la simulation si on encode soi-meme des DEUX cotes. Un encodeur qui
// « a l air bon » ne se detecte donc pas tout seul.
//
// ⇒ LE SEUL CONTROLE QUI VAUT : reproduire OCTET POUR OCTET la calldata que `base-forge` a
//   produite via B20FactoryLib pour un cas connu. C est ce que fait `test-encodeur.mjs`, et il
//   compare a la sortie REELLE de la simulation mainnet, pas a une valeur que j aurais recopiee.
//
// ⛔ Aucun selecteur n est recite : tous sont DERIVES par keccak a l execution.
import { keccak256 } from './keccak.js';

const enc = new TextEncoder();
const hex = (o) => [...o].map((b) => b.toString(16).padStart(2, '0')).join('');
const octets = (h) => Uint8Array.from(h.replace(/^0x/, '').match(/../g).map((b) => parseInt(b, 16)));

export function selecteur(sig) { return hex(keccak256(enc.encode(sig))).slice(0, 8); }
export function motDeHash(s) { return hex(keccak256(enc.encode(s))); }

const mot = (v) => v.toString(16).padStart(64, '0');
const motAdresse = (a) => a.replace(/^0x/, '').toLowerCase().padStart(64, '0');

/* Une valeur dynamique : longueur, puis contenu complete a un multiple de 32 octets.
 * ⛔ Le bourrage n est pas cosmetique : sans lui les offsets suivants tombent au mauvais endroit,
 *    et l erreur n indique jamais un probleme d alignement. */
function dynamique(hexContenu) {
  const n = hexContenu.length / 2;
  const reste = (32 - (n % 32)) % 32;
  return mot(n) + hexContenu + '00'.repeat(reste);
}
const chaineHex = (s) => hex(enc.encode(s));

/** B20AssetCreateParams : abi.encode d une struct DYNAMIQUE — donc precedee de son offset. */
export function paramsAsset({ nom, symbole, admin, decimales }) {
  const n = chaineHex(nom), s = chaineHex(symbole);
  const tete = mot(1n) + mot(0xa0n) + mot(0xe0n) + motAdresse(admin) + mot(BigInt(decimales));
  /* offsets name/symbol relatifs au DEBUT DE LA STRUCT : 5 mots de tete = 0xa0, puis name occupe
   * 1 mot de longueur + 1 mot de contenu (les deux tiennent en 32 o) => symbol a 0xe0. */
  if (enc.encode(nom).length > 32 || enc.encode(symbole).length > 32) {
    throw new Error('nom ou symbole > 32 octets : cet encodeur ne couvre pas ce cas');
  }
  return mot(0x20n) + tete + dynamique(n) + dynamique(s);
}

export function encodeUpdateSupplyCap(plafond) { return selecteur('updateSupplyCap(uint256)') + mot(plafond); }
export function encodeUpdateContractURI(uri) {
  return selecteur('updateContractURI(string)') + mot(0x20n) + dynamique(chaineHex(uri));
}
export function encodeBatchMint(destinataires, montants) {
  /* batchMint(address[],uint256[]) : deux tableaux dynamiques, donc deux offsets en tete. */
  const a = mot(BigInt(destinataires.length)) + destinataires.map(motAdresse).join('');
  const b = mot(BigInt(montants.length)) + montants.map(mot).join('');
  const offA = 0x40n, offB = offA + BigInt(a.length / 2);
  return selecteur('batchMint(address[],uint256[])') + mot(offA) + mot(offB) + a + b;
}

/** createB20(uint8 variant, bytes32 salt, bytes params, bytes[] initCalls) */
export function encodeCreateB20({ variant = 0, saltTexte, params, initCalls }) {
  const salt = motDeHash(saltTexte);

  /* bytes[] : longueur, puis un offset par element (relatifs au debut du TABLEAU), puis les
   * elements sous forme dynamique. */
  const corpsElements = initCalls.map((c) => dynamique(c));
  let curseur = BigInt(32 * initCalls.length);
  const offsets = [];
  for (const e of corpsElements) { offsets.push(mot(curseur)); curseur += BigInt(e.length / 2); }
  const tableau = mot(BigInt(initCalls.length)) + offsets.join('') + corpsElements.join('');

  const blocParams = dynamique(params);
  const offParams = 0x80n;                       // 4 mots de tete
  const offInit = offParams + BigInt(blocParams.length / 2);

  return '0x' + selecteur('createB20(uint8,bytes32,bytes,bytes[])')
    + mot(BigInt(variant)) + salt + mot(offParams) + mot(offInit)
    + blocParams + tableau;
}


/** createPaid(uint8,bytes32,bytes,bytes[],address) — CreateRouter payable path. */
export function encodeCreatePaid({ variant = 0, saltTexte, params, initCalls, creator }) {
  const salt = motDeHash(saltTexte);
  const corpsElements = initCalls.map((c) => dynamique(c));
  let curseur = BigInt(32 * initCalls.length);
  const offsets = [];
  for (const e of corpsElements) { offsets.push(mot(curseur)); curseur += BigInt(e.length / 2); }
  const tableau = mot(BigInt(initCalls.length)) + offsets.join('') + corpsElements.join('');
  const blocParams = dynamique(params);
  const offParams = 0xa0n; /* 5 head words: variant, salt, offParams, offInit, creator */
  const offInit = offParams + BigInt(blocParams.length / 2);
  return '0x' + selecteur('createPaid(uint8,bytes32,bytes,bytes[],address)')
    + mot(BigInt(variant)) + salt + mot(offParams) + mot(offInit) + motAdresse(creator)
    + blocParams + tableau;
}

/** L adresse deterministe n est PAS calculable ici : elle depend du precompile. On la LIT. */
export async function adresseAttendue(rpc, appelant, calldata) {
  const r = await rpc('eth_call', [{ from: appelant, to: '0xb20f000000000000000000000000000000000000', data: calldata }, 'latest']);
  if (!r || r === '0x') return null;
  return '0x' + r.slice(-40);
}

export { octets };

/* ⛔ NOMMER LE REFUS DE LA CHAINE, au lieu de rendre « execution reverted ».
 * Les selecteurs sont DERIVES des signatures, jamais recopies : `TokenAlreadyExists` prend un
 * `address` en parametre, et j avais d abord derive la version SANS parametre — qui ne correspond
 * a rien. Une signature approximative produit un selecteur parfaitement valide et faux. */
const REFUS = {};
for (const [sig, texte] of [
  ['TokenAlreadyExists(address)', 'That salt is already used by this account. Change the salt — it fixes the address.'],
  ['InvalidDecimals()', 'Decimals must be between 6 and 18.'],
  ['MissingRequiredField()', 'A required text field is empty.'],
  ['UnsupportedVersion()', 'The factory does not recognise this parameter version.'],
  ['AbiDecodeFailed()', 'The factory refused the encoding of the parameters.'],
  ['InvalidVariant()', 'Unknown token variant.'],
  ['NonPayable()', 'This call must carry no ETH.'],
  ['FeeTooLow()', 'Create fee ETH is below the CreateRouter floor.'],
  ['BadMint()', 'CreateRouter refused the mint (bad creator).'],
  ['EthTransferFailed()', 'CreateRouter could not forward the fee ETH.'],
]) REFUS['0x' + selecteur(sig)] = texte;

/**
 * Explique un refus on-chain. Rend `null` si la donnee ne correspond a aucune erreur connue —
 * ⛔ on ne devine pas : mieux vaut montrer le selecteur brut que nommer la mauvaise cause.
 */
export function expliquerRefus(donnee) {
  if (typeof donnee !== 'string' || donnee.length < 10) return null;
  return REFUS[donnee.slice(0, 10)] || null;
}

/**
 * Adresse attendue, SANS lever : rend `{ adresse, refus, brut }`.
 * ⛔ La version qui levait faisait remonter l exception jusqu au `catch` du bouton, lequel
 *    affichait « Not signed: execution reverted » — c est-a-dire qu il ACCUSAIT L UTILISATEUR
 *    d avoir refuse alors que c est la CHAINE qui refusait. Deux causes opposees, un seul message.
 */
export async function adresseOuRefus(appelBrut, appelant, calldata, opts = {}) {
  const to = (opts && opts.to) || '0xb20f000000000000000000000000000000000000';
  const tx = { from: appelant, to, data: calldata };
  if (opts && opts.value != null) tx.value = opts.value;
  const r = await appelBrut(tx);
  if (r && r.error) {
    const d = r.error.data ? String(r.error.data) : '';
    /* ⛔ ON GARDE LES DONNEES ENTIERES, pas seulement le selecteur. `TokenAlreadyExists(address)`
     * PORTE L ADRESSE du token existant : tronquer a 10 caracteres jetait precisement la reponse
     * que l appelant cherchait. Un refus n est pas toujours une absence d information — parfois
     * c est l information, servie par la voie de l erreur.
     * ⚠️ `brut` reste inchange pour ne casser aucun appelant ; `donnees` est ajoute a cote. */
    return { adresse: null, refus: expliquerRefus(d) || (r.error.message || 'refused'),
      brut: d.slice(0, 10) || null, donnees: d || null };
  }
  const res = r && r.result;
  if (!res || res === '0x') return { adresse: null, refus: 'the factory returned nothing', brut: null };
  return { adresse: '0x' + res.slice(-40), refus: null, brut: null };
}

/**
 * L adresse du block DEJA EXISTANT, extraite du refus `TokenAlreadyExists(address)`.
 *
 * ⛔ LE REFUS PORTE LA REPONSE. La chaine ne dit pas seulement « ce sel est pris » : elle rend
 *    l adresse du block qui occupe la place — celui que l utilisateur a lui-meme cree. Dire
 *    « change the salt » en jetant cette adresse, c est cacher a quelqu un son propre block.
 *    `adresseOuRefus` rendait deja `donnees` ; personne ne les decodait. Troisieme fois ce
 *    jour-la qu une valeur est LUE puis JETEE — apres le prix de `slot0` et le sqrtPrice de la
 *    pool. Un helper existe maintenant, pour que ca ne recommence pas.
 *
 * ⚠️ Rend `null` plutot qu une adresse tronquee si la donnee est trop courte ou n est pas ce
 *    refus-la : une adresse devinee vaut pire que pas d adresse.
 */
export function adresseDejaPrise(donnees) {
  const d = String(donnees || '');
  const sel = '0x' + selecteur('TokenAlreadyExists(address)');
  if (!d.startsWith(sel) || d.length < sel.length + 64) return null;
  const mot = d.slice(sel.length, sel.length + 64);
  /* ⛔ les 12 premiers octets d une adresse ABI sont nuls : sinon ce n est pas une adresse. */
  if (!/^0{24}[0-9a-fA-F]{40}$/.test(mot)) return null;
  const a = '0x' + mot.slice(24);
  return /^0x0{40}$/.test(a) ? null : a;
}
