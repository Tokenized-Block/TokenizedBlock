/* journal-jeu.js — LE JOURNAL DU JOUR DU JEU (Phil 2026-10-18 : « les brains sont les occupants de la Map »). PUR : des logs lus sur NOS
 *   contrats (BlockRolls, BlockSkins) + les rolls practice du serveur -> des evenements courts, dates, du plus recent au plus ancien.
 *
 * ⛔ UN EVENEMENT N EST PAS UNE TRANSACTION, SAUF QUAND IL VIENT DE NOTRE CONTRAT : chaque genre de log n est lu QUE s il vient de
 *   l adresse du contrat qui l emet (Rolled / Settled / PassBought -> BlockRolls ; SkinMinted / Listed / Bid / Sold -> BlockSkins). Le meme
 *   topic emis par n importe quel autre contrat est IGNORE. Un wallet lu dans un topic doit etre un mot de 32 octets dont les 12 premiers
 *   sont nuls (une adresse encodee), et pas l adresse 0 : sinon le log est ignore, jamais « corrige ».
 * ⛔ RIEN N EST INVENTE : un log illisible est compte (`illisibles`) et ignore ; un log sans horodatage de bloc n est pas date au hasard,
 *   il est compte dans `sansHeure` (le serveur ne fait alors PAS avancer son curseur et relit la fenetre). Un montant d enchere dont la
 *   devise n a pas ete vue (Listed hors fenetre) n est pas ecrit : « bid on skin #12 », sans chiffre.
 * ⛔ DE-DOUBLONNE par (transaction, logIndex) : deux lectures qui se chevauchent ne doublent jamais une ligne.
 * Les montants sont en unites brutes (USDC 6 decimales, ETH 18) ; le texte les ecrit tronques, jamais arrondis vers le haut. */
import { topic } from './keccak.js';
import { EV_ROLLED, EV_SETTLED, EV_PASS_BOUGHT } from './blockrolls-plan.js';
import { decoderLogDuel, EVS_CREATED, EVS_JOINED, EVS_SETTLED as EVS_DUEL_SETTLED, EVS_CANCELLED, EVS_REFUNDED } from './duels-plan-app.js';

export const JOURNAL_MAX = 100;
/** Les genres d evenement. 2026-10-23 : `duel` (BlockDuels LIVE, duels-deploiement.js) et `mission` (BlockMissionsV3 LIVE,
 *  missions-deploiement.js) sont LUS quand leur fiche porte une adresse. */
export const GENRES = Object.freeze(['roll', 'settled', 'pass', 'skin_minted', 'skin_bid', 'skin_sold', 'practice', 'duel', 'mission']);

export const EV_SKIN_MINTED = 'SkinMinted(uint256,address,address,uint64)';
export const EV_SKIN_LISTED = 'Listed(uint256,address,address,uint256,uint64)';
export const EV_SKIN_BID = 'Bid(uint256,address,uint256,uint64)';
export const EV_SKIN_SOLD = 'Sold(uint256,address,address,address,uint256,uint256)';
export const T_ROLLED = topic(EV_ROLLED), T_SETTLED = topic(EV_SETTLED), T_PASS = topic(EV_PASS_BOUGHT);
export const T_MINTED = topic(EV_SKIN_MINTED), T_LISTED = topic(EV_SKIN_LISTED), T_BID = topic(EV_SKIN_BID), T_SOLD = topic(EV_SKIN_SOLD);
export const TOPICS_ROLLS = Object.freeze([T_ROLLED, T_SETTLED, T_PASS]);
export const TOPICS_SKINS = Object.freeze([T_MINTED, T_LISTED, T_BID, T_SOLD]);
/* ⛔ DUELS : la forme EXACTE de contracts/src/BlockDuels.sol (la PREMIERE de chaque liste de duels-plan-app.js — le test la relit dans la
 *   source). Le decodage est celui de duels-plan-app.js (decoderLogDuel), qui relit lui aussi l adresse du log. */
export const EVS_DUELS_JOURNAL = Object.freeze([EVS_CREATED[0], EVS_JOINED[0], EVS_DUEL_SETTLED[0], EVS_CANCELLED[0], EVS_REFUNDED[0]]);
export const TOPICS_DUELS = Object.freeze(EVS_DUELS_JOURNAL.map((s) => topic(s)));
const [T_D_CREATED, T_D_JOINED, T_D_SETTLED, T_D_CANCELLED, T_D_REFUNDED] = TOPICS_DUELS;
/* ⛔ MISSIONS : les evenements de contracts/src/BlockMissionsV3.sol, lus dans la source (le test les y relit) */
export const EV_TASK_POSTED = 'TaskPosted(uint256,address,address,address,uint256,uint32,uint64,bytes32)';
export const EV_TASK_CLAIMED = 'TaskClaimed(uint256,address,bytes32,uint256,uint256,uint256,uint256)';
export const EV_TASK_CLOSED = 'TaskClosed(uint256,uint256,bool)';
export const T_POSTED = topic(EV_TASK_POSTED), T_CLAIMED = topic(EV_TASK_CLAIMED), T_CLOSED = topic(EV_TASK_CLOSED);
export const TOPICS_MISSIONS = Object.freeze([T_POSTED, T_CLAIMED, T_CLOSED]);

/* ══ LA COUVERTURE DU JOUR (2026-10-23) — mesure prod 2026-10-18 19:14 UTC : couvertureDepuis 52 771 652 alors qu un roll paye avait eu lieu
 *   au bloc 52 771 493 le meme jour UTC : le debut etait ESTIME (temps de bloc x heure), et borne a 9 000 blocs. Desormais :
 *   (1) le temps de bloc est MESURE sur deux horodatages (jamais suppose : Denim vise 200 ms/bloc, 10 x moins qu aujourd hui) ;
 *   (2) le premier bloc du jour UTC est TROUVE par dichotomie sur les horodatages des blocs (un bloc a l heure exacte, pas une estimation) ;
 *   (3) la borne de profondeur couvre une journee ENTIERE au temps de bloc mesure ;
 *   (4) couvreLaJournee n est vrai que si ce premier bloc est effectivement lu. */
export const JOUR_S = 86400;
/** secondes par bloc mesurees entre deux blocs (n blocs d ecart) ; null si la mesure est impossible (jamais « 2 s par defaut ») */
export function tempsDeBloc(tsHaut, tsBas, n) {
  if (!Number.isSafeInteger(tsHaut) || !Number.isSafeInteger(tsBas) || !Number.isSafeInteger(n) || n <= 0 || tsHaut <= tsBas) return null;
  return (tsHaut - tsBas) / n;
}
/** la profondeur (en blocs) qui couvre UNE journee au temps de bloc mesure, + 5 % et 600 blocs de marge ; null sans mesure */
export function profondeurJournee(sParBloc) {
  if (!(Number.isFinite(sParBloc) && sParBloc > 0)) return null;
  return Math.ceil((JOUR_S / sParBloc) * 1.05) + 600;
}
/**
 * Le PREMIER bloc dont l horodatage est >= cibleS (le debut du jour UTC, en secondes), par dichotomie. LECTURE SEULE.
 * @param {(bloc:number)=>Promise<number|null>} lireTs  horodatage d un bloc (null = illisible)
 * @param {{ tete:number, cibleS:number, sParBloc:number, profondeurMax:number }} o
 * @returns {Promise<{ bloc:number, lectures:number } | null>}  null si un horodatage manque ou si le bloc est au-dela de profondeurMax
 *   (jamais devine). Si la tete elle-meme est avant cibleS, le premier bloc du jour n existe pas encore : bloc = tete + 1.
 */
export async function premierBlocDuJour(lireTs, { tete, cibleS, sParBloc, profondeurMax }) {
  if (typeof lireTs !== 'function' || !Number.isSafeInteger(tete) || tete <= 0 || !Number.isSafeInteger(cibleS) || !(sParBloc > 0) || !Number.isSafeInteger(profondeurMax) || profondeurMax <= 0) return null;
  let lectures = 0;
  const ts = async (b) => { lectures++; const v = await lireTs(b); return Number.isSafeInteger(v) && v > 0 ? v : null; };
  const tT = await ts(tete);
  if (tT === null) return null;
  if (tT < cibleS) return { bloc: tete + 1, lectures };
  const plancher = Math.max(0, tete - profondeurMax);
  /* lo : un bloc AVANT cibleS (verifie) ; hi : un bloc a cibleS ou apres. L estimation part du temps mesure ; si elle tombe apres la cible
   *  (blocs plus rapides que mesure), le recul DOUBLE jusqu au plancher. */
  let hi = tete, recul = Math.ceil((tT - cibleS) / sParBloc) + 16, lo = null;
  for (let k = 0; k < 40; k++) {
    const x = Math.max(plancher, tete - recul), t = await ts(x);
    if (t === null) return null;
    if (t < cibleS) { lo = x; break; }
    hi = x;
    if (x === plancher) return x === 0 ? { bloc: 0, lectures } : null; /* au-dela de la borne : on ne sait pas, on ne devine pas */
    recul *= 2;
  }
  if (lo === null) return null;
  while (hi - lo > 1) {
    const mi = Math.floor((lo + hi) / 2), t = await ts(mi);
    if (t === null) return null;
    if (t >= cibleS) hi = mi; else lo = mi;
  }
  return { bloc: hi, lectures };
}
/** la journee est couverte SEULEMENT si le premier bloc du jour est connu ET lu : basCouvert <= premierBloc <= hautCouvert (la plage lue,
 *  contigue). Un premier bloc pas encore produit, ou pas encore atteint par la lecture -> false. */
export function journeeCouverte({ premierBloc, basCouvert, hautCouvert }) {
  if (!Number.isSafeInteger(premierBloc) || !Number.isSafeInteger(basCouvert) || !Number.isSafeInteger(hautCouvert)) return false;
  return basCouvert <= premierBloc && premierBloc <= hautCouvert;
}

const bas = (x) => String(x || '').toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
const ZERO = '0x' + '0'.repeat(40);
const mots = (data) => {
  const h = bas(data).replace(/^0x/, '');
  if (!/^([0-9a-f]{64})*$/.test(h)) return null;
  return (h.match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
};
/** un topic -> une adresse, SEULEMENT s il encode une adresse (12 octets nuls devant) et pas 0 ; sinon null */
export function adresseDuTopic(t) {
  const h = bas(t);
  if (!/^0x0{24}[0-9a-f]{40}$/.test(h)) return null;
  const a = '0x' + h.slice(-40);
  return a === ZERO ? null : a;
}
const entier = (x) => { try { const n = Number(BigInt(x)); return Number.isSafeInteger(n) && n >= 0 ? n : null; } catch (_) { return null; } };
const idTopic = (t) => (/^0x[0-9a-f]{64}$/.test(bas(t)) ? BigInt(bas(t)).toString() : null);
const motVersAdresse = (w) => '0x' + w.toString(16).padStart(40, '0').slice(-40);
export const court = (a) => (ADR.test(bas(a)) ? bas(a).slice(0, 6) + '…' + bas(a).slice(-4) : '—');
export const numeroBloc = (n) => Number(n).toLocaleString('en-US');
/** brut -> texte tronque a `max` decimales (sans zeros inutiles au-dela de 2) */
export function montantTexte(brut, dec, max = dec <= 6 ? 2 : 6) {
  const b = BigInt(brut), un = 10n ** BigInt(dec);
  const ent = b / un, frac = (b % un).toString().padStart(dec, '0').slice(0, max);
  let f = frac.replace(/0+$/, '');
  if (f.length < 2) f = (f + '00').slice(0, Math.min(2, max));
  return ent.toString() + (f ? '.' + f : '');
}

/**
 * @param {Array} logs  logs bruts d eth_getLogs
 * @param {{ rolls?: string|null, skins?: string|null }} contrats  NOS adresses ; un genre dont l adresse manque n est pas lu
 * @param {{ horodatage: (bloc:number)=>number|null, cibles?: Map<string,number>, devisesListees?: Map<string,string>,
 *           devises?: Object<string,{sym:string,dec:number}> }} ctx
 *   horodatage : secondes du bloc (null = inconnu) ; cibles : rollId -> targetBlock deja vus ; devisesListees : tokenId -> devise deja vue
 * @returns {{ evenements: Array, cibles: Array<[string,number]>, devisesListees: Array<[string,string]>, illisibles: number, sansHeure: number }}
 *   cibles / devisesListees : les associations NOUVELLES lues ici (le serveur les garde) ; rien n est mute.
 */
export function lireEvenementsJeu(logs, contrats, ctx) {
  const adrOk = (k) => (ADR.test(bas(contrats && contrats[k])) ? bas(contrats[k]) : null);
  const rolls = adrOk('rolls'), skins = adrOk('skins'), duels = adrOk('duels'), missions = adrOk('missions');
  const horo = ctx && typeof ctx.horodatage === 'function' ? ctx.horodatage : () => null;
  const cibles = new Map(ctx && ctx.cibles ? ctx.cibles : []), devisesL = new Map(ctx && ctx.devisesListees ? ctx.devisesListees : []);
  /* jetons : 'd:<id>' -> jeton du duel (lu a son Created), 'm:<id>' -> jeton de recompense de la mission (lu a son TaskPosted) */
  const jetons = new Map(ctx && ctx.jetons ? ctx.jetons : []);
  const devises = (ctx && ctx.devises) || {};
  const nouvellesCibles = [], nouvellesDevises = [], nouveauxJetons = [], vus = new Set(), out = [];
  const regleesParTx = new Set(); /* 'tx:id' d un Settled de duel : le Refunded d une egalite (meme tx) n ajoute pas une 2e ligne */
  let illisibles = 0, sansHeure = 0;
  const montantDe = (brut, jeton) => { const d = jeton ? devises[bas(jeton)] : null; return d ? montantTexte(brut, d.dec) + ' ' + d.sym : null; };
  /* l ordre de la chaine (bloc, logIndex) : un Listed ou un Rolled d une fenetre sert aux Bid / Settled qui le suivent */
  const tries = (Array.isArray(logs) ? logs : []).map((l) => ({ l, b: entier(l && l.blockNumber), i: entier(l && l.logIndex) }))
    .filter((x) => x.b !== null && x.i !== null).sort((x, y) => x.b - y.b || x.i - y.i);
  illisibles += (Array.isArray(logs) ? logs.length : 0) - tries.length;
  for (const { l, b, i } of tries) {
    const adr = bas(l.address), t0 = bas(l.topics && l.topics[0]), tx = bas(l.transactionHash);
    if (!Array.isArray(l.topics) || !/^0x[0-9a-f]{64}$/.test(tx)) { illisibles++; continue; }
    const deRolls = rolls !== null && adr === rolls && TOPICS_ROLLS.includes(t0);
    const deSkins = skins !== null && adr === skins && TOPICS_SKINS.includes(t0);
    const deDuels = duels !== null && adr === duels && TOPICS_DUELS.includes(t0);
    const deMissions = missions !== null && adr === missions && TOPICS_MISSIONS.includes(t0);
    if (!deRolls && !deSkins && !deDuels && !deMissions) continue; /* un autre contrat, ou un autre evenement : pas le notre */
    const id = tx + ':' + i;
    if (vus.has(id)) continue;
    const m = mots(l.data);
    if (m === null) { illisibles++; continue; }
    let e = null;
    if (deDuels) {
      /* le decodeur des duels relit l adresse, la taille des donnees et les bornes du guess ; une forme inconnue -> null -> illisible */
      const d = decoderLogDuel(l, duels);
      if (!d) { illisibles++; continue; }
      const cle = 'd:' + d.id;
      if (t0 === T_D_CREATED && d.type === 'CREATED') {
        const w = adresseDuTopic(l.topics[2]);
        if (!w || !ADR.test(bas(d.token))) { illisibles++; continue; }
        if (!jetons.has(cle)) { jetons.set(cle, bas(d.token)); nouveauxJetons.push([cle, bas(d.token)]); }
        const mise = montantDe(d.stake, d.token);
        e = { kind: 'duel', duel: 'created', duelId: d.id, wallet: w, text: court(w) + ' opened duel #' + d.id + (mise ? ' for ' + mise : '') };
      } else if (t0 === T_D_JOINED && d.type === 'JOINED') {
        const w = adresseDuTopic(l.topics[2]);
        if (!w) { illisibles++; continue; }
        e = { kind: 'duel', duel: 'joined', duelId: d.id, wallet: w, text: court(w) + ' accepted duel #' + d.id
          + (Number.isSafeInteger(d.targetBlock) && d.targetBlock > 0 ? ' · block ' + numeroBloc(d.targetBlock) + ' decides' : '') };
      } else if (t0 === T_D_SETTLED && d.type === 'SETTLED') {
        /* le gagnant est le 4e mot des donnees (non indexe dans BlockDuels.sol) : il doit encoder une adresse (12 octets hauts nuls) */
        if (l.topics.length !== 2 || m.length !== 5 || m[3] >> 160n !== 0n) { illisibles++; continue; }
        regleesParTx.add(tx + ':' + d.id);
        const w = bas(d.winner) === ZERO ? null : bas(d.winner);
        const gain = w ? montantDe(d.payout, jetons.get(cle)) : null;
        e = { kind: 'duel', duel: 'settled', duelId: d.id, wallet: w, score: [d.scoreA, d.scoreB], text: w
          ? 'duel #' + d.id + ': ' + court(w) + ' won' + (gain ? ' ' + gain : '') + ' · ' + d.scoreA + '/5 vs ' + d.scoreB + '/5'
          : 'duel #' + d.id + ': a tie · ' + d.scoreA + '/5 each · both stakes refunded' };
      } else if (t0 === T_D_CANCELLED && d.type === 'CANCELLED') {
        e = { kind: 'duel', duel: 'cancelled', duelId: d.id, wallet: null, text: 'duel #' + d.id + ' was cancelled' };
      } else if (t0 === T_D_REFUNDED && d.type === 'REFUNDED') {
        if (regleesParTx.has(tx + ':' + d.id)) continue; /* l egalite : deja dite par son Settled */
        e = { kind: 'duel', duel: 'refunded', duelId: d.id, wallet: null, text: 'duel #' + d.id + ' refunded in full' };
      } else { illisibles++; continue; }
    } else if (deMissions) {
      const tid = idTopic(l.topics[1]), cle = 'm:' + tid;
      if (tid === null) { illisibles++; continue; }
      if (t0 === T_POSTED) {
        const createur = adresseDuTopic(l.topics[3]), blocJeton = adresseDuTopic(l.topics[2]);
        if (!createur || !blocJeton || m.length !== 5 || m[0] >> 160n !== 0n || m[2] === 0n) { illisibles++; continue; }
        const jeton = motVersAdresse(m[0]);
        if (!jetons.has(cle)) { jetons.set(cle, jeton); nouveauxJetons.push([cle, jeton]); }
        const r = montantDe(m[1], jeton);
        e = { kind: 'mission', mission: 'posted', missionId: tid, wallet: createur, missionBlock: blocJeton,
          text: 'mission #' + tid + ' posted · ' + m[2].toString() + (r ? ' × ' + r : (m[2] === 1n ? ' completion' : ' completions')) };
      } else if (t0 === T_CLAIMED) {
        const w = adresseDuTopic(l.topics[2]);
        if (!w || m.length !== 4) { illisibles++; continue; }
        const p = montantDe(m[0], jetons.get(cle));
        e = { kind: 'mission', mission: 'claimed', missionId: tid, wallet: w, text: court(w) + ' completed mission #' + tid + (p ? ' · +' + p : '') };
      } else if (t0 === T_CLOSED) {
        if (m.length !== 2 || m[1] > 1n) { illisibles++; continue; }
        e = { kind: 'mission', mission: 'closed', missionId: tid, wallet: null, text: 'mission #' + tid + (m[1] === 1n ? ' was cancelled' : ' closed') };
      }
    } else if (t0 === T_ROLLED) {
      const w = adresseDuTopic(l.topics[2]), rid = idTopic(l.topics[1]);
      if (!w || rid === null || m.length !== 9) { illisibles++; continue; }
      const cible = entier(m[5]), avecPass = m[6] === 1n, paye = m[7] + m[8];
      if (cible !== null && !cibles.has(rid)) { cibles.set(rid, cible); nouvellesCibles.push([rid, cible]); }
      e = { kind: 'roll', wallet: w, rollId: rid, cible, text: court(w) + ' rolled' + (cible !== null ? ' on block ' + numeroBloc(cible) : '')
        + (avecPass ? ' · with the pass' : ' · ' + montantTexte(paye, 6) + ' USDC') };
    } else if (t0 === T_SETTLED) {
      const w = adresseDuTopic(l.topics[2]), rid = idTopic(l.topics[1]);
      if (!w || rid === null || m.length !== 9 || m[6] > 5n) { illisibles++; continue; }
      const score = Number(m[6]), gain = m[7], cible = cibles.has(rid) ? cibles.get(rid) : null;
      e = { kind: 'settled', wallet: w, rollId: rid, cible, score, payout: gain.toString(), text: court(w) + ' rolled ' + score + '/5'
        + (cible !== null ? ' on block ' + numeroBloc(cible) : '') + (gain > 0n ? ' · +' + montantTexte(gain, 6) + ' USDC' : ' · no prize') };
    } else if (t0 === T_PASS) {
      const w = adresseDuTopic(l.topics[1]);
      if (!w || m.length !== 4) { illisibles++; continue; }
      e = { kind: 'pass', wallet: w, text: court(w) + ' bought a Week pass · ' + montantTexte(m[2], 6) + ' USDC' };
    } else if (t0 === T_MINTED) {
      const w = adresseDuTopic(l.topics[2]), bloc = adresseDuTopic(l.topics[3]), sk = idTopic(l.topics[1]);
      if (!w || sk === null || m.length !== 1) { illisibles++; continue; }
      e = { kind: 'skin_minted', wallet: w, skin: sk, skinBlock: bloc, text: court(w) + ' minted skin #' + sk };
    } else if (t0 === T_LISTED) {
      /* un Listed n est pas montre : il dit la DEVISE d une enchere, que Bid ne porte pas */
      const sk = idTopic(l.topics[1]);
      if (sk === null || m.length !== 3) { illisibles++; continue; }
      const dev = motVersAdresse(m[0]);
      devisesL.set(sk, dev); nouvellesDevises.push([sk, dev]);
      continue;
    } else if (t0 === T_BID) {
      const w = adresseDuTopic(l.topics[2]), sk = idTopic(l.topics[1]);
      if (!w || sk === null || m.length !== 2) { illisibles++; continue; }
      const d = devisesL.has(sk) ? devises[devisesL.get(sk)] : null;
      e = { kind: 'skin_bid', wallet: w, skin: sk, text: court(w) + ' bid on skin #' + sk + (d ? ' · ' + montantTexte(m[0], d.dec) + ' ' + d.sym : '') };
    } else if (t0 === T_SOLD) {
      const vendeur = adresseDuTopic(l.topics[2]), w = adresseDuTopic(l.topics[3]), sk = idTopic(l.topics[1]);
      if (!w || !vendeur || sk === null || m.length !== 3) { illisibles++; continue; }
      const d = devises[motVersAdresse(m[0])] || null;
      e = { kind: 'skin_sold', wallet: w, seller: vendeur, skin: sk, text: court(w) + ' bought skin #' + sk + (d ? ' · ' + montantTexte(m[1], d.dec) + ' ' + d.sym : '') };
    }
    if (!e) continue;
    const s = horo(b);
    if (!Number.isSafeInteger(s) || s <= 0) { sansHeure++; continue; }
    vus.add(id);
    out.push({ id, t: s * 1000, ...e, block: null, tx, baseBlock: b, logIndex: i });
  }
  return { evenements: out, cibles: nouvellesCibles, devisesListees: nouvellesDevises, jetons: nouveauxJetons, illisibles, sansHeure };
}

/** Les rolls practice du serveur ({t, bloc, score}, aucune identite) -> evenements. Forme fausse -> ignore. */
export function evenementsPractice(rolls) {
  const out = [];
  for (const r of Array.isArray(rolls) ? rolls : []) {
    if (!r || !Number.isFinite(r.t) || !Number.isSafeInteger(r.bloc) || r.bloc <= 0 || !Number.isInteger(r.score) || r.score < 0 || r.score > 5) continue;
    out.push({ id: 'p:' + r.t + ':' + r.bloc + ':' + r.score, t: r.t, kind: 'practice', wallet: null, block: null, score: r.score, cible: r.bloc,
      text: 'Practice roll · ' + r.score + '/5 on block ' + numeroBloc(r.bloc), tx: null, baseBlock: null, logIndex: null });
  }
  return out;
}

const valide = (e) => e && typeof e.id === 'string' && e.id && GENRES.includes(e.kind) && Number.isFinite(e.t)
  && (e.wallet === null || ADR.test(String(e.wallet))) && typeof e.text === 'string';
/** existants + nouveaux -> le journal : de-doublonne par id (tx:logIndex), garde ce qui date de `depuisMs` ou apres, du plus recent au
 *  plus ancien (t, puis bloc, puis logIndex), au plus `max`. */
export function fusionnerJournal(existants, nouveaux, { depuisMs = 0, max = JOURNAL_MAX } = {}) {
  const parId = new Map();
  for (const e of [...(existants || []), ...(nouveaux || [])]) if (valide(e) && e.t >= depuisMs && !parId.has(e.id)) parId.set(e.id, e);
  const k = (x) => (Number.isSafeInteger(x) ? x : -1);
  return [...parId.values()].sort((a, b) => b.t - a.t || k(b.baseBlock) - k(a.baseBlock) || k(b.logIndex) - k(a.logIndex)).slice(0, Math.max(0, max));
}

/** pose `block` (le block cree par ce wallet, lu dans l index des createurs) ; un wallet sans block -> null. Rien n est mute. */
export function avecBlocks(evenements, blocDe) {
  return (evenements || []).map((e) => ({ ...e, block: e.wallet && typeof blocDe === 'function' ? (blocDe(e.wallet) || null) : null }));
}
