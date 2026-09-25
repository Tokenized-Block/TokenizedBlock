/* test-achat-clic-vs-prepare.mjs — UN COMPTEUR NE PEUT PAS COMPTER LES DEUX BOUTS D UN ENTONNOIR.
 *
 * ⛔⛔ CE QUI A ETE VU EN PRODUCTION, 2026-09-25. Apres avoir clique « Buy » depuis Market sans
 *     wallet, l entonnoir a montre A LA FOIS :
 *         achat_prepare: 1   et   echange_refus_wallet: 1
 *     Or `achat_prepare` est ecrit APRES la garde du wallet dans `preparerEchange` : les deux ne
 *     pouvaient pas venir du meme endroit. Le nom servait DEUX sites et DEUX sens opposes —
 *     l intention (le clic dans Market) et le progres (les gardes passees).
 *
 * ⛔ POURQUOI C EST UN DEFAUT DE MESURE ET PAS UN DETAIL : 1 clic + 1 preparation = 2, exactement
 *   comme 2 clics sans aucune preparation. Un entonnoir dont un etage additionne son entree et sa
 *   sortie ne donne plus aucun taux — et c est precisement le taux qu on veut lire pour savoir si
 *   les onze compteurs de refus ajoutes ce soir servent a quelque chose.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que les deux compteurs sont poses au bon endroit du parcours.
 *   Il prouve qu ils sont DISTINCTS et ranges du bon cote de la garde du wallet. Le reste se lit
 *   dans /api/entonnoir, sur de vrais visiteurs.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('⛔⛔ `achat_prepare` n a plus qu UN seul site', () => {
  /* ⛔⛔ LE CAS CENTRAL. Deux sites, c est deux definitions du meme chiffre. */
  const sites = [...html.matchAll(/etape\('achat_prepare'\)/g)].length;
  assert.equal(sites, 1, 'achat_prepare est appele ' + sites + ' fois : le compteur redevient ambigu');
});

v('l intention a son propre nom, et il suit la convention de create_clic', () => {
  /* ⛔ `create_clic` dit deja l intention du cote creation. Un second vocabulaire pour la meme idee
   *   rendrait les deux moities de l entonnoir illisibles ensemble. */
  assert.match(html, /etape\('achat_clic'\)/, 'l intention d achat n est plus comptee');
  assert.match(html, /etape\('create_clic'\)/, 'la convention de reference a disparu');
  assert.ok(srv.includes("'achat_clic'"),
    'achat_clic manque dans ETAPES_ENTONNOIR : le serveur le jettera sans rien dire');
});

v('⛔ l intention est comptee AVANT la garde du wallet, la preparation APRES', () => {
  /* ⛔⛔ C est ce que la production a revele : les deux etaient du meme cote du nom, pas du meme cote
   *     de la garde. `achat_clic` doit pouvoir arriver seul (refus ensuite) ; `achat_prepare` ne
   *     doit JAMAIS arriver sans que les gardes soient passees. */
  const d = html.indexOf('async function preparerEchange(');
  assert.ok(d > 0, 'preparerEchange introuvable');
  let prof = 0, dans = null, corps = null;
  for (let k = html.indexOf('{', d); k < html.length; k++) {
    const c = html[k];
    if (dans) { if (c === dans && html[k - 1] !== '\\') dans = null; continue; }
    if (c === '"' || c === "'" || c === '`') { dans = c; continue; }
    if (c === '{') prof++;
    else if (c === '}' && !--prof) { corps = html.slice(d, k + 1); break; }
  }
  assert.ok(corps, 'les accolades de preparerEchange ne s equilibrent pas');
  const garde = corps.indexOf("etape('echange_refus_wallet')");
  const prep = corps.indexOf("etape('achat_prepare')");
  assert.ok(garde > 0, 'la garde du wallet n est plus comptee');
  assert.ok(prep > 0, 'achat_prepare a quitte preparerEchange');
  assert.ok(garde < prep,
    'achat_prepare est compte AVANT la garde du wallet : il compterait des preparations qui '
    + 'n ont jamais eu lieu');
  /* ⛔ et l intention n est PAS dans cette fonction : elle appartient au routeur de clics. */
  assert.ok(!corps.includes("etape('achat_clic')"),
    'l intention est comptee dans preparerEchange : elle compterait aussi les reprises internes');
});

assert.equal(n, 3, 'compte de cas inattendu : ' + n);
console.log('ok achat-clic-vs-prepare — ' + n + ' cas : intention et preparation separees, et');
console.log('   rangees des deux cotes de la garde du wallet.');
console.log('⚠️ LES TOTAUX D `achat_prepare` ANTERIEURS A CE BUILD MELANGENT LES DEUX SENS :');
console.log('   ils ne sont pas comparables a ceux d apres.');
