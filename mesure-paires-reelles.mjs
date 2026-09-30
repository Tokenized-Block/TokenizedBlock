/* CONTRE QUOI LES BLOCKS SONT-ILS REELLEMENT APPAIRES ?
 *
 * La question de Phil : le multi-pool entre blocks, actions tokenisees et jetons « tokenisables ».
 * ⛔ UNE REGLE DU PRODUIT LIMITE DEJA LA REPONSE, et elle est deliberee (Raksha, 2026-09-15,
 *   « no ERC-20 sprawl ») : une paire SAISIE doit prouver `code 0xef`. Un ERC-20 quelconque ne
 *   peut donc PAS etre appaire — seuls ETH, USDC, cbBTC, TOSHI, les actions tokenisees et les
 *   B20 natifs le peuvent.
 * ⇒ Ce banc mesure ce qui EXISTE, pas ce qui serait possible : contre quoi les blocks cotes sont
 *   effectivement cotes aujourd hui, d apres le serveur.
 *
 * ⛔ LECTURE SEULE. Aucune signature.
 * ⛔ GARDE DE FORME : les champs sont verifies avant tout comptage. Un champ absent ferait
 *   converger toutes les lignes dans une case, ce qui RESSEMBLE a un resultat.
 */
import { DEVISES_BASE, ACTIONS_COINBASE } from './paires.js';

const BASE = process.argv[2] || 'https://tokenizedblock.space';
const ATTENDUS = ['adr', 'sym', 'quoteAdr', 'quoteSym', 'volume24hUsd', 'liquiditeUsd', 'dex', 'emetteur'];

const r = await fetch(BASE + '/api/trending', { headers: { 'x-ms-monitor': '1' } });
if (!r.ok) { console.log('⛔ /api/trending ' + r.status); process.exit(1); }
const j = await r.json();
const L = Array.isArray(j.lignes) ? j.lignes : [];
if (!L.length) { console.log('⛔ 0 ligne'); process.exit(1); }
const cles = Object.keys(L[0]);
const manquants = ATTENDUS.filter((k) => !cles.includes(k));
if (manquants.length) {
  console.log('⛔⛔ CHAMPS MANQUANTS : ' + manquants.join(', ') + ' — aucun tableau rendu.');
  process.exit(1);
}
console.log(BASE + '  ' + L.length + ' blocks cotes   (garde de forme ✅)');
console.log('');

const bas = (x) => String(x || '').toLowerCase();
const devise = new Map(DEVISES_BASE.map((d) => [bas(d.adr), d.symbole]));
const action = new Map(ACTIONS_COINBASE.map((a) => [bas(a.adr), a.symbole]));

const classes = new Map();
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
let volTotal = 0;
for (const l of L) {
  const q = bas(l.quoteAdr);
  let classe;
  if (!q) classe = 'CONTRE-PARTIE NON LUE';
  else if (devise.has(q)) classe = 'devise · ' + devise.get(q);
  else if (action.has(q)) classe = 'ACTION TOKENISEE · ' + action.get(q);
  else if (q.startsWith('0xb2')) classe = 'un autre BLOCK (prefixe 0xb2)';
  else classe = 'AUTRE ERC-20';
  const v = num(l.volume24hUsd);
  volTotal += v;
  const e = classes.get(classe) || { n: 0, vol: 0, liq: 0 };
  classes.set(classe, { n: e.n + 1, vol: e.vol + v, liq: e.liq + num(l.liquiditeUsd) });
}
const eur = (x) => Math.round(x).toLocaleString('fr-FR');
console.log('=== CONTRE QUOI LES BLOCKS SONT COTES ===');
for (const [c, e] of [...classes.entries()].sort((a, b) => b[1].vol - a[1].vol)) {
  console.log('  ' + String(e.n).padStart(4) + '  ' + c.padEnd(30)
    + ' vol ' + eur(e.vol).padStart(13) + ' $   liq ' + eur(e.liq).padStart(12) + ' $'
    + '   ' + (volTotal ? (100 * e.vol / volTotal).toFixed(1) : '?').padStart(5) + ' %');
}
console.log('');

/* Les blocks cotes CONTRE une action : c est le multi-saut qui les sert. */
const contreAction = L.filter((l) => action.has(bas(l.quoteAdr)));
console.log('=== LES BLOCKS COTES CONTRE UNE ACTION TOKENISEE ===');
console.log('  ' + contreAction.length + ' block(s)   vol 24 h '
  + eur(contreAction.reduce((a, l) => a + num(l.volume24hUsd), 0)) + ' $');
if (contreAction.length) {
  const parDex = new Map();
  for (const l of contreAction) {
    const d = String(l.dex || 'ABSENT');
    parDex.set(d, (parDex.get(d) || 0) + 1);
  }
  for (const [d, n] of parDex) console.log('    ' + String(n).padStart(3) + ' sur ' + d);
  console.log('  ⇒ Un block cote contre une ACTION ne s achete pas en ETH d un seul saut : il');
  console.log('    faut ETH -> action -> block. C est exactement ce que le 3e saut sert.');
}
console.log('');
console.log('⚠️ BORNES');
console.log('   · trending ne liste que les blocks AVEC un marche lisible (' + L.length
  + ' sur ' + (j.blocksSuivis ?? '?') + ' suivis).');
console.log('   · « un autre BLOCK » se juge ici sur le PREFIXE 0xb2, qui ne prouve rien —');
console.log('     seul `eth_getCode == 0xef` le fait. Ce comptage est donc un PLAFOND.');
console.log('   · Un ERC-20 quelconque ne peut PAS etre appaire par l app (regle deliberee) :');
console.log('     ce que ce banc montre est ce qui existe, pas ce qui serait ouvrable.');
