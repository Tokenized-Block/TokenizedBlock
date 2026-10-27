/* preparer-deploiement-ticketpot.mjs — FIGE la transaction de deploiement de TicketPot (les pots USDC du jour, partages entre les holders).
 *
 * ⛔ CE SCRIPT NE SIGNE RIEN ET N ENVOIE RIEN. Il ecrit `../ticketpot-deploiement.js` ; la page `deployer-ticketpot.html` la propose au
 *   wallet CONNECTE (celui de Phil, qui devient owner). Ce qui est signe est ce qui a ete prouve : banc-ticketpot-fork envoie une donnee
 *   preparee PAR CE SCRIPT telle quelle sur un fork de Base et relit tout.
 * Constructeur (usdc, verifier, guardian) — ticketpot-config.js encoderArgs :
 *   usdc = USDC_BASE (frais-creation.js), lu dans le depot ; verifier, guardian = contracts/ticketpot-parametres.json, REMPLI PAR PHIL.
 *   Une valeur absente ou refusee -> `pret: false`, `creation: null` et la liste `manquants` / `refus` : la page garde le bouton eteint.
 * Usage (depuis contracts/) : forge build && node preparer-deploiement-ticketpot.mjs
 *   [SORTIE=chemin pour ecrire ailleurs] [PARAMETRES=autre json] (tests et banc fork seulement) */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, '..', f)).href);
const [F, K, C] = await Promise.all([imp('frais-creation.js'), imp('keccak.js'), imp('ticketpot-config.js')]);
const ADR = /^0x[0-9a-f]{40}$/;
const bas = (x) => String(x || '').toLowerCase();
const usdc = bas(F.USDC_BASE), feeWallet = bas(F.FEE_WALLET);
if (!ADR.test(usdc) || !ADR.test(feeWallet)) throw new Error('USDC_BASE / FEE_WALLET unreadable in the repo');
const parametresChemin = process.env.PARAMETRES || path.join(ICI, 'ticketpot-parametres.json');
/* un BOM (ecrit par certains editeurs Windows) n est pas une erreur de Phil : on l ote avant de lire */
const p = fs.existsSync(parametresChemin) ? JSON.parse(fs.readFileSync(parametresChemin, 'utf8').replace(/^﻿/, '')) : {};
/* 2026-10-27 (owner GO, docs/rachat-unit-simple-20261027.md): JETON=<address> freezes a SECOND pot paying in that token (UNIT). TicketPot
 *   reads no decimals; the constructor only needs code at the token (a B20 has 0xef). Default: USDC, unchanged. */
const jeton = process.env.JETON ? bas(process.env.JETON) : usdc;
if (!ADR.test(jeton)) throw new Error('JETON is not an address');
const constructeur = { usdc: jeton, verifier: ADR.test(bas(p.verifier)) ? bas(p.verifier) : '', guardian: ADR.test(bas(p.guardian)) ? bas(p.guardian) : '' };
const manquants = ['verifier', 'guardian'].filter((k) => !constructeur[k]);
const refus = manquants.length ? [] : C.refusParametres(constructeur, { devWallet: feeWallet });
const pret = manquants.length === 0 && refus.length === 0;
const art = JSON.parse(fs.readFileSync(path.join(ICI, 'out/TicketPot.sol/TicketPot.json'), 'utf8'));
const code = String(art.bytecode.object);
if (!/^0x[0-9a-f]+$/.test(code)) throw new Error('bytecode missing in the forge artifact');
/* l ordre des arguments dans l ABI compilee doit etre celui de ticketpot-config.js : sinon la donnee signee ne serait pas celle affichee */
const ctor = (art.abi.find((x) => x.type === 'constructor') || {}).inputs || [];
if (ctor.map((i) => i.type).join() !== 'address,address,address' || ctor.map((i) => i.name.replace(/_$/, '')).join() !== C.ORDRE_ARGS.join()) throw new Error('constructor differs from ticketpot-config.js: ' + ctor.map((i) => i.name).join(','));
const meta = typeof art.metadata === 'string' ? JSON.parse(art.metadata) : (art.metadata || {});
/* ⛔ MESURE 2026-10-17 : un forge build en echec laisse dans out/ l artefact d une AUTRE source. forge NORMALISE en LF avant de hacher :
 *   on compare le keccak de la source normalisee a celui que l artefact declare. Une source modifiee sans recompiler = refus. */
const SOURCES = ['src/TicketPot.sol'];
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
  '/* ticketpot-deploiement.js — GENERE par contracts/preparer-deploiement-ticketpot.mjs. NE PAS EDITER A LA MAIN.',
  ' * La transaction de deploiement NON SIGNEE de TicketPot. Rien ici ne signe ni n envoie. usdc vient du depot ; verifier et guardian de',
  ' * contracts/ticketpot-parametres.json (Phil). pret: false -> la page ne propose rien. */',
  'export const TICKETPOT_DEPLOIEMENT = Object.freeze({',
  '  chaine: 8453,',
  "  contrat: 'TicketPot',",
  "  compilateur: '" + String((meta.compiler && meta.compiler.version) || 'unknown') + "',",
  '  optimiseur: ' + JSON.stringify((meta.settings && meta.settings.optimizer) || null) + ',',
  "  evm: '" + String((meta.settings && meta.settings.evmVersion) || 'unknown') + "',",
  '  constructeur: Object.freeze(' + JSON.stringify(constructeur) + '),',
  '  ordre: ' + JSON.stringify(C.ORDRE_ARGS) + ',',
  "  feeWallet: '" + feeWallet + "',",
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
const dest = process.env.SORTIE || path.join(ICI, '..', 'ticketpot-deploiement.js');
fs.writeFileSync(dest, sortie);
console.log(path.basename(dest) + ' written: pret=' + pret + (manquants.length ? ' missing=' + manquants.join(',') : '') + (refus.length ? ' refus=' + refus.join('; ') : '')
  + (creation ? ', ' + (creation.length - 2) / 2 + ' bytes, sha256 ' + sha.slice(0, 16) + '…' : ''));
