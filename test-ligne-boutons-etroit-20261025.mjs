/* test-ligne-boutons-etroit-20261025.mjs - EN LARGEUR ETROITE, LES BOUTONS BUY / PAIR D UNE LIGNE DU MARKET PASSENT SOUS LE TEXTE, ET
 *   CHAQUE BOUTON RESTE DANS SA RANGEE.
 * Testeur live (2026-10-25, game44, 375 px) : BUDc / NIOc (et MPLX, AMDc) — nom et chiffres ecrases dans ~50 px, les boutons « Buy » /
 *   « Pair a block with it » prenant la largeur. Corrige en 2f201c5 (boutons sous le texte sous 560 px).
 * ⛔⛔ REVUE ADVERSE de 2f201c5 (2026-10-25) : a 320 px, les 22 lignes « Buy » + « Pair a block with it » DEBORDENT de leur rangee.
 *   `.trBoutons` garde `flex:0 0 auto` (regle de base) : sa largeur reste celle de son contenu (58 + 6 + 144 = 208 px) dans 180 px, et son
 *   `flex-wrap:wrap` n agit jamais. L ancien banc ne lisait QUE des regles CSS : avec wrap -> nowrap sur une copie, il restait VERT.
 * MESURE AU NAVIGATEUR (panneau navigateur integre, app.html servi en statique, /api/trending = photo de prod 18:43Z
 *   mesures/trending-prod-20261025-tslac.json ; boite de chaque BOUTON contre la boite de contenu de SA rangee li.trLigne) :
 *     2f201c5, 320 px : 22/69 lignes hors rangee, pire +28 px ; mutant nowrap (apres correctif), 320 px : 22/69, +28 px.
 *     corrige, 320 px : 0/69, pire -36 px (Pair passe sous Buy sur 22 lignes) ; 350 px : 0/69, -3 px ; 375 px : 0/69, -27 px (cote a cote) ;
 *     1280 px : 0/69, boutons a droite (69/69 a cote du texte). Texte (.trInfo) : 180 px a 320, 211 a 350, 236 a 375, 537 a 1280.
 *     Raison derniere ligne : 70/70 a chaque largeur. Rangee (contenu) : 254 px a 320, 285 a 350, 310 a 375. Boutons : Buy 57,8, Pair 144,4.
 * CE BANC (node, sans navigateur) : (1) la cascade CSS de app.html a 320/375/1280 px ; (2) un MODELE de la boite flex des boutons sous
 *   560 px (base, grow/shrink, min-width auto = min-content, wrap ou non, retrait 74 px), alimente par les largeurs MESUREES ci-dessus,
 *   qui place chaque bouton et le compare a sa rangee. Le modele est ETALONNE : il doit redonner les chiffres du navigateur (+28 sur 2f201c5,
 *   -36 / -27 corrige) — s il s en ecarte de plus de 1 px, le banc est rouge (le modele, pas le code, serait faux). Mutants sur des COPIES.
 * NE PROUVE PAS : une autre police ou d autres libelles (largeurs epinglees) ; la geometrie se re-mesure au navigateur. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const APP = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');

/* mesures du navigateur (voir l en-tete) */
const BOUTONS = [57.8, 144.4];                       /* Buy, Pair a block with it (sous 560 px) */
const RANGEE = { 320: 254, 350: 285, 375: 310 };     /* largeur du contenu de li.trLigne */
const NAVIGATEUR = { corrige: { 320: -36, 350: -3, 375: -27 }, base2f201c5: { 320: 28 } };

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
const fusion = (app, w, ...sels) => Object.assign({}, ...sels.map((s) => cascade(app, s, w)));
const flexDe = (v) => { const p = String(v || '0 1 auto').trim().split(/\s+(?![^(]*\))/); return { g: Number(p[0]), s: Number(p[1] ?? 1), base: p.slice(2).join(' ') || '0%' }; };
const px = (v) => (v === undefined || v === '' || v === 'auto' ? 0 : parseFloat(v));

/* le modele : ou finit chaque bouton d une ligne « Buy + Pair », relativement au bord gauche du contenu de la rangee, a la largeur w */
function placer(app, w) {
  const rangee = RANGEE[w];
  const bt = fusion(app, w, '.trBoutons', '.trLigne > .trBoutons');
  const ach = fusion(app, w, '.trAcheter', '.trLigne > .trAcheter');
  const fb = flexDe(bt.flex), fa = flexDe(ach.flex);
  if (fa.s !== 0) throw new Error('modele : un bouton qui retrecit (flex ' + ach.flex + ') — re-mesurer au navigateur, le modele ne le couvre pas');
  const gap = px(bt.gap), marge = px(bt['margin-left']);
  const enLigne = (bt['flex-direction'] || 'row') === 'row';
  const contenu = enLigne ? BOUTONS.reduce((s, b) => s + b, 0) + gap * (BOUTONS.length - 1) : Math.max(...BOUTONS);
  const plie = enLigne && bt['flex-wrap'] === 'wrap';
  const minContenu = plie || !enLigne ? Math.max(...BOUTONS) : contenu;
  const mini = bt['min-width'] === '0' || bt['min-width'] === '0px' ? 0 : bt['min-width'] && bt['min-width'] !== 'auto' ? px(bt['min-width']) : minContenu;
  const calc = /^calc\(100% - (\d+(?:\.\d+)?)px\)$/.exec(fb.base);
  const base = fb.base === 'auto' || fb.base === 'content' ? contenu : calc ? rangee - Number(calc[1]) : /%$/.test(fb.base) ? rangee * parseFloat(fb.base) / 100 : px(fb.base);
  const dispo = rangee - marge;   /* seule sur sa ligne (order 1, le texte prend la premiere) */
  let taille = base;
  if (base > dispo && fb.s > 0) taille = Math.max(dispo, mini);
  else if (base < dispo && fb.g > 0) taille = dispo;
  /* les boutons dans la boite : lignes gloutonnes si wrap, une seule sinon (ils ne retrecissent pas) */
  const fins = [];
  let x = 0;
  for (const b of BOUTONS) {
    if (enLigne) {
      if (plie && x > 0 && x + gap + b > taille + 1e-9) x = 0;
      const debut = x > 0 ? x + gap : 0;
      fins.push(marge + debut + b); x = debut + b;
    } else fins.push(marge + b);
  }
  return { rangee, taille, pire: Math.max(...fins) - rangee, plie: enLigne && fins.length === 2 && Math.abs(fins[1] - BOUTONS[1] - marge) < 1e-6 };
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
  /* chaque bouton dans sa rangee, a 320 / 350 / 375 px */
  for (const w of [320, 350, 375]) {
    let p;
    try { p = placer(app, w); } catch (e) { ko.push(w + ' px : ' + e.message); continue; }
    if (p.pire > 0.5) ko.push(w + ' px : un bouton sort de sa rangee de ' + p.pire.toFixed(1) + ' px (boite des boutons ' + p.taille.toFixed(1) + ' px dans ' + (p.rangee - 74) + ')');
  }
  /* le large garde la rangee d avant : boutons a droite, sans retrait */
  const bt = cascade(app, '.trLigne > .trBoutons', 1280);
  if (bt.order || bt['margin-left']) ko.push('1280 px : les boutons passent dessous aussi en large');
  return ko;
}

let n = 0;
const vu = (c, m) => { if (!c) { console.log('KO ' + m); process.exitCode = 1; } n += 1; };

/* etalonnage : le modele redonne les chiffres du navigateur, sur le code d aujourd hui ET sur la regle de 2f201c5 */
const AVANT = ['.trLigne > .trBoutons{flex-direction:row;flex-wrap:wrap;flex:1 1 calc(100% - 74px);min-width:0}', '.trLigne > .trBoutons{flex-direction:row;flex-wrap:wrap}'];
vu(APP.split(AVANT[0]).length === 2, 'ancre de la regle des boutons trouvee une fois');
const APP_2F = APP.replace(AVANT[0], AVANT[1]);
for (const [nom, app, attendu] of [['corrige', APP, NAVIGATEUR.corrige], ['2f201c5', APP_2F, NAVIGATEUR.base2f201c5]]) {
  for (const [w, v] of Object.entries(attendu)) {
    const p = placer(app, Number(w));
    vu(Math.abs(p.pire - v) <= 1, 'etalonnage ' + nom + ' ' + w + ' px : modele ' + p.pire.toFixed(1) + ' px, navigateur ' + v + ' px');
  }
}
const p320 = placer(APP, 320), p375 = placer(APP, 375);
vu(p320.plie && !p375.plie, 'a 320 px « Pair » passe sous « Buy », a 375 px ils tiennent cote a cote');

const ko = verifier(APP);
if (ko.length) console.log('  ' + ko.join('\n  '));
vu(ko.length === 0, 'a 320/350/375 px : texte pleine largeur, boutons dessous (retrait 74 px) ET dans leur rangee, raison derniere ; 1280 px inchange');
const MUTANTS = [
  ['plus de bloc etroit', '@media (max-width:560px){\n  .trLigne .trInfo{flex:1 1 calc(100% - 74px)}', '@media (max-width:1px){\n  .trLigne .trInfo{flex:1 1 calc(100% - 74px)}'],
  ['le texte ne prend plus la ligne', '.trLigne .trInfo{flex:1 1 calc(100% - 74px)}', '.trLigne .trInfo{flex:1}'],
  ['le Buy seul reste a cote', '.trLigne > .trBoutons,.trLigne > .trAcheter{order:1;margin-left:74px}', '.trLigne > .trBoutons{order:1;margin-left:74px}'],
  ['boutons en colonne', AVANT[0], AVANT[0].replace('flex-direction:row;', '')],
  ['la regle de 2f201c5 (flex 0 0 auto garde)', AVANT[0], AVANT[1]],
  ['les boutons ne passent plus a la ligne (nowrap)', AVANT[0], AVANT[0].replace('flex-wrap:wrap', 'flex-wrap:nowrap')],
];
let tues = 0;
for (const [nom, de, a] of MUTANTS) {
  if (APP.split(de).length !== 2) { vu(false, 'mutant « ' + nom + ' » : ancre absente ou multiple'); continue; }
  const k = verifier(APP.replace(de, a));
  if (process.env.VERBEUX) console.log('  [mutant] ' + nom + ' -> ' + String(k[0]));
  vu(k.length > 0, 'mutant « ' + nom + ' » : ROUGE');
  if (k.length) tues += 1;
}
if (process.exitCode) { console.log('KO ligne-boutons-etroit'); process.exit(1); }
console.log('ok ligne-boutons-etroit - ' + n + ' assertions, ' + tues + '/' + MUTANTS.length + ' mutants tues ; modele etalonne sur le navigateur (320 : +28 avant, '
  + p320.pire.toFixed(1) + ' px apres ; 375 : ' + p375.pire.toFixed(1) + ' px)');
