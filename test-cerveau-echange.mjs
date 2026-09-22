// test-cerveau-echange.mjs — LE BLOCK RECLAME AU BON MOMENT, ET SE TAIT LE RESTE DU TEMPS.
//
// ⛔⛔ CE QUE CE FICHIER PROTEGE VRAIMENT. Chaque « oui » de ce module fait ouvrir un wallet a un
//     humain et lui fait payer du gas. Un faux positif ne coute pas un pixel : il coute de l argent
//     reel a quelqu un, pour une raison inventee. C est pourquoi le fail-closed et le NaN sont
//     testes avant les cas nominaux.
import assert from 'node:assert/strict';
import { decisionEchange, phraseDemande, RECLAMER_A_H, ECART_MIN_RAPPEL_H,
  TRANSFERTS_MIN_ECHANGE, SILENCE_MAX_MESURE_H, ETATS } from './cerveau-echange.js';

let n = 0;
const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const ok = (c, m) => { assert.ok(c, m); n++; };

const base = { silenceH: 2, transferts: 40, depuisRappelH: 100, listeMaintenant: true };
const d = (o) => decisionEchange({ ...base, ...o });

/* ══ 1. FAIL-CLOSED AVANT TOUT LE RESTE ══════════════════════════════════════════════════════
 * ⛔ Une entree qu on ne sait pas lire ne doit RIEN reclamer. Reclamer sur une lecture ratee
 *    ferait signer un humain pour une raison inventee. */
for (const [mauvais, nom] of [
  [{ silenceH: NaN }, 'silenceH = NaN'],
  [{ transferts: NaN }, 'transferts = NaN'],
  [{ depuisRappelH: NaN }, 'depuisRappelH = NaN'],
  [{ transferts: null }, 'transferts inconnu'],
  [{ silenceH: -3 }, 'silence negatif'],
  [{ transferts: -1 }, 'transferts negatif'],
  [{ silenceH: 'vieux' }, 'silenceH texte'],
  [{ transferts: {} }, 'transferts objet'],
]) {
  const r = d(mauvais);
  eq(r.etat, 'NON_MESURE', nom + ' ⇒ NON_MESURE, jamais un verdict');
  eq(r.reclame, false, nom + ' ⇒ ne reclame RIEN — un humain paierait pour une raison inventee');
}
/* ⛔⛔ LE NaN MERITE SA PROPRE ASSERTION, parce qu il echoue OUVERT partout ailleurs :
 *     `NaN >= 18` et `NaN >= 24` sont TOUS LES DEUX faux, donc un NaN traverse toutes les bornes
 *     sans en declencher aucune et ressort par le dernier `else` — c est-a-dire « tout va bien ».
 *     Sans le refus explicite, un capteur casse rendrait un block eternellement rassurant. */
{
  const r = decisionEchange({ silenceH: NaN, transferts: 40, depuisRappelH: 100 });
  ok(r.etat !== 'PAS_ENCORE',
    '⛔ un NaN ne doit PAS ressortir en « pas encore » : il traverse toutes les bornes sans en '
    + 'declencher une seule, et « tout va bien » serait la reponse par defaut d un capteur casse');
}
eq(decisionEchange(null).etat, 'NON_MESURE', 'aucun fait du tout ⇒ NON_MESURE, sans exception levee');
eq(decisionEchange(undefined).reclame, false, 'et rien n est reclame');

/* ══ 2. LE SILENCE — LES DEUX COTES DE CHAQUE BORNE ══════════════════════════════════════════
 * ⛔ Une borne testee d un seul cote peut etre decalee d une heure sans que rien ne le dise. */
eq(d({ silenceH: RECLAMER_A_H - 0.1 }).etat, 'PAS_ENCORE', 'juste avant le seuil : il se tait');
eq(d({ silenceH: RECLAMER_A_H - 0.1 }).reclame, false, 'et ne reclame pas');
eq(d({ silenceH: RECLAMER_A_H }).etat, 'BIENTOT_PERDU', 'pile au seuil : il reclame');
eq(d({ silenceH: RECLAMER_A_H }).reclame, true, 'et c est bien une demande');
eq(d({ silenceH: 23.9 }).etat, 'BIENTOT_PERDU', 'juste avant 24 h : encore « bientot »');
eq(d({ silenceH: 24 }).etat, 'DEJA_PERDU', 'a 24 h : il est deja sorti, et le geste n est pas le meme');
eq(d({ silenceH: 200 }).etat, 'DEJA_PERDU', 'tres au-dela : toujours DEJA_PERDU, pas autre chose');
eq(d({ silenceH: null }).etat, 'DEJA_PERDU',
  'aucun mouvement DANS LA FENETRE ⇒ deja perdu — « aucun » n est pas « jamais », et le texte le dit');

/* ⛔ LE SEUIL LAISSE VRAIMENT DE LA MARGE : reclamer a 23 h supposerait l humain devant son ecran
 *    dans l heure. C est la difference entre une demande satisfaisable et une demande en retard. */
ok(RECLAMER_A_H <= SILENCE_MAX_MESURE_H - 4,
  'le seuil de rappel (' + RECLAMER_A_H + ' h) laisse au moins 4 h avant la borne mesuree ('
  + SILENCE_MAX_MESURE_H + ' h) — sinon la demande arrive apres la bascule');

/* ══ 3. BOUGER N EST PAS ECHANGER ════════════════════════════════════════════════════════════
 * ⛔ Les deux seuls marches actifs restes inconnus de l index avaient exactement 2 transferts :
 *    le mint et la mise en pool. Le block doit savoir dire « tu n as jamais ete echange ». */
{
  const r = d({ transferts: 2, silenceH: 1 });
  eq(r.etat, 'JAMAIS_ECHANGE', '2 transferts = naissance + mise en pool, pas un echange');
  eq(r.reclame, true, 'et il reclame MEME si le silence est court : le probleme n est pas la date');
  ok(/three times|3/.test(r.texte), 'le texte dit combien il en faut');
}
eq(d({ transferts: TRANSFERTS_MIN_ECHANGE, silenceH: 1 }).etat, 'PAS_ENCORE',
  'pile au minimum de transferts et recent : plus rien a signaler');
eq(d({ transferts: 0, silenceH: 1 }).etat, 'JAMAIS_ECHANGE', 'zero transfert aussi');

/* ══ 4. UNE FOIS PAR JOUR — LA DEMANDE DE PHIL, ET UNE GARDE CONTRE LE HARCELEMENT ═══════════
 * ⛔ Le cerveau bat toutes les ~90 s. Sans cet ecart, un block en retard redemanderait 960 fois
 *    par jour. */
eq(d({ silenceH: 30, depuisRappelH: 1 }).etat, 'DEJA_PROPOSE', 'rappel il y a 1 h ⇒ il se tait');
eq(d({ silenceH: 30, depuisRappelH: 1 }).reclame, false, 'et ne reclame rien');
eq(d({ silenceH: 30, depuisRappelH: ECART_MIN_RAPPEL_H - 0.1 }).etat, 'DEJA_PROPOSE',
  'juste avant 24 h de silence de rappel : toujours muet');
eq(d({ silenceH: 30, depuisRappelH: ECART_MIN_RAPPEL_H }).etat, 'DEJA_PERDU',
  'a 24 h pile : il peut redemander');
eq(d({ silenceH: 30, depuisRappelH: null }).etat, 'DEJA_PERDU',
  "jamais rappele ⇒ il peut parler — sinon un block neuf n aurait jamais sa premiere demande");

/* ══ 5. CE QUE LE BLOCK N A PAS LE DROIT DE DIRE ═════════════════════════════════════════════
 * ⛔⛔ LA MESURE DIT CE QUE LES MARCHES LISTES AVAIENT EN COMMUN. ELLE NE DIT PAS QU ECHANGER
 *     REMET DANS L INDEX : « echanger garde la place » et « avoir la place amene des echanges »
 *     rendent le meme tableau. Une phrase qui promettrait le retour serait invendable. */
{
  const tous = [d({ silenceH: 30 }), d({ silenceH: 20 }), d({ transferts: 1, silenceH: 1 })];
  for (const r of tous) {
    const p = phraseDemande(r);
    ok(p, 'une demande porte bien une phrase');
    ok(!/will be relisted|will return|guarantee|garantit|sera reliste/i.test(p),
      '⛔ aucune promesse de RETOUR dans l index : le sens de la fleche n est pas tranche');
    ok(!/\$|price|moon|pump|up\b/i.test(p.replace(/\bupdated\b/g, '')),
      '⛔ aucune promesse de PRIX ni conseil — le block parle d un annuaire, pas de valeur');
    ok(/measured|we measured/i.test(p),
      'et la phrase dit que ca vient d une mesure, pas d une intuition');
  }
  eq(phraseDemande(d({ silenceH: 1 })), null, 'quand il ne reclame pas, il ne dit rien du tout');
  eq(phraseDemande(null), null, 'et une entree vide ne fabrique pas de phrase');
}

/* ══ 6. TOUTE SORTIE PORTE SA MARQUE ════════════════════════════════════════════════════════ */
{
  const cas = [d({}), d({ silenceH: 30 }), d({ silenceH: NaN }), d({ transferts: 1 }),
    d({ depuisRappelH: 1, silenceH: 30 }), d({ silenceH: null })];
  for (const r of cas) {
    eq(r.signeParUtilisateur, true,
      'TOUTE sortie porte `signeParUtilisateur: true` — y compris les refus, sinon la marque '
      + 'manquerait precisement la ou quelqu un irait chercher une exception');
    ok(ETATS.includes(r.etat), 'l etat « ' + r.etat + ' » est dans la liste declaree');
    ok(typeof r.pourquoi === 'string' && r.pourquoi.length > 10,
      'et chaque sortie porte sa raison, meme quand elle ne reclame rien');
  }
}

/* ══ 7. LE TEMOIN — sans lui, une fonction qui dirait TOUJOURS non passerait presque tout ════ */
{
  const oui = [d({ silenceH: 30 }), d({ silenceH: 19 }), d({ transferts: 1, silenceH: 1 }), d({ silenceH: null })];
  const non = [d({ silenceH: 1 }), d({ silenceH: 30, depuisRappelH: 2 }), d({ silenceH: NaN })];
  eq(oui.filter((r) => r.reclame).length, 4, 'temoin : les quatre cas qui DOIVENT reclamer reclament');
  eq(non.filter((r) => r.reclame).length, 0, 'temoin : et les trois qui ne doivent pas se taisent');
  ok(new Set(oui.concat(non).map((r) => r.etat)).size >= 5,
    'temoin : au moins cinq etats distincts sont atteints — une fonction a une seule reponse '
    + 'passerait les assertions une par une sans jamais distinguer quoi que ce soit');
}

console.log('test-cerveau-echange : ' + n + ' assertions, OK');
