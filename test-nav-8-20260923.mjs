import { readFileSync } from 'fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const nav = html.match(/<div class="navIn"[\s\S]*?<\/div>/);
if (!nav) throw new Error('navIn missing');
const tabs = [...nav[0].matchAll(/data-volet="/g)];
if (tabs.length !== 9) throw new Error('expected 9 nav tabs, got ' + tabs.length);
if (!/data-volet="tokenx"/.test(html)) throw new Error('Post tab missing');
if (!/id="v-tokenx"/.test(html)) throw new Error('Post panel missing');
/* ⛔ NAV A 9 COLONNES DEPUIS LE 2026-09-23 (Phil : « fait un autre onglet » — l onglet Post).
 *    Le compte reste EXIGE : ce qui change, c est la valeur decidee, pas la garde. Un test qui
 *    exige « exactement 8 » apres qu on a decide d en avoir 9 ne trouve pas une regression : il
 *    garde une decision perimee, et fait croire a un defaut a chaque execution. */
if (!/grid-template-columns:repeat\(9,1fr\)/.test(html)) throw new Error('CSS still not repeat(9)');
if (/grid-template-columns:repeat\([78],1fr\)/.test(html)) throw new Error('CSS still has an old column count');
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23) : elle exigeait un numero de build precis, donc
 *    elle rougissait des qu un AUTRE deploiement bumpait le build. Ce qui est garde : la ligne
 *    doit exister et etre bien formee. Les controles « un ANCIEN tip n est pas reste » sont
 *    laisses intacts — eux gardent vraiment quelque chose. */
if (!/data-build="[\w-]+"/.test(html)) throw new Error('ligne de build absente ou mal formee');
if (!/data-volet="bridge"/.test(html)) throw new Error('Bridge tab missing');
if (!/data-volet="mien"/.test(html)) throw new Error('My block tab missing');
console.log('ok nav-8 tip 20260923-nav-boot-fix');
