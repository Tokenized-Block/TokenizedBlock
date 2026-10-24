/* banc-slots-regleur-anvil-20261023.mjs — LE REGLEUR DES SLOTS DE BOUT EN BOUT sur un anvil LOCAL (aucun reseau), avec BlockSlots COMPILE.
 * Usage : (dans contracts/) forge build ; anvil --port P --chain-id 8453 ; node banc-slots-regleur-anvil-20261023.mjs P
 * Cles (2026-10-24, revue keeper 7 ; revue fix2 defaut 4 : 1 a 10, pas 11) : SEULES des cles de TEST PUBLIQUES, les entiers 1 a 10 :
 *   0x…01 = le regleur (il SIGNE ses tx brutes) ; 0x…02 deployeur, 0x…03 joueur (createur des duels), 0x…04 autre joueur, 0x…05 dev,
 *   0x…06 a 0x…09 = B1 a B4 (rejoignent, achetent des pass), 0x…0a = le pot commun des duels. Les adresses 0x…02 a 0x…0a sont DERIVEES
 *   de ces cles (adresseDe), approvisionnees par anvil_setBalance et IMPERSONNEES par anvil (anvil_impersonateAccount) : aucune cle n est
 *   lue pour elles, et les comptes deverrouilles par defaut d anvil (eth_accounts) ne sont plus utilises. Le banc REFUSE de tourner si le
 *   noeud n est pas anvil (web3_clientVersion) ou pas sur --chain-id 8453 (la garde de chaine du regleur). Rien ne touche Base.
 * DEROULE (vraies transactions, vrai contrat v4, vraies lectures du regleur — creerRegleur + le vrai lecteur JSON-RPC) :
 *   1. USDC de test (UsdcS du banc forge) + BlockSlots (la table de slots-parametres.json) ; le pot finance ; le joueur fait 4 spins ;
 *   2. un 5e spin, d un autre joueur, laisse PERDRE (260 blocs) : le regleur ne l envoie jamais ;
 *   3. le regleur (tour()) envoie UNE tx brute EIP-1559 (tx-eip1559.js) : from = l adresse de la cle, to = le contrat, settleMany(ids) ;
 *      le noeud l accepte et l inclut ; chaque spin reglable est Settled ; chaque joueur touche EXACTEMENT les prix de ses spins ;
 *      le regleur ne touche aucun USDC et ne paie que du gas ; un 2e tour lit le recu (dernierRegle) ;
 *   4. payDev : le dev touche la part de TOUS les spins (le perdu compris) ; solde du contrat = pot (rien de coince).
 *   2026-10-24 (audit rolls-duels) — LE MEME regleur, la MEME cle, avec BlockDuels et BlockRolls COMPILES :
 *   5. (revue keeper 2026-10-24) 18 duels USDC crees puis rejoints ; personne ne regle : le vainqueur predit par le regleur (faceDuHash)
 *      = celui du CONTRAT (faceOf) ; egalite -> jamais envoye (refundExpired rend les mises apres la fenetre) ; createur gagnant -> settle
 *      des cible + delaiDuelBlocs ; rejoignant gagnant -> settle seulement dans la marge de fin ; chacun paye 90 / 7 / reste ;
 *   5b. la course perdue : le settle du createur EN ATTENTE, le regleur envoie le sien, un seul bloc les inclut (le sien revert, mine) :
 *      le regleur relit le duel, Settled -> revert EXPLIQUE, pas un echec ;
 *   6. le pot du pass : jour D arme par un acheteur qui se tait -> le regleur tire (drawDay) ; jour D+1 jamais ferme -> closeDay puis
 *      drawDay ; jour D+2 arme puis fenetre passee -> closeDay (re-arme) puis drawDay ; chaque pot va a buyers[hash % n] (recalcule).
 * NE PROUVE PAS : Base (sequenceur, prix du gas reel, noeuds publics) ; les contrats deployes sur Base ne sont pas touches. */
import { readFileSync } from 'node:fs';
import * as Regleur from './slots-regleur.js';
const { creerRegleur } = Regleur;
/* faceDuHash (2026-10-24) : absente d un module plus ancien — le banc tourne quand meme et le dit KO (mesure ROUGE sur 518653b) */
const faceDuHash = typeof Regleur.faceDuHash === 'function' ? Regleur.faceDuHash : () => null;
import * as Slots from './slots-plan.js';
import { encoderConfig } from './slots-config.js';
import { adresseDe } from './signeur-secp256k1.js';
import { selecteur, topic } from './keccak.js';

const PORT = process.argv[2] || '9597';
const URL_RPC = 'http://127.0.0.1:' + PORT;
let idr = 0;
const rpc = async (method, params = []) => {
  const r = await fetch(URL_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idr, method, params }) }).then((x) => x.json());
  if (r.error) { const e = new Error(method + ': ' + (r.error.message || JSON.stringify(r.error))); throw e; }
  return r.result;
};
let n = 0, ko = 0;
const vu = (c, m) => { n++; if (!c) ko++; console.log((c ? '  ok  ' : '  KO  ') + m); };
const art = (f, c) => JSON.parse(readFileSync(new URL('./contracts/out/' + f + '/' + c + '.json', import.meta.url), 'utf8'));
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const adr = (x) => String(x).toLowerCase().slice(2).padStart(64, '0');
const sel = (s) => selecteur(s).replace(/^0x/, '');
async function envoyer(from, to, data) {
  const h = await rpc('eth_sendTransaction', [{ from, ...(to ? { to } : {}), data, gas: '0x' + (8_000_000).toString(16) }]);
  let r = null; for (let k = 0; k < 60 && !r; k++) { r = await rpc('eth_getTransactionReceipt', [h]); if (!r) await new Promise((ok) => setTimeout(ok, 100)); }
  if (!r || r.status !== '0x1') throw new Error('tx failed ' + h);
  return r;
}
const lireU = async (to, data) => BigInt(await rpc('eth_call', [{ to, data }, 'latest']));
const solde = (t, a) => lireU(t, '0x70a08231' + adr(a));
const tete = async () => parseInt(await rpc('eth_blockNumber'), 16);

const chaineId = parseInt(await rpc('eth_chainId'), 16);
if (chaineId !== 8453) { console.log('anvil doit tourner avec --chain-id 8453 (lu : ' + chaineId + ')'); process.exit(2); }
const client = String(await rpc('web3_clientVersion'));
if (!/anvil/i.test(client)) { console.log('ce banc ne tourne que contre anvil (lu : ' + client + ')'); process.exit(2); }
/* les cles de TEST publiques 1 a 10 (voir l en-tete) ; 2 a 10 : adresses derivees, impersonnees, approvisionnees en ETH local */
const cleTest = (k) => '0x' + k.toString(16).padStart(64, '0');
const [DEP, JOUEUR, AUTRE, DEV, B1, B2, B3, B4, POOL] = [2, 3, 4, 5, 6, 7, 8, 9, 10].map((k) => adresseDe(cleTest(k)).toLowerCase());
for (const a of [DEP, JOUEUR, AUTRE, DEV, B1, B2, B3, B4, POOL]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x' + (10n ** 20n).toString(16)]); }
const CLE = cleTest(1);
const REG = adresseDe(CLE).toLowerCase();
await rpc('anvil_setBalance', [REG, '0x' + (10n ** 18n).toString(16)]);
console.log('anvil ' + URL_RPC + ' chaine ' + chaineId + ' ; regleur (cle de test 0x…01) ' + REG);

/* 1. le decor */
const P = JSON.parse(readFileSync(new URL('./contracts/slots-parametres.json', import.meta.url), 'utf8'));
const U = art('BlockSlots.t.sol', 'UsdcS'), B = art('BlockSlots.sol', 'BlockSlots');
const usdc = (await envoyer(DEP, null, U.bytecode.object)).contractAddress.toLowerCase();
const cfg = { usdc, devWallet: DEV, spinPrice: P.spinPrice, potShareBps: P.potShareBps, prizes: P.prizes };
const rB = await envoyer(DEP, null, B.bytecode.object + encoderConfig(cfg));
const contrat = rB.contractAddress.toLowerCase(), blocDep = parseInt(rB.blockNumber, 16);
vu((await lireU(contrat, '0x' + sel('DEV_SHARE()'))) === 250000n && (await lireU(contrat, '0x' + sel('TO_POT()'))) === 250000n, 'BlockSlots v4 deploye : TO_POT 0,25, DEV_SHARE 0,25');
for (const j of [JOUEUR, AUTRE, DEP]) await envoyer(DEP, usdc, '0x' + sel('mint(address,uint256)') + adr(j) + mot(1000_000000n));
await envoyer(DEP, usdc, '0x' + sel('approve(address,uint256)') + adr(contrat) + mot(100_000000n));
await envoyer(DEP, contrat, '0x' + sel('fund(uint256)') + mot(100_000000n));
const spinDe = async (j) => {
  await envoyer(j, usdc, '0x' + sel('approve(address,uint256)') + adr(contrat) + mot(P.spinPrice));
  const r = await envoyer(j, contrat, '0x' + sel('spin()'));
  return Slots.lireSpunTous(r.logs, contrat)[0];
};
/* 2. le spin PERDU d abord (il doit sortir de sa fenetre avant le tour du regleur) */
const perdu = await spinDe(AUTRE);
await rpc('anvil_mine', ['0x' + (260).toString(16)]);
/* au moins 12 spins (plus que les 10 d une tx), et jusqu a ce qu un spin GAGNE (sinon « le joueur touche ses prix » ne mordrait sur rien) ;
 * les prix attendus sont calcules depuis les VRAIS hashes de bloc (comme le contrat), une fois les trois blocs de chaque spin la */
const hashDe = async (b) => (await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false])).hash;
const spins = [];
let attendu = 0n;
for (let k = 0; k < 40 && (spins.length < 12 || attendu === 0n); k++) {
  const s = await spinDe(JOUEUR);
  spins.push(s);
  await rpc('anvil_mine', ['0x5']); /* cible = son bloc + 2 ; ses trois hashes existent des son bloc + 5 */
  const h = await Promise.all(Slots.blocsDesFaces(s.targetBlock).map(hashDe));
  s.prix = BigInt(P.prizes[Slots.points(Slots.facesDuSpin(h, s.spinId))]);
  attendu += s.prix;
}
const t0 = await tete();
vu(spins.length >= 12 && attendu > 0n, spins.length + ' spins du joueur, dont ' + spins.filter((s) => s.prix > 0n).length + ' gagnant(s) : ' + Slots.usdcPrecis(attendu) + ' USDC attendus');
vu(spins.every((s) => Slots.etatReglement(s.targetBlock, t0).etat === 'REGLABLE') && Slots.etatReglement(perdu.targetBlock, t0).etat === 'PERDU', 'tous reglables, 1 perdu (hors fenetre)');
const j0 = await solde(usdc, JOUEUR), a0 = await solde(usdc, AUTRE), e0 = BigInt(await rpc('eth_getBalance', [REG, 'latest']));

/* 3. le regleur */
const journal = [];
const r = creerRegleur({ cle: CLE, contrat, chainId: 8453, table: P.prizes, blocDeploiement: blocDep, rpc, journal: (x) => journal.push(x) });
vu(r.etat().etat === 'ON' && r.etat().adresse.toLowerCase() === REG, 'regleur ON, adresse = celle de la cle de test');
/* les tours, comme la boucle du serveur : une tx en vol a la fois, 10 spins au plus par tx */
const envois = [], recus = [];
for (let k = 0; k < 8; k++) {
  const t = await r.tour();
  if (t.fait) {
    envois.push(t);
    let rc = null; for (let q = 0; q < 50 && !rc; q++) { rc = await rpc('eth_getTransactionReceipt', [t.hash]); if (!rc) await new Promise((ok) => setTimeout(ok, 100)); }
    recus.push(rc);
  } else if (!/in flight/.test(t.pourquoi) && envois.length && r.etat().enVol === null) break;
}
const tous = envois.flatMap((t) => t.ids);
vu(envois.length === Math.ceil(spins.length / 10) && envois.every((t) => t.ids.length <= 10) && envois[0].ids.length === 10, envois.length + ' tx pour ' + spins.length + ' spins : 10 au plus par tx (' + envois.map((t) => t.ids.length).join(' + ') + ')');
vu(JSON.stringify(tous) === JSON.stringify(spins.map((s) => String(s.spinId))) && !tous.includes(String(perdu.spinId)), 'les ids envoyes = les spins reglables, dans l ordre ; le perdu jamais envoye');
vu(recus.every((rc) => rc && rc.status === '0x1'), 'chaque tx brute est acceptee par le noeud et incluse (status 0x1)');
const txs = await Promise.all(envois.map((t) => rpc('eth_getTransactionByHash', [t.hash])));
vu(txs.every((tx) => tx && tx.from.toLowerCase() === REG && tx.to.toLowerCase() === contrat && tx.input.startsWith('0x5ba3107b') && BigInt(tx.value) === 0n && tx.type === '0x2' && BigInt(tx.chainId) === 8453n), 'chaque tx : from = le regleur, to = le contrat, settleMany, value 0, type 2, chaine 8453');
const st = recus.flatMap((rc) => Slots.lireSettledTous(rc.logs, contrat));
vu(st.length === spins.length && st.every((d) => d.player === JOUEUR), st.length + ' Settled, chacun au joueur du spin');
for (const s of spins) { const v = Slots.lireSpin(await rpc('eth_call', [{ to: contrat, data: Slots.appelSpin(s.spinId) }, 'latest'])); s.statut = v.status; }
vu(spins.every((s) => s.statut === 2), 'tous les spins sont Settled sur la chaine');
const j1 = await solde(usdc, JOUEUR);
vu(j1 - j0 === attendu && st.reduce((x, d) => x + d.payout, 0n) === attendu, 'le joueur touche EXACTEMENT ses prix : ' + Slots.usdcPrecis(attendu) + ' USDC (calcules depuis les vrais hashes)');
vu((await solde(usdc, REG)) === 0n && (await solde(usdc, AUTRE)) === a0, 'le regleur ne touche aucun USDC ; le joueur du spin perdu ne recoit rien');
const e1 = BigInt(await rpc('eth_getBalance', [REG, 'latest']));
const gasPaye = recus.reduce((x, rc) => x + BigInt(rc.gasUsed) * BigInt(rc.effectiveGasPrice), 0n);
vu(e0 - e1 === gasPaye && gasPaye > 0n, 'le regleur ne paie que le gas : ' + gasPaye + ' wei (gasUsed ' + recus.map((rc) => BigInt(rc.gasUsed)).join(' + ') + ')');
const e = r.etat();
vu(e.compteurs.spinsRegles === spins.length && e.compteurs.envois === envois.length && e.dernierRegle && e.dernierRegle.hash === envois[envois.length - 1].hash && e.echecsSuite === 0, 'etat du regleur : ' + e.compteurs.spinsRegles + ' regles en ' + e.compteurs.envois + ' tx, dernier recu lu, 0 echec');
vu(Slots.lireSpin(await rpc('eth_call', [{ to: contrat, data: Slots.appelSpin(perdu.spinId) }, 'latest'])).status === 1, 'le spin perdu reste Pending sur la chaine (personne ne l a regle, rien ne lui est rendu)');
vu(!JSON.stringify(e).includes('0'.repeat(63) + '1') && !journal.join('\n').includes('0'.repeat(63) + '1'), 'la cle n est ni dans etat() ni dans le journal');

/* 4. la part du dev : tous les spins, le perdu compris ; rien de coince */
await envoyer(DEP, contrat, '0x' + sel('payDev()'));
vu((await solde(usdc, DEV)) === BigInt(spins.length + 1) * 250000n, 'payDev : le dev touche ' + (spins.length + 1) + ' x 0,25 (les ' + spins.length + ' regles ET le perdu)');
vu((await solde(usdc, contrat)) === (await lireU(contrat, Slots.appelPot())), 'solde du contrat = pot : rien de coince');

/* ================================================================ 5. et 6. : duels et pot du pass, le MEME regleur (2026-10-24) */
for (const j of [B1, B2, B3, B4]) await envoyer(DEP, usdc, '0x' + sel('mint(address,uint256)') + adr(j) + mot(1000_000000n));
const BD = art('BlockDuels.sol', 'BlockDuels'), BRo = art('BlockRolls.sol', 'BlockRolls');
const rD = await envoyer(DEP, null, BD.bytecode.object + adr(usdc) + adr(DEV) + adr(POOL) + adr(DEP));
const duels = rD.contractAddress.toLowerCase(), blocDuels = parseInt(rD.blockNumber, 16);
/* BlockRolls : Config a plat (14 mots) ; le « hook » doit avoir du code : l USDC de test (createurs() illisible -> createur 0, sans effet ici) */
const cfgR = [adr(usdc), adr(DEV), adr(usdc), mot(1n), mot(500000n), mot(10_000000n), mot(10n), mot(3600n), mot(5000n), mot(5_000000n), mot(3_000000n), mot(1_000000n), mot(500000n), mot(2n)].join('');
const rR = await envoyer(DEP, null, BRo.bytecode.object + cfgR);
const rolls = rR.contractAddress.toLowerCase();
vu(BigInt(await rpc('eth_getCode', [duels, 'latest']).then((c) => c.length)) > 2n && BigInt(await rpc('eth_getCode', [rolls, 'latest']).then((c) => c.length)) > 2n, 'BlockDuels et BlockRolls deployes en local');
/* revue fix2 defaut 2 : anvil mine en ~20 ms (minage instantane) ; MESURE, le temps de bloc saturait la marge de fin a 239 blocs selon la
 *   vitesse de la machine (le verdict de ce banc en dependait). Il est INJECTE : 200 ms (Base apres Denim) -> tours de 10 s, marge 150. */
const r2 = creerRegleur({ cle: CLE, contrat, chainId: 8453, table: P.prizes, blocDeploiement: blocDep, rpc, journal: (x) => journal.push(x), duels: { contrat: duels, bloc: blocDuels }, rolls: { contrat: rolls }, msParBloc: 200 });
/* les tours, comme la boucle du serveur ; rend les tx incluses du tour (recu lu) */
async function tours(k) {
  const faits = [];
  for (let q = 0; q < k; q++) {
    const t = await r2.tour();
    if (t.fait) { let rc = null; for (let z = 0; z < 50 && !rc; z++) { rc = await rpc('eth_getTransactionReceipt', [t.hash]); if (!rc) await new Promise((ok) => setTimeout(ok, 100)); } faits.push({ ...t, rc }); }
    await rpc('anvil_mine', ['0x3']); /* anvil ne mine qu a chaque tx : 3 blocs entre deux tours (une cible = bloc + 2) */
  }
  await r2.tour(); /* lit le dernier recu */
  return faits;
}
const pasDeTx = (faits) => faits.every((f) => f.rc && f.rc.status === '0x1');
/* 5. des duels (2026-10-24, revue keeper 1 et 2) : JOUEUR cree, B1 rejoint (et se tait). Le VAINQUEUR attendu de chaque duel est calcule par
 *   le CONTRAT COMPILE (faceOf(blockhash(cible)) puis les deux scores) ; le regleur le predit en JS (faceDuHash) : parite verifiee. Puis
 *   les tours (4 blocs entre deux) jusqu a la fin de la fenetre :
 *     egalite    -> JAMAIS envoye ; apres la fenetre, refundExpired (par n importe qui) rend les deux mises : rien n est coince ;
 *     createur   -> settle des cible + delaiDuelBlocs (le premier tour ou il est pret), paye 90 / 7 / reste ;
 *     rejoignant -> settle seulement quand tete + 1 >= cible + 256 - marge, inclus DANS la fenetre, paye.
 *   18 duels rejoints coup sur coup (un sur trois a les memes guesses : egalite certaine), puis une seule passe jusqu a la fin. */
const STAKE = 2_000000n;
const T_DS = topic('Settled(uint256,bytes32,uint8,uint8,address,uint256)');
const pot2 = 2n * STAKE, w9 = (pot2 * 9000n) / 10000n, p7 = (pot2 * 700n) / 10000n, dv = pot2 - w9 - p7;
const faceContrat = async (h) => (await rpc('eth_call', [{ to: duels, data: '0x' + sel('faceOf(bytes32)') + h.slice(2) }, 'latest'])).slice(2).match(/.{64}/g).map((x) => Number(BigInt('0x' + x)));
const score = (g, f) => g.reduce((s, x, i) => s + (x === f[i] ? 1 : 0), 0);
const statutDuel = async (id) => Number(BigInt('0x' + (await rpc('eth_call', [{ to: duels, data: '0x' + sel('duels(uint256)') + mot(id) }, 'latest'])).slice(2 + 64 * 2, 2 + 64 * 3)));
const soldes = async () => ({ a: await solde(usdc, JOUEUR), b: await solde(usdc, B1), p: await solde(usdc, POOL), d: await solde(usdc, DEV), k: await solde(usdc, REG) });
let idDuel = 0n;
/* un duel cree (JOUEUR) puis rejoint (B1) ; un sur trois avec les MEMES guesses (egalite certaine) ; rend sa cible et ses guesses */
async function nouveauDuel(k) {
  const gAn = [k % 6, (k * 7 + 1) % 10, (k * 5 + 2) % 19, (k * 3) % 9, (k + 1) % 8];
  const gBn = k % 3 === 2 ? gAn : [(k + 3) % 6, (k * 3 + 4) % 10, (k * 11 + 3) % 19, (k * 5 + 1) % 9, (k * 3 + 2) % 8];
  await envoyer(JOUEUR, usdc, '0x' + sel('approve(address,uint256)') + adr(duels) + mot(STAKE));
  await envoyer(JOUEUR, duels, '0x' + sel('create(address,uint256,uint8[5],uint64)') + adr(usdc) + mot(STAKE) + gAn.map(mot).join('') + mot(3600n));
  idDuel += 1n;
  await envoyer(B1, usdc, '0x' + sel('approve(address,uint256)') + adr(duels) + mot(STAKE));
  const rJ = await envoyer(B1, duels, '0x' + sel('join(uint256,uint8[5])') + mot(idDuel) + gBn.map(mot).join(''));
  return { id: idDuel, cible: parseInt(rJ.blockNumber, 16) + 2, gAn, gBn };
}
/* le vainqueur selon le CONTRAT (faceOf du hash de la cible, puis les scores) ; la prediction du regleur (faceDuHash) a cote */
async function classer(d) {
  const h = (await rpc('eth_getBlockByNumber', ['0x' + d.cible.toString(16), false])).hash;
  const fC = await faceContrat(h), sA = score(d.gAn, fC), sB = score(d.gBn, fC);
  return Object.assign(d, { h, fC, fJ: faceDuHash(h), sA, sB, attendu: sA === sB ? 'egalite' : sA > sB ? 'createur' : 'rejoignant' });
}
const attendreRecu = async (h) => { let rc = null; for (let z = 0; z < 50 && !rc; z++) { rc = await rpc('eth_getTransactionReceipt', [h]); if (!rc) await new Promise((ok) => setTimeout(ok, 100)); } return rc; };
/* 18 duels rejoints coup sur coup, puis UNE passe de tours (4 blocs entre deux) jusqu a la fin de la derniere fenetre */
const lot = [];
for (let k = 0; k < 18; k++) lot.push(await nouveauDuel(k));
await rpc('anvil_mine', ['0x3']);
for (const d of lot) await classer(d);
const av = await soldes();
const envoisD = new Map(), autres = [];
const finLot = Math.max(...lot.map((d) => d.cible)) + 256;
for (let tete0 = await tete(); tete0 + 1 <= finLot; tete0 = await tete()) {
  const t = await r2.tour();
  if (t.fait && t.cible === 'duels') envoisD.set(t.ids[0], { ...t, tete: tete0, rc: await attendreRecu(t.hash) });
  else if (t.fait) autres.push(t.cible + ':' + t.quoi + ':' + t.ids[0]);
  await rpc('anvil_mine', ['0x4']);
}
await r2.tour();
const { delaiDuelBlocs: delai, margeFinDuelBlocs: marge } = r2.etat().bornes;
vu(marge === 150 && r2.etat().tempsDeBloc === 'injecte' && r2.etat().intervalleMs === 10000, 'temps de bloc INJECTE (200 ms), pas mesure : marge de fin ' + marge + ' blocs, tours de ' + r2.etat().intervalleMs + ' ms (attendu 150, 10000 : le verdict ne depend plus de la vitesse de la machine)');
const ap = await soldes();
const vus = { createur: 0, rejoignant: 0, egalite: 0 }, issues = [];
for (const d of lot) {
  const e = envoisD.get(String(d.id));
  let ok = JSON.stringify(d.fJ) === JSON.stringify(d.fC), texte = '#' + d.id + ' ' + d.sA + '/' + d.sB + ' ' + d.attendu;
  if (d.attendu === 'egalite') { ok = ok && !e; texte += ' jamais envoye'; } else {
    const ev = e && e.rc ? e.rc.logs.find((l) => l.address.toLowerCase() === duels && l.topics[0] === T_DS) : null;
    const gagnant = ev ? '0x' + BigInt('0x' + ev.data.slice(2 + 64 * 3, 2 + 64 * 4)).toString(16).padStart(40, '0') : null;
    const tx = e ? await rpc('eth_getTransactionByHash', [e.hash]) : null;
    const txOk = !!tx && tx.from.toLowerCase() === REG && tx.to.toLowerCase() === duels && tx.input === '0x' + sel('settle(uint256)') + mot(d.id) && BigInt(tx.value) === 0n && BigInt(tx.chainId) === 8453n;
    const bloc = e && e.rc ? parseInt(e.rc.blockNumber, 16) : null;
    const quand = !!e && (d.attendu === 'createur' ? e.tete >= d.cible + delai && e.tete + 1 < d.cible + 256 - marge : e.tete + 1 >= d.cible + 256 - marge);
    ok = ok && !!e && e.rc && e.rc.status === '0x1' && txOk && gagnant === (d.attendu === 'createur' ? JOUEUR : B1) && quand && bloc <= d.cible + 256 && (await statutDuel(d.id)) === 3;
    texte += ' envoye a +' + (e ? e.tete - d.cible : '?') + ', inclus a +' + (bloc !== null ? bloc - d.cible : '?');
  }
  vus[d.attendu] += 1;
  issues.push({ ok, texte });
}
/* les soldes : chaque duel regle paie 90 % au gagnant, 7 % au pot commun, le reste au dev ; le regleur ne touche rien */
const nC = lot.filter((d) => d.attendu === 'createur').length, nR = lot.filter((d) => d.attendu === 'rejoignant').length;
vu(vus.createur >= 1 && vus.rejoignant >= 1 && vus.egalite >= 1, 'les trois cas vus : ' + JSON.stringify(vus) + ' (marge de fin ' + marge + ' blocs, delai ' + delai + ')');
vu(issues.every((x) => x.ok) && autres.length === 0, lot.length + ' duels — vainqueur JS (faceDuHash) = contrat (faceOf) ; egalite jamais envoyee ; createur des cible + ' + delai + ', avant la marge de fin ; rejoignant seulement dans les ' + marge + ' derniers blocs ; settle(id) du regleur (value 0, chaine 8453), inclus dans la fenetre, Settled au bon gagnant : ' + issues.map((x) => (x.ok ? '' : 'KO ') + x.texte).join(' ; ') + (autres.length ? ' ; AUTRES ' + autres.join(',') : ''));
vu(ap.a - av.a === BigInt(nC) * w9 && ap.b - av.b === BigInt(nR) * w9 && ap.p - av.p === BigInt(nC + nR) * p7 && ap.d - av.d === BigInt(nC + nR) * dv && ap.k === av.k, 'soldes : createur +' + nC + ' x ' + Slots.usdcPrecis(w9) + ', rejoignant +' + nR + ' x ' + Slots.usdcPrecis(w9) + ', pot commun et dev leur part ; le regleur 0 USDC');
/* les egalites, jamais reglees par le regleur : apres la fenetre, refundExpired (par n importe qui) rend les deux mises — rien n est coince */
await rpc('anvil_mine', ['0x2']);
const avR = await soldes();
for (const d of lot.filter((x) => x.attendu === 'egalite')) await envoyer(B2, duels, '0x' + sel('refundExpired(uint256)') + mot(d.id));
const apR = await soldes(), nE = BigInt(vus.egalite);
const rendus = await Promise.all(lot.filter((x) => x.attendu === 'egalite').map((d) => statutDuel(d.id)));
vu(apR.a - avR.a === nE * STAKE && apR.b - avR.b === nE * STAKE && rendus.every((s) => s === 5), vus.egalite + ' egalite(s) : refundExpired rend les deux mises (Refunded) ; rien n est coince');

/* 5b. la course PERDUE, sur les vrais contrats (revue keeper 1) : un duel ou le createur gagne ; le regleur envoie son settle ; le createur
 *   envoie le sien avec un pourboire plus haut ; anvil (minage manuel, ordre par frais) met les deux dans le MEME bloc, le sien d abord :
 *   le settle du regleur est MINE et revert (NotJoined). Le regleur relit le duel (Settled) : explique, pas un echec, toujours ON. */
await rpc('anvil_mine', ['0x' + (300).toString(16)]); /* les duels de 5. sortent de leur fenetre */
let course = null;
for (let k = 20; k < 50 && !course; k++) { const d = await nouveauDuel(k); await rpc('anvil_mine', ['0x3']); await classer(d); if (d.attendu === 'createur') course = d; }
vu(!!course, 'un duel ou le createur gagne, pour la course (#' + (course && course.id) + ')');
const avantCourse = r2.etat();
await rpc('anvil_mine', ['0x' + (r2.etat().bornes.delaiDuelBlocs).toString(16)]);
/* minage manuel : le regleur envoie son settle (simule sur le dernier bloc : il passe) ; le createur envoie le sien juste apres avec un
 *   pourboire de 2 gwei (le regleur : 0,1 gwei au plus) ; un seul bloc les inclut, ordonnes par frais (anvil --order fees, le defaut ;
 *   mesure : la plus haute pointe d abord) — celui du createur d abord */
await rpc('evm_setAutomine', [false]);
let tK = null, hC = null;
try {
  tK = await r2.tour();
  hC = await rpc('eth_sendTransaction', [{ from: JOUEUR, to: duels, data: '0x' + sel('settle(uint256)') + mot(course.id), gas: '0x' + (400000).toString(16), maxPriorityFeePerGas: '0x' + (2n * 10n ** 9n).toString(16), maxFeePerGas: '0x' + (10n ** 10n).toString(16) }]);
  await rpc('anvil_mine', ['0x1']);
} finally { await rpc('evm_setAutomine', [true]); }
const rcK = tK && tK.fait ? await attendreRecu(tK.hash) : null, rcC = await attendreRecu(hC);
vu(tK.fait && tK.cible === 'duels' && tK.ids[0] === String(course.id) && rcK && rcC && rcK.status === '0x0' && rcC.status === '0x1' && rcK.blockNumber === rcC.blockNumber && parseInt(rcC.transactionIndex, 16) < parseInt(rcK.transactionIndex, 16),
  'course : le settle du createur (pourboire 2 gwei) passe d abord, celui du regleur est MINE dans le meme bloc et revert (regleur ' + JSON.stringify(tK && (tK.fait ? tK.cible + ' #' + tK.ids[0] + ' (course #' + course.id + ')' : tK.pourquoi)) + ', status ' + (rcK && rcK.status + ' idx ' + rcK.transactionIndex + ' bloc ' + rcK.blockNumber) + ' / ' + (rcC && rcC.status + ' idx ' + rcC.transactionIndex + ' bloc ' + rcC.blockNumber) + ')');
await r2.tour();
const apresCourse = r2.etat();
vu(apresCourse.etat === 'ON' && apresCourse.echecsSuite === 0 && apresCourse.compteurs.reverts === avantCourse.compteurs.reverts && apresCourse.compteurs.revertsExpliques === avantCourse.compteurs.revertsExpliques + 1 && apresCourse.contrats.duels.revertsExpliques >= 1,
  'le regleur relit le duel (Settled) : revert EXPLIQUE (' + apresCourse.compteurs.revertsExpliques + '), 0 echec, toujours ON');

/* 6. le pot du pass */
const today = async () => Number(BigInt(await rpc('eth_call', [{ to: rolls, data: '0x' + sel('today()') }, 'latest'])));
const dayPot = async (d) => { const m = (await rpc('eth_call', [{ to: rolls, data: '0x' + sel('dayPots(uint32)') + mot(BigInt(d)) }, 'latest'])).slice(2).match(/.{64}/g).map((x) => BigInt('0x' + x)); return { pot: m[0], t: Number(m[1]), etat: Number(m[2]) }; };
const acheter = async (j) => { await envoyer(j, usdc, '0x' + sel('approve(address,uint256)') + adr(rolls) + mot(10_000000n)); await envoyer(j, rolls, '0x' + sel('buyPass()')); };
const jourSuivant = async () => { const ts = Number(BigInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp)); await rpc('evm_setNextBlockTimestamp', ['0x' + ((Math.floor(ts / 86400) + 1) * 86400 + 5).toString(16)]); await rpc('anvil_mine', ['0x1']); };
const T_DD = topic('DayDrawn(uint32,address,bytes32,uint256,uint256)');
const tirage = (rc) => { const l = rc.logs.find((x) => x.address.toLowerCase() === rolls && x.topics[0] === T_DD); return l ? { gagnant: '0x' + l.topics[2].slice(26), hash: l.data.slice(2, 66), montant: BigInt('0x' + l.data.slice(66, 130)) } : null; };
const D0 = await today();
for (const j of [B1, B2, B3]) await acheter(j);
await jourSuivant();
for (const j of [B2, B4]) await acheter(j); /* jour D0 + 1 */
await jourSuivant();
await acheter(B3); await acheter(B1); /* jour D0 + 2 */
await jourSuivant();
vu((await today()) === D0 + 3, 'trois jours de pass : D0 (3 acheteurs), D0+1 (2), D0+2 (2) ; aujourd hui = D0 + 3');
/* D0 arme par un ACHETEUR (B2) qui se tait ; D0+2 arme puis laisse passer sa fenetre */
await envoyer(B2, rolls, '0x' + sel('closeDay(uint32)') + mot(BigInt(D0)));
await envoyer(B3, rolls, '0x' + sel('closeDay(uint32)') + mot(BigInt(D0 + 2)));
await rpc('anvil_mine', ['0x' + (300).toString(16)]); /* D0+2 : fenetre passee (> 256) ; D0 aussi : il faut le re-armer */
/* D0 : on le re-arme a la main pour qu il soit DANS sa fenetre au tour du regleur (l acheteur qui ferme et se tait) */
await envoyer(B2, rolls, '0x' + sel('closeDay(uint32)') + mot(BigInt(D0)));
await rpc('anvil_mine', ['0x3']);
const avantR = Object.fromEntries(await Promise.all([B1, B2, B3, B4].map(async (j) => [j, await solde(usdc, j)])));
const fr = (await tours(10)).filter((f) => f.cible === 'rolls');
const suite = fr.map((f) => f.quoi + '(' + f.ids[0] + ')');
vu(pasDeTx(fr) && suite[0] === 'drawDay(' + D0 + ')', 'le regleur tire D0 (arme par un acheteur qui se tait) en premier : ' + suite.join(', '));
vu(suite.includes('closeDay(' + (D0 + 1) + ')') && suite.includes('drawDay(' + (D0 + 1) + ')') && suite.indexOf('closeDay(' + (D0 + 1) + ')') < suite.indexOf('drawDay(' + (D0 + 1) + ')'), 'D0+1 jamais ferme : closeDay puis drawDay');
vu(suite.includes('closeDay(' + (D0 + 2) + ')') && suite.includes('drawDay(' + (D0 + 2) + ')'), 'D0+2 arme, fenetre passee : re-arme (closeDay) puis drawDay');
vu(!suite.some((s) => s.endsWith('(' + (D0 + 3) + ')')), 'aujourd hui (D0+3) jamais ferme');
const etats = await Promise.all([D0, D0 + 1, D0 + 2].map(dayPot));
vu(etats.every((e) => e.etat === 2 && e.pot === 0n), 'les trois jours sont Drawn, pots a 0');
/* chaque gagnant = buyers[hash % n], recalcule depuis le hash de l evenement et la liste du contrat */
let justes = 0, recu = new Map();
for (const f of fr.filter((x) => x.quoi === 'drawDay')) {
  const tr = tirage(f.rc), d = Number(f.ids[0]);
  const lst = (await rpc('eth_call', [{ to: rolls, data: '0x' + sel('buyersOf(uint32)') + mot(BigInt(d)) }, 'latest'])).slice(2).match(/.{64}/g).slice(2).map((x) => '0x' + x.slice(24));
  if (tr && lst[Number(BigInt('0x' + tr.hash) % BigInt(lst.length))] === tr.gagnant.toLowerCase() && tr.montant === BigInt(lst.length) * 5_000000n) justes += 1;
  recu.set(tr.gagnant.toLowerCase(), (recu.get(tr.gagnant.toLowerCase()) || 0n) + tr.montant);
}
vu(justes === 3, '3 tirages : gagnant = buyers[hash % n], montant = n x 5 USDC (la moitie du pass) — recalcules');
const apresR = Object.fromEntries(await Promise.all([B1, B2, B3, B4].map(async (j) => [j, await solde(usdc, j)])));
vu([B1, B2, B3, B4].every((j) => apresR[j] - avantR[j] === (recu.get(j) || 0n)) && (await solde(usdc, REG)) === 0n, 'chaque gagnant touche son pot ; le regleur ne touche aucun USDC');
const e2 = r2.etat();
vu(e2.contrats.duels.inclus >= 1 && e2.contrats.rolls.inclus === fr.length && e2.echecsSuite === 0 && e2.etat === 'ON', 'etat par contrat : duels ' + e2.contrats.duels.inclus + ' tx, rolls ' + e2.contrats.rolls.inclus + ' tx, 0 echec, ON');
vu(!JSON.stringify(e2).includes('0'.repeat(63) + '1') && !journal.join('\n').includes('0'.repeat(63) + '1'), 'la cle n est ni dans etat() ni dans le journal (duels, rolls)');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS Base');
process.exit(ko ? 1 : 0);
