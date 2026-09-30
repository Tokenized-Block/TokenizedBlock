/* Ce que Cobalt a change, et ce que ce module REFUSE d en deduire.
 *
 * Mesure du 2026-09-30 : `updateUIMultiplier` ABSENTE au bloc 52 000 926, PRESENTE au 52 000 927,
 * la MEME frontiere sur AAPLc, OUSD et notre Block 0 — donc un fork, pas une mise a jour.
 * `uiMultiplier()` est un ajout du fork (absent avant, present apres, sur les trois).
 * `multiplier()` survit et concorde 15/15, dont 2 valeurs chargees (GOOGLc, METAc).
 *
 * ⛔ CE QUE CE TEST TIENT SURTOUT : le refus de choisir un accesseur quand les deux se contredisent.
 *   L accord mesure ne couvre que ~3 bps de derive ; un split porterait le multiplicateur a 2,0 ou
 *   4,0 et rien ne prouve l accord la-haut. Choisir silencieusement serait un solde faux sans
 *   symptome.
 */
import { BLOC_COBALT, HORODATAGE_COBALT, ERREUR_DROITS, ROLES_LUS, etatCobalt, formeDeLaReponse,
  multiplicateurAccorde, afficherEquivalent, doitDireQuelqueChose, phraseMultiplicateur } from './cobalt.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu, (k, v) => (typeof v === 'bigint' ? String(v) : v))));
}

console.log('la frontiere mesuree, pas arrondie');
ok('le bloc est celui qu on a bissecte', BLOC_COBALT === 52000927, BLOC_COBALT);
ok('l horodatage est celui du bloc', HORODATAGE_COBALT === '2026-09-30T18:00:01Z', HORODATAGE_COBALT);
/* ⛔ LE BLOC JUSTE AVANT EST LA MOITIE QUI COMPTE : une garde ecrite « >= 52000000 » serait VRAIE
 *   sur la tete et fausse sur les 927 blocs du milieu. C est le motif « garde vraie qui tient la
 *   mauvaise moitie » — on teste donc les DEUX cotes de la frontiere, a un bloc. */
ok('52 000 926 -> AVANT', etatCobalt(52000926).etat === 'AVANT', etatCobalt(52000926));
ok('52 000 927 -> ACTIF', etatCobalt(52000927).etat === 'ACTIF', etatCobalt(52000927));
ok('la tete mesuree -> ACTIF', etatCobalt(52004271).etat === 'ACTIF');
ok('un bloc tres ancien -> AVANT', etatCobalt(50861088).etat === 'AVANT');

console.log('');
console.log('une hauteur non lue n est PAS « avant Cobalt »');
ok('undefined -> INCONNU', etatCobalt(undefined).etat === 'INCONNU');
ok('null -> INCONNU', etatCobalt(null).etat === 'INCONNU');
ok('une chaine -> INCONNU', etatCobalt('52000927').etat === 'INCONNU');
ok('NaN -> INCONNU (NaN traverse toute borne)', etatCobalt(NaN).etat === 'INCONNU', etatCobalt(NaN));
ok('Infinity -> INCONNU', etatCobalt(Infinity).etat === 'INCONNU', etatCobalt(Infinity));
ok('un bloc fractionnaire -> INCONNU', etatCobalt(52000927.5).etat === 'INCONNU');
ok('negatif -> INCONNU', etatCobalt(-1).etat === 'INCONNU');
ok('0 reste un bloc valide, et il est AVANT', etatCobalt(0).etat === 'AVANT', etatCobalt(0));

console.log('');
console.log('reconnaitre l absence : une RELATION, pas une valeur');
ok('donnee == selecteur -> ABSENTE',
  formeDeLaReponse({ selecteurEnvoye: '0xe6323eb5', donneeDeRevert: '0xe6323eb5' }).forme === 'ABSENTE');
ok('la casse ne change rien',
  formeDeLaReponse({ selecteurEnvoye: '0xE6323EB5', donneeDeRevert: '0xe6323eb5' }).forme === 'ABSENTE');
ok('erreur de droits -> PRESENTE_DROITS',
  formeDeLaReponse({ selecteurEnvoye: '0x628e600f',
    donneeDeRevert: ERREUR_DROITS + '0'.repeat(64) + ROLES_LUS.updateUIMultiplier.slice(2) }).forme === 'PRESENTE_DROITS');
ok('une valeur -> LISIBLE',
  formeDeLaReponse({ selecteurEnvoye: '0x1b3ed722', valeur: '0x0de0b6b3a7640000' }).forme === 'LISIBLE');
/* ⛔ LE DEFAUT QUE MA PREMIERE SONDE AVAIT : sans le selecteur envoye, on ne PEUT pas reconnaitre
 *   l absence. Rendre ABSENTE ici serait affirmer sur rien. */
ok('selecteur inconnu -> INDECIS, jamais ABSENTE',
  formeDeLaReponse({ donneeDeRevert: '0xe6323eb5' }).forme === 'INDECIS',
  formeDeLaReponse({ donneeDeRevert: '0xe6323eb5' }));
ok('sans charge de revert -> INDECIS',
  formeDeLaReponse({ selecteurEnvoye: '0x628e600f' }).forme === 'INDECIS');
ok('une charge qui ne ressemble a rien -> INDECIS, pas PRESENTE',
  formeDeLaReponse({ selecteurEnvoye: '0x628e600f', donneeDeRevert: '0xdeadbeef' }).forme === 'INDECIS',
  formeDeLaReponse({ selecteurEnvoye: '0x628e600f', donneeDeRevert: '0xdeadbeef' }));
ok('rien du tout -> INDECIS', formeDeLaReponse().forme === 'INDECIS');
ok('une valeur vide `0x` ne compte PAS comme lisible',
  formeDeLaReponse({ selecteurEnvoye: '0x628e600f', valeur: '0x' }).forme === 'INDECIS',
  formeDeLaReponse({ selecteurEnvoye: '0x628e600f', valeur: '0x' }));

console.log('');
console.log('le multiplicateur : l accord, et le refus de choisir');
const N = 1000000000000000000n;
const GOOGL = 1000377119000000000n;
ok('les deux a 1,0 -> ACCORD',
  multiplicateurAccorde({ multiplier: N, uiMultiplier: N }).etat === 'ACCORD');
/* ⛔ L ACCORD SUR DES CONSTANTES NE PROUVE RIEN : on le teste aussi sur la valeur CHARGEE mesuree. */
ok('les deux a 1,000377119 (GOOGLc, mesure) -> ACCORD',
  multiplicateurAccorde({ multiplier: GOOGL, uiMultiplier: GOOGL }).etat === 'ACCORD');
ok('et la valeur rendue est celle-la', multiplicateurAccorde({ multiplier: GOOGL, uiMultiplier: GOOGL }).valeur === GOOGL);
/* ⛔⛔ LE CAS QUI COUTERAIT LE PLUS CHER : un split 4:1 vu par un seul accesseur. */
ok('desaccord 1,0 contre 4,0 -> DESACCORD',
  multiplicateurAccorde({ multiplier: N, uiMultiplier: 4n * N }).etat === 'DESACCORD');
ok('un desaccord ne rend AUCUNE valeur, meme pas la plus grande',
  multiplicateurAccorde({ multiplier: N, uiMultiplier: 4n * N }).valeur === null,
  multiplicateurAccorde({ multiplier: N, uiMultiplier: 4n * N }));
ok('un desaccord d UN SEUL wei est un desaccord',
  multiplicateurAccorde({ multiplier: N, uiMultiplier: N + 1n }).etat === 'DESACCORD');
ok('et un desaccord ne s affiche pas',
  afficherEquivalent(multiplicateurAccorde({ multiplier: N, uiMultiplier: 4n * N })) === false);

console.log('');
console.log('une lecture non corroboree est nommee pour ce qu elle est');
ok('ui seul -> SEUL_UI', multiplicateurAccorde({ uiMultiplier: N }).etat === 'SEUL_UI');
ok('legacy seul -> SEUL_LEGACY', multiplicateurAccorde({ multiplier: N }).etat === 'SEUL_LEGACY');
ok('⛔ un accesseur seul ne se fond PAS dans ACCORD',
  multiplicateurAccorde({ uiMultiplier: N }).etat !== 'ACCORD');
ok('aucun des deux -> AUCUNE', multiplicateurAccorde({}).etat === 'AUCUNE');
ok('sans argument du tout -> AUCUNE', multiplicateurAccorde().etat === 'AUCUNE');
ok('et AUCUNE ne s affiche pas', afficherEquivalent(multiplicateurAccorde({})) === false);

console.log('');
console.log('seul un bigint franc compte');
ok('un nombre JS est refuse', multiplicateurAccorde({ multiplier: 1e18, uiMultiplier: 1e18 }).etat === 'AUCUNE',
  multiplicateurAccorde({ multiplier: 1e18, uiMultiplier: 1e18 }));
ok('une chaine est refusee', multiplicateurAccorde({ multiplier: '1000000000000000000' }).etat === 'AUCUNE');
/* ⛔ UN MULTIPLICATEUR NUL DIVISERAIT PAR ZERO EN AVAL. Il est refuse, pas propage. */
ok('zero est refuse', multiplicateurAccorde({ multiplier: 0n, uiMultiplier: 0n }).etat === 'AUCUNE',
  multiplicateurAccorde({ multiplier: 0n, uiMultiplier: 0n }));
ok('negatif est refuse', multiplicateurAccorde({ multiplier: -N, uiMultiplier: -N }).etat === 'AUCUNE');

console.log('');
console.log('la phrase : le cas muet PARLE');
ok('un desaccord avertit explicitement',
  /two different multipliers/.test(phraseMultiplicateur(multiplicateurAccorde({ multiplier: N, uiMultiplier: 4n * N }))),
  phraseMultiplicateur(multiplicateurAccorde({ multiplier: N, uiMultiplier: 4n * N })));
ok('et il dit de verifier chez l emetteur',
  /issuer/.test(phraseMultiplicateur(multiplicateurAccorde({ multiplier: N, uiMultiplier: 4n * N }))));
ok('1,0 dit « une unite = une action »',
  /one unit is one share/.test(phraseMultiplicateur(multiplicateurAccorde({ multiplier: N, uiMultiplier: N }))),
  phraseMultiplicateur(multiplicateurAccorde({ multiplier: N, uiMultiplier: N })));
ok('une valeur chargee dit que ce n est PAS un pour un',
  /not one-to-one/.test(phraseMultiplicateur(multiplicateurAccorde({ multiplier: GOOGL, uiMultiplier: GOOGL }))),
  phraseMultiplicateur(multiplicateurAccorde({ multiplier: GOOGL, uiMultiplier: GOOGL })));
ok('et elle montre le chiffre, pas seulement le mot',
  /1\.000377/.test(phraseMultiplicateur(multiplicateurAccorde({ multiplier: GOOGL, uiMultiplier: GOOGL }))));
ok('une lecture non corroboree le DIT a l ecran',
  /one accessor only/.test(phraseMultiplicateur(multiplicateurAccorde({ uiMultiplier: GOOGL }))),
  phraseMultiplicateur(multiplicateurAccorde({ uiMultiplier: GOOGL })));
ok('un accord ne porte PAS cette mention',
  !/one accessor only/.test(phraseMultiplicateur(multiplicateurAccorde({ multiplier: GOOGL, uiMultiplier: GOOGL }))));
ok('AUCUNE parle aussi', /not read/.test(phraseMultiplicateur(multiplicateurAccorde({}))));
ok('sans argument, la phrase existe quand meme', typeof phraseMultiplicateur() === 'string');

console.log('');
console.log('⛔⛔⛔ SEUL UN ACCORD COMPLET A LE DROIT D ETRE MUET');
/* ⛔ CE BLOC EXISTE PARCE QUE MON SITE D APPEL S EST TROMPE, ET QUE SON SILENCE ETAIT INVISIBLE.
 *   `app.html` calculait `(desaccord || !afficherEquivalent(acc))` — et `afficherEquivalent` rend
 *   VRAI pour ACCORD **comme** pour SEUL_UI/SEUL_LEGACY. Une lecture non corroboree n affichait
 *   donc RIEN : indistinguable d un accord confirme, alors que la phrase portant « one accessor
 *   only » existait deja. Trouve par un audit adversarial, une heure apres l ecriture du module.
 *   ⛔ ET C EST LE CAS FREQUENT : `uiMultiplier()` est l appel RPC SUPPLEMENTAIRE, donc le premier
 *     a sauter sur une limite de debit. Le silence tombait pile ou il fallait parler. */
ok('ACCORD -> muet (le seul cas qui y a droit)',
  doitDireQuelqueChose(multiplicateurAccorde({ multiplier: N, uiMultiplier: N })) === false);
ok('⛔ SEUL_UI -> PARLE', doitDireQuelqueChose(multiplicateurAccorde({ uiMultiplier: N })) === true,
  multiplicateurAccorde({ uiMultiplier: N }));
ok('⛔ SEUL_LEGACY -> PARLE', doitDireQuelqueChose(multiplicateurAccorde({ multiplier: N })) === true);
ok('DESACCORD -> PARLE',
  doitDireQuelqueChose(multiplicateurAccorde({ multiplier: N, uiMultiplier: 4n * N })) === true);
ok('AUCUNE -> PARLE', doitDireQuelqueChose(multiplicateurAccorde({})) === true);
ok('un objet absent -> PARLE (le doute ne se tait pas)', doitDireQuelqueChose(null) === true);
ok('sans argument -> PARLE', doitDireQuelqueChose() === true);
/* ⛔⛔ LA GARDE ANTI-RETOUR : la condition fautive, si elle revenait, rendrait SEUL_UI MUET.
 *   On rejoue donc l ancienne expression et on verifie qu elle DIVERGE de la nouvelle — sinon ce
 *   test passerait meme avec le bug remis. */
ok('⛔ l ancienne condition fautive rendait SEUL_UI muet, la nouvelle non', (() => {
  const acc = multiplicateurAccorde({ uiMultiplier: N });
  const ancienne = (acc.etat === 'DESACCORD' || !afficherEquivalent(acc));
  return ancienne === false && doitDireQuelqueChose(acc) === true;
})());
/* ⛔ ET LE CAS QUI PROTEGE LE SENS INVERSE : la nouvelle regle ne doit pas se mettre a parler sur
 *   un ACCORD, sinon l avertissement deviendrait permanent et cesserait d avertir. */
ok('⛔ elle ne bavarde PAS sur un accord charge (GOOGLc mesure)',
  doitDireQuelqueChose(multiplicateurAccorde({ multiplier: GOOGL, uiMultiplier: GOOGL })) === false);

console.log('');
console.log('les hash de role viennent de la chaine');
ok('les deux roles lus sont distincts', ROLES_LUS.updateUIMultiplier !== ROLES_LUS.batchMint);
ok('ils font 32 octets', ROLES_LUS.updateUIMultiplier.length === 66 && ROLES_LUS.batchMint.length === 66);
ok('l erreur de droits est le selecteur OZ mesure', ERREUR_DROITS === '0xe2517d3f');

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
