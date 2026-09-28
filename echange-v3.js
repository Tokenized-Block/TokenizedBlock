/* echange-v3.js — L ACHAT D UN BLOCK EN USDC, LU SUR LA CHAINE PUIS SIMULE AVANT D ETRE PROPOSE.
 *
 * ⛔⛔ CE MODULE NE SIGNE RIEN. Il rend soit des ETAPES D AUTORISATION, soit une transaction PRETE
 *     dont la chaine a DEJA accepte la simulation. Un wallet humain execute.
 *
 * ⛔⛔ L ORDRE DES ETAPES N EST PAS UN DETAIL, ET C EST LE CŒUR DE CE FICHIER.
 *     Si on simulait AVANT de verifier les autorisations Permit2, la simulation reverterait sur une
 *     allowance manquante et on afficherait « la chaine refuse cet echange » — un message vrai dans
 *     sa forme et FAUX dans sa cause. L utilisateur chercherait un probleme de marche alors qu il
 *     lui manque une signature d approbation. `echange.js` rend deja `APPROBATIONS` avant d atteindre
 *     sa simulation ; on garde exactement cet ordre.
 *
 * ⛔⛔ ET LA POOL EST PROUVEE PAR ALLER-RETOUR, PAS SEULEMENT LUE. N importe quel contrat peut
 *     repondre a `slot0()` avec le prix qu il veut. On demande donc a la factory Uniswap v3
 *     `getPool(token0, token1, fee)` et on EXIGE qu elle rende la pool d ou l on est parti. Ca prouve
 *     sa provenance — qu elle appartient bien a la factory que le routeur sait adresser (factory
 *     0x33128a8f… PRESENTE dans son bytecode, mesure du 2026-09-27). Un prix lu sur une pool non
 *     prouvee est un prix qu on croit.
 *   ⛔ La variante Uniswap prend un `uint24 fee` ; celle d Aerodrome un `int24 tickSpacing`. Les deux
 *     selecteurs DIFFERENT, et c est mesure : sur la factory Aerodrome, la variante `uint24` REVERTE.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un echange aboutisse au bloc suivant. Une simulation reussie decrit
 *   l etat A CET INSTANT ; le prix peut bouger avant la signature. C est a ca que sert le minimum.
 */
import { selecteur, encodeApprove, encodePermit2Approve, MAX_UINT256, MAX_UINT160, MAX_UINT48 } from './pool.js';
import { PERMIT2 } from './lancer-pool.js';
import { ROUTEUR } from './echange.js';
import { planUsdcVersBlock, USDC_BASE } from './plan-usdc-block.js';
import { FEE_WALLET } from './frais-creation.js';
import { ROUTEUR_AERODROME_CL, FACTORY_AERODROME_CL, calldataApprove } from './calldata-aerodrome.js';

/** La factory des pools Uniswap v3 sur Base.
 * ⛔ LUE SUR LA CHAINE le 2026-09-27 : `factory()` sur trois pools `uniswap` de Base rend cette
 *   meme adresse, et elle est PRESENTE dans le bytecode du routeur qu on deploie. Publiee ici pour
 *   qu une sonde puisse la re-verifier, pas pour etre recopiee ailleurs. */
export const FACTORY_UNISWAP_V3 = '0x33128a8fC17869897dcE68Ed026d694621f6FDfD';

/** ⛔⛔ LES DEUX FAMILLES, ET TOUT DIFFERE ENTRE ELLES SAUF LA MATHEMATIQUE. Mesures du 2026-09-27
 *     et du 2026-09-28 :
 *       'v3' Uniswap   : factory 0x33128a8f…, `getPool(address,address,uint24 fee)`,
 *                        routeur 0x6ff5693b…, et l approbation passe par PERMIT2 (deux signatures).
 *       'cl' Aerodrome : factory 0xf8f2eb49…, `getPool(address,address,int24 tickSpacing)`,
 *                        routeur 0x698cb2b6…, et PERMIT2 est ABSENT de son bytecode ⇒ une allowance
 *                        DIRECTE au routeur, UNE signature de moins.
 *     ⛔ Les deux selecteurs de `getPool` DIFFERENT (uint24 vs int24), et sur la factory Aerodrome
 *       la variante `uint24` REVERTE. Les confondre ne rend pas une mauvaise pool : ca ne rend RIEN.
 *     ⛔ Et sur Aerodrome, `fee()` et `tickSpacing()` sont deux nombres, rapport 50 a 100 : le
 *       CALCUL deduit le fee, le CALLDATA porte le tickSpacing. */
export const REGLAGES_FAMILLE = Object.freeze({
  v3: { factory: FACTORY_UNISWAP_V3, sigGetPool: 'getPool(address,address,uint24)', viaPermit2: true },
  cl: { factory: FACTORY_AERODROME_CL, sigGetPool: 'getPool(address,address,int24)', viaPermit2: false },
});

export const ETATS_V3 = Object.freeze(['PRET', 'APPROBATIONS', 'REFUSE', 'NON_MESURE']);

const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (a) => String(a || '').toLowerCase();
const pad = (a) => bas(a).replace(/^0x/, '').padStart(64, '0');
const motNb = (n) => BigInt(n).toString(16).padStart(64, '0');
const adrDuMot = (h) => {
  const x = String(h || '').replace(/^0x/, '');
  return x.length >= 64 && /^0{24}/.test(x.slice(0, 64)) ? '0x' + x.slice(24, 64) : null;
};

/** ⛔ TROIS ETATS, JAMAIS DEUX. Confondre « la chaine a refuse » et « on n a pas pu lire » ferait
 *  passer nos pannes pour des faits de marche — et, ici, ferait refuser un achat parfaitement bon. */
export async function lire(rpc, to, data) {
  /* ⛔⛔ LE PREFIXE `0x` EST AJOUTE ICI, UNE FOIS, ET C ETAIT UN VRAI DEFAUT. `selecteur()` rend HUIT
   *     caracteres hex SANS prefixe ; `echange.js` ecrit donc partout `'0x' + selecteur(…) + pad(…)`.
   *     Je l avais oublie sur mes six appels de lecture. Un `eth_call` dont le `data` n est pas
   *     prefixe est refuse par un vrai noeud — et les lectures de pool « marchaient » par accident,
   *     parce que leur data n etait QUE le selecteur.
   *   ⇒ On prefixe au SEUL endroit qui appelle la chaine, plutot que sur six lignes : six occasions
   *     d en oublier une deviennent zero. Et un `data` deja prefixe n est pas double.
   *   ⛔ C EST LE TEST QUI L A TROUVE, pas ma relecture. */
  const d = String(data || '');
  const complet = d.startsWith('0x') ? d : '0x' + d;
  try { return { etat: 'OK', res: await rpc('eth_call', [{ to, data: complet }, 'latest']) }; }
  catch (e) {
    const m = String((e && e.message) || e);
    return /revert|execution reverted/i.test(m) ? { etat: 'REVERT', pourquoi: m.slice(0, 120) }
      : { etat: 'NON_MESURE', pourquoi: m.slice(0, 120) };
  }
}

/**
 * @param {object} o
 * @param {Function} o.rpc        (methode, params) => Promise
 * @param {string} o.compte       le portefeuille qui paiera
 * @param {string} o.block        le block a acheter
 * @param {string} o.pool         la pool v3 (sera PROUVEE par aller-retour)
 * @param {bigint|string} o.montantUsdc  unites de base (USDC a 6 decimales)
 * @param {bigint|number} [o.toleranceBps]
 * @param {number} [o.maintenantSec]  l instant de reference, en SECONDES
 * @param {number} [o.chaine]
 */
export async function planAchatUsdcV3({ rpc, compte, block, pool, montantUsdc,
  toleranceBps = 100, maintenantSec = null, chaine = 8453, devise = USDC_BASE, famille = null } = {}) {
  if (typeof rpc !== 'function') return { etat: 'NON_MESURE', pourquoi: 'no chain reader provided' };
  /* ⛔⛔ LA FAMILLE EST EXIGEE EXPLICITEMENT. Un defaut a 'v3' interrogerait la factory Uniswap pour
   *     une pool Aerodrome : elle ne la connait pas, la provenance serait refusee, et l ecran dirait
   *     « cette pool n est pas fiable » alors qu elle l est parfaitement — un faux negatif sur
   *     12,10 M$ de profondeur. */
  const reglages = REGLAGES_FAMILLE[String(famille || '')];
  if (!reglages) {
    return { etat: 'REFUSE', pourquoi: 'famille must be "v3" (Uniswap) or "cl" (Aerodrome): the two '
      + 'use different factories, different getPool signatures and different approval paths' };
  }
  /* ⛔ LE ROUTEUR SUIT LA FAMILLE. Envoyer un calldata Aerodrome au routeur Uniswap le ferait
   *   chercher une pool dans une factory qu il ne connait pas. */
  const R = reglages.viaPermit2 ? ROUTEUR[Number(chaine)] : ROUTEUR_AERODROME_CL;
  if (!R) return { etat: 'REFUSE', pourquoi: 'no router measured for this family on this network' };
  if (!ADR.test(String(compte || ''))) return { etat: 'REFUSE', pourquoi: 'connect your wallet first' };
  if (!ADR.test(String(block || ''))) return { etat: 'REFUSE', pourquoi: 'a whole block address is required' };
  if (!ADR.test(String(pool || ''))) return { etat: 'REFUSE', pourquoi: 'a whole pool address is required' };
  /* ⛔ LE DEADLINE VIENT D UN INSTANT FOURNI, jamais de l horloge de ce module : un test doit pouvoir
   *   le rejouer. `maintenantSec` absent ⇒ on refuse, plutot que d inventer une heure. */
  if (!Number.isInteger(maintenantSec) || maintenantSec <= 0) {
    return { etat: 'REFUSE', pourquoi: 'a reference instant in seconds is required to set a deadline' };
  }

  /* ── 1. la pool, LUE ────────────────────────────────────────────────────────────────────── */
  const s0 = await lire(rpc, pool, selecteur('slot0()'));
  const fe = await lire(rpc, pool, selecteur('fee()'));
  const t0 = await lire(rpc, pool, selecteur('token0()'));
  const t1 = await lire(rpc, pool, selecteur('token1()'));
  for (const [nom, r] of [['slot0', s0], ['fee', fe], ['token0', t0], ['token1', t1]]) {
    if (r.etat === 'NON_MESURE') {
      return { etat: 'NON_MESURE', pourquoi: 'could not read ' + nom + ' on the pool: ' + r.pourquoi };
    }
    if (r.etat === 'REVERT') {
      /* ⛔ UN REVERT ICI EST UN FAIT : ce contrat n est pas une pool v3. Ce n est PAS notre panne. */
      return { etat: 'REFUSE', pourquoi: 'this address does not answer like a v3 pool (' + nom + ')' };
    }
  }
  const sqrtPriceX96 = (() => { try { return BigInt('0x' + String(s0.res).replace(/^0x/, '').slice(0, 64)); } catch (_) { return 0n; } })();
  const fee = (() => { try { return Number(BigInt(fe.res)); } catch (_) { return 0; } })();
  const a0 = adrDuMot(t0.res), a1 = adrDuMot(t1.res);
  if (!a0 || !a1) return { etat: 'REFUSE', pourquoi: 'the pool did not answer with two token addresses' };

  /* ⛔⛔ LA POOL DOIT CONTENIR LES DEUX JETONS. Sans ce controle, on prendrait le prix d un AUTRE
   *     actif et on l afficherait sous le nom du block — plausible, et faux. */
  const cotes = [bas(a0), bas(a1)];
  if (!cotes.includes(bas(block)) || !cotes.includes(bas(devise))) {
    return { etat: 'REFUSE', pourquoi: 'this pool does not hold both the block and the quote currency' };
  }
  const blockEst0 = bas(a0) === bas(block);

  /* ⛔⛔ SUR AERODROME IL FAUT AUSSI LE `tickSpacing`, ET CE N EST PAS LE `fee`. Mesure du
   *     2026-09-28 sur les 12 pools d actions : tickSpacing 10 -> fee 500, tickSpacing 1 -> fee 100
   *     — un rapport de 50 a 100. Le CALCUL du minimum deduit le fee ; le CALLDATA et la recherche
   *     de pool portent le tickSpacing. Utiliser l un pour l autre ne rend pas une mauvaise pool :
   *     ca ne rend RIEN, et l ecran dirait « pool inconnue » sur une pool parfaitement valide. */
  let tickSpacing = null;
  if (famille === 'cl') {
    const ts = await lire(rpc, pool, selecteur('tickSpacing()'));
    if (ts.etat === 'NON_MESURE') {
      return { etat: 'NON_MESURE', pourquoi: 'could not read tickSpacing on the pool: ' + ts.pourquoi };
    }
    if (ts.etat === 'REVERT') {
      return { etat: 'REFUSE', pourquoi: 'this address does not answer like an Aerodrome CL pool (tickSpacing)' };
    }
    try { tickSpacing = Number(BigInt(ts.res)); } catch (_) { tickSpacing = 0; }
    if (!tickSpacing || tickSpacing <= 0) {
      return { etat: 'REFUSE', pourquoi: 'the pool answered an unusable tickSpacing' };
    }
  }

  /* ── 2. la POOL EST PROUVEE par aller-retour sur la factory DE SA FAMILLE ──────────────── */
  const g = await lire(rpc, reglages.factory,
    selecteur(reglages.sigGetPool) + pad(a0) + pad(a1)
    + motNb(famille === 'cl' ? tickSpacing : fee));
  if (g.etat === 'NON_MESURE') {
    return { etat: 'NON_MESURE', pourquoi: 'could not ask the factory whether this pool is its own: ' + g.pourquoi };
  }
  const rendue = g.etat === 'OK' ? adrDuMot(g.res) : null;
  if (!rendue || bas(rendue) !== bas(pool)) {
    /* ⛔⛔ PROVENANCE REFUSEE. La factory ne reconnait pas cette pool pour ce triplet : soit
     *     l adresse n est pas une pool de CETTE factory, soit le `fee` lu ne lui correspond pas.
     *     Dans les deux cas, le routeur ne saura pas l atteindre — et un prix lu sur un contrat
     *     quelconque serait un prix invente. */
    return { etat: 'REFUSE', pourquoi: 'the ' + (famille === 'cl' ? 'Aerodrome CL' : 'Uniswap v3')
      + ' factory does not know this pool for this token pair and '
      + (famille === 'cl' ? 'tickSpacing' : 'fee')
      + ' — the router could not reach it, and its price cannot be trusted' };
  }

  /* ── 3. le plan, PUR ───────────────────────────────────────────────────────────────────── */
  const plan = planUsdcVersBlock({
    famille, tickSpacing,
    /* ⛔⛔ LE FRAIS D INTERFACE PART D ICI, VERS LE WALLET DU DEPOT. Aucun defaut dans le module pur :
     *     c est l appelant qui nomme le beneficiaire, pour qu une retenue ne puisse jamais s appliquer
     *     sans que quelqu un l ait decidee. 0,1 % — voir FRAIS_INTERFACE_BPS_CL.
     *   ⚠️ SUR UNISWAP v3 LE MONTAGE N EXISTE PAS : l Universal Router n a pas sweepTokenWithFee
     *     (mesure du 2026-09-28). Le plan rendra alors fraisBps 0, et c est dit, pas tu. */
    beneficiaireFrais: FEE_WALLET,
    block, pool, sqrtPriceX96, fee, blockEst0, montantUsdc, toleranceBps,
    recipient: compte, deadline: BigInt(maintenantSec) + 300n, maintenant: BigInt(maintenantSec), devise,
  });
  if (plan.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: plan.pourquoi, plan: null };

  /* ── 4. LES AUTORISATIONS AVANT LA SIMULATION ──────────────────────────────────────────── */
  const m = BigInt(plan.montantUsdc);

  /* ⛔⛔ AERODROME NE PASSE PAS PAR PERMIT2, ET LE VERIFIER QUAND MEME FERAIT SIGNER POUR RIEN.
   *     Mesure du 2026-09-28 : l adresse de Permit2 est ABSENTE du bytecode du routeur Aerodrome
   *     (temoins : factory Aerodrome PRESENTE, adresse bidon absente). Son `exactInputSingle` tire
   *     les jetons par une allowance ERC-20 DIRECTE — donc UNE signature, pas deux.
   *   ⛔ LE MONTANT EXACT, PAS LE MAXIMUM : `calldataApprove` refuse une approbation illimitee, parce
   *     qu une allowance infinie survit a la transaction. Sur le chemin Uniswap on garde le MAX vers
   *     PERMIT2 — c est son modele : Permit2 accorde ensuite au routeur une permission BORNEE dans
   *     le temps. Les deux choix sont differents parce que les deux risques sont differents. */
  if (!reglages.viaPermit2) {
    const aDirecte = await lire(rpc, devise, selecteur('allowance(address,address)') + pad(compte) + pad(R));
    if (aDirecte.etat !== 'OK') {
      return { etat: 'NON_MESURE', pourquoi: 'an approval could not be read', plan };
    }
    let assez = false;
    try { assez = BigInt(aDirecte.res) >= m; } catch (_) { assez = false; }
    if (!assez) {
      const appro = calldataApprove({ token: devise, montant: m, beneficiaire: R });
      if (appro.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: 'approval refused: ' + appro.pourquoi, plan };
      return { etat: 'APPROBATIONS', plan, pourquoi: null,
        etapes: [{ nom: 'Allow the Aerodrome router to move exactly this USDC', to: appro.to, data: appro.data, value: '0x0' }] };
    }
  } else {
  const aP2 = await lire(rpc, devise, selecteur('allowance(address,address)') + pad(compte) + pad(PERMIT2));
  const aR = await lire(rpc, PERMIT2, selecteur('allowance(address,address,address)') + pad(compte) + pad(devise) + pad(R));
  if (aP2.etat !== 'OK' || aR.etat !== 'OK') {
    /* ⛔ ON NE DEVINE PAS UNE AUTORISATION. Supposer qu elle manque ferait signer une approbation
     *   inutile ; supposer qu elle existe ferait simuler et afficher un faux refus de marche. */
    return { etat: 'NON_MESURE', pourquoi: 'an approval could not be read', plan };
  }
  let okP2 = false, okR = false;
  try { okP2 = BigInt(aP2.res) >= m; } catch (_) { okP2 = false; }
  try {
    const brut = String(aR.res).replace(/^0x/, '');
    const montantP2 = BigInt('0x' + brut.slice(0, 64));
    const expiration = BigInt('0x' + brut.slice(64, 128));
    /* ⛔ LES DEUX CONDITIONS, PAS UNE : une allowance suffisante mais EXPIREE ne vaut rien, et
     *   l oublier produirait une simulation qui reverte pour une raison illisible. La marge de
     *   60 secondes evite d envoyer une transaction qui expire pendant qu on la signe. */
    okR = montantP2 >= m && expiration > BigInt(maintenantSec + 60);
  } catch (_) { okR = false; }
  if (!okP2 || !okR) {
    const etapes = [];
    if (!okP2) etapes.push({ nom: 'Allow Permit2 to move your USDC', to: bas(devise), data: encodeApprove(PERMIT2, MAX_UINT256), value: '0x0' });
    if (!okR) etapes.push({ nom: 'Allow the Uniswap router (through Permit2)', to: bas(PERMIT2), data: encodePermit2Approve(devise, R, MAX_UINT160, MAX_UINT48), value: '0x0' });
    return { etat: 'APPROBATIONS', etapes, plan, pourquoi: null };
  }
  }

  /* ── 5. LA SIMULATION DE LA TRANSACTION EXACTE ─────────────────────────────────────────── */
  let sim;
  try { await rpc('eth_call', [{ from: compte, to: plan.appel.to, data: plan.appel.data, value: plan.appel.value }, 'latest']); sim = { ok: true }; }
  catch (e) { sim = { ok: false, message: String((e && e.message) || e) }; }
  if (!sim.ok) {
    /* ⛔⛔ LA CAUSE SE DIT EN CLAIR QUAND ON LA RECONNAIT. Un manque de fonds et un refus de marche
     *     appellent deux reponses opposees : l un envoie vers le Bridge, l autre vers le montant.
     *     Confondre les deux a deja ete mesure sur le chemin v4 (capture de Phil, Rabby mobile). */
    const sansFonds = /OutOfFunds|insufficient funds|exceeds balance|TRANSFER_FROM_FAILED|STF/i.test(sim.message);
    return {
      etat: 'REFUSE', plan,
      pourquoi: sansFonds
        ? 'not enough USDC in this wallet for that amount'
        : 'the chain refuses this exact transaction: ' + sim.message.slice(0, 160),
      sansFonds,
    };
  }
  return {
    etat: 'PRET',
    tx: { to: plan.appel.to, data: plan.appel.data, value: plan.appel.value },
    plan,
    /* ⛔ LA BORNE DE LA SIMULATION, DITE : elle decrit l etat a CET INSTANT. Le prix peut bouger
     *   entre la simulation et la signature — c est exactement pourquoi le minimum existe. */
    borne: 'The chain accepted this exact transaction just now. The price can still move before you '
      + 'sign; the guaranteed minimum is what protects you then.',
  };
}
