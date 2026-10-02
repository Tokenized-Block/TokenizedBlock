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
const GAZ_BOUTON = 250000000000000n, GAZ_PREFLIGHT = 500000000000000n;
const bouton = CREATE_FEE_WEI_FLOOR + GAZ_BOUTON;
const avant = FRAIS_OUVERTURE_WEI + GAZ_PREFLIGHT;
const apres = CREATE_FEE_WEI_FLOOR + GAZ_PREFLIGHT;
ok('8. le repli REDUIT reellement l exigence', apres < avant, apres + ' vs ' + avant);
ok('9. et il la reduit de la difference entre le frais plein et le plancher',
  avant - apres === FRAIS_OUVERTURE_WEI - CREATE_FEE_WEI_FLOOR);
/* ⛔⛔ LA FENETRE N EST PAS FERMEE, ET LE TEST LE DIT AU LIEU DE LAISSER CROIRE. Le bouton et le
 *     preflight n ont toujours pas la meme reserve de gaz. Si un jour elles s alignent, cette
 *     assertion tombera — et ce sera une bonne nouvelle a constater, pas un echec. */
ok('10. ⚠️ il RESTE une fenetre morte, et elle vaut la difference des deux reserves de gaz',
  apres - bouton === GAZ_PREFLIGHT - GAZ_BOUTON,
  String(apres - bouton));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
console.log('   Fenetre morte : 0,00095 ETH avant -> 0,00025 ETH apres. REDUITE, pas fermee.');
console.log('   ⚠️ NE PROUVE PAS qu une creation reelle aboutisse : il lit la structure, il ne paie pas.');
process.exit(ko ? 1 : 0);
