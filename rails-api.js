/* rails-api.js — NOS RAILS, EXPOSES : (de, vers, montant, compte) -> les appels NON SIGNES que nos planificateurs construisent,
 * avec leurs gardes de frais. Pour les agents, les autres apps, le MCP. Servi par GET /api/rails/plan (serveur-web.js).
 *
 * ⛔⛔ CE MODULE NE SIGNE RIEN, N ENVOIE RIEN, NE DECIDE AUCUN FRAIS. Il CHOISIT le planificateur que l app appelle deja pour
 *   la meme paire (preparerEchange, la fiche) et rend sa reponse sous une forme unique. Aucune regle de route ni de frais
 *   n est recopiee ici : un jumeau de preparerEchange divergerait (motif deja paye deux fois dans ce depot).
 * ⛔ LE REVENU EST ON-CHAIN : l appel rendu paie le hook (ou le routeur) vers le wallet de frais QUAND le wallet de l agent
 *   le signe. L API elle-meme ne facture rien ; un peage x402 de l appel n existera qu une fois la cle CDP posee.
 * ⛔ CE QUE LE SERVEUR NE LIT PAS, IL NE L ADMET PAS (fail-closed par rapport a l app) :
 *   - `fraisDevisesOk` = USDC + les 12 actions a pool Aerodrome profonde MESUREE (table) ; l app, elle, lit prix + liquidite
 *     de toute devise proposee — le serveur n ajoute rien qu il n a pas mesure.
 *   - `prixUsdEntree` = null : le bareme degressif du multi-sauts applique son taux le plus haut, et le resume le dit.
 *   Le serveur peut donc REFUSER une route que l app accepte ; il ne peut pas en accepter une qu elle refuse.
 * Routes (le reste : refus nomme) :
 *   devise de cotation > BLOCK, BLOCK > devise de cotation   planEchange (le chemin par defaut de l app)
 *   USDC|OUSD > BLOCK cote en ETH ou USDC                    sautsDepuisChemin + planEchangeMultiSauts (v4, un segment)
 *   BLOCK > BLOCK                                            sautsBlocVersBloc + planEchangeMultiSauts
 *   BLOCK > ACTION (pool Aerodrome mesuree)                  cheminBlocVersAction + planFranchissement (lot atomique)
 *   ETH > ACTION, USDC > ACTION (pool Aerodrome mesuree)     planAchatEthAction, planAerodromeSegment
 *   ETH|USDC > ACTION, ACTION > USDC (pool v4 USDC LUE)       planEchange / sautsDepuisChemin + planEchangeMultiSauts (2026-10-03) */
import { planEchange, planEchangeMultiSauts, meilleureClePourMontant } from './echange.js';
import { planFranchissement } from './plan-franchissement.js';
import { planAerodromeSegment } from './plan-aerodrome-segment.js';
import { planAchatEthAction } from './echange-eth.js';
import { WETH_BASE } from './plan-eth-block.js';
import { sautsBlocVersBloc, cheminBlocVersAction } from './bloc-vers-bloc.js';
import { sautsDepuisChemin } from './sauts-depuis-chemin.js';
import { vieDuBlock, decimalesLues } from './marche.js';
import { lecteurBorne, enVolBorne, LECTURES_EN_VOL_MAX } from './lectures-en-vol.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { DEVISES_BASE, ACTIONS_COINBASE, proposableEnEchange } from './paires.js';
import { USDC_BASE, FEE_WALLET } from './frais-creation.js';
import { CLES_PRIX } from './prix-eth.js';
import { V4_ADRESSES } from './lancer-pool.js';
import { RE_B20 } from './pool-sans-hook.js';

export const ETH = '0x0000000000000000000000000000000000000000';
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (a) => String(a || '').toLowerCase();
const USDC = bas(USDC_BASE);
const OUSD = bas((DEVISES_BASE.find((d) => d.symbole === 'OUSD') || {}).adr);
const ACTIONS = new Map(ACTIONS_COINBASE.map((a) => [bas(a.adr), a.symbole]));
const DEVISES = new Map(DEVISES_BASE.map((d) => [bas(d.adr), d.symbole]));
/* ⛔⛔ Les devises qui s echangent entre elles ICI (route 6) : ETH et USDC, et SEULEMENT elles.
 *   MESURE (banc-devises-fork-20261004.mjs, fork de Base, 5 devises proposables du registre, 20 paires ordonnees) :
 *     depuis ETH ou USDC vers ETH, USDC, cbBTC, TOSHI, OUSD : 8/8 executees, 20 bps au wallet des frais ;
 *     depuis cbBTC, TOSHI ou OUSD : 12/12 REFUSEES par le planificateur (« Not tradable here yet » : le frais se prend dans la
 *     devise payee, et `fraisDevisesOk` n admet pas celles-la).
 *   Offrir USDC > TOSHI sans TOSHI > USDC serait vendre un ALLER SANS RETOUR : la personne acheterait ici ce qu elle ne peut
 *   pas revendre ici. On n ouvre donc que la paire qui marche dans les DEUX sens. Les autres attendent une regle de frais. */
const ECHANGEABLES = new Set(DEVISES_BASE.filter((d) => proposableEnEchange(d) && d.chaines.includes(8453) && (d.symbole === 'ETH' || d.symbole === 'USDC')).map((d) => bas(d.adr)));
const BORNE = 'unsigned calls built from the chain read now: your wallet signs them, in order; the minimums hold only at the '
  + 'price read now, and the chain can still refuse them later';

/** La nature d un jeton pour le choix de route. ⛔ Un B20 hors des registres est un « block » ; les planificateurs appliquent
 *  ensuite leurs propres regles (hooks, R4-R9) — ce classement ne les affaiblit jamais, il choisit seulement qui juge. */
export function natureJeton(a) {
  const x = bas(a);
  if (x === ETH) return 'ETH';
  if (x === USDC) return 'USDC';
  if (x === OUSD) return 'OUSD';
  if (ACTIONS.has(x)) return 'ACTION';
  if (DEVISES.has(x)) return 'DEVISE';
  if (RE_B20.test(x)) return 'BLOCK';
  return 'AUTRE';
}

/** BigInt -> chaine, en profondeur (JSON). */
export function versJson(v) {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(versJson);
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = versJson(x); return o; }
  return v;
}

/* ⛔ `value` en HEX, la forme d eth_sendTransaction : un 0n tombait sur « || '0x0' », un BigInt non nul sortait en decimal. */
const enHex = (v) => (typeof v === 'bigint' ? '0x' + v.toString(16) : (v || '0x0'));
const appel = (c) => ({ to: c.to, data: c.data, value: enHex(c.value), ...(c.role ? { role: c.role } : {}), ...(c.nom ? { nom: c.nom } : {}) });

/** Une reponse de planificateur -> la forme unique de l API. `aSigner` est l ordre exact : approbations, puis appels.
 *  ⛔ APPROBATIONS (planEchange, multi-sauts) : AUCUN swap n est rendu — il ne se simule qu une fois les autorisations
 *    posees. L agent signe les approbations, puis REDEMANDE le plan : c est le flux de l app (« relance »). */
export function normaliser(route, p, extra = {}) {
  const approbations = p && Array.isArray(p.etapes) ? p.etapes.map(appel) : [];
  const appels = p && p.tx ? [appel(p.tx)] : (p && Array.isArray(p.appels) ? p.appels.map(appel) : []);
  const etat = p ? p.etat : 'NON_MESURE';
  return versJson({
    ok: etat === 'PRET' || etat === 'APPROBATIONS',
    route, etat,
    suite: etat === 'APPROBATIONS' ? 'sign the approvals, then ask for this plan again to get the swap' : null,
    pourquoi: p ? (p.pourquoi || null) : 'no plan',
    aSigner: approbations.concat(appels),
    approbations, appels,
    atomique: !!(p && p.exigeAtomique),
    resume: (p && p.resume) || null,
    ...extra,
    borne: BORNE,
  });
}

const quoteDe = (cle, jeton) => {
  if (!cle) return null;
  const c0 = bas(cle.currency0), c1 = bas(cle.currency1), j = bas(jeton);
  return c0 === j ? c1 : (c1 === j ? c0 : null);
};

/**
 * @param {{ de:string, vers:string, montant:string|bigint, compte:string }} q  montant en unites brutes du jeton paye
 * @param {{ rpc:Function, clesDe?:(a:string)=>Promise<object[]>, chaine?:number, stateView?:string, maintenant?:number }} deps
 */
export async function planRail(q, deps) {
  const rpcRecu = deps && deps.rpc;
  /* ⛔ 2026-10-04 — UN PLAN N A JAMAIS PLUS DE `LECTURES_EN_VOL_MAX` LECTURES EN VOL, QUEL QUE SOIT LE BATISSEUR. Les lectures
   *   independantes partent maintenant ensemble (devis d une meme paire, decimales + supply, les deux marches de la route 5) ;
   *   ce lecteur est la seule borne commune : tout ce que le plan lit passe par lui, les appels en trop attendent leur tour.
   *   Il ne reessaie rien et ne garde rien (lectures-en-vol.js). Le lecteur recu n est plus appele directement ci-dessous. */
  const rpc = typeof rpcRecu === 'function' ? lecteurBorne(rpcRecu, LECTURES_EN_VOL_MAX) : rpcRecu;
  const clesDe = (deps && typeof deps.clesDe === 'function') ? deps.clesDe : (async () => []);
  const chaine = Number((deps && deps.chaine) || 8453);
  const stateView = (deps && deps.stateView) || (V4_ADRESSES[chaine] || {}).stateView;
  const maintenant = (deps && deps.maintenant) || Date.now();
  const lireAdr = (x) => (String(x || '').toUpperCase() === 'ETH' ? ETH : bas(x));
  const de = lireAdr(q && q.de), vers = lireAdr(q && q.vers), compte = bas(q && q.compte);
  let m;
  try { m = BigInt(String(q && q.montant)); } catch (_) { m = 0n; }
  if (typeof rpc !== 'function' || !stateView) return normaliser('?', { etat: 'NON_MESURE', pourquoi: 'no chain reader on this network' });
  if (!ADR.test(de) || !ADR.test(vers)) return normaliser('?', { etat: 'REFUSE', pourquoi: 'de and vers must be whole addresses (or ETH)' });
  if (!ADR.test(compte)) return normaliser('?', { etat: 'REFUSE', pourquoi: 'compte (the wallet that will sign) is required' });
  if (m <= 0n) return normaliser('?', { etat: 'REFUSE', pourquoi: 'montant must be a positive integer in raw units of the token paid' });
  if (de === vers) return normaliser('?', { etat: 'REFUSE', pourquoi: 'de and vers are the same token' });
  const nd = natureJeton(de), nv = natureJeton(vers), route = nd + '>' + nv;
  /* USDC + les 12 actions de la table MESUREE (pools Aerodrome profondes, >= 360 k$ d USDC lus le 2026-10-03) : un frais pris
   * dans l une d elles se revend. Toute autre devise reste refusee cote serveur (l app, elle, lit prix + liquidite). */
  const fraisDevisesOk = new Set([USDC, ...POOLS_ACTIONS_AERODROME.keys()]);
  /* une action du registre est cotee en devise (USDC) : sa cle exacte est lue D ABORD — 17 lectures de pools ETH inexistantes
   * en moins par plan (mesure du 2026-10-04, voir marche.js). Un block garde l ordre d avant. */
  const marcheDe = async (a) => vieDuBlock({ rpc, stateView, jeton: a, clesExactes: await clesDe(a), deviseDAbord: natureJeton(a) === 'ACTION' });
  const illisible = (mk) => ({ etat: mk && mk.etat === 'NON_TROUVEE' ? 'REFUSE' : 'NON_MESURE',
    pourquoi: 'the block market could not be read: ' + ((mk && mk.pourquoi) || 'no answer') });
  /* ⛔ LES DECIMALES SE LISENT (OUSD en a 6, pas 18) ; ETH natif seul est connu.
   *   2026-10-04 : lues UNE fois par jeton puis gardees (marche.js `decimalesLues` : seul fait immuable garde ; une lecture
   *   ratee leve et n est pas gardee). La meme demande part sur la chaine qu avant ; le refus hors bornes est inchange. */
  const decimalesDe = async (a) => {
    if (a === ETH) return 18;
    const d = await decimalesLues({ rpc, stateView, jeton: a });
    if (!Number.isInteger(d) || d < 0 || d > 36) throw new Error('decimals unread');
    return d;
  };
  /* ⛔ 2026-10-04 — DEUX MARCHES INDEPENDANTS SE LISENT ENSEMBLE (route 5 : l action payee ET ce qu elle achete).
   *   MESURE (fork) : LLYc > block lisait le marche de LLYc (4 lectures) PUIS celui du block (5), en file. Aucun ne depend de
   *   l autre. Les deux partent ensemble ; chaque issue est rendue a SA place, et l appelant les juge DANS L ORDRE D AVANT
   *   (A d abord) : une erreur de lecture de B ne remplace jamais un refus dit sur A.
   *   ⛔ Seul ecart : quand A est refuse, le marche de B a ete lu pour rien (des lectures en plus, la meme reponse). Reserve
   *   aux routes ou B est TOUJOURS lu quand A est bon — pas a la route 2, ou « vendre contre sa cotation » ne lit pas B. */
  const marchesDe = (...jetons) => enVolBorne(jetons, (a) => marcheDe(a), jetons.length);
  const valeurOuErreur = (issue) => { if (!issue.ok) throw issue.erreur; return issue.valeur; };
  /* le resolveur v4 de l app : la cle LUE du marche d abord, puis les cles de prix connues (jamais l une sans l autre) */
  const resolveurAvec = (...clesConnues) => async ({ de: d1, vers: v1, montant: mt }) => {
    const paire = new Set([bas(d1), bas(v1)]);
    const k = clesConnues.find((c) => c && paire.has(bas(c.currency0)) && paire.has(bas(c.currency1))) || null;
    const sup = k ? [{ fee: Number(k.fee), tickSpacing: Number(k.tickSpacing), hooks: k.hooks }] : [];
    /* ⛔ 2026-10-04 (compte des lectures) : sur un saut ACTION <-> USDC dont la cle est LUE, les gabarits de CLES_PRIX (les pools
     *   de prix ETH/USDC) ne designent aucune pool de cette paire : 5 devis qui REVERTENT a chaque plan. Pour ce saut-la, la
     *   cle lue seule. Tout autre saut garde la regle d avant (la cle lue ET les cles de prix). */
    const sautAction = !!k && (natureJeton(d1) === 'ACTION' || natureJeton(v1) === 'ACTION');
    return meilleureClePourMontant({ rpc, chaine, de: d1, vers: v1, montant: mt, candidates: sautAction ? sup : sup.concat(CLES_PRIX) });
  };
  try {
    /* ── 1. ACHETER UN BLOCK ─────────────────────────────────────────────────────────────────────────────── */
    if (nv === 'BLOCK' && nd !== 'BLOCK' && nd !== 'ACTION') { /* une action qui paie un block : route 5 */
      const marcheB = await marcheDe(vers);
      if (!marcheB || marcheB.etat !== 'LUE' || !marcheB.cle) return normaliser(route, illisible(marcheB));
      const quote = quoteDe(marcheB.cle, vers);
      if (de === quote) {
        return normaliser(route, await planEchange({ rpc, chaine, jeton: vers, compte, sens: 'ACHAT', montant: m,
          marcheLu: marcheB, fraisDevisesOk, maintenant }), { via: 'planEchange', cotation: quote });
      }
      if ((nd === 'USDC' || nd === 'OUSD') && (quote === ETH || quote === USDC)) {
        const chemin = [];
        if (nd === 'OUSD') chemin.push({ de: OUSD, vers: USDC, famille: 'uniswap-v4' });
        if (quote === ETH) chemin.push({ de: USDC, vers: ETH, famille: 'uniswap-v4' });
        chemin.push({ de: quote, vers, famille: 'uniswap-v4' });
        const b = await sautsDepuisChemin({ chemin, montant: m, resoudre: resolveurAvec(marcheB.cle) });
        if (b.etat !== 'OK') return normaliser(route, { etat: b.etat === 'NON_MESURE' ? 'NON_MESURE' : 'REFUSE', pourquoi: b.pourquoi }, { via: 'sautsDepuisChemin', chemin });
        return normaliser(route, await planEchangeMultiSauts({ rpc, chaine, compte, sauts: b.sauts, entree: de, sortie: vers, montant: m,
          decimalesEntree: await decimalesDe(de), prixUsdEntree: null, fraisDevisesOk, maintenant }),
        { via: 'planEchangeMultiSauts', chemin, cotation: quote });
      }
      return normaliser(route, { etat: 'REFUSE', pourquoi: 'this block trades against ' + quote + ': pay with that token'
        + (quote === ETH ? ', USDC or OUSD' : quote === USDC ? ' or OUSD' : '') }, { cotation: quote });
    }
    /* ── 2. VENDRE UN BLOCK : contre sa cotation, contre un autre block, contre une action ───────────────────── */
    if (nd === 'BLOCK') {
      const marcheA = await marcheDe(de);
      if (!marcheA || marcheA.etat !== 'LUE' || !marcheA.cle) return normaliser(route, illisible(marcheA));
      const quote = quoteDe(marcheA.cle, de);
      const decA = Number.isInteger(marcheA.decimales) ? marcheA.decimales : await decimalesDe(de);
      if (vers === quote) {
        return normaliser(route, await planEchange({ rpc, chaine, jeton: de, compte, sens: 'VENTE', montant: m,
          marcheLu: marcheA, fraisDevisesOk, maintenant }), { via: 'planEchange', cotation: quote });
      }
      if (nv === 'BLOCK') {
        const marcheB = await marcheDe(vers);
        if (!marcheB || marcheB.etat !== 'LUE' || !marcheB.cle) return normaliser(route, illisible(marcheB));
        const b = sautsBlocVersBloc({ adrA: de, marcheA, adrB: vers, marcheB });
        if (b.etat !== 'OK') return normaliser(route, { etat: 'REFUSE', pourquoi: b.pourquoi });
        return normaliser(route, await planEchangeMultiSauts({ rpc, chaine, compte, sauts: b.sauts, entree: de, sortie: vers, montant: m,
          decimalesEntree: decA, prixUsdEntree: null, fraisDevisesOk, maintenant }), { via: 'planEchangeMultiSauts' });
      }
      if (nv === 'ACTION' && POOLS_ACTIONS_AERODROME.has(vers)) {
        const c = cheminBlocVersAction({ adrA: de, marcheA, action: vers });
        if (c.etat !== 'OK') return normaliser(route, { etat: 'REFUSE', pourquoi: c.pourquoi });
        return normaliser(route, await planFranchissement({ rpc, chaine, compte, chemin: c.chemin, devise: de, block: vers, montant: m,
          decimalesEntree: decA, prixUsdEntree: null, resoudreV4: resolveurAvec(marcheA.cle), beneficiaireFrais: FEE_WALLET,
          fraisDevisesOk, maintenant }), { via: 'planFranchissement', chemin: c.chemin });
      }
      return normaliser(route, { etat: 'REFUSE', pourquoi: 'a block sells here for its own quote token (' + quote
        + '), for another block, or for a tokenized stock with a measured Aerodrome pool' }, { cotation: quote });
    }
    /* ── 3. ACHETER UNE ACTION TOKENISEE (pool Aerodrome MESUREE, sinon sa pool v4 USDC LUE) ─────────────────────
     * ⛔ 2026-10-03 : 20 actions du registre n ont PAS de pool Aerodrome profonde mais UNE pool v4 USDC/action sans hook (cles LUES
     *   sur la chaine, cles-v4-actions.js). Mesure, wallet vide, 1 USDC : vieDuBlock LUE 19/20 (CAKEc NON_TROUVEE), planEchange ACHAT
     *   APPROBATIONS 19/19 (0,5 % en USDC, le frais d interface : aucun hook ne paie), VENTE 18/19 (ASTSc : devis reverte). Le chemin
     *   v4 est celui des blocks cotes en USDC : ETH passe par USDC (deux sauts, une tx). */
    if (nv === 'ACTION' && nd !== 'ACTION') { /* une action contre une autre action : route 5 */
      const t = POOLS_ACTIONS_AERODROME.get(vers);
      if (!t && (nd === 'ETH' || nd === 'USDC')) {
        const marcheV = await marcheDe(vers);
        if (!marcheV || marcheV.etat !== 'LUE' || !marcheV.cle) {
          return normaliser(route, { etat: marcheV && marcheV.etat === 'NON_TROUVEE' ? 'REFUSE' : 'NON_MESURE',
            pourquoi: 'no measured deep Aerodrome pool for ' + ACTIONS.get(vers) + ', and its v4 pool could not be read: ' + ((marcheV && marcheV.pourquoi) || 'no answer') });
        }
        if (quoteDe(marcheV.cle, vers) !== USDC) return normaliser(route, { etat: 'REFUSE', pourquoi: ACTIONS.get(vers) + ' trades on v4 against ' + quoteDe(marcheV.cle, vers) + ', not USDC: pay with that token' });
        if (nd === 'USDC') {
          return normaliser(route, await planEchange({ rpc, chaine, jeton: vers, compte, sens: 'ACHAT', montant: m,
            marcheLu: marcheV, fraisDevisesOk, maintenant }), { via: 'planEchange', cotation: USDC, pool: 'uniswap-v4' });
        }
        const chemin = [{ de: ETH, vers: USDC, famille: 'uniswap-v4' }, { de: USDC, vers, famille: 'uniswap-v4' }];
        const b = await sautsDepuisChemin({ chemin, montant: m, resoudre: resolveurAvec(marcheV.cle) });
        if (b.etat !== 'OK') return normaliser(route, { etat: b.etat === 'NON_MESURE' ? 'NON_MESURE' : 'REFUSE', pourquoi: b.pourquoi }, { via: 'sautsDepuisChemin', chemin });
        return normaliser(route, await planEchangeMultiSauts({ rpc, chaine, compte, sauts: b.sauts, entree: ETH, sortie: vers, montant: m,
          decimalesEntree: 18, prixUsdEntree: null, fraisDevisesOk, maintenant }), { via: 'planEchangeMultiSauts', chemin, cotation: USDC, pool: 'uniswap-v4' });
      }
      if (!t) return normaliser(route, { etat: 'REFUSE', pourquoi: 'no measured deep Aerodrome pool for ' + ACTIONS.get(vers) + ' in our table yet' });
      if (nd === 'ETH') {
        return normaliser(route, await planAchatEthAction({ rpc, compte, action: vers, pool: t.pool, montantWei: m,
          maintenantSec: Math.floor(maintenant / 1000) }), { via: 'planAchatEthAction', pool: t.pool });
      }
      if (nd === 'USDC') {
        return normaliser(route, await planAerodromeSegment({ rpc, chemin: [{ de: USDC, vers, famille: 'aerodrome' }], devise: USDC,
          block: vers, montant: m, compte, beneficiaireFrais: FEE_WALLET, maintenant }), { via: 'planAerodromeSegment' });
      }
    }
    /* ── 4. VENDRE UNE ACTION TOKENISEE CONTRE USDC sur sa pool v4 LUE (les 20 ; les 12 Aerodrome n ont pas ce chemin ici) ── */
    if (nd === 'ACTION' && nv === 'USDC') {
      /* ⛔⛔ 2026-10-04 — LES DEUX MARCHES SONT ACCEPTES A LA VENTE (Phil : « pool Aerodrome et Uniswap acceptees, oublie pas »).
       *   Mesure du jour sur ce planificateur : vendre NVDAc rendait REFUSE « no initialized pool among the 16 keys read » — l achat
       *   de la meme action passait par sa pool Aerodrome, la vente ne cherchait qu une pool v4 qui n existe pas. 12 actions (la
       *   table MESUREE) n avaient donc aucune sortie ici.
       *   MEME REGLE QUE L ACHAT (route 3) : une action de la table se traite sur SA pool Aerodrome ; les autres sur leur pool v4 LUE.
       *   Le batisseur est celui de l achat, dans l autre sens : un segment Aerodrome action -> USDC, approbation du montant EXACT,
       *   frais d interface retenu sur l USDC qui sort (sweepTokenWithFee).
       *   ⛔ BORNE : ce plan n est PAS simule cote serveur (comme l achat Aerodrome) ; son minimum derive du prix spot de la pool. */
      if (POOLS_ACTIONS_AERODROME.has(de)) {
        return normaliser(route, await planAerodromeSegment({ rpc, chemin: [{ de, vers: USDC, famille: 'aerodrome' }], devise: de,
          block: USDC, montant: m, compte, beneficiaireFrais: FEE_WALLET, maintenant }), { via: 'planAerodromeSegment', cotation: USDC, pool: 'aerodrome' });
      }
      const marcheA = await marcheDe(de);
      if (!marcheA || marcheA.etat !== 'LUE' || !marcheA.cle) return normaliser(route, illisible(marcheA));
      if (quoteDe(marcheA.cle, de) !== USDC) return normaliser(route, { etat: 'REFUSE', pourquoi: ACTIONS.get(de) + ' trades on v4 against ' + quoteDe(marcheA.cle, de) + ', not USDC' });
      return normaliser(route, await planEchange({ rpc, chaine, jeton: de, compte, sens: 'VENTE', montant: m,
        marcheLu: marcheA, fraisDevisesOk, maintenant }), { via: 'planEchange', cotation: USDC, pool: 'uniswap-v4' });
    }
    /* ── 4 bis. UNE ACTION DE LA TABLE AERODROME SE VEND CONTRE DE L ETH (regle de Phil : « tout se regle en ETH ») ──────
     *   action -> USDC -> WETH, deux sauts sur Aerodrome dans UN exactInput ; le routeur rend ensuite de l ETH NATIF
     *   (unwrapWETH9WithFee) en retenant notre part : le vendeur et le wallet des frais recoivent de l ETH, pas du WETH.
     *   ⛔ BORNE : non simule cote serveur (comme la vente contre USDC) ; minimum derive du prix spot des deux pools. */
    if (nd === 'ACTION' && nv === 'ETH' && POOLS_ACTIONS_AERODROME.has(de)) {
      return normaliser(route, await planAerodromeSegment({ rpc, chemin: [{ de, vers: USDC, famille: 'aerodrome' }, { de: USDC, vers: bas(WETH_BASE), famille: 'aerodrome' }],
        devise: de, block: bas(WETH_BASE), montant: m, compte, beneficiaireFrais: FEE_WALLET, maintenant, sortieEthNatif: true }),
      { via: 'planAerodromeSegment', cotation: USDC, pool: 'aerodrome' });
    }
    /* ── 5. UNE ACTION A POOL v4 PAIE AUTRE CHOSE QUE DE L USDC : de l ETH, un block, une autre action a pool v4 ─────────
     * Phil, 2026-10-04 : « payer un block avec n importe quelle TStock : pas route — fais-le ». Tout le chemin est en
     *   uniswap-v4 : l action sort en USDC sur SA pool LUE, puis l USDC suit les jambes deja en prod (USDC>ETH, USDC>block,
     *   USDC>action). UN seul appel au routeur : soit tout passe, soit rien — personne ne reste avec l USDC du milieu.
     * ⛔ Le frais est retenu en tete, DANS L ACTION payee : elle n est admise comme devise de frais que parce que sa pool v4
     *   vient d etre LUE ici (un frais pris dans une devise sans marche ne se revend pas — c est la regle de `fraisDevisesOk`).
     * ⛔ BORNE : les 12 actions de la table Aerodrome n ont PAS ce chemin (leur marche est sur Aerodrome, et un exactInput ne
     *   traverse qu une factory) : refus NOMME plus bas, elles se vendent contre USDC. */
    if (nd === 'ACTION' && !POOLS_ACTIONS_AERODROME.has(de) && (nv === 'ETH' || nv === 'BLOCK' || nv === 'ACTION')) {
      /* refus AVANT toute lecture : la cible est sur Aerodrome, l entree sur v4 — deux factories, deux trades */
      if (nv === 'ACTION' && POOLS_ACTIONS_AERODROME.has(vers)) {
        return normaliser(route, { etat: 'REFUSE', pourquoi: ACTIONS.get(vers) + ' trades on Aerodrome and ' + ACTIONS.get(de) + ' on Uniswap v4: sell for USDC, then buy with USDC (two trades)' });
      }
      /* les deux marches partent ensemble (vers ETH : un seul marche a lire) ; ils sont juges ci-dessous dans l ordre d avant */
      const [luA, luB] = await marchesDe(...(nv === 'ETH' ? [de] : [de, vers]));
      const marcheA = valeurOuErreur(luA);
      if (!marcheA || marcheA.etat !== 'LUE' || !marcheA.cle) return normaliser(route, illisible(marcheA));
      if (quoteDe(marcheA.cle, de) !== USDC) return normaliser(route, { etat: 'REFUSE', pourquoi: ACTIONS.get(de) + ' trades on v4 against ' + quoteDe(marcheA.cle, de) + ', not USDC' });
      const chemin = [{ de, vers: USDC, famille: 'uniswap-v4' }];
      const connues = [marcheA.cle];
      if (nv === 'ETH') chemin.push({ de: USDC, vers: ETH, famille: 'uniswap-v4' });
      else {
        const marcheB = valeurOuErreur(luB);
        if (!marcheB || marcheB.etat !== 'LUE' || !marcheB.cle) return normaliser(route, illisible(marcheB));
        const quoteB = quoteDe(marcheB.cle, vers);
        if (quoteB !== USDC && quoteB !== ETH) return normaliser(route, { etat: 'REFUSE', pourquoi: 'this one trades against ' + quoteB + ': no measured path from USDC to it' }, { cotation: quoteB });
        if (quoteB === ETH) chemin.push({ de: USDC, vers: ETH, famille: 'uniswap-v4' });
        chemin.push({ de: quoteB, vers, famille: 'uniswap-v4' });
        connues.push(marcheB.cle);
      }
      const b = await sautsDepuisChemin({ chemin, montant: m, resoudre: resolveurAvec(...connues) });
      if (b.etat !== 'OK') return normaliser(route, { etat: b.etat === 'NON_MESURE' ? 'NON_MESURE' : 'REFUSE', pourquoi: b.pourquoi }, { via: 'sautsDepuisChemin', chemin });
      const decA = Number.isInteger(marcheA.decimales) ? marcheA.decimales : await decimalesDe(de);
      return normaliser(route, await planEchangeMultiSauts({ rpc, chaine, compte, sauts: b.sauts, entree: de, sortie: vers, montant: m,
        decimalesEntree: decA, prixUsdEntree: null, fraisDevisesOk: new Set([...fraisDevisesOk, de]), maintenant }),
      { via: 'planEchangeMultiSauts', chemin, cotation: USDC, pool: 'uniswap-v4' });
    }
    /* ── 6. ETH CONTRE USDC, ET L INVERSE ───────────────────────────────────────────────────────────────────────────────
     * QA wallet reel de Grok (2026-10-04, P0) : « swap 5 USDC to ETH » rendait « route USDC>ETH is not offered by this API yet » —
     *   la pre-commande « Swap » du panneau menait a un refus pour l echange le plus banal qui soit.
     * Le chemin : DIRECT si une pool v4 sans hook cote la paire a cette taille (les deux replis par pivot ne servent qu a une
     *   devise future). Un seul appel au routeur. Le frais et ses gardes sont ceux de `planEchangeMultiSauts`, inchanges.
     * ⛔ `ECHANGEABLES` dit POURQUOI les autres devises du registre n y sont pas (aller sans retour, mesure sur fork). */
    if (ECHANGEABLES.has(de) && ECHANGEABLES.has(vers)) {
      const essais = [[{ de, vers }]];
      if (de !== USDC && vers !== USDC) essais.push([{ de, vers: USDC }, { de: USDC, vers }]);
      if (de !== ETH && vers !== ETH) essais.push([{ de, vers: ETH }, { de: ETH, vers }]);
      let dernier = null;
      for (const e of essais) {
        const chemin = e.map((s) => ({ ...s, famille: 'uniswap-v4' }));
        const b = await sautsDepuisChemin({ chemin, montant: m, resoudre: resolveurAvec() });
        if (b.etat !== 'OK') { dernier = { b, chemin }; continue; }
        return normaliser(route, await planEchangeMultiSauts({ rpc, chaine, compte, sauts: b.sauts, entree: de, sortie: vers, montant: m,
          decimalesEntree: await decimalesDe(de), prixUsdEntree: null, fraisDevisesOk, maintenant }), { via: 'planEchangeMultiSauts', chemin });
      }
      return normaliser(route, { etat: dernier.b.etat === 'NON_MESURE' ? 'NON_MESURE' : 'REFUSE', pourquoi: dernier.b.pourquoi }, { via: 'sautsDepuisChemin', chemin: dernier.chemin });
    }
  } catch (e) {
    return normaliser(route, { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 160) });
  }
  if (nd === 'ACTION') return normaliser(route, { etat: 'REFUSE', pourquoi: (ACTIONS.get(de) || 'this tokenized stock') + ' trades on Aerodrome: it sells here for USDC or ETH — sell it first, then buy (two trades; route ' + route + ' is not offered in one yet)' });
  return normaliser(route, { etat: 'REFUSE', pourquoi: 'route ' + route + ' is not offered by this API yet' });
}
