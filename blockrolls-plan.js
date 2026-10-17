/* blockrolls-plan.js — les appels NON SIGNES de BlockRolls (contracts/src/BlockRolls.sol) : roll paye (approve EXACT + roll), pass
 * (approve EXACT + buyPass), roll sur pass, settle, expire, fund. Pur : aucun reseau, aucune cle. Le wallet de l utilisateur signe.
 * Plus ce que l ecran doit dire AVANT la signature : guess hors bornes refuse, fenetre de settle (trop tot / reglable / perdu), gain prevu,
 * et le decodage des evenements Rolled / Settled d un recu. Selecteurs verifies contre l ABI COMPILEE dans test-blockrolls-plan.
 * ⛔ PAS DEPLOYE. ⛔ C est un tirage PAYANT (decision et responsabilite de conformite : Phil, 2026-10-17). */
import { selecteur, topic } from './keccak.js';
import { faceRevelee, bandeTeinte, BANDES } from './face-du-jour.js';
import { ORBITES, FACETTES, MATIERES, ORNEMENTS } from './apparence.js';

export const SIG_ROLL = 'roll(uint8[5])';
export const SIG_ROLL_PASS = 'rollWithPass(uint8[5])';
export const SIG_BUY_PASS = 'buyPass()';
export const SIG_SETTLE = 'settle(uint256)';
export const SIG_EXPIRE = 'expire(uint256)';
export const SIG_FUND = 'fund(uint256)';
const SIG_APPROVE = 'approve(address,uint256)';
export const EV_ROLLED = 'Rolled(uint256,address,uint8[5],uint256,bool,uint256,uint256)';
export const EV_SETTLED = 'Settled(uint256,address,bytes32,uint8[5],uint8,uint256,uint256)';

/* les defauts du constructeur (a relire sur le contrat deploye : ce sont des immuables, pas des promesses de ce module) */
export const DEFAUTS = Object.freeze({ rollPrice: 500000n, passPrice: 10000000n, passRolls: 30, passWindowS: 86400, potShareBps: 5000, p5Bps: 5000, p4Bps: 1000, p3Bps: 100 });
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

/** le gain SI le settle avait lieu avec ce pot (le contrat lit le pot AU settle : un autre gagnant regle avant peut le reduire) */
export function gainPrevu(pot, score, cfg = DEFAUTS) {
  const bps = score === 5 ? cfg.p5Bps : score === 4 ? cfg.p4Bps : score === 3 ? cfg.p3Bps : 0;
  return (BigInt(pot) * BigInt(bps)) / 10000n;
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

/** Settled du recu : { rollId, player, blockHash, face, score, payout, potAfter } ; null si absent */
export function lireSettled(logs, contrat) {
  const t0 = topic(EV_SETTLED);
  const l = (logs || []).find((x) => bas(x.address) === bas(contrat) && bas(x.topics?.[0]) === t0);
  if (!l) return null;
  const m = motsDe(l.data);
  if (m.length !== 9) return null;
  return { rollId: BigInt(l.topics[1]), player: '0x' + bas(l.topics[2]).slice(-40), blockHash: '0x' + m[0].toString(16).padStart(64, '0'), face: m.slice(1, 6).map(Number), score: Number(m[6]), payout: m[7], potAfter: m[8] };
}
