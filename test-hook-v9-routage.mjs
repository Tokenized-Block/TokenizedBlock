/* HOOK V9 — l echafaudage cote app (2026-10-01). Le V9 n est PAS deploye : HOOK_V9 vaut null.
 * Ce test garantit :
 *   · tant que HOOK_V9 est null, RIEN ne change (le V8 reste le hook de toute Naissance sur Base) ;
 *   · UNE SEULE SOURCE : la liste du V9 vit dans paires.js a cote de celle du V8, et le routage
 *     (tokenomics `deviseVaSurV9` / `hookCourant`), la garde de Create (`refusPrixNouveauBlock`) et la
 *     garde de lancement (lancer-pool.js) lisent toutes `hookDeLancementPour` ;
 *   · DIVERGENCE : avec ET sans V9, sur chaque paire proposee sur Base, « Create refuse » est
 *     exactement le complement de « le routage donne un hook ».
 */
import { readFileSync } from 'fs';
import { HOOK_V8, HOOK_V7, HOOK_V9, OPTIONS_LANCEMENT, deviseVaSurV9, hookV9Deploye, estHookDeNaissance, estNotreHook,
  hookCourant } from './tokenomics.js';
import * as T from './tokenomics.js';
import { pairesProposees, ETH_NATIF, TBLOCK_MAINNET, DEVISES_ADMISES_V8, DEVISES_ADMISES_V9, hookDeLancementPour,
  refusPrixNouveauBlock } from './paires.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}
const bas = (a) => String(a).toLowerCase();
const offertes = pairesProposees(8453);
const sym = Object.fromEntries(offertes.map((p) => [p.symbole, bas(p.adr)]));

console.log('HOOK_V9 is not deployed — nothing changes');
ok('HOOK_V9 === null and OPTIONS_LANCEMENT.v9 === false', HOOK_V9 === null && OPTIONS_LANCEMENT.v9 === false);
ok('hookV9Deploye -> ABSENT without any read', await hookV9Deploye({ rpc: async () => { throw new Error('no read expected'); } }) === 'ABSENT');
const rpcV8 = async (m, p) => (m === 'eth_getCode' && bas(p[0]) === bas(HOOK_V8) ? '0x6080' : '0x');
for (const s of ['PLTRc', 'NVDAc', 'OUSD', 'USDC']) {
  ok('hookCourant(' + s + ') is still V8', await hookCourant({ rpc: rpcV8, mainnet: true, avecDevise: true, devise: sym[s] }) === HOOK_V8);
}
ok('estHookDeNaissance(V8) true, V7/null/0x0 false', estHookDeNaissance(HOOK_V8) && !estHookDeNaissance(HOOK_V7)
  && !estHookDeNaissance(null) && !estHookDeNaissance(ETH_NATIF));
ok('estNotreHook(V8) unchanged', estNotreHook(HOOK_V8) === true);

console.log('one source: no V9 list outside paires.js');
ok('tokenomics exports no currency list', !Object.keys(T).some((k) => /DEVISES/.test(k)), Object.keys(T).filter((k) => /DEVISES/.test(k)));
const offertesSansEth = offertes.map((p) => bas(p.adr)).filter((a) => a !== ETH_NATIF && a !== TBLOCK_MAINNET);
/* 2026-10-02 : 18 actions ajoutees aux paires ne sont PAS dans V9Devises.sol (liste figee au constructeur, hook non
 *   deploye). Le test le DIT au lieu de le cacher : tant qu elles n y sont pas, le nouveau hook les refuserait aussi. */
const NOUVELLES_20261002 = ['AMDc', 'ASTSc', 'CAKEc', 'DJTc', 'DUOLc', 'LLYc', 'MRNAc', 'MRVLc', 'NFLXc', 'NVAXc', 'ORCLc', 'PTONc', 'PYPLc', 'QUBTc', 'RBLXc', 'RDDTc', 'TTWOc', 'WENc'];
const symDe = new Map(offertes.map((p) => [bas(p.adr), p.symbole]));
ok('V9 list = every quote Create offers on Base except the 18 added 2026-10-02 (19, = V9Devises.sol)', DEVISES_ADMISES_V9.length === 19
  && new Set(DEVISES_ADMISES_V9).size === 19
  && JSON.stringify(offertesSansEth.filter((a) => !DEVISES_ADMISES_V9.includes(a)).map((a) => symDe.get(a)).sort()) === JSON.stringify([...NOUVELLES_20261002].sort()));
ok('V8 list is a subset of the V9 list', DEVISES_ADMISES_V8.every((a) => DEVISES_ADMISES_V9.includes(a)));
const srcTok = readFileSync('./tokenomics.js', 'utf8');
ok('deviseVaSurV9 reads hookDeLancementPour', /return hookDeLancementPour\(devise, 8453, \{ v9: true \}\) === 'V9';/.test(srcTok));

console.log('DIVERGENCE CHECK, with and without V9, over every pair offered on Base');
for (const v9 of [false, true]) {
  for (const p of offertes) {
    const route = hookDeLancementPour(p.adr, 8453, { v9 });
    const refus = refusPrixNouveauBlock(p.adr, 8453, { routable: true, symbole: p.symbole, v9 });
    ok((v9 ? '[V9 set] ' : '[V9 null] ') + p.symbole + ' -> ' + (route || 'refused'),
      (refus === null) === (route !== null) && (!v9 || (route === 'V9') === deviseVaSurV9(p.adr)), { route, refus });
  }
}
ok('[V9 null] no pair routes to V9, the 7 stay refused', offertes.every((p) => hookDeLancementPour(p.adr, 8453) !== 'V9')
  && ['OUSD', 'AVGOc', 'BEc', 'HIMSc', 'MUc', 'PLTRc', 'TOSHI'].every((s) => hookDeLancementPour(sym[s], 8453) === null));
console.log('what V9 changes once set');
for (const s of ['OUSD', 'AVGOc', 'BEc', 'HIMSc', 'MUc', 'PLTRc', 'NVDAc', 'TSLAc', 'SPCXc']) ok(s + ' -> V9', hookDeLancementPour(sym[s], 8453, { v9: true }) === 'V9');
for (const s of ['USDC', 'cbBTC']) ok(s + ' stays V8', hookDeLancementPour(sym[s], 8453, { v9: true }) === 'V8');
ok('ETH and TBLOCK stay V8', hookDeLancementPour(ETH_NATIF, 8453, { v9: true }) === 'V8' && hookDeLancementPour(TBLOCK_MAINNET, 8453, { v9: true }) === 'V8');
ok('TOSHI stays unrouted (its rail decides), so Create keeps refusing it', hookDeLancementPour(sym.TOSHI, 8453, { v9: true }) === null
  && refusPrixNouveauBlock(sym.TOSHI, 8453, { v9: true }) !== null);
ok('another block (pasted) is refused either way', hookDeLancementPour('0xb20000000000000000000084d0953bad205d563f', 8453, { v9: true }) === null);

console.log('wiring');
const lp = readFileSync('./lancer-pool.js', 'utf8');
ok('lancer-pool Birth guard uses estHookDeNaissance', /&& !estHookDeNaissance\(hooks\)\) \{/.test(lp));
ok('lancer-pool V8 launch guard reads hookDeLancementPour', /hookDeLancementPour\(devise, chaine\) !== 'V8'\)/.test(lp));
ok('lancer-pool V9 launch guard reads hookDeLancementPour', /hookDeLancementPour\(devise, chaine, \{ v9: true \}\) !== 'V9'\)/.test(lp));
const app = readFileSync('./app.html', 'utf8');
/* 2026-10-02 (fix-2) : un 3e site — la pre-verification avant createPaid — lit le meme hook ; TOUS passent la devise. */
{ const sites = app.match(/hookCourant\(\{[^}]*\}\)/g) || [];
  ok('every hookCourant call site passes the quote (' + sites.length + ' sites)', sites.length === 3
    && sites.every((x) => /devise(: deviseLancement \|\| null|\s*\})/.test(x))); }
ok('no call site still demands V8 by string compare', !/!== String\(HOOK_V8\)\.toLowerCase\(\)/.test(app));
ok('the Create guard passes OPTIONS_LANCEMENT (V9 lets its quotes through by construction)', /symbole: q\.paire\.symbole, \.\.\.OPTIONS_LANCEMENT \}\)/.test(app));

console.log('\n' + (n - ko) + '/' + n + (ko ? '  ⛔ ' + ko + ' KO' : '  ✅'));
process.exit(ko ? 1 : 0);
