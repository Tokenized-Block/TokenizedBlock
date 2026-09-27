/* test-lecteur-cl-branche.mjs — LE LECTEUR AERODROME EST-IL VRAIMENT BRANCHE DANS L APP ?
 *
 * ⛔⛔ CE QUI EST MESURE, ET CE QUI NE L EST PAS. `test-pool-cl.mjs` prouve que `pool-cl.js` LIT une
 *     pool CL (verifie contre DexScreener : 1092,944620140072 USDC contre 1092,94 — 0,00 % d ecart).
 *     Il ne prouve RIEN sur l app : un module parfait qu aucun ecran n appelle n affiche rien. C est
 *     exactement le defaut de `rachat.js` dans ce depot — 13 assertions vertes, importe par personne.
 *   ⇒ Ce fichier tient le CABLAGE : l import, la liste des modules servis, le declencheur, la garde
 *     de course, et la phrase. Chacun de ces cinq points, casse seul, rend le travail invisible.
 *
 * ⛔⛔ LE PLUS DANGEREUX DES CINQ EST LA LISTE `SERVIS` de `serveur-web.js` : un module importe par
 *     `app.html` et absent de cette liste rend un 404, donc le module de l app ne se charge plus,
 *     donc la page est MORTE — et elle repond 200. Incident du 2026-09-17, deja.
 *
 * ⚠️ CE QUE CE TEST NE PROUVE PAS : qu on puisse ECHANGER sur Aerodrome. Un hook v4 n y a aucun point
 *   d accroche (mesure : `slot0()` repond, `extsload(bytes32)` REVERTE) — c est un fork Uniswap v3.
 *   Il ne prouve pas non plus qu une vraie pool repond aujourd hui : il tient le cablage, pas le reseau.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const src = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const tr = readFileSync(new URL('./trending.js', import.meta.url), 'utf8');

/* ⛔ EQUILIBRAGE D ACCOLADES, PAS UNE FENETRE DE N CARACTERES : une fenetre fixe se met a mesurer la
 *   fonction SUIVANTE des que le fichier grossit, et devient verte sur elle. Deja paye. */
function corpsDe(nom, ou = src) {
  const i = ou.indexOf(nom);
  assert.notEqual(i, -1, 'introuvable : ' + nom);
  const debut = ou.indexOf('{', i);
  let p = 0;
  for (let k = debut; k < ou.length; k++) {
    if (ou[k] === '{') p++;
    else if (ou[k] === '}') { p--; if (p === 0) return ou.slice(debut, k + 1); }
  }
  assert.fail('accolades non equilibrees pour ' + nom);
}
/* ⛔ `SERVIS` EST UN TABLEAU, PAS UN BLOC : equilibrer `{` dessus trouverait la premiere accolade du
 *   fichier, bien plus loin, et le test deviendrait vert sur n importe quoi. */
function listeDe(nom, ou = srv) {
  const i = ou.indexOf(nom);
  assert.notEqual(i, -1, 'introuvable : ' + nom);
  const debut = ou.indexOf('[', i);
  let p = 0;
  for (let k = debut; k < ou.length; k++) {
    if (ou[k] === '[') p++;
    else if (ou[k] === ']') { p--; if (p === 0) return ou.slice(debut, k + 1); }
  }
  assert.fail('crochets non equilibres pour ' + nom);
}

cas('⛔⛔ `pool-cl.js` est dans la liste des modules SERVIS', () => {
  /* ⛔⛔ SANS CETTE LIGNE LA PAGE EST MORTE EN PRODUCTION ET REPOND 200. On ne cherche pas dans tout
   *     le fichier — le nom apparait aussi dans les commentaires : on cherche la CHAINE DE LISTE. */
  const liste = listeDe('const SERVIS');
  assert.ok(/'pool-cl\.js'/.test(liste),
    'pool-cl.js n est pas servi : app.html l importe, le navigateur recevrait un 404, et le module '
    + 'entier de l app ne se chargerait plus — carte vide, page a 200, /sante muet sur la page');
});

cas('⛔ l app IMPORTE le lecteur — un module non importe n affiche rien', () => {
  assert.ok(/import \{ lirePoolCL \} from '\.\/pool-cl\.js'/.test(src),
    'app.html n importe plus lirePoolCL : le lecteur redevient du code mort, comme rachat.js');
});

cas('⛔ la lecture est DECLENCHEE, et seulement quand une pool est connue', () => {
  assert.ok(/if \(!lueSurChaine && mkPublic && mkPublic\.poolAdr\) \{ try \{ lireMarcheCL\(/.test(src),
    'le declencheur a disparu ou ne verifie plus `poolAdr` : sans adresse de pool il n y a rien a '
    + 'interroger, et un `eth_call` vers `undefined` rendrait une erreur RPC loin de sa cause');
});

cas('⛔⛔ la lecture ne TOUCHE PAS `h.vie`', () => {
  /* ⛔⛔ `h.vie` nourrit le cerveau ET dimensionne la map, et sa conversion d unite est un piege
   *     identifie : elle est en devise de pool, pas en dollars. Y ecrire un prix CL changerait la
   *     taille des cubes et l humeur des blocks — un rayon d impact enorme pour un affichage. */
  const f = corpsDe('async function lireMarcheCL');
  assert.ok(!/\.vie\s*=/.test(f) && !/h\.vie/.test(f),
    'lireMarcheCL ecrit dans `h.vie` : la map et le cerveau se mettraient a bouger sur une lecture '
    + 'dont l unite n est pas celle qu ils attendent');
});

cas('⛔⛔ l ecriture est gardee sur LA FICHE ENCORE OUVERTE SUR CE BLOCK', () => {
  /* ⛔⛔ ENTRE LE CLIC ET LA REPONSE DU NOEUD, PHIL A PU OUVRIR UNE AUTRE CARTE. Sans cette garde on
   *     ecrirait le prix d un block sur la fiche d un autre : un nombre VRAI qui decrit autre chose,
   *     le defaut qui ne se voit jamais. C est le meme motif que la garde de `pool-cl.js` qui refuse
   *     une pool ne contenant pas le jeton. */
  const f = corpsDe('async function lireMarcheCL');
  assert.ok(/String\(f\.dataset\.block \|\| ''\)\.toLowerCase\(\) === bas/.test(f),
    'la garde d identite a disparu : le prix d un block pourrait s ecrire sur la fiche d un autre');
  assert.ok(/!f\.hidden/.test(f), 'on ecrit dans une fiche fermee — le prix apparaitrait a la reouverture');
});

cas('⛔ la phrase dit « read on chain », PAS « public market »', () => {
  /* ⛔ C EST TOUT L INTERET DU CHANGEMENT. Une lecture qui ne se distingue pas de celle d un tiers
   *   n apporte rien : le chiffre existait deja, via DexScreener, via le serveur. */
  const f = corpsDe('async function lireMarcheCL');
  assert.ok(/read on chain/.test(f), 'la ligne ne dit plus que le chiffre vient de NOTRE lecture');
  assert.ok(!/public market/.test(f),
    'la ligne CL dit « public market » : elle se confondrait avec le repli DexScreener, et le travail '
    + 'deviendrait invisible alors meme qu il fonctionne');
});

cas('⛔ un prix sans son UNITE ne dit rien — la devise est nommee', () => {
  /* ⛔ « 1092 » se lit en dollars par reflexe. MUc/USDC tombe juste par accident ; une pool contre
   *   WETH afficherait 0,4 et personne ne saurait en quoi. Et on ne l invente pas : si le symbole
   *   n a pas pu etre lu, on n ecrit pas d unite. */
  const f = corpsDe('async function lireMarcheCL');
  assert.ok(/r\.deviseSym \? ' ' \+ r\.deviseSym : ''/.test(f),
    'l unite n est plus conditionnee a un symbole REELLEMENT lu : soit elle disparait, soit elle '
    + 'serait devinee — et un prix mal etiquete est pire qu un prix absent');
});

cas('⛔⛔ les DECIMALES sont lues des DEUX cotes, jamais supposees', () => {
  /* ⛔⛔ USDC a 6 decimales, un block en a 18. Supposer 18 partout decale le prix de douze ordres de
   *     grandeur — et le resultat a l air d un nombre normal. */
  const f = corpsDe('async function lireMarcheCL');
  assert.ok(/metaJeton\(bas\)/.test(f) && /metaJeton\(devise\)/.test(f),
    'les decimales ne sont plus lues des deux cotes');
  assert.ok(/mj\.dec === null/.test(f) && /md\.dec === null/.test(f),
    'une decimale illisible ne coupe plus la lecture : le prix serait faux sans en avoir l air');
  const m = corpsDe('async function metaJeton');
  assert.ok(/n >= 0 && n <= 36/.test(m), 'les decimales ne sont plus bornees');
  /* ⛔ ET ON NE GRAVE PAS L ECHEC : un `null` en cache rendrait le jeton illisible pour la session
   *   entiere apres un simple hoquet du noeud. */
  assert.ok(/if \(dec === null\) return \{ dec: null, sym: '' \};/.test(m)
    && !/metaJetons\.set\(bas, \{ dec: null/.test(m),
    'un echec de lecture est mis en cache : un hoquet du noeud condamnerait ce jeton pour la session');
});

cas('⛔ une SEULE lecture par adresse, meme quand elle echoue', () => {
  /* ⛔ LE CACHE RETIENT LA PROMESSE, PAS LE RESULTAT. Retenir le resultat laisserait dix cartes
   *   ouvertes lancer dix lectures simultanees du meme block — et c est la simultaneite qui declenche
   *   la limite de debit du noeud public, donc le faux verdict « la pool ne repond pas ». */
  const f = corpsDe('async function lireMarcheCL');
  assert.ok(/if \(marcheCL\.has\(bas\)\) return marcheCL\.get\(bas\)/.test(f),
    'le cache ne court-circuite plus : chaque ouverture de carte relancerait la lecture');
  assert.ok(/marcheCL\.set\(bas, promesse\)/.test(f),
    'le cache retient autre chose que la promesse : deux lectures du meme block pourraient partir '
    + 'en parallele avant que la premiere revienne');
});

cas('⛔⛔ `trending.js` TRANSPORTE l adresse de la pool, validee', () => {
  /* ⛔⛔ UNE VALEUR LUE PUIS JETEE EST UN DEFAUT, et c etait le cas ici : on gardait `dex:
   *     'aerodrome'` — le NOM du marche — sans jamais garder OU il se trouve. Sans `poolAdr`, tout
   *     ce fichier ne peut rien declencher. */
  assert.ok(/poolAdr: \/\^0x\[0-9a-fA-F\]\{40\}\$\/\.test\(String\(p\.pairAddress/.test(tr),
    'trending.js ne transporte plus l adresse de la pool, ou ne la valide plus : une adresse mal '
    + 'formee traverserait jusqu a un eth_call et rendrait une erreur RPC loin de sa cause');
  assert.ok(/String\(p\.pairAddress\)\.toLowerCase\(\) : null/.test(tr),
    'l adresse absente ne rend plus `null` : le declencheur de l app teste `mkPublic.poolAdr`');
});

cas('⛔ le symbole se decode dans les DEUX formes ABI — rejoue', () => {
  /* ⛔ LES DEUX FORMES EXISTENT SUR BASE : `string` dynamique (offset/longueur/octets) et `bytes32`
   *   des vieux jetons. Ne gerer que la premiere rendrait un symbole vide, donc un prix sans unite. */
  /* ⛔ ON REJOUE LE CORPS REEL DE L APP, pas une copie : un jumeau plus faible ici passerait au vert
   *   pendant que l app rendrait des symboles vides. On enleve les accolades exterieures et on rend
   *   la fonction depuis son propre corps. */
  const corps = corpsDe('function texteAbi').slice(1, -1);
  const texteAbi = new Function('hex', corps);
  const mot = (s) => '0x' + Buffer.from(s, 'ascii').toString('hex').padEnd(64, '0');
  const dyn = '0x' + (32).toString(16).padStart(64, '0') + (4).toString(16).padStart(64, '0')
    + Buffer.from('USDC', 'ascii').toString('hex').padEnd(64, '0');
  assert.equal(texteAbi(dyn), 'USDC', 'la forme `string` dynamique ne se decode plus');
  assert.equal(texteAbi(mot('MKR')), 'MKR', 'la forme `bytes32` ne se decode plus');
  assert.equal(texteAbi('0x'), '', 'une reponse vide ne rend plus la chaine vide');
  /* ⛔ ET RIEN D ILLISIBLE NE PASSE : un symbole plein d octets de controle salirait la ligne. */
  assert.equal(texteAbi('0x' + '01'.repeat(32)), '', 'des octets de controle traversent le filtre');
});

assert.equal(n, 11, 'compte de cas inattendu : ' + n);
console.log('ok lecteur-cl-branche — ' + n + ' cas.');
console.log('   pool-cl.js est SERVI, importe, declenche sur `poolAdr`, ne touche pas `h.vie`, garde');
console.log('   l identite de la fiche, dit « read on chain » et nomme la devise lue.');
console.log('⚠️ NE PROUVE PAS qu on puisse ECHANGER sur Aerodrome (fork v3 : aucun point d accroche');
console.log('   pour un hook v4), ni qu une pool reelle repond aujourd hui : il tient le CABLAGE.');
