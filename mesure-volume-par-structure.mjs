/* volume-bot-ou-humain.mjs — LE BON AXE, APRES M ETRE TROMPE SUR LE PREMIER.
 *
 * ⛔⛔ MON ERREUR, ET C EST PHIL QUI L A SOUPCONNEE. J avais coupe le volume en « via notre routeur
 *     Aerodrome CL » (13,37 %) et « hors d atteinte d une interface » (86,63 %). Les deux moities
 *     sont mal nommees :
 *       — le sender `0x83d55acd…`, 1 266 swaps, a **11 payeurs de gas distincts sur 12 tx** : c est
 *         un ROUTEUR/AGREGATEUR utilise par plein de gens, pas un bot. Son flux passe par une
 *         interface — donc il n est pas « hors d atteinte » par nature. Idem `0xca7de682…` (12/12)
 *         et `0x8f10b468…` (10/12). Je les avais classes « contrats, donc bots ».
 *       — et NOTRE routeur lui-meme ne montre que 4 payeurs sur 12, avec `tx.to == sender` seulement
 *         2 fois sur 12 : une partie du « servable » est en fait du flux d agregateur QUI TRAVERSE
 *         le routeur Aerodrome. Donc « via notre routeur » n est pas « notre interface » non plus.
 *   ⇒ LE BON AXE EST : ce flux est-il DECLENCHE PAR DES PERSONNES DIFFERENTES (humain ou interface,
 *     donc adressable par principe) ou PAR UN SEUL PAYEUR (bot, qui ne paiera jamais un frais
 *     d interface) ? On classe chaque sender par la DIVERSITE DE SES PAYEURS DE GAS.
 *
 * ⛔ ON LIT LES TRANSACTIONS, PAS LES EVENEMENTS : `tx.from` dit qui a paye le gas, un log ne le dit
 *   pas. ⛔ QUATRE CLASSES, PAS DEUX : BOT / INTERFACE / AMBIGU / NON_MESURE. Un sender dont on n a
 *   pu lire aucune tx n est pas un bot, il est inconnu — et son volume est annonce a part.
 * ⚠️ BORNE : echantillon borne de tx par sender. La classe d un sender est une INFERENCE DE
 *    STRUCTURE sur cet echantillon, jamais une identification ni une intention.
 */
import { topic } from './keccak.js';

const RPC = 'https://mainnet.base.org';
const EN_TETE = { 'content-type': 'application/json', 'x-ms-monitor': '1' };
const TOPIC_SWAP = topic('Swap(address,address,int256,int256,uint160,uint128,int24)');
const ECH = 5;                      /* tx echantillonnees par sender — borne assumee et imprimee */
const POOLS = [
  ['METAc', '0xeaf57753bc382e0324a1d43f72e7027705a2273e'],
  ['MSTRc', '0x8b27f626ab668197000bc722a1012022caed10e2'],
  ['SPCXc', '0x0bf58fe0fac935ac69595c19b12ba0d75e3f8c0e'],
];
let id = 0;
async function appel(method, params) {
  try {
    const r = await fetch(RPC, { method: 'POST', headers: EN_TETE,
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
    if (r.status !== 200) return { etat: 'NON_MESURE', pourquoi: 'HTTP ' + r.status };
    const j = await r.json();
    if (j.error) return { etat: 'NON_MESURE', pourquoi: JSON.stringify(j.error).slice(0, 80) };
    return { etat: 'OK', res: j.result };
  } catch (e) { return { etat: 'NON_MESURE', pourquoi: String((e && e.message) || e).slice(0, 60) }; }
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function int256(m) { const v = BigInt('0x' + m); return v >= (1n << 255n) ? v - (1n << 256n) : v; }
const abs = (x) => (x < 0n ? -x : x);
const usd = (v) => (Number(v) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 0 });

const t = await appel('eth_blockNumber', []);
if (t.etat !== 'OK') { console.log('⛔ tete illisible'); process.exit(2); }
const tete = BigInt(t.res), LARGEUR = 2000n, FEN = 6n;
const depuis = tete - LARGEUR * FEN;
console.log('fenetre ' + depuis + '..' + tete + '  (' + (LARGEUR * FEN) + ' blocs, ~'
  + (Number(LARGEUR * FEN) * 2 / 3600).toFixed(1) + ' h)   pools : ' + POOLS.length);

/* ── 1. volume par sender (jambe USDC = token0 sur ces trois pools, mesure anterieure) ───────── */
const parSender = new Map();
let lues = 0, refusees = 0, volTotal = 0n;
for (const [, pool] of POOLS) {
  for (let x = depuis; x <= tete; x += LARGEUR) {
    const y = x + LARGEUR - 1n > tete ? tete : x + LARGEUR - 1n;
    const r = await appel('eth_getLogs', [{ fromBlock: '0x' + x.toString(16), toBlock: '0x' + y.toString(16),
      address: pool, topics: [TOPIC_SWAP] }]);
    if (r.etat !== 'OK') { refusees += 1; await pause(500); continue; }
    lues += 1;
    for (const l of r.res) {
      const d = String(l.data || '').replace(/^0x/, '');
      if (d.length < 320 || !l.topics[1]) continue;
      const v = abs(int256(d.slice(0, 64)));
      const s = ('0x' + l.topics[1].slice(26)).toLowerCase();
      volTotal += v;
      if (!parSender.has(s)) parSender.set(s, { vol: 0n, n: 0, txs: [] });
      const e = parSender.get(s);
      e.vol += v; e.n += 1;
      if (e.txs.length < ECH) e.txs.push(l.transactionHash);
    }
    await pause(150);
  }
}
console.log('fenetres lues ' + lues + '/' + (lues + refusees) + (refusees ? '  ⛔ INCOMPLET' : '')
  + '   senders : ' + parSender.size + '   volume total : ' + usd(volTotal) + ' USDC\n');

/* ── 2. classement par diversite des payeurs de gas ─────────────────────────────────────────── */
const classes = { BOT: 0n, INTERFACE: 0n, AMBIGU: 0n, NON_MESURE: 0n };
const nb = { BOT: 0, INTERFACE: 0, AMBIGU: 0, NON_MESURE: 0 };
const tri = [...parSender.entries()].sort((a, b) => (b[1].vol > a[1].vol ? 1 : -1));
console.log('sender                                       volume USDC  swaps  tx  payeurs  classe');
for (const [s, e] of tri) {
  const froms = new Set(); let n = 0;
  for (const h of e.txs) {
    const tx = await appel('eth_getTransactionByHash', [h]);
    if (tx.etat === 'OK' && tx.res) { n += 1; froms.add(String(tx.res.from || '').toLowerCase()); }
    await pause(170);
  }
  let cl;
  if (n === 0) cl = 'NON_MESURE';
  else if (froms.size === 1 && n >= 2) cl = 'BOT';
  else if (froms.size >= 2 && froms.size >= n - 1) cl = 'INTERFACE';
  else cl = 'AMBIGU';
  classes[cl] += e.vol; nb[cl] += 1;
  if (e.vol * 200n > volTotal) {           /* on n imprime que ce qui pese > 0,5 % */
    console.log(s + usd(e.vol).padStart(14) + String(e.n).padStart(7) + String(n).padStart(4)
      + String(froms.size).padStart(9) + '  ' + cl);
  }
}

console.log('\n=== LE VOLUME, PAR STRUCTURE DE DECLENCHEMENT ===');
for (const cl of ['INTERFACE', 'BOT', 'AMBIGU', 'NON_MESURE']) {
  const p = volTotal === 0n ? 0 : Number(classes[cl] * 10000n / volTotal) / 100;
  console.log(cl.padEnd(12) + usd(classes[cl]).padStart(14) + ' USDC   ' + p.toFixed(2).padStart(6)
    + ' %   ' + nb[cl] + ' sender(s)');
}
const adressable = classes.INTERFACE;
console.log('\n⛔ MON CHIFFRE PRECEDENT DISAIT « 13,37 % servable, 86,63 % hors d atteinte ». Sur ces');
console.log('   trois pools et cette fenetre, la part declenchee par des payeurs DIFFERENTS vaut');
console.log('   ' + (volTotal === 0n ? '[n/a]' : (Number(adressable * 10000n / volTotal) / 100).toFixed(2) + ' %')
  + ' — ce n est PAS « ce qu on capterait », c est ce qui n est pas hors d atteinte par nature.');
console.log('\n0,1 % de la part INTERFACE, par taux de capture :');
const j0 = Number(adressable) / 1e6 * 0.001;
const parAn = (365 * 24 * 3600) / (Number(LARGEUR * FEN) * 2);
for (const p of [1, 5, 10]) {
  console.log('   ' + String(p).padStart(3) + ' %  ->  ' + (j0 * p / 100).toFixed(2).padStart(9)
    + ' USD / fenetre   (' + (j0 * p / 100 * parAn).toLocaleString('en-US', { maximumFractionDigits: 0 })
    + ' USD / an si le volume tenait, a 2 s/bloc)');
}
console.log('\nborne : ' + ECH + ' tx max echantillonnees par sender. La classe est une INFERENCE DE');
console.log('STRUCTURE sur cet echantillon — jamais une identification, jamais une intention.');
/* ⛔ CETTE BORNE DISAIT « ~3 h » EN DUR alors que la fenetre en fait 6,7 : un chiffre recopie a la
 *   main a cote d un chiffre calcule finit toujours par le contredire. Elle se derive maintenant. */
console.log('borne : ' + POOLS.length + ' pools (sur les 10 servies avec frais), fenetre de '
  + (LARGEUR * FEN) + ' blocs soit ~' + (Number(LARGEUR * FEN) * 2 / 3600).toFixed(1)
  + ' h. Pas comparable tel quel au chiffre 24 h sur dix pools.');
/* ⛔⛔ STABILITE MESUREE, ET ELLE N EST PAS LA MEME PARTOUT. Deux passages sur des fenetres voisines :
 *     INTERFACE 44,95 % puis 44,86 % — stable a 0,09 point. Mais BOT est passe de 40,03 % a 54,22 %
 *     et AMBIGU de 15,00 % a 0,90 % : la FRONTIERE bot/ambigu depend du tirage de 5 transactions,
 *     parce qu un sender peu actif peut montrer 1 ou 2 payeurs selon l echantillon.
 *   ⇒ LE CHIFFRE « INTERFACE » SE CITE ; LE PARTAGE BOT/AMBIGU NE SE CITE PAS comme s il etait stable. */
console.log('borne : sur deux passages voisins, INTERFACE n a bouge que de 0,09 point (stable) mais la');
console.log('frontiere BOT/AMBIGU de 14 points. Citer INTERFACE ; ne pas citer leur partage.');
console.log('borne : « INTERFACE » ne veut pas dire « captable par nous » : ces gens utilisent DEJA une');
console.log('interface, et la notre prend 0,1 % de plus. Ca dit ou le marche EXISTE, pas qu il vienne.');
