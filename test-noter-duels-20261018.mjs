/* test-noter-duels-20261018.mjs - LA FICHE N EST INSCRITE QUE SI LE RECU, LA DONNEE SIGNEE ET LES RELECTURES CONCORDENT.
 * AFFIRME (noter(), pur, avec des stubs, sur une fiche PRETE generee par le preparateur vers un fichier temporaire) : (1) un recu 0x1 d une
 *   creation dont l input == creation de la fiche, relectures = fiche, tokenOk(USDC) vrai, nextId 1 -> le texte porte adresse + bloc (et rien
 *   d autre ne change) ; (2) refus si : fiche pas prete (celle du depot aujourd hui), adresse deja ecrite, input different d UN octet, `to`
 *   present, status 0x0, pas de contractAddress, rewardPool relu different, relecture non lue, USDC non admis, nextId different de 1 ;
 *   (3) RELECTURES couvre USDC, DEV_WALLET, REWARD_POOL, GUARDIAN.
 * NE PROUVE PAS : un deploiement reel. */
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { noter, RELECTURES } from './contracts/noter-deploiement-duels.mjs';
import { DUELS_DEPLOIEMENT as DEPOT } from './duels-deploiement.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const ICI = path.dirname(fileURLToPath(import.meta.url));
vu(fs.existsSync(path.join(ICI, 'contracts/out/BlockDuels.sol/BlockDuels.json')), 'artefact forge BlockDuels present (sinon noter ne serait pas verifie)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'duels-noter-'));
let F, texte;
try {
  fs.writeFileSync(path.join(tmp, 'p.json'), JSON.stringify({ rewardPool: '0x' + '70'.repeat(20), guardian: '0x' + '6a'.repeat(20) }));
  execFileSync(process.execPath, ['preparer-deploiement-duels.mjs'], { cwd: path.join(ICI, 'contracts'), env: { ...process.env, SORTIE: path.join(tmp, 'd.js'), PARAMETRES: path.join(tmp, 'p.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
  texte = fs.readFileSync(path.join(tmp, 'd.js'), 'utf8');
  ({ DUELS_DEPLOIEMENT: F } = await import(pathToFileURL(path.join(tmp, 'd.js')).href));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
const C = F.constructeur, A = '0x' + 'ab'.repeat(20), DE = '0x' + 'cd'.repeat(20), H = '0x' + '77'.repeat(32);
const tx = () => ({ hash: H, from: DE, to: null, input: F.creation });
const recu = () => ({ status: '0x1', contractAddress: A, blockNumber: '0x3253f4b' });
const rel = () => ({ 'USDC()': C.usdc, 'DEV_WALLET()': C.devWallet, 'REWARD_POOL()': C.rewardPool, 'GUARDIAN()': C.guardian });
const bon = () => ({ fiche: F, texte, tx: tx(), recu: recu(), relectures: rel(), usdcAdmis: true, nextId: '1' });
/* (1) */
vu(F.pret === true && typeof F.creation === 'string', 'fiche de test prete (parametres de test)');
const v = noter(bon());
vu(v.ok === true && v.adresse === A && v.bloc === 52772683, 'inscrit : adresse + bloc');
vu(v.texte.includes("  adresse: '" + A + "',") && v.texte.includes('  bloc: 52772683, /* tx ' + H + ' signed by ' + DE + ' */'), 'les deux lignes reecrites, tx et signataire notes');
vu(v.texte.split('\n').length === texte.split('\n').length && v.texte.includes("sha256Creation: '" + F.sha256Creation + "'") && v.texte.replace(/\n  adresse:[^\n]*\n  bloc:[^\n]*/, '') === texte.replace(/\n  adresse: null,\n  bloc: null,/, ''), 'rien d autre ne change');
/* (2) */
const refuse = (patch, m) => { const x = bon(); patch(x); const r = noter(x); vu(r.ok === false && typeof r.pourquoi === 'string' && r.pourquoi.length > 10, m + ' : refuse (' + (r.pourquoi || '').slice(0, 70) + ')'); };
if (!DEPOT.pret) refuse((x) => { x.fiche = DEPOT; }, 'la fiche du depot (pas prete aujourd hui)');
refuse((x) => { x.fiche = { ...F, adresse: A, bloc: 1 }; }, 'adresse deja ecrite');
refuse((x) => { x.tx.input = F.creation.slice(0, -2) + (F.creation.endsWith('a') ? 'b' : 'a'); }, 'input different d un octet');
refuse((x) => { x.tx.to = A; }, 'to present');
refuse((x) => { x.recu.status = '0x0'; }, 'status 0x0');
refuse((x) => { delete x.recu.contractAddress; }, 'pas de contractAddress');
refuse((x) => { x.relectures['REWARD_POOL()'] = '0x' + '99'.repeat(20); }, 'rewardPool relu different');
refuse((x) => { x.relectures['DEV_WALLET()'] = '0x' + '99'.repeat(20); }, 'devWallet relu different');
refuse((x) => { x.relectures['GUARDIAN()'] = null; }, 'relecture non lue');
refuse((x) => { x.usdcAdmis = false; }, 'USDC non admis');
refuse((x) => { x.usdcAdmis = null; }, 'tokenOk illisible');
refuse((x) => { x.nextId = '2'; }, 'nextId different de 1');
/* (3) */
vu(JSON.stringify(RELECTURES.map((r) => r.sig)) === JSON.stringify(['USDC()', 'DEV_WALLET()', 'REWARD_POOL()', 'GUARDIAN()']), 'les 4 relectures d adresses (+ tokenOk(USDC), nextId)');
console.log('ok noter-duels - ' + n + ' assertions ; NE PROUVE PAS un deploiement reel');
