/* test-puces-paire-calculees.mjs — LES PUCES DE PAIRE NE DOIVENT PLUS ETRE UNE PHOTO D UN JOUR.
 *
 * ⛔⛔ LE DEFAUT. `PAIRES_CHIP_QUICK` etait une constante : `['ETH','AAPLc','GOOGLc','NVDAc','METAc']`.
 *     Son PROPRE commentaire disait « CETTE LISTE EST UNE PHOTO D UN JOUR… a re-mesurer, pas a
 *     graver ». Deux jours plus tard elle etait fausse.
 *     RE-MESURE DU 2026-09-27, `/api/prix-usd` rejoue sur les dix actions du registre :
 *         HUIT ont un prix lisible — AAPLc, GOOGLc, METAc, MSFTc, MSTRc, NVDAc, SNDKc, SPCXc
 *         DEUX non — AMZNc (7 957 $ de liquidite) et TSLAc (623 $), reellement illiquides
 *     Or MSTRc fait 4,9 M$ de volume 24 h et SNDKc 3,0 M$ : LES DEUX PLUS GROS MARCHES DU JEU
 *     etaient exclus des puces par une mesure perimee.
 *
 * ⛔ CE QU ON NE CHANGE PAS, et c est la regle qui compte : une puce ne pousse que vers une action
 *   DONT LE PRIX EST CONNU. Sans prix, l ecran de mise en vie demande une valeur de depart dans une
 *   devise que l app ne sait pas evaluer, et le parcours s arrete la. Les dix restent dans la liste
 *   deroulante : on ne retire aucun choix, on arrete seulement de pousser vers un cul-de-sac.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu une action ait un marche aujourd hui. Il prouve que la liste se
 *   CALCULE au lieu d etre gravee, et qu elle ne peut plus vieillir en silence.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { pairesProposees } from './paires.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const nu = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

cas('⛔⛔ la liste des puces n est plus GRAVEE', () => {
  assert.ok(!/PAIRES_CHIP_QUICK/.test(nu),
    'la constante gravee est revenue : elle redeviendra fausse des qu un marche bougera, et rien '
    + 'ne le dira');
  assert.ok(/function pairesChipQuick\(\)/.test(nu), 'la liste calculee a disparu');
  assert.ok(/htmlChips = pairesChipQuick\(\)/.test(nu),
    'les puces ne sont plus construites depuis la liste calculee');
});

cas('⛔ une puce n apparait QUE si le prix a ete lu', () => {
  /* ⛔ C EST LA REGLE D ORIGINE, ET ELLE EST GARDEE : pousser vers une action sans prix menait a un
   *   cul-de-sac au moment de la mise en vie. On calcule la liste, on n assouplit pas la porte. */
  const i = nu.indexOf('function pairesChipQuick');
  const bloc = nu.slice(i, nu.indexOf('function peindrePaireChips', i));
  assert.ok(/prixUsdDeviseLus\.has\(String\(p\.symbole\)\)/.test(bloc),
    'la porte du prix lu a saute : des puces pousseraient vers des devises que l app ne sait pas '
    + 'evaluer');
  assert.ok(/p\.type === 'ACTION'/.test(bloc), 'le filtre par type d actif a disparu');
  assert.ok(/const out = \['ETH'\]/.test(bloc), 'ETH n est plus garanti dans les puces');
});

cas('⛔⛔ les lectures sont AMORCEES, sinon la liste reste vide a vie', () => {
  /* ⛔⛔ `assurerPrixDevise` n est appelee ailleurs que pour la devise DEJA choisie. Une puce ne
   *     peut pas apparaitre pour une action dont personne n a jamais demande le prix : sans
   *     amorcage, « calculee » voudrait dire « toujours reduite a l ETH ». */
  assert.ok(/function amorcerPrixActions\(\)/.test(nu), 'l amorcage des prix a disparu');
  assert.ok(/amorcerPrixActions\(\);\s*\n\s*peindrePaireChips\(\);/.test(nu),
    'l amorcage n est plus lance avant la peinture des puces');
});

cas('⛔⛔ les puces se REPEIGNENT quand un prix arrive', () => {
  /* ⛔⛔ LES LECTURES SONT ASYNCHRONES : au premier rendu la liste est vide. Sans ce rappel, le
   *     correctif serait juste dans le code et INVISIBLE a l ecran — exactement le defaut inerte
   *     attrape sur la carte quelques heures plus tot le meme jour. */
  const i = nu.indexOf('function assurerPrixDevise');
  const bloc = nu.slice(i, i + 1400);
  assert.ok(/prixUsdDeviseLus\.set\(s, p\);[\s\S]{0,200}peindrePaireChips\(\)/.test(bloc),
    'les puces ne sont plus repeintes a l arrivee d un prix : elles resteraient a ETH seul');
});

cas('⛔ le registre porte bien dix actions — sinon ce test ne mesure rien', () => {
  /* ⛔ TEMOIN : si le registre se vidait, tous les cas ci-dessus passeraient sur une liste vide. */
  const actions = pairesProposees(8453).filter((p) => p.type === 'ACTION');
  assert.ok(actions.length >= 8,
    'le registre ne porte plus que ' + actions.length + ' actions : les puces calculees n auraient '
    + 'presque rien a proposer, et ce fichier ne mesurerait plus le bon defaut');
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok puces-paire-calculees — ' + n + ' cas.');
console.log('   La liste se CALCULE depuis les prix reellement lus, les lectures sont amorcees, et');
console.log('   les puces se repeignent a l arrivee d un prix.');
console.log('⚠️ NE PROUVE PAS qu une action ait un marche aujourd hui — prouve que la liste ne peut');
console.log('   plus vieillir en silence.');
