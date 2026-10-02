/* test-parts-bloc.mjs — hors reseau. node test-parts-bloc.mjs
 * Split du block (Raksha 10:21), drapeau OFF : 0,10 % = 0,07 % a6cf + 0,03 % createur (s il tient son minimum,
 * sinon au collateral du block). Drapeau OFF : le 0,09 % en vigueur, inchange. */
import { RACHAT_DETENTEURS_ACTIVE, SPLIT_BLOC, PPM_TOTAL, adresseCollateral, nouveauRegistre, inscrireBloc, releverMinimum, montantsParts, noeudPartsBloc, routeParts, planifierBloc } from './parts-bloc.js';
import { ADRESSES, CMD, construireRoute, devisesFraisAdmises, FRAIS_BPS, FRAIS_PPM, BPS_A6CF_SPLIT_BLOC } from './multipool.js';
let n = 0, ko = 0;
const ok = (nom, c, vu) => { n += 1; if (c) console.log('  ok  ' + nom); else { ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '  vu: ' + vu)); } };
const J = (x) => JSON.stringify(x, (_, v) => (typeof v === 'bigint' ? String(v) : v));
const BLOC = '0xb2000000000000000000001eb03f58a18f2add01', NVDA = '0xb20000000000000000000078ee7ce2fe4908108c';
const CREA = '0x7e57000000000000000000000000000000c4ea70', USER = '0x7e57000000000000000000000000000000c0ffee';
const ADM = devisesFraisAdmises([NVDA], { blocks: [BLOC] });
const v4 = (a, b) => ({ venue: 'uniswap-v4', cle: { currency0: a < b ? a : b, currency1: a < b ? b : a, fee: 0, tickSpacing: 200, hooks: '0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc' } });
const v3 = (a, b) => ({ venue: 'uniswap-v3', pool: '0x' + '1'.repeat(40), fee: 500, token0: a < b ? a : b, token1: a < b ? b : a });
const chemin = [{ de: BLOC, vers: NVDA, e: v4(BLOC, NVDA) }, { de: NVDA, vers: ADRESSES.USDC, e: v3(NVDA, ADRESSES.USDC) }];
const bpsDe = (h) => BigInt('0x' + h.slice(128));

ok('0a. drapeau OFF par defaut', RACHAT_DETENTEURS_ACTIVE === false);
ok('0b. le 0,09 % en vigueur est intact (9 bps, 900 ppm)', FRAIS_BPS === 9n && FRAIS_PPM === 900n);
ok('0c. split ON : 700 + 300 = 1000 ppm, a6cf 7 bps', SPLIT_BLOC.a6cfPpm === 700n && SPLIT_BLOC.createurPpm === 300n && PPM_TOTAL === 1000n && SPLIT_BLOC.a6cfBps === 7n && BPS_A6CF_SPLIT_BLOC === 7n);
const off = montantsParts(10n ** 18n);
ok('0d. drapeau OFF : a6cf 0,09 %, createur 0, collateral 0', off.a6cf === 9n * 10n ** 14n && off.createur === 0n && off.collateral === 0n && off.total === off.a6cf && off.a6cfBps === 9n, J(off));

for (const m of [1n, 999n, 1000n, 3333n, 9999n, 10001n, 123456789n, 10n ** 18n + 7n, 3n * 10n ** 25n + 12345n]) {
  const h = montantsParts(m, { actif: true, soldeCreateur: 10n, minimumCreateur: 10n });
  const b = montantsParts(m, { actif: true, soldeCreateur: 9n, minimumCreateur: 10n });
  ok('1. m=' + m + ' createur AU minimum : a6cf floor(m*700/1e6), createur floor(m*300/1e6), collateral 0',
    h.a6cf === (m * 700n) / 1000000n && h.createur === (m * 300n) / 1000000n && h.collateral === 0n && h.createurAuDessus === true, J(h));
  ok('2. m=' + m + ' createur SOUS le minimum : createur 0, collateral floor(m*300/1e6), a6cf inchange',
    b.a6cf === h.a6cf && b.createur === 0n && b.collateral === (m * 300n) / 1000000n && b.total === h.total, J(b));
  ok('3. m=' + m + ' PAY_PORTION 7 bps == floor(m*700/1e6)', (m * 7n) / 10000n === (m * 700n) / 1000000n);
}

const reg = nouveauRegistre();
ok('4a. inscription', inscrireBloc(reg, { block: BLOC, action: NVDA, createur: CREA, minimumCreateur: 1000n }).etat === 'OK');
ok('4b. le minimum est fixe UNE fois (2e inscription refusee)', inscrireBloc(reg, { block: BLOC, action: NVDA, createur: CREA, minimumCreateur: 1n }).etat === 'REFUSE');
ok('4c. relever : OK', releverMinimum(reg, BLOC, 2000n).etat === 'OK' && reg.get(BLOC).minimumCreateur === 2000n);
ok('4d. baisser : REFUSE', releverMinimum(reg, BLOC, 1999n).etat === 'REFUSE' && reg.get(BLOC).minimumCreateur === 2000n);
ok('4e. a6cf ne peut pas etre createur', inscrireBloc(nouveauRegistre(), { block: BLOC, action: NVDA, createur: ADRESSES.FEE_WALLET, minimumCreateur: 1n }).etat === 'REFUSE');
ok('4f. collateral derive, stable, distinct de tout acteur', reg.get(BLOC).collateral === adresseCollateral(BLOC) && /^0x[0-9a-f]{40}$/.test(reg.get(BLOC).collateral) && ![CREA, USER, ADRESSES.FEE_WALLET, BLOC, NVDA].includes(reg.get(BLOC).collateral));

const np = noeudPartsBloc(chemin, reg, ADM);
ok('5a. noeud des parts = l action appariee (indice 1)', np.etat === 'OK' && np.indice === 1, J(np));
ok('5b. chemin sans block inscrit : SANS_PART_BLOC', noeudPartsBloc([chemin[1]], reg, ADM).etat === 'SANS_PART_BLOC');

const m0 = 5n * 10n ** 9n;
for (const [nom, solde, qui] of [['au minimum', 5000n, CREA], ['sous le minimum', 1999n, reg.get(BLOC).collateral]]) {
  const parts = montantsParts(m0, { actif: true, soldeCreateur: solde, minimumCreateur: 2000n });
  const rt = routeParts({ chemin, montant: 10n ** 18n, minSortie: 1n, destinataire: USER, deadline: 1n << 40n, indice: 1, admises: ADM, entree: reg.get(BLOC), parts });
  const pp = rt.commandes.map((c, i) => [c, i]).filter(([c]) => c === CMD.PAY_PORTION);
  const trs = rt.commandes.map((c, i) => [c, i]).filter(([c]) => c === CMD.TRANSFER);
  ok('6a. ' + nom + ' : 1 PAY_PORTION a6cf 7 bps puis 1 TRANSFER, au meme noeud, avant le SWEEP',
    rt.etat === 'PRET' && pp.length === 1 && trs.length === 1 && trs[0][1] === pp[0][1] + 1 && rt.commandes[rt.commandes.length - 1] === CMD.SWEEP && bpsDe(rt.entrees[pp[0][1]]) === 7n, J([rt.etat, rt.pourquoi, rt.commandes]));
  ok('6b. ' + nom + ' : PAY_PORTION vers a6cf en NVDAc', rt.entrees[pp[0][1]].includes(NVDA.slice(2)) && rt.entrees[pp[0][1]].includes(ADRESSES.FEE_WALLET.slice(2)));
  ok('6c. ' + nom + ' : TRANSFER de floor(m*300/1e6) vers ' + (qui === CREA ? 'le createur' : 'le collateral'), rt.entrees[trs[0][1]].includes(qui.slice(2)) && bpsDe(rt.entrees[trs[0][1]]) === (m0 * 300n) / 1000000n);
}

const base = { chemin, montant: 10n ** 18n, minSortie: 1n, destinataire: USER, deadline: 1n << 40n, admises: ADM };
const x = (q, v) => [{ qui: q, montant: v }];
ok('7a. TEMOIN part prise en BLOCK (noeud 0) : REFUSE', construireRoute({ ...base, fraisIndice: 0, partsFrais: [{ qui: ADRESSES.FEE_WALLET, bps: 7n }], bpsA6cf: 7n, partsExactes: x(CREA, 5n) }).etat === 'REFUSE');
ok('7b. TEMOIN a6cf a 6 bps + part : REFUSE', construireRoute({ ...base, fraisIndice: 1, partsFrais: [{ qui: ADRESSES.FEE_WALLET, bps: 6n }], bpsA6cf: 6n, partsExactes: x(CREA, 5n) }).etat === 'REFUSE');
ok('7c. TEMOIN a6cf a 6 bps declare 7 : REFUSE', construireRoute({ ...base, fraisIndice: 1, partsFrais: [{ qui: ADRESSES.FEE_WALLET, bps: 6n }], bpsA6cf: 7n, partsExactes: x(CREA, 5n) }).etat === 'REFUSE');
ok('7d. TEMOIN 7 bps SANS part createur/collateral (a6cf rogne en douce) : REFUSE', construireRoute({ ...base, fraisIndice: 1, partsFrais: [{ qui: ADRESSES.FEE_WALLET, bps: 7n }], bpsA6cf: 7n }).etat === 'REFUSE');
ok('7e. TEMOIN 8 bps : REFUSE', construireRoute({ ...base, fraisIndice: 1, partsFrais: [{ qui: ADRESSES.FEE_WALLET, bps: 8n }], bpsA6cf: 8n, partsExactes: x(CREA, 5n) }).etat === 'REFUSE');
ok('7f. TEMOIN une part exacte VERS a6cf : REFUSE', construireRoute({ ...base, fraisIndice: 1, partsExactes: x(ADRESSES.FEE_WALLET, 5n) }).etat === 'REFUSE');
ok('7g. TEMOIN le meme destinataire deux fois : REFUSE', construireRoute({ ...base, fraisIndice: 1, partsExactes: [...x(CREA, 5n), ...x(CREA, 5n)] }).etat === 'REFUSE');
ok('7h. TEMOIN deux parts en bips : REFUSE', construireRoute({ ...base, fraisIndice: 1, partsFrais: [{ qui: ADRESSES.FEE_WALLET, bps: 7n }, { qui: CREA, bps: 3n }], bpsA6cf: 7n, partsExactes: x(USER, 5n) }).etat === 'REFUSE');
ok('7i. TEMOIN montant non bigint : REFUSE', construireRoute({ ...base, fraisIndice: 1, partsExactes: [{ qui: CREA, montant: 5 }] }).etat === 'REFUSE');
const sans = construireRoute({ ...base, fraisIndice: 1 });
ok('7j. route par defaut : le 0,09 % en vigueur (1 PAY_PORTION 9 bps, aucun TRANSFER)', sans.etat === 'PRET' && !sans.commandes.includes(CMD.TRANSFER) && sans.commandes.filter((c) => c === CMD.PAY_PORTION).length === 1 && bpsDe(sans.entrees[sans.commandes.indexOf(CMD.PAY_PORTION)]) === 9n);

/* planifierBloc avec un rpc qui cote 1:1 */
const rpc = async (meth, p) => { if (meth !== 'eth_call') throw new Error(meth); const d = p[0].data; const v = BigInt('0x' + d.slice(10 + 64 * 7, 10 + 64 * 8)); return '0x' + v.toString(16).padStart(64, '0') + '0'.repeat(64); };
const aretes = [{ ...chemin[0].e }];
const M = 10n ** 6n;
const pOff = await planifierBloc({ rpc, aretes, de: BLOC, vers: NVDA, montant: M, destinataire: USER, admises: ADM, registre: reg, soldeCreateur: async () => 10n ** 30n, deadline: 1n << 40n });
ok('8a. drapeau OFF : 0,09 % en vigueur, aucun TRANSFER', pOff.partsBloc === null && pOff.etat === 'PRET' && !pOff.tx.commandes.includes(CMD.TRANSFER) && pOff.meilleur.sortie === M - 900n, J({ e: pOff.etat, p: pOff.pourquoi, s: pOff.meilleur && pOff.meilleur.sortie }));
const pOn = await planifierBloc({ rpc, aretes, de: BLOC, vers: NVDA, montant: M, destinataire: USER, admises: ADM, registre: reg, soldeCreateur: async () => 10n ** 30n, deadline: 1n << 40n, actif: true });
ok('8b. drapeau ON (explicite) : parts au noeud NVDAc, sortie = m - 0,10 %', pOn.etat === 'PRET' && pOn.partsBloc.etat === 'OK' && pOn.meilleur.fraisIndice === 1 && pOn.meilleur.sortie === M - 1000n && pOn.tx.commandes.filter((c) => c === CMD.TRANSFER).length === 1, J({ e: pOn.etat, p: pOn.pourquoi, s: pOn.meilleur && pOn.meilleur.sortie }));
ok('8c. minimum applique APRES toutes les parts (tolerance sur la sortie nette)', pOn.minSortie === ((M - 1000n) * 9900n) / 10000n);
console.log(String.fromCharCode(10) + n + ' assertions, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
