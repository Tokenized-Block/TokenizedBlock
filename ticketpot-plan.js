/* ticketpot-plan.js — les appels NON SIGNES de TicketPot (contracts/src/TicketPot.sol), les pots USDC du tirage du jour partages PRO RATA
 * entre les holders du ticket du jour : fund (approve EXACT + fund), close (FIGE le pot du jour), claim (l attestation du verifier portee
 * au contrat, une par wallet et par jour), rollover ; le DIGEST EIP-712 que le contrat recalcule (claimDigest) ; la PART d un holder
 * (partDuJour = floor(potAtClose / nTickets), ce que le serveur signe) ; les decodeurs Funded / Closed / Claimed / RolledOver ; les jours.
 * PUR : aucun reseau, aucune cle. Le wallet de l utilisateur signe les transactions ; la cle du verifier (serveur, ticketpot-attestation.js)
 * signe seulement les attestations. Selecteurs et topics verifies contre l ABI COMPILEE par test-ticketpot-plan ; le digest JS ==
 * claimDigest() du contrat (pin des deux cotes).
 * ⛔ PAS DEPLOYE. ⛔ Le serveur ne bouge jamais de fonds : il signe (day, wallet, ticket, amount, deadline), n importe qui envoie claim(). */
import { selecteur, topic, keccak256 } from './keccak.js';

export const SIG_FUND = 'fund(uint32,uint256)';
export const SIG_CLOSE = 'close(uint32)';
export const SIG_CLAIM = 'claim(uint32,address,bytes20,uint256,uint64,bytes)';
export const SIG_ROLLOVER = 'rollover(uint32)';
export const SIG_ABSORB = 'absorb()';
export const SIG_DAY_POT = 'dayPot(uint32)';
export const SIG_POT_AT_CLOSE = 'potAtClose(uint32)';
export const SIG_CLOSED = 'closed(uint32)';
export const SIG_PAID = 'paid(uint32)';
export const SIG_TICKET_OF = 'ticketOf(uint32,address)';
export const SIG_CLAIMED = 'claimed(uint32,address)';
export const SIG_VERIFIER = 'verifier()';
export const SIG_PAUSED = 'paused()';
export const SIG_TOTAL_POTS = 'totalPots()';
export const SIG_CLAIM_DIGEST = 'claimDigest(uint32,address,bytes20,uint256,uint64)';
export const SIG_DOMAIN = 'domainSeparator()';
export const SIG_CLAIMABLE_UNTIL = 'claimableUntil(uint32)';
const SIG_APPROVE = 'approve(address,uint256)';
export const EV_FUNDED = 'Funded(uint32,address,uint256,uint256)';
export const EV_CLOSED = 'Closed(uint32,uint256,address)';
export const EV_CLAIMED = 'Claimed(uint32,address,bytes20,uint256,uint256,address)';
export const EV_ROLLED_OVER = 'RolledOver(uint32,uint32,uint256,uint256)';

/* les constantes du contrat (relues sur le contrat deploye par les bancs : ce sont des constantes, pas des promesses de ce module) */
export const DAY_S = 86400;
export const GRACE_S = 7 * 86400;
export const FUNDING_DELAY_S = 12 * 3600;
export const NOM_DOMAINE = 'TicketPot';
export const VERSION_DOMAINE = '1';
export const TYPES_CLAIM = Object.freeze({
  Claim: [{ name: 'day', type: 'uint32' }, { name: 'wallet', type: 'address' }, { name: 'ticket', type: 'bytes20' }, { name: 'amount', type: 'uint256' }, { name: 'deadline', type: 'uint64' }],
});

const ADR = /^0x[0-9a-f]{40}$/;
const TICKET = /^0x[0-9a-f]{40}$/; /* 20 octets, comme une adresse : app.html adresseTicket */
const bas = (x) => String(x || '').toLowerCase();
const u = (n, bits = 256) => { const v = BigInt(n); if (v < 0n || v >= (1n << BigInt(bits))) throw new Error('uint' + bits + ' out of range: ' + n); return v.toString(16).padStart(64, '0'); };
const a = (x) => { const s = bas(x); if (!ADR.test(s)) throw new Error('bad address ' + x); return s.slice(2).padStart(64, '0'); };
/* bytes20 en ABI : aligne a GAUCHE, complete de zeros a droite (le contraire d une adresse) */
const b20 = (x) => { const s = bas(x); if (!TICKET.test(s)) throw new Error('bad ticket ' + x); return s.slice(2).padEnd(64, '0'); };
const sel = (sig) => selecteur(sig).replace(/^0x/, '');
const refuse = (pourquoi) => ({ etat: 'REFUSE', pourquoi, appels: [] });
const enHex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const hexVersOctets = (h) => { const s = String(h).replace(/^0x/, ''); const o = new Uint8Array(s.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16); return o; };
const k256 = (x) => '0x' + enHex(keccak256(typeof x === 'string' ? new TextEncoder().encode(x) : x));
const jourOk = (d) => Number.isInteger(d) && d >= 0 && d < 2 ** 32;

/* ------------------------------------------------------------------ les jours */
/** le jour du contrat (uint32) d un horodatage en SECONDES : floor(ts / 86400), comme today() */
export const jourDe = (ts) => Math.floor(Number(ts) / DAY_S);
/** la fin d un jour (s), la derniere seconde ou claim(day) passe (= deadline maximale), l instant ou un tiers peut fermer */
export const dayEnd = (day) => (Number(day) + 1) * DAY_S;
export const claimableUntil = (day) => dayEnd(day) + GRACE_S;
export const closableByAnyoneAt = (day) => dayEnd(day) + FUNDING_DELAY_S;
/** 2026-10-23 (revue adverse) : le pot de la SEMAINE vit sur son DERNIER jour UTC ; il se ferme (owner, ou n importe qui 12 h apres) et
 *  ses parts se reclament pendant toute la grace (claimableUntil, 7 jours) — pas seulement le lendemain. Rend le jour du contrat du dernier
 *  jour de semaine DEJA TERMINE a `maintenant` (s) et encore dans sa grace (maintenant <= claimableUntil) ; null sinon.
 *  `finDeSemaine(ms)` = la fin (ms, exclue) de la semaine qui contient ms (tirage-saison.js saisonDe(ms).fin) — passee, jamais supposee. */
export function jourSemaineReclamable(maintenant, finDeSemaine) {
  const t = Number(maintenant);
  if (!Number.isFinite(t) || typeof finDeSemaine !== 'function') return null;
  /* la semaine en cours puis la precedente : le dernier jour de la semaine en cours n est jamais termine, celui d avant l est */
  for (const ms of [t * 1000, t * 1000 - 7 * DAY_S * 1000]) {
    const fin = Number(finDeSemaine(ms));
    if (!Number.isFinite(fin)) return null;
    const d = Math.floor((fin - 1) / (DAY_S * 1000));
    if (t >= dayEnd(d) && t <= claimableUntil(d)) return d;
  }
  return null;
}
/** l id de jour de l app ('J2026-10-18', tirage-saison.js jourDe(ms).id) <-> le jour du contrat */
export function dayDeJourId(id) {
  const m = /^J(\d{4})-(\d{2})-(\d{2})$/.exec(String(id || ''));
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(ms)) return null;
  const d = Math.floor(ms / (DAY_S * 1000));
  return jourIdDeDay(d) === id ? d : null; /* '2026-13-45' roule en une autre date : refuse */
}
export const jourIdDeDay = (day) => 'J' + new Date(Number(day) * DAY_S * 1000).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ la part : ce que le serveur signe pour CHAQUE holder */
/** floor(potAtClose / nTickets) en USDC brut ; 0n si pas de ticket ou pot vide (le contrat refuse amount 0 : rien a signer). La poussiere
 *  (potAtClose - n x part) reste dans le pot du jour et roule au jour courant apres la grace. */
export function partDuJour(potAtClose, nTickets) {
  const p = BigInt(potAtClose), n = BigInt(nTickets);
  if (p <= 0n || n <= 0n) return 0n;
  return p / n;
}

/* ------------------------------------------------------------------ EIP-712 : ce que le verifier signe et que claim() recalcule */
export function donneesClaim({ chainId, contrat, day, wallet, ticket, amount, deadline }) {
  return {
    domain: { name: NOM_DOMAINE, version: VERSION_DOMAINE, chainId: Number(chainId), verifyingContract: bas(contrat) },
    types: TYPES_CLAIM, primaryType: 'Claim',
    message: { day: Number(day), wallet: bas(wallet), ticket: bas(ticket), amount: String(amount), deadline: String(deadline) },
  };
}
export function domaineSeparateur(chainId, contrat) {
  const typeDomaine = k256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
  return k256(hexVersOctets(typeDomaine.slice(2) + k256(NOM_DOMAINE).slice(2) + k256(VERSION_DOMAINE).slice(2) + u(chainId) + a(contrat)));
}
/** le digest = claimDigest(day, wallet, ticket, amount, deadline) du contrat : keccak("\x19\x01" || domaine || structHash) */
export function digestClaim(d) {
  const m = d.message;
  const typeClaim = k256('Claim(uint32 day,address wallet,bytes20 ticket,uint256 amount,uint64 deadline)');
  const st = k256(hexVersOctets(typeClaim.slice(2) + u(m.day, 32) + a(m.wallet) + b20(m.ticket) + u(m.amount) + u(m.deadline, 64)));
  return k256(hexVersOctets('1901' + domaineSeparateur(d.domain.chainId, d.domain.verifyingContract).slice(2) + st.slice(2)));
}

/* ------------------------------------------------------------------ les appels */
const approuver = (usdc, contrat, montant, quoi) => ({ to: bas(usdc), data: '0x' + sel(SIG_APPROVE) + a(contrat) + u(montant), quoi });

/** fund : [approve(contrat, montant EXACT), fund(day, montant)] -- aujourd hui ou un jour passe NON ferme (`ferme` lu sur le contrat, si connu). */
export function planFund({ contrat, usdc, day, montant, ferme = false, maintenant = Math.floor(Date.now() / 1000) }) {
  let m;
  try { m = BigInt(montant); } catch (_) { return refuse('the amount is a raw USDC integer'); }
  if (m <= 0n) return refuse('the amount must be > 0');
  const d = Number(day);
  if (!jourOk(d)) return refuse('day is a UTC day number (timestamp / 86400)');
  if (d > jourDe(maintenant)) return refuse('that day has not started yet (UTC): a future day cannot be funded');
  if (ferme) return refuse('day ' + jourIdDeDay(d) + ' is closed: its shares are final. Fund today (' + jourIdDeDay(jourDe(maintenant)) + ') instead');
  try {
    return { etat: 'PRET', appels: [
      approuver(usdc, contrat, m, 'approve exactly ' + m + ' raw USDC'),
      { to: bas(contrat), data: '0x' + sel(SIG_FUND) + u(d, 32) + u(m), quoi: 'add ' + m + ' raw USDC to the pot of day ' + jourIdDeDay(d) + ', no way back' },
    ] };
  } catch (e) { return refuse(String(e.message || e)); }
}

/** close : FIGE le pot du jour (plus de fund, les claims s ouvrent). L owner des la fin du jour ; un tiers FUNDING_DELAY (12 h) apres. */
export function planClose({ contrat, day, owner = false, ferme = false, maintenant = Math.floor(Date.now() / 1000) }) {
  const d = Number(day);
  if (!jourOk(d)) return refuse('day is a UTC day number');
  if (ferme) return refuse('day ' + jourIdDeDay(d) + ' is already closed');
  if (maintenant < dayEnd(d)) return refuse('day ' + jourIdDeDay(d) + ' is not over yet (UTC)');
  if (!owner && maintenant < closableByAnyoneAt(d)) return refuse('only the owner closes before ' + new Date(closableByAnyoneAt(d) * 1000).toISOString() + ' (12 h for the fee wallet to fund the day)');
  return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_CLOSE) + u(d, 32), quoi: 'freeze the pot of day ' + jourIdDeDay(d) + ': shares become final, claims open' }] };
}

/** claim : UN appel, par n importe qui, avec l attestation du serveur ; le holder est paye, jamais l appelant. Les refus du contrat
 *  qui se voient d ici sont dits AVANT la signature du wallet : jour pas ferme (si `ferme` est lu), echeance passee ou au-dela de la grace,
 *  signature mal formee, deja paye (si `dejaPaye` est lu). */
export function planClaim({ contrat, day, wallet, ticket, amount, deadline, signature, ferme = null, dejaPaye = false, maintenant = Math.floor(Date.now() / 1000) }) {
  const d = Number(day), dl = Number(deadline);
  if (!jourOk(d)) return refuse('day is a UTC day number');
  if (!ADR.test(bas(wallet)) || /^0x0{40}$/.test(bas(wallet))) return refuse('the holder is a wallet address');
  if (!TICKET.test(bas(ticket)) || /^0x0{40}$/.test(bas(ticket))) return refuse('the ticket is the 20-byte ticket id of (wallet, day)');
  let m;
  try { m = BigInt(amount); } catch (_) { return refuse('the amount is a raw USDC integer'); }
  if (m <= 0n) return refuse('the amount must be > 0');
  if (!Number.isInteger(dl) || dl < 0) return refuse('the deadline is a unix time (s)');
  if (!/^0x[0-9a-f]{130}$/i.test(String(signature || ''))) return refuse('the attestation is a 65-byte signature');
  if (maintenant < dayEnd(d)) return refuse('day ' + jourIdDeDay(d) + ' is not over yet (UTC): no share before its close');
  if (ferme === false) return refuse('day ' + jourIdDeDay(d) + ' is not closed yet: its shares are not final');
  if (dejaPaye) return refuse('this wallet already received its share of day ' + jourIdDeDay(d));
  if (maintenant > dl) return refuse('this attestation expired: ask the server for a fresh one');
  if (dl > claimableUntil(d)) return refuse('the attestation outlives the 7-day grace: the contract would refuse it');
  try {
    const s = String(signature).slice(2).toLowerCase();
    /* 5 mots statiques + l offset du bytes (0xc0 = 6 x 32), puis longueur 65 et la signature sur 3 mots */
    const data = '0x' + sel(SIG_CLAIM) + u(d, 32) + a(wallet) + b20(ticket) + u(m) + u(dl, 64) + u(0xc0) + u(65) + s.padEnd(192, '0');
    return { etat: 'PRET', appels: [{ to: bas(contrat), data, quoi: 'pay the share of day ' + jourIdDeDay(d) + ' (' + m + ' raw USDC) to the ticket holder ' + bas(wallet) }] };
  } catch (e) { return refuse(String(e.message || e)); }
}

/** rollover : GRACE apres la fin du jour, ce qui RESTE du pot du jour (poussiere, parts jamais reclamees) roule au jour COURANT ; n importe qui. */
export function planRollover({ contrat, day, maintenant = Math.floor(Date.now() / 1000) }) {
  const d = Number(day);
  if (!jourOk(d)) return refuse('day is a UTC day number');
  if (maintenant <= claimableUntil(d)) return refuse('the grace of day ' + jourIdDeDay(d) + ' runs until ' + new Date(claimableUntil(d) * 1000).toISOString() + ': nothing rolls before');
  return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_ROLLOVER) + u(d, 32), quoi: 'roll what is left of day ' + jourIdDeDay(d) + ' into today\'s pot' }] };
}

/** absorb : un transfert direct au contrat rejoint le pot du JOUR COURANT ; n importe qui, jamais vers une personne */
export function planAbsorb({ contrat }) {
  return { etat: 'PRET', appels: [{ to: bas(contrat), data: '0x' + sel(SIG_ABSORB), quoi: 'put stray USDC into today\'s pot' }] };
}

/* ------------------------------------------------------------------ lecture d un recu */
const motsDe = (data) => (String(data).replace(/^0x/, '').match(/.{64}/g) || []).map((w) => BigInt('0x' + w));
const logsDe = (logs, contrat, ev) => { const t0 = topic(ev); return (logs || []).filter((x) => bas(x.address) === bas(contrat) && bas(x.topics?.[0]) === t0); };

/** Funded du recu : { day, from, amount, potAfter } ; from = 0x0 pour absorb() ; null si absent */
export function lireFunded(logs, contrat) {
  const l = logsDe(logs, contrat, EV_FUNDED)[0];
  if (!l || !l.topics[2]) return null;
  const m = motsDe(l.data);
  if (m.length !== 2) return null;
  return { day: Number(BigInt(l.topics[1])), from: '0x' + bas(l.topics[2]).slice(-40), amount: m[0], potAfter: m[1] };
}

/** Closed du recu : { day, pot, by } ; null si absent */
export function lireClosed(logs, contrat) {
  const l = logsDe(logs, contrat, EV_CLOSED)[0];
  if (!l || !l.topics[1]) return null;
  const m = (String(l.data).replace(/^0x/, '').match(/.{64}/g) || []);
  if (m.length !== 2) return null;
  return { day: Number(BigInt(l.topics[1])), pot: BigInt('0x' + m[0]), by: '0x' + m[1].slice(-40).toLowerCase() };
}

/** Claimed du recu : { day, wallet, ticket, amount, potLeft, by } ; null si absent */
export function lireClaimed(logs, contrat) {
  const l = logsDe(logs, contrat, EV_CLAIMED)[0];
  if (!l || !l.topics[2]) return null;
  const m = (String(l.data).replace(/^0x/, '').match(/.{64}/g) || []);
  if (m.length !== 4) return null;
  return { day: Number(BigInt(l.topics[1])), wallet: '0x' + bas(l.topics[2]).slice(-40), ticket: '0x' + m[0].slice(0, 40).toLowerCase(), amount: BigInt('0x' + m[1]), potLeft: BigInt('0x' + m[2]), by: '0x' + m[3].slice(-40).toLowerCase() };
}

/** TOUS les Claimed d un recu (un lot de claims en emet un par holder) */
export function lireClaimedTous(logs, contrat) {
  return logsDe(logs, contrat, EV_CLAIMED).map((l) => lireClaimed([l], contrat)).filter(Boolean);
}

/** RolledOver du recu : { fromDay, toDay, amount, potAfter } ; null si absent */
export function lireRolledOver(logs, contrat) {
  const l = logsDe(logs, contrat, EV_ROLLED_OVER)[0];
  if (!l || !l.topics[2]) return null;
  const m = motsDe(l.data);
  if (m.length !== 2) return null;
  return { fromDay: Number(BigInt(l.topics[1])), toDay: Number(BigInt(l.topics[2])), amount: m[0], potAfter: m[1] };
}
