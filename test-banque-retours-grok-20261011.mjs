/* test-banque-retours-grok-20261011.mjs - LES RETOURS DU TEST REEL DE LA BANK (Grok, 2026-10-11, wallet 0x31e0, 9 tx).
 * (4) « Sign N steps » restait cliquable sur une carte deja faite = double signature possible ; (1) une garantie de ~0,046 $ s affichait
 *   « ($0) » ; (2) les cartes rembourser / retirer ne disaient aucun montant, le pret n avait pas de ligne de risque ; (5) le formulaire
 *   gardait les anciens montants ; (3) le Wallet ne se relisait pas ; (8) la Bank ne se trouvait que par le Wallet.
 * EXECUTE bcUsd (app.html, TB_APP = ancienne) ; epingle le reste dans bcBanqueProposer / bcBanqueProposerPanier et l onglet Tokenized.
 * NE PROUVE PAS : un vrai wallet (Grok le contre-testera).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const i = html.indexOf('const bcUsd = (x) =>');
vu(i > 0, 'bcUsd introuvable');
const fin = /\r?\n\};/.exec(html.slice(i));
const src = fin && fin.index < 600 ? html.slice(i, i + fin.index + fin[0].length) : html.slice(i, html.indexOf('\n', i));
const bcUsd = new Function(src + '\nreturn bcUsd;')();
vu(bcUsd(0.046) === '$0.05', 'ROUGE->VERT : une garantie de 0,046 $ s affiche ' + bcUsd(0.046));
vu(bcUsd(0.004) === '< $0.01' && bcUsd(0) === '$0.00' && bcUsd(566.2) === '$566' && bcUsd(1486.4) === '$1,486' && bcUsd(null) === '—' && bcUsd('x') === '—', 'bcUsd faux : ' + [bcUsd(0.004), bcUsd(0), bcUsd(566.2), bcUsd(1486.4)].join(' | '));
const fonction = (entete) => { const k = html.indexOf(entete); assert.ok(k > 0, 'introuvable : ' + entete); const f = /\r?\n\}/.exec(html.slice(k)); return html.slice(k, k + f.index + f[0].length); };
const prop = fonction('async function bcBanqueProposer({');
/* 2026-10-11 (revue adverse) : l echec passe desormais par bcBanqueApresEchec (jamais « Start again » apres une etape passee) */
vu(/if \(!s\.ok\) \{ bcBanqueApresEchec\(m, s, p\.aSigner\.length, planifier\); return; \}\s*\/\*[\s\S]*?\*\/\s*bcBoutons\(m, \[\]\);/.test(prop), 'ROUGE->VERT : une carte faite garde son bouton de signature (double signature)');
vu(/\['#bcBanqueGarantie', '#bcBanqueMontant'\]\) \{ const e = \$\(id\); if \(e\) e\.value = ''; \}/.test(prop) && /void majWallet\(\)/.test(prop), 'le formulaire ne se vide pas, ou le Wallet ne se relit pas apres une operation');
vu(/'You lend '/.test(prop) && /'Risk: if a stock falls faster than its loans are liquidated/.test(prop) && /'You repay your whole debt: about '/.test(prop)
  && /' of what you lent\.'/.test(prop) && /' of collateral to your wallet\.'/.test(prop), 'les cartes ne disent pas leurs montants ou le risque du pret');
const panier = fonction('async function bcBanqueProposerPanier(lignes) {');
vu(/bcBoutons\(m, \[\]\); \/\* une carte faite n a plus de bouton de signature \*\//.test(panier), 'le panier fait garde son bouton de signature');
vu(html.indexOf('id="tkBankCarte"') > html.indexOf('id="v-tokenx"') && /\$\('#tkOuvrirBank'\)\.addEventListener\('click', \(\) => \{ bcOuvrirPop\(/.test(html), 'la Bank n est pas joignable depuis l onglet Tokenized');
/* (6) contre-test du 2026-10-11 13:15 : « we cap it at 70 % of the LLTV limit » = jargon. La borne est dite en mots, cote serveur
 *   (resume.marge, affiche par la carte ET cite par le refus « too much »). */
const banque = readFileSync(new URL('./banque-morpho.js', import.meta.url), 'utf8');
vu(!/LLTV limit/.test(banque.replace(/\/\*[\s\S]*?\*\//g, ' ')) && /' % of the most Morpho lets you borrow before liquidation'/.test(banque) && /\(we cap your debt at ' \+ resume\.marge \+ '\)'/.test(banque), 'la marge d emprunt reste dite en jargon (LLTV)');
console.log('ok banque-retours-grok - ' + n + ' assertions ; NE PROUVE PAS un vrai wallet');
