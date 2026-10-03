/* test-paywith-bloc-v8-20261003.mjs — « PAY WITH » S OUVRE SUR NOS BLOCKS V8 (cotes en ETH) : USDC et OUSD, pas encore les actions.
 * ⛔ MESURE (prod, profil IB022) : « Pay with » cache, 0 option — familleDuBlock venait SEULEMENT de /api/prix-usd, qui ne
 *   connait pas les blocks. Correctif : la cle v4 LUE par le profil donne la famille uniswap-v4.
 * A. le graphe que l app aura pour IB022 : USDC et OUSD routables en UNE transaction (tout v4) ; une action Aerodrome reste
 *    non assemblable (Aerodrome PUIS v4 : forme pas encore construite) — dite, pas offerte. B. la ligne d app.html. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ICI = path.dirname(fileURLToPath(import.meta.url));
const imp = (f) => import(pathToFileURL(path.join(ICI, f)).href);
const DD = await imp('devises-dentree.js');
const { USDC_BASE } = await imp('frais-creation.js');
let n = 0, ko = 0;
const ok = (c, m) => { n += 1; if (c) console.log('ok  ' + m); else { ko += 1; console.log('KO  ' + m); } };
const ETH = '0x0000000000000000000000000000000000000000', USDC = USDC_BASE.toLowerCase();
/* adresses LUES dans le depot (registre, liste des blocks), jamais tapees */
const P = await imp('paires.js');
const OUSD = P.DEVISES_BASE.find((x) => x.symbole === 'OUSD').adr.toLowerCase();
const NV = P.ACTIONS_COINBASE.find((x) => x.symbole === 'NVDAc').adr.toLowerCase();
const IB = (fs.readFileSync(path.join(ICI, 'pool-sans-hook.js'), 'utf8').match(/'(0xb20+e4b0[0-9a-f]+)', \/\* IB022/i) || [])[1];
/* les aretes d aretesMesurees() quand OUSD (v4) et NVDAc (Aerodrome) ont des faits lus */
const aretes = [
  { de: ETH, vers: USDC, famille: 'uniswap-v4' }, { de: ETH, vers: USDC, famille: 'aerodrome' },
  { de: USDC, vers: OUSD, famille: 'uniswap-v4' }, { de: USDC, vers: NV, famille: 'aerodrome' },
];
const candidates = [{ adr: USDC, symbole: 'USDC', faitsLus: true }, { adr: OUSD, symbole: 'OUSD', faitsLus: true }, { adr: NV, symbole: 'NVDAc', faitsLus: true }];
const avant = DD.devisesDentree({ block: IB, deviseDeLaPool: ETH, familleDuBlock: null, candidates, aretes });
ok(avant.etat === 'REFUSE', 'TEMOIN avant : famille inconnue -> REFUSE (« Pay with » vide en prod)');
const r = DD.devisesDentree({ block: IB, deviseDeLaPool: ETH, familleDuBlock: 'uniswap-v4', candidates, aretes });
const par = (a) => (r.devises || []).find((d) => d.devise === a);
ok(r.etat === 'OK', 'apres : la cle v4 lue donne la famille -> OK');
const assemblable = (d) => d && DD.peutEtreAssemblee(d).ok;
ok(par(USDC) && par(USDC).tx === 1 && assemblable(par(USDC)), 'USDC -> ETH -> IB022 : une transaction, assemblable');
ok(par(OUSD) && par(OUSD).tx === 1 && assemblable(par(OUSD)), 'OUSD -> USDC -> ETH -> IB022 : une transaction, assemblable (Phil : OUSD)');
ok(par(NV) && !assemblable(par(NV)), 'NVDAc (Aerodrome) -> USDC -> ETH -> IB022 : NON assemblable aujourd hui (Aerodrome puis v4) — non offert');
/* B */
const html = fs.readFileSync(path.join(ICI, 'app.html'), 'utf8').replace(/\r\n/g, '\n');
ok(/: \(v && v\.etat === 'LUE' && v\.cle && \/\^0x\[0-9a-fA-F\]\{40\}\$\/\.test\(String\(v\.cle\.hooks \|\| ''\)\) \? 'uniswap-v4' : null\);/.test(html),
  'app.html : familleDuBlock tiree de la cle v4 lue quand le serveur ne connait pas le block');
console.log(n + ' assertions, ' + ko + ' KO');
process.exitCode = ko ? 1 : 0;
