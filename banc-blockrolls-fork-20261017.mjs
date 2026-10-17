/* banc-blockrolls-fork-20261017.mjs — BlockRolls DEPLOYE SUR UN FORK DE BASE, CONTRE LE VRAI USDC (proxy, 6 decimales).
 * Usage : (cd contracts && forge build) ; "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://mainnet.base.org --port 9618
 *         puis node banc-blockrolls-fork-20261017.mjs [http://127.0.0.1:9618]
 * DEROULE (vraies transactions sur le fork, comptes IMPERSONNES, aucune cle, rien n est envoye a Base) :
 *   1. deploie le bytecode compile (USDC reel, DEV_WALLET = le wallet des frais du depot, prix par defaut) ;
 *   2. de l USDC reel est pris a une pool du fork (transfert impersonne) pour un donateur et une joueuse ;
 *   3. fund 50 USDC (planFund), roll paye (planRoll : approve EXACT + roll) -> split 0,25 / 0,25 lu sur les SOLDES ;
 *   4. settle du roll paye -> la face de l evenement Settled = traitsDepuisHash(hash REEL du bloc cible lu par eth_getBlockByNumber) ;
 *   5. pass (planPass) + 30 rolls de pass dans UN bloc (automine coupe), puis on « MOUD » le bloc cible : snapshot, evm_mine a des
 *      horodatages differents, jusqu a ce qu une des 30 faces devinees fasse 5/5 (P5 : 1 chance sur ~82 000 par roll, ~2 700 essais attendus pour 30 rolls) — CE QUE PEUT FAIRE QUI PRODUIT LE BLOC (le
 *      sequenceur). Le nombre d essais est publie : c est la mesure du risque, pas une demo de gain ;
 *   6. settle de tous les rolls : le gagnant recoit sa part du pot en USDC reel, lu sur les soldes ; pot <= balanceOf(contrat).
 * NE PROUVE PAS : un vrai wallet, l interface, le deploiement reel (Phil seul signe), ni le comportement du VRAI sequenceur. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as F from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { selecteur } from './keccak.js';
import * as P from './blockrolls-plan.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9618';
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
const lireU = async (to, data) => BigInt(await rpc('eth_call', [{ to, data }, 'latest']));
const solde = (qui) => lireU(USDC, selecteur('balanceOf(address)') + adrMot(qui));
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
const args = [adrMot(USDC), adrMot(DEV), mot(D.rollPrice), mot(D.passPrice), mot(D.passRolls), mot(D.passWindowS), mot(D.potShareBps), mot(D.p5Bps), mot(D.p4Bps), mot(D.p3Bps)].join('');

const deployeur = await compte('0x00000000000000000000000000000000de9107e4');
const donateur = await compte('0x000000000000000000000000000000000000d0e0');
const alice = await compte('0x00000000000000000000000000000000000a11ce');
const d = await envoyer(deployeur, { data: art.bytecode.object + args }, 3_000_000);
if (!ok(d.status === '0x1', 'BlockRolls se deploie (gaz ' + BigInt(d.gasUsed) + ', runtime ' + ((await rpc('eth_getCode', [d.contractAddress, 'latest'])).length - 2) / 2 + ' octets)')) process.exit(1);
const C = d.contractAddress.toLowerCase();

/* 2. USDC reel depuis une pool du fork */
const pools = [...POOLS_ACTIONS_AERODROME.values()].map((t) => t.pool).filter(Boolean);
let source = null;
for (const p of pools) { if ((await solde(p)) >= 200_000_000n) { source = p.toLowerCase(); break; } }
if (!ok(!!source, 'une pool du fork tient >= 200 USDC reels (source ' + source + ')')) process.exit(1);
await compte(source);
for (const [qui, m] of [[donateur, 50_000_000n], [alice, 100_000_000n]]) {
  const r = await envoyer(source, { to: USDC, data: selecteur('transfer(address,uint256)') + adrMot(qui) + mot(m) });
  ok(r.status === '0x1', 'USDC reel transfere : ' + usd(m) + ' a ' + qui.slice(0, 10) + '…');
}
const dev0 = await solde(DEV), alice0 = await solde(alice), donateur0 = await solde(donateur);

/* 3. fund + roll paye */
for (const a of P.planFund({ contrat: C, usdc: USDC, montant: 50_000_000n }).appels) ok((await envoyer(donateur, a)).status === '0x1', 'fund : ' + a.quoi);
ok((await lireU(C, selecteur('pot()'))) === 50_000_000n, 'pot = 50 USDC apres fund');
const guess1 = [2, 3, 4, 5, 6];
const pr = P.planRoll({ contrat: C, usdc: USDC, guess: guess1 });
const a0 = await solde(alice);
await envoyer(alice, pr.appels[0]);
const rr = await envoyer(alice, pr.appels[1]);
const R1 = P.lireRolled(rr.logs, C);
ok(rr.status === '0x1' && R1 && R1.guess.join() === guess1.join() && R1.targetBlock === BigInt(rr.blockNumber) + 2n, 'roll paye (gaz ' + BigInt(rr.gasUsed) + ') ; cible = bloc du roll + 2 = ' + R1?.targetBlock);
ok(a0 - (await solde(alice)) === 500_000n && (await solde(DEV)) - dev0 === 250_000n && (await lireU(C, selecteur('pot()'))) === 50_250_000n,
  'split lu sur les soldes : joueuse -0,50, DEV_WALLET +0,25, pot +0,25');
ok(P.planSettle({ contrat: C, rollId: R1.rollId, targetBlock: R1.targetBlock, blocActuel: BigInt(rr.blockNumber) }).etat === 'REFUSE', 'planSettle refuse avant la cible');
const tot = await envoyer(alice, P.planSettle({ contrat: C, rollId: R1.rollId }).appels[0]);
ok(tot.status === '0x0', 'settle envoye trop tot : status 0 (TooEarly)');

/* 4. settle du roll paye + parite sur le hash REEL */
await rpc('anvil_mine', ['0x2']);
const s1 = await envoyer(donateur, P.planSettle({ contrat: C, rollId: R1.rollId }).appels[0]);
const S1 = P.lireSettled(s1.logs, C);
const blocCible = await rpc('eth_getBlockByNumber', [hex(R1.targetBlock), false]);
ok(s1.status === '0x1' && S1 && S1.blockHash === blocCible.hash.toLowerCase(), 'settle (par un TIERS, gaz ' + BigInt(s1.gasUsed) + ') : blockhash on-chain = hash du bloc ' + R1.targetBlock + ' lu par RPC');
ok(JSON.stringify(S1.face) === JSON.stringify(P.traitsDepuisHash(blocCible.hash)), 'PARITE sur hash reel : face on-chain ' + JSON.stringify(S1.face) + ' = face-du-jour.js');
ok(S1.score === P.scoreTraits(guess1, S1.face) && S1.payout === P.gainPrevu(50_250_000n, S1.score), 'score ' + S1.score + ', gain ' + usd(S1.payout) + ' = gainPrevu');

/* 5. pass + 30 rolls dans un bloc, puis le bloc cible MOULU */
for (const a of P.planPass({ contrat: C, usdc: USDC }).appels) ok((await envoyer(alice, a)).status === '0x1', 'pass : ' + a.quoi);
await rpc('evm_setAutomine', [false]);
const guesses = [];
let graine = 7n;
for (let i = 0; i < 30; i++) { const g = P.TAILLES.map((t) => { graine = (graine * 6364136223846793005n + 1442695040888963407n) % (1n << 64n); return Number((graine >> 33n) % BigInt(t)); }); guesses.push(g); }
const hs = [];
for (const g of guesses) hs.push(await poser(alice, P.planRollAvecPass({ contrat: C, guess: g }).appels[0], 200000));
await rpc('evm_mine', []);
await rpc('evm_setAutomine', [true]);
const recus = await Promise.all(hs.map(recu));
const blocs = new Set(recus.map((r) => r.blockNumber));
const Rs = recus.map((r) => P.lireRolled(r.logs, C));
ok(recus.every((r) => r.status === '0x1') && blocs.size === 1 && Rs.every((x) => x.withPass), '30 rolls de pass dans UN bloc (gaz moyen ' + recus.reduce((s, r) => s + BigInt(r.gasUsed), 0n) / 30n + ')');
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

/* 6. settle de tous */
const potAvant = await lireU(C, selecteur('pot()'));
const aAvant = await solde(alice);
let paye = 0n, gazGagnant = 0n, gazPerdant = 0n;
for (const R of Rs) {
  const s = await envoyer(donateur, P.planSettle({ contrat: C, rollId: R.rollId }).appels[0]);
  const S = P.lireSettled(s.logs, C);
  if (s.status !== '0x1' || !S) { ok(false, 'settle ' + R.rollId); continue; }
  paye += S.payout;
  if (S.score === 5) ok(S.payout === (S.potAfter + S.payout) / 2n, 'P5 du roll #' + S.rollId + ' : ' + usd(S.payout) + ' = 50 % du pot au moment du settle (' + usd(S.potAfter + S.payout) + ')');
  if (S.payout > 0n) gazGagnant = BigInt(s.gasUsed); else gazPerdant = BigInt(s.gasUsed);
}
const potApres = await lireU(C, selecteur('pot()'));
ok(paye > 0n && (await solde(alice)) - aAvant === paye && potAvant - potApres === paye, 'gain en USDC REEL : joueuse +' + usd(paye) + ' (lu sur les soldes), pot ' + usd(potAvant) + ' -> ' + usd(potApres));
ok(potApres <= (await solde(C)), 'pot (' + usd(potApres) + ') <= balanceOf(contrat) (' + usd(await solde(C)) + ')');
console.log('gaz settle : gagnant ' + gazGagnant + ', perdant ' + gazPerdant);
console.log('deltas USDC : joueuse ' + usd((await solde(alice)) - alice0) + ' (roll 0,50 + pass 10 + gains) · donateur ' + usd((await solde(donateur)) - donateur0) + ' · DEV_WALLET +' + usd((await solde(DEV)) - dev0) + ' · contrat ' + usd(await solde(C)) + ' · pot ' + usd(potApres));
console.log((ko ? 'ECHEC ' : 'ok ') + 'banc-blockrolls-fork - ' + n + ' assertions, ' + ko + ' KO ; fork Base, comptes impersonnes, rien de signe');
process.exit(ko ? 1 : 0);
