/* permissions-des-hooks.mjs — CE QU UN HOOK PEUT FAIRE EST GRAVE DANS SON ADRESSE.
 * ================================================================================================
 *   node permissions-des-hooks.mjs
 *
 * ⛔⛔ POURQUOI CE FICHIER EXISTE (2026-09-22). Une pool s est ouverte sur notre hook V8 et le
 *     wallet de frais n a rien recu. La question « pourquoi » se posait sans reponse : la source
 *     des hooks n est PAS dans ce depot, et l ABI ne dit rien des points d entree reellement
 *     actives.
 *     ⇒ Uniswap v4 grave les permissions d un hook dans les 14 BITS DE POIDS FAIBLE DE SON ADRESSE.
 *       C est la raison pour laquelle ces adresses sont minees. Le protocole n appelle un hook que
 *       sur les points dont le bit est a 1 — donc l adresse SEULE dit ce que le contrat peut faire,
 *       sans source, sans ABI, sans confiance.
 *
 * ⛔ ET CE QUE CA A REVELE : AUCUN de nos hooks V5 a V8 ne porte `beforeInitialize` ni
 *    `afterInitialize`. Le hook n est donc JAMAIS appele quand une pool s ouvre. Il ne peut pas
 *    prelever le frais d ouverture — ce n est pas un reglage manquant, c est une impossibilite
 *    structurelle. Les 0,001 ETH sont payes par l APPLICATION, et rien on-chain ne les exige.
 *    ⇒ Qui ouvre une pool sur notre hook sans passer par notre ecran paie ZERO, et le contrat ne
 *      peut pas s y opposer. C est arrive le 2026-09-22 sur V8, mesure.
 *
 * ⛔ CE QUE CET INSTRUMENT NE DIT PAS : ce que le hook FAIT sur les points qu il active. Les bits
 *    disent « il est appele ici », jamais « il prend tant ». Un hook peut porter `beforeSwap` et ne
 *    rien prelever. Pour le montant il faut lire le contrat ou mesurer des swaps reels.
 * ⛔ LECTURE SEULE. Et ici meme le reseau est optionnel : les bits se lisent hors ligne.
 */
import { HOOKS } from './veille-frais.js';

/** Les 14 drapeaux, du bit 13 (poids fort du champ) au bit 0. ⛔ L ORDRE EST CELUI DU PROTOCOLE :
 *  se tromper d ordre donnerait un verdict inverse et parfaitement credible. */
const DRAPEAUX = [
  'beforeInitialize', 'afterInitialize',
  'beforeAddLiquidity', 'afterAddLiquidity',
  'beforeRemoveLiquidity', 'afterRemoveLiquidity',
  'beforeSwap', 'afterSwap',
  'beforeDonate', 'afterDonate',
  'beforeSwapReturnDelta', 'afterSwapReturnDelta',
  'afterAddLiquidityReturnDelta', 'afterRemoveLiquidityReturnDelta',
];

export function permissionsDe(adresse) {
  const a = String(adresse || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) return null;
  const bits = BigInt(a) & 0x3fffn;
  const actifs = DRAPEAUX.filter((_, i) => (bits >> BigInt(13 - i)) & 1n);
  return { bits, binaire: bits.toString(2).padStart(14, '0'), actifs };
}

/* ══ LE TEMOIN PASSE AVANT LES CIBLES ════════════════════════════════════════════════════════
 * ⛔ Un decodeur de bits est exactement le genre de code qui peut etre faux ET credible : il rend
 *    toujours une liste plausible. On lui donne donc des valeurs dont la reponse est connue AVANT
 *    de lire nos hooks — sinon on lirait un verdict inverse sans jamais s en apercevoir. */
{
  const zero = permissionsDe('0x' + '0'.repeat(40));
  const tous = permissionsDe('0x' + '0'.repeat(37) + 'fff');
  if (zero.actifs.length !== 0) { console.log('⛔ TEMOIN : une adresse a bits nuls rend des permissions. Decodeur faux.'); process.exit(1); }
  if (!tous.actifs.includes('afterSwapReturnDelta')) { console.log('⛔ TEMOIN : bits hauts non decodes. Decodeur faux.'); process.exit(1); }
  /* ⛔ ET LE TEMOIN QUI COMPTE VRAIMENT : un bit CONNU, isole. `beforeInitialize` est le bit 13 —
   *    une adresse qui ne porte que lui doit rendre exactement lui, et rien d autre. */
  const seulInit = permissionsDe('0x' + '0'.repeat(36) + '2000');
  if (seulInit.actifs.length !== 1 || seulInit.actifs[0] !== 'beforeInitialize') {
    console.log('⛔ TEMOIN : le bit 13 ne decode pas en `beforeInitialize` (rendu : '
      + seulInit.actifs.join(',') + '). L ORDRE DES DRAPEAUX EST FAUX — tout verdict serait inverse.');
    process.exit(1);
  }
  console.log('temoins du decodeur : ✅ bits nuls, bits hauts et bit 13 isole decodent juste\n');
}

const INIT = ['beforeInitialize', 'afterInitialize'];
const SWAP = ['beforeSwap', 'afterSwap'];
let sansInit = 0, total = 0;
console.log('hook  adresse       bits           points d entree actives');
for (const [nom, adresse] of Object.entries(HOOKS)) {
  const p = permissionsDe(adresse);
  total++;
  const aInit = p.actifs.some((x) => INIT.includes(x));
  if (!aInit) sansInit++;
  console.log('  ' + nom.padEnd(4) + String(adresse).slice(0, 10) + '… ' + p.binaire + '  '
    + (p.actifs.join(' · ') || 'AUCUNE'));
}
console.log('\n=== CE QUE CA VEUT DIRE POUR L ARGENT ===');
console.log('  hooks SANS point d entree a l initialisation : ' + sansInit + ' / ' + total);
if (sansInit === total) {
  console.log('  ⛔⛔ AUCUN de nos hooks n est appele quand une pool s OUVRE : le frais d ouverture');
  console.log('      ne PEUT PAS etre preleve par le contrat. Impossibilite structurelle.');
} else if (sansInit === 0) {
  console.log('  ⇒ TOUS nos hooks sont appeles a l ouverture. Le point d entree EXISTE.');
  console.log('  ⛔⛔ ET POURTANT LE FRAIS N ARRIVE PAS. Mesure du 2026-09-22 : une pool ouverte sur');
  console.log('      V8 au bloc 51653364, et sur ~250 blocs autour, le wallet de frais a recu');
  console.log('      50 000 000 000 wei — soit 0,00000005 ETH, VINGT MILLE FOIS moins que les');
  console.log('      0,001 ETH attendus.');
  console.log('      ⇒ `beforeInitialize` sert donc a ADMETTRE OU REFUSER la paire (`PaireNonAdmise`),');
  console.log('        pas a encaisser. Le frais d ouverture reste paye par l ECRAN, et il est donc');
  console.log('        CONTOURNABLE — qui ouvre une pool sans passer par notre app paie zero.');
  console.log('      ⚠️ MAIS CE N EST PLUS UNE FATALITE : le point d entree est la, inutilise pour');
  console.log('         l argent. Le rendre payant est un changement de CONTRAT, donc une decision');
  console.log('         et une signature de Phil — pas un reglage.');
}
/* ⛔⛔ CE BLOC A DIT L INVERSE PENDANT DIX MINUTES, LE 2026-09-22, ET C EST LA RAISON DES TEMOINS
 *     EN HAUT DE CE FICHIER. Un premier decodage jetable avait la liste des drapeaux DANS L ORDRE
 *     INVERSE : il rendait « aucun hook n a beforeInitialize », ce qui est parfaitement credible et
 *     entierement faux. Un decodeur de bits rend TOUJOURS une liste plausible — c est ce qui le
 *     rend dangereux. Seul le temoin « bit 13 isole doit rendre exactement beforeInitialize » l a
 *     attrape, et il n existait pas dans le script jetable. */
const avecSwap = Object.values(HOOKS).filter((a) => permissionsDe(a).actifs.some((x) => SWAP.includes(x))).length;
console.log('  hooks appeles sur les SWAPS : ' + avecSwap + ' / ' + total
  + (avecSwap ? '  ⇒ le revenu enforce passe par les echanges, pas par l ouverture.' : ''));
console.log('\n=== LA BORNE ===');
console.log('  · les bits disent « le hook est appele ici », JAMAIS « il prend tant ». Un hook peut');
console.log('    porter `beforeSwap` et ne rien prelever. Le montant se lit dans le contrat ou se');
console.log('    mesure sur des swaps reels — pas ici.');
console.log('  · ils ne disent rien non plus de ce que l application fait : un frais paye par l ecran');
console.log('    est reel, il est simplement CONTOURNABLE.');
