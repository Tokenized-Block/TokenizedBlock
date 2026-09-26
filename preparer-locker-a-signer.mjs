/* preparer-locker-a-signer.mjs — FABRIQUE LA TRANSACTION DE DEPLOIEMENT DU LOCKER, A SIGNER.
 *
 * ⛔⛔ CE SCRIPT NE SIGNE RIEN ET N ENVOIE RIEN. Il ecrit un fichier `A-SIGNER-*.json`, comme les
 *     autres de ce depot. Le geste appartient a Phil.
 *
 * ⛔ POURQUOI IL EXISTE. Phil, 2026-09-26 : « j attends toujours que les fees arrivent sur le bon
 *   wallet ». Le locker etait ecrit, compile et prouve — mais je ne lui avais pas prepare la
 *   transaction. Un contrat qu on ne peut pas deployer ne rapporte rien.
 *
 * ⛔ LE BYTECODE EST LU DANS L ARTEFACT DE COMPILATION, jamais recopie a la main. Une seule
 *   difference d octet et le contrat deploye ne serait pas celui qu on a teste.
 *
 * ⚠️ DEPLOYER NE FAIT PAS ARRIVER L ARGENT. Il faut ENSUITE, et c est dit dans le fichier produit :
 *   1. que les nouvelles positions soient frappees VERS CE CONTRAT au lieu de `0x…dEaD` ;
 *   2. que `FEE_POOL` cesse d etre 0 — un frais de pool ne devient honnete QUE parce que ce
 *      contrat rend la collecte possible ;
 *   3. que la regle publiee soit reecrite en clair.
 *   Les positions DEJA brulees restent perdues : rien ne les recupere.
 *
 * Usage : node preparer-locker-a-signer.mjs [partCreateurPpm]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));

/* ⛔ ADRESSES COPIEES, JAMAIS RECONSTRUITES :
 *   · POSM Base : de `V4_ADRESSES[8453].posm` dans `lancer-pool.js` ;
 *   · a6cf : le wallet de frais du projet, donne par Phil et confirme on-chain par `feeWallet()`
 *     sur les hooks V6, V7 et V8 le 2026-09-26. */
const { V4_ADRESSES } = await import('./lancer-pool.js');
const POSM = V4_ADRESSES[8453].posm;
const FEE_WALLET = '0xa6cF99D35949c6cB911adB910078F4Ca46F0f5d4';

/* ⛔ LA PART DU CREATEUR EST LE SEUL CHIFFRE QUE JE NE TRANCHE PAS. Defaut a 200000 ppm = 20 %,
 *   parce que c est ce que `dime()` rend DEJA sur nos hooks V6/V7/V8 (lu on-chain le 2026-09-26) :
 *   le moins surprenant, pas le plus flatteur. Le concurrent mesure donne 70 % au createur.
 *   Ce nombre se change en argument, et il est IMMUABLE une fois deploye. */
const PPM = 1_000_000;
const partCreateur = Number(process.argv[2] || 200000);
if (!Number.isInteger(partCreateur) || partCreateur < 0 || partCreateur > PPM) {
  console.error('⛔ part createur invalide : un entier entre 0 et ' + PPM + ' (millioniemes).');
  process.exit(1);
}

const ART = join(ici, '..', '..', '..', 'artefact-inexistant');
/* Le chemin de l artefact est passe en variable : il vit dans le scratchpad de compilation. */
const chemin = process.env.TB_ARTEFACT
  || 'D:/tmp/claude/D--Users-VolKov-veilleIA-mainstreet/d388ad1a-97f0-4e21-81b2-167d59287c84/scratchpad/locker/out/TBlockFeeLocker.sol/TBlockFeeLocker.json';
let artefact;
try { artefact = JSON.parse(readFileSync(chemin, 'utf8')); }
catch (e) {
  console.error('⛔ artefact de compilation introuvable : ' + chemin);
  console.error('  Recompiler avec forge, puis relancer. On ne fabrique pas un bytecode a la main.');
  process.exit(1);
}
const bytecode = String(artefact.bytecode && (artefact.bytecode.object || artefact.bytecode) || '');
if (!/^0x[0-9a-fA-F]+$/.test(bytecode) || bytecode.length < 200) {
  console.error('⛔ bytecode absent ou trop court dans l artefact.');
  process.exit(1);
}

/* ⛔ VERIFICATION DE SURFACE SUR L ABI COMPILEE, pas sur le source. C est la preuve la plus forte :
 *   ce qui n est pas dans l ABI n est pas appelable. */
const fonctions = (artefact.abi || []).filter((x) => x.type === 'function').map((x) => x.name).sort();
const ATTENDUES = ['CREATOR_SHARE_PPM', 'FEE_WALLET', 'POSM', 'collect', 'creatorOf', 'onERC721Received'].sort();
if (JSON.stringify(fonctions) !== JSON.stringify(ATTENDUES)) {
  console.error('⛔ LA SURFACE COMPILEE A CHANGE — on ne prepare pas une signature dessus.');
  console.error('  attendue : ' + ATTENDUES.join(', '));
  console.error('  trouvee  : ' + fonctions.join(', '));
  process.exit(1);
}

const mot = (v) => BigInt(v).toString(16).padStart(64, '0');
const motAdr = (a) => String(a).replace(/^0x/, '').toLowerCase().padStart(64, '0');
const args = motAdr(POSM) + motAdr(FEE_WALLET) + mot(partCreateur);
const data = bytecode + args;

const sortie = {
  reseau: 'Base mainnet',
  chainId: 8453,
  to: null,
  value: '0x0',
  data,
  quoi: 'Deploiement de TBlockFeeLocker — la liquidite reste enfermee, les frais deviennent collectables',
  constructeur: {
    posm: POSM,
    feeWallet: FEE_WALLET,
    creatorSharePpm: partCreateur,
    partCreateurPourCent: (partCreateur / PPM * 100).toFixed(1) + ' %',
    partWalletPourCent: ((PPM - partCreateur) / PPM * 100).toFixed(1) + ' %',
  },
  surfaceCompilee: fonctions,
  octetsDeCreation: (data.length - 2) / 2,
  preuves: {
    compilation: 'solc 0.8.26, optimizer 200 — compilation propre',
    testsForge: '8 tests verts, ROUGE prouve par 4 mutations (liquidite 0 -> 1, TAKE_PAIR detourne, depot etranger, partage inverse)',
    surface: 'test-locker-surface-fermee.mjs, 6 cas, ROUGE prouve par 4 mutations',
    abi: 'aucune fonction de retrait, de transfert, d approbation ni d administration dans l ABI compilee',
  },
  aFaireAPRES_sinon_rien_narrive: [
    '1. frapper les NOUVELLES positions vers ce contrat au lieu de 0x…dEaD (PROPRIETAIRE_PERMANENT dans lancer-pool.js)',
    '2. cesser de mettre FEE_POOL a 0 — un frais de pool ne devient honnete QUE parce que ce contrat rend la collecte possible',
    '3. reecrire la regle publiee : « personne ne peut retirer la liquidite ; les frais vont a des adresses fixees d avance »',
    '4. verifier la source sur l explorateur : rien ici ne prouve que le contrat deploye soit celui-ci',
  ],
  bornes: [
    'DEPLOYER NE FAIT PAS ARRIVER L ARGENT : sans les etapes ci-dessus, ce contrat ne recoit aucune position.',
    'Les positions DEJA brulees a 0x…dEaD restent perdues — rien ne les recupere.',
    'La part du createur est IMMUABLE une fois deployee : la changer demandera un nouveau contrat.',
    'Ce contrat DETIENT de la valeur. C est une classe de risque que ce projet n a jamais portee — relire avant de signer.',
  ],
  prepareLe: '2026-09-26',
};

const fichier = join(ici, 'A-SIGNER-locker-frais.json');
writeFileSync(fichier, JSON.stringify(sortie, null, 2) + '\n');
console.log('ecrit : ' + fichier);
console.log('  octets de creation : ' + sortie.octetsDeCreation);
console.log('  part createur      : ' + sortie.constructeur.partCreateurPourCent
  + '  ·  part a6cf : ' + sortie.constructeur.partWalletPourCent);
console.log('  surface compilee   : ' + fonctions.join(', '));
console.log('\n⛔ RIEN N EST SIGNE NI ENVOYE. Et deployer ne fait pas arriver l argent : voir');
console.log('   `aFaireAPRES_sinon_rien_narrive` dans le fichier.');
