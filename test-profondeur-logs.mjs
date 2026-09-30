/* Ce que ce test tient, et le defaut qu il empeche.
 *
 * Le reordonnancement touche TOUTES les lectures de logs de l app. Deux facons de le rater :
 *   1. reordonner sur une profondeur DEVINEE — on deplacerait du trafic vers le noeud qui refuse ;
 *   2. reordonner en PERDANT un noeud — une panne deguisee en optimisation.
 * Les deux ont leurs cas ici, et `ordreNoeuds` porte une garde de conservation.
 */
import {
  PROFONDEUR_SERVIE_MESUREE, PROFONDEUR_REFUSEE_MESUREE, ETATS_PROFONDEUR,
  etatProfondeur, ordreNoeuds, phraseProfondeur,
} from './profondeur-logs.js';

let n = 0, ko = 0;
function ok(nom, cond, vu) {
  n += 1;
  if (cond) { console.log('  ok   ' + nom); return; }
  ko += 1;
  console.log('  KO   ' + nom + (vu === undefined ? '' : '   vu: ' + JSON.stringify(vu)));
}
const hex = (n) => '0x' + n.toString(16);
const TETE = 51996817;   /* tete reelle au moment de la mesure */

console.log('les constantes viennent de la MESURE');
ok('servie = 5000 (derniere profondeur mesuree OK)', PROFONDEUR_SERVIE_MESUREE === 5000);
ok('refusee = 10000 (premiere mesuree KO)', PROFONDEUR_REFUSEE_MESUREE === 10000);
ok('la refusee est bien AU-DELA de la servie', PROFONDEUR_REFUSEE_MESUREE > PROFONDEUR_SERVIE_MESUREE);
ok('les etats sont geles', Object.isFrozen(ETATS_PROFONDEUR));

console.log('etatProfondeur — le cas reel du Brain');
/* Le Brain balaie 60 000 blocs : DOUZE fois le seuil. */
ok('60 000 blocs en arriere -> PROFONDE', (() => {
  const r = etatProfondeur({ fromBlock: hex(TETE - 60000) }, TETE);
  return r.etat === 'PROFONDE' && r.profondeur === 60000;
})(), etatProfondeur({ fromBlock: hex(TETE - 60000) }, TETE));
ok('une fenetre recente (999) -> RECENTE', (() => {
  const r = etatProfondeur({ fromBlock: hex(TETE - 999) }, TETE);
  return r.etat === 'RECENTE' && r.profondeur === 999;
})(), etatProfondeur({ fromBlock: hex(TETE - 999) }, TETE));
console.log('etatProfondeur — la frontiere exacte');
ok('pile au seuil (5000) -> RECENTE (le seuil est SERVI)',
  etatProfondeur({ fromBlock: hex(TETE - 5000) }, TETE).etat === 'RECENTE');
ok('un bloc au-dela (5001) -> PROFONDE',
  etatProfondeur({ fromBlock: hex(TETE - 5001) }, TETE).etat === 'PROFONDE');
ok('profondeur 0 -> RECENTE', etatProfondeur({ fromBlock: hex(TETE) }, TETE).etat === 'RECENTE');

console.log('etatProfondeur — INCONNUE des qu il manque quelque chose');
/* ⛔ Router sur une profondeur devinee enverrait du trafic vers le noeud qui refuse. */
ok('tete absente -> INCONNUE', etatProfondeur({ fromBlock: hex(1) }, null).etat === 'INCONNUE');
ok('tete a 0 -> INCONNUE', etatProfondeur({ fromBlock: hex(1) }, 0).etat === 'INCONNUE');
ok('tete non entiere -> INCONNUE', etatProfondeur({ fromBlock: hex(1) }, 1.5).etat === 'INCONNUE');
ok('params absents -> INCONNUE', etatProfondeur(null, TETE).etat === 'INCONNUE');
ok('fromBlock absent -> INCONNUE', etatProfondeur({}, TETE).etat === 'INCONNUE');
ok('fromBlock = "latest" -> INCONNUE (pas chiffrable)',
  etatProfondeur({ fromBlock: 'latest' }, TETE).etat === 'INCONNUE');
ok('fromBlock non hexa -> INCONNUE', etatProfondeur({ fromBlock: 'abc' }, TETE).etat === 'INCONNUE');
ok('seuil negatif -> INCONNUE', etatProfondeur({ fromBlock: hex(1) }, TETE, -1).etat === 'INCONNUE');
/* ⛔ « earliest » EST le cas le plus profond : le confondre avec une lecture recente
 *   enverrait la plus grosse lecture possible chez le noeud qui refuse. */
ok('fromBlock = "earliest" -> PROFONDE, et pas INCONNUE', (() => {
  const r = etatProfondeur({ fromBlock: 'earliest' }, TETE);
  return r.etat === 'PROFONDE' && r.profondeur === TETE && r.pourquoi === 'EARLIEST';
})(), etatProfondeur({ fromBlock: 'earliest' }, TETE));
ok('fromBlock AU-DELA de la tete -> INCONNUE (erreur d appelant)',
  etatProfondeur({ fromBlock: hex(TETE + 10) }, TETE).etat === 'INCONNUE');
ok('chaque INCONNUE porte un motif', (() => {
  const cas = [etatProfondeur(null, TETE), etatProfondeur({}, TETE), etatProfondeur({ fromBlock: hex(1) }, null)];
  return cas.every((c) => typeof c.pourquoi === 'string' && c.pourquoi.length > 0);
})());

console.log('ordreNoeuds — reordonne, ne RETIRE jamais');
const A = 'https://publicnode', B = 'https://base.org', C = 'https://drpc';
const PROF = etatProfondeur({ fromBlock: hex(TETE - 60000) }, TETE);
const RECENT = etatProfondeur({ fromBlock: hex(TETE - 10) }, TETE);
ok('lecture PROFONDE -> le servant passe DEVANT', (() => {
  const r = ordreNoeuds([A, B, C], PROF, B);
  return r[0] === B;
})(), ordreNoeuds([A, B, C], PROF, B));
/* ⛔ GARDE DE CONSERVATION : perdre un noeud serait une panne deguisee en optimisation. */
ok('aucun noeud PERDU', (() => {
  const r = ordreNoeuds([A, B, C], PROF, B);
  return r.length === 3 && [A, B, C].every((u) => r.includes(u));
})(), ordreNoeuds([A, B, C], PROF, B));
ok('aucun noeud DUPLIQUE', (() => {
  const r = ordreNoeuds([A, B, C], PROF, B);
  return new Set(r).size === r.length;
})());
ok('lecture RECENTE -> ordre INCHANGE', (() => {
  const r = ordreNoeuds([A, B, C], RECENT, B);
  return r[0] === A && r[1] === B && r[2] === C;
})(), ordreNoeuds([A, B, C], RECENT, B));
ok('etat INCONNUE -> ordre INCHANGE', (() => {
  const r = ordreNoeuds([A, B, C], etatProfondeur({}, TETE), B);
  return r[0] === A;
})());
console.log('ordreNoeuds — les refus de reordonner');
/* ⛔ ON N INVENTE PAS UN NOEUD qui n est pas dans la rotation. */
ok('servant ABSENT de la liste -> ordre inchange, et pas d ajout', (() => {
  const r = ordreNoeuds([A, C], PROF, B);
  return r.length === 2 && !r.includes(B) && r[0] === A;
})(), ordreNoeuds([A, C], PROF, B));
ok('servant null -> ordre inchange', ordreNoeuds([A, B], PROF, null)[0] === A);
ok('servant vide -> ordre inchange', ordreNoeuds([A, B], PROF, '')[0] === A);
ok('liste vide -> liste vide', ordreNoeuds([], PROF, B).length === 0);
ok('liste absente -> liste vide', ordreNoeuds(null, PROF, B).length === 0);
ok('les entrees non-chaines sont ecartees', (() => {
  const r = ordreNoeuds([A, null, 42, B], PROF, B);
  return r.length === 2 && r[0] === B && r[1] === A;
})(), ordreNoeuds([A, null, 42, B], PROF, B));
ok('la liste d entree n est pas MUTEE', (() => {
  const src = [A, B, C];
  ordreNoeuds(src, PROF, B);
  return src[0] === A && src.length === 3;
})());
ok('deja en tete -> reste en tete, sans doublon', (() => {
  const r = ordreNoeuds([B, A], PROF, B);
  return r.length === 2 && r[0] === B && r[1] === A;
})(), ordreNoeuds([B, A], PROF, B));

console.log('phraseProfondeur');
ok('null PARLE', phraseProfondeur(null).length > 0);
ok('etat inconnu PARLE', phraseProfondeur({ etat: 'PIZZA' }).length > 0);
ok('INCONNUE dit qu on NE TOUCHE PAS a l ordre', (() => {
  const s = phraseProfondeur(etatProfondeur({}, TETE));
  return /left untouched/i.test(s) && /FROMBLOCK_NON_CHIFFRABLE/.test(s);
})(), phraseProfondeur(etatProfondeur({}, TETE)));
ok('PROFONDE porte la profondeur ET le seuil mesure', (() => {
  const s = phraseProfondeur(PROF);
  return /60000/.test(s) && /5000/.test(s) && /measured as served/i.test(s);
})(), phraseProfondeur(PROF));
ok('RECENTE porte la profondeur', /10 blocks back/.test(phraseProfondeur(RECENT)));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
if (ko) process.exit(1);
