/* test-carte-pool-vide-sans-promesse-20261011.mjs - UN PLAN REFUSE EFFACE LES PROMESSES DE LA CARTE ; UNE L ACTIVE 0 N EN EFFACE AUCUNE.
 * Prod (2026-10-11, Polytopia 0xb200000000000000000000ad2ef5088ae83e5dac) : la carte disait a la fois « Cheapest of 2 pools . Fee 0.5% »
 *   ET « Not tradable here yet. Nothing was sent. » -> le refus du plan efface frais + « Cheapest of » (effacerPromessesCarte).
 * TEMOIN (Claude 15:15, mesure) : notre block 0xb200000000000000000000ab549fa65ad4edae3f a une L active 0 (naissance sans apport, prix au
 *   bord de la plage) ET un plan d achat PRET en prod (>= 953,97 blocks pour 1e13 wei, frais 50 bps). L active 0 n est PAS un marche
 *   vide : frais, « Cheapest of N pools » et routes restent affiches. (7119401 avait marcheVide qui les retirait : ce test le refuse.)
 * EXECUTE les lignes extraites d app.html (frais, cheapest, cliquables, effacerPromessesCarte) ; NE PROUVE PAS le rendu navigateur reel.
 * APP=chemin optionnel pour rejouer sur une autre version d app.html (preuve rouge). */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const src = readFileSync(process.env.APP || new URL('./app.html', import.meta.url), 'utf8');
const finDe = (d) => { const m = /\r?\n\}/.exec(src.slice(d)); return d + m.index + m[0].length; };
/* refus : efface frais + cheapest */
vu(/if \(p\.etat === 'REFUSE'\) \{\s*e\.className = 'note wKo';\s*effacerPromessesCarte\(\);/.test(src), 'le refus laisse le frais et « Cheapest of » affiches');
const d2 = src.indexOf('function effacerPromessesCarte(');
vu(d2 > 0, 'effacerPromessesCarte absente');
const els = { '#peFrais': { textContent: 'Fee 0.51%+' }, '#peFraisTexte': { textContent: 'Cheapest of 2 pools we read on chain for this block.', hidden: false, innerHTML: 'x' } };
new Function('$', src.slice(d2, finDe(d2)) + '\neffacerPromessesCarte();')((s) => els[s] || null);
vu(els['#peFrais'].textContent === '' && els['#peFraisTexte'].hidden === true && els['#peFraisTexte'].innerHTML === '', 'le refus garde une promesse : ' + JSON.stringify(els));
/* TEMOIN : L active 0 mais plan PRET -> frais, cheapest et routes restent */
const v = { etat: 'LUE', liquidite: 0n, cle: { fee: 5000 } };
const ligne = (re, quoi) => { const m = re.exec(src); vu(!!m, quoi + ' : ligne introuvable'); return m[0]; };
const lFrais = ligne(/\$\('#peFrais'\)\.textContent = [^\n;]*;/, 'frais');
const fe = { textContent: '' };
new Function('$', 'bb', 'vide', 'v', 'lf', 'marcheVide', lFrais)(() => fe, false, true, v, { court: 'Fee 0.5%' }, (x) => !!x && x.liquidite === 0n);
vu(fe.textContent === 'Fee 0.5%', 'TEMOIN : L active 0 + plan PRET, le frais disparait (' + JSON.stringify(fe.textContent) + ')');
const lCh = ligne(/if \([^\n]*combien > 1\) \{/, 'cheapest');
const ch = new Function('bb', 'vide', 'combien', 'v', lCh + ' return true; } return false;')(false, true, 2, v);
vu(ch === true || !/vide/.test(lCh), 'TEMOIN : L active 0 + plan PRET, « Cheapest of 2 pools » disparait');
vu(!/vide/.test(lCh), 'TEMOIN : « Cheapest of » depend encore d une L active');
const lCl = ligne(/const cliquables = [^\n;]*;/, 'routes');
const cl = new Function('r', 'offrable', 'v', 'marcheVide', lCl + ' return cliquables;')({ devises: [{ s: 'ETH' }, { s: 'USDC' }] }, () => true, v, (x) => !!x && x.liquidite === 0n);
vu(cl.length === 2, 'TEMOIN : L active 0 + plan PRET, les routes (« USDC - routed ») disparaissent');
vu(!/function marcheVide\(|marcheVide\(v\)/.test(src), 'marcheVide (L active comme porte d affordance) est de retour');
console.log('OK test-carte-pool-vide-sans-promesse-20261011 : ' + n + ' assertions');
