/* multipool.js — LE ROUTEUR MULTI-POOLS : de N IMPORTE QUEL actif vers N IMPORTE QUEL autre,
 * en UNE transaction, avec le frais du dev pris UNE SEULE FOIS.
 *
 * ⭐ DEMANDE DE RAKSHA (2026-10-01) : « build ce multipool swap entre all Tokenized stocks,
 *   memestocks (own Blocks) and paired all b20 ». Decision de frais (23:25, definitive) : 0,09 % NET vers a6cf
 *   (900 sur une base 1e6 = 9 bps : PAY_PORTION du routeur compte en bips, base 1e4),
 *   pris EXACTEMENT UNE FOIS par swap, en ETH / USDC / l action ou le B20 apparie — JAMAIS en
 *   token de block. Pas de remise au swapper.
 *
 * ⭐⭐ LA DECOUVERTE QUI REND « UNE TRANSACTION » POSSIBLE (mesuree, 2026-10-01) :
 *   l Universal Router d AERODROME `0xC5b6786D7B64767D775877b0B6A319AD946B11B5` (source :
 *   velodrome-finance/universal-router, deployment-addresses/base.json, parametres
 *   script/deployParameters/DeployBase.s.sol) porte DANS LE MEME `execute` :
 *     · V4_SWAP (0x10) sur le PoolManager Uniswap V4 `0x4985…2b2b` — donc nos pools HOOKEES (V8) ;
 *     · V3_SWAP_EXACT_IN (0x00) avec un drapeau `isUni` : Uniswap V3 (TOSHI, cbBTC) OU Slipstream
 *       (les actions tokenisees), les TROIS factories CL selectionnees par des bits du `poolParam` ;
 *     · TRANSFER_FROM (0x07) par approbation ERC-20 ORDINAIRE (essai `transferFrom` avant Permit2) ;
 *     · PAY_PORTION (0x06), SWEEP (0x04), WRAP_ETH (0x0b), UNWRAP_WETH (0x0c).
 *   ⇒ Le mur « deux mondes, deux factories, un lot atomique » de `pont-de-liquidite.js` n est PAS
 *     un mur de la chaine : c etait un mur de NOTRE routeur (celui d Uniswap, qui ne connait pas
 *     Slipstream). Ce module ne le contourne pas, il change de routeur.
 *   ⛔ CE N EST PROUVE QUE PAR LE BANC SUR FORK (`banc-multipool-fork.mjs`) : le bytecode deploye
 *     pourrait differer du depot source. Rien ne s affiche avant ce banc vert.
 *
 * ⛔ CE MODULE NE SIGNE RIEN ET N ENVOIE RIEN. Les fonctions pures (graphe, chemins, frais,
 *   calldata) ne lisent rien ; `coterChemin` lit par un `rpc` INJECTE. Un refus se dit avec sa
 *   raison ; un « pas lu » n est jamais un « pas de route ».
 */
import { mot, motSigne, motAdr, dyn, selecteur, paramsSwapExactInSingle, SANS_MINHOP, encodeQuote } from './pool.js';

/* ══ ADRESSES (Base 8453) — chacune VERIFIEE sur le fork (factory()/code), voir le rapport ══ */
export const ADRESSES = Object.freeze({
  ROUTEUR: '0xc5b6786d7b64767d775877b0b6a319ad946b11b5',      /* Aerodrome Universal Router */
  POOL_MANAGER: '0x498581ff718922c3f8e6a244956af099b2652b2b',
  STATE_VIEW: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
  QUOTEUR_V4: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
  QUOTEUR_V3: '0x3d4e44eb1374240ce5f1b871ab261cd16335b76a',     /* factory() = 0x33128a8f… */
  FACTORY_V3: '0x33128a8fc17869897dce68ed026d694621f6fdfd',
  QUOTEUR_CL3: '0x514c8b5f54112481e28028f1166bd78501089259',    /* factory() = 0xf8f2eb49… */
  FACTORY_CL3: '0xf8f2eb4940cfe7d13603dddd87f123820fc061ef',
  QUOTEUR_CL2: '0x254cf9e1e6e233aa1ac962cb9b05b2cfeaae15b0',    /* factory() = 0x5e7bb104… */
  FACTORY_CL2: '0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a',
  WETH: '0x4200000000000000000000000000000000000006',
  ETH: '0x0000000000000000000000000000000000000000',
  USDC: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  OUSD: '0xb2000000000000000000002feb517dfec7415344',
  CBBTC: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
  FEE_WALLET: '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4',
});

/** Les trois lieux qu on sait construire. ⛔ Tout autre `venue` est ignore ET nomme. */
export const VENUES = Object.freeze(['uniswap-v4', 'uniswap-v3', 'aerodrome-cl']);
export const SAUTS_MAX = 4;

/* ══ LE FRAIS ═══════════════════════════════════════════════════════════════════════════════
 * ⛔⛔ 0,09 % NET, UNE FOIS — decision DEFINITIVE de Raksha 2026-10-01 23:25 : « 900 sur une base 1e6 ».
 *   Le routeur (PAY_PORTION) compte en bips (base 1e4) : 900 / 1e6 = 9 / 1e4 EXACTEMENT, donc
 *   floor(m x 9 / 1e4) == floor(m x 900 / 1e6) pour tout m (verifie a l import ci-dessous et dans le test). Pas de remise.
 *   ⛔ Le taux est un PARAMETRE de `planifier` (defaut 9n) pour que le split V9 ne demande pas
 *     de toucher l assembleur : `partsFrais` est une LISTE de destinataires, aujourd hui un seul. */
export const FRAIS_BPS = 9n;
export const BASE_BPS = 10000n;
export const FRAIS_PPM = 900n;
export const BASE_PPM = 1000000n;
if (FRAIS_BPS * BASE_PPM !== FRAIS_PPM * BASE_BPS) throw new Error('0,09 % : 9 / 1e4 doit egaler 900 / 1e6');
export const PARTS_FRAIS = Object.freeze([Object.freeze({ qui: ADRESSES.FEE_WALLET, bps: FRAIS_BPS })]);
/** Le seul autre taux a6cf admis : 7 bps = 700 / 1e6, SEULEMENT dans le split du block (parts-bloc.js, drapeau ON). */
export const BPS_A6CF_SPLIT_BLOC = 7n;

/* ══ UN SEUL FRAIS PAR JAMBE (fondateur 2026-10-02 11:06, recommandation Zero 1) ══════════════════════
 * « Celui qui possede la jambe facture, UNE fois. » Une jambe V4 sur un hook TB QUI PRELEVE LUI-MEME le frais
 *   a6cf dans la devise (V8, V9, ...) est DEJA facturee par le hook : le routeur n y ajoute
 *   AUCUN PAY_PORTION ni part exacte. Sans cela : 0,09 % (hook) + 0,09 % (routeur) = 0,18 % sur la meme jambe.
 * ⛔⛔ ET L INVERSE (crosscheck Zero 1 2026-10-02, corrige ici) : une jambe SANS hook facturant est la jambe DU
 *   ROUTEUR — elle paie le frais du routeur, une fois, meme si une AUTRE jambe de la route est hookee. f0b4e91 coupait
 *   le frais routeur de TOUTE la route des qu une jambe etait hookee : AAPLc -> NVDAc (sans hook) -> block (hook TB)
 *   ne payait rien sur AAPLc -> NVDAc (fuite a frais nul). Regle :
 *     · toutes les jambes hookees        => 0 PAY_PORTION (chaque hook facture la sienne) ;
 *     · au moins une jambe du routeur     => EXACTEMENT 1 PAY_PORTION de 9 bps vers a6cf, pris a un noeud d une jambe
 *       du routeur (son entree ou sa sortie), jamais en block ; aucune part en plus (le split createur d un block
 *       appartient au hook de la jambe block) ;
 *     · aucune jambe hookee               => inchange (1 PAY_PORTION, parts possibles).
 *   Plusieurs jambes du routeur sur une route paient UN frais routeur (la regle du 2026-10-01 23:25 : une fois par
 *   swap pour ce que le routeur porte) — inchange pour les routes sans hook.
 * ⛔ Liste FERMEE, en minuscules. V8 = le hook en production (feeWallet() = a6cf). Les autres hooks TB facturants
 *   (V9...) sont passes par l appelant (`hooksFacturants`) le jour de leur adresse — jamais devines. (Le berceau 24 h
 *   est ABANDONNE, fondateur 2026-10-02 13:39 : il n est PAS dans cette liste.) */
export const HOOK_V8 = '0x5926abdabf5d0006ee960a8270f3e124e5a764cc';
export const HOOKS_FACTURANTS = Object.freeze([HOOK_V8]);
export function ensembleHooksFacturants(extra = []) {
  return new Set([...HOOKS_FACTURANTS, ...(extra || []).map((h) => bas(h))].filter((h) => ADR.test(h)));
}
/** La jambe `s` est-elle facturee par son hook ? (V4 seulement : V3 / Slipstream n ont pas nos hooks) */
export function jambeFactureeParHook(s, hooks = ensembleHooksFacturants()) {
  return !!(s && s.e && s.e.venue === 'uniswap-v4' && s.e.cle && hooks.has(bas(s.e.cle.hooks)));
}
/** au moins UNE jambe facturee par son hook */
export function routeFactureeParHook(chemin, hooks = ensembleHooksFacturants()) {
  return Array.isArray(chemin) && chemin.some((s) => jambeFactureeParHook(s, hooks));
}
/** TOUTES les jambes facturees par leur hook : le routeur n a aucune jambe a lui, donc aucun frais */
export function routeEntierementFactureeParHook(chemin, hooks = ensembleHooksFacturants()) {
  return Array.isArray(chemin) && chemin.length > 0 && chemin.every((s) => jambeFactureeParHook(s, hooks));
}
/** les indices de NOEUDS qui touchent une jambe du ROUTEUR (sans hook facturant) : la ou le routeur facture SA jambe */
export function noeudsJambesRouteur(chemin, hooks = ensembleHooksFacturants()) {
  const s = new Set();
  (Array.isArray(chemin) ? chemin : []).forEach((x, i) => { if (!jambeFactureeParHook(x, hooks)) { s.add(i); s.add(i + 1); } });
  return s;
}
/** Garde AVANT envoi — « UNE FOIS PAR SWAP » (Phil, 2026-10-02) : au moins UNE jambe hookee facturante => 0 PAY_PORTION
 *  et 0 part (le hook a deja paye a6cf) ; route sans hook => EXACTEMENT 1 PAY_PORTION. (Avant : route mixte => 1.) */
export function unFraisParJambe(tx, chemin, hooks = ensembleHooksFacturants()) {
  const n = (tx && tx.commandes ? tx.commandes : []).filter((c) => c === CMD.PAY_PORTION).length;
  const parts = (tx && tx.commandes ? tx.commandes : []).filter((c) => c === CMD.TRANSFER).length;
  if (routeFactureeParHook(chemin, hooks)) return n === 0 && parts === 0;
  return n === 1;
}

/** Constantes du routeur (ActionConstants / Constants du depot source). */
export const CONTRACT_BALANCE = 1n << 255n;
export const OPEN_DELTA = 0n;
export const MSG_SENDER = '0x0000000000000000000000000000000000000001';
export const ADDRESS_THIS = '0x0000000000000000000000000000000000000002';
/** Bits de selection de factory CL dans le `poolParam` (Constants.sol du depot source). */
export const CL_FLAG = Object.freeze({ 1: 0, 2: 0x100000, 3: 0x080000 });
export const CMD = Object.freeze({ V3_SWAP_EXACT_IN: '00', SWEEP: '04', TRANSFER: '05', PAY_PORTION: '06',
  TRANSFER_FROM: '07', WRAP_ETH: '0b', UNWRAP_WETH: '0c', V4_SWAP: '10' });
export const ACT = Object.freeze({ SWAP_EXACT_IN_SINGLE: '06', SETTLE: '0b', TAKE: '0e' });

const bas = (a) => String(a || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
export const estAdresse = (a) => ADR.test(bas(a));
/** ETH natif et WETH sont UN noeud du graphe : on passe de l un a l autre par WRAP/UNWRAP. */
export const noeud = (a) => (bas(a) === ADRESSES.WETH ? ADRESSES.ETH : bas(a));

/**
 * LES DEVISES DANS LESQUELLES a6cf PEUT ETRE PAYE — et leur PREFERENCE.
 * ⛔⛔ LISTE FERMEE, PASSEE PAR L APPELANT : ETH/WETH, USDC, puis les actions tokenisees et les B20
 *   « devise » (OUSD, cbBTC) que l appelant a VERIFIES. Un block n y entre JAMAIS, meme liquide :
 *   c est la regle de Raksha, et elle CONTREDIT `fraisDevisesOk` de app.html (qui admet des blocks
 *   depuis le 2026-09-26) — voir le rapport.
 * Rang : 0 = ETH, 1 = USDC, 2 = le reste admis. Plus petit = prefere (le plus liquide pour a6cf).
 */
export function rangFrais(adr, admises) {
  const a = noeud(adr);
  if (a === ADRESSES.ETH) return 0;
  if (a === ADRESSES.USDC) return 1;
  if (admises instanceof Set && admises.has(a)) return 2;
  return null;
}

/**
 * Actions tokenisees vues comme DEVISE DE COTATION dans /api/trending (2026-10-01) mais absentes du
 * registre ACTIONS_COINBASE de paires.js. ⛔ Adresses copiees du trending, symboles du trending :
 * a confirmer par Claude avant deploiement (voir le rapport). cbZEC, Basecat, BLUECHIP ne sont PAS ici :
 * ce ne sont pas des actions, et la regle n admet qu « ETH, USDC, l action ou le B20 apparie ».
 */
export const ACTIONS_HORS_REGISTRE = Object.freeze([
  ['PYPLc', '0xb200000000000000000000450ad3abe5d4846c6e'], ['MRVLc', '0xb200000000000000000000ec3c4c7395cc609813'],
  ['RDDTc', '0xb20000000000000000000066242d4067724cb7a1'], ['LLYc', '0xb200000000000000000000f1a0f91e34892e4718'],
  ['GMEc', '0xb2000000000000000000007790ed6e48e06ed935'],
]);
/**
 * L ENSEMBLE DES DEVISES DE FRAIS ADMISES (hors ETH et USDC, implicites) : les actions du registre,
 * les actions hors registre ci-dessus, et OUSD (le B20 devise). `blocks` (adresses) est RETIRE en
 * dernier : si une adresse est a la fois listee et block, elle n est pas admise.
 */
export function devisesFraisAdmises(actionsRegistre = [], { blocks = [] } = {}) {
  const s = new Set([...actionsRegistre.map((x) => bas(x.adr || x)), ...ACTIONS_HORS_REGISTRE.map(([, x]) => x), ADRESSES.OUSD]);
  for (const b of blocks) s.delete(bas(b));
  return s;
}

/* ══ LE GRAPHE ══════════════════════════════════════════════════════════════════════════════ */

/**
 * Une arete = UNE pool MESUREE.
 *   uniswap-v4  : { cle: { currency0, currency1, fee, tickSpacing, hooks } }
 *   uniswap-v3  : { pool, fee, token0, token1 }
 *   aerodrome-cl: { pool, tickSpacing, factory: 2|3, token0, token1 }
 * ⛔ Une arete sans ses parametres de construction est REFUSEE : une route qu on ne sait pas
 *   assembler n est pas une route.
 */
/* ⛔⛔ POOLS PIEGES (mesure 2026-10-02, graphe au bloc 52047000) : 23 pools V4 SANS hook portent un frais
 *   LP STATIQUE de 48 % a 89 % (ex. ETH/CC, ETH/BUCK, ETH/BLUEPILL a fee 871435 = 87,1 %). Le premier banc
 *   complet les a EMPRUNTEES (S0/S1 CC et BUCK, S2 BLUEPILL) : le frais d interface etait juste au wei,
 *   mais l utilisateur perdait ~87 % a chaque traversee. Une arete dont le frais LP depasse
 *   FRAIS_LP_MAX (10 % = 100 000 pips) n est PLUS une arete. Le frais dynamique V4 (0x800000) reste
 *   admis : c est le hook qui le fixe et le DEVIS le voit. Nos pools TB a 5 % (50 000) restent admises. */
export const FRAIS_LP_MAX = 100000;
export const FRAIS_DYNAMIQUE_V4 = 0x800000;
export function fraisLpAdmis(e) {
  const f = Number(e && (e.venue === 'uniswap-v4' ? e.cle && e.cle.fee : e.fee));
  if (e && e.venue === 'aerodrome-cl') return true; /* Slipstream : frais lu par le pool, pas dans la cle */
  return Number.isInteger(f) && (f === FRAIS_DYNAMIQUE_V4 || (f >= 0 && f <= FRAIS_LP_MAX));
}
export function areteValide(e) {
  if (!e || !VENUES.includes(e.venue)) return false;
  if (!fraisLpAdmis(e)) return false;
  if (e.venue === 'uniswap-v4') {
    const k = e.cle;
    return !!k && estAdresse(k.currency0) && estAdresse(k.currency1) && Number.isInteger(Number(k.fee))
      && Number.isInteger(Number(k.tickSpacing)) && estAdresse(k.hooks);
  }
  if (e.venue === 'uniswap-v3') return estAdresse(e.token0) && estAdresse(e.token1) && Number.isInteger(Number(e.fee));
  return estAdresse(e.token0) && estAdresse(e.token1) && Number.isInteger(Number(e.tickSpacing))
    && (e.factory === 2 || e.factory === 3);
}
export function boutsArete(e) {
  if (e.venue === 'uniswap-v4') return [noeud(e.cle.currency0), noeud(e.cle.currency1)];
  return [noeud(e.token0), noeud(e.token1)];
}

/**
 * TOUS LES CHEMINS SIMPLES de `de` a `vers`, au plus `sautsMax` sauts.
 * ⛔ Pas de « plus court » ici : le plus court n est pas le meilleur prix. On ENUMERE, on cote,
 *   on garde le meilleur. La borne `max` evite l explosion ; les chemins sont tries d abord par
 *   nombre de sauts puis par la liquidite-goulot si l arete la porte (`e.liqUsd`).
 */
export function cheminsCandidats(aretes, de, vers, { sautsMax = 3, max = 12 } = {}) {
  const A = noeud(de), B = noeud(vers);
  if (!estAdresse(A) || !estAdresse(B) || A === B) return [];
  const voisins = new Map();
  for (const e of (aretes || []).filter(areteValide)) {
    const [x, y] = boutsArete(e);
    if (x === y) continue;
    for (const [p, q] of [[x, y], [y, x]]) {
      if (!voisins.has(p)) voisins.set(p, []);
      voisins.get(p).push({ vers: q, e });
    }
  }
  const out = [];
  const pile = [{ n: A, sauts: [], vus: new Set([A]) }];
  while (pile.length) {
    const { n, sauts, vus } = pile.pop();
    for (const v of (voisins.get(n) || [])) {
      if (vus.has(v.vers)) continue;
      const suite = [...sauts, { de: n, vers: v.vers, e: v.e }];
      if (v.vers === B) { out.push(suite); continue; }
      if (suite.length < sautsMax) pile.push({ n: v.vers, sauts: suite, vus: new Set([...vus, v.vers]) });
    }
  }
  const goulot = (c) => Math.min(...c.map((s) => (Number.isFinite(s.e.liqUsd) ? s.e.liqUsd : 0)));
  out.sort((a, b) => (goulot(b) - goulot(a)) || (a.length - b.length));
  return out.slice(0, max);
}

/**
 * OU PRENDRE LE FRAIS SUR CE CHEMIN ? — l indice du NOEUD (0 = entree, n = sortie).
 * ⛔⛔ UNE FOIS. On choisit le noeud de MEILLEUR rang (ETH > USDC > admis) ; a rang egal, le PLUS
 *   TOT (un frais pris a l entree est exact sans aucun prix). Aucun noeud admis => REFUSE : on ne
 *   prend jamais le frais dans un block, et on ne fait pas non plus un swap gratuit en silence.
 */
export function placerFrais(chemin, admises, { candidats = null } = {}) {
  if (!Array.isArray(chemin) || !chemin.length) return { etat: 'REFUSE', pourquoi: 'no path' };
  const noeuds = [chemin[0].de, ...chemin.map((s) => s.vers)];
  let meilleur = null;
  noeuds.forEach((n, i) => {
    /* route mixte : seuls les noeuds d une jambe du ROUTEUR (`candidats`) peuvent porter SON frais */
    if (candidats instanceof Set && !candidats.has(i)) return;
    const r = rangFrais(n, admises);
    if (r === null) return;
    if (!meilleur || r < meilleur.rang) meilleur = { indice: i, rang: r, devise: noeud(n) };
  });
  if (!meilleur) {
    if (candidats instanceof Set) {
      return { etat: 'REFUSE', pourquoi: 'no node of the router legs of this path is ETH, USDC or an admitted stock/B20 — '
        + 'the router leg would go unpaid or be paid in a block token, both refused' };
    }
    return { etat: 'REFUSE', pourquoi: 'no node of this path is ETH, USDC or an admitted stock/B20 — '
      + 'the fee would have to be taken in a block token, which is refused' };
  }
  return { etat: 'OK', ...meilleur };
}

/** Le frais sur un montant : tronque vers le bas (comme PAY_PORTION du routeur). */
export function fraisSur(montant, bps = FRAIS_BPS) { return (BigInt(montant) * BigInt(bps)) / BASE_BPS; }

/* ══ LES DEVIS (lecture seule, rpc injecte) ════════════════════════════════════════════════ */

/** Nomme un revert de quoter. Le V4Quoter enveloppe la vraie erreur dans UnexpectedRevertBytes(bytes)
 *  (0x6190b2b0) ; on deballe et on nomme les selecteurs connus (calcules par keccak, verifies). */
const ERREURS_CONNUES = Object.freeze({
  '7a5ed734': ['NotEnoughLiquidity(bytes32)', 'la pool n a pas assez de liquidite dans ce sens pour ce montant', true],
  '486aa307': ['PoolNotInitialized()', 'pool non initialisee', true],
  '7c9c6e8f': ['PriceLimitAlreadyExceeded(uint160,uint160)', 'limite de prix deja depassee', false],
  '90bfb865': ['WrappedError(address,bytes4,bytes,bytes)', 'le HOOK a reverte', false],
});
export function nommerRevert(err) {
  const msg = String((err && err.message) || err);
  const hex = (msg.match(/0x6190b2b0[0-9a-f]*|custom error 0x6190b2b0: ([0-9a-f]+)/i) || [])[0] || '';
  const corps = hex.replace(/^custom error 0x6190b2b0: /i, '').replace(/^0x6190b2b0/i, '');
  if (corps.length >= 136) {
    const sel = corps.slice(128, 136).toLowerCase();
    const k = ERREURS_CONNUES[sel];
    if (k) return { texte: k[0] + ' — ' + k[1] + (sel === '7a5ed734' ? ' (pool ' + '0x' + corps.slice(136, 200) + ')' : ''), liquidite: k[2], selecteur: sel };
    return { texte: 'UnexpectedRevertBytes, erreur interne 0x' + sel + ' (non nommee)', liquidite: false, selecteur: sel };
  }
  return { texte: msg.slice(0, 160), liquidite: false, selecteur: null };
}

const selQ3 = selecteur('quoteExactInputSingle((address,address,uint256,uint24,uint160))');
const selQcl = selecteur('quoteExactInputSingle((address,address,uint256,int24,uint160))');

/** Le calldata de devis d UN saut, selon son lieu. ⛔ Le sens est DERIVE des adresses. */
export function devisSaut(s, montant) {
  const e = s.e;
  if (e.venue === 'uniswap-v4') {
    const entree = s.de === ADRESSES.ETH && bas(e.cle.currency0) !== ADRESSES.ETH && bas(e.cle.currency1) !== ADRESSES.ETH
      ? ADRESSES.WETH : s.de;
    const zeroForOne = noeud(e.cle.currency0) === noeud(entree);
    return { to: ADRESSES.QUOTEUR_V4, data: encodeQuote({ cle: e.cle, zeroForOne, montant }) };
  }
  const tIn = s.de === ADRESSES.ETH ? ADRESSES.WETH : s.de;
  const tOut = s.vers === ADRESSES.ETH ? ADRESSES.WETH : s.vers;
  if (e.venue === 'uniswap-v3') {
    return { to: ADRESSES.QUOTEUR_V3, data: '0x' + selQ3 + motAdr(tIn) + motAdr(tOut) + mot(montant) + mot(e.fee) + mot(0) };
  }
  return { to: e.factory === 2 ? ADRESSES.QUOTEUR_CL2 : ADRESSES.QUOTEUR_CL3,
    data: '0x' + selQcl + motAdr(tIn) + motAdr(tOut) + mot(montant) + motSigne(e.tickSpacing) + mot(0) };
}

/**
 * COTE UN CHEMIN, saut par saut, AVEC le frais retenu au noeud choisi.
 * Rend `montants[i]` = ce que le routeur detient au noeud i APRES frais eventuel, et `sortie`.
 * ⛔ Une lecture ratee rend NON_MESURE (jamais 0) ; un devis nul rend REFUSE ; un quoter qui dit
 *   NotEnoughLiquidity / PoolNotInitialized rend SANS_LIQUIDITE (mesure : la pool ne tient pas ce montant).
 */
export async function coterChemin({ rpc, chemin, montant, admises, bps = FRAIS_BPS, placement = null, hooksFacturants = [] }) {
  /* « UNE FOIS PAR SWAP » (Phil, 2026-10-02) : une jambe hookee facturante suffit — son frais est au DEVIS V4 et
   * a6cf est deja paye ; le routeur ne retient rien. Route sans hook : le routeur retient son frais une fois. */
  const hooks = ensembleHooksFacturants(hooksFacturants);
  const parHook = routeFactureeParHook(chemin, hooks);
  const mixte = false;
  const pl = parHook ? { etat: 'OK', indice: -1, devise: null }
    : (placement || placerFrais(chemin, admises, mixte ? { candidats: noeudsJambesRouteur(chemin, hooks) } : {}));
  if (pl.etat !== 'OK') return { etat: 'REFUSE', pourquoi: pl.pourquoi };
  let courant = BigInt(montant);
  if (courant <= 0n) return { etat: 'REFUSE', pourquoi: 'amount must be above zero' };
  const avantFrais = [];
  let frais = 0n;
  for (let i = 0; i <= chemin.length; i += 1) {
    avantFrais.push(courant);
    if (i === pl.indice) { frais = fraisSur(courant, bps); courant -= frais; }
    if (i === chemin.length) break;
    const q = devisSaut(chemin[i], courant);
    let r;
    try { r = await rpc('eth_call', [{ to: q.to, data: q.data }, 'latest']); }
    catch (err) { const n = nommerRevert(err); return { etat: n.liquidite ? 'SANS_LIQUIDITE' : 'NON_MESURE', saut: i + 1, pourquoi: 'hop ' + (i + 1) + ' quote failed: ' + n.texte }; }
    let out;
    try { out = BigInt('0x' + String(r).slice(2, 66)); } catch (_) { out = 0n; }
    if (out <= 0n) return { etat: 'REFUSE', saut: i + 1, pourquoi: 'hop ' + (i + 1) + ' returns nothing' };
    courant = out;
  }
  return { etat: 'OK', sortie: courant, frais, fraisIndice: parHook ? null : pl.indice, fraisDevise: pl.devise, avantFrais, fraisParHook: parHook, routeMixte: mixte };
}

/* ══ L ASSEMBLAGE : UNE TRANSACTION ════════════════════════════════════════════════════════ */

/** Decoupe en segments contigus de MEME execution (V4 / V3-uni / CL-fact) ET coupe au noeud du frais. */
export function segments(chemin, fraisIndice) {
  const cle = (s) => (s.e.venue === 'uniswap-v4' ? 'v4' : s.e.venue === 'uniswap-v3' ? 'uni' : 'cl' + s.e.factory);
  const out = [];
  chemin.forEach((s, i) => {
    const d = out[out.length - 1];
    const coupe = i === fraisIndice; /* le frais se prend ENTRE deux segments */
    if (d && d.type === cle(s) && !coupe) d.sauts.push(s);
    else out.push({ type: cle(s), sauts: [s], debut: i });
  });
  return out;
}

const cleV4Inline = (k) => motAdr(k.currency0) + motAdr(k.currency1) + mot(k.fee) + motSigne(k.tickSpacing) + motAdr(k.hooks);

/** Le `path` V3 / Slipstream : token(20) | poolParam(3) | token(20)… */
export function cheminV3(sauts) {
  let hex = '';
  sauts.forEach((s, i) => {
    const tIn = s.de === ADRESSES.ETH ? ADRESSES.WETH : s.de;
    const tOut = s.vers === ADRESSES.ETH ? ADRESSES.WETH : s.vers;
    const param = s.e.venue === 'uniswap-v3' ? Number(s.e.fee)
      : ((Number(s.e.tickSpacing) & 0x7ffff) | CL_FLAG[s.e.factory]);
    if (i === 0) hex += tIn.slice(2);
    hex += param.toString(16).padStart(6, '0') + tOut.slice(2);
  });
  return hex;
}

function entreeV4(sauts, montantConnu = null) {
  /* ⛔⛔ ORDRE (fondateur 2026-10-02 11:06, Zero 1) : quand le montant d entree du segment est CONNU EXACTEMENT a
   *   l assemblage (premier segment de la route), on REGLE APRES LE SWAP :
   *     SWAP(1er saut, montant exact), SWAP(sauts suivants, OPEN_DELTA), SETTLE(entree, OPEN_DELTA = la dette, payeur=routeur),
   *     TAKE(sortie, ADDRESS_THIS, OPEN_DELTA).
   *   C est l ordre du periphery Uniswap : le PoolManager recoit l entree APRES que le hook a vu la vente, ce qu exige
   *   le block du berceau 24 h (mode strict : toute entree vers le PoolManager doit payer une vente de NOS pools DEJA vue).
   *   Avant : SETTLE(CONTRACT_BALANCE) d abord => le block arrivait au PoolManager avant la vente => PasNotrePool.
   * Segment suivant (entree = sortie d un segment V3/CL, montant inconnu a l assemblage) : l ancien ordre
   *   SETTLE(entree, CONTRACT_BALANCE) puis SWAP en OPEN_DELTA — un block du berceau en ENTREE d un tel segment
   *   echoue ferme pendant 24 h (aucune perte), voir le rapport.
   * ⛔ La forme de struct est SANS minHop : c est celle du fork velodrome (IV4Router.ExactInputSingleParams, 5 champs). */
  const premier = sauts[0], dernier = sauts[sauts.length - 1];
  const devIn = (s) => (s.de === ADRESSES.ETH && ![bas(s.e.cle.currency0), bas(s.e.cle.currency1)].includes(ADRESSES.ETH) ? ADRESSES.WETH : s.de);
  const devOut = (s) => (s.vers === ADRESSES.ETH && ![bas(s.e.cle.currency0), bas(s.e.cle.currency1)].includes(ADRESSES.ETH) ? ADRESSES.WETH : s.vers);
  const apres = typeof montantConnu === 'bigint' && montantConnu > 0n;
  const codes = [], params = [];
  if (!apres) { codes.push(ACT.SETTLE); params.push(motAdr(devIn(premier)) + mot(CONTRACT_BALANCE) + mot(0)); }
  sauts.forEach((s, k) => {
    const zf = noeud(s.e.cle.currency0) === noeud(devIn(s));
    codes.push(ACT.SWAP_EXACT_IN_SINGLE);
    params.push(paramsSwapExactInSingle({ cle: s.e.cle, zeroForOne: zf, montant: apres && k === 0 ? montantConnu : OPEN_DELTA, sortieMin: 0n, forme: SANS_MINHOP }));
  });
  if (apres) { codes.push(ACT.SETTLE); params.push(motAdr(devIn(premier)) + mot(OPEN_DELTA) + mot(0)); }
  codes.push(ACT.TAKE);
  params.push(motAdr(devOut(dernier)) + motAdr(ADDRESS_THIS) + mot(OPEN_DELTA));
  const elements = params.map((p) => dyn(p));
  let c = BigInt(32 * elements.length);
  const offs = elements.map((e) => { const o = mot(c); c += BigInt(e.length / 2); return o; });
  const tableau = mot(elements.length) + offs.join('') + elements.join('');
  const actions = dyn(codes.join(''));
  return { hex: mot(0x40) + mot(0x40 + actions.length / 2) + actions + tableau, reglementApres: apres, codes,
    entreeNative: devIn(premier) === ADRESSES.ETH, sortieNative: devOut(dernier) === ADRESSES.ETH };
}

/**
 * `execute(bytes commands, bytes[] inputs, uint256 deadline)` — l enveloppe ABI, SANS aucune regle.
 * ⛔ Exportee pour les TEMOINS NEGATIFS du banc (une route sans PAY_PORTION, une route avec deux) :
 *   l application n appelle QUE `construireRoute`, qui porte les verrous.
 */
export function assemblerExecute(cmds, ins, deadline) {
  const commands = dyn(cmds.join(''));
  const blocs = ins.map((h) => dyn(h));
  let c = BigInt(blocs.length) * 32n;
  const offs = blocs.map((b) => { const o = mot(c); c += BigInt(b.length / 2); return o; });
  const offCommands = 0x60n, offInputs = offCommands + BigInt(commands.length / 2);
  return '0x' + selecteur('execute(bytes,bytes[],uint256)') + mot(offCommands) + mot(offInputs) + mot(deadline)
    + commands + mot(blocs.length) + offs.join('') + blocs.join('');
}

/**
 * LE CALLDATA D UNE ROUTE COMPLETE, POUR L UNIVERSAL ROUTER D AERODROME.
 *
 * Le modele est UNIFORME : le routeur detient tout. On tire l entree (TRANSFER_FROM, ou msg.value),
 * chaque segment consomme CONTRACT_BALANCE et rend au routeur, le frais est un PAY_PORTION AU
 * NOEUD CHOISI, et un SWEEP final livre au destinataire avec SON minimum.
 * ⛔⛔ LE FRAIS EST UN SEUL PAY_PORTION vers a6cf, dans la devise du noeud — jamais deux.
 * ⛔ `partsFrais` : liste [{ qui, bps }] — aujourd hui UNE part (a6cf, 9). Le V9 ajoutera des parts
 *   SANS changer la forme. Toutes les parts sont prises au MEME noeud, donc la regle « une fois »
 *   tient par construction.
 */
export function construireRoute({ chemin, montant, minSortie, destinataire, deadline, fraisIndice,
  partsFrais = PARTS_FRAIS, admises, partsExactes = [], bpsA6cf = FRAIS_BPS, hooksFacturants = [] } = {}) {
  if (!Array.isArray(chemin) || !chemin.length || chemin.length > SAUTS_MAX) return { etat: 'REFUSE', pourquoi: 'path must have 1..' + SAUTS_MAX + ' hops' };
  if (!chemin.every((s) => areteValide(s.e))) return { etat: 'REFUSE', pourquoi: 'a hop has no buildable pool' };
  if (!estAdresse(destinataire) || [ADDRESS_THIS, MSG_SENDER, ADRESSES.ROUTEUR].includes(bas(destinataire))) return { etat: 'REFUSE', pourquoi: 'a real recipient address is required' };
  if (bas(destinataire) === ADRESSES.FEE_WALLET) return { etat: 'REFUSE', pourquoi: 'the fee wallet cannot be the swapper: the fee would be paid back to itself' };
  const m = BigInt(montant), mn = BigInt(minSortie);
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'amount must be above zero' };
  if (mn <= 0n) return { etat: 'REFUSE', pourquoi: 'a positive minimum on the final output is required' };
  for (let i = 1; i < chemin.length; i += 1) if (chemin[i].de !== chemin[i - 1].vers) return { etat: 'REFUSE', pourquoi: 'the path does not chain at hop ' + (i + 1) };
  const noeuds = [chemin[0].de, ...chemin.map((s) => s.vers)];
  /* ⛔⛔ « UNE FOIS PAR SWAP » (Phil, 2026-10-02) : des qu UNE jambe est facturee par son hook, le routeur ne preleve
   *   RIEN (ni PAY_PORTION ni part exacte) ; une part demandee en plus est REFUSEE (double frais). Route sans hook =>
   *   le frais routeur, UNE fois. (Avant : route mixte => frais routeur sur une jambe du routeur.) */
  const hooks = ensembleHooksFacturants(hooksFacturants);
  const unHook = routeFactureeParHook(chemin, hooks);
  const parHook = unHook;
  if (unHook) {
    if ((Array.isArray(partsExactes) && partsExactes.length) || BigInt(bpsA6cf) !== FRAIS_BPS
      || (Array.isArray(partsFrais) && partsFrais !== PARTS_FRAIS && partsFrais.some((p) => bas(p.qui) !== ADRESSES.FEE_WALLET || BigInt(p.bps) !== FRAIS_BPS))
      || (Array.isArray(partsFrais) && partsFrais.length > 1)) {
      return { etat: 'REFUSE', pourquoi: 'refused: a leg of this path is on a TB hook that charges the fee itself — a router fee or share on top would charge the same leg twice (0.18 %)' };
    }
    if (parHook) return assembler({ chemin, m, mn, destinataire, deadline, noeuds, parts: [], exactes: [], fraisIndice: -1, devFrais: null, parHook });
  }
  if (!Number.isInteger(fraisIndice) || fraisIndice < 0 || fraisIndice > chemin.length) return { etat: 'REFUSE', pourquoi: 'fee node index out of the path' };
  if (unHook && !noeudsJambesRouteur(chemin, hooks).has(fraisIndice)) {
    return { etat: 'REFUSE', pourquoi: 'refused: on a path mixing TB-hooked legs and router legs, the router fee must be taken at a node of a router leg (each leg pays exactly once)' };
  }
  /* ⛔⛔ LE VERROU : la devise du frais DOIT etre admise. On le reverifie ICI, meme si `placerFrais`
   *   l a deja fait : un appelant qui passerait un indice a la main ne doit pas pouvoir payer a6cf
   *   en block. C est le temoin negatif n°1 du banc. */
  const devFrais = noeuds[fraisIndice];
  if (rangFrais(devFrais, admises) === null) return { etat: 'REFUSE', pourquoi: 'refused: the fee would be taken in ' + devFrais + ', which is not ETH, USDC or an admitted stock/B20' };
  const parts = Array.isArray(partsFrais) ? partsFrais : [];
  if (!parts.length || parts.some((p) => !estAdresse(p.qui) || BigInt(p.bps) <= 0n || BigInt(p.bps) > 100n)) return { etat: 'REFUSE', pourquoi: 'fee parts must be 1..100 bps to whole addresses' };
  if (bas(parts[0].qui) !== ADRESSES.FEE_WALLET) return { etat: 'REFUSE', pourquoi: 'the first fee part must go to the fee wallet' };
  /* ⛔⛔ PARTS EXACTES (parts-bloc.js, 2026-10-02, drapeau OFF) : des TRANSFER de montants FIXES, AU MEME noeud,
   *   APRES le PAY_PORTION de a6cf. Avec des parts exactes, a6cf est la SEULE part en bips, au taux EXIGE `bpsA6cf` :
   *   9 (le 0,09 % en vigueur, par defaut) ou 7 (le split du block de Raksha 10:21 : 0,07 % + 0,03 % createur/collateral,
   *   drapeau ON seulement — et alors les parts exactes sont OBLIGATOIRES). Tout autre taux est refuse ; aucune part
   *   exacte vers a6cf, vers le routeur ou en double. */
  const exactes = Array.isArray(partsExactes) ? partsExactes : [];
  const bA = BigInt(bpsA6cf);
  if (![FRAIS_BPS, BPS_A6CF_SPLIT_BLOC].includes(bA)) return { etat: 'REFUSE', pourquoi: 'refused: the fee wallet rate must be ' + FRAIS_BPS + ' bps (live) or ' + BPS_A6CF_SPLIT_BLOC + ' bps (block split)' };
  if (bA !== FRAIS_BPS && !exactes.length) return { etat: 'REFUSE', pourquoi: 'refused: the ' + bA + ' bps rate only exists with the creator/collateral share' };
  if (exactes.length || bA !== FRAIS_BPS) {
    if (parts.length !== 1 || BigInt(parts[0].bps) !== bA) return { etat: 'REFUSE', pourquoi: 'refused: shares may not cut into the fee wallet part (it must stay the only bips part, at exactly ' + bA + ' bps)' };
    const vus = new Set();
    for (const p of exactes) {
      const q = bas(p && p.qui);
      if (!estAdresse(q) || [ADDRESS_THIS, MSG_SENDER, ADRESSES.ROUTEUR, ADRESSES.FEE_WALLET].includes(q)) return { etat: 'REFUSE', pourquoi: 'refused: an extra share must go to a real address that is not the fee wallet or the router' };
      if (vus.has(q)) return { etat: 'REFUSE', pourquoi: 'refused: the same extra-share recipient twice (double charge)' };
      vus.add(q);
      if (typeof p.montant !== 'bigint' || p.montant <= 0n) return { etat: 'REFUSE', pourquoi: 'refused: an extra share must be a positive bigint amount' };
    }
  }
  return assembler({ chemin, m, mn, destinataire, deadline, noeuds, parts, exactes, fraisIndice, devFrais, parHook: false });
}

/** L assemblage, APRES tous les verrous de `construireRoute` (interne : n est pas exporte). */
function assembler({ chemin, m, mn, destinataire, deadline, noeuds, parts, exactes, fraisIndice, devFrais, parHook }) {
  const cmds = [], ins = [];
  const ajoute = (c, h) => { cmds.push(c); ins.push(h); };
  const entreeEth = chemin[0].de === ADRESSES.ETH;
  /* tenue courante du routeur : 'eth' (natif) ou 'weth' ou un ERC-20 */
  let tenue = entreeEth ? 'eth' : 'erc20';
  if (!entreeEth) ajoute(CMD.TRANSFER_FROM, motAdr(chemin[0].de) + motAdr(ADDRESS_THIS) + mot(m));
  const prendreFrais = (dev) => {
    /* ⛔ « en ETH » veut dire de l ETH NATIF : si le routeur tient du WETH a ce noeud, on le
     *   DEBALLE d abord (UNWRAP vers le routeur, minimum 0). Le segment suivant le remballera s il
     *   en a besoin. a6cf ne recoit jamais de WETH. */
    if (dev === ADRESSES.ETH && tenue === 'weth') { ajoute(CMD.UNWRAP_WETH, motAdr(ADDRESS_THIS) + mot(0)); tenue = 'eth'; }
    const jeton = dev === ADRESSES.ETH ? ADRESSES.ETH : dev;
    for (const p of parts) ajoute(CMD.PAY_PORTION, motAdr(jeton) + motAdr(p.qui) + mot(p.bps));
    for (const p of exactes) ajoute(CMD.TRANSFER, motAdr(jeton) + motAdr(p.qui) + mot(p.montant));
  };
  const segs = segments(chemin, fraisIndice);
  const segIdx = new Map(segs.map((s, k) => [s.debut, k]));
  for (let i = 0; i <= chemin.length; i += 1) {
    if (i === fraisIndice) prendreFrais(noeuds[i]);
    if (i === chemin.length) break;
    if (!segIdx.has(i)) continue;
    const sg = segs[segIdx.get(i)];
    if (sg.type === 'v4') {
      /* premier segment : le routeur tient EXACTEMENT m (TRANSFER_FROM m / msg.value m), moins les parts prises au
       *   noeud 0 (PAY_PORTION = floor(solde x bps / 1e4), dans l ordre, puis les TRANSFER exacts) => reglement APRES le swap */
      let connu = null;
      if (sg.debut === 0) {
        connu = m;
        if (fraisIndice === 0) {
          for (const p of parts) connu -= (connu * BigInt(p.bps)) / BASE_BPS;
          for (const p of exactes) connu -= p.montant;
        }
        if (connu <= 0n) return { etat: 'REFUSE', pourquoi: 'nothing left to swap after the fee' };
      }
      const v = entreeV4(sg.sauts, connu);
      if (v.entreeNative && tenue === 'weth') ajoute(CMD.UNWRAP_WETH, motAdr(ADDRESS_THIS) + mot(0));
      if (!v.entreeNative && tenue === 'eth' && noeud(sg.sauts[0].de) === ADRESSES.ETH) ajoute(CMD.WRAP_ETH, motAdr(ADDRESS_THIS) + mot(CONTRACT_BALANCE));
      ajoute(CMD.V4_SWAP, v.hex);
      tenue = v.sortieNative ? 'eth' : (sg.sauts[sg.sauts.length - 1].vers === ADRESSES.ETH ? 'weth' : 'erc20');
    } else {
      if (tenue === 'eth') ajoute(CMD.WRAP_ETH, motAdr(ADDRESS_THIS) + mot(CONTRACT_BALANCE));
      const path = cheminV3(sg.sauts);
      const isUni = sg.type === 'uni';
      ajoute(CMD.V3_SWAP_EXACT_IN, motAdr(ADDRESS_THIS) + mot(CONTRACT_BALANCE) + mot(0) + mot(0xc0)
        + mot(0) + mot(isUni ? 1 : 0) + dyn(path));
      tenue = sg.sauts[sg.sauts.length - 1].vers === ADRESSES.ETH ? 'weth' : 'erc20';
    }
  }
  const sortie = noeuds[noeuds.length - 1];
  /* ⛔ LE SEUL MINIMUM QUI PROTEGE L ACHETEUR : celui du SWEEP final, APRES le frais. */
  if (sortie === ADRESSES.ETH && tenue === 'weth') ajoute(CMD.UNWRAP_WETH, motAdr(destinataire) + mot(mn));
  else ajoute(CMD.SWEEP, motAdr(sortie === ADRESSES.ETH ? ADRESSES.ETH : sortie) + motAdr(destinataire) + mot(mn));

  const data = assemblerExecute(cmds, ins, deadline);
  return {
    etat: 'PRET', to: ADRESSES.ROUTEUR, data, value: entreeEth ? '0x' + m.toString(16) : '0x0',
    /* ⛔ L APPROBATION : une seule, ERC-20 ordinaire, du MONTANT EXACT (TRANSFER_FROM essaie
     *   `transferFrom` avant Permit2). Aucune pour l ETH natif. */
    approbation: entreeEth ? null : { jeton: chemin[0].de, spender: ADRESSES.ROUTEUR, montant: m },
    commandes: cmds, entrees: ins, fraisDevise: devFrais === null ? null : noeud(devFrais), fraisIndice: parHook ? null : fraisIndice,
    segments: segs.map((s) => s.type), fraisParHook: parHook,
    signatures: entreeEth ? 1 : 2,
  };
}

/**
 * LE PLAN COMPLET : candidats -> devis -> meilleur -> calldata.
 * ⛔ Le meilleur est celui qui rend LE PLUS au destinataire APRES notre frais. Les chemins non
 *   cotables sont DITS (NON_MESURE / REFUSE), pas jetes.
 */
export async function planifier({ rpc, aretes, de, vers, montant, destinataire, admises, toleranceBps = 100n,
  deadline, sautsMax = 3, max = 12, bps = FRAIS_BPS, hooksFacturants = [] }) {
  const cands = cheminsCandidats(aretes, de, vers, { sautsMax, max });
  if (!cands.length) return { etat: 'SANS_ROUTE', pourquoi: 'no measured pool path of ' + sautsMax + ' hops or fewer', essais: [] };
  const essais = [];
  for (const ch of cands) {
    const q = await coterChemin({ rpc, chemin: ch, montant, admises, bps, hooksFacturants });
    essais.push({ chemin: ch, ...q });
  }
  const bons = essais.filter((x) => x.etat === 'OK').sort((a, b) => (b.sortie > a.sortie ? 1 : b.sortie < a.sortie ? -1 : 0));
  if (!bons.length) {
    const tous = essais.every((x) => x.etat === 'NON_MESURE');
    return { etat: tous ? 'NON_MESURE' : 'REFUSE', pourquoi: essais.map((x) => x.pourquoi).filter(Boolean)[0] || 'no candidate quoted', essais };
  }
  const best = bons[0];
  const tol = BigInt(toleranceBps);
  const minSortie = (best.sortie * (10000n - tol)) / 10000n;
  const tx = construireRoute({ chemin: best.chemin, montant, minSortie, destinataire, deadline, fraisIndice: best.fraisIndice, admises, hooksFacturants,
    partsFrais: best.fraisParHook ? PARTS_FRAIS : [{ qui: ADRESSES.FEE_WALLET, bps }] });
  return { etat: tx.etat === 'PRET' ? 'PRET' : 'REFUSE', meilleur: best, minSortie, tx, essais, pourquoi: tx.pourquoi || null };
}

/** Une ligne lisible d un chemin (pour l ecran et le rapport). */
export function decrireChemin(chemin, symboles = {}) {
  const nom = (a) => symboles[noeud(a)] || (noeud(a) === ADRESSES.ETH ? 'ETH' : a.slice(0, 8));
  const lieu = (e) => (e.venue === 'uniswap-v4' ? 'v4' + (bas(e.cle.hooks) !== ADRESSES.ETH ? '+hook' : '') + ':' + e.cle.fee
    : e.venue === 'uniswap-v3' ? 'v3:' + e.fee : 'cl' + e.factory + ':' + e.tickSpacing);
  return [nom(chemin[0].de), ...chemin.map((s) => '-[' + lieu(s.e) + ']-> ' + nom(s.vers))].join(' ');
}
