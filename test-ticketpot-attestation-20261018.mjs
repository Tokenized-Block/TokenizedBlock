/* test-ticketpot-attestation-20261018.mjs - LE VERIFIER SIGNE SEULEMENT LA PART D UN HOLDER D UN JOUR FERME, ET CE QU IL SIGNE SE RECUPERE EN SA CLE.
 * AFFIRME (EXECUTE, fausse chaine) : (1) un jour ferme a 10 USDC, 3 tickets -> 3 attestations de 3 333 333 (floor), poussiere 1, chaque
 *   signature se recupere en verifier() et son digest = digestClaim des memes donnees ; (2) refus : jour NON ferme (le residu « pot alimente
 *   apres les signatures » : rien n est signe avant close), contrat absent, cle qui n est pas le verifier, chaine lue != signee, pause,
 *   wallet deja paye, part > ce qui reste, montant demande > la part, jour pas fini, echeance au-dela de la grace, 0 ticket, pot vide ;
 *   (3) ticketDe = app.html adresseTicket (crypto.subtle SHA-256, 20 premiers octets) ; (4) attesterJour trie, dedoublonne, lit UNE fois.
 * Cle de TEST publique 0xA11CE (celle des tests forge). NE PROUVE PAS : une vraie chaine ni un claim on-chain de ces signatures (le banc fork
 *   banc-ticketpot-fork-20261018.mjs porte une attestation de CE module a claim() du contrat sur un fork de Base). */
import { strict as assert } from 'node:assert';
import { attesterPart, attesterJour, attesterSemaine, ticketDe, lireJour } from './ticketpot-attestation.js';
import { selecteur } from './keccak.js';
import { adresseDe, recupererAdresse } from './signeur-secp256k1.js';
import * as P from './ticketpot-plan.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const CLE = '0x' + (0xA11CEn).toString(16).padStart(64, '0');
const VERIF = adresseDe(CLE).toLowerCase();
const CONTRAT = '0x' + 'cc'.repeat(20);
const H = ['0x' + 'a1'.repeat(20), '0x' + 'b2'.repeat(20), '0x' + 'c3'.repeat(20)];
const m = (v) => BigInt(v).toString(16).padStart(64, '0'), a = (x) => x.slice(2).padStart(64, '0');
const DAY = 20744; /* J2026-10-18 */
const APRES = P.dayEnd(DAY) + 120; /* le lendemain 00:02 UTC (le bloc E) */
const sel = (s) => selecteur(s).slice(2);

function chaine({ verifier = VERIF, chaineLue = 8453, pause = false, ferme = true, potAtClose = 10_000_000n, reste = null, payes = [] } = {}) {
  const f = async (meth, p) => {
    f.appels += 1;
    if (meth === 'eth_chainId') return '0x' + chaineLue.toString(16);
    if (meth === 'eth_call') {
      const { to, data } = p[0], s = data.slice(2, 10);
      if (to !== CONTRAT) throw new Error('autre contrat');
      if (s === sel(P.SIG_VERIFIER)) return '0x' + a(verifier);
      if (s === sel(P.SIG_PAUSED)) return '0x' + m(pause ? 1 : 0);
      if (s === sel(P.SIG_CLOSED)) return '0x' + m(ferme ? 1 : 0);
      if (s === sel(P.SIG_POT_AT_CLOSE)) return '0x' + m(ferme ? potAtClose : 0);
      if (s === sel(P.SIG_DAY_POT)) return '0x' + m(reste === null ? potAtClose : reste);
      if (s === sel(P.SIG_TICKET_OF)) { const w = '0x' + data.slice(10 + 64 + 24); return '0x' + (payes.includes(w) ? 'ab'.repeat(20) + '0'.repeat(24) : '0'.repeat(64)); }
    }
    throw new Error('inattendu ' + meth + ' ' + JSON.stringify(p));
  };
  f.appels = 0;
  return f;
}
const io = (o = {}) => ({ rpc: chaine(o), chaineId: 8453, contrat: CONTRAT, cle: CLE, maintenant: APRES, ...(o.io || {}) });

/* (1) le jour entier */
const r = await attesterJour(io(), { day: DAY, tickets: [H[2], H[0], H[1], H[0].toUpperCase()] });
vu(r.ok === true && r.nTickets === 3 && r.attestations.length === 3 && r.refus.length === 0, 'jour ferme, 3 tickets (doublon et majuscules ignores) -> 3 attestations');
vu(r.part === '3333333' && r.poussiere === '1' && r.potAtClose === '10000000', 'part = floor(10 USDC / 3) = 3 333 333, poussiere 1 (reste au pot, roule apres la grace)');
vu(r.attestations.map((x) => x.wallet).join() === [...H].sort().join(), 'une attestation par holder, dans l ordre trie (public, rejouable)');
for (const at of r.attestations) {
  const d = P.donneesClaim({ chainId: 8453, contrat: CONTRAT, day: DAY, wallet: at.wallet, ticket: at.ticket, amount: at.amount, deadline: at.deadline });
  vu(at.digest === P.digestClaim(d) && recupererAdresse(at.digest, at.signature).toLowerCase() === VERIF, 'attestation de ' + at.wallet.slice(0, 10) + '… : digest = digestClaim, signature -> verifier()');
  vu(at.ticket === ticketDe(at.wallet, 'J2026-10-18') && at.amount === '3333333' && at.deadline === P.claimableUntil(DAY) && at.jourId === 'J2026-10-18', 'ticket derive de (wallet, J2026-10-18), part, echeance = fin de grace');
}
vu(JSON.stringify(r).length > 100, 'la reponse du jour se serialise en JSON (aucun BigInt ne fuit vers la route)');
const ioLot = io(); await attesterJour(ioLot, { day: DAY, tickets: H });
vu(ioLot.rpc.appels === 6 + 3, 'attesterJour lit l etat du contrat UNE fois (6 lectures) + un ticketOf par holder (' + ioLot.rpc.appels + ' appels)');
/* une part demandee explicitement : au plus la part ; l echeance explicite : au plus la grace */
vu((await attesterPart(io(), { day: DAY, wallet: H[0], ticket: ticketDe(H[0], 'J2026-10-18'), nTickets: 3, amount: 3_000_000 })).ok === true, 'un montant <= la part : signe');
vu(/a share of day/.test((await attesterPart(io(), { day: DAY, wallet: H[0], ticket: ticketDe(H[0], 'J2026-10-18'), nTickets: 3, amount: 3_333_334 })).pourquoi), 'un montant > la part : REFUSE avec les chiffres');
vu((await attesterPart(io(), { day: DAY, wallet: H[0], ticket: ticketDe(H[0], 'J2026-10-18'), nTickets: 1 })).amount === '10000000', '1 seul ticket : la part = tout le pot');

/* (2) refus */
const part = (o, d = {}) => attesterPart(io(o), { day: DAY, wallet: H[0], ticket: ticketDe(H[0], 'J2026-10-18'), nTickets: 3, ...d });
const nonFerme = await part({ ferme: false });
vu(nonFerme.etat === 'REFUSE' && /not closed on chain/.test(nonFerme.pourquoi), 'jour NON ferme -> rien signe (un fund tardif changerait les parts) : ' + nonFerme.pourquoi);
vu((await attesterJour(io({ ferme: false }), { day: DAY, tickets: H })).ok === false, 'attesterJour sur un jour non ferme : ok false, aucune attestation');
vu((await attesterPart({ ...io(), contrat: null }, { day: DAY, wallet: H[0], ticket: ticketDe(H[0], 'J2026-10-18'), nTickets: 3 })).etat === 'PAS_OUVERT', 'contrat non deploye -> PAS_OUVERT');
vu((await part({ verifier: '0x' + '99'.repeat(20) })).etat === 'PAS_OUVERT', 'cle du serveur != verifier du contrat -> rien signe');
const autreChaine = await part({ chaineLue: 1 });
vu(autreChaine.etat === 'PAS_OUVERT' && /reads chain 1 but signs for chain 8453/.test(autreChaine.pourquoi), 'chaine lue 1, signee 8453 -> rien signe');
vu((await part({ pause: true })).etat === 'PAS_OUVERT', 'contrat en pause -> PAS_OUVERT');
const deja = await part({ payes: [H[0]] });
vu(deja.etat === 'REFUSE' && /already received/.test(deja.pourquoi), 'wallet deja paye ce jour -> REFUSE');
const reste = await part({ reste: 3_000_000n });
vu(reste.etat === 'REFUSE' && /only 3000000 raw USDC left/.test(reste.pourquoi), 'part (3 333 333) > ce qui reste (3 000 000) -> REFUSE avec les chiffres');
vu((await part({ potAtClose: 0n })).etat === 'REFUSE' && (await part({ potAtClose: 2n })).etat === 'REFUSE', 'pot vide, ou plus petit que n (part 0) -> REFUSE');
vu((await attesterPart({ ...io(), maintenant: P.dayEnd(DAY) - 1 }, { day: DAY, wallet: H[0], ticket: ticketDe(H[0], 'J2026-10-18'), nTickets: 3 })).etat === 'REFUSE', 'jour pas fini -> REFUSE (avant toute lecture)');
vu(/outlives the 7-day grace/.test((await part({}, { deadline: P.claimableUntil(DAY) + 1 })).pourquoi) && /already past/.test((await part({}, { deadline: APRES - 1 })).pourquoi), 'echeance au-dela de la grace, ou passee -> REFUSE');
vu((await part({}, { nTickets: 0 })).etat === 'REFUSE' && (await part({}, { ticket: '0x' + '0'.repeat(40) })).etat === 'REFUSE' && (await part({}, { wallet: 'nope' })).etat === 'REFUSE', '0 ticket, ticket nul, wallet mal forme -> REFUSE');
vu((await attesterPart({ ...io(), cle: null }, { day: DAY, wallet: H[0], ticket: ticketDe(H[0], 'J2026-10-18'), nTickets: 3 })).etat === 'PAS_OUVERT', 'pas de cle sur le serveur -> PAS_OUVERT');
vu((await attesterJour(io(), { day: DAY, tickets: [] })).etat === 'REFUSE', 'aucun ticket -> REFUSE');
const rpcMort = async () => { throw new Error('down'); };
vu((await attesterPart({ ...io(), rpc: rpcMort }, { day: DAY, wallet: H[0], ticket: ticketDe(H[0], 'J2026-10-18'), nTickets: 3 })).etat === 'NON_LU' && (await attesterJour({ ...io(), rpc: rpcMort }, { day: DAY, tickets: H })).etat === 'NON_LU', 'chaine illisible -> NON_LU, jamais une signature');

/* (3) le ticket = app.html adresseTicket (crypto.subtle), octet pour octet */
const adresseTicketApp = async (moiBas, jourId) => { const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(moiBas + '|' + jourId))); return '0x' + [...h.slice(0, 20)].map((b) => b.toString(16).padStart(2, '0')).join(''); };
for (const w of H) vu(ticketDe(w, 'J2026-10-18') === await adresseTicketApp(w, 'J2026-10-18') && ticketDe(w.toUpperCase(), 'J2026-10-18') === ticketDe(w, 'J2026-10-18'), 'ticketDe(' + w.slice(0, 10) + '…) = adresseTicket de app.html (minuscules forcees)');
vu(ticketDe(H[0], 'J2026-10-18') !== ticketDe(H[0], 'J2026-10-19') && /^0x[0-9a-f]{40}$/.test(ticketDe(H[0], 'J2026-10-18')), 'un ticket par (wallet, jour), 20 octets');
vu((() => { try { ticketDe(H[0], '2026-10-18'); return false; } catch (_) { return true; } })(), 'un id de jour sans J : jete');
/* (4) lireJour */
const j = await lireJour(io(), DAY);
vu(j.verifier === VERIF && j.chaine === 8453 && j.ferme === true && j.potAtClose === 10_000_000n && j.reste === 10_000_000n && j.enPause === false, 'lireJour decode verifier, chaine, pause, closed, potAtClose, dayPot');
/* (S) LA SEMAINE PONDEREE (Phil 2026-10-18 : « au nombre de tickets : autant de chances ») — H0 : 7 jours + 3 bonus Week pass = 10 entrees ;
 *   H1 : 3 jours ; H2 : 0 entree (absent). Pot 13 USDC -> 13 x 10/13 = 10, 13 x 3/13 = 3 ; un bonus sans entree ne cree pas de part. */
const ent = [...Array(7)].map((_, k) => ({ adresse: H[0], jour: 'J2026-10-1' + k })).concat([...Array(3)].map((_, k) => ({ adresse: H[1], jour: 'J2026-10-1' + k })));
const s = await attesterSemaine(io({ potAtClose: 13_000_000n }), { day: DAY, entrees: ent, bonus: { [H[0]]: 3, [H[2]]: 3 } });
vu(s.ok === true && s.total === 13 && s.parWallet[H[0]] === 10 && s.parWallet[H[1]] === 3 && !(H[2] in s.parWallet), 'semaine : entrees + bonus Week pass (H0 10, H1 3), un bonus sans entree ignore');
const am = Object.fromEntries(s.attestations.map((x) => [x.wallet, x.amount]));
vu(am[H[0]] === '10000000' && am[H[1]] === '3000000' && s.poussiere === '0', 'parts au prorata : 10/13 et 3/13 de 13 USDC = 10 et 3 USDC, rien ne depasse le pot');
vu(s.attestations.every((x) => recupererAdresse(x.digest, x.signature).toLowerCase() === VERIF), 'chaque part ponderee est signee par le verifier');
vu((await attesterPart(io({ potAtClose: 13_000_000n }), { day: DAY, wallet: H[1], ticket: ticketDe(H[1], 'J2026-10-18'), nTickets: 2, amount: 3_000_001n, poids: 3, total: 13 })).ok === false, 'une part ponderee au-dessus de pot x poids/total : refusee (mutant « pas de plafond » rouge)');
vu((await attesterSemaine(io(), { day: DAY, entrees: [] })).ok === false, 'semaine sans entree : rien a partager');
console.log('ok ticketpot-attestation - ' + n + ' assertions ; NE PROUVE PAS une vraie chaine');
