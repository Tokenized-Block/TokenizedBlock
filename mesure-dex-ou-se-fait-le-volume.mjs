/* mesure-dex-ou-se-fait-le-volume.mjs — UN DEX DEDIE AURAIT-IL QUOI QUE CE SOIT A ECHANGER ?
 *
 * ⛔⛔ POURQUOI CETTE SONDE EXISTE. Un agent a rendu un design de DEX ; son verificateur l a REFUTE
 *     (verdict surclaime : le swap ne marche que pour un wallet ayant DEJA ses deux approbations
 *     Permit2). Phil : « continue le dig sur le DEX avec des mesures cette fois ».
 *   ⇒ On ne repart donc pas d un design. On repart du seul chiffre qui decide s il y a un produit :
 *     OU SE FAIT LE VOLUME AUJOURD HUI, et quelle part passe par nous.
 *
 * ⛔ LA QUESTION N EST PAS « SAIT-ON CONSTRUIRE UN DEX » — la reponse est oui et elle n apprend
 *   rien. La question est : reste-t-il du volume a capter, et a quel endroit precis de la chaine ?
 *   Un carnet d ordres pose sur un marche qui fait zero echange fait zero echange.
 *
 * CE QU ON MESURE, ET SUR QUOI :
 *   1. Les dix actions tokenisees : leur volume 24 h, et sur quel DEX il se fait.
 *   2. Nos blocks : le volume reel, lu par notre propre serveur (/api/trending), donc la MEME
 *      source que l ecran — une sonde qui use une autre source dirait autre chose que l app.
 *   3. Le rapport des deux, qui est la seule chose qui compte pour decider.
 *
 * ⛔ CE QUE CETTE SONDE NE DIT PAS : si un DEX dedie SERAIT utilise. Elle dit ce qui s echange
 *   aujourd hui et ou. Le reste est un pari, et un pari doit s annoncer comme tel.
 *
 * ⚠️ LECTURE SEULE. Aucune signature, aucune cle.
 */
import { ACTIONS_COINBASE } from './paires.js';

const souffler = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const usd = (n) => Math.round(Number(n) || 0).toLocaleString('en-US') + ' $';

async function pools(adr) {
  try {
    const r = await fetch('https://api.dexscreener.com/tokens/v1/base/' + adr,
      { signal: AbortSignal.timeout(9000), headers: { accept: 'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    return (Array.isArray(j) ? j : []).filter((x) => String(x.baseToken && x.baseToken.address).toLowerCase() === adr);
  } catch (_) { return null; }
}

console.log('═══ OU SE FAIT LE VOLUME, ET QUELLE PART PASSE PAR NOUS ? ═══\n');

/* ── 1. les actions tokenisees ───────────────────────────────────────────────────────────────── */
console.log('── 1. les ' + ACTIONS_COINBASE.length + ' actions tokenisees que nous proposons ──');
let volActions = 0, liqActions = 0, nonLues = 0;
const parDex = new Map();
for (const a of ACTIONS_COINBASE) {
  await souffler();
  const p = await pools(a.adr.toLowerCase());
  if (!p) { console.log('  ' + a.symbole.padEnd(7) + ' ⛔ NON LUE'); nonLues++; continue; }
  const v = p.reduce((s, x) => s + (Number(x.volume && x.volume.h24) || 0), 0);
  const l = p.reduce((s, x) => s + (Number(x.liquidity && x.liquidity.usd) || 0), 0);
  volActions += v; liqActions += l;
  for (const x of p) {
    const d = x.dexId || '?';
    parDex.set(d, (parDex.get(d) || 0) + (Number(x.volume && x.volume.h24) || 0));
  }
  console.log('  ' + a.symbole.padEnd(7) + ' ' + p.length + ' pool(s)  vol24h ' + usd(v).padStart(14)
    + '  liq ' + usd(l).padStart(14));
}
if (nonLues) console.log('  ⛔ ' + nonLues + ' non lue(s) : « pas regarde » n est pas « rien trouve ».');
console.log('  ------------------------------------------------------------');
console.log('  TOTAL actions : vol24h ' + usd(volActions) + ' · liquidite ' + usd(liqActions));
console.log('  par DEX :');
for (const [d, v] of [...parDex].sort((a, b) => b[1] - a[1])) {
  console.log('    ' + d.padEnd(14) + usd(v).padStart(14)
    + '  ' + (volActions > 0 ? (v / volActions * 100).toFixed(1) + ' %' : '—'));
}

/* ── 2. nos blocks, lus par NOTRE serveur ────────────────────────────────────────────────────── */
console.log('\n── 2. nos blocks, lus par notre propre serveur (la MEME source que l ecran) ──');
let nous = null;
try {
  const r = await fetch('https://tokenizedblock.space/api/trending', {
    signal: AbortSignal.timeout(20000), headers: { accept: 'application/json', 'x-ms-monitor': '1' } });
  nous = r.ok ? await r.json() : null;
} catch (e) { console.log('  ⛔ /api/trending NON LU : ' + String(e.message).slice(0, 60)); }

let volBlocks = 0, liqBlocks = 0, nBlocks = 0;
if (nous && Array.isArray(nous.lignes)) {
  const L = nous.lignes;
  nBlocks = L.length;
  volBlocks = L.reduce((s, x) => s + (Number(x.volume24hUsd) || 0), 0);
  liqBlocks = L.reduce((s, x) => s + (Number(x.liquiditeUsd) || 0), 0);
  console.log('  blocks suivis   : ' + nous.blocksSuivis);
  console.log('  avec un marche  : ' + nBlocks);
  console.log('  volume 24 h     : ' + usd(volBlocks));
  console.log('  liquidite       : ' + usd(liqBlocks));
  /* ⛔ LA MEDIANE PLUTOT QUE LA MOYENNE : quelques blocks tres actifs masqueraient les autres. */
  const v = L.map((x) => Number(x.volume24hUsd) || 0).sort((a, b) => a - b);
  console.log('  volume median   : ' + usd(v[Math.floor(v.length / 2)])
    + '   (max ' + usd(v[v.length - 1]) + ')');
  const morts = v.filter((x) => x < 100).length;
  console.log('  ⛔ blocks sous 100 $ de volume en 24 h : ' + morts + ' / ' + nBlocks);
} else if (nous) {
  console.log('  ⛔ reponse sans `lignes` — cles : ' + Object.keys(nous).join(', '));
}

/* ── 3. le rapport, qui est la seule chose qui decide ─────────────────────────────────────────── */
console.log('\n── VERDICT ──');
const total = volActions + volBlocks;
if (total <= 0) {
  console.log('  ⛔ RIEN N A PU ETRE MESURE : les deux cotes sont a zero ou non lus. Aucun verdict.');
} else {
  console.log('  volume 24 h des actions tokenisees : ' + usd(volActions)
    + '  (' + (volActions / total * 100).toFixed(2) + ' %)');
  console.log('  volume 24 h de NOS blocks          : ' + usd(volBlocks)
    + '  (' + (volBlocks / total * 100).toFixed(2) + ' %)');
  console.log('');
  /* ⛔ LE RAPPORT EST LE CHIFFRE QUI DECIDE, PAS LES TOTAUX. Un DEX se juge au flux qu il peut
   *   capter, pas au flux qui existe quelque part. */
  const r = volBlocks > 0 ? volActions / volBlocks : Infinity;
  console.log('  ⇒ les actions font ' + (Number.isFinite(r) ? r.toFixed(1) + ' fois' : 'une infinite de fois')
    + ' le volume de nos blocks.');
  console.log('');
  console.log('  ⛔ CE QUE CA IMPOSE A TOUT DESIGN DE DEX : le volume n est PAS chez nous, et il ne');
  console.log('    viendra pas parce qu on aura un meilleur ecran. Un carnet d ordres pose sur un');
  console.log('    marche qui fait ' + usd(volBlocks) + ' par jour fera ' + usd(volBlocks) + ' par jour.');
  console.log('    La seule chose qu un DEX dedie peut capter aujourd hui, c est une PART du flux');
  console.log('    des actions — et ce flux est deja servi par des pools profondes ailleurs.');
}
console.log('\n⛔ CE QUE CETTE SONDE NE DIT PAS : si un DEX dedie SERAIT utilise. Elle dit ce qui');
console.log('   s echange aujourd hui et ou. Le reste est un pari, et un pari s annonce comme tel.');
