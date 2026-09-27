/* test-note-paire-action-pas-perimee.mjs — UNE COPIE QUI SE DENIGRE COUTE AUTANT QU UNE QUI MENT.
 *
 * ⛔⛔ CE QUI S EST PASSE. Le 2026-09-25, `echange.js` REFUSAIT tout marche cote autrement qu en
 *     USDC : les 0,5 % d interface ne pouvaient atterrir qu en ETH ou USDC. L ecran de Create
 *     disait donc, honnetement : « Buy and Sell inside this app do not work on a stock-quoted
 *     market today ».
 *     Le refus a ete LEVE depuis (`echange.js` accepte une devise dont le prix a ete MESURE), et
 *     la phrase est restee. Pendant des jours l app a affirme une panne qui n existait plus, juste
 *     avant de demander 0,001 ETH. Phil l a vu a l ecran, pas nous : AUCUN TEST NE TENAIT CETTE
 *     PHRASE. C est la seule raison pour laquelle elle a pu pourrir.
 *
 * ⇒ Ce fichier lie la PHRASE au CODE qui la rend vraie. Si l un bouge sans l autre, il crie.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un achat passe reellement sur un marche cote en action. Il prouve
 *   que l ecran ne CONTREDIT PAS le module d echange — dans un sens comme dans l autre.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const ech = readFileSync(new URL('./echange.js', import.meta.url), 'utf8');

/* ⛔ ON DEPOUILLE LES COMMENTAIRES : la vieille phrase est citee dans le commentaire qui explique
 *   pourquoi elle a ete retiree. Une sonde qui accuse sa propre documentation transforme
 *   l honnetete du code en faux positif — piege deja referme trois fois sur moi. */
/* ⛔ ET ON RECOLLE LES CONCATENATIONS : la phrase de l ecran est coupee par des `' + '` pour tenir
 *   dans la largeur. Une regex sur le fichier BRUT ne verrait jamais « ...dollars are offered »,
 *   et le test serait rouge sur du code juste — puis affaibli pour le faire passer. */
const codeNu = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/'\s*\+\s*'/g, '');

cas('⛔⛔ l ecran n affirme plus une panne qui n existe plus', () => {
  assert.ok(!/do not work on a stock-quoted market/.test(codeNu),
    'l ecran de Create redit « Buy and Sell do not work on a stock-quoted market » alors que '
    + '`echange.js` accepte les devises dont le prix est mesure : on se denigre juste avant de '
    + 'demander 0,001 ETH');
  assert.ok(!/but not from these screens/.test(codeNu),
    'l ecran renvoie de nouveau l utilisateur ailleurs pour echanger, alors que le chemin in-app '
    + 'existe pour ces paires');
});

cas('⛔ et il ne promet pas non plus l inverse : la BORNE est dite', () => {
  /* ⛔ LE DEFAUT SYMETRIQUE SERAIT PIRE. `echange.js` refuse encore quand le prix de la devise
   *   n a pas pu etre lu — a6cf a deja ete paye en jetons invendables une fois. L ecran doit dire
   *   cette condition, sinon on remplace une sous-promesse par une sur-promesse. */
  assert.ok(/Only stocks this app can price in dollars are offered/.test(codeNu),
    'l ecran ne dit plus que seules les actions PRISABLES sont proposees');
  assert.ok(/the trade is refused rather than take a fee we cannot value/.test(codeNu),
    'l ecran ne dit plus ce qui arrive si le prix ne peut pas etre lu au moment du trade : sans '
    + 'cette phrase, « Buy and Sell work here » devient une promesse sans condition');
});

cas('⛔⛔ le CODE qui rend la phrase vraie est toujours la', () => {
  /* ⛔⛔ C EST LE LIEN QUI MANQUAIT. Si quelqu un remet le refus dur dans `echange.js`, la phrase
   *     de l ecran redevient fausse — dans l autre sens — et rien ne le dirait. */
  assert.ok(/fraisDevisesOk instanceof Set && fraisDevisesOk\.has\(deviseBas\)/.test(ech),
    '`echange.js` ne consulte plus l ensemble des devises mesurees : le marche cote en action est '
    + 'de nouveau refuse, et l ecran promet desormais le contraire');
  assert.ok(/we could not price in /.test(ech),
    'le refus pour devise non prisable a disparu : les 0,5 % pourraient atterrir en jetons '
    + 'invendables, ce qui est deja arrive a a6cf');
});

cas('⛔ l ensemble des devises acceptees vient d un prix LU, pas d une liste blanche', () => {
  /* ⛔ UNE LISTE BLANCHE FIGEE DERIVE : elle garde un symbole dont le marche est mort. Ici
   *   l ensemble se reconstruit a partir des prix REELLEMENT lus. */
  assert.ok(/prixUsdDeviseLus\.has\(String\(p2\.symbole\)\)/.test(app),
    'les devises de frais ne sont plus filtrees par un prix reellement lu : une action sans marche '
    + 'pourrait redevenir proposable');
});

assert.equal(n, 4, 'compte de cas inattendu : ' + n);
console.log('ok note-paire-action — ' + n + ' cas.');
console.log('   L ecran ne dit plus une panne levee, il dit la BORNE reelle, et le code qui rend');
console.log('   la phrase vraie est tenu avec elle.');
console.log('⚠️ NE PROUVE PAS qu un achat passe sur un marche cote en action : prouve que l ecran');
console.log('   et le module d echange ne se contredisent pas, dans un sens comme dans l autre.');
