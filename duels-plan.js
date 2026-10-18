/* duels-plan.js — les appels NON SIGNES de BlockDuels (contracts/src/BlockDuels.sol) : creer (approve EXACT + create), rejoindre (approve
 * EXACT + join), settle, cancel, refundExpired, claim ; et la lecture des evenements Created / Joined / Settled / Refunded / Cancelled
 * d un recu et du retour de duels(id). Pur : aucun reseau, aucune cle. Le wallet de l utilisateur signe -- y compris quand c est le
 * brain d un block qui PROPOSE le duel : le brain propose, le wallet signe.
 * Plus ce que l ecran doit dire AVANT la signature : mise / expiration / guess hors bornes, jeton non admis, son propre duel, duel pas
 * ouvert ou expire, fenetre (trop tot / reglable / remboursable), et le partage exact 90 / 7 / 3 (poussiere au dev).
 * Selecteurs, topics, ordre du getter et bornes verifies contre l ABI et la source COMPILEES dans test-duels-plan.
 * La face et le score sont ceux de blockrolls-plan.js (le MEME module : l identite des blocks ne se copie pas, elle se reutilise).
 * ⛔ PAS DEPLOYE. ⛔ C est un jeu d argent entre deux wallets (decision et responsabilite de conformite : Phil, 2026-10-18). */
import { selecteur, topic } from './keccak.js';
import { refusGuess, traitsDepuisHash, scoreTraits, TRAITS, TAILLES, DELAI_CIBLE, FENETRE } from './blockrolls-plan.js';
export { refusGuess, traitsDepuisHash, scoreTraits, TRAITS, TAILLES, DELAI_CIBLE, FENETRE };

export const SIG_CREATE = 'create(address,uint256,uint8[5],uint64)';
export const SIG_JOIN = 'join(uint256,uint8[5])';
export const SIG_SETTLE = 'settle(uint256)';
export const SIG_CANCEL = 'cancel(uint256)';
export const SIG_REFUND = 'refundExpired(uint256)';
export const SIG_CLAIM = 'claim(address,address)';
/* lectures */
export const SIG_TOKEN_OK = 'tokenOk(address)';
export const SIG_DUELS = 'duels(uint256)';
export const SIG_NEXT_ID = 'nextId()';
export const SIG_OWED = 'owed(address,address)';
export const SIG_SETTLEABLE_UNTIL = 'settleableUntil(uint256)';
export const SIG_SPLIT_OF = 'splitOf(uint256)';
const SIG_APPROVE = 'approve(address,uint256)';
export const EV_CREATED = 'Created(uint256,address,address,uint256,uint8[5],uint64)';
export const EV_JOINED = 'Joined(uint256,address,uint8[5],uint256)';
export const EV_SETTLED = 'Settled(uint256,bytes32,uint8,uint8,address,uint256)';
export const EV_REFUNDED = 'Refunded(uint256,uint256,uint256)';
export const EV_CANCELLED = 'Cancelled(uint256)';
export const EV_OWED = 'Owed(address,address,uint256)';

/* les constantes du contrat (test-duels-plan les relit dans la source compilee) */
export const MIN_STAKE = 100000n;
export const MAX_STAKE = (1n << 96n) - 1n;
export const MIN_EXPIRY = 600;
export const MAX_EXPIRY = 7 * 86400;
export const BPS = 10000n;
export const WINNER_BPS = 9000n;
export const POOL_BPS = 700n;
/* l ordre du struct Duel = l ordre des 9 mots que rend duels(id) */
export const CHAMPS_DUEL = Object.freeze([['creator', 'address'], ['expiresAt', 'uint64'], ['status', 'uint8'], ['guessA', 'uint24'], ['joiner', 'address'], ['targetBlock', 'uint40'], ['guessB', 'uint24'], ['token', 'address'], ['stake', 'uint96']]);
export const STATUTS = Object.freeze(['None', 'Open', 'Joined', 'Settled', 'Cancelled', 'Refunded']);
const OPEN = 1, JOINED = 2;

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const u = (n) => { const v = BigInt(n); if (v < 0n || v >= (1n << 256n)) throw new Error('uint256 out of range: ' + n); return v.toString(16).padStart(64, '0'); };
const a = (x) => { const s = bas(x); if (!ADR.test(s)) throw new Error('bad address ' + x); return s.slice(2).padStart(64, '0'); };
const sel = (sig) => selecteur(sig).replace(/^0x/, '');
const refuse = (pourquoi) => ({ etat: 'REFUSE', pourquoi, appels: [] });
const motsGuess = (g) => g.map((x) => u(x)).join('');
const entier = (x) => { try { return BigInt(x); } catch (_) { return null; } };
const approuver = (jeton, contrat, montant, quoi) => ({ to: bas(jeton), data: '0x' + sel(SIG_APPROVE) + a(contrat) + u(montant), quoi });

/** le partage d un duel GAGNE, comme splitOf du contrat : pot = 2 x mise ; 90 % au gagnant, 7 % au pot commun, le RESTE au dev (3 % + poussiere) */
export function partage(mise) {
  const pot = 2n * BigInt(mise);
  const gagnant = (pot * WINNER_BPS) / BPS, pool = (pot * POOL_BPS) / BPS;
  return { pot, gagnant, pool, dev: pot - gagnant - pool };
}

/** les refus de la mise (BadStake), dits avant la signature ; null = valide */
function refusMise(mise) {
  const m = entier(mise);
  if (m === null) return 'the stake is a raw integer amount of the token';
  if (m < MIN_STAKE) return 'the stake is at least ' + MIN_STAKE + ' raw units of the token';
  if (m > MAX_STAKE) return 'the stake is at most 2^96 - 1 raw units';
  return null;
}

/** ou en est un duel REJOINT : TROP_TOT (bloc <= cible), REGLABLE (cible < bloc <= cible + 256), REMBOURSABLE (au-dela : refundExpired) */
export function etatReglement(targetBlock, blocActuel) {
  const t = BigInt(targetBlock), b = BigInt(blocActuel);
  if (b <= t) return { etat: 'TROP_TOT', blocsAvant: Number(t - b + 1n) };
  if (b <= t + BigInt(FENETRE)) return { etat: 'REGLABLE', blocsRestants: Number(t + BigInt(FENETRE) - b) };
  return { etat: 'REMBOURSABLE', blocsRestants: 0 };
}

/** l etat d un duel lu (lireDuel) pour l ecran : OUVERT / EXPIRE (ouvert, plus rejoignable : cancel ou refundExpired) / TROP_TOT / REGLABLE /
 *  REMBOURSABLE / REGLE / ANNULE / REMBOURSE / INCONNU */
export function etatDuel(duel, { maintenant = Math.floor(Date.now() / 1000), blocActuel = 0 } = {}) {
  const s = Number(duel && duel.status);
  if (s === OPEN) return Number(maintenant) < Number(duel.expiresAt) ? 'OUVERT' : 'EXPIRE';
  if (s === JOINED) return etatReglement(duel.targetBlock, blocActuel).etat;
  return { 3: 'REGLE', 4: 'ANNULE', 5: 'REMBOURSE' }[s] || 'INCONNU';
}

/** les scores d un duel sur un hash de bloc, par les modules de l app : { face, scoreA, scoreB, gagnant: 'A' | 'B' | 'EGALITE' } ; null si hash illisible */
export function scoresDuel(hash, guessA, guessB) {
  const face = traitsDepuisHash(hash);
  if (!face) return null;
  const scoreA = scoreTraits(guessA, face), scoreB = scoreTraits(guessB, face);
  return { face, scoreA, scoreB, gagnant: scoreA === scoreB ? 'EGALITE' : scoreA > scoreB ? 'A' : 'B' };
}

/**
 * creer : [approve(jeton, contrat, mise EXACTE), create(jeton, mise, guess, expireDans)]. `admis` = tokenOk(jeton) LU sur le contrat, s il est
 * connu (false -> refus). Jamais d approbation infinie.
 */
export function planCreer({ contrat, jeton, mise, guess, expireDans, admis = null }) {
  const r = refusGuess(guess);
  if (r.length) return refuse(r.join('; '));
  const rm = refusMise(mise);
  if (rm) return refuse(rm);
  const e = Number(expireDans);
  if (!Number.isInteger(e) || e < MIN_EXPIRY || e > MAX_EXPIRY) return refuse('the duel stays open between 10 minutes and 7 days');
  if (admis === false) return refuse('this token is not admitted for duels');
  try {
    const m = BigInt(mise);
    return { etat: 'PRET', mise: m.toString(), partage: partage(m), appels: [
      approuver(jeton, contrat, m, 'approve exactly the stake (' + m + ' raw units)'),
      { to: bas(contrat), data: '0x' + sel(SIG_CREATE) + a(jeton) + u(m) + motsGuess(guess) + u(e), quoi: 'open a duel: your guess of the face of a Base block' },
    ] };
  } catch (err) { return refuse(String(err.message || err)); }
}

/**
 * rejoindre : [approve(jeton DU DUEL, contrat, mise DU DUEL EXACTE), join(id, guess)]. `duel` = lireDuel(duels(id)) LU sur la chaine : sans
 * lui, refus (la mise et le jeton ne se devinent pas). Refuse son propre duel, un duel pas ouvert, expire, ou un jeton retire (admis false).
 */
export function planRejoindre({ contrat, id, guess, wallet = null, duel = null, admis = null, maintenant = Math.floor(Date.now() / 1000) }) {
  const r = refusGuess(guess);
  if (r.length) return refuse(r.join('; '));
  if (!duel) return refuse('read the duel on chain first (token and stake)');
  if (Number(duel.status) !== OPEN) return refuse('this duel is not open');
  if (Number(maintenant) >= Number(duel.expiresAt)) return refuse('this duel has expired');
  if (wallet && bas(wallet) === bas(duel.creator)) return refuse('you cannot join your own duel');
  if (admis === false) return refuse('this token is no longer admitted: the duel can only be cancelled or refunded');
  const rm = refusMise(duel.stake);
  if (rm) return refuse(rm);
  try {
    const m = BigInt(duel.stake);
    return { etat: 'PRET', mise: m.toString(), partage: partage(m), appels: [
      approuver(duel.token, contrat, m, 'approve exactly the same stake (' + m + ' raw units)'),
      { to: bas(contrat), data: '0x' + sel(SIG_JOIN) + u(id) + motsGuess(guess), quoi: 'join duel #' + id + ': the block 2 blocks from now decides' },
    ] };
  } catch (err) { return refuse(String(err.message || err)); }
}

/** settle : n importe qui ; le gain va TOUJOURS au gagnant. Refuse hors fenetre si cible et bloc sont donnes. */
export function planSettle({ contrat, id, targetBlock = null, blocActuel = null }) {
  if (targetBlock != null && blocActuel != null) {
    const e = etatReglement(targetBlock, blocActuel);
    if (e.etat === 'TROP_TOT') return refuse('too early: wait ' + e.blocsAvant + ' more block(s)');
    if (e.etat === 'REMBOURSABLE') return refuse('too late to settle (256-block window): refund both stakes instead');
  }
  try { return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_SETTLE) + u(id), quoi: 'reveal and settle duel #' + id }] }; }
  catch (err) { return refuse(String(err.message || err)); }
}

/** cancel : le createur seul, avant que quelqu un rejoigne (si `duel` et `wallet` sont donnes, verifie avant la signature) */
export function planCancel({ contrat, id, duel = null, wallet = null }) {
  if (duel && Number(duel.status) !== OPEN) return refuse('only an open duel can be cancelled');
  if (duel && wallet && bas(wallet) !== bas(duel.creator)) return refuse('only the creator can cancel');
  try { return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_CANCEL) + u(id), quoi: 'cancel duel #' + id + ' and take the stake back' }] }; }
  catch (err) { return refuse(String(err.message || err)); }
}

/** refundExpired : n importe qui. Rejoint et cible + 256 depassee -> les deux mises ; jamais rejoint et expire -> la mise du createur. */
export function planRefundExpired({ contrat, id, duel = null, maintenant = Math.floor(Date.now() / 1000), blocActuel = null }) {
  if (duel) {
    const s = Number(duel.status);
    if (s === JOINED) {
      if (blocActuel == null) return refuse('the current block is needed to know if the duel can still be settled');
      if (etatReglement(duel.targetBlock, blocActuel).etat !== 'REMBOURSABLE') return refuse('this duel can still be settled: settle it');
    } else if (s === OPEN) {
      if (Number(maintenant) < Number(duel.expiresAt)) return refuse('this duel is still open: only its creator can cancel it now');
    } else return refuse('nothing to refund');
  }
  try { return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_REFUND) + u(id), quoi: 'refund duel #' + id + ' in full' }] }; }
  catch (err) { return refuse(String(err.message || err)); }
}

/** claim : ce qu un jeton a refuse de payer au wallet (owed), envoye a `vers` */
export function planClaim({ contrat, jeton, vers }) {
  try { return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_CLAIM) + a(jeton) + a(vers), quoi: 'claim what the token refused to pay you' }] }; }
  catch (err) { return refuse(String(err.message || err)); }
}

/* ------------------------------------------------------------------ lecture d un recu et d un duel */
const motsDe = (data) => (String(data).replace(/^0x/, '').match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
const adrDe = (w) => '0x' + BigInt(w).toString(16).padStart(40, '0').slice(-40);
const trouver = (logs, contrat, ev) => { const t0 = topic(ev); return (logs || []).find((x) => bas(x.address) === bas(contrat) && bas(x.topics?.[0]) === t0); };
const tous = (logs, contrat, ev, lire) => { const t0 = topic(ev); return (logs || []).filter((x) => bas(x.address) === bas(contrat) && bas(x.topics?.[0]) === t0).map((l) => lire([l], contrat)).filter(Boolean); };
/* comme _unpack du contrat */
export const deballer = (p) => { const v = Number(p); return [(v >> 16) & 0x0f, (v >> 12) & 0x0f, (v >> 7) & 0x1f, (v >> 3) & 0x0f, v & 0x07]; };

/** Created : { id, creator, token, stake, guess, expiresAt } ; null si absent */
export function lireCreated(logs, contrat) {
  const l = trouver(logs, contrat, EV_CREATED);
  if (!l || !l.topics[2]) return null;
  const m = motsDe(l.data);
  if (m.length !== 8) return null;
  return { id: BigInt(l.topics[1]), creator: '0x' + bas(l.topics[2]).slice(-40), token: adrDe(m[0]), stake: m[1], guess: m.slice(2, 7).map(Number), expiresAt: Number(m[7]) };
}

/** Joined : { id, joiner, guess, targetBlock } ; null si absent */
export function lireJoined(logs, contrat) {
  const l = trouver(logs, contrat, EV_JOINED);
  if (!l || !l.topics[2]) return null;
  const m = motsDe(l.data);
  if (m.length !== 6) return null;
  return { id: BigInt(l.topics[1]), joiner: '0x' + bas(l.topics[2]).slice(-40), guess: m.slice(0, 5).map(Number), targetBlock: m[5] };
}

/** Settled : { id, blockHash, scoreA, scoreB, winner (null si egalite), payout, egalite } ; null si absent */
export function lireSettled(logs, contrat) {
  const l = trouver(logs, contrat, EV_SETTLED);
  if (!l) return null;
  const m = motsDe(l.data);
  if (m.length !== 5) return null;
  const w = adrDe(m[3]);
  const egalite = /^0x0{40}$/.test(w);
  return { id: BigInt(l.topics[1]), blockHash: '0x' + m[0].toString(16).padStart(64, '0'), scoreA: Number(m[1]), scoreB: Number(m[2]), winner: egalite ? null : w, payout: m[4], egalite };
}

/** Refunded : { id, toCreator, toJoiner } (egalite, 256 blocs depasses, ou jamais rejoint) ; null si absent */
export function lireRefunded(logs, contrat) {
  const l = trouver(logs, contrat, EV_REFUNDED);
  if (!l) return null;
  const m = motsDe(l.data);
  if (m.length !== 2) return null;
  return { id: BigInt(l.topics[1]), toCreator: m[0], toJoiner: m[1] };
}

export function lireCancelled(logs, contrat) {
  const l = trouver(logs, contrat, EV_CANCELLED);
  return l ? { id: BigInt(l.topics[1]) } : null;
}

export const lireCreatedTous = (logs, contrat) => tous(logs, contrat, EV_CREATED, lireCreated);
export const lireSettledTous = (logs, contrat) => tous(logs, contrat, EV_SETTLED, lireSettled);

/** le retour de duels(id) (9 mots, l ordre de CHAMPS_DUEL) ; null si illisible */
export function lireDuel(retour) {
  const m = motsDe(retour);
  if (m.length !== CHAMPS_DUEL.length) return null;
  return {
    creator: adrDe(m[0]), expiresAt: Number(m[1]), status: Number(m[2]), statut: STATUTS[Number(m[2])] || 'Unknown', guessA: deballer(m[3]),
    joiner: adrDe(m[4]), targetBlock: Number(m[5]), guessB: deballer(m[6]), token: adrDe(m[7]), stake: m[8],
  };
}
