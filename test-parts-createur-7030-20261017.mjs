/* test-parts-createur-7030-20261017.mjs - UN CREATEUR 7030 VOIT SES POOLS DANS SES PARTS.
 * MESURE prod 2026-10-17 : /api/parts-createur?compte=0x31e0… (createur enregistre de UNIT, hook 7030) rendait 0 pool : le hook 7030
 *   (deploye au bloc 52 132 476, sans du()) n est pas dans HOOKS_FRAIS, et createurDe y revert (getter = createurs).
 * AFFIRME (lecture de serveur-web.js) : la route lit AUSSI les cles 7030 du cache de /api/cle, par createurs(bytes32) (SEL_CREATEURS),
 *   sans doublon, et dit sa borne (borne7030) ; elle n utilise PAS createurDe pour 7030.
 * NE PROUVE PAS : la reponse prod (verifiee apres deploiement : pools7030 >= 1 pour 0x31e0). */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const r = srv.slice(srv.indexOf("if (chemin === '/api/parts-createur')"), srv.indexOf("if (chemin === '/api/lancements-etrangers')"));
vu(r.length > 500, 'route trouvee');
vu(/for \(const \[jeton, v\] of clesCache\)/.test(r) && /String\(c\.hooks\)\.toLowerCase\(\) !== h7030/.test(r), 'les cles 7030 du cache sont lues');
vu(/SEL_CREATEURS/.test(r.slice(r.indexOf('pools7030 = 0'))), 'getter createurs(bytes32) pour 7030');
vu(!/0x631245a7/.test(r.slice(r.indexOf('pools7030 = 0'))), 'pas createurDe (qui revert sur 7030)');
vu(/pools\.some\(\(x\) => x\.id === String\(c\.poolId\)\.toLowerCase\(\)\)/.test(r), 'sans doublon');
vu(/borne7030:/.test(r) && /pools7030/.test(r), 'la borne est dite dans la reponse');
console.log('ok parts-createur-7030 - ' + n + ' assertions ; NE PROUVE PAS la reponse prod');
