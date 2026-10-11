/* test-live-page-20261011.mjs - /live : ce que le wallet de frais a VRAIMENT recu, lisible sans JavaScript (Grok sur X suit un lien).
 * AFFIRME (live.js EXECUTE) : un frais LU se rend avec son etat de verification et son lien explorer ; une lecture ratee est dite
 *   NON_LU / EN_COURS, jamais « 0 » ; un solde non lu est « not read » ; la page porte ses balises d apercu (og/twitter), AUCUN
 *   <script>, et dit ce qu elle ne prouve pas (frais Bank pas listes un par un). Cablage : la route sert /live et /api/live, live.js
 *   est importe par le serveur.
 * NE PROUVE PAS : qu un robot de X affiche l apercu (mesure apres deploiement), ni le contenu reel de la chaine. */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { etatLive, htmlLive, texteLive, montantLisible } from './live.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const TX = '0x' + 'ab'.repeat(32);
const lu = etatLive({ maintenant: Date.UTC(2026, 9, 11, 13, 30), build: '20261011-x',
  soldes: { eth: 1000000000000000000n, usdc: 99937n },
  sondes: { naissance: 'PRET', marche: { etat: 'PRET' }, echange: { etat: 'PRET' }, cerveau: { etat: 'PRET' } },
  frais: { etat: 'LU', heures: 24, ageS: 12, complet: true, fenetresRatees: [], nonVerifies: 3,
    parDevise: [{ devise: '0x0000000000000000000000000000000000000000', n: 2, total: '1000000000000000' }],
    derniers: [{ tx: TX, bloc: 52463865, devise: '0x0000000000000000000000000000000000000000', montant: '500000000000000', etat: 'ARRIVE' }] } });
const t = texteLive(lu);
vu(/ARRIVE · 0\.0005 ETH · block 52463865 · https:\/\/basescan\.org\/tx\/0x(ab){32}/.test(t), 'un frais LU ne dit pas son etat / montant / lien : ' + t);
vu(/0x0+ · 2 × 0\.001 ETH|2 × 0\.001 ETH/.test(t) && /1 ETH · 0\.099937 USDC/.test(t), 'totaux ou soldes mal rendus : ' + t);
vu(/3 older event\(s\) not checked/.test(t), 'les evenements non verifies sont tus');
const h = htmlLive(lu);
vu(!/<script/i.test(h) && /og:title/.test(h) && /twitter:card/.test(h) && /<a href="https:\/\/basescan\.org\/tx\/0x(ab){32}"/.test(h), 'la page a un script, ou pas d apercu, ou pas de lien explorer');
vu(/Bank service fees .* not listed one by one/.test(t) && /never zero/.test(t), 'la page ne dit pas ce qu elle ne prouve pas');
/* lecture ratee : jamais un zero */
const rate = etatLive({ maintenant: 0, frais: { etat: 'NON_LU', pourquoi: 'node refused' }, soldes: { eth: null, usdc: null }, sondes: {} });
const tr = texteLive(rate);
vu(/Fees, last 24 h: NON_LU — node refused/.test(tr) && /ETH not read · USDC not read/.test(tr) && !/: 0 |none in the windows/.test(tr), 'une lecture ratee se lit comme un zero : ' + tr);
vu(/EN_COURS/.test(texteLive(etatLive({ maintenant: 0, frais: { etat: 'EN_COURS' } }))), 'un calcul en cours n est pas dit');
/* mesure locale : « incomplete: 0 chain window(s) refused » se contredisait */
const inc = (n) => texteLive(etatLive({ maintenant: 0, frais: { etat: 'LU', heures: 24, complet: false, fenetresRatees: Array(n).fill({}), parDevise: [], derniers: [] } }));
vu(!/0 chain window/.test(inc(0)) && /part of the window is not read yet/.test(inc(0)) && /2 chain window\(s\) refused/.test(inc(2)), 'incomplet sans refus dit « 0 window(s) refused » : ' + inc(0));
vu(montantLisible('123', '0x' + '7'.repeat(40)) === '123 raw units of 0x' + '7'.repeat(40) && montantLisible('x', 'eth') === 'unreadable amount', 'decimales inventees pour un jeton inconnu');
/* cablage serveur */
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
vu(/import \{ etatLive, htmlLive \} from '\.\/live\.js';/.test(srv) && /if \(chemin === '\/live' \|\| chemin === '\/api\/live'\) \{/.test(srv)
  && /enFond\('frais-recents:24', \(\) => fraisRecents\(24\), 300000\)/.test(srv), 'la route /live n est pas cablee (ou ne partage pas le calcul de /api/frais-recents)');
console.log('ok live-page - ' + n + ' assertions (live.js execute) ; NE PROUVE PAS l apercu reel sur X');
