/* test-missions-rail-20261017.mjs - L ENCODAGE DES ARGUMENTS DE MissionsDeployer EST CELUI DE FOUNDRY, ET LA PAGE REFUSE UNE DONNEE ALTEREE.
 * AFFIRME : (1) encoderArgsDeployer = `cast abi-encode "constructor((address x7),address[],address[],uint8[],((address,address,uint24,int24,
 *   address),bool)[])"` OCTET POUR OCTET (sortie de cast copiee le 2026-10-17 dans test-missions-rail-cast-20261017.hex, et recalculee si cast
 *   est present) ; (2) RAIL_ROUTE : UNIT -> ETH (pool du hook 7030, zeroForOne false) -> USDC (v4 500/10, true), hook et USDC lus dans le depot ;
 *   (3) la verification de deployer-missions.html (rejouee ici a l identique) ACCEPTE une donnee intacte et REFUSE : un octet change dans les
 *   arguments, une route differente de celle du depot, un autre contrat que MissionsDeployer.
 * NE PROUVE PAS : le deploiement (banc-missions-factory-fork-20261017.mjs : 25/25 sur fork Base, vente du rail incluse). */
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { encoderArgsDeployer, RAIL_ROUTE, UNIT_BLOCK } from './missions-rail.js';
import { HOOK_7030 } from './tokenomics.js';
import { USDC_BASE } from './frais-creation.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const A = (h) => '0x' + h.repeat(20);
const v3 = { hook: A('11'), poolManager: A('22'), devWallet: A('33'), communityReserve: A('44'), usdc: A('55'), verifier: A('66'), guardian: A('77') };
const dd = [A('aa'), A('bb')];
const js = '0x' + encoderArgsDeployer(v3, dd, RAIL_ROUTE);
const fixture = readFileSync(new URL('./test-missions-rail-cast-20261017.hex', import.meta.url), 'utf8').trim().toLowerCase();
vu(js === fixture, 'encoderArgsDeployer = la sortie de cast abi-encode (fixture), octet pour octet');
const CAST = 'C:/Users/VolKov/.foundry/bin/cast.exe';
if (existsSync(CAST)) {
  const h = (k) => '(' + [k.key.currency0, k.key.currency1, k.key.fee, k.key.tickSpacing, k.key.hooks].join(',') + '),' + k.zeroForOne;
  const r = spawnSync(CAST, ['abi-encode', 'constructor((address,address,address,address,address,address,address),address[],address[],uint8[],((address,address,uint24,int24,address),bool)[])',
    '(' + Object.values(v3).join(',') + ')', '[' + dd.join(',') + ']', '[' + RAIL_ROUTE.tokens.join(',') + ']', '[' + RAIL_ROUTE.hopCount.join(',') + ']',
    '[' + RAIL_ROUTE.hops.map((k) => '(' + h(k) + ')').join(',') + ']'], { encoding: 'utf8' });
  vu(r.status === 0 && r.stdout.trim().toLowerCase() === js, 'cast (recalcule maintenant) = l encodeur JS');
} else console.log('  (cast absent : seule la fixture est comparee)');
/* (2) */
const [h1, h2] = RAIL_ROUTE.hops;
vu(RAIL_ROUTE.tokens.length === 1 && RAIL_ROUTE.tokens[0] === UNIT_BLOCK && RAIL_ROUTE.hopCount[0] === 2, 'une route : UNIT, 2 sauts');
vu(h1.key.currency1 === UNIT_BLOCK && h1.key.hooks === String(HOOK_7030).toLowerCase() && h1.key.fee === 0 && h1.key.tickSpacing === 200 && h1.zeroForOne === false,
  'saut 1 : UNIT -> ETH sur la pool UNIT du hook 7030 (UNIT = currency1 -> zeroForOne false)');
vu(h2.key.currency1 === String(USDC_BASE).toLowerCase() && h2.key.fee === 500 && h2.key.tickSpacing === 10 && /^0x0{40}$/.test(h2.key.hooks) && h2.zeroForOne === true,
  'saut 2 : ETH -> USDC, v4 0,05 % sans hook');
/* (3) la verification de la page, rejouee a l identique (deployer-missions.html) */
const page = readFileSync(new URL('./deployer-missions.html', import.meta.url), 'utf8');
vu(/const attendu = encoderArgsDeployer\(D\.constructeur, D\.devDirect, RAIL_ROUTE\);/.test(page) && /JSON\.stringify\(D\.route\) === JSON\.stringify\(RAIL_ROUTE\)/.test(page)
  && /D\.contrat === 'MissionsDeployer'/.test(page), 'la page recalcule avec CET encodeur, exige la route du depot et le contrat MissionsDeployer');
const verifie = (D) => { const attendu = encoderArgsDeployer(D.constructeur, D.devDirect, RAIL_ROUTE);
  return D.contrat === 'MissionsDeployer' && JSON.stringify(D.route) === JSON.stringify(RAIL_ROUTE) && D.creation.toLowerCase().endsWith(attendu) && attendu.length / 2 === D.octetsArgs; };
const args = encoderArgsDeployer(v3, dd, RAIL_ROUTE);
const D0 = { contrat: 'MissionsDeployer', constructeur: v3, devDirect: dd, route: JSON.parse(JSON.stringify(RAIL_ROUTE)), creation: '0x6080604052' + args, octetsArgs: args.length / 2 };
vu(verifie(D0), 'donnee intacte : acceptee');
const i = 10 + 64 * 5 + 63, altere = D0.creation.slice(0, i) + (D0.creation[i] === '0' ? '1' : '0') + D0.creation.slice(i + 1);
vu(!verifie({ ...D0, creation: altere }), 'UN caractere change dans les arguments : refusee');
vu(!verifie({ ...D0, route: { ...D0.route, hopCount: [1] } }), 'une route qui n est pas celle du depot : refusee');
vu(!verifie({ ...D0, contrat: 'BlockMissionsV3' }), 'un autre contrat que MissionsDeployer : refusee');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
vu(/'missions-rail\.js',/.test(srv), 'missions-rail.js est SERVI (sinon la page meurt a l import)');
console.log('ok missions-rail - ' + n + ' assertions');
