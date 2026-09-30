/* LE FRAIS DE NAISSANCE ARRIVE-T-IL, EN ETH, SUR LE WALLET DE FRAIS — A CHAQUE FOIS ?
 *
 * ⛔ UNE FOIS N EST PAS UN TAUX. Une mesure du 2026-09-30 avait montre +0,001000000000 ETH
 *   exactement sur UNE creation. Un seul cas ne dit rien de la regularite : ce banc regarde
 *   TOUTES les creations passees par NOTRE CreateRouter sur la fenetre, et compare ce qui est
 *   ENVOYE a ce qui ARRIVE, bloc par bloc.
 *
 * ⛔ LECTURE SEULE. Aucune signature.
 * ⛔ ADRESSES LUES DANS `frais-creation.js`, jamais recitees.
 * ⛔ ON COMPTE LES FENETRES RATEES : un « tout arrive » avec des trous n est pas un resultat.
 *
 * ⚠️ CE QUE CE BANC NE PEUT PAS PROUVER : que l argent RESTE. a6cf est un smart wallet ERC-4337 ;
 *   ses sorties passent par des appels internes qu un noeud public ne montre pas. On mesure
 *   l ARRIVEE au bloc de la creation — ce qui se passe ensuite demande une serie de soldes.
 *
 * Usage : node mesure-frais-naissance-arrive.mjs [profondeurEnBlocs]
 */
import { CREATE_ROUTER, FEE_WALLET, FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR } from './frais-creation.js';
import { TOPIC_CREATED, FENETRE_MAX } from './index-blocks.js';

const RPC = 'https://mainnet.base.org';
const FACTORY = '0xb20f000000000000000000000000000000000000';
const PROFONDEUR = BigInt(Number(process.argv[2]) || 43200);   /* ~24 h par defaut */
const ROUTEUR = String(CREATE_ROUTER).toLowerCase();
const A6CF = String(FEE_WALLET).toLowerCase();

const dors = (ms) => new Promise((r) => setTimeout(r, ms));
async function rpc(method, params, essais = 7) {
  for (let i = 0; i < essais; i += 1) {
    const r = await fetch(RPC, { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ms-monitor': '1' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (r.status === 429) { await dors(1400 * (i + 1)); continue; }
    const j = await r.json();
    if (j.error) return { err: String(j.error.message).slice(0, 60) };
    return { val: j.result };
  }
  /* ⛔ UN ECHEC SE NOMME. Un retour neutre ici ferait passer un 429 pour « rien trouve » —
   *   c est exactement ce qui m a fait ecrire « aucun code » sur un contrat bien deploye. */
  return { err: 'NON_MESURE apres ' + essais + ' essais' };
}
const eth = (w) => (Number(w) / 1e18).toFixed(12);

const tete = BigInt((await rpc('eth_blockNumber', [])).val);
console.log('routeur ' + ROUTEUR);
console.log('wallet  ' + A6CF);
console.log('fenetre ' + (tete - PROFONDEUR) + ' -> ' + tete + '  (~' + (Number(PROFONDEUR) * 2 / 3600).toFixed(1) + ' h)');
console.log('');

let ratees = 0;
const logs = [];
for (let haut = tete; haut > tete - PROFONDEUR; haut -= BigInt(FENETRE_MAX)) {
  const bas = haut - BigInt(FENETRE_MAX) + 1n;
  const r = await rpc('eth_getLogs', [{ address: FACTORY, topics: [TOPIC_CREATED],
    fromBlock: '0x' + bas.toString(16), toBlock: '0x' + haut.toString(16) }]);
  if (r.err) { ratees += 1; continue; }
  for (const l of (r.val || [])) logs.push(l);
  await dors(170);
}
const parTx = new Map();
for (const l of logs) if (!parTx.has(l.transactionHash)) parTx.set(l.transactionHash, BigInt(l.blockNumber));
console.log('creations lues : ' + parTx.size + '   fenetres ratees : ' + ratees
  + (ratees ? '   ⚠️ autant de trous — les comptes ci-dessous sont des PLANCHERS' : '   ✅ aucun trou'));

const nôtres = [];
for (const [hash, bloc] of parTx) {
  const t = await rpc('eth_getTransactionByHash', [hash]);
  if (t.err || !t.val) continue;
  if (String(t.val.to || '').toLowerCase() !== ROUTEUR) continue;
  nôtres.push({ hash, bloc, envoye: BigInt(t.val.value || '0x0') });
  await dors(90);
}
console.log('creations passees par NOTRE routeur : ' + nôtres.length);
console.log('');
if (!nôtres.length) {
  console.log('⛔ AUCUNE sur cette fenetre — rien a conclure sur le taux d arrivee.');
  console.log('   ⚠️ Ca ne dit PAS que le rail est casse : ca dit que personne n a cree chez nous ici.');
  process.exit(0);
}

console.log('=== ENVOYE vs ARRIVE, CREATION PAR CREATION ===');
let exacts = 0, partiels = 0, nuls = 0, illisibles = 0;
let totalEnvoye = 0n, totalArrive = 0n;
for (const c of nôtres) {
  const av = await rpc('eth_getBalance', [A6CF, '0x' + (c.bloc - 1n).toString(16)]);
  const ap = await rpc('eth_getBalance', [A6CF, '0x' + c.bloc.toString(16)]);
  if (av.err || ap.err) {
    illisibles += 1;
    console.log('  bloc ' + c.bloc + '  ⛔ solde illisible (' + (av.err || ap.err) + ') — NON COMPTE');
    continue;
  }
  const arrive = BigInt(ap.val) - BigInt(av.val);
  totalEnvoye += c.envoye; totalArrive += arrive;
  const quoi = c.envoye === FRAIS_OUVERTURE_WEI ? ' (0,001 = naissance)'
    : (c.envoye === CREATE_FEE_WEI_FLOOR ? ' (0,0003 = plancher)' : '');
  let verdict;
  if (arrive === c.envoye && arrive > 0n) { exacts += 1; verdict = '✅ EXACT'; }
  else if (arrive > 0n) { partiels += 1; verdict = '⚠️ PARTIEL'; }
  else { nuls += 1; verdict = '⛔ RIEN'; }
  console.log('  bloc ' + c.bloc + '  envoye ' + eth(c.envoye) + quoi
    + '  ->  arrive ' + eth(arrive) + '  ' + verdict);
  await dors(220);
}
console.log('');
console.log('=== BILAN ===');
console.log('  creations mesurees  ' + (exacts + partiels + nuls) + '   (illisibles, non comptees : ' + illisibles + ')');
console.log('  arrivees EXACTES    ' + exacts);
console.log('  arrivees PARTIELLES ' + partiels);
console.log('  RIEN arrive         ' + nuls);
console.log('  total envoye        ' + eth(totalEnvoye) + ' ETH');
console.log('  total arrive        ' + eth(totalArrive) + ' ETH');
if (totalEnvoye > 0n) {
  console.log('  taux d arrivee      ' + (100 * Number(totalArrive) / Number(totalEnvoye)).toFixed(2) + ' %');
}
console.log('');
console.log('⚠️ BORNES');
console.log('   · Le delta de solde sur UN bloc melange tout ce qui s y passe pour a6cf. Une');
console.log('     sortie dans le MEME bloc ferait paraitre l arrivee plus petite qu elle n est.');
console.log('   · Ce banc mesure l ARRIVEE, pas le MAINTIEN : a6cf est un smart wallet, et ses');
console.log('     sorties passent par des appels internes invisibles sur un noeud public.');
console.log('   · L ETH nu n emet aucun log : rien de tout ceci ne se retrouve par getLogs.');
