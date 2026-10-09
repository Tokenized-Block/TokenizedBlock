/* test-blockskins-deploiement-20261004.mjs — CE QUE PHIL SIGNERA pour deployer BlockSkins, et la page qui le lui propose.
 *
 * Phil : « tu deploies, je signe — apres verification que tout est 100 % ok ». Le deploiement est UNE transaction de creation ;
 * elle est figee dans blockskins-deploiement.js (generee par contracts/preparer-deploiement-blockskins.mjs) et proposee au wallet
 * connecte par deployer-blockskins.html. Le banc fork (banc-blockskins-fork-20261004.mjs) deploie cette meme donnee.
 * A. la donnee figee : son empreinte se RECALCULE ; elle finit par les deux arguments du depot (USDC, wallet des frais) ; elle porte
 *    l empreinte de la SOURCE actuelle (une source modifiee sans regenerer = rouge) ; aucune adresse deployee n est declaree.
 * B. la page : n envoie que la donnee figee, sans `to` ni valeur, apres un appui ET si l empreinte recalculee dans le navigateur
 *    est la bonne ; elle relit sur la chaine ce que le contrat dit de lui-meme ; aucune cle, aucun argument saisi.
 * C. le serveur sert la page et la donnee ; l app n y renvoie nulle part.
 * ⛔ BORNE : rien ici ne prouve un deploiement reel ni un vrai wallet. La page n a PAS ete essayee avec un wallet connecte. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href + '?v=' + Math.random());
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const lire = (f) => fs.readFileSync(path.join(ICI, f), 'utf8').replace(/\r\n/g, '\n');

const { BLOCKSKINS_DEPLOIEMENT: D } = await imp('blockskins-deploiement.js');
const { USDC_BASE, FEE_WALLET } = await imp('frais-creation.js');
console.log('— A. la donnee figee');
const octets = Buffer.from(D.creation.slice(2), 'hex');
ok(/^0x[0-9a-f]+$/.test(D.creation) && octets.length === D.octetsCreation && crypto.createHash('sha256').update(octets).digest('hex') === D.sha256Creation,
  'A l empreinte sha256 de la donnee se recalcule (' + D.sha256Creation.slice(0, 16) + '…, ' + D.octetsCreation + ' octets)');
const fin = D.creation.slice(-128);
ok('0x' + fin.slice(24, 64) === USDC_BASE.toLowerCase() && '0x' + fin.slice(88, 128) === FEE_WALLET.toLowerCase() && /^0{24}$/.test(fin.slice(0, 24)) && /^0{24}$/.test(fin.slice(64, 88)),
  'A elle finit par les deux arguments du constructeur : le USDC et le wallet des frais DU DEPOT (frais-creation.js)');
ok(D.constructeur.usdc === USDC_BASE.toLowerCase() && D.constructeur.walletDesFrais === FEE_WALLET.toLowerCase() && D.chaine === 8453, 'A ce qu elle annonce (chaine 8453, USDC, wallet des frais) est ce qu elle encode');
ok(crypto.createHash('sha256').update(lire('contracts/src/BlockSkins.sol')).digest('hex') === D.sha256Source, 'A elle a ete generee depuis la source ACTUELLE du contrat (source modifiee sans regenerer = rouge)');
/* DEPLOYE le 2026-10-04 par le proprietaire ; adresse, tx et owner donnes par SA page et RELUS sur la chaine le meme soir (input de la tx
 *   identique a la donnee figee, contrat cree a cette adresse, USDC()/FEE_WALLET()/owner() conformes). Le test epingle ce qui a ete relu. */
ok(D.adresse === '0xea6ccb19714504ae3286e82febbe627f9d0ce77d' && D.txDeploiement === '0xc6e22bfa0b6a2dd931c59709b284d58be762a2b87317941168694f93126a2c9b'
  && D.blocDeploiement === 52175537 && D.owner === '0x37eb9b7ce0b51fe12fbf092026e001918128580a' && Object.isFrozen(D),
  'A l adresse deployee, sa transaction, son bloc et son owner sont ceux relus sur la chaine ; l objet est fige');
ok(octets.length - 64 <= 49152 && octets.length > 1000, 'A le code de creation tient sous la limite EIP-3860 (49 152 octets)');

console.log('— B. la page');
const page = lire('deployer-blockskins.html');
const script = (page.match(/<script type="module">([\s\S]*?)<\/script>/) || ['', ''])[1];
const envois = script.match(/eth_sendTransaction[^\n]*/g) || [];
ok(envois.length === 1 && /params: \[\{ from: compte, data: D\.creation \}\]/.test(envois[0]) && !/\bto:/.test(envois[0]) && !/value/.test(envois[0]),
  'B UN seul envoi dans la page : la donnee figee, sans `to` (creation) ni valeur');
ok(/if \(!compte \|\| !intacte \|\| envoi\) return;/.test(script) && /\$\('#bDeployer'\)\.disabled = !compte \|\| !intacte \|\| envoi;/.test(script),
  'B rien ne part sans wallet connecte, ni si l empreinte recalculee dans le navigateur differe');
ok(/crypto\.subtle\.digest\('SHA-256', octets\)/.test(script) && /intacte = h === D\.sha256Creation && octets\.length === D\.octetsCreation && usdc === D\.constructeur\.usdc && frais === D\.constructeur\.walletDesFrais;/.test(script),
  'B l empreinte est RECALCULEE dans le navigateur, et les arguments affiches sont ceux LUS dans la donnee');
ok(/const fin = D\.creation\.slice\(-128\), usdc = '0x' \+ fin\.slice\(24, 64\), frais = '0x' \+ fin\.slice\(88, 128\);/.test(script), 'B les deux adresses affichees viennent de la FIN de la donnee signee, pas d un champ a cote');
ok(/String\(chaine\)\.toLowerCase\(\) !== CHAINE_HEX/.test(script) && /wallet_switchEthereumChain/.test(script), 'B la page exige Base avant d envoyer');
ok(/recu\.status !== '0x1' \|\| !recu\.contractAddress/.test(script) && /await lire\('USDC\(\)'\), await lire\('FEE_WALLET\(\)'\), await lire\('owner\(\)'\)/.test(script)
  && /const bon = u === usdc && f === frais && o\.toLowerCase\(\) === compte\.toLowerCase\(\);/.test(script), 'B apres confirmation, elle RELIT sur la chaine USDC(), FEE_WALLET() et owner(), et le dit si cela differe');
ok(!/private|mnemonic|seed|signTypedData|personal_sign|eth_sign\b/i.test(script) && !/<input/i.test(page), 'B aucune cle, aucune signature de message, aucun champ a saisir');
ok(/<meta name="robots" content="noindex">/.test(page) && /It cannot be changed or paused after it is deployed\./.test(page) && /A bid must raise the highest one by 5%\./.test(page),
  'B la page dit ce que le contrat fait, qu il est immuable, et la surenchere minimale de 5 %');
/* chaque chiffre de la page existe dans le contrat */
const sol = lire('contracts/src/BlockSkins.sol');
ok(/MINT_PRICE = 1_000_000;/.test(sol) && /SALE_FEE_BPS = 1000;/.test(sol) && /MAX_AUCTION = 7 days;/.test(sol) && /EXTENSION = 5 minutes;/.test(sol) && /MIN_RAISE_BPS = 500;/.test(sol),
  'B chaque chiffre annonce (1 USDC, 10 %, 7 jours, 5 minutes, 5 %) est une constante du contrat');

console.log('— C. le serveur et l app');
const srv = lire('serveur-web.js'), app = lire('app.html');
ok(/'deployer-blockskins\.html',\s+'blockskins-deploiement\.js',/.test(srv) && /'keccak\.js'/.test(srv), 'C le serveur sert la page, la donnee, et keccak.js qu elle importe');
ok(!/deployer-blockskins|blockskins-deploiement/.test(app), 'C l app ne renvoie nulle part vers cette page et ne lit pas ce contrat (il n est pas deploye)');
console.log('\n' + (n - ko) + ' ok / ' + ko + ' KO (' + n + ' assertions)');
process.exit(ko ? 1 : 0);
