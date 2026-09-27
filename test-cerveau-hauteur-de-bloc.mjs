/* test-cerveau-hauteur-de-bloc.mjs — LE CERVEAU DIT DESORMAIS A QUAND SES FAITS REMONTENT.
 *
 * ⛔⛔ POURQUOI. Mesure du 2026-09-27 : ce cerveau est entierement DETERMINISTE — zero
 *     `Math.random`, zero `Date.now`, zero `performance.now` sur les quatre modules, graine
 *     `keccak256(adresse en minuscules)`, et meme son bruit est seme par `empreinte ^ tick`. Il
 *     porte deja une empreinte d entree dont le commentaire dit « deux personnes rejouent le meme
 *     pas ». La machinerie de rejeu EXISTAIT.
 *     Il manquait LA DATE : `cerveau.js` ne contenait aucune mention de hauteur. Deux personnes qui
 *     rejouent a deux instants lisent une `vie` differente, obtiennent une sortie differente, et
 *     NE PEUVENT PAS DIRE si le desaccord vient d un defaut ou du moment. La verifiabilite etait
 *     vraie en principe et inexercable.
 *
 * ⛔⛔ LA REGLE QUE CE FICHIER DEFEND AVANT TOUT : `bloc` VOYAGE, IL NE CALCULE PAS. Un cerveau dont
 *     l humeur dependrait de la hauteur cesserait d etre comparable d un block a l autre — ce qui
 *     est tout le sens de la taille FIXE du reseau.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : que quelqu un rejoue. Tant que personne ne le fait, « verifiable »
 *   reste une propriete, pas une garantie. Et la hauteur BORNE la fenetre de rejeu, elle ne
 *   l epingle pas : le client fournit la tete qu il connait, pas un `blockTag` fige.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { etatInitial, pas, courant } from './cerveau.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const ADR = '0xb20000000000000000000024c30d3fcb7931272e';
const FAITS = { vie: 1.5, gm: 2, detenteurs: 3, messages: 1 };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const nuApp = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const cer = readFileSync(new URL('./cerveau.js', import.meta.url), 'utf8');

cas('⛔⛔ la hauteur NE CHANGE AUCUN comportement de neurone', () => {
  const e = etatInitial(ADR);
  const sans = pas(e, FAITS);
  const a = pas(e, { ...FAITS, bloc: 51862980 });
  const b = pas(e, { ...FAITS, bloc: 51999999 });
  for (const champ of ['phase', 'spikes', 'gauche_hz', 'droite_hz', 'vitesse', 'virage', 'actifs', 'nourriture']) {
    assert.deepEqual(a.vu[champ], sans.vu[champ], 'la hauteur modifie `' + champ + '` : le cerveau cesserait '
      + 'd etre comparable d un block a l autre');
    assert.deepEqual(b.vu[champ], sans.vu[champ], 'deux hauteurs donnent deux `' + champ + '` differents');
  }
  assert.deepEqual(a.etat.potentiels, sans.etat.potentiels, 'la hauteur entre dans les potentiels');
});

cas('⛔ elle VOYAGE : lisible en sortie, entiere ou `null`', () => {
  assert.equal(pas(etatInitial(ADR), { ...FAITS, bloc: 51862980 }).vu.bloc, 51862980,
    'la hauteur n est plus rendue : un tiers ne sait pas ou relire la chaine');
  assert.equal(pas(etatInitial(ADR), FAITS).vu.bloc, null,
    'une hauteur absente ne rend plus `null` : « non date » doit se dire');
  /* ⛔ ET RIEN D AUTRE QU UN ENTIER POSITIF NE PASSE : un `0`, une chaine ou un flottant se
   *   glisseraient dans l empreinte et donneraient deux empreintes pour la meme lecture. */
  for (const mauvais of [0, -5, 1.5, '51862980', NaN, null, undefined, {}]) {
    assert.equal(courant({ ...FAITS, bloc: mauvais }).bloc, null,
      'accepte comme hauteur : ' + JSON.stringify(mauvais));
  }
});

cas('⛔⛔ un pas SANS hauteur garde EXACTEMENT son ancienne empreinte', () => {
  /* ⛔⛔ C EST LA CONDITION QUI REND CE CORRECTIF SUR : si la hauteur entrait toujours dans
   *     l empreinte, TOUS les pas deja graves en changeraient, et le rejeu d un enregistrement
   *     d hier echouerait sans qu aucun fait n ait bouge. Un correctif de verifiabilite qui casse
   *     la verifiabilite du passe se retourne contre lui-meme.
   *     Le motif suivi est celui que le fichier utilisait deja pour `avecAvant` et `role`. */
  const e = etatInitial(ADR);
  assert.equal(pas(e, FAITS).vu.entree, pas(e, FAITS).vu.entree, 'l empreinte n est plus stable');
  assert.ok(/\.\.\.\(f\.bloc \? \['bloc', f\.bloc\] : \[\]\)/.test(cer),
    'la hauteur entre INCONDITIONNELLEMENT dans l empreinte : tous les pas deja graves changent');
});

cas('⛔⛔ deux hauteurs donnent deux empreintes — sinon le rejeu ne distingue rien', () => {
  const e = etatInitial(ADR);
  const a = pas(e, { ...FAITS, bloc: 51862980 }).vu.entree;
  const b = pas(e, { ...FAITS, bloc: 51862981 }).vu.entree;
  const sans = pas(e, FAITS).vu.entree;
  assert.notEqual(a, b, 'deux lectures a deux hauteurs ont la meme empreinte : un rejeu ne pourrait '
    + 'pas distinguer un desaccord de defaut d un desaccord de moment');
  assert.notEqual(a, sans, 'une lecture datee a la meme empreinte qu une lecture non datee');
});

cas('⛔ l app FOURNIT la hauteur — sinon le champ reste `null` a vie', () => {
  /* ⛔ Le meme piege que les puces calculees : un champ qui existe et que personne n alimente est
   *   un correctif inerte. `entreesCerveau` est le constructeur PARTAGE des trois sites d appel. */
  const i = nuApp.indexOf('function entreesCerveau');
  const bloc = nuApp.slice(i, nuApp.indexOf('function echangesDe', i));
  assert.ok(/bloc: rpcTete && Number\.isInteger\(rpcTete\.n\) && rpcTete\.n > 0 \? rpcTete\.n : null/.test(bloc),
    'l app ne fournit plus la hauteur au cerveau : le champ existerait sans jamais etre rempli');
});

cas('⛔⛔ la hauteur est PUBLIEE la ou le rejeu est promis', () => {
  /* ⛔⛔ DEUX LIGNES DE L ECRAN PROMETTENT LE REJEU : « same wiring and same facts replay the same
   *     beat » et l empreinte de la fiche. Sans la hauteur a cote, elles promettent quelque chose
   *     qu elles ne permettent pas — un lecteur ne sait pas OU relire la chaine. Publier
   *     l empreinte sans la date, c est afficher un sha sans dire de quoi.
   *   ⛔ « as of », PAS « at » : le client fournit la tete qu il connaissait, pas un `blockTag`
   *     fige. « at » laisserait croire a un epinglage qu on ne fait pas. */
  const n2 = (nuApp.match(/as of block ' \+ /g) || []).length;
  assert.equal(n2, 2, 'la hauteur n est plus publiee sur les DEUX surfaces qui promettent le rejeu '
    + '(trouve ' + n2 + ' sur 2)');
  assert.ok(!/at block ' \+ /.test(nuApp),
    'l ecran dit « at block » : ca annonce un epinglage exact, que cette hauteur ne fait pas');
  assert.equal((nuApp.match(/\(undated\)/g) || []).length, 2,
    'l absence de hauteur ne se dit plus sur les deux surfaces : un battement non datable doit le '
    + 'dire, pas laisser un blanc');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok cerveau-hauteur-de-bloc — ' + n + ' cas.');
console.log('   La hauteur VOYAGE sans rien calculer, un pas non date garde son ancienne empreinte,');
console.log('   et deux hauteurs donnent deux empreintes.');
console.log('⚠️ NE PROUVE PAS que quelqu un rejoue, ni que la hauteur EPINGLE la lecture : elle');
console.log('   BORNE la fenetre de rejeu — l epinglage exact demanderait un `blockTag` fige.');
