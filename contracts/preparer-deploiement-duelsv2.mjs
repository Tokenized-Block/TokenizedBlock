/* preparer-deploiement-duelsv2.mjs — FIGE la transaction de deploiement de BlockDuelsV2 (decision de Phil, 2026-10-24 : un duel rejoint et
 * non regle dans sa fenetre est gagne par defaut par le createur).
 *
 * ⛔ CE SCRIPT NE SIGNE RIEN ET N ENVOIE RIEN. Il ecrit `../duels-v2-deploiement.js` ; la page `deployer-duels-v2.html` la propose au wallet
 *   CONNECTE (celui de Phil). adresse et bloc restent null jusqu a noter-deploiement-duelsv2.mjs (apres la signature de Phil).
 * Constructeur : LES MEMES PARAMETRES QUE V1, et rien d autre. Ils sont lus a TROIS endroits du depot, qui doivent dire la meme chose :
 *   la fiche v1 deployee (duels-deploiement.js constructeur), contracts/duels-parametres.json (rewardPool, guardian : Phil, 2026-10-18) et
 *   frais-creation.js (USDC_BASE, FEE_WALLET), eux-memes egaux a la fiche BlockRolls deployee. Un ecart -> exception, rien n est ecrit.
 *   L encodage est celui de duels-config.js (meme constructeur, meme ordre ; verifie contre l ABI compilee de BlockDuelsV2).
 * Usage (depuis contracts/) : forge build && node preparer-deploiement-duelsv2.mjs
 *   [SORTIE=chemin pour ecrire ailleurs] [PARAMETRES=autre json] [FICHE_V1=autre fiche v1] (tests et banc anvil seulement) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.isAbsolute(f) ? f : path.join(ICI, '..', f)).href);
const [F, K, C, BR, V1] = await Promise.all([imp('frais-creation.js'), imp('keccak.js'), imp('duels-config.js'), imp('blockrolls-deploiement.js'), imp(process.env.FICHE_V1 || 'duels-deploiement.js')]);
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const usdc = bas(F.USDC_BASE), devWallet = bas(F.FEE_WALLET);
if (!ADR.test(usdc) || !ADR.test(devWallet)) throw new Error('USDC_BASE / FEE_WALLET unreadable in the repo');
if (usdc !== bas(BR.BLOCKROLLS_DEPLOIEMENT.constructeur.usdc) || devWallet !== bas(BR.BLOCKROLLS_DEPLOIEMENT.constructeur.devWallet))
  throw new Error('USDC / dev wallet differ between frais-creation.js and blockrolls-deploiement.js');
const v1 = V1.DUELS_DEPLOIEMENT;
if (!v1 || v1.contrat !== 'BlockDuels' || v1.chaine !== 8453 || !v1.constructeur) throw new Error('the v1 duels record is unreadable');
const parametresChemin = process.env.PARAMETRES || path.join(ICI, 'duels-parametres.json');
const BOM = String.fromCharCode(0xfeff);
const brut = fs.existsSync(parametresChemin) ? fs.readFileSync(parametresChemin, 'utf8') : '{}';
const p = JSON.parse(brut.startsWith(BOM) ? brut.slice(1) : brut);
const constructeur = { usdc, devWallet, rewardPool: ADR.test(bas(p.rewardPool)) ? bas(p.rewardPool) : '', guardian: ADR.test(bas(p.guardian)) ? bas(p.guardian) : '' };
const manquants = ['rewardPool', 'guardian'].filter((k) => !constructeur[k]);
/* les memes parametres que v1, a l octet : sinon la v2 paierait un autre pot commun / un autre dev que celui que Phil a deja signe */
if (!manquants.length) for (const k of C.ORDRE_ARGS) if (constructeur[k] !== bas(v1.constructeur[k])) throw new Error(k + ' differs from the v1 duels record (' + constructeur[k] + ' vs ' + bas(v1.constructeur[k]) + ')');
const refus = manquants.length ? [] : C.refusParametres(constructeur);
const pret = manquants.length === 0 && refus.length === 0;
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/BlockDuelsV2.sol/BlockDuelsV2.json'), 'utf8'));
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing in the forge artifact');
const ctor = (art.abi.find((x) => x.type === 'constructor') || {}).inputs || [];
if (ctor.map((i) => i.type).join() !== 'address,address,address,address' || ctor.map((i) => i.name).join() !== C.ORDRE_ARGS.join()) throw new Error('constructor differs from duels-config.js: ' + ctor.map((i) => i.name).join(','));
/* la regle v2 doit etre DANS l artefact : settleDefault(uint256) et l evenement DefaultWon (un artefact v1 renomme ne passerait pas) */
if (!art.abi.some((x) => x.type === 'function' && x.name === 'settleDefault') || !art.abi.some((x) => x.type === 'event' && x.name === 'DefaultWon')) throw new Error('the artifact has no settleDefault / DefaultWon: not BlockDuelsV2');
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : (art.metadata || {});
const SOURCES = ['src/BlockDuelsV2.sol'];
for (const s of SOURCES) {
  const kS = K.keccak256Hex(Buffer.from(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')));
  const kA = String(((meta.sources || {})[s] || {}).keccak256 || '').toLowerCase();
  if (kA !== kS) throw new Error('stale forge artifact for ' + s + ': compiled from ' + (kA || 'an unknown source') + ', the source is ' + kS + ' -- run forge build first, and fix what stops it');
}
const sha256Sources = Object.fromEntries(SOURCES.map((s) => [s, crypto.createHash('sha256').update(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
const args = pret ? C.encoderArgs(constructeur) : null;
const creation = pret ? code + args : null;
const sha = creation ? crypto.createHash('sha256').update(Buffer.from(creation.slice(2), 'hex')).digest('hex') : null;
const runtime = (String(art.deployedBytecode && art.deployedBytecode.object || '').length - 2) / 2;
const q = (v) => (v ? "'" + v + "'" : 'null');
const sortie = [
  '/* duels-v2-deploiement.js — GENERE par contracts/preparer-deploiement-duelsv2.mjs. NE PAS EDITER A LA MAIN.',
  ' * La transaction de deploiement NON SIGNEE de BlockDuelsV2. Rien ici ne signe ni n envoie. Les 4 arguments du constructeur sont CEUX de',
  ' * la fiche v1 (duels-deploiement.js), verifies egaux a contracts/duels-parametres.json et frais-creation.js. adresse / bloc : null tant',
  ' * que Phil n a pas signe ; puis ecrits ENSEMBLE par contracts/noter-deploiement-duelsv2.mjs depuis le recu. */',
  'export const DUELS_V2_DEPLOIEMENT = Object.freeze({',
  '  chaine: 8453,',
  "  contrat: 'BlockDuelsV2',",
  "  compilateur: '" + String((meta.compiler && meta.compiler.version) || 'unknown') + "',",
  '  optimiseur: ' + JSON.stringify((meta.settings && meta.settings.optimizer) || null) + ',',
  "  evm: '" + String((meta.settings && meta.settings.evmVersion) || 'unknown') + "',",
  '  constructeur: Object.freeze(' + JSON.stringify(constructeur) + '),',
  '  ordre: ' + JSON.stringify(C.ORDRE_ARGS) + ',',
  "  memesParametresQue: '" + bas(v1.adresse) + "',",
  '  pret: ' + pret + ',',
  '  manquants: ' + JSON.stringify(manquants) + ',',
  '  refus: ' + JSON.stringify(refus) + ',',
  '  octetsArgs: ' + (args ? args.length / 2 : 'null') + ',',
  '  sha256Sources: Object.freeze(' + JSON.stringify(sha256Sources) + '),',
  '  sha256Creation: ' + q(sha) + ',',
  '  octetsCreation: ' + (creation ? (creation.length - 2) / 2 : 'null') + ',',
  '  octetsRuntime: ' + runtime + ',',
  '  adresse: null,',
  '  bloc: null,',
  '  creation: ' + q(creation) + ',',
  '});',
  '',
].join('\n');
const dest = process.env.SORTIE || path.join(ICI, '..', 'duels-v2-deploiement.js');
fs.writeFileSync(dest, sortie);
console.log(path.basename(dest) + ' written: pret=' + pret + (manquants.length ? ' missing=' + manquants.join(',') : '') + (refus.length ? ' refus=' + refus.join('; ') : '')
  + (creation ? ', ' + (creation.length - 2) / 2 + ' bytes, sha256 ' + sha : ''));
