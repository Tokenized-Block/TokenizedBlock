/* test-skin-sans-adresse-20261010.mjs - L ACHAT DE SKIN NOMME 'TokenizedBlock' ET N AFFICHE JAMAIS L ADRESSE DE FRAIS (regle de Phil,
 * 2026-10-10). Lit bcAcheterSkin dans app.html (TB_APP = ancienne). AFFIRME : aucun texte d ecran (bcEtape / textContent / bcMessage)
 * n y concatene `beneficiaire` ni FEE_WALLET ; la ligne '1 USDC goes to TokenizedBlock.' existe ; le calldata (appelAchatSkin) et la
 * verification serveur gardent la vraie adresse. NE PROUVE PAS : ce que le wallet affiche (hors de l app) - NON mesure.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
const html = readFileSync(process.env.TB_APP || new URL('./app.html', import.meta.url), 'utf8');
const i = html.indexOf('async function bcAcheterSkin(');
assert.ok(i > 0, 'bcAcheterSkin introuvable');
const suite = html.slice(i + 10).search(/\r?\nasync function /);
const corps = html.slice(i, suite > 0 ? i + 10 + suite : i + 8000);
const ecran = [...corps.matchAll(/(?:bcEtape|bcMessage)\([^;]*?\);|textContent\s*=[^;]*;/g)].map((x) => x[0]);
assert.ok(ecran.length > 3, 'textes d ecran introuvables');
for (const l of ecran) assert.ok(!/\bbeneficiaire\b|FEE_WALLET/.test(l.replace(/\/\*.*?\*\//g, '')), 'adresse de frais a l ecran : ' + l.trim().slice(0, 120));
assert.ok(corps.includes("'1 USDC goes to TokenizedBlock."), 'le destinataire n est pas nomme');
assert.match(corps, /appelAchatSkin\(\{ usdc, beneficiaire,/, 'le calldata doit garder la vraie adresse');
assert.match(corps, /String\(prix\.beneficiaire\)\.toLowerCase\(\) !== beneficiaire/, 'la verification serveur/app doit rester');
console.log('ok skin-sans-adresse - ' + ecran.length + ' textes d ecran sans adresse, calldata intact ; NE PROUVE PAS l ecran du wallet');