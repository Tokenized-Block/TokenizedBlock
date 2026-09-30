/* test-entonnoir-interne.mjs — NOTRE PROPRE TRAFIC NE DOIT PLUS SE COMPTER COMME UN VISITEUR.
 *
 * ⛔⛔⛔ CE QUI A COUTE, ET C ETAIT LE MEME JOUR. Le 2026-09-30 j ai passe la journee a ouvrir
 *      l app dans un navigateur pour verifier mes deploiements — sans wallet, donc en declenchant
 *      `echange_refus_wallet`, `gm_refus_wallet`, `achat_clic`… L entonnoir affichait
 *      9 `echange_refus_wallet` pour 10 `visite` ce jour-la, et j avais commence a en tirer des
 *      conclusions PRODUIT avant de comprendre que je les avais fabriquees moi-meme.
 *      Un instrument qui compte celui qui le regarde ne mesure plus rien.
 *
 * ⛔⛔ ON SEPARE, ON NE JETTE PAS. Jeter notre trafic cacherait son volume : on ne saurait plus si
 *     un chiffre bas vient des visiteurs ou d un filtre trop large. Deux seaux, les deux publies.
 *
 * ⚠️ BORNE : ce fichier lit le CODE. Il ne prouve pas qu un compteur atterrisse dans le bon seau
 *    en production — c est un aller-retour sur un serveur qui le dit, et je l ai fait a part.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';

const html = sansCommentaires(readFileSync(new URL('./app.html', import.meta.url), 'utf8'), { minRetire: 5000 });
const srv = sansCommentaires(readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8'), { minRetire: 3000 });
let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

cas('⛔⛔⛔ LE CLIENT MARQUE NOTRE TRAFIC, ET LE DRAPEAU SURVIT A LA PAGE', () => {
  /* ⛔⛔ PERSISTANT OU RIEN. Un drapeau qu il faut reposer a chaque verification est un drapeau
   *     qu on oublie — et un oubli repollue la mesure SANS LE DIRE. `sessionStorage` ne suffit
   *     pas : chaque onglet neuf repartirait en « visiteur ». */
  assert.match(html, /localStorage\.setItem\('tb\.interne', '1'\)/,
    'le drapeau interne n est pas persistant : il sera oublie a la prochaine verification');
  assert.match(html, /localStorage\.removeItem\('tb\.interne'\)/, 'on ne peut pas RETIRER le drapeau');
  assert.match(html, /\(INTERNE \? '&i=1' : ''\)/,
    'le beacon ne porte pas la marque : le serveur ne pourra pas separer');
});

cas('⛔⛔⛔ EN NAVIGATION PRIVEE ON COMPTE COMME VISITEUR, JAMAIS L INVERSE', () => {
  /* ⛔⛔ LE SENS DE L ERREUR N EST PAS SYMETRIQUE. Compter un visiteur comme interne le ferait
   *     DISPARAITRE des chiffres qui decident du produit. Compter notre trafic comme visiteur
   *     n est qu une pollution — celle qu on avait deja, et qu on peut voir. On retombe donc
   *     toujours du cote le moins destructeur. */
  const bloc = /const INTERNE = \(\(\) => \{[\s\S]*?\}\)\(\);/.exec(html);
  assert.ok(bloc, '`INTERNE` est introuvable');
  assert.match(bloc[0], /catch \(_\) \{ return false; \}/,
    'un `localStorage` indisponible ne retombe pas sur `false` : un visiteur pourrait devenir interne');
});

cas('⛔⛔⛔ LE SERVEUR SEPARE LES DEUX SEAUX, ET NE JETTE RIEN', () => {
  assert.match(srv, /const interne = q\.get\('i'\) === '1';/, 'le serveur ne lit pas la marque');
  assert.match(srv, /const seau = interne \? entonnoir\.interne : entonnoir\.total;/,
    'notre trafic n est pas dirige vers un second seau');
  assert.match(srv, /const seauJour = interne \? entonnoir\.interneParJour : entonnoir\.parJour;/,
    'le jour par jour ne separe pas notre trafic');
  /* ⛔⛔ ET SURTOUT : ON NE JETTE PAS. Si la marque faisait sortir sans compter, on perdrait le
   *     volume de notre propre trafic — et un chiffre bas deviendrait indiscernable d un filtre
   *     trop large. */
  assert.ok(!/if \(interne\) \{?\s*(return|res\.writeHead)/.test(srv),
    'notre trafic est JETE au lieu d etre compte a part : son volume devient invisible');
});

cas('⛔⛔ LES DEUX SEAUX SONT PUBLIES, AVEC LA BORNE SUR LE PASSE', () => {
  /* ⛔⛔ Ne rendre que `total` laisserait croire qu il est propre depuis toujours. Les journees
   *     d avant sont MELANGEES et ne peuvent plus etre demelees : un chiffre dont on ne dit pas
   *     la borne se lit comme s il n en avait pas. */
  assert.match(srv, /interne: entonnoir\.interne \|\| \{\}/, 'le seau interne n est pas publie');
  assert.match(srv, /interneParJour: entonnoir\.interneParJour \|\| \{\}/, 'le jour par jour interne n est pas publie');
  assert.match(srv, /melangeJusquau: '2026-09-30'/, 'la date de melange n est pas dite');
  assert.match(srv, /cannot be separated after the fact/i, 'la borne ne dit pas que le passe est irrecuperable');
});

cas('⛔⛔ UN FICHIER ECRIT AVANT CE JOUR RESTE LISIBLE', () => {
  /* ⛔⛔ Refuser un fichier a qui manquent les deux cles neuves ferait repartir `depuis` a zero :
   *     onze jours de mesure perdus pour deux cles absentes. On les AJOUTE. */
  assert.match(srv, /x\.interne = x\.interne \|\| \{\};/, 'un ancien fichier d entonnoir serait rejete');
  assert.match(srv, /x\.interneParJour = x\.interneParJour \|\| \{\};/, 'idem pour le jour par jour');
});

console.log('✓ test-entonnoir-interne : ' + n + ' cas');
console.log('   Notre trafic de verification est compte A PART, jamais jete, et le passe melange');
console.log('   est annonce avec sa date. Un instrument qui compte celui qui le regarde ne mesure rien.');
console.log('   ⚠️ NE PROUVE PAS qu un compteur atterrisse dans le bon seau en production.');
