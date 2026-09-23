import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23, passe globale) : elle exigeait un numero de
 *    build precis, donc elle rougissait des qu un AUTRE deploiement bumpait le build. Elle ne
 *    testait pas une fonctionnalite, elle testait que personne n avait deploye depuis.
 *    L intention — « c est bien une page servie, avec sa ligne de build » — est gardee. */
if (!/data-build="[\w-]+"/.test(h)) throw new Error('ligne de build absente ou mal formee');
if (!h.includes('tip 20260923-map-anim: soleilsSurLaMap creates')) throw new Error('soleils animer');
if (!h.includes('thin merge skips poserBlocks')) throw new Error('charger animer');
if (h.includes('data-build="20260923-map-3dplace"')) throw new Error('old tip left');
console.log('ok map-anim');
