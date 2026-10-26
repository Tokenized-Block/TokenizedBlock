/* wallet-fiat.js — LA SECTION « Fiat » DE L ONGLET WALLET (Phil, 2026-10-26 : « met les idees fiat dans le Wallet »). PUR : aucune
 * lecture, aucun reseau, aucune signature. La page lui donne ce que le serveur a REPONDU ; il rend des lignes a peindre.
 *
 * ⛔⛔ RIEN N EST PROMIS. Trois blocs, chacun tire d une source nommee :
 *   1. Acheter avec une carte ou une banque — Coinbase quand /api/onramp/options rend des moyens pour le pays ; MoonPay SEULEMENT si
 *      /api/moonpay/pays dit `ok && pret && servi` (choisirRail, retour-fiat.js : la meme decision que la fiche d un block). Sinon on
 *      DIT ce que le serveur a repondu (prod du 2026-10-26 : `pret:true, servi:false`, « usdc_base is not available in MoonPay test
 *      mode ») — jamais une liste de pays recopiee d une recherche. USDC d abord (priorite de Phil), puis ETH.
 *   2. Les stablecoins en monnaie locale QUI SONT ROUTES : la table du serveur (POOLS_PIVOTS_AERODROME, plan-franchissement.js) ;
 *      une ligne n est rendue que si elle y est ET que la mesure du 2026-10-26 la porte. Aujourd hui : AUDF seul.
 *   3. « Mesure, pas encore route » : les lignes PASSE_FACTORY_NEUVE_SEULEMENT de mesures/stables-fiat-20261026.json (CADD, MXNB,
 *      USDT), recopiees ici et RECOUPEES avec le fichier par test-wallet-fiat-20261026.mjs. Aucun bouton.
 *   ⛔ EURC est BANNI (DEVISES_BANNIES) : jamais offert, jamais promu, dans aucun des trois blocs — meme si une table le reportait.
 * ⛔ Les chiffres de mesure sont des ENTIERS BRUTS (USDC a 6 decimales) copies du fichier, pas recites : le banc les compare octet
 *   pour octet. Une adresse est copiee du fichier de mesure, jamais completee de memoire. */
import { POOLS_PIVOTS_AERODROME, DEVISES_BANNIES } from './plan-franchissement.js';
import { devisesPivotVersBloc } from './entree-vers-bloc.js';
import { USDC_BASE } from './frais-creation.js';
import { phraseMoyens, choisirRail, ACTIFS_CARTE } from './retour-fiat.js';

const bas = (a) => String(a || '').toLowerCase();
const ETH = '0x0000000000000000000000000000000000000000';
const USDC = bas(USDC_BASE);

/** USDC d abord (Phil), puis ETH — seulement les actifs que le rail carte sait livrer. */
export const ORDRE_ACTIFS = Object.freeze(['USDC', 'ETH'].filter((a) => ACTIFS_CARTE.includes(a)));

/** La divulgation Coinbase gardee depuis le 2026-10-01 (#cFundHint) : le bareme est le LEUR, on ne le recite pas. */
export const PHRASE_FRAIS_COINBASE = 'Coinbase charges a fee and shows you the total before you confirm.';

/** La mesure d ou viennent les chiffres des blocs 2 et 3. */
export const SOURCE_MESURE = Object.freeze({ fichier: 'mesures/stables-fiat-20261026.json', bloc: 53106990, date: '2026-10-26' });
/** La regle appliquee (liquidite-actions.js REGLES, recopiee dans le fichier de mesure) : en mots, pour l ecran. */
export const PHRASE_REGLE = 'a 10,000 USDC trade, buy gap at most 1 %, round trip at most 2 %';

/** Les faits mesures des monnaies locales ROUTEES (venue « aero-old » = la factory de notre routeur). */
export const MESURES_ROUTEES = Object.freeze({
  '0xd2a530170d71a9cfe1651fb468e2b98f7ed7456b': Object.freeze({ symbole: 'AUDF', monnaie: 'Australian dollar', code: 'AUD', nom: 'Forte AUD',
    usdcPool: '25103701609', usdcUtilisable: '9904240031', ecartBps: 5, perteBps: 10 }),
});

/** Mesure, pas encore route : passe la regle SEULEMENT sur la factory Aerodrome neuve (venue « aero-new »). `ancien` = le code lu
 *  sur la factory de notre routeur, qui dit pourquoi elle n y passe pas. */
export const A_VENIR = Object.freeze([
  Object.freeze({ adr: '0x16f93ebc5320c89efc8701577efe49d14a276a06', symbole: 'CADD', monnaie: 'Canadian dollar', code: 'CAD',
    usdcPool: '57384938135', usdcUtilisable: '9953120576', ecartBps: 5, perteBps: 10, ancien: 'POOL_VIDE' }),
  Object.freeze({ adr: '0xf197ffc28c23e0309b5559e7a166f2c6164c80aa', symbole: 'MXNB', monnaie: 'Mexican peso', code: 'MXN',
    usdcPool: '13473538883', usdcUtilisable: '9993219770', ecartBps: 5, perteBps: 10, ancien: 'LIQUIDITE_SOUS_SEUIL' }),
  Object.freeze({ adr: '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', symbole: 'USDT', monnaie: 'US dollar', code: 'USD',
    usdcPool: '62856678529', usdcUtilisable: '9999900138', ecartBps: 0, perteBps: 0, ancien: 'SANS_POOL' }),
]);

const RAISON_ANCIEN = Object.freeze({
  SANS_POOL: 'there is no USDC pool for it on the Aerodrome factory our router uses',
  POOL_VIDE: 'its USDC pool on the Aerodrome factory our router uses is empty',
  LIQUIDITE_SOUS_SEUIL: 'its USDC pool on the Aerodrome factory our router uses is too shallow',
});

/** USDC brut (6 decimales, chaine d entier) -> « 25,104 USDC ». Illisible -> null (jamais 0). */
export function usdcLisible(brut) {
  if (!/^\d+$/.test(String(brut || ''))) return null;
  return Math.round(Number(BigInt(String(brut)) / 1000n) / 1000).toLocaleString('en-US') + ' USDC';
}
const pctBps = (b) => (Number.isInteger(b) && b >= 0 ? (b / 100).toFixed(2) + ' %' : null);

/**
 * BLOC 1 — une ligne par actif (USDC, puis ETH). `coinbase` = la liste de moyens LUE (null = non lue) ; `moonpay[actif]` = le corps
 * de /api/moonpay/pays tel que rendu (`undefined` = pas demande : Coinbase sert ; `null` = lecture ratee).
 * Rend { actif, rail, bouton, phrase, moonpay } : `moonpay` est la phrase d etat de MoonPay quand il n est PAS le rail, ou null.
 */
export function lignesAchat({ pays = null, nomPays = null, coinbase = null, moonpay = {} } = {}) {
  const p = /^[A-Z]{2}$/.test(String(pays || '')) ? String(pays) : null;
  const nom = p ? (nomPays ? nomPays + ' (' + p + ')' : p) : null;
  const moyensCb = Array.isArray(coinbase) ? coinbase.filter((x) => typeof x === 'string' && x && x !== 'UNSPECIFIED') : [];
  return ORDRE_ACTIFS.map((actif) => {
    if (!p) return { actif, rail: null, bouton: null, phrase: phraseMoyens({ pays: null }), moonpay: null };
    const mp = moonpay ? moonpay[actif] : undefined;
    const rail = choisirRail({ coinbaseMoyens: moyensCb, moonpay: mp || null });
    if (rail === 'moonpay') {
      const f = mp && mp.frais && typeof mp.frais.carte === 'string' && typeof mp.frais.banque === 'string'
        ? ' MoonPay publishes its fees as ' + mp.frais.carte + ', ' + mp.frais.banque + '; it shows the exact amount before you pay.'
        : ' MoonPay shows its fee before you pay.';
      return { actif, rail, bouton: 'Buy ' + actif + ' with MoonPay',
        phrase: 'In ' + nom + ', MoonPay sends ' + actif + ' to your own wallet on Base. MoonPay checks your identity itself.' + f, moonpay: null };
    }
    let etatMp = null;
    if (!moyensCb.length) {
      if (mp === null) etatMp = 'MoonPay could not be read for ' + nom + ' right now.';
      else if (mp && mp.pret === false) etatMp = 'MoonPay is not connected on this server, so it is not offered.';
      else if (mp && mp.pret === true && mp.servi !== true) {
        etatMp = 'MoonPay is not offered for ' + actif + ' in ' + nom + ' from here' + (mp.pourquoi ? ' — MoonPay answered: ' + String(mp.pourquoi).slice(0, 140) : '') + '.';
      }
    }
    return { actif, rail: 'coinbase', bouton: 'Buy ' + actif + ' with Coinbase',
      phrase: phraseMoyens({ pays: p, nomPays, moyens: moyensCb }) + ' ' + PHRASE_FRAIS_COINBASE, moonpay: etatMp };
  });
}

/**
 * BLOC 2 — les monnaies locales que NOTRE routeur traite : une ligne de POOLS_PIVOTS_AERODROME (la table du serveur) qui a une
 * mesure ici, jamais bannie. « Pay with » = devisesPivotVersBloc (la meme fonction que le serveur) pour ETH et pour USDC.
 * `offertsAchat` = les adresses que le Swap du Wallet offre en « You get » : un achat n a de bouton que si elle y est.
 */
export function monnaiesLocales({ offertsAchat = [], table = POOLS_PIVOTS_AERODROME, mesures = MESURES_ROUTEES } = {}) {
  const offerts = new Set((offertsAchat || []).map(bas));
  const payeEth = new Set(devisesPivotVersBloc(ETH).map((d) => d.adr));
  const payeUsdc = new Set(devisesPivotVersBloc(USDC).map((d) => d.adr));
  const out = [];
  for (const [k, v] of table) {
    const adr = k.split('|').find((t) => t !== USDC);
    /* ⛔ le ban passe AVANT tout : une table ou une mesure qui reporterait EURC ne le fait pas offrir */
    if (!adr || DEVISES_BANNIES.has(adr)) continue;
    const m = mesures[adr];
    if (!m) continue;
    const cotes = [payeEth.has(adr) ? 'ETH' : null, payeUsdc.has(adr) ? 'USDC' : null].filter(Boolean);
    const achat = offerts.has(adr);
    out.push({
      adr, symbole: m.symbole, monnaie: m.monnaie, code: m.code, nom: m.nom, pool: v.pool,
      faits: 'Measured on ' + SOURCE_MESURE.date + ' (Base block ' + SOURCE_MESURE.bloc.toLocaleString('en-US') + '): ' + usdcLisible(m.usdcPool)
        + ' in its Aerodrome pool against USDC; a 10,000 USDC trade measured a buy gap of ' + pctBps(m.ecartBps)
        + ' and a round trip of ' + pctBps(m.perteBps) + '. The pool is small: the quote shown before you sign is what counts.',
      payWith: cotes.length ? 'Pay with ' + m.symbole + ': any block that trades against ' + cotes.join(' or ') + ' (' + m.symbole + ' to USDC on Aerodrome, then the block — the plan shows each step before your wallet signs).' : null,
      achat: achat ? { ouvert: true, bouton: 'Buy ' + m.symbole + ' with USDC' }
        : { ouvert: false, phrase: 'Buying ' + m.symbole + ' with USDC is not routed here yet. If you already hold ' + m.symbole + ', it pays blocks and swaps back to USDC.' },
      adresse: 'Address not confirmed by the issuer.',
    });
  }
  return out;
}

/** BLOC 3 — mesure, pas encore route. Une ligne deja routee (dans la table du serveur) ou bannie n y est pas. Aucun bouton. */
export function aVenir({ liste = A_VENIR, table = POOLS_PIVOTS_AERODROME } = {}) {
  const routees = new Set([...table.keys()].map((k) => k.split('|').find((t) => t !== USDC)));
  return liste.filter((x) => !DEVISES_BANNIES.has(x.adr) && !routees.has(x.adr)).map((x) => ({
    adr: x.adr, symbole: x.symbole, monnaie: x.monnaie, code: x.code,
    phrase: x.symbole + ' (' + x.monnaie + ') — measured, not routed yet: it passes our rule (' + PHRASE_REGLE + ') only on the newer Aerodrome pool factory ('
      + usdcLisible(x.usdcPool) + ' in the pool), which our router does not trade on yet; ' + (RAISON_ANCIEN[x.ancien] || 'it does not pass on the factory our router uses') + '.',
  }));
}
