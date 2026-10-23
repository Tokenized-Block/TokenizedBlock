/* slots-plan.js — les appels NON SIGNES de BlockSlots (contracts/src/BlockSlots.sol) et ce que l ecran doit savoir AVANT la signature.
 * Idee de Phil (2026-10-23) : « une machine a sous a 3 faces random, independantes, tirees au moment de la tx ; on compare ; des points
 * quand des faces sont les memes ; un bon reward de la pool, comme un casino ». Pur : aucun reseau, aucune cle. Le wallet signe.
 *   - le spin : approve EXACT du prix + spin() ; en lot : UN approve EXACT de N x prix + N spin() (N <= 10) ;
 *   - settle / settleMany / expire / fund ;
 *   - les TROIS faces d un spin, calculees comme le contrat : graine_r = keccak256(abi.encode(hash, spinId, r)), face_r = traitsDepuisHash
 *     (graine_r) (la face d un hash de l app, celle de BlockRolls) ; les points (brelan 3, paire 1, par trait) ;
 *   - la distribution EXACTE des points et l esperance d une table (meme calcul que la constante du contrat ; test-slots-ev compare).
 * ⛔ PAS DEPLOYE. ⛔ C est un jeu d argent PAYANT : la decision de le lancer, et sa conformite, sont celles du proprietaire. */
import { selecteur, topic, keccak256Hex } from './keccak.js';
import { traitsDepuisHash, etatReglement, TRAITS, TAILLES } from './blockrolls-plan.js';
import { bandeTeinte, BANDES } from './face-du-jour.js';

export { etatReglement, TRAITS, TAILLES };
export const SIG_SPIN = 'spin()';
export const SIG_SETTLE = 'settle(uint256)';
export const SIG_SETTLE_MANY = 'settleMany(uint256[])';
export const SIG_EXPIRE = 'expire(uint256)';
export const SIG_FUND = 'fund(uint256)';
export const SIG_POT = 'pot()';
export const SIG_POINTS_OF = 'pointsOf(address)';
export const SIG_WON_OF = 'wonOf(address)';
export const SIG_PRIZES = 'prizes()';
export const SIG_SPINS = 'spins(uint256)';
export const SIG_SETTLEABLE_UNTIL = 'settleableUntil(uint256)';
const SIG_APPROVE = 'approve(address,uint256)';
export const EV_SPUN = 'Spun(uint256,address,uint256,uint256,uint256)';
export const EV_SETTLED = 'Settled(uint256,address,bytes32,uint8[5][3],uint8,uint256,uint256,uint256)';
export const EV_EXPIRED = 'Expired(uint256,address)';
export const DELAI_CIBLE = 2;
export const FENETRE = 256;
export const REELS = 3;
export const MAX_POINTS = 15;
export const SPINS_MAX = 10;
/* ⛔ DENIM : 256 blocs = 512 s a 2 s/bloc (~8,5 min), 51,2 s a 200 ms/bloc. Les secondes viennent des BLOCS, jamais l inverse. */
export const secondesFenetre = (msParBloc) => (FENETRE * Number(msParBloc)) / 1000;

const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const u = (n) => { const v = BigInt(n); if (v < 0n || v >= (1n << 256n)) throw new Error('uint256 out of range: ' + n); return v.toString(16).padStart(64, '0'); };
const a = (x) => { const s = bas(x); if (!ADR.test(s)) throw new Error('bad address ' + x); return s.slice(2).padStart(64, '0'); };
const sel = (sig) => selecteur(sig).replace(/^0x/, '');
const refuse = (pourquoi) => ({ etat: 'REFUSE', pourquoi, appels: [] });
const hexOctets = (h) => Uint8Array.from(String(h).match(/../g).map((x) => parseInt(x, 16)));

/* ------------------------------------------------------------------ les faces et les points */

/** la graine de la face `reel` : keccak256(abi.encode(bytes32 hash, uint256 spinId, uint256 reel)) — seedOf du contrat */
export function graine(hash, spinId, reel) {
  const h = bas(hash);
  if (!/^0x[0-9a-f]{64}$/.test(h)) return null;
  return keccak256Hex(hexOctets(h.slice(2) + u(spinId) + u(reel)));
}

/** les trois faces d un spin, dans l ordre du contrat (facesOf) : [[colorBand, orbit, facet, material, ornament] x 3] ; null si le hash est illisible */
export function facesDuSpin(hash, spinId) {
  const g = [0, 1, 2].map((r) => graine(hash, spinId, r));
  if (g.some((x) => !x)) return null;
  const f = g.map((x) => traitsDepuisHash(x));
  return f.some((x) => !x || x.some((v) => v < 0)) ? null : f;
}

/** par trait : 'three' (les 3 faces egales, 3 points), 'pair' (2 egales, 1 point) ou null — pointsFor du contrat, trait par trait */
export function accordsParTrait(faces) {
  return TRAITS.map((_, i) => {
    const [x, y, z] = [faces[0][i], faces[1][i], faces[2][i]];
    if (x === y && y === z) return 'three';
    if (x === y || y === z || x === z) return 'pair';
    return null;
  });
}
export const points = (faces) => accordsParTrait(faces).reduce((s, k) => s + (k === 'three' ? 3 : k === 'pair' ? 1 : 0), 0);

/* ------------------------------------------------------------------ la distribution exacte */

/**
 * P(points = k) x 2^144, EXACTE, k = 0..15 — sous l hypothese dite que les octets d un keccak sont uniformes et independants.
 * Chaque trait est lu dans des octets DIFFERENTS (apparence.js) : la teinte dans 2 octets (65 536 valeurs, % 361, puis la bande de
 * face-du-jour.js bandeTeinte), orbite / facette / matiere / ornement dans 1 octet chacun (% la taille de leur liste). Les comptes par
 * valeur sont faits ICI avec les fonctions et les listes de l app : une liste qui change change la distribution, et le test compare au
 * contrat. Par trait, sur 3 faces : brelan = somme c^3, paire = somme 3 c^2 (D - c). Les traits sont convolues.
 */
export function distributionExacte() {
  const bandes = new Array(BANDES.length).fill(0n);
  for (let x = 0; x < 65536; x++) bandes[BANDES.indexOf(bandeTeinte(x % 361))] += 1n;
  const parOctet = (m) => { const c = new Array(m).fill(0n); for (let b = 0; b < 256; b++) c[b % m] += 1n; return c; };
  const traits = [[bandes, 65536n], ...TAILLES.slice(1).map((m) => [parOctet(m), 256n])];
  let num = [1n], den = 1n;
  for (const [c, D] of traits) {
    const D3 = D ** 3n;
    let brelan = 0n, paire = 0n;
    for (const k of c) { brelan += k ** 3n; paire += 3n * k * k * (D - k); }
    const rien = D3 - brelan - paire;
    const suite = new Array(num.length + 3).fill(0n);
    num.forEach((v, i) => { suite[i] += v * rien; suite[i + 1] += v * paire; suite[i + 3] += v * brelan; });
    num = suite; den *= D3;
  }
  const d = num.slice(0, MAX_POINTS + 1);
  while (d.length < MAX_POINTS + 1) d.push(0n);
  return { num: d, den };
}

/** l esperance d une table (16 prix bruts, 0..15 points) AVANT le plafond du pot : { num, den, brut (arrondi bas), probGainBps, parSpin } */
export function esperance(table) {
  if (!Array.isArray(table) || table.length !== MAX_POINTS + 1) throw new Error('the table has 16 prizes (0..15 points)');
  const { num, den } = distributionExacte();
  const t = table.map((x) => BigInt(x));
  const e = num.reduce((s, v, k) => s + v * t[k], 0n);
  const pGain = num.reduce((s, v, k) => s + (t[k] > 0n ? v : 0n), 0n);
  return { num: e, den, brut: e / den, probGainBps: Number((pGain * 10000n) / den) };
}

/** la regle du constructeur : esperance * 10000 < prix * part du pot * 2^144 (STRICT) ; table croissante ; chaque prix <= 1000 USDC */
export function refusTable({ table, spinPrice, potShareBps }) {
  const r = [];
  let t;
  try { t = table.map((x) => BigInt(x)); } catch (_) { return ['prizes are raw USDC integers']; }
  if (t.length !== MAX_POINTS + 1) return ['the table has 16 prizes (0..15 points)'];
  if (t.some((x) => x < 0n || x > 1000000000n)) r.push('each prize is 0..1000 USDC');
  for (let k = 1; k <= MAX_POINTS; k++) if (t[k] < t[k - 1]) { r.push('a higher score never pays less (points ' + k + ')'); break; }
  const p = BigInt(spinPrice), s = BigInt(potShareBps);
  if (p <= 0n || p > 1000000000n) r.push('the spin price is 0..1000 USDC, not 0');
  if (s <= 0n || s > 10000n) r.push('the pot share is 1..10000 bps');
  if (!r.length) { const e = esperance(t); if (e.num * 10000n >= p * s * e.den) r.push('the expected payout must stay strictly under the share that enters the pot'); }
  return r;
}

/* ------------------------------------------------------------------ les appels */

const approuver = (usdc, contrat, montant, quoi) => ({ to: bas(usdc), data: '0x' + sel(SIG_APPROVE) + a(contrat) + u(montant), quoi });

/** N spins : UN approve EXACT de N x prix (jamais infini, jamais d un seul quand N > 1) + N spin(), pour UN wallet_sendCalls */
export function planSpins({ contrat, usdc, n = 1, spinPrice }) {
  const k = Number(n);
  if (!Number.isInteger(k) || k < 1) return refuse('at least one spin');
  if (k > SPINS_MAX) return refuse('at most ' + SPINS_MAX + ' spins in one batch');
  try {
    if (BigInt(spinPrice) <= 0n) return refuse('the spin price must be > 0');
    const total = BigInt(spinPrice) * BigInt(k);
    const appels = [approuver(usdc, contrat, total, 'approve exactly ' + k + ' spin(s) (' + total + ' raw USDC)')];
    for (let i = 0; i < k; i++) appels.push({ to: bas(contrat), data: '0x' + sel(SIG_SPIN), quoi: 'spin ' + (i + 1) + '/' + k + ': three faces from the block 2 blocks from now' });
    return { etat: 'PRET', n: k, prix: total.toString(), prixUnitaire: BigInt(spinPrice).toString(), appels };
  } catch (e) { return refuse(String(e.message || e)); }
}
export const planSpin = (o) => planSpins({ ...o, n: 1 });

/** settle : n importe qui ; le gain va TOUJOURS au joueur. Refuse hors fenetre si cible et bloc sont donnes. */
export function planSettle({ contrat, spinId, targetBlock = null, blocActuel = null }) {
  if (targetBlock != null && blocActuel != null) {
    const e = etatReglement(targetBlock, blocActuel);
    if (e.etat === 'TROP_TOT') return refuse('too early: wait ' + e.blocsAvant + ' more block(s)');
    if (e.etat === 'PERDU') return refuse('too late: this spin can no longer be settled (256-block window)');
  }
  try { return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_SETTLE) + u(spinId), quoi: 'reveal and settle spin #' + spinId }] }; }
  catch (e) { return refuse(String(e.message || e)); }
}

/** settleMany : plusieurs spins, une tx, par n importe qui ; le contrat SAUTE ceux qui ne sont pas reglables */
export function planSettleMany({ contrat, spinIds }) {
  if (!Array.isArray(spinIds) || spinIds.length === 0) return refuse('at least one spin');
  try {
    const data = '0x' + sel(SIG_SETTLE_MANY) + u(32) + u(spinIds.length) + spinIds.map((x) => u(x)).join('');
    return { etat: 'PRET', appels: [{ to: bas(contrat), data, quoi: 'reveal and settle ' + spinIds.length + ' spin(s)' }] };
  } catch (e) { return refuse(String(e.message || e)); }
}

export function planExpire({ contrat, spinId }) {
  return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_EXPIRE) + u(spinId), quoi: 'mark spin #' + spinId + ' as lost' }] };
}

/** fund : [approve EXACT, fund(amount)] — sans retour possible */
export function planFund({ contrat, usdc, montant }) {
  try { if (BigInt(montant) <= 0n) return refuse('the amount must be > 0'); } catch (_) { return refuse('the amount is a raw USDC integer'); }
  return { etat: 'PRET', appels: [
    approuver(usdc, contrat, montant, 'approve exactly ' + montant + ' raw USDC'),
    { to: bas(contrat), data: '0x' + sel(SIG_FUND) + u(montant), quoi: 'add to the slots pot (no way back)' },
  ] };
}

/** les appels de lecture (eth_call) */
export const appelPointsDe = (adresse) => '0x' + sel(SIG_POINTS_OF) + a(adresse);
export const appelGagneDe = (adresse) => '0x' + sel(SIG_WON_OF) + a(adresse);
export const appelPot = () => '0x' + sel(SIG_POT);
export const appelPrizes = () => '0x' + sel(SIG_PRIZES);
export const appelSpin = (id) => '0x' + sel(SIG_SPINS) + u(id);
/** spins(id) -> { player, targetBlock, status } (status 0 None, 1 Pending, 2 Settled, 3 Expired) ; null si illisible */
export function lireSpin(hex) {
  const m = motsDe(hex);
  if (m.length !== 3) return null;
  return { player: '0x' + m[0].toString(16).padStart(40, '0').slice(-40), targetBlock: Number(m[1]), status: Number(m[2]) };
}
/** prizes() -> 16 BigInt ; null si illisible */
export function lirePrizes(hex) { const m = motsDe(hex); return m.length === MAX_POINTS + 1 ? m : null; }
export function lireUint(hex) { const m = motsDe(hex); return m.length === 1 ? m[0] : null; }

/* ------------------------------------------------------------------ les spins en attente d un wallet */
export const TOPIC_SPUN = topic(EV_SPUN);
/** le filtre eth_getLogs des Spun d UN joueur sur une fenetre BORNEE [de, jusqua] (un spin plus vieux que 256 blocs ne se regle plus) */
export function filtreSpunDe({ contrat, joueur, de, jusqua }) {
  const d = Math.max(0, Math.floor(Number(de))), j = Math.floor(Number(jusqua));
  if (!Number.isSafeInteger(d) || !Number.isSafeInteger(j) || j < d) throw new Error('bad block window');
  return { address: bas(contrat), topics: [TOPIC_SPUN, null, '0x' + a(joueur)], fromBlock: '0x' + d.toString(16), toBlock: '0x' + j.toString(16) };
}
/** la premiere hauteur utile : tete - (256 + 2 + marge) — au-dela, un spin n est plus reglable ; jamais avant le bloc du deploiement */
export const debutFenetreSpins = (tete, blocDeploiement = 0, marge = 40) => Math.max(Number(blocDeploiement) || 0, Number(tete) - FENETRE - DELAI_CIBLE - marge);
/**
 * Les spins EN ATTENTE (status 1 relu sur la chaine) classes : TROP_TOT (blocsAvant), REGLABLE (blocsRestants), PERDU ; un statut NON lu
 * donne NON_LU (jamais « regle » ni « perdu » par defaut). `statuts` : Map spinId (string) -> status lu, ou null si la lecture a echoue.
 */
export function etatSpins({ spuns, statuts, tete }) {
  return (spuns || []).map((s) => {
    const id = String(s.spinId), st = statuts.get(id);
    if (st === null || st === undefined) return { id, t: s.targetBlock, etat: 'NON_LU' };
    if (st !== 1) return null;
    return { id, t: s.targetBlock, ...etatReglement(s.targetBlock, tete) };
  }).filter(Boolean);
}

/* ------------------------------------------------------------------ lecture d un recu */
const motsDe = (data) => (String(data || '').replace(/^0x/, '').match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
const deContrat = (logs, contrat, sig) => { const t0 = topic(sig); return (logs || []).filter((x) => bas(x.address) === bas(contrat) && bas(x.topics?.[0]) === t0); };

/** tous les Spun d un recu : [{ spinId, player, targetBlock, toPot, toDev }] */
export function lireSpunTous(logs, contrat) {
  return deContrat(logs, contrat, EV_SPUN).map((l) => {
    const m = motsDe(l.data);
    if (m.length !== 3 || !l.topics[2]) return null;
    return { spinId: BigInt(l.topics[1]), player: '0x' + bas(l.topics[2]).slice(-40), targetBlock: Number(m[0]), toPot: m[1], toDev: m[2] };
  }).filter(Boolean);
}

/** tous les Settled d un recu : [{ spinId, player, blockHash, faces, points, payout, potAfter, playerPoints }] */
export function lireSettledTous(logs, contrat) {
  return deContrat(logs, contrat, EV_SETTLED).map((l) => {
    const m = motsDe(l.data);
    if (m.length !== 20 || !l.topics[2]) return null;
    const f = m.slice(1, 16).map(Number);
    return { spinId: BigInt(l.topics[1]), player: '0x' + bas(l.topics[2]).slice(-40), blockHash: '0x' + m[0].toString(16).padStart(64, '0'),
      faces: [f.slice(0, 5), f.slice(5, 10), f.slice(10, 15)], points: Number(m[16]), payout: m[17], potAfter: m[18], playerPoints: m[19] };
  }).filter(Boolean);
}
