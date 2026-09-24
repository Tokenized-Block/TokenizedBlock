/* test-onramp-fail-closed.mjs — LE RAIL FIAT REFUSE AU LIEU D INVENTER.
 *
 * ⛔⛔ CE QUE CE TEST GARDE. Le rail fiat->Base demande une cle secrete CDP que je n ai pas et ne
 *     dois pas avoir. Le danger n est donc PAS qu il marche mal : c est qu il ait l AIR de marcher.
 *     Une URL Coinbase construite sans `sessionToken` est syntaxiquement parfaite et mene a une
 *     page d erreur : l utilisateur clique « ajouter des fonds par carte », arrive sur une erreur,
 *     et personne ne sait pourquoi. Un bouton qui echoue en silence coute plus cher qu un bouton
 *     absent, parce qu il consomme la confiance en plus du temps.
 *
 * ⛔ CE TEST NE PROUVE PAS QUE LE RAIL FONCTIONNE. Il prouve qu il REFUSE proprement tant que la
 *    cle manque, et qu il construirait la bonne URL si le jeton existait. L appel reseau a Coinbase
 *    et la signature du JWT restent NON EXERCES — aucune cle ici. C est dit, et ce n est pas
 *    presente comme un vert.
 */
import { strict as assert } from 'node:assert';
import { etatCdp, validerDemande, urlOnramp, creerSession,
  RESEAU_ONRAMP, ACTIFS_ONRAMP, FIAT_MIN, FIAT_MAX } from './onramp-session.js';

let n = 0;
const v = (nom, fn) => { fn(); n++; };
const va = async (nom, fn) => { await fn(); n++; };

/* ───────── l etat des identifiants ───────── */

v('sans rien dans l environnement, le rail se dit NON PRET et NOMME ce qui manque', () => {
  const e = etatCdp({});
  assert.equal(e.pret, false);
  /* ⛔ la raison doit NOMMER la variable a poser : « non configure » enverrait chercher a l aveugle */
  assert.match(e.pourquoi, /CDP_API_KEY_ID/);
  assert.match(e.pourquoi, /CDP_API_KEY_SECRET/);
});

v('une seule des deux moities ne suffit pas — et le test dit LAQUELLE manque', () => {
  const sansSecret = etatCdp({ CDP_API_KEY_ID: 'organizations/x/apiKeys/y' });
  assert.equal(sansSecret.pret, false);
  assert.match(sansSecret.pourquoi, /secret missing/i,
    'une cle sans secret doit dire que le SECRET manque, pas « rien n est configure »');
  const sansCle = etatCdp({ CDP_API_KEY_SECRET: 'peu-importe' });
  assert.equal(sansCle.pret, false);
  assert.match(sansCle.pourquoi, /key id missing/i);
});

v('une valeur VIDE ou en espaces ne compte pas comme un identifiant', () => {
  /* ⛔ Railway rend `''` pour une variable declaree et jamais remplie. Sans ce cas, le rail se
   *    croirait pret, appellerait Coinbase avec un JWT vide et rendrait une erreur HTTP opaque. */
  for (const creux of ['', '   ', '\n']) {
    assert.equal(etatCdp({ CDP_API_KEY_ID: creux, CDP_API_KEY_SECRET: creux }).pret, false,
      'une variable declaree mais vide (' + JSON.stringify(creux) + ') a ete prise pour une cle');
  }
});

v('les deux moities presentes : le rail se dit pret, et ne rend JAMAIS le secret', () => {
  const e = etatCdp({ CDP_API_KEY_ID: 'abc', CDP_API_KEY_SECRET: 'SUPER-SECRET-NE-DOIT-PAS-SORTIR' });
  assert.equal(e.pret, true);
  /* ⛔⛔ LE CAS QUI COMPTE LE PLUS DE TOUT CE FICHIER : le secret ne doit apparaitre dans AUCUNE
   *     sortie. On rend le NOM de la variable, jamais sa valeur. */
  assert.doesNotMatch(JSON.stringify(e), /SUPER-SECRET/,
    'le secret a fuite dans l etat rendu — il finirait dans un log ou une reponse HTTP');
});

/* ───────── la validation de la demande ───────── */

v('pas d adresse entiere, pas de session', () => {
  /* ⛔ `never-complete-an-address` : une adresse tronquee enverrait l argent ailleurs. On exige
   *    les 40 hex, on ne complete jamais. */
  for (const mauvaise of [undefined, null, '', '0x', '0xa6cf', '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d',
    '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4f', 'pas-une-adresse']) {
    assert.equal(validerDemande({ adresse: mauvaise, montantFiat: 20 }).etat, 'REFUSE',
      'adresse acceptee alors qu elle est incomplete : ' + String(mauvaise));
  }
});

v('un montant ABSENT est ACCEPTE — mais un champ blanc est refuse', () => {
  /* ⛔⛔ CE CAS A CHANGE DE SENS LE 2026-09-24, ET IL FAUT DIRE POURQUOI. Il exigeait un montant, y
   *     compris ABSENT. C etait une erreur de ma part, et elle a tue le rail entier pendant une
   *     journee en production : le seul appelant n envoie pas de montant, donc la route rendait 400
   *     a chaque clic et le client retombait toujours sur le lien public. Un test vert gardait une
   *     regle fausse — le pire cas, parce qu il donnait confiance.
   *     ⇒ `presetFiatAmount` est FACULTATIF chez CDP. Coinbase demande le montant sur son propre
   *       ecran ; le pre-remplir est un confort, jamais une condition d existence du rail.
   *
   * ⛔ CE QUI RESTE, ET QUI COMPTE AUTANT : `Number(null) === 0` et `Number('') === 0`. Un champ
   *   PRESENT mais blanc ne doit donc jamais devenir « zero dollar » — c est la faute qui avait
   *   fait gagner une pool a frais illisibles au classement « la moins chere ». Absent et vide
   *   sont deux choses differentes et le restent. */
  const adr = '0x' + 'a'.repeat(40);
  for (const absent of [undefined, null]) {
    const r = validerDemande({ adresse: adr, montantFiat: absent });
    assert.equal(r.etat, 'OK', 'montant ' + String(absent) + ' refuse : le rail redevient inatteignable');
    assert.equal(r.montantFiat, null, 'un montant absent est devenu un nombre — il vaudrait 0');
  }
  const blanc = validerDemande({ adresse: adr, montantFiat: '' });
  assert.equal(blanc.etat, 'REFUSE', 'un champ soumis blanc a ete lu comme un montant');
  assert.match(blanc.pourquoi, /blank/i);
});

v('NaN et l infini sont refuses — ils passent a travers toutes les bornes', () => {
  /* ⛔ `nan-walks-through-every-bound` : `NaN < 2` et `NaN > 500` sont TOUS DEUX faux. Un test de
   *    borne sans test de finitude echoue OUVERT. */
  for (const mauvais of ['abc', NaN, Infinity, -Infinity, {}]) {
    assert.equal(validerDemande({ adresse: '0x' + 'a'.repeat(40), montantFiat: mauvais }).etat, 'REFUSE',
      'montant non fini accepte : ' + String(mauvais));
  }
});

v('les bornes de montant tiennent des DEUX cotes', () => {
  const adr = '0x' + 'a'.repeat(40);
  assert.equal(validerDemande({ adresse: adr, montantFiat: FIAT_MIN - 0.01 }).etat, 'REFUSE');
  assert.equal(validerDemande({ adresse: adr, montantFiat: FIAT_MAX + 0.01 }).etat, 'REFUSE');
  assert.equal(validerDemande({ adresse: adr, montantFiat: FIAT_MIN }).etat, 'OK', 'la borne basse elle-meme doit passer');
  assert.equal(validerDemande({ adresse: adr, montantFiat: FIAT_MAX }).etat, 'OK', 'la borne haute elle-meme doit passer');
});

v('le refus de montant DIT que la borne est la NOTRE, pas celle de Coinbase', () => {
  /* ⛔ `anti-hype` a l envers : attribuer notre prudence a Coinbase serait une affirmation sur un
   *    tiers que je n ai pas mesuree. */
  const r = validerDemande({ adresse: '0x' + 'a'.repeat(40), montantFiat: 9999 });
  assert.match(r.pourquoi, /our own caution bound/i,
    'le refus laisse croire que la limite vient de Coinbase — non mesure');
});

v('seuls ETH et USDC passent : on ne fait pas entrer un actif qu on ne sait pas depenser', () => {
  const adr = '0x' + 'a'.repeat(40);
  for (const bon of ACTIFS_ONRAMP) {
    assert.equal(validerDemande({ adresse: adr, montantFiat: 20, actif: bon }).etat, 'OK');
    assert.equal(validerDemande({ adresse: adr, montantFiat: 20, actif: bon.toLowerCase() }).etat, 'OK',
      'la casse de l actif ne doit pas faire echouer une demande valide');
  }
  for (const mauvais of ['BTC', 'SOL', 'EURC', 'DAI', '']) {
    assert.equal(validerDemande({ adresse: adr, montantFiat: 20, actif: mauvais }).etat, 'REFUSE',
      'actif accepte alors qu aucun de nos chemins ne le consomme : ' + mauvais);
  }
});

v('un stablecoin EURO est refuse — interdit explicitement ici', () => {
  /* ⛔ Regle de Phil, verbatim : « fait attention pas tomber ds le piege avec euro stablecoin c est
   *    ban ici ». Le cas est ecrit pour que personne ne l ajoute a ACTIFS_ONRAMP par commodite. */
  const adr = '0x' + 'a'.repeat(40);
  for (const euro of ['EURC', 'EURT', 'EUROC', 'AGEUR']) {
    assert.equal(validerDemande({ adresse: adr, montantFiat: 20, actif: euro }).etat, 'REFUSE', euro + ' accepte');
  }
  assert.ok(!ACTIFS_ONRAMP.some((a) => /^EUR/i.test(a)),
    'un stablecoin euro est entre dans la liste des actifs : interdit ici');
});

/* ───────── l URL ───────── */

v('SANS jeton de session, AUCUNE url n est rendue', () => {
  /* ⛔⛔ LE CAS CENTRAL. La doc CDP : `sessionToken` Required: Yes. Une url sans lui mene a une
   *     page d erreur. On refuse plutot que de livrer un bouton casse. */
  for (const rien of [undefined, null, '', '   ', 42]) {
    const r = urlOnramp({ sessionToken: rien, montantFiat: 20 });
    assert.equal(r.etat, 'REFUSE', 'une url a ete fabriquee sans jeton (' + String(rien) + ')');
    assert.equal(r.url, undefined, 'un champ url existe malgre le refus : l appelant l utiliserait');
  }
});

v('avec un jeton, l url porte le jeton, Base, et le bon actif', () => {
  const r = urlOnramp({ sessionToken: 'jeton-de-test', actif: 'USDC', montantFiat: 25 });
  assert.equal(r.etat, 'OK');
  const u = new URL(r.url);
  assert.equal(u.origin + u.pathname, 'https://pay.coinbase.com/buy/select-asset');
  assert.equal(u.searchParams.get('sessionToken'), 'jeton-de-test');
  assert.equal(u.searchParams.get('defaultNetwork'), RESEAU_ONRAMP);
  assert.equal(u.searchParams.get('defaultAsset'), 'USDC');
  assert.equal(u.searchParams.get('presetFiatAmount'), '25');
});

v('le reseau est TOUJOURS Base — jamais une autre chaine', () => {
  /* ⛔ Sur une autre chaine, les blocks n existent pas : les fonds arriveraient la ou rien ne peut
   *    les depenser. Le reseau n est donc pas un parametre de l appelant. */
  assert.equal(RESEAU_ONRAMP, 'base');
  const u = new URL(urlOnramp({ sessionToken: 'j' }).url);
  assert.equal(u.searchParams.get('defaultNetwork'), 'base');
});

v('un montant absent ou nul ne pose PAS de presetFiatAmount', () => {
  /* ⛔ `presetFiatAmount=0` afficherait un achat de zero dollar. Mieux vaut laisser Coinbase
   *    demander le montant que d en pre-remplir un impossible. */
  for (const rien of [null, undefined, 0, '', NaN]) {
    const u = new URL(urlOnramp({ sessionToken: 'j', montantFiat: rien }).url);
    assert.equal(u.searchParams.get('presetFiatAmount'), null,
      'un montant vide (' + String(rien) + ') a ete pre-rempli');
  }
});

v('un redirectUrl non https est IGNORE, pas transmis', () => {
  for (const mauvais of ['http://exemple.test/retour', 'javascript:alert(1)', 'pas-une-url', '']) {
    const u = new URL(urlOnramp({ sessionToken: 'j', retour: mauvais }).url);
    assert.equal(u.searchParams.get('redirectUrl'), null, 'retour non https transmis : ' + mauvais);
  }
  const bon = new URL(urlOnramp({ sessionToken: 'j', retour: 'https://tokenizedblock.space/' }).url);
  assert.equal(bon.searchParams.get('redirectUrl'), 'https://tokenizedblock.space/');
});

/* ───────── la creation de session ───────── */

await va('sans identifiants, creerSession REFUSE et ne touche PAS au reseau', async () => {
  /* ⛔⛔ TEMOIN NEGATIF : on passe un fetch qui EXPLOSE. S il est appele, le test casse. Verifier
   *     seulement l etat rendu laisserait passer un appel reseau inutile — et, avec un JWT vide,
   *     une requete authentifiee ratee chez Coinbase a chaque clic. */
  let appele = 0;
  const r = await creerSession({ env: {}, adresse: '0x' + 'a'.repeat(40),
    fetchImpl: () => { appele++; throw new Error('le reseau ne devait PAS etre touche'); } });
  assert.equal(r.etat, 'NON_CONFIGURE');
  assert.equal(appele, 0, 'Coinbase a ete appele alors qu aucune cle n existe');
  assert.equal(r.sessionToken, undefined, 'un jeton est rendu sans cle : il serait fabrique');
});

await va('avec des identifiants mais SANS JWT signe, creerSession refuse encore', async () => {
  let appele = 0;
  const r = await creerSession({ env: { CDP_API_KEY_ID: 'a', CDP_API_KEY_SECRET: 'b' },
    adresse: '0x' + 'a'.repeat(40),
    fetchImpl: () => { appele++; throw new Error('pas ici'); } });
  assert.equal(r.etat, 'NON_CONFIGURE');
  assert.equal(appele, 0, 'appel reseau lance sans JWT : Coinbase rendrait un 401 opaque');
});

await va('un HTTP non-2xx de Coinbase ne devient JAMAIS un succes', async () => {
  /* ⛔ `neutral-return-swallows-failure` : sans ce cas, un 403 « trial mode » se lirait comme
   *    « pas de jeton » puis comme un bouton muet. On nomme le code. */
  const r = await creerSession({ env: { CDP_API_KEY_ID: 'a', CDP_API_KEY_SECRET: 'b', __CDP_JWT: 'jwt' },
    adresse: '0x' + 'a'.repeat(40),
    fetchImpl: async () => ({ ok: false, status: 403, json: async () => ({}) }) });
  assert.equal(r.etat, 'REFUSE_PAR_COINBASE');
  assert.match(r.pourquoi, /403/, 'le code HTTP n est pas rapporte : on chercherait a l aveugle');
});

await va('une reponse 200 SANS jeton est ILLISIBLE, pas un succes', async () => {
  const r = await creerSession({ env: { CDP_API_KEY_ID: 'a', CDP_API_KEY_SECRET: 'b', __CDP_JWT: 'jwt' },
    adresse: '0x' + 'a'.repeat(40),
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ message: 'ok' }) }) });
  assert.equal(r.etat, 'ILLISIBLE');
  assert.equal(r.sessionToken, undefined);
});

await va('une reponse bien formee rend le jeton, et l adresse part bien dans le corps', async () => {
  /* ⛔ `une valeur LUE puis JETEE est un defaut` : on verifie que l adresse demandee arrive
   *    VRAIMENT dans la requete. Sans ce cas, le rail creerait des sessions pour nulle part. */
  const adr = '0xa6cf99d35949c6cb911adb910078f4ca46f0f5d4';
  let corps = null;
  const r = await creerSession({ env: { CDP_API_KEY_ID: 'a', CDP_API_KEY_SECRET: 'b', __CDP_JWT: 'jwt' },
    adresse: adr,
    fetchImpl: async (_u, o) => { corps = JSON.parse(o.body);
      return { ok: true, status: 200, json: async () => ({ token: 'jeton-reel' }) }; } });
  assert.equal(r.etat, 'OK');
  assert.equal(r.sessionToken, 'jeton-reel');
  assert.equal(corps.addresses[0].address, adr, 'l adresse demandee n est pas celle envoyee a Coinbase');
  assert.deepEqual(corps.addresses[0].blockchains, ['base']);
});

await va('un fetch qui explose donne NON_MESURE — jamais « pas de cle » ni un succes', async () => {
  /* ⛔ `absence-of-evidence-vs-failure-to-look` : une panne reseau n est pas une absence de cle.
   *    Les confondre enverrait chercher une cle deja presente. */
  const r = await creerSession({ env: { CDP_API_KEY_ID: 'a', CDP_API_KEY_SECRET: 'b', __CDP_JWT: 'jwt' },
    adresse: '0x' + 'a'.repeat(40),
    fetchImpl: async () => { throw new Error('socket hang up'); } });
  assert.equal(r.etat, 'NON_MESURE');
  assert.notEqual(r.etat, 'NON_CONFIGURE', 'une panne reseau a ete rapportee comme une cle manquante');
});

/* ⛔⛔ LE COMPTE SE VERIFIE AVANT D IMPRIMER « ok », et ma premiere version faisait l inverse :
 *     elle affichait le succes puis mourait sur le compte. Un lecteur pressé — ou un journal de
 *     deploiement tronqué — aurait lu « ok » sur une suite en echec. Le verdict ne doit jamais
 *     s imprimer avant sa derniere garde. */
assert.equal(n, 22, 'compte de cas inattendu : ' + n
  + ' — un cas a ete ajoute ou silencieusement perdu');
console.log('ok onramp-fail-closed — ' + n + ' cas : le rail refuse proprement, ne fabrique aucune url,');
console.log('   et ne laisse pas fuiter le secret.');
console.log('⚠️ NON EXERCE : l appel reel a Coinbase et la signature du JWT. Aucune cle ici — ce test');
console.log('   ne prouve PAS que le rail encaisse, seulement qu il echoue proprement sans cle.');
