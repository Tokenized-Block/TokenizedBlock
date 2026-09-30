/* actions-emetteur.js — QUELLES ADRESSES SONT DES ACTIONS DE L EMETTEUR, D APRES L EMETTEUR.
 *
 * ⛔⛔ DECISION DE PHIL, 2026-09-30, sur « Biggest blocks » : UNE SEULE LISTE, avec l ORIGINE DITE.
 *     Les actions tokenisees y restent, marquees « issued by Coinbase ».
 *
 * ⛔⛔⛔ ET POURQUOI CE MODULE EXISTE AU LIEU D UTILISER `STOCKS_BASE_REGISTRY`. Notre registre porte
 *      QUINZE actions ; la liste de l emetteur en declare QUARANTE (mesure du 2026-09-30, HTTP 200).
 *      Marquer seulement nos quinze laisserait GMEc, DJTc, NFLXc, AMDc, RDDTc, HTZc, PFEc… NON
 *      MARQUEES — et une ligne non marquee se lit « block lance ici ». Une marque partielle est
 *      PIRE qu aucune marque : elle transforme les vingt-cinq oubliees en fausses affirmations,
 *      alors qu une absence de marque generale n affirme rien.
 *
 * ⛔ LA SOURCE : `https://api.coinbase.com/v1/tokenized-stocks`, SONDEE avant d etre codee contre
 *   (40 entrees, `contract_address` + `symbol`). Trouvee dans le README public de
 *   `haardikk21/based-stonks`.
 *
 * ⛔ LA RETOMBEE EST NOMMEE, JAMAIS DEGUISEE EN LECTURE. Si l API ne repond pas, l etat vaut
 *   `RETOMBEE` et l appelant sait que la marque est INCOMPLETE — quinze sur quarante. C est le
 *   motif n°1 de ce depot : un retour neutre qui avale une panne.
 *
 * ⚠️ BORNE : ce module dit ce que l EMETTEUR publie. Il ne prouve pas qu une adresse soit un B20
 *    (`eth_getCode == 0xef`), ni qu elle circule. `mesure-registre-emetteur.mjs` fait ca.
 */

export const URL_EMETTEUR = 'https://api.coinbase.com/v1/tokenized-stocks';
export const ETATS_EMETTEUR = Object.freeze(['OK', 'RETOMBEE', 'NON_MESURE']);

/** Le libelle montre a l ecran. ⛔ Ecrit UNE fois : deux copies divergent. */
export const LIBELLE_EMETTEUR = 'issued by Coinbase';

/* ⛔⛔⛔ LA FORME COURTE, ET ELLE VIENT D UNE MESURE, PAS D UN GOUT. Sur un ecran de 375 px, la
 *      phrase longue prend 97 px et ne laisse que 39 px au NOM du block : SIX symboles sur douze
 *      etaient TRONQUES (`GOOGLc` demandait 51 px, `AMZNc` 46, `NVDAc` 44…). Les lignes NON
 *      marquees, elles, avaient 157 px — c etait donc entierement ma marque qui ecrasait le nom.
 *    ⛔ LE NOM EST L IDENTITE, L ORIGINE EST SECONDAIRE. Une marque qui coupe ce qu elle qualifie
 *      se retourne contre elle-meme : « GOOGL… issued by Coinbase » dit l origine d un block qu on
 *      ne sait plus nommer.
 *    ⛔ ET ELLE DIT LA MEME CHOSE : « Coinbase » a cote d une capitalisation nomme l emetteur. On
 *      ne raccourcit pas en changeant l affirmation. */
export const LIBELLE_EMETTEUR_COURT = 'Coinbase';

/* ⛔⛔ LA RETOMBEE, ET ELLE EST SCIEMMENT INCOMPLETE — c est pour ca que l etat le dit. Ce sont les
 *     quinze adresses de `STOCKS_BASE_REGISTRY`, recopiees, chacune deja verifiee sur la chaine
 *     (`0xef` EXACTEMENT, `symbol()` concordant, `decimals()` == 8, `totalSupply()` > 0). */
export const EMETTEUR_RETOMBEE = Object.freeze([
  '0xb200000000000000000000c2e324d24d7eecd1fb', '0xb200000000000000000000d9192b6b456483c2e8',
  '0xb200000000000000000000fc737aea6196ab5a4c', '0xb20000000000000000000016f9dfe862feba122b',
  '0xb2000000000000000000002d0ba3164cc74f58b7', '0xb20000000000000000000043a599976181bcf336',
  '0xb2000000000000000000008bc8786b856e61707c', '0xb200000000000000000000ab99cfa739e253872b',
  '0xb2000000000000000000004884b426556b92883d', '0xb200000000000000000000fd2f87532b90095211',
  '0xb20000000000000000000078ee7ce2fe4908108c', '0xb2000000000000000000007d16372840df4dabbe',
  '0xb200000000000000000000397293cb8cda9a10c5', '0xb2000000000000000000007b9fcbd005511acbd5',
  '0xb2000000000000000000001e800a7f5189430cd0',
]);

const ADR = /^0x[0-9a-fA-F]{40}$/;

/**
 * Decode la reponse de l emetteur en liste d adresses minuscules.
 * ⛔ REFUSE plutot que de rendre une liste partielle : une liste amputee marque moins d actions
 *   qu il n en existe, et chaque oubli devient une ligne qui se lit « block lance ici ».
 * @returns {{etat:string, adresses:string[], symboles:Object, pourquoi?:string}}
 */
export function decodeActionsEmetteur(donnee) {
  let d = donnee;
  if (typeof d === 'string') {
    try { d = JSON.parse(d); } catch (_) {
      return { etat: 'NON_MESURE', adresses: [], symboles: {}, pourquoi: 'response is not JSON' };
    }
  }
  if (!d || typeof d !== 'object' || !Array.isArray(d.tokens)) {
    return { etat: 'NON_MESURE', adresses: [], symboles: {}, pourquoi: 'no `tokens` array in the response' };
  }
  if (d.tokens.length === 0) {
    /* ⛔ ZERO NE PEUT PAS ETRE VRAI : l emetteur a des actions deployees et echangees. Rendre `OK`
     *   avec une liste vide ne marquerait RIEN, partout. */
    return { etat: 'NON_MESURE', adresses: [], symboles: {}, pourquoi: 'the issuer declared zero tokens, which cannot be true' };
  }
  const adresses = []; const symboles = {};
  for (let i = 0; i < d.tokens.length; i += 1) {
    const t = d.tokens[i] || {};
    const a = String(t.contract_address || '');
    if (!ADR.test(a)) {
      return { etat: 'NON_MESURE', adresses: [], symboles: {},
        pourquoi: 'entry ' + i + ' has no whole contract address' };
    }
    const bas = a.toLowerCase();
    if (!adresses.includes(bas)) adresses.push(bas);
    if (t.symbol) symboles[bas] = String(t.symbol);
  }
  return { etat: 'OK', adresses, symboles };
}

/**
 * Lit la liste chez l emetteur, et retombe sur nos quinze si la lecture echoue.
 * @param {(url:string)=>Promise<string|object|null>} chercher
 */
export async function lireActionsEmetteur(chercher) {
  let brut = null;
  try { brut = await chercher(URL_EMETTEUR); } catch (_) { brut = null; }
  const d = decodeActionsEmetteur(brut);
  if (d.etat === 'OK') return d;
  return { etat: 'RETOMBEE', adresses: [...EMETTEUR_RETOMBEE], symboles: {},
    pourquoi: 'issuer list unread (' + (d.pourquoi || 'no reason') + '); marking only the 15 we '
      + 'verified on chain, so some issuer stocks will go UNMARKED' };
}

/** ⛔ Une adresse absente de la liste n est PAS prouvee « block lance » — elle est prouvee absente
 *  DE CETTE LISTE. C est pour ca que la marque s AJOUTE et que rien ne s affirme par son absence. */
export function estActionEmetteur(adr, adresses) {
  if (!ADR.test(String(adr || ''))) return false;
  const l = Array.isArray(adresses) ? adresses : [];
  return l.includes(String(adr).toLowerCase());
}

/** Phrase pour un journal. ⛔ Vide sur `OK` : un avertissement permanent devient invisible. */
export function phraseActionsEmetteur(r) {
  if (!r || typeof r !== 'object') return 'issuer list not read — unknown';
  if (r.etat === 'OK') return '';
  if (r.etat === 'RETOMBEE') return 'issuer list not read; ' + (r.pourquoi || '');
  return 'issuer list not read — ' + (r.pourquoi || 'unknown');
}
