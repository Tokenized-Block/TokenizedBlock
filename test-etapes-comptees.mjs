/* test-etapes-comptees.mjs — UN CLIC INSTRUMENTE DOIT ETRE COMPTE, PAS JETE.
 *
 * ⛔⛔ CE QUE CETTE GARDE EMPECHE DE REVENIR. Le 2026-09-23, la liste blanche de `/api/etape`
 *     contenait 16 noms et l app en appelait 48. Les 34 autres etaient rejetes SANS ERREUR : le
 *     serveur fait `if (ETAPES_ENTONNOIR.includes(e))` et, sinon, ne fait rien du tout. Aucun
 *     journal, aucun 400, aucun symptome. Le tableau de bord affichait donc 0 pour l achat, 0 pour
 *     la connexion de wallet, 0 pour le Bridge — et ces zeros etaient indiscernables de « personne
 *     n a fait ca ».
 *
 * ⛔ POURQUOI UNE GARDE ET PAS SEULEMENT UN CORRECTIF. La divergence n est pas arrivee d un coup :
 *    elle s est creusee un bouton a la fois, chacun ajoutant un `etape('nouveau_nom')` sans toucher
 *    au serveur. Corriger la liste sans poser cette garde garantit qu elle redivergera.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que les compteurs sont JUSTES. Il compare deux listes de noms.
 *    Un compteur peut etre cable et compter la mauvaise chose — ca, seule une mesure le dirait.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ La liste s etale maintenant sur plusieurs lignes : le motif doit traverser les retours a la
 *   ligne, sinon il ne verrait que la premiere et accuserait 40 etapes a tort.
 * ⛔⛔ ET LES COMMENTAIRES PARTENT D ABORD — ma premiere version ne le faisait pas et a accuse SIX
 *     etapes parfaitement presentes (`achat_prepare`, `wallet_connect_ok`…). Raison : les
 *     commentaires de groupe dans la liste contiennent des virgules (« l entree de tout le reste,
 *     jamais comptee »), donc le `split(',')` coupait en plein commentaire et le nom qui suivait
 *     se retrouvait colle a du texte. C est la SIXIEME fois aujourd hui qu un commentaire fausse
 *     une lecture — la regle tient dans une phrase : on retire les commentaires du cote LU, jamais
 *     du cote de l univers de reference. */
const srvNu = srv.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');
const mListe = /const ETAPES_ENTONNOIR = \[([\s\S]*?)\]/.exec(srvNu);
assert.ok(mListe, 'ETAPES_ENTONNOIR introuvable — la garde ne peut rien affirmer, et ne l affirme pas');
const blanches = new Set(mListe[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
  .filter((s) => /^[a-z0-9_]+$/.test(s)));

/* ⛔ commentaires retires du cote LU uniquement : une de mes sondes a deja accuse un identifiant
 *   qui n existait que dans le commentaire expliquant son retrait. */
const src = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');

const appelees = new Set();
for (const m of src.matchAll(/\betape\(\s*'([a-z0-9_]+)'\s*\)/g)) appelees.add(m[1]);
/* les noms caches dans une ternaire comptent autant que les autres */
for (const m of src.matchAll(/\betape\(\s*[^)]*\?\s*'([a-z0-9_]+)'\s*:\s*'([a-z0-9_]+)'/g)) {
  appelees.add(m[1]); appelees.add(m[2]);
}

v('la liste blanche est bien peuplee — un motif casse la rendrait vide et tout passerait', () => {
  /* ⛔ `probe-must-accuse-itself-first` : sans ce cas, une regex cassee donnerait `blanches` vide,
   *    donc TOUTES les etapes « perdues », donc un rouge bruyant ; ou pire, `appelees` vide, donc
   *    un VERT parfait sur une lecture ratee. On borne les deux cotes. */
  assert.ok(blanches.size >= 40, 'liste blanche lue : ' + blanches.size + ' noms — lecture suspecte');
  assert.ok(appelees.size >= 40, 'etapes lues dans l app : ' + appelees.size + ' — lecture suspecte');
});

v('AUCUNE etape appelee par l app n est absente de la liste blanche', () => {
  const perdues = [...appelees].filter((e) => !blanches.has(e)).sort();
  assert.deepEqual(perdues, [],
    perdues.length + ' etape(s) appelee(s) par l app mais absente(s) de ETAPES_ENTONNOIR : '
    + perdues.join(', ') + '\n   ⇒ chacune sera JETEE EN SILENCE par /api/etape et affichera 0 pour'
    + ' toujours. Ajouter le nom dans serveur-web.js, pas retirer l appel.');
});

v('les etapes qui rapportent sont comptees — nommement', () => {
  /* ⛔ Les trois qui repondent a « ou perd-on les gens ». Les nommer une par une empeche qu un
   *   nettoyage de liste les emporte en silence : le cas dirait LAQUELLE manque. */
  for (const e of ['achat_prepare', 'achat_ok', 'wallet_connect_ok', 'create_fund_bridge',
    'onramp_session_ok', 'onramp_session_repli']) {
    assert.ok(blanches.has(e), 'l etape « ' + e +' » n est plus comptee : un maillon de l entonnoir'
      + ' d argent redevient aveugle');
  }
});

v('aucun doublon dans la liste blanche', () => {
  const brut = mListe[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter((s) => /^[a-z0-9_]+$/.test(s));
  assert.equal(brut.length, blanches.size,
    'doublon(s) dans ETAPES_ENTONNOIR : ' + (brut.length - blanches.size)
    + ' — inoffensif au comptage, mais signe que la liste a ete editee a deux endroits');
});

assert.equal(n, 4, 'compte de cas inattendu : ' + n);
console.log('ok etapes-comptees — ' + n + ' cas : ' + appelees.size + ' etapes appelees, '
  + blanches.size + ' sur la liste blanche, 0 jetee.');
console.log('⚠️ NON PROUVE : que les compteurs comptent la BONNE chose. Ce test compare des noms.');
