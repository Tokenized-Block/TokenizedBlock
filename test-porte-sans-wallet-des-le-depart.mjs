/* test-porte-sans-wallet-des-le-depart.mjs — LA SEULE PORTE QUI MARCHE NE DOIT PAS ATTENDRE UN ECHEC.
 *
 * ⛔⛔ LE DEFAUT, MESURE EN PRODUCTION LE 2026-09-27 a 375 px, dans un navigateur ou
 *     `window.ethereum` vaut `undefined`. Positions REELLES relevees a l ecran, pas lues dans le code :
 *         AVANT tout clic    : [Connect wallet] VISIBLE a y=235 · porte Base Account `hidden`
 *         APRES le clic rate : porte Base a y=322 · [Connect wallet] retrograde a y=685
 *     Le reordonnancement livre plus tot le meme jour marche — mais il ne se declenche QU APRES que
 *     le visiteur a tape un bouton qui ne peut pas aboutir.
 *   ⇒ ENTONNOIR SUR 9 JOURS : 351 visites, 37 `wallet_no_provider`, 2 `wallet_connect_ok`,
 *     `wallet_base_clic` = 1. UNE personne a touche la porte praticable.
 *
 * ⛔ ET LA CORRECTION NE FERME AUCUNE PORTE : `Connect wallet` reste present, parce que des
 *   extensions s injectent APRES le chargement. Il est seulement retrograde, et tout revient en
 *   place si un wallet apparait. Cacher le bouton enfermerait celui dont le wallet arrive en retard.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : que quiconque clique. Il prouve qu on a retire une condition — avoir
 *   echoue — qui n avait aucune raison d exister devant la seule issue praticable.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const nu = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

cas('⛔⛔ la porte est decidee AU CHARGEMENT, pas au premier echec', () => {
  assert.ok(/try \{ verifierSansWalletAuChargement\(\); \} catch/.test(nu),
    'la verification au chargement a disparu : la porte redevient invisible tant que le visiteur '
    + 'n a pas tape le bouton qui ne peut pas aboutir');
  assert.ok(/function verifierSansWalletAuChargement\(\)/.test(nu), 'la fonction a disparu');
  assert.ok(/typeof window\.ethereum === 'undefined' \|\| !window\.ethereum\) montrerSansWallet\(true\)/.test(nu),
    'la condition d absence de provider a change : elle doit couvrir `undefined` ET une valeur vide');
});

cas('⛔ on ne ferme AUCUNE porte — Connect reste, il est seulement retrograde', () => {
  /* ⛔ LE DEPOT L ECRIT DEJA : des extensions s injectent APRES le chargement. Cacher le bouton
   *   enfermerait celui dont le wallet arrive en retard. On DEPLACE, on ne supprime pas. */
  const i = nu.indexOf('function verifierSansWalletAuChargement');
  const bloc = nu.slice(i, nu.indexOf('function montrerSansWallet', i));
  assert.ok(!/bConnecterW[^\n]*hidden\s*=\s*true/.test(bloc),
    'le chargement CACHE desormais [Connect wallet] : un wallet qui s injecte en retard laisserait '
    + 'le visiteur sans son bouton');
  assert.ok(/ordonnerSansWallet/.test(nu), 'le reordonnancement a disparu');
});

cas('⛔⛔ une injection TARDIVE remet l ecran d aplomb', () => {
  /* ⛔⛔ SANS CE SECOND REGARD, un visiteur parfaitement equipe garderait un ecran qui lui dit le
   *     contraire — et le prochain vrai refus serait lu comme du decor. C est le meme principe que
   *     le bloc qui se referme quand sa cause disparait. */
  const i = nu.indexOf('function verifierSansWalletAuChargement');
  const bloc = nu.slice(i, nu.indexOf('function montrerSansWallet', i));
  assert.ok(/if \(window\.ethereum && !compte\) montrerSansWallet\(false\)/.test(bloc),
    'la reverification apres injection tardive a disparu : l ecran resterait en mode « sans wallet » '
    + 'devant quelqu un qui en a un');
  assert.ok(/setTimeout\(/.test(bloc), 'la reverification n est plus differee : elle passerait avant l injection');
});

cas('⛔ et elle ne se declenche pas sur quelqu un DEJA connecte', () => {
  /* ⛔ `!compte` : si une session est deja ouverte, rien ne doit bouger. Un ecran qui se reorganise
   *   sous les yeux de quelqu un qui a fini de connecter est un bug, pas une aide. */
  const i = nu.indexOf('function verifierSansWalletAuChargement');
  const bloc = nu.slice(i, nu.indexOf('function montrerSansWallet', i));
  assert.ok(/!compte/.test(bloc), 'la garde `!compte` a disparu de la reverification');
});

assert.equal(n, 4, 'compte de cas inattendu : ' + n);
console.log('ok porte-sans-wallet — ' + n + ' cas.');
console.log('   La porte praticable s affiche des le chargement quand aucun provider n est la ;');
console.log('   Connect reste present ; et une injection tardive remet l ecran d aplomb.');
console.log('⚠️ NE PROUVE PAS que quiconque clique — prouve que la porte cesse d etre invisible');
console.log('   jusqu a ce que le visiteur ait echoue.');
