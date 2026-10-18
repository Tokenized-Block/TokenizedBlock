/* preparer-deploiement-duels.mjs — FIGE la transaction de deploiement de BlockDuels (duels entre deux wallets sur la face d un bloc).
 *
 * ⛔ CE SCRIPT NE SIGNE RIEN ET N ENVOIE RIEN. Il ecrit `../duels-deploiement.js` ; la page `deployer-duels.html` la propose au wallet
 *   CONNECTE (celui de Phil). Ce qui est signe est ce qui a ete prouve : banc-duels-fork envoie une donnee preparee PAR CE SCRIPT telle
 *   quelle sur un fork de Base et relit tout.
 * Constructeur (usdc, devWallet, rewardPool, guardian) — duels-config.js encoderArgs :
 *   usdc = USDC_BASE et devWallet = FEE_WALLET (frais-creation.js), lus dans le depot ET verifies egaux a ceux de la fiche BlockRolls
 *   deployee (blockrolls-deploiement.js constructeur) ; rewardPool, guardian = contracts/duels-parametres.json, REMPLI PAR PHIL.
 *   Une valeur absente ou refusee -> `pret: false`, `creation: null` et la liste `manquants` / `refus` : la page garde le bouton eteint.
 * Usage (depuis contracts/) : forge build && node preparer-deploiement-duels.mjs
 *   [SORTIE=chemin pour ecrire ailleurs] [PARAMETRES=autre json] (tests et banc fork seulement) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, '..', f)).href);
const [F, K, C, BR] = await Promise.all([imp('frais-creation.js'), imp('keccak.js'), imp('duels-config.js'), imp('blockrolls-deploiement.js')]);
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const usdc = bas(F.USDC_BASE), devWallet = bas(F.FEE_WALLET);
if (!ADR.test(usdc) || !ADR.test(devWallet)) throw new Error('USDC_BASE / FEE_WALLET unreadable in the repo');
/* la meme adresse que celle que BlockRolls paie deja (fiche deployee) : deux sources du depot, une seule verite */
if (usdc !== bas(BR.BLOCKROLLS_DEPLOIEMENT.constructeur.usdc) || devWallet !== bas(BR.BLOCKROLLS_DEPLOIEMENT.constructeur.devWallet))
  throw new Error('USDC / dev wallet differ between frais-creation.js and blockrolls-deploiement.js');
const parametresChemin = process.env.PARAMETRES || path.join(ICI, 'duels-parametres.json');
/* un BOM (ecrit par certains editeurs Windows) n est pas une erreur de Phil : on l ote avant de lire (code 0xFEFF, ecrit par son numero :
 *   un caractere invisible dans la source ne se relit pas) */
const BOM = String.fromCharCode(0xfeff);
const brut = fs.existsSync(parametresChemin) ? fs.readFileSync(parametresChemin, 'utf8') : '{}';
const p = JSON.parse(brut.startsWith(BOM) ? brut.slice(1) : brut);
const constructeur = { usdc, devWallet, rewardPool: ADR.test(bas(p.rewardPool)) ? bas(p.rewardPool) : '', guardian: ADR.test(bas(p.guardian)) ? bas(p.guardian) : '' };
const manquants = ['rewardPool', 'guardian'].filter((k) => !constructeur[k]);
const refus = manquants.length ? [] : C.refusParametres(constructeur);
const pret = manquants.length === 0 && refus.length === 0;
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/BlockDuels.sol/BlockDuels.json'), 'utf8'));
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing in the forge artifact');
/* l ordre des arguments dans l ABI compilee doit etre celui de duels-config.js : sinon la donnee signee ne serait pas celle affichee */
const ctor = (art.abi.find((x) => x.type === 'constructor') || {}).inputs || [];
if (ctor.map((i) => i.type).join() !== 'address,address,address,address' || ctor.map((i) => i.name).join() !== C.ORDRE_ARGS.join()) throw new Error('constructor differs from duels-config.js: ' + ctor.map((i) => i.name).join(','));
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : (art.metadata || {});
/* ⛔ MESURE 2026-10-17 : un forge build en echec laisse dans out/ l artefact d une AUTRE source. forge NORMALISE en LF avant de hacher :
 *   on compare le keccak de la source normalisee a celui que l artefact declare. Une source modifiee sans recompiler = refus. */
const SOURCES = ['src/BlockDuels.sol'];
for (const s of SOURCES) {
  const kS = K.keccak256Hex(Buffer.from(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')));
  const kA = String(((meta.sources || {})[s] || {}).keccak256 || '').toLowerCase();
  if (kA !== kS) throw new Error('stale forge artifact for ' + s + ': compiled from ' + (kA || 'an unknown source') + ', the source is ' + kS + ' -- run forge build first, and fix what stops it');
}
const sha256Sources = Object.fromEntries(SOURCES.map((s) => [s, crypto.createHash('sha256').update(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
const args = pret ? C.encoderArgs(constructeur) : null;
const creation = pret ? code + args : null;
const sha = creation ? crypto.createHash('sha256').update(Buffer.from(creation.slice(2), 'hex')).digest('hex') : null;
const q = (v) => (v ? "'" + v + "'" : 'null');
const sortie = [
  '/* duels-deploiement.js — GENERE par contracts/preparer-deploiement-duels.mjs. NE PAS EDITER A LA MAIN.',
  ' * La transaction de deploiement NON SIGNEE de BlockDuels. Rien ici ne signe ni n envoie. usdc et devWallet viennent du depot ; rewardPool',
  ' * et guardian de contracts/duels-parametres.json (Phil). pret: false -> la page ne propose rien. */',
  'export const DUELS_DEPLOIEMENT = Object.freeze({',
  '  chaine: 8453,',
  "  contrat: 'BlockDuels',",
  "  compilateur: '" + String((meta.compiler && meta.compiler.version) || 'unknown') + "',",
  '  optimiseur: ' + JSON.stringify((meta.settings && meta.settings.optimizer) || null) + ',',
  "  evm: '" + String((meta.settings && meta.settings.evmVersion) || 'unknown') + "',",
  '  constructeur: Object.freeze(' + JSON.stringify(constructeur) + '),',
  '  ordre: ' + JSON.stringify(C.ORDRE_ARGS) + ',',
  '  pret: ' + pret + ',',
  '  manquants: ' + JSON.stringify(manquants) + ',',
  '  refus: ' + JSON.stringify(refus) + ',',
  '  octetsArgs: ' + (args ? args.length / 2 : 'null') + ',',
  '  sha256Sources: Object.freeze(' + JSON.stringify(sha256Sources) + '),',
  '  sha256Creation: ' + q(sha) + ',',
  '  octetsCreation: ' + (creation ? (creation.length - 2) / 2 : 'null') + ',',
  /* apres le deploiement reel : l adresse et le bloc, RELUS sur la chaine, ecrits ENSEMBLE (jamais l un sans l autre) */
  '  adresse: null,',
  '  bloc: null,',
  '  creation: ' + q(creation) + ',',
  '});',
  '',
].join('\n');
const dest = process.env.SORTIE || path.join(ICI, '..', 'duels-deploiement.js');
fs.writeFileSync(dest, sortie);
console.log(path.basename(dest) + ' written: pret=' + pret + (manquants.length ? ' missing=' + manquants.join(',') : '') + (refus.length ? ' refus=' + refus.join('; ') : '')
  + (creation ? ', ' + (creation.length - 2) / 2 + ' bytes, sha256 ' + sha.slice(0, 16) + '…' : ''));
