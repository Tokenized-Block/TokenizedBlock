/* echange-eth.js — ACHETER UNE ACTION EN ETH : LIRE CE QUI EST DEJA FAIT, NE PROPOSER QUE LE RESTE.
 *
 * ⛔⛔ CE MODULE NE SIGNE RIEN. Il rend la liste des gestes RESTANTS et un devis. Un wallet humain
 *     execute.
 *
 * ⛔⛔ LA DIFFICULTE REELLE DE CE CHEMIN, ET C EST ELLE QUI DICTE LA STRUCTURE. La simulation du swap
 *     ne peut PAS reussir avant l enveloppement et l approbation : sur un portefeuille neuf elle
 *     reverte sur le solde ou sur l allowance, et le message accuserait LE MARCHE au lieu de
 *     l etape manquante. C est la meme faute que j ai evitee sur le chemin USDC en verifiant les
 *     approbations AVANT de simuler — ici il y a une etape de plus.
 *   ⇒ ON LIT D ABORD CE QUI EST DEJA FAIT (solde WETH, allowance au routeur), on ne propose que les
 *     gestes RESTANTS, et on ne simule QUE si les prerequis sont reunis. Sinon on rend
 *     `simule: false` avec la raison — un « non simule » honnete vaut mieux qu un faux refus.
 *
 * ⛔ LES POOLS SONT RESOLUES PAR LEUR FACTORY, jamais supposees : c est la pool de CETTE factory que
 *   le routeur sait atteindre, et n importe quel contrat peut repondre a `slot0()`.
 * ⚠️ LES ESPACEMENTS PIVOT SONDES SONT CEUX MESURES (1, 10, 50). « Sondes » n est pas « tous » : si
 *   Aerodrome ouvre une pool WETH/USDC a un autre espacement, on prendra la meilleure des trois —
 *   pas la meilleure du marche. Le resultat le dit.
 */
import { selecteur } from './pool.js';
/* ⛔ `lire` EST IMPORTE, PAS RECOPIE : sa distinction entre `NON_MESURE` (notre panne) et `REVERT`
 *   (un fait de la chaine) est porteuse, et une deuxieme copie divergerait au premier correctif. */
import { lire } from './echange-v3.js';
import { USDC_BASE } from './plan-usdc-block.js';
import { planEthVersAction, WETH_BASE } from './plan-eth-block.js';
import { ROUTEUR_AERODROME_CL, FACTORY_AERODROME_CL } from './calldata-aerodrome.js';

/** ⛔ Les espacements ou une pool WETH/USDC a ete MESUREE le 2026-09-28 (fee 80 / 500 / 550).
 *  Publies pour qu une sonde puisse les re-verifier, et pour que « les trois » soit un fait. */
export const ESPACEMENTS_PIVOT_SONDES = Object.freeze([1, 10, 50]);

const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (a) => String(a || '').toLowerCase();
const pad = (a) => bas(a).replace(/^0x/, '').padStart(64, '0');
const motNb = (n) => BigInt(n).toString(16).padStart(64, '0');
const adrDuMot = (h) => {
  const x = String(h || '').replace(/^0x/, '');
  return x.length >= 64 && /^0{24}/.test(x.slice(0, 64)) ? '0x' + x.slice(24, 64) : null;
};

/**
 * @param {object} o
 * @param {Function} o.rpc
 * @param {string} o.compte
 * @param {string} o.action   l action tokenisee visee
 * @param {string} o.pool     sa pool Aerodrome (sera PROUVEE)
 * @param {bigint|string} o.montantWei
 * @param {bigint|number} [o.toleranceBps]
 * @param {number} [o.maintenantSec]
 */
export async function planAchatEthAction({ rpc, compte, action, pool, montantWei,
  toleranceBps = 100, maintenantSec = null, devise = USDC_BASE } = {}) {
  if (typeof rpc !== 'function') return { etat: 'NON_MESURE', pourquoi: 'no chain reader provided' };
  if (!ADR.test(String(compte || ''))) return { etat: 'REFUSE', pourquoi: 'connect your wallet first' };
  if (!ADR.test(String(action || ''))) return { etat: 'REFUSE', pourquoi: 'a whole action address is required' };
  if (!ADR.test(String(pool || ''))) return { etat: 'REFUSE', pourquoi: 'a whole pool address is required' };
  /* ⛔ L INSTANT VIENT DE L APPELANT : ce module reste rejouable, et son test peut figer l heure. */
  if (!Number.isInteger(maintenantSec) || maintenantSec <= 0) {
    return { etat: 'REFUSE', pourquoi: 'a reference instant in seconds is required to set a deadline' };
  }

  /* ── 1. la pool de l action, LUE puis PROUVEE ─────────────────────────────────────────────── */
  const s0 = await lire(rpc, pool, selecteur('slot0()'));
  const fe = await lire(rpc, pool, selecteur('fee()'));
  const ts = await lire(rpc, pool, selecteur('tickSpacing()'));
  const t0 = await lire(rpc, pool, selecteur('token0()'));
  const t1 = await lire(rpc, pool, selecteur('token1()'));
  for (const [nom, r] of [['slot0', s0], ['fee', fe], ['tickSpacing', ts], ['token0', t0], ['token1', t1]]) {
    if (r.etat === 'NON_MESURE') {
      return { etat: 'NON_MESURE', pourquoi: 'could not read ' + nom + ' on the action pool: ' + r.pourquoi };
    }
    if (r.etat === 'REVERT') {
      return { etat: 'REFUSE', pourquoi: 'this address does not answer like an Aerodrome CL pool (' + nom + ')' };
    }
  }
  const a0 = adrDuMot(t0.res), a1 = adrDuMot(t1.res);
  if (!a0 || !a1) return { etat: 'REFUSE', pourquoi: 'the action pool did not answer with two token addresses' };
  /* ⛔ LA POOL DOIT CONTENIR L ACTION ET LE PIVOT : sinon on prendrait le prix d un autre actif. */
  const cotes = [bas(a0), bas(a1)];
  if (!cotes.includes(bas(action)) || !cotes.includes(bas(devise))) {
    return { etat: 'REFUSE', pourquoi: 'this pool does not hold both the action and the pivot currency' };
  }
  const tsAction = (() => { try { return Number(BigInt(ts.res)); } catch (_) { return 0; } })();
  const feeAction = (() => { try { return Number(BigInt(fe.res)); } catch (_) { return -1; } })();
  if (!tsAction || tsAction <= 0) return { etat: 'REFUSE', pourquoi: 'the action pool answered an unusable tickSpacing' };
  /* ⛔⛔ PROVENANCE : la factory doit reconnaitre CETTE pool pour ce couple et ce tickSpacing. Sans
   *     ce controle, un contrat quelconque repondant a `slot0()` fixerait notre prix.
   *   ⛔ ET ON L INTERROGE AVEC LE tickSpacing, PAS LE fee : deux nombres differents, rapport 50 a
   *     100 (ts 10 -> fee 500, ts 1 -> fee 100). Avec le fee elle ne rendrait RIEN. */
  const g = await lire(rpc, FACTORY_AERODROME_CL,
    selecteur('getPool(address,address,int24)') + pad(a0) + pad(a1) + motNb(tsAction));
  if (g.etat === 'NON_MESURE') {
    return { etat: 'NON_MESURE', pourquoi: 'could not ask the factory about the action pool: ' + g.pourquoi };
  }
  const rendue = g.etat === 'OK' ? adrDuMot(g.res) : null;
  if (!rendue || bas(rendue) !== bas(pool)) {
    return { etat: 'REFUSE', pourquoi: 'the Aerodrome CL factory does not know this pool for this token '
      + 'pair and tickSpacing — the router could not reach it, and its price cannot be trusted' };
  }
  const poolAction = { pool, fee: feeAction, tickSpacing: tsAction,
    sqrtPriceX96: BigInt('0x' + String(s0.res).replace(/^0x/, '').slice(0, 64)),
    actionEst0: bas(a0) === bas(action) };

  /* ── 2. les pools pivot WETH/USDC, RESOLUES par la factory ────────────────────────────────── */
  const poolsPivot = [];
  let pivotsNonMesures = 0;
  for (const esp of ESPACEMENTS_PIVOT_SONDES) {
    const gp = await lire(rpc, FACTORY_AERODROME_CL,
      selecteur('getPool(address,address,int24)') + pad(devise) + pad(WETH_BASE) + motNb(esp));
    if (gp.etat === 'NON_MESURE') { pivotsNonMesures += 1; continue; }
    const p = gp.etat === 'OK' ? adrDuMot(gp.res) : null;
    /* ⛔ ADRESSE NULLE = cette factory ne connait AUCUNE pool a cet espacement. C est un FAIT, pas
     *   une panne : on passe sans compter d echec de lecture. */
    if (!p || /^0x0{40}$/i.test(p)) continue;
    const ps = await lire(rpc, p, selecteur('slot0()'));
    const pf = await lire(rpc, p, selecteur('fee()'));
    const pt0 = await lire(rpc, p, selecteur('token0()'));
    if (ps.etat !== 'OK' || pf.etat !== 'OK' || pt0.etat !== 'OK') { pivotsNonMesures += 1; continue; }
    const pa0 = adrDuMot(pt0.res);
    if (!pa0) { pivotsNonMesures += 1; continue; }
    poolsPivot.push({ pool: p, tickSpacing: esp,
      /* ⛔ LE `fee` EST LU A CHAQUE FOIS, jamais cache : mesure du 2026-09-28, celui de la pool
       *   ts=50 a change entre deux lectures LE MEME JOUR (725 puis 550). Les frais Aerodrome bougent. */
      fee: (() => { try { return Number(BigInt(pf.res)); } catch (_) { return -1; } })(),
      wethEst0: bas(pa0) === bas(WETH_BASE),
      sqrtPriceX96: BigInt('0x' + String(ps.res).replace(/^0x/, '').slice(0, 64)) });
  }
  if (!poolsPivot.length) {
    /* ⛔⛔ « AUCUNE POOL » ET « ON N A PAS PU LIRE » SONT DEUX FAITS OPPOSES. Les confondre ferait
     *     dire « ce chemin n existe pas » sur une panne de noeud. */
    return pivotsNonMesures
      ? { etat: 'NON_MESURE', pourquoi: 'could not read any WETH/USDC pivot pool (' + pivotsNonMesures + ' read failures)' }
      : { etat: 'REFUSE', pourquoi: 'no WETH/USDC pool exists at the measured spacings' };
  }

  /* ── 3. le plan, PUR ──────────────────────────────────────────────────────────────────────── */
  const plan = planEthVersAction({ action, montantWei, poolAction, poolsPivot, recipient: compte,
    deadline: BigInt(maintenantSec) + 300n, maintenant: BigInt(maintenantSec), toleranceBps, devise });
  if (plan.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: plan.pourquoi, plan: null };

  /* ── 4. CE QUI EST DEJA FAIT ───────────────────────────────────────────────────────────────── */
  const m = BigInt(plan.montantWei);
  const bal = await lire(rpc, WETH_BASE, selecteur('balanceOf(address)') + pad(compte));
  const all = await lire(rpc, WETH_BASE, selecteur('allowance(address,address)') + pad(compte) + pad(ROUTEUR_AERODROME_CL));
  if (bal.etat !== 'OK' || all.etat !== 'OK') {
    /* ⛔ ON NE DEVINE NI UN SOLDE NI UNE AUTORISATION. Supposer qu ils manquent ferait signer pour
     *   rien ; supposer qu ils sont la ferait simuler et afficher un faux refus de marche. */
    return { etat: 'NON_MESURE', pourquoi: 'could not read your WETH balance or allowance', plan };
  }
  let assezWeth = false, assezAllowance = false;
  try { assezWeth = BigInt(bal.res) >= m; } catch (_) { assezWeth = false; }
  try { assezAllowance = BigInt(all.res) >= m; } catch (_) { assezAllowance = false; }
  /* ⛔⛔ ON NE PROPOSE QUE CE QUI RESTE. Faire signer un enveloppement a quelqu un qui a DEJA du WETH
   *     lui ferait immobiliser de l ETH pour rien — et une signature inutile est une porte de sortie,
   *     comme les cinq du parcours de creation l ont montre. */
  const restants = plan.appels.filter((a) => (a.role === 'wrap' ? !assezWeth
    : (a.role === 'approve' ? !assezAllowance : true)));

  /* ── 5. LA SIMULATION, SEULEMENT QUAND ELLE PEUT DIRE QUELQUE CHOSE ───────────────────────── */
  if (!assezWeth || !assezAllowance) {
    return { etat: 'PRET', plan, appels: restants, simule: false,
      dejaFait: { wethSuffisant: assezWeth, allowanceSuffisante: assezAllowance },
      /* ⛔ ON DIT POURQUOI ON N A PAS SIMULE, au lieu de laisser croire qu on a verifie. */
      pourquoiPasSimule: 'the swap cannot be simulated before you hold the WETH and have approved it — '
        + 'the earlier steps come first, and a simulation now would revert for the wrong reason',
      borne: plan.borne };
  }
  const tx = plan.appels.find((a) => a.role === 'swap');
  let sim;
  try { await rpc('eth_call', [{ from: compte, to: tx.to, data: tx.data, value: '0x0' }, 'latest']); sim = { ok: true }; }
  catch (e) { sim = { ok: false, message: String((e && e.message) || e) }; }
  if (!sim.ok) {
    /* ⛔ UN MANQUE DE FONDS ET UN REFUS DE MARCHE APPELLENT DES REPONSES OPPOSEES. */
    const sansFonds = /OutOfFunds|insufficient funds|exceeds balance|TRANSFER_FROM_FAILED|STF/i.test(sim.message);
    return { etat: 'REFUSE', plan, sansFonds,
      pourquoi: sansFonds ? 'not enough WETH in this wallet for that amount'
        : 'the chain refuses this exact swap: ' + sim.message.slice(0, 160) };
  }
  return { etat: 'PRET', plan, appels: restants, simule: true,
    dejaFait: { wethSuffisant: true, allowanceSuffisante: true },
    borne: plan.borne + ' The chain accepted this exact swap just now.' };
}
