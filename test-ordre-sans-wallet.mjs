/* test-ordre-sans-wallet.mjs — LE CHEMIN QUI MARCHE DOIT VENIR AVANT CELUI QUI NE PEUT PAS.
 *
 * ⛔⛔ CE QUI L A DECIDE EST UNE MESURE, PAS UN AVIS. Releve du premier ecran en production, 375 px,
 *     `window.ethereum` retire (2026-09-27) :
 *         y=235  [Connect wallet]                         <- le bouton qui NE PEUT PAS aboutir
 *         y=293  « No wallet found... Open this page from inside your wallet app »
 *         y=381  [Create a Base Account — no app needed]   <- la seule porte qui marche
 *     Un visiteur sans wallet voyait D ABORD l action impossible, puis un refus qui lui demandait
 *     le chemin LE PLUS DUR, et seulement 88 px plus bas le chemin facile.
 *
 * ⛔⛔ L ENTONNOIR DIT LE RESTE. 2026-09-26 : 24 visites, 29 `wallet_no_provider`, 2
 *     `wallet_connect_ok`, 1 `wallet_base_clic`, et ZERO ouverture de deeplink. Un bouton qui
 *     echoue et qui reste le plus visible SE FAIT RETAPER — c est ce que « 29 pour 24 » raconte.
 *     ⚠️ BORNE : ce compteur n est PAS dedoublonne par session (le code le dit). 29 peut etre trois
 *       personnes qui tapent dix fois. Ca ne change pas le diagnostic, ca change son ampleur — et
 *       ca doit etre dit plutot que d ecrire « 29 personnes ».
 *
 * ⛔ ON NE CACHE PAS LE BOUTON, ET CE TEST L EXIGE. Le depot a une raison ECRITE de le garder :
 *   certaines extensions s injectent APRES le chargement, et cacher le bouton enfermerait celui
 *   dont le wallet arrive en retard. On le DEPLACE et on le DEMOTE ; aucune porte n est fermee.
 *
 * ⚠️ CE QUE CE TEST NE PROUVE PAS : les positions a l ecran. Ce depot n a pas de DOM de test — il
 *   lit la source. L ordre REEL se mesure en navigateur, et il l a ete avant ET apres.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

let n = 0;
const v = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');

/* ⛔ extraction par EQUILIBRAGE D ACCOLADES, pas par fenetre de N caracteres : une fenetre fixe se
 *   met a mesurer la fonction suivante des que le fichier grossit, et devient verte sur elle. */
function corpsDe(nom) {
  const i = app.indexOf(nom);
  assert.notEqual(i, -1, 'fonction introuvable dans app.html : ' + nom);
  const debut = app.indexOf('{', i);
  let p = 0;
  for (let k = debut; k < app.length; k++) {
    if (app[k] === '{') p++;
    else if (app[k] === '}') { p--; if (p === 0) return app.slice(debut, k + 1); }
  }
  assert.fail('accolades non equilibrees pour ' + nom);
}

v('⛔ le reordonnancement existe et il est APPELE', () => {
  /* ⛔ UNE FONCTION QUE PERSONNE N APPELLE EST INERTE — le depot s est deja fait avoir par
   *   `sansNaviguer`, present et jamais passe. Ecrire la fonction ne suffit pas. */
  assert.ok(/function ordonnerSansWallet\(/.test(app), 'le reordonnancement a disparu');
  const m = corpsDe('function montrerSansWallet');
  assert.ok(/ordonnerSansWallet\(!!sans\)/.test(m),
    '`montrerSansWallet` n appelle plus le reordonnancement : il serait inerte');
});

v('⛔⛔ le bouton n est JAMAIS cache — les extensions tardives resteraient dehors', () => {
  /* ⛔⛔ LE PIEGE EVIDENT ET FAUX. « Le bouton ne marche pas, cachons-le » enfermerait celui dont
   *     l extension s injecte APRES le chargement — un cas reel, ecrit dans le depot avant moi.
   *     On corrige l ORDRE, pas la presence. */
  const o = corpsDe('function ordonnerSansWallet');
  assert.ok(!/bouton\.hidden\s*=\s*true/.test(o), 'le bouton est cache : un wallet tardif serait enferme');
  assert.ok(!/bouton\.style\.display\s*=\s*'none'/.test(o), 'le bouton est masque par style');
  assert.ok(!/bouton\.remove\(\)/.test(o), 'le bouton est retire du DOM');
  /* il est DEMOTE, pas supprime */
  assert.ok(/bouton\.className = 'bouton sec'/.test(o),
    'le bouton n est plus demote : il resterait l action la plus visible alors qu elle ne peut pas aboutir');
});

v('⛔ le reordonnancement est IDEMPOTENT', () => {
  /* ⛔ CETTE FONCTION PASSE A CHAQUE REFUS. Deplacer sans verifier reordonnerait le DOM a chaque
   *   appel — du travail pour rien, et un point de scintillement a l ecran. */
  const o = corpsDe('function ordonnerSansWallet');
  assert.ok(/compareDocumentPosition/.test(o),
    'la position n est plus verifiee avant deplacement : le DOM bougerait a chaque refus');
});

v('⛔ il est REVERSIBLE : un wallet qui arrive remet l ordre d origine', () => {
  /* ⛔ UN ECRAN QUI GARDE LA FORME D UN REFUS APRES LA FIN DU REFUS devient du bruit, et le
   *   prochain vrai refus sera lu comme du decor. */
  const o = corpsDe('function ordonnerSansWallet');
  assert.ok(/} else if \(boutonApres\) \{/.test(o), 'aucune branche de retour a l ordre normal');
  assert.ok(/bouton\.className = 'bouton';/.test(o), 'le bouton ne retrouve pas son rang normal');
});

v('⛔ la porte passkey et les deux liens existent toujours dans le bloc', () => {
  /* ⛔ REORDONNER NE DOIT RIEN SUPPRIMER. Les trois sorties restent : la porte sans application,
   *   les deux deeplinks, et le lien en clair a copier. */
  for (const id of ['wSansWallet', 'wOuvrirCbw', 'wOuvrirMm', 'wCopierLien', 'wSansWalletUrl']) {
    assert.ok(app.includes('id="' + id + '"'), 'element perdu dans le reordonnancement : ' + id);
  }
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok ordre-sans-wallet — ' + n + ' cas.');
console.log('   Le chemin QUI MARCHE passe devant celui qui ne peut pas aboutir, et le bouton reste');
console.log('   present pour les extensions tardives — deplace et demote, jamais cache.');
console.log('⚠️ NE PROUVE PAS les positions a l ecran : ce depot n a pas de DOM de test. L ordre reel');
console.log('   se mesure en navigateur, a 375 px, `window.ethereum` retire.');
