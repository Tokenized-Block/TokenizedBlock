/* banc-ticketpot-fork-20261018.mjs — TicketPot DEPLOYE SUR UN FORK DE BASE, CONTRE LE VRAI USDC (proxy, 6 decimales), avec les attestations
 * produites par ticketpot-attestation.js (le code que le serveur appellera) et une donnee de creation produite par le PREPARATEUR.
 * Usage : (cd contracts && forge build) ; "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://mainnet.base.org --port 9627
 *         puis node banc-ticketpot-fork-20261018.mjs [http://127.0.0.1:9627]
 * DEROULE (vraies transactions sur le fork, comptes IMPERSONNES, rien n est envoye a Base) :
 *   0. le preparateur est lance avec des parametres de TEST (verifier = adresse de la cle publique de test 0xA11CE, guardian = 0x…6a2d) vers
 *      un fichier temporaire ; la verification de la page (ticketpot-config.js) l accepte ; la donnee est envoyee TELLE QUELLE sans `to` ;
 *      relectures de la page (USDC, verifier, guardian, owner = signataire, delais, domaine EIP-712 = celui du serveur) ;
 *   1. 10 USDC reels (pris a une pool du fork) : fund(today) par le « wallet des frais » ;
 *   2. lendemain 00:02 UTC : un tiers ne peut pas fermer (12 h), l owner ferme ; un fund tardif sur le jour ferme est refuse ;
 *   3. attesterJour (3 tickets) -> 3 parts de 3 333 333 ; deux holders reclament (envoye par un TIERS), soldes lus ;
 *   4. refus : rejeu de la meme attestation, signature d une autre cle, 5 USDC signes par le verifier au-dela du reste ;
 *   5. apres la grace (7 j) : rollover deplace SEULEMENT le reste (3 333 334) vers le jour courant ; la part du 3e holder est alors refusee.
 * ⛔ La cle 0xA11CE est la cle de TEST publique des bancs forge : jamais une cle reelle, jamais sur mainnet.
 * NE PROUVE PAS : un vrai wallet, la page dans un navigateur, le deploiement reel (Phil seul signe), le cablage serveur (le lead). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as F from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { selecteur } from './keccak.js';
import * as P from './ticketpot-plan.js';
import { verifierEnregistrement } from './ticketpot-config.js';
import { attesterJour, ticketDe } from './ticketpot-attestation.js';
import { adresseDe, signerDigest } from './signeur-secp256k1.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9627';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exit(1); }
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpc = async (method, params = []) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + r.error.message);
  return r.result;
};
const USDC = F.USDC_BASE.toLowerCase();
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const appel = async (to, sig, args = '') => String(await rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']));
const lireU = async (to, sig, args = '') => BigInt(await appel(to, sig, args));
const lireAdr = async (to, sig) => ('0x' + (await appel(to, sig)).slice(-40)).toLowerCase();
const solde = (qui) => lireU(USDC, 'balanceOf(address)', adrMot(qui));
const usd = (x) => (Number(x) / 1e6).toFixed(6);
async function recu(h) {
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
const envoyer = async (de, tx, gas = 400000) => recu(await rpc('eth_sendTransaction', [{ from: de, ...(tx.to ? { to: tx.to } : {}), data: tx.data || '0x', gas: hex(gas) }]));
const compte = async (a) => { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, hex(10n ** 18n)]); return a; };
const ts = async () => parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
const allerA = async (t) => { await rpc('evm_setNextBlockTimestamp', [hex(t)]); await rpc('evm_mine', []); };

const chaine = parseInt(await rpc('eth_chainId'), 16), tete = parseInt(await rpc('eth_blockNumber'), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base (sinon ce banc ne prouve rien)')) process.exit(1);

/* 0. le preparateur, des parametres de TEST, la verification de la page, la donnee envoyee telle quelle */
const CLE = '0x' + (0xA11CEn).toString(16).padStart(64, '0');
const VERIF = adresseDe(CLE).toLowerCase(), GUARDIAN = '0x0000000000000000000000000000000000006a2d';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tp-banc-'));
let D;
try {
  fs.writeFileSync(path.join(tmp, 'p.json'), JSON.stringify({ verifier: VERIF, guardian: GUARDIAN }));
  execFileSync(process.execPath, ['preparer-deploiement-ticketpot.mjs'], { cwd: path.join(ICI, 'contracts'), env: { ...process.env, SORTIE: path.join(tmp, 'd.js'), PARAMETRES: path.join(tmp, 'p.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  ({ TICKETPOT_DEPLOIEMENT: D } = await import(pathToFileURL(path.join(tmp, 'd.js')).href));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
const v = verifierEnregistrement(D, crypto.createHash('sha256').update(Buffer.from(D.creation.slice(2), 'hex')).digest('hex'));
if (!ok(D.pret && v.intacte, 'enregistrement prepare (parametres de test) : pret, accepte par la verification de la page (' + (v.pourquoi.join('; ') || 'intact') + ')')) process.exit(1);
const phil = await compte('0x00000000000000000000000000000000de9107e4');
const dep = await envoyer(phil, { data: D.creation }, 3_000_000);
if (!ok(dep.status === '0x1', 'la donnee preparee, envoyee TELLE QUELLE sans `to`, cree le contrat (gaz ' + BigInt(dep.gasUsed) + ', creation ' + D.octetsCreation + ' octets)')) process.exit(1);
const C = dep.contractAddress.toLowerCase();
const runtime = ((await rpc('eth_getCode', [C, 'latest'])).length - 2) / 2;
ok(runtime < 8192, 'runtime deploye ' + runtime + ' octets (< 8 Ko)');
ok((await lireAdr(C, 'USDC()')) === USDC && (await lireAdr(C, 'verifier()')) === VERIF && (await lireAdr(C, 'guardian()')) === GUARDIAN && (await lireAdr(C, 'owner()')) === phil,
  'relu USDC = USDC de Base, verifier = 0xA11CE (test), guardian, owner = le signataire');
ok((await lireU(C, 'GRACE()')) === BigInt(P.GRACE_S) && (await lireU(C, 'FUNDING_DELAY()')) === BigInt(P.FUNDING_DELAY_S) && (await lireU(C, 'ADMIN_DELAY()')) === 172800n && (await lireU(C, 'totalPots()')) === 0n,
  'relu GRACE 7 j, FUNDING_DELAY 12 h, ADMIN_DELAY 48 h, totalPots 0');
ok((await appel(C, 'domainSeparator()')).toLowerCase() === P.domaineSeparateur(8453, C), 'domainSeparator() on-chain = ticketpot-plan.js domaineSeparateur(8453, adresse) : le domaine que le serveur signe');

/* 1. 10 USDC reels au pot du jour */
const FEES = await compte('0x000000000000000000000000000000000000fee5');
const TIERS = await compte('0x0000000000000000000000000000000000000b22');
const pools = [...POOLS_ACTIONS_AERODROME.values()].map((t) => t.pool).filter(Boolean);
let source = null;
for (const p of pools) { if ((await solde(p)) >= 20_000_000n) { source = p.toLowerCase(); break; } }
if (!ok(!!source, 'une pool du fork tient >= 20 USDC reels (source ' + source + ')')) process.exit(1);
await compte(source);
ok((await envoyer(source, { to: USDC, data: selecteur('transfer(address,uint256)') + adrMot(FEES) + mot(20_000_000n) })).status === '0x1', '20 USDC reels au wallet des frais (impersonne)');
const t0 = await ts(), JOUR = P.jourDe(t0);
const fr = P.planFund({ contrat: C, usdc: USDC, day: JOUR, montant: 10_000_000n, maintenant: t0 });
let rf = null;
for (const a of fr.appels) rf = await envoyer(FEES, a);
const Fu = P.lireFunded(rf.logs, C);
ok(rf.status === '0x1' && Fu && Fu.day === JOUR && Fu.amount === 10_000_000n && (await lireU(C, 'dayPot(uint32)', mot(JOUR))) === 10_000_000n && (await solde(C)) === 10_000_000n,
  'fund(' + P.jourIdDeDay(JOUR) + ', 10 USDC) (planFund, gaz ' + BigInt(rf.gasUsed) + ') : dayPot = 10 = balanceOf(contrat)');
ok(P.planClaim({ contrat: C, day: JOUR, wallet: TIERS, ticket: '0x' + '11'.repeat(20), amount: 1, deadline: P.claimableUntil(JOUR), signature: '0x' + '00'.repeat(65), maintenant: t0 }).etat === 'REFUSE', 'planClaim refuse tant que le jour dure');

/* 2. lendemain 00:02 UTC : close */
await allerA(P.dayEnd(JOUR) + 120);
ok((await envoyer(TIERS, P.planClose({ contrat: C, day: JOUR, owner: true, maintenant: await ts() }).appels[0])).status === '0x0', 'close par un TIERS avant 12 h : status 0 (TooEarly)');
const rc = await envoyer(phil, P.planClose({ contrat: C, day: JOUR, owner: true, maintenant: await ts() }).appels[0]);
const K = P.lireClosed(rc.logs, C);
ok(rc.status === '0x1' && K && K.pot === 10_000_000n && (await lireU(C, 'potAtClose(uint32)', mot(JOUR))) === 10_000_000n, 'close par l owner a 00:02 (gaz ' + BigInt(rc.gasUsed) + ') : potAtClose = 10 USDC, fige');
const tard = await envoyer(FEES, { to: C, data: selecteur(P.SIG_FUND) + mot(JOUR) + mot(1_000_000n) });
ok(tard.status === '0x0' && (await lireU(C, 'potAtClose(uint32)', mot(JOUR))) === 10_000_000n, 'fund tardif sur le jour FERME : status 0 (DayClosed), le pot fige ne bouge pas');

/* 3. trois tickets, deux holders reclament */
const H = ['0x00000000000000000000000000000000000000a1', '0x00000000000000000000000000000000000000a2', '0x00000000000000000000000000000000000000a3'];
const io = { rpc, chaineId: 8453, contrat: C, cle: CLE, maintenant: await ts() };
const J = await attesterJour(io, { day: JOUR, tickets: H });
ok(J.ok && J.nTickets === 3 && J.part === '3333333' && J.poussiere === '1' && J.attestations.length === 3, 'attesterJour sur le FORK : 3 tickets, part 3 333 333, poussiere 1 (lus sur le contrat)');
const at = Object.fromEntries(J.attestations.map((x) => [x.wallet, x]));
const avant = await Promise.all(H.map(solde));
for (const w of H.slice(0, 2)) {
  const a = at[w];
  const r = await envoyer(TIERS, P.planClaim({ contrat: C, day: JOUR, wallet: w, ticket: a.ticket, amount: a.amount, deadline: a.deadline, signature: a.signature, ferme: true, maintenant: await ts() }).appels[0]);
  const Cl = P.lireClaimed(r.logs, C);
  ok(r.status === '0x1' && Cl && Cl.wallet === w && Cl.ticket === ticketDe(w, P.jourIdDeDay(JOUR)) && Cl.amount === 3_333_333n && Cl.by === TIERS,
    'claim de ' + w.slice(-4) + ' envoye par un TIERS (gaz ' + BigInt(r.gasUsed) + ') : Claimed porte le ticket ' + Cl?.ticket.slice(0, 12) + '…');
}
const apres = await Promise.all(H.map(solde));
ok(apres[0] - avant[0] === 3_333_333n && apres[1] - avant[1] === 3_333_333n && apres[2] === avant[2] && (await solde(C)) === 3_333_334n,
  'soldes USDC REELS : a1 +3,333333, a2 +3,333333, a3 inchange, contrat 3,333334');
ok((await lireU(C, 'paid(uint32)', mot(JOUR))) === 6_666_666n && (await lireU(C, 'dayPot(uint32)', mot(JOUR))) === 3_333_334n && (await lireU(C, 'claimed(uint32,address)', mot(JOUR) + adrMot(H[0]))) === 1n, 'paid 6 666 666, reste 3 333 334, claimed(a1) = true');

/* 4. refus */
const a1 = at[H[0]];
const rejeu = P.planClaim({ contrat: C, day: JOUR, wallet: H[0], ticket: a1.ticket, amount: a1.amount, deadline: a1.deadline, signature: a1.signature, maintenant: await ts() }).appels[0];
ok((await envoyer(TIERS, rejeu)).status === '0x0', 'rejeu de l attestation de a1 : status 0 (AlreadyClaimed)');
const a3 = at[H[2]];
const digestDe = (amount) => P.digestClaim(P.donneesClaim({ chainId: 8453, contrat: C, day: JOUR, wallet: H[2], ticket: a3.ticket, amount, deadline: a3.deadline }));
const autreCle = signerDigest('0x' + (0xB0Bn).toString(16).padStart(64, '0'), digestDe(a3.amount));
ok((await envoyer(TIERS, P.planClaim({ contrat: C, day: JOUR, wallet: H[2], ticket: a3.ticket, amount: a3.amount, deadline: a3.deadline, signature: autreCle, maintenant: await ts() }).appels[0])).status === '0x0', 'la part de a3 signee par une AUTRE cle : status 0 (BadProof)');
const trop = signerDigest(CLE, digestDe(5_000_000n));
ok((await envoyer(TIERS, P.planClaim({ contrat: C, day: JOUR, wallet: H[2], ticket: a3.ticket, amount: 5_000_000n, deadline: a3.deadline, signature: trop, maintenant: await ts() }).appels[0])).status === '0x0'
  && (await solde(C)) === 3_333_334n, '5 USDC signes par le VRAI verifier, au-dela du reste (3,333334) : status 0 (AmountOverPot), rien ne sort');

/* 5. apres la grace : rollover du reste seulement ; la part de a3 est alors refusee */
ok((await envoyer(TIERS, { to: C, data: selecteur(P.SIG_ROLLOVER) + mot(JOUR) })).status === '0x0', 'rollover pendant la grace : status 0 (GraceNotOver)');
await allerA(P.claimableUntil(JOUR) + 1);
const tR = await ts(), AUJ = P.jourDe(tR);
const rr = await envoyer(TIERS, P.planRollover({ contrat: C, day: JOUR, maintenant: tR }).appels[0]);
const R = P.lireRolledOver(rr.logs, C);
ok(rr.status === '0x1' && R && R.fromDay === JOUR && R.toDay === AUJ && R.amount === 3_333_334n && (await lireU(C, 'dayPot(uint32)', mot(AUJ))) === 3_333_334n,
  'rollover par un tiers apres 7 j (gaz ' + BigInt(rr.gasUsed) + ') : SEULEMENT le reste (3,333334) vers ' + P.jourIdDeDay(AUJ) + ' (le jour courant)');
ok((await lireU(C, 'potAtClose(uint32)', mot(JOUR))) === 10_000_000n && (await lireU(C, 'paid(uint32)', mot(JOUR))) === 6_666_666n && (await lireU(C, 'dayPot(uint32)', mot(JOUR))) === 0n, 'le jour roule garde son archive : potAtClose 10, paid 6,666666, reste 0');
const tardif = await envoyer(TIERS, P.planClaim({ contrat: C, day: JOUR, wallet: H[2], ticket: a3.ticket, amount: a3.amount, deadline: a3.deadline, signature: a3.signature, maintenant: a3.deadline }).appels[0]);
ok(tardif.status === '0x0' && (await solde(H[2])) === avant[2], 'la part (valide) de a3 apres le rollover : status 0 (SignatureExpired), a3 inchange');
ok((await solde(C)) === (await lireU(C, 'totalPots()')) && (await lireU(C, 'totalPots()')) === 3_333_334n, 'balanceOf(contrat) = totalPots = 3,333334 : rien d autre n est retenu');
console.log('deltas USDC : a1 +' + usd(apres[0] - avant[0]) + ' · a2 +' + usd(apres[1] - avant[1]) + ' · a3 +0 · contrat ' + usd(await solde(C)) + ' (au pot de ' + P.jourIdDeDay(AUJ) + ')');
console.log((ko ? 'ECHEC ' : 'ok ') + 'banc-ticketpot-fork - ' + n + ' assertions, ' + ko + ' KO ; fork Base, comptes impersonnes, cle de test 0xA11CE, rien de signe sur mainnet');
process.exit(ko ? 1 : 0);
