/* banc-keeper-denim-anvil-20261105.mjs — LE REGLEUR etendu pour Denim (200 ms/bloc, fenetre de 256 blocs = ~51 s), DE BOUT EN BOUT sur un
 * anvil LOCAL (aucun reseau) avec BlockRolls et BlockDuelsV2 COMPILES (forge build). Frere de banc-slots-regleur-anvil-20261023.mjs (meme
 * decor : USDC de test UsdcS, cles de TEST publiques, comptes impersonnes).
 * Usage : (dans contracts/) forge build ; anvil --port P --chain-id 8453 ; node banc-keeper-denim-anvil-20261105.mjs P
 * Cles : SEULES des cles de TEST PUBLIQUES (les entiers 1 a 10) : 0x…01 = le regleur (il SIGNE ses tx brutes) ; 0x…02 deployeur, 0x…03
 *   joueur des rolls / createur des duels, 0x…05 dev, 0x…06 rejoignant des duels, 0x…07 un tiers, 0x…0a pot commun. 0x…02 a 0x…0a sont
 *   DERIVEES, approvisionnees (anvil_setBalance) et IMPERSONNEES. Le banc REFUSE de tourner hors anvil ou hors --chain-id 8453.
 * DEROULE (vraies transactions, vrais contrats, vraies lectures du regleur : creerRegleur + JSON-RPC) — temps de bloc INJECTE 200 ms :
 *   A. BlockRolls : un roll laisse PERDRE (300 blocs) ; puis des rolls joues jusqu a avoir >= 3 GAGNANTS (score >= minScore, selon le
 *      CONTRAT : faceOf du hash de la cible, scoreOf, payoutFor) et >= 3 perdants. Le regleur : settleMany des seuls GAGNANTS, dans leur
 *      fenetre ; chaque gagnant touche EXACTEMENT son prix (evenement Settled du contrat) ; les perdants restent Pending (jamais envoyes) ;
 *      le perdu jamais envoye ; le regleur ne touche aucun USDC, ne paie que le gas.
 *   B. BlockDuelsV2 : des duels crees puis rejoints (un sur cinq a guesses egaux : egalite) jusqu a voir >= 2 rejoignants gagnants,
 *      >= 1 createur gagnant, >= 1 egalite (au plus 36). Personne ne regle. Le vainqueur du CONTRAT
 *      (faceOf + scores) : rejoignant -> settle(id) du regleur PRES DE LA FIN, inclus DANS la fenetre, 90 % au rejoignant ; createur et
 *      egalite -> JAMAIS envoyes ; apres la fenetre, settleDefault (par un tiers) les donne au createur — la regle v2 de Phil, intacte.
 * NE PROUVE PAS : Base (sequenceur, prix du gas, noeuds publics, le vrai 200 ms) ; les contrats deployes sur Base ne sont pas touches ;
 *   le paiement PARTIEL d un roll (pot insuffisant) n est prouve que par test-keeper-denim-v2-rolls (chaine simulee). */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { adresseDe } from './signeur-secp256k1.js';
import { selecteur, topic } from './keccak.js';
/* REGLEUR_MODULE : une COPIE mutee du module (le banc doit alors rougir) ; sinon le module du depot */
const Regleur = await import(process.env.REGLEUR_MODULE ? pathToFileURL(process.env.REGLEUR_MODULE).href : new URL('./slots-regleur.js', import.meta.url).href);
const { creerRegleur, faceDuHash } = Regleur;

const PORT = process.argv[2] || '9617';
const URL_RPC = 'http://127.0.0.1:' + PORT;
let idr = 0;
const rpc = async (method, params = []) => {
  const r = await fetch(URL_RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++idr, method, params }) }).then((x) => x.json());
  if (r.error) throw Object.assign(new Error(method + ': ' + (r.error.message || JSON.stringify(r.error))), { data: r.error.data });
  return r.result;
};
let n = 0, ko = 0;
const vu = (c, m) => { n++; if (!c) ko++; console.log((c ? '  ok  ' : '  KO  ') + m); };
const art = (f, c) => JSON.parse(readFileSync(new URL('./contracts/out/' + f + '/' + c + '.json', import.meta.url), 'utf8'));
const mot = (x) => BigInt(x).toString(16).padStart(64, '0');
const adr = (x) => String(x).toLowerCase().slice(2).padStart(64, '0');
const sel = (s) => selecteur(s).replace(/^0x/, '');
const mots = (h) => (String(h).slice(2).match(/.{64}/g) || []).map((x) => BigInt('0x' + x));
async function envoyer(from, to, data) {
  const h = await rpc('eth_sendTransaction', [{ from, ...(to ? { to } : {}), data, gas: '0x' + (8_000_000).toString(16) }]);
  const r = await attendreRecu(h);
  if (!r || r.status !== '0x1') throw new Error('tx failed ' + h);
  return r;
}
async function attendreRecu(h) { let rc = null; for (let z = 0; z < 60 && !rc; z++) { rc = await rpc('eth_getTransactionReceipt', [h]); if (!rc) await new Promise((ok) => setTimeout(ok, 100)); } return rc; }
const lireU = async (to, data) => BigInt(await rpc('eth_call', [{ to, data }, 'latest']));
const solde = (t, a) => lireU(t, '0x70a08231' + adr(a));
const tete = async () => parseInt(await rpc('eth_blockNumber'), 16);
const hashDe = async (b) => (await rpc('eth_getBlockByNumber', ['0x' + b.toString(16), false])).hash;

const chaineId = parseInt(await rpc('eth_chainId'), 16);
if (chaineId !== 8453) { console.log('anvil doit tourner avec --chain-id 8453 (lu : ' + chaineId + ')'); process.exit(2); }
const client = String(await rpc('web3_clientVersion'));
if (!/anvil/i.test(client)) { console.log('ce banc ne tourne que contre anvil (lu : ' + client + ')'); process.exit(2); }
const cleTest = (k) => '0x' + k.toString(16).padStart(64, '0');
const [DEP, JOUEUR, DEV, B1, TIERS, POOL] = [2, 3, 5, 6, 7, 10].map((k) => adresseDe(cleTest(k)).toLowerCase());
for (const a of [DEP, JOUEUR, DEV, B1, TIERS, POOL]) { await rpc('anvil_impersonateAccount', [a]); await rpc('anvil_setBalance', [a, '0x' + (10n ** 20n).toString(16)]); }
const CLE = cleTest(1);
const REG = adresseDe(CLE).toLowerCase();
await rpc('anvil_setBalance', [REG, '0x' + (10n ** 18n).toString(16)]);
console.log('anvil ' + URL_RPC + ' chaine ' + chaineId + ' ; regleur (cle de test 0x…01) ' + REG);

/* le decor : USDC de test, BlockRolls (Config a plat, 14 mots, comme le banc frere), BlockDuelsV2 */
const U = art('BlockSlots.t.sol', 'UsdcS'), BRo = art('BlockRolls.sol', 'BlockRolls'), BV2 = art('BlockDuelsV2.sol', 'BlockDuelsV2');
const usdc = (await envoyer(DEP, null, U.bytecode.object)).contractAddress.toLowerCase();
for (const j of [JOUEUR, B1, DEP]) await envoyer(DEP, usdc, '0x' + sel('mint(address,uint256)') + adr(j) + mot(1000_000000n));
const cfgR = [adr(usdc), adr(DEV), adr(usdc), mot(1n), mot(500000n), mot(10_000000n), mot(10n), mot(3600n), mot(5000n), mot(5_000000n), mot(3_000000n), mot(1_000000n), mot(500000n), mot(2n)].join('');
const rR = await envoyer(DEP, null, BRo.bytecode.object + cfgR);
const rolls = rR.contractAddress.toLowerCase(), blocRolls = parseInt(rR.blockNumber, 16);
const rV = await envoyer(DEP, null, BV2.bytecode.object + adr(usdc) + adr(DEV) + adr(POOL) + adr(DEP));
const v2 = rV.contractAddress.toLowerCase(), blocV2 = parseInt(rV.blockNumber, 16);
vu((await rpc('eth_getCode', [rolls, 'latest'])).length > 2 && (await rpc('eth_getCode', [v2, 'latest'])).length > 2, 'BlockRolls et BlockDuelsV2 deployes en local');
await envoyer(DEP, usdc, '0x' + sel('approve(address,uint256)') + adr(rolls) + mot(100_000000n));
await envoyer(DEP, rolls, '0x' + sel('fund(uint256)') + mot(100_000000n));

const journal = [];
const r = creerRegleur({ cle: CLE, contrat: null, chainId: 8453, rpc, journal: (x) => journal.push(x), msParBloc: 200,
  duelsV2: { contrat: v2, bloc: blocV2 }, rollsJoues: { contrat: rolls, bloc: blocRolls } });
vu(r.etat().etat === 'ON' && r.etat().adresse.toLowerCase() === REG && r.etat().bornes.margeFinDuelBlocs === 77, 'regleur ON, adresse = la cle de test, marge de fin 77 blocs (200 ms injectes)');
const e0 = BigInt(await rpc('eth_getBalance', [REG, 'latest']));

/* ================================================================ A. les rolls joues */
const T_ROLLED = topic('Rolled(uint256,address,uint8[5],uint256,bool,uint256,uint256)');
const T_RS = topic('Settled(uint256,address,bytes32,uint8[5],uint8,uint256,uint256)');
const faceRolls = async (h) => mots(await rpc('eth_call', [{ to: rolls, data: '0x' + sel('faceOf(bytes32)') + h.slice(2) }, 'latest'])).map(Number);
/* UNE approbation pour tous les rolls (un bloc par roll : les premiers restent dans leur fenetre pendant qu on joue) */
await envoyer(JOUEUR, usdc, '0x' + sel('approve(address,uint256)') + adr(rolls) + mot(100_000000n));
async function unRoll(g) {
  const rc = await envoyer(JOUEUR, rolls, '0x' + sel('roll(uint8[5])') + g.map(mot).join(''));
  const l = rc.logs.find((x) => x.address.toLowerCase() === rolls && x.topics[0] === T_ROLLED);
  return { id: BigInt(l.topics[1]), t: Number(mots(l.data)[5]), g };
}
const statutRoll = async (id) => Number(mots(await rpc('eth_call', [{ to: rolls, data: '0x' + sel('rolls(uint256)') + mot(id) }, 'latest']))[2]);
/* le perdu : un roll GAGNANT ou non, sorti de sa fenetre avant le premier tour */
const perdu = await unRoll([1, 2, 3, 4, 5]);
await rpc('anvil_mine', ['0x' + (300).toString(16)]);
/* des rolls aux guesses varies jusqu a >= 3 gagnants et >= 3 perdants (selon le CONTRAT) ; toujours dans la fenetre des premiers */
const joues = [];
const G = (k) => [k % 6, (k * 7 + 1) % 10, (k * 5 + 2) % 19, (k * 3) % 9, (k + 1) % 8];
/* au plus 150 (un bloc chacun : le premier reste dans sa fenetre quand le regleur commence). Mesure 2026-11-05 : 60 n ont pas suffi sur
 *   un anvil neuf (2 gagnants sur 60, ~3 % ; 5 sur 53 au passage d avant) — le temoin « >= 3 gagnants » l a dit KO */
for (let k = 0; k < 150; k++) {
  const x = await unRoll(G(k));
  joues.push(x);
  for (const y of joues.filter((z) => z.prix === undefined)) {
    if ((await tete()) < y.t) continue;
    y.h = await hashDe(y.t); y.fC = await faceRolls(y.h); y.fJ = faceDuHash(y.h);
    y.score = y.g.reduce((s, v, i) => s + (v === y.fC[i] ? 1 : 0), 0);
    y.prix = await lireU(rolls, '0x' + sel('payoutFor(uint8)') + mot(y.score));
  }
  const fait = joues.filter((z) => z.prix !== undefined);
  if (fait.filter((z) => z.prix > 0n).length >= 3 && fait.filter((z) => z.prix === 0n).length >= 3) break;
}
await rpc('anvil_mine', ['0x3']);
for (const y of joues.filter((z) => z.prix === undefined)) { y.h = await hashDe(y.t); y.fC = await faceRolls(y.h); y.fJ = faceDuHash(y.h); y.score = y.g.reduce((s, v, i) => s + (v === y.fC[i] ? 1 : 0), 0); y.prix = await lireU(rolls, '0x' + sel('payoutFor(uint8)') + mot(y.score)); }
const gagnantsR = joues.filter((z) => z.prix > 0n), perdantsR = joues.filter((z) => z.prix === 0n);
vu(gagnantsR.length >= 3 && perdantsR.length >= 3 && joues.every((z) => JSON.stringify(z.fJ) === JSON.stringify(z.fC)), joues.length + ' rolls joues : ' + gagnantsR.length + ' gagnants, ' + perdantsR.length + ' perdants (selon le contrat) ; face JS (faceDuHash) = face du contrat (faceOf) pour chacun');
const attenduR = gagnantsR.reduce((s, z) => s + z.prix, 0n);
const j0 = await solde(usdc, JOUEUR);
const envoisR = [];
const finR = Math.max(...joues.map((z) => z.t)) + 256;
for (let t0 = await tete(); t0 + 1 <= finR && envoisR.flatMap((x) => x.ids).length < gagnantsR.length; t0 = await tete()) {
  const t = await r.tour();
  if (t.fait) envoisR.push({ ...t, tete: t0, rc: await attendreRecu(t.hash) });
  await rpc('anvil_mine', ['0x3']);
}
await r.tour();
const idsR = envoisR.flatMap((x) => x.ids);
vu(envoisR.every((x) => x.cible === 'rollsJoues' && x.quoi === 'settleMany' && x.rc && x.rc.status === '0x1'), envoisR.length + ' tx settleMany du regleur, toutes incluses (status 0x1)');
vu(JSON.stringify([...idsR].sort()) === JSON.stringify(gagnantsR.map((z) => String(z.id)).sort()), 'les ids envoyes = EXACTEMENT les gagnants (' + idsR.join(',') + ') ; aucun perdant, pas le perdu (#' + perdu.id + ')');
const settledR = envoisR.flatMap((x) => x.rc.logs.filter((l) => l.address.toLowerCase() === rolls && l.topics[0] === T_RS).map((l) => ({ id: BigInt(l.topics[1]), joueur: '0x' + l.topics[2].slice(26), payout: mots(l.data)[7] })));
vu(settledR.length === gagnantsR.length && settledR.every((s) => s.joueur === JOUEUR && s.payout === gagnantsR.find((z) => z.id === s.id).prix), settledR.length + ' Settled du contrat : chacun au JOUEUR du roll, payout = le prix du contrat (payoutFor)');
vu((await solde(usdc, JOUEUR)) - j0 === attenduR, 'le joueur touche EXACTEMENT ' + attenduR + ' (unites USDC) ; le regleur 0');
vu(envoisR.every((x) => x.tete + 1 <= Math.min(...gagnantsR.filter((z) => x.ids.includes(String(z.id))).map((z) => z.t + 256)) && x.tete >= Math.max(...gagnantsR.filter((z) => x.ids.includes(String(z.id))).map((z) => z.t))), 'chaque lot envoye a une tete DANS la fenetre de chacun de ses rolls (cible < tete, tete + 1 <= cible + 256)');
const txsR = await Promise.all(envoisR.map((x) => rpc('eth_getTransactionByHash', [x.hash])));
vu(txsR.every((tx) => tx.from.toLowerCase() === REG && tx.to.toLowerCase() === rolls && tx.input.startsWith('0x' + sel('settleMany(uint256[])')) && BigInt(tx.value) === 0n && BigInt(tx.chainId) === 8453n), 'chaque tx : from = le regleur, to = BlockRolls, settleMany, value 0, chaine 8453');
vu((await Promise.all(perdantsR.map((z) => statutRoll(z.id)))).every((s) => s === 1) && (await statutRoll(perdu.id)) === 1, 'les perdants et le perdu restent Pending (le regleur ne les a jamais envoyes)');
vu((await Promise.all(gagnantsR.map((z) => statutRoll(z.id)))).every((s) => s === 2), 'les gagnants sont Settled sur la chaine');

/* ================================================================ B. BlockDuelsV2 */
await rpc('anvil_mine', ['0x' + (300).toString(16)]); /* les rolls de A sortent de leur fenetre */
const STAKE = 2_000000n;
const T_DS = topic('Settled(uint256,bytes32,uint8,uint8,address,uint256)');
const pot2 = 2n * STAKE, w9 = (pot2 * 9000n) / 10000n, p7 = (pot2 * 700n) / 10000n, dv = pot2 - w9 - p7;
const faceV2 = async (h) => mots(await rpc('eth_call', [{ to: v2, data: '0x' + sel('faceOf(bytes32)') + h.slice(2) }, 'latest'])).map(Number);
const statutDuel = async (id) => Number(mots(await rpc('eth_call', [{ to: v2, data: '0x' + sel('duels(uint256)') + mot(id) }, 'latest']))[2]);
let idDuel = 0n;
/* des guesses pseudo-aleatoires (graine fixe : le banc est rejouable a guesses egaux ; les hashes, eux, dependent d anvil) ; un sur cinq
 *   avec les MEMES guesses (egalite certaine). Mesure 2026-11-05 : avec les guesses du banc frere, 0 rejoignant gagnant sur 18 — le cas
 *   central n etait pas exerce (le temoin « les trois cas vus » l a dit KO) : d ou ce generateur et la boucle jusqu aux trois cas. */
let graine = 20261105;
const alea = (m) => { graine = (graine * 1103515245 + 12345) % 2147483648; return graine % m; };
const RANGS = [6, 10, 19, 9, 8];
async function nouveauDuel(k) {
  const gAn = RANGS.map(alea);
  const gBn = k % 5 === 4 ? gAn : RANGS.map(alea);
  await envoyer(JOUEUR, usdc, '0x' + sel('approve(address,uint256)') + adr(v2) + mot(STAKE));
  await envoyer(JOUEUR, v2, '0x' + sel('create(address,uint256,uint8[5],uint64)') + adr(usdc) + mot(STAKE) + gAn.map(mot).join('') + mot(3600n));
  idDuel += 1n;
  await envoyer(B1, usdc, '0x' + sel('approve(address,uint256)') + adr(v2) + mot(STAKE));
  const rJ = await envoyer(B1, v2, '0x' + sel('join(uint256,uint8[5])') + mot(idDuel) + gBn.map(mot).join(''));
  return { id: idDuel, cible: parseInt(rJ.blockNumber, 16) + 2, gAn, gBn };
}
async function classerDuel(d) {
  d.h = await hashDe(d.cible); const fC = await faceV2(d.h);
  d.sA = d.gAn.reduce((s, x, i) => s + (x === fC[i] ? 1 : 0), 0); d.sB = d.gBn.reduce((s, x, i) => s + (x === fC[i] ? 1 : 0), 0);
  d.parite = JSON.stringify(faceDuHash(d.h)) === JSON.stringify(fC);
  d.attendu = d.sA === d.sB ? 'egalite' : d.sA > d.sB ? 'createur' : 'rejoignant';
}
/* des duels jusqu a voir >= 2 rejoignants gagnants, >= 1 createur gagnant, >= 1 egalite (au plus 36 : 4 blocs chacun, 144 blocs — le
 *   premier reste avant sa marge de fin, cible + 179, quand le regleur commence) */
const lot = [];
const compte = (a) => lot.filter((d) => d.attendu === a).length;
for (let k = 0; k < 36 && !(compte('rejoignant') >= 2 && compte('createur') >= 1 && compte('egalite') >= 1); k++) {
  lot.push(await nouveauDuel(k));
  for (const d of lot) if (!d.attendu && (await tete()) >= d.cible) await classerDuel(d);
}
await rpc('anvil_mine', ['0x3']);
for (const d of lot) if (!d.attendu) await classerDuel(d);
const soldes = async () => ({ a: await solde(usdc, JOUEUR), b: await solde(usdc, B1), p: await solde(usdc, POOL), d: await solde(usdc, DEV), k: await solde(usdc, REG) });
const av = await soldes();
const envoisD = new Map(), autres = [];
const finLot = Math.max(...lot.map((d) => d.cible)) + 256;
for (let t0 = await tete(); t0 + 1 <= finLot; t0 = await tete()) {
  const t = await r.tour();
  if (t.fait && t.cible === 'duelsV2') envoisD.set(t.ids[0], { ...t, tete: t0, rc: await attendreRecu(t.hash) });
  else if (t.fait) autres.push(t.cible + ':' + t.quoi + ':' + t.ids.join(','));
  await rpc('anvil_mine', ['0x4']);
}
await r.tour();
const marge = r.etat().bornes.margeFinDuelBlocs;
const vus = { createur: 0, rejoignant: 0, egalite: 0 }, issues = [];
for (const d of lot) {
  const e = envoisD.get(String(d.id));
  let ok = d.parite, texte = '#' + d.id + ' ' + d.sA + '/' + d.sB + ' ' + d.attendu;
  if (d.attendu !== 'rejoignant') { ok = ok && !e; texte += ' jamais envoye'; } else {
    const ev = e && e.rc ? e.rc.logs.find((l) => l.address.toLowerCase() === v2 && l.topics[0] === T_DS) : null;
    const gagnant = ev ? '0x' + mots(ev.data)[3].toString(16).padStart(40, '0') : null;
    const tx = e ? await rpc('eth_getTransactionByHash', [e.hash]) : null;
    const txOk = !!tx && tx.from.toLowerCase() === REG && tx.to.toLowerCase() === v2 && tx.input === '0x' + sel('settle(uint256)') + mot(d.id) && BigInt(tx.value) === 0n && BigInt(tx.chainId) === 8453n;
    const bloc = e && e.rc ? parseInt(e.rc.blockNumber, 16) : null;
    ok = ok && !!e && e.rc && e.rc.status === '0x1' && txOk && gagnant === B1 && e.tete + 1 >= d.cible + 256 - marge && bloc <= d.cible + 256 && (await statutDuel(d.id)) === 3;
    texte += ' envoye a +' + (e ? e.tete - d.cible : '?') + ', inclus a +' + (bloc !== null ? bloc - d.cible : '?');
  }
  vus[d.attendu] += 1;
  issues.push({ ok, texte });
}
const ap = await soldes();
const nR = vus.rejoignant;
vu(vus.createur >= 1 && vus.rejoignant >= 1 && vus.egalite >= 1, 'les trois cas vus : ' + JSON.stringify(vus) + ' (marge de fin ' + marge + ' blocs)');
vu(issues.every((x) => x.ok) && autres.length === 0, lot.length + ' duels v2 — face JS = contrat ; createur et egalite JAMAIS envoyes ; rejoignant : settle(id) du regleur dans les ' + marge + ' derniers blocs, inclus dans la fenetre, Settled a B1 : ' + issues.map((x) => (x.ok ? '' : 'KO ') + x.texte).join(' ; ') + (autres.length ? ' ; AUTRES ' + autres.join(',') : ''));
vu(ap.b - av.b === BigInt(nR) * w9 && ap.a === av.a && ap.p - av.p === BigInt(nR) * p7 && ap.d - av.d === BigInt(nR) * dv && ap.k === av.k, 'soldes : rejoignant +' + nR + ' x 90 % ; createur inchange (ses duels attendent le defaut) ; pot commun et dev leur part ; le regleur 0 USDC');
/* apres la fenetre : settleDefault par un TIERS donne chaque duel non regle (createur gagnant ET egalite) au createur — la regle v2 intacte */
await rpc('anvil_mine', ['0x2']);
const nonRegles = lot.filter((d) => d.attendu !== 'rejoignant');
const avD = await soldes();
for (const d of nonRegles) await envoyer(TIERS, v2, '0x' + sel('settleDefault(uint256)') + mot(d.id));
const apD = await soldes();
vu(apD.a - avD.a === BigInt(nonRegles.length) * w9 && (await Promise.all(nonRegles.map((d) => statutDuel(d.id)))).every((s) => s === 6), nonRegles.length + ' duels non regles (createur ' + vus.createur + ', egalite ' + vus.egalite + ') : settleDefault les donne au createur (Defaulted) — le regleur n a rien change a la regle v2');

/* ================================================================ le regleur */
const e = r.etat();
const recus = [...envoisR.map((x) => x.rc), ...[...envoisD.values()].map((x) => x.rc)];
const gas = recus.reduce((s, rc) => s + BigInt(rc.gasUsed) * BigInt(rc.effectiveGasPrice), 0n);
vu(e0 - BigInt(await rpc('eth_getBalance', [REG, 'latest'])) === gas && (await solde(usdc, REG)) === 0n, 'le regleur ne paie que le gas (' + gas + ' wei, ' + recus.length + ' tx) et ne touche aucun USDC');
vu(e.etat === 'ON' && e.echecsSuite === 0 && e.compteurs.reverts === 0 && e.contrats.rollsJoues.inclus === envoisR.length && e.contrats.duelsV2.inclus === nR && e.contrats.duelsV2.createursGagnants === vus.createur && e.contrats.duelsV2.egalites === vus.egalite,
  'etat() : ON, 0 echec, 0 revert ; rollsJoues ' + e.contrats.rollsJoues.inclus + ' tx, duelsV2 ' + e.contrats.duelsV2.inclus + ' tx ; classes : createur ' + e.contrats.duelsV2.createursGagnants + ', egalite ' + e.contrats.duelsV2.egalites);
vu(!JSON.stringify(e).includes('0'.repeat(63) + '1') && !journal.join('\n').includes('0'.repeat(63) + '1'), 'la cle n est ni dans etat() ni dans le journal');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS Base');
process.exit(ko ? 1 : 0);
