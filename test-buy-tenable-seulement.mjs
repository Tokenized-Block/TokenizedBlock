/* test-buy-tenable-seulement.mjs — « BUY » NE DOIT PAS PROMETTRE CE QUE L APP NE PEUT PAS TENIR.
 *
 * ⛔⛔ LE DEFAUT, MESURE EN PRODUCTION LE 2026-09-27. Le bouton s affichait des que DexScreener
 *     connaissait un marche, QUEL QUE SOIT LE DEX. Or le chemin in-app passe par
 *     `echangeAutorise`, qui exige `etatVie === 'LUE'` — NOTRE lecture Uniswap v4. Sur les 6 blocks
 *     dont la pool est Aerodrome (fork v3), elle ne peut pas aboutir.
 *     Parcours mesure sur MUc, 384 812 $ de volume / 24 h : clic sur « Buy » -> le profil s ouvre
 *     -> `#pEchange` reste MASQUE -> 80 tentatives a 500 ms -> au bout de 62 s l ecran propose de
 *     CREER UN AUTRE BLOCK pour 0,001 ETH.
 *     ⚠️ TEMOIN DE CONTROLE mesure le meme jour : LAYA (pool v4) ouvre `#pEchange` en 14 s. Le
 *     defaut est donc propre aux marches non-v4, pas general.
 *
 * ⛔⛔ ET LE PIEGE DE LA CORRECTION : masquer « Buy » sur toute lecture ratee RETIRERAIT
 *     l affordance a des blocks parfaitement echangeables, parce que le noeud public refuse ~35 %
 *     des appels. On ne masque donc que sur un FAIT (`NON_TROUVEE` = aucune pool v4), jamais sur
 *     `NON_LUE` (= on n a pas pu regarder). C est la meme distinction que `pool-cl.js`.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un achat aboutisse. Il prouve que l ecran ne propose plus un achat
 *   dont on a mesure qu il ne peut pas aboutir, et qu il ne le retire pas sur un simple hoquet.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };
const app = readFileSync(new URL('./app.html', import.meta.url), 'utf8');
/* ⛔ commentaires depouilles ET concatenations recollees : sinon la sonde accuse sa propre
 *   documentation, ou ne voit pas une phrase coupee par des `' + '`. Les deux m ont deja eu. */
const nu = app.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/'\s*\+\s*'/g, '');

cas('⛔⛔ Buy ne s affiche que si le chemin in-app peut aboutir', () => {
  assert.ok(/const tenable = aMarche && !pasDePoolV4;/.test(nu),
    'la visibilite de Buy n est plus conditionnee a la tenabilite : le bouton revient sur des '
    + 'marches ou l echange in-app ne peut pas s ouvrir');
  assert.ok(/aBuy\.hidden = !tenable;/.test(nu), 'Buy n est plus masque par `tenable`');
});

cas('⛔⛔ on ne masque que sur un FAIT, jamais sur notre propre panne', () => {
  assert.ok(/h\.etatVie === 'NON_TROUVEE'/.test(nu),
    'la garde ne teste plus `NON_TROUVEE` : si elle testait « pas LUE », un hoquet du noeud '
    + 'retirerait Buy d un block parfaitement echangeable');
  /* ⛔ L ASSERTION NEGATIVE EST BORNEE AU BLOC. Ma premiere version balayait TOUT le fichier :
   *   `etatVie !== 'LUE'` existe ailleurs, legitimement, et la sonde accusait du code sans rapport.
   *   Une garde negative non bornee finit toujours par crier sur autre chose. */
  const i = nu.indexOf("const aBuy = $('#fAcheter')");
  assert.notEqual(i, -1, 'le bloc de visibilite de Buy est introuvable');
  const bloc = nu.slice(i, nu.indexOf('});', i));
  assert.ok(!/etatVie !== 'LUE'/.test(bloc),
    'la garde est passee a « pas LUE » : elle masquerait Buy sur `NON_LUE`, c est-a-dire sur notre '
    + 'incapacite a regarder, pas sur un fait de la chaine');
  assert.ok(/NON_TROUVEE/.test(bloc), 'la garde du bloc ne repose plus sur le FAIT `NON_TROUVEE`');
});

cas('⛔ on ne pousse PAS « Instant Birth » a la place', () => {
  /* ⛔ C ETAIT LA REPONSE HORS-SUJET MESUREE : proposer de creer un AUTRE block a quelqu un qui
   *   voulait acheter CELUI-LA, qui fait 384 812 $ de volume. */
  assert.ok(/aIb\.hidden = aMarche;/.test(nu),
    'Instant Birth reapparait sur un block QUI A un marche : on propose d en creer un autre a '
    + 'quelqu un qui voulait acheter celui-ci');
});

cas('⛔ le bouton qui disparait est EXPLIQUE, et le marche est nomme', () => {
  /* ⛔ UN BOUTON QUI DISPARAIT SANS PHRASE SE LIT COMME UNE PANNE DE L APP. Et la phrase nomme le
   *   marche lu par le serveur — verifiable — au lieu de rester vague. */
  assert.ok(/on a pool this app cannot route through yet/.test(nu),
    'la disparition de Buy n est plus expliquee : elle se lira comme un bug');
  assert.ok(/mk\.dex/.test(nu), 'le marche n est plus nomme dans la phrase');
  assert.ok(/The price above is our own read of that pool/.test(nu),
    'la phrase ne dit plus que le prix affiche vient de NOTRE lecture — c est pourtant la seule '
    + 'chose que ces ecrans apportent sur ces blocks');
});

assert.equal(n, 4, 'compte de cas inattendu : ' + n);
console.log('ok buy-tenable — ' + n + ' cas.');
console.log('   Buy ne s affiche que si l echange in-app peut s ouvrir ; il ne disparait que sur un');
console.log('   FAIT (NON_TROUVEE), jamais sur NON_LUE ; et sa disparition est expliquee.');
console.log('⚠️ NE PROUVE PAS qu un achat aboutisse — prouve qu on ne promet plus ce qu on a mesure');
console.log('   comme impossible, et qu on ne retire rien sur un hoquet.');
