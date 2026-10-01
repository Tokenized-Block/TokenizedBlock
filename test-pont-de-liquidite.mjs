/* Le pont : ce qu il rend atteignable, et ce qu il refuse de promettre.
 *
 * ⭐ L IDEE EST DE PHIL (2026-10-01), et la mesure la confirme exactement : NVDAc est le SEUL jeton
 *   present sur les DEUX factories (V4 fee 100 ET Aerodrome tickSpacing 10). OUSD n est que sur V4,
 *   les 14 autres actions ne sont que sur Aerodrome. Par NVDAc, OUSD atteint les QUINZE — en DEUX
 *   segments, jamais en un seul appel.
 *
 * ⛔ CE FICHIER TESTE LA DECISION, PAS LA CHAINE. Les aretes sont les aretes MESUREES, et le module
 *   ne lit rien : il decide. Qu un swap aboutisse se prouve sur un fork, pas ici.
 */
import { strict as assert } from 'node:assert';
import { FAMILLES, SAUTS_MAX, FRAIS_PONT_BPS, cheminEntre, segmenterParFactory,
  transactionsNecessaires, tranchesPourTenirLeSeuil, fraisDuPont, phraseFraisDuPont,
  phrasePont } from './pont-de-liquidite.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const OUSD = '0xb2000000000000000000002feb517dfec7415344';
const NVDA = '0xb20000000000000000000078ee7ce2fe4908108c';
const AAPL = '0xb200000000000000000000c2e324d24d7eecd1fb';
const TSLA = '0xb2000000000000000000000d86b4b9e4d9d1c0ffee';

/* ⛔ LES ARETES SONT CELLES MESUREES LE 2026-10-01, 0 non mesuree. Les inventer ferait tester une
 *   fiction — la faute que le banc de fork m a deja attrapee aujourd hui sur une cle ecrite a la main. */
const ARETES = [
  { de: USDC, vers: OUSD, famille: 'uniswap-v4' },   /* mesure : fee 100 / ts 1 */
  { de: USDC, vers: NVDA, famille: 'uniswap-v4' },   /* mesure : fee 100 / ts 1 — LE PONT, cote V4 */
  { de: NVDA, vers: USDC, famille: 'aerodrome' },    /* mesure : ts 10        — LE PONT, cote Aero */
  { de: AAPL, vers: USDC, famille: 'aerodrome' },    /* mesure : ts 10 */
  { de: TSLA, vers: USDC, famille: 'aerodrome' },    /* mesure : ts 10 */
];

cas('✅ TEMOIN POSITIF : OUSD -> NVDAc existe, et tient en UNE transaction (tout V4)', () => {
  const r = cheminEntre(OUSD, NVDA, ARETES);
  assert.equal(r.etat, 'OK', r.pourquoi);
  assert.equal(transactionsNecessaires(r.chemin), 1);
  assert.deepEqual(segmenterParFactory(r.chemin).map((s) => s.famille), ['uniswap-v4']);
});

console.log('⭐⭐ LE PONT : OUSD atteint une action qui n est QUE sur Aerodrome');
cas('OUSD -> AAPLc existe, alors qu aucune factory ne les relie seule', () => {
  const r = cheminEntre(OUSD, AAPL, ARETES);
  assert.equal(r.etat, 'OK', r.pourquoi);
  /* OUSD -> USDC (V4) -> NVDAc (V4) -> USDC (Aero) -> AAPLc (Aero) */
  assert.ok(r.chemin.length >= 2 && r.chemin.length <= SAUTS_MAX, 'longueur ' + r.chemin.length);
});
cas('⛔⛔ ET IL FAUT DEUX TRANSACTIONS, parce qu un swap ne traverse pas deux places', () => {
  const r = cheminEntre(OUSD, AAPL, ARETES);
  const segs = segmenterParFactory(r.chemin);
  assert.ok(segs.length >= 2, 'un seul segment : le melange de factories passerait');
  assert.equal(transactionsNecessaires(r.chemin), segs.length);
  /* ⛔ Le premier segment part de V4 (OUSD n est QUE la), le dernier finit sur Aerodrome. */
  assert.equal(segs[0].famille, 'uniswap-v4');
  assert.equal(segs[segs.length - 1].famille, 'aerodrome');
});
/* ⛔⛔⛔ CETTE ASSERTION ENCODAIT MA CROYANCE, ET ELLE ETAIT FAUSSE. J exigeais que le chemin passe
 *   par NVDAc, parce que j avais conclu « NVDAc est le seul pont ». Le module a rendu
 *   OUSD -> USDC -> AAPLc : DEUX sauts, sans NVDAc. Parce qu USDC est lui aussi dans les deux
 *   mondes, et de loin le plus profond.
 *   ⇒ Le test a casse mon RECIT, pas mon code. La verite est plus simple et plus forte : le pont
 *     est USDC, et les QUINZE actions sont atteignables depuis OUSD en deux transactions.
 *   ⇒ Et c est NVDAc qui devient le pont de SECOURS : utile, mesure, pas necessaire. */
cas('⭐ le pont est USDC, et le chemin le plus court l emprunte', () => {
  const r = cheminEntre(OUSD, AAPL, ARETES);
  const noeuds = [r.chemin[0].de, ...r.chemin.map((s) => s.vers)];
  assert.ok(noeuds.includes(USDC), 'USDC n est pas emprunte : ' + noeuds.join(' -> '));
  assert.equal(r.chemin.length, 2, 'le chemin le plus court fait 2 sauts, vu : ' + r.chemin.length);
});
cas('⛔⛔ SANS USDC, IL N Y A PLUS DE CHEMIN — c est LUI qui porte tout', () => {
  /* ⛔ LE CAS LE PLUS IMPORTANT DU FICHIER : si « le pont est USDC » est vrai, retirer ses aretes
   *   doit rendre AAPLc inatteignable depuis OUSD. Sans ce test, « le pont » resterait une
   *   histoire qu on se raconte. */
  const sansUsdc = ARETES.filter((e) => e.de !== USDC && e.vers !== USDC);
  const r = cheminEntre(OUSD, AAPL, sansUsdc);
  assert.equal(r.etat, 'REFUSE', 'un chemin existe sans USDC : ' + JSON.stringify(r.chemin));
});
cas('⚠️ et NVDAc est un pont de SECOURS : retirer ses aretes ne casse rien', () => {
  /* ⛔ L envers du cas precedent, et il prouve que NVDAc n est PAS necessaire — ce qui est
   *   exactement ce que mon ancienne assertion niait. */
  const sansNvda = ARETES.filter((e) => e.de !== NVDA && e.vers !== NVDA);
  const r = cheminEntre(OUSD, AAPL, sansNvda);
  assert.equal(r.etat, 'OK', 'NVDAc etait donc necessaire : ' + r.pourquoi);
});

console.log('');
console.log('⛔ LES SEGMENTS NE SE REGROUPENT PAS SI ILS NE SE TOUCHENT PAS');
cas('V4, Aerodrome, V4 fait TROIS segments, pas deux', () => {
  const segs = segmenterParFactory([
    { de: 'a', vers: 'b', famille: 'uniswap-v4' },
    { de: 'b', vers: 'c', famille: 'aerodrome' },
    { de: 'c', vers: 'd', famille: 'uniswap-v4' },
  ]);
  assert.equal(segs.length, 3);
  assert.deepEqual(segs.map((s) => s.famille), ['uniswap-v4', 'aerodrome', 'uniswap-v4']);
});
cas('deux sauts contigus sur la MEME famille font UN segment', () => {
  const segs = segmenterParFactory([
    { de: 'a', vers: 'b', famille: 'uniswap-v4' },
    { de: 'b', vers: 'c', famille: 'uniswap-v4' },
  ]);
  assert.equal(segs.length, 1);
  assert.equal(segs[0].sauts.length, 2);
});
cas('un chemin vide ou absent rend aucun segment, et 0 transaction', () => {
  assert.deepEqual(segmenterParFactory([]), []);
  assert.deepEqual(segmenterParFactory(null), []);
  assert.equal(transactionsNecessaires(null), 0);
});

console.log('');
console.log('⛔ LES REFUS, ET CE QU ILS NOMMENT');
cas('⛔ une famille qu on ne sait pas construire est IGNOREE et NOMMEE', () => {
  const r = cheminEntre(OUSD, AAPL, [
    { de: OUSD, vers: AAPL, famille: 'sushi-v9' },
  ]);
  assert.equal(r.etat, 'REFUSE');
  assert.ok(r.ignorees.includes('sushi-v9'), 'la famille ignoree n est pas nommee');
  /* ⛔ Et le refus le DIT : « pas de chemin » et « je n ai pas su lire cette place » ne sont pas
   *   la meme chose, et les confondre ferait croire a un marche absent. */
  assert.match(r.pourquoi, /cannot build/i);
});
cas('⛔ aucune arete -> REFUSE, jamais un chemin vide qui passerait pour valide', () => {
  assert.equal(cheminEntre(OUSD, AAPL, []).etat, 'REFUSE');
  assert.equal(cheminEntre(OUSD, AAPL, null).etat, 'REFUSE');
  assert.equal(cheminEntre(OUSD, AAPL).etat, 'REFUSE');
});
cas('⛔ les deux bouts identiques -> REFUSE', () => {
  assert.equal(cheminEntre(OUSD, OUSD, ARETES).etat, 'REFUSE');
  assert.equal(cheminEntre(OUSD, OUSD.toUpperCase(), ARETES).etat, 'REFUSE', 'la casse ne doit pas creer un chemin');
});
cas('⛔ un bout absent -> REFUSE', () => {
  assert.equal(cheminEntre(null, AAPL, ARETES).etat, 'REFUSE');
  assert.equal(cheminEntre(OUSD, '', ARETES).etat, 'REFUSE');
});
cas('⛔ un jeton hors du graphe -> REFUSE', () => {
  assert.equal(cheminEntre(OUSD, '0xdead000000000000000000000000000000000000', ARETES).etat, 'REFUSE');
});
cas('⛔ une arete mal formee est ecartee, pas devinee', () => {
  assert.equal(cheminEntre(OUSD, AAPL, [{ de: OUSD, famille: 'uniswap-v4' }]).etat, 'REFUSE');
  assert.equal(cheminEntre(OUSD, AAPL, [{ de: OUSD, vers: AAPL }]).etat, 'REFUSE', 'sans famille, on ne route pas');
});
cas('la casse des adresses ne change pas le chemin', () => {
  const r = cheminEntre(OUSD.toUpperCase(), NVDA.toUpperCase(), ARETES);
  assert.equal(r.etat, 'OK', r.pourquoi);
});

console.log('');
console.log('⭐ LES TRANCHES : l idee de Phil, rendue mesurable — et bornee');
cas('un glissement DEJA sous le seuil -> une seule transaction', () => {
  const r = tranchesPourTenirLeSeuil({ glissementBps: 10, seuilBps: 300 });
  assert.equal(r.etat, 'OK');
  assert.equal(r.tranches, 1);
});
cas('MSTRc mesure a 381 bps, plafond 300 -> deux tranches', () => {
  const r = tranchesPourTenirLeSeuil({ glissementBps: 381, seuilBps: 300 });
  assert.equal(r.etat, 'OK');
  assert.equal(r.tranches, 2);
});
cas('⛔ la phrase dit que c est une ESTIMATION, jamais une garantie', () => {
  const r = tranchesPourTenirLeSeuil({ glissementBps: 381, seuilBps: 300 });
  assert.match(r.pourquoi, /estimate, not a guarantee/i);
  /* ⛔ Et elle dit POURQUOI : chaque tranche part du prix que la precedente a bouge. */
  assert.match(r.pourquoi, /the price the one before it moved/i);
});
cas('⛔⛔ un marche trop mince -> REFUSE, pas « 47 tranches »', () => {
  const r = tranchesPourTenirLeSeuil({ glissementBps: 9000, seuilBps: 100 });
  assert.equal(r.etat, 'REFUSE');
  assert.equal(r.tranches, null);
  assert.match(r.pourquoi, /too thin/i);
});
cas('⛔ un glissement NON MESURE -> NON_MESURE, jamais 1 tranche par defaut', () => {
  for (const g of [null, undefined, NaN, 'beaucoup', -1]) {
    const r = tranchesPourTenirLeSeuil({ glissementBps: g, seuilBps: 300 });
    assert.equal(r.etat, 'NON_MESURE', 'glissement ' + String(g) + ' a passe');
    assert.equal(r.tranches, null);
  }
});
cas('⛔ un seuil absurde -> NON_MESURE', () => {
  assert.equal(tranchesPourTenirLeSeuil({ glissementBps: 100, seuilBps: 0 }).etat, 'NON_MESURE');
  assert.equal(tranchesPourTenirLeSeuil({ glissementBps: 100, seuilBps: -5 }).etat, 'NON_MESURE');
  assert.equal(tranchesPourTenirLeSeuil({}).etat, 'NON_MESURE');
});
cas('la borne de tranches est respectee aux DEUX cotes', () => {
  /* 300/100 = 3 tranches, sous une borne de 3 -> OK ; au-dessus -> REFUSE. */
  assert.equal(tranchesPourTenirLeSeuil({ glissementBps: 300, seuilBps: 100, trancheMax: 3 }).tranches, 3);
  assert.equal(tranchesPourTenirLeSeuil({ glissementBps: 400, seuilBps: 100, trancheMax: 3 }).etat, 'REFUSE');
});

console.log('');
console.log('⛔ LA PHRASE DIT LE NOMBRE DE SIGNATURES');
const noms = {}; noms[OUSD] = 'OUSD'; noms[USDC] = 'USDC'; noms[NVDA] = 'NVDAc'; noms[AAPL] = 'AAPLc';
cas('un chemin a un segment dit « one transaction »', () => {
  const s = phrasePont(cheminEntre(OUSD, NVDA, ARETES), noms);
  assert.match(s, /one transaction/i);
  assert.match(s, /uniswap-v4/);
});
cas('⛔⛔ un chemin a deux segments DIT qu il faut deux transactions, et pourquoi', () => {
  const s = phrasePont(cheminEntre(OUSD, AAPL, ARETES), noms);
  assert.match(s, /transactions/i);
  assert.match(s, /cannot cross two venues/i);
  assert.match(s, /has to be signed/i);
  /* ⛔ Et il NE dit PAS « one transaction » : c est la seule erreur qu on ne rattrape pas apres coup. */
  assert.ok(!/one transaction/i.test(s));
});
cas('la phrase nomme les jetons connus et abrege les autres', () => {
  const s = phrasePont(cheminEntre(OUSD, AAPL, ARETES), noms);
  assert.match(s, /OUSD/);
  assert.match(s, /AAPLc/);
  const sans = phrasePont(cheminEntre(OUSD, AAPL, ARETES));
  assert.match(sans, /0x/, 'sans symbole, on abrege l adresse au lieu d inventer un nom');
});
cas('un refus PARLE, et compte les places ignorees', () => {
  const s = phrasePont(cheminEntre(OUSD, AAPL, [{ de: OUSD, vers: AAPL, famille: 'sushi-v9' }]), noms);
  assert.match(s, /No route here/i);
  assert.match(s, /cannot build their venue/i);
});
cas('null PARLE', () => { assert.ok(phrasePont(null).length > 0); });

console.log('');
console.log('⛔⛔⛔ LE FRAIS EST PAR TRANSACTION, DONC DEUX SEGMENTS LE PAIENT DEUX FOIS');
cas('0,1 % par transaction (decision de Phil), lu dans la constante', () => {
  assert.equal(FRAIS_PONT_BPS, 10n);
});
cas('un chemin a UN segment -> un seul prelevement, 0,1 % au total', () => {
  const f = fraisDuPont(cheminEntre(OUSD, NVDA, ARETES).chemin);
  assert.equal(f.etat, 'OK');
  assert.equal(f.prelevements, 1);
  assert.equal(f.bpsTotal, 10n);
});
cas('⛔⛔ un chemin a DEUX segments -> DEUX prelevements, 0,2 % au total', () => {
  /* ⛔ C EST LA MOITIE QUI COUTE CHER. Annoncer 0,1 % sur une route a deux transactions serait
   *   sous-evaluer le prix — la faute exacte du « 50 bps » annonce pour un echange a 3 %, qui a
   *   vecu EN PRODUCTION parce qu un test vert garantissait le faux chiffre. */
  const f = fraisDuPont(cheminEntre(OUSD, AAPL, ARETES).chemin);
  assert.equal(f.etat, 'OK');
  assert.equal(f.prelevements, 2);
  assert.equal(f.bpsTotal, 20n, 'le total doit etre 20 bps, pas 10');
});
cas('⛔ la phrase annonce LE TOTAL EN PREMIER, pas le taux par transaction', () => {
  const s = phraseFraisDuPont(fraisDuPont(cheminEntre(OUSD, AAPL, ARETES).chemin));
  assert.match(s, /0\.2% in total/);
  assert.match(s, /0\.1% on each/);
  /* ⛔ Et elle dit que ce n est PAS le cout complet : chaque marche prend aussi le sien. */
  assert.match(s, /our share, not the cost of the trade/i);
});
cas('un seul prelevement se dit simplement, sans total trompeur', () => {
  const s = phraseFraisDuPont(fraisDuPont(cheminEntre(OUSD, NVDA, ARETES).chemin));
  assert.match(s, /0\.1%/);
  assert.ok(!/in total/i.test(s), 'un seul prelevement n a pas besoin du mot « total »');
});
cas('⛔ sans route -> REFUSE, et rien n est facture', () => {
  const f = fraisDuPont(null);
  assert.equal(f.etat, 'REFUSE');
  assert.equal(f.bpsTotal, null);
  assert.match(f.pourquoi, /nothing is charged/i);
});
cas('⛔ un taux par transaction absurde -> REFUSE', () => {
  const c = cheminEntre(OUSD, AAPL, ARETES).chemin;
  assert.equal(fraisDuPont(c, 501n).etat, 'REFUSE');
  assert.equal(fraisDuPont(c, -1n).etat, 'REFUSE');
  assert.equal(fraisDuPont(c, 500n).etat, 'OK', 'la borne elle-meme doit passer');
});
cas('⛔ un taux 0 reste valide : un chemin gratuit est un chemin, et il se dit', () => {
  const f = fraisDuPont(cheminEntre(OUSD, AAPL, ARETES).chemin, 0n);
  assert.equal(f.etat, 'OK');
  assert.equal(f.bpsTotal, 0n);
});

console.log('');
console.log('les constantes');
cas('FAMILLES est gelee et porte les deux jambes constructibles', () => {
  assert.ok(Object.isFrozen(FAMILLES));
  assert.ok(FAMILLES.includes('aerodrome') && FAMILLES.includes('uniswap-v4'));
});
cas('⛔ la profondeur est BORNEE : un chemin de dix sauts n est pas une route', () => {
  assert.equal(SAUTS_MAX, 4);
  /* Une chaine plus longue que la borne ne doit pas etre rendue. */
  const longue = [];
  for (let i = 0; i < 8; i += 1) {
    longue.push({ de: 't' + i, vers: 't' + (i + 1), famille: 'uniswap-v4' });
  }
  assert.equal(cheminEntre('t0', 't8', longue).etat, 'REFUSE');
  /* ⛔ ET LA BORNE ELLE-MEME PASSE : sans ce cote, un `SAUTS_MAX` casse a 0 serait vert. */
  assert.equal(cheminEntre('t0', 't4', longue).etat, 'OK');
});

console.log('');
console.log(n + ' cas, 0 KO');
