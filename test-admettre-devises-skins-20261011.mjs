/* test-admettre-devises-skins-20261011.mjs - LA PAGE QUI PROPOSE A L OWNER setCurrency(action, true) pour les 9 actions choisies par Phil
 * (2026-10-11 : « les 9 plus profondes »), et ce que l app en fait.
 * AFFIRME : la page n a qu UN envoi (eth_sendTransaction de appelAdmettre(c.adr) vers BLOCKSKINS, sans valeur) ; rien ne part si le compte
 *   connecte n est pas owner() LU sur la chaine, ni hors Base ; currencyAllowed est relu avant ET apres chaque recu ; un refus arrete tout ;
 *   aucune cle, aucun champ a saisir ; noindex ; servie par le serveur ; l app n y renvoie pas. Cote app : les devises du marche sont
 *   ETH/USDC + celles LUES admises (lireDevisesSkin), jamais la liste des 9 en dur.
 * PROUVE AILLEURS (navigateur, 2026-10-11, lectures sur la vraie v2) : wallet non owner -> « not the owner… », bouton eteint, « 0 of 9
 *   allowed » ; wallet owner -> 1 envoi setCurrency(NVDAc, true) vers 0xc0d1…8e2f, refus -> « nothing more was sent ».
 * NE PROUVE PAS : la signature reelle de Phil. */
import fs from 'node:fs';
import { strict as assert } from 'node:assert';
const lire = (f) => fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const page = lire('admettre-devises-skins.html');
const script = (page.match(/<script type="module">([\s\S]*?)<\/script>/) || ['', ''])[1];
vu(script.length > 1000, 'script de la page introuvable');
const envois = script.match(/eth_sendTransaction[^\n]*/g) || [];
vu(envois.length === 1 && /params: \[\{ from: compte, to: tx\.to, data: tx\.data \}\]/.test(envois[0]) && /const tx = appelAdmettre\(c\.adr\);/.test(script) && !/value/.test(envois[0]),
  'UN seul envoi : appelAdmettre(c.adr), sans valeur');
vu(/import \{ BLOCKSKINS, SKIN_ACTIONS_CANDIDATES, appelAdmettre \} from '\.\/blockskins\.js';/.test(script) && !/0x[0-9a-f]{40}/i.test(script), 'les actions viennent de blockskins.js (paires.js) : aucune adresse ecrite dans la page');
vu(/if \(envoi \|\| !compte \|\| !proprietaire \|\| compte\.toLowerCase\(\) !== proprietaire \|\| !chaineOk\) return;/.test(script) && /proprietaire = '0x' \+ String\(await lire\(BLOCKSKINS, selecteur\('owner\(\)'\)\)\)/.test(script),
  'rien ne part si le compte n est pas owner() LU sur la chaine, ni hors Base');
vu(/const restantes = \(\) => SKIN_ACTIONS_CANDIDATES\.filter\(\(c\) => admises\.get\(c\.adr\) === false\);/.test(script) && /await lireAdmise\(c\); peindre\(\);\s*if \(admises\.get\(c\.adr\) !== true\)/.test(script),
  'currencyAllowed relu avant (seules les NON admises lues sont proposees) et apres chaque recu');
vu(/e && e\.code === 4001 \? 'You declined ' \+ c\.sym \+ ' in your wallet — nothing more was sent\.'/.test(script) && /return; \}/.test(script), 'un refus dans le wallet arrete tout');
vu(/\$\('#bAdmettre'\)\.textContent = !lus \? 'Allow the stocks' : n \?/.test(script), 'rien de lu : jamais « Nothing left to allow » (vu en prod avant connexion, 2026-10-11)');
vu(!/private|mnemonic|seed|signTypedData|personal_sign|eth_sign\b/i.test(script) && !/<input/i.test(page) && /<meta name="robots" content="noindex">/.test(page), 'aucune cle, aucun champ, noindex');
const srv = lire('serveur-web.js'), app = lire('app.html');
vu(/'admettre-devises-skins\.html',/.test(srv) && !/admettre-devises-skins/.test(app), 'servie par le serveur ; l app n y renvoie pas');
vu(/const bcDevisesSkin = \(\) => bc\.devisesSkin \|\| DEVISES_SKIN;/.test(app) && /const d = await lireDevisesSkin\(\{ rpc \}\); bc\.devisesSkin = d\.devises;/.test(app) && !/SKIN_ACTIONS_CANDIDATES/.test(app),
  'l app : devises du marche = ETH/USDC + celles LUES admises, jamais la liste des 9 en dur');
console.log('ok admettre-devises-skins - ' + n + ' assertions ; NE PROUVE PAS la signature reelle');
