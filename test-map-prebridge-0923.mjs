import { readFileSync } from 'fs';
const s = readFileSync('./serveur-web.js', 'utf8');
const h = readFileSync('./app.html', 'utf8');
const ib = readFileSync('./index-blocks.js', 'utf8');
if (!/FENETRE_MAX = 999/.test(ib)) throw new Error('FENETRE_MAX');
if (!h.includes('LIVE_FENETRE = 999')) throw new Error('LIVE_FENETRE');
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23, passe globale) : elle exigeait un numero de
 *    build precis, donc elle rougissait des qu un AUTRE deploiement bumpait le build. Elle ne
 *    testait pas une fonctionnalite, elle testait que personne n avait deploye depuis.
 *    L intention — « c est bien une page servie, avec sa ligne de build » — est gardee. */
if (!/data-build="[\w-]+"/.test(h)) throw new Error('ligne de build absente ou mal formee');
if (!s.includes('NEVER retry range')) throw new Error('no range throw');
/* ⛔⛔⛔ EPINGLE DE VERSION DE CACHE RETIREE (2026-09-30), ET C EST LA MEME FAUTE QUE L EPINGLE DE
 *      BUILD JUSTE AU-DESSUS — celle-la etait restee. Cette ligne exigeait le litteral
 *      `prebridge-v3`, donc elle INTERDISAIT de faire ce que cette constante existe pour faire :
 *      changer quand la forme du payload change. Elle ne testait pas une fonctionnalite, elle
 *      testait que personne n avait bumpe la version depuis.
 *    ⛔ ET ELLE A COUTE : le 2026-09-30 j ai ajoute `emetteur` / `emetteurEtat` SANS bumper, et la
 *      production a resservi un corps de cache perime — `emetteurEtat: ABSENT`, 0 ligne marquee sur
 *      226 lignes, avec le code neuf qui tournait. Un test qui interdit la seule manoeuvre
 *      corrective ne protege rien : il l empeche.
 *    ⇒ L INTENTION EST GARDEE : la constante existe et porte une chaine non vide, bien formee.
 *      Ce que cette ligne ne peut PAS juger — « a-t-elle ete bumpee QUAND il fallait » — est teste
 *      ailleurs, par la garde de FORME de `test-actions-emetteur.mjs` : elle refuse un corps
 *      persiste a qui manque un champ que le code d aujourd hui produit. C est la garde solide,
 *      parce qu elle ne depend pas de ma memoire. */
if (!/const TRENDING_CACHE_VER = '[\w.-]+';/.test(s)) throw new Error('cache ver absente ou mal formee');
if (s.includes('bas += 2000')) throw new Error('frais still 2000');
if (!h.includes('blocs: 43200')) throw new Error('client scan not widened');
console.log('ok map-prebridge');
