// echange.js — acheter / vendre un block DANS l app, avec le frais d interface de 0,5 %, et le buyback.
// ================================================================================================
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
import { encodeV4Swap, encodeQuote, formeAcceptee, paramsAction, ACTIONS_V4, selecteur,
  encodeApprove, encodePermit2Approve, MAX_UINT256, MAX_UINT160, MAX_UINT48 } from './pool.js';
import { vieDuBlock } from './marche.js';
import { FEE_WALLET } from './frais-creation.js';
import { PERMIT2, V4_ADRESSES } from './lancer-pool.js';

/** ⛔ RECOPIEES de index.html (const ROUTEUR, const QUOTER) — un test compare. */
export const ROUTEUR = { 84532: '0x492E6456D9528771018DeB9E87ef7750EF184104', 8453: '0x6ff5693b99212DA76aD316178A184AB56D299b43' };
export const QUOTEUR = { 84532: '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba', 8453: '0x0d5e0F971ED27FBfF6c2837bf31316121532048D' };
export const FRAIS_INTERFACE_BPS = 50n;
export const ETATS_ECHANGE = ['PRET', 'APPROBATIONS', 'REFUSE', 'NON_MESURE'];
const ETH = '0x0000000000000000000000000000000000000000';
const pad = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');

/** Le frais sur un montant : tronque vers le bas, le reste va au swap — la somme est exacte. */
export function fraisSur(total, bps) {
  const t = BigInt(total), b = BigInt(bps);
  const frais = (t * b) / 10000n;
  return { frais, net: t - frais };
}

export const estWalletDeFrais = (compte) => String(compte || '').toLowerCase() === FEE_WALLET.toLowerCase();

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
  marcheLu = null }) {
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
  let marche = marcheLu && marcheLu.etat === 'LUE' && marcheLu.cle ? marcheLu : null;
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
  const cle = marche.cle;
  if (String(cle.currency0).toLowerCase() !== ETH) return { etat: 'REFUSE', pourquoi: 'only markets against native ETH are traded here' };
  const bps = estWalletDeFrais(compte) ? 0n : FRAIS_INTERFACE_BPS;
  const deadline = BigInt(Math.floor(maintenant / 1000) + 1200);
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

  let actions, valeur, resume;
  if (sens === 'ACHAT') {
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

  /* ── vente : les deux autorisations Permit2, MESUREES (meme regle d expiration que le lancement) ── */
  const etapes = [];
  if (sens === 'VENTE') {
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
  const f = await formeAcceptee({ appelBrut, ur: R, de: compte, cle, zeroForOne, montant: resume.montantSwap, deadline,
    value: sens === 'ACHAT' ? '0x' + resume.montantSwap.toString(16) : undefined });
  if (f.forme === null) {
    return { etat: f.transport ? 'NON_MESURE' : 'REFUSE', resume, cle,
      pourquoi: f.transport ? 'the node refused the check — try again' : 'the router refuses this swap: ' + JSON.stringify(f.causes).slice(0, 160) };
  }
  const data = encodeV4Swap({ cle, zeroForOne, montant: resume.montantSwap, sortieMin: 0n, deadline, forme: f.forme, actions });
  const tx = { to: R, data, value: '0x' + valeur.toString(16) };
  const sim = await appelOuErreur(lire, { from: compte, ...tx });
  if (sim.error) return { etat: 'REFUSE', resume, cle, pourquoi: 'the chain refuses this exact transaction: ' + sim.error.message.slice(0, 160) };
  return { etat: 'PRET', etapes: [], tx, resume, cle, forme: f.forme, pourquoi: null };
}
