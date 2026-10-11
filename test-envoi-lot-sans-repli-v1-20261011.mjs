/* test-envoi-lot-sans-repli-v1-20261011.mjs - LE LOT « TOUT OU RIEN » NE SE RELANCE PLUS EN 1.0, ET LE DRAPEAU « METHODE INCONNUE »
 * NE SE LIT PLUS SUR LA MAUVAISE ERREUR. Revue adverse du 2026-10-11 (3/3 sceptiques) :
 *   (1) envoi.js : apres un refus 2.0.0 « not supported », la relance 1.0 (sans atomicRequired) pouvait partir ; si elle jetait (refus
 *       4001, reponse perdue), sendCallsUnsupported etait calcule sur e2 + e - e avait DEJA matche -> true quoi qu il arrive -> la Bank
 *       disait « nothing was sent » et rouvrait l emprunt etape par etape (double emprunt possible) ;
 *   (2) un lot 2.0.0 atomique confirme avec UN recu (une transaction pour N appels) donnait tousConfirmes = false -> emprunt reussi
 *       affiche « Only 0 of 3 steps were confirmed ».
 * EXECUTE le VRAI envoyerLotAtomique (envoi.js) avec un faux wallet EIP-1193 qui compte ses fenetres.
 * NE PROUVE PAS : un vrai wallet. */
import { strict as assert } from 'node:assert';
import { envoyerLotAtomique } from './envoi.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const COMPTE = '0x31e0dbc9038c82184b9fa6a90057a3ed500bde3b';
const CALLS = [{ to: '0x' + '1'.repeat(40), data: '0xaa' }, { to: '0x' + '2'.repeat(40), data: '0xbb' }, { to: '0x' + '3'.repeat(40), data: '0xcc' }];
const fauxWallet = (comportement) => {
  const fenetres = [];
  return { fenetres, request: async ({ method, params }) => {
    if (method === 'eth_chainId') return '0x2105';
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [COMPTE];
    if (method === 'wallet_sendCalls') { fenetres.push(params[0].version); return comportement.sendCalls(params[0].version); }
    if (method === 'wallet_getCallsStatus') return comportement.statut();
    throw new Error('inattendu ' + method);
  } };
};
const rpc = async (m) => { if (m === 'eth_getTransactionReceipt') return { status: '0x1', logs: [] }; throw new Error('rpc ' + m); };
const lot = (eth, extra = {}) => envoyerLotAtomique({ eth, rpc, chaineAttendue: 8453, compte: COMPTE, calls: CALLS, delai: 1, essais: 3, ...extra });
const pasConnu = () => { throw Object.assign(new Error('wallet_sendCalls version 2.0.0 not supported'), { code: 4200 }); };

/* (1a) sansRepliV1 : 2.0.0 inconnue -> UNE seule fenetre, « rien n est parti » */
let w = fauxWallet({ sendCalls: pasConnu });
let r = await lot(w, { sansRepliV1: true });
vu(w.fenetres.length === 1 && w.fenetres[0] === '2.0.0', 'sansRepliV1 : la 1.0 a ete tentee (' + w.fenetres.join(',') + ')');
vu(r.etat === 'ECHEC_ENVOI' && r.sendCallsUnsupported === true && /nothing was sent/.test(r.pourquoi), 'sansRepliV1 : ' + JSON.stringify(r));
/* (1b) SANS l option (swaps) : 2.0.0 inconnue puis la 1.0 REFUSEE (4001) -> le drapeau doit dire FAUX (la methode etait connue) */
w = fauxWallet({ sendCalls: (v) => (v === '2.0.0' ? pasConnu() : (() => { throw Object.assign(new Error('User rejected the request.'), { code: 4001 }); })()) });
r = await lot(w);
vu(w.fenetres.join(',') === '2.0.0,1.0', 'la relance 1.0 attendue sans l option');
vu(r.sendCallsUnsupported === false, 'ROUGE->VERT : un refus dans la fenetre 1.0 est lu « methode inconnue » : ' + JSON.stringify(r));
/* (1c) 2.0.0 inconnue puis 1.0 sans reponse (timeout) -> pas « inconnue » non plus */
w = fauxWallet({ sendCalls: (v) => (v === '2.0.0' ? pasConnu() : (() => { throw new Error('request timed out'); })()) });
r = await lot(w);
vu(r.sendCallsUnsupported === false, 'une reponse perdue apres la fenetre 1.0 est lue « methode inconnue » : ' + JSON.stringify(r));
/* (2) 2.0.0 atomique confirme avec UN recu pour 3 appels -> tous confirmes */
w = fauxWallet({ sendCalls: () => ({ id: 'lot-1' }), statut: () => ({ status: 200, receipts: [{ status: '0x1', transactionHash: '0x' + 'a'.repeat(64) }] }) });
r = await lot(w);
vu(r.etat === 'CONFIRME' && r.atomiqueExige === true && r.tousConfirmes === true, 'ROUGE->VERT : un lot atomique a un recu est lu partiel : ' + JSON.stringify(r));
/* (2b) temoin : un lot 1.0 (non atomique) confirme avec 1 recu sur 3 reste « pas tous » */
w = fauxWallet({ sendCalls: (v) => (v === '2.0.0' ? pasConnu() : 'lot-2'), statut: () => ({ status: 200, receipts: [{ status: '0x1', transactionHash: '0x' + 'b'.repeat(64) }] }) });
r = await lot(w);
vu(r.etat === 'CONFIRME' && r.atomiqueExige === false && r.tousConfirmes === false, 'temoin 1.0 : ' + JSON.stringify(r));
console.log('ok envoi-lot-sans-repli-v1 - ' + n + ' assertions (envoyerLotAtomique execute) ; NE PROUVE PAS un vrai wallet');
