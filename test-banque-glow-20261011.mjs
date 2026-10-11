/* test-banque-glow-20261011.mjs - LA BANK EN CARTES : CHAQUE CHIFFRE VIENT DE LA LIGNE LUE, ET LE BLOCK DU PANNEAU SUIT LE MARCHE CHOISI.
 * Phil (2026-10-11) : « j aime l idee, glow up », « le block sur le panel control doit suivre ce que tu veux borrow / lend », « au moment
 *   du choix, montre en pourcentage le risque de liquidation ».
 * EXECUTE bcBanqueChiffres et bcBanqueResumer (app.html, TB_APP = ancienne) sur des lignes au format de /api/banque/marches.
 * AFFIRME : liquidite non lue = « liquidity not read » (jamais 0, jamais comptee) ; < 1 $ = vide ; < 10 $ = faible ; plafond = marge x LLTV ;
 *   les tuiles somment les SEULES liquidites lues et disent combien manquent ; meilleur taux de pret sans valeur inventee ; choisir un marche
 *   fait passer le panneau sur l action en garantie ; les marches du block affiche passent en tete ; le choix « Borrow » dit la baisse qui
 *   liquide au plafond (1 - marge).
 * NE PROUVE PAS : le rendu navigateur (verifie a part).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => {
  const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete);
  const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length);
};
const bcUsd = (x) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? '—' : '$' + Math.round(Number(x)).toLocaleString('en-US'));
const bcBanqueChiffres = new Function('bcUsd', fonction('function bcBanqueChiffres(mk) {') + '\nreturn bcBanqueChiffres;')(bcUsd);
const bcBanqueResumer = new Function(fonction('function bcBanqueResumer(listes) {') + '\nreturn bcBanqueResumer;')();
const M = (dispo, lltv = '770000000000000000', apy = 0.05, apyE = 0.06) => ({ disponibleUsd: dispo, lltv, margeBps: 7000, apyPret: apy, apyEmprunt: apyE });
/* ⛔ 2026-10-11 (Phil, sur la liste en prod : « les $ available c est pas bon, car peur de liquidite ») : AUCUN montant en dollars sur une
 *   carte - un ETAT. Un marche ou l on ne peut que preter n est pas une panne : puce neutre, jamais rouge. */
const c = bcBanqueChiffres(M(566.2));
vu(c.etat === 'ok' && c.puce === 'Borrow open' && c.classe === 'ok', 'carte ok : ' + JSON.stringify(c));
vu(Math.abs(c.liqPct - 77) < 1e-9 && Math.abs(c.maxPct - 53.9) < 1e-9, 'plafond / seuil faux : ' + c.maxPct + ' / ' + c.liqPct);
vu(bcBanqueChiffres(M(3.3)).etat === 'bas' && bcBanqueChiffres(M(3.3)).puce === 'Borrow limited', 'faible liquidite mal dite');
vu(bcBanqueChiffres(M(0.0001)).etat === 'vide' && bcBanqueChiffres(M(0.0001)).puce === 'Lend only' && bcBanqueChiffres(M(0.0001)).classe === '', 'marche ou l on ne peut que preter mal dit (ou en rouge)');
for (const x of [null, undefined, 'abc', NaN]) vu(bcBanqueChiffres(M(x)).etat === 'nonlu' && bcBanqueChiffres(M(x)).puce === 'availability not read', 'liquidite non lue prise pour un chiffre : ' + String(x));
for (const x of [566.2, 3.3, 0.0001, null]) vu(!/\$|available/i.test(bcBanqueChiffres(M(x)).puce), 'un montant en dollars revient sur une carte : ' + bcBanqueChiffres(M(x)).puce);
/* les tuiles : le taux d emprunt le plus bas parmi les SEULS marches ou l on peut emprunter (un taux sur un marche vide est une offre
 *   qu on ne peut pas prendre) ; le meilleur taux de pret ; rien lu = null, jamais 0 */
const r = bcBanqueResumer([M(566, undefined, 0.05, 0.0583), M(508, undefined, 0.054, 0.06), M(null, undefined, 0.07, 0.01), M(0.0001, undefined, null, 0.0407)]);
vu(r.moinsCher === 0.0583 && r.ouverts === 2 && r.n === 4, 'tuile « Borrow from » : un taux de marche vide ou non lu compte : ' + JSON.stringify(r));
vu(r.meilleurPret === 0.07, 'meilleur taux faux : ' + r.meilleurPret);
const vide = bcBanqueResumer([M(null, undefined, null, null)]);
vu(vide.moinsCher === null && vide.meilleurPret === null, 'rien lu -> un zero invente : ' + JSON.stringify(vide));
vu(!/To borrow|bcUsd\(r\.total\)/.test(fonction('function bcBanquePeindreResume(listes, ecartes, cible = \'#bcBanqueResume\') {')), 'la tuile « To borrow $… » est revenue');
/* le panneau suit, et le block affiche passe en tete */
const choisir = fonction('function bcBanqueChoisir(mk, sens) {');
vu(/choisirBrain\(gA\); bcRepeindre\(\); bcVue\('bank'\);/.test(choisir), 'choisir un marche ne fait pas suivre le block du panneau');
vu(/At our maximum \(/.test(choisir) && /% fall of ' \+ mk\.garantie\.symbole \+ ' liquidates you\./.test(choisir), 'le choix Borrow ne dit pas la baisse qui liquide au plafond');
const charger = fonction('async function bcBanqueCharger(force = false) {');
vu(/if \(ici\) listes\.sort\(/.test(charger) && /'This block'/.test(charger), 'les marches du block affiche ne passent pas en tete');
/* ⛔ 2026-10-11 : le tri par liquidite a demenage dans bcBanqueListes() (partage avec la carte du Wallet). L ancienne assertion cherchait
 *   « const dispoDe » DANS bcBanqueCharger : absente, indexOf rendait -1 et elle passait par absence. On exige l appel, et son rang. */
const iL = charger.indexOf('= bcBanqueListes();'), iT = charger.indexOf('if (ici) listes.sort(');
vu(iL > 0 && iT > iL, 'la priorite au block passe AVANT le tri par liquidite (elle serait ecrasee), ou bcBanqueCharger ne passe plus par bcBanqueListes');
vu(/const dispoDe = [^\n]*\n\s*const listes = bcBanque\.marches\.filter\(\(mk\) => mk\.listeParMorpho === true\)\.sort\(\(a, b\) => dispoDe\(b\) - dispoDe\(a\)\)/.test(fonction('function bcBanqueListes() {')), 'bcBanqueListes ne trie plus par liquidite');
console.log('ok banque-glow - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
