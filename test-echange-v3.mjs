/* test-echange-v3.mjs — L ORDRE DES ETAPES, LA PROVENANCE DE LA POOL, ET LA CAUSE D UN REFUS.
 *
 * ⛔⛔ LE CAS LE PLUS IMPORTANT DE CE FICHIER : quand une autorisation manque, LA SIMULATION NE DOIT
 *     PAS AVOIR ETE APPELEE. Sinon elle reverte sur l allowance et on affiche « la chaine refuse cet
 *     echange » — un message vrai dans sa forme et FAUX dans sa cause. L utilisateur chercherait un
 *     probleme de marche alors qu il lui manque une signature. On COMPTE les appels pour le prouver,
 *     au lieu de croire l ordre des lignes.
 *
 * ⛔⛔ ET LA POOL EST PROUVEE PAR ALLER-RETOUR. N importe quel contrat peut repondre a `slot0()` avec
 *     le prix qu il veut. Si la factory Uniswap v3 ne reconnait pas la pool pour ce triplet, on
 *     refuse — le routeur ne saurait pas l atteindre, et le prix serait invente.
 *
 * Valeurs de la pool MUc, LUES sur la chaine le 2026-09-28 : fee=10000, token0=USDC, token1=block,
 * sqrt=24536918604096807031392936937, 8 decimales, pool 0x8fAc72F6…30aA.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un echange aboutisse. Le `rpc` est scripte ; il prouve les
 *   DECISIONS du module, pas le comportement de la chaine.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { planAchatUsdcV3, FACTORY_UNISWAP_V3, ETATS_V3 } from './echange-v3.js';
import { selecteur } from './pool.js';
import { PERMIT2 } from './lancer-pool.js';
import { ROUTEUR } from './echange.js';
import { USDC_BASE } from './plan-usdc-block.js';
import { ROUTEUR_AERODROME_CL, FACTORY_AERODROME_CL } from './calldata-aerodrome.js';

let n = 0;
const cas = (titre, f) => { n++; return f().catch((e) => { console.error('✗ ' + titre); throw e; }); };

const BLOCK = '0xb200000000000000000000fd2f87532b90095211';
const POOL = '0x8fAc72F692B6fA8ebc54806563883fB3265130aA';
const COMPTE = '0x041e9e88288c0c62b8549c50a759a74a1a65b6b7';
const SQRT = 24536918604096807031392936937n;
const MAINTENANT = 1790604967;
const CENT_USDC = 100000000n;
const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const motAdr = (a) => String(a).toLowerCase().replace(/^0x/, '').padStart(64, '0');

/* ⛔⛔ LE SELECTEUR EST COMPARE SANS PREFIXE, ET C EST CE DETAIL QUI A REVELE UN VRAI DEFAUT.
 *     `selecteur()` rend HUIT caracteres hex SANS `0x`. Mon `echange-v3.js` construisait donc des
 *     `data` NON prefixes, qu un vrai noeud aurait refuses — les lectures de pool passaient par
 *     accident parce que leur data n etait QUE le selecteur. Le module prefixe maintenant au seul
 *     endroit qui appelle la chaine ; ici on compare de facon insensible au prefixe, pour que le
 *     test ne depende pas de ce choix. */
const sansPrefixe = (sig) => selecteur(sig).replace(/^0x/, '');

/** Un `rpc` scripte, qui COMPTE ses appels. `sur` permet de tordre une reponse precise. */
function faireRpc(sur = {}) {
  const journal = [];
  const rpc = async (methode, params) => {
    const p = (params && params[0]) || {};
    const to = String(p.to || '').toLowerCase();
    const data = String(p.data || '');
    const sel = data.replace(/^0x/, '').slice(0, 8);
    const estSimulation = !!p.from;
    journal.push({ to, sel, estSimulation, data });
    if (sur.jeter && sur.jeter(to, sel, estSimulation)) throw new Error(sur.message || 'execution reverted: boom');
    if (estSimulation) return '0x';
    if (to === POOL.toLowerCase()) {
      if (sel === sansPrefixe('slot0()')) return '0x' + mot(sur.sqrt !== undefined ? sur.sqrt : SQRT) + mot(0).repeat(6);
      if (sel === sansPrefixe('fee()')) return '0x' + mot(sur.fee !== undefined ? sur.fee : 10000);
      if (sel === sansPrefixe('token0()')) return '0x' + motAdr(sur.token0 || USDC_BASE);
      if (sel === sansPrefixe('token1()')) return '0x' + motAdr(sur.token1 || BLOCK);
    }
    if (to === FACTORY_UNISWAP_V3.toLowerCase() && sel === sansPrefixe('getPool(address,address,uint24)')) {
      return '0x' + motAdr(sur.poolRendue !== undefined ? sur.poolRendue : POOL);
    }
    if (to === USDC_BASE.toLowerCase() && sel === sansPrefixe('allowance(address,address)')) {
      return '0x' + mot(sur.allowP2 !== undefined ? sur.allowP2 : (1n << 200n));
    }
    if (to === PERMIT2.toLowerCase() && sel === sansPrefixe('allowance(address,address,address)')) {
      const montant = sur.allowR !== undefined ? sur.allowR : (1n << 150n);
      const exp = sur.expiration !== undefined ? sur.expiration : BigInt(MAINTENANT + 86400);
      return '0x' + mot(montant) + mot(exp) + mot(0);
    }
    throw new Error('execution reverted: unscripted call ' + to + ' ' + sel);
  };
  return { rpc, journal };
}
const base = { compte: COMPTE, block: BLOCK, pool: POOL, montantUsdc: CENT_USDC, famille: 'v3',
  toleranceBps: 100, maintenantSec: MAINTENANT };

await cas('⛔ le chemin qui marche rend PRET, avec sa transaction et sa borne', async () => {
  const { rpc, journal } = faireRpc();
  const r = await planAchatUsdcV3({ rpc, ...base });
  assert.equal(r.etat, 'PRET', r.pourquoi || '');
  assert.equal(r.tx.to.toLowerCase(), String(ROUTEUR[8453]).toLowerCase());
  assert.equal(r.tx.value, '0x0', 'un achat en USDC n envoie aucun ether');
  assert.equal(r.plan.fee, 10000, 'le fee doit venir de la pool');
  assert.ok(BigInt(r.plan.minSortie) > 0n);
  /* ⛔ LA SIMULATION A BIEN EU LIEU, et avec `from` : sans `from`, la chaine ne verifie ni le solde
   *   ni l allowance, et « accepte » une transaction que le wallet refusera. */
  const sims = journal.filter((x) => x.estSimulation);
  assert.equal(sims.length, 1, 'il doit y avoir exactement une simulation');
  assert.match(r.borne, /can still move before you sign/i, 'la borne de la simulation doit etre dite');
  assert.ok(ETATS_V3.includes(r.etat));
  /* ⛔⛔ CHAQUE `data` DOIT ETRE PREFIXE `0x`, ET CETTE ASSERTION EST NEE D UNE MUTATION QUI PASSAIT.
   *     En rendant l aiguillage du faux rpc INSENSIBLE au prefixe — pour ne pas dependre d un choix
   *     d implementation — je lui ai retire le pouvoir de detecter le bug qu il venait justement de
   *     trouver : six `eth_call` construits sans `0x`, qu un vrai noeud aurait refuses.
   *   ⇒ IL FAUT LES DEUX : un aiguillage insensible, ET un controle explicite du prefixe. Rendre une
   *     sonde tolerante sur un point la rend aveugle sur ce point ; il faut alors le regarder ailleurs. */
  assert.ok(journal.length >= 7, 'trop peu d appels pour juger : ' + journal.length);
  for (const x of journal) {
    assert.ok(x.data.startsWith('0x'),
      'un eth_call part avec un data NON prefixe (' + x.data.slice(0, 12) + '…) : un vrai noeud le refuse');
  }
});

await cas('⛔⛔ une autorisation manquante rend APPROBATIONS SANS AVOIR SIMULE', async () => {
  /* ⛔⛔ LE CAS QUI COMPTE. On COMPTE les appels : si la simulation avait tourne, elle aurait reverte
   *     sur l allowance et le message aurait accuse le marche au lieu de l approbation. */
  const { rpc, journal } = faireRpc({ allowP2: 0n });
  const r = await planAchatUsdcV3({ rpc, ...base });
  assert.equal(r.etat, 'APPROBATIONS');
  assert.equal(r.etapes.length, 1, 'une seule approbation manque ici');
  assert.equal(r.etapes[0].to, USDC_BASE.toLowerCase(), 'l approbation porte sur l USDC, pas sur le block');
  assert.equal(journal.filter((x) => x.estSimulation).length, 0,
    'LA SIMULATION A TOURNE alors qu une autorisation manque : son revert accuserait le marche');
  /* ⛔ ET LE PLAN VOYAGE QUAND MEME : l ecran peut montrer le montant attendu avant de faire signer. */
  assert.ok(r.plan && BigInt(r.plan.minSortie) > 0n);
});

await cas('⛔⛔ une allowance SUFFISANTE mais EXPIREE compte comme manquante', async () => {
  /* ⛔ Les deux conditions, pas une. Une allowance Permit2 expiree ne vaut rien, et l oublier
   *   produirait une simulation qui reverte pour une raison illisible. */
  const { rpc, journal } = faireRpc({ expiration: BigInt(MAINTENANT + 10) });
  const r = await planAchatUsdcV3({ rpc, ...base });
  assert.equal(r.etat, 'APPROBATIONS');
  assert.equal(r.etapes[0].to, PERMIT2.toLowerCase(), 'c est l autorisation du ROUTEUR qui doit etre renouvelee');
  assert.equal(journal.filter((x) => x.estSimulation).length, 0);
  /* temoin positif : une expiration large passe */
  const ok = await planAchatUsdcV3({ rpc: faireRpc({ expiration: BigInt(MAINTENANT + 86400) }).rpc, ...base });
  assert.equal(ok.etat, 'PRET');
});

await cas('⛔⛔ la POOL EST PROUVEE : la factory doit la reconnaitre', async () => {
  /* ⛔ Sans cet aller-retour, un contrat quelconque repondant a `slot0()` fixerait notre prix. */
  const autre = '0x' + '9'.repeat(40);
  const r = await planAchatUsdcV3({ rpc: faireRpc({ poolRendue: autre }).rpc, ...base });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /factory does not know this pool/i);
  assert.match(r.pourquoi, /cannot be trusted/i);
  /* l adresse nulle — ce que rend la factory pour un triplet inconnu — est refusee aussi */
  const nulle = await planAchatUsdcV3({ rpc: faireRpc({ poolRendue: '0x' + '0'.repeat(40) }).rpc, ...base });
  assert.equal(nulle.etat, 'REFUSE');
  assert.match(nulle.pourquoi, /factory does not know/i);
});

await cas('⛔ une pool qui ne contient pas les DEUX jetons est refusee', async () => {
  /* ⛔ Sans ce controle on prendrait le prix d un AUTRE actif et on l afficherait sous le nom du
   *   block — plausible, et faux. */
  const r = await planAchatUsdcV3({ rpc: faireRpc({ token1: '0x' + '7'.repeat(40) }).rpc, ...base });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /does not hold both/i);
  const sansUsdc = await planAchatUsdcV3({ rpc: faireRpc({ token0: '0x' + '6'.repeat(40) }).rpc, ...base });
  assert.equal(sansUsdc.etat, 'REFUSE');
  assert.match(sansUsdc.pourquoi, /does not hold both/i);
});

await cas('⛔⛔ « on n a pas pu lire » N EST PAS « la chaine refuse »', async () => {
  /* ⛔ Un RPC injoignable qui deviendrait un REFUS ferait croire a l utilisateur que son achat est
   *   impossible, alors que c est NOTRE lecture qui a echoue. */
  const reseau = await planAchatUsdcV3({
    rpc: faireRpc({ jeter: (to, sel) => to === POOL.toLowerCase() && sel === selecteur('slot0()'),
      message: 'fetch failed' }).rpc, ...base });
  assert.equal(reseau.etat, 'NON_MESURE');
  assert.match(reseau.pourquoi, /could not read slot0/i);
  /* ⛔ MAIS UN REVERT EST UN FAIT : ce contrat n est pas une pool v3. */
  const revert = await planAchatUsdcV3({
    rpc: faireRpc({ jeter: (to, sel) => to === POOL.toLowerCase() && sel === selecteur('slot0()'),
      message: 'execution reverted' }).rpc, ...base });
  assert.equal(revert.etat, 'REFUSE');
  assert.match(revert.pourquoi, /does not answer like a v3 pool/i);
  /* ⛔ et une autorisation illisible n est pas une autorisation absente */
  const appro = await planAchatUsdcV3({
    rpc: faireRpc({ jeter: (to) => to === PERMIT2.toLowerCase(), message: 'fetch failed' }).rpc, ...base });
  assert.equal(appro.etat, 'NON_MESURE');
  assert.match(appro.pourquoi, /approval could not be read/i);
});

await cas('⛔⛔ un manque de FONDS et un refus de MARCHE sont dits differemment', async () => {
  /* ⛔ Les deux appellent des reponses OPPOSEES : l un envoie vers le Bridge, l autre vers le
   *   montant. Les confondre a deja ete mesure sur le chemin v4 (capture de Phil, Rabby mobile). */
  const fonds = await planAchatUsdcV3({
    rpc: faireRpc({ jeter: (to, sel, sim) => sim, message: 'execution reverted: TRANSFER_FROM_FAILED' }).rpc, ...base });
  assert.equal(fonds.etat, 'REFUSE');
  assert.equal(fonds.sansFonds, true);
  assert.match(fonds.pourquoi, /not enough USDC/i);
  assert.ok(!/execution reverted/i.test(fonds.pourquoi), 'le message technique ne doit pas fuir ici');
  const marche = await planAchatUsdcV3({
    rpc: faireRpc({ jeter: (to, sel, sim) => sim, message: 'execution reverted: TooLittleReceived' }).rpc, ...base });
  assert.equal(marche.etat, 'REFUSE');
  assert.equal(marche.sansFonds, false);
  assert.match(marche.pourquoi, /chain refuses this exact transaction/i);
  assert.match(marche.pourquoi, /TooLittleReceived/, 'le detail technique doit etre garde quand on ne sait pas');
});

await cas('⛔ le deadline vient d un instant FOURNI, jamais de l horloge du module', async () => {
  /* ⛔ Lire l heure ici rendrait ce module non rejouable, et le test ci-dessus impossible a ecrire. */
  for (const t of [undefined, null, 0, -1, 1.5, '1790604967']) {
    const r = await planAchatUsdcV3({ rpc: faireRpc().rpc, ...base, maintenantSec: t });
    assert.equal(r.etat, 'REFUSE', 'maintenantSec=' + JSON.stringify(t) + ' doit etre refuse');
    assert.match(r.pourquoi, /reference instant/i);
  }
  const src = readFileSync(new URL('./echange-v3.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  for (const interdit of ['Date.now', 'new Date', 'Math.random', 'eth_sendTransaction',
    'wallet_sendCalls', 'personal_sign', 'fetch(']) {
    assert.ok(!src.includes(interdit), 'echange-v3.js contient ' + interdit);
  }
  /* ⛔ ET IL NE SIGNE RIEN : seul `eth_call` sort de ce module. */
  const appels = [...src.matchAll(/rpc\('([a-zA-Z_]+)'/g)].map((x) => x[1]);
  assert.deepEqual([...new Set(appels)], ['eth_call'], 'ce module ne doit appeler que eth_call');
});

await cas('⛔ les entrees manquantes sont refusees avant tout appel', async () => {
  const { rpc, journal } = faireRpc();
  for (const [champ, v] of [['compte', ''], ['block', '0x'], ['pool', 'pas-une-adresse']]) {
    const r = await planAchatUsdcV3({ rpc, ...base, [champ]: v });
    assert.equal(r.etat, 'REFUSE', champ + '=' + JSON.stringify(v) + ' doit etre refuse');
  }
  assert.equal(journal.length, 0, 'une entree invalide ne doit declencher AUCUNE lecture de chaine');
  const sansRpc = await planAchatUsdcV3({ ...base });
  assert.equal(sansRpc.etat, 'NON_MESURE', 'sans lecteur de chaine, on ne REFUSE pas : on ne sait pas');
});

/* ── AERODROME : la MEME fonction, une famille differente ───────────────────────────────────── */
const POOL_A = '0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9';
const BLOCK_A = '0xb20000000000000000000078ee7ce2fe4908108c';
/* ⛔ VALEURS LUES SUR LA CHAINE le 2026-09-28 — et j ai deja fabrique un `sqrtPriceX96` dans cette
 *   session, faux d un facteur 12 627. Celles-ci viennent de `pools-aerodrome.json`. */
const SQRT_A = 52267783314573183670416926724n;
function faireRpcAero(sur = {}) {
  const journal = [];
  const rpc = async (methode, params) => {
    const p = (params && params[0]) || {};
    const to = String(p.to || '').toLowerCase();
    const data = String(p.data || '');
    const sel = data.replace(/^0x/, '').slice(0, 8);
    const estSimulation = !!p.from;
    journal.push({ to, sel, estSimulation, data });
    if (sur.jeter && sur.jeter(to, sel, estSimulation)) throw new Error(sur.message || 'execution reverted: boom');
    if (estSimulation) return '0x';
    if (to === POOL_A.toLowerCase()) {
      if (sel === sansPrefixe('slot0()')) return '0x' + mot(SQRT_A) + mot(0).repeat(6);
      if (sel === sansPrefixe('fee()')) return '0x' + mot(500);
      if (sel === sansPrefixe('tickSpacing()')) return '0x' + mot(sur.tickSpacing !== undefined ? sur.tickSpacing : 10);
      if (sel === sansPrefixe('token0()')) return '0x' + motAdr(USDC_BASE);
      if (sel === sansPrefixe('token1()')) return '0x' + motAdr(BLOCK_A);
    }
    /* ⛔⛔ CE FAUX VERIFIE SES ARGUMENTS, ET C EST NE DE DEUX MUTATIONS QUI PASSAIENT. Il repondait
     *     « voici la pool » quel que soit le TROISIEME MOT, donc echanger `fee` (500) et
     *     `tickSpacing` (10) dans l appel a la factory ne se voyait pas. Et il rendait une allowance
     *     enorme pour N IMPORTE QUEL beneficiaire, donc remplacer le routeur Aerodrome par celui
     *     d Uniswap passait aussi.
     *   ⇒ UN FAUX DOIT ETRE AUSSI EXIGEANT QUE LA CHOSE QU IL REMPLACE. La vraie factory Aerodrome
     *     rend l adresse nulle sur un tickSpacing qui ne correspond a aucune pool — on fait pareil. */
    if (to === FACTORY_AERODROME_CL.toLowerCase() && sel === sansPrefixe('getPool(address,address,int24)')) {
      const troisieme = BigInt('0x' + data.replace(/^0x/, '').slice(8 + 128, 8 + 192));
      const attendu = BigInt(sur.tickSpacing !== undefined ? sur.tickSpacing : 10);
      /* ⛔ la vraie factory ne connait AUCUNE pool pour un mauvais espacement : adresse nulle */
      if (troisieme !== attendu) return '0x' + motAdr('0x' + '0'.repeat(40));
      return '0x' + motAdr(sur.poolRendue !== undefined ? sur.poolRendue : POOL_A);
    }
    if (to === USDC_BASE.toLowerCase() && sel === sansPrefixe('allowance(address,address)')) {
      /* ⛔ L ALLOWANCE EST PROPRE A UN BENEFICIAIRE : un vrai jeton rend ZERO pour un autre spender.
       *   Repondre pareil a tout le monde faisait passer un changement de routeur inapercu. */
      const spender = '0x' + data.replace(/^0x/, '').slice(8 + 64 + 24, 8 + 128);
      if (spender.toLowerCase() !== ROUTEUR_AERODROME_CL.toLowerCase()) return '0x' + mot(0);
      return '0x' + mot(sur.allowance !== undefined ? sur.allowance : (1n << 200n));
    }
    throw new Error('execution reverted: unscripted ' + to + ' ' + sel);
  };
  return { rpc, journal };
}
const baseA = { compte: COMPTE, block: BLOCK_A, pool: POOL_A, montantUsdc: CENT_USDC,
  toleranceBps: 100, maintenantSec: MAINTENANT, famille: 'cl' };

await cas('⛔⛔ la FAMILLE est exigee : aucun defaut ne choisit la factory', async () => {
  /* ⛔⛔ Un defaut a 'v3' interrogerait la factory Uniswap pour une pool Aerodrome. Elle ne la
   *     connait pas ⇒ provenance refusee ⇒ l ecran dirait « cette pool n est pas fiable » sur une
   *     pool parfaitement valide. Un faux negatif sur 12,10 M$ de profondeur. */
  const { rpc, journal } = faireRpcAero();
  for (const f of [undefined, null, '', 'V3', 'CL', 'aerodrome', 'uniswap', 0]) {
    const r = await planAchatUsdcV3({ rpc, ...baseA, famille: f });
    assert.equal(r.etat, 'REFUSE', 'famille=' + JSON.stringify(f) + ' doit etre refuse');
    assert.match(r.pourquoi, /famille must be/i);
  }
  assert.equal(journal.length, 0, 'une famille invalide ne doit declencher AUCUNE lecture');
});

await cas('⛔⛔ AERODROME N INTERROGE JAMAIS PERMIT2, et n a QU UNE approbation', async () => {
  /* ⛔⛔ LE CAS LE PLUS FORT DE CE FICHIER. Mesure du 2026-09-28 : l adresse de Permit2 est ABSENTE
   *     du bytecode du routeur Aerodrome. Lui demander une allowance Permit2 ferait signer pour rien
   *     ET laisserait le swap echouer. On COMPTE les appels pour le prouver — un commentaire ne le
   *     prouverait pas. */
  const { rpc, journal } = faireRpcAero({ allowance: 0n });
  const r = await planAchatUsdcV3({ rpc, ...baseA });
  assert.equal(r.etat, 'APPROBATIONS');
  assert.equal(r.etapes.length, 1, 'Aerodrome n a qu UNE approbation, pas deux comme Uniswap');
  assert.equal(r.etapes[0].to, USDC_BASE.toLowerCase(), 'l approbation porte sur l USDC');
  assert.match(r.etapes[0].nom, /Aerodrome router/i);
  assert.match(r.etapes[0].nom, /exactly this USDC/i, 'le montant EXACT, pas un maximum');
  assert.equal(journal.filter((x) => x.to === PERMIT2.toLowerCase()).length, 0,
    'PERMIT2 a ete interroge pour un swap Aerodrome : une signature pour rien, et le swap echouerait');
  assert.equal(r.plan.viaPermit2, false);
  assert.equal(journal.filter((x) => x.estSimulation).length, 0, 'aucune simulation avant l approbation');
  /* temoin positif : avec l allowance, on va jusqu a PRET */
  const ok = await planAchatUsdcV3({ rpc: faireRpcAero().rpc, ...baseA });
  assert.equal(ok.etat, 'PRET', ok.pourquoi || '');
  assert.equal(ok.tx.to.toLowerCase(), ROUTEUR_AERODROME_CL.toLowerCase(),
    'le calldata Aerodrome doit partir vers le routeur AERODROME, pas vers celui d Uniswap');
});

await cas('⛔⛔ AERODROME lit le `tickSpacing`, et la factory est interrogee avec LUI', async () => {
  /* ⛔ `fee()` = 500 et `tickSpacing()` = 10 sur cette pool : un rapport de 50. Interroger la
   *   factory avec le fee ne rendrait pas une mauvaise pool — ca ne rendrait RIEN. */
  const { rpc, journal } = faireRpcAero();
  const r = await planAchatUsdcV3({ rpc, ...baseA });
  assert.equal(r.etat, 'PRET');
  assert.equal(r.plan.fee, 500, 'le fee sert au CALCUL');
  assert.equal(r.plan.tickSpacing, 10, 'le tickSpacing sert au CALLDATA');
  assert.notEqual(r.plan.fee, r.plan.tickSpacing);
  /* ⛔ LA FACTORY AERODROME A BIEN ETE INTERROGEE, avec la signature `int24` */
  const appelsFactory = journal.filter((x) => x.to === FACTORY_AERODROME_CL.toLowerCase());
  assert.equal(appelsFactory.length, 1, 'la provenance n a pas ete demandee a la factory Aerodrome');
  assert.equal(appelsFactory[0].sel, sansPrefixe('getPool(address,address,int24)'),
    'la factory Aerodrome a ete interrogee avec la signature uint24 : elle REVERTE dessus');
  /* ⛔ et le tickSpacing a bien ete LU sur la pool */
  assert.ok(journal.some((x) => x.to === POOL_A.toLowerCase() && x.sel === sansPrefixe('tickSpacing()')),
    'le tickSpacing n a pas ete lu : il serait suppose');
  /* ⛔ un tickSpacing inutilisable est refuse, pas contourne */
  const zero = await planAchatUsdcV3({ rpc: faireRpcAero({ tickSpacing: 0 }).rpc, ...baseA });
  assert.equal(zero.etat, 'REFUSE');
  assert.match(zero.pourquoi, /unusable tickSpacing/i);
});

await cas('⛔ la provenance Aerodrome est prouvee, et le refus nomme le tickSpacing', async () => {
  const r = await planAchatUsdcV3({ rpc: faireRpcAero({ poolRendue: '0x' + '5'.repeat(40) }).rpc, ...baseA });
  assert.equal(r.etat, 'REFUSE');
  assert.match(r.pourquoi, /Aerodrome CL factory does not know/i);
  /* ⛔ LE MESSAGE NOMME LE BON CHAMP : dire « fee » sur un refus Aerodrome enverrait chercher la
   *   mauvaise cause, puisque c est le tickSpacing qui identifie la pool. */
  assert.match(r.pourquoi, /tickSpacing/i);
  assert.ok(!/and fee —/i.test(r.pourquoi), 'le refus Aerodrome parle du fee au lieu du tickSpacing');
});

await cas('⛔ la factory publiee est celle du routeur, pas celle d Aerodrome', async () => {
  /* ⛔ L erreur exactement inverse de celle qu on veut eviter : la factory Aerodrome porte un
   *   `int24 tickSpacing` a la place du `uint24 fee`, et son selecteur DIFFERE. */
  assert.match(FACTORY_UNISWAP_V3, /^0x[0-9a-fA-F]{40}$/);
  assert.notEqual(FACTORY_UNISWAP_V3.toLowerCase(), '0xf8f2eb4940cfe7d13603dddd87f123820fc061ef');
  assert.notEqual(selecteur('getPool(address,address,uint24)'), selecteur('getPool(address,address,int24)'));
});

assert.equal(n, 14, 'compte de cas inattendu : ' + n);
console.log('✓ test-echange-v3 : ' + n + ' cas');
console.log('   L ordre est prouve en COMPTANT les appels : aucune simulation avant les approbations.');
console.log('   ⚠️ NE PROUVE PAS qu un echange aboutisse : le rpc est scripte.');
