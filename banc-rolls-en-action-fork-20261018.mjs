/* banc-rolls-en-action-fork-20261018.mjs — UN ROLL PAYE EN NVDAc, PUIS LE GAIN CONVERTI EN AAPLc, EXECUTES SUR UN FORK DE BASE.
 * Usage : "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://mainnet.base.org --port 9790
 *         puis node banc-rolls-en-action-fork-20261018.mjs [http://127.0.0.1:9790]
 * DEROULE (vraies transactions sur le fork, comptes IMPERSONNES, aucune cle, rien n est envoye a Base) :
 *   1. BlockRolls deploye depuis la donnee de creation FIGEE de blockrolls-deploiement.js (celle que Phil signerait) ;
 *   2. de l USDC reel pris a une pool Aerodrome du fork (ni NVDAc ni AAPLc : leur comptabilite reste intacte) pour un donateur et un joueur ;
 *      le joueur ACHETE du NVDAc avec 10 USDC par planGainEnAction (le meme chemin d achat que le gain) : il detient une action achetee ;
 *   3. fund 50 USDC au pot (planFund) ;
 *   4. planRollEnAction (2 rolls, 0,50 chacun) : le lot [approve NVDAc, vente Aerodrome, approve USDC EXACT 1,00, roll, roll] est pose
 *      en 5 tx du MEME compte dans UN bloc (anvil n a pas wallet_sendCalls : automine coupe, nonces croissants, un evm_mine) ; verifie
 *      sur les SOLDES : NVDAc -montantAction exactement ; USDC sorti de la pool = recu par le joueur + 0,1 % au wallet des frais ;
 *      recu >= minimum annonce ; reste au compte = recu - 1,00 ; allowance USDC -> BlockRolls consommee (0) ; 2 Rolled, meme cible ;
 *      DEV_WALLET +0,50 (2 x 0,25) ; pot +0,50 ;
 *   5. le bloc cible est MOULU (snapshot / evm_mine a des horodatages differents) jusqu a un score >= 3 (ce que peut faire qui produit
 *      le bloc), settleMany : gains = 2 x 5 USDC fixes ;
 *   6. planGainEnAction : le gain (10 USDC) achete de l AAPLc ; solde AAPLc +>= minimum annonce ; 0,1 % de l AAPLc sorti au wallet des frais ;
 *   7. temoins : rolls = 11 refuse ; un compte sans NVDAc refuse (solde) ; une action hors table refuse ; un contrat sans code refuse.
 * NE PROUVE PAS : un vrai wallet_sendCalls (l atomicite est celle du wallet, pas d anvil), l interface, le deploiement reel. */
import { BLOCKROLLS_DEPLOIEMENT as D } from './blockrolls-deploiement.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import * as F from './frais-creation.js';
import { selecteur } from './keccak.js';
import * as P from './blockrolls-plan.js';
import * as R from './rolls-en-action.js';

const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9790';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_FORK)) { console.log('KO the fork must be a local http address: nothing is sent'); process.exit(1); }
let n = 0, ko = 0, idRpc = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } return c; };
const rpc = async (method, params = []) => {
  const r = await fetch(URL_FORK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idRpc, method, params }) }).then((x) => x.json());
  if (r.error) throw new Error(method + ': ' + r.error.message + (r.error.data ? ' ' + JSON.stringify(r.error.data).slice(0, 120) : ''));
  return r.result;
};
const USDC = F.USDC_BASE.toLowerCase(), FRAIS = F.FEE_WALLET.toLowerCase();
const NV = '0xb20000000000000000000078ee7ce2fe4908108c', AA = '0xb200000000000000000000c2e324d24d7eecd1fb';
const adrMot = (a) => String(a).slice(2).toLowerCase().padStart(64, '0');
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const hex = (v) => '0x' + BigInt(v).toString(16);
const lire = (to, sig, args = '') => rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']);
const lireU = async (to, sig, args = '') => BigInt(await lire(to, sig, args));
const solde = (jeton, qui) => lireU(jeton, 'balanceOf(address)', adrMot(qui));
const allowance = (jeton, qui, a) => lireU(jeton, 'allowance(address,address)', adrMot(qui) + adrMot(a));
const usd = (x) => (Number(x) / 1e6).toFixed(6);
const act = (x, dec) => (Number(x) / 10 ** dec).toFixed(dec);
async function recu(h) {
  for (let i = 0; i < 200; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
const poser = (de, tx, gas = 800000) => rpc('eth_sendTransaction', [{ from: de, ...(tx.to ? { to: tx.to } : {}), data: tx.data || '0x', value: tx.value || '0x0', gas: hex(gas) }]);
const envoyer = async (de, tx, gas) => recu(await poser(de, tx, gas));
const compte = async (a) => { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, hex(10n ** 18n)]); return a; };

const chaine = parseInt(await rpc('eth_chainId'), 16), tete = parseInt(await rpc('eth_blockNumber'), 16);
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base (sinon ce banc ne prouve rien)')) process.exit(1);
const decNV = Number(await lireU(NV, 'decimals()')), decAA = Number(await lireU(AA, 'decimals()'));
console.log('NVDAc ' + decNV + ' decimales · AAPLc ' + decAA + ' decimales');

/* 1. BlockRolls depuis la donnee de creation FIGEE */
const deployeur = await compte('0x00000000000000000000000000000000de9107e4');
const d = await envoyer(deployeur, { data: D.creation }, 3_500_000);
if (!ok(d.status === '0x1', 'BlockRolls se deploie depuis blockrolls-deploiement.js (gaz ' + BigInt(d.gasUsed) + ')')) process.exit(1);
const C = d.contractAddress.toLowerCase();
ok((await lireU(C, 'ROLL_PRICE()')) === BigInt(D.constructeur.rollPrice) && (await lire(C, 'USDC()')).slice(26).toLowerCase() === USDC.slice(2), 'ROLL_PRICE = ' + D.constructeur.rollPrice + ' brut, USDC = le vrai USDC de Base');

/* 2. USDC reel pour le donateur et le joueur ; le joueur achete du NVDAc */
const donateur = await compte('0x000000000000000000000000000000000000d0e0');
/* ⛔ un compte NEUF, derive du bloc du fork : 0x…a11ce tenait deja 29 USDC sur mainnet (vu au 1er passage) — un solde absolu ment, on juge des DELTAS */
const joueur = await compte('0x' + ('f0110' + tete.toString(16)).padEnd(40, '1').slice(0, 40));
const sansRien = await compte('0x' + ('f0110' + tete.toString(16)).padEnd(40, '2').slice(0, 40));
const uJ0 = await solde(USDC, joueur), nvJ0 = await solde(NV, joueur);
ok(nvJ0 === 0n, 'le joueur neuf ne detient aucun NVDAc avant le banc (USDC prealable : ' + usd(uJ0) + ')');
const table = [...POOLS_ACTIONS_AERODROME.entries()].map(([adr, t]) => ({ adr, ...t })).filter((t) => t.adr !== NV && t.adr !== AA);
let source = null;
for (const t of table) { if ((await solde(USDC, t.pool)) >= 200_000_000n) { source = t; break; } }
if (!ok(!!source, 'une pool du fork (ni NVDAc ni AAPLc) tient >= 200 USDC reels : ' + (source && source.symbole + ' ' + source.pool))) process.exit(1);
await compte(source.pool);
for (const [qui, m] of [[donateur, 60_000_000n], [joueur, 10_000_000n]]) ok((await envoyer(source.pool, { to: USDC, data: selecteur('transfer(address,uint256)') + adrMot(qui) + mot(m) })).status === '0x1', 'USDC reel transfere : ' + usd(m) + ' a ' + qui.slice(0, 10) + '…');
const gNV = await R.planGainEnAction({ rpc, chaine: 8453, compte: joueur, action: NV, montantUsdc: 10_000_000n });
ok(gNV.etat === 'PRET' && gNV.appels.length === 2, 'planGainEnAction USDC -> NVDAc (10 USDC) : ' + gNV.etat + (gNV.pourquoi ? ' — ' + gNV.pourquoi : '') + ' ; au moins ' + (gNV.detail ? act(gNV.detail.actionAuMoins, decNV) : '?') + ' NVDAc');
if (gNV.etat !== 'PRET') process.exit(1);
for (const a of gNV.appels) ok((await envoyer(joueur, a)).status === '0x1', 'achat NVDAc : ' + a.quoi);
const nvDetenu = await solde(NV, joueur);
ok(nvDetenu >= gNV.detail.actionAuMoins && (await solde(USDC, joueur)) === uJ0, 'le joueur detient ' + act(nvDetenu, decNV) + ' NVDAc achetes (>= minimum ' + act(gNV.detail.actionAuMoins, decNV) + ') ; les 10 USDC sont partis en entier');

/* 3. le pot */
for (const a of P.planFund({ contrat: C, usdc: USDC, montant: 50_000_000n }).appels) ok((await envoyer(donateur, a)).status === '0x1', 'fund : ' + a.quoi);
ok((await lireU(C, 'pot()')) === 50_000_000n, 'pot des rolls = 50 USDC');

/* 4. le roll paye en NVDAc : 2 rolls, un lot */
const GUESS = [2, 3, 4, 5, 6];
const ROLLS = 2;
const plan = await R.planRollEnAction({ rpc, chaine: 8453, compte: joueur, contrat: C, usdc: USDC, action: NV, guess: GUESS, rolls: ROLLS });
ok(plan.etat === 'PRET', 'planRollEnAction NVDAc x ' + ROLLS + ' rolls : ' + plan.etat + (plan.pourquoi ? ' — ' + plan.pourquoi : ''));
if (plan.etat !== 'PRET') process.exit(1);
const dt = plan.detail;
console.log('    plan : vendre ' + act(dt.montantAction, decNV) + ' NVDAc (' + dt.montantAction + ' bruts) -> ' + usd(dt.usdcCote) + ' USDC cotes, >= ' + usd(dt.usdcAuMoins) + ' apres frais ; besoin ' + usd(dt.besoinUsdc)
  + ' ; frais attendu ' + usd(dt.fraisAttenduUsdc) + ' USDC ; reste attendu ' + usd(dt.resteUsdcAttendu) + ' USDC ; devis en ' + dt.toursDeDevis + ' tour(s) ; simule ' + dt.simule);
ok(plan.appels.length === 3 + ROLLS && plan.exigeAtomique === true, 'le lot a ' + plan.appels.length + ' appels (approve NVDAc, vente, approve USDC, ' + ROLLS + ' rolls) et exige l atomicite');
ok(plan.appels[2].to === USDC && plan.appels[2].data === '0x095ea7b3' + mot(C) + mot(dt.besoinUsdc) && dt.besoinUsdc === 500_000n * BigInt(ROLLS), 'approve USDC -> BlockRolls EXACTEMENT ' + usd(dt.besoinUsdc) + ' (N x rollPrice)');
const nv0 = await solde(NV, joueur), u0 = await solde(USDC, joueur), f0 = await solde(USDC, FRAIS), p0 = await solde(USDC, dt.pool), pot0 = await lireU(C, 'pot()');
await rpc('evm_setAutomine', [false]);
const hs = [];
for (const a of plan.appels) hs.push(await poser(joueur, a, 900000));
await rpc('evm_mine', []);
await rpc('evm_setAutomine', [true]);
const recus = await Promise.all(hs.map(recu));
ok(recus.every((r) => r.status === '0x1') && new Set(recus.map((r) => r.blockNumber)).size === 1, 'les ' + recus.length + ' tx du lot passent dans UN bloc (status ' + recus.map((r) => r.status).join(',') + ' ; gaz ' + recus.map((r) => BigInt(r.gasUsed)).join('+') + ')');
const nv1 = await solde(NV, joueur), u1 = await solde(USDC, joueur), f1 = await solde(USDC, FRAIS), p1 = await solde(USDC, dt.pool), pot1 = await lireU(C, 'pot()');
ok(nv0 - nv1 === dt.montantAction, 'NVDAc : -' + act(nv0 - nv1, decNV) + ' = le montant planifie exactement');
const sorti = p0 - p1, devPart = 250_000n * BigInt(ROLLS);
const fraisVente = f1 - f0 - devPart;
const recuVente = u1 - u0 + dt.besoinUsdc;
ok(recuVente + fraisVente === sorti && fraisVente > 0n, 'USDC sorti de la pool ' + usd(sorti) + ' = joueur ' + usd(recuVente) + ' + wallet des frais ' + usd(fraisVente) + ' (le reste du delta a6cf, ' + usd(devPart) + ', est la part dev des rolls)');
const attenduFrais = sorti * 10n / 10000n;
ok(fraisVente === attenduFrais || fraisVente === attenduFrais + 1n || fraisVente + 1n === attenduFrais, 'frais de vente = 0,1 % de la sortie (' + fraisVente + ' pour ' + attenduFrais + ' calcules)');
ok(recuVente >= dt.usdcAuMoins, 'recu ' + usd(recuVente) + ' >= minimum annonce ' + usd(dt.usdcAuMoins));
ok(u1 - u0 === recuVente - dt.besoinUsdc && u1 - u0 >= dt.resteUsdcAuMoins, 'reste au compte ' + usd(u1 - u0) + ' USDC (attendu ' + usd(dt.resteUsdcAttendu) + ', au moins ' + usd(dt.resteUsdcAuMoins) + ')');
ok((await allowance(USDC, joueur, C)) === 0n && (await allowance(NV, joueur, plan.appels[0].to === NV ? '0x' + plan.appels[0].data.slice(34, 74) : NV)) === 0n, 'allowances consommees : USDC -> BlockRolls 0, NVDAc -> routeur 0');
ok(pot1 - pot0 === devPart && f1 - f0 - fraisVente === devPart, 'pot +' + usd(pot1 - pot0) + ', DEV_WALLET +' + usd(devPart) + ' (2 x 0,25)');
const Rs = recus.flatMap((r) => P.lireRolledTous(r.logs, C));
ok(Rs.length === ROLLS && new Set(Rs.map((x) => String(x.targetBlock))).size === 1 && Rs.every((x) => x.guess.join() === GUESS.join() && !x.withPass && x.player === joueur), ROLLS + ' Rolled, meme bloc cible ' + Rs[0]?.targetBlock + ', guess ' + GUESS.join('/') + ', payes (pas de pass)');

/* 5. le bloc cible moulu jusqu a un score >= 3, puis settleMany */
const cible = Rs[0].targetBlock;
while (BigInt(await rpc('eth_blockNumber')) < cible - 1n) await rpc('evm_mine', []);
const tsBase = parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);
let essais = 0, score = -1;
for (let k = 1; k <= 20000; k++) {
  const snap = await rpc('evm_snapshot');
  await rpc('evm_mine', [tsBase + k]);
  essais = k;
  const h = (await rpc('eth_getBlockByNumber', [hex(cible), false])).hash;
  score = P.scoreTraits(GUESS, P.traitsDepuisHash(h));
  if (score >= 3) break;
  await rpc('evm_revert', [snap]);
}
ok(score >= 3, 'bloc cible MOULU : score ' + score + '/5 en ' + essais + ' essai(s) d horodatage');
await rpc('evm_mine', []);
const uAvantGain = await solde(USDC, joueur);
const sm = await envoyer(donateur, P.planSettleMany({ contrat: C, rollIds: Rs.map((x) => x.rollId) }).appels[0], 2_000_000);
const Ss = P.lireSettledTous(sm.logs, C);
const gain = Ss.reduce((s, S) => s + S.payout, 0n);
ok(sm.status === '0x1' && Ss.length === ROLLS && Ss.every((S) => S.score === score && S.payout === 5_000_000n) && (await solde(USDC, joueur)) - uAvantGain === gain, 'settleMany : ' + Ss.length + ' Settled, score ' + score + ', gain ' + usd(gain) + ' USDC lu sur le solde du joueur');

/* 6. le gain en AAPLc */
const gAA = await R.planGainEnAction({ rpc, chaine: 8453, compte: joueur, action: AA, montantUsdc: gain });
ok(gAA.etat === 'PRET' && gAA.appels.length === 2 && gAA.exigeAtomique === false, 'planGainEnAction USDC -> AAPLc (' + usd(gain) + ' USDC) : ' + gAA.etat + (gAA.pourquoi ? ' — ' + gAA.pourquoi : ''));
if (gAA.etat !== 'PRET') process.exit(1);
const g = gAA.detail;
console.log('    gain : ' + usd(g.montantUsdc) + ' USDC -> ' + act(g.actionCotee, decAA) + ' AAPLc cotes, attendu ' + act(g.actionAttendue, decAA) + ' apres frais, au moins ' + act(g.actionAuMoins, decAA) + ' ; frais attendu ' + act(g.fraisAttenduAction, decAA) + ' AAPLc ; simule ' + g.simule);
const aa0 = await solde(AA, joueur), fa0 = await solde(AA, FRAIS), pa0 = await solde(AA, g.pool), uu0 = await solde(USDC, joueur);
for (const a of gAA.appels) ok((await envoyer(joueur, a)).status === '0x1', 'gain : ' + a.quoi);
const aa1 = await solde(AA, joueur), fa1 = await solde(AA, FRAIS), pa1 = await solde(AA, g.pool);
ok(aa1 - aa0 >= g.actionAuMoins && aa1 - aa0 > 0n, 'AAPLc : +' + act(aa1 - aa0, decAA) + ' >= minimum annonce ' + act(g.actionAuMoins, decAA));
const sortiAA = pa0 - pa1, fraisAA = fa1 - fa0, attAA = sortiAA * 10n / 10000n;
ok((aa1 - aa0) + fraisAA === sortiAA && (fraisAA === attAA || fraisAA === attAA + 1n || fraisAA + 1n === attAA), 'AAPLc sorti de la pool ' + act(sortiAA, decAA) + ' = joueur + wallet des frais ' + act(fraisAA, decAA) + ' (0,1 %)');
ok(uu0 - (await solde(USDC, joueur)) === gain, 'les ' + usd(gain) + ' USDC du gain sont partis en entier');

/* 7. temoins */
ok((await R.planRollEnAction({ rpc, chaine: 8453, compte: joueur, contrat: C, usdc: USDC, action: NV, guess: GUESS, rolls: 11 })).etat === 'REFUSE', 'temoin : 11 rolls refuses');
const sr = await R.planRollEnAction({ rpc, chaine: 8453, compte: sansRien, contrat: C, usdc: USDC, action: NV, guess: GUESS, rolls: 1 });
ok(sr.etat === 'REFUSE' && sr.sansFonds === true, 'temoin : un compte sans NVDAc est refuse sur son solde (' + String(sr.pourquoi).slice(0, 80) + ')');
ok((await R.planRollEnAction({ rpc, chaine: 8453, compte: joueur, contrat: C, usdc: USDC, action: '0x' + '12'.repeat(20), guess: GUESS })).etat === 'REFUSE', 'temoin : une action hors table refusee');
ok((await R.planRollEnAction({ rpc, chaine: 8453, compte: joueur, contrat: '0x' + 'cc'.repeat(20), usdc: USDC, action: NV, guess: GUESS })).etat === 'REFUSE', 'temoin : un contrat sans code refuse');
console.log((ko ? 'ECHEC ' : 'ok ') + 'banc-rolls-en-action-fork - ' + n + ' assertions, ' + ko + ' KO ; fork Base, comptes impersonnes, rien de signe');
process.exit(ko ? 1 : 0);
