// test-carte-naissance-20261110.mjs — CREATE-ONE-PATH wiring (game343): the one card (carte-naissance.js) on Create and on the block page,
// painted from the server's chain read (/api/naissance/etat); the Create card holds the page's own #cCreer (one button, its flow unchanged);
// "Connect wallet" connects and stays where the person is. No network.
// Measured once in a browser (local server, mainnet reads, read-only wallet 0x31e0): Create card "1 Get TBLOCK DONE, next Create,
// Signature 1 of 6", #cCreer inside, one copy; block page TEST card "Permit2 (again) next, Signature 1 of 3".
// Does NOT prove: the cards' look (screenshots do), a real signature.
import { readFileSync } from 'node:fs';
let ok = 0, ko = 0;
const t = (n, c, x = '') => { if (c) ok++; else { ko++; console.log('RED', n, x); } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const carte = readFileSync(new URL('./carte-naissance.js', import.meta.url), 'utf8');

t('the card builds DOM with textContent only (no innerHTML)', !/innerHTML/.test(carte.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n')));
t('the card never builds a call', !/eth_sendTransaction|wallet_sendCalls|envoyerAppels|data:/.test(carte));
t('the card moves the given button in, never a second one', /if \(bouton\) \{[\s\S]{0,200}carte\.append\(bouton\);/.test(carte));
t('app imports the card', /import \{ peindreCarteNaissance \} from '\.\/carte-naissance\.js';/.test(app));
const cc = app.slice(app.indexOf('async function peindreCarteCreate('), app.indexOf('async function peindreTipApercu('));
t('Create card: wallet + predicted address, else the plain split', /if \(!compte \|\| !adr\) return false;/.test(cc));
t('Create card: read from the server reader', /\/api\/naissance\/etat\?compte=/.test(cc));
t('Create card: #cCreer moved in as the one Continue', /peindreCarteNaissance\(box, r, \{ bouton: b,/.test(cc));
t('Create card: not read -> busy, read again in 8 s', /carteCreeLue = Date\.now\(\) - 4000;/.test(cc) && /occupe: lu \? null : \{ secondes: 8/.test(cc));
const ap = app.slice(app.indexOf('async function peindreTipApercu('), app.indexOf('let tipAuto = false;'));
t('#cCreer goes back to its place when the card is not shown', /if \(await peindreCarteCreate\(box\)\.catch\(\(\) => false\)\) return;\s*rendreCCreer\(\);/.test(ap));
const bo = app.slice(app.indexOf('async function peindreBOne('), app.indexOf('/* game342: resume a created-but-unopened block'));
t('block page: same card, its Continue runs the step the reader names', /n\.etape === 2/.test(bo) && /proposerTipCoffre\(zone\)/.test(bo));
t('block page: not read -> retry every 8 s, at most 30', /if \(!lu && essai < 30\) setTimeout/.test(bo));
t('#bOne exists, hidden', /<div id="bOne" hidden/.test(app));
const pc = app.slice(app.indexOf("$('#pCompte').addEventListener('click', async () => {"), app.indexOf("$('#pCompte').addEventListener('click', async () => {") + 2400);
t('Connect wallet: connected = stay (no trip to Wallet)', /if \(compte\) \{ void majReprendreVie\(\); return; \}\s*try \{ allerA\('wallet'\); \}/.test(pc));
t('server: /api/naissance/etat reads the chain with the one reader and the vault read', /chemin === '\/api\/naissance\/etat'/.test(srv) && /lireEtatNaissance\(\{ rpc: rpcE/.test(srv) && /lireCoffrePaye\(\{ rpc: rpcE/.test(srv));
t('server: modules served', ["'etat-naissance.js'", "'coffre-paye.js'", "'carte-naissance.js'"].every((m) => srv.includes(m)));
t('TBLOCK pill follows the theme (no fixed blue)', /\.tete \.puce\.pTblock\{[^}]*var\(--accentRgb\)/.test(app) && !/\.pTblock\{[^}]*#0052FF/.test(app));
console.log(ko === 0 ? 'GREEN' : 'RED', ok + '/' + (ok + ko));
