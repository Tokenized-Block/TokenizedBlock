/* test-ligne-raison-20261025.mjs - UNE LIGNE DU MARKET SANS BUY NE COMPRIME JAMAIS LE NOM ET LES CHIFFRES.
 * Phil (captures du 2026-10-25) : BUDc, NIOc rendus UNE LETTRE PAR LIGNE. Cause : la raison sans Buy (« No buy: on the pool this app's
 *   router can reach, what 10 USDC buys sells for 9.41 USDC… ») etait DANS .trBoutons (flex:0 0 auto) : sa largeur max-content prenait la
 *   rangee et ecrasait .trInfo (min-width:0) a quelques pixels. Correctif : la raison est un <p class="note trRaison"> enfant de la ligne,
 *   APRES .trBoutons, sur sa propre ligne (flex-wrap + flex-basis 100 %), et .trInfo garde 64 px au moins.
 * CE BANC : (A) EXECUTE le gabarit REEL de la ligne (peindreTrending, extrait de app.html) sur des lignes REELLES de /api/trending lues le
 *   2026-10-25 (mesures/trending-raisons-longues-20261025.json : LIc = la raison la plus longue servie, 179 caracteres ; BUDc ; NIOc ;
 *   NVDAc, temoin avec Buy) ; (B) lit la cascade CSS de la ligne (derniere regle gagnante) ; (C) mutants sur des COPIES du texte.
 * La GEOMETRIE (largeur de .trInfo a 375 et 1280 px) est mesuree a part dans un vrai navigateur ; ce banc NE PROUVE PAS le rendu. */
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
const FIX = JSON.parse(fs.readFileSync(path.join(ICI, 'mesures', 'trending-raisons-longues-20261025.json'), 'utf8')).lignes;
const enTexte = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ACTIONS_PAR_ADR = new Set(ACTIONS_COINBASE.map((a) => String(a.adr).toLowerCase()));

/* le gabarit de la ligne : « ul.innerHTML = lignes.map((l, i) => ( … ).join('') » dans peindreTrending, et son `pct` */
function gabarit(app) {
  const p = app.indexOf('function peindreTrending() {');
  if (p < 0) throw new Error('peindreTrending introuvable');
  const a = app.indexOf('ul.innerHTML = lignes.map((l, i) => (', p), b = app.indexOf("})() + '</li>').join('')", a);
  const q0 = app.indexOf('  const pct = (v) =>', p), q1 = app.indexOf('\n', q0);
  if (a < 0 || b < 0 || q0 < 0 || q0 > a) throw new Error('gabarit de ligne introuvable');
  const expr = app.slice(a + 'ul.innerHTML = '.length, b + "})() + '</li>').join('')".length);
  const f = new Function('lignes', 'enTexte', 'dessin', 'usdCourt', 'poolDecouvertPour', 'avecPoolAction', 'verdictRoutage', 'ACTIONS_PAR_ADR', 'LIQ_MIN_BUY_USD', 'TBLOCK', 'raisonSansBuy',
    "const trTri = 'h24', actifs = 0, bouge = (l) => (l.volume1hUsd || 0) > 0;\n" + app.slice(q0, q1) + '\nreturn ' + expr + ';');
  return (lignes) => f(lignes, enTexte, () => '<svg></svg>', (v) => '$' + Number(v || 0).toFixed(0), () => null, avecPoolAction, verdictRoutage, ACTIONS_PAR_ADR, 500, TBLOCK, raisonSansBuy);
}
const lis = (html) => html.split('<li class="filL trLigne"').slice(1).map((x) => '<li class="filL trLigne"' + x);

/* la cascade : les declarations des regles dont le selecteur est EXACTEMENT `sel`, hors @media ou dans un @media (max-width:N) qui
 *   s applique a `largeur` — la derniere gagne (meme specificite) */
function cascade(app, sel, largeur) {
  const css = app.slice(app.indexOf('<style>'), app.indexOf('</style>'));
  const out = {};
  let media = null, prof = 0, i = 0;
  const re = /@media\s*\(max-width:(\d+)px\)\s*\{|\}|([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1]) { media = Number(m[1]); prof = 1; continue; }
    if (m[0] === '}') { if (prof) { media = null; prof = 0; } continue; }
    if (media !== null && largeur > media) continue;
    const sels = m[2].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim());
    if (!sels.includes(sel)) continue;
    for (const d of m[3].split(';')) { const k = d.indexOf(':'); if (k > 0) out[d.slice(0, k).trim()] = d.slice(k + 1).trim(); }
    i += 1;
  }
  return out;
}

function verifier(app) {
  const ko = [];
  let html;
  try { html = gabarit(app)(FIX); } catch (e) { return ['gabarit : ' + e.message]; }
  const rangs = lis(html);
  if (rangs.length !== FIX.length) return ['lignes rendues : ' + rangs.length + ' pour ' + FIX.length];
  for (const [k, l] of FIX.entries()) {
    const li = rangs[k];
    const sb = /<span class="trBoutons">([\s\S]*?)<\/span>/.exec(li);
    const buy = />Buy</.test(li);
    if (l.sym === 'NVDAc') { if (!buy) ko.push('NVDAc (temoin) : plus de Buy'); if (/trRaison/.test(li)) ko.push('NVDAc : une raison sur une ligne avec Buy'); continue; }
    if (buy) { ko.push(l.sym + ' : un Buy sur une ligne refusee'); continue; }
    const phrase = enTexte(l.routeAction.phrase);
    const r = li.indexOf('<p class="note trRaison">' + phrase + '</p>');
    if (r < 0) { ko.push(l.sym + ' : la raison servie n est pas un <p class="note trRaison"> (« ' + li.slice(-260) + ' »)'); continue; }
    if (sb && /No buy|trRaison/.test(sb[1])) ko.push(l.sym + ' : la raison est DANS .trBoutons (flex:0 0 auto : elle prend la rangee)');
    if (sb && li.indexOf(sb[0]) > r) ko.push(l.sym + ' : la raison avant les boutons');
    if (!/<div class="trInfo"><p class="filT"><b>/.test(li) || !li.includes('<b>' + enTexte(l.sym) + '</b>')) ko.push(l.sym + ' : le nom n est plus dans .trInfo');
    if (!li.endsWith('</p></li>')) ko.push(l.sym + ' : la raison n est pas le dernier enfant de la ligne');
  }
  for (const w of [375, 1280]) {
    const ligne = cascade(app, '.trLigne', w), info = { ...cascade(app, '.trInfo', w), ...cascade(app, '.trLigne .trInfo', w) }, rs = cascade(app, '.trLigne .trRaison', w);
    if (ligne['flex-wrap'] !== 'wrap') ko.push(w + ' px : .trLigne ne passe pas a la ligne (flex-wrap ' + ligne['flex-wrap'] + ')');
    if (!/^1 0 100%$/.test(rs.flex || '')) ko.push(w + ' px : .trRaison n a pas sa ligne pleine largeur (flex ' + rs.flex + ')');
    if (rs['min-width'] !== '0' || rs['overflow-wrap'] !== 'anywhere') ko.push(w + ' px : .trRaison peut deborder (min-width ' + rs['min-width'] + ', overflow-wrap ' + rs['overflow-wrap'] + ')');
    if (!(parseFloat(info['min-width']) >= 64)) ko.push(w + ' px : .trInfo peut etre ecrase (min-width ' + info['min-width'] + ')');
  }
  return ko;
}

let n = 0;
const vu = (c, m) => { if (!c) { console.log('KO ' + m); process.exitCode = 1; } n += 1; };
const ko = verifier(APP);
if (ko.length) console.log('  ' + ko.join('\n  '));
vu(ko.length === 0, 'les vraies lignes (LIc 179 car., BUDc, NIOc, temoin NVDAc) : raison sur sa ligne, hors .trBoutons ; cascade 375 / 1280 px');
vu(FIX.find((l) => l.sym === 'LIc').routeAction.phrase.length >= 170, 'la fixture porte la raison la plus longue servie (LIc)');
if (process.env.ECRIRE_LIGNES) fs.writeFileSync(process.env.ECRIRE_LIGNES, gabarit(APP)(FIX));

const MUTANTS = [
  ['la raison revient dans .trBoutons', "return pairable ? '<span class=\"trBoutons\">' + pairer + '</span>' + raison : raison;", "return pairable ? '<span class=\"trBoutons\">' + raison + pairer + '</span>' : raison;"],
  ['la raison redevient un <span> sans classe', "const raison = '<p class=\"note trRaison\">' + enTexte(raisonSb.phrase) + '</p>';", "const raison = '<span class=\"note\" style=\"margin:0\">' + enTexte(raisonSb.phrase) + '</span>';"],
  ['la rangee ne passe plus a la ligne', '.trLigne{flex-wrap:wrap}\n', '\n'],
  ['la raison sans sa base pleine largeur', '.trLigne .trRaison{flex:1 0 100%;', '.trLigne .trRaison{flex:0 1 auto;'],
  ['.trInfo ecrasable', '.trLigne .trInfo{min-width:64px}\n', '\n'],
];
let tues = 0;
for (const [nom, de, a] of MUTANTS) {
  if (APP.split(de).length !== 2) throw new Error('mutant « ' + nom + ' » : ancre absente ou multiple');
  const k = verifier(APP.replace(de, a));
  if (process.env.VERBEUX) console.log('  [mutant] ' + nom + ' -> ' + String(k[0]).slice(0, 160));
  vu(k.length > 0, 'mutant « ' + nom + ' » : ROUGE');
  if (k.length) tues += 1;
}
if (process.exitCode) { console.log('KO ligne-raison'); process.exit(1); }
console.log('ok ligne-raison - ' + n + ' assertions, ' + tues + '/' + MUTANTS.length + ' mutants tues ; NE PROUVE PAS la geometrie (mesuree a part dans un navigateur)');
