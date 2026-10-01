/* test-echelle-marche.mjs — UN GRAND NOMBRE SANS SA QUALIFICATION EST UN MENSONGE.
 *
 * ⛔⛔ CE QUE CE FICHIER PROTEGE, ET CE N EST PAS UNE SOMME. L ecran Market affiche desormais des
 *     dizaines de millions de dollars de volume sur 24 h. Ce volume N EST PAS LE NOTRE : il passe
 *     sur des marches que notre index SUIT, ouverts par n importe qui sur Base, et rien de tout ca
 *     n est du revenu. Publie sans son libelle, ce total ferait passer l activite d autrui pour la
 *     notre — c est le mensonge le plus rentable de cet ecran, donc celui qu il faut verrouiller.
 *   ⇒ La somme et la PHRASE sortent du MEME appel. Un test verifie qu on ne peut pas obtenir l une
 *     sans l autre.
 *
 * ⛔ CE QUI RESTE HORS DE PORTEE : nos chiffres d exploitation (visites, blocks crees ici, echanges
 *   faits). Phil les a fait retirer de l ecran le 2026-09-23 — « retire, c est donnee privee ». Ce
 *   module ne les lit pas et n y a pas acces ; un cas ci-dessous l exige.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : que les chiffres soient justes. Ils viennent d un index public, et la
 *   somme ne vaut que ce que vaut la source. Il prouve que la somme est honnetement BORNEE et
 *   honnetement NOMMEE.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { echelleDesMarches, phraseEchelle, LIQ_MIN_ECHELLE_USD } from './echelle-marche.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

const ligne = (o) => ({ liquiditeUsd: 1000, volume24hUsd: 0, trades24h: 0, dex: 'uniswap', ...o });

cas('⛔⛔ RIEN RECU N EST PAS ZERO', () => {
  /* ⛔ Rendre des zeros pendant que l index charge afficherait « 0 $ de volume » — un zero de PANNE,
   *   indiscernable d un marche mort. Deux lectures opposees dans le meme chiffre. */
  for (const vide of [null, undefined, [], 'pas un tableau', 0]) {
    const r = echelleDesMarches(vide);
    assert.equal(r.etat, 'NON_LU', JSON.stringify(vide) + ' doit rendre NON_LU');
    assert.equal(r.volume24hUsd, undefined, 'aucun total ne doit sortir d une absence de donnees');
    assert.equal(r.phrase, undefined, 'aucune phrase sans chiffre, aucun chiffre sans phrase');
  }
  /* ⛔ ET « AUCUN MARCHE AU-DESSUS DU SEUIL » EST UN TROISIEME ETAT, distinct des deux : la donnee
   *   est arrivee, et elle dit quelque chose. */
  const rien = echelleDesMarches([ligne({ liquiditeUsd: 1 })]);
  assert.equal(rien.etat, 'AUCUN_MARCHE');
  assert.notEqual(rien.etat, 'NON_LU', 'lu-mais-vide et pas-encore-lu ne peuvent pas se confondre');
});

cas('⛔⛔ LA PHRASE EST RENDUE AVEC LES NOMBRES, TOUJOURS', () => {
  const r = echelleDesMarches([ligne({ volume24hUsd: 1e6 }), ligne({ volume24hUsd: 2e6 })]);
  assert.equal(r.etat, 'LU');
  assert.equal(r.volume24hUsd, 3e6);
  /* ⛔ LE COEUR DU TEST : un etat qui porte un total DOIT porter sa phrase. */
  assert.ok(r.phrase && r.phrase.length > 40, 'un total sans phrase se lira comme le notre');
});

cas('⛔⛔ LA PHRASE DIT SA SOURCE ET SES BORNES — ET NE SE DENIGRE PLUS', () => {
  const p = phraseEchelle({ blocks: 198, ecartees: 12 });
  /* ⛔⛔⛔ DECISION DE PHIL, 2026-09-30 : « this is not our volume, and none of it is our revenue »
   *      est RETIRE. Sa raison, et elle est juste : « c est l inverse de ce qu on doit faire ». On
   *      cable une route pour capter ce volume ; l ecran ne doit pas le declarer etranger.
   *    ⛔ GARDE NEGATIVE, ET C EST ELLE QUI TIENT LA DECISION. Sans elle la phrase reviendrait dans
   *      six semaines sans que personne s en apercoive : une decision produit qu aucun test ne
   *      garde est une decision qui se defait toute seule. */
  assert.ok(!/not our volume/i.test(p), 'la denegation « not our volume » est REVENUE');
  assert.ok(!/none of it is our revenue/i.test(p), 'la denegation « none of it is our revenue » est REVENUE');
  /* ⛔ ET ON N A PAS ECRIT L INVERSE : aucune promesse sur ce que le routeur atteint. 99,9 % de la
   *   liquidite des ACTIONS tokenisees est routable par `exactInput` — PAS les ~200 blocks de ce
   *   total. Retirer une denegation n autorise pas a la remplacer par une affirmation. */
  assert.ok(!/\bour (router|volume|revenue)\b/i.test(p),
    'la phrase s est mise a promettre quelque chose sur nous, et ce total ne le prouve pas');
  assert.match(p, /opened by anyone/i, 'la phrase ne dit plus qui ouvre ces marches');
  /* ⛔ ET ELLE DIT SA BORNE : les blocks sans marche lisible ne sont pas comptes. Sans ca, le total
   *   passerait pour exhaustif. */
  assert.match(p, /no readable market are not counted/i, 'la phrase ne dit plus sa borne');
  assert.match(p, /public index/i, 'la phrase ne nomme plus sa source');
  /* ⛔ ET LE REBUT EST ANNONCE : un total sans son rebut laisse croire qu on a tout compte. */
  assert.match(p, /12 thinner/i, 'les lignes ecartees ne sont plus annoncees');
  assert.ok(!/12 thinner/i.test(phraseEchelle({ blocks: 5, ecartees: 0 })),
    'sans rebut, la phrase ne doit pas en inventer');
});

cas('⛔ le seuil de liquidite ecarte le bruit, et le DIT', () => {
  /* ⛔ Une pool a quelques dollars fait du « volume » qui ne se traduit par aucun echange tenable.
   *   La compter gonflerait un chiffre presente comme une echelle — de la vente. */
  const r = echelleDesMarches([
    ligne({ liquiditeUsd: LIQ_MIN_ECHELLE_USD, volume24hUsd: 100 }),
    ligne({ liquiditeUsd: LIQ_MIN_ECHELLE_USD - 1, volume24hUsd: 999999 }),
  ]);
  assert.equal(r.blocks, 1, 'la ligne sous le seuil ne doit pas compter');
  assert.equal(r.volume24hUsd, 100, 'son volume ne doit pas entrer dans le total');
  assert.equal(r.ecartees, 1, 'le rebut doit etre compte');
  /* temoin positif a la borne : le seuil PILE passe, sinon la garde ecarterait tout */
  assert.equal(echelleDesMarches([ligne({ liquiditeUsd: LIQ_MIN_ECHELLE_USD })]).blocks, 1);
});

cas('⛔ une valeur absente ou absurde vaut zero, jamais NaN', () => {
  /* ⛔ NaN traverse toutes les bornes : `NaN >= seuil` est faux, mais `total + NaN` est NaN, et un
   *   total NaN s afficherait comme « $NaN » a l ecran. On neutralise a l entree. */
  const r = echelleDesMarches([ligne({ volume24hUsd: 'abc', trades24h: null }),
    ligne({ volume24hUsd: undefined, trades24h: -5 }), ligne({ volume24hUsd: 1000, trades24h: 3 })]);
  assert.equal(r.etat, 'LU');
  assert.ok(Number.isFinite(r.volume24hUsd), 'le total de volume n est pas un nombre fini');
  assert.ok(Number.isFinite(r.trades24h), 'le total de trades n est pas un nombre fini');
  assert.equal(r.volume24hUsd, 1000);
  assert.equal(r.trades24h, 3, 'un nombre de trades negatif ne doit pas retirer du total');
});

cas('⛔ la repartition par dex rend le total VERIFIABLE', () => {
  /* ⛔ Un seul grand nombre demande de nous croire. La repartition permet de retrouver ou vit cet
   *   argent — c est ce qui separe une mesure d une affiche. */
  const r = echelleDesMarches([
    ligne({ dex: 'aerodrome', liquiditeUsd: 5000, volume24hUsd: 10 }),
    ligne({ dex: 'uniswap', liquiditeUsd: 3000, volume24hUsd: 20 }),
    ligne({ dex: 'uniswap', liquiditeUsd: 1000, volume24hUsd: 30 }),
  ]);
  assert.equal(r.parDex.length, 2);
  assert.equal(r.parDex[0].dex, 'aerodrome', 'le plus profond en premier');
  assert.equal(r.parDex[1].blocks, 2);
  /* ⛔ LA SOMME DES PARTS DOIT EGALER LE TOTAL, sinon la repartition ne verifie rien. */
  assert.equal(r.parDex.reduce((a, d) => a + d.liquiditeUsd, 0), r.liquiditeUsd);
  assert.equal(r.parDex.reduce((a, d) => a + d.blocks, 0), r.blocks);
});

cas('⛔ un nom de dex hostile est borne avant d atteindre l ecran', () => {
  /* ⛔ `dex` vient d un index TIERS et finit dans du texte affiche. */
  const r = echelleDesMarches([ligne({ dex: '<img src=x onerror=alert(1)>' + 'a'.repeat(80) })]);
  assert.ok(r.parDex[0].dex.length <= 20, 'le nom du dex n est plus borne');
});

cas('⛔⛔ le module NE TOUCHE PAS a nos chiffres d exploitation', () => {
  /* ⛔⛔ PHIL A FAIT RETIRER CETTE CARTE LE 2026-09-23 : « retire, c est donnee privee ». Elle
   *     publiait visites, ouvertures de Create, blocks crees ici, marches ouverts, echanges faits.
   *     Ce module doit rester incapable d y acceder — sinon la decision serait contournee par le
   *     cote, et personne ne le verrait. */
  const src = readFileSync(new URL('./echelle-marche.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  for (const interdit of ['entonnoir', 'visite', 'cree', 'achat', 'wallet_connect', 'etape(']) {
    assert.ok(!src.includes(interdit), 'echelle-marche.js touche a ' + interdit
      + ' — ce sont les chiffres retires de l ecran le 2026-09-23');
  }
  /* ⛔ ET IL RESTE PUR : ni reseau, ni horloge. Il recoit des lignes deja lues. */
  for (const interdit of ['fetch(', 'Date.now', 'new Date', 'Math.random', 'document']) {
    assert.ok(!src.includes(interdit), 'echelle-marche.js contient ' + interdit + ' — il doit rester pur');
  }
});

cas('⛔ la carte des chiffres PRIVES reste cachee dans la page', () => {
  /* ⛔⛔ LA GARDE QUI TIENT LA DECISION DE PHIL. Ajouter une carte d echelle ne doit pas servir de
   *     pretexte a rouvrir celle qu il a fait retirer. Si `#carteStats` perd son `hidden`, ce test
   *     casse — et c est exactement ce qu on veut, parce que ce serait une decision produit, pas un
   *     detail d affichage.
   *   ⛔ ET LES DEUX ELEMENTS RESTENT DANS LA PAGE : `peindreStats` ecrit dedans, et une garde sur un
   *     element ABSENT est toujours fausse. */
  const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  assert.match(app, /<div class="carte" id="carteStats" hidden>/,
    'la carte des chiffres d exploitation n est plus cachee : Phil l a fait retirer le 2026-09-23, '
    + 'la rouvrir est SA decision, pas la notre');
  assert.ok(app.includes('id="statsLignes"') && app.includes('id="statsNote"'),
    'les deux elements ont disparu : `peindreStats` ecrirait dans le vide');
  /* ⛔⛔ ET ON N ECRIT PAS DANS UNE CARTE CACHEE — defaut trouve en PRODUCTION le 2026-09-28.
   *     Le `hidden` etait bien pose, mais `peindreStats` remplissait quand meme la carte : les
   *     chiffres d exploitation etaient LISIBLES DANS LE DOM servi (« Visits 362 · Opened Create 45
   *     · Blocks created here 6 »). `hidden` cache a l oeil, pas a la page. La decision de Phil
   *     avait obtenu « pas affiche » et non « pas divulgue », et l ecart etait invisible PARCE QUE
   *     l ecran etait propre. */
  const i = app.indexOf('async function peindreStats()');
  assert.notEqual(i, -1, '`peindreStats` est introuvable');
  const corps = app.slice(i, app.indexOf('\n}', i));
  assert.match(corps, /if \(carte && carte\.hidden\) return;/,
    '`peindreStats` ecrit de nouveau dans une carte cachee : les chiffres d exploitation '
    + 'redeviendraient lisibles dans le DOM servi, alors que Phil les a fait retirer');
  /* ⛔ et la nouvelle carte, elle, est VISIBLE — sinon on aurait livre une carte morte */
  assert.match(app, /<div class="carte" id="carteEchelle">/, 'la carte d echelle est absente ou cachee');
});

cas('⛔ l echelle est REPEINTE a l arrivee des donnees, pas seulement a l ouverture', () => {
  /* ⛔⛔ QUATRIEME FOIS QUE CE MOTIF SE PRESENTE DANS CE FICHIER. Calculee une seule fois a
   *     l ouverture de l onglet, la carte tomberait sur un `marcheParAdr` vide et afficherait
   *     « Reading the market… » POUR TOUJOURS — un chargement eternel, qui ne ressemble pas a un
   *     defaut. Les trois precedents : la garde `NON_TROUVEE`, les puces de paires, la decouverte. */
  const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  const appels = (app.match(/peindreEchelle\(\)/g) || []).length;
  assert.ok(appels >= 3, 'peindreEchelle doit etre DEFINIE et appelee a DEUX endroits au moins '
    + '(ouverture de l onglet + arrivee du trending) ; trouve ' + appels + ' occurrence(s)');
  /* ⛔ et l appel a l arrivee du trending doit etre juste apres celui de `peindrePaires`, qui est
   *   deja le point ou cette donnee atterrit — pas ailleurs, ou il repartirait en avance. */
  const i = app.indexOf('try { peindrePaires(); }');
  assert.notEqual(i, -1, 'le point d arrivee du trending est introuvable');
  assert.ok(app.slice(i, i + 900).includes('peindreEchelle()'),
    'l echelle ne se repeint pas a l arrivee du trending : elle restera sur « Reading the market… »');
});

cas('⛔⛔⛔ LA PUCE PAR DEX DIT LEQUEL DES DEUX CHIFFRES ELLE PORTE', () => {
  /* ⛔⛔⛔ TROUVE PAR LE GROK BOT A L ECRAN, PAS DANS LE CODE (canal Obsidian, 2026-10-01 19:33).
   *      Il a recopie les quatre chiffres affiches — `24h volume $99,244,632`,
   *      `Liquidity $27,416,881`, `on aerodrome $15,123,888`, `on uniswap $12,292,993` — puis il a
   *      fait l addition : 15 123 888 + 12 292 993 = 27 416 881, soit EXACTEMENT `Liquidity`.
   *      La ventilation etait donc celle de la LIQUIDITE, posee sous un titre `24h volume`, sans
   *      rien a l ecran pour le dire. Aucun test unitaire ne pouvait voir ca : le module rendait
   *      bien `liquiditeUsd` ET `volume24hUsd`, et le cas « la somme des parts egale le total »
   *      juste au-dessus passait — sur la liquidite. Le defaut etait dans l ETIQUETTE, c est-a-dire
   *      dans la seule chose qu un test de module ne lit pas.
   *
   * ⛔⛔ ET L ENJEU N EST PAS COSMETIQUE, C EST UNE INVERSION. Mesure refaite sur `/api/trending`
   *     le 2026-10-01 (249 lignes au-dessus du plancher, 0 ecartee) :
   *         aerodrome  liquidite 55,1 %  VOLUME 98,4 %  (11 blocks)
   *         uniswap    liquidite 44,9 %  VOLUME  1,6 %  (238 blocks)
   *     L ecran annoncait un partage 55/45 la ou le mouvement fait 98/2. Onze blocks portent
   *     presque tout, 238 ne portent rien : c est le fait le plus important de cet onglet, et
   *     l etiquette le remplacait par son contraire.
   *
   * ⛔ CE CAS GARDE L ETIQUETTE, PAS LE CALCUL. Il ne prouve pas que les montants soient justes
   *   (ils viennent d un index tiers) — il prouve qu on DIT lequel est lequel. */
  const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
  const i = app.indexOf("for (const d of r.parDex.slice(0, 3))");
  assert.notEqual(i, -1, 'la boucle qui peint les puces par dex est introuvable');
  const bloc = app.slice(i, i + 400);
  assert.ok(bloc.includes('d.liquiditeUsd'), 'la puce ne porte plus la liquidite');
  /* ⛔⛔ LE CHIFFRE QUI MANQUAIT. `volume24hUsd` par dex etait DEJA calcule dans ce module et
   *   JETE a l affichage — une valeur lue puis jetee, le motif nomme de ce depot. Et son absence
   *   ne la perdait pas seulement : elle laissait la liquidite se faire passer pour elle. */
  assert.ok(bloc.includes('d.volume24hUsd'),
    'le volume par dex est de nouveau JETE : la liquidite se fera passer pour lui');
  /* ⛔ NOMMER LES DEUX, SINON DEUX MONTANTS COLLES SONT PIRES QU UN SEUL : on ne saurait meme plus
   *   lequel est lequel.
   *
   * ⛔⛔⛔ ET CES DEUX ASSERTIONS ONT ETE ECRITES FAUSSES D ABORD — SORTIES PAR MUTATION, pas par
   *      relecture. Elles etaient `assert.match(bloc, /liq/)` et `/vol/`, et une mutation qui
   *      retirait TOUTE etiquette (`usd(d.liquiditeUsd) + ' · ' + usd(d.volume24hUsd)`) a SURVECU :
   *      les sous-chaines « liq » et « vol » etaient fournies par les NOMS DE VARIABLES
   *      `d.liquiditeUsd` et `d.volume24hUsd`. L assertion lisait le CODE et croyait lire la
   *      SORTIE — la meme faute que la garde statique qui scannait ses propres commentaires.
   *      ⇒ On exige donc un LITTERAL ENTRE QUOTES : ce qui sera reellement AFFICHE. Un nom de
   *        variable n est jamais entre quotes, une etiquette l est toujours. */
  assert.match(bloc, /'[^']*\bliq\b[^']*'/,
    'aucune etiquette LITTERALE « liq » : le montant de liquidite part a l ecran sans son nom');
  assert.match(bloc, /'[^']*\bvol\b[^']*'/,
    'aucune etiquette LITTERALE « vol » : le montant de volume part a l ecran sans son nom');
  /* ⛔ ET DANS LA MEME PUCE : separes, les deux montants se retrouveraient dans un ordre
   *   quelconque apres passage a la ligne a 375 px, et la paire qui donne le sens serait cassee
   *   par la mise en page. Un chiffre juste mais illisible n avertit pas. */
  assert.equal((bloc.match(/lignes\.push\(/g) || []).length, 1,
    'les deux montants sont dans des puces SEPAREES : la mise en page a 375 px peut les dissocier');
});

assert.equal(n, 11, 'compte de cas inattendu : ' + n);
console.log('✓ test-echelle-marche : ' + n + ' cas');
console.log('   Le total et la phrase qui dit A QUI il est sortent du MEME appel.');
console.log('   ⚠️ NE PROUVE PAS que les chiffres soient justes : ils viennent d un index public.');
