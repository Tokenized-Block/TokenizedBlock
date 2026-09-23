import { readFileSync } from 'fs';
const s = readFileSync('./serveur-web.js', 'utf8');
const h = readFileSync('./app.html', 'utf8');
if (!s.includes('trendingPlaceholder')) throw new Error('no placeholder');
if (!s.includes('sauverTrendingDisque')) throw new Error('no disk save');
if (!s.includes('RPC_LIST')) throw new Error('no RPC_LIST');
if (!/blocsLusJusqua === null \? 3 \* 43200/.test(s)) throw new Error('cold window not shortened');
if (!/FENETRE_MAX = 999/.test(readFileSync('./index-blocks.js','utf8'))) throw new Error('FENETRE_MAX not 1000');
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23) : elle exigeait un numero de build precis, donc
 *    elle rougissait des qu un AUTRE deploiement bumpait le build. Ce qui est garde : la ligne
 *    doit exister et etre bien formee. Les controles « un ANCIEN tip n est pas reste » sont
 *    laisses intacts — eux gardent vraiment quelque chose. */
if (!/data-build="[\w-]+"/.test(h)) throw new Error('ligne de build absente ou mal formee');
if (!s.includes('NEVER hang HTTP')) throw new Error('hang comment missing');
if (s.includes("return trCache.corps ? Promise.resolve(trCache.corps) : trEnCours")) throw new Error('old hang path still present');
if (!s.includes('TRENDING_CACHE_VER')) throw new Error('no cache ver');
if (!s.includes('disk cache ignored')) throw new Error('no ignore path');
console.log('ok map-dense cache-ver + fenetre999');
