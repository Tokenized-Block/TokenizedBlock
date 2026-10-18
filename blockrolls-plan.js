/* blockrolls-plan.js — les appels NON SIGNES de BlockRolls (contracts/src/BlockRolls.sol) : roll paye (approve EXACT + roll), pass
 * (approve EXACT + buyPass), roll sur pass, settle, expire, fund. Pur : aucun reseau, aucune cle. Le wallet de l utilisateur signe.
 * Plus ce que l ecran doit dire AVANT la signature : guess hors bornes refuse, fenetre de settle (trop tot / reglable / perdu), gain prevu,
 * et le decodage des evenements Rolled / Settled d un recu. Selecteurs verifies contre l ABI COMPILEE dans test-blockrolls-plan.
 * ⛔ PAS DEPLOYE. ⛔ C est un tirage PAYANT (decision et responsabilite de conformite : Phil, 2026-10-17). */
import { selecteur, topic } from './keccak.js';
import { faceRevelee, bandeTeinte, BANDES } from './face-du-jour.js';
import { ORBITES, FACETTES, MATIERES, ORNEMENTS } from './apparence.js';
import { HOOK_7030 } from './tokenomics.js';
/* 2026-10-18 : poolId de pool.js (deja servi, importe par app.html) et non poolIdDe de volume-tirage.js, qui tire revenu-externe.js (serveur)
 *   dans le navigateur — test-imports-servis l a attrape (serie 433 : « la page serait MORTE en prod »). Meme keccak de la meme cle inline ;
 *   test-blockrolls-plan recalcule l id avec poolIdDe et exige l egalite. */
import { poolId as poolIdDe } from './pool.js';
import { FEE_POOL, TICK_SPACING_POOL } from './lancer-pool.js';

export const SIG_ROLL = 'roll(uint8[5])';
export const SIG_ROLL_PASS = 'rollWithPass(uint8[5])';
export const SIG_BUY_PASS = 'buyPass()';
export const SIG_SETTLE = 'settle(uint256)';
export const SIG_EXPIRE = 'expire(uint256)';
export const SIG_FUND = 'fund(uint256)';
export const SIG_SETTLE_MANY = 'settleMany(uint256[])';
export const SIG_SET_RULES = 'setRules(uint64,uint64,uint64,uint8)';
export const SIG_CLOSE_DAY = 'closeDay(uint32)';
export const SIG_DRAW_DAY = 'drawDay(uint32)';
const SIG_APPROVE = 'approve(address,uint256)';
export const EV_ROLLED = 'Rolled(uint256,address,uint8[5],uint256,bool,uint256,uint256)';
export const EV_SETTLED = 'Settled(uint256,address,bytes32,uint8[5],uint8,uint256,uint256)';
export const EV_PASS_BOUGHT = 'PassBought(address,uint32,uint32,uint64,uint256,uint256)';
export const EV_RULES_SET = 'RulesSet(uint16,uint64,uint64,uint64,uint8,address)';
export const EV_DAY_CLOSED = 'DayClosed(uint32,uint256,uint256,uint256,address)';
export const EV_DAY_DRAWN = 'DayDrawn(uint32,address,bytes32,uint256,uint256)';
/* le jour UTC d un horodatage, comme today() du contrat */
export const jourDe = (ts) => Math.floor(Number(ts) / 86400);

/* les defauts du constructeur (a relire sur le contrat deploye : ce sont des immuables, pas des promesses de ce module).
 * HOOK = le hook 7030 (tokenomics.js, jamais tape) ; UNIT_POOL_ID = poolIdDe(ETH/UNIT, fee 0, tick 200, hook) -- recalcule par
 * test-blockrolls-plan, PAS une valeur de confiance. Le createur de UNIT (celui qui fixe les paliers) est LU au hook, jamais ecrit ici. */
export const HOOK = HOOK_7030.toLowerCase();
export const UNIT = '0xb2000000000000000000007afa7ed748b0874f27';
export const UNIT_POOL_ID = poolIdDe({ currency0: '0x0000000000000000000000000000000000000000', currency1: UNIT, fee: FEE_POOL, tickSpacing: TICK_SPACING_POOL, hooks: HOOK });
export const MAX_PRIZE = 1000000000n;
/* ⛔ DENIM : 256 blocs = ~8,5 min aujourd hui (2 s/bloc), ~51 s apres Denim (200 ms/bloc, Base mainnet vise novembre 2026) : le
 *    gardien regle (settleMany) sans attendre ; etatReglement() rend blocsRestants, le contrat expose settleableUntil(id). */
export const SIG_SETTLEABLE_UNTIL = 'settleableUntil(uint256)';
export const SIG_DRAWABLE_UNTIL = 'drawableUntil(uint32)';
/* economie du 20:30 : un gain = un PRIX FIXE (5 USDC) plafonne par le pot, a partir de 3 traits sur 5 */
export const DEFAUTS = Object.freeze({ rollPrice: 500000n, passPrice: 10000000n, passRolls: 30, passWindowS: 86400, potShareBps: 5000, prize5: 5000000n, prize4: 5000000n, prize3: 5000000n, minScore: 3 });
/* l ordre du guess = l ordre du contrat ; les tailles = celles de l app (une option ajoutee au menu sans le contrat : test-blockrolls-parite rougit) */
export const TRAITS = Object.freeze(['colorBand', 'orbit', 'facet', 'material', 'ornament']);
export const TAILLES = Object.freeze([BANDES.length, ORBITES.length, FACETTES.length, MATIERES.length, ORNEMENTS.length]);
export const DELAI_CIBLE = 2;
export const FENETRE = 256;

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const u = (n) => { const v = BigInt(n); if (v < 0n || v >= (1n << 256n)) throw new Error('uint256 out of range: ' + n); return v.toString(16).padStart(64, '0'); };
const a = (x) => { const s = bas(x); if (!ADR.test(s)) throw new Error('bad address ' + x); return s.slice(2).padStart(64, '0'); };
const sel = (sig) => selecteur(sig).replace(/^0x/, '');
const refuse = (pourquoi) => ({ etat: 'REFUSE', pourquoi, appels: [] });

/** les refus de _record (BadGuess) dits AVANT la signature ; [] = valide */
export function refusGuess(guess) {
  if (!Array.isArray(guess) || guess.length !== 5) return ['the guess is 5 traits'];
  const r = [];
  guess.forEach((g, i) => { if (!Number.isInteger(g) || g < 0 || g >= TAILLES[i]) r.push(TRAITS[i] + ' must be 0..' + (TAILLES[i] - 1)); });
  return r;
}
const motsGuess = (g) => g.map((x) => u(x)).join('');

/** la face d un hash de bloc, dans l ordre du contrat (faceOf) : [colorBand, orbit, facet, material, ornament] — par les modules de l app */
export function traitsDepuisHash(hash) {
  const f = faceRevelee(hash);
  if (!f) return null;
  return [BANDES.indexOf(bandeTeinte(f.teinte)), ORBITES.indexOf(f.orbite), FACETTES.indexOf(f.facette), MATIERES.indexOf(f.matiere), ORNEMENTS.indexOf(f.ornement)];
}
export const scoreTraits = (guess, face) => guess.reduce((s, g, i) => s + (g === face[i] ? 1 : 0), 0);

/** le gain SI le settle avait lieu avec ce pot : min(prix du score, pot), 0 sous minScore (un autre gagnant regle avant peut reduire le pot) */
export function gainPrevu(pot, score, cfg = DEFAUTS) {
  if (score < Number(cfg.minScore)) return 0n;
  const prix = BigInt(score === 5 ? cfg.prize5 : score === 4 ? cfg.prize4 : cfg.prize3);
  const p = BigInt(pot);
  return prix < p ? prix : p;
}

/** ou en est un roll : TROP_TOT (bloc <= cible), REGLABLE (cible < bloc <= cible + 256), PERDU (au-dela : expire() seulement) */
export function etatReglement(targetBlock, blocActuel) {
  const t = BigInt(targetBlock), b = BigInt(blocActuel);
  if (b <= t) return { etat: 'TROP_TOT', blocsAvant: Number(t - b + 1n) };
  if (b <= t + BigInt(FENETRE)) return { etat: 'REGLABLE', blocsRestants: Number(t + BigInt(FENETRE) - b) };
  return { etat: 'PERDU', blocsRestants: 0 };
}

const approuver = (usdc, contrat, montant, quoi) => ({ to: bas(usdc), data: '0x' + sel(SIG_APPROVE) + a(contrat) + u(montant), quoi });

/** roll paye : [approve(contrat, rollPrice EXACT), roll(guess)]. Jamais d approbation infinie. */
export function planRoll({ contrat, usdc, guess, rollPrice = DEFAUTS.rollPrice }) {
  const r = refusGuess(guess);
  if (r.length) return refuse(r.join('; '));
  try {
    return { etat: 'PRET', prix: BigInt(rollPrice).toString(), appels: [
      approuver(usdc, contrat, rollPrice, 'approve exactly one roll (' + rollPrice + ' raw USDC)'),
      { to: bas(contrat), data: '0x' + sel(SIG_ROLL) + motsGuess(guess), quoi: 'roll: guess the face of the block 2 blocks from now' },
    ] };
  } catch (e) { return refuse(String(e.message || e)); }
}

/** pass : [approve(contrat, passPrice EXACT), buyPass()]. `pass` = { rollsLeft, expiresAt } lu sur le contrat, s il est connu. */
export function planPass({ contrat, usdc, passPrice = DEFAUTS.passPrice, pass = null, maintenant = Math.floor(Date.now() / 1000) }) {
  if (pass && Number(pass.rollsLeft) > 0 && maintenant < Number(pass.expiresAt)) return refuse('your pass is still active with ' + pass.rollsLeft + ' rolls left');
  try {
    return { etat: 'PRET', prix: BigInt(passPrice).toString(), appels: [
      approuver(usdc, contrat, passPrice, 'approve exactly one pass (' + passPrice + ' raw USDC)'),
      { to: bas(contrat), data: '0x' + sel(SIG_BUY_PASS), quoi: 'buy a pass' },
    ] };
  } catch (e) { return refuse(String(e.message || e)); }
}

/** roll sur pass : un seul appel, aucun paiement */
export function planRollAvecPass({ contrat, guess, pass = null, maintenant = Math.floor(Date.now() / 1000) }) {
  const r = refusGuess(guess);
  if (r.length) return refuse(r.join('; '));
  if (pass && (Number(pass.rollsLeft) === 0 || maintenant >= Number(pass.expiresAt))) return refuse('no active pass roll left');
  try { return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_ROLL_PASS) + motsGuess(guess), quoi: 'roll with your pass' }] }; }
  catch (e) { return refuse(String(e.message || e)); }
}

/**
 * Le « brain auto-roll » : jusqu a PASS_ROLLS rolls de pass pour UN wallet_sendCalls (une signature, N rolls, tous sur bloc+2 si le
 * lot tient dans un bloc -- ce que le wallet batch fait). Refuse tout le lot si un guess est hors bornes, s il depasse les rolls restants
 * du pass (quand `pass` est donne) ou PASS_ROLLS : un lot a moitie execute laisserait le joueur avec des rolls qu il n a pas choisis.
 */
export function planRollsAvecPass({ contrat, guesses, pass = null, passRolls = DEFAUTS.passRolls, maintenant = Math.floor(Date.now() / 1000) }) {
  if (!Array.isArray(guesses) || guesses.length === 0) return refuse('at least one guess');
  if (guesses.length > passRolls) return refuse('a pass holds ' + passRolls + ' rolls at most');
  if (pass && (Number(pass.rollsLeft) === 0 || maintenant >= Number(pass.expiresAt))) return refuse('no active pass roll left');
  if (pass && guesses.length > Number(pass.rollsLeft)) return refuse('only ' + pass.rollsLeft + ' pass roll(s) left');
  const appels = [];
  for (let i = 0; i < guesses.length; i++) {
    const r = refusGuess(guesses[i]);
    if (r.length) return refuse('guess #' + (i + 1) + ': ' + r.join('; '));
    appels.push({ to: bas(contrat), data: '0x' + sel(SIG_ROLL_PASS) + motsGuess(guesses[i]), quoi: 'pass roll ' + (i + 1) + '/' + guesses.length });
  }
  return { etat: 'PRET', appels };
}

/** settleMany : plusieurs rolls en une tx, par n importe qui ; le contrat SAUTE ceux qui ne sont pas reglables (jamais de revert du lot) */
export function planSettleMany({ contrat, rollIds }) {
  if (!Array.isArray(rollIds) || rollIds.length === 0) return refuse('at least one roll');
  try {
    const data = '0x' + sel(SIG_SETTLE_MANY) + u(32) + u(rollIds.length) + rollIds.map((x) => u(x)).join('');
    return { etat: 'PRET', appels: [{ to: bas(contrat), data, quoi: 'reveal and settle ' + rollIds.length + ' roll(s)' }] };
  } catch (e) { return refuse(String(e.message || e)); }
}

/** setRules : SEUL le createur de UNIT (lu au hook) ; chaque prix <= 1000 USDC, minScore 3..5 ; ne touche que les rolls crees apres */
export function planSetRules({ contrat, prize5, prize4, prize3, minScore }) {
  let p5, p4, p3;
  try { [p5, p4, p3] = [prize5, prize4, prize3].map((x) => BigInt(x)); } catch (_) { return refuse('prizes are raw USDC integers'); }
  if ([p5, p4, p3].some((x) => x < 0n || x > MAX_PRIZE)) return refuse('each prize is 0..1000 USDC');
  const ms = Number(minScore);
  if (!Number.isInteger(ms) || ms < 3 || ms > 5) return refuse('the minimum winning score is 3, 4 or 5');
  return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_SET_RULES) + u(p5) + u(p4) + u(p3) + u(ms), quoi: 'set the prizes to ' + p5 + ' / ' + p4 + ' / ' + p3 + ' raw USDC, min score ' + ms + ' (new rolls only)' }] };
}

/** closeDay : une fois le jour UTC fini (jour < aujourd hui), n importe qui arme le tirage (cible = bloc + 2) */
export function planCloseDay({ contrat, day, maintenant = Math.floor(Date.now() / 1000) }) {
  const d = Number(day);
  if (!Number.isInteger(d) || d < 0) return refuse('day is a UTC day number');
  if (jourDe(maintenant) <= d) return refuse('the day is not over yet (UTC)');
  return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_CLOSE_DAY) + u(d), quoi: 'arm the draw of day ' + d }] };
}

/** drawDay : n importe qui, dans la fenetre de 256 blocs apres la cible ; TOUT le pot du jour va a buyers[hash % n] */
export function planDrawDay({ contrat, day, targetBlock = null, blocActuel = null }) {
  if (targetBlock != null && blocActuel != null) {
    const e = etatReglement(targetBlock, blocActuel);
    if (e.etat === 'TROP_TOT') return refuse('too early: wait ' + e.blocsAvant + ' more block(s)');
    if (e.etat === 'PERDU') return refuse('too late: close the day again to re-arm the draw');
  }
  return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_DRAW_DAY) + u(day), quoi: 'draw the day pot of day ' + day }] };
}

/** settle : n importe qui peut l envoyer, le gain va TOUJOURS au joueur. Refuse hors fenetre si cible et bloc sont donnes. */
export function planSettle({ contrat, rollId, targetBlock = null, blocActuel = null }) {
  if (targetBlock != null && blocActuel != null) {
    const e = etatReglement(targetBlock, blocActuel);
    if (e.etat === 'TROP_TOT') return refuse('too early: wait ' + e.blocsAvant + ' more block(s)');
    if (e.etat === 'PERDU') return refuse('too late: this roll can no longer be settled (256-block window)');
  }
  try { return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_SETTLE) + u(rollId), quoi: 'reveal and settle roll #' + rollId }] }; }
  catch (e) { return refuse(String(e.message || e)); }
}

export function planExpire({ contrat, rollId }) {
  return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_EXPIRE) + u(rollId), quoi: 'mark roll #' + rollId + ' as lost' }] };
}

/** fund : [approve EXACT, fund(amount)] — sans retour possible : rien ne sort du pot sauf un settle gagnant */
export function planFund({ contrat, usdc, montant }) {
  if (BigInt(montant) <= 0n) return refuse('the amount must be > 0');
  return { etat: 'PRET', appels: [
    approuver(usdc, contrat, montant, 'approve exactly ' + montant + ' raw USDC'),
    { to: bas(contrat), data: '0x' + sel(SIG_FUND) + u(montant), quoi: 'add to the pot (no way back)' },
  ] };
}

/* ------------------------------------------------------------------ lecture d un recu */
const motsDe = (data) => (String(data).replace(/^0x/, '').match(/.{64}/g) || []).map((w) => BigInt('0x' + w));

/** Rolled du recu : { rollId, player, guess, targetBlock, withPass, toPot, toDev } ; null si absent */
export function lireRolled(logs, contrat) {
  const t0 = topic(EV_ROLLED);
  const l = (logs || []).find((x) => bas(x.address) === bas(contrat) && bas(x.topics?.[0]) === t0);
  if (!l) return null;
  const m = motsDe(l.data);
  if (m.length !== 9) return null;
  return { rollId: BigInt(l.topics[1]), player: '0x' + bas(l.topics[2]).slice(-40), guess: m.slice(0, 5).map(Number), targetBlock: m[5], withPass: m[6] === 1n, toPot: m[7], toDev: m[8] };
}

/** PassBought du recu : { player, day, rollsLeft, expiresAt, paid, dayPotAfter } -- le serveur lit (player, day) pour le ticket du jour ; null si absent */
export function lirePassBought(logs, contrat) {
  const t0 = topic(EV_PASS_BOUGHT);
  const l = (logs || []).find((x) => bas(x.address) === bas(contrat) && bas(x.topics?.[0]) === t0);
  if (!l || !l.topics[2]) return null;
  const m = motsDe(l.data);
  if (m.length !== 4) return null;
  return { player: '0x' + bas(l.topics[1]).slice(-40), day: Number(BigInt(l.topics[2])), rollsLeft: Number(m[0]), expiresAt: Number(m[1]), paid: m[2], dayPotAfter: m[3] };
}

/** DayDrawn du recu : { day, winner, blockHash, amount, buyers } ; null si absent */
export function lireDayDrawn(logs, contrat) {
  const t0 = topic(EV_DAY_DRAWN);
  const l = (logs || []).find((x) => bas(x.address) === bas(contrat) && bas(x.topics?.[0]) === t0);
  if (!l || !l.topics[2]) return null;
  const m = motsDe(l.data);
  if (m.length !== 3) return null;
  return { day: Number(BigInt(l.topics[1])), winner: '0x' + bas(l.topics[2]).slice(-40), blockHash: '0x' + m[0].toString(16).padStart(64, '0'), amount: m[1], buyers: Number(m[2]) };
}

/** TOUS les Rolled d un recu (un lot rollWithPass x N en emet un par roll) : l app en tire les rollIds a regler (planSettleMany) */
export function lireRolledTous(logs, contrat) {
  const t0 = topic(EV_ROLLED);
  return (logs || []).filter((x) => bas(x.address) === bas(contrat) && bas(x.topics?.[0]) === t0).map((l) => lireRolled([l], contrat)).filter(Boolean);
}

/** TOUS les Settled d un recu (settleMany en emet un par roll regle) */
export function lireSettledTous(logs, contrat) {
  const t0 = topic(EV_SETTLED);
  return (logs || []).filter((x) => bas(x.address) === bas(contrat) && bas(x.topics?.[0]) === t0).map((l) => lireSettled([l], contrat)).filter(Boolean);
}

/** Settled du recu : { rollId, player, blockHash, face, score, payout, potAfter } ; null si absent */
export function lireSettled(logs, contrat) {
  const t0 = topic(EV_SETTLED);
  const l = (logs || []).find((x) => bas(x.address) === bas(contrat) && bas(x.topics?.[0]) === t0);
  if (!l) return null;
  const m = motsDe(l.data);
  if (m.length !== 9) return null;
  return { rollId: BigInt(l.topics[1]), player: '0x' + bas(l.topics[2]).slice(-40), blockHash: '0x' + m[0].toString(16).padStart(64, '0'), face: m.slice(1, 6).map(Number), score: Number(m[6]), payout: m[7], potAfter: m[8] };
}
