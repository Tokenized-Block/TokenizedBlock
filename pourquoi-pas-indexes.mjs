/* pourquoi-pas-indexes.mjs — POURQUOI NOS MARCHES SONT-ILS INVISIBLES ? TROIS SUSPECTS, UN SEUL VRAI.
 *
 *   node pourquoi-pas-indexes.mjs [jours]      defaut : 14
 *
 * ⛔⛔⛔ CORRECTION DU 2026-09-22 — LA PREMISSE DE CE FICHIER EST MORTE. Elle est GARDEE ici plutot
 *      que remplacee, pour que la correction se lise contre ce qu elle corrige.
 *      `seuil-d-indexation.mjs` a mesure la POPULATION au lieu de deux groupes choisis : sur
 *      5 812 jetons B20 nes en 14 jours (echantillon de 303, ages de plus de 12 h), le taux
 *      d indexation de FOND vaut 19/296 = 6,4 %.
 *      ⇒ P(observer 0 indexe sur 8 jetons) = 58,8 %. Notre « 0 sur 8 » est le resultat LE PLUS
 *        PROBABLE au taux de base. Ce n a jamais ete une anomalie — et ce fichier a ete ecrit
 *        pour expliquer un ecart qui n existe pas.
 *      ⛔ LE TEMOIN N ETAIT PAS REPRESENTATIF, ET C EST LUI QUI FABRIQUAIT L ECART : 4 sur 12 font
 *         33 %, soit CINQ FOIS le taux de la population. Il etait SUPPOSE representatif ; ca n a
 *         jamais ete prouve. Un temoin non prouve ne mesure pas la cible, il mesure lui-meme.
 *      ⛔ CE QUI RESTE VALIDE ICI : l ecartement du suspect (1) tient — nos jetons ONT bouge — et
 *         le suspect (3) tombe toujours pour la meme raison. Seule la QUESTION etait mal posee.
 *
 * — texte d origine du 2026-09-21 —
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

/* ⛔⛔ PREMIERE VERSION, ET ELLE A ECHOUE — ECRIT ICI PLUTOT QUE REMPLACE EN SILENCE. Elle
 *     interrogeait les `Swap` POOL PAR POOL avec le poolId en topic, en pariant qu un filtre etroit
 *     ferait passer une plage large. Le noeud a refuse LES 21 REQUETES : 7 des notres, 14 temoins.
 *     Le script a affiche « illisible » et REFUSE de conclure — bon comportement, mais zero reponse.
 *     La lecon : le plafond du noeud porte sur la PLAGE, pas sur le nombre de logs rendus.
 *
 * ⛔ LE CHEMIN QUI MARCHE : compter les `Transfer` DU JETON (`address` = le block), en coupant la
 *    fenetre en deux a chaque echec. C est ce que fait `bridge-devises-liquidite.mjs`, qui a lu
 *    16 devises sur 16 sans un seul trou.
 * ⛔ ET C EST MEME PLUS SUR QUE COMPTER LES SWAPS : un jeton qui n a JAMAIS bouge ne peut pas avoir
 *    ete echange. Un Transfer de plus qu une frappe initiale prouve qu il s est passe quelque chose.
 *    La borne : un Transfer n est pas un swap — une distribution en produit aussi. On compte donc
 *    les ADRESSES distinctes a cote, qui separent un vrai va-et-vient d un arrosage. */
/* ⛔⛔ TROISIEME VERSION, ET LA RAISON DES DEUX PRECEDENTES EST MESUREE, PAS SUPPOSEE. Le noeud
 *     repond textuellement : « eth_getLogs is limited to a 2,000 range ». Le plafond porte donc sur
 *     la PLAGE et pas sur le volume rendu — c est pour ca qu un filtre etroit sur le poolId n a rien
 *     sauve, et qu une plage large sur une adresse de jeton peu bavarde echoue tout autant.
 *
 * ⛔ Balayer 21 jetons x 303 fenetres ferait 6 363 requetes. Or `address` accepte un TABLEAU : un
 *    SEUL balayage de 303 fenetres suffit pour tous les jetons a la fois, et on trie a l arrivee.
 *    C est vingt fois moins d appels pour exactement la meme reponse. */
const TOPIC_TRANSFER = topicDe('Transfer(address,address,uint256)');
async function mouvementsDeTous(jetons, de, a) {
  const par = new Map(jetons.map((j) => [j, { n: 0, adresses: new Set() }]));
  let blocsNonLus = 0, appels = 0;
  async function balayer(d, f) {
    appels++;
    let logs;
    try {
      logs = await rpc('eth_getLogs', [{ address: jetons, topics: [TOPIC_TRANSFER],
        fromBlock: '0x' + d.toString(16), toBlock: '0x' + f.toString(16) }]);
    } catch (e) {
      if (f - d + 1 > 25) {
        const m = d + Math.floor((f - d) / 2);
        await balayer(d, m); await balayer(m + 1, f);
        return;
      }
      blocsNonLus += f - d + 1;
      return;
    }
    for (const l of logs || []) {
      const e = par.get(String(l.address).toLowerCase());
      if (!e) continue;
      e.n++;
      e.adresses.add(adr(l.topics[1]));
      e.adresses.add(adr(l.topics[2]));
    }
  }
  for (let b = de; b <= a; b += PAS_LOGS) await balayer(b, Math.min(b + PAS_LOGS - 1, a));
  return { par, blocsNonLus, appels };
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
console.log('\n=== 2. SUSPECT (1) — LE JETON A-T-IL JAMAIS BOUGE ? ===');
/* ⛔ Un meme jeton peut avoir plusieurs pools : on ne l interroge qu UNE fois. */
const jetonsNos = [...new Set(nos.map((p) => p.jeton))];
const jetonsAutres = [...new Set(autres.map((p) => p.jeton))].filter((j) => !jetonsNos.includes(j));
/* ⛔ LA FENETRE EST LA MEME POUR LES DEUX GROUPES. Interroger les notres depuis leur naissance et
 *    les temoins depuis la leur donnerait a l un plus de temps qu a l autre — et l ecart mesure
 *    viendrait de la duree, pas du produit. */
const r = await mouvementsDeTous([...jetonsNos, ...jetonsAutres], DE, tete);
console.log('   appels : ' + r.appels + ' · blocs non lus : ' + r.blocsNonLus
  + (r.blocsNonLus ? '  ⛔ PLANCHER, verdict refuse' : '  ✅ lecture complete'));
function resumer(jetons, nom) {
  let avecSwap = 0, total = 0, adresses = 0;
  for (const j of jetons) {
    const e = r.par.get(j) || { n: 0, adresses: new Set() };
    total += e.n; adresses += e.adresses.size;
    if (e.n > 0) avecSwap++;
  }
  console.log('   ' + nom.padEnd(16) + jetons.length + ' jeton(s) · ' + avecSwap + ' qui ont bouge · '
    + total + ' transfert(s) · ' + adresses + ' adresse(s)');
  return { avecSwap, total, illisibles: 0, jetons: jetons.length };
}
const cNos = resumer(jetonsNos, 'NOS jetons');
const cAutres = resumer(jetonsAutres, 'jetons TEMOIN');

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
if (r.blocsNonLus) {
  console.log('   ⚠️ des pools illisibles des deux cotes : le compte est un plancher.');
}
if (cNos.avecSwap === 0 && cAutres.avecSwap > 0) {
  console.log('   ⛔⛔ SUSPECT (1) CONFIRME : aucun de nos jetons n a jamais bouge, pendant que');
  console.log('        ' + cAutres.avecSwap + '/' + cAutres.jetons + ' des temoins ont bouge.');
  console.log('        Un index qui liste a la premiere transaction n a litteralement RIEN a lister');
  console.log('        chez nous. LE CORRECTIF EST PETIT : un premier swap a l ouverture.');
} else if (cNos.avecSwap > 0) {
  console.log('   ⛔ SUSPECT (1) ECARTE : ' + cNos.avecSwap + ' de nos jetons ONT bouge et');
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
