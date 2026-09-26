/* test-heures-marche.mjs — ON NE DIT JAMAIS « OUVERT », PARCE QU ON NE PEUT PAS LE PROUVER.
 *
 * ⛔⛔ CE QUI A DECLENCHE CE MODULE, ET LA CORRECTION QUI VA AVEC. J ai d abord annonce a Phil que nos
 *     ecrans affichaient des prix d actions FIGES comme s ils etaient vivants, en m appuyant sur le
 *     fait que le feed Chainlink des actions tokenisees B20 sur Base « holds the last close » et n a
 *     aucun champ de statut.
 *     ⛔ C ETAIT FAUX POUR NOUS : on n utilise pas Chainlink. Notre prix vient de `/api/prix-usd`,
 *       qui lit DexScreener — donc le marche ON-CHAIN de l action sur Base, qui s echange 24/7. Le
 *       prix n est pas fige. J ai retire l affirmation avant d ecrire une ligne de correctif.
 *
 * ⛔ CE QUI RESTE VRAI, ET PLUS FIN : quand la bourse est fermee, RIEN n arbitre ce prix on-chain
 *   vers l action. C est un marche SUR LA PROCHAINE OUVERTURE, pas le cours du titre. Quelqu un qui
 *   echange un samedi doit le lire a l ecran, pas le deviner.
 *
 * ⛔⛔ ET LA REGLE CENTRALE DE CE MODULE EST UNE ABSENCE : il ne rend JAMAIS « OUVERT ». Un calendrier
 *     local sait qu on est samedi ; il ne sait RIEN des jours feries ni des haltes. La documentation
 *     Chainlink le dit de ses propres feeds : ils « do not explicitly flag: Exchange public
 *     holidays, Trading halts… Other operational closures ».
 *     ⇒ Deux verdicts : FERME (certain) et HEURES_NORMALES (avec ce qui n a PAS ete verifie).
 *       Un troisieme verdict optimiste serait une affirmation plus forte que la mesure — exactement
 *       le defaut qu on corrige.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { etatMarcheActions, phraseMarcheActions } from './heures-marche.js';

let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ DES INSTANTS EN UTC, CONVERTIS PAR LE MODULE. On ne fabrique pas d heure locale dans le test :
 *   il tournerait juste sur ma machine et faux sur une autre. */
const t = (iso) => new Date(iso);

v('⛔⛔ il ne rend JAMAIS « OUVERT » — sur aucune heure de la semaine', () => {
  /* On balaie une semaine entiere, toutes les demi-heures : aucun instant ne doit produire un
   * verdict plus fort que HEURES_NORMALES. C est la propriete, pas un echantillon choisi. */
  const debut = Date.UTC(2026, 8, 21, 0, 0);           /* lundi 2026-09-21 */
  const etats = new Set();
  for (let i = 0; i < 7 * 48; i++) etats.add(etatMarcheActions(new Date(debut + i * 30 * 60000)).etat);
  assert.deepEqual([...etats].sort(), ['FERME', 'HEURES_NORMALES'],
    'un verdict inattendu est apparu : ' + [...etats].join(', ')
    + ' — « OUVERT » serait plus fort que ce que ce module peut prouver');
});

v('⛔ le week-end est FERME, et la raison le dit', () => {
  /* samedi 2026-09-26, 18:00 UTC = 14:00 New York : en pleine plage horaire, mais samedi. */
  const s = etatMarcheActions(t('2026-09-26T18:00:00Z'));
  assert.equal(s.etat, 'FERME', 'un samedi a 14 h New York est declare autrement que ferme');
  assert.match(s.pourquoi, /weekend/i, 'la raison du week-end n est plus nommee');
  /* ⛔ LE PIEGE EXACT : sans le test du jour, l heure seule (14:00) tomberait dans la plage et le
   *   module dirait « heures normales » un samedi. */
});

v('⛔ hors 9:30–16:00 New York, c est FERME meme en semaine', () => {
  /* mercredi 2026-09-23, 02:00 UTC = 22:00 mardi a New York */
  const nuit = etatMarcheActions(t('2026-09-23T02:00:00Z'));
  assert.equal(nuit.etat, 'FERME', 'une nuit de semaine est declaree ouverte');
  assert.match(nuit.pourquoi, /9:30/, 'la plage horaire n est plus nommee dans la raison');
});

v('⛔ en pleine seance, il dit ce qu il n a PAS verifie', () => {
  /* mercredi 2026-09-23, 15:00 UTC = 11:00 New York (heure d ete) */
  const e = etatMarcheActions(t('2026-09-23T15:00:00Z'));
  assert.equal(e.etat, 'HEURES_NORMALES', 'une seance reguliere n est plus reconnue');
  assert.match(e.pourquoi, /holidays and trading halts are not checked/,
    'le module ne dit plus ce qu il ignore : le lecteur croirait a une confirmation');
});

v('⛔⛔ le fuseau est nomme, pas calcule — sinon l heure d ete decale tout d une heure', () => {
  const src = readFileSync(new URL('./heures-marche.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');
  assert.ok(/timeZone: 'America\/New_York'/.test(src),
    'le fuseau n est plus nomme : un decalage fixe se tromperait d une heure pendant sept mois par an');
  assert.ok(!/getTimezoneOffset|UTC\s*-\s*5|-5 \* 3600/.test(src),
    'un calcul de decalage est apparu : il ignorerait l heure d ete');
  /* ⛔ FAIL-CLOSED : si `Intl` echoue, on ne devine pas « ouvert ». */
  assert.ok(/catch \(_\) \{[\s\S]{0,300}etat: 'FERME'/.test(src),
    'un fuseau illisible ne retombe plus sur FERME : on affirmerait une ouverture qu on ne sait pas lire');
});

v('⛔ la phrase dit que le prix continue de vivre, pas qu il est casse', () => {
  const p = phraseMarcheActions(t('2026-09-26T18:00:00Z'));
  assert.match(p, /keeps trading/,
    'la phrase laisse croire que le prix est fige : il ne l est pas, il vient du marche on-chain');
  assert.match(p, /nothing arbitrages it back to the share/,
    'la phrase ne dit plus POURQUOI ce prix peut s ecarter du cours');
  assert.match(p, /a price for the next open/,
    'la phrase ne nomme plus ce que le chiffre EST reellement quand la bourse dort');
  const ouvert = phraseMarcheActions(t('2026-09-23T15:00:00Z'));
  assert.match(ouvert, /not checked/,
    'en seance, la phrase ne dit plus ses limites : elle se lirait comme une garantie');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok heures-marche — ' + n + ' cas.');
console.log('   Deux verdicts seulement, jamais « OUVERT ». Le week-end et la nuit sont FERMES avec');
console.log('   leur raison ; en seance, le module dit ce qu il n a PAS verifie.');
console.log('⚠️ NE PROUVE PAS qu un marche soit ouvert : feries et haltes ne sont pas lus. Ce module');
console.log('   borne, il ne confirme pas.');
