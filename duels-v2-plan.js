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
import { lireDuel, SIG_DUELS } from './duels-plan.js';
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
/* cote app seulement : la chaine dit le duel fini (Settled, Defaulted…) et le serveur ne l a pas encore relu */
export const FINI_CHAINE = 'FINI_CHAINE';
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
  /* revue 2026-10-24 n°1 : un duel que la CHAINE dit fini (lu par le suivi de l app) avant que le serveur ne l ait relu — aucune action */
  if (d && d.finChaine) return { etat: FINI_CHAINE, statut: d.finChaine };
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

/* ══ APRES UN JOIN (revue BlockDuelsV2 2026-10-24, MOYEN n°1) — /api/duels sert son cache (relu au plus toutes les 15 s) : juste apres un join,
 *   il dit encore le duel OUVERT. A 200 ms/bloc la fenetre ne dure que ~51 s : Settle doit etre propose DES que le bloc resultat existe. L app
 *   garde donc ce que le RECU dit (duelDepuisRecu), corrige la liste servie avec (fusionnerLocaux, oublie des que le serveur a rattrape), et
 *   suit le duel elle-meme (suivreDuel : la tete et le duel au temps de bloc MESURE, jusqu au settle ou a la fin de la fenetre).
 *   ⛔ Rien ne se signe ici : le suivi ne fait que LIRE et dire ; Settle reste un appui et une signature du wallet. */
const rang = (d) => (d && (d.settled || d.cancelled || d.refunded || d.defaulted || d.finChaine) ? 2 : d && d.joiner ? 1 : 0);
/** vrai si le duel est fini (regle, annule, rembourse, gagne par defaut, ou dit fini par la chaine) */
export const estFini = (d) => rang(d) === 2;
/** le duel `d` tel que les evenements d un RECU le disent (JOINED, SETTLED, DEFAULT_WON, CANCELLED, REFUNDED de CE duel) ; null si aucun, ou incoherent */
export function duelDepuisRecu(d, evs) {
  if (!d || !Array.isArray(evs)) return null;
  const id = String(d.id);
  let x = null;
  for (const ev of evs) {
    if (!ev || String(ev.id) !== id) continue;
    const b = x || d;
    if (ev.type === 'JOINED') {
      const tb = Number(ev.targetBlock);
      if (!ADR.test(bas(ev.joiner)) || !Array.isArray(ev.guessB) || ev.guessB.length !== 5 || !Number.isSafeInteger(tb) || tb <= 0) return null;
      x = { ...b, joiner: bas(ev.joiner), guessB: ev.guessB.map(Number), targetBlock: tb };
    } else if (ev.type === 'SETTLED') {
      if (!b.joiner) return null;
      x = { ...b, settled: { blockHash: bas(ev.blockHash), scoreA: ev.scoreA, scoreB: ev.scoreB, winner: bas(ev.winner), payout: BigInt(ev.payout) } };
    } else if (ev.type === 'DEFAULT_WON') {
      /* le defaut va TOUJOURS au createur : un recu qui dirait un autre gagnant n est pas cru */
      if (!b.joiner || bas(ev.winner) !== bas(b.creator)) return null;
      x = { ...b, defaulted: { winner: bas(ev.winner), payout: BigInt(ev.payout) } };
    } else if (ev.type === 'CANCELLED') x = { ...b, cancelled: true };
    else if (ev.type === 'REFUNDED') x = { ...b, refunded: true };
  }
  return x ? { ...x, local: true } : null;
}
/**
 * la liste SERVIE corrigee par les duels connus localement (Map id -> duel) : un servi MOINS avance que le local (ouvert < rejoint < fini) est
 * remplace par le local ; un servi au moins aussi avance l emporte et le local est OUBLIE ; un local absent de la liste est ajoute.
 * Rend { duels, locaux } (locaux = ceux qui servent encore).
 */
export function fusionnerLocaux(servis, locaux) {
  const reste = new Map(locaux || []), vus = new Set();
  const duels = (servis || []).map((d) => {
    const k = String(d.id); vus.add(k);
    const l = reste.get(k);
    if (!l) return d;
    if (rang(d) >= rang(l)) { reste.delete(k); return d; }
    return l;
  });
  for (const [k, l] of reste) if (!vus.has(k)) duels.push(l);
  return { duels, locaux: reste };
}
/** les secondes qui restent (au temps de bloc mesure) : avant le bloc resultat (ATTENTE), ou pour regler (REGLABLE) ; null sinon / non mesure */
export function compteARebours(e, sParBloc) {
  if (!e) return null;
  if (e.etat === 'ATTENTE') return secondesPour(e.blocsAvant, sParBloc);
  if (e.etat === 'REGLABLE') return secondesPour(e.blocsRestants, sParBloc);
  return null;
}
/** la ligne du compte a rebours (anglais, courte) ; sans mesure : les blocs seulement ; null hors ATTENTE / REGLABLE */
export function texteCompte(e, sParBloc) {
  const s = compteARebours(e, sParBloc);
  if (e && e.etat === 'ATTENTE') return s === null ? 'Result block in ' + e.blocsAvant + ' block' + (e.blocsAvant === 1 ? '' : 's') + '.' : 'Result block in about ' + Math.max(1, Math.round(s)) + ' s.';
  if (e && e.etat === 'REGLABLE') return s === null ? e.blocsRestants + ' blocks left to settle.' : 'About ' + Math.round(s) + ' s left to settle (' + e.blocsRestants + ' blocks).';
  return null;
}
/** la pause entre deux lectures du suivi : un DEMI temps de bloc avant le bloc resultat ou tant que la tete n est pas lue (borne 100 ms - 1 s ;
 *  500 ms sans mesure), 1 s ensuite */
export function pasSuiviMs(etat, sParBloc) {
  if (etat !== 'ATTENTE' && etat !== 'NON_LU') return 1000;
  const s = Number(sParBloc);
  if (!Number.isFinite(s) || s <= 0) return 500;
  return Math.min(1000, Math.max(100, Math.round((s * 1000) / 2)));
}
/** duels(id) a lire sur la chaine */
export const appelDuelEtat = (id) => selecteur(SIG_DUELS) + u(id);
/** le statut ('Open', 'Joined', 'Settled', 'Cancelled', 'Refunded', 'Defaulted') d un retour de duels(id) ; null s il est illisible */
export function statutDepuisRetour(retour) {
  const r = lireDuel(retour);
  return r ? STATUTS_V2[r.status] || null : null;
}
/**
 * LE SUIVI d un duel rejoint : lit la tete (`lireTete`) au pas de pasSuiviMs, et le statut du duel sur la chaine (`lireStatut`, au plus toutes
 * les `statutMs` une fois le bloc resultat passe) ; appelle surEtat({ duel, tete, etat, change, resteS, texte }) a chaque pas ; s arrete des
 * que le duel n est plus ATTENTE / REGLABLE (regle, fini sur la chaine, ou fenetre passee : DEFAULT_CREATOR), ou apres `maxMs`.
 * Les lectures ratees ne sont pas des etats : la tete garde la plus haute deja lue. Rend { etat, duel, tete }.
 */
export async function suivreDuel({ duel, lireTete, lireStatut = null, sParBloc = () => null, attendre, horloge = () => Date.now(), surEtat = () => {}, maxMs = 600000, statutMs = 2000 }) {
  const t0 = horloge(), sp = () => (typeof sParBloc === 'function' ? sParBloc() : sParBloc);
  let d = duel, avant = null, tete = null, dernierStatut = -Infinity;
  for (;;) {
    let t = null; try { t = await lireTete(); } catch (_) { t = null; }
    if (Number.isSafeInteger(t) && t > 0) tete = Math.max(tete || 0, t);
    const now = horloge();
    if (lireStatut && tete !== null && Number.isSafeInteger(d.targetBlock) && tete > d.targetBlock && now - dernierStatut >= statutMs) {
      dernierStatut = now;
      let s = null; try { s = await lireStatut(d.id); } catch (_) { s = null; }
      if (s && s !== 'Open' && s !== 'Joined' && s !== 'None') d = { ...d, finChaine: s };
    }
    const e = tete === null ? { etat: 'NON_LU' } : etatDuel(d, tete, Math.floor(now / 1000));
    const change = e.etat !== avant; avant = e.etat;
    surEtat({ duel: d, tete, etat: e.etat, change, resteS: compteARebours(e, sp()), texte: texteCompte(e, sp()) });
    if (!['ATTENTE', 'REGLABLE', 'NON_LU'].includes(e.etat) || now - t0 >= maxMs) return { etat: e.etat, duel: d, tete };
    await attendre(pasSuiviMs(e.etat, sp()));
  }
}

