/* test-panneau-poignee-20261011.mjs - LE BORD DU PANNEAU SE TIRE, COMME CELUI D UNE FENETRE WINDOWS.
 * Phil (2026-10-11) : « ajoute la fleche pour abaisser ou agrandir le control panel, la meme sur tel, pour que le user ajuste lui-meme »,
 *   puis « garde pas la fleche visible, affiche comme Windows pour les fenetres ».
 * EXECUTE bcBornerTaille (app.html, TB_APP = ancienne). AFFIRME : bornes (feuille 160 px .. hauteur utile ; colonne 300 .. 900 px en
 *   laissant 320 px a la page) ; une valeur illisible ne pose AUCUNE taille ; la taille d origine reste la valeur par defaut du CSS (var
 *   avec repli) ; replie, pas de poignee ; RIEN d affiche (pas de fleche), curseur systeme de redimensionnement ; un tap seul ne change
 *   rien, le double tap bascule maximum / origine ; localStorage toujours sous try/catch ; le clavier.
 * NE PROUVE PAS : le geste au doigt sur un vrai telephone (verifie au navigateur avec des PointerEvent).
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const fonction = (entete) => { const i = html.indexOf(entete); assert.ok(i > 0, 'introuvable : ' + entete); const f = /\r?\n\}/.exec(html.slice(i)); return html.slice(i, i + f.index + f[0].length); };
const borner = new Function(fonction('function bcBornerTaille(axe, v, ecranL, ecranH, nav) {') + '\nreturn bcBornerTaille;')();
/* telephone 375 x 812, onglets 67 px : utile = 812 - 67 - 56 = 689 */
vu(borner('h', 400, 375, 812, 67) === 400 && borner('h', 50, 375, 812, 67) === 160 && borner('h', 5000, 375, 812, 67) === 689 && borner('h', 400.6, 375, 812, 67) === 401, 'bornes de hauteur fausses');
vu(borner('w', 500, 1600, 900, 0) === 500 && borner('w', 10, 1600, 900, 0) === 300 && borner('w', 5000, 1600, 900, 0) === 900 && borner('w', 5000, 1000, 900, 0) === 680, 'bornes de largeur fausses');
for (const x of [null, undefined, '', 'abc', NaN]) vu(borner('h', x, 375, 812, 67) === null, 'une valeur illisible pose une taille : ' + String(x));
/* 200 - 67 - 56 = 77 < 160 : le minimum gagne (ma premiere version prenait 300 px de haut : 177 > 160, le cas n etait pas teste) */
vu(borner('h', 9999, 375, 200, 67) === 160 && borner('h', 9999, 375, 300, 67) === 177, 'petit ecran : le minimum doit gagner quand la hauteur utile passe sous 160');
/* CSS : la taille d origine reste le repli ; replie, pas de poignee ; rien d affiche */
vu(/height:var\(--bcHLibre,62dvh\)/.test(html) && /width:var\(--bcWLibre,min\(430px,calc\(100% - 24px\)\)\)/.test(html)
  && /width:var\(--bcWLibre,min\(480px,calc\(100% - 24px\)\)\)/.test(html) && /width:var\(--bcWLibre,clamp\(300px,36vw,430px\)\)/.test(html), 'la taille d origine n est plus le repli du CSS');
vu(/dialog\.bcPop\.bcReduit \.bcPoignee\{display:none\}/.test(html), 'replie, la poignee reste');
const div = /<div class="bcPoignee" id="bcPoignee"[^>]*>([\s\S]*?)<\/div>/.exec(html);
vu(div && div[1].trim() === '', 'une fleche (ou un texte) est affichee dans la poignee : « ' + (div && div[1].trim()) + ' »');
vu(/\.bcPoignee\{[^}]*background:transparent;cursor:ns-resize/.test(html) && /\.bcPoignee\{left:-8px;top:18px;bottom:18px;width:16px;cursor:ew-resize\}/.test(html), 'pas de curseur systeme de redimensionnement');
/* geste : un tap seul ne fait rien ; double tap = bascule ; localStorage sous try ; clavier */
const geste = html.slice(html.indexOf('(function bcPoigneeGeste() {'), html.indexOf('(function bcPoigneeGeste() {') + 4000);
vu(/if \(t - dernierTap < 350\) \{ dernierTap = 0; bcBasculerTaille\(axe\); return; \}\s*dernierTap = t;\s*\}\);/.test(geste), 'un tap seul change la taille (ou le double tap ne bascule plus)');
vu(/try \{ const o = JSON\.parse\(localStorage\.getItem\(BC_CLE_TAILLE\)/.test(html) && /if \(garder\) \{ try \{ const t = bcLireTailles\(\);/.test(html), 'localStorage hors try/catch');
vu(/ArrowUp: axe === 'h' \? 40 : 0/.test(geste) && /e\.key === 'Home'/.test(geste), 'le clavier ne redimensionne pas');
vu(/bcPoserTaille\(\); \/\* la place laissee a la page suit la nouvelle taille \*\//.test(fonction('function bcAppliquerTaille(axe, v, garder) {')), 'la page ne reserve pas la nouvelle taille');
console.log('ok panneau-poignee - ' + n + ' assertions ; NE PROUVE PAS le geste sur un vrai telephone');
