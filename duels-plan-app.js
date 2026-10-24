/* duels-plan-app.js — LES DUELS cote app (Phil 2026-10-18 : « les brains peuvent se faire des duels ; le gagnant 90 %, 7 % au pool de reward
 *   commun, 3 % au dev »). Deux wallets misent la MEME somme (USDC ou une action tokenisee admise), chacun pose une face de block (5 traits :
 *   couleur, orbite, facette, matiere, ornement — les memes que BlockRolls), le bloc join + 2 tire SA face ; le plus de traits en commun gagne.
 * PUR : aucun reseau, aucune cle, aucune horloge (l instant et la tete sont DONNES). Encode les appels NON SIGNES (approve EXACT + create,
 *   approve EXACT + join, cancel, settle, refundExpired) et lit les evenements Created / Joined / Settled / Cancelled / Refunded.
 * ⛔ CE MODULE EST ECRIT CONTRE L INTERFACE PARTAGEE du 2026-10-18 (contrat BlockDuels ecrit en parallele), PAS contre une ABI compilee.
 *   Les signatures d evenements dont l interface ne fixe pas le type (expiresAt / targetBlock : uint64 ou uint256 ; winner indexe ou non ;
 *   token indexe ou non ; le nom de l evenement de remboursement) sont acceptees sous TOUTES leurs variantes listees ci-dessous : une
 *   variante inconnue = le log est IGNORE (jamais devine). Les selecteurs de FONCTIONS, eux, sont fixes par l interface.
 *   NON PROUVE ici : la parite avec le contrat compile (a faire des que contracts/out/BlockDuels.json existe : comparer chaque selecteur et
 *   chaque topic a l ABI, comme test-blockrolls-plan le fait pour BlockRolls).
 * ⛔ LA FACE DU BLOC = traitsDepuisHash de blockrolls-plan.js (faceRevelee -> les 5 indices), la MEME derivation que BlockRolls.faceOf
 *   (parite prouvee par test-blockrolls-parite). Rien n est re-derive ici. */
import { selecteur, topic } from './keccak.js';
import { traitsDepuisHash, scoreTraits, refusGuess, etatReglement, TAILLES, FENETRE, DELAI_CIBLE } from './blockrolls-plan.js';
import { BANDES } from './face-du-jour.js';
import { ORBITES, FACETTES, MATIERES, ORNEMENTS } from './apparence.js';

/* ── l interface partagee (fonctions) ── */
export const SIG_CREATE = 'create(address,uint256,uint8[5],uint64)';
export const SIG_JOIN = 'join(uint256,uint8[5])';
export const SIG_CANCEL = 'cancel(uint256)';
export const SIG_SETTLE = 'settle(uint256)';
export const SIG_REFUND = 'refundExpired(uint256)';
export const SIG_NEXT_ID = 'nextId()';
/* le chemin de retour d un paiement qu un jeton a REFUSE (blacklist, pause…) : le contrat le garde en `owed`, son destinataire le reclame */
export const SIG_CLAIM = 'claim(address,address)';
export const SIG_OWED = 'owed(address,address)';
const SIG_APPROVE = 'approve(address,uint256)';
/* ⛔ le getter d admission n est PAS nomme par l interface (seul setToken l est) : ses noms PLAUSIBLES, essayes dans l ordre ; une reponse qui
 *   n est pas EXACTEMENT un mot 0/1 ne decide rien. Aucune reponse lisible = action NON proposee (fail-closed ; l USDC reste admis : il l est
 *   a la construction). */
export const SIGS_ADMIS = Object.freeze(['tokenOk(address)', 'admitted(address)', 'tokens(address)', 'isToken(address)', 'allowedToken(address)']);

/* ── les evenements, et leurs variantes acceptees ── */
export const EVS_CREATED = Object.freeze(['Created(uint256,address,address,uint256,uint8[5],uint64)', 'Created(uint256,address,address,uint256,uint8[5],uint256)']);
export const EVS_JOINED = Object.freeze(['Joined(uint256,address,uint8[5],uint256)', 'Joined(uint256,address,uint8[5],uint64)']);
export const EVS_SETTLED = Object.freeze(['Settled(uint256,bytes32,uint8,uint8,address,uint256)']);
/* 2026-10-18 : la forme LUE dans contracts/src/BlockDuels.sol de la partie contrat (worktree wt-duels-contract, encore en cours) est la PREMIERE
 *   de chaque liste ; les autres restent tolerees. 8 topics au plus : un OU de topics au-dela de 10 est refuse par certains noeuds. */
export const EVS_CANCELLED = Object.freeze(['Cancelled(uint256)']);
export const EVS_REFUNDED = Object.freeze(['Refunded(uint256,uint256,uint256)', 'Refunded(uint256)']);
const T = (l) => new Set(l.map((s) => topic(s)));
const T_CREATED = T(EVS_CREATED), T_JOINED = T(EVS_JOINED), T_SETTLED = T(EVS_SETTLED), T_CANCELLED = T(EVS_CANCELLED), T_REFUNDED = T(EVS_REFUNDED);
export const TOPICS_DUELS = Object.freeze([...T_CREATED, ...T_JOINED, ...T_SETTLED, ...T_CANCELLED, ...T_REFUNDED]);

/* ── les regles de l interface ── */
export const MISE_MIN = 100000n;              /* stake >= 100000 unites du jeton (0 refuse) */
export const MISE_MAX = (1n << 96n) - 1n;     /* la mise tient dans un uint96 (MAX_STAKE du contrat lu) */
export const EXPIRATION_MIN_S = 600;          /* expiresIn entre 10 min… */
export const EXPIRATION_MAX_S = 7 * 86400;    /* …et 7 jours */
export const PART_GAGNANT_BPS = 9000n, PART_POOL_BPS = 700n, BPS = 10000n; /* le reste (3 % + la poussiere d arrondi) au dev */
export const MARGE_JOIN_S = 60;               /* un join a moins d une minute de l expiration n est pas propose (il revertirait apres la signature) */
export { FENETRE, DELAI_CIBLE };

const ADR = /^0x[0-9a-f]{40}$/;
const ZERO = '0x' + '0'.repeat(40);
const bas = (x) => String(x || '').toLowerCase();
const u = (n) => { const v = BigInt(n); if (v < 0n || v >= (1n << 256n)) throw new Error('uint256 out of range: ' + n); return v.toString(16).padStart(64, '0'); };
const a = (x) => { const s = bas(x); if (!ADR.test(s)) throw new Error('bad address ' + x); return s.slice(2).padStart(64, '0'); };
const sel = (sig) => selecteur(sig).replace(/^0x/, '');
const refuse = (pourquoi) => ({ etat: 'REFUSE', pourquoi, appels: [] });
const brut = (x) => { try { const v = BigInt(x); return v >= 0n ? v : null; } catch (_) { return null; } };
const motsGuess = (g) => g.map((x) => u(x)).join('');
const approuver = (jeton, contrat, montant, quoi) => ({ to: bas(jeton), data: '0x' + sel(SIG_APPROVE) + a(contrat) + u(montant), quoi });

/** le partage d un pot de deux mises : gagnant 90 %, pool commun 7 %, dev le reste (3 % + poussiere) — la somme est EXACTE */
export function partage(mise) {
  const m = brut(mise);
  if (m === null) return null;
  const pot = 2n * m, gagnant = (pot * PART_GAGNANT_BPS) / BPS, pool = (pot * PART_POOL_BPS) / BPS;
  return { pot, gagnant, pool, dev: pot - gagnant - pool };
}

/** les refus de create AVANT la signature ; [] = valide */
export function refusCreate({ token, stake, guess, expiresIn }) {
  const r = [];
  if (!ADR.test(bas(token)) || bas(token) === ZERO) r.push('pick a token');
  const m = brut(stake);
  if (m === null || m === 0n) r.push('the stake must be above zero');
  else if (m < MISE_MIN) r.push('the stake is at least ' + MISE_MIN + ' raw units of the token');
  else if (m > MISE_MAX) r.push('the stake is too large for the contract');
  const e = Number(expiresIn);
  if (!Number.isInteger(e) || e < EXPIRATION_MIN_S || e > EXPIRATION_MAX_S) r.push('a challenge stays open 10 minutes to 7 days');
  r.push(...refusGuess(guess));
  return r;
}

/** create : [approve(contrat, stake EXACT), create(token, stake, guess, expiresIn)]. Jamais d approbation infinie. */
export function planCreate({ contrat, token, stake, guess, expiresIn }) {
  const r = refusCreate({ token, stake, guess, expiresIn });
  if (r.length) return refuse(r.join('; '));
  try {
    const m = BigInt(stake);
    return { etat: 'PRET', mise: m.toString(), appels: [
      approuver(token, contrat, m, 'approve exactly the stake (' + m + ' raw units)'),
      { to: bas(contrat), data: '0x' + sel(SIG_CREATE) + a(token) + u(m) + motsGuess(guess) + u(expiresIn), quoi: 'open the challenge: your face against the block after the join + 2' },
    ] };
  } catch (e) { return refuse(String(e.message || e)); }
}

/** join : [approve(contrat, la MEME mise EXACTE, sur le jeton du duel), join(id, guess)] — refuse son propre duel, un duel deja pris ou expire */
export function planJoin({ contrat, duel, guess, moi, maintenant }) {
  const d = duel || {};
  const rg = refusGuess(guess);
  if (rg.length) return refuse(rg.join('; '));
  if (!ADR.test(bas(moi))) return refuse('connect a wallet');
  if (bas(d.creator) === bas(moi)) return refuse('this is your own challenge');
  if (d.joiner) return refuse('this challenge was already accepted');
  if (d.settled || d.cancelled || d.refunded) return refuse('this challenge is closed');
  const t = Number(maintenant);
  if (!Number.isFinite(t) || !(Number(d.expiresAt) - t >= MARGE_JOIN_S)) return refuse('this challenge expires in less than a minute (or has expired)');
  const m = brut(d.stake);
  if (m === null || m < MISE_MIN) return refuse('the stake of this challenge could not be read');
  try {
    return { etat: 'PRET', mise: m.toString(), appels: [
      approuver(d.token, contrat, m, 'approve exactly the same stake (' + m + ' raw units)'),
      { to: bas(contrat), data: '0x' + sel(SIG_JOIN) + u(d.id) + motsGuess(guess), quoi: 'accept challenge #' + d.id + ': the block 2 blocks from now decides' },
    ] };
  } catch (e) { return refuse(String(e.message || e)); }
}

export function planCancel({ contrat, id }) {
  try { return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_CANCEL) + u(id), quoi: 'cancel challenge #' + id + ' — your stake comes back in full' }] }; }
  catch (e) { return refuse(String(e.message || e)); }
}
/** settle : n importe qui ; refuse hors fenetre quand cible et tete sont donnees (trop tot / plus de blockhash -> refundExpired) */
export function planSettle({ contrat, id, targetBlock = null, blocActuel = null }) {
  if (targetBlock != null && blocActuel != null) {
    const e = etatReglement(targetBlock, blocActuel);
    if (e.etat === 'TROP_TOT') return refuse('too early: wait ' + e.blocsAvant + ' more block(s)');
    if (e.etat === 'PERDU') return refuse('the 256-block window passed: refund both stakes instead');
  }
  try { return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_SETTLE) + u(id), quoi: 'reveal the block face and pay challenge #' + id }] }; }
  catch (e) { return refuse(String(e.message || e)); }
}
export function planRefund({ contrat, id }) {
  try { return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_REFUND) + u(id), quoi: 'refund challenge #' + id + ' in full (no fee)' }] }; }
  catch (e) { return refuse(String(e.message || e)); }
}

/** claim : ce que le contrat doit a CE wallet dans ce jeton (un paiement que le jeton a refuse), envoye a `to` (par defaut lui-meme) */
export function planClaim({ contrat, token, to }) {
  try { return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_CLAIM) + a(token) + a(to), quoi: 'claim what the duels contract owes you' }] }; }
  catch (e) { return refuse(String(e.message || e)); }
}

/* ── lectures ── */
export const appelNextId = () => selecteur(SIG_NEXT_ID);
export const appelOwed = (token, compte) => selecteur(SIG_OWED) + a(token) + a(compte);
export const appelAdmis = (sig, token) => selecteur(sig) + a(token);
/** un mot 0/1 rendu par eth_call -> booleen ; tout le reste -> null (jamais « probablement admis ») */
export function lireBool(hex) {
  const s = String(hex || '').replace(/^0x/, '');
  if (s.length !== 64 || !/^[0-9a-f]+$/i.test(s)) return null;
  const v = BigInt('0x' + s);
  return v === 0n ? false : v === 1n ? true : null;
}

const motsDe = (data) => { const s = String(data || '').replace(/^0x/, ''); if (s.length % 64) return null; return (s.match(/.{64}/g) || []).map((w) => BigInt('0x' + w)); };
const adrDeMot = (w) => '0x' + w.toString(16).padStart(64, '0').slice(-40);
const adrDeTopic = (t) => '0x' + bas(t).replace(/^0x/, '').padStart(64, '0').slice(-40);
const guessOk = (g) => refusGuess(g).length === 0;

/**
 * Les duels d un lot de logs (fenetres qui se recouvrent : un doublon compte une fois). Rend une Map id -> duel :
 *   { id (string), creator, token, stake (BigInt), guessA, expiresAt, blocCree, joiner, guessB, targetBlock, settled, cancelled, refunded }.
 * Un log d un autre contrat, un topic inconnu, une donnee de mauvaise taille, un guess hors bornes : IGNORE. Un Joined / Settled sans
 * son Created dans la fenetre : garde a part (orphelins) — l app ne montre pas un duel dont elle ne connait pas la mise.
 */
/** UN log -> { type: CREATED | JOINED | SETTLED | CANCELLED | REFUNDED, id, ... } ; null s il n est pas EXACTEMENT d une forme connue */
export function decoderLogDuel(l, contrat) {
  if (!l || bas(l.address) !== bas(contrat) || !Array.isArray(l.topics) || l.topics.length < 2) return null;
  const t0 = bas(l.topics[0]);
  let id; try { id = BigInt(l.topics[1]).toString(); } catch (_) { return null; }
  const m = motsDe(l.data);
  if (m === null) return null;
  if (T_CREATED.has(t0)) {
    if (l.topics.length < 3) return null;
    const tokIndexe = l.topics.length >= 4;
    if ((tokIndexe && m.length !== 7) || (!tokIndexe && m.length !== 8)) return null;
    const w = tokIndexe ? m : m.slice(1);
    const guess = w.slice(1, 6).map(Number);
    if (!guessOk(guess)) return null;
    return { type: 'CREATED', id, creator: adrDeTopic(l.topics[2]), token: tokIndexe ? adrDeTopic(l.topics[3]) : adrDeMot(m[0]), stake: w[0], guessA: guess, expiresAt: Number(w[6]), blocCree: Number(l.blockNumber) || null };
  }
  if (T_JOINED.has(t0)) {
    if (l.topics.length < 3 || m.length !== 6) return null;
    const guess = m.slice(0, 5).map(Number);
    if (!guessOk(guess)) return null;
    return { type: 'JOINED', id, joiner: adrDeTopic(l.topics[2]), guessB: guess, targetBlock: Number(m[5]) };
  }
  if (T_SETTLED.has(t0)) {
    /* winner indexe (topics[2], 4 mots) ou dans les donnees (5 mots) : les deux formes de l interface */
    let s = null;
    if (l.topics.length >= 3 && m.length === 4) s = { blockHash: '0x' + m[0].toString(16).padStart(64, '0'), scoreA: Number(m[1]), scoreB: Number(m[2]), winner: adrDeTopic(l.topics[2]), payout: m[3] };
    else if (l.topics.length === 2 && m.length === 5) s = { blockHash: '0x' + m[0].toString(16).padStart(64, '0'), scoreA: Number(m[1]), scoreB: Number(m[2]), winner: adrDeMot(m[3]), payout: m[4] };
    if (!s || s.scoreA > 5 || s.scoreB > 5) return null;
    return { type: 'SETTLED', id, ...s };
  }
  if (T_CANCELLED.has(t0)) return { type: 'CANCELLED', id };
  if (T_REFUNDED.has(t0)) return { type: 'REFUNDED', id };
  return null;
}
/** les evenements de duel d un RECU (ou de n importe quels logs), decodes un par un, dans l ordre */
export const lireEvenementsDuel = (logs, contrat) => (logs || []).map((l) => decoderLogDuel(l, contrat)).filter(Boolean);

export function lireDuels({ logs, contrat }) {
  const duels = new Map(), suite = [], vus = new Set();
  const tries = [...(logs || [])].filter(Boolean).sort((x, y) => (Number(x.blockNumber) - Number(y.blockNumber)) || (Number(x.logIndex) - Number(y.logIndex)));
  for (const l of tries) {
    const k = String(l.transactionHash) + ':' + String(l.logIndex);
    if (l.transactionHash && vus.has(k)) continue;
    vus.add(k);
    const ev = decoderLogDuel(l, contrat);
    if (!ev) continue;
    if (ev.type === 'CREATED') {
      const { type, ...c } = ev;
      duels.set(ev.id, { ...c, joiner: null, guessB: null, targetBlock: null, settled: null, cancelled: false, refunded: false });
    } else suite.push(ev);
  }
  const orphelins = [];
  for (const ev of suite) {
    const d = duels.get(ev.id);
    if (!d) { orphelins.push(ev.id); continue; }
    if (ev.type === 'JOINED') Object.assign(d, { joiner: ev.joiner, guessB: ev.guessB, targetBlock: ev.targetBlock });
    else if (ev.type === 'SETTLED') d.settled = { blockHash: ev.blockHash, scoreA: ev.scoreA, scoreB: ev.scoreB, winner: ev.winner, payout: ev.payout };
    else if (ev.type === 'CANCELLED') d.cancelled = true;
    else if (ev.type === 'REFUNDED') d.refunded = true;
  }
  return { duels, orphelins: [...new Set(orphelins)] };
}

/**
 * Ou en est un duel :
 *   REGLE · ANNULE · REMBOURSE (fini) ; OUVERT (prenable : maintenant < expiresAt) ; EXPIRE (jamais pris, expire : refundExpired rend la
 *   mise au createur) ; ATTENTE (pris, le bloc cible n est pas passe) ; REGLABLE (dans les 256 blocs) ; REMBOURSABLE (pris, fenetre passee :
 *   refundExpired rend les DEUX mises) ; NON_LU (pris, tete inconnue).
 */
export function etatDuel(d, tete, maintenant) {
  if (!d) return { etat: 'NON_LU' };
  if (d.settled) return { etat: 'REGLE' };
  if (d.cancelled) return { etat: 'ANNULE' };
  if (d.refunded) return { etat: 'REMBOURSE' };
  if (!d.joiner) {
    const t = Number(maintenant);
    if (!Number.isFinite(t)) return { etat: 'NON_LU' };
    return t < Number(d.expiresAt) ? { etat: 'OUVERT', resteS: Number(d.expiresAt) - t } : { etat: 'EXPIRE' };
  }
  if (!Number.isSafeInteger(Number(tete)) || Number(tete) <= 0 || !Number.isSafeInteger(Number(d.targetBlock))) return { etat: 'NON_LU' };
  const e = etatReglement(d.targetBlock, tete);
  if (e.etat === 'TROP_TOT') return { etat: 'ATTENTE', blocsAvant: e.blocsAvant };
  if (e.etat === 'REGLABLE') return { etat: 'REGLABLE', blocsRestants: e.blocsRestants };
  return { etat: 'REMBOURSABLE' };
}
export const FINIS = Object.freeze(['REGLE', 'ANNULE', 'REMBOURSE']);

/* ══ L OPTION GRATUITE DU JOUEUR QUI REJOINT (audit 2026-10-24, contracts/src/BlockDuels.sol:191-240) : settle() ne marche que dans les 256
 *   blocs apres la cible, refundExpired() rend les DEUX mises en entier ensuite. Celui qui rejoint est en ligne par definition et voit le hash
 *   2 blocs apres : il regle s il gagne, se tait s il perd, et se fait rembourser. Banc forge de l auditeur : 2000 duels, joueur qui rejoint
 *   +454,4 USDC, createur -568 USDC (= gains x mise). Le contrat est deploye et immuable : la seule parade est un regleur du SERVEUR qui regle
 *   chaque duel dans sa fenetre. Tant qu il ne regle pas CE contrat, l app ne propose NI d ouvrir NI de rejoindre un duel (pas de bouton mort :
 *   caches, une phrase le dit). Les duels deja en jeu gardent Settle / Refund / Cancel.
 * ⛔ FAIL-CLOSED : « le regleur regle ce contrat » = son etat est ON ET il nomme ce contrat dans etat().contrats (une adresse, ou un objet
 *   { contrat, etat } dont l etat est ON s il est donne). Un regleur ON qui ne nomme pas le contrat (le regleur des slots d aujourd hui) ne
 *   compte pas. */
export const PHRASE_DUELS_FERMES = 'New duels open once the automatic settler runs: without it, a player who joins and loses could let the duel expire and get a refund.';
/** le regleur du serveur (son etat(), tel que /sante le publie) regle-t-il ce contrat ? */
export function regleurCouvre(e, contrat) {
  const c = bas(contrat);
  if (!e || e.etat !== 'ON' || !ADR.test(c) || !Array.isArray(e.contrats)) return false;
  return e.contrats.some((x) => (typeof x === 'string' ? bas(x) === c : !!x && bas(x.contrat) === c && (x.etat === undefined || x.etat === 'ON')));
}
/** /api/duels -> creer et rejoindre un duel sont-ils proposes ? seulement si le serveur dit que son regleur regle ce contrat */
export const duelsOuverts = (j) => !!(j && j.regleur && j.regleur.regleDuels === true);

/** ce que `moi` peut faire sur ce duel MAINTENANT (seulement ce que le contrat accepterait) : JOIN, CANCEL, SETTLE, REFUND — ou rien.
 *  `ouverts` (duelsOuverts) : JOIN n est propose QUE s il vaut true (defaut : ferme) ; CANCEL / SETTLE / REFUND ne dependent pas de lui. */
export function actionsDuel(d, moi, tete, maintenant, ouverts = false) {
  const e = etatDuel(d, tete, maintenant), m = bas(moi), cre = bas(d && d.creator);
  if (e.etat === 'OUVERT') {
    if (!ADR.test(m)) return [];
    if (m === cre) return ['CANCEL'];
    return ouverts === true && e.resteS >= MARGE_JOIN_S ? ['JOIN'] : [];
  }
  if (e.etat === 'REGLABLE') return ['SETTLE'];
  if (e.etat === 'EXPIRE' || e.etat === 'REMBOURSABLE') return ['REFUND'];
  return [];
}

/** le resultat que l app relit d un hash de bloc (meme derivation que le contrat) : la face du bloc, les deux scores, le gagnant, les montants */
export function resultatDuel(d, blockHash) {
  const face = traitsDepuisHash(blockHash);
  if (!face || !d || !d.guessA || !d.guessB) return null;
  const sA = scoreTraits(d.guessA, face), sB = scoreTraits(d.guessB, face), p = partage(d.stake);
  if (!p) return null;
  const gagnant = sA > sB ? bas(d.creator) : sB > sA ? bas(d.joiner) : null;
  /* ⛔ `gagnant` est l ADRESSE ; le montant s appelle `auGagnant` (un `...partage()` ecrasait l adresse par le montant — attrape par le test) */
  return { face, scoreA: sA, scoreB: sB, gagnant, egalite: gagnant === null, pot: p.pot, auGagnant: p.gagnant, auPool: p.pool, auDev: p.dev };
}

/** la face d un GUESS (5 indices) -> une apparence dessinable par logo.js : les 5 traits scores tels quels, la teinte au centre de sa bande ;
 *   le reste (accent, eclats…) fixe — il ne compte pas dans le score. null si le guess est hors bornes. */
export function apparenceDepuisGuess(g) {
  if (!guessOk(g)) return null;
  const teinte = g[0] * 60;
  return { teinte, accent: (teinte + 180) % 360, division: 3, eclats: 3, orbite: ORBITES[g[1]], facette: FACETTES[g[2]], matiere: MATIERES[g[3]], ornement: ORNEMENTS[g[4]], ecart: 2 };
}
export { TAILLES, BANDES };

/** un duel servi en JSON (/api/duels) -> le meme objet que lireDuels, ou null s il n est pas EXACTEMENT de la bonne forme */
export function duelDepuisJson(o) {
  if (!o || typeof o !== 'object') return null;
  const id = /^\d{1,30}$/.test(String(o.id)) ? String(o.id) : null, stake = /^\d{1,78}$/.test(String(o.stake)) ? BigInt(o.stake) : null;
  if (id === null || stake === null || !ADR.test(bas(o.creator)) || !ADR.test(bas(o.token)) || !guessOk(o.guessA) || !Number.isSafeInteger(o.expiresAt)) return null;
  const j = o.joiner ? (ADR.test(bas(o.joiner)) && guessOk(o.guessB) && Number.isSafeInteger(o.targetBlock) ? { joiner: bas(o.joiner), guessB: o.guessB.map(Number), targetBlock: o.targetBlock } : null) : { joiner: null, guessB: null, targetBlock: null };
  if (!j) return null;
  let settled = null;
  if (o.settled) {
    const s = o.settled;
    if (!/^0x[0-9a-f]{64}$/.test(bas(s.blockHash)) || !Number.isInteger(s.scoreA) || !Number.isInteger(s.scoreB) || !ADR.test(bas(s.winner)) || !/^\d{1,78}$/.test(String(s.payout))) return null;
    settled = { blockHash: bas(s.blockHash), scoreA: s.scoreA, scoreB: s.scoreB, winner: bas(s.winner), payout: BigInt(s.payout) };
  }
  return { id, creator: bas(o.creator), token: bas(o.token), stake, guessA: o.guessA.map(Number), expiresAt: o.expiresAt, blocCree: Number.isSafeInteger(o.blocCree) ? o.blocCree : null,
    ...j, settled, cancelled: o.cancelled === true, refunded: o.refunded === true,
    creatorBlocks: Array.isArray(o.creatorBlocks) ? o.creatorBlocks.map(bas).filter((x) => ADR.test(x)).slice(0, 5) : [] };
}
/** l inverse, pour le serveur (BigInt -> texte) */
export function duelEnJson(d) {
  return { id: d.id, creator: d.creator, token: d.token, stake: d.stake.toString(), guessA: d.guessA, expiresAt: d.expiresAt, blocCree: d.blocCree,
    joiner: d.joiner, guessB: d.guessB, targetBlock: d.targetBlock,
    settled: d.settled ? { ...d.settled, payout: d.settled.payout.toString() } : null, cancelled: d.cancelled, refunded: d.refunded };
}

/* ── les fenetres de lecture des logs (bornees : jamais depuis le bloc de deploiement d un coup) ── */
export const TAILLE_FENETRE_LOGS = 2000;
export function filtreLogsDuels({ contrat, de, a: jusqua }) {
  const c = bas(contrat);
  if (!ADR.test(c) || !Number.isSafeInteger(de) || !Number.isSafeInteger(jusqua) || de < 0 || jusqua < de) return null;
  return { address: c, fromBlock: '0x' + de.toString(16), toBlock: '0x' + jusqua.toString(16), topics: [TOPICS_DUELS] };
}
