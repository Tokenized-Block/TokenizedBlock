/* test-verdict-routage.mjs — TROIS CAUSES DISTINCTES, TROIS PHRASES DISTINCTES.
 *
 * ⛔⛔ LE DEFAUT QUE CE TEST VERROUILLE. L app disait une seule chose — « on a pool this app cannot
 *     route through yet » — pour DEUX situations qui n ont ni le meme cout ni la meme reponse :
 *       (a) pool Uniswap v3 : le router qu on utilise DEJA l atteint. Mesure du 2026-09-27 sur le
 *           bytecode de 0x6ff5693b…99b43 : factory Uniswap v3 0x33128a8f… PRESENTE, PoolManager v4
 *           0x498581ff… PRESENTE (deux temoins positifs), adresse bidon ABSENTE (temoin negatif).
 *           Ce qui manque est CHEZ NOUS : notre constructeur n ecrit que des commandes v4.
 *           3 blocks mesures, 78 284 $.
 *       (b) pool Aerodrome : factory 0xf8f2eb49… ABSENTE de ce bytecode. Un router v3 derive
 *           l adresse d une pool depuis SA factory ⇒ il ne peut pas l adresser, point.
 *           12 blocks mesures, 12 166 295 $.
 *     Melanger les deux fait passer pour une limite technique ce qui est un travail non fait.
 *
 * ⛔⛔ ET LE TEMOIN DE MA PROPRE ERREUR EST DANS LA SUITE (cas « NVIDIA »). Mon premier classement
 *     regardait le JETON DE COTATION : NVIDIA/USDC est cote en USDC, donc « atteignable ». Faux —
 *     cette pool vit sur Aerodrome. Le cas est ecrit avec ses vrais chiffres pour qu un retour a ce
 *     classement casse ici au lieu de repartir en production.
 *
 * ⚠️ CE QU IL NE PROUVE PAS : qu un echange aboutisse, ni que la repartition mesuree soit stable.
 *   Il prouve que le CLASSEMENT est exhaustif, disjoint, et qu il nomme la bonne cause.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { verdictRoutage, phraseRoutage, VERDICTS_ROUTAGE } from './routage.js';

let n = 0;
const cas = (titre, f) => { n++; try { f(); } catch (e) { console.error('✗ ' + titre); throw e; } };

cas('aucun marche lu => SANS_MARCHE, et surtout pas achetable', () => {
  const v = verdictRoutage({ aMarche: false, dex: 'uniswap', poolAdr: null });
  assert.equal(v.verdict, 'SANS_MARCHE');
  assert.equal(v.achetableIci, false);
  /* ⛔ ET LA PHRASE EST NULLE : sans marche, l ecran a deja son propre message ; en ajouter un
   *   second ferait deux explications concurrentes pour un seul etat. */
  assert.equal(phraseRoutage(v), null);
});

cas('uniswap sans poolAdr (= poolId v4) => IN_APP et achetable', () => {
  const v = verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: null });
  assert.equal(v.verdict, 'IN_APP');
  assert.equal(v.famille, 'v4');
  assert.equal(v.achetableIci, true);
  /* ⛔ AUCUNE PHRASE quand ca marche : expliquer un succes est du bruit, et ca occuperait la place
   *   de la note qui sert vraiment. */
  assert.equal(phraseRoutage(v), null);
});

cas('uniswap AVEC poolAdr (= pool v3) => CALLDATA_MANQUANT, pas FRANCHISSEMENT', () => {
  /* ⛔ LES TROIS CAS REELS MESURES : MUc 44 029 $, AMZNc 7 942 $, SPCXc 26 313 $ — tous uniswap v3. */
  const v = verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: '0x127a12FC0953ab2ab89558c67Ba6D597D7140431' });
  assert.equal(v.verdict, 'CALLDATA_MANQUANT');
  assert.equal(v.famille, 'v3');
  assert.equal(v.achetableIci, false);
});

cas('aerodrome => FRANCHISSEMENT', () => {
  const v = verdictRoutage({ aMarche: true, dex: 'aerodrome', poolAdr: '0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9' });
  assert.equal(v.verdict, 'FRANCHISSEMENT');
  assert.equal(v.achetableIci, false);
});

cas('⛔ TEMOIN DE MON ERREUR : NVIDIA/USDC est cote en USDC ET reste FRANCHISSEMENT', () => {
  /* La vraie pool, la vraie profondeur : 0x853F5f1B…7ab9, aerodrome, /USDC, 2 411 513 $.
   * Si quelqu un reclasse un jour sur le jeton de cotation, ce cas casse. */
  const v = verdictRoutage({ aMarche: true, dex: 'aerodrome',
    poolAdr: '0x853F5f1B92b16714Fe6CDA67CAad0856B83C7ab9' });
  assert.equal(v.verdict, 'FRANCHISSEMENT',
    'une pool cotee en USDC peut vivre hors de portee du router — le DEX decide, pas la cotation');
});

cas('un dex inconnu ou absent ne devient jamais IN_APP par defaut', () => {
  /* ⛔ FAIL-CLOSED : un champ vide doit refuser, pas autoriser. Un `dex` absent qui passerait en
   *   IN_APP promettrait un achat sur une pool dont on ignore la famille. */
  for (const dex of [null, undefined, '', '   ', 'pancakeswap', 'sushiswap', 'UNISWAPX', 'uniswap-v2-clone']) {
    const v = verdictRoutage({ aMarche: true, dex, poolAdr: null });
    assert.notEqual(v.verdict, 'IN_APP', 'dex=' + JSON.stringify(dex) + ' ne doit pas etre IN_APP');
    assert.equal(v.achetableIci, false);
  }
  /* temoin positif de la meme boucle : la casse ne doit PAS faire echouer un vrai uniswap */
  assert.equal(verdictRoutage({ aMarche: true, dex: 'Uniswap', poolAdr: null }).verdict, 'IN_APP');
});

cas('une poolAdr mal formee ne compte pas comme une pool v3', () => {
  /* ⛔ `Boolean(poolAdr)` aurait suffi a faire passer '' pour v4 et '0x' pour v3 — deux erreurs
   *   opposees dans la meme ligne. On exige la forme. */
  for (const mauvaise of ['', '0x', '0xzz', '0x1234', 'null', '   ']) {
    const v = verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: mauvaise });
    assert.equal(v.famille, 'v4', 'poolAdr=' + JSON.stringify(mauvaise) + ' ne decrit pas une pool v3');
  }
  /* et un poolId v4 de 64 hex n est pas non plus une adresse de pool v3 */
  const v4 = verdictRoutage({ aMarche: true, dex: 'uniswap',
    poolAdr: '0xde9ac3fc95c869fea714cc9ae18f241d9cc1ea3567bcd2afa13aff243e031cca' });
  assert.equal(v4.famille, 'v4');
  assert.equal(v4.verdict, 'IN_APP');
});

cas('les verdicts sont exhaustifs et disjoints', () => {
  const vus = new Set();
  for (const e of [
    { aMarche: false }, { aMarche: true, dex: 'uniswap', poolAdr: null },
    { aMarche: true, dex: 'uniswap', poolAdr: '0x' + 'a'.repeat(40) },
    { aMarche: true, dex: 'aerodrome', poolAdr: '0x' + 'b'.repeat(40) },
  ]) vus.add(verdictRoutage(e).verdict);
  assert.equal(vus.size, 4, 'les quatre entrees doivent produire quatre verdicts differents');
  for (const v of vus) assert.ok(VERDICTS_ROUTAGE.includes(v), v + ' absent de VERDICTS_ROUTAGE');
  assert.equal(VERDICTS_ROUTAGE.length, 4, 'pas de verdict declare sans cas qui le produise');
  /* ⛔ un appel SANS argument ne doit pas jeter : la carte se peint parfois avant toute lecture */
  assert.equal(verdictRoutage().verdict, 'SANS_MARCHE');
});

cas('les deux phrases sont DIFFERENTES et nomment chacune sa cause', () => {
  const pV3 = phraseRoutage(verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: '0x' + 'c'.repeat(40) }));
  const pAero = phraseRoutage(verdictRoutage({ aMarche: true, dex: 'aerodrome', poolAdr: '0x' + 'd'.repeat(40) }));
  assert.ok(pV3 && pAero, 'les deux cas doivent produire une phrase');
  assert.notEqual(pV3, pAero, 'deux causes differentes ne peuvent pas partager une phrase');
  /* ⛔⛔ CETTE ASSERTION A CHANGE LE 2026-09-28, ET LA RAISON EST QU ELLE VERROUILLAIT UNE PHRASE
   *     DEVENUE FAUSSE. Elle exigeait « only writes v4 » et « the router can reach it » : c etait
   *     vrai quand notre constructeur ne savait pas ecrire de commande v3. Depuis `echange-v3.js`,
   *     l achat sur ces pools est construit ET simule — mais EN USDC SEULEMENT, parce que les trois
   *     pools mesurees sont block/USDC et qu un achat en ETH exigerait une commande d enveloppement
   *     dont l octet n est PAS prouve (present dans 2 des 14 transactions avec ETH).
   *   ⇒ La phrase doit dire les DEUX : ce qu on sait faire, et ce qu on ne sait pas encore. Un test
   *     qui garde une phrase perimee empeche de corriger un ecran qui ment. */
  assert.match(pV3, /buy it here with USDC/i, 'la phrase ne dit plus qu on peut acheter en USDC');
  assert.match(pV3, /not with ETH yet/i, 'la phrase ne dit plus ce qu on ne sait PAS faire');
  assert.match(pV3, /have not verified/i, 'la phrase ne dit plus POURQUOI l ETH manque');
  /* ⛔ LE CAS AERODROME DOIT DIRE QUE C EST LE ROUTER QUI NE PEUT PAS, pas notre constructeur */
  assert.match(pAero, /cannot address/i);
  assert.match(pAero, /two different pool families/i);
  assert.ok(!/only writes v4/i.test(pAero), 'la cause v3 ne doit pas fuir dans la phrase aerodrome');
});

cas('⛔⛔ DEUX drapeaux distincts : `achetableIci` (v4) et `achetableEnUsdc` (v3)', () => {
  /* ⛔⛔ LES CONFONDRE CASSERAIT L UN DES DEUX CHEMINS. `achetableIci` pilote le Buy du chemin v4,
   *     qui exige NOTRE lecture on-chain : le laisser vrai sur une pool v3 refabriquerait le parcours
   *     mesure de 62 secondes finissant par « creez un autre block ». `achetableEnUsdc` pilote une
   *     affordance SEPAREE, branchee sur `echange-v3.js`, et seulement en USDC — les trois pools
   *     mesurees sont block/USDC, et l achat en ETH exigerait une commande d enveloppement dont
   *     l octet n est PAS prouve.
   *   ⇒ Un seul drapeau pour les deux aurait soit tue le v4, soit promis un achat en ETH qu on ne
   *     sait pas construire. */
  const v4 = verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: null });
  assert.equal(v4.achetableIci, true);
  assert.equal(v4.achetableEnUsdc, false, 'le chemin v4 ne passe pas par l achat USDC');
  const v3 = verdictRoutage({ aMarche: true, dex: 'uniswap', poolAdr: '0x' + 'a'.repeat(40) });
  assert.equal(v3.achetableIci, false, 'une pool v3 ne doit PAS ouvrir le Buy du chemin v4');
  assert.equal(v3.achetableEnUsdc, true, 'une pool v3 doit ouvrir l achat en USDC');
  for (const e of [{ aMarche: false }, { aMarche: true, dex: 'aerodrome', poolAdr: '0x' + 'b'.repeat(40) }]) {
    const v = verdictRoutage(e);
    assert.equal(v.achetableIci, false);
    assert.equal(v.achetableEnUsdc, false, JSON.stringify(e) + ' ne doit pas ouvrir l achat USDC');
  }
  /* ⛔ LES DEUX NE SONT JAMAIS VRAIS ENSEMBLE : ce serait deux boutons pour un seul marche. */
  for (const e of [{ aMarche: false }, { aMarche: true, dex: 'uniswap', poolAdr: null },
    { aMarche: true, dex: 'uniswap', poolAdr: '0x' + 'c'.repeat(40) },
    { aMarche: true, dex: 'aerodrome', poolAdr: '0x' + 'd'.repeat(40) }]) {
    const v = verdictRoutage(e);
    assert.ok(!(v.achetableIci && v.achetableEnUsdc), 'les deux drapeaux sont vrais ensemble');
  }
});

cas('aucune phrase ne promet de date', () => {
  /* ⛔ « coming soon » est une dette qu on ne peut pas tenir et que personne ne vient effacer. */
  for (const e of [{ aMarche: true, dex: 'uniswap', poolAdr: '0x' + 'e'.repeat(40) },
    { aMarche: true, dex: 'aerodrome', poolAdr: '0x' + 'f'.repeat(40) }]) {
    const p = phraseRoutage(verdictRoutage(e)) || '';
    assert.ok(!/coming soon|shortly|next week|in a few days|bient/i.test(p), 'phrase promet une date : ' + p);
  }
});

cas('le nom du dex est nettoye avant d entrer dans la phrase', () => {
  /* ⛔ `dex` vient d un index TIERS (DexScreener). Il finit dans du texte d ecran : il est nettoye
   *   et borne, sinon un nom hostile voyagerait jusqu a l utilisateur. */
  const p = phraseRoutage(verdictRoutage({ aMarche: true,
    dex: '<img src=x onerror=alert(1)>aero', poolAdr: '0x' + '1'.repeat(40) }));
  assert.ok(!/[<>"'=]/.test(p), 'caracteres de balisage survivants dans : ' + p);
  assert.ok(p.length < 400);
});

cas('le module ne touche NI au reseau NI a la signature', () => {
  /* ⛔ GARDE ARCHITECTURALE : ce classement doit rester testable sans wallet et sans chaine. S il
   *   se met un jour a fetcher ou a signer, il devient impossible a verifier hors ligne. */
  const src = readFileSync(new URL('./routage.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  for (const interdit of ['fetch(', 'XMLHttpRequest', 'eth_sendTransaction', 'personal_sign',
    'wallet_sendCalls', 'request(', 'import(']) {
    assert.ok(!src.includes(interdit), 'routage.js contient ' + interdit + ' — il doit rester pur');
  }
});

console.log('✓ test-verdict-routage : ' + n + ' cas');
