import { readFileSync } from 'fs';
const h = readFileSync('./app.html', 'utf8');
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23, passe globale) : elle exigeait un numero de
 *    build precis, donc elle rougissait des qu un AUTRE deploiement bumpait le build. Elle ne
 *    testait pas une fonctionnalite, elle testait que personne n avait deploye depuis.
 *    L intention — « c est bien une page servie, avec sa ligne de build » — est gardee. */
if (!/data-build="[\w-]+"/.test(h)) throw new Error('ligne de build absente ou mal formee');
if (!h.includes('instant-birth-tb') && !h.includes('tip 20260923-created-ib-cta')) throw new Error('comment');
if (!h.includes('data-tf-act="instant-birth-tb">Instant Birth on TB · 0.001 ETH')) throw new Error('button');
if (h.includes('tip 20260922-2141 MINIMAL: Created unhooked = Open profile / tap to open ONLY')) throw new Error('old 2141 left');
console.log('ok created-ib-cta');
