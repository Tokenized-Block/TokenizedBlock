/* test-bank-mode-apercu.mjs — LA MAQUETTE « PANIER DE BLOCKS » EST RETIREE, ET ELLE NE REVIENT PAS ; LE PANIER D ACTIONS LA REMPLACE.
 *
 * HISTOIRE. Le 2026-09-24, deux boutons de cette maquette (« Open TokenizedBank », « Add liquidity ») ouvraient une VRAIE fenetre de wallet
 *   (`personal_sign`) pour un geste qui n ecrivait que dans le navigateur, puis affichaient « Open confirmed (signed). Early shares frozen ·
 *   the Brain runs ops automatically » - trois affirmations fausses. Ce test gardait alors le « mode apercu » (decision de Raksha : « mets
 *   en mode faux le temps de build ») : aucune signature, un bandeau « not built yet » en tete, rien au present.
 * 2026-10-11 : Phil la retire (« retire ca et change le B20 from my block et remplace par tokenized stocks, c est ce qu on a fait ;
 *   reprends les best ideas et retravaille dessus pour proposer une version aboutie avec nos paniers d actions a collateraliser »).
 * CE TEST GARDE DESORMAIS : (1) rien de la maquette ne revient (DOM, gestionnaires, module tokenized-bank.js) ; (2) le panier qui la
 *   remplace est le panier d ACTIONS construit, peint depuis des lectures (pas de texte d absence statique), qui dit sa regle vraie
 *   (chaque action est sa propre position) et ne promet rien de ce que la maquette promettait (credit sur la totalite, part des premiers,
 *   agent qui opere). NE PROUVE PAS : le rendu (verifie au navigateur), un vrai wallet.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
let n = 0;
const v = (c, m) => { assert.ok(c, m); n += 1; };
/* (1) rien de la maquette ne revient */
for (const id of ['tbIdee', 'tbApercu', 'tbBlock', 'tbProof', 'tbBasket', 'tbProofBtn', 'tbGraftBtn', 'tbAddLiqBtn', 'tbBasketProofBtn', 'tbOpenBtn', 'tbEtat', 'tbEarly', 'tbAgent']) {
  v(!new RegExp('id="' + id + '"').test(html) && !sansCommentaires.includes("$('#" + id + "')"), 'la maquette revient : #' + id);
}
v(!/from '\.\/tokenized-bank\.js'/.test(html), 'le module de la maquette (tokenized-bank.js) est de nouveau importe');
v(!/function peindreTokenizedBank\(|function peindrePanierBank\(|grefferBlock\(|ouvrirCreditUsdcStub\(/.test(sansCommentaires), 'le JS de la maquette revient');
v(!/basket of blocks|Graft into basket|Open TokenizedBank/i.test(sansCommentaires), 'un texte de la maquette revient a l ecran');
/* (2) le panier d actions la remplace */
const i = html.indexOf('id="wBankCarte"'), j = html.indexOf('</section>', i);
const carte = html.slice(i, j).replace(/<!--[\s\S]*?-->/g, ' ');
v(/<div class="tbPanier" id="tbPanier" hidden>/.test(carte) && /id="tbPanierLignes"/.test(carte) && /id="tbPanierGo"/.test(carte), 'le panier d actions n est pas dans la carte du Wallet');
v(!/<li|not built yet|no credit|None of this exists/i.test(carte.slice(carte.indexOf('id="tbPanier"'), carte.indexOf('id="tbPanierGo"'))), 'le panier porte un texte statique (il doit etre peint depuis des lectures)');
const peindre = html.slice(html.indexOf('function tbPanierPeindre('), html.indexOf("$('#tbPanierGo').addEventListener"));
v(/Each stock is its own position: if one falls to its liquidation price, only that one is sold — the others are untouched\./.test(peindre), 'le panier ne dit plus sa regle (chaque action, sa position)');
v(/if \(!actions\.length && nonLu\) \{ z\.hidden = true; return; \}/.test(peindre), 'un panier NON LU est affiche comme « aucune action »');
v(!/credit on|totality|early|yield share|runs the operations/i.test(peindre), 'le panier promet ce que la maquette promettait');
console.log('ok bank-mode-apercu - ' + n + ' assertions : la maquette est partie et ne revient pas ; le panier d actions la remplace.');
console.log('NE PROUVE PAS le rendu (navigateur) ni un vrai wallet.');
