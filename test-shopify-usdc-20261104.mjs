/* test-shopify-usdc-20261104.mjs -- PAYER EN USDC SUR SHOPIFY : WEBHOOK `orders/paid` VERIFIE, DROITS HORS CHAINE, CACHE SANS CONFIG.
 *
 * Ce que ce banc PROUVE : le HMAC est calcule comme la doc le dit (HMAC-SHA256 du CORPS BRUT, client secret, base64 ; compare en
 * temps constant) et refuse tout le reste ; une boutique autre que la notre est refusee ; une livraison rejouee (meme
 * X-Shopify-Webhook-Id) et une commande rejouee (autre livraison) n ouvrent pas deux fois ; seule `financial_status: paid` ouvre ;
 * le pass (tirage du jour) est REFUSE, nomme ; un SKU inconnu est garde, pas jete ; aucune reponse ne contient le secret ;
 * le magasin survit a une reouverture et refuse un fichier illisible ; le serveur et la page sont cables ; huit mutants meurent.
 * Ce qu il NE PROUVE PAS : qu une vraie boutique livre ce webhook (aucune boutique, aucun secret ici), ni une livraison on-chain
 * (aucun contrat ne sait livrer ce droit sans qu un wallet signe et paie : voir l en-tete de shopify-usdc.js).
 * Le secret ci-dessous est une valeur de banc fabriquee : ce n est pas une vraie cle.
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ICI = new URL('./', import.meta.url);
const SRC = readFileSync(new URL('./shopify-usdc.js', ICI), 'utf8');
const SERVEUR = readFileSync(new URL('./serveur-web.js', ICI), 'utf8');
const PAGE = readFileSync(new URL('./app.html', ICI), 'utf8');

const SECRET = 'banc' + '-secret-' + 'fixe-0001';
const DOMAINE = 'banc-boutique.myshopify.com';
const ENV = { SHOPIFY_API_SECRET: SECRET, SHOPIFY_SHOP_DOMAIN: DOMAINE, SHOPIFY_STORE_URL: 'https://boutique.example/collections/tblock' };
const W1 = '0x' + 'aB'.repeat(20);
const W2 = '0x' + '3c'.repeat(20);

/* commande de banc : champs RECOPIES de l exemple `orders/paid` (shopify.dev/docs/api/webhooks/latest.md) et de la forme
 * { name, value } des note_attributes / properties (shopify.dev/docs/api/admin-rest/latest/resources/order). */
const commande = (extra = {}) => ({
  id: 820982911946154508, admin_graphql_api_id: 'gid://shopify/Order/820982911946154508', financial_status: 'paid', test: true,
  email: 'jon@example.com', note_attributes: [{ name: 'wallet', value: W1 }],
  line_items: [
    { sku: 'TB-SKIN', quantity: 2, properties: [] },
    { sku: 'TB-BIRTH', quantity: 1, properties: [{ name: 'wallet', value: W2 }] },
    { sku: 'TB-PASS', quantity: 1, properties: [] },
    { sku: 'SKU2006-001', quantity: 1, properties: [] },
  ], ...extra });
const brut = (o) => Buffer.from(JSON.stringify(o), 'utf8');
const signe = (b, s = SECRET) => createHmac('sha256', s).update(b).digest('base64');
const entetes = (b, extra = {}) => ({ 'x-shopify-hmac-sha256': signe(b), 'x-shopify-shop-domain': DOMAINE, 'x-shopify-topic': 'orders/paid',
  'x-shopify-webhook-id': 'wh-1', ...extra });

async function suite(M) {
  const ko = [];
  const ok = (c, m) => { if (!c) ko.push(m); };
  const essai = async (m, fn) => { try { await fn(); } catch (e) { ko.push(m + ' (jete : ' + String(e && e.message).slice(0, 80) + ')'); } };

  /* 1. L ETAT, SANS JAMAIS LE SECRET */
  await essai('etat', () => {
    const v = M.etatShopify({});
    ok(v.pret === false && /SHOPIFY_API_SECRET/.test(v.pourquoi) && /SHOPIFY_SHOP_DOMAIN/.test(v.pourquoi) && /SHOPIFY_STORE_URL/.test(v.pourquoi), 'sans config : les TROIS noms a poser');
    ok(M.etatShopify({ ...ENV, SHOPIFY_SHOP_DOMAIN: 'boutique.example' }).pret === false, 'un domaine qui n est pas <nom>.myshopify.com est refuse');
    ok(M.etatShopify({ ...ENV, SHOPIFY_STORE_URL: 'http://boutique.example/' }).pret === false, 'une URL http est refusee');
    ok(M.etatShopify({ ...ENV, SHOPIFY_STORE_URL: 'https://a:b@boutique.example/' }).pret === false, 'une URL avec identifiants est refusee');
    const e = M.etatShopify(ENV);
    ok(e.pret === true && e.url === 'https://boutique.example/collections/tblock' && e.domaine === DOMAINE, 'config complete : pret');
    const pub = JSON.stringify(M.corpsEtat(ENV));
    ok(!pub.includes(SECRET) && !pub.includes(DOMAINE) && pub.includes('"url":"https://boutique.example/collections/tblock"'), 'etat public : l URL seule, ni secret ni domaine');
    ok(JSON.stringify(M.corpsEtat({})) === '{"ok":true,"pret":false}', 'etat public sans config : pret false, rien d autre');
  });

  /* 2. LE HMAC, TEL QUE LA DOC LE DIT */
  await essai('hmac', () => {
    const b = brut(commande());
    ok(M.verifierHmac(b, signe(b), SECRET) === true, 'HMAC-SHA256(client secret, corps brut) base64 : accepte');
    ok(M.verifierHmac(b, signe(b, SECRET + 'x'), SECRET) === false, 'autre secret : refuse');
    ok(M.verifierHmac(Buffer.concat([b, Buffer.from(' ')]), signe(b), SECRET) === false, 'un octet de plus dans le corps : refuse');
    ok(M.verifierHmac(b, signe(b).slice(0, 20), SECRET) === false, 'en-tete tronque : refuse (sans jeter)');
    ok(M.verifierHmac(b, 'pas du base64 !!', SECRET) === false, 'en-tete illisible : refuse');
    ok(M.verifierHmac(b.toString('utf8'), signe(b), SECRET) === false, 'un corps deja decode (chaine) est refuse : le HMAC porte sur les octets');
    ok(M.verifierHmac(b, signe(b), '') === false && M.verifierHmac(b, '', SECRET) === false, 'sans secret ou sans en-tete : refuse');
    ok(createHmac('sha256', SECRET).update(b).digest('hex') !== signe(b), 'temoin : hex n est pas base64');
    ok(M.verifierHmac(b, createHmac('sha256', SECRET).update(b).digest('hex'), SECRET) === false, 'un HMAC en hex est refuse');
  });

  /* 3. LE WEBHOOK, DE BOUT EN BOUT */
  await essai('webhook', () => {
    const mag = M.creerMagasin();
    const b = brut(commande());
    const T = () => '2026-11-04T12:00:00.000Z';
    ok(M.traiterWebhook({ env: {}, entetes: entetes(b), corpsBrut: b, magasin: mag }).statut === 404, 'sans config : 404, rien lu');
    ok(M.traiterWebhook({ env: ENV, entetes: entetes(b, { 'x-shopify-hmac-sha256': signe(b, 'autre') }), corpsBrut: b, magasin: mag }).statut === 401, 'HMAC faux : 401');
    ok(M.traiterWebhook({ env: ENV, entetes: entetes(b, { 'x-shopify-shop-domain': 'autre.myshopify.com' }), corpsBrut: b, magasin: mag }).statut === 401, 'autre boutique : 401');
    ok(M.traiterWebhook({ env: ENV, entetes: entetes(b, { 'x-shopify-webhook-id': '' }), corpsBrut: b, magasin: mag }).statut === 400, 'sans id de livraison : 400');
    ok(mag.droitsDe(W1).length === 0, 'aucun refus n a ouvert de droit');

    const r = M.traiterWebhook({ env: ENV, entetes: entetes(b), corpsBrut: b, magasin: mag, maintenant: T });
    ok(r.statut === 200 && r.corps.etat === 'NOTE', 'commande payee : 200 NOTE');
    ok(r.corps.droits === 2 && r.corps.refuses === 1 && r.corps.inconnus === 1 && r.corps.sansWallet === 0, 'skin + naissance ouverts, pass refuse, SKU inconnu garde');
    const d1 = mag.droitsDe(W1); const d2 = mag.droitsDe(W2);
    ok(d1.length === 1 && d1[0].droit === 'skin' && d1[0].quantite === 2 && d1[0].test === true && d1[0].livre === false, 'W1 : 2 skins (wallet de la commande), test, non livre');
    ok(d2.length === 1 && d2[0].droit === 'naissance' && d2[0].quantite === 1, 'W2 : 1 naissance (wallet de la LIGNE prime sur la commande)');
    ok(mag.droitsDe(W1.toUpperCase().replace('0X', '0x')).length === 1, 'lecture insensible a la casse');
    const tout = JSON.stringify(mag.toutes());
    ok(!tout.includes('jon@example.com'), 'aucun email garde');
    ok(tout.includes('the skin pass enters the daily draw'), 'le refus du pass est NOMME dans la commande gardee');

    const rejoue = M.traiterWebhook({ env: ENV, entetes: entetes(b), corpsBrut: b, magasin: mag });
    ok(rejoue.statut === 200 && rejoue.corps.etat === 'DEJA' && rejoue.corps.pourquoi === 'delivery already processed' && rejoue.corps.droits === undefined, 'meme livraison rejouee : DEJA, rien rouvert');
    const autre = M.traiterWebhook({ env: ENV, entetes: entetes(b, { 'x-shopify-webhook-id': 'wh-2' }), corpsBrut: b, magasin: mag });
    ok(autre.statut === 200 && autre.corps.etat === 'DEJA' && mag.droitsDe(W1).length === 1 && mag.droitsDe(W1)[0].recuLe === T(), 'meme commande, autre livraison : DEJA, pas de second droit, date d origine');

    const bp = brut(commande({ admin_graphql_api_id: 'gid://shopify/Order/2', financial_status: 'pending' }));
    const p = M.traiterWebhook({ env: ENV, entetes: entetes(bp, { 'x-shopify-webhook-id': 'wh-3' }), corpsBrut: bp, magasin: mag });
    ok(p.statut === 200 && p.corps.etat === 'IGNORE' && !JSON.stringify(mag.toutes()).includes('Order/2"'), 'financial_status pending : IGNORE, aucun droit');
    const bt = brut(commande({ admin_graphql_api_id: 'gid://shopify/Order/3' }));
    const t = M.traiterWebhook({ env: ENV, entetes: entetes(bt, { 'x-shopify-webhook-id': 'wh-4', 'x-shopify-topic': 'orders/create' }), corpsBrut: bt, magasin: mag });
    ok(t.statut === 200 && t.corps.etat === 'IGNORE' && !JSON.stringify(mag.toutes()).includes('Order/3"'), 'autre sujet : IGNORE, aucun droit');
    const bs = brut(commande({ admin_graphql_api_id: 'gid://shopify/Order/4', note_attributes: [], line_items: [{ sku: 'TB-SKIN', quantity: 1, properties: [{ name: 'wallet', value: '0x12' }] }] }));
    const s = M.traiterWebhook({ env: ENV, entetes: entetes(bs, { 'x-shopify-webhook-id': 'wh-5' }), corpsBrut: bs, magasin: mag });
    ok(s.statut === 200 && s.corps.sansWallet === 1, 'wallet absent ou invalide : le droit est GARDE et compte sans wallet (a rembourser ou corriger)');
    const bj = Buffer.from('{pas du json');
    ok(M.traiterWebhook({ env: ENV, entetes: entetes(bj, { 'x-shopify-webhook-id': 'wh-6' }), corpsBrut: bj, magasin: mag }).statut === 400, 'corps non JSON (mais signe) : 400');
    for (const x of [r, rejoue, autre, p, t, s]) ok(!JSON.stringify(x).includes(SECRET), 'aucune reponse ne contient le secret');
  });

  /* 4. LECTURE PUBLIQUE DES DROITS */
  await essai('droits', () => {
    const mag = M.creerMagasin();
    ok(M.corpsDroits({ env: {}, magasin: mag, adresse: W1 }).corps.pret === false, 'sans config : pret false');
    ok(M.corpsDroits({ env: ENV, magasin: mag, adresse: '0x12' }).statut === 400, 'adresse invalide : 400');
    ok(M.corpsDroits({ env: ENV, magasin: mag, adresse: W1 }).corps.droits.length === 0, 'wallet sans droit : liste vide');
  });

  /* 5. LE MAGASIN SUR DISQUE */
  await essai('disque', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'banc-shopify-'));
    try {
      const f = path.join(dir, 'droits.json');
      const b = brut(commande());
      M.traiterWebhook({ env: ENV, entetes: entetes(b), corpsBrut: b, magasin: M.creerMagasin({ fichier: f }) });
      const re = M.creerMagasin({ fichier: f });
      ok(re.droitsDe(W1).length === 1 && re.livraisonVue('wh-1'), 'reouvert : droits et livraisons survivent');
      writeFileSync(f, '{tronque');
      let jete = false;
      try { M.creerMagasin({ fichier: f }); } catch (_) { jete = true; }
      ok(jete && readFileSync(f, 'utf8') === '{tronque', 'fichier illisible : jete, JAMAIS ecrase');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  return ko;
}

const M = await import('./shopify-usdc.js');
const ko = await suite(M);
if (ko.length) { for (const k of ko) console.log('KO ' + k); process.exit(1); }
console.log('  ok  suite verte sur shopify-usdc.js');

/* ── le cablage : serveur et page ── */
assert.ok(SERVEUR.includes("from './shopify-usdc.js'"), 'serveur : module importe');
for (const r of ['/api/shopify/etat', '/api/shopify/droits', '/api/shopify/webhook']) assert.ok(SERVEUR.includes("'" + r + "'"), 'serveur : route ' + r);
assert.ok(/corpsBrut: Buffer\.concat\(morceaux\)/.test(SERVEUR), 'serveur : le webhook recoit les OCTETS bruts');
assert.ok(/tailleSh \+= c\.length/.test(SERVEUR) && /SHOPIFY_CORPS_MAX/.test(SERVEUR), 'serveur : taille du corps bornee');
assert.ok(/<a class="bouton sec" id="skinShopify"[^>]*\shidden>/.test(PAGE), 'page : le lien Shopify est CACHE par defaut');
assert.ok(PAGE.includes("fetch('/api/shopify/etat'") && /u\.protocol !== 'https:'/.test(PAGE), 'page : l URL vient du serveur, https seulement');
const blocPage = PAGE.slice(PAGE.indexOf('async function montrerBoutiqueShopify'), PAGE.indexOf('void montrerBoutiqueShopify();'));
assert.ok(blocPage.length > 0 && !/eth_send|wallet_sendCalls|personal_sign|eth_sign/.test(blocPage), 'page : aucun appel de wallet dans le lien Shopify');
assert.ok(!/privateKey|PRIVATE_KEY|signTransaction|eth_sendRawTransaction/.test(SRC), 'module : aucune cle de wallet, aucune signature de tx');
console.log('  ok  cablage serveur + page');

/* ── mutants sur des COPIES ── */
const MUTANTS = [
  ['HMAC non verifie', "if (!verifierHmac(corpsBrut, entete(entetes, 'x-shopify-hmac-sha256'), env[NOM_SECRET]))", 'if (false)'],
  ['longueur non comparee', 'if (recu.length !== attendu.length) return false;', ''],
  ['boutique non verifiee', "if (bas(entete(entetes, 'x-shopify-shop-domain')) !== e.domaine)", 'if (false)'],
  ['livraison non dedupliquee', 'if (magasin.livraisonVue(wid))', 'if (false)'],
  ['paid non exige', "if (c.financial_status !== 'paid')", 'if (false)'],
  ['pass vendu', 'if (SKUS_REFUSES[sku])', 'if (false)'],
  ['wallet de ligne ignore', "valeurNommee(l.properties, 'wallet') || walletCommande", 'walletCommande'],
  ['fichier illisible ecrase', "throw new Error('entitlement file unreadable: ' + fichier);", ''],
];
const tmp = mkdtempSync(path.join(tmpdir(), 'mut-shopify-'));
try {
  /* les imports du module (bons de skin, 2026-11-04) voyagent avec la copie */
  for (const dep of ['keccak.js', 'signeur-secp256k1.js']) writeFileSync(path.join(tmp, dep), readFileSync(new URL('./' + dep, ICI), 'utf8'));
  let k = 0;
  for (const [nom, de, vers] of MUTANTS) {
    assert.ok(SRC.includes(de), 'mutant « ' + nom + ' » : motif introuvable dans shopify-usdc.js');
    const fichierMut = path.join(tmp, 'shopify-usdc-' + (k++) + '.mjs');
    writeFileSync(fichierMut, SRC.replace(de, vers));
    const r = await suite(await import(pathToFileURL(fichierMut).href));
    assert.ok(r.length > 0, 'le mutant « ' + nom + ' » a SURVECU');
    console.log('  ok  mutant « ' + nom + ' » tue (' + r.length + ' rouge(s), ex. ' + r[0] + ')');
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log('test-shopify-usdc-20261104 : VERT');
