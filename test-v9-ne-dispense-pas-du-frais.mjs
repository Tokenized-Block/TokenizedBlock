/* test-v9-ne-dispense-pas-du-frais.mjs — POSER UNE ADRESSE DE HOOK NE DOIT PAS SUFFIRE A ARRETER
 * NOTRE PRELEVEMENT.
 *
 * ⛔⛔⛔ LE DEFAUT, TROUVE LE 2026-10-02 EN RELISANT LE TRAVAIL DU GROK BOT. Sa correction « un frais
 *      par jambe » est bonne et sa table est MESUREE sur fork (bloc 52072599, callTracer) : V8 paie
 *      dans les deux sens, V1/V2 a la vente seulement, les hooks etrangers non. Son banc porte des
 *      controles negatifs sur V1, V2, V5, un hook etranger et les entrees invalides.
 *      Mais la ligne du V9 etait :
 *          if (x === HOOK_V8 || (!!HOOK_V9 && x === HOOK_V9)) return true;
 *      Le V9 n est PAS DEPLOYE (`HOOK_V9 = null`). Rien n a donc pu etre mesure — et pourtant le
 *      code repondait « il paie deja » dans les DEUX sens des l instant ou la constante cesse
 *      d etre nulle. Aucun banc ne tenait cette ligne : 1 banc exerce la fonction, 0 ne mentionne V9.
 *
 * ⛔⛔ ET LE SENS DE LA FAUTE EST CELUI QUI COUTE :
 *     · faux « non »  -> DOUBLE facturation, et `echange.js` la refuse (« double fee »).
 *     · faux « oui »  -> prelevement ZERO, et RIEN ne l attrape. Un zero ressemble a un succes.
 *   C est `zero-par-impossibilite` a l envers : non pas un zero qui ne peut pas monter, mais un zero
 *   qu on prendrait pour normal. Le defaut doit donc aller vers « on prend », parce que l erreur de
 *   ce cote-la est ATTRAPEE par une garde qui existe deja.
 *
 * ⛔ CE QUE CE BANC GARDE : qu aucune presence d adresse ne vaille une mesure, et que la table
 *   MESUREE (V1/V2/V8) reste intacte — corriger le V9 ne doit pas abimer ce qui etait juste.
 * ⚠️ CE QU IL NE PEUT PAS PROUVER : si le V9 paiera a6cf ou non. Il n existe pas, il ne peut etre ni
 *   innocente ni coupable. Ce banc garde la DECISION, pas le comportement du hook.
 */
import { hookPaieDejaA6cf, HOOK_V8, HOOK_V9, V9_PAIE_DEJA_A6CF, HOOK_PREVU, HOOK_V2, HOOK_V5 }
  from './tokenomics.js';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./tokenomics.js', import.meta.url), 'utf8');
let n = 0, ko = 0;
const ok = (nom, cond, vu) => {
  n += 1;
  if (cond) { console.log('  ok  ' + nom); return true; }
  ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '\n        vu: ' + vu));
  return false;
};

/* ── 0. L ETAT DU JOUR, LU ET NON SUPPOSE ────────────────────────────────────────────────────── */
ok('0. le V9 n est pas deploye aujourd hui', HOOK_V9 === null, String(HOOK_V9));
/* ⛔ TROIS ETATS, ET `null` VEUT DIRE « PAS MESURE ». Le confondre avec `false` ferait croire a une
 *   mesure negative — « pas de marche » contre « marche illisible », motif trouve trois fois ici. */
ok('1. ⭐ la reponse du V9 est NON MESUREE, pas supposee', V9_PAIE_DEJA_A6CF === null,
  String(V9_PAIE_DEJA_A6CF));
ok('2. …et c est une constante a trois etats, pas un booleen',
  /export const V9_PAIE_DEJA_A6CF = null;/.test(src));

/* ── 1. LA PRESENCE D UNE ADRESSE NE VAUT PAS UNE MESURE ─────────────────────────────────────── */
/* ⛔⛔ LE CŒUR DU BANC, ET IL FAUT LE PROUVER SUR LA FONCTION REELLE, pas sur une copie. On ne peut
 *    pas poser `HOOK_V9` depuis ici — c est une constante de module. On lit donc la LIGNE, et on
 *    exige qu elle consulte `V9_PAIE_DEJA_A6CF` au lieu de se contenter de `!!HOOK_V9`.
 *  ⛔ UNE ASSERTION SUR LE TEXTE EST PLUS FAIBLE QU UNE ASSERTION SUR LE COMPORTEMENT, et je le dis
 *    plutot que de le cacher : ce que ce banc tient, c est la FORME de la decision. Le comportement
 *    ne sera testable qu une fois le V9 pose — et ce jour-la, `test-rails-frais` devra ajouter les
 *    deux sens a sa table, comme il l a fait pour V8. */
ok('3. ⭐ la branche du V9 consulte la mesure, pas la seule presence de l adresse',
  /if \(!!HOOK_V9 && x === String\(HOOK_V9\)\.toLowerCase\(\)\) return V9_PAIE_DEJA_A6CF === true;/
    .test(src));
/* ⛔ `=== true` ET NON UN TEST DE VERITE. Avec `V9_PAIE_DEJA_A6CF ?` un `null` resterait faux par
 *   chance, mais n importe quelle valeur non vide — une chaine, un 1 — passerait pour « il paie ».
 *   Une garde correcte PAR ACCIDENT ne tient qu a une valeur particuliere. */
ok('4. ⛔ et la comparaison est stricte : seule la mesure `true` dispense du frais',
  /return V9_PAIE_DEJA_A6CF === true;/.test(src)
  && !/return !!V9_PAIE_DEJA_A6CF/.test(src) && !/V9_PAIE_DEJA_A6CF \?/.test(src));
/* ⛔ ET LE V8 N EST PLUS DANS LA MEME CONDITION QUE LE V9 : les melanger est ce qui avait fait
 *   heriter au V9 la mesure du V8. Deux questions differentes, deux lignes. */
ok('5. ⭐ le V8 decide seul, sur SA mesure',
  /if \(x === HOOK_V8\.toLowerCase\(\)\) return true;/.test(src));
/* ⛔⛔⛔ CETTE ASSERTION VISAIT TOUT LE FICHIER ET ACCUSAIT UN VOISIN CORRECT. Elle a rougi sur
 *      `estNotreHook`, qui combine legitimement V8 et V9 dans une seule condition — parce que cette
 *      fonction-la demande « est-ce un de NOS hooks », une question a laquelle le V9 repond oui
 *      independamment de ce qu il verse. Deux fonctions, deux questions ; seule la seconde devait
 *      etre separee.
 *   ⛔ MEME CAUSE RACINE QUE LA FENETRE FIXE, EN MIROIR : la-bas je regardais trop PEU et
 *     l assertion cessait silencieusement de couvrir ; ici trop LARGE et elle accuse a cote. Dans
 *     les deux cas l assertion ne nommait pas la PORTEE ou sa pretention est vraie. Sixieme
 *     occurrence de ce reflexe dans la session.
 *   ⇒ On borne par la grammaire de la fonction, et on PROUVE l extraction avant de juger. */
const mCorps = /export function hookPaieDejaA6cf\(h, sens\) \{([\s\S]*?)\n\}/.exec(src);
ok('6a. TEMOIN — le corps de `hookPaieDejaA6cf` est isole, pas le fichier entier',
  !!mCorps && mCorps[1].length > 200, mCorps ? mCorps[1].length + ' octets' : 'introuvable');
const corps = mCorps ? mCorps[1] : '';
ok('6. …et dans CE corps, le V8 n est plus melange au V9 dans une condition commune',
  !/HOOK_V8\.toLowerCase\(\) \|\| \(!!HOOK_V9/.test(corps),
  corps.replace(/\s+/g, ' ').trim().slice(0, 150));
/* ⛔ ET LE VOISIN RESTE INTACT : `estNotreHook` DOIT continuer a reconnaitre le V9 comme un de nos
 *   hooks. Si ma correction l avait abime, le V9 pose cesserait d etre reconnu partout ailleurs. */
/* ⛔⛔⛔ CETTE ASSERTION SEMBLAIT BORNEE ET NE L ETAIT PAS — une mutation survivante l a dit.
 *      Elle s ecrivait `/export function estNotreHook\(h\) \{[\s\S]*?!!HOOK_V9 && …/`. Le
 *      quantificateur PARESSEUX `[\s\S]*?` ne s arrete pas a la fin de la fonction : il traverse, et
 *      retrouve le meme motif dans `hookPaieDejaA6cf` quelques lignes plus bas. Supprimer le V9 de
 *      `estNotreHook` ne faisait donc rien rougir.
 *   ⛔ UN QUANTIFICATEUR PARESSEUX N EST PAS UNE PORTEE. C est la septieme fois dans cette session
 *     qu une assertion a moi ne nomme pas la portee ou sa pretention est vraie — tantot trop
 *     etroite (fenetre en octets qui cesse de couvrir), tantot trop large (tout le fichier), et ici
 *     « bornee en apparence », ce qui est le pire des trois parce que ca se relit comme correct.
 *   ⇒ On extrait le corps, on PROUVE l extraction, puis on juge dedans. */
const mNotre = /export function estNotreHook\(h\) \{([\s\S]*?)\n\}/.exec(src);
ok('6c. TEMOIN — le corps de `estNotreHook` est isole, et il est distinct de l autre',
  !!mNotre && mNotre[1].length > 100 && !mNotre[1].includes('V9_PAIE_DEJA_A6CF'),
  mNotre ? mNotre[1].length + ' octets' : 'introuvable');
const corpsNotre = mNotre ? mNotre[1] : '';
ok('6b. ⛔ et `estNotreHook` reconnait TOUJOURS le V9 : ce n est pas la meme question',
  /!!HOOK_V9 && x === String\(HOOK_V9\)\.toLowerCase\(\)/.test(corpsNotre),
  corpsNotre.replace(/\s+/g, ' ').trim().slice(-120));

/* ── 2. LA TABLE MESUREE EST INTACTE ─────────────────────────────────────────────────────────── */
/* ⛔⛔ C EST LA MOITIE QU ON CASSE EN REPARANT L AUTRE. La correction du V9 ne doit rien changer aux
 *    quatre reponses que le fork a reellement mesurees. Sans ces assertions, « j ai ferme le trou »
 *    pourrait vouloir dire « j ai tout mis a faux ». */
ok('7. V8 paie dans les DEUX sens (mesure fork)',
  hookPaieDejaA6cf(HOOK_V8, 'ACHAT') === true && hookPaieDejaA6cf(HOOK_V8, 'VENTE') === true);
ok('8. V1 et V2 paient a la VENTE seulement (mesure fork)',
  hookPaieDejaA6cf(HOOK_PREVU, 'VENTE') === true && hookPaieDejaA6cf(HOOK_V2, 'VENTE') === true);
ok('9. ⛔ TEMOIN NEGATIF — V1 et V2 ne paient PAS a l achat : le routeur garde son frais',
  hookPaieDejaA6cf(HOOK_PREVU, 'ACHAT') === false && hookPaieDejaA6cf(HOOK_V2, 'ACHAT') === false);
ok('10. ⛔ TEMOIN NEGATIF — V5 et un hook etranger ne dispensent de rien',
  hookPaieDejaA6cf(HOOK_V5, 'VENTE') === false
  && hookPaieDejaA6cf('0x1f91c998e7c2f4b690d75bdbf6502bdcd6e02acc', 'ACHAT') === false);
ok('11. ⛔ TEMOIN NEGATIF — une entree invalide ne dispense de rien',
  hookPaieDejaA6cf(HOOK_V8, 'AUTRE') === false && hookPaieDejaA6cf(null, 'ACHAT') === false
  && hookPaieDejaA6cf('', 'VENTE') === false && hookPaieDejaA6cf(HOOK_V8, undefined) === false);
/* ⛔ ET AUJOURD HUI, AUCUNE ADRESSE NE PEUT ETRE LE V9 : la constante est nulle, donc la branche ne
 *   s emprunte pas. On le verifie, sinon « la correction marche » ne dirait rien de l etat courant. */
ok('12. aujourd hui la branche V9 ne s emprunte pas du tout',
  HOOK_V9 === null && hookPaieDejaA6cf('0x9999999999999999999999999999999999999999', 'ACHAT') === false);

/* ── 3. CE QUE LE JOUR DE LA BASCULE EXIGERA ──────────────────────────────────────────────────── */
/* ⛔ UNE REGLE QUI N EST PAS ECRITE A L ENDROIT OU ON LA LIRA NE SERA PAS SUIVIE. On exige que la
 *   methode de mesure soit nommee dans le fichier, pas seulement dans un rapport de vault : le jour
 *   ou quelqu un pose le V9, c est `tokenomics.js` qu il ouvrira. */
ok('13. ⛔ la condition pour passer a `true` est ecrite dans le fichier',
  /mesure fork au callTracer/.test(src) && /dans les DEUX\s*\n?\s*\*\s*sens/.test(src.replace(/\r/g, '')),
  'la methode de mesure doit etre nommee la ou on la lira');
/* ⛔ ET ON INTERDIT LA LECTURE DE SOURCE COMME PREUVE : lire le Solidity du hook ne dit pas ce que la
 *   transaction fait. `guards-measured-transport-not-execution` a deja coute ici — un garde-fou
 *   avait mesure le TRANSPORT et pas l EXECUTION, et le site etait mort. */
ok('14. ⛔ …et la lecture de la source du hook est explicitement refusee comme preuve',
  /Pas une lecture de la\s*\n?\s*\*\s*source du hook/.test(src.replace(/\r/g, '')));

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
console.log('   Le defaut va vers « le routeur prend » : l erreur de ce cote est ATTRAPEE par la');
console.log('   garde « double fee » d echange.js. De l autre cote, un zero ne reveille personne.');
console.log('⚠️ NE PROUVE PAS si le V9 paiera a6cf : il n est pas deploye. Ce banc garde la DECISION,');
console.log('   pas le comportement du hook. Et l assertion 3 tient la FORME de cette decision, pas');
console.log('   son effet — seul un V9 pose rendrait l effet testable.');
process.exit(ko ? 1 : 0);
