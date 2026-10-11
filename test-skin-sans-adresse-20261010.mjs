/* test-skin-sans-adresse-20261010.mjs - L ACHAT DE SKIN NOMME 'TokenizedBlock' ET N AFFICHE JAMAIS L ADRESSE DE FRAIS (regle de Phil,
 * 2026-10-10). Lit bcAcheterSkin dans app.html (TB_APP = ancienne). AFFIRME : aucun texte d ecran (bcEtape / textContent / bcMessage)
 * n y concatene `beneficiaire` ni FEE_WALLET ; la ligne '1 USDC goes to TokenizedBlock.' existe ; le calldata garde la vraie adresse
 * et la verification app/contrat reste. 2026-10-11 : l achat MINTE sur le contrat BlockSkins deploye (le contrat paie le wallet de frais
 * GRAVE) : la verification compare le FEE_WALLET lu sur la chaine a celui de l app. NE PROUVE PAS : ce que le wallet affiche - NON mesure.
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
for (const l of ecran) assert.ok(!/\bbeneficiaire\b|FEE_WALLET|BLOCKSKINS|fraisC/.test(l.replace(/\/\*.*?\*\//g, '')), 'adresse a l ecran : ' + l.trim().slice(0, 120));
assert.ok(corps.includes("'1 USDC goes to TokenizedBlock."), 'le destinataire n est pas nomme');
assert.match(corps, /appelMint\(a, recette\)/, 'le mint du contrat doit porter le block et la recette');
assert.match(corps, /if \(prixC !== SKIN_MINT_USDC \|\| fraisC !== beneficiaire\)/, 'la verification contrat/app (prix et destinataire graves) doit rester');
console.log('ok skin-sans-adresse - ' + ecran.length + ' textes d ecran sans adresse, mint et verification intacts ; NE PROUVE PAS l ecran du wallet');
