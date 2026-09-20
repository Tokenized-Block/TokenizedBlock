/* test-sens-swap.mjs — « Feed = buy, Kill = sell » : le sens d un echange est-il vraiment lu ?
 * ================================================================================================
 * ⛔ CE QUE CE FICHIER PROUVE, ET RIEN DE PLUS :
 *    1. `sensDuSwap` classe acheter / vendre depuis les SEULS signes, sans aucune decimale ;
 *    2. il le fait AUSSI sur une pool a hook — c est exactement ce que l ancienne regle refusait ;
 *    3. `achatDepuisSwap` n a pas sa propre copie du test de signe : les deux tombent toujours
 *       d accord (mutation : casser `sensDuSwap` doit casser les deux) ;
 *    4. bout en bout, `evenementsLive` rend ACHAT / VENTE sur une pool a hook, avec `fraisMarche`.
 * ⛔ CE QU IL NE PROUVE PAS : que les montants affiches soient ceux que le trader a recus. Sur une
 *    pool a hook, le montant du cote non specifie est celui d AVANT le frais du marche — c est
 *    pour ca que l evenement porte `fraisMarche`, et l ecran doit le dire.
 * TEMOIN ROUGE : `test_temoin_ancienne_regle` rejoue la condition d avant (`confiance !== 'HOOK'`)
 *    sur les MEMES donnees et verifie qu elle rendait bien « SWAP ». Sans ce temoin, on ne saurait
 *    pas si le correctif corrige quelque chose.
 */
import assert from 'node:assert/strict';
import { sensDuSwap, achatDepuisSwap, TOPIC_SWAP } from './achats.js';
import { evenementsLive } from './fil-live.js';
import { cleDePool, poolId } from './pool.js';

let n = 0;
const ok = (c, m) => { n += 1; assert.ok(c, m); };
const eq = (a, b, m) => { n += 1; assert.strictEqual(a, b, m); };

const BLOCK = '0xb2000000000000000000000000000000000000aa';
const ETH = '0x0000000000000000000000000000000000000000';
const HOOK = '0x8E1Eb57AD2A87a4f7bc89ce94eFD5cd77aEc2044'; /* le hook V2 en service — copie du depot */
const CLE = cleDePool(ETH, BLOCK, { fee: 0, tickSpacing: 60, hooks: HOOK });
const ID = poolId(CLE);
const SANS_HOOK = cleDePool(ETH, BLOCK, { fee: 3000, tickSpacing: 60,
  hooks: '0x0000000000000000000000000000000000000000' });

/** Un mot de 32 octets portant un int128 signe (complement a deux sur 256 bits). */
const mot = (v) => {
  const x = BigInt(v);
  const u = x < 0n ? (1n << 256n) + x : x;
  return u.toString(16).padStart(64, '0');
};
/** Un log Swap v4 tel que le noeud le rend. amount0/amount1 = delta du TRADER. */
function logSwap({ amount0, amount1, bloc = 51555000, index = 7, tx = '0x' + 'ab'.repeat(32) }) {
  return {
    address: '0x498581ff718922c3f8e6a244956af099b2652b2b',
    topics: [TOPIC_SWAP, ID, '0x' + '0'.repeat(24) + 'cafe'.repeat(10)],
    data: '0x' + mot(amount0) + mot(amount1)
      + mot(79228162514264337593543950336n) + mot(1000000n) + mot(0) + mot(0),
    blockNumber: '0x' + bloc.toString(16),
    logIndex: '0x' + index.toString(16),
    transactionHash: tx,
  };
}
import { decoderSwap } from './achats.js';
/* currency0 est la plus basse : ETH (0x00…) l est toujours. Le block est donc currency1. */
eq(String(CLE.currency0).toLowerCase(), ETH, 'ETH natif est currency0');
eq(String(CLE.currency1).toLowerCase(), BLOCK, 'le block est currency1');

/* ── 1. Le sens, depuis les seuls signes ───────────────────────────────────────────────────────── */
const achat = decoderSwap(logSwap({ amount0: -1_000_000_000_000_000n, amount1: 3_220_000n * 10n ** 18n }));
const vente = decoderSwap(logSwap({ amount0: 2_000_000_000_000_000n, amount1: -5n * 10n ** 18n }));
ok(!achat.erreur, 'le log d achat se decode');
ok(!vente.erreur, 'le log de vente se decode');

const sA = sensDuSwap({ swap: achat, cle: CLE, jeton: BLOCK });
eq(sA.etat, 'ACHAT', 'block recu (+) contre devise versee (-) = un ACHAT');
eq(sA.quantiteBlock, 3_220_000n * 10n ** 18n, 'la quantite de blocks est exacte');
eq(sA.quantiteDevise, 1_000_000_000_000_000n, 'la quantite de devise est exacte');

const sV = sensDuSwap({ swap: vente, cle: CLE, jeton: BLOCK });
eq(sV.etat, 'VENTE', 'block verse (-) contre devise recue (+) = une VENTE');
eq(sV.quantiteBlock, 5n * 10n ** 18n, 'la quantite vendue est exacte');

/* ── 2. AUCUNE decimale n est demandee — c est tout l interet ──────────────────────────────────── */
ok(!('decJeton' in sA) && !('decDevise' in sA), 'sensDuSwap ne rend aucune decimale');
eq(sensDuSwap({ swap: achat, cle: CLE, jeton: BLOCK }).etat, 'ACHAT', 'appel repete, meme reponse');

/* ── 3. Les refus sont NOMMES, jamais classes au plus probable ─────────────────────────────────── */
eq(sensDuSwap({ swap: decoderSwap(logSwap({ amount0: 1n, amount1: 1n })), cle: CLE, jeton: BLOCK }).etat,
  'INCOHERENT', 'deux signes egaux ne se classent pas');
eq(sensDuSwap({ swap: decoderSwap(logSwap({ amount0: 0n, amount1: -5n })), cle: CLE, jeton: BLOCK }).etat,
  'INCOHERENT', 'un zero ne se classe pas');
eq(sensDuSwap({ swap: achat, cle: SANS_HOOK, jeton: BLOCK }).etat, 'AUTRE_POOL',
  'une cle voisine (frais different) est refusee, pas inversee en silence');
eq(sensDuSwap({ swap: achat, cle: CLE, jeton: '0xdead000000000000000000000000000000000000' }).etat,
  'HORS_POOL', 'un jeton absent de la cle est refuse');
eq(sensDuSwap({ swap: { erreur: 'x' }, cle: CLE, jeton: BLOCK }).etat, 'SWAP_ILLISIBLE',
  'un swap illisible reste illisible');

/* ── 4. L ordre des adresses decide qui est le block, pas le role ──────────────────────────────── */
/* ⛔ Un block d adresse BASSE devient currency0 : le meme log doit alors se lire a l envers. */
const BAS = '0x0000000000000000000000000000000000000abc';
const HAUT = '0xffff000000000000000000000000000000000001';
const CLE2 = cleDePool(BAS, HAUT, { fee: 0, tickSpacing: 60, hooks: HOOK });
eq(String(CLE2.currency0).toLowerCase(), BAS, 'le block bas est currency0');
const swap2 = decoderSwap({ ...logSwap({ amount0: 7n, amount1: -9n }), topics: [TOPIC_SWAP, poolId(CLE2), '0x' + '0'.repeat(24) + 'cafe'.repeat(10)] });
eq(sensDuSwap({ swap: swap2, cle: CLE2, jeton: BAS }).etat, 'ACHAT', 'block en currency0, delta positif = ACHAT');
eq(sensDuSwap({ swap: swap2, cle: CLE2, jeton: HAUT }).etat, 'VENTE', 'vu depuis l autre jeton, c est une VENTE');

/* ── 5. UNE SEULE implementation : achatDepuisSwap tombe d accord, etat par etat ───────────────── */
for (const [swap, attendu] of [[achat, 'ACHAT'], [vente, 'VENTE'],
  [decoderSwap(logSwap({ amount0: 1n, amount1: 1n })), 'INCOHERENT']]) {
  const a = achatDepuisSwap({ swap, cle: CLE, jeton: BLOCK, decJeton: 18, decDevise: 18 });
  eq(a.etat, attendu, 'achatDepuisSwap rend ' + attendu + ' comme sensDuSwap');
  eq(a.etat, sensDuSwap({ swap, cle: CLE, jeton: BLOCK }).etat, 'les deux fonctions ne divergent jamais');
}
const aa = achatDepuisSwap({ swap: achat, cle: CLE, jeton: BLOCK, decJeton: 18, decDevise: 18 });
eq(aa.quantiteBlockTexte, '3220000', 'le texte de quantite reste celui d avant');

/* ── 6. BOUT EN BOUT : le fil Live classe un swap d une pool A HOOK ────────────────────────────── */
const rpcFaux = async (methode, params) => {
  if (methode === 'eth_getLogs') {
    const f = params[0] || {};
    const t0 = f.topics && f.topics[0];
    if (String(t0).toLowerCase() === TOPIC_SWAP) {
      return [logSwap({ amount0: -1_000_000_000_000_000n, amount1: 3_220_000n * 10n ** 18n }),
        logSwap({ amount0: 2_000_000_000_000_000n, amount1: -5n * 10n ** 18n, index: 9, tx: '0x' + 'cd'.repeat(32) })];
    }
    return [];
  }
  throw new Error('methode inattendue dans ce test : ' + methode);
};
const poolsDecouvertes = new Map([[ID, { cle: CLE, jeton: BLOCK, confiance: 'HOOK' }]]);
const r = await evenementsLive({
  rpc: rpcFaux, poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
  blocks: [{ jeton: BLOCK, sym: 'MACHO', dec: 18 }],
  deBloc: 51554000, aBloc: 51555999,
  lireCreations: async () => ({ blocks: [], fenetresRatees: [] }),
  poolsDecouvertes, lireTransferts: false,
});
const types = r.evenements.map((e) => e.type).sort();
assert.deepStrictEqual(types, ['ACHAT', 'VENTE'], 'sur une pool a hook, le fil rend un ACHAT et une VENTE'); n += 1;
const evA = r.evenements.find((e) => e.type === 'ACHAT');
eq(evA.quantite, '3220000', 'la quantite de blocks est portee par l evenement');
eq(evA.eth, '0.001', 'la quantite d ETH est portee par l evenement');
eq(evA.devise, 'ETH', 'la devise est nommee');
eq(evA.fraisMarche, true, 'pool a hook : le montant est celui d AVANT le frais du marche, et ca se dit');
eq(evA.verifie, true, 'un sens prouve est un evenement verifie');

/* ── 7. TEMOIN ROUGE : l ancienne regle rendait « SWAP » sur exactement ces donnees ─────────────── */
function ancienneRegle({ confiance, dec, devise }) {
  /* copie EXACTE de la condition d avant le 2026-09-20 (fil-live.js:157) */
  return dec !== null && confiance !== 'HOOK' && devise ? 'CLASSE' : 'SWAP';
}
eq(ancienneRegle({ confiance: 'HOOK', dec: 18, devise: { nom: 'ETH', dec: 18 } }), 'SWAP',
  'TEMOIN : l ancienne regle refusait de classer TOUTE pool a hook');
eq(ancienneRegle({ confiance: 'SANS_HOOK', dec: 18, devise: { nom: 'ETH', dec: 18 } }), 'CLASSE',
  'TEMOIN : elle ne classait que les pools sans hook — 0 sur 118 mesurees en prod');

console.log('test-sens-swap : ' + n + ' assertions, exit 0');
