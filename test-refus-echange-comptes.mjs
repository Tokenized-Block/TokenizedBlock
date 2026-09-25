/* test-refus-echange-comptes.mjs — LE CHEMIN QUI RAPPORTE NE DOIT PAS REFUSER EN SILENCE.
 *
 * ⛔⛔ CE QUI A ETE MESURE, 2026-09-25, par balayage des 317 fonctions de app.html
 *     (`mesure-refus-muets.mjs`) : `preparerEchange` etait PREMIERE du classement des refus annonces
 *     et non comptes — DIX sites. Et ils tombaient TOUS avant `etape('achat_prepare')`.
 *     Consequence : `achat_prepare` = 0 dans l entonnoir ne disait pas si personne n avait essaye
 *     d acheter, ou si on avait dit non a tout le monde. Les frais viennent des TRADES, pas des
 *     creations : c etait le chemin le plus cher a laisser aveugle.
 *
 * ⛔⛔ DEUX DE CES REFUS SE TIENNENT ENTRE UN TRADE ET NOTRE REVENU : ils refusent d offrir Sign
 *     quand les 0,5 % vers FEE_WALLET manquent du resume, ou quand le calldata ne nomme pas
 *     FEE_WALLET. Refuser est le bon choix. Ne pas le compter signifiait qu un echange perdu pour
 *     cette raison etait indistinguable d un echange qui n a jamais ete tente.
 *
 * ⛔ PREFIXE `echange_` ET NON `achat_` : la fonction sert l ACHAT ET LA VENTE, avec des causes
 *   identiques. `achat_prepare` / `achat_ok` restent propres a l achat ; ces refus-la non.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que les compteurs comptent la bonne chose, ni qu un seul de ces
 *   refus se produise en vrai. La frequence se lit dans `/api/entonnoir` et nulle part ailleurs —
 *   et aujourd hui l entonnoir montre `achat` = 2 depuis le 2026-09-19.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');

/** Corps de fonction borne par equilibrage d accolades — jamais par un nombre de lignes. */
function corpsDe(nom) {
  const d = html.indexOf('async function ' + nom + '(');
  assert.ok(d > 0, nom + ' est introuvable : ce test ne garde plus rien');
  let prof = 0, texte = null;
  for (let i = html.indexOf('{', d); i < html.length; i++) {
    const c = html[i];
    if (texte) { if (c === texte && html[i - 1] !== '\\') texte = null; continue; }
    if (c === '"' || c === "'" || c === '`') { texte = c; continue; }
    if (c === '{') prof++;
    else if (c === '}' && !--prof) return html.slice(d, i + 1);
  }
  assert.fail('les accolades de ' + nom + ' ne s equilibrent pas');
}

const corps = corpsDe('preparerEchange');

/* ⛔ ONZE NOMS, ENSEMBLE CLOS. Les paires qui se ressemblent a l ecran et s opposent dans la cause
 *   sont volontairement separees — c est tout l interet de la mesure. */
const NOMS = [
  'echange_refus_marche_illisible', 'echange_refus_pas_de_pool', 'echange_refus_frais_pool',
  'echange_refus_wallet', 'echange_refus_montant', 'echange_refus_hors_app',
  'echange_refus_prix', 'echange_refus_pool', 'echange_refus_plan',
  'echange_refus_frais_resume', 'echange_refus_frais_calldata',
];

let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('⛔⛔ les deux gardes du revenu sont comptees', () => {
  /* ⛔⛔ LE CAS CENTRAL. Sans ces deux compteurs, un echange refuse parce que nos 0,5 % manquaient
   *     ressemblait a un echange que personne n a tente. C est la difference entre « le produit
   *     n interesse pas » et « notre planificateur perd la commission ». */
  assert.ok(corps.includes("etape('echange_refus_frais_resume')"),
    'le refus « les 0,5 % manquent du resume » est redevenu muet');
  assert.ok(corps.includes("etape('echange_refus_frais_calldata')"),
    'le refus « le calldata ne nomme pas FEE_WALLET » est redevenu muet');
});

v('⛔ les deux gardes du revenu gardent des compteurs DISTINCTS', () => {
  /* ⛔ Elles affichent la MEME phrase a l ecran. Un compteur commun rendrait impossible de savoir
   *   laquelle a parle — le resume ou les octets — donc ou chercher le defaut. */
  assert.notEqual('echange_refus_frais_resume', 'echange_refus_frais_calldata');
  const r = corps.indexOf("etape('echange_refus_frais_resume')");
  const c = corps.indexOf("etape('echange_refus_frais_calldata')");
  assert.ok(r > 0 && c > 0 && r !== c, 'les deux gardes partagent un compteur');
  assert.ok(r < c, 'l ordre des deux gardes a change : verifier que chacune garde encore sa moitie');
});

v('⛔⛔ « lecture ratee » et « rien a lire » ne partagent pas de compteur', () => {
  /* ⛔⛔ `absence-of-evidence-vs-failure-to-look`, et la branche les melangeait deja a l ecran :
   *     « Market unread » et « No TB-readable pool yet » sortent du MEME `if`. Reseau d un cote,
   *     lancement de l autre — un compteur commun les rendrait indiscernables au moment precis ou
   *     la difference decide de la reparation. */
  assert.match(corps, /etape\(pasLu \? 'echange_refus_marche_illisible' : 'echange_refus_pas_de_pool'\)/,
    'les deux causes de la premiere porte ne sont plus distinguees');
  /* meme exigence pour la paire prix / pool : mesure ratee vs reponse du marche */
  assert.ok(corps.includes("etape('echange_refus_prix')") && corps.includes("etape('echange_refus_pool')"),
    'la paire prix (lecture ratee) / pool (la pool a repondu non) n est plus distinguee');
});

v('⛔ le refus DELIBERE des pools a plus de 5 % est compte', () => {
  /* ⛔ Celui-la n est pas une panne : c est notre choix, appuye sur 13 506 echanges mesures. Un refus
   *   volontaire non mesure est une decision dont on ne connaitra jamais le prix. */
  assert.ok(corps.includes("etape('echange_refus_frais_pool')"), 'le refus au-dela de 5 % est muet');
});

v('⛔ le mur des autres apps est compte', () => {
  /* ⛔⛔ Mesure du 2026-09-17 : 0 des 56 blocks du Trending achetables ici, leur hook n acceptant que
   *     le routeur de leur propre app. Si ce compteur domine, le defaut n est pas dans ce chemin —
   *     c est que nos ecrans proposent des blocks que personne ne peut acheter chez nous. */
  assert.ok(corps.includes("etape('echange_refus_hors_app')"), 'le mur des autres apps est muet');
});

v('les onze noms sont cables dans la fonction', () => {
  for (const nom of NOMS) {
    assert.ok(corps.includes("'" + nom + "'"), 'refus non instrumente : ' + nom);
  }
});

v('⛔ aucun compteur ne peut faire tomber la preparation d un echange', () => {
  /* ⛔⛔ Une statistique qui jette casserait la fonction qu elle observe — on aurait perdu un trade
   *     pour une mesure. Chaque appel ajoute est en try/catch. */
  for (const m of corps.matchAll(/etape\((?:pasLu \? )?'echange_refus_[a-z_]+'/g)) {
    const autour = corps.slice(Math.max(0, m.index - 70), m.index + 160);
    assert.match(autour, /try \{[^}]*etape\(/, 'compteur de refus hors try/catch : ' + m[0]);
  }
});

v('⛔ la liste blanche du serveur connait les onze', () => {
  /* ⛔⛔ Sinon ils sont jetes SANS ERREUR : `/api/etape` rend 204 dans les deux cas. Verifie en
   *     production le 2026-09-25 — un nom inconnu recoit 204 et n apparait jamais dans l entonnoir. */
  for (const nom of NOMS) {
    assert.ok(srv.includes("'" + nom + "'"),
      nom + ' manque dans ETAPES_ENTONNOIR : le serveur le jettera sans rien dire');
  }
});

v('⛔ les jumeaux d autres chemins ne sont PAS comptes sous ces noms', () => {
  /* ⛔⛔ `single-and-batch-twins-diverge` a l envers : `retirerPosition` et `preparerEthUsdc`
   *     affichent la MEME phrase « Nothing to sign: … ». Les compter sous `echange_refus_plan`
   *     melangerait un achat, un retrait de liquidite et une sortie en USDC — trois reparations
   *     differentes dans un seul chiffre. Ils restent non instrumentes, et c est ECRIT, pas oublie. */
  for (const autre of ['retirerPosition', 'preparerEthUsdc']) {
    const c = corpsDe(autre);
    for (const nom of NOMS) {
      assert.ok(!c.includes("'" + nom + "'"),
        autre + ' compte maintenant ' + nom + ' : un autre chemin entre dans le meme chiffre');
    }
  }
});

assert.equal(n, 9, 'compte de cas inattendu : ' + n);
console.log('ok refus-echange-comptes — ' + n + ' cas : 10 refus muets -> 0 sur le chemin qui');
console.log('   rapporte, dont les DEUX gardes du 0,5 % vers FEE_WALLET, comptees separement.');
console.log('⚠️ NE PROUVE PAS qu un seul de ces refus arrive en vrai : ca se lit dans /api/entonnoir.');
console.log('   `achat` = 2 depuis le 2026-09-19. Ce commit ne change pas ce chiffre.');
