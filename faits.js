// faits.js — ce qu un block EST, lu sur la chaine. Aucune interpretation, aucun jugement.
// ================================================================================================
// ⛔ CE MODULE NE DIT PAS SI UN BLOCK EST BON. Il rend des faits bruts et NOMME ce qu il n a pas
//    pu lire. Un lecteur qui comble ses trous avec des valeurs par defaut transforme son propre
//    silence en affirmation sur la chose de quelqu un d autre — c est la faute la plus chere de ce
//    depot, et elle a deja ete commise ici (« jamais cote » sur deux blocks qui s echangeaient).
//
// ⛔⛔ LE MARQUEUR D IDENTITE EST `code === '0xef'`, JAMAIS LE PREFIXE `0xb200`. EIP-3541 interdit a
//    tout contrat DEPLOYE de commencer par l octet 0xEF : le marqueur est donc infalsifiable. Le
//    prefixe d adresse, lui, est IMPERSONNABLE — n importe qui peut faire miner une adresse qui y
//    ressemble. Confondre les deux, c est offrir une usurpation gratuite.
//
// ⛔ LES DECIMALES SE LISENT. Supposer 18 a deja produit des capitalisations fausses d un facteur
//    mille sur un jeton a 6 decimales. `null` veut dire non lu, jamais 18.
import { selecteur } from './pool.js';
import { chaineA } from './index-blocks.js';

const MOT = (hex, i = 0) => BigInt('0x' + String(hex).slice(2 + i * 64, 66 + i * 64));

/**
 * Les faits d un block.
 * @returns {Promise<{adr, estB20, code, symbole, nom, decimales, supply, cap, mintFerme, manques}>}
 *
 * ⛔ `manques` EST LA MOITIE DU RESULTAT. Chaque champ qu on n a pas su lire y est NOMME, pour que
 *    l ecran puisse dire « non lu » au lieu de laisser un blanc qui se lira comme un zero.
 */
export async function faitsDuBlock({ rpc, jeton, pause = 0, delaiMax = 0 }) {
  const manques = [];
  /* ⛔⛔ 2026-10-04 (QA wallet reel de Grok, P1 : « CAKEc reste sur Checking that stock on chain… ») — UNE ECHEANCE POUR
   *   L ENSEMBLE DES LECTURES, quand l appelant en demande une (`delaiMax`, en ms). Ce module enchaine six lectures ; le
   *   `fetch` de l app est borne a 8 s PAR TENTATIVE depuis le meme jour, mais une lecture peut encore couter plusieurs
   *   tentatives (un noeud apres l autre, puis les reprises) et il y en a six : l ecran qui attend ce resultat restait sur
   *   sa phrase d attente bien au-dela de ce qu une personne attend.
   * ⛔ PASSE L ECHEANCE, UNE LECTURE N EST PAS « FAUSSE », ELLE EST « NON LUE » : elle tombe dans le MEME chemin qu un noeud
   *   qui refuse (`null` + son nom dans `manques`). Rien n est invente, et `estB20` reste `null` si le code n a pas ete lu.
   * ⛔ `0` (le defaut) = AUCUNE echeance : les appelants qui ne demandent rien lisent exactement comme avant.
   * ⚠️ La lecture abandonnee n est pas annulee (ce module ne tient pas le `fetch`) : elle finit ou expire de son cote,
   *   et son resultat est ignore. Passe l echeance, les lectures suivantes ne sont meme plus envoyees. */
  const echeance = delaiMax > 0 ? Date.now() + delaiMax : null;
  const lire = (methode, params) => {
    if (echeance === null) return rpc(methode, params);
    const reste = echeance - Date.now();
    if (reste <= 0) return Promise.reject(new Error('read timed out'));
    let minuteur;
    return Promise.race([
      rpc(methode, params),
      new Promise((_, non) => { minuteur = setTimeout(() => non(new Error('read timed out')), reste); }),
    ]).finally(() => clearTimeout(minuteur));
  };
  /* ⛔⛔ ON RESPIRE ENTRE LES LECTURES, ET C EST MESURE. Six appels d affilee sur le noeud public
   * font refuser les cinq derniers : mesure du 2026-09-10, `code` passait et symbol, name,
   * decimals, totalSupply et supplyCap etaient TOUS « non lus ». Le module disait vrai — il les
   * nommait au lieu d inventer des zeros — mais l ecran ne montrait presque rien.
   * ⚠️ `pause` vaut 0 par defaut pour que les TESTS restent instantanes : ils ne parlent a aucun
   *    reseau et n ont rien a menager. C est l appelant en ligne qui demande a ralentir. */
  /* passe l echeance, on ne respire plus : il n y a plus de lecture a menager, et attendre retarderait la reponse */
  const souffler = pause
    ? () => (echeance !== null && Date.now() >= echeance ? Promise.resolve() : new Promise((r) => setTimeout(r, pause)))
    : async () => {};
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jeton || ''))) {
    return { adr: jeton, estB20: false, code: null, symbole: null, nom: null, decimales: null,
      supply: null, cap: null, mintFerme: null, manques: ['not an address'] };
  }

  let code = null;
  try { code = await lire('eth_getCode', [jeton, 'latest']); } catch { manques.push('code'); }

  /* ⛔ `estB20` reste `null` si le code n a pas ete lu : ne pas savoir n est pas « non ». */
  const estB20 = code === null ? null : String(code).toLowerCase() === '0xef';

  const lireTexte = async (sig) => {
    try {
      const r = await lire('eth_call', [{ to: jeton, data: '0x' + selecteur(sig) }, 'latest']);
      if (!r || r === '0x') return null;
      /* les chaines ABI sont pointees par un offset dans le premier mot */
      return chaineA(String(r).slice(2), Number(MOT(r, 0)));
    } catch { return null; }
  };
  const lireNombre = async (sig) => {
    try {
      const r = await lire('eth_call', [{ to: jeton, data: '0x' + selecteur(sig) }, 'latest']);
      if (!r || r === '0x' || String(r).length < 66) return null;
      return MOT(r, 0);
    } catch { return null; }
  };

  await souffler();
  const symbole = await lireTexte('symbol()');
  if (symbole === null) manques.push('symbol');
  await souffler();
  const nom = await lireTexte('name()');
  if (nom === null) manques.push('name');

  await souffler();
  const dec = await lireNombre('decimals()');
  if (dec === null) manques.push('decimals');
  await souffler();
  const supply = await lireNombre('totalSupply()');
  if (supply === null) manques.push('totalSupply');
  await souffler();
  const cap = await lireNombre('supplyCap()');
  if (cap === null) manques.push('supplyCap');

  /* ⛔ TROIS ETATS, PAS DEUX. « scelle », « pas scelle » et « on ne sait pas » sont trois phrases
   * differentes a l ecran, et la troisieme ne doit jamais se dire comme la deuxieme : annoncer
   * qu un block peut encore etre emis alors qu on n a pas su lire serait une accusation. */
  const mintFerme = (supply === null || cap === null) ? null : supply === cap;

  return { adr: jeton, estB20, code, symbole, nom,
    decimales: dec === null ? null : Number(dec), supply, cap, mintFerme, manques };
}

/** Une supply lisible par un humain, sans jamais supposer les decimales. */
export function supplyLisible(supply, decimales) {
  if (supply === null || supply === undefined || decimales === null || decimales === undefined) return null;
  const base = 10n ** BigInt(decimales);
  const entier = supply / base;
  return entier.toLocaleString('en-US');
}
