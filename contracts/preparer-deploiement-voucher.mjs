/* preparer-deploiement-voucher.mjs — FIGE le code de creation de BlockSkinsVoucher (skins achetes sur Shopify, reclames avec un bon).
 *
 * ⛔ CE SCRIPT NE SIGNE RIEN ET N ENVOIE RIEN. Il ecrit `../voucher-deploiement.js` ; la page `deployer-voucher.html` y ajoute l adresse
 *   du SIGNATAIRE que Phil colle, puis la propose au wallet CONNECTE (celui de Phil), qui devient owner.
 * Constructeur `constructor(address signer_)` (lu dans src/BlockSkinsVoucher.sol) : le seul argument est COLLE dans la page, jamais ici.
 * Gardes : artefact forge perime (keccak de la source != celui de l artefact) -> refus ; constructeur different -> refus ; une fonction qui
 *   ecrit hors de la liste attendue, un payable, receive ou fallback -> refus ; des immutables -> refus (le code deploye doit egaler le
 *   runtime compile, octet pour octet : la page le verifie par keccakRuntime).
 * Usage (depuis contracts/) : forge build --contracts src/BlockSkinsVoucher.sol && node preparer-deploiement-voucher.mjs  [SORTIE=chemin] */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const K = await import(pathToFileURL(path.join(ICI, '..', 'keccak.js')).href);
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/BlockSkinsVoucher.sol/BlockSkinsVoucher.json'), 'utf8'));
const code = String(art.bytecode.object).toLowerCase();
const runtime = String(art.deployedBytecode.object).toLowerCase();
if (!/^0x[0-9a-f]+$/.test(code) || !/^0x[0-9a-f]+$/.test(runtime)) throw new Error('bytecode missing in the forge artifact');
const ctor = (art.abi.find((x) => x.type === 'constructor') || {}).inputs || [];
if (ctor.map((i) => i.type + ' ' + i.name).join() !== 'address signer_') throw new Error('constructor differs: ' + ctor.map((i) => i.type + ' ' + i.name).join(','));
const ECRIT = ['acceptOwnership', 'approve', 'cancelOrder', 'claim', 'safeTransferFrom', 'setApprovalForAll', 'setSigner', 'transferFrom', 'transferOwnership'];
const ecrit = art.abi.filter((x) => x.type === 'function' && !['view', 'pure'].includes(x.stateMutability)).map((x) => x.name);
const hors = ecrit.filter((x) => !ECRIT.includes(x));
const payant = art.abi.filter((x) => x.type === 'receive' || x.type === 'fallback' || x.stateMutability === 'payable');
if (hors.length || payant.length) throw new Error('unexpected surface: ' + hors.concat(payant.map((x) => x.name || x.type)).join(','));
const imm = art.deployedBytecode.immutableReferences;
if (imm && Object.keys(imm).length) throw new Error('immutables present: the deployed code would not equal the compiled runtime');
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : (art.metadata || {});
const SOURCES = ['src/BlockSkinsVoucher.sol'];
for (const s of SOURCES) {
  const kS = K.keccak256Hex(Buffer.from(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')));
  const kA = String(((meta.sources || {})[s] || {}).keccak256 || '').toLowerCase();
  if (kA !== kS) throw new Error('stale forge artifact for ' + s + ': compiled from ' + (kA || 'an unknown source') + ', the source is ' + kS + ' -- run forge build first');
}
const sha256Sources = Object.fromEntries(SOURCES.map((s) => [s, crypto.createHash('sha256').update(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
const sha256Code = crypto.createHash('sha256').update(Buffer.from(code.slice(2), 'hex')).digest('hex');
const keccakRuntime = K.keccak256Hex(Buffer.from(runtime.slice(2), 'hex'));
const S = (x) => "'" + String(x) + "'";
const texte = [
  '/* voucher-deploiement.js — GENERE par contracts/preparer-deploiement-voucher.mjs. NE PAS EDITER A LA MAIN.',
  ' * Le code de creation NON SIGNE de BlockSkinsVoucher, SANS son argument : la page deployer-voucher.html y ajoute abi.encode(signer)',
  ' * (l adresse collee par Phil, voucher-config.js creationAvec). keccakRuntime = keccak du runtime compile (aucun immutable : le code',
  ' * deploye doit lui etre egal). Le wallet qui deploie devient owner. Rien ici ne signe ni n envoie. */',
  'export const VOUCHER_DEPLOIEMENT = Object.freeze({',
  '  chaine: 8453,',
  "  contrat: 'BlockSkinsVoucher',",
  '  compilateur: ' + S((meta.compiler && meta.compiler.version) || 'unknown') + ',',
  '  optimiseur: ' + JSON.stringify((meta.settings && meta.settings.optimizer) || null) + ',',
  '  evm: ' + S((meta.settings && meta.settings.evmVersion) || 'unknown') + ',',
  '  ordre: ["signer"],',
  '  sha256Sources: Object.freeze(' + JSON.stringify(sha256Sources) + '),',
  '  sha256Code: ' + S(sha256Code) + ',',
  '  octetsCode: ' + (code.length - 2) / 2 + ',',
  '  keccakRuntime: ' + S(keccakRuntime) + ',',
  '  octetsRuntime: ' + (runtime.length - 2) / 2 + ',',
  '  adresse: null,',
  '  bloc: null,',
  '  code: ' + S(code) + ',',
  '});',
  '',
].join('\n');
const dest = process.env.SORTIE || path.join(ICI, '..', 'voucher-deploiement.js');
fs.writeFileSync(dest, texte);
console.log(path.basename(dest) + ' written: ' + (code.length - 2) / 2 + ' bytes of creation code, sha256 ' + sha256Code.slice(0, 16) + '…, runtime keccak ' + keccakRuntime.slice(0, 18) + '…');
