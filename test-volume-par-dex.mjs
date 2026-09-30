/* Ce que ce test tient — et pourquoi chaque cas existe.
 *
 * Le cas 4 est celui qui m a REELLEMENT coute une mesure fausse : j ai compte sur
 * `origine` et `vol24`, deux champs absents de la charge servie. Le resultat n a pas
 * leve : il a rendu 186 lignes dans UNE case et un volume total de 0 $. Un agregat
 * sur une charge non conforme doit rendre null, pas un tableau net.
 */
import {
  CHAMPS_TRENDING_ATTENDUS, DEX_ABSENT, BPS_INTERFACE,
  verifierForme, agregerParDex, plafondFrais, phrasePlafond,
} from './volume-par-dex.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}

const CONFORME = [
  { adr: '0xa', sym: 'A', volume24hUsd: 100, liquiditeUsd: 10, trades24h: 4, dex: 'aerodrome', quoteSym: 'USDC' },
  { adr: '0xb', sym: 'B', volume24hUsd: 300, liquiditeUsd: 30, trades24h: 6, dex: 'uniswap', quoteSym: 'WETH' },
  { adr: '0xc', sym: 'C', volume24hUsd: 100, liquiditeUsd: 20, trades24h: 2, dex: 'aerodrome', quoteSym: 'USDC' },
];

console.log('verifierForme');
ok('liste vide REFUSEE et se nomme', (() => {
  const r = verifierForme([]);
  return r.ok === false && r.raison === 'LISTE_VIDE';
})(), verifierForme([]));

ok('non-tableau REFUSE', verifierForme(null).ok === false);

ok('champ manquant refuse ET est NOMME', (() => {
  const sansDex = CONFORME.map(({ dex, ...reste }) => reste);
  const r = verifierForme(sansDex);
  return r.ok === false && r.manquants.includes('dex') && r.manquants.length === 1;
})(), verifierForme(CONFORME.map(({ dex, ...r }) => r)).manquants);

ok('charge conforme acceptee, 0 manquant', (() => {
  const r = verifierForme(CONFORME);
  return r.ok === true && r.manquants.length === 0 && r.raison === null;
})());

ok('les champs attendus sont geles', Object.isFrozen(CHAMPS_TRENDING_ATTENDUS));

console.log('agregerParDex');
/* ⛔ LE CAS QUI M A PIEGE : une charge sans le champ compte doit rendre null,
 *    JAMAIS un agregat d apparence saine. */
ok('charge NON CONFORME -> null (pas un faux tableau)', (() => {
  const mauvaise = CONFORME.map((l) => ({ adr: l.adr, sym: l.sym, origine: 'TOKENIZEDBLOCK' }));
  return agregerParDex(mauvaise) === null;
})(), agregerParDex(CONFORME.map((l) => ({ adr: l.adr, sym: l.sym }))));

ok('liste vide -> null', agregerParDex([]) === null);

const A = agregerParDex(CONFORME);
ok('agregat rendu sur charge conforme', A !== null);
ok('volume total = 500', A && A.volTotal === 500, A && A.volTotal);
ok('trades total = 12', A && A.tradesTotal === 12, A && A.tradesTotal);
ok('aerodrome regroupe 2 blocks', (() => {
  const a = A.rangs.find((x) => x.dex === 'aerodrome');
  return a && a.blocks === 2 && a.vol === 200 && a.liq === 30 && a.trades === 6;
})(), A && A.rangs);
ok('classe par volume DECROISSANT (uniswap 300 devant aerodrome 200)',
  A && A.rangs[0].dex === 'uniswap' && A.rangs[1].dex === 'aerodrome', A && A.rangs.map((x) => x.dex));
ok('les parts somment a 1', (() => {
  const s = A.rangs.reduce((x, y) => x + y.partVol, 0);
  return Math.abs(s - 1) < 1e-9;
})(), A && A.rangs.map((x) => x.partVol));

console.log('agregerParDex — les cas sales');
ok('`dex` vide -> ABSENT, COMPTE, jamais reparti', (() => {
  const l = [...CONFORME, { adr: '0xd', sym: 'D', volume24hUsd: 50, liquiditeUsd: 1, trades24h: 1, dex: '  ', quoteSym: 'USDC' }];
  const r = agregerParDex(l);
  const abs = r.rangs.find((x) => x.dex === DEX_ABSENT);
  return r.sansDex === 1 && abs && abs.blocks === 1 && abs.vol === 50;
})());

/* ⛔ NaN traverse toutes les bornes sans les declencher — on le neutralise a la source. */
ok('volume illisible -> 0, JAMAIS NaN', (() => {
  const l = [{ ...CONFORME[0], volume24hUsd: 'beaucoup' }];
  const r = agregerParDex(l);
  return r !== null && r.volTotal === 0 && Number.isFinite(r.volTotal);
})(), agregerParDex([{ ...CONFORME[0], volume24hUsd: 'beaucoup' }]));

ok('volume undefined -> 0', (() => {
  const l = [{ ...CONFORME[0], volume24hUsd: undefined }];
  const r = agregerParDex(l);
  return r !== null && r.volTotal === 0;
})());

console.log('plafondFrais');
ok('taux par defaut = BPS_INTERFACE', plafondFrais(10000).bps === BPS_INTERFACE);
ok('50 bps sur 10 000 $ = 50 $', plafondFrais(10000, 50).plafond === 50, plafondFrais(10000, 50));
ok('volume 0 -> plafond 0', plafondFrais(0).plafond === 0);
ok('volume negatif -> plafond 0 (pas un negatif)', plafondFrais(-5).plafond === 0, plafondFrais(-5));
ok('volume illisible -> plafond 0, pas NaN', (() => {
  const r = plafondFrais('beaucoup');
  return r.plafond === 0 && Number.isFinite(r.plafond);
})());
ok('se declare TOUJOURS comme un plafond', plafondFrais(10000).estUnPlafond === true
  && plafondFrais(0).estUnPlafond === true);

console.log('phrasePlafond');
/* ⛔ UN NULL DOIT PARLER. Seul un succes a le droit d etre muet. */
ok('null PARLE (jamais la chaine vide)', (() => {
  const p = phrasePlafond(null);
  return typeof p === 'string' && p.length > 0;
})(), phrasePlafond(null));
ok('undefined PARLE', phrasePlafond(undefined).length > 0);
ok('plafond 0 PARLE', phrasePlafond(plafondFrais(0)).length > 0);
/* ⛔⛔ L HYPOTHESE DOIT ETRE DITE : un plafond sans son « si tout passait par nous »
 *    se lit comme un revenu. C est exactement la sur-vente qu on refuse. */
ok('la phrase nomme l hypothese (ALL ... routed)', (() => {
  const p = phrasePlafond(plafondFrais(1000000));
  return /ALL/.test(p) && /routed/i.test(p);
})(), phrasePlafond(plafondFrais(1000000)));
ok('la phrase nomme que la capture N EST PAS mesuree', (() => {
  const p = phrasePlafond(plafondFrais(1000000));
  return /not measured/i.test(p);
})(), phrasePlafond(plafondFrais(1000000)));
ok('la phrase porte le taux', /50 bps/.test(phrasePlafond(plafondFrais(1000000, 50))));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
