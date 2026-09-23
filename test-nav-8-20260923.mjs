import { readFileSync } from 'fs';
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const nav = html.match(/<div class="navIn"[\s\S]*?<\/div>/);
if (!nav) throw new Error('navIn missing');
const tabs = [...nav[0].matchAll(/data-volet="/g)];
if (tabs.length !== 8) throw new Error('expected 8 nav tabs, got ' + tabs.length);
if (!/grid-template-columns:repeat\(8,1fr\)/.test(html)) throw new Error('CSS still not repeat(8)');
if (/grid-template-columns:repeat\(7,1fr\)/.test(html)) throw new Error('CSS still has repeat(7)');
/* ⛔ EPINGLE DE BUILD RETIREE (2026-09-23) : elle exigeait un numero de build precis, donc
 *    elle rougissait des qu un AUTRE deploiement bumpait le build. Ce qui est garde : la ligne
 *    doit exister et etre bien formee. Les controles « un ANCIEN tip n est pas reste » sont
 *    laisses intacts — eux gardent vraiment quelque chose. */
if (!/data-build="[\w-]+"/.test(html)) throw new Error('ligne de build absente ou mal formee');
if (!/data-volet="bridge"/.test(html)) throw new Error('Bridge tab missing');
if (!/data-volet="mien"/.test(html)) throw new Error('My block tab missing');
console.log('ok nav-8 tip 20260923-nav-boot-fix');
