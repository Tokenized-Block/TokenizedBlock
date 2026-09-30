/* test-actions-emetteur.mjs — L ORIGINE D UNE LIGNE DE CLASSEMENT, ET POURQUOI UNE MARQUE
 * PARTIELLE EST PIRE QU AUCUNE.
 *
 * ⛔⛔ DECISION DE PHIL, 2026-09-30, sur « Biggest blocks » : UNE SEULE LISTE, avec l ORIGINE DITE.
 *     Sans marque, `NVDAc` en tete se lit comme le plus gros block LANCE ICI. Ce n en est pas un :
 *     c est une action tokenisee emise par Coinbase.
 *
 * ⛔⛔⛔ LA GARDE CENTRALE, ET ELLE N EST PAS EVIDENTE : notre registre porte QUINZE actions,
 *      l emetteur en declare QUARANTE. Marquer seulement nos quinze laisserait GMEc, DJTc, NFLXc,
 *      AMDc, RDDTc, HTZc, PFEc… NON MARQUEES — et une ligne non marquee se lit « block lance ici ».
 *      Une marque PARTIELLE transforme chaque oubli en fausse affirmation, alors qu une absence
 *      generale de marque n affirme rien. La retombee doit donc SE DIRE.
 *
 * ⚠️ BORNE : ce fichier est PUR. Il ne prouve pas que l API de l emetteur reponde aujourd hui, ni
 *    qu une adresse marquee soit un B20 (`eth_getCode == 0xef`), ni qu elle circule.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sansCommentaires } from './outils-test.js';
import { decodeActionsEmetteur, lireActionsEmetteur, estActionEmetteur, phraseActionsEmetteur,
  EMETTEUR_RETOMBEE, ETATS_EMETTEUR, LIBELLE_EMETTEUR, URL_EMETTEUR } from './actions-emetteur.js';
import { resumerTrending } from './trending.js';

let n = 0;
const cas = (t, f) => { n += 1; try { f(); } catch (e) { console.error('✗ ' + t); throw e; } };

/* ⛔ Trois entrees RECOPIEES de la reponse reelle du 2026-09-30 (HTTP 200, 40 entrees). */
const REEL = { tokens: [
  { contract_address: '0xb200000000000000000000C2e324d24d7eEcd1fb', symbol: 'AAPLc' },
  { contract_address: '0xb2000000000000000000007790ed6E48e06eD935', symbol: 'GMEc' },
  { contract_address: '0xB2000000000000000000000d8ce462E99ee7A47B', symbol: 'AMDc' },
] };

cas('⛔ LE DECODAGE REND DES ADRESSES MINUSCULES, DEDUPLIQUEES, AVEC LEURS SYMBOLES', () => {
  const r = decodeActionsEmetteur(REEL);
  assert.equal(r.etat, 'OK', r.pourquoi);
  assert.equal(r.adresses.length, 3);
  for (const a of r.adresses) assert.equal(a, a.toLowerCase(), 'une adresse n est pas en minuscules : la comparaison echouera');
  assert.equal(r.symboles['0xb2000000000000000000007790ed6e48e06ed935'], 'GMEc');
  /* un doublon ne compte qu une fois */
  const d = decodeActionsEmetteur({ tokens: [REEL.tokens[0], REEL.tokens[0]] });
  assert.equal(d.adresses.length, 1);
  /* ⛔ Le JSON en TEXTE marche aussi : l appelant ne doit pas avoir a deviner la forme. */
  assert.equal(decodeActionsEmetteur(JSON.stringify(REEL)).etat, 'OK');
});

cas('⛔⛔ UNE ENTREE SANS ADRESSE ENTIERE FAIT REFUSER TOUTE LA LISTE', () => {
  /* ⛔⛔ ON NE REND PAS UNE LISTE PARTIELLE. Ignorer l entree fautive marquerait moins d actions
   *     qu il n en existe, et chaque oubli deviendrait une ligne qui se lit « block lance ici ».
   *     Refuser tout fait retomber sur les quinze VERIFIEES, avec l etat qui le dit. */
  for (const mauvaise of ['0xb2', '', null, undefined, 42, '0xzzz', '0xb200000000000000000000c2e324d24d7eecd1f']) {
    const r = decodeActionsEmetteur({ tokens: [REEL.tokens[0], { contract_address: mauvaise, symbol: 'X' }] });
    assert.equal(r.etat, 'NON_MESURE', 'adresse ' + String(mauvaise) + ' acceptee -> ' + r.etat);
    assert.deepEqual(r.adresses, [], 'une liste partielle a ete rendue');
  }
});

cas('⛔⛔ UNE LISTE VIDE EST « NON MESURE », JAMAIS « l emetteur n a rien »', () => {
  /* ⛔⛔ ZERO NE PEUT PAS ETRE VRAI : l emetteur a des actions deployees et echangees. Rendre `OK`
   *     avec une liste vide ne marquerait RIEN, PARTOUT — et tout l ecran redeviendrait faux en
   *     silence. C est le motif du zero qu on ne peut pas distinguer d une panne. */
  const r = decodeActionsEmetteur({ tokens: [] });
  assert.equal(r.etat, 'NON_MESURE');
  assert.match(r.pourquoi, /cannot be true/i);
  for (const rien of [null, undefined, {}, 'pas du json', '{"autre":1}', 42, []]) {
    const x = decodeActionsEmetteur(rien);
    assert.equal(x.etat, 'NON_MESURE', 'entree ' + String(rien) + ' -> ' + x.etat);
    assert.ok(ETATS_EMETTEUR.includes(x.etat));
  }
});

cas('⛔⛔⛔ LA RETOMBEE SE DIT, ET ELLE AVOUE QU ELLE EST INCOMPLETE', () => {
  /* ⛔⛔ SI ELLE RENDAIT `OK`, personne ne saurait que 25 actions sur 40 sont non marquees — et
   *     chacune se lirait « block lance ici ». La raison DOIT nommer ce risque, pas seulement
   *     l echec : c est ce que l appelant a besoin de savoir pour ne pas croire son propre ecran. */
  return (async () => {
    const muet = await lireActionsEmetteur(async () => null);
    assert.equal(muet.etat, 'RETOMBEE', 'une API muette a rendu ' + muet.etat);
    assert.deepEqual(muet.adresses, [...EMETTEUR_RETOMBEE]);
    assert.match(muet.pourquoi, /UNMARKED/i, 'la retombee ne dit pas que des actions resteront non marquees');
    /* une API qui LEVE ne fait pas mourir l appelant */
    assert.equal((await lireActionsEmetteur(async () => { throw new Error('reseau'); })).etat, 'RETOMBEE');
    /* ⛔ ET LE CHEMIN HEUREUX REND `OK`, sinon la garde serait vraie par accident */
    let vue = null;
    const bonne = await lireActionsEmetteur(async (u) => { vue = u; return REEL; });
    assert.equal(bonne.etat, 'OK');
    assert.equal(vue, URL_EMETTEUR, 'ce n est pas l URL de l emetteur qui est appelee');
  })();
});

cas('⛔ LA RETOMBEE PORTE EXACTEMENT LES QUINZE VERIFIEES, EN MINUSCULES', () => {
  assert.equal(EMETTEUR_RETOMBEE.length, 15, 'la retombee a change de taille sans decision');
  for (const a of EMETTEUR_RETOMBEE) {
    assert.match(a, /^0xb2[0-9a-f]{38}$/, 'adresse de retombee mal formee ou pas en minuscules : ' + a);
  }
  assert.equal(new Set(EMETTEUR_RETOMBEE).size, 15, 'la retombee contient un doublon');
});

cas('⛔⛔ UNE ADRESSE ABSENTE N EST PAS PROUVEE « BLOC LANCE ICI »', () => {
  const liste = decodeActionsEmetteur(REEL).adresses;
  assert.equal(estActionEmetteur('0xb200000000000000000000C2e324d24d7eEcd1fb', liste), true, 'la casse casse la comparaison');
  assert.equal(estActionEmetteur('0xb2000000000000000000009f5206d54b428eb75b', liste), false, 'Aeon marquee a tort');
  /* ⛔ Entrees illisibles : `false`, et surtout AUCUNE levee — cette fonction tourne par ligne. */
  for (const rien of [null, undefined, '', '0xb2', 42, {}]) assert.equal(estActionEmetteur(rien, liste), false);
  assert.equal(estActionEmetteur('0xb200000000000000000000C2e324d24d7eEcd1fb', null), false, 'sans liste, tout serait marque');
});

/* ══ LE CABLAGE : la marque doit ARRIVER sur la ligne, et l ECRAN doit la montrer ══════════════ */
cas('⛔⛔⛔ `resumerTrending` MARQUE LA LIGNE, ET SEULEMENT LA BONNE', () => {
  const AAPLc = '0xb200000000000000000000c2e324d24d7eecd1fb';
  const AEON = '0xb2000000000000000000009f5206d54b428eb75b';
  const paire = (adr, sym) => ({ chainId: 'base', baseToken: { address: adr, symbol: sym, name: sym },
    quoteToken: { address: '0x4200000000000000000000000000000000000006', symbol: 'WETH' },
    priceUsd: '1', liquidity: { usd: 50000 }, volume: { h24: 1000, h1: 10 },
    txns: { h24: { buys: 1, sells: 1 } }, fdv: 1000, dexId: 'aerodrome',
    pairAddress: '0x853f5f1b92b16714fe6cda67caad0856b83c7ab9' });
  const r = resumerTrending([paire(AAPLc, 'AAPLc'), paire(AEON, 'Aeon')], [AAPLc, AEON],
    { actionsEmetteur: [AAPLc] });
  const par = new Map(r.lignes.map((l) => [l.sym, l]));
  assert.equal(par.get('AAPLc').emetteur, true, 'l action de l emetteur n est PAS marquee : elle se lira « block lance ici »');
  assert.equal(par.get('Aeon').emetteur, false, 'un block lance est marque « issued by Coinbase » : une fausse affirmation');
  /* ⛔⛔ SANS LISTE, RIEN N EST MARQUE — et surtout PAS TOUT. Marquer tout par defaut serait la
   *     pire des sorties : chaque block lance porterait le nom de Coinbase. */
  const nue = resumerTrending([paire(AAPLc, 'AAPLc')], [AAPLc], {});
  assert.equal(nue.lignes[0].emetteur, false, 'sans liste, la ligne est marquee quand meme');
  /* et la casse de la liste passee ne doit pas compter */
  const maj = resumerTrending([paire(AAPLc, 'AAPLc')], [AAPLc], { actionsEmetteur: [AAPLc.toUpperCase().replace('0X', '0x')] });
  assert.equal(maj.lignes[0].emetteur, true, 'une liste en majuscules ne marque plus rien');
});

cas('⛔⛔⛔ L ECRAN MONTRE LA MARQUE, ET LA COUPE NE CACHE PLUS TOUT BLOCK LANCE', () => {
  const brut = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  const html = sansCommentaires(brut, { minRetire: 5000 });
  /* ⛔ LE LIBELLE EST IMPORTE, PAS RECOPIE : deux copies d une phrase visible divergent, et c est
   *   alors l ECRAN qui affirme autre chose que ce que le serveur a mesure. */
  /* ⛔ L ASSERTION PORTE SUR LE LIEN, PAS SUR LA MISE EN FORME DE L IMPORT. La premiere version
   *   exigeait la ligne EXACTE a un seul nom ; ajouter la forme courte l a fait rougir alors que
   *   rien de ce qu elle protege n avait bouge. Une assertion qui tient la ponctuation plutot que
   *   la propriete rougit sur du travail correct, et on apprend a l ignorer. */
  assert.match(html, /LIBELLE_EMETTEUR as LIBELLE_EMETTEUR_UI/,
    'le libelle d origine n est pas importe : une seconde copie derivera');
  assert.match(html, /from '\.\/actions-emetteur\.js'/, 'le libelle ne vient pas du module qui le definit');
  assert.match(html, /b\.emetteur \?/, 'la ligne de classement ne regarde pas `emetteur`');
  assert.match(html, /LIBELLE_EMETTEUR_UI/, 'le libelle importe n est jamais affiche');
  assert.ok(!/issued by Coinbase/.test(html),
    'la phrase est RECOPIEE en dur dans app.html alors qu elle est importee : deux sources');
  /* ⛔⛔ LA MARQUE DOIT SURVIVRE A LA MISE EN PAGE. Une marque presente dans le DOM et ecrasee a
   *     zero par le voisin n avertit PERSONNE — faute deja payee ici avec des saluts poses dans un
   *     panneau `hidden`. `.rangNom` prend `flex:1`, donc la marque a besoin de `flex:0 0 auto`. */
  assert.match(html, /\.rangOrig\{[^}]*flex:0 0 auto/, '`.rangOrig` peut etre ecrasee par `.rangNom`');
  assert.match(html, /\.rangOrig\{[^}]*white-space:nowrap/, '`.rangOrig` peut etre coupee sur un mot');
  /* ⛔⛔⛔ ET LA MARQUE NE DOIT PAS ECRASER CE QU ELLE QUALIFIE. Mesure du 2026-09-30 a 375 px sur
   *      la PRODUCTION : la phrase longue prenait 97 px et laissait 39 px au nom — SIX symboles
   *      sur douze TRONQUES (`GOOGLc` demandait 51 px, `AMZNc` 46, `NVDAc` 44). Les lignes non
   *      marquees avaient 157 px : c etait ma marque, seule, qui coupait l identite du block.
   *      « GOOGL… issued by Coinbase » dit l origine d un block qu on ne sait plus nommer. */
  assert.match(html, /\.rangNom\{min-width:(\d+)px\}/, 'le nom du block n a pas de largeur plancher : la marque le tronquera');
  const min = Number(/\.rangNom\{min-width:(\d+)px\}/.exec(html)[1]);
  assert.ok(min >= 51, 'le plancher du nom est ' + min + ' px ; `GOOGLc` en demandait 51 a 375 px');
  /* ⛔⛔ DEUX FORMES EXCLUSIVES, ET ELLES BASCULENT ENSEMBLE — meme piege que la puce « ? » une
   *     heure plus tot : cacher l une sans montrer l autre laisse une marque VIDE, presente dans
   *     le DOM et muette a l ecran. */
  assert.match(html, /\.origCourt\{display:none\}/, 'la forme courte n est pas cachee par defaut : les DEUX s afficheraient');
  assert.match(html, /\.origLong\{display:none\} \.origCourt\{display:inline\}/,
    'sous la media query etroite, la forme longue est cachee SANS que la courte soit montree : marque vide');
  assert.match(html, /LIBELLE_EMETTEUR_COURT as LIBELLE_EMETTEUR_COURT_UI/,
    'la forme courte n est pas importee : une seconde copie de la phrase divergera');
  assert.ok(!/>Coinbase</.test(html), 'la forme courte est RECOPIEE en dur dans app.html alors qu elle est importee');
  /* ⛔⛔⛔ ET LA COUPE. Mesure du 2026-09-30 : les rangs 1 a 12 etaient TOUS des actions de
   *      l emetteur, le premier block lance (`Aeon`, 181 298 $) tombait au rang 13. Une coupe a
   *      DIX rendait un ecran ou AUCUN block lance n apparaissait jamais. */
  const m = /const MONTREES = (\d+);/.exec(html);
  assert.ok(m, '`MONTREES` est introuvable : la coupe est redevenue un nombre en dur');
  assert.ok(Number(m[1]) >= 13,
    'la liste montre ' + m[1] + ' lignes ; le premier block lance etait au rang 13 le 2026-09-30, '
    + 'donc aucune ne serait visible');
  assert.match(html, /cl\.classes\.slice\(0, MONTREES\)/, 'la coupe affichee n utilise pas `MONTREES`');
});

cas('⛔ LE SERVEUR SERT LE MODULE, SINON LA PAGE EST MORTE', () => {
  /* ⛔ Un import 404 arrete TOUT le module : la page se charge et ne fait plus rien. */
  const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
  assert.match(srv, /'actions-emetteur\.js'/, 'le module n est pas dans la liste des fichiers servis');
  assert.match(srv, /actionsEmetteur: em\.adresses/, 'la liste lue n est jamais passee a `resumerTrending`');
  assert.match(srv, /emetteurEtat: em\.etat/,
    'l etat de la lecture ne voyage pas : le client ne saura pas que la marque est partielle');
});

cas('⛔⛔⛔ UN CORPS DE CACHE PERSISTE D UNE FORME PERIMEE EST REFUSE', () => {
  /* ⛔⛔⛔ MESURE, PAS PRECAUTION. Le 2026-09-30, apres avoir ajoute `emetteur`/`emetteurEtat` et
   *      deploye, la production rendait `emetteurEtat: ABSENT` et 0 ligne marquee sur 226 lignes.
   *      Le code neuf tournait ; le CORPS venait du cache persiste sur le volume, ecrit par le code
   *      d avant. La reponse etait bien formee, simplement d une forme PERIMEE — rien ne pouvait
   *      le crier. Meme famille que l estampille de build reutilisee, qui aveugle la sonde.
   *    ⛔ ET LA VERSION SEULE NE SUFFIT PAS : elle dependait de ma memoire, et j avais oublie de
   *      l incrementer. Une liste blanche sans garde de derive tient jusqu au jour de l oubli. */
  const srv = readFileSync(new URL('./serveur-web.js', import.meta.url), 'utf8');
  assert.match(srv, /champsAttendus = \['emetteurEtat'\]/,
    'le chargement du cache disque ne verifie PAS la forme de la CHARGE : un payload perime sera '
    + 'servi apres deploiement, bien forme et faux');
  /* ⛔⛔ ET LA GARDE DOIT PORTER SUR LA LIGNE AUSSI. Verifier seulement l enveloppe laisserait
   *     passer un corps dont les LIGNES ont perdu un champ — et c est par ligne que l ecran decide :
   *     `quoteAdr` choisit entre une route a deux sauts et une a trois. Une garde qui ne regarde
   *     que l enveloppe est VRAIE et couvre la mauvaise moitie. */
  assert.match(srv, /champsLigne = \['emetteur', 'quoteAdr'\]/,
    'la garde de forme ne verifie pas les champs de LIGNE : un corps aux lignes amputees passerait');
  assert.match(srv, /parsed\.lignes\[0\] \|\| \{\}/, 'la garde de ligne ne lit aucune ligne');
  assert.match(srv, /disk cache ignored \(shape/,
    'le refus de forme ne se DIT pas dans les journaux : un cache ignore et un cache accepte se '
    + 'ressembleraient');
  /* ⛔ La garde ne doit pas jeter un cache LEGITIMEMENT vide (scan pas encore fait) : sinon on
   *   perdrait le cache a chaque demarrage froid. Elle est bornee aux corps qui ONT des lignes. */
  assert.match(srv, /\(parsed\.lignes \|\| \[\]\)\.length > 0/,
    'la garde de forme jetterait aussi un cache vide legitime');
  /* ⛔ Et la version reste bougee : elle couvre ce que la forme ne voit pas (un champ RENOMME). */
  const v = /const TRENDING_CACHE_VER = '([^']+)'/.exec(srv);
  assert.ok(v, '`TRENDING_CACHE_VER` a disparu');
  assert.notEqual(v[1], 'prebridge-v3',
    'la version du cache n a pas ete incrementee alors que la forme du payload a change');
});

cas('⛔ LA PHRASE EST VIDE SUR OK, ET PARLE SUR LES AUTRES', () => {
  assert.equal(phraseActionsEmetteur({ etat: 'OK', adresses: [] }), '');
  assert.match(phraseActionsEmetteur({ etat: 'RETOMBEE', pourquoi: 'muette' }), /not read/i);
  assert.match(phraseActionsEmetteur(null), /not read/i, 'un absent doit PARLER, seul un succes se tait');
  assert.equal(LIBELLE_EMETTEUR, 'issued by Coinbase', 'le libelle a change sans decision');
});

console.log('✓ test-actions-emetteur : ' + n + ' cas');
console.log('   L origine vient de la liste des 40 de l EMETTEUR, pas de nos 15 : marquer 15 sur 40');
console.log('   laisserait 25 actions lisibles comme des blocks lances. La retombee AVOUE l etre.');
console.log('   ⚠️ NE PROUVE PAS que l API reponde aujourd hui, ni qu une adresse marquee soit un B20.');
