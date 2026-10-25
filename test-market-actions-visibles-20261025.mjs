/* test-market-actions-visibles-20261025.mjs - LE MARKET MONTRE CHAQUE ACTION TOKENISEE QUI A DES UNITES EN CIRCULATION : sa ligne (Buy ou
 *   sa raison), ou, sans ligne DexScreener, son nom et la raison lue sur la chaine. Jamais cachee derriere « Show more ».
 * Rapport du testeur live (2026-10-25, game44) : « TSLAc absent de la liste Market (trouvable seulement via la recherche Map) ».
 * CAUSE MESUREE sur /api/trending de prod (lu 2026-10-25T18:43:55Z, mesures/trending-prod-20261025-tslac.json) : TSLAc EST servi, avec
 *   une route achetable (pool Aerodrome de la table, 38 207 USDC) — mais DexScreener rend sa paire Uniswap v4 MINCE (liq 1 095 $, 10 $ de
 *   volume 24 h) ; triee « Last hour » puis par volume 24 h, elle tombe au rang 180 sur 194, et peindreTrending n affiche que les 50
 *   premieres (trAffiches). 19 des 42 lignes d action etaient sous la coupe. Et 23 actions a unites en circulation n ont AUCUNE ligne
 *   (DexScreener muet) : elles n etaient comptees nulle part a l ecran.
 * CE BANC : EXECUTE peindreTrending (extrait de app.html) sur la photo de prod, compte les actions a unites rendues dans la liste visible
 *   par defaut (tri h1, 50 lignes), verifie TSLAc (rendue, avec Buy), le rang vrai, le compte « Show more », la raison des actions sans
 *   ligne ; mutants sur des COPIES du texte. NE PROUVE PAS le rendu (mesure a part dans un navigateur, 375 / 320 px). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const { verdictRoutage, raisonSansBuy } = await imp('routage.js');
const { avecPoolAction } = await imp('pools-actions-aerodrome.js');
const { ACTIONS_COINBASE } = await imp('paires.js');
const { TBLOCK } = await imp('tokenomics.js');
const APP = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
const PROD = JSON.parse(fs.readFileSync(path.join(ICI, 'mesures', 'trending-prod-20261025-tslac.json'), 'utf8'));
const enTexte = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ACTIONS_PAR_ADR = new Set(ACTIONS_COINBASE.map((a) => String(a.adr).toLowerCase()));
const TSLA = '0xb2000000000000000000001e800a7f5189430cd0';

function peindre(app, d) {
  const a = app.indexOf('function peindreTrending() {');
  const b = app.indexOf('let trAffiches = 50;', a);
  if (a < 0 || b < 0) throw new Error('peindreTrending introuvable');
  const corps = app.slice(a + 'function peindreTrending() {'.length, app.lastIndexOf('}', b));
  const ul = { innerHTML: '' }, note = { textContent: '' };
  const $ = (s) => (s === '#trListe' ? ul : s === '#trNote' ? note : null);
  const f = new Function('$', 'trDonnees', 'trTri', 'trAffiches', 'decouvrirPourTrending', 'enTexte', 'dessin', 'usdCourt', 'poolDecouvertPour', 'avecPoolAction',
    'verdictRoutage', 'ACTIONS_PAR_ADR', 'LIQ_MIN_BUY_USD', 'TBLOCK', 'raisonSansBuy', corps);
  f($, d, 'h1', 50, () => {}, enTexte, () => '<svg></svg>', (v) => '$' + Number(v || 0).toFixed(0), () => null, avecPoolAction, verdictRoutage, ACTIONS_PAR_ADR, 500, TBLOCK, raisonSansBuy);
  return { html: ul.innerHTML, note: note.textContent };
}
const lis = (html) => html.split('<li ').slice(1).map((x) => '<li ' + x);
const adrDe = (li) => (/data-block="(0x[0-9a-fA-F]{40})"/.exec(li) || [])[1];

function mesurer(app) {
  const { html, note } = peindre(app, PROD);
  const rangs = lis(html);
  const avecUnites = PROD.actionsChaine.liste.filter((x) => x.unites && x.unites !== '0');
  const rendues = new Set(rangs.map(adrDe).filter(Boolean).map((x) => x.toLowerCase()));
  return { html, note, rangs, avecUnites, vues: avecUnites.filter((x) => rendues.has(x.adr)).length };
}

function verifier(app) {
  const ko = [];
  let m;
  try { m = mesurer(app); } catch (e) { return ['peindreTrending : ' + e.message]; }
  if (m.vues !== m.avecUnites.length) ko.push('actions a unites rendues : ' + m.vues + ' sur ' + m.avecUnites.length);
  const t = m.rangs.find((li) => adrDe(li) === TSLA);
  if (!t) ko.push('TSLAc absente de la liste visible');
  else {
    if (!/>Buy</.test(t)) ko.push('TSLAc rendue sans Buy (route achetable servie)');
    if (!/<span class="trRang">180<\/span>/.test(t)) ko.push('TSLAc : le rang affiche n est pas son rang vrai (180) : ' + (/<span class="trRang">(\d+)/.exec(t) || [])[1]);
  }
  /* les 50 premieres restent les 50 premieres, dans l ordre */
  const premieres = m.rangs.filter((li) => /class="filL trLigne"/.test(li)).slice(0, 50).map((li) => +(/<span class="trRang">(\d+)/.exec(li) || [])[1]);
  if (premieres.some((r, k) => r !== k + 1)) ko.push('les 50 premieres lignes ne sont plus 1..50');
  const plus = /Show more \((\d+)\)/.exec(m.html);
  const lignesVues = m.rangs.filter((li) => /class="filL trLigne"/.test(li)).length;
  if (!plus || +plus[1] !== PROD.lignes.length - lignesVues) ko.push('« Show more » ne compte pas ce qui reste cache (' + (plus && plus[1]) + ' pour ' + (PROD.lignes.length - lignesVues) + ')');
  /* les actions sans ligne DexScreener : nom + raison, et le compte dans la note */
  const sans = m.avecUnites.filter((x) => !PROD.lignes.some((l) => l.adr.toLowerCase() === x.adr));
  for (const x of sans) {
    const li = m.rangs.find((r) => adrDe(r) === x.adr);
    if (!li) { ko.push((x.sym || x.adr) + ' (sans ligne) : absente'); continue; }
    if (!/<p class="note trRaison">[^<]{12,}<\/p><\/li>$/.test(li)) ko.push((x.sym || x.adr) + ' (sans ligne) : pas de raison en derniere ligne');
    if (/>Buy</.test(li)) ko.push((x.sym || x.adr) + ' (sans ligne) : un Buy sans ligne de marche');
  }
  if (!new RegExp(m.avecUnites.length + ' with units in circulation').test(m.note)) ko.push('la note ne dit pas le compte des actions a unites (' + m.note.slice(0, 300) + ')');
  if (!new RegExp(sans.length + ' without a market row').test(m.note)) ko.push('la note ne dit pas les ' + sans.length + ' sans ligne');
  /* la raison MESUREE servie (serveur-web.js : `phrase` sur actionsChaine.liste, ajoutee ce jour) l emporte sur le repli generique */
  const d2 = JSON.parse(JSON.stringify(PROD));
  const x = d2.actionsChaine.liste.find((y) => y.adr === (sans[0] && sans[0].adr));
  if (x) {
    x.phrase = 'No buy: its pool this app\'s router can reach holds $4.94 of USDC (under $500).';
    const r = lis(peindre(app, d2).html).find((li) => adrDe(li) === x.adr) || '';
    if (!r.includes(enTexte(x.phrase))) ko.push('la raison mesuree servie n est pas dite sous ' + x.sym);
  }
  return ko;
}

let n = 0;
const vu = (c, msg) => { if (!c) { console.log('KO ' + msg); process.exitCode = 1; } n += 1; };
vu(PROD.lignes.some((l) => l.adr.toLowerCase() === TSLA && l.routeAction && l.routeAction.achetable), 'la photo de prod sert TSLAc avec une route achetable');
const ko = verifier(APP);
if (ko.length) console.log('  ' + ko.join('\n  '));
try { const m = mesurer(APP); console.log('  mesure : ' + m.vues + '/' + m.avecUnites.length + ' actions a unites visibles par defaut ; ' + m.rangs.filter((li) => /class="filL trLigne/.test(li)).length + ' lignes rendues'); } catch (_) {}
vu(ko.length === 0, 'chaque action a unites est visible par defaut (ligne ou raison), TSLAc avec Buy et son rang vrai, « Show more » juste, la note compte');

const MUTANTS = [
  ['les actions sont de nouveau coupees a 50', 'toutes.filter((l, k) => k < trAffiches || l.routeAction)', 'toutes.slice(0, trAffiches)'],
  ['le rang redevient la position a l ecran', "'<span class=\"trRang\">' + (rang.get(l) + 1) + '</span>'", "'<span class=\"trRang\">' + (i + 1) + '</span>'"],
  ['les actions sans ligne ne sont plus rendues', 'const sansLigne = (d.actionsChaine && Array.isArray(d.actionsChaine.liste))', 'const sansLigne = (false)'],
  ['la raison servie est ignoree', "(typeof x.phrase === 'string' && x.phrase ? x.phrase", "(false ? x.phrase"],
  ['« Show more » recompte sur la coupe', 'const cachees = toutes.length - lignes.length;', 'const cachees = toutes.length - trAffiches;'],
];
let tues = 0;
for (const [nom, de, a] of MUTANTS) {
  if (APP.split(de).length !== 2) { vu(false, 'mutant « ' + nom + ' » : ancre absente ou multiple'); continue; }
  const k = verifier(APP.replace(de, a));
  if (process.env.VERBEUX) console.log('  [mutant] ' + nom + ' -> ' + String(k[0]).slice(0, 160));
  vu(k.length > 0, 'mutant « ' + nom + ' » : ROUGE');
  if (k.length) tues += 1;
}
if (process.exitCode) { console.log('KO market-actions-visibles'); process.exit(1); }
console.log('ok market-actions-visibles - ' + n + ' assertions, ' + tues + '/' + MUTANTS.length + ' mutants tues ; NE PROUVE PAS le rendu (navigateur a part)');
