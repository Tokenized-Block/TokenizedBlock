/* Ce que ce module rend possible, et le piege exact qu il existe pour refuser.
 *
 * Mesure du 2026-09-30 : OUSD/USDC porte 10 M$ AU PAIR (Uniswap V4, fee 100, ts 1, tick -1) et
 * ZERO pool Aerodrome CL sur les NEUF espacements declares. AAPLc/USDC, elle, en a deux.
 * ⛔ Un routeur qui prend « la pool la plus profonde » jambe par jambe composerait donc une route
 *   a cheval sur deux factories : chaque jambe existe, et l appel reverte. Le piege a l air
 *   correct — c est pour ca qu il faut un module qui le refuse explicitement.
 */
import { FAMILLES, ETATS, factoryPourLaRoute, routeFranchissable, phraseRoute } from './route-multi-factory.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}

/* Adresses LUES dans le depot, jamais rappelees de memoire. */
const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const OUSD = '0xB2000000000000000000002fEb517dFeC7415344';
const AAPL = '0xb200000000000000000000c2e324d24d7eecd1fb';
const BLOCK = '0xb20000000000000000000084d0953bad205d563f';

console.log('le cas MESURE : la route OUSD ne tient que sur Uniswap V4');
const routeOusd = [{ de: WETH, vers: USDC }, { de: USDC, vers: OUSD }, { de: OUSD, vers: BLOCK }];
/* Ce que la chaine dit reellement, mesure ce jour-la. */
const poolsReelles = {
  aerodrome: [{ de: USDC, vers: WETH }],                       /* 3 pools, mais la SEULE jambe utile */
  'uniswap-v4': [{ de: WETH, vers: USDC }, { de: USDC, vers: OUSD }, { de: OUSD, vers: BLOCK }],
};
ok('Uniswap V4 porte les trois jambes -> OK',
  factoryPourLaRoute(routeOusd, poolsReelles).etat === 'OK',
  factoryPourLaRoute(routeOusd, poolsReelles));
ok('et la famille rendue est bien uniswap-v4',
  factoryPourLaRoute(routeOusd, poolsReelles).famille === 'uniswap-v4');
ok('la route est declaree franchissable', routeFranchissable(factoryPourLaRoute(routeOusd, poolsReelles)));

console.log('');
console.log('⛔⛔ LE PIEGE : chaque jambe existe, mais sur DEUX factories differentes');
/* ⛔ C EST LE CAS QUI JUSTIFIE TOUT LE MODULE. Aerodrome a WETH/USDC (mesure : 3 pools),
 *   Uniswap V4 a USDC/OUSD. Un routeur « meilleure pool par jambe » composerait les deux. */
const acheval = {
  aerodrome: [{ de: WETH, vers: USDC }],
  'uniswap-v4': [{ de: USDC, vers: OUSD }, { de: OUSD, vers: BLOCK }],
};
const r = factoryPourLaRoute(routeOusd, acheval);
ok('toutes les jambes existent quelque part, et la route est REFUSEE', r.etat === 'REFUSE', r);
ok('le refus dit que le probleme est de traverser deux factories',
  /cannot cross factories/i.test(r.pourquoi), r.pourquoi);
ok('et il NOMME la ou les jambes qui manquent a la meilleure factory',
  Array.isArray(r.manquantes) && r.manquantes.length > 0, r.manquantes);
ok('⛔ une route refusee n est JAMAIS franchissable', routeFranchissable(r) === false);
ok('⛔ et elle ne rend AUCUNE famille', r.famille === null);

console.log('');
console.log('une pool n a pas de sens : A/B sert A->B et B->A');
/* ⛔ Exiger l ordre ferait refuser une route franchissable, et ce refus coute un achat. */
ok('la jambe USDC->OUSD est satisfaite par une pool OUSD/USDC',
  factoryPourLaRoute([{ de: USDC, vers: OUSD }],
    { 'uniswap-v4': [{ de: OUSD, vers: USDC }] }).etat === 'OK');
ok('la casse des adresses ne change rien',
  factoryPourLaRoute([{ de: USDC.toUpperCase(), vers: OUSD.toLowerCase() }],
    { 'uniswap-v4': [{ de: OUSD, vers: USDC }] }).etat === 'OK');

console.log('');
console.log('le cas des actions tokenisees reste intact (Aerodrome le porte)');
const routeAction = [{ de: WETH, vers: USDC }, { de: USDC, vers: AAPL }, { de: AAPL, vers: BLOCK }];
ok('Aerodrome porte la route action -> OK',
  factoryPourLaRoute(routeAction, { aerodrome: routeAction }).famille === 'aerodrome');
/* ⛔ ET SI LES DEUX LA PORTENT, L ORDRE DE `FAMILLES` TRANCHE — jamais l ordre des cles recues.
 *   Deux appelants qui construisent le meme objet differemment doivent obtenir la MEME route. */
ok('les deux completes -> aerodrome (ordre de FAMILLES)',
  factoryPourLaRoute(routeAction, { aerodrome: routeAction, 'uniswap-v4': routeAction }).famille === 'aerodrome');
ok('et l ordre des cles recues ne le change pas',
  factoryPourLaRoute(routeAction, { 'uniswap-v4': routeAction, aerodrome: routeAction }).famille === 'aerodrome');

console.log('');
console.log('une famille inconnue est IGNOREE et NOMMEE, jamais silencieuse');
/* ⛔ La taire ferait lire « aucune factory ne porte la route » alors qu on n aurait pas su lire
 *   celle-la. Une ignorance silencieuse se lit comme un fait. */
const inc = factoryPourLaRoute(routeOusd, { 'sushi-v9': routeOusd });
ok('elle ne rend PAS OK sur une famille qu on ne sait pas construire', inc.etat === 'REFUSE', inc);
ok('et elle nomme la famille ignoree', inc.ignorees.includes('sushi-v9'), inc.ignorees);
ok('une famille connue ET une inconnue : la connue decide, l inconnue est listee', (() => {
  const x = factoryPourLaRoute(routeOusd, { 'uniswap-v4': routeOusd, 'sushi-v9': routeOusd });
  return x.etat === 'OK' && x.famille === 'uniswap-v4' && x.ignorees.includes('sushi-v9');
})(), factoryPourLaRoute(routeOusd, { 'uniswap-v4': routeOusd, 'sushi-v9': routeOusd }));

console.log('');
console.log('les entrees absurdes REFUSENT au lieu de supposer');
ok('aucune jambe -> REFUSE', factoryPourLaRoute([], { aerodrome: [] }).etat === 'REFUSE');
ok('jambes non tableau -> REFUSE', factoryPourLaRoute(null, {}).etat === 'REFUSE');
ok('une jambe sans `vers` -> REFUSE',
  factoryPourLaRoute([{ de: USDC }], { aerodrome: [{ de: USDC, vers: OUSD }] }).etat === 'REFUSE');
ok('une jambe avec une chaine vide -> REFUSE',
  factoryPourLaRoute([{ de: '', vers: OUSD }], { aerodrome: [{ de: '', vers: OUSD }] }).etat === 'REFUSE');
/* ⛔ AUCUNE POOL MESUREE N EST PAS « TOUT PASSE ». C est le sens sur : sans mesure, on refuse. */
ok('aucune pool mesuree -> REFUSE, jamais OK',
  factoryPourLaRoute(routeOusd, {}).etat === 'REFUSE');
ok('poolsParFamille absent -> REFUSE', factoryPourLaRoute(routeOusd).etat === 'REFUSE');
ok('une famille dont la valeur n est pas un tableau -> REFUSE',
  factoryPourLaRoute(routeOusd, { aerodrome: 'plein' }).etat === 'REFUSE');
ok('sans argument du tout -> REFUSE', factoryPourLaRoute().etat === 'REFUSE');

console.log('');
console.log('la phrase : le refus NOMME la jambe, sinon il se lit comme une panne');
const noms = {}; noms[USDC.toLowerCase()] = 'USDC'; noms[OUSD.toLowerCase()] = 'OUSD';
noms[WETH.toLowerCase()] = 'WETH';
ok('un succes dit par ou ca passe',
  /uniswap-v4/.test(phraseRoute(factoryPourLaRoute(routeOusd, poolsReelles))),
  phraseRoute(factoryPourLaRoute(routeOusd, poolsReelles)));
ok('un refus nomme la jambe manquante avec son symbole', (() => {
  const s = phraseRoute(r, noms);
  return /USDC/.test(s) && /cannot be made in one call/i.test(s);
})(), phraseRoute(r, noms));
ok('et il dit POURQUOI (un swap ne traverse pas deux places)',
  /cannot cross them/i.test(phraseRoute(r, noms)), phraseRoute(r, noms));
/* ⛔ SANS SYMBOLE CONNU, ON N INVENTE PAS DE NOM : l adresse abregee, pas un ticker devine. */
ok('sans symbole, la phrase abrege l adresse et n invente pas de nom', (() => {
  const s = phraseRoute(r);
  return /0x/.test(s) && !/USDC/.test(s);
})(), phraseRoute(r));
ok('null PARLE', phraseRoute(null).length > 0);
ok('un etat inconnu PARLE aussi', phraseRoute({ etat: 'PEUT_ETRE' }).length > 0);

console.log('');
console.log('les listes gelees le restent');
ok('FAMILLES est gelee', Object.isFrozen(FAMILLES));
ok('ETATS est gelee', Object.isFrozen(ETATS));
ok('FAMILLES porte les deux jambes qu on sait construire',
  FAMILLES.includes('aerodrome') && FAMILLES.includes('uniswap-v4'), [...FAMILLES]);

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
