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
  /* ⛔ 2026-10-25 : l epingle bouge, et la regle reste. L ACTIF rejoint le block dans l url de retour, pour que le retour
   *   sache QUOI relire dans le wallet au lieu de poser 0,01 ETH fixe. Il sort de `validerDemande` (ETH ou USDC, liste
   *   fermee) : ce n est pas un morceau libre venant du client. Tout AUTRE ajout reste interdit. */
  assert.ok(/\+ \(demande\.retourBlock \? '\?block=' \+ demande\.retourBlock \+ '&actif=' \+ demande\.actif : ''\)/.test(srv),
    'le block (et son actif valide) ne sont plus les SEULS ajouts a l url : tout autre morceau venant du client '
    + 'ouvrirait la porte qu on vient de fermer');
  for (const mauvais of ['EUR', '', 'eth&x=1', 'https://evil.example/']) {
    assert.equal(validerDemande({ adresse: '0x' + 'a'.repeat(40), actif: mauvais }).etat, 'REFUSE',
      'un actif hors liste passerait dans l url de retour : ' + JSON.stringify(mauvais));
  }
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
  /* 2026-10-25 : la fiche du retour est ouverte par `reprendreRetourFiat`, avec le block REVALIDE par `lireRetourFiat`. */
  assert.ok(/void reprendreRetourFiat\(retourFiat\.block, retourFiat\.actif\)/.test(nu) && /await ouvrirProfil\(block, null\)/.test(nu),
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

cas('⛔⛔ le retour REARME l achat — sur ce qui est ARRIVE, pas sur 0,01 ETH fixe', () => {
  /* ⛔⛔ SANS CA LE PARCOURS REPART DE ZERO. Quelqu un qui revient de l onramp voulait un BLOCK : ouvrir la bonne fiche ne
   *     suffit pas, il devrait resaisir un montant.
   *   ⛔⛔ 2026-10-25 — L EPINGLE BOUGE, ET VOICI POURQUOI. Elle exigeait `poserIntent({ … amount: '0.01' })` : un montant
   *     que personne n avait choisi, en ETH meme apres un achat d USDC, et `reprendreIntentApresConnect` cliquait ensuite
   *     « Prepare buy » sans qu un wei soit lu. Le rearmement est maintenant fait par `reprendreRetourFiat`, qui preremplit
   *     le champ Buy avec ce qui est ARRIVE (deux soldes LUS, `verdictArrivee`) et ne clique rien. */
  assert.ok(!/poserIntent\(\{ kind: 'buy', adr: blockRetour/.test(nu), 'le retour pose encore une intention FIXE');
  const i = nu.indexOf('async function reprendreRetourFiat(');
  assert.ok(i > 0, 'le retour ne rearme plus rien : le visiteur devra tout recommencer');
  const m = /\r?\n\}\r?\n/.exec(nu.slice(i));
  const corps = m ? nu.slice(i, i + m.index) : '';
  /* 2026-10-26 (revue adverse) : le montant LU se RETIENT ici et se pose par `garderPrefillFiat`, sous l actif livre seulement
   *   (pose une fois, il etait reste sous l ETH apres un rebatissage de « Pay with »). Le comportement est EXECUTE par
   *   test-retour-fiat-garde-actif-20261026 ; cette epingle garde le fil entre les deux. */
  assert.ok(/montant: montantLisibleFiat\(v\.montant, actif, decUsdc\)/.test(corps) && /garderPrefillFiat\(\)/.test(corps), 'le retour ne preremplit plus le montant LU');
  const g = nu.indexOf('function garderPrefillFiat(');
  const mg = g > 0 ? /\r?\n\}\r?\n/.exec(nu.slice(g)) : null;
  assert.ok(mg && /champ\.value = r\.montant/.test(nu.slice(g, g + mg.index)), 'le garde ne pose plus le montant retenu');
  /* ⛔ ET ON NE PRETEND PAS QUE LES FONDS SONT ARRIVES SANS LES AVOIR LUS : la seule phrase d arrivee est derriere un
   *   verdict calcule sur des soldes lus — `verdictArrivee` — et le cas « pas de repere » le DIT. */
  assert.ok(/verdictArrivee\(\{ avant, maintenant, actif/.test(corps), 'une arrivee serait affirmee sans comparer deux soldes lus');
  assert.ok(/cannot tell whether this purchase has landed yet/.test(corps), 'sans repere d avant, l ecran affirmerait une arrivee qu il ne peut pas savoir');
});

cas('⛔⛔ L INTENTION EST CONSOMMEE AU RETOUR, PAS SEULEMENT ECRITE', () => {
  /* ⛔⛔ LE TROU MESURE LE 2026-09-29. `onramp_retour_block` = 8 — plus que de blocks crees (6) —
   *     et `achat_ok` N EXISTE PAS dans l entonnoir. Simule au navigateur, sans wallet, en 375 px :
   *     le visiteur atterrissait bien sur la bonne fiche et `tb.intent.resume` etait bien ecrit
   *     dans `sessionStorage` — mais L ECRAN N EN DISAIT RIEN. Il venait de payer en fiat, l app
   *     savait exactement ce qu il voulait, et elle affichait une fiche ordinaire : il devait
   *     recliquer « Buy it » et resaisir un montant, donc refaire ce qu il avait deja fait avant de
   *     partir payer. Une valeur ECRITE puis JETEE.
   *   ⛔ `reprendreIntentApresConnect` fait deja tout ce qui manque — fiche + montant prerempli +
   *     panneau Buy ouvert — et n a besoin d AUCUN wallet : elle n etait gardee derriere la
   *     connexion que par son POINT D APPEL.
   * ⚠️ ASSERTION SUR LE TEXTE : elle attrape la SUPPRESSION de la reprise, pas une erreur dedans. */
  /* 2026-10-25 : la reprise est `reprendreRetourFiat` (plus d intention a consommer) ; les gardes d attente la suivent. */
  const i = nu.indexOf("etape('onramp_retour_block')");
  assert.notEqual(i, -1, 'le compteur du retour a disparu');
  assert.ok(/reprendreRetourFiat\s*\(/.test(nu.slice(i, i + 700)),
    'le retour du rail fiat n ouvre plus le panneau d achat : le visiteur qui vient de payer devra '
    + 'de nouveau recliquer Buy et resaisir son montant');
  const j = nu.indexOf('async function reprendreRetourFiat(');
  const bloc = nu.slice(j, j + 900);
  /* ⛔⛔ ET ON ATTEND QUE LE PANNEAU EXISTE AVANT DE CONSOMMER. Ma premiere version consommait a
   *     +1 200 ms : mesure en production (build `retour-fiat-reprend`), `intent_restant` = {} donc
   *     l intention etait bien PRISE, mais `panneau_echange_visible` = false et le montant vide —
   *     `reprendreIntentApresConnect` exige `#pEchange` DEJA visible, et le marche n etait pas lu.
   *     L intention etait donc PERDUE sans rien ouvrir : pire qu avant, ou elle restait dormante.
   *   ⛔ L ATTENTE DOIT ETRE BORNEE : sans borne, un marche illisible laisserait le visiteur devant
   *     une attente muette — la faute de la porte passkey restee « Opening… » 25 secondes. */
  assert.ok(/#pEchange/.test(bloc),
    'le retour ne verifie plus que le panneau d achat EXISTE avant de consommer l intention : '
    + 'elle serait de nouveau prise dans le vide et perdue');
  assert.ok(/essais\s*>=|essais\s*>/.test(bloc),
    'l attente n est plus BORNEE : un marche illisible laisserait le visiteur devant une attente '
    + 'muette, sans geste et sans cause nommee');
  /* ⛔ ET LA FICHE NUE RESTE EN SECOURS : mieux vaut la fiche que rien si la reprise jette. */
  assert.ok(/ouvrirProfil\(block, null\)/.test(bloc) && /peindreMarcheUnreadRetry\(block, null\)/.test(bloc),
    'le secours a disparu : si le marche reste illisible, le visiteur n aurait ni fiche ni geste');
});

assert.equal(n, 8, 'compte de cas inattendu : ' + n);
console.log('ok retour-fiat-sur-le-block — ' + n + ' cas.');
console.log('   Le retour vise le block d ou le clic est parti ; le domaine reste au serveur ; tout');
console.log('   ce qui n est pas une adresse est refuse ; et l URL est nettoyee apres reprise.');
console.log('⚠️ NE PROUVE PAS qu un achat par carte aboutisse ni que des fonds arrivent — rien de');
console.log('   cela n est exerce, et ce rail n a jamais encaisse 1 $.');
