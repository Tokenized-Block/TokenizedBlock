/* test-noter-blockrolls-20261018.mjs - LA FICHE N EST INSCRITE QUE SI LE RECU, LA DONNEE SIGNEE ET LES RELECTURES CONCORDENT.
 * AFFIRME (noter(), pur, avec des stubs) : (1) un recu 0x1 d une creation dont l input == creation de la fiche, relectures = fiche, createur
 *   non nul -> le texte porte adresse + bloc (et rien d autre ne change) ; (2) refus si : adresse deja ecrite ; input different d UN octet ;
 *   `to` present ; status 0x0 ; pas de contractAddress ; une relecture differente (DEV_WALLET) ; une relecture non lue ; createur nul ;
 *   (3) RELECTURES couvre USDC, DEV_WALLET, HOOK, UNIT_POOL_ID, ROLL_PRICE, PASS_PRICE.
 * NE PROUVE PAS : un deploiement reel. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { noter, RELECTURES } from './contracts/noter-deploiement-blockrolls.mjs';
import { BLOCKROLLS_DEPLOIEMENT as F } from './blockrolls-deploiement.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const texte = readFileSync(new URL('./blockrolls-deploiement.js', import.meta.url), 'utf8');
const C = F.constructeur, A = '0x' + 'ab'.repeat(20), DE = '0x' + 'cd'.repeat(20), H = '0x' + '77'.repeat(32);
const tx = () => ({ hash: H, from: DE, to: null, input: F.creation });
const recu = () => ({ status: '0x1', contractAddress: A, blockNumber: '0x3253f4b' });
const rel = () => ({ 'USDC()': C.usdc, 'DEV_WALLET()': C.devWallet, 'HOOK()': C.hook, 'UNIT_POOL_ID()': C.unitPoolId, 'ROLL_PRICE()': String(C.rollPrice), 'PASS_PRICE()': String(C.passPrice) });
const bon = () => ({ fiche: F, texte, tx: tx(), recu: recu(), relectures: rel(), createur: '0x' + '31'.repeat(20) });
/* (1) */
const v = noter(bon());
vu(v.ok === true && v.adresse === A && v.bloc === 52772683, 'inscrit : adresse + bloc');
vu(v.texte.includes("  adresse: '" + A + "',") && v.texte.includes('  bloc: 52772683, /* tx ' + H + ' signed by ' + DE + ' */'), 'les deux lignes reecrites, tx et signataire notes');
vu(v.texte.split('\n').length === texte.split('\n').length && v.texte.includes("sha256Creation: '" + F.sha256Creation + "'"), 'rien d autre ne change');
/* (2) */
const refuse = (patch, m) => { const x = bon(); patch(x); const r = noter(x); vu(r.ok === false && typeof r.pourquoi === 'string' && r.pourquoi.length > 10, m + ' : refuse (' + (r.pourquoi || '').slice(0, 60) + ')'); };
refuse((x) => { x.fiche = { ...F, adresse: A, bloc: 1 }; }, 'adresse deja ecrite');
refuse((x) => { x.tx.input = F.creation.slice(0, -2) + (F.creation.endsWith('3') ? '4' : '3'); }, 'input different d un octet');
refuse((x) => { x.tx.to = A; }, 'to present');
refuse((x) => { x.recu.status = '0x0'; }, 'status 0x0');
refuse((x) => { delete x.recu.contractAddress; }, 'pas de contractAddress');
refuse((x) => { x.relectures['DEV_WALLET()'] = '0x' + '99'.repeat(20); }, 'DEV_WALLET relu different');
refuse((x) => { x.relectures['ROLL_PRICE()'] = null; }, 'relecture non lue');
refuse((x) => { x.createur = '0x' + '00'.repeat(20); }, 'createur nul');
/* (3) */
vu(JSON.stringify(RELECTURES.map((r) => r.sig)) === JSON.stringify(['USDC()', 'DEV_WALLET()', 'HOOK()', 'UNIT_POOL_ID()', 'ROLL_PRICE()', 'PASS_PRICE()']), 'les 6 relectures');
console.log('ok noter-blockrolls - ' + n + ' assertions ; NE PROUVE PAS un deploiement reel');
