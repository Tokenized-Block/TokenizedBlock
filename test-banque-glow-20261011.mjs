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
const M = (dispo, lltv = '770000000000000000', apy = 0.05) => ({ disponibleUsd: dispo, lltv, margeBps: 7000, apyPret: apy });
const c = bcBanqueChiffres(M(566.2));
vu(c.etat === 'ok' && c.puce === '$566 available' && c.classe === 'ok', 'carte ok : ' + JSON.stringify(c));
vu(Math.abs(c.liqPct - 77) < 1e-9 && Math.abs(c.maxPct - 53.9) < 1e-9, 'plafond / seuil faux : ' + c.maxPct + ' / ' + c.liqPct);
vu(bcBanqueChiffres(M(3.3)).etat === 'bas' && /\(low\)$/.test(bcBanqueChiffres(M(3.3)).puce), 'faible liquidite mal dite');
vu(bcBanqueChiffres(M(0.0001)).etat === 'vide' && bcBanqueChiffres(M(0.0001)).puce === 'no liquidity', 'liquidite vide mal dite');
for (const x of [null, undefined, 'abc', NaN]) vu(bcBanqueChiffres(M(x)).etat === 'nonlu' && bcBanqueChiffres(M(x)).puce === 'liquidity not read', 'liquidite non lue prise pour un chiffre : ' + String(x));
const r = bcBanqueResumer([M(566), M(508, undefined, 0.054), M(null, undefined, 0.07), M(0.0001, undefined, null)]);
vu(Math.abs(r.total - 1074.0001) < 1e-6 && r.nonLus === 1 && r.n === 4, 'tuiles : somme des lues / non lues fausses : ' + JSON.stringify(r));
vu(r.meilleurPret === 0.07, 'meilleur taux faux : ' + r.meilleurPret);
const vide = bcBanqueResumer([M(null, undefined, null)]);
vu(vide.total === null && vide.meilleurPret === null, 'rien lu -> un zero invente : ' + JSON.stringify(vide));
/* le panneau suit, et le block affiche passe en tete */
const choisir = fonction('function bcBanqueChoisir(mk, sens) {');
vu(/choisirBrain\(gA\); bcRepeindre\(\); bcVue\('bank'\);/.test(choisir), 'choisir un marche ne fait pas suivre le block du panneau');
vu(/At our maximum \(/.test(choisir) && /% fall of ' \+ mk\.garantie\.symbole \+ ' liquidates you\./.test(choisir), 'le choix Borrow ne dit pas la baisse qui liquide au plafond');
const charger = fonction('async function bcBanqueCharger(force = false) {');
vu(/if \(ici\) listes\.sort\(/.test(charger) && /'This block'/.test(charger), 'les marches du block affiche ne passent pas en tete');
vu(charger.indexOf('const dispoDe') < charger.indexOf('if (ici) listes.sort('), 'la priorite au block passe AVANT le tri par liquidite (elle serait ecrasee)');
console.log('ok banque-glow - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
