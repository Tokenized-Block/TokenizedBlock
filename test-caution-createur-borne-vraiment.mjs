/* test-caution-createur-borne-vraiment.mjs — LA CAUTION DU CREATEUR DOIT BORNER QUELQUE CHOSE.
 *
 * ⛔⛔⛔ LE DEFAUT, LU DANS LE SOLIDITY LE 2026-10-02 (hook 7030, `TBlockLaunchLockHook.sol`).
 *      Zero 1 avait signale « quelqu un pourrait toucher la part createur en deposant presque rien ».
 *      Je n avais que cette ligne, relayee ; la voici VERIFIEE a la source, et elle est exacte.
 *
 *      A l inscription :
 *          if (PART_CREATEUR == 0 || minimum == 0) revert CreateurInactif();
 *          ...
 *          caution[id]        = recu;
 *          minimumCaution[id] = recu;      // <- le minimum EST le premier depot
 *      Et la condition qui fait couler la part :
 *          function createurActif(PoolId id) ... {
 *            if (k.qui == address(0) || k.retraitDes != 0) return false;
 *            uint256 mn = minimumCaution[id];
 *            return mn != 0 && caution[id] >= mn;
 *          }
 *
 *   ⇒ `caution >= mn` EST VRAI PAR CONSTRUCTION, des la seconde zero, quel que soit le montant. La
 *     SEULE borne sur `minimum` est « different de zero » : un createur qui s inscrit avec `1`
 *     verrouille une unite et encaisse sa part pour toujours.
 *   ⛔ ET LA COMPARAISON NE TRAVAILLE JAMAIS : le seul chemin qui ferait baisser `caution` est
 *     `demanderRetrait`, et il pose `retraitDes != 0`, deja attrape par la ligne du dessus. Une garde
 *     qui ne peut pas rendre faux n est pas une garde.
 *   ⛔ C est `enforced-key-that-bounds-nothing` dans sa forme la plus pure, double de
 *     `garde-presque-toujours-vraie` : le seuil est choisi par CELUI QU IL DOIT CONTRAINDRE.
 *
 * ⚠️ ET UNE SECONDE CONSEQUENCE, MESUREE EN LISANT `recharger` : il augmente `caution` mais JAMAIS
 *   `minimumCaution`. La regle annoncee dans le rapport de faisabilite — « le minimum peut monter,
 *   jamais baisser » — n est donc pas implementee ici. Recharger ne releve pas la barre.
 *
 * ⛔ CE QUE CE BANC EST, ET CE QU IL N EST PAS. Il lit la SOURCE : il garde la forme de la decision,
 *   pas son comportement a l execution. Seul un banc fork (forge) prouverait qu une inscription a 1
 *   wei encaisse reellement. Je ne peux pas le lancer ici — la chaine de preuve du depot ecrit dans
 *   des chemins de conteneur — et je le DIS plutot que de laisser croire a une preuve on-chain.
 * ⛔ IL NE PROPOSE AUCUN CORRECTIF. « Combien un createur doit-il verrouiller » est une semantique
 *   PRODUIT : elle revient a Raksha, pas a moi. Ce banc rend le defaut impossible a oublier.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

let n = 0, ko = 0;
const ok = (nom, cond, vu) => {
  n += 1;
  if (cond) { console.log('  ok  ' + nom); return true; }
  ko += 1; console.log('  KO  ' + nom + (vu === undefined ? '' : '\n        vu: ' + vu));
  return false;
};

/* ⛔ LA SOURCE VIT SUR UNE BRANCHE NON FUSIONNEE : on la lit par git, et si elle n y est pas on le
 *   DIT au lieu de rendre vert par absence. `zero-par-impossibilite`. */
const BRANCHE = 'origin/feat/hook-7030-37-devises-20261002';
const CHEMIN = 'contracts/launch-lock/src/TBlockLaunchLockHook.sol';
let src = null;
if (existsSync(CHEMIN)) src = readFileSync(CHEMIN, 'utf8');
else {
  try { src = execFileSync('git', ['show', BRANCHE + ':' + CHEMIN], { encoding: 'utf8', maxBuffer: 8e6 }); }
  catch (_) { src = null; }
}
ok('0. ⛔ la source du hook est trouvee (sinon ce banc ne garde RIEN)', !!src && src.length > 10000,
  src ? src.length + ' octets' : 'INTROUVABLE — ni en local ni sur ' + BRANCHE);
if (!src) {
  console.log('');
  console.log('⛔ SANS LA SOURCE, AUCUNE CONCLUSION. Un banc vert par absence est pire qu un rouge.');
  process.exit(1);
}
const nu = src.replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
ok('0b. TEMOIN — le depouillement garde du code vivant',
  nu.length < src.length && /function createurActif/.test(nu) && /function inscrireAvecCaution/.test(nu),
  nu.length + '/' + src.length);

/* ── 1. LE DEFAUT EST-IL TOUJOURS LA ? ───────────────────────────────────────────────────────── */
/* ⛔ TANT QU IL EST LA, CE BANC EST ROUGE. C est voulu : un defaut connu et non corrige doit se voir
 *   a chaque execution, pas dormir dans un rapport. Le jour ou quelqu un le repare, ce banc PASSE et
 *   il faudra inverser l assertion — c est le signal. */
const minimumEstLePremierDepot = /minimumCaution\[id\]\s*=\s*recu;/.test(nu);
const seuleBorne = /if\s*\(\s*PART_CREATEUR\s*==\s*0\s*\|\|\s*minimum\s*==\s*0\s*\)/.test(nu);
ok('1. ⛔⛔ DEFAUT OUVERT — le minimum est pose EGAL au premier depot (`minimumCaution[id] = recu`)',
  minimumEstLePremierDepot === false,
  'present : le createur choisit lui-meme le seuil qui doit le contraindre');
ok('2. ⛔⛔ DEFAUT OUVERT — la seule borne sur `minimum` est « different de zero »',
  seuleBorne === false,
  'present : `minimum = 1` est accepte, donc une unite suffit a encaisser la part');

/* ── 2. LA COMPARAISON QUI NE TRAVAILLE JAMAIS ──────────────────────────────────────────────── */
const mActif = /function createurActif\(PoolId id\)[\s\S]*?\n    \}/.exec(nu);
ok('3. TEMOIN — le corps de `createurActif` est isole par sa grammaire', !!mActif,
  mActif ? mActif[0].length + ' octets' : 'introuvable');
const actif = mActif ? mActif[0] : '';
ok('4. …il compare bien la caution au minimum', /caution\[id\]\s*>=\s*mn/.test(actif), actif.slice(0, 160));
/* ⛔ ET LE CHEMIN QUI FERAIT BAISSER `caution` EST DEJA ATTRAPE PLUS HAUT : `retraitDes != 0`. La
 *   comparaison est donc morte — vraie a l inscription, et jamais reevaluee a la baisse avant que
 *   l autre garde n ait deja rendu false. */
ok('5. ⛔ …mais `retraitDes != 0` rend deja false AVANT cette comparaison',
  /retraitDes\s*!=\s*0\s*\)\s*return false;/.test(actif));

/* ── 3. LA REGLE ANNONCEE N EST PAS IMPLEMENTEE ─────────────────────────────────────────────── */
/* ⚠️ Le rapport de faisabilite annonce « le minimum peut monter, jamais baisser ». `recharger`
 *   augmente `caution` et ne touche PAS `minimumCaution` : recharger ne releve donc pas la barre. */
const mRech = /function recharger\([\s\S]*?\n    \}/.exec(nu);
ok('6. TEMOIN — le corps de `recharger` est isole', !!mRech);
const rech = mRech ? mRech[0] : '';
ok('7. ⚠️ ECART ANNONCE/CODE — `recharger` ne releve PAS `minimumCaution`',
  /minimumCaution/.test(rech) === true,
  'absent : la regle « le minimum peut monter, jamais baisser » n est pas implementee ici');

console.log('');
console.log(n + ' assertions, ' + ko + ' KO');
console.log('⛔ LES ROUGES CI-DESSUS SONT LE DEFAUT, PAS UNE PANNE DU BANC. Ils doivent rester rouges');
console.log('   tant que la caution ne borne rien. Le jour ou c est corrige, ces assertions passent');
console.log('   au vert et il faut les INVERSER — c est le signal que le correctif a atterri.');
console.log('⚠️ CE BANC LIT LA SOURCE : il garde la forme de la decision, pas son comportement. Seul');
console.log('   un banc fork prouverait qu une inscription a 1 unite encaisse reellement la part.');
console.log('⛔ ET IL NE PROPOSE AUCUN CORRECTIF : « combien un createur doit verrouiller » est une');
console.log('   semantique PRODUIT, elle revient a Raksha.');
/* ⛔ ON SORT 0 : ce banc DOCUMENTE un defaut connu et ne doit pas bloquer la suite tant que la
 *   decision produit n est pas prise. Le compte de KO est imprime, lui, et il ne ment pas. */
process.exit(0);
