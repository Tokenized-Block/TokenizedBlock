/* preparer-deploiement-slots.mjs — FIGE la transaction de deploiement de BlockSlots (la machine a sous a trois faces de bloc).
 *
 * ⛔ CE SCRIPT NE SIGNE RIEN ET N ENVOIE RIEN. Il ecrit `../slots-deploiement.js` ; la page `deployer-slots.html` la propose au wallet
 *   CONNECTE (celui du proprietaire). Le constructeur prend UN struct Config (20 mots statiques, encodes a plat par slots-config.js) :
 *   usdc = USDC_BASE et devWallet = FEE_WALLET (frais-creation.js) ; spinPrice, potShareBps, prizes = contracts/slots-parametres.json.
 *   RIEN n est tape a la main ici. Le preparateur REFUSE une table que le constructeur refuserait (slots-plan.js refusTable : croissante,
 *   <= 1000 USDC, esperance EXACTE strictement sous la part du pot) — la meme regle des deux cotes, verifiee par test-slots-ev.
 * Usage (depuis contracts/) : forge build && node preparer-deploiement-slots.mjs      [SORTIE=chemin (tests)] [PARAMETRES=chemin (tests)] */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, '..', f)).href);
const [F, S, K, C] = await Promise.all([imp('frais-creation.js'), imp('slots-plan.js'), imp('keccak.js'), imp('slots-config.js')]);
const bas = (x) => String(x || '').toLowerCase();
const parametresChemin = process.env.PARAMETRES || path.join(ICI, 'slots-parametres.json');
const P = JSON.parse(fs.readFileSync(parametresChemin, 'utf8'));
const config = {
  usdc: bas(F.USDC_BASE),
  devWallet: bas(F.FEE_WALLET),
  spinPrice: BigInt(P.spinPrice).toString(),
  potShareBps: Number(P.potShareBps),
  prizes: (P.prizes || []).map((x) => BigInt(x).toString()),
};
for (const k of ['usdc', 'devWallet']) if (!/^0x[0-9a-f]{40}$/.test(config[k])) throw new Error(k + ' unreadable in the repo');
const refus = S.refusTable({ table: config.prizes, spinPrice: config.spinPrice, potShareBps: config.potShareBps });
if (refus.length) throw new Error('slots-parametres.json refused: ' + refus.join('; '));
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/BlockSlots.sol/BlockSlots.json'), 'utf8'));
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing in the forge artifact');
const ctor = (art.abi.find((x) => x.type === 'constructor') || {}).inputs || [];
const ordreAbi = ctor.length === 1 && ctor[0].type === 'tuple' ? ctor[0].components.map((c) => c.name) : [];
if (JSON.stringify(ordreAbi) !== JSON.stringify(C.ORDRE_CONFIG)) throw new Error('Config field order differs from the compiled ABI: ' + ordreAbi.join(','));
const typesAbi = ctor.length === 1 ? ctor[0].components.map((c) => c.type).join(',') : '';
if (typesAbi !== 'address,address,uint256,uint16,uint64[16]') throw new Error('Config field types differ from slots-config.js: ' + typesAbi);
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : (art.metadata || {});
/* ⛔ un forge build en echec laisse dans out/ l artefact d une AUTRE source : keccak de la source normalisee LF = celui de l artefact */
const SOURCES = ['src/BlockSlots.sol'];
for (const s of SOURCES) {
  const kS = K.keccak256Hex(Buffer.from(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')));
  const kA = String(((meta.sources || {})[s] || {}).keccak256 || '').toLowerCase();
  if (kA !== kS) throw new Error('stale forge artifact for ' + s + ': compiled from ' + (kA || 'an unknown source') + ', the source is ' + kS + ' -- run forge build first');
}
const sha256Sources = Object.fromEntries(SOURCES.map((s) => [s, crypto.createHash('sha256').update(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
const args = C.encoderConfig(config);
const creation = code + args;
const sha = crypto.createHash('sha256').update(Buffer.from(creation.slice(2), 'hex')).digest('hex');
const ev = S.esperance(config.prizes);
const sortie = [
  '/* slots-deploiement.js — GENERE par contracts/preparer-deploiement-slots.mjs. NE PAS EDITER A LA MAIN.',
  ' * La transaction de deploiement NON SIGNEE de BlockSlots. Rien ici ne signe ni n envoie. Chaque valeur vient du depot (voir le preparateur).',
  ' * adresse: null -> l app ne montre AUCUN bouton Slots (pas de bouton mort). */',
  'export const SLOTS_DEPLOIEMENT = Object.freeze({',
  '  chaine: 8453,',
  "  contrat: 'BlockSlots',",
  "  compilateur: '" + String((meta.compiler && meta.compiler.version) || 'unknown') + "',",
  '  optimiseur: ' + JSON.stringify((meta.settings && meta.settings.optimizer) || null) + ',',
  "  evm: '" + String((meta.settings && meta.settings.evmVersion) || 'unknown') + "',",
  '  constructeur: Object.freeze(' + JSON.stringify(config) + '),',
  '  ordre: ' + JSON.stringify(C.ORDRE_CONFIG) + ',',
  '  octetsArgs: ' + args.length / 2 + ',',
  /* l esperance exacte de la table (avant le plafond du pot), en USDC brut arrondi bas, et la chance de gagner quelque chose (bps) */
  "  esperanceBrut: '" + ev.brut.toString() + "',",
  '  probGainBps: ' + ev.probGainBps + ',',
  '  sha256Sources: Object.freeze(' + JSON.stringify(sha256Sources) + '),',
  "  sha256Creation: '" + sha + "',",
  '  octetsCreation: ' + (creation.length - 2) / 2 + ',',
  /* apres le deploiement reel : l adresse et le bloc, RELUS sur la chaine, ecrits ENSEMBLE par noter-deploiement-slots.mjs */
  '  adresse: null,',
  '  bloc: null,',
  "  creation: '" + creation + "',",
  '});',
  '',
].join('\n');
const dest = process.env.SORTIE || path.join(ICI, '..', 'slots-deploiement.js');
fs.writeFileSync(dest, sortie);
console.log(path.basename(dest) + ' written: ' + (creation.length - 2) / 2 + ' bytes, sha256 ' + sha.slice(0, 16) + '…, args ' + args.length / 2 + ' bytes, EV ' + ev.brut + ' raw / spin');
