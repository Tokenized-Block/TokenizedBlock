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

cas('⛔⛔ LA PHRASE DIT QUE CE VOLUME N EST PAS LE NOTRE', () => {
  const p = phraseEchelle({ blocks: 198, ecartees: 12 });
  assert.match(p, /not our volume/i, 'la phrase ne dit plus que ce volume n est pas le notre');
  assert.match(p, /opened by anyone/i, 'la phrase ne dit plus qui ouvre ces marches');
  assert.match(p, /none of it is our revenue/i, 'la phrase ne separe plus le volume du revenu');
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

assert.equal(n, 10, 'compte de cas inattendu : ' + n);
console.log('✓ test-echelle-marche : ' + n + ' cas');
console.log('   Le total et la phrase qui dit A QUI il est sortent du MEME appel.');
console.log('   ⚠️ NE PROUVE PAS que les chiffres soient justes : ils viennent d un index public.');
