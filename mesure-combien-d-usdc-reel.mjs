/* mesure-combien-d-usdc-reel.mjs — « liq $210k », C EST COMBIEN D USDC POUR DE VRAI ?
 *
 * ⛔⛔ LA QUESTION DE PHIL, MOT POUR MOT (2026-09-26) : « ca veut dire qu il possede combien d USDC
 *     reel ? car creer un block en USDC en leur donnant les 1B cause un serieux probleme a fix ».
 *
 * ⛔ CE QU UN CHIFFRE DE « LIQUIDITE » N EST PAS. DexScreener annonce une liquidite en dollars :
 *   c est une VALORISATION des deux reserves au prix courant, pas une somme d argent deposee. Une
 *   pool qui ne contient QUE des jetons et zero dollar peut afficher une « liquidite » elevee, parce
 *   que ses jetons sont valorises au dernier prix — un prix que personne n a eu a payer.
 *   ⇒ La seule reponse honnete est le SOLDE REEL du contrat. C est ce qu on lit ici.
 *
 * ⛔ EN UNISWAP v4 IL N Y A PAS DE CONTRAT DE POOL : les jetons vivent dans le PoolManager, un
 *   singleton partage par toutes les pools. Lire son solde ne dirait rien d UNE pool. On ne lit donc
 *   que les pools qui sont de VRAIS contrats — Aerodrome et Uniswap v3 — et on le DIT plutot que de
 *   donner un chiffre v4 qu on ne sait pas isoler.
 *
 * ⚠️ Toutes les adresses sont COPIEES de la reponse de l index public, jamais reconstruites.
 */
import { selecteur } from './keccak.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const sel = (s) => { const x = selecteur(s); return x.startsWith('0x') ? x : '0x' + x; };
const pad = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');

const MUC = '0xb200000000000000000000Fd2f87532B90095211';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const POOLS = [
  ['aerodrome', '0x17e1bEB2cD65493Da73ed4BbbC7BEcAAa0F91C73'],
  ['uniswap v3', '0x8fAc72F692B6fA8ebc54806563883fB3265130aA'],
];

const souffler = (ms = 250) => new Promise((r) => setTimeout(r, ms));
async function appel(to, data) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }) });
  const j = await r.json();
  return j.error ? { erreur: j.error.message || String(j.error.code) } : { ok: j.result };
}
const nombre = (brut, dec) => {
  const n = BigInt(brut), d = 10n ** BigInt(dec);
  return (Number(n / d) + Number(n % d) / Number(d));
};

console.log('═══ COMBIEN D USDC REEL DORT DANS CES POOLS ? ═══\n');
console.log('  selecteur balanceOf : ' + sel('balanceOf(address)'));
console.log('  block MUc  : ' + MUC);
console.log('  devise USDC: ' + USDC + '  (6 decimales)\n');

for (const [nom, pool] of POOLS) {
  await souffler();
  const code = await appel(pool, '');
  const u = await appel(USDC, sel('balanceOf(address)') + pad(pool));
  await souffler();
  const m = await appel(MUC, sel('balanceOf(address)') + pad(pool));
  await souffler();
  const d = await appel(MUC, sel('decimals()'));
  const decM = d.erreur ? null : Number(BigInt(d.ok));
  console.log('── ' + nom + ' · ' + pool + ' ──');
  if (u.erreur) console.log('  USDC : NON LU (' + u.erreur.slice(0, 40) + ') — pas zero');
  else console.log('  USDC detenu par la pool : ' + nombre(u.ok, 6).toLocaleString('fr-FR') + ' USDC');
  if (m.erreur || decM === null) console.log('  MUc  : NON LU — pas zero');
  else console.log('  MUc  detenu par la pool : ' + nombre(m.ok, decM).toLocaleString('fr-FR') + ' MUc  (decimales ' + decM + ')');
  console.log('');
}

/* ── la supply, qui est l autre moitie de la question de Phil ───────────────────────────────── */
await souffler();
const sup = await appel(MUC, sel('totalSupply()'));
const d2 = await appel(MUC, sel('decimals()'));
if (!sup.erreur && !d2.erreur) {
  const dec = Number(BigInt(d2.ok));
  console.log('── la supply du block ──');
  console.log('  totalSupply = ' + nombre(sup.ok, dec).toLocaleString('fr-FR') + ' MUc');
  console.log('  ⛔ A COMPARER AU 1 000 000 000 que notre app frappe par defaut : si ce block-ci');
  console.log('    n en a pas un milliard, alors le « 1B donne au createur » n est PAS ce que fait');
  console.log('    ce marche-la, et il ne faut pas lui preter notre propre modele.');
}

console.log('\n── CE QUE CETTE SONDE NE DIT PAS ──');
console.log('⛔ La part v4 : en Uniswap v4 les jetons vivent dans le PoolManager, un singleton.');
console.log('   Son solde ne dit rien d UNE pool. Le chiffre v4 est donc ABSENT, pas nul.');
console.log('⛔ Qui a depose quoi : un solde est un etat, pas une histoire. Il faudrait lire les');
console.log('   evenements de mint pour savoir qui a mis l USDC.');
console.log('⛔ Ce que « liq $210k » de DexScreener recouvre exactement : leur formule est a eux.');
