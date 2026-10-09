/* reference-action.js — LE MULTIPLICATEUR B20 ET LE PRIX DE REFERENCE CHAINLINK D UNE ACTION COINBASE.
 *
 * ⛔⛔ D OU VIENT CHAQUE CONSTANTE (lu le 2026-10-09, copie, jamais recite) :
 *   - https://docs.base.org/specifications/b20/tokenized-stocks-on-base.md (section « Price Feeds ») : le tableau des 10 feeds
 *     « Coinbase AAPL … Coinbase TSLA », « All feeds return 8 decimals », « update on a 0.5% price deviation or a 24-hour
 *     heartbeat », « Off-hours (nights, weekends, holidays, and corporate-action pauses) it stops updating and holds the last
 *     value », et le registre « Onchain Registry (0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD) ».
 *   - LA SIGNATURE DU REGISTRE N EST PAS DANS CES DOCS. Elle vient du source VERIFIE du contrat (Blockscout,
 *     base.blockscout.com/api/v2/smart-contracts/0x3f3E…, nom `OracleRegistry`, solc 0.8.30) :
 *         function getOracleParams(address token) external view returns (uint256 multiplier, bool paused)
 *         multiplier = IMultiplierSource(token).multiplier();   paused = _paused[token];
 *     ✅ Le code deploye (eth_getCode, 1 548 octets) est IDENTIQUE octet pour octet au `deployed_bytecode` verifie (mesure).
 *     Selecteur recalcule par keccak : 0xd4197e82 (test-reference-action-20261009.mjs le recalcule).
 *   - https://docs.base.org/base-chain/specs/reference/b20/changelog/02-cobalt-b20asset-multiplier.md : `newUIMultiplier()`
 *     0xdc767007 et `effectiveAt()` 0x97a4064f (mise a jour PROGRAMMEE, ERC-8056) ; « A pending update is live if
 *     effectiveAt() > block.timestamp ».
 *
 * ✅ MESURE SUR LA CHAINE (bloc 52 380 564, 2026-10-09T12:54Z, mainnet.base.org) :
 *   - les 10 feeds ont du code (9 571 octets chacun), `decimals()` = 8, `description()` = « Coinbase AAPL » … « Coinbase TSLA » ;
 *   - NVDA : answer 23 488 393 543 (= 234,88393543 $), updatedAt 2026-10-09T08:11:07Z ;
 *   - registre, NVDAc : multiplier 1 000 537 939 576 369 481, paused false ; MRVLc : 1e18, paused false ; GOOGLc 1 000 377 118 676 784 179 ;
 *     METAc 1 000 313 792 289 598 084 ; AAPLc 1e18 — chaque fois EGAL a `multiplier()` et `uiMultiplier()` lus sur le jeton ;
 *   - `effectiveAt()` = 0 sur ces cinq : aucune mise a jour programmee n a jamais ete posee.
 *   ⭐ LE RAPPROCHEMENT FEED -> JETON (« Coinbase NVDA » -> NVDAc) N EST PAS DEVINE SUR LE NOM : l API publique de l emetteur
 *     (api.coinbase.com/v1/tokenized-stocks, le meme jour) rend pour l ADRESSE de chaque jeton un `nav_price` et un
 *     `nav_price_updated_at` EGAUX au chiffre pres et a la seconde pres a la reponse du feed correspondant — 10 sur 10.
 *
 * ⛔ CE QUE LE PRIX DE REFERENCE EST : le prix D UN JETON (cours de l action × multiplicateur, « total return »), en dollars.
 *   Il se compare donc DIRECTEMENT au prix de pool d un jeton — sans re-multiplier (ce serait compter le multiplicateur deux fois).
 * ⛔ CE QU IL N EST PAS : un prix d execution, ni un prix « en direct ». Hors seances il garde sa derniere valeur ; pendant une
 *   operation sur titre le registre le met en pause et il se fige. On rend donc TOUJOURS `majA` et on nomme sa fraicheur.
 *
 * ⛔⛔ TROIS ETATS, POUR LE MULTIPLICATEUR COMME POUR LA REFERENCE : LU / NON_LU / NON_DISPONIBLE.
 *   Jamais un multiplicateur 1 presente comme lu sur une lecture ratee ; jamais « pas de reference » sur un noeud muet.
 */
import { ACTIONS_COINBASE } from './paires.js';

/** Copie EXACTE de docs.base.org (« Onchain Registry »). */
export const REGISTRE_ORACLE_COINBASE = '0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD';
/** keccak256('getOracleParams(address)')[0..4] — recalcule par le test. */
export const SELECTEUR_GET_ORACLE_PARAMS = '0xd4197e82';
/** keccak256('latestRoundData()') / ('decimals()') / ('newUIMultiplier()') / ('effectiveAt()') — recalcules par le test. */
export const SELECTEUR_LATEST_ROUND_DATA = '0xfeaf968c';
export const SELECTEUR_DECIMALS = '0x313ce567';
export const SELECTEUR_NEW_UI_MULTIPLIER = '0xdc767007';
export const SELECTEUR_EFFECTIVE_AT = '0x97a4064f';
/** WAD : `WAD_PRECISION()` rend 1e18 (docs.base.org). */
export const WAD = 1000000000000000000n;
/** « update on a 0.5% price deviation or a 24-hour heartbeat » (docs.base.org). Une heure de marge pour le retard d un noeud. */
export const HEARTBEAT_FEED_S = 86400;
export const MARGE_HEARTBEAT_S = 3600;

/**
 * ⛔⛔ SEUIL D ECART POOL / REFERENCE AU-DELA DUQUEL LE TICKET AVERTIT : 300 bps (3 %).
 *   C EST UNE PROPOSITION, PAS UNE MESURE NI UNE DECISION DU PROPRIETAIRE — A CONFIRMER AVEC LUI.
 *   Ce qui la borne, sans la fixer : le feed lui-meme ne bouge qu a 0,5 % d ecart (docs), donc un seuil sous 50 bps
 *   avertirait sur le bruit propre du feed ; et le week-end la pool continue de s echanger contre une reference figee.
 *   L avertissement N EMPECHE RIEN : il s affiche avant la revue, la personne decide.
 */
export const SEUIL_ECART_REFERENCE_BPS = 300;

/* Les 10 feeds du tableau de docs.base.org, rattaches a l ADRESSE du jeton lue dans paires.js (jamais retapee ici). */
const FEEDS_PAR_SYMBOLE = Object.freeze({
  AAPLc: { feed: '0x787f13dEa48Db0897CbCDD985de77809D837F988', libelle: 'Coinbase AAPL' },
  AMZNc: { feed: '0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295', libelle: 'Coinbase AMZN' },
  GOOGLc: { feed: '0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2', libelle: 'Coinbase GOOGL' },
  METAc: { feed: '0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D', libelle: 'Coinbase META' },
  MSFTc: { feed: '0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c', libelle: 'Coinbase MSFT' },
  MSTRc: { feed: '0xB3cE282CD188b35DA0E38D8Bc7d58e33173D202a', libelle: 'Coinbase MSTR' },
  NVDAc: { feed: '0x04689a41629776563E6822F76f2e57D148d28513', libelle: 'Coinbase NVDA' },
  SNDKc: { feed: '0x388b0dC46C0Fb05A74BeE0994fa5b02c6Fcca2eA', libelle: 'Coinbase SNDK' },
  SPCXc: { feed: '0x6A634B235903C4ad6376892180d6fF8612e3Fa68', libelle: 'Coinbase SPCX' },
  TSLAc: { feed: '0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4', libelle: 'Coinbase TSLA' },
});

const bas = (a) => String(a || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
/** jeton (minuscules) -> { symbole, feed, libelle } ; seuls les jetons PRESENTS dans ACTIONS_COINBASE y entrent. */
export const FEEDS_CHAINLINK = new Map(ACTIONS_COINBASE
  .filter((a) => FEEDS_PAR_SYMBOLE[a.symbole])
  .map((a) => [bas(a.adr), { symbole: a.symbole, ...FEEDS_PAR_SYMBOLE[a.symbole] }]));
const ACTIONS = new Map(ACTIONS_COINBASE.map((a) => [bas(a.adr), a.symbole]));

/** Est-ce une action Coinbase de notre registre ? */
export function estActionCoinbase(jeton) { return ACTIONS.has(bas(jeton)); }

const mot = (h, i) => {
  const s = String(h || '');
  if (!/^0x[0-9a-fA-F]*$/.test(s) || s.length < 2 + 64 * (i + 1)) return null;
  return BigInt('0x' + s.slice(2 + 64 * i, 2 + 64 * (i + 1)));
};

/** `getOracleParams` -> { multiplicateur, pause } ; null si la reponse n a pas la forme (2 mots, bool 0/1, multiplicateur > 0). */
export function decoderOracleParams(hex) {
  const m = mot(hex, 0), p = mot(hex, 1);
  if (m === null || p === null || m <= 0n || (p !== 0n && p !== 1n)) return null;
  return { multiplicateur: m, pause: p === 1n };
}

/** `latestRoundData` -> { roundId, reponse, debut, majA } ; null si moins de 5 mots ou reponse signee negative. */
export function decoderRoundData(hex) {
  const w = [0, 1, 2, 3, 4].map((i) => mot(hex, i));
  if (w.some((x) => x === null)) return null;
  /* int256 : un bit de signe a 1 = prix negatif — impossible pour une action, donc une reponse qu on ne croit pas */
  if (w[1] >= (1n << 255n)) return null;
  return { roundId: w[0], reponse: w[1], debut: w[2], majA: w[3] };
}

/** Le jour de la semaine a New York (« Sat », « Sun », …) ; null si le fuseau est illisible ici. */
function jourNY(quand) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(quand);
  } catch (_) { return null; }
}

/**
 * La fraicheur d une reference LUE.
 *   FIGE_PAUSE      : le registre a mis le feed en pause (operation sur titre) — la valeur est gelee.
 *   DERNIERE_VALEUR : week-end a New York, ou plus vieille que le battement de 24 h hors seance — le feed garde sa derniere valeur.
 *   A_JOUR          : publiee il y a moins de 24 h + 1 h, en semaine. ⛔ PAS « en direct » : le feed ne bouge qu a 0,5 %.
 *   PERIME          : plus vieille que le battement un jour ouvre — ferie, halte ou feed arrete : NON verifie, et on le dit.
 */
export function fraicheurReference({ majA, maintenantSec, pause }) {
  const age = Number(maintenantSec) - Number(majA);
  if (!Number.isFinite(age)) return { fraicheur: 'PERIME', ageS: null, pourquoi: 'the update time could not be compared with now' };
  if (pause === true) return { fraicheur: 'FIGE_PAUSE', ageS: age, pourquoi: 'paused by the issuer’s oracle registry (corporate action): the feed holds its last value' };
  const j = jourNY(new Date(Number(maintenantSec) * 1000));
  if (j === 'Sat' || j === 'Sun') return { fraicheur: 'DERNIERE_VALEUR', ageS: age, pourquoi: 'US markets are closed for the weekend: the feed holds its last value' };
  if (age <= HEARTBEAT_FEED_S + MARGE_HEARTBEAT_S) return { fraicheur: 'A_JOUR', ageS: age, pourquoi: 'within the feed’s 24 h heartbeat (it moves on a 0.5 % change)' };
  return { fraicheur: 'PERIME', ageS: age, pourquoi: 'older than the feed’s 24 h heartbeat on a weekday — holiday, trading halt or a stalled feed (not checked)' };
}

/**
 * LIRE, pour une action Coinbase : le multiplicateur + la pause (registre), la mise a jour programmee (jeton), la reference (feed).
 * ⛔ BORNE : 5 appels eth_call au plus (1 registre, 2 jeton, 2 feed), aucun s il ne s agit pas d une action du registre.
 * ⛔ TOTALE : ne jette jamais ; chaque partie porte son etat. Rendu JSON-sur (BigInt -> chaine).
 * @param {{ rpc:(m:string,p:any[])=>Promise<string>, jeton:string, maintenantSec?:number }} o
 */
export async function lireReferenceAction({ rpc, jeton, maintenantSec } = {}) {
  const j = bas(jeton);
  const now = Number.isFinite(maintenantSec) ? maintenantSec : Math.floor(Date.now() / 1000);
  const base = { jeton: j, symbole: ACTIONS.get(j) || null, luA: new Date(now * 1000).toISOString(),
    seuilEcartBps: SEUIL_ECART_REFERENCE_BPS, source: { registre: REGISTRE_ORACLE_COINBASE, feed: null } };
  if (!ADR.test(j) || !ACTIONS.has(j)) {
    const pq = 'not a Coinbase tokenized stock of our registry';
    return { ...base, multiplicateur: { etat: 'NON_DISPONIBLE', pourquoi: pq }, programme: { etat: 'NON_DISPONIBLE', pourquoi: pq },
      reference: { etat: 'NON_DISPONIBLE', pourquoi: pq } };
  }
  const appel = async (to, data) => {
    if (typeof rpc !== 'function') throw new Error('no chain reader');
    const r = await rpc('eth_call', [{ to, data }, 'latest']);
    if (typeof r !== 'string' || r === '0x') throw new Error('empty answer');
    return r;
  };
  const f = FEEDS_CHAINLINK.get(j) || null;
  if (f) base.source.feed = f.feed;
  const [rReg, rNew, rEff, rDec, rRound] = await Promise.allSettled([
    appel(REGISTRE_ORACLE_COINBASE, SELECTEUR_GET_ORACLE_PARAMS + j.slice(2).padStart(64, '0')),
    appel(j, SELECTEUR_NEW_UI_MULTIPLIER),
    appel(j, SELECTEUR_EFFECTIVE_AT),
    f ? appel(f.feed, SELECTEUR_DECIMALS) : Promise.resolve(null),
    f ? appel(f.feed, SELECTEUR_LATEST_ROUND_DATA) : Promise.resolve(null),
  ]);
  /* ── le multiplicateur et la pause ── */
  let multiplicateur, pause = null;
  const op = rReg.status === 'fulfilled' ? decoderOracleParams(rReg.value) : null;
  if (op) {
    pause = op.pause;
    multiplicateur = { etat: 'LU', valeur: op.multiplicateur.toString(), pause: op.pause, source: 'OracleRegistry.getOracleParams' };
  } else {
    /* ⛔⛔ JAMAIS 1 PAR DEFAUT : un multiplicateur non lu n a pas de valeur. */
    multiplicateur = { etat: 'NON_LU', pourquoi: rReg.status === 'rejected'
      ? 'the oracle registry did not answer: ' + String((rReg.reason && rReg.reason.message) || rReg.reason).slice(0, 80)
      : 'the oracle registry answer had an unexpected shape' };
  }
  /* ── la mise a jour programmee (ERC-8056) ── */
  let programme;
  const nv = rNew.status === 'fulfilled' ? mot(rNew.value, 0) : null, ef = rEff.status === 'fulfilled' ? mot(rEff.value, 0) : null;
  if (nv === null || ef === null) programme = { etat: 'NON_LU', pourquoi: 'newUIMultiplier() / effectiveAt() not read' };
  else if (ef > BigInt(now)) programme = { etat: 'EN_ATTENTE', nouveau: nv.toString(), effectifA: new Date(Number(ef) * 1000).toISOString() };
  else programme = { etat: 'AUCUN', pourquoi: ef === 0n ? 'no scheduled update was ever recorded' : 'the last scheduled update already applied' };
  /* ── la reference Chainlink ── */
  let reference;
  if (!f) {
    reference = { etat: 'NON_DISPONIBLE', pourquoi: 'no Chainlink feed for this stock is listed in Base’s documentation' };
  } else {
    const dec = rDec.status === 'fulfilled' ? mot(rDec.value, 0) : null;
    const rd = rRound.status === 'fulfilled' ? decoderRoundData(rRound.value) : null;
    if (dec === null || dec > 36n || !rd || rd.reponse <= 0n || rd.majA <= 0n) {
      reference = { etat: 'NON_LU', feed: f.feed, pourquoi: (rDec.status === 'rejected' || rRound.status === 'rejected')
        ? 'the Chainlink feed did not answer' : 'the Chainlink feed answer had an unexpected shape (no price or no update time)' };
    } else {
      const d = Number(dec);
      const fr = fraicheurReference({ majA: Number(rd.majA), maintenantSec: now, pause });
      reference = { etat: 'LU', feed: f.feed, libelle: f.libelle, reponse: rd.reponse.toString(), decimales: d,
        prixUsd: Number(rd.reponse) / 10 ** d, majA: new Date(Number(rd.majA) * 1000).toISOString(), roundId: rd.roundId.toString(),
        ...fr, pauseLue: pause !== null };
    }
  }
  return { ...base, multiplicateur, programme, reference };
}

/** Ecart signe en bps du prix de pool contre la reference. null si l un des deux manque. (Des PRIX, jamais des montants bruts.) */
export function ecartReferenceBps(prixPoolUsd, prixReferenceUsd) {
  const p = Number(prixPoolUsd), r = Number(prixReferenceUsd);
  if (!(p > 0) || !(r > 0) || !Number.isFinite(p) || !Number.isFinite(r)) return null;
  return Math.round(((p - r) / r) * 10000);
}

const age = (s) => (s === null || s === undefined || !Number.isFinite(s) ? 'unknown age'
  : s < 3600 ? Math.max(1, Math.round(s / 60)) + ' min ago' : s < 172800 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago');
const usd = (x) => '$' + Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Ce que le ticket dit de la reference. { texte, alerte } — `alerte` = l ecart depasse le seuil (la ligne d avertissement).
 * ⛔ « last close » / « frozen » / « stale » sont DITS ; une reference non lue ou absente n alerte jamais (rien a comparer).
 */
export function phraseReference(r, prixPoolUsd, symbole = 'this stock') {
  const ref = r && r.reference;
  if (!ref || !ref.etat) return { texte: 'Chainlink reference: not read yet.', alerte: false, ecartBps: null };
  if (ref.etat === 'NON_DISPONIBLE') return { texte: 'No Chainlink reference price is published for ' + symbole + '.', alerte: false, ecartBps: null };
  if (ref.etat !== 'LU') return { texte: 'Chainlink reference: not read — retrying.', alerte: false, ecartBps: null };
  const qual = ref.fraicheur === 'A_JOUR' ? 'updated ' + age(ref.ageS)
    : ref.fraicheur === 'DERNIERE_VALEUR' ? 'last value, held while markets are closed (' + age(ref.ageS) + ')'
    : ref.fraicheur === 'FIGE_PAUSE' ? 'FROZEN by the issuer for a corporate action (' + age(ref.ageS) + ')'
    : 'STALE — not updated for ' + age(ref.ageS).replace(' ago', '');
  let texte = 'Chainlink reference ' + usd(ref.prixUsd) + ' per token — ' + qual + '.';
  const e = ecartReferenceBps(prixPoolUsd, ref.prixUsd);
  const seuil = Number.isFinite(Number(r.seuilEcartBps)) ? Number(r.seuilEcartBps) : SEUIL_ECART_REFERENCE_BPS;
  const alerte = e !== null && Math.abs(e) > seuil;
  if (e !== null) {
    texte += ' On-chain market price ' + usd(prixPoolUsd) + ' (' + (e >= 0 ? '+' : '') + (e / 100).toFixed(2) + ' %).';
    if (alerte) {
      texte += ' ⚠ The on-chain market is ' + (Math.abs(e) / 100).toFixed(2) + ' % ' + (e > 0 ? 'above' : 'below')
        + ' the reference' + (ref.fraicheur === 'A_JOUR' ? '' : ' (a reference that is not current — compare with care)')
        + ': check the price before you review.';
    }
  }
  return { texte, alerte, ecartBps: e };
}
