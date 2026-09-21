/* ou-vit-le-volume.mjs — LE VOLUME DES BLOCKS VA-T-IL AUX POOLS HOOKEES, OU AILLEURS ?
 *
 *   node ou-vit-le-volume.mjs [jours]      defaut : 14
 *
 * ⛔⛔ POURQUOI CE FICHIER EXISTE (2026-09-21). Une ALLEGATION a tester, formulee par Zero 1 (Grok)
 *     dans SES mots : « gros volume Dex externe sur des blocks factory, sans passer par votre UI ni
 *     V8. L inconnu arrive via DexScreener / agregateurs, pas via le hook. » Si c est vrai, notre
 *     frais ne rate pas le volume par hasard : il le REPOUSSE, et baisser 3 % a 0,5 % ne change rien
 *     a un swappeur qui ne voit meme pas nos pools. Si c est faux, il n y a pas de volume a capter
 *     du tout, et c est un probleme completement different. On ne peut pas choisir entre les deux
 *     sans mesurer, et on ne croit pas un partenaire sur parole — surtout quand il a raison souvent.
 *
 * ⛔ COMMENT : on lit les `Initialize` du PoolManager v4 de Base sur la fenetre, on ne garde que les
 *    pools dont une devise est un B20 (prefixe 0xb20), et on compte les `Swap` de CHACUNE. Le champ
 *    `hooks` de l Initialize dit si la pool est hookee, et par qui. Rien n est deduit d un nom.
 *
 * ⛔ LES BORNES, ET ELLES SONT SERREES :
 *    · « prefixe 0xb20 » est l heuristique des adresses de la factory B20. Elle peut ramasser une
 *      adresse qui commence par b20 sans etre un B20 — on le VERIFIE par `eth_getCode` (marqueur
 *      0xEF), et les non-B20 sont comptes a part, jamais melanges.
 *    · une pool INITIALISEE AVANT la fenetre n apparait pas ici. Ce fichier mesure donc les pools
 *      NEES dans la fenetre, pas toutes les pools actives. C est une SOUS-ESTIMATION assumee, et
 *      elle est annoncee dans la sortie au lieu d etre tue.
 *    · un `Swap` n est pas un dollar. On compte des EVENEMENTS et des adresses, pas des montants :
 *      convertir en dollars demanderait un prix par devise, qu on n a pas mesure ici.
 * ⛔ LECTURE SEULE.
 */
import { V4_ADRESSES } from './lancer-pool.js';
import { HOOKS, PAS_LOGS, topicDe } from './veille-frais.js';
import { BLOCS_PAR_JOUR } from './comparer-frais.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const POOLM = V4_ADRESSES[8453].poolm;
/* Uniswap v4 core. ⛔ Signatures recopiees de l ABI v4-core, pas ecrites de memoire : le topic est
 * verifie par le fait qu il RAMENE des logs — un topic faux rendrait zero partout, ce qui serait
 * indistinguable d un marche mort. C est pourquoi le total de pools lues est affiche. */
export const TOPIC_INITIALIZE = topicDe(
  'Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)');
export const TOPIC_SWAP = topicDe('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)');

let idRpc = 1;
async function rpc(methode, params) {
  let dernier = 'inconnu';
  for (let essai = 0; essai < 10; essai++) {
    const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: idRpc++, method: methode, params }) });
    const j = await r.json();
    if (!j.error) return j.result;
    dernier = j.error.message || '';
    if (!/rate limit|limit exceeded|too many|capacity/i.test(dernier)) throw new Error(dernier);
    await new Promise((f) => setTimeout(f, 600 * (essai + 1)));
  }
  throw new Error(dernier);
}

const estB20Prefixe = (a) => /^0xb20/i.test(String(a));
const adrDeTopic = (t) => '0x' + String(t).slice(26).toLowerCase();
const NOM_HOOK = new Map(Object.entries(HOOKS).map(([nom, adr]) => [String(adr).toLowerCase(), nom]));

const JOURS = Number(process.argv[2] || 14);
const tete = Number(BigInt(await rpc('eth_blockNumber', [])));
const DE = tete - Math.round(JOURS * BLOCS_PAR_JOUR);
console.log('fenetre : ' + DE + ' → ' + tete + '  (' + JOURS + ' j, ' + (tete - DE) + ' blocs)');
console.log('PoolManager : ' + POOLM);
console.log('topic Initialize : ' + TOPIC_INITIALIZE);
console.log('topic Swap       : ' + TOPIC_SWAP + '\n');

/* ══ 1. LES POOLS NEES DANS LA FENETRE ════════════════════════════════════════════════════════ */
const pools = new Map();
let fenetres = 0, ratees = 0, initTotal = 0;
for (let b = DE; b <= tete; b += PAS_LOGS) {
  const fin = Math.min(b + PAS_LOGS - 1, tete);
  fenetres++;
  let logs;
  try {
    logs = await rpc('eth_getLogs', [{ address: POOLM, topics: [TOPIC_INITIALIZE],
      fromBlock: '0x' + b.toString(16), toBlock: '0x' + fin.toString(16) }]);
  } catch (e) { ratees++; continue; }
  for (const l of logs || []) {
    initTotal++;
    /* ⛔ Initialize(PoolId indexed id, Currency indexed currency0, Currency indexed currency1, …) :
     *    topics[0] = signature, [1] = poolId, [2] = currency0, [3] = currency1.
     *    data = fee, tickSpacing, hooks, sqrtPriceX96, tick — cinq mots de 32 octets. */
    const poolId = l.topics[1];
    const c0 = adrDeTopic(l.topics[2]), c1 = adrDeTopic(l.topics[3]);
    if (!estB20Prefixe(c0) && !estB20Prefixe(c1)) continue;
    const d = String(l.data).replace(/^0x/, '');
    const hooks = '0x' + d.slice(64 * 2 + 24, 64 * 3).toLowerCase();
    pools.set(poolId, { poolId, c0, c1, hooks, bloc: Number(BigInt(l.blockNumber)),
      tx: l.transactionHash, swaps: 0, swappeurs: new Set() });
  }
}
console.log('=== 1. LES POOLS NEES DANS LA FENETRE ===');
console.log('   Initialize lus      : ' + initTotal + '  (toutes pools de Base, toutes devises)');
console.log('   fenetres            : ' + fenetres + ' · ratees : ' + ratees
  + (ratees ? '  ⛔ le compte est un PLANCHER' : '  ✅ aucune fenetre manquante'));
console.log('   dont pools avec un 0xb20 : ' + pools.size);
if (initTotal === 0) {
  console.log('\n⛔ ZERO Initialize lu sur toute la fenetre. Ce n est pas « aucun marche » : c est un');
  console.log('   instrument qui ne lit rien. Topic faux, mauvaise adresse, ou RPC muet. On s arrete.');
  process.exit(1);
}

/* ══ 2. LES SWAPS — UN SEUL BALAYAGE, PAS UN PAR POOL ═════════════════════════════════════════
 * ⛔⛔ PREMIERE VERSION MAL DIMENSIONNEE, ET C EST ECRIT ICI PLUTOT QUE CORRIGE EN SILENCE : elle
 *     interrogeait les `Swap` POOL PAR POOL. La mesure a rendu 12 385 pools B20 nees en 14 jours
 *     (≈ 885 par jour) — soit des millions d appels, un script qui ne finit jamais, et un « resultat
 *     en cours » qui aurait fini par etre presente comme un resultat. On balaie donc les `Swap` du
 *     PoolManager UNE fois (303 fenetres, quel que soit le nombre de pools) et on trie par poolId.
 * ⛔ ET LA VERIFICATION 0xEF EST REPOUSSEE : elle ne porte que sur les pools qui ont VRAIMENT eu un
 *    swap — quelques dizaines, pas douze mille. Verifier ce qui ne sert a rien coute autant. */
/* ⛔⛔ DEUXIEME MAL-DIMENSIONNEMENT, ECRIT ICI PLUTOT QUE CORRIGE EN SILENCE. Un balayage a fenetre
 *     FIXE de 2000 blocs a rendu 284 fenetres RATEES sur 303 : le noeud plafonne le nombre de logs
 *     par reponse, et Base v4 depasse ce plafond en 2000 blocs. Les 27 805 swaps comptes reposaient
 *     donc sur 6 % de la periode — et les fenetres manquantes sont precisement LES PLUS CHARGEES.
 *     Un plancher construit sur un echantillon BIAISE n est pas un plancher, c est un chiffre faux,
 *     et l annoter « plancher » ne le repare pas.
 * ⛔ LA PARADE : on coupe la fenetre en deux a chaque echec, jusqu a ce qu elle passe. Ce qui
 *    resiste encore a 25 blocs est compte en blocs NON LUS, et le verdict est alors REFUSE. */
console.log('\n=== 2. LES SWAPS (balayage adaptatif du PoolManager) ===');
let swapsTotal = 0, swapsB20 = 0, blocsNonLus = 0, appels = 0, divisions = 0;
const PLANCHER_BLOCS = 25;
async function balayerSwaps(de, a) {
  appels++;
  let logs;
  try {
    logs = await rpc('eth_getLogs', [{ address: POOLM, topics: [TOPIC_SWAP],
      fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }]);
  } catch (e) {
    /* ⛔ Une fenetre trop chargee se COUPE, elle ne se jette pas. */
    if (a - de + 1 > PLANCHER_BLOCS) {
      divisions++;
      const m = de + Math.floor((a - de) / 2);
      await balayerSwaps(de, m);
      await balayerSwaps(m + 1, a);
      return;
    }
    blocsNonLus += a - de + 1;
    return;
  }
  for (const l of logs || []) {
    swapsTotal++;
    const p = pools.get(l.topics[1]);
    if (!p) continue;
    swapsB20++; p.swaps++; p.swappeurs.add(adrDeTopic(l.topics[2]));
  }
}
for (let b = DE; b <= tete; b += PAS_LOGS) await balayerSwaps(b, Math.min(b + PAS_LOGS - 1, tete));
const couverture = 100 * (1 - blocsNonLus / (tete - DE + 1));
console.log('   Swap lus (tout Base v4) : ' + swapsTotal + ' · dont sur une pool 0xb20 nee dans la '
  + 'fenetre : ' + swapsB20);
console.log('   appels getLogs : ' + appels + ' · coupes : ' + divisions
  + ' · blocs NON LUS : ' + blocsNonLus + '  (couverture ' + couverture.toFixed(3) + ' %)');
if (swapsTotal === 0) {
  console.log('\n⛔ ZERO Swap lu sur tout Base v4 en 14 jours. Ce n est pas un marche mort, c est un');
  console.log('   instrument muet — topic faux ou noeud qui ne rend rien. On s arrete.');
  process.exit(1);
}
/* ⛔ LE REFUS QUI DONNE SA VALEUR AU RESTE : un trou de lecture n est pas un trou aleatoire. Les
 *    fenetres qui resistent sont les plus chargees, donc celles ou le volume vit. Comparer hookees
 *    et libres sur une lecture incomplete repondrait a la question avec le biais lui-meme. */
const LECTURE_COMPLETE = blocsNonLus === 0;

/* ══ 3. EST-CE VRAIMENT UN B20 ? — seulement pour les pools qui ont eu du volume ══════════════ */
const actives = [...pools.values()].filter((p) => p.swaps > 0);
const codes = new Map();
for (const p of actives) {
  for (const a of [p.c0, p.c1]) {
    if (!estB20Prefixe(a) || codes.has(a)) continue;
    const c = String(await rpc('eth_getCode', [a, 'latest']) || '0x');
    codes.set(a, c.length > 2 && c.slice(0, 4).toLowerCase() === '0xef');
  }
  p.b20 = (estB20Prefixe(p.c0) && codes.get(p.c0)) || (estB20Prefixe(p.c1) && codes.get(p.c1));
}
const vrais = actives.filter((p) => p.b20);
const faux = actives.filter((p) => !p.b20);
console.log('   pools avec au moins un swap : ' + actives.length
  + ' · dont B20 confirmes (marqueur 0xEF) : ' + vrais.length + ' · prefixe trompeur : ' + faux.length);
/* ⛔ Les pools SANS swap ne sont pas verifiees : elles comptent zero de toute facon, et le dire
 *    vaut mieux que laisser croire que les 12 385 ont ete authentifiees une par une. */
console.log('   ⛔ les ' + (pools.size - actives.length) + ' pools sans aucun swap ne sont PAS '
  + 'verifiees 0xEF — elles pesent zero, mais elles ne sont pas « prouvees B20 » pour autant.');

const nomDuHook = (h) => {
  const x = String(h).toLowerCase();
  if (/^0x0{40}$/.test(x)) return 'AUCUN (pool libre)';
  /* ⛔ ADRESSE ENTIERE, JAMAIS TRONQUEE. Une adresse coupee oblige a la reconstituer pour aller la
   *    lire ailleurs — et reconstituer la fin d une adresse de memoire est precisement comment une
   *    enquete part sur une fausse piste. Ce qui est affiche doit pouvoir etre copie. */
  return NOM_HOOK.get(x) || 'tiers ' + x;
};
const parHook = new Map();
for (const p of vrais) {
  const n = nomDuHook(p.hooks);
  const e = parHook.get(n) || { pools: 0, swaps: 0, avecVolume: 0, swappeurs: new Set() };
  e.pools++; e.swaps += p.swaps; if (p.swaps > 0) e.avecVolume++;
  for (const s of p.swappeurs) e.swappeurs.add(s);
  parHook.set(n, e);
};
console.log('   ' + 'hook'.padEnd(50) + 'pools  avec volume  swaps  swappeurs distincts');
console.log('   ' + '-'.repeat(98));
const rangees = [...parHook.entries()].sort((a, b) => b[1].swaps - a[1].swaps);
for (const [n, e] of rangees) {
  console.log('   ' + n.padEnd(50) + String(e.pools).padEnd(7) + String(e.avecVolume).padEnd(12)
    + String(e.swaps).padEnd(7) + e.swappeurs.size);
}

/* ⛔⛔ UN SWAP N EST PAS UN ACHETEUR, ET CETTE DISTINCTION A FAILLI ME COUTER UNE CONCLUSION FAUSSE.
 *     Le 2026-09-21 j ai annonce « le volume B20 existe, a l echelle » en lisant 43 263 swaps sur des
 *     pools hookees. La colonne d a cote disait 22 adresses distinctes pour 4 203 swaps, et plusieurs
 *     hooks affichaient 285 swaps pour UNE SEULE adresse — une adresse qui echange contre sa propre
 *     pool. Le COMPTE de swaps etait bien reel ; la DEMANDE, non. Le compteur d adresses distinctes
 *     est donc remonte au verdict, ou il ne peut plus etre survole. */
const cumul = (filtre) => rangees.filter(filtre).reduce((a, [, e]) => {
  a.pools += e.pools; a.swaps += e.swaps;
  for (const s of e.swappeurs) a.adresses.add(s);
  return a;
}, { pools: 0, swaps: 0, adresses: new Set() });
const libres = cumul(([n]) => n === 'AUCUN (pool libre)');
const hookees = cumul(([n]) => n !== 'AUCUN (pool libre)');
const parAdresse = (x) => x.adresses.size ? (x.swaps / x.adresses.size).toFixed(1) : '—';

console.log('\n=== 4. L ALLEGATION DE ZERO 1, JUGEE ===');
console.log('   « gros volume Dex externe sur des blocks factory, sans passer par votre UI ni V8 »');
console.log('   pools libres  : ' + libres.pools + ' pools · ' + libres.swaps + ' swaps · '
  + libres.adresses.size + ' adresse(s) distincte(s) · ' + parAdresse(libres) + ' swaps/adresse');
console.log('   pools hookees : ' + hookees.pools + ' pools · ' + hookees.swaps + ' swaps · '
  + hookees.adresses.size + ' adresse(s) distincte(s) · ' + parAdresse(hookees) + ' swaps/adresse');
console.log('   ⛔ un swap n est pas un acheteur : au-dela de ~20 swaps par adresse, ce compte');
console.log('      decrit une activite automatisee, pas une demande. Le chiffre qui parle de');
console.log('      demande est la colonne des ADRESSES, pas celle des swaps.');
if (!LECTURE_COMPLETE) {
  /* ⛔⛔ LA BRANCHE QUI COMPTE. Le 2026-09-21, une premiere version a lu 19 fenetres sur 303 et
   *     s appretait a publier un ratio hookees/libres construit dessus. Les fenetres manquantes
   *     etaient les plus chargees : le biais allait DANS le sens de la conclusion. Un verdict ne
   *     se rend pas sur une lecture trouee, meme en l annotant. */
  console.log('   → REFUSE : ' + blocsNonLus + ' blocs n ont pas pu etre lus (couverture '
    + couverture.toFixed(3) + ' %). Les fenetres qui resistent sont les plus chargees, donc celles');
  console.log('     ou le volume vit : conclure ici reviendrait a repondre avec le biais lui-meme.');
  console.log('     Relancer avec un noeud qui tient la charge, ou sur une fenetre plus courte.');
} else if (vrais.length === 0) {
  console.log('   → INDECIDABLE : aucune pool B20 n est NEE dans la fenetre. L allegation n est ni');
  console.log('     confirmee ni refutee — elle n a pas ete testee, et il faut le dire ainsi.');
} else if (libres.swaps > hookees.swaps) {
  console.log('   → CONFIRMEE sur les pools nees dans la fenetre : le volume va aux pools SANS hook.');
  console.log('     Consequence : le taux du frais n est pas le levier. Ce qui manque est la');
  console.log('     DECOUVRABILITE, pas 2,5 points de frais.');
} else if (libres.swaps === 0 && hookees.swaps === 0) {
  console.log('   → REFUTEE dans sa moitie « gros volume » : ZERO swap partout, hookee ou libre.');
  console.log('     Il n y a pas un volume mal capte, il n y a pas de volume. Probleme different.');
} else {
  console.log('   → NON CONFIRMEE : les pools hookees ne recoivent pas moins que les libres ici.');
}
console.log('\n⛔ BORNE : seules les pools NEES dans la fenetre sont vues. Une pool plus ancienne et');
console.log('   active n apparait pas — ce tableau est un plancher, jamais un total.');
