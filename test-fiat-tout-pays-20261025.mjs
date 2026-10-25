/* test-fiat-tout-pays-20261025.mjs — CARTE OU BANQUE -> BLOCK, DEPUIS LE PANNEAU BUY, ET RETOUR SUR CE QUI EST ARRIVE.
 *
 * Phil, 2026-10-25 : « every currency in the world can buy a block, easy pathway ». Carte mesuree le soir meme (build
 * 20261025-game46) : rail CDP pret, ETH/USDC poses sur Base dans le wallet de la personne — et cinq trous entre ce rail et
 * un block :
 *   (2) le panneau Buy (#pEchange) n avait AUCUNE entree carte : le seul chemin passait par le Bridge, sans block, donc
 *       sans retour sur le block ;
 *   (3) au retour, une intention FIXE de 0,01 ETH etait posee puis « Prepare buy » clique tout seul — sans un wei lu, et
 *       en ETH meme apres un achat d USDC ;
 *   (5) « Fund wallet » du Bridge codait l ETH en dur ;
 *   (6) les moyens de paiement par pays etaient dans la reponse de Coinbase (`payment_currencies[].limits[].id`) et
 *       JETES par `lireOptionsAchat` ;
 *   (8) montant / devise preremplis : la doc CDP borne `presetFiatAmount` a USD, CAD, GBP, EUR et rien ici ne l a
 *       exerce sur une vraie session — donc le client n en envoie PAS (epingle ci-dessous).
 *
 * NE PROUVE PAS : qu un achat par carte aboutisse, que Coinbase honore le `redirectUrl` avec `&actif=`, ni le rendu
 * navigateur (mesure a part, serveur local, 375 px et bureau). Aucune signature n est exercee : il n y en a aucune de plus.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { lireOptionsAchat } from './onramp-session.js';
import { actifCarte, lireRetourFiat, repereValide, verdictArrivee, phraseMoyens, paysDuNavigateur, PHRASE_COMPTE_HORS_US } from './retour-fiat.js';

let n = 0;
const ko = [];
/* chaque cas tourne, meme apres un rouge : le compte des rouges dit COMBIEN de trous restent, pas seulement le premier */
const cas = async (titre, f) => { n += 1; try { await f(); } catch (e) { ko.push(titre); console.error('KO ' + titre + ' — ' + String(e.message).split('\n')[0]); } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const nuSrv = srv.replace(/\/\*[\s\S]*?\*\//g, ' ');
/* le corps d une fonction de premier niveau : jusqu a la premiere accolade fermante en colonne 0, fins de ligne CRLF ou LF.
 * ⛔ Une ancre introuvable rend un corps VIDE (et le test rougit), jamais le reste du fichier. */
const corpsDe = (i) => {
  if (i < 0) return '';
  const m = /\r?\n\}\r?\n/.exec(nu.slice(i));
  return m ? nu.slice(i, i + m.index) : '';
};
const ETH = '0x0000000000000000000000000000000000000000';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const AUTRE = '0x' + '1'.repeat(40);
const BLOC = '0xb20000000000000000000066242d4067724cb7a1';

/* ── (6) les moyens de paiement : LUS dans la reponse, plus jetes ────────────────────────────────── */
const reponse = (corps) => async () => ({ ok: true, status: 200, json: async () => corps });
const env = { CDP_API_KEY_ID: '1', CDP_API_KEY_SECRET: '1', __CDP_JWT: 'j' };
await cas('(6) les ids de moyens de paiement par devise sont gardes', async () => {
  const r = await lireOptionsAchat({ env, pays: 'FR', fetchImpl: reponse({
    purchase_currencies: [],
    payment_currencies: [
      { id: 'EUR', limits: [{ id: 'CARD', min: '5', max: '7500' }, { id: 'APPLE_PAY', min: '5', max: '500' }] },
      { id: 'USD', limits: [{ id: 'CARD' }, { id: 'UNSPECIFIED' }, { id: 'evil<script>' }] },
    ] }) });
  assert.equal(r.etat, 'OK');
  assert.deepEqual(r.moyensParFiat, { EUR: ['CARD', 'APPLE_PAY'], USD: ['CARD'] }, JSON.stringify(r.moyensParFiat));
  assert.deepEqual(r.moyens, ['CARD', 'APPLE_PAY']);
});
await cas('(6) liste absente = null (non lu), liste vide = [] — jamais confondues', async () => {
  const a = await lireOptionsAchat({ env, pays: 'JP', fetchImpl: reponse({ purchase_currencies: [] }) });
  assert.equal(a.moyens, null, 'payment_currencies absent doit rendre null');
  const b = await lireOptionsAchat({ env, pays: 'JP', fetchImpl: reponse({ purchase_currencies: [], payment_currencies: [] }) });
  assert.deepEqual(b.moyens, []);
  const c = await lireOptionsAchat({ env, pays: 'JP', fetchImpl: reponse({ purchase_currencies: [], payment_currencies: [{ id: 'JPY' }] }) });
  assert.equal(c.moyens, null, 'une devise sans `limits` n est pas « aucun moyen » : c est non lu');
});
await cas('(6) la route /api/onramp/options rend les moyens au client', async () => {
  const i = nuSrv.indexOf("chemin === '/api/onramp/options'");
  const corps = nuSrv.slice(i, nuSrv.indexOf("chemin === '/api/onramp/session'", i));
  assert.ok(i > 0 && /moyens: r\.moyens/.test(corps) && /moyensParFiat: r\.moyensParFiat/.test(corps), 'la route ne transmet pas les moyens');
});
await cas('(6) a l ecran : vide = « could not read », jamais « none » ; hors US = compte Coinbase', async () => {
  assert.match(phraseMoyens({ pays: 'JP', moyens: [] }), /^Could not read which payment methods/);
  assert.match(phraseMoyens({ pays: 'JP', moyens: null }), /^Could not read/);
  assert.ok(!/\bnone\b|no payment/i.test(phraseMoyens({ pays: 'JP', moyens: [] })));
  const fr = phraseMoyens({ pays: 'FR', nomPays: 'France', moyens: ['CARD', 'APPLE_PAY'] });
  assert.equal(fr, 'Coinbase lists for France (FR): card, Apple Pay. ' + PHRASE_COMPTE_HORS_US);
  assert.ok(!phraseMoyens({ pays: 'US', moyens: ['CARD'] }).includes(PHRASE_COMPTE_HORS_US), 'la phrase hors US est dite aux US');
  assert.ok(!phraseMoyens({ pays: 'GB', moyens: ['GUEST_CHECKOUT_CARD'] }).includes(PHRASE_COMPTE_HORS_US), 'la phrase contredit ce que Coinbase liste');
  assert.equal(paysDuNavigateur(['fr-FR', 'en']), 'FR');
  assert.equal(paysDuNavigateur(['en']), null);
  assert.ok(/fetch\('\/api\/onramp\/options\?pays=' \+ encodeURIComponent\(/.test(nu), 'la page ne lit jamais les moyens');
  assert.ok(/phraseMoyens\(/.test(nu), 'la page ne dit pas les moyens');
});

/* ── (2) l entree carte du panneau Buy ───────────────────────────────────────────────────────────── */
await cas('(2) #pEchange porte « Pay by card or bank »', async () => {
  const i = nu.indexOf('id="pEchange"');
  const panneau = nu.slice(i, nu.indexOf('id="peJournal"', i));
  assert.ok(/id="peCarteBtn"/.test(panneau), 'aucune entree carte dans le panneau Buy');
  assert.ok(/Pay by card or bank/.test(panneau));
});
await cas('(2) l actif finance est celui que le plan consomme — jamais une supposition', async () => {
  assert.deepEqual(actifCarte({ quote: ETH, eth: ETH, usdc: USDC }), { actif: 'ETH', parPayWith: false, pourquoi: null });
  assert.equal(actifCarte({ quote: USDC.toLowerCase(), eth: ETH, usdc: USDC }).actif, 'USDC');
  assert.equal(actifCarte({ quote: null, eth: ETH, usdc: USDC }).actif, null, 'cotation inconnue : on ne suppose pas l ETH');
  assert.deepEqual(actifCarte({ quote: AUTRE, offerts: [AUTRE, USDC], eth: ETH, usdc: USDC }), { actif: 'USDC', parPayWith: true, pourquoi: null });
  assert.equal(actifCarte({ quote: AUTRE, offerts: [AUTRE], eth: ETH, usdc: USDC }).pourquoi, 'SANS_ROUTE');
  assert.equal(actifCarte({ entree: USDC, quote: ETH, eth: ETH, usdc: USDC }).actif, 'USDC', 'la devise choisie dans Pay with prime');
  assert.deepEqual(actifCarte({ entree: AUTRE, quote: ETH, eth: ETH, usdc: USDC }), { actif: 'ETH', parPayWith: true, pourquoi: null },
    'Pay with sur une devise que la carte ne pose pas : il faut dire de revenir a ETH');
  const i = nu.indexOf("$('#peCarteBtn')");
  assert.ok(i > 0, 'le bouton carte n a pas de gestionnaire');
  const h = nu.slice(i, i + 1600);
  assert.ok(/ouvrirRailFiat\(ev, \{ href: 'https:\/\/www\.coinbase\.com\/onramp' \}, a\.actif\)/.test(h), 'le bouton carte n ouvre pas le rail avec l actif calcule');
  assert.ok(/!compte/.test(h), 'sans wallet le bouton partirait sans destination ni retour');
});

/* ── (3) le retour : l actif voyage, et le montant vient d un solde LU ───────────────────────────── */
await cas('(3) le serveur ajoute l actif valide au retour, et rien d autre', async () => {
  assert.ok(/\? '\?block=' \+ demande\.retourBlock \+ '&actif=' \+ demande\.actif : ''/.test(nuSrv), 'le retour ne porte pas l actif');
  assert.ok(/const retour = 'https:\/\/tokenizedblock\.space\/'/.test(nuSrv), 'le domaine de retour ne vient plus du serveur');
});
await cas('(3) le retour est revalide, et ?block= seul n est PAS un retour de paiement', async () => {
  assert.deepEqual(lireRetourFiat('?block=' + BLOC + '&actif=usdc'), { block: BLOC, actif: 'USDC' });
  assert.equal(lireRetourFiat('?block=' + BLOC), null);
  assert.equal(lireRetourFiat('?block=' + BLOC + '&actif=DAI'), null);
  assert.equal(lireRetourFiat('?block=0x12&actif=ETH'), null);
});
await cas('(3) plus de 0,01 ETH fixe, plus de « Prepare buy » clique tout seul', async () => {
  const i = nu.indexOf('const retourFiat = lireRetourFiat(location.search)');
  assert.ok(i > 0, 'le retour n est pas lu par lireRetourFiat');
  assert.ok(!/poserIntent\(\{ kind: 'buy', adr: blockRetour/.test(nu), 'le retour pose encore une intention fixe');
  const j = nu.indexOf('async function reprendreRetourFiat(');
  const corps = corpsDe(j);
  assert.ok(j > 0 && /verdictArrivee\(/.test(corps), 'le retour ne juge pas ce qui est arrive a partir des soldes lus');
  assert.ok(!/peAcheter'\)\.click|\.click\(\)/.test(corps), 'le retour clique encore un bouton a la place de la personne');
  assert.ok(/your purchase is still arriving/i.test(corps), 'le retour ne dit pas que l achat est encore en route');
});
await cas('(3) verdict : seul un solde LU qui a monte preremplit', async () => {
  const R = 300000000000000n;
  assert.equal(verdictArrivee({ avant: 5n, maintenant: null, actif: 'USDC' }).etat, 'NON_LU');
  assert.equal(verdictArrivee({ avant: 5n, maintenant: 5n, actif: 'USDC' }).etat, 'EN_ROUTE');
  assert.deepEqual(verdictArrivee({ avant: 5n, maintenant: 25n, actif: 'USDC' }), { etat: 'ARRIVE', montant: 20n, arrive: 20n });
  const e = verdictArrivee({ avant: 0n, maintenant: 10n ** 16n, actif: 'ETH', reserveGasWei: R });
  assert.equal(e.etat, 'ARRIVE'); assert.equal(e.montant, 10n ** 16n - R, 'en ETH le gas reste dans le wallet');
  assert.equal(verdictArrivee({ avant: 0n, maintenant: R, actif: 'ETH', reserveGasWei: R }).etat, 'ARRIVE_SOUS_GAS');
  assert.equal(verdictArrivee({ avant: null, maintenant: 0n, actif: 'USDC' }).etat, 'EN_ROUTE');
  assert.equal(verdictArrivee({ avant: null, maintenant: 7n, actif: 'USDC' }).etat, 'SANS_REPERE');
  const t = 1_000_000_000_000;
  assert.equal(repereValide({ adr: '0x' + 'a'.repeat(40), actif: 'ETH', solde: '12', t }, { adr: '0x' + 'A'.repeat(40), actif: 'ETH', maintenantMs: t + 1000 }), 12n);
  assert.equal(repereValide({ adr: '0x' + 'a'.repeat(40), actif: 'ETH', solde: '12', t }, { adr: '0x' + 'b'.repeat(40), actif: 'ETH', maintenantMs: t }), null, 'repere d un autre wallet');
  assert.equal(repereValide({ adr: '0x' + 'a'.repeat(40), actif: 'USDC', solde: '12', t }, { adr: '0x' + 'a'.repeat(40), actif: 'ETH', maintenantMs: t }), null, 'repere d un autre actif');
  assert.equal(repereValide({ adr: '0x' + 'a'.repeat(40), actif: 'ETH', solde: '12', t }, { adr: '0x' + 'a'.repeat(40), actif: 'ETH', maintenantMs: t + 7 * 3600e3 }), null, 'repere trop vieux');
});
await cas('(3) le solde est note AVANT de partir payer, sans retarder l onglet', async () => {
  const i = nu.indexOf('async function ouvrirRailFiat(');
  const corps = corpsDe(i);
  const iOpen = corps.indexOf("window.open('', '_blank')"), iNote = corps.indexOf('noterSoldeAvantFiat(');
  assert.ok(iOpen > 0 && iNote > iOpen, 'le repere n est pas pris, ou il est pris AVANT l ouverture de l onglet (popup bloquee)');
  assert.ok(/void noterSoldeAvantFiat\(/.test(corps), 'le repere est attendu : l onglet resterait blanc pendant la lecture');
});

/* ── (5) Fund wallet : ETH ou USDC, au choix ────────────────────────────────────────────────────── */
await cas('(5) Fund wallet du Bridge ne code plus l ETH en dur', async () => {
  assert.ok(!/ouvrirRailFiat\(e, brFund, 'ETH'\)/.test(nu), 'Fund wallet ouvre encore l ETH en dur');
  assert.ok(/ouvrirRailFiat\(e, brFund, actifFund\)/.test(nu), 'Fund wallet n ouvre pas l actif choisi');
  const i = nu.indexOf('id="brFundCarte"');
  const carte = nu.slice(i, nu.indexOf('</div>', nu.indexOf('id="brFundWallet"', i)));
  assert.ok(/data-fund-actif="ETH"/.test(carte) && /data-fund-actif="USDC"/.test(carte), 'pas de choix ETH / USDC');
});

/* ── (8) rien de prerempli cote Coinbase tant que ce n est pas exerce ─────────────────────────────── */
await cas('(8) le client n envoie ni montant ni devise fiat', async () => {
  for (const m of nu.matchAll(/fetch\('\/api\/onramp\/session\?[^;]*;/g)) {
    assert.ok(!/montant=|fiatCurrency|presetFiatAmount/.test(m[0]), 'le client preremplit un montant non exerce : ' + m[0]);
  }
});

assert.equal(n, 13, 'compte de cas inattendu : ' + n);
if (ko.length) { console.error(ko.length + ' / ' + n + ' KO'); process.exit(1); }
console.log('ok fiat-tout-pays - ' + n + ' cas : entree carte au panneau Buy, retour sur le solde LU, Fund ETH/USDC, moyens par pays.');
console.log('NE PROUVE PAS : un achat reel, le redirectUrl honore par Coinbase avec &actif=, ni le rendu (mesure navigateur a part).');
