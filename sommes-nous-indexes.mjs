/* sommes-nous-indexes.mjs — NOS MARCHES EXISTENT-ILS POUR QUELQU UN D AUTRE QUE NOUS ?
 *
 *   node sommes-nous-indexes.mjs [jours]      defaut : 30
 *
 * ⛔⛔⛔ A LIRE AVANT SON RESULTAT (correction du 2026-09-22). Ce fichier compte combien de NOS
 *      blocks sont indexes. Il n a jamais eu de DENOMINATEUR : « 0 sur 8 » ne veut rien dire sans
 *      le taux de la population. `seuil-d-indexation.mjs` l a mesure — 19/296 = 6,4 % chez les
 *      jetons B20 de plus de 12 h — et a ce taux, P(observer 0 sur 8) = 58,8 %.
 *      ⇒ Le resultat de ce fichier reste JUSTE et cesse d etre ALARMANT. Lu seul, il fait croire a
 *        une anomalie ; lu avec le taux de base, il dit que nous sommes dans la norme.
 *      ⛔ Un chiffre sans son denominateur n est pas une mesure, c est une impression.
 *
 * ⛔⛔ POURQUOI CE FICHIER EXISTE (2026-09-21). Tout est prouve de notre cote : le frais part, le
 *     wallet encaisse, la chaine complete passe. Et 54 adresses distinctes par jour touchent une
 *     pool B20 neuve sur TOUT Base. La question qui reste n est donc plus « est-ce que ca marche »
 *     mais « est-ce que ca EXISTE pour quelqu un qui ne nous connait pas ».
 *     Un marche que personne ne peut trouver n est pas un marche : c est un fichier.
 *
 * ⛔ CE QUI EST MESURE : pour chacun de NOS blocks — ceux dont une pool a ete ouverte sur un de nos
 *    hooks — on demande a DexScreener s il connait le jeton. L index public est le premier endroit
 *    ou un inconnu tombe sur un token qu il n a jamais vu.
 *
 * ⛔ LES BORNES, ET ELLES COMPTENT :
 *    · DexScreener n est PAS la chaine. Son silence ne prouve pas qu un marche n existe pas — il
 *      prouve que CET index ne le connait pas. Les deux se confondent vite et ne sont pas pareils.
 *    · un index peut repondre « connu » avec zero liquidite affichee : etre indexe n est pas etre
 *      visible, et etre visible n est pas etre echange. On affiche donc liquidite ET volume, sans
 *      les confondre avec la presence.
 *    · une requete qui echoue est un TROU, pas un « non ». Elle est comptee a part.
 * ⛔ LECTURE SEULE : aucune ecriture, aucune signature, aucune cle.
 */
import { V4_ADRESSES } from './lancer-pool.js';
import { HOOKS, PAS_LOGS, topicDe } from './veille-frais.js';
import { BLOCS_PAR_JOUR } from './comparer-frais.js';
import { TBLOCK, TBGAS } from './tokenomics.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
const POOLM = V4_ADRESSES[8453].poolm;
const TOPIC_INITIALIZE = topicDe('Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)');
/* ⛔ L API publique de DexScreener. Aucune cle, aucune donnee envoyee : on ne fait que demander. */
const DEX = 'https://api.dexscreener.com/latest/dex/tokens/';

const NOS_HOOKS = new Set(Object.values(HOOKS).map((a) => String(a).toLowerCase()));
const estB20Prefixe = (a) => /^0xb20/i.test(String(a));
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

const JOURS = Number(process.argv[2] || 30);
const tete = Number(BigInt(await rpc('eth_blockNumber', [])));
const DE = tete - Math.round(JOURS * BLOCS_PAR_JOUR);
console.log('fenetre : ' + DE + ' → ' + tete + '  (' + JOURS + ' j)');
console.log('nos hooks : ' + NOS_HOOKS.size + '\n');

/* ══ 1. NOS MARCHES, LUS SUR LA CHAINE ═══════════════════════════════════════════════════════
 * ⛔⛔ ET UN TEMOIN, PARCE QUE SANS LUI LE RESULTAT NE VEUT RIEN DIRE. Si aucun de nos blocks n est
 *     indexe, deux explications tiennent le meme discours : soit NOUS sommes invisibles, soit
 *     l index ne connait AUCUNE pool Uniswap v4 sur des B20 — auquel cas ce serait une propriete de
 *     v4 et notre conclusion serait fausse. On ramasse donc aussi des B20 apparies sur les hooks
 *     D AUTRES equipes, dans la meme fenetre, et on leur pose la meme question.
 *     Si eux sont connus et pas nous : le probleme est chez nous. Si personne ne l est : c est
 *     l index qui ne regarde pas par ici, et il faut le dire au lieu de s accuser. */
const temoins = new Map();
const nos = new Map();
/* ⛔ LES poolId SONT RETENUS DES LA PREMIERE LECTURE. Sans eux, compter les swaps imposerait de
 *    relire tous les Initialize une seconde fois — et une seconde lecture d une autre fenetre ne
 *    porterait pas sur le meme ensemble. */
const nosPools = new Set();
const temoinPools = new Set();
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
    const jeton = estB20Prefixe(c1) ? c1 : estB20Prefixe(c0) ? c0 : null;
    if (!jeton) continue;
    if (NOS_HOOKS.has(hook)) {
      if (!nos.has(jeton)) nos.set(jeton, { jeton, hooks: new Set(), bloc: Number(BigInt(l.blockNumber)) });
      nos.get(jeton).hooks.add(hook);
      nosPools.add(l.topics[1]);
    } else if (!/^0x0{40}$/.test(hook) && temoins.size < 12 && !temoins.has(jeton)) {
      /* ⛔ LE TEMOIN A LA MEME FORME QUE NOUS : un B20, apparie, sur un hook custom, dans la MEME
       *    fenetre. S il avait une autre forme (pool libre, jeton non-B20), une difference de
       *    resultat ne prouverait rien — elle pourrait venir de la forme et pas de nous. */
      temoins.set(jeton, { jeton, hook });
      temoinPools.add(l.topics[1]);
    }
  }
}
/* ⛔ NOS DEUX JETONS CONNUS SONT AJOUTES MEME SANS Initialize DANS LA FENETRE : leurs marches
 *    peuvent etre plus vieux que la fenetre, et les omettre ferait croire qu ils n existent pas. */
for (const [nom, a] of [['TBLOCK', TBLOCK], ['TBGAS', TBGAS]]) {
  const x = String(a).toLowerCase();
  if (!nos.has(x)) nos.set(x, { jeton: x, hooks: new Set(), bloc: null, nomConnu: nom, horsFenetre: true });
}
console.log('=== 1. NOS MARCHES ===');
console.log('   fenetres : ' + fenetres + ' · ratees : ' + ratees
  + (ratees ? '  ⛔ PLANCHER' : '  ✅ complet'));
console.log('   blocks avec une pool sur un de NOS hooks : ' + [...nos.values()].filter((x) => x.hooks.size).length);
console.log('   + nos jetons connus, ajoutes hors fenetre : '
  + [...nos.values()].filter((x) => x.horsFenetre).map((x) => x.nomConnu).join(', '));

/* ══ 2. L INDEX PUBLIC LES CONNAIT-IL ? ══════════════════════════════════════════════════════ */
/** Ce que l index sait d un jeton. ⛔ Rend `null` si la question n a PAS PU ETRE POSEE — un echec
 *  reseau est un TROU, jamais un « non ». Confondre les deux ferait passer une panne pour un fait. */
async function indexe(jeton) {
  for (let e = 0; e < 4; e++) {
    try {
      const r = await fetch(DEX + jeton, { headers: { accept: 'application/json' } });
      if (r.status === 429) { await new Promise((f) => setTimeout(f, 1500 * (e + 1))); continue; }
      if (!r.ok) return null;
      const j = await r.json();
      return Array.isArray(j.pairs) ? j.pairs : [];
    } catch (_) { await new Promise((f) => setTimeout(f, 800 * (e + 1))); }
  }
  return null;
}

console.log('\n=== 2. CE QUE L INDEX PUBLIC (DexScreener) EN SAIT ===');
console.log('   ' + 'block'.padEnd(44) + 'indexe  paires  liquidite $  volume 24h $');
console.log('   ' + '-'.repeat(92));
let connus = 0, inconnus = 0, illisibles = 0, avecLiquidite = 0, avecVolume = 0;
for (const x of nos.values()) {
  const paires = await indexe(x.jeton);
  if (paires === null) {
    illisibles++;
    console.log('   ' + x.jeton.padEnd(44) + 'ILLISIBLE — un trou, pas un « non »');
    continue;
  }
  if (!paires.length) {
    inconnus++;
    console.log('   ' + x.jeton.padEnd(44) + 'NON'.padEnd(8) + '0');
    continue;
  }
  connus++;
  const liq = paires.reduce((s, p) => s + Number((p.liquidity && p.liquidity.usd) || 0), 0);
  const vol = paires.reduce((s, p) => s + Number((p.volume && p.volume.h24) || 0), 0);
  if (liq > 0) avecLiquidite++;
  if (vol > 0) avecVolume++;
  console.log('   ' + x.jeton.padEnd(44) + 'oui'.padEnd(8) + String(paires.length).padEnd(8)
    + liq.toFixed(2).padEnd(13) + vol.toFixed(2));
  await new Promise((f) => setTimeout(f, 250));
}

/* ══ 2ter. POURQUOI ? LE PREMIER SUSPECT SE MESURE : UNE POOL SANS AUCUN SWAP ═════════════════
 * ⛔⛔ AJOUTE LE 2026-09-21. Constater « 0/8 indexes » sans chercher la cause laisserait le champ
 *     libre a l explication la plus flatteuse. Zero 1 dit qu un index public liste des qu il y a
 *     UNE transaction sur une pool supportee. C est donc le premier suspect, et il se compte.
 * ⛔ CE QUE CA SEPARE : si nos pools ont ZERO swap et que celles des temoins en ont, la cause est
 *    « jamais echange », pas « pas assez liquide ». Si nos pools ONT des swaps et restent inconnues,
 *    le suspect tombe et il faut chercher ailleurs — c est aussi un resultat. */
const TOPIC_SWAP = topicDe('Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)');
const swapsParPool = new Map();
let fSwap = 0, rSwap = 0;
async function balayerSwaps(de, a) {
  let logs;
  try {
    logs = await rpc('eth_getLogs', [{ address: POOLM, topics: [TOPIC_SWAP],
      fromBlock: '0x' + de.toString(16), toBlock: '0x' + a.toString(16) }]);
  } catch (e) {
    /* ⛔ Une fenetre trop chargee se COUPE, elle ne se jette pas : un trou ici ferait passer une
     *    pool active pour une pool morte, et c est exactement la conclusion qu on teste. */
    if (a - de + 1 > 25) {
      const m = de + Math.floor((a - de) / 2);
      await balayerSwaps(de, m); await balayerSwaps(m + 1, a);
      return;
    }
    rSwap += a - de + 1;
    return;
  }
  for (const l of logs || []) swapsParPool.set(l.topics[1], (swapsParPool.get(l.topics[1]) || 0) + 1);
}
for (let b = DE; b <= tete; b += PAS_LOGS) { fSwap++; await balayerSwaps(b, Math.min(b + PAS_LOGS - 1, tete)); }
const swapsDe = (pools) => [...pools].reduce((s, id) => s + (swapsParPool.get(id) || 0), 0);
const nosSwaps = swapsDe(nosPools);
const temoinSwaps = swapsDe(temoinPools);
console.log('\n=== 2ter. NOS POOLS ONT-ELLES JAMAIS ETE ECHANGEES ? ===');
console.log('   blocs non lus : ' + rSwap + (rSwap ? '  ⛔ PLANCHER' : '  ✅ lecture complete'));
console.log('   swaps sur NOS pools      : ' + nosSwaps + '  (' + nosPools.size + ' pool(s))');
console.log('   swaps sur les pools TEMOIN : ' + temoinSwaps + '  (' + temoinPools.size + ' pool(s))');

/* ══ 2bis. LE TEMOIN — les B20 des AUTRES, meme fenetre, meme forme ══════════════════════════ */
console.log('\n=== 2bis. LE TEMOIN : des B20 apparies sur les hooks D AUTRES equipes ===');
let tConnus = 0, tInconnus = 0, tIllisibles = 0, tAvecVolume = 0;
for (const t of temoins.values()) {
  const paires = await indexe(t.jeton);
  if (paires === null) { tIllisibles++; continue; }
  if (!paires.length) { tInconnus++; continue; }
  tConnus++;
  const vol = paires.reduce((s, p) => s + Number((p.volume && p.volume.h24) || 0), 0);
  if (vol > 0) tAvecVolume++;
  await new Promise((f) => setTimeout(f, 250));
}
console.log('   temoins interroges : ' + temoins.size
  + ' · connus : ' + tConnus + ' · inconnus : ' + tInconnus
  + ' · illisibles : ' + tIllisibles + ' · avec volume 24 h : ' + tAvecVolume);
if (temoins.size === 0) {
  console.log('   ⛔ AUCUN TEMOIN RAMASSE — le resultat ci-dessous ne peut PAS etre interprete.');
}

console.log('\n=== 3. CE QUE CA DIT ===');
const total = nos.size;
console.log('   nos blocks examines  : ' + total);
console.log('   connus de l index    : ' + connus);
console.log('   inconnus             : ' + inconnus);
console.log('   illisibles           : ' + illisibles + (illisibles ? '  ⛔ ni oui ni non' : ''));
console.log('   avec de la liquidite : ' + avecLiquidite);
console.log('   avec du volume 24 h  : ' + avecVolume);
if (illisibles === total) {
  console.log('\n   ⛔ TOUT EST ILLISIBLE — l index n a pas repondu. Aucun verdict : ce n est pas');
  console.log('      « nous ne sommes pas indexes », c est « je n ai pas pu demander ».');
} else if (temoins.size === 0) {
  console.log('\n   ⛔ SANS TEMOIN, PAS DE VERDICT. Nos ' + inconnus + ' blocks inconnus peuvent venir');
  console.log('      de nous OU d un index qui ne regarde pas les pools v4 du tout. Indecidable.');
} else if (connus === 0 && tConnus === 0) {
  console.log('\n   ⛔ NI NOUS NI LES AUTRES ne sommes connus de cet index. Ce n est donc PAS notre');
  console.log('      defaut : l index ne couvre pas ces marches. S accuser ici serait une erreur,');
  console.log('      et chercher la visibilite de ce cote-la, une perte de temps.');
} else if (connus === 0 && tConnus > 0) {
  console.log('\n   ⛔⛔ LES AUTRES SONT CONNUS (' + tConnus + '/' + temoins.size + '), NOUS PAS (0/' + total + ').');
  console.log('      Meme fenetre, meme forme, meme index. Le probleme est CHEZ NOUS, et un inconnu');
  console.log('      ne peut pas tomber sur nos blocks : il lui faudrait deja notre adresse.');
  console.log('      Ce n est ni le prix, ni le contrat, ni la devise.');
} else if (avecVolume === 0) {
  console.log('\n   ⚠️ Nos blocks SONT indexes, et aucun n a de volume sur 24 h. Etre trouvable');
  console.log('      n a donc pas suffi — l hypothese « il suffit d etre liste » ne tient pas ici.');
} else {
  console.log('\n   ' + avecVolume + ' de nos blocks ont du volume. La decouvrabilite n est pas le');
  console.log('   blocage pour ceux-la — il faut chercher ailleurs pour les autres.');
}
console.log('\n⛔ BORNE : DexScreener n est pas la chaine. Son silence prouve que CET index ne connait');
console.log('   pas le jeton, pas qu aucun marche n existe. Et etre indexe n est ni etre visible,');
console.log('   ni etre echange — trois choses differentes, affichees separement plus haut.');
