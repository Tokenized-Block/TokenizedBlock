// lancer-pool-v2.js — le marche d un block contre TBLOCK, avec le hook de frais (tokenomics v2).
// ================================================================================================
// ⛔⛔ BLOQUE TANT QUE LE HOOK N EXISTE PAS SUR LA CHAINE. Son code est LU a chaque plan : absent = aucun plan,
//    aucune transaction a signer. Le hook ne doit pas etre deploye avant son audit (decision du 2026-09-13).
// ⛔ LE MEME PLAN QUE LE MARCHE ETH (`planLancement`), paire = TBLOCK et hooks = le hook : Permit2, marge,
//    proprietaire 0x…dEaD, frais LP 0 — rien n est recopie. Seules s ajoutent la garde du hook et l inscription.
// ⛔ SMART WALLET : dans le multicall du PositionManager, le hook voit le PositionManager comme `sender` et le
//    bundler comme `tx.origin` — ni l un ni l autre n est l admin du block. Un compte qui a du code doit donc
//    s INSCRIRE d abord (`inscrire(key, sqrtPrice)`), au MEME prix que l initialisation (le hook l exige).
import { planLancement } from './lancer-pool.js';
import { TBLOCK, HOOK_PREVU, hookDeploye } from './tokenomics.js';
import { encodeInitializePool, selecteur, poolId } from './pool.js';

export const ETATS_V2 = ['HOOK_ABSENT', 'PRET', 'APPROBATIONS', 'REFUSE', 'NON_MESURE'];
export const FRAIS_V2 = { hookPourMillion: 30000, buyback: '2 %', createur: '1 %', lp: '0 %' };

/** `inscrire((address,address,uint24,int24,address),uint160)` : meme disposition d arguments qu initializePool. */
export function encodeInscrire(cle, sqrtPriceX96) {
  return '0x' + selecteur('inscrire((address,address,uint24,int24,address),uint160)')
    + encodeInitializePool(cle, sqrtPriceX96).slice(10);
}

export async function planLancementV2({ rpc, chaine, jeton, compte, valorisationTblock, maintenant = Date.now() }) {
  if (Number(chaine) !== 8453) return { etat: 'REFUSE', pourquoi: 'TBLOCK markets exist on Base mainnet only' };
  const h = await hookDeploye({ rpc });
  if (h === 'ABSENT') {
    return { etat: 'HOOK_ABSENT', pourquoi: 'the TBLOCK fee hook is not deployed yet — it waits for its security audit' };
  }
  if (h !== 'DEPLOYE') return { etat: 'NON_MESURE', pourquoi: 'the hook code could not be read' };

  const plan = await planLancement({ rpc, chaine, jeton, compte, valorisationEth: valorisationTblock, maintenant,
    devise: TBLOCK, hooks: HOOK_PREVU });
  if (plan.etat !== 'PRET' && plan.etat !== 'APPROBATIONS') return plan;

  const etapes = [...plan.etapes];
  /* ⚠️ Nomme par un `const` : la regle 5 de verifie-coherence ne voit pas un parametre destructure appele directement. */
  const lire = rpc;
  if (!plan.poolExiste) {
    let code;
    try { code = String(await lire('eth_getCode', [compte, 'latest']) || '0x').toLowerCase(); }
    catch { return { ...plan, etat: 'NON_MESURE', etapes: [], pourquoi: 'could not tell whether your wallet is a smart wallet' }; }
    /* ⚠️ 0xef0100… = compte EIP-7702 : c est un EOA, tx.origin le reconnait. Seul un vrai contrat s inscrit. */
    const contrat = code !== '0x' && !code.startsWith('0xef0100');
    if (contrat) {
      let inscrit;
      try {
        const r = await lire('eth_call', [{ to: HOOK_PREVU, data: '0x' + selecteur('inscrit(bytes32)') + poolId(plan.cle).slice(2) }, 'latest']);
        inscrit = '0x' + String(r).slice(-40);
      } catch { return { ...plan, etat: 'NON_MESURE', etapes: [], pourquoi: 'the creator registration could not be read' }; }
      if (inscrit.toLowerCase() !== String(compte).toLowerCase()) {
        etapes.push({ nom: 'Register as this market\'s creator (smart wallet)', to: HOOK_PREVU,
          data: encodeInscrire(plan.cle, plan.sqrtVise), value: '0x0' });
      }
    }
  }
  return { ...plan, etapes, etat: etapes.length ? 'APPROBATIONS' : 'PRET', devise: TBLOCK, hook: HOOK_PREVU, frais: FRAIS_V2 };
}
