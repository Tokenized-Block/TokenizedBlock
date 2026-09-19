// lancer-pool-v2.js — le marche d un block contre TBLOCK, avec le hook de frais (tokenomics v2).
// ================================================================================================
// ⛔⛔ GARDE CODE LU : absent / non lu = pas de plan V2. TbFeeHook LIVE Base 2026-09-15 (HOOK_PREVU).
// ⛔ LE MEME PLAN QUE LE MARCHE ETH (`planLancement`), paire = TBLOCK et hooks = le hook : Permit2, marge,
//    proprietaire 0x…dEaD, frais LP 0 — rien n est recopie. Seules s ajoutent la garde du hook et l inscription.
// ✅ App ETH Launch (2026-09-15 P0) also attaches HOOK_PREVU via `completerInscriptionHook` when DEPLOYE.
// ⛔ SMART WALLET : dans le multicall du PositionManager, le hook voit le PositionManager comme `sender` et le
//    bundler comme `tx.origin` — ni l un ni l autre n est l admin du block. Un compte qui a du code doit donc
//    s INSCRIRE d abord (`inscrire(key, sqrtPrice)`), au MEME prix que l initialisation (le hook l exige).
import { planLancement } from './lancer-pool.js';
import { TBLOCK, HOOK_PREVU, HOOK_V2, hookDeploye } from './tokenomics.js';
import { encodeInitializePool, selecteur, poolId } from './pool.js';

export const ETATS_V2 = ['HOOK_ABSENT', 'PRET', 'APPROBATIONS', 'REFUSE', 'NON_MESURE'];
export const FRAIS_V2 = { hookPourMillion: 30000, buyback: '2 %', createur: '1 %', lp: '0 %' };

/** `inscrire((address,address,uint24,int24,address),uint160)` : meme disposition d arguments qu initializePool. */
export function encodeInscrire(cle, sqrtPriceX96) {
  return '0x' + selecteur('inscrire((address,address,uint24,int24,address),uint160)')
    + encodeInitializePool(cle, sqrtPriceX96).slice(10);
}


/** After `planLancement(..., hooks: HOOK_PREVU)`: add smart-wallet creator register if the pool is new. */
export async function completerInscriptionHook({ rpc, plan, compte }) {
  if (!plan || (plan.etat !== 'PRET' && plan.etat !== 'APPROBATIONS')) return plan;
  const out = { ...plan, hook: HOOK_PREVU, frais: FRAIS_V2 };
  if (plan.poolExiste) return out;
  const lire = rpc;
  let code;
  try { code = String(await lire('eth_getCode', [compte, 'latest']) || '0x').toLowerCase(); }
  catch { return { ...out, etat: 'NON_MESURE', etapes: [], pourquoi: 'could not tell whether your wallet is a smart wallet' }; }
  /* ⚠️ 0xef0100… = EIP-7702 EOA: tx.origin is the account. Only a real contract registers. */
  const contrat = code !== '0x' && !code.startsWith('0xef0100');
  if (!contrat) return out;
  let inscrit;
  try {
    const r = await lire('eth_call', [{ to: HOOK_PREVU, data: '0x' + selecteur('inscrit(bytes32)') + poolId(plan.cle).slice(2) }, 'latest']);
    inscrit = '0x' + String(r).slice(-40);
  } catch { return { ...out, etat: 'NON_MESURE', etapes: [], pourquoi: 'the creator registration could not be read' }; }
  const etapes = [...plan.etapes];
  if (inscrit.toLowerCase() !== String(compte).toLowerCase()) {
    etapes.push({ nom: 'Register as this market\'s creator (smart wallet)', to: HOOK_PREVU,
      data: encodeInscrire(plan.cle, plan.sqrtVise), value: '0x0' });
  }
  return { ...out, etapes, etat: etapes.length ? 'APPROBATIONS' : 'PRET' };
}

/**
 * Hook V2 : l ouverture exige une inscription PAYEE (≈ 1 $, versee par le contrat au wallet de frais).
 * ⛔ Pour TOUT compte, EOA comme smart wallet : sans elle, la chaine refuse d ouvrir le marche.
 * ⛔ L etat vient de la chaine (`payee`, `inscrit`) : deja payee -> pas de second paiement.
 */
export async function completerInscriptionPayee({ rpc, plan, compte, fraisWei }) {
  if (!plan || (plan.etat !== 'PRET' && plan.etat !== 'APPROBATIONS')) return plan;
  const out = { ...plan, hook: HOOK_V2, frais: FRAIS_V2, v2: true };
  if (plan.poolExiste) return out;
  if (typeof fraisWei !== 'bigint' || fraisWei <= 0n) {
    return { ...out, etat: 'NON_MESURE', etapes: [], pourquoi: 'the price of bringing it to life could not be worked out' };
  }
  const id = poolId(plan.cle).slice(2);
  let payee, inscrit, prix;
  try {
    payee = BigInt(await rpc('eth_call', [{ to: HOOK_V2, data: '0x' + selecteur('payee(bytes32)') + id }, 'latest'])) !== 0n;
    inscrit = '0x' + String(await rpc('eth_call', [{ to: HOOK_V2, data: '0x' + selecteur('inscrit(bytes32)') + id }, 'latest'])).slice(-40);
    prix = BigInt(await rpc('eth_call', [{ to: HOOK_V2, data: '0x' + selecteur('prixInscrit(bytes32)') + id }, 'latest']));
  } catch { return { ...out, etat: 'NON_MESURE', etapes: [], pourquoi: 'the registration could not be read' }; }
  const etapes = [...plan.etapes];
  const aJour = payee && inscrit.toLowerCase() === String(compte).toLowerCase() && prix === BigInt(plan.sqrtVise);
  if (!aJour) {
    etapes.push({
      nom: payee ? 'Confirm the starting price' : 'Bring it to life — ≈ $1, paid on chain',
      to: HOOK_V2, data: encodeInscrire(plan.cle, plan.sqrtVise),
      value: payee ? '0x0' : '0x' + fraisWei.toString(16),
      payant: !payee,
    });
  }
  return { ...out, etapes, etat: etapes.length ? 'APPROBATIONS' : 'PRET', inscriptionPayee: payee && aJour };
}

export async function planLancementV2({ rpc, chaine, jeton, compte, valorisationTblock, maintenant = Date.now() }) {
  if (Number(chaine) !== 8453) return { etat: 'REFUSE', pourquoi: 'TBLOCK markets exist on Base mainnet only' };
  const h = await hookDeploye({ rpc });
  if (h === 'ABSENT') {
    return { etat: 'HOOK_ABSENT', pourquoi: 'the TBLOCK fee hook has no code on this network' };
  }
  if (h !== 'DEPLOYE') return { etat: 'NON_MESURE', pourquoi: 'the hook code could not be read' };

  const plan = await planLancement({ rpc, chaine, jeton, compte, valorisationEth: valorisationTblock, maintenant,
    devise: TBLOCK, hooks: HOOK_PREVU });
  if (plan.etat !== 'PRET' && plan.etat !== 'APPROBATIONS') return plan;
  const complet = await completerInscriptionHook({ rpc, plan, compte });
  return { ...complet, devise: TBLOCK };
}
