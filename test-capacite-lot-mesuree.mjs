/* test-capacite-lot-mesuree.mjs — UN COMPTEUR DERRIERE LA PORTE LA PLUS ETROITE NE MESURE RIEN.
 *
 * ⛔⛔ LE DEFAUT, MESURE LE 2026-09-28. `groupe_propose` valait ZERO sur 354 visites. Deux lectures
 *     opposees tenaient dans ce meme zero :
 *       (a) aucun wallet de nos visiteurs ne sait grouper — un fait de marche, qui imposerait un
 *           CONTRAT pour echanger un block contre une action ;
 *       (b) l evenement n est emis QUE dans Instant Birth, apres `preflightInstantBirthEthFixe` (qui
 *           exige un solde) ET une simulation `eth_call` — donc personne n y arrive jamais.
 *     C etait (b). Le compteur etait place derriere la porte la plus etroite de l app, et son zero
 *     ressemblait trait pour trait a un verdict. Un zero qui NE PEUT PAS monter ne mesure rien.
 *
 * ⛔⛔ CE QUE CE FICHIER VERROUILLE, ET C EST LE CAS LE PLUS IMPORTANT : la nouvelle mesure est emise
 *     SUR LE CHEMIN DE CONNEXION, pas dans Instant Birth. Si quelqu un la deplace un jour derriere un
 *     preflight, ce test casse.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : que des wallets capables existent parmi nos visiteurs. Il prouve que la
 *   question peut enfin RECEVOIR une reponse — le denominateur est en place, le chiffre viendra.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { capaciteDeGroupement, peutGrouper, CAPACITES_LOT, etapeDeCapacite } from './groupe-wallet.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const casAsync = [];
const casA = (titre, f) => { n++; casAsync.push([titre, f]); };

const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
const serveur = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
const nu = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
const CHAINE_HEX = '0x2105';

/* ── un provider de test : il repond ce qu on lui dit, ou jette ce qu on lui dit ── */
const provider = (reponse) => ({ request: async () => {
  if (reponse instanceof Error) throw reponse;
  if (reponse === 'jamais') return new Promise(() => {});   /* ne repond jamais : le delai doit trancher */
  return reponse;
} });

cas('⛔⛔ la mesure est emise sur le chemin de CONNEXION, pas derriere un preflight', () => {
  /* ⛔ LA BORNE EST ANCREE SUR LA CONNEXION ET SUR LA FIN DE SA FONCTION. Un compteur qui
   *   retournerait dans Instant Birth repasserait ce test si on cherchait dans TOUT le fichier —
   *   c est exactement l erreur qui a produit le zero de depart. */
  const i = nu.indexOf("etape('wallet_connect_ok')");
  assert.notEqual(i, -1, 'le point de connexion reussie est introuvable');
  /* on regarde les ~4 000 caracteres qui SUIVENT la connexion : la mesure doit y etre */
  const apresConnexion = nu.slice(i, i + 4000);
  /* ⛔⛔ CETTE ASSERTION A ETE DURCIE APRES QU UNE MUTATION EST PASSEE. Elle cherchait
   *     `capaciteDeGroupement(` n importe ou dans le bloc. Mutation appliquee :
   *     `if (false) capaciteDeGroupement(…)` — l appel devenait INATTEIGNABLE et le test restait
   *     VERT, parce que le TEXTE etait toujours la. Un appel ecrit n est pas un appel atteint.
   *   ⇒ ON EXIGE UNE INSTRUCTION NUE EN DEBUT DE LIGNE : rien d autre que des espaces avant l appel.
   *     `if (false) `, `if (x) `, `&& ` ou un commentaire de code mort echouent tous ici. */
  assert.match(apresConnexion, /\n\s*capaciteDeGroupement\(\{ eth, compte, chaineHex/,
    'l appel de mesure n est plus une instruction NUE en debut de ligne : sous une condition, il '
    + 'redeviendrait inatteignable et son compteur rendrait un zero qui ressemble a un verdict de marche');
  /* ⛔ ET LES TROIS ETAPES NE SONT PLUS CHERCHEES DANS LE TEXTE. Mutation qui est passee :
   *   `ILLISIBLE: 'capacite_lot_non'` — les trois etats ecrases en deux, et pourtant la chaine
   *   `'capacite_lot_illisible'` survivait dans le `.catch` quelques lignes plus bas. La sonde
   *   trouvait la bonne chaine au MAUVAIS ENDROIT. La correspondance est desormais une fonction
   *   PURE, testee en l APPELANT — voir le cas dedie plus bas. */
  assert.ok(/etapeDeCapacite\(/.test(apresConnexion),
    'la correspondance capacite -> etape n est plus deleguee a `etapeDeCapacite` : ecrite sur place, '
    + 'un ecrasement des trois etats en deux ne serait pas detecte');
  /* ⛔⛔⛔ L INVARIANT NEGATIF, ET IL A FALLU TROIS MUTATIONS PASSEES POUR Y ARRIVER. Chercher la
   *      PRESENCE de `etapeDeCapacite(` ne prouve pas son USAGE partout : il suffit qu il subsiste
   *      dans le `.catch` pendant que le `.then` retombe sur un ternaire en ligne. C est exactement
   *      ce qui est arrive, apres deux durcissements.
   *    ⇒ L invariant robuste est NEGATIF ET GLOBAL : les noms d etapes ne vivent QUE dans
   *      `groupe-wallet.js`. Toute reapparition d un littéral `'capacite_lot_…'` dans `app.html`
   *      signe le retour de la correspondance sur place, ou qu elle soit ecrite.
   *    ⚠️ Les commentaires sont depouilles de `nu`, donc documenter ces noms reste possible — sinon
   *      cette garde interdirait d expliquer ce qu elle protege. */
  const litteraux = (nu.match(/'capacite_lot_[a-z_]*'/g) || []);
  assert.deepEqual(litteraux, [],
    'des noms d etapes sont ecrits en dur dans app.html (' + litteraux.join(', ') + ') : la '
    + 'correspondance doit rester dans `groupe-wallet.js`, ou un ecrasement des trois etats en deux '
    + 'reste invisible parce que le nom manquant survit ailleurs dans le fichier');
  /* ⛔ ET SURTOUT : la mesure NE DOIT PAS etre derriere le preflight d Instant Birth. On verifie que
   *   l appel arrive AVANT, dans le fichier, le point ou Instant Birth fait son preflight. */
  const iPreflight = nu.indexOf('preflightInstantBirthEthFixe(');
  const iMesure = nu.indexOf('capaciteDeGroupement(');
  assert.notEqual(iMesure, -1, 'la mesure est absente du fichier');
  if (iPreflight !== -1) {
    assert.ok(iMesure < iPreflight,
      'la mesure de capacite se trouve APRES le preflight d Instant Birth : elle ne pourrait plus '
      + 'etre atteinte que par ceux qui ont deja un solde suffisant et une simulation reussie');
  }
});

cas('⛔ la mesure ne BLOQUE pas la connexion', () => {
  const i = nu.indexOf("etape('wallet_connect_ok')");
  const bloc = nu.slice(i, i + 4000);
  const j = bloc.indexOf('capaciteDeGroupement(');
  /* ⛔ AUCUN `await` DEVANT L APPEL : une mesure qui fait attendre l utilisateur coute l usage
   *   qu elle mesure. On regarde les 24 caracteres qui precedent, pas tout le bloc. */
  const avant = bloc.slice(Math.max(0, j - 24), j);
  assert.ok(!/await\s*$/.test(avant), 'la mesure est attendue (`await`) : elle retarde la connexion');
  /* et elle est enveloppee : ni un rejet ni une exception ne doivent empecher de se connecter */
  assert.ok(/\.catch\(/.test(bloc.slice(j, j + 600)), 'un rejet de la mesure n est pas rattrape');
});

cas('⛔ les trois etapes sont DECLAREES cote serveur', () => {
  /* ⛔ Une etape non declaree est ignoree en silence par `/api/entonnoir` — elle compterait zero, et
   *   ce zero ressemblerait a nouveau a un fait. */
  for (const e of ['capacite_lot_oui', 'capacite_lot_non', 'capacite_lot_illisible']) {
    assert.ok(new RegExp("'" + e + "'").test(serveur), e + ' absente de ETAPES_ENTONNOIR');
  }
});

cas('⛔ les trois etats sont declares, et il y en a exactement trois', () => {
  assert.deepEqual([...CAPACITES_LOT], ['OUI', 'NON', 'ILLISIBLE']);
  assert.equal(CAPACITES_LOT.length, 3, 'deux etats melangeraient un refus du wallet et notre panne');
});

cas('⛔⛔ la correspondance capacite -> etape est APPELEE, pas cherchee dans du texte', () => {
  /* ⛔⛔ CE CAS EXISTE PARCE QU UNE MUTATION EST PASSEE : la correspondance vivait dans un objet
   *     litteral au milieu d `app.html`, et `ILLISIBLE: 'capacite_lot_non'` est passe inapercu — la
   *     chaine manquante survivait dans le `.catch` voisin, donc la recherche de texte la trouvait.
   *   ⇒ ON APPELLE. Trois entrees, TROIS sorties DISTINCTES : c est la propriete qui compte, et
   *     l ecraser casse ici immediatement. */
  assert.equal(etapeDeCapacite('OUI'), 'capacite_lot_oui');
  assert.equal(etapeDeCapacite('NON'), 'capacite_lot_non');
  assert.equal(etapeDeCapacite('ILLISIBLE'), 'capacite_lot_illisible');
  const sorties = new Set(CAPACITES_LOT.map(etapeDeCapacite));
  assert.equal(sorties.size, 3,
    'deux capacites partagent une etape : le compteur melangerait un refus du wallet et notre panne, '
    + 'et on reparerait la mauvaise chose');
  /* ⛔ FAIL-SAFE VERS `illisible` : une capacite inconnue est NOTRE aveuglement, jamais un refus.
   *   Se tromper dans ce sens sous-estime nos wallets capables ; dans l autre, on inventerait des
   *   refus et on irait construire un contrat pour rien. */
  for (const inconnu of [null, undefined, '', 'PEUT_ETRE', 'oui', 0, {}]) {
    assert.equal(etapeDeCapacite(inconnu), 'capacite_lot_illisible',
      JSON.stringify(inconnu) + ' doit tomber en illisible, jamais en refus');
  }
});

casA('⛔⛔ « on n a pas pu demander » n est JAMAIS compte comme un refus', async () => {
  /* ⛔ C EST LE COEUR DU TROISIEME ETAT. Ces trois situations sont NOTRE aveuglement. */
  const sansProvider = await capaciteDeGroupement({ eth: null, compte: '0xabc', chaineHex: CHAINE_HEX });
  assert.equal(sansProvider.capacite, 'ILLISIBLE');
  const sansCompte = await capaciteDeGroupement({ eth: provider({}), compte: null, chaineHex: CHAINE_HEX });
  assert.equal(sansCompte.capacite, 'ILLISIBLE');
  const muet = await capaciteDeGroupement({ eth: provider('jamais'), compte: '0xabc',
    chaineHex: CHAINE_HEX, delaiMs: 30 });
  assert.equal(muet.capacite, 'ILLISIBLE', 'un wallet qui ne repond jamais n est pas un wallet qui dit non');
  const reseau = await capaciteDeGroupement({ eth: provider(new Error('network gone')),
    compte: '0xabc', chaineHex: CHAINE_HEX });
  assert.equal(reseau.capacite, 'ILLISIBLE');
});

casA('⛔ une erreur de METHODE est une REPONSE : ce wallet ne sait pas grouper', async () => {
  /* ⛔ Un wallet qui ne connait pas `wallet_getCapabilities` a bel et bien repondu. Le classer
   *   ILLISIBLE gonflerait notre aveuglement et cacherait un vrai « non ». */
  const e4200 = Object.assign(new Error('Unsupported method'), { code: 4200 });
  assert.equal((await capaciteDeGroupement({ eth: provider(e4200), compte: '0xabc', chaineHex: CHAINE_HEX })).capacite, 'NON');
  const e32601 = Object.assign(new Error('Method not found'), { code: -32601 });
  assert.equal((await capaciteDeGroupement({ eth: provider(e32601), compte: '0xabc', chaineHex: CHAINE_HEX })).capacite, 'NON');
  const parTexte = new Error('the method does not exist');
  assert.equal((await capaciteDeGroupement({ eth: provider(parTexte), compte: '0xabc', chaineHex: CHAINE_HEX })).capacite, 'NON');
});

casA('⛔⛔ seul « supported » vaut OUI — « ready » reste un NON', async () => {
  /* ⛔ LECON DU 2026-09-19, CONSERVEE : pour un EOA, `ready` veut dire « possible APRES une mise a
   *   niveau EIP-7702 ». Le wallet ouvrirait une demande de conversion, surprenante et facile a
   *   refuser. La prendre pour un oui casserait le parcours de ceux qui disent non. */
  const rep = (s) => ({ [CHAINE_HEX]: { atomic: { status: s } } });
  assert.equal((await capaciteDeGroupement({ eth: provider(rep('supported')), compte: '0xabc', chaineHex: CHAINE_HEX })).capacite, 'OUI');
  for (const s of ['ready', 'unsupported', null, undefined, '', 'SUPPORTED']) {
    assert.equal((await capaciteDeGroupement({ eth: provider(rep(s)), compte: '0xabc', chaineHex: CHAINE_HEX })).capacite,
      'NON', 'status=' + JSON.stringify(s) + ' ne doit pas valoir OUI');
  }
  /* l ancienne forme `atomicBatch.supported === true` compte aussi */
  assert.equal((await capaciteDeGroupement({ eth: provider({ [CHAINE_HEX]: { atomicBatch: { supported: true } } }),
    compte: '0xabc', chaineHex: CHAINE_HEX })).capacite, 'OUI');
  /* mais pas une valeur seulement « truthy » */
  assert.equal((await capaciteDeGroupement({ eth: provider({ [CHAINE_HEX]: { atomicBatch: { supported: 'yes' } } }),
    compte: '0xabc', chaineHex: CHAINE_HEX })).capacite, 'NON');
  /* une reponse sans notre chaine est une REPONSE, pas un silence */
  assert.equal((await capaciteDeGroupement({ eth: provider({ '0x1': { atomic: { status: 'supported' } } }),
    compte: '0xabc', chaineHex: CHAINE_HEX })).capacite, 'NON');
});

casA('⛔⛔ la DECISION reste fail-closed : ILLISIBLE ne prend pas la voie une-signature', async () => {
  /* ⛔ Le troisieme etat sert la MESURE, jamais la decision. Si `peutGrouper` se mettait a rendre
   *   vrai sur un ILLISIBLE, on tenterait un lot atomique sur un wallet qui n a rien confirme. */
  assert.equal(await peutGrouper({ eth: null, compte: '0xabc', chaineHex: CHAINE_HEX }), false);
  assert.equal(await peutGrouper({ eth: provider('jamais'), compte: '0xabc', chaineHex: CHAINE_HEX, delaiMs: 30 }), false);
  assert.equal(await peutGrouper({ eth: provider({ [CHAINE_HEX]: { atomic: { status: 'ready' } } }),
    compte: '0xabc', chaineHex: CHAINE_HEX }), false);
  /* temoin POSITIF : sans lui, un `peutGrouper` qui rend toujours faux passerait ce test, et le
   * parcours une-signature serait mort sans que rien ne le dise. */
  assert.equal(await peutGrouper({ eth: provider({ [CHAINE_HEX]: { atomic: { status: 'supported' } } }),
    compte: '0xabc', chaineHex: CHAINE_HEX }), true);
});

casA('⛔ `peutGrouper` DELEGUE : une seule logique, pas deux copies', async () => {
  /* ⛔ Deux implementations de cette regle divergeraient au premier correctif, et c est la voie
   *   SIGNANTE qui paierait l ecart. On verifie l accord sur toute la table, pas sur un cas. */
  const src = readFileSync(new URL('./groupe-wallet.js', import.meta.url), 'utf8');
  const i = src.indexOf('export async function peutGrouper');
  const corps = src.slice(i, src.indexOf('\n}', i));
  assert.ok(/capaciteDeGroupement\(/.test(corps), 'peutGrouper ne delegue plus');
  assert.ok(!/wallet_getCapabilities/.test(corps), 'peutGrouper redemande les capacites lui-meme : deuxieme copie');
  for (const rep of [{ [CHAINE_HEX]: { atomic: { status: 'supported' } } },
    { [CHAINE_HEX]: { atomic: { status: 'ready' } } }, {}, null]) {
    const eth = provider(rep);
    const a = (await capaciteDeGroupement({ eth, compte: '0xabc', chaineHex: CHAINE_HEX })).capacite === 'OUI';
    const b = await peutGrouper({ eth: provider(rep), compte: '0xabc', chaineHex: CHAINE_HEX });
    assert.equal(a, b, 'desaccord entre la mesure et la decision sur ' + JSON.stringify(rep));
  }
});

for (const [titre, f] of casAsync) { try { await f(); } catch (e) { console.error('✗ ' + titre); throw e; } }

assert.equal(n, 10, 'compte de cas inattendu : ' + n);
console.log('✓ test-capacite-lot-mesuree : ' + n + ' cas');
console.log('   La capacite de groupement est mesuree A LA CONNEXION, en TROIS etats.');
console.log('   ⚠️ NE PROUVE PAS que des wallets capables existent parmi nos visiteurs — prouve que');
console.log('      la question peut enfin recevoir une reponse.');
