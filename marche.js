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
//    autre chose que l ETH natif / TBLOCK, les hooks AUTRES que HOOK_PREVU, et tout ce qui n est pas
//    Uniswap v4. Un jeton cote sur une v2, une v3 ou un autre protocole restera invisible — et c est
//    pourquoi le refus s appelle NON_TROUVEE et jamais « sans valeur ».
// ✅ 2026-09-15 P0: App Launch attaches HOOK_PREVU — try that key first (ETH + TBLOCK), then legacy zero-hook.
import { cleDePool, poolId, selecteur, prixDepuisSqrt } from './pool.js';
import { capitalisation } from './pointsdevie.js';
import { TBLOCK, HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8 } from './tokenomics.js';
import { pairesProposees } from './paires.js';

const ETH_NATIF = '0x0000000000000000000000000000000000000000';

/** La cle TBLOCK/block lue en second (format du lancement de l app). */
export const CLE_TBLOCK = { fee: 0, tickSpacing: 200 };


/** StateView getLiquidity(bytes32) — pool depth sensor (Uniswap L, not ETH). null = unread, never invent 0. */
async function lireLiquiditePool(rpc, stateView, cle) {
  if (!stateView || !cle) return null;
  try {
    const raw = await rpc('eth_call', [{
      to: stateView,
      data: '0x' + selecteur('getLiquidity(bytes32)') + poolId(cle).slice(2),
    }, 'latest']);
    if (!raw || raw === '0x' || String(raw).length < 66) return null;
    return BigInt(String(raw).slice(0, 66));
  } catch {
    return null;
  }
}


/**
 * La vie d un block apparie a TBLOCK, en ETH. `null` = pas de pool TBLOCK/block (on laisse le NON_TROUVEE d origine).
 * ⛔ Rend NON_LUE (pas null) si la pool TBLOCK/block existe mais qu un prix ou la supply manque.
 */
async function vieEnTblock({ rpc, stateView, jeton }) {
  const lire = rpc;
  const sel = selecteur('getSlot0(bytes32)');
  /* ⛔ P0 2026-09-15: Launch may open TBLOCK/block with HOOK_PREVU — try hooked key first, then legacy zero. */
  /* tip 20260923-wallet-intent-market: Instant Birth opens HOOK_V8 — try current hooks before legacy. */
  const variants = [
    { hooks: HOOK_V8, via: 'TBLOCK · 0 % · TbFeeHook v8' },
    { hooks: HOOK_V7, via: 'TBLOCK · 0 % · TbFeeHook v7' },
    { hooks: HOOK_V6, via: 'TBLOCK · 0 % · TbFeeHook v6' },
    { hooks: HOOK_V5, via: 'TBLOCK · 0 % · TbFeeHook v5' },
    { hooks: HOOK_V4, via: 'TBLOCK · 0 % · TbFeeHook v4' },
    { hooks: HOOK_V3, via: 'TBLOCK · 0 % · TbFeeHook v3' },
    { hooks: HOOK_PREVU, via: 'TBLOCK · 0 % · TbFeeHook' },
    { hooks: HOOK_V2, via: 'TBLOCK · 0 % · TbFeeHook v2' },
    { hooks: null, via: 'TBLOCK · 0 %' },
  ];
  let cle = null, s = 0n, via = null, ratee = false;
  for (const v of variants) {
    const c = cleDePool(TBLOCK, jeton, v.hooks ? { ...CLE_TBLOCK, hooks: v.hooks } : CLE_TBLOCK);
    let raw;
    try { raw = await lire('eth_call', [{ to: stateView, data: '0x' + sel + poolId(c).slice(2) }, 'latest']); }
    catch { ratee = true; continue; }
    if (!raw || raw === '0x' || String(raw).length < 66) { ratee = true; continue; }
    const sv = BigInt(String(raw).slice(0, 66));
    if (sv !== 0n) { cle = c; s = sv; via = v.via; break; }
  }
  if (!cle) {
    if (ratee) return { etat: 'NON_LUE', vie: null, devise: null, via: null, pourquoi: 'the TBLOCK pair could not be read' };
    return null;
  }
  const nonLue = (pourquoi) => ({ etat: 'NON_LUE', vie: null, devise: null, via, pourquoi });
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
  const liquidite = await lireLiquiditePool(lire, stateView, cle);
  return { etat: 'LUE', vie: c.valeur, devise: 'ETH', via, pourquoi: null, cle, sqrtPriceX96: s, decimales: dec, paire: 'TBLOCK',
    prixTblockEnEth, liquidite };
}

/** Les cles de pool lues, dans l ordre. ⛔ NOTRE Launch d abord : un block lance ici doit etre lu
 *  sur SA pool plutot que sur une pool tierce ouverte au meme jeton. */
export const CLES_MARCHE = [
  /* tip 20260923-wallet-intent-market: HOOK_V8 first (Instant Birth / Give birth · V8), then older TB hooks, then legacy. */
  /* ⛔ NOTRE Launch (lancer-pool.js FEE_POOL=0) — hooked when TbFeeHook DEPLOYE, then legacy zero-hook. */
  { nom: 'ETH · 0 % · TbFeeHook v8 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V8 },
  { nom: 'ETH · 0 % · TbFeeHook v7 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V7 },
  { nom: 'ETH · 0 % · TbFeeHook v6 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V6 },
  { nom: 'ETH · 0 % · TbFeeHook v5 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V5 },
  { nom: 'ETH · 0 % · TbFeeHook v4 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V4 },
  { nom: 'ETH · 0 % · TbFeeHook v3 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V3 },
  { nom: 'ETH · 0 % · TbFeeHook v2 (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_V2 },
  { nom: 'ETH · 0 % · TbFeeHook (Launch)', fee: 0, tickSpacing: 200, hooks: HOOK_PREVU },
  { nom: 'ETH · 0 % (legacy Launch)', fee: 0, tickSpacing: 200 },
  { nom: 'ETH · 0,5 % (legacy screen)', fee: 5000, tickSpacing: 200 },
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
/**
 * ⛔⛔ LES CLES EXACTES PASSENT AVANT LES CANDIDATES (2026-09-17). Mesure : la pool de bGYND est
 *    fee 3000 / tickSpacing 60 / hooks 0xee0f… ; notre liste essayait bien 3000/60 mais TOUJOURS
 *    SANS HOOK — donc un autre poolId, donc « aucun marche ». Et on en avait conclu, a tort, que
 *    les pools des autres lanceurs refusaient notre routeur. Une cle LUE sur la chaine (evenement
 *    Initialize du PoolManager) est la verite ; les candidates ne sont plus qu un repli.
 */
/**
 * ⛔⛔ MARCHE CONTRE UNE DEVISE ERC-20 (hook V3, 2026-09-19). Les cles exactes lues sur la chaine etaient REASSEMBLEES contre
 *    l ETH (cleDePool(ETH_NATIF, …)) : une pool block/AAPLc etait cherchee a une cle qui n existe pas, et le block paraissait
 *    « sans marche » (mesure sur fork). Ici la cle est lue TELLE QUELLE si sa devise est dans la liste (USDC, cbBTC, actions),
 *    et la capitalisation est dite DANS CETTE DEVISE, decimales lues des deux cotes. Rien trouve = null (le reste decide).
 */
async function vieEnDevise({ rpc, stateView, jeton, clesExactes }) {
  const j = String(jeton).toLowerCase();
  const connues = new Map(pairesProposees(8453).filter((p) => p.type === 'STABLE' || p.type === 'MAJEUR' || p.type === 'ACTION')
    .map((p) => [p.adr.toLowerCase(), p.symbole]));
  for (const c of Array.isArray(clesExactes) ? clesExactes : []) {
    if (!c || !c.currency0 || !c.currency1) continue;
    const c0 = String(c.currency0).toLowerCase(), c1 = String(c.currency1).toLowerCase();
    if (c0 !== j && c1 !== j) continue;
    const devise = c0 === j ? c1 : c0;
    const sym = connues.get(devise);
    if (!sym) continue;
    const cle = { currency0: c.currency0, currency1: c.currency1, fee: Number(c.fee), tickSpacing: Number(c.tickSpacing), hooks: c.hooks };
    try {
      const s0 = await rpc('eth_call', [{ to: stateView, data: '0x' + selecteur('getSlot0(bytes32)') + poolId(cle).slice(2) }, 'latest']);
      if (!s0 || String(s0).length < 66) continue;
      const sqrt = BigInt(String(s0).slice(0, 66));
      if (sqrt === 0n) continue;
      const decB = Number(BigInt(String(await rpc('eth_call', [{ to: jeton, data: '0x' + selecteur('decimals()') }, 'latest'])).slice(0, 66)));
      const decD = Number(BigInt(String(await rpc('eth_call', [{ to: devise, data: '0x' + selecteur('decimals()') }, 'latest'])).slice(0, 66)));
      const supply = BigInt(String(await rpc('eth_call', [{ to: jeton, data: '0x' + selecteur('totalSupply()') }, 'latest'])).slice(0, 66));
      const prix = prixDepuisSqrt({ sqrtPriceX96: sqrt, decDevise: decD, decBlock: decB, deviseEst0: c0 === devise });
      const cap = capitalisation({ supply, decimales: decB, prix, devise: sym });
      if (cap.valeur === null) continue;
      return { etat: 'LUE', vie: cap.valeur, devise: sym, via: 'on-chain key · ' + sym, pourquoi: null, cle, sqrtPriceX96: sqrt,
        decimales: decB, paire: 'DEVISE', deviseAdr: devise, decDevise: decD };
    } catch { /* lecture ratee : on essaie la cle suivante */ }
  }
  return null;
}

export async function vieDuBlock({ rpc, stateView, jeton, clesExactes = [] }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(jeton || ''))) {
    return { etat: 'REFUSEE', vie: null, devise: null, via: null, pourquoi: 'not an address' };
  }
  if (!stateView) {
    return { etat: 'NON_LUE', vie: null, devise: null, via: null, pourquoi: 'no StateView on this network' };
  }
  const selSlot0 = selecteur('getSlot0(bytes32)');

  let lues = 0, ratees = 0, sqrt = 0n, via = null, cleTrouvee = null;
  const nulle = (h) => !h || /^0x0{40}$/i.test(String(h));
  const candidates = [
    ...(Array.isArray(clesExactes) ? clesExactes : [])
      .filter((c) => c && Number.isFinite(Number(c.fee)) && Number.isFinite(Number(c.tickSpacing)))
      .map((c) => ({ nom: 'on-chain key ' + (Number(c.fee) / 10000) + ' %', fee: Number(c.fee),
        tickSpacing: Number(c.tickSpacing), hooks: nulle(c.hooks) ? null : c.hooks })),
    ...CLES_MARCHE,
  ];
  for (const cfg of candidates) {
    const cle = cleDePool(ETH_NATIF, jeton, { fee: cfg.fee, tickSpacing: cfg.tickSpacing, ...(cfg.hooks ? { hooks: cfg.hooks } : {}) });
    let s0;
    try {
      s0 = await rpc('eth_call', [{ to: stateView, data: '0x' + selSlot0 + poolId(cle).slice(2) }, 'latest']);
    } catch {
      /* ⛔ UNE LECTURE RATEE N EST PAS UNE POOL ABSENTE : on ne la compte pas comme un « non ». */
      ratees++;
      continue;
    }
    /* ⛔⛔ VU EN DIRECT (2026-09-13, fil « Blocks talking ») : « TBLOCK: I am dormant now » — NON_TROUVEE sur un block dont
     *    le marche est en ligne. getSlot0 rend TOUJOURS quatre mots : une reponse vide ou courte est une lecture RATEE,
     *    pas une pool absente — ne pas la compter laissait le « zero » des autres cles conclure « aucun marche ». */
    if (!s0 || s0 === '0x' || String(s0).length < 66) { ratees++; continue; }
    lues++;
    const v = BigInt(String(s0).slice(0, 66));
    if (v !== 0n) { sqrt = v; via = cfg.nom; cleTrouvee = cle; break; }
  }

  if (!lues) {
    return { etat: 'NON_LUE', vie: null, devise: null, via: null,
      pourquoi: 'no readable slot0 on any of the ' + candidates.length + ' keys' };
  }
  /* ⛔⛔ BUG TROUVE EN VERIFIANT TBLOCK (2026-09-13) : le marche TBLOCK/ETH est en ligne (cle frais 0), mais sa lecture
   * a ete refusee par le noeud sature pendant que les AUTRES cles repondaient « pas de pool » — et la fonction concluait
   * NON_TROUVEE : « this block has no market yet » sur un block qui en a un. La lecture ratee n etait pas comptee comme
   * un « non »… mais le « non » des autres cles la recouvrait. Si UNE cle n a pas ete lue, on ne peut pas dire « aucune ». */
  /* ⛔⛔ BLOCKS APPARIES A TBLOCK (Phil, 2026-09-13 : « creer des blocks avec TBLOCK »). Si aucune pool ETH n existe, on lit
   * la pool TBLOCK/block (frais 0, espacement 200, HOOK_PREVU ou sans hook — format Launch), et la capitalisation est
   * CONVERTIE EN ETH par le prix de la pool TBLOCK/ETH, lu lui aussi. Un des deux prix illisible = NON_LUE, jamais un chiffre. */
  /* ⛔⛔ AVAIL 2026-09-15: try TBLOCK/block EVEN when some ETH keys rate-limited.
   *    Before: ratees>0 short-circuited to NON_LUE and never opened Buy/Sell for TBLOCK-launched blocks.
   *    Create+Launch default TBLOCK — skipping this path = false « unavailable ». */
  if (sqrt === 0n) {
    const vd = await vieEnDevise({ rpc, stateView, jeton, clesExactes });
    if (vd) return vd;
  }
  if (sqrt === 0n && String(jeton).toLowerCase() !== TBLOCK.toLowerCase()) {
    const vt = await vieEnTblock({ rpc, stateView, jeton });
    if (vt) return vt;
  }
  if (sqrt === 0n && ratees > 0) {
    return { etat: 'NON_LUE', vie: null, devise: null, via: null,
      pourquoi: ratees + ' of the ' + candidates.length + ' market keys could not be read — the market may exist on one of them' };
  }
  if (sqrt === 0n) {
    return { etat: 'NON_TROUVEE', vie: null, devise: null, via: null,
      pourquoi: 'no initialized pool among the ' + candidates.length + ' keys read ('
        + CLES_MARCHE.map((c) => c.nom).join(', ') + ', and TBLOCK · 0 %) — NOT a claim that this block has no price' };
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
  const liquidite = await lireLiquiditePool(rpc, stateView, cleTrouvee);
  return { etat: 'LUE', vie: c.valeur, devise: c.devise, via, pourquoi: null, cle: cleTrouvee, sqrtPriceX96: sqrt, decimales: dec, liquidite };
}
