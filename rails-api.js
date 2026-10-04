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
import { sautsBlocVersBloc, cheminBlocVersAction } from './bloc-vers-bloc.js';
import { sautsDepuisChemin } from './sauts-depuis-chemin.js';
import { vieDuBlock } from './marche.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { DEVISES_BASE, ACTIONS_COINBASE } from './paires.js';
import { USDC_BASE, FEE_WALLET } from './frais-creation.js';
import { CLES_PRIX } from './prix-eth.js';
import { V4_ADRESSES } from './lancer-pool.js';
import { RE_B20 } from './pool-sans-hook.js';
import { selecteur } from './keccak.js';

export const ETH = '0x0000000000000000000000000000000000000000';
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (a) => String(a || '').toLowerCase();
const USDC = bas(USDC_BASE);
const OUSD = bas((DEVISES_BASE.find((d) => d.symbole === 'OUSD') || {}).adr);
const ACTIONS = new Map(ACTIONS_COINBASE.map((a) => [bas(a.adr), a.symbole]));
const DEVISES = new Map(DEVISES_BASE.map((d) => [bas(d.adr), d.symbole]));
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
  const rpc = deps && deps.rpc;
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
  const marcheDe = async (a) => vieDuBlock({ rpc, stateView, jeton: a, clesExactes: await clesDe(a) });
  const illisible = (mk) => ({ etat: mk && mk.etat === 'NON_TROUVEE' ? 'REFUSE' : 'NON_MESURE',
    pourquoi: 'the block market could not be read: ' + ((mk && mk.pourquoi) || 'no answer') });
  /* ⛔ LES DECIMALES SE LISENT (OUSD en a 6, pas 18) ; ETH natif seul est connu. */
  const decimalesDe = async (a) => {
    if (a === ETH) return 18;
    const r = await rpc('eth_call', [{ to: a, data: selecteur('decimals()') }, 'latest']);
    const d = Number(BigInt(String(r).slice(0, 66)));
    if (!Number.isInteger(d) || d < 0 || d > 36) throw new Error('decimals unread');
    return d;
  };
  /* le resolveur v4 de l app : la cle LUE du marche d abord, puis les cles de prix connues (jamais l une sans l autre) */
  const resolveurAvec = (cleConnue) => async ({ de: d1, vers: v1, montant: mt }) => {
    const paire = new Set([bas(d1), bas(v1)]);
    const k = cleConnue && paire.has(bas(cleConnue.currency0)) && paire.has(bas(cleConnue.currency1)) ? cleConnue : null;
    const sup = k ? [{ fee: Number(k.fee), tickSpacing: Number(k.tickSpacing), hooks: k.hooks }] : [];
    return meilleureClePourMontant({ rpc, chaine, de: d1, vers: v1, montant: mt, candidates: sup.concat(CLES_PRIX) });
  };
  try {
    /* ── 1. ACHETER UN BLOCK ─────────────────────────────────────────────────────────────────────────────── */
    if (nv === 'BLOCK' && nd !== 'BLOCK') {
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
    if (nv === 'ACTION') {
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
  } catch (e) {
    return normaliser(route, { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 160) });
  }
  if (nd === 'ACTION') return normaliser(route, { etat: 'REFUSE', pourquoi: 'a tokenized stock sells here for USDC only (route ' + route + ' is not offered by this API yet)' });
  return normaliser(route, { etat: 'REFUSE', pourquoi: 'route ' + route + ' is not offered by this API yet' });
}
