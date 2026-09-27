/* test-mes-blocks-sans-fenetre.mjs — UN BLOCK CREE HIER DOIT RESTER LE TIEN.
 *
 * ⛔⛔ LE DEFAUT, ET IL TOUCHAIT TOUS LES UTILISATEURS. Phil, 2026-09-27 : « je vais sur My blocks et
 *     je vois pas le block que j ai cree sur l autre machine, et le bug doit etre partout ».
 *     Il l etait, et ce n etait PAS un probleme de machine.
 *   ⛔ LA CAUSE, CALCULEE : le navigateur cherchait les creations avec
 *     `listerCreations({ blocs: 43200 })`. Base produit un bloc toutes les ~2 secondes, donc
 *     43 200 x 2 = 86 400 secondes = EXACTEMENT 24 HEURES. Un block cree la veille disparaissait de
 *     « mes blocks » sur N IMPORTE QUELLE machine. La seconde machine n etait qu un revelateur.
 *   ⛔ ON NE POUVAIT PAS ELARGIR LA FENETRE : le noeud plafonne les pages de logs (mesure du depot :
 *     2000 blocs, au-dela HTTP 413). Trente jours feraient des centaines de requetes depuis un
 *     navigateur.
 *
 * ⛔⛔ CE QUE CE TEST DEFEND, ET C EST LA PARTIE QU ON RATE : LA FUSION.
 *     Le scan local voit un block cree il y a trente SECONDES, que le serveur n a pas encore
 *     scanne. L index serveur voit ceux de la semaine derniere, que la fenetre locale a perdus.
 *     Chacun couvre l angle mort de l autre. REMPLACER l un par l autre recreerait un trou, juste
 *     ailleurs — et ce trou-la serait plus difficile a voir, parce qu il n apparaitrait qu au
 *     visiteur qui vient de creer.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : que l index du serveur soit COMPLET. Il ne connait que les creations
 *   vues depuis son premier scan, et l endpoint le DIT dans sa reponse. « pas encore indexe » et
 *   « tu n as rien cree » se ressemblent a l ecran et n ont rien a voir.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

let n = 0;
const v = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');

v('⛔⛔ la fenetre locale fait bien 24 h — le chiffre est CALCULE, pas suppose', () => {
  /* ⛔ ON REJOUE L ARITHMETIQUE plutot que d affirmer. Si Base changeait de rythme, ce cas le
   *   dirait au lieu de repeter une phrase devenue fausse. */
  const m = app.match(/listerCreations\(\{ rpc, blocs: (\d+) \}\)/);
  assert.ok(m, 'la fenetre de creations a disparu de app.html');
  const blocs = Number(m[1]);
  const heures = (blocs * 2) / 3600;
  assert.ok(Math.abs(heures - 24) < 0.5,
    'la fenetre locale couvre ' + heures.toFixed(1) + ' h — si ce n est plus 24 h, relire ce test '
    + 'AVANT de le corriger : le defaut d origine etait justement que 43 200 blocs font pile un jour');
});

v('⛔⛔ l index serveur est INTERROGE, et son echec ne casse rien', () => {
  assert.ok(/\/api\/blocks-de\?adr=/.test(app),
    'le navigateur n interroge plus l index des createurs : les blocks de plus de 24 h resteraient invisibles');
  /* ⛔ UN ECHEC DE L INDEX DOIT RENDRE LE COMPORTEMENT D AVANT, PAS UNE PAGE CASSEE. Une
   *   amelioration qui peut faire PIRE que l etat anterieur n en est pas une. */
  const i = app.indexOf("/api/blocks-de?adr=");
  const autour = app.slice(i - 400, i + 600);
  assert.ok(/catch \(_\) \{/.test(autour),
    'l appel a l index n est pas protege : une panne de l index viderait « mes blocks »');
});

v('⛔⛔ ON FUSIONNE, ON NE REMPLACE PAS', () => {
  /* ⛔⛔ LE CAS QUI COMPTE. Remplacer le scan local par l index ferait disparaitre un block cree il
   *     y a trente secondes — le serveur ne l a pas encore vu. Remplacer l index par le scan local
   *     ramene le defaut d origine. Il FAUT les deux, et il faut dedoublonner. */
  assert.ok(/const vus = new Set\(gardees\.map/.test(app),
    'la fusion ne dedoublonne plus : un block vu des DEUX cotes apparaitrait deux fois');
  assert.ok(/gardees\.push\(\{ jeton: bas, createur:/.test(app),
    'l index ne complete plus la liste locale : soit il la remplace, soit il est ignore');
  /* ⛔ ET L ORDRE COMPTE : le scan local doit etre fait AVANT, sinon on ne peut pas dedoublonner
   *   contre lui. */
  const iLocal = app.indexOf('creationsDe({ rpc, creations: r.creations');
  const iIndex = app.indexOf("/api/blocks-de?adr=");
  assert.ok(iLocal !== -1 && iIndex !== -1 && iLocal < iIndex,
    'l index est interroge avant le scan local : la deduplication ne peut plus se faire contre lui');
});

v('⛔⛔ le serveur retient le CREATEUR, et il le lit dans la TRANSACTION', () => {
  /* ⛔⛔ L EVENEMENT DE CREATION NE PORTE PAS LE CREATEUR — `index-blocks.js` le dit en toutes
   *     lettres : « seule la transaction dit QUI A PAYE ». Un index construit depuis les logs
   *     seuls attribuerait les blocks a la mauvaise personne. */
  assert.ok(/const createurParBlock = new Map\(\)/.test(srv), 'l index des createurs a disparu du serveur');
  assert.ok(/createurDe\(\{ rpc: rpcServeur, tx: c\.tx \}\)/.test(srv),
    'le createur n est plus lu dans la TRANSACTION : un log ne dit pas qui a paye');
  /* ⛔ ON REUTILISE L AIDE CANONIQUE `createurDe`, deja eprouvee — pas un jumeau plus faible ecrit
   *   dans le serveur, qui deriverait au premier correctif applique a un seul des deux. */
  assert.ok(/import \{ listerCreations, createurDe \} from '\.\/index-blocks\.js'/.test(srv),
    'le serveur n importe plus l aide canonique : il en a sans doute reecrit une version plus faible');
  /* ⛔⛔ UN ECHEC DE RESOLUTION N EST PAS UN CREATEUR NUL : enregistrer `null` graverait
   *     « personne » pour un block dont on n a pas pu lire la tx, et la passe suivante ne
   *     reessaierait JAMAIS. */
  assert.ok(/if \(cre\) createurParBlock\.set\(/.test(srv),
    'un echec de lecture de transaction serait grave comme un createur : le block serait perdu pour toujours');
});

v('⛔ l index est PERSISTE — sinon les gens reperdent leurs blocks a chaque deploiement', () => {
  /* ⛔ Il ne se remplit qu avec les creations VUES depuis le dernier scan. Un index volatil ne
   *   rattraperait donc jamais le passe : chaque mise en ligne recreerait le defaut. */
  assert.ok(/createurs: \[\.\.\.createurParBlock\.entries\(\)\]/.test(srv),
    'l index des createurs n est plus persiste : un deploiement le remettrait a zero');
  assert.ok(/for \(const \[j, c\] of \(x\.createurs \|\| \[\]\)\)/.test(srv),
    'l index persiste n est plus relu au demarrage');
  /* ⛔ ET LES DEUX COTES SONT VALIDES A LA RELECTURE : une entree mal formee gravee par une
   *   ancienne version ferait repondre l endpoint avec des adresses qui n en sont pas. */
  const i = srv.indexOf('for (const [j, c] of (x.createurs');
  const bloc = srv.slice(i, i + 400);
  assert.ok((bloc.match(/\^0x\[0-9a-fA-F\]\{40\}\$/g) || []).length >= 2,
    'la relecture ne valide plus les DEUX cotes de chaque entree');
});

v('⛔⛔ une liste VIDE ne doit jamais se lire comme « tu n as rien cree »', () => {
  /* ⛔⛔ L INDEX NE CONNAIT QUE CE QU IL A VU DEPUIS SON PREMIER SCAN. « pas encore indexe » et
   *     « tu n as rien cree » se ressemblent a l ecran et n ont RIEN a voir : le premier est une
   *     limite de notre instrument, le second une affirmation sur la personne. Confondre les deux,
   *     c est dire a quelqu un qu il n a rien fait parce que NOUS n avons pas regarde. */
  const i = srv.indexOf("chemin === '/api/blocks-de'");
  assert.notEqual(i, -1, 'l endpoint des blocks par createur a disparu');
  /* ⛔⛔ EXTRACTION PAR EQUILIBRAGE D ACCOLADES, PAS PAR FENETRE DE N CARACTERES. Ma premiere
   *     version coupait a 1800 caracteres : elle est tombee des que j ai ajoute `trous` et
   *     `plagesManquees` a la reponse — sur du code pourtant CORRECT. Une fenetre fixe se met a
   *     mesurer autre chose des que le bloc grossit, et le reflexe est d agrandir le nombre : ce
   *     qui ne fait que repousser le moment ou elle debordera sur le bloc SUIVANT, en restant
   *     verte sur lui. C est le meme piege qu un test qui tient la mauvaise moitie. */
  const debut = srv.indexOf('{', i);
  let prof = 0, fin = debut;
  for (let k = debut; k < srv.length; k++) {
    if (srv[k] === '{') prof++;
    else if (srv[k] === '}') { prof--; if (prof === 0) { fin = k + 1; break; } }
  }
  const bloc = srv.slice(debut, fin);
  assert.ok(/borne:/.test(bloc), 'la reponse ne porte plus sa borne');
  assert.ok(/never "you created nothing"/.test(bloc),
    'la borne ne dit plus explicitement qu une liste vide n est pas une absence de creation');
  assert.ok(/blocksIndexes/.test(bloc) && /blocksSuivis/.test(bloc),
    'la reponse ne dit plus COMBIEN l index connait : impossible de juger ce que son vide vaut');
});

v('⛔⛔ le PASSE est rattrape — sans quoi le correctif ne repare rien pour personne', () => {
  /* ⛔⛔ MESURE JUSTE APRES LA PREMIERE MISE EN LIGNE : `blocksIndexes: 1` pour
   *     `blocksSuivis: 1967`. L index ne se remplissait que vers L AVANT — il resolvait les
   *     createurs des creations qu il voyait PASSER. Les blocks DEJA crees, c est-a-dire tous ceux
   *     des gens aujourd hui, n auraient JAMAIS ete rattaches.
   *   ⇒ Un correctif qui ne couvre que l avenir laisse le probleme ENTIER a ceux qui l ont
   *     signale. C est ce cas qui l empeche de repasser. */
  assert.ok(/let rattrapageDepuis = null;/.test(srv), 'le rattrapage du passe a disparu');
  assert.ok(/rattrapageDepuis > PREMIER_BLOCK_TB/.test(srv),
    'le rattrapage ne s arrete plus au premier block de TBLOCK : il scannerait le vide indefiniment');
  /* ⛔⛔ CETTE ASSERTION A ETE REECRITE, ET LA RAISON EST UNE MESURE. J exigeais « on n avance QUE
   *     si la fenetre a ete lue » — intention juste, ne jamais sauter de creations en silence.
   *     MAIS SA CONSEQUENCE ETAIT UN BLOCAGE PERMANENT. Log de production :
   *     « rattrapage 51812621..51855821 · +0 · ⛔ 2 fenetre(s) refusee(s), on ne descend pas »,
   *     curseur immobile sur deux deploiements. Un rattrapage qui n avance jamais ne rattrape rien :
   *     la prudence absolue etait devenue la panne.
   *   ⇒ LA BONNE REPONSE N EST PAS DE SAUTER EN SILENCE, C EST DE SAUTER EN L ECRIVANT. On reessaie
   *     deux fois, puis on descend en GARDANT la plage manquee — et l endpoint la publie. */
  assert.ok(/refusDeSuite/.test(srv), 'le compteur de refus a disparu : le rattrapage pourrait se figer');
  assert.ok(/trousRattrapage\.push\(\{ de: bas, a: haut/.test(srv),
    'les plages sautees ne sont plus gardees : un trou invisible vaut pire qu un index incomplet');
  assert.ok(/\+\+refusDeSuite >= 3/.test(srv),
    'le rattrapage descend sans avoir reessaye : une panne passagere creerait un trou evitable');
  /* ⛔ ET L AVANCEMENT EST PERSISTE : sinon chaque deploiement recommencerait depuis le present et
   *   ne finirait jamais le passe. */
  assert.ok(/rattrapageDepuis,/.test(srv) && /x\.rattrapageDepuis === "number"/.test(srv),
    'l avancement du rattrapage n est plus persiste : le passe ne serait jamais fini');
});

v('⛔⛔ `couvertureComplete` est CALCULEE — une sortie constante n est pas une mesure', () => {
  /* ⛔⛔ Un `false` ecrit en dur serait un aveu permanent qui cesserait d informer ; un `true` en
   *     dur serait un mensonge. Et c est precisement ce drapeau qui decide si une liste vide veut
   *     dire « pas encore indexe » ou « tu n as rien cree ». */
  assert.ok(!/couvertureComplete: false,/.test(srv),
    'la couverture est de nouveau ecrite en dur : elle ne dirait plus rien de reel');
  assert.ok(/couvertureComplete: rattrapageDepuis !== null && rattrapageDepuis <= PREMIER_BLOCK_TB/.test(srv),
    'la couverture n est plus derivee de l avancement reel du rattrapage');
  /* ⛔⛔ ET ATTEINDRE LE PREMIER BLOCK NE SUFFIT PAS : si des plages ont ete sautees en chemin, on
   *     se declarerait complet avec des creations manquantes, et une liste vide redeviendrait un
   *     mensonge — exactement le defaut qu on repare. Les DEUX conditions, jamais une seule. */
  assert.ok(/&& trousRattrapage\.length === 0/.test(srv),
    'la couverture se dit complete malgre des plages sautees : le vide recommencerait a mentir');
  /* ⛔ ET LES TROUS SONT PUBLIES : c est ce qui rend le saut acceptable. Un trou nomme se rattrape,
   *   un trou tu ne se rattrape jamais. */
  assert.ok(/plagesManquees: trousRattrapage\.slice/.test(srv),
    'les plages manquees ne sont plus publiees : le saut redeviendrait invisible');
});

assert.equal(n, 8, 'compte de cas inattendu : ' + n);
console.log('ok mes-blocks-sans-fenetre — ' + n + ' cas.');
console.log('   La fenetre locale de 24 h est CALCULEE, l index serveur la complete, et les deux');
console.log('   FUSIONNENT au lieu de se remplacer — chacun couvre l angle mort de l autre.');
console.log('⚠️ NE PROUVE PAS que l index soit complet : il ne connait que les creations vues depuis');
console.log('   son premier scan, et sa reponse le dit. « pas encore indexe » n est pas « rien cree ».');
