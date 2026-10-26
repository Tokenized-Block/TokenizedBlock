/* test-moonpay-rail-20261026.mjs -- LE SECOND RAIL FIAT (MoonPay) : SIGNATURE, VALIDATION, ROUTAGE PAR PAYS, CACHE SANS CLE.
 *
 * Ce que ce banc PROUVE : la signature reproduit le vecteur PUBLIE par MoonPay (dev.moonpay.com/widget/on-ramp/customization/
 * url-signing.md) ; l URL est batie et signee cote serveur avec une adresse, un actif, un retour valides ; le pays est route
 * Coinbase / MoonPay selon ce qui a ete LU ; sans les deux cles rien n est servi ni lu ; cinq mutants meurent.
 * Ce qu il NE PROUVE PAS : qu une cle live ouvre le widget (aucune cle ici, aucun appel MoonPay authentifie).
 * Les cles ci-dessous sont des valeurs de banc fabriquees (et celles de la doc) : aucune n est une vraie cle.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { choisirRail, estUrlMoonpay, phraseMoonpay, fournisseurRetour, lireRetourFiat } from './retour-fiat.js';

const ICI = new URL('./', import.meta.url);
const SRC = readFileSync(new URL('./moonpay-rail.js', ICI), 'utf8');
const SRC_ONRAMP = readFileSync(new URL('./onramp-session.js', ICI), 'utf8');

/* cles de BANC, fabriquees ici (concatenees pour ne ressembler a aucune cle reelle dans le source) */
const PK_LIVE = 'pk_' + 'live_' + 'BancFixe0001';
const SK_LIVE = 'sk_' + 'live_' + 'BancFixe0001';
const ENV_LIVE = { MOONPAY_PUBLISHABLE_KEY: PK_LIVE, MOONPAY_SECRET_KEY: SK_LIVE };
const ENV_TEST = { MOONPAY_PUBLISHABLE_KEY: 'pk_test_BancFixe0001', MOONPAY_SECRET_KEY: 'sk_test_BancFixe0001' };
const WALLET = '0x' + 'aB'.repeat(20);
const BLOC = '0x' + '12'.repeat(20);
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

/* Catalogue de banc : champs RECOPIES de api.moonpay.com/v3/countries et /v3/currencies, lus le 2026-10-26. */
const pays = (alpha2, isAllowed, isBuyAllowed) => ({ alpha2, isAllowed, isBuyAllowed, name: alpha2 });
const FIX_PAYS = [pays('NG', true, true), pays('MX', true, true), pays('KR', true, true), pays('ZA', true, true),
  pays('TR', true, true), pays('JP', false, false), pays('IN', false, false), pays('CA', true, true), pays('US', true, true), pays('FR', true, true)];
const devise = (code, contractAddress, notAllowedCountries, extra = {}) => ({ code, type: 'crypto', isSuspended: false,
  supportsLiveMode: true, supportsTestMode: false, notAllowedUSStates: ['NY', 'VI'], notAllowedCountries,
  metadata: { contractAddress, chainId: '8453', networkCode: 'base' }, ...extra });
const FIX_DEVISES = [devise('usdc_base', USDC, ['CA']), devise('eth_base', '0x0000000000000000000000000000000000000000', []),
  { code: 'ngn', type: 'fiat', isSuspended: false }];

async function suite(M) {
  const ko = [];
  const ok = (c, m) => { if (!c) ko.push(m); };
  const essai = async (m, fn) => { try { await fn(); } catch (e) { ko.push(m + ' (jete : ' + String(e && e.message).slice(0, 80) + ')'); } };

  /* 1. LA SIGNATURE CONTRE LE VECTEUR PUBLIE */
  await essai('vecteur', () => {
    const q = '?apiKey=pk_test_DocsVector00&currencyCode=eth&walletAddress=0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe';
    ok(M.signerRequete(q, 'sk_test_DocsVector00') === 'oIJxSghyzll/BLhUFdQZhkxf7DAS8REFaWr/ibO+K8Q=', 'signature = vecteur publie par MoonPay');
    /* la doc nomme la faute « sans le ? » par sa valeur : on la reconnait, et on ne la produit pas */
    ok(createHmac('sha256', 'sk_test_DocsVector00').update(q.slice(1)).digest('base64') === 'z2PF5gVnemAZat6jSnLdgG7MB9SNX1TCrRc2bkHq8DQ=', 'temoin : la valeur « sans ? » de la doc');
    ok(M.signerRequete(q.slice(1), 'sk_test_DocsVector00') === null, 'une requete sans ? initial est refusee');
    ok(M.signerRequete(q, '') === null && M.signerRequete(q, '  ') === null, 'pas de signature sans secret');
  });

  /* 2. L URL BATIE ET SIGNEE PAR LE SERVEUR */
  await essai('url', () => {
    const u = M.construireUrlWidget({ env: ENV_LIVE, adresse: WALLET, actif: 'usdc', retourBlock: BLOC });
    ok(u.etat === 'OK', 'URL batie avec des entrees valides');
    const url = String(u.url || '');
    ok(url.startsWith('https://buy.moonpay.com/?apiKey=' + PK_LIVE + '&'), 'widget de production, cle publique en tete');
    const i = url.lastIndexOf('&signature=');
    ok(i > 0, 'signature presente');
    const requete = url.slice(url.indexOf('?'), i);
    const sig = decodeURIComponent(url.slice(i + '&signature='.length));
    ok(sig === createHmac('sha256', SK_LIVE).update(requete).digest('base64'), 'signature = HMAC-SHA256(secret, "?"+query) en base64');
    ok(url.slice(i + 1).indexOf('&') === -1, 'signature en DERNIER parametre');
    const p = new URLSearchParams(requete);
    ok(p.get('currencyCode') === 'usdc_base', 'actif fige : usdc_base');
    ok(p.get('walletAddress') === WALLET.toLowerCase(), 'adresse = le wallet demande, rien d autre');
    ok(p.get('redirectURL') === 'https://tokenizedblock.space/?block=' + BLOC + '&actif=USDC&via=moonpay', 'retour sur CE block, notre origine');
    ok(!url.includes(SK_LIVE), 'le secret n est pas dans l URL');
    ok(estUrlMoonpay(url), 'la page accepte cette URL');
    const e = M.construireUrlWidget({ env: ENV_LIVE, adresse: WALLET, actif: 'ETH' });
    ok(e.etat === 'OK' && new URLSearchParams(e.url.slice(e.url.indexOf('?'))).get('currencyCode') === 'eth_base', 'ETH -> eth_base');
    ok(new URLSearchParams(e.url.slice(e.url.indexOf('?'))).get('redirectURL') === 'https://tokenizedblock.space/', 'sans block : l accueil');
  });

  /* 3. VALIDATION DE CHAQUE ENTREE */
  await essai('validation', () => {
    for (const [nom, o] of [['adresse courte', { adresse: '0x12', actif: 'USDC' }], ['actif hors liste', { adresse: WALLET, actif: 'DAI' }],
      ['actif vide', { adresse: WALLET, actif: '' }], ['block invalide', { adresse: WALLET, actif: 'USDC', retourBlock: 'https://evil.example' }]]) {
      const r = M.construireUrlWidget({ env: ENV_LIVE, ...o });
      ok(r.etat === 'REFUSE' && !r.url, 'refus : ' + nom);
    }
    ok(estUrlMoonpay('https://buy.moonpay.com/?apiKey=x&currencyCode=usdc_base') === false, 'page : URL non signee refusee');
    ok(estUrlMoonpay('https://buy.moonpay.com.evil.example/?a=1&signature=abc') === false, 'page : hote voisin refuse');
    ok(estUrlMoonpay('https://buy-sandbox.moonpay.com/?a=1&signature=abc') === false, 'page : bac a sable refuse');
  });

  /* 4. L ETAT DES CLES, SANS JAMAIS LES RENDRE */
  await essai('etat', () => {
    const r0 = M.etatMoonpay({});
    ok(r0.pret === false && /MOONPAY_PUBLISHABLE_KEY/.test(r0.pourquoi) && /MOONPAY_SECRET_KEY/.test(r0.pourquoi), 'sans rien : les deux noms');
    ok(/secret key missing/.test(M.etatMoonpay({ MOONPAY_PUBLISHABLE_KEY: PK_LIVE }).pourquoi), 'pk seule : le secret manque');
    ok(/publishable key missing/.test(M.etatMoonpay({ MOONPAY_SECRET_KEY: SK_LIVE }).pourquoi), 'sk seule : la publique manque');
    ok(M.etatMoonpay({ MOONPAY_PUBLISHABLE_KEY: ' ', MOONPAY_SECRET_KEY: '' }).pret === false, 'valeurs vides = absentes');
    ok(M.etatMoonpay({ MOONPAY_PUBLISHABLE_KEY: SK_LIVE, MOONPAY_SECRET_KEY: PK_LIVE }).pret === false, 'cles inversees refusees');
    ok(M.etatMoonpay({ MOONPAY_PUBLISHABLE_KEY: PK_LIVE, MOONPAY_SECRET_KEY: 'sk_test_X1' }).pret === false, 'modes melanges refuses');
    const r = M.etatMoonpay(ENV_LIVE);
    ok(r.pret === true && r.mode === 'live' && !JSON.stringify(r).includes('BancFixe'), 'pret, mode live, aucune cle rendue');
  });

  /* 5. CACHE SANS CLE : aucune lecture, aucune URL */
  await essai('cache', async () => {
    let lu = 0;
    const lireCatalogue = async () => { lu += 1; return M.analyserCatalogue(FIX_PAYS, FIX_DEVISES); };
    const a = await M.corpsPaysMoonpay({ env: {}, pays: 'NG', actif: 'USDC', lireCatalogue });
    ok(a.ok === false && a.pret === false && lu === 0, 'sans cle : pret:false et catalogue NON demande');
    const b = await M.corpsSessionMoonpay({ env: {}, adresse: WALLET, actif: 'USDC', block: BLOC, pays: 'NG', lireCatalogue });
    ok(b.corps.ok === false && b.corps.pret === false && !b.corps.url && lu === 0, 'sans cle : aucune URL');
    ok(choisirRail({ coinbaseMoyens: [], moonpay: a }) === 'coinbase', 'sans cle : la page reste sur Coinbase (comportement d avant)');
  });

  /* 6. COUVERTURE PAYS, LUE DANS LE CATALOGUE */
  await essai('pays', () => {
    const cat = M.analyserCatalogue(FIX_PAYS, FIX_DEVISES);
    for (const p of ['NG', 'MX', 'KR', 'ZA', 'TR']) ok(M.paysServi(cat, p, 'USDC', 'live').servi === true, p + ' servi en USDC');
    for (const p of ['JP', 'IN']) ok(M.paysServi(cat, p, 'USDC', 'live').servi === false, p + ' non servi');
    ok(M.paysServi(cat, 'CA', 'USDC', 'live').servi === false && M.paysServi(cat, 'CA', 'ETH', 'live').servi === true, 'CA : USDC exclu, ETH servi');
    ok(M.paysServi(cat, 'NG', 'USDC', 'test').servi === false, 'cles test : Base absent du bac a sable -> non servi');
    ok(M.paysServi(cat, 'ZZ', 'USDC', 'live').servi === false, 'pays inconnu');
    ok(M.paysServi(null, 'NG', 'USDC', 'live').servi === false, 'catalogue non lu = non servi');
    ok(M.analyserCatalogue([], FIX_DEVISES) === null && M.analyserCatalogue(null, null) === null, 'reponse vide = null, pas « aucun pays »');
    const susp = M.analyserCatalogue(FIX_PAYS, [devise('usdc_base', USDC, [], { isSuspended: true })]);
    ok(M.paysServi(susp, 'NG', 'USDC', 'live').servi === false, 'suspendu = non servi');
    const autre = M.analyserCatalogue(FIX_PAYS, [devise('usdc_base', '0x' + '99'.repeat(20), [])]);
    ok(M.paysServi(autre, 'NG', 'USDC', 'live').servi === false, 'contrat inattendu = non servi');
    const sansExcl = M.analyserCatalogue(FIX_PAYS, [devise('usdc_base', USDC, undefined)]);
    ok(M.paysServi(sansExcl, 'NG', 'USDC', 'live').servi === false, 'exclusions non lues = non servi');
  });

  /* 7. ROUTAGE COINBASE / MOONPAY */
  await essai('routage', () => {
    const servi = { ok: true, pret: true, servi: true }, non = { ok: true, pret: true, servi: false };
    ok(choisirRail({ coinbaseMoyens: ['CARD'], moonpay: servi }) === 'coinbase', 'Coinbase sert le pays -> Coinbase');
    ok(choisirRail({ coinbaseMoyens: [], moonpay: servi }) === 'moonpay', 'Coinbase vide + MoonPay sert -> MoonPay');
    ok(choisirRail({ coinbaseMoyens: null, moonpay: servi }) === 'moonpay', 'Coinbase non lu + MoonPay sert -> MoonPay');
    ok(choisirRail({ coinbaseMoyens: ['UNSPECIFIED'], moonpay: servi }) === 'moonpay', 'UNSPECIFIED n est pas un moyen');
    ok(choisirRail({ coinbaseMoyens: [], moonpay: non }) === 'coinbase', 'personne ne sert -> comportement d avant');
  });

  /* 8. LA ROUTE DE SESSION DE BOUT EN BOUT (catalogue de banc, cles de banc) */
  await essai('session', async () => {
    const lireCatalogue = async () => M.analyserCatalogue(FIX_PAYS, FIX_DEVISES);
    const r = await M.corpsSessionMoonpay({ env: ENV_LIVE, adresse: WALLET, actif: 'USDC', block: BLOC, pays: 'ng', lireCatalogue });
    ok(r.statut === 200 && r.corps.ok === true && estUrlMoonpay(r.corps.url), 'NG : URL signee rendue');
    ok(!JSON.stringify(r.corps).includes(SK_LIVE), 'le secret n est dans aucune reponse');
    const j = await M.corpsSessionMoonpay({ env: ENV_LIVE, adresse: WALLET, actif: 'USDC', block: BLOC, pays: 'JP', lireCatalogue });
    ok(j.corps.ok === false && j.corps.servi === false && !j.corps.url, 'JP : refus, le client ne peut pas forcer MoonPay');
    const sansActif = await M.corpsSessionMoonpay({ env: ENV_LIVE, adresse: WALLET, block: BLOC, pays: 'NG', lireCatalogue });
    ok(sansActif.statut === 400, 'actif absent : 400');
    const sansPays = await M.corpsSessionMoonpay({ env: ENV_LIVE, adresse: WALLET, actif: 'USDC', pays: '', lireCatalogue });
    ok(sansPays.statut === 400, 'pays vide : 400');
    const mauvaise = await M.corpsSessionMoonpay({ env: ENV_LIVE, adresse: 'pas une adresse', actif: 'USDC', pays: 'NG', lireCatalogue });
    ok(mauvaise.statut === 400 && !mauvaise.corps.url, 'adresse invalide : 400');
    const pp = await M.corpsPaysMoonpay({ env: ENV_LIVE, pays: 'NG', actif: 'USDC', lireCatalogue });
    ok(pp.ok === true && pp.servi === true && pp.fournisseur === 'MoonPay' && /4\.5%/.test(pp.frais.carte) && /1%/.test(pp.frais.banque), 'pays : servi + frais publies');
    ok(!JSON.stringify(pp).includes(SK_LIVE) && !JSON.stringify(pp).includes(PK_LIVE), 'pays : aucune cle dans la reponse');
  });
  return ko;
}

/* ── le module reel ── */
const M = await import('./moonpay-rail.js');
const ko = await suite(M);
for (const k of ko) console.log('  KO  ' + k);
assert.equal(ko.length, 0, ko.length + ' assertion(s) rouge(s) sur le module reel');
console.log('  ok  module reel : toutes les assertions vertes');

/* ── cote page : le retour et la phrase ── */
assert.equal(fournisseurRetour('?block=' + BLOC + '&actif=USDC&via=moonpay&transactionId=abc&transactionStatus=pending'), 'MoonPay');
assert.equal(fournisseurRetour('?block=' + BLOC + '&actif=USDC'), 'Coinbase');
assert.deepEqual(lireRetourFiat('?block=' + BLOC + '&actif=USDC&via=moonpay&transactionId=abc&transactionStatus=pending'), { block: BLOC, actif: 'USDC' },
  'le retour MoonPay (avec ses parametres ajoutes) passe par le MEME lireRetourFiat');
const ph = phraseMoonpay({ pays: 'NG', nomPays: 'Nigeria', actif: 'USDC', frais: { carte: 'up to 4.5% by card', banque: 'up to 1% by bank transfer' } });
assert.match(ph, /MoonPay/); assert.match(ph, /4\.5%/); assert.match(ph, /1%/); assert.match(ph, /Nigeria \(NG\)/);
console.log('  ok  page : retour et phrase');

/* ── cablage : le serveur passe process.env, la page n accepte qu une URL signee et n en batit aucune ── */
const serveur = readFileSync(new URL('./serveur-web.js', ICI), 'utf8');
const app = readFileSync(new URL('./app.html', ICI), 'utf8');
assert.ok(serveur.includes("chemin === '/api/moonpay/pays'") && serveur.includes("chemin === '/api/moonpay/session'"), 'les deux routes sont cablees');
assert.ok(/corpsSessionMoonpay\(\{ env: process\.env/.test(serveur), 'la session lit les cles dans process.env');
assert.ok(app.includes('estUrlMoonpay(url)'), 'la page verifie l URL rendue');
assert.ok(!app.includes('buy.moonpay.com'), 'la page ne batit aucune URL MoonPay');
assert.ok(!/MOONPAY_SECRET_KEY|sk_live_|sk_test_/.test(app), 'aucun nom ni forme de secret dans la page');
console.log('  ok  cablage');

/* ── MUTANTS : chacun doit faire rougir la suite ── */
const MUTANTS = [
  ['secret faux', "createHmac('sha256', secret.trim())", "createHmac('sha256', 'pas-le-secret')"],
  ['signature omise', "+ '&signature=' + encodeURIComponent(sig) }", "}"],
  ['signe sans le ?', '.update(requete).digest', '.update(requete.slice(1)).digest'],
  ['garde sans cle retiree', "if (!e.pret) return { ok: false, pret: false, pourquoi: e.pourquoi };", ''],
  ['exclusion pays ignoree', 'if (d.exclus.includes(p))', 'if (false)'],
  ['client force le pays', 'if (!s.servi) return { statut: 200,', 'if (false) return { statut: 200,'],
];
const tmp = mkdtempSync(path.join(tmpdir(), 'mut-moonpay-'));
try {
  writeFileSync(path.join(tmp, 'onramp-session.js'), SRC_ONRAMP);
  let k = 0;
  for (const [nom, de, vers] of MUTANTS) {
    assert.ok(SRC.includes(de), 'mutant « ' + nom + ' » : motif introuvable dans moonpay-rail.js');
    const fichierMut = path.join(tmp, 'moonpay-rail-' + (k++) + '.mjs');
    writeFileSync(fichierMut, SRC.replace(de, vers));
    const Mm = await import(pathToFileURL(fichierMut).href);
    const r = await suite(Mm);
    assert.ok(r.length > 0, 'le mutant « ' + nom + ' » a SURVECU');
    console.log('  ok  mutant « ' + nom + ' » tue (' + r.length + ' rouge(s), ex. ' + r[0] + ')');
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }

/* ── catalogue PUBLIC reel (informatif : le reseau peut manquer, ce n est pas un rouge) ── */
try {
  const cat = await M.lireCatalogueMoonpay();
  if (!cat) console.log('  --  catalogue MoonPay reel : non lu (reseau)');
  else console.log('  --  catalogue MoonPay reel : USDC servi -> ' + ['NG', 'MX', 'KR', 'ZA', 'TR', 'JP', 'IN', 'US', 'FR']
    .map((p) => p + ':' + (M.paysServi(cat, p, 'USDC', 'live').servi ? 'oui' : 'non')).join(' '));
} catch (_) { console.log('  --  catalogue MoonPay reel : non lu'); }
console.log('test-moonpay-rail-20261026 : VERT');
