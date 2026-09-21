/* prix-du-lancement.mjs — COMBIEN UN CREATEUR PAIE-T-IL POUR OUVRIR UN MARCHE, CHEZ LES AUTRES ?
 *
 *   node prix-du-lancement.mjs [jours] [hook]     defaut : 1 jour, le hook le plus actif mesure
 *
 * ⛔⛔ POURQUOI CE FICHIER EXISTE (2026-09-21). Deux mesures du meme jour se contredisent en
 *     apparence : ~885 pools B20 naissent par jour sur Base, et seulement ~54 adresses distinctes
 *     y echangent. Un marche ou presque personne n achete, mais ou des centaines de marches
 *     s ouvrent quand meme, ne tire pas son revenu des ACHETEURS. Il le tire des CREATEURS.
 *     Notre modele fait l inverse : nous ne prenons rien a la creation et tout au swap — donc nous
 *     facturons le cote qui, mesure, n existe presque pas.
 *
 * ⛔ CE QU ON MESURE, ET RIEN D AUTRE : la valeur en ETH des transactions qui OUVRENT ces pools.
 *    Pas ce que le hook « facture » (on n a pas sa source), pas ce qu il garde — ce que le createur
 *    a REELLEMENT envoye. Un chiffre annonce par un partenaire ne devient pas vrai en etant recopie.
 *
 * ⛔ LES BORNES :
 *    · la valeur d une tx d ouverture peut contenir AUTRE CHOSE que le frais (l achat initial, la
 *      liquidite). On separe donc la MEDIANE (le cas courant) du TOTAL, et on ne nomme aucune
 *      partie « frais » — on dit « ce que le createur a envoye ».
 *    · une tx peut ouvrir plusieurs pools : elle n est alors comptee qu UNE fois.
 *    · seules les pools nees dans la fenetre sont vues.
 * ⛔ LECTURE SEULE.
 */
import { V4_ADRESSES } from './lancer-pool.js';
import { PAS_LOGS, topicDe } from './veille-frais.js';
import { BLOCS_PAR_JOUR } from './comparer-frais.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const POOLM = V4_ADRESSES[8453].poolm;
const TOPIC_INITIALIZE = topicDe('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)');

let idRpc = 1;
async function rpc(m, p) {
  let dernier = 'inconnu';
  for (let e = 0; e < 10; e++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: idRpc++, method: m, params: p }) });
    const j = await r.json();
    if (!j.error) return j.result;
    dernier = j.error.message || '';
    if (!/rate limit|limit exceeded|too many|capacity/i.test(dernier)) throw new Error(dernier);
    await new Promise((f) => setTimeout(f, 600 * (e + 1)));
  }
  throw new Error(dernier);
}
const eth = (wei) => (Number(wei) / 1e18).toFixed(6);
const estB20 = (a) => /^0xb20/i.test(String(a));
const adr = (t) => '0x' + String(t).slice(26).toLowerCase();

const JOURS = Number(process.argv[2] || 1);
/* ⛔ ADRESSE RECOPIEE de la sortie de `ou-vit-le-volume.mjs` du 2026-09-21, jamais de memoire. */
const HOOK = String(process.argv[3] || '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc').toLowerCase();

const tete = Number(BigInt(await rpc('eth_blockNumber', [])));
const DE = tete - Math.round(JOURS * BLOCS_PAR_JOUR);
console.log('fenetre : ' + DE + ' → ' + tete + '  (' + JOURS + ' j)');
console.log('hook etudie : ' + HOOK + '\n');

const txs = new Map();
let fenetres = 0, ratees = 0, poolsDuHook = 0;
for (let b = DE; b <= tete; b += PAS_LOGS) {
  const fin = Math.min(b + PAS_LOGS - 1, tete);
  fenetres++;
  let logs;
  try {
    logs = await rpc('eth_getLogs', [{ address: POOLM, topics: [TOPIC_INITIALIZE],
      fromBlock: '0x' + b.toString(16), toBlock: '0x' + fin.toString(16) }]);
  } catch (e) { ratees++; continue; }
  for (const l of logs || []) {
    const c0 = adr(l.topics[2]), c1 = adr(l.topics[3]);
    if (!estB20(c0) && !estB20(c1)) continue;
    const d = String(l.data).replace(/^0x/, '');
    if ('0x' + d.slice(64 * 2 + 24, 64 * 3).toLowerCase() !== HOOK) continue;
    poolsDuHook++;
    /* ⛔ une tx qui ouvre plusieurs pools n est comptee qu une fois */
    if (!txs.has(l.transactionHash)) txs.set(l.transactionHash, null);
  }
}
console.log('fenetres : ' + fenetres + ' · ratees : ' + ratees
  + (ratees ? '  ⛔ PLANCHER, et un plancher ne se compare pas' : '  ✅ complet'));
console.log('pools ouvertes par ce hook : ' + poolsDuHook + ' · en ' + txs.size + ' transaction(s)');
if (!txs.size) { console.log('\n⛔ aucune pool de ce hook dans la fenetre — rien a mesurer.'); process.exit(1); }

const valeurs = [];
let illisibles = 0;
for (const h of txs.keys()) {
  try {
    const t = await rpc('eth_getTransactionByHash', [h]);
    if (!t) { illisibles++; continue; }
    valeurs.push({ wei: BigInt(t.value || '0x0'), de: String(t.from).toLowerCase(), vers: String(t.to || '').toLowerCase() });
  } catch (e) { illisibles++; }
}
if (illisibles) console.log('⛔ ' + illisibles + ' transaction(s) illisible(s) — exclues, et donc le total est un plancher');
valeurs.sort((a, b) => (a.wei < b.wei ? -1 : a.wei > b.wei ? 1 : 0));
const total = valeurs.reduce((a, v) => a + v.wei, 0n);
const mediane = valeurs[Math.floor(valeurs.length / 2)].wei;
const aZero = valeurs.filter((v) => v.wei === 0n).length;
const createurs = new Set(valeurs.map((v) => v.de));
const cibles = new Map();
for (const v of valeurs) cibles.set(v.vers, (cibles.get(v.vers) || 0) + 1);

console.log('\n=== CE QUE LES CREATEURS ONT ENVOYE POUR OUVRIR CES MARCHES ===');
console.log('   transactions lues : ' + valeurs.length + ' · createurs distincts : ' + createurs.size);
console.log('   a valeur ZERO     : ' + aZero + '  (ouverture gratuite)');
console.log('   mediane           : ' + eth(mediane) + ' ETH');
console.log('   minimum           : ' + eth(valeurs[0].wei) + ' ETH');
console.log('   maximum           : ' + eth(valeurs[valeurs.length - 1].wei) + ' ETH');
console.log('   TOTAL             : ' + eth(total) + ' ETH sur ' + JOURS + ' jour(s)');
console.log('\n   contrats appeles :');
for (const [c, n] of [...cibles.entries()].sort((a, b) => b[1] - a[1])) {
  console.log('      ' + c + '  ' + n + ' tx');
}
console.log('\n⛔ CE QUE CE CHIFFRE N EST PAS : un revenu. La valeur d une tx d ouverture peut contenir');
console.log('   l achat initial et la liquidite autant qu un frais. Ce qui est mesure ici, c est ce');
console.log('   qu un createur accepte de DEPENSER pour ouvrir un marche — pas ce que quelqu un garde.');
