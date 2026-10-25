/* test-ligne-boutons-etroit-20261025.mjs - EN LARGEUR ETROITE, LES BOUTONS BUY / PAIR D UNE LIGNE DU MARKET PASSENT SOUS LE TEXTE.
 * Testeur live (2026-10-25, game44, 375 px) : BUDc / NIOc (et MPLX, AMDc) — nom et chiffres ecrases dans ~50 px, les boutons « Buy » /
 *   « Pair a block with it » prenant la largeur. MESURE LOCALE (serveur du worktree, photo /api/trending de prod, 375 x 812) avant le
 *   correctif : .trInfo = 81 px sur 69 lignes a boutons, boutons A COTE (0/69 dessous). Apres : 236 px a 375, 180 px a 320, 69/69 dessous,
 *   70/70 raisons en derniere ligne, 0 debordement ; a 1280 px inchange (0/69 dessous).
 * CE BANC lit la cascade CSS de app.html (derniere regle gagnante par selecteur, @media (max-width:N) applique a la largeur) a 320, 375 et
 *   1280 px ; mutants sur des COPIES du texte. NE PROUVE PAS la geometrie (mesuree dans un navigateur, chiffres ci-dessus). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');

function cascade(app, sel, largeur) {
  const css = app.slice(app.indexOf('<style>'), app.indexOf('</style>'));
  const out = {};
  let media = null, prof = 0;
  const re = /@media\s*\(max-width:(\d+)px\)\s*\{|\}|([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1]) { media = Number(m[1]); prof = 1; continue; }
    if (m[0] === '}') { if (prof) { media = null; prof = 0; } continue; }
    if (media !== null && largeur > media) continue;
    const sels = m[2].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim());
    if (!sels.includes(sel)) continue;
    for (const d of m[3].split(';')) { const k = d.indexOf(':'); if (k > 0) out[d.slice(0, k).trim()] = d.slice(k + 1).trim(); }
  }
  return out;
}

function verifier(app) {
  const ko = [];
  for (const w of [320, 375]) {
    const info = { ...cascade(app, '.trInfo', w), ...cascade(app, '.trLigne .trInfo', w) };
    const bt = cascade(app, '.trLigne > .trBoutons', w), ba = cascade(app, '.trLigne > .trAcheter', w), rs = cascade(app, '.trLigne .trRaison', w);
    if (!/^1 1 calc\(100% - 74px\)$/.test(info.flex || '')) ko.push(w + ' px : .trInfo ne prend pas la premiere ligne (flex ' + info.flex + ')');
    for (const [nom, r] of [['.trBoutons', bt], ['.trAcheter seul', ba]]) {
      if (r.order !== '1') ko.push(w + ' px : ' + nom + ' pas apres le texte (order ' + r.order + ')');
      if (r['margin-left'] !== '74px') ko.push(w + ' px : ' + nom + ' sans le retrait du texte (margin-left ' + r['margin-left'] + ')');
    }
    if (bt['flex-direction'] !== 'row') ko.push(w + ' px : les boutons restent en colonne');
    if (rs.order !== '1' || !/^1 0 100%$/.test(rs.flex || '')) ko.push(w + ' px : la raison n est plus la derniere ligne pleine largeur');
  }
  /* le large garde la rangee d avant : boutons a droite, sans retrait */
  const bt = cascade(APP === app ? app : app, '.trLigne > .trBoutons', 1280);
  if (bt.order || bt['margin-left']) ko.push('1280 px : les boutons passent dessous aussi en large');
  return ko;
}

let n = 0;
const vu = (c, m) => { if (!c) { console.log('KO ' + m); process.exitCode = 1; } n += 1; };
const ko = verifier(APP);
if (ko.length) console.log('  ' + ko.join('\n  '));
vu(ko.length === 0, 'a 320 et 375 px : texte pleine largeur, boutons dessous (retrait 74 px), raison derniere ; a 1280 px inchange');
const MUTANTS = [
  ['plus de bloc etroit', '@media (max-width:560px){\n  .trLigne .trInfo{flex:1 1 calc(100% - 74px)}', '@media (max-width:1px){\n  .trLigne .trInfo{flex:1 1 calc(100% - 74px)}'],
  ['le texte ne prend plus la ligne', '.trLigne .trInfo{flex:1 1 calc(100% - 74px)}', '.trLigne .trInfo{flex:1}'],
  ['le Buy seul reste a cote', '.trLigne > .trBoutons,.trLigne > .trAcheter{order:1;margin-left:74px}', '.trLigne > .trBoutons{order:1;margin-left:74px}'],
  ['boutons en colonne', '.trLigne > .trBoutons{flex-direction:row;flex-wrap:wrap}', '.trLigne > .trBoutons{flex-wrap:wrap}'],
];
let tues = 0;
for (const [nom, de, a] of MUTANTS) {
  if (APP.split(de).length !== 2) { vu(false, 'mutant « ' + nom + ' » : ancre absente ou multiple'); continue; }
  const k = verifier(APP.replace(de, a));
  vu(k.length > 0, 'mutant « ' + nom + ' » : ROUGE');
  if (k.length) tues += 1;
}
if (process.exitCode) { console.log('KO ligne-boutons-etroit'); process.exit(1); }
console.log('ok ligne-boutons-etroit - ' + n + ' assertions, ' + tues + '/' + MUTANTS.length + ' mutants tues ; geometrie mesuree a part (375 : 81 -> 236 px ; 320 : 180 px ; 0 debordement)');
