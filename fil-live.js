// fil-live.js — l historique EN DIRECT de l app : blocks crees et achats / ventes sur leurs marches.
// ================================================================================================
// ⛔ DEMANDE DE PHIL (2026-09-13) : « l historique en live direct de l app avec creation de block, swap, le
//    defilement dans l onglet Social ». Le fil existant ne montrait que des Transfer sur 2 000 blocs, sans
//    creation (event B20Created) ni swap (event Swap du PoolManager v4).
// ⛔ TOUT EST LU SUR LA CHAINE, RIEN N EST STOCKE PAR NOUS : creations = logs de la factory, swaps = logs Swap
//    du PoolManager filtres sur les pools ETH natif des blocks suivis (cles de `marche.js`). Mesure du
//    2026-09-13 : un OU de 468 identifiants de pool sur topic1 est accepte par le noeud public.
// ⛔ ACHAT / VENTE VIENNENT DE `achatDepuisSwap` (achats.js, teste), jamais recalcules ici — et seulement
//    quand les decimales du block sont CONNUES. Sinon l evenement reste « SWAP », sans quantite inventee.
// ⚠️ Le routeur n est pas l acheteur : ce module ne nomme personne.
import { listerCreations } from './index-blocks.js';
import { listerAchats, achatDepuisSwap } from './achats.js';
import { CLES_MARCHE } from './marche.js';
import { cleDePool, poolId } from './pool.js';

const ETH_NATIF = '0x0000000000000000000000000000000000000000';
export const TYPES_LIVE = ['CREATION', 'ACHAT', 'VENTE', 'SWAP'];
/** Identifiants de pool par requete : sous la mesure de 468, avec de la marge. */
export const IDS_PAR_REQUETE = 400;

/** Les pools a suivre pour une liste de blocks : { poolId -> { cle, jeton, sym, dec } }. */
export function poolsSuivies(blocks) {
  const out = new Map();
  for (const b of blocks || []) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(String(b && b.jeton))) continue;
    for (const k of CLES_MARCHE) {
      const cle = cleDePool(ETH_NATIF, b.jeton, { fee: k.fee, tickSpacing: k.tickSpacing });
      out.set(poolId(cle), { cle, jeton: String(b.jeton).toLowerCase(), sym: b.sym ?? null,
        dec: Number.isInteger(b.dec) ? b.dec : null });
    }
  }
  return out;
}

/**
 * Les evenements entre `deBloc` et `aBloc` inclus, du plus recent au plus ancien.
 * @returns {Promise<{evenements:object[], fenetresRatees:object[]}>}
 * ⛔ Une fenetre ratee est rendue, jamais comptee comme silence.
 */
export async function evenementsLive({ rpc, poolManager, blocks, deBloc, aBloc, pause = 0,
  lireCreations = listerCreations }) {
  const evenements = [], fenetresRatees = [];
  const vus = new Set();
  const ajouter = (e) => {
    const k = e.type + ':' + e.tx + ':' + e.jeton + ':' + (e.logIndex ?? '');
    if (vus.has(k)) return;
    vus.add(k);
    evenements.push(e);
  };

  const cr = await lireCreations({ rpc, blocs: Math.max(0, aBloc - deBloc), fin: aBloc });
  for (const f of cr.fenetresRatees || []) fenetresRatees.push({ ...f, quoi: 'creations' });
  for (const c of cr.creations || []) {
    if (!Number.isFinite(c.bloc) || c.bloc < deBloc || c.bloc > aBloc) continue;
    ajouter({ type: 'CREATION', bloc: c.bloc, jeton: String(c.jeton).toLowerCase(), sym: c.symbole ?? null, tx: c.tx ?? null });
  }

  const pools = poolsSuivies(blocks);
  const ids = [...pools.keys()];
  for (let i = 0; i < ids.length; i += IDS_PAR_REQUETE) {
    const r = await listerAchats({ rpc, poolManager, poolIds: ids.slice(i, i + IDS_PAR_REQUETE), deBloc, aBloc, pause });
    for (const f of r.fenetresRatees || []) fenetresRatees.push({ ...f, quoi: 'swaps' });
    for (const s of r.swaps || []) {
      const p = pools.get(s.poolId);
      if (!p) continue;
      let type = 'SWAP', quantite = null, eth = null;
      if (p.dec !== null) {
        const a = achatDepuisSwap({ swap: s, cle: p.cle, jeton: p.jeton, decJeton: p.dec, decDevise: 18 });
        if (a.etat === 'ACHAT' || a.etat === 'VENTE') { type = a.etat; quantite = a.quantiteBlockTexte; eth = a.quantiteDeviseTexte; }
      }
      ajouter({ type, bloc: s.blockNumber, jeton: p.jeton, sym: p.sym, tx: s.txHash, logIndex: s.logIndex, quantite, eth });
    }
  }
  evenements.sort((a, b) => (b.bloc ?? 0) - (a.bloc ?? 0) || (b.logIndex ?? 0) - (a.logIndex ?? 0));
  return { evenements, fenetresRatees };
}
