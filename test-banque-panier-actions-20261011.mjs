/* test-banque-panier-actions-20261011.mjs - LE PANIER D ACTIONS, ABOUTI : UNE LIGNE PAR ACTION, PRE-REMPLI POUR CE WALLET, VU AU VISUEL.
 * Phil (2026-10-11) : « retire ca [la maquette du panier de blocks]… remplace par tokenized stocks… une version aboutie avec nos paniers
 *   d actions a collateraliser » ; « ajoute l image des blocks de notre app pour les tokenized stocks pour que le user repere plus
 *   facilement au visuel ».
 * AFFIRME (cablage, app.html ; TB_APP = ancienne : rouge) :
 *   Bank - une ligne par ACTION sur son meilleur marche (le serveur refuse la meme action deux fois) ; wallet lu : seules les actions
 *   detenues, cochees (au plus BC_PANIER_MAX), garantie = le solde du wallet, emprunt = la moitie de ce qu elles permettent arrondie au cent
 *   inferieur ; l estimation de chaque ligne compte ce qui est deja pose et du ; le total dit le frais et le net.
 *   Wallet - le panier lu sur la chaine, ce que chaque action garantit, la regle (chaque action sa position) ; un geste : panier (2+),
 *   formulaire (1), Market (0) ; non lu = cache, jamais « aucune action ».
 *   Visuel - la face du block (dessin, la meme que le panneau) sur les cartes de marche, les positions, les deux paniers.
 * NE PROUVE PAS : le rendu (verifie au navigateur), un vrai wallet.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => { const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete); const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length); };
/* Bank */
const pp = fonction('function bcPanierPeindre(listes) {');
vu(/const parAction = new Map\(\);/.test(pp) && /k = mk\.garantie\.symbole/.test(pp) && /if \(!cur \|\| score > cur\.score\) parAction\.set\(k, \{ mk, r, score \}\);/.test(pp), 'le panier n a pas UNE ligne par action (son meilleur marche)');
vu(/if \(parWallet\) lignes = lignes\.filter\(detenue\);/.test(pp) && /if \(parWallet && cochees < BC_PANIER_MAX\)/.test(pp), 'wallet lu : le panier ne se limite pas aux actions detenues, ou depasse la limite');
vu(/g\.value = bcUnites\(solde, Number\(mk\.garantie\.decimales\)\)/.test(pp) && /const moitie = \(\(r\.emprunt \/ 2n\) \/ cent\) \* cent;/.test(pp), 'le panier n est pas pre-rempli (solde du wallet, moitie arrondie au cent)');
vu(/if \(bcBanque\.panierDemande\) \{ bcBanque\.panierDemande = false; if \(!zone\.hidden\) \{ zone\.open = true;/.test(pp), 'le panier demande depuis le Wallet ne s ouvre pas (ou le drapeau reste arme)');
const pm = fonction('function bcPanierMaj() {');
vu(/bcEstimationEmprunt\(x\.mk, g \+ g0, d \+ d0\)/.test(pm), 'l estimation d une ligne ignore ce qui est deja pose et du');
vu(/TokenizedBlock fee ≈ ' \+ bcUnites\(frais, decP\)/.test(pm) && /a separate step after each loan\), after it you keep ≈ ' \+ bcUnites\(total - frais, decP\)/.test(pm), 'le total du panier ne dit pas le frais, son etape et le net');
/* Wallet */
const tp = fonction('function tbPanierPeindre(actions, p, nonLu, acceptees = []) {');
vu(/if \(!actions\.length && nonLu\) \{ z\.hidden = true; return; \}/.test(tp), 'un panier NON LU dit « aucune action »');
vu(/tbPanierEtat\.mode = 'acheter'/.test(tp) && /tbPanierEtat\.mode = utiles\.length >= 2 \? 'panier' : utiles\.length === 1 \? 'un' : null;/.test(tp), 'les trois gestes (acheter / un / panier) ne sont pas distingues');
/* revue adverse (2026-10-11) : « Read on chain just now » etait faux ; la note dit d ou vient CHAQUE chiffre */
vu(/Wallet balances are read on chain \(up to a minute old\)/.test(tp) && /Each stock is its own position/.test(tp), 'le panier du Wallet ne dit pas d ou viennent les avoirs ni sa regle');
const go = html.slice(html.indexOf("$('#tbPanierGo').addEventListener"), html.indexOf("$('#tbPanierGo').addEventListener") + 700);
vu(/allerA\('trade'\)/.test(go) && /bcBanque\.panierDemande = true;/.test(go) && /bcBanqueChoisir\(tbPanierEtat\.mk, 'emprunter'\)/.test(go), 'le bouton du panier du Wallet ne mene pas au bon geste');
vu(/tbPanierPeindre\(\[\.\.\.parActionPanier\.values\(\)\], p, nonLu, acceptees\);/.test(fonction('async function tbBanquePeindre() {')), 'la carte du Wallet ne peint pas le panier (avec la regle de la Bank)');
/* Visuel */
const vis = fonction('function bcVisage(adr, sym) {');
vu(/dessin\(String\(adr\)\.toLowerCase\(\), sym \|\| '\?'\)/.test(vis) && /v\.textContent = String\(sym \|\| '\?'\)\.slice\(0, 1\)/.test(vis) && /'aria-hidden': 'true'/.test(vis), 'la vignette n est pas la face du panneau (dessin), ou n a pas de repli');
const usages = (html.match(/bcVisage\((mk|ps|a\.mk)\.garantie\.adr/g) || []).length;
vu(usages >= 5, 'la face n est pas sur les cartes de marche, les positions et les deux paniers (' + usages + ' usages, attendu >= 5)');
console.log('ok banque-panier-actions - ' + n + ' assertions ; NE PROUVE PAS le rendu ni un vrai wallet');
