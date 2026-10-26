// test-wallet-fiat-20261026.mjs — LA SECTION FIAT DU WALLET NE MONTRE QUE CE QUE LE SERVEUR ET LA MESURE DISENT.
// Pur (aucun reseau). `MODULE_FIAT=<chemin>` fait tourner le meme banc sur une COPIE mutee (muter-wallet-fiat-20261026.mjs).
//  1. les chiffres de wallet-fiat.js = mesures/stables-fiat-20261026.json, octet pour octet, et les ensembles sont EXACTS ;
//  2. AUDF est dans la table du serveur (POOLS_PIVOTS_AERODROME) avec la pool mesuree ; EURC n apparait jamais ;
//  3. MoonPay n est un rail QUE si le serveur dit ok + pret + servi (corps de prod du 2026-10-26 : test mode => pas servi) ;
//  4. USDC d abord, puis ETH ; aucun pays promis ; aucun bouton pour ce qui n est pas route.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ici = new URL('./', import.meta.url);
const chemin = process.env.MODULE_FIAT ? pathToFileURL(process.env.MODULE_FIAT).href : new URL('./wallet-fiat.js', ici).href;
const F = await import(chemin);
const { POOLS_PIVOTS_AERODROME, DEVISES_BANNIES } = await import(new URL('./plan-franchissement.js', ici).href);
const { USDC_BASE } = await import(new URL('./frais-creation.js', ici).href);
const mesure = JSON.parse(readFileSync(new URL('./mesures/stables-fiat-20261026.json', ici), 'utf8'));

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const USDC = String(USDC_BASE).toLowerCase();
const EURC = [...DEVISES_BANNIES].find(([, s]) => s === 'EURC');
ok(EURC && /^0x[0-9a-f]{40}$/.test(EURC[0]), 'temoin : EURC est bien dans DEVISES_BANNIES');
const parAdr = new Map(mesure.lignes.map((l) => [String(l.adr).toLowerCase(), l]));
ok(mesure.lignes.length >= 40 && mesure.bloc === F.SOURCE_MESURE.bloc, 'temoin : le fichier de mesure est lu (' + mesure.lignes.length + ' lignes, bloc ' + mesure.bloc + ')');

/* ── 1. PARITE AVEC LA MESURE ── */
const routeesJson = mesure.lignes.filter((l) => l.verdict === 'PASSE_ROUTEUR' && !DEVISES_BANNIES.has(String(l.adr).toLowerCase())).map((l) => String(l.adr).toLowerCase()).sort();
eq(Object.keys(F.MESURES_ROUTEES).sort(), routeesJson, 'MESURES_ROUTEES = exactement les PASSE_ROUTEUR non bannis de la mesure');
for (const [adr, m] of Object.entries(F.MESURES_ROUTEES)) {
  const l = parAdr.get(adr), v = l.venues['aero-old'];
  eq([m.symbole, m.usdcPool, m.usdcUtilisable, m.ecartBps, m.perteBps], [l.symbole, v.usdcPool, v.usdcUtilisable, v.ecartBps, v.perteBps], adr + ' : chiffres = mesure (aero-old)');
  const t = POOLS_PIVOTS_AERODROME.get([USDC, adr].sort().join('|'));
  ok(t && t.pool === v.pool, m.symbole + ' : dans la table du serveur, sur la pool mesuree');
  ok(t.usdcMesure === Math.round(Number(v.usdcPool) / 1e6), m.symbole + ' : usdcMesure de la table = la mesure arrondie');
}
const aVenirJson = mesure.lignes.filter((l) => l.verdict === 'PASSE_FACTORY_NEUVE_SEULEMENT' && !DEVISES_BANNIES.has(String(l.adr).toLowerCase())).map((l) => String(l.adr).toLowerCase()).sort();
eq(F.A_VENIR.map((x) => x.adr).sort(), aVenirJson, 'A_VENIR = exactement les PASSE_FACTORY_NEUVE_SEULEMENT non bannis');
for (const x of F.A_VENIR) {
  const l = parAdr.get(x.adr), v = l.venues['aero-new'];
  eq([x.symbole, x.usdcPool, x.usdcUtilisable, x.ecartBps, x.perteBps, x.ancien], [l.symbole, v.usdcPool, v.usdcUtilisable, v.ecartBps, v.perteBps, l.venues['aero-old'].code], x.symbole + ' : chiffres = mesure (aero-new) et raison = code aero-old');
}
ok(mesure.regles.usdcMin === '10000000000' && mesure.regles.ecartMaxBps === 100 && mesure.regles.perteMaxBps === 200
  && F.PHRASE_REGLE === 'a 10,000 USDC trade, buy gap at most 1 %, round trip at most 2 %', 'la regle dite = la regle mesuree');

/* ── 2. MONNAIES LOCALES ROUTEES ── */
const loc = F.monnaiesLocales({ offertsAchat: ['ETH', USDC] });
eq(loc.map((m) => m.symbole), ['AUDF'], 'aujourd hui une seule monnaie locale routee : AUDF');
ok(/25,104 USDC/.test(loc[0].faits) && /0\.05 %/.test(loc[0].faits) && /0\.10 %/.test(loc[0].faits) && /53,106,990/.test(loc[0].faits), 'AUDF : faits mesures dits (pool, ecart, aller-retour, bloc)');
ok(/trades against ETH or USDC/.test(loc[0].payWith), 'AUDF : Pay with = devisesPivotVersBloc (ETH et USDC)');
ok(loc[0].achat.ouvert === false && /not routed here yet/.test(loc[0].achat.phrase), 'AUDF : pas de bouton d achat tant que le Swap ne l offre pas');
const locOuvert = F.monnaiesLocales({ offertsAchat: [USDC, '0xD2A530170D71A9CFE1651FB468E2B98F7ED7456B'] });
ok(locOuvert[0].achat.ouvert === true && locOuvert[0].achat.bouton === 'Buy AUDF with USDC', 'AUDF : le bouton apparait seulement quand le Swap l offre');
ok(loc.every((m) => /not confirmed by the issuer/.test(m.adresse)), 'adresse : non confirmee par l emetteur, dit');

/* ── 3. A VENIR : sans bouton ── */
const av = F.aVenir();
eq(av.map((x) => x.symbole), ['CADD', 'MXNB', 'USDT'], 'a venir : CADD, MXNB, USDT');
ok(av.every((x) => !('bouton' in x) && /measured, not routed yet/.test(x.phrase) && /newer Aerodrome pool factory/.test(x.phrase)), 'a venir : raison dite, aucun bouton');
ok(/is empty/.test(av[0].phrase) && /too shallow/.test(av[1].phrase) && /no USDC pool/.test(av[2].phrase), 'a venir : la raison de l ancienne factory par ligne');

/* ── 4. ACHAT CARTE / BANQUE ── */
const FR = { ok: true, pret: true, moyens: ['CARD', 'FIAT_WALLET'] }; // forme de prod /api/onramp/options?pays=FR (2026-10-26)
const MP_TEST = { ok: true, pret: true, servi: false, pourquoi: 'usdc_base is not available in MoonPay test mode', pays: 'NG', actif: 'USDC', fournisseur: 'MoonPay',
  frais: { carte: 'up to 4.5% by card, Apple Pay or Google Pay (minimum $3.99 or the local equivalent)', banque: 'up to 1% by bank transfer', source: 'https://support.moonpay.com/customers/docs/moonpay-fees' } };
const fr = F.lignesAchat({ pays: 'FR', nomPays: 'France', coinbase: FR.moyens, moonpay: {} });
eq(fr.map((l) => l.actif), ['USDC', 'ETH'], 'USDC d abord, puis ETH');
ok(fr.every((l) => l.rail === 'coinbase' && l.moonpay === null && /Coinbase lists for France \(FR\): card, Coinbase cash balance/.test(l.phrase) && /shows you the total before you confirm/.test(l.phrase)), 'FR : Coinbase, moyens lus, frais divulgues, MoonPay muet');
const ng = F.lignesAchat({ pays: 'NG', nomPays: 'Nigeria', coinbase: [], moonpay: { USDC: MP_TEST, ETH: { ...MP_TEST, actif: 'ETH', pourquoi: 'eth_base is not available in MoonPay test mode' } } });
ok(ng.every((l) => l.rail === 'coinbase' && !/MoonPay/.test(l.bouton)), 'NG + MoonPay en mode test : MoonPay N EST PAS un rail (aucun bouton MoonPay)');
ok(/MoonPay is not offered for USDC in Nigeria \(NG\) from here — MoonPay answered: usdc_base is not available in MoonPay test mode\./.test(ng[0].moonpay), 'NG : l etat de MoonPay = la reponse du serveur');
ok(/Could not read which payment methods Coinbase offers in Nigeria/.test(ng[0].phrase), 'NG : Coinbase vide = « could not read », jamais « none »');
const tout = JSON.stringify([fr, ng, F.lignesAchat({ pays: 'NG', coinbase: [], moonpay: { USDC: { ok: false, pret: false, pourquoi: 'no MoonPay keys' }, ETH: null } })]);
ok(!/\b(MX|KR|ZA|TR)\b/.test(tout) && !/coming/i.test(tout), 'aucune liste de pays promise, aucun « coming » pour MoonPay');
const servi = F.lignesAchat({ pays: 'NG', nomPays: 'Nigeria', coinbase: [], moonpay: { USDC: { ...MP_TEST, servi: true, pourquoi: null } } });
ok(servi[0].rail === 'moonpay' && servi[0].bouton === 'Buy USDC with MoonPay' && servi[0].phrase.includes(MP_TEST.frais.carte) && servi[0].phrase.includes(MP_TEST.frais.banque), 'servi : MoonPay, avec les frais RENDUS par le serveur');
ok(servi[1].rail === 'coinbase', 'servi pour USDC seulement : ETH reste Coinbase');
const sansCles = F.lignesAchat({ pays: 'NG', coinbase: [], moonpay: { USDC: { ok: false, pret: false }, ETH: null } });
ok(/not connected on this server/.test(sansCles[0].moonpay) && /could not be read/.test(sansCles[1].moonpay), 'sans cles / lecture ratee : dit, sans rien promettre');
ok(F.lignesAchat({ pays: null }).every((l) => l.bouton === null), 'sans pays : aucun bouton');

/* ── 5. EURC JAMAIS ── */
/* une table et une mesure qui REPORTERAIENT EURC (comme avant le ban) : le ban passe avant, rien n est offert */
const tableAvecEurc = new Map([...POOLS_PIVOTS_AERODROME, [[USDC, EURC[0]].sort().join('|'), { symbole: 'USDC/EURC', pool: '0x' + '1'.repeat(40), tickSpacing: 1, usdcMesure: 1 }]]);
const mesuresAvecEurc = { ...F.MESURES_ROUTEES, [EURC[0]]: { symbole: 'EURC', monnaie: 'Euro', code: 'EUR', nom: 'EURC', usdcPool: '1', usdcUtilisable: '1', ecartBps: 0, perteBps: 0 } };
const locEurc = F.monnaiesLocales({ offertsAchat: [EURC[0]], table: tableAvecEurc, mesures: mesuresAvecEurc });
const avEurc = F.aVenir({ liste: [...F.A_VENIR, { adr: EURC[0], symbole: 'EURC', monnaie: 'Euro', code: 'EUR', usdcPool: '1', ancien: 'SANS_POOL' }] });
eq(locEurc.map((m) => m.symbole), ['AUDF'], 'table reportant EURC : toujours AUDF seul');
eq(avEurc.map((m) => m.symbole), ['CADD', 'MXNB', 'USDT'], 'liste reportant EURC : toujours CADD, MXNB, USDT');
const ecran = JSON.stringify([loc, locOuvert, av, fr, ng, servi, locEurc, avEurc]);
ok(!/EURC/.test(ecran) && !ecran.toLowerCase().includes(EURC[0]), 'EURC n apparait nulle part dans la section');

/* ── 6. CABLAGE (statique) ── */
const app = readFileSync(new URL('./app.html', ici), 'utf8'), serveur = readFileSync(new URL('./serveur-web.js', ici), 'utf8');
ok(/import \{[^}]*\} from '\.\/wallet-fiat\.js';/.test(app) && /'wallet-fiat\.js',/.test(serveur), 'wallet-fiat.js importe par la page ET servi');
ok(/if \(nom === 'wallet'\) peindreFiatWallet\(\)/.test(app) && /id="wFiat"/.test(app), 'la section est peinte a l ouverture du Wallet');
const corps = app.slice(app.indexOf('async function peindreFiatWallet'), app.indexOf("$('#wfPays') && $('#wfPays').addEventListener"));
ok(corps.length > 500 && !/innerHTML/.test(corps) && !/eth_sendTransaction|wallet_sendCalls|personal_sign/.test(corps), 'peintre : DOM seulement, aucun appel de signature');
ok(/ouvrirRailFiat\(e, a, l\.actif\)/.test(corps) && /ouvrirRailMoonpay\(e, l\.actif, p\)/.test(corps), 'boutons : les rails EXISTANTS, inchanges');
ok(!/Cash out/i.test(app.slice(app.indexOf('id="wFiat"'), app.indexOf('id="wfEtat"'))), 'pas de « Cash out » promis');

console.log('test-wallet-fiat-20261026 : ' + n + ' verts' + (process.env.MODULE_FIAT ? ' (MODULE_FIAT=' + process.env.MODULE_FIAT + ')' : ''));
