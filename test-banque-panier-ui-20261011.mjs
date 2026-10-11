/* test-banque-panier-ui-20261011.mjs - LE PANIER DANS L ONGLET BANK : MEME CALCUL QUE L ESTIMATEUR, MEMES BORNES ET MEME PHRASE QUE LE SERVEUR.
 * Phil (2026-10-11) : « que tu puisses mettre plusieurs actions tokenisees en garantie en meme temps ».
 * EXECUTE bcEstimationEmprunt et bcBanqueEstimer (app.html, TB_APP = ancienne) sur les memes montants : LTV et distance a la liquidation
 *   IDENTIQUES (deux copies d un calcul divergent - c est pourquoi la parite est un test, pas une relecture).
 * AFFIRME aussi : la limite de lignes et la phrase « chaque action est sa propre position » sont celles de banque-morpho.js ; la route
 *   /api/banque/plan accepte action=panier ; le client envoie lignes=<id>:<garantie>:<emprunt>.
 * NE PROUVE PAS : le rendu navigateur (verifie a part) ni l execution (banc fork).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { PANIER_MAX, PHRASE_PANIER_SEPARE } from './banque-morpho.js';
import { enUnitesBrutes } from './commandes-panel.js';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => { const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete); const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length); };
const estimation = new Function(fonction('function bcEstimationEmprunt(mk, g, d) {') + '\nreturn bcEstimationEmprunt;')();
const mk = { garantie: { decimales: 8, symbole: 'GOOGLc' }, pret: { decimales: 6, symbole: 'USDC' }, prixOracle: '3526329343300000000000000000000000000', lltv: '770000000000000000', margeBps: 7000, apyPret: 0.05 };
const champs = { '#bcBanqueEstim': { textContent: '' }, '#bcBanqueGarantie': { value: '' }, '#bcBanqueMontant': { value: '' } };
const jauges = [];
const estimer = new Function('$', 'bcBanque', 'enUnitesBrutes', 'bcUnites', 'bcPct', 'bcPeindreJauge', fonction('function bcBanqueEstimer() {') + '\nreturn bcBanqueEstimer;')(
  (s) => champs[s], { choisi: mk, sens: 'emprunter' }, enUnitesBrutes, (v, d) => String(v), (x) => String(x), (...a) => jauges.push(a));
for (const [g, d] of [['1', '10'], ['0.25', '40'], ['3', '700'], ['0.0001', '0.01'], ['1', '0']]) {
  champs['#bcBanqueGarantie'].value = g; champs['#bcBanqueMontant'].value = d; estimer();
  const j = jauges.at(-1);
  const e = estimation(mk, enUnitesBrutes(g, 8), d === '0' ? 0n : enUnitesBrutes(d, 6));
  vu(e && j && e.ltvPct === j[0] && e.chutePct === j[3] && e.maxPct === j[1] && e.liqPct === j[2], 'PARITE rompue pour ' + g + ' GOOGLc / ' + d + ' USDC : panier ' + JSON.stringify(e && [e.ltvPct, e.chutePct]) + ' contre estimateur ' + JSON.stringify(j));
}
vu(estimation(mk, enUnitesBrutes('1', 8), enUnitesBrutes('700', 6)).auDela === true, 'au-dela du plafond non signale');
vu(estimation({ ...mk, prixOracle: null }, 1n, 1n) === null && estimation(mk, 0n, 1n) === null, 'une estimation est inventee sans oracle ou sans garantie');
/* memes bornes, meme phrase que le serveur */
vu(new RegExp('const BC_PANIER_MAX = ' + PANIER_MAX + ';').test(html), 'la limite de lignes du client n est pas celle du serveur (' + PANIER_MAX + ')');
vu(html.includes(PHRASE_PANIER_SEPARE), 'la phrase « chaque action est sa propre position » de la page n est pas celle du serveur');
/* le client envoie le bon format, la route l accepte */
vu(/action: 'panier'/.test(html) && /lignes\.map\(\(x\) => x\.mk\.id \+ ':' \+ x\.brutG \+ ':' \+ x\.brutM\)\.join\(','\)/.test(html), 'le client n envoie pas lignes=<id>:<garantie>:<emprunt>');
vu(/action === 'panier'/.test(srv) && /planEmprunterPanier\(\{ rpc: rpcNaissance, compte, lignes: lignesPanier \}\)/.test(srv), 'la route n accepte pas action=panier');
vu(/bcPanierPeindre\(listes\);/.test(fonction('async function bcBanqueCharger(force = false) {')), 'le panier n est pas peint avec les marches');
console.log('ok banque-panier-ui - ' + n + ' assertions ; NE PROUVE PAS le rendu ni l execution');
