/* banc-slots-regleur-anvil-20261023.mjs — LE REGLEUR DES SLOTS DE BOUT EN BOUT sur un anvil LOCAL (aucun reseau), avec BlockSlots COMPILE.
 * Usage : (dans contracts/) forge build ; anvil --port P --chain-id 8453 ; node banc-slots-regleur-anvil-20261023.mjs P
 * Cles : les comptes anvil par defaut (deverrouilles par anvil) pour le decor ; la cle de TEST publique 0x…01 pour le regleur (son
 *   adresse recoit de l ETH local par anvil_setBalance). Rien ne touche Base. --chain-id 8453 : la garde de chaine du regleur passe.
 * DEROULE (vraies transactions, vrai contrat v4, vraies lectures du regleur — creerRegleur + le vrai lecteur JSON-RPC) :
 *   1. USDC de test (UsdcS du banc forge) + BlockSlots (la table de slots-parametres.json) ; le pot finance ; le joueur fait 4 spins ;
 *   2. un 5e spin, d un autre joueur, laisse PERDRE (260 blocs) : le regleur ne l envoie jamais ;
 *   3. le regleur (tour()) envoie UNE tx brute EIP-1559 (tx-eip1559.js) : from = l adresse de la cle, to = le contrat, settleMany(ids) ;
 *      le noeud l accepte et l inclut ; chaque spin reglable est Settled ; chaque joueur touche EXACTEMENT les prix de ses spins ;
 *      le regleur ne touche aucun USDC et ne paie que du gas ; un 2e tour lit le recu (dernierRegle) ;
 *   4. payDev : le dev touche la part de TOUS les spins (le perdu compris) ; solde du contrat = pot (rien de coince).
 *   2026-10-24 (audit rolls-duels) — LE MEME regleur, la MEME cle, avec BlockDuels et BlockRolls COMPILES :
 *   5. un duel USDC cree puis rejoint ; le joueur qui a rejoint se TAIT : le regleur envoie settle(id) dans la fenetre ; le gagnant (ou
 *      les deux, egalite) est paye selon le contrat (90 % / 7 % / reste, ou les mises rendues) ; le regleur ne touche rien ;
 *   6. le pot du pass : jour D arme par un acheteur qui se tait -> le regleur tire (drawDay) ; jour D+1 jamais ferme -> closeDay puis
 *      drawDay ; jour D+2 arme puis fenetre passee -> closeDay (re-arme) puis drawDay ; chaque pot va a buyers[hash % n] (recalcule).
 * NE PROUVE PAS : Base (sequenceur, prix du gas reel, noeuds publics) ; les contrats deployes sur Base ne sont pas touches. */
import { readFileSync } from 'node:fs';
import { creerRegleur } from './slots-regleur.js';
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
const [DEP, JOUEUR, AUTRE, DEV] = (await rpc('eth_accounts')).map((x) => x.toLowerCase());
const CLE = '0x' + '0'.repeat(63) + '1';
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
const comptes = (await rpc('eth_accounts')).map((x) => x.toLowerCase());
const [B1, B2, B3, B4, POOL] = comptes.slice(4, 9);
for (const j of [B1, B2, B3, B4]) await envoyer(DEP, usdc, '0x' + sel('mint(address,uint256)') + adr(j) + mot(1000_000000n));
const BD = art('BlockDuels.sol', 'BlockDuels'), BRo = art('BlockRolls.sol', 'BlockRolls');
const rD = await envoyer(DEP, null, BD.bytecode.object + adr(usdc) + adr(DEV) + adr(POOL) + adr(DEP));
const duels = rD.contractAddress.toLowerCase(), blocDuels = parseInt(rD.blockNumber, 16);
/* BlockRolls : Config a plat (14 mots) ; le « hook » doit avoir du code : l USDC de test (createurs() illisible -> createur 0, sans effet ici) */
const cfgR = [adr(usdc), adr(DEV), adr(usdc), mot(1n), mot(500000n), mot(10_000000n), mot(10n), mot(3600n), mot(5000n), mot(5_000000n), mot(3_000000n), mot(1_000000n), mot(500000n), mot(2n)].join('');
const rR = await envoyer(DEP, null, BRo.bytecode.object + cfgR);
const rolls = rR.contractAddress.toLowerCase();
vu(BigInt(await rpc('eth_getCode', [duels, 'latest']).then((c) => c.length)) > 2n && BigInt(await rpc('eth_getCode', [rolls, 'latest']).then((c) => c.length)) > 2n, 'BlockDuels et BlockRolls deployes en local');
const r2 = creerRegleur({ cle: CLE, contrat, chainId: 8453, table: P.prizes, blocDeploiement: blocDep, rpc, journal: (x) => journal.push(x), duels: { contrat: duels, bloc: blocDuels }, rolls: { contrat: rolls } });
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
/* 5. des duels : JOUEUR cree, B1 rejoint (et se tait) ; jusqu a 8 duels, tant qu aucun n a de gagnant (une egalite est frequente) */
const STAKE = 2_000000n;
const T_DS = topic('Settled(uint256,bytes32,uint8,uint8,address,uint256)');
const pot2 = 2n * STAKE, w9 = (pot2 * 9000n) / 10000n, p7 = (pot2 * 700n) / 10000n, dv = pot2 - w9 - p7;
const issues = [];
for (let id = 1n; id <= 8n && !issues.some((x) => x.decisif); id++) {
  const gA = [0, 1, 2, 3, 4].map(mot).join(''), gB = [Number(id) % 6, (Number(id) * 3) % 10, (Number(id) * 7) % 19, (Number(id) * 5) % 9, (Number(id) * 3) % 8].map(mot).join('');
  await envoyer(JOUEUR, usdc, '0x' + sel('approve(address,uint256)') + adr(duels) + mot(STAKE));
  await envoyer(JOUEUR, duels, '0x' + sel('create(address,uint256,uint8[5],uint64)') + adr(usdc) + mot(STAKE) + gA + mot(3600n));
  await envoyer(B1, usdc, '0x' + sel('approve(address,uint256)') + adr(duels) + mot(STAKE));
  const rJ = await envoyer(B1, duels, '0x' + sel('join(uint256,uint8[5])') + mot(id) + gB);
  const cible = parseInt(rJ.blockNumber, 16) + 2;
  const av = { a: await solde(usdc, JOUEUR), b: await solde(usdc, B1), p: await solde(usdc, POOL), d: await solde(usdc, DEV), k: await solde(usdc, REG) };
  await rpc('anvil_mine', ['0x3']);
  const f = (await tours(2)).filter((x) => x.cible === 'duels');
  const tx = f[0] ? await rpc('eth_getTransactionByHash', [f[0].hash]) : null;
  const ev = f[0] && f[0].rc ? f[0].rc.logs.find((l) => l.address.toLowerCase() === duels && l.topics[0] === T_DS) : null;
  const m = ev ? ev.data.slice(2).match(/.{64}/g).map((x) => BigInt('0x' + x)) : [];
  const [sA, sB, gagnant] = [Number(m[1]), Number(m[2]), '0x' + (m[3] || 0n).toString(16).padStart(40, '0')];
  const ap = { a: await solde(usdc, JOUEUR), b: await solde(usdc, B1), p: await solde(usdc, POOL), d: await solde(usdc, DEV), k: await solde(usdc, REG) };
  const paye = sA === sB ? ap.a - av.a === STAKE && ap.b - av.b === STAKE && ap.p === av.p && ap.d === av.d
    : (gagnant === JOUEUR ? ap.a - av.a === w9 && ap.b === av.b : ap.b - av.b === w9 && ap.a === av.a) && ap.p - av.p === p7 && ap.d - av.d === dv;
  const st = BigInt('0x' + (await rpc('eth_call', [{ to: duels, data: '0x' + sel('duels(uint256)') + mot(id) }, 'latest'])).slice(2 + 64 * 2, 2 + 64 * 3));
  issues.push({ id, decisif: !!ev && sA !== sB, ok: f.length === 1 && pasDeTx(f) && JSON.stringify(f[0].ids) === JSON.stringify([String(id)]) && tx.from.toLowerCase() === REG && tx.to.toLowerCase() === duels
    && tx.input === '0x' + sel('settle(uint256)') + mot(id) && BigInt(tx.value) === 0n && BigInt(tx.chainId) === 8453n && !!ev && paye && ap.k === av.k && st === 3n && parseInt(f[0].rc.blockNumber, 16) <= cible + 256,
    texte: 'duel #' + id + ' ' + sA + '/' + sB + (sA === sB ? ' egalite' : ' -> ' + (gagnant === JOUEUR ? 'createur' : 'rejoint')) });
}
vu(issues.length >= 1 && issues.every((x) => x.ok), issues.length + ' duel(s), chacun : settle(id) par le regleur (from = le regleur, to = BlockDuels, value 0, chaine 8453), inclus DANS sa fenetre, Settled ; paye selon le contrat (90 % / 7 % / reste, ou mises rendues) ; le regleur ne touche aucun USDC : ' + issues.map((x) => x.texte).join(', '));
vu(issues.some((x) => x.decisif), 'au moins un duel a un gagnant : ' + Slots.usdcPrecis(w9) + ' au gagnant, ' + Slots.usdcPrecis(p7) + ' au pot commun, ' + Slots.usdcPrecis(dv) + ' au dev');

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
