/* test-sorties-vie-comptees.mjs — UN BLOCK QUI NE PREND PAS VIE DOIT LAISSER UNE TRACE.
 *
 * ⛔⛔ LE TROU QUE CETTE GARDE FERME, mesure le 2026-09-24 sur la production.
 *     L entonnoir dit `cree` = 6 et `vivant` = 2 : deux blocks crees sur trois ne prennent jamais
 *     vie. Et `vie_echec` n apparaissait meme pas dans les totaux — les quatre perdus n avaient
 *     laisse AUCUNE trace. Sonde `mesure-sorties-mise-en-vie.mjs` : 21 points d arret dans la
 *     chaine, DEUX seulement comptaient quelque chose (dont la reussite). Dix-neuf portes muettes.
 *     ⇒ On savait que ca mourait. On ne pouvait pas savoir de quoi, ni ou — jamais, par
 *       construction. Un chemin d echec qui ne compte rien ne produira jamais de correction.
 *
 * ⛔ LA MESURE VIT DANS L ENTONNOIR, PAS DANS LES 19 SITES : ils passent tous par
 *   `vieAutoArreter()`. Dix-neuf edits auraient ete dix-neuf occasions d en oublier un, et le
 *   premier oubli aurait ete invisible.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que les compteurs monteront, ni qu ils diront la verite sur la
 *    cause. Il prouve que la sortie d echec est CABLEE et que la reussite n est pas comptee comme
 *    un echec. Les chiffres, eux, viendront de la production.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');
const src = nu(html);
let n = 0;
const v = (nom, fn) => { fn(); n++; };

const i = src.indexOf('function vieAutoArreter(');
assert.ok(i > 0, 'vieAutoArreter est introuvable : ce test ne garde plus rien');
const corps = src.slice(i, src.indexOf('\n}', i) + 2);

v('l entonnoir d arret compte un echec', () => {
  assert.match(corps, /etape\(\s*'vie_ko_etape'/,
    "vieAutoArreter ne compte plus rien : les 19 sorties d echec redeviennent muettes, et on ne "
    + "saura plus jamais pourquoi deux blocks sur trois ne prennent pas vie");
});

v('⛔ la REUSSITE n est pas comptee comme un echec', () => {
  /* ⛔⛔ Sans ce garde-fou, chaque block qui PREND vie gonflerait le compteur des morts — un
   *     instrument qui compte les succes comme des echecs est pire qu un instrument absent, parce
   *     qu il fabrique un probleme la ou il n y en a pas. */
  assert.match(corps, /if\s*\(\s*!\s*reussi/,
    'vieAutoArreter ne distingue plus la reussite de l echec');
  assert.match(src, /vieAutoArreter\(true\)/,
    "le chemin de succes n appelle plus vieAutoArreter(true) : chaque mise en vie reussie serait "
    + "comptee comme un echec");
});

v('⛔ on ne compte QUE si le parcours avait commence', () => {
  /* ⛔ Il existe des arrets defensifs — a l ouverture d un profil, par exemple. Sans ce filtre,
   *   chacun gonflerait le compteur d un echec qui n a jamais eu lieu. `etapeVieCourante > 0`
   *   veut dire qu au moins une etape a ete annoncee a l utilisateur. */
  assert.match(corps, /atteinte\s*>\s*0/,
    'vieAutoArreter compte meme quand aucun parcours n avait commence : les arrets defensifs '
    + 'fabriqueraient des echecs');
});

v('l etape se lit dans le texte deja affiche, et se remet a zero a la fin', () => {
  const j = src.indexOf('function majProgressionVie(');
  assert.ok(j > 0, 'majProgressionVie introuvable');
  const mp = src.slice(j, src.indexOf('\n}', j) + 2);
  assert.match(mp, /Step\\s\+\(\\d\)|Step\s*\\s\+/,
    "majProgressionVie ne lit plus le numero d etape : le compteur ne saurait plus OU ca meurt");
  assert.match(mp, /etapeVieCourante = 0/,
    'l etape ne se remet pas a zero : la mort d un parcours serait attribuee au suivant');
});

v('⛔ la cardinalite reste FERMEE, et toutes les valeurs sont sur la liste blanche', () => {
  /* ⛔⛔ Un nom construit hors liste serait rejete EN SILENCE par /api/etape — exactement le defaut
   *     des 34 etapes jetees. Le `Math.min(4, …)` borne la valeur ; la liste blanche doit couvrir
   *     les quatre. */
  assert.match(corps, /Math\.min\(\s*4\s*,/,
    "le numero d etape n est plus borne : une etape 7 inventerait un compteur que le serveur "
    + "rejetterait en silence");
  const srvNu = nu(srv);
  const m = /const ETAPES_ENTONNOIR = \[([\s\S]*?)\]/.exec(srvNu);
  assert.ok(m, 'liste blanche introuvable');
  const blanches = new Set(m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter((s) => /^[a-z0-9_]+$/.test(s)));
  const manquants = [1, 2, 3, 4].map((k) => 'vie_ko_etape' + k).filter((e) => !blanches.has(e));
  assert.deepEqual(manquants, [], manquants.length + ' compteur(s) d echec ne seront jamais comptes : '
    + manquants.join(', '));
});

v('la sonde qui a trouve le trou est toujours la', () => {
  /* ⛔ Sans elle, on ne saurait pas qu un 20e point d arret a ete ajoute sans compteur. La garde
   *   verifie l entonnoir ; la sonde verifie qu on passe TOUJOURS par l entonnoir. */
  assert.match(src, /vieAutoArreter\s*\(/, 'plus aucun appel a vieAutoArreter');
  const appels = (src.match(/vieAutoArreter\s*\(/g) || []).length;
  assert.ok(appels >= 15, 'seulement ' + appels + ' appel(s) a vieAutoArreter : si les sorties ne '
    + 'passent plus par l entonnoir, la mesure ne les voit plus');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok sorties-vie-comptees — ' + n + ' cas : l echec compte l etape atteinte, la reussite');
console.log('   ne compte pas comme un echec, et la cardinalite reste fermee.');
console.log('⚠️ NE PROUVE PAS que les chiffres diront la cause : ils diront OU ca meurt. C est deja');
console.log('   tout ce qu on ne savait pas.');
