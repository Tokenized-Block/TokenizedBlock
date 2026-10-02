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
/* ⛔ 2026-10-02 (rebase o1 sur 87a49cb) : la decision vit maintenant dans LA LISTE `HOOKS_PAIENT_DEJA_A6CF`
 *   (ee8de19), et `hookPaieDejaA6cf` ne fait que la lire. Le banc juge donc l entree V9 DE LA LISTE. */
const mListe = /export const HOOKS_PAIENT_DEJA_A6CF = Object\.freeze\(\[([\s\S]*?)\n\]\.map/.exec(src.replace(/\r/g, ''));
ok('6a. TEMOIN — le corps de la liste `HOOKS_PAIENT_DEJA_A6CF` est isole, pas le fichier entier',
  !!mListe && mListe[1].length > 200 && mListe[1].length < 1500, mListe ? mListe[1].length + ' octets' : 'introuvable');
const liste = mListe ? mListe[1] : '';
ok('3. ⭐ l entree V9 de la liste consulte la mesure, pas la seule presence de l adresse',
  /\.\.\.\(HOOK_V9 && V9_PAIE_DEJA_A6CF === true \? \[\{ hook: HOOK_V9,/.test(liste), liste.replace(/\s+/g, ' ').slice(0, 200));
/* ⛔ `=== true` ET NON UN TEST DE VERITE (voir plus haut) ; et jamais « HOOK_V9 ? » seul. */
ok('4. ⛔ et la comparaison est stricte : seule la mesure `true` dispense du frais',
  /V9_PAIE_DEJA_A6CF === true/.test(liste) && !/!!V9_PAIE_DEJA_A6CF/.test(src) && !/V9_PAIE_DEJA_A6CF \?/.test(src)
  && !/\.\.\.\(HOOK_V9 \?/.test(src));
ok('5. ⭐ le V8 decide seul, sur SA mesure (sa propre entree, deux sens)',
  /\{ hook: HOOK_V8, sens: DEUX_SENS, preuve: 'fork 52072599 callTracer' \}/.test(liste));
const ligneV8 = liste.split('\n').find((l) => /hook: HOOK_V8\b/.test(l)) || '';
ok('6. …et le V8 n est jamais melange au V9 dans une meme entree', !!ligneV8 && !/HOOK_V9/.test(ligneV8), ligneV8.trim());
const mCorps = /export function hookPaieDejaA6cf\(h, sens, liste = HOOKS_PAIENT_DEJA_A6CF\) \{([\s\S]*?)\n\}/.exec(src.replace(/\r/g, ''));
ok('6d. ⛔ `hookPaieDejaA6cf` ne decide rien en dur : elle LIT la liste (aucune adresse de hook dans son corps)',
  !!mCorps && /liste\.some\(/.test(mCorps[1]) && !/HOOK_V[0-9]|HOOK_PREVU/.test(mCorps[1]), mCorps ? mCorps[1].replace(/\s+/g, ' ').trim() : 'introuvable');
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
