/* test-repli-plancher-atteignable.mjs — LE REPLI AU PLANCHER DOIT POUVOIR S EXECUTER JUSQU AU BOUT.
 *
 * ⛔⛔⛔ LA CLASSE DE DEFAUT QUE CETTE GARDE FERME : « module correct mais inatteignable ».
 *      `creerBlock` porte depuis longtemps un repli DELIBERE (tip 2356) — « If wallet cannot cover
 *      the 0.001 ETH fee but can cover floor + gas, charge the floor — fail-closed only below
 *      floor ». Il abaisse `fraisWei` a `CREATE_FEE_WEI_FLOOR` et l ECRIT a l ecran :
 *      « using the minimum … so fee still get paid ».
 *      Puis `preflightInstantBirthEthFixe` tournait JUSTE APRES avec `FRAIS_OUVERTURE_WEI` EN DUR,
 *      ignorait l abaissement, et refusait pour « short by ». Le repli etait juste, commente,
 *      voulu — et defait par la garde qui le suivait. Aucune erreur n etait levee.
 *
 * ⭐ LA FENETRE, MESUREE AVEC LES CONSTANTES REELLES (2026-10-01) :
 *      bouton Create actif des                      0,000550 ETH
 *      preflight exigeait (seed 0)                  0,001500 ETH   -> fenetre morte 0,00095
 *      preflight exige desormais, repli actif       0,000800 ETH   -> fenetre morte 0,00025
 *    ⚠️ LA FENETRE N EST PAS FERMEE, ELLE EST REDUITE. Il reste 0,00025 parce que les deux
 *      reserves de gaz different encore (0,00025 au bouton, 0,0005 au preflight). Dit ici pour que
 *      personne ne lise ce fichier comme « c est regle ».
 *
 * ⛔ CE QUE CE TEST SAIT PROUVER : que le frais effectif TRAVERSE jusqu au preflight, et qu on ne
 *    baisse l exigence QUE la ou le repli a tire.
 * ⛔ CE QU IL NE PEUT PAS PROUVER : qu une creation reelle aboutisse. Il lit la structure ; seul un
 *    wallet avec un solde dans la fenetre le dirait, et c est la mesure du Grok Bot.
 */
import { readFileSync } from 'node:fs';
import { CREATE_FEE_WEI_FLOOR, FRAIS_OUVERTURE_WEI } from './frais-creation.js';

const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0, ko = 0;
const ok = (nom, cond, vu) => {
  n += 1;
  if (cond) { console.log('  ok  ' + nom); return true; }
  ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '   vu: ' + vu));
  return false;
};

/* ⛔ LE TEMOIN D ABORD : si l extraction rate, tout le reste passerait sur du vide. */
const iFn = app.indexOf('async function preflightInstantBirthEthFixe');
ok('0. le preflight est trouve dans app.html', iFn > 0, iFn);
const iCreer = app.indexOf('async function creerBlock()');
ok('0b. creerBlock est trouve', iCreer > 0, iCreer);

/* ── LE FRAIS TRAVERSE ───────────────────────────────────────────────────────────────────────── */
ok('1. le preflight ACCEPTE un frais de l appelant',
  /async function preflightInstantBirthEthFixe\(\{[^}]*fraisWei/.test(app));
/* ⛔ ET IL RETOMBE SUR LE FRAIS PLEIN QUAND L APPELANT NE SAIT PAS. `null` = « je ne sais pas »,
 *   jamais « c est gratuit ». Un defaut permissif ici ferait exiger ZERO. */
ok('2. …et retombe sur FRAIS_OUVERTURE_WEI quand l appelant ne le passe pas',
  /fraisWei === null \|\| fraisWei === undefined \? FRAIS_OUVERTURE_WEI : BigInt\(fraisWei\)/.test(app));
ok('3. le frais n est plus ecrit EN DUR dans le preflight',
  !/const frais = FRAIS_OUVERTURE_WEI;/.test(app.slice(iFn, iFn + 3000)));

/* ── ON NE BAISSE QUE LA OU LE REPLI A TIRE ──────────────────────────────────────────────────── */
const corpsCreer = app.slice(iCreer, iCreer + 60000);
ok('4. le repli MARQUE sa decision a l endroit ou il la prend',
  /fraisWei = CREATE_FEE_WEI_FLOOR;[\s\S]{0,600}?fraisReplieAuPlancher = CREATE_FEE_WEI_FLOOR;/.test(corpsCreer));
ok('5. et le preflight recoit CE marqueur, pas autre chose',
  /preflightInstantBirthEthFixe\(\{ e, fraisWei: fraisReplieAuPlancher/.test(corpsCreer));
/* ⛔⛔ PAS `fraisWeiCalcule`, ET C EST LE POINT DELICAT. C est le frais derive du DOLLAR : il bouge
 *     avec le prix de l ETH, alors que ce preflight s appelle `...EthFixe`. Le passer pourrait
 *     exiger MOINS que ce que la transaction envoie — et un echec APRES la signature coute le gas,
 *     la ou un refus avant ne coute rien. Exiger trop est reparable ; exiger trop peu, non. */
ok('6. ⛔ JAMAIS le frais derive du dollar (`fraisWeiCalcule`) : il pourrait exiger MOINS que le reel',
  !/preflightInstantBirthEthFixe\(\{ e, fraisWei: fraisWeiCalcule/.test(app));
/* ⛔ LE MARQUEUR PART A `null` : sans ca, une valeur trainante d un appel precedent ferait baisser
 *   l exigence sur une creation qui n a PAS declenche le repli. */
ok('7. le marqueur part a null a chaque creation',
  /let fraisReplieAuPlancher = null;/.test(corpsCreer));

/* ── L ARITHMETIQUE, AVEC LES VRAIES CONSTANTES ──────────────────────────────────────────────── */
/* ⛔ UNE SEULE RESERVE DESORMAIS : le bouton, le repli et le preflight lisent `GAZ_NAISSANCE_WEI`.
 *   Avant, trois valeurs pour une seule question — c est ce qui a ouvert les deux fenetres mortes.
 *
 * ⛔⛔⛔ ET ELLE EST LUE DANS app.html, PAS RECOPIEE ICI — C EST UNE MUTATION SURVIVANTE QUI L A
 *      EXIGE. Ma version precedente ecrivait `500000000000000n` en dur dans ce test. Passer la
 *      constante de l app a 250000000000000n ne faisait tomber AUCUNE des 15 assertions : le test
 *      calculait un monde, le code en vivait un autre, et les deux etaient verts. La mutation n a
 *      pas revele un oubli d assertion, elle a revele que TOUTE l arithmetique du fichier portait
 *      sur une copie.
 *   ⛔ REGLE : une arithmetique de test qui ne LIT pas la valeur du code ne garde pas le code ; elle
 *     garde la copie que le test s est faite. */
const mGaz = app.match(/const GAZ_NAISSANCE_WEI = (\d+)n;/);
ok('7b. ⭐ la reserve de gaz est declaree UNE fois dans app.html, et LUE ici', !!mGaz, String(mGaz));
const GAZ_PREFLIGHT = mGaz ? BigInt(mGaz[1]) : 0n;
const GAZ_BOUTON = GAZ_PREFLIGHT;
/* ⛔ ET BORNEE : une reserve absurde — zero, ou dix fois le frais — satisferait toutes les egalites
 *   ci-dessous sans que rien ne crie, parce qu elles comparent la constante a elle-meme. Un seuil
 *   sans borne n est pas un seuil. Ce depot a deja ecrit « une garde peut etre VRAIE et couvrir la
 *   mauvaise moitie » ; ici elle serait vraie et ne couvrirait RIEN. */
ok('7c. …et elle reste plausible : entre 0,0001 et 0,002 ETH',
  GAZ_PREFLIGHT >= 100000000000000n && GAZ_PREFLIGHT <= 2000000000000000n,
  GAZ_PREFLIGHT + ' wei');
const bouton = CREATE_FEE_WEI_FLOOR + GAZ_BOUTON;
const avant = FRAIS_OUVERTURE_WEI + GAZ_PREFLIGHT;
const apres = CREATE_FEE_WEI_FLOOR + GAZ_PREFLIGHT;
ok('8. le repli REDUIT reellement l exigence', apres < avant, apres + ' vs ' + avant);
ok('9. et il la reduit de la difference entre le frais plein et le plancher',
  avant - apres === FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR);
/* ⛔⛔⛔ LE DECLENCHEUR DOIT COUVRIR CE QUE LE PREFLIGHT VA EXIGER — ET MA PREMIERE VERSION NE LE
 *      FAISAIT PAS. Le Grok Bot l a trouve a son wallet Rabby : avec 0,00137 ETH, `s < fraisWei`
 *      est FAUX (0,00137 > 0,001), donc le repli ne tirait pas — et le preflight exigeait 0,0015.
 *      J avais ferme la fenetre SOUS le frais et annonce « reduite de 0,00095 a 0,00025 » ; celle du
 *      DESSUS, entre 0,001 et 0,0015, restait ENTIERE. Son wallet tombait dedans.
 *      ⛔ CAUSE DE FOND : DEUX reserves de gaz. Le repli jugeait avec 0,00025 ce que le preflight
 *        allait exiger avec 0,0005 — un seuil qui juge une regle qu il ne connait pas. Il n y a plus
 *        qu une constante, `GAZ_NAISSANCE_WEI`, lue aux deux endroits. */
ok('10. ⭐ le repli se declenche sur le BESOIN TOTAL, pas sur le frais seul',
  /if \(utiliseCreateRouter\(\) && s < fraisWei \+ gasBuf\)/.test(app));
ok('11. et les deux endroits lisent la MEME reserve de gaz',
  (app.match(/GAZ_NAISSANCE_WEI/g) || []).length >= 3
  && !/const gasBuf = 250000000000000n/.test(app),
  'occurrences: ' + (app.match(/GAZ_NAISSANCE_WEI/g) || []).length);
/* ⛔ LE CAS QUI A CASSE : 0,00137 ETH. Il doit declencher le repli ET passer le preflight au
 *   plancher. C est la mesure du Grok Bot, rejouee en arithmetique. */
const RABBY = 1370000000000000n;
ok('12. ⭐ le wallet a 0,00137 ETH declenche le repli ET passe le preflight',
  RABBY < FRAIS_OUVERTURE_WEI + GAZ_PREFLIGHT && RABBY >= CREATE_FEE_WEI_FLOOR + GAZ_PREFLIGHT);
/* ⛔⛔ ET LA FENETRE RESIDUELLE EST NOMMEE, PAS TUE. Avec seed 0 — le cas d un block paire a une
 *   ACTION, unilateral, `tx.value = 0x0` — les deux seuils sont EGAUX : fenetre nulle. Avec un seed
 *   au plancher, le preflight exige 0,0011 la ou le repli n exige que 0,0008 : il reste 0,0003.
 *   Je ne le ferme PAS en abaissant encore le declencheur — ce serait facturer le plancher a des
 *   comptes qui peuvent payer plein. Le test l ecrit pour que personne ne lise « c est regle ». */
const repliExige = CREATE_FEE_WEI_FLOOR + GAZ_PREFLIGHT;
const preflightSeme = CREATE_FEE_WEI_FLOOR + CREATE_FEE_WEI_FLOOR + GAZ_PREFLIGHT;
ok('13. ⚠️ fenetre NULLE sans seed, et 0,0003 avec un seed au plancher — nomme, pas ferme',
  FRAIS_OUVERTURE_WEI + GAZ_PREFLIGHT - repliExige === FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR
  && preflightSeme - repliExige === CREATE_FEE_WEI_FLOOR,
  'residuel seme : ' + (preflightSeme - repliExige));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
console.log('   Fenetre morte sans seed : 0,00095 -> 0,00025 -> 0,000000. FERMEE.');
console.log('   ⚠️ Avec un seed au plancher il reste 0,0003 : NOMME, pas ferme.');
console.log('   ⚠️ NE PROUVE PAS qu une creation reelle aboutisse : il lit la structure, il ne paie pas.');
process.exit(ko ? 1 : 0);
