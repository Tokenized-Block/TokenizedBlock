// marche.js — la VIE d un block : prix x supply, lue sur les pools, jamais devinee.
// ================================================================================================
// ⛔⛔ CE MODULE EXISTE POUR QU IL N Y AIT QU UNE SEULE LECTURE DE MARCHE. Le meme calcul vivait
//    dans `index.html` sous forme de fonction locale ; en ecrivant un second ecran, la tentation
//    etait de le recopier. C est le motif le plus cher de ce depot — le helper correct existe et
//    l appelant s en fabrique une copie plus faible — et il a deja frappe huit fois ici. Deux
//    lectures de prix qui divergent afficheraient deux capitalisations differentes pour LE MEME
//    block sur deux ecrans, sans que rien ne plante.
//
// ⛔ LA LISTE DES CLES EST NOMMEE, ET C EST CE QUI REND « PAS DE PRIX » HONNETE. Mesure du
//    2026-09-09 : deux des huit blocks les plus actifs cotaient sur `fee 10000` pendant que l app
//    ne lisait que `fee 0` et leur affichait « jamais cote » — une affirmation FAUSSE sur le jeton
//    de quelqu un d autre. On lit plusieurs cles, et l absence ne veut jamais dire que « absente
//    parmi CELLES-CI ».
//
// ⚠️ CE QUE CE MODULE NE COUVRE PAS, ecrit ici plutot que decouvert plus tard : les paires contre
//    autre chose que l ETH natif, les hooks non nuls, et tout ce qui n est pas Uniswap v4. Un jeton
//    cote sur une v2, une v3 ou un autre protocole restera invisible — et c est pourquoi le refus
//    s appelle NON_TROUVEE et jamais « sans valeur ».
import { cleDePool, poolId, selecteur, prixDepuisSqrt } from './pool.js';
import { capitalisation } from './pointsdevie.js';
import { TBLOCK } from './tokenomics.js';

const ETH_NATIF = '0x0000000000000000000000000000000000000000';

/** La cle TBLOCK/block lue en second (format du lancement de l app). */
export const CLE_TBLOCK = { fee: 0, tickSpacing: 200 };

/**
 * La vie d un block apparie a TBLOCK, en ETH. `null` = pas de pool TBLOCK/block (on laisse le NON_TROUVEE d origine).
 * ⛔ Rend NON_LUE (pas null) si la pool TBLOCK/block existe mais qu un prix ou la supply manque.
 */
async function vieEnTblock({ rpc, stateView, jeton }) {
  const lire = rpc;
  const sel = selecteur('getSlot0(bytes32)');
  const cle = cleDePool(TBLOCK, jeton, CLE_TBLOCK);
  let s;
  try { s = BigInt(String(await lire('eth_call', [{ to: stateView, data: '0x' + sel + poolId(cle).slice(2) }, 'latest'])).slice(0, 66)); }
  catch { return { etat: 'NON_LUE', vie: null, devise: null, via: null, pourquoi: 'the TBLOCK pair could not be read' }; }
  if (s === 0n) return null;
  const nonLue = (pourquoi) => ({ etat: 'NON_LUE', vie: null, devise: null, via: 'TBLOCK · 0 %', pourquoi });
  let dec, supply, sE;
  try {
    dec = Number(BigInt(String(await lire('eth_call', [{ to: jeton, data: '0x' + selecteur('decimals()') }, 'latest'])).slice(0, 66)));
    supply = BigInt(String(await lire('eth_call', [{ to: jeton, data: '0x' + selecteur('totalSupply()') }, 'latest'])).slice(0, 66));
    const cleE = cleDePool(ETH_NATIF, TBLOCK, CLE_TBLOCK);
    sE = BigInt(String(await lire('eth_call', [{ to: stateView, data: '0x' + sel + poolId(cleE).slice(2) }, 'latest'])).slice(0, 66));
  } catch { return nonLue('decimals, supply or the TBLOCK/ETH price unread'); }
  if (sE === 0n) return nonLue('TBLOCK has no ETH price to convert with');
  const prixEnTblock = prixDepuisSqrt({ sqrtPriceX96: s, decDevise: 18, decBlock: dec, deviseEst0: String(cle.currency0).toLowerCase() === TBLOCK.toLowerCase() });
  const prixTblockEnEth = prixDepuisSqrt({ sqrtPriceX96: sE, decDevise: 18, decBlock: 18, deviseEst0: true });
  if (!(prixEnTblock > 0) || !(prixTblockEnEth > 0)) return nonLue('a price could not be computed');
  const c = capitalisation({ supply, decimales: dec, prix: prixEnTblock * prixTblockEnEth, devise: 'ETH' });
  if (c.valeur === null || c.valeur === undefined) return nonLue(c.pourquoi || 'market cap not computable');
  return { etat: 'LUE', vie: c.valeur, devise: 'ETH', via: 'TBLOCK · 0 %', pourquoi: null, cle, sqrtPriceX96: s, decimales: dec, paire: 'TBLOCK',
    prixTblockEnEth };
}

/** Les cles de pool lues, dans l ordre. ⛔ NOTRE Launch d abord : un block lance ici doit etre lu
 *  sur SA pool plutot que sur une pool tierce ouverte au meme jeton. */
export const CLES_MARCHE = [
  { nom: 'ETH · 0,5 % (notre Launch)', fee: 5000, tickSpacing: 200 },
  { nom: 'ETH · 0 % (lancements d avant le 2026-09-09)', fee: 0, tickSpacing: 200 },
  { nom: 'ETH · 3 % (OpenLaunch)', fee: 30000, tickSpacing: 200 },
  { nom: 'ETH · 1 %', fee: 10000, tickSpacing: 200 },
  { nom: 'ETH · 0,3 %', fee: 3000, tickSpacing: 60 },
  { nom: 'ETH · 0,05 %', fee: 500, tickSpacing: 10 },
];

/**
 * La vie d un block, en devise NOMMEE.
 *
 * @param {object} o
 * @param {(m:string,p:any[])=>Promise<any>} o.rpc        lecteur JSON-RPC
 * @param {string} o.stateView                            adresse du StateView de la chaine courante
 * @param {string} o.jeton                                le block
 * @returns {Promise<{etat:string, vie:number|null, devise:string|null, via:string|null, pourquoi:string|null}>}
 *
 * ⛔ TROIS ETATS, JAMAIS DEUX. « lue », « aucune pool parmi celles essayees » et « pas pu lire »
 *    appellent trois phrases differentes a l ecran. Les fondre en un seul `null` ferait dire
 *    « pas de prix » a une panne de reseau — et une panne chez nous se lirait comme un fait sur le
 *    jeton de quelqu un d autre.
 */
export async function vieDuBlock({ rpc, stateView, jeton }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jeton || ''))) {
    return { etat: 'REFUSEE', vie: null, devise: null, via: null, pourquoi: 'not an address' };
  }
  if (!stateView) {
    return { etat: 'NON_LUE', vie: null, devise: null, via: null, pourquoi: 'no StateView on this network' };
  }
  const selSlot0 = selecteur('getSlot0(bytes32)');

  let lues = 0, ratees = 0, sqrt = 0n, via = null, cleTrouvee = null;
  for (const cfg of CLES_MARCHE) {
    const cle = cleDePool(ETH_NATIF, jeton, { fee: cfg.fee, tickSpacing: cfg.tickSpacing });
    let s0;
    try {
      s0 = await rpc('eth_call', [{ to: stateView, data: '0x' + selSlot0 + poolId(cle).slice(2) }, 'latest']);
    } catch {
      /* ⛔ UNE LECTURE RATEE N EST PAS UNE POOL ABSENTE : on ne la compte pas comme un « non ». */
      ratees++;
      continue;
    }
    if (!s0 || s0 === '0x' || String(s0).length < 66) continue;
    lues++;
    const v = BigInt(String(s0).slice(0, 66));
    if (v !== 0n) { sqrt = v; via = cfg.nom; cleTrouvee = cle; break; }
  }

  if (!lues) {
    return { etat: 'NON_LUE', vie: null, devise: null, via: null,
      pourquoi: 'no readable slot0 on any of the ' + CLES_MARCHE.length + ' keys' };
  }
  /* ⛔⛔ BUG TROUVE EN VERIFIANT TBLOCK (2026-09-13) : le marche TBLOCK/ETH est en ligne (cle frais 0), mais sa lecture
   * a ete refusee par le noeud sature pendant que les AUTRES cles repondaient « pas de pool » — et la fonction concluait
   * NON_TROUVEE : « this block has no market yet » sur un block qui en a un. La lecture ratee n etait pas comptee comme
   * un « non »… mais le « non » des autres cles la recouvrait. Si UNE cle n a pas ete lue, on ne peut pas dire « aucune ». */
  /* ⛔⛔ BLOCKS APPARIES A TBLOCK (Phil, 2026-09-13 : « creer des blocks avec TBLOCK »). Si aucune pool ETH n existe, on lit
   * la pool TBLOCK/block (frais 0, espacement 200, sans hook — le format du lancement de l app), et la capitalisation est
   * CONVERTIE EN ETH par le prix de la pool TBLOCK/ETH, lu lui aussi. Un des deux prix illisible = NON_LUE, jamais un chiffre. */
  if (sqrt === 0n && ratees === 0 && String(jeton).toLowerCase() !== TBLOCK.toLowerCase()) {
    const vt = await vieEnTblock({ rpc, stateView, jeton });
    if (vt) return vt;
  }
  if (sqrt === 0n && ratees > 0) {
    return { etat: 'NON_LUE', vie: null, devise: null, via: null,
      pourquoi: ratees + ' of the ' + CLES_MARCHE.length + ' market keys could not be read — the market may exist on one of them' };
  }
  if (sqrt === 0n) {
    return { etat: 'NON_TROUVEE', vie: null, devise: null, via: null,
      pourquoi: 'no initialized pool among the ' + CLES_MARCHE.length + ' keys read ('
        + CLES_MARCHE.map((c) => c.nom).join(', ') + ') — NOT a claim that this block has no price' };
  }

  /* ⛔ LES DECIMALES SE LISENT, ELLES NE SE SUPPOSENT PAS. Supposer 18 a deja produit des
   * capitalisations fausses d un facteur mille sur un jeton a 6 decimales. */
  let dec = null, supply = null;
  try {
    dec = Number(BigInt(String(await rpc('eth_call', [{ to: jeton, data: '0x' + selecteur('decimals()') }, 'latest'])).slice(0, 66)));
    supply = BigInt(String(await rpc('eth_call', [{ to: jeton, data: '0x' + selecteur('totalSupply()') }, 'latest'])).slice(0, 66));
  } catch { /* signale juste dessous */ }
  if (!Number.isFinite(dec) || supply === null) {
    return { etat: 'NON_LUE', vie: null, devise: null, via,
      pourquoi: 'decimals or supply unread — we never assume 18 decimals' };
  }

  const deviseEst0 = String(cleTrouvee.currency0).toLowerCase() === ETH_NATIF;
  const prix = prixDepuisSqrt({ sqrtPriceX96: sqrt, decDevise: 18, decBlock: dec, deviseEst0 });
  const c = capitalisation({ supply, decimales: dec, prix, devise: 'ETH' });
  if (c.valeur === null || c.valeur === undefined) {
    return { etat: 'NON_LUE', vie: null, devise: null, via, pourquoi: c.pourquoi || 'market cap not computable' };
  }
  /* ⛔ LA CLE TROUVEE EST RENDUE (2026-09-13) : l achat / vente dans l app doit trader SUR LA POOL LUE ICI, pas
   * sur une cle recalculee ailleurs — une deuxieme recherche de marche finirait par diverger de celle-ci. */
  return { etat: 'LUE', vie: c.valeur, devise: c.devise, via, pourquoi: null, cle: cleTrouvee, sqrtPriceX96: sqrt, decimales: dec };
}
