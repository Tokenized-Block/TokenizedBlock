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
 * ⛔ DOCTRINE : ce module ne signe rien, ne tient aucune cle de wallet, ne bouge aucun fonds. Une commande payee ouvre un DROIT
 *   hors chaine (qui, quoi, combien), rien d autre. Aucun contrat actuel ne sait livrer ce droit sans qu un wallet signe et paie
 *   lui-meme (BlockSkins.mint et BlockRolls.buyPass tirent l USDC de msg.sender ; aucun ne lit de bon signe) : la livraison
 *   reste une DECISION de Phil, decrite a cote, pas codee ici.
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

/* les NOMS des variables, jamais leurs valeurs */
export const NOM_SECRET = 'SHOPIFY_API_SECRET';
export const NOM_DOMAINE = 'SHOPIFY_SHOP_DOMAIN';
export const NOM_URL_BOUTIQUE = 'SHOPIFY_STORE_URL';
export const SUJET_PAYE = 'orders/paid';
export const CORPS_MAX = 256 * 1024;

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
        for (const x of c.droits || []) if (x.wallet === a) out.push({ commande: id, droit: x.droit, quantite: x.quantite, test: !!c.test, livre: !!c.livre, recuLe: c.recuLe });
      }
      return out;
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

/** Ce que l app lit pour montrer (ou non) « Pay with USDC on Shopify ». Ni secret ni domaine interne : l URL publique seule. */
export function corpsEtat(env = {}) {
  const e = etatShopify(env);
  return e.pret ? { ok: true, pret: true, url: e.url } : { ok: true, pret: false };
}
