// test-denim-index-20261105.mjs — L AGE DES VIGNETTES (index.html ageDepuisBlocs) N EST PLUS `ecart * 2`.
// AFFIRME (EXECUTION de la fonction extraite) : au temps mesure 2 s et 0,2 s, l age juste ; sans temps mesure -> en BLOCS ; mutant
//   `ecart * 2` TUE. ⚠️ index.html est redirigee (/#creer ; 301 serveur sur /index.html) : la galerie n est pas montree aux visiteurs, et
//   l appel ne passe donc aucun temps (blocs). NE PROUVE PAS : un rendu navigateur.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let n = 0;
const vu = (c, m) => { assert.ok(c, m); n++; };
const HTML = readFileSync(new URL('./index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function banc(html) {
  const rates = [];
  const ok = (c, m) => { if (!c) rates.push(m); };
  const i = html.indexOf('function ageDepuisBlocs('), j = html.indexOf('\n}\n', i);
  if (!(i > 0 && j > i)) return ['ageDepuisBlocs introuvable'];
  const age = new Function(html.slice(i, j + 2) + '\nreturn ageDepuisBlocs;')();
  ok(age(9000, 2) === '5 h', '2 s : 9 000 blocs = 5 h (lu ' + age(9000, 2) + ')');
  ok(age(9000, 0.2) === '30 min', '0,2 s : 9 000 blocs = 30 min (lu ' + age(9000, 0.2) + ')');
  ok(age(9000) === '9,000 blocks' && age(9000, null) === '9,000 blocks' && age(1) === '1 block', 'non mesure : en blocs (lu ' + age(9000) + ')');
  ok(age(-1, 2) === null, 'ecart negatif : null (inchange)');
  return rates;
}
const r0 = banc(HTML);
vu(r0.length === 0, 'vert : ' + r0.join(' | '));
const de = 'const s = ecart * sParBloc;';
assert.ok(HTML.includes(de), 'ancre');
const r1 = banc(HTML.replace(de, 'const s = ecart * 2;').replace("if (!(typeof sParBloc === 'number'", "if (false && !(typeof sParBloc === 'number'"));
vu(r1.length > 0, 'mutant TUE — ecart * 2 sans garde (' + r1[0] + ')');
console.log('ok denim-index — ' + n + ' assertions, 1/1 mutant tue ; NE PROUVE PAS un rendu navigateur (page redirigee)');
