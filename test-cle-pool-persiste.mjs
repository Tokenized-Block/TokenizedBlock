/* test-cle-pool-persiste.mjs — UNE CLE LUE UNE FOIS NE SE RELIT JAMAIS, ET UN ECHEC NE SE FIGE PAS.
 *
 * ⛔⛔ CE QUI A DECLENCHE CE TEST, ET LE CHEMIN QUI M Y A MENE — AVEC MES DEUX ERREURS.
 *
 *     Phil : « ce block est endormi, de ta faute ou c est normal ? » Le block est MUc,
 *     `0xb200000000000000000000fd2f87532b90095211` (adresse COPIEE de /api/trending).
 *
 *     ⛔ PREMIERE CONCLUSION, FAUSSE : « MUc trade sur Aerodrome, notre lecteur est v4-only, donc
 *       aveugle ». L index public dit qu il a TROIS marches contre USDC, dont un **Uniswap v4**.
 *       Il y avait donc bien une pool v4 a lire.
 *     ⛔ DEUXIEME CONCLUSION, FAUSSE AUSSI : « on ne fait que deviner les PoolKeys ». La decouverte
 *       EXISTE — c est `/api/cle/`, et le client s en sert deja.
 *     ✅ LA VRAIE CAUSE, MESUREE : cette route repondait
 *       `{"ok":false,"pourquoi":"pool key not read: over rate limit"}`.
 *       Le noeud public etranglait la decouverte. Sans cle, le client retombe sur ses devinettes ;
 *       432 combinaisons essayees a la main ne retrouvent pas son poolId — un poolId est un HASH,
 *       on ne l inverse pas. Et pendant ce temps notre propre StateView lisait la pool sans broncher
 *       (`sqrtPriceX96 = 23726964141923096624193324578`).
 *     ⇒ L ecran disait « Market unread — that is about the network. Use Retry. » La cause etait
 *       juste, et le geste impossible : Retry retapait la meme route etranglee.
 *
 * ⛔ LE MEME ETRANGLEMENT CASSAIT AU MOINS TROIS AUTRES ECRANS LE MEME JOUR : « 5 window(s)
 *   refused » sur les detenteurs, « 17 window(s) refused » sur les blocks du visiteur, et la
 *   lecture de vie. UN point de defaillance, quatre ecrans muets.
 *
 * ⚠️ CE QUE CE CORRECTIF NE REPARE PAS : les trois autres ecrans, qui relisent des LOGS et non une
 *   cle. Leur remede de fond est un noeud a cle — et `BASE_RPC` est DEJA une variable
 *   d environnement, donc c est une configuration, pas du code.
 */
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const brut = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
/* ⛔ commentaires depouilles : ce fichier cite ses defauts en clair, y compris `ok: false`. */
const nu = brut.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\w])\/\/[^\n]*/g, '$1 ');

let n = 0;
const v = (nom, fn) => { fn(); n++; };

v('⛔⛔ un echec n est JAMAIS mis en cache', () => {
  /* ⛔ C EST L INVARIANT LE PLUS IMPORTANT DU FICHIER. Cacher un `ok:false` figerait un etranglement
   *   passager en verdict permanent — le defaut qu on corrige, rendu definitif. */
  const i = nu.indexOf('resoudreClePool(token).then');
  assert.ok(i > 0, 'la resolution de cle a disparu de la route');
  const corps = nu.slice(i, i + 700);
  assert.ok(/r\.ok === true && Array\.isArray\(r\.cles\) && r\.cles\.length/.test(corps),
    'la mise en cache ne verifie plus que la reponse est un SUCCES NON VIDE : un echec reseau '
    + 'deviendrait un verdict permanent');
  assert.ok(!/clesCache\.set\([^)]*\)\s*;\s*\}\s*catch/.test(corps.replace(/if \([^)]*\) \{/, '')),
    'la mise en cache semble inconditionnelle');
});

v('⛔ une cle connue ne redemande RIEN au noeud', () => {
  const i = nu.indexOf("chemin.startsWith('/api/cle/')");
  assert.ok(i > 0, 'la route /api/cle/ a disparu');
  const route = nu.slice(i, i + 1400);
  /* ⛔⛔ CETTE ASSERTION TESTAIT L ORDRE DU TEXTE, ET UNE MUTATION L A PROUVEE INERTE. En remplacant
   *     `const cleCache = clesCache.get(...)` par `const cleCache = null; const inutile =
   *     clesCache.get(...)`, l ordre des chaines restait identique et la garde verdissait — alors
   *     que le cache ne servait PLUS JAMAIS et que chaque visite retapait le noeud etrangle.
   *   ⇒ On n exige plus un ORDRE mais une SORTIE : le cache doit repondre et RENDRE LA MAIN avant
   *     toute resolution. C est la propriete, pas sa mise en page. */
  const iCache = route.indexOf('const cleCache = clesCache.get(token.toLowerCase());');
  assert.ok(iCache > 0,
    'la route ne lit plus le cache dans `cleCache` : elle pourrait le consulter sans s en servir');
  const branche = route.slice(iCache, route.indexOf('resoudreClePool('));
  assert.ok(/if \(cleCache\) \{[\s\S]*?res\.end\([\s\S]*?return;\s*\}/.test(branche),
    'la branche du cache ne REND PAS la main avant la resolution : une cle deja connue ferait '
    + 'quand meme taper le noeud');
  assert.ok(/depuisCache: true/.test(route),
    'la reponse ne dit plus qu elle vient du cache : on ne saurait pas distinguer un cache d une lecture');
});

v('⛔ le cache survit au redemarrage, et une ecriture ratee ne casse pas une lecture', () => {
  assert.ok(/const FICHIER_CLES = /.test(nu), 'le fichier de persistance a disparu');
  /* ⛔ ECRITURE ATOMIQUE : un fichier a moitie ecrit relu au demarrage injecterait des cles fausses. */
  assert.ok(/writeFileSync\(FICHIER_CLES \+ '\.tmp', payload\);/.test(nu)
    && /renameSync\(FICHIER_CLES \+ '\.tmp', FICHIER_CLES\);/.test(nu),
    'l ecriture n est plus atomique (.tmp puis rename) : un fichier a moitie ecrit serait relu');
  assert.ok(/if \(payload\.length > CLES_FICHIER_MAX_OCTETS\) return;/.test(nu),
    'la borne dure du fichier a disparu : le volume pourrait se remplir');
});

v('⛔ un fichier abime ne fabrique pas de fausses cles', () => {
  const i = nu.indexOf('function relireCles()');
  assert.ok(i > 0, 'la relecture au demarrage a disparu');
  const corps = nu.slice(i, i + 900);
  assert.ok(/v\.ok === true && Array\.isArray\(v\.cles\) && v\.cles\.length/.test(corps),
    'la relecture accepte des entrees mal formees : une cle vide ferait croire au client qu il a '
    + 'une reponse, et il cesserait de chercher');
  assert.ok(/catch \(err\)/.test(corps),
    'un fichier illisible ferait tomber le demarrage du serveur');
});

v('⛔ le PRIX n est jamais mis en cache ici — seule la cle l est', () => {
  /* ⛔ Une PoolKey est immuable : elle est le hash de ses propres champs, donc la garder pour
   *   toujours n est pas un pari sur la fraicheur. Un prix, lui, change a chaque echange. */
  const i = nu.indexOf('const clesCache = new Map()');
  assert.ok(i > 0, 'le cache de cles a disparu');
  assert.ok(!/clesCache\.set\([^)]*(prix|sqrt|slot0|vie)/i.test(nu),
    'quelque chose ressemblant a un prix entre dans le cache de cles : il serait servi perime');
});

assert.equal(n, 5, 'compte de cas inattendu : ' + n);
console.log('ok cle-pool-persiste — ' + n + ' cas.');
console.log('   Une cle lue une fois est servie sans toucher au noeud ; un echec n est jamais fige ;');
console.log('   le fichier est atomique, borne, et un fichier abime ne fabrique pas de fausses cles.');
console.log('⚠️ NE REPARE PAS les trois autres ecrans casses par le meme etranglement (detenteurs,');
console.log('   blocks du visiteur, lecture de vie) : ils relisent des LOGS, pas une cle.');
