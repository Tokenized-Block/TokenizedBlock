/* test-cdp-jwt.mjs — LA SIGNATURE CDP EST VRAIMENT VERIFIEE, AVEC UNE CLE FABRIQUEE ICI.
 *
 * ⛔⛔ L IDEE QUI REND CE TEST POSSIBLE. Je n ai pas de cle CDP et je ne dois pas en avoir. Mais la
 *     signature ES256 n a pas besoin de LA cle de Coinbase pour etre prouvee : elle a besoin d UNE
 *     cle EC P-256. On en fabrique une ephemere, en memoire, a chaque execution. Elle n est ecrite
 *     nulle part, elle n authentifie rien, elle meurt avec le processus.
 *     ⇒ La partie « est-ce que ca signe correctement » devient MESURABLE au lieu de rester une
 *       promesse. Seul reste non prouve : « est-ce que Coinbase l accepte ».
 *
 * ⛔ CE QUE CE TEST NE PROUVE TOUJOURS PAS, et qu il ne faut pas laisser croire : aucun appel reel
 *    n est fait. 0 dollar n est passe. Des cas verts ici ne veulent pas dire que le rail encaisse.
 */
import { strict as assert } from 'node:assert';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { signerJwtCdp, DUREE_JWT_S } from './cdp-jwt.js';

let n = 0;
const v = (nom, fn) => { fn(); n++; };

/* ⛔ CLE EPHEMERE, JAMAIS ECRITE SUR LE DISQUE. P-256 parce que c est la courbe que ES256 impose. */
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const APPEL = { cleId: 'organizations/essai/apiKeys/essai', secretPem: privateKey,
  methode: 'POST', hote: 'api.developer.coinbase.com', chemin: '/onramp/v1/token' };
const T0 = 1_700_000_000;
const dec = (p) => JSON.parse(Buffer.from(p.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

v('sans identifiant de cle, aucun jeton n est signe', () => {
  for (const rien of [undefined, null, '', '   ']) {
    const r = signerJwtCdp({ ...APPEL, cleId: rien, maintenantS: T0 });
    assert.equal(r.etat, 'REFUSE', 'un jeton a ete signe sans identifiant de cle');
    assert.equal(r.jwt, undefined, 'un champ jwt existe malgre le refus : l appelant l enverrait');
  }
});

v('sans secret, aucun jeton n est signe', () => {
  for (const rien of [undefined, null, '', '  ']) {
    const r = signerJwtCdp({ ...APPEL, secretPem: rien, maintenantS: T0 });
    assert.equal(r.etat, 'REFUSE');
    assert.equal(r.jwt, undefined);
  }
});

v('une cle illisible REFUSE au lieu de jeter — et ne recopie pas la cle dans l erreur', () => {
  /* ⛔ Une exception non attrapee ici ferait remonter la trace de node jusqu au journal HTTP. */
  const r = signerJwtCdp({ ...APPEL, secretPem: '-----BEGIN PRIVATE KEY-----\nPAS-UNE-CLE\n-----END PRIVATE KEY-----', maintenantS: T0 });
  assert.equal(r.etat, 'REFUSE');
  assert.doesNotMatch(String(r.pourquoi), /PAS-UNE-CLE/, 'le contenu de la cle est recopie dans le message d erreur');
});

v('la requete doit etre entierement decrite : methode, hote et chemin', () => {
  for (const champ of ['methode', 'hote', 'chemin']) {
    const r = signerJwtCdp({ ...APPEL, [champ]: '', maintenantS: T0 });
    assert.equal(r.etat, 'REFUSE', 'un jeton a ete signe sans ' + champ
      + ' : il serait rejouable sur une autre route');
  }
});

v('le jeton a trois parties, en base64url SANS remplissage', () => {
  const r = signerJwtCdp({ ...APPEL, maintenantS: T0 });
  assert.equal(r.etat, 'OK');
  const p = r.jwt.split('.');
  assert.equal(p.length, 3, 'un JWT a exactement trois parties');
  /* ⛔ Le `=` de remplissage et les caracteres `+` `/` du base64 ordinaire cassent un JWT : ils ne
   *   survivent ni a une URL ni a un en-tete. Un `=` oublie donne un 401 sans explication. */
  for (const part of p) assert.match(part, /^[A-Za-z0-9_-]+$/, 'partie non base64url : ' + part.slice(0, 12));
});

v('l en-tete annonce ES256 et porte l identifiant de cle', () => {
  const h = dec(signerJwtCdp({ ...APPEL, maintenantS: T0 }).jwt.split('.')[0]);
  assert.equal(h.alg, 'ES256');
  assert.equal(h.typ, 'JWT');
  assert.equal(h.kid, APPEL.cleId);
  assert.ok(typeof h.nonce === 'string' && h.nonce.length >= 16, 'nonce absent ou trop court');
});

v('deux jetons de suite ne partagent PAS le meme nonce', () => {
  /* ⛔ Un nonce constant rendrait deux jetons identiques rejouables. `clock-cannot-order-same-tick`
   *    vu de l autre cote : on fige l horloge EXPRES pour que seul le nonce puisse differer. */
  const a = dec(signerJwtCdp({ ...APPEL, maintenantS: T0 }).jwt.split('.')[0]);
  const b = dec(signerJwtCdp({ ...APPEL, maintenantS: T0 }).jwt.split('.')[0]);
  assert.notEqual(a.nonce, b.nonce, 'le nonce est constant : deux jetons du meme instant sont identiques');
});

v('la charge utile decrit EXACTEMENT la requete signee', () => {
  const c = dec(signerJwtCdp({ ...APPEL, maintenantS: T0 }).jwt.split('.')[1]);
  assert.equal(c.iss, 'cdp');
  assert.equal(c.sub, APPEL.cleId);
  assert.deepEqual(c.uris, ['POST api.developer.coinbase.com/onramp/v1/token'],
    'l uri signee ne decrit pas la route appelee : le jeton serait rejouable ailleurs');
});

v('la methode est mise en majuscules dans l uri signee', () => {
  const c = dec(signerJwtCdp({ ...APPEL, methode: 'post', maintenantS: T0 }).jwt.split('.')[1]);
  assert.deepEqual(c.uris, ['POST api.developer.coinbase.com/onramp/v1/token'],
    'une methode en minuscules produit une uri que le serveur ne reconnaitra pas');
});

v('la fenetre de validite fait exactement DUREE_JWT_S, a partir de l horloge donnee', () => {
  /* ⛔ Testable UNIQUEMENT parce que l horloge est un argument. Avec un `Date.now()` interne, ce cas
   *    n existerait pas et une fenetre de 2 heures passerait inapercue. */
  const c = dec(signerJwtCdp({ ...APPEL, maintenantS: T0 }).jwt.split('.')[1]);
  assert.equal(c.nbf, T0, 'le jeton ne demarre pas a l horloge donnee');
  assert.equal(c.exp, T0 + DUREE_JWT_S);
  assert.equal(DUREE_JWT_S, 120, 'CDP documente deux minutes');
});

v('⛔ LE CAS CENTRAL : la signature se VERIFIE avec la cle publique, en format JOSE brut', () => {
  /* ⛔⛔ Sans ce cas, tout le reste serait de la mise en forme. Un jeton peut avoir trois parties,
   *     les bons champs, la bonne fenetre — et une signature que personne ne peut verifier. */
  const r = signerJwtCdp({ ...APPEL, maintenantS: T0 });
  const [h, c, sig] = r.jwt.split('.');
  const ver = createVerify('SHA256');
  ver.update(h + '.' + c);
  ver.end();
  const brut = Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  assert.equal(brut.length, 64, 'une signature ES256 en format JOSE fait 64 octets (r‖s) — '
    + brut.length + ' octets veut dire du DER, que le serveur refusera avec un 401 muet');
  assert.equal(ver.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, brut), true,
    'la signature ne se verifie pas avec la cle publique correspondante');
});

v('⛔ TEMOIN NEGATIF : une charge utile modifiee CASSE la verification', () => {
  /* ⛔⛔ `probe-must-accuse-itself-first`. Une verification qui rend `true` sur n importe quoi ne
   *     prouve rien. On falsifie un octet de la charge utile et on EXIGE l echec. Sans ce cas, le
   *     cas precedent pourrait etre vert par accident. */
  const r = signerJwtCdp({ ...APPEL, maintenantS: T0 });
  const [h, c, sig] = r.jwt.split('.');
  const faux = dec(c); faux.sub = 'quelqu-un-d-autre';
  const cFaux = Buffer.from(JSON.stringify(faux)).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const ver = createVerify('SHA256');
  ver.update(h + '.' + cFaux);
  ver.end();
  assert.equal(ver.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(sig.replace(/-/g, '+').replace(/_/g, '/'), 'base64')), false,
    'une charge utile falsifiee passe la verification : la garde ne prouve rien');
});

v('le secret ne se retrouve dans AUCUN champ du resultat', () => {
  /* ⛔⛔ LE CAS QUI PROTEGE LA CLE DE PHIL. Tout ce qui sort d ici peut finir dans une reponse HTTP
   *     ou un journal Railway. */
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const r = signerJwtCdp({ ...APPEL, secretPem: pem, maintenantS: T0 });
  assert.equal(r.etat, 'OK');
  const rendu = JSON.stringify(r);
  assert.doesNotMatch(rendu, /BEGIN PRIVATE KEY/, 'la cle privee est rendue par la fonction');
  /* un fragment du corps de la cle, pour que le cas ne tienne pas qu a l en-tete PEM */
  const morceau = pem.split('\n')[1].slice(0, 24);
  assert.ok(morceau.length === 24 && !rendu.includes(morceau), 'un fragment de la cle privee a fuite');
});

assert.equal(n, 13, 'compte de cas inattendu : ' + n + ' — un cas a ete ajoute ou perdu');
console.log('ok cdp-jwt — ' + n + ' cas : signature ES256 VERIFIEE (format JOSE 64 octets), temoin');
console.log('   negatif rouge, fenetre de 120 s, et le secret ne sort pas.');
console.log('⚠️ NON PROUVE : que Coinbase accepte ce jeton. Aucune cle CDP ici, aucun appel reel,');
console.log('   0 $ encaisse. Ces cas verts ne disent RIEN sur le revenu.');
