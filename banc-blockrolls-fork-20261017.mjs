/* banc-blockrolls-fork-20261017.mjs — BlockRolls DEPLOYE SUR UN FORK DE BASE, CONTRE LE VRAI USDC (proxy, 6 decimales) ET LE VRAI HOOK 7030.
 * Usage : (cd contracts && forge build) ; "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://mainnet.base.org --port 9619
 *         puis node banc-blockrolls-fork-20261017.mjs [http://127.0.0.1:9619]
 * DEROULE (vraies transactions sur le fork, comptes IMPERSONNES, aucune cle, rien n est envoye a Base) :
 *   1. le createur de UNIT est LU au vrai hook (createurs(poolId UNIT/ETH)) ; deploiement (USDC reel, DEV_WALLET = wallet des frais,
 *      regles par defaut : 5 / 3 / 1 / 0,50 USDC pour 5 / 4 / 3 / 2 traits) ; unitCreator() du contrat = ce que le hook dit ;
 *   2. de l USDC reel est pris a une pool du fork (transfert impersonne) pour un donateur et trois joueurs ;
 *   3. fund 50 (planFund), roll paye (planRoll) -> split 0,25 / 0,25 lu sur les SOLDES ; settle trop tot = status 0 ;
 *   3b. setRules : refuse a la joueuse et au deployeur, accepte au createur IMPERSONNE ; le roll d avant garde sa version ;
 *   4. settle du roll paye par un TIERS -> face de l evenement = traitsDepuisHash(hash REEL du bloc cible) ;
 *   5. trois pass le meme jour UTC (planPass) : 3 x 5 au pot du JOUR, 3 x 5 au DEV ; 30 rolls de pass (planRollsAvecPass) dans UN bloc,
 *      puis le bloc cible est MOULU (snapshot / evm_mine a des horodatages differents) jusqu a un 5/5 -- ce que peut faire qui
 *      produit le bloc ; le nombre d essais est publie ;
 *   6. settleMany des 30 + un id inexistant en UNE tx : gains = min(5, pot restant) dans l ordre, soldes lus ;
 *   7. le jour avance (evm_increaseTime 86400) : closeDay refuse avant minuit UTC, puis arme ; drawDay paie TOUT le pot du jour a
 *      buyers[hash % 3], lu sur les soldes ; un second tirage est refuse.
 * NE PROUVE PAS : un vrai wallet, l interface, le deploiement reel (Phil seul signe), ni le comportement du VRAI sequenceur. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as F from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { selecteur } from './keccak.js';
import * as P from './blockrolls-plan.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9619';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exit(1); }
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpc = async (method, params = []) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + r.error.message);
  return r.result;
};
const USDC = F.USDC_BASE.toLowerCase(), DEV = F.FEE_WALLET.toLowerCase();
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const lire = (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const lireU = async (to, sig, args = '') => BigInt(await lire(to, sig, args));
const solde = (qui) => lireU(USDC, 'balanceOf(address)', adrMot(qui));
const usd = (x) => (Number(x) / 1e6).toFixed(6);
async function recu(h) {
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
const poser = (de, tx, gas = 600000) => rpc('eth_sendTransaction', [{ from: de, ...(tx.to ? { to: tx.to } : {}), data: tx.data || '0x', gas: hex(gas) }]);
const envoyer = async (de, tx, gas) => recu(await poser(de, tx, gas));
const compte = async (a) => { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, hex(10n ** 18n)]); return a; };

const chaine = parseInt(await rpc('eth_chainId'), 16), tete = parseInt(await rpc('eth_blockNumber'), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base (sinon ce banc ne prouve rien)')) process.exit(1);
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'contracts/out/BlockRolls.sol/BlockRolls.json'), 'utf8'));
const D = P.DEFAUTS;

/* 1. le VRAI hook 7030 du fork et la pool UNIT/ETH : le createur de UNIT y est LU, puis impersonne (fork seulement) */
const codeHook = await rpc('eth_getCode', [P.HOOK, 'latest']);
ok(codeHook.length > 1000, 'le fork porte le hook 7030 ' + P.HOOK + ' (' + (codeHook.length - 2) / 2 + ' octets)');
const CREATEUR = ('0x' + String(await lire(P.HOOK, 'createurs(bytes32)', P.UNIT_POOL_ID.slice(2))).slice(26, 66)).toLowerCase();
ok(/^0x[0-9a-f]{40}$/.test(CREATEUR) && !/^0x0{40}$/.test(CREATEUR), 'createur de UNIT/ETH LU au hook : ' + CREATEUR);
/* Config statique = 13 mots a plat (test-blockrolls-plan verifie l ordre contre l ABI) */
const args = [adrMot(USDC), adrMot(DEV), adrMot(P.HOOK), P.UNIT_POOL_ID.slice(2), mot(D.rollPrice), mot(D.passPrice), mot(D.passRolls), mot(D.passWindowS), mot(D.potShareBps), mot(D.prize5), mot(D.prize4), mot(D.prize3), mot(D.prize2), mot(D.minScore)].join('');

const deployeur = await compte('0x00000000000000000000000000000000de9107e4');
const donateur = await compte('0x000000000000000000000000000000000000d0e0');
const alice = await compte('0x00000000000000000000000000000000000a11ce');
const bob = await compte('0x0000000000000000000000000000000000000b0b');
const carol = await compte('0x000000000000000000000000000000000000ca01');
const d = await envoyer(deployeur, { data: art.bytecode.object + args }, 3_000_000);
if (!ok(d.status === '0x1', 'BlockRolls se deploie (gaz ' + BigInt(d.gasUsed) + ', runtime ' + ((await rpc('eth_getCode', [d.contractAddress, 'latest'])).length - 2) / 2 + ' octets)')) process.exit(1);
const C = d.contractAddress.toLowerCase();
ok(('0x' + String(await lire(C, 'unitCreator()')).slice(26, 66)).toLowerCase() === CREATEUR, 'unitCreator() du contrat = le createur LU au vrai hook');
const lireRegles = async () => String(await lire(C, 'currentRules()')).slice(2).match(/.{64}/g).map((w) => BigInt('0x' + w));
ok(JSON.stringify((await lireRegles()).map(String)) === JSON.stringify(['5000000', '3000000', '1000000', '500000', '2']), 'regles par defaut (Phil 12:20) : 5 / 3 / 1 / 0,50 USDC pour 5 / 4 / 3 / 2 traits ; minScore 2');

/* 2. USDC reel depuis une pool du fork */
const pools = [...POOLS_ACTIONS_AERODROME.values()].map((t) => t.pool).filter(Boolean);
let source = null;
for (const p of pools) { if ((await solde(p)) >= 400_000_000n) { source = p.toLowerCase(); break; } }
if (!ok(!!source, 'une pool du fork tient >= 400 USDC reels (source ' + source + ')')) process.exit(1);
await compte(source);
for (const [qui, m] of [[donateur, 60_000_000n], [alice, 100_000_000n], [bob, 20_000_000n], [carol, 20_000_000n]]) {
  const r = await envoyer(source, { to: USDC, data: selecteur('transfer(address,uint256)') + adrMot(qui) + mot(m) });
  ok(r.status === '0x1', 'USDC reel transfere : ' + usd(m) + ' a ' + qui.slice(0, 10) + '…');
}
const dev0 = await solde(DEV), alice0 = await solde(alice), donateur0 = await solde(donateur);

/* 3. fund + roll paye */
for (const a of P.planFund({ contrat: C, usdc: USDC, montant: 50_000_000n }).appels) ok((await envoyer(donateur, a)).status === '0x1', 'fund : ' + a.quoi);
ok((await lireU(C, 'pot()')) === 50_000_000n, 'pot des rolls = 50 USDC apres fund');
const guess1 = [2, 3, 4, 5, 6];
const pr = P.planRoll({ contrat: C, usdc: USDC, guess: guess1 });
const a0 = await solde(alice);
await envoyer(alice, pr.appels[0]);
const rr = await envoyer(alice, pr.appels[1]);
const R1 = P.lireRolled(rr.logs, C);
ok(rr.status === '0x1' && R1 && R1.guess.join() === guess1.join() && R1.targetBlock === BigInt(rr.blockNumber) + 2n, 'roll paye (gaz ' + BigInt(rr.gasUsed) + ') ; cible = bloc du roll + 2 = ' + R1?.targetBlock);
ok(a0 - (await solde(alice)) === 500_000n && (await solde(DEV)) - dev0 === 250_000n && (await lireU(C, 'pot()')) === 50_250_000n,
  'split lu sur les soldes : joueuse -0,50, DEV_WALLET +0,25, pot +0,25');
ok(P.planSettle({ contrat: C, rollId: R1.rollId, targetBlock: R1.targetBlock, blocActuel: BigInt(rr.blockNumber) }).etat === 'REFUSE', 'planSettle refuse avant la cible');
const tot = await envoyer(alice, P.planSettle({ contrat: C, rollId: R1.rollId }).appels[0]);
ok(tot.status === '0x0', 'settle envoye trop tot : status 0 (TooEarly)');

/* 3b. les regles : seul le createur de UNIT (impersonne) ; le roll d avant garde sa version */
const versionDe = async (id) => Number(BigInt('0x' + String(await lire(C, 'rolls(uint256)', mot(id))).slice(2).match(/.{64}/g)[4]));
const sr = P.planSetRules({ contrat: C, prize5: 20_000_000n, prize4: 2_000_000n, prize3: 1_000_000n, prize2: 1_000_000n, minScore: 4 }).appels[0];
ok((await envoyer(alice, sr)).status === '0x0' && (await envoyer(deployeur, sr)).status === '0x0', 'setRules par la joueuse / par le deployeur : status 0 (NotCreator)');
await compte(CREATEUR);
const rsr = await envoyer(CREATEUR, sr);
ok(rsr.status === '0x1' && JSON.stringify((await lireRegles()).map(String)) === JSON.stringify(['20000000', '2000000', '1000000', '1000000', '4']), 'setRules par le createur de UNIT (impersonne) : 20 / 2 / 1 / 1 USDC, minScore 4 (gaz ' + BigInt(rsr.gasUsed) + ')');
ok(P.planSetRules({ contrat: C, prize5: 1_000_000_001n, prize4: 0, prize3: 0, prize2: 0, minScore: 3 }).etat === 'REFUSE'
  && (await envoyer(CREATEUR, { to: C, data: selecteur('setRules(uint64,uint64,uint64,uint64,uint8)') + mot(1_000_000_001n) + mot(0) + mot(0) + mot(0) + mot(3) })).status === '0x0', 'prix > 1000 USDC : refuse par le plan ET par le contrat (BadRules)');
const pr2 = P.planRoll({ contrat: C, usdc: USDC, guess: guess1 });
await envoyer(donateur, pr2.appels[0]);
const R2 = P.lireRolled((await envoyer(donateur, pr2.appels[1])).logs, C);
ok(R2 && (await versionDe(R1.rollId)) === 1 && (await versionDe(R2.rollId)) === 2, 'le roll d AVANT garde la version 1 des regles, celui d APRES porte la version 2');
ok((await envoyer(CREATEUR, P.planSetRules({ contrat: C, ...D }).appels[0])).status === '0x1' && String((await lireRegles())[4]) === '2', 'regles remises aux defauts (version 3) pour la suite du banc');

/* 4. settle du roll paye + parite sur le hash REEL */
await rpc('anvil_mine', ['0x2']);
const s1 = await envoyer(donateur, P.planSettle({ contrat: C, rollId: R1.rollId }).appels[0]);
const S1 = P.lireSettled(s1.logs, C);
const blocCible = await rpc('eth_getBlockByNumber', [hex(R1.targetBlock), false]);
ok(s1.status === '0x1' && S1 && S1.blockHash === blocCible.hash.toLowerCase(), 'settle (par un TIERS, gaz ' + BigInt(s1.gasUsed) + ') : blockhash on-chain = hash du bloc ' + R1.targetBlock + ' lu par RPC');
ok(JSON.stringify(S1.face) === JSON.stringify(P.traitsDepuisHash(blocCible.hash)), 'PARITE sur hash reel : face on-chain ' + JSON.stringify(S1.face) + ' = face-du-jour.js');
ok(S1.score === P.scoreTraits(guess1, S1.face) && S1.payout === P.gainPrevu(S1.potAfter + S1.payout, S1.score), 'score ' + S1.score + ', gain ' + usd(S1.payout) + ' = gainPrevu (regles v1)');

/* 5. trois pass le meme jour, 30 rolls de pass dans un bloc, puis le bloc cible MOULU */
const tsNow = parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
const JOUR = P.jourDe(tsNow);
const dayPot = async (j) => BigInt('0x' + String(await lire(C, 'dayPots(uint32)', mot(j))).slice(2, 66));
const devAvantPass = await solde(DEV);
let PB = null;
for (const qui of [alice, bob, carol]) {
  const pp = P.planPass({ contrat: C, usdc: USDC }).appels;
  await envoyer(qui, pp[0]);
  const r = await envoyer(qui, pp[1]);
  const pb = P.lirePassBought(r.logs, C);
  if (qui === alice) PB = pb;
  ok(r.status === '0x1' && pb && pb.player === qui && pb.day === JOUR, 'pass de ' + qui.slice(0, 10) + '… : PassBought porte le jour ' + pb?.day + ' (gaz ' + BigInt(r.gasUsed) + ')');
}
ok((await dayPot(JOUR)) === 15_000_000n && (await solde(DEV)) - devAvantPass === 15_000_000n && (await lireU(C, 'pot()')) === 50_250_000n - S1.payout + 250_000n,
  'pot du JOUR = 15 (3 x 5), DEV +15, le pot des ROLLS n a pas bouge');
ok((await lireU(C, 'buyerCount(uint32)', mot(JOUR))) === 3n, '3 acheteurs du jour, un par wallet');
await rpc('evm_setAutomine', [false]);
const guesses = [];
let graine = 7n;
for (let i = 0; i < 30; i++) { const g = P.TAILLES.map((t) => { graine = (graine * 6364136223846793005n + 1442695040888963407n) % (1n << 64n); return Number((graine >> 33n) % BigInt(t)); }); guesses.push(g); }
const lot = P.planRollsAvecPass({ contrat: C, guesses, pass: { rollsLeft: PB.rollsLeft, expiresAt: PB.expiresAt }, maintenant: tsNow });
ok(lot.etat === 'PRET' && lot.appels.length === 30, 'planRollsAvecPass : 30 appels pour UN wallet_sendCalls (le brain auto-roll)');
const hs = [];
for (const a of lot.appels) hs.push(await poser(alice, a, 200000));
await rpc('evm_mine', []);
await rpc('evm_setAutomine', [true]);
const recus = await Promise.all(hs.map(recu));
const blocs = new Set(recus.map((r) => r.blockNumber));
const Rs = recus.map((r) => P.lireRolled(r.logs, C));
ok(recus.every((r) => r.status === '0x1') && blocs.size === 1 && Rs.every((x) => x && x.withPass), '30 rolls de pass dans UN bloc (gaz moyen ' + recus.reduce((s, r) => s + BigInt(r.gasUsed), 0n) / 30n + ')');
const cible = Rs[0].targetBlock;
await rpc('evm_mine', []); /* cible - 1 */
const tsBase = parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
let essais = 0, meilleur = -1, gagnant = -1;
for (let k = 1; k <= 30000; k++) {
  const snap = await rpc('evm_snapshot');
  await rpc('evm_mine', [tsBase + k]);
  essais = k;
  const h = (await rpc('eth_getBlockByNumber', [hex(cible), false])).hash;
  const face = P.traitsDepuisHash(h);
  const scores = guesses.map((g) => P.scoreTraits(g, face));
  meilleur = Math.max(...scores);
  if (meilleur === 5) { gagnant = scores.indexOf(meilleur); break; }
  await rpc('evm_revert', [snap]);
}
ok(gagnant >= 0, 'bloc cible MOULU : un score ' + meilleur + '/5 atteint en ' + essais + ' essai(s) d horodatage (ce que peut faire qui produit le bloc)');

/* 6. settleMany : les 30 + R2 (encore en attente, version 2 : minScore 4) + un id inexistant, en UNE tx */
const potAvant = await lireU(C, 'pot()');
const aAvant = await solde(alice);
const ids = [...Rs.map((R) => R.rollId), R2.rollId, 999999n];
const sm = await envoyer(donateur, P.planSettleMany({ contrat: C, rollIds: ids }).appels[0], 5_000_000);
const Ss = P.lireSettledTous(sm.logs, C);
ok(sm.status === '0x1' && Ss.length === 31, 'settleMany(32 ids) par un TIERS : ' + Ss.length + ' Settled, l id inexistant SAUTE sans revert (gaz ' + BigInt(sm.gasUsed) + ', ' + BigInt(sm.gasUsed) / BigInt(Ss.length || 1) + ' par roll)');
const paye = Ss.filter((S) => S.player === alice).reduce((s, S) => s + S.payout, 0n);
const payeTous = Ss.reduce((s, S) => s + S.payout, 0n);
const p5s = Ss.filter((S) => S.score === 5 && S.rollId !== R2.rollId);
ok(p5s.length >= 1 && p5s.every((S) => S.payout === 5_000_000n), 'le 5/5 (roll #' + p5s[0]?.rollId + ') paie 5 USDC FIXES, pas une part du pot (pot ' + usd(potAvant) + ')');
const potApres = await lireU(C, 'pot()');
ok(paye > 0n && (await solde(alice)) - aAvant === paye && potAvant - potApres === payeTous, 'gains en USDC REEL : joueuse +' + usd(paye) + ' (lu sur les soldes), pot ' + usd(potAvant) + ' -> ' + usd(potApres));
let potCourant = potAvant, ordreOk = true;
for (const S of Ss) {
  const cfg = S.rollId === R2.rollId ? { ...D, prize5: 20_000_000n, prize4: 2_000_000n, prize3: 1_000_000n, prize2: 1_000_000n, minScore: 4 } : D;
  if (S.payout !== P.gainPrevu(potCourant, S.score, cfg)) ordreOk = false;
  potCourant -= S.payout;
}
ok(ordreOk && potCourant === potApres, 'chaque gain = min(prix de SA version, pot RESTANT) dans l ordre des settles (' + Ss.filter((S) => S.payout > 0n).length + ' gagnant(s))');

/* 7. le tirage du jour */
const cd = P.planCloseDay({ contrat: C, day: JOUR, maintenant: tsNow });
ok(cd.etat === 'REFUSE' && (await envoyer(donateur, { to: C, data: selecteur('closeDay(uint32)') + mot(JOUR) })).status === '0x0', 'closeDay avant minuit UTC : refuse par le plan ET par le contrat (DayNotOver)');
await rpc('evm_increaseTime', [86400]);
await rpc('evm_mine', []);
const tsLendemain = parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
const rcd = await envoyer(donateur, P.planCloseDay({ contrat: C, day: JOUR, maintenant: tsLendemain }).appels[0]);
const cibleJour = BigInt(rcd.blockNumber) + 2n;
ok(rcd.status === '0x1', 'closeDay(' + JOUR + ') par un tiers le lendemain : arme, cible = ' + cibleJour + ' (gaz ' + BigInt(rcd.gasUsed) + ')');
ok((await envoyer(donateur, { to: C, data: selecteur('closeDay(uint32)') + mot(JOUR) })).status === '0x0', 're-armer pendant la fenetre : refuse (StillSettleable)');
await rpc('anvil_mine', ['0x2']);
const acheteurs = [alice, bob, carol];
const soldesAvant = Object.fromEntries(await Promise.all(acheteurs.map(async (a) => [a, await solde(a)])));
const rdd = await envoyer(deployeur, P.planDrawDay({ contrat: C, day: JOUR }).appels[0]);
const DD = P.lireDayDrawn(rdd.logs, C);
const hashJour = (await rpc('eth_getBlockByNumber', [hex(cibleJour), false])).hash.toLowerCase();
ok(rdd.status === '0x1' && DD && DD.blockHash === hashJour && DD.winner === acheteurs[Number(BigInt(hashJour) % 3n)],
  'drawDay par un tiers (gaz ' + BigInt(rdd.gasUsed) + ') : gagnant = buyers[hash % 3] = ' + DD?.winner?.slice(0, 10) + '…');
ok(DD && DD.amount === 15_000_000n && (await solde(DD.winner)) - soldesAvant[DD.winner] === 15_000_000n && (await dayPot(JOUR)) === 0n,
  'TOUT le pot du jour (15 USDC reels) au gagnant, lu sur son solde ; pot du jour = 0');
ok((await envoyer(deployeur, P.planDrawDay({ contrat: C, day: JOUR }).appels[0])).status === '0x0' && (await envoyer(deployeur, { to: C, data: selecteur('closeDay(uint32)') + mot(JOUR) })).status === '0x0', 'second tirage / nouvelle fermeture : refuses (DayNotArmed / DayDone)');
ok((await solde(C)) === potApres, 'balanceOf(contrat) = pot des rolls (' + usd(potApres) + ') : rien d autre n est retenu');
console.log('deltas USDC : joueuse ' + usd((await solde(alice)) - alice0) + ' · donateur ' + usd((await solde(donateur)) - donateur0) + ' · DEV_WALLET +' + usd((await solde(DEV)) - dev0) + ' · contrat ' + usd(await solde(C)));
console.log((ko ? 'ECHEC ' : 'ok ') + 'banc-blockrolls-fork - ' + n + ' assertions, ' + ko + ' KO ; fork Base, comptes impersonnes, rien de signe');
process.exit(ko ? 1 : 0);
