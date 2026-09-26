/* heures-marche.js — LA BOURSE EST-ELLE OUVERTE, ET QU EST-CE QU ON SAIT VRAIMENT ?
 *
 * ⛔⛔ POURQUOI CE MODULE EXISTE. L app appaire des blocks a des actions tokenisees Coinbase (B20) et
 *     affiche des valeurs libellees dans ces actions. Le prix vient de DexScreener, donc du marche
 *     ON-CHAIN de l action sur Base — qui, lui, s echange 24/7. Ce prix n est donc PAS fige.
 *   ⛔ MAIS CE N EST PAS LE COURS DE L ACTION quand la bourse est fermee. Sans arbitrage possible
 *     vers le sous-jacent, un samedi, ce prix est un marche SUR L OUVERTURE DE LUNDI. Afficher
 *     « ton block vaut 3 AAPLc » sans le dire, c est laisser lire une reference close.
 *
 * ⛔⛔ CE MODULE NE DIT JAMAIS « OUVERT » TOUT COURT, ET C EST SA REGLE CENTRALE.
 *     Un calendrier local sait qu on est samedi ; il ne sait RIEN des jours feries ni des haltes
 *     (circuit breakers, halte reglementaire, news-pending). La documentation Chainlink le dit de
 *     ses propres feeds : ils « do not explicitly flag: Exchange public holidays, Trading halts…
 *     Other operational closures ».
 *     ⇒ Deux verdicts seulement : FERME (certain, horloge + fuseau) et HEURES_NORMALES (« on est
 *       dans la plage d ouverture, ET on n a verifie ni ferie ni halte »). Jamais « OUVERT ».
 *     ⛔ Un troisieme verdict optimiste serait exactement le defaut qu on corrige : une affirmation
 *       plus forte que la mesure.
 *
 * ⛔ LE FUSEAU EST `America/New_York`, PAS UN DECALAGE FIXE. Un `-5h` code en dur se trompe de
 *   soixante minutes pendant sept mois de l annee (heure d ete), donc se tromperait sur l ouverture
 *   et la cloture — une heure entiere chaque jour, et personne ne le verrait.
 *
 * ⚠️ CE QUE CE MODULE NE PEUT PAS FAIRE : dire qu un marche est ouvert. Il borne, il ne confirme pas.
 */

/** Heures de seance regulieres des bourses americaines, en heure de New York. */
const OUVERTURE_MIN = 9 * 60 + 30;   /* 09:30 */
const CLOTURE_MIN = 16 * 60;         /* 16:00 */

/**
 * @param {Date} [quand] instant a juger (defaut : maintenant).
 * @returns {{etat:'FERME'|'HEURES_NORMALES', pourquoi:string, heureNY:string|null}}
 */
export function etatMarcheActions(quand = new Date()) {
  let parties;
  try {
    /* ⛔ `Intl` PLUTOT QU UN CALCUL : il porte les regles d heure d ete, qui changent de date selon
     *   les annees et les pays. Les reecrire serait s engager a les maintenir pour toujours. */
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    parties = Object.fromEntries(f.formatToParts(quand).map((p) => [p.type, p.value]));
  } catch (_) {
    /* ⛔ FAIL-CLOSED : sans fuseau lisible on ne PEUT pas savoir. On ne devine pas « ouvert » —
     *   on dit qu on ne sait pas, et l appelant n affichera pas une certitude qu il n a pas. */
    return { etat: 'FERME', pourquoi: 'market hours could not be read on this device', heureNY: null };
  }
  const jour = String(parties.weekday || '');
  const h = Number(parties.hour), m = Number(parties.minute);
  const heureNY = (Number.isFinite(h) && Number.isFinite(m))
    ? String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' New York' : null;
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return { etat: 'FERME', pourquoi: 'market hours could not be read on this device', heureNY: null };
  }
  if (jour === 'Sat' || jour === 'Sun') {
    return { etat: 'FERME', pourquoi: 'US stock markets are closed at weekends', heureNY };
  }
  const minutes = h * 60 + m;
  if (minutes < OUVERTURE_MIN || minutes >= CLOTURE_MIN) {
    return { etat: 'FERME', pourquoi: 'US stock markets trade 9:30–16:00 New York time', heureNY };
  }
  /* ⛔ ON NE DIT PAS « OUVERT ». On dit qu on est dans la plage, et ce qu on n a PAS verifie. */
  return { etat: 'HEURES_NORMALES', pourquoi: 'regular hours — public holidays and trading halts are not checked', heureNY };
}

/**
 * La phrase a montrer a cote d une valeur libellee en action tokenisee.
 * ⛔ ELLE DIT CE QU EST LE PRIX, pas seulement que la bourse dort : « the on-chain price keeps
 *   trading » evite qu on croie le chiffre casse ou fige, et « no arbitrage to the share » dit
 *   pourquoi il peut s ecarter. Nommer la cause vaut mieux que poser un avertissement.
 */
export function phraseMarcheActions(quand = new Date()) {
  const e = etatMarcheActions(quand);
  if (e.etat === 'FERME') {
    return 'The stock market is closed right now (' + e.pourquoi + '). This on-chain price keeps '
      + 'trading, but nothing arbitrages it back to the share until the market reopens — read it as '
      + 'a price for the next open, not as the share price.';
  }
  return 'Regular US market hours. Public holidays and trading halts are not checked here.';
}
