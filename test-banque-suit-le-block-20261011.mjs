/* test-banque-suit-le-block-20261011.mjs - LA BANK SUIT LE BLOCK DU PANNEAU (QA de Grok en prod, 2026-10-11 : apres un changement de block,
 * la Bank restait sur « NVDAc → USDC · This block »). La puce « This block » et l ordre sont calcules A LA PEINTURE ; une liste peinte
 * pour un autre block doit etre repeinte.
 * AFFIRME (EXECUTE) : bcChangerFil (extrait d app.html) repeint la Bank quand elle a ete peinte pour un AUTRE block, pas quand elle ne l a
 *   jamais ete, pas quand c est le meme ; bcBanqueCharger retient le block pour lequel il peint.
 * NE PROUVE PAS : le rendu navigateur. */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const i = html.indexOf('function bcChangerFil(');
const m = /\n\}\n/.exec(html.slice(i));
const src = html.slice(i, i + m.index + m[0].length);
vu(/bcBanque\.peintPour = ici;/.test(html), 'bcBanqueCharger ne retient pas le block pour lequel il peint');
const lancer = (peintPour, filDe, a) => {
  let appels = 0;
  const fil = { childNodes: [], textContent: '', append() {} };
  const bc = { fils: new Map(), filDe };
  const bcBanque = peintPour === 'jamais' ? {} : { peintPour };
  new Function('$', 'bc', 'bcBanque', 'bcBanqueCharger', src + '\nbcChangerFil(' + JSON.stringify(a) + ');')(() => fil, bc, bcBanque, () => { appels += 1; return Promise.resolve(); });
  return appels;
};
const A = '0xb2000000000000000000007b9fcbd005511acbd5', B = '0xb200000000000000000000ad2ef5088ae83e5dac';
vu(lancer(A, A, B) === 1, 'la Bank peinte pour A est repeinte quand le panneau passe a B');
vu(lancer('jamais', A, B) === 0, 'une Bank jamais peinte n est pas chargee pour rien');
vu(lancer(B, A, B) === 0, 'deja peinte pour B : rien');
vu(lancer(null, A, B) === 1, 'peinte sans block (null) puis un block choisi : repeinte');
console.log('ok banque-suit-le-block - ' + n + ' assertions ; NE PROUVE PAS le rendu navigateur');
