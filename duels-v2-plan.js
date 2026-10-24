/* duels-v2-plan.js — LES DUELS v2 cote app (BlockDuelsV2, decision de Phil 2026-10-24). PUR : aucun reseau, aucune cle, aucune horloge.
 * LA REGLE v2 : un duel REJOINT et non regle dans sa fenetre (256 blocs apres son bloc resultat) est GAGNE PAR DEFAUT par le CREATEUR :
 *   n importe qui envoie settleDefault(id) apres la fenetre ; il paie comme une victoire du createur (90 / 7 / 3). Dans la fenetre, settle
 *   paie le vrai resultat (gain / perte / egalite remboursee). refundExpired ne sert plus qu a un duel JAMAIS rejoint et expire.
 *   => plus d option gratuite pour celui qui rejoint (se taire quand il perd = perdre) : aucun regleur du serveur n est necessaire, creer et
 *   rejoindre sont ouverts des que le contrat v2 est servi.
 * CE MODULE A LES MEMES NOMS QUE duels-plan-app.js (v1) : il les re-exporte tous et ne redefinit QUE ce que la regle v2 change. app.html et
 *   brain-jeu.js prennent l un ou l autre selon la `version` que sert /api/duels — le meme code de carte joue les deux contrats.
 * ⛔ Rien n est derive ici de la face ni du partage : traitsDepuisHash / scoreTraits / partage / resultatDuel sont ceux de v1 (le contrat v2
 *   a la MEME face et le MEME partage que v1 : testFuzz_FaceIdentiqueABlockRollsEtV1). */
import { selecteur, topic } from './keccak.js';
import * as V1 from './duels-plan-app.js';
import { etatReglement } from './blockrolls-plan.js';
import { secondesPour } from './temps-de-bloc.js';
export * from './duels-plan-app.js';

export const VERSION = 2;
export const SIG_SETTLE_DEFAULT = 'settleDefault(uint256)';
export const EV_DEFAULT_WON = 'DefaultWon(uint256,address,uint256)';
const T_DEFAULT_WON = topic(EV_DEFAULT_WON);
export const TOPICS_DUELS = Object.freeze([...V1.TOPICS_DUELS, T_DEFAULT_WON]);
/* les statuts du contrat v2 (enum Status) : 0..5 comme v1, Defaulted (6) ajoute a la fin */
export const STATUTS_V2 = Object.freeze(['None', 'Open', 'Joined', 'Settled', 'Cancelled', 'Refunded', 'Defaulted']);
/* les etats de l ecran : ceux de v1, sauf REMBOURSABLE (n existe plus) -> DEFAULT_CREATOR (reclamable par tous) ; GAGNE_DEFAUT = fini */
export const DEFAULT_CREATOR = 'DEFAULT_CREATOR';
export const GAGNE_DEFAUT = 'GAGNE_DEFAUT';
export const FINIS = Object.freeze([...V1.FINIS, GAGNE_DEFAUT]);

const ADR = /^0x[0-9a-f]{40}$/;
const ZERO = '0x' + '0'.repeat(40);
const bas = (x) => String(x || '').toLowerCase();
const u = (n) => { const v = BigInt(n); if (v < 0n || v >= (1n << 256n)) throw new Error('uint256 out of range: ' + n); return v.toString(16).padStart(64, '0'); };
const sel = (sig) => selecteur(sig).replace(/^0x/, '');
const refuse = (pourquoi) => ({ etat: 'REFUSE', pourquoi, appels: [] });

/* ── le texte de la regle (UNE source : la carte, le brain, la page de deploiement et « Fees & risks » le disent ainsi) ── */
/** la duree de la fenetre au temps de bloc MESURE (s), ou null (jamais 2 s par defaut) */
export const fenetreSecondes = (sParBloc) => { const s = secondesPour(V1.FENETRE, sParBloc); return s === null ? null : Math.round(s); };
/** la ligne dite AVANT qu un join soit signe ; null si le temps de bloc n est pas mesure (alors aucun join n est propose) */
export function phraseAvantJoin(sParBloc) {
  const n = fenetreSecondes(sParBloc);
  return n === null ? null : 'Settle within about ' + n + ' s after the result block (' + V1.FENETRE + ' blocks at the measured block time) or the creator wins by default.';
}
export const PHRASE_SANS_MESURE = 'The block time is not measured yet, so the settle window cannot be stated: nothing to accept for now.';
export const APRES_FENETRE = 'After that, the creator wins by default.';
export const PHRASE_EGALITE = 'A tie settled in the window refunds both, no fee; a tie not settled in it goes to the creator by default.';
/* v1 fermait creer / rejoindre sans regleur ; v2 n en a pas besoin : la phrase « fermee » ne sert plus (gardee pour l interface commune) */
export const PHRASE_DUELS_FERMES = 'New duels are closed.';
/** /api/duels -> creer et rejoindre sont-ils proposes ? v2 : oui des que le serveur sert un contrat v2 LU */
export const duelsOuverts = (j) => !!(j && j.version === VERSION && j.ok === true && ADR.test(bas(j.contrat)));

/**
 * Ou en est un duel v2 : comme v1 (REGLE, ANNULE, REMBOURSE, OUVERT, EXPIRE, ATTENTE, REGLABLE, NON_LU) ; GAGNE_DEFAUT (fini : le createur a
 * gagne par defaut) ; DEFAULT_CREATOR (rejoint, fenetre passee : settleDefault, par n importe qui). Jamais REMBOURSABLE.
 */
export function etatDuel(d, tete, maintenant) {
  if (d && d.defaulted) return { etat: GAGNE_DEFAUT };
  const e = V1.etatDuel(d, tete, maintenant);
  return e.etat === 'REMBOURSABLE' ? { etat: DEFAULT_CREATOR } : e;
}

/** ce que `moi` peut faire MAINTENANT (seulement ce que le contrat accepterait) : JOIN, CANCEL, SETTLE, SETTLE_DEFAULT, REFUND — ou rien.
 *  `ouverts` est garde pour l interface commune : en v2, JOIN ne depend que de l etat (et du temps de bloc mesure, verifie par planJoin). */
export function actionsDuel(d, moi, tete, maintenant, ouverts = true) {
  const e = etatDuel(d, tete, maintenant), m = bas(moi), cre = bas(d && d.creator);
  if (e.etat === 'OUVERT') {
    if (!ADR.test(m)) return [];
    if (m === cre) return ['CANCEL'];
    return ouverts !== false && e.resteS >= V1.MARGE_JOIN_S ? ['JOIN'] : [];
  }
  if (e.etat === 'REGLABLE') return ['SETTLE'];
  if (e.etat === DEFAULT_CREATOR) return ['SETTLE_DEFAULT'];
  if (e.etat === 'EXPIRE') return ['REFUND'];
  return [];
}

/** join v2 : le plan de v1 (approve EXACT + join), SEULEMENT si la fenetre peut etre dite au temps mesure ; `avertissement` = la ligne a dire */
export function planJoin(args = {}) {
  const avertissement = phraseAvantJoin(args.sParBloc);
  if (!avertissement) return refuse(PHRASE_SANS_MESURE);
  const p = V1.planJoin(args);
  return p.etat === 'PRET' ? { ...p, avertissement } : p;
}

/** settle v2 : dans la fenetre seulement ; apres, le createur gagne par defaut (settleDefault) */
export function planSettle({ contrat, id, targetBlock = null, blocActuel = null }) {
  if (targetBlock != null && blocActuel != null && etatReglement(targetBlock, blocActuel).etat === 'PERDU') return refuse('the ' + V1.FENETRE + '-block window passed: the creator wins by default (settle default)');
  return V1.planSettle({ contrat, id, targetBlock, blocActuel });
}

/** settleDefault : n importe qui, une fois bloc > cible + 256 ; paie le CREATEUR comme une victoire (90 / 7 / 3). Refuse avant, ou sans cible. */
export function planSettleDefault({ contrat, id, targetBlock = null, blocActuel = null }) {
  if (targetBlock == null || blocActuel == null) return refuse('the result block and the chain head are needed to know if the window has passed');
  const e = etatReglement(targetBlock, blocActuel);
  if (e.etat === 'TROP_TOT') return refuse('the result block is not in yet');
  if (e.etat === 'REGLABLE') return refuse('still inside the window (' + e.blocsRestants + ' block(s) left): settle it for the real result');
  try { return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_SETTLE_DEFAULT) + u(id), quoi: 'duel #' + id + ' was not settled in its window: the creator wins by default' }] }; }
  catch (err) { return refuse(String(err.message || err)); }
}

/** refundExpired v2 : un duel JAMAIS rejoint et expire, seulement (si `duel` et l instant sont donnes, verifie avant la signature) */
export function planRefund({ contrat, id, duel = null, maintenant = null }) {
  if (duel && duel.joiner) return refuse('a joined duel is never refunded in v2: settle it in the window, or the creator wins by default');
  if (duel && maintenant != null && Number(maintenant) < Number(duel.expiresAt)) return refuse('this duel is still open: only its creator can cancel it now');
  return V1.planRefund({ contrat, id });
}

/* ── lectures ── */
/** UN log -> l evenement v1 decode, ou DEFAULT_WON { id, winner, payout } ; null s il n est d aucune forme connue */
export function decoderLogDuel(l, contrat) {
  if (l && bas(l.address) === bas(contrat) && Array.isArray(l.topics) && bas(l.topics[0]) === T_DEFAULT_WON) {
    if (l.topics.length !== 3) return null;
    const s = String(l.data || '').replace(/^0x/, '');
    if (s.length !== 64) return null;
    let id; try { id = BigInt(l.topics[1]).toString(); } catch (_) { return null; }
    return { type: 'DEFAULT_WON', id, winner: '0x' + bas(l.topics[2]).replace(/^0x/, '').padStart(64, '0').slice(-40), payout: BigInt('0x' + s) };
  }
  return V1.decoderLogDuel(l, contrat);
}
export const lireEvenementsDuel = (logs, contrat) => (logs || []).map((l) => decoderLogDuel(l, contrat)).filter(Boolean);

/** un duel servi en JSON (/api/duels v2) -> le meme objet que v1, plus `defaulted` ({ winner, payout } ou null) */
export function duelDepuisJson(o) {
  const d = V1.duelDepuisJson(o);
  if (!d) return null;
  if (!o.defaulted) return { ...d, defaulted: null };
  const x = o.defaulted;
  if (!ADR.test(bas(x.winner)) || !/^\d{1,78}$/.test(String(x.payout)) || !d.joiner || d.settled || d.cancelled || d.refunded) return null;
  /* le defaut va TOUJOURS au createur : un JSON qui dirait un autre gagnant est refuse (jamais montre) */
  if (bas(x.winner) !== d.creator) return null;
  return { ...d, defaulted: { winner: bas(x.winner), payout: BigInt(x.payout) } };
}
/** l inverse, pour le serveur (BigInt -> texte) */
export function duelEnJson(d) {
  return { ...V1.duelEnJson(d), defaulted: d.defaulted ? { winner: d.defaulted.winner, payout: d.defaulted.payout.toString() } : null };
}

