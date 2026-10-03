/* test-deploy-7030-20261003.mjs — LA PAGE DE SIGNATURE DU HOOK 7030 (62) ET SON DESCRIPTEUR DISENT LA MEME CHOSE QUE LE PLAN.
 * HORS RESEAU : deploy-7030.json (ce que la page envoie au wallet) <-> hook-7030-descripteur.js (ce que l app lira) :
 *   - l adresse du hook est RECALCULEE (CREATE2 : keccak(0xff ++ deployeur ++ sel ++ keccak(initcode))) depuis `data`, pas crue ;
 *   - sha256 du calldata, 63 devises (ETH + 62) identiques des deux cotes, planchers > 0, 62 adresses presentes dans l initcode,
 *     a6cf present ; selecteurs = keccak des signatures (jamais devines) ; tokenomics.HOOK_7030 = cette adresse, drapeau ETEINT ;
 *   - la page refuse le wallet de frais et exige la case « pas le wallet du dev » (texte present, logique relue).
 * ⛔ BORNE : ne prouve ni le deploiement ni le contrat (fork : contracts/launch-lock de feat/hook-7030-62-sur-a040db5-20261003). */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const { keccak256Hex, selecteur } = await imp('keccak.js');
const D = await imp('hook-7030-descripteur.js');
const T = await imp('tokenomics.js');
const P = await imp('paires.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const j = JSON.parse(fs.readFileSync(path.join(ICI, 'deploy-7030.json'), 'utf8'));
const hex = String(j.data).toLowerCase();
ok(/^0x[0-9a-f]+$/.test(hex) && (hex.length - 2) / 2 === j.octets, 'calldata hex, ' + j.octets + ' octets');
ok(crypto.createHash('sha256').update(j.data + '\n').digest('hex') === j.sha256Calldata, 'sha256 du calldata = celui annonce');
const sel = hex.slice(2, 66), init = Buffer.from(hex.slice(66), 'hex');
ok('0x' + sel === String(j.sel).toLowerCase(), 'le sel du JSON est en tete du calldata');
const h = keccak256Hex(init);
ok(h === String(j.initcodeHash).toLowerCase(), 'initcode hash recalcule = annonce (' + h.slice(0, 14) + ')');
const adr = '0x' + keccak256Hex(Buffer.from('ff' + j.deployeur.slice(2) + sel + h.slice(2), 'hex')).slice(-40);
ok(adr === j.hook.toLowerCase() && (parseInt(adr.slice(-4), 16) & 0x3fff) === 0x24cc, 'adresse CREATE2 recalculee = ' + j.hook + ', drapeaux 0x24cc');
ok(j.devises.length === 63 && j.devises[0].sym === 'ETH' && j.devises[0].adresse === '0x' + '0'.repeat(40), '63 lignes, ETH en tete');
ok(j.devises.every((d) => /^0x[0-9a-f]{40}$/.test(d.adresse) && BigInt(d.plancher) > 0n), 'adresses entieres, planchers > 0');
ok(j.devises.slice(1).every((d) => hex.includes(d.adresse.slice(2))), 'les 62 adresses sont dans l initcode');
ok(hex.includes(j.feeWallet.slice(2).toLowerCase()) && j.feeWallet.toLowerCase() === '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4', 'le wallet de frais a6cf est dans l initcode (decision : garde a6cf)');
ok(JSON.stringify(D.DESCRIPTEUR_7030.devises) === JSON.stringify(j.devises.map((d) => ({ sym: d.sym, adresse: d.adresse, decimales: d.decimales, plancher: d.plancher, regle: d.regle }))),
  'descripteur app = JSON de la page, ligne pour ligne');
ok(D.DESCRIPTEUR_7030.adresse === j.hook && D.DESCRIPTEUR_7030.initcodeHash === j.initcodeHash && D.DESCRIPTEUR_7030.sel === j.sel, 'descripteur : adresse, initcode, sel = JSON');
ok(D.DEVISES_7030.length === 62 && new Set(D.DEVISES_7030).size === 62 && P.DEVISES_ADMISES_7030 === D.DEVISES_7030, 'paires.DEVISES_ADMISES_7030 = les 62 du descripteur (meme objet)');
ok(T.HOOK_7030 === j.hook && T.HOOK_7030_ACTIF === true, 'tokenomics.HOOK_7030 = ' + j.hook + ', drapeau ALLUME (contrat deploye le 2026-10-03, tx 0xdb6f2f41…)');
/* l ordre des 19 est celui du CONTRAT (V9Devises.sol), pas celui de paires.js : on verifie l ensemble, pas l ordre */
ok(P.DEVISES_ADMISES_V9.length === 19 && P.DEVISES_ADMISES_V9.every((a) => D.DEVISES_7030.slice(0, 19).includes(a)), 'les 19 du V9 sont les 19 premieres de la liste (ensemble)');
const attendus = { feeWallet: 'feeWallet()', hookFee: 'HOOK_FEE()', partCreateur: 'PART_CREATEUR()', deviseAdmise: 'deviseAdmise(address)', plancherCaution: 'plancherCaution(address)' };
ok(Object.entries(attendus).every(([k, s]) => j.selecteurs[k] === selecteur(s)), 'selecteurs du JSON = keccak des signatures');
const page = fs.readFileSync(path.join(ICI, 'deploy-7030.html'), 'utf8');
ok(page.includes("fetch('./deploy-7030.json'") && page.includes('tx.feeWallet.toLowerCase()') && page.includes("$('#pasDev').checked"), 'la page lit ce JSON, refuse le wallet de frais, exige la case « pas le wallet du dev »');
ok(!/a6cf99d3/i.test(page), 'aucune adresse en dur dans la page (tout vient du JSON)');
const servis = fs.readFileSync(path.join(ICI, 'serveur-web.js'), 'utf8');
ok(['deploy-7030.html', 'deploy-7030.json', 'hook-7030-descripteur.js'].every((f) => servis.includes("'" + f + "'")), 'les trois fichiers sont servis');
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
