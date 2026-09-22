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
import { TBLOCK, HOOK_PREVU, estNotreHook } from './tokenomics.js';
import { encodeV4Swap, encodeQuote, formeAcceptee, paramsAction, paramsSwapExactInSingle, ACTIONS_V4, selecteur,
  encodeApprove, encodePermit2Approve, MAX_UINT256, MAX_UINT160, MAX_UINT48, AVEC_MINHOP, SANS_MINHOP, cleDePool } from './pool.js';
import { vieDuBlock } from './marche.js';
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
function assertFraisInterfaceA6cf({ compte, bps, resume, actions }) {
  if (estWalletDeFrais(compte)) return null; /* le tresor ne se facture pas lui-meme */
  if (bps !== FRAIS_INTERFACE_BPS) return 'interface fee bps missing (want 50)';
  if (String(resume && resume.beneficiaireFrais || '').toLowerCase() !== FEE_WALLET.toLowerCase()) {
    return 'fee beneficiary is not the configured fee wallet';
  }
  const asset = String(resume && resume.fraisDevise || '');
  const pairIsUsdc = asset === 'pair'
    && String(resume && resume.devise || '').toLowerCase() === USDC_BASE.toLowerCase();
  if (asset !== 'ETH' && asset !== 'USDC' && !pairIsUsdc) {
    return 'fee asset must be ETH or USDC (not block tokens / TBGAS / TBLOCK)';
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
  if (!takeEth && !takeUsdc) return 'fee TAKE/TAKE_PORTION must be ETH or USDC to the fee wallet';
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
  marcheLu = null, cleImposee = null }) {
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
  /* tip 20260922-2023: ALWAYS take interface 0.5% → FEE_WALLET on in-app Buy/Sell (unless fee-wallet buyback).
   *    Prior skip when estNotreHook assumed hook TAKE ~3% already hit a6cf — live dig 2026-09-22: sink got 0
   *    from Buy/Sell volume (hooked path skipped interface AND hook was not depositing). Stacked fees
   *    (hook chop + 0.5% interface) beat zero fees. hooked Dex may add hook chop on top. Birth=V8 only. */
  const hookPaieDeja = !!(marche.cle && estNotreHook(marche.cle.hooks));
  const bps = estWalletDeFrais(compte) ? 0n : FRAIS_INTERFACE_BPS;
  const deadline = BigInt(Math.floor(maintenant / 1000) + 1200);
  /* ⛔⛔ ACHAT VIA TBLOCK (Phil, 2026-09-13 : « fait l achat via TBLOCK ») : un block apparie a TBLOCK se paie en ETH
   *    et se vend pour de l ETH, en DEUX sauts dans UNE transaction — ETH -> TBLOCK -> block, ou l inverse. */
  if (marche.paire === 'TBLOCK') {
    const route = await routeViaTblock({ lire, Q, V, marche, jeton, sens, m, tol, bps });
    if (!route.actions) return route;
    const koFrais = assertFraisInterfaceA6cf({ compte, bps, resume: route.resume, actions: route.actions });
    if (koFrais) return { etat: 'REFUSE', pourquoi: 'Buy/Sell fee path broken: ' + koFrais, resume: route.resume };
    return finaliser({ lire, R, compte, jeton, sens, m, maintenant, deadline, ...route });
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
    /* tip 20260922-2023/2026: interface 0.5% even on hooked pairs — fee asset ETH or USDC only (never block tokens). */
    if (String(devise).toLowerCase() !== USDC_BASE.toLowerCase()) {
      return { etat: 'REFUSE', pourquoi: 'Buy/Sell fee must land as ETH or USDC — this pair cannot take the interface fee in an allowed asset' };
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
        quote: q, frais: fraisPair, fraisDevise: 'USDC', montantSwap: netPair, devise,
        fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null, fraisMarcheBps: hookPaieDeja ? 300 : null };
    } else {
      const fraisVente = (q * bps) / 10000n;
      const min = ((q - fraisVente) * (10000n - tol)) / 10000n;
      actionsD = [{ code: ACTIONS_V4.SETTLE_ALL, params: paramsAction.settleAll(entree, m) },
        ...(bps > 0n ? [{ code: ACTIONS_V4.TAKE_PORTION, params: paramsAction.takePortion(sortie, FEE_WALLET, bps) }] : []),
        { code: ACTIONS_V4.TAKE_ALL, params: paramsAction.takeAll(sortie, min) }];
      resumeD = { paye: m, payeDevise: 'block', recoitAuMoins: min, recoitDevise: 'pair',
        quote: q, frais: fraisVente, fraisDevise: 'USDC', montantSwap: m, devise,
        fraisBps: bps, beneficiaireFrais: bps > 0n ? FEE_WALLET : null, fraisMarcheBps: hookPaieDeja ? 300 : null };
    }
    const koPair = assertFraisInterfaceA6cf({ compte, bps, resume: resumeD, actions: actionsD });
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
  const koFrais = assertFraisInterfaceA6cf({ compte, bps, resume, actions });
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
    return { actions, valeur: m, resume, cle: saut1.cle, zeroForOne: saut1.zeroForOne, sortieMinTete: moinsTol(t) };
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
  return { actions, valeur: 0n, resume, cle: saut1.cle, zeroForOne: saut1.zeroForOne, sortieMinTete: moinsTol(t) };
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
    const data = encodeV4Swap({ cle, zeroForOne, montant: resume.montantSwap, sortieMin: sortieMinTete, deadline, forme, actions: actionsEncodees });
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

  let best = null;
  for (const k of CLES_PRIX) {
    const cle = cleDePool(ETH, USDC_BASE, k);
    const zeroForOne = String(cle.currency0).toLowerCase() === ETH; // ETH is 0x0 → always currency0
    let quote;
    try {
      const r = await lire('eth_call', [{ to: Q, data: encodeQuote({ cle, zeroForOne: true, montant: netAchat }) }, 'latest']);
      quote = BigInt('0x' + String(r).slice(2, 66));
    } catch {
      continue;
    }
    if (quote > 0n && (!best || quote > best.quote)) best = { cle, quote, fee: k.fee, tickSpacing: k.tickSpacing };
  }
  if (!best) {
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
    actions, valeur: m, resume, cle: best.cle, zeroForOne: true, sortieMinTete: 0n,
  });
}

