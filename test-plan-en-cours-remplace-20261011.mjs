/* test-plan-en-cours-remplace-20261011.mjs - « Building the plan. » NE RESTE PAS AU-DESSUS D UN REFUS (panneau, echange par /api/rails/plan).
 * Prod 20261011-sent-retry-skins-market (QA Grok 17:47, Polytopia et UNALYN) : la ligne « Building the plan. » restait, le refus
 *   s ajoutait EN DESSOUS. Le motif juste existe deja (Bank, « enCours ») : l etape en cours devient son resultat ou disparait.
 * EXECUTE le bloc reel d app.html (de « Building the plan. » au premier return du refus) sur un faux DOM, plan REFUSE puis PRET.
 * NE PROUVE PAS : le rendu navigateur. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const src = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const d = src.search(/(?:const enCours = )?bcEtape\(m, 'Building the plan\u2026'\);/);
vu(d > 0, 'ligne Building the plan introuvable');
const bloc = src.slice(d, src.indexOf("bcBoutons(m, [['Try again', planifier, true]]);", d));
vu(/^const enCours = bcEtape\(m, 'Building the plan\u2026'\);/.test(bloc), 'ROUGE->VERT : l etape en cours n est pas gardee (const enCours = .)');
vu(/if \(enCours\) \{ if \(p\.etat === 'PRET' \|\| p\.etat === 'APPROBATIONS'\) enCours\.textContent = 'Plan built\.'; else enCours\.remove\(\); \}/.test(bloc),
  'ROUGE->VERT : au refus, « Building the plan. » n est ni remplace ni retire');
/* comportement : faux ul */
const faire = (etat) => {
  const lis = [];
  const bcEtape = (m, texte) => { const li = { textContent: texte, remove() { lis.splice(lis.indexOf(li), 1); } }; lis.push(li); return li; };
  const enCours = bcEtape(null, 'Building the plan\u2026');
  const p = { etat };
  const ligne = (bloc.match(/if \(enCours\) \{[^\n]*\}/) || [''])[0];
  new Function('enCours', 'p', ligne)(enCours, p);
  if (etat !== 'PRET') bcEtape(null, 'Refused - Not tradable here yet. Nothing was sent.');
  return lis.map((x) => x.textContent);
};
const ko = faire('REFUSE');
vu(ko.length === 1 && !/Building the plan/.test(ko.join()), 'refus : ' + JSON.stringify(ko));
const ok = faire('PRET');
vu(ok.length === 1 && ok[0] === 'Plan built.', 'pret : ' + JSON.stringify(ok));
console.log('OK test-plan-en-cours-remplace-20261011 : ' + n + ' assertions');