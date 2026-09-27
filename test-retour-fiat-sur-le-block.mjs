/* test-retour-fiat-sur-le-block.mjs — LE PARCOURS « FIAT -> BLOCK » DOIT REVENIR SUR LE BLOCK.
 *
 * ⛔⛔ LE DEFAUT, MESURE LE 2026-09-27. Le rail fiat MARCHE : `/api/onramp/session` rend un vrai
 *     jeton Coinbase (`pret: true`, verifie en production le jour meme). Mais son `redirectUrl`
 *     etait code en dur sur `https://tokenizedblock.space/` — la page d accueil.
 *     Quelqu un qui finance depuis l ecran d un block revenait donc SUR RIEN, et devait le
 *     retrouver a la main. Le rail marchait ; le PARCOURS s arretait la.
 *
 * ⛔⛔ ET L INTENTION NE POUVAIT PAS COMBLER LE TROU, ce qui n est pas evident : `poserIntent`
 *     ecrit dans `sessionStorage`, et l onramp s ouvre dans un NOUVEL onglet `noopener` — dont le
 *     stockage est VIERGE. Le seul support qui traverse un aller-retour inter-onglets est l URL.
 *
 * ⛔⛔ ET C EST UN PARAMETRE DE REDIRECTION. Le domaine de retour reste decide par le SERVEUR ; on
 *     n accepte du client qu une adresse de block, validee. Reflechir une url fournie par
 *     l appelant serait un open-redirect sur un ecran qui parle d argent.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un achat par carte aboutisse, ni que des fonds arrivent. Rien de
 *   cela n est exerce, et 0 $ n a jamais ete encaisse par ce rail. Il prouve que le retour vise le
 *   bon block, et qu aucun hote etranger ne peut s y glisser.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { validerDemande } from './onramp-session.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const BLOC = '0xb20000000000000000000066242d4067724cb7a1';

cas('⛔ un block valide est accepte et NORMALISE', () => {
  /* ⛔ ON MET EN MAJUSCULES LA PARTIE HEX SEULEMENT. Ma premiere version faisait `BLOC.toUpperCase()`,
   *   ce qui produit `0X…` — refuse a juste titre par la regex. Le fixture etait faux, pas le code ;
   *   j ai failli « corriger » une garde saine pour faire passer mon propre test. */
  const r = validerDemande({ adresse: '0x' + 'a'.repeat(40), retourBlock: '0x' + BLOC.slice(2).toUpperCase() });
  assert.equal(r.etat, 'OK');
  assert.equal(r.retourBlock, BLOC, 'le block de retour n est plus normalise en minuscules');
});

cas('⛔ ABSENT reste ABSENT — on n invente pas de destination', () => {
  /* ⛔ Sans block ouvert, le retour doit rester l accueil : exactement le comportement d avant.
   *   Un defaut invente enverrait les gens sur un block qu ils n ont pas demande. */
  const r = validerDemande({ adresse: '0x' + 'a'.repeat(40) });
  assert.equal(r.etat, 'OK');
  assert.equal(r.retourBlock, null, 'un block absent ne rend plus `null`');
});

cas('⛔⛔ tout ce qui n est pas une adresse est REFUSE', () => {
  /* ⛔⛔ C EST LA GARDE D OPEN-REDIRECT. Chacune de ces valeurs, reflechie dans une url de retour,
   *     enverrait quelqu un ailleurs depuis un ecran qui parle d argent. */
  for (const mauvais of ['https://evil.example/', '//evil.example', '0x123', '', 'javascript:alert(1)',
    BLOC + '@evil.example', '0x' + 'z'.repeat(40)]) {
    const r = validerDemande({ adresse: '0x' + 'a'.repeat(40), retourBlock: mauvais });
    assert.equal(r.etat, 'REFUSE', 'accepte comme block de retour : ' + JSON.stringify(mauvais));
  }
});

cas('⛔⛔ le DOMAINE de retour est decide par le serveur, jamais par l appelant', () => {
  assert.ok(/const retour = 'https:\/\/tokenizedblock\.space\/'/.test(srv),
    'le domaine de retour n est plus une constante du serveur : s il vient de la requete, c est '
    + 'un open-redirect');
  assert.ok(/\+ \(demande\.retourBlock \? '\?block=' \+ demande\.retourBlock : ''\)/.test(srv),
    'le block de retour n est plus le SEUL ajout a l url : tout autre morceau venant du client '
    + 'ouvrirait la porte qu on vient de fermer');
});

cas('⛔ le client emporte le block ouvert, et seulement s il y en a un', () => {
  assert.ok(/\+ qBlock, \{ signal: stop\.signal \}/.test(nu),
    'la requete de session n emporte plus le block : le retour repartira sur l accueil');
  assert.ok(/\/\^0x\[0-9a-fA-F\]\{40\}\$\/\.test\(String\(blockOuvert\)\)/.test(nu),
    'le block emporte n est plus valide cote client avant d etre mis dans l url');
});

cas('⛔⛔ au retour, la fiche se rouvre — et l URL est NETTOYEE', () => {
  assert.ok(/const blockRetour = String\(paramsLien\.get\('block'\) \|\| ''\)/.test(nu),
    'le parametre de retour n est plus lu au chargement : le voyage se perd a l arrivee');
  assert.ok(/ouvrirProfil\(blockRetour\.toLowerCase\(\)/.test(nu),
    'le block de retour n ouvre plus son profil');
  /* ⛔ SANS LE NETTOYAGE, un rechargement ou un lien partage rouvriraient la fiche indefiniment —
   *   et le parametre survivrait a un partage, ce qui n a aucun sens pour un retour de paiement. */
  assert.ok(/history\.replaceState\(null, '', location\.pathname \+ location\.hash\)/.test(nu),
    'l URL n est plus nettoyee apres reprise : un rechargement rouvrirait la fiche sans fin');
  /* ⛔ ET IL EST REVALIDE A L ARRIVEE, meme si le serveur l a deja valide : il a traverse un tiers. */
  assert.ok(/\/\^0x\[0-9a-fA-F\]\{40\}\$\/\.test\(blockRetour\)/.test(nu),
    'le parametre d URL n est plus revalide a l arrivee : une valeur ayant traverse Coinbase '
    + 'entrerait telle quelle');
});

assert.equal(n, 6, 'compte de cas inattendu : ' + n);
console.log('ok retour-fiat-sur-le-block — ' + n + ' cas.');
console.log('   Le retour vise le block d ou le clic est parti ; le domaine reste au serveur ; tout');
console.log('   ce qui n est pas une adresse est refuse ; et l URL est nettoyee apres reprise.');
console.log('⚠️ NE PROUVE PAS qu un achat par carte aboutisse ni que des fonds arrivent — rien de');
console.log('   cela n est exerce, et ce rail n a jamais encaisse 1 $.');
