/* test-shopify-bon-20261104.mjs -- LE BON DE SKIN (EIP-712, BlockSkinsVoucher.sol) ET LE REMBOURSEMENT (refunds/create).
 *
 * Ce que ce banc PROUVE : le digest JS est OCTET POUR OCTET celui de BlockSkinsVoucher.voucherDigest (vecteur epingle des DEUX
 * cotes : contracts/test/BlockSkinsVoucher.t.sol test_jsDigestPinned / test_jsSignatureAccepted / test_jsCalldataParity) ;
 * un bon n est rendu que pour une commande payee, NON test, non remboursee, au wallet ECRIT dans la commande, pour une unite de
 * la quantite, avec un block et une recette valides ; il se relit a l adresse de la cle ; la cle n apparait dans aucune reponse ;
 * un remboursement revoque, nomme les bons encore valables (a annuler sur la chaine par le owner), et un remboursement arrive
 * AVANT le paiement empeche ce paiement d ouvrir quoi que ce soit ; l order_id (> 2^53) est relu sans arrondi ; neuf mutants
 * meurent.
 * Ce qu il NE PROUVE PAS : un claim sur Base (contrat NON deploye) ; une vraie livraison Shopify.
 * ⛔ CLES : 0xA11CE est la cle de banc de Foundry (vm.sign), la cle du serveur ici est TIREE AU HASARD a chaque execution, en
 *   memoire, jetee a la fin : aucune vraie cle.
 */
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { keccak256Hex } from './keccak.js';
import { adresseDe, signerDigest, recupererAdresse, N } from './signeur-secp256k1.js';

const ICI = new URL('./', import.meta.url);
const SRC = readFileSync(new URL('./shopify-usdc.js', ICI), 'utf8');
const SERVEUR = readFileSync(new URL('./serveur-web.js', ICI), 'utf8');
const SOL = readFileSync(new URL('./contracts/src/BlockSkinsVoucher.sol', ICI), 'utf8');
const SOL_TEST = readFileSync(new URL('./contracts/test/BlockSkinsVoucher.t.sol', ICI), 'utf8');

/* une cle JETABLE, tiree ici, jamais ecrite sur disque */
const cleJetable = () => { for (;;) { const k = BigInt('0x' + randomBytes(32).toString('hex')); if (k > 0n && k < N) return '0x' + k.toString(16).padStart(64, '0'); } };
const CLE = cleJetable();
const SIGNATAIRE = adresseDe(CLE);
const SECRET = 'banc' + '-secret-' + 'fixe-0002';
const DOMAINE = 'banc-boutique.myshopify.com';
const CONTRAT = '0x' + '5c'.repeat(20);
const ENV = { SHOPIFY_API_SECRET: SECRET, SHOPIFY_SHOP_DOMAIN: DOMAINE, SHOPIFY_STORE_URL: 'https://boutique.example/',
  SHOPIFY_VOUCHER_SIGNER_KEY: CLE, SHOPIFY_VOUCHER_CONTRACT: CONTRAT };
const W1 = '0x' + 'ab'.repeat(20);
const W2 = '0x' + '3c'.repeat(20);
const BLOC = '0x' + '12'.repeat(20);
let RECETTE = 0n; [10, 20, 30, 40, 50, 60, 70].forEach((h, i) => { RECETTE |= BigInt(h) << BigInt(9 * i); });
const GID = 'gid://shopify/Order/820982911946154508';
const T0 = 1_800_000_000;

const brut = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o), 'utf8');
const entetes = (b, sujet, wid) => ({ 'x-shopify-hmac-sha256': createHmac('sha256', SECRET).update(b).digest('base64'),
  'x-shopify-shop-domain': DOMAINE, 'x-shopify-topic': sujet, 'x-shopify-webhook-id': wid });
const paye = (gid, extra = {}) => ({ admin_graphql_api_id: gid, financial_status: 'paid', test: false,
  note_attributes: [{ name: 'wallet', value: W1 }], line_items: [{ sku: 'TB-SKIN', quantity: 2, properties: [] }], ...extra });
/* refunds/create : le NOMBRE tel que l exemple de la doc l ecrit (shopify.dev/docs/api/webhooks/latest.md), en TEXTE brut, et
 * repete dans une transaction imbriquee comme dans l exemple */
const rembourse = (num, autre = num) => '{"id":890088186047892319,"order_id":' + num + ',"note":"x","refund_line_items":[],'
  + '"transactions":[{"id":245135271310201194,"order_id":' + autre + ',"kind":"refund"}]}';

async function suite(M) {
  const ko = [];
  const ok = (c, m) => { if (!c) ko.push(m); };
  const essai = async (m, fn) => { try { await fn(); } catch (e) { ko.push(m + ' (jete : ' + String(e && e.message).slice(0, 90) + ')'); } };
  const iso = (s) => new Date(s * 1000).toISOString();

  /* 1. PARITE AVEC LE CONTRAT : le vecteur epingle dans BlockSkinsVoucher.t.sol */
  await essai('parite', () => {
    const oid = keccak256Hex(new TextEncoder().encode('gid://shopify/Order/820982911946154508'));
    const d = M.donneesBon({ chainId: 31337, contrat: '0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f', recipient: '0x000000000000000000000000000000000000BEEF',
      orderId: oid, blockToken: '0x0000000000000000000000000000000000001234', recipe: RECETTE.toString(), deadline: 1800001800 });
    const dg = M.digestBon(d);
    ok(dg === '0xc13b4431c297de68d4dba0453ec2eb5bf1c040e6a9ad196dd51d80808be6499f', 'digest = voucherDigest du contrat (vecteur Foundry)');
    ok(SOL_TEST.includes(dg.slice(2)), 'le meme digest est epingle dans BlockSkinsVoucher.t.sol');
    const sig = signerDigest('0xA11CE', dg);
    ok(SOL_TEST.includes(sig.slice(2)), 'la signature JS (cle de banc 0xA11CE) est celle que le contrat accepte (test_jsSignatureAccepted)');
    const cd = M.encoderClaim(d.message, sig);
    ok(SOL_TEST.includes(cd.slice(2)), 'le calldata JS est celui que test_jsCalldataParity compare a abi.encodeCall');
    ok((cd.length - 2) % 64 === 8, 'calldata = selecteur + mots de 32 octets (signature completee)');
    ok(SOL.includes('"' + M.TYPE_BON + '"') && SOL.includes('keccak256("' + M.NOM_DOMAINE_BON + '")'), 'type et domaine : les memes chaines que le contrat');
  });

  /* 2. LE RAIL DES BONS, SANS JAMAIS LA CLE */
  await essai('etat', () => {
    const e = M.etatBon({});
    ok(e.pret === false && e.pourquoi.includes('SHOPIFY_VOUCHER_SIGNER_KEY') && e.pourquoi.includes('SHOPIFY_VOUCHER_CONTRACT'), 'sans config : les deux noms');
    ok(M.etatBon({ ...ENV, SHOPIFY_VOUCHER_SIGNER_KEY: '0x00' }).pret === false, 'cle nulle : refusee');
    ok(M.etatBon({ ...ENV, SHOPIFY_VOUCHER_CONTRACT: '0x12' }).pret === false, 'contrat invalide : refuse');
    ok(M.etatBon(ENV).signataire === SIGNATAIRE, 'pret : le signataire = adresse de la cle');
    ok(M.corpsBon({ env: { ...ENV, SHOPIFY_VOUCHER_SIGNER_KEY: '' }, magasin: M.creerMagasin(), commande: GID, adresse: W1, block: BLOC, recipe: '1' }).corps.pret === false, 'sans cle : pret false, rien signe');
  });

  /* 3. LE BON, DE BOUT EN BOUT */
  await essai('bon', () => {
    const mag = M.creerMagasin();
    const b = brut(paye(GID));
    ok(M.traiterWebhook({ env: ENV, entetes: entetes(b, 'orders/paid', 'w1'), corpsBrut: b, magasin: mag, maintenant: () => iso(T0) }).corps.etat === 'NOTE', 'commande payee notee');
    const r = M.corpsBon({ env: ENV, magasin: mag, commande: GID, adresse: W1, block: BLOC, recipe: RECETTE.toString(), unite: 1, maintenantS: T0 });
    ok(r.statut === 200 && r.corps.ok === true, 'bon rendu');
    const bon = r.corps.bon || {};
    const m = bon.message || {};
    ok(m.recipient === W1 && m.blockToken === BLOC && m.recipe === RECETTE.toString(), 'bon : au wallet de la commande, block et recette demandes');
    ok(m.orderId === M.orderIdDe(GID, 1) && m.orderId === keccak256Hex(new TextEncoder().encode(GID + '#1')), 'orderId = keccak(GID#1) : aucune donnee personnelle');
    ok(m.deadline === String(T0 + 1800), 'echeance = maintenant + 30 min');
    ok(bon.domain && bon.domain.chainId === 8453 && bon.domain.verifyingContract === CONTRAT, 'domaine : Base 8453, le contrat configure');
    ok(recupererAdresse(M.digestBon(bon), bon.signature) === SIGNATAIRE, 'la signature se relit a l adresse de la cle');
    ok(r.corps.appel && r.corps.appel.to === CONTRAT && r.corps.appel.value === '0x0' && r.corps.appel.data === M.encoderClaim(m, bon.signature), 'appel NON signe pour le wallet de l acheteur, sans valeur');
    ok(!JSON.stringify(r).includes(CLE.slice(2)), 'la cle n est dans aucune reponse');
    const r2 = M.corpsBon({ env: ENV, magasin: mag, commande: GID, adresse: W1, block: BLOC, recipe: '0', unite: 2, maintenantS: T0 });
    ok(r2.statut === 200 && r2.corps.bon.message.orderId === M.orderIdDe(GID, 2), 'unite 2 : un autre orderId');
    ok(M.corpsBon({ env: ENV, magasin: mag, commande: GID, adresse: W1, block: BLOC, recipe: '0', unite: 3, maintenantS: T0 }).statut === 400, 'unite 3 sur 2 : refuse');
    ok(M.corpsBon({ env: ENV, magasin: mag, commande: GID, adresse: W2, block: BLOC, recipe: '0', maintenantS: T0 }).statut === 403, 'un autre wallet que celui de la commande : 403');
    ok(M.corpsBon({ env: ENV, magasin: mag, commande: GID, adresse: W1, block: BLOC, recipe: String(360n), maintenantS: T0 }).statut === 400, 'teinte 360 : recette refusee');
    ok(M.corpsBon({ env: ENV, magasin: mag, commande: GID, adresse: W1, block: BLOC, recipe: String(1n << 63n), maintenantS: T0 }).statut === 400, 'bit 63 : recette refusee');
    ok(M.corpsBon({ env: ENV, magasin: mag, commande: GID, adresse: W1, block: '0x12', recipe: '0', maintenantS: T0 }).statut === 400, 'block invalide : refuse');
    ok(M.corpsBon({ env: ENV, magasin: mag, commande: 'gid://shopify/Order/9', adresse: W1, block: BLOC, recipe: '0', maintenantS: T0 }).statut === 404, 'commande inconnue : 404');
    ok(M.corpsBon({ env: ENV, magasin: mag, commande: 'Order/9', adresse: W1, block: BLOC, recipe: '0', maintenantS: T0 }).statut === 400, 'GID invalide : 400');
    const bt = brut(paye('gid://shopify/Order/77', { test: true }));
    M.traiterWebhook({ env: ENV, entetes: entetes(bt, 'orders/paid', 'w2'), corpsBrut: bt, magasin: mag });
    ok(M.corpsBon({ env: ENV, magasin: mag, commande: 'gid://shopify/Order/77', adresse: W1, block: BLOC, recipe: '0', maintenantS: T0 }).statut === 409, 'commande de TEST : aucun bon (skin gratuit sinon)');
  });

  /* 4. LE REMBOURSEMENT */
  await essai('rembourse', () => {
    const mag = M.creerMagasin();
    const b = brut(paye(GID));
    M.traiterWebhook({ env: ENV, entetes: entetes(b, 'orders/paid', 'w1'), corpsBrut: b, magasin: mag });
    M.corpsBon({ env: ENV, magasin: mag, commande: GID, adresse: W1, block: BLOC, recipe: '0', unite: 1, maintenantS: T0 });
    ok(M.gidRemboursement(brut(rembourse('820982911946154508'))) === GID, 'order_id relu dans le TEXTE : pas d arrondi au-dela de 2^53');
    ok(JSON.parse(rembourse('820982911946154508')).order_id !== 820982911946154508 || String(JSON.parse(rembourse('820982911946154508')).order_id) !== '820982911946154508', 'temoin : JSON.parse arrondit ce nombre');
    ok(M.gidRemboursement(brut(rembourse('820982911946154508', '1'))) === null, 'deux order_id differents : rien n est lu');
    ok(M.gidRemboursement(brut('{"id":1}')) === null && M.gidRemboursement(brut('{pas json')) === null, 'sans order_id ou illisible : null');
    const rb = brut(rembourse('820982911946154508'));
    const r = M.traiterWebhook({ env: ENV, entetes: entetes(rb, 'refunds/create', 'w9'), corpsBrut: rb, magasin: mag, maintenant: () => iso(T0 + 60) });
    ok(r.statut === 200 && r.corps.etat === 'REVOQUE', 'refunds/create : REVOQUE');
    ok(JSON.stringify(r.corps.aAnnulerSurChaine) === JSON.stringify([M.orderIdDe(GID, 1)]), 'le bon deja emis et encore valable est NOMME pour cancelOrder (le owner)');
    ok(M.corpsBon({ env: ENV, magasin: mag, commande: GID, adresse: W1, block: BLOC, recipe: '0', unite: 2, maintenantS: T0 + 61 }).statut === 409, 'apres remboursement : plus aucun bon');
    ok(mag.droitsDe(W1)[0].revoque === true, 'le droit est marque revoque');
    const tard = M.traiterWebhook({ env: ENV, entetes: entetes(rb, 'refunds/create', 'w10'), corpsBrut: rb, magasin: mag, maintenant: () => iso(T0 + 3600) });
    ok(tard.corps.aAnnulerSurChaine.length === 0, 'un bon echu n est plus a annuler');
    /* remboursement AVANT le paiement (ordre de livraison non garanti) */
    const mag2 = M.creerMagasin();
    const rb2 = brut(rembourse('555'));
    M.traiterWebhook({ env: ENV, entetes: entetes(rb2, 'refunds/create', 'x1'), corpsBrut: rb2, magasin: mag2, maintenant: () => iso(T0) });
    const p2 = brut(paye('gid://shopify/Order/555'));
    M.traiterWebhook({ env: ENV, entetes: entetes(p2, 'orders/paid', 'x2'), corpsBrut: p2, magasin: mag2, maintenant: () => iso(T0 + 1) });
    ok(mag2.droitsDe(W1).length === 0, 'paiement arrive APRES son remboursement : rien n est ouvert');
    ok(M.corpsBon({ env: ENV, magasin: mag2, commande: 'gid://shopify/Order/555', adresse: W1, block: BLOC, recipe: '0', maintenantS: T0 }).statut !== 200, 'et aucun bon');
    const amb = brut(rembourse('1', '2'));
    ok(M.traiterWebhook({ env: ENV, entetes: entetes(amb, 'refunds/create', 'x3'), corpsBrut: amb, magasin: mag2 }).statut === 400, 'order_id ambigu : 400 (Shopify relivre, rien de tranche)');
  });
  return ko;
}

const M = await import('./shopify-usdc.js');
const ko = await suite(M);
if (ko.length) { for (const k of ko) console.log('KO ' + k); process.exit(1); }
console.log('  ok  suite verte (parite contrat, bon, remboursement)');

assert.ok(SERVEUR.includes("chemin === '/api/shopify/bon'") && /corpsBon\(\{ env: process\.env/.test(SERVEUR), 'serveur : route /api/shopify/bon cablee');
assert.ok(!/eth_sendRawTransaction|eth_sendTransaction|signTransaction/.test(SRC), 'module : aucune transaction signee ni envoyee');
assert.ok(!/payable|transferFrom\(msg\.sender|USDC/.test(SOL.split('contract BlockSkinsVoucher')[1].replace(/\/\/\/.*$/gm, '').replace(/\/\/.*$/gm, '')), 'contrat : rien de payable, aucun jeton tire');
console.log('  ok  cablage serveur, ni transaction ni paiement');

const MUTANTS = [
  ['commande de test acceptee', "if (c.test) return refus(409", "if (false) return refus(409"],
  ['wallet non verifie', "x.wallet === bas(adresse)", 'true'],
  ['remboursement ignore', "if (c.revoque) return refus(409", "if (false) return refus(409"],
  ['order_id ambigu accepte', 'if (vus.size !== 1) return null;', 'if (vus.size === 0) return null;'],
  ['unite non bornee', 'u > total', 'u > 1e9'],
  ['echeance en ms', 'maintenantS + DUREE_BON_S', 'maintenantS + DUREE_BON_S * 1000'],
  ['pas de pierre tombale', 'if (!Object.prototype.hasOwnProperty.call(d.commandes, id)) d.commandes[id] =', 'if (false) d.commandes[id] ='],
  ['signature non completee', "sig.padEnd(192, '0')", "sig.padEnd(128, '0')"],
  ['recette non verifiee', "if (!recetteValide(recipe)) return refus(400", "if (false) return refus(400"],
];
const tmp = mkdtempSync(path.join(tmpdir(), 'mut-shopify-bon-'));
try {
  for (const dep of ['keccak.js', 'signeur-secp256k1.js']) writeFileSync(path.join(tmp, dep), readFileSync(new URL('./' + dep, ICI), 'utf8'));
  let k = 0;
  for (const [nom, de, vers] of MUTANTS) {
    assert.ok(SRC.includes(de), 'mutant « ' + nom + ' » : motif introuvable dans shopify-usdc.js');
    const f = path.join(tmp, 'shopify-usdc-' + (k++) + '.mjs');
    writeFileSync(f, SRC.replace(de, vers));
    const r = await suite(await import(pathToFileURL(f).href));
    assert.ok(r.length > 0, 'le mutant « ' + nom + ' » a SURVECU');
    console.log('  ok  mutant « ' + nom + ' » tue (' + r.length + ' rouge(s), ex. ' + r[0] + ')');
  }
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log('test-shopify-bon-20261104 : VERT');
