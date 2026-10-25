/* actions-chaine.js — LES ACTIONS TOKENISEES DE L EMETTEUR, PROUVEES SUR LA CHAINE UNE PAR UNE (2026-10-25).
 *
 * ⛔⛔ POURQUOI CE MODULE. Recensement du 2026-10-24 (bloc 53 040 674, lecture seule) : l emetteur liste 202 actions ; l app en connait
 *   71 (STOCKS_BASE_REGISTRY / ACTIONS_COINBASE, figes) et le serveur n en marquait que 100 — `decodeActionsEmetteur` ne lisait que la
 *   PREMIERE page d une API paginee (100 + 100 + 2) et rendait `OK`. Le Market montrait MSFTc sans sa marque d origine (prod, 24/10).
 *
 * ⛔⛔⛔ UNE ACTION N EST LISTEE QUE PROUVEE, ET LA PREUVE NE REPOSE NI SUR UN EVENEMENT SEUL NI SUR UN PREFIXE :
 *   1. `eth_getCode(jeton) === '0xef'` EXACTEMENT — le marqueur natif des B20 (faits.js : EIP-3541 interdit a tout contrat deploye de
 *      commencer par 0xEF, il est infalsifiable). Le prefixe `0xb2…` d une adresse, lui, se mine : il n est JAMAIS regarde ici.
 *   2. le RECU de la transaction de creation : `status === 0x1` et un log `B20Created` dont l EMETTEUR est la factory 0xb20f…, avec
 *      `topics[1]` = le jeton. Un log identique emis par un autre contrat (un spam qui imite l evenement) est REFUSE, nomme.
 *   3. la TRANSACTION elle-meme : `tx.from` = le createur des 202 (GRAINE_CREATEUR) et `tx.to` = le contrat qu il appelle (GRAINE_APPELE).
 *      Un evenement dit ce qui a ete emis ; seule la transaction dit qui a signe (index-blocks.js, meme regle).
 *   ⇒ Un B20 NATIF cree par un AUTRE wallet (n importe qui peut appeler la factory) passe 1 et 2 et tombe en 3 : c est l usurpation
 *     que ce module refuse.
 *
 * ⛔ TROIS ETATS PAR ACTION, JAMAIS DEUX : PROUVE, REFUSE (et pourquoi, un code), NON_MESURE (une lecture n a pas abouti — ce n est pas
 *   un refus, on reessaie au tour suivant). Une preuve ou un refus est definitif (le code d un B20, son recu et sa transaction ne
 *   changent pas) ; seul le nombre d unites (totalSupply) et l etat des pools bougent, et ils sont relus.
 * ⛔⛔ 2026-10-25 (revue) : UN REFUS N EST QU UNE CONTRADICTION PROUVEE PAR UN NOEUD QUI A SERVI LA DONNEE. Un `getCode` qui rend `0x`
 *   (noeud en retard, ou qui n a pas lu), un recu ou une tx « d une autre transaction » (reponse decalee d un noeud), une exception :
 *   NON_MESURE, relu au tour suivant, JAMAIS grave. Refus = du code present mais pas 0xef, un recu status 0x0, aucun log de la factory
 *   dans un recu servi, un createur ou un appele differents. Et un refus est REJUGE quand une AUTRE tx de creation est annoncee.
 *
 * ⛔ BORNES, DITES :
 *   - la liaison « ce createur = Coinbase » vient de la liste de l EMETTEUR (les 202 lui sont toutes rattachees), pas de la chaine ;
 *   - une action creee par ce wallet et ABSENTE de la liste n est candidate que si le serveur a vu sa creation (scan vers l avant) ;
 *   - le verdict de route (routeAction) dit ce qu une pool de NOTRE factory cote a 10 USDC, au moment de la lecture ; ce n est pas une
 *     promesse d execution : la fiche re-cote et passe sa porte de glissement avant toute signature.
 * Pur : `rpc` injecte, aucune ecriture, aucune signature. */
import { FACTORY, TOPIC_CREATED, decoderCreation } from './index-blocks.js';
import { selecteur } from './keccak.js';
import { FACTORY_AERODROME_CL } from './calldata-aerodrome.js';
import { QUOTEUR_AERODROME_CL, SIG_QUOTE_IN } from './rolls-en-action.js';
import { ESPACEMENTS_RETOMBEE } from './espacements-cl.js';
import { USDC_BASE } from './frais-creation.js';
/* l ADMISSION du planificateur de la fiche (plan-aerodrome-segment.js) : le frais se prend dans le jeton de sortie, admis seulement s il
 *  est ETH, une devise de base ou une action du REGISTRE (paires.js). Meme fonction, pas une copie. */
import { estDeviseConnue } from './pool-sans-hook.js';
import { GRAINE_ACTIONS, GRAINE_CREATEUR, GRAINE_APPELE, GRAINE_BLOC } from './actions-chaine-graine.js';

export const CREATEUR_EMETTEUR = GRAINE_CREATEUR;
export const APPELE_EMETTEUR = GRAINE_APPELE;
export { GRAINE_BLOC };
export const ETATS_PREUVE = Object.freeze(['PROUVE', 'REFUSE', 'NON_MESURE']);
/** au plus N preuves NEUVES par tour (5 lectures chacune) : un demarrage a froid sans disque coute 202 x 5 lectures, etalees */
export const PREUVES_PAR_TOUR = 40;
/** au plus N verdicts de route relus par tour (<= 9 getPool + 2 par pool + 2) */
export const ROUTES_PAR_TOUR = 20;
/** LA REGLE DU BUY HORS TABLE — la meme que misables.js (branche claude/misables-20261024, MESURE_REFERENCE) : 10 USDC doivent couter
 *  au plus 1 % de plus que le prix moyen du slot0 (frais de la pool compris). La mesure du 24/10 trouve un TROU entre 64 bps et 396 bps
 *  sur les pools de notre factory : le seuil tombe dedans. Et la pool tient au moins 500 USDC (le plancher de la table mesuree
 *  POOLS_ACTIONS_AERODROME et du Buy du Market). */
export const DEVIS_USDC = 10_000_000n;
export const ECART_MAX_BPS = 100;
export const USDC_MIN_POOL = 500_000_000n;
export const ROUTE_TTL_MS = 30 * 60 * 1000;
/** 2026-10-25 (revue) : la perte maximale d un aller-retour de 10 USDC (achat puis revente de ce qu il rend), cotes au meme bloc */
export const PERTE_ALLER_RETOUR_MAX_BPS = 200;
/** une absence de pool (getPool = 0x0) est relue apres ce delai ; une pool trouvee ne l est jamais */
export const POOL_ABSENTE_TTL_MS = 6 * 60 * 60 * 1000;
/** ⛔ LES POOLS DONT L ACHAT A ECHOUE A L EXECUTION, malgre leur profondeur : un devis n est pas une execution. Pool copiee de la sonde
 *  du 2026-10-25 (getPool sur notre factory) ; c est celle que pools-actions-aerodrome.js ecarte (« SEc (0x0274…4547) ») : l achat
 *  revertait sur fork le 2026-10-09 et le 2026-10-10 (bloc 52 432 772, « Too little received » des 10 USDC). Elle reste refusee tant
 *  qu un banc fork ne l a pas executee. */
/* ⛔⛔ 2026-10-25 (banc fork, bloc 53 043 890) : SEc S EXECUTE MAINTENANT — 10 USDC achetes par le planificateur de la fiche (qui SIMULE
 *   la sequence depuis le 2026-10-10 ; les revert des 09 et 10 venaient d un minimum au spot non simule). Elle entre au registre et a la
 *   table (paires.js, pools-actions-aerodrome.js) ; sa pool sort d ici. Le mecanisme reste : une pool qui cote et reverte a l execution
 *   y revient, avec la date du banc qui l a vue echouer. */
export const POOLS_REFUSEES_EXECUTION = new Map([]);
export const UNITES_TTL_MS = 6 * 60 * 60 * 1000;

const ADR = /^0x[0-9a-fA-F]{40}$/, TX = /^0x[0-9a-fA-F]{64}$/;
const bas = (x) => String(x || '').toLowerCase();
const motA = (a) => bas(a).slice(2).padStart(64, '0');
const mot = (n) => BigInt(n).toString(16).padStart(64, '0');
const motI24 = (n) => { const v = BigInt(n); return (v < 0n ? v + (1n << 256n) : v).toString(16).padStart(64, '0'); };
const premierMot = (hex) => { const h = String(hex || ''); if (!/^0x[0-9a-fA-F]{64,}$/.test(h)) throw new Error('short answer'); return BigInt('0x' + h.slice(2, 66)); };
const court = (e) => String((e && e.message) || e).slice(0, 120);
const SEL = Object.freeze({
  totalSupply: selecteur('totalSupply()'), getPool: selecteur('getPool(address,address,int24)'), balanceOf: selecteur('balanceOf(address)'),
  liquidity: selecteur('liquidity()'), slot0: selecteur('slot0()'), quoteIn: selecteur(SIG_QUOTE_IN),
});

/** la graine, en Map jeton -> { tx, bloc, symbole } (copiee du recensement, relue par prouverAction) */
export const CREATIONS_GRAINE = new Map(GRAINE_ACTIONS.map(([j, tx, bloc, symbole]) => [j, Object.freeze({ tx, bloc, symbole })]));

const refus = (adr, code, pourquoi, extra = {}) => ({ etat: 'REFUSE', adr, code, pourquoi, ...extra });
const nonMesure = (adr, code, pourquoi) => ({ etat: 'NON_MESURE', adr, code, pourquoi });

/**
 * PROUVE UNE ACTION. Cinq lectures au plus : le code, le recu, la transaction. Rend { etat, adr, code?, pourquoi?, symbole, nom,
 * decimales, tx, bloc, createur } — PROUVE seulement si les TROIS preuves passent.
 * @param {(methode:string, params:any[]) => Promise<any>} p.rpc  eth_getCode / eth_getTransactionReceipt / eth_getTransactionByHash
 * @param {string} p.adr   le jeton candidat
 * @param {?string} p.tx   le hash de sa transaction de creation (graine, ou scan des creations du serveur)
 */
export async function prouverAction({ rpc, adr, tx, createur = CREATEUR_EMETTEUR, appele = APPELE_EMETTEUR }) {
  const a = bas(adr);
  if (!ADR.test(a)) return refus(a, 'ADRESSE', 'not a whole address');
  const t0 = TX.test(String(tx || '')) ? bas(tx) : null;
  const refusTx = (code, pourquoi, extra = {}) => refus(a, code, pourquoi, { tx: t0, ...extra });
  let code;
  try { code = await rpc('eth_getCode', [a, 'latest']); } catch (e) { return nonMesure(a, 'CODE_NON_LU', 'code not read: ' + court(e)); }
  if (typeof code !== 'string') return nonMesure(a, 'CODE_NON_LU', 'the node gave no code answer');
  /* ⛔⛔ `0x` SUR MAINNET = NON LU, JAMAIS « pas de contrat » (2026-10-25, revue : un seul `0x` d un noeud en retard de-listait une vraie
   *   action POUR TOUJOURS, refus grave sur disque). Seul du code PRESENT et different de 0xef contredit. */
  if (!/^0x[0-9a-fA-F]+$/.test(code)) return nonMesure(a, 'CODE_VIDE', 'the node answered an empty code (not read, not « no contract »)');
  /* ⛔ EXACTEMENT 0xef : pas « commence par », pas le prefixe d adresse. Un contrat deploye ne peut pas commencer par 0xEF (EIP-3541). */
  if (bas(code) !== '0xef') return refusTx('MARQUEUR', 'its code is not exactly 0xef: it is not a native B20, whatever its address looks like', { codeLu: bas(code).slice(0, 14) });
  if (!t0) return nonMesure(a, 'SANS_TX', 'its creation transaction is not known yet');
  let recu;
  try { recu = await rpc('eth_getTransactionReceipt', [t0]); } catch (e) { return nonMesure(a, 'RECU_NON_LU', 'creation receipt not read: ' + court(e)); }
  if (!recu || typeof recu !== 'object') return nonMesure(a, 'RECU_NON_LU', 'the node has no receipt for that transaction (not measured, not absent)');
  /* une reponse pour une AUTRE tx est un noeud qui deraille, pas une contradiction de la chaine : non mesure */
  if (bas(recu.transactionHash) !== t0) return nonMesure(a, 'RECU_AUTRE', 'the receipt answered is for another transaction (node glitch, re-read)');
  /* ⛔ 2026-10-25 (revue adverse, defaut A) : un champ ABSENT n est pas une contradiction — seul status 0x0 est un echec ; logs absent ou
   *   non tableau, status absent ou autre : NON_MESURE (relu), jamais un refus grave */
  if (bas(recu.status) === '0x0') return refusTx('TX_ECHOUEE', 'the creation transaction failed (status 0x0)');
  if (bas(recu.status) !== '0x1') return nonMesure(a, 'RECU_INCOMPLET', 'the receipt has no readable status (not measured)');
  if (!Array.isArray(recu.logs)) return nonMesure(a, 'RECU_INCOMPLET', 'the receipt has no logs list (not measured)');
  const logs = recu.logs;
  const sujet = '0x' + motA(a);
  const memeEvenement = logs.filter((l) => l && Array.isArray(l.topics) && bas(l.topics[0]) === TOPIC_CREATED && bas(l.topics[1]) === sujet);
  const log = memeEvenement.find((l) => bas(l.address) === FACTORY);
  if (!log) {
    /* ⛔ L EVENEMENT SANS LA FACTORY : un contrat quelconque peut emettre ces topics. C est le cas que l on nomme. */
    return memeEvenement.length
      ? refusTx('EVENEMENT_HORS_FACTORY', 'a B20Created event names it, but it was emitted by ' + bas(memeEvenement[0].address) + ', not by the B20 factory')
      : refusTx('SANS_LOG_FACTORY', 'that transaction holds no B20Created log from the B20 factory for this token');
  }
  /* ⛔ un log de la factory mal forme (topics courts, data absente) ne fait pas tomber le tour : NON_MESURE, nomme (revue 2026-10-25) */
  let c;
  try { c = decoderCreation(log) || {}; } catch (e) { return nonMesure(a, 'LOG_ILLISIBLE', 'the factory log could not be decoded: ' + court(e)); }
  let t;
  try { t = await rpc('eth_getTransactionByHash', [t0]); } catch (e) { return nonMesure(a, 'TX_NON_LUE', 'creation transaction not read: ' + court(e)); }
  if (!t || typeof t !== 'object') return nonMesure(a, 'TX_NON_LUE', 'the node has no such transaction (not measured, not absent)');
  if (bas(t.hash) !== t0) return nonMesure(a, 'TX_AUTRE', 'the transaction answered is another one (node glitch, re-read)');
  if (!ADR.test(bas(t.from)) || !ADR.test(bas(t.to))) return nonMesure(a, 'TX_INCOMPLETE', 'the transaction has no whole from / to (not measured)');
  if (bas(t.from) !== bas(createur)) return refusTx('CREATEUR', 'created by ' + bas(t.from) + ', not by the wallet that created the issuer\'s stocks');
  if (bas(t.to) !== bas(appele)) return refusTx('APPELE', 'its creation called ' + bas(t.to) + ', not the contract the issuer\'s creations call');
  return { etat: 'PROUVE', adr: a, symbole: c.symbole || null, nom: c.nom || null, decimales: Number.isInteger(c.decimales) ? c.decimales : null,
    tx: t0, bloc: recu.blockNumber ? parseInt(recu.blockNumber, 16) : null, createur: bas(t.from) };
}

/** LES REFUS QUI PEUVENT ETRE GRAVES (et relus du disque). ⛔ Un refus ecrit par le code d avant le 2026-10-25 peut venir d un `0x`
 *  (MARQUEUR sans `codeLu`) ou d un noeud qui deraillait (RECU_AUTRE, TX_AUTRE) : il n est pas definitif, il est rejuge. */
export const REFUS_DEFINITIFS = Object.freeze(['ADRESSE', 'MARQUEUR', 'TX_ECHOUEE', 'EVENEMENT_HORS_FACTORY', 'SANS_LOG_FACTORY', 'CREATEUR', 'APPELE']);
export function verdictGravable(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.etat === 'PROUVE') return ADR.test(String(p.adr || '')) && TX.test(String(p.tx || ''));
  if (p.etat !== 'REFUSE' || !REFUS_DEFINITIFS.includes(p.code)) return false;
  if (p.code === 'MARQUEUR') return /^0x[0-9a-f]+$/.test(String(p.codeLu || '')) && p.codeLu !== '0xef';
  return true;
}

/**
 * LE LECTEUR DES PREUVES : une liste de lecteurs, essayes dans l ordre, pour les trois lectures d une preuve.
 * ⛔⛔ MESURE DU 2026-10-25 (12 creations les plus anciennes, bloc ~49,1 M, sonde-recus-anciens-20261025.mjs) : mainnet.base.org 12/12
 *   recus + tx servis, base.drpc.org 12/12, base-rpc.publicnode.com 0/12 (« Archive requests require a personal token »), 1rpc.io 0/12
 *   (null), developer-access-mainnet.base.org 0/12 (reseau). Le lecteur du serveur (base.org, puis publicnode en repli) peut donc
 *   tomber sur publicnode et rendre NON_MESURE a jamais : on essaie le suivant au lieu de conclure.
 * Une exception, un `null` ou un `0x` passent au lecteur suivant ; la PREMIERE reponse pleine gagne. Tous muets : le dernier `null` /
 * `0x` est rendu (prouverAction le lit NON_MESURE), sinon la derniere erreur est levee. Pur.
 */
export function lecteurPreuves(lecteurs) {
  const l = (Array.isArray(lecteurs) ? lecteurs : []).filter((f) => typeof f === 'function');
  return async function lire(methode, params) {
    let vide = undefined, erreur = null;
    for (const f of l) {
      try {
        const r = await f(methode, params);
        if (r === null || r === undefined || r === '0x' || r === '') { vide = r === undefined ? null : r; continue; }
        return r;
      } catch (e) { erreur = e; }
    }
    if (vide !== undefined) return vide;
    throw erreur || new Error('no reader');
  };
}

/** le nombre d unites en circulation (totalSupply brut), ou null si non lu */
export async function lireUnites({ rpc, adr }) {
  try { return premierMot(await rpc('eth_call', [{ to: bas(adr), data: SEL.totalSupply }, 'latest'])); } catch (_) { return null; }
}

/**
 * LES CANDIDATS : la liste de l emetteur (toutes ses pages), la graine du recensement, et les creations vues par le serveur dont le
 * createur est celui de l emetteur. Rend [{ adr, tx, symbole, sources:[] }], dedoublonnes. ⛔ Etre candidat ne liste rien.
 */
export function candidatsActions({ emetteur = [], symbolesEmetteur = {}, creationsVues = [], graine = CREATIONS_GRAINE } = {}) {
  const m = new Map();
  const mettre = (adr, src, tx, symbole) => {
    const a = bas(adr);
    if (!ADR.test(a)) return;
    const c = m.get(a) || { adr: a, tx: null, txs: [], symbole: null, sources: [] };
    if (!c.sources.includes(src)) c.sources.push(src);
    /* toutes les tx de creation ANNONCEES (graine, scan) : un refus est rejuge sur une tx qu il n a pas jugee */
    if (TX.test(String(tx || '')) && !c.txs.includes(bas(tx)) && c.txs.length < 4) c.txs.push(bas(tx));
    if (!c.tx && TX.test(String(tx || ''))) c.tx = bas(tx);
    if (!c.symbole && symbole) c.symbole = String(symbole).slice(0, 24);
    m.set(a, c);
  };
  for (const [a, g] of graine) mettre(a, 'recensement', g.tx, g.symbole);
  for (const a of emetteur) mettre(a, 'emetteur', (graine.get(bas(a)) || {}).tx, symbolesEmetteur[bas(a)]);
  for (const c of creationsVues) if (c && bas(c.createur) === bas(CREATEUR_EMETTEUR)) mettre(c.jeton, 'chaine', c.tx, c.symbole);
  return [...m.values()];
}

/**
 * UN TOUR DE DECOUVERTE. `cache` (Map adr -> preuve) garde les PROUVE et les REFUSE (definitifs) ; un NON_MESURE n y entre pas.
 * Rend { etat: 'COMPLET'|'PARTIEL', prouvees, refusees, nonMesurees, neuves } — PARTIEL tant qu un candidat n a pas de verdict.
 */
export async function decouvrirActions({ rpc, candidats, cache, max = PREUVES_PAR_TOUR, pause = 0 }) {
  let neuves = 0;
  const prouvees = [], refusees = [], nonMesurees = [];
  for (const c of candidats) {
    let p = cache.get(c.adr);
    let txJuge = c.tx;
    if (p && p.etat === 'PROUVE' && c.tx && p.tx !== c.tx) p = null; /* une autre tx annoncee : on reprouve, on ne fusionne pas */
    /* ⛔ un REFUS est rejuge des qu une tx de creation qu il n a PAS jugee est annoncee (revue 2026-10-25) */
    if (p && p.etat === 'REFUSE') {
      const jugees = Array.isArray(p.jugees) ? p.jugees : (p.tx ? [p.tx] : []);
      const autre = (Array.isArray(c.txs) ? c.txs : [c.tx]).find((x) => x && !jugees.includes(x));
      if (autre) { txJuge = autre; p = null; }
    }
    if (!p) {
      if (neuves >= max) { nonMesurees.push({ etat: 'NON_MESURE', adr: c.adr, code: 'BUDGET', pourquoi: 'not checked yet (at most ' + max + ' new proofs per pass)' }); continue; }
      neuves += 1;
      /* ⛔ une exception d UNE preuve ne fait pas tomber le tour : NON_MESURE, nommee */
      try { p = await prouverAction({ rpc, adr: c.adr, tx: txJuge }); }
      catch (e) { p = nonMesure(c.adr, 'EXCEPTION', 'proof interrupted: ' + court(e)); }
      if (p.etat === 'REFUSE') {
        const avant = cache.get(c.adr);
        const deja = avant && avant.etat === 'REFUSE' ? (Array.isArray(avant.jugees) ? avant.jugees : (avant.tx ? [avant.tx] : [])) : [];
        p = { ...p, jugees: [...new Set([...deja, ...(p.tx ? [p.tx] : [])])] };
      }
      if (verdictGravable(p)) cache.set(c.adr, p);
      else if (p.etat !== 'NON_MESURE') cache.delete(c.adr);
      if (pause) await new Promise((r) => setTimeout(r, pause));
    }
    const ligne = { ...p, symboleEmetteur: c.symbole || null, sources: c.sources };
    if (p.etat === 'PROUVE') prouvees.push(ligne); else if (p.etat === 'REFUSE') refusees.push(ligne); else nonMesurees.push(ligne);
  }
  return { etat: nonMesurees.length ? 'PARTIEL' : 'COMPLET', prouvees, refusees, nonMesurees, neuves };
}

/** prix moyen : la sortie de `montant` USDC brut en jeton brut au sqrtPriceX96 (token1/token0 = s^2 / 2^192) */
export function sortieMoyenne({ montant, sqrtP, usdcEst0 }) {
  const s2 = BigInt(sqrtP) * BigInt(sqrtP), Q = 1n << 192n;
  return usdcEst0 ? (BigInt(montant) * s2) / Q : (BigInt(montant) * Q) / s2;
}

/**
 * LE VERDICT DE ROUTE D UNE ACTION SUR NOTRE FACTORY (celle que declare notre routeur Aerodrome, 0xf8f2…). Rend
 *   { etat:'OK', achetable:true,  pool, tickSpacing, usdcPool, ecartBps }                 — Buy possible
 *   { etat:'OK', achetable:false, code, phrase, ... }                                       — la raison MESUREE, dite a l ecran
 *   { etat:'NON_MESURE', pourquoi }                                                          — lectures refusees : rien n est affirme
 * @param {(to:string, data:string) => Promise<string>} p.appel  un eth_call au bloc courant
 */
export async function routeAction(o) {
  const r = await routeActionNue(o);
  /* le bloc auquel `appel` lit (fourni par l appelant, qui epingle ses eth_call) : servi avec le verdict */
  return o && Number.isSafeInteger(o.bloc) ? { ...r, bloc: o.bloc } : r;
}
async function routeActionNue({ appel, adr, espacements = ESPACEMENTS_RETOMBEE, factory = FACTORY_AERODROME_CL, usdc = USDC_BASE,
  quoteur = QUOTEUR_AERODROME_CL, montant = DEVIS_USDC, admise = estDeviseConnue, refuseesExecution = POOLS_REFUSEES_EXECUTION,
  cachePools = null, maintenant = Date.now(), perteMaxBps = PERTE_ALLER_RETOUR_MAX_BPS }) {
  const a = bas(adr), u = bas(usdc);
  const pools = []; let refusees = 0;
  for (const ts of espacements) {
    /* ⛔ 2026-10-25 (revue : 9 des ~13 lectures d une route etaient des getPool relus toutes les 30 min) : l adresse d une pool CL est
     *   fixee par (factory, jetons, tickSpacing) — une pool trouvee est gardee POUR TOUJOURS ; une absence, POOL_ABSENTE_TTL_MS (une
     *   pool peut naitre). Seules les reponses LUES entrent au cache. */
    const cle = bas(factory) + '|' + a + '|' + ts;
    const enCache = cachePools ? cachePools.get(cle) : null;
    if (enCache && (enCache.pool || maintenant - enCache.t < POOL_ABSENTE_TTL_MS)) {
      if (enCache.pool) pools.push({ pool: enCache.pool, tickSpacing: ts });
      continue;
    }
    try {
      const r = await appel(factory, SEL.getPool + motA(a) + motA(u) + motI24(ts));
      const p = '0x' + String(r).slice(26, 66).toLowerCase();
      if (!/^0x[0-9a-fA-F]{64}$/.test(String(r).slice(0, 66)) || !/^0x[0-9a-f]{40}$/.test(p)) { refusees += 1; continue; }
      const absente = /^0x0{40}$/.test(p);
      if (cachePools) cachePools.set(cle, absente ? { pool: null, t: maintenant } : { pool: p, t: maintenant });
      if (!absente) pools.push({ pool: p, tickSpacing: ts });
    } catch (_) { refusees += 1; }
  }
  if (!pools.length && refusees) return { etat: 'NON_MESURE', pourquoi: refusees + ' of ' + espacements.length + ' pool lookups refused by the node' };
  if (!pools.length) return { etat: 'OK', achetable: false, code: 'SANS_POOL_ROUTEUR', phrase: 'No buy here: no USDC pool of the pool factory this app\'s router uses (only other factories or Uniswap v4).' };
  for (const p of pools) {
    try { p.usdcPool = premierMot(await appel(u, SEL.balanceOf + motA(p.pool))); p.liquidite = premierMot(await appel(p.pool, SEL.liquidity)); }
    catch (e) { p.erreur = court(e); }
  }
  const lues = pools.filter((p) => !p.erreur);
  if (!lues.length) return { etat: 'NON_MESURE', pourquoi: 'pool state not read' };
  const vivantes = lues.filter((p) => p.liquidite > 0n).sort((x, y) => (y.usdcPool > x.usdcPool ? 1 : y.usdcPool < x.usdcPool ? -1 : 0));
  if (!vivantes.length) return { etat: 'OK', achetable: false, code: 'POOL_VIDE', phrase: 'No buy: its pools on the factory this app\'s router uses have no active liquidity.' };
  const p = vivantes[0];
  if (refuseesExecution.has(p.pool)) {
    return { etat: 'OK', achetable: false, code: 'EXECUTION_ECHOUEE', pool: p.pool, tickSpacing: p.tickSpacing, usdcPool: String(p.usdcPool), phrase: refuseesExecution.get(p.pool) };
  }
  /* $0.81 et non « $0 » : un arrondi qui ecrit zero sur une pool qui tient quelque chose dit faux */
  const usd = (x) => { const v = Number(x) / 1e6; return '$' + (v < 10 ? v.toFixed(2) : Math.round(v).toLocaleString('en-US')); };
  if (p.usdcPool < USDC_MIN_POOL) {
    return { etat: 'OK', achetable: false, code: 'LIQUIDITE_SOUS_SEUIL', pool: p.pool, tickSpacing: p.tickSpacing, usdcPool: String(p.usdcPool),
      phrase: 'No buy: its pool this app\'s router can reach holds ' + usd(p.usdcPool) + ' of USDC (under ' + usd(USDC_MIN_POOL) + ').' };
  }
  let sqrtP, sortie;
  try {
    sqrtP = premierMot(await appel(p.pool, SEL.slot0));
    sortie = premierMot(await appel(quoteur, SEL.quoteIn + motA(u) + motA(a) + mot(montant) + motI24(p.tickSpacing) + mot(0)));
  } catch (e) {
    /* ⛔ un devis qui REVERTE est une reponse de la pool ; un devis non lu (transport) n en est pas une */
    if (/revert|execution/i.test(court(e))) {
      return { etat: 'OK', achetable: false, code: 'NON_COTEE', pool: p.pool, tickSpacing: p.tickSpacing, usdcPool: String(p.usdcPool),
        phrase: 'No buy: its pool this app\'s router can reach refuses to quote 10 USDC.' };
    }
    return { etat: 'NON_MESURE', pourquoi: 'quote not read: ' + court(e) };
  }
  if (!(sqrtP > 0n) || !(sortie > 0n)) {
    return { etat: 'OK', achetable: false, code: 'NON_COTEE', pool: p.pool, tickSpacing: p.tickSpacing, usdcPool: String(p.usdcPool),
      phrase: 'No buy: its pool this app\'s router can reach quotes nothing for 10 USDC.' };
  }
  const moyenne = sortieMoyenne({ montant, sqrtP, usdcEst0: BigInt(u) < BigInt(a) });
  const ecartBps = moyenne > 0n ? Number(((moyenne - sortie) * 10000n) / moyenne) : null;
  if (ecartBps === null || ecartBps > ECART_MAX_BPS) {
    return { etat: 'OK', achetable: false, code: 'ECART', pool: p.pool, tickSpacing: p.tickSpacing, usdcPool: String(p.usdcPool), ecartBps,
      phrase: 'No buy: on the pool this app\'s router can reach, 10 USDC buys ' + (ecartBps === null ? 'an unreadable amount' : (ecartBps / 100).toFixed(2) + '% less')
        + ' than at its mid price (over the 1% this app accepts).' };
  }
  /* ⛔⛔ 2026-10-25 (revue) — LE COTE VENTE. Seul l achat etait juge : LIc rendait 8,34 USDC sur 10 en revendant ce que 10 USDC
   *   achetaient (-16,6 %), SEc 9,35 (-6,5 %). Un Buy dont la sortie coute 16 % est un piege. Regle : on cote les DEUX jambes au meme
   *   bloc (l achat de 10 USDC, puis la vente de ce qu il rend, sur la meme pool) ; la perte de l aller-retour doit rester <= 2 %.
   *   ⚠️ CE QUE CA MESURE, DIT JUSTE (banc fork du jour, bloc 53 047 060) : les deux devis lisent le MEME etat, donc la vente cotee est
   *   celle d un PORTEUR qui sort a l etat mesure — executee, elle rend 8,34 USDC sur LIc et 8,86 sur SEc, comme cote. Un aller-retour
   *   IMMEDIAT (revendre aussitot ce que son propre achat a rendu) refait le chemin de l achat et perd ~0,21 % (frais 2 x 0,1 %) meme la.
   *   La regle refuse donc une pool ou la SORTIE est 16 % sous l entree — pas une pool qui ferait perdre 16 % a un achat-revente eclair. */
  let retour;
  try { retour = premierMot(await appel(quoteur, SEL.quoteIn + motA(a) + motA(u) + mot(sortie) + motI24(p.tickSpacing) + mot(0))); }
  catch (e) {
    if (/revert|execution/i.test(court(e))) {
      return { etat: 'OK', achetable: false, code: 'VENTE_NON_COTEE', pool: p.pool, tickSpacing: p.tickSpacing, usdcPool: String(p.usdcPool), ecartBps,
        phrase: 'No buy: its pool this app\'s router can reach refuses to quote selling back what 10 USDC buys.' };
    }
    return { etat: 'NON_MESURE', pourquoi: 'sell quote not read: ' + court(e) };
  }
  const perteBps = Number(((BigInt(montant) - retour) * 10000n) / BigInt(montant));
  if (perteBps > perteMaxBps) {
    return { etat: 'OK', achetable: false, code: 'ALLER_RETOUR', pool: p.pool, tickSpacing: p.tickSpacing, usdcPool: String(p.usdcPool), ecartBps, perteBps,
      retour: String(retour),
      phrase: 'No buy: on the pool this app\'s router can reach, what 10 USDC buys sells for ' + (Number(retour) / 1e6).toFixed(2) + ' USDC at its current state, a '
        + (perteBps / 100).toFixed(1) + '% gap between buying and selling (over the ' + (perteMaxBps / 100) + '% this app accepts).' };
  }
  /* ⛔⛔ BANC FORK DU 2026-10-25 (bloc 53 042 648) : LIc, ULc, NOKc, SANc passaient TOUTES les mesures ci-dessus (25-32 k USDC, 1 a 39
   *   bps) et le planificateur de la fiche les REFUSAIT : « the fee would be taken in the output token, which is not ETH, USDC or a listed
   *   stock » (plan-aerodrome-segment.js, estDeviseConnue = le registre ACTIONS_COINBASE). Un Buy ici ouvrirait une fiche qui refuse :
   *   la pool est bonne, l ADMISSION manque, et c est la raison dite. Elles sont entrees au registre APRES un achat execute sur fork
   *   (bloc 53 043 890) ; cette garde reste pour la prochaine action prouvee qui n y est pas encore. */
  if (!admise(a)) {
    return { etat: 'OK', achetable: false, code: 'HORS_REGISTRE', pool: p.pool, tickSpacing: p.tickSpacing, usdcPool: String(p.usdcPool), ecartBps, perteBps,
      phrase: 'No buy here yet: its pool quotes well (' + usd(p.usdcPool) + ' of USDC), but this stock is not in this app\'s stock list, so the app cannot take its fee on it.' };
  }
  return { etat: 'OK', achetable: true, pool: p.pool, tickSpacing: p.tickSpacing, usdcPool: String(p.usdcPool), ecartBps, perteBps, factory: bas(factory) };
}

/** la forme servie par ligne du Market (aucun BigInt : JSON). `bloc` : le bloc des lectures, quand l appelant l a epingle */
export function routeServie(r, lu = new Date().toISOString()) {
  if (!r || r.etat !== 'OK') return null;
  const b = Number.isSafeInteger(r.bloc) ? r.bloc : null;
  if (r.achetable) return { achetable: true, pool: r.pool, tickSpacing: r.tickSpacing, usdcPool: r.usdcPool, ecartBps: r.ecartBps, perteBps: r.perteBps ?? null, factory: r.factory, lu, bloc: b };
  return { achetable: false, code: r.code, phrase: r.phrase, pool: r.pool || null, usdcPool: r.usdcPool || null, ecartBps: r.ecartBps ?? null, perteBps: r.perteBps ?? null, lu, bloc: b };
}

/** ⛔⛔ FAIL-CLOSED (revue 2026-10-25) : une action SANS verdict de route (jamais lu, perime, ou portant sur une autre pool que celle de
 *  la table) n a PAS de Buy — elle ne retombe plus sur le verdict DexScreener. La phrase dit qu on verifie. */
export const ROUTE_EN_COURS = Object.freeze({ achetable: false, code: 'ROUTE_EN_COURS', pool: null, usdcPool: null, ecartBps: null, perteBps: null,
  phrase: 'No buy yet: checking its route on chain (its pool, a 10 USDC buy and the sale back are quoted first).' });
/** au-dela de cet age, un verdict servi (disque compris) ne donne plus de Buy : il est relu, et en attendant c est ROUTE_EN_COURS */
export const ROUTE_SERVIE_MAX_MS = 6 * 60 * 60 * 1000;
/**
 * LE VERDICT SERVI SUR UNE LIGNE D ACTION. `v` = { r: routeServie, t } (memoire ou disque) ; `table` = l entree de la table mesuree.
 * Rend toujours un objet pour une action : le verdict, ou ROUTE_EN_COURS. Pur.
 */
export function routePourLigne({ v, table = null, maintenant = Date.now() }) {
  if (!v || !v.r || typeof v.r !== 'object' || !Number.isFinite(v.t) || maintenant - v.t > ROUTE_SERVIE_MAX_MS) return ROUTE_EN_COURS;
  /* une entree de table ne recoit qu un verdict portant sur SA pool (ou sur l absence de toute pool) : un verdict sur une autre pool
   *   veut dire que la table et la chaine divergent — pas de Buy tant que ce n est pas tranche */
  if (table && v.r.pool && v.r.pool !== table.pool) return ROUTE_EN_COURS;
  return v.r;
}

/** le resume chiffre, servi sur /api/trending (`actionsChaine`) */
export function resumeActions({ tour, unites, routes, table = new Set(), listees = 0, emetteurEtat = null, emetteurCompte = null, lu = new Date().toISOString() }) {
  const prouvees = tour ? tour.prouvees : [];
  const avecUnites = prouvees.filter((p) => { const u = unites.get(p.adr); return u !== null && u !== undefined && u > 0n; }).length;
  const unitesNonLues = prouvees.filter((p) => unites.get(p.adr) === null || unites.get(p.adr) === undefined).length;
  const r = [...prouvees].filter((p) => !table.has(p.adr)).map((p) => routes.get(p.adr)).filter(Boolean);
  const rt = [...prouvees].filter((p) => table.has(p.adr)).map((p) => routes.get(p.adr)).filter(Boolean);
  return {
    etat: tour ? tour.etat : 'NON_MESURE', lu, emetteurEtat, emetteurCompte,
    candidats: tour ? tour.prouvees.length + tour.refusees.length + tour.nonMesurees.length : 0,
    prouvees: prouvees.length, refusees: tour ? tour.refusees.length : 0, nonMesurees: tour ? tour.nonMesurees.length : 0,
    /* sans unites : prouvees, mais rien en circulation — le Market ne les liste pas (pas de marche) et le DIT par ce compte */
    avecUnites, unitesNonLues, sansUnites: prouvees.length - avecUnites - unitesNonLues, listeesAuMarche: listees,
    routesLues: r.length + rt.length, achetablesHorsTable: r.filter((x) => x.achetable).length,
    tableLues: rt.length, tableRefusees: rt.filter((x) => !x.achetable).map((x) => x.code),
    refusParCode: (tour ? tour.refusees : []).reduce((o, x) => { o[x.code] = (o[x.code] || 0) + 1; return o; }, {}),
    /* ⛔ un NON_MESURE qui dure se VOIT : par code, et les symboles (revue 2026-10-25 : « jamais NON_MESURE pour toujours en silence ») */
    nonMesureesParCode: (tour ? tour.nonMesurees : []).reduce((o, x) => { o[x.code] = (o[x.code] || 0) + 1; return o; }, {}),
    nonMesureesSymboles: (tour ? tour.nonMesurees : []).slice(0, 40).map((x) => x.symboleEmetteur || x.adr),
    allerRetourRefuses: [...prouvees].map((p) => routes.get(p.adr)).filter((x) => x && x.code === 'ALLER_RETOUR').length,
    preuve: 'code === 0xef, B20Created log emitted by the factory 0xb20f… in a successful tx, tx.from = ' + CREATEUR_EMETTEUR,
  };
}
