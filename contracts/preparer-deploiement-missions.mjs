/* preparer-deploiement-missions.mjs — FIGE la transaction de deploiement des MISSIONS : MissionsDeployer (rail + BlockMissionsV3 en UNE tx).
 *
 * ⛔ CE SCRIPT NE SIGNE RIEN ET N ENVOIE RIEN. Il ecrit `../missions-deploiement.js` ; la page `deployer-missions.html` la propose au wallet
 *   CONNECTE (celui de Phil). Ce qui est signe est ce qui a ete prouve (le banc fork deploie cette meme donnee et relit tout).
 * 2026-10-17 soir (Phil, au chat : « Oui, ajoute le rail ») : on ne deploie plus V3 seul. MissionsDeployer CREE le rail (son nonce 1, lie a
 *   l adresse que V3 aura) puis V3 (son nonce 2, RAIL = le rail), verifie les deux liens, et PROPOSE l ownership de V3 au signataire
 *   (il l accepte ensuite : acceptOwnership). Le rail est vendu par son OPERATEUR = le signataire.
 * Arguments du constructeur de MissionsDeployer : (V3Args, devDirect[], routeTokens[], hopCount[], hops[])
 *   - V3Args = (hook, poolManager, devWallet, communityReserve, usdc, verifier, guardian)
 *       hook = HOOK_7030 (tokenomics.js) ; poolManager = V4_ADRESSES[8453].poolm (lancer-pool.js) ; devWallet = FEE_WALLET et
 *       usdc = USDC_BASE (frais-creation.js) ; communityReserve, verifier, guardian = contracts/missions-parametres.json, REMPLI PAR PHIL.
 *       Une valeur absente -> `pret: false` et la liste `manquants` : la page garde le bouton eteint.
 *   - devDirect = les actions tokenisees du hook 7030 (symbole en « c »), lues dans le descripteur, jamais tapees.
 *   - la route du rail = missions-rail.js RAIL_ROUTE (UNIT -> ETH -> USDC), la seule source.
 * Usage (depuis contracts/) : forge build && node preparer-deploiement-missions.mjs */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, '..', f)).href);
const [F, T, L, H, R, K] = await Promise.all([imp('frais-creation.js'), imp('tokenomics.js'), imp('lancer-pool.js'), imp('hook-7030-descripteur.js'),
  imp('missions-rail.js'), imp('keccak.js')]);
const devDirect = H.DESCRIPTEUR_7030.devises.filter((d) => /c$/.test(d.sym) && d.adresse !== '0x0000000000000000000000000000000000000000').map((d) => d.adresse.toLowerCase());
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const fixes = { hook: bas(T.HOOK_7030), poolManager: bas(L.V4_ADRESSES[8453].poolm), devWallet: bas(F.FEE_WALLET), usdc: bas(F.USDC_BASE) };
for (const [k, v] of Object.entries(fixes)) if (!ADR.test(v)) throw new Error(k + ' unreadable in the repo');
const parametresChemin = path.join(ICI, 'missions-parametres.json');
/* un BOM (ecrit par certains editeurs Windows) n est pas une erreur de Phil : on l ote avant de lire */
const p = fs.existsSync(parametresChemin) ? JSON.parse(fs.readFileSync(parametresChemin, 'utf8').replace(/^﻿/, '')) : {};
const libres = { communityReserve: bas(p.communityReserve), verifier: bas(p.verifier), guardian: bas(p.guardian) };
const manquants = Object.entries(libres).filter(([, v]) => !ADR.test(v)).map(([k]) => k);
const LEGACY = '0x37eb9b7ce0b51fe12fbf092026e001918128580a';
/* les memes refus que le constructeur de V3, dits AVANT la signature */
const refus = [];
if (libres.communityReserve === fixes.devWallet) refus.push('communityReserve must differ from the dev wallet');
if (libres.communityReserve === LEGACY) refus.push('communityReserve cannot be the legacy 0x37eb owner');
if (/^0x0{40}$/.test(libres.communityReserve)) refus.push('communityReserve cannot be zero');
if (/^0x0{40}$/.test(libres.verifier)) refus.push('verifier cannot be zero');
/* Grok 2026-10-17 : le contrat accepte un gardien nul (la pause reste a l owner seul) — la page, non : sans gardien, personne ne peut geler
 *   vite si la cle de verification fuit */
if (/^0x0{40}$/.test(libres.guardian)) refus.push('guardian cannot be zero (nobody else could pause fast)');
/* 2026-10-18 (Phil : trois cles seulement — signeur, dev, Brain UNIT) : le gardien peut SEULEMENT mettre en pause ; il doit etre une autre cle
 *   que le verifier (dont il garde la fuite) et que la reserve (qui recoit) — le dev wallet, cle distincte, est admis (meme choix que TicketPot) */
if (ADR.test(libres.guardian) && [libres.communityReserve, libres.verifier].includes(libres.guardian)) refus.push('guardian must be its own key (not the verifier, not the reserve)');
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/MissionsDeployer.sol/MissionsDeployer.json'), 'utf8'));
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing or unlinked in the forge artifact');
if (!devDirect.length || devDirect.some((a) => !ADR.test(a) || a === fixes.usdc)) throw new Error('dev-direct stock list unreadable');
const pret = manquants.length === 0 && refus.length === 0;
const v3 = { ...fixes, ...libres };
const args = pret ? R.encoderArgsDeployer(v3, devDirect, R.RAIL_ROUTE) : null;
const creation = pret ? code + args : null;
const sha = (hex) => crypto.createHash('sha256').update(Buffer.from(hex.slice(2), 'hex')).digest('hex');
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : (art.metadata || {});
/* ⛔ 2026-10-17 (MESURE : un forge build en echec avait laisse dans out/ l artefact d une AUTRE source) : l artefact de la factory doit avoir
 *   ete compile depuis CES fichiers, octet pour octet — la factory ET ce qu elle cree (V3, rail). */
const SOURCES = ['src/MissionsDeployer.sol', 'src/BlockMissionsV3.sol', 'src/rails/RailSellToUsdcV4.sol'];
/* ⛔ MESURE 2026-10-17 soir (je me corrige : le commentaire de 777576b disait « fins de ligne comprises ») : forge NORMALISE en LF avant
 *   de hacher la source — le rail, en CRLF sur ce disque, a keccak 0xb529… brut et 0x045b… normalise, = l artefact. On compare donc le
 *   contenu normalise : un fichier MODIFIE change toujours ce hachage, une simple fin de ligne Windows non. */
for (const s of SOURCES) {
  const kS = K.keccak256Hex(Buffer.from(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')));
  const kA = String(((meta.sources || {})[s] || {}).keccak256 || '').toLowerCase();
  if (kA !== kS) throw new Error('stale forge artifact for ' + s + ': compiled from ' + (kA || 'an unknown source') + ', the source is ' + kS + ' -- run forge build first, and fix what stops it');
}
const sha256Sources = Object.fromEntries(SOURCES.map((s) => [s, crypto.createHash('sha256').update(fs.readFileSync(path.join(ICI, s), 'utf8').replace(/\r\n/g, '\n')).digest('hex')]));
const q = (v) => (v ? "'" + v + "'" : 'null');
const sortie = [
  '/* missions-deploiement.js — GENERE par contracts/preparer-deploiement-missions.mjs. NE PAS EDITER A LA MAIN.',
  ' * La transaction de deploiement NON SIGNEE de MissionsDeployer (rail + BlockMissionsV3 en une tx). Rien ici ne signe ni n envoie. */',
  'export const MISSIONS_DEPLOIEMENT = Object.freeze({',
  '  chaine: 8453,',
  "  contrat: 'MissionsDeployer',",
  "  compilateur: '" + String((meta.compiler && meta.compiler.version) || 'unknown') + "',",
  '  optimiseur: ' + JSON.stringify((meta.settings && meta.settings.optimizer) || null) + ',',
  "  evm: '" + String((meta.settings && meta.settings.evmVersion) || 'unknown') + "',",
  '  constructeur: Object.freeze(' + JSON.stringify(v3) + '),',
  '  ordre: ' + JSON.stringify(['hook', 'poolManager', 'devWallet', 'communityReserve', 'usdc', 'verifier', 'guardian']) + ',',
  '  devDirect: Object.freeze(' + JSON.stringify(devDirect) + '),',
  '  route: Object.freeze(' + JSON.stringify(R.RAIL_ROUTE) + '),',
  '  octetsArgs: ' + (args ? args.length / 2 : 'null') + ',',
  '  pret: ' + pret + ',',
  '  manquants: ' + JSON.stringify(manquants) + ',',
  '  refus: ' + JSON.stringify(refus) + ',',
  '  sha256Sources: Object.freeze(' + JSON.stringify(sha256Sources) + '),',
  '  sha256Creation: ' + q(creation ? sha(creation) : null) + ',',
  '  octetsCreation: ' + (creation ? (creation.length - 2) / 2 : 'null') + ',',
  /* apres le deploiement : l adresse de la FACTORY ; celle des missions se lit par missions() (la page le fait) */
  '  factory: null,',
  '  adresse: null,',
  '  creation: ' + q(creation) + ',',
  '});',
  '',
].join('\n');
fs.writeFileSync(path.join(ICI, '..', 'missions-deploiement.js'), sortie);
console.log('missions-deploiement.js written: pret=' + pret + (manquants.length ? ' missing=' + manquants.join(',') : '') + (refus.length ? ' refus=' + refus.join('; ') : ''));
