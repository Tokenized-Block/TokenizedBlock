/* mesure-pourquoi-muc-illisible.mjs — POURQUOI NOTRE LECTEUR RATE UNE POOL v4 QUI EXISTE.
 *
 * ⛔⛔ CETTE SONDE EXISTE PARCE QUE JE ME SUIS TROMPE, ET IL FAUT QUE CA RESTE ECRIT.
 *     J avais conclu : « MUc trade sur Aerodrome, notre lecteur est v4-only, donc il est aveugle ».
 *     L index public dit autre chose : MUc a TROIS marches, tous contre USDC —
 *       aerodrome  0x17e1bEB2cD65493Da73ed4BbbC7BEcAAa0F91C73   $1085.87
 *       uniswap v4 0xf9abb7d94dbeb1e9ef4af64e8ac8263ed55d450d1b4582e3f3392697fd1da0ac  $1114.99
 *       uniswap v3 0x8fAc72F692B6fA8ebc54806563883fB3265130aA   $1083.16
 *     ⇒ IL Y A UNE POOL v4. Notre lecteur EST un lecteur v4. Donc la cause n est pas le DEX.
 *
 * ⛔ CE QU ON MESURE MAINTENANT, ET SEULEMENT CA :
 *   1. le StateView v4 sait-il lire ce poolId ? (s il repond, la pool est lisible PAR NOUS)
 *   2. si oui, quelle PoolKey produit ce poolId — et pourquoi nos 21 essais ne l ont pas trouvee ?
 *
 * ⛔ LE poolId EST UN HASH DE LA PoolKey. On ne peut pas l inverser ; on ne peut que RECALCULER des
 *   cles candidates et comparer. Un echec de recalcul ne dit donc PAS « la cle est impossible », il
 *   dit « aucune des cles essayees ne donne ce hash ». La difference compte.
 *
 * ⚠️ Les adresses ci-dessus sont COPIEES de la reponse de l API, jamais reconstruites.
 */
import { selecteur } from './keccak.js';
import { cleDePool, poolId } from './pool.js';

const RPC = process.env.TB_RPC || 'https://mainnet.base.org';
/* ⛔ `selecteur` de keccak.js rend AVEC le prefixe ; celui de pool.js SANS. Deux exportations
 *   homonymes aux conventions opposees — ca m a coute seize « Invalid params » il y a dix minutes. */
const sel = (s) => { const x = selecteur(s); return x.startsWith('0x') ? x : '0x' + x; };

const STATE_VIEW = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';   /* v4 StateView Base, de lancer-pool.js */
const MUC = '0xb200000000000000000000Fd2f87532B90095211';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const POOL_ID_V4 = '0xf9abb7d94dbeb1e9ef4af64e8ac8263ed55d450d1b4582e3f3392697fd1da0ac';

const souffler = (ms = 250) => new Promise((r) => setTimeout(r, ms));
async function appel(to, data) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }) });
  const j = await r.json();
  return j.error ? { erreur: j.error.message || String(j.error.code) } : { ok: j.result };
}

console.log('═══ POURQUOI NOTRE LECTEUR RATE UNE POOL v4 QUI EXISTE ? ═══\n');
console.log('  selecteur getSlot0 : ' + sel('getSlot0(bytes32)'));

/* ── 1. le StateView sait-il lire ce poolId ? ───────────────────────────────────────────────── */
console.log('\n── 1. le StateView v4 repond-il sur ce poolId ? ──');
const r0 = await appel(STATE_VIEW, sel('getSlot0(bytes32)') + POOL_ID_V4.slice(2));
if (r0.erreur) {
  console.log('  ⛔ NON LU : ' + r0.erreur);
  console.log('  ⇒ soit le poolId n est pas un poolId v4, soit le StateView n est pas le bon.');
} else {
  const sqrt = BigInt('0x' + r0.ok.slice(2, 66));
  console.log('  ✅ LU. sqrtPriceX96 = ' + sqrt);
  if (sqrt === 0n) {
    console.log('  ⛔ mais sqrtPrice NUL : pool declaree, jamais initialisee. Ce n est pas un prix de zero.');
  } else {
    console.log('  ⇒ LA POOL EST LISIBLE PAR NOTRE PROPRE STATEVIEW. Le probleme n est donc NI le DEX,');
    console.log('    NI le reseau : c est la PoolKey que nous essayons.');
  }
}

/* ── 2. quelle cle donne ce poolId ? ────────────────────────────────────────────────────────── */
console.log('\n── 2. quelle PoolKey produit ce poolId ? ──');
/* ⛔ On balaie des combinaisons PLAUSIBLES. Un echec ne prouve pas l impossibilite : il prouve que
 *   la bonne cle n est pas dans cette grille — ce qui est deja la reponse utile. */
const FRAIS = [0, 100, 500, 3000, 10000, 20000, 30000, 0x800000];
const ESPACEMENTS = [1, 10, 60, 100, 200, 2000];
const HOOKS = ['0x0000000000000000000000000000000000000000'];
const { HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8 } =
  await import('./tokenomics.js');
for (const h of [HOOK_PREVU, HOOK_V2, HOOK_V3, HOOK_V4, HOOK_V5, HOOK_V6, HOOK_V7, HOOK_V8]) if (h) HOOKS.push(h);

let trouve = null, essais = 0;
for (const fee of FRAIS) {
  for (const ts of ESPACEMENTS) {
    for (const hooks of HOOKS) {
      essais++;
      const cle = cleDePool(USDC, MUC, { fee, tickSpacing: ts, hooks });
      if (poolId(cle).toLowerCase() === POOL_ID_V4.toLowerCase()) { trouve = { fee, ts, hooks, cle }; break; }
    }
    if (trouve) break;
  }
  if (trouve) break;
}
console.log('  cles essayees : ' + essais + ' (' + FRAIS.length + ' frais x ' + ESPACEMENTS.length
  + ' espacements x ' + HOOKS.length + ' hooks)');
if (trouve) {
  console.log('  ✅ TROUVEE : fee=' + trouve.fee + ' tickSpacing=' + trouve.ts + ' hooks=' + trouve.hooks);
  console.log('  ⇒ Si cette combinaison n est pas dans la grille de `marche.js`, c est LA le defaut.');
} else {
  console.log('  ⛔ AUCUNE des combinaisons essayees ne donne ce poolId.');
  console.log('    ⚠️ Ca ne dit PAS que la cle est impossible : un poolId est un hash, on ne');
  console.log('      l inverse pas. Ca dit que la bonne cle est hors de cette grille — et donc,');
  console.log('      a plus forte raison, hors de celle de notre lecteur.');
  console.log('    ⛔ Le vrai correctif ne peut donc pas etre « ajouter une combinaison de plus » :');
  console.log('      il faut DECOUVRIR la cle au lieu de la deviner (evenement Initialize du');
  console.log('      PoolManager, ou index public qui donne deja le poolId).');
}

console.log('\n── CE QUE CETTE SONDE NE DIT PAS ──');
console.log('⛔ Le prix en dollars : `slot0` rend un ratio. Le dollar demande la devise d en face.');
console.log('⛔ Que les autres blocks echouent pour la meme raison : elle en examine UN.');
