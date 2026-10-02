// echange.js — acheter / vendre un block DANS l app, avec le frais d interface de 0,5 %, et le buyback.
// ================================================================================================
// ⛔ HARD RULE tip 2349/2350 / 20260922-2023: every in-app Buy/Sell 0.5% → FEE_WALLET only (never 37eb, never skip — including hooked pools).
//    Hooked Dex may add hook chop on top; zero interface fees worse than stacked. Birth=V8 only on MAIN.
//    tip 20260922-2026: fee asset ETH or USDC only at FEE_WALLET — never TBLOCK/TBGAS/block tokens.
//    External Dex on unhooked pools = 0 forever — chop that volume only via TbFeeHook Launch (new pool id).
// ⛔ DECISION DE PHIL (2026-09-13) : 0,5 % de chaque achat / vente fait via l app va au wallet de frais, DIT avant
//    la signature. Mesure qui l a motivee : 459 creations B20 en 22 h sur la factory publique de Base, 2 chez nous.
// ⛔ LE FRAIS EST PRIS EN ETH, DANS LA MEME TRANSACTION, PAR LES ACTIONS DU ROUTEUR v4 (lues a la source) :
//    · achat (ETH -> block) : swap du NET, SETTLE du TOTAL paye par l utilisateur, TAKE du frais vers le wallet
//      de frais, TAKE_ALL du block vers l utilisateur — la difference total − net cree le credit que TAKE preleve ;
//    · vente (block -> ETH) : swap, SETTLE_ALL du block, TAKE_PORTION 50 bips de l ETH vers le wallet de frais,
//      TAKE_ALL du reste vers l utilisateur.
//    Rien n est signe ici ; le wallet de l utilisateur signe. Aucune seconde transaction de frais a oublier.
// ⛔ BUYBACK : le wallet de frais qui achete TBLOCK ne se paie pas de frais a lui-meme (frais = 0).
// ⛔ AVANT DE PROPOSER LA SIGNATURE, LA CHAINE EST INTERROGEE : quote (prix reel), forme de struct acceptee,
//    puis eth_call de la transaction exacte. Une lecture ratee = rien a signer.
import { TBLOCK, HOOK_PREVU, HOOK_V8, estNotreHook, hookPaieDejaA6cf, deviseFraisHook } from './tokenomics.js';
import { encodeV4Swap, encodeQuote, formeAcceptee, paramsAction, paramsSwapExactInSingle, ACTIONS_V4, selecteur,
  encodeApprove, encodePermit2Approve, MAX_UINT256, MAX_UINT160, MAX_UINT48, AVEC_MINHOP, SANS_MINHOP, cleDePool } from './pool.js';
import { vieDuBlock } from './marche.js';
import { poolSansHookInterdite, indexPoolSansHookInterdite, MESSAGE_SANS_POOL, ROUTE_VIA_TBLOCK, cleTouchTblock,
  REFUS_FRAIS_HOOK_EN_BLOCK, fraisHookEnBlock, MESSAGE_PAS_ICI } from './pool-sans-hook.js';
/* ⛔ L ASSEMBLAGE DE LA ROUTE MULTI-SAUTS VIT A PART, teste et mute (45 cas, 14/14 mutations). Ici
 *   on ne fait que LIRE les prix et APPELER : melanger la lecture et la decision rendrait un refus
 *   indistinguable d une lecture ratee — le defaut numero un de ce depot. */
import { actionsMultiSauts, routePrete, SAUTS_MIN, SAUTS_MAX } from './route-v4-multi-sauts.js';
/* ⛔ LE BAREME VIT A PART, avec son plancher monotone et ses paliers tires de la distribution
 *   MESUREE. Le recopier ici ferait deux baremes qui divergeraient. */
import { fraisPourMontant } from './frais-degressif.js';
import { hookDataReferentO1 } from './referent-o1.js';
import { FEE_WALLET, WALLET_TRESOR_SMART } from './frais-creation.js';
import { PERMIT2, V4_ADRESSES } from './lancer-pool.js';
import { USDC_BASE, CLES_PRIX } from './prix-eth.js';

/** ⛔ RECOPIEES de index.html (const ROUTEUR, const QUOTER) — un test compare. */
export const ROUTEUR = { 84532: '0x492E6456D9528771018DeB9E87ef7750EF184104', 8453: '0x6ff5693b99212DA76aD316178A184AB56D299b43' };
export const QUOTEUR = { 84532: '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba', 8453: '0x0d5e0F971ED27FBfF6c2837bf31316121532048D' };
export const FRAIS_INTERFACE_BPS = 50n;
/** tip 0036 / 20260922-2026: MUST stay false — fee lands ETH/USDC at a6cf; never auto-buy TBLOCK/TBGAS as fee asset. */
export const RACHAT_AUTO = false;
export const ETATS_ECHANGE = ['PRET', 'APPROBATIONS', 'REFUSE', 'NON_MESURE'];
const ETH = '0x0000000000000000000000000000000000000000';
/** ⛔ 2026-10-02 (fix-2) — UN FRAIS PAR JAMBE, QUELLE QUE SOIT currency0. Le hook de cette jambe verse-t-il a6cf
 *  dans une devise VENDABLE (ETH, USDC, ou une devise dont l appelant a lu le prix) — jamais le block lui-meme ?
 *  Oui : le routeur ne prend rien. Non (hook qui paie en block, ou pas de hook payeur) : le routeur garde son frais.
 *  Rend { paie, devise } ; `devise` sert a calculer l assiette du frais du hook (garde anti-poussiere). */
export function hookPaieEnDeviseVendable({ cle, sens, zeroForOne, jeton = null, fraisDevisesOk = null }) {
  const d = deviseFraisHook(cle, sens, zeroForOne);
  if (!d || (jeton && d === String(jeton).toLowerCase())) return { paie: false, devise: d };
  /* ⛔ 2026-10-02 14:49 (Zero 1, PREUVE-FRAIS-VIEILLES-POOLS) : le V8 verse a6cf dans la devise appariee, dans les deux
   *   sens, QUELLE QU ELLE SOIT (TBLOCK(e7e9)/SPCXc mesure : hook 4 975 + routeur 5 000 = double frais). Sur une pool V8 dont
   *   le block n est pas currency0, le hook paie toujours : le routeur ne prend rien, prix lu ou non. */
  const v8 = String((cle && cle.hooks) || '').toLowerCase() === String(HOOK_V8).toLowerCase();
  const ok = v8 || d === ETH || d === USDC_BASE.toLowerCase() || (fraisDevisesOk instanceof Set && fraisDevisesOk.has(d));
  return { paie: ok, devise: d };
}
/** ⛔ 2026-10-02 (fix-2, Claude C) — jambe TBLOCK/ETH de `routeViaTblock` : le frais du hook n y compte QUE s il est en ETH.
 *  Avant, la sortie du routeur reposait sur la seule construction (cleT est TBLOCK/ETH). Garde explicite, testee. */
export function hookPaieJambeTblock(cleT, sens) {
  if (!cleT || String(cleT.currency0 || '').toLowerCase() !== ETH) return false;
  const r = hookPaieEnDeviseVendable({ cle: cleT, sens, zeroForOne: sens === 'ACHAT', jeton: TBLOCK });
  return r.paie && r.devise === ETH;
}
const pad = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
/** tip 20260916-0012: actions hold BigInt — JSON.stringify throws «serialize a BigInt» and kills Buy/Sell quotes. */
function jsonSafe(x) {
  return JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? '0x' + v.toString(16) : v));
}

/** Le frais sur un montant : tronque vers le bas, le reste va au swap — la somme est exacte. */
export function fraisSur(total, bps) {
  const t = BigInt(total), b = BigInt(bps);
  const frais = (t * b) / 10000n;
  return { frais, net: t - frais };
}

/** ⛔⛔ L EXEMPTION SUIT LE TRESOR, PAS LA DESTINATION (2026-09-17). Depuis que les frais partent vers
 * le wallet perso de Phil, lier l exemption a la DESTINATION aurait rendu ses propres trades gratuits
 * — donc invisibles, donc impossibles a prouver : on aurait rejoue « le wallet ne recoit rien »
 * exactement comme avec le rachat automatique. Ce qui ne se paie pas de frais a lui-meme, c est le
 * smart wallet qui rachete du TBLOCK. */
export const estWalletDeFrais = (compte) => String(compte || '').toLowerCase() === WALLET_TRESOR_SMART.toLowerCase();

/** tip 2350 / 20260922-2023 / 20260922-2026: fail-closed — TAKE/TAKE_PORTION → FEE_WALLET in ETH or USDC only (never TBLOCK/TBGAS/block).
 *  Hooked pools may ALSO chop on-chain; zero interface fees were worse than stacked fees. */
/* ⛔⛔ `bpsAttendu` EXISTE PARCE QUE LES RAILS N ONT PAS LE MEME TAUX, ET IL EST EXIGE, PAS DEVINE.
 *   Decision de Phil (2026-10-01) : le rail multi-sauts prend 0,1 % par transaction, la ou le
 *   chemin in-app historique prend 0,5 %. Sans ce parametre, le garde refusait 10 bps et la route
 *   entiere tombait.
 * ⛔ CE N EST PAS UN ASSOUPLISSEMENT : le taux reste EXIGE A L IDENTIQUE, seule sa valeur attendue
 *   est passee par l appelant. Tous les autres controles — beneficiaire, devise vendable, presence
 *   d un TAKE vers a6cf — sont inchanges. Un appelant qui oublierait le parametre retombe sur
 *   `FRAIS_INTERFACE_BPS`, donc sur le comportement d avant : le defaut est le plus strict. */
function assertFraisInterfaceA6cf({ compte, bps, resume, actions, fraisDevisesOk = null,
  bpsAttendu = FRAIS_INTERFACE_BPS, hookPaie = false, assietteHook = null }) {
  if (estWalletDeFrais(compte)) return null; /* le tresor ne se facture pas lui-meme */
  /* ⛔ 2026-10-02 : le hook verse deja a6cf sur cette jambe -> le routeur ne prend RIEN (un frais par jambe). */
  if (hookPaie) {
    if (bps !== 0n) return 'double fee: the hook already pays the fee wallet on this leg';
    return jsonSafe(actions || []).toLowerCase().includes(FEE_WALLET.slice(2).toLowerCase())
      ? 'double fee: a router TAKE to the fee wallet on a leg the hook already pays'
      /* ⛔ 2026-10-02 (fix-2, poussiere) : f319fc9 refusait « fee amount is zero » ; 0d870cf rendait ici AVANT ce controle,
       *   et un achat V8/ETH de 199 wei passait avec 0 wei a a6cf (le hook arrondit a 0). Meme garde, sur l assiette du hook. */
      : (assietteHook == null || (BigInt(assietteHook) * FRAIS_INTERFACE_BPS) / 10000n <= 0n)
        ? 'fee amount is zero — amount too small for 0.5%' : null;
  }
  if (bps !== bpsAttendu) return 'interface fee bps missing (want ' + bpsAttendu + ')';
  if (String(resume && resume.beneficiaireFrais || '').toLowerCase() !== FEE_WALLET.toLowerCase()) {
    return 'fee beneficiary is not the configured fee wallet';
  }
  const asset = String(resume && resume.fraisDevise || '');
  const deviseResume = String(resume && resume.devise || '').toLowerCase();
  const pairIsUsdc = asset === 'pair' && deviseResume === USDC_BASE.toLowerCase();
  /* ⛔⛔ LA DEVISE DE FRAIS EST AUTORISEE PAR L APPELANT, SUR MESURE — jamais par une liste ecrite
   *     ici. Ce verrou n existait pas pour embeter : a6cf a DEJA ete paye en jetons invendables
   *     (mesure d aout 2026 — 7 detentions verifiees, ZERO avec un marche, part reelle 0 $). Un
   *     frais paye dans un jeton qu on ne peut pas vendre n est pas un revenu, c est un decor.
   *   ⛔ MAIS TOUT REFUSER ETAIT FAUX AUSSI : mesure du 2026-09-25, 8 des 13 actions Coinbase ont
   *     un marche reel (prix lisible, liquidite au-dessus du seuil). Les refuser fermait des
   *     echanges qui nous auraient payes en quelque chose de VENDABLE.
   *   ⇒ L appelant passe l ensemble des devises dont il a LU le prix. Absent ou vide, on retombe
   *     exactement sur le comportement d avant : ETH ou USDC. Fail-closed par construction — une
   *     devise qu on n a pas su mesurer n entre jamais dans cet ensemble. */
  const pairAutorisee = asset === 'pair' && deviseResume
    && fraisDevisesOk instanceof Set && fraisDevisesOk.has(deviseResume);
  if (asset !== 'ETH' && asset !== 'USDC' && !pairIsUsdc && !pairAutorisee) {
    return 'fee asset must be ETH, USDC or a currency with a measured market (not block tokens)';
  }
  const blob = jsonSafe(actions || []).toLowerCase();
  const sink = FEE_WALLET.slice(2).toLowerCase();
  if (!blob.includes(sink)) return 'fee TAKE/TAKE_PORTION to the fee wallet missing from actions';
  const usdc = USDC_BASE.slice(2).toLowerCase();
  const ethWord = '0'.repeat(64); /* native ETH currency padded in TAKE params */
  const takeEth = blob.includes(ethWord + '000000000000000000000000' + sink)
    || blob.includes('0000000000000000000000000000000000000000000000000000000000000000'
      + '000000000000000000000000' + sink);
  const takeUsdc = blob.includes(usdc) && blob.includes(sink);
  /* ⛔ LE CALLDATA DOIT NOMMER LA DEVISE AUTORISEE, pas seulement le resume. Un resume est une
   *   promesse ; seuls les OCTETS partent sur la chaine. Meme lecon que sur le Bridge ce matin. */
  const takeDeviseOk = !!pairAutorisee && blob.includes(deviseResume.slice(2)) && blob.includes(sink);
  if (!takeEth && !takeUsdc && !takeDeviseOk) {
    return 'fee TAKE/TAKE_PORTION must reach the fee wallet in an allowed currency';
  }
  if (resume.frais == null || BigInt(resume.frais) <= 0n) return 'fee amount is zero — amount too small for 0.5%';
  return null;
}

async function appelOuErreur(rpc, tx) {
  try { return { result: await rpc('eth_call', [tx, 'latest']) }; }
  catch (e) { return { error: { message: String((e && e.message) || e) } }; }
}

/**
 * @param {object} o
 * @param {'ACHAT'|'VENTE'} o.sens
 * @param {bigint} o.montant  achat : wei d ETH payes (frais compris) ; vente : unites brutes du block vendues
 */
export async function planEchange({ rpc, chaine, jeton, compte, sens, montant, toleranceBps = 100n, maintenant = Date.now(),
  marcheLu = null, cleImposee = null, fraisDevisesOk = null }) {
  const R = ROUTEUR[Number(chaine)], Q = QUOTEUR[Number(chaine)], V = V4_ADRESSES[Number(chaine)];
  if (!R || !Q || !V) return { etat: 'REFUSE', pourquoi: 'no Uniswap router on this network here' };
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(compte || ''))) return { etat: 'REFUSE', pourquoi: 'connect your wallet first' };
  if (sens !== 'ACHAT' && sens !== 'VENTE') return { etat: 'REFUSE', pourquoi: 'buy or sell' };
  const m = BigInt(montant);
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'enter an amount above zero' };
  const tol = BigInt(toleranceBps);
  if (tol < 0n || tol >= 10000n) return { etat: 'REFUSE', pourquoi: 'slippage out of range' };

  const lire = rpc;
  /* ⛔⛔ BUG TROUVE EN VERIFIANT (2026-09-13, WOFI) : le profil venait de LIRE le marche (12,67 ETH), et le clic
   * « Prepare buy » le relisait — refuse par le noeud public sature : « its market could not be read ». Le marche
   * deja lu par `vieDuBlock` (meme fonction, meme cle) est reutilise ; sinon on lit, et on relit UNE fois. */
  /* ⛔ « PAIRED WITH » (2026-09-19) : un block peut avoir plusieurs marches (ETH, AAPLc, NVDAc…). Le marche CHOISI arrive
   *    avec sa cle exacte ; il n est pas relu, on le prend tel quel (la simulation de la transaction exacte le verifie). */
  let marche = cleImposee ? { etat: 'LUE', cle: cleImposee, paire: null }
    : (marcheLu && marcheLu.etat === 'LUE' && marcheLu.cle ? marcheLu : null);
  if (!marche) {
    marche = await vieDuBlock({ rpc: lire, stateView: V.stateView, jeton });
    if (marche.etat === 'NON_LUE') {
      await new Promise((ok) => setTimeout(ok, 1500));
      marche = await vieDuBlock({ rpc: lire, stateView: V.stateView, jeton });
    }
  }
  if (marche.etat !== 'LUE' || !marche.cle) {
    return { etat: marche.etat === 'NON_TROUVEE' ? 'REFUSE' : 'NON_MESURE',
      pourquoi: marche.etat === 'NON_TROUVEE' ? 'this block has no market to trade on yet' : 'its market could not be read' };
  }
  /* ⛔⛔ 2026-10-02 (regle du fondateur) : jamais une pool sans hook pour un block TB — refus avant toute cotation. */
  /* ⛔⛔ 2026-10-02 13:58 (fondateur) : plus aucune route par TBLOCK — ni TBLOCK lui-meme, ni un block apparie a TBLOCK. */
  if (!ROUTE_VIA_TBLOCK && (marche.paire === 'TBLOCK' || cleTouchTblock(marche.cle))) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_SANS_POOL, refusTblock: true };
  }
  if (marche.paire !== 'TBLOCK' && poolSansHookInterdite(marche.cle, [jeton])) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_SANS_POOL, refusSansHook: true };
  }
  /* tip 20260922-2023: ALWAYS take interface 0.5% → FEE_WALLET on in-app Buy/Sell (unless fee-wallet buyback).
   *    Prior skip when estNotreHook assumed hook TAKE ~3% already hit a6cf — live dig 2026-09-22: sink got 0
   *    from Buy/Sell volume (hooked path skipped interface AND hook was not depositing). Stacked fees
   *    (hook chop + 0.5% interface) beat zero fees. hooked Dex may add hook chop on top. Birth=V8 only. */
  const hookPaieDeja = !!(marche.cle && estNotreHook(marche.cle.hooks));
  /* ⛔ 2026-10-02 : mesure fork — V8 achat/vente, V1/V2 vente : le hook verse deja a6cf en ETH. */
  /*   Mesure faite sur des pools ETH seulement : une pool contre une devise ERC-20 garde le frais routeur. */
  /* ⛔ 2026-10-02 (fix-2) : plus de condition currency0 === ETH — elle laissait le routeur empiler ses 0,5 % sur le V8 des
   *   pools USDC et actions (Zero 1 : 34 075 hook + 33 904 routeur USDC sur la meme vente). La devise du hook decide. */
  const zfMarche = !!(marche.cle && (String(marche.cle.currency0).toLowerCase() === String(jeton).toLowerCase()
    ? sens === 'VENTE' : sens === 'ACHAT'));
  /* ⛔⛔ 2026-10-02 13:59 (fondateur) : jamais de frais en block a a6cf — une pool dont le hook preleverait en block est refusee. */
  if (REFUS_FRAIS_HOOK_EN_BLOCK && fraisHookEnBlock(marche.cle, jeton, sens, zfMarche)) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusFraisEnBlock: true };
  }
  const hookPaie = marche.paire !== 'TBLOCK' && !!marche.cle
    && hookPaieEnDeviseVendable({ cle: marche.cle, sens, zeroForOne: zfMarche, jeton, fraisDevisesOk }).paie;
  const bps = (estWalletDeFrais(compte) || hookPaie) ? 0n : FRAIS_INTERFACE_BPS;
  const deadline = BigInt(Math.floor(maintenant / 1000) + 1200);
  /* ⛔⛔ ACHAT VIA TBLOCK (Phil, 2026-09-13 : « fait l achat via TBLOCK ») : un block apparie a TBLOCK se paie en ETH
   *    et se vend pour de l ETH, en DEUX sauts dans UNE transaction — ETH -> TBLOCK -> block, ou l inverse. */
  if (marche.paire === 'TBLOCK') {
    const route = await routeViaTblock({ lire, Q, V, marche, jeton, sens, m, tol, bps });
    if (!route.actions) return route;
    const koFrais = assertFraisInterfaceA6cf({ compte, bps: route.bps, resume: route.resume, actions: route.actions, hookPaie: route.hookPaie, assietteHook: route.assietteHook });
    if (koFrais) return { etat: 'REFUSE', pourquoi: 'Buy/Sell fee path broken: ' + koFrais, resume: route.resume };
    const { bps: _b, hookPaie: _h, assietteHook: _a, ...routeF } = route;
    return finaliser({ lire, R, compte, jeton, sens, m, maintenant, deadline, ...routeF });
  }
  const cle = marche.cle;
  if (String(cle.currency0).toLowerCase() !== ETH) {
    /* ⛔⛔ MARCHE CONTRE UNE DEVISE ERC-20 (V3, 2026-09-19) : on paie la devise pour acheter, on la recoit en vendant — un saut.
     *    Seulement sur NOTRE hook : c est lui qui preleve (3 %) ; l interface n ajoute rien. Permit2 sur le jeton PAYE. */
    if (!hookPaieDeja) return { etat: 'REFUSE', pourquoi: 'this market is not a TokenizedBlock market — only those are traded here in another currency' };
    const c0 = String(cle.currency0).toLowerCase(), c1 = String(cle.currency1).toLowerCase(), j = String(jeton).toLowerCase();
    if (c0 !== j && c1 !== j) return { etat: 'REFUSE', pourquoi: 'this market is not this block' };
    const devise = c0 === j ? c1 : c0;
    const zf = sens === 'ACHAT' ? devise === c0 : j === c0; // on paie currency0 -> zeroForOne
    /* ⛔⛔ CE REFUS FERMAIT TOUT MARCHE COTE AUTREMENT QU EN USDC, actions Coinbase comprises —
     *     alors que l ecran de Create promettait « buyers will need INTCc to trade your block ».
     *     Vrai sur la chaine, FAUX dans l app, et affiche juste avant de demander 0,001 ETH.
     *   ⇒ On accepte desormais une devise dont l appelant a MESURE le prix (`fraisDevisesOk`), et
     *     on refuse toujours le reste. Le frais atterrit dans cette devise — c est deja ce que fait
     *     le plan ci-dessous — donc la seule question qui compte est : saura-t-on la revendre ?
     *     a6cf a deja ete paye en jetons invendables une fois ; ca n arrivera pas par ce chemin. */
    const deviseBas = String(devise).toLowerCase();
    const deviseMesuree = fraisDevisesOk instanceof Set && fraisDevisesOk.has(deviseBas);
    if (bps > 0n && deviseBas !== USDC_BASE.toLowerCase() && !deviseMesuree) {
      return { etat: 'REFUSE', pourquoi: 'this market is priced in a currency we could not price in '
        + 'dollars, so the 0.5% fee could not be taken in something sellable — nothing was sent' };
    }
    const { frais: fraisPair, net: netPair } = sens === 'ACHAT' ? fraisSur(m, bps) : { frais: 0n, net: m };
    const montantQuote = sens === 'ACHAT' ? netPair : m;
    let q;
    try {
      const rq = await lire('eth_call', [{ to: Q, data: encodeQuote({ cle, zeroForOne: zf, montant: montantQuote }) }, 'latest']);
      q = BigInt('0x' + String(rq).slice(2, 66));
    } catch (e) {
      return { etat: 'NON_MESURE', pourquoi: 'the price could not be quoted: ' + String((e && e.message) || e).slice(0, 120) };
    }
    if (q <= 0n) return { etat: 'REFUSE', pourquoi: 'the pool returns nothing for this amount' };
    const entree = sens === 'ACHAT' ? devise : j, sortie = sens === 'ACHAT' ? j : devise;
    let actionsD, resumeD, valeurD = 0n;
    if (sens === 'ACHAT') {
      const min = (q * (10000n - tol)) / 10000n;
      actionsD = bps > 0n
        ? [{ code: ACTIONS_V4.SETTLE, params: paramsAction.settle(devise, m, true) },
          { code: ACTIONS_V4.TAKE, params: paramsAction.take(devise, FEE_WALLET, fraisPair) },
          { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(sortie, min) }]
        : [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(entree, m) },
          { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(sortie, min) }];
      resumeD = { paye: m, payeDevise: 'pair', recoitAuMoins: min, recoitDevise: 'block',
        quote: q, frais: fraisPair, fraisDevise: 'pair', montantSwap: netPair, devise,
        fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null, fraisMarcheBps: hookPaieDeja ? 300 : null };
    } else {
      const fraisVente = (q * bps) / 10000n;
      const min = ((q - fraisVente) * (10000n - tol)) / 10000n;
      actionsD = [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(entree, m) },
        ...(bps > 0n ? [{ code: ACTIONS_V4.TAKE_PORTION, params: paramsAction.takePortion(sortie, FEE_WALLET, bps) }] : []),
        { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(sortie, min) }];
      resumeD = { paye: m, payeDevise: 'block', recoitAuMoins: min, recoitDevise: 'pair',
        quote: q, frais: fraisVente, fraisDevise: 'pair', montantSwap: m, devise,
        fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null, fraisMarcheBps: hookPaieDeja ? 300 : null };
    }
    const koPair = assertFraisInterfaceA6cf({ compte, bps, resume: resumeD, actions: actionsD, fraisDevisesOk, hookPaie,
      assietteHook: sens === 'ACHAT' ? m : q });
    if (koPair) return { etat: 'REFUSE', pourquoi: 'Buy/Sell fee path broken: ' + koPair, resume: resumeD };
    return finaliser({ lire, R, compte, jeton, sens, m, maintenant, deadline, actions: actionsD, valeur: valeurD, resume: resumeD,
      cle, zeroForOne: zf, sortieMinTete: 0n, jetonPaye: entree, valeurEth: false });
  }
  const zeroForOne = sens === 'ACHAT'; // ETH est currency0 : acheter = payer currency0

  /* ── quote : le prix REEL, sur le montant qui passe vraiment dans la pool ── */
  const { frais: fraisAchat, net: netAchat } = sens === 'ACHAT' ? fraisSur(m, bps) : { frais: 0n, net: m };
  let quote;
  try {
    const r = await lire('eth_call', [{ to: Q, data: encodeQuote({ cle, zeroForOne, montant: netAchat }) }, 'latest']);
    quote = BigInt('0x' + String(r).slice(2, 66));
  } catch (e) {
    return { etat: 'NON_MESURE', pourquoi: 'the price could not be quoted: ' + String((e && e.message) || e).slice(0, 120) };
  }
  if (quote <= 0n) return { etat: 'REFUSE', pourquoi: 'the pool returns nothing for this amount' };

  /* ⛔⛔ BUYBACK AUTOMATIQUE (Phil, 2026-09-13 : « si frais alors buyback direct ») : quand le marche TBLOCK/ETH est
   *    LU, le frais n arrive pas en ETH — il RACHETE du TBLOCK dans la meme transaction, livre au wallet de frais.
   *    Sinon (marche TBLOCK absent ou illisible, ou echange de TBLOCK lui-meme), le frais reste en ETH. Le second
   *    swap a sa propre sortie minimale (quote reel) : un rachat qui se ferait voler son prix ne rachete rien. */
  let rachat = null;
  /* ⛔ tip 0036 (Phil : dollars/ETH sur le wallet de frais) : smoke test sur fork 2026-09-17, 3 achats de 0,01 ETH avec le
   *    buyback auto -> 0 wei d ETH au wallet de frais (le frais repartait en TBLOCK). Buyback garde, desactive. */
  if (RACHAT_AUTO && bps > 0n && String(jeton).toLowerCase() !== TBLOCK.toLowerCase()) {
    try {
      const mt = await vieDuBlock({ rpc: lire, stateView: V.stateView, jeton: TBLOCK });
      if (mt.etat === 'LUE' && mt.cle && String(mt.cle.currency0).toLowerCase() === ETH) rachat = { cle: mt.cle };
    } catch { rachat = null; }
  }
  const quoteTblock = async (eth) => {
    const r = await lire('eth_call', [{ to: Q, data: encodeQuote({ cle: rachat.cle, zeroForOne: true, montant: eth }) }, 'latest']);
    return BigInt('0x' + String(r).slice(2, 66));
  };

  let actions, valeur, resume;
  if (sens === 'ACHAT' && rachat && fraisAchat > 0n) {
    const min = (quote * (10000n - tol)) / 10000n;
    let minT;
    try { minT = ((await quoteTblock(fraisAchat)) * (10000n - tol)) / 10000n; } catch { minT = null; }
    if (minT !== null && minT > 0n) {
      actions = [{ code: ACTIONS_V4.SETTLE, params: paramsAction.settle(ETH, m, true) },
        /* le credit ETH restant = le frais exact ; OPEN_DELTA le depense en entier */
        { code: ACTIONS_V4.SWAP_EXACT_IN_SINGLE, params: '__SWAP__', swap: { cle: rachat.cle, zeroForOne: true, montant: 0n, sortieMin: minT } },
        { code: ACTIONS_V4.TAKE, params: paramsAction.take(TBLOCK, FEE_WALLET, 0n) },
        { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(jeton, min) }];
      valeur = m;
      resume = { paye: m, payeDevise: 'ETH', recoitAuMoins: min, recoitDevise: 'block', quote, frais: fraisAchat, fraisDevise: 'ETH',
        montantSwap: netAchat, rachatAuto: true, tblockRachetesAuMoins: minT };
    }
  }
  if (!actions && sens === 'VENTE' && rachat && bps > 0n) {
    const brutMin = (quote * (10000n - tol)) / 10000n;
    const fraisExact = (brutMin * bps) / 10000n;
    let minT;
    try { minT = fraisExact > 0n ? ((await quoteTblock(fraisExact)) * (10000n - tol)) / 10000n : null; } catch { minT = null; }
    if (minT !== null && minT > 0n) {
      actions = [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(jeton, m) },
        { code: ACTIONS_V4.SWAP_EXACT_IN_SINGLE, params: '__SWAP__', swap: { cle: rachat.cle, zeroForOne: true, montant: fraisExact, sortieMin: minT } },
        { code: ACTIONS_V4.TAKE, params: paramsAction.take(TBLOCK, FEE_WALLET, 0n) },
        { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(ETH, brutMin - fraisExact) }];
      valeur = 0n;
      resume = { paye: m, payeDevise: 'block', recoitAuMoins: brutMin - fraisExact, recoitDevise: 'ETH', quote, frais: fraisExact, fraisDevise: 'ETH',
        montantSwap: m, rachatAuto: true, tblockRachetesAuMoins: minT };
    }
  }
  if (actions) {
    /* le second swap est encode maintenant que la forme de struct sera connue — voir plus bas */
  } else if (sens === 'ACHAT') {
    const min = (quote * (10000n - tol)) / 10000n;
    actions = bps > 0n
      ? [{ code: ACTIONS_V4.SETTLE, params: paramsAction.settle(ETH, m, true) },
        { code: ACTIONS_V4.TAKE, params: paramsAction.take(ETH, FEE_WALLET, fraisAchat) },
        { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(jeton, min) }]
      : [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(ETH, m) },
        { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(jeton, min) }];
    valeur = m;
    resume = { paye: m, payeDevise: 'ETH', recoitAuMoins: min, recoitDevise: 'block', quote, frais: fraisAchat, fraisDevise: 'ETH', montantSwap: netAchat };
  } else {
    const fraisVente = (quote * bps) / 10000n;
    const min = ((quote - fraisVente) * (10000n - tol)) / 10000n;
    actions = [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(jeton, m) },
      ...(bps > 0n ? [{ code: ACTIONS_V4.TAKE_PORTION, params: paramsAction.takePortion(ETH, FEE_WALLET, bps) }] : []),
      { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(ETH, min) }];
    valeur = 0n;
    resume = { paye: m, payeDevise: 'block', recoitAuMoins: min, recoitDevise: 'ETH', quote, frais: fraisVente, fraisDevise: 'ETH', montantSwap: m };
  }
  resume.fraisBps = bps;
  resume.beneficiaireFrais = bps > 0n ? FEE_WALLET : null;
  resume.fraisMarcheBps = hookPaieDeja ? 300 : null;
  const koFrais = assertFraisInterfaceA6cf({ compte, bps, resume, actions, hookPaie, assietteHook: sens === 'ACHAT' ? m : quote });
  if (koFrais) return { etat: 'REFUSE', pourquoi: 'Buy/Sell fee path broken: ' + koFrais, resume };
  return finaliser({ lire, R, compte, jeton, sens, m, maintenant, deadline, actions, valeur, resume, cle, zeroForOne, sortieMinTete: 0n });
}

/**
 * Route a deux sauts pour un block dont le marche est TBLOCK/block.
 * tip 20260922-2026: interface fee ALWAYS lands as ETH at FEE_WALLET (never TBLOCK/TBGAS TAKE).
 *  · ACHAT: SETTLE ETH total, TAKE ETH fee, head-swap net ETH→TBLOCK, then TBLOCK→block.
 *  · VENTE: block→TBLOCK→ETH, TAKE_PORTION ETH fee, TAKE_ALL remaining ETH to user.
 */
async function routeViaTblock({ lire, Q, V, marche, jeton, sens, m, tol, bps }) {
  let mt;
  try { mt = await vieDuBlock({ rpc: lire, stateView: V.stateView, jeton: TBLOCK }); } catch { mt = { etat: 'NON_LUE' }; }
  if (mt.etat !== 'LUE' || !mt.cle || String(mt.cle.currency0).toLowerCase() !== ETH) {
    return { etat: 'NON_MESURE', pourquoi: 'this block trades against TBLOCK, and the TBLOCK/ETH market could not be read' };
  }
  const cleB = marche.cle, cleT = mt.cle;
  /* ⛔⛔ 2026-10-02 (regle du fondateur) : les DEUX jambes doivent porter un hook — la jambe TBLOCK/ETH comprise. */
  if (indexPoolSansHookInterdite([cleT, cleB], [jeton]) >= 0) return { etat: 'REFUSE', pourquoi: MESSAGE_SANS_POOL, refusSansHook: true };
  /* ⛔ 2026-10-02 : le frais ETH se prend sur la jambe TBLOCK/ETH ; si SON hook verse deja a6cf, rien de plus. */
  const hookPaie = hookPaieJambeTblock(cleT, sens);
  if (hookPaie) bps = 0n;
  const tblockEst0 = String(cleB.currency0).toLowerCase() === TBLOCK.toLowerCase();
  const saut1 = sens === 'ACHAT' ? { cle: cleT, zeroForOne: true } : { cle: cleB, zeroForOne: !tblockEst0 };
  const saut2 = sens === 'ACHAT' ? { cle: cleB, zeroForOne: tblockEst0 } : { cle: cleT, zeroForOne: false };
  const moinsTol = (x) => (x * (10000n - tol)) / 10000n;
  if (sens === 'ACHAT') {
    const { frais, net } = fraisSur(m, bps);
    let t, sortie;
    try {
      t = BigInt('0x' + String(await lire('eth_call', [{ to: Q, data: encodeQuote({ ...saut1, montant: net }) }, 'latest'])).slice(2, 66));
      if (t <= 0n) return { etat: 'REFUSE', pourquoi: 'the first pool returns nothing for this amount' };
      sortie = BigInt('0x' + String(await lire('eth_call', [{ to: Q, data: encodeQuote({ ...saut2, montant: t }) }, 'latest'])).slice(2, 66));
    } catch (e) {
      return { etat: 'NON_MESURE', pourquoi: 'the price could not be quoted: ' + String((e && e.message) || e).slice(0, 120) };
    }
    if (sortie <= 0n) return { etat: 'REFUSE', pourquoi: 'the second pool returns nothing for this amount' };
    const min = moinsTol(sortie);
    const actions = [
      { code: ACTIONS_V4.SETTLE, params: paramsAction.settle(ETH, m, true) },
      ...(bps > 0n ? [{ code: ACTIONS_V4.TAKE, params: paramsAction.take(ETH, FEE_WALLET, frais) }] : []),
      { code: ACTIONS_V4.SWAP_EXACT_IN_SINGLE, params: '__SWAP__', swap: { ...saut2, montant: 0n, sortieMin: 0n } },
      { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(jeton, min) }];
    const resume = { paye: m, payeDevise: 'ETH', recoitAuMoins: min, recoitDevise: 'block',
      quote: sortie, frais, fraisDevise: 'ETH', montantSwap: net, via: 'TBLOCK',
      fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null };
    return { actions, valeur: m, resume, cle: saut1.cle, zeroForOne: saut1.zeroForOne, sortieMinTete: moinsTol(t), bps, hookPaie, assietteHook: m };
  }
  /* VENTE: fee in ETH from the final hop */
  let t, sortie;
  try {
    t = BigInt('0x' + String(await lire('eth_call', [{ to: Q, data: encodeQuote({ ...saut1, montant: m }) }, 'latest'])).slice(2, 66));
    if (t <= 0n) return { etat: 'REFUSE', pourquoi: 'the first pool returns nothing for this amount' };
    sortie = BigInt('0x' + String(await lire('eth_call', [{ to: Q, data: encodeQuote({ ...saut2, montant: t }) }, 'latest'])).slice(2, 66));
  } catch (e) {
    return { etat: 'NON_MESURE', pourquoi: 'the price could not be quoted: ' + String((e && e.message) || e).slice(0, 120) };
  }
  if (sortie <= 0n) return { etat: 'REFUSE', pourquoi: 'the second pool returns nothing for this amount' };
  const fraisVente = (sortie * bps) / 10000n;
  const min = ((sortie - fraisVente) * (10000n - tol)) / 10000n;
  const actions = [
    { code: ACTIONS_V4.SWAP_EXACT_IN_SINGLE, params: '__SWAP__', swap: { ...saut2, montant: 0n, sortieMin: 0n } },
    { code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(jeton, m) },
    ...(bps > 0n ? [{ code: ACTIONS_V4.TAKE_PORTION, params: paramsAction.takePortion(ETH, FEE_WALLET, bps) }] : []),
    { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(ETH, min) }];
  const resume = { paye: m, payeDevise: 'block', recoitAuMoins: min, recoitDevise: 'ETH',
    quote: sortie, frais: fraisVente, fraisDevise: 'ETH', montantSwap: m, via: 'TBLOCK',
    fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null };
  return { actions, valeur: 0n, resume, cle: saut1.cle, zeroForOne: saut1.zeroForOne, sortieMinTete: moinsTol(t), bps, hookPaie, assietteHook: sortie };
}

/** Approbations mesurees (vente), forme de struct demandee a la chaine, encodage, simulation de la transaction exacte. */
async function finaliser({ lire, R, compte, jeton, sens, m, maintenant, deadline, actions, valeur, resume, cle, zeroForOne, sortieMinTete,
  jetonPaye = null, valeurEth = null }) {
  /* ── les deux autorisations Permit2 sur le jeton PAYE (le block a la vente ; la devise ERC-20 a l achat), MESUREES ── */
  const etapes = [];
  const paye = jetonPaye || (sens === 'VENTE' ? jeton : null);
  if (paye) {
    const jeton = paye; // la suite du bloc lit et autorise CE jeton
    let okP2, okR;
    try {
      okP2 = BigInt(await lire('eth_call', [{ to: jeton, data: '0x' + selecteur('allowance(address,address)') + pad(compte) + pad(PERMIT2) }, 'latest'])) >= m;
      const raw = String(await lire('eth_call', [{ to: PERMIT2, data: '0x' + selecteur('allowance(address,address,address)') + pad(compte) + pad(jeton) + pad(R) }, 'latest']));
      const montantP2 = BigInt('0x' + raw.slice(2, 66));
      const expiration = BigInt('0x' + raw.slice(66, 130));
      okR = montantP2 >= m && expiration > BigInt(Math.floor(maintenant / 1000) + 60);
    } catch (e) {
      return { etat: 'NON_MESURE', pourquoi: 'an approval could not be read', resume };
    }
    if (!okP2) etapes.push({ nom: 'Allow Permit2 to move this block', to: jeton, data: encodeApprove(PERMIT2, MAX_UINT256), value: '0x0' });
    if (!okR) etapes.push({ nom: 'Allow the Uniswap router (through Permit2)', to: PERMIT2, data: encodePermit2Approve(jeton, R, MAX_UINT160, MAX_UINT48), value: '0x0' });
    if (etapes.length) return { etat: 'APPROBATIONS', etapes, resume, cle, pourquoi: null };
  }

  /* ── la chaine dit quelle forme de struct elle accepte, puis on simule la transaction EXACTE ── */
  const appelBrut = (demande) => appelOuErreur(lire, demande);
  const enEth = valeurEth === null ? sens === 'ACHAT' : valeurEth;
  const f = await formeAcceptee({ appelBrut, ur: R, de: compte, cle, zeroForOne, montant: resume.montantSwap, deadline,
    value: enEth ? '0x' + resume.montantSwap.toString(16) : undefined });
  if (f.forme === null) {
    /* ⛔ capture de Phil (Rabby mobile) : « the router refuses this swap: {"avecMinHop":"EVM error: OutOfFunds",…} » — il
     *    voulait acheter 0.001 ETH avec 0.00085 ETH. La cause se dit en clair ; le reste garde le detail technique. */
    const brut = jsonSafe(f.causes);
    const sansFonds = /OutOfFunds|insufficient funds|exceeds balance/i.test(brut);
    return { etat: f.transport ? 'NON_MESURE' : 'REFUSE', resume, cle,
      pourquoi: f.transport ? 'the node refused the check — try again'
        : sansFonds ? 'not enough ' + (enEth ? 'ETH' : 'funds') + ' in your wallet for this amount plus gas — try a smaller amount'
          : 'the router refuses this swap: ' + brut.slice(0, 160) };
  }
  /* ⛔⛔ MESURE SUR FORK (2026-09-13, route via TBLOCK) : la forme sondee sur UN swap ne vaut pas pour les suivants —
   *    « avecMinHop » passait sur ETH -> TBLOCK et revertait SANS DONNEE sur TBLOCK -> block, ou « sansMinHop » passait.
   *    Des qu il y a un second swap, la forme se choisit sur la TRANSACTION EXACTE : la sondee d abord, puis l autre. */
  const construire = (forme) => {
    const actionsEncodees = actions.map((a) => (a.params === '__SWAP__'
      ? { code: a.code, params: paramsSwapExactInSingle({ ...a.swap, forme }) }
      : a));
    /* ⛔ 2026-10-02 : part referrer o1 (0,20 % des 1 % deja payes) -> a6cf. '' tant que le drapeau est OFF. */
    const hookData = hookDataReferentO1({ cle });
    const data = encodeV4Swap({ cle, zeroForOne, montant: resume.montantSwap, sortieMin: sortieMinTete, deadline, forme, actions: actionsEncodees, hookData });
    return { to: R, data, value: '0x' + valeur.toString(16) };
  };
  const formes = actions.some((a) => a.params === '__SWAP__')
    ? [f.forme, f.forme === AVEC_MINHOP ? SANS_MINHOP : AVEC_MINHOP] : [f.forme];
  let refus = null;
  for (const forme of formes) {
    const tx = construire(forme);
    const sim = await appelOuErreur(lire, { from: compte, ...tx });
    if (!sim.error) return { etat: 'PRET', etapes: [], tx, resume, cle, forme, pourquoi: null };
    refus = sim.error;
  }
  return { etat: 'REFUSE', resume, cle, pourquoi: 'the chain refuses this exact transaction: ' + refus.message.slice(0, 160) };
}

/**
 * LA MEILLEURE POOL V4 POUR UNE PAIRE, A CE MONTANT — et la DIRECTION qui va avec.
 *
 * @param {function} p.rpc        le lecteur, injecte (donc testable hors reseau)
 * @param {number}   p.chaine
 * @param {string}   p.de         le jeton qu on PAIE
 * @param {string}   p.vers       le jeton qu on VEUT
 * @param {bigint}   p.montant    en unites du jeton paye
 * @param {object[]} [p.candidates]  les combinaisons fee/tickSpacing a essayer
 *
 * ⛔⛔⛔ LA DIRECTION EST DERIVEE DE LA PAIRE, JAMAIS SUPPOSEE. Une PoolKey classe ses deux jetons
 *   par ordre d adresse : `zeroForOne` est donc vrai si et seulement si le jeton PAYE est
 *   `currency0`. Le code d ou vient cette fonction CALCULAIT cette valeur puis passait `true` en
 *   dur — ce qui etait juste uniquement parce que l ETH vaut `0x000...0` et gagne donc toujours le
 *   classement. Une garde correcte par accident d une valeur particuliere. Sur OUSD/USDC, le `true`
 *   en dur serait FAUX dans un sens sur deux, et le swap irait a l envers.
 *
 * ⛔⛔ « ESSAYEES » ET « COTEES » SONT DEUX CHIFFRES DIFFERENTS. Le premier dit combien de
 *   combinaisons on a tapees, le second combien ont REPONDU. Les confondre ferait lire « 4 pools
 *   existent » la ou on a seulement frappe quatre fois dans le vide — la confusion exacte qui a
 *   deja rendu 49,8 % du volume invisible ici.
 * ⛔ UN DEVIS DE ZERO N EST PAS UN DEVIS. Le retenir ferait construire un ordre dont le minimum de
 *   sortie est nul, c est-a-dire un ordre qui accepte de tout perdre. C est le motif
 *   « Number(null) = 0 » qui a deja fait passer un glissement non mesure pour un marche parfait.
 * ⛔ UNE POOL QUI LEVE N ARRETE PAS LE BALAYAGE : l absence d une combinaison ne dit rien des
 *   autres, et s arreter au premier echec rendrait « aucune pool » sur un simple trou.
 *
 * ⚠️ SA BORNE, ECRITE ICI PARCE QU ELLE SE LIT MAL AILLEURS : `CLES_PRIX` ne porte que QUATRE
 *   combinaisons, toutes SANS hook. Une pool hookee, ou a un tickSpacing hors de ces quatre, ne
 *   sera pas trouvee — et ca ne veut pas dire qu elle n existe pas, ca veut dire qu on n a pas
 *   regarde. Le resultat ne doit jamais se lire « il n y a pas de pool ».
 */
export async function meilleureClePourMontant({ rpc, chaine, de, vers, montant, candidates = CLES_PRIX } = {}) {
  const Q = QUOTEUR[Number(chaine)];
  const adr = (x) => String(x || '').toLowerCase();
  const estAdr = (x) => /^0x[0-9a-f]{40}$/.test(adr(x));
  if (!Q) return { etat: 'REFUSE', cle: null, pourquoi: 'no v4 quoter on this network here' };
  if (!estAdr(de) || !estAdr(vers)) {
    return { etat: 'REFUSE', cle: null, pourquoi: 'both tokens must be whole addresses' };
  }
  if (adr(de) === adr(vers)) {
    return { etat: 'REFUSE', cle: null, pourquoi: 'the two tokens are the same' };
  }
  let m;
  try { m = BigInt(montant); } catch (_) { m = 0n; }
  if (m <= 0n) return { etat: 'REFUSE', cle: null, pourquoi: 'the amount must be above zero' };

  const liste = Array.isArray(candidates) ? candidates : [];
  let best = null, cotees = 0;
  for (const k of liste) {
    const cle = cleDePool(adr(de), adr(vers), k);
    const zeroForOne = adr(cle.currency0) === adr(de);
    let quote;
    try {
      const r = await rpc('eth_call', [{ to: Q, data: encodeQuote({ cle, zeroForOne, montant: m }) }, 'latest']);
      quote = BigInt('0x' + String(r).slice(2, 66));
    } catch (_) {
      continue; /* ⛔ une combinaison absente ne dit rien des autres */
    }
    if (quote <= 0n) continue;
    cotees += 1;
    if (!best || quote > best.quote) {
      best = { cle, zeroForOne, quote, fee: k.fee, tickSpacing: k.tickSpacing };
    }
  }
  if (!best) {
    return { etat: 'NON_MESURE', cle: null, zeroForOne: null, quote: null,
      essayees: liste.length, cotees,
      pourquoi: 'no v4 pool among the ' + liste.length + ' tried combinations quoted this pair at this '
        + 'size — that is what we looked at, not proof that none exists' };
  }
  return { etat: 'OK', ...best, essayees: liste.length, cotees, pourquoi: null };
}

/**
 * ETH → USDC on Base v4 — same 0.5% interface fee → FEE_WALLET.
 * ⛔ HARD OBJECTIVE: exit conversion that still pays FEE_WALLET (external DEX pays 0). tip 2220 → smart wallet a6cf….
 * ⛔ Fail-closed: no Sign unless Quoter returns >0 on a measured ETH/USDC key (CLES_PRIX).
 */
export async function planEthVersUsdc({ rpc, chaine, compte, montantWei, toleranceBps = 100n, maintenant = Date.now() }) {
  const R = ROUTEUR[Number(chaine)], Q = QUOTEUR[Number(chaine)], V = V4_ADRESSES[Number(chaine)];
  if (!R || !Q || !V) return { etat: 'REFUSE', pourquoi: 'no Uniswap router on this network here' };
  if (Number(chaine) !== 8453) return { etat: 'REFUSE', pourquoi: 'ETH→USDC exit is Base mainnet only here' };
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(compte || ''))) return { etat: 'REFUSE', pourquoi: 'connect your wallet first' };
  const m = BigInt(montantWei);
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'enter an ETH amount above zero' };
  const tol = BigInt(toleranceBps);
  if (tol < 0n || tol >= 10000n) return { etat: 'REFUSE', pourquoi: 'slippage out of range' };
  const lire = rpc;
  const bps = estWalletDeFrais(compte) ? 0n : FRAIS_INTERFACE_BPS;
  const { frais: fraisAchat, net: netAchat } = fraisSur(m, bps);
  const deadline = BigInt(Math.floor(maintenant / 1000) + 1200);

  /* ⛔⛔ CE BALAYAGE VIT MAINTENANT DANS `meilleureClePourMontant`, et ce n est pas une
   *   reorganisation de confort : la MEME logique est necessaire au rail multi-sauts pour resoudre
   *   la jambe USDC <-> ETH, et en ecrire un second exemplaire ferait DEUX resolveurs qui
   *   divergeraient — le motif « helper canonique et sa copie plus faible », deja paye ici.
   * ⛔⛔⛔ ET L EXTRACTION A SORTI UN DEFAUT DORMANT : ce code CALCULAIT `zeroForOne` puis passait
   *   `true` EN DUR au quoter. La valeur calculee etait jetee. Le `true` n etait juste que parce
   *   que l ETH vaut `0x000...0` et se classe donc TOUJOURS en `currency0` — une garde correcte
   *   PAR ACCIDENT d une valeur particuliere. Inoffensif tant que cette fonction ne servait qu a
   *   l ETH ; faux une fois sur deux des qu on la reutilise sur une paire quelconque, ce qui est
   *   exactement ce qu on fait maintenant. Le helper DERIVE la direction, et son test exige que
   *   les deux sens DIFFERENT. */
  const best = await meilleureClePourMontant({ rpc: lire, chaine, de: ETH, vers: USDC_BASE, montant: netAchat });
  if (best.etat !== 'OK') {
    return { etat: 'NON_MESURE', pourquoi: 'no ETH/USDC v4 pool quoted for this size — try again or a smaller amount' };
  }
  const min = (best.quote * (10000n - tol)) / 10000n;
  if (min <= 0n) return { etat: 'REFUSE', pourquoi: 'the pool returns nothing for this amount' };

  const actions = bps > 0n
    ? [{ code: ACTIONS_V4.SETTLE, params: paramsAction.settle(ETH, m, true) },
      { code: ACTIONS_V4.TAKE, params: paramsAction.take(ETH, FEE_WALLET, fraisAchat) },
      { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(USDC_BASE, min) }]
    : [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(ETH, m) },
      { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(USDC_BASE, min) }];
  const resume = {
    paye: m, payeDevise: 'ETH', recoitAuMoins: min, recoitDevise: 'USDC', quote: best.quote,
    frais: fraisAchat, fraisDevise: 'ETH', montantSwap: netAchat,
    fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null,
    via: 'ETH/USDC · fee ' + best.fee, usdcExit: true,
  };
  const koFrais = assertFraisInterfaceA6cf({ compte, bps, resume, actions });
  if (koFrais) return { etat: 'REFUSE', pourquoi: 'Buy/Sell fee path broken: ' + koFrais, resume };
  return finaliser({
    lire, R, compte, jeton: USDC_BASE, sens: 'ACHAT', m, maintenant, deadline,
    /* ⛔ `best.zeroForOne` ET PLUS `true` EN DUR : la valeur est DERIVEE de la paire. Elle vaut
     *   `true` ici — l ETH est `0x0`, donc toujours `currency0` — donc le comportement est
     *   IDENTIQUE. C est voulu : une extraction qui change le resultat n est pas une extraction,
     *   c est un changement deguise en refactor. Ce qui change, c est qu elle cesse d etre juste
     *   par accident. */
    actions, valeur: m, resume, cle: best.cle, zeroForOne: best.zeroForOne, sortieMinTete: 0n,
  });
}

/**
 * UNE ROUTE V4 DE 2 A 4 SAUTS, EN UNE TRANSACTION — pour atteindre ce qu un seul saut n atteint pas.
 *
 * ⭐ LE CAS QUI L A FAIT NAITRE, prouve par un devis REEL le 2026-10-01 :
 *       100 OUSD -> 99,987552 USDC -> 328 166 unites NVDAc
 *   Deux sauts, Uniswap V4, fee 100 / ts 1. Une seule factory, donc UN appel.
 *   ⛔ ET LA BORNE : 1 action sur 15 est atteignable ainsi (`USDC/<action>` en V4 = 1/15,
 *     `ETH/<action>` = 0/15). Les 14 autres sont sur Aerodrome, ou OUSD n a RIEN — il faudrait un
 *     lot atomique de DEUX routeurs, qu une part IMPORTANTE des wallets ne tient pas (le chiffre exact n est PAS etabli : voir la borne dans frais-hors-routeur.js).
 *
 * ⛔⛔ POINT D ENTREE SEPARE, DELIBEREMENT. `planEchange` fonctionne et porte de l argent : on
 *   AJOUTE un chemin, on ne modifie pas celui qui marche. Une regression sur `planEchange` coute
 *   tous les echanges ; un bug ici ne coute que ce chemin-ci, et il refuse plutot que de construire.
 *
 * ⛔ LES SAUTS ARRIVENT DEJA RESOLUS (`{ cle, zeroForOne }`), et c est voulu : la DECOUVERTE des
 *   pools est un autre probleme — une cle devinee ne trouve pas une pool hookee, et j ai deja paye
 *   cette cecite deux fois aujourd hui. L appelant les lit ; cette fonction les cote et construit.
 */
export async function planEchangeMultiSauts({ rpc, chaine, compte, sauts, entree, sortie, montant,
  toleranceBps = 100n, maintenant = Date.now(), fraisDevisesOk = null,
  /* ⛔ LES DECIMALES ET LE PRIX DE LA DEVISE D ENTREE SONT LUS PAR L APPELANT, pas supposes ici :
   *   ils servent a situer le montant dans le bareme degressif. 18 par defaut serait un pari — et
   *   OUSD en a SIX. Sans PRIX, le bareme applique le taux le plus haut et le dit. */
  decimalesEntree = 18, prixUsdEntree = null }) {
  const R = ROUTEUR[Number(chaine)], Q = QUOTEUR[Number(chaine)];
  if (!R || !Q) return { etat: 'REFUSE', pourquoi: 'no Uniswap router on this network here' };
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(compte || ''))) {
    return { etat: 'REFUSE', pourquoi: 'connect your wallet first' };
  }
  if (!Array.isArray(sauts) || sauts.length < SAUTS_MIN || sauts.length > SAUTS_MAX) {
    return { etat: 'REFUSE',
      pourquoi: 'between ' + SAUTS_MIN + ' and ' + SAUTS_MAX + ' resolved hops are required' };
  }
  const m = BigInt(montant);
  if (m <= 0n) return { etat: 'REFUSE', pourquoi: 'enter an amount above zero' };
  const tol = BigInt(toleranceBps);
  if (tol < 0n || tol >= 10000n) return { etat: 'REFUSE', pourquoi: 'slippage out of range' };
  const lire = rpc;
  /* ⛔⛔ CE RAIL PREND 0,1 % PAR TRANSACTION, pas les 0,5 % du chemin in-app historique — decision
   *   de Phil (2026-10-01), et le taux est LU dans `pont-de-liquidite.js` au lieu d etre tape ici.
   *   ⛔ ET C EST PROPORTIONNEL, PAS FIXE : 0,1 % de 100 OUSD fait 0,1 OUSD, de 10 000 OUSD fait
   *     10 OUSD. Un frais FIXE serait confiscatoire en bas (5 % sur un echange de 10) et
   *     negligeable en haut — c est la confusion que le test de 100 OUSD avait rendue possible,
   *     puisque 0,1 % de 100 vaut justement 0,1.
   *   ⛔ LE CHEMIN HISTORIQUE N EST PAS TOUCHE : `planEchange` garde ses 0,5 %. Deux rails, deux
   *     taux, et c est explicite — baisser le chemin existant aurait coupe un revenu qui existe. */
  /* ⛔⛔ 2026-10-02 (regle du fondateur) : aucun saut sur une pool sans hook qui contient un block TB (entree, sortie,
   *   TBLOCK, TBGAS). Les jambes entre devises (ETH/USDC…) restent permises. */
  if (REFUS_FRAIS_HOOK_EN_BLOCK && sauts.some((x) => x && x.cle && [entree, sortie].some((j) => /^0xb2/i.test(String(j || ''))
    && fraisHookEnBlock(x.cle, j, x.zeroForOne ? 'ACHAT' : 'VENTE', !!x.zeroForOne)))) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusFraisEnBlock: true };
  }
  if (!ROUTE_VIA_TBLOCK && sauts.some((x) => x && cleTouchTblock(x.cle))) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_SANS_POOL, refusTblock: true };
  }
  if (indexPoolSansHookInterdite(sauts.map((x) => x && x.cle), [entree, sortie]) >= 0) {
    return { etat: 'REFUSE', pourquoi: MESSAGE_SANS_POOL, refusSansHook: true };
  }
  const deadline = BigInt(Math.floor(maintenant / 1000) + 1200);
  /* ⛔⛔ LE BAREME EST DEGRESSIF : 0,2 % jusqu a 100 $, 0,1 % au-dela — decision de Phil
   *   (2026-10-01), dans sa derniere formulation : « fait comme il a de mieux pour peu taxer donc
   *   le 0.1 % 0.2 % et ca soit rentable pour dev ».
   *   ⛔ CE COMMENTAIRE ANNONCAIT ENCORE « PLANCHER 50 bps » ET UN PALIER A 1 700 $, ecrits quand
   *     Phil avait dit « mini 50 bps » — une version du bareme que le code a quittee. Le seul
   *     palier reel est 100 $. Un commentaire qui survit a la decision qu il decrit est pire
   *     qu aucun commentaire : c est lui qu on croit en relisant.
   *   ⛔ ET LE PALIER VIENT DE LA DISTRIBUTION MESUREE, pas d un nombre rond : p75 = 95,94 $ sur
   *     les 250 lignes servies le 2026-10-01. Les trois quarts des echanges paient donc 0,2 %.
   *   ⛔ SANS PRIX LU POUR LA DEVISE D ENTREE, `frais-degressif.js` applique le taux LE PLUS HAUT et
   *     le DIT : le doute nous coute un revenu potentiel sur les gros montants, jamais une surprise
   *     a l utilisateur, et jamais une sous-facturation sur une supposition.
   *   ⛔ ET LE MONTANT EXACT EST IMPOSE A L ASSEMBLEUR, pas recalcule : le plancher fait que le
   *     frais ne vaut PAS `montant * bps / 10000`, et recalculer donnerait deux chiffres pour le
   *     meme prelevement — celui annonce et celui preleve. */
  let frais = 0n, bps = 0n, degressif = null;
  /* ⛔ 2026-10-02 : le frais se prend sur la jambe d ENTREE (saut 1). Si cette pool est une pool ETH dont
   *   le hook verse deja a6cf dans ce sens, le routeur ne prend rien : un frais par jambe. */
  const s1 = sauts[0] || {};
  /* ⛔ 2026-10-02 (fix-2) : la devise du hook decide, plus currency0 === ETH. Debloque la sortie block -> USDC -> ETH :
   *   le V8 y paie en USDC sur le saut 1, et le routeur ne prenait son frais qu en block (refuse). */
  const hookS1 = s1.cle ? hookPaieEnDeviseVendable({ cle: s1.cle, sens: s1.zeroForOne ? 'ACHAT' : 'VENTE',
    zeroForOne: !!s1.zeroForOne, fraisDevisesOk }) : { paie: false, devise: null };
  /* ⛔ 2026-10-02 14:49 — CHAQUE JAMBE. Le saut 1 paye par son hook ne dispense PAS une jambe suivante sans hook payeur
   *   (pool sans hook, hook qui ne verse rien) : le routeur ne s efface que si TOUS les sauts paient deja a6cf. */
  const jambesPayees = sauts.map((x) => !!(x && x.cle) && hookPaieEnDeviseVendable({ cle: x.cle, sens: x.zeroForOne ? 'ACHAT' : 'VENTE',
    zeroForOne: !!x.zeroForOne, fraisDevisesOk }).paie);
  const hookPaie = hookS1.paie && jambesPayees.every(Boolean);
  if (!estWalletDeFrais(compte) && !hookPaie) {
    degressif = fraisPourMontant({ montant: m, decimales: decimalesEntree, prixUsd: prixUsdEntree });
    if (degressif.etat !== 'OK') {
      return { etat: 'REFUSE', pourquoi: 'fee could not be priced: ' + (degressif.pourquoi || 'unknown') };
    }
    frais = degressif.frais;
    /* ⛔ LE TAUX QU ON DECLARE EST L EFFECTIF, celui qu on prend REELLEMENT — plancher compris. Le
     *   taux du palier serait faux des que le plancher joue, et le garde `assertFraisInterfaceA6cf`
     *   verifie justement la coherence entre ce taux et le TAKE. */
    bps = BigInt(degressif.bpsEffectif === null ? degressif.bps : degressif.bpsEffectif);
  }
  const net = m - frais;
  const moinsTol = (x) => (x * (10000n - tol)) / 10000n;

  /* ── LE DEVIS, SAUT PAR SAUT : la sortie de l un est l entree du suivant ────────────────────
   * ⛔⛔ UNE LECTURE RATEE N EST PAS UN PRIX NUL. Une limite de debit qui rendrait 0 ferait croire
   *   a une pool vide, et on refuserait une route vivante — ou pire, on construirait sur un
   *   minimum faux. On distingue donc NON_MESURE de REFUSE, et on NOMME le saut.
   * ⛔ ET LE PREMIER SAUT PART DU NET : le frais est retenu AVANT, donc le coter sur le total
   *   promettrait plus que ce qui sera reellement echange. */
  const sorties = [];
  let courant = net;
  for (const [i, s] of sauts.entries()) {
    let brut;
    try {
      brut = await lire('eth_call', [{ to: Q, data: encodeQuote({ ...s, montant: courant }) }, 'latest']);
    } catch (e) {
      return { etat: 'NON_MESURE',
        pourquoi: 'hop ' + (i + 1) + ' could not be quoted: ' + String((e && e.message) || e).slice(0, 120) };
    }
    let out;
    try { out = BigInt('0x' + String(brut).slice(2, 66)); } catch (_) { out = 0n; }
    if (out <= 0n) {
      return { etat: 'REFUSE', pourquoi: 'hop ' + (i + 1) + ' returns nothing for this amount' };
    }
    sorties.push(out);
    courant = out;
  }
  const sortieFinale = sorties[sorties.length - 1];
  const minFinal = moinsTol(sortieFinale);
  /* ⛔ UN MINIMUM QUI TOMBE A ZERO N EST PAS UN MINIMUM : il laisserait passer n importe quelle
   *   sortie. Ca arrive sur de tres petits montants, et c est un refus, pas un detail. */
  if (minFinal <= 0n) {
    return { etat: 'REFUSE', pourquoi: 'the amount is too small for a meaningful minimum on the output' };
  }

  /* ⛔ LE MONTANT EXACT EST IMPOSE, PAS RECALCULE : le plancher monotone du bareme fait que le frais
   *   ne vaut PAS `montant * bps / 10000`. Le recalculer donnerait deux chiffres pour le meme
   *   prelevement — celui annonce a l ecran et celui reellement pris. */
  const route = actionsMultiSauts({ sauts, entree, sortie, montant: m, minSortie: minFinal, bps,
    fraisImpose: frais,
    beneficiaireFrais: frais > 0n ? FEE_WALLET : null, actionsV4: ACTIONS_V4, paramsAction });
  if (!routePrete(route)) {
    return { etat: 'REFUSE', pourquoi: route.pourquoi || 'this route could not be assembled' };
  }
  const enEth = route.fraisDevise === 'ETH';
  const resume = {
    paye: m, payeDevise: enEth ? 'ETH' : 'token',
    recoitAuMoins: minFinal, recoitDevise: 'token',
    quote: sortieFinale, montantSwap: route.montantTete,
    frais, fraisDevise: route.fraisDevise, devise: route.devise,
    via: 'V4_' + sauts.length + '_SAUTS', sauts: sauts.length,
    fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null,
  };
  /* ⛔⛔ LE VERROU DE LA DEVISE DE FRAIS EST CELUI D ICI, PAS UNE SECONDE REGLE. `route-v4-multi-sauts`
   *   NOMME la devise, il ne la juge pas : `assertFraisInterfaceA6cf` decide, et il n admet ETH,
   *   USDC, ou une devise dont L APPELANT A LU LE PRIX. a6cf a deja ete paye en jetons invendables
   *   (7 detentions, part reelle 0 $) — c est ce verrou qui l empeche de recommencer. */
  /* ⛔ `bpsAttendu` EST LE TAUX EFFECTIF DE CE RAIL, pas les 50 bps du chemin historique. Le garde
   *   verifie donc exactement ce qu on a declare — beneficiaire, devise vendable et presence d un
   *   TAKE vers a6cf restent inchanges. Le defaut du parametre reste le plus strict. */
  const koFrais = assertFraisInterfaceA6cf({ compte, bps, resume, actions: route.actions,
    fraisDevisesOk, bpsAttendu: bps, hookPaie,
    assietteHook: hookPaie ? (hookS1.devise === String(entree).toLowerCase() ? m : sorties[0]) : null });
  /* ⛔ 2026-10-02 (Zero 1) : le texte montre est « Not tradable here yet », jamais le jargon du verrou ;
   *   la raison exacte reste dans `causeInterne` (diagnostic, tests), elle n est pas affichee. */
  if (koFrais) return { etat: 'REFUSE', pourquoi: MESSAGE_PAS_ICI, refusCheminFrais: true, causeInterne: 'fee path broken: ' + koFrais, resume };

  /* ⛔ `sortieMinTete` BORNE LE PREMIER SAUT, et seulement lui : les suivants sont a 0 (OPEN_DELTA),
   *   et le minimum qui protege l acheteur est celui du TAKE_ALL final, deja dans les actions. */
  return finaliser({
    lire, R, compte, jeton: sortie, sens: 'ACHAT', m, maintenant, deadline,
    actions: route.actions, valeur: route.valeur, resume,
    cle: route.cle, zeroForOne: route.zeroForOne, sortieMinTete: moinsTol(sorties[0]),
    /* ⛔ LE JETON PAYE DECLENCHE LES AUTORISATIONS PERMIT2. Nul quand on paie en ETH natif : il n y
     *   a rien a autoriser, et en demander une bloquerait l achat sur une etape inutile. */
    jetonPaye: enEth ? null : entree,
    valeurEth: enEth,
  });
}

