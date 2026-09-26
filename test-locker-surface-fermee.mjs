/* test-locker-surface-fermee.mjs — LE LOCKER N A QUE LES PORTES QU ON LUI CONNAIT.
 *
 * ⛔⛔ POURQUOI UNE GARDE SEPAREE DES TESTS FORGE. Les tests Solidity prouvent ce que le contrat
 *     FAIT sur les chemins qu on leur donne. Ils ne peuvent pas prouver qu il n existe pas un
 *     AUTRE chemin — une fonction ajoutee plus tard, un `transferFrom`, un `delegatecall`. Cette
 *     propriete-la se lit sur la SURFACE, et elle se lit ici, dans la suite qui tourne a chaque
 *     fois. Un contrat qui detient de la valeur n a pas droit a une porte oubliee.
 *
 * ⛔ CE CONTRAT DETIENT LE NFT DE POSITION. Si une seule des fonctions interdites ci-dessous
 *   existait, la liquidite des createurs pourrait sortir — et la promesse « personne ne peut
 *   retirer » deviendrait fausse SANS QUE RIEN NE LE DISE.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que le contrat deploye soit celui-ci. Ca se verifie a la
 *   verification de source sur l explorateur, apres le deploiement — pas ici.
 */
import { readFileSync, existsSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const chemin = new URL('./contracts/TBlockFeeLocker.sol', import.meta.url);
assert.ok(existsSync(chemin), 'contracts/TBlockFeeLocker.sol est introuvable');
const src = readFileSync(chemin, 'utf8');
/* ⛔ COMMENTAIRES DEPOUILLES : ce fichier cite les fonctions interdites EN CLAIR dans son en-tete,
 *   pour expliquer ce qu il ne fait pas. Les grep sur le brut accuseraient sa documentation — la
 *   faute que j ai commise deux fois le 2026-09-26. */
const brut = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');
/* ⛔⛔ ON NE LIT QUE LE CORPS DU CONTRAT, PAS LES INTERFACES. Ma premiere version scannait tout le
 *     fichier et a accuse `modifyLiquidities` — qui est une DECLARATION dans `IPositionManager`,
 *     pas une porte du locker. Une sonde qui crie sur la signature du contrat d en face desarme
 *     celle qui criera sur une vraie porte. */
const iContrat = brut.indexOf('contract TBlockFeeLocker');
assert.ok(iContrat > 0, 'le contrat TBlockFeeLocker est introuvable dans le fichier');
const nu = brut.slice(iContrat);

let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('⛔⛔ aucune porte ne peut faire sortir le principal ni le NFT', () => {
  /* Chaque entree est une facon reelle de vider la position. Une seule suffirait. */
  const interdits = [
    ['transferFrom', 'le NFT pourrait quitter le locker'],
    ['safeTransferFrom', 'le NFT pourrait quitter le locker'],
    ['setApprovalForAll', 'un tiers pourrait retirer a notre place'],
    ['.approve(', 'un tiers pourrait retirer a notre place'],
    ['delegatecall', 'du code etranger s executerait avec notre etat et nos fonds'],
    ['selfdestruct', 'le contrat pourrait disparaitre avec la position'],
    ['BURN_POSITION', 'la position pourrait etre brulee et le principal repris'],
    ['INCREASE_LIQUIDITY', 'inutile ici, et ouvre un chemin de modification du principal'],
  ];
  const trouves = interdits.filter(([mot]) => nu.includes(mot));
  assert.deepEqual(trouves.map(([m]) => m), [],
    'porte(s) interdite(s) presente(s) : ' + trouves.map(([m, p]) => m + ' (' + p + ')').join(' · '));
});

v('⛔⛔ la liquidite retiree est ecrite ZERO, en dur, une seule fois', () => {
  /* ⛔ C EST LA LIGNE QUI SEPARE « LES FRAIS SORTENT » DE « LA LIQUIDITE SORT ». Si elle devenait
   *   un parametre, l appelant choisirait combien retirer. */
  assert.ok(/abi\.encode\(tokenId, uint256\(0\), uint128\(0\), uint128\(0\), bytes\(""\)\)/.test(nu),
    'la liquidite retiree n est plus un zero litteral : l appelant pourrait choisir combien sortir');
  const zeros = (nu.match(/uint256\(0\)/g) || []).length;
  assert.equal(zeros, 1, 'il y a ' + zeros + ' litteraux `uint256(0)` : un seul est attendu, celui de la liquidite');
});

v('⛔ le calldata du PositionManager est FABRIQUE ici, jamais recu de l appelant', () => {
  /* Si une fonction publique prenait des `bytes` et les passait a `modifyLiquidities`, n importe
   * qui composerait ses propres actions — y compris un retrait. */
  const i = nu.indexOf('modifyLiquidities(');
  assert.ok(i > 0, 'l appel au PositionManager a disparu');
  assert.ok(/POSM\.modifyLiquidities\(abi\.encode\(actions, params\), block\.timestamp\)/.test(nu),
    'le calldata n est plus construit sur place a partir de `actions` et `params` locaux');
  /* ⛔ Aucune fonction externe ne doit accepter des bytes libres. */
  const externesAvecBytes = [...nu.matchAll(/function\s+(\w+)\s*\(([^)]*)\)\s*external/g)]
    .filter((m) => /\bbytes\b/.test(m[2]) && m[1] !== 'onERC721Received')
    .map((m) => m[1]);
  assert.deepEqual(externesAvecBytes, [],
    'fonction(s) externe(s) acceptant des bytes : ' + externesAvecBytes.join(', ')
    + ' — elles permettraient de composer un retrait');
});

v('⛔ rien n est modifiable apres le deploiement', () => {
  assert.ok(/address public immutable FEE_WALLET;/.test(nu),
    'le wallet de frais n est plus immuable : le flux pourrait etre reassigne — c est precisement '
    + 'ce que fait le concurrent mesure, et ce qu on refuse de pouvoir faire');
  assert.ok(/uint256 public immutable CREATOR_SHARE_PPM;/.test(nu),
    'la part du createur n est plus immuable');
  /* ⛔ PAS DE PROPRIETAIRE, DONC PAS DE POUVOIR. Un `onlyOwner` ici serait une cle de plus a garder. */
  assert.ok(!/onlyOwner|Ownable|owner\s*=/.test(nu),
    'un proprietaire est apparu : ce contrat ne doit avoir aucun pouvoir administratif');
});

v('⛔ le createur est ecrit UNE fois et jamais ecrase', () => {
  assert.ok(/if \(creatorOf\[tokenId\] != address\(0\)\) revert AlreadyKnown\(\);/.test(nu),
    'un second depot pourrait changer le destinataire des frais');
  /* ⛔ ET IL VIENT DE `from`, pas d un parametre choisi par l appelant. */
  assert.ok(/creatorOf\[tokenId\] = from;/.test(nu),
    'le createur ne vient plus de `from` : une adresse passee en donnee serait choisie par l appelant');
});

v('⛔ un echec de versement ne se tait pas', () => {
  assert.ok(/if \(!ok\) revert NativeTransferFailed\(\);/.test(nu),
    'un envoi d ETH rate passerait en silence, et l evenement annoncerait un versement qui n a pas eu lieu');
  assert.ok(/ret\.length > 0 && !abi\.decode\(ret, \(bool\)\)/.test(nu),
    'un jeton qui rend `false` serait considere comme paye');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok locker-surface-fermee — ' + n + ' cas.');
console.log('   Aucune porte de retrait, la liquidite emise est un zero litteral, le calldata est');
console.log('   fabrique sur place, et rien n est modifiable apres le deploiement.');
console.log('⚠️ NE PROUVE PAS que le contrat DEPLOYE soit celui-ci : ca se verifie par la');
console.log('   verification de source sur l explorateur, apres le geste de Phil.');
