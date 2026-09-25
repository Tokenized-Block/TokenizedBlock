/* test-paire-block-b20.mjs — UN BLOCK APPAIRE A UN AUTRE BLOCK DOIT ETRE VISIBLE.
 *
 * ⛔⛔ CE QUI MANQUAIT. L interface acceptait DEJA une paire B20 : `qualifierPaire` rend le type
 *     SAISIE avec `besoinB20`, et Create verifie le code `0xef` avant de laisser signer. Mais
 *     `vieEnDevise` n acceptait que les devises du REGISTRE (USDC, cbBTC, les 13 actions). Un block
 *     appaire a un autre block naissait donc, sa pool existait sur la chaine, et l app le montrait
 *     « sans marche » POUR TOUJOURS. On pouvait le creer et ne jamais le voir vivre — exactement la
 *     forme de defaut qu on a passe la journee a fermer ailleurs.
 *
 * ⛔⛔ LE MARQUEUR EST LE CODE, JAMAIS LE PREFIXE D ADRESSE. `0xb2…` se choisit avec CREATE2 :
 *     n importe qui peut deployer a une adresse qui y ressemble. `eth_getCode` valant EXACTEMENT
 *     `0xef` est infalsifiable — l EIP-3541 interdit ce premier octet a tout deploiement normal.
 *     ⛔ EGALITE STRICTE : ni `startsWith`, ni une longueur. C est par un prefixe que ce depot s est
 *       deja fait avoir une fois (`startsWith('0xb20')` attrapait TOUS les jetons CREATE2).
 *
 * ⛔ CE TEST EXECUTE `vieDuBlock` avec un RPC de laboratoire — il ne lit pas la source. Le temoin
 *   qui compte est le NEGATIF : un imposteur au bon prefixe mais au mauvais code doit etre refuse.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : qu un tel marche soit echangeable dans l app. Il ne le sera que
 *   si le prix du block-devise a ete MESURE (garde `test-frais-devise-mesuree.mjs`) — sinon le
 *   frais de 0,5 % atterrirait dans un jeton qu on ne sait pas revendre, et a6cf a deja paye ca.
 */
import { strict as assert } from 'node:assert';
import { vieDuBlock } from './marche.js';
import { poolId } from './pool.js';

let n = 0;
const cas = [];
const v = (nom, fn) => { cas.push([nom, fn]); };

const BLOCK = '0xb20000000000000000000016d09cd53724fc0601';
const STATEVIEW = '0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71';

const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
/** `symbol()` encode en ABI : offset, longueur, octets. */
function symboleAbi(s) {
  const oct = Buffer.from(s, 'utf8').toString('hex');
  return '0x' + mot(32) + mot(s.length) + oct.padEnd(64, '0');
}

/** RPC de laboratoire. `code` decide de ce que rend `eth_getCode` pour la devise. */
function rpcLabo({ code, symbole = 'PAIRB', idsAttendus = [] }) {
  const vus = { getCode: 0, symbol: 0 };
  const fn = async (methode, params) => {
    if (methode === 'eth_getCode') { vus.getCode++; return code; }
    const to = String(params && params[0] && params[0].to || '').toLowerCase();
    const data = String(params && params[0] && params[0].data || '');
    if (methode !== 'eth_call') return '0x';
    /* ⛔⛔ UN SQRT NON NUL SEULEMENT POUR NOTRE CLE. Ma premiere version en rendait un pour TOUTE
     *     pool : le chemin ETH de `vieDuBlock`, essaye en premier, gagnait donc toujours et le test
     *     n exercait JAMAIS la branche qu il pretend garder. Il « passait » sur `devise: 'ETH'`.
     *     Un laboratoire trop complaisant ne teste que lui-meme. */
    if (to === STATEVIEW.toLowerCase()) {
      const id = data.slice(10).toLowerCase();
      const attendus = new Set(idsAttendus.map((x) => x.slice(2).toLowerCase()));
      return attendus.has(id) ? '0x' + mot(2n ** 96n) + mot(0) + mot(0) + mot(0) : '0x' + mot(0).repeat(4);
    }
    if (data.startsWith('0x95d89b41')) { vus.symbol++; return symboleAbi(symbole); }   /* symbol() */
    if (data.startsWith('0x313ce567')) return '0x' + mot(18);                          /* decimals() */
    if (data.startsWith('0x18160ddd')) return '0x' + mot(10n ** 27n);                  /* totalSupply() */
    return '0x' + mot(0);
  };
  fn.vus = vus;
  return fn;
}

/* ⛔⛔ UNE ADRESSE DE DEVISE DIFFERENTE PAR CAS, et c est le test qui me l a appris : le cache de
 *     verification du code est GLOBAL AU MODULE et porte sur l adresse. En production c est
 *     correct — le code d un contrat deploye ne change pas, et le relire a chaque cle multiplierait
 *     les appels sur un noeud qui etrangle deja. Mais ici le verdict du premier cas FUITAIT vers le
 *     suivant : mon temoin negatif passait au vert parce que l adresse avait ete declaree B20 trois
 *     lignes plus haut. Un test qui se contamine lui-meme ne prouve que son propre ordre.
 *   ⇒ Adresses de laboratoire, evidemment synthetiques : elles ne pretendent designer aucun
 *     contrat reel, et chaque cas part d un cache vierge pour SA devise. */
const deviseLabo = (k) => '0xb2000000000000000000000000000000000dea0' + String(k);
const cleAvec = (dev) => ({ currency0: dev, currency1: BLOCK, fee: 3000, tickSpacing: 60,
  hooks: '0x5926abdAbf5D0006Ee960A8270f3e124e5a764cc' });

v('⛔⛔ un marche cote en BLOCK B20 est enfin LU', async () => {
  /* ⛔⛔ LE CAS CENTRAL : avant, cette cle etait sautee et le block restait « sans marche » a vie. */
  const dev = deviseLabo(1), cl = cleAvec(dev);
  const rpc = rpcLabo({ code: '0xef', symbole: 'PAIRB', idsAttendus: [poolId(cl)] });
  const r = await vieDuBlock({ rpc, stateView: STATEVIEW, jeton: BLOCK, clesExactes: [cl] });
  assert.equal(r.etat, 'LUE',
    'un marche appaire a un block B20 reste invisible : ' + (r.pourquoi || r.etat));
  assert.equal(r.devise, 'PAIRB',
    'la devise ne porte pas le symbole LU sur la chaine : ' + r.devise);
  assert.ok(rpc.vus.symbol > 0, 'le symbole n a pas ete lu sur la chaine — il a ete devine');
});

v('⛔⛔ TEMOIN NEGATIF : un imposteur au bon prefixe, au mauvais code, est REFUSE', async () => {
  /* ⛔⛔ LE CAS QUI COMPTE. L adresse commence par `0xb2` comme les vrais — elle se choisit avec
   *     CREATE2. Seul le code `0xef` la distingue. Sans ce temoin, la garde ne prouverait rien :
   *     elle passerait aussi bien sur un `startsWith` d adresse. */
  const dev = deviseLabo(2), cl = cleAvec(dev);
  const rpc = rpcLabo({ code: '0x60806040', symbole: 'PAIRB', idsAttendus: [poolId(cl)] });
  const r = await vieDuBlock({ rpc, stateView: STATEVIEW, jeton: BLOCK, clesExactes: [cl] });
  assert.notEqual(r.etat, 'LUE',
    'un ERC-20 ordinaire a une adresse en 0xb2… est accepte comme block-devise : le marqueur est '
    + 'redevenu le prefixe, qui s usurpe');
});

v('⛔ un code vide (adresse sans contrat) est refuse', async () => {
  const dev = deviseLabo(3), cl = cleAvec(dev);
  const rpc = rpcLabo({ code: '0x', symbole: 'PAIRB', idsAttendus: [poolId(cl)] });
  const r = await vieDuBlock({ rpc, stateView: STATEVIEW, jeton: BLOCK, clesExactes: [cl] });
  assert.notEqual(r.etat, 'LUE', 'une adresse sans contrat passe pour un block-devise');
});

v('⛔ un B20 sans symbole lisible ne recoit PAS de nom invente', async () => {
  /* ⛔ Le tenter serait pire que l ignorer : un nom fabrique a l ecran est un nom qu on croit. */
  const dev = deviseLabo(4), cl = cleAvec(dev);
  const rpc = rpcLabo({ code: '0xef', symbole: '', idsAttendus: [poolId(cl)] });
  const r = await vieDuBlock({ rpc, stateView: STATEVIEW, jeton: BLOCK, clesExactes: [cl] });
  assert.notEqual(r.etat, 'LUE', 'un block-devise sans symbole lisible est quand meme nomme');
});

v('⛔ le code est relu UNE fois par adresse, pas a chaque cle', async () => {
  /* ⛔ Le code d un contrat ne change jamais : le relire a chaque cle multiplierait les appels sur
   *   un noeud qui etrangle deja. Mais on ne garde QUE les reponses — un echec mis en cache
   *   condamnerait ce block pour toute la session, et ce depot a deja paye ca une fois. */
  const dev = deviseLabo(5), cl = cleAvec(dev);
  const deux = [cl, { ...cl, fee: 10000 }];
  const rpc = rpcLabo({ code: '0xef', symbole: 'PAIRB', idsAttendus: deux.map((x) => poolId(x)) });
  await vieDuBlock({ rpc, stateView: STATEVIEW, jeton: BLOCK, clesExactes: deux });
  assert.ok(rpc.vus.getCode <= 1,
    'le code a ete relu ' + rpc.vus.getCode + ' fois pour une seule adresse');
});

for (const [nom, fn] of cas) { await fn(); n++; }
assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok paire-block-b20 — ' + n + ' cas, lecture REELLE executee : un marche cote en block');
console.log('   est lu, un imposteur au bon prefixe est refuse, et rien n est nomme sans preuve.');
console.log('⚠️ NE PROUVE PAS qu un tel marche soit echangeable dans l app : il ne le sera que si le');
console.log('   prix du block-devise a ete MESURE — sinon le frais atterrirait dans un jeton');
console.log('   invendable, et a6cf a deja paye ca (7 detentions, 0 avec un marche).');
