/* retour-fiat.js — LE PARCOURS « CARTE OU BANQUE -> BLOCK », EN FONCTIONS PURES.
 *
 * ⛔⛔ POURQUOI CE MODULE (Phil, 2026-10-25 : « every currency in the world can buy a block, easy
 *     pathway »). Mesure du soir sur le build 20261025-game46 :
 *       · le rail fiat est VIVANT (`/api/onramp/session` : CDP pret) et pose ETH ou USDC sur Base dans
 *         le wallet de la personne ;
 *       · mais le panneau Buy d un block (#pEchange) n avait AUCUNE entree « payer par carte » : le seul
 *         chemin passait par l onglet Bridge, qui ne sait pas de quel block on parle — donc le retour
 *         retombait sur l accueil ;
 *       · et au retour, l app posait une intention FIXE de 0,01 ETH puis cliquait « Prepare buy » toute
 *         seule — sans avoir lu un seul wei arrive, et en ETH meme quand on venait d acheter de l USDC ;
 *       · « Fund wallet » du Bridge codait l ETH en dur.
 *
 * ⛔ CE MODULE NE LIT RIEN ET N ENVOIE RIEN. Il decide, a partir de valeurs DEJA LUES (soldes, cotation,
 *   reponse de Coinbase), ce que l ecran doit dire. Aucune signature, aucun plan, aucun montant
 *   n est fabrique ici : le montant prerempli vient d un solde LU, et la personne clique elle-meme.
 */

/** Les deux seuls actifs que le rail Coinbase pose et que nos chemins savent depenser (meme liste
 *  que `ACTIFS_ONRAMP` cote serveur ; dupliquee ici parce que ce module est servi a la page, et
 *  qu `onramp-session.js` ne l est pas — il porte la logique serveur de la session). */
export const ACTIFS_CARTE = Object.freeze(['ETH', 'USDC']);
const ADR = /^0x[0-9a-fA-F]{40}$/;
const bas = (x) => String(x || '').toLowerCase();

/**
 * QUEL ACTIF LA CARTE DOIT ACHETER POUR CE BLOCK.
 * ⛔ C EST LA DEVISE QUE LE PLAN CONSOMME, pas une preference : acheter de l USDC pour un block cote
 *   en ETH laisserait la personne avec un actif que le bouton Buy ne prend pas.
 * ⛔ COTATION INCONNUE = PAS D ACTIF. Supposer l ETH a deja construit un graphe faux sur SNDKc (cote
 *   en USDC, 13,6 M$ de volume) : on ne recommence pas ici.
 * @param {{entree?:string|null, quote?:string|null, offerts?:string[], eth:string, usdc:string}} o
 *   entree = devise d entree choisie dans « Pay with » (null = la devise de la pool),
 *   quote = devise de la pool LUE, offerts = adresses offertes par « Pay with ».
 * @returns {{actif:'ETH'|'USDC'|null, parPayWith:boolean, pourquoi:string|null}}
 */
export function actifCarte({ entree = null, quote = null, offerts = [], eth, usdc } = {}) {
  const E = bas(eth), U = bas(usdc);
  const nommer = (a) => (bas(a) === E ? 'ETH' : bas(a) === U ? 'USDC' : null);
  const parEntree = entree ? nommer(entree) : null;
  if (parEntree) return { actif: parEntree, parPayWith: false, pourquoi: null };
  if (!quote || !ADR.test(String(quote))) return { actif: null, parPayWith: false, pourquoi: 'COTATION_INCONNUE' };
  const parQuote = nommer(quote);
  /* ⛔ mesure navigateur du 2026-10-25 : « Pay with » sur OUSD, la carte achetait l ETH de la pool et la note ne disait pas
   *   qu il faudrait revenir a ETH dans « Pay with ». Une entree choisie que la carte ne pose pas = le dire. */
  if (parQuote) return { actif: parQuote, parPayWith: !!entree && bas(entree) !== bas(quote), pourquoi: null };
  /* cote dans un autre jeton (une action, OUSD…) : la carte ne le pose pas. Si « Pay with » offre une
   * route depuis l USDC ou l ETH, c est elle qu on finance — et l ecran le dira. */
  const off = new Set((Array.isArray(offerts) ? offerts : []).map(bas));
  if (off.has(U)) return { actif: 'USDC', parPayWith: true, pourquoi: null };
  if (off.has(E)) return { actif: 'ETH', parPayWith: true, pourquoi: null };
  return { actif: null, parPayWith: false, pourquoi: 'SANS_ROUTE' };
}

/**
 * LE RETOUR DE COINBASE, LU DANS L URL.
 * ⛔ CE PARAMETRE A TRAVERSE UN TIERS : il est revalide ici meme si le serveur l a valide a l aller.
 * ⛔ SANS `actif` VALIDE, CE N EST PAS UN RETOUR FIAT : `?block=` seul est aussi un lien partage, et le
 *   traiter comme un paiement ferait dire « votre achat arrive » a quelqu un qui n a rien paye.
 * @returns {{block:string, actif:'ETH'|'USDC'}|null}
 */
export function lireRetourFiat(search) {
  let p;
  try { p = new URLSearchParams(String(search || '')); } catch (_) { return null; }
  const block = String(p.get('block') || '');
  const actif = String(p.get('actif') || '').toUpperCase();
  if (!ADR.test(block) || !ACTIFS_CARTE.includes(actif)) return null;
  return { block: block.toLowerCase(), actif };
}

/**
 * LE SOLDE NOTE AVANT DE PARTIR PAYER, S IL VAUT ENCORE QUELQUE CHOSE.
 * ⛔ MEME WALLET, MEME ACTIF, ET PAS TROP VIEUX : un repere d un autre compte ou d il y a deux jours
 *   ferait lire comme « arrive » un solde qui a bouge pour une autre raison.
 * @returns {bigint|null}
 */
export function repereValide(s, { adr, actif, maintenantMs, ageMaxMs = 6 * 3600 * 1000 } = {}) {
  if (!s || typeof s !== 'object') return null;
  if (bas(s.adr) !== bas(adr) || !ADR.test(String(adr || ''))) return null;
  if (String(s.actif) !== String(actif)) return null;
  const t = Number(s.t);
  if (!Number.isFinite(t) || !Number.isFinite(maintenantMs) || maintenantMs - t > ageMaxMs || t > maintenantMs + 60000) return null;
  if (!/^[0-9]{1,78}$/.test(String(s.solde))) return null;
  return BigInt(String(s.solde));
}

/**
 * CE QUI EST ARRIVE — UNIQUEMENT A PARTIR DE SOLDES LUS.
 * ⛔⛔ ON N ASSUME JAMAIS QUE L ACHAT A ABOUTI : Coinbase ne nous dit rien, seul le solde parle.
 *   · solde illisible               -> NON_LU (on le dit, on ne preremplit rien) ;
 *   · solde > repere                -> ARRIVE, montant = ce qui est arrive (borne au depensable) ;
 *   · solde <= repere               -> EN_ROUTE (« your purchase is still arriving », on relit) ;
 *   · pas de repere, solde nul      -> EN_ROUTE ;
 *   · pas de repere, solde non nul  -> SANS_REPERE : on montre le solde LU et on dit qu on ne peut pas
 *     savoir si l achat est deja la.
 * ⛔ EN ETH ON GARDE LE GAS : preremplir tout le solde rendrait la transaction impossible a envoyer.
 * @returns {{etat:string, montant:bigint, arrive:bigint|null}}
 */
export function verdictArrivee({ avant = null, maintenant = null, actif, reserveGasWei = 0n } = {}) {
  if (typeof maintenant !== 'bigint' || maintenant < 0n) return { etat: 'NON_LU', montant: 0n, arrive: null };
  const reserve = actif === 'ETH' && typeof reserveGasWei === 'bigint' ? reserveGasWei : 0n;
  const depensable = maintenant > reserve ? maintenant - reserve : 0n;
  if (typeof avant === 'bigint') {
    if (maintenant <= avant) return { etat: 'EN_ROUTE', montant: 0n, arrive: 0n };
    const arrive = maintenant - avant;
    const montant = arrive < depensable ? arrive : depensable;
    return { etat: montant > 0n ? 'ARRIVE' : 'ARRIVE_SOUS_GAS', montant, arrive };
  }
  if (maintenant === 0n) return { etat: 'EN_ROUTE', montant: 0n, arrive: null };
  return { etat: depensable > 0n ? 'SANS_REPERE' : 'ARRIVE_SOUS_GAS', montant: depensable, arrive: null };
}

/** Les noms que Coinbase donne a ses moyens de paiement (enum `payment_currencies[].limits[].id`,
 *  docs.cdp.coinbase.com « Get buy options », lu le 2026-10-25). Un id inconnu est montre tel quel,
 *  adouci — on ne le cache pas et on ne l invente pas. */
export const NOMS_MOYENS = Object.freeze({
  CARD: 'card',
  ACH_BANK_ACCOUNT: 'bank account (ACH)',
  APPLE_PAY: 'Apple Pay',
  FIAT_WALLET: 'Coinbase cash balance',
  CRYPTO_ACCOUNT: 'Coinbase crypto balance',
  GUEST_CHECKOUT_CARD: 'card without a Coinbase account',
  PAYPAL: 'PayPal',
  RTP: 'instant bank transfer (RTP)',
  GUEST_CHECKOUT_APPLE_PAY: 'Apple Pay without a Coinbase account',
});

export const PHRASE_COMPTE_HORS_US = 'Outside the U.S., paying by card needs a Coinbase account.';

/** Le pays du navigateur, s il en declare un (« fr-FR » -> FR). Une langue sans region ne dit rien. */
export function paysDuNavigateur(langues) {
  for (const l of Array.isArray(langues) ? langues : [langues]) {
    const m = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(String(l || ''));
    if (m) return m[1].toUpperCase();
  }
  return null;
}

/**
 * LA PHRASE DES MOYENS DE PAIEMENT D UN PAYS — CE QUE COINBASE A RENDU, RIEN DE PLUS.
 * ⛔⛔ LISTE VIDE OU ABSENTE = « on n a pas pu le lire », JAMAIS « aucun ». Mesure du 2026-10-25 : le
 *     Japon rend 0 devise de paiement — dire « no payment method » publierait notre ignorance comme un
 *     fait sur Coinbase.
 * ⛔ « needs a Coinbase account » reste dit HORS US, sauf si Coinbase liste lui-meme une carte sans
 *   compte pour ce pays : la phrase doit rester vraie, pas devenir un slogan.
 */
export function phraseMoyens({ pays, nomPays = null, moyens = null } = {}) {
  const p = /^[A-Z]{2}$/.test(String(pays || '')) ? String(pays) : null;
  if (!p) return 'Pick your country to see how you can pay there.';
  const nom = nomPays ? nomPays + ' (' + p + ')' : p;
  const ids = Array.isArray(moyens) ? moyens.filter((x) => typeof x === 'string' && x && x !== 'UNSPECIFIED') : [];
  const horsUs = p !== 'US' && !ids.includes('GUEST_CHECKOUT_CARD');
  if (!ids.length) {
    return 'Could not read which payment methods Coinbase offers in ' + nom + ' right now — Coinbase shows them on its own page.'
      + (horsUs ? ' ' + PHRASE_COMPTE_HORS_US : '');
  }
  const noms = [...new Set(ids.map((id) => NOMS_MOYENS[id] || id.toLowerCase().replace(/_/g, ' ')))];
  return 'Coinbase lists for ' + nom + ': ' + noms.join(', ') + '.' + (horsUs ? ' ' + PHRASE_COMPTE_HORS_US : '');
}
