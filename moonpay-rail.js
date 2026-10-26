/* moonpay-rail.js -- LE SECOND RAIL FIAT -> BASE (MoonPay), ECRIT EN ECHEC FERME, COTE SERVEUR SEULEMENT.
 *
 * POURQUOI (Phil, 2026-10-26, recherche `recherche-fiat-monde-20261026.md`) : le rail Coinbase ne sert pas NG, MX, KR, ZA,
 * TR (options CDP mesurees vides). L API publique de MoonPay (`/v3/countries`, `/v3/currencies`, lues sans cle le
 * 2026-10-26) y declare l achat permis, et `usdc_base` / `eth_base` vivants sur Base (chainId 8453).
 *
 * CE QUE LA DOC DIT, LU A LA SOURCE LE 2026-10-26 :
 *   - dev.moonpay.com/widget/on-ramp/customization/url-signing.md : « Sign only the query string, including the leading
 *     `?` » ; HMAC-SHA256 avec la cle SECRETE, base64, URL-encode, `signature` ajoutee EN DERNIER. Vecteur publie :
 *     sk_test_DocsVector00 + `?apiKey=pk_test_DocsVector00&currencyCode=eth&walletAddress=0xde0B...7BAe`
 *     -> `oIJxSghyzll/BLhUFdQZhkxf7DAS8REFaWr/ibO+K8Q=` (rejoue par test-moonpay-rail-20261026.mjs).
 *     « Passing the `signature` parameter is mandatory if you're using the `walletAddress` ... parameter. »
 *   - .../parameters.md : apiKey (publishable), currencyCode (fige l actif), walletAddress, redirectURL (https ; MoonPay y
 *     ajoute transactionId et transactionStatus).
 *   - widget/sandbox-testing.md : le bac a sable n a PAS Base (Sepolia seulement) ; `/v3/currencies` le confirme :
 *     `supportsTestMode:false` sur usdc_base et eth_base. => avec des cles sk_test_, ce rail reste CACHE (lu, pas suppose).
 *
 * REGLES (miroir du rail Coinbase, onramp-session.js) :
 *   - le SECRET n est jamais rendu, jamais journalise, jamais dans une erreur : il ne sert qu a `signerRequete` ;
 *   - sans les DEUX cles, rien n est servi : aucune lecture reseau, `pret:false` avec le NOM de la variable a poser ;
 *   - l URL est batie et signee ICI ; le client n en fournit jamais une, ni un hote de retour ;
 *   - chaque entree est validee (adresse, actif en liste blanche, block de retour, pays) ;
 *   - la couverture pays vient du catalogue PUBLIC de MoonPay, lu a l execution, jamais d une liste ecrite ici.
 * NON PROUVE : aucune cle n existe ici. La signature est prouvee contre le vecteur de la doc ; l ouverture reelle du widget
 * avec une cle live ne l est pas.
 */
import { createHmac } from 'node:crypto';
import { validerDemande } from './onramp-session.js';

export const NOM_CLE_PUBLIQUE = 'MOONPAY_PUBLISHABLE_KEY';
export const NOM_CLE_SECRETE = 'MOONPAY_SECRET_KEY';
export const WIDGET = Object.freeze({ live: 'https://buy.moonpay.com/', test: 'https://buy-sandbox.moonpay.com/' });
export const API_PUBLIQUE = 'https://api.moonpay.com';
/* liste blanche : nos chemins ne savent depenser que l ETH et l USDC de Base. Le code MoonPay ET le contrat attendu :
 * un code qui changerait de chaine ou de contrat dans le catalogue ne doit plus etre servi. */
export const CODES_MOONPAY = Object.freeze({ USDC: 'usdc_base', ETH: 'eth_base' });
const CONTRAT_ATTENDU = Object.freeze({
  usdc_base: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  eth_base: '0x0000000000000000000000000000000000000000',
});
/* Frais PUBLIES par MoonPay (support.moonpay.com/customers/docs/moonpay-fees, relu via recherche le 2026-10-26) : ce sont
 * des plafonds « up to », dits comme tels. MoonPay affiche le montant exact sur son propre ecran avant paiement. */
export const FRAIS_MOONPAY = Object.freeze({
  carte: 'up to 4.5% by card, Apple Pay or Google Pay (minimum $3.99 or the local equivalent)',
  banque: 'up to 1% by bank transfer',
  source: 'https://support.moonpay.com/customers/docs/moonpay-fees',
});
/* l origine de retour est decidee ici, jamais par l appelant (meme regle que /api/onramp/session) */
export const ORIGINE_RETOUR = 'https://tokenizedblock.space/';

const ADR = /^0x[0-9a-fA-F]{40}$/;
const plein = (v) => typeof v === 'string' && v.trim().length > 0;

/** L etat du rail, SANS jamais rendre une cle. Quatre refus nommes, un seul « pret ». */
export function etatMoonpay(env = {}) {
  const pk = plein(env[NOM_CLE_PUBLIQUE]) ? env[NOM_CLE_PUBLIQUE].trim() : null;
  const sk = plein(env[NOM_CLE_SECRETE]) ? env[NOM_CLE_SECRETE].trim() : null;
  if (!pk && !sk) return { pret: false, mode: null, pourquoi: 'no MoonPay keys: set ' + NOM_CLE_PUBLIQUE + ' and ' + NOM_CLE_SECRETE };
  if (!pk) return { pret: false, mode: null, pourquoi: 'MoonPay publishable key missing (' + NOM_CLE_PUBLIQUE + ')' };
  if (!sk) return { pret: false, mode: null, pourquoi: 'MoonPay secret key missing (' + NOM_CLE_SECRETE + ')' };
  const mp = /^pk_(test|live)_\S+$/.exec(pk), ms = /^sk_(test|live)_\S+$/.exec(sk);
  if (!mp) return { pret: false, mode: null, pourquoi: NOM_CLE_PUBLIQUE + ' is not a pk_test_ or pk_live_ key' };
  if (!ms) return { pret: false, mode: null, pourquoi: NOM_CLE_SECRETE + ' is not a sk_test_ or sk_live_ key' };
  if (mp[1] !== ms[1]) return { pret: false, mode: null, pourquoi: 'MoonPay keys are from different modes (test and live)' };
  return { pret: true, mode: mp[1], pourquoi: null };
}

/** HMAC-SHA256 base64 de la query AVEC son `?` initial (doc MoonPay). Le secret n est ni rendu ni copie ailleurs. */
export function signerRequete(requete, secret) {
  if (typeof requete !== 'string' || requete[0] !== '?' || requete.length < 2) return null;
  if (!plein(secret)) return null;
  return createHmac('sha256', secret.trim()).update(requete).digest('base64');
}

/**
 * Batit l URL signee du widget. Toutes les entrees sont revalidees ici (defense en profondeur).
 * @returns {{etat:'OK', url:string}|{etat:string, pourquoi:string}}
 */
export function construireUrlWidget({ env = {}, adresse, actif, retourBlock = null } = {}) {
  const e = etatMoonpay(env);
  if (!e.pret) return { etat: 'NON_CONFIGURE', pourquoi: e.pourquoi };
  if (!ADR.test(String(adresse || ''))) return { etat: 'REFUSE', pourquoi: 'a whole wallet address is required' };
  const code = CODES_MOONPAY[String(actif || '').toUpperCase()];
  if (!code) return { etat: 'REFUSE', pourquoi: 'asset must be one of ' + Object.keys(CODES_MOONPAY).join(', ') };
  if (retourBlock !== null && retourBlock !== undefined && !ADR.test(String(retourBlock))) {
    return { etat: 'REFUSE', pourquoi: 'return block is not a whole address' };
  }
  const retour = ORIGINE_RETOUR + (retourBlock
    ? '?block=' + String(retourBlock).toLowerCase() + '&actif=' + String(actif).toUpperCase() + '&via=moonpay' : '');
  const p = new URLSearchParams();
  p.set('apiKey', env[NOM_CLE_PUBLIQUE].trim());
  p.set('currencyCode', code);
  p.set('walletAddress', String(adresse).toLowerCase());
  p.set('redirectURL', retour);
  const requete = '?' + p.toString();
  const sig = signerRequete(requete, env[NOM_CLE_SECRETE]);
  if (!sig) return { etat: 'REFUSE', pourquoi: 'the widget URL could not be signed' };
  return { etat: 'OK', url: WIDGET[e.mode] + requete + '&signature=' + encodeURIComponent(sig) };
}

/**
 * Reduit les deux reponses PUBLIQUES de MoonPay a ce dont le routage a besoin. PUR.
 * Une reponse illisible rend `null` (non lu), jamais un catalogue vide (qui dirait « aucun pays »).
 */
export function analyserCatalogue(pays, devises) {
  if (!Array.isArray(pays) || !Array.isArray(devises) || !pays.length || !devises.length) return null;
  const P = {};
  for (const c of pays) {
    const a = String((c && c.alpha2) || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(a)) continue;
    P[a] = { permis: c.isAllowed === true, achat: c.isBuyAllowed === true };
  }
  const D = {};
  for (const d of devises) {
    const code = String((d && d.code) || '');
    if (!Object.values(CODES_MOONPAY).includes(code)) continue;
    const m = (d && d.metadata) || {};
    D[code] = {
      suspendu: d.isSuspended !== false,
      live: d.supportsLiveMode === true,
      test: d.supportsTestMode === true,
      chaine: String(m.chainId || ''),
      contrat: String(m.contractAddress || '').toLowerCase(),
      exclus: Array.isArray(d.notAllowedCountries) ? d.notAllowedCountries.map((x) => String(x).toUpperCase()) : null,
      etatsUsExclus: Array.isArray(d.notAllowedUSStates) ? d.notAllowedUSStates.map((x) => String(x).toUpperCase()) : [],
    };
  }
  return { pays: P, devises: D };
}

/** MoonPay sert-il CE pays pour CET actif sur Base, dans CE mode ? Chaque « non » porte sa raison. PUR. */
export function paysServi(catalogue, pays, actif, mode = 'live') {
  const p = String(pays || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(p)) return { servi: false, pourquoi: 'country must be a 2-letter code' };
  const code = CODES_MOONPAY[String(actif || '').toUpperCase()];
  if (!code) return { servi: false, pourquoi: 'asset must be one of ' + Object.keys(CODES_MOONPAY).join(', ') };
  if (!catalogue || !catalogue.pays || !catalogue.devises) return { servi: false, pourquoi: 'MoonPay catalogue not read' };
  const c = catalogue.pays[p];
  if (!c) return { servi: false, pourquoi: 'MoonPay does not list ' + p };
  if (!c.permis || !c.achat) return { servi: false, pourquoi: 'MoonPay does not allow buying in ' + p };
  const d = catalogue.devises[code];
  if (!d) return { servi: false, pourquoi: 'MoonPay does not list ' + code };
  if (d.suspendu) return { servi: false, pourquoi: code + ' is suspended at MoonPay' };
  if (d.chaine !== '8453' || d.contrat !== CONTRAT_ATTENDU[code]) return { servi: false, pourquoi: code + ' is not the Base asset we expect' };
  if (mode === 'test' ? !d.test : !d.live) return { servi: false, pourquoi: code + ' is not available in MoonPay ' + mode + ' mode' };
  if (!Array.isArray(d.exclus)) return { servi: false, pourquoi: 'MoonPay country exclusions for ' + code + ' not read' };
  if (d.exclus.includes(p)) return { servi: false, pourquoi: 'MoonPay excludes ' + p + ' for ' + code };
  return { servi: true, pourquoi: null, etatsUsExclus: p === 'US' ? d.etatsUsExclus : [] };
}

/** Lit le catalogue PUBLIC (sans cle). Ecrit pour le serveur ; `fetchImpl` injectable pour les bancs. */
export async function lireCatalogueMoonpay({ fetchImpl = null, base = API_PUBLIQUE } = {}) {
  const f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!f) return null;
  const lire = async (chemin) => {
    const stop = new AbortController();
    const m = setTimeout(() => stop.abort(), 8000);
    try {
      const r = await f(base + chemin, { signal: stop.signal, headers: { accept: 'application/json' } });
      if (!r.ok) return null;
      return await r.json().catch(() => null);
    } catch (_) { return null; } finally { clearTimeout(m); }
  };
  const [pays, devises] = await Promise.all([lire('/v3/countries'), lire('/v3/currencies')]);
  return analyserCatalogue(pays, devises);
}

/* ══ LES CORPS DES DEUX ROUTES, EXECUTABLES PAR UN BANC (le serveur ne fait que les cabler) ══ */

/**
 * `/api/moonpay/pays?pays=XX&actif=USDC` -- MoonPay sert-il ce pays ? Sans cles : `pret:false`, et le catalogue n est
 * meme pas demande (`lireCatalogue` n est pas appele).
 */
export async function corpsPaysMoonpay({ env = {}, pays, actif, lireCatalogue }) {
  const e = etatMoonpay(env);
  if (!e.pret) return { ok: false, pret: false, pourquoi: e.pourquoi };
  const cat = await lireCatalogue();
  const s = paysServi(cat, pays, actif, e.mode);
  return { ok: true, pret: true, servi: s.servi, pourquoi: s.pourquoi,
    pays: String(pays || '').toUpperCase().slice(0, 2), actif: String(actif || '').toUpperCase().slice(0, 4),
    fournisseur: 'MoonPay', frais: { carte: FRAIS_MOONPAY.carte, banque: FRAIS_MOONPAY.banque, source: FRAIS_MOONPAY.source },
    ...(s.etatsUsExclus && s.etatsUsExclus.length ? { etatsUsExclus: s.etatsUsExclus } : {}) };
}

/**
 * `/api/moonpay/session?adresse=&actif=&block=&pays=` -- l URL signee, ou un refus nomme.
 * @returns {Promise<{statut:number, corps:object}>}
 */
export async function corpsSessionMoonpay({ env = {}, adresse, actif, block, pays, lireCatalogue }) {
  /* actif ABSENT = refus ici (pas de defaut ETH comme chez Coinbase) : MoonPay fige l actif, il doit etre choisi. */
  if (actif === null || actif === undefined) return { statut: 400, corps: { ok: false, pret: false, pourquoi: 'asset is required' } };
  const d = validerDemande({ adresse, actif, retourBlock: block });
  if (d.etat !== 'OK') return { statut: 400, corps: { ok: false, pret: false, pourquoi: d.pourquoi } };
  const p = String(pays || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(p)) return { statut: 400, corps: { ok: false, pret: false, pourquoi: 'country must be a 2-letter code' } };
  const e = etatMoonpay(env);
  if (!e.pret) return { statut: 200, corps: { ok: false, pret: false, pourquoi: e.pourquoi } };
  /* le serveur re-verifie la couverture : un client ne peut pas forcer MoonPay dans un pays qu il ne sert pas */
  const s = paysServi(await lireCatalogue(), p, d.actif, e.mode);
  if (!s.servi) return { statut: 200, corps: { ok: false, pret: true, servi: false, pourquoi: s.pourquoi } };
  const u = construireUrlWidget({ env, adresse: d.adresse, actif: d.actif, retourBlock: d.retourBlock });
  if (u.etat !== 'OK') return { statut: 200, corps: { ok: false, pret: true, pourquoi: u.pourquoi } };
  return { statut: 200, corps: { ok: true, pret: true, fournisseur: 'MoonPay', url: u.url } };
}
