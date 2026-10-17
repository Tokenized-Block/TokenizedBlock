/* test-puce-learn.mjs — LE BOUTON « What am I looking at? » NE DOIT ETRE VIDE A AUCUNE LARGEUR.
 *
 * ⛔⛔ D OU VIENT CE FICHIER. Phil, 2026-09-30 : le bouton lisait « ? What am I looking at » — le
 *     point d interrogation EN TETE de la phrase. Il y etait pour une raison : `.tete .long` passe
 *     a `display:none` sous la media query etroite, et le « ? » nu, place HORS du span, etait tout
 *     ce qui restait sur telephone. Deplacer le « ? » a la fin sans rien d autre aurait donc VIDE
 *     le bouton sur mobile — une puce muette, pas une correction.
 *
 * ⛔⛔⛔ L INVARIANT QUE CE FICHIER GARDE, et il n est PAS visible en relecture : les deux libelles
 *      sont EXCLUSIFS et doivent basculer ENSEMBLE. Cacher l un sans montrer l autre laisse un
 *      bouton sans texte. C est la meme famille de faute que « une garde peut etre vraie et couvrir
 *      la mauvaise moitie » : la regle `display:none` etait correcte, sa contrepartie manquait.
 *
 * ⚠️ BORNE : ce fichier lit le TEXTE de la page. Il ne prouve pas qu un navigateur applique la
 *    media query, ni que le bouton soit cliquable, ni qu il ouvre Learn.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';

const brut = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const html = sansCommentaires(brut, { minRetire: 5000 });
let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

/* La balise du bouton, isolee du reste de la page. */
const balise = (() => {
  const i = html.indexOf('id="pLearn"');
  assert.ok(i > 0, 'le bouton #pLearn a disparu de la page');
  const debut = html.lastIndexOf('<button', i);
  const fin = html.indexOf('</button>', i);
  assert.ok(debut >= 0 && fin > debut, 'la balise de #pLearn est illisible');
  return html.slice(debut, fin + 9);
})();

cas('⛔ LE LIBELLE VISIBLE EST « ? » A TOUTE LARGEUR (Phil 2026-10-17 soir)', () => {
  /* ⛔ Phil, 2026-10-17 soir : « change "What am I looking at?" par "?" juste ca ». Le libelle LONG devient lui aussi « ? » ;
   *   la phrase complete reste le NOM ACCESSIBLE (aria-label, cas plus bas). Les gardes « jamais vide » et « bascule CSS » restent. */
  assert.match(balise, /<span class="long">\s*\?\s*<\/span>/, 'le libelle large n est plus « ? »');
});

cas('⛔⛔⛔ AUCUNE LARGEUR NE LAISSE LE BOUTON VIDE', () => {
  /* ⛔⛔ LE CAS CENTRAL. Sur petit ecran `.long` disparait ; il faut donc qu un `.court` existe et
   *     porte quelque chose. Sans lui, la puce est une pastille muette que personne ne clique. */
  assert.match(balise, /<span class="court">\s*\?\s*<\/span>/,
    'le libelle COURT est absent : sous la media query etroite, `.long` disparait et le bouton '
    + 'devient VIDE — c est la regression que ce fichier existe pour empecher');
  assert.match(balise, /<span class="long">[^<]+<\/span>/, 'le libelle LONG est absent ou vide');
  /* ⛔ ET RIEN HORS DES DEUX SPANS : un troisieme morceau de texte s afficherait aux DEUX largeurs
   *   et ferait reapparaitre le doublon (« ? What am I looking at? »). */
  const dedans = balise.replace(/<[^>]*>/g, '|');
  const morceaux = dedans.split('|').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(morceaux, ['?', '?'],
    'du texte vit HORS des deux spans : il s afficherait aux deux largeurs — ' + JSON.stringify(morceaux));
});

cas('⛔⛔⛔ LES DEUX REGLES CSS BASCULENT ENSEMBLE', () => {
  /* ⛔⛔ Le HTML peut etre parfait et le CSS montrer LES DEUX (« ? What am I looking at? ») ou
   *     AUCUN. On exige les deux regles, et elles sont la vraie garde. */
  assert.match(html, /\.tete \.court\{display:none\}/,
    'le libelle court n est pas cache par defaut : le large afficherait « ? What am I looking at? »');
  assert.match(html, /\.tete \.long\{display:none\}\s*\.tete \.court\{display:inline\}/,
    'dans la media query etroite, `.long` est cache SANS que `.court` soit montre : bouton vide');
});

cas('⛔ LE NOM ACCESSIBLE DIT CE QUE LE « ? » OUVRE', () => {
  /* ⛔ Depuis le 2026-10-17 soir l ecran ne montre que « ? » : un lecteur d ecran qui n annoncerait que « ? » ne dirait rien.
   *   Le nom accessible porte la phrase complete — c est la regle d un bouton-icone, pas une divergence. */
  const m = /aria-label="([^"]*)"/.exec(balise);
  assert.ok(m, 'le bouton n a plus d aria-label');
  assert.equal(m[1], 'What am I looking at?', 'le nom accessible du bouton « ? » ne dit plus ce qu il ouvre');
});

console.log('✓ test-puce-learn : ' + n + ' cas');
console.log('   Le « ? » est a la fin de la phrase, et la puce n est vide a AUCUNE largeur :');
console.log('   `.court` et `.long` basculent ensemble, et rien ne vit hors des deux.');
console.log('   ⚠️ NE PROUVE PAS qu un navigateur applique la media query ni que le bouton ouvre Learn.');
