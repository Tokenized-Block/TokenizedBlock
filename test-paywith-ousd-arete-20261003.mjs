/* test-paywith-ousd-arete-20261003.mjs — OUSD DANS « PAY WITH » MEME QUAND LE SERVEUR N A PAS LU SES FAITS.
 * ⛔ MESURE (prod, IB022 apres 05b30a9) : « Pay with » = ETH + USDC ; OUSD absent (« no route ») car /api/prix-usd rendait
 *   OUSD `famille: NON_MESURE`. Correctif : les pools MESUREES de cles-v4-mesurees.js deviennent des aretes.
 * On execute la VRAIE aretesMesurees (extraite d app.html), avec faitsPoolLus VIDE (le cas de prod). */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const DD = await imp('devises-dentree.js');
const P = await imp('paires.js');
const C = await imp('cles-v4-mesurees.js');
const PJ = await imp('pools-du-jeton.js');
const { USDC_BASE } = await imp('frais-creation.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
const i0 = html.indexOf('function aretesMesurees()');
let src = null; if (i0 >= 0) { let p = 0; for (let k = html.indexOf('{', i0); k < html.length; k += 1) { if (html[k] === '{') p += 1; else if (html[k] === '}') { p -= 1; if (p === 0) { src = html.slice(i0, k + 1); break; } } } }
ok(!!src, 'aretesMesurees extraite d app.html');
const ETH = '0x0000000000000000000000000000000000000000';
const aretesMesurees = new Function('ETH_ADR', 'USDC_BASE', 'faitsPoolLus', 'LOGS_INITIALIZE_MESURES', 'decoderInitialize', src + '\nreturn aretesMesurees;')(
  ETH, USDC_BASE, new Map(), C.LOGS_INITIALIZE_MESURES, PJ.decoderInitialize);
const aretes = aretesMesurees();
const OUSD = P.DEVISES_BASE.find((x) => x.symbole === 'OUSD').adr.toLowerCase(), USDC = USDC_BASE.toLowerCase();
ok(aretes.some((a) => a.famille === 'uniswap-v4' && [String(a.de).toLowerCase(), String(a.vers).toLowerCase()].sort().join() === [OUSD, USDC].sort().join()),
  'faitsPoolLus vide : l arete OUSD <-> USDC (v4) vient de la pool mesuree');
const IB = (fs.readFileSync(path.join(ICI, 'pool-sans-hook.js'), 'utf8').match(/'(0xb20+e4b0[0-9a-f]+)', \/\* IB022/i) || [])[1];
const r = DD.devisesDentree({ block: IB, deviseDeLaPool: ETH, familleDuBlock: 'uniswap-v4', aretes,
  candidates: [{ adr: USDC, symbole: 'USDC', faitsLus: true }, { adr: OUSD, symbole: 'OUSD', faitsLus: false }] });
const o = (r.devises || []).find((d) => d.devise === OUSD);
ok(r.etat === 'OK' && o && o.tx === 1 && DD.peutEtreAssemblee(o).ok, 'OUSD -> USDC -> ETH -> IB022 : une transaction, assemblable — meme sans faits serveur');
/* temoin : sans la pool mesuree, OUSD n a pas de route (le defaut de prod) */
const sansMesure = new Function('ETH_ADR', 'USDC_BASE', 'faitsPoolLus', 'LOGS_INITIALIZE_MESURES', 'decoderInitialize', src + '\nreturn aretesMesurees;')(
  ETH, USDC_BASE, new Map(), [], PJ.decoderInitialize)();
const r0 = DD.devisesDentree({ block: IB, deviseDeLaPool: ETH, familleDuBlock: 'uniswap-v4', aretes: sansMesure,
  candidates: [{ adr: OUSD, symbole: 'OUSD', faitsLus: false }] });
const o0 = (r0.devises || []).find((d) => d.devise === OUSD);
ok(!o0 || !DD.peutEtreAssemblee(o0).ok, 'TEMOIN sans pool mesuree : OUSD non assemblable (le « no route » de prod)');
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
