/* test-etape-jamais-masquee.mjs — LE COMPTEUR `etape()` NE DOIT JAMAIS ETRE MASQUE.
 *
 * ⛔⛔⛔ LE DEFAUT QUI TUAIT LA MISE EN VIE, trouve le 2026-09-25 et REPRODUIT A L EXECUTION :
 *       `async function signerEtapeLancement(etape)` — le parametre masquait la fonction
 *       `etape()` de l entonnoir. A l interieur, `etape('vie_echec')` levait
 *       `TypeError: etape is not a function`, parce que l objet du plan n est pas appelable.
 *
 *       TROIS CONSEQUENCES EN CASCADE, toutes silencieuses :
 *         1. la ligne suivante n etait jamais atteinte -> AUCUN message a l ecran ;
 *         2. `vieAutoArreter()` n etait jamais atteint -> le parcours ne s arretait pas, `vieAuto`
 *            restait vrai, et plus rien ne relancait `calculerLancement()` ;
 *         3. aucun compteur ne partait — ni `vie_echec`, ni `vie_ko_etape2`.
 *       L appelant fait `void signerEtapeLancement(...)` : le rejet etait une promesse non geree.
 *       Quelqu un qui refusait une signature restait devant « Step 2 — … Your wallet opens now. »
 *       POUR TOUJOURS, sans message, sans bouton, sans trace.
 *
 * ⛔⛔ ET LE TROU ETAIT VISIBLE DANS LES CHIFFRES SANS QU ON SACHE LE LIRE : l entonnoir montre
 *     `vie_ko_etape1` et `vie_ko_etape4`, jamais `vie_ko_etape2` — alors que l etape 2 porte TROIS
 *     des cinq signatures, donc l endroit le plus probable d un refus. Ce n etait pas « personne
 *     n echoue a l etape 2 », c etait « l etape 2 ne peut pas se compter ».
 *     Un zero qui vient d une impossibilite ressemble exactement a un zero qui vient d un succes.
 *
 * ⛔ CE QUE CE TEST NE PROUVE PAS : que la mise en vie aboutit maintenant. Il prouve qu un echec
 *   peut se DIRE et se COMPTER. Combien de parcours meurent encore, et ou, se lira dans
 *   `/api/entonnoir` — et ce sont des chiffres qui n existaient pas avant aujourd hui.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const html = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
let n = 0;
const v = (nom, fn) => { fn(); n++; };

/** Corps d une fonction, borne par equilibrage d accolades (jamais par un nombre de lignes). */
function corpsDe(signature) {
  const d = html.indexOf(signature);
  if (d < 0) return null;
  let prof = 0, dans = null;
  for (let i = html.indexOf('{', d); i < html.length; i++) {
    const c = html[i];
    if (dans) { if (c === dans && html[i - 1] !== '\\') dans = null; continue; }
    if (c === '"' || c === "'" || c === '`') { dans = c; continue; }
    if (c === '{') prof++;
    else if (c === '}' && !--prof) return html.slice(d, i + 1);
  }
  return null;
}

v('⛔⛔⛔ aucune fonction ne prend un parametre nomme `etape`', () => {
  /* ⛔⛔⛔ LE CAS CENTRAL. Un parametre qui porte le nom du compteur le rend inappelable dans toute
   *      la fonction — et l erreur ne se voit qu a l execution, sur le chemin d echec, c est-a-dire
   *      celui que personne ne parcourt en developpant. */
  const motif = /function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/g;
  const coupables = [];
  for (const m of html.matchAll(motif)) {
    const params = m[2].split(',').map((s) => s.trim().split(/[=:\s]/)[0]);
    if (params.includes('etape')) coupables.push(m[1]);
  }
  assert.deepEqual(coupables, [],
    'ces fonctions masquent le compteur `etape()` par un parametre du meme nom : '
    + coupables.join(', ') + ' — tout appel au compteur y levera TypeError, en silence');
});

v('⛔ aucune fleche ne prend `etape` en parametre non plus', () => {
  /* ⛔ `(etape) => …` et `etape => …` masquent exactement pareil, et `single-and-batch-twins-diverge`
   *   dit que c est la forme qu on oublie de garder. */
  const coupables = [...html.matchAll(/\(\s*etape\s*\)\s*=>|(?:^|[^\w.])etape\s*=>/g)].length;
  assert.equal(coupables, 0,
    coupables + ' fonction(s) flechee(s) prennent `etape` en parametre : meme masquage');
});

v('⛔⛔ un `const etape =` en portee de bloc n entoure aucun appel au compteur', () => {
  /* ⛔⛔ DEUX PIEGES ARMES EXISTENT DEJA dans le fichier (`const etape = plan.etapes[0]`). Ils sont
   *     inoffensifs AUJOURD HUI, parce qu aucun appel au compteur ne tombe dans leur portee. Ils
   *     redeviendront le meme bug le jour ou quelqu un ajoutera une ligne de mesure au bon endroit
   *     — sans rien casser de visible, et sans qu aucun test existant ne bronche.
   *   ⇒ On ne les interdit pas (ce sont des variables locales legitimes), on interdit la
   *     COMBINAISON : une declaration `etape` suivie d un appel `etape('…')` dans le meme bloc. */
  const pieges = [];
  for (const m of html.matchAll(/\b(?:const|let|var)\s+etape\s*=/g)) {
    /* on regarde jusqu a la fin probable du bloc : la prochaine accolade fermante de meme niveau */
    let prof = 0, fin = m.index;
    for (let i = m.index; i < html.length && i < m.index + 4000; i++) {
      const c = html[i];
      if (c === '{') prof++;
      else if (c === '}') { if (prof === 0) { fin = i; break; } prof--; }
    }
    const portee = html.slice(m.index, fin);
    if (/\betape\(\s*['"]/.test(portee)) {
      pieges.push(portee.replace(/\s+/g, ' ').slice(0, 90));
    }
  }
  assert.deepEqual(pieges, [],
    'un appel au compteur `etape(\'…\')` tombe dans la portee d une variable locale `etape` :\n   · '
    + pieges.join('\n   · '));
});

v('⛔ le chemin d echec de la mise en vie compte, PUIS parle, PUIS s arrete', () => {
  /* ⛔ L ordre est la garde : c est parce que le compteur jetait que le message et l arret
   *   n arrivaient jamais. Sous try/catch, meme un compteur casse laisse passer les deux autres. */
  const corps = corpsDe('async function signerEtapeLancement(');
  assert.ok(corps, 'signerEtapeLancement est introuvable : cette garde ne protege plus rien');
  assert.doesNotMatch(corps, /async function signerEtapeLancement\(\s*etape\s*\)/,
    'le parametre s appelle de nouveau `etape`');
  assert.match(corps, /try \{ etape\('vie_echec'\); \} catch/,
    'le compteur d echec n est plus sous try/catch : un defaut dans `etape()` retuerait le parcours');
  const iC = corps.indexOf("etape('vie_echec')");
  const iM = corps.indexOf('e.innerHTML');
  const iA = corps.indexOf('vieAutoArreter()');
  assert.ok(iC > 0 && iM > iC && iA > iM,
    'l ordre compter -> dire -> arreter a change : c est cet ordre qui a fait perdre les trois');
});

v('⛔ les appels au compteur dans ce fichier sont proteges', () => {
  /* ⛔⛔ Une statistique ne doit jamais faire tomber le parcours qu elle observe. Ce test ne les
   *     compte pas tous (beaucoup sont deja sous try ailleurs) : il verifie qu on ne REGRESSE pas
   *     sur les chemins d echec, la ou une exception coute le plus cher. */
  const corps = corpsDe('function vieAutoArreter(');
  assert.ok(corps, 'vieAutoArreter est introuvable');
  assert.match(corps, /try \{ etape\('vie_ko_etape'/,
    'le compteur d etape de la mise en vie n est plus protege');
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok etape-jamais-masquee — ' + n + ' cas : le compteur ne peut plus etre masque, et le');
console.log('   chemin d echec compte, parle, puis s arrete — dans cet ordre.');
console.log('⚠️ NE PROUVE PAS que la mise en vie aboutit : seulement qu un echec peut se dire.');
console.log('   Combien meurent encore, et ou, se lira dans /api/entonnoir — pas ici.');
