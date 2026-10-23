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
 * NE PROUVE PAS : Base (sequenceur, prix du gas reel, noeuds publics) ; le contrat n est pas deploye sur Base. */
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
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions) ; NE PROUVE PAS Base');
process.exit(ko ? 1 : 0);
