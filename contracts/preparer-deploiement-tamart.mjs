/* preparer-deploiement-tamart.mjs — FIGE la transaction de deploiement de TamArt (TAM : une oeuvre mathematique par jeton, 5 USDC).
 *
 * ⛔ CE SCRIPT NE SIGNE RIEN ET N ENVOIE RIEN. Il ecrit `../tamart-deploiement.js` ; la page `deployer-tamart.html` la propose au wallet
 *   CONNECTE (celui de Phil). TamArt n a PAS d owner : le wallet qui deploie ne recoit aucun pouvoir.
 * Constructeur (usdc, beneficiaire_) — les DEUX lus dans le depot, jamais tapes :
 *   usdc = USDC_BASE (frais-creation.js) ; beneficiaire_ = FEE_WALLET (frais-creation.js). Le contrat verifie usdc.decimals() == 6.
 * Gardes : artefact forge perime (keccak de la source != celui declare par l artefact) -> refus ; ABI du constructeur differente -> refus ;
 *   une fonction de l ABI dont le nom evoque un retrait / un owner / une mise a jour -> refus (le contrat ne doit en avoir AUCUNE).
 * Usage (depuis contracts/) : forge build && node preparer-deploiement-tamart.mjs   [SORTIE=chemin pour ecrire ailleurs] */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, '..', f)).href);
const [F, K] = await Promise.all([imp('frais-creation.js'), imp('keccak.js')]);
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const constructeur = { usdc: bas(F.USDC_BASE), beneficiaire: bas(F.FEE_WALLET) };
if (!ADR.test(constructeur.usdc) || !ADR.test(constructeur.beneficiaire)) throw new Error('USDC_BASE / FEE_WALLET unreadable in the repo');
const ORDRE = ['usdc', 'beneficiaire'];
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/TamArt.sol/TamArt.json'), 'utf8'));
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing in the forge artifact');
const ctor = (art.abi.find((x) => x.type === 'constructor') || {}).inputs || [];
if (ctor.map((i) => i.type).join() !== 'address,address' || ctor.map((i) => i.name.replace(/_$/, '')).join() !== ORDRE.join()) throw new Error('constructor differs: ' + ctor.map((i) => i.name).join(','));
const interdits = art.abi.filter((x) => (x.type === 'function' && /withdraw|sweep|rescue|owner(?!Of)|upgrade|^set(?!ApprovalForAll)|pause|skim|claim/i.test(x.name)) || x.type === 'receive' || x.type === 'fallback' || x.stateMutability === 'payable');
if (interdits.length) throw new Error('TamArt must have no withdrawal/owner/payable surface, found: ' + interdits.map((x) => x.name || x.type).join(','));
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : (art.metadata || {});
const SOURCES = ['src/TamArt.sol'];
for (const s of SOURCES) {
  const kS = K.keccak256Hex(Buffer.from(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')));
  const kA = String(((meta.sources || {})[s] || {}).keccak256 || '').toLowerCase();
  if (kA !== kS) throw new Error('stale forge artifact for ' + s + ': compiled from ' + (kA || 'an unknown source') + ', the source is ' + kS + ' -- run forge build first');
}
const sha256Sources = Object.fromEntries(SOURCES.map((s) => [s, crypto.createHash('sha256').update(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
const args = ORDRE.map((k) => constructeur[k].slice(2).padStart(64, '0')).join('');
const creation = code + args;
const sha = crypto.createHash('sha256').update(Buffer.from(creation.slice(2), 'hex')).digest('hex');
/* 2026-11-01 : le gabarit vit dans fiche-tamart.mjs — noter-deploiement-tamart.mjs ecrit adresse + bloc avec CE MEME ecrivain */
const { texteFicheTamart } = await import(pathToFileURL(path.join(ICI, 'fiche-tamart.mjs')).href);
const sortie = texteFicheTamart({
  compilateur: String((meta.compiler && meta.compiler.version) || 'unknown'),
  optimiseur: (meta.settings && meta.settings.optimizer) || null,
  evm: String((meta.settings && meta.settings.evmVersion) || 'unknown'),
  constructeur, ordre: ORDRE, prix: 5000000, pret: true, octetsArgs: args.length / 2, sha256Sources,
  sha256Creation: sha, octetsCreation: (creation.length - 2) / 2, adresse: null, bloc: null, creation,
});
const dest = process.env.SORTIE || path.join(ICI, '..', 'tamart-deploiement.js');
fs.writeFileSync(dest, sortie);
console.log(path.basename(dest) + ' written: ' + (creation.length - 2) / 2 + ' bytes, sha256 ' + sha.slice(0, 16) + '…');
