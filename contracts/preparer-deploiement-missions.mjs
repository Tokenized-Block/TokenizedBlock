/* preparer-deploiement-missions.mjs — FIGE la transaction de deploiement de BlockMissionsV3 : bytecode compile + 8 arguments du constructeur.
 *
 * ⛔ CE SCRIPT NE SIGNE RIEN ET N ENVOIE RIEN. Il ecrit `../missions-deploiement.js` ; la page `deployer-missions.html` la propose au wallet
 *   CONNECTE (celui de Phil). Comme BlockSkins : ce qui est signe est ce qui a ete prouve (le banc fork deploie cette meme donnee).
 * Arguments (ordre du constructeur) : (hook, poolManager, devWallet, communityReserve, usdc, verifier, guardian, rail)
 *   - hook        = HOOK_7030 (tokenomics.js <- hook-7030-descripteur.js)
 *   - poolManager = V4_ADRESSES[8453].poolm (lancer-pool.js)
 *   - devWallet   = FEE_WALLET (frais-creation.js) — decision de Phil 2026-10-16 21:38 (le dev ne recoit que de l USDC)
 *   - usdc        = USDC_BASE (frais-creation.js)
 *   - communityReserve, verifier, guardian, rail = contracts/missions-parametres.json, REMPLI PAR PHIL. Une valeur absente -> `pret: false`
 *     et la liste `manquants` : la page garde le bouton eteint. rail = 0x0…0 autorise (sans rail : les 20 % dev non-USDC vont a la reserve).
 * Usage (depuis contracts/) : forge build && node preparer-deploiement-missions.mjs */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, '..', f)).href);
const [F, T, L] = await Promise.all([imp('frais-creation.js'), imp('tokenomics.js'), imp('lancer-pool.js')]);
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const fixes = { hook: bas(T.HOOK_7030), poolManager: bas(L.V4_ADRESSES[8453].poolm), devWallet: bas(F.FEE_WALLET), usdc: bas(F.USDC_BASE) };
for (const [k, v] of Object.entries(fixes)) if (!ADR.test(v)) throw new Error(k + ' unreadable in the repo');
const parametresChemin = path.join(ICI, 'missions-parametres.json');
const p = fs.existsSync(parametresChemin) ? JSON.parse(fs.readFileSync(parametresChemin, 'utf8')) : {};
const libres = { communityReserve: bas(p.communityReserve), verifier: bas(p.verifier), guardian: bas(p.guardian), rail: bas(p.rail) };
const manquants = Object.entries(libres).filter(([, v]) => !ADR.test(v)).map(([k]) => k);
const LEGACY = '0x37eb9b7ce0b51fe12fbf092026e001918128580a';
/* les memes refus que le constructeur, dits AVANT la signature */
const refus = [];
if (libres.communityReserve === fixes.devWallet) refus.push('communityReserve must differ from the dev wallet');
if (libres.communityReserve === LEGACY) refus.push('communityReserve cannot be the legacy 0x37eb owner');
if (/^0x0{40}$/.test(libres.communityReserve)) refus.push('communityReserve cannot be zero');
if (/^0x0{40}$/.test(libres.verifier)) refus.push('verifier cannot be zero');
if (libres.rail && (libres.rail === fixes.devWallet || libres.rail === libres.communityReserve)) refus.push('rail cannot be the dev wallet or the reserve');
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/BlockMissionsV3.sol/BlockMissionsV3.json'), 'utf8'));
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing or unlinked in the forge artifact');
const mot = (a) => a.slice(2).padStart(64, '0');
const ordre = [fixes.hook, fixes.poolManager, fixes.devWallet, libres.communityReserve, fixes.usdc, libres.verifier, libres.guardian, libres.rail];
const pret = manquants.length === 0 && refus.length === 0;
const creation = pret ? code + ordre.map(mot).join('') : null;
const sha = (hex) => crypto.createHash('sha256').update(Buffer.from(hex.slice(2), 'hex')).digest('hex');
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : (art.metadata || {});
const source = fs.readFileSync(path.join(ICI, 'src/BlockMissionsV3.sol'), 'utf8').replace(/\r\n/g, '\n');
const q = (v) => (v ? "'" + v + "'" : 'null');
const sortie = [
  '/* missions-deploiement.js — GENERE par contracts/preparer-deploiement-missions.mjs. NE PAS EDITER A LA MAIN.',
  ' * La transaction de deploiement NON SIGNEE de BlockMissionsV3. Rien ici ne signe ni n envoie. */',
  'export const MISSIONS_DEPLOIEMENT = Object.freeze({',
  '  chaine: 8453,',
  "  contrat: 'BlockMissionsV3',",
  "  compilateur: '" + String((meta.compiler && meta.compiler.version) || 'unknown') + "',",
  '  optimiseur: ' + JSON.stringify((meta.settings && meta.settings.optimizer) || null) + ',',
  "  evm: '" + String((meta.settings && meta.settings.evmVersion) || 'unknown') + "',",
  '  constructeur: Object.freeze(' + JSON.stringify({ ...fixes, ...libres }) + '),',
  '  ordre: ' + JSON.stringify(['hook', 'poolManager', 'devWallet', 'communityReserve', 'usdc', 'verifier', 'guardian', 'rail']) + ',',
  '  pret: ' + pret + ',',
  '  manquants: ' + JSON.stringify(manquants) + ',',
  '  refus: ' + JSON.stringify(refus) + ',',
  "  sha256Source: '" + crypto.createHash('sha256').update(source).digest('hex') + "',",
  '  sha256Creation: ' + q(creation ? sha(creation) : null) + ',',
  '  octetsCreation: ' + (creation ? (creation.length - 2) / 2 : 'null') + ',',
  '  adresse: null,',
  '  creation: ' + q(creation) + ',',
  '});',
  '',
].join('\n');
fs.writeFileSync(path.join(ICI, '..', 'missions-deploiement.js'), sortie);
console.log('missions-deploiement.js written: pret=' + pret + (manquants.length ? ' missing=' + manquants.join(',') : '') + (refus.length ? ' refus=' + refus.join('; ') : ''));
