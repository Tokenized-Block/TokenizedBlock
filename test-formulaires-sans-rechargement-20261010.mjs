/* test-formulaires-sans-rechargement-20261010.mjs - ENTREE DANS UN CHAMP DU PANNEAU NE RECHARGE JAMAIS LA PAGE (re-QA Grok Super : Entree dans la
 * recherche du panneau -> la Map ; et deux retours 'tout seuls' a la Map vide). CAUSE PROBABLE (lecture du code, NON reproduite en navigateur) :
 * les 3 seuls <form> de l app (recherche, composeur, ticket) n ont ni action ni garde HTML - leur preventDefault vit dans le script, pose
 * vers la ligne 23 500 d un module de 24 000 lignes. Tant qu il n est pas pose (chargement, ou une exception plus haut), Entree soumet le
 * formulaire en GET vers la page elle-meme : rechargement, et la page repart sur son onglet par defaut, la Map, vide.
 * AFFIRME : chaque <form> du document porte onsubmit="return false" (garde qui ne depend pas du script) et garde son ecouteur 'submit'.
 * NE PROUVE PAS : que c etait LA cause des deux retours a la Map (non reproduits) ; le comportement d un vrai navigateur.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const formes = [...html.matchAll(/<form\b[^>]*>/g)].map((m) => m[0]);
assert.ok(formes.length >= 3, 'formulaires introuvables : ' + formes.length);
for (const f of formes) {
  assert.ok(/\sonsubmit="return false"/.test(f), 'formulaire sans garde HTML (Entree recharge la page) : ' + f);
  const id = (f.match(/\sid="([^"]+)"/) || [])[1];
  assert.ok(id && html.includes("$('#" + id + "').addEventListener('submit'"), 'ecouteur submit perdu : ' + id);
}
console.log('ok formulaires-sans-rechargement - ' + formes.length + ' formulaires gardes ; NE PROUVE PAS la cause des retours a la Map');