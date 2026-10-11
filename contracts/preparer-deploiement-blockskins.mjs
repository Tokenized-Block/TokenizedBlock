/* preparer-deploiement-blockskins.mjs — FIGE la transaction de deploiement de BlockSkins : bytecode compile + arguments du constructeur.
 *
 * ⛔ CE SCRIPT NE SIGNE RIEN ET N ENVOIE RIEN. Il ecrit `../blockskins-deploiement.js` : la donnee de creation (hex), son empreinte
 *   sha256, et ce qu elle encode. La page `deployer-blockskins.html` la propose au wallet CONNECTE (celui de Phil) ; le banc
 *   `banc-blockskins-fork-20261004.mjs` deploie CETTE donnee, octet pour octet — ce qui est signe est ce qui a ete prouve.
 * Les deux arguments du constructeur viennent de frais-creation.js (USDC_BASE, FEE_WALLET) : jamais recopies a la main.
 * Usage (depuis contracts/) : forge build && node preparer-deploiement-blockskins.mjs
 *
 * v2 (2026-10-11, Phil : « v2 avant tout mint ») : la source v2 ne change que tokenURI (l image du skin, peinte par le contrat ; JSON en
 *   base64). v1 reste ecrit dans `precedent` (deploye, JAMAIS minte : totalSupply 0 relu au bloc 52 468 899). Tant que v2 n est pas
 *   deploye ET relu, `adresse` vaut null : l app lit v1 (0 skin) et garde le mint FERME (blockskins.js, SKIN_MINT_OUVERT). */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const F = await import(pathToFileURL(path.join(ICI, '../frais-creation.js')).href);
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/BlockSkins.sol/BlockSkins.json'), 'utf8'));
const usdc = String(F.USDC_BASE).toLowerCase(), frais = String(F.FEE_WALLET).toLowerCase();
const ADR = /^0x[0-9a-f]{40}$/;
if (!ADR.test(usdc) || !ADR.test(frais)) throw new Error('USDC_BASE / FEE_WALLET unreadable in frais-creation.js');
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing or unlinked in the forge artifact');
const mot = (a) => a.slice(2).padStart(64, '0');
const creation = code + mot(usdc) + mot(frais);
const sha = (hex) => crypto.createHash('sha256').update(Buffer.from(hex.slice(2), 'hex')).digest('hex');
/* ⛔ v1 — DEPLOYE LE 2026-10-04 par le proprietaire (sa signature, depuis deployer-blockskins.html, hors wallet des frais).
 *   Les quatre valeurs viennent de SA page de deploiement et ont ete RELUES sur la chaine le meme soir (verif-blockskins-deploye.mjs) :
 *   l input de la transaction est identique, octet pour octet, a la donnee de creation v1 ; le recu cree CETTE adresse ;
 *   USDC(), FEE_WALLET() et owner() rendent les valeurs attendues ; 15 008 octets de code. Ne jamais les modifier a la main. */
const PRECEDENT = Object.freeze({
  version: 1,
  adresse: '0xea6ccb19714504ae3286e82febbe627f9d0ce77d',
  tx: '0xc6e22bfa0b6a2dd931c59709b284d58be762a2b87317941168694f93126a2c9b',
  bloc: 52175537,
  owner: '0x37eb9b7ce0b51fe12fbf092026e001918128580a',
});
/* ⛔ v2 — PAS ENCORE DEPLOYE. Se remplit SEULEMENT apres la page de Phil ET une relecture sur la chaine (input de la tx = `creation`
 *   octet pour octet, contrat cree a l adresse du recu, USDC()/FEE_WALLET()/owner() conformes, tokenURI d un mint sur fork). Jamais avant. */
const DEPLOYE = null;
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : (art.metadata || {});
const source = fs.readFileSync(path.join(ICI, 'src/BlockSkins.sol'), 'utf8').replace(/\r\n/g, '\n');
/* l image dans le wallet est une propriete de la SOURCE : son tokenURI porte un champ "image" (prouve par la suite forge et par fetch()
 *   sur le banc fork) - derivee ici de la source, jamais posee a la main */
const imageDansLeWallet = source.includes('"image":"data:image/svg+xml;base64,') && source.includes('"data:application/json;base64,"');
const q = (v) => (v === null ? 'null' : "'" + v + "'");
const lignes = [
  '/* blockskins-deploiement.js — GENERE par contracts/preparer-deploiement-blockskins.mjs. NE PAS EDITER A LA MAIN.',
  ' * La transaction de deploiement NON SIGNEE du contrat BlockSkins (contracts/src/BlockSkins.sol). Rien ici ne signe ni n envoie.',
  DEPLOYE
    ? ' * ⛔ v2 DEPLOYE (bloc ' + DEPLOYE.bloc + ') : `adresse` ci-dessous, relue sur la chaine. v1 dans `precedent`. */'
    : ' * ⛔ v2 PAS ENCORE DEPLOYE : `adresse` null, l app lit v1 (`precedent`, jamais minte) et garde le mint ferme. */',
  'export const BLOCKSKINS_DEPLOIEMENT = Object.freeze({',
  '  chaine: 8453,',
  "  contrat: 'BlockSkins',",
  '  version: 2,',
  "  compilateur: '" + String((meta.compiler && meta.compiler.version) || 'unknown') + "',",
  '  optimiseur: ' + JSON.stringify((meta.settings && meta.settings.optimizer) || null) + ',',
  "  evm: '" + String((meta.settings && meta.settings.evmVersion) || 'unknown') + "',",
  "  constructeur: Object.freeze({ usdc: '" + usdc + "', walletDesFrais: '" + frais + "' }),",
  "  sha256Source: '" + crypto.createHash('sha256').update(source).digest('hex') + "',",
  "  sha256Creation: '" + sha(creation) + "',",
  '  octetsCreation: ' + (creation.length - 2) / 2 + ',',
  '  imageDansLeWallet: ' + imageDansLeWallet + ',',
  '  adresse: ' + q(DEPLOYE ? DEPLOYE.adresse : null) + ',',
  '  txDeploiement: ' + q(DEPLOYE ? DEPLOYE.tx : null) + ',',
  '  blocDeploiement: ' + (DEPLOYE ? DEPLOYE.bloc : 'null') + ',',
  '  owner: ' + q(DEPLOYE ? DEPLOYE.owner : null) + ',',
  "  precedent: Object.freeze({ version: 1, adresse: '" + PRECEDENT.adresse + "', txDeploiement: '" + PRECEDENT.tx + "', blocDeploiement: " + PRECEDENT.bloc + ", owner: '" + PRECEDENT.owner + "' }),",
  "  creation: '" + creation + "',",
  '});',
  '',
];
fs.writeFileSync(path.join(ICI, '../blockskins-deploiement.js'), lignes.join('\n'));
console.log('ecrit ../blockskins-deploiement.js — v2, ' + (creation.length - 2) / 2 + ' octets, sha256 ' + sha(creation) + ', imageDansLeWallet ' + imageDansLeWallet + ', adresse ' + (DEPLOYE ? DEPLOYE.adresse : 'null (pas deploye)'));
