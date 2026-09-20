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
import { listerCreations, TOPIC_TRANSFER, decoderTransfer, topicAdresse } from './index-blocks.js';
import { messageDepuisTransfert, FRAIS_MESSAGE_TBLOCK } from './messagerie-blocks.js';
import { FEE_WALLET, CREATE_ROUTER } from './frais-creation.js';
import { listerAchats, achatDepuisSwap, sensDuSwap } from './achats.js';
import { formaterUnites } from './montants.js';
import { CLES_MARCHE, CLE_TBLOCK } from './marche.js';
import { cleDePool, poolId } from './pool.js';
import { TBLOCK } from './tokenomics.js';
import { confianceDe } from './pools-du-jeton.js';

const ETH_NATIF = '0x0000000000000000000000000000000000000000';
/* ⛔ GM = greeting fragment, not a dump. >1M of a sealed 1B supply is a move, not a GM (Clansy 2026-09-14). */
const GM_MAX_UNITES = 1_000_000n * 10n ** 18n;
/* ⛔ PHIL (2026-09-14) : « t as oublie les swaps, send, GM — n oublie rien ». GM = envoi d un block entre deux wallets
 *    (ni creation, ni jambe de swap) ; NOTE = transfert de 0 portant un message ; MESSAGE = message PAYE entre blocks. */
export const TYPES_LIVE = ['CREATION', 'ACHAT', 'VENTE', 'SWAP', 'GM', 'NOTE', 'MESSAGE'];

/** True if create went through CreateRouter (paid ETH fee path).
 * ⛔ Raksha 2026-09-14: do NOT key on 50M mint — fee is ETH only; supply is 100% creator. */
async function creationPayee({ rpc, tx }) {
  if (!tx || !rpc) return false;
  try {
    const raw = await rpc('eth_getTransactionByHash', [tx]);
    if (raw && String(raw.to || '').toLowerCase() === String(CREATE_ROUTER).toLowerCase()) return true;
  } catch (_) { /* unread ≠ unpaid */ }
  return false;
}


export const JETONS_PAR_REQUETE = 50;
const ZERO = '0x0000000000000000000000000000000000000000';

/** getLogs qui coupe en deux une fenetre refusee comme trop grosse, jusqu a 250 blocs ; les echecs sont rendus. */
async function logsAdaptatifs(rpc, filtre, de, a, ratees, quoi) {
  try {
    return await rpc('eth_getLogs', [{ ...filtre, fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }]);
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/too large|-32020|limit exceeded|too many/i.test(msg) && a - de + 1 > 250) {
      const m = de + Math.floor((a - de) / 2);
      const x = await logsAdaptatifs(rpc, filtre, de, m, ratees, quoi);
      const y = await logsAdaptatifs(rpc, filtre, m + 1, a, ratees, quoi);
      return [...(x || []), ...(y || [])];
    }
    ratees.push({ de, a, cause: msg, quoi });
    return null;
  }
}
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
        dec: Number.isInteger(b.dec) ? b.dec : null, confiance: confianceDe(cle) });
    }
    /* ⛔ la paire TBLOCK/block du lancement de l app est suivie elle aussi (elle ne l etait pas, mesure 2026-09-14) */
    if (String(b.jeton).toLowerCase() !== TBLOCK.toLowerCase()) {
      const cle = cleDePool(TBLOCK, b.jeton, CLE_TBLOCK);
      out.set(poolId(cle), { cle, jeton: String(b.jeton).toLowerCase(), sym: b.sym ?? null,
        dec: Number.isInteger(b.dec) ? b.dec : null, confiance: confianceDe(cle) });
    }
  }
  return out;
}

/** Unites brutes -> texte decimal exact (sans flottant). */
function formaterBrut(v, dec) {
  const base = 10n ** BigInt(dec);
  const ent = v / base, frac = (v % base).toString().padStart(dec, '0').replace(/0+$/, '');
  return ent.toString() + (frac ? '.' + frac : '');
}

/** Le nom de la devise d une pool, SEULEMENT si elle est prouvee : ETH natif (0x0) ou TBLOCK. Sinon null. */
function deviseConnue(cle, jeton) {
  const autre = String(cle.currency0).toLowerCase() === String(jeton).toLowerCase() ? cle.currency1 : cle.currency0;
  const a = String(autre).toLowerCase();
  if (a === ETH_NATIF) return { nom: 'ETH', dec: 18 };
  if (a === TBLOCK.toLowerCase()) return { nom: 'TBLOCK', dec: 18 };
  return null;
}

/**
 * Les evenements entre `deBloc` et `aBloc` inclus, du plus recent au plus ancien.
 * @returns {Promise<{evenements:object[], fenetresRatees:object[]}>}
 * ⛔ Une fenetre ratee est rendue, jamais comptee comme silence.
 */
export async function evenementsLive({ rpc, poolManager, blocks, deBloc, aBloc, pause = 0,
  lireCreations = listerCreations, poolsDecouvertes = null, lireTransferts = true }) {
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
    const jeton = String(c.jeton).toLowerCase();
    const tx = c.tx ?? null;
    /* ⛔ Paid = CreateRouter tx.to (ETH fee). External / factory-raw = unpaid. */
    let paidCreate = false;
    if (tx) {
      paidCreate = await creationPayee({ rpc, tx });
      if (pause) await new Promise((r) => setTimeout(r, pause));
    }
    ajouter({ type: 'CREATION', bloc: c.bloc, jeton, sym: c.symbole ?? null, tx,
      dec: Number.isInteger(c.decimales) ? c.decimales : null, paidCreate });
  }

  const pools = poolsSuivies(blocks);
  /* ⛔ les pools DECOUVERTES (Initialize) des blocks suivis s ajoutent aux cles devinees — jamais celles d un autre jeton */
  if (poolsDecouvertes && typeof poolsDecouvertes.forEach === 'function') {
    const decs = new Map((blocks || []).map((b) => [String(b.jeton).toLowerCase(), b]));
    poolsDecouvertes.forEach((p, id) => {
      const b = decs.get(String(p.jeton).toLowerCase());
      if (!b || pools.has(id)) return;
      pools.set(id, { cle: p.cle, jeton: String(p.jeton).toLowerCase(), sym: b.sym ?? null,
        dec: Number.isInteger(b.dec) ? b.dec : null, confiance: p.confiance || confianceDe(p.cle) });
    });
  }
  const ids = [...pools.keys()];
  /* ⛔⛔ MESURE (2026-09-14, 3 « GM » BLST) : chaque transaction contenait un Swap, et le block passait PoolManager ->
   *    routeur tiers (contrat) -> wallet. Un transfert d une transaction qui porte un Swap est une JAMBE D ECHANGE, pas un GM. */
  const txSwaps = new Set();
  for (let i = 0; i < ids.length; i += IDS_PAR_REQUETE) {
    const r = await listerAchats({ rpc, poolManager, poolIds: ids.slice(i, i + IDS_PAR_REQUETE), deBloc, aBloc, pause });
    for (const f of r.fenetresRatees || []) fenetresRatees.push({ ...f, quoi: 'swaps' });
    for (const s of r.swaps || []) {
      if (s.txHash) txSwaps.add(String(s.txHash).toLowerCase());
      const p = pools.get(s.poolId);
      if (!p) continue;
      let type = 'SWAP', quantite = null, eth = null, fraisMarche = false;
      const confiance = p.confiance || confianceDe(p.cle);
      const devise = deviseConnue(p.cle, p.jeton);
      /* ⛔⛔ CORRIGE LE 2026-09-20 (Phil : « Feed = buy, Kill = sell, divise le Swap en 2 »).
       * L ANCIENNE REGLE exigeait `confiance !== 'HOOK'` avant de classer quoi que ce soit. Mesure du
       * jour sur la page en prod : 118 pools sur 118 portent un hook — donc AUCUN swap n etait jamais
       * classe. « Feed » et « Kill » affichaient 0 pendant que « Swap » affichait 1 306, et le fil
       * disait « traded » pour tout, alors que la chaine dit QUI A ACHETE.
       * Ce que la source d Uniswap v4 prouve (PoolManager.sol:240, « event is emitted before the
       * afterSwap call ») : l evenement porte le delta du trader AVANT la part du hook. Un hook REDUIT
       * un montant recu, il ne lui change pas son SIGNE. Le sens est donc prouve, hook ou pas.
       * ⚠️ CE QUI RESTE VRAI DE L ANCIENNE PRUDENCE, et qui voyage maintenant avec l evenement :
       *    sur une pool a hook, le montant du cote non specifie est celui d AVANT le frais du marche.
       *    D ou `fraisMarche` — l ecran doit ecrire « avant le frais de ce marche », pas un chiffre net. */
      const sens = sensDuSwap({ swap: s, cle: p.cle, jeton: p.jeton });
      if (sens.etat === 'ACHAT' || sens.etat === 'VENTE') {
        type = sens.etat;
        fraisMarche = confiance === 'HOOK';
        if (p.dec !== null) quantite = formaterUnites(sens.quantiteBlock, p.dec);
        if (devise) eth = formaterUnites(sens.quantiteDevise, devise.dec);
      }
      ajouter({ type, bloc: s.blockNumber, jeton: p.jeton, sym: p.sym, tx: s.txHash, logIndex: s.logIndex, quantite, eth,
        devise: type === 'SWAP' || !devise ? null : devise.nom, confiance, fraisMarche, verifie: type !== 'SWAP' });
    }
  }
  if (lireTransferts && Number.isSafeInteger(deBloc) && Number.isSafeInteger(aBloc) && aBloc >= deBloc) {
    const pm = String(poolManager || '').toLowerCase();
    const parJeton = new Map((blocks || []).filter((b) => /^0x[0-9a-fA-F]{40}$/.test(String(b.jeton)))
      .map((b) => [String(b.jeton).toLowerCase(), b]));
    const jetons = [...parJeton.keys()];
    /* ── GM et notes : les transferts des blocks suivis, hors creation (from 0x0) et hors jambes de swap (PoolManager) ── */
    for (let i = 0; i < jetons.length; i += JETONS_PAR_REQUETE) {
      for (let de = deBloc; de <= aBloc; de += 2000) {
        const a = Math.min(aBloc, de + 1999);
        if (pause > 0) await new Promise((ok) => setTimeout(ok, pause));
        const logs = await logsAdaptatifs(rpc, { address: jetons.slice(i, i + JETONS_PAR_REQUETE), topics: [TOPIC_TRANSFER] }, de, a, fenetresRatees, 'transfers');
        for (const l of logs || []) {
          const t = decoderTransfer(l);
          if (!t || t.value === null) continue;
          const b = parJeton.get(String(t.token));
          if (!b || t.from === ZERO || t.from === pm || t.to === pm) continue;
          if (t.tx && txSwaps.has(String(t.tx).toLowerCase())) continue;
          const dec = Number.isInteger(b.dec) ? b.dec : null;
          if (t.value > 0n && t.value > GM_MAX_UNITES) continue; /* dump/move ≠ GM */
          ajouter({ type: t.value === 0n ? 'NOTE' : 'GM', bloc: t.bloc, jeton: t.token, sym: b.sym ?? null, tx: t.tx, logIndex: t.logIndex,
            de: t.from, a: t.to, quantite: dec !== null && t.value > 0n ? formaterBrut(t.value, dec) : null });
        }
      }
    }
    /* ── messages PAYES entre blocks : TBLOCK -> wallet de frais, au moins le frais, relus un par un ── */
    for (let de = deBloc; de <= aBloc; de += 2000) {
      const a = Math.min(aBloc, de + 1999);
      const logs = await logsAdaptatifs(rpc, { address: TBLOCK.toLowerCase(), topics: [TOPIC_TRANSFER, null, topicAdresse(FEE_WALLET)] }, de, a, fenetresRatees, 'messages');
      for (const l of logs || []) {
        const t = decoderTransfer(l);
        if (!t || typeof t.value !== 'bigint' || t.value < FRAIS_MESSAGE_TBLOCK) continue;
        let tx = null;
        try { tx = await rpc('eth_getTransactionByHash', [t.tx]); } catch (e) { tx = null; }
        const m = messageDepuisTransfert(t, tx);
        if (m.etat !== 'MESSAGE' && m.etat !== 'MESSAGE_FEE') continue;
        ajouter({ type: 'MESSAGE', bloc: t.bloc, jeton: m.a || m.de || null, sym: null, tx: t.tx, logIndex: t.logIndex,
          de: m.de, a: m.a, texte: m.texte, signataire: m.signataire, aaOpaque: m.aaOpaque || m.etat === 'MESSAGE_FEE' });
      }
    }
  }
  evenements.sort((a, b) => (b.bloc ?? 0) - (a.bloc ?? 0) || (b.logIndex ?? 0) - (a.logIndex ?? 0));
  return { evenements, fenetresRatees };
}
