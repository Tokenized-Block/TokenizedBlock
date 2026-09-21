/* pourquoi-pas-indexes.mjs — POURQUOI NOS MARCHES SONT-ILS INVISIBLES ? TROIS SUSPECTS, UN SEUL VRAI.
 *
 *   node pourquoi-pas-indexes.mjs [jours]      defaut : 14
 *
 * ⛔⛔ CE QUI EST DEJA ETABLI (`sommes-nous-indexes.mjs`, 2026-09-21) : aucun de nos 8 blocks n est
 *     connu de l index public, pendant que 4 temoins sur 12 — des B20 apparies sur les hooks
 *     D AUTRES equipes, meme fenetre, meme forme — le sont, et que les QUATRE ont du volume.
 *     L index sait donc lire ces marches. Il ne connait pas les notres.
 *
 * ⛔ CE FICHIER NE REFAIT PAS CE CONSTAT : il cherche la CAUSE, et il la cherche en comparant, pas
 *    en raisonnant. Trois suspects, annonces avant la mesure pour qu on ne choisisse pas apres coup
 *    celui qui arrange :
 *      (1) NOS POOLS N ONT JAMAIS ETE ECHANGEES — un index liste souvent des la premiere
 *          transaction ; sans un seul swap, il n y a rien a lister ;
 *      (2) ELLES SONT TROP PETITES — nos lancements ouvrent autour de 0,0002 ETH, soit moins d un
 *          dollar de valorisation, sous tout seuil plausible ;
 *      (3) LE JETON EST ILLISIBLE pour l indexeur — un B20 n a pas de bytecode EVM.
 *
 * ⛔ COMMENT ON TRANCHE : on compte les swaps de CHAQUE pool, la notre comme celle du temoin, par
 *    une requete filtree sur le poolId. Si nos pools sont a zero et celles des temoins non, c est
 *    (1) et le correctif est petit. Si nos pools ONT des swaps et restent inconnues, (1) tombe —
 *    et c est aussi un resultat, meme s il est moins commode.
 *    ⛔ Le suspect (3) se refute tout seul si un SEUL temoin B20 est indexe : ils ont exactement la
 *       meme absence de bytecode que nous.
 *
 * ⛔ LECTURE SEULE.
 */
import { V4_ADRESSES } from './lancer-pool.js';
import { HOOKS, PAS_LOGS, topicDe } from './veille-frais.js';
import { BLOCS_PAR_JOUR } from './comparer-frais.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const POOLM = V4_ADRESSES[8453].poolm;
const TOPIC_INITIALIZE = topicDe('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)');
const TOPIC_SWAP = topicDe('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)');
const NOS_HOOKS = new Set(Object.values(HOOKS).map((a) => String(a).toLowerCase()));
const estB20 = (a) => /^0xb20/i.test(String(a));
const adr = (t) => '0x' + String(t || '').slice(26).toLowerCase();

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

/** Les swaps d UNE pool, sur toute la plage. ⛔ Le filtre porte sur le poolId : peu de logs
 *  correspondent, donc une plage large passe la ou un balayage complet echouerait. Rend `null` si
 *  la question n a pas pu etre posee — un echec reseau n est pas un zero. */
async function swapsDeLaPool(poolId, de, a) {
  try {
    const logs = await rpc('eth_getLogs', [{ address: POOLM, topics: [TOPIC_SWAP, poolId],
      fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }]);
    const par = new Set();
    for (const l of logs || []) par.add(adr(l.topics[2]));
    return { n: (logs || []).length, adresses: par.size };
  } catch (e) { return null; }
}

const JOURS = Number(process.argv[2] || 14);
const tete = Number(BigInt(await rpc('eth_blockNumber', [])));
const DE = tete - Math.round(JOURS * BLOCS_PAR_JOUR);
console.log('fenetre : ' + DE + ' → ' + tete + '  (' + JOURS + ' j)\n');

/* ══ 1. LES POOLS, LES NOTRES ET CELLES DES AUTRES ═══════════════════════════════════════════ */
const nos = [], autres = [];
let fenetres = 0, ratees = 0;
for (let b = DE; b <= tete; b += PAS_LOGS) {
  const fin = Math.min(b + PAS_LOGS - 1, tete);
  fenetres++;
  let logs;
  try {
    logs = await rpc('eth_getLogs', [{ address: POOLM, topics: [TOPIC_INITIALIZE],
      fromBlock: '0x' + b.toString(16), toBlock: '0x' + fin.toString(16) }]);
  } catch (e) { ratees++; continue; }
  for (const l of logs || []) {
    const d = String(l.data).replace(/^0x/, '');
    const hook = '0x' + d.slice(64 * 2 + 24, 64 * 3).toLowerCase();
    const c0 = adr(l.topics[2]), c1 = adr(l.topics[3]);
    const jeton = estB20(c1) ? c1 : estB20(c0) ? c0 : null;
    if (!jeton) continue;
    /* ⛔ Le prix d ouverture est DANS l Initialize : sqrtPriceX96, 4e mot. C est la taille du
     *    marche au moment ou il nait — exactement le suspect (2). */
    const sqrt = BigInt('0x' + d.slice(64 * 3, 64 * 4));
    const ligne = { poolId: l.topics[1], jeton, hook, bloc: Number(BigInt(l.blockNumber)), sqrt };
    if (NOS_HOOKS.has(hook)) nos.push(ligne);
    else if (!/^0x0{40}$/.test(hook) && autres.length < 14) autres.push(ligne);
  }
}
console.log('=== 1. LES POOLS ===');
console.log('   fenetres : ' + fenetres + ' · ratees : ' + ratees
  + (ratees ? '  ⛔ PLANCHER — un verdict bati dessus serait biaise' : '  ✅ complet'));
console.log('   nos pools : ' + nos.length + ' · pools temoin (autres hooks) : ' + autres.length);
if (!nos.length || !autres.length) {
  console.log('\n⛔ Il faut LES DEUX cotes pour comparer. Un seul ne prouve rien. On s arrete.');
  process.exit(1);
}

/* ══ 2. LE SUSPECT (1) : ONT-ELLES ETE ECHANGEES ? ═══════════════════════════════════════════ */
console.log('\n=== 2. SUSPECT (1) — LES SWAPS, POOL PAR POOL ===');
async function compter(lignes, nom) {
  let avecSwap = 0, total = 0, illisibles = 0, adresses = 0;
  for (const p of lignes) {
    const r = await swapsDeLaPool(p.poolId, p.bloc, tete);
    if (r === null) { illisibles++; continue; }
    p.swaps = r.n; p.swappeurs = r.adresses;
    total += r.n; adresses += r.adresses;
    if (r.n > 0) avecSwap++;
  }
  console.log('   ' + nom.padEnd(16) + lignes.length + ' pool(s) · ' + avecSwap + ' avec au moins un swap · '
    + total + ' swaps · ' + adresses + ' adresse(s)'
    + (illisibles ? ' · ⛔ ' + illisibles + ' illisible(s)' : ''));
  return { avecSwap, total, illisibles };
}
const cNos = await compter(nos, 'NOS pools');
const cAutres = await compter(autres, 'pools TEMOIN');

/* ══ 3. LE SUSPECT (2) : LA TAILLE A L OUVERTURE ═════════════════════════════════════════════
 * ⛔ On ne convertit PAS en dollars : il faudrait un prix par devise qu on n a pas mesure. On
 *    compare le prix d ouverture brut entre les deux groupes — c est suffisant pour voir un ecart
 *    d ordre de grandeur, et ca n invente aucun chiffre. */
const med = (xs) => { const t = [...xs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); return t[Math.floor(t.length / 2)]; };
console.log('\n=== 3. SUSPECT (2) — LE PRIX D OUVERTURE (sqrtPriceX96 brut, mediane) ===');
console.log('   NOS pools    : ' + med(nos.map((p) => p.sqrt)));
console.log('   pools TEMOIN : ' + med(autres.map((p) => p.sqrt)));
console.log('   ⛔ un sqrtPrice n est pas un montant : il depend des decimales des deux cotes. Il');
console.log('      n est lu ici que pour voir un ecart d ORDRE DE GRANDEUR, pas pour chiffrer.');

console.log('\n=== 4. LEQUEL DES TROIS ? ===');
if (cNos.illisibles || cAutres.illisibles) {
  console.log('   ⚠️ des pools illisibles des deux cotes : le compte est un plancher.');
}
if (cNos.avecSwap === 0 && cAutres.avecSwap > 0) {
  console.log('   ⛔⛔ SUSPECT (1) CONFIRME : aucune de nos pools n a jamais ete echangee, pendant que');
  console.log('        ' + cAutres.avecSwap + '/' + autres.length + ' des temoins l ont ete.');
  console.log('        Un index qui liste a la premiere transaction n a litteralement RIEN a lister');
  console.log('        chez nous. LE CORRECTIF EST PETIT : un premier swap a l ouverture.');
} else if (cNos.avecSwap > 0) {
  console.log('   ⛔ SUSPECT (1) ECARTE : ' + cNos.avecSwap + ' de nos pools ONT ete echangees et');
  console.log('      restent inconnues de l index. Ce n est donc pas « jamais echange ». Il faut');
  console.log('      chercher du cote de la taille ou de la lisibilite du jeton.');
} else {
  console.log('   ⛔ NI NOUS NI LES TEMOINS n avons de swap dans cette fenetre : la comparaison ne');
  console.log('      tranche rien. Elargir la fenetre avant de conclure quoi que ce soit.');
}
/* ⛔ LE SUSPECT (3) SE REFUTE TOUT SEUL, et c est pour ca qu il etait annonce : nos temoins sont des
 *    B20 exactement comme nous — meme absence de bytecode EVM. Si l un d eux est indexe, la
 *    lisibilite du jeton ne peut pas etre la cause. */
console.log('\n   suspect (3), la lisibilite du jeton : les temoins sont des B20 comme nous, avec la');
console.log('   MEME absence de bytecode. Des qu un seul d entre eux est indexe, ce suspect tombe —');
console.log('   et `sommes-nous-indexes.mjs` en a compte quatre.');
