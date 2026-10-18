/* rolls-en-attente.js — LES ROLLS D UN JOUEUR QUI ATTENDENT LEUR SETTLE, lus dans les logs du contrat BlockRolls. PUR : aucun reseau, aucune
 * cle. L app lit les logs (eth_getLogs, fenetres de 2 000 blocs depuis le bloc de deploiement, topic2 = le joueur) et ce module dit, roll par
 * roll : TROP_TOT (le bloc cible n est pas passe), REGLABLE (dans la fenetre de 256 blocs : un settleMany le revele), PERDU (fenetre passee :
 * plus personne ne peut le regler, aucun remboursement — dit, jamais cache).
 * ⛔ Pourquoi (revue adverse 2026-10-18) : un roll PAYE dont le flux de l app s arretait avant le settle (signature du settle refusee, recu
 *   en retard, onglet ferme, commande « roll » du chat) n avait AUCUN chemin de retour dans l app — l argent etait parti, le roll se perdait
 *   en 256 blocs (~8,5 min). Ce module est la source de ce chemin ; app.html le relit a l ouverture du Game, apres chaque roll et toutes les
 *   20 s tant que l onglet est visible.
 * Aussi : la decision du tirage du pot du jour des pass (closeDay / drawDay, n importe qui), et le mot juste d un settle (gagne, pot vide,
 *   sous le minimum). */
import { topic, selecteur } from './keccak.js';
import { EV_ROLLED, EV_SETTLED, FENETRE, etatReglement } from './blockrolls-plan.js';

export const EV_EXPIRED = 'Expired(uint256,address)';
export const TOPIC_ROLLED = topic(EV_ROLLED), TOPIC_SETTLED = topic(EV_SETTLED), TOPIC_EXPIRED = topic(EV_EXPIRED);
export const TAILLE_FENETRE_LOGS = 2000;
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const motAdr = (a) => '0x' + bas(a).slice(2).padStart(64, '0');
const hexBloc = (n) => '0x' + Number(n).toString(16);

/** les fenetres [de, a] (bornes incluses) de `taille` blocs au plus qui couvrent de..a ; [] si a < de */
export function fenetresLogs(de, a, taille = TAILLE_FENETRE_LOGS) {
  const r = [];
  if (!Number.isSafeInteger(de) || !Number.isSafeInteger(a) || de < 0 || a < de || !(taille > 0)) return r;
  for (let x = de; x <= a; x += taille) r.push([x, Math.min(a, x + taille - 1)]);
  return r;
}

/** le filtre eth_getLogs d UNE fenetre : Rolled | Settled | Expired du contrat, topic2 = le joueur (les trois evenements l indexent en 2e) */
export function filtreLogsJoueur({ contrat, joueur, de, a }) {
  const c = bas(contrat), j = bas(joueur);
  if (!ADR.test(c) || !ADR.test(j)) return null;
  return { address: c, fromBlock: hexBloc(de), toBlock: hexBloc(a), topics: [[TOPIC_ROLLED, TOPIC_SETTLED, TOPIC_EXPIRED], null, motAdr(j)] };
}

/**
 * Les rolls du joueur encore EN ATTENTE (un Rolled sans Settled ni Expired), et leur etat face a la tete.
 * Rend { enAttente: [{ rollId, targetBlock, settleableUntil, etat, blocsAvant?, blocsRestants? }], reglables, tropTot, perdus, regles }
 * (rollId en BigInt, blocs en Number). Un log d un autre contrat ou d un autre joueur, un topic inconnu, une donnee de mauvaise taille :
 * ignores (jamais invente). Les doublons (fenetres qui se recouvrent) comptent une fois.
 */
export function rollsEnAttente({ logs, contrat, joueur, tete }) {
  const c = bas(contrat), j = motAdr(joueur);
  const rolled = new Map(), finis = new Set(), regles = new Map();
  for (const l of logs || []) {
    if (!l || bas(l.address) !== c || !Array.isArray(l.topics) || l.topics.length < 3 || bas(l.topics[2]) !== j) continue;
    const t0 = bas(l.topics[0]);
    let id;
    try { id = BigInt(l.topics[1]); } catch (_) { continue; }
    const mots = (String(l.data || '').replace(/^0x/, '').match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
    if (t0 === TOPIC_ROLLED && mots.length === 9) rolled.set(id.toString(), { rollId: id, targetBlock: Number(mots[5]), withPass: mots[6] === 1n });
    else if (t0 === TOPIC_SETTLED && mots.length === 9) { finis.add(id.toString()); regles.set(id.toString(), { rollId: id, score: Number(mots[6]), payout: mots[7] }); }
    else if (t0 === TOPIC_EXPIRED) finis.add(id.toString());
  }
  const enAttente = [];
  for (const [k, r] of rolled) {
    if (finis.has(k)) continue;
    const e = Number.isSafeInteger(tete) && tete > 0 ? etatReglement(r.targetBlock, tete) : { etat: 'NON_LU' };
    enAttente.push({ ...r, settleableUntil: r.targetBlock + FENETRE, ...e });
  }
  enAttente.sort((x, y) => (x.rollId < y.rollId ? -1 : 1));
  return { enAttente, reglables: enAttente.filter((x) => x.etat === 'REGLABLE'), tropTot: enAttente.filter((x) => x.etat === 'TROP_TOT'),
    perdus: enAttente.filter((x) => x.etat === 'PERDU'), regles: [...regles.values()] };
}

/** le mot juste d un settle : GAGNE (payout > 0), POT_VIDE (score gagnant mais le pot ne tenait rien), SOUS_MIN (score sous le minimum) */
export function motSettle({ score, payout, minScore }) {
  if (BigInt(payout || 0) > 0n) return 'GAGNE';
  return Number(score) >= Number(minScore) ? 'POT_VIDE' : 'SOUS_MIN';
}

/** ce que dire du pot AVANT de signer : null s il couvre le plus gros prix, sinon la phrase « a win pays at most X » (X en USDC brut) */
export function plafondPot(pot, prixMax) {
  if (pot === null || pot === undefined) return { etat: 'NON_LU' };
  const p = BigInt(pot), m = BigInt(prixMax || 0);
  return p >= m && p > 0n ? { etat: 'COUVRE', pot: p } : { etat: 'PLAFONNE', pot: p };
}

/* ---------------------------------------------------------------- le pot du jour des pass (closeDay / drawDay) */
const mot = (n) => BigInt(n).toString(16).padStart(64, '0');
export const appelBuyerCount = (day) => selecteur('buyerCount(uint32)') + mot(day);
export const appelDayPot = (day) => selecteur('dayPots(uint32)') + mot(day);
/** dayPots(day) -> { pot, targetBlock, state } (state 0 Open, 1 Armed, 2 Drawn) ; null si illisible */
export function lireDayPot(hex) {
  const s = String(hex || '').replace(/^0x/, '');
  if (s.length < 192 || !/^[0-9a-f]+$/i.test(s)) return null;
  const w = (i) => BigInt('0x' + s.slice(i * 64, i * 64 + 64));
  const st = Number(w(2));
  return st > 2 ? null : { pot: w(0), targetBlock: Number(w(1)), state: st };
}

/**
 * Que faire du pot du jour `day` (memes refus que closeDay / drawDay du contrat) :
 *  AUCUN (pas d acheteur, deja tire, jour pas fini), FERMER (ouvert, ou arme mais sa fenetre de 256 blocs est passee : re-armer),
 *  ATTENDRE (arme, le bloc cible n est pas passe), TIRER (arme, dans la fenetre). Le pot va TOUJOURS a l acheteur tire, jamais a l appelant.
 */
export function tirageJourDu({ day, aujourdhui, buyers, dayPot, tete }) {
  if (!dayPot || buyers === null || buyers === undefined || !Number.isSafeInteger(Number(buyers)) || !Number.isSafeInteger(tete)) return { action: 'NON_LU' };
  if (!(Number(aujourdhui) > Number(day))) return { action: 'AUCUN', pourquoi: 'the day is not over yet (UTC)' };
  if (Number(buyers) === 0) return { action: 'AUCUN', pourquoi: 'nobody bought a pass that day' };
  if (dayPot.state === 2) return { action: 'AUCUN', pourquoi: 'already drawn' };
  if (dayPot.state === 0) return { action: 'FERMER' };
  const e = etatReglement(dayPot.targetBlock, tete);
  if (e.etat === 'TROP_TOT') return { action: 'ATTENDRE', blocsAvant: e.blocsAvant, targetBlock: dayPot.targetBlock };
  if (e.etat === 'REGLABLE') return { action: 'TIRER', blocsRestants: e.blocsRestants, targetBlock: dayPot.targetBlock };
  return { action: 'FERMER', rearmer: true };
}
