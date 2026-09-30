/* echange-eth.js — ACHETER UNE ACTION EN ETH : UNE TRANSACTION, SIMULEE TOUT DE SUITE.
 *
 * ⛔⛔ CE MODULE NE SIGNE RIEN. Il rend UN appel et un devis. Un wallet humain execute.
 *
 * ⛔⛔ CE MODULE S APPELAIT « LIRE CE QUI EST DEJA FAIT, NE PROPOSER QUE LE RESTE », ET TOUTE SA
 *     STRUCTURE DECOULAIT DE CA. Il lisait le solde WETH et l allowance au routeur, ne proposait
 *     que les gestes restants, et REFUSAIT DE SIMULER tant que les deux manquaient — parce qu une
 *     simulation prematuree aurait accuse LE MARCHE au lieu de l etape manquante. Le raisonnement
 *     etait juste tant que le chemin demandait trois transactions.
 *   ⇒ MESURE DU 2026-09-29 : il n en demande plus qu UNE. Le routeur Aerodrome enveloppe l ETH
 *     lui-meme (`WETH9()` rend le WETH de Base, `refundETH()` est dans son bytecode), prouve sur
 *     fork avec temoin negatif. Il n y a donc NI WETH a detenir NI allowance a donner, et tout le
 *     pre-controle a disparu.
 *   ⛔⛔ ET C EST EXACTEMENT POURQUOI `simule: true` N AVAIT JAMAIS ETE OBSERVE SUR CE CHEMIN : la
 *     simulation exigeait un etat que personne n avait. Elle est desormais faite AU PREMIER ECRAN,
 *     avec la valeur dans le `eth_call` — la passer a `0x0` reverterait, c est precisement ce que
 *     le temoin negatif du fork a montre.
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
import { FEE_WALLET } from './frais-creation.js';
import { ROUTEUR_AERODROME_CL, FACTORY_AERODROME_CL } from './calldata-aerodrome.js';
/* ⛔ LES NEUF ESPACEMENTS QUE LA FACTORY DECLARE, pas une liste ecrite ici. Une liste a la main en
 * portait SIX et cachait 9 pools sur 13, dont la plus echangee de la categorie. */
import { ESPACEMENTS_RETOMBEE } from './espacements-cl.js';
/* ⛔ LA MEME PORTE QUE LES PUCES ET QUE LE CHEMIN USDC, importee et jamais recopiee. */
import { porteDAchat, porteNotreFrais, glissementBps, TAILLE_REFERENCE_USDC } from './porte-achat.js';

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
  toleranceBps = 100, maintenantSec = null, devise = USDC_BASE, block = null } = {}) {
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

  /* ── 1bis. LE TROISIEME SAUT : la pool du BLOCK contre l ACTION ────────────────────────────────
   * ⛔⛔⛔ POURQUOI IL EXISTE. 123 blocks sont cotes dans une de nos actions tokenisees. Un visiteur
   *      qui tient de l ETH ne pouvait PAS les acheter : le bouton Buy etait MASQUE — honnete, et
   *      pas une solution. Le chemin est WETH -> USDC -> action -> block.
   *    ⛔ LES ESPACEMENTS VIENNENT DE `espacements-cl.js`, PAS D UNE LISTE ECRITE ICI. Une liste a
   *      la main a deja cache 9 pools sur 13 dans ce depot — dont TE/MUc a ts=80 et 107 505 $ de
   *      volume 24 h — parce qu elle en portait six quand la factory en declare neuf.
   *    ⛔ ET UNE POOL QUI EXISTE N EST PAS ECHANGEABLE : sur USDC/PLTRc, celle a ts=1 porte
   *      `liquidity = 0`. On exige une liquidite non nulle avant de la retenir, sinon le devis
   *      diviserait par zero et un NaN traverserait toutes les bornes. */
  let poolBlock = null;
  let blockNonMesure = 0;
  if (block !== null && block !== undefined) {
    if (!ADR.test(String(block))) return { etat: 'REFUSE', pourquoi: 'a whole block address is required' };
    if (bas(block) === bas(action)) return { etat: 'REFUSE', pourquoi: 'the block cannot be its own quote action' };
    for (const esp of ESPACEMENTS_RETOMBEE) {
      const gb = await lire(rpc, FACTORY_AERODROME_CL,
        selecteur('getPool(address,address,int24)') + pad(block) + pad(action) + motNb(esp));
      if (gb.etat === 'NON_MESURE') { blockNonMesure += 1; continue; }
      const pb = gb.etat === 'OK' ? adrDuMot(gb.res) : null;
      /* ⛔ ADRESSE NULLE = pas de pool a cet espacement. Un FAIT, pas une panne. */
      if (!pb || /^0x0{40}$/i.test(pb)) continue;
      const bs = await lire(rpc, pb, selecteur('slot0()'));
      const bf = await lire(rpc, pb, selecteur('fee()'));
      const bt0 = await lire(rpc, pb, selecteur('token0()'));
      const bl = await lire(rpc, pb, selecteur('liquidity()'));
      if (bs.etat !== 'OK' || bf.etat !== 'OK' || bt0.etat !== 'OK' || bl.etat !== 'OK') { blockNonMesure += 1; continue; }
      let liq = 0n;
      try { liq = BigInt(bl.res); } catch (_) { blockNonMesure += 1; continue; }
      if (liq === 0n) continue;                      /* ⛔ exister n est pas etre echangeable */
      const b0 = adrDuMot(bt0.res);
      if (!b0) { blockNonMesure += 1; continue; }
      poolBlock = { pool: pb, tickSpacing: esp, liquidite: liq,
        fee: (() => { try { return Number(BigInt(bf.res)); } catch (_) { return -1; } })(),
        blockEst0: bas(b0) === bas(block),
        sqrtPriceX96: BigInt('0x' + String(bs.res).replace(/^0x/, '').slice(0, 64)) };
      break;
    }
    if (!poolBlock) {
      /* ⛔⛔ « PAS DE POOL » ET « PAS PU LIRE » SONT DEUX FAITS OPPOSES, et les confondre ferait
       *     dire au visiteur que son block n est pas achetable sur une panne de noeud. */
      return blockNonMesure
        ? { etat: 'NON_MESURE', pourquoi: 'could not read the block pool (' + blockNonMesure + ' read failures)' }
        : { etat: 'REFUSE', pourquoi: 'this block has no Aerodrome CL pool against its quote action — '
          + 'a single exactInput only crosses pools of its own factory, so this route cannot be built' };
    }
  }

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

  /* ── 2ter. LES POOLS WETH <-> ACTION DIRECTES : UN SAUT DE MOINS, QUAND ELLES RENDENT PLUS ─────
   * ⛔⛔ MESURE DU 2026-09-30, apres le tweet d Aerodrome « Emissions are live » : `GOOGLc/WETH`
   *     (ts 50), `NVDAc/WETH` (ts 50) et `SPCXc/WETH` (ts 200) existent, portent de la liquidite,
   *     ET ONT LEUR PROPRE GAUGE — Aerodrome y envoie des emissions. Pour ces actions il existe
   *     donc une route DIRECTE, sans passer par l USDC.
   *   ⛔ MAIS « MOINS DE SAUTS » N EST PAS « PLUS DE SORTIE », et j ai failli le croire :
   *     `GOOGLc/WETH` fait 78 349 $ de liquidite contre 1 782 500 $ pour `GOOGLc/USDC` — 23 fois
   *     plus mince. On ne CHOISIT donc pas la route directe : on la propose au devis, qui garde la
   *     meilleure SORTIE. Un saut de moins avec 23 fois moins de profondeur peut rendre MOINS.
   *   ⛔ UNE POOL VIDE N EST PAS UNE ROUTE : `liquidity() > 0` exige, comme partout ailleurs ici.
   *   ⚠️ ET SON ABSENCE N EST PAS UN ECHEC : la plupart des actions n ont PAS de pool WETH directe.
   *     On n en refuse aucun plan — on cote ce qui existe. */
  const poolsDirectes = [];
  let directesNonMesurees = 0;
  for (const esp of ESPACEMENTS_RETOMBEE) {
    const gd = await lire(rpc, FACTORY_AERODROME_CL,
      selecteur('getPool(address,address,int24)') + pad(action) + pad(WETH_BASE) + motNb(esp));
    if (gd.etat === 'NON_MESURE') { directesNonMesurees += 1; continue; }
    const pd = gd.etat === 'OK' ? adrDuMot(gd.res) : null;
    if (!pd || /^0x0{40}$/i.test(pd)) continue;
    const ds = await lire(rpc, pd, selecteur('slot0()'));
    const df = await lire(rpc, pd, selecteur('fee()'));
    const dt0 = await lire(rpc, pd, selecteur('token0()'));
    const dl = await lire(rpc, pd, selecteur('liquidity()'));
    if (ds.etat !== 'OK' || df.etat !== 'OK' || dt0.etat !== 'OK' || dl.etat !== 'OK') { directesNonMesurees += 1; continue; }
    let liqD = 0n;
    try { liqD = BigInt(dl.res); } catch (_) { directesNonMesurees += 1; continue; }
    if (liqD === 0n) continue;
    const d0 = adrDuMot(dt0.res);
    if (!d0) { directesNonMesurees += 1; continue; }
    poolsDirectes.push({ pool: pd, tickSpacing: esp,
      fee: (() => { try { return Number(BigInt(df.res)); } catch (_) { return -1; } })(),
      wethEst0: bas(d0) === bas(WETH_BASE),
      sqrtPriceX96: BigInt('0x' + String(ds.res).replace(/^0x/, '').slice(0, 64)) });
  }

  /* ── 2bis. LE FRAIS NE SE PREND QUE SUR UN MARCHE QU ON PEUT REVENDRE ─────────────────────────
   * ⛔⛔ LE JUMEAU DU CHEMIN USDC, ET C EST POURQUOI IL EST ICI. La meme garde a ete posee dans
   *     `echange-v3.js` le 2026-09-29 (decision de Phil : « frais recu par les actions tokenized
   *     only », ou « b20 token mieux avec plus de liquidite »). La poser d un seul cote aurait fait
   *     exactement ce que ce depot a deja paye : un correctif qui rate son jumeau, et un chemin qui
   *     encaisse encore des jetons invendables pendant que l autre est propre.
   *   ⛔ LA PORTE EST CELLE DES PUCES, importee : le glissement de la pool de SORTIE, parce que
   *     c est elle qui determine EN QUOI on est paye. Le pivot WETH/USDC ne compte pas ici — la
   *     retenue porte sur le dernier saut.
   *   ⛔⛔ FAIL-CLOSED, a l inverse EXACT des puces : un frais non pris ne blesse personne, alors
   *     qu une puce fermee sur l inconnu efface le produit — panne du 2026-09-29, 13 puces -> 2. */
  /* ⛔⛔⛔ AVEC UN TROISIEME SAUT, LA POOL DE SORTIE N EST PLUS CELLE DE L ACTION. Le commentaire
   *      ci-dessus dit « la retenue porte sur le DERNIER saut, parce que c est lui qui determine EN
   *      QUOI on est paye ». Garder la pool de l action ici aurait juge la profondeur de MUc/USDC
   *      pour decider si on encaisse en TE — la bonne regle appliquee au mauvais actif. Une garde
   *      peut etre VRAIE et couvrir la mauvaise moitie ; c est exactement ce cas.
   *    ⛔ La liquidite de la pool du block est DEJA LUE (section 1bis) et non nulle, par
   *      construction : on ne la relit pas, et on ne peut donc pas diviser par zero. */
  const poolSortie = poolBlock || poolAction;
  const sortieEst0 = poolBlock ? poolBlock.blockEst0 : poolAction.actionEst0;
  let liqSortie = poolBlock ? { etat: 'OK', res: '0x' + poolBlock.liquidite.toString(16) } : null;
  if (!liqSortie) liqSortie = await lire(rpc, pool, selecteur('liquidity()'));
  const porteFrais = porteDAchat({
    glissement: liqSortie.etat === 'OK'
      ? glissementBps({ sqrtPriceX96: poolSortie.sqrtPriceX96, liquidite: BigInt(liqSortie.res),
        entree: TAILLE_REFERENCE_USDC, entreeEst0: !sortieEst0 })
      : { etat: 'NON_MESURE', pourquoi: 'liquidity() ' + liqSortie.etat },
    familleProuvee: 'aerodrome',
  });

  /* ── 3. le plan, PUR ──────────────────────────────────────────────────────────────────────── */
  /* ⛔ LE FRAIS D INTERFACE VERS LE WALLET DU DEPOT : 0,1 %, nomme par l appelant, jamais par
   *   defaut dans le module pur — et seulement si la porte dit oui. */
  const plan = planEthVersAction({ action, montantWei, poolAction, poolsPivot, recipient: compte,
    beneficiaireFrais: porteNotreFrais(porteFrais) ? FEE_WALLET : null,
    deadline: BigInt(maintenantSec) + 300n, maintenant: BigInt(maintenantSec), toleranceBps, devise,
    /* ⛔ LE TROISIEME SAUT NE PASSE QUE SI LA POOL A ETE LUE ET PROUVEE. `block` seul ne suffit
     *   pas : le plan REFUSE une pool non resolue, et c est la garde qu on veut. */
    block: poolBlock ? block : null, poolBlock,
    /* ⛔ LES ROUTES DIRECTES SONT PROPOSEES AU DEVIS, PAS IMPOSEES : il garde la meilleure SORTIE. */
    poolsDirectes });
  if (plan.etat !== 'PRET') return { etat: 'REFUSE', pourquoi: plan.pourquoi, plan: null };

  /* ⛔⛔ TROU TROUVE EN PRODUCTION LE 2026-09-28, EN VERIFIANT CE MEME DEPLOIEMENT. Le plan annoncait
   *     « la meilleure route » avec `pivotsCompares: 2` alors que TROIS espacements sont sondes : un
   *     pivot n avait pas pu etre lu (noeud public), il avait ete ecarte EN SILENCE, et « le meilleur
   *     de trois » etait devenu « le meilleur de deux » sans que personne ne le sache.
   *     C est une lecture RATEE qui passe pour une ABSENCE — le motif que je chasse depuis ce matin,
   *     et il etait dans mon propre code.
   *   ⇒ LE MANQUE VOYAGE AVEC LE PLAN. On ne refuse pas : deux pivots sur trois donnent une route
   *     utilisable. Mais l ecran doit pouvoir dire que le devis est INCOMPLET, parce qu un devis
   *     presente comme le meilleur alors qu il lui manque un candidat est une sur-vente. */
  const pivotsSondes = ESPACEMENTS_PIVOT_SONDES.length;
  const devisIncomplet = pivotsNonMesures > 0;
  const noteDevis = devisIncomplet
    ? pivotsNonMesures + ' of ' + pivotsSondes + ' candidate routes could not be read just now, so this '
      + 'is the best of ' + poolsPivot.length + ' — not necessarily the best there is.'
    : null;

  /* ── 4. LA SIMULATION, TOUT DE SUITE ──────────────────────────────────────────────────────────
   * ⛔⛔ CE QUI A DISPARU ICI, ET POURQUOI C EST UN GAIN. Ce bloc lisait le solde WETH et
   *     l allowance du compte pour n offrir que les etapes restantes, et il REFUSAIT DE SIMULER
   *     tant que les deux manquaient — « a simulation now would revert for the wrong reason ».
   *     C etait juste tant que le chemin faisait trois transactions. Ca ne l est plus : le routeur
   *     enveloppe l ETH lui-meme (`WETH9()` rend le WETH de Base, `refundETH()` est dans son
   *     bytecode), donc il n y a ni WETH a detenir ni allowance a donner.
   *   ⛔⛔ ET C EST EXACTEMENT POURQUOI `simule: true` N AVAIT JAMAIS ETE OBSERVE sur ce chemin :
   *     la simulation exigeait un etat que personne n avait. Elle devient atteignable des le
   *     premier ecran.
   *   ⛔ LA VALEUR DOIT PARTIR DANS LE `eth_call`. Simuler avec `value: '0x0'` reverterait — c est
   *     precisement ce que mon temoin negatif sur fork a montre (`status 0x0` sans valeur). Une
   *     simulation qui echoue pour la mauvaise raison ferait afficher « le marche refuse » sur un
   *     swap parfaitement valide.
   *   ⛔ ET LE COMPTE DOIT PORTER L ETH : le `from` est passe, donc un solde insuffisant se lit
   *     comme un manque de fonds et non comme un refus de marche — les deux appellent des reponses
   *     opposees. */
  const m = BigInt(plan.montantWei);
  const tx = plan.appels.find((a) => a.role === 'swap');
  if (!tx) {
    return { etat: 'NON_MESURE', pourquoi: 'the plan carries no swap call', plan,
      pivotsSondes, pivotsNonMesures, devisIncomplet, noteDevis };
  }
  let sim;
  try {
    await rpc('eth_call', [{ from: compte, to: tx.to, data: tx.data, value: '0x' + m.toString(16) }, 'latest']);
    sim = { ok: true };
  } catch (e) { sim = { ok: false, message: String((e && e.message) || e) }; }
  if (!sim.ok) {
    /* ⛔ UN MANQUE DE FONDS ET UN REFUS DE MARCHE APPELLENT DES REPONSES OPPOSEES. */
    const sansFonds = /OutOfFunds|insufficient funds|exceeds balance|TRANSFER_FROM_FAILED|STF/i.test(sim.message);
    return { etat: 'REFUSE', plan, sansFonds,
      pourquoi: sansFonds ? 'not enough ETH in this wallet for that amount'
        : 'the chain refuses this exact swap: ' + sim.message.slice(0, 160) };
  }
  /* ── ⛔⛔ LE GAZ, ET LA SIMULATION NE LE VOIT PAS ──────────────────────────────────────────────
   *     MESURE DU 2026-09-29, par une relecture adversariale, sur trois RPC Base independants et
   *     avec surcharge de solde : la borne d un `eth_call` avec `value` est EXACTEMENT
   *     `solde >= value`. Avec un solde egal au montant exact, l appel PASSE — meme en imposant
   *     600 000 de gaz a 1 000 Gwei, soit soixante fois le solde. Avec `value = montant + 1 wei`,
   *     il rend `OutOfFunds`. LE GAZ EST DONC HORS DU CONTROLE. Et `eth_estimateGas` sans
   *     `gasPrice` est aveugle de la meme facon.
   *   ⛔⛔ CONSEQUENCE, ET ELLE VISE EXACTEMENT NOTRE VISITEUR : la borne disait « The chain accepted
   *     this exact transaction just now » a quelqu un qui ne peut PAS envoyer. Le revenant du rail
   *     fiat est le cas type — l onramp lui vend de l ETH, il achete pour TOUT, il ne reste rien
   *     pour le gaz. Et cette phrase n etait JAMAIS atteignable avant : supprimer le pre-controle
   *     WETH l a rendue atteignable au premier ecran.
   *   ⛔ ON LIT DONC LE SOLDE, ET LE COUT DU GAZ, SEPAREMENT DE LA SIMULATION.
   *   ⛔ ET ON NE BLOQUE PAS SUR NOTRE AVEUGLEMENT : si une de ces lectures echoue, on laisse
   *     passer et on le DIT dans la borne. Fermer sur l inconnu a deja efface le produit une fois
   *     aujourd hui ; ici la mesure sert a AVERTIR, pas a interdire. */
  let soldeWei = null, gazUnites = null, prixGaz = null;
  try { soldeWei = BigInt(await rpc('eth_getBalance', [compte, 'latest'])); } catch (_) { soldeWei = null; }
  try {
    gazUnites = BigInt(await rpc('eth_estimateGas', [{ from: compte, to: tx.to, data: tx.data,
      value: '0x' + m.toString(16) }]));
  } catch (_) { gazUnites = null; }
  try { prixGaz = BigInt(await rpc('eth_gasPrice', [])); } catch (_) { prixGaz = null; }
  /* ⛔ MARGE DE 25 % SUR LE GAZ : le prix bouge entre le devis et la signature, et une marge est la
   *   seule facon honnete de ne pas promettre au wei pres. Elle est ECRITE, pas cachee. */
  const coutGaz = (gazUnites !== null && prixGaz !== null) ? (gazUnites * prixGaz * 125n) / 100n : null;
  const besoin = coutGaz === null ? null : m + coutGaz;
  if (soldeWei !== null && besoin !== null && soldeWei < besoin) {
    /* ⛔ ON NOMME LE GAZ, et on donne les deux chiffres : « pas assez » sans montant envoie
     *   chercher l erreur chez soi. */
    return { etat: 'REFUSE', plan, sansFonds: true,
      pourquoi: 'not enough ETH: this buy needs about ' + besoin + ' wei (amount ' + m
        + ' plus gas) and this wallet holds ' + soldeWei + ' wei' };
  }
  const gazVerifie = soldeWei !== null && besoin !== null;
  return { etat: 'PRET', plan, appels: plan.appels, simule: true,
    /* ⛔ TROIS ETATS SUR LE GAZ : verifie et suffisant / non verifie / (insuffisant a deja rendu
     *   REFUSE ci-dessus). Un booleen aurait confondu « pas verifie » et « suffisant ». */
    gaz: gazVerifie
      ? { verifie: true, soldeWei: soldeWei.toString(), besoinWei: besoin.toString() }
      : { verifie: false, pourquoi: 'could not read your balance or the gas price just now' },
    /* ⛔⛔ LES DEUX BOOLEENS ONT ETE RETIRES, ET C ETAIT UN MENSONGE TRANQUILLE. Ce champ rendait
     *     `wethSuffisant: true, allowanceSuffisante: true` — deux `true` ECRITS EN DUR, presentes
     *     comme le resultat d une verification qui n a PLUS LIEU. Un appelant les lirait comme
     *     « on a lu le solde et il suffit », alors que rien n est lu. Deux constantes ne sont pas
     *     une mesure ([[constant-output-is-not-a-measurement]]).
     *   ⛔ ET ILS N AVAIENT AUCUN LECTEUR : recherche dans tout le depot le 2026-09-29, `dejaFait`,
     *     `wethSuffisant` et `allowanceSuffisante` n apparaissent QU ICI. « Conserve pour les
     *     appelants » n avait aucun appelant derriere. Il ne reste donc que le fait vrai : ces
     *     prerequis sont sans objet. */
    dejaFait: { sansObjet: true },
    pivotsSondes, pivotsNonMesures, devisIncomplet, noteDevis,
    /* ⛔⛔ LA BORNE NE PROMET PLUS CE QU ELLE NE SAIT PAS. Elle disait « The chain accepted this
     *     exact transaction just now » — vrai pour la POOL, faux pour le compte : un `eth_call` ne
     *     verifie que `solde >= value`, jamais le gaz. On dit donc precisement ce qui a ete
     *     verifie, et on dit quand on n a pas pu verifier le gaz. */
    borne: plan.borne + (gazVerifie
      ? ' The pools accepted this exact transaction just now, and your balance covers the amount plus gas.'
      : ' The pools accepted this exact transaction just now — but we could not check that your'
        + ' balance also covers the gas, so your wallet may still refuse it.') };
}
