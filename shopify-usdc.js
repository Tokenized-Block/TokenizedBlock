/* shopify-usdc.js -- PAYER EN USDC SUR UNE BOUTIQUE SHOPIFY : LE WEBHOOK `orders/paid`, VERIFIE, ET DES DROITS HORS CHAINE.
 *
 * POURQUOI (Phil, 2026-11-04) : pas d acces MoonPay business ; vendre des biens de l app (skins, naissance d un block) via une
 * boutique Shopify payee en USDC (Shopify Payments, reseau Base parmi d autres), et « creer un block avec cette path ».
 *
 * CE QUE LA DOC DIT, LU A LA SOURCE LE 2026-11-04 :
 *   - shopify.dev/docs/apps/build/webhooks/subscribe/https : en-tete `X-Shopify-Hmac-SHA256` = HMAC-SHA256 du CORPS BRUT avec
 *     le client secret de l app, en base64 ; comparer en temps constant ; lire le corps AVANT tout parseur JSON. Delai : 1 s de
 *     connexion, 5 s en tout ; hors 2xx = echec, 8 reprises en 4 h, puis l abonnement cree par l Admin API est SUPPRIME.
 *     Doublons possibles : dedupliquer sur `X-Shopify-Webhook-Id` (et `X-Shopify-Event-Id` relie les livraisons d un meme geste).
 *   - shopify.dev/docs/api/webhooks/latest.md (« Headers ») : X-Shopify-Topic, X-Shopify-Hmac-Sha256, X-Shopify-Shop-Domain,
 *     X-Shopify-API-Version, X-Shopify-Webhook-Id, X-Shopify-Triggered-At, X-Shopify-Event-Id.
 *   - meme page, « orders/paid: Sample Payload » : champs `admin_graphql_api_id`, `financial_status`, `test`, `note_attributes`,
 *     `line_items[].sku`, `line_items[].quantity`, `line_items[].properties`. Forme `{ name, value }` des `note_attributes` et des
 *     `properties` : shopify.dev/docs/api/admin-rest/latest/resources/order (exemples de la page).
 *   - shopify.dev/docs/api/admin-graphql/latest/enums/WebhookSubscriptionTopic : ORDERS_PAID « Requires at least one of the
 *     following scopes: read_orders, read_marketplace_orders. »
 *   - NON DOCUMENTE (cherche, pas trouve) : ni le hash de la tx USDC ni le wallet du payeur dans le payload `orders/paid` ni
 *     sur l objet OrderTransaction (son `receiptJson` est dit propre a la passerelle et instable). Donc ICI : le wallet qui
 *     recoit le droit est celui que l ACHETEUR ecrit dans la commande (propriete `wallet`), pas celui qui a paye.
 *
 * ⛔ DOCTRINE : ce module ne signe AUCUNE transaction, ne tient aucun fonds, n envoie rien sur la chaine. Une commande payee ouvre
 *   un DROIT hors chaine (qui, quoi, combien). Pour un skin, la livraison est un BON (decision de Phil, 2026-11-04) : un message
 *   EIP-712 signe par une cle DEDIEE (SHOPIFY_VOUCHER_SIGNER_KEY, lue par son NOM) que BlockSkinsVoucher.sol accepte une fois par
 *   unite de commande ; le wallet de l ACHETEUR envoie lui-meme claim(). ⚠ Point de confiance, dit : cette cle a un pouvoir de
 *   MINT (pas de fonds) ; volee, elle frappe des skins gratuits — le owner du contrat la remplace (setSigner).
 *   BlockSkins.mint et BlockRolls.buyPass, eux, tirent l USDC de msg.sender et ne lisent aucun bon : ils ne sont pas touches.
 * ⛔ LE PASS N EST PAS VENDU ICI : il donne une entree au tirage du jour (BlockRolls : « les acheteurs du jour forment le tirage
 *   du jour ») — la page d eligibilite Shopify Payments range « lotteries, ... sweepstakes » dans les produits interdits — et il
 *   est lie a msg.sender (non transferable). Son SKU est REFUSE, nomme.
 * ⛔ AUCUNE DONNEE PERSONNELLE GARDEE : ni email, ni nom, ni adresse postale ; seulement l id de commande, le SKU, la quantite,
 *   le wallet ecrit par l acheteur, le drapeau `test`.
 * NON PROUVE : aucune boutique, aucun secret ici. Le HMAC est prouve contre le calcul de la doc (corps brut, base64) sur des
 *   valeurs de banc ; la livraison reelle d un webhook Shopify ne l est pas.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { keccak256Hex, selecteur } from './keccak.js';
import { adresseDe, signerDigest, recupererAdresse } from './signeur-secp256k1.js';

/* les NOMS des variables, jamais leurs valeurs */
export const NOM_SECRET = 'SHOPIFY_API_SECRET';
export const NOM_DOMAINE = 'SHOPIFY_SHOP_DOMAIN';
export const NOM_URL_BOUTIQUE = 'SHOPIFY_STORE_URL';
export const SUJET_PAYE = 'orders/paid';
/* refunds/create (WebhookSubscriptionTopic REFUNDS_CREATE : « Occurs whenever a new refund is created without errors on an order,
 * independent from the movement of money » ; scopes read_orders, read_marketplace_orders ou read_buyer_membership_orders). Son
 * exemple (shopify.dev/docs/api/webhooks/latest.md) porte `order_id` en NOMBRE (820982911946154508 > 2^53 : JSON.parse l arrondit),
 * pas un GID : il est relu ici dans le TEXTE brut. */
export const SUJET_REMBOURSE = 'refunds/create';
export const CORPS_MAX = 256 * 1024;
/* le bon de skin (BlockSkinsVoucher.sol) : la CLE du signataire et l adresse du contrat, par NOM ; Base mainnet */
export const NOM_CLE_BON = 'SHOPIFY_VOUCHER_SIGNER_KEY';
export const NOM_CONTRAT_BON = 'SHOPIFY_VOUCHER_CONTRACT';
export const CHAINE_BASE = 8453;
export const DUREE_BON_S = 30 * 60;
export const NOM_DOMAINE_BON = 'BlockSkinsVoucher';
export const VERSION_DOMAINE_BON = '1';
export const TYPE_BON = 'SkinVoucher(address recipient,bytes32 orderId,address blockToken,uint64 recipe,uint64 deadline)';
export const SIG_CLAIM = 'claim(address,bytes32,address,uint64,uint64,bytes)';

/* le catalogue, par SKU : ce que la commande OUVRE. Un SKU absent d ici n ouvre rien (la commande est gardee comme INCONNUE,
 * pour que Phil la voie et la rembourse, jamais jetee en silence). */
export const CATALOGUE = Object.freeze({
  'TB-SKIN': Object.freeze({ droit: 'skin', note: 'one block skin (BlockSkins); delivery decided by the owner, see the design note' }),
  'TB-BIRTH': Object.freeze({ droit: 'naissance', note: 'one block birth credit; the creator still signs the birth calls' }),
});
export const SKUS_REFUSES = Object.freeze({
  'TB-PASS': 'the skin pass enters the daily draw (a lottery) and is bound to the buyer wallet on chain: not sold through Shopify',
});

const ADR = /^0x[0-9a-fA-F]{40}$/;
const DOMAINE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const plein = (v) => typeof v === 'string' && v.trim().length > 0;
const bas = (s) => String(s || '').trim().toLowerCase();

/** L etat du rail, SANS jamais rendre le secret. */
export function etatShopify(env = {}) {
  const manque = [NOM_SECRET, NOM_DOMAINE, NOM_URL_BOUTIQUE].filter((n) => !plein(env[n]));
  if (manque.length) return { pret: false, url: null, pourquoi: 'Shopify not configured: set ' + manque.join(', ') };
  const domaine = bas(env[NOM_DOMAINE]);
  if (!DOMAINE.test(domaine)) return { pret: false, url: null, pourquoi: NOM_DOMAINE + ' must be the shop domain <name>.myshopify.com' };
  let u;
  try { u = new URL(env[NOM_URL_BOUTIQUE].trim()); } catch (_) { u = null; }
  if (!u || u.protocol !== 'https:' || u.username || u.password) return { pret: false, url: null, pourquoi: NOM_URL_BOUTIQUE + ' must be an https URL' };
  return { pret: true, url: u.href, domaine, pourquoi: null };
}

/** HMAC du corps BRUT (Buffer), base64, compare en temps constant sur les OCTETS decodes. */
export function verifierHmac(corpsBrut, entete, secret) {
  if (!Buffer.isBuffer(corpsBrut) || !plein(entete) || !plein(secret)) return false;
  const attendu = createHmac('sha256', secret.trim()).update(corpsBrut).digest();
  const recu = Buffer.from(entete.trim(), 'base64');
  if (recu.length !== attendu.length) return false;
  return timingSafeEqual(attendu, recu);
}

const valeurNommee = (liste, nom) => {
  if (!Array.isArray(liste)) return null;
  const t = liste.find((x) => x && bas(x.name) === nom);
  return t && typeof t.value === 'string' ? t.value.trim() : null;
};

/** Lit une commande `orders/paid` : quels droits, pour quel wallet. Ne garde AUCUNE donnee personnelle. */
export function lireCommande(c) {
  if (!c || typeof c !== 'object') return { etat: 'REFUS', pourquoi: 'not an order' };
  const id = typeof c.admin_graphql_api_id === 'string' && c.admin_graphql_api_id.startsWith('gid://shopify/Order/') ? c.admin_graphql_api_id : null;
  if (!id) return { etat: 'REFUS', pourquoi: 'order id missing' };
  if (c.financial_status !== 'paid') return { etat: 'IGNORE', id, pourquoi: 'financial_status is ' + String(c.financial_status) + ', not paid' };
  const test = c.test === true;
  const walletCommande = valeurNommee(c.note_attributes, 'wallet');
  const lignes = Array.isArray(c.line_items) ? c.line_items : [];
  const droits = []; const inconnus = []; const refuses = [];
  for (const l of lignes) {
    const sku = String((l && l.sku) || '').trim().toUpperCase();
    const q = Number(l && l.quantity);
    if (!Number.isInteger(q) || q < 1) continue;
    if (SKUS_REFUSES[sku]) { refuses.push({ sku, quantite: q, pourquoi: SKUS_REFUSES[sku] }); continue; }
    const art = CATALOGUE[sku];
    if (!art) { inconnus.push({ sku, quantite: q }); continue; }
    const wallet = valeurNommee(l.properties, 'wallet') || walletCommande;
    droits.push({ droit: art.droit, sku, quantite: q, wallet: wallet && ADR.test(wallet) ? wallet.toLowerCase() : null });
  }
  const sansWallet = droits.filter((d) => !d.wallet).length;
  return { etat: 'OK', id, test, droits, inconnus, refuses, sansWallet };
}

/** Un magasin de droits. `fichier` (optionnel) : persistance JSON entiere, ecrite par renommage ; AUCUN plafond qui couperait. */
export function creerMagasin({ fichier = null } = {}) {
  let d = { livraisons: {}, commandes: {} };
  if (fichier && existsSync(fichier)) {
    try { const j = JSON.parse(readFileSync(fichier, 'utf8')); if (j && j.livraisons && j.commandes) d = j; } catch (_) { /* fichier illisible : on ne l ecrase pas a l aveugle */ throw new Error('entitlement file unreadable: ' + fichier); }
  }
  const sauver = () => { if (!fichier) return; const t = fichier + '.tmp'; writeFileSync(t, JSON.stringify(d)); renameSync(t, fichier); };
  return {
    livraisonVue: (wid) => Object.prototype.hasOwnProperty.call(d.livraisons, wid),
    commandeVue: (id) => Object.prototype.hasOwnProperty.call(d.commandes, id),
    noter(wid, commande, quand) {
      d.livraisons[wid] = quand;
      if (commande && !this.commandeVue(commande.id)) d.commandes[commande.id] = { ...commande, recuLe: quand, livre: false };
      sauver();
    },
    droitsDe(adresse) {
      const a = bas(adresse);
      const out = [];
      for (const [id, c] of Object.entries(d.commandes)) {
        for (const x of c.droits || []) if (x.wallet === a) out.push({ commande: id, droit: x.droit, quantite: x.quantite, test: !!c.test, livre: !!c.livre, revoque: !!c.revoque, recuLe: c.recuLe });
      }
      return out;
    },
    commande: (id) => (Object.prototype.hasOwnProperty.call(d.commandes, id) ? JSON.parse(JSON.stringify(d.commandes[id])) : null),
    /** retient l echeance du DERNIER bon emis pour (commande, unite) */
    noterBon(id, unite, echeance) {
      const c = d.commandes[id]; if (!c) throw new Error('unknown order');
      c.bons = c.bons || {}; c.bons[String(unite)] = echeance; sauver();
    },
    /** remboursement : la commande ne rend plus aucun bon. Une commande encore INCONNUE (remboursement arrive avant le paiement)
     *  devient une pierre tombale : son `orders/paid` tardif n ouvrira rien. Rend les unites dont un bon emis vaut ENCORE. */
    revoquer(id, quand, maintenantS) {
      if (!Object.prototype.hasOwnProperty.call(d.commandes, id)) d.commandes[id] = { id, test: false, droits: [], inconnus: [], refuses: [], recuLe: quand, livre: false };
      const c = d.commandes[id];
      if (!c.revoque) c.revoque = quand;
      sauver();
      return Object.entries(c.bons || {}).filter(([, e]) => Number(e) >= maintenantS).map(([u]) => Number(u));
    },
    toutes: () => JSON.parse(JSON.stringify(d.commandes)),
  };
}

const entete = (h, nom) => { const v = h ? h[nom] : undefined; return Array.isArray(v) ? v[0] : (typeof v === 'string' ? v : ''); };

/** Le corps du webhook. Rend { statut, corps } ; ne jette jamais. Les en-tetes sont en minuscules (http de Node). */
export function traiterWebhook({ env = {}, entetes = {}, corpsBrut, magasin, maintenant = () => new Date().toISOString() }) {
  const e = etatShopify(env);
  if (!e.pret) return { statut: 404, corps: { ok: false, pourquoi: 'not served' } };
  if (!verifierHmac(corpsBrut, entete(entetes, 'x-shopify-hmac-sha256'), env[NOM_SECRET])) return { statut: 401, corps: { ok: false, pourquoi: 'HMAC validation failed' } };
  if (bas(entete(entetes, 'x-shopify-shop-domain')) !== e.domaine) return { statut: 401, corps: { ok: false, pourquoi: 'unexpected shop' } };
  const wid = entete(entetes, 'x-shopify-webhook-id').trim();
  if (!wid) return { statut: 400, corps: { ok: false, pourquoi: 'webhook id missing' } };
  if (magasin.livraisonVue(wid)) return { statut: 200, corps: { ok: true, etat: 'DEJA', pourquoi: 'delivery already processed' } };
  const sujet = bas(entete(entetes, 'x-shopify-topic'));
  if (sujet === SUJET_REMBOURSE) {
    const gid = gidRemboursement(corpsBrut);
    if (!gid) return { statut: 400, corps: { ok: false, pourquoi: 'refund order_id unreadable' } };
    const quand = maintenant();
    const vivants = magasin.revoquer(gid, quand, Math.floor(Date.parse(quand) / 1000));
    magasin.noter(wid, null, quand);
    /* un bon DEJA emis et encore valable reste signe : seul cancelOrder (geste du owner, Phil) le tue sur la chaine */
    return { statut: 200, corps: { ok: true, etat: 'REVOQUE', aAnnulerSurChaine: vivants.map((u) => orderIdDe(gid, u)) } };
  }
  if (sujet !== SUJET_PAYE) { magasin.noter(wid, null, maintenant()); return { statut: 200, corps: { ok: true, etat: 'IGNORE', pourquoi: 'topic ' + sujet + ' not handled' } }; }
  let c;
  try { c = JSON.parse(corpsBrut.toString('utf8')); } catch (_) { return { statut: 400, corps: { ok: false, pourquoi: 'body is not JSON' } }; }
  const lu = lireCommande(c);
  if (lu.etat === 'REFUS') return { statut: 400, corps: { ok: false, pourquoi: lu.pourquoi } };
  if (lu.etat === 'IGNORE') { magasin.noter(wid, null, maintenant()); return { statut: 200, corps: { ok: true, etat: 'IGNORE', pourquoi: lu.pourquoi } }; }
  /* une commande deja vue sous un AUTRE id de livraison (abonnement double, rejeu) n ouvre pas ses droits deux fois */
  const deja = magasin.commandeVue(lu.id);
  magasin.noter(wid, { id: lu.id, test: lu.test, droits: lu.droits, inconnus: lu.inconnus, refuses: lu.refuses }, maintenant());
  return { statut: 200, corps: { ok: true, etat: deja ? 'DEJA' : 'NOTE', droits: lu.droits.length, sansWallet: lu.sansWallet, inconnus: lu.inconnus.length, refuses: lu.refuses.length } };
}

/** Lecture publique des droits d un wallet (aucune donnee personnelle : il n y en a pas dans le magasin). */
export function corpsDroits({ env = {}, magasin, adresse }) {
  const e = etatShopify(env);
  if (!e.pret) return { statut: 200, corps: { ok: false, pret: false } };
  if (!ADR.test(String(adresse || ''))) return { statut: 400, corps: { ok: false, pret: true, pourquoi: 'address invalid' } };
  return { statut: 200, corps: { ok: true, pret: true, droits: magasin.droitsDe(adresse) } };
}

/* ═══════════════════════════════ REMBOURSEMENT : l order_id relu dans le TEXTE brut ═══════════════════════════════
 * Toutes les occurrences de "order_id" (la racine et les transactions imbriquees de l exemple) doivent donner le MEME entier ;
 * sinon rien n est lu (une ambiguite n est jamais tranchee au hasard). */
export function gidRemboursement(corpsBrut) {
  const t = Buffer.isBuffer(corpsBrut) ? corpsBrut.toString('utf8') : '';
  try { JSON.parse(t); } catch (_) { return null; }
  const vus = new Set([...t.matchAll(/"order_id"\s*:\s*"?(\d{1,20})"?/g)].map((m) => m[1]));
  if (vus.size !== 1) return null;
  return 'gid://shopify/Order/' + [...vus][0];
}

/* ═══════════════════════════════ LE BON DE SKIN (BlockSkinsVoucher.sol) ═══════════════════════════════
 * orderId = keccak256(UTF-8 de « <GID de la commande>#<unite> ») : une commande de 2 skins a deux unites, chacune un seul mint.
 * Aucune donnee personnelle : le GID est un numero de commande. */
const mot = (h) => String(h).replace(/^0x/, '').padStart(64, '0');
const uMot = (n, bits) => { const v = BigInt(n); if (v < 0n || v >= (1n << BigInt(bits))) throw new Error('uint' + bits + ' out of range'); return v.toString(16).padStart(64, '0'); };
const aMot = (x) => { const s = bas(x); if (!/^0x[0-9a-f]{40}$/.test(s)) throw new Error('bad address'); return s.slice(2).padStart(64, '0'); };
const octetsHex = (h) => Uint8Array.from(String(h).replace(/^0x/, '').match(/../g).map((x) => parseInt(x, 16)));
const k = (s) => keccak256Hex(new TextEncoder().encode(s));
const GID = /^gid:\/\/shopify\/Order\/\d{1,20}$/;

export function orderIdDe(gid, unite) {
  if (!GID.test(String(gid)) || !Number.isInteger(unite) || unite < 1) throw new Error('orderIdDe: a Shopify order GID and a unit >= 1');
  return k(gid + '#' + unite);
}
/** les sept teintes (0..359) d une recette, comme BlockSkins.unpackRecipe ; null si la recette n est pas recevable */
export function recetteValide(r) {
  let v; try { v = BigInt(r); } catch (_) { return false; }
  if (v < 0n || v >> 63n !== 0n) return false;
  for (let i = 0n; i < 7n; i++) if (((v >> (9n * i)) & 0x1FFn) > 359n) return false;
  return true;
}
export function donneesBon({ chainId, contrat, recipient, orderId, blockToken, recipe, deadline }) {
  return {
    domain: { name: NOM_DOMAINE_BON, version: VERSION_DOMAINE_BON, chainId: Number(chainId), verifyingContract: bas(contrat) },
    primaryType: 'SkinVoucher',
    types: { SkinVoucher: [{ name: 'recipient', type: 'address' }, { name: 'orderId', type: 'bytes32' }, { name: 'blockToken', type: 'address' },
      { name: 'recipe', type: 'uint64' }, { name: 'deadline', type: 'uint64' }] },
    message: { recipient: bas(recipient), orderId: bas(orderId), blockToken: bas(blockToken), recipe: String(recipe), deadline: String(deadline) },
  };
}
/** = BlockSkinsVoucher.voucherDigest : keccak("\x19\x01" || domainSeparator || structHash) */
export function digestBon(d) {
  const dom = keccak256Hex(octetsHex(k('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)').slice(2)
    + k(d.domain.name).slice(2) + k(d.domain.version).slice(2) + uMot(d.domain.chainId, 256) + aMot(d.domain.verifyingContract)));
  const m = d.message;
  if (!/^0x[0-9a-f]{64}$/.test(m.orderId)) throw new Error('orderId is bytes32');
  const st = keccak256Hex(octetsHex(k(TYPE_BON).slice(2) + aMot(m.recipient) + mot(m.orderId) + aMot(m.blockToken) + uMot(m.recipe, 64) + uMot(m.deadline, 64)));
  return keccak256Hex(octetsHex('1901' + dom.slice(2) + st.slice(2)));
}
/** les donnees d appel NON SIGNEES de claim(...) : le wallet de l acheteur les envoie lui-meme */
export function encoderClaim(m, signature) {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error('signature is 65 bytes');
  const sig = signature.slice(2).toLowerCase();
  return selecteur(SIG_CLAIM) + aMot(m.recipient) + mot(m.orderId) + aMot(m.blockToken) + uMot(m.recipe, 64) + uMot(m.deadline, 64)
    + uMot(6 * 32, 256) + uMot(65, 256) + sig.padEnd(192, '0'); /* 65 octets, completes a 96 (multiple de 32, regle ABI) */
}

/** l etat du rail des bons, SANS jamais rendre la cle : l adresse du signataire seule */
export function etatBon(env = {}) {
  const cle = plein(env[NOM_CLE_BON]) ? env[NOM_CLE_BON].trim() : null;
  const contrat = plein(env[NOM_CONTRAT_BON]) ? bas(env[NOM_CONTRAT_BON]) : null;
  if (!cle || !contrat) return { pret: false, pourquoi: 'vouchers not configured: set ' + [!cle && NOM_CLE_BON, !contrat && NOM_CONTRAT_BON].filter(Boolean).join(', ') };
  if (!ADR.test(contrat)) return { pret: false, pourquoi: NOM_CONTRAT_BON + ' must be an address' };
  let signataire;
  try { signataire = adresseDe(cle); } catch (_) { return { pret: false, pourquoi: NOM_CLE_BON + ' is not a usable key' }; }
  return { pret: true, contrat, signataire, cle };
}

/** GET /api/shopify/bon : un bon signe pour UNE unite de skin d une commande payee, au wallet ECRIT dans la commande.
 * ⛔ LIMITE DE CONFIANCE, dite : ce wallet est celui que l acheteur a TAPE sur Shopify, pas celui qui a paye (Shopify n expose
 *   ni hash ni payeur, voir l en-tete). Le bon ne sert qu a ce wallet : le contrat exige recipient == msg.sender — le rendre a
 *   un curieux qui donne la meme adresse ne lui permet pas de minter.
 * ⛔ REFUS : config absente, commande inconnue, commande de TEST (passerelle de test = skin gratuit), remboursee, wallet different,
 *   unite hors de la quantite, block ou recette invalides. Chaque bon est RELU (recupererAdresse) avant d etre rendu. */
export function corpsBon({ env = {}, magasin, commande, adresse, block, recipe, unite = 1, maintenantS = Math.floor(Date.now() / 1000) }) {
  const e = etatShopify(env);
  const b = etatBon(env);
  if (!e.pret || !b.pret) return { statut: 200, corps: { ok: false, pret: false } };
  const refus = (statut, pourquoi) => ({ statut, corps: { ok: false, pret: true, pourquoi } });
  if (!GID.test(String(commande || ''))) return refus(400, 'order id invalid');
  if (!ADR.test(String(adresse || ''))) return refus(400, 'address invalid');
  if (!ADR.test(String(block || ''))) return refus(400, 'block address invalid');
  if (!recetteValide(recipe)) return refus(400, 'recipe invalid (seven hues 0..359)');
  const u = Number(unite);
  const c = magasin.commande(commande);
  if (!c) return refus(404, 'order not found');
  if (c.revoque) return refus(409, 'order refunded: no voucher');
  if (c.test) return refus(409, 'test order: no voucher');
  const skins = (c.droits || []).filter((x) => x.droit === 'skin' && x.wallet === bas(adresse));
  const total = skins.reduce((s, x) => s + x.quantite, 0);
  if (!total) return refus(403, 'no skin of this order for this wallet');
  if (!Number.isInteger(u) || u < 1 || u > total) return refus(400, 'unit must be 1..' + total);
  const deadline = maintenantS + DUREE_BON_S;
  const orderId = orderIdDe(commande, u);
  const d = donneesBon({ chainId: CHAINE_BASE, contrat: b.contrat, recipient: adresse, orderId, blockToken: block, recipe, deadline });
  const digest = digestBon(d);
  const signature = signerDigest(b.cle, digest);
  if (bas(recupererAdresse(digest, signature)) !== bas(b.signataire)) return refus(500, 'voucher self-check failed');
  magasin.noterBon(commande, u, deadline);
  return { statut: 200, corps: { ok: true, pret: true, bon: { ...d, signature, signer: b.signataire },
    appel: { to: b.contrat, data: encoderClaim(d.message, signature), value: '0x0', nom: 'Claim your skin (your wallet sends it; nothing is paid here)' } } };
}

/** Ce que l app lit pour montrer (ou non) « Pay with USDC on Shopify ». Ni secret ni domaine interne : l URL publique seule. */
export function corpsEtat(env = {}) {
  const e = etatShopify(env);
  return e.pret ? { ok: true, pret: true, url: e.url } : { ok: true, pret: false };
}
