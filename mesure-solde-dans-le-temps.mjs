/* LE SOLDE D UNE ADRESSE DANS LE TEMPS — avec temoin d archive obligatoire.
 *
 * Ne par une vraie surprise le 2026-09-30 : le wallet de frais a PERDU
 * 0,00206209 ETH en 24 h. Sans serie dans le temps, un solde ne dit pas son sens.
 *
 * ⛔ LECTURE SEULE. x-ms-monitor: 1.
 * ⛔ Le temoin d archive tourne D ABORD. Un noeud non-archive rend l etat courant pour
 *   une hauteur passee SANS erreur : la serie serait plate, et « plat » se lirait
 *   « stable » alors que ca veut dire « aveugle ».
 *
 * Usage : node mesure-solde-dans-le-temps.mjs [adresse]
 *   defaut = le wallet de frais lu dans frais-creation.js
 */
import { FEE_WALLET } from './frais-creation.js';
import { verdictArchive, serieExploitable, phraseArchive } from './temoin-archive.js';

const RPC = 'https://mainnet.base.org';
/* ⛔ Adresse temoin : le PoolManager Uniswap v4 sur Base. Son solde DOIT bouger.
 *   Si elle ne bouge pas, c est l instrument qui est casse, pas la chaine. */
const TEMOIN = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const CIBLE = (process.argv[2] || FEE_WALLET).toLowerCase();
const PAS_24H = 43200n;   /* ~2 s par bloc sur Base */
const RECULS = [0n, 1n, 2n, 3n, 5n, 10n];

const dors = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params, essais = 6) {
  for (let i = 0; i < essais; i += 1) {
    const r = await fetch(RPC, { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (r.status === 429) { await dors(1200 * (i + 1)); continue; }
    const j = await r.json();
    if (j.error) return { err: String(j.error.message).slice(0, 70) };
    return { val: j.result };
  }
  return { err: 'NON_MESURE' };
}
const eth = (w) => (Number(w) / 1e18).toFixed(12);
async function soldeA(adr, h) {
  const b = await rpc('eth_getBalance', [adr, '0x' + h.toString(16)]);
  return b.err ? null : BigInt(b.val);
}

const t = await rpc('eth_blockNumber', []);
if (t.err) { console.log('⛔ tete illisible'); process.exit(1); }
const tete = BigInt(t.val);
const hauteurs = RECULS.map((d) => tete - d * PAS_24H);

/* --- 1. TEMOIN D ARCHIVE --- */
const serieT = [];
for (const h of hauteurs) { serieT.push(await soldeA(TEMOIN, h)); await dors(150); }
const v = verdictArchive(serieT);
console.log('temoin d archive  ' + TEMOIN);
console.log('  ' + phraseArchive(v));
if (!serieExploitable(v)) {
  console.log('  ⇒ Je ne mesure RIEN sur la cible : la serie serait un artefact.');
  process.exit(1);
}
console.log('');

/* --- 2. LA CIBLE --- */
console.log('cible  ' + CIBLE + (CIBLE === FEE_WALLET.toLowerCase() ? '   (wallet de frais)' : ''));
const code = await rpc('eth_getCode', [CIBLE, 'latest']);
const estContrat = !code.err && code.val && code.val !== '0x';
console.log('  type  ' + (estContrat ? 'CONTRAT (' + ((code.val.length - 2) / 2) + ' o)' : 'EOA'));
if (estContrat) {
  console.log('  ⚠️ CONTRAT : le nonce compte les contrats QU IL CREE, pas l ETH qu il envoie.');
  console.log('     Lire son nonce comme celui d un EOA transforme un solde en « revenu total ».');
}
console.log('');
const serie = [];
for (let i = 0; i < hauteurs.length; i += 1) {
  const h = hauteurs[i];
  const s = await soldeA(CIBLE, h);
  serie.push({ h, s, recul: RECULS[i] });
  console.log('  bloc ' + String(h).padStart(9) + '  (-' + String(RECULS[i]).padStart(2) + ' j)  '
    + (s === null ? '⛔ trou' : eth(s) + ' ETH'));
  await dors(150);
}
console.log('');

/* --- 3. LES VARIATIONS, du plus ancien au plus recent --- */
const lus = serie.filter((x) => x.s !== null).sort((a, b) => Number(a.h - b.h));
if (lus.length < 2) { console.log('⛔ moins de 2 hauteurs lues ⇒ aucune variation calculable.'); process.exit(1); }
console.log('=== VARIATIONS ===');
let bouge = 0;
for (let i = 1; i < lus.length; i += 1) {
  const d = lus[i].s - lus[i - 1].s;
  if (d === 0n) continue;
  bouge += 1;
  console.log('  ' + (d > 0n ? 'HAUSSE ' : 'BAISSE ') + eth(d > 0n ? d : -d) + ' ETH'
    + '   entre les blocs ' + lus[i - 1].h + ' et ' + lus[i].h);
}
if (!bouge) console.log('  aucune variation sur les hauteurs lues (temoin d archive OK, donc c est un vrai plat)');
console.log('');
console.log('⚠️ BORNES');
console.log('   · ' + lus.length + ' hauteurs, pas un historique continu : deux mouvements qui');
console.log('     s annulent entre deux points restent INVISIBLES.');
console.log('   · Une BAISSE peut etre du gas paye legitimement. Une variation prouve une');
console.log('     STRUCTURE, jamais une intention — on ne nomme personne.');
console.log('   · L ETH nu n emet aucun log : ces variations ne sont pas datables par getLogs.');
