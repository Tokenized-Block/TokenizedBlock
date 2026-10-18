/* preparer-deploiement-blockrolls.mjs — FIGE la transaction de deploiement de BlockRolls (le tirage paye sur la face d un bloc).
 *
 * ⛔ CE SCRIPT NE SIGNE RIEN ET N ENVOIE RIEN. Il ecrit `../blockrolls-deploiement.js` ; la page `deployer-blockrolls.html` la propose au
 *   wallet CONNECTE (celui de Phil). Ce qui est signe est ce qui a ete prouve : banc-deployer-blockrolls-fork envoie CETTE donnee telle
 *   quelle sur un fork de Base et relit tout.
 * Le constructeur prend UN struct Config (14 mots statiques, encodes a plat par blockrolls-config.js encoderConfig) :
 *   usdc = USDC_BASE et devWallet = FEE_WALLET (frais-creation.js) ; hook = HOOK_7030 (tokenomics.js) ; unitPoolId = poolIdDe(ETH/UNIT,
 *   FEE_POOL, TICK_SPACING_POOL, hook) (volume-tirage.js, lancer-pool.js) ; prix, parts et regles = DEFAUTS de blockrolls-plan.js.
 *   RIEN n est tape a la main ici : chaque valeur est lue dans le depot.
 * Usage (depuis contracts/) : forge build && node preparer-deploiement-blockrolls.mjs      [SORTIE=chemin pour ecrire ailleurs (tests)] */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, '..', f)).href);
const [F, T, L, V, P, K, C] = await Promise.all([imp('frais-creation.js'), imp('tokenomics.js'), imp('lancer-pool.js'), imp('volume-tirage.js'),
  imp('blockrolls-plan.js'), imp('keccak.js'), imp('blockrolls-config.js')]);
const bas = (x) => String(x || '').toLowerCase();
const ETH = '0x0000000000000000000000000000000000000000';
const config = {
  usdc: bas(F.USDC_BASE),
  devWallet: bas(F.FEE_WALLET),
  hook: bas(T.HOOK_7030),
  unitPoolId: bas(V.poolIdDe({ currency0: ETH, currency1: P.UNIT, fee: L.FEE_POOL, tickSpacing: L.TICK_SPACING_POOL, hooks: T.HOOK_7030 })),
  rollPrice: P.DEFAUTS.rollPrice.toString(),
  passPrice: P.DEFAUTS.passPrice.toString(),
  passRolls: P.DEFAUTS.passRolls,
  passWindow: P.DEFAUTS.passWindowS,
  potShareBps: P.DEFAUTS.potShareBps,
  prize5: P.DEFAUTS.prize5.toString(),
  prize4: P.DEFAUTS.prize4.toString(),
  prize3: P.DEFAUTS.prize3.toString(),
  prize2: P.DEFAUTS.prize2.toString(),
  minScore: P.DEFAUTS.minScore,
};
if (config.unitPoolId !== bas(P.UNIT_POOL_ID)) throw new Error('UNIT pool id differs between volume-tirage.js and blockrolls-plan.js');
for (const k of ['usdc', 'devWallet', 'hook']) if (!/^0x[0-9a-f]{40}$/.test(config[k])) throw new Error(k + ' unreadable in the repo');
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/BlockRolls.sol/BlockRolls.json'), 'utf8'));
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing in the forge artifact');
/* l ordre du struct dans l ABI compilee doit etre celui de blockrolls-config.js : sinon la donnee signee ne serait pas celle affichee */
const ctor = (art.abi.find((x) => x.type === 'constructor') || {}).inputs || [];
const ordreAbi = ctor.length === 1 && ctor[0].type === 'tuple' ? ctor[0].components.map((c) => c.name) : [];
if (JSON.stringify(ordreAbi) !== JSON.stringify(C.ORDRE_CONFIG)) throw new Error('Config field order differs from the compiled ABI: ' + ordreAbi.join(','));
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : (art.metadata || {});
/* ⛔ MESURE 2026-10-17 : un forge build en echec laisse dans out/ l artefact d une AUTRE source. forge NORMALISE en LF avant de hacher :
 *   on compare le keccak de la source normalisee a celui que l artefact declare. Une source modifiee sans recompiler = refus. */
const SOURCES = ['src/BlockRolls.sol'];
for (const s of SOURCES) {
  const kS = K.keccak256Hex(Buffer.from(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')));
  const kA = String(((meta.sources || {})[s] || {}).keccak256 || '').toLowerCase();
  if (kA !== kS) throw new Error('stale forge artifact for ' + s + ': compiled from ' + (kA || 'an unknown source') + ', the source is ' + kS + ' -- run forge build first, and fix what stops it');
}
const sha256Sources = Object.fromEntries(SOURCES.map((s) => [s, crypto.createHash('sha256').update(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
const args = C.encoderConfig(config);
const creation = code + args;
const sha = crypto.createHash('sha256').update(Buffer.from(creation.slice(2), 'hex')).digest('hex');
const sortie = [
  '/* blockrolls-deploiement.js — GENERE par contracts/preparer-deploiement-blockrolls.mjs. NE PAS EDITER A LA MAIN.',
  ' * La transaction de deploiement NON SIGNEE de BlockRolls. Rien ici ne signe ni n envoie. Chaque valeur vient du depot (voir le preparateur). */',
  'export const BLOCKROLLS_DEPLOIEMENT = Object.freeze({',
  '  chaine: 8453,',
  "  contrat: 'BlockRolls',",
  "  compilateur: '" + String((meta.compiler && meta.compiler.version) || 'unknown') + "',",
  '  optimiseur: ' + JSON.stringify((meta.settings && meta.settings.optimizer) || null) + ',',
  "  evm: '" + String((meta.settings && meta.settings.evmVersion) || 'unknown') + "',",
  '  constructeur: Object.freeze(' + JSON.stringify(config) + '),',
  '  ordre: ' + JSON.stringify(C.ORDRE_CONFIG) + ',',
  '  octetsArgs: ' + args.length / 2 + ',',
  '  sha256Sources: Object.freeze(' + JSON.stringify(sha256Sources) + '),',
  "  sha256Creation: '" + sha + "',",
  '  octetsCreation: ' + (creation.length - 2) / 2 + ',',
  /* apres le deploiement reel : l adresse et le bloc, RELUS sur la chaine, ecrits ENSEMBLE (jamais l un sans l autre) */
  '  adresse: null,',
  '  bloc: null,',
  "  creation: '" + creation + "',",
  '});',
  '',
].join('\n');
const dest = process.env.SORTIE || path.join(ICI, '..', 'blockrolls-deploiement.js');
fs.writeFileSync(dest, sortie);
console.log(path.basename(dest) + ' written: ' + (creation.length - 2) / 2 + ' bytes, sha256 ' + sha.slice(0, 16) + '…, args ' + args.length / 2 + ' bytes');
