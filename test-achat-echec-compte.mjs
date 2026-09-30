/* test-achat-echec-compte.mjs — UN ACHAT SIGNE QUI ECHOUE DOIT SE VOIR.
 *
 * ⛔⛔⛔ LE TROU QUE CE FICHIER FERME, ET IL CACHAIT DE L ARGENT. Un visiteur qui SIGNE un achat et
 *      dont la transaction n aboutit pas n etait compte NULLE PART : `achat_sign_propos` partait,
 *      puis plus rien. Dans l entonnoir, c etait EXACTEMENT la meme trace qu un onglet ferme.
 *      Un client perdu et un frais non pris, tous les deux invisibles — et on ne repare pas ce
 *      qu on ne voit pas.
 *
 * ⛔⛔ ET LE REFUS DE L UTILISATEUR RESTE SEPARE. Le confondre avec un echec de la chaine
 *     melangerait « il a dit non » (probleme de PRODUIT) et « ca n a pas marche » (probleme
 *     TECHNIQUE) derriere un seul chiffre. Deux causes opposees, deux decisions opposees.
 *
 * ⛔ CE FICHIER NE REDEFINIT RIEN. `achat` et `achat_ok` gardent leur sens : les toucher rendrait
 *   l historique d avant incomparable avec celui d apres. On AJOUTE une ligne.
 *
 * ⚠️ BORNE : ce fichier lit le CODE. Il ne prouve pas qu un compteur monte en production, ni que
 *    `/api/etape` accepte le nom — c est la liste blanche du serveur qui le dit, et elle est
 *    verifiee ici aussi, parce qu un nom hors liste est AVALE EN SILENCE.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';

const brut = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const html = sansCommentaires(brut, { minRetire: 5000 });
const srv = sansCommentaires(readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8'), { minRetire: 3000 });
let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

cas('⛔⛔⛔ LE NOM EST DANS LA LISTE BLANCHE, SINON IL EST AVALE EN SILENCE', () => {
  /* ⛔⛔ `/api/etape` REJETTE SANS BRUIT tout nom hors `ETAPES_ENTONNOIR`. Un compteur emis mais
   *     non liste ne monte jamais, et son zero se lit comme « ca n arrive pas » — le pire des
   *     resultats, parce qu il est CREDIBLE. C est deja arrive dans ce depot. */
  assert.match(srv, /'achat_echec'/, '`achat_echec` est absent de la liste blanche : il sera avale');
  /* temoin positif : un nom dont on SAIT qu il compte est bien la */
  assert.match(srv, /'achat_ok'/, 'temoin positif absent : ce test ne discrimine rien');
});

cas('⛔⛔⛔ LES DEUX CHEMINS D ACHAT LE COMPTENT — UN JUMEAU RATE LAISSE LA MOITIE AVEUGLE', () => {
  /* ⛔⛔ CE DEPOT A DEJA PAYE CA : un correctif pose d un seul cote, et un chemin qui encaisse
   *     encore des jetons invendables pendant que l autre est propre. Les DEUX ecrans d achat
   *     doivent compter avec le MEME vocabulaire, sinon on ne peut pas dire lequel convertit. */
  const occurrences = (html.match(/etape\('achat_echec'\)/g) || []).length;
  assert.ok(occurrences >= 2,
    'seulement ' + occurrences + ' site(s) comptent `achat_echec` : le chemin en lot ou le chemin '
    + 'sequentiel reste aveugle aux achats qui echouent');
});

cas('⛔⛔⛔ LE REFUS DE L UTILISATEUR N EST PAS COMPTE COMME UN ECHEC', () => {
  /* ⛔⛔ LA GARDE CENTRALE. Si `achat_echec` tombait aussi sur `REFUSE_PAR_UTILISATEUR`, le chiffre
   *     melangerait un probleme de PRODUIT (il n a pas voulu) et un probleme TECHNIQUE (ca a
   *     casse) — et on optimiserait le mauvais. Les deux branches doivent etre EXCLUSIVES. */
  /* chemin sequentiel : `else if` apres la branche du refus */
  assert.match(html, /REFUSE_PAR_UTILISATEUR'\) \{ try \{ etape\('achat_sign_refus'\); \} catch \(_\) \{\} \}\s*else if \(env\.etat !== 'CONFIRME'\) \{ try \{ etape\('achat_echec'\)/,
    'chemin sequentiel : `achat_echec` n est pas EXCLUSIF du refus utilisateur');
  /* chemin en lot : `else` apres la branche du refus */
  assert.match(html, /lot\.etat === 'REFUSE_PAR_UTILISATEUR'\) \{ try \{ etape\('achat_sign_refus'\); \} catch \(_\) \{\} \}\s*else \{ try \{ etape\('achat_echec'\)/,
    'chemin en lot : `achat_echec` n est pas EXCLUSIF du refus utilisateur');
});

cas('⛔⛔ `achat` ET `achat_ok` NE SONT PAS REDEFINIS', () => {
  /* ⛔⛔ Les toucher rendrait l historique d avant incomparable avec celui d apres — et ce depot a
   *     deja lu un chiffre perime comme un chiffre frais. On ajoute, on ne reecrit pas.
   *   ⚠️ ET ON DIT CE QU ILS SONT VRAIMENT : ils partent ENSEMBLE, depuis la meme branche de
   *     succes. Leur difference ne peut donc RIEN signifier — j ai lu « 2 signes, 0 aboutis »
   *     dans cet ecart le 2026-09-30, et c etait faux : `achat_ok` avait simplement ete cable
   *     APRES les deux achats du 2026-09-22. Une paire de compteurs impossible se lit quand meme. */
  const paires = (html.match(/etape\('achat'\); \} catch \(_\) \{\}\s*try \{ etape\('achat_ok'\)/g) || []).length;
  assert.ok(paires >= 2, 'les deux compteurs de succes ne partent plus ensemble sur les deux chemins');
});

console.log('✓ test-achat-echec-compte : ' + n + ' cas');
console.log('   Un achat signe qui echoue se compte desormais — sur les DEUX chemins, et sans etre');
console.log('   confondu avec un refus de l utilisateur.');
console.log('   ⚠️ NE PROUVE PAS qu un compteur monte en production : ce fichier lit le CODE.');
