import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23, passe globale) : elle exigeait un numero de
 *    build precis, donc elle rougissait des qu un AUTRE deploiement bumpait le build. Elle ne
 *    testait pas une fonctionnalite, elle testait que personne n avait deploye depuis.
 *    L intention — « c est bien une page servie, avec sa ligne de build » — est gardee. */
if (!/data-build="[\w-]+"/.test(h)) throw new Error('ligne de build absente ou mal formee');
if (!h.includes('vues.length >= Math.max(80, habitants.length)')) throw new Error('guard');
if (!h.includes('void soleilsSurLaMap();')) throw new Error('soleilsSurLaMap');
if (!h.includes("charger().then(() => { void soleilsSurLaMap(); })")) throw new Error('charger then soleils');
console.log('ok map-seed');
