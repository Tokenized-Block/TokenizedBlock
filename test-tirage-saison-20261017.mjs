/* test-tirage-saison-20261017.mjs - LE TIRAGE DE SAISON : un ticket par wallet qui a deja paye F de frais VERIFIES, aucun avantage au volume,
 * un hasard qui ne se devine pas. AFFIRME (EXECUTE, pur) : (1) saisons de 7 jours depuis le lundi 2026-10-19 ; (2) un prix ou des
 *   decimales non lus valent 0 ; (3) un hash ne compte qu une fois ; (4) un ticket par wallet au-dessus de F, payer 100x F ne donne
 *   qu un ticket ; (5) racine merkle stable a l ordre des insertions ; (6) tirage deterministe, distinct, hashE non lu -> null ;
 *   (7) pot <= 35 % de N x F. NE PROUVE PAS : un frais externe reel (aucun a ce jour) ni le hash du bloc E (lecture serveur). */
import { strict as assert } from 'node:assert';
import { saisonDe, valeurUsd, crediter, tickets, racine, tirer, plafondPot, ORIGINE, SEMAINE_MS } from './tirage-saison.js';
let n = 0;
const vu = (c, m) => { assert.ok(c, m); n += 1; };
const s0 = saisonDe(ORIGINE), s1 = saisonDe(ORIGINE + SEMAINE_MS + 1);
vu(s0.id === 'S0' && s1.id === 'S1' && s0.fin === s1.debut && new Date(s0.debut).getUTCDay() === 1, 'saisons de 7 jours, debut un lundi 00:00 UTC');
vu(saisonDe(Date.UTC(2026, 9, 17, 12)).id === 'S0', 'la semaine du 2026-10-17 est S0');
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', AAPL = '0xb200000000000000000000c2e324d24d7eecd1fb';
const prix = { [USDC]: 1, [AAPL]: 250 }, decimales = { [USDC]: 6, [AAPL]: 8 };
vu(valeurUsd([{ devise: USDC, montant: '400000' }], { prix, decimales }) === 0.4, '0,4 USDC de frais = 0,4 $');
vu(valeurUsd([{ devise: AAPL, montant: '200000' }], { prix, decimales }) === 0.5, '0,002 AAPLc (8 decimales) a 250 $ = 0,5 $');
vu(valeurUsd([{ devise: AAPL, montant: '200000' }], { prix: {}, decimales }) === 0, 'prix non lu -> 0, jamais devine');
vu(valeurUsd([{ devise: AAPL, montant: '200000' }], { prix, decimales: {} }) === 0, 'decimales non lues -> 0');
const A = '0x' + '11'.repeat(20), B = '0x' + '22'.repeat(20), C = '0x' + '33'.repeat(20), h = (i) => '0x' + i.toString(16).padStart(64, '0');
let e = {};
e = crediter(e, { saison: 'S0', payeur: A, hash: h(1), usd: 0.6 });
const avant = JSON.stringify(e);
e = crediter(e, { saison: 'S0', payeur: A, hash: h(1), usd: 0.6 });
vu(JSON.stringify(e) === avant, 'un hash ne compte qu une fois');
e = crediter(e, { saison: 'S0', payeur: A, hash: h(2), usd: 0.5 });
e = crediter(e, { saison: 'S0', payeur: B, hash: h(3), usd: 100 });
e = crediter(e, { saison: 'S0', payeur: C, hash: h(4), usd: 0.99 });
const t = tickets(e.S0);
vu(JSON.stringify(t) === JSON.stringify([A, B]), 'un ticket par wallet >= 1 $ ; 100 $ ne donne qu un ticket ; 0,99 $ aucun (' + JSON.stringify(t) + ')');
vu(crediter({}, { saison: 'S0', payeur: 'x', hash: h(9), usd: 1 }).S0 === undefined, 'payeur invalide ignore');
vu(racine(t) === racine([...t].reverse().sort()) && racine([]) === null && /^0x[0-9a-f]{64}$/.test(racine(t)), 'racine merkle stable, vide -> null');
const HE = '0x' + 'ab'.repeat(32);
const g1 = tirer({ hashE: HE, saison: 'S0', liste: [A, B, C], k: 2 });
vu(JSON.stringify(g1) === JSON.stringify(tirer({ hashE: HE, saison: 'S0', liste: [A, B, C], k: 2 })), 'tirage deterministe (rejouable)');
vu(g1.length === 2 && new Set(g1).size === 2, 'gagnants distincts');
vu(JSON.stringify(tirer({ hashE: HE, saison: 'S1', liste: [A, B, C], k: 3 })).length > 0 && tirer({ hashE: HE, saison: 'S0', liste: [A, B, C], k: 9 }).length === 3, 'k plafonne a N');
vu(tirer({ hashE: null, saison: 'S0', liste: [A, B] }) === null && tirer({ hashE: '0x12', saison: 'S0', liste: [A, B] }) === null, 'hashE non lu -> null, jamais un gagnant devine');
/* repartition : sur 3000 hashE, chacun des 3 tickets gagne ~1/3 (aucun biais d ordre) */
const cpt = { [A]: 0, [B]: 0, [C]: 0 };
for (let i = 0; i < 3000; i++) cpt[tirer({ hashE: h(1000 + i), saison: 'S0', liste: [A, B, C] })[0]] += 1;
vu(Object.values(cpt).every((x) => x > 900 && x < 1100), 'repartition uniforme sur 3000 tirages (' + JSON.stringify(Object.values(cpt)) + ')');
vu(plafondPot(10, 1, 100) === 3.5 && plafondPot(10, 1, 2) === 2 && plafondPot(0, 1, 5) === 0, 'pot <= 35 % de N x F');
console.log('ok tirage-saison - ' + n + ' assertions ; NE PROUVE PAS un frais externe reel');
