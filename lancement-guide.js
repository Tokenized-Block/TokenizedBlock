// lancement-guide.js - the guided launch: ONE numbered list from birth to an open market (2026-10-17).
// ================================================================================================
// 1 Birth (Create)          - 0.0007 ETH to Create: engraves the face and mints the supply.
// 2 Register (bring to life) - 0.0003 ETH birth fee + the creator minimum (held by the market contract, not a fee).
// 3 Launch the market        - no fee: opens the pool at the registered price and places the blocks (ETH seed 0 + gas).
// Every status is READ on chain (code of the block, payee/createurs/prixInscrit on the hook, slot0 + range edge on the StateView).
// Unreadable -> NON_MESURE: no step is current and nothing is asked. `blocMin` (block of the confirmed registration receipt) is
// the tag of the hook reads, so a lagging node after a reload cannot make a paid step look unpaid.
// MEASURED 2026-10-16 (UNIT 0xb200..4f27): a no-seed birth places a block-only range below the price, so ACTIVE liquidity
// (getLiquidity) is 0 on an OPEN market. The open test is the range edge (getTickLiquidity liquidityGross), not getLiquidity.
import { selecteur, poolId } from './pool.js';

const mot = (x) => BigInt.asUintN(256, BigInt(x)).toString(16).padStart(64, '0');
const ADR = /^0x[0-9a-fA-F]{40}$/;
/** wei -> "0.0003" (no trailing zeros) */
export function ethTexte(w) {
  const s = BigInt(w).toString().padStart(19, '0');
  return (s.slice(0, -18) + '.' + s.slice(-18)).replace(/\.?0+$/, '') || '0';
}

export async function lireEtatLancement({ rpc, stateView, jeton, cle, hook, compte, blocMin = null }) {
  if (!ADR.test(String(jeton || '')) || !cle || !ADR.test(String(stateView || ''))) return { etat: 'NON_MESURE', pourquoi: 'missing block, pool key or StateView' };
  /* ⛔ 2026-10-17 (revue Claude) : lu a 'latest', jamais a `blocMin` (persiste ; un noeud non-archive refuse un vieux bloc -> NON_MESURE
   *   pour toujours). Une inscription confirmee lue « non payee » = noeud en retard -> NON_MESURE. */
  const tag = 'latest';
  const inscriptionConfirmee = typeof blocMin === 'string' && /^0x[0-9a-fA-F]+$/.test(blocMin);
  const id = poolId(cle).slice(2);
  const appel = async (to, data, t = 'latest') => String(await rpc('eth_call', [{ to, data }, t]));
  try {
    const code = String(await rpc('eth_getCode', [jeton, 'latest']) || '0x');
    const ne = code !== '0x' && code !== '0x0';
    let payee = false, createur = null, prixInscrit = 0n;
    if (ne && hook && ADR.test(String(hook)) && !/^0x0{40}$/i.test(String(hook))) {
      payee = BigInt(await appel(hook, '0x' + selecteur('payee(bytes32)') + id, tag)) !== 0n;
      createur = '0x' + (await appel(hook, '0x' + selecteur('createurs(bytes32)') + id, tag)).slice(-40).toLowerCase();
      prixInscrit = BigInt(await appel(hook, '0x' + selecteur('prixInscrit(bytes32)') + id, tag));
      if (inscriptionConfirmee && (!payee || /^0x0{40}$/.test(createur))) return { etat: 'NON_MESURE', pourquoi: 'the network has not caught up with your registration yet' };
    }
    const s0 = await appel(stateView, '0x' + selecteur('getSlot0(bytes32)') + id);
    const sqrt = BigInt('0x' + s0.slice(2, 66));
    let marche = 'FERME', tick = null;
    if (sqrt !== 0n) {
      tick = Number(BigInt.asIntN(24, BigInt('0x' + s0.slice(66, 130))));
      const actif = BigInt(await appel(stateView, '0x' + selecteur('getLiquidity(bytes32)') + id));
      marche = 'VIDE';
      if (actif > 0n) marche = 'OUVERT';
      else {
        const esp = Number(cle.tickSpacing) || 200;
        const bas = Math.floor(tick / esp) * esp;
        for (const t of [bas, bas - esp, bas + esp]) {
          const r = await appel(stateView, '0x' + selecteur('getTickLiquidity(bytes32,int24)') + id + mot(t));
          if (BigInt('0x' + r.slice(2, 66)) > 0n) { marche = 'OUVERT'; break; }
        }
      }
    }
    const moi = String(compte || '').toLowerCase();
    return { etat: 'LU', ne, payee, createur, inscritParMoi: !!createur && createur === moi, prixInscrit, sqrtPriceX96: sqrt, tick, marche, lueA: tag };
  } catch (e) {
    return { etat: 'NON_MESURE', pourquoi: 'the launch state could not be read: ' + String((e && e.message) || e).slice(0, 120) };
  }
}

/** The three steps with exact amounts and why. Never builds a tx: signing stays with the plan (lancer-pool-v2). */
export function etapesGuidees(etat, { fraisCreateWei = null, fraisVieWei = null, cautionWei = null, seedWei = 0n } = {}) {
  const amt = (w) => (typeof w === 'bigint' ? ethTexte(w) + ' ETH' : 'amount not read');
  const etapes = [
    { n: 1, nom: 'Birth - create your block', montant: amt(fraisCreateWei) + ' to Create',
      pourquoi: 'Create engraves the face on chain and mints the whole supply to you.' },
    { n: 2, nom: 'Register - bring it to life', montant: amt(fraisVieWei) + ' birth fee'
      + (typeof cautionWei === 'bigint' && cautionWei > 0n ? ' + ' + ethTexte(cautionWei) + ' ETH creator minimum' : ''),
      pourquoi: 'The market contract records you as creator at the starting price; the creator minimum stays in the contract, it is not a fee.' },
    { n: 3, nom: 'Launch the market', montant: 'no fee - ' + (typeof seedWei === 'bigint' && seedWei > 0n ? ethTexte(seedWei) + ' ETH seed' : 'ETH seed 0 (100 % block)') + ' + gas',
      pourquoi: 'Opens the pool at the registered price and places your blocks so anyone can buy.' },
  ];
  if (!etat || etat.etat !== 'LU') {
    return { etapes: etapes.map((x) => ({ ...x, statut: 'NON_LU' })), courante: null, marcheOuvert: false };
  }
  const fait = [etat.ne, etat.payee || etat.marche === 'OUVERT', etat.marche === 'OUVERT'];
  let courante = null;
  const out = etapes.map((x, i) => {
    if (fait[i]) return { ...x, statut: 'FAIT' };
    if (courante === null) { courante = x.n; return { ...x, statut: 'A_FAIRE' }; }
    return { ...x, statut: 'ATTENTE' };
  });
  return { etapes: out, courante, marcheOuvert: etat.marche === 'OUVERT' };
}

export function texteMarcheOuvert(etat) {
  if (!etat || etat.marche !== 'OUVERT') return '';
  return 'Market open - your block trades on TokenizedBlock. Its blocks wait in the pool; the first buy starts the price.';
}