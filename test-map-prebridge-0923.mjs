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
if (!s.includes("prebridge-v3")) throw new Error('cache ver');
if (s.includes('bas += 2000')) throw new Error('frais still 2000');
if (!h.includes('blocs: 43200')) throw new Error('client scan not widened');
console.log('ok map-prebridge');
