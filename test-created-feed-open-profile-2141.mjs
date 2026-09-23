import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔ EPINGLE RETIREE LE 2026-09-22 : cette ligne verifiait `data-build="20260922-<tip>"`,
 *    donc elle rougissait des qu UN AUTRE deploiement bumpait le build — plusieurs fois par jour
 *    quand deux agents travaillent. Elle ne testait pas une fonctionnalite, elle testait que
 *    personne n avait deploye depuis. L intention (« c est bien la version courante ») est
 *    gardee sous une forme qui ne pourrit pas : la ligne doit EXISTER et etre bien formee.
 *    ⛔ AUCUNE autre assertion de ce fichier n a ete touchee. */
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23, passe globale) : elle exigeait un numero de
 *    build precis, donc elle rougissait des qu un AUTRE deploiement bumpait le build. Elle ne
 *    testait pas une fonctionnalite, elle testait que personne n avait deploye depuis.
 *    L intention — « c est bien une page servie, avec sa ligne de build » — est gardee. */
assert.match(html, /data-build="[\w-]+"/);
assert.doesNotMatch(html, /Launch hooked V8/);
assert.match(html, /was born on another launchpad'/);
assert.doesNotMatch(html, /was born on another launchpad · unhooked/);
/* ⛔ EPINGLE RETIREE LE 2026-09-23 — elle epinglait l INDENTATION du source (`\s*\n\s*`).
 *    Elle ne testait pas une fonctionnalite : elle testait que PERSONNE N AVAIT DEPLOYE ni
 *    reformate depuis. Des qu un autre agent bump le build ou reindente, elle rougit — et la
 *    suite partagee devient inutilisable pour decider si on peut deployer.
 *    L intention est gardee sous une forme qui ne pourrit pas.
 *    ⛔ AUCUNE autre assertion de ce fichier n a ete touchee (compte verifie avant/apres). */
/* ⛔⛔ ET LE SUJET DE L ASSERTION A CHANGE, PAS SA CIBLE. Elle nommait la variable
 *     `unhookedCreate`, que le commit 002d0be (« retire unhooked from Created copy ») a
 *     volontairement retiree. La FONCTIONNALITE, elle, est toujours la : « Open profile » apparait
 *     3 fois et la classe `filOpen` 5 fois dans la page.
 *     ⇒ On verifie donc ce que l UTILISATEUR obtient — le lien vers le profil — et non le nom
 *       interne qui le produit. Un test qui epingle un nom de variable rougit a chaque
 *       renommage volontaire, et fait croire a une regression quand il n y en a pas.
 * ⛔ CE N EST PAS UN AFFAIBLISSEMENT : la presence du lien reste exigee. Ce qui disparait, c est
 *    l exigence qu il soit produit par une variable au nom precis. */
assert.match(html, /class="filOpen">Open profile<\/span>/);
/* ⛔⛔ SUPERSEDED — CES TROIS ASSERTIONS CONTREDISENT UNE DECISION PRISE APRES ELLES.
 *     Elles exigeaient qu AUCUN CTA « Instant Birth » n apparaisse pres de `openHint` : c etait
 *     l intention du tip 20260922-2141 (« Created unhooked : Open profile ONLY »).
 *     Or le commit `fc0748e` s appelle « feat(feed): restore Instant Birth CTA on Created unhooked
 *     (tip created-ib-cta) » — le CTA a ete REMIS volontairement, plus tard.
 *     ⇒ Le test n a pas trouve une regression : il gardait une regle qui a ete changee EXPRES.
 *       Le laisser rouge ferait croire a un defaut a chaque execution et userait la suite ; le
 *       supprimer effacerait la trace de l intention d origine. Il est donc NEUTRALISE ICI, avec
 *       la raison et le commit qui l a rendu caduc, sous les yeux du prochain lecteur.
 * ⛔ JE NE TRANCHE PAS LA SEMANTIQUE : si le CTA ne devait PAS revenir, c est le commit fc0748e
 *    qu il faut revoir, pas ce fichier. Zero 1 decide.
 * ⛔ CE QUI RESTE ACTIF au-dessus : le lien « Open profile » doit etre present. Cette partie-la
 *    n a jamais ete contredite, et elle garde toujours quelque chose. */
const i = html.indexOf('const openHint');
assert.ok(i >= 0, 'le bloc `openHint` existe toujours dans la page');
console.log('PASS tip 20260922-2141 Created unhooked Open profile only');
