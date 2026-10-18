/* banc-duels-fork-20261018.mjs — BlockDuels DEPLOYE SUR UN FORK DE BASE, CONTRE LE VRAI USDC (proxy, 6 decimales), avec les appels
 * construits par duels-plan.js (le code que l app appellera) et une donnee de creation produite par le PREPARATEUR.
 * Usage : (cd contracts && forge build) ; "C:\Users\VolKov\.foundry\versions\base-v1.1.1\anvil.exe" --base --fork-url https://mainnet.base.org --port 9643
 *         puis node banc-duels-fork-20261018.mjs [http://127.0.0.1:9643]      (un port DEDIE : aucun autre banc ne doit partager ce fork)
 * DEROULE (vraies transactions sur le fork, comptes IMPERSONNES, rien n est envoye a Base) :
 *   0. le preparateur est lance avec des parametres de TEST (rewardPool = 0x…7007, guardian = 0x…6a2d) vers un fichier temporaire ; la
 *      verification de la page (duels-config.js) l accepte ; la donnee est envoyee TELLE QUELLE sans `to` ; relectures ;
 *      devWallet = le VRAI FEE_WALLET du depot (son solde USDC reel du fork est mesure en DELTA, au wei).
 *   1. un duel USDC gagne : A cree (5 USDC), B rejoint avec un guess different sur chaque trait, 2 blocs mines, settle par un TIERS ;
 *      la face est recalculee par l app (traitsDepuisHash) sur le hash du bloc cible LU sur le fork ; soldes gagnant / perdant / pot
 *      commun / dev au wei. Le hash n est pas choisi : si c est une egalite, elle est verifiee et un nouveau duel est joue (max 8).
 *   2. une egalite : meme guess des deux cotes -> les deux mises rendues, 0 au pot commun, 0 au dev.
 *   3. le remboursement a 256 blocs : refundExpired refuse tant que le duel est reglable ; 258 blocs mines ; settle refuse ; refundExpired
 *      par un TIERS rend les deux mises.
 *   4. un duel jamais rejoint, expire (601 s) : la mise rendue au createur ; rejoindre son propre duel : refuse.
 *   5. une action tokenisee (NVDAc, adresse lue dans pools-actions-aerodrome.js, decimales LUES) : admise par le gardien, un duel de 1 action
 *      chacun, partage au wei -- sur l implementation B20 de anvil base-v1.1.1 (--base).
 * NE PROUVE PAS : un vrai wallet, la page dans un navigateur, le deploiement reel (Phil seul signe), le comportement d un B20 sur le NOEUD
 *   Base de production (le banc ne voit que celui d anvil). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as F from './frais-creation.js';
import { POOLS_ACTIONS_AERODROME } from './pools-actions-aerodrome.js';
import { selecteur } from './keccak.js';
import * as P from './duels-plan.js';
import { verifierEnregistrement } from './duels-config.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const URL_FORK = /^https?:/.test(process.argv[2] || '') ? process.argv[2] : 'http://127.0.0.1:9643';
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
const appel = async (to, sig, args = '') => String(await rpc('eth_call', [{ to, data: selecteur(sig) + args }, 'latest']));
const lireU = async (to, sig, args = '') => BigInt(await appel(to, sig, args));
const lireAdr = async (to, sig) => ('0x' + (await appel(to, sig)).slice(-40)).toLowerCase();
const solde = (qui, jeton = USDC) => lireU(jeton, 'balanceOf(address)', adrMot(qui));
const usd = (x) => (Number(x) / 1e6).toFixed(6);
async function recu(h) {
  for (let i = 0; i < 100; i += 1) { const r = await rpc('eth_getTransactionReceipt', [h]); if (r) return r; await new Promise((o) => setTimeout(o, 100)); }
  throw new Error('receipt never came for ' + h);
}
const envoyer = async (de, tx, gas = 600000) => recu(await rpc('eth_sendTransaction', [{ from: de, ...(tx.to ? { to: tx.to } : {}), data: tx.data || '0x', gas: hex(gas) }]));
const compte = async (a) => { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, hex(10n ** 18n)]); return a; };
const bloc = async () => parseInt(await rpc('eth_blockNumber'), 16);
const ts = async () => parseInt((await rpc('eth_getBlockByNumber', ['latest', false])).timestamp, 16);

const chaine = parseInt(await rpc('eth_chainId'), 16), tete = await bloc();
console.log('fork ' + URL_FORK + ' · chaine ' + chaine + ' · bloc ' + tete);
if (!ok(chaine === 8453, 'le fork est Base (sinon ce banc ne prouve rien)')) process.exit(1);

/* 0. le preparateur, des parametres de TEST, la verification de la page, la donnee envoyee telle quelle */
const POOL = '0x0000000000000000000000000000000000007007', GARDIEN = '0x0000000000000000000000000000000000006a2d';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'duels-banc-'));
let D;
try {
  fs.writeFileSync(path.join(tmp, 'p.json'), JSON.stringify({ rewardPool: POOL, guardian: GARDIEN }));
  execFileSync(process.execPath, ['preparer-deploiement-duels.mjs'], { cwd: path.join(ICI, 'contracts'), env: { ...process.env, SORTIE: path.join(tmp, 'd.js'), PARAMETRES: path.join(tmp, 'p.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  ({ DUELS_DEPLOIEMENT: D } = await import(pathToFileURL(path.join(tmp, 'd.js')).href));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
const v = verifierEnregistrement(D, crypto.createHash('sha256').update(Buffer.from(D.creation.slice(2), 'hex')).digest('hex'));
if (!ok(D.pret && v.intacte && D.constructeur.devWallet === DEV, 'enregistrement prepare (parametres de test) : pret, accepte par la verification de la page, devWallet = FEE_WALLET ' + DEV)) process.exit(1);
const phil = await compte('0x00000000000000000000000000000000de9107e4');
const dep = await envoyer(phil, { data: D.creation }, 4_000_000);
if (!ok(dep.status === '0x1', 'la donnee preparee, envoyee TELLE QUELLE sans `to`, cree le contrat (gaz ' + BigInt(dep.gasUsed) + ', creation ' + D.octetsCreation + ' octets)')) process.exit(1);
const C = dep.contractAddress.toLowerCase();
const runtime = ((await rpc('eth_getCode', [C, 'latest'])).length - 2) / 2;
ok(runtime < 24576, 'runtime deploye ' + runtime + ' octets (< 24 Ko)');
ok((await lireAdr(C, 'USDC()')) === USDC && (await lireAdr(C, 'DEV_WALLET()')) === DEV && (await lireAdr(C, 'REWARD_POOL()')) === POOL && (await lireAdr(C, 'GUARDIAN()')) === GARDIEN
  && (await lireU(C, 'tokenOk(address)', adrMot(USDC))) === 1n && (await lireU(C, 'nextId()')) === 1n, 'relu USDC de Base, DEV_WALLET, REWARD_POOL, GUARDIAN, tokenOk(USDC) = vrai, nextId = 1');

/* 30 USDC reels a A et a B, pris a une pool du fork */
const A = await compte('0x00000000000000000000000000000000000000a1');
const B = await compte('0x00000000000000000000000000000000000000b2');
const TIERS = await compte('0x0000000000000000000000000000000000000c33');
const pools = [...POOLS_ACTIONS_AERODROME.values()].map((t) => t.pool).filter(Boolean);
let source = null;
for (const p of pools) { if ((await solde(p)) >= 100_000_000n) { source = p.toLowerCase(); break; } }
if (!ok(!!source, 'une pool du fork tient >= 100 USDC reels (source ' + source + ')')) process.exit(1);
await compte(source);
/* ⛔ MESURE 2026-10-18 : 0x…00a1 tient deja 1,5991 USDC sur Base (poussiere recue) : on mesure le DELTA, jamais un solde suppose nul */
const avantFonds = [await solde(A), await solde(B)];
for (const w of [A, B]) await envoyer(source, { to: USDC, data: selecteur('transfer(address,uint256)') + adrMot(w) + mot(30_000_000n) });
ok((await solde(A)) - avantFonds[0] === 30_000_000n && (await solde(B)) - avantFonds[1] === 30_000_000n, '30 USDC reels de plus a A et a B (soldes de depart lus : ' + usd(avantFonds[0]) + ' / ' + usd(avantFonds[1]) + ')');

const lireDuel = async (id) => P.lireDuel(await appel(C, P.SIG_DUELS, mot(id)));
const MISE = 5_000_000n;
async function creer(qui, guess, expireDans = 3600, jeton = USDC, mise = MISE) {
  const pl = P.planCreer({ contrat: C, jeton, mise, guess, expireDans, admis: (await lireU(C, P.SIG_TOKEN_OK, adrMot(jeton))) === 1n });
  if (pl.etat !== 'PRET') throw new Error('planCreer ' + pl.pourquoi);
  let r = null;
  for (const a of pl.appels) { r = await envoyer(qui, a); if (r.status !== '0x1') throw new Error('creer: status ' + r.status); }
  return P.lireCreated(r.logs, C);
}
async function rejoindre(qui, id, guess) {
  const pl = P.planRejoindre({ contrat: C, id, guess, wallet: qui, duel: await lireDuel(id), admis: true, maintenant: await ts() });
  if (pl.etat !== 'PRET') throw new Error('planRejoindre ' + pl.pourquoi);
  let r = null;
  for (const a of pl.appels) { r = await envoyer(qui, a); if (r.status !== '0x1') throw new Error('rejoindre: status ' + r.status); }
  return P.lireJoined(r.logs, C);
}
const parties = async (j = USDC) => ({ a: await solde(A, j), b: await solde(B, j), pool: await solde(POOL, j), dev: await solde(DEV, j), c: await solde(C, j) });

/* 1. un duel gagne (le hash n est pas choisi : les egalites sont verifiees et rejouees) */
const TAILLES = P.TAILLES;
let gagne = null, essais = 0;
while (!gagne && essais < 8) {
  essais += 1;
  const gA = TAILLES.map((t, i) => (essais * 7 + i * 3) % t), gB = gA.map((x, i) => (x + 1) % TAILLES[i]);
  const cr = await creer(A, gA);
  const jo = await rejoindre(B, cr.id, gB);
  const d1 = await lireDuel(cr.id);
  if (essais === 1) ok(cr.stake === MISE && cr.guess.join() === gA.join() && jo.targetBlock === BigInt(d1.targetBlock) && d1.status === 2 && d1.joiner === B && (await solde(C)) === 2n * MISE,
    'duel #' + cr.id + ' : Created + Joined decodes (duels-plan), cible = bloc du join + 2 (' + jo.targetBlock + '), 10 USDC tenus');
  ok(P.planSettle({ contrat: C, id: cr.id, targetBlock: d1.targetBlock, blocActuel: (await bloc()) + 1 }).etat === 'REFUSE', 'essai ' + essais + ' : planSettle refuse avant la cible (comme le contrat)');
  await rpc('anvil_mine', ['0x2']);
  const h = (await rpc('eth_getBlockByNumber', [hex(d1.targetBlock), false])).hash.toLowerCase();
  const att = P.scoresDuel(h, gA, gB);
  const av = await parties();
  const r = await envoyer(TIERS, P.planSettle({ contrat: C, id: cr.id, targetBlock: d1.targetBlock, blocActuel: (await bloc()) + 1 }).appels[0]);
  const S = P.lireSettled(r.logs, C);
  const ap = await parties();
  ok(r.status === '0x1' && S && S.blockHash === h && S.scoreA === att.scoreA && S.scoreB === att.scoreB,
    'essai ' + essais + ' (gaz ' + BigInt(r.gasUsed) + ') : Settled porte le hash du bloc cible LU sur le fork, scores ' + S?.scoreA + ' / ' + S?.scoreB + ' = ceux de l app (face ' + att.face.join(',') + ')');
  if (att.gagnant === 'EGALITE') {
    ok(S.egalite && ap.a - av.a === MISE && ap.b - av.b === MISE && ap.pool === av.pool && ap.dev === av.dev && ap.c === av.c - 2n * MISE, 'essai ' + essais + ' : egalite ' + S.scoreA + '-' + S.scoreB + ', les deux mises rendues, aucun frais ; on rejoue');
    continue;
  }
  gagne = { id: cr.id, w: att.gagnant === 'A' ? A : B, S, av, ap };
}
if (ok(!!gagne, 'un duel gagne obtenu en ' + essais + ' essai(s) (hash non choisi)')) {
  const { w, S, av, ap } = gagne;
  const perdant = w === A ? 'b' : 'a', g = w === A ? 'a' : 'b';
  ok(S.winner === w && S.payout === 9_000_000n, 'Settled : gagnant ' + (w === A ? 'A' : 'B') + ', payout 9 USDC (90 % de 10)');
  ok(ap[g] - av[g] === 9_000_000n && ap[perdant] === av[perdant] && ap.pool - av.pool === 700_000n && ap.dev - av.dev === 300_000n && av.c - ap.c === 10_000_000n,
    'soldes USDC REELS au wei : gagnant +9,000000 · perdant +0 · pot commun +0,700000 · dev (FEE_WALLET) +0,300000 · contrat -10,000000');
  ok((await solde(TIERS)) === 0n, 'l appelant du settle (un tiers) ne touche rien');
  const re = await envoyer(TIERS, P.planSettle({ contrat: C, id: gagne.id }).appels[0]);
  ok(re.status === '0x0', 'settle une 2e fois : status 0 (NotJoined)');
  console.log('deltas duel #' + gagne.id + ' : gagnant +' + usd(ap[g] - av[g]) + ' · pot commun +' + usd(ap.pool - av.pool) + ' · dev +' + usd(ap.dev - av.dev));
}

/* 2. une egalite garantie : le meme guess des deux cotes */
{
  const g = [3, 4, 5, 6, 7];
  const cr = await creer(A, g);
  await rejoindre(B, cr.id, g);
  const d = await lireDuel(cr.id);
  await rpc('anvil_mine', ['0x2']);
  const av = await parties();
  const r = await envoyer(TIERS, P.planSettle({ contrat: C, id: cr.id }).appels[0]);
  const S = P.lireSettled(r.logs, C), R = P.lireRefunded(r.logs, C);
  const ap = await parties();
  ok(r.status === '0x1' && S && S.egalite && S.winner === null && S.payout === 0n && S.scoreA === S.scoreB && R && R.toCreator === MISE && R.toJoiner === MISE,
    'egalite (duel #' + cr.id + ', cible ' + d.targetBlock + ', ' + S?.scoreA + '-' + S?.scoreB + ') : Settled winner 0, payout 0, Refunded(5, 5)');
  ok(ap.a - av.a === MISE && ap.b - av.b === MISE && ap.pool === av.pool && ap.dev === av.dev && av.c - ap.c === 2n * MISE, 'soldes au wei : A +5, B +5, pot commun +0, dev +0');
}

/* 3. le remboursement a 256 blocs */
{
  const cr = await creer(A, [0, 0, 0, 0, 0]);
  const jo = await rejoindre(B, cr.id, [1, 1, 1, 1, 1]);
  const t = Number(jo.targetBlock);
  ok((await envoyer(TIERS, P.planRefundExpired({ contrat: C, id: cr.id }).appels[0])).status === '0x0', 'refundExpired pendant la fenetre : status 0 (NotRefundable)');
  ok(P.planRefundExpired({ contrat: C, id: cr.id, duel: await lireDuel(cr.id), blocActuel: (await bloc()) + 1 }).etat === 'REFUSE', 'planRefundExpired refuse aussi avant la signature');
  await rpc('anvil_mine', ['0x102']);
  const b = (await bloc()) + 1;
  ok(b > t + 256 && P.etatReglement(t, b).etat === 'REMBOURSABLE', 'apres 258 blocs : prochain bloc ' + b + ' > cible ' + t + ' + 256 -> REMBOURSABLE');
  ok((await envoyer(TIERS, P.planSettle({ contrat: C, id: cr.id }).appels[0])).status === '0x0', 'settle hors fenetre : status 0 (TooLate)');
  const av = await parties();
  const pr = P.planRefundExpired({ contrat: C, id: cr.id, duel: await lireDuel(cr.id), blocActuel: b });
  const r = await envoyer(TIERS, pr.appels[0]);
  const R = P.lireRefunded(r.logs, C);
  const ap = await parties();
  ok(pr.etat === 'PRET' && r.status === '0x1' && R && R.toCreator === MISE && R.toJoiner === MISE && (await lireDuel(cr.id)).status === 5, 'refundExpired par un TIERS (gaz ' + BigInt(r.gasUsed) + ') : Refunded(5, 5), statut Refunded');
  ok(ap.a - av.a === MISE && ap.b - av.b === MISE && ap.pool === av.pool && ap.dev === av.dev && av.c - ap.c === 2n * MISE, 'soldes au wei : A +5, B +5, pot commun +0, dev +0 -- aucun fonds bloque');
}

/* 4. jamais rejoint, expire ; son propre duel */
{
  const cr = await creer(A, [2, 2, 2, 2, 2], 600);
  const propre = P.planRejoindre({ contrat: C, id: cr.id, guess: [1, 1, 1, 1, 1], wallet: A, duel: await lireDuel(cr.id), maintenant: await ts() });
  ok(propre.etat === 'REFUSE', 'planRejoindre refuse son propre duel avant la signature');
  await envoyer(A, { to: USDC, data: selecteur('approve(address,uint256)') + adrMot(C) + mot(MISE) });
  ok((await envoyer(A, { to: C, data: selecteur(P.SIG_JOIN) + mot(cr.id) + [1, 1, 1, 1, 1].map(mot).join('') })).status === '0x0', 'join de son propre duel envoye quand meme : status 0 (OwnDuel)');
  await envoyer(A, { to: USDC, data: selecteur('approve(address,uint256)') + adrMot(C) + mot(0) });
  await rpc('evm_increaseTime', [601]);
  await rpc('evm_mine', []);
  const a0 = await solde(A);
  const r = await envoyer(TIERS, P.planRefundExpired({ contrat: C, id: cr.id, duel: await lireDuel(cr.id), maintenant: await ts() }).appels[0]);
  const R = P.lireRefunded(r.logs, C);
  ok(r.status === '0x1' && R && R.toCreator === MISE && R.toJoiner === 0n && (await solde(A)) - a0 === MISE, 'duel jamais rejoint, 601 s apres : refundExpired par un tiers rend 5 USDC au createur');
}
ok((await solde(C)) === 0n, 'balanceOf(contrat) = 0 : tout duel clos, rien n est retenu');

/* 5. une action tokenisee B20 (NVDAc) : sur l implementation B20 de CET anvil (base-v1.1.1 --base), pas sur le noeud Base */
{
  const NVDA = [...POOLS_ACTIONS_AERODROME.entries()].find(([, t]) => t.symbole === 'NVDAc');
  const jeton = NVDA[0].toLowerCase(), detenteur = NVDA[1].pool.toLowerCase();
  const code = await rpc('eth_getCode', [jeton, 'latest']);
  const dec = Number(await lireU(jeton, 'decimals()'));
  const UN = 10n ** BigInt(dec);
  await compte(GARDIEN);
  const st = await envoyer(GARDIEN, { to: C, data: selecteur('setToken(address,bool)') + adrMot(jeton) + mot(1) });
  ok(st.status === '0x1' && (await lireU(C, P.SIG_TOKEN_OK, adrMot(jeton))) === 1n, 'le gardien admet NVDAc (' + jeton + ', code ' + code + ', ' + dec + ' decimales LUES) : tokenOk = vrai');
  await compte(detenteur);
  const av0 = [await solde(A, jeton), await solde(B, jeton)];
  for (const w of [A, B]) await envoyer(detenteur, { to: jeton, data: selecteur('transfer(address,uint256)') + adrMot(w) + mot(3n * UN) });
  const recus = (await solde(A, jeton)) - av0[0] === 3n * UN && (await solde(B, jeton)) - av0[1] === 3n * UN;
  ok(recus, '3 NVDAc de plus a A et a B (pris a la pool Aerodrome du fork)');
  if (recus) {
    let fait = false, k = 0;
    while (!fait && k < 8) {
      k += 1;
      const gA = TAILLES.map((t, i) => (k * 5 + i) % t), gB = gA.map((x, i) => (x + 1) % TAILLES[i]);
      const cr = await creer(A, gA, 3600, jeton, UN);
      await rejoindre(B, cr.id, gB);
      const d = await lireDuel(cr.id);
      await rpc('anvil_mine', ['0x2']);
      const h = (await rpc('eth_getBlockByNumber', [hex(d.targetBlock), false])).hash.toLowerCase();
      const att = P.scoresDuel(h, gA, gB);
      const av = await parties(jeton);
      const r = await envoyer(TIERS, P.planSettle({ contrat: C, id: cr.id }).appels[0]);
      const S = P.lireSettled(r.logs, C);
      const ap = await parties(jeton);
      if (att.gagnant === 'EGALITE') { ok(r.status === '0x1' && S.egalite && ap.a - av.a === UN && ap.b - av.b === UN && ap.pool === av.pool && ap.dev === av.dev, 'NVDAc essai ' + k + ' : egalite, 1 NVDAc rendu a chacun, aucun frais ; on rejoue'); continue; }
      fait = true;
      const sp = P.partage(UN), g = att.gagnant === 'A' ? 'a' : 'b', perdant = g === 'a' ? 'b' : 'a';
      ok(r.status === '0x1' && S.scoreA === att.scoreA && S.scoreB === att.scoreB && ap[g] - av[g] === sp.gagnant && ap[perdant] === av[perdant] && ap.pool - av.pool === sp.pool && ap.dev - av.dev === sp.dev && av.c - ap.c === 2n * UN,
        'duel en NVDAc (1 action chacun, essai ' + k + ') : gagnant +' + sp.gagnant + ' · pot commun +' + sp.pool + ' · dev +' + sp.dev + ' unites brutes (' + dec + ' dec.), au wei');
    }
    ok(fait, 'un duel NVDAc gagne obtenu en ' + k + ' essai(s)');
    ok((await solde(C, jeton)) === 0n, 'balanceOf NVDAc du contrat = 0');
  }
  console.log('  ⚠️ NVDAc est un B20 : ce qui precede passe sur l implementation B20 de anvil base-v1.1.1, PAS sur le noeud Base de production.');
}
console.log((ko ? 'ECHEC ' : 'ok ') + 'banc-duels-fork - ' + n + ' assertions, ' + ko + ' KO ; fork Base, comptes impersonnes, rien de signe sur mainnet');
process.exit(ko ? 1 : 0);
