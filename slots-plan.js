/* slots-plan.js — les appels NON SIGNES de BlockSlots (contracts/src/BlockSlots.sol) et ce que l ecran doit savoir AVANT la signature.
 * Idee de Phil (2026-10-23) : « une machine a sous a 3 faces random, independantes, tirees au moment de la tx ; on compare ; des points
 * quand des faces sont les memes ; un bon reward de la pool, comme un casino ». Pur : aucun reseau, aucune cle. Le wallet signe.
 *   - le spin : approve EXACT du prix + spin() ; en lot : UN approve EXACT de N x prix + N spin() (N <= 10) ;
 *   - settle / settleMany / acceptCapped / expire (le remboursement) / payDev / fund ;
 *   - v3 (2e verdict adverse 2026-10-23) : planReglement / phraseAvant / bilanReglement / phraseApres — ce qu un Settle paie et ce qui
 *     manque, SPIN PAR SPIN, avant la signature et apres le recu (le calcul du contrat : le pot baisse spin apres spin, un spin que le
 *     pot ne couvre pas est SAUTE) ; partsDuSpin (la part du pot, le remboursement) ; la meilleure strategie dans esperance() ;
 *   - les TROIS faces d un spin, calculees comme le contrat : graine_r = keccak256(abi.encode(hash_r, spinId, r)) ou hash_r est le hash du
 *     bloc cible + r (Phil 2026-10-23 : trois blocs differents, une face chacun), face_r = traitsDepuisHash(graine_r) (la face d un hash
 *     de l app, celle de BlockRolls) ; les points (brelan 3, paire 1, par trait) ; reglable de cible + 3 a cible + 256 ;
 *   - la distribution EXACTE des points et l esperance d une table (meme calcul que la constante du contrat ; test-slots-ev compare).
 * ⛔ PAS DEPLOYE. ⛔ C est un jeu d argent PAYANT : la decision de le lancer, et sa conformite, sont celles du proprietaire. */
import { selecteur, topic, keccak256Hex } from './keccak.js';
import { traitsDepuisHash, TRAITS, TAILLES } from './blockrolls-plan.js';
import { bandeTeinte, BANDES } from './face-du-jour.js';

export { TRAITS, TAILLES };
export const SIG_SPIN = 'spin()';
export const SIG_SETTLE = 'settle(uint256)';
export const SIG_SETTLE_MANY = 'settleMany(uint256[])';
/* v3 (verdict adverse 2026-10-23, defaut 1) : le SEUL chemin d un gain plafonne par le pot, signe par le joueur, avec le minimum vu */
export const SIG_ACCEPT_CAPPED = 'acceptCapped(uint256,uint256)';
export const SIG_EXPIRE = 'expire(uint256)';
export const SIG_PAY_DEV = 'payDev()';
export const SIG_FUND = 'fund(uint256)';
export const SIG_POT = 'pot()';
export const SIG_POINTS_OF = 'pointsOf(address)';
export const SIG_WON_OF = 'wonOf(address)';
export const SIG_PRIZES = 'prizes()';
export const SIG_SPINS = 'spins(uint256)';
export const SIG_SETTLEABLE_UNTIL = 'settleableUntil(uint256)';
const SIG_APPROVE = 'approve(address,uint256)';
export const EV_SPUN = 'Spun(uint256,address,uint256,uint256,uint256)';
export const EV_SETTLED = 'Settled(uint256,address,bytes32[3],uint8[5][3],uint8,uint256,uint256,uint256)';
export const EV_EXPIRED = 'Expired(uint256,address,uint256)';
export const EV_DEV_PAID = 'DevPaid(uint256)';
export const DELAI_CIBLE = 2;
export const FENETRE = 256;
export const REELS = 3;
export const MAX_POINTS = 15;
export const SPINS_MAX = 10;
/* (Phil 2026-10-23) le gain d UN spin : 0..5 USDC brut au plus (MAX_PRIZE du contrat) ; le prix d un spin reste borne a 1000 USDC */
export const PRIX_MAX = 5000000n;
export const PRIX_SPIN_MAX = 1000000000n;

/** les blocs des trois faces : cible, cible + 1, cible + 2 */
export const blocsDesFaces = (t) => [0, 1, 2].map((r) => Number(t) + r);
/**
 * la fenetre de reglement du contrat : TROP_TOT tant que tete <= cible + 2 (le 3e hash n est lisible que depuis le bloc suivant),
 * REGLABLE de cible + 3 a cible + 256 (la fenetre du PREMIER hash), puis PERDU.
 */
export function etatReglement(targetBlock, blocActuel) {
  const t = BigInt(targetBlock), b = BigInt(blocActuel), dernier = t + BigInt(REELS - 1);
  if (b <= dernier) return { etat: 'TROP_TOT', blocsAvant: Number(dernier - b + 1n) };
  if (b <= t + BigInt(FENETRE)) return { etat: 'REGLABLE', blocsRestants: Number(t + BigInt(FENETRE) - b) };
  return { etat: 'PERDU', blocsRestants: 0 };
}
/** ce qu un prix paie VRAIMENT si le spin est regle maintenant : min(prix, pot) ; null si le pot n est pas lu (D1) */
export function paieMaintenant(prix, pot) {
  if (pot === null || pot === undefined) return null;
  const p = BigInt(prix), q = BigInt(pot);
  return p < q ? p : q;
}
/* ⛔ DENIM : 256 blocs = 512 s a 2 s/bloc (~8,5 min), 51,2 s a 200 ms/bloc. Les secondes viennent des BLOCS, jamais l inverse. */
export const secondesFenetre = (msParBloc) => (FENETRE * Number(msParBloc)) / 1000;

/**
 * v3 (regle de Phil : fenetre manquee = remboursement) : ce qu un spin met au pot (toPot = prix x part / 10000, arrondi bas, TO_POT du
 * contrat) et ce qui est RENDU au joueur si sa fenetre passe (refund = prix - toPot, REFUND du contrat : la part du dev, tenue jusqu au settle).
 */
export function partsDuSpin(spinPrice, potShareBps) {
  const p = BigInt(spinPrice), toPot = (p * BigInt(potShareBps)) / 10000n;
  return { toPot, refund: p - toPot };
}
/** USDC brut -> texte EXACT (jusqu a 6 decimales, au moins 2) : 127862 -> « 0.127862 », 5000000 -> « 5.00 ». Aucun arrondi. */
export function usdcPrecis(brut) {
  if (brut === null || brut === undefined) return '—';
  const v = BigInt(brut), neg = v < 0n, a = neg ? -v : v;
  let f = (a % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
  if (f.length < 2) f = f.padEnd(2, '0');
  return (neg ? '-' : '') + (a / 1000000n).toString() + '.' + f;
}
/** une part p / den en points de base, ARRONDIE au plus proche (demi vers le haut) : 21,0562 % -> 2106 (le verdict : 21.05 tronquait) */
export const bpsArrondi = (p, den) => Number((BigInt(p) * 20000n + BigInt(den)) / (2n * BigInt(den)));
export const pourcentTexte = (bps) => (Number(bps) / 100).toFixed(2);

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

/**
 * les trois faces d un spin, dans l ordre du contrat (facesOf) : [[colorBand, orbit, facet, material, ornament] x 3]. `hashes` = les
 * TROIS hashes des blocs cible, cible + 1, cible + 2 (une face chacun) ; null si ce n est pas un tableau de trois hashes lisibles.
 */
export function facesDuSpin(hashes, spinId) {
  if (!Array.isArray(hashes) || hashes.length !== REELS) return null;
  const g = hashes.map((h, r) => graine(h, spinId, r));
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

/**
 * l esperance d une table (16 prix bruts, 0..15 points) AVANT le plafond du pot : { num, den, brut (arrondi bas), probGainBps,
 * probMiseBps }. probGainBps = la part des spins qui paient QUELQUE CHOSE (un prix > 0, meme sous la mise) ; probMiseBps (si spinPrice est
 * donne) = la part des spins dont le prix rend AU MOINS la mise (D2 : un spin a 0,25 sur une mise de 0,50 perd de l argent, ce n est pas
 * un « gain »). Les deux sont des chances AVANT le plafond du pot.
 */
export function esperance(table, spinPrice = null, potShareBps = null) {
  if (!Array.isArray(table) || table.length !== MAX_POINTS + 1) throw new Error('the table has 16 prizes (0..15 points)');
  const { num, den } = distributionExacte();
  const t = table.map((x) => BigInt(x));
  const e = num.reduce((s, v, k) => s + v * t[k], 0n);
  const pGain = num.reduce((s, v, k) => s + (t[k] > 0n ? v : 0n), 0n);
  /* v3 : les chances sont ARRONDIES au plus proche (verdict : 21.05 / 7.46 tronquaient 21,0562 / 7,4689) */
  const out = { num: e, den, brut: e / den, probGainBps: bpsArrondi(pGain, den) };
  if (spinPrice !== null && spinPrice !== undefined) {
    const m = BigInt(spinPrice);
    const pMise = num.reduce((s, v, k) => s + (t[k] > 0n && t[k] >= m ? v : 0n), 0n);
    out.probMiseBps = bpsArrondi(pMise, den);
    /* v3 : la MEILLEURE strategie d un joueur qui voit ses faces avant de choisir (regler si le prix depasse le remboursement, sinon
     *   laisser la fenetre passer) : somme P(k) x max(prix_k, refund) — bestPlayNumerator du contrat. Strictement sous le prix pour toute
     *   table que refusTable admet (E[max(X, r)] <= E[X] + r < toPot + r = prix). */
    if (potShareBps !== null && potShareBps !== undefined) {
      const { refund } = partsDuSpin(m, potShareBps);
      const b = num.reduce((s, v, k) => s + v * (t[k] > refund ? t[k] : refund), 0n);
      out.refund = refund; out.meilleureNum = b; out.meilleureBrut = b / den;
    }
  }
  return out;
}

/** la regle du constructeur : esperance < (prix x part du pot / 10000, ARRONDI BAS) x 2^144 (STRICT, v3) ; table croissante ; chaque prix
 *  <= 5 USDC ; spin <= 1000 USDC */
export function refusTable({ table, spinPrice, potShareBps }) {
  const r = [];
  let t;
  try { t = table.map((x) => BigInt(x)); } catch (_) { return ['prizes are raw USDC integers']; }
  if (t.length !== MAX_POINTS + 1) return ['the table has 16 prizes (0..15 points)'];
  if (t.some((x) => x < 0n || x > PRIX_MAX)) r.push('each prize is 0..5 USDC (at most 5 USDC a spin)');
  for (let k = 1; k <= MAX_POINTS; k++) if (t[k] < t[k - 1]) { r.push('a higher score never pays less (points ' + k + ')'); break; }
  const p = BigInt(spinPrice), s = BigInt(potShareBps);
  if (p <= 0n || p > PRIX_SPIN_MAX) r.push('the spin price is 0..1000 USDC, not 0');
  if (s <= 0n || s > 10000n) r.push('the pot share is 1..10000 bps');
  if (!r.length) { const e = esperance(t); if (e.num >= partsDuSpin(p, s).toPot * e.den) r.push('the expected payout must stay strictly under the share that enters the pot'); }
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
    for (let i = 0; i < k; i++) appels.push({ to: bas(contrat), data: '0x' + sel(SIG_SPIN), quoi: 'spin ' + (i + 1) + '/' + k + ': three faces from blocks 2, 3 and 4 blocks from now' });
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

/** settleMany : plusieurs spins, une tx, par n importe qui ; le contrat SAUTE ceux qui ne sont pas reglables ET ceux dont le pot ne couvre
 *  pas le prix ENTIER (v3 : jamais un gain plafonne en silence, joueur compris) */
export function planSettleMany({ contrat, spinIds }) {
  if (!Array.isArray(spinIds) || spinIds.length === 0) return refuse('at least one spin');
  try {
    const data = '0x' + sel(SIG_SETTLE_MANY) + u(32) + u(spinIds.length) + spinIds.map((x) => u(x)).join('');
    return { etat: 'PRET', appels: [{ to: bas(contrat), data, quoi: 'reveal and settle ' + spinIds.length + ' spin(s), each only if the pot pays its full prize' }] };
  } catch (e) { return refuse(String(e.message || e)); }
}

/** acceptCapped(id, minimum) : le JOUEUR accepte min(prix, pot) pour UN spin ; le contrat refuse sous `minimum` (le montant vu a l ecran) */
export function planAccepter({ contrat, spinId, minimum }) {
  try {
    const m = BigInt(minimum);
    if (m < 0n) return refuse('the minimum is a raw USDC integer');
    return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_ACCEPT_CAPPED) + u(spinId) + u(m), quoi: 'accept what the pot holds for spin #' + spinId + ' (at least ' + m + ' raw USDC)' }] };
  } catch (e) { return refuse(String(e.message || e)); }
}

/** expire(id) : la fenetre est passee ; le contrat REND la part tenue (refund) au joueur du spin, a qui que ce soit qui signe */
export function planExpire({ contrat, spinId }) {
  return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_EXPIRE) + u(spinId), quoi: 'close spin #' + spinId + ' and refund its held share to its player' }] };
}
/** plusieurs expire(id) dans UN wallet_sendCalls (<= SPINS_MAX) */
export function planExpireMany({ contrat, spinIds }) {
  if (!Array.isArray(spinIds) || spinIds.length === 0) return refuse('at least one spin');
  if (spinIds.length > SPINS_MAX) return refuse('at most ' + SPINS_MAX + ' refunds in one batch');
  try { return { etat: 'PRET', appels: spinIds.map((id) => planExpire({ contrat, spinId: BigInt(id) }).appels[0]) }; }
  catch (e) { return refuse(String(e.message || e)); }
}
/** payDev() : n importe qui ; envoie au DEV_WALLET (immuable) la part due des spins regles, et rien d autre */
export const planPayDev = ({ contrat }) => ({ etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_PAY_DEV), quoi: 'send the settled spins\' dev share to the fixed dev wallet' }] });

/* ------------------------------------------------------------------ le Settle, spin par spin (defaut 1 du verdict adverse 2026-10-23) */

/**
 * CE QUE LE BOUTON SETTLE ENVOIE, spin par spin, AVANT la signature — le meme calcul que le contrat. settleMany passe les spins dans
 * l ordre donne ; chacun est paye en ENTIER si le pot le couvre (et le pot baisse d autant), sinon il est SAUTE (v3). Le joueur voit donc,
 * pour CHAQUE spin, ce qu il touche et ce qui manque — jamais seulement le dernier spin, ni un prix compte contre le pot entier alors qu un
 * spin precedent du meme lot le vide.
 *   spins : [{ id, t, faces }] (statut 1 relu ; faces = facesDuSpin(...) ou null si les blocs n ont pas ete lus) ; pot : BigInt | null ;
 *   table : 16 prix ; tete : bloc ; refund : la part rendue si la fenetre passe (partsDuSpin).
 * Decision par spin :
 *   LOT           prix >= refund et > 0, et le pot (apres les spins du lot AVANT lui) le couvre : part dans settleMany, paye en entier ;
 *   COURT         prix >= refund et > 0, mais le pot ne le couvre pas : HORS du lot (settleMany le sauterait de toute facon) ; `paie` =
 *                 ce que le pot tient APRES le lot (un plancher : acceptCapped(id, paie) du joueur), `manque` = prix - paie ;
 *   MIEUX_REMBOURSE  prix < refund (0 compris) : le regler paie moins que le remboursement ; hors du lot ; rembourse apres `rembourseApres` ;
 *   ATTENDRE      ses trois blocs ne sont pas encore la ; REMBOURSABLE  sa fenetre est passee (expire) ;
 *   NON_LU        faces ou pot non lus : RIEN n est envoye pour lui (on ne devine pas un prix).
 * Rend { lignes, lot: [ids LOT, dans l ordre], courts: [lignes COURT], remboursables: [ids], potApres }.
 */
export function planReglement({ spins, pot, table, tete, refund = 0n }) {
  const tb = (table || []).map((x) => BigInt(x)), r = BigInt(refund);
  const lus = pot !== null && pot !== undefined;
  let reste = lus ? BigInt(pot) : null;
  const lignes = [...(spins || [])].sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0)).map((s) => {
    const id = String(s.id), base = { id, t: Number(s.t), ...etatReglement(s.t, tete), rembourseApres: Number(s.t) + FENETRE };
    if (base.etat === 'TROP_TOT') return { ...base, decision: 'ATTENDRE' };
    if (base.etat === 'PERDU') return { ...base, decision: 'REMBOURSABLE', paie: r };
    if (!Array.isArray(s.faces)) return { ...base, decision: 'NON_LU' };
    const points = Number.isInteger(s.points) ? s.points : points_(s.faces);
    const prix = tb[points];
    if (prix === undefined) return { ...base, decision: 'NON_LU' };
    const l = { ...base, points, prix };
    if (prix < r || prix === 0n) return { ...l, decision: 'MIEUX_REMBOURSE', paie: prix, manque: 0n };
    if (!lus) return { ...l, decision: 'NON_LU' };
    if (prix <= reste) { const potAvant = reste; reste -= prix; return { ...l, decision: 'LOT', paie: prix, manque: 0n, potAvant }; }
    return { ...l, decision: 'COURT' };
  });
  /* les COURT : ce que le pot tient APRES le lot (le lot passe en premier ; s il passe apres, le joueur touche au moins autant) */
  const apresLot = lignes.some((l) => l.decision === 'LOT');
  for (const l of lignes) if (l.decision === 'COURT') { l.paie = l.prix < reste ? l.prix : reste; l.manque = l.prix - l.paie; l.potApresLot = reste; l.apresLot = apresLot; }
  return {
    lignes,
    lot: lignes.filter((l) => l.decision === 'LOT').map((l) => l.id),
    courts: lignes.filter((l) => l.decision === 'COURT'),
    remboursables: lignes.filter((l) => l.decision === 'REMBOURSABLE').map((l) => l.id),
    potApres: reste,
  };
}
const points_ = (faces) => points(faces);

/** la phrase d UNE ligne de planReglement, AVANT la signature ; `fmt` = USDC brut -> texte (usdcPrecis par defaut : exact) */
export function phraseAvant(l, refund = 0n, fmt = usdcPrecis) {
  const pts = (p) => p + ' point' + (p === 1 ? '' : 's');
  const rb = BigInt(refund) > 0n ? ', or let its window pass: after block ' + l.rembourseApres + ' its ' + fmt(refund) + ' USDC refund can be claimed' : '';
  switch (l.decision) {
    case 'LOT': return 'Spin #' + l.id + ': ' + pts(l.points) + ' → ' + fmt(l.paie) + ' USDC, paid in full by Settle.';
    case 'COURT': return 'Spin #' + l.id + ': ' + pts(l.points) + ' → prize ' + fmt(l.prix) + ' USDC, but the pot holds ' + fmt(l.potApresLot) + ' USDC'
      + ' after the spins above: ' + fmt(l.manque) + ' USDC short. Settle leaves it out. '
      + (l.paie > 0n ? (l.apresLot ? 'Once Settle has paid the spins above, you can accept ' : 'You can accept ') + fmt(l.paie) + ' USDC for it (' + fmt(l.manque) + ' short), wait for the pot to grow' : 'Wait for the pot to grow') + rb + '.';
    case 'MIEUX_REMBOURSE': return 'Spin #' + l.id + ': ' + pts(l.points) + (l.prix > 0n ? ' → ' + fmt(l.prix) + ' USDC' : ', no prize') + '. Settle leaves it out'
      + (BigInt(refund) > 0n ? ': after block ' + l.rembourseApres + ' its ' + fmt(refund) + ' USDC refund can be claimed instead.' : '.');
    case 'ATTENDRE': return 'Spin #' + l.id + ': its three blocks are in after ' + l.blocsAvant + ' more block(s).';
    case 'REMBOURSABLE': return 'Spin #' + l.id + ': its window closed; claim its ' + fmt(refund) + ' USDC refund.';
    default: return 'Spin #' + l.id + ': its blocks or the pot were not read just now; nothing is sent for it.';
  }
}

/**
 * APRES le recu d un Settle (ou d un Accept) : spin par spin, ce qui a ete paye, ce qui manque, ce qui a ete saute et pourquoi.
 *   envoyes : [lignes de planReglement envoyees] ; settled : lireSettledTous(recu) ; statuts : Map id -> statut relu apres (null = non lu) ;
 *   tete : bloc relu apres (null = non lu) ; table : 16 prix.
 * Rend [{ id, issue, points?, prix?, paie?, manque? }] : PAYE (manque = 0), PLAFONNE (manque > 0 : accepte par le joueur), SAUTE (encore en
 * attente, fenetre ouverte : le pot ne couvrait plus le prix entier a l inclusion — rien n est pris), FENETRE (encore en attente, fenetre
 * passee : remboursable), REGLE_AILLEURS (regle par une autre transaction), REMBOURSE (expire), NON_LU.
 */
export function bilanReglement({ envoyes, settled, statuts, tete, table }) {
  const tb = (table || []).map((x) => BigInt(x));
  const parId = new Map((settled || []).map((d) => [String(d.spinId), d]));
  return (envoyes || []).map((x) => {
    const id = String(x.id), d = parId.get(id);
    if (d) { const prix = tb[d.points], manque = prix > d.payout ? prix - d.payout : 0n; return { id, issue: manque > 0n ? 'PLAFONNE' : 'PAYE', points: d.points, prix, paie: d.payout, manque }; }
    const st = statuts ? statuts.get(id) : null;
    if (st === null || st === undefined) return { id, issue: 'NON_LU' };
    if (st === 2) return { id, issue: 'REGLE_AILLEURS' };
    if (st === 3) return { id, issue: 'REMBOURSE' };
    if (st === 1) return { id, issue: tete !== null && tete !== undefined && etatReglement(x.t, tete).etat === 'PERDU' ? 'FENETRE' : 'SAUTE', prix: x.prix, rembourseApres: Number(x.t) + FENETRE };
    return { id, issue: 'NON_LU' };
  });
}

/** la phrase d UNE ligne de bilanReglement */
export function phraseApres(b, refund = 0n, fmt = usdcPrecis) {
  const pts = (p) => p + ' point' + (p === 1 ? '' : 's');
  switch (b.issue) {
    case 'PAYE': return 'Spin #' + b.id + ': ' + pts(b.points) + (b.paie > 0n ? ', ' + fmt(b.paie) + ' USDC paid to your wallet by the contract, in full.' : ', no prize.');
    case 'PLAFONNE': return 'Spin #' + b.id + ': ' + pts(b.points) + ', prize ' + fmt(b.prix) + ' USDC; the pot paid ' + fmt(b.paie) + ' USDC — ' + fmt(b.manque) + ' USDC short.';
    case 'SAUTE': return 'Spin #' + b.id + ': not settled — when your settle was included the pot could not pay its full ' + (b.prix !== undefined ? fmt(b.prix) + ' USDC ' : '') + 'prize, so nothing was taken. It is still yours to settle until block ' + b.rembourseApres + '.';
    case 'FENETRE': return 'Spin #' + b.id + ': the ' + FENETRE + '-block window closed before your settle was included — not settled' + (BigInt(refund) > 0n ? '; claim its ' + fmt(refund) + ' USDC refund.' : '.');
    case 'REGLE_AILLEURS': return 'Spin #' + b.id + ': settled by another transaction; its result is in that transaction.';
    case 'REMBOURSE': return 'Spin #' + b.id + ': closed and refunded.';
    default: return 'Spin #' + b.id + ': its result was not read just now.';
  }
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
 * v3 (verdict : ~8 lectures toutes les 3 s pendant qu un spin attend) : la PROCHAINE tranche de Spun a lire. Premiere lecture (scanne null) :
 * la fenetre bornee (debutFenetreSpins) ; ensuite seulement les blocs NOUVEAUX, avec un recouvrement de `recouvre` blocs (un index de logs
 * en retard d un bloc ne fait pas perdre un spin ; les doublons sont fusionnes par id). null si rien de nouveau.
 */
export function trancheSpun({ scanne = null, tete, blocDeploiement = 0, recouvre = 8 }) {
  const t = Math.floor(Number(tete));
  if (!Number.isSafeInteger(t)) return null;
  /* v3 : la premiere lecture couvre PLAGE_LOGS blocs (et pas ~300) : un spin dont la fenetre est passee reste visible, donc remboursable */
  const plancher = Math.max(Number(blocDeploiement) || 0, t - PLAGE_LOGS + 1);
  if (scanne === null || scanne === undefined) return { de: plancher, jusqua: t };
  const s = Math.floor(Number(scanne));
  if (t <= s) return null;
  return { de: Math.max(plancher, s + 1 - recouvre), jusqua: t };
}
/* ⛔ un eth_getLogs sur Base : 1000 blocs au plus (app.html LIVE_FENETRE = 999, « NEVER raise above 999 ») */
export const PLAGE_LOGS = 999;
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

/** tous les Expired d un recu (v3) : [{ spinId, player, refund }] */
export function lireExpiredTous(logs, contrat) {
  return deContrat(logs, contrat, EV_EXPIRED).map((l) => {
    const m = motsDe(l.data);
    if (m.length !== 1 || !l.topics[2]) return null;
    return { spinId: BigInt(l.topics[1]), player: '0x' + bas(l.topics[2]).slice(-40), refund: m[0] };
  }).filter(Boolean);
}

/** tous les Settled d un recu : [{ spinId, player, blockHashes (3), faces, points, payout, potAfter, playerPoints }] — 3 + 15 + 4 = 22 mots */
export function lireSettledTous(logs, contrat) {
  return deContrat(logs, contrat, EV_SETTLED).map((l) => {
    const m = motsDe(l.data);
    if (m.length !== 22 || !l.topics[2]) return null;
    const f = m.slice(3, 18).map(Number);
    return { spinId: BigInt(l.topics[1]), player: '0x' + bas(l.topics[2]).slice(-40), blockHashes: m.slice(0, 3).map((x) => '0x' + x.toString(16).padStart(64, '0')),
      faces: [f.slice(0, 5), f.slice(5, 10), f.slice(10, 15)], points: Number(m[18]), payout: m[19], potAfter: m[20], playerPoints: m[21] };
  }).filter(Boolean);
}
