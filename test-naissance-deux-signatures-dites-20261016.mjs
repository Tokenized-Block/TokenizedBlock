// test-naissance-deux-signatures-dites-20261016.mjs - 2026-10-16, UNIT : l ecran annoncait « 0.001 birth fee + 0.000416 creator
// deposit » ; le wallet a signe 0.0007 ETH (tx 0xe99513f6.., createPaid). Mesure chaine : la naissance se paie en DEUX signatures -
// createPaid = FRAIS_OUVERTURE - plancher = 0.0007 ETH ; puis inscrireAvecCaution = 0.0003 ETH + caution (tx 0x5afe0b77.. :
// 0.000715168377582366 = 0.0003 + 0.000415168377582366). Le texte doit dire ce partage, avec les constantes du code.
import { readFileSync } from 'node:fs';
import { FRAIS_OUVERTURE_WEI, CREATE_FEE_WEI_FLOOR } from './frais-creation.js';
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (c) console.log('ok  ' + m); else { ko++; console.log('KO  ' + m); } };
const eth = (w) => (Number(w) / 1e18).toString();
const create = eth(FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR), ouverture = eth(CREATE_FEE_WEI_FLOOR);
ok(create === '0.0007' && ouverture === '0.0003', 'partage des constantes : ' + create + ' + ' + ouverture);
ok(BigInt('715168377582366') - CREATE_FEE_WEI_FLOOR === 415168377582366n, 'tx 0x5afe : valeur = plancher 0.0003 + caution 0.000415168377582366');
const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const rev = (html.match(/<p class="note" id="cReviewDisclosure">([\s\S]*?)<\/p>/) || [])[1] || '';
ok(rev.includes(create + ' ETH') && rev.includes(ouverture + ' ETH'), 'revue avant wallet : dit ' + create + ' a Create et ' + ouverture + ' a l ouverture');
const i0 = html.indexOf('async function majNoteCaution()');
const note = i0 >= 0 ? html.slice(i0, html.indexOf('function majFundWalletPourPaire()', i0)) : '';
ok(/second signature/.test(note) && /CREATE_FEE_WEI_FLOOR/.test(note), 'note de caution : la caution part avec la 2e signature, avec le plancher lu du code');
console.log(ko ? 'FAIL deux-signatures ' + ko + '/' + n + ' KO' : 'ALL PASS deux-signatures ' + n + ' assertions');
process.exit(ko ? 1 : 0);
