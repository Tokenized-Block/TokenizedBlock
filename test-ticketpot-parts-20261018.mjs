/* test-ticketpot-parts-20261018.mjs - LES PARTS SIGNEES PAR LE WALLET VERIFIER, RELUES ET RECLAMEES PAR LE HOLDER (Phil 2026-10-18 :
 * « je ne mets pas la cle privee, je signe moi-meme »).
 * AFFIRME : (1) partsDuJour (pur) : une part par holder, triee, ticket = ticketDe, amount = floor(pot / n), deadline = grace, digest =
 *   digestClaim(donnees) ; une signature gardee SEULEMENT sur le meme digest ; pot vide -> [] ; (2) verifierSignaturePart : une signature
 *   du verifier (signerDigest, cle de test) -> true ; une autre cle -> false ; signature mal formee -> false ; (3) serveur : GET
 *   /api/ticketpot/parts et POST /api/ticketpot/signature existent, relisent le signataire, n acceptent que le verifier, ne signent rien ;
 *   attester-ticketpot.html servie ; (4) app : « Claim my share » cache, montre seulement avec une signature pour CE wallet, planClaim.
 * NE PROUVE PAS : une signature reelle du wallet de Phil ni un claim reel. */
import { readFileSync } from 'node:fs';
import { partsDuJour, verifierSignaturePart } from './ticketpot-parts.js';
import { digestClaim, dayDeJourId, claimableUntil } from './ticketpot-plan.js';
import { ticketDe } from './ticketpot-attestation.js';
import { adresseDe, signerDigest } from './signeur-secp256k1.js';
let n = 0;
const vu = (c, m) => { if (!c) { console.error('KO ' + m); process.exit(1); } n++; };
const C = '0x' + 'f9'.repeat(20), W1 = '0x' + 'a1'.repeat(20), W2 = '0x' + 'b2'.repeat(20), J = 'J2026-10-17';
const CLE = '0x' + '7c'.repeat(32), VERIF = adresseDe(CLE).toLowerCase(), AUTRE = '0x' + '5d'.repeat(32);
/* (1) */
const parts = partsDuJour({ chainId: 8453, contrat: C, jourId: J, tickets: [W2, W1, W1.toUpperCase()], potAtClose: 1000001n });
vu(parts.length === 2 && parts[0].wallet === W1 && parts[1].wallet === W2, 'une part par holder, triee, sans doublon (casse)');
vu(parts[0].amount === '500000' && parts[0].day === dayDeJourId(J) && parts[0].deadline === claimableUntil(dayDeJourId(J)) && parts[0].ticket === ticketDe(W1, J), 'amount = floor(pot / n), day, deadline (grace), ticket = ticketDe');
vu(parts[0].digest === digestClaim(parts[0].donnees) && parts[0].donnees.message.wallet === W1 && parts[0].donnees.domain.verifyingContract === C && parts[0].signature === null, 'digest = digestClaim(donnees EIP-712) ; pas de signature');
vu(partsDuJour({ chainId: 8453, contrat: C, jourId: J, tickets: [W1], potAtClose: 0n }).length === 0, 'pot vide : aucune part');
const sig = signerDigest(CLE, parts[0].digest);
const avec = partsDuJour({ chainId: 8453, contrat: C, jourId: J, tickets: [W2, W1], potAtClose: 1000001n, signatures: { [W1]: { digest: parts[0].digest, signature: sig } } });
vu(avec[0].signature === sig && avec[1].signature === null, 'une signature recue est rendue sur SA part');
const perimee = partsDuJour({ chainId: 8453, contrat: C, jourId: J, tickets: [W1], potAtClose: 1000001n, signatures: { [W1]: { digest: parts[0].digest, signature: sig } } });
vu(perimee[0].signature === null, 'une part recalculee (n change -> digest change) rend la signature CADUQUE');
/* (2) */
vu(verifierSignaturePart({ digest: parts[0].digest, signature: sig, verifier: VERIF }) === true, 'la signature du verifier est acceptee');
vu(verifierSignaturePart({ digest: parts[0].digest, signature: signerDigest(AUTRE, parts[0].digest), verifier: VERIF }) === false, 'une autre cle est refusee');
vu(verifierSignaturePart({ digest: parts[1].digest, signature: sig, verifier: VERIF }) === false, 'la signature d une part sur une autre part est refusee');
vu(verifierSignaturePart({ digest: parts[0].digest, signature: '0x12', verifier: VERIF }) === false && verifierSignaturePart({ digest: parts[0].digest, signature: sig, verifier: null }) === false, 'mal formee ou sans verifier : false, jamais une exception');
/* (3) */
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const bloc = srv.slice(srv.indexOf("if (chemin === '/api/ticketpot/parts' || chemin === '/api/ticketpot/signature') {"), srv.indexOf("if (chemin === '/api/jeu/niveau') {"));
vu(bloc.length > 500 && /import \{ partsDuJour as partsTicketPot, verifierSignaturePart \} from '\.\/ticketpot-parts\.js';/.test(srv), 'serveur : le bloc et l import');
vu(/const parts = j\.ferme \? partsTicketPot\(\{ chainId: 8453, contrat: contratTP, jourId, tickets, potAtClose: j\.potAtClose, signatures: sigs \}\) : \[\];/.test(bloc), 'parts seulement pour un jour FERME, depuis ticketsJour (la meme liste que /api/tirage)');
vu(/if \(!verifierSignaturePart\(\{ digest: p\.digest, signature, verifier: r\.verifier \}\)\)/.test(bloc) && /if \(!r\.ferme\)/.test(bloc) && /if \(!p\)/.test(bloc), 'POST : jour ferme, holder du jour, signataire = verifier() relu ; sinon rien n est garde');
vu(!/signerDigest|MISSIONS_VERIFIER_KEY|attesterPart|attesterJour/.test(bloc), 'le serveur ne signe RIEN ici');
vu(/brutTP\.length > 2048/.test(bloc) && /revenu\.ticketpotSig\[jourId\]\[wallet\] = \{ digest: p\.digest, signature,/.test(bloc) && /revenuSale = true;/.test(bloc), 'corps borne ; signature gardee sous son digest, persistee');
vu(/'attester-ticketpot\.html',/.test(srv.match(/const SERVIS\s*=\s*\[([\s\S]*?)\];/)[1]), 'attester-ticketpot.html servie');
const page = readFileSync(new URL('./attester-ticketpot.html', import.meta.url), 'utf8');
vu(/eth_signTypedData_v4/.test(page) && /JSON\.stringify\(p\.donnees\)/.test(page) && /noindex/.test(page) && !/eth_sendTransaction|sendCalls/.test(page), 'la page signe un MESSAGE type (jamais une transaction)');
/* (4) */
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
vu(/import \{ planFund as planFundPot, planClaim as planClaimPot, dayDeJourId as dayDeJourIdPot \} from '\.\/ticketpot-plan\.js';/.test(app), 'app : planClaim importe');
const pr = app.slice(app.indexOf('async function peindreReclamerPot('), app.indexOf("$('#jourReclamerPot').addEventListener"));
vu(/maPartPot = null; b\.hidden = true;/.test(pr) && /if \(!v \|\| !v\.ferme \|\| !c\) return;/.test(pr) && /\(x\) => x\.wallet === moi && x\.signature\)/.test(pr), 'bouton seulement : jour ferme, wallet connecte, part SIGNEE de CE wallet');
vu(/String\(c\)\.toLowerCase\(\) !== maPartPot\.wallet\) return;/.test(pr) && /planClaimPot\(\{ contrat: maPartPot\.contrat, day: maPartPot\.day, wallet: maPartPot\.wallet, ticket: maPartPot\.ticket, amount: maPartPot\.amount, deadline: maPartPot\.deadline, signature: maPartPot\.signature, ferme: true \}\)/.test(pr) && /await envoyerAppels\(plan\.appels, c\)/.test(pr), 'reclamerPot : le wallet de la part, planClaim avec la signature, envoi par envoyerAppels');
vu(/void peindreReclamerPot\(tp, c\);/.test(app), 'cable : peint avec le pot');
console.log('ok ticketpot-parts - ' + n + ' assertions ; NE PROUVE PAS une signature ni un claim reels');
